-- 015: protección de los medios de pago (a dónde va el dinero de los clientes)
--   · Solo se pueden cambiar con la función guardar_pagos, que exige haber
--     escrito la contraseña en los últimos 10 minutos. Ya no basta con tener
--     la sesión abierta, ni llamando directo a la base de datos.
--   · Cada cambio queda en un historial: quién, cuándo, antes y después.
--   · Se guarda la fecha del último cambio para avisar al cliente si es reciente.
-- Requiere 012. Ejecutar una sola vez en SQL Editor → Run.

-- 1. Historial ---------------------------------------------------------------------
create table if not exists cambios_pagos (
  id           uuid primary key default gen_random_uuid(),
  cancha_id    uuid not null references canchas(id) on delete cascade,
  cambiado_por uuid references perfiles(id) on delete set null,
  antes        jsonb,
  despues      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists cambios_pagos_idx on cambios_pagos (created_at desc);

alter table cambios_pagos enable row level security;

drop policy if exists cambios_pagos_admin on cambios_pagos;
create policy cambios_pagos_admin on cambios_pagos for select using (es_admin());

drop policy if exists cambios_pagos_dueno on cambios_pagos;
create policy cambios_pagos_dueno on cambios_pagos
  for select using (exists (
    select 1 from canchas c where c.id = cambios_pagos.cancha_id and c.dueno_id = auth.uid()));

alter table canchas add column if not exists pagos_cambiado_en timestamptz;

-- Registra cada cambio. La fecha de "cambio reciente" solo se marca cuando ya
-- había medios de pago antes (la primera configuración no es un cambio).
create or replace function registrar_cambio_pagos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.pagos <> '{}'::jsonb then
      insert into cambios_pagos (cancha_id, cambiado_por, antes, despues)
      values (new.id, auth.uid(), null, new.pagos);
    end if;
    return new;
  end if;

  if new.pagos is distinct from old.pagos then
    insert into cambios_pagos (cancha_id, cambiado_por, antes, despues)
    values (old.id, auth.uid(), old.pagos, new.pagos);
    if old.pagos <> '{}'::jsonb then
      new.pagos_cambiado_en := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists al_cambiar_pagos on canchas;
create trigger al_cambiar_pagos
  before update on canchas
  for each row execute function registrar_cambio_pagos();

drop trigger if exists al_crear_con_pagos on canchas;
create trigger al_crear_con_pagos
  after insert on canchas
  for each row execute function registrar_cambio_pagos();

-- 2. Cambiar medios de pago: solo con contraseña reciente ---------------------------
--    El inicio de sesión con contraseña queda anotado en la sesión (claim "amr").
--    Errores: sin_permiso, requiere_clave
create or replace function guardar_pagos(p_cancha_id uuid, p_pagos jsonb)
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

  update canchas set pagos = coalesce(p_pagos, '{}'::jsonb)
   where id = p_cancha_id
  returning pagos_cambiado_en into v_cuando;
  return v_cuando;
end $$;
revoke execute on function guardar_pagos(uuid, jsonb) from public, anon;
grant execute on function guardar_pagos(uuid, jsonb) to authenticated;

-- 3. Nadie puede modificar "pagos" directamente: solo por guardar_pagos --------------
--    Se permite actualizar el resto de columnas (las reglas RLS siguen aplicando).
--    OJO: si una migración futura agrega columnas editables a canchas, hay que
--    añadirlas a esta lista.
revoke update on canchas from anon, authenticated;
grant update (nombre, slug, descripcion, deporte, superficie, direccion, distrito,
              latitud, longitud, servicios, fotos, duracion_turno_min, activa, modalidades)
  on canchas to authenticated;

-- 4. La página de la reserva sabe si los datos de pago cambiaron hace poco -----------
drop function if exists obtener_reserva(text);
create function obtener_reserva(p_codigo text)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz,
               monto numeric, cancha_nombre text, direccion text, expira_en timestamptz,
               cancha_id uuid, cancha_slug text, nombre_cliente text,
               pagos jsonb, dueno_nombre text, dueno_celular text, pago_avisado_en timestamptz,
               pagos_cambiado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto,
         c.nombre, c.direccion, r.expira_en,
         c.id, c.slug, r.nombre_cliente,
         c.pagos, p.nombre, coalesce(p.telefono_verificado, p.celular), r.pago_avisado_en,
         c.pagos_cambiado_en
  from reservas r
  join canchas c on c.id = r.cancha_id
  left join perfiles p on p.id = c.dueno_id
  where r.codigo = upper(trim(p_codigo));
$$;
grant execute on function obtener_reserva(text) to anon, authenticated;

-- 5. Historial para el panel de administración -----------------------------------------
create or replace function admin_cambios_pagos()
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
    from cambios_pagos x
    join canchas c on c.id = x.cancha_id
    left join perfiles d on d.id = c.dueno_id
    left join perfiles a on a.id = x.cambiado_por
    left join auth.users u on u.id = x.cambiado_por
    order by x.created_at desc
    limit 100;
end $$;
revoke execute on function admin_cambios_pagos() from public, anon;
grant execute on function admin_cambios_pagos() to authenticated;
