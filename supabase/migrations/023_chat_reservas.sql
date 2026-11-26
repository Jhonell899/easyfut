-- =============================================================================
-- 023 · Chat entre el dueño (rentador) y el jugador (alquilador)
--
-- · Cada pareja dueño–jugador tiene UN chat con su propio id (tabla chats).
-- · El chat se abre SOLO desde la app: cuando el dueño (con su sesión) confirma el
--   pago de una reserva que el jugador hizo en la app. Confirmaciones hechas por
--   fuera (SQL Editor, scripts) no abren ni crean chats.
-- · Cada reserva confirmada deja un aviso dentro del chat de la pareja y lo
--   mantiene abierto hasta 2 días después de su partido.
-- · Solo el dueño y el jugador de ese chat leen los mensajes. Si uno lo reporta,
--   el admin puede leer ese chat (solo ese) y cerrarlo para siempre.
-- · El cliente de una reserva solo lo pone la app al reservar (crear_reserva):
--   nadie puede ponerlo ni cambiarlo por otro desde fuera.
--
-- Tablas nuevas: chats, mensajes_chat, lecturas_chat, reportes_chat.
-- Columnas nuevas: reservas.confirmada_en, reservas.chat_id.
-- Requiere la 021. Todo va en una sola transacción: si algo falla, no cambia nada.
-- =============================================================================

begin;

-- 1. Chats (uno por pareja dueño–jugador) ---------------------------------------
create table if not exists chats (
  id                uuid primary key default gen_random_uuid(),
  dueno_id          uuid not null references usuarios(id) on delete cascade,
  cliente_id        uuid not null references usuarios(id) on delete cascade,
  abierto_hasta     timestamptz not null default now(),
  ultima_reserva_id uuid,
  bloqueado         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (dueno_id, cliente_id),
  check (dueno_id <> cliente_id)
);

alter table reservas add column if not exists confirmada_en timestamptz;
alter table reservas add column if not exists chat_id uuid references chats(id) on delete set null;
alter table chats drop constraint if exists chats_ultima_reserva_fk;
alter table chats add constraint chats_ultima_reserva_fk
  foreign key (ultima_reserva_id) references reservas(id) on delete set null;

create table if not exists mensajes_chat (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references chats(id) on delete cascade,
  reserva_id uuid references reservas(id) on delete set null,
  autor_id   uuid references usuarios(id) on delete set null,
  autor      text not null check (autor in ('cliente', 'dueno', 'sistema')),
  texto      text not null check (length(texto) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists mensajes_chat_idx on mensajes_chat (chat_id, created_at);

create table if not exists lecturas_chat (
  chat_id    uuid not null references chats(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  leido_en   timestamptz not null default now(),
  primary key (chat_id, usuario_id)
);

-- ¿El usuario actual es el dueño o el jugador de este chat?
create or replace function es_participante_chat(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats where id = p_chat and auth.uid() in (dueno_id, cliente_id));
$$;
revoke execute on function es_participante_chat(uuid) from public, anon;
grant execute on function es_participante_chat(uuid) to authenticated;

-- Solo se leen directo; todo lo que se escribe pasa por funciones
alter table chats enable row level security;
drop policy if exists chats_ver on chats;
create policy chats_ver on chats for select to authenticated using (auth.uid() in (dueno_id, cliente_id));

alter table mensajes_chat enable row level security;
drop policy if exists mensajes_chat_ver on mensajes_chat;
create policy mensajes_chat_ver on mensajes_chat for select to authenticated using (es_participante_chat(chat_id));

alter table lecturas_chat enable row level security;
drop policy if exists lecturas_chat_ver on lecturas_chat;
create policy lecturas_chat_ver on lecturas_chat for select to authenticated using (usuario_id = auth.uid());

-- Mensajes en vivo (Realtime respeta las reglas de arriba)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes_chat') then
    alter publication supabase_realtime add table mensajes_chat;
  end if;
end $$;

-- 2. Reservas: cliente solo desde la app y chat al confirmar desde la app ----------
create or replace function preparar_chat_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dueno uuid;
  v_chat  uuid;
begin
  if tg_op = 'INSERT' then
    new.confirmada_en := null;
    new.chat_id := null;
    -- Solo la app (crear_reserva, con la sesión del jugador) pone el cliente
    if new.cliente_id is not null and new.cliente_id is distinct from auth.uid() then
      new.cliente_id := null;
    end if;
    return new;
  end if;

  -- Nadie cambia estos datos a mano
  new.confirmada_en := old.confirmada_en;
  new.chat_id := old.chat_id;
  -- Se puede dejar vacío (si se borra la cuenta), no cambiar por otro
  if new.cliente_id is not null and new.cliente_id is distinct from old.cliente_id then
    new.cliente_id := old.cliente_id;
  end if;

  -- ¿El dueño (o el admin) confirma el pago desde la app?
  if new.estado = 'confirmada' and old.estado is distinct from 'confirmada'
     and new.cliente_id is not null and auth.uid() is not null then
    select dueno_id into v_dueno from canchas where id = new.cancha_id;
    if (auth.uid() = v_dueno or es_admin()) and v_dueno <> new.cliente_id then
      new.confirmada_en := now();
      insert into chats (dueno_id, cliente_id, abierto_hasta, ultima_reserva_id)
      values (v_dueno, new.cliente_id, new.fin + interval '2 days', new.id)
      on conflict (dueno_id, cliente_id) do update
        set abierto_hasta = greatest(chats.abierto_hasta, excluded.abierto_hasta),
            ultima_reserva_id = excluded.ultima_reserva_id
      returning id into v_chat;
      new.chat_id := v_chat;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists preparar_chat_reserva on reservas;
create trigger preparar_chat_reserva before insert or update on reservas
  for each row execute function preparar_chat_reserva();

-- Aviso automático dentro del chat cuando se confirma una reserva
create or replace function avisar_chat_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cancha text;
begin
  if new.chat_id is not null and old.chat_id is distinct from new.chat_id then
    select nombre into v_cancha from canchas where id = new.cancha_id;
    insert into mensajes_chat (chat_id, reserva_id, autor, texto)
    values (new.chat_id, new.id, 'sistema',
            'Pago confirmado ✓ Reserva ' || new.codigo || ' en ' || coalesce(v_cancha, 'la cancha') || ', el '
            || to_char(new.inicio at time zone 'America/Lima', 'DD/MM') || ' de '
            || to_char(new.inicio at time zone 'America/Lima', 'HH24:MI') || ' a '
            || to_char(new.fin at time zone 'America/Lima', 'HH24:MI') || '.');
  end if;
  return new;
end $$;
drop trigger if exists avisar_chat_reserva on reservas;
create trigger avisar_chat_reserva after update of estado on reservas
  for each row execute function avisar_chat_reserva();

-- 3. Datos del chat para quien lo abre ---------------------------------------------
-- El dueño ve al jugador (nombre, celular, historial). El jugador ve al dueño.
create or replace function datos_chat(p_chat uuid)
returns table (chat_id uuid, soy text, otra_nombre text, otra_celular text, abierto boolean,
               abierto_hasta timestamptz, bloqueado boolean,
               cliente_pagadas bigint, cliente_vencidas bigint, cliente_canceladas bigint, cliente_pagos_falsos bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  ch chats%rowtype;
  v_soy text;
  v_nombre text;
  v_cel text;
begin
  select * into ch from chats where chats.id = p_chat;
  if not found then return; end if;
  if auth.uid() = ch.dueno_id then v_soy := 'dueno';
  elsif auth.uid() = ch.cliente_id then v_soy := 'cliente';
  else return;
  end if;

  if v_soy = 'dueno' then
    -- Los datos que el jugador dejó en su última reserva con este dueño
    select r.nombre_cliente, r.celular_cliente into v_nombre, v_cel
    from reservas r where r.chat_id = ch.id order by r.inicio desc limit 1;
  else
    select u.nombre, u.celular_verificado into v_nombre, v_cel from usuarios u where u.id = ch.dueno_id;
  end if;

  return query
    select ch.id, v_soy, v_nombre, v_cel, not ch.bloqueado and now() <= ch.abierto_hasta, ch.abierto_hasta, ch.bloqueado,
           case when v_soy = 'dueno' then h.pagadas end,
           case when v_soy = 'dueno' then h.vencidas end,
           case when v_soy = 'dueno' then h.canceladas end,
           case when v_soy = 'dueno' then h.falsos end
    from (
      select count(*) filter (where x.estado = 'confirmada') as pagadas,
             count(*) filter (where x.estado = 'expirada'
                              or (x.estado = 'pendiente' and x.pago_avisado_en is null and x.expira_en < now())) as vencidas,
             count(*) filter (where x.estado = 'cancelada' and x.pago_rechazado_en is null) as canceladas,
             count(*) filter (where x.pago_rechazado_en is not null) as falsos
      from reservas x where x.cliente_id = ch.cliente_id
    ) h;
end $$;
revoke execute on function datos_chat(uuid) from public, anon;
grant execute on function datos_chat(uuid) to authenticated;

-- Reservas confirmadas de la pareja (las más recientes primero)
create or replace function reservas_del_chat(p_chat uuid)
returns table (codigo text, estado text, inicio timestamptz, fin timestamptz, monto numeric,
               cancha_nombre text, cancha_direccion text)
language sql stable security definer set search_path = public as $$
  select r.codigo, r.estado, r.inicio, r.fin, r.monto, c.nombre, c.direccion || coalesce(', ' || c.distrito, '')
  from reservas r join canchas c on c.id = r.cancha_id
  where r.chat_id = p_chat and es_participante_chat(p_chat)
  order by r.inicio desc
  limit 10;
$$;
revoke execute on function reservas_del_chat(uuid) from public, anon;
grant execute on function reservas_del_chat(uuid) to authenticated;

-- El chat de una reserva (para el enlace en la página de la reserva)
create or replace function chat_de_reserva(p_codigo text) returns uuid
language sql stable security definer set search_path = public as $$
  select r.chat_id from reservas r
  where r.codigo = upper(trim(p_codigo)) and r.chat_id is not null and es_participante_chat(r.chat_id);
$$;
revoke execute on function chat_de_reserva(text) from public, anon;
grant execute on function chat_de_reserva(text) to authenticated;

-- 4. Enviar y leer -------------------------------------------------------------------
-- Errores: texto_invalido, sin_permiso, chat_bloqueado, chat_cerrado, muy_rapido
create or replace function enviar_mensaje(p_chat uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
  ch chats%rowtype;
  v_autor text;
  v_id uuid;
begin
  if length(v_texto) < 1 or length(v_texto) > 1000 then raise exception 'texto_invalido'; end if;
  select * into ch from chats where id = p_chat;
  if not found then raise exception 'sin_permiso'; end if;
  if auth.uid() = ch.dueno_id then v_autor := 'dueno';
  elsif auth.uid() = ch.cliente_id then v_autor := 'cliente';
  else raise exception 'sin_permiso';
  end if;
  if ch.bloqueado then raise exception 'chat_bloqueado'; end if;
  if now() > ch.abierto_hasta then raise exception 'chat_cerrado'; end if;
  if (select count(*) from mensajes_chat
       where chat_id = ch.id and autor_id = auth.uid() and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'muy_rapido';
  end if;

  insert into mensajes_chat (chat_id, reserva_id, autor_id, autor, texto)
  values (ch.id, ch.ultima_reserva_id, auth.uid(), v_autor, v_texto)
  returning id into v_id;
  insert into lecturas_chat (chat_id, usuario_id, leido_en) values (ch.id, auth.uid(), now())
  on conflict (chat_id, usuario_id) do update set leido_en = excluded.leido_en;
  return v_id;
end $$;
revoke execute on function enviar_mensaje(uuid, text) from public, anon;
grant execute on function enviar_mensaje(uuid, text) to authenticated;

create or replace function marcar_chat_leido(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_participante_chat(p_chat) then return; end if;
  insert into lecturas_chat (chat_id, usuario_id, leido_en) values (p_chat, auth.uid(), now())
  on conflict (chat_id, usuario_id) do update set leido_en = excluded.leido_en;
end $$;
revoke execute on function marcar_chat_leido(uuid) from public, anon;
grant execute on function marcar_chat_leido(uuid) to authenticated;

-- 5. Mis chats, con mensajes sin leer -----------------------------------------------
create or replace function mis_chats()
returns table (chat_id uuid, soy text, otra_nombre text, ultimo_texto text, ultimo_en timestamptz,
               no_leidos bigint, abierto boolean, proxima_cancha text, proxima_inicio timestamptz)
language sql stable security definer set search_path = public as $$
  select ch.id,
         case when ch.dueno_id = auth.uid() then 'dueno' else 'cliente' end,
         case when ch.dueno_id = auth.uid() then coalesce(ur.nombre_cliente, cli.nombre) else due.nombre end,
         um.texto, um.created_at,
         (select count(*) from mensajes_chat m
           where m.chat_id = ch.id and m.autor_id is distinct from auth.uid()
             and m.created_at > coalesce((select l.leido_en from lecturas_chat l
                                           where l.chat_id = ch.id and l.usuario_id = auth.uid()), '-infinity')),
         not ch.bloqueado and now() <= ch.abierto_hasta,
         uc.nombre, ur.inicio
  from chats ch
  join usuarios due on due.id = ch.dueno_id
  join usuarios cli on cli.id = ch.cliente_id
  left join reservas ur on ur.id = ch.ultima_reserva_id
  left join canchas uc on uc.id = ur.cancha_id
  left join lateral (select m.texto, m.created_at from mensajes_chat m
                      where m.chat_id = ch.id order by m.created_at desc limit 1) um on true
  where auth.uid() in (ch.dueno_id, ch.cliente_id)
  order by coalesce(um.created_at, ch.created_at) desc
  limit 50;
$$;
revoke execute on function mis_chats() from public, anon;
grant execute on function mis_chats() to authenticated;

-- 6. Reportar un chat (llega al administrador) -------------------------------------
-- El admin solo puede leer los mensajes de un chat que alguien reportó.
create table if not exists reportes_chat (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references chats(id) on delete cascade,
  reportado_por uuid references usuarios(id) on delete set null,
  motivo       text not null check (motivo in ('acoso', 'estafa', 'spam', 'otro')),
  detalle      text check (detalle is null or length(detalle) <= 500),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'revisado')),
  nota_admin   text check (nota_admin is null or length(nota_admin) <= 500),
  revisado_por uuid references usuarios(id) on delete set null,
  revisado_en  timestamptz,
  created_at   timestamptz not null default now()
);
-- Un solo reporte pendiente por persona y chat
create unique index if not exists reportes_chat_pendiente_unico
  on reportes_chat (chat_id, reportado_por) where estado = 'pendiente';
alter table reportes_chat enable row level security;
drop policy if exists reportes_chat_ver on reportes_chat;
create policy reportes_chat_ver on reportes_chat for select to authenticated
  using (reportado_por = auth.uid() or es_admin());

-- Errores: sin_permiso, motivo_invalido, ya_reportado, demasiados_reportes
create or replace function reportar_chat(p_chat uuid, p_motivo text, p_detalle text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_detalle text := nullif(left(trim(coalesce(p_detalle, '')), 500), '');
  v_id uuid;
begin
  if not es_participante_chat(p_chat) then raise exception 'sin_permiso'; end if;
  if p_motivo is null or p_motivo not in ('acoso', 'estafa', 'spam', 'otro') then raise exception 'motivo_invalido'; end if;
  if (select count(*) from reportes_chat
       where reportado_por = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'demasiados_reportes';
  end if;
  insert into reportes_chat (chat_id, reportado_por, motivo, detalle)
  values (p_chat, auth.uid(), p_motivo, v_detalle)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'ya_reportado';
end $$;
revoke execute on function reportar_chat(uuid, text, text) from public, anon;
grant execute on function reportar_chat(uuid, text, text) to authenticated;

-- Admin: lista de reportes (pendientes primero)
create or replace function admin_reportes_chat()
returns table (id uuid, chat_id uuid, motivo text, detalle text, estado text, nota_admin text, created_at timestamptz,
               reporta_nombre text, reporta_correo text,
               dueno_nombre text, dueno_correo text, cliente_nombre text, cliente_correo text,
               chat_bloqueado boolean, mensajes bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  return query
    select r.id, r.chat_id, r.motivo, r.detalle, r.estado, r.nota_admin, r.created_at,
           ur.nombre, ar.email::text,
           ud.nombre, ad.email::text, uc.nombre, ac.email::text,
           ch.bloqueado,
           (select count(*) from mensajes_chat m where m.chat_id = r.chat_id)
    from reportes_chat r
    join chats ch on ch.id = r.chat_id
    left join usuarios ur on ur.id = r.reportado_por
    left join auth.users ar on ar.id = r.reportado_por
    join usuarios ud on ud.id = ch.dueno_id
    left join auth.users ad on ad.id = ch.dueno_id
    join usuarios uc on uc.id = ch.cliente_id
    left join auth.users ac on ac.id = ch.cliente_id
    order by (r.estado = 'pendiente') desc, r.created_at desc
    limit 200;
end $$;
revoke execute on function admin_reportes_chat() from public, anon;
grant execute on function admin_reportes_chat() to authenticated;

-- Admin: mensajes de un chat, SOLO si ese chat fue reportado
create or replace function admin_mensajes_chat(p_chat uuid)
returns table (id uuid, autor text, autor_nombre text, texto text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  if not exists (select 1 from reportes_chat r where r.chat_id = p_chat) then raise exception 'sin_reporte'; end if;
  return query
    select m.id, m.autor, u.nombre, m.texto, m.created_at
    from mensajes_chat m left join usuarios u on u.id = m.autor_id
    where m.chat_id = p_chat
    order by m.created_at
    limit 500;
end $$;
revoke execute on function admin_mensajes_chat(uuid) from public, anon;
grant execute on function admin_mensajes_chat(uuid) to authenticated;

-- Admin: marcar revisado y, si hace falta, cerrar el chat para siempre (o reabrirlo)
create or replace function admin_revisar_reporte_chat(p_id uuid, p_nota text, p_bloquear boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_chat uuid;
begin
  if not es_admin() then raise exception 'sin_permiso'; end if;
  update reportes_chat
     set estado = 'revisado', nota_admin = nullif(left(trim(coalesce(p_nota, '')), 500), ''),
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_id
  returning chat_id into v_chat;
  if v_chat is null then raise exception 'no_existe'; end if;
  if p_bloquear is not null then
    update chats set bloqueado = p_bloquear where id = v_chat;
  end if;
end $$;
revoke execute on function admin_revisar_reporte_chat(uuid, text, boolean) from public, anon;
grant execute on function admin_revisar_reporte_chat(uuid, text, boolean) to authenticated;

-- 7. Descripciones -------------------------------------------------------------------
comment on table chats is 'Un chat por pareja dueño (rentador) – jugador (alquilador). Se crea cuando el dueño confirma desde la app el pago de una reserva.';
comment on column chats.abierto_hasta is 'Se puede escribir hasta 2 días después del último partido confirmado entre los dos.';
comment on column chats.ultima_reserva_id is 'Última reserva confirmada que abrió o reabrió el chat.';
comment on column reservas.confirmada_en is 'Cuándo el dueño confirmó el pago desde la app.';
comment on column reservas.chat_id is 'Chat de la pareja dueño–jugador al que pertenece esta reserva.';
comment on table mensajes_chat is 'Mensajes de cada chat (autor: cliente, dueno o sistema).';
comment on column chats.bloqueado is 'true = el admin cerró el chat por un reporte; ya no se puede escribir.';
comment on table reportes_chat is 'Reportes de chats que llegan al admin (acoso, estafa, spam u otro).';
comment on table lecturas_chat is 'Hasta cuándo leyó cada persona cada chat (para contar mensajes sin leer).';

commit;

notify pgrst, 'reload schema';
