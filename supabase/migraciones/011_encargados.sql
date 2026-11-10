-- 011: encargados. El dueño invita a una persona por su correo; cuando esa
-- persona entra a EasyFut con ese correo (cuenta verificada) puede, en TODAS
-- las canchas del dueño:
--   · ver la agenda y las reservas
--   · confirmar pagos, rechazar ("No me llegó") y cancelar reservas
--   · registrar reservas presenciales y bloquear / desbloquear horarios
-- NO puede: editar canchas, precios, horarios, medios de pago, ni bloquear clientes.
-- Requiere 010. Ejecutar una sola vez en SQL Editor → Run.

create table if not exists encargados (
  id         uuid primary key default gen_random_uuid(),
  dueno_id   uuid not null references perfiles(id) on delete cascade,
  correo     text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre     text,
  created_at timestamptz not null default now()
);
create unique index if not exists encargados_unico on encargados (dueno_id, lower(correo));

-- ¿El usuario actual es encargado de ese dueño? (por su correo verificado)
create or replace function es_encargado_de(p_dueno uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from encargados e
    join auth.users u on lower(u.email) = lower(e.correo)
    where u.id = auth.uid() and u.email_confirmed_at is not null and e.dueno_id = p_dueno
  );
$$;

-- Dueños para los que trabajo como encargado
create or replace function mis_locales()
returns table (dueno_id uuid, dueno_nombre text, canchas bigint)
language sql stable security definer set search_path = public, auth as $$
  select e.dueno_id, p.nombre, (select count(*) from canchas c where c.dueno_id = e.dueno_id)
  from encargados e
  join auth.users u on lower(u.email) = lower(e.correo)
  join perfiles p on p.id = e.dueno_id
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;
revoke execute on function mis_locales() from public, anon;
grant execute on function mis_locales() to authenticated;

-- 1. El dueño administra sus encargados -----------------------------------------
alter table encargados enable row level security;

drop policy if exists encargados_dueno on encargados;
create policy encargados_dueno on encargados
  for all using (dueno_id = auth.uid() and es_dueno())
  with check (dueno_id = auth.uid() and es_dueno());

-- 2. Lo que puede ver y hacer un encargado ----------------------------------------
drop policy if exists canchas_encargado_ver on canchas;
create policy canchas_encargado_ver on canchas
  for select using (es_encargado_de(dueno_id));

drop policy if exists franjas_encargado_ver on franjas;
create policy franjas_encargado_ver on franjas
  for select using (exists (
    select 1 from canchas c where c.id = franjas.cancha_id and es_encargado_de(c.dueno_id)));

drop policy if exists reservas_encargado_ver on reservas;
create policy reservas_encargado_ver on reservas
  for select using (exists (
    select 1 from canchas c where c.id = reservas.cancha_id and es_encargado_de(c.dueno_id)));

-- Reservas presenciales (pagadas) y bloqueos
drop policy if exists reservas_encargado_crear on reservas;
create policy reservas_encargado_crear on reservas
  for insert with check (
    estado in ('confirmada', 'bloqueo')
    and exists (select 1 from canchas c where c.id = reservas.cancha_id and es_encargado_de(c.dueno_id)));

-- Confirmar, rechazar y cancelar
drop policy if exists reservas_encargado_editar on reservas;
create policy reservas_encargado_editar on reservas
  for update
  using (exists (select 1 from canchas c where c.id = reservas.cancha_id and es_encargado_de(c.dueno_id)))
  with check (
    estado in ('confirmada', 'cancelada', 'bloqueo')
    and exists (select 1 from canchas c where c.id = reservas.cancha_id and es_encargado_de(c.dueno_id)));

-- Quitar bloqueos de horario (solo bloqueos, nunca reservas de clientes)
drop policy if exists reservas_encargado_borrar on reservas;
create policy reservas_encargado_borrar on reservas
  for delete using (
    estado = 'bloqueo'
    and exists (select 1 from canchas c where c.id = reservas.cancha_id and es_encargado_de(c.dueno_id)));

-- 3. El encargado también ve el historial de los clientes del local -----------------
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
  where es_admin() or exists (
    select 1 from reservas x join canchas k on k.id = x.cancha_id
    where x.celular_cliente = c.cel
      and ((k.dueno_id = auth.uid() and es_dueno()) or es_encargado_de(k.dueno_id)))
  group by c.cel;
$$;
revoke execute on function historial_clientes(text[]) from public, anon;
grant execute on function historial_clientes(text[]) to authenticated;
