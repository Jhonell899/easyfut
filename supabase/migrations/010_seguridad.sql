-- 010: refuerzo de seguridad (resultado de la prueba de seguridad)
--   · Cierra el hueco de "Ya pagué": los límites cuentan TODAS las reservas sin confirmar
--   · El cliente tiene 10 minutos (antes 15) para pagar y pulsar "Ya pagué"
--   · Los demás jugadores ven esos horarios como "En espera" (no "Ocupado")
--   · "No me llegó" del dueño cuenta como pago falso (historial y bloqueo automático)
--   · Un registro sin verificar solo se puede borrar si tiene más de 10 minutos
-- Requiere la 009. Ejecutar una sola vez en SQL Editor → Run.

-- 1. Pago falso: el dueño rechazó una reserva en la que el cliente dijo "Ya pagué"
alter table reservas add column if not exists pago_rechazado_en timestamptz;

create or replace function marcar_pago_rechazado() returns trigger
language plpgsql as $$
begin
  if old.estado = 'pendiente' and new.estado = 'cancelada' and old.pago_avisado_en is not null then
    new.pago_rechazado_en := now();
  end if;
  return new;
end $$;

drop trigger if exists al_rechazar_pago on reservas;
create trigger al_rechazar_pago
  before update of estado on reservas
  for each row execute function marcar_pago_rechazado();

-- 2. Reserva "sin confirmar" que sigue viva:
--    · pendiente sin aviso y dentro de sus 10 minutos, o
--    · pendiente con "Ya pagué" cuyo partido aún no terminó
create or replace function reserva_viva(r reservas) returns boolean
language sql stable as $$
  select r.estado = 'pendiente' and (
    (r.pago_avisado_en is null and r.expira_en > now())
    or (r.pago_avisado_en is not null and r.fin > now())
  );
$$;

-- 3. crear_reserva: 10 minutos y límites sin hueco ------------------------------
--    Errores: cliente_bloqueado, demasiadas_vencidas, pendiente_activa,
--             demasiadas_sin_confirmar, limite_conexion (+ los de siempre)
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

-- 4. Horarios ocupados con "En espera" ------------------------------------------
--    en_espera = reservado pero sin confirmar; libera_en = cuándo vence (si no avisó pago)
drop function if exists horarios_ocupados(uuid, timestamptz, timestamptz);
create function horarios_ocupados(p_cancha_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz, en_espera boolean, libera_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.inicio, r.fin,
         r.estado = 'pendiente',
         case when r.estado = 'pendiente' and r.pago_avisado_en is null then r.expira_en end
  from reservas r
  join canchas c on c.id = r.cancha_id and c.activa
  where r.cancha_id = p_cancha_id
    and r.estado in ('pendiente','confirmada','bloqueo')
    and not (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())
    and r.inicio < p_hasta
    and r.fin > p_desde;
$$;
grant execute on function horarios_ocupados(uuid, timestamptz, timestamptz) to anon, authenticated;

-- 5. Historiales con pagos falsos ------------------------------------------------
drop function if exists historial_clientes(text[]);
create function historial_clientes(p_celulares text[])
returns table (celular text, pagadas bigint, vencidas bigint, canceladas bigint, pagos_falsos bigint,
               bloqueado_por_mi boolean, bloqueado_easyfut boolean)
language sql stable security definer set search_path = public as $$
  select c.cel,
         count(*) filter (where r.estado = 'confirmada'),
         count(*) filter (where r.estado = 'expirada'
                          or (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())),
         count(*) filter (where r.estado = 'cancelada' and r.pago_rechazado_en is null),
         count(*) filter (where r.pago_rechazado_en is not null),
         exists (select 1 from bloqueos_clientes b where b.celular = c.cel and b.dueno_id = auth.uid()
                 and (b.hasta is null or b.hasta > now())),
         exists (select 1 from bloqueos_clientes b where b.celular = c.cel and b.dueno_id is null
                 and (b.hasta is null or b.hasta > now()))
  from unnest(p_celulares) as c(cel)
  left join reservas r on r.celular_cliente = c.cel
  where (es_dueno() or es_admin())
    and (es_admin() or exists (
      select 1 from reservas x join canchas k on k.id = x.cancha_id
      where x.celular_cliente = c.cel and k.dueno_id = auth.uid()))
  group by c.cel;
$$;
revoke execute on function historial_clientes(text[]) from public, anon;
grant execute on function historial_clientes(text[]) to authenticated;

drop function if exists admin_clientes(text);
create function admin_clientes(p_buscar text default null)
returns table (celular text, nombre text, total bigint, pagadas bigint, vencidas bigint,
               canceladas bigint, pagos_falsos bigint, ultima timestamptz, conexiones bigint,
               bloqueado boolean, bloqueo_hasta timestamptz, bloqueo_motivo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.celular_cliente,
           (array_agg(r.nombre_cliente order by r.created_at desc))[1],
           count(*),
           count(*) filter (where r.estado = 'confirmada'),
           count(*) filter (where r.estado = 'expirada'
                            or (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())),
           count(*) filter (where r.estado = 'cancelada' and r.pago_rechazado_en is null),
           count(*) filter (where r.pago_rechazado_en is not null),
           max(r.created_at),
           count(distinct r.ip),
           b.id is not null,
           b.hasta,
           b.motivo
    from reservas r
    left join bloqueos_clientes b
      on b.celular = r.celular_cliente and b.dueno_id is null and (b.hasta is null or b.hasta > now())
    where r.estado <> 'bloqueo'
      and r.celular_cliente ~ '^9[0-9]{8}$'
      and (p_buscar is null or p_buscar = ''
           or r.celular_cliente like '%' || regexp_replace(p_buscar, '\D', '', 'g') || '%'
           or r.nombre_cliente ilike '%' || p_buscar || '%')
    group by r.celular_cliente, b.id, b.hasta, b.motivo
    order by (count(*) filter (where r.pago_rechazado_en is not null)
              + count(*) filter (where r.estado = 'expirada')) desc,
             max(r.created_at) desc
    limit 200;
end $$;
revoke execute on function admin_clientes(text) from public, anon;
grant execute on function admin_clientes(text) to authenticated;

-- 6. Registros sin verificar: solo se borran si tienen más de 10 minutos ---------
--    (así nadie puede cortar el registro de otra persona mientras escribe su código)
create or replace function liberar_correo_no_verificado(p_correo text)
returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_borradas int;
begin
  delete from auth.users
  where lower(email) = lower(trim(p_correo))
    and email_confirmed_at is null
    and created_at < now() - interval '10 minutes';
  get diagnostics v_borradas = row_count;
  return v_borradas > 0;
end $$;
