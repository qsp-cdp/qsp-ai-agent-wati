-- Barrido de asistencia (v71) — encuentra clientes en HANDOFF que llevan rato esperando respuesta.
--
-- POR QUÉ: la asistencia durante un handoff (v50) es REACTIVA — solo se evalúa cuando llega un mensaje
-- NUEVO del cliente. Medido con tráfico real el 17-ago: 4 de 5 clientes sin responder habían escrito
-- 0-10 min DESPUÉS del asesor, o sea por debajo de los 15 min que exige la asistencia. El bot calló bien
-- en ese instante, pero como ninguno volvió a escribir, la ventana se abrió sola y no había NADA que la
-- disparara → quedaron colgados 2-4 HORAS. Y como el asesor suele marcar el chat "resuelto" en WATI para
-- despejar su pantalla, esos chats ya no están a la vista de nadie.
--
-- Este RPC hace SOLO el filtro de TIEMPO y ESTADO. Los guardrails SEMÁNTICOS (anti-interrupción por
-- pago/RUC, reclamos, acks) los aplica el copiloto en TS con los MISMOS regex del flujo reactivo — así no
-- hay dos versiones de la regla que se desincronicen.
--
-- `security definer` + grant solo a service_role (auto-expose OFF en este proyecto).

-- v73: la firma cambia (nuevo p_sin_asesor_min) → se elimina la anterior para no dejar dos versiones
-- ambiguas conviviendo.
drop function if exists public.asistencia_pendientes(int, int, int, int);

create or replace function public.asistencia_pendientes(
  p_espera_min int default 25,     -- cuánto lleva esperando el cliente sin respuesta
  p_asesor_min int default 15,     -- silencio del asesor (mismo umbral que HANDOFF_ASSIST_MIN)
  p_frio_horas int default 24,     -- más allá de esto la conversación es FRÍA: la retoma el cold-return
  p_max int default 10,            -- anti-blast: cuántos atender por corrida
  p_sin_asesor_min int default 30  -- v73: handoff por KEYWORD sin que ningún asesor llegara nunca
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ultimo_cliente_at), '[]'::jsonb) into v
  from (
    select c.id            as conversation_id,
           c.wa_id,
           c.sender_name,
           c.turns_today,
           m.content       as texto,
           m.created_at    as ultimo_cliente_at,
           h.ultimo_asesor_at,
           round(extract(epoch from (now() - m.created_at)) / 60)::int  as mins_espera,
           round(extract(epoch from (now() - h.ultimo_asesor_at)) / 60)::int as mins_sin_asesor
    from conversations c
    -- ÚLTIMO mensaje de la conversación: si es del cliente, no contestó NADIE (ni bot ni asesor).
    join lateral (
      select content, created_at, role from messages
      where conversation_id = c.id order by created_at desc limit 1
    ) m on true
    -- Último mensaje del ASESOR: el barrido solo aplica donde de verdad hubo un humano (igual que v50;
    -- un handoff por keyword, sin asesor, no se asiste solo).
    join lateral (
      select max(created_at) as ultimo_asesor_at from messages
      where conversation_id = c.id and model = 'human-agent'
    ) h on true
    where c.status = 'handoff'                                    -- 'cerrada' (proveedores) queda fuera por definición
      and m.role = 'user'
      and m.created_at <= now() - make_interval(mins => p_espera_min)
      -- v73 — DOS poblaciones, no una:
      --  (a) un asesor SÍ escribió y lleva rato callado (el caso original), o
      --  (b) NINGÚN asesor escribió nunca: la conversación entró en handoff porque el cliente PIDIÓ un
      --      asesor… y nadie llegó. Antes esta población era un punto ciego total — el bot no habla
      --      (regla v30) y el barrido ni la miraba (exigía un asesor de quien medir silencio). Caso real
      --      18-ago: pidió asesor a las 14:44, a las 14:51 escribió qué impresora quería cotizar, silencio.
      and (
        (h.ultimo_asesor_at is not null
         and h.ultimo_asesor_at <= now() - make_interval(mins => p_asesor_min)
         and h.ultimo_asesor_at >  now() - make_interval(hours => p_frio_horas))
        or
        (h.ultimo_asesor_at is null
         and m.created_at <= now() - make_interval(mins => p_sin_asesor_min)
         and m.created_at >  now() - make_interval(hours => p_frio_horas))
      )
      and c.turns_today <= 40                                     -- mismo tope diario que el flujo normal
    order by m.created_at
    limit p_max
  ) t;
  return v;
end;
$function$;

grant execute on function public.asistencia_pendientes(int, int, int, int, int) to service_role;

-- Verificación:  select jsonb_pretty(public.asistencia_pendientes(25, 15, 24, 10, 30));
