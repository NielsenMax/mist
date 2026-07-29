/* Pruebas del núcleo de MIST, corridas en node con un window falso. */
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'src') + '/';
global.window = global;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.crypto = require('crypto').webcrypto;
for (const f of ['00-hash.js', '10-tipos.js', '20-entidades.js']) {
  eval(fs.readFileSync(path + f, 'utf8'));
}

const { hash: H, tipos: T, entidades: E } = window.MIST;
let fallas = 0;
function ok(nombre, cond, extra) {
  if (!cond) { fallas++; console.log('FALLA  ' + nombre + (extra ? '  → ' + extra : '')); }
  else console.log('ok     ' + nombre);
}
const hex = u8 => Buffer.from(u8).toString('hex');

// --- SHA-256 / HMAC contra vectores conocidos
ok('sha256("abc")',
  hex(H.sha256(H.bytes('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  hex(H.sha256(H.bytes('abc'))));
ok('sha256("")',
  hex(H.sha256(H.bytes(''))) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
const largo = 'a'.repeat(1000);
ok('sha256(1000×a) coincide con node',
  hex(H.sha256(H.bytes(largo))) === require('crypto').createHash('sha256').update(largo).digest('hex'));
ok('hmac vector rfc',
  hex(H.hmac(H.bytes('key'), H.bytes('The quick brown fox jumps over the lazy dog'))) ===
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');

// --- Normalización
const n = T.NORMALIZADORES;
ok('"Joaquín Pérez" ≡ "Pérez, Joaquín"', n.nombre('Joaquín Pérez') === n.nombre('Pérez, Joaquín'),
  n.nombre('Joaquín Pérez') + ' / ' + n.nombre('Pérez, Joaquín'));
ok('"PEREZ JOAQUIN" ≡ "joaquin perez"', n.nombre('PEREZ JOAQUIN') === n.nombre('joaquin perez'));
ok('"Sr. Joaquín Pérez" ≡ "Joaquín Pérez"', n.nombre('Sr. Joaquín Pérez') === n.nombre('Joaquín Pérez'));
ok('"Acme SRL" ≡ "ACME S.R.L."', n.organizacion('Acme SRL') === n.organizacion('ACME S.R.L.'));
ok('"30-71234567-9" ≡ "30712345679"', n.numerico('30-71234567-9') === n.numerico('30712345679'));
ok('Juan Pérez ≠ Juan Gómez', n.nombre('Juan Pérez') !== n.nombre('Juan Gómez'));

// --- Sugerencias de tipo
ok('encabezado "cliente_id" → id', T.sugerir('cliente_id', []).tipo === 'id', JSON.stringify(T.sugerir('cliente_id', [])));
ok('encabezado "Razón Social" → empresa', T.sugerir('Razón Social', []).tipo === 'empresa');
ok('encabezado "e-mail" → email', T.sugerir('e-mail', []).tipo === 'email');
ok('contenido cuit sin encabezado → cuit',
  T.sugerir('col1', ['30-71234567-9', '27-12345678-4', '20-33445566-1']).tipo === 'cuit',
  JSON.stringify(T.sugerir('col1', ['30-71234567-9', '27-12345678-4', '20-33445566-1'])));
ok('columna de montos → conservar',
  T.sugerir('monto', ['1430.50', '22.00', '9']).accion === 'conservar');

// --- Tipos propios
ok('no hay un tipo "otro" donde se mezclaría todo', !T.TIPOS.some(t => t.id === 'otro'),
  T.TIPOS.map(t => t.id).join(','));
ok('el catálogo y la tabla de parecidos no se contradicen',
  T.TIPOS.every(t => t.fuzzy === T.FUZZY_POR_NORM[t.norm]),
  T.TIPOS.filter(t => t.fuzzy !== T.FUZZY_POR_NORM[t.norm]).map(t => t.id).join(','));

const propio = T.crearTipo({ etiqueta: '  N°  de   Expediente ', norm: 'identidad' }, T.TIPOS);
ok('crear un tipo deriva id y prefijo del nombre',
  propio.id === 'n-de-expediente' && propio.prefijo === 'expediente', JSON.stringify(propio));
ok('el prefijo saltea las palabras que no dicen nada', T.prefijoDe('Número de beneficio') === 'beneficio',
  T.prefijoDe('Número de beneficio'));
ok('un nombre largo usa la primera palabra entera y no un recorte',
  T.prefijoDe('Historia clínica') === 'historia', T.prefijoDe('Historia clínica'));
ok('el parecido sale del normalizador, no se pregunta', propio.fuzzy === false && propio.largo === 8);
ok('queda marcado como propio', propio.propio === true);
ok('el prefijo escrito a mano se limpia',
  T.crearTipo({ etiqueta: 'Trámite', prefijo: 'TRA/mite 2', norm: 'exacto' }, T.TIPOS).prefijo === 'tramite2');

const conPropio = T.TIPOS.concat([propio]);
function rechaza(nombre, datos, esperado) {
  let mensaje = '';
  try { T.crearTipo(datos, conPropio); } catch (e) { mensaje = e.message; }
  ok(nombre, esperado.test(mensaje), mensaje || 'no falló');
}
rechaza('un tipo sin nombre no se crea', { etiqueta: '   ' }, /necesita un nombre/);
rechaza('dos tipos no pueden llamarse igual', { etiqueta: 'n° de expediente' }, /que se llama/i);
rechaza('dos tipos no pueden compartir prefijo',
  { etiqueta: 'Expedientes viejos', prefijo: 'expediente' }, /ya lo usa/);
rechaza('el prefijo sin letras ni dígitos no sirve', { etiqueta: '¿?', prefijo: '¿?' }, /al menos una letra/);
ok('dos nombres que dan el mismo id se desempatan',
  T.crearTipo({ etiqueta: 'Nº de expediente', prefijo: 'exp' }, conPropio).id === 'n-de-expediente-2',
  T.crearTipo({ etiqueta: 'Nº de expediente', prefijo: 'exp' }, conPropio).id);
ok('editar el mismo tipo no choca consigo mismo',
  T.crearTipo({ id: propio.id, etiqueta: propio.etiqueta, prefijo: propio.prefijo, norm: 'exacto' }, conPropio).norm === 'exacto');

const tokenPropio = E.acunar(H.fromBase64(H.randomKey()), propio, 'EXP1232026', new Map());
ok('el tipo propio acuña tokens con su prefijo',
  /^expediente-[0-9a-hjkmnp-tv-z]{8}$/.test(tokenPropio), tokenPropio);

// --- Similitud
const s = (a, b) => E.similitud(n.nombre(a), n.nombre(b));
ok('typo "Gonzalez"/"Gonsalez" > 0.85', s('Maria Gonzalez', 'Maria Gonsalez') > 0.85, s('Maria Gonzalez', 'Maria Gonsalez').toFixed(3));
ok('segundo nombre "Joaquin Perez"/"Joaquin M Perez" > 0.85', s('Joaquin Perez', 'Joaquin M Perez') > 0.85, s('Joaquin Perez', 'Joaquin M Perez').toFixed(3));
ok('inicial "J. Perez"/"Joaquin Perez" > 0.85', s('J. Perez', 'Joaquin Perez') > 0.85, s('J. Perez', 'Joaquin Perez').toFixed(3));
ok('distintos "Joaquin Perez"/"Joaquin Gomez" < 0.7', s('Joaquin Perez', 'Joaquin Gomez') < 0.7, s('Joaquin Perez', 'Joaquin Gomez').toFixed(3));
ok('distintos "Ana Lopez"/"Ana Lorenzo" < 0.85', s('Ana Lopez', 'Ana Lorenzo') < 0.85, s('Ana Lopez', 'Ana Lorenzo').toFixed(3));
ok('hermanos "Juan Perez"/"Pedro Perez" < 0.7', s('Juan Perez', 'Pedro Perez') < 0.7, s('Juan Perez', 'Pedro Perez').toFixed(3));

// --- Registro, fusiones y tokens
const reg = new E.Registro();
const fus = new E.Fusiones();
const tipoPersona = T.TIPOS.find(t => t.id === 'persona');
['Joaquín Pérez', 'Pérez Joaquín', 'Joaquin Peres', 'Ana López', 'PEREZ, JOAQUIN'].forEach((v, i) => {
  reg.registrar('persona', n.nombre(v), v, 'col' + i);
});
ok('3 formas de Joaquín colapsan en 1 clave + 1 typo + Ana = 3 claves',
  reg.claves('persona').length === 3, JSON.stringify(reg.claves('persona')));

const sug = E.sugerencias(reg, fus, tipoPersona, 0.85);
ok('sugiere fusionar el typo "Joaquin Peres"', sug.pares.length === 1, JSON.stringify(sug.pares));
if (sug.pares.length) fus.unir('persona', sug.pares[0].a, sug.pares[0].b);
ok('tras fusionar quedan 2 grupos', fus.grupos('persona', reg.claves('persona')).size === 2);

const claveMaestra = H.fromBase64(H.randomKey());
function tokensDe(orden) {
  const ocupados = new Map();
  const salida = {};
  const grupos = Array.from(fus.grupos('persona', orden).entries()).sort((a, b) => a[0] < b[0] ? -1 : 1);
  for (const [grupo, miembros] of grupos) {
    const tk = E.acunar(claveMaestra, tipoPersona, grupo, ocupados);
    ocupados.set(tk, grupo);
    for (const m of miembros) salida[m] = tk;
  }
  return salida;
}
const t1 = tokensDe(reg.claves('persona'));
const t2 = tokensDe(reg.claves('persona').slice().reverse());
ok('los tokens no dependen del orden de carga', JSON.stringify(t1) === JSON.stringify(t2), JSON.stringify(t1));
ok('token con forma tipo-hash', /^persona-[0-9a-hjkmnp-tv-z]{8}$/.test(Object.values(t1)[0]), Object.values(t1)[0]);
ok('el typo fusionado comparte token con el nombre bien escrito',
  t1[n.nombre('Joaquin Peres')] === t1[n.nombre('Joaquín Pérez')], JSON.stringify(t1));
ok('Ana tiene otro token', t1[n.nombre('Ana López')] !== t1[n.nombre('Joaquín Pérez')]);

// --- Separar deshace la fusión
fus.separar('persona', n.nombre('Joaquin Peres'));
ok('tras separar vuelven a ser 3 grupos', fus.grupos('persona', reg.claves('persona')).size === 3);
ok('el par separado queda rechazado',
  E.sugerencias(reg, fus, tipoPersona, 0.85).pares.length === 0);

console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en orden');
process.exit(fallas ? 1 : 0);
