/* MIST — dónde vive el proyecto
 *
 * Tres almacenes con la misma interfaz, elegidos según lo que el navegador
 * sepa hacer:
 *
 *   AlmacenCarpeta    una carpeta de verdad en el disco, elegida por el
 *                     operador con showDirectoryPicker. Escribe sólo los
 *                     archivos que cambiaron, así guardar después de cada
 *                     acción es barato. Chrome y Edge.
 *
 *   AlmacenNavegador  IndexedDB, donde no hay File System Access. Autoguarda
 *                     igual, pero eso no es una copia en el disco: se pierde
 *                     si se borran los datos del sitio. La copia se baja como
 *                     un zip que se descomprime en la carpeta del proyecto.
 *                     Firefox y sus derivados.
 *
 *   AlmacenArchivo    último recurso, sin autoguardado: todo el proyecto en un
 *                     único JSON que se baja a mano.
 *
 * De ahí sale una distinción que atraviesa toda la herramienta: `autoguarda`
 * (si el guardado ocurre solo) y `enDisco` (si ese guardado deja algo afuera
 * del navegador). Exportar planillas exige lo segundo, no lo primero.
 */
(function (global) {
  'use strict';

  var H = global.MIST.hash;
  var B = global.MIST.boveda;
  var IO = global.MIST.io;
  var Z = global.MIST.zip;

  function hayCarpetas() {
    return typeof global.showDirectoryPicker === 'function';
  }

  function hayNavegador() {
    return !!global.indexedDB;
  }

  /* ── Carpeta ────────────────────────────────────────────────────────── */

  function AlmacenCarpeta(handle, clave, sal) {
    this.modo = 'carpeta';
    this.handle = handle;
    this.nombre = handle.name;
    this.autoguarda = true;
    this.enDisco = true;          // guardar ya deja el proyecto en el disco
    this.clave = clave || null;   // CryptoKey, si el proyecto está cifrado
    this.sal = sal || null;
    this.huellas = new Map();     // ruta → huella del contenido ya escrito
  }

  AlmacenCarpeta.prototype.descripcion = function () {
    return 'carpeta ' + this.nombre + (this.clave ? ' (cifrada)' : '');
  };

  AlmacenCarpeta.prototype.subcarpeta = function (nombre, crear) {
    return this.handle.getDirectoryHandle(nombre, { create: !!crear });
  };

  AlmacenCarpeta.prototype.leerTodo = function () {
    var self = this;
    var docs = new Map();

    function leerArchivo(handle, ruta) {
      return handle.getFile()
        .then(function (f) { return f.text(); })
        .then(function (t) {
          try { docs.set(ruta, JSON.parse(t)); }
          catch (e) { throw new Error('El archivo ' + ruta + ' no es JSON válido.'); }
          self.huellas.set(ruta, huellaDe(t));
        });
    }

    function recorrer(dir, prefijo) {
      var pasos = [];
      return (async function () {
        for await (var entrada of dir.values()) {
          var ruta = prefijo + entrada.name;
          if (entrada.kind === 'file') {
            if (/\.json$/i.test(entrada.name)) pasos.push(leerArchivo(entrada, ruta));
          } else if (entrada.name === B.CARPETA_MAPA) {
            pasos.push(recorrer(entrada, ruta + '/'));
          }
        }
        return Promise.all(pasos);
      })();
    }

    return recorrer(this.handle, '').then(function () { return docs; });
  };

  /* Escribe sólo lo que cambió desde la última vez. Devuelve cuántos archivos
   * tocó, que es lo que se le muestra al operador. */
  AlmacenCarpeta.prototype.escribir = function (docs) {
    var self = this;
    var pasos = [];
    var escritos = 0;

    docs.forEach(function (doc, ruta) {
      var texto = JSON.stringify(doc);
      var huella = huellaDe(texto);
      if (self.huellas.get(ruta) === huella) return;
      escritos++;
      pasos.push(self.escribirUno(ruta, texto).then(function () {
        self.huellas.set(ruta, huella);
      }));
    });

    /* Un fragmento que se quedó sin entradas se borra. Si sobreviviera, al
     * reabrir el proyecto volverían tokens que ya no corresponden. */
    this.huellas.forEach(function (huella, ruta) {
      if (docs.has(ruta) || ruta.indexOf(B.CARPETA_MAPA + '/') !== 0) return;
      escritos++;
      pasos.push(self.borrarUno(ruta).then(function () { self.huellas.delete(ruta); }));
    });

    return Promise.all(pasos).then(function () { return { escritos: escritos }; });
  };

  AlmacenCarpeta.prototype.borrarUno = function (ruta) {
    var partes = ruta.split('/');
    return this.subcarpeta(partes[0], false)
      .then(function (d) { return d.removeEntry(partes[partes.length - 1]); })
      .catch(function () { /* si ya no está, mejor */ });
  };

  AlmacenCarpeta.prototype.escribirUno = function (ruta, texto) {
    var partes = ruta.split('/');
    var self = this;
    var dir = Promise.resolve(this.handle);
    if (partes.length > 1) dir = this.subcarpeta(partes[0], true);
    return dir.then(function (d) {
      return d.getFileHandle(partes[partes.length - 1], { create: true });
    }).then(function (h) {
      return h.createWritable();
    }).then(function (w) {
      return w.write(texto).then(function () { return w.close(); });
    }).catch(function (e) {
      throw new Error('No se pudo escribir ' + ruta + ' en ' + self.nombre + ': ' + e.message);
    });
  };

  /* Una carpeta sirve como proyecto nuevo sólo si está vacía o si ya es un
   * proyecto de MIST: escribir la bóveda encima de otra cosa sería destructivo. */
  AlmacenCarpeta.prototype.inspeccionar = function () {
    var self = this;
    return (async function () {
      var archivos = 0, esProyecto = false;
      for await (var entrada of self.handle.values()) {
        archivos++;
        if (entrada.name === B.MANIFIESTO) esProyecto = true;
      }
      return { vacia: archivos === 0, esProyecto: esProyecto, archivos: archivos };
    })();
  };

  /* ── Archivo único ──────────────────────────────────────────────────── */

  function AlmacenArchivo(nombre, clave, sal) {
    this.modo = 'archivo';
    this.nombre = nombre;
    this.autoguarda = false;
    this.enDisco = true;
    this.clave = clave || null;
    this.sal = sal || null;
    this.docs = null;
  }

  AlmacenArchivo.prototype.descripcion = function () {
    return 'archivo ' + this.nombreArchivo() + (this.clave ? ' (cifrado)' : '');
  };

  AlmacenArchivo.prototype.nombreArchivo = function () {
    return 'mist-' + this.nombre.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() + '.json';
  };

  AlmacenArchivo.prototype.leerTodo = function () {
    return Promise.resolve(this.docs || new Map());
  };

  /* El JSON de salida es un objeto plano ruta → documento, o sea la carpeta
   * aplanada. Lo que se abre desde una carpeta y lo que se abre desde un
   * archivo son la misma cosa. */
  AlmacenArchivo.prototype.escribir = function (docs) {
    var plano = {};
    docs.forEach(function (doc, ruta) { plano[ruta] = doc; });
    IO.descargar(
      new Blob([JSON.stringify({ mist: B.VERSION, carpeta: plano }, null, 1)], { type: 'application/json' }),
      this.nombreArchivo());
    this.docs = docs;
    return Promise.resolve({ escritos: docs.size });
  };

  /* ── Navegador (IndexedDB) ──────────────────────────────────────────── */

  /* Donde no hay File System Access —Firefox, por ejemplo— el proyecto se
   * autoguarda dentro del navegador. No reemplaza a tener la bóveda en el
   * disco: si se borran los datos del sitio, esto se va con ellos. Por eso
   * conviven las dos cosas, y exportar planillas sigue exigiendo una copia en
   * el disco, que acá se baja como un zip con la estructura de la carpeta. */
  var BASE = 'mist';
  var DOCS = 'documentos';
  var PROY = 'proyectos';

  function abrirBase() {
    return new Promise(function (ok, mal) {
      var req = indexedDB.open(BASE, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DOCS)) {
          db.createObjectStore(DOCS, { keyPath: 'id' }).createIndex('proyecto', 'proyecto', { unique: false });
        }
        if (!db.objectStoreNames.contains(PROY)) db.createObjectStore(PROY, { keyPath: 'id' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () {
        mal(new Error('El navegador no dejó abrir su almacenamiento: ' +
          ((req.error && req.error.message) || 'motivo desconocido')));
      };
    });
  }

  function pedir(req) {
    return new Promise(function (ok, mal) {
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { mal(req.error); };
    });
  }

  function AlmacenNavegador(id, nombre, clave, sal) {
    this.modo = 'navegador';
    this.id = id;
    this.nombre = nombre;
    this.autoguarda = true;
    this.enDisco = false;      // guardar acá no deja nada afuera del navegador
    this.clave = clave || null;
    this.sal = sal || null;
    this.huellas = new Map();
  }

  AlmacenNavegador.prototype.descripcion = function () {
    return 'este navegador' + (this.clave ? ' (cifrado)' : '');
  };

  AlmacenNavegador.prototype.leerTodo = function () {
    var self = this;
    return abrirBase().then(function (db) {
      var tx = db.transaction(DOCS, 'readonly');
      var indice = tx.objectStore(DOCS).index('proyecto');
      return pedir(indice.getAll(self.id)).then(function (filas) {
        var docs = new Map();
        filas.forEach(function (f) {
          docs.set(f.ruta, JSON.parse(f.texto));
          self.huellas.set(f.ruta, huellaDe(f.texto));
        });
        db.close();
        return docs;
      });
    });
  };

  AlmacenNavegador.prototype.escribir = function (docs) {
    var self = this;
    return abrirBase().then(function (db) {
      var tx = db.transaction([DOCS, PROY], 'readwrite');
      var almacen = tx.objectStore(DOCS);
      var escritos = 0;

      docs.forEach(function (doc, ruta) {
        var texto = JSON.stringify(doc);
        var huella = huellaDe(texto);
        if (self.huellas.get(ruta) === huella) return;
        escritos++;
        almacen.put({ id: self.id + '\u0000' + ruta, proyecto: self.id, ruta: ruta, texto: texto });
        self.huellas.set(ruta, huella);
      });

      self.huellas.forEach(function (huella, ruta) {
        if (docs.has(ruta) || ruta.indexOf(B.CARPETA_MAPA + '/') !== 0) return;
        escritos++;
        almacen.delete(self.id + '\u0000' + ruta);
        self.huellas.delete(ruta);
      });

      tx.objectStore(PROY).put({
        id: self.id, nombre: self.nombre,
        actualizado: new Date().toISOString(), archivos: docs.size
      });

      return new Promise(function (ok, mal) {
        tx.oncomplete = function () { db.close(); ok({ escritos: escritos }); };
        tx.onerror = function () { db.close(); mal(tx.error || new Error('no se pudo guardar')); };
      });
    });
  };

  AlmacenNavegador.listar = function () {
    if (!hayNavegador()) return Promise.resolve([]);
    return abrirBase().then(function (db) {
      return pedir(db.transaction(PROY, 'readonly').objectStore(PROY).getAll())
        .then(function (filas) {
          db.close();
          return filas.sort(function (a, b) { return (b.actualizado || '') < (a.actualizado || '') ? -1 : 1; });
        });
    }).catch(function () { return []; });
  };

  AlmacenNavegador.olvidar = function (id) {
    return abrirBase().then(function (db) {
      var tx = db.transaction([DOCS, PROY], 'readwrite');
      var indice = tx.objectStore(DOCS).index('proyecto');
      return pedir(indice.getAllKeys(id)).then(function (claves) {
        claves.forEach(function (k) { tx.objectStore(DOCS).delete(k); });
        tx.objectStore(PROY).delete(id);
        return new Promise(function (ok) { tx.oncomplete = function () { db.close(); ok(); }; });
      });
    });
  };

  /* ── El zip: la copia en disco del modo navegador ───────────────────── */

  function bajarZip(docs, nombre) {
    var entradas = [];
    docs.forEach(function (doc, ruta) { entradas.push({ ruta: ruta, texto: JSON.stringify(doc, null, 1) }); });
    entradas.sort(function (a, b) { return a.ruta < b.ruta ? -1 : 1; });
    return Z.crear(entradas).then(function (blob) {
      IO.descargar(blob, 'mist-' + nombre.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() + '.zip');
      return blob;
    });
  }

  /* ── Lectura de una carpeta sin permisos de escritura ───────────────── */

  /* Un <input webkitdirectory> devuelve la lista de archivos de una carpeta sin
   * pedir permisos. Alcanza para abrir un proyecto en un navegador que no tiene
   * la File System Access API. */
  function docsDesdeArchivos(archivos) {
    var pasos = [];
    var docs = new Map();
    Array.prototype.forEach.call(archivos, function (f) {
      if (!/\.json$/i.test(f.name)) return;
      var ruta = f.webkitRelativePath || f.name;
      pasos.push(f.text().then(function (t) {
        try { docs.set(ruta, JSON.parse(t)); }
        catch (e) { throw new Error('El archivo ' + ruta + ' no es JSON válido.'); }
      }));
    });
    return Promise.all(pasos).then(function () { return sinPrefijo(docs); });
  }

  /* Un archivo único: puede ser el formato aplanado de v2 o una bóveda v1. */
  function docsDesdeJSON(texto) {
    var crudo;
    try { crudo = JSON.parse(texto); }
    catch (e) { throw new Error('El archivo no es JSON válido.'); }
    var docs = new Map();
    if (crudo && crudo.carpeta) {
      Object.keys(crudo.carpeta).forEach(function (ruta) { docs.set(ruta, crudo.carpeta[ruta]); });
      return docs;
    }
    docs.set(B.MANIFIESTO, crudo);
    return docs;
  }

  function huellaDe(texto) {
    return H.encode(H.sha256(H.bytes(texto)), 12);
  }

  /* ── Guardado ───────────────────────────────────────────────────────── */

  /* Anota que hay algo por guardar y lo escribe solo. Cada acción que cambia la
   * bóveda llama a marcar(); el resto lo maneja acá. */
  function Guardado(proyecto, almacen, alCambiar) {
    this.proyecto = proyecto;
    this.almacen = almacen;
    this.alCambiar = alCambiar || function () {};
    this.estado = 'guardado';
    this.detalle = '';
    this.temporizador = null;
    this.enVuelo = null;
    this.repetir = false;
    /* Dos marcas distintas sobre el mismo contador: hasta dónde se guardó, y
     * hasta dónde hay una copia afuera del navegador. En modo carpeta son lo
     * mismo; en modo navegador no, y esa diferencia es la que sostiene la
     * promesa de no exportar nada que después no se pueda reconstruir. */
    this.version = 0;
    this.versionGuardada = 0;
    this.versionEnDisco = almacen.enDisco ? 0 : -1;
  }

  Guardado.prototype.marcar = function (motivo) {
    this.motivo = motivo || '';
    this.version++;
    if (!this.almacen.autoguarda) {
      this.estado = 'sin guardar';
      this.alCambiar(this);
      return;
    }
    this.estado = 'pendiente';
    this.alCambiar(this);
    var self = this;
    clearTimeout(this.temporizador);
    /* Se espera un momento porque una sola acción del operador puede disparar
     * varios cambios seguidos: no tiene sentido escribir tres veces. */
    this.temporizador = setTimeout(function () { self.guardar(); }, 600);
  };

  Guardado.prototype.guardar = function () {
    var self = this;
    clearTimeout(this.temporizador);
    if (this.enVuelo) { this.repetir = true; return this.enVuelo; }

    this.estado = 'guardando';
    this.alCambiar(this);
    var version = this.version;

    var preparado = this.preparar();

    this.enVuelo = preparado
      .then(function (listos) { return self.almacen.escribir(listos); })
      .then(function (r) {
        self.enVuelo = null;
        self.estado = 'guardado';
        self.versionGuardada = version;
        if (self.almacen.enDisco) self.versionEnDisco = version;
        self.detalle = r.escritos ? r.escritos + ' archivo' + (r.escritos === 1 ? '' : 's') : 'sin cambios';
        self.alCambiar(self);
        if (self.repetir) { self.repetir = false; return self.guardar(); }
      })
      .catch(function (e) {
        self.enVuelo = null;
        self.estado = 'error';
        self.detalle = e.message;
        self.alCambiar(self);
        throw e;
      });
    return this.enVuelo;
  };

  Guardado.prototype.preparar = function () {
    var docs = B.documentos(this.proyecto);
    return this.almacen.clave
      ? B.envolver(docs, this.almacen.clave, this.almacen.sal)
      : Promise.resolve(docs);
  };

  Guardado.prototype.pendiente = function () {
    return this.estado === 'pendiente' || this.estado === 'guardando' ||
           this.estado === 'sin guardar' || this.estado === 'error';
  };

  /* ¿Hay una copia del proyecto afuera del navegador, al día? */
  Guardado.prototype.copiaEnDisco = function () {
    return this.versionEnDisco === this.version && this.estado !== 'error';
  };

  /* Baja el proyecto entero como un zip que se descomprime en la carpeta. Es lo
   * que convierte el trabajo hecho en el navegador en algo que sobrevive a que
   * se borren los datos del sitio. */
  Guardado.prototype.bajarCopia = function () {
    var self = this;
    var version = this.version;
    return this.preparar().then(function (docs) {
      return bajarZip(docs, self.proyecto.nombre);
    }).then(function (blob) {
      self.versionEnDisco = version;
      self.detalle = 'copia bajada, ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB';
      self.alCambiar(self);
      return blob;
    });
  };

  /* Un .zip bajado por MIST, o cualquier zip con la carpeta adentro. */
  function docsDesdeZIP(archivo) {
    return Z.leer(archivo).then(function (textos) {
      var crudo = new Map();
      textos.forEach(function (texto, ruta) {
        if (!/\.json$/i.test(ruta) || /(^|\/)__MACOSX\//.test(ruta)) return;
        try { crudo.set(ruta, JSON.parse(texto)); }
        catch (e) { throw new Error('El archivo ' + ruta + ' del zip no es JSON válido.'); }
      });
      return sinPrefijo(crudo);
    });
  }

  /* Descomprimir y volver a comprimir suele agregar una carpeta raíz, y el
   * input de carpetas del navegador antepone el nombre de la carpeta elegida.
   * Se descarta todo prefijo que compartan absolutamente todas las rutas. */
  function sinPrefijo(docs) {
    var rutas = Array.from(docs.keys());
    if (!rutas.length) return docs;
    var recorte = 0;
    for (;;) {
      var primera = rutas[0].split('/');
      if (primera.length - recorte < 2) break;
      var cabeza = primera[recorte];
      if (cabeza === B.CARPETA_MAPA) break;
      var todas = rutas.every(function (r) {
        var p = r.split('/');
        return p.length - recorte >= 2 && p[recorte] === cabeza;
      });
      if (!todas) break;
      recorte++;
    }
    if (!recorte) return docs;
    var salida = new Map();
    docs.forEach(function (doc, ruta) { salida.set(ruta.split('/').slice(recorte).join('/'), doc); });
    return salida;
  }

  function docsDesdeArchivo(archivo) {
    if (/\.zip$/i.test(archivo.name)) return docsDesdeZIP(archivo);
    return archivo.text().then(docsDesdeJSON);
  }

  global.MIST.almacen = {
    hayCarpetas: hayCarpetas,
    hayNavegador: hayNavegador,
    AlmacenCarpeta: AlmacenCarpeta,
    AlmacenArchivo: AlmacenArchivo,
    AlmacenNavegador: AlmacenNavegador,
    Guardado: Guardado,
    docsDesdeArchivos: docsDesdeArchivos,
    docsDesdeArchivo: docsDesdeArchivo,
    docsDesdeJSON: docsDesdeJSON,
    docsDesdeZIP: docsDesdeZIP,
    bajarZip: bajarZip,
    huellaDe: huellaDe
  };
})(window);
