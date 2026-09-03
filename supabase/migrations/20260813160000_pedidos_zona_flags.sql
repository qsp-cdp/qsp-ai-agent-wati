-- Fidelidad repo↔prod (13-ago-2026): columnas de `pedidos` que el parche F4/v31/v32 de shopify-webhook
-- (aplicado A MANO en prod por el workstream de despacho — detectado por job_log action='pedido_flag')
-- ya escribe vía upsertPedido(). YA EXISTEN en prod (verificado con information_schema.columns el 13-ago);
-- esta migración NO hace falta re-aplicarla ahí — existe para que un ambiente fresco (supabase db reset /
-- Postgres local) reproduzca el esquema real. Idempotente (add column if not exists).
--
-- Semántica (contrato en docs/handoff-pedidos-conciencia.md):
--   zona            → legible para humanos: "Z1" / "Z4a" (metro) o "INT Chiriquí · David" (interior)
--   zona_estado     → estado del resolver: ok / ambiguo / sin_match / sin_servicio
--   zona_ambito     → metro / interior (solo cuando el resolver dio 'ok')
--   tarifa_zona_usd → tarifa de la zona SOLO metro con 'ok' (la del interior la define Servientrega)
--   envio_flag      → venta imposible o mal ruteada: direccion_no_reconocida / sin_servicio_comarca /
--                     eligio_ciudad_siendo_interior / eligio_interior_siendo_ciudad / domicilio_imposible_z4a
--
-- Sin GRANT nuevo: el grant a service_role es a nivel de tabla (20260707120000_pedidos.sql).

alter table public.pedidos add column if not exists zona text;
alter table public.pedidos add column if not exists zona_estado text;
alter table public.pedidos add column if not exists zona_ambito text;
alter table public.pedidos add column if not exists tarifa_zona_usd numeric;
alter table public.pedidos add column if not exists envio_flag text;

-- Verificación: select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='pedidos' order by ordinal_position;
