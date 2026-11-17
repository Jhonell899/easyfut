# ✅ Pendientes de EasyFut

Marca con `[x]` lo que vayas terminando. Para trabajar una tarea, créala como *Issue* en GitHub.

## 1. Antes de lanzar al público
- [x] Verificación en dos pasos (código al correo) al entrar desde un dispositivo nuevo (migración 018)
- [x] Cambiar entre modo dueño y modo jugador
- [x] Respaldo del código en GitHub
- [x] Protección contra reservas falsas
- [x] Prueba de seguridad y arreglos: cabeceras, contraseña de 8, hueco de "Ya pagué"
- [ ] Publicar en internet (Vercel) con `https`
- [x] App instalable en el celular (PWA): ícono, nombre, pantalla completa
- [ ] **Correo propio (SMTP)**: obligatorio antes de lanzar. Sin él, Supabase solo envía correos a los miembros del equipo del proyecto y no deja editar las plantillas
- [ ] Borrar las canchas de ejemplo y cargar las reales
- [ ] Términos y privacidad: borrador listo en /terminos y /privacidad; falta completar los [COMPLETAR] y revisarlo con un abogado
- [ ] Actualizar dependencias (Next.js y avisos de `npm audit`)

## 2. Para los jugadores
- [x] Cancelar su propia reserva mientras no haya avisado el pago
- [x] Buscar por nombre o distrito y ordenar por precio
- [x] Buscar "libre hoy / mañana a tal hora" (migración 017)
- [x] Agregar el partido al calendario del celular
- [x] Compartir la reserva con el equipo
- [x] Reseñas verificadas con estrellas y respuesta del dueño (migración 017)
- [x] Señales de confianza: partidos jugados, dueño verificado, reseñas respondidas

## 3. Para los dueños
- [x] Política de cancelación por cancha, con opciones fijas y justas (migración 016)
- [x] Código de la reserva en el mensaje del pago, para conciliar
- [ ] Membresía mensual para dueños (cobro, prueba gratis, pausa si no paga)
- [x] Agenda del día con todas las canchas
- [x] Encargados
- [x] Resumen de ingresos: hoy, semana y mes
- [ ] Reservas fijas (todos los martes 8 pm)
- [ ] Canchas divididas (una de 7 dentro de una de 11)
- [x] Botón para avisar al cliente "tu reserva está confirmada"

## 4. Para el administrador
- [x] Pestaña Canchas: publicar/pausar, gestionar y ver la agenda de cualquier cancha
- [ ] Aprobar canchas antes de publicarse
- [ ] Ver todas las reservas y estadísticas generales

## 5. Más adelante
- [ ] Casilla anti-robots (Cloudflare Turnstile)
- [ ] Pago con tarjeta / Yape automático (Culqi o Mercado Pago, requiere RUC)
- [ ] Código por WhatsApp con Meta (`supabase/migraciones/pausadas/007`)
- [ ] App en Play Store (Capacitor)
