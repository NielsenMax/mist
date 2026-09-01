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
  probar.sh                 las comprobaciones, en un HOME de mentira
```

## Probar

```sh
./skill/probar.sh
```

Corre los guiones contra un `HOME` de mentira en un temporal que se borra al
salir: no toca tu directorio personal y no necesita internet. Cubre el
instalador, el alta de causa, los siete escenarios de carpetas de confianza, el
olfateo sobre planillas crudas y tokenizadas, y la ingesta.

Lo que no cubre, porque sólo se puede ver adentro de Claude Desktop: el canario.

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
- **No hay jaula.** Adjuntar una carpeta no limita a dónde llegan las
  herramientas de archivo: eso lo hace una regla de denegación en
  `~/.claude/settings.json`, que el instalador escribe. La regla corta las
  herramientas de archivo y los comandos de lectura que Claude Code reconoce en
  Bash, pero **no un subproceso que abra archivos por su cuenta** — un guión de
  Python la esquiva. Protege contra el descuido, no contra alguien decidido.
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
