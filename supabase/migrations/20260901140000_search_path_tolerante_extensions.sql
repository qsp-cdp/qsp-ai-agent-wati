-- PREPARACIÓN (01-sep-2026) — se hacen TOLERANTES nuestras funciones al schema donde viva cada
-- extensión, ANTES de que soporte de Supabase mueva PostGIS. **YA APLICADA en prod** (por MCP, en dos
-- migraciones: `postgis_search_path_tolerante` + `unaccent_search_path_tolerante`); este archivo es la
-- fidelidad del repo — NO re-aplicar hace falta, pero es idempotente si se corre igual.
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────────────────────
-- La alerta CRITICAL de Supabase (`spatial_ref_sys` escribible por `anon`) NO se puede cerrar desde el
-- SQL Editor: la tabla es de `supabase_admin` y `postgres` no es miembro suyo, así que el `revoke`
-- corre sin error y no hace nada (ver docs/seguridad-2026-09-01.md). Soporte ofreció la remediación de
-- raíz: mover la extensión PostGIS de `public` al schema `extensions`.
--
-- EL RIESGO: un `search_path` FIJO no hereda nada del entorno. Siete funciones nuestras resuelven una
-- extensión POR NOMBRE y todas tenían `search_path=public`:
--
--   zona_por_coordenadas       PostGIS   ← resuelve la ZONA (y la TARIFA) desde el pin de GPS del cliente
--   ubicacion_por_coordenadas  PostGIS
--   resolver_ubicacion         PostGIS
--   cargar_limites_admin       PostGIS   (carga de polígonos)
--   cargar_limites_cod         PostGIS   (carga de polígonos)
--   buscar_catalogo            unaccent  ← el motor de búsqueda de la réplica
--   catalogo_actualizar_busq   unaccent  ← el TRIGGER del tsvector: si falla, falla el UPDATE entero
--                                          y el webhook de Shopify deja de sincronizar EN SILENCIO
--
-- Si la extensión se muda, dejan de resolver `ST_Contains` / `ST_Point` / `unaccent` y revientan en
-- caliente. `unaccent` y `pg_trgm` también viven hoy en `public` y SÍ son reubicables (trivial de
-- mover), así que la exposición no era solo PostGIS.
--
-- ── EL REMEDIO, SIN VENTANA DE MANTENIMIENTO ───────────────────────────────────────────────────────
-- `public, extensions` resuelve bien en AMBOS estados: hoy la extensión está en `public` y se
-- encuentra primero; después estará en `extensions` y se encontrará segundo. Soporte puede ejecutar su
-- plan cuando quiera y nada se cae en el medio. `public` conserva la PRECEDENCIA, así que ninguna
-- resolución de hoy cambia: es un no-op de comportamiento.
--
-- Ninguna de las siete declara tipos de extensión en su FIRMA (reciben double precision / jsonb /
-- smallint / text), así que este ALTER no toca dependencias de tipo: solo el search_path de ejecución.
--
-- ── LO QUE NO NECESITA NADA (verificado) ───────────────────────────────────────────────────────────
--   · `limites_admin_geom_gix` (GIST) y `catalogo_titulo_trgm` (gin_trgm_ops): los índices guardan la
--     operator class por OID y viajan con la extensión.
--   · Columnas generadas (`contacts.phone_digits`, `servientrega_agencias.maps_url`): no usan
--     extensiones.
--   · No hay vistas, defaults ni constraints nuestras que llamen a PostGIS/unaccent por nombre.

alter function public.zona_por_coordenadas(double precision, double precision)
  set search_path = public, extensions;

alter function public.ubicacion_por_coordenadas(double precision, double precision)
  set search_path = public, extensions;

alter function public.resolver_ubicacion(double precision, double precision)
  set search_path = public, extensions;

alter function public.cargar_limites_admin(smallint, jsonb)
  set search_path = public, extensions;

alter function public.cargar_limites_cod(jsonb)
  set search_path = public, extensions;

alter function public.buscar_catalogo(text, int)
  set search_path = public, extensions;

alter function public.catalogo_actualizar_busq()
  set search_path = public, extensions;

-- Verificación (las 7 deben decir {"search_path=public, extensions"}):
--   select proname, proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('zona_por_coordenadas','ubicacion_por_coordenadas','resolver_ubicacion',
--                      'cargar_limites_admin','cargar_limites_cod','buscar_catalogo',
--                      'catalogo_actualizar_busq');
--
-- Y que siguen respondiendo (probado el 01-sep con PostGIS todavía en `public`):
--   select zona_por_coordenadas(9.01262, -79.529077872284);   -- → Z1 Centro, $6, propia, Alta
--   select titulo, via from buscar_catalogo('caja de mantenimiento Epson L5590', 3);  -- → C9344
