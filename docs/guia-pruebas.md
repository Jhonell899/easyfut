# 🧪 Guía de pruebas de EasyFut

Gracias por ayudar a probar EasyFut, una app para reservar canchas de fútbol en Lima.
Esta guía dice **qué probar**, **qué debería pasar** y **cómo reportar** lo que falle.

- **App:** <https://easyfut-8jyo.vercel.app> (funciona en el navegador; no hay que instalar nada)
- **Soporte:** easyfutinquiries@gmail.com

---

## Antes de empezar

1. **Usa la cuenta de prueba que te dimos.** El registro por correo todavía no envía correos a
   cualquier dirección, así que la cuenta ya viene creada y confirmada.
2. **Ideal: dos dispositivos.** Un celular como *jugador* y una computadora como *dueño*, para ver
   los avisos en vivo. Con uno solo también se puede (cambiando de cuenta).
3. **Instálala en el celular** (opcional): Android → Chrome → menú ⋮ → *Instalar app*.
   iPhone → Safari → *Compartir* → *Agregar a inicio*.

### ⚠️ Importante

- **La base de datos es la real.** Reserva solo en la cancha **"Cancha de prueba"** o en la que te
  indiquemos, y escribe **PRUEBA** al inicio de tu nombre al reservar.
- **No envíes dinero de verdad.** Cuando la app pida pagar por Yape/Plin, **no pagues**: solo pulsa
  los botones para seguir el flujo.
- **No uses números o datos de otras personas.**

---

## 1. Buscar canchas (sin cuenta)

| # | Qué hacer | Qué debería pasar |
|---|---|---|
| 1.1 | Abre la app | Portada verde/morada y la lista de canchas con foto, precio y botón *Reservar* |
| 1.2 | Escribe en el buscador (ej. "olivos") | Solo quedan las canchas que coinciden; sin tildes también funciona |
| 1.3 | Filtra por distrito y por *Fútbol 7 / 9 / 11* | La lista cambia y el contador se actualiza |
| 1.4 | Pulsa **Ver canchas cerca de mí** y acepta la ubicación | Cada tarjeta muestra la distancia ("4,3 km · Cerca de ti") y se ordenan de la más cercana |
| 1.5 | En **¿Cuándo quieres jugar?** elige *Hoy* y una hora | Quedan solo las canchas libres a esa hora, con "✓ Libre a las 20:00". Si sale "Esta búsqueda aún no está disponible", es esperado por ahora |
| 1.6 | Abre una cancha | Fotos, dueño, horarios, política de cancelación, mapa y reseñas |

## 2. Reservar y pagar (como jugador)

| # | Qué hacer | Qué debería pasar |
|---|---|---|
| 2.1 | En *Cancha de prueba*, elige día, duración y hora | Los horarios ocupados salen grises; los separados por otro, en amarillo "En espera" |
| 2.2 | Escribe nombre (**PRUEBA …**) y celular | El botón *Reservar* sigue bloqueado hasta comprobar el WhatsApp |
| 2.3 | Pulsa **Comprobar en WhatsApp** y responde *Sí* | Aparece "✓ tiene WhatsApp" y se activa *Reservar* |
| 2.4 | Pulsa **Reservar** | Página de pago con cuenta regresiva de **10 minutos**, el monto, los números de pago y el código de la reserva |
| 2.5 | Marca la casilla del nombre del titular y pulsa **Ya pagué** (sin pagar) | Se abre WhatsApp con un mensaje listo para el dueño. La reserva pasa a "Esperando que el dueño confirme" |
| 2.6 | Prueba **Agregar a calendario**, **Compartir** y **Cómo llegar** | Cada botón abre lo que dice |
| 2.7 | Haz otra reserva y pulsa **Cancelar reserva** antes de pagar | La reserva queda cancelada y el horario vuelve a estar libre |
| 2.8 | Intenta tener 2 reservas sin pagar con el mismo celular | La app no deja y explica por qué |

## 3. Confirmar el pago (como dueño)

| # | Qué hacer | Qué debería pasar |
|---|---|---|
| 3.1 | Entra con la cuenta de dueño y abre **Mi panel** | Si es un dispositivo nuevo, pide confirmar con un enlace o código del correo |
| 3.2 | Mira **Por confirmar** mientras el jugador pulsa *Ya pagué* | La reserva aparece sola, con sonido, y dice "Busca en tu Yape un pago de S/ X con el mensaje CÓDIGO" |
| 3.3 | Pulsa **Confirmar pago** | El jugador ve su reserva como confirmada (su página se actualiza sola) |
| 3.4 | En otra reserva, pulsa **No me llegó** | Se cancela y en el historial del cliente cuenta como "pago falso" |
| 3.5 | Abre **Agenda del día** | Una columna por cancha, con colores por estado; al tocar un hueco libre se puede registrar una reserva presencial o bloquearlo |
| 3.6 | En una cancha → pestaña **Pagos**, cambia un medio de pago y guarda | Pide la contraseña antes de guardar |
| 3.7 | En el menú del avatar, **Cambiar a modo jugador** y luego **Volver a modo dueño** | La app cambia entre el inicio de jugador y el panel |

## 4. Cuentas y seguridad

| # | Qué hacer | Qué debería pasar |
|---|---|---|
| 4.1 | Cierra sesión y vuelve a entrar desde **otro navegador** | Pide confirmar con el correo (enlace o código) antes de abrir el panel |
| 4.2 | Intenta abrir `/admin` con tu cuenta | "No encontramos esa página" (solo el administrador entra) |
| 4.3 | Escribe una contraseña equivocada | Mensaje claro, sin detalles técnicos |

---

## Cómo reportar un error

Por cada problema, envía:

1. **Qué hiciste**, paso a paso (ej. "2.4: pulsé Reservar a las 20:00").
2. **Qué esperabas** y **qué pasó**.
3. **Captura de pantalla** con la **dirección completa** visible arriba (la URL).
4. **Dispositivo y navegador** (ej. "Android, Chrome" o "iPhone, Safari").

Envíalo a **easyfutinquiries@gmail.com** o, si tienes acceso al repositorio, como *Issue* en
GitHub con la plantilla **🐞 Error**.

---

## Para revisar el código (opcional)

1. Pide acceso al repositorio de GitHub.
2. Sigue el [README](../README.md): `npm install`, crea tu `.env.local` con la URL y la clave
   **pública** de Supabase, y ejecuta `npm run dev`.
3. Trabaja en una rama y abre un *pull request* (ver [cómo trabajar](como-trabajar.md)).
