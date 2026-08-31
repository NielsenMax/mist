#!/bin/sh
# Verifica que MIST efectivamente haya corrido sobre lo que hay en limpio/.
#
#   olfatear.sh ~/Casos/2026-114-defraudacion
#
# Busca datos personales en claro y columnas con encabezado sensible cuyos
# valores no son tokens. Sale con 1 si encontró algo de severidad ALTA.
#
# No decide: informa. Una columna puede estar en claro porque el fiscal eligió
# Conservar, y eso es legítimo. Lo que no es legítimo es que nadie lo sepa.

[ -z "$1" ] && { echo "uso: olfatear.sh <carpeta-de-la-causa>"; exit 2; }

exec python3 - "$1" <<'PY'
import csv, io, os, re, sys, zipfile

causa = os.path.expanduser(sys.argv[1])
limpio = os.path.join(causa, "limpio")
if not os.path.isdir(limpio):
    print(f"BLOQUEO: no existe {limpio}. No hay nada desensibilizado para analizar.")
    sys.exit(1)

# Un token de MIST: prefijo de tipo, guión, base32 sin caracteres ambiguos.
TOKEN = re.compile(r"^[a-z0-9]{1,16}-[0-9a-hjkmnp-tv-z]{6,14}$")

# Contenido inequívoco. Los prefijos de CUIT son los que usa MIST.
CONTENIDO = [
    ("ALTO",  "CUIT/CUIL",  re.compile(r"\b(20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d\b")),
    ("ALTO",  "correo",     re.compile(r"\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b")),
    ("MEDIO", "CBU",        re.compile(r"\b\d{22}\b")),
    ("MEDIO", "teléfono",   re.compile(r"(?<!\d)(?:\+?54\s?)?(?:9\s?)?(?:11|2\d{2,3}|3\d{2,3})[\s-]?\d{6,8}(?!\d)")),
    ("MEDIO", "DNI",        re.compile(r"(?<![\d.,-])\d{7,8}(?![\d.,-])")),
]

# Encabezados que MIST considera sensibles (src/10-tipos.js, PISTAS_ENCABEZADO).
# Se comparan contra el encabezado normalizado, donde _ - . pasan a espacio, para
# que «cuit_cliente» dé dos coincidencias y «id_cliente» dé una sola.
ENCABEZADO = re.compile(
    r"\bnombre|\bapellido|\btitular|\bpersona|raz[oó]n social|\bempresa|\bproveedor|\bcliente"
    r"|\bcuit\b|\bcuil\b|\bdni\b|\bdocumento\b|\bpasaporte\b"
    r"|tel[eé]fono|\bcelular|\bwhatsapp|\bcontacto"
    r"|\bmail\b|\bcorreo\b|e-?mail"
    r"|direcci[oó]n|domicilio|\bcalle\b"
    r"|localidad|partido|municipio|barrio"
    r"|\bcbu\b|\bcvu\b|\biban\b|\bcuenta"
    r"|\bpatente\b|\bdominio\b|matr[ií]cula",
    re.I)


def normalizar(encabezado):
    return re.sub(r"[_\-.]+", " ", encabezado or "").strip()

# Fechas y montos primero, para no leer 2026-03-02 como teléfono.
FECHA = re.compile(r"^\s*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}")
MONTO = re.compile(r"^\s*-?[\d.,]+\s*$")

MUESTRA = 500
hallazgos = []


def revisar_columna(archivo, columna, valores):
    utiles = [v.strip() for v in valores if v and v.strip()]
    if not utiles:
        return
    tokens = sum(1 for v in utiles if TOKEN.match(v))
    proporcion = tokens / len(utiles)

    if ENCABEZADO.search(normalizar(columna)) and proporcion < 0.2:
        hallazgos.append(("ALTO", archivo, columna,
                          f"encabezado sensible y sólo {proporcion:.0%} de los valores son tokens"))

    for sev, que, patron in CONTENIDO:
        n = 0
        for v in utiles:
            if TOKEN.match(v) or FECHA.match(v):
                continue
            if que in ("DNI", "CBU", "teléfono") and MONTO.match(v) and columna and \
               re.search(r"monto|importe|saldo|total|precio|valor|debe|haber", columna, re.I):
                continue
            if patron.search(v):
                n += 1
        if n:
            hallazgos.append((sev, archivo, columna, f"{n} valores con pinta de {que} en claro"))
            break


def revisar_csv(ruta, nombre):
    with open(ruta, newline="", encoding="utf-8-sig", errors="replace") as f:
        muestra = f.read(65536)
        f.seek(0)
        try:
            dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t|")
        except csv.Error:
            dialecto = csv.excel
        lector = csv.reader(f, dialecto)
        try:
            encabezados = next(lector)
        except StopIteration:
            return
        columnas = [[] for _ in encabezados]
        for i, fila in enumerate(lector):
            if i >= MUESTRA:
                break
            for j, celda in enumerate(fila[:len(columnas)]):
                columnas[j].append(celda)
        for enc, vals in zip(encabezados, columnas):
            revisar_columna(nombre, enc, vals)


def _texto(nodo):
    return "".join(nodo.itertext())


def revisar_xlsx(ruta, nombre):
    """Lector mínimo de xlsx. SheetJS escribe los valores inline con t="str",
    Excel los pone en sharedStrings; se contemplan las dos formas para poder
    atribuir la columna, que es lo que hace accionable el hallazgo."""
    import xml.etree.ElementTree as ET

    def limpiar(arbol):
        for e in arbol.iter():
            if "}" in e.tag:
                e.tag = e.tag.split("}", 1)[1]
        return arbol

    try:
        z = zipfile.ZipFile(ruta)
    except Exception as e:
        print(f"AVISO: no se pudo abrir {nombre} ({e}).")
        return

    with z:
        compartidas = []
        if "xl/sharedStrings.xml" in z.namelist():
            raiz = limpiar(ET.fromstring(z.read("xl/sharedStrings.xml")))
            compartidas = [_texto(si) for si in raiz.findall("si")]

        hojas = sorted(n for n in z.namelist()
                       if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
        if not hojas:
            print(f"AVISO: {nombre} no tiene hojas legibles.")
            return

        for hoja in hojas:
            try:
                datos = limpiar(ET.fromstring(z.read(hoja))).find("sheetData")
            except Exception as e:
                print(f"AVISO: {nombre} ({hoja}) no se pudo leer ({e}).")
                continue
            if datos is None:
                continue

            encabezados, columnas = {}, {}
            for i, fila in enumerate(datos.findall("row")):
                if i > MUESTRA:
                    break
                for celda in fila.findall("c"):
                    ref = celda.get("r") or ""
                    letra = re.match(r"([A-Z]+)", ref)
                    if not letra:
                        continue
                    letra = letra.group(1)
                    tipo = celda.get("t")
                    if tipo == "s":
                        v = celda.find("v")
                        idx = int(v.text) if v is not None and v.text else -1
                        valor = compartidas[idx] if 0 <= idx < len(compartidas) else ""
                    elif tipo == "inlineStr":
                        es = celda.find("is")
                        valor = _texto(es) if es is not None else ""
                    else:
                        v = celda.find("v")
                        valor = v.text if v is not None and v.text else ""
                    if i == 0:
                        encabezados[letra] = valor
                    else:
                        columnas.setdefault(letra, []).append(valor)

            etiqueta = nombre if len(hojas) == 1 else f"{nombre} ({hoja.split('/')[-1]})"
            for letra, valores in columnas.items():
                revisar_columna(etiqueta, encabezados.get(letra, letra), valores)


archivos = 0
for raiz, _, nombres in os.walk(limpio):
    for n in sorted(nombres):
        ruta = os.path.join(raiz, n)
        rel = os.path.relpath(ruta, limpio)
        ext = os.path.splitext(n)[1].lower()
        try:
            if ext in (".csv", ".tsv", ".txt"):
                archivos += 1
                revisar_csv(ruta, rel)
            elif ext in (".xlsx", ".xlsm", ".xlsb", ".ods"):
                archivos += 1
                revisar_xlsx(ruta, rel)
        except Exception as e:
            print(f"AVISO: {rel} no se pudo revisar ({e}).")

if archivos == 0:
    print(f"AVISO: no hay planillas en {limpio}.")
    sys.exit(0)

orden = {"ALTO": 0, "MEDIO": 1}
hallazgos.sort(key=lambda h: orden.get(h[0], 2))
altos = [h for h in hallazgos if h[0] == "ALTO"]

for sev, archivo, columna, detalle in hallazgos:
    donde = f"{archivo}, columna «{columna}»" if columna else archivo
    print(f"{'BLOQUEO' if sev == 'ALTO' else 'AVISO'}: [{sev}] {donde}: {detalle}")

if not hallazgos:
    print(f"OK: {archivos} planilla/s revisadas, nada en claro.")
elif not altos:
    print(f"OK: {archivos} planilla/s revisadas, sin hallazgos de severidad alta.")
else:
    print(f"BLOQUEO: {len(altos)} hallazgo/s de severidad alta. "
          f"Volver a MIST y revisar la clasificación de esas columnas antes de seguir.")

sys.exit(1 if altos else 0)
PY
