-- P3-c fix: la tabla ph_directorio se creó sin ACL heredada para service_role (los default
-- privileges del proyecto quedaron restrictivos tras el endurecimiento P0-1). El cargador
-- ph-loader escribe vía PostgREST con service_role → necesita privilegios explícitos.
-- Solo service_role: anon/authenticated quedan fuera (RLS sin políticas + sin GRANT).
grant select, insert, update, delete on public.ph_directorio to service_role;
grant usage, select on sequence public.ph_directorio_id_seq to service_role;
