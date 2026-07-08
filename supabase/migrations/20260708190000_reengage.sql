-- v51 — recuperación de fin de semana (cron de re-enganche).
-- Los clientes que escriben viernes/sábado noche expiran la ventana de 24h de WhatsApp; el lunes hay que
-- reabrir el chat con una PLANTILLA HSM. Esta migración da el estado y la consulta que necesita el cron
-- (Edge Function `reengage-expired`, disparada por pg_cron los lunes 9am Panamá). El envío real es
-- shadow-first: por default el cron corre en DRY-RUN (loguea a quién re-engancharía, no envía).
--
-- 1) Idempotencia + opt-out en conversations.
--    reengaged_at   = cuándo se le mandó la última plantilla de re-enganche (para no re-enviar hasta que el
--                     cliente vuelva a escribir).
--    reengage_optout= si el cliente NO quiere estos mensajes (se setea a mano por ahora; el cron lo respeta).
--    (No hace falta GRANT nuevo: el grant a service_role sobre conversations es a nivel de tabla.)
alter table public.conversations add column if not exists reengaged_at    timestamptz;
alter table public.conversations add column if not exists reengage_optout boolean not null default false;

-- 2) RPC que devuelve los candidatos a re-enganche. La lógica "colgado" (último mensaje del hilo es del
--    cliente, sin responder) + "ventana 24h vencida" + "dentro del lookback del finde" + idempotencia + opt-out
--    vive en SQL (una sola fuente). security definer, solo service_role.
--    - p_lookback_hours: qué tan atrás mirar (default 96h ≈ vie 9am → lun 9am cubre el fin de semana).
--    - p_window_hours:   la ventana de sesión de WhatsApp (default 24h; solo re-enganchamos si ya venció).
--    - p_max:            tope de filas (anti-blast).
create or replace function public.reengage_candidates(
  p_lookback_hours int default 96,
  p_window_hours   int default 24,
  p_max            int default 100
) returns table (wa_id text, sender_name text, last_inbound_at timestamptz)
language sql
security definer
set search_path = public
as $$
  with last_in as ( -- último mensaje ENTRANTE del cliente (role='user') por conversación
    select conversation_id, max(created_at) as last_inbound_at
    from public.messages
    where role = 'user'
    group by conversation_id
  ),
  last_any as (     -- último mensaje CUALQUIERA por conversación (para saber si quedó "colgado")
    select distinct on (conversation_id) conversation_id, role, model, created_at
    from public.messages
    order by conversation_id, created_at desc, id desc
  )
  select c.wa_id, c.sender_name, li.last_inbound_at
  from public.conversations c
  join last_in  li on li.conversation_id = c.id
  join last_any la on la.conversation_id = c.id
  where c.status <> 'cerrada'
    and coalesce(c.reengage_optout, false) = false
    and li.last_inbound_at <  now() - make_interval(hours => p_window_hours)   -- ventana 24h YA vencida
    and li.last_inbound_at >= now() - make_interval(hours => p_lookback_hours) -- pero dentro del lookback
    and la.role = 'user'                                                       -- el ÚLTIMO mensaje es del cliente (sin responder)
    and (c.reengaged_at is null or c.reengaged_at < li.last_inbound_at)         -- no re-enganchado desde su última entrada
  order by li.last_inbound_at asc
  limit greatest(0, p_max);
$$;

grant execute on function public.reengage_candidates(int, int, int) to service_role;
