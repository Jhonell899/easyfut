-- 006: pagos con Yape / Plin / transferencia, confirmados por el dueño.
-- 1) El cliente tiene 15 minutos para pagar y pulsar "Ya pagué" (avisa al dueño
--    por WhatsApp). Si no lo hace, la reserva vence y el horario se libera.
-- 2) Desde que avisa que pagó, la reserva YA NO VENCE: queda separada hasta que
--    el dueño la confirme o diga que no recibió el pago.
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.

-- Por si la 005 aún no se ejecutó
alter table perfiles add column if not exists telefono_verificado text;

-- 1. Medios de pago de cada cancha (públicos: el cliente los necesita para pagar)
--    {"yape":"987654321","plin":"987654321","titular":"Juan Pérez",
--     "banco":"BCP","cuenta":"191-...","cci":"002-...","qr":"https://..."}
alter table canchas add column if not exists pagos jsonb not null default '{}'::jsonb;

-- Momento en que el cliente avisó que ya pagó
alter table reservas add column if not exists pago_avisado_en timestamptz;

-- 2. Vencimiento automático sin depender de pg_cron -------------------------
--    Antes de guardar cualquier reserva nueva, las pendientes vencidas que
--    se crucen con ella pasan a 'expirada' y liberan el horario.
create or replace function liberar_pendientes_vencidas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update reservas
     set estado = 'expirada'
   where cancha_id = new.cancha_id
     and estado = 'pendiente'
     and expira_en < now()
     and tstzrange(inicio, fin, '[)') && tstzrange(new.inicio, new.fin, '[)');
  return new;
end $$;

drop trigger if exists antes_de_reservar on reservas;
create trigger antes_de_reservar
  before insert on reservas
  for each row execute function liberar_pendientes_vencidas();

-- Nadie puede confirmar una reserva que venció sin que el cliente avisara el pago
create or replace function validar_confirmacion() returns trigger
language plpgsql as $$
begin
  if old.estado = 'pendiente' and new.estado = 'confirmada'
     and old.expira_en is not null and old.expira_en < now() then
    raise exception 'reserva_vencida';
  end if;
  return new;
end $$;

drop trigger if exists al_confirmar on reservas;
create trigger al_confirmar
  before update of estado on reservas
  for each row execute function validar_confirmacion();

-- El cliente avisa "Ya pagué": deja de vencer y queda esperando al dueño
create or replace function avisar_pago(p_codigo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v reservas%rowtype;
begin
  select * into v from reservas where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'reserva_no_existe'; end if;
  if v.estado <> 'pendiente' then return v.estado = 'confirmada'; end if;
  if v.pago_avisado_en is not null then return true; end if;
  if v.expira_en is not null and v.expira_en < now() then
    update reservas set estado = 'expirada' where id = v.id;
    raise exception 'reserva_vencida';
  end if;
  update reservas set pago_avisado_en = now(), expira_en = null where id = v.id;
  return true;
end $$;
grant execute on function avisar_pago(text) to anon, authenticated;

-- Los horarios ocupados ya no cuentan pendientes vencidas
create or replace function horarios_ocupados(p_cancha_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = public as $$
  select r.inicio, r.fin
  from reservas r
  join canchas c on c.id = r.cancha_id and c.activa
  where r.cancha_id = p_cancha_id
    and r.estado in ('pendiente','confirmada','bloqueo')
    and not (r.estado = 'pendiente' and r.expira_en < now())
    and r.inicio < p_hasta
    and r.fin > p_desde;
$$;

-- 3. La página de la reserva trae lo necesario para pagar y avisar al dueño --
drop function if exists obtener_reserva(text);
create function obtener_reserva(p_codigo text)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz,
               monto numeric, cancha_nombre text, direccion text, expira_en timestamptz,
               cancha_id uuid, cancha_slug text, nombre_cliente text,
               pagos jsonb, dueno_nombre text, dueno_celular text, pago_avisado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto,
         c.nombre, c.direccion, r.expira_en,
         c.id, c.slug, r.nombre_cliente,
         c.pagos, p.nombre, coalesce(p.telefono_verificado, p.celular), r.pago_avisado_en
  from reservas r
  join canchas c on c.id = r.cancha_id
  left join perfiles p on p.id = c.dueno_id
  where r.codigo = upper(trim(p_codigo));
$$;
grant execute on function obtener_reserva(text) to anon, authenticated;

-- 4. Avisos en vivo al dueño (Supabase Realtime respeta las políticas RLS) ---
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservas'
  ) then
    alter publication supabase_realtime add table reservas;
  end if;
end $$;
