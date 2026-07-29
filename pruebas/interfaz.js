/* Prueba de la interfaz sobre mist.html en un Chrome real, con archivos y
 * FileReader de verdad. */
const fs = require('fs');
const { lanzar, esperar } = require('./chrome.js');

const RAIZ = require('path').join(__dirname, '..') + '/';
let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else console.log('ok     ' + nombre);
}

(async () => {
  const c = await lanzar();
  try {
    await c.ir('file://' + RAIZ + 'mist.html');

    // Interceptar descargas y montar una carpeta falsa: el selector nativo de
    // carpetas no se puede manejar desde una prueba, pero todo lo que pasa
    // después del selector sí.
    await c.js(`
      window.__salidas = [];
      const BlobReal = window.Blob;
      window.Blob = function (p, o) { window.__salidas.push({texto: p.map(String).join(''), tipo: o && o.type}); return new BlobReal(p, o); };
      HTMLAnchorElement.prototype.click = function () { window.__ultimoNombre = this.download; };
      window.__err = [];
      window.addEventListener('error', e => window.__err.push(e.message));
      window.addEventListener('unhandledrejection', e => window.__err.push('promesa: ' + e.reason));

      class ArchivoFalso {
        constructor(n) { this.kind='file'; this.name=n; this.texto=''; this.escrituras=0; }
        async getFile() { const t=this.texto; return { text: async () => t }; }
        async createWritable() { const s=this; let b=''; return { async write(t){b+=t;}, async close(){s.texto=b; s.escrituras++;} }; }
      }
      class CarpetaFalsa {
        constructor(n) { this.kind='directory'; this.name=n; this.hijos=new Map(); }
        async getFileHandle(n,o){ if(!this.hijos.has(n)){ if(!o||!o.create) throw new Error('no existe'); this.hijos.set(n,new ArchivoFalso(n)); } return this.hijos.get(n); }
        async getDirectoryHandle(n,o){ if(!this.hijos.has(n)){ if(!o||!o.create) throw new Error('no existe'); this.hijos.set(n,new CarpetaFalsa(n)); } return this.hijos.get(n); }
        async removeEntry(n){ this.hijos.delete(n); }
        async *values(){ for (const h of this.hijos.values()) yield h; }
        listar(p){ const r=[]; for (const h of this.hijos.values()) h.kind==='file' ? r.push((p||'')+h.name) : r.push(...h.listar((p||'')+h.name+'/')); return r; }
        leer(ruta){ const [a,...resto]=ruta.split('/'); const h=this.hijos.get(a); return resto.length ? h.leer(resto.join('/')) : h.texto; }
      }
      window.__carpeta = new CarpetaFalsa('proyecto-de-prueba');
      window.showDirectoryPicker = async () => window.__carpeta;
      return true;
    `);

    // ── Sin proyecto no se carga nada
    const portada = await c.js(`return {
      portada: !document.getElementById('portada').hidden,
      cuerpo: !document.getElementById('cuerpo').hidden,
      opciones: [...document.querySelectorAll('.tarjeta b')].map(b => b.textContent)
    };`);
    ok('arranca pidiendo un proyecto', portada.portada && !portada.cuerpo, portada);
    ok('ofrece crear o abrir', portada.opciones.length === 2, portada.opciones);

    await c.js(`document.getElementById('btn-nuevo').click(); return true;`);
    await esperar(300);
    const dlgNuevo = await c.js(`const d = document.getElementById('dialogo');
      return {abierto: d.open, campos: [...d.querySelectorAll('#dlg-campos input')].map(i => i.type)};`);
    ok('crear un proyecto pide nombre y frase', dlgNuevo.abierto && dlgNuevo.campos.join(',') === 'text,password', dlgNuevo);

    await c.js(`
      document.querySelector('#dlg-campos input[type=text]').value = 'ensayo';
      document.getElementById('dlg-aceptar').click(); return true;`);
    await esperar(900);
    const abierto = await c.js(`return {
      portada: !document.getElementById('portada').hidden,
      cuerpo: !document.getElementById('cuerpo').hidden,
      nombre: document.getElementById('nombre-proyecto').textContent,
      estado: document.getElementById('estado-guardado').textContent,
      archivos: window.__carpeta.listar()
    };`);
    ok('elegir la carpeta entra a la aplicación', !abierto.portada && abierto.cuerpo, abierto);
    ok('la barra muestra el proyecto', abierto.nombre === 'ensayo', abierto.nombre);
    ok('la bóveda se escribe apenas se crea el proyecto',
      abierto.archivos.includes('mist.json') && abierto.archivos.includes('fusiones.json'), abierto.archivos);
    ok('y queda marcada como guardada', abierto.estado === 'guardada', abierto.estado);

    const csvClientes = fs.readFileSync(RAIZ + 'ejemplos/clientes.csv', 'utf8');
    const csvVentas = fs.readFileSync(RAIZ + 'ejemplos/ventas.csv', 'utf8');
    const csvPadron = fs.readFileSync(RAIZ + 'ejemplos/padron.csv', 'utf8');
    const xlsxB64 = fs.readFileSync(RAIZ + 'ejemplos/reclamos.xlsx').toString('base64');

    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(csvClientes)}], 'clientes.csv', {type:'text/csv'}));
      dt.items.add(new File([${JSON.stringify(csvVentas)}], 'ventas.csv', {type:'text/csv'}));
      const bin = atob(${JSON.stringify(xlsxB64)});
      const u8 = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
      dt.items.add(new File([u8], 'reclamos.xlsx'));
      dt.items.add(new File([${JSON.stringify(csvPadron)}], 'padron.csv', {type:'text/csv'}));
      const inp = document.getElementById('entrada-archivos');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
      return dt.files.length;
    `);
    await esperar(1200);

    const carga = await c.js(`return {
      archivos: [...document.querySelectorAll('.archivo-cab .nombre')].map(n => n.textContent),
      hojas: [...document.querySelectorAll('.hoja')].map(n => n.innerText.replace(/\\s+/g,' ').trim()),
      errores: window.__err
    };`);
    ok('cargó los 4 archivos', carga.archivos.length === 4, carga.archivos);
    ok('el xlsx aporta sus 2 hojas', carga.hojas.length === 5, carga.hojas);
    ok('sin errores de JS al cargar', carga.errores.length === 0, carga.errores);

    const cols = await c.js(`return [...document.querySelectorAll('.tabla-columnas tbody tr')].map(tr => {
      const s = tr.querySelectorAll('select');
      return tr.querySelector('.col-nombre').textContent + '=' + s[0].value + (s[0].value==='seudonimo' ? ':'+s[1].value : '');
    });`);
    ok('clasifica las columnas de clientes.csv',
      cols.join(' ') === 'id_cliente=seudonimo:id nombre=seudonimo:persona razon_social=seudonimo:empresa cuit=seudonimo:cuit email=seudonimo:email telefono=seudonimo:telefono localidad=seudonimo:localidad saldo=conservar',
      cols);

    // Cambiar una columna a mano
    await c.js(`
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')].find(t => t.querySelector('.col-nombre').textContent === 'saldo');
      const s = tr.querySelector('select'); s.value = 'vaciar'; s.onchange();
      return true;`);
    await esperar(300);
    ok('el cambio manual persiste', (await c.js(`
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')].find(t => t.querySelector('.col-nombre').textContent === 'saldo');
      return tr.querySelector('select').value;`)) === 'vaciar');

    // Columnas compuestas en el padrón
    await c.js(`[...document.querySelectorAll('.hoja')].find(h => h.textContent.startsWith('padron')).click(); return true;`);
    await esperar(300);
    const padron = await c.js(`return [...document.querySelectorAll('.tabla-columnas tbody tr')].map(tr => {
      const s = tr.querySelectorAll('select');
      const campo = tr.querySelector('.campo');
      return tr.querySelector('.col-nombre').textContent + '=' + s[0].value +
        (s[0].value==='seudonimo' ? ':'+s[1].value : '') + (campo ? ' [' + campo.textContent + ']' : '');
    });`);
    ok('el padrón compone apellido con nombre solo',
      padron.join(' ').includes('apellido=seudonimo:persona [nombre]') &&
      padron.join(' ').includes('nombre=seudonimo:persona [apellido]'), padron);
    const tokPadron = await c.js(`
      const p = MIST.app.proyecto;
      const a = p.archivos.find(x => x.nombre === 'padron.csv');
      const salida = p.transformar(a, a.hojas[0], 3, null);
      return {fila: salida[1], joaquin: p.tokenDe(p.tipoPorId('persona'), 'Joaquín Pérez')};`);
    ok('el nombre partido en dos columnas llega al token del archivo anterior',
      tokPadron.fila[1] === tokPadron.joaquin && tokPadron.fila[2] === tokPadron.joaquin, tokPadron);

    await c.js(`
      const b = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'apellido').querySelector('button');
      b.click(); return true;`);
    await esperar(400);
    const separadas = await c.js(`
      const p = MIST.app.proyecto;
      const a = p.archivos.find(x => x.nombre === 'padron.csv');
      return a.hojas[0].columnas.filter(c => c.campo).length;`);
    ok('separar las partes deshace el campo compuesto', separadas === 0, separadas);
    await c.js(`
      const sel = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'apellido').querySelectorAll('select')[2];
      sel.value = [...sel.options].find(o => o.textContent === 'con nombre').value;
      sel.onchange(); return true;`);
    await esperar(400);
    ok('y se pueden volver a unir a mano', (await c.js(`
      const p = MIST.app.proyecto;
      const a = p.archivos.find(x => x.nombre === 'padron.csv');
      const s = p.transformar(a, a.hojas[0], 3, null);
      return s[1][1] === s[1][2] && s[1][1] === p.tokenDe(p.tipoPorId('persona'), 'Joaquín Pérez');`)) === true);

    // ── Tipos propios: el catálogo no lo tiene todo, y una bolsa común como
    //    "otro" mezclaría en un mismo espacio de nombres datos sin relación.
    await c.js(`
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'area');
      const s = tr.querySelector('select'); s.value = 'seudonimo'; s.onchange();
      return true;`);
    await esperar(400);
    const faltaTipo = await c.js(`
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'area');
      return {
        alerta: tr.dataset.alerta === '1',
        marca: (tr.querySelector('.marca-riesgo') || {}).textContent || '',
        tipo: tr.querySelectorAll('select')[1].value
      };`);
    ok('seudonimizar sin tipo no inventa uno: lo pide',
      faltaTipo.tipo === '' && faltaTipo.alerta, faltaTipo);
    ok('y avisa que mientras tanto sale en claro', /falta elegir el tipo/.test(faltaTipo.marca), faltaTipo.marca);

    await c.js(`
      const s = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'area').querySelectorAll('select')[1];
      s.value = [...s.options].find(o => /Tipo nuevo/.test(o.textContent)).value;
      s.onchange(); return true;`);
    await esperar(300);
    const dlgTipo = await c.js(`const d = document.getElementById('dialogo');
      return {
        abierto: d.open,
        nombre: d.querySelector('input[name=etiqueta]').value,
        campos: [...d.querySelectorAll('#dlg-campos input, #dlg-campos select')].map(i => i.name)
      };`);
    ok('el selector de tipo ofrece crear uno, con el encabezado como propuesta',
      dlgTipo.abierto && dlgTipo.nombre === 'Area', dlgTipo);
    ok('y pide nombre, prefijo y criterio', dlgTipo.campos.join(',') === 'etiqueta,prefijo,norm', dlgTipo.campos);

    await c.js(`
      const d = document.getElementById('dialogo');
      d.querySelector('input[name=etiqueta]').value = 'Área del organismo';
      d.querySelector('select[name=norm]').value = 'identidad';
      document.getElementById('dlg-aceptar').click(); return true;`);
    await esperar(700);
    const tipoNuevo = await c.js(`
      const p = MIST.app.proyecto;
      const t = p.tipos.filter(x => x.propio);
      const a = p.archivos.find(x => x.nombre === 'padron.csv');
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(x => x.querySelector('.col-nombre').textContent === 'area');
      return {
        tipos: t,
        columna: a.hojas[0].columnas.find(c => c.nombre === 'area').tipo,
        token: t.length ? p.tokenDe(t[0], 'Ventas') : '',
        seleccionado: tr.querySelectorAll('select')[1].value,
        alerta: tr.dataset.alerta === '1'
      };`);
    ok('el tipo nuevo queda en el proyecto con su prefijo derivado del nombre',
      tipoNuevo.tipos.length === 1 && tipoNuevo.tipos[0].prefijo === 'area' &&
      tipoNuevo.tipos[0].norm === 'identidad', tipoNuevo.tipos);
    ok('la columna que lo pidió queda clasificada con él y deja de estar en rojo',
      tipoNuevo.columna === tipoNuevo.tipos[0].id && tipoNuevo.seleccionado === tipoNuevo.columna &&
      !tipoNuevo.alerta, tipoNuevo);
    ok('y sus valores se sustituyen con tokens de ese prefijo',
      /^area-[0-9a-z]{8}$/.test(tipoNuevo.token), tipoNuevo.token);

    await c.js(`[...document.querySelectorAll('#panel-columnas .franja button')]
      .find(b => b.textContent === 'Tipos').click(); return true;`);
    await esperar(300);
    const gestor = await c.js(`const d = document.getElementById('dialogo');
      return {abierto: d.open,
              items: [...d.querySelectorAll('.opciones .tarjeta')].map(b => b.innerText.replace(/\\s+/g,' ').trim())};`);
    ok('el administrador lista los tipos propios y ofrece crear otro',
      gestor.items.length === 2 && /Área del organismo/.test(gestor.items[0]) &&
      /tokens area-/.test(gestor.items[0]) && /Crear un tipo/.test(gestor.items[1]), gestor.items);
    await c.js(`document.getElementById('dlg-cancelar').click(); return true;`);
    await esperar(300);

    await c.js(`[...document.querySelectorAll('.hoja')][0].click(); return true;`);
    await esperar(200);

    // Entidades
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Entidades')).click(); return true;`);
    await esperar(300);
    const ent = await c.js(`return {
      filas: document.querySelectorAll('#panel-entidades tbody tr').length,
      primera: document.querySelector('#panel-entidades tbody tr').innerText.replace(/\\s+/g,' ').trim().slice(0,120)
    };`);
    ok('lista entidades con su token', ent.filas > 10 && /-[0-9a-z]{6,}/.test(ent.primera), ent);

    // Buscar en el listado
    await c.js(`
      const b = document.querySelector('#panel-entidades input[type=search]');
      b.value = 'joaquin'; b.oninput();
      return true;`);
    await esperar(300);
    const busq = await c.js(`return [...document.querySelectorAll('#panel-entidades tbody tr')].map(t => t.innerText.replace(/\\s+/g,' ').trim().slice(0,90));`);
    ok('el buscador filtra por valor real', busq.length > 0 && busq.every(t => /Joaqu|Perez|Pérez/i.test(t)), busq);
    ok('el foco vuelve al buscador', (await c.js(`return document.activeElement.type;`)) === 'search');

    // Fusión manual desde el listado
    await c.js(`
      const b = document.querySelector('#panel-entidades input[type=search]');
      b.value = ''; b.oninput();
      return true;`);
    await esperar(300);

    // Sugerencias
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Fusiones')).click(); return true;`);
    await esperar(200);
    await c.js(`[...document.querySelectorAll('#panel-fusiones button')].find(b => /Buscar/.test(b.textContent)).click(); return true;`);
    await esperar(600);
    const sug = await c.js(`return [...document.querySelectorAll('#panel-fusiones .par')].map(p => p.innerText.replace(/\\s+/g,' ').trim());`);
    ok('propone fusiones', sug.length >= 2, sug);

    const tokenAntes = await c.js(`return MIST.app.proyecto.tokenDe(MIST.app.proyecto.tipoPorId('persona'), 'Joaquín Pérez');`);
    await c.js(`document.querySelector('#panel-fusiones .par button.primario').click(); return true;`);
    await esperar(400);
    const tokenDespues = await c.js(`return MIST.app.proyecto.tokenDe(MIST.app.proyecto.tipoPorId('persona'), 'Joaquín Pérez');`);
    ok('fusionar no le cambia el token a la forma dominante', tokenAntes === tokenDespues, [tokenAntes, tokenDespues]);
    ok('la errata adopta el token', (await c.js(`return MIST.app.proyecto.tokenDe(MIST.app.proyecto.tipoPorId('persona'), 'Joaquin Peres');`)) === tokenAntes);
    ok('queda una sugerencia menos', (await c.js(`return document.querySelectorAll('#panel-fusiones .par').length;`)) === sug.length - 1);

    // Rechazar una sugerencia
    const restantes = await c.js(`document.querySelectorAll('#panel-fusiones .par button:not(.primario)')[0].click(); return true;`);
    await esperar(300);
    ok('rechazar la saca de la lista', (await c.js(`return document.querySelectorAll('#panel-fusiones .par').length;`)) === sug.length - 2);
    void restantes;

    // Vista previa
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Vista previa')).click(); return true;`);
    await esperar(1300);
    const previa = await c.js(`return {
      filas: [...document.querySelectorAll('#panel-previa tbody tr')].slice(0,2).map(tr => [...tr.children].map(td => td.textContent).join(' | ')),
      sustituidas: document.querySelectorAll('#panel-previa .sustituida').length,
      vaciadas: document.querySelectorAll('#panel-previa .vaciada').length
    };`);
    ok('la previa muestra tokens', /persona-[0-9a-z]{8}/.test(previa.filas[0]), previa.filas[0]);
    ok('la columna vaciada sale en blanco', previa.filas[0].trim().endsWith('|'), previa.filas[0]);
    ok('marca las celdas sustituidas y las vaciadas', previa.sustituidas > 10 && previa.vaciadas > 0, previa);

    await c.js(`document.querySelector('#panel-previa .franja input[type=checkbox]').click(); return true;`);
    await esperar(1300);
    ok('el conmutador muestra los originales',
      /Joaquín Pérez/.test(await c.js(`return document.querySelector('#panel-previa tbody tr').innerText;`)));

    // Salida
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Salida')).click(); return true;`);
    await esperar(300);
    const salida = await c.js(`return {
      cifras: [...document.querySelectorAll('#panel-salida .cifra')].map(n => n.innerText.replace(/\\s+/g,' ').trim()),
      botones: [...document.querySelectorAll('#panel-salida button')].map(b => b.textContent)
    };`);
    ok('la pestaña Salida resume el trabajo', salida.cifras.length === 4, salida.cifras);
    ok('ofrece descargar cada archivo y todos', salida.botones.filter(b => /\.csv|\.xlsx/.test(b)).length === 4, salida.botones);

    await c.js(`[...document.querySelectorAll('#panel-salida button')].find(b => b.textContent === 'clientes.csv').click(); return true;`);
    await esperar(500);
    const csvOut = await c.js(`return {nombre: window.__ultimoNombre, texto: window.__salidas[window.__salidas.length-1].texto};`);
    ok('descarga con el nombre correcto', csvOut.nombre === 'clientes.desensibilizado.csv', csvOut.nombre);
    ok('el csv no lleva ningún nombre real', !/Joaqu|P[eé]rez|Gonz[aá]lez|Vieytes|Barrionuevo/.test(csvOut.texto),
      csvOut.texto.split('\r\n')[1]);
    ok('el saldo quedó vaciado', csvOut.texto.split('\r\n')[1].endsWith(','), csvOut.texto.split('\r\n')[1]);

    // ── Historial de archivos
    await esperar(400);
    const hist = await c.js(`
      const filas = [...document.querySelectorAll('.tabla-historial tbody tr')];
      return {
        filas: filas.map(tr => [...tr.children].map(td => td.textContent.replace(/\\s+/g,' ').trim())),
        cargados: document.querySelectorAll('.tabla-historial .marca-cargado').length,
        sinExportar: document.querySelectorAll('.tabla-historial .sin-exportar').length
      };`);
    ok('el historial lista los cuatro archivos', hist.filas.length === 4, hist.filas.map(f => f[0]));
    ok('marca los que están cargados ahora', hist.cargados === 4, hist.cargados);
    ok('clientes.csv figura exportado y los otros no',
      hist.sinExportar === 3, hist.filas.map(f => f[0] + '→' + f[3]));

    // volver a soltar un archivo ya procesado
    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(csvClientes)}], 'clientes.csv', {type:'text/csv'}));
      const inp = document.getElementById('entrada-archivos');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
      return true;`);
    await esperar(900);
    const repetido = await c.js(`
      const d = document.getElementById('dialogo');
      const r = {aviso: d.open ? d.innerText.replace(/\\s+/g,' ').trim() : '',
                 marcas: [...document.querySelectorAll('.archivo-estado')].map(n => n.textContent)};
      if (d.open) document.getElementById('dlg-aceptar').click();
      return r;`);
    ok('avisa que el archivo ya había pasado', /ya habían pasado/.test(repetido.aviso), repetido.aviso.slice(0, 120));
    ok('y lo marca en la lista de archivos',
      repetido.marcas.some(m => /ya procesado/.test(m)), repetido.marcas);
    await esperar(300);
    await c.js(`
      const p = MIST.app.proyecto;
      p.quitarArchivo(p.archivos[p.archivos.length - 1].id);
      MIST.app.render();
      return true;`);
    ok('el historial no duplica la entrada',
      (await c.js(`return MIST.app.proyecto.historial.length;`)) === 4);

    // ── La bóveda se fue guardando sola con cada acción
    await esperar(900);
    const disco = await c.js(`return {
      estado: document.getElementById('estado-guardado').textContent,
      archivos: window.__carpeta.listar(),
      manifiesto: JSON.parse(window.__carpeta.leer('mist.json')),
      fusiones: JSON.parse(window.__carpeta.leer('fusiones.json'))
    };`);
    ok('quedó guardada sin que nadie apriete nada', disco.estado === 'guardada', disco.estado);
    ok('el mapa se escribió en fragmentos',
      disco.archivos.filter(a => a.startsWith('mapa/')).length >= 4, disco.archivos);
    ok('el manifiesto guarda la clave y los perfiles de columna',
      disco.manifiesto.claveMaestra && Object.keys(disco.manifiesto.perfiles).length > 3, Object.keys(disco.manifiesto.perfiles));
    ok('las fusiones confirmadas y descartadas están en el disco',
      disco.fusiones.fusiones.length >= 1 && disco.fusiones.rechazos.length >= 1, disco.fusiones);

    const reabierto = await c.js(`
      const docs = new Map();
      for (const ruta of window.__carpeta.listar()) docs.set(ruta, JSON.parse(window.__carpeta.leer(ruta)));
      const P2 = new MIST.Proyecto();
      MIST.boveda.aplicar(P2, docs);
      P2.escanear();
      return {
        nombre: P2.nombre,
        huella: P2.huella(),
        joaquin: P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín Pérez'),
        errata: P2.tokenDe(P2.tipoPorId('persona'), 'Joaquin Peres')
      };`);
    ok('lo escrito en la carpeta reabre el mismo proyecto',
      reabierto.nombre === 'ensayo' && reabierto.joaquin === tokenAntes, reabierto);
    ok('con las fusiones incluidas', reabierto.errata === tokenAntes, reabierto);

    // ── Reconstruir: lo que salió de acá vuelve a entrar y recupera sus datos
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Reconstruir')).click(); return true;`);
    await esperar(300);
    const recVacio = await c.js(`return {
      zona: !!document.querySelector('#panel-reconstruir .soltar'),
      titulo: (document.querySelector('#panel-reconstruir .vacio b') || {}).textContent || ''
    };`);
    ok('la pestaña Reconstruir espera un archivo con tokens',
      recVacio.zona && /tokens/.test(recVacio.titulo), recVacio);

    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(csvOut.texto)}], 'clientes.desensibilizado.csv', {type:'text/csv'}));
      const inp = document.getElementById('entrada-reconstruir');
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
      return true;`);
    await esperar(1000);
    const rec = await c.js(`
      const filas = [...document.querySelectorAll('#panel-reconstruir tbody tr')];
      return {
        cifras: [...document.querySelectorAll('#panel-reconstruir .cifra')].map(n => n.innerText.replace(/\\s+/g,' ').trim()),
        primera: filas[1].innerText.replace(/\\s+/g,' ').trim(),
        recuperadas: document.querySelectorAll('#panel-reconstruir .sustituida').length,
        titulo: filas[1].children[1].title
      };`);
    ok('recupera los valores reales del archivo que ya había salido',
      /Joaquín Pérez/.test(rec.primera) && /Acme SRL/.test(rec.primera) && /30-71234567-9/.test(rec.primera),
      rec.primera);
    ok('marca cada celda que volvió y guarda el token que había',
      rec.recuperadas > 10 && /^persona-/.test(rec.titulo), { n: rec.recuperadas, t: rec.titulo });
    ok('el informe cuenta lo recuperado y no encuentra tokens ajenos',
      /tokens recuperados/i.test(rec.cifras.join(' ')) && /^0 /.test(rec.cifras[3]), rec.cifras);
    ok('lo que se vació no vuelve: eso no está en ninguna bóveda',
      rec.primera.trim().endsWith('14350.50') === false, rec.primera.slice(-40));

    await c.js(`[...document.querySelectorAll('#panel-reconstruir button')]
      .find(b => /Descargar/.test(b.textContent)).click(); return true;`);
    await esperar(600);
    const bajado = await c.js(`return {nombre: window.__ultimoNombre, texto: window.__salidas[window.__salidas.length-1].texto};`);
    ok('se baja como .reconstruido y no encadena las dos marcas',
      bajado.nombre === 'clientes.reconstruido.csv', bajado.nombre);
    ok('y el archivo bajado trae los datos reales',
      /Joaquín Pérez/.test(bajado.texto) && /30-71234567-9/.test(bajado.texto),
      bajado.texto.split('\r\n')[1]);

    // Soltar eso mismo en el panel de planillas no lo carga como fuente
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Columnas')).click(); return true;`);
    await esperar(300);
    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(csvOut.texto)}], 'clientes.desensibilizado.csv', {type:'text/csv'}));
      const inp = document.getElementById('entrada-archivos');
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
      return true;`);
    await esperar(1100);
    const guardia = await c.js(`
      const d = document.getElementById('dialogo');
      return {
        texto: d.open ? d.innerText.replace(/\\s+/g,' ').trim() : '',
        archivos: MIST.app.proyecto.archivos.length,
        historial: MIST.app.proyecto.historial.length
      };`);
    ok('una planilla que ya salió de acá no se carga como fuente',
      /ya está desensibilizado/.test(guardia.texto) && guardia.archivos === 4 && guardia.historial === 4,
      guardia);

    await c.js(`[...document.querySelectorAll('#dlg-campos .tarjeta')]
      .find(b => /Reconstruirlo/.test(b.textContent)).click(); return true;`);
    await esperar(900);
    const trasElegir = await c.js(`return {
      pestania: MIST.app.vista.pestania,
      archivos: MIST.app.proyecto.archivos.length,
      tokens: MIST.app.vista.reconstruccion ? MIST.app.vista.reconstruccion.informe.tokens : 0
    };`);
    ok('y se ofrece leerla, que es casi siempre lo que se quería',
      trasElegir.pestania === 'reconstruir' && trasElegir.archivos === 4 && trasElegir.tokens > 10, trasElegir);

    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Salida')).click(); return true;`);
    await esperar(300);

    // ── Compuerta: con cambios sin guardar no se descargan planillas
    await c.js(`MIST.app.anotar('prueba'); MIST.app.render(); return true;`);
    const trabado = await c.js(`return {
      botones: [...document.querySelectorAll('#panel-salida button')].filter(b => /\\.csv|\\.xlsx/.test(b.textContent)).map(b => b.disabled),
      aviso: (document.querySelector('#panel-salida .aviso') || {}).textContent || ''
    };`);
    ok('con la bóveda sin guardar, las descargas quedan cerradas',
      trabado.botones.length === 4 && trabado.botones.every(Boolean), trabado.botones);
    ok('y se explica por qué', /cambios sin guardar/.test(trabado.aviso), trabado.aviso.slice(0, 90));

    await esperar(1200);   // el autoguardado corre solo
    await c.js(`MIST.app.render(); return true;`);
    ok('tras guardar se vuelven a habilitar', (await c.js(`
      return [...document.querySelectorAll('#panel-salida button')]
        .filter(b => /\\.csv|\\.xlsx/.test(b.textContent)).every(b => !b.disabled);`)) === true);
    // ── Cerrar la pestaña con cambios sin guardar
    const cierre = await c.js(`
      function intentarCerrar() {
        const ev = new Event('beforeunload', {cancelable: true});
        window.dispatchEvent(ev);
        return ev.defaultPrevented;
      }
      const g = MIST.app.vista.guardado;
      const r = {};
      g.estado = 'guardado';   r.guardada = intentarCerrar();
      g.estado = 'pendiente';  r.pendiente = intentarCerrar();
      g.estado = 'guardando';  r.guardando = intentarCerrar();
      g.estado = 'sin guardar'; r.sinGuardar = intentarCerrar();
      g.estado = 'error';      r.error = intentarCerrar();
      g.estado = 'guardado';
      return r;`);
    ok('con la bóveda al día, cerrar no molesta', cierre.guardada === false, cierre);
    ok('con un guardado pendiente, frena el cierre', cierre.pendiente === true, cierre);
    ok('mientras está escribiendo, frena el cierre', cierre.guardando === true, cierre);
    ok('en modo archivo sin guardar, frena el cierre', cierre.sinGuardar === true, cierre);
    ok('si el guardado falló, frena el cierre', cierre.error === true, cierre);

    // ── Otra planilla del mismo formato: la decisión se toma una sola vez
    const otraTanda = 'id_cliente,nombre,razon_social,cuit,email,telefono,localidad,saldo\r\n' +
      'CL-900,Ramiro Sosa,Delta SA,30-70000001-2,rsosa@delta.com,11-4000-0000,La Plata,999.00\r\n' +
      'CL-901,Joaquín Pérez,Acme SRL,30-71234567-9,joaquin.perez@acme.com.ar,11-4555-2211,Vicente López,120.00\r\n';
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Columnas')).click(); return true;`);
    await esperar(300);
    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(otraTanda)}], 'clientes-abril.csv', {type:'text/csv'}));
      const inp = document.getElementById('entrada-archivos');
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
      return true;`);
    await esperar(1200);
    await c.js(`[...document.querySelectorAll('.hoja')].find(h => h.textContent.startsWith('clientes-abril')).click(); return true;`);
    await esperar(400);
    const heredado = await c.js(`
      const p = MIST.app.proyecto;
      const a = p.archivos.find(x => x.nombre === 'clientes-abril.csv');
      return Object.fromEntries(a.hojas[0].columnas.map(c => [c.nombre, c.accion + ':' + (c.origen || '')]));`);
    ok('una planilla nueva del mismo formato llega ya clasificada, con el cambio manual incluido',
      heredado.saldo === 'vaciar:perfil' && heredado.nombre === 'seudonimo:perfil', heredado);

    await c.js(`
      const tr = [...document.querySelectorAll('.tabla-columnas tbody tr')]
        .find(t => t.querySelector('.col-nombre').textContent === 'telefono');
      const s = tr.querySelector('select'); s.value = 'vaciar'; s.onchange();
      return true;`);
    await esperar(600);
    const propagado = await c.js(`
      const p = MIST.app.proyecto;
      const otra = p.archivos.find(x => x.nombre === 'clientes.csv');
      return {
        aviso: [...document.querySelectorAll('#panel-columnas .aviso')].map(n => n.textContent).join(' '),
        enLaOtra: otra.hojas[0].columnas.find(c => c.nombre === 'telefono').accion
      };`);
    ok('cambiar una columna acá alcanza a la misma columna de la otra planilla',
      propagado.enLaOtra === 'vaciar', propagado.enLaOtra);
    ok('y se avisa, porque el cambio pasó fuera de la pantalla',
      /se aplicó también en/.test(propagado.aviso), propagado.aviso.slice(0, 120));

    await c.js(`
      const p = MIST.app.proyecto;
      p.quitarArchivo(p.archivos[p.archivos.length - 1].id);
      MIST.app.vista.hojaId = p.archivos[0].hojas[0].id;
      MIST.app.render();
      return true;`);
    await esperar(300);

    const errFinal = await c.js(`return {js: window.__err};`);
    ok('ningún error de JS en todo el recorrido', errFinal.js.length === 0, errFinal.js);
    const errConsola = c.errores();
    ok('la consola quedó limpia', errConsola.length === 0, errConsola);

    await c.js(`document.getElementById('dialogo').close(); [...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Columnas')).click(); return true;`);
    await esperar(300);
    await c.foto('/tmp/mist-columnas.png');
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Entidades')).click(); return true;`);
    await esperar(300);
    await c.foto('/tmp/mist-entidades.png');
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Fusiones')).click(); return true;`);
    await esperar(300);
    await c.foto('/tmp/mist-fusiones.png');
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Vista previa')).click(); return true;`);
    await esperar(1400);
    await c.foto('/tmp/mist-previa.png');
    console.log('capturas en /tmp/mist-*.png');
  } finally {
    c.cerrar();
  }
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(1); });
