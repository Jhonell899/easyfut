-- =============================================================================
-- 024 · Una cuenta borrada ya no puede entrar
--
-- El correo y la contraseña viven en auth.users (Authentication → Users); los datos
-- de la persona, en usuarios. Antes, borrar filas de usuarios dejaba viva la cuenta
-- de acceso: con la misma contraseña se seguía entrando y se mandaba el código.
--
-- · Borrar a alguien de usuarios ahora borra también su cuenta de acceso.
-- · Si ya hay cuentas sin datos (borradas antes de esta migración), al intentar
--   entrar se borran y su correo queda libre para registrarse de nuevo.
-- · El login puede preguntar si un correo tiene cuenta, para decir "No tienes
--   cuenta, ¿quieres crear una?". Máximo 20 consultas cada 10 minutos por conexión.
--   Las cuentas solo se crean desde Registrarse.
--
-- Tabla nueva: consultas_correo (límite de consultas por conexión).
-- Funciones nuevas: borrar_cuenta_de_acceso (disparador), liberar_cuenta_borrada,
-- correo_tiene_cuenta. Usa ip_solicitud() de la 009.
-- Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Borrar a alguien de usuarios borra su cuenta de acceso -----------------------
create or replace function borrar_cuenta_de_acceso() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  -- Si el borrado vino de auth.users (Authentication → Users), la fila ya no está
  -- y esto no hace nada.
  delete from auth.users where id = old.id;
  return old;
end $$;
revoke execute on function borrar_cuenta_de_acceso() from public, anon, authenticated;

drop trigger if exists al_borrar_usuario on usuarios;
create trigger al_borrar_usuario
  after delete on usuarios
  for each row execute function borrar_cuenta_de_acceso();

-- 2. Cuenta sin datos: se borra al intentar entrar ----------------------------------
--    Solo borra la cuenta de quien llama, y solo si ya no tiene fila en usuarios
--    (toda cuenta nueva recibe su fila al registrarse, en la misma operación).
create or replace function liberar_cuenta_borrada() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_borradas int;
begin
  if auth.uid() is null then
    return false;
  end if;
  delete from auth.users u
   where u.id = auth.uid()
     and not exists (select 1 from usuarios p where p.id = u.id);
  get diagnostics v_borradas = row_count;
  return v_borradas > 0;
end $$;
revoke execute on function liberar_cuenta_borrada() from public, anon;
grant execute on function liberar_cuenta_borrada() to authenticated;

-- 3. ¿Este correo tiene cuenta? (para el login) -----------------------------------
--    Cuenta = correo verificado y con datos en usuarios. Errores: demasiados_intentos
create table if not exists consultas_correo (
  id      bigint generated always as identity primary key,
  ip      text not null,
  creado  timestamptz not null default now()
);
create index if not exists consultas_correo_ip_idx on consultas_correo (ip, creado desc);
-- Sin políticas: solo la función de abajo la usa
alter table consultas_correo enable row level security;

create or replace function correo_tiene_cuenta(p_correo text) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_ip text := coalesce(left(ip_solicitud(), 64), 'desconocida');
begin
  delete from consultas_correo where creado < now() - interval '1 day';
  if (select count(*) from consultas_correo
       where ip = v_ip and creado > now() - interval '10 minutes') >= 20 then
    raise exception 'demasiados_intentos';
  end if;
  insert into consultas_correo (ip) values (v_ip);

  return exists (
    select 1
      from auth.users u
      join usuarios p on p.id = u.id
     where lower(u.email) = lower(trim(coalesce(p_correo, '')))
       and u.email_confirmed_at is not null
  );
end $$;
revoke execute on function correo_tiene_cuenta(text) from public;
grant execute on function correo_tiene_cuenta(text) to anon, authenticated;

comment on function borrar_cuenta_de_acceso() is
  'Disparador: al borrar una fila de usuarios borra su cuenta de acceso (auth.users), para que ya no pueda entrar.';
comment on function liberar_cuenta_borrada() is
  'Al entrar: si la cuenta ya no tiene fila en usuarios, la borra y devuelve true (su correo queda libre).';
comment on function correo_tiene_cuenta(text) is
  'Login: true si el correo tiene una cuenta verificada con datos. Máximo 20 consultas cada 10 minutos por conexión.';
comment on table consultas_correo is
  'Consultas de correo_tiene_cuenta por conexión (IP), para limitarlas. Se borran al día.';

commit;

notify pgrst, 'reload schema';
