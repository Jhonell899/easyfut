# 🧭 Cómo trabajar con git y GitHub

Una forma simple de no perder nada y saber siempre qué cambió.

## Las ramas

| Rama | Para qué |
|---|---|
| `main` | La versión que funciona. Lo que se publica. |
| `mejora/nombre` | Algo nuevo. Ej.: `mejora/reseñas`, `mejora/pwa` |
| `arreglo/nombre` | Corregir un error. Ej.: `arreglo/hora-reserva` |

## El paso a paso de cada cambio

1. **Anota la idea** en GitHub → pestaña **Issues → New issue** (elige *Mejora* o *Error*).
2. **Crea una rama** desde `main`:

   ```bash
   git checkout main
   git pull
   git checkout -b mejora/nombre-corto
   ```

3. **Trabaja y guarda** cada avance:

   ```bash
   git add -A
   git commit -m "Agrega el botón de compartir reserva"
   ```

4. **Sube la rama** a GitHub:

   ```bash
   git push -u origin mejora/nombre-corto
   ```

5. En GitHub aparecerá **"Compare & pull request"** → créalo, revisa los cambios y pulsa **Merge**.
   Escribe `Cierra #12` en la descripción para que se cierre el issue 12 automáticamente.
6. **Vuelve a `main`** y actualízala:

   ```bash
   git checkout main
   git pull
   ```

> Para cambios muy pequeños también puedes hacer commit directo en `main`.

## Revisión automática

Cada vez que subes código, GitHub comprueba solo que no haya errores y que la app compile
(pestaña **Actions** del repositorio). Un ✅ verde significa que todo está bien; una ❌ roja,
que algo se rompió. Puedes hacer la misma revisión en tu computadora antes de subir:

```bash
npm run verificar
```

## Cómo escribir los commits

En español, en presente y diciendo **qué** cambia:

- ✅ `Agrega filtro por distrito en el inicio`
- ✅ `Corrige el precio cuando la reserva dura 90 minutos`
- ❌ `cambios`, `arreglos`, `asdf`

## Versiones

Cuando juntes varias mejoras que funcionan, marca una versión:

```bash
git tag -a v0.2.0 -m "Reseñas y filtro por distrito"
git push origin v0.2.0
```

- `v0.1.0 → v0.2.0`: mejoras nuevas
- `v0.2.0 → v0.2.1`: solo arreglos
- `v1.0.0`: cuando EasyFut se lance al público

Luego en GitHub → **Releases → Draft a new release** puedes escribir qué trae cada versión.

## Organizar las tareas en GitHub (opcional)

En tu repositorio → **Projects → New project → Board**. Tendrás columnas
*Por hacer · En progreso · Listo* y puedes arrastrar ahí tus issues.

## Nunca subas

- `.env.local` (tus claves) — ya está excluido en `.gitignore`.
- Tokens o contraseñas dentro del código o de las migraciones.
