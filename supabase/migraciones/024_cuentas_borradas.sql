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
--
-- Funciones nuevas: borrar_cuenta_de_acceso (disparador), liberar_cuenta_borrada.
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

comment on function borrar_cuenta_de_acceso() is
  'Disparador: al borrar una fila de usuarios borra su cuenta de acceso (auth.users), para que ya no pueda entrar.';
comment on function liberar_cuenta_borrada() is
  'Al entrar: si la cuenta ya no tiene fila en usuarios, la borra y devuelve true (su correo queda libre).';

commit;

notify pgrst, 'reload schema';
