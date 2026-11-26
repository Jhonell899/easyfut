# 🎨 Sistema de diseño (React)

Para que toda EasyFut se vea igual y sea fácil de cambiar, las pantallas se arman con
**componentes** y **hooks** compartidos, no copiando clases y colores a mano.

Guía visual con todo: **`/diseno`** (en tu computadora o en las direcciones de prueba de Vercel;
no aparece en la versión publicada).

## Colores con nombre (tokens)

Definidos una sola vez en `src/app/globals.css` (`@theme`). Úsalos así:

| En vez de… | Escribe |
|---|---|
| `bg-[#6D28D9]` / `text-[#6D28D9]` | `bg-marca` / `text-marca` |
| `bg-[#EDE9FE]` | `bg-marca-tinte` |
| `text-[#1B1B1B]` · `text-[#5A5A5A]` · `text-[#8A968F]` | `text-tinta` · `text-tinta-suave` · `text-tinta-tenue` |
| `border-[#E3E3E3]` | `border-borde` |
| `bg-[#F4F4F4]` | `bg-superficie-suave` |
| `text-[#0F7A55]` · `bg-[#DCF5EA]` | `text-exito` · `bg-exito-tinte` |
| `bg-[#0A3D2E]` | `bg-cancha` |

## Componentes (`src/components/ui`)

```tsx
import { Boton, Tarjeta, Campo, CampoTexto, Insignia, Aviso, Esqueleto, Vacio } from "@/components/ui";

<Boton onClick={guardar} cargando={guardando}>Guardar</Boton>
<Boton variante="secundario" href="/panel">Mi panel</Boton>
<Tarjeta titulo="Recargar saldo" descripcion="Desde S/ 1" accion={<Boton tamano="sm">Ver</Boton>}>…</Tarjeta>
<Campo etiqueta="Celular" ayuda="9 dígitos" error={errorCelular} value={celular} onChange={…} />
<Insignia tono="exito">Confirmada</Insignia>
<Aviso tono="error">No se pudo guardar.</Aviso>
<Esqueleto alto="h-40" />
<Vacio icono="📅" titulo="Aún no tienes reservas" accion={<Boton href="/">Buscar canchas</Boton>} />
```

## Hooks (`src/hooks`)

```tsx
// Cargar datos con carga, error y recargar
const { datos, error, cargando, recargar } = useConsulta((sb) => sb.rpc("mi_saldo"), []);

// Enterarse de cambios en vivo (respeta las reglas de seguridad)
useEnVivo("reservas", recargar);

// Copiar al portapapeles
const { copiado, copiar } = useCopiar();
```

## Reglas para pantallas nuevas

1. **Nada de colores `#…` a mano**: usa los tokens. Si falta un color, agrégalo al `@theme`.
2. **Componentes pequeños**: una pantalla grande se parte en piezas con una sola tarea
   (ejemplo: `src/components/panel/saldo/`).
3. **Datos con `useConsulta`**, cambios en vivo con `useEnVivo`. No repetir `useEffect` + `useState` a mano.
4. **Accesible**: todo campo con `etiqueta`, errores con `Aviso tono="error"`, botones con texto claro.
5. **Primero el celular**: probar a 375 px de ancho.

## Ya migrado

- Saldo del dueño (`/panel/saldo`) → `src/components/panel/saldo/`

Las demás pantallas se pueden pasar al sistema de a poco, una por vez.
