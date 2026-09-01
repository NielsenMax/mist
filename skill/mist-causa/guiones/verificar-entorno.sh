#!/bin/sh
# Verifica que el entorno de trabajo de la causa esté sano antes de tocar datos.
#
# Imprime líneas con prefijo BLOQUEO:, AVISO: u OK:. Sale con 1 si hubo algún
# BLOQUEO. No lee ningún archivo de datos: sólo mira estructura y configuración.
#
# Ojo con lo que este guión NO puede probar: verifica que la regla esté escrita,
# no que Claude la esté aplicando. Un guión corre en un shell, y el shell no
# pasa por las reglas de permisos. Eso lo prueba el canario -- ver SKILL.md.

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

# --- 2. La regla de denegación ----------------------------------------------
# Este es el chequeo que importa. Adjuntar una carpeta no impide que las
# herramientas de archivo lleguen al resto del disco; lo único que las corta es
# una regla en settings.json. Y la forma exacta importa: con una sola barra la
# regla no deniega nada y no avisa de nada.
python3 - "$HOME" <<'PY'
import json, os, re, sys

hogar = sys.argv[1].rstrip("/")
ruta = os.path.join(hogar, ".claude", "settings.json")
objetivo = os.path.join(hogar, "Reservado")
canonica = "Read(//%s/Reservado/**)" % hogar.strip("/")

def destino(regla):
    """Devuelve (herramienta, ruta absoluta) si la regla apunta a una ruta que
    Claude Code realmente aplica, o None si la forma no deniega nada.

    Comprobado corriendo Claude Code: // y /// deniegan, ~ deniega, y una sola
    barra no deniega nada -- falla en silencio, que es el peor caso posible."""
    m = re.match(r"^(\w+)\((.*)\)$", regla.strip())
    if not m:
        return None
    herramienta, patron = m.group(1), m.group(2)
    if patron.startswith("//"):
        absoluta = "/" + patron.lstrip("/")
    elif patron.startswith("~/"):
        absoluta = os.path.join(hogar, patron[2:])
    else:
        return None          # una barra sola, o relativa: no deniega
    return herramienta, absoluta

def cubre(absoluta):
    base = absoluta.split("*", 1)[0].rstrip("/")
    return base == objetivo or objetivo.startswith(base + "/")

# Sólo Read y Edit aceptan rutas; Write, Glob y Grep con ruta son inertes y
# Claude Code lo avisa al arrancar.
CON_RUTA = ("Read", "Edit")

if not os.path.exists(ruta):
    print("BLOQUEO: no existe %s, así que no hay ninguna regla que impida leer "
          "~/Reservado. Correr el instalador." % ruta)
    sys.exit(1)

try:
    with open(ruta) as f:
        datos = json.load(f)
except Exception as e:
    print("BLOQUEO: %s no se pudo leer (%s). Sin poder verificar la regla no se "
          "sigue." % (ruta, e))
    sys.exit(1)

deny = datos.get("permissions", {}).get("deny") or []
if not isinstance(deny, list):
    deny = []

protegido = False
rotas, inertes = [], []
for regla in deny:
    if "Reservado" not in regla:
        continue
    d = destino(regla)
    if d is None:
        rotas.append(regla)
        continue
    herramienta, absoluta = d
    if herramienta not in CON_RUTA:
        inertes.append(regla)
    elif herramienta == "Read" and cubre(absoluta):
        protegido = True

for r in rotas:
    print("BLOQUEO: la regla «%s» no deniega nada: con una sola barra Claude Code "
          "la ignora sin avisar. Tiene que ser %s" % (r, canonica))
for r in inertes:
    print("AVISO: la regla «%s» es inerte -- sólo Read y Edit aceptan rutas. "
          "No hace daño, pero ensucia el arranque." % r)

if protegido:
    print("OK: la regla que impide leer ~/Reservado está puesta.")
    sys.exit(1 if rotas else 0)

if not rotas:
    print("BLOQUEO: no hay ninguna regla que impida leer ~/Reservado. "
          "Correr el instalador, que la agrega.")
sys.exit(1)
PY
[ $? -ne 0 ] && hubo_bloqueo=1

# --- 2b. Carpetas de confianza de Claude Desktop ----------------------------
# Señal secundaria y nada más. La clave no está documentada y se la vio con
# carpetas que no tenían relación con lo adjuntado en la sesión, así que sirve
# para mirar, no para decidir. Quien decide es el chequeo de arriba y el canario.
if [ -f "$CONFIG" ]; then
  python3 - "$CONFIG" "$RESERVADO" <<'PY'
import json, os, sys

config, reservado = sys.argv[1], sys.argv[2]
home = os.path.expanduser("~")

def rutas(v, salida):
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
except Exception:
    sys.exit(0)

crudas = []
rutas(datos.get("preferences", {}).get("localAgentModeTrustedFolders"), crudas)

def norm(p):
    return os.path.realpath(os.path.expanduser(p)).rstrip("/") or "/"

reservado_n, home_n = norm(reservado), norm(home)
for cruda in crudas:
    t = norm(cruda)
    if t == "/" or t == home_n or reservado_n.startswith(t + "/") or t == reservado_n:
        print("AVISO: la carpeta de confianza «%s» abarca el árbol reservado. "
              "Con la regla de denegación puesta igual no se puede leer, pero "
              "conviene sacarla." % cruda)
PY
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
