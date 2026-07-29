/* MIST — el motor
 *
 * Un proyecto es: una clave maestra, un conjunto de archivos con sus columnas
 * clasificadas, y las fusiones que el operador confirmó. De ahí sale todo lo
 * demás de forma determinista.
 *
 * Ciclo: cargar → clasificar columnas → escanear → revisar entidades →
 * fusionar → exportar. Escanear es idempotente y barato, así que se rehace
 * cada vez que cambia una clasificación.
 */
(function (global) {
  'use strict';

  var H = global.MIST.hash;
  var T = global.MIST.tipos;
  var E = global.MIST.entidades;
  var IO = global.MIST.io;

  var ACCIONES = {
    conservar: 'Conservar',
    seudonimo: 'Seudonimizar',
    escanear: 'Buscar dentro del texto',
    vaciar: 'Vaciar'
  };

  var SEP = '\u0000';

  function Proyecto() {
    this.nombre = 'proyecto';
    this.creado = new Date().toISOString();
    this.claveMaestra = H.randomKey();
    this.tipos = T.TIPOS.map(function (t) { return Object.assign({}, t); });
    this.archivos = [];
    this.perfiles = Object.create(null);
    this.registro = new E.Registro();
    this.fusiones = new E.Fusiones();
    this.asignaciones = new Map();   // tipo\0grupo → token (lo que fija la bóveda)
    this.grupoDe = new Map();        // tipo\0clave → grupo
    this.tokenDeGrupo = new Map();   // tipo\0grupo → token
    this.formas = new Map();         // tipo\0grupo → Map(forma literal → veces)
    this.umbral = 0.85;
    this.largoMinimoTexto = 4;
    this.avisos = [];
    this.secuencia = 0;
    this.historial = [];
  }

  Proyecto.prototype.claveBytes = function () {
    return H.fromBase64(this.claveMaestra);
  };

  Proyecto.prototype.huella = function () {
    return H.fingerprint(this.claveMaestra);
  };

  Proyecto.prototype.tipoPorId = function (id) {
    for (var i = 0; i < this.tipos.length; i++) if (this.tipos[i].id === id) return this.tipos[i];
    return null;
  };

  /* ── Tipos propios ──────────────────────────────────────────────────── */

  Proyecto.prototype.agregarTipo = function (datos) {
    var tipo = T.crearTipo(datos, this.tipos);
    this.tipos.push(tipo);
    return tipo;
  };

  /* Qué depende de un tipo. Mientras no haya acuñado ningún token se puede
   * corregir entero o borrar; después el prefijo y el normalizador quedan
   * fijos, porque cambiarlos les cambiaría el token a entidades que quizá ya
   * viajaron en una planilla exportada. El nombre, en cambio, es sólo una
   * etiqueta de pantalla: se puede arreglar siempre. */
  Proyecto.prototype.usoDeTipo = function (id) {
    var columnas = 0;
    this.archivos.forEach(function (a) {
      a.hojas.forEach(function (h) {
        h.columnas.forEach(function (c) {
          if (c.tipo === id && c.accion === 'seudonimo') columnas++;
        });
      });
    });
    var perfiles = 0;
    for (var clave in this.perfiles) if (this.perfiles[clave].tipo === id) perfiles++;
    var tokens = 0;
    this.asignaciones.forEach(function (t, k) {
      if (k.slice(0, k.indexOf(SEP)) === id) tokens++;
    });
    var mapa = this.registro.porTipo[id];
    return {
      columnas: columnas, perfiles: perfiles, tokens: tokens,
      entidades: mapa ? mapa.size : 0,
      congelado: tokens > 0 || (mapa ? mapa.size : 0) > 0
    };
  };

  Proyecto.prototype.editarTipo = function (id, datos) {
    var tipo = this.tipoPorId(id);
    if (!tipo) throw new Error('Ese tipo ya no existe.');
    var uso = this.usoDeTipo(id);
    var nuevo = T.crearTipo({
      id: id,
      etiqueta: datos.etiqueta,
      prefijo: uso.congelado ? tipo.prefijo : datos.prefijo,
      norm: uso.congelado ? tipo.norm : datos.norm
    }, this.tipos);
    tipo.etiqueta = nuevo.etiqueta;
    tipo.prefijo = nuevo.prefijo;
    tipo.norm = nuevo.norm;
    tipo.fuzzy = nuevo.fuzzy;
    return tipo;
  };

  /* Sólo se borra un tipo que no dejó rastro: si ya acuñó un token, ese token
   * puede estar hoy en una planilla que salió de acá y su valor real vive en la
   * bóveda bajo este id. */
  Proyecto.prototype.quitarTipo = function (id) {
    var uso = this.usoDeTipo(id);
    if (uso.columnas || uso.congelado) {
      throw new Error('No se puede borrar: el tipo está en uso.');
    }
    this.tipos = this.tipos.filter(function (t) { return t.id !== id; });
    for (var clave in this.perfiles) {
      if (this.perfiles[clave].tipo === id) delete this.perfiles[clave];
    }
    return true;
  };

  /* ── Carga ──────────────────────────────────────────────────────────── */

  Proyecto.prototype.agregarArchivo = function (datos) {
    var self = this;
    var archivo = {
      id: 'a' + (++this.secuencia),
      nombre: datos.nombre,
      formato: datos.formato,
      huella: datos.huella || null,
      delimitador: datos.delimitador,
      hojas: []
    };
    datos.hojas.forEach(function (h, i) {
      var hoja = {
        id: archivo.id + 'h' + i,
        nombre: h.nombre,
        filas: h.filas,
        encabezado: true,
        columnas: []
      };
      hoja.columnas = self.columnasDe(hoja);
      archivo.hojas.push(hoja);
    });
    this.archivos.push(archivo);
    archivo.estado = this.anotarEnHistorial(archivo);
    return archivo;
  };

  /* ── Historial ──────────────────────────────────────────────────────── */

  /* El proyecto recuerda qué archivos pasaron por él. No guarda su contenido ni
   * dónde estaban: sólo el nombre, una huella para reconocerlos y qué se hizo.
   * Alcanza para responder las dos preguntas que un operador se hace cuando
   * llega una tanda nueva: ¿este ya lo procesé? ¿este cambió? */
  Proyecto.prototype.anotarEnHistorial = function (archivo) {
    var ahora = new Date().toISOString();
    var porHuella = null, porNombre = null;
    for (var i = 0; i < this.historial.length; i++) {
      var e = this.historial[i];
      if (archivo.huella && e.huella === archivo.huella) { porHuella = e; break; }
      if (e.nombre === archivo.nombre) porNombre = e;
    }

    var entrada = porHuella || porNombre;
    var estado = porHuella ? 'repetido' : (porNombre ? 'cambiado' : 'nuevo');

    if (!entrada) {
      entrada = { nombre: archivo.nombre, huella: archivo.huella, formato: archivo.formato,
                  primera: ahora, exportado: null, veces: 0, hojas: [] };
      this.historial.push(entrada);
    }
    /* Si cambió el contenido, la entrada pasa a describir la versión nueva pero
     * conserva desde cuándo ese nombre está en el proyecto. */
    entrada.huella = archivo.huella;
    entrada.ultima = ahora;
    entrada.veces++;
    entrada.hojas = archivo.hojas.map(function (h) {
      return { nombre: h.nombre, filas: h.filas.length - (h.encabezado ? 1 : 0), columnas: h.columnas.length };
    });
    if (estado === 'cambiado') entrada.exportado = null;
    entrada.estado = estado;
    return { estado: estado, entrada: entrada };
  };

  Proyecto.prototype.marcarExportado = function (archivo) {
    var ahora = new Date().toISOString();
    for (var i = 0; i < this.historial.length; i++) {
      if (this.historial[i].huella === archivo.huella || this.historial[i].nombre === archivo.nombre) {
        this.historial[i].exportado = ahora;
        return;
      }
    }
  };

  /* Reconstruye la lista de columnas de una hoja. Se llama al cargar y cada vez
   * que el operador cambia si la primera fila es encabezado. */
  Proyecto.prototype.columnasDe = function (hoja) {
    var previas = hoja.columnas || [];
    var ancho = 0;
    hoja.filas.forEach(function (f) { if (f.length > ancho) ancho = f.length; });
    var desde = hoja.encabezado ? 1 : 0;
    var cols = [];
    for (var c = 0; c < ancho; c++) {
      var nombre = hoja.encabezado ? IO.texto(hoja.filas[0][c]).trim() : '';
      var generado = !nombre;
      if (!nombre) nombre = 'Columna ' + (c + 1);
      var muestra = [];
      for (var r = desde; r < hoja.filas.length && muestra.length < 60; r++) {
        var v = IO.texto(hoja.filas[r][c]).trim();
        if (v) muestra.push(v);
      }
      var distintos = new Set(muestra).size;
      var perfil = this.perfiles[T.claveEncabezado(nombre)];
      var previa = previas[c] && previas[c].tocada ? previas[c] : null;
      /* La sugerencia se guarda aunque el operador elija otra cosa: sirve para
       * avisarle después que dejó pasar en claro una columna que parece
       * sensible. */
      var sugerido = T.sugerir(nombre, muestra);
      var eleccion = previa
        ? { accion: previa.accion, tipo: previa.tipo, origen: 'operador' }
        : (perfil ? { accion: perfil.accion, tipo: perfil.tipo, origen: 'perfil' }
                  : sugerido);
      if (eleccion.tipo && !this.tipoPorId(eleccion.tipo)) eleccion = { accion: 'conservar', tipo: null };
      cols.push({
        indice: c,
        nombre: nombre,
        muestra: muestra.slice(0, 5),
        vacias: hoja.filas.length - desde - muestra.length,
        distintos: distintos,
        accion: eleccion.accion,
        tipo: eleccion.tipo,
        origen: eleccion.origen,
        sugerido: sugerido.tipo,
        campo: previa ? previa.campo : (perfil ? perfil.campo || null : null),
        generado: generado,
        tocada: !!previa
      });
    }
    autocomponer(cols);
    return cols;
  };

  /* Si la hoja trae el nombre partido en columnas ("nombre" y "apellido"), se
   * componen solas en un único dato. Sin esto, "Joaquín" y "Pérez" quedarían
   * como dos personas distintas y ninguna coincidiría con el "Joaquín Pérez" de
   * otra planilla. Sólo actúa si el operador no tocó nada. */
  function autocomponer(cols) {
    var partes = [];
    var hayPila = false, hayFamilia = false;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].tocada || cols[i].campo) return;
      var p = T.parteDeNombre(cols[i].nombre);
      if (!p) continue;
      partes.push(cols[i]);
      if (p === 'pila') hayPila = true;
      if (p === 'familia') hayFamilia = true;
    }
    if (!hayPila || !hayFamilia || partes.length < 2) return;
    var campo = partes.map(function (c) { return T.claveEncabezado(c.nombre); }).sort().join('+');
    partes.forEach(function (c) {
      c.accion = 'seudonimo';
      c.tipo = 'persona';
      c.campo = campo;
      c.origen = 'compuesto';
    });
  }

  /* Las unidades son lo que MIST trata como un dato: una columna suelta, o
   * varias columnas que el operador declaró como partes de lo mismo. */
  Proyecto.prototype.unidades = function (hoja) {
    var sueltas = [];
    var porCampo = new Map();
    hoja.columnas.forEach(function (col) {
      if (col.accion !== 'seudonimo' || !col.tipo) return;
      if (!col.campo) { sueltas.push({ tipo: col.tipo, campo: null, columnas: [col] }); return; }
      var id = col.tipo + SEP + col.campo;
      if (!porCampo.has(id)) porCampo.set(id, { tipo: col.tipo, campo: col.campo, columnas: [] });
      porCampo.get(id).columnas.push(col);
    });
    porCampo.forEach(function (u) {
      u.columnas.sort(function (a, b) { return a.indice - b.indice; });
      sueltas.push(u);
    });
    return sueltas;
  };

  /* El valor de una unidad en una fila. Las partes se unen con un espacio; para
   * los nombres el orden da igual porque el normalizador ordena las palabras,
   * así que una planilla con "apellido, nombre" y otra con "nombre, apellido"
   * llegan a la misma entidad. */
  function valorDeUnidad(unidad, fila) {
    var partes = [];
    for (var i = 0; i < unidad.columnas.length; i++) {
      var v = IO.texto(fila[unidad.columnas[i].indice]).trim();
      if (v) partes.push(v);
    }
    return partes.join(' ');
  }

  Proyecto.prototype.etiquetaUnidad = function (unidad) {
    return unidad.columnas.map(function (c) { return c.nombre; }).join(' + ');
  };

  /* Declara que dos columnas son partes del mismo dato. El identificador del
   * campo son los encabezados de sus partes ordenados alfabéticamente, así que
   * otro archivo con las mismas columnas las compone solo. */
  Proyecto.prototype.componer = function (hoja, indice, indiceObjetivo) {
    var col = hoja.columnas[indice];
    if (indiceObjetivo === null || indiceObjetivo === undefined || indiceObjetivo === '') {
      var campo = col.campo;
      col.campo = null;
      col.tocada = true;
      this.recordarColumna(col, true);
      var sueltas = this.propagarColumna(hoja, col);
      if (campo) sueltas += this.reagruparCampo(hoja, campo);
      return sueltas;
    }
    var otra = hoja.columnas[indiceObjetivo];
    var miembros = new Set();
    [col, otra].forEach(function (c) {
      if (c.campo) c.campo.split('+').forEach(function (k) { miembros.add(k); });
      else miembros.add(T.claveEncabezado(c.nombre));
    });
    var nuevo = Array.from(miembros).sort().join('+');
    /* Si ninguna de las dos tiene tipo, el campo compuesto tampoco: mejor que
     * la interfaz siga pidiéndolo a que se lo inventemos nosotros. */
    var tipo = col.tipo || otra.tipo || null;
    var self = this;
    var alcanzadas = 0;
    hoja.columnas.forEach(function (c) {
      if (!miembros.has(T.claveEncabezado(c.nombre))) return;
      c.accion = 'seudonimo';
      c.tipo = tipo;
      c.campo = nuevo;
      c.tocada = true;
      self.recordarColumna(c, true);
      alcanzadas += self.propagarColumna(hoja, c);
    });
    return alcanzadas;
  };

  /* Al sacar una parte, el resto se vuelve a etiquetar sin ella. Si queda una
   * sola, deja de ser un campo compuesto. */
  Proyecto.prototype.reagruparCampo = function (hoja, campo) {
    var self = this;
    var restantes = hoja.columnas.filter(function (c) { return c.campo === campo; });
    var nuevo = restantes.length > 1
      ? restantes.map(function (c) { return T.claveEncabezado(c.nombre); }).sort().join('+')
      : null;
    var alcanzadas = 0;
    restantes.forEach(function (c) {
      c.campo = nuevo;
      self.recordarColumna(c, true);
      alcanzadas += self.propagarColumna(hoja, c);
    });
    return alcanzadas;
  };

  /* El perfil recuerda qué se decidió para un encabezado. Distingue si lo
   * decidió el operador o la autodetección, y una clasificación automática no
   * puede pisar una decisión tomada: si no, alcanzaba con tener cargada otra
   * planilla sin tocar para que el próximo escaneo deshiciera el cambio y el
   * archivo siguiente heredara lo viejo. */
  Proyecto.prototype.recordarColumna = function (col, delOperador) {
    var clave = T.claveEncabezado(col.nombre);
    var previo = this.perfiles[clave];
    if (previo && previo.operador && !delOperador) return;
    this.perfiles[clave] = {
      accion: col.accion, tipo: col.tipo, campo: col.campo || null,
      operador: !!delOperador
    };
  };

  /* ¿Esta hoja tiene todas las partes de un campo compuesto? El identificador
   * del campo son los encabezados de sus partes, así que se puede preguntar. */
  function tieneLasPartes(hoja, campo) {
    var partes = campo.split('+');
    for (var i = 0; i < partes.length; i++) {
      var hay = false;
      for (var j = 0; j < hoja.columnas.length && !hay; j++) {
        if (T.claveEncabezado(hoja.columnas[j].nombre) === partes[i]) hay = true;
      }
      if (!hay) return false;
    }
    return true;
  }

  /* Lleva la decisión a las columnas con el mismo encabezado en el resto de las
   * planillas cargadas. Sin esto la reutilización sólo iría hacia adelante —los
   * archivos que se carguen después— y con diez planillas del mismo formato
   * habría que repetir cada cambio diez veces, que es justo lo que el perfil
   * viene a evitar. Que el resultado dependa del orden en que se soltaron los
   * archivos sería peor todavía.
   *
   * Una columna que el operador tocó en su propia hoja no se pisa: si en un
   * archivo puntual eligió otra cosa, esa elección manda ahí. */
  Proyecto.prototype.propagarColumna = function (hojaOrigen, col) {
    var clave = T.claveEncabezado(col.nombre);
    var alcanzadas = 0;
    this.archivos.forEach(function (a) {
      a.hojas.forEach(function (h) {
        if (h === hojaOrigen) return;
        h.columnas.forEach(function (c) {
          if (c.generado || c.tocada || T.claveEncabezado(c.nombre) !== clave) return;
          if (c.accion === col.accion && c.tipo === col.tipo && (c.campo || null) === (col.campo || null)) return;
          c.accion = col.accion;
          c.tipo = col.tipo;
          /* El campo compuesto sólo viaja si la otra hoja tiene las dos partes;
           * si no, allá esa columna es un dato entero por su cuenta. */
          c.campo = (col.campo && tieneLasPartes(h, col.campo)) ? col.campo : null;
          c.origen = 'perfil';
          alcanzadas++;
        });
      });
    });
    return alcanzadas;
  };

  /* La decisión se recuerda por nombre de columna y se aplica sola cuando
   * aparece el mismo encabezado en otro archivo. Es lo que sostiene la
   * consistencia cuando llegan diez planillas con el mismo formato. */
  Proyecto.prototype.configurarColumna = function (hoja, indice, accion, tipo) {
    var col = hoja.columnas[indice];
    var campoAnterior = col.campo;
    col.accion = accion;
    /* Una columna puede quedar en "seudonimizar" sin tipo mientras el operador
     * decide cuál. No se sustituye hasta que lo elija —el tipo es lo que define
     * el token— y la interfaz la marca en rojo, igual que a una que sale en
     * claro. Antes esto no pasaba porque había un tipo "otro" al que caía todo,
     * que es justamente lo que no queremos. */
    col.tipo = (accion === 'seudonimo') ? (tipo || null) : null;
    col.origen = 'operador';
    col.tocada = true;
    if (accion !== 'seudonimo') {
      /* Una parte que deja de seudonimizarse se sale del campo compuesto. */
      col.campo = null;
      this.recordarColumna(col, true);
      var sueltas = this.propagarColumna(hoja, col);
      if (campoAnterior) sueltas += this.reagruparCampo(hoja, campoAnterior);
      return sueltas;
    }
    this.recordarColumna(col, true);
    var alcanzadas = this.propagarColumna(hoja, col);
    /* Cambiar el tipo de una parte lo cambia para todo el campo: las partes de
     * un mismo dato no pueden ser de tipos distintos. */
    if (col.campo) {
      var self = this;
      hoja.columnas.forEach(function (c) {
        if (c === col || c.campo !== col.campo) return;
        c.tipo = tipo;
        c.accion = 'seudonimo';
        self.recordarColumna(c, true);
        alcanzadas += self.propagarColumna(hoja, c);
      });
    }
    return alcanzadas;
  };

  Proyecto.prototype.quitarArchivo = function (id) {
    this.archivos = this.archivos.filter(function (a) { return a.id !== id; });
  };

  /* ── Escaneo ────────────────────────────────────────────────────────── */

  Proyecto.prototype.escanear = function () {
    this.registro = new E.Registro();
    this.avisos = [];
    var self = this;
    var celdas = 0;
    this.archivos.forEach(function (archivo) {
      archivo.hojas.forEach(function (hoja) {
        var desde = hoja.encabezado ? 1 : 0;
        /* La clasificación efectiva de cada columna queda anotada en el
         * proyecto, no sólo la que el operador cambió a mano. Así, al reabrirlo,
         * las mismas planillas reciben el mismo tratamiento sin depender de que
         * la autodetección piense hoy lo mismo que ayer. */
        hoja.columnas.forEach(function (col) {
          if (!col.generado) self.recordarColumna(col);
        });
        self.unidades(hoja).forEach(function (unidad) {
          var tipo = self.tipoPorId(unidad.tipo);
          if (!tipo) return;
          var norm = T.NORMALIZADORES[tipo.norm];
          var idCol = archivo.nombre + ' › ' + hoja.nombre + ' › ' + self.etiquetaUnidad(unidad);
          for (var r = desde; r < hoja.filas.length; r++) {
            var bruto = valorDeUnidad(unidad, hoja.filas[r]);
            if (!bruto) continue;
            celdas++;
            self.registro.registrar(tipo.id, norm(bruto), bruto, idCol);
          }
        });
      });
    });
    this.acunar();
    this.recogerFormas();
    return { celdas: celdas, entidades: this.registro.total() };
  };

  /* Asigna un token a cada grupo. Se recorre en orden alfabético para que el
   * resultado no dependa del orden en que se cargaron los archivos. */
  Proyecto.prototype.acunar = function () {
    var claveBytes = this.claveBytes();
    var ocupados = new Map();
    this.grupoDe = new Map();
    this.tokenDeGrupo = new Map();

    /* Los tokens fijados por una bóveda importada se reservan primero: si el
     * archivo de hoy ya se exportó ayer, tiene que dar exactamente lo mismo. */
    var self = this;
    this.asignaciones.forEach(function (token, clave) {
      ocupados.set(token, clave.slice(clave.indexOf(SEP) + 1));
    });

    this.tipos.forEach(function (tipo) {
      var conocidas = new Set(self.registro.claves(tipo.id));
      self.fusiones.pares.forEach(function (p) {
        if (p[0] === tipo.id) { conocidas.add(p[1]); conocidas.add(p[2]); }
      });
      if (!conocidas.size) return;
      var mapa = self.registro.porTipo[tipo.id];
      var grupos = self.fusiones.grupos(tipo.id, Array.from(conocidas));
      var claves = Array.from(grupos.keys()).sort();
      claves.forEach(function (grupo) {
        var id = tipo.id + SEP + grupo;
        var miembros = grupos.get(grupo);
        /* Al fusionar dos entidades, el grupo hereda un token que ya existía en
         * vez de acuñar uno nuevo: confirmar que "Joaquin Peres" es "Joaquín
         * Pérez" no tiene que renombrar a Joaquín ni desalinear lo que ya se
         * exportó. Se hereda el de la forma más frecuente, que es la que más
         * chances tiene de haber salido en un archivo; los empates se rompen
         * alfabéticamente para que el resultado sea reproducible.
         *
         * La búsqueda arranca por los miembros y no por el id del grupo porque
         * son la misma cadena: el grupo se identifica por su clave menor, que
         * antes de la fusión era un grupo de a uno con su propio token. Mirar
         * primero el id daría siempre el token del miembro alfabéticamente
         * menor, que suele ser justamente la errata. */
        var candidatos = miembros.slice().sort(function (x, y) {
          var dx = mapa && mapa.get(x), dy = mapa && mapa.get(y);
          var fx = dx ? dx.total : 0, fy = dy ? dy.total : 0;
          return fy - fx || (x < y ? -1 : 1);
        });
        var token = null;
        for (var m = 0; m < candidatos.length && !token; m++) {
          token = self.asignaciones.get(tipo.id + SEP + candidatos[m]);
        }
        if (!token) token = E.acunar(claveBytes, tipo, grupo, ocupados);
        self.asignaciones.set(id, token);
        ocupados.set(token, grupo);
        self.tokenDeGrupo.set(id, token);
        miembros.forEach(function (miembro) {
          self.grupoDe.set(tipo.id + SEP + miembro, grupo);
          /* La asignación vieja del miembro absorbido ya no manda; dejarla
           * ensuciaría la bóveda con tokens que no se usan más. Sus formas
           * literales, en cambio, se conservan bajo el grupo que queda: son las
           * que devuelve la reconstrucción para el token de los dos. */
          if (miembro !== grupo) {
            self.asignaciones.delete(tipo.id + SEP + miembro);
            self.moverFormas(tipo.id + SEP + miembro, id);
          }
        });
      });
    });
  };

  /* ── Formas literales ───────────────────────────────────────────────── */

  /* Un token sólo se puede volver a convertir en el dato real si el proyecto se
   * acuerda de cómo estaba escrito. Las formas literales de cada grupo se
   * acumulan acá y viajan en la bóveda, así el camino inverso funciona en una
   * sesión donde las planillas originales ya no están —que es justamente cuando
   * hace falta: alguien devuelve el resultado de una consulta y hay que volver
   * a ponerle los nombres.
   *
   * Las formas viejas no se descartan nunca. Un valor que apareció el mes
   * pasado y hoy no está en ninguna planilla cargada sigue siendo lo que ese
   * token significa, y su token puede estar en el archivo que acaba de llegar. */
  Proyecto.prototype.anotarFormas = function (id, cuenta) {
    var previas = this.formas.get(id);
    if (!previas) { previas = new Map(); this.formas.set(id, previas); }
    /* Se guarda la mayor cuenta vista en una pasada y no la suma de todas: así
     * volver a escanear el mismo archivo no infla nada, la forma dominante no
     * depende de cuántas veces se rescaneó, y la bóveda no reescribe fragmentos
     * que en realidad no cambiaron. */
    cuenta.forEach(function (n, forma) {
      if (!previas.has(forma) || previas.get(forma) < n) previas.set(forma, n);
    });
  };

  /* Las formas de un grupo, la más frecuente primero. La primera es la que usa
   * la reconstrucción; los empates se rompen alfabéticamente para que el
   * resultado no dependa del orden de carga. */
  Proyecto.prototype.formasDe = function (id) {
    var cuenta = this.formas.get(id);
    if (!cuenta || !cuenta.size) return [];
    return Array.from(cuenta.entries()).sort(function (a, b) {
      return b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
    }).map(function (p) { return p[0]; });
  };

  /* Al fusionar, las formas del miembro absorbido pasan al grupo que queda: son
   * la misma entidad y su token es ahora uno solo. */
  Proyecto.prototype.moverFormas = function (desde, hacia) {
    if (desde === hacia) return;
    var cuenta = this.formas.get(desde);
    if (!cuenta) return;
    this.anotarFormas(hacia, cuenta);
    this.formas.delete(desde);
  };

  /* Vuelca en la memoria del proyecto las formas que acaba de ver el escaneo.
   *
   * Las claves de un mismo grupo se vuelcan de a una y sin sumarlas entre sí:
   * dos claves distintas no pueden compartir una forma literal, porque el mismo
   * texto siempre normaliza igual. */
  Proyecto.prototype.recogerFormas = function () {
    var self = this;
    this.tipos.forEach(function (tipo) {
      var mapa = self.registro.porTipo[tipo.id];
      if (!mapa || !mapa.size) return;
      mapa.forEach(function (e, clave) {
        self.anotarFormas(tipo.id + SEP + (self.grupoDe.get(tipo.id + SEP + clave) || clave), e.muestras);
      });
    });
  };

  /* Token para un valor concreto. Si el valor no se vio en el escaneo (por
   * ejemplo, aparece dentro de un texto libre) igual se le acuña uno. */
  Proyecto.prototype.tokenDe = function (tipo, bruto) {
    var clave = T.NORMALIZADORES[tipo.norm](bruto);
    if (!clave) return '';
    var grupo = this.grupoDe.get(tipo.id + SEP + clave) || clave;
    var id = tipo.id + SEP + grupo;
    var token = this.tokenDeGrupo.get(id);
    if (token) return token;
    token = this.asignaciones.get(id);
    if (!token) {
      var ocupados = new Map();
      this.tokenDeGrupo.forEach(function (t, k) { ocupados.set(t, k); });
      token = E.acunar(this.claveBytes(), tipo, grupo, ocupados);
      this.asignaciones.set(id, token);
    }
    this.tokenDeGrupo.set(id, token);
    this.grupoDe.set(tipo.id + SEP + clave, grupo);
    return token;
  };

  /* ── Búsqueda dentro de texto libre ─────────────────────────────────── */

  var TOPE_SUPERFICIES = 4000;

  /* Arma un único regex con todas las formas literales registradas, de la más
   * larga a la más corta, para que "Joaquín Pérez" gane sobre "Pérez".
   *
   * Sólo encuentra las variantes que aparecieron textualmente en alguna
   * columna clasificada: si un nombre existe únicamente dentro de un comentario
   * y en ninguna columna, no hay con qué reconocerlo. */
  Proyecto.prototype.buscadorTexto = function () {
    var self = this;
    var entradas = [];
    this.tipos.forEach(function (tipo) {
      var mapa = self.registro.porTipo[tipo.id];
      if (!mapa) return;
      mapa.forEach(function (e) {
        e.muestras.forEach(function (n, superficie) {
          if (superficie.length >= self.largoMinimoTexto) {
            entradas.push({ superficie: superficie, tipo: tipo });
          }
        });
      });
    });
    entradas.sort(function (a, b) { return b.superficie.length - a.superficie.length; });
    if (entradas.length > TOPE_SUPERFICIES) {
      this.avisos.push('La búsqueda en texto libre usa las ' + TOPE_SUPERFICIES +
        ' formas más largas de ' + entradas.length + ' registradas. Las más cortas quedan afuera.');
      entradas = entradas.slice(0, TOPE_SUPERFICIES);
    }
    if (!entradas.length) return null;

    var porFuente = new Map();
    var alternativas = entradas.map(function (e) {
      porFuente.set(e.superficie.toLowerCase(), e.tipo);
      return e.superficie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var re = new RegExp('(^|[^\\p{L}\\p{N}])(' + alternativas.join('|') + ')(?=[^\\p{L}\\p{N}]|$)', 'giu');
    return function (texto) {
      return texto.replace(re, function (todo, antes, encontrado) {
        var tipo = porFuente.get(encontrado.toLowerCase());
        if (!tipo) return todo;
        return antes + self.tokenDe(tipo, encontrado);
      });
    };
  };

  /* ── Transformación ─────────────────────────────────────────────────── */

  /* Devuelve las filas de salida de una hoja. `limite` acota el trabajo para la
   * vista previa. */
  Proyecto.prototype.transformar = function (archivo, hoja, limite, buscador) {
    var self = this;
    var desde = hoja.encabezado ? 1 : 0;
    var hasta = limite ? Math.min(hoja.filas.length, desde + limite) : hoja.filas.length;
    var unidades = this.unidades(hoja);
    var otras = hoja.columnas.filter(function (c) {
      return c.accion === 'vaciar' || c.accion === 'escanear';
    });
    var salida = [];
    if (hoja.encabezado) salida.push(hoja.filas[0].slice());
    for (var r = desde; r < hasta; r++) {
      var origen = hoja.filas[r];
      var fila = origen.slice();
      unidades.forEach(function (unidad) {
        var tipo = self.tipoPorId(unidad.tipo);
        var bruto = valorDeUnidad(unidad, origen);
        if (!tipo || !bruto) return;
        /* Un campo compuesto se resuelve una sola vez por fila y el mismo token
         * va en cada una de sus partes: así la planilla conserva su forma y las
         * dos columnas siguen apuntando a la misma persona. */
        var token = self.tokenDe(tipo, bruto);
        unidad.columnas.forEach(function (col) {
          if (!IO.texto(origen[col.indice]).trim()) return;
          fila[col.indice] = token;
        });
      });
      otras.forEach(function (col) {
        if (col.accion === 'vaciar') { fila[col.indice] = ''; return; }
        var bruto = IO.texto(origen[col.indice]).trim();
        if (!bruto) return;
        fila[col.indice] = buscador ? buscador(bruto) : bruto;
      });
      salida.push(fila);
    }
    return salida;
  };

  Proyecto.prototype.exportarArchivo = function (archivo) {
    var self = this;
    var buscador = this.necesitaBuscador() ? this.buscadorTexto() : null;
    var hojas = archivo.hojas.map(function (h) {
      return { nombre: h.nombre, filas: self.transformar(archivo, h, 0, buscador) };
    });
    IO.exportarArchivo(archivo, hojas);
    this.marcarExportado(archivo);
  };

  Proyecto.prototype.necesitaBuscador = function () {
    return this.archivos.some(function (a) {
      return a.hojas.some(function (h) {
        return h.columnas.some(function (c) { return c.accion === 'escanear'; });
      });
    });
  };

  /* ── Reconstrucción ─────────────────────────────────────────────────── */

  /* El camino inverso, y lo que cierra el ciclo de trabajo: el analista recibe
   * planillas con tokens, hace su consulta y devuelve un resultado que también
   * tiene tokens. Quien tiene la bóveda le vuelve a poner los valores reales.
   *
   * El archivo que entra no tiene por qué ser uno que salió de acá: puede ser
   * un recorte, un informe, una tabla dinámica o un texto que menciona un token
   * al pasar. Por eso no se busca por columna sino por forma: prefijo, guion y
   * base32 sin caracteres ambiguos. Lo que tiene forma de token se resuelve por
   * tabla, así el costo no depende de cuántas entidades tenga el proyecto.
   *
   * El guion no puede estar pegado a un lado ni al otro, o "expediente-2026" de
   * un código cualquiera se comería el prefijo del de al lado. */
  var RE_TOKEN = /(^|[^\p{L}\p{N}_-])([a-z0-9]{1,16}-[0-9a-hjkmnp-tv-z]{6,14})(?![\p{L}\p{N}_-])/gu;

  Proyecto.prototype.reconstructor = function () {
    var self = this;
    var valores = new Map();
    var mudos = 0;
    function anotar(token, id) {
      if (valores.has(token)) return;
      var formas = self.formasDe(id);
      /* Un token cuyo valor real la bóveda no guardó: se acuñó dentro de un
       * texto libre y nunca apareció en una columna clasificada. No hay con
       * qué responderlo, y decirlo es mejor que inventar. */
      if (!formas.length) { mudos++; return; }
      valores.set(token, formas[0]);
    }
    this.asignaciones.forEach(anotar);
    this.tokenDeGrupo.forEach(anotar);

    var prefijos = Object.create(null);
    this.tipos.forEach(function (t) { prefijos[t.prefijo] = t; });

    return {
      valores: valores,
      mudos: mudos,
      /* Sustituye todos los tokens conocidos de un texto y anota en `informe`
       * lo que fue encontrando. Lo que tiene forma de token pero no está en
       * esta bóveda se deja intacto; si además es de un tipo que el proyecto
       * conoce, se lo cuenta aparte: significa que ese archivo salió de otra
       * clave maestra y esta bóveda no lo puede leer. */
      texto: function (t, informe) {
        return String(t).replace(RE_TOKEN, function (todo, antes, token) {
          var valor = valores.get(token);
          if (valor === undefined) {
            var pref = token.slice(0, token.indexOf('-'));
            if (informe && prefijos[pref]) informe.ajenos.set(token, prefijos[pref].etiqueta);
            return todo;
          }
          if (informe) { informe.tokens++; informe.distintos.add(token); }
          return antes + valor;
        });
      }
    };
  };

  /* Devuelve las hojas con los valores reales puestos y un informe de lo que
   * pasó. Las celdas que no son texto salen como entraron: una fecha o un
   * número no pueden contener un token. */
  Proyecto.prototype.reconstruir = function (hojas) {
    var r = this.reconstructor();
    var informe = { tokens: 0, distintos: new Set(), ajenos: new Map(), celdas: 0, mudos: r.mudos };
    var salida = hojas.map(function (h) {
      return {
        nombre: h.nombre,
        filas: h.filas.map(function (fila) {
          return fila.map(function (v) {
            if (typeof v !== 'string' || v.indexOf('-') < 0) return v;
            var nuevo = r.texto(v, informe);
            if (nuevo !== v) informe.celdas++;
            return nuevo;
          });
        })
      };
    });
    return { hojas: salida, informe: informe };
  };

  /* ¿Este archivo ya salió de acá? Cargarlo como fuente es un accidente caro:
   * cada token se registraría como si fuera un dato real y quedaría en la
   * bóveda como una entidad más, con su propio token encima. Alcanza con mirar
   * las primeras filas. */
  var FILAS_OLFATEO = 200;

  Proyecto.prototype.tokensPropios = function (hojas) {
    var r = this.reconstructor();
    var informe = { tokens: 0, distintos: new Set(), ajenos: new Map() };
    for (var h = 0; h < hojas.length; h++) {
      var filas = hojas[h].filas;
      var hasta = Math.min(filas.length, FILAS_OLFATEO);
      for (var i = 0; i < hasta; i++) {
        for (var c = 0; c < filas[i].length; c++) {
          var v = filas[i][c];
          if (typeof v === 'string' && v.indexOf('-') >= 0) r.texto(v, informe);
        }
      }
    }
    return informe.distintos.size;
  };

  /* ── Inventario ─────────────────────────────────────────────────────── */

  /* Una fila por grupo: el token, todas las formas literales que le
   * corresponden y dónde aparecieron. Es el mapa inverso. */
  Proyecto.prototype.inventario = function (tipoId) {
    var self = this;
    var salida = [];
    this.tipos.forEach(function (tipo) {
      if (tipoId && tipo.id !== tipoId) return;
      var mapa = self.registro.porTipo[tipo.id];
      if (!mapa || !mapa.size) return;
      var porGrupo = new Map();
      mapa.forEach(function (e, clave) {
        var grupo = self.grupoDe.get(tipo.id + SEP + clave) || clave;
        if (!porGrupo.has(grupo)) {
          porGrupo.set(grupo, { tipo: tipo, grupo: grupo, claves: [], superficies: new Map(), total: 0, columnas: new Set() });
        }
        var g = porGrupo.get(grupo);
        g.claves.push(clave);
        g.total += e.total;
        e.columnas.forEach(function (c) { g.columnas.add(c); });
        e.muestras.forEach(function (n, s) { g.superficies.set(s, (g.superficies.get(s) || 0) + n); });
      });
      porGrupo.forEach(function (g) {
        g.token = self.tokenDeGrupo.get(tipo.id + SEP + g.grupo) || '';
        g.claves.sort();
        salida.push(g);
      });
    });
    salida.sort(function (a, b) { return b.total - a.total; });
    return salida;
  };

  Proyecto.prototype.sugerencias = function () {
    var self = this;
    var todas = [];
    var truncado = false;
    this.tipos.forEach(function (tipo) {
      if (!tipo.fuzzy) return;
      if (!self.registro.porTipo[tipo.id] || self.registro.porTipo[tipo.id].size < 2) return;
      var r = E.sugerencias(self.registro, self.fusiones, tipo, self.umbral);
      truncado = truncado || r.truncado;
      todas = todas.concat(r.pares);
    });
    todas.sort(function (a, b) { return b.puntaje - a.puntaje; });
    if (truncado) {
      this.avisos.push('Hay demasiadas entidades para comparar todos los pares. ' +
        'Se revisó una parte; subí el umbral o dividí el trabajo en tandas.');
    }
    return todas;
  };

  Proyecto.prototype.resumen = function () {
    var r = { archivos: this.archivos.length, hojas: 0, columnas: 0, seudonimo: 0, escanear: 0, vaciar: 0, conservar: 0, filas: 0 };
    this.archivos.forEach(function (a) {
      a.hojas.forEach(function (h) {
        r.hojas++;
        r.filas += h.filas.length - (h.encabezado ? 1 : 0);
        h.columnas.forEach(function (c) { r.columnas++; r[c.accion]++; });
      });
    });
    r.entidades = this.registro.total();
    r.grupos = this.tokenDeGrupo.size;
    return r;
  };

  global.MIST.Proyecto = Proyecto;
  global.MIST.ACCIONES = ACCIONES;
  global.MIST.SEP = SEP;
})(window);
