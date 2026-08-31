# Skill `mist-causa`

Metodología de trabajo para analizar las planillas de una causa con Claude
Desktop sobre datos ya desensibilizados por MIST.

MIST resuelve el "cómo": reemplaza los datos sensibles por tokens estables. Esta
skill resuelve el "cuándo y con qué cuidado": qué se manda, qué nunca sale del
disco, cómo se verifica que la desensibilización efectivamente ocurrió, y cómo
se analizan las planillas sin escribir una sola consulta a mano.

## La idea en una línea

```
~/Casos/<causa>/          tiene TOKENS      Claude sí
~/Reservado/<causa>/      tiene NOMBRES     Claude nunca
```

Dos árboles separados, no dos subcarpetas del mismo. Si la causa viviera en una
sola carpeta, tarde o temprano se adjuntaría la carpeta padre — es un clic
menos— y Claude tendría a la vez las planillas con tokens y la bóveda que las
traduce. Separar los árboles hace que adjuntar de más deje de ser un descuido y
pase a ser una decisión.

## Qué hay acá

```
mist-causa/
  SKILL.md                  el protocolo: qué se verifica antes de leer nada
  referencias/
    reglas.md               lo que no depende de la situación
    instalacion.md          la primera vez en una máquina
    preparar.md             el paso por MIST, que hace el fiscal
    analisis.md             DuckDB: ingesta, esquema y consultas
    reconstruir.md          el camino de vuelta a los nombres
  guiones/
    instalar-mist.command   instalación única, con doble clic
    verificar-entorno.sh    carpetas de confianza, herramientas, estructura
    olfatear.sh             ¿MIST realmente corrió sobre esto?
    nueva-causa.sh          alta de una causa en los dos árboles
    ingestar.sh             arma la base DuckDB desde limpio/
```

## Instalar

```sh
./skill/empaquetar.sh
```

y subir `skill/mist-causa.zip` en Claude Desktop, en **Customize → Skills →
Upload**. En Desktop estándar las skills no se cargan desde una carpeta local:
hay que subir el zip.

## Actualizar

No hay canal de actualización: cada versión nueva es un zip que hay que volver a
subir a mano. Por eso la skill **anuncia su versión al activarse** — si dos
personas reportan comportamientos distintos, lo primero es comparar versiones.
La versión vive en `SKILL.md` y `empaquetar.sh` la lee de ahí.

## Qué no resuelve

Vale la pena tenerlo escrito, porque prometer lo contrario sería peor que no
tener la skill:

- **Copiar y pegar gana siempre.** La detección de datos personales en lo que
  llega por el chat es probabilística. Un fiscal decidido a pegar el expediente
  lo pega.
- **No hay jaula.** En Claude Desktop estándar el límite es qué carpeta se
  adjunta, y eso se decide de nuevo en cada sesión. El canario detecta que se
  rompió; no lo impide.
- **Los nombres que sólo viven en texto libre siguen saliendo en claro.** Es el
  hueco que MIST declara en `MANUAL.md` §11: reconoce dentro de un comentario
  sólo las formas que ya vio en una columna clasificada. Taparlo requiere
  reconocimiento de entidades, que no está.
- **PDFs y documentos quedan afuera.** MIST trabaja sobre planillas. La regla
  para documentos está escrita en `referencias/reglas.md` §4 y hay que darla
  antes de que el fiscal improvise.

## Relación con el MANUAL

`MANUAL.md` es la fuente de verdad de lo que hace MIST. La skill lo ejecuta: la
lista de §9 deja de ser algo que el fiscal tiene que recordar y pasa a ser algo
que se verifica. Cuando los dos digan cosas distintas, gana el MANUAL.
