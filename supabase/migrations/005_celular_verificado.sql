-- 005: el rentador debe verificar su celular (código por SMS) para publicar
-- canchas, y ese número se muestra público en la página de la cancha.
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.

-- 1. Número verificado (9 dígitos). Solo lo escribe el sistema al confirmar el
--    código SMS; el usuario no puede editarlo (los permisos de 002 solo dejan
--    cambiar nombre y celular de contacto).
alter table perfiles add column if not exists telefono_verificado text;

-- 2. Cuando Supabase Auth confirma el teléfono, se copia al perfil ------------
create or replace function sincronizar_telefono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and coalesce(new.phone, '') <> '' then
    update perfiles
       set telefono_verificado = right(regexp_replace(new.phone, '\D', '', 'g'), 9)
     where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_phone_confirmed on auth.users;
create trigger on_auth_phone_confirmed
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function sincronizar_telefono();

-- Cuentas que ya tenían el teléfono confirmado
update perfiles p
   set telefono_verificado = right(regexp_replace(u.phone, '\D', '', 'g'), 9)
  from auth.users u
 where u.id = p.id and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';

create or replace function telefono_verificado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and telefono_verificado is not null);
$$;

-- 3. Para crear o tener publicada una cancha hace falta el celular verificado.
--    (Pausar una cancha siempre se puede.)
drop policy if exists canchas_dueno on canchas;
drop policy if exists canchas_dueno_ver on canchas;
drop policy if exists canchas_dueno_crear on canchas;
drop policy if exists canchas_dueno_editar on canchas;
drop policy if exists canchas_dueno_borrar on canchas;

create policy canchas_dueno_ver on canchas
  for select using (dueno_id = auth.uid());

create policy canchas_dueno_crear on canchas
  for insert with check (dueno_id = auth.uid() and es_dueno() and telefono_verificado());

create policy canchas_dueno_editar on canchas
  for update
  using (dueno_id = auth.uid() and es_dueno())
  with check (dueno_id = auth.uid() and es_dueno() and (not activa or telefono_verificado()));

create policy canchas_dueno_borrar on canchas
  for delete using (dueno_id = auth.uid() and es_dueno());

-- 4. Contacto público del dueño (solo si verificó su número) -----------------
create or replace function contacto_cancha(p_cancha_id uuid)
returns table (nombre text, celular text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.telefono_verificado
  from canchas c join perfiles p on p.id = c.dueno_id
  where c.id = p_cancha_id and c.activa and p.telefono_verificado is not null;
$$;
grant execute on function contacto_cancha(uuid) to anon, authenticated;
