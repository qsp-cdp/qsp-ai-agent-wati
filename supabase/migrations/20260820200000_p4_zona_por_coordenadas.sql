-- P4: ZONA POR COORDENADAS (pin → zona), 100% en casa, sin APIs externas.
-- El cliente comparte su ubicación (v77 la captura) o Shopify trae lat/lng: con los polígonos de
-- corregimientos (limites_admin nivel 3, COD-AB/OCHA vía geo-loader) se resuelve el corregimiento por
-- point-in-polygon y de ahí la zona del diccionario. Vía MÁS precisa: no depende de cómo el cliente
-- escribió la dirección. Los polígonos usan el nombre OFICIAL ("La Exposición o Calidonia"): el match
-- acepta contención por palabra completa en ambos sentidos. Corregimiento con varias zonas → ambiguo.
-- Verificado con 6 casos (Betania ok, Calidonia ok, mar sin_match, David sin_match/interior,
-- Juan Díaz ok, San Francisco ok). SECURITY DEFINER + EXECUTE solo service_role (P0-1).
create or replace function public.zona_por_coordenadas(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correg text; v_distrito text; v_prov text;
  v_res jsonb;
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    return jsonb_build_object('estado','sin_match','motivo','coordenadas_invalidas');
  end if;
  select nombre, distrito, provincia into v_correg, v_distrito, v_prov
  from limites_admin
  where nivel = 3 and st_contains(geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
  limit 1;
  if v_correg is null then
    return jsonb_build_object('estado','sin_match','motivo','fuera_de_poligonos');
  end if;
  with zonas as (
    select distinct s.zona, z.tarifa_base_usd, z.metodo, z.plazo, z.puntos_retiro
    from sectores_entrega s join zonas_entrega z on z.zona = s.zona
    where s.tipo_zona is distinct from 'PH / Edificio'
      and (
        norm_lugar(s.corregimiento) = norm_lugar(v_correg)
        or ' ' || norm_lugar(v_correg) || ' ' like '% ' || norm_lugar(s.corregimiento) || ' %'
        or ' ' || norm_lugar(s.corregimiento) || ' ' like '% ' || norm_lugar(v_correg) || ' %'
      )
  )
  select case
    when count(*) = 0 then jsonb_build_object(
      'estado','sin_match','motivo','corregimiento_sin_zona',
      'corregimiento', v_correg, 'distrito', v_distrito, 'provincia', v_prov)
    when count(*) = 1 then jsonb_build_object(
      'estado','ok','ambito','metro','zona', min(zona),
      'tarifa_usd', min(tarifa_base_usd), 'metodo', min(metodo), 'plazo', min(plazo),
      'puntos_retiro', min(puntos_retiro), 'confianza','Alta',
      'corregimiento', v_correg, 'match', jsonb_build_array('pin:' || v_correg))
    else jsonb_build_object(
      'estado','ambiguo','corregimiento', v_correg,
      'opciones', jsonb_agg(jsonb_build_object('zona', zona, 'tarifa_usd', tarifa_base_usd, 'metodo', metodo)))
  end into v_res
  from zonas;
  return v_res;
end;
$$;

revoke execute on function public.zona_por_coordenadas(double precision, double precision) from public, anon, authenticated;
grant execute on function public.zona_por_coordenadas(double precision, double precision) to service_role;
