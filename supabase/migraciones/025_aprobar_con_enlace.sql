-- =============================================================================
-- 025 · Confirmar con un toque en el enlace del correo, desde cualquier dispositivo
--
-- Con el correo de Supabase (sin SMTP propio) el correo trae solo un enlace, sin
-- código. Esta migración hace que ese enlace funcione aunque se abra en OTRO
-- dispositivo (por ejemplo, te registras en la computadora y abres el correo en
-- el celular):
--
-- · Crear cuenta: la pantalla donde te registraste espera sola. Cuando tocas el
--   enlace (donde sea), detecta que el correo quedó confirmado, entra y deja ese
--   dispositivo de confianza. No hace falta un segundo correo.
-- · Entrar desde un dispositivo nuevo: se crea una "solicitud de ingreso" con los
--   datos de ese dispositivo (navegador e IP). El enlace del correo pregunta
--   "¿Eres tú?" y muestra esos datos. Si apruebas, la pantalla que esperaba entra
--   sola; si dices "No fui yo", ese ingreso queda bloqueado.
-- · La pantalla que espera guarda un secreto de un solo uso; en la base solo se
--   guarda su huella. La solicitud se aprueba solo con la sesión que da el enlace
--   del correo (prueba de que eres el dueño del correo).
-- · Cada solicitud vence: 30 minutos (dispositivo nuevo) o 24 horas (crear cuenta).
--   Pedir una nueva anula las anteriores que seguían pendientes.
--
-- Tabla nueva: aprobaciones_ingreso.
-- Funciones nuevas: estado_de_aprobacion, emitir_token_dispositivo (interna),
--   pedir_aprobacion_ingreso, estado_aprobacion, ver_aprobacion, aprobar_ingreso,
--   confiar_dispositivo_aprobado.
-- Cambian: handle_new_user (guarda la huella del registro), confiar_dispositivo
--   (misma regla, ahora usa emitir_token_dispositivo).
-- Requiere la 018 y la 019. Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Solicitudes de ingreso -------------------------------------------------------
create table if not exists aprobaciones_ingreso (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  motivo        text not null check (motivo in ('registro', 'dispositivo')),
  secreto_hash  text not null unique,
  ip            text,
  agente        text,
  creada        timestamptz not null default now(),
  vence         timestamptz not null,
  aprobada_en   timestamptz,
  rechazada_en  timestamptz,
  usada_en      timestamptz
);
create index if not exists aprobaciones_ingreso_usuario_idx on aprobaciones_ingreso (usuario_id, creada desc);
-- Sin políticas: nadie la lee ni escribe directamente, solo con las funciones de abajo
alter table aprobaciones_ingreso enable row level security;

comment on table aprobaciones_ingreso is
  'Ingresos que esperan que el dueño del correo toque el enlace (crear cuenta o entrar desde un dispositivo nuevo).';
comment on column aprobaciones_ingreso.secreto_hash is 'Huella del secreto que guarda la pantalla que espera (nunca el secreto).';
comment on column aprobaciones_ingreso.motivo is 'registro = crear cuenta; dispositivo = entrar desde un dispositivo nuevo.';

-- Navegador de quien llama (Supabase lo envía en las cabeceras)
create or replace function agente_solicitud() returns text
language sql stable as $$
  select texto_corto(current_setting('request.headers', true)::json ->> 'user-agent', 300);
$$;

-- pendiente · aprobada · usada · rechazada · vencida
create or replace function estado_de_aprobacion(a aprobaciones_ingreso) returns text
language sql stable security definer set search_path = public, auth as $$
  select case
    when a.rechazada_en is not null then 'rechazada'
    when a.usada_en is not null then 'usada'
    when a.vence < now() then 'vencida'
    -- Crear cuenta: queda aprobada cuando el correo se confirma con el enlace
    when a.motivo = 'registro' then
      case when exists (select 1 from auth.users u where u.id = a.usuario_id and u.email_confirmed_at is not null)
           then 'aprobada' else 'pendiente' end
    when a.aprobada_en is not null then 'aprobada'
    else 'pendiente'
  end;
$$;
revoke execute on function estado_de_aprobacion(aprobaciones_ingreso) from public, anon, authenticated;

-- 2. Crear cuenta: la huella del secreto viaja en el registro ----------------------
--    (handle_new_user de la 019 + la solicitud; si esa parte falla, el registro sigue igual)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_huella text;
begin
  insert into usuarios (id, nombre, celular, rol)
  values (
    new.id,
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'celular',
    case when new.raw_user_meta_data->>'rol' = 'dueno' then 'dueno' else 'cliente' end
  );

  v_huella := new.raw_user_meta_data->>'huella_espera';
  if v_huella ~ '^[0-9a-f]{64}$' then
    begin
      insert into aprobaciones_ingreso (usuario_id, motivo, secreto_hash, vence)
      values (new.id, 'registro', v_huella, now() + interval '24 hours');
    exception when others then
      null; -- sin solicitud, la pantalla que espera pide entrar con la contraseña
    end;
  end if;
  return new;
end $$;

-- 3. Dar el token de dispositivo de confianza (interna) ----------------------------
--    Mismo cuerpo que confiar_dispositivo de la 019, sin la revisión de la sesión.
create or replace function emitir_token_dispositivo(p_ip text, p_agente text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text;
  v_id    uuid;
  v_ip    text := texto_corto(p_ip, 64);
  v_ag    text := texto_corto(p_agente, 300);
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;

  if (select count(*) from historial_accesos
      where usuario_id = auth.uid() and evento = 'confiado' and created_at > now() - interval '1 hour') >= 5 then
    insert into historial_accesos (usuario_id, evento, ip, agente) values (auth.uid(), 'limite', v_ip, v_ag);
    raise exception 'demasiados_intentos';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into dispositivos_confiables (usuario_id, token_hash, ip_inicial, ip_ultima, agente)
  values (auth.uid(), huella_token(v_token), v_ip, v_ip, v_ag)
  returning id into v_id;

  insert into historial_accesos (usuario_id, dispositivo_id, evento, ip, agente)
  values (auth.uid(), v_id, 'confiado', v_ip, v_ag);

  return v_token;
end $$;
revoke execute on function emitir_token_dispositivo(text, text) from public, anon, authenticated;

-- confiar_dispositivo: igual que antes (solo justo después de entrar con el enlace)
create or replace function confiar_dispositivo(p_ip text, p_agente text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if not sesion_con_codigo_reciente() then raise exception 'requiere_codigo'; end if;
  return emitir_token_dispositivo(p_ip, p_agente);
end $$;
revoke execute on function confiar_dispositivo(text, text) from public, anon;
grant execute on function confiar_dispositivo(text, text) to authenticated;

-- 4. Entrar desde un dispositivo nuevo: pedir la aprobación -------------------------
--    Con la sesión de la contraseña. Devuelve el secreto SOLO esta vez.
--    Errores: sin_sesion, demasiados_intentos
create or replace function pedir_aprobacion_ingreso()
returns table (solicitud uuid, secreto text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secreto text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id      uuid;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;

  delete from aprobaciones_ingreso where creada < now() - interval '7 days';
  if (select count(*) from aprobaciones_ingreso
       where usuario_id = auth.uid() and motivo = 'dispositivo'
         and creada > now() - interval '1 hour') >= 8 then
    raise exception 'demasiados_intentos';
  end if;

  -- Una sola solicitud pendiente a la vez: las anteriores vencen
  update aprobaciones_ingreso
     set vence = least(vence, now())
   where usuario_id = auth.uid() and motivo = 'dispositivo'
     and aprobada_en is null and rechazada_en is null and usada_en is null;

  insert into aprobaciones_ingreso (usuario_id, motivo, secreto_hash, ip, agente, vence)
  values (auth.uid(), 'dispositivo', huella_token(v_secreto), ip_solicitud(), agente_solicitud(),
          now() + interval '30 minutes')
  returning id into v_id;

  return query select v_id, v_secreto;
end $$;
revoke execute on function pedir_aprobacion_ingreso() from public, anon;
grant execute on function pedir_aprobacion_ingreso() to authenticated;

-- 5. La pantalla que espera pregunta cómo va (con su secreto) -----------------------
create or replace function estado_aprobacion(p_secreto text)
returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  a aprobaciones_ingreso%rowtype;
begin
  if coalesce(p_secreto, '') !~ '^[0-9a-f]{64}$' then return 'no_existe'; end if;
  select * into a from aprobaciones_ingreso where secreto_hash = huella_token(p_secreto);
  if not found then return 'no_existe'; end if;
  return estado_de_aprobacion(a);
end $$;
revoke execute on function estado_aprobacion(text) from public;
grant execute on function estado_aprobacion(text) to anon, authenticated;

-- 6. La página del enlace: ver la solicitud y aprobarla o rechazarla ----------------
--    Solo el dueño de la cuenta, con la sesión que acaba de dar el enlace del correo.
create or replace function ver_aprobacion(p_solicitud uuid)
returns table (motivo text, ip text, agente text, creada timestamptz, estado text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  return query
    select a.motivo, a.ip, a.agente, a.creada, estado_de_aprobacion(a)
      from aprobaciones_ingreso a
     where a.id = p_solicitud and a.usuario_id = auth.uid();
end $$;
revoke execute on function ver_aprobacion(uuid) from public, anon;
grant execute on function ver_aprobacion(uuid) to authenticated;

-- p_este_dispositivo = el enlace se abrió en el mismo navegador que pidió entrar:
-- ese navegador ya queda de confianza con el enlace, así que la solicitud se da por usada.
-- Errores: sin_sesion, requiere_codigo, no_existe
create or replace function aprobar_ingreso(p_solicitud uuid, p_aprobar boolean, p_este_dispositivo boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  a aprobaciones_ingreso%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if not sesion_con_codigo_reciente() then raise exception 'requiere_codigo'; end if;

  select * into a from aprobaciones_ingreso
   where id = p_solicitud and usuario_id = auth.uid() and motivo = 'dispositivo'
   for update;
  if not found then raise exception 'no_existe'; end if;
  if estado_de_aprobacion(a) <> 'pendiente' then return estado_de_aprobacion(a); end if;

  if p_aprobar then
    update aprobaciones_ingreso
       set aprobada_en = now(),
           usada_en = case when p_este_dispositivo then now() end
     where id = a.id
    returning * into a;
  else
    update aprobaciones_ingreso set rechazada_en = now() where id = a.id returning * into a;
  end if;
  return estado_de_aprobacion(a);
end $$;
revoke execute on function aprobar_ingreso(uuid, boolean, boolean) from public, anon;
grant execute on function aprobar_ingreso(uuid, boolean, boolean) to authenticated;

-- 7. La pantalla que esperaba entra y queda de confianza ----------------------------
--    Con la sesión de la contraseña y el secreto de una solicitud aprobada (una sola vez).
--    Errores: sin_sesion, sin_aprobacion, demasiados_intentos
create or replace function confiar_dispositivo_aprobado(p_secreto text, p_ip text, p_agente text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  a aprobaciones_ingreso%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if coalesce(p_secreto, '') !~ '^[0-9a-f]{64}$' then raise exception 'sin_aprobacion'; end if;

  select * into a from aprobaciones_ingreso
   where secreto_hash = huella_token(p_secreto) and usuario_id = auth.uid()
   for update;
  if not found or estado_de_aprobacion(a) <> 'aprobada' then raise exception 'sin_aprobacion'; end if;

  update aprobaciones_ingreso set usada_en = now() where id = a.id;
  return emitir_token_dispositivo(p_ip, p_agente);
end $$;
revoke execute on function confiar_dispositivo_aprobado(text, text, text) from public, anon;
grant execute on function confiar_dispositivo_aprobado(text, text, text) to authenticated;

comment on function pedir_aprobacion_ingreso() is
  'Dispositivo nuevo: crea la solicitud de ingreso (vence en 30 min) y devuelve su secreto una sola vez.';
comment on function estado_aprobacion(text) is
  'Pantalla que espera: pendiente, aprobada, usada, rechazada, vencida o no_existe.';
comment on function ver_aprobacion(uuid) is
  'Página del enlace: navegador, IP y estado de la solicitud (solo el dueño de la cuenta).';
comment on function aprobar_ingreso(uuid, boolean, boolean) is
  'Página del enlace: aprueba o rechaza la solicitud. Exige la sesión del enlace del correo.';
comment on function confiar_dispositivo_aprobado(text, text, text) is
  'Pantalla que esperaba: con una solicitud aprobada, este dispositivo queda de confianza (una sola vez).';

commit;

notify pgrst, 'reload schema';
