-- La auditoría de direcciones nunca guardó UNA SOLA fila, y nadie se enteró.
--
-- Descubierto el 22-ago con la primera orden creada A MANO en Shipday (pedido 12): el job_log dijo
-- `direccion_shipday_sincronizada ok=true` y la libreta sí se actualizó… pero `direcciones_hist`
-- seguía en cero. Causa: la MISMA trampa de permisos que ya nos mordió con impresoras_specs y
-- servientrega_agencias — en este proyecto una tabla creada por migración NO hereda INSERT/SELECT para
-- `service_role` (solo TRUNCATE/REFERENCES/TRIGGER). El POST de auditoría respondía 401 dentro de un
-- `catch {}` mudo, así que el fallo fue invisible durante todo el tiempo que la función lleva viva.
--
-- La tabla es SERIAL (no identity), así que además del INSERT hace falta la secuencia: sin USAGE sobre
-- ella el insert falla igual aunque el grant de la tabla esté puesto.
--
-- (El DDL de la tabla vive en la migración 20260821202752_direcciones_hist_auditoria, aplicada a
-- producción pero cuyo archivo no está en esta rama — pendiente conocido de sincronización del repo.)
grant insert, select on public.direcciones_hist to service_role;
grant usage, select on sequence public.direcciones_hist_id_seq to service_role;
