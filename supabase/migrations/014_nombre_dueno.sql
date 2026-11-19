-- 014: el nombre del dueño se muestra siempre en la página de su cancha.
-- Antes solo aparecía si tenía el WhatsApp aprobado. Ahora:
--   · nombre  → siempre
--   · celular → solo si el WhatsApp está aprobado (si no, queda vacío)
-- Ejecutar una sola vez en SQL Editor → Run.

drop function if exists contacto_cancha(uuid);
create function contacto_cancha(p_cancha_id uuid)
returns table (nombre text, celular text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.telefono_verificado
  from canchas c join perfiles p on p.id = c.dueno_id
  where c.id = p_cancha_id and c.activa;
$$;
grant execute on function contacto_cancha(uuid) to anon, authenticated;
