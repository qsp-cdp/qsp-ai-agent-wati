-- RPC `buscar_catalogo` v3 — las tres pérdidas reales de la sombra (7 días, 235 comparaciones).
--
-- La sombra de la fase 2 (v120/v122) midió la réplica contra el motor en vivo durante una semana:
-- 205 consultas con código, 180 halladas por ambos, 0 rescatadas solo por la réplica, 23 "perdidas"
-- (la réplica vacía y el motor con algo). Revisadas una por una, la mayoría de esas 23 son VIRTUDES:
-- códigos que NO existen en el catálogo ("HP 205A", "HP 88A", "Canon CL-546", "GT51") donde el motor
-- semántico devolvió el vecino equivocado (206A, 26A, CL-146XL) y la réplica calló — la regla de v60.1.
-- Quedaban tres pérdidas de verdad, y las tres son de MATCH, no de datos:
--
-- ── 1. El código va en el HANDLE y en ningún otro lado ────────────────────────────────────────────
--   "PFI-050BK" → «Tinta Canon PFI-050 5698C001AA Negra». El título dice PFI-050 (sin el sufijo de
--   color), el SKU es 5698C001AA, los tags son las impresoras. Pero el handle es
--   `tinta-canon-pfi-050bk-negro-para-imageprograf-tc-20-tc-20m`: el código comercial completo vive
--   ahí. Lo mismo para PFI-050C/M/Y. Se suma el handle a la rama de código.
--
-- ── 2. La compatibilidad vive en la DESCRIPCIÓN cuando el producto no tiene tags ──────────────────
--   "toner canon MF1238" → «Toner Canon T08 3010C005 Negro» tiene tags = []. El motor semántico lo
--   halla porque la descripción dice para qué impresoras sirve. Se suma la descripción como ÚLTIMO
--   criterio de match (después de título, SKU, handle y tags) y como último de orden: un producto que
--   solo matcheó por descripción es un COMPATIBLE, nunca el producto pedido.
--
-- ── 3. El tag es un PREFIJO del modelo que escribe el cliente ─────────────────────────────────────
--   "toner HP MFP M283fdw negro" → los tóners 206A llevan el tag «HP LaserJet Pro M283». El cliente
--   escribe el modelo completo (M283fdw) y "m283fdw" no es substring de "m283": es al revés. Se
--   acepta el tag cuyo token de modelo (≥4 caracteres, con dígito) sea PREFIJO del código pedido.
--   La frontera de palabra del token evita que "m283" agarre "m2835".
--
-- LO QUE NO CAMBIA: la regla dura de v2 (código sin match en NADA → vacío), el tipo y la marca como
-- filtro, el color como orden, y el FTS para texto libre. Sigue sin decidir precio ni stock.

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
  v_fts_src := regexp_replace(v_norm, '([0-9])[[:space:]]*x[[:space:]]*([0-9])', '\1 \2', 'g');

  select m.mk into v_marca
  from (select distinct c2.marca as mk from catalogo c2 where coalesce(c2.marca,'') <> '') m
  where v_norm ~ ('\m' || lower(unaccent(m.mk)) || '\M')
  order by length(m.mk) desc limit 1;

  select array_agg(distinct t) into v_codigos
  from unnest(regexp_split_to_array(v_norm, '[^a-z0-9\-]+')) t
  where length(t) >= 3 and t ~ '[0-9]' and t ~ '^[a-z0-9\-]+$' and t !~ '^[0-9]+x[0-9]+$';

  -- 1. "para [modelo]" → TAG de compatibilidad (substring, o token del tag como PREFIJO del código: v3).
  if v_norm ~ '\mpara\M' and v_codigos is not null then
    return query
    select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
           c.precio_usd::text, c.descripcion, c.status, 'tag'::text
    from catalogo c
    where c.status <> 'archivado_local'
      and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
      and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
      and (exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod
                   where replace(lower(unaccent(tg)), '-', '') like '%' || replace(cod, '-', '') || '%')
        or exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod,
                        unnest(regexp_split_to_array(replace(lower(unaccent(tg)), '-', ''), '[^a-z0-9]+')) tok
                   where length(tok) >= 4 and tok ~ '[0-9]' and replace(cod, '-', '') like tok || '%'))
    order by
      (v_combo and lower(unaccent(c.titulo)) ~ '\m(combos?|juegos?|packs?|kits?|multipack)\M') desc,
      (v_color is null or lower(unaccent(c.titulo)) ~ v_color) desc,
      (exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod
               where replace(lower(unaccent(tg)), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M'))) desc,
      (c.status = 'active') desc, c.precio_usd nulls last
    limit v_lim;
    if found then return; end if;
  end if;

  -- 2. CÓDIGO de modelo → título / SKU / HANDLE (v3) / tags (substring o prefijo, v3) / DESCRIPCIÓN (v3, último).
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
           or replace(lower(coalesce(c.handle, '')), '-', '') like '%' || replace(cod, '-', '') || '%'
           or exists (select 1 from unnest(c.tags) tg
                      where replace(lower(unaccent(tg)), '-', '') like '%' || replace(cod, '-', '') || '%')
           or exists (select 1 from unnest(c.tags) tg,
                           unnest(regexp_split_to_array(replace(lower(unaccent(tg)), '-', ''), '[^a-z0-9]+')) tok
                      where length(tok) >= 4 and tok ~ '[0-9]' and replace(cod, '-', '') like tok || '%')
           or (length(replace(cod, '-', '')) >= 4
               and replace(lower(unaccent(coalesce(c.descripcion, ''))), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M')))
    order by
      (v_combo and lower(unaccent(c.titulo)) ~ '\m(combos?|juegos?|packs?|kits?|multipack)\M') desc,
      (v_color is null or lower(unaccent(c.titulo)) ~ v_color) desc,
      -- El código EN EL TÍTULO antes que uno que solo matcheó por SKU/handle; y esos antes que por
      -- tag; y la descripción de último: ese es un COMPATIBLE, no el producto pedido.
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(c.titulo)), '-', '') like '%' || replace(cod, '-', '') || '%')) desc,
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(c.titulo)), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M'))) desc,
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(coalesce(c.sku, ''))), '-', '') like '%' || replace(cod, '-', '') || '%'
                  or replace(lower(coalesce(c.handle, '')), '-', '') like '%' || replace(cod, '-', '') || '%')) desc,
      (exists (select 1 from unnest(c.tags) tg, unnest(v_codigos) cod
               where replace(lower(unaccent(tg)), '-', '') like '%' || replace(cod, '-', '') || '%'
                  or exists (select 1 from unnest(regexp_split_to_array(replace(lower(unaccent(tg)), '-', ''), '[^a-z0-9]+')) tok
                             where length(tok) >= 4 and tok ~ '[0-9]' and replace(cod, '-', '') like tok || '%'))) desc,
      (c.status = 'active') desc, length(c.titulo)
    limit v_lim;
    if found then return; end if;
  end if;

  -- 3. Traía código y NADA lo tiene → CALLAR (regla de v2 / v60.1).
  if v_codigos is not null then return; end if;

  -- 4. TEXTO LIBRE → FTS (sin cambios respecto a v2).
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

revoke all on function public.buscar_catalogo(text, int) from public;
grant execute on function public.buscar_catalogo(text, int) to service_role;
