-- P3-b: ventana de CAPTURA DE DATOS DE ENTREGA activada por el asesor (copilot-webhook ?captura=1).
-- NULL = sin captura activa. Mientras captura_hasta > now() y la conversación está en handoff, el bot
-- conversa SOLO para capturar dirección/referencia/pin (modo captura, tools acotadas + CAPTURA_SUFFIX);
-- guardar_datos_envio la limpia al completar los datos, o expira sola a los 30 min.
alter table public.conversations add column if not exists captura_hasta timestamptz;
