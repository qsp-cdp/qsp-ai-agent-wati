-- P0-1 · Cierra la fuga de PII por PostgREST.
--
-- Contexto: siete RPC son SECURITY DEFINER (se saltan RLS) y su privilegio
-- EXECUTE proviene de PUBLIC, por lo que los roles anon y authenticated
-- (miembros de PUBLIC) podian invocarlas por /rest/v1/rpc con la clave publica
-- del proyecto, sin token del pipeline ni login. Las dos mas sensibles:
--   * estado_pedido(telefono)     -> historial de pedidos (monto, tracking) enumerable por numero
--   * asistencia_pendientes(...)  -> nombre + telefono + texto de mensajes de clientes
--
-- Revocar solo de anon/authenticated NO cierra el hueco: el acceso viene de
-- PUBLIC. Se revoca de PUBLIC (y de anon/authenticated por si hubiera grant
-- explicito futuro) y se garantiza el acceso de service_role, unico rol que las
-- usa legitimamente (copiloto, crons, y la Edge Function cotizador, todos con
-- SUPABASE_SERVICE_ROLE_KEY). Las tres resolver_tarifa* heredaban su acceso de
-- service_role a traves de PUBLIC, de ahi el GRANT explicito.
--
-- Reversible con GRANT EXECUTE ... TO PUBLIC si fuera necesario.

REVOKE EXECUTE ON FUNCTION public.estado_pedido(p_wa_id text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.asistencia_pendientes(p_espera_min integer, p_asesor_min integer, p_frio_horas integer, p_max integer, p_sin_asesor_min integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reengage_candidates(p_lookback_hours integer, p_window_hours integer, p_max integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolver_tarifa(p_lugar text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolver_tarifa_v2(p_lugar text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolver_tarifa_core(p_lugar text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resumen_diario(p_min_espera integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.estado_pedido(p_wa_id text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asistencia_pendientes(p_espera_min integer, p_asesor_min integer, p_frio_horas integer, p_max integer, p_sin_asesor_min integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reengage_candidates(p_lookback_hours integer, p_window_hours integer, p_max integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa(p_lugar text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_v2(p_lugar text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_tarifa_core(p_lugar text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resumen_diario(p_min_espera integer) TO service_role;
