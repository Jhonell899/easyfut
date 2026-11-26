-- =============================================================================
-- 022 · Recargas que se confirman solas
--
-- A) "Confía y verifica": una recarga chica (hasta S/ 20, configurable) se suma al
--    saldo AL INSTANTE y queda "por verificar". El admin la revisa después:
--    "Llegó" la deja firme; "No llegó" anula el saldo y bloquea las recargas
--    automáticas de ese dueño. Límites: una sola sin verificar a la vez y como
--    máximo S/ 50 al día sin verificar (configurable).
--
-- B) Avisos del banco: un script en el Gmail de EasyFut lee las alertas del BCP
--    (y de Yape, si llegan por correo) y las envía a EasyFut con una clave secreta.
--    Si el aviso coincide con una recarga, esta se confirma sola.
--
-- Regla para confirmar sola (por aviso): mismo MONTO, mismo MEDIO, el pago viene del
-- NOMBRE del dueño y, si el aviso trae un celular o número de operación, deben ser
-- el MISMO que el del dueño / el que escribió el dueño. Si algo no coincide, la
-- recarga queda para revisión del admin.
--
-- Requiere la 021. Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Ajustes: límites de la aprobación al instante ---------------------------
alter table ajustes_easyfut add column if not exists auto_hasta numeric(10,2) not null default 20
  check (auto_hasta >= 0 and auto_hasta <= 500);
alter table ajustes_easyfut add column if not exists auto_por_dia numeric(10,2) not null default 50
  check (auto_por_dia >= 0 and auto_por_dia <= 2000);

-- 2. Recargas: verificación, código de Yape y de quién debe venir el pago -------
alter table recargas_saldo add column if not exists verificacion text not null default 'no_aplica'
  check (verificacion in ('no_aplica', 'por_verificar', 'verificada', 'fallida'));
alter table recargas_saldo add column if not exists codigo_seguridad text
  check (codigo_seguridad ~ '^[0-9]{3}$');
alter table recargas_saldo add column if not exists pagador_nombre text;
alter table recargas_saldo add column if not exists pagador_celular text;
alter table recargas_saldo add column if not exists verificada_por text;
alter table recargas_saldo add column if not exists verificada_en timestamptz;

-- 3. Dueños a los que se les quitó la recarga al instante -------------------------
--    (los dueños solo pueden editar nombre y celular: no pueden quitarse el bloqueo)
alter table usuarios add column if not exists recarga_auto_bloqueada boolean not null default false;

-- 4. Avisos del banco y clave secreta ---------------------------------------------
create table if not exists avisos_banco (
  id          uuid primary key default gen_random_uuid(),
  medio       text not null check (medio in ('yape', 'bcp')),
  monto       numeric(10,2) not null,
  operacion   text,
  nombre      text,
  celular     text,
  fecha       timestamptz,
  recarga_id  uuid references recargas_saldo(id) on delete set null,
  resultado   text not null,
  created_at  timestamptz not null default now()
);
-- El mismo aviso (medio + operación) no se procesa dos veces
create unique index if not exists avisos_banco_unico on avisos_banco (medio, operacion) where operacion is not null;
alter table avisos_banco enable row level security;
drop policy if exists avisos_admin on avisos_banco;
create policy avisos_admin on avisos_banco for select using (es_admin());

-- Solo se guarda la huella de la clave, nunca la clave
create table if not exists secretos_easyfut (
  clave      text primary key,
  huella     text not null,
  created_at timestamptz not null default now()
);
alter table secretos_easyfut enable row level security;  -- sin políticas: nadie lo lee desde la app

-- 5. Utilidades -------------------------------------------------------------------
-- Texto sin tildes, en minúsculas y solo letras/espacios
create or replace function normalizar_nombre(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(coalesce(t, '')), 'áéíóúäëïöüñ', 'aeiouaeioun'),
    '[^a-z ]', ' ', 'g'));
$$;

-- ¿El nombre del pago corresponde al dueño? Acepta abreviaturas ("Huamani L.")
-- y otro orden ("HUAMANI LLALLICO JHONELL"). Pide 2 palabras en común
-- (o 1 si el nombre del dueño tiene una sola palabra).
create or replace function nombre_coincide(p_pago text, p_dueno text) returns boolean
language plpgsql immutable as $$
declare
  pago  text[] := array(select x from unnest(string_to_array(normalizar_nombre(p_pago), ' ')) x where length(x) >= 3);
  dueno text[] := array(select x from unnest(string_to_array(normalizar_nombre(p_dueno), ' ')) x where length(x) >= 3);
  comunes int;
begin
  if coalesce(array_length(pago, 1), 0) = 0 or coalesce(array_length(dueno, 1), 0) = 0 then return false; end if;
  select count(*) into comunes
  from unnest(pago) p
  where exists (select 1 from unnest(dueno) d where d = p or d like p || '%' or p like d || '%');
  return comunes >= least(2, array_length(dueno, 1));
end $$;

-- Suma una recarga al saldo (y el bono si había promoción cuando se avisó)
create or replace function sumar_recarga(p_recarga uuid, p_creado_por uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v recargas_saldo%rowtype;
  a ajustes_easyfut%rowtype;
  v_bono numeric;
begin
  select * into v from recargas_saldo where id = p_recarga;
  insert into movimientos_saldo (dueno_id, tipo, monto, recarga_id, detalle, creado_por)
  values (v.dueno_id, 'recarga', v.monto, v.id,
          'Recarga ' || case v.medio when 'bcp' then 'BCP' else 'Yape' end || ' ' || v.operacion, p_creado_por);
  select * into a from ajustes_easyfut where id = 1;
  if a.bono_porcentaje > 0 and v.monto >= a.bono_desde
     and (a.bono_hasta is null or v.created_at <= a.bono_hasta) then
    v_bono := round(v.monto * a.bono_porcentaje / 100, 2);
    if v_bono > 0 then
      insert into movimientos_saldo (dueno_id, tipo, monto, recarga_id, detalle, creado_por)
      values (v.dueno_id, 'bono', v_bono, v.id,
              'Bono de promoción +' || trim_scale(a.bono_porcentaje)::text || ' %', p_creado_por);
    end if;
  end if;
end $$;
revoke execute on function sumar_recarga(uuid, uuid) from public, anon, authenticated;

-- Anula todo lo que una recarga sumó (recarga + bono) y la marca como fallida
create or replace function anular_recarga(p_recarga uuid, p_motivo text, p_creado_por uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v recargas_saldo%rowtype;
  v_total numeric;
begin
  select * into v from recargas_saldo where id = p_recarga for update;
  select coalesce(sum(monto), 0) into v_total from movimientos_saldo
   where recarga_id = v.id and tipo in ('recarga', 'bono');
  if v_total <> 0 then
    insert into movimientos_saldo (dueno_id, tipo, monto, recarga_id, detalle, creado_por)
    values (v.dueno_id, 'ajuste', -v_total, v.id, 'Recarga anulada: ' || coalesce(p_motivo, 'el pago no llegó'), p_creado_por);
  end if;
  update recargas_saldo
     set estado = 'rechazada', verificacion = 'fallida', nota = p_motivo,
         verificada_por = 'admin', verificada_en = now(), revisada_por = p_creado_por, revisada_en = now()
   where id = v.id;
  update usuarios set recarga_auto_bloqueada = true where id = v.dueno_id;
end $$;
revoke execute on function anular_recarga(uuid, text, uuid) from public, anon, authenticated;

-- 6. El dueño avisa una recarga (ahora puede sumarse al instante) ----------------
-- Devuelve el id y si se sumó al instante.
-- Errores: sin_permiso, monto_invalido, medio_no_disponible, operacion_invalida,
--          codigo_invalido, operacion_repetida, demasiadas_pendientes
drop function if exists pedir_recarga(numeric, text, text);
create function pedir_recarga(p_monto numeric, p_operacion text, p_medio text default 'yape',
                              p_codigo_seguridad text default null)
returns table (recarga_id uuid, al_instante boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_op     text := upper(regexp_replace(coalesce(p_operacion, ''), '[\s-]', '', 'g'));
  v_codigo text := nullif(regexp_replace(coalesce(p_codigo_seguridad, ''), '\D', '', 'g'), '');
  v_id     uuid;
  v_auto   boolean := false;
  a        ajustes_easyfut%rowtype;
  u        usuarios%rowtype;
begin
  if not es_dueno() then raise exception 'sin_permiso'; end if;
  if p_monto is null or p_monto < 1 or p_monto > 500 then raise exception 'monto_invalido'; end if;
  select * into a from ajustes_easyfut where id = 1;
  select * into u from usuarios where id = auth.uid();
  if p_medio = 'yape' then
    if a.yape_numero is null then raise exception 'medio_no_disponible'; end if;
  elsif p_medio = 'bcp' then
    if a.bcp_cuenta is null then raise exception 'medio_no_disponible'; end if;
  else
    raise exception 'medio_no_disponible';
  end if;
  if v_op !~ '^[0-9A-Z]{4,20}$' then raise exception 'operacion_invalida'; end if;
  if v_codigo is not null and v_codigo !~ '^[0-9]{3}$' then raise exception 'codigo_invalido'; end if;
  if (select count(*) from recargas_saldo where dueno_id = auth.uid() and estado = 'pendiente') >= 3 then
    raise exception 'demasiadas_pendientes';
  end if;

  -- ¿Se puede sumar al instante?
  v_auto := not u.recarga_auto_bloqueada
    and a.auto_hasta > 0 and p_monto <= a.auto_hasta
    and not exists (select 1 from recargas_saldo
                     where dueno_id = auth.uid() and verificacion = 'por_verificar')
    and (select coalesce(sum(monto), 0) from recargas_saldo
          where dueno_id = auth.uid() and verificacion in ('por_verificar', 'verificada')
            and verificada_por is distinct from 'admin_manual'
            and created_at > now() - interval '24 hours') + p_monto <= a.auto_por_dia;

  insert into recargas_saldo (dueno_id, monto, medio, operacion, codigo_seguridad,
                              pagador_nombre, pagador_celular, estado, verificacion)
  values (auth.uid(), round(p_monto, 2), p_medio, v_op, v_codigo,
          u.nombre, coalesce(u.celular_verificado, u.celular),
          case when v_auto then 'aprobada' else 'pendiente' end,
          case when v_auto then 'por_verificar' else 'no_aplica' end)
  returning id into v_id;

  if v_auto then
    update recargas_saldo set revisada_en = now(), nota = 'Sumada al instante; falta verificar' where id = v_id;
    perform sumar_recarga(v_id, null);
  end if;

  return query select v_id, v_auto;
exception when unique_violation then
  raise exception 'operacion_repetida';
end $$;
revoke execute on function pedir_recarga(numeric, text, text, text) from public, anon;
grant execute on function pedir_recarga(numeric, text, text, text) to authenticated;

-- 7. Admin: aprobar recargas grandes (igual que antes, ahora con sumar_recarga) ----
create or replace function admin_revisar_recarga(p_id uuid, p_aprobar boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v recargas_saldo%rowtype;
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update recargas_saldo
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         verificacion = case when p_aprobar then 'verificada' else 'fallida' end,
         verificada_por = 'admin_manual', verificada_en = now(),
         nota = nullif(trim(p_nota), ''), revisada_por = auth.uid(), revisada_en = now()
   where id = p_id and estado = 'pendiente'
  returning * into v;
  if not found then raise exception 'ya_revisada'; end if;
  if p_aprobar then perform sumar_recarga(v.id, auth.uid()); end if;
end $$;

-- Admin: verificar una recarga que ya se sumó al instante. Errores: sin_permiso, ya_verificada
create or replace function admin_verificar_recarga(p_id uuid, p_llego boolean, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if not exists (select 1 from recargas_saldo where id = p_id and verificacion = 'por_verificar') then
    raise exception 'ya_verificada';
  end if;
  if p_llego then
    update recargas_saldo
       set verificacion = 'verificada', verificada_por = 'admin', verificada_en = now(),
           revisada_por = auth.uid(), nota = 'Verificada por el admin'
     where id = p_id;
  else
    perform anular_recarga(p_id, coalesce(nullif(trim(p_nota), ''), 'El pago no llegó'), auth.uid());
  end if;
end $$;
revoke execute on function admin_verificar_recarga(uuid, boolean, text) from public, anon;
grant execute on function admin_verificar_recarga(uuid, boolean, text) to authenticated;

-- Admin: devolver la recarga al instante a un dueño bloqueado
create or replace function admin_permitir_recarga_auto(p_dueno uuid, p_permitir boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update usuarios set recarga_auto_bloqueada = not p_permitir where id = p_dueno;
end $$;
revoke execute on function admin_permitir_recarga_auto(uuid, boolean) from public, anon;
grant execute on function admin_permitir_recarga_auto(uuid, boolean) to authenticated;

-- Admin: límites de la recarga al instante (0 la apaga). Errores: sin_permiso, datos_invalidos
create or replace function admin_guardar_limites_auto(p_hasta numeric, p_por_dia numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if p_hasta is null or p_hasta < 0 or p_hasta > 500 or p_por_dia is null or p_por_dia < 0 or p_por_dia > 2000 then
    raise exception 'datos_invalidos';
  end if;
  update ajustes_easyfut set auto_hasta = round(p_hasta, 2), auto_por_dia = round(p_por_dia, 2) where id = 1;
end $$;
revoke execute on function admin_guardar_limites_auto(numeric, numeric) from public, anon;
grant execute on function admin_guardar_limites_auto(numeric, numeric) to authenticated;

-- Admin: crea (o cambia) la clave secreta del script de avisos. Se muestra UNA vez.
create or replace function admin_generar_clave_avisos() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_clave text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  insert into secretos_easyfut (clave, huella) values ('avisos_banco', encode(extensions.digest(v_clave, 'sha256'), 'hex'))
  on conflict (clave) do update set huella = excluded.huella, created_at = now();
  return v_clave;
end $$;
revoke execute on function admin_generar_clave_avisos() from public, anon;
grant execute on function admin_generar_clave_avisos() to authenticated;

-- 8. Aviso del banco (lo llama el script del Gmail de EasyFut con la clave) ------
-- Devuelve: confirmada, ya_confirmada, sin_coincidencia, repetido
-- Errores: clave_invalida, datos_invalidos
create or replace function aviso_banco(p_clave text, p_medio text, p_monto numeric, p_operacion text,
                                       p_nombre text, p_celular text, p_fecha timestamptz)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_op      text := nullif(upper(regexp_replace(coalesce(p_operacion, ''), '[\s-]', '', 'g')), '');
  v_cel     text := nullif(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), '');
  v_fecha   timestamptz := coalesce(p_fecha, now());
  v_aviso   uuid;
  r         recargas_saldo%rowtype;
begin
  if not exists (select 1 from secretos_easyfut
                  where clave = 'avisos_banco'
                    and huella = encode(extensions.digest(coalesce(p_clave, ''), 'sha256'), 'hex')) then
    raise exception 'clave_invalida';
  end if;
  if p_medio not in ('yape', 'bcp') or p_monto is null or p_monto <= 0 or p_monto > 100000 then
    raise exception 'datos_invalidos';
  end if;

  begin
    insert into avisos_banco (medio, monto, operacion, nombre, celular, fecha, resultado)
    values (p_medio, round(p_monto, 2), v_op, left(p_nombre, 120), v_cel, v_fecha, 'sin_coincidencia')
    returning id into v_aviso;
  exception when unique_violation then
    return 'repetido';
  end;

  -- Busca la recarga: mismo medio y monto, avisada cerca de la fecha del pago,
  -- del mismo dueño (nombre) y con el mismo celular / número de operación si el aviso los trae.
  select x.* into r
  from recargas_saldo x
  where x.medio = p_medio
    and x.monto = round(p_monto, 2)
    and (x.estado = 'pendiente' or x.verificacion = 'por_verificar')
    and x.created_at between v_fecha - interval '2 days' and v_fecha + interval '2 days'
    and nombre_coincide(p_nombre, x.pagador_nombre)
    and (v_op is null or x.operacion = v_op or right(x.operacion, 6) = right(v_op, 6))
    and (v_cel is null or x.pagador_celular = v_cel
         or (length(v_cel) between 3 and 4 and right(x.pagador_celular, length(v_cel)) = v_cel))
  order by abs(extract(epoch from (x.created_at - v_fecha)))
  limit 1
  for update;

  if not found then return 'sin_coincidencia'; end if;

  if r.estado = 'pendiente' then
    update recargas_saldo
       set estado = 'aprobada', verificacion = 'verificada', verificada_por = 'aviso_' || p_medio,
           verificada_en = now(), revisada_en = now(), nota = 'Confirmada por aviso del banco'
     where id = r.id;
    perform sumar_recarga(r.id, null);
  else
    update recargas_saldo
       set verificacion = 'verificada', verificada_por = 'aviso_' || p_medio, verificada_en = now(),
           nota = 'Verificada por aviso del banco'
     where id = r.id;
  end if;
  update avisos_banco set recarga_id = r.id, resultado = 'confirmada' where id = v_aviso;
  return 'confirmada';
end $$;
revoke execute on function aviso_banco(text, text, numeric, text, text, text, timestamptz) from public, authenticated;
grant execute on function aviso_banco(text, text, numeric, text, text, text, timestamptz) to anon;

-- 9. Listas del admin y saldo del dueño con los datos nuevos ----------------------
drop function if exists admin_recargas();
create function admin_recargas()
returns table (id uuid, dueno_id uuid, dueno_nombre text, dueno_correo text, monto numeric,
               medio text, operacion text, codigo_seguridad text, pagador_nombre text, pagador_celular text,
               estado text, verificacion text, verificada_por text, nota text, created_at timestamptz, saldo numeric)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.id, r.dueno_id, u.nombre, au.email::text, r.monto, r.medio, r.operacion, r.codigo_seguridad,
           r.pagador_nombre, r.pagador_celular, r.estado, r.verificacion, r.verificada_por, r.nota,
           r.created_at, saldo_de(r.dueno_id)
    from recargas_saldo r
    join usuarios u on u.id = r.dueno_id
    left join auth.users au on au.id = r.dueno_id
    order by (r.estado = 'pendiente' or r.verificacion = 'por_verificar') desc, r.created_at desc
    limit 200;
end $$;
revoke execute on function admin_recargas() from public, anon;
grant execute on function admin_recargas() to authenticated;

drop function if exists admin_saldos();
create function admin_saldos()
returns table (dueno_id uuid, dueno_nombre text, dueno_correo text, saldo numeric,
               cobradas_30_dias bigint, rechazos_30_dias bigint, recarga_auto_bloqueada boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select u.id, u.nombre, au.email::text, saldo_de(u.id),
           (select count(*) from movimientos_saldo m
             where m.dueno_id = u.id and m.tipo = 'reserva' and m.created_at > now() - interval '30 days'),
           (select count(*) from reservas r join canchas c on c.id = r.cancha_id
             where c.dueno_id = u.id and r.pago_rechazado_en > now() - interval '30 days'),
           u.recarga_auto_bloqueada
    from usuarios u
    left join auth.users au on au.id = u.id
    where u.rol = 'dueno'
    order by saldo_de(u.id) asc;
end $$;
revoke execute on function admin_saldos() from public, anon;
grant execute on function admin_saldos() to authenticated;

create or replace function admin_avisos_banco()
returns table (id uuid, medio text, monto numeric, operacion text, nombre text, celular text,
               fecha timestamptz, resultado text, recarga_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select a.id, a.medio, a.monto, a.operacion, a.nombre, a.celular, a.fecha, a.resultado, a.recarga_id, a.created_at
    from avisos_banco a order by a.created_at desc limit 100;
end $$;
revoke execute on function admin_avisos_banco() from public, anon;
grant execute on function admin_avisos_banco() to authenticated;

drop function if exists mi_saldo();
create function mi_saldo()
returns table (saldo numeric, precio_reserva numeric, reservas_disponibles int,
               yape_numero text, yape_titular text,
               bcp_cuenta text, bcp_cci text, bcp_titular text,
               bono_porcentaje numeric, bono_desde numeric, bono_hasta timestamptz,
               reservas_mes bigint, gastado_mes numeric,
               auto_hasta numeric, recarga_auto_bloqueada boolean,
               mi_nombre text, mi_celular text)
language sql stable security definer set search_path = public as $$
  select saldo_de(auth.uid()), a.precio_reserva,
         greatest(floor(saldo_de(auth.uid()) / a.precio_reserva), 0)::int,
         a.yape_numero, a.yape_titular,
         a.bcp_cuenta, a.bcp_cci, a.bcp_titular,
         case when bono_vigente(a) then a.bono_porcentaje else 0 end, a.bono_desde, a.bono_hasta,
         m.cantidad, m.total,
         a.auto_hasta, u.recarga_auto_bloqueada,
         u.nombre, coalesce(u.celular_verificado, u.celular)
  from ajustes_easyfut a
  join usuarios u on u.id = auth.uid()
  cross join lateral (
    select count(*) as cantidad, coalesce(-sum(x.monto), 0) as total
    from movimientos_saldo x
    where x.dueno_id = auth.uid() and x.tipo = 'reserva'
      and x.created_at >= date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima'
  ) m
  where a.id = 1;
$$;
revoke execute on function mi_saldo() from public, anon;
grant execute on function mi_saldo() to authenticated;

-- 10. Descripciones ----------------------------------------------------------------
comment on column ajustes_easyfut.auto_hasta is 'Recargas de hasta este monto se suman al instante (0 = apagado).';
comment on column ajustes_easyfut.auto_por_dia is 'Máximo sumado al instante por dueño en 24 horas sin verificar.';
comment on column recargas_saldo.verificacion is 'no_aplica (espera aprobación), por_verificar (sumada al instante), verificada o fallida.';
comment on column recargas_saldo.codigo_seguridad is 'Código de seguridad de 3 dígitos del comprobante de Yape.';
comment on column recargas_saldo.pagador_nombre is 'Nombre del dueño al avisar: el pago debe venir de este nombre.';
comment on column recargas_saldo.pagador_celular is 'Celular del dueño al avisar: el Yape debe venir de este número.';
comment on column recargas_saldo.verificada_por is 'admin, admin_manual o aviso_bcp / aviso_yape (confirmada sola).';
comment on column usuarios.recarga_auto_bloqueada is 'true = ya no se le suman recargas al instante (avisó un pago que no llegó).';
comment on table avisos_banco is 'Alertas de pago leídas del correo de EasyFut (BCP / Yape) y si coincidieron con una recarga.';
comment on table secretos_easyfut is 'Huellas de claves secretas (nunca la clave). Sin acceso desde la app.';

commit;

notify pgrst, 'reload schema';
