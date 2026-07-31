#!/usr/bin/env bash
# Arma mist.html: un único archivo autocontenido que funciona con doble clic,
# sin servidor y sin internet. Toma src/index.html y le mete adentro el CSS y
# todos los <script src> (vendor incluido).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
