-- RÉPLICA DEL CATÁLOGO — fase 1 del "mapa abierto" (diseño acordado 27-ago, docs/diseno-2026-08-27).
--
-- POR QUÉ EXISTE: el bot mira el catálogo por una mirilla de 5 resultados y esa mirilla ya costó
-- ventas: el combo T544 en la posición 6 (v61), la HP 9730 declarada inexistente ante "11x17" con
-- 5 unidades activas (27-ago), la caja C9344 invisible por estar agotada (28-ago — el motor
-- semántico de Shopify no muestra productos sin stock, y "agotado" se convirtió en "no lo tenemos").
-- Esta tabla es el catálogo COMPLETO — incluidos agotados y borradores — consultable con SQL.
--
-- LÍNEA ROJA (del diseño, no negociable): el precio de esta tabla FILTRA y ORIENTA; jamás cotiza.
-- La cotización y el stock de las finalistas salen EN VIVO de buscar_producto, como siempre.
--
-- La escriben: la Edge Function `catalogo-sync` (webhooks products/* de Shopify + reconciliación
-- nocturna). La leerá (fase 2): la tool `navegar_catalogo` y el peldaño léxico de buscar_producto.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

create table if not exists public.catalogo (
  id                    bigint primary key,            -- product_id de Shopify
  handle                text unique not null,
  sku                   text,                          -- regla vigente del proyecto: MPN = SKU
  titulo                text not null,
  marca                 text,                          -- vendor
  tipo                  text,                          -- product_type
  tags                  text[] not null default '{}',  -- la compatibilidad impresora→consumible (v34) vive aquí
  status                text not null,                 -- active | draft | archived | archivado_local
  precio_usd            numeric(10,2),                 -- SOLO filtrar/ordenar (línea roja de arriba)
  precio_comparado_usd  numeric(10,2),                 -- "precio de antes" → detección de oferta (v64)
  descripcion           text,                          -- body sin HTML, recortado — alimenta el FTS
  variantes             jsonb,                         -- [{variant_id, sku, precio}] (futuro carrito)
  imagen_url            text,
  shopify_updated_at    timestamptz,                   -- updated_at del producto en Shopify
  sincronizado_at       timestamptz not null default now(),
  -- Fase 3 (specs a columnas): aquí se fusionará impresoras_specs. Se declara desde ya para que el
  -- contrato no cambie de forma cuando llegue la data.
  specs                 jsonb,
  -- Motor léxico. Se mantiene por TRIGGER y no por columna generada: `unaccent()` no es IMMUTABLE
  -- (depende de su diccionario) y una columna generada la rechaza; el trigger hace lo mismo sin
  -- pelear con eso, y deja la expresión en UN solo lugar.
  busq                  tsvector
);

create or replace function public.catalogo_actualizar_busq() returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.busq := to_tsvector('spanish', unaccent(
    coalesce(new.titulo, '') || ' ' ||
    array_to_string(coalesce(new.tags, '{}'), ' ') || ' ' ||
    coalesce(new.marca, '') || ' ' || coalesce(new.tipo, '') || ' ' ||
    coalesce(new.descripcion, '')
  ));
  return new;
end;
$function$;

drop trigger if exists catalogo_busq on public.catalogo;
create trigger catalogo_busq
  before insert or update of titulo, tags, marca, tipo, descripcion
  on public.catalogo
  for each row execute function public.catalogo_actualizar_busq();

create index if not exists catalogo_busq_idx   on public.catalogo using gin (busq);
create index if not exists catalogo_tags_idx   on public.catalogo using gin (tags);
create index if not exists catalogo_titulo_trgm on public.catalogo using gin (titulo gin_trgm_ops);
create index if not exists catalogo_tipo_idx   on public.catalogo (tipo);
create index if not exists catalogo_marca_idx  on public.catalogo (marca);
create index if not exists catalogo_status_idx on public.catalogo (status);

-- Sinónimos del negocio para el motor léxico ("morada"→magenta, "tabloide"→11x17). En Supabase
-- managed NO se pueden cargar diccionarios de sinónimos del FTS (requieren archivos en disco), así
-- que la expansión la hace la Edge Function al armar el tsquery, leyendo esta tabla. La alimenta el
-- equipo — y, en el diseño, cada búsqueda que el shadow registre como "los dos motores fallaron".
create table if not exists public.busqueda_sinonimos (
  termino   text primary key,   -- lo que escribe el cliente, normalizado sin acentos, minúsculas
  canonico  text not null,      -- lo que dice el catálogo
  nota      text                -- de dónde salió (caso real, fecha) — para poder podar con criterio
);

insert into public.busqueda_sinonimos (termino, canonico, nota) values
  ('morada',    'magenta',  'clase v60: "tinta morada para epson"'),
  ('lila',      'magenta',  'variante de morada'),
  ('purpura',   'magenta',  'variante de morada'),
  ('tabloide',  '11x17',    'formato: los clientes dicen tabloide, el catálogo dice 11x17'),
  ('doble carta','11x17',   'formato: nombre común del 11x17'),
  ('pulgadas',  '"',        'clase v53: el catálogo escribe 30", nunca "30 pulgadas"')
on conflict (termino) do nothing;

-- El modelo de seguridad de la casa: RLS on SIN policies (solo service_role) + GRANT manual
-- (auto-expose OFF: sin el grant, la función da "permission denied").
alter table public.catalogo enable row level security;
alter table public.busqueda_sinonimos enable row level security;
grant select, insert, update, delete on public.catalogo to service_role;
grant select, insert, update, delete on public.busqueda_sinonimos to service_role;

-- Verificación tras aplicar:
--   select count(*) from catalogo;                          -- 0 hasta la primera reconciliación
--   select termino, canonico from busqueda_sinonimos;       -- 6 filas semilla
--   (tras la primera reconciliación) select status, count(*) from catalogo group by 1;
