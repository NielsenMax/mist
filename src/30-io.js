/* MIST — lectura y escritura de planillas
 *
 * Nada sale del navegador: los archivos se leen con la File API y se escriben
 * con URL.createObjectURL. No hay ninguna petición de red en toda la app.
 *
 * Los valores se conservan con su tipo original (número, fecha, texto) para que
 * las columnas que el operador decide no tocar vuelvan a salir idénticas. Sólo
 * las celdas sustituidas pasan a ser texto.
 */
(function (global) {
  'use strict';

  var EXT_PLANILLA = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;
  var EXT_TEXTO = /\.(csv|tsv|txt)$/i;

  /* Representación de un valor de celda como texto, para normalizar, mostrar y
   * exportar a CSV. Las fechas van en ISO corto: es lo que menos ambigüedad
   * genera después, sobre todo si el destino es un modelo de lenguaje. */
  function texto(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      var iso = v.toISOString();
      return (v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds())
        ? iso.slice(0, 19).replace('T', ' ')
        : iso.slice(0, 10);
    }
    return String(v);
  }

  function leerTexto(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).replace(/^\uFEFF/, '')); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file, 'utf-8');
    });
  }

  function leerBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  function rectangular(filas) {
    var ancho = 0;
    for (var i = 0; i < filas.length; i++) if (filas[i].length > ancho) ancho = filas[i].length;
    for (i = 0; i < filas.length; i++) {
      while (filas[i].length < ancho) filas[i].push(null);
    }
    return ancho;
  }

  /* Huella del contenido leído. Sirve para reconocer un archivo que ya pasó por
   * el proyecto y para distinguirlo de una versión nueva con el mismo nombre.
   * crypto.subtle es unas treinta veces más rápido, pero el resultado es el
   * mismo SHA-256 que calcula la implementación propia donde no está. */
  function huellaContenido(datos) {
    var bytes = typeof datos === 'string' ? global.MIST.hash.bytes(datos) : datos;
    if (global.crypto && global.crypto.subtle && global.crypto.subtle.digest) {
      return global.crypto.subtle.digest('SHA-256', bytes)
        .then(function (h) { return global.MIST.hash.encode(new Uint8Array(h), 16); })
        .catch(function () { return global.MIST.hash.encode(global.MIST.hash.sha256(bytes), 16); });
    }
    return Promise.resolve(global.MIST.hash.encode(global.MIST.hash.sha256(bytes), 16));
  }

  /* Devuelve {nombre, formato, huella, delimitador, hojas:[{nombre, filas}]}.
   * `filas` incluye la fila de encabezado; quién es encabezado lo decide el
   * proyecto, no el lector. */
  function leerArchivo(file) {
    if (EXT_PLANILLA.test(file.name)) {
      return leerBuffer(file).then(function (buf) {
        var libro = XLSX.read(buf, { type: 'array', cellDates: true, dense: false });
        var hojas = libro.SheetNames.map(function (nombre) {
          var ws = libro.Sheets[nombre];
          var filas = XLSX.utils.sheet_to_json(ws, {
            header: 1, defval: null, raw: true, blankrows: false
          });
          rectangular(filas);
          return { nombre: nombre, filas: filas };
        }).filter(function (h) { return h.filas.length; });
        if (!hojas.length) throw new Error('El archivo no tiene hojas con datos.');
        return huellaContenido(buf).then(function (huella) {
          return { nombre: file.name, formato: 'planilla', huella: huella, hojas: hojas };
        });
      });
    }
    if (EXT_TEXTO.test(file.name)) {
      return leerTexto(file).then(function (txt) {
        var r = Papa.parse(txt, { header: false, skipEmptyLines: 'greedy', dynamicTyping: false });
        if (!r.data.length) throw new Error('El archivo está vacío.');
        rectangular(r.data);
        return huellaContenido(txt).then(function (huella) {
          return {
            nombre: file.name,
            formato: 'texto',
            huella: huella,
            delimitador: (r.meta && r.meta.delimiter) || ',',
            saltoLinea: (r.meta && r.meta.linebreak) || '\r\n',
            hojas: [{ nombre: file.name.replace(/\.[^.]+$/, ''), filas: r.data }]
          };
        });
      });
    }
    return Promise.reject(new Error('Formato no soportado: ' + file.name));
  }

  function descargar(blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* El nombre dice en qué dirección se movió el archivo. Una marca anterior se
   * reemplaza en vez de encadenarse: reconstruir "clientes.desensibilizado.csv"
   * da "clientes.reconstruido.csv" y no un nombre con las dos cosas. */
  function sufijo(nombre, ext, marca) {
    var base = nombre.replace(/\.[^.]+$/, '').replace(/\.(desensibilizado|reconstruido)$/, '');
    return base + '.' + (marca || 'desensibilizado') + '.' + ext;
  }

  /* El BOM es lo que hace que Excel abra un CSV UTF-8 sin romper los acentos. */
  function escribirCSV(hojas, delimitador) {
    var filas = hojas[0].filas.map(function (f) { return f.map(texto); });
    var csv = Papa.unparse(filas, { delimiter: delimitador || ',', newline: '\r\n' });
    return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  }

  function escribirPlanilla(hojas) {
    var libro = XLSX.utils.book_new();
    hojas.forEach(function (h) {
      var ws = XLSX.utils.aoa_to_sheet(h.filas, { cellDates: true });
      /* Excel no acepta nombres de hoja de más de 31 caracteres. */
      XLSX.utils.book_append_sheet(libro, ws, h.nombre.slice(0, 31));
    });
    var out = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function exportarArchivo(archivo, hojasSalida, marca) {
    if (archivo.formato === 'texto') {
      descargar(escribirCSV(hojasSalida, archivo.delimitador), sufijo(archivo.nombre, 'csv', marca));
    } else {
      descargar(escribirPlanilla(hojasSalida), sufijo(archivo.nombre, 'xlsx', marca));
    }
  }

  function exportarCSVCrudo(filas, nombre) {
    var csv = Papa.unparse(filas.map(function (f) { return f.map(texto); }), { newline: '\r\n' });
    descargar(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), nombre);
  }

  global.MIST.io = {
    leerArchivo: leerArchivo,
    huellaContenido: huellaContenido,
    texto: texto,
    descargar: descargar,
    exportarArchivo: exportarArchivo,
    exportarCSVCrudo: exportarCSVCrudo,
    EXT_PLANILLA: EXT_PLANILLA,
    EXT_TEXTO: EXT_TEXTO
  };
})(window);
