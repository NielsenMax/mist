#!/bin/sh
# Arma mist.html: un único archivo autocontenido que funciona con doble clic,
# sin servidor y sin internet. Toma src/index.html y le mete adentro el CSS y
# todos los <script src> (vendor incluido).
#
# POSIX a propósito: los contenedores de build mínimos traen dash y no bash, y
# un shebang que apunta a un intérprete que no está da "not found" sobre el
# script, que es de los errores más difíciles de leer. Lo único que se pierde
# es pipefail, que acá no hace nada porque no hay ninguna tubería.
set -eu

raiz="$(cd "$(dirname "$0")" && pwd)"
salida="$raiz/mist.html"

python3 - "$raiz" "$salida" <<'PY'
import re, sys, os, pathlib

raiz, salida = sys.argv[1], sys.argv[2]
src = pathlib.Path(raiz) / 'src'
html = (src / 'index.html').read_text(encoding='utf-8')

def leer(ref):
    ruta = (src / ref).resolve()
    if not ruta.exists():
        sys.exit('falta ' + str(ruta))
    return ruta.read_text(encoding='utf-8')

def sin_cierre(js):
    # Un "</script" dentro del código cerraría la etiqueta antes de tiempo.
    return js.replace('</script', '<\\/script')

def css(m):
    return '<style>\n' + leer(m.group(1)) + '</style>'

def script(m):
    return '<script>\n' + sin_cierre(leer(m.group(1))) + '</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', script, html)

sobran = re.findall(r'(?:src|href)="(?!data:)[^"]+\.(?:js|css)"', html)
if sobran:
    sys.exit('quedaron referencias externas: ' + ', '.join(sobran))

pathlib.Path(salida).write_text(html, encoding='utf-8')
print('%s  %.1f MB' % (salida, os.path.getsize(salida) / 1048576))
PY

# El sitio para Cloudflare Pages, que sirve un directorio y busca index.html
# adentro. Es el mismo archivo con otro nombre: no hay una versión "web" y otra
# de escritorio. Al lado queda _headers, que está versionado y no se toca acá.
mkdir -p "$raiz/build"
cp "$salida" "$raiz/build/index.html"
echo "$raiz/build/index.html"

# La skill viaja con el sitio: sin un lugar de dónde bajarla, el zip sólo llega
# a quien alguien se lo pase a mano. Se arma acá y no se versiona, porque un
# binario cambia entero en cada commit y no comprime por delta.
if ! command -v zip >/dev/null 2>&1; then
  echo "falta el comando zip: no se puede armar la skill" >&2
  exit 1
fi
sh "$raiz/skill/empaquetar.sh" >/dev/null
cp "$raiz/skill/mist-causa.zip" "$raiz/build/mist-causa.zip"

# La página de instalación se copia tal cual —es autocontenida— y se le rellenan
# la versión y el peso, para que no haya un número escrito a mano que envejezca
# sin que nadie se entere.
python3 - "$raiz" <<'PY'
import pathlib, re, sys

raiz = pathlib.Path(sys.argv[1])
skill = (raiz / 'skill/mist-causa/SKILL.md').read_text(encoding='utf-8')
version = re.search(r'Versión (\d+\.\d+\.\d+)', skill)
if not version:
    sys.exit('no encontré la versión en skill/mist-causa/SKILL.md')
version = version.group(1)
peso = (raiz / 'build/mist-causa.zip').stat().st_size

html = (raiz / 'src/fiscal.html').read_text(encoding='utf-8')
html = html.replace('{{VERSION}}', version).replace('{{PESO}}', '%d KB' % round(peso / 1024))
if '{{' in html:
    sys.exit('quedaron marcadores sin rellenar en src/fiscal.html')
(raiz / 'build/fiscal.html').write_text(html, encoding='utf-8')
print('%s  versión %s, zip %d KB' % (raiz / 'build/fiscal.html', version, round(peso / 1024)))
PY
