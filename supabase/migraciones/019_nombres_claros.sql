-- =============================================================================
-- 019 · Nombres claros
-- Renombra tablas y columnas para que se entiendan solas y agrega una
-- descripción en español a cada tabla y columna (se ve en Supabase → Table Editor).
--
--   perfiles           → usuarios
--   franjas            → tarifas_horarias
--   bloqueos_clientes  → clientes_bloqueados
--   cambios_pagos      → historial_medios_pago
--   registro_accesos   → historial_accesos
--
--   canchas.pagos                → canchas.medios_pago
--   canchas.pagos_cambiado_en    → canchas.medios_pago_cambiado_en
--   usuarios.telefono_verificado → usuarios.celular_verificado
--   reservas.comprobante_url     → se borra (nunca se usó)
--
-- Funciones renombradas:
--   guardar_franjas        → guardar_tarifas_horarias
--   guardar_pagos          → guardar_medios_pago
--   admin_cambios_pagos    → admin_historial_medios_pago
--   registrar_cambio_pagos → registrar_cambio_medios_pago (trigger)
--
-- Todo va en una sola transacción: si algo falla, no cambia nada.
-- Las políticas RLS, llaves, índices, triggers y permisos por columna
-- siguen funcionando solos después de renombrar.
-- =============================================================================

begin;

-- 1. Tablas -------------------------------------------------------------------
alter table perfiles          rename to usuarios;
alter table franjas           rename to tarifas_horarias;
alter table bloqueos_clientes rename to clientes_bloqueados;
alter table cambios_pagos     rename to historial_medios_pago;
alter table registro_accesos  rename to historial_accesos;

-- 2. Columnas -----------------------------------------------------------------
alter table canchas  rename column pagos               to medios_pago;
alter table canchas  rename column pagos_cambiado_en   to medios_pago_cambiado_en;
alter table usuarios rename column telefono_verificado to celular_verificado;
alter table reservas drop column if exists comprobante_url;

-- 3. Funciones con nombre nuevo (conservan permisos y triggers) ---------------
alter function guardar_franjas(uuid, jsonb)  rename to guardar_tarifas_horarias;
alter function guardar_pagos(uuid, jsonb)    rename to guardar_medios_pago;
alter function admin_cambios_pagos()         rename to admin_historial_medios_pago;
alter function registrar_cambio_pagos()      rename to registrar_cambio_medios_pago;

-- 4. Funciones cuya respuesta cambia de columnas: se borran y se vuelven a crear
drop function if exists obtener_reserva(text);
drop function if exists admin_rentadores();
drop function if exists admin_canchas();

-- 5. Funciones actualizadas con los nombres nuevos ----------------------------

-- handle_new_user (antes en 002_roles_y_login.sql)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios (id, nombre, celular, rol)
  values (
    new.id,
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'celular',
    case when new.raw_user_meta_data->>'rol' = 'dueno' then 'dueno' else 'cliente' end
  );
  return new;
end $$;

-- es_dueno (antes en 002_roles_y_login.sql)
create or replace function es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'dueno');
$$;

-- hacerme_rentador (antes en 004_panel_rentador.sql)
create or replace function hacerme_rentador() returns void
language sql security definer set search_path = public as $$
  update usuarios set rol = 'dueno' where id = auth.uid();
$$;

-- sincronizar_telefono (antes en 005_celular_verificado.sql)
create or replace function sincronizar_telefono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and coalesce(new.phone, '') <> '' then
    update usuarios
       set celular_verificado = right(regexp_replace(new.phone, '\D', '', 'g'), 9)
     where id = new.id;
  end if;
  return new;
end $$;

-- telefono_verificado (antes en 005_celular_verificado.sql)
create or replace function telefono_verificado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and celular_verificado is not null);
$$;

-- es_admin (antes en 008_administrador.sql)
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios where id = auth.uid() and es_admin);
$$;

-- admin_rentadores (antes en 008_administrador.sql)
create or replace function admin_rentadores()
returns table (id uuid, nombre text, correo text, celular text, celular_verificado text,
               referencia text, canchas bigint, creado timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select p.id, p.nombre, u.email::text, p.celular, p.celular_verificado,
           upper(left(replace(p.id::text, '-', ''), 6)),
           (select count(*) from canchas c where c.dueno_id = p.id),
           p.created_at
    from usuarios p join auth.users u on u.id = p.id
    where p.rol = 'dueno'
    order by (p.celular_verificado is not null), p.created_at desc;
end $$;

-- admin_verificar_telefono (antes en 008_administrador.sql)
create or replace function admin_verificar_telefono(p_id uuid, p_celular text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := right(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), 9);
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if v !~ '^9[0-9]{8}$' then raise exception 'celular_invalido'; end if;
  if exists (select 1 from usuarios where celular_verificado = v and id <> p_id) then
    raise exception 'celular_en_uso';
  end if;
  update usuarios set celular_verificado = v, celular = v where id = p_id;
end $$;

-- admin_quitar_verificacion (antes en 008_administrador.sql)
create or replace function admin_quitar_verificacion(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update usuarios set celular_verificado = null where id = p_id;
end $$;

-- admin_bloquear_cliente (antes en 009_reservas_falsas.sql)
create or replace function admin_bloquear_cliente(p_celular text, p_motivo text, p_dias int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  delete from clientes_bloqueados where celular = p_celular and dueno_id is null;
  insert into clientes_bloqueados (celular, dueno_id, motivo, hasta, creado_por)
  values (p_celular, null, nullif(trim(p_motivo), ''),
          case when p_dias is null then null else now() + make_interval(days => p_dias) end,
          auth.uid());
end $$;

-- admin_desbloquear_cliente (antes en 009_reservas_falsas.sql)
create or replace function admin_desbloquear_cliente(p_celular text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  delete from clientes_bloqueados where celular = p_celular and dueno_id is null;
end $$;

-- admin_clientes (antes en 010_seguridad.sql)
create or replace function admin_clientes(p_buscar text default null)
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
    left join clientes_bloqueados b
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

-- mis_locales (antes en 011_encargados.sql)
create or replace function mis_locales()
returns table (dueno_id uuid, dueno_nombre text, canchas bigint)
language sql stable security definer set search_path = public, auth as $$
  select e.dueno_id, p.nombre, (select count(*) from canchas c where c.dueno_id = e.dueno_id)
  from encargados e
  join auth.users u on lower(u.email) = lower(e.correo)
  join usuarios p on p.id = e.dueno_id
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

-- historial_clientes (antes en 011_encargados.sql)
create or replace function historial_clientes(p_celulares text[])
returns table (celular text, pagadas bigint, vencidas bigint, canceladas bigint, pagos_falsos bigint,
               bloqueado_por_mi boolean, bloqueado_easyfut boolean)
language sql stable security definer set search_path = public as $$
  select c.cel,
         count(*) filter (where r.estado = 'confirmada'),
         count(*) filter (where r.estado = 'expirada'
                          or (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())),
         count(*) filter (where r.estado = 'cancelada' and r.pago_rechazado_en is null),
         count(*) filter (where r.pago_rechazado_en is not null),
         exists (select 1 from clientes_bloqueados b where b.celular = c.cel and b.dueno_id = auth.uid()
                 and (b.hasta is null or b.hasta > now())),
         exists (select 1 from clientes_bloqueados b where b.celular = c.cel and b.dueno_id is null
                 and (b.hasta is null or b.hasta > now()))
  from unnest(p_celulares) as c(cel)
  left join reservas r on r.celular_cliente = c.cel
  where es_admin() or exists (
    select 1 from reservas x join canchas k on k.id = x.cancha_id
    where x.celular_cliente = c.cel
      and ((k.dueno_id = auth.uid() and es_dueno()) or es_encargado_de(k.dueno_id)))
  group by c.cel;
$$;

-- guardar_franjas (antes en 012_admin_canchas.sql)
create or replace function guardar_tarifas_horarias(p_cancha_id uuid, p_franjas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  if not (
    es_admin()
    or (es_dueno() and exists (select 1 from canchas where id = p_cancha_id and dueno_id = auth.uid()))
  ) then
    raise exception 'sin_permiso';
  end if;

  delete from tarifas_horarias where cancha_id = p_cancha_id;

  insert into tarifas_horarias (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
  select p_cancha_id,
         (f->>'dia_semana')::smallint,
         (f->>'hora_inicio')::time,
         (f->>'hora_fin')::time,
         (f->>'precio_hora')::numeric
  from jsonb_array_elements(coalesce(p_franjas, '[]'::jsonb)) f;

  get diagnostics v_total = row_count;
  return v_total;
exception
  when exclusion_violation then raise exception 'franjas_se_pisan';
  when check_violation then raise exception 'franja_invalida';
end $$;

-- admin_canchas (antes en 012_admin_canchas.sql)
create or replace function admin_canchas()
returns table (id uuid, nombre text, slug text, distrito text, deporte text, modalidades smallint[],
               activa boolean, foto text, creada timestamptz,
               dueno_id uuid, dueno_nombre text, dueno_correo text, dueno_whatsapp text,
               tarifas_horarias bigint, tiene_pagos boolean,
               proximas bigint, por_confirmar bigint, ultima_reserva timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select c.id, c.nombre, c.slug, c.distrito, c.deporte, c.modalidades,
           c.activa, c.fotos[1], c.created_at,
           p.id, p.nombre, u.email::text, p.celular_verificado,
           (select count(*) from tarifas_horarias f where f.cancha_id = c.id),
           coalesce(c.medios_pago, '{}'::jsonb) <> '{}'::jsonb,
           (select count(*) from reservas r where r.cancha_id = c.id
              and r.estado in ('confirmada', 'pendiente') and r.fin > now()),
           (select count(*) from reservas r where r.cancha_id = c.id
              and r.estado = 'pendiente' and r.pago_avisado_en is not null and r.fin > now()),
           (select max(r.created_at) from reservas r where r.cancha_id = c.id and r.estado <> 'bloqueo')
    from canchas c
    join usuarios p on p.id = c.dueno_id
    join auth.users u on u.id = p.id
    order by c.created_at desc;
end $$;

-- crear_reserva (antes en 013_mejoras.sql)
create or replace function crear_reserva(
  p_cancha_id uuid, p_inicio timestamptz, p_fin timestamptz,
  p_nombre text, p_celular text)
returns table (r_codigo text, r_monto numeric, r_expira_en timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_cancha    canchas%rowtype;
  v_franja    tarifas_horarias%rowtype;
  v_ini_local timestamp := p_inicio at time zone 'America/Lima';
  v_fin_local timestamp := p_fin    at time zone 'America/Lima';
  v_hora_fin  time;
  v_minutos   numeric   := extract(epoch from (p_fin - p_inicio)) / 60;
  v_monto     numeric;
  v_ip        text      := ip_solicitud();
begin
  -- Reservar exige cuenta (019)
  if auth.uid() is null then raise exception 'requiere_cuenta'; end if;
  select * into v_cancha from canchas where id = p_cancha_id and activa;
  if not found then raise exception 'cancha_no_disponible'; end if;

  if p_inicio <= now() then raise exception 'horario_pasado'; end if;
  if p_inicio > now() + interval '30 days' then raise exception 'muy_lejos'; end if;

  if length(trim(coalesce(p_nombre, ''))) < 2
     or coalesce(p_celular, '') !~ '^9[0-9]{8}$' then
    raise exception 'datos_invalidos';
  end if;

  if exists (
    select 1 from clientes_bloqueados b
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

  select * into v_franja from tarifas_horarias
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

-- contacto_cancha (antes en 014_nombre_dueno.sql)
create or replace function contacto_cancha(p_cancha_id uuid)
returns table (nombre text, celular text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.celular_verificado
  from canchas c join usuarios p on p.id = c.dueno_id
  where c.id = p_cancha_id and c.activa;
$$;

-- registrar_cambio_pagos (antes en 015_proteccion_pagos.sql)
create or replace function registrar_cambio_medios_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.medios_pago <> '{}'::jsonb then
      insert into historial_medios_pago (cancha_id, cambiado_por, antes, despues)
      values (new.id, auth.uid(), null, new.medios_pago);
    end if;
    return new;
  end if;

  if new.medios_pago is distinct from old.medios_pago then
    insert into historial_medios_pago (cancha_id, cambiado_por, antes, despues)
    values (old.id, auth.uid(), old.medios_pago, new.medios_pago);
    if old.medios_pago <> '{}'::jsonb then
      new.medios_pago_cambiado_en := now();
    end if;
  end if;
  return new;
end $$;

-- guardar_pagos (antes en 015_proteccion_pagos.sql)
create or replace function guardar_medios_pago(p_cancha_id uuid, p_pagos jsonb)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_reciente boolean;
  v_cuando   timestamptz;
begin
  if not (
    es_admin()
    or (es_dueno() and exists (select 1 from canchas where id = p_cancha_id and dueno_id = auth.uid()))
  ) then
    raise exception 'sin_permiso';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'password'
      and (a ->> 'timestamp')::bigint > extract(epoch from now()) - 600
  ) into v_reciente;
  if not v_reciente then raise exception 'requiere_clave'; end if;

  if jsonb_typeof(coalesce(p_pagos, '{}'::jsonb)) <> 'object' then
    raise exception 'pagos_invalidos';
  end if;

  update canchas set medios_pago = coalesce(p_pagos, '{}'::jsonb)
   where id = p_cancha_id
  returning medios_pago_cambiado_en into v_cuando;
  return v_cuando;
end $$;

-- admin_cambios_pagos (antes en 015_proteccion_pagos.sql)
create or replace function admin_historial_medios_pago()
returns table (id uuid, cuando timestamptz, cancha_id uuid, cancha_nombre text,
               dueno_nombre text, autor_nombre text, autor_correo text, autor_es_dueno boolean,
               antes jsonb, despues jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select x.id, x.created_at, c.id, c.nombre,
           d.nombre, a.nombre, u.email::text, x.cambiado_por = c.dueno_id,
           x.antes, x.despues
    from historial_medios_pago x
    join canchas c on c.id = x.cancha_id
    left join usuarios d on d.id = c.dueno_id
    left join usuarios a on a.id = x.cambiado_por
    left join auth.users u on u.id = x.cambiado_por
    order by x.created_at desc
    limit 100;
end $$;

-- obtener_reserva (antes en 016_politica_cancelacion.sql)
create function obtener_reserva(p_codigo text)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz,
               monto numeric, cancha_nombre text, direccion text, expira_en timestamptz,
               cancha_id uuid, cancha_slug text, nombre_cliente text,
               medios_pago jsonb, dueno_nombre text, dueno_celular text, pago_avisado_en timestamptz,
               medios_pago_cambiado_en timestamptz, politica_cancelacion text)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto,
         c.nombre, c.direccion, r.expira_en,
         c.id, c.slug, r.nombre_cliente,
         c.medios_pago, p.nombre, coalesce(p.celular_verificado, p.celular), r.pago_avisado_en,
         c.medios_pago_cambiado_en, c.politica_cancelacion
  from reservas r
  join canchas c on c.id = r.cancha_id
  left join usuarios p on p.id = c.dueno_id
  where r.codigo = upper(trim(p_codigo));
$$;

-- canchas_libres (antes en 017_libres_resenas_confianza.sql)
create or replace function canchas_libres(p_fecha date, p_hora time)
returns table (cancha_id uuid, inicio timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (c.id) c.id, s.ini
  from canchas c
  join tarifas_horarias f
    on f.cancha_id = c.id and f.dia_semana = extract(dow from p_fecha)::smallint
  cross join lateral generate_series(
    (p_fecha + f.hora_inicio) at time zone 'America/Lima',
    ((p_fecha + f.hora_fin) at time zone 'America/Lima') - make_interval(mins => c.duracion_turno_min),
    make_interval(mins => c.duracion_turno_min)
  ) as s(ini)
  where c.activa
    and s.ini >= (p_fecha + p_hora) at time zone 'America/Lima'
    and s.ini <  ((p_fecha + p_hora) at time zone 'America/Lima') + interval '60 minutes'
    and s.ini > now()
    and not exists (
      select 1 from reservas r
      where r.cancha_id = c.id
        and r.estado in ('pendiente', 'confirmada', 'bloqueo')
        and not (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())
        and r.inicio < s.ini + make_interval(mins => c.duracion_turno_min)
        and r.fin > s.ini
    )
  order by c.id, s.ini;
$$;

-- confianza_canchas (antes en 017_libres_resenas_confianza.sql)
create or replace function confianza_canchas(p_ids uuid[])
returns table (cancha_id uuid, promedio numeric, total_resenas bigint, partidos bigint,
               dueno_verificado boolean, desde timestamptz, respuestas bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         (select round(avg(x.estrellas)::numeric, 1) from resenas x where x.cancha_id = c.id and not x.oculta),
         (select count(*) from resenas x where x.cancha_id = c.id and not x.oculta),
         (select count(*) from reservas r where r.cancha_id = c.id and r.estado = 'confirmada' and r.fin < now()),
         p.celular_verificado is not null,
         c.created_at,
         (select count(*) from resenas x where x.cancha_id = c.id and not x.oculta and x.respuesta is not null)
  from canchas c
  left join usuarios p on p.id = c.dueno_id
  where c.id = any(p_ids) and c.activa;
$$;

-- confiar_dispositivo (antes en 018_dispositivos.sql)
create or replace function confiar_dispositivo(p_ip text, p_agente text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text;
  v_id    uuid;
  v_ip    text := texto_corto(p_ip, 64);
  v_ag    text := texto_corto(p_agente, 300);
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if not sesion_con_codigo_reciente() then raise exception 'requiere_codigo'; end if;

  if (select count(*) from historial_accesos
      where usuario_id = auth.uid() and evento = 'confiado' and created_at > now() - interval '1 hour') >= 5 then
    insert into historial_accesos (usuario_id, evento, ip, agente) values (auth.uid(), 'limite', v_ip, v_ag);
    raise exception 'demasiados_intentos';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into dispositivos_confiables (usuario_id, token_hash, ip_inicial, ip_ultima, agente)
  values (auth.uid(), huella_token(v_token), v_ip, v_ip, v_ag)
  returning id into v_id;

  insert into historial_accesos (usuario_id, dispositivo_id, evento, ip, agente)
  values (auth.uid(), v_id, 'confiado', v_ip, v_ag);

  return v_token;
end $$;

-- dispositivo_confiable (antes en 018_dispositivos.sql)
create or replace function dispositivo_confiable(p_token text, p_ip text, p_agente text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  d  dispositivos_confiables%rowtype;
  v_ip text := texto_corto(p_ip, 64);
begin
  if auth.uid() is null or coalesce(p_token, '') = '' then return false; end if;

  select * into d from dispositivos_confiables
   where usuario_id = auth.uid()
     and token_hash = huella_token(p_token)
     and not revocado
     and creado > now() - interval '30 days';
  if not found then return false; end if;

  if v_ip is not null and v_ip is distinct from d.ip_ultima then
    update dispositivos_confiables set ip_ultima = v_ip, ultimo_uso = now() where id = d.id;
    -- Una sola anotación por IP nueva y hora, para no llenar el registro
    if not exists (select 1 from historial_accesos
                   where dispositivo_id = d.id and evento = 'ip_nueva' and ip = v_ip
                     and created_at > now() - interval '1 hour') then
      insert into historial_accesos (usuario_id, dispositivo_id, evento, ip, agente)
      values (auth.uid(), d.id, 'ip_nueva', v_ip, texto_corto(p_agente, 300));
    end if;
  elsif d.ultimo_uso < now() - interval '15 minutes' then
    update dispositivos_confiables set ultimo_uso = now() where id = d.id;
  end if;

  return true;
end $$;

-- admin_dispositivos (antes en 018_dispositivos.sql)
create or replace function admin_dispositivos()
returns table (id uuid, correo text, nombre text, creado timestamptz, ultimo_uso timestamptz,
               ip_inicial text, ip_ultima text, agente text, revocado boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select d.id, u.email::text, p.nombre, d.creado, d.ultimo_uso, d.ip_inicial, d.ip_ultima, d.agente,
           d.revocado or d.creado <= now() - interval '30 days'
    from dispositivos_confiables d
    join auth.users u on u.id = d.usuario_id
    left join usuarios p on p.id = d.usuario_id
    order by d.ultimo_uso desc
    limit 300;
end $$;

-- admin_accesos (antes en 018_dispositivos.sql)
create or replace function admin_accesos()
returns table (id uuid, cuando timestamptz, correo text, evento text, ip text, agente text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.id, r.created_at, u.email::text, r.evento, r.ip, r.agente
    from historial_accesos r
    join auth.users u on u.id = r.usuario_id
    order by r.created_at desc
    limit 300;
end $$;

-- admin_revocar_dispositivo (antes en 018_dispositivos.sql)
create or replace function admin_revocar_dispositivo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d dispositivos_confiables%rowtype;
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update dispositivos_confiables set revocado = true where id = p_id returning * into d;
  if found then
    insert into historial_accesos (usuario_id, dispositivo_id, evento, ip)
    values (d.usuario_id, d.id, 'revocado', d.ip_ultima);
  end if;
end $$;

-- 6. Permisos -----------------------------------------------------------------
grant execute on function obtener_reserva(text) to anon, authenticated;
revoke execute on function admin_rentadores() from public, anon;
grant execute on function admin_rentadores() to authenticated;
revoke execute on function admin_canchas() from public, anon;
grant execute on function admin_canchas() to authenticated;

-- Reservar exige cuenta: solo usuarios con sesión pueden llamar a crear_reserva.
-- (Las reservas presenciales del dueño y los bloqueos de horario no pasan por aquí.)
revoke execute on function crear_reserva(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function crear_reserva(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- 7. Descripciones ------------------------------------------------------------
comment on table usuarios is 'Cada cuenta de EasyFut (jugador, dueño o admin). Se crea sola al registrarse.';
comment on column usuarios.id is 'Mismo id que la cuenta de Supabase (auth.users).';
comment on column usuarios.nombre is 'Nombre que se muestra en la app.';
comment on column usuarios.celular is 'Celular que escribió la persona (9 dígitos).';
comment on column usuarios.celular_verificado is 'Celular ya verificado; vacío si falta verificar. Es el que ven los clientes.';
comment on column usuarios.rol is 'cliente = jugador; dueno = publica canchas.';
comment on column usuarios.es_admin is 'true solo para administradores de EasyFut.';
comment on column usuarios.created_at is 'Cuándo se creó la cuenta.';

comment on table canchas is 'Cada cancha publicada por un dueño.';
comment on column canchas.id is 'Identificador de la cancha.';
comment on column canchas.dueno_id is 'Dueño de la cancha (usuarios.id).';
comment on column canchas.nombre is 'Nombre público de la cancha.';
comment on column canchas.slug is 'Parte de la dirección web: /c/slug.';
comment on column canchas.descripcion is 'Texto libre que escribe el dueño.';
comment on column canchas.deporte is 'Deporte (por ahora fútbol).';
comment on column canchas.superficie is 'Tipo de piso: grass sintético, losa, etc.';
comment on column canchas.direccion is 'Calle y número.';
comment on column canchas.distrito is 'Distrito de Lima.';
comment on column canchas.latitud is 'Ubicación en el mapa.';
comment on column canchas.longitud is 'Ubicación en el mapa.';
comment on column canchas.servicios is 'Lista: vestidores, iluminación, cafetería, etc.';
comment on column canchas.fotos is 'Direcciones de las fotos (bucket canchas).';
comment on column canchas.duracion_turno_min is 'Duración de cada turno en minutos.';
comment on column canchas.modalidades is 'Jugadores por equipo que acepta: 5, 7, 9, 11.';
comment on column canchas.medios_pago is 'Yape, Plin, cuenta, CCI, titular y QR del dueño.';
comment on column canchas.medios_pago_cambiado_en is 'Último cambio de los medios de pago (se avisa al cliente).';
comment on column canchas.politica_cancelacion is 'flexible, moderada o estricta.';
comment on column canchas.activa is 'false = pausada, no aparece en la app.';
comment on column canchas.created_at is 'Cuándo se publicó.';

comment on table tarifas_horarias is 'Días y horas en que abre cada cancha, con su precio por hora.';
comment on column tarifas_horarias.id is 'Identificador del tramo.';
comment on column tarifas_horarias.cancha_id is 'Cancha a la que pertenece.';
comment on column tarifas_horarias.dia_semana is '0 = domingo, 1 = lunes … 6 = sábado.';
comment on column tarifas_horarias.hora_inicio is 'Hora en que empieza el tramo.';
comment on column tarifas_horarias.hora_fin is 'Hora en que termina el tramo.';
comment on column tarifas_horarias.precio_hora is 'Precio por hora en soles.';

comment on table reservas is 'Reservas de jugadores, reservas presenciales del dueño y horas bloqueadas (estado = bloqueo).';
comment on column reservas.id is 'Identificador interno.';
comment on column reservas.codigo is 'Código corto que ve el cliente (va en el mensaje de pago).';
comment on column reservas.cancha_id is 'Cancha reservada.';
comment on column reservas.cliente_id is 'Cuenta del jugador. Vacío solo en reservas presenciales del dueño y en bloqueos.';
comment on column reservas.inicio is 'Inicio del turno.';
comment on column reservas.fin is 'Fin del turno.';
comment on column reservas.estado is 'pendiente, confirmada, cancelada, expirada o bloqueo.';
comment on column reservas.nombre_cliente is 'Nombre del jugador.';
comment on column reservas.celular_cliente is 'Celular del jugador.';
comment on column reservas.monto is 'Total a pagar en soles.';
comment on column reservas.nota is 'Motivo del bloqueo o nota del dueño.';
comment on column reservas.expira_en is 'Hasta cuándo tiene el jugador para pagar.';
comment on column reservas.pago_avisado_en is 'Cuándo el jugador tocó «Ya pagué».';
comment on column reservas.pago_rechazado_en is 'Cuándo el dueño marcó «No me llegó».';
comment on column reservas.cancelada_por_cliente_en is 'Cuándo el jugador pidió cancelar.';
comment on column reservas.ip is 'IP desde la que se reservó (contra reservas falsas).';
comment on column reservas.created_at is 'Cuándo se hizo la reserva.';

comment on table clientes_bloqueados is 'Celulares que no pueden reservar: con un dueño o en toda EasyFut.';
comment on column clientes_bloqueados.id is 'Identificador del bloqueo.';
comment on column clientes_bloqueados.celular is 'Celular bloqueado.';
comment on column clientes_bloqueados.dueno_id is 'Dueño que bloqueó; vacío = bloqueado por EasyFut en todas las canchas.';
comment on column clientes_bloqueados.motivo is 'Por qué se bloqueó.';
comment on column clientes_bloqueados.hasta is 'Fin del bloqueo; vacío = para siempre.';
comment on column clientes_bloqueados.creado_por is 'Quién lo bloqueó.';
comment on column clientes_bloqueados.created_at is 'Cuándo se bloqueó.';

comment on table encargados is 'Personas que un dueño invita para manejar la agenda de sus canchas.';
comment on column encargados.id is 'Identificador.';
comment on column encargados.dueno_id is 'Dueño que invitó.';
comment on column encargados.correo is 'Correo del encargado (con ese correo entra).';
comment on column encargados.nombre is 'Nombre del encargado.';
comment on column encargados.created_at is 'Cuándo se invitó.';

comment on table historial_medios_pago is 'Cada cambio de Yape, Plin o cuenta de una cancha (contra fraudes).';
comment on column historial_medios_pago.id is 'Identificador del cambio.';
comment on column historial_medios_pago.cancha_id is 'Cancha cuyos medios de pago cambiaron.';
comment on column historial_medios_pago.cambiado_por is 'Quién hizo el cambio.';
comment on column historial_medios_pago.antes is 'Medios de pago antes del cambio.';
comment on column historial_medios_pago.despues is 'Medios de pago después del cambio.';
comment on column historial_medios_pago.created_at is 'Cuándo se cambió.';

comment on table resenas is 'Calificación y comentario de una reserva ya jugada (una por reserva).';
comment on column resenas.id is 'Identificador de la reseña.';
comment on column resenas.cancha_id is 'Cancha calificada.';
comment on column resenas.reserva_id is 'Reserva que se calificó.';
comment on column resenas.estrellas is 'De 1 a 5.';
comment on column resenas.comentario is 'Texto del jugador.';
comment on column resenas.nombre is 'Nombre que se muestra con la reseña.';
comment on column resenas.respuesta is 'Respuesta del dueño.';
comment on column resenas.respondida_en is 'Cuándo respondió el dueño.';
comment on column resenas.oculta is 'true = el admin la ocultó.';
comment on column resenas.reportes is 'Cuántas veces la denunciaron.';
comment on column resenas.created_at is 'Cuándo se escribió.';

comment on table reportes_resenas is 'Denuncias de reseñas: una por persona o conexión.';
comment on column reportes_resenas.resena_id is 'Reseña denunciada.';
comment on column reportes_resenas.origen is 'Cuenta o IP que denunció.';
comment on column reportes_resenas.motivo is 'Por qué la denunció.';
comment on column reportes_resenas.created_at is 'Cuándo se denunció.';

comment on table dispositivos_confiables is 'Celulares y computadoras verificados con el código del correo (valen 30 días).';
comment on column dispositivos_confiables.id is 'Identificador del dispositivo.';
comment on column dispositivos_confiables.usuario_id is 'Cuenta dueña del dispositivo.';
comment on column dispositivos_confiables.token_hash is 'Huella del token guardado en la cookie (nunca el token real).';
comment on column dispositivos_confiables.creado is 'Cuándo se verificó.';
comment on column dispositivos_confiables.ultimo_uso is 'Última vez que se usó.';
comment on column dispositivos_confiables.ip_inicial is 'IP con la que se verificó.';
comment on column dispositivos_confiables.ip_ultima is 'Última IP vista.';
comment on column dispositivos_confiables.agente is 'Navegador y sistema del dispositivo.';
comment on column dispositivos_confiables.revocado is 'true = el admin lo quitó.';

comment on table historial_accesos is 'Eventos de seguridad: dispositivo nuevo, IP nueva, revocado o demasiados intentos.';
comment on column historial_accesos.id is 'Identificador del evento.';
comment on column historial_accesos.usuario_id is 'Cuenta del evento.';
comment on column historial_accesos.dispositivo_id is 'Dispositivo relacionado.';
comment on column historial_accesos.evento is 'confiado, ip_nueva, revocado o limite.';
comment on column historial_accesos.ip is 'IP desde la que ocurrió.';
comment on column historial_accesos.agente is 'Navegador y sistema.';
comment on column historial_accesos.created_at is 'Cuándo ocurrió.';

commit;

-- Para que la API vea los nombres nuevos al instante
notify pgrst, 'reload schema';
