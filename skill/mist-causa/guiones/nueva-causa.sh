#!/bin/sh
# Da de alta una causa en los dos árboles.
#
#   nueva-causa.sh 2026-114-defraudacion
#
# El nombre lleva número de causa y una palabra, y es el mismo de los dos lados
# (MANUAL §8). Es idempotente.

[ -z "${1:-}" ] && { echo "uso: nueva-causa.sh <numero-de-causa>-<palabra>"; exit 2; }

# La validación va en python3 y no en el shell: `tr` rompe los acentos en vez de
# rechazarlos, y una causa mal nombrada de un lado y bien del otro son dos causas.
NOMBRE=$(python3 - "$1" <<'PY'
import re, sys, unicodedata

crudo = sys.argv[1].strip()
propuesto = crudo.lower().replace(" ", "-").replace("_", "-")
propuesto = re.sub(r"-+", "-", propuesto).strip("-")

if re.fullmatch(r"[a-z0-9-]+", propuesto):
    print(propuesto)
    sys.exit(0)

sin_tildes = "".join(c for c in unicodedata.normalize("NFD", propuesto)
                     if unicodedata.category(c) != "Mn")
sin_tildes = re.sub(r"[^a-z0-9-]+", "-", sin_tildes).strip("-")
print(f"BLOQUEO: «{crudo}» tiene caracteres que no van en un nombre de carpeta.",
      file=sys.stderr)
if sin_tildes:
    print(f"Probá: {sin_tildes}", file=sys.stderr)
sys.exit(1)
PY
) || exit 1

CASOS="$HOME/Casos/$NOMBRE"
RESERVADO="$HOME/Reservado/$NOMBRE"

[ -d "$HOME/Casos" ] && [ -d "$HOME/Reservado" ] || {
  echo "BLOQUEO: el entorno no está instalado. Ver referencias/instalacion.md."; exit 1; }

mkdir -p "$CASOS/limpio" "$RESERVADO/crudo" "$RESERVADO/boveda" "$RESERVADO/final" || exit 1

[ -f "$CASOS/esquema.md" ] || cat > "$CASOS/esquema.md" <<ESQUEMA
# Esquema de la causa $NOMBRE

Qué hay en la base y qué significa. Lo mantiene Claude a medida que se ingieren
planillas; sirve para no volver a descubrir los datos en cada sesión.

## Tablas

_(vacío: todavía no se ingirió ninguna planilla)_

## Decisiones de clasificación

Columnas que salen en claro a propósito, con el motivo. Lo que esté acá no se
vuelve a preguntar en cada sesión.

_(vacío)_
ESQUEMA

[ -f "$CASOS/registro.md" ] || cat > "$CASOS/registro.md" <<REGISTRO
# Registro de la causa $NOMBRE

Qué se analizó, cuándo y sobre qué archivos. Una entrada por sesión, agregada al
final. Sirve para poder contestar después qué datos se compartieron y en qué
estado estaban.

## $(date +%F) — alta de la causa

Creadas \`~/Casos/$NOMBRE\` y \`~/Reservado/$NOMBRE\`.
REGISTRO

echo "OK: causa «${NOMBRE}» dada de alta."
echo
echo "  ~/Casos/$NOMBRE/limpio        acá van los *.desensibilizado.*"
echo "  ~/Reservado/$NOMBRE/crudo     acá van las planillas originales"
echo "  ~/Reservado/$NOMBRE/boveda    esta carpeta se elige en MIST al crear el proyecto"
echo "  ~/Reservado/$NOMBRE/final     acá van los informes reconstruidos"
