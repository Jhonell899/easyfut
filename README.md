# ⚽ EasyFut

App web (pensada para celular) para **reservar canchas de fútbol en Lima**.
Los jugadores buscan, reservan y pagan con Yape / Plin / transferencia; los dueños
publican sus canchas y confirman los pagos desde su panel.

**Tecnología:** Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (base de datos, cuentas y fotos)

---

## 📁 Cómo está organizado

```
easyfut/
├── src/
│   ├── app/                 ← Páginas (cada carpeta = una dirección de la web)
│   │   ├── page.tsx           /               Inicio: lista de canchas
│   │   ├── c/[slug]/          /c/olivos-arena Detalle de una cancha y reserva
│   │   ├── r/[codigo]/        /r/AB12CD34     Pago y estado de una reserva
│   │   ├── reservas/          /reservas       Mis reservas
│   │   ├── ingresar/          /ingresar       Iniciar sesión
│   │   ├── registro/          /registro       Crear cuenta (código por correo)
│   │   ├── publicar/          /publicar       Página para dueños de canchas
│   │   ├── panel/             /panel          Panel del rentador (dueño)
│   │   │   ├── agenda/          /panel/agenda Agenda del día de todas las canchas
│   │   │   ├── nueva/           /panel/nueva  Asistente para publicar cancha
│   │   │   └── c/[id]/          /panel/c/…    Gestionar una cancha
│   │   ├── admin/             /admin          Administración de EasyFut
│   │   └── auth/              (rutas internas de inicio de sesión)
│   │
│   ├── components/          ← Piezas de pantalla reutilizables
│   │   ├── (raíz)             Las que ve el jugador: tarjetas, reservar, pago…
│   │   ├── panel/             Las del rentador: asistente, horarios, reservas…
│   │   └── admin/             Las del administrador
│   │
│   └── lib/                 ← Lógica sin pantalla: horarios, ubicación, Supabase…
│
├── supabase/
│   ├── migraciones/         ← Cambios de la base de datos, en orden (ver docs/migraciones.md)
│   │   └── pausadas/          Migraciones que NO se deben ejecutar todavía
│   ├── plantillas/          ← Correo de código de registro
│   └── datos_de_ejemplo.sql ← 3 canchas de prueba
│
├── docs/                    ← Guías (léelas cuando las necesites)
│   ├── migraciones.md         Qué migración hace qué y cuáles ya se ejecutaron
│   ├── diseno.md              Sistema de diseño: colores, componentes y hooks de React
│   ├── como-trabajar.md       Ramas, commits y versiones: paso a paso
│   ├── pendientes.md          Lista de mejoras por hacer
│   └── whatsapp-meta.md       (En pausa) Código por WhatsApp con Meta
│
└── .github/                 ← Plantillas para anotar ideas y errores en GitHub
```

---

## 🚀 Ejecutar en tu computadora

1. Instala [Node.js](https://nodejs.org) (versión 20 o más nueva).
2. Copia `.env.example` como `.env.local` y pon la URL y la clave pública de tu proyecto de Supabase
   (*Supabase → Project Settings → API*). **`.env.local` nunca se sube a GitHub.**
3. En la carpeta del proyecto:

   ```bash
   npm install
   npm run dev
   ```

4. Abre <http://localhost:3000>.

---

## 🗄️ Base de datos (Supabase)

Las migraciones se ejecutan **a mano, una por una y en orden**, en
*Supabase → SQL Editor → New query → pegar → Run*.
El estado de cada una está en **[docs/migraciones.md](docs/migraciones.md)**.

---

## 👥 Tipos de cuenta

| Cuenta | Qué puede hacer |
|---|---|
| **Jugador** (sin cuenta o *comprador*) | Buscar canchas, reservar, pagar y avisar por WhatsApp |
| **Rentador** (*dueño*) | Publicar canchas, horarios, precios, fotos y medios de pago; confirmar pagos; bloquear clientes |
| **Administrador** | Gestionar todas las canchas (publicar, pausar, editar, ver su agenda); aprobar el WhatsApp de rentadores; ver el historial de clientes y bloquearlos en toda EasyFut |

### 🔑 Cuentas de prueba

Las cuentas de prueba **no se escriben en el repositorio**: sus contraseñas se comparten
por un canal privado. Para crear una: Supabase → Authentication → Users → *Add user* →
*Create new user* (con *Auto Confirm User*). Nunca des permisos de administrador a una
cuenta de prueba.

---

## 🧭 Cómo trabajar

Resumen (detalle en **[docs/como-trabajar.md](docs/como-trabajar.md)**):

- `main` = la versión que funciona.
- Cada mejora en su propia rama: `mejora/nombre`, `arreglo/nombre`.
- Ideas y errores se anotan como **Issues** en GitHub.
