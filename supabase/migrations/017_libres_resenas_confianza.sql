-- 017: "libre a tal hora", reseñas verificadas e indicadores de confianza.
-- Requiere 016. Ejecutar una sola vez en SQL Editor → Run.

-- 1. Canchas libres en una fecha y hora -------------------------------------------
--    Devuelve, por cada cancha publicada, el primer turno libre que empieza
--    entre p_hora y p_hora + 59 minutos de ese día (hora de Lima).
create or replace function canchas_libres(p_fecha date, p_hora time)
returns table (cancha_id uuid, inicio timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (c.id) c.id, s.ini
  from canchas c
  join franjas f
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
grant execute on function canchas_libres(date, time) to anon, authenticated;

-- 2. Reseñas --------------------------------------------------------------------------
--    Solo de reservas PAGADAS cuyo partido ya terminó: una reseña por reserva.
create table if not exists resenas (
  id            uuid primary key default gen_random_uuid(),
  cancha_id     uuid not null references canchas(id) on delete cascade,
  reserva_id    uuid not null unique references reservas(id) on delete cascade,
  estrellas     smallint not null check (estrellas between 1 and 5),
  comentario    text check (char_length(comentario) <= 500),
  nombre        text,                         -- solo el primer nombre del jugador
  respuesta     text check (char_length(respuesta) <= 500),
  respondida_en timestamptz,
  oculta        boolean not null default false,
  reportes      int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists resenas_cancha_idx on resenas (cancha_id, created_at desc);

alter table resenas enable row level security;

-- Todos ven las reseñas no ocultas de canchas publicadas
drop policy if exists resenas_publicas on resenas;
create policy resenas_publicas on resenas
  for select using (not oculta and exists (select 1 from canchas c where c.id = resenas.cancha_id and c.activa));

-- El dueño ve todas las de sus canchas (incluidas las ocultas)
drop policy if exists resenas_dueno on resenas;
create policy resenas_dueno on resenas
  for select using (exists (select 1 from canchas c where c.id = resenas.cancha_id and c.dueno_id = auth.uid()));

drop policy if exists resenas_admin on resenas;
create policy resenas_admin on resenas for all using (es_admin()) with check (es_admin());

-- Nadie escribe directo en la tabla: solo con las funciones de abajo
revoke insert, update, delete on resenas from anon, authenticated;

-- Quién reportó qué (para que cada número/conexión reporte una sola vez)
create table if not exists reportes_resenas (
  resena_id uuid not null references resenas(id) on delete cascade,
  origen    text not null,
  motivo    text,
  created_at timestamptz not null default now(),
  primary key (resena_id, origen)
);
alter table reportes_resenas enable row level security;
drop policy if exists reportes_admin on reportes_resenas;
create policy reportes_admin on reportes_resenas for select using (es_admin());

-- 2.1 Escribir una reseña con el código de la reserva
--     Errores: reserva_no_existe, no_calificable, ya_calificada, datos_invalidos
create or replace function crear_resena(p_codigo text, p_estrellas int, p_comentario text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v reservas%rowtype;
  v_id uuid;
begin
  select * into v from reservas where codigo = upper(trim(p_codigo));
  if not found then raise exception 'reserva_no_existe'; end if;
  -- Solo quien jugó: reserva pagada, partido terminado, dentro de 30 días
  if v.estado <> 'confirmada' or v.fin > now() or v.fin < now() - interval '30 days' then
    raise exception 'no_calificable';
  end if;
  if exists (select 1 from resenas where reserva_id = v.id) then raise exception 'ya_calificada'; end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5
     or char_length(coalesce(p_comentario, '')) > 500 then
    raise exception 'datos_invalidos';
  end if;

  insert into resenas (cancha_id, reserva_id, estrellas, comentario, nombre)
  values (v.cancha_id, v.id, p_estrellas, nullif(trim(p_comentario), ''),
          split_part(trim(coalesce(v.nombre_cliente, '')), ' ', 1))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function crear_resena(text, int, text) to anon, authenticated;

-- 2.2 ¿Esta reserva ya tiene reseña? (para la página de la reserva)
create or replace function resena_de_reserva(p_codigo text)
returns table (estrellas smallint, comentario text, respuesta text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.estrellas, x.comentario, x.respuesta, x.created_at
  from resenas x join reservas r on r.id = x.reserva_id
  where r.codigo = upper(trim(p_codigo));
$$;
grant execute on function resena_de_reserva(text) to anon, authenticated;

-- 2.3 El dueño responde (una respuesta por reseña; puede corregirla)
create or replace function responder_resena(p_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (es_admin() or exists (
    select 1 from resenas x join canchas c on c.id = x.cancha_id
    where x.id = p_id and c.dueno_id = auth.uid())) then
    raise exception 'sin_permiso';
  end if;
  if char_length(coalesce(p_texto, '')) > 500 then raise exception 'datos_invalidos'; end if;
  update resenas
     set respuesta = nullif(trim(p_texto), ''),
         respondida_en = case when nullif(trim(p_texto), '') is null then null else now() end
   where id = p_id;
end $$;
revoke execute on function responder_resena(uuid, text) from public, anon;
grant execute on function responder_resena(uuid, text) to authenticated;

-- 2.4 Cualquiera puede reportar una reseña ofensiva o falsa (una vez por conexión)
create or replace function reportar_resena(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_origen text := coalesce(auth.uid()::text, ip_solicitud(), 'anonimo');
begin
  insert into reportes_resenas (resena_id, origen, motivo)
  values (p_id, v_origen, left(nullif(trim(p_motivo), ''), 200))
  on conflict do nothing;
  if found then
    update resenas set reportes = reportes + 1 where id = p_id;
  end if;
end $$;
grant execute on function reportar_resena(uuid, text) to anon, authenticated;

-- 2.5 El administrador oculta o vuelve a mostrar una reseña
create or replace function admin_ocultar_resena(p_id uuid, p_oculta boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update resenas set oculta = p_oculta where id = p_id;
end $$;
revoke execute on function admin_ocultar_resena(uuid, boolean) from public, anon;
grant execute on function admin_ocultar_resena(uuid, boolean) to authenticated;

create or replace function admin_resenas()
returns table (id uuid, cancha_id uuid, cancha_nombre text, estrellas smallint, comentario text,
               nombre text, respuesta text, oculta boolean, reportes int, motivos text[],
               created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select x.id, x.cancha_id, c.nombre, x.estrellas, x.comentario, x.nombre, x.respuesta,
           x.oculta, x.reportes,
           array(select r.motivo from reportes_resenas r where r.resena_id = x.id and r.motivo is not null),
           x.created_at
    from resenas x join canchas c on c.id = x.cancha_id
    order by x.reportes desc, x.created_at desc
    limit 200;
end $$;
revoke execute on function admin_resenas() from public, anon;
grant execute on function admin_resenas() to authenticated;

-- 3. Confianza: datos públicos que ayudan a decidir --------------------------------
create or replace function confianza_canchas(p_ids uuid[])
returns table (cancha_id uuid, promedio numeric, total_resenas bigint, partidos bigint,
               dueno_verificado boolean, desde timestamptz, respuestas bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         (select round(avg(x.estrellas)::numeric, 1) from resenas x where x.cancha_id = c.id and not x.oculta),
         (select count(*) from resenas x where x.cancha_id = c.id and not x.oculta),
         (select count(*) from reservas r where r.cancha_id = c.id and r.estado = 'confirmada' and r.fin < now()),
         p.telefono_verificado is not null,
         c.created_at,
         (select count(*) from resenas x where x.cancha_id = c.id and not x.oculta and x.respuesta is not null)
  from canchas c
  left join perfiles p on p.id = c.dueno_id
  where c.id = any(p_ids) and c.activa;
$$;
grant execute on function confianza_canchas(uuid[]) to anon, authenticated;
