const fs = require('fs');
const raiz = require('path').join(__dirname, '..') + '/';
global.window = global;
global.btoa = s => Buffer.from(s,'binary').toString('base64');
global.atob = s => Buffer.from(s,'base64').toString('binary');
global.crypto = require('crypto').webcrypto;
global.XLSX = require(raiz+'vendor/xlsx.full.min.js');
global.Papa = require(raiz+'vendor/papaparse.min.js');
const BlobReal = global.Blob;
global.Blob = function (p, o) { return p && p.length && typeof p[0] === 'string' && !o ? {partes: p} : new BlobReal(p, o); };
global.URL = { createObjectURL: () => 'x', revokeObjectURL(){} };
global.document = { createElement: () => ({click(){},style:{}}), body:{appendChild(){},removeChild(){}} };
global.FileReader = class { readAsText(f){ this.result = f.texto; setTimeout(()=>this.onload(),0); } };
for (const f of ['00-hash.js','10-tipos.js','20-entidades.js','30-io.js','40-proyecto.js','45-zip.js','50-boveda.js']) eval(fs.readFileSync(raiz+'src/'+f,'utf8'));
const M = window.MIST;

const nombres = ['Joaquin','Maria','Diego','Lucia','Ana','Pedro','Sofia','Martin','Julieta','Nicolas','Camila','Federico'];
const apellidos = ['Perez','Gonzalez','Barrionuevo','Vieytes','Lorenzo','Lopez','Fernandez','Rodriguez','Gimenez','Sosa','Quiroga','Ibarra'];
const FILAS = 50000;
let csv = 'id,nombre,empresa,cuit,email,monto\n';
for (let i = 0; i < FILAS; i++) {
  const n = nombres[i % nombres.length], a = apellidos[(i * 7) % apellidos.length];
  const v = (i * 13) % 900;
  csv += `ID-${i},${n} ${a} ${v},Empresa ${v} SRL,30-${10000000 + v}-1,${n.toLowerCase()}${v}@x.com,${(i%1000)+0.5}\n`;
}
console.log('csv de ' + FILAS + ' filas, ' + (csv.length/1048576).toFixed(1) + ' MB');

(async () => {
  const t = {};
  const marca = (n, f) => { const t0 = Date.now(); const r = f(); t[n] = Date.now() - t0; return r; };
  const P = new M.Proyecto();
  const datos = await marca('leer', () => null) || await (async () => { const t0=Date.now(); const d = await M.io.leerArchivo({name:'grande.csv', texto: csv}); t.leer = Date.now()-t0; return d; })();
  marca('agregar', () => P.agregarArchivo(datos));
  const r = marca('escanear', () => P.escanear());
  const sug = marca('sugerencias', () => P.sugerencias());
  const salida = marca('transformar', () => P.transformar(P.archivos[0], P.archivos[0].hojas[0], 0, null));
  /* El camino de vuelta, y con la bóveda recién abierta y sin ninguna planilla
   * cargada, que es como se usa de verdad. */
  const P2 = new M.Proyecto();
  M.boveda.aplicar(P2, M.boveda.documentos(P));
  const vuelta = marca('reconstruir', () => P2.reconstruir([{ nombre: 'x', filas: salida }]));
  marca('inventario', () => P.inventario());
  console.log('reconstrucción: ' + vuelta.informe.tokens + ' tokens en ' +
    vuelta.informe.celdas + ' celdas, ' + vuelta.informe.ajenos.size + ' ajenos');
  console.log('entidades:', r.entidades, '| grupos:', P.tokenDeGrupo.size, '| sugerencias:', sug.length);
  console.log('filas de salida:', salida.length);
  const docs = marca('documentos', () => window.MIST.boveda.documentos(P));
  const tamanos = [...docs.entries()].map(([ruta, d]) => [ruta, JSON.stringify(d).length]);
  const total = tamanos.reduce((s, [, n]) => s + n, 0);
  const mayor = tamanos.reduce((a, b) => (b[1] > a[1] ? b : a));
  console.log('tiempos (ms):', JSON.stringify(t));
  console.log('bóveda: ' + tamanos.length + ' archivos, ' + (total / 1048576).toFixed(1) +
    ' MB en total, el más grande ' + (mayor[1] / 1048576).toFixed(2) + ' MB (' + mayor[0] + ')');
  const t0 = Date.now();
  const zip = await window.MIST.zip.crear(
    tamanos.map(([ruta]) => ({ ruta: ruta, texto: JSON.stringify(docs.get(ruta)) })));
  console.log('  como zip: ' + (zip.size / 1048576).toFixed(2) + ' MB en ' + (Date.now() - t0) + ' ms (' +
    (total / zip.size).toFixed(1) + '× más chico)');
  console.log('ejemplo:', salida[1].join(' | '));
})();
