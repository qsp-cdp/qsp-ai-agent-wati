-- P3-c (2ª parte): conectar el directorio de PH (ph_directorio, 2477 filas) al resolvedor de zonas.
-- Direcciones reales que daban sin_match: "PH VERANDA TOWER, APT 14B" (pedido 8858), "P.H. Parkside"
-- (8842). El resolvedor busca nombres (corregimiento/barrio/alias) dentro del texto de la dirección,
-- así que cada PH entra como una fila más del diccionario, con la ZONA de su corregimiento.
--
-- Salvaguardas (el diccionario base está validado a mano; esto NO debe ensuciarlo):
--   · Solo PH de Ciudad de Panamá cuyo corregimiento/barrio tenga UNA sola zona.
--   · Nombre NÚCLEO sin el prefijo "P.H."/"PH"/"Edificio" + alias con prefijo.
--   · Mínimo 9 caracteres y 2 palabras (los de 1 palabra van en la migración siguiente, solo con prefijo).
--   · Se descarta lo que YA exista en el diccionario (el dato validado manda) y los homónimos con
--     zonas distintas (ante la duda, no se adivina).
--   · validacion='Media' → el copiloto añade "un asesor confirma el costo exacto" (frasearTarifa).
-- Verificado: 0 regresiones sobre 200 direcciones que ya resolvían; 2 pasaron de sin_match a ok.
-- REVERSIBLE: delete from sectores_entrega where tipo_zona = 'PH / Edificio';

with correg_zona as (
  select norm_lugar(corregimiento) as k, min(zona) as zona, min(corregimiento) as nombre
  from sectores_entrega where corregimiento is not null group by 1 having count(distinct zona) = 1
),
barrio_zona as (
  select norm_lugar(barrio) as k, min(zona) as zona, min(corregimiento) as nombre
  from sectores_entrega where barrio is not null group by 1 having count(distinct zona) = 1
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
  select ph.core, ph.nombre, coalesce(c.zona, b.zona) as zona, coalesce(c.nombre, b.nombre) as correg
  from ph left join correg_zona c on c.k = ph.k left join barrio_zona b on b.k = ph.k
  where coalesce(c.zona, b.zona) is not null
    and length(ph.core) >= 9
    and array_length(string_to_array(ph.core, ' '), 1) >= 2
    and ph.core not in (select k from ya_existe)
),
unicos as (
  select core, min(zona) as zona, min(correg) as correg, min(nombre) as nombre
  from candidatos group by core having count(distinct zona) = 1
)
insert into sectores_entrega (corregimiento, barrio, barrio_norm, alias_norm, zona, tipo_zona, validacion, nota, updated_at)
select correg, nombre, core, 'ph ' || core, zona, 'PH / Edificio', 'Media',
       'Directorio de PH (eldeph). Zona derivada del corregimiento; confirmar con el cliente si la entrega es crítica.',
       now()
from unicos;
