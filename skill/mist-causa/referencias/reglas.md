# Reglas

No dependen de la situación. Leerlas una vez por sesión.

## 1. La invariante

```
~/Casos/<causa>/          tiene TOKENS      Claude sí
~/Reservado/<causa>/      tiene NOMBRES     Claude nunca
```

De `~/Reservado` no se lee nada. Ni para "chequear", ni para "comparar", ni
porque el fiscal lo pida. Contiene tres cosas y cada una alcanza para deshacer
la desensibilización entera:

- `crudo/` — las planillas originales.
- `boveda/` — el proyecto de MIST, que **incluye la clave maestra**. Con eso se
  regeneran todos los tokens de la causa.
- `final/` — los informes ya reconstruidos, con nombres reales.

Si el fiscal pide algo que requiere leer de ahí, la respuesta es no, y la
explicación es esta sección.

## 2. La regla de denegación, y el canario

Adjuntar una carpeta **no es un límite**. Es el directorio de trabajo: las
herramientas de archivo llegan a cualquier parte del disco a la que llegue el
usuario. Lo único que corta el acceso a `~/Reservado` es una regla en
`~/.claude/settings.json`:

```json
{ "permissions": { "deny": ["Read(//Users/<usuario>/Reservado/**)"] } }
```

La forma exacta importa y falla en silencio si está mal. Comprobado corriendo
Claude Code de verdad:

| Forma | Qué hace |
|---|---|
| `Read(//ruta/**)` | deniega — **es la que hay que usar** |
| `Read(~/ruta/**)` | deniega |
| `Read(/ruta/**)` | **no deniega nada**, y no avisa |
| `Write(…)`, `Glob(…)`, `Grep(…)` con ruta | inertes: `Read` ya cubre todo lo que lee |

Sólo se deniega `Read`, a propósito. Denegar `Edit` además rompe el alta de
causas: Claude Code deniega un `mkdir -p` entero si alguna de las rutas que
nombra cae bajo la regla. Y acá el riesgo es que los nombres salgan, no que
entren.

El guión `verificar-entorno.sh` comprueba que la regla esté escrita y con la
forma que funciona. Pero comprueba el texto, no el efecto: un guión corre en un
shell y el shell no pasa por las reglas de permisos.

**El efecto lo prueba el canario.** Intentar leer `~/Reservado/CANARIO.txt`
**con la herramienta de lectura de archivos** —no con `cat`, no desde un guión:

- **La lectura falla** → bien. La regla está y se está aplicando.
- **La lectura tiene éxito** → parar. Da igual lo que diga el archivo de
  configuración: Claude puede llegar a las planillas originales y a la clave
  maestra. Decírselo al fiscal con todas las letras y no analizar nada.

Es la única prueba del efecto y no depende de qué versión de Claude Desktop haya
ni de dónde guarde su configuración.

## 3. Qué se manda

Sólo archivos `*.desensibilizado.*`. Nunca la carpeta del proyecto, nunca el
`mist-mapa-*.csv`, nunca la planilla original. (MANUAL §7.)

El `mist-mapa-*.csv` merece una mención aparte: es texto plano con
`token → nombre real` para cada entidad de la causa. Es el peor archivo del
sistema para que ande dando vueltas. Se genera, se usa y se borra.

## 4. Documentos y PDFs

**MIST desensibiliza planillas. No desensibiliza PDFs, ni documentos, ni texto
suelto.** No hay una versión de esto que funcione a medias: un expediente, una
declaración o una pericia no se pueden pasar por MIST.

Entonces, cuando el fiscal quiera trabajar sobre un documento:

- **No se sube el documento.** Ni entero, ni un fragmento, ni "sólo la parte
  relevante".
- **Si lo que hace falta son los datos que están adentro**, se transcriben a una
  planilla —los movimientos, las fechas, los intervinientes— y esa planilla pasa
  por MIST como cualquier otra. Es trabajo manual y hay que decirlo así.
- **Si lo que hace falta es una consulta metodológica o jurídica**, se puede
  hacer sin los datos: cómo se estructura un análisis de flujo de fondos, qué
  buscar en una pericia contable, cómo ordenar una línea de tiempo.

Decir esta regla antes de que el fiscal improvise. La improvisación previsible
es pegar el PDF en el chat.

## 5. El portapapeles

Es el agujero que ninguna configuración tapa: el fiscal puede pegar cualquier
cosa en la conversación.

Si en un mensaje entrante aparecen **nombres y apellidos, DNI, CUIT/CUIL,
domicilios, teléfonos o correos reales**, cortar antes de usarlos:

> Esto parece tener datos reales sin desensibilizar. No lo voy a incorporar al
> análisis. Si son datos de la causa, pasalos por MIST y mandame el
> `.desensibilizado`.

El caso más probable no es un archivo: es un informe que **ya se reconstruyó**,
que el fiscal quiere que mejoremos. Ese texto tiene nombres reales por
definición. Se corrige sobre la versión con tokens, y recién después se
reconstruye.

**Si el fiscal confirma explícitamente que quiere seguir igual** —porque son
datos de prueba, o porque es una decisión suya que puede tomar—, se sigue, pero
queda anotado en `registro.md` con fecha y motivo. La skill no tiene autoridad
para vetar al fiscal; sí tiene la obligación de que la decisión sea consciente y
quede escrita.

## 6. Los hallazgos del olfateo no son sentencias

`olfatear.sh` marca columnas con encabezado sensible cuyos valores no son
tokens. A veces está bien que sea así: el fiscal eligió *Conservar* porque el
análisis necesita esa columna. Una localidad conservada puede ser legítima.

Lo que hay que hacer con un hallazgo es **preguntar**, no bloquear para siempre:
nombrar el archivo y la columna, y que el fiscal diga si fue una decisión o un
descuido. Si fue decisión, anotarla en `esquema.md` para no volver a preguntar
en cada sesión.

Dos matices que no admiten "fue a propósito", y ante los cuales hay que mandar
de vuelta a MIST:

- Un **CUIT o un correo en claro** en una columna que debía estar
  seudonimizada. Ahí no hubo decisión, hubo una columna que se escapó.
- Una columna marcada para *Seudonimizar* **sin tipo asignado**: sale en claro
  aunque la acción diga lo contrario. (MANUAL §9.3.)

## 7. Combinaciones

Lo marcado *Conservar* viaja en claro, y está bien —el análisis necesita montos
y fechas—, pero **una combinación de datos no sensibles puede identificar a una
persona igual**. Un domicilio conservado más una fecha de nacimiento alcanza.
Si una columna no hace falta para lo que se va a analizar, *Vaciar* es mejor que
*Conservar*. (MANUAL §7.)

## 8. Una causa por vez

Los tokens de una causa no significan nada en otra: cada proyecto de MIST tiene
su propia clave maestra. No mezclar archivos de dos causas en una misma sesión,
ni tener dos causas abiertas a la vez. Si hay que cambiar de causa, se termina
la sesión y se empieza otra. (MANUAL §8.)

## 9. Lo que no se puede pedir

Nada que necesite el contenido del dato en sí: deducir género o nacionalidad de
un nombre, validar el dígito verificador de un CUIT, agrupar por barrio a partir
de un domicilio, reconocer que un apellido es de una familia conocida. Eso se
perdió, y ése es exactamente el punto. Decirlo en vez de inventar una
aproximación. (MANUAL §7.)
