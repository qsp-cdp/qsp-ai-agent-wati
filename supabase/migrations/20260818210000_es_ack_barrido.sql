-- v73.1 — el filtro de acks se mueve al SQL, ANTES del `limit`.
--
-- POR QUÉ (hallado con datos reales el 18-ago, corriendo el RPC a mano): `asistencia_pendientes`
-- cortaba a 10 candidatos ordenados del MÁS VIEJO al más nuevo, y el filtro de acks vivía después,
-- en TS. Las diez filas que devolvió eran las diez un "Ok" / "Gracias" / "OK LISTO" de la mañana.
-- Como el orden es por antigüedad, esos mismos diez ocupaban los diez cupos en CADA corrida (una cada
-- 20 min) hasta envejecer más de 24 h. Un cliente real esperando desde hace media hora quedaba en la
-- posición 11 y el barrido no lo veía NUNCA.
--
-- Es la misma forma del bug de v73: dos reglas correctas que, combinadas, esconden justo a la
-- población que debían encontrar. Filtrando en SQL, el `limit` se gasta en candidatos de verdad.
--
-- De paso, el vocabulario de cortesía vivía duplicado en tres lugares (TS `ACK_PALABRAS`,
-- `resumen_diario` y ahora el barrido). Se extrae a `es_ack` para que los DOS RPC lean el mismo
-- texto: el resumen LISTA a quien espera y el barrido ATIENDE a ese mismo conjunto — si se
-- desincronizan, el correo reporta gente que el barrido ignora (o al revés).
-- La copia de TS se conserva a propósito, como segunda barrera.

-- ¿el mensaje es SOLO cortesía? Por VOCABULARIO (todas sus palabras lo son), no por frases exactas:
-- así los compuestos caen solos ("ok, gracias", "listo gracias") y una pregunta real sobrevive aunque
-- empiece con cortesía ("gracias, y tienen la 664 negra?" SÍ se reporta).
create or replace function public.es_ack(p_texto text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  -- ⚠️ ESPEJO EXACTO de ACK_PALABRAS en copilot-webhook/index.ts. Un golden test compara ambos y falla
  -- si se separan (tests/golden.mjs, lock "vocabulario de acks SQL == TS").
  v_pal text := 'ok|okis|okay|oki|listo|dale|perfecto|excelente|bueno|buenas|buenos|dias|tardes|no|si|s[ií]|claro|correcto|entiendo|entendido|acuerdo|de|muy|amable|gracias|graciass+|muchas|mil|1000|100|much[ií]simas|thanks|thank|you|ty|reviso|revisando|revisar[eé]|ya|vale|bien|igualmente|saludos|atento|atenta|nada|voy|hacerla|hacerlo|a|ustedes|usted|todos|toda|super';
  v text;
begin
  -- los emojis de cortesía se quitan antes de evaluar (un "👍" solo es un ack)
  v := btrim(regexp_replace(coalesce(p_texto, ''), '[👍🙏👌😊❤️😉🤝]', '', 'g'));
  if v = '' then return true; end if;
  return v ~* ('^(' || v_pal || ')([\s,\.!¡]+(' || v_pal || '))*[\s,\.!]*$');
end;
$function$;

grant execute on function public.es_ack(text) to service_role;


-- === barrido: el ack se descarta ANTES del limit ===
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
    -- Último mensaje del ASESOR (puede no existir: ver la segunda población de v73).
    join lateral (
      select max(created_at) as ultimo_asesor_at from messages
      where conversation_id = c.id and model = 'human-agent'
    ) h on true
    where c.status = 'handoff'                                    -- 'cerrada' (proveedores) queda fuera por definición
      and m.role = 'user'
      and m.created_at <= now() - make_interval(mins => p_espera_min)
      -- v73.1: los acks se descartan AQUÍ, no en TS, para que el `limit` de abajo no se gaste en ellos.
      and not es_ack(m.content)
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


-- === resumen: misma fuente de vocabulario (antes llevaba el regex inline, copiado a mano) ===
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
    'de_clientes',  count(*) filter (where role = 'user'),
    'del_bot',      count(*) filter (where role = 'assistant' and coalesce(model,'') <> 'human-agent'),
    'de_asesores',  count(*) filter (where model = 'human-agent')
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

  -- CLIENTES del día: se cuenta por CONVERSACIÓN (cliente ÚNICO de WATI), no por mensaje — `mensajes`
  -- de arriba son mensajes sueltos y confunde leerlos como clientes (lo notó Isaac viendo 387 vs 59). Lo que interesa
  -- es a cuánta gente se le habló. NO se distingue si respondió el bot o un asesor (decisión de Isaac:
  -- para el resumen diario da igual quién atendió — lo que importa es que alguien lo hiciera).
  select jsonb_build_object(
    'escribieron',  count(*),
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
  -- ignorable en dos semanas y la lista pierde su valor.
  -- v73.1: el vocabulario ya no va inline aquí; lo pone `es_ack`, compartido con el barrido.
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

grant execute on function public.resumen_diario(int) to service_role;

-- Verificación:
--   select public.es_ack('Ok'), public.es_ack('muchas gracias'), public.es_ack('👍'),
--          public.es_ack('gracias, y tienen la 664 negra?');   -- t, t, t, f
--   select jsonb_pretty(public.asistencia_pendientes(25, 15, 24, 10, 30));
