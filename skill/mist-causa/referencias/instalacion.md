# Primera vez en esta máquina

El fiscal no usa la terminal. El único gesto que le corresponde es un doble clic.

## 1. Dejar el instalador a mano

Copiar `guiones/instalar-mist.command` al escritorio o a `~/Claude`, y darle
permiso de ejecución:

```bash
cp <ruta-de-la-skill>/guiones/instalar-mist.command "$HOME/Desktop/"
chmod +x "$HOME/Desktop/instalar-mist.command"
```

## 2. Decirle qué va a pasar, antes

Antes de que lo abra, explicarle en dos líneas: crea dos carpetas en su usuario,
baja DuckDB y MIST, no pide contraseña de administrador y no toca nada más. Un
archivo que se abre a ciegas es un archivo que la próxima vez no se abre.

## 3. Que lo abra con doble clic

macOS puede advertir que el archivo viene de internet. Se abre igual desde
**clic derecho → Abrir**. El instalador pregunta antes de hacer nada y va
informando cada paso.

## 4. El paso que no se puede automatizar

Al terminar, el instalador lo dice y hay que repetírselo:

> En Claude Desktop, adjuntá **`~/Casos`**. Nunca `~/Reservado` ni tu carpeta
> personal.

Esa es la única barrera real del sistema. Si adjunta la carpeta personal, todo
lo demás es decoración: Claude puede leer las planillas originales y la bóveda.

## 5. Comprobar que quedó bien

```bash
bash <ruta-de-la-skill>/guiones/verificar-entorno.sh
```

Y después, la prueba que de verdad importa: **intentar leer
`~/Reservado/CANARIO.txt` con la herramienta de lectura de archivos.** Tiene que
fallar. Si se puede leer, la separación no existe — ver `reglas.md` §2.

## Qué instala, exactamente

| Qué | Dónde | Cómo |
|---|---|---|
| Los dos árboles | `~/Casos`, `~/Reservado` | `mkdir` |
| El canario y el leeme | `~/Reservado/` | archivos de texto |
| DuckDB | `~/.local/bin` o Homebrew | `install.duckdb.org`, sin admin |
| Soporte de xlsx | caché de DuckDB | `INSTALL excel` |
| MIST | `~/Reservado/mist.html` | descarga de `mist.fernet.cc` |

Nada requiere administrador y nada sale del directorio del usuario. La huella
SHA-256 de cada `mist.html` bajado queda en `~/Reservado/mist-versiones.txt`.
