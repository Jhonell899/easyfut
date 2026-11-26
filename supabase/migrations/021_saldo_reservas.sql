-- =============================================================================
-- 021 · Saldo de reservas (EasyFut cobra S/ 1 por reserva confirmada)
--
-- Cómo funciona:
--   · Cada dueño tiene un saldo. Al volverse dueño recibe un regalo de bienvenida
--     (S/ 5 = 5 reservas).
--   · Cuando una reserva hecha por un jugador pasa a "confirmada", se descuenta
--     el precio por reserva (S/ 1) del saldo del dueño. Una sola vez por reserva y
--     no se devuelve aunque después se cancele.
--     No se cobran: vencidas, canceladas antes de confirmar, bloqueos ni reservas
--     presenciales del dueño.
--   · Si el saldo no alcanza para una reserva, sus canchas no reciben reservas nuevas.
--     Las ya hechas se pueden confirmar igual (el saldo puede quedar en negativo).
--   · Para recargar (desde S/ 1), el dueño yapea o transfiere a la cuenta BCP de
--     EasyFut y avisa el número de operación. El administrador lo busca en su Yape
--     o en su BCP y aprueba (o rechaza) la recarga.
--   · Promociones: el admin puede activar un bono (por ejemplo +10 % en recargas
--     desde S/ 50 hasta una fecha). El bono se suma solo al aprobar la recarga.
--
-- Tablas nuevas:
--   ajustes_easyfut   → una sola fila: Yape y cuenta BCP de EasyFut, precio, regalo y promoción
--   movimientos_saldo → cada suma o resta al saldo de un dueño (el saldo es la suma)
--   recargas_saldo    → cada aviso de recarga del dueño y si se aprobó
--
-- Todo va en una sola transacción: si algo falla, no cambia nada. Requiere la 020.
-- =============================================================================

begin;

-- 1. Ajustes de EasyFut (una sola fila) ---------------------------------------
create table if not exists ajustes_easyfut (
  id                int primary key default 1 check (id = 1),
  yape_numero       text check (yape_numero ~ '^9[0-9]{8}$'),
  yape_titular      text,
  bcp_cuenta        text check (bcp_cuenta ~ '^[0-9]{13,14}$'),
  bcp_cci           text check (bcp_cci ~ '^[0-9]{20}$'),
  bcp_titular       text,
  precio_reserva    numeric(10,2) not null default 1.00 check (precio_reserva > 0),
  regalo_bienvenida numeric(10,2) not null default 5.00 check (regalo_bienvenida >= 0),
  -- Promoción de recarga: 0 = apagada
  bono_porcentaje   numeric(5,2)  not null default 0 check (bono_porcentaje >= 0 and bono_porcentaje <= 100),
  bono_desde        numeric(10,2) not null default 50 check (bono_desde >= 10),
  bono_hasta        timestamptz,
  created_at        timestamptz not null default now()
);
insert into ajustes_easyfut (id) values (1) on conflict (id) do nothing;
alter table ajustes_easyfut enable row level security;
drop policy if exists ajustes_ver on ajustes_easyfut;
create policy ajustes_ver on ajustes_easyfut for select to authenticated using (true);

-- 2. Recargas que avisan los dueños -------------------------------------------
create table if not exists recargas_saldo (
  id           uuid primary key default gen_random_uuid(),
  dueno_id     uuid not null references usuarios(id) on delete cascade,
  monto        numeric(10,2) not null check (monto >= 1 and monto <= 500),
  medio        text not null default 'yape' check (medio in ('yape', 'bcp')),
  operacion    text not null,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  nota         text,
  revisada_por uuid references usuarios(id) on delete set null,
  revisada_en  timestamptz,
  created_at   timestamptz not null default now()
);
-- El mismo número de operación (de Yape o de BCP) no se puede usar dos veces
create unique index if not exists recargas_operacion_unica
  on recargas_saldo (medio, operacion) where estado in ('pendiente', 'aprobada');
create index if not exists recargas_dueno_idx on recargas_saldo (dueno_id, created_at desc);
alter table recargas_saldo enable row level security;
drop policy if exists recargas_ver on recargas_saldo;
create policy recargas_ver on recargas_saldo for select using (dueno_id = auth.uid() or es_admin());

-- 3. Movimientos del saldo (el saldo es la suma de montos) --------------------
create table if not exists movimientos_saldo (
  id         uuid primary key default gen_random_uuid(),
  dueno_id   uuid not null references usuarios(id) on delete cascade,
  tipo       text not null check (tipo in ('regalo', 'recarga', 'bono', 'reserva', 'ajuste')),
  monto      numeric(10,2) not null check (monto <> 0),
  reserva_id uuid references reservas(id) on delete set null,
  recarga_id uuid references recargas_saldo(id) on delete set null,
  detalle    text,
  creado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists movimientos_dueno_idx on movimientos_saldo (dueno_id, created_at desc);
-- Una reserva se cobra una sola vez y cada dueño recibe un solo regalo
create unique index if not exists movimientos_reserva_unica on movimientos_saldo (reserva_id) where reserva_id is not null;
create unique index if not exists movimientos_regalo_unico on movimientos_saldo (dueno_id) where tipo = 'regalo';
alter table movimientos_saldo enable row level security;
drop policy if exists movimientos_ver on movimientos_saldo;
create policy movimientos_ver on movimientos_saldo for select using (dueno_id = auth.uid() or es_admin());

-- 4. Saldo ---------------------------------------------------------------------
create or replace function saldo_de(p_dueno uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0) from movimientos_saldo where dueno_id = p_dueno;
$$;
revoke execute on function saldo_de(uuid) from public, anon, authenticated;

-- ¿La promoción de recarga está activa ahora?
create or replace function bono_vigente(a ajustes_easyfut) returns boolean
language sql stable as $$
  select a.bono_porcentaje > 0 and (a.bono_hasta is null or a.bono_hasta > now());
$$;

create or replace function mi_saldo()
returns table (saldo numeric, precio_reserva numeric, reservas_disponibles int,
               yape_numero text, yape_titular text,
               bcp_cuenta text, bcp_cci text, bcp_titular text,
               bono_porcentaje numeric, bono_desde numeric, bono_hasta timestamptz,
               reservas_mes bigint, gastado_mes numeric)
language sql stable security definer set search_path = public as $$
  select saldo_de(auth.uid()), a.precio_reserva,
         greatest(floor(saldo_de(auth.uid()) / a.precio_reserva), 0)::int,
         a.yape_numero, a.yape_titular,
         a.bcp_cuenta, a.bcp_cci, a.bcp_titular,
         case when bono_vigente(a) then a.bono_porcentaje else 0 end, a.bono_desde, a.bono_hasta,
         m.cantidad, m.total
  from ajustes_easyfut a
  cross join lateral (
    select count(*) as cantidad, coalesce(-sum(x.monto), 0) as total
    from movimientos_saldo x
    where x.dueno_id = auth.uid() and x.tipo = 'reserva'
      and x.created_at >= date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima'
  ) m
  where a.id = 1 and auth.uid() is not null;
$$;
revoke execute on function mi_saldo() from public, anon;
grant execute on function mi_saldo() to authenticated;

-- 5. Regalo de bienvenida al volverse dueño -----------------------------------
create or replace function dar_regalo_bienvenida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'dueno' then
    insert into movimientos_saldo (dueno_id, tipo, monto, detalle)
    select new.id, 'regalo', a.regalo_bienvenida, 'Regalo de bienvenida'
    from ajustes_easyfut a where a.id = 1 and a.regalo_bienvenida > 0
    on conflict (dueno_id) where tipo = 'regalo' do nothing;
  end if;
  return new;
end $$;
drop trigger if exists regalo_bienvenida on usuarios;
create trigger regalo_bienvenida after insert or update of rol on usuarios
  for each row execute function dar_regalo_bienvenida();

-- Los dueños que ya existen también reciben su regalo
insert into movimientos_saldo (dueno_id, tipo, monto, detalle)
select u.id, 'regalo', a.regalo_bienvenida, 'Regalo de bienvenida'
from usuarios u cross join ajustes_easyfut a
where u.rol = 'dueno' and a.id = 1 and a.regalo_bienvenida > 0
on conflict (dueno_id) where tipo = 'regalo' do nothing;

-- 6. Cobro al confirmar una reserva hecha por un jugador ----------------------
create or replace function cobrar_reserva_confirmada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'confirmada' and old.estado is distinct from 'confirmada'
     and new.cliente_id is not null then
    insert into movimientos_saldo (dueno_id, tipo, monto, reserva_id, detalle)
    select c.dueno_id, 'reserva', -a.precio_reserva, new.id, 'Reserva ' || new.codigo
    from canchas c cross join ajustes_easyfut a
    where c.id = new.cancha_id and a.id = 1
    on conflict (reserva_id) where reserva_id is not null do nothing;
  end if;
  return new;
end $$;
drop trigger if exists cobrar_reserva on reservas;
create trigger cobrar_reserva after update of estado on reservas
  for each row execute function cobrar_reserva_confirmada();

-- 7. El dueño avisa una recarga ------------------------------------------------
-- p_medio: 'yape' o 'bcp' (transferencia a la cuenta BCP de EasyFut)
-- Errores: sin_permiso, monto_invalido, medio_no_disponible, operacion_invalida,
--          operacion_repetida, demasiadas_pendientes
create or replace function pedir_recarga(p_monto numeric, p_operacion text, p_medio text default 'yape')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_op text := upper(regexp_replace(coalesce(p_operacion, ''), '[\s-]', '', 'g'));
  v_id uuid;
  a ajustes_easyfut%rowtype;
begin
  if not es_dueno() then raise exception 'sin_permiso'; end if;
  if p_monto is null or p_monto < 1 or p_monto > 500 then raise exception 'monto_invalido'; end if;
  select * into a from ajustes_easyfut where id = 1;
  if p_medio = 'yape' then
    if a.yape_numero is null then raise exception 'medio_no_disponible'; end if;
  elsif p_medio = 'bcp' then
    if a.bcp_cuenta is null then raise exception 'medio_no_disponible'; end if;
  else
    raise exception 'medio_no_disponible';
  end if;
  if v_op !~ '^[0-9A-Z]{4,20}$' then raise exception 'operacion_invalida'; end if;
  if (select count(*) from recargas_saldo where dueno_id = auth.uid() and estado = 'pendiente') >= 3 then
    raise exception 'demasiadas_pendientes';
  end if;
  insert into recargas_saldo (dueno_id, monto, medio, operacion)
  values (auth.uid(), round(p_monto, 2), p_medio, v_op)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'operacion_repetida';
end $$;
revoke execute on function pedir_recarga(numeric, text, text) from public, anon;
grant execute on function pedir_recarga(numeric, text, text) to authenticated;

-- 8. Administrador -------------------------------------------------------------
create or replace function admin_recargas()
returns table (id uuid, dueno_id uuid, dueno_nombre text, dueno_correo text, monto numeric,
               medio text, operacion text, estado text, nota text, created_at timestamptz, saldo numeric)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.id, r.dueno_id, u.nombre, au.email::text, r.monto, r.medio, r.operacion, r.estado, r.nota,
           r.created_at, saldo_de(r.dueno_id)
    from recargas_saldo r
    join usuarios u on u.id = r.dueno_id
    left join auth.users au on au.id = r.dueno_id
    order by (r.estado = 'pendiente') desc, r.created_at desc
    limit 200;
end $$;
revoke execute on function admin_recargas() from public, anon;
grant execute on function admin_recargas() to authenticated;

-- rechazos_30_dias: cuántas veces marcó "No me llegó". Muchos = posible cobro por fuera.
create or replace function admin_saldos()
returns table (dueno_id uuid, dueno_nombre text, dueno_correo text, saldo numeric,
               cobradas_30_dias bigint, rechazos_30_dias bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select u.id, u.nombre, au.email::text, saldo_de(u.id),
           (select count(*) from movimientos_saldo m
             where m.dueno_id = u.id and m.tipo = 'reserva' and m.created_at > now() - interval '30 days'),
           (select count(*) from reservas r join canchas c on c.id = r.cancha_id
             where c.dueno_id = u.id and r.pago_rechazado_en > now() - interval '30 days')
    from usuarios u
    left join auth.users au on au.id = u.id
    where u.rol = 'dueno'
    order by saldo_de(u.id) asc;
end $$;
revoke execute on function admin_saldos() from public, anon;
grant execute on function admin_saldos() to authenticated;

-- Aprobar suma el monto al saldo (y el bono si la promoción estaba activa cuando el
-- dueño avisó la recarga); rechazar no suma nada. Errores: sin_permiso, ya_revisada
create or replace function admin_revisar_recarga(p_id uuid, p_aprobar boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v recargas_saldo%rowtype;
  a ajustes_easyfut%rowtype;
  v_bono numeric;
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update recargas_saldo
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         nota = nullif(trim(p_nota), ''), revisada_por = auth.uid(), revisada_en = now()
   where id = p_id and estado = 'pendiente'
  returning * into v;
  if not found then raise exception 'ya_revisada'; end if;
  if p_aprobar then
    insert into movimientos_saldo (dueno_id, tipo, monto, recarga_id, detalle, creado_por)
    values (v.dueno_id, 'recarga', v.monto, v.id,
            'Recarga ' || case v.medio when 'bcp' then 'BCP' else 'Yape' end || ' ' || v.operacion, auth.uid());

    select * into a from ajustes_easyfut where id = 1;
    if a.bono_porcentaje > 0 and v.monto >= a.bono_desde
       and (a.bono_hasta is null or v.created_at <= a.bono_hasta) then
      v_bono := round(v.monto * a.bono_porcentaje / 100, 2);
      if v_bono > 0 then
        insert into movimientos_saldo (dueno_id, tipo, monto, recarga_id, detalle, creado_por)
        values (v.dueno_id, 'bono', v_bono, v.id,
                'Bono de promoción +' || trim_scale(a.bono_porcentaje)::text || ' %', auth.uid());
      end if;
    end if;
  end if;
end $$;

-- Promoción de recarga. p_porcentaje = 0 la apaga. Errores: sin_permiso, datos_invalidos
create or replace function admin_guardar_promocion(p_porcentaje numeric, p_desde numeric, p_hasta timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100
     or p_desde is null or p_desde < 10 or (p_hasta is not null and p_hasta <= now()) then
    raise exception 'datos_invalidos';
  end if;
  update ajustes_easyfut
     set bono_porcentaje = p_porcentaje, bono_desde = p_desde, bono_hasta = p_hasta
   where id = 1;
end $$;
revoke execute on function admin_guardar_promocion(numeric, numeric, timestamptz) from public, anon;
grant execute on function admin_guardar_promocion(numeric, numeric, timestamptz) to authenticated;
revoke execute on function admin_revisar_recarga(uuid, boolean, text) from public, anon;
grant execute on function admin_revisar_recarga(uuid, boolean, text) to authenticated;

-- Corrección manual del saldo (positivo suma, negativo resta). Errores: sin_permiso, datos_invalidos
create or replace function admin_ajustar_saldo(p_dueno uuid, p_monto numeric, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if p_monto is null or p_monto = 0 or abs(p_monto) > 1000 or length(trim(coalesce(p_nota, ''))) < 3 then
    raise exception 'datos_invalidos';
  end if;
  insert into movimientos_saldo (dueno_id, tipo, monto, detalle, creado_por)
  values (p_dueno, 'ajuste', round(p_monto, 2), trim(p_nota), auth.uid());
end $$;
revoke execute on function admin_ajustar_saldo(uuid, numeric, text) from public, anon;
grant execute on function admin_ajustar_saldo(uuid, numeric, text) to authenticated;

-- Yape de EasyFut al que los dueños envían las recargas. Errores: sin_permiso, datos_invalidos
create or replace function admin_guardar_yape(p_numero text, p_titular text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if coalesce(p_numero, '') !~ '^9[0-9]{8}$' or length(trim(coalesce(p_titular, ''))) < 3 then
    raise exception 'datos_invalidos';
  end if;
  update ajustes_easyfut set yape_numero = p_numero, yape_titular = trim(p_titular) where id = 1;
end $$;
revoke execute on function admin_guardar_yape(text, text) from public, anon;
grant execute on function admin_guardar_yape(text, text) to authenticated;

-- Cuenta BCP de EasyFut para recargas por transferencia. Errores: sin_permiso, datos_invalidos
create or replace function admin_guardar_bcp(p_cuenta text, p_cci text, p_titular text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta text := regexp_replace(coalesce(p_cuenta, ''), '\D', '', 'g');
  v_cci    text := nullif(regexp_replace(coalesce(p_cci, ''), '\D', '', 'g'), '');
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if v_cuenta !~ '^[0-9]{13,14}$' or (v_cci is not null and v_cci !~ '^[0-9]{20}$')
     or length(trim(coalesce(p_titular, ''))) < 3 then
    raise exception 'datos_invalidos';
  end if;
  update ajustes_easyfut set bcp_cuenta = v_cuenta, bcp_cci = v_cci, bcp_titular = trim(p_titular) where id = 1;
end $$;
revoke execute on function admin_guardar_bcp(text, text, text) from public, anon;
grant execute on function admin_guardar_bcp(text, text, text) to authenticated;

-- 9. Reservar: la cancha necesita que su dueño tenga saldo ---------------------
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
  -- 021: el dueño necesita saldo para recibir reservas
  if saldo_de(v_cancha.dueno_id) < (select precio_reserva from ajustes_easyfut where id = 1) then
    raise exception 'cancha_sin_saldo';
  end if;

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

-- 10. Descripciones ------------------------------------------------------------
comment on table ajustes_easyfut is 'Ajustes de EasyFut (una sola fila): Yape para recargas, precio por reserva y regalo de bienvenida.';
comment on column ajustes_easyfut.yape_numero is 'Yape de EasyFut al que los dueños envían sus recargas.';
comment on column ajustes_easyfut.yape_titular is 'Nombre que aparece al yapear a EasyFut.';
comment on column ajustes_easyfut.precio_reserva is 'Lo que EasyFut cobra al dueño por cada reserva confirmada (soles).';
comment on column ajustes_easyfut.regalo_bienvenida is 'Saldo gratis que recibe cada dueño nuevo (soles).';
comment on column ajustes_easyfut.bono_porcentaje is 'Promoción de recarga: porcentaje extra que se regala. 0 = apagada.';
comment on column ajustes_easyfut.bono_desde is 'Monto mínimo de recarga para recibir el bono (soles).';
comment on column ajustes_easyfut.bono_hasta is 'Hasta cuándo vale la promoción; vacío = sin fecha de fin.';

comment on table recargas_saldo is 'Avisos de recarga de los dueños: yapearon a EasyFut y esperan que el admin lo apruebe.';
comment on column recargas_saldo.dueno_id is 'Dueño que recarga.';
comment on column recargas_saldo.monto is 'Soles que dice haber yapeado (de 1 a 500).';
comment on column recargas_saldo.medio is 'Cómo pagó: yape o bcp (transferencia).';
comment on column recargas_saldo.operacion is 'Número de operación de Yape o de la transferencia BCP (no se puede repetir).';
comment on column ajustes_easyfut.bcp_cuenta is 'Cuenta BCP de EasyFut para recargas por transferencia.';
comment on column ajustes_easyfut.bcp_cci is 'CCI de esa cuenta (para transferir desde otros bancos).';
comment on column ajustes_easyfut.bcp_titular is 'Titular de la cuenta BCP.';
comment on column recargas_saldo.estado is 'pendiente, aprobada o rechazada.';
comment on column recargas_saldo.nota is 'Comentario del admin al revisarla.';
comment on column recargas_saldo.revisada_por is 'Admin que la revisó.';
comment on column recargas_saldo.revisada_en is 'Cuándo se revisó.';

comment on table movimientos_saldo is 'Cada suma o resta al saldo de un dueño. El saldo es la suma de todos sus montos.';
comment on column movimientos_saldo.dueno_id is 'Dueño al que pertenece el movimiento.';
comment on column movimientos_saldo.tipo is 'regalo (bienvenida), recarga (Yape aprobado), bono (promoción), reserva (cobro de S/ 1) o ajuste (corrección del admin).';
comment on column movimientos_saldo.monto is 'Positivo suma, negativo resta (soles).';
comment on column movimientos_saldo.reserva_id is 'Reserva cobrada (solo tipo reserva).';
comment on column movimientos_saldo.recarga_id is 'Recarga aprobada (solo tipo recarga).';
comment on column movimientos_saldo.detalle is 'Texto que ve el dueño en su historial.';
comment on column movimientos_saldo.creado_por is 'Admin que hizo la recarga o el ajuste.';

commit;

-- Para que la API vea los cambios al instante
notify pgrst, 'reload schema';
