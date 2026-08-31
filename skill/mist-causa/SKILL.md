---
name: mist-causa
description: Metodología para analizar las planillas de una causa judicial sobre datos desensibilizados con MIST. Usar cuando se trabaje sobre una carpeta de ~/Casos, se mencione una causa, un expediente, una fiscalía, o se pida analizar planillas de una investigación. Impone un chequeo de entorno antes de leer ningún dato y define qué nunca se manda.
---

# Análisis de una causa con MIST

MIST reemplaza los datos sensibles de una planilla por tokens estables
(`persona-k3f9x2q1`). Esta skill es el trabajo que viene **después**: analizar
esas planillas ya desensibilizadas sin que los nombres reales aparezcan nunca en
la conversación.

Versión 1.0.0. La fuente de verdad de todo lo que hace MIST es `MANUAL.md` del
repositorio; esta skill lo ejecuta, no lo reemplaza. Cuando algo acá contradiga
al MANUAL, gana el MANUAL y hay que avisarlo.

## La invariante

Hay dos árboles en el disco y una sola regla:

```
~/Casos/<causa>/          tiene TOKENS      Claude sí
~/Reservado/<causa>/      tiene NOMBRES     Claude nunca
```

Todo el resto de este documento existe para sostener esa línea. `~/Reservado`
contiene las planillas originales, la bóveda de MIST —que incluye la clave
maestra— y los informes ya reconstruidos. Cualquiera de esas tres cosas alcanza
para deshacer la desensibilización entera.

## Protocolo de arranque — obligatorio

**Antes de leer cualquier archivo de datos, en toda sesión, sin excepción:**

```bash
bash <ruta-de-la-skill>/guiones/verificar-entorno.sh
```

El guión imprime líneas con prefijo `BLOQUEO:`, `AVISO:` u `OK:`.

- **`BLOQUEO:`** — parar. No leer ningún archivo de datos, no correr consultas.
  Explicarle al fiscal en castellano llano qué está mal y qué tiene que hacer.
  El caso más importante: si `~/Reservado` o el directorio personal figuran
  entre las carpetas de confianza de Claude, la separación no existe y todo lo
  demás es decoración.
- **`AVISO:`** — se puede seguir, pero hay que decírselo al fiscal antes.
- **`OK:`** — seguir.

**Segundo, la prueba que de verdad importa.** Intentar leer
`~/Reservado/CANARIO.txt` **con la herramienta de lectura de archivos** — no con
`cat`, no desde un guión: un guión lee cualquier cosa que el usuario pueda leer
y por lo tanto no prueba nada.

- **La lectura falla** → bien, el límite está donde tiene que estar.
- **La lectura tiene éxito** → parar. La separación no existe: Claude puede
  llegar a las planillas originales y a la clave maestra. Decírselo al fiscal
  con todas las letras y no analizar nada hasta que `~/Reservado` salga de las
  carpetas de confianza.

Es la única prueba empírica de la propiedad que sostiene todo el sistema, y no
depende de dónde guarde su configuración esta versión de Claude Desktop.

Tercero, antes de la primera consulta sobre datos:

```bash
bash <ruta-de-la-skill>/guiones/olfatear.sh ~/Casos/<causa>
```

Verifica que MIST **efectivamente corrió**: busca CUIT, DNI, correos y teléfonos
en claro dentro de `limpio/`. Una planilla que debía estar desensibilizada y
tiene un CUIT crudo significa que una columna se escapó. Si aparece algo,
**parar y mandar al fiscal de vuelta a MIST**, indicando archivo y columna.
Pero un hallazgo no es una sentencia: una columna puede estar en claro porque el
fiscal eligió *Conservar*, y eso es legítimo. Ver `referencias/reglas.md` §6.

## Qué hacer según la situación

| El fiscal… | Leer |
|---|---|
| es la primera vez en esta máquina | `referencias/instalacion.md` |
| tiene planillas nuevas sin desensibilizar | `referencias/preparar.md` |
| quiere analizar lo que ya está en `limpio/` | `referencias/analisis.md` |
| tiene un resultado con tokens para volver a nombres | `referencias/reconstruir.md` |

Las reglas que no dependen de la situación están en `referencias/reglas.md`.
Leerlas una vez por sesión.

## Lo que esta skill no puede hacer

Decilo cuando corresponda, en lugar de intentarlo:

- **Operar MIST.** MIST es una página que corre en el navegador del fiscal y la
  carpeta del proyecto se elige en un diálogo de Chrome. Se lo guía paso a paso;
  no se lo reemplaza.
- **Impedir que el fiscal pegue datos en el chat.** Se detecta y se corta —ver
  `referencias/reglas.md`— pero no se impide.
- **Desensibilizar PDFs o documentos.** MIST trabaja sobre planillas y nada más.
  La regla para documentos está en `referencias/reglas.md` y hay que darla, no
  improvisar.

## Nombres

Una carpeta por causa, con el número de causa y una palabra, igual en los dos
árboles: `2026-114-defraudacion`. Es la convención del MANUAL §8 y sirve para
que un archivo suelto se pueda ubicar contra qué bóveda reconstruirlo.
