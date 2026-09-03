-- RPC `buscar_catalogo` v2 — el motor léxico de la réplica, corregido con casos reales.
--
-- La v1 (28-ago) acertaba 4 de 8 casos de la historia del proyecto. Los 3 fallos NO eran de calibración
-- fina: cada uno rompía una regla que el copiloto ya tenía escrita en TypeScript y que este motor no
-- heredó. Se corrigen las tres, más el ordenamiento del texto libre.
--
-- ── FALLO 1: un código sin match caía al FTS y devolvía ruido ───────────────────────────────────────
--   "tinta HP 63XL" (no existe en el catálogo) devolvía «Tinta Hp 662XL», «módulo dúplex», «Toner
--   W2130X». Es EXACTAMENTE el incidente del 01-sep (v120): el bot inventó un 63XL y mandó a un cliente
--   a la tienda. Un motor que ante un código inexistente contesta con el vecino más parecido le sirve
--   la alucinación en bandeja.
--   v60.1 ya decidió esto para el otro motor: código no hallado → NO presentar el vecino como el
--   modelo pedido. Aquí se aplica en su forma más dura: **si la consulta trae un código de modelo y
--   nada lo tiene, se devuelve VACÍO**. La réplica prefiere callar; el motor semántico en vivo sigue
--   estando para sugerir alternativas, y ahí sí van marcadas como aproximadas.
--
-- ── FALLO 2: el match de código en TAGS era por substring ───────────────────────────────────────────
--   "cabezales para impresora HP 410" devolvía botellas Canon GI-190. Motivo: el tag «Canon Pixma
--   G4100» contiene "410" como substring. Los datos reales lo muestran claro — el tag CORRECTO
--   («Hp Ink Tank 410») convive con falsos amigos donde el número está DENTRO de otro:
--     Canon Pixma G4100 · Brother PT-2410 · Lexmark MS410dn · HP LaserJet Pro MFP 4103dw
--   Frontera de palabra (\m \M) los separa sin ambigüedad. Es la lección de v55 llevada a los tags.
--
--   ⚠️ Pero la frontera NO puede usarse como FILTRO en los títulos: medido sobre el catálogo real,
--   «Toner Lexmark C540A1CG … X544 / C544» se perdería para "toner Lexmark 544" (el código va pegado
--   a una letra). Por eso la frontera es **criterio de ORDEN**, no de filtro: el substring conserva el
--   recall y la frontera pone primero lo preciso. Así "544" devuelve los Epson 544 arriba y el «Tambor
--   Brother DR-720» (que contiene "544" dentro de "HL-5440D") abajo, sin perderlo.
--
-- ── FALLO 3: el TIPO que nombra el cliente se ignoraba ──────────────────────────────────────────────
--   v61.2 estableció que cuando el cliente dice "cabezal", "tóner" o "tinta", esa palabra MANDA sobre
--   el número — y lo implementó en TS (`tipoPedido`/`tituloDeTipo`). Este motor no lo tenía, así que
--   "cabezales para HP 410" mezclaba cabezales con las botellas GT52/GT53 (que comparten el tag).
--   Se replica aquí con la misma regla conservadora: un título SIN tipo claro nunca se descarta.
--   Se agrega un tipo que el TS no tenía y el catálogo sí necesita: `mantenimiento` (la caja/cartucho
--   de mantenimiento no es tinta, aunque su título diga "Cartucho").
--
-- ── FALLO 4: el texto libre ordenaba por ts_rank sobre una consulta puramente OR ────────────────────
--   "papel bond 30 pulgadas" devolvía «Cinta Epson ERC-38B» y dos tóners. El OR es correcto para no
--   repetir el defecto de suggest.json (una palabra ausente daba cero), pero ordenar solo por ts_rank
--   deja ganar a un documento que matcheó UNA palabra común. Ahora ordena primero por **cuántos
--   términos DISTINTOS de la consulta aparecen**: el rollo Alliance matchea papel+bond+30 (3) y el
--   ruido matchea 1. No se filtra por ese conteo — solo se ordena — así que el recall del OR se
--   conserva intacto.
--
-- LO QUE NO CAMBIA: sigue sin devolver stock ni decidir precio (`precio_usd` es de REFERENCIA, para
-- filtrar y ordenar); la cotización y la disponibilidad salen EN VIVO de `buscar_producto`. Y sigue
-- viendo AGOTADOS y borradores — la ceguera que convirtió "está agotado, espere" en "no lo tenemos"
-- (C9344, 28-ago) y que es la razón de existir de la réplica.


-- ── FALLO 5 (hallado al validar): el motor ignoraba TRES palabras que el cliente sí escribe ────────
--   · MARCA — "toner HP 410" devolvía tóners LEXMARK. Su lista de compatibles trae "410" como palabra
--     suelta, mientras el HP real se llama «CF410A» (el código pegado a una letra), así que hasta la
--     frontera de palabra premiaba al equivocado. Ninguna heurística de texto separa eso; la marca sí,
--     y el catálogo la tiene limpia (Hp 493 · Canon 307 · Brother 192 · Epson 139 · Lexmark 62…).
--     Es FILTRO, como el tipo, y con la misma tolerancia: un producto sin marca registrada no se
--     descarta. Efecto lateral bueno: "toner HP 70C8" (ese código es de Lexmark) ahora da VACÍO en vez
--     de ofrecer otra marca — la regla de v60.1 aplicada en la réplica.
--   · CLASE DE PRODUCTO — "impresora epson ecotank" devolvía cajas de mantenimiento. Se agrega el tipo
--     `equipo`, detectado por cómo ARRANCA el título (medido: 135 títulos arrancan con impresora/
--     multifuncional/plotter/escáner y son equipos reales; los 82 que mencionan "impresoras" sin serlo
--     son tóners «para Impresoras Xerox» y no arrancan así). El orden de las ramas importa en los dos
--     sentidos: en `tipo_producto` `equipo` va PRIMERO (una «Impresora Canon G4170 Tinta Continua» es
--     un equipo, no una tinta) y en `tipo_pedido` va ÚLTIMO ("tinta para impresora G4170" pide TINTA).
--   · COLOR — "tinta HP 954 negra" devolvía la Cyan primero. Es criterio de ORDEN, no filtro: un combo
--     de 4 colores sigue siendo una respuesta válida a una consulta con color.
--
-- ── LO QUE NO SE PUDO ARREGLAR AQUÍ (hueco de DATOS, no de código) ─────────────────────────────────
--   "toner 508A magenta" devuelve el CF361A, que es CIAN. Los títulos de esa familia —«Toner Hp CF361A
--   508A | M552 / M553»— NO llevan el color, así que la llave de color no tiene con qué ordenar. No es
--   algo que el SQL pueda deducir: se arregla en Shopify agregando el color al título (o a un tag),
--   como se hizo con el tag "T544" del combo Epson.

-- Las cuatro funciones, tal como quedaron VIVAS en producción (capturadas con pg_get_functiondef
-- después de validar el banco de 20 casos, para que el repo sea exactamente lo desplegado).

CREATE OR REPLACE FUNCTION public.tipo_pedido(p_consulta text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select case
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(mantenimiento|maintenance)\M' then 'mantenimiento'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(cabezal|cabezales|printhead)\M' then 'cabezal'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(toner|toners)\M' then 'toner'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(tinta|tintas|botella|botellas|cartucho|cartuchos)\M' then 'tinta'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(cinta|cintas)\M' then 'cinta'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(tambor|drum|fotoconductor)\M' then 'tambor'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(impresora|impresoras|multifuncional|plotter|escaner|scanner)\M' then 'equipo'
    else null end
$function$;

CREATE OR REPLACE FUNCTION public.tipo_producto(p_titulo text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select case
    when lower(unaccent(coalesce(p_titulo,''))) ~ '^(impresora|multifuncional|plotter|escaner|scanner)\M' then 'equipo'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(mantenimiento|maintenance)\M' then 'mantenimiento'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(cabezal|cabezales|printhead)\M' then 'cabezal'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(toner|toners)\M' then 'toner'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(tinta|tintas|botella|botellas|cartucho|cartuchos)\M' then 'tinta'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(cinta|cintas)\M' then 'cinta'
    when lower(unaccent(coalesce(p_titulo,''))) ~ '\m(tambor|drum|fotoconductor)\M' then 'tambor'
    else null end
$function$;

CREATE OR REPLACE FUNCTION public.color_pedido(p_consulta text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select case
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(negro|negra|black)\M'        then '\m(negro|negra|black)\M'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(cian|cyan)\M'                then '\m(cian|cyan)\M'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(magenta|morada|morado)\M'    then '\m(magenta)\M'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(amarillo|amarilla|yellow)\M' then '\m(amarillo|amarilla|yellow)\M'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(tricolor)\M'                 then '\m(tricolor)\M'
    when lower(unaccent(coalesce(p_consulta,''))) ~ '\m(gris|gray|grey)\M'           then '\m(gris|gray|grey)\M'
    else null end
$function$;

CREATE OR REPLACE FUNCTION public.buscar_catalogo(p_consulta text, p_limite integer DEFAULT 10)
 RETURNS TABLE(gid text, titulo text, handle text, sku text, marca text, tipo text, precio_usd text, descripcion text, status text, via text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_q text := btrim(coalesce(p_consulta, ''));
  v_norm text; v_codigos text[]; v_tipo text; v_marca text; v_color text;
  v_lim int := greatest(1, least(coalesce(p_limite, 10), 50));
  v_tsq tsquery; v_pal text[]; v_base text[]; v_combo boolean; v_fts_src text;
begin
  if v_q = '' then return; end if;
  v_norm := lower(unaccent(v_q));
  v_tipo := tipo_pedido(v_norm);
  v_color := color_pedido(v_norm);
  v_combo := v_norm ~ '\m(combos?|juegos?|packs?|kits?|multipack|set)\M';
  -- Dimensiones partidas para el FTS ("11x17" → "11 17"): el catálogo las escribe con espacios.
  v_fts_src := regexp_replace(v_norm, '([0-9])[[:space:]]*x[[:space:]]*([0-9])', '\1 \2', 'g');

  -- La marca que nombró el cliente, contra las que el catálogo tiene. (`mk` evita el choque con el
  -- parámetro de salida `marca`.)
  select m.mk into v_marca
  from (select distinct c2.marca as mk from catalogo c2 where coalesce(c2.marca,'') <> '') m
  where v_norm ~ ('\m' || lower(unaccent(m.mk)) || '\M')
  order by length(m.mk) desc limit 1;

  select array_agg(distinct t) into v_codigos
  from unnest(regexp_split_to_array(v_norm, '[^a-z0-9\-]+')) t
  where length(t) >= 3 and t ~ '[0-9]' and t ~ '^[a-z0-9\-]+$' and t !~ '^[0-9]+x[0-9]+$';

  -- 1. "para [modelo]" → TAG de compatibilidad (el conjunto COMPLETO; el combo no se puede esconder).
  if v_norm ~ '\mpara\M' and v_codigos is not null then
    return query
    select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
           c.precio_usd::text, c.descripcion, c.status, 'tag'::text
    from catalogo c
    where c.status <> 'archivado_local'
      and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
      and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
      and exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod
                  where replace(lower(unaccent(tg)), '-', '') like '%' || replace(cod, '-', '') || '%')
    order by
      (v_combo and lower(unaccent(c.titulo)) ~ '\m(combos?|juegos?|packs?|kits?|multipack)\M') desc,
      (v_color is null or lower(unaccent(c.titulo)) ~ v_color) desc,
      (exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod
               where replace(lower(unaccent(tg)), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M'))) desc,
      (c.status = 'active') desc, c.precio_usd nulls last
    limit v_lim;
    if found then return; end if;
  end if;

  -- 2. CÓDIGO de modelo → título / SKU / tags, con y sin guion.
  if v_codigos is not null then
    return query
    select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
           c.precio_usd::text, c.descripcion, c.status, 'codigo'::text
    from catalogo c
    where c.status <> 'archivado_local'
      and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
      and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
      and exists (select 1 from unnest(v_codigos) cod
        where replace(lower(unaccent(c.titulo)), '-', '') like '%' || replace(cod, '-', '') || '%'
           or replace(lower(unaccent(coalesce(c.sku, ''))), '-', '') like '%' || replace(cod, '-', '') || '%'
           or exists (select 1 from unnest(c.tags) tg
                      where replace(lower(unaccent(tg)), '-', '') like '%' || replace(cod, '-', '') || '%'))
    order by
      (v_combo and lower(unaccent(c.titulo)) ~ '\m(combos?|juegos?|packs?|kits?|multipack)\M') desc,
      (v_color is null or lower(unaccent(c.titulo)) ~ v_color) desc,
      -- El código EN EL TÍTULO antes que uno que solo matcheó por tag: ése es un COMPATIBLE, no el
      -- producto pedido.
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(c.titulo)), '-', '') like '%' || replace(cod, '-', '') || '%')) desc,
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(c.titulo)), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M'))) desc,
      (c.status = 'active') desc, length(c.titulo)
    limit v_lim;
    if found then return; end if;
  end if;

  -- 3. Traía código y NADA lo tiene → CALLAR (ver FALLO 1 arriba). Sin esto, "tinta HP 63XL" caía al
  -- FTS y devolvía un vecino con otro número: la materia prima del incidente del 01-sep.
  if v_codigos is not null then return; end if;

  -- 4. TEXTO LIBRE → FTS en español con los sinónimos del negocio, ordenado por cuántos términos
  -- DISTINTOS matcheó cada documento (ver FALLO 4).
  select array_agg(distinct coalesce(sin.canonico, w)) into v_base
  from unnest(regexp_split_to_array(v_fts_src, '[^a-z0-9]+')) w
  left join busqueda_sinonimos sin on sin.termino = w
  where length(w) >= 2;
  if v_base is null or array_length(v_base, 1) is null then return; end if;
  select array_agg(b || ':*') into v_pal from unnest(v_base) b;
  v_tsq := to_tsquery('spanish', array_to_string(v_pal, ' | '));

  return query
  select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
         c.precio_usd::text, c.descripcion, c.status, 'fts'::text
  from catalogo c
  where c.status <> 'archivado_local' and c.busq @@ v_tsq
    and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
    and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
  order by
    (select count(*) from unnest(v_base) b where c.busq @@ to_tsquery('spanish', b || ':*')) desc,
    (v_color is null or lower(unaccent(c.titulo)) ~ v_color) desc,
    ts_rank(c.busq, v_tsq) desc, (c.status = 'active') desc
  limit v_lim;
end;
$function$;

revoke all on function public.tipo_pedido(text)      from public;
revoke all on function public.tipo_producto(text)    from public;
revoke all on function public.color_pedido(text)     from public;
revoke all on function public.buscar_catalogo(text, int) from public;
grant execute on function public.tipo_pedido(text)      to service_role;
grant execute on function public.tipo_producto(text)    to service_role;
grant execute on function public.color_pedido(text)     to service_role;
grant execute on function public.buscar_catalogo(text, int) to service_role;
