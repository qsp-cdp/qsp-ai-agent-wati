-- FIDELIDAD DEL REPO (27-ago) — `asistencia_pendientes` ya vive en producción; esta migración la
-- versiona. No cambia nada al aplicarse: es byte-fiel a lo que devuelve pg_get_functiondef en prod.
--
-- POR QUÉ HACÍA FALTA: la auditoría del 27-ago encontró que el RPC que alimenta el BARRIDO DE
-- ASISTENCIA —el que rescata a un cliente colgado en handoff— no estaba en ninguna migración de esta
-- rama. Existía solo dentro de la base. Si alguien reconstruía el esquema desde `supabase/migrations`,
-- el barrido quedaba sin su consulta y fallaba en silencio (el cron corre igual, encuentra 0
-- candidatos y nadie se entera de que dejó de rescatar gente).
--
-- QUÉ RESUELVE LA FUNCIÓN (dos hallazgos con caso real detrás):
--   v73  — DOS poblaciones, no una. Además del handoff con asesor callado, cubre el handoff por
--          KEYWORD donde NINGÚN asesor llegó nunca: el cliente pidió un asesor, el bot calló por
--          diseño, y nadie leyó la cola. Caso del 18-ago: pidió asesor a las 14:44, a las 14:51
--          escribió qué impresora quería cotizar, y se quedó mirando la pantalla.
--   v73.1 — los acks se descartan ANTES del `limit`. Con el filtro en TS (después del corte a 10) los
--          "Ok"/"Gracias" de la mañana ocupaban los diez cupos en CADA corrida hasta envejecer 24 h, y
--          un cliente real de 40 minutos quedaba en la posición 11: invisible siempre. Medido en vivo:
--          10 candidatos devueltos, los 10 acks, cinco corridas seguidas sin atender a nadie.
--
-- El vocabulario de cortesía lo pone `es_ack` (migración 20260825170000), compartido con
-- `resumen_diario`: si los dos se desincronizan, el correo LISTA a quien el barrido IGNORA. Desde hoy
-- ese espejo TS↔SQL lo verifica un golden test (tests/golden.mjs), no la mano — corrige el comentario
-- que quedó dentro de es_ack diciendo que la suite no existía.

create or replace function public.asistencia_pendientes(
  p_espera_min integer default 25,     -- cuánto lleva esperando el cliente sin respuesta
  p_asesor_min integer default 15,     -- silencio del asesor (mismo umbral que HANDOFF_ASSIST_MIN)
  p_frio_horas integer default 24,     -- más allá de esto la conversación es FRÍA: la retoma el cold-return
  p_max integer default 10,            -- anti-blast: cuántos atender por corrida
  p_sin_asesor_min integer default 30  -- v73: handoff por KEYWORD sin que ningún asesor llegara nunca
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
    -- Último mensaje del ASESOR (puede no existir: ver la segunda población de v73).
    join lateral (
      select max(created_at) as ultimo_asesor_at from messages
      where conversation_id = c.id and model = 'human-agent'
    ) h on true
    where c.status = 'handoff'
      and m.role = 'user'
      and m.created_at <= now() - make_interval(mins => p_espera_min)
      -- v73.1: los acks se descartan AQUÍ, no en TS, para que el `limit` de abajo no se gaste en ellos.
      and not es_ack(m.content)
      and (
        (h.ultimo_asesor_at is not null
         and h.ultimo_asesor_at <= now() - make_interval(mins => p_asesor_min)
         and h.ultimo_asesor_at >  now() - make_interval(hours => p_frio_horas))
        or
        (h.ultimo_asesor_at is null
         and m.created_at <= now() - make_interval(mins => p_sin_asesor_min)
         and m.created_at >  now() - make_interval(hours => p_frio_horas))
      )
      and c.turns_today <= 40
    order by m.created_at
    limit p_max
  ) t;
  return v;
end;
$function$;

-- El P0-1 (20260819190947) revoca EXECUTE de PUBLIC en las RPC con PII; se re-aplica aquí porque
-- `create or replace` sobre una función nueva vuelve a otorgar el default a PUBLIC.
revoke all on function public.asistencia_pendientes(int, int, int, int, int) from public;
grant execute on function public.asistencia_pendientes(int, int, int, int, int) to service_role;

-- Verificación:  select jsonb_pretty(public.asistencia_pendientes(25, 15, 24, 10, 30));
--   Lo que debe verse: pocos candidatos y con preguntas REALES. Si vuelven diez "gracias", el filtro
--   de acks no está corriendo.
