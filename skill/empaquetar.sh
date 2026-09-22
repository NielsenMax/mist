#!/bin/sh
# Arma el .zip que se sube a Claude Desktop (Customize -> Skills -> Upload).
#
#   ./skill/empaquetar.sh
#
# El zip queda en skill/mist-causa.zip, con SKILL.md en la raíz de la carpeta,
# que es como lo espera Claude Desktop.

set -e
cd "$(dirname "$0")"

[ -f mist-causa/SKILL.md ] || { echo "no encuentro mist-causa/SKILL.md"; exit 1; }

VERSION=$(grep -m1 -o 'Versión [0-9]\+\.[0-9]\+\.[0-9]\+' mist-causa/SKILL.md | cut -d' ' -f2)
[ -n "$VERSION" ] || { echo "no pude leer la versión de SKILL.md"; exit 1; }

for g in mist-causa/guiones/*.sh mist-causa/guiones/*.command; do
  sh -n "$g" || { echo "error de sintaxis en $g"; exit 1; }
done

rm -f mist-causa.zip
zip -q -r mist-causa.zip mist-causa \
  -x '*.DS_Store' -x '__MACOSX/*' -x '*/.*'

echo "OK: skill/mist-causa.zip · versión $VERSION · $(du -h mist-causa.zip | cut -f1)"
unzip -l mist-causa.zip | tail -n +4 | head -20
