-- 012: el administrador de EasyFut puede ver y gestionar TODAS las canchas:
-- publicar / pausar, editar datos, horarios, precios, fotos y pagos, y ver y
-- gestionar sus reservas (agenda de cada dueño).
-- Requiere 008 (administrador). Ejecutar una sola vez en SQL Editor → Run.

-- 1. Permisos del administrador -----------------------------------------------
drop policy if exists canchas_admin on canchas;
create policy canchas_admin on canchas
  for all using (es_admin()) with check (es_admin());

drop policy if exists franjas_admin on franjas;
create policy franjas_admin on franjas
  for all using (es_admin()) with check (es_admin());

drop policy if exists reservas_admin on reservas;
create policy reservas_admin on reservas
  for all using (es_admin()) with check (es_admin());

-- Fotos: el administrador puede subir y borrar en cualquier carpeta del bucket
drop policy if exists fotos_canchas_admin on storage.objects;
create policy fotos_canchas_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'canchas' and public.es_admin())
  with check (bucket_id = 'canchas' and public.es_admin());

-- 2. guardar_franjas: el dueño de la cancha o el administrador ------------------
create or replace function guardar_franjas(p_cancha_id uuid, p_franjas jsonb)
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

  delete from franjas where cancha_id = p_cancha_id;

  insert into franjas (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
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

-- 3. Lista de canchas para el panel de administración ----------------------------
create or replace function admin_canchas()
returns table (id uuid, nombre text, slug text, distrito text, deporte text, modalidades smallint[],
               activa boolean, foto text, creada timestamptz,
               dueno_id uuid, dueno_nombre text, dueno_correo text, dueno_whatsapp text,
               franjas bigint, tiene_pagos boolean,
               proximas bigint, por_confirmar bigint, ultima_reserva timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select c.id, c.nombre, c.slug, c.distrito, c.deporte, c.modalidades,
           c.activa, c.fotos[1], c.created_at,
           p.id, p.nombre, u.email::text, p.telefono_verificado,
           (select count(*) from franjas f where f.cancha_id = c.id),
           coalesce(c.pagos, '{}'::jsonb) <> '{}'::jsonb,
           (select count(*) from reservas r where r.cancha_id = c.id
              and r.estado in ('confirmada', 'pendiente') and r.fin > now()),
           (select count(*) from reservas r where r.cancha_id = c.id
              and r.estado = 'pendiente' and r.pago_avisado_en is not null and r.fin > now()),
           (select max(r.created_at) from reservas r where r.cancha_id = c.id and r.estado <> 'bloqueo')
    from canchas c
    join perfiles p on p.id = c.dueno_id
    join auth.users u on u.id = p.id
    order by c.created_at desc;
end $$;
revoke execute on function admin_canchas() from public, anon;
grant execute on function admin_canchas() to authenticated;
