# 📩 Avisos del banco: recargas que se confirman solas

EasyFut confirma automáticamente una recarga cuando llega la **alerta del banco** a tu correo
y coincide con lo que avisó el dueño. Funciona con un script gratuito de Google que vive en
tu Gmail y no necesita que la app esté publicada.

## Cuándo se confirma sola una recarga

Todo esto debe coincidir:

| Dato | Regla |
|---|---|
| Medio | Yape o BCP, igual al que eligió el dueño |
| Monto | Exactamente el mismo |
| Nombre | El pago viene del **nombre del dueño** (acepta abreviaturas y otro orden) |
| Número | Si la alerta trae celular, es el **mismo celular del dueño**; si trae número de operación, es el **mismo que escribió el dueño** |
| Fecha | El aviso del dueño y el pago están a menos de 2 días |

Si algo no coincide, la recarga queda para que la revises tú en **/admin → Recargas**.

## Pasos (una sola vez)

1. **Activa las alertas por correo en tu banca BCP** para dinero recibido (transferencias y, si
   existe la opción, Yape). Deben llegar al Gmail donde instalarás el script.
2. En EasyFut, entra a **/admin → Recargas → Avisos del banco → Generar clave**. Copia la clave:
   se muestra una sola vez.
3. Abre <https://script.google.com> con ese Gmail → **Nuevo proyecto**.
4. Borra todo y pega el contenido de [`avisos-banco/Codigo.gs`](avisos-banco/Codigo.gs).
5. Arriba del archivo completa:
   - `SUPABASE_URL` y `SUPABASE_ANON_KEY`: los mismos de tu `.env.local` (son públicos).
   - `CLAVE_AVISOS`: la clave del paso 2.
   - En `BUSQUEDAS`, cambia `from:(bcp)` por el remitente real de tus alertas.
6. Guarda, elige la función **`revisarAlertas`** y toca **Ejecutar**. Google te pedirá permiso para
   leer tu Gmail: acéptalo (es tu propio script).
7. Con `SOLO_PRUEBA = true` no envía nada: en **Ejecuciones** verás lo que entendió de cada
   alerta (monto, operación, nombre, celular). Si algo sale `null`, manda un ejemplo de la alerta
   **sin datos personales** para ajustar la lectura.
8. Cuando lea bien, cambia a `SOLO_PRUEBA = false`, guarda y ejecuta **`crearActivador`** una vez.
   Desde ahí revisa tu correo cada 5 minutos.

## Seguridad

- **Cuida la clave de avisos como una contraseña**: con ella se pueden confirmar recargas. No la
  compartas, no la pongas en GitHub ni en chats. Solo va dentro de tu script de Google.
- En la base de datos solo se guarda su huella. Si crees que se filtró, genera otra en /admin y la
  anterior deja de funcionar al instante.
- Cada aviso queda registrado en /admin → Recargas → Avisos del banco, con la recarga que confirmó.
- El script corre en tu cuenta de Google; EasyFut nunca ve tu Gmail.
