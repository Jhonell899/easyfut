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
| 015 | `015_proteccion_pagos.sql` | Medios de pago: contraseña reciente para cambiarlos, historial de cambios y aviso al cliente | ⏳ Pendiente |

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
- Escríbelas para que se puedan ejecutar dos veces sin romper nada
  (`if not exists`, `create or replace`, `drop policy if exists`).
