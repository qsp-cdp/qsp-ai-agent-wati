-- Fix (revisión adversarial): la migración 20260701000000_contacts.sql crea `contacts` con RLS on pero SIN
-- grant a service_role. En ESTE proyecto el auto-expose está DESACTIVADO (ver 20260612184930_grants_service_role_tablas.sql:
-- "recordar GRANT manual"), así que service_role —aunque hace BYPASSRLS— igual necesita el GRANT de tabla o
-- PostgREST responde 401 "permission denied for table contacts". Las funciones del puente (contacts-lookup,
-- wati-address, wati-order) leen/escriben `contacts` vía PostgREST con la service role key → sin este grant, un
-- REBUILD del esquema desde las migraciones dejaría `contacts` ilegible (aunque prod probablemente ya tiene el
-- grant aplicado a mano cuando el puente se desplegó el 01-jul).
-- Idempotente (grant repetido = no-op). Verificar en prod:
--   select has_table_privilege('service_role','public.contacts','SELECT');   -- debe dar true
grant select, insert, update on public.contacts to service_role;
