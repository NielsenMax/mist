# Planillas nuevas: el paso por MIST

**Este paso no lo hace Claude.** MIST es una página que corre en el navegador
del fiscal, y la carpeta del proyecto se elige en un diálogo de Chrome que sólo
él puede operar. Lo que corresponde es guiarlo, verificar el resultado, y no
tocar nada de `~/Reservado`.

El detalle completo está en `MANUAL.md` §6. Acá va lo que hay que decirle y lo
que hay que revisar después.

## Antes

Si la causa no existe todavía:

```bash
bash <ruta-de-la-skill>/guiones/nueva-causa.sh 2026-114-defraudacion
```

Crea las dos mitades y deja `esquema.md` y `registro.md` vacíos en `~/Casos`.
Que ponga las planillas originales en `~/Reservado/<causa>/crudo/`.

## Los cuatro puntos donde se equivoca

De todo el MANUAL, estos son los que hay que decir en voz alta:

1. **La carpeta del proyecto va en `~/Reservado/<causa>/boveda`.** Es el error
   más caro del sistema: si elige una carpeta de `~/Casos`, la bóveda —con la
   clave maestra— queda del lado que Claude puede leer, y hay que rehacer la
   causa entera con una clave nueva.
2. **Chrome o Edge, no Safari.** Safari no tiene acceso a carpetas del disco: el
   proyecto cae al modo archivo JSON, sin autoguardado. Es la forma más común de
   perder una bóveda.
3. **Columnas sin tipo.** Una columna marcada para *Seudonimizar* a la que no se
   le asignó tipo **sale en claro**. Aparecen en rojo en *Columnas* y en los
   avisos de *Salida*.
4. **El texto libre es el punto ciego.** MIST reconoce dentro de un comentario
   sólo las formas que ya vio en alguna columna clasificada. Un testigo que
   aparece únicamente en una observación **sale en claro**. Si el texto libre no
   hace falta para el análisis, *Vaciar* es la opción segura; si hace falta, que
   lea una muestra antes de exportar.

## Después

Que ponga los `*.desensibilizado.*` en `~/Casos/<causa>/limpio/`. Sólo esos: ni
el mapa inverso, ni la carpeta del proyecto, ni los originales.

Y antes de analizar nada:

```bash
bash <ruta-de-la-skill>/guiones/olfatear.sh ~/Casos/<causa>
bash <ruta-de-la-skill>/guiones/ingestar.sh ~/Casos/<causa>
```

Si el olfateo encuentra algo de severidad alta, ver `reglas.md` §6: se pregunta,
no se bloquea para siempre. Un CUIT o un correo en claro sí es motivo para
volver a MIST.
