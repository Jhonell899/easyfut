-- 016: política de cancelación por cancha.
-- El dueño elige una de tres opciones fijas: flexible, moderada o estricta.
-- Ejecutar DESPUÉS de la 015, una sola vez, en SQL Editor → Run.

-- Por si la 015 aún no se ejecutó (no hace daño si ya existe)
alter table canchas add column if not exists pagos_cambiado_en timestamptz;

alter table canchas add column if not exists politica_cancelacion text not null default 'moderada';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'canchas_politica_valida') then
    alter table canchas add constraint canchas_politica_valida
      check (politica_cancelacion in ('flexible', 'moderada', 'estricta'));
  end if;
end $$;

-- La 015 limita qué columnas se pueden editar: se agrega la nueva
grant update (politica_cancelacion) on canchas to authenticated;

-- La página de la reserva también muestra la política
drop function if exists obtener_reserva(text);
create function obtener_reserva(p_codigo text)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz,
               monto numeric, cancha_nombre text, direccion text, expira_en timestamptz,
               cancha_id uuid, cancha_slug text, nombre_cliente text,
               pagos jsonb, dueno_nombre text, dueno_celular text, pago_avisado_en timestamptz,
               pagos_cambiado_en timestamptz, politica_cancelacion text)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto,
         c.nombre, c.direccion, r.expira_en,
         c.id, c.slug, r.nombre_cliente,
         c.pagos, p.nombre, coalesce(p.telefono_verificado, p.celular), r.pago_avisado_en,
         c.pagos_cambiado_en, c.politica_cancelacion
  from reservas r
  join canchas c on c.id = r.cancha_id
  left join perfiles p on p.id = c.dueno_id
  where r.codigo = upper(trim(p_codigo));
$$;
grant execute on function obtener_reserva(text) to anon, authenticated;
