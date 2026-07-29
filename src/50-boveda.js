/* MIST — la bóveda
 *
 * Un proyecto es una carpeta:
 *
 *   mi-proyecto/
 *     mist.json          manifiesto: clave maestra, tipos, perfiles de columna
 *     fusiones.json      pares confirmados y descartados
 *     mapa/
 *       persona-0.json   mapa inverso, partido en fragmentos por tipo
 *       persona-1.json
 *       empresa-0.json
 *
 * El mapa inverso tiene una entrada por valor real distinto, así que en un
 * proyecto grande es lo único que pesa. Partirlo en fragmentos sirve para dos
 * cosas: que ningún archivo sea inmanejable, y que guardar después de cada
 * acción escriba sólo el fragmento que cambió en vez de todo de nuevo.
 *
 * La bóveda contiene los valores reales al lado de su token: es tan sensible
 * como los datos originales. Puede cifrarse con una frase (AES-GCM, clave
 * derivada con PBKDF2-SHA256).
 */
(function (global) {
  'use strict';

  var H = global.MIST.hash;
  var E = global.MIST.entidades;
  var SEP = global.MIST.SEP;

  var VERSION = 2;
  var ITERACIONES = 310000;
  var MANIFIESTO = 'mist.json';
  var FUSIONES = 'fusiones.json';
  var HISTORIAL = 'historial.json';
  var CARPETA_MAPA = 'mapa';

  function hayCifrado() {
    return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.importKey);
  }

  /* Cuántos fragmentos por tipo. Crece con el proyecto para que ningún archivo
   * se vuelva gigante, y se queda corto en los proyectos chicos para no llenar
   * la carpeta de archivos de dos líneas. */
  function fragmentosPara(entidades) {
    if (entidades <= 20000) return 4;
    if (entidades <= 500000) return 32;
    return 256;
  }

  function fragmentoDe(token, cantidad) {
    var guion = token.indexOf('-');
    var c = guion >= 0 ? token.charAt(guion + 1) : token.charAt(0);
    var i = H.ALPHABET.indexOf(c);
    return (i < 0 ? 0 : i) % cantidad;
  }

  function rutaFragmento(tipoId, n) {
    return CARPETA_MAPA + '/' + tipoId + '-' + n + '.json';
  }

  /* ── Escritura ──────────────────────────────────────────────────────── */

  /* Devuelve Map<ruta, objeto>. El almacén decide cuáles escribir comparando
   * con lo que ya había. */
  function documentos(proyecto) {
    var docs = new Map();
    var inventario = proyecto.inventario();
    var fragmentos = fragmentosPara(inventario.length);

    docs.set(MANIFIESTO, {
      mist: VERSION,
      proyecto: proyecto.nombre,
      creado: proyecto.creado,
      huella: proyecto.huella(),
      claveMaestra: proyecto.claveMaestra,
      umbral: proyecto.umbral,
      fragmentos: fragmentos,
      entidades: inventario.length,
      tipos: proyecto.tipos,
      perfiles: proyecto.perfiles
    });

    docs.set(FUSIONES, {
      mist: VERSION,
      fusiones: proyecto.fusiones.pares,
      rechazos: Object.keys(proyecto.fusiones.rechazos).map(function (k) {
        return k.split('\u0001');
      })
    });

    docs.set(HISTORIAL, {
      mist: VERSION,
      entradas: proyecto.historial.map(function (e) {
        return {
          nombre: e.nombre, huella: e.huella, formato: e.formato,
          primera: e.primera, ultima: e.ultima, exportado: e.exportado,
          veces: e.veces, hojas: e.hojas
        };
      })
    });

    /* Las formas literales salen de la memoria del proyecto y no del escaneo de
     * hoy. Es lo que hace posible el camino inverso: un token sigue sabiendo a
     * qué valor real corresponde aunque la planilla que lo trajo ya no esté
     * cargada, que es la situación normal cuando alguien devuelve el resultado
     * de una consulta y hay que reconstruirlo.
     *
     * Cada forma va con la cantidad de veces que se la vio, para que al reabrir
     * el proyecto se sepa cuál es la dominante. Las bóvedas anteriores guardan
     * acá una lista de strings pelados; el lector acepta las dos formas. */
    function formasDe(id) {
      var cuenta = proyecto.formas.get(id);
      if (!cuenta || !cuenta.size) return [];
      return Array.from(cuenta.entries()).sort(function (a, b) {
        return b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
      });
    }

    /* Sólo se emiten los fragmentos con contenido. Los que quedan sin entradas
     * no se escriben vacíos: el almacén los borra, así la carpeta no se llena
     * de archivos de dos líneas. */
    var porRuta = new Map();
    function entrada(tipoId, grupo, token, total) {
      var ruta = rutaFragmento(tipoId, fragmentoDe(token, fragmentos));
      if (!porRuta.has(ruta)) porRuta.set(ruta, []);
      porRuta.get(ruta).push([grupo, token, formasDe(tipoId + SEP + grupo), total]);
    }
    inventario.forEach(function (g) { entrada(g.tipo.id, g.grupo, g.token, g.total); });
    /* Los tokens fijados que ya no aparecen en ningún archivo cargado también
     * se conservan: son los que mantienen la consistencia con lo exportado y
     * los que la reconstrucción necesita para leer un archivo viejo. */
    var vistos = new Set(inventario.map(function (g) { return g.tipo.id + SEP + g.grupo; }));
    proyecto.asignaciones.forEach(function (token, id) {
      if (vistos.has(id)) return;
      var corte = id.indexOf(SEP);
      entrada(id.slice(0, corte), id.slice(corte + 1), token, 0);
    });

    porRuta.forEach(function (entradas, ruta) {
      entradas.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
      docs.set(ruta, { mist: VERSION, entradas: entradas });
    });
    return docs;
  }

  /* ── Lectura ────────────────────────────────────────────────────────── */

  function aplicar(proyecto, docs) {
    var manifiesto = docs.get(MANIFIESTO);
    if (!manifiesto) throw new Error('La carpeta no tiene mist.json: no es un proyecto de MIST.');
    if (manifiesto.mist === 1) return aplicarV1(proyecto, manifiesto);
    if (manifiesto.mist !== VERSION) throw new Error('Versión de bóveda no soportada: ' + manifiesto.mist);

    proyecto.nombre = manifiesto.proyecto || 'proyecto';
    proyecto.creado = manifiesto.creado || new Date().toISOString();
    proyecto.claveMaestra = manifiesto.claveMaestra;
    if (typeof manifiesto.umbral === 'number') proyecto.umbral = manifiesto.umbral;
    if (Array.isArray(manifiesto.tipos) && manifiesto.tipos.length) proyecto.tipos = manifiesto.tipos;
    proyecto.perfiles = manifiesto.perfiles || Object.create(null);

    var fus = docs.get(FUSIONES) || {};
    proyecto.fusiones = new E.Fusiones();
    (fus.fusiones || []).forEach(function (p) { proyecto.fusiones.unir(p[0], p[1], p[2]); });
    (fus.rechazos || []).forEach(function (p) { proyecto.fusiones.rechazar(p[0], p[1], p[2]); });

    var hist = docs.get(HISTORIAL) || {};
    proyecto.historial = (hist.entradas || []).map(function (e) {
      return {
        nombre: e.nombre, huella: e.huella, formato: e.formato,
        primera: e.primera, ultima: e.ultima, exportado: e.exportado || null,
        veces: e.veces || 1, hojas: e.hojas || []
      };
    });

    proyecto.asignaciones = new Map();
    proyecto.formas = new Map();
    var entradas = 0;
    docs.forEach(function (doc, ruta) {
      if (ruta.indexOf(CARPETA_MAPA + '/') !== 0 || !doc || !doc.entradas) return;
      var tipoId = ruta.slice(CARPETA_MAPA.length + 1).replace(/-\d+\.json$/, '');
      doc.entradas.forEach(function (e) {
        var id = tipoId + SEP + e[0];
        proyecto.asignaciones.set(id, e[1]);
        /* Sin esto el proyecto abre sabiendo qué token le toca a cada grupo
         * pero no cómo estaba escrito, y la reconstrucción no tendría con qué
         * responder. Una bóveda vieja trae strings pelados en vez de pares. */
        var cuenta = new Map();
        (e[2] || []).forEach(function (f) {
          if (Array.isArray(f)) cuenta.set(f[0], f[1] || 1);
          else cuenta.set(f, 1);
        });
        if (cuenta.size) proyecto.formas.set(id, cuenta);
        entradas++;
      });
    });

    return {
      nombre: proyecto.nombre,
      fusiones: (fus.fusiones || []).length,
      asignaciones: entradas,
      archivos: proyecto.historial.length,
      creado: proyecto.creado
    };
  }

  /* Las bóvedas de la primera versión eran un único JSON. Se siguen abriendo;
   * al guardar, el proyecto queda en formato carpeta. */
  function aplicarV1(proyecto, datos) {
    proyecto.formas = new Map();
    proyecto.nombre = 'proyecto importado';
    proyecto.creado = datos.creado || new Date().toISOString();
    proyecto.claveMaestra = datos.claveMaestra;
    if (typeof datos.umbral === 'number') proyecto.umbral = datos.umbral;
    if (Array.isArray(datos.tipos) && datos.tipos.length) proyecto.tipos = datos.tipos;
    proyecto.perfiles = datos.perfiles || Object.create(null);
    proyecto.fusiones = new E.Fusiones();
    (datos.fusiones || []).forEach(function (p) { proyecto.fusiones.unir(p[0], p[1], p[2]); });
    (datos.rechazos || []).forEach(function (p) { proyecto.fusiones.rechazar(p[0], p[1], p[2]); });
    proyecto.asignaciones = new Map();
    (datos.asignaciones || []).forEach(function (a) {
      proyecto.asignaciones.set(a[0] + SEP + a[1], a[2]);
    });
    (datos.mapa || []).forEach(function (m) {
      var id = m.tipo + SEP + m.grupo;
      if (!proyecto.asignaciones.has(id)) proyecto.asignaciones.set(id, m.token);
    });
    return {
      nombre: proyecto.nombre,
      fusiones: (datos.fusiones || []).length,
      asignaciones: proyecto.asignaciones.size,
      creado: proyecto.creado
    };
  }

  /* ── Cifrado ────────────────────────────────────────────────────────── */

  function derivar(frase, sal) {
    return crypto.subtle.importKey('raw', H.bytes(frase), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: sal, iterations: ITERACIONES, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function salNueva() {
    return H.toBase64(crypto.getRandomValues(new Uint8Array(16)));
  }

  function cifrar(clave, objeto) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, clave, H.bytes(JSON.stringify(objeto)))
      .then(function (c) {
        return { iv: H.toBase64(iv), datos: H.toBase64(new Uint8Array(c)) };
      });
  }

  function descifrar(clave, sobre) {
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: H.fromBase64(sobre.iv) }, clave, H.fromBase64(sobre.datos))
      .then(function (plano) { return JSON.parse(new TextDecoder().decode(plano)); })
      .catch(function () {
        throw new Error('No se pudo abrir la bóveda: la frase no coincide o el archivo está dañado.');
      });
  }

  /* En una carpeta cifrada, el manifiesto conserva en claro lo mínimo para
   * saber qué es y cómo abrirlo: versión, nombre, huella y la sal del KDF. */
  function envolver(docs, clave, sal) {
    var salida = new Map();
    var manifiesto = docs.get(MANIFIESTO);
    var pasos = [];
    docs.forEach(function (doc, ruta) {
      pasos.push(cifrar(clave, doc).then(function (sobre) {
        if (ruta === MANIFIESTO) {
          salida.set(ruta, {
            mist: VERSION,
            cifrado: 'AES-GCM',
            kdf: { nombre: 'PBKDF2-SHA256', iteraciones: ITERACIONES, sal: sal },
            proyecto: manifiesto.proyecto,
            huella: manifiesto.huella,
            creado: manifiesto.creado,
            iv: sobre.iv, datos: sobre.datos
          });
        } else {
          salida.set(ruta, { mist: VERSION, cifrado: 'AES-GCM', iv: sobre.iv, datos: sobre.datos });
        }
      }));
    });
    return Promise.all(pasos).then(function () { return salida; });
  }

  function desenvolver(docs, clave) {
    var salida = new Map();
    var pasos = [];
    docs.forEach(function (doc, ruta) {
      if (!doc || !doc.cifrado) { salida.set(ruta, doc); return; }
      pasos.push(descifrar(clave, doc).then(function (plano) { salida.set(ruta, plano); }));
    });
    return Promise.all(pasos).then(function () { return salida; });
  }

  function estaCifrado(docs) {
    var m = docs.get(MANIFIESTO);
    return !!(m && m.cifrado);
  }

  function salDe(docs) {
    var m = docs.get(MANIFIESTO);
    return m && m.kdf && m.kdf.sal;
  }

  /* ── Mapa inverso para auditoría ────────────────────────────────────── */

  /* El mapa inverso completo, en CSV: es la versión a mano de la pestaña
   * Reconstruir. Incluye los grupos que hoy no están en ninguna planilla
   * cargada, porque son justamente los que alguien puede necesitar buscar. */
  function filasDelMapa(proyecto) {
    var filas = [['tipo', 'token', 'apariciones', 'formas_originales', 'columnas']];
    var etiquetas = Object.create(null);
    proyecto.tipos.forEach(function (t) { etiquetas[t.id] = t.etiqueta; });
    var vistos = new Set();
    proyecto.inventario().forEach(function (g) {
      vistos.add(g.tipo.id + SEP + g.grupo);
      filas.push([
        g.tipo.etiqueta,
        g.token,
        g.total,
        proyecto.formasDe(g.tipo.id + SEP + g.grupo).join(' | '),
        Array.from(g.columnas).join(' | ')
      ]);
    });
    proyecto.asignaciones.forEach(function (token, id) {
      if (vistos.has(id)) return;
      var tipoId = id.slice(0, id.indexOf(SEP));
      filas.push([etiquetas[tipoId] || tipoId, token, 0, proyecto.formasDe(id).join(' | '), '']);
    });
    return filas;
  }

  global.MIST.boveda = {
    documentos: documentos,
    aplicar: aplicar,
    derivar: derivar,
    salNueva: salNueva,
    envolver: envolver,
    desenvolver: desenvolver,
    estaCifrado: estaCifrado,
    salDe: salDe,
    hayCifrado: hayCifrado,
    filasDelMapa: filasDelMapa,
    fragmentosPara: fragmentosPara,
    MANIFIESTO: MANIFIESTO,
    FUSIONES: FUSIONES,
    HISTORIAL: HISTORIAL,
    CARPETA_MAPA: CARPETA_MAPA,
    VERSION: VERSION
  };
})(window);
