#!/bin/sh
# Prueba los guiones de la skill contra un HOME de mentira.
#
#   ./skill/probar.sh
#
# Nada toca tu directorio personal: todo pasa en un temporal que se borra al
# salir. No hace falta internet: se le deja un mist.html puesto para que el
# instalador no intente bajarlo.
set -eu

raiz="$(cd "$(dirname "$0")/.." && pwd)"
guiones="$raiz/skill/mist-causa/guiones"
fallos=0

HOGAR=$(mktemp -d)
trap 'rm -rf "$HOGAR"' EXIT
export HOME="$HOGAR"

ok()    { echo "ok     $1"; }
falla() { echo "FALLA  $1"; fallos=$((fallos + 1)); }

# Compara el código de salida de un guión con el esperado.
salida() {
  esperado=$1; descripcion=$2; shift 2
  set +e; "$@" >/dev/null 2>&1; real=$?; set -e
  [ "$real" = "$esperado" ] && ok "$descripcion" || falla "$descripcion (salió $real, esperaba $esperado)"
}

existe() { [ -e "$HOME/$1" ] && ok "$2" || falla "$2"; }

# Escribe una configuración de Claude Desktop con las carpetas de confianza dadas.
confianza() {
  d="$HOME/Library/Application Support/Claude"
  mkdir -p "$d"
  printf '{"preferences":{"localAgentModeTrustedFolders":[%s]}}' "$1" \
    > "$d/claude_desktop_config.json"
}

echo "── instalador ──────────────────────────────────────────────────────"
mkdir -p "$HOME/Reservado"
cp "$raiz/mist.html" "$HOME/Reservado/mist.html"   # para no depender de la red
printf 's\n\n' | sh "$guiones/instalar-mist.command" >/dev/null 2>&1
existe Casos              "crea el árbol de casos"
existe Reservado          "crea el árbol reservado"
existe Reservado/CANARIO.txt "deja el canario"
existe Reservado/LEEME.txt   "deja el leeme"
printf 's\n\n' | sh "$guiones/instalar-mist.command" >/dev/null 2>&1
ok "se puede volver a correr sin romper nada"

echo
echo "── alta de causa ───────────────────────────────────────────────────"
salida 1 "rechaza un nombre con tilde"      sh "$guiones/nueva-causa.sh" "2026-114-Defraudación"
salida 2 "pide un nombre si no se lo dan"   sh "$guiones/nueva-causa.sh"
salida 0 "acepta espacios y mayúsculas"     sh "$guiones/nueva-causa.sh" "2026 114 Defraudacion"
existe Casos/2026-114-defraudacion/limpio         "crea limpio/ del lado de los tokens"
existe Reservado/2026-114-defraudacion/boveda     "crea boveda/ del lado reservado"
existe Reservado/2026-114-defraudacion/crudo      "crea crudo/ del lado reservado"
existe Reservado/2026-114-defraudacion/final      "crea final/ del lado reservado"
existe Casos/2026-114-defraudacion/esquema.md     "deja el esquema vacío"
existe Casos/2026-114-defraudacion/registro.md    "deja el registro abierto"
salida 0 "se puede volver a correr"         sh "$guiones/nueva-causa.sh" 2026-114-defraudacion

echo
echo "── carpetas de confianza ───────────────────────────────────────────"
CAUSA="$HOME/Casos/2026-114-defraudacion"
confianza "\"$HOME/Casos\""
salida 0 "acepta que sólo esté ~/Casos"                 sh "$guiones/verificar-entorno.sh"
confianza "\"$CAUSA\""
salida 0 "acepta una causa puntual"                     sh "$guiones/verificar-entorno.sh"
confianza "\"$HOME\""
salida 1 "bloquea si está el home entero"               sh "$guiones/verificar-entorno.sh"
confianza "\"$HOME/Reservado\""
salida 1 "bloquea si está el árbol reservado"           sh "$guiones/verificar-entorno.sh"
confianza "\"$HOME/Reservado/2026-114-defraudacion/boveda\""
salida 1 "bloquea si está la bóveda de una causa"       sh "$guiones/verificar-entorno.sh"
confianza '"/"'
salida 1 "bloquea si está la raíz del disco"            sh "$guiones/verificar-entorno.sh"
printf '{no es json' > "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
salida 0 "avisa en vez de explotar con un json roto"    sh "$guiones/verificar-entorno.sh"
confianza "\"$HOME/Casos\""

echo
echo "── olfateo ─────────────────────────────────────────────────────────"
cp "$raiz/ejemplos/clientes.csv" "$CAUSA/limpio/"
cp "$raiz/ejemplos/reclamos.xlsx" "$CAUSA/limpio/"
salida 1 "detecta planillas que nunca pasaron por MIST" sh "$guiones/olfatear.sh" "$CAUSA"
sh "$guiones/olfatear.sh" "$CAUSA" 2>&1 | grep -q "clientes.csv, columna «cuit»" \
  && ok "nombra el archivo y la columna en un csv" || falla "nombra el archivo y la columna en un csv"
sh "$guiones/olfatear.sh" "$CAUSA" 2>&1 | grep -q "reclamos.xlsx (sheet2.xml)" \
  && ok "llega a la segunda hoja de un xlsx" || falla "llega a la segunda hoja de un xlsx"
rm "$CAUSA/limpio/clientes.csv" "$CAUSA/limpio/reclamos.xlsx"

cat > "$CAUSA/limpio/ventas.desensibilizado.csv" <<'CSV'
id_venta,fecha,cliente,cuit_cliente,email,localidad,monto,observaciones
V-001,2026-03-02,persona-k3f9x2q1,cuit-8mv2r4qd,email-p7w3nq21,localidad-9djs2mfp,14350.50,Ajuste pedido por persona-k3f9x2q1
V-002,2026-03-05,persona-m2h7bv44,cuit-3kq9zt71,email-b8v1rm05,localidad-4hsk8xrt,-2200.00,Reclamo cerrado
V-003,2026-03-11,persona-t9x4cd28,cuit-6pv2ns83,email-k1z7hj40,localidad-9djs2mfp,88120.00,Sin novedades
CSV
salida 0 "no se queja de una planilla ya tokenizada"    sh "$guiones/olfatear.sh" "$CAUSA"

echo
echo "── base de la causa ────────────────────────────────────────────────"
salida 0 "ingiere lo que hay en limpio/"               sh "$guiones/ingestar.sh" "$CAUSA"
existe Casos/2026-114-defraudacion/2026-114-defraudacion.duckdb "deja la base en la carpeta de la causa"
DUCKDB=$(command -v duckdb || echo "$HOME/.local/bin/duckdb")
base="$CAUSA/2026-114-defraudacion.duckdb"
[ "$("$DUCKDB" "$base" -noheader -list -c 'SELECT count(*) FROM ventas')" = "3" ] \
  && ok "la tabla tiene las filas de la planilla" || falla "la tabla tiene las filas de la planilla"
[ "$("$DUCKDB" "$base" -noheader -list -c \
     "SELECT cliente FROM ventas ORDER BY CAST(monto AS DOUBLE) DESC LIMIT 1")" = "persona-t9x4cd28" ] \
  && ok "se puede consultar y agrupar por token" || falla "se puede consultar y agrupar por token"
salida 0 "se puede volver a ingerir"                   sh "$guiones/ingestar.sh" "$CAUSA"

echo
if [ "$fallos" = 0 ]; then
  echo "Todo en orden"
else
  echo "$fallos comprobación(es) en rojo"
  exit 1
fi
