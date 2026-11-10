-- 007: el código para verificar el celular del rentador llega por WhatsApp
-- (WhatsApp Cloud API de Meta) en lugar de SMS.
--
-- Cómo funciona: Supabase Auth genera el código y, en vez de mandarlo por SMS,
-- llama a esta función ("Send SMS Hook"). La función se lo manda al número por
-- WhatsApp usando una plantilla de autenticación aprobada por Meta.
--
-- ANTES de ejecutar: guarda tus credenciales de Meta en el Vault (ver la guía
-- supabase/WHATSAPP.md). Ejecutar una sola vez en SQL Editor → Run.

create extension if not exists pg_net;

create or replace function public.enviar_codigo_whatsapp(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token     text;
  v_phone_id  text;
  v_plantilla text;
  v_idioma    text;
  v_telefono  text := regexp_replace(coalesce(event->'user'->>'phone', ''), '\D', '', 'g');
  v_codigo    text := event->'sms'->>'otp';
begin
  select decrypted_secret into v_token     from vault.decrypted_secrets where name = 'whatsapp_token';
  select decrypted_secret into v_phone_id  from vault.decrypted_secrets where name = 'whatsapp_phone_id';
  select decrypted_secret into v_plantilla from vault.decrypted_secrets where name = 'whatsapp_plantilla';
  select decrypted_secret into v_idioma    from vault.decrypted_secrets where name = 'whatsapp_idioma';

  if v_token is null or v_phone_id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 500, 'message', 'whatsapp_no_configurado'));
  end if;
  if v_telefono = '' or v_codigo is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'datos_incompletos'));
  end if;

  -- Plantilla de autenticación: el código va en el cuerpo y en el botón "Copiar código"
  perform net.http_post(
    url     := format('https://graph.facebook.com/v21.0/%s/messages', v_phone_id),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Content-Type',  'application/json'),
    body    := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to',   v_telefono,
      'type', 'template',
      'template', jsonb_build_object(
        'name',     coalesce(v_plantilla, 'codigo_easyfut'),
        'language', jsonb_build_object('code', coalesce(v_idioma, 'es')),
        'components', jsonb_build_array(
          jsonb_build_object('type', 'body', 'parameters',
            jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_codigo))),
          jsonb_build_object('type', 'button', 'sub_type', 'url', 'index', '0', 'parameters',
            jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_codigo)))
        )
      )
    )
  );

  return '{}'::jsonb;
end $$;

-- Solo Supabase Auth puede llamarla
grant usage on schema public to supabase_auth_admin;
grant execute on function public.enviar_codigo_whatsapp(jsonb) to supabase_auth_admin;
revoke execute on function public.enviar_codigo_whatsapp(jsonb) from public, anon, authenticated;

-- Para revisar si Meta aceptó los envíos (status_code 200 = enviado):
--   select id, status_code, content, created from net._http_response order by created desc limit 5;
