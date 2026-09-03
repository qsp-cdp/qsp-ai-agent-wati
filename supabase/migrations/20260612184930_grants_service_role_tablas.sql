-- Auto-expose está DESACTIVADO (decisión de seguridad): los GRANTs son manuales.
-- Solo service_role (edge functions) — anon/authenticated quedan sin acceso.
grant usage on schema public to service_role;
grant select, insert, update on public.conversations, public.messages, public.handoffs, public.job_log to service_role;
grant usage, select on all sequences in schema public to service_role;
-- futuras tablas de este proyecto: recordar GRANT manual (por diseño).
