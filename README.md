# MIST

Desensibilización de planillas en el navegador. El operador carga CSV o XLSX,
marca qué columnas tienen datos sensibles y de qué tipo, y baja los mismos
archivos con los valores reales reemplazados por tokens del tipo
`persona-k3f9x2q1`.

Tres propiedades sostienen todo lo demás:

- **El mismo dato da el mismo token en todos los archivos**, hoy y dentro de seis
  meses. Los cruces entre planillas siguen funcionando después de anonimizar.
- **Dos escrituras distintas de la misma cosa terminan en el mismo token.**
  "Pérez, Joaquín" y "Joaquín Pérez" colapsan solas; las erratas y los nombres
  incompletos se resuelven con sugerencias que el operador confirma.
- **No se puede exportar algo que después no se pueda reconstruir.** El proyecto
  va antes que las planillas, se guarda solo, y mientras no haya una copia al día
  en el disco las descargas quedan cerradas. El camino de vuelta está en la
  herramienta: cualquier archivo con tokens —el resultado de una consulta, un
  informe— se suelta en la pestaña *Reconstruir* y sale con los valores reales.

Nada sale del navegador: no hay una sola petición de red en toda la aplicación.

## Empezar

```bash
git clone git@github.com:NielsenMax/mist.git
cd mist
open mist.html          # macOS · Linux: xdg-open mist.html · Windows: doble clic
```

`mist.html` está versionado **ya construido**, así que no hay que compilar nada
para usarlo: es el producto, no un intermedio. Bajar ese archivo solo y abrirlo
en cualquier máquina alcanza — no necesita servidor, ni internet, ni instalar
nada. Si tocás algo de `src/`, se regenera con `./build.sh`.

## Uso

Abrí `mist.html` con doble clic. Es un único archivo autocontenido de 1,1 MB;
funciona sin servidor y sin internet.

Lo primero es **elegir un proyecto**, y recién después se cargan planillas. No es
un trámite: una planilla desensibilizada cuya bóveda nunca se guardó es un
archivo que nadie va a poder volver a cruzar ni a reconstruir. Poner el proyecto
adelante hace que ese accidente no sea posible.

Después son seis pestañas. Las cinco primeras son el camino de ida, en ese
orden; la última es la vuelta, y se usa cuando el trabajo con los datos
desensibilizados ya se hizo.

1. **Columnas** — soltá las planillas y revisá la clasificación. MIST propone un
   tipo mirando el encabezado y el contenido; vos confirmás, y si el dato no
   entra en ninguno del catálogo te hacés un tipo propio ahí mismo. Cada columna
   puede conservarse, seudonimizarse, vaciarse, o escanearse en busca de
   entidades ya conocidas si es texto libre. La última columna, *Parte de*,
   sirve para declarar que varias columnas son pedazos de un mismo dato.
2. **Entidades** — cada valor real con el token que le tocó y todas las formas en
   que apareció. Seleccioná dos o más y confirmá que son la misma.
3. **Fusiones** — candidatos a duplicado que la normalización no alcanza a ver:
   erratas, iniciales, nombres a medias. Cada par se acepta o se descarta.
4. **Vista previa** — cómo queda la hoja, con un conmutador para ver los valores
   originales.
5. **Salida** — las planillas desensibilizadas, el mapa inverso en CSV, la bóveda
   y el historial de todo lo que pasó por el proyecto.
6. **Reconstruir** — el camino inverso: soltás un archivo con tokens y sale con
   los valores reales puestos.

### En qué navegador

Funciona en todos, pero dónde vive el proyecto depende de lo que cada uno sepa
hacer. MIST lo detecta solo y lo dice en la portada antes de que elijas nada.

| | Chrome, Edge | Firefox, Zen | sin IndexedDB |
|---|---|---|---|
| Dónde vive el proyecto | una carpeta del disco que elegís vos | IndexedDB del navegador | un archivo JSON |
| Autoguardado | sí, en la carpeta | sí, en el navegador | no |
| Copia en el disco | es el guardado mismo | un `.zip` que bajás | el JSON que bajás |

La tercera columna es el último recurso, para cualquier navegador que no ofrezca
ninguna de las dos cosas. En macOS conviene tener en cuenta que el doble clic
abre el navegador por defecto, que puede ser Safari: si querés la carpeta con
autoguardado, abrí `mist.html` desde Chrome o Edge.

### Buscar dentro del texto

Es la acción para columnas de texto libre: observaciones, detalle de un reclamo,
notas de un vendedor. En vez de reemplazar la celda entera, MIST busca adentro
del texto las entidades que ya conoce y sustituye sólo esas apariciones.

```
Ajuste solicitado por Joaquín Pérez el viernes
Ajuste solicitado por persona-kqjjg098 el viernes
```

Reconoce las formas literales que vio en alguna columna clasificada, de la más
larga a la más corta, para que "Joaquín Pérez" gane sobre "Pérez". Un nombre que
existe únicamente dentro de un comentario, y en ninguna columna, no tiene con qué
ser reconocido: eso es reconocimiento de entidades en texto y MIST no lo hace.

### Tipos propios

El catálogo trae catorce tipos —persona, empresa, email, CUIT, documento,
teléfono, dirección, localidad, cuenta, usuario, identificador, patente, IP,
URL— y **no trae un tipo "otro"**, a propósito. El tipo es el espacio de nombres
del token: dos entidades de tipos distintos nunca se cruzan, aunque el texto sea
idéntico. Una bolsa común haría exactamente lo contrario, y el número de
expediente `A-114` terminaría siendo la misma entidad que el código de producto
`A-114`, que no tienen nada que ver.

Lo que falte se crea. Desde el selector de tipo de cualquier columna, con
*+ Tipo nuevo…*, o desde el botón *Tipos* de la pestaña Columnas. Son tres
decisiones:

| | |
|---|---|
| **Nombre** | cómo se lo va a ver en los selectores. Se propone el encabezado de la columna |
| **Prefijo** | lo que va antes del guion en cada token: `expediente-4kf2m9pq`. Si no lo escribís sale del nombre, salteando las palabras que no dicen nada: "N° de expediente" → `expediente` |
| **Criterio** | uno de los siete normalizadores de la tabla de más abajo: define qué dos valores son el mismo dato |

Buscar parecidos no se pregunta: sale del criterio. Tiene sentido cuando el dato
lo escribe una persona y se puede equivocar, y no cuando es un número o un
código, donde sólo produce falsos positivos —dos documentos que difieren en un
dígito son dos personas, no una errata.

Los tipos propios viajan en la bóveda con el proyecto, así que la próxima tanda
de planillas los tiene disponibles y produce los mismos tokens. Mientras un tipo
no haya acuñado ninguno se puede corregir entero o borrar; una vez que acuñó, el
prefijo y el criterio quedan fijos —cambiarlos les cambiaría el token a
entidades que quizá ya viajaron en una planilla exportada— y sólo se puede
corregir el nombre, que es una etiqueta de pantalla.

Un proyecto viejo que se hizo cuando existía el tipo "otro" lo conserva al
abrirse, con sus tokens intactos: la lista de tipos sale de la bóveda, no del
catálogo. Lo que cambia es que los proyectos nuevos ya no lo tienen.

Una columna marcada para *Seudonimizar* pero sin tipo elegido no se sustituye:
sale en claro, y por eso la interfaz la marca en rojo igual que a una columna
conservada que parece sensible, y la pestaña Salida lo repite antes de dejarte
descargar.

### Un dato repartido en varias columnas

Muchas planillas traen el nombre partido en `nombre` y `apellido`. Tomadas por
separado, "Joaquín" y "Pérez" serían dos personas distintas, y ninguna de las dos
coincidiría con el "Joaquín Pérez" de otra planilla.

MIST une esas columnas en un solo dato: compone el valor de la fila, le acuña un
token y pone **el mismo token en cada una de las partes**, así la planilla
conserva su forma.

```
apellido  nombre        →  apellido           nombre
Pérez     Joaquín          persona-epj8h31h   persona-epj8h31h
```

Ese token es el mismo que le tocó a `Joaquín Pérez` en la planilla que lo trae en
una sola columna. El orden tampoco importa: `apellido, nombre` y `nombre,
apellido` llegan al mismo lugar, porque el normalizador de nombres ordena las
palabras.

Los encabezados típicos (`nombre`/`apellido`, `nombres`/`apellidos`,
`first name`/`last name`, apellido paterno y materno) se componen solos al
cargar el archivo. Cualquier otra combinación se arma a mano desde *Parte de*.

### Diez planillas del mismo formato, una sola decisión

Cada decisión sobre una columna —qué hacer, de qué tipo, de qué campo compuesto
es parte— se guarda **por encabezado y para todo el proyecto**, no por archivo.
`razon_social`, `Razón Social` y `RAZON-SOCIAL` son el mismo encabezado: la
clave ignora mayúsculas, tildes, espacios, guiones y guiones bajos.

Lo que elegís se aplica en las tres direcciones, y por eso no importa en qué
orden hayas soltado los archivos:

- a las planillas **ya cargadas** que tengan ese encabezado,
- a las que cargues **después**, que llegan clasificadas solas,
- y a las de la **próxima sesión**, porque el perfil viaja en la bóveda.

Cuando un cambio alcanza a otras planillas, MIST lo dice: pasa fuera de la
pantalla y no es algo para adivinar.

La excepción es la que hace falta: si en una planilla puntual elegiste algo
distinto a mano, esa elección manda ahí y no la pisa un cambio hecho en otra.
Del mismo modo, la autodetección nunca puede deshacer una decisión tuya —tener
otra planilla cargada sin tocar no te borra el cambio.

### El camino de vuelta

Desensibilizar sirve para poder repartir el trabajo: el analista, el proveedor o
el modelo reciben planillas con tokens y devuelven un resultado que también
tiene tokens. Ese resultado hay que poder leerlo, y sólo lo puede leer quien
tiene la bóveda. Para eso está la pestaña **Reconstruir**: soltás el archivo y
sale con los valores reales puestos.

```
vendedor          cliente           observaciones
persona-6vq3n74n  persona-xem31w81  Cierre de cuenta anual con empresa-0kcmvjty
Lucía Vieytes     Joaquín Pérez     Cierre de cuenta anual con Acme SRL
```

No hace falta que el archivo haya salido de MIST, ni que conserve las columnas
originales, ni el orden, ni los encabezados. Los tokens se reconocen **por su
forma** —prefijo, guion y base32 sin caracteres ambiguos— y se resuelven contra
la bóveda, así que da igual si están solos en una celda, mezclados en una tabla
dinámica o mencionados dentro de una frase. Lo que tiene forma de token pero no
está en la bóveda se deja intacto; si además es de un tipo que el proyecto
conoce, MIST lo dice: ese archivo salió de otra clave maestra.

Un token devuelve la forma literal **más frecuente** de su grupo. Si "Joaquín
Pérez", "Pérez, Joaquín" y la errata "Joaquin Peres" fueron fusionados, los tres
comparten token y la reconstrucción responde con el nombre bien escrito.

Dos cosas no vuelven, y es a propósito: una columna **vaciada** no está en
ninguna parte, y un token acuñado dentro de un texto libre que nunca apareció en
una columna clasificada no tiene forma literal guardada. Los dos casos se
informan en vez de inventarse.

Soltar una planilla desensibilizada en el panel de archivos —el de la izquierda,
el de las planillas de origen— **no la carga**: MIST reconoce sus tokens y
ofrece reconstruirla. Cargarla como fuente registraría cada token como si fuera
un dato real y lo dejaría en la bóveda como una entidad nueva, con su propio
token encima.

### El proyecto es una carpeta

```
mi-proyecto/
  mist.json          clave maestra, tipos, clasificación de cada columna
  fusiones.json      pares confirmados y descartados
  historial.json     qué archivos pasaron por el proyecto y cuándo
  mapa/
    persona-0.json   mapa inverso, partido en fragmentos por tipo
    persona-1.json
    empresa-0.json
```

Cada entrada del mapa es un grupo: su clave normalizada, su token, y **todas las
formas literales con que apareció**, cada una con su cuenta. Esas formas son lo
que hace posible la reconstrucción meses después, con las planillas originales
en ninguna parte: se acumulan a lo largo de la vida del proyecto y no se pierden
cuando un archivo deja de estar cargado.

El mapa tiene una entrada por valor real distinto, así que en un proyecto grande
es lo único que pesa. Partirlo sirve para dos cosas: que ningún archivo se vuelva
inmanejable, y que **guardar después de cada acción escriba sólo el fragmento que
cambió**. Con 53.600 entidades la bóveda entera ocupa 2,4 MB repartidos en unos
160 archivos y el más grande son 70 KB: confirmar una fusión reescribe 70 KB, no
2,4 MB. La cantidad de fragmentos crece con el proyecto (4 hasta 20.000
entidades, 32 hasta 500.000, 256 más allá).

**Se guarda sola con cada acción que lo requiera**: cargar planillas, cambiar la
clasificación de una columna, componer o separar columnas, confirmar o descartar
una fusión, mover el umbral, exportar una planilla. El estado del guardado está
siempre a la vista en la barra de arriba, al lado del nombre del proyecto.
Mientras no haya una copia al día en el disco, MIST no deja descargar planillas y
el navegador pide confirmación antes de cerrar la pestaña.

**La bóveda es tan sensible como los datos originales**: contiene los nombres
reales al lado de su token. Se puede cifrar con una frase al crear el proyecto
(AES-GCM, clave derivada con PBKDF2-SHA256, 310.000 iteraciones); en ese caso el
manifiesto conserva en claro sólo el nombre, la huella y la sal.

La huella de ocho caracteres que se ve en la barra identifica la clave maestra.
Dos proyectos con la misma huella producen los mismos tokens.

Para mover un proyecto de una máquina a otra alcanza con copiar la carpeta. Desde
Firefox, con el `.zip`: al descomprimirlo aparece esa misma carpeta.

### Qué guarda y qué no

La bóveda guarda **decisiones**, no datos: la clave maestra, los tipos, la
clasificación de cada columna por nombre de encabezado, las fusiones confirmadas
y descartadas, el mapa de cada token a su valor real, y el historial de archivos.
No guarda las planillas ni dónde estaban.

Abrir un proyecto, entonces, no repone los archivos: arranca sin ninguno cargado
y vos volvés a soltar los que necesites, sean los mismos o nuevos. Lo que
reaparece solo es el tratamiento — cada columna con la clasificación que ya
tenía, y cada valor conocido con exactamente el token que ya le tocó. Y la
pestaña Reconstruir funciona igual con el proyecto recién abierto y vacío: lo que
necesita está en la bóveda, no en los archivos.

No podría ser de otra manera: la File API de los navegadores no expone la ruta de
un archivo, sólo su nombre. Y guardar referencias a las planillas originales
tampoco sería deseable en una herramienta cuyo punto es no quedarse con los datos
sensibles.

### Historial

Lo que sí queda anotado es **qué archivos pasaron por el proyecto**: nombre, una
huella SHA-256 del contenido, las hojas con su cantidad de filas, cuándo se
procesó por primera y última vez, cuántas veces, y cuándo se exportó. Vive en
`historial.json` y responde las dos preguntas que aparecen cuando llega una tanda
nueva:

- **¿este archivo ya lo hice?** Si soltás uno que ya pasó, MIST lo reconoce por
  la huella y te lo dice, con la fecha y si llegó a exportarse.
- **¿este archivo cambió?** Si el nombre coincide pero el contenido no, lo marca
  en ámbar en la lista de archivos y deja de figurar como exportado, porque lo
  que exportaste era la versión vieja.

La tabla completa está en la pestaña Salida, incluidos los archivos que hoy no
están cargados. Los que nunca se exportaron aparecen resaltados.

Nada de esto guarda contenido: la huella es un hash, no permite reconstruir el
archivo.

### En Firefox

La File System Access API existe en Chrome y Edge; Mozilla decidió no
implementarla. Así que en Firefox —y en sus derivados, como Zen— no hay carpeta.
MIST lo detecta, lo dice en la portada antes de que elijas nada, y cambia de
estrategia en vez de degradarse:

- **El proyecto se autoguarda igual**, en IndexedDB, con cada acción. Sobrevive a
  cerrar la pestaña y a que se caiga el navegador.
- **La copia en el disco se baja como un `.zip`** que se descomprime en
  exactamente la carpeta del proyecto, y que Chrome abre como tal. Medido sobre
  53.600 entidades: 2,1 MB de carpeta quedan en 0,64 MB de zip, armado en 83 ms.
- **Abrir un proyecto** ofrece las tres fuentes: los que están guardados en este
  navegador, una carpeta (que Firefox sí puede *leer*), o un `.zip` / `.json`.

Guardar dentro del navegador no es un respaldo: si se borran los datos del sitio
se va con eso. Por eso la compuerta de exportación no mide *guardado* sino *copia
en el disco*: podés trabajar todo lo que quieras, pero para descargar una planilla
desensibilizada tenés que haber bajado el zip después del último cambio. Lo mismo
vale para cerrar la pestaña.

## Cómo se generan los tokens

```
token = prefijo_del_tipo + "-" + HMAC-SHA256(clave_maestra, tipo | grupo)
```

truncado a ocho caracteres de un alfabeto base32 sin caracteres ambiguos.

El *grupo* es la clave normalizada de la entidad, o la menor del conjunto si
varias fueron fusionadas. El *tipo* actúa como espacio de nombres: el mismo texto
en una columna "empresa" y en una columna "persona" son entidades distintas; la
misma persona en "cliente" y en "vendedor" es la misma entidad.

Como el token se *deriva* en vez de sortearse, no hace falta arrastrar un
diccionario para mantener la consistencia: alcanza con la misma clave maestra.

### Qué pasa al fusionar, si el token es derivado

Lo que se deriva del grupo, no del valor. Fusionar es decir "estas dos claves
normalizadas son el mismo grupo", y eso vive en una tabla de conjuntos disjuntos
que va en la bóveda junto a la clave maestra.

Al fusionar `joaquin perez` con `joaquin`, el grupo resultante **hereda el token
de la forma más frecuente** en vez de acuñar uno nuevo. Es la diferencia entre
que la fusión aclare algo y que rompa todo: si el token se recalculara, confirmar
que "Joaquín" es "Joaquín Pérez" le cambiaría el token a Joaquín Pérez y todo lo
exportado hasta ese momento quedaría desalineado. La asignación queda fijada en
la bóveda, así que tampoco depende del orden en que se hicieron las fusiones.

En resumen: la derivación te da la consistencia gratis, y la tabla de fusiones es
el poco estado que hace falta para decir qué claves son el mismo grupo. Las dos
cosas viven en la bóveda.

### Qué significa "es el mismo dato"

Lo define el normalizador del tipo:

| Normalizador | Colapsa | Usado por |
|---|---|---|
| Nombre de persona | orden de las palabras, tildes, puntuación, tratamientos (Sr., Dr.) | persona, localidad |
| Organización | lo anterior más la forma jurídica (SA, S.R.L., Ltda) | empresa |
| Sólo dígitos | separadores y prefijos: `30-71234567-9` ≡ `30712345679` | CUIT, DNI, teléfono, cuenta |
| Alfanumérico | espacios, guiones y mayúsculas | patente, identificador |
| Texto exacto / sin puntuación | mayúsculas y espacios de más | email, usuario, URL, dirección |

Un tipo propio elige uno de estos siete: es la única decisión de su creación que
cambia qué valores colapsan entre sí.

Lo que la normalización no alcanza queda para las sugerencias, que combinan
Jaro-Winkler sobre cada palabra con la superposición de conjuntos de palabras.
Un ejemplo de la calibración: `Joaquin Perez` y `Joaquin Gomez` comparten el 60 %
de los caracteres y Jaro-Winkler solos los daría 0,89 — MIST los deja en 0,55.

## Límites conocidos

- **La búsqueda en texto libre sólo encuentra formas ya vistas.** Un nombre que
  aparece únicamente dentro de un comentario, y en ninguna columna clasificada,
  no tiene con qué ser reconocido. Se usan hasta 4.000 formas literales; si hay
  más, la herramienta lo avisa en la pestaña Salida.
- **Una parte vacía hace otra entidad.** Si una fila tiene `nombre` pero le falta
  el `apellido`, el dato compuesto es "Joaquín" y no coincide con "Joaquín
  Pérez". Es lo correcto —no hay con qué saber que son la misma persona— y se
  resuelve fusionándolos desde Entidades. El parecido entre un nombre completo y
  uno parcial da 0,82: aparece si bajás el umbral, pero no se sugiere solo.
- **La comparación difusa usa bloqueo por prefijos y firma de letras.** Con
  volúmenes muy grandes puede saltear pares; cuando pasa, lo dice.
- **Los CSV se leen como UTF-8.** Un archivo en Latin-1 va a mostrar los acentos
  rotos; convertilo antes.
- **La salida CSV se escribe con BOM** para que Excel abra los acentos bien.
- **La carpeta de proyecto necesita Chrome o Edge de escritorio.** En Firefox el
  proyecto se autoguarda en el navegador y la copia en disco es un zip; sin
  IndexedDB ni carpetas, un archivo JSON único sin autoguardado. Los tokens no
  dependen de nada de esto: SHA-256 y HMAC son propios y sincrónicos, así que
  funcionan igual en cualquier lado.
- **Un fragmento del mapa no se borra sólo porque una columna deje de tratarse.**
  Un token que ya se acuñó puede estar en una planilla exportada la semana
  pasada, así que se conserva aunque el valor no aparezca en ningún archivo
  cargado hoy.
- **Guardar en el navegador no es un respaldo.** Borrar los datos del sitio, o
  trabajar en una ventana privada, se lleva el proyecto. Por eso la compuerta
  exige la copia en el disco y no se conforma con el autoguardado.
- **La reconstrucción devuelve una forma, no la de esa fila.** El token es del
  grupo, no de la aparición: si una entidad se escribió de tres maneras, las tres
  celdas vuelven con la más frecuente. Recuperar exactamente lo que decía cada
  celda exigiría guardar la posición de cada aparición, que es tanto como guardar
  la planilla.
- **Una columna vaciada no se reconstruye.** Vaciar no deja rastro en ninguna
  parte, y es lo que se espera de vaciar.

## Rendimiento

50.000 filas × 6 columnas, 53.600 entidades distintas:

| | |
|---|---|
| Leer el CSV (3,8 MB) | 32 ms |
| Escanear y acuñar tokens | 325 ms |
| Buscar duplicados | 730 ms |
| Transformar las 50.000 filas | 155 ms |
| Reconstruir esas 50.000 filas (250.000 tokens) | 77 ms |
| Armar la bóveda entera | 68 ms |
| Comprimirla a zip | 87 ms |

La bóveda ocupa 2,4 MB en unos 160 archivos, el mayor de 70 KB; comprimida,
0,65 MB. Guardar después de una acción sólo reescribe los fragmentos que
cambiaron, que en la práctica es uno.

La reconstrucción se mide con la bóveda recién abierta y **ninguna planilla
cargada**, que es como se usa: lo único que necesita está en el mapa.

## Estructura

```
mist.html            el entregable: un archivo, offline, doble clic
build.sh             arma mist.html metiendo src/ y vendor/ adentro
probar.sh            corre las siete suites
src/
  00-hash.js         SHA-256 y HMAC en JS puro, tokens base32
  10-tipos.js        catálogo de tipos, tipos propios, normalizadores, autodetección
  20-entidades.js    registro, fusiones (conjuntos disjuntos), Jaro-Winkler
  30-io.js           lectura y escritura de CSV y XLSX
  40-proyecto.js     el motor: escaneo, acuñación, transformación, reconstrucción
  45-zip.js          escribir y leer zip, para que la bóveda viaje comprimida
  50-boveda.js       formato de la bóveda, fragmentos, cifrado opcional
  55-almacen.js      carpeta, navegador o archivo, y el autoguardado
  60-ui.js           la interfaz
  estilos.css
  index.html         versión de desarrollo, con <script src>
vendor/              SheetJS y PapaParse
ejemplos/            planillas de prueba con duplicados a propósito
pruebas/             las suites, más un driver de Chrome por CDP
```

Para desarrollar, abrí `src/index.html` directo con doble clic y recargá: es la
misma aplicación con los `<script src>` sueltos, sin paso de build en el medio.

Desde la consola del navegador, `MIST.app` expone el estado vivo:
`MIST.app.proyecto.inventario()`, `MIST.app.vista.guardado.estado`,
`MIST.app.render()`.

## Construir

```bash
./build.sh
```

Toma `src/index.html` y le mete adentro el CSS y todos los `<script src>`,
vendor incluido, y escribe `mist.html`. **Necesita bash y python3, nada más**:
no hay `npm install`, ni bundler, ni `node_modules`, ni paso de minificación.

Lo único que hace además de concatenar es escapar los `</script` que aparezcan
dentro del código —cerrarían la etiqueta antes de tiempo— y **fallar si queda
alguna referencia externa**. Esa verificación es lo que garantiza que el archivo
entregado funcione sin red: no es una convención que haya que recordar.

## Pruebas

```bash
./probar.sh
```

Necesita **Node 22 o más nuevo** (las suites de navegador usan el `WebSocket`
global). Las cinco primeras suites corren sólo con node; las dos últimas manejan
un Chrome de verdad por CDP y se saltean solas si no lo encuentran en
`/Applications/Google Chrome.app` — o sea que en Linux o Windows hay que ajustar
esa ruta en `pruebas/chrome.js`. No hay dependencias que instalar: el driver de
Chrome son 90 líneas propias.

- **núcleo** — vectores conocidos de SHA-256 y HMAC, normalizadores, calibración
  de la similitud, determinismo de los tokens.
- **integración** — el motor completo sobre `ejemplos/`: autodetección,
  consistencia entre archivos, columnas compuestas, fusión, texto libre, ida y
  vuelta de la bóveda (en claro y cifrada), y que el CSV de salida no contenga
  ni un dato real.
- **almacén** — escritura incremental, autoguardado, borrado de fragmentos
  vacíos, historial de archivos (repetido, cambiado, exportado), cifrado sobre
  carpeta, respaldo de archivo único y bóvedas v1, todo contra un
  `FileSystemDirectoryHandle` falso en memoria.
- **zip** — vector conocido de CRC32, ida y vuelta, y que `unzip` del sistema
  operativo abra el archivo y reconstruya la carpeta.
- **carga** — 50.000 filas.
- **interfaz** — Chrome de verdad manejado por CDP sobre `mist.html`: elección de
  proyecto, carga por drag & drop, clasificación, columnas compuestas, buscador,
  fusiones, vista previa, autoguardado, compuerta de exportación y reapertura del
  proyecto desde lo que quedó escrito.
- **sin carpetas** — el mismo Chrome con `showDirectoryPicker` borrado antes de
  que cargue la página, o sea el camino de Firefox: IndexedDB, zip y compuerta
  por copia en disco, todo real.

Lo único que las pruebas no pueden ejercitar es el selector nativo de carpetas
(`showDirectoryPicker`), porque abre un diálogo del sistema operativo. Todo lo
que pasa después del selector sí se prueba, con un handle falso.

## Librerías

- [SheetJS](https://sheetjs.com) (Apache-2.0) — XLSX, XLS, ODS.
- [PapaParse](https://www.papaparse.com) (MIT) — CSV.

Ambas van embebidas en `mist.html`. El resto es propio: no hay dependencia de red
en ejecución ni `node_modules` para usar la herramienta.
