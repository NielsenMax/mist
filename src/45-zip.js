/* MIST — zip
 *
 * Un escritor y un lector de ZIP mínimos, para que la bóveda pueda viajar como
 * un solo archivo que al descomprimirse es exactamente la carpeta del proyecto.
 * Sirve donde el navegador no deja escribir en una carpeta: bajás el zip, lo
 * descomprimís donde quieras, y ese resultado se abre en Chrome como proyecto.
 *
 * La compresión la hace el navegador (CompressionStream), así que acá sólo hay
 * CRC32 y el armado de los encabezados.
 */
(function (global) {
  'use strict';

  var TABLA = null;

  function tablaCRC() {
    if (TABLA) return TABLA;
    TABLA = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      TABLA[n] = c >>> 0;
    }
    return TABLA;
  }

  function crc32(bytes) {
    var t = tablaCRC(), c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function hay() {
    return typeof global.CompressionStream === 'function' &&
           typeof global.DecompressionStream === 'function';
  }

  function comprimir(bytes) {
    if (!hay()) return Promise.resolve(null);
    var flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(flujo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function descomprimir(bytes) {
    var flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flujo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  var utf8 = new TextEncoder();

  /* entradas: [{ruta, texto}] → Blob de un zip */
  function crear(entradas) {
    var locales = [], central = [], offset = 0;

    return entradas.reduce(function (cadena, e) {
      return cadena.then(function () {
        var datos = utf8.encode(e.texto);
        var suma = crc32(datos);
        return comprimir(datos).then(function (comp) {
          var metodo = 8;
          /* Si comprimir no achica nada (archivos diminutos), se guarda crudo. */
          if (!comp || comp.length >= datos.length) { comp = datos; metodo = 0; }
          var nombre = utf8.encode(e.ruta);

          var lfh = new Uint8Array(30 + nombre.length);
          var dv = new DataView(lfh.buffer);
          dv.setUint32(0, 0x04034b50, true);
          dv.setUint16(4, 20, true);
          dv.setUint16(6, 0x0800, true);   // el nombre viene en UTF-8
          dv.setUint16(8, metodo, true);
          dv.setUint16(10, 0, true);       // hora
          dv.setUint16(12, 0x21, true);    // fecha: 1980-01-01, la mínima válida
          dv.setUint32(14, suma, true);
          dv.setUint32(18, comp.length, true);
          dv.setUint32(22, datos.length, true);
          dv.setUint16(26, nombre.length, true);
          lfh.set(nombre, 30);

          var cdh = new Uint8Array(46 + nombre.length);
          var cv = new DataView(cdh.buffer);
          cv.setUint32(0, 0x02014b50, true);
          cv.setUint16(4, 20, true);
          cv.setUint16(6, 20, true);
          cv.setUint16(8, 0x0800, true);
          cv.setUint16(10, metodo, true);
          cv.setUint16(12, 0, true);
          cv.setUint16(14, 0x21, true);
          cv.setUint32(16, suma, true);
          cv.setUint32(20, comp.length, true);
          cv.setUint32(24, datos.length, true);
          cv.setUint16(28, nombre.length, true);
          cv.setUint32(42, offset, true);
          cdh.set(nombre, 46);

          locales.push(lfh, comp);
          central.push(cdh);
          offset += lfh.length + comp.length;
        });
      });
    }, Promise.resolve()).then(function () {
      var tamCentral = central.reduce(function (s, c) { return s + c.length; }, 0);
      var fin = new Uint8Array(22);
      var fv = new DataView(fin.buffer);
      fv.setUint32(0, 0x06054b50, true);
      fv.setUint16(8, entradas.length, true);
      fv.setUint16(10, entradas.length, true);
      fv.setUint32(12, tamCentral, true);
      fv.setUint32(16, offset, true);
      return new Blob(locales.concat(central, [fin]), { type: 'application/zip' });
    });
  }

  /* Blob o ArrayBuffer de un zip → Map<ruta, texto> */
  function leer(fuente) {
    var paso = fuente instanceof Uint8Array
      ? Promise.resolve(fuente)
      : (fuente.arrayBuffer ? fuente.arrayBuffer() : Promise.resolve(fuente))
          .then(function (b) { return new Uint8Array(b); });

    return paso.then(function (u8) {
      var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      /* El directorio central está al final; se lo busca hacia atrás porque
       * puede haber un comentario después. */
      var fin = u8.length - 22;
      while (fin >= 0 && !(u8[fin] === 0x50 && u8[fin + 1] === 0x4b &&
                           u8[fin + 2] === 0x05 && u8[fin + 3] === 0x06)) fin--;
      if (fin < 0) throw new Error('El archivo no es un zip.');

      var cantidad = dv.getUint16(fin + 10, true);
      var p = dv.getUint32(fin + 16, true);
      var salida = new Map();
      var pasos = [];

      for (var k = 0; k < cantidad; k++) {
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El zip está dañado.');
        var metodo = dv.getUint16(p + 10, true);
        var comprimido = dv.getUint32(p + 20, true);
        var largoNombre = dv.getUint16(p + 28, true);
        var largoExtra = dv.getUint16(p + 30, true);
        var largoComentario = dv.getUint16(p + 32, true);
        var local = dv.getUint32(p + 42, true);
        var ruta = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + largoNombre));
        p += 46 + largoNombre + largoExtra + largoComentario;

        if (/\/$/.test(ruta)) continue;   // una carpeta, sin contenido
        var inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        var datos = u8.subarray(inicio, inicio + comprimido);
        pasos.push((function (ruta, datos, metodo) {
          var plano = metodo === 8 ? descomprimir(datos) : Promise.resolve(datos);
          return plano.then(function (b) { salida.set(ruta, new TextDecoder().decode(b)); });
        })(ruta, datos, metodo));
      }
      return Promise.all(pasos).then(function () { return salida; });
    });
  }


  global.MIST.zip = { crear: crear, leer: leer, crc32: crc32, hay: hay };
})(window);
