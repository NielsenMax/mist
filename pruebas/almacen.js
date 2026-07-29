/* Prueba del almacén: carpeta real (con un handle falso, porque el selector
 * nativo no se puede manejar desde una prueba), escritura incremental,
 * autoguardado y respaldo a archivo único. */
const fs = require('fs');
const raiz = require('path').join(__dirname, '..') + '/';
global.window = global;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.crypto = require('crypto').webcrypto;
global.XLSX = require(raiz + 'vendor/xlsx.full.min.js');
global.Papa = require(raiz + 'vendor/papaparse.min.js');
global.Blob = class { constructor(p) { this.partes = p; } };
let blobPendiente = null;
const descargas = [];
global.URL = { createObjectURL: b => { blobPendiente = b; return 'x'; }, revokeObjectURL() {} };
global.document = {
  createElement: () => {
    const a = { style: {} };
    a.click = () => descargas.push({ nombre: a.download, texto: blobPendiente.partes.join('') });
    return a;
  },
  body: { appendChild() {}, removeChild() {} }
};
global.FileReader = class { readAsText(f) { this.result = f.texto; setTimeout(() => this.onload(), 0); } };
for (const f of ['00-hash.js', '10-tipos.js', '20-entidades.js', '30-io.js', '40-proyecto.js', '50-boveda.js', '55-almacen.js']) {
  eval(fs.readFileSync(raiz + 'src/' + f, 'utf8'));
}
const M = window.MIST;
const A = M.almacen;

let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else console.log('ok     ' + nombre);
}
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ── Un FileSystemDirectoryHandle falso, en memoria ────────────────── */

class ArchivoFalso {
  constructor(nombre) { this.kind = 'file'; this.name = nombre; this.texto = ''; this.escrituras = 0; }
  async getFile() { const t = this.texto; return { text: async () => t }; }
  async createWritable() {
    const self = this;
    let buffer = '';
    return {
      async write(t) { buffer += t; },
      async close() { self.texto = buffer; self.escrituras++; }
    };
  }
}

class CarpetaFalsa {
  constructor(nombre) { this.kind = 'directory'; this.name = nombre; this.hijos = new Map(); }
  async getFileHandle(nombre, op) {
    if (!this.hijos.has(nombre)) {
      if (!op || !op.create) throw new Error('no existe ' + nombre);
      this.hijos.set(nombre, new ArchivoFalso(nombre));
    }
    return this.hijos.get(nombre);
  }
  async getDirectoryHandle(nombre, op) {
    if (!this.hijos.has(nombre)) {
      if (!op || !op.create) throw new Error('no existe ' + nombre);
      this.hijos.set(nombre, new CarpetaFalsa(nombre));
    }
    return this.hijos.get(nombre);
  }
  async removeEntry(nombre) { this.hijos.delete(nombre); }
  async *values() { for (const h of this.hijos.values()) yield h; }
  contar() {
    let n = 0;
    for (const h of this.hijos.values()) n += h.kind === 'file' ? 1 : h.contar();
    return n;
  }
  escrituras() {
    let n = 0;
    for (const h of this.hijos.values()) n += h.kind === 'file' ? h.escrituras : h.escrituras();
    return n;
  }
  bytes() {
    let n = 0;
    for (const h of this.hijos.values()) n += h.kind === 'file' ? h.texto.length : h.bytes();
    return n;
  }
}

function archivoFalso(ruta) {
  const buf = fs.readFileSync(ruta);
  return { name: ruta.split('/').pop(), texto: buf.toString('utf8'), buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
}

async function proyectoCargado() {
  const P = new M.Proyecto();
  P.nombre = 'ensayo';
  for (const n of ['clientes.csv', 'ventas.csv', 'padron.csv']) {
    P.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/' + n)));
  }
  P.escanear();
  return P;
}

(async function () {
  // ── Carpeta: primera escritura
  const P = await proyectoCargado();
  const carpeta = new CarpetaFalsa('mi-proyecto');
  const almacen = new A.AlmacenCarpeta(carpeta);

  const vacia = await almacen.inspeccionar();
  ok('una carpeta vacía sirve para un proyecto nuevo', vacia.vacia && !vacia.esProyecto, vacia);

  const r1 = await almacen.escribir(M.boveda.documentos(P));
  ok('la primera escritura crea todos los archivos', r1.escritos === carpeta.contar(), r1.escritos + ' / ' + carpeta.contar());
  ok('están el manifiesto y las fusiones',
    carpeta.hijos.has('mist.json') && carpeta.hijos.has('fusiones.json'), [...carpeta.hijos.keys()]);
  ok('el mapa va en su subcarpeta',
    carpeta.hijos.get('mapa') && carpeta.hijos.get('mapa').contar() > 3,
    [...carpeta.hijos.get('mapa').hijos.keys()].slice(0, 5));
  ok('no se escriben fragmentos vacíos',
    [...carpeta.hijos.get('mapa').hijos.values()].every(f => JSON.parse(f.texto).entradas.length),
    carpeta.hijos.get('mapa').contar());

  // Dejar de seudonimizar una columna NO puede perder los tokens ya fijados:
  // pueden estar en un archivo que se exportó la semana pasada.
  const hojaClientes = P.archivos[0].hojas[0];
  const iLoc = hojaClientes.columnas.findIndex(c => c.nombre === 'localidad');
  const tokLoc = P.tokenDe(P.tipoPorId('localidad'), 'Vicente López');
  P.configurarColumna(hojaClientes, iLoc, 'conservar', null);
  P.escanear();
  await almacen.escribir(M.boveda.documentos(P));
  ok('los tokens ya acuñados sobreviven a que la columna se deje de tratar',
    [...carpeta.hijos.get('mapa').hijos.keys()].some(k => k.startsWith('localidad')),
    [...carpeta.hijos.get('mapa').hijos.keys()].filter(k => k.startsWith('localidad')));
  P.configurarColumna(hojaClientes, iLoc, 'seudonimo', 'localidad');
  P.escanear();
  ok('y al volver a tratarla vuelve el mismo token',
    P.tokenDe(P.tipoPorId('localidad'), 'Vicente López') === tokLoc);
  await almacen.escribir(M.boveda.documentos(P));

  // Cuando una entrada desaparece de verdad, su fragmento se borra del disco.
  const conFragmentos = carpeta.hijos.get('mapa').contar();
  const respaldo = new Map(P.asignaciones);
  P.asignaciones.forEach((token, id) => { if (id.startsWith('localidad')) P.asignaciones.delete(id); });
  P.configurarColumna(hojaClientes, iLoc, 'conservar', null);
  P.escanear();
  await almacen.escribir(M.boveda.documentos(P));
  ok('un fragmento que se queda sin entradas se borra',
    carpeta.hijos.get('mapa').contar() < conFragmentos &&
    ![...carpeta.hijos.get('mapa').hijos.keys()].some(k => k.startsWith('localidad')),
    [...carpeta.hijos.get('mapa').hijos.keys()]);
  P.asignaciones = respaldo;
  P.configurarColumna(hojaClientes, iLoc, 'seudonimo', 'localidad');
  P.escanear();
  await almacen.escribir(M.boveda.documentos(P));

  const ocupada = await almacen.inspeccionar();
  ok('una carpeta con proyecto se reconoce como tal', ocupada.esProyecto && !ocupada.vacia);

  // ── Escritura incremental
  const antes = carpeta.escrituras();
  const r2 = await almacen.escribir(M.boveda.documentos(P));
  ok('guardar sin cambios no escribe nada', r2.escritos === 0 && carpeta.escrituras() === antes, r2);

  const tPersona = P.tipoPorId('persona');
  const tok = P.tokenDe(tPersona, 'Joaquín Pérez');
  P.fusiones.unir('persona', M.tipos.NORMALIZADORES.nombre('Joaquin Peres'), M.tipos.NORMALIZADORES.nombre('Joaquín Pérez'));
  P.acunar();
  const r3 = await almacen.escribir(M.boveda.documentos(P));
  ok('una fusión reescribe pocos archivos, no todos',
    r3.escritos > 0 && r3.escritos <= 4, r3.escritos + ' de ' + carpeta.contar());

  // ── Reabrir
  const leidos = await almacen.leerTodo();
  ok('se relee todo lo escrito', leidos.size === carpeta.contar(), leidos.size + ' / ' + carpeta.contar());
  const P2 = new M.Proyecto();
  M.boveda.aplicar(P2, leidos);
  P2.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv')));
  P2.escanear();
  ok('el proyecto reabierto conserva el nombre', P2.nombre === 'ensayo', P2.nombre);
  ok('el proyecto reabierto da los mismos tokens',
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín Pérez') === tok);
  ok('y conserva la fusión',
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquin Peres') === tok);

  // ── Autoguardado
  let avisos = 0;
  const guardado = new A.Guardado(P, almacen, () => { avisos++; });
  ok('arranca en guardado', guardado.estado === 'guardado' && !guardado.pendiente());
  P.fusiones.rechazar('persona', 'a', 'b');
  guardado.marcar('descarte');
  ok('marcar deja el guardado pendiente', guardado.estado === 'pendiente' && guardado.pendiente());
  await espera(900);
  ok('el autoguardado escribe solo', guardado.estado === 'guardado' && !guardado.pendiente(), guardado.estado);
  ok('el rechazo quedó en el disco',
    JSON.parse(carpeta.hijos.get('fusiones.json').texto).rechazos.some(p => p[1] === 'a' && p[2] === 'b'));
  ok('cada cambio de estado se avisa a la interfaz', avisos >= 3, avisos);

  // varios cambios seguidos se juntan en una sola escritura
  const escriturasAntes = carpeta.escrituras();
  guardado.marcar('uno'); guardado.marcar('dos'); guardado.marcar('tres');
  await espera(900);
  ok('tres cambios seguidos no escriben tres veces',
    carpeta.escrituras() === escriturasAntes, carpeta.escrituras() - escriturasAntes);

  // ── Historial de archivos
  ok('el historial anota los tres archivos cargados', P.historial.length === 3,
    P.historial.map(e => e.nombre));
  ok('cada entrada trae huella, hojas y fecha',
    P.historial.every(e => e.huella && e.hojas.length && e.primera && e.ultima), P.historial[0]);
  ok('todavía ninguno figura exportado', P.historial.every(e => !e.exportado));

  const clientes = P.archivos.find(a => a.nombre === 'clientes.csv');
  ok('un archivo recién cargado es nuevo', clientes.estado.estado === 'nuevo');
  ok('las filas contadas descuentan el encabezado',
    P.historial.find(e => e.nombre === 'clientes.csv').hojas[0].filas === 10,
    P.historial.find(e => e.nombre === 'clientes.csv').hojas[0]);

  P.exportarArchivo(clientes);
  ok('exportar queda anotado', !!P.historial.find(e => e.nombre === 'clientes.csv').exportado);

  // el mismo archivo otra vez
  const otraVez = await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv'));
  const repetido = P.agregarArchivo(otraVez);
  ok('cargar el mismo archivo se reconoce como repetido', repetido.estado.estado === 'repetido',
    repetido.estado.estado);
  ok('y no agrega una entrada nueva al historial', P.historial.length === 3, P.historial.length);
  ok('pero cuenta que pasó dos veces',
    P.historial.find(e => e.nombre === 'clientes.csv').veces === 2);
  P.quitarArchivo(repetido.id);

  // una versión distinta con el mismo nombre
  const modificado = await M.io.leerArchivo({
    name: 'clientes.csv',
    texto: fs.readFileSync(raiz + 'ejemplos/clientes.csv', 'utf8') +
      'CL-011,Nuevo Cliente,Nueva SRL,30-99887766-5,n@x.com,11-1111-1111,CABA,1.00\\n'
  });
  ok('el contenido distinto da otra huella', modificado.huella !== otraVez.huella);
  const cambiado = P.agregarArchivo(modificado);
  ok('se detecta que el archivo cambió', cambiado.estado.estado === 'cambiado', cambiado.estado.estado);
  ok('la entrada conserva desde cuándo está ese nombre en el proyecto',
    P.historial.find(e => e.nombre === 'clientes.csv').primera < cambiado.estado.entrada.ultima);
  ok('y deja de figurar como exportado, porque lo exportado era la versión vieja',
    !P.historial.find(e => e.nombre === 'clientes.csv').exportado);
  P.quitarArchivo(cambiado.id);
  P.escanear();

  await almacen.escribir(M.boveda.documentos(P));
  ok('el historial se escribe en la carpeta', carpeta.hijos.has('historial.json'));
  const P3b = new M.Proyecto();
  M.boveda.aplicar(P3b, await almacen.leerTodo());
  ok('y sobrevive a reabrir el proyecto',
    P3b.historial.length === 3 && P3b.historial.find(e => e.nombre === 'clientes.csv').veces === 3,
    P3b.historial.map(e => e.nombre + ':' + e.veces));
  const reconocido = P3b.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/ventas.csv')));
  ok('un proyecto reabierto reconoce los archivos que ya había visto',
    reconocido.estado.estado === 'repetido', reconocido.estado.estado);

  // ── Cifrado sobre carpeta
  const carpetaC = new CarpetaFalsa('cifrado');
  const sal = M.boveda.salNueva();
  const clave = await M.boveda.derivar('frase de prueba', M.hash.fromBase64(sal));
  const almacenC = new A.AlmacenCarpeta(carpetaC, clave, sal);
  const gC = new A.Guardado(P, almacenC, () => {});
  await gC.guardar();
  const crudo = JSON.stringify([...carpetaC.hijos.values()].map(h => h.texto || ''));
  ok('en disco no queda ningún nombre real', !/Joaqu|perez|vieytes/i.test(crudo));
  const P4 = new M.Proyecto();
  M.boveda.aplicar(P4, await M.boveda.desenvolver(await almacenC.leerTodo(), clave));
  ok('el proyecto cifrado se reabre con la frase', P4.huella() === P.huella());

  // ── Respaldo de archivo único
  const almacenA = new A.AlmacenArchivo('ensayo');
  ok('el respaldo no autoguarda', almacenA.autoguarda === false);
  await almacenA.escribir(M.boveda.documentos(P));
  const bajado = descargas[descargas.length - 1];
  ok('se baja un único json con nombre del proyecto', bajado.nombre === 'mist-ensayo.json', bajado.nombre);
  const P5 = new M.Proyecto();
  M.boveda.aplicar(P5, A.docsDesdeJSON(bajado.texto));
  P5.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv')));
  P5.escanear();
  ok('el archivo único abre el mismo proyecto',
    P5.huella() === P.huella() && P5.tokenDe(P5.tipoPorId('persona'), 'Joaquín Pérez') === tok);

  const gA = new A.Guardado(P, almacenA, () => {});
  gA.marcar('cambio');
  ok('sin autoguardado el estado queda en "sin guardar"', gA.estado === 'sin guardar' && gA.pendiente());
  await espera(900);
  ok('y no se guarda solo', gA.estado === 'sin guardar');
  await gA.guardar();
  ok('guardar a mano lo deja al día', gA.estado === 'guardado' && !gA.pendiente());

  // ── Leer una carpeta desde un input, sin permisos de escritura
  const comoInput = [];
  (function recorrer(dir, prefijo) {
    for (const h of dir.hijos.values()) {
      if (h.kind === 'file') comoInput.push({ name: h.name, webkitRelativePath: prefijo + h.name, text: async () => h.texto });
      else recorrer(h, prefijo + h.name + '/');
    }
  })(carpeta, 'mi-proyecto/');
  const P6 = new M.Proyecto();
  M.boveda.aplicar(P6, await A.docsDesdeArchivos(comoInput));
  P6.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv')));
  P6.escanear();
  ok('una carpeta leída con un input abre el mismo proyecto',
    P6.tokenDe(P6.tipoPorId('persona'), 'Joaquín Pérez') === tok);

  // ── Bóveda v1
  const v1 = {
    mist: 1, creado: '2026-01-01T00:00:00.000Z', claveMaestra: P.claveMaestra,
    umbral: 0.9, tipos: P.tipos, perfiles: {},
    fusiones: P.fusiones.pares, rechazos: [], asignaciones: [], mapa: []
  };
  P.asignaciones.forEach((token, id) => {
    const corte = id.indexOf(M.SEP);
    v1.asignaciones.push([id.slice(0, corte), id.slice(corte + 1), token]);
  });
  const P7 = new M.Proyecto();
  M.boveda.aplicar(P7, A.docsDesdeJSON(JSON.stringify(v1)));
  P7.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv')));
  P7.escanear();
  ok('una bóveda de la primera versión se sigue abriendo',
    P7.tokenDe(P7.tipoPorId('persona'), 'Joaquín Pérez') === tok);

  // ── Tamaño
  console.log('       carpeta: ' + carpeta.contar() + ' archivos, ' +
    (carpeta.bytes() / 1024).toFixed(1) + ' KB para ' + P.inventario().length + ' entidades');

  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(1); });
