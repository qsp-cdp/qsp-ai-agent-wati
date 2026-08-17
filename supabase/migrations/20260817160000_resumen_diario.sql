-- Resumen diario del copiloto (v69.1) — lo lee la Edge Function `watchdog` para el correo de cierre.
--
-- Dos propósitos:
--   1. PRUEBA DE VIDA (dead man's switch): si el correo diario NO llega, el vigilante está muerto. La
--      alerta por silencio solo avisa cuando falla algo; este avisa que todo el circuito funciona.
--   2. PULSO DEL NEGOCIO: volumen del día, incidencias y —lo más importante— las conversaciones que
--      quedaron SIN RESPONDER (ni bot ni asesor). Ese es dinero dejado sobre la mesa.
--
-- Todo se calcula en SQL (una sola ida a la base) y se devuelve como jsonb, igual que estado_pedido /
-- resolver_tarifa. `security definer` + grant solo a service_role (auto-expose OFF en este proyecto).

create or replace function public.resumen_diario(p_min_espera int default 45)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_desde timestamptz;
  v_msgs jsonb; v_inc jsonb; v_sin jsonb; v_conv jsonb; v_silencio int;
begin
  -- "Hoy" en hora de Panamá (UTC-5 fijo, sin horario de verano).
  v_desde := date_trunc('day', (now() at time zone 'America/Panama')) at time zone 'America/Panama';

  -- Volumen del día. El asesor humano se guarda como role='assistant' con model='human-agent'.
  select jsonb_build_object(
    'cliente', count(*) filter (where role = 'user'),
    'bot',     count(*) filter (where role = 'assistant' and coalesce(model,'') <> 'human-agent'),
    'asesor',  count(*) filter (where model = 'human-agent')
  ) into v_msgs
  from messages where created_at >= v_desde;

  -- Incidencias del día (job_log). Cada una tiene su propia historia:
  --   respuesta_respaldo → la API de Anthropic falló y el cliente recibió el mensaje genérico
  --   envio_fallido      → WATI rechazó el envío (el cliente NO recibió nada)
  --   audio_stt_fallo    → no se pudo transcribir una nota de voz (cayó al puente)
  --   busqueda_mcp_fallo → el catálogo no respondió (se usó el motor viejo)
  select jsonb_build_object(
    'respuesta_respaldo', count(*) filter (where action = 'respuesta_respaldo'),
    'envio_fallido',      count(*) filter (where action = 'envio_fallido'),
    'audio_stt_fallo',    count(*) filter (where action = 'audio_stt_fallo'),
    'busqueda_mcp_fallo', count(*) filter (where action = 'busqueda_mcp_fallo'),
    'audios_transcritos', count(*) filter (where action = 'audio_transcrito'),
    'errores',            count(*) filter (where action = 'error')
  ) into v_inc
  from job_log where created_at >= v_desde;

  -- Silencio MÁXIMO entre mensajes consecutivos, SOLO dentro del horario hábil (9-17 hora de Panamá).
  -- Sin ese filtro la métrica mide el hueco de la NOCHE (probado con datos reales: daba 299 min) y no
  -- sirve para calibrar el umbral del watchdog, que es su único propósito.
  -- (Si cambia el horario de la tienda, actualizar también WATCHDOG_HORA_INICIO/FIN en la función.)
  select coalesce(max(gap_min), 0)::int into v_silencio
  from (
    select extract(epoch from (created_at - lag(created_at) over (order by created_at))) / 60 as gap_min
    from messages
    where created_at >= v_desde
      and extract(hour from (created_at at time zone 'America/Panama')) between 9 and 16
  ) g;

  -- CLIENTES ATENDIDOS hoy. Se cuenta por CONVERSACIÓN (cliente único), no por mensaje: lo que interesa
  -- es a cuánta gente se le habló. NO se distingue si respondió el bot o un asesor (decisión de Isaac:
  -- para el resumen diario da igual quién atendió — lo que importa es que alguien lo hiciera).
  select jsonb_build_object(
    'total',        count(*),
    'atendidos',    count(*) filter (where hubo_bot or hubo_asesor),
    'sin_atencion', count(*) filter (where not hubo_bot and not hubo_asesor)
  ) into v_conv
  from (
    -- coalesce OBLIGATORIO: `m.model = 'human-agent'` con model NULL da NULL, y bool_or de puros NULL
    -- devuelve NULL (no false) → la conversación sin atender se perdía del conteo (probado en local).
    select c.id,
           bool_or(coalesce(m.model,'') = 'human-agent') as hubo_asesor,
           bool_or(m.role = 'assistant' and coalesce(m.model,'') <> 'human-agent') as hubo_bot
    from conversations c
    join messages m on m.conversation_id = c.id and m.created_at >= v_desde
    where exists (select 1 from messages u
                  where u.conversation_id = c.id and u.role = 'user' and u.created_at >= v_desde)
    group by c.id
  ) t;

  -- SIN RESPONDER: conversaciones cuyo ÚLTIMO mensaje es del CLIENTE y ya pasaron p_min_espera minutos.
  -- Si el último es del cliente, no contestó nadie —ni el bot ni un asesor—; el margen de espera evita
  -- listar a quien acaba de escribir hace un minuto.
  --
  -- ⚠️ SE EXCLUYEN LOS ACKS ("gracias", "ok", "listo", "👍"…): el bot calla ante ellos A PROPÓSITO (regla
  -- de anti-interrupción), así que reportarlos sería gritar que falló algo que funcionó bien. Medido con
  -- tráfico real el 17-ago: de 9 "sin responder", 6 eran acks — con ese ruido el correo se vuelve
  -- ignorable en dos semanas y la lista pierde su valor. El patrón exige que el mensaje sea SOLO el ack:
  -- "gracias, y tienen la 664 negra?" SÍ se reporta (lleva pregunta).
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
      and btrim(m.content) !~* '^(ok|oka?y|listo|dale|perfecto|excelente|bueno|buenas|no|si|sí|claro|correcto|entiendo|de acuerdo|(muchas |mil |ok |listo )?gracias|thanks?|thank you|ty|👍|🙏|👌|😊|❤️)[\s\.\!,👍🙏👌😊❤️😉🤝]*$'
  ) s;

  return jsonb_build_object(
    'desde', v_desde,
    'conversaciones', v_conv,
    'mensajes', v_msgs,
    'incidencias', v_inc,
    'silencio_max_min', v_silencio,
    'sin_responder', v_sin,
    'sin_responder_n', jsonb_array_length(v_sin)
  );
end;
$function$;

grant execute on function public.resumen_diario(int) to service_role;

-- Verificación:  select jsonb_pretty(public.resumen_diario(45));
