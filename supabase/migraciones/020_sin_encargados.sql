-- =============================================================================
-- 020 · Sin encargados
-- Cada cancha se maneja solo con la cuenta del dueño. Se quitan los encargados
-- (ayudantes invitados por correo) que agregó la 011:
--   · las 6 reglas que les daban acceso a canchas, horarios y reservas
--   · las funciones es_encargado_de() y mis_locales()
--   · la tabla encargados
-- historial_clientes queda solo para el dueño y el administrador.
--
-- Todo va en una sola transacción: si algo falla, no cambia nada.
-- Requiere la 019.
-- =============================================================================

begin;

-- 1. Reglas de acceso de los encargados
drop policy if exists canchas_encargado_ver     on canchas;
drop policy if exists franjas_encargado_ver     on tarifas_horarias;
drop policy if exists reservas_encargado_ver    on reservas;
drop policy if exists reservas_encargado_crear  on reservas;
drop policy if exists reservas_encargado_editar on reservas;
drop policy if exists reservas_encargado_borrar on reservas;

-- 2. Historial de clientes: solo el dueño de la cancha o el administrador
create or replace function historial_clientes(p_celulares text[])
returns table (celular text, pagadas bigint, vencidas bigint, canceladas bigint, pagos_falsos bigint,
               bloqueado_por_mi boolean, bloqueado_easyfut boolean)
language sql stable security definer set search_path = public as $$
  select c.cel,
         count(*) filter (where r.estado = 'confirmada'),
         count(*) filter (where r.estado = 'expirada'
                          or (r.estado = 'pendiente' and r.pago_avisado_en is null and r.expira_en < now())),
         count(*) filter (where r.estado = 'cancelada' and r.pago_rechazado_en is null),
         count(*) filter (where r.pago_rechazado_en is not null),
         exists (select 1 from clientes_bloqueados b where b.celular = c.cel and b.dueno_id = auth.uid()
                 and (b.hasta is null or b.hasta > now())),
         exists (select 1 from clientes_bloqueados b where b.celular = c.cel and b.dueno_id is null
                 and (b.hasta is null or b.hasta > now()))
  from unnest(p_celulares) as c(cel)
  left join reservas r on r.celular_cliente = c.cel
  where es_admin() or exists (
    select 1 from reservas x join canchas k on k.id = x.cancha_id
    where x.celular_cliente = c.cel
      and k.dueno_id = auth.uid() and es_dueno())
  group by c.cel;
$$;

-- 3. Funciones y tabla de encargados
drop function if exists mis_locales();
drop function if exists es_encargado_de(uuid);
drop table if exists encargados;

commit;

-- Para que la API vea el cambio al instante
notify pgrst, 'reload schema';
