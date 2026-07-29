/* Prueba del escritor y lector de ZIP. Sin stubs de Blob: usa los del runtime,
 * que son los mismos que el navegador. */
const fs = require('fs');
const { execFileSync } = require('child_process');
const raiz = require('path').join(__dirname, '..') + '/';
global.window = global;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.crypto = require('crypto').webcrypto;
global.MIST = {};
eval(fs.readFileSync(raiz + 'src/45-zip.js', 'utf8'));
const Z = window.MIST.zip;

let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else console.log('ok     ' + nombre);
}

(async function () {
  ok('el runtime tiene CompressionStream', Z.hay());

  // CRC32 contra el vector conocido de "123456789"
  ok('crc32("123456789") = 0xCBF43926',
    Z.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926,
    Z.crc32(new TextEncoder().encode('123456789')).toString(16));

  const entradas = [
    { ruta: 'mist.json', texto: JSON.stringify({ mist: 2, proyecto: 'ensayo', ñ: 'acentué' }) },
    { ruta: 'fusiones.json', texto: JSON.stringify({ mist: 2, fusiones: [] }) },
    { ruta: 'mapa/persona-0.json', texto: JSON.stringify({ entradas: Array.from({ length: 400 }, (_, i) => ['clave ' + i, 'persona-' + i, ['Forma ' + i], i]) }) },
    { ruta: 'mapa/empresa-3.json', texto: '{"entradas":[]}' },
    { ruta: 'vacio.json', texto: '{}' }
  ];

  const blob = await Z.crear(entradas);
  ok('produce un blob de tipo zip', blob.type === 'application/zip' && blob.size > 0, blob.size);

  const crudo = Buffer.from(await blob.arrayBuffer());
  ok('empieza con la firma PK\\x03\\x04', crudo[0] === 0x50 && crudo[1] === 0x4b && crudo[2] === 3 && crudo[3] === 4);

  const sinComprimir = entradas.reduce((s, e) => s + Buffer.byteLength(e.texto, 'utf8'), 0);
  ok('comprime de verdad', blob.size < sinComprimir * 0.5,
    (blob.size / 1024).toFixed(1) + ' KB vs ' + (sinComprimir / 1024).toFixed(1) + ' KB en claro');

  const leido = await Z.leer(blob);
  ok('devuelve las mismas rutas',
    JSON.stringify([...leido.keys()].sort()) === JSON.stringify(entradas.map(e => e.ruta).sort()),
    [...leido.keys()]);
  ok('y el mismo contenido, acentos incluidos',
    entradas.every(e => leido.get(e.ruta) === e.texto),
    entradas.filter(e => leido.get(e.ruta) !== e.texto).map(e => e.ruta));

  // El descompresor del sistema tiene que poder abrirlo: es el punto de que sea
  // un zip y no un formato propio.
  const tmp = '/tmp/mist-prueba-zip';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(tmp + '/boveda.zip', crudo);
  try {
    execFileSync('unzip', ['-q', tmp + '/boveda.zip', '-d', tmp + '/salida']);
    const listado = [];
    (function recorrer(dir, prefijo) {
      for (const n of fs.readdirSync(dir)) {
        const ruta = dir + '/' + n;
        if (fs.statSync(ruta).isDirectory()) recorrer(ruta, prefijo + n + '/');
        else listado.push(prefijo + n);
      }
    })(tmp + '/salida', '');
    ok('unzip del sistema lo abre y reconstruye la carpeta',
      JSON.stringify(listado.sort()) === JSON.stringify(entradas.map(e => e.ruta).sort()), listado);
    ok('con el contenido intacto',
      fs.readFileSync(tmp + '/salida/mapa/persona-0.json', 'utf8') ===
        entradas.find(e => e.ruta === 'mapa/persona-0.json').texto);
  } catch (e) {
    fallas++;
    console.log('FALLA  unzip del sistema lo abre  → ' + e.message);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // Un zip con carpeta raíz, como el que sale de comprimir la carpeta a mano
  const conRaiz = await Z.crear(entradas.map(e => ({ ruta: 'mi-proyecto/' + e.ruta, texto: e.texto })));
  const leidoRaiz = await Z.leer(conRaiz);
  ok('también lee zips con una carpeta raíz',
    leidoRaiz.get('mi-proyecto/mist.json') === entradas[0].texto);

  let rechazo = false;
  await Z.leer(new Blob([new Uint8Array([1, 2, 3, 4, 5])])).catch(() => { rechazo = true; });
  ok('rechaza lo que no es un zip', rechazo);

  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(1); });
