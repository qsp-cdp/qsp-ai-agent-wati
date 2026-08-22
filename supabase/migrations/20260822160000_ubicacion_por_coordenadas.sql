-- Dónde queda un pin: zona comercial + jerarquía administrativa completa, en UNA llamada.
--
-- `zona_por_coordenadas` ya resuelve zona, tarifa y corregimiento, pero NO devuelve provincia ni
-- distrito: los lee de las columnas denormalizadas de `limites_admin`, que solo están llenas en 35 de
-- las 635 filas de nivel 3. El resultado práctico es que quien necesita la jerarquía completa (el
-- espejo de direcciones de Shipday, que tiene que reescribir provincia_envio/distrito_envio en la ficha
-- del asesor) se quedaba sin ella y tenía que ponerlas en blanco.
--
-- Aquí la jerarquía sale de los POLÍGONOS, no de las columnas: nivel 1 = provincia, 2 = distrito,
-- 3 = corregimiento. Es la misma técnica con la que se le puso provincia a las agencias de Servientrega,
-- y no depende de que el dato denormalizado esté al día.
--
-- Aditiva por diseño: no toca `zona_por_coordenadas` (de la que depende el copiloto), la envuelve.
create or replace function public.ubicacion_por_coordenadas(p_lat double precision, p_lng double precision)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.zona_por_coordenadas(p_lat, p_lng), '{}'::jsonb)
       || jsonb_build_object(
            'provincia', (
              select nombre from limites_admin
              where nivel = 1 and st_contains(geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
              limit 1),
            'distrito', (
              select nombre from limites_admin
              where nivel = 2 and st_contains(geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
              limit 1)
          );
$$;

-- Misma postura que P0-1: estas funciones tocan datos de clientes, así que nadie que no sea el backend
-- las ejecuta. `anon`/`authenticated` llegan desde el navegador con la llave pública.
revoke execute on function public.ubicacion_por_coordenadas(double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.ubicacion_por_coordenadas(double precision, double precision)
  to service_role;
