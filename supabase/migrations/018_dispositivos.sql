-- 018: verificación en dos pasos al entrar desde un dispositivo nuevo.
--   · Cada celular o computadora recibe un identificador al azar.
--   · Un dispositivo solo queda "de confianza" justo después de entrar con un
--     código enviado al correo (no basta con la contraseña).
--   · La confianza dura 30 días; después se vuelve a pedir el código.
-- Ejecutar una sola vez en SQL Editor → Run.

create table if not exists dispositivos_confiables (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dispositivo text not null check (char_length(dispositivo) between 20 and 100),
  creado      timestamptz not null default now(),
  ultimo_uso  timestamptz not null default now(),
  primary key (usuario_id, dispositivo)
);

-- Sin políticas: nadie lee ni escribe la tabla directamente, solo con las funciones
alter table dispositivos_confiables enable row level security;

-- ¿La sesión actual empezó con un código de correo hace menos de 10 minutos?
create or replace function sesion_con_codigo_reciente() returns boolean
language sql stable as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'email')
      and (a ->> 'timestamp')::bigint > extract(epoch from now()) - 600
  );
$$;

-- Marcar este dispositivo como de confianza (solo tras entrar con código)
create or replace function confiar_dispositivo(p_dispositivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if not sesion_con_codigo_reciente() then raise exception 'requiere_codigo'; end if;
  insert into dispositivos_confiables (usuario_id, dispositivo)
  values (auth.uid(), p_dispositivo)
  on conflict (usuario_id, dispositivo)
    do update set creado = now(), ultimo_uso = now();
end $$;
revoke execute on function confiar_dispositivo(text) from public, anon;
grant execute on function confiar_dispositivo(text) to authenticated;

-- ¿Este dispositivo es de confianza para el usuario actual? (válido 30 días)
create or replace function dispositivo_confiable(p_dispositivo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v boolean;
begin
  if auth.uid() is null or p_dispositivo is null then return false; end if;
  update dispositivos_confiables
     set ultimo_uso = now()
   where usuario_id = auth.uid() and dispositivo = p_dispositivo
     and creado > now() - interval '30 days';
  v := found;
  return v;
end $$;
revoke execute on function dispositivo_confiable(text) from public, anon;
grant execute on function dispositivo_confiable(text) to authenticated;

-- Cerrar sesión en todos los demás dispositivos: olvida todos menos el actual
create or replace function olvidar_dispositivos(p_actual text) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  delete from dispositivos_confiables
   where usuario_id = auth.uid() and dispositivo is distinct from p_actual;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function olvidar_dispositivos(text) from public, anon;
grant execute on function olvidar_dispositivos(text) to authenticated;
