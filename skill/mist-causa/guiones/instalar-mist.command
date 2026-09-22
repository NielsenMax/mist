#!/bin/sh
# Instalación única del entorno de trabajo. Se abre con doble clic.
# No pide contraseña de administrador y no instala nada fuera del usuario.

set -u
cd "$HOME" || exit 1

CASOS="$HOME/Casos"
RESERVADO="$HOME/Reservado"
MIST_URL="https://mist.fernet.cc/"

echo
echo "  Instalación del entorno de trabajo con MIST"
echo "  ==========================================="
echo
echo "  Esto crea dos carpetas en tu usuario y no toca nada más:"
echo
echo "    ~/Casos       planillas con tokens.   Claude puede leerlas."
echo "    ~/Reservado   nombres reales.          Claude nunca."
echo
printf "  ¿Sigo? [s/N] "
read -r r
case "$r" in [sS]*) ;; *) echo "  Cancelado."; exit 0;; esac
echo

# --- Carpetas ---------------------------------------------------------------
mkdir -p "$CASOS" "$RESERVADO" || exit 1
echo "  ✓ $CASOS"
echo "  ✓ $RESERVADO"

cat > "$RESERVADO/CANARIO.txt" <<'CANARIO'
Este archivo existe para comprobar una sola cosa.

Claude NO tiene que poder leerlo. Si en una sesión Claude te dice que leyó este
archivo, entonces la carpeta ~/Reservado quedó habilitada como carpeta de
confianza y la desensibilización no te está protegiendo: Claude puede llegar a
las planillas originales y a la bóveda de MIST, que contiene la clave maestra.

Si eso pasa: cerrá la sesión y sacá ~/Reservado (o tu carpeta personal) de las
carpetas de confianza de Claude Desktop antes de seguir trabajando.

No borres este archivo.
CANARIO
echo "  ✓ canario"

cat > "$RESERVADO/LEEME.txt" <<'LEEME'
Acá viven los nombres reales. Esta carpeta no se le adjunta nunca a Claude.

  <causa>/crudo/     las planillas como te llegaron
  <causa>/boveda/    el proyecto de MIST: clave maestra y mapa inverso
  <causa>/final/     los informes ya reconstruidos, con nombres

Cuando MIST te pida elegir la carpeta del proyecto, elegí:
  ~/Reservado/<causa>/boveda

Si alguna vez elegís una carpeta de ~/Casos por error, la bóveda queda del lado
que Claude puede leer y hay que rehacer la causa con una clave nueva.
LEEME
echo "  ✓ leeme"

# --- DuckDB -----------------------------------------------------------------
echo
if command -v duckdb >/dev/null 2>&1 || [ -x "$HOME/.local/bin/duckdb" ]; then
  echo "  ✓ duckdb ya estaba instalado"
else
  echo "  Instalando duckdb (se baja de https://install.duckdb.org)..."
  if command -v brew >/dev/null 2>&1; then
    brew install duckdb >/dev/null 2>&1 || curl -fsSL https://install.duckdb.org | sh
  else
    curl -fsSL https://install.duckdb.org | sh
  fi
fi

DUCKDB=$(command -v duckdb || echo "$HOME/.local/bin/duckdb")
if [ -x "$DUCKDB" ]; then
  echo "  ✓ duckdb $("$DUCKDB" --version 2>/dev/null | head -1)"
  # Se instala ahora, con internet a mano, para que después funcione sin red.
  "$DUCKDB" -c "INSTALL excel;" >/dev/null 2>&1 \
    && echo "  ✓ soporte de xlsx" \
    || echo "  ! no se pudo instalar el soporte de xlsx (los csv funcionan igual)"
else
  echo "  ! no se pudo instalar duckdb. Avisale a quien te dio esta herramienta."
fi

# --- MIST -------------------------------------------------------------------
echo
if [ -f "$RESERVADO/mist.html" ]; then
  echo "  ✓ mist.html ya estaba"
else
  echo "  Bajando MIST..."
  if curl -fsSL "$MIST_URL" -o "$RESERVADO/mist.html.parcial" \
     && [ -s "$RESERVADO/mist.html.parcial" ] \
     && grep -q "MIST" "$RESERVADO/mist.html.parcial"; then
    mv "$RESERVADO/mist.html.parcial" "$RESERVADO/mist.html"
    echo "  ✓ mist.html"
  else
    rm -f "$RESERVADO/mist.html.parcial"
    echo "  ! no se pudo bajar MIST. Copiá mist.html a mano en ~/Reservado/"
  fi
fi

if [ -f "$RESERVADO/mist.html" ]; then
  h=$(shasum -a 256 "$RESERVADO/mist.html" | cut -c1-16)
  echo "  huella de mist.html: $h"
  printf '%s  %s\n' "$(date +%F)" "$(shasum -a 256 "$RESERVADO/mist.html" | cut -d' ' -f1)" \
    >> "$RESERVADO/mist-versiones.txt"
fi

# --- Regla de denegación ----------------------------------------------------
# Adjuntar una carpeta no impide que las herramientas de archivo lleguen al
# resto del disco: el "adjuntar" es el directorio de trabajo, no un límite. Lo
# único que corta el acceso es una regla de denegación.
#
# Sólo Read, y a propósito. Comprobado corriendo Claude Code de verdad:
#
#   Read(//ruta/**)   deniega            <- la forma que funciona
#   Read(/ruta/**)    NO deniega nada    <- una barra: falla en silencio
#   Read(~/ruta/**)   deniega
#   Write, Glob, Grep con rutas son inertes: Read ya cubre todo lo que lee y
#   Edit todo lo que escribe.
#
# Denegar Edit además sería tentador, pero rompe la creación de causas: Claude
# Code deniega un `mkdir -p` entero si alguna de las rutas que nombra cae bajo
# la regla. Y lo que hay que impedir acá es que los nombres salgan, no que
# entren: leer es el riesgo, escribir no.
echo
python3 - "$HOME" <<'PY'
import json, os, shutil, sys

hogar = sys.argv[1]
ruta = os.path.join(hogar, ".claude", "settings.json")
# La forma canónica es // seguido de la ruta absoluta sin su barra inicial.
regla = "Read(//%s/Reservado/**)" % hogar.strip("/")

# Formas que no hacen nada y sólo ensucian el arranque con advertencias.
inertes = {"%s(//%s/Reservado/**)" % (t, hogar.strip("/"))
           for t in ("Write", "Glob", "Grep")}

os.makedirs(os.path.dirname(ruta), exist_ok=True)
datos = {}
if os.path.exists(ruta):
    try:
        with open(ruta) as f:
            datos = json.load(f)
    except Exception as e:
        print("  ! %s no se pudo leer (%s). No lo toco." % (ruta, e))
        sys.exit(0)
    shutil.copy2(ruta, ruta + ".antes-de-mist")

permisos = datos.setdefault("permissions", {})
deny = permisos.setdefault("deny", [])
if not isinstance(deny, list):
    print("  ! permissions.deny no es una lista. No lo toco.")
    sys.exit(0)

quitadas = [d for d in deny if d in inertes]
deny = [d for d in deny if d not in inertes]
if regla not in deny:
    deny.append(regla)
    puesta = True
else:
    puesta = False
permisos["deny"] = deny

with open(ruta, "w") as f:
    json.dump(datos, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("  %s regla de denegación sobre ~/Reservado" % ("✓" if puesta else "✓ ya estaba la"))
if quitadas:
    print("  ✓ quitadas %d regla/s inertes (Write/Glob/Grep con ruta no hacen nada)"
          % len(quitadas))
PY

# --- Cierre -----------------------------------------------------------------
cat <<CIERRE

  Listo.

  Falta una cosa que sólo podés hacer vos, en Claude Desktop:

    adjuntá ~/Casos  — y NUNCA ~/Reservado ni tu carpeta personal.

  Esa es la única barrera que hay. Si adjuntás la carpeta personal, todo lo
  anterior deja de servir.

  Para abrir MIST: doble clic en ~/Reservado/mist.html, con Chrome o Edge.
  Con Safari funciona, pero pierde el autoguardado del proyecto.

CIERRE
printf "  (Enter para cerrar) "
read -r _
