-- Fidelidad repo↔prod (13-ago-2026): el workstream de despacho refactorizó el resolver EN PROD (a mano):
--
--   resolver_tarifa_core(text) = la lógica METRO (la de frontera-de-palabra del 21-jul,
--                                20260721170000_resolver_tarifa_v2.sql) + la GUARDIA DE PROVINCIAS F1.2
--                                (06-ago): direcciones que nombran el interior → sin_match con
--                                motivo 'fuera_del_area_metro' (mata falsos positivos tipo "La Boca"
--                                dentro de "Bocas del Toro" o "La Alborada" de Colón colándose a Z4a).
--   resolver_tarifa(text)      = ahora es un WRAPPER de telemetría (job_log action='tarifa_consulta',
--                                best-effort) que delega en el core. MISMO nombre que llama el copiloto
--                                (tool tarifa_entrega vía sb.rpc) → el bot ganó telemetría sin redeploy.
--
-- (Existe además resolver_tarifa_v2(text) — metro E interior, la llama el PUENTE vía _shared/db.ts →
--  PostgREST /rpc/resolver_tarifa_v2. Su functiondef va en su propia migración de fidelidad cuando se
--  capture de prod; NO confundir con el NOMBRE DE ARCHIVO 20260721170000_resolver_tarifa_v2.sql, que
--  creaba la función `resolver_tarifa` con el algoritmo "v2" de frontera de palabra.)
--
-- YA APLICADO EN PROD (functiondefs capturados con pg_get_functiondef el 13-ago) — NO hace falta
-- re-aplicar allá; esta migración reproduce el estado real en un ambiente fresco. Idempotente
-- (create or replace). Los textos de ambas funciones son BYTE-EXACTOS a lo capturado.

CREATE OR REPLACE FUNCTION public.resolver_tarifa_core(p_lugar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q text; qp text; v jsonb;
  -- F1.2 (2026-08-06): -'chiriqui' (calles metro homónimas: Calle Chiriquí en Punta Pacífica);
  -- +'david','dolega','bugaba','chiriqui grande' (compensan la cobertura de esa provincia);
  -- +'cativa','sabanitas' (Colón que se colaba a Z4a por "La Alborada"); +'torti','ipeti' (Panamá Este profundo).
  fuera text[] := array[
    'bocas del toro','changuinola','chiriqui grande','boquete','volcan','puerto armuelles',
    'david','dolega','bugaba',
    'veraguas','sona','atalaya','cocle','penonome','aguadulce','nata','anton',
    'chitre','los santos','las tablas','guarare','pedasi','provincia de herrera',
    'darien','meteti','yaviza','portobelo','provincia de colon','colon colon','zona libre',
    'cativa','sabanitas',
    'panama oeste','arraijan','la chorrera','capira','chame','vista alegre arraijan',
    'torti','ipeti',
    'guna yala','ngabe bugle','comarca ngabe'
  ];
begin
  q := regexp_replace(coalesce(p_lugar,''), '([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])', '\1 \2', 'g');
  q := lower(translate(q,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun'));
  q := btrim(regexp_replace(regexp_replace(q,'[^a-z0-9]+',' ','g'),'\s+',' ','g'));
  if length(q) < 2 then return jsonb_build_object('estado','sin_match','consulta',q); end if;
  qp := ' '||q||' ';

  -- Guardia de provincia: si la direccion nombra el interior, NO es entrega metro
  -- aunque algun barrio calce por casualidad (ej. "La Boca" dentro de "bocas del toro").
  if exists (select 1 from unnest(fuera) g where qp like '% '||g||' %') then
    return jsonb_build_object('estado','sin_match','consulta',q,'motivo','fuera_del_area_metro');
  end if;

  with base as (
    select s.corregimiento, s.barrio, s.distrito, s.zona, s.validacion,
           z.tarifa_base_usd, z.metodo, z.plazo, z.puntos_retiro,
           btrim(regexp_replace(regexp_replace(lower(translate(s.corregimiento,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun')),'[^a-z0-9]+',' ','g'),'\s+',' ','g')) as cn,
           btrim(regexp_replace(regexp_replace(coalesce(s.barrio_norm,''),'[^a-z0-9]+',' ','g'),'\s+',' ','g')) as bn,
           coalesce(s.alias_norm,'') as an
    from public.sectores_entrega s join public.zonas_entrega z on z.zona = s.zona
  ),
  cand as (
    select corregimiento,barrio,distrito,zona,validacion,tarifa_base_usd,metodo,plazo,puntos_retiro, cn as nombre, 'correg'::text as tipo from base where cn <> ''
    union all
    select corregimiento,barrio,distrito,zona,validacion,tarifa_base_usd,metodo,plazo,puntos_retiro, bn, 'barrio' from base where bn <> ''
    union all
    select b.corregimiento,b.barrio,b.distrito,b.zona,b.validacion,b.tarifa_base_usd,b.metodo,b.plazo,b.puntos_retiro,
           btrim(regexp_replace(regexp_replace(lower(translate(a,'áàäâéèëêíìïîóòöôúùüûñ','aaaaeeeeiiiioooouuuun')),'[^a-z0-9]+',' ','g'),'\s+',' ','g')), 'alias'
    from base b, unnest(string_to_array(b.an,',')) a where btrim(a) <> ''
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
  select case
      when not exists (select 1 from m) then jsonb_build_object('estado','sin_match','consulta',q)
      when (select count(*) from (select distinct metodo, tarifa_base_usd from m) d) = 1 then
        (select jsonb_build_object('estado','ok','consulta',q,
          'metodo',min(metodo),'tarifa_usd',min(tarifa_base_usd),'plazo',min(plazo),
          'puntos_retiro',min(puntos_retiro),'zona',min(zona),
          'confianza', case when bool_or(validacion='Media') then 'Media' else 'Alta' end,
          'ubicacion', jsonb_build_object(
             'provincia','Panamá',
             'distrito', case when count(distinct distrito)=1 then min(distrito) end,
             'corregimiento', case when count(distinct corregimiento)=1 then min(corregimiento) end,
             'barrio', case when count(distinct barrio)=1 then min(barrio) end),
          'match',(select jsonb_agg(distinct tipo||':'||nombre) from m),
          'sectores',(select jsonb_agg(distinct corregimiento||': '||barrio) from m)) from m)
      else jsonb_build_object('estado','ambiguo','consulta',q,
          'match',(select jsonb_agg(distinct tipo||':'||nombre) from m),
          'opciones',(select jsonb_agg(distinct jsonb_build_object(
            'corregimiento',corregimiento,'distrito',distrito,'zona',zona,'metodo',metodo,
            'tarifa_usd',tarifa_base_usd,'plazo',plazo,'puntos_retiro',puntos_retiro)) from m))
    end into v;
  return v;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolver_tarifa(p_lugar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  v := public.resolver_tarifa_core(p_lugar);
  begin
    insert into public.job_log (function_name, action, ok, detail)
    values (
      'resolver_tarifa',
      'tarifa_consulta',
      true,
      jsonb_build_object(
        'lugar',      left(coalesce(p_lugar, ''), 120),
        'estado',     v->'estado',
        'zona',       v->'zona',
        'tarifa_usd', v->'tarifa_usd',
        'metodo',     v->'metodo',
        'motivo',     v->'motivo',
        'opciones',   jsonb_array_length(coalesce(v->'opciones', '[]'::jsonb))
      )
    );
  exception when others then
    null; -- telemetría best-effort: nunca rompe la respuesta
  end;
  return v;
end
$function$
;

-- Grant (auto-expose OFF en este proyecto). CREATE OR REPLACE preserva el grant existente, pero se repite
-- para que la migración sea autocontenida en un entorno nuevo. El core lo llama el wrapper (security
-- definer), pero se le da grant igual por si se consulta directo en diagnóstico.
grant execute on function public.resolver_tarifa(text) to service_role;
grant execute on function public.resolver_tarifa_core(text) to service_role;

-- Verificación:
--   select public.resolver_tarifa('betania')->>'estado';           -- 'ok' (y deja fila tarifa_consulta)
--   select public.resolver_tarifa_core('david chiriqui')->>'motivo'; -- 'fuera_del_area_metro'
--   select * from public.job_log where action='tarifa_consulta' order by created_at desc limit 3;
