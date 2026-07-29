/* Prueba del modo sin carpetas: el que le toca a Firefox. Se le saca
 * showDirectoryPicker a un Chrome real antes de que cargue la página, así se
 * ejercita el mismo camino con IndexedDB y zip de verdad. */
const fs = require('fs');
const { lanzar, esperar } = require('./chrome.js');

const RAIZ = require('path').join(__dirname, '..') + '/';
let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else console.log('ok     ' + nombre);
}

(async () => {
  const c = await lanzar(9401);
  try {
    await c.antesDeCargar(`
      delete window.showDirectoryPicker;
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:152.0) Gecko/20100101 Firefox/152.0'
      });
      window.__zips = [];
      const crear = URL.createObjectURL.bind(URL);
      URL.createObjectURL = b => { window.__zips.push(b); return crear(b); };
      addEventListener('DOMContentLoaded', () => { HTMLAnchorElement.prototype.click = function () {}; });
      window.__err = [];
      addEventListener('error', e => window.__err.push(e.message));
      addEventListener('unhandledrejection', e => window.__err.push('promesa: ' + e.reason));
    `);
    await c.ir('file://' + RAIZ + 'mist.html');
    await esperar(400);

    const portada = await c.js(`return {
      sinCarpetas: typeof window.showDirectoryPicker,
      hayNavegador: MIST.almacen.hayNavegador(),
      aviso: document.getElementById('portada-aviso').hidden ? '' : document.getElementById('portada-aviso').textContent,
      notaNuevo: document.getElementById('nota-nuevo').textContent
    };`);
    ok('el navegador simulado no tiene carpetas', portada.sinCarpetas === 'undefined');
    ok('pero sí tiene almacenamiento propio', portada.hayNavegador === true);
    ok('la portada avisa antes de que elijas nada', /Firefox 152/.test(portada.aviso), portada.aviso.slice(0, 100));
    ok('y explica que la copia en disco es un .zip', /\.zip/.test(portada.aviso), portada.aviso.slice(-90));
    ok('la tarjeta de crear dice lo mismo', /navegador/.test(portada.notaNuevo), portada.notaNuevo);

    // ── Crear el proyecto
    await c.js(`document.getElementById('btn-nuevo').click(); return true;`);
    await esperar(300);
    await c.js(`
      document.querySelector('#dlg-campos input[type=text]').value = 'ensayo firefox';
      document.getElementById('dlg-aceptar').click(); return true;`);
    await esperar(1000);

    const creado = await c.js(`return {
      cuerpo: !document.getElementById('cuerpo').hidden,
      modo: MIST.app.vista.almacen.modo,
      estado: document.getElementById('estado-guardado').textContent,
      copiaEnDisco: MIST.app.vista.guardado.copiaEnDisco(),
      guardarVisible: !document.getElementById('btn-guardar').hidden,
      guardarTexto: document.getElementById('btn-guardar').textContent
    };`);
    ok('entra a la aplicación sin pedir carpeta', creado.cuerpo && creado.modo === 'navegador', creado);
    ok('la bóveda ya está guardada en el navegador', creado.estado !== 'sin guardar', creado.estado);
    ok('pero todavía no hay copia en disco', creado.copiaEnDisco === false);
    ok('la barra ofrece bajar el zip', creado.guardarVisible && /zip/.test(creado.guardarTexto), creado.guardarTexto);

    // ── Cargar planillas y trabajar
    const csv = n => JSON.stringify(fs.readFileSync(RAIZ + 'ejemplos/' + n, 'utf8'));
    await c.js(`
      const dt = new DataTransfer();
      dt.items.add(new File([${csv('clientes.csv')}], 'clientes.csv', {type:'text/csv'}));
      dt.items.add(new File([${csv('ventas.csv')}], 'ventas.csv', {type:'text/csv'}));
      const i = document.getElementById('entrada-archivos');
      i.files = dt.files; i.dispatchEvent(new Event('change'));
      return true;`);
    await esperar(1600);

    const trabajo = await c.js(`return {
      entidades: MIST.app.proyecto.tokenDeGrupo.size,
      joaquin: MIST.app.proyecto.tokenDe(MIST.app.proyecto.tipoPorId('persona'), 'Joaquín Pérez'),
      estado: document.getElementById('estado-guardado').textContent,
      errores: window.__err
    };`);
    ok('trabaja normalmente', trabajo.entidades > 20 && /^persona-/.test(trabajo.joaquin), trabajo.entidades);
    ok('sin errores de JS', trabajo.errores.length === 0, trabajo.errores);
    ok('el autoguardado en el navegador se completó', trabajo.estado === 'sin copia en disco', trabajo.estado);

    // ── La compuerta exige la copia en disco, no sólo el autoguardado
    await c.js(`[...document.querySelectorAll('.pestania')].find(b => b.textContent.startsWith('Salida')).click(); return true;`);
    await esperar(300);
    const trabado = await c.js(`return {
      botones: [...document.querySelectorAll('#panel-salida button')].filter(b => /\\.csv/.test(b.textContent)).map(b => b.disabled),
      aviso: (document.querySelector('#panel-salida .aviso') || {}).textContent || ''
    };`);
    ok('las descargas están cerradas aunque la bóveda esté guardada',
      trabado.botones.length === 2 && trabado.botones.every(Boolean), trabado.botones);
    ok('y el aviso explica que falta la copia en disco',
      /copia de la b[oó]veda en el disco/.test(trabado.aviso), trabado.aviso.slice(0, 110));

    // ── Bajar el zip abre la compuerta
    await c.js(`return MIST.app.vista.guardado.bajarCopia();`);
    await esperar(600);
    await c.js(`MIST.app.render(); return true;`);
    const conCopia = await c.js(`return {
      copiaEnDisco: MIST.app.vista.guardado.copiaEnDisco(),
      botones: [...document.querySelectorAll('#panel-salida button')].filter(b => /\\.csv/.test(b.textContent)).map(b => b.disabled),
      zips: window.__zips.length,
      tipo: window.__zips[window.__zips.length - 1].type,
      tamano: window.__zips[window.__zips.length - 1].size
    };`);
    ok('bajar el zip marca la copia en disco', conCopia.copiaEnDisco === true);
    ok('y habilita las descargas de planillas', conCopia.botones.every(b => !b), conCopia.botones);
    ok('lo bajado es un zip', conCopia.tipo === 'application/zip' && conCopia.tamano > 0, conCopia);

    const delZip = await c.js(`
      const blob = window.__zips[window.__zips.length - 1];
      const docs = await MIST.almacen.docsDesdeZIP(blob);
      const P2 = new MIST.Proyecto();
      MIST.boveda.aplicar(P2, docs);
      P2.escanear();
      return {
        rutas: [...docs.keys()].sort(),
        nombre: P2.nombre,
        joaquin: P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín Pérez'),
        historial: P2.historial.length
      };`);
    ok('el zip tiene la estructura de la carpeta',
      ['mist.json', 'fusiones.json', 'historial.json'].every(r => delZip.rutas.includes(r)) &&
      delZip.rutas.some(r => r.startsWith('mapa/')), delZip.rutas);
    ok('y reabre el proyecto entero desde el zip',
      delZip.nombre === 'ensayo firefox' && delZip.joaquin === trabajo.joaquin, delZip);
    ok('con el historial adentro', delZip.historial === 2, delZip.historial);

    // ── Volver a tocar algo cierra la compuerta otra vez
    await c.js(`MIST.app.anotar('prueba'); return true;`);
    await esperar(900);
    ok('un cambio nuevo vuelve a exigir una copia fresca',
      (await c.js(`return MIST.app.vista.guardado.copiaEnDisco();`)) === false);
    ok('pero el autoguardado en el navegador ya lo tomó',
      (await c.js(`return MIST.app.vista.guardado.estado;`)) === 'guardado');

    // ── Lo guardado en el navegador sobrevive y se puede reabrir
    const guardados = await c.js(`return await MIST.almacen.AlmacenNavegador.listar();`);
    ok('el proyecto figura en la lista del navegador',
      guardados.length === 1 && guardados[0].nombre === 'ensayo firefox', guardados);

    const reabierto = await c.js(`
      const a = new MIST.almacen.AlmacenNavegador(${JSON.stringify(guardados[0].id)}, 'x');
      const docs = await a.leerTodo();
      const P3 = new MIST.Proyecto();
      MIST.boveda.aplicar(P3, docs);
      P3.escanear();
      return {archivos: docs.size, nombre: P3.nombre, joaquin: P3.tokenDe(P3.tipoPorId('persona'), 'Joaquín Pérez')};`);
    ok('se reabre desde IndexedDB con los mismos tokens',
      reabierto.joaquin === trabajo.joaquin && reabierto.nombre === 'ensayo firefox', reabierto);
    ok('y guarda varios archivos, no uno solo', reabierto.archivos > 4, reabierto.archivos);

    // ── Cerrar la pestaña sin copia en disco tiene que frenar
    const cierre = await c.js(`
      const ev = new Event('beforeunload', {cancelable: true});
      window.dispatchEvent(ev);
      return ev.defaultPrevented;`);
    ok('sin copia en disco, cerrar la pestaña pide confirmación', cierre === true);

    const errFinal = await c.js(`return window.__err;`);
    ok('ningún error de JS en todo el recorrido', errFinal.length === 0, errFinal);
    ok('la consola quedó limpia', c.errores().length === 0, c.errores());

    await c.foto('/tmp/mist-navegador.png');
  } finally {
    c.cerrar();
  }
  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(1); });
