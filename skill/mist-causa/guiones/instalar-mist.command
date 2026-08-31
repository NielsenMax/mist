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
