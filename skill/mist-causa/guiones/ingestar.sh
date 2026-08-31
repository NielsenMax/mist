#!/bin/sh
# Arma o actualiza la base DuckDB de una causa a partir de limpio/.
#
#   ingestar.sh ~/Casos/2026-114-defraudacion
#
# Una tabla por planilla (y por hoja, en los xlsx). Es idempotente: se puede
# volver a correr cuando aparece una planilla nueva. No toca esquema.md ni
# registro.md; eso lo escribe Claude, que es quien sabe qué significan las cosas.

[ -z "$1" ] && { echo "uso: ingestar.sh <carpeta-de-la-causa>"; exit 2; }

DUCKDB=$(command -v duckdb || echo "$HOME/.local/bin/duckdb")
[ -x "$DUCKDB" ] || { echo "BLOQUEO: no hay duckdb."; exit 1; }

CAUSA=$(cd "$1" 2>/dev/null && pwd) || { echo "BLOQUEO: no existe $1"; exit 1; }
LIMPIO="$CAUSA/limpio"
BASE="$CAUSA/$(basename "$CAUSA").duckdb"
[ -d "$LIMPIO" ] || { echo "BLOQUEO: no existe $LIMPIO"; exit 1; }

SQL=$(python3 - "$LIMPIO" <<'PY'
import os, re, sys, zipfile
import xml.etree.ElementTree as ET

limpio = sys.argv[1]
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def nombre_tabla(*partes):
    base = "_".join(p for p in partes if p)
    base = base.replace(".desensibilizado", "")
    base = re.sub(r"\.[A-Za-z0-9]+$", "", base)
    base = re.sub(r"[^0-9A-Za-zñÑáéíóúÁÉÍÓÚ]+", "_", base).strip("_").lower()
    return ("t_" + base) if not base or base[0].isdigit() else base


def hojas_de(ruta):
    try:
        with zipfile.ZipFile(ruta) as z:
            raiz = ET.fromstring(z.read("xl/workbook.xml"))
            return [h.get("name") for h in raiz.iter(f"{NS}sheet")]
    except Exception:
        return []


def lit(s):
    return "'" + s.replace("'", "''") + "'"


sentencias, avisos = [], []
for raiz_dir, _, nombres in os.walk(limpio):
    for n in sorted(nombres):
        if n.startswith((".", "~$")):
            continue
        ruta = os.path.join(raiz_dir, n)
        rel = os.path.relpath(ruta, limpio)
        ext = os.path.splitext(n)[1].lower()

        if ext in (".csv", ".tsv", ".txt"):
            t = nombre_tabla(rel)
            # all_varchar: los tokens son texto y un CBU no es un número.
            sentencias.append(
                f'CREATE OR REPLACE TABLE "{t}" AS '
                f'SELECT * FROM read_csv({lit(ruta)}, all_varchar=true, '
                f'header=true, sample_size=-1, ignore_errors=false);')
        elif ext in (".xlsx", ".xlsm"):
            hojas = hojas_de(ruta)
            if not hojas:
                avisos.append(f"AVISO: no se pudieron listar las hojas de {rel}.")
                continue
            for hoja in hojas:
                t = nombre_tabla(rel, hoja if len(hojas) > 1 else "")
                sentencias.append(
                    f'CREATE OR REPLACE TABLE "{t}" AS '
                    f'SELECT * FROM read_xlsx({lit(ruta)}, sheet={lit(hoja)}, '
                    f'header=true, all_varchar=true);')
        elif ext in (".xlsb", ".xls", ".ods"):
            avisos.append(f"AVISO: {rel} está en un formato que DuckDB no lee. "
                          f"Volver a exportarlo desde MIST como xlsx o csv.")

for a in avisos:
    print("--@@ " + a)
if sentencias:
    print("INSTALL excel; LOAD excel;")
    print("\n".join(sentencias))
PY
)

echo "$SQL" | grep '^--@@ ' | sed 's/^--@@ //'
CUERPO=$(echo "$SQL" | grep -v '^--@@ ')

if [ -z "$(echo "$CUERPO" | tr -d '[:space:]')" ]; then
  echo "AVISO: no hay planillas para ingerir en $LIMPIO."
  exit 0
fi

if ! echo "$CUERPO" | "$DUCKDB" "$BASE" 2>&1; then
  echo "BLOQUEO: falló la ingesta."
  exit 1
fi

echo "OK: base $(basename "$BASE") actualizada."
"$DUCKDB" "$BASE" -c "SELECT table_name AS tabla, estimated_size AS filas_aprox
                      FROM duckdb_tables() ORDER BY tabla;"
