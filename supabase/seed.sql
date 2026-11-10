-- 3 canchas de ejemplo en Lima, con ubicación (latitud/longitud), modalidades y horarios.
-- Requisitos: haber ejecutado migraciones/002_roles_y_login.sql y tener
-- al menos un usuario en Authentication → Users.
-- Ejecuta todo en Supabase → SQL Editor. Se puede correr varias veces sin duplicar.

do $$
declare
  v_dueno uuid;
  v_id    uuid;
begin
  select id into v_dueno from perfiles order by (rol = 'dueno') desc, created_at limit 1;
  if v_dueno is null then
    raise exception 'No hay perfiles. Crea un usuario en Authentication → Users y vuelve a ejecutar.';
  end if;

  insert into canchas
    (dueno_id, nombre, slug, descripcion, deporte, superficie, direccion, distrito,
     latitud, longitud, servicios, duracion_turno_min, modalidades)
  values
    (v_dueno, 'Olivos Arena', 'olivos-arena',
     'Cancha de fútbol 7 con grass sintético de última generación y tribuna para 40 personas.',
     'futbol', 'Grass sintético', 'Av. Carlos Izaguirre 850', 'Los Olivos',
     -11.989300, -77.071200,
     array['Iluminación LED', 'Vestidores', 'Duchas', 'Estacionamiento'], 60, '{7}'),

    (v_dueno, 'La Losa de Chosica', 'la-losa-de-chosica',
     'Losa techada para futsal, ideal para jugar con sol o lluvia.',
     'futsal', 'Losa de concreto', 'Jr. Trujillo 210', 'Lurigancho-Chosica',
     -11.937000, -76.696600,
     array['Techada', 'Iluminación', 'Kiosco'], 60, '{}'),

    (v_dueno, 'San Borja Fútbol Club', 'san-borja-futbol-club',
     'Cancha de fútbol 11 que se divide para jugar fútbol 7 o 9. Turnos de 90 minutos, incluye pelotas y pecheras.',
     'futbol', 'Grass sintético', 'Av. San Luis 2450', 'San Borja',
     -12.094000, -77.001000,
     array['Iluminación LED', 'Vestidores', 'Pelotas y pecheras', 'Cafetería'], 90, '{7,9,11}')
  on conflict (slug) do nothing;

  -- Olivos Arena: L-V 08–18 S/ 50, 18–24 S/ 80; S-D 08–24 S/ 90
  select id into v_id from canchas where slug = 'olivos-arena';
  if not exists (select 1 from franjas where cancha_id = v_id) then
    insert into franjas (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
    select v_id, d, '08:00'::time, '18:00'::time, 50::numeric from generate_series(1, 5) d
    union all select v_id, d, '18:00'::time, '24:00'::time, 80::numeric from generate_series(1, 5) d
    union all select v_id, d, '08:00'::time, '24:00'::time, 90::numeric from unnest(array[0, 6]) d;
  end if;

  -- La Losa de Chosica: todos los días 09–23 S/ 40
  select id into v_id from canchas where slug = 'la-losa-de-chosica';
  if not exists (select 1 from franjas where cancha_id = v_id) then
    insert into franjas (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
    select v_id, d, '09:00'::time, '23:00'::time, 40::numeric from generate_series(0, 6) d;
  end if;

  -- San Borja FC (turnos de 90 min): L-V 17–23 S/ 70; S-D 07–22 S/ 100
  select id into v_id from canchas where slug = 'san-borja-futbol-club';
  if not exists (select 1 from franjas where cancha_id = v_id) then
    insert into franjas (cancha_id, dia_semana, hora_inicio, hora_fin, precio_hora)
    select v_id, d, '17:00'::time, '23:00'::time, 70::numeric from generate_series(1, 5) d
    union all select v_id, d, '07:00'::time, '22:00'::time, 100::numeric from unnest(array[0, 6]) d;
  end if;
end $$;

-- Opcional: ubicar también la cancha de prueba original
update canchas set latitud = -11.940500, longitud = -76.701500
where slug = 'cancha-de-prueba' and latitud is null;

-- La cancha de prueba original: fútbol 7 y 9
update canchas set modalidades = '{7,9}'
where slug = 'cancha-de-prueba' and modalidades = '{}';
