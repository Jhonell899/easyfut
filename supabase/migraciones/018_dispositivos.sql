-- 018: verificación en dos pasos por dispositivo, con token único e IP registrada.
--   · Al confirmar con el correo (enlace o código), el servidor crea un TOKEN ÚNICO
--     al azar para ese dispositivo. En la base solo se guarda su huella (SHA-256),
--     nunca el token. El token vive en una cookie que la página no puede leer.
--   · Se guardan la IP y el navegador al confiar en el dispositivo y cada vez que
--     cambia la IP, para revisarlos en /admin si hace falta.
--   · Límites: la base solo se actualiza cada 15 minutos (o si cambia la IP), y como
--     máximo 5 dispositivos nuevos por hora por cuenta.
--   · La confianza dura 30 días; después se vuelve a pedir el correo.
-- Ejecutar una sola vez en SQL Editor → Run.

create extension if not exists pgcrypto with schema extensions;

-- 1. Dispositivos de confianza --------------------------------------------------------
create table if not exists dispositivos_confiables (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  creado      timestamptz not null default now(),
  ultimo_uso  timestamptz not null default now(),
  ip_inicial  text,
  ip_ultima   text,
  agente      text,
  revocado    boolean not null default false
);
create index if not exists dispositivos_usuario_idx on dispositivos_confiables (usuario_id, creado desc);

-- 2. Registro de accesos (para análisis del administrador) ---------------------------
create table if not exists registro_accesos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  dispositivo_id uuid references dispositivos_confiables(id) on delete set null,
  evento         text not null check (evento in ('confiado', 'ip_nueva', 'revocado', 'limite')),
  ip             text,
  agente         text,
  created_at     timestamptz not null default now()
);
create index if not exists registro_accesos_idx on registro_accesos (created_at desc);
create index if not exists registro_accesos_usuario_idx on registro_accesos (usuario_id, created_at desc);

-- Sin políticas: nadie lee ni escribe estas tablas directamente, solo con las funciones
alter table dispositivos_confiables enable row level security;
alter table registro_accesos enable row level security;

-- Recorta textos que vienen del navegador
create or replace function texto_corto(p text, n int) returns text
language sql immutable as $$ select nullif(left(trim(coalesce(p, '')), n), '') $$;

create or replace function huella_token(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- ¿La sesión actual empezó con el correo (enlace o código) hace menos de 10 minutos?
create or replace function sesion_con_codigo_reciente() returns boolean
language sql stable as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'email')
      and (a ->> 'timestamp')::bigint > extract(epoch from now()) - 600
  );
$$;

-- 3. Confiar en este dispositivo: devuelve un token nuevo (solo esta vez) -------------
--    Errores: sin_sesion, requiere_codigo, demasiados_intentos
create or replace function confiar_dispositivo(p_ip text, p_agente text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text;
  v_id    uuid;
  v_ip    text := texto_corto(p_ip, 64);
  v_ag    text := texto_corto(p_agente, 300);
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if not sesion_con_codigo_reciente() then raise exception 'requiere_codigo'; end if;

  if (select count(*) from registro_accesos
      where usuario_id = auth.uid() and evento = 'confiado' and created_at > now() - interval '1 hour') >= 5 then
    insert into registro_accesos (usuario_id, evento, ip, agente) values (auth.uid(), 'limite', v_ip, v_ag);
    raise exception 'demasiados_intentos';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into dispositivos_confiables (usuario_id, token_hash, ip_inicial, ip_ultima, agente)
  values (auth.uid(), huella_token(v_token), v_ip, v_ip, v_ag)
  returning id into v_id;

  insert into registro_accesos (usuario_id, dispositivo_id, evento, ip, agente)
  values (auth.uid(), v_id, 'confiado', v_ip, v_ag);

  return v_token;
end $$;
revoke execute on function confiar_dispositivo(text, text) from public, anon;
grant execute on function confiar_dispositivo(text, text) to authenticated;

-- 4. ¿Este token es de un dispositivo de confianza del usuario actual? -----------------
--    Para no escribir en cada visita: solo actualiza si pasaron 15 minutos o cambió la IP.
create or replace function dispositivo_confiable(p_token text, p_ip text, p_agente text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  d  dispositivos_confiables%rowtype;
  v_ip text := texto_corto(p_ip, 64);
begin
  if auth.uid() is null or coalesce(p_token, '') = '' then return false; end if;

  select * into d from dispositivos_confiables
   where usuario_id = auth.uid()
     and token_hash = huella_token(p_token)
     and not revocado
     and creado > now() - interval '30 days';
  if not found then return false; end if;

  if v_ip is not null and v_ip is distinct from d.ip_ultima then
    update dispositivos_confiables set ip_ultima = v_ip, ultimo_uso = now() where id = d.id;
    -- Una sola anotación por IP nueva y hora, para no llenar el registro
    if not exists (select 1 from registro_accesos
                   where dispositivo_id = d.id and evento = 'ip_nueva' and ip = v_ip
                     and created_at > now() - interval '1 hour') then
      insert into registro_accesos (usuario_id, dispositivo_id, evento, ip, agente)
      values (auth.uid(), d.id, 'ip_nueva', v_ip, texto_corto(p_agente, 300));
    end if;
  elsif d.ultimo_uso < now() - interval '15 minutes' then
    update dispositivos_confiables set ultimo_uso = now() where id = d.id;
  end if;

  return true;
end $$;
revoke execute on function dispositivo_confiable(text, text, text) from public, anon;
grant execute on function dispositivo_confiable(text, text, text) to authenticated;

-- 5. Administración ----------------------------------------------------------------------
create or replace function admin_dispositivos()
returns table (id uuid, correo text, nombre text, creado timestamptz, ultimo_uso timestamptz,
               ip_inicial text, ip_ultima text, agente text, revocado boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select d.id, u.email::text, p.nombre, d.creado, d.ultimo_uso, d.ip_inicial, d.ip_ultima, d.agente,
           d.revocado or d.creado <= now() - interval '30 days'
    from dispositivos_confiables d
    join auth.users u on u.id = d.usuario_id
    left join perfiles p on p.id = d.usuario_id
    order by d.ultimo_uso desc
    limit 300;
end $$;
revoke execute on function admin_dispositivos() from public, anon;
grant execute on function admin_dispositivos() to authenticated;

create or replace function admin_accesos()
returns table (id uuid, cuando timestamptz, correo text, evento text, ip text, agente text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.id, r.created_at, u.email::text, r.evento, r.ip, r.agente
    from registro_accesos r
    join auth.users u on u.id = r.usuario_id
    order by r.created_at desc
    limit 300;
end $$;
revoke execute on function admin_accesos() from public, anon;
grant execute on function admin_accesos() to authenticated;

create or replace function admin_revocar_dispositivo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d dispositivos_confiables%rowtype;
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update dispositivos_confiables set revocado = true where id = p_id returning * into d;
  if found then
    insert into registro_accesos (usuario_id, dispositivo_id, evento, ip)
    values (d.usuario_id, d.id, 'revocado', d.ip_ultima);
  end if;
end $$;
revoke execute on function admin_revocar_dispositivo(uuid) from public, anon;
grant execute on function admin_revocar_dispositivo(uuid) to authenticated;
