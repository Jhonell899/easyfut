-- 013: mejoras de lógica y seguridad
--   · El cliente puede cancelar su reserva mientras no haya avisado el pago
--   · No se puede reservar con más de 30 días de anticipación
--   · Tope de cancelaciones propias (evita "reservar y cancelar" para retener horarios)
--   · Un encargado solo puede cambiar el estado de una reserva, no montos ni horarios
-- Requiere 011. Ejecutar una sola vez en SQL Editor → Run.

alter table reservas add column if not exists cancelada_por_cliente_en timestamptz;

-- 1. Cancelar mi reserva (con el código) -----------------------------------------
--    Solo si aún no avisó el pago. Si ya pagó o está confirmada, coordina con el dueño.
create or replace function cancelar_reserva(p_codigo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v reservas%rowtype;
begin
  select * into v from reservas where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'reserva_no_existe'; end if;
  if v.estado in ('cancelada', 'expirada') then return true; end if;
  if v.estado <> 'pendiente' or v.pago_avisado_en is not null then
    raise exception 'contacta_al_dueno';
  end if;
  update reservas
     set estado = 'cancelada', expira_en = null, cancelada_por_cliente_en = now()
   where id = v.id;
  return true;
end $$;
grant execute on function cancelar_reserva(text) to anon, authenticated;

-- 2. crear_reserva con tope de 30 días y de cancelaciones ---------------------------
--    Errores nuevos: muy_lejos, demasiadas_cancelaciones
create or replace function crear_reserva(
  p_cancha_id uuid, p_inicio timestamptz, p_fin timestamptz,
  p_nombre text, p_celular text)
returns table (r_codigo text, r_monto numeric, r_expira_en timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_cancha    canchas%rowtype;
  v_franja    franjas%rowtype;
  v_ini_local timestamp := p_inicio at time zone 'America/Lima';
  v_fin_local timestamp := p_fin    at time zone 'America/Lima';
  v_hora_fin  time;
  v_minutos   numeric   := extract(epoch from (p_fin - p_inicio)) / 60;
  v_monto     numeric;
  v_ip        text      := ip_solicitud();
begin
  select * into v_cancha from canchas where id = p_cancha_id and activa;
  if not found then raise exception 'cancha_no_disponible'; end if;

  if p_inicio <= now() then raise exception 'horario_pasado'; end if;
  if p_inicio > now() + interval '30 days' then raise exception 'muy_lejos'; end if;

  if length(trim(coalesce(p_nombre, ''))) < 2
     or coalesce(p_celular, '') !~ '^9[0-9]{8}$' then
    raise exception 'datos_invalidos';
  end if;

  if exists (
    select 1 from bloqueos_clientes b
    where b.celular = p_celular
      and (b.dueno_id is null or b.dueno_id = v_cancha.dueno_id)
      and (b.hasta is null or b.hasta > now())
  ) then
    raise exception 'cliente_bloqueado';
  end if;

  -- Reincidencia: vencidas sin aviso + pagos falsos en 7 días
  if (
    select count(*) from reservas r
    where r.celular_cliente = p_celular
      and r.created_at > now() - interval '7 days'
      and (r.estado = 'expirada'
           or (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())
           or r.pago_rechazado_en is not null)
  ) >= 3 then
    raise exception 'demasiadas_vencidas';
  end if;

  -- Reservar y cancelar una y otra vez para retener un horario: máximo 4 cancelaciones propias en 24 h
  if (
    select count(*) from reservas r
    where r.celular_cliente = p_celular
      and r.cancelada_por_cliente_en > now() - interval '24 hours'
  ) >= 4 then
    raise exception 'demasiadas_cancelaciones';
  end if;

  -- 1 reserva sin pagar (sin "Ya pagué") a la vez por número
  if exists (
    select 1 from reservas r
    where r.celular_cliente = p_celular
      and r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en > now()
  ) then
    raise exception 'pendiente_activa';
  end if;

  -- Máximo 2 sin confirmar por el dueño por número (incluye las de "Ya pagué")
  if (select count(*) from reservas r where r.celular_cliente = p_celular and reserva_viva(r)) >= 2 then
    raise exception 'demasiadas_sin_confirmar';
  end if;

  -- Máximo 3 sin confirmar desde la misma conexión (incluye las de "Ya pagué")
  if v_ip is not null and (select count(*) from reservas r where r.ip = v_ip and reserva_viva(r)) >= 3 then
    raise exception 'limite_conexion';
  end if;

  if v_minutos <= 0 or mod(v_minutos, v_cancha.duracion_turno_min) <> 0 then
    raise exception 'duracion_invalida';
  end if;

  if v_fin_local > ((v_ini_local::date + 1)::timestamp) then
    raise exception 'cruza_medianoche';
  end if;

  v_hora_fin := case when v_fin_local::time = '00:00'
                     then '24:00'::time else v_fin_local::time end;

  select * into v_franja from franjas
   where cancha_id   = p_cancha_id
     and dia_semana  = extract(dow from v_ini_local)::smallint
     and hora_inicio <= v_ini_local::time
     and hora_fin    >= v_hora_fin
   limit 1;
  if not found then raise exception 'fuera_de_horario'; end if;

  v_monto := round(v_franja.precio_hora * v_minutos / 60, 2);

  begin
    insert into reservas
      (cancha_id, cliente_id, inicio, fin, nombre_cliente, celular_cliente, monto, expira_en, ip)
    values
      (p_cancha_id, auth.uid(), p_inicio, p_fin, trim(p_nombre), p_celular, v_monto,
       now() + interval '10 minutes', v_ip)
    returning reservas.codigo, reservas.monto, reservas.expira_en
      into r_codigo, r_monto, r_expira_en;
  exception when exclusion_violation then
    raise exception 'horario_ocupado';
  end;

  return next;
end $$;

-- 3. Quien no es dueño de la cancha ni administrador (un encargado) solo puede
--    cambiar el estado de una reserva: no el monto, el horario, la cancha ni el cliente.
create or replace function proteger_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not es_admin()
     and not exists (select 1 from canchas c where c.id = old.cancha_id and c.dueno_id = auth.uid())
     and (new.monto, new.inicio, new.fin, new.cancha_id, new.nombre_cliente, new.celular_cliente, new.codigo)
         is distinct from
         (old.monto, old.inicio, old.fin, old.cancha_id, old.nombre_cliente, old.celular_cliente, old.codigo)
  then
    raise exception 'sin_permiso';
  end if;
  return new;
end $$;

drop trigger if exists al_editar_reserva on reservas;
create trigger al_editar_reserva
  before update on reservas
  for each row execute function proteger_reserva();
