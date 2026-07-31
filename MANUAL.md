# Manual de uso

Guía para trabajar con MIST en una fiscalía: qué hace, cuándo usarlo, cómo se
usa un caso de punta a punta y cómo se manejan varias causas a la vez.

---

## 1. Qué es y para qué sirve

Una causa llega con planillas: listados de llamadas, movimientos bancarios, un
padrón de empleados, la exportación de un sistema, planillas de secuestro,
inventarios. Analizarlas con un modelo de lenguaje —cruzarlas, resumirlas,
buscar quién aparece en dónde— es útil, pero esas planillas tienen nombres,
documentos, CUIT, teléfonos y domicilios de personas de la causa, y eso no puede
salir de la fiscalía.

**MIST reemplaza los datos sensibles por tokens antes de que la planilla salga**,
y sabe deshacer el reemplazo cuando el resultado vuelve.

```
Joaquín Pérez  →  persona-k3f9x2q1
30-71234567-9  →  cuit-8mv2r4qd
Acme SRL       →  empresa-0kcmvjty
```

El token no es un seudónimo cualquiera: es el mismo dato en todas las planillas
y en todas las sesiones. Eso es lo que hace que el análisis siga sirviendo. El
modelo puede decir "`persona-k3f9x2q1` aparece en el listado de llamadas del
teléfono X y también como titular de la cuenta Y", y eso es una afirmación
sobre una persona concreta, que después se lee con nombre y apellido.

Tres propiedades sostienen todo lo demás:

- **El mismo dato da el mismo token en todos los archivos**, hoy y dentro de seis
  meses. Los cruces entre planillas siguen funcionando después de tokenizar.
- **Dos escrituras distintas de la misma cosa terminan en el mismo token.**
  "Pérez, Joaquín" y "Joaquín Pérez" colapsan solas; las erratas y los nombres
  incompletos se resuelven con sugerencias que vos confirmás.
- **No se puede exportar algo que después no se pueda reconstruir.** Mientras no
  haya una copia al día de la bóveda en el disco, las descargas quedan cerradas.

**Nada sale del navegador.** No hay una sola petición de red en toda la
aplicación: el archivo `mist.html` funciona en una máquina sin internet, y las
planillas nunca se suben a ningún lado. Lo único que sale de la fiscalía es lo
que vos descargás y mandás a mano.

### Qué no es

- **No es anonimización.** Es seudonimización **reversible**: quien tiene la
  bóveda puede volver a los nombres reales. La bóveda es tan sensible como el
  expediente y se cuida igual.
- **No detecta nombres en texto libre por su cuenta.** Reconoce dentro de un
  comentario los nombres que ya vio en alguna columna clasificada, y sólo esos.
  Un testigo mencionado únicamente adentro de una observación no queda protegido
  solo. (Sección 9.)
- **No decide qué es sensible.** Propone, y vos confirmás. La responsabilidad de
  qué sale y qué no sigue siendo del operador.

---

## 2. El ciclo completo

```
   planilla original                                  planilla con tokens
   (datos reales)                                     (sale de la fiscalía)
         │                                                     │
         │   1. Columnas: qué se sustituye y de qué tipo        │
         │   2. Entidades / Fusiones: unificar duplicados       │
         └────────────►  M I S T  ──── 5. Salida ───────────────┘
                            ▲                                   │
                            │                                   ▼
                        BÓVEDA                          modelo de lenguaje,
                   (nunca sale de acá)                  perito, planilla de
                            │                           trabajo, informe
                            │                                   │
         ┌──────────────────┘                                   │
         ▼                                                      ▼
   resultado con nombres  ◄──── 6. Reconstruir ◄──── resultado con tokens
```

Todo lo que MIST necesita para el camino de vuelta está en la **bóveda**. La
bóveda no guarda las planillas: guarda decisiones y el mapa de cada token a su
valor real. Por eso se puede reconstruir un informe meses después, con las
planillas originales archivadas y ningún archivo cargado.

---

## 3. Cuatro conceptos y ya

**Entidad.** Un dato real distinto: una persona, una empresa, un CUIT. MIST junta
todas las formas en que apareció escrito y las trata como una sola cosa.

**Token.** El reemplazo: `prefijo-8caracteres`. Se *deriva* de la clave maestra
del proyecto y del valor normalizado, no se sortea. Por eso la misma entidad da
el mismo token siempre, sin necesidad de arrastrar un diccionario.

**Tipo.** Persona, Empresa, CUIT, Documento, Teléfono, Dirección, Localidad,
Email, Cuenta, Usuario, Identificador, Patente, IP, URL — catorce de fábrica, y
los que te hagas vos (expediente, legajo, historia clínica, número de causa). El
tipo es el **espacio de nombres** del token: dos entidades de tipos distintos
nunca se cruzan aunque el texto sea idéntico. Por eso no hay un tipo "otro": el
expediente `A-114` y el código de producto `A-114` no son la misma cosa.

**Proyecto (o bóveda).** Una carpeta con la clave maestra, los tipos, la
clasificación de cada columna, las fusiones confirmadas, el mapa
token → valor real y el historial de archivos. **Un proyecto = una causa.**
Se guarda solo con cada acción. La huella de ocho caracteres que se ve arriba
identifica la clave: dos proyectos con la misma huella producen los mismos
tokens.

---

## 4. Antes de empezar

### Instalación

No hay instalación. `mist.html` es un archivo de 1,1 MB que se abre con doble
clic y funciona sin servidor, sin internet y sin instalar nada. Se puede copiar
a un pendrive y usar en una máquina aislada.

### En qué navegador conviene abrirlo

| | Chrome, Edge | Firefox, Zen | otros |
|---|---|---|---|
| Dónde vive el proyecto | una carpeta del disco que elegís vos | dentro del navegador | un archivo JSON |
| Autoguardado | sí, en la carpeta | sí, en el navegador | no |
| Copia en el disco | es el guardado mismo | un `.zip` que bajás | el JSON que bajás |

**Recomendación: Chrome o Edge de escritorio.** El proyecto queda como una
carpeta común en el disco, se guarda solo con cada cambio y podés dejarla donde
guardás el resto de la causa. En macOS, el doble clic abre el navegador por
defecto —que puede ser Safari—: si querés la carpeta, abrí `mist.html` desde
Chrome.

MIST detecta dónde está y lo dice en la portada, antes de que elijas nada.

### Dónde guardar la carpeta del proyecto

Donde guardarías el expediente digital. **La bóveda tiene los nombres reales al
lado de su token**: si se filtra, se filtró la causa entera. No va en una carpeta
compartida ni sincronizada a una nube personal.

Al crear el proyecto podés **cifrarlo con una frase** (AES-GCM, clave derivada
con PBKDF2-SHA256, 310.000 iteraciones). Si el equipo es compartido o el
proyecto va a viajar en un pendrive, cifralo. Anotá la frase donde corresponda:
**si la perdés, no hay camino de vuelta** y las planillas ya exportadas quedan
sin poder reconstruirse.

---

## 5. Casos de uso normales

**a. Mandarle una planilla a un modelo de lenguaje.** El caso central. Cargás la
planilla, marcás qué columnas se sustituyen, descargás la versión con tokens y
esa es la que subís al modelo. Los montos, las fechas y las columnas que no
identifican a nadie viajan tal cual, así que el análisis es el mismo.

**b. Cruzar varias planillas de la misma causa.** Movimientos bancarios, listado
de llamadas y un padrón, los tres con la misma persona escrita de tres maneras
distintas. Cargalos todos en el mismo proyecto: la misma persona recibe el mismo
token en los tres, y recién ahí el cruce es posible sin datos reales.

**c. Pasarle datos a un perito, a un auxiliar o a otro organismo.** Lo mismo, con
la diferencia de que del otro lado no hay bóveda: no pueden reidentificar a
nadie aunque quieran. Vos recibís el informe con tokens y lo leés acá.

**d. Traer de vuelta un resultado.** El modelo devuelve una tabla, un resumen o
un listado con tokens adentro. Se suelta en *Reconstruir* y sale con los nombres
puestos. No importa que el archivo no haya salido de MIST, ni que las columnas
hayan cambiado de nombre, ni que el token esté mencionado dentro de una frase.

**e. Una tanda nueva sobre una causa vieja.** Llegan tres planillas más, seis
meses después. Abrís el proyecto de la causa y las soltás: las columnas ya
conocidas se clasifican solas y las personas que ya estaban reciben exactamente
el token que tenían. Lo que mandaste en marzo y lo que mandás en septiembre se
cruzan entre sí.

---

## 6. Guía paso a paso de un caso

Este recorrido usa las planillas de `ejemplos/` —`clientes.csv`, `ventas.csv`,
`padron.csv`, `reclamos.xlsx`—, que traen duplicados y erratas a propósito. Se
puede hacer entero para practicar antes de tocar una causa real.

### Paso 1 — Crear el proyecto de la causa

Abrí `mist.html`. La primera pantalla no deja hacer otra cosa: **primero el
proyecto, después las planillas.** No es un trámite. Una planilla tokenizada
cuya bóveda nunca se guardó es un archivo que nadie va a poder cruzar ni
reconstruir nunca más.

1. *Crear un proyecto*.
2. Ponele el nombre de la causa. Algo que dentro de un año siga diciendo algo:
   `2026-114-defraudacion`, no `proyecto1`.
3. Si vas a cifrar, escribí la frase. Si dejás el campo vacío, la bóveda queda
   en claro (protegida sólo por dónde la guardes).
4. En Chrome/Edge te va a pedir **una carpeta vacía**. Creá una nueva, adentro
   de donde vive la causa. MIST escribe ahí y la mantiene al día sola.

Arriba, al lado del nombre, van a quedar siempre visibles el **estado del
guardado** y la **huella de la clave**. Los dos importan: el primero te dice si
hay copia en el disco, el segundo en qué causa estás parado.

### Paso 2 — Cargar las planillas

Soltá los archivos en el panel de la izquierda. CSV, TSV, XLSX, XLS u ODS; podés
soltar varios de una. Cada archivo aparece con sus hojas y la cantidad de filas.

Cargá **todas las planillas de la causa que vayan a analizarse juntas**, aunque
después exportes sólo algunas. Cuantas más estén cargadas, mejor unifica: las
formas de escribir un mismo nombre se acumulan y los duplicados se ven.

Dos avisos que pueden aparecer acá:

- *"Estos archivos ya habían pasado por el proyecto"* — el mismo archivo ya se
  procesó antes. Te dice cuándo y si llegó a exportarse.
- *"Ese archivo ya está desensibilizado"* — soltaste una planilla que salió de
  acá. **No se carga como origen** (registraría cada token como si fuera un dato
  real). MIST te ofrece reconstruirla, que es casi siempre lo que querías.

### Paso 3 — Columnas: decidir qué sale y qué no

Es la pestaña donde se hace el trabajo. Cada columna tiene cuatro opciones:

| Qué hacer | Cuándo |
|---|---|
| **Conservar** | la columna no identifica a nadie: fechas, montos, rubros, códigos internos |
| **Seudonimizar** | la columna es un dato sensible: se reemplaza entera por un token |
| **Buscar dentro del texto** | texto libre (observaciones, detalle de un reclamo): se sustituyen sólo las entidades conocidas que aparezcan adentro |
| **Vaciar** | no hace falta para el análisis y no querés que salga: la columna sale en blanco y **no se puede reconstruir** |

MIST propone un tipo mirando el encabezado y el contenido; vos confirmás o
corregís. Lo que hay que mirar en esta pantalla:

- **Las filas marcadas en rojo.** Son las que salen en claro y parecen datos
  sensibles: una columna conservada que parece un CUIT, o —el error más fácil de
  cometer— una columna marcada para *Seudonimizar* **pero sin tipo elegido**, que
  no se sustituye y sale igual que entró.
- **La columna "Muestra"**, con tres valores de ejemplo. Alcanza para darse
  cuenta de que "observaciones" tiene nombres adentro.
- **La columna "Parte de"**, para declarar que dos columnas son pedazos de un
  mismo dato. En `padron.csv`, `apellido` y `nombre` se unen solas y reciben el
  mismo token, que además es el mismo que le tocó a "Joaquín Pérez" en la
  planilla que lo trae en una sola columna. Los encabezados típicos se componen
  automáticamente; cualquier otra combinación se arma acá a mano.
- **El botón *Tipos***, si la causa tiene un dato que no entra en el catálogo:
  número de expediente, de legajo, de historia clínica, de trámite. Creá un tipo
  en vez de forzarlo dentro de uno que no es. Son tres decisiones: nombre,
  prefijo del token y qué cuenta como "el mismo dato".

**Una decisión sobre una columna vale para todo el proyecto**, no para el archivo
donde la tomaste. `razon_social`, `Razón Social` y `RAZON-SOCIAL` son el mismo
encabezado. Lo que elegís se aplica a las planillas ya cargadas, a las que
cargues después y a las de la próxima sesión. Cuando un cambio alcanza a otras
planillas, MIST lo dice arriba de la tabla.

### Paso 4 — Entidades: revisar quién es quién

Cada valor real con el token que le tocó y **todas las formas en que apareció**.
Se puede filtrar por tipo y buscar por valor o por token.

Acá se hacen dos cosas:

- **Verificar.** Buscá dos o tres personas de la causa que conozcas y fijate que
  todas sus variantes estén en una sola fila. Si "Joaquín Pérez" aparece en dos
  filas distintas, van a recibir dos tokens distintos y el modelo va a verlos
  como dos personas.
- **Fusionar a mano.** Seleccioná dos o más filas y *Es la misma entidad*. No se
  puede fusionar entre tipos distintos, a propósito: una persona y una empresa
  que se llaman parecido son entidades distintas.

Si te equivocaste, la fila fusionada tiene un botón *Separar*.

### Paso 5 — Fusiones: los duplicados que la normalización no ve

Las variantes de orden, tildes, puntuación y forma jurídica ya se unificaron
solas. Esta pestaña va por lo que queda: erratas, iniciales, nombres a medias.

Apretá *Buscar duplicados*. Cada par sale con un puntaje de parecido y dos
botones: *Es la misma* o *Son distintas*. **Contestá los dos.** Descartar un par
también es información: queda anotado y no vuelve a aparecer.

El *parecido mínimo* arranca en 0,85. Bajarlo trae candidatos más flojos —entre
ellos los nombres incompletos, que dan alrededor de 0,82— y también más ruido.
Para una causa chica conviene bajarlo un poco y revisar todo; para una planilla
de cincuenta mil filas, dejarlo donde está.

Fusionar no cambia el token: el grupo **hereda el token de la forma más
frecuente**. Confirmar que "Joaquin Peres" es "Joaquín Pérez" no le cambia el
token a lo que ya exportaste.

### Paso 6 — Vista previa: mirar antes de mandar

Cómo queda la hoja, con un conmutador para ver los valores originales. **Es la
última oportunidad de darse cuenta de algo antes de que el archivo salga.** Lo
que hay que mirar: que no quede ningún nombre en claro, y que las columnas que
tenían que quedar intactas —fechas, montos— efectivamente estén intactas.

### Paso 7 — Salida: descargar

Arriba, las cifras del proyecto: filas, columnas sustituidas, entidades
distintas, columnas intactas. Abajo, los avisos: cada columna que sale en claro y
parece sensible aparece acá otra vez, con el archivo y la hoja donde está.
**Leelos.** Es el último control automático que hay.

Si falta guardar, la descarga está trabada y el botón te lo dice. En Chrome/Edge
alcanza con guardar; en Firefox hay que bajar el `.zip`, porque lo que está
guardado dentro del navegador no es un respaldo.

Se descargan:

- **Las planillas tokenizadas**, una por una o todas juntas. Salen con el mismo
  formato que entraron y el nombre `clientes.desensibilizado.csv`. Van a la
  carpeta de descargas del navegador, **no** a la carpeta del proyecto: movelas a
  donde corresponda.
- **El mapa inverso en CSV** (`mist-mapa-<huella>.csv`), con cada token, sus
  formas originales y en qué columnas apareció. Sirve para auditar el trabajo o
  para dejar constancia en el expediente. **Tiene los datos reales adentro: no se
  manda a ningún lado junto con las planillas.**

### Paso 8 — Trabajar con el modelo

Las planillas `*.desensibilizado.csv` son las que subís al modelo. Sección 7.

### Paso 9 — Reconstruir el resultado

El modelo devuelve una tabla, un listado o un informe con tokens. Volvé a MIST,
pestaña *Reconstruir*, y soltalo ahí.

```
vendedor          cliente           observaciones
persona-6vq3n74n  persona-xem31w81  Cierre de cuenta anual con empresa-0kcmvjty
Lucía Vieytes     Joaquín Pérez     Cierre de cuenta anual con Acme SRL
```

No hace falta que el archivo haya salido de MIST, ni que conserve las columnas
originales, ni el orden, ni los encabezados: los tokens se reconocen por su
forma y se resuelven contra la bóveda, estén solos en una celda o mencionados
dentro de una frase.

El informe de arriba dice cuántos tokens se recuperaron, cuántas entidades
distintas y, si aparece, cuántos **tokens de otra bóveda**: tienen la forma de
este proyecto pero no están en él, o sea que salieron de otra clave maestra —casi
siempre, de otra causa—. Esos quedan como están.

*Descargar reconstruido* baja el archivo con los valores reales.
**Ese archivo tiene los datos de la causa adentro y se trata como el expediente.**

Para reconstruir **no hace falta tener ninguna planilla cargada**: abrís el
proyecto de la causa, vas directo a *Reconstruir* y listo. Es exactamente como se
usa seis meses después.

---

## 7. Cómo trabajar con el modelo de lenguaje

### Qué se manda

Sólo los archivos `*.desensibilizado.*`. Nunca la carpeta del proyecto, nunca el
`mist-mapa-*.csv`, nunca la planilla original.

### Qué sigue viajando en claro

Lo que marcaste *Conservar*. Es lo correcto —el análisis necesita los montos y
las fechas— pero hay que pensarlo: **una combinación de datos no sensibles puede
identificar a una persona igual**. Un domicilio conservado más una fecha de
nacimiento alcanza. Si una columna no hace falta para lo que le vas a pedir al
modelo, *Vaciar* es mejor que *Conservar*.

### Cómo pedírselo

Conviene decirle al modelo qué son los tokens. Algo así, arriba del pedido:

> Los valores con formato `tipo-xxxxxxxx` (por ejemplo `persona-k3f9x2q1`,
> `cuit-8mv2r4qd`) son identificadores seudonimizados. Cada uno corresponde
> siempre a la misma persona, empresa o dato, en todos los archivos que te paso.
> Tratalos como identificadores opacos: podés contarlos, agruparlos y cruzarlos
> entre planillas, pero **no los modifiques, no los abrevies y no inventes
> tokens nuevos**. Cuando te refieras a una persona o entidad en tu respuesta,
> usá su token textual.

Eso último es lo que hace que la respuesta se pueda reconstruir. Un token
recortado, escrito con otra mayúscula o inventado no vuelve.

### Qué se puede pedir sin problemas

Cruces entre planillas, frecuencias, "quién aparece en más de un archivo",
líneas de tiempo, resúmenes de un flujo de fondos, detección de patrones. Todo
eso funciona igual con tokens: la estructura de los datos está intacta.

### Qué no funciona

Cualquier cosa que necesite el contenido del dato en sí: reconocer que un
apellido es de una familia conocida, deducir el género o la nacionalidad de un
nombre, validar el dígito verificador de un CUIT, agrupar por barrio a partir de
un domicilio. Eso se perdió, que es justamente el punto.

### Que la respuesta vuelva en un archivo

Pedile al modelo que devuelva el resultado como CSV o tabla, y guardalo como
archivo. Reconstruir un archivo es un gesto; copiar y pegar de una conversación
es donde se pierden los tokens.

---

## 8. Trabajar con varias causas

### La regla

**Un proyecto por causa.** Una carpeta por causa. Nunca dos causas en el mismo
proyecto.

No es una convención de orden: es la garantía. Cada proyecto tiene su propia
clave maestra, así que **los tokens de una causa no significan nada en otra**. Si
un archivo de la causa A se suelta en el proyecto de la causa B, MIST lo detecta
y avisa que esos tokens salieron de otra clave maestra, en vez de resolverlos
mal. Un solo proyecto para todo perdería esa protección: los nombres de una causa
quedarían en la bóveda de la otra, y un token pegado en el lugar equivocado
resolvería sin ruido.

### Cómo se ve en el disco

```
causas/
  2026-114-defraudacion/
    mist.json          clave maestra, tipos, clasificación de cada columna
    fusiones.json      pares confirmados y descartados
    historial.json     qué archivos pasaron por el proyecto y cuándo
    mapa/              el mapa inverso, partido en fragmentos por tipo
  2026-118-estafa/
    ...
  2025-090-lavado/
    ...
```

Cada carpeta es autosuficiente. Copiarla es mover la causa entera de máquina;
borrarla es perder el camino de vuelta de todo lo que salió de ahí.

### Cambiar de causa

Se abre un proyecto por vez. Para cambiar: recargá `mist.html` y *Abrir un
proyecto*.

Al abrir, MIST te confirma el nombre, la huella de la clave, cuántas fusiones,
cuántos tokens fijados y cuántas planillas hay en el historial. **Mirá la huella
antes de cargar nada.** Es el control de que estás en la causa que creés.

El proyecto abre **sin ninguna planilla cargada**, y es lo correcto: la bóveda
guarda decisiones, no datos. Volvés a soltar los archivos que necesites —los
mismos o nuevos— y reaparece solo el tratamiento: cada columna con la
clasificación que ya tenía y cada valor conocido con exactamente el token que ya
le tocó.

### Nombrar las cosas

- **Proyecto y carpeta**: número de causa más una palabra. `2026-114-defraudacion`.
- **Planillas que salen**: MIST les pone `.desensibilizado` solo. No las renombres
  hasta después de mandarlas.
- **Resultados que vuelven**: guardalos con el número de causa en el nombre.
  Un archivo con tokens sin nombre de causa es un archivo del que no vas a saber
  contra qué bóveda reconstruirlo.

### Cuándo dos causas comparten proyecto

Casi nunca. Sólo si son la misma investigación repartida en dos expedientes y
**necesitás cruzar personas entre las dos**. Ahí, un proyecto único es la única
forma de que la misma persona reciba el mismo token en ambas — y hay que asumir
que la bóveda pasa a cubrir a las dos causas, con lo que eso implica para quién
puede acceder a ella.

Si sólo hay que archivar de forma parecida, no: proyectos separados.

### Varias causas en paralelo

Se puede tener MIST abierto en dos pestañas con dos proyectos distintos, pero
**no conviene**. Es la forma más fácil de soltar la planilla equivocada en la
bóveda equivocada. Una causa por vez; si hay que cambiar, recargar.

### Llevar una causa a otra máquina

Copiá la carpeta del proyecto. En Firefox, bajá el `.zip`: al descomprimirlo
aparece exactamente esa carpeta, y Chrome la abre como proyecto.

---

## 9. Antes de que un archivo salga: la lista

1. **¿El estado del guardado dice "guardada"?** Si dice otra cosa, la descarga
   está trabada y hay una razón.
2. **¿Leíste los avisos de la pestaña Salida?** Cada columna que sale en claro y
   parece sensible está listada ahí, con nombre de archivo y hoja.
3. **¿Ninguna columna quedó marcada para *Seudonimizar* sin tipo?** Esas salen en
   claro aunque la acción diga lo contrario. Aparecen en rojo en *Columnas* y en
   los avisos de *Salida*.
4. **¿Miraste la vista previa de cada hoja que vas a mandar?** No sólo de la
   primera.
5. **¿Las columnas de texto libre están tratadas?** Es el punto ciego más grande.
   MIST reconoce adentro de un comentario **sólo las formas que ya vio en alguna
   columna clasificada**. Un testigo, un domicilio o un apodo que aparece
   únicamente dentro de una observación **sale en claro**. Si el texto libre
   importa para el análisis, leé una muestra antes de mandarlo; si no importa,
   *Vaciar* es la opción segura.
6. **¿Lo que vas a mandar son los `*.desensibilizado.*` y nada más?** Ni el mapa
   inverso, ni la carpeta del proyecto, ni el original.

---

## 10. Errores frecuentes

**"Exporté y después me di cuenta de que faltaba una columna."** Corregí la
columna y volvé a exportar: los tokens de lo que ya estaba no cambian, así que
la versión nueva es compatible con lo que ya mandaste. Lo que salió mal, avisalo
por donde haya salido.

**"Solté la planilla tokenizada en el panel de archivos."** MIST no la carga:
reconoce los tokens y te ofrece reconstruirla. Si la cargaste igual a propósito,
cada token quedó registrado como una entidad nueva en la bóveda; quitá el
archivo del panel y seguí — los tokens espurios no rompen nada, pero ensucian el
inventario.

**"El modelo me devolvió tokens que no existen."** Los inventó. En *Reconstruir*
aparecen como "tokens de otra bóveda" y quedan intactos. Es una señal de que la
respuesta tiene una parte fabricada: revisala.

**"Reconstruí y una columna vino vacía."** Se había marcado *Vaciar*. Vaciar no
deja rastro en ninguna parte: es lo que se espera de vaciar.

**"El nombre reconstruido no es exactamente el que decía esa fila."** El token es
del grupo, no de la aparición. Si una persona se escribió de tres maneras, las
tres celdas vuelven con la forma **más frecuente**, que además es la bien
escrita. Guardar cuál decía cada celda sería tanto como guardar la planilla.

**"Perdí la carpeta del proyecto."** No hay camino de vuelta: los tokens que ya
salieron no se pueden resolver. Es la razón por la que MIST no deja exportar sin
una copia al día en el disco.

**"Los acentos salen rotos."** Los CSV se leen como UTF-8. Un archivo en Latin-1
hay que convertirlo antes. La salida se escribe con BOM para que Excel abra los
acentos bien.

---

## 11. Límites que conviene tener presentes

- **Texto libre: sólo formas ya vistas.** Ya está dicho arriba, y es el límite que
  más importa en una causa.
- **Una parte vacía hace otra entidad.** Si una fila tiene `nombre` pero le falta
  `apellido`, el dato compuesto es "Joaquín" y no coincide con "Joaquín Pérez".
  Es correcto —no hay con qué saber que son la misma persona— y se resuelve
  fusionando desde *Entidades*.
- **La búsqueda de duplicados puede saltear pares** con volúmenes muy grandes.
  Cuando pasa, lo avisa.
- **Guardar dentro del navegador no es un respaldo.** Borrar los datos del sitio,
  o trabajar en una ventana privada, se lleva el proyecto. Por eso la compuerta
  exige la copia en el disco.
- **La seudonimización es reversible por diseño.** Quien tiene la bóveda vuelve a
  los nombres. Todo el modelo de protección depende de dónde vive esa carpeta y
  de quién puede llegar a ella.

---

## 12. Referencia rápida

| Quiero… | Dónde |
|---|---|
| Empezar una causa nueva | portada → *Crear un proyecto* → carpeta vacía |
| Seguir una causa | portada → *Abrir un proyecto* |
| Cargar planillas | panel izquierdo, arrastrar o clic |
| Decidir qué se sustituye | pestaña **Columnas** |
| Un tipo de dato que no está | **Columnas** → *Tipos*, o *+ Tipo nuevo…* en el selector |
| Unir nombre y apellido | **Columnas** → columna *Parte de* |
| Ver quién es quién | pestaña **Entidades** |
| Unir dos formas del mismo nombre | **Entidades** → seleccionar → *Es la misma entidad* |
| Cazar erratas | pestaña **Fusiones** → *Buscar duplicados* |
| Controlar antes de mandar | pestaña **Vista previa** |
| Descargar para el modelo | pestaña **Salida** → planilla o *Descargar todas* |
| Traer de vuelta un resultado | pestaña **Reconstruir** → soltar el archivo |
| Saber si una planilla ya la hice | **Salida** → tabla de historial |
| Ver en qué causa estoy | barra de arriba: nombre del proyecto y huella |

---

Para el detalle técnico —cómo se derivan los tokens, qué normaliza cada tipo,
qué hay adentro de la bóveda, rendimiento y pruebas— está el
[README](README.md).
