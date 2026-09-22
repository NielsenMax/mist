# Volver a los nombres

El camino de vuelta lo hace MIST, en el navegador, en la pestaña *Reconstruir*.
No lo hace Claude, y no puede: la bóveda está en `~/Reservado`.

## El procedimiento

1. El resultado del análisis queda como archivo en `~/Casos/<causa>/`, con
   tokens.
2. El fiscal abre `~/Reservado/mist.html`, **abre el proyecto de esa causa** y
   verifica la huella de la clave maestra. Es el control de que está en la causa
   que cree.
3. Suelta el archivo en *Reconstruir*.
4. Guarda el resultado en **`~/Reservado/<causa>/final/`**. Ahí, no en `~/Casos`.

## Por qué `final/` está del otro lado

Un informe reconstruido tiene nombres reales. Si quedara en `~/Casos`, la
carpeta que Claude lee tendría los nombres que todo el trabajo anterior sacó, y
la desensibilización habría durado exactamente hasta el último paso.

## La trampa del final

Con el informe reconstruido en la mano, lo natural es pedir *"mejorá la
redacción de esto"*. Ese texto tiene nombres reales por definición.

**Se corrige sobre la versión con tokens y recién después se reconstruye.** Si el
fiscal pega el informe reconstruido, cortar — `reglas.md` §5. Vale la pena
adelantarse y decirlo cuando se le entrega el resultado, antes de que lo
intente.

## Si un token no vuelve

MIST reconoce los tokens por su forma, no por la columna, así que resuelve
igual en un archivo reordenado, renombrado o dentro de una frase. Si aun así
queda un token sin resolver, hay dos causas posibles:

- **Es de otra clave maestra.** MIST lo dice con esas palabras. El archivo es de
  otra causa: no está mal la bóveda, está mal el archivo.
- **El token viajó roto.** Recortado, con otra mayúscula, o inventado por el
  modelo. Se arregla del lado del análisis, no del lado de la bóveda: volver a
  generar el resultado escribiendo los tokens textuales.

Un token que MIST devuelve resuelve al **valor más frecuente** de su grupo, no
al que estaba en esa celda. Si "Pérez, Joaquín" y "Joaquín Pérez" se fusionaron,
las dos vuelven como la forma más común. Es lo correcto, y conviene decirlo si
el fiscal nota que un nombre volvió escrito distinto.
