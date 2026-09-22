# Analizar la causa

El fiscal no escribe consultas. Pregunta en castellano; el SQL lo escribimos y
lo corremos nosotros. Eso significa que hay que **conocer la causa**, no sólo
saber SQL: de ahí `esquema.md`.

## La base

Una por causa, en `~/Casos/<causa>/<causa>.duckdb`. Una tabla por planilla —y
por hoja, en los xlsx. Se arma y se actualiza con:

```bash
bash <ruta-de-la-skill>/guiones/ingestar.sh ~/Casos/<causa>
```

Es idempotente: se vuelve a correr cada vez que aparece una planilla nueva. Todo
entra como texto a propósito: los tokens son texto, un CBU no es un número, y un
DNI con cero adelante deja de serlo si DuckDB lo lee como entero. Convertir a
número en la consulta, donde se ve:

```sql
SELECT cliente, sum(CAST(monto AS DOUBLE)) AS total
FROM ventas GROUP BY 1 ORDER BY total DESC;
```

Consultar así:

```bash
duckdb ~/Casos/<causa>/<causa>.duckdb -c "SELECT ..."
```

## `esquema.md`: lo que hace que esto sirva

Después de cada ingesta, actualizarlo. Es la diferencia entre "Claude sabe SQL" y
"Claude conoce esta causa": sin esto, cada sesión empieza redescubriendo qué
columna es cuál.

Por cada tabla: qué es, de qué planilla salió, cuántas filas, y qué es cada
columna — con el tipo de token cuando corresponde (`persona-*`, `cuit-*`). Y en
la segunda sección, las columnas que salen en claro **a propósito**, con el
motivo, para no volver a preguntar en cada sesión.

## Qué se puede pedir

Todo lo que dependa de la estructura, que está intacta: cruces entre planillas,
frecuencias, quién aparece en más de un archivo, líneas de tiempo, flujos de
fondos, patrones, montos que se repiten, secuencias de fechas.

Lo que no: nada que dependa del contenido del dato en sí. Ver `reglas.md` §9.

## Cómo se informa el resultado

**Los tokens se escriben textuales, siempre.** Un token recortado, con otra
mayúscula, abreviado o inventado no vuelve a ser un nombre: la reconstrucción se
rompe en silencio. Decir `persona-k3f9x2q1`, no "el cliente principal", no
"persona k3f9". (MANUAL §7.)

Cuando el resultado tenga más de unas pocas filas, **dejarlo en un archivo** en
`~/Casos/<causa>/`, no sólo en la conversación:

```bash
duckdb ~/Casos/<causa>/<causa>.duckdb \
  -c "COPY (SELECT ...) TO '~/Casos/<causa>/resultado-flujo.csv' (HEADER, DELIMITER ',')"
```

Reconstruir un archivo es un gesto; copiar y pegar de una conversación es donde
se pierden los tokens. Nombrar el archivo con el número de causa: un archivo con
tokens sin número de causa es un archivo del que nadie va a saber contra qué
bóveda reconstruirlo.

## `registro.md`

Al cerrar la sesión, agregar una entrada al final:

```markdown
## 2026-08-31 — cruce de proveedores contra el padrón

Archivos: ventas.desensibilizado.csv (sha256 3f2a…), padron.desensibilizado.csv (sha256 9b71…)
Consultas: proveedores que facturan a más de una dependencia; concentración por mes.
Salida: ~/Casos/2026-114-defraudacion/resultado-proveedores.csv
Observaciones: la columna «localidad» sale en claro por decisión del fiscal (ver esquema.md).
```

Las huellas se sacan con `shasum -a 256 <archivo>`. Sirve para poder contestar
después qué datos se compartieron y en qué estado estaban — que es una pregunta
previsible si el análisis termina influyendo en una imputación.
