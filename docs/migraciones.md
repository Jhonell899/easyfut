# 🗄️ Migraciones de la base de datos

Se ejecutan **una sola vez, en orden**, en *Supabase → SQL Editor → New query → pegar todo → Run*.
Cuando ejecutes una, cambia su estado aquí (⏳ → ✅) y haz commit.

| # | Archivo | Qué hace | Estado |
|---|---|---|---|
| 001 | `001_esquema_inicial.sql` | Tablas base: perfiles, canchas, horarios (franjas), reservas; reglas de seguridad | ✅ Ejecutada |
| — | `../datos_de_ejemplo.sql` | 3 canchas de prueba (Olivos Arena, La Losa de Chosica, San Borja FC) | ✅ Ejecutada · borrar antes de lanzar |
| 002 | `002_roles_y_login.sql` | Cuentas de rentador y comprador; modalidades Fútbol 7/9/11 | ✅ Ejecutada |
| 003 | `003_cuentas_no_verificadas.sql` | Borra cuentas que nunca verificaron su correo | ✅ Ejecutada |
| 004 | `004_panel_rentador.sql` | Publicar canchas, guardar horarios, fotos (Storage) | ✅ Ejecutada |
| 005 | `005_celular_verificado.sql` | Celular verificado para publicar; contacto público del dueño | ✅ Ejecutada |
| 006 | `006_pagos.sql` | Yape / Plin / transferencia, "Ya pagué", vencimiento (hoy 10 min, ver 010), avisos en vivo | ✅ Ejecutada |
| 007 | `pausadas/007_codigo_por_whatsapp.sql` | Código por WhatsApp con Meta (de pago) | ⏸️ **No ejecutar** (en pausa) |
| 008 | `008_administrador.sql` | Cuenta de administrador y página /admin (pon tu correo antes de ejecutarla) | ✅ Ejecutada |
| 009 | `009_reservas_falsas.sql` | Límites contra reservas falsas, historial y bloqueo de clientes | ✅ Ejecutada |
| 010 | `010_seguridad.sql` | Cierra el hueco de "Ya pagué", 10 minutos para pagar, horarios "En espera", pagos falsos | ✅ Ejecutada |
| 011 | `011_encargados.sql` | Encargados: ven la agenda y confirman pagos en las canchas del dueño | ✅ Ejecutada |
| 012 | `012_admin_canchas.sql` | El administrador ve y gestiona todas las canchas, horarios, fotos y reservas | ✅ Ejecutada |
| 013 | `013_mejoras.sql` | El cliente cancela su reserva sin pagar, tope de 30 días, tope de cancelaciones, el encargado no cambia montos | ✅ Ejecutada |
| 014 | `014_nombre_dueno.sql` | El nombre del dueño se muestra siempre en la página de su cancha | ✅ Ejecutada |
| 015 | `015_proteccion_pagos.sql` | Medios de pago: contraseña reciente para cambiarlos, historial de cambios y aviso al cliente | ✅ Ejecutada |
| 016 | `016_politica_cancelacion.sql` | Política de cancelación por cancha (Flexible, Moderada, Estricta) | ✅ Ejecutada |
| 017 | `017_libres_resenas_confianza.sql` | Buscar "libre a tal hora", reseñas verificadas, confianza de cada cancha | ✅ Ejecutada |
| 018 | `018_dispositivos.sql` | Dos pasos por dispositivo: token único (solo se guarda su huella), IP y navegador registrados, límites de escritura e intentos | ✅ Ejecutada |
| 019 | `019_nombres_claros.sql` | Nombres claros (perfiles→usuarios, franjas→tarifas_horarias, bloqueos_clientes→clientes_bloqueados, cambios_pagos→historial_medios_pago, registro_accesos→historial_accesos), descripción en cada tabla y columna, y reservar exige cuenta. Va en una transacción: si falla no cambia nada; no se ejecuta dos veces | ✅ Ejecutada |
| 020 | `020_sin_encargados.sql` | Quita los encargados: cada cancha se maneja solo con la cuenta del dueño. Borra la tabla `encargados`, sus reglas de acceso y sus funciones. Va en una transacción | ✅ Ejecutada |
| 021 | `021_saldo_reservas.sql` | Saldo de reservas: S/ 1 por reserva confirmada, regalo de bienvenida (S/ 5), recargas por Yape o transferencia BCP desde S/ 1 que aprueba el admin, cuenta BCP en `ajustes_easyfut`, promociones de bono que activa el admin, Yape de EasyFut en `ajustes_easyfut`. Sin saldo, la cancha no recibe reservas. Va en una transacción | ✅ Ejecutada |
| — | `deshacer/deshacer_022_recargas_automaticas.sql` | La 022 (recargas que se confirman solas) se ejecutó por error y se deshace con este script. La 022 está guardada en la rama `mejora/recargas-automaticas` para probarla | ⏳ Pendiente |
| 023 | `023_chat_reservas.sql` | Chat dueño–jugador: uno por pareja con su propio id; se abre solo cuando el dueño confirma el pago desde la app; el cliente de una reserva solo lo pone la app; se puede reportar y el admin lee solo los chats reportados y puede cerrarlos. Además, para reservar la cuenta debe tener un celular vinculado y la reserva usa ese número. Va en una transacción | ✅ Ejecutada |

> Desde la 019, las migraciones 001–018 muestran los **nombres antiguos**. Los nombres actuales están en la 019 y en el diagrama de la base de datos.

## Plantillas de correo (Supabase → Authentication → Emails → Templates)

Supabase solo deja editar las plantillas **después de configurar un correo propio (SMTP)**.
Mientras tanto la app funciona con el **enlace** que manda Supabase: hay que abrirlo en el mismo dispositivo.
Con las plantillas pegadas, el correo trae además un **código** de 6 dígitos.

| Plantilla en Supabase | Archivo | Asunto |
|---|---|---|
| **Confirm signup** | `supabase/plantillas/confirmar_registro.html` | `Tu código de EasyFut: {{ .Token }}` |
| **Magic Link** | `supabase/plantillas/codigo_ingreso.html` | `Código para entrar a EasyFut: {{ .Token }}` |

## Si algo falla

- Error en rojo al ejecutar → no sigas con la siguiente; revisa el mensaje.
- La app dice que falta una función aunque la ejecutaste → ejecuta:

  ```sql
  notify pgrst, 'reload schema';
  ```

## Reglas para nuevas migraciones

- Nombre: `NNN_descripcion_corta.sql` con el número siguiente (010, 011…).
- Nunca edites una migración ya ejecutada: crea una nueva.
- Si agregas una columna editable a `canchas`, añádela también al `grant update (...)` de la 015; si no, la app no podrá guardarla.
- **Contra inyección SQL:** nunca armes SQL juntando texto (`execute '…' || p_texto`); usa parámetros. Toda función `security definer` lleva `set search_path = public`.
- En el código, el texto que escribe una persona nunca va directo dentro de `.or(...)` u otros filtros de texto de Supabase: límpialo primero (ver `textoDeBusqueda` en `ListaCanchas.tsx`).
- Escríbelas para que se puedan ejecutar dos veces sin romper nada
  (`if not exists`, `create or replace`, `drop policy if exists`).
