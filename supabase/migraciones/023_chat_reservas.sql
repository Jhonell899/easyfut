-- =============================================================================
-- 023 · Chat de la reserva
--
-- Recién cuando el dueño CONFIRMA el pago de una reserva hecha por un jugador con
-- cuenta, se abre un chat entre los dos:
--   · el dueño ve los datos del cliente (nombre, celular e historial de reservas)
--   · el cliente ve los datos de la cancha y del dueño
--   · se puede escribir hasta 2 días después del partido; después queda solo lectura
--   · solo el cliente y el dueño de esa cancha ven los mensajes
--
-- Tablas nuevas: mensajes_reserva, lecturas_chat. Columna nueva: reservas.confirmada_en
-- Requiere la 021. Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Cuándo se confirmó cada reserva (abre el chat) --------------------------------
alter table reservas add column if not exists confirmada_en timestamptz;
update reservas set confirmada_en = coalesce(pago_avisado_en, created_at)
 where estado = 'confirmada' and confirmada_en is null;

-- confirmada_en solo la pone la base de datos, y nadie puede cambiar el cliente de
-- una reserva por otro (para no abrir chats con personas ajenas).
create or replace function proteger_chat_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.confirmada_en := case when new.estado = 'confirmada' then now() end;
    if new.cliente_id is not null and new.cliente_id is distinct from auth.uid() and not es_admin() then
      new.cliente_id := null;
    end if;
  else
    if new.estado = 'confirmada' and old.estado is distinct from 'confirmada' then
      new.confirmada_en := coalesce(old.confirmada_en, now());
    else
      new.confirmada_en := old.confirmada_en;
    end if;
    -- Se permite dejarlo vacío (por ejemplo, si se borra la cuenta), no cambiarlo por otro
    if new.cliente_id is not null and new.cliente_id is distinct from old.cliente_id and not es_admin() then
      new.cliente_id := old.cliente_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists proteger_chat_reserva on reservas;
create trigger proteger_chat_reserva before insert or update on reservas
  for each row execute function proteger_chat_reserva();

-- 2. Mensajes y lecturas ----------------------------------------------------------
create table if not exists mensajes_reserva (
  id         uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas(id) on delete cascade,
  autor_id   uuid references usuarios(id) on delete set null,
  autor      text not null check (autor in ('cliente', 'dueno', 'sistema')),
  texto      text not null check (length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists mensajes_reserva_idx on mensajes_reserva (reserva_id, created_at);

create table if not exists lecturas_chat (
  reserva_id uuid not null references reservas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  leido_en   timestamptz not null default now(),
  primary key (reserva_id, usuario_id)
);

-- ¿El usuario actual es el cliente o el dueño de una reserva con chat abierto?
create or replace function es_participante_chat(p_reserva uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reservas r join canchas c on c.id = r.cancha_id
    where r.id = p_reserva and r.confirmada_en is not null and r.cliente_id is not null
      and auth.uid() in (r.cliente_id, c.dueno_id)
  );
$$;
revoke execute on function es_participante_chat(uuid) from public, anon;
grant execute on function es_participante_chat(uuid) to authenticated;

-- Solo se leen directo; todo lo que escribe pasa por funciones
alter table mensajes_reserva enable row level security;
drop policy if exists mensajes_ver on mensajes_reserva;
create policy mensajes_ver on mensajes_reserva for select to authenticated using (es_participante_chat(reserva_id));

alter table lecturas_chat enable row level security;
drop policy if exists lecturas_ver on lecturas_chat;
create policy lecturas_ver on lecturas_chat for select to authenticated using (usuario_id = auth.uid());

-- Mensajes en vivo (Realtime respeta las reglas de arriba)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes_reserva') then
    alter publication supabase_realtime add table mensajes_reserva;
  end if;
end $$;

-- 3. Al confirmar el pago se abre el chat con un mensaje automático ----------------
create or replace function abrir_chat_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cancha text;
begin
  if new.estado = 'confirmada' and old.estado is distinct from 'confirmada' and new.cliente_id is not null
     and not exists (select 1 from mensajes_reserva where reserva_id = new.id and autor = 'sistema') then
    select nombre into v_cancha from canchas where id = new.cancha_id;
    insert into mensajes_reserva (reserva_id, autor, texto)
    values (new.id, 'sistema',
            'Pago confirmado ✓ Reserva ' || new.codigo || ' en ' || coalesce(v_cancha, 'la cancha') || ', el '
            || to_char(new.inicio at time zone 'America/Lima', 'DD/MM') || ' de '
            || to_char(new.inicio at time zone 'America/Lima', 'HH24:MI') || ' a '
            || to_char(new.fin at time zone 'America/Lima', 'HH24:MI')
            || '. Usen este chat para coordinar lo que necesiten.');
  end if;
  return new;
end $$;
drop trigger if exists abrir_chat_reserva on reservas;
create trigger abrir_chat_reserva after update of estado on reservas
  for each row execute function abrir_chat_reserva();

-- 4. Datos del chat para quien lo abre ---------------------------------------------
-- El dueño ve al cliente (nombre, celular, historial). El cliente ve la cancha y al dueño.
create or replace function datos_chat(p_codigo text)
returns table (reserva_id uuid, codigo text, estado text, inicio timestamptz, fin timestamptz, monto numeric,
               cancha_nombre text, cancha_direccion text, cancha_slug text,
               soy text, otra_nombre text, otra_celular text, abierto boolean,
               cliente_pagadas bigint, cliente_vencidas bigint, cliente_canceladas bigint, cliente_pagos_falsos bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  r reservas%rowtype;
  c canchas%rowtype;
  v_soy text;
begin
  select * into r from reservas where reservas.codigo = upper(trim(p_codigo));
  if not found or r.confirmada_en is null or r.cliente_id is null then return; end if;
  select * into c from canchas where canchas.id = r.cancha_id;
  if auth.uid() = c.dueno_id then v_soy := 'dueno';
  elsif auth.uid() = r.cliente_id then v_soy := 'cliente';
  else return;
  end if;

  return query
    select r.id, r.codigo, r.estado, r.inicio, r.fin, r.monto,
           c.nombre, c.direccion || coalesce(', ' || c.distrito, ''), c.slug,
           v_soy,
           case when v_soy = 'dueno' then r.nombre_cliente else d.nombre end,
           case when v_soy = 'dueno' then r.celular_cliente else d.celular_verificado end,
           now() <= r.fin + interval '2 days',
           case when v_soy = 'dueno' then h.pagadas end,
           case when v_soy = 'dueno' then h.vencidas end,
           case when v_soy = 'dueno' then h.canceladas end,
           case when v_soy = 'dueno' then h.falsos end
    from usuarios d
    cross join lateral (
      select count(*) filter (where x.estado = 'confirmada') as pagadas,
             count(*) filter (where x.estado = 'expirada'
                              or (x.estado = 'pendiente' and x.pago_avisado_en is null and x.expira_en < now())) as vencidas,
             count(*) filter (where x.estado = 'cancelada' and x.pago_rechazado_en is null) as canceladas,
             count(*) filter (where x.pago_rechazado_en is not null) as falsos
      from reservas x where x.celular_cliente = r.celular_cliente
    ) h
    where d.id = c.dueno_id;
end $$;
revoke execute on function datos_chat(text) from public, anon;
grant execute on function datos_chat(text) to authenticated;

-- 5. Enviar un mensaje -------------------------------------------------------------
-- Errores: texto_invalido, chat_cerrado, sin_permiso, muy_rapido
create or replace function enviar_mensaje(p_reserva uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
  r reservas%rowtype;
  v_dueno uuid;
  v_autor text;
  v_id uuid;
begin
  if length(v_texto) < 1 or length(v_texto) > 1000 then raise exception 'texto_invalido'; end if;
  select * into r from reservas where id = p_reserva;
  if not found or r.confirmada_en is null or r.cliente_id is null then raise exception 'chat_cerrado'; end if;
  select dueno_id into v_dueno from canchas where id = r.cancha_id;
  if auth.uid() = r.cliente_id then v_autor := 'cliente';
  elsif auth.uid() = v_dueno then v_autor := 'dueno';
  else raise exception 'sin_permiso';
  end if;
  if now() > r.fin + interval '2 days' then raise exception 'chat_cerrado'; end if;
  if (select count(*) from mensajes_reserva
       where reserva_id = r.id and autor_id = auth.uid() and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'muy_rapido';
  end if;

  insert into mensajes_reserva (reserva_id, autor_id, autor, texto)
  values (r.id, auth.uid(), v_autor, v_texto)
  returning id into v_id;
  insert into lecturas_chat (reserva_id, usuario_id, leido_en) values (r.id, auth.uid(), now())
  on conflict (reserva_id, usuario_id) do update set leido_en = excluded.leido_en;
  return v_id;
end $$;
revoke execute on function enviar_mensaje(uuid, text) from public, anon;
grant execute on function enviar_mensaje(uuid, text) to authenticated;

-- 6. Marcar como leído ---------------------------------------------------------------
create or replace function marcar_chat_leido(p_reserva uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_participante_chat(p_reserva) then return; end if;
  insert into lecturas_chat (reserva_id, usuario_id, leido_en) values (p_reserva, auth.uid(), now())
  on conflict (reserva_id, usuario_id) do update set leido_en = excluded.leido_en;
end $$;
revoke execute on function marcar_chat_leido(uuid) from public, anon;
grant execute on function marcar_chat_leido(uuid) to authenticated;

-- 7. Mis chats (dueño o cliente), con mensajes sin leer --------------------------------
create or replace function mis_chats()
returns table (reserva_id uuid, codigo text, cancha_nombre text, inicio timestamptz, soy text,
               otra_nombre text, ultimo_texto text, ultimo_en timestamptz, no_leidos bigint, abierto boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.codigo, c.nombre, r.inicio,
         case when c.dueno_id = auth.uid() then 'dueno' else 'cliente' end,
         case when c.dueno_id = auth.uid() then r.nombre_cliente else d.nombre end,
         u.texto, u.created_at,
         (select count(*) from mensajes_reserva m
           where m.reserva_id = r.id and m.autor_id is distinct from auth.uid()
             and m.created_at > coalesce((select l.leido_en from lecturas_chat l
                                           where l.reserva_id = r.id and l.usuario_id = auth.uid()), '-infinity')),
         now() <= r.fin + interval '2 days'
  from reservas r
  join canchas c on c.id = r.cancha_id
  join usuarios d on d.id = c.dueno_id
  left join lateral (select m.texto, m.created_at from mensajes_reserva m
                      where m.reserva_id = r.id order by m.created_at desc limit 1) u on true
  where r.confirmada_en is not null and r.cliente_id is not null
    and auth.uid() in (r.cliente_id, c.dueno_id)
  order by coalesce(u.created_at, r.confirmada_en) desc
  limit 50;
$$;
revoke execute on function mis_chats() from public, anon;
grant execute on function mis_chats() to authenticated;

-- 8. Descripciones --------------------------------------------------------------------
comment on column reservas.confirmada_en is 'Cuándo el dueño confirmó el pago. Desde ese momento existe el chat de la reserva.';
comment on table mensajes_reserva is 'Chat entre el cliente y el dueño de una reserva confirmada.';
comment on column mensajes_reserva.autor is 'cliente, dueno o sistema (mensaje automático al confirmar).';
comment on column mensajes_reserva.texto is 'Mensaje (1 a 1000 caracteres).';
comment on table lecturas_chat is 'Hasta cuándo leyó cada persona cada chat (para contar mensajes sin leer).';

commit;

notify pgrst, 'reload schema';
