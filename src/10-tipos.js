/* MIST — tipos semánticos y normalización
 *
 * El tipo de una columna hace dos cosas:
 *   1. define el prefijo del token (persona-…, cuit-…),
 *   2. actúa como espacio de nombres: el mismo texto en una columna "empresa"
 *      y en una columna "persona" son entidades distintas; la misma persona en
 *      "cliente" y en "vendedor" es la misma entidad y recibe el mismo token.
 *
 * El normalizador define qué significa "es el mismo dato". Para nombres ordena
 * los tokens alfabéticamente, así "Pérez, Joaquín" y "Joaquín Pérez" colapsan
 * solos, sin intervención del operador.
 */
(function (global) {
  'use strict';

  function sinTildes(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function base(s) {
    return sinTildes(String(s == null ? '' : s))
      .toLowerCase()
      .replace(/[‘’“”]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  var TRATAMIENTOS = /^(sr|sra|srta|don|dona|dr|dra|ing|lic|cr|cra|arq|prof|mr|mrs|ms)\.?$/;
  var SUFIJOS_LEGALES = /^(sa|sas|srl|sh|saic|sacif|sca|ltda|ltd|llc|inc|corp|cia|spa|plc|gmbh|bv|nv|ag|pty|sl|slu)$/;

  /* Los puntos se borran en vez de convertirse en espacio, para que "S.R.L."
   * quede "srl" y "J." quede "j". El resto de la puntuación sí separa palabras:
   * "Pérez, Joaquín" tiene que dar dos tokens. */
  function palabras(v, extra) {
    return base(v).replace(/\./g, '').replace(extra || /[,;:()"'`]/g, ' ').split(/\s+/);
  }

  var NORMALIZADORES = {
    /* Nombres de persona: sin tildes, sin puntuación, sin tratamientos, con los
     * tokens ordenados. El orden de nombre y apellido deja de importar. */
    nombre: function (v) {
      return palabras(v).filter(function (t) {
        return t && !TRATAMIENTOS.test(t);
      }).sort().join(' ');
    },
    /* Igual que nombre, pero además descarta la forma jurídica: "Acme SRL" y
     * "ACME S.R.L." son la misma empresa. */
    organizacion: function (v) {
      return palabras(v, /[,;:()"'`&]/g).filter(function (t) {
        return t && !SUFIJOS_LEGALES.test(t);
      }).sort().join(' ');
    },
    email: function (v) {
      return base(v).replace(/[<>\s]/g, '');
    },
    /* Sólo dígitos: 30-71234567-9, 30712345679 y "CUIT 30 71234567 9" colapsan. */
    numerico: function (v) {
      return String(v == null ? '' : v).replace(/\D+/g, '');
    },
    /* Alfanumérico en mayúsculas: patentes, legajos, códigos. */
    identidad: function (v) {
      return sinTildes(String(v == null ? '' : v)).toUpperCase().replace(/[^A-Z0-9]+/g, '');
    },
    exacto: function (v) { return base(v); },
    texto: function (v) { return base(v).replace(/[.,;:()"'`]/g, ''); }
  };

  var ETIQUETAS_NORMALIZADOR = {
    nombre: 'Nombre de persona (ignora el orden de las palabras)',
    organizacion: 'Organización (ignora el orden y la forma jurídica)',
    email: 'Email',
    numerico: 'Sólo dígitos',
    identidad: 'Alfanumérico en mayúsculas',
    exacto: 'Texto exacto',
    texto: 'Texto sin puntuación'
  };

  /* Buscar parecidos tiene sentido cuando el dato lo escribe una persona y se
   * puede equivocar. Sobre un número o un código sólo produce falsos positivos:
   * dos documentos que difieren en un dígito son dos personas distintas, no una
   * errata. Por eso el normalizador alcanza para decidirlo y no hace falta
   * preguntárselo al operador cuando crea un tipo propio. */
  var FUZZY_POR_NORM = {
    nombre: true, organizacion: true, email: true, texto: true,
    numerico: false, identidad: false, exacto: false
  };

  /* Catálogo por defecto. Cubre lo habitual; lo que falte, el operador lo crea
   * con crearTipo(). No hay un tipo "otro" a propósito: el tipo es el espacio de
   * nombres del token, así que meter en una misma bolsa dos datos que no tienen
   * nada que ver haría que el mismo texto en dos columnas distintas terminara
   * siendo la misma entidad. Un tipo de más no cuesta nada; uno mezclado sí. */
  var TIPOS = [
    { id: 'persona',   etiqueta: 'Persona',       prefijo: 'persona',  norm: 'nombre',       fuzzy: true,  largo: 8 },
    { id: 'empresa',   etiqueta: 'Empresa',       prefijo: 'empresa',  norm: 'organizacion', fuzzy: true,  largo: 8 },
    { id: 'email',     etiqueta: 'Email',         prefijo: 'email',    norm: 'email',        fuzzy: true,  largo: 8 },
    { id: 'telefono',  etiqueta: 'Teléfono',      prefijo: 'tel',      norm: 'numerico',     fuzzy: false, largo: 8 },
    { id: 'dni',       etiqueta: 'Documento',     prefijo: 'dni',      norm: 'numerico',     fuzzy: false, largo: 8 },
    { id: 'cuit',      etiqueta: 'CUIT / CUIL',   prefijo: 'cuit',     norm: 'numerico',     fuzzy: false, largo: 8 },
    { id: 'direccion', etiqueta: 'Dirección',     prefijo: 'dir',      norm: 'texto',        fuzzy: true,  largo: 8 },
    { id: 'localidad', etiqueta: 'Localidad',     prefijo: 'loc',      norm: 'nombre',       fuzzy: true,  largo: 6 },
    { id: 'cuenta',    etiqueta: 'Cuenta / CBU',  prefijo: 'cuenta',   norm: 'numerico',     fuzzy: false, largo: 8 },
    { id: 'usuario',   etiqueta: 'Usuario',       prefijo: 'usuario',  norm: 'exacto',       fuzzy: false, largo: 8 },
    { id: 'id',        etiqueta: 'Identificador', prefijo: 'id',       norm: 'identidad',    fuzzy: false, largo: 8 },
    { id: 'patente',   etiqueta: 'Patente',       prefijo: 'patente',  norm: 'identidad',    fuzzy: false, largo: 8 },
    { id: 'ip',        etiqueta: 'IP',            prefijo: 'ip',       norm: 'exacto',       fuzzy: false, largo: 8 },
    { id: 'url',       etiqueta: 'URL',           prefijo: 'url',      norm: 'exacto',       fuzzy: false, largo: 8 }
  ];

  /* ── Tipos propios ──────────────────────────────────────────────────────
   *
   * Cada organismo tiene datos que sólo existen ahí: número de expediente, de
   * historia clínica, de beneficio, de trámite. Crear un tipo es declarar tres
   * cosas: cómo se llama, con qué prefijo empiezan sus tokens y qué significa
   * "es el mismo dato" para él.
   *
   * El id es el espacio de nombres del token y también el nombre del archivo
   * del mapa dentro de la bóveda, así que se limita a minúsculas, dígitos y
   * guiones. Una vez creado no se toca más: cambiarlo sería inventar un tipo
   * nuevo y dejar huérfanos los tokens ya acuñados. */
  function identificador(texto) {
    return sinTildes(String(texto == null ? '' : texto)).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  }

  /* El prefijo va antes del guion del token, así que no puede tener uno propio:
   * la bóveda parte el token por el primer guion para elegir el fragmento.
   *
   * Cuando sale de un nombre, se descartan las palabras que no dicen nada
   * ("N° de expediente" → expediente) y si aun así no entra se usa sólo la
   * primera, que es más legible que un recorte a la mitad de la segunda
   * ("Historia clínica" → historia, no historiaclin). */
  var PALABRAS_VACIAS = /^(de|del|la|el|los|las|un|una|y|para|por|con|nro|num|numero|no|n)$/;
  var LARGO_PREFIJO = 12;

  function prefijoDe(texto) {
    var limpio = sinTildes(String(texto == null ? '' : texto)).toLowerCase();
    var palabras = limpio.split(/[^a-z0-9]+/).filter(function (p) {
      return p && !PALABRAS_VACIAS.test(p);
    });
    if (!palabras.length) return limpio.replace(/[^a-z0-9]+/g, '').slice(0, LARGO_PREFIJO);
    var junto = palabras.join('');
    return junto.length <= LARGO_PREFIJO ? junto : palabras[0].slice(0, LARGO_PREFIJO);
  }

  function normalizarEtiqueta(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  /* Arma un tipo propio validado contra los que ya existen. Tira Error con un
   * mensaje para mostrarle al operador. `existentes` es la lista del proyecto,
   * no el catálogo: dos proyectos pueden tener tipos propios distintos. */
  function crearTipo(datos, existentes) {
    var lista = existentes || [];
    var etiqueta = normalizarEtiqueta(datos.etiqueta);
    if (!etiqueta) throw new Error('El tipo necesita un nombre.');

    var repetida = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === datos.id) continue;
      if (base(lista[i].etiqueta) === base(etiqueta)) repetida = lista[i];
    }
    if (repetida) throw new Error('Ya hay un tipo que se llama "' + repetida.etiqueta + '".');

    var prefijo = prefijoDe(datos.prefijo || etiqueta);
    if (!prefijo) throw new Error('El prefijo tiene que tener al menos una letra o un número.');
    for (i = 0; i < lista.length; i++) {
      if (lista[i].id === datos.id) continue;
      if (lista[i].prefijo === prefijo) {
        throw new Error('El prefijo "' + prefijo + '" ya lo usa "' + lista[i].etiqueta +
          '". Elegí otro: es lo que permite distinguir de un vistazo de qué tipo es cada token.');
      }
    }

    /* hasOwnProperty y no NORMALIZADORES[norm] a secas: "constructor" o
     * "toString" darían una función heredada que no normaliza nada. */
    var norm = Object.prototype.hasOwnProperty.call(NORMALIZADORES, datos.norm)
      ? datos.norm : 'exacto';

    /* El id se deriva del nombre, pero dos nombres distintos pueden dar el
     * mismo ("N° de trámite" y "Nº de trámite"), así que se desempata. */
    var id = datos.id || identificador(etiqueta) || prefijo;
    if (!datos.id) {
      var usados = Object.create(null);
      for (i = 0; i < lista.length; i++) usados[lista[i].id] = true;
      var libre = id, n = 2;
      while (usados[libre]) libre = id + '-' + (n++);
      id = libre;
    }

    return {
      id: id, etiqueta: etiqueta, prefijo: prefijo, norm: norm,
      fuzzy: !!FUZZY_POR_NORM[norm], largo: 8, propio: true
    };
  }

  /* Sugerencia por nombre de encabezado. Primera coincidencia gana, así que el
   * orden importa: "razon social" antes que "nombre". */
  var PISTAS_ENCABEZADO = [
    [/raz[oó]n\s*social|empresa|compa[nñ]|organizaci|proveedor|comercio/i, 'empresa'],
    [/e\s?mail|correo/i, 'email'],
    [/cuit|cuil/i, 'cuit'],
    [/\bdni\b|documento|\bdoc\b|\bnif\b|\bnie\b|\brut\b|\bcurp\b|\bssn\b/i, 'dni'],
    [/tel[eé]fono|\btel\b|celular|\bcel\b|m[oó]vil|whatsapp|phone/i, 'telefono'],
    [/direcci[oó]n|domicilio|calle|address/i, 'direccion'],
    [/localidad|ciudad|partido|municipio|barrio|provincia|city/i, 'localidad'],
    [/\bcbu\b|\bcvu\b|cuenta|iban|tarjeta/i, 'cuenta'],
    [/usuario|username|\buser\b|login|alias|apodo/i, 'usuario'],
    [/patente|dominio\s?veh|matr[ií]cula/i, 'patente'],
    [/\bip\b|direcci[oó]n\s?ip/i, 'ip'],
    [/\burl\b|sitio|web|link/i, 'url'],
    [/nombre|apellido|titular|responsable|contacto|paciente|alumno|empleado|vendedor|asesor|firma|reclamante|solicitante|beneficiario|denunciante|remitente|destinatario/i, 'persona'],
    [/legajo|\bid\b|c[oó]digo|n[uú]mero\s?cliente/i, 'id']
  ];

  /* Una fecha se parece demasiado a un teléfono: "2026-03-02" son dígitos y
   * guiones igual que "11-4555-2211". Se descartan antes de mirar cualquier
   * otra pista de contenido. */
  var FECHAS = [
    /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/,
    /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/
  ];

  /* Un nombre propio son dos a cuatro palabras, todas con mayúscula salvo las
   * partículas ("de la Cruz"). Sin esa exigencia, cualquier frase de una
   * columna de observaciones pasaría por persona y la herramienta terminaría
   * seudonimizando oraciones enteras. */
  var MAY = 'A-ZÁÉÍÓÚÜÑ';
  var LET = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ'";
  var PARTICULA = '(?:de|del|la|las|los|y|da|das|do|dos|di|van|von|le|el|san|santa)';
  var RE_PERSONA = new RegExp(
    '^[' + MAY + '][' + LET + ']*[.,]?(?:\\s+(?:[' + MAY + '][' + LET + ']*\\.?|' + PARTICULA + ')){1,3}$');

  var PISTAS_CONTENIDO = [
    [/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, 'email'],
    [/^(20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d$/, 'cuit'],
    [/^https?:\/\//i, 'url'],
    [/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'ip'],
    [/^\+?\d[\d\s().-]{7,17}$/, 'telefono'],
    [/^\d{7,8}$/, 'dni'],
    [RE_PERSONA, 'persona']
  ];

  function pareceFecha(v) {
    for (var i = 0; i < FECHAS.length; i++) if (FECHAS[i].test(v)) return true;
    return false;
  }

  /* Devuelve {accion, tipo} sugerido para una columna, mirando primero el
   * encabezado y después una muestra de valores. Nunca decide sola: sólo
   * precarga los selectores para que el operador confirme o corrija. */
  function sugerir(encabezado, muestra) {
    /* Los separadores pasan a espacios para que \b funcione: en "cliente_id" el
     * guion bajo es carácter de palabra y taparía el límite. */
    var h = sinTildes(encabezado || '').replace(/[_.\-/]+/g, ' ');
    for (var i = 0; i < PISTAS_ENCABEZADO.length; i++) {
      if (PISTAS_ENCABEZADO[i][0].test(h)) {
        return { accion: 'seudonimo', tipo: PISTAS_ENCABEZADO[i][1], origen: 'encabezado' };
      }
    }
    var limpias = (muestra || []).map(function (v) { return String(v == null ? '' : v).trim(); })
      .filter(function (v) { return v.length; }).slice(0, 40);
    if (limpias.length >= 3) {
      var fechas = 0;
      for (var f = 0; f < limpias.length; f++) if (pareceFecha(limpias[f])) fechas++;
      if (fechas / limpias.length >= 0.8) return { accion: 'conservar', tipo: null, origen: null };
      for (var p = 0; p < PISTAS_CONTENIDO.length; p++) {
        var re = PISTAS_CONTENIDO[p][0];
        var aciertos = 0;
        for (var j = 0; j < limpias.length; j++) if (re.test(limpias[j])) aciertos++;
        if (aciertos / limpias.length >= 0.8) {
          return { accion: 'seudonimo', tipo: PISTAS_CONTENIDO[p][1], origen: 'contenido' };
        }
      }
    }
    return { accion: 'conservar', tipo: null, origen: null };
  }

  /* Clave con la que se recuerda la configuración de una columna para aplicarla
   * automáticamente al mismo encabezado en otro archivo. */
  function claveEncabezado(encabezado) {
    return NORMALIZADORES.texto(encabezado).replace(/[\s_-]+/g, '');
  }

  /* Encabezados que son un pedazo de un nombre y no un nombre entero. Cuando en
   * una hoja aparece al menos uno de cada lado, las columnas se componen solas:
   * "Joaquín" en `nombre` y "Pérez" en `apellido` son una persona, no dos. */
  var PARTES_NOMBRE = {
    pila: /^(nombres?|primer\s*nombre|segundo\s*nombre|nombre\s*de\s*pila|first\s*names?|middle\s*names?|given\s*names?)$/i,
    familia: /^(apellidos?|apellido\s*paterno|apellido\s*materno|last\s*names?|surnames?|family\s*names?)$/i
  };

  function parteDeNombre(encabezado) {
    var h = sinTildes(encabezado || '').replace(/[_.\-/]+/g, ' ').trim();
    if (PARTES_NOMBRE.pila.test(h)) return 'pila';
    if (PARTES_NOMBRE.familia.test(h)) return 'familia';
    return null;
  }

  global.MIST = global.MIST || {};
  global.MIST.tipos = {
    NORMALIZADORES: NORMALIZADORES,
    ETIQUETAS_NORMALIZADOR: ETIQUETAS_NORMALIZADOR,
    FUZZY_POR_NORM: FUZZY_POR_NORM,
    TIPOS: TIPOS,
    crearTipo: crearTipo,
    identificador: identificador,
    prefijoDe: prefijoDe,
    sugerir: sugerir,
    claveEncabezado: claveEncabezado,
    parteDeNombre: parteDeNombre,
    sinTildes: sinTildes,
    base: base
  };
})(window);
