-- La lista "ESPERANDO RESPUESTA" del correo diario estaba llena de gente que NO espera nada.
-- Isaac lo vio el 25-ago: de 6 alertas, las 6 eran cierres de conversación con horas de espera falsa:
--   «oks» (5h 18m) · «Ah ok 👍🏻» (4h 31m) · «Déjeme hablar con ella» (4h 5m)
--   «Ya pasaron. A comprar» (3h 57m) · «ok paso en un rato» (3h 54m) · «Voy en camino» (2h 8m)
-- Una alerta que casi siempre es ruido se deja de leer, y entonces no sirve para la vez que sí importa.
-- (Ese día había 15 candidatos en total y los 15 eran ack o cierre: la lista correcta era vacía.)
--
-- Dos huecos distintos, y por eso dos arreglos. Todo lo que sigue salió del corpus REAL de 14 días.

-- 1) es_ack no normalizaba los MODIFICADORES de emoji. Quitaba 👍 pero no el tono de piel (U+1F3FB-FF)
--    ni el selector de variación (U+FE0F), así que «Ah ok 👍🏻» quedaba como «Ah ok 🏻» y no era un ack.
--    Además faltaban variantes que la gente escribe de verdad: oks, okiis, ahh, recibido, estabien, y
--    las truncadas «Graci»/«Gracia».
create or replace function public.es_ack(p_texto text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  -- ⚠️ ESPEJO EXACTO de ACK_PALABRAS en copilot-webhook/index.ts. El golden test que menciona el
  -- comentario viejo (tests/golden.mjs) NO existe en el repo, así que el espejo lo sostiene la mano:
  -- si tocas esta lista, toca la otra en el mismo commit.
  v_pal text := 'ok|oks|okis|okiis|okay|okey|oki|ah|ahh|listo|dale|perfecto|excelente|bueno|buenas|buenos|dias|tardes|no|si|s[ií]|claro|correcto|entiendo|entendido|acuerdo|de|en|por|la|muy|amable|estabien|recibido|recibida|informaci[oó]n|informacion|gracias|graciass+|graci|gracia|muchas|mil|1000|100|much[ií]simas|thanks|thank|you|ty|reviso|revisando|revisar[eé]|ya|vale|bien|igualmente|saludos|atento|atenta|nada|voy|hacerla|hacerlo|a|ustedes|usted|todos|toda|super';
  v text;
begin
  v := btrim(regexp_replace(
         regexp_replace(coalesce(p_texto, ''), '[\U0001F3FB-\U0001F3FF️]', '', 'g'),
         '[👍🙏👌😊❤😉🤝✅🫡🤗]', '', 'g'));
  if v = '' then return true; end if;
  return v ~* ('^(' || v_pal || ')([\s,\.!¡]+(' || v_pal || '))*[\s,\.!]*$');
end;
$function$;

-- 2) Los otros no son acks: son FRASES que cierran la conversación —"voy en camino", "paso en un rato",
--    "déjeme hablar con ella"—. Un vocabulario de palabras sueltas nunca las va a atrapar, así que van
--    por patrón de intención.
--
--    EL GUARDIA ES LO IMPORTANTE: si el mensaje trae una pregunta o un pedido, NO es un cierre por más
--    que empiece igual. «Voy en camino, me separa 2?» y «paso el lunes, cuanto seria el total» tienen
--    que seguir alertando, y con este guardia lo hacen.
--
--    OJO con la sintaxis: Postgres usa \y para límite de palabra, NO \b (que aquí significa backspace).
--    La primera versión de esto usaba \b y el guardia entero no hacía nada; solo lo salvaba el '?'.
--    Se descubrió probando, no leyendo.
--
--    NO se filtra "quedo atento" / "quedo pendiente del asesor": esa gente está esperando algo NUESTRO.
--    Probado contra 26 frases reales: 9 cierres atrapados, 17 conservados, 0 falsos positivos.
create or replace function public.es_cierre_conversacion(p_texto text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v text;
begin
  v := btrim(regexp_replace(
         regexp_replace(coalesce(p_texto, ''), '[\U0001F3FB-\U0001F3FF️]', '', 'g'),
         '[👍🙏👌😊❤😉🤝✅🫡🤗]', '', 'g'));
  if v = '' then return false; end if;

  -- Pregunta o pedido explícito → necesita respuesta, no es cierre.
  if v ~ '\?' then return false; end if;
  if v ~* '\y(favor|puede|podr[íi]a|necesito|quiero|manda|env[ií]a|cu[aá]nto|cu[aá]l|qu[eé]|c[oó]mo|d[oó]nde|cu[aá]ndo|aparta|separa|cotiza|total|factura|precio)\y' then
    return false;
  end if;

  return v ~* '^(ya\s+)?(voy|vamos|estoy|estamos)\s+(en\s+camino|para\s+all[aá]|saliendo|llegando|afuera)[\s\.,!]*$'
      or v ~* '^(ok[a-z]*[\s,\.]*)?(ya\s+|ahora\s+|luego\s+)?(paso|pasar[eé]|pasamos|pasaron|pas[oó])\y.{0,40}$'
      or v ~* '(d[eé]j[ea](me|nos)|perm[ií]tame)\s+(hablar|consultar|ver|revisar|preguntar)'
      or v ~* '\y(estamos|tamos)\s+en\s+contacto\y'
      or v ~* '\yle\s+(aviso|avisamos|confirmo|confirmamos|escribo|escribimos)\y';
end;
$function$;

revoke all on function public.es_cierre_conversacion(text) from public, anon, authenticated;
grant execute on function public.es_cierre_conversacion(text) to service_role;
