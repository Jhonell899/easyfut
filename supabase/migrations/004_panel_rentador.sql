-- 004: funciones del rentador (publicar canchas, horarios, fotos, reservas).
-- Ejecutar una sola vez en Supabase → SQL Editor → New query → Run.

-- 1. Un comprador puede convertir su cuenta en rentador -------------------
create or replace function hacerme_rentador() returns void
language sql security definer set search_path = public as $$
  update perfiles set rol = 'dueno' where id = auth.uid();
$$;
revoke execute on function hacerme_rentador() from public, anon;
grant execute on function hacerme_rentador() to authenticated;

-- 2. Guardar todos los horarios y precios de una cancha de una sola vez ----
--    p_franjas: [{"dia_semana":1,"hora_inicio":"08:00","hora_fin":"23:00","precio_hora":60}, ...]
--    Si algo falla (franjas que se pisan, horas inválidas) no se cambia nada.
create or replace function guardar_franjas(p_cancha_id uuid, p_franjas jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  if not exists (
    select 1 from canchas where id = p_cancha_id and dueno_id = auth.uid()
  ) or not es_dueno() then
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
revoke execute on function guardar_franjas(uuid, jsonb) from public, anon;
grant execute on function guardar_franjas(uuid, jsonb) to authenticated;

-- 3. Fotos: bucket público "canchas". Cada rentador sube solo a su carpeta
--    (canchas/<su id>/...). Cualquiera puede verlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('canchas', 'canchas', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fotos_canchas_subir on storage.objects;
create policy fotos_canchas_subir on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'canchas'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.es_dueno()
  );

drop policy if exists fotos_canchas_editar on storage.objects;
create policy fotos_canchas_editar on storage.objects
  for update to authenticated
  using (bucket_id = 'canchas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists fotos_canchas_borrar on storage.objects;
create policy fotos_canchas_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'canchas' and (storage.foldername(name))[1] = auth.uid()::text);
