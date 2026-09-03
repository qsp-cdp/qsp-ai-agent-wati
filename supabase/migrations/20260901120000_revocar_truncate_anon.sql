-- SEGURIDAD (01-sep-2026) — se revoca TRUNCATE/REFERENCES/TRIGGER a `anon` y `authenticated`
-- en todas las tablas del negocio, y se activa RLS en `_stri_staging`.
--
-- DISPARADOR: alerta CRITICAL de Supabase ("Table publicly accessible", rls_disabled_in_public).
-- Al investigarla apareció algo PEOR que lo que la alerta señalaba, y que la auditoría del 27-ago ya
-- había anotado como P2-a sin resolver.
--
-- EL HALLAZGO: 17 tablas del negocio (messages, conversations, pedidos, contacts, catalogo,
-- store_facts, zonas_entrega…) tenían TRUNCATE otorgado a `anon` y `authenticated`.
-- **RLS NO PROTEGE CONTRA TRUNCATE**: las políticas filtran filas en SELECT/INSERT/UPDATE/DELETE,
-- pero un TRUNCATE vacía la tabla ENTERA sin pasar por ellas. O sea que el modelo de seguridad de la
-- casa —"RLS on sin policies = solo service_role"— tenía un agujero por el que se podía borrar todo
-- el historial de conversaciones y el catálogo, sin tocar una sola política.
--
-- Se revocan los tres verbos que RLS no puede contener:
--   TRUNCATE  · vacía la tabla saltándose las políticas
--   REFERENCES· permite crear FKs contra nuestras tablas desde afuera
--   TRIGGER   · permite colgar disparadores sobre ellas
-- NO se toca `service_role`: es el ÚNICO rol que usan las Edge Functions (anon/authenticated no se
-- usan en ningún camino del copiloto ni del puente).
--
-- LO QUE ESTA MIGRACIÓN NO PUEDE ARREGLAR — `public.spatial_ref_sys` (la tabla que la alerta nombra):
-- es una tabla de sistema de PostGIS, propiedad de `supabase_admin`, con la extensión instalada en el
-- schema `public`. Su ACL es `anon=arwdDxtm/supabase_admin`: el permiso lo otorgó supabase_admin, y en
-- Postgres solo puede revocar quien otorgó (o el dueño/superusuario). El rol `postgres` NO es miembro
-- de supabase_admin, así que un `revoke` desde aquí corre SIN ERROR y no hace NADA (verificado).
-- Remediación real: moverla al schema `extensions` o pedírselo a soporte de Supabase — ver
-- `docs/seguridad-2026-09-01.md`. Riesgo acotado: no tiene datos del negocio (8.500 filas de sistemas
-- de coordenadas), pero corromperla degradaría `zona_por_coordenadas` (las tarifas por pin GPS).

do $$
declare t record;
begin
  for t in
    select c.oid::regclass as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and pg_get_userbyid(c.relowner) = 'postgres'   -- solo las NUESTRAS (excluye PostGIS y demás)
  loop
    execute format('revoke truncate, references, trigger on table %s from anon, authenticated', t.tabla);
  end loop;
end $$;

-- `_stri_staging` (35 filas de corregimientos, insumo de los polígonos de zonas) era la única tabla
-- nuestra sin RLS. No era alcanzable por la API (anon no tenía ningún privilegio sobre ella), pero el
-- advisor la marcaba y activarla es gratis.
alter table if exists public._stri_staging enable row level security;

-- Verificación (debe dar 0, 0):
--   select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r' and pg_get_userbyid(c.relowner)='postgres'
--      and (has_table_privilege('anon',c.oid,'TRUNCATE') or has_table_privilege('authenticated',c.oid,'TRUNCATE'));
--   select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r' and pg_get_userbyid(c.relowner)='postgres'
--      and not c.relrowsecurity;
