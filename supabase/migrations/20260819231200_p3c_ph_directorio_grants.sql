-- P3-c fix: la tabla se creó sin ACL heredada para service_role (los default privileges del
-- proyecto quedaron restrictivos tras el endurecimiento P0-1). El cargador escribe vía PostgREST
-- con service_role → necesita privilegios explícitos. Solo service_role: anon/authenticated NO.
grant select, insert, update, delete on public.ph_directorio to service_role;
grant usage, select on sequence public.ph_directorio_id_seq to service_role;
