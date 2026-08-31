#!/bin/sh
# Verifica que el entorno de trabajo de la causa esté sano antes de tocar datos.
#
# Imprime líneas con prefijo BLOQUEO:, AVISO: u OK:. Sale con 1 si hubo algún
# BLOQUEO. No lee ningún archivo de datos: sólo mira estructura y configuración.
#
# Ojo con lo que este guión NO puede probar: corre en un shell, y un shell lee
# cualquier cosa que el usuario pueda leer. El límite que importa es el de las
# herramientas de Claude, y ése se prueba con el canario -- ver SKILL.md.

CASOS="$HOME/Casos"
RESERVADO="$HOME/Reservado"
CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
hubo_bloqueo=0

bloqueo() { echo "BLOQUEO: $1"; hubo_bloqueo=1; }
aviso()   { echo "AVISO: $1"; }
ok()      { echo "OK: $1"; }

# --- 1. Los dos árboles existen ---------------------------------------------
if [ ! -d "$CASOS" ]; then
  bloqueo "no existe $CASOS. El entorno no está instalado: ver referencias/instalacion.md."
elif [ ! -d "$RESERVADO" ]; then
  bloqueo "no existe $RESERVADO. El entorno está a medio instalar y la separación no existe."
else
  ok "los dos árboles existen."
fi

# --- 2. Carpetas de confianza de Claude Desktop -----------------------------
if [ ! -f "$CONFIG" ]; then
  aviso "no se encontró la configuración de Claude Desktop en $CONFIG. No se pudo verificar la lista de carpetas de confianza; el chequeo del canario pasa a ser la única prueba de la separación y es obligatorio."
else
  python3 - "$CONFIG" "$RESERVADO" "$CASOS" <<'PY'
import json, os, sys

config, reservado, casos = sys.argv[1], sys.argv[2], sys.argv[3]
home = os.path.expanduser("~")

def rutas(v, salida):
    """La forma exacta de localAgentModeTrustedFolders no está documentada y
    cambió entre versiones. Se recogen todas las cadenas con pinta de ruta."""
    if isinstance(v, str):
        if v.startswith(("/", "~")):
            salida.append(v)
    elif isinstance(v, list):
        for x in v:
            rutas(x, salida)
    elif isinstance(v, dict):
        for x in v.values():
            rutas(x, salida)

try:
    with open(config) as f:
        datos = json.load(f)
except Exception as e:
    print(f"AVISO: no se pudo leer la configuración ({e}). El canario es la única prueba.")
    sys.exit(0)

crudas = []
rutas(datos.get("preferences", {}).get("localAgentModeTrustedFolders"), crudas)

if not crudas:
    print("AVISO: no hay carpetas de confianza declaradas, o están en un formato "
          "que este guión no reconoce. Verificar con el canario.")
    sys.exit(0)

def norm(p):
    return os.path.realpath(os.path.expanduser(p)).rstrip("/") or "/"

reservado_n, casos_n, home_n = norm(reservado), norm(casos), norm(home)
malas = []

for cruda in crudas:
    t = norm(cruda)
    if t == "/":
        malas.append((cruda, "es la raíz del disco: Claude ve absolutamente todo"))
    elif t == home_n:
        malas.append((cruda, "es el directorio personal, y contiene Reservado"))
    elif reservado_n == t or reservado_n.startswith(t + "/"):
        malas.append((cruda, "contiene el árbol Reservado"))
    elif t == reservado_n or t.startswith(reservado_n + "/"):
        malas.append((cruda, "está dentro del árbol Reservado"))

for cruda, motivo in malas:
    print(f"BLOQUEO: la carpeta de confianza «{cruda}» {motivo}. "
          f"Mientras esté ahí, la desensibilización no protege nada.")

buenas = [c for c in crudas if norm(c) == casos_n or norm(c).startswith(casos_n + "/")]
if not malas:
    if buenas:
        print(f"OK: carpetas de confianza acotadas a {casos} ({len(crudas)} declarada/s).")
    else:
        print(f"AVISO: ninguna carpeta de confianza está bajo {casos}. "
              f"Verificar que la carpeta adjunta sea la de la causa.")

sys.exit(1 if malas else 0)
PY
  [ $? -ne 0 ] && hubo_bloqueo=1
fi

# --- 3. Herramientas --------------------------------------------------------
if command -v duckdb >/dev/null 2>&1; then
  ok "duckdb $(duckdb --version 2>/dev/null | head -1)."
elif [ -x "$HOME/.local/bin/duckdb" ]; then
  aviso "duckdb está en ~/.local/bin pero no en el PATH. Usar la ruta completa."
else
  bloqueo "no hay duckdb. Sin él no se pueden correr consultas: ver referencias/instalacion.md."
fi

# --- 4. Estado de las causas ------------------------------------------------
if [ -d "$CASOS" ]; then
  n=$(find "$CASOS" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" = "0" ]; then
    aviso "no hay ninguna causa en $CASOS todavía."
  else
    ok "causas en $CASOS: $n."
    find "$CASOS" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r c; do
      nombre=$(basename "$c")
      [ -d "$RESERVADO/$nombre" ] || echo "AVISO: la causa «${nombre}» no tiene su par en $RESERVADO."
    done
  fi
fi

exit $hubo_bloqueo
