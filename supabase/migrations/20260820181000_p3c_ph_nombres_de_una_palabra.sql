-- P3-c (3ª parte): PH con nombre de UNA sola palabra ("P.H. TERRASOL" → "terrasol").
-- La carga anterior los excluyó (exigía 2+ palabras) porque una palabra suelta puede casar por
-- casualidad con cualquier dirección. Aquí entran, pero SOLO en su forma con prefijo: el nombre
-- indexado es "ph terrasol", así que únicamente casa si el cliente escribe "PH Terrasol" — nunca
-- con la palabra suelta. Mismo criterio de zona (corregimiento/barrio de zona única) y validación Media.
-- REVERSIBLE junto con la anterior: delete from sectores_entrega where tipo_zona = 'PH / Edificio';

with correg_zona as (
  select norm_lugar(corregimiento) as k, min(zona) as zona, min(corregimiento) as nombre
  from sectores_entrega where corregimiento is not null and tipo_zona is distinct from 'PH / Edificio'
  group by 1 having count(distinct zona) = 1
),
barrio_zona as (
  select norm_lugar(barrio) as k, min(zona) as zona, min(corregimiento) as nombre
  from sectores_entrega where barrio is not null and tipo_zona is distinct from 'PH / Edificio'
  group by 1 having count(distinct zona) = 1
),
ya_existe as (
  select norm_lugar(corregimiento) as k from sectores_entrega where corregimiento is not null
  union select norm_lugar(barrio) from sectores_entrega where barrio is not null
  union select norm_lugar(a) from sectores_entrega, unnest(string_to_array(coalesce(alias_norm,''),',')) a where btrim(a) <> ''
),
ph as (
  select p.nombre,
         btrim(regexp_replace(norm_lugar(p.nombre), '^(p h|ph|edificio|edif)\s+', '')) as core,
         norm_lugar(p.corregimiento) as k
  from ph_directorio p
  where p.corregimiento is not null and p.ciudad ilike '%panam%'
),
candidatos as (
  select 'ph ' || ph.core as clave, ph.nombre, coalesce(c.zona, b.zona) as zona, coalesce(c.nombre, b.nombre) as correg
  from ph left join correg_zona c on c.k = ph.k left join barrio_zona b on b.k = ph.k
  where coalesce(c.zona, b.zona) is not null
    and length(ph.core) >= 5
    and array_length(string_to_array(ph.core, ' '), 1) = 1
    and ph.core not in (select k from ya_existe)
    and ('ph ' || ph.core) not in (select k from ya_existe)
),
unicos as (
  select clave, min(zona) as zona, min(correg) as correg, min(nombre) as nombre
  from candidatos group by clave having count(distinct zona) = 1
)
insert into sectores_entrega (corregimiento, barrio, barrio_norm, alias_norm, zona, tipo_zona, validacion, nota, updated_at)
select correg, nombre, clave, clave, zona, 'PH / Edificio', 'Media',
       'Directorio de PH (eldeph), nombre de una palabra: solo casa con el prefijo PH. Zona derivada del corregimiento.',
       now()
from unicos;
