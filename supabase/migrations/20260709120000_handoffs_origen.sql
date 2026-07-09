-- v52 (revisión adversarial) — la tabla `handoffs` ahora mezcla DOS significados distintos: el handoff
-- por KEYWORD (humano/asesor/reclamo…, status pasa a 'handoff', el asesor debe intervenir YA) y el
-- TICKET DE PROMESA nuevo (el bot dejó algo sin resolver y prometió seguimiento; NO cambia status, es
-- solo una cola consultable). Antes, la única forma de distinguirlos era parsear el prefijo de texto
-- libre en `motivo` ("keyword: …" vs "seguimiento_bot: …"). Esta columna lo hace explícito y filtrable.
-- Idempotente. Sin GRANT nuevo (el grant a service_role sobre handoffs ya es a nivel de tabla).
alter table public.handoffs add column if not exists origen text;

-- Cola operativa del equipo — pendientes de la mañana, ordenados del más viejo al más nuevo:
--   select h.created_at, c.wa_id, c.sender_name, h.origen, h.motivo
--   from public.handoffs h join public.conversations c on c.id = h.conversation_id
--   where h.resuelto = false order by h.created_at asc;
-- Filtrar solo tickets de promesa del bot (no los handoff por keyword, que ya gestiona el asesor en vivo):
--   … where h.resuelto = false and h.origen in ('bot_promise','bot_fallback') order by h.created_at asc;
