-- =====================================================================
-- EasyFut · Migración 002: cuentas de rentador (dueño) y comprador (cliente)
-- Ejecuta TODO este archivo una sola vez en Supabase → SQL Editor.
-- =====================================================================

-- 1. Rol en perfiles -----------------------------------------------------
alter table perfiles
  add column if not exists rol text not null default 'cliente'
  check (rol in ('cliente', 'dueno'));

-- Quien ya tiene canchas es rentador
update perfiles set rol = 'dueno'
where id in (select dueno_id from canchas);

-- 2. Al registrarse se guarda nombre, celular y tipo de cuenta -----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, celular, rol)
  values (
    new.id,
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'celular',
    case when new.raw_user_meta_data->>'rol' = 'dueno' then 'dueno' else 'cliente' end
  );
  return new;
end $$;

-- 3. Nadie puede cambiarse el rol a sí mismo (solo nombre y celular) -----
revoke insert, update on perfiles from anon, authenticated;
grant update (nombre, celular) on perfiles to authenticated;

-- 4. Solo los rentadores pueden crear/gestionar canchas -----------------
create or replace function es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'dueno');
$$;

drop policy if exists canchas_dueno on canchas;
create policy canchas_dueno on canchas
  for all
  using (dueno_id = auth.uid() and es_dueno())
  with check (dueno_id = auth.uid() and es_dueno());

-- 5. Reservas ligadas a la cuenta del comprador (opcional) --------------
alter table reservas
  add column if not exists cliente_id uuid references perfiles(id) on delete set null;

create index if not exists reservas_cliente_idx on reservas (cliente_id, inicio desc);

drop policy if exists reservas_cliente on reservas;
create policy reservas_cliente on reservas
  for select using (cliente_id = auth.uid());

-- crear_reserva: igual que antes, pero guarda cliente_id si hay sesión
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
begin
  select * into v_cancha from canchas where id = p_cancha_id and activa;
  if not found then raise exception 'cancha_no_disponible'; end if;

  if p_inicio <= now() then raise exception 'horario_pasado'; end if;

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
      (cancha_id, cliente_id, inicio, fin, nombre_cliente, celular_cliente, monto, expira_en)
    values
      (p_cancha_id, auth.uid(), p_inicio, p_fin, trim(p_nombre), p_celular, v_monto,
       now() + interval '15 minutes')
    returning reservas.codigo, reservas.monto, reservas.expira_en
      into r_codigo, r_monto, r_expira_en;
  exception when exclusion_violation then
    raise exception 'horario_ocupado';
  end;

  return next;
end $$;

-- 6. Modalidades de fútbol (opcional) ------------------------------------
--    Qué formatos se pueden jugar en la cancha: {7}, {7,9,11}, etc.
--    Vacío = no especificado (p. ej. futsal o vóley).
alter table canchas
  add column if not exists modalidades smallint[] not null default '{}'
  check (modalidades <@ array[5,6,7,8,9,11]::smallint[]);

create index if not exists canchas_modalidades_idx on canchas using gin (modalidades);
