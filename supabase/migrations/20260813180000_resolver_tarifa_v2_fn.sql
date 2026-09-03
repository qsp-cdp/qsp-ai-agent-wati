-- Fidelidad repo↔prod (13-ago-2026): resolver_tarifa_v2 — el resolver METRO+INTERIOR que llama el PUENTE
-- (shopify-webhook vía _shared/db.ts → PostgREST /rpc/resolver_tarifa_v2). Functiondef capturado de prod
-- con pg_get_functiondef el 13-ago, BYTE-EXACTO. YA APLICADO en prod — NO re-aplicar allá.
--
-- Flujo: delega en resolver_tarifa_core (metro). Si el core da ok/ambiguo → resultado metro + ambito +
-- itbms_rate + tarifa_con_itbms. Si no (sin_match / fuera_del_area_metro) → busca en `lugares_interior`
-- (mismo ranking de frontera-de-palabra) y devuelve: 'ok' interior con DOS opciones
-- (servientrega_sucursal / servientrega_domicilio, tarifas de las zonas 'INT Sucursal'/'INT Domicilio'),
-- 'sin_servicio' (comarca con con_servicio=false), o 'ambiguo' interior (lugares en >1 provincia).
--
-- ⚠️ DEPENDENCIAS DE DATA que el repo AÚN NO TIENE (capturar de prod → migración de fidelidad aparte,
-- que debe ordenarse ANTES de esta en un ambiente fresco; mientras tanto esta función CREA bien igual
-- (plpgsql no resuelve tablas al crear) y el camino metro FUNCIONA — solo el camino interior fallaría):
--   1. tabla public.lugares_interior (provincia, lugar, tipo, con_servicio, plazo, nota, alias)
--   2. filas de zonas_entrega: 'INT Sucursal' y 'INT Domicilio'
--   3. store_facts: 'itbms_rate' (fallback 0.07 en código) y 'envio_gratis_umbral_usd' (nullable)
--
-- NO confundir: el COPILOTO (tool tarifa_entrega) sigue llamando resolver_tarifa (wrapper→core, solo
-- metro); resolver_tarifa_v2 es la entrada del puente. Ver 20260813170000_resolver_tarifa_core_wrapper.sql.

CREATE OR REPLACE FUNCTION public.resolver_tarifa_v2(p_lugar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb; mm jsonb; q text; qp text;
  rate numeric; umbral numeric;
  r_prov text; r_lugar text; r_tipo text; r_plazo text; plz text;
  suc record; dom record;
begin
  v := public.resolver_tarifa_core(p_lugar);
  rate   := coalesce((select nullif(btrim(value),'')::numeric from store_facts where key='itbms_rate'), 0.07);
  umbral := (select nullif(btrim(value),'')::numeric from store_facts where key='envio_gratis_umbral_usd');

  if (v->>'estado') in ('ok','ambiguo') then
    return v || jsonb_build_object('ambito','metro','itbms_rate',rate)
             || case when (v->>'tarifa_usd') is not null
                     then jsonb_build_object('tarifa_con_itbms', round((v->>'tarifa_usd')::numeric*(1+rate),2))
                     else '{}'::jsonb end;
  end if;

  q := regexp_replace(coalesce(p_lugar,''),'([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])','\1 \2','g');
  q := lower(translate(q,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun'));
  q := btrim(regexp_replace(regexp_replace(q,'[^a-z0-9]+',' ','g'),'\s+',' ','g'));
  if length(q) < 2 then return v || jsonb_build_object('itbms_rate',rate); end if;
  qp := ' '||q||' ';

  with base as (
    select li.provincia, li.lugar, li.tipo, li.con_servicio, li.plazo, li.nota,
           btrim(regexp_replace(regexp_replace(lower(translate(li.lugar,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun')),'[^a-z0-9]+',' ','g'),'\s+',' ','g')) as ln,
           coalesce(li.alias,'') as al
    from public.lugares_interior li
  ),
  cand as (
    select provincia,lugar,tipo,con_servicio,plazo,nota, ln as nombre from base where ln <> ''
    union all
    select b.provincia,b.lugar,b.tipo,b.con_servicio,b.plazo,b.nota,
           btrim(regexp_replace(regexp_replace(lower(translate(a,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun')),'[^a-z0-9]+',' ','g'),'\s+',' ','g'))
    from base b, unnest(string_to_array(b.al,',')) a where btrim(a) <> ''
  ),
  scored as (
    select c.*, case
        when c.nombre = q then 300 + length(c.nombre)
        when qp like '% '||c.nombre||' %' then 200 + length(c.nombre)
        when (' '||c.nombre||' ') like '% '||q||' %' then 100 + length(q)
        else 0 end as score
    from cand c where c.nombre <> ''
  ),
  m as (select * from scored where score = (select max(score) from scored where score > 0))
  select jsonb_agg(to_jsonb(m)) into mm from m;

  if mm is null then
    return v || jsonb_build_object('itbms_rate',rate);
  end if;

  if (select bool_and((e->>'con_servicio') = 'false') from jsonb_array_elements(mm) e) then
    return jsonb_build_object('estado','sin_servicio','ambito','interior','consulta',q,
      'lugar', mm->0->>'lugar', 'provincia', mm->0->>'provincia',
      'nota', coalesce(mm->0->>'nota','Sin cobertura de entrega; un asesor coordina retiro en la sucursal Servientrega más cercana.'),
      'itbms_rate', rate,
      'match',(select jsonb_agg(distinct e->>'nombre') from jsonb_array_elements(mm) e));
  end if;

  if (select count(distinct e->>'provincia') from jsonb_array_elements(mm) e) > 1 then
    return jsonb_build_object('estado','ambiguo','ambito','interior','consulta',q,
      'opciones',(select jsonb_agg(distinct jsonb_build_object('provincia',e->>'provincia','lugar',e->>'lugar')) from jsonb_array_elements(mm) e),
      'itbms_rate', rate,
      'match',(select jsonb_agg(distinct e->>'nombre') from jsonb_array_elements(mm) e));
  end if;

  select e->>'provincia', e->>'lugar', e->>'tipo', e->>'plazo'
    into r_prov, r_lugar, r_tipo, r_plazo
  from jsonb_array_elements(mm) e
  order by case e->>'tipo' when 'ciudad' then 1 when 'comarca' then 1 else 2 end, length(e->>'nombre') desc
  limit 1;

  plz := coalesce(r_plazo, (select li.plazo from public.lugares_interior li where li.provincia = r_prov and li.tipo = 'provincia' limit 1));
  select tarifa_base_usd, plazo into suc from public.zonas_entrega where zona = 'INT Sucursal';
  select tarifa_base_usd, plazo into dom from public.zonas_entrega where zona = 'INT Domicilio';

  return jsonb_build_object('estado','ok','ambito','interior','consulta',q,
    'provincia', r_prov, 'lugar', r_lugar, 'tipo', r_tipo,
    'plazo', coalesce(plz, 'Al día hábil siguiente'),
    'opciones', jsonb_build_array(
      jsonb_build_object('metodo','servientrega_sucursal','zona','INT Sucursal',
        'tarifa_usd', suc.tarifa_base_usd, 'tarifa_con_itbms', round(suc.tarifa_base_usd*(1+rate),2),
        'nota','El cliente retira con su cédula en la agencia Servientrega que prefiera'),
      jsonb_build_object('metodo','servientrega_domicilio','zona','INT Domicilio',
        'tarifa_usd', dom.tarifa_base_usd, 'tarifa_con_itbms', round(dom.tarifa_base_usd*(1+rate),2),
        'nota','Entrega puerta a puerta vía Servientrega')),
    'envio_gratis_umbral_usd', umbral,
    'nota_envio_gratis','En compra web mayor al umbral, el envío gratis del interior es A SUCURSAL (retiro), no puerta a puerta',
    'itbms_rate', rate,
    'match',(select jsonb_agg(distinct e->>'nombre') from jsonb_array_elements(mm) e));
end;
$function$
;

-- Grant (auto-expose OFF): el puente la llama por PostgREST como service_role.
grant execute on function public.resolver_tarifa_v2(text) to service_role;

-- Verificación (con la data de fidelidad aplicada):
--   select public.resolver_tarifa_v2('betania')->>'ambito';   -- 'metro' (+ tarifa_con_itbms)
--   select public.resolver_tarifa_v2('david')->>'estado';     -- 'ok' ambito 'interior', 2 opciones
--   select public.resolver_tarifa_v2('comarca...')->>'estado';-- 'sin_servicio'
