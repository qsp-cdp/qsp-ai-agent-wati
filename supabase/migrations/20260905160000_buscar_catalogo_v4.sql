-- RPC `buscar_catalogo` v4 — un código con letra encaja al INICIO de un token, no en cualquier parte.
--
-- Primer día en vivo del modo `codigos` (05-sep-2026 09:59, RFQ de 11 líneas de un cliente):
--   "HP W2190A 219A"  → la réplica devolvió «Tambor Hp CF219A 19A»: "219a" es substring de "cf219a".
--   "HP W1106A 106A"  → devolvió «Tinta Hp 662XL CZ106AL Color»: "106a" dentro de "cz106al".
--   "HP W1105A 105A"  → coló «Tinta Hp 662XL CZ105AL Negra» junto al tóner correcto.
-- Ninguno de esos tres códigos existe en el catálogo; la regla de v2 ("código sin match → vacío") debía
-- callar y en vez de eso presentó un vecino de otra familia. El mismo defecto hacía que "toner 26a"
-- arrastrara los 126A y "toner 55x" el 05X.
--
-- Regla: si el código que escribió el cliente lleva al menos una letra ("219a", "w1105a", "l5590",
-- "bvx700lulm"), debe empezar en frontera de token dentro del título/SKU/handle/tag normalizados (sin
-- guiones): `(^|[^a-z0-9])219a`. Un código de solo dígitos ("544", "664") sigue siendo substring, porque
-- vive dentro de tokens más largos ("t544120") y ahí el vecino ES la familia correcta.
--
-- Verificado contra producción antes de aplicar (22 consultas): 219A/106A/216A/139A/205A → vacío; W1105A →
-- el tóner y la impresora compatible (ya sin la tinta CZ105AL); 26a → solo CF226A; 55x → solo CE255X;
-- y sin cambios en PFI-050BK, MF1238, M283fdw, L5590→C9344, 544, BVX700LU-LM, 664XL, T08, 954, L3250.
-- LO QUE NO CAMBIA: el resto de v3 (handle, descripción como último criterio, prefijo de tag), el tipo y la
-- marca como filtro, el color como orden, el FTS para texto libre. Sigue sin decidir precio ni stock.

CREATE OR REPLACE FUNCTION public.buscar_catalogo(p_consulta text, p_limite integer DEFAULT 10)
 RETURNS TABLE(gid text, titulo text, handle text, sku text, marca text, tipo text, precio_usd text, descripcion text, status text, via text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_q text := btrim(coalesce(p_consulta, ''));
  v_norm text; v_codigos text[]; v_pats text[]; v_tipo text; v_marca text; v_color text;
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

  -- v4: un código CON letra debe empezar en frontera de token; uno de solo dígitos sigue siendo substring.
  select array_agg(case when c ~ '[a-z]' then '(^|[^a-z0-9])' || replace(c, '-', '') else replace(c, '-', '') end order by c)
    into v_pats from unnest(v_codigos) c;
  select array_agg(c order by c) into v_codigos from unnest(v_codigos) c;

  -- 1. "para [modelo]" → TAG de compatibilidad (patrón v4, o token del tag como PREFIJO del código: v3).
  if v_norm ~ '\mpara\M' and v_codigos is not null then
    return query
    select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
           c.precio_usd::text, c.descripcion, c.status, 'tag'::text
    from catalogo c
    where c.status <> 'archivado_local'
      and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
      and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
      and (exists (select 1 from unnest(c.tags) tg, unnest(v_pats) pat
                   where replace(lower(unaccent(tg)), '-', '') ~ pat)
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

  -- 2. CÓDIGO de modelo → título / SKU / HANDLE / tags / DESCRIPCIÓN (último). v4: frontera de token si el código lleva letra.
  if v_codigos is not null then
    return query
    select 'gid://shopify/Product/' || c.id::text, c.titulo, c.handle, c.sku, c.marca, c.tipo,
           c.precio_usd::text, c.descripcion, c.status, 'codigo'::text
    from catalogo c
    where c.status <> 'archivado_local'
      and (v_tipo is null or tipo_producto(c.titulo) is null or tipo_producto(c.titulo) = v_tipo)
      and (v_marca is null or c.marca is null or lower(c.marca) = lower(v_marca))
      and exists (select 1 from unnest(v_codigos, v_pats) as cp(cod, pat)
        where replace(lower(unaccent(c.titulo)), '-', '') ~ pat
           or replace(lower(unaccent(coalesce(c.sku, ''))), '-', '') ~ pat
           or replace(lower(coalesce(c.handle, '')), '-', '') ~ pat
           or exists (select 1 from unnest(c.tags) tg where replace(lower(unaccent(tg)), '-', '') ~ pat)
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
      (exists (select 1 from unnest(v_pats) pat where replace(lower(unaccent(c.titulo)), '-', '') ~ pat)) desc,
      (exists (select 1 from unnest(v_codigos) cod
               where replace(lower(unaccent(c.titulo)), '-', '') ~ ('\m' || replace(cod, '-', '') || '\M'))) desc,
      (exists (select 1 from unnest(v_pats) pat
               where replace(lower(unaccent(coalesce(c.sku, ''))), '-', '') ~ pat
                  or replace(lower(coalesce(c.handle, '')), '-', '') ~ pat)) desc,
      (exists (select 1 from unnest(c.tags) tg, unnest(v_codigos, v_pats) as cp(cod, pat)
               where replace(lower(unaccent(tg)), '-', '') ~ pat
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
