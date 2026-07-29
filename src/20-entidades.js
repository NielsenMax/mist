/* MIST — entidades, fusiones y coincidencia difusa
 *
 * Una "entidad" es un valor real normalizado (la clave). Varias claves pueden
 * pertenecer al mismo grupo si el operador las fusiona. El identificador del
 * grupo es siempre la clave menor en orden alfabético: así el token no depende
 * del orden en que se hicieron las fusiones ni del orden de los archivos.
 */
(function (global) {
  'use strict';

  var H = global.MIST.hash;

  /* ── Distancia Jaro-Winkler ─────────────────────────────────────────────
   * Es la métrica que usan los censos para nombres de personas: premia los
   * prefijos iguales, porque los errores de tipeo suelen caer al final. */
  function jaro(s1, s2) {
    if (s1 === s2) return 1;
    var l1 = s1.length, l2 = s2.length;
    if (!l1 || !l2) return 0;
    var ventana = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
    var m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
    var coincidencias = 0;
    for (var i = 0; i < l1; i++) {
      var desde = Math.max(0, i - ventana), hasta = Math.min(i + ventana + 1, l2);
      for (var j = desde; j < hasta; j++) {
        if (m2[j] || s1[i] !== s2[j]) continue;
        m1[i] = m2[j] = true; coincidencias++; break;
      }
    }
    if (!coincidencias) return 0;
    var k = 0, transposiciones = 0;
    for (i = 0; i < l1; i++) {
      if (!m1[i]) continue;
      while (!m2[k]) k++;
      if (s1[i] !== s2[k]) transposiciones++;
      k++;
    }
    transposiciones /= 2;
    return (coincidencias / l1 + coincidencias / l2 +
            (coincidencias - transposiciones) / coincidencias) / 3;
  }

  function jaroWinkler(s1, s2) {
    var j = jaro(s1, s2);
    if (j < 0.7) return j;
    var prefijo = 0;
    for (var i = 0; i < Math.min(4, s1.length, s2.length); i++) {
      if (s1[i] !== s2[i]) break;
      prefijo++;
    }
    return j + prefijo * 0.1 * (1 - j);
  }

  /* Empareja los tokens de dos nombres de a pares, tomando el mejor par
   * disponible para cada uno. Una inicial ("j") cuenta como coincidencia con
   * el token que empieza con esa letra. */
  function emparejarTokens(ta, tb) {
    var usados = new Array(tb.length).fill(false);
    var pares = 0, suma = 0;
    for (var i = 0; i < ta.length; i++) {
      var mejor = -1, mejorPuntaje = 0;
      for (var j = 0; j < tb.length; j++) {
        if (usados[j]) continue;
        var p;
        if (ta[i].length === 1 || tb[j].length === 1) {
          p = (ta[i][0] === tb[j][0]) ? 0.9 : 0;
        } else {
          p = jaroWinkler(ta[i], tb[j]);
        }
        if (p > mejorPuntaje) { mejorPuntaje = p; mejor = j; }
      }
      if (mejor >= 0 && mejorPuntaje >= 0.88) {
        usados[mejor] = true; pares++; suma += mejorPuntaje;
      }
    }
    return { pares: pares, calidad: pares ? suma / pares : 0 };
  }

  /* Similitud entre dos claves normalizadas, entre 0 y 1.
   *
   * Para valores de varias palabras la comparación se hace token a token y la
   * distancia sobre la cadena entera pesa poco: "joaquin perez" y "joaquin
   * gomez" comparten el 60% de los caracteres y Jaro-Winkler solo los daría
   * como 0.89, que es un falso positivo caro en esta herramienta. */
  function similitud(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    var jw = jaroWinkler(a, b);
    var ta = a.split(' ').filter(Boolean), tb = b.split(' ').filter(Boolean);
    if (Math.max(ta.length, tb.length) <= 1) return jw;
    var m = emparejarTokens(ta.length <= tb.length ? ta : tb, ta.length <= tb.length ? tb : ta);
    var contencion = m.pares / Math.min(ta.length, tb.length);
    var jaccard = m.pares / (ta.length + tb.length - m.pares);
    var porTokens = m.calidad * (0.65 * contencion + 0.35 * jaccard);
    /* La comparación palabra a palabra manda; la distancia sobre la cadena
     * entera sólo puede subir un poco el puntaje, nunca bajarlo. "J. Perez" y
     * "Joaquin Perez" emparejan perfecto por tokens aunque como cadenas se
     * parezcan poco. */
    return Math.max(porTokens, 0.25 * jw + 0.75 * porTokens);
  }

  /* ── Registro de entidades ──────────────────────────────────────────── */

  function Registro() {
    this.porTipo = Object.create(null);
  }

  Registro.prototype.tipo = function (tipoId) {
    if (!this.porTipo[tipoId]) this.porTipo[tipoId] = new Map();
    return this.porTipo[tipoId];
  };

  /* Registra una aparición. `muestras` guarda las formas literales vistas para
   * poder mostrárselas al operador y para buscarlas dentro de texto libre. */
  Registro.prototype.registrar = function (tipoId, clave, original, columnaId) {
    if (!clave) return null;
    var mapa = this.tipo(tipoId);
    var e = mapa.get(clave);
    if (!e) {
      e = { clave: clave, muestras: new Map(), total: 0, columnas: new Set() };
      mapa.set(clave, e);
    }
    e.total++;
    e.columnas.add(columnaId);
    var texto = String(original).trim();
    e.muestras.set(texto, (e.muestras.get(texto) || 0) + 1);
    return clave;
  };

  Registro.prototype.claves = function (tipoId) {
    return Array.from(this.tipo(tipoId).keys());
  };

  Registro.prototype.total = function () {
    var n = 0;
    for (var t in this.porTipo) n += this.porTipo[t].size;
    return n;
  };

  /* ── Fusiones (conjuntos disjuntos) ─────────────────────────────────── */

  function Fusiones() {
    this.padre = Object.create(null);
    this.pares = [];        // [tipoId, claveA, claveB] confirmados por el operador
    this.rechazos = Object.create(null);
  }

  function idPar(tipoId, a, b) {
    return a < b ? tipoId + '\u0001' + a + '\u0001' + b : tipoId + '\u0001' + b + '\u0001' + a;
  }

  Fusiones.prototype.raiz = function (k) {
    var p = this.padre;
    if (p[k] === undefined) { p[k] = k; return k; }
    while (p[k] !== k) { p[k] = p[p[k]]; k = p[k]; }
    return k;
  };

  Fusiones.prototype.unir = function (tipoId, a, b) {
    if (a === b) return false;
    var ka = tipoId + '\u0000' + a, kb = tipoId + '\u0000' + b;
    var ra = this.raiz(ka), rb = this.raiz(kb);
    if (ra !== rb) this.padre[rb] = ra;
    this.pares.push([tipoId, a, b]);
    delete this.rechazos[idPar(tipoId, a, b)];
    return true;
  };

  Fusiones.prototype.rechazar = function (tipoId, a, b) {
    this.rechazos[idPar(tipoId, a, b)] = 1;
  };

  Fusiones.prototype.estaRechazado = function (tipoId, a, b) {
    return !!this.rechazos[idPar(tipoId, a, b)];
  };

  /* Deshace todas las fusiones que involucren a una clave. Como los conjuntos
   * disjuntos no se pueden partir, se reconstruye el estado sin esos pares. */
  Fusiones.prototype.separar = function (tipoId, clave) {
    var conservados = [];
    var afectados = [];
    for (var i = 0; i < this.pares.length; i++) {
      var p = this.pares[i];
      if (p[0] === tipoId && (p[1] === clave || p[2] === clave)) { afectados.push(p); continue; }
      conservados.push(p);
    }
    if (!afectados.length) return 0;
    var previos = conservados;
    this.padre = Object.create(null);
    this.pares = [];
    for (i = 0; i < previos.length; i++) this.unir(previos[i][0], previos[i][1], previos[i][2]);
    /* Los pares deshechos pasan a rechazados: si el operador los separó a mano
     * no queremos volver a sugerirlos en la próxima pasada. */
    for (i = 0; i < afectados.length; i++) this.rechazar(afectados[i][0], afectados[i][1], afectados[i][2]);
    return afectados.length;
  };

  /* Agrupa las claves de un tipo. Devuelve Map<claveGrupo, [claves...]>, donde
   * claveGrupo es la menor del grupo en orden alfabético. */
  Fusiones.prototype.grupos = function (tipoId, claves) {
    var porRaiz = new Map();
    for (var i = 0; i < claves.length; i++) {
      var r = this.raiz(tipoId + '\u0000' + claves[i]);
      if (!porRaiz.has(r)) porRaiz.set(r, []);
      porRaiz.get(r).push(claves[i]);
    }
    var salida = new Map();
    porRaiz.forEach(function (miembros) {
      miembros.sort();
      salida.set(miembros[0], miembros);
    });
    return salida;
  };

  /* ── Sugerencias de fusión ──────────────────────────────────────────── */

  /* Sin bloqueo esto sería O(n²): con 20.000 nombres son 200 millones de
   * comparaciones. Cada entidad se indexa por los prefijos de sus palabras y
   * por la firma de letras ordenadas del valor completo (que sobrevive a
   * transposiciones y erratas), y sólo se comparan pares que comparten bloque. */
  function bloques(clave) {
    var b = [];
    var tokens = clave.split(' ').filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      b.push('p:' + tokens[i].slice(0, 3));
    }
    var letras = Array.from(new Set(clave.replace(/[^a-z0-9]/g, '').split(''))).sort().join('');
    if (letras) b.push('f:' + letras.slice(0, 6));
    return b;
  }

  var TOPE_COMPARACIONES = 4000000;

  function sugerencias(registro, fusiones, tipo, umbral) {
    var claves = registro.claves(tipo.id);
    var indice = new Map();
    for (var i = 0; i < claves.length; i++) {
      var bs = bloques(claves[i]);
      for (var j = 0; j < bs.length; j++) {
        if (!indice.has(bs[j])) indice.set(bs[j], []);
        indice.get(bs[j]).push(i);
      }
    }
    var vistos = new Set();
    var salida = [];
    var comparaciones = 0, truncado = false;

    indice.forEach(function (grupo) {
      if (truncado || grupo.length < 2) return;
      for (var a = 0; a < grupo.length; a++) {
        for (var b = a + 1; b < grupo.length; b++) {
          if (comparaciones >= TOPE_COMPARACIONES) { truncado = true; return; }
          var ia = grupo[a], ib = grupo[b];
          var id = ia < ib ? ia + ':' + ib : ib + ':' + ia;
          if (vistos.has(id)) continue;
          vistos.add(id);
          comparaciones++;
          var ka = claves[ia], kb = claves[ib];
          if (fusiones.raiz(tipo.id + '\u0000' + ka) === fusiones.raiz(tipo.id + '\u0000' + kb)) continue;
          if (fusiones.estaRechazado(tipo.id, ka, kb)) continue;
          var s = similitud(ka, kb);
          if (s >= umbral) salida.push({ tipo: tipo.id, a: ka, b: kb, puntaje: s });
        }
      }
    });

    salida.sort(function (x, y) { return y.puntaje - x.puntaje; });
    return { pares: salida, comparaciones: comparaciones, truncado: truncado };
  }

  /* ── Acuñación de tokens ────────────────────────────────────────────── */

  /* token = prefijo del tipo + HMAC(clave maestra, tipo | grupo). Determinista:
   * misma clave maestra y mismas fusiones ⇒ mismos tokens, en cualquier archivo
   * y en cualquier sesión, sin necesidad de arrastrar el diccionario.
   *
   * Las colisiones (dos grupos distintos con el mismo token) se resuelven
   * rehasheando con un contador. Como los grupos se procesan en orden
   * alfabético, el resultado tampoco depende del orden de carga. */
  function acuñar(claveBytes, tipo, claveGrupo, ocupados) {
    var largo = tipo.largo || 8;
    for (var intento = 0; intento < 64; intento++) {
      var mensaje = 'mist/v1|' + tipo.id + '|' + claveGrupo + (intento ? '|' + intento : '');
      var token = tipo.prefijo + '-' + H.encode(H.hmac(claveBytes, H.bytes(mensaje)), largo);
      var duenio = ocupados.get(token);
      if (duenio === undefined || duenio === claveGrupo) return token;
    }
    return tipo.prefijo + '-' + H.encode(H.hmac(claveBytes, H.bytes('mist/v1|desborde|' + claveGrupo)), largo + 4);
  }

  global.MIST.entidades = {
    Registro: Registro,
    Fusiones: Fusiones,
    jaroWinkler: jaroWinkler,
    similitud: similitud,
    sugerencias: sugerencias,
    acunar: acuñar,
    TOPE_COMPARACIONES: TOPE_COMPARACIONES
  };
})(window);
