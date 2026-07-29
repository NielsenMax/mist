/* MIST — interfaz del operador */
(function (global) {
  'use strict';

  var M = global.MIST;
  var T = M.tipos, IO = M.io, B = M.boveda, A = M.almacen;
  var SEP = M.SEP;

  var P = new M.Proyecto();
  var vista = {
    pestania: 'columnas',
    hojaId: null,
    filtroTipo: '',
    busqueda: '',
    seleccion: new Set(),
    sugerencias: null,
    mostrarOriginales: false,
    barrerAlEntrar: true,
    almacen: null,
    guardado: null,
    reconstruccion: null,
    propagado: null
  };

  var TOPE_LISTA = 300;
  var FILAS_PREVIA = 40;

  /* ── Utilidades ───────────────────────────────────────────────────── */

  function $(id) { return document.getElementById(id); }

  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    return n;
  }

  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function plural(n, singular, prural) {
    return n + ' ' + (n === 1 ? singular : prural);
  }

  function hojaActiva() {
    for (var i = 0; i < P.archivos.length; i++) {
      for (var j = 0; j < P.archivos[i].hojas.length; j++) {
        if (P.archivos[i].hojas[j].id === vista.hojaId) {
          return { archivo: P.archivos[i], hoja: P.archivos[i].hojas[j] };
        }
      }
    }
    return null;
  }

  function primeraHoja() {
    if (P.archivos.length && P.archivos[0].hojas.length) return P.archivos[0].hojas[0].id;
    return null;
  }

  /* ── Diálogo ──────────────────────────────────────────────────────── */

  function dialogo(opciones) {
    var dlg = $('dialogo');
    $('dlg-titulo').textContent = opciones.titulo;
    $('dlg-texto').textContent = opciones.texto || '';
    $('dlg-texto').hidden = !opciones.texto;
    $('dlg-aceptar').textContent = opciones.aceptar || 'Aceptar';
    $('dlg-cancelar').hidden = !!opciones.soloAceptar;
    var campos = $('dlg-campos');
    vaciar(campos);
    /* El motivo de un rechazo va arriba de los campos y con el color de los
     * avisos, para que no se lea como una explicación más. */
    if (opciones.error) campos.appendChild(el('div', 'aviso', opciones.error));
    var entradas = [];
    (opciones.campos || []).forEach(function (c) {
      var etiqueta = el('label');
      var input;
      if (c.tipo === 'select') {
        input = document.createElement('select');
        (c.opciones || []).forEach(function (o) {
          var op = document.createElement('option');
          op.value = o.valor;
          op.textContent = o.etiqueta;
          if (o.valor === c.valor) op.selected = true;
          input.appendChild(op);
        });
      } else {
        input = document.createElement('input');
        input.type = c.tipo || 'text';
        if (c.valor !== undefined) {
          if (input.type === 'checkbox') input.checked = !!c.valor;
          else input.value = c.valor;
        }
        if (c.marcador) input.placeholder = c.marcador;
        if (c.autocompletar) input.autocomplete = c.autocompletar;
      }
      input.name = c.nombre;
      if (input.type === 'checkbox') {
        etiqueta.appendChild(input);
        etiqueta.appendChild(document.createTextNode(c.etiqueta));
      } else {
        var envoltorio = el('div');
        envoltorio.appendChild(el('div', null, c.etiqueta));
        envoltorio.appendChild(input);
        etiqueta = envoltorio;
      }
      if (c.nota) etiqueta.appendChild(el('div', 'col-meta', c.nota));
      campos.appendChild(etiqueta);
      entradas.push({ nombre: c.nombre, input: input });
    });

    return new Promise(function (resolve) {
      function alCerrar() {
        dlg.removeEventListener('close', alCerrar);
        $('dlg-aceptar').onclick = null;
        $('dlg-cancelar').onclick = null;
        if (dlg.returnValue !== 'aceptar') return resolve(null);
        var valores = {};
        entradas.forEach(function (e) {
          valores[e.nombre] = e.input.type === 'checkbox' ? e.input.checked : e.input.value;
        });
        resolve(valores);
      }
      /* El <form method="dialog"> ya cerraría el diálogo solo, pero cerrarlo a
       * mano deja el valor de retorno bajo control en vez de depender de cómo
       * cada navegador resuelve el envío implícito. Enter sigue funcionando:
       * dispara el primer botón de envío, que es Aceptar. */
      function cerrar(valor) {
        return function (e) { e.preventDefault(); dlg.close(valor); };
      }
      $('dlg-aceptar').onclick = cerrar('aceptar');
      $('dlg-cancelar').onclick = cerrar('cancelar');
      dlg.addEventListener('close', alCerrar);
      dlg.showModal();
      if (entradas.length) entradas[0].input.focus();
    });
  }

  function avisar(titulo, texto) {
    return dialogo({ titulo: titulo, texto: texto, aceptar: 'Entendido', campos: [], soloAceptar: true });
  }

  /* Diálogo de lista: cada opción es un botón que resuelve con su valor. */
  function elegir(opciones) {
    var dlg = $('dialogo');
    $('dlg-titulo').textContent = opciones.titulo;
    $('dlg-texto').textContent = opciones.texto || '';
    $('dlg-texto').hidden = !opciones.texto;
    $('dlg-aceptar').hidden = true;
    $('dlg-cancelar').hidden = false;
    var campos = $('dlg-campos');
    vaciar(campos);
    var lista = el('div', 'opciones');

    return new Promise(function (resolve) {
      opciones.opciones.forEach(function (o) {
        var b = el('button', 'tarjeta' + (o.tenue ? ' tenue' : ''));
        b.type = 'button';
        b.appendChild(el('b', null, o.etiqueta));
        if (o.detalle) b.appendChild(el('span', null, o.detalle));
        b.onclick = function () { dlg.close('elegido:' + o.valor); };
        lista.appendChild(b);
      });
      campos.appendChild(lista);

      function alCerrar() {
        dlg.removeEventListener('close', alCerrar);
        $('dlg-aceptar').hidden = false;
        $('dlg-cancelar').onclick = null;
        var v = String(dlg.returnValue || '');
        resolve(v.indexOf('elegido:') === 0 ? v.slice(8) : null);
      }
      $('dlg-cancelar').onclick = function (e) { e.preventDefault(); dlg.close('cancelar'); };
      dlg.addEventListener('close', alCerrar);
      dlg.showModal();
    });
  }

  /* ── Carga de archivos ────────────────────────────────────────────── */

  /* Con tres tokens de esta bóveda ya no hay duda: 8 caracteres de base32 son
   * 40 bits, no se aciertan de casualidad. Con menos no se dice nada, para no
   * frenar a nadie porque alguien pegó un token suelto en una observación. */
  var TOKENS_PARA_SOSPECHAR = 3;

  function cargar(archivos) {
    var lista = Array.prototype.slice.call(archivos);
    if (!lista.length) return;
    var errores = [];
    var conocidos = [];
    var salidos = [];
    var agregados = 0;
    lista.reduce(function (cadena, f) {
      return cadena.then(function () {
        return IO.leerArchivo(f).then(function (datos) {
          /* Antes de sumarlo: un archivo que ya salió de acá no se carga como
           * planilla de origen. Cada token se registraría como si fuera un dato
           * real y quedaría en la bóveda como una entidad más, con su propio
           * token encima. */
          if (P.tokensPropios(datos.hojas) >= TOKENS_PARA_SOSPECHAR) { salidos.push(datos); return; }
          var a = P.agregarArchivo(datos);
          agregados++;
          if (!vista.hojaId) vista.hojaId = a.hojas[0].id;
          if (a.estado.estado !== 'nuevo') conocidos.push(a);
        }).catch(function (e) {
          errores.push(f.name + ': ' + e.message);
        });
      });
    }, Promise.resolve()).then(function () {
      /* Si al final no entró nada, no hay nada que reescanear —y reescanear de
       * gusto marcaría la bóveda como sucia y trabaría las descargas. */
      if (agregados) reescanear(); else render();
      var avisos = Promise.resolve();
      if (errores.length) {
        avisos = avisos.then(function () {
          return avisar('No se pudieron leer todos los archivos', errores.join('\n'));
        });
      }
      if (conocidos.length) {
        avisos = avisos.then(function () {
          return avisar('Estos archivos ya habían pasado por el proyecto',
            conocidos.map(function (a) {
              var e = a.estado.entrada;
              return a.estado.estado === 'repetido'
                ? a.nombre + ' — el mismo archivo, procesado ' + cuando(e.ultima) +
                  (e.exportado ? ' y exportado ' + cuando(e.exportado) : ' pero nunca exportado')
                : a.nombre + ' — cambió desde la última vez (' + cuando(e.primera) + '). ' +
                  'Los valores que ya conocía mantienen su token; los nuevos reciben uno.';
            }).join('\n'));
        });
      }
      if (salidos.length) avisos = avisos.then(function () { return ofrecerReconstruir(salidos); });
      return avisos;
    });
  }

  /* Casi siempre, quien suelta acá una planilla desensibilizada quiere lo
   * contrario de cargarla: quiere leerla. Se ofrece eso primero, y la otra
   * opción queda disponible por si de verdad la quiere como fuente. */
  function ofrecerReconstruir(salidos) {
    var uno = salidos.length === 1;
    var nombres = salidos.map(function (d) { return d.nombre; }).join(', ');
    return elegir({
      titulo: uno ? 'Ese archivo ya está desensibilizado' : 'Esos archivos ya están desensibilizados',
      texto: nombres + (uno ? ' tiene' : ' tienen') + ' tokens de este proyecto, así que no ' +
        (uno ? 'se cargó' : 'se cargaron') + ' como planilla de origen: eso registraría cada token como si ' +
        'fuera un dato real y lo dejaría en la bóveda como una entidad nueva.',
      opciones: [
        { valor: 'reconstruir',
          etiqueta: uno ? 'Reconstruirlo' : 'Reconstruir ' + salidos[0].nombre,
          detalle: uno ? 'volver a poner los valores reales' : 'los demás, de a uno' },
        { valor: 'cargar',
          etiqueta: uno ? 'Cargarlo igual como planilla de origen' : 'Cargarlos igual como planillas de origen',
          detalle: 'los tokens van a quedar en la bóveda como entidades nuevas', tenue: true }
      ]
    }).then(function (que) {
      if (que === 'cargar') {
        salidos.forEach(function (datos) {
          var a = P.agregarArchivo(datos);
          if (!vista.hojaId) vista.hojaId = a.hojas[0].id;
        });
        reescanear();
        return;
      }
      if (que === 'reconstruir') mostrarReconstruccion(salidos[0]);
    });
  }

  /* Fecha corta y local: el operador quiere ubicarse, no auditar milisegundos. */
  function cuando(iso) {
    if (!iso) return 'nunca';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var hoy = new Date();
    var mismoDia = d.toDateString() === hoy.toDateString();
    return mismoDia
      ? 'hoy ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function reescanear() {
    P.escanear();
    vista.sugerencias = null;
    vista.seleccion.clear();
    anotar('escaneo');
    render();
  }

  /* Toda acción que cambia lo que la bóveda tiene que recordar pasa por acá. */
  function anotar(motivo) {
    if (vista.guardado) vista.guardado.marcar(motivo);
  }

  /* ── Barra ────────────────────────────────────────────────────────── */

  var ESTADOS = {
    guardado: 'guardada',
    pendiente: 'guardando…',
    guardando: 'guardando…',
    'sin guardar': 'sin guardar',
    error: 'no se pudo guardar'
  };

  function renderBarra() {
    $('huella').textContent = P.huella();
    $('nombre-proyecto').textContent = P.nombre;
    var g = vista.guardado;
    var caja = $('estado-guardado');
    if (!g) { caja.textContent = ''; return; }
    var sinCopia = !g.copiaEnDisco() && g.estado === 'guardado';
    caja.textContent = sinCopia ? 'sin copia en disco' : (ESTADOS[g.estado] || g.estado);
    caja.dataset.estado = sinCopia ? 'sin copia' : g.estado;
    caja.title = vista.almacen.descripcion() + (g.detalle ? ' · ' + g.detalle : '');
    var btn = $('btn-guardar');
    btn.hidden = vista.almacen.autoguarda && vista.almacen.enDisco && g.estado !== 'error';
    btn.textContent = g.estado === 'error' ? 'Reintentar'
      : (vista.almacen.enDisco ? 'Guardar bóveda' : 'Bajar bóveda (.zip)');
    btn.className = g.copiaEnDisco() ? '' : 'primario';
  }

  /* ── Lateral ──────────────────────────────────────────────────────── */

  function renderLateral() {
    var cont = $('lista-archivos');
    vaciar(cont);
    if (!P.archivos.length) {
      var v = el('div', 'vacio');
      v.style.height = 'auto';
      v.appendChild(el('p', null, 'Todavía no cargaste nada.'));
      cont.appendChild(v);
      return;
    }
    P.archivos.forEach(function (archivo) {
      var caja = el('div', 'archivo');
      var cab = el('div', 'archivo-cab');
      cab.appendChild(el('div', 'nombre', archivo.nombre));
      var quitar = el('button', 'fino quitar', '×');
      quitar.title = 'Quitar ' + archivo.nombre;
      quitar.onclick = function () {
        P.quitarArchivo(archivo.id);
        if (!hojaActiva()) vista.hojaId = primeraHoja();
        reescanear();
      };
      cab.appendChild(quitar);
      caja.appendChild(cab);
      if (archivo.estado && archivo.estado.estado !== 'nuevo') {
        var marca = el('div', 'archivo-estado ' + archivo.estado.estado,
          archivo.estado.estado === 'repetido'
            ? 'ya procesado ' + cuando(archivo.estado.entrada.primera)
            : 'cambió desde ' + cuando(archivo.estado.entrada.primera));
        caja.appendChild(marca);
      }
      archivo.hojas.forEach(function (hoja) {
        var b = el('button', 'hoja' + (hoja.id === vista.hojaId ? ' activa' : ''));
        b.appendChild(document.createTextNode(hoja.nombre));
        var filas = hoja.filas.length - (hoja.encabezado ? 1 : 0);
        b.appendChild(el('span', 'cuenta', filas));
        b.onclick = function () {
          vista.hojaId = hoja.id;
          vista.barrerAlEntrar = true;
          vista.propagado = null;
          render();
        };
        caja.appendChild(b);
      });
      cont.appendChild(caja);
    });
  }

  /* ── Pestañas ─────────────────────────────────────────────────────── */

  var PESTANIAS = [
    { id: 'columnas', etiqueta: 'Columnas' },
    { id: 'entidades', etiqueta: 'Entidades' },
    { id: 'fusiones', etiqueta: 'Fusiones' },
    { id: 'previa', etiqueta: 'Vista previa' },
    { id: 'salida', etiqueta: 'Salida' },
    { id: 'reconstruir', etiqueta: 'Reconstruir' }
  ];

  function renderPestanias() {
    var nav = $('pestanias');
    vaciar(nav);
    var resumen = P.resumen();
    PESTANIAS.forEach(function (p) {
      var b = el('button', 'pestania' + (p.id === vista.pestania ? ' activa' : ''), p.etiqueta);
      var globo = null;
      if (p.id === 'columnas' && resumen.seudonimo) globo = String(resumen.seudonimo);
      if (p.id === 'entidades' && resumen.grupos) globo = String(resumen.grupos);
      if (p.id === 'fusiones' && vista.sugerencias) globo = String(vista.sugerencias.length);
      if (p.id === 'reconstruir' && vista.reconstruccion) {
        globo = String(vista.reconstruccion.informe.distintos.size);
      }
      if (globo) {
        var g = el('span', 'globo', globo);
        if (p.id === 'fusiones' && vista.sugerencias && vista.sugerencias.length) g.classList.add('alerta');
        b.appendChild(g);
      }
      b.onclick = function () {
        vista.pestania = p.id;
        if (p.id === 'previa') vista.barrerAlEntrar = true;
        vista.propagado = null;
        render();
      };
      nav.appendChild(b);
    });
    PESTANIAS.forEach(function (p) { $('panel-' + p.id).hidden = p.id !== vista.pestania; });
  }

  /* Clasificar una columna alcanza a las columnas con el mismo encabezado en el
   * resto de las planillas cargadas: el mismo formato se trata igual, y así el
   * resultado no depende del orden en que se soltaron los archivos. Pasa fuera
   * de la pantalla, así que se dice. */
  function anotarPropagacion(alcanzadas, col) {
    vista.propagado = alcanzadas ? { n: alcanzadas, nombre: col.nombre } : null;
  }

  function panelVacio(panel, titulo, texto) {
    var v = el('div', 'vacio');
    v.appendChild(el('b', null, titulo));
    v.appendChild(el('p', null, texto));
    panel.appendChild(v);
  }

  /* ── Tipos propios ────────────────────────────────────────────────── */

  /* El catálogo cubre lo habitual, pero cada organismo tiene datos que sólo
   * existen ahí: expediente, historia clínica, número de beneficio. Antes todo
   * eso caía en un tipo "otro", y eso era peor que no tenerlo: el tipo es el
   * espacio de nombres del token, así que dos datos que no tienen nada que ver
   * compartían bolsa y el mismo texto en dos columnas distintas terminaba
   * siendo la misma entidad. Ahora se crea un tipo por cada clase de dato. */

  /* Los id de tipo son [a-z0-9-], así que el "+" no puede chocar con ninguno. */
  var NUEVO_TIPO = '+nuevo';

  function opcionesNormalizador() {
    return Object.keys(T.ETIQUETAS_NORMALIZADOR).map(function (k) {
      return { valor: k, etiqueta: T.ETIQUETAS_NORMALIZADOR[k] };
    });
  }

  /* "nro_expediente" → "Nro expediente". Una propuesta para el nombre del tipo,
   * que el operador termina de escribir. */
  function nombreDesdeEncabezado(encabezado) {
    var t = String(encabezado || '').replace(/[_.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function textoTipo(uso) {
    if (!uso) {
      return 'El tipo es el espacio de nombres del token: dos entidades de tipos distintos nunca se cruzan, ' +
        'aunque el texto sea idéntico. Por eso conviene uno por cada clase de dato y no una bolsa común.';
    }
    if (uso.congelado) {
      return 'Ya acuñó ' + plural(uso.tokens || uso.entidades, 'token', 'tokens') +
        ', así que el prefijo y el criterio quedan fijos: cambiarlos les cambiaría el token a esas ' +
        'entidades y desalinearían lo que ya exportaste. El nombre sí se puede corregir.';
    }
    if (uso.columnas) {
      return plural(uso.columnas, 'columna usa este tipo', 'columnas usan este tipo') +
        ', pero todavía no acuñó ningún token: se puede cambiar entero.';
    }
    return 'Todavía no lo usa ninguna columna, así que se puede cambiar entero o borrar.';
  }

  /* Pide los datos de un tipo y lo crea, lo corrige o lo borra. Devuelve null
   * si el operador canceló y {tipo} si algo cambió —tipo es null cuando lo que
   * cambió fue un borrado—, para no reescanear ni ensuciar la bóveda de gusto.
   *
   * Si la validación lo rechaza —un prefijo repetido, por ejemplo— se reabre con
   * lo que el operador ya había escrito y el motivo arriba, en vez de hacerlo
   * empezar de nuevo. */
  function pedirTipo(id, valores, error) {
    var uso = id ? P.usoDeTipo(id) : null;
    var campos = [
      { nombre: 'etiqueta', tipo: 'text', etiqueta: 'Nombre', valor: valores.etiqueta || '' }
    ];
    if (!uso || !uso.congelado) {
      campos.push({
        nombre: 'prefijo', tipo: 'text', etiqueta: 'Prefijo del token',
        valor: valores.prefijo || '', marcador: 'se arma con el nombre',
        nota: 'Va antes del guion en cada token: expediente-4kf2m9pq.'
      });
      campos.push({
        nombre: 'norm', tipo: 'select', etiqueta: 'Qué cuenta como el mismo dato',
        valor: valores.norm || 'exacto', opciones: opcionesNormalizador(),
        nota: 'Dos valores que normalizan igual reciben el mismo token.'
      });
    }
    if (uso && !uso.congelado && !uso.columnas) {
      campos.push({ nombre: 'borrar', tipo: 'checkbox', etiqueta: 'Borrar este tipo' });
    }
    return dialogo({
      titulo: id ? 'Editar el tipo' : 'Crear un tipo',
      texto: textoTipo(uso),
      error: error,
      aceptar: id ? 'Guardar' : 'Crear',
      campos: campos
    }).then(function (v) {
      if (!v) return null;
      if (v.borrar) { P.quitarTipo(id); return { tipo: null }; }
      try {
        return { tipo: id ? P.editarTipo(id, v) : P.agregarTipo(v) };
      } catch (e) {
        return pedirTipo(id, v, e.message);
      }
    });
  }

  /* Crear el tipo desde la columna que lo necesita: se propone su encabezado
   * como nombre y, apenas existe, la columna queda clasificada con él. */
  function crearTipoPara(hoja, indice) {
    var col = hoja.columnas[indice];
    pedirTipo(null, { etiqueta: nombreDesdeEncabezado(col.generado ? '' : col.nombre) })
      .then(function (r) {
        if (!r) { render(); return; }
        if (r.tipo) P.configurarColumna(hoja, indice, 'seudonimo', r.tipo.id);
        reescanear();
      });
  }

  function administrarTipos() {
    var propios = P.tipos.filter(function (t) { return t.propio; });
    var opciones = propios.map(function (t) {
      var uso = P.usoDeTipo(t.id);
      return {
        valor: t.id,
        etiqueta: t.etiqueta,
        detalle: 'tokens ' + t.prefijo + '-… · ' + (T.ETIQUETAS_NORMALIZADOR[t.norm] || t.norm).toLowerCase() +
          ' · ' + (uso.entidades ? plural(uso.entidades, 'entidad', 'entidades') : 'sin entidades')
      };
    });
    opciones.push({ valor: NUEVO_TIPO, etiqueta: 'Crear un tipo', detalle: 'para un dato que no entra en ninguno' });
    elegir({
      titulo: 'Tipos propios',
      texto: propios.length
        ? 'Los que creaste vos. Los del catálogo no se editan.'
        : 'Todavía no creaste ninguno. El catálogo trae ' + (P.tipos.length - propios.length) +
          ' tipos; si tenés un dato que no entra en ninguno, hacete uno en vez de forzarlo.',
      opciones: opciones
    }).then(function (id) {
      if (!id) return null;
      if (id === NUEVO_TIPO) return pedirTipo(null, {});
      var t = P.tipoPorId(id);
      if (!t) return null;
      return pedirTipo(id, { etiqueta: t.etiqueta, prefijo: t.prefijo, norm: t.norm });
    }).then(function (r) {
      /* Cambiar el criterio de un tipo cambia qué valores colapsan, así que hay
       * que volver a escanear. Si no cambió nada, alcanza con redibujar. */
      if (r) reescanear(); else render();
    });
  }

  /* ── Columnas ─────────────────────────────────────────────────────── */

  function renderColumnas() {
    var panel = $('panel-columnas');
    vaciar(panel);
    var act = hojaActiva();
    if (!act) {
      panelVacio(panel, 'Empezá cargando una planilla',
        'Soltá los archivos en el panel de la izquierda. Nada se sube a ningún lado: todo se procesa en esta pestaña del navegador.');
      return;
    }
    var hoja = act.hoja;

    var franja = el('div', 'franja');
    franja.appendChild(el('span', null, act.archivo.nombre + ' › ' + hoja.nombre));

    var lblEnc = el('label');
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = hoja.encabezado;
    chk.onchange = function () {
      hoja.encabezado = chk.checked;
      hoja.columnas = P.columnasDe(hoja);
      reescanear();
    };
    lblEnc.appendChild(chk);
    lblEnc.appendChild(document.createTextNode('La primera fila son los encabezados'));
    franja.appendChild(lblEnc);

    franja.appendChild(el('span', null,
      plural(hoja.filas.length - (hoja.encabezado ? 1 : 0), 'fila', 'filas') + ' · ' +
      plural(hoja.columnas.length, 'columna', 'columnas')));

    var empuje = el('div', 'empuje');
    var btnTipos = el('button', 'fino', 'Tipos');
    btnTipos.title = 'Crear o corregir tipos propios, para los datos que no entran en el catálogo';
    btnTipos.onclick = administrarTipos;
    empuje.appendChild(btnTipos);
    var btnTodo = el('button', 'fino', 'Conservar todas');
    btnTodo.onclick = function () {
      hoja.columnas.forEach(function (c, i) { P.configurarColumna(hoja, i, 'conservar', null); });
      reescanear();
    };
    empuje.appendChild(btnTodo);
    franja.appendChild(empuje);
    panel.appendChild(franja);

    if (vista.propagado) {
      panel.appendChild(el('div', 'aviso neutro',
        'Lo que elegiste para "' + vista.propagado.nombre + '" se aplicó también en ' +
        plural(vista.propagado.n, 'columna de otra planilla cargada', 'columnas de otras planillas cargadas') +
        ': el mismo encabezado se trata igual en todo el proyecto.'));
    }

    var tabla = el('table', 'tabla-columnas');
    var thead = el('thead');
    var trh = el('tr');
    ['Columna', 'Muestra', 'Qué hacer', 'Tipo', 'Parte de'].forEach(function (t) { trh.appendChild(el('th', null, t)); });
    thead.appendChild(trh);
    tabla.appendChild(thead);

    var tbody = el('tbody');
    hoja.columnas.forEach(function (col, i) {
      var tr = el('tr');
      tr.dataset.accion = col.accion;
      /* Una columna marcada para seudonimizar pero sin tipo no se sustituye: el
       * tipo es lo que define el token. Sale en claro igual que una conservada,
       * así que se avisa con la misma fuerza. */
      var faltaTipo = col.accion === 'seudonimo' && !col.tipo;
      var enClaro = faltaTipo || (col.accion === 'conservar' && col.sugerido);
      if (enClaro) tr.dataset.alerta = '1';

      var tdN = el('td');
      var nom = el('div', 'col-nombre', col.nombre);
      tdN.appendChild(nom);
      var meta = plural(col.distintos, 'valor distinto', 'valores distintos');
      if (col.vacias > 0) meta += ' · ' + col.vacias + ' vacías';
      tdN.appendChild(el('div', 'col-meta', meta));
      if (enClaro) {
        var tipoSug = P.tipoPorId(col.sugerido);
        tdN.appendChild(el('span', 'marca-riesgo', faltaTipo
          ? 'sale en claro · falta elegir el tipo'
          : 'sale en claro · parece ' + (tipoSug ? tipoSug.etiqueta.toLowerCase() : col.sugerido)));
      }
      tr.appendChild(tdN);

      var tdM = el('td', 'muestra');
      col.muestra.slice(0, 3).forEach(function (v) { tdM.appendChild(el('span', null, v)); });
      if (!col.muestra.length) tdM.appendChild(el('span', null, '—'));
      tr.appendChild(tdM);

      var tdA = el('td');
      var selA = document.createElement('select');
      Object.keys(M.ACCIONES).forEach(function (a) {
        var o = document.createElement('option');
        o.value = a;
        o.textContent = M.ACCIONES[a];
        if (a === col.accion) o.selected = true;
        selA.appendChild(o);
      });
      selA.onchange = function () {
        anotarPropagacion(P.configurarColumna(hoja, i, selA.value, col.tipo || col.sugerido || null), col);
        reescanear();
      };
      tdA.appendChild(selA);
      tr.appendChild(tdA);

      var tdT = el('td');
      var selT = document.createElement('select');
      if (col.accion !== 'seudonimo' || !col.tipo) {
        /* Sin esto el selector muestra el primer tipo de la lista y parece que
         * la columna se va a seudonimizar como persona. */
        var vacio = document.createElement('option');
        vacio.value = '';
        vacio.textContent = col.accion === 'seudonimo' ? 'elegí el tipo' : '—';
        vacio.selected = true;
        selT.appendChild(vacio);
      }
      P.tipos.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.etiqueta;
        if (t.id === col.tipo) o.selected = true;
        selT.appendChild(o);
      });
      var nuevo = document.createElement('option');
      nuevo.value = NUEVO_TIPO;
      nuevo.textContent = '+ Tipo nuevo…';
      selT.appendChild(nuevo);
      selT.disabled = col.accion !== 'seudonimo';
      selT.onchange = function () {
        if (selT.value === NUEVO_TIPO) {
          selT.value = col.tipo || '';
          crearTipoPara(hoja, i);
          return;
        }
        anotarPropagacion(P.configurarColumna(hoja, i, 'seudonimo', selT.value || null), col);
        reescanear();
      };
      tdT.appendChild(selT);
      if (col.accion === 'escanear') {
        tdT.appendChild(el('div', 'col-meta', 'busca acá las entidades ya conocidas'));
      }
      tr.appendChild(tdT);

      tr.appendChild(celdaCampo(hoja, col, i));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    panel.appendChild(tabla);
  }

  /* Celda "Parte de": declara que esta columna es un pedazo de un dato que vive
   * repartido en varias. El caso típico es nombre + apellido. */
  function celdaCampo(hoja, col, indice) {
    var td = el('td');
    if (col.accion !== 'seudonimo') { td.appendChild(el('span', 'col-meta', '—')); return td; }

    var socias = hoja.columnas.filter(function (c) {
      return c !== col && c.campo && c.campo === col.campo;
    });
    if (socias.length) {
      td.appendChild(el('div', 'campo', socias.map(function (c) { return c.nombre; }).join(' + ')));
      if (col.origen === 'compuesto') {
        td.appendChild(el('div', 'col-meta', 'unidas automáticamente'));
      }
      var separar = el('button', 'fino', 'Separar');
      separar.onclick = function () {
        anotarPropagacion(P.componer(hoja, indice, null), col);
        reescanear();
      };
      td.appendChild(separar);
      return td;
    }

    var candidatas = hoja.columnas.filter(function (c) {
      return c !== col && c.accion === 'seudonimo' && c.tipo === col.tipo;
    });
    if (!candidatas.length) { td.appendChild(el('span', 'col-meta', '—')); return td; }

    var sel = document.createElement('select');
    var vacio = document.createElement('option');
    vacio.value = ''; vacio.textContent = 'sola';
    sel.appendChild(vacio);
    candidatas.forEach(function (c) {
      var o = document.createElement('option');
      o.value = String(hoja.columnas.indexOf(c));
      o.textContent = 'con ' + c.nombre;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      anotarPropagacion(P.componer(hoja, indice, sel.value === '' ? null : Number(sel.value)), col);
      reescanear();
    };
    td.appendChild(sel);
    return td;
  }

  /* ── Entidades ────────────────────────────────────────────────────── */

  function renderEntidades() {
    var panel = $('panel-entidades');
    vaciar(panel);
    var grupos = P.inventario(vista.filtroTipo || null);

    var franja = el('div', 'franja');
    var selT = document.createElement('select');
    var todos = document.createElement('option');
    todos.value = ''; todos.textContent = 'Todos los tipos';
    selT.appendChild(todos);
    P.tipos.forEach(function (t) {
      if (!P.registro.porTipo[t.id] || !P.registro.porTipo[t.id].size) return;
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.etiqueta + ' (' + P.registro.porTipo[t.id].size + ')';
      if (t.id === vista.filtroTipo) o.selected = true;
      selT.appendChild(o);
    });
    selT.onchange = function () { vista.filtroTipo = selT.value; render(); };
    franja.appendChild(selT);

    var buscar = document.createElement('input');
    buscar.type = 'search';
    buscar.placeholder = 'buscar un valor o un token';
    buscar.value = vista.busqueda;
    /* render() reconstruye el panel entero, así que hay que devolverle el foco
     * y el cursor al campo nuevo o el operador pierde el tipeo. */
    buscar.oninput = function () {
      var cursor = buscar.selectionStart;
      vista.busqueda = buscar.value;
      render();
      var nuevo = document.querySelector('#panel-entidades input[type="search"]');
      if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(cursor, cursor); }
    };
    franja.appendChild(buscar);

    var n = vista.seleccion.size;
    var btnFusionar = el('button', n >= 2 ? 'primario' : '', 'Es la misma entidad (' + n + ')');
    btnFusionar.disabled = n < 2;
    btnFusionar.onclick = fusionarSeleccion;
    franja.appendChild(btnFusionar);

    if (n) {
      var btnLimpiar = el('button', 'fino', 'Deseleccionar');
      btnLimpiar.onclick = function () { vista.seleccion.clear(); render(); };
      franja.appendChild(btnLimpiar);
    }
    panel.appendChild(franja);

    if (!grupos.length) {
      panelVacio(panel, 'Todavía no hay entidades',
        'Marcá alguna columna como "Seudonimizar" en la pestaña Columnas y acá vas a ver cada valor real con el token que le tocó.');
      return;
    }

    var q = M.tipos.base(vista.busqueda);
    var filtrados = !q ? grupos : grupos.filter(function (g) {
      if (g.token.indexOf(q) >= 0 || g.grupo.indexOf(q) >= 0) return true;
      var hay = false;
      g.superficies.forEach(function (c, s) { if (M.tipos.base(s).indexOf(q) >= 0) hay = true; });
      return hay;
    });

    var nota = el('div', 'franja');
    nota.appendChild(el('span', null,
      plural(filtrados.length, 'entidad', 'entidades') +
      (filtrados.length > TOPE_LISTA ? ' · se muestran las ' + TOPE_LISTA + ' más frecuentes' : '') +
      ' · seleccioná dos o más y confirmá que son la misma'));
    panel.appendChild(nota);

    var tabla = el('table');
    var thead = el('thead');
    var trh = el('tr');
    ['', 'Token', 'Formas encontradas', 'Apariciones', ''].forEach(function (t) { trh.appendChild(el('th', null, t)); });
    thead.appendChild(trh);
    tabla.appendChild(thead);
    var tbody = el('tbody');

    filtrados.slice(0, TOPE_LISTA).forEach(function (g) {
      var id = g.tipo.id + SEP + g.grupo;
      var tr = el('tr', g.claves.length > 1 ? 'grupo-fusionado' : '');

      var tdC = el('td');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = vista.seleccion.has(id);
      chk.onchange = function () {
        if (chk.checked) vista.seleccion.add(id); else vista.seleccion.delete(id);
        render();
      };
      tdC.appendChild(chk);
      tr.appendChild(tdC);

      var tdT = el('td');
      tdT.appendChild(el('span', 'token', g.token));
      tdT.appendChild(el('div', 'col-meta', g.tipo.etiqueta));
      tr.appendChild(tdT);

      var tdS = el('td');
      var caja = el('div', 'superficies');
      var formas = Array.from(g.superficies.entries()).sort(function (a, b) { return b[1] - a[1]; });
      formas.slice(0, 8).forEach(function (f) {
        var s = el('span', 'superficie', f[0] + ' ');
        s.appendChild(el('i', null, '×' + f[1]));
        caja.appendChild(s);
      });
      if (formas.length > 8) caja.appendChild(el('span', 'superficie', '+' + (formas.length - 8) + ' más'));
      tdS.appendChild(caja);
      if (g.claves.length > 1) {
        tdS.appendChild(el('div', 'col-meta', plural(g.claves.length, 'valor fusionado', 'valores fusionados')));
      }
      tr.appendChild(tdS);

      tr.appendChild(el('td', 'mono', g.total));

      var tdA = el('td');
      if (g.claves.length > 1) {
        var sep = el('button', 'fino', 'Separar');
        sep.onclick = function () {
          g.claves.forEach(function (c) { P.fusiones.separar(g.tipo.id, c); });
          P.acunar();
          anotar('separación');
          vista.sugerencias = null;
          render();
        };
        tdA.appendChild(sep);
      }
      tr.appendChild(tdA);
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    panel.appendChild(tabla);
  }

  function fusionarSeleccion() {
    var ids = Array.from(vista.seleccion);
    var porTipo = {};
    ids.forEach(function (id) {
      var corte = id.indexOf(SEP);
      var tipo = id.slice(0, corte), grupo = id.slice(corte + 1);
      (porTipo[tipo] = porTipo[tipo] || []).push(grupo);
    });
    var tipos = Object.keys(porTipo);
    if (tipos.length > 1) {
      avisar('No se pueden fusionar entre tipos distintos',
        'Seleccionaste entidades de ' + tipos.length + ' tipos. Una persona y una empresa son entidades distintas incluso si se llaman igual: fusionalas de a un tipo por vez.');
      return;
    }
    var tipo = tipos[0];
    var grupos = porTipo[tipo];
    for (var i = 1; i < grupos.length; i++) P.fusiones.unir(tipo, grupos[0], grupos[i]);
    P.acunar();
    anotar('fusión');
    vista.seleccion.clear();
    vista.sugerencias = null;
    render();
  }

  /* ── Fusiones sugeridas ───────────────────────────────────────────── */

  function renderFusiones() {
    var panel = $('panel-fusiones');
    vaciar(panel);

    var franja = el('div', 'franja');
    franja.appendChild(el('span', null, 'Parecido mínimo'));
    var rango = document.createElement('input');
    rango.type = 'range';
    rango.min = '0.70'; rango.max = '0.98'; rango.step = '0.01';
    rango.value = String(P.umbral);
    var lectura = el('code', null, P.umbral.toFixed(2));
    rango.oninput = function () { lectura.textContent = Number(rango.value).toFixed(2); };
    rango.onchange = function () {
      P.umbral = Number(rango.value);
      vista.sugerencias = null;
      anotar('umbral');
      render();
    };
    franja.appendChild(rango);
    franja.appendChild(lectura);

    var btn = el('button', '', vista.sugerencias ? 'Buscar de nuevo' : 'Buscar duplicados');
    btn.onclick = function () { vista.sugerencias = P.sugerencias(); render(); };
    franja.appendChild(btn);
    panel.appendChild(franja);

    if (!vista.sugerencias) {
      panelVacio(panel, 'Buscá duplicados que la normalización no alcanza a ver',
        'Los que sólo cambian el orden de las palabras, las tildes o la forma jurídica ya se unificaron solos. Esta búsqueda va por lo que queda: erratas, iniciales y nombres incompletos.');
      return;
    }
    if (!vista.sugerencias.length) {
      panelVacio(panel, 'No quedan duplicados por encima de ' + P.umbral.toFixed(2),
        'Podés bajar el parecido mínimo para revisar candidatos más flojos, o fusionar a mano desde la pestaña Entidades.');
      return;
    }

    var nota = el('div', 'franja');
    nota.appendChild(el('span', null, plural(vista.sugerencias.length, 'par por revisar', 'pares por revisar')));
    panel.appendChild(nota);

    var lista = el('div');
    vista.sugerencias.slice(0, TOPE_LISTA).forEach(function (par) {
      lista.appendChild(filaSugerencia(par));
    });
    panel.appendChild(lista);
  }

  function formasDe(tipoId, clave) {
    var mapa = P.registro.porTipo[tipoId];
    var e = mapa && mapa.get(clave);
    if (!e) return [clave];
    return Array.from(e.muestras.entries())
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (x) { return x[0]; });
  }

  function filaSugerencia(par) {
    var fila = el('div', 'par');
    var tipo = P.tipoPorId(par.tipo);

    [par.a, par.b].forEach(function (clave, i) {
      var lado = el('div', 'lado' + (i ? ' der' : ''));
      var formas = formasDe(par.tipo, clave);
      lado.appendChild(el('div', 'principal-txt', formas[0]));
      var resto = formas.slice(1, 3).join(' · ');
      lado.appendChild(el('div', 'otras', (tipo ? tipo.etiqueta : par.tipo) + (resto ? ' · ' + resto : '')));
      if (i === 0) {
        fila.appendChild(lado);
        var p = el('div', 'puntaje' + (par.puntaje >= 0.92 ? ' alto' : ''), par.puntaje.toFixed(2));
        fila.appendChild(p);
      } else {
        fila.appendChild(lado);
      }
    });

    var botones = el('div', 'botones');
    var si = el('button', 'primario', 'Es la misma');
    si.onclick = function () {
      P.fusiones.unir(par.tipo, par.a, par.b);
      P.acunar();
      anotar('fusión');
      vista.sugerencias = vista.sugerencias.filter(function (x) { return x !== par; });
      render();
    };
    var no = el('button', '', 'Son distintas');
    no.onclick = function () {
      P.fusiones.rechazar(par.tipo, par.a, par.b);
      anotar('descarte');
      vista.sugerencias = vista.sugerencias.filter(function (x) { return x !== par; });
      render();
    };
    botones.appendChild(si);
    botones.appendChild(no);
    fila.appendChild(botones);
    return fila;
  }

  /* ── Vista previa ─────────────────────────────────────────────────── */

  function renderPrevia() {
    var panel = $('panel-previa');
    vaciar(panel);
    var act = hojaActiva();
    if (!act) {
      panelVacio(panel, 'No hay nada que previsualizar', 'Cargá una planilla para ver cómo queda.');
      return;
    }
    var hoja = act.hoja;
    var buscador = P.necesitaBuscador() ? P.buscadorTexto() : null;
    var salida = P.transformar(act.archivo, hoja, FILAS_PREVIA, buscador);
    var desde = hoja.encabezado ? 1 : 0;

    var franja = el('div', 'franja');
    franja.appendChild(el('span', null,
      act.archivo.nombre + ' › ' + hoja.nombre + ' · primeras ' +
      plural(salida.length - desde, 'fila', 'filas')));

    var lbl = el('label');
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = vista.mostrarOriginales;
    chk.onchange = function () {
      vista.mostrarOriginales = chk.checked;
      vista.barrerAlEntrar = true;
      render();
    };
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode('Ver los valores originales'));
    franja.appendChild(lbl);
    panel.appendChild(franja);

    var tabla = el('table', 'tabla-previa');
    var thead = el('thead');
    var trh = el('tr');
    hoja.columnas.forEach(function (col) {
      var th = el('th', null, col.nombre);
      if (col.accion === 'seudonimo') th.style.color = 'var(--token)';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tabla.appendChild(thead);

    var tbody = el('tbody');
    var aAnimar = [];
    for (var r = desde; r < salida.length; r++) {
      var tr = el('tr');
      for (var c = 0; c < hoja.columnas.length; c++) {
        var col = hoja.columnas[c];
        var antes = IO.texto(hoja.filas[r][col.indice]);
        var despues = IO.texto(salida[r][col.indice]);
        var td = el('td', 'celda');
        if (antes === despues) {
          td.textContent = antes;
        } else {
          td.classList.add(col.accion === 'vaciar' ? 'vaciada' : 'sustituida');
          if (vista.mostrarOriginales) td.classList.add('original');
          td.textContent = vista.mostrarOriginales ? antes : despues;
          td.title = vista.mostrarOriginales ? despues : antes;
          aAnimar.push({ td: td, columna: c });
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    panel.appendChild(tabla);

    if (!aAnimar.length) {
      var pie = el('div', 'aviso neutro', 'Esta hoja sale igual que entró: ninguna de sus columnas está marcada para sustituir.');
      panel.appendChild(pie);
      return;
    }
    if (vista.barrerAlEntrar) {
      vista.barrerAlEntrar = false;
      barrer(aAnimar, hoja);
    }
  }

  /* El barrido: cada celda sustituida se tapa con una barra de tinta que la
   * cruza y descubre el valor nuevo. Es la única animación de la herramienta,
   * y está donde ocurre lo importante. */
  function barrer(celdas, hoja) {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    celdas.forEach(function (item) {
      var retraso = item.columna * 45;
      var texto = item.td.textContent;
      var alterno = item.td.title;
      item.td.textContent = alterno;
      item.td.style.setProperty('--retraso', retraso + 'ms');
      item.td.classList.add('barriendo');
      setTimeout(function () { item.td.textContent = texto; }, retraso + 190);
      setTimeout(function () { item.td.classList.remove('barriendo'); }, retraso + 420);
    });
    void hoja;
  }

  /* ── Salida ───────────────────────────────────────────────────────── */

  function renderSalida() {
    var panel = $('panel-salida');
    vaciar(panel);
    var r = P.resumen();

    var cifras = el('div', 'cifras');
    [
      { n: r.filas, e: 'filas', clase: '' },
      { n: r.seudonimo, e: 'columnas sustituidas', clase: 'acento' },
      { n: r.grupos, e: 'entidades distintas', clase: 'acento' },
      { n: r.conservar, e: 'columnas intactas', clase: '' }
    ].forEach(function (c) {
      var caja = el('div', 'cifra');
      caja.appendChild(el('div', 'n ' + c.clase, c.n));
      caja.appendChild(el('div', 'e', c.e));
      cifras.appendChild(caja);
    });
    panel.appendChild(cifras);

    sinTratar().forEach(function (texto) {
      panel.appendChild(el('div', 'aviso', texto));
    });
    P.avisos.forEach(function (a) { panel.appendChild(el('div', 'aviso neutro', a)); });

    /* Una planilla desensibilizada sin una copia de su bóveda en el disco es un
     * archivo que nadie va a poder cruzar ni reconstruir. Guardar dentro del
     * navegador no alcanza: si se borran los datos del sitio se va con ellos. */
    var g = vista.guardado;
    var trabado = g && !g.copiaEnDisco();
    if (trabado) {
      var aviso = el('div', 'aviso');
      aviso.appendChild(document.createTextNode(
        g.estado === 'error'
          ? 'La bóveda no se pudo guardar: ' + g.detalle + ' Hasta que se guarde, las planillas no se descargan.'
          : vista.almacen.enDisco
            ? 'La bóveda tiene cambios sin guardar. Guardala y después descargá las planillas.'
            : 'Falta una copia de la bóveda en el disco. Está guardada dentro del navegador, pero eso se pierde si se borran los datos del sitio.'));
      var ya = el('button', 'primario', vista.almacen.enDisco ? 'Guardar la bóveda ahora' : 'Bajar la bóveda (.zip)');
      ya.style.marginLeft = '10px';
      ya.onclick = function () { guardarOBajar().then(render, render); };
      aviso.appendChild(ya);
      panel.appendChild(aviso);
    }

    var bloques = el('div', 'bloques');

    var b1 = el('div', 'bloque');
    b1.appendChild(el('h3', null, 'Planillas desensibilizadas'));
    b1.appendChild(el('p', null, 'Mismo formato que el original. Las columnas conservadas salen sin tocar.'));
    var fila1 = el('div', 'fila-btn');
    P.archivos.forEach(function (a) {
      var btn = el('button', '', a.nombre);
      btn.disabled = trabado;
      btn.onclick = function () { exportar([a]); };
      fila1.appendChild(btn);
    });
    if (P.archivos.length > 1) {
      var todos = el('button', 'primario', 'Descargar todas');
      todos.disabled = trabado;
      todos.onclick = function () { exportar(P.archivos); };
      fila1.appendChild(todos);
    }
    if (!P.archivos.length) fila1.appendChild(el('p', null, 'No hay archivos cargados.'));
    b1.appendChild(fila1);
    bloques.appendChild(b1);

    var b2 = el('div', 'bloque');
    b2.appendChild(el('h3', null, 'Bóveda'));
    b2.appendChild(el('p', null, vista.almacen.modo === 'navegador'
      ? 'Se guarda sola dentro de este navegador con cada cambio, pero eso no es un respaldo: bajate el .zip, que se descomprime en exactamente la carpeta del proyecto y se abre en Chrome. Contiene los valores reales al lado de su token.'
      : vista.almacen.autoguarda
        ? 'Se guarda sola en ' + vista.almacen.descripcion() + ' con cada cambio. Contiene los valores reales al lado de su token: cuidala como a los datos originales.'
        : 'Este navegador no deja escribir en una carpeta, así que la bóveda se baja como un archivo único y la guardás vos. Contiene los valores reales al lado de su token.'));
    var fila2 = el('div', 'fila-btn');
    var guardar = el('button', trabado ? 'primario' : '',
      vista.almacen.enDisco ? 'Guardar bóveda' : 'Bajar bóveda (.zip)');
    guardar.onclick = function () { guardarOBajar().then(render, render); };
    fila2.appendChild(guardar);
    var mapa = el('button', '', 'Mapa inverso (CSV)');
    mapa.onclick = function () {
      IO.exportarCSVCrudo(B.filasDelMapa(P), 'mist-mapa-' + P.huella() + '.csv');
    };
    fila2.appendChild(mapa);
    b2.appendChild(fila2);
    bloques.appendChild(b2);

    panel.appendChild(bloques);
    renderHistorial(panel);
  }

  /* En modo carpeta o archivo, guardar ya deja la copia en el disco. En modo
   * navegador hay dos gestos distintos y el que importa para la compuerta es
   * bajar el zip. */
  function guardarOBajar() {
    var g = vista.guardado;
    if (vista.almacen.enDisco) return g.guardar();
    return g.guardar().then(function () { return g.bajarCopia(); });
  }

  /* Exportar deja rastro en el historial, así que también hay que guardarlo.
   * Las descargas van espaciadas porque el navegador se atraganta si le llegan
   * varias juntas. */
  function exportar(archivos) {
    archivos.forEach(function (a, i) {
      setTimeout(function () {
        P.exportarArchivo(a);
        if (i === archivos.length - 1) { anotar('exportación'); render(); }
      }, i * 350);
    });
  }

  /* Lo que pasó por el proyecto, esté cargado ahora o no. Es la respuesta a
   * "¿esta planilla ya la hice?" cuando llega la tanda del mes siguiente. */
  function renderHistorial(panel) {
    if (!P.historial.length) return;
    var franja = el('div', 'franja');
    franja.appendChild(el('span', null,
      'Historial del proyecto · ' + plural(P.historial.length, 'archivo', 'archivos') +
      ' desde ' + cuando(P.historial[0].primera)));
    panel.appendChild(franja);

    var tabla = el('table', 'tabla-historial');
    var thead = el('thead');
    var trh = el('tr');
    ['Archivo', 'Contenido', 'Procesado', 'Exportado', 'Veces'].forEach(function (t) {
      trh.appendChild(el('th', null, t));
    });
    thead.appendChild(trh);
    tabla.appendChild(thead);

    var cargadas = {};
    P.archivos.forEach(function (a) { if (a.huella) cargadas[a.huella] = true; });

    var tbody = el('tbody');
    P.historial.slice().sort(function (a, b) {
      return (b.ultima || '') < (a.ultima || '') ? -1 : 1;
    }).forEach(function (e) {
      var tr = el('tr');
      var tdN = el('td');
      tdN.appendChild(el('div', 'col-nombre', e.nombre));
      tdN.appendChild(el('div', 'col-meta',
        e.hojas.map(function (h) { return h.nombre + ' · ' + plural(h.filas, 'fila', 'filas'); }).join(' | ')));
      if (cargadas[e.huella]) tdN.appendChild(el('span', 'marca-cargado', 'cargado ahora'));
      tr.appendChild(tdN);
      tr.appendChild(el('td', 'mono', e.huella ? e.huella.slice(0, 8) : '—'));
      tr.appendChild(el('td', null, cuando(e.ultima)));
      var tdE = el('td', e.exportado ? '' : 'sin-exportar', cuando(e.exportado));
      tr.appendChild(tdE);
      tr.appendChild(el('td', 'mono', e.veces));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    panel.appendChild(tabla);
  }

  function sinTratar() {
    var avisos = [];
    var nombres = function (cols) {
      return cols.map(function (c) { return '"' + c.nombre + '"'; }).join(', ');
    };
    P.archivos.forEach(function (a) {
      a.hojas.forEach(function (h) {
        var donde = a.nombre + ' › ' + h.nombre + ': ';
        var flojas = h.columnas.filter(function (c) { return c.accion === 'conservar' && c.sugerido; });
        if (flojas.length) {
          avisos.push(donde + nombres(flojas) +
            (flojas.length === 1 ? ' sale en claro y parece un dato sensible.' : ' salen en claro y parecen datos sensibles.'));
        }
        /* Marcada para seudonimizar pero sin tipo: la planilla sale igual que
         * entró y es fácil no darse cuenta, porque la acción dice lo contrario. */
        var sinTipo = h.columnas.filter(function (c) { return c.accion === 'seudonimo' && !c.tipo; });
        if (sinTipo.length) {
          avisos.push(donde + nombres(sinTipo) + (sinTipo.length === 1 ? ' está marcada' : ' están marcadas') +
            ' para seudonimizar pero sin tipo, así que ' + (sinTipo.length === 1 ? 'sale' : 'salen') +
            ' en claro. Elegile' + (sinTipo.length === 1 ? '' : 's') + ' uno en la pestaña Columnas.');
        }
      });
    });
    return avisos;
  }


  /* ── Reconstruir ──────────────────────────────────────────────────── */

  /* La vuelta del ciclo. El analista trabajó con tokens y devuelve un archivo
   * con tokens: una consulta guardada, un informe, un recorte. Acá se le vuelven
   * a poner los valores reales, que están en la bóveda y en ningún otro lado.
   *
   * No hace falta que el archivo haya salido de MIST ni que conserve las
   * columnas originales: los tokens se reconocen por su forma, estén solos en
   * una celda o mencionados dentro de una frase. */

  function mostrarReconstruccion(datos) {
    var r = P.reconstruir(datos.hojas);
    vista.reconstruccion = { datos: datos, hojas: r.hojas, informe: r.informe, hoja: 0 };
    vista.pestania = 'reconstruir';
    render();
  }

  function cargarParaReconstruir(archivo) {
    if (!archivo) return;
    IO.leerArchivo(archivo)
      .then(mostrarReconstruccion)
      .catch(function (e) { avisar('No se pudo leer el archivo', e.message); });
  }

  function renderReconstruir() {
    var panel = $('panel-reconstruir');
    vaciar(panel);
    var rec = vista.reconstruccion;

    var franja = el('div', 'franja');
    franja.appendChild(el('span', null, rec ? rec.datos.nombre : 'Ningún archivo para reconstruir'));
    if (rec && rec.hojas.length > 1) {
      var selH = document.createElement('select');
      rec.hojas.forEach(function (h, i) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = h.nombre;
        if (i === rec.hoja) o.selected = true;
        selH.appendChild(o);
      });
      selH.onchange = function () { rec.hoja = Number(selH.value); render(); };
      franja.appendChild(selH);
    }
    var empuje = el('div', 'empuje');
    var elegir = el('button', rec ? 'fino' : 'primario', rec ? 'Elegir otro' : 'Elegir un archivo');
    elegir.onclick = function () { $('entrada-reconstruir').click(); };
    empuje.appendChild(elegir);
    franja.appendChild(empuje);
    panel.appendChild(franja);

    if (!rec) {
      var vacio = el('div', 'vacio');
      vacio.appendChild(el('b', null, 'Traé de vuelta un archivo con tokens'));
      vacio.appendChild(el('p', null,
        'El resultado de una consulta, un informe, un recorte: cualquier planilla con tokens de este proyecto ' +
        'vuelve a tener los valores reales. Los tokens se reconocen por su forma, así que no importa si las ' +
        'columnas cambiaron de nombre ni si el token está suelto en una celda o mencionado dentro de una frase.'));
      /* El mismo gesto que para cargar planillas, pero acá adentro: parado en
       * esta pestaña, lo que se suelta se reconstruye. */
      var zona = el('button', 'soltar');
      zona.appendChild(el('b', null, 'Soltá acá el archivo'));
      zona.appendChild(document.createTextNode('CSV, TSV, XLSX, XLS u ODS'));
      zona.style.maxWidth = '420px';
      zona.onclick = function () { $('entrada-reconstruir').click(); };
      vacio.appendChild(zona);
      panel.appendChild(vacio);
      return;
    }

    var inf = rec.informe;
    var cifras = el('div', 'cifras');
    [
      { n: inf.tokens, e: 'tokens recuperados', clase: 'acento' },
      { n: inf.distintos.size, e: 'entidades distintas', clase: 'acento' },
      { n: inf.celdas, e: 'celdas con datos reales', clase: '' },
      { n: inf.ajenos.size, e: 'tokens de otra bóveda', clase: inf.ajenos.size ? 'alerta' : '' }
    ].forEach(function (c) {
      var caja = el('div', 'cifra');
      caja.appendChild(el('div', 'n ' + c.clase, c.n));
      caja.appendChild(el('div', 'e', c.e));
      cifras.appendChild(caja);
    });
    panel.appendChild(cifras);

    if (!inf.tokens) {
      panel.appendChild(el('div', 'aviso',
        'No se reconoció ningún token de este proyecto. Fijate que sea la bóveda correcta: la huella de la ' +
        'clave que usaste para desensibilizar tiene que ser ' + P.huella() + '.'));
    }
    if (inf.ajenos.size) {
      var muestra = Array.from(inf.ajenos.keys()).slice(0, 4).join(', ');
      panel.appendChild(el('div', 'aviso',
        plural(inf.ajenos.size, 'token tiene', 'tokens tienen') + ' la forma de este proyecto pero no ' +
        (inf.ajenos.size === 1 ? 'está' : 'están') + ' en su bóveda (' + muestra +
        (inf.ajenos.size > 4 ? ', …' : '') + '). Salieron de otra clave maestra: quedan como están.'));
    }
    if (inf.mudos) {
      panel.appendChild(el('div', 'aviso neutro',
        plural(inf.mudos, 'token del proyecto no tiene', 'tokens del proyecto no tienen') +
        ' guardado su valor original, así que no se pueden responder. Son los que se acuñaron dentro de un ' +
        'texto libre sin haber aparecido nunca en una columna clasificada.'));
    }
    panel.appendChild(el('div', 'aviso neutro',
      'Lo que sale de acá tiene los datos reales adentro: cuidalo como a las planillas originales.'));

    var bloque = el('div', 'fila-btn');
    var bajar = el('button', 'primario', 'Descargar reconstruido');
    bajar.disabled = !inf.tokens;
    bajar.onclick = function () { IO.exportarArchivo(rec.datos, rec.hojas, 'reconstruido'); };
    bloque.appendChild(bajar);
    panel.appendChild(bloque);

    panel.appendChild(tablaReconstruida(rec));
  }

  /* La misma lectura que la vista previa, al revés: se marca la celda que
   * recuperó su valor y el título muestra el token que había. */
  function tablaReconstruida(rec) {
    var original = rec.datos.hojas[rec.hoja];
    var salida = rec.hojas[rec.hoja];
    var tabla = el('table', 'tabla-previa');
    var cuerpo = el('tbody');
    var hasta = Math.min(salida.filas.length, FILAS_PREVIA);
    for (var r = 0; r < hasta; r++) {
      var tr = el('tr');
      for (var c = 0; c < salida.filas[r].length; c++) {
        var antes = IO.texto(original.filas[r][c]);
        var despues = IO.texto(salida.filas[r][c]);
        var td = el('td', 'celda');
        td.textContent = despues;
        if (antes !== despues) {
          td.classList.add('sustituida');
          td.title = antes;
        }
        tr.appendChild(td);
      }
      cuerpo.appendChild(tr);
    }
    tabla.appendChild(cuerpo);
    return tabla;
  }

  /* ── Proyecto ─────────────────────────────────────────────────────── */

  function pedirFrase(titulo, texto, aceptar, nueva) {
    return dialogo({
      titulo: titulo,
      texto: texto,
      aceptar: aceptar,
      campos: [{
        nombre: 'frase', tipo: 'password',
        etiqueta: nueva ? 'Frase para cifrar la bóveda (vacía = sin cifrar)' : 'Frase',
        autocompletar: nueva ? 'new-password' : 'current-password'
      }]
    }).then(function (v) { return v ? v.frase : null; });
  }

  function abrirApp(almacen) {
    vista.almacen = almacen;
    /* La pestaña Salida depende del estado del guardado (ahí está la compuerta),
     * así que se redibuja cuando ese estado cambia. */
    vista.guardado = new A.Guardado(P, almacen, function () {
      renderBarra();
      if (vista.pestania === 'salida') renderSalida();
    });
    vista.hojaId = null;
    /* Una reconstrucción es de la bóveda con la que se hizo: al cambiar de
     * proyecto deja de querer decir nada. */
    vista.reconstruccion = null;
    $('portada').hidden = true;
    $('cuerpo').hidden = false;
    $('caja-proyecto').hidden = false;
    $('caja-clave').hidden = false;
    $('acciones-barra').hidden = false;
    render();
  }

  function crearProyecto() {
    var campos = [{ nombre: 'nombre', tipo: 'text', etiqueta: 'Nombre del proyecto', valor: 'proyecto' }];
    if (B.hayCifrado()) {
      campos.push({ nombre: 'frase', tipo: 'password',
        etiqueta: 'Frase para cifrar la bóveda (vacía = sin cifrar)', autocompletar: 'new-password' });
    }
    var conCarpeta = A.hayCarpetas();
    var datos = null;

    dialogo({
      titulo: 'Crear un proyecto',
      texto: conCarpeta
        ? 'Después vas a elegir una carpeta vacía. MIST escribe ahí la bóveda y la mantiene al día sola.'
        : 'El proyecto se va a guardar solo dentro de este navegador. Para tenerlo en el disco vas a bajar un .zip que se descomprime en la carpeta del proyecto — y MIST no te va a dejar exportar planillas hasta que esa copia esté al día.',
      aceptar: conCarpeta ? 'Elegir carpeta' : 'Crear',
      campos: campos
    }).then(function (v) {
      if (!v) return null;
      datos = { nombre: (v.nombre || 'proyecto').trim() || 'proyecto', frase: v.frase || null };
      P.nombre = datos.nombre;
      P.creado = new Date().toISOString();
      return conCarpeta ? carpetaNueva(datos) : new A.AlmacenNavegador(P.huella(), datos.nombre);
    }).then(function (almacen) {
      if (!almacen) return;
      return (datos.frase ? clavePara(datos.frase, almacen) : Promise.resolve(almacen))
        .then(function (listo) {
          abrirApp(listo);
          /* Se escribe la bóveda inicial en el acto: desde el primer momento hay
           * algo guardado que puede reconstruir lo que salga de acá. */
          return vista.guardado.guardar();
        });
    }).catch(manejarErrorProyecto);
  }

  function carpetaNueva(datos) {
    return Promise.resolve(global.showDirectoryPicker({ mode: 'readwrite' })).then(function (handle) {
      var almacen = new A.AlmacenCarpeta(handle);
      return almacen.inspeccionar().then(function (info) {
        if (info.esProyecto) {
          throw new Error('Esa carpeta ya tiene un proyecto de MIST adentro. Usá "Abrir un proyecto".');
        }
        if (!info.vacia) {
          throw new Error('Esa carpeta tiene ' + plural(info.archivos, 'archivo', 'archivos') +
            ' adentro. Elegí una vacía: la bóveda tiene que quedar sola para no mezclarse con otra cosa.');
        }
        void datos;
        return almacen;
      });
    });
  }

  function clavePara(frase, almacen) {
    var sal = B.salNueva();
    return B.derivar(frase, M.hash.fromBase64(sal)).then(function (clave) {
      almacen.clave = clave;
      almacen.sal = sal;
      return almacen;
    });
  }

  /* Abrir tiene tres fuentes posibles y no todas están en todos lados, así que
   * en vez de adivinar se le muestran al operador las que hay. */
  function abrirProyecto() {
    A.AlmacenNavegador.listar().then(function (guardados) {
      var opciones = guardados.map(function (g) {
        return {
          valor: 'navegador:' + g.id,
          etiqueta: g.nombre,
          detalle: 'en este navegador · ' + plural(g.archivos || 0, 'archivo', 'archivos') +
            ' · ' + cuando(g.actualizado)
        };
      });
      if (A.hayCarpetas()) {
        opciones.push({ valor: 'carpeta', etiqueta: 'Desde una carpeta',
          detalle: 'con permiso de escritura: el proyecto se sigue guardando solo ahí' });
      } else {
        opciones.push({ valor: 'carpetaLectura', etiqueta: 'Desde una carpeta',
          detalle: 'sólo lectura: este navegador no puede escribir en carpetas' });
      }
      opciones.push({ valor: 'archivo', etiqueta: 'Desde un archivo',
        detalle: 'un .zip o un .json de bóveda', tenue: true });

      return elegir({
        titulo: 'Abrir un proyecto',
        texto: guardados.length ? '' : 'Todavía no hay proyectos guardados en este navegador.',
        opciones: opciones
      });
    }).then(function (elegido) {
      if (!elegido) return;
      if (elegido === 'carpeta') return abrirCarpeta();
      if (elegido === 'carpetaLectura') { $('entrada-carpeta').click(); return; }
      if (elegido === 'archivo') { $('entrada-boveda').click(); return; }
      if (elegido.indexOf('navegador:') === 0) return abrirDelNavegador(elegido.slice(10));
    }).catch(manejarErrorProyecto);
  }

  function abrirCarpeta() {
    var almacen = null;
    return Promise.resolve(global.showDirectoryPicker({ mode: 'readwrite' })).then(function (handle) {
      almacen = new A.AlmacenCarpeta(handle);
      return almacen.leerTodo();
    }).then(function (docs) { return aplicarDocs(docs, almacen); });
  }

  function abrirDelNavegador(id) {
    var almacen = new A.AlmacenNavegador(id, 'proyecto');
    return almacen.leerTodo().then(function (docs) { return aplicarDocs(docs, almacen); });
  }

  /* Común a todas las formas de abrir: carpeta con permisos, carpeta leída con
   * un input, archivo suelto o almacenamiento del navegador. */
  function aplicarDocs(docs, almacen) {
    if (!docs.size) throw new Error('Ahí no hay ningún proyecto.');
    var paso = Promise.resolve(docs);
    if (B.estaCifrado(docs)) {
      if (!B.hayCifrado()) throw new Error('El proyecto está cifrado y este navegador no expone crypto.subtle.');
      paso = pedirFrase('Proyecto cifrado', 'Escribí la frase con la que lo cifraste.', 'Abrir')
        .then(function (frase) {
          if (!frase) throw new Error('cancelado');
          return B.derivar(frase, M.hash.fromBase64(B.salDe(docs))).then(function (clave) {
            almacen.clave = clave;
            almacen.sal = B.salDe(docs);
            return B.desenvolver(docs, clave);
          });
        });
    }
    return paso.then(function (planos) {
      var info = B.aplicar(P, planos);
      almacen.nombre = P.nombre;
      if (almacen.modo === 'navegador') almacen.id = P.huella();
      P.archivos = [];
      P.escanear();
      abrirApp(almacen);
      vista.guardado.estado = 'guardado';
      /* Lo que se acaba de leer del disco ya es una copia en el disco. */
      if (almacen.modo !== 'navegador') vista.guardado.versionEnDisco = vista.guardado.version;
      renderBarra();
      return avisar('Proyecto abierto',
        info.nombre + ' · clave ' + P.huella() + ' · ' +
        plural(info.fusiones, 'fusión', 'fusiones') + ' · ' +
        plural(info.asignaciones, 'token fijado', 'tokens fijados') + ' · ' +
        plural(info.archivos || 0, 'planilla en el historial', 'planillas en el historial') + '.\n' +
        'Las planillas que cargues ahora van a usar exactamente los mismos tokens.');
    });
  }

  function nombreNavegador() {
    var ua = navigator.userAgent;
    var m;
    if ((m = ua.match(/Edg\/(\d+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/OPR\/(\d+)/))) return 'Opera ' + m[1];
    if ((m = ua.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Chrome\/(\d+)/))) return 'Chrome ' + m[1];
    if ((m = ua.match(/Version\/(\d+)[\d.]* Safari/))) return 'Safari ' + m[1];
    return 'este navegador';
  }

  /* Cuando se abre un proyecto desde una carpeta sin permisos o desde un
   * archivo suelto, hay que decidir dónde se va a seguir guardando. */
  function almacenDeRespaldo() {
    return A.hayNavegador()
      ? new A.AlmacenNavegador(P.huella(), P.nombre)
      : new A.AlmacenArchivo(P.nombre);
  }

  function manejarErrorProyecto(e) {
    if (!e || e.name === 'AbortError' || e.message === 'cancelado') return;
    avisar('No se pudo abrir el proyecto', e.message);
  }

  /* ── Arranque ─────────────────────────────────────────────────────── */

  function render() {
    renderBarra();
    renderLateral();
    renderPestanias();
    if (vista.pestania === 'columnas') renderColumnas();
    if (vista.pestania === 'entidades') renderEntidades();
    if (vista.pestania === 'fusiones') renderFusiones();
    if (vista.pestania === 'previa') renderPrevia();
    if (vista.pestania === 'salida') renderSalida();
    if (vista.pestania === 'reconstruir') renderReconstruir();
  }

  function conectar() {
    var entrada = $('entrada-archivos');
    $('soltar').onclick = function () { entrada.click(); };
    entrada.onchange = function () { cargar(entrada.files); entrada.value = ''; };

    var entradaRec = $('entrada-reconstruir');
    entradaRec.onchange = function () {
      cargarParaReconstruir(entradaRec.files[0]);
      entradaRec.value = '';
    };

    /* Dónde se ilumina lo que se está por soltar. Parado en Reconstruir es el
     * recuadro de esa pestaña, porque es ahí donde va a caer el archivo; en
     * cualquier otra, el panel de planillas. */
    function zonaDeSoltar() {
      return vista.pestania === 'reconstruir'
        ? document.querySelector('#panel-reconstruir .soltar')
        : $('soltar');
    }
    function apagarZonas() {
      var zonas = document.querySelectorAll('.soltar.encima');
      for (var i = 0; i < zonas.length; i++) zonas[i].classList.remove('encima');
    }
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        var zona = vista.almacen && zonaDeSoltar();
        if (zona) zona.classList.add('encima');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'drop' || e.target === document.documentElement) apagarZonas();
      });
    });
    /* Parado en Reconstruir, lo que se suelta va para ese lado. Sin esto habría
     * que cruzar la pantalla hasta el panel de archivos, y peor: soltarlo ahí
     * cargaría el resultado de la consulta como si fuera una planilla nueva. */
    document.addEventListener('drop', function (e) {
      if (!vista.almacen) return;
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      if (vista.pestania === 'reconstruir') cargarParaReconstruir(e.dataTransfer.files[0]);
      else cargar(e.dataTransfer.files);
    });

    $('btn-nuevo').onclick = crearProyecto;
    $('btn-abrir').onclick = abrirProyecto;
    $('btn-guardar').onclick = function () { guardarOBajar().then(render, render); };

    var carpeta = $('entrada-carpeta');
    carpeta.onchange = function () {
      var archivos = carpeta.files;
      carpeta.value = '';
      if (!archivos.length) return;
      A.docsDesdeArchivos(archivos)
        .then(function (docs) { return aplicarDocs(docs, almacenDeRespaldo()); })
        .catch(manejarErrorProyecto);
    };

    var archivo = $('entrada-boveda');
    $('btn-abrir-archivo').onclick = function () { archivo.click(); };
    archivo.onchange = function () {
      var f = archivo.files[0];
      archivo.value = '';
      if (!f) return;
      A.docsDesdeArchivo(f)
        .then(function (docs) { return aplicarDocs(docs, almacenDeRespaldo()); })
        .catch(manejarErrorProyecto);
    };

    /* Sin File System Access no hay carpeta. Conviene decirlo antes de que el
     * operador elija nada, y decir en qué navegador estamos: en macOS el doble
     * clic puede abrir Safari, y desde adentro no se distingue de un Chrome
     * viejo. Con IndexedDB el autoguardado se conserva; lo que cambia es que la
     * copia en el disco es un paso aparte. */
    if (!A.hayCarpetas()) {
      var aviso = $('portada-aviso');
      aviso.hidden = false;
      aviso.textContent = A.hayNavegador()
        ? 'Estás en ' + nombreNavegador() + ', que no puede escribir en una carpeta. ' +
          'El proyecto se va a guardar solo dentro del navegador, y la copia en el disco ' +
          'la bajás como un .zip que se descomprime en la carpeta del proyecto. ' +
          'Si preferís la carpeta directa, abrí este mismo archivo en Chrome o Edge.'
        : 'Estás en ' + nombreNavegador() + ', que no puede escribir en una carpeta ni ' +
          'guardar nada por su cuenta. El proyecto va a ser un archivo único que guardás vos.';
      $('portada-intro').textContent =
        'Un proyecto guarda la clave maestra, las fusiones confirmadas y el mapa de cada ' +
        'token a su valor real. Sin eso, las planillas que salgan de acá no se pueden ' +
        'volver a cruzar con nada ni reconstruir. Por eso va primero.';
      $('nota-nuevo').textContent = A.hayNavegador()
        ? 'Se guarda solo en el navegador; la copia en disco la bajás como .zip.'
        : 'La bóveda se baja como un archivo único que guardás vos.';
      $('nota-abrir').textContent = 'De este navegador, de una carpeta o de un .zip.';
    }

    /* Cerrar con cambios sin guardar es exactamente el accidente que esta
     * herramienta tiene que evitar. El navegador no deja elegir el texto del
     * cartel, pero sí frenar el cierre. returnValue es sólo para los Chrome
     * anteriores al 119, que ignoraban preventDefault acá. */
    global.addEventListener('beforeunload', function (e) {
      if (vista.guardado && (vista.guardado.pendiente() || !vista.guardado.copiaEnDisco())) {
        e.preventDefault();
        e.returnValue = true;
      }
    });
  }

  /* Se expone el estado para poder inspeccionarlo desde la consola del
   * navegador: MIST.app.proyecto.inventario(), MIST.app.render(), etc. */
  M.app = {
    proyecto: P, vista: vista, render: render, dialogo: dialogo,
    abrirApp: abrirApp, aplicarDocs: aplicarDocs, anotar: anotar,
    reconstruir: mostrarReconstruccion
  };

  document.addEventListener('DOMContentLoaded', function () {
    conectar();
    renderBarra();
  });
})(window);
