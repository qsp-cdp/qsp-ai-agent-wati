-- v2 del resolver de tarifas (aplicado a mano en prod el 21-jul; se back-portea al repo para que una
-- reconstrucción desde migraciones reproduzca producción). Supersede la v1 que crea
-- `20260706180000_zonas_este_retiro.sql`.
--
-- Qué cambió vs v1: ranking con FRONTERA DE PALABRA (mató los falsos positivos por subcadena: `san miguel`
-- ⊄ `san miguelito`, "La Boca" ⊄ "Bocas del Toro") + 3 niveles con desempate por longitud (exacto 300 /
-- palabras completas 200 / consulta contenida 100) + alias por coma + split de camelCase + guardia de
-- provincia (si la dirección nombra el interior, `sin_match` aunque algún barrio calce por casualidad).
-- Contrato: agrega el campo `match` (array, diagnóstico) — additivo; `frasearTarifa` lo ignora. El
-- `opciones[]` de `ambiguo` mantiene `corregimiento`/`metodo`/`tarifa_usd` (verificado — no rompe el fraseo).
--
-- Idempotente (CREATE OR REPLACE). En prod ya está aplicado, así que re-correrlo es un no-op; NO hace falta
-- volver a aplicarlo — es solo para fidelidad del repo. En prod la v1 quedó como `resolver_tarifa_v1_backup`
-- (rename manual) para rollback; en una reconstrucción desde migraciones, la v1 es la de `zonas_este_retiro`,
-- así que "rollback" = no aplicar esta migración. Aplicar en el SQL Editor si se levanta un entorno nuevo.

CREATE OR REPLACE FUNCTION public.resolver_tarifa(p_lugar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q text; qp text; v jsonb;
  fuera text[] := array[
    'bocas del toro','changuinola','chiriqui','boquete','volcan','puerto armuelles',
    'veraguas','sona','atalaya','cocle','penonome','aguadulce','nata','anton',
    'chitre','los santos','las tablas','guarare','pedasi','provincia de herrera',
    'darien','meteti','yaviza','portobelo','provincia de colon','colon colon','zona libre',
    'panama oeste','arraijan','la chorrera','capira','chame','vista alegre arraijan',
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

-- Grant (auto-expose OFF en este proyecto). CREATE OR REPLACE preserva el grant existente, pero se repite
-- para que la migración sea autocontenida en un entorno nuevo.
grant execute on function public.resolver_tarifa(text) to service_role;

-- Rollback (solo en prod, donde existe el backup del rename manual):
--   alter function public.resolver_tarifa(text) rename to resolver_tarifa_v2;
--   alter function public.resolver_tarifa_v1_backup(text) rename to resolver_tarifa;
