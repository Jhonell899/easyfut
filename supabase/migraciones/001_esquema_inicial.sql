-- =====================================================================
-- SaaS de reservas de canchas · Esquema v0.1 (Supabase / PostgreSQL)
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run
-- Zona horaria de negocio: America/Lima. Las fechas se guardan en UTC.
-- =====================================================================

create extension if not exists btree_gist;  -- necesario para evitar solapamientos

-- ---------------------------------------------------------------------
-- 1. PERFILES (dueños de canchas). Se crea solo al registrarse en Auth.
-- ---------------------------------------------------------------------
create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  celular     text,
  created_at  timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre)
  values (new.id, new.raw_user_meta_data->>'nombre');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 2. CANCHAS
-- ---------------------------------------------------------------------
create table canchas (
  id                 uuid primary key default gen_random_uuid(),
  dueno_id           uuid not null references perfiles(id) on delete cascade,
  nombre             text not null,
  slug               text not null unique,            -- para /c/[slug]
  descripcion        text,
  deporte            text not null
                     check (deporte in ('futbol','futsal','voley','basquet','otro')),
  superficie         text,                            -- ej. grass sintético
  direccion          text not null,
  distrito           text not null,
  latitud            numeric(9,6),
  longitud           numeric(9,6),
  servicios          text[] not null default '{}',    -- iluminación, vestidores...
  fotos              text[] not null default '{}',    -- URLs de Supabase Storage
  duracion_turno_min int not null default 60
                     check (duracion_turno_min in (30,60,90,120)),
  activa             boolean not null default true,
  created_at         timestamptz not null default now()
);

create index canchas_distrito_idx on canchas (distrito) where activa;

-- ---------------------------------------------------------------------
-- 3. FRANJAS: horario de atención + precio por hora, por día de semana.
--    Si no hay franja para un horario, esa hora NO está disponible.
--    dia_semana: 0 = domingo ... 6 = sábado. Una franja no cruza la
--    medianoche (usa hora_fin = '24:00' para cerrar a medianoche).
-- ---------------------------------------------------------------------
create table franjas (
  id           uuid primary key default gen_random_uuid(),
  cancha_id    uuid not null references canchas(id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fin     time not null,
  precio_hora  numeric(10,2) not null check (precio_hora >= 0),
  check (hora_fin > hora_inicio)
);

-- Evita franjas que se pisan el mismo día en la misma cancha
alter table franjas add constraint franjas_sin_solapes
  exclude using gist (
    cancha_id  with =,
    dia_semana with =,
    numrange(extract(epoch from hora_inicio)::numeric,
             extract(epoch from hora_fin)::numeric) with &&
  );

-- ---------------------------------------------------------------------
-- 4. RESERVAS (incluye bloqueos manuales del dueño con estado 'bloqueo')
-- ---------------------------------------------------------------------
create table reservas (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique
                   default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  cancha_id        uuid not null references canchas(id) on delete cascade,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente','confirmada','cancelada','expirada','bloqueo')),
  nombre_cliente   text,
  celular_cliente  text,
  monto            numeric(10,2) not null default 0,
  comprobante_url  text,
  nota             text,
  expira_en        timestamptz,                       -- solo para 'pendiente'
  created_at       timestamptz not null default now(),
  check (fin > inicio),
  check (estado = 'bloqueo'
         or (nombre_cliente is not null and celular_cliente is not null))
);

create index reservas_cancha_inicio_idx on reservas (cancha_id, inicio);

-- LA REGLA CLAVE: la base de datos rechaza dos reservas activas que se
-- solapen en la misma cancha, aunque lleguen en el mismo segundo.
alter table reservas add constraint reservas_sin_solapes
  exclude using gist (
    cancha_id with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado in ('pendiente','confirmada','bloqueo'));

-- ---------------------------------------------------------------------
-- 5. SEGURIDAD (Row Level Security)
--    El público NO lee la tabla reservas: solo usa las funciones de abajo.
-- ---------------------------------------------------------------------
alter table perfiles enable row level security;
alter table canchas  enable row level security;
alter table franjas  enable row level security;
alter table reservas enable row level security;

create policy perfiles_propio on perfiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy canchas_publicas on canchas
  for select using (activa);

create policy canchas_dueno on canchas
  for all using (dueno_id = auth.uid()) with check (dueno_id = auth.uid());

create policy franjas_publicas on franjas
  for select using (exists (
    select 1 from canchas c where c.id = franjas.cancha_id and c.activa));

create policy franjas_dueno on franjas
  for all
  using (exists (
    select 1 from canchas c where c.id = franjas.cancha_id and c.dueno_id = auth.uid()))
  with check (exists (
    select 1 from canchas c where c.id = franjas.cancha_id and c.dueno_id = auth.uid()));

-- El dueño ve y gestiona las reservas de SUS canchas (confirmar, cancelar,
-- bloquear horarios, registrar reservas presenciales).
create policy reservas_dueno on reservas
  for all
  using (exists (
    select 1 from canchas c where c.id = reservas.cancha_id and c.dueno_id = auth.uid()))
  with check (exists (
    select 1 from canchas c where c.id = reservas.cancha_id and c.dueno_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 6. FUNCIONES PÚBLICAS (las usa la web sin que el cliente inicie sesión)
-- ---------------------------------------------------------------------

-- 6.1 Horarios ocupados de una cancha (sin exponer datos del cliente)
create function horarios_ocupados(p_cancha_id uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = public as $$
  select r.inicio, r.fin
  from reservas r
  join canchas c on c.id = r.cancha_id and c.activa
  where r.cancha_id = p_cancha_id
    and r.estado in ('pendiente','confirmada','bloqueo')
    and r.inicio < p_hasta
    and r.fin > p_desde;
$$;

-- 6.2 Crear reserva. Valida todo en el servidor y calcula el precio.
--     Errores posibles (p. ej. para mostrar mensajes en la web):
--     cancha_no_disponible, horario_pasado, datos_invalidos,
--     duracion_invalida, cruza_medianoche, fuera_de_horario, horario_ocupado
create function crear_reserva(
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
begin
  select * into v_cancha from canchas where id = p_cancha_id and activa;
  if not found then raise exception 'cancha_no_disponible'; end if;

  if p_inicio <= now() then raise exception 'horario_pasado'; end if;

  -- Celular peruano: 9 dígitos que empiezan con 9
  if length(trim(coalesce(p_nombre, ''))) < 2
     or coalesce(p_celular, '') !~ '^9[0-9]{8}$' then
    raise exception 'datos_invalidos';
  end if;

  if v_minutos <= 0 or mod(v_minutos, v_cancha.duracion_turno_min) <> 0 then
    raise exception 'duracion_invalida';
  end if;

  if v_fin_local > ((v_ini_local::date + 1)::timestamp) then
    raise exception 'cruza_medianoche';
  end if;

  v_hora_fin := case when v_fin_local::time = '00:00'
                     then '24:00'::time else v_fin_local::time end;

  -- La reserva debe caber completa dentro de UNA franja (un solo precio)
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
      (cancha_id, inicio, fin, nombre_cliente, celular_cliente, monto, expira_en)
    values
      (p_cancha_id, p_inicio, p_fin, trim(p_nombre), p_celular, v_monto,
       now() + interval '15 minutes')   -- tiempo para pagar; ajustable
    returning reservas.codigo, reservas.monto, reservas.expira_en
      into r_codigo, r_monto, r_expira_en;
  exception when exclusion_violation then
    raise exception 'horario_ocupado';
  end;

  return next;
end $$;

-- 6.3 Consultar una reserva por su código (página de confirmación)
create function obtener_reserva(p_codigo text)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz,
               monto numeric, cancha_nombre text, direccion text, expira_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto,
         c.nombre, c.direccion, r.expira_en
  from reservas r join canchas c on c.id = r.cancha_id
  where r.codigo = upper(trim(p_codigo));
$$;

-- 6.4 Liberar horarios de reservas pendientes que no se pagaron a tiempo
create function expirar_reservas_pendientes() returns int
language sql security definer set search_path = public as $$
  with x as (
    update reservas set estado = 'expirada'
    where estado = 'pendiente' and expira_en < now()
    returning 1)
  select count(*)::int from x;
$$;

revoke execute on function expirar_reservas_pendientes() from public, anon, authenticated;

-- Programarla cada minuto: primero activa la extensión pg_cron en
-- Supabase → Database → Extensions, y luego ejecuta:
-- select cron.schedule('expirar-reservas', '* * * * *',
--                      'select expirar_reservas_pendientes()');

-- ---------------------------------------------------------------------
-- 7. DATOS DE PRUEBA (opcional, descomenta después de crear un usuario
--    en Authentication → Users y reemplaza el UUID por el de ese usuario)
-- ---------------------------------------------------------------------
-- insert into canchas (dueno_id, nombre, slug, deporte, direccion, distrito)
-- values ('UUID-DEL-USUARIO', 'Cancha de prueba', 'cancha-de-prueba',
--         'futbol', 'Av. Ejemplo 123', 'Lurigancho-Chosica');
--
-- insert into franjas (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
-- select id, d, '16:00', '24:00', 60 from canchas, generate_series(0,6) d
-- where slug = 'cancha-de-prueba';
