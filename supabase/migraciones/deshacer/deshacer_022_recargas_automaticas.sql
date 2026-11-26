-- =============================================================================
-- Deshacer la 022 (recargas que se confirman solas)
--
-- Deja la base de datos exactamente como estaba con la 021:
--   · borra la aprobación al instante, los avisos del banco y su clave
--   · vuelve a poner las funciones de la 021 (pedir_recarga, admin_recargas,
--     admin_saldos, mi_saldo, admin_revisar_recarga)
--   · borra las columnas y tablas nuevas
-- La 022 sigue guardada en la rama de git mejora/recargas-automaticas para probarla después.
--
-- Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Funciones nuevas de la 022
drop function if exists aviso_banco(text, text, numeric, text, text, text, timestamptz);
drop function if exists admin_avisos_banco();
drop function if exists admin_generar_clave_avisos();
drop function if exists admin_guardar_limites_auto(numeric, numeric);
drop function if exists admin_permitir_recarga_auto(uuid, boolean);
drop function if exists admin_verificar_recarga(uuid, boolean, text);
drop function if exists anular_recarga(uuid, text, uuid);
drop function if exists sumar_recarga(uuid, uuid);
drop function if exists nombre_coincide(text, text);
drop function if exists normalizar_nombre(text);

-- 2. Funciones que la 022 cambió: se borran y vuelven como en la 021
drop function if exists pedir_recarga(numeric, text, text, text);
drop function if exists pedir_recarga(numeric, text, text);
drop function if exists admin_recargas();
drop function if exists admin_saldos();
drop function if exists mi_saldo();

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

-- 3. Tablas y columnas nuevas de la 022
drop table if exists avisos_banco;
drop table if exists secretos_easyfut;

alter table recargas_saldo
  drop column if exists verificacion,
  drop column if exists codigo_seguridad,
  drop column if exists pagador_nombre,
  drop column if exists pagador_celular,
  drop column if exists verificada_por,
  drop column if exists verificada_en;

alter table usuarios drop column if exists recarga_auto_bloqueada;

alter table ajustes_easyfut
  drop column if exists auto_hasta,
  drop column if exists auto_por_dia;

commit;

notify pgrst, 'reload schema';
