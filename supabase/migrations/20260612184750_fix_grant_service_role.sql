grant execute on function public.upsert_conversation(text, text) to service_role;
-- limpieza del registro de prueba SQL
delete from conversations where wa_id = '50760000099';
