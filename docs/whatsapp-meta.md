# Código de verificación por WhatsApp

Supabase Auth genera el código del rentador y, gracias al **Send SMS Hook**,
en vez de mandarlo por SMS llama a la función `enviar_codigo_whatsapp`
(migración 007), que lo envía por la **WhatsApp Cloud API** de Meta.

## 1. Meta (WhatsApp Cloud API)

1. Entra a <https://developers.facebook.com> → **Mis apps → Crear app** → tipo **Empresa** →
   agrega el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API** verás:
   - un **número de prueba** gratuito (envía hasta a 5 números que tú registres),
   - el **Identificador del número de teléfono** (Phone number ID) → lo necesitas,
   - un **token de acceso temporal** (dura 24 h; sirve para probar).
3. En **"Para"**, agrega y verifica tu propio celular como destinatario de prueba.
4. **Plantilla**: en **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**:
   - Categoría: **Autenticación**
   - Nombre: `codigo_easyfut`
   - Idioma: **Español** (`es`)
   - Tipo de código: **Copiar código**
   - Envíala y espera la aprobación (suele tardar minutos).
5. Para producción: crea un **usuario del sistema** en el Business Manager y genera un
   **token permanente** con permiso `whatsapp_business_messaging`, y registra tu número real.
   Meta cobra cada mensaje de autenticación (revisa la tarifa para Perú en su web).

## 2. Guardar las credenciales en el Vault de Supabase

En **SQL Editor** ejecuta (reemplaza los valores; **no los compartas con nadie**):

```sql
select vault.create_secret('TU_TOKEN_DE_META', 'whatsapp_token');
select vault.create_secret('TU_PHONE_NUMBER_ID', 'whatsapp_phone_id');
-- Opcionales (por defecto: codigo_easyfut / es)
select vault.create_secret('codigo_easyfut', 'whatsapp_plantilla');
select vault.create_secret('es', 'whatsapp_idioma');
```

Para cambiar un valor más adelante (por ejemplo, cuando el token temporal venza):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'whatsapp_token'),
  'NUEVO_TOKEN'
);
```

## 3. Ejecutar la migración

Ejecuta `supabase/migraciones/pausadas/007_codigo_por_whatsapp.sql` en el SQL Editor.

## 4. Activar en Supabase

1. **Authentication → Sign In / Providers → Phone** → actívalo (no hace falta Twilio).
2. **Authentication → Hooks → Send SMS hook** → **Enable** →
   tipo **Postgres** → schema `public` → función `enviar_codigo_whatsapp` → **Save**.

## 5. Probar

En la app, entra como rentador a **Mi panel → Verifica tu celular** → escribe tu
número (el que agregaste en Meta) → **Enviarme un código por WhatsApp**.

¿No llegó? Revisa la respuesta de Meta:

```sql
select status_code, content, created
from net._http_response order by created desc limit 5;
```

- `401` → token vencido o incorrecto.
- `131030` → el número no está en tu lista de destinatarios de prueba.
- `132001` → la plantilla no existe, no está aprobada o el idioma no coincide.
