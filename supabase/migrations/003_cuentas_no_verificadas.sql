-- 003: una cuenta que nunca verificó su correo no cuenta como existente.
-- Ejecutar una sola vez en Supabase → SQL Editor (ya aplicada).

-- Borra el registro sin verificar de un correo (las cuentas verificadas nunca se tocan).
create or replace function liberar_correo_no_verificado(p_correo text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_borradas int;
begin
  delete from auth.users
  where lower(email) = lower(trim(p_correo))
    and email_confirmed_at is null;
  get diagnostics v_borradas = row_count;
  return v_borradas > 0;
end $$;

revoke execute on function liberar_correo_no_verificado(text) from public;
grant execute on function liberar_correo_no_verificado(text) to anon, authenticated;

-- Limpieza única: borra los registros que quedaron sin verificar.
delete from auth.users where email_confirmed_at is null;

-- Opcional (requiere la extensión pg_cron): cada hora borra registros sin verificar de más de 24 h.
-- select cron.schedule(
--   'borrar-cuentas-no-verificadas',
--   '0 * * * *',
--   $$ delete from auth.users
--      where email_confirmed_at is null
--        and created_at < now() - interval '24 hours' $$
-- );
