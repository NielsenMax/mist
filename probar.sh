#!/usr/bin/env bash
# Corre las siete suites. Las dos de navegador necesitan Chrome instalado; las
# otras cinco sólo node.
set -uo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$raiz"
fallas=0

correr() {
  echo ""
  echo "── $1 ──────────────────────────────────────────"
  if node "pruebas/$2"; then :; else fallas=$((fallas + 1)); fi
}

correr "núcleo (hash, normalización, similitud)" nucleo.js
correr "integración (planillas de ejemplo, bóveda)" integracion.js
correr "almacén (carpeta, autoguardado, cifrado)" almacen.js
correr "zip (escribir, leer, abrir con unzip)" zip.js
correr "carga (50.000 filas)" carga.js

if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  "$raiz/build.sh" > /dev/null
  correr "interfaz (Chrome real sobre mist.html)" interfaz.js
  correr "sin carpetas (el camino de Firefox)" navegador.js
else
  echo ""
  echo "── interfaz: se saltea, no encontré Chrome ──"
fi

echo ""
[ "$fallas" -eq 0 ] && echo "Todas las suites en verde" || echo "$fallas suite(s) con fallas"
exit "$fallas"
