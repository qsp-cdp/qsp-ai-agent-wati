-- FIDELIDAD DEL REPO (27-ago) — `resumen_diario` ya vive en producción; esta migración la versiona.
-- Byte-fiel a pg_get_functiondef en prod: aplicarla no cambia nada.
--
-- POR QUÉ HACÍA FALTA: es el RPC que alimenta los TRES correos de resumen del día (11:00, 2:30pm y
-- 4:00pm) y no estaba en ninguna migración de esta rama — solo aparecía en el revoke del P0-1. Un
-- esquema reconstruido desde `supabase/migrations` se quedaba sin él: los correos dejarían de salir, y
-- como su AUSENCIA es justamente la alarma (prueba de vida del vigilante), la falla sería silenciosa.
--
-- Comparte con el barrido la definición de cortesía (`es_ack`, migración 20260825170000): el resumen
-- LISTA a quien espera y el barrido ATIENDE a ese mismo conjunto. Si se desincronizan, el correo
-- reporta gente que el barrido ignora. Desde el 27-ago un golden test compara ambos vocabularios
-- palabra por palabra (tests/golden.mjs).

create or replace function public.resumen_diario(p_min_espera integer default 45)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_desde timestamptz;
  v_msgs jsonb; v_inc jsonb; v_sin jsonb; v_conv jsonb; v_silencio int;
begin
  v_desde := date_trunc('day', (now() at time zone 'America/Panama')) at time zone 'America/Panama';

  select jsonb_build_object(
    'de_clientes',  count(*) filter (where role = 'user'),
    'del_bot',      count(*) filter (where role = 'assistant' and coalesce(model,'') <> 'human-agent'),
    'de_asesores',  count(*) filter (where model = 'human-agent')
  ) into v_msgs
  from messages where created_at >= v_desde;

  select jsonb_build_object(
    'respuesta_respaldo', count(*) filter (where action = 'respuesta_respaldo'),
    'envio_fallido',      count(*) filter (where action = 'envio_fallido'),
    'audio_stt_fallo',    count(*) filter (where action = 'audio_stt_fallo'),
    'busqueda_mcp_fallo', count(*) filter (where action = 'busqueda_mcp_fallo'),
    'audios_transcritos', count(*) filter (where action = 'audio_transcrito'),
    'errores',            count(*) filter (where action = 'error')
  ) into v_inc
  from job_log where created_at >= v_desde;

  -- Silencio MÁXIMO entre mensajes consecutivos, SOLO en horario hábil (9-17 Panamá). Sin ese filtro
  -- la métrica mide el hueco de la NOCHE (daba 299 min) y no sirve para calibrar el umbral del watchdog.
  select coalesce(max(gap_min), 0)::int into v_silencio
  from (
    select extract(epoch from (created_at - lag(created_at) over (order by created_at))) / 60 as gap_min
    from messages
    where created_at >= v_desde
      and extract(hour from (created_at at time zone 'America/Panama')) between 9 and 16
  ) g;

  -- CLIENTES del día: por CONVERSACIÓN (cliente único), no por mensaje. NO se distingue quién atendió.
  select jsonb_build_object(
    'escribieron',  count(*),
    'atendidos',    count(*) filter (where hubo_bot or hubo_asesor),
    'sin_atencion', count(*) filter (where not hubo_bot and not hubo_asesor)
  ) into v_conv
  from (
    -- coalesce OBLIGATORIO: model NULL da NULL, y bool_or de puros NULL devuelve NULL (no false)
    -- → la conversación sin atender se perdía del conteo.
    select c.id,
           bool_or(coalesce(m.model,'') = 'human-agent') as hubo_asesor,
           bool_or(m.role = 'assistant' and coalesce(m.model,'') <> 'human-agent') as hubo_bot
    from conversations c
    join messages m on m.conversation_id = c.id and m.created_at >= v_desde
    where exists (select 1 from messages u
                  where u.conversation_id = c.id and u.role = 'user' and u.created_at >= v_desde)
    group by c.id
  ) t;

  -- SIN RESPONDER: último mensaje del CLIENTE y ya pasaron p_min_espera minutos.
  -- v73.1: el vocabulario de acks vive en `es_ack`, compartido con el barrido.
  -- 25-ago: además se descartan los CIERRES de conversación ("voy en camino", "paso en un rato",
  -- "déjeme hablar con ella"). Eran 5 de 6 alertas, con horas de espera falsa. Ver es_cierre_conversacion.
  select coalesce(jsonb_agg(jsonb_build_object(
           'wa_id', wa_id, 'nombre', sender_name,
           'hora', to_char(ultimo at time zone 'America/Panama', 'HH24:MI'),
           'espera_min', round(extract(epoch from (now() - ultimo)) / 60)::int,
           'texto', left(contenido, 90)
         ) order by ultimo), '[]'::jsonb) into v_sin
  from (
    select c.wa_id, c.sender_name, m.created_at as ultimo, m.content as contenido
    from conversations c
    join lateral (
      select content, created_at, role from messages
      where conversation_id = c.id order by created_at desc limit 1
    ) m on true
    where m.role = 'user'
      and m.created_at >= v_desde
      and m.created_at <= now() - make_interval(mins => p_min_espera)
      and not es_ack(m.content)
      and not es_cierre_conversacion(m.content)
  ) s;

  return jsonb_build_object(
    'desde', v_desde,
    'clientes', v_conv,
    'mensajes', v_msgs,
    'incidencias', v_inc,
    'silencio_max_min', v_silencio,
    'sin_responder', v_sin,
    'sin_responder_n', jsonb_array_length(v_sin)
  );
end;
$function$;

-- El P0-1 (20260819190947) revoca EXECUTE de PUBLIC en las RPC con PII; se re-aplica aquí porque
-- `create or replace` sobre una función nueva vuelve a otorgar el default a PUBLIC.
revoke all on function public.resumen_diario(int) from public;
grant execute on function public.resumen_diario(int) to service_role;

-- Verificación:  select jsonb_pretty(public.resumen_diario(45));
