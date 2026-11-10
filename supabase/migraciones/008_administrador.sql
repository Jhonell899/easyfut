-- 008: cuenta de administrador de EasyFut y verificación manual del celular
-- de los rentadores (mientras no esté configurado el código por WhatsApp de Meta).
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.

-- 1. Marca de administrador (nadie puede ponérsela desde la app) -----------
alter table perfiles add column if not exists es_admin boolean not null default false;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and es_admin);
$$;

-- Pon aquí el correo de tu cuenta para dejarla como administradora
update perfiles set es_admin = true
where id = (select id from auth.users where lower(email) = 'TU_CORREO@ejemplo.com');

-- 2. Lista de rentadores para el panel de administración -------------------
create or replace function admin_rentadores()
returns table (id uuid, nombre text, correo text, celular text, telefono_verificado text,
               referencia text, canchas bigint, creado timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select p.id, p.nombre, u.email::text, p.celular, p.telefono_verificado,
           upper(left(replace(p.id::text, '-', ''), 6)),
           (select count(*) from canchas c where c.dueno_id = p.id),
           p.created_at
    from perfiles p join auth.users u on u.id = p.id
    where p.rol = 'dueno'
    order by (p.telefono_verificado is not null), p.created_at desc;
end $$;
revoke execute on function admin_rentadores() from public, anon;
grant execute on function admin_rentadores() to authenticated;

-- 3. Marcar / quitar el celular verificado ----------------------------------
create or replace function admin_verificar_telefono(p_id uuid, p_celular text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := right(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), 9);
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if v !~ '^9[0-9]{8}$' then raise exception 'celular_invalido'; end if;
  if exists (select 1 from perfiles where telefono_verificado = v and id <> p_id) then
    raise exception 'celular_en_uso';
  end if;
  update perfiles set telefono_verificado = v, celular = v where id = p_id;
end $$;
revoke execute on function admin_verificar_telefono(uuid, text) from public, anon;
grant execute on function admin_verificar_telefono(uuid, text) to authenticated;

create or replace function admin_quitar_verificacion(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update perfiles set telefono_verificado = null where id = p_id;
end $$;
revoke execute on function admin_quitar_verificacion(uuid) from public, anon;
grant execute on function admin_quitar_verificacion(uuid) to authenticated;
