/* Prueba de integración: corre el motor completo sobre las planillas de
 * ejemplo, simulando lo que hace la UI. */
const fs = require('fs');
const raiz = require('path').join(__dirname, '..') + '/';
global.window = global;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.crypto = require('crypto').webcrypto;
global.XLSX = require(raiz + 'vendor/xlsx.full.min.js');
global.Papa = require(raiz + 'vendor/papaparse.min.js');
global.Blob = class { constructor(p) { this.partes = p; } };
const descargas = [];
let blobPendiente = null;
global.URL = { createObjectURL: (b) => { blobPendiente = b; return 'blob:x'; }, revokeObjectURL() {} };
global.document = {
  createElement: () => {
    const a = { style: {} };
    a.click = () => descargas.push({ nombre: a.download, texto: blobPendiente.partes.join('') });
    return a;
  },
  body: { appendChild() {}, removeChild() {} }
};
global.FileReader = class {
  readAsText(f) { this.result = f.texto; setTimeout(() => this.onload(), 0); }
  readAsArrayBuffer(f) { this.result = f.buffer; setTimeout(() => this.onload(), 0); }
};
for (const f of ['00-hash.js', '10-tipos.js', '20-entidades.js', '30-io.js', '40-proyecto.js', '50-boveda.js']) {
  eval(fs.readFileSync(raiz + 'src/' + f, 'utf8'));
}
const M = window.MIST;
const E = M.entidades;
const n = M.tipos.NORMALIZADORES;
const SEP = M.SEP;

let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra ? '  → ' + extra : '')); }
  else console.log('ok     ' + nombre);
}

function archivoFalso(ruta) {
  const buf = fs.readFileSync(ruta);
  const nombre = ruta.split('/').pop();
  return { name: nombre, texto: buf.toString('utf8'), buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
}

(async function () {
  const P = new M.Proyecto();

  for (const n of ['clientes.csv', 'ventas.csv', 'reclamos.xlsx']) {
    const datos = await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/' + n));
    P.agregarArchivo(datos);
  }

  ok('cargó 3 archivos', P.archivos.length === 3);
  ok('el xlsx trajo sus 2 hojas', P.archivos[2].hojas.length === 2,
    JSON.stringify(P.archivos[2].hojas.map(h => h.nombre)));

  // --- Autodetección de tipos
  const cols = P.archivos[0].hojas[0].columnas;
  const detectado = Object.fromEntries(cols.map(c => [c.nombre, c.accion === 'seudonimo' ? c.tipo : c.accion]));
  ok('detecta nombre → persona', detectado.nombre === 'persona', JSON.stringify(detectado));
  ok('detecta razon_social → empresa', detectado.razon_social === 'empresa');
  ok('detecta cuit → cuit', detectado.cuit === 'cuit');
  ok('detecta email → email', detectado.email === 'email');
  ok('detecta telefono → telefono', detectado.telefono === 'telefono');
  ok('deja saldo intacto', detectado.saldo === 'conservar');

  // --- El perfil de columna se propaga entre archivos
  const colsVentas = P.archivos[1].hojas[0].columnas;
  ok('"vendedor" en ventas.csv también es persona',
    colsVentas.find(c => c.nombre === 'vendedor').tipo === 'persona');
  ok('"fecha" queda intacta', colsVentas.find(c => c.nombre === 'fecha').accion === 'conservar');

  // observaciones como texto libre
  const iObs = colsVentas.findIndex(c => c.nombre === 'observaciones');
  P.configurarColumna(P.archivos[1].hojas[0], iObs, 'escanear', null);

  const r = P.escanear();
  ok('escaneó celdas', r.celdas > 60, String(r.celdas));

  // --- Consistencia entre archivos
  const tPersona = P.tipoPorId('persona');
  const tEmpresa = P.tipoPorId('empresa');
  const tCuit = P.tipoPorId('cuit');

  const tokJoaquin = P.tokenDe(tPersona, 'Joaquín Pérez');
  ok('"Pérez, Joaquín" → mismo token', P.tokenDe(tPersona, 'Pérez, Joaquín') === tokJoaquin, tokJoaquin);
  ok('"PEREZ JOAQUIN" → mismo token', P.tokenDe(tPersona, 'PEREZ JOAQUIN') === tokJoaquin);
  ok('"Joaquin Peres" (typo) → todavía distinto', P.tokenDe(tPersona, 'Joaquin Peres') !== tokJoaquin);
  ok('token con forma tipo-hash', /^persona-[0-9a-hjkmnp-tv-z]{8}$/.test(tokJoaquin), tokJoaquin);

  ok('"Acme SRL" ≡ "ACME S.R.L."', P.tokenDe(tEmpresa, 'Acme SRL') === P.tokenDe(tEmpresa, 'ACME S.R.L.'));
  ok('"30-71234567-9" ≡ "30712345679"', P.tokenDe(tCuit, '30-71234567-9') === P.tokenDe(tCuit, '30712345679'));
  ok('persona y empresa no comparten espacio de nombres',
    P.tokenDe(tPersona, 'Ana Lorenzo') !== P.tokenDe(tEmpresa, 'Ana Lorenzo'));

  // --- Sugerencias de fusión
  const sug = P.sugerencias();
  const pares = sug.map(s => s.tipo + ': ' + s.a + ' / ' + s.b + ' (' + s.puntaje.toFixed(2) + ')');
  console.log('       sugerencias:\n         ' + pares.join('\n         '));
  ok('sugiere fusionar el typo Peres/Pérez',
    sug.some(s => s.tipo === 'persona' && [s.a, s.b].join(' ').includes('peres')), pares.join(' | '));
  ok('sugiere fusionar "J. Perez" con "Joaquin Perez"',
    sug.some(s => s.tipo === 'persona' && (s.a === 'j perez' || s.b === 'j perez')));
  ok('NO sugiere fusionar Ana Lorenzo con Ana Lopez',
    !sug.some(s => [s.a, s.b].sort().join('|') === 'ana lopez|ana lorenzo'));

  // --- Fusionar y verificar propagación
  const parPeres = sug.find(s => [s.a, s.b].join(' ').includes('peres'));
  P.fusiones.unir(parPeres.tipo, parPeres.a, parPeres.b);
  P.acunar();
  ok('tras fusionar, el typo comparte token',
    P.tokenDe(tPersona, 'Joaquin Peres') === P.tokenDe(tPersona, 'Joaquín Pérez'));

  // --- Transformación
  const buscador = P.buscadorTexto();
  const salidaVentas = P.transformar(P.archivos[1], P.archivos[1].hojas[0], 0, buscador);
  const filaObs = salidaVentas[1][iObs];
  ok('el texto libre reemplaza la mención de la empresa',
    /empresa-[0-9a-z]{8}/.test(filaObs), filaObs);
  const filaObs3 = salidaVentas[3][iObs];
  ok('el texto libre reemplaza la mención de la persona',
    filaObs3.includes(tokJoaquin), filaObs3);
  ok('el texto libre conserva lo que no es entidad',
    filaObs3.includes('Ajuste solicitado por') && filaObs3.includes('el viernes'), filaObs3);

  const salidaClientes = P.transformar(P.archivos[0], P.archivos[0].hojas[0], 0, null);
  const iNombre = cols.findIndex(c => c.nombre === 'nombre');
  const iSaldo = cols.findIndex(c => c.nombre === 'saldo');
  ok('CL-001 y CL-003 salen con el mismo token de persona',
    salidaClientes[1][iNombre] === salidaClientes[3][iNombre],
    salidaClientes[1][iNombre] + ' / ' + salidaClientes[3][iNombre]);
  ok('el saldo sale intacto y sigue siendo texto original',
    salidaClientes[1][iSaldo] === '14350.50', String(salidaClientes[1][iSaldo]));
  ok('el encabezado sobrevive', salidaClientes[0][iNombre] === 'nombre');

  // --- Fechas del xlsx
  const hojaRec = P.archivos[2].hojas[0];
  const salidaRec = P.transformar(P.archivos[2], hojaRec, 0, null);
  const iFecha = hojaRec.columnas.findIndex(c => c.nombre === 'fecha');
  ok('la fecha del xlsx sale como Date sin tocar', salidaRec[1][iFecha] instanceof Date,
    String(salidaRec[1][iFecha]));
  const iRecl = hojaRec.columnas.findIndex(c => c.nombre === 'reclamante');
  ok('"Gonzalez, Maria" en el xlsx comparte token con "María González" del csv',
    salidaRec[2][iRecl] === P.tokenDe(tPersona, 'María González'),
    salidaRec[2][iRecl] + ' / ' + P.tokenDe(tPersona, 'María González'));

  // --- Nombre partido en dos columnas
  P.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/padron.csv')));
  const padron = P.archivos[3].hojas[0];
  const cfgPadron = padron.columnas.map(c => c.nombre + '→' + (c.accion === 'seudonimo' ? c.tipo : c.accion) + (c.campo ? '[' + c.campo + ']' : ''));
  ok('compone apellido + nombre sin que se lo pidan',
    padron.columnas.find(c => c.nombre === 'apellido').campo &&
    padron.columnas.find(c => c.nombre === 'apellido').campo === padron.columnas.find(c => c.nombre === 'nombre').campo,
    cfgPadron);
  ok('las partes quedan como persona',
    padron.columnas.find(c => c.nombre === 'nombre').tipo === 'persona', cfgPadron);
  ok('area queda intacta', padron.columnas.find(c => c.nombre === 'area').accion === 'conservar', cfgPadron);

  P.escanear();
  const unidades = P.unidades(padron).map(u => P.etiquetaUnidad(u));
  ok('el padrón se escanea como 3 unidades, no 4 columnas',
    unidades.length === 3 && unidades.includes('apellido + nombre'), unidades);

  const tokJoaquinAhora = P.tokenDe(tPersona, 'Joaquín Pérez');
  const salidaPadron = P.transformar(P.archivos[3], padron, 0, null);
  const iAp = padron.columnas.findIndex(c => c.nombre === 'apellido');
  const iNom = padron.columnas.findIndex(c => c.nombre === 'nombre');
  ok('"Pérez" + "Joaquín" en columnas separadas dan el token del "Joaquín Pérez" de otro archivo',
    salidaPadron[1][iAp] === tokJoaquinAhora,
    salidaPadron[1][iAp] + ' / ' + tokJoaquinAhora);
  ok('el mismo token va en las dos columnas',
    salidaPadron[1][iAp] === salidaPadron[1][iNom], salidaPadron[1].join(' | '));
  ok('el orden apellido-nombre no importa',
    salidaPadron[3][iAp] === P.tokenDe(tPersona, 'Lucía Vieytes'),
    salidaPadron[3].join(' | '));
  ok('la errata del padrón sigue el grupo ya fusionado',
    salidaPadron[6][iAp] === tokJoaquinAhora, salidaPadron[6].join(' | '));
  ok('el legajo y el área salen como corresponde',
    /^id-/.test(salidaPadron[1][0]) && salidaPadron[1][3] === 'Ventas', salidaPadron[1].join(' | '));

  // --- Fusionar un nombre completo con uno parcial
  P.registro.registrar('persona', n.nombre('Joaquín'), 'Joaquín', 'prueba');
  P.acunar();
  const soloNombre = P.tokenDe(tPersona, 'Joaquín');
  ok('"Joaquín" solo arranca como otra entidad', soloNombre !== tokJoaquinAhora);
  const puntaje = E.similitud(n.nombre('Joaquín'), n.nombre('Joaquín Pérez'));
  ok('el parecido queda por debajo del umbral por defecto: lo decide el operador',
    puntaje > 0.75 && puntaje < 0.85, puntaje.toFixed(3));
  P.fusiones.unir('persona', n.nombre('Joaquín'), P.grupoDe.get('persona\u0000' + n.nombre('Joaquín Pérez')));
  P.acunar();
  ok('tras fusionarlos comparten token', P.tokenDe(tPersona, 'Joaquín') === tokJoaquinAhora,
    P.tokenDe(tPersona, 'Joaquín') + ' / ' + tokJoaquinAhora);
  ok('y el nombre completo no cambió de token',
    P.tokenDe(tPersona, 'Joaquín Pérez') === tokJoaquinAhora);
  ok('la fusión se propaga a las columnas compuestas',
    P.transformar(P.archivos[3], padron, 0, null)[1][iAp] === tokJoaquinAhora);

  // --- Un tipo propio para un dato que el catálogo no tiene
  const tExp = P.agregarTipo({ etiqueta: 'N° de expediente', norm: 'identidad' });
  ok('el tipo propio deriva su id y su prefijo del nombre',
    tExp.id === 'n-de-expediente' && tExp.prefijo === 'expediente', JSON.stringify(tExp));
  const iLegajo = padron.columnas.findIndex(c => c.nombre === 'legajo');
  P.configurarColumna(padron, iLegajo, 'seudonimo', tExp.id);
  P.escanear();
  const tokExp = P.tokenDe(tExp, 'E-001');
  ok('la columna pasa a usar el tipo propio',
    /^expediente-[0-9a-hjkmnp-tv-z]{8}$/.test(tokExp), tokExp);
  ok('el normalizador del tipo propio manda: "E 001" ≡ "e-001"',
    P.tokenDe(tExp, 'E 001') === tokExp && P.tokenDe(tExp, 'e-001') === tokExp);
  ok('el tipo propio es su propio espacio de nombres',
    P.tokenDe(P.tipoPorId('id'), 'E-001') !== tokExp);
  const usoExp = P.usoDeTipo(tExp.id);
  ok('el proyecto sabe que el tipo está en uso y ya no se puede cambiar entero',
    usoExp.columnas === 1 && usoExp.entidades > 1 && usoExp.congelado, JSON.stringify(usoExp));
  let seBorro = false;
  try { P.quitarTipo(tExp.id); seBorro = true; } catch (e) { void e; }
  ok('un tipo con tokens acuñados no se borra', !seBorro);
  ok('pero el nombre se puede corregir siempre',
    P.editarTipo(tExp.id, { etiqueta: 'Expediente' }).prefijo === 'expediente' &&
    P.tokenDe(P.tipoPorId(tExp.id), 'E-001') === tokExp);

  const tSuelto = P.agregarTipo({ etiqueta: 'Sin usar', norm: 'exacto' });
  ok('un tipo que no usó nadie sí se borra',
    P.quitarTipo(tSuelto.id) && !P.tipoPorId('sin-usar'), P.tipos.map(t => t.id).join(','));

  // --- Bóveda: ida y vuelta
  const inv = P.inventario();
  ok('el inventario tiene grupos con token', inv.length > 5 && inv.every(g => g.token), String(inv.length));

  const docs = M.boveda.documentos(P);
  ok('la bóveda es un manifiesto, fusiones y fragmentos de mapa',
    docs.has('mist.json') && docs.has('fusiones.json') &&
    [...docs.keys()].filter(k => k.startsWith('mapa/')).length > 0,
    [...docs.keys()].slice(0, 6));
  const conEntradas = [...docs.entries()].filter(([k, v]) => k.startsWith('mapa/') && v.entradas.length);
  ok('el mapa se reparte entre varios fragmentos', conEntradas.length >= 4, conEntradas.map(([k, v]) => k + ':' + v.entradas.length));
  const totalEntradas = conEntradas.reduce((s, [, v]) => s + v.entradas.length, 0);
  ok('no se pierde ninguna entidad al fragmentar', totalEntradas >= inv.length, totalEntradas + ' / ' + inv.length);
  const mayor = Math.max(...conEntradas.map(([, v]) => v.entradas.length));
  const menor = Math.min(...conEntradas.map(([, v]) => v.entradas.length));
  ok('los fragmentos quedan parejos', mayor <= menor * 6 + 6, mayor + ' vs ' + menor);

  const P2 = new M.Proyecto();
  ok('el proyecto nuevo arranca con otra clave', P2.huella() !== P.huella());
  M.boveda.aplicar(P2, docs);
  for (const n of ['clientes.csv', 'ventas.csv']) {
    P2.agregarArchivo(await M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/' + n)));
  }
  P2.escanear();
  ok('tras abrir el proyecto, la huella coincide', P2.huella() === P.huella(), P2.huella() + ' / ' + P.huella());
  ok('tras abrir el proyecto, los tokens coinciden',
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín Pérez') === tokJoaquinAhora,
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín Pérez') + ' / ' + tokJoaquinAhora);
  ok('tras abrir el proyecto, las fusiones siguen vigentes',
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquin Peres') === tokJoaquinAhora &&
    P2.tokenDe(P2.tipoPorId('persona'), 'Joaquín') === tokJoaquinAhora);
  ok('los perfiles de columna viajan con el proyecto',
    JSON.stringify(P2.perfiles) === JSON.stringify(P.perfiles));
  ok('el tipo propio viaja con el proyecto',
    JSON.stringify(P2.tipoPorId('n-de-expediente')) === JSON.stringify(P.tipoPorId('n-de-expediente')),
    JSON.stringify(P2.tipoPorId('n-de-expediente')));
  ok('y sus tokens siguen siendo los mismos al reabrirlo',
    P2.tokenDe(P2.tipoPorId('n-de-expediente'), 'E-001') === tokExp,
    P2.tokenDe(P2.tipoPorId('n-de-expediente'), 'E-001') + ' / ' + tokExp);
  ok('el mapa del tipo propio va en su propio fragmento',
    [...docs.keys()].some(k => k.startsWith('mapa/n-de-expediente-')),
    [...docs.keys()].filter(k => k.startsWith('mapa/')).join(' '));

  // --- Dos planillas del mismo formato: la decisión se toma una sola vez
  const PF = new M.Proyecto();
  const mismoFormato = () => M.io.leerArchivo(archivoFalso(raiz + 'ejemplos/clientes.csv'));
  PF.agregarArchivo(await mismoFormato());
  PF.archivos[0].nombre = 'enero.csv';
  PF.agregarArchivo(await mismoFormato());
  PF.archivos[1].nombre = 'febrero.csv';
  PF.escanear();
  const colDe = (i, nombre) => PF.archivos[i].hojas[0].columnas.find(c => c.nombre === nombre);
  const iSaldoPF = PF.archivos[0].hojas[0].columnas.findIndex(c => c.nombre === 'saldo');

  const alcanzadas = PF.configurarColumna(PF.archivos[0].hojas[0], iSaldoPF, 'vaciar', null);
  ok('cambiar una columna alcanza a la del mismo encabezado en la otra planilla',
    alcanzadas === 1 && colDe(1, 'saldo').accion === 'vaciar', alcanzadas + ' / ' + colDe(1, 'saldo').accion);
  ok('y la que se cambió queda marcada como decisión del operador',
    colDe(0, 'saldo').origen === 'operador' && colDe(1, 'saldo').origen === 'perfil');

  /* El escaneo vuelve a anotar la clasificación de cada columna. Una columna sin
   * tocar no puede deshacer con eso una decisión del operador: si pudiera,
   * bastaba con tener otra planilla cargada para perder el cambio. */
  PF.escanear();
  ok('reescanear no deshace la decisión',
    PF.perfiles[M.tipos.claveEncabezado('saldo')].accion === 'vaciar' &&
    colDe(0, 'saldo').accion === 'vaciar' && colDe(1, 'saldo').accion === 'vaciar',
    JSON.stringify(PF.perfiles[M.tipos.claveEncabezado('saldo')]));

  PF.agregarArchivo(await mismoFormato());
  PF.archivos[2].nombre = 'marzo.csv';
  PF.escanear();
  ok('y la planilla que llega después también la hereda', colDe(2, 'saldo').accion === 'vaciar');
  const salidaMarzo = PF.transformar(PF.archivos[2], PF.archivos[2].hojas[0], 2, null);
  ok('así que el archivo nuevo sale con el saldo vaciado, sin tocar nada',
    salidaMarzo[1][salidaMarzo[1].length - 1] === '', salidaMarzo[1].join(','));

  /* Una elección hecha a mano en una planilla puntual manda ahí y no la pisa la
   * propagación de otra. */
  const iLocPF = PF.archivos[1].hojas[0].columnas.findIndex(c => c.nombre === 'localidad');
  PF.configurarColumna(PF.archivos[1].hojas[0], iLocPF, 'vaciar', null);
  PF.configurarColumna(PF.archivos[0].hojas[0], iLocPF, 'conservar', null);
  ok('lo que se tocó a mano en una planilla no lo pisa el cambio hecho en otra',
    colDe(1, 'localidad').accion === 'vaciar' && colDe(0, 'localidad').accion === 'conservar' &&
    colDe(2, 'localidad').accion === 'conservar',
    [0, 1, 2].map(i => colDe(i, 'localidad').accion).join(' / '));

  // --- Reconstrucción: el camino de vuelta
  const salidaVentasHoy = P.transformar(P.archivos[1], P.archivos[1].hojas[0], 0, P.buscadorTexto());
  const vuelta = P.reconstruir([{ nombre: 'consulta', filas: salidaVentasHoy }]);
  const originalVentas = P.archivos[1].hojas[0].filas;
  ok('la planilla desensibilizada vuelve a tener los nombres reales',
    vuelta.hojas[0].filas[1][1] === M.io.texto(originalVentas[1][1]) &&
    vuelta.hojas[0].filas[1][2] === M.io.texto(originalVentas[1][2]),
    vuelta.hojas[0].filas[1].join(' | '));
  ok('y el CUIT con su puntuación original',
    vuelta.hojas[0].filas[1][3] === '30-71234567-9', vuelta.hojas[0].filas[1][3]);
  ok('los tokens metidos dentro de un texto libre también vuelven',
    vuelta.hojas[0].filas[1][iObs].includes('Acme SRL'), vuelta.hojas[0].filas[1][iObs]);
  ok('lo que nunca se tocó sale igual',
    vuelta.hojas[0].filas[1][4] === originalVentas[1][4], String(vuelta.hojas[0].filas[1][4]));
  ok('el informe cuenta lo que recuperó',
    vuelta.informe.tokens > 10 && vuelta.informe.distintos.size > 3 && vuelta.informe.ajenos.size === 0,
    JSON.stringify({ t: vuelta.informe.tokens, d: vuelta.informe.distintos.size, a: vuelta.informe.ajenos.size }));

  /* La errata quedó fusionada con el nombre bien escrito, así que su token es
   * el mismo y la reconstrucción devuelve la forma dominante para los dos. */
  const filaErrata = salidaVentasHoy.findIndex(f => f[1] === tokJoaquinAhora || f[2] === tokJoaquinAhora);
  ok('un grupo fusionado devuelve la forma más frecuente, no la errata',
    vuelta.hojas[0].filas.some(f => f.includes('Joaquín Pérez')) &&
    !vuelta.hojas[0].filas.some(f => f.includes('Joaquin Peres')), String(filaErrata));

  /* Lo que importa: reconstruir sin tener cargada ninguna de las planillas
   * originales. Es la situación real —alguien devuelve el resultado de una
   * consulta meses después— y la que obliga a que las formas literales vivan
   * en la bóveda y no en el escaneo de hoy. */
  const P4 = new M.Proyecto();
  M.boveda.aplicar(P4, M.boveda.documentos(P));
  ok('un proyecto recién abierto no tiene ninguna planilla cargada', P4.archivos.length === 0);
  const vuelta4 = P4.reconstruir([{ nombre: 'consulta', filas: salidaVentasHoy }]);
  ok('y aun así reconstruye igual, sólo con la bóveda',
    JSON.stringify(vuelta4.hojas[0].filas) === JSON.stringify(vuelta.hojas[0].filas),
    vuelta4.hojas[0].filas[1].join(' | '));

  const ajeno = [{ nombre: 'h', filas: [['persona-zzzzzzzz', 'CL-001', 'mi-palabra-abcdefgh', '2026-03-02']] }];
  const conAjenos = P4.reconstruir(ajeno);
  ok('un token de otra bóveda se deja intacto y se cuenta aparte',
    conAjenos.hojas[0].filas[0][0] === 'persona-zzzzzzzz' && conAjenos.informe.ajenos.size === 1,
    JSON.stringify([...conAjenos.informe.ajenos]));
  ok('lo que sólo se parece a un token no se toca',
    conAjenos.hojas[0].filas[0].slice(1).join('|') === 'CL-001|mi-palabra-abcdefgh|2026-03-02',
    conAjenos.hojas[0].filas[0].join('|'));

  ok('el proyecto reconoce una planilla que ya salió de él',
    P4.tokensPropios([{ filas: salidaVentasHoy }]) > 3,
    String(P4.tokensPropios([{ filas: salidaVentasHoy }])));
  ok('y no confunde una planilla de origen con una desensibilizada',
    P4.tokensPropios([{ filas: originalVentas }]) === 0);

  /* Las bóvedas anteriores guardan las formas como strings pelados, sin la
   * cuenta de veces. Se siguen abriendo y reconstruyendo; lo que se pierde es
   * saber cuál era la dominante, así que sale la primera en orden. */
  const docsViejos = new Map();
  M.boveda.documentos(P).forEach((doc, ruta) => {
    docsViejos.set(ruta, ruta.startsWith('mapa/')
      ? { mist: doc.mist, entradas: doc.entradas.map(e => [e[0], e[1], e[2].map(f => f[0]), e[3]]) }
      : doc);
  });
  const P5 = new M.Proyecto();
  M.boveda.aplicar(P5, docsViejos);
  const viejo = P5.reconstruir([{ nombre: 'h', filas: [[tokJoaquinAhora]] }]).hojas[0].filas[0][0];
  const formasJoaquin = P.formasDe('persona' + SEP + P.grupoDe.get('persona' + SEP + n.nombre('Joaquín Pérez')));
  ok('una bóveda anterior, con las formas sin cuenta, se sigue reconstruyendo',
    viejo !== tokJoaquinAhora && formasJoaquin.indexOf(viejo) >= 0, viejo + ' de ' + formasJoaquin.join(' | '));

  ok('el mapa inverso en CSV también sirve sin las planillas cargadas',
    M.boveda.filasDelMapa(P4).length === M.boveda.filasDelMapa(P).length &&
    M.boveda.filasDelMapa(P4).some(f => String(f[3]).includes('Joaquín Pérez')),
    M.boveda.filasDelMapa(P4).length + ' / ' + M.boveda.filasDelMapa(P).length);

  // --- Bóveda cifrada
  const sal = M.boveda.salNueva();
  const clave = await M.boveda.derivar('una frase larga de prueba', M.hash.fromBase64(sal));
  const cifrados = await M.boveda.envolver(docs, clave, sal);
  const textoCifrado = JSON.stringify([...cifrados.values()]);
  ok('la bóveda cifrada no filtra ningún nombre',
    !/Joaqu|perez|gonzalez|vieytes/i.test(textoCifrado));
  ok('el manifiesto cifrado conserva en claro con qué abrirlo',
    cifrados.get('mist.json').kdf.sal === sal && cifrados.get('mist.json').huella === P.huella());

  const P3 = new M.Proyecto();
  M.boveda.aplicar(P3, await M.boveda.desenvolver(cifrados, clave));
  ok('se abre con la frase correcta', P3.huella() === P.huella());

  const claveMala = await M.boveda.derivar('frase equivocada', M.hash.fromBase64(sal));
  let rechazo = false;
  await M.boveda.desenvolver(cifrados, claveMala).catch(() => { rechazo = true; });
  ok('rechaza la frase equivocada', rechazo);

  // --- Escritura real de archivos
  P.exportarArchivo(P.archivos[0]);
  const csvSalida = descargas[descargas.length - 1];
  ok('el csv de salida se llama .desensibilizado.csv', csvSalida.nombre === 'clientes.desensibilizado.csv', csvSalida.nombre);
  ok('el csv de salida no contiene ningún nombre real',
    !/Joaqu|P[eé]rez|Gonz[aá]lez|Barrionuevo|Vieytes|Lorenzo/.test(csvSalida.texto),
    csvSalida.texto.split('\n')[1]);
  ok('el csv de salida no contiene ningún CUIT real',
    !csvSalida.texto.includes('30-71234567-9') && !csvSalida.texto.includes('30712345679'));
  ok('el csv de salida conserva los saldos', csvSalida.texto.includes('14350.50'));

  console.log('\n--- muestra de la salida ---');
  console.log(csvSalida.texto.split('\r\n').slice(0, 4).join('\n'));
  console.log('\n--- observaciones con texto libre ---');
  console.log(filaObs3);

  console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('EXCEPCIÓN', e); process.exit(1); });
