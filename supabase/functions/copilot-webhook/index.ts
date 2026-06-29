// === copilot-webhook v34 — Copiloto AI de WATI — búsqueda lee los tags de compatibilidad ===
// v34 (2026-06-29): la compatibilidad impresora→consumible YA está cargada en Shopify como TAGS del
//   producto (ej. el tóner Kyocera TK-8337 tiene "…3253ci"; las tintas Canon tienen "Canon PIXMA MG2110"…),
//   pero suggest.json por defecto NO busca en los tags (solo title/product_type/variants.title/vendor) →
//   por eso "3253ci" no hallaba el tóner. Fix de UNA línea: agregar `tag` a resources[options][fields].
//   Probado contra la tienda real: q="3253ci" SIN tag → 0 resultados; CON tag → los 4 TK-8337 (C/M/Y/K),
//   limpio. Resuelve la brecha "modelo de impresora → consumible" reusando el dato que el equipo ya
//   mantiene en los tags (no hace falta pase Admin ni tabla nueva). Posible extensión futura: sumar `body`
//   para productos con la compatibilidad solo en la descripción.
// === copilot-webhook v33 — Copiloto AI de WATI — búsqueda: extracción de modelo robusta ===
// v33 (2026-06-29): la extracción del código de modelo (modelosEn) tenía dos huecos que hacían fallar
//   búsquedas reales: (1) códigos que EMPIEZAN con dígito + sufijo de letras (140XL, 141XL, 3253ci) no
//   se extraían → nunca se reintentaba por modelo; (2) códigos de varios segmentos con guion (PT-H110)
//   se partían mal → agarraba solo "H110", nunca "PTH110"/"PT-H110". Caso real confirmado: la
//   etiquetadora Brother existe indexada como handle …-brother-pth110, pero el bot buscaba "PT-H110" y
//   no la hallaba. Fix: modelosEn ahora toma cualquier token alfanumérico (con guiones internos) con ≥1
//   dígito y largo>=3; variantesModelo amplía las formas con/sin guion (incluye multi-segmento). Probado
//   en los casos que fallaban + regresión (G2170, 954, TN-830XL, GI-11 intactos). NO toca el LLM ni los
//   guardrails. NOTA: no resuelve el caso "modelo de IMPRESORA → consumible" (ej. Kyocera 3253ci → tóner
//   TK-8337K): eso es una brecha de DATOS de compatibilidad en el catálogo (roadmap #3), no de extracción.
// === copilot-webhook v32 — Copiloto AI de WATI — conciencia temporal (separa ayer de hoy) ===
// v32 (2026-06-26): el bot mezclaba el "ayer" con el "hoy" porque el historial se le pasaba SIN marca de
//   tiempo y, dentro de horario, ni sabía la fecha. Caso real: ayer el cliente dijo "mañana le paso";
//   hoy escribió "buenas tardes" y el bot respondió "le esperamos mañana" (cuando venía HOY). Fix, todo
//   CONTEXTO (no toca guardrails): (1) CONTEXTO TEMPORAL fijo con la fecha/hora actual de Panamá (antes
//   solo se inyectaba fuera de horario); (2) cada mensaje ANTERIOR del historial se marca con cuándo se
//   dijo ([hoy …]/[ayer …]/[fecha …], hora de Panamá) — el último/actual va limpio; (3) regla: los
//   mensajes de días previos son contexto PASADO, no arrastrar "mañana/hoy/ahora" viejos, y un saludo
//   nuevo tras un corte de día = visita nueva. Se agrega created_at al fetch del historial. Sin cambios
//   de esquema. Ediciones acotadas a responderLLM + helpers de tiempo.
// === copilot-webhook v31 — Copiloto AI de WATI — ciclo de vida del handoff (asistencia + cold-return) ===
// v31 (2026-06-26): el bot deja de quedarse MUDO para siempre en status='handoff'. REACTIVO (lo gatilla
//   un mensaje del cliente), midiendo el tiempo desde el último mensaje del asesor (model='human-agent'):
//   (1) ASISTENCIA (>=15 min sin asesor) — si el cliente hace una pregunta BÁSICA de tienda (ubicación,
//   horario, formas de pago, envíos/entregas, devoluciones; BASIC_INFO_RE), el bot adelanta SOLO esa info
//   vía info_tienda (única tool, modoAsistencia), breve y deferente, y la conversación SIGUE en handoff
//   (no le quita la venta al humano). (2) COLD-RETURN (>24 h sin asesor) — la atención humana se considera
//   fría: el bot RETOMA todo (status→'bot') y procesa como cualquier cliente. Ambos umbrales son
//   configurables (COPILOT_HANDOFF_ASSIST_MIN / COPILOT_HANDOFF_COLD_HOURS). Guardrails intactos:
//   INTERRUPT_RE (pago/fiscal/trámite) bloquea AMBOS caminos; si el asesor vuelve a escribir, owner=true
//   regresa a handoff y el anti-carrera evita pisarlo; el anti-eco reconoce el envío propio (no resetea el
//   reloj). Si NUNCA escribió un humano (handoff por keyword), se mantiene el comportamiento v30. Sin
//   cambios de esquema. Telemetría: job_log `handoff_cold_return`, `asistencia_handoff`.
// === copilot-webhook v30 — Copiloto AI de WATI — el endpoint resolve acepta Bearer (contrato CDP) ===
// v30 (2026-06-24): el endpoint de resolución (GET ?ref_code=) ahora acepta Authorization: Bearer
//   <RESOLVE_SECRET> además de ?key= — el CDP lo lee por Bearer (no deja el secreto en la URL/logs);
//   ?key= queda para probar rápido en el navegador. Cierra el contrato del puente ref_code con el CDP.
// === copilot-webhook v29 — Copiloto AI de WATI — el link de producto sale con el tracking intacto ===
// v29 (2026-06-24): el modelo a veces "limpiaba" el link de producto (le quitaba el ?utm…&ref_code=),
//   rompiendo el stitch (el cliente clickeaba un link sin ref_code). El guardado de ref_codes (v28) ya
//   funcionaba; esto arregla solo la EMISIÓN visible. Fix DETERMINISTA: buscar_producto registra
//   {handle → URL con tracking} del turno y, post-LLM, reaplicarTracking() reemplaza en la respuesta
//   cualquier URL de producto por su versión con tracking (no depende de que el LLM copie bien la URL).
//   + refuerzo de prompt para no acortar el link.
// === copilot-webhook v28 — Copiloto AI de WATI — stitching WhatsApp→web por ref_code ===
// v28 (2026-06-24): los links de producto que emite buscar_producto ahora llevan tracking para
//   atribución / identidad omnicanal en el CDP. (1) URL APEX (sin www) + UTMs (utm_source=whatsapp…).
//   (2) ref_code: 8 alfanuméricos opacos (crypto) por producto; se guarda {ref_code→wa_id,handle} en
//   la tabla ref_codes (best-effort, batch); NUNCA se emite un code que no se haya guardado. (3)
//   Endpoint de resolución GET ?ref_code=&key=RESOLVE_SECRET → {wa_id,producto_handle,ts} (404 si no),
//   que el CDP lee para resolver ref_code→wa_id (riel wa_ref_codes). Privacidad: nunca wa_id/PII en la
//   URL, solo el ref_code opaco. El copiloto solo EMITE/GUARDA/EXPONE; el stitch/enriquecimiento vive
//   en el CDP. Tabla nueva: ref_codes. Secreto nuevo: RESOLVE_SECRET.
// === copilot-webhook v27 — Copiloto AI de WATI — captura también nombre y apellido ===
// v27 (2026-06-24): guardar_lead ahora también captura nombre y apellido (atributos `nombre` y
//   `apellido` de WATI), además del correo y la empresa; el correo dejó de ser obligatorio (guarda
//   lo que el cliente dé, en cualquier orden, y puede llamarse varias veces). El prompt pide nombre y
//   apellido junto al correo al cotizar. Sigue pasivo y respeta la anti-interrupción (nombre/apellido
//   NO son datos fiscales; RUC/factura siguen yendo a un asesor).
// === copilot-webhook v26 — Copiloto AI de WATI — conciencia de canal (no redirigir a WhatsApp) ===
// v26 (2026-06-24): el bot ya NO le dice al cliente que "escriba por WhatsApp" ni le da el número de
//   WhatsApp de la tienda — está atendiendo POR WhatsApp, así que sonaba absurdo/circular (pasaba al
//   derivar a un asesor o ante soporte). Regla CANAL en el prompt: al derivar, "un asesor te responde
//   por aquí mismo"; no repetir el whatsapp/seguimiento que trae info_tienda; el correo solo si hace
//   falta de verdad.
// === copilot-webhook v25 — Copiloto AI de WATI — captura de lead + buscar antes de negar ===
// v25 (2026-06-24): (1) BUSCAR ANTES DE NEGAR: el bot ya no dice "no lo tenemos" de memoria — se
//   amplió NEEDS_TOOL_RE al catálogo completo (monitores, escáneres, UPS, accesorios, laptops, cables…,
//   no solo impresión) y se reforzó el prompt ("nunca niegues sin buscar; vendemos más que impresión").
//   Corrige el caso en que negaba y luego se corregía. (2) CAPTURA DE LEAD (pasiva): ante intención de
//   cotizar/comprar, si no tenemos el correo, el bot lo pide con naturalidad y lo guarda en el atributo
//   `email` de WATI (+ `empresa` si aplica) vía la tool guardar_lead. Lee los atributos que ya tenemos
//   (del payload de WATI) para no repreguntar; es pasivo (no insiste, respeta el "no"); y RESPETA la
//   anti-interrupción: NUNCA pide RUC/cédula/factura (eso queda para un asesor). El email enriquece el
//   CDP y ayuda a los vendedores a cotizar más rápido.
// === copilot-webhook v24 — Copiloto AI de WATI — venta consultiva (asesor que ayuda a elegir) ===
// v24 (2026-06-24): nueva sección "VENTA CONSULTIVA" en el SYSTEM_PROMPT — el bot actúa más como
//   asesor de ventas: preguntas de intake antes de recomendar, adapta la profundidad al tipo de
//   cliente (hogar/oficina/empresa/técnico), recomienda por necesidad/costo total, posiciona
//   productos originales y usa la web como apoyo sin abandonar al cliente. Destilado de la Base de
//   Conocimiento de QSP (docs/base-conocimiento-qsp.md). NO afloja guardrails: todo precio/modelo
//   sigue saliendo de buscar_producto (regla de oro) y la anti-interrupción sigue intacta
//   (B2B/cotización/factura → derivar a un humano, NUNCA pedir RUC/datos de factura). En paralelo,
//   store_facts sumó la fila soporte_reparaciones (contactos de servicio técnico por marca,
//   verificados) y la URL real de la página en sucursales_interior.
// === copilot-webhook v23 — Copiloto AI de WATI — resiliencia ante fallos de la API ===
// v23 (2026-06-23): tras una auditoría que halló un bache de Anthropic (529 overloaded / 500
//   internal) en una ventana de ~33 min que dejó ~21 turnos SIN respuesta. (1) maxRetries del SDK
//   a 3 (reintenta con backoff los baches cortos). (2) RESPUESTA DE RESPALDO: si la llamada falla
//   y no alcanzamos a responder, en vez de silencio se manda un "estamos con alto volumen, un asesor
//   te ayuda…" (consciente del horario), respetando live / anti-duplicado / handoff.
// === copilot-webhook v22 — Copiloto AI de WATI — conciencia de horario de atención ===
// v22 (2026-06-20): el bot sabe en qué horario está (Lun-Vie 9:00am–5:00pm, hora de Panamá,
//   UTC-5 fijo, sin horario de verano). Fuera de horario (noches/fines de semana) SIGUE
//   respondiendo lo automático (precio/ITBMS, stock, info), pero al derivar o cuando el cliente
//   espera a un humano, aclara que un asesor responde en el próximo horario hábil — no promete
//   respuesta humana inmediata. El mensaje fijo de handoff también se vuelve consciente del
//   horario. (Feriados: pendiente para una versión futura.)
// === copilot-webhook v21 — Copiloto AI de WATI — ITBMS + inventario real + anti-eco + prefill duro ===
// v21 (2026-06-19): (1) ITBMS: el precio de Shopify es SIN impuesto; buscar_producto devuelve
//   precio_usd, itbms_7pct y total_con_itbms (cálculo en CÓDIGO, el LLM no hace aritmética). (2)
//   INVENTARIO REAL: buscar_producto consulta Shopify Admin (totalInventory) y devuelve un campo
//   `stock` ya resuelto — >3 muestra el número, ≤3 (incl. 0) deriva a un asesor para que verifique
//   el inventario físico (el bot nunca ve ni inventa el número). Best-effort: sin token → "un asesor
//   confirma la cantidad". (3) ANTI-ECO duro: la respuesta del bot se inserta ANTES de enviarse por
//   WATI, para que el eco (owner=true) lo reconozca el anti-eco y NO dispare un handoff falso (ayer:
//   5/día). (4) Guard de prefill endurecido: fin en mensaje de usuario antes de CADA llamada al
//   modelo. Secretos nuevos: SHOPIFY_ADMIN_TOKEN, SHOPIFY_ADMIN_API_BASE.
// === copilot-webhook v20 — Copiloto AI de WATI — endurecimiento (anti-duplicado, anti-carrera, MODE seguro) ===
// v20 (2026-06-18): tras auditar el 1er día live a todos. (1) CLAMP de MODE: si COPILOT_MODE no es
//   "live" cae a "shadow" — un secreto cruzado con COPILOT_MODEL ya NO rompe todos los inserts
//   (era el 96% de los errores del día: messages.mode solo acepta live|shadow). (2) ANTI-DUPLICADO:
//   en ráfaga de mensajes, solo el ÚLTIMO contesta (chequeo pre y post LLM de "¿hay uno más nuevo?")
//   — mata las respuestas dobles/triples. (3) ANTI-CARRERA: re-chequea status='handoff' justo antes
//   de enviar (si un asesor tomó la conversación durante los ~8s del LLM, el bot no la pisa). (4) Guard
//   de prefill: la conversación siempre termina en mensaje de usuario (mata el error 400 de Anthropic).
// === copilot-webhook v19 — Copiloto AI de WATI — visión (el bot ve imágenes del cliente) ===
// v19 (2026-06-18): el bot ahora PROCESA las imágenes que envía el cliente (type:image,
//   owner=false). Descarga el archivo de WATI (campo `data` del webhook, con el token), lo
//   pasa a Claude vision junto al caption y el historial, y responde con las MISMAS reglas:
//   si ve un producto identifica marca/modelo y lo busca con buscar_producto (precio SOLO de
//   la tool, nunca leído de la imagen); si ve un comprobante/dato fiscal se ABSTIENE; si no
//   entiende, deriva. Respeta status='handoff', el tope de turnos y el guardrail INTERRUPT_RE
//   (sobre el caption). Documentos y demás no-texto se siguen registrando y saltando (v18.1).
// === copilot-webhook v18.1 — diagnóstico de media (paso previo a visión v19) ===
// v18.1 (2026-06-18): registra el payload COMPLETO de los mensajes que NO son texto
//   (imágenes, documentos…) en job_log (action `evento_sin_texto`, campo `payload`,
//   con strings largos truncados) para conocer el shape real de media de WATI — dónde
//   viene la URL/ID del archivo — y construir v19 (visión) sin adivinar. NO cambia el
//   comportamiento de envío: los no-texto se siguen saltando (el bot aún no ve imágenes).
// === copilot-webhook v18 — Copiloto AI de WATI — búsqueda tolerante al guion en modelos ===
// v18 (2026-06-18): buscar_producto prueba el código de modelo CON y SIN guion (TN830XL ↔
//   TN-830XL, GI11 ↔ GI-11). Shopify no matchea una forma contra la otra, así que el bot decía
//   "no lo tengo" a productos que SÍ existen. Las variantes se generan EN CÓDIGO (no depende de
//   que el LLM adivine el guion) y se deduplican los intentos.
// === copilot-webhook v17 — Copiloto AI de WATI — modelo exacto + soporte/reparaciones ===
// v17 (2026-06-17): (1) anti-"modelo equivocado": el bot usa el título real del resultado y, si el
//   modelo pedido no aparece, lo dice en vez de renombrar (corrige casos como el monitor 322pv que
//   se respondió con el link de otro modelo); (2) soporte/reparaciones: QSP no repara, sugiere la
//   empresa de la marca desde store_facts (key soporte_reparaciones) — se fuerza info_tienda ante
//   preguntas de reparación/soporte/sucursal (NEEDS_TOOL_RE).
// === copilot-webhook v16 — Copiloto AI de WATI — formato apto para WhatsApp (links/negritas) ===
// v16 (2026-06-16): limpia el texto antes de enviarlo a WhatsApp (limpiarWhatsApp): convierte los
//   links markdown [texto](url) en URL pelada y los dobles asteriscos en uno solo, porque WhatsApp
//   los muestra literales. Refuerzo en el prompt para que el modelo ya no genere [texto](url).
// === copilot-webhook v15 — Copiloto AI de WATI — el bot solo atiende contactos nuevos / sin asignar ===
// v15 (2026-06-16): cuando el NEGOCIO escribe en una conversación (owner=true: asesor humano o
//   mensaje automático), se marca status='handoff' → el bot deja de atenderla y NO la retoma solo
//   (antes volvía a los 45 min, lo que hacía que se "robara" conversaciones ya atendidas por un
//   humano, incluso después de marcarlas resueltas). El bot solo responde a contactos nuevos o
//   conversaciones sin intervención del negocio. Para devolver una conversación al bot: status='bot'.
//   Se registra el operador (operatorName) del payload saliente de WATI.
// === copilot-webhook v14 — Copiloto AI de WATI — respuesta rápida a WATI (procesa en segundo plano) ===
// v14 (2026-06-16): el webhook responde 200 al instante y hace el trabajo lento (historial +
//   LLM + envío + guardado) en SEGUNDO PLANO (EdgeRuntime.waitUntil). Evita el timeout de WATI
//   (que marcaba las entregas como "Err" y reintentaba). La deduplicación del mensaje de usuario
//   sigue siendo síncrona (antes de responder), así que los reintentos quedan cubiertos.
// === copilot-webhook v13 — Copiloto AI de WATI — contexto de asesores + anti-eco + piloto live por allowlist ===
// v13 (2026-06-16): (1) guarda los mensajes de asesores (owner=true) en el hilo para CONTEXTO
//   completo del agente; (2) guardia anti-eco (no confunde los envíos propios del bot con un
//   humano → evita auto-abstención en live); (3) piloto: COPILOT_LIVE_ALLOWLIST limita el envío
//   (vacío = nadie; "all" = todos); (4) descarta "assistant" al inicio del historial.
// === copilot-webhook v12 — Copiloto AI de WATI (MODO SOMBRA) — todo lo anterior + forzado de tools ===
// v12 (2026-06-16): el prompt v11 no bastó con Haiku (seguía inventando precios/stock en
//   preguntas de categoría). Ahora se FUERZA el uso de tool (tool_choice:"any" en la 1ª
//   iteración) cuando el mensaje pide datos de catálogo/tienda (NEEDS_TOOL_RE) → grounding
//   garantizado en buscar_producto/info_tienda.
// v11 (2026-06-16): regla dura "sin tool, sin datos" — el bot NO menciona producto/precio/stock
//   sin buscar_producto, ni envíos/pagos/ubicación/horarios sin info_tienda (single source =
//   store_facts; se quita la data duplicada del prompt). Corrige que inventara precios en
//   preguntas de categoría (#3). (Pendiente en este v11 antes de desplegar: recall de productos
//   + ajustes según docs de WATI.)
// v10 (2026-06-16): misión "apoyar al equipo humano"; búsqueda de productos más robusta
//   (fallback por número/código de modelo cuando la consulta libre no encuentra; manejo de
//   sinónimos/línea y preguntas de categoría vía prompt; resultados con marca/tipo) y regla
//   de NO afirmar compatibilidad sin evidencia del catálogo.
// === copilot-webhook v9 — Copiloto AI de WATI (MODO SOMBRA) — prompt v2 + new-contact + info_tienda + anti-interrupción ===
// v9 (2026-06-16): guardrail PRE-LLM de anti-interrupción — ante señales de trámite/pago/dato
//   fiscal (INTERRUPT_RE) o si un humano atendió hace poco (job_log `mensaje_humano` < 45 min),
//   el bot se ABSTIENE (no llama al LLM, solo loggea). Registra los mensajes del negocio
//   (owner=true) en job_log. `info_tienda` devuelve TODOS los datos de store_facts (keys del
//   metaobjeto Shopify store_facts/datos-tienda).
// v8 (2026-06-15): Fase 1.5 — tool `info_tienda` que lee de `store_facts`. Reemplaza el
//   "puente honesto" de LOGÍSTICA/PAGOS del prompt.
// v7 (2026-06-13): maneja el evento WATI `newContactMessageReceived` (sin texto):
//   marca la conversación como confirmed_new + first_contact_at y lo registra
//   (señal autoritativa de lead nuevo / conteo). El texto real llega aparte en el
//   evento message normal. Bienvenida sigue por heurístico. prompt v2 intacto.

import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const WATI_API_TOKEN = Deno.env.get("WATI_API_TOKEN") ?? "";
const WATI_API_BASE = Deno.env.get("WATI_API_BASE") ?? "";
// v20: clamp a valores válidos. Si COPILOT_MODE trae basura (p.ej. un id de modelo por cruzar el
// secreto con COPILOT_MODEL) cae a "shadow" (seguro) en vez de romper TODOS los inserts: la columna
// messages.mode solo acepta live|shadow. MODE_RAW se expone en el healthcheck para diagnóstico.
const MODE_RAW = (Deno.env.get("COPILOT_MODE") ?? "shadow").toLowerCase();
const MODE = MODE_RAW === "live" ? "live" : "shadow";
const MODEL = Deno.env.get("COPILOT_MODEL") ?? "claude-haiku-4-5";
const WEBHOOK_KEY = Deno.env.get("COPILOT_WEBHOOK_KEY") ?? "cw-qsp-9f2e7b3a1c5d4806";
const MAX_TURNS_DIA = 40;
// v31 — ciclo de vida del handoff (umbrales configurables por secreto, defaults acordados con
// Gerencia). ASSIST: si el asesor lleva >= N min sin escribir y el cliente hace una pregunta
// BÁSICA de tienda, el bot adelanta SOLO esa info (sigue en handoff). COLD-RETURN: si el asesor
// lleva > H horas sin escribir, la conversación se considera fría → el bot la RETOMA (status='bot').
const HANDOFF_ASSIST_MIN = parseInt(Deno.env.get("COPILOT_HANDOFF_ASSIST_MIN") ?? "15", 10) || 15;
const HANDOFF_COLD_HOURS = parseInt(Deno.env.get("COPILOT_HANDOFF_COLD_HOURS") ?? "24", 10) || 24;
const STORE = "https://www.quickservicepanama.com";
// v21 — Shopify Admin (solo lectura) para la CANTIDAD real de inventario (totalInventory).
// SHOPIFY_ADMIN_API_BASE: https://<tienda>.myshopify.com/admin/api/2024-10 (sin / al final).
const SHOPIFY_ADMIN_TOKEN = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
const SHOPIFY_ADMIN_API_BASE = (Deno.env.get("SHOPIFY_ADMIN_API_BASE") ?? "").replace(/\/$/, "");
// v28 — stitching WhatsApp→web por ref_code (atribución / identidad omnicanal en el CDP).
const RESOLVE_SECRET = Deno.env.get("RESOLVE_SECRET") ?? "";   // guard del endpoint GET ?ref_code=
const STORE_APEX = "https://quickservicepanama.com";          // apex (sin www; www mete redirect)

// Piloto gradual: en live, SOLO se envía a estos wa_id. Vacío = no se envía a nadie (sigue
// registrando en sombra); "all"/"*" = todos. Evita ir a live total por accidente.
const LIVE_RAW = (Deno.env.get("COPILOT_LIVE_ALLOWLIST") ?? "").trim().toLowerCase();
const LIVE_ALL = LIVE_RAW === "all" || LIVE_RAW === "*";
const LIVE_ALLOWLIST = LIVE_RAW.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
function liveAllowed(waId: string): boolean {
  if (MODE !== "live") return false;
  return LIVE_ALL || LIVE_ALLOWLIST.includes(waId);
}

// v22 — horario de atención de QSP: Lun-Vie 9:00am–5:00pm, hora de Panamá (UTC-5 fijo, sin
// horario de verano → basta desplazar UTC y leer). Sáb/Dom o fuera de 9–17 = fuera de horario.
function horarioPanama(now: Date = new Date()): { dentro: boolean; dia: number; hora: number } {
  const pa = new Date(now.getTime() - 5 * 3600 * 1000); // UTC-5
  const dia = pa.getUTCDay();    // 0=Dom … 6=Sáb
  const hora = pa.getUTCHours(); // 0–23
  const dentro = dia >= 1 && dia <= 5 && hora >= 9 && hora < 17;
  return { dentro, dia, hora };
}

// v32 — conciencia temporal. Hora de Panamá en formato 12h y etiqueta relativa de un timestamp
// (hoy/ayer/fecha) para marcar CADA mensaje del historial → el bot no mezcla lo de ayer con lo de hoy.
const DIAS_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function horaPa12(h: number, min: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(min).padStart(2, "0")}${ampm}`;
}
function etiquetaTiempo(iso: string, ahoraMs: number): string {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "";
  const m = new Date(t - 5 * 3600 * 1000);        // mensaje en hora de Panamá
  const n = new Date(ahoraMs - 5 * 3600 * 1000);  // ahora en hora de Panamá
  const dMsg = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate());
  const dNow = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const dias = Math.round((dNow - dMsg) / 86400000);
  const hora = horaPa12(m.getUTCHours(), m.getUTCMinutes());
  if (dias <= 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  if (dias < 7) return `hace ${dias} días, ${hora}`;
  return `${m.getUTCDate()}/${m.getUTCMonth() + 1} ${hora}`;
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
// v23: maxRetries 3 (default 2) para tolerar baches transitorios de la API (429/500/529) con backoff.
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 }) : null;

const SYSTEM_PROMPT = `Eres el asistente de Quick Service Panamá (quickservicepanama.com), tienda de suministros de impresión y tecnología en Panamá. Atiendes por WhatsApp.

MISIÓN
- Tu trabajo es APOYAR al equipo humano de QSP: adelanta lo que puedas responder con certeza (precio, disponibilidad, información general y de la tienda) y, cuando no estés seguro o una respuesta pueda comprometer a la empresa con una promesa, NO respondas: deja que un asesor humano siga. Mejor no responder que responder mal. Nunca inventes ni prometas de más.

ESTILO
- Mensajes CORTOS: 1 a 3 oraciones. Tono cordial panameño, en español, cercano.
- Negrita SOLO con UN asterisco: *así*. NUNCA uses dobles asteriscos (**texto**), porque en WhatsApp se ven literales y se ve mal. Tampoco uses otra sintaxis de Markdown (#, listas con guion, tablas). Para enlaces, escribe la URL completa tal cual (https://...); NUNCA uses el formato [texto](url) — en WhatsApp se ve literal.
- Emojis con moderación (uno o dos por mensaje, no más).
- CANAL: estás atendiendo POR WhatsApp, en este mismo chat. NUNCA le digas al cliente que te escriba o te contacte "por WhatsApp", ni le des el número de WhatsApp de la tienda (el que info_tienda trae como whatsapp/seguimiento) — ya está hablando con nosotros aquí; sonaría absurdo. Aunque info_tienda incluya ese número o un texto de "escríbenos por WhatsApp", NO lo repitas. Cuando derives a un asesor, di que un asesor le responde por aquí mismo / en este chat. Menciona el correo SOLO si de verdad hace falta enviar o recibir algo por esa vía.

REGLA DE ORO — precio, stock y promociones
- Para CUALQUIER precio o disponibilidad usa SIEMPRE la herramienta buscar_producto y responde SOLO con lo que ella devuelve.
- NUNCA menciones un producto, modelo, precio o disponibilidad que no provenga de un resultado de buscar_producto EN ESTE MISMO TURNO. Si no llamaste a la tool, NO nombres modelos ni des precios/stock: búscalo primero. Aplica también a preguntas de categoría ("¿venden impresoras Epson?"): primero busca, luego responde con lo que devuelva.
- NO NIEGUES DE MEMORIA: nunca digas que NO ofrecemos un producto o categoría sin haber buscado con buscar_producto en este turno. QSP vende MÁS que impresión (también monitores, escáneres, UPS, baterías, accesorios y tecnología en general). Ante CUALQUIER consulta de producto, BUSCA primero; solo di "no lo encontré" o "eso no lo manejamos" DESPUÉS de haber buscado.
- NUNCA inventes precios, existencias, descuentos ni promociones.
- Incluye el link del producto cuando lo tengas, copiándolo EXACTO como viene en el campo "url" de buscar_producto — con TODO lo que esté después del "?" (parámetros utm/ref_code de seguimiento). NUNCA acortes el link ni le quites esos parámetros.
- PRECIO + ITBMS: los precios son SIN ITBMS. Muestra SIEMPRE el precio, el ITBMS (7%) y el total usando EXACTAMENTE los valores que devuelve la tool (precio_usd, itbms_7pct, total_con_itbms). Formato: "*$116.00 + ITBMS (7%) = $124.12*". NUNCA calcules el impuesto de memoria.
- STOCK / CANTIDAD: indica la disponibilidad usando el campo "stock" que devuelve la tool, TAL CUAL. Si dice "X unidades", dilo; si dice "stock bajo — un asesor verifica…", dilo así. NUNCA inventes ni adivines una cantidad: di solo lo que aparezca en ese campo "stock".
- Si la tool no encuentra el producto, o piden algo fuera de catálogo: discúlpate breve e indica que un asesor confirmará disponibilidad y opciones.

BÚSQUEDA DE PRODUCTOS (cómo usar buscar_producto)
- Convierte lo que pide el cliente en términos CONCISOS. Quita relleno ("¿venden?", "tienen", "necesito", "para") y conserva la MARCA y sobre todo el MODELO — el número/código de modelo es la señal más fuerte. Ej.: "¿venden tinta para mi Canon Pixma G2170?" → busca "tinta G2170".
- NO INVENTES LA MARCA: si el cliente da solo un modelo sin decir la marca (ej. "140XL", "141XL", "PT-H110", "TK-8337"), busca por el MODELO SOLO; no le pongas una marca que no mencionó. Una marca equivocada hace que NO encuentres un producto que SÍ existe (caso real: la 140XL/141XL es Canon —PG-140XL/CL-141XL—, no HP). Agrega la marca únicamente si el cliente la dio o el contexto la deja clara.
- Un mismo producto se nombra de varias formas: "Canon" ↔ línea "Pixma"; "Epson" ↔ "EcoTank"/"WorkForce"; "HP" ↔ "DeskJet/LaserJet/OfficeJet". Para "tinta para [impresora]", busca por el modelo de la impresora (la tinta suele indicar los modelos compatibles) y, si hace falta, por el modelo de la tinta.
- Si la primera búsqueda no encuentra, REFORMULA y vuelve a llamar buscar_producto (prueba solo el número de modelo, la línea, o el modelo de la tinta) ANTES de derivar.
- Preguntas genéricas de categoría ("¿venden impresoras Epson?", "¿manejan toner?"): busca la categoría/marca y responde sí/no con 1-2 ejemplos concretos y su precio; invita a indicar el modelo. No listes más de 2-3.
- COMPATIBILIDAD: NO afirmes que un producto sirve para cierto equipo a menos que el resultado de buscar_producto lo indique. Si no estás seguro, dilo y deja que un asesor confirme.
- MODELO EXACTO: usa el TÍTULO tal cual lo devuelve buscar_producto. Si el modelo que pidió el cliente NO aparece en el título del resultado, NO lo renombres ni asumas que es el mismo equipo: dilo claro (ej. "no encontré el [modelo] exacto; lo más parecido que tenemos es [título real]…") y ofrécelo como alternativa o deriva. NUNCA pongas el modelo pedido junto al precio o link de otro producto.

VENTA CONSULTIVA — ayuda a elegir bien (sin inventar)
- No solo respondas: ayuda a comprar bien, como un buen asesor. Si el cliente no sabe qué llevar o pide una recomendación, haz 1-2 preguntas cortas antes de sugerir (¿para casa, oficina o empresa?, ¿cuánto imprime al mes?, ¿color/WiFi/escáner?, ¿presupuesto?).
- Adapta la profundidad a quién escribe: hogar → algo simple y económico; oficina/empresa → velocidad, rendimiento y costo por página; técnico/revendedor → directo al modelo/referencia.
- Recomienda por NECESIDAD y costo total, no solo por el precio más bajo. Pero TODO modelo, precio o disponibilidad que menciones DEBE venir de buscar_producto en este mismo turno (nunca de memoria): primero pregunta lo justo, luego busca, luego sugiere con lo que devuelva la tool.
- Trabajamos sobre todo productos ORIGINALES (HP, Epson, Canon, Brother…) según disponibilidad; si preguntan original vs genérico, dilo así y confirma el modelo exacto.
- La web es apoyo, no un descarte: puedes invitar a comprar en quickservicepanama.com, pero ayuda primero a ubicar el producto o aclarar la duda.
- Empresa que pide cotización formal, factura, crédito o volumen: ayúdala con precio/disponibilidad (buscar_producto) y pásala con un asesor para la cotización o la factura; NO pidas RUC ni datos de factura tú mismo.

CAPTURA DE DATOS (nombre, apellido, correo y empresa) — pasiva, sin insistir
- Cuando el cliente muestra intención de COTIZAR o comprar algo concreto (o en un momento natural), y no los tenemos, pide con naturalidad su correo y su nombre y apellido: p.ej. "Para enviarte la cotización, ¿a qué correo te la mandamos y cuál es tu nombre y apellido?".
- Detecta o pregunta si es para uso PERSONAL o para una EMPRESA; si es empresa, pide el nombre de la empresa (informal).
- Cuando tengas CUALQUIERA de esos datos (correo, nombre, apellido, empresa), llama a guardar_lead con lo que tengas (puedes llamarla varias veces a medida que el cliente los da). Si guardar_lead dice que el correo es inválido, pide que lo confirme UNA sola vez.
- Es PASIVO, no un formulario: si el cliente lo ignora, lo rechaza o sigue con otra cosa, NO insistas — seguí ayudando normal. Si ya lo pediste en esta conversación y no lo dio, no lo vuelvas a pedir. Si el CONTEXTO indica que ya tenemos un dato, no lo pidas de nuevo.
- El nombre y apellido SÍ se pueden pedir (no son datos fiscales). Pero NUNCA pidas RUC, cédula, DV ni datos de factura (eso lo maneja un asesor). Para una cotización formal de empresa, junta lo liviano (nombre/correo/empresa) y deriva el resto a un asesor.

CONTACTO NUEVO vs CONOCIDO
- Si es la PRIMERA interacción de este contacto: da una bienvenida cálida y breve, preséntate como Quick Service Panamá (suministros de impresión y tecnología) y pregunta en qué le puedes ayudar. Una sola vez, sin repetirla.
- Si ya es un contacto conocido o la conversación venía andando: ve directo al grano, sin repetir la presentación ni el saludo de bienvenida.

REGLA ANTI-INTERRUPCIÓN — no te metas si hay un humano atendiendo
- Si la conversación parece estar siendo atendida por una persona del equipo, ABSTÉNTE de responder y deriva a un asesor (handoff). Señales típicas:
  - el cliente responde a algo que TÚ no dijiste (continúa otro hilo);
  - entrega datos sueltos de un trámite: correo, cédula/RUC, nombre para factura, un monto, comprobante o "le adjunto el pago", instrucciones de retiro/entrega ("el chico va en camino", "que retire X"), confirmaciones tipo "paso el lunes";
  - pregunta por una cotización, pedido o pago YA en curso.
- Ante la duda, NO interrumpas: es mejor que un humano siga la venta a que tú la cortes. Mensajes sueltos de cierre ("ok", "gracias", "listo", "recibido") no requieren respuesta tuya salvo que claramente te estén preguntando algo.
- NUNCA captures, repitas ni confirmes datos fiscales, de facturación o de pago (RUC, cédula, razón social, "factura a nombre de", comprobantes, transferencias). Si el cliente los envía, NO los proceses: indica en UNA línea que un asesor se encarga y no pidas más datos.

LOGÍSTICA, PAGOS Y DATOS DE LA TIENDA (envíos, ubicación, horarios, métodos de pago)
- Para envíos/entregas, ubicación, horarios o métodos de pago usa SIEMPRE la herramienta info_tienda y responde SOLO con lo que devuelva. No respondas estos temas de memoria.
- NUNCA inventes montos, direcciones, horarios ni formas de pago, y NUNCA compartas números de cuenta (Yappy/ACH/transferencia). Para "cómo pago", responde con lo que devuelva info_tienda y deja la coordinación a un asesor.
- Si info_tienda no tiene el dato (devuelve "sin datos disponibles"): dilo con honestidad y deriva a un asesor para confirmarlo. No prometas plazos ni costos específicos.

SOPORTE TÉCNICO Y REPARACIONES
- QSP NO ofrece soporte técnico ni servicios de reparación. Si preguntan por reparar/arreglar un equipo, soporte técnico, o que algo "no enciende/no imprime", usa info_tienda y sugiere la empresa de la marca correspondiente que ahí figure; NUNCA inventes teléfonos ni empresas, y si no hay dato, deriva a un asesor.

IMÁGENES (el cliente envía una foto o captura)
- Si te llega una imagen, OBSÉRVALA y actúa según lo que muestre:
  - PRODUCTO (captura de nuestro ecommerce o de Instagram, foto de un toner, tinta, impresora o su caja): identifica la MARCA y el MODELO visibles y úsalos para llamar buscar_producto. NUNCA des un precio "leído" de la imagen ni inventes el modelo — el precio y la disponibilidad SIEMPRE salen de buscar_producto. Si no logras leer el modelo con claridad, descríbelo en una línea y pide que confirme el modelo, o deriva a un asesor.
  - COMPROBANTE DE PAGO, transferencia, factura, RUC/cédula o cualquier dato fiscal: NO lo proceses ni repitas datos; di en UNA línea que un asesor lo revisa (anti-interrupción).
  - Si no entiendes la imagen o no es de la tienda: discúlpate breve y deriva a un asesor.

HANDOFF A HUMANO (deriva con calma y sin prometer de más)
- Deriva a un asesor cuando: la tool no encuentra el producto; piden algo fuera de catálogo; quieren reclamar o están molestos; piden hablar con una persona; detectas un trámite/pago en curso (ver anti-interrupción); o la consulta excede lo que puedes resolver. Discúlpate breve e indica que un asesor le responderá pronto.

LÍMITES
- No des asesoría legal ni médica. No hables de temas ajenos a la tienda.`;

// v31 — MODO ASISTENCIA (handoff-assist): se ANEXA al SYSTEM_PROMPT cuando un asesor humano tiene la
// conversación pero lleva un rato sin responder y el cliente preguntó algo básico. El bot adelanta SOLO
// información general de la tienda (info_tienda) y NADA más — no retoma la venta ni pisa al asesor.
const ASSIST_SUFFIX = `

MODO ASISTENCIA — un asesor humano está atendiendo este chat
Un compañero del equipo tiene esta conversación, pero lleva un rato sin responder y el cliente acaba de preguntar algo. Para no dejarlo esperando, adelanta ÚNICAMENTE información general de la tienda y nada más:
- Responde SOLO si es una pregunta de: ubicación, horario, formas de pago que aceptamos, envíos/entregas o política de devoluciones/garantía. Usa info_tienda y responde breve (1-2 oraciones) con lo que devuelva.
- Sé deferente: deja claro que un asesor sigue con su caso. Ej.: "Mientras tanto te confirmo: [dato]. Un asesor continúa con tu solicitud enseguida."
- NO retomes la venta, NO des precios/stock ni busques productos, NO pidas ni guardes datos, NO confirmes pagos/pedidos, NO cierres nada: de eso se encarga el asesor.
- Si la pregunta NO es de esa información general, o toca un pago/cotización/factura/reclamo o el caso puntual que lleva el asesor, NO escribas nada (deja la respuesta vacía): que lo siga el humano.`;

const TOOLS: Anthropic.Tool[] = [{
  name: "buscar_producto",
  description: "Busca productos en el catálogo de Quick Service Panamá (Shopify). Llámala SIEMPRE que el cliente pregunte precio, disponibilidad/stock, compatibilidad, o mencione/insinúe un producto, marca o categoría (tinta, toner, impresora Epson/Canon/HP, etc.). Pasa términos CONCISOS: marca + MODELO (el número de modelo es la mejor señal); para 'tinta para [impresora]' busca por el modelo de la impresora. Puedes llamarla varias veces reformulando si no encuentras. Devuelve título, precio (precio_usd SIN ITBMS + itbms_7pct + total_con_itbms), stock (disponibilidad ya resuelta: muestra el número si hay >3, si no deriva a un asesor), marca, tipo y link (máx 5).",
  strict: true,
  input_schema: { type: "object", properties: { consulta: { type: "string", description: "Términos de búsqueda, ej: 'tinta hp 954 negra'" } }, required: ["consulta"], additionalProperties: false },
} as Anthropic.Tool, {
  name: "info_tienda",
  description: "Devuelve los datos oficiales de la tienda QSP (envíos/entregas, métodos de pago, ubicación, horarios, devoluciones, contacto) como pares clave→valor. Llama esta herramienta SIEMPRE que pregunten por esos temas y responde SOLO con lo que devuelva; NUNCA inventes montos, direcciones, cuentas ni horarios, y NUNCA compartas números de cuenta.",
  input_schema: { type: "object", properties: { tema: { type: "string", description: "Opcional e informativo: el tema preguntado (envío, pago, ubicación, horario…). La herramienta devuelve TODOS los datos de la tienda." } } },
} as Anthropic.Tool, {
  name: "guardar_lead",
  description: "Guarda los datos de contacto del cliente en WATI para que un asesor cotice más rápido y para enriquecer el CRM. Llámala cuando el cliente te dé alguno de estos datos (correo, nombre, apellido y/o empresa), normalmente cuando hay intención de cotizar o comprar. Pasa SOLO los datos que el cliente realmente dio (puedes llamarla varias veces a medida que los da). NO la uses para RUC/cédula/datos de factura (eso lo maneja un asesor). El número de WhatsApp se toma solo.",
  input_schema: { type: "object", properties: { email: { type: "string", description: "Correo electrónico del cliente, ej: juan@empresa.com" }, nombre: { type: "string", description: "Nombre (de pila) del cliente" }, apellido: { type: "string", description: "Apellido del cliente" }, empresa: { type: "string", description: "Nombre de la empresa (solo si la compra es para una empresa)" } } },
} as Anthropic.Tool];

const HANDOFF_RE = /\b(humano|persona|asesor|agente|reclamo|queja|devoluci[oó]n|garant[ií]a|hablar con alguien|supervisor)\b/i;

// Anti-interrupción (guardrail PRE-LLM): señales de un trámite/pago/dato fiscal EN CURSO
// (típicamente atendido por un humano). Si el texto entrante matchea, el bot se ABSTIENE
// (no llama al LLM, solo loggea). Sesgo deliberado: mejor callar que cortar una venta humana.
// Evita matchear preguntas legítimas ("¿aceptan yappy?", "¿dónde retiro?") — esas las
// resuelve info_tienda.
const INTERRUPT_RE = new RegExp([
  // datos fiscales / facturación
  "\\bruc\\b", "\\bdv\\b", "c[eé]dula", "raz[oó]n social", "factura a nombre", "facturar a", "datos (de|para) (la )?factura", "a nombre de",
  "\\b\\d{1,4}-\\d{2,4}-\\d{4,7}\\b", // RUC/cédula PA (ej. 557-538-101617); no matchea fechas (último grupo >=4 dígitos)
  // pago/comprobante EN CURSO (no "¿aceptan X?")
  "le adjunto", "adjunto (el|la|mi) ?(pago|comprobante|transferencia|recibo)", "comprobante", "ya (le |te )?(hice|mand[eé]|envi[eé]|pagu[eé])", "dep[oó]sit",
  // entrega/retiro EN CURSO
  "mensajer[oa]", "el chico", "va en camino", "que retir", "va a retirar", "pas(o|a|ar[eé]) (el |la )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|mañana|hoy)",
].join("|"), "i");

// Mensajes que piden datos de catálogo o de la tienda → forzar uso de tool (tool_choice:"any").
// Haiku a veces responde "de memoria" en preguntas genéricas; esto lo obliga a buscar/consultar.
// No incluye saludos/acks (esos no fuerzan tool). garantía/devolución las intercepta HANDOFF_RE.
const NEEDS_TOOL_RE = new RegExp([
  "impresor", "multifuncional", "\\btinta", "t[oó]ner", "toner", "cartuch", "consumible", "\\bpapel", "resma",
  "precio", "cu[aá]nto", "cuesta", "cotiza", "disponib", "stock", "existenc", "\\bmodelo", "\\bvende", "manejan",
  "epson", "canon", "\\bhp\\b", "brother", "pixma", "ecotank", "workforce", "laserjet", "deskjet", "officejet", "\\bg\\d{3,4}\\b", "\\bl\\d{3,4}\\b", "gi-?\\d",
  "env[ií]o", "entrega", "delivery", "horario", "ubicaci", "direcci", "\\bd[oó]nde\\b", "\\bpago", "pagar", "yappy", "\\bach\\b", "transferen", "tarjeta", "reembols",
  "repar", "soporte t[eé]cnico", "averi", "da[ñn]ad", "no enciende", "no prende", "no imprime", "sucursal", "recoger", "retir",
  // v25: catálogo completo (no solo impresión) → fuerza la búsqueda antes de negar.
  "monitor", "pantalla", "esc[aá]ner", "escaner", "scanner", "\\bups\\b", "bater[ií]a", "estabilizador", "regulador", "no.?break",
  "laptop", "port[aá]til", "computador", "comput", "\\bpc\\b", "all.?in.?one", "mouse", "rat[oó]n", "teclado", "webcam", "c[aá]mara",
  "\\bcable", "\\bhdmi\\b", "\\bvga\\b", "\\busb\\b", "adaptador", "disco", "\\bssd\\b", "\\bhdd\\b", "almacenamiento", "memoria", "\\bram\\b", "pendrive",
  "router", "\\bswitch\\b", "access.?point", "\\bwifi\\b", "audifon", "auricular", "parlante", "bocina", "proyector", "accesori", "perif[eé]ric", "tecnolog", "suministr",
  "dell", "lenovo", "\\bjbl\\b", "xtech", "alliance", "tablet",
].join("|"), "i");

// v31 — pregunta BÁSICA de tienda que el bot SÍ puede adelantar mientras un asesor está ausente
// (handoff-assist): ubicación, horario, formas de pago que aceptamos, envíos/entregas y política de
// devoluciones — todo lo que vive en store_facts (lo responde info_tienda). Deliberadamente NO incluye
// precios/productos (eso es retomar la venta del humano) ni nada transaccional/fiscal (lo bloquea
// INTERRUPT_RE, que se evalúa antes). "garantía/devolución" caen aquí a propósito (política general);
// el caso puntual lo sigue el asesor.
const BASIC_INFO_RE = new RegExp([
  // ubicación / cómo llegar
  "ubicaci", "direcci", "\\bd[oó]nde\\b", "\\bqueda", "ubicad", "c[oó]mo llego", "\\bmapa\\b", "\\bwaze\\b", "google maps", "local\\b", "tienda f[ií]sica",
  // horario
  "horario", "a qu[eé] hora", "\\bhasta qu[eé] hora", "\\babren\\b", "\\bcierran\\b", "abiert", "cerrad", "atienden", "\\bd[ií]as\\b",
  // formas de pago (métodos que aceptamos; NO pago en curso — eso lo filtra INTERRUPT_RE)
  "formas? de pago", "m[eé]todos? de pago", "c[oó]mo (puedo )?pago", "c[oó]mo pagar", "aceptan", "\\byappy\\b", "\\bach\\b", "tarjeta", "efectivo", "transferen", "cuotas?",
  // envíos / entregas / recogida
  "env[ií]o", "env[ií]an", "entrega", "delivery", "despach", "mandan", "\\bllega", "interior", "provincia", "recoger", "recojo", "\\bretir", "sucursal", "pickup", "domicilio", "uber\\b",
  // devoluciones / garantía (política general)
  "devoluci", "devolver", "garant[ií]a", "\\bcambio\\b", "cambiar", "reembols",
].join("|"), "i");
// resultados; lanza solo ante error de red/HTTP (lo maneja buscarProducto).
// v34: se agrega `tag` a resources[options][fields] para que la búsqueda predictiva ALCANCE los tags de
// compatibilidad (las impresoras compatibles se guardan ahí como "Canon PIXMA MG2110", "Kyocera TASKalfa
// 3253ci"…). El default solo busca title/product_type/variants.title/vendor → por eso "3253ci" no hallaba
// el tóner TK-8337 aunque está tagueado. Probado contra la tienda: SIN tag → vacío; CON tag → los 4 TK-8337.
async function suggestShopify(q: string): Promise<any[]> {
  const u = `${STORE}/search/suggest.json?q=${encodeURIComponent(q)}&resources%5Btype%5D=product&resources%5Blimit%5D=5&resources%5Boptions%5D%5Bunavailable_products%5D=show&resources%5Boptions%5D%5Bfields%5D=title,product_type,variants.title,vendor,tag`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`tienda respondió ${r.status}`);
  const j = await r.json();
  return (j?.resources?.results?.products ?? []).map((p: any) => ({
    id: p.id,
    titulo: p.title,
    precio_usd: p.price,
    disponible: p.available === true,
    marca: p.vendor || undefined,
    tipo: p.product_type || p.type || undefined,
    url: p.url?.startsWith("http") ? p.url : `${STORE}${p.url ?? ""}`,
  }));
}

// Extrae códigos/números de modelo (la señal más fuerte para hallar el producto correcto pese a
// sinónimos/alias): G2170, L3250, GI-11, TS3450, 954, 664, 140XL, 141XL, 3253ci, PT-H110...
// v33: el regex viejo exigía que el código EMPEZARA con letras y que un número suelto no tuviera
// sufijo → perdía los que empiezan con dígito + letras (140XL, 3253ci) y partía mal los de varios
// segmentos con guion (PT-H110 → agarraba solo "H110"). Ahora: cualquier token alfanumérico (con
// guiones internos) que tenga al menos un dígito y largo >=3 es candidato a código de modelo.
function modelosEn(q: string): string[] {
  const t = new Set<string>();
  for (const m of q.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)*/gi)) {
    const tok = m[0];
    if (/[0-9]/.test(tok) && tok.length >= 3) t.add(tok);
  }
  return [...t].slice(0, 4);
}

// Variantes de un código de modelo para tolerar el guion: Shopify no matchea "TN830XL" contra
// "TN-830XL", ni "PT-H110" contra "PTH110" (caso real: la etiquetadora está indexada como "pth110").
// Probamos la forma original, la SIN guiones y una con guion en la frontera letras→dígitos — en código,
// sin depender de que el modelo adivine el guion. (v18, ampliado en v33 a códigos multi-segmento)
function variantesModelo(m: string): string[] {
  const v = new Set<string>([m]);
  const sin = m.replace(/-/g, "");                       // PT-H110 -> PTH110 ; TN-830XL -> TN830XL
  v.add(sin);
  v.add(sin.replace(/^([a-z]+)(\d)/i, "$1-$2"));         // TN830XL -> TN-830XL ; PTH110 -> PTH-110
  return [...v];
}

// v21 — ITBMS (7%) calculado en CÓDIGO para no depender de la aritmética del LLM. El precio de
// Shopify es SIN impuesto; devolvemos precio base, el ITBMS y el total (todo string, 2 decimales).
function conItbms(precio: any): { precio_usd: string; itbms_7pct: string; total_con_itbms: string } {
  const n = parseFloat(String(precio ?? "").replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return { precio_usd: String(precio ?? ""), itbms_7pct: "", total_con_itbms: "" };
  return { precio_usd: n.toFixed(2), itbms_7pct: (n * 0.07).toFixed(2), total_con_itbms: (n * 1.07).toFixed(2) };
}

// v21 — inventario real desde Shopify Admin (totalInventory por producto, UNA llamada para todos
// los ids). Requiere SHOPIFY_ADMIN_TOKEN + SHOPIFY_ADMIN_API_BASE. Best-effort: si no está
// configurado o falla, devuelve {} y el bot dirá "un asesor confirma la cantidad" (nunca inventa).
async function inventarioShopify(ids: (string | number)[]): Promise<Record<string, number>> {
  if (!SHOPIFY_ADMIN_TOKEN || !SHOPIFY_ADMIN_API_BASE || !ids.length) return {};
  try {
    const gids = ids.map((id) => `gid://shopify/Product/${String(id).replace(/\D/g, "")}`).filter((g) => /\d/.test(g));
    if (!gids.length) return {};
    const query = "query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id totalInventory } } }";
    const r = await fetch(`${SHOPIFY_ADMIN_API_BASE}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN },
      body: JSON.stringify({ query, variables: { ids: gids } }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return {};
    const j = await r.json();
    const out: Record<string, number> = {};
    for (const n of (j?.data?.nodes ?? [])) {
      if (n?.id && typeof n.totalInventory === "number") out[String(n.id).replace(/\D/g, "")] = n.totalInventory;
    }
    return out;
  } catch { return {}; }
}

// v21 — texto de stock LISTO para el bot (determinista). >3: muestra el número; 1-3: deriva sin
// exponer el número; 0/desconocido pero disponible: deriva (puede ser sin seguimiento de stock);
// no disponible: sin stock. Así el bot nunca ve ni inventa una cantidad que no deba decir.
function stockTexto(disponible: boolean, cantidad: number | undefined): string {
  if (typeof cantidad === "number" && cantidad >= 4) return `${cantidad} unidades disponibles`;
  if (typeof cantidad === "number" && cantidad >= 1) return "stock bajo — un asesor verifica el inventario físico para confirmar la cantidad exacta";
  if (disponible) return "un asesor verifica el inventario físico para confirmar la cantidad exacta";
  return "sin stock — un asesor verifica el inventario físico";
}

// v28 — genera un ref_code (8 alfanuméricos, opaco, crypto) para el stitching WhatsApp→web. El PK de
// ref_codes garantiza unicidad; nunca emitimos un code que no se haya guardado.
function generarRefCode(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  let s = ""; for (let i = 0; i < 8; i++) s += abc[b[i] % 62];
  return s;
}
function handleDeUrl(u: string): string | null {
  const m = String(u ?? "").match(/\/products\/([^/?#]+)/);
  return m ? m[1] : null;
}
function apexize(u: string): string {
  return String(u ?? "").replace(/^https?:\/\/(www\.)?quickservicepanama\.com/i, STORE_APEX);
}

// v28 — pasa las URLs de Shopify a apex y, si hay waId, les agrega UTMs + ref_code, guardando el
// mapeo {ref_code → wa_id, handle} en ref_codes (best-effort, batch). Si no se puede guardar (o falta
// waId/handle), devuelve la URL apex con UTMs pero SIN ref_code (nunca emitir un code sin mapeo).
async function urlsConRef(rawUrls: string[], waId: string): Promise<string[]> {
  const UTM = "utm_source=whatsapp&utm_medium=chatbot&utm_campaign=copilot-wati";
  const filas = rawUrls.map((u) => {
    const handle = handleDeUrl(u);
    const apex = handle ? `${STORE_APEX}/products/${handle}` : apexize(u);
    const ref = (waId && handle) ? generarRefCode() : null;
    return { apex, handle, ref };
  });
  const aInsertar = filas.filter((f) => f.ref).map((f) => ({ ref_code: f.ref as string, wa_id: waId, producto_handle: f.handle }));
  const guardados = new Set<string>();
  if (aInsertar.length) {
    try {
      const { error } = await sb.from("ref_codes").insert(aInsertar);
      if (error) await log("ref_code_insert_error", false, { waId, error: error.message });
      else for (const r of aInsertar) guardados.add(r.ref_code);
    } catch (e) { await log("ref_code_insert_error", false, { waId, error: String(e).slice(0, 120) }); }
  }
  return filas.map((f) => {
    const sep = f.apex.includes("?") ? "&" : "?";
    return (f.ref && guardados.has(f.ref)) ? `${f.apex}${sep}${UTM}&ref_code=${f.ref}` : `${f.apex}${sep}${UTM}`;
  });
}

async function buscarProducto(consulta: string, waId: string = "", linksTracked?: Record<string, string>): Promise<string> {
  // Consulta libre tal cual; si no encuentra, reintenta por código de modelo y sus variantes
  // con/sin guion. Deduplica para no repetir llamadas. (v18)
  const intentos = [consulta, ...modelosEn(consulta).flatMap(variantesModelo)];
  const vistos = new Set<string>();
  let lastErr: string | null = null;
  for (const q of intentos) {
    const k = q.trim().toLowerCase();
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    try {
      const prods = await suggestShopify(q);
      if (prods.length) {
        const top = prods.slice(0, 5);
        // v21: enriquece con ITBMS (cálculo en código) y stock real (Shopify Admin, best-effort).
        const inv = await inventarioShopify(top.map((p) => p.id).filter(Boolean));
        // v28: tracking — URL apex + UTMs + ref_code (guarda el mapeo para el stitch WhatsApp→web).
        const urls = await urlsConRef(top.map((p) => p.url), waId);
        // v29: registra handle → URL con tracking, para re-aplicarla si el modelo "limpia" el link.
        if (linksTracked) top.forEach((p, i) => { const h = handleDeUrl(p.url); if (h) linksTracked[h.toLowerCase()] = urls[i]; });
        const enriquecidos = top.map((p, i) => {
          const precio = conItbms(p.precio_usd);
          const cant = inv[String(p.id ?? "").replace(/\D/g, "")];
          return {
            titulo: p.titulo,
            precio_usd: precio.precio_usd,
            itbms_7pct: precio.itbms_7pct,
            total_con_itbms: precio.total_con_itbms,
            stock: stockTexto(p.disponible, cant),
            marca: p.marca,
            tipo: p.tipo,
            url: urls[i],
          };
        });
        return JSON.stringify(enriquecidos);
      }
    } catch (e) { lastErr = String(e).slice(0, 120); }
  }
  if (lastErr) return JSON.stringify({ error: lastErr });
  return JSON.stringify({ resultado: "sin coincidencias en el catálogo" });
}

// Fase 1.5 — datos de tienda desde una fuente única (tabla store_facts, espejo del
// metaobjeto Shopify store_facts/datos-tienda). Devuelve TODOS los pares key→value con
// valor; omite vacíos. Si no hay datos, el bot deriva a un asesor.
async function infoTienda(): Promise<string> {
  try {
    const { data, error } = await sb.from("store_facts").select("key,value").not("value", "is", null).neq("value", "");
    if (error) return JSON.stringify({ error: `store_facts: ${error.message}` });
    const facts: Record<string, string> = {};
    for (const f of (data ?? []) as { key: string; value: string }[]) facts[f.key] = f.value;
    return JSON.stringify(Object.keys(facts).length ? facts : { resultado: "sin datos disponibles; deriva a un asesor" });
  } catch (e) { return JSON.stringify({ error: String(e).slice(0, 200) }); }
}

async function responderLLM(history: { role: string; content: string; model?: string | null; created_at?: string | null }[], forceTool: boolean, imagen?: { b64: string; mediaType: string } | null, imagenFallo?: boolean, waId: string = "", atributos: Record<string, string> = {}, linksTracked: Record<string, string> = {}, modoAsistencia: boolean = false): Promise<{ text: string | null; toolCalls: unknown[]; tokensIn: number; tokensOut: number }> {
  if (!anthropic) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0 };
  // La API exige que el primer mensaje sea del usuario: descarta "assistant" al inicio
  // (puede pasar si un asesor escribió primero).
  const hist = [...history];
  while (hist.length && hist[0].role === "assistant") hist.shift();
  const esNuevo = hist.length <= 1;
  const ctx = esNuevo
    ? "\n\nCONTEXTO INTERNO: Es la PRIMERA interacción registrada de este contacto (aplica bienvenida + presentación una sola vez)."
    : "\n\nCONTEXTO INTERNO: Contacto con conversación ya en curso (NO repitas bienvenida ni presentación; ve al grano).";
  // v22 — conciencia de horario: si estamos fuera del horario de atención, el bot sigue ayudando
  // con lo automático pero aclara cuándo responde un asesor (sin prometer respuesta humana inmediata).
  const ahoraMs = Date.now();
  const hh = horarioPanama();
  const ctxHorario = hh.dentro ? "" :
    `\n\nCONTEXTO HORARIO: Ahora es ${DIAS_SEM[hh.dia]} ~${hh.hora}:00 en Panamá, FUERA del horario de atención de QSP (atención por WhatsApp y tienda: Lun-Vie 9:00am–5:00pm; sábados y domingos cerrado). Seguí ayudando con lo automático (precio/ITBMS, stock, info de tienda). Pero si el cliente necesita un asesor, una cotización formal o coordinar pago/entrega, aclará con calma que un asesor le responde en el próximo horario hábil (deducí cuál según el día y la hora actuales) y NO prometas respuesta humana inmediata.`;
  // v32 — conciencia temporal SIEMPRE (no solo fuera de horario): el bot sabe la fecha/hora actual y que
  // el historial viene marcado con cuándo se dijo cada cosa, para no arrastrar el "ayer" al "hoy".
  const paNow = new Date(ahoraMs - 5 * 3600 * 1000);
  const ctxAhora = `\n\nCONTEXTO TEMPORAL: Ahora es ${DIAS_SEM[paNow.getUTCDay()]} ${paNow.getUTCDate()}/${paNow.getUTCMonth() + 1}/${paNow.getUTCFullYear()}, ${horaPa12(paNow.getUTCHours(), paNow.getUTCMinutes())} (hora de Panamá). En el historial, cada mensaje anterior viene marcado entre corchetes con cuándo se envió ([hoy …], [ayer …], [fecha …]); es una marca INTERNA, NUNCA la copies en tu respuesta. Trata los mensajes de días anteriores como contexto PASADO: no continúes ni repitas planes o promesas relativos al tiempo de mensajes viejos. Si AYER el cliente dijo "mañana paso", ese "mañana" es HOY. Un saludo nuevo ("buenas") después de un corte de día es una visita nueva: ubícate en el momento actual, no en la conversación anterior.`;
  // v25/v27 — qué datos ya tenemos del cliente (de los atributos de WATI) para no repreguntar.
  const datosTen = [
    atributos.email ? "correo" : null,
    (atributos.nombre || atributos.apellido) ? "nombre/apellido" : null,
    atributos.empresa ? `empresa (${atributos.empresa})` : null,
  ].filter(Boolean);
  const ctxDatos = datosTen.length
    ? `\n\nCONTEXTO DATOS: De este cliente ya tenemos: ${datosTen.join(", ")}. NO pidas de nuevo lo que ya tengamos (si acaso, confírmalo); pide solo lo que falte.`
    : `\n\nCONTEXTO DATOS: No tenemos datos de contacto de este cliente. Si hay intención de cotizar/comprar, puedes pedir (pasivo, sin insistir) su correo y nombre/apellido y guardarlos con guardar_lead.`;
  // v31 — en MODO ASISTENCIA se anexa ASSIST_SUFFIX (info general, no retomar la venta) en vez del
  // contexto de captura de datos (que invita a pedir correo — no aplica si el humano está a cargo).
  const system = SYSTEM_PROMPT + ctx + ctxAhora + ctxHorario + (modoAsistencia ? ASSIST_SUFFIX : ctxDatos);
  // v31 — en asistencia, la ÚNICA tool disponible es info_tienda (no buscar_producto/guardar_lead):
  // el bot solo puede adelantar datos de tienda, nunca cotizar ni capturar datos del cliente.
  const toolsActivas = modoAsistencia ? TOOLS.filter((t) => t.name === "info_tienda") : TOOLS;
  // Los mensajes de un asesor humano se marcan para que el agente sepa que los dijo una persona.
  // v32: cada mensaje ANTERIOR (no el último/actual) se prefija con [hoy/ayer/fecha] para que el bot
  // ubique el historial en el tiempo. El último (el que se responde ahora) va limpio (es "ahora", y así
  // no interfiere con la extracción del caption de visión).
  const ultIdx = hist.length - 1;
  const messages: Anthropic.MessageParam[] = hist.map((m, idx) => {
    const t = (idx < ultIdx && m.created_at) ? `[${etiquetaTiempo(m.created_at, ahoraMs)}] ` : "";
    const a = m.model === "human-agent" ? "[Asesor del equipo]: " : "";
    return { role: m.role === "assistant" ? "assistant" as const : "user" as const, content: t + a + (m.content || "(vacío)") };
  });
  // v20: la API exige que el ÚLTIMO mensaje sea de usuario; varios modelos no aceptan "prefill"
  // (terminar en assistant). Si el historial termina en assistant (p.ej. un mensaje de asesor que
  // entró último), se descartan los assistant finales para no romper la llamada (error 400).
  while (messages.length && messages[messages.length - 1].role === "assistant") messages.pop();
  if (!messages.length) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0 };
  // v19 (visión): adjunta la imagen del cliente al ÚLTIMO mensaje de usuario (el que la trae).
  if ((imagen || imagenFallo) && messages.length) {
    const last = messages[messages.length - 1];
    if (last.role === "user" && typeof last.content === "string") {
      const cap = (last.content && last.content !== "[imagen]" && last.content !== "(vacío)") ? last.content : "";
      if (imagen) {
        last.content = [
          { type: "image", source: { type: "base64", media_type: imagen.mediaType as any, data: imagen.b64 } },
          { type: "text", text: cap || "El cliente envió esta imagen. Si muestra un producto, identifica marca y modelo y búscalo con buscar_producto." },
        ] as any;
      } else {
        last.content = (cap ? cap + " " : "") + "[Nota interna: el cliente envió una imagen que no se pudo cargar. Pídele el modelo exacto o deriva a un asesor.]";
      }
    }
  }
  const toolCalls: unknown[] = [];
  let tokensIn = 0, tokensOut = 0;
  for (let i = 0; i < 4; i++) {
    // v21: garantía dura — la conversación SIEMPRE termina en mensaje de usuario antes de CADA
    // llamada al modelo (cierra el error 400 "does not support assistant message prefill").
    while (messages.length && messages[messages.length - 1].role === "assistant") messages.pop();
    if (!messages.length) break;
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 1024, system, tools: toolsActivas, messages,
      ...(i === 0 && forceTool ? { tool_choice: { type: "any" as const } } : {}),
    });
    tokensIn += resp.usage.input_tokens; tokensOut += resp.usage.output_tokens;
    if (resp.stop_reason !== "tool_use") {
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return { text: text || null, toolCalls, tokensIn, tokensOut };
    }
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
        const out = block.name === "buscar_producto"
          ? await buscarProducto((block.input as any).consulta ?? "", waId, linksTracked)
          : block.name === "info_tienda"
          ? await infoTienda()
          : block.name === "guardar_lead"
          ? await guardarLead(waId, (block.input as any).email, (block.input as any).empresa, (block.input as any).nombre, (block.input as any).apellido)
          : JSON.stringify({ error: "tool desconocida" });
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: null, toolCalls, tokensIn, tokensOut };
}

// Limpia formato que WhatsApp NO renderiza (si no, se ve literal): links markdown [texto](url) → URL
// pelada, y dobles asteriscos → uno solo. (v16 — estilo)
function limpiarWhatsApp(t: string): string {
  return t
    .replace(new RegExp("\\[([^\\]]*)\\]\\((https?://[^)\\s]+)\\)", "g"), "$2")
    .replace(new RegExp("\\*\\*([^*\\n]+)\\*\\*", "g"), "*$1*");
}

// v29 — re-aplica el tracking a los links de producto que el modelo pudo "limpiar" (sacándole el
// ?utm…&ref_code=). Reemplaza cada URL de producto por la versión con tracking generada este turno
// (links: handle → URL apex+utm+ref_code). Determinista: no depende de que el LLM copie bien la URL.
function reaplicarTracking(texto: string, links: Record<string, string>): string {
  if (!texto || !links || !Object.keys(links).length) return texto;
  return texto.replace(/https?:\/\/(?:www\.)?quickservicepanama\.com\/products\/([a-z0-9-]+)(?:[?#][^\s)]*)?/gi,
    (m, handle) => links[String(handle).toLowerCase()] ?? m);
}

async function enviarWati(waId: string, texto: string): Promise<boolean> {
  if (!WATI_API_TOKEN || !WATI_API_BASE) return false;
  const u = `${WATI_API_BASE}/api/v1/sendSessionMessage/${encodeURIComponent(waId)}?messageText=${encodeURIComponent(texto)}`;
  const r = await fetch(u, { method: "POST", headers: { Authorization: `Bearer ${WATI_API_TOKEN}` }, signal: AbortSignal.timeout(10000) });
  return r.ok;
}

// v25 (captura de lead) — guarda el correo (y empresa) del cliente en los atributos de WATI vía
// updateContactAttributes (mismo endpoint que usamos para sincronizar emails). Valida el formato del
// correo; NO acepta RUC/datos fiscales (la tool no tiene esos campos). El número se toma del contexto,
// no del modelo (evita que invente uno). best-effort: si WATI falla, lo loggea y avisa al modelo.
async function guardarLead(waId: string, email?: string, empresa?: string, nombre?: string, apellido?: string): Promise<string> {
  const e = String(email ?? "").trim();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return JSON.stringify({ ok: false, error: "correo_invalido", nota: "El correo no parece válido; pídele al cliente que lo confirme (una sola vez)." });
  }
  const params: { name: string; value: string }[] = [];
  if (e) params.push({ name: "email", value: e });
  const emp = String(empresa ?? "").trim(); if (emp) params.push({ name: "empresa", value: emp.slice(0, 200) });
  const nom = String(nombre ?? "").trim(); if (nom) params.push({ name: "nombre", value: nom.slice(0, 100) });
  const ape = String(apellido ?? "").trim(); if (ape) params.push({ name: "apellido", value: ape.slice(0, 100) });
  if (!params.length) return JSON.stringify({ ok: false, error: "sin_datos", nota: "No hay datos para guardar (pide al menos el correo o el nombre)." });
  if (!WATI_API_TOKEN || !WATI_API_BASE) {
    await log("lead_capturado", false, { waId, motivo: "wati_no_configurado" });
    return JSON.stringify({ ok: false, error: "wati_no_configurado" });
  }
  try {
    const u = `${WATI_API_BASE}/api/v1/updateContactAttributes/${encodeURIComponent(waId)}`;
    const r = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WATI_API_TOKEN}` },
      body: JSON.stringify({ customParams: params }),
      signal: AbortSignal.timeout(10000),
    });
    await log("lead_capturado", r.ok, { waId, campos: params.map((x) => x.name), email: e || null, wati_status: r.status });
    return JSON.stringify(r.ok ? { ok: true, guardado: params.map((x) => x.name) } : { ok: false, error: `wati_status_${r.status}` });
  } catch (err) {
    await log("lead_capturado", false, { waId, error: String(err).slice(0, 200) });
    return JSON.stringify({ ok: false, error: "fallo_red" });
  }
}

// v25 — lee los atributos custom que ya vienen en el webhook de WATI (best-effort; el shape puede
// variar entre versiones). Sirve para no repreguntar datos que ya tenemos (email/empresa).
function extraerCustomParams(p: any): Record<string, string> {
  const out: Record<string, string> = {};
  const cp = p?.customParams ?? p?.contact?.customParams ?? p?.listMember?.customParams ?? p?.waCustomParams;
  if (Array.isArray(cp)) {
    for (const x of cp) { if (x && x.name != null) out[String(x.name)] = String(x.value ?? ""); }
  }
  return out;
}

// v20 (anti-duplicado): ¿hay un mensaje de cliente MÁS NUEVO que el que estamos respondiendo?
// Si llegan varios en ráfaga, solo el último contesta (evita respuestas dobles/triples).
async function hayMensajeClienteMasNuevo(convId: string, desde: string): Promise<boolean> {
  const { data } = await sb.from("messages").select("id")
    .eq("conversation_id", convId).eq("role", "user").gt("created_at", desde).limit(1);
  return !!(data && data.length);
}

// v19 — descarga una imagen enviada por el cliente desde WATI (el campo `data` del webhook es
// un link de live-mt-server.wati.io que requiere el token) y la devuelve en base64 para pasarla
// a Claude vision. Devuelve null si falla, no es imagen soportada o pesa demasiado.
async function descargarMediaWati(dataUrl: string): Promise<{ b64: string; mediaType: string } | null> {
  if (!dataUrl || !/^https?:\/\//i.test(dataUrl)) return null;
  try {
    const headers: Record<string, string> = WATI_API_TOKEN ? { Authorization: `Bearer ${WATI_API_TOKEN}` } : {};
    const r = await fetch(dataUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > 3_500_000) return null; // evita imágenes enormes (límite de vision)
    // media_type: confía en el content-type si es imagen; si no, infiere por la extensión del fileName.
    let mt = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|gif|webp)$/.test(mt)) {
      mt = /\.png/i.test(dataUrl) ? "image/png"
        : /\.webp/i.test(dataUrl) ? "image/webp"
        : /\.gif/i.test(dataUrl) ? "image/gif"
        : "image/jpeg";
    }
    // base64 por chunks (evita desbordar el call stack con String.fromCharCode(...buf) entero).
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode(...buf.subarray(i, i + CH));
    return { b64: btoa(bin), mediaType: mt };
  } catch { return null; }
}

async function log(action: string, ok: boolean, detail: unknown) {
  try { await sb.from("job_log").insert({ function_name: "copilot-webhook", action, ok, detail }); } catch { /* nunca romper */ }
}

// Corre una tarea DESPUÉS de responder, manteniendo viva la instancia (Supabase
// EdgeRuntime.waitUntil). Si el runtime no expone waitUntil, la tarea igual ya está
// corriendo; su try/catch interno evita que rompa nada.
function correrEnSegundoPlano(p: Promise<unknown>): void {
  try {
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p);
  } catch { /* nunca romper */ }
  void p;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    // v28 — resolución de ref_code para el CDP (stitching WhatsApp→web). Guard: RESOLVE_SECRET.
    const refCode = url.searchParams.get("ref_code");
    if (refCode) {
      // v30 — auth: Authorization: Bearer <RESOLVE_SECRET> (preferido, no deja el secreto en URL/logs)
      // o ?key= (cómodo para probar en el navegador). El CDP usa Bearer.
      const auth = req.headers.get("authorization") ?? "";
      const ok = !!RESOLVE_SECRET && (auth === `Bearer ${RESOLVE_SECRET}` || url.searchParams.get("key") === RESOLVE_SECRET);
      if (!ok) return Response.json({ error: "forbidden" }, { status: 403 });
      if (!/^[A-Za-z0-9]{8}$/.test(refCode)) return Response.json({ error: "ref_code_invalido" }, { status: 400 });
      const { data, error } = await sb.from("ref_codes").select("wa_id,producto_handle,created_at").eq("ref_code", refCode).maybeSingle();
      if (error) return Response.json({ error: "db" }, { status: 500 });
      if (!data) return Response.json({ error: "not_found" }, { status: 404 });
      return Response.json({ wa_id: data.wa_id, producto_handle: data.producto_handle, ts: data.created_at });
    }
    return Response.json({ status: "ok", function: "copilot-webhook", version: "v34-busqueda-tags", mode: MODE, mode_raw: MODE_RAW, model: MODEL, llm_configured: !!anthropic, wati_send_configured: !!(WATI_API_TOKEN && WATI_API_BASE), inventario_configurado: !!(SHOPIFY_ADMIN_TOKEN && SHOPIFY_ADMIN_API_BASE), resolve_configured: !!RESOLVE_SECRET, handoff_assist_min: HANDOFF_ASSIST_MIN, handoff_cold_hours: HANDOFF_COLD_HOURS, live_targets: MODE === "live" ? (LIVE_ALL ? "all" : LIVE_ALLOWLIST.length) : 0, ts: new Date().toISOString() });
  }
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (url.searchParams.get("key") !== WEBHOOK_KEY) return Response.json({ error: "forbidden" }, { status: 403 });

  let p: any;
  try { p = await req.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const waId = String(p.waId ?? p.wa_id ?? "").replace(/\D/g, "");
  const texto = (p.text ?? "").toString().trim();
  const esDelNegocio = p.owner === true || p.owner === "true";
  const tipo = (p.type ?? "text").toString();
  const eventType = (p.eventType ?? p.event ?? "").toString().toLowerCase();
  const operador = (p.operatorName ?? p.operatorEmail ?? "").toString().trim(); // asesor que escribió (v15)

  // Evento WATI de contacto nuevo (sin texto): marcar lead nuevo. El texto llega aparte.
  if (eventType.includes("newcontact")) {
    if (waId) {
      await sb.rpc("upsert_conversation", { p_wa_id: waId, p_sender_name: p.senderName ?? null });
      await sb.from("conversations").update({ confirmed_new: true, first_contact_at: new Date().toISOString() }).eq("wa_id", waId).is("first_contact_at", null);
      await log("contacto_nuevo", true, { waId, senderName: p.senderName ?? null, sourceType: p.sourceType ?? null, sourceId: p.sourceId ?? null });
      return Response.json({ ok: true, evento: "new_contact_registrado", waId });
    }
    return Response.json({ ok: true, skipped: "new_contact_sin_waid" });
  }

  // Mensaje del NEGOCIO (owner=true): asesor humano/automático, o el ECO de un envío propio del bot.
  if (esDelNegocio && waId && texto && tipo === "text") {
    const { data: convH } = await sb.from("conversations").select("id,status").eq("wa_id", waId).maybeSingle();
    if (convH?.id) {
      // ¿Eco de un envío propio reciente del bot? (mismo texto, respuesta del bot < 5 min) → ignorar.
      const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: eco } = await sb.from("messages").select("id").eq("conversation_id", convH.id)
        .eq("role", "assistant").neq("model", "human-agent").eq("content", texto).gte("created_at", desde).limit(1);
      if (eco && eco.length) return Response.json({ ok: true, skipped: "eco_propio" });
      // El negocio está atendiendo: guarda el mensaje como contexto y marca la conversación como
      // ATENDIDA POR HUMANO (v15). El bot no la retoma hasta que se devuelva a status='bot'.
      await sb.from("messages").insert({ conversation_id: convH.id, role: "assistant", content: texto.slice(0, 4000), mode: "live", model: "human-agent" });
      if (convH.status !== "handoff") await sb.from("conversations").update({ status: "handoff" }).eq("id", convH.id);
      await log("mensaje_humano", true, { waId, operador: operador || null });
    }
    return Response.json({ ok: true, skipped: "negocio_atendiendo" });
  }

  // v19: una imagen de un CLIENTE (owner=false) SÍ se procesa (visión). El resto de mensajes
  // no-texto (documentos, audio, o imágenes del propio negocio) se registran y se saltan.
  const esImagenCliente = tipo === "image" && !esDelNegocio && !!waId;

  if (!esImagenCliente && (!waId || !texto || tipo !== "text")) {
    // Diagnóstico v18.1: registrar el payload COMPLETO de mensajes no-texto (documentos,
    // audio…) para conocer el shape real de media de WATI. Trunca strings largos.
    const muestra: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(p ?? {})) {
      muestra[k] = typeof val === "string" && val.length > 500 ? val.slice(0, 500) + "…[trunc]" : val;
    }
    await log("evento_sin_texto", true, { tipo, eventType: eventType || null, payload: muestra });
    return Response.json({ ok: true, skipped: "no_es_mensaje_de_cliente" });
  }

  const t0 = Date.now();
  try {
    const { data: convRows, error: convErr } = await sb.rpc("upsert_conversation", { p_wa_id: waId, p_sender_name: p.senderName ?? null });
    if (convErr) throw new Error(`upsert_conversation: ${convErr.message}`);
    const conv = (Array.isArray(convRows) ? convRows[0] : convRows) as { id: string; status: string; turns_today: number };
    if (!conv?.id) throw new Error("upsert_conversation devolvió vacío");

    const watiMsgId = (p.id ?? p.whatsappMessageId ?? null)?.toString() ?? null;
    // Para una imagen el caption va en `texto`; si no hay caption, se guarda un marcador.
    const contenido = esImagenCliente ? (texto || "[imagen]") : texto;
    const ins = await sb.from("messages").insert({ conversation_id: conv.id, role: "user", content: contenido.slice(0, 4000), mode: MODE, wati_message_id: watiMsgId }).select("id,created_at");
    if (ins.error) {
      if (ins.error.code === "23505") return Response.json({ ok: true, skipped: "duplicado" });
      throw new Error(`insert user msg: ${ins.error.message}`);
    }
    const userCreatedAt = (ins.data?.[0] as any)?.created_at ?? new Date().toISOString(); // v20: ancla para anti-duplicado

    // v31 — CICLO DE VIDA DEL HANDOFF. Hasta v30, status='handoff' = el bot se callaba para siempre
    // (hasta devolverlo a 'bot' a mano). Ahora, REACTIVO (lo gatilla ESTE mensaje del cliente), el bot
    // puede ayudar sin pisar al humano. El reloj = último mensaje del asesor (model='human-agent'):
    //  · COLD-RETURN (>HANDOFF_COLD_HOURS sin que el asesor escriba, y el mensaje NO es trámite/fiscal):
    //    la atención humana quedó fría → el bot RETOMA todo (status→'bot') y cae al flujo normal.
    //  · ASISTENCIA (>=HANDOFF_ASSIST_MIN min sin asesor) + pregunta BÁSICA de tienda (no INTERRUPT):
    //    adelanta SOLO esa info (info_tienda), deferente; la conversación SIGUE en 'handoff'.
    //  · si no aplica (asesor activo hace poco, o no es pregunta básica): se calla (como v30).
    // Si NUNCA escribió un humano (handoff por keyword HANDOFF_RE), se mantiene el comportamiento v30
    // (no se retoma solo): el bot solo gestiona el ciclo cuando de verdad hubo un asesor en el chat.
    if (conv.status === "handoff") {
      const { data: ha } = await sb.from("messages").select("created_at")
        .eq("conversation_id", conv.id).eq("model", "human-agent")
        .order("created_at", { ascending: false }).limit(1);
      const ultHumano = (ha?.[0] as any)?.created_at as string | undefined;
      const minsSinHumano = ultHumano ? (Date.now() - new Date(ultHumano).getTime()) / 60000 : -1;
      const interrumpe = INTERRUPT_RE.test(texto); // trámite/pago/fiscal en curso → nunca tocar
      const frio = !!ultHumano && minsSinHumano > HANDOFF_COLD_HOURS * 60 && !interrumpe;
      const puedeAsistir = !!ultHumano && !frio && minsSinHumano >= HANDOFF_ASSIST_MIN
        && conv.turns_today <= MAX_TURNS_DIA && !interrumpe && BASIC_INFO_RE.test(texto);

      if (frio) {
        // COLD-RETURN: el asesor lleva >umbral sin escribir → conversación fría. El bot la retoma por
        // completo: la marcamos 'bot' y NO retornamos (cae al flujo normal de abajo: turnos/INTERRUPT/
        // HANDOFF/LLM completo). Si el asesor vuelve durante el LLM, owner=true la regresa a handoff y
        // el anti-carrera (justo antes de enviar) evita pisarlo.
        await sb.from("conversations").update({ status: "bot" }).eq("id", conv.id);
        conv.status = "bot";
        await log("handoff_cold_return", true, { waId, horas_sin_humano: Math.round(minsSinHumano / 60) });
      } else if (puedeAsistir) {
        // ASISTENCIA: tarea aparte en segundo plano. El bot responde SOLO la info básica (info_tienda),
        // no saca la conversación de handoff y no le quita la venta al asesor.
        const asistir = (async () => {
          try {
            if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "asist-pre" }); return; }
            const { data: hist } = await sb.from("messages").select("role,content,model,created_at").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);
            const history = (hist ?? []).reverse();
            // forceTool=true + modoAsistencia=true → única tool info_tienda, forzada (grounding).
            const r = await responderLLM(history as any, true, null, false, waId, {}, {}, true);
            const salida = r.text ? limpiarWhatsApp(r.text) : null;
            if (!salida) { await log("asistencia_handoff", true, { waId, enviado: false, motivo: "sin_respuesta" }); return; }
            // anti-duplicado (llegó otro mensaje del cliente) + anti-carrera (el asesor volvió a escribir
            // durante el LLM → reseteó el reloj → él sigue; o la conversación dejó de estar en handoff).
            if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "asist-post" }); return; }
            const { data: hNuevo } = await sb.from("messages").select("id").eq("conversation_id", conv.id).eq("model", "human-agent").gt("created_at", ultHumano as string).limit(1);
            if (hNuevo && hNuevo.length) { await log("asistencia_handoff", true, { waId, enviado: false, motivo: "asesor_volvio" }); return; }
            const { data: cAhora } = await sb.from("conversations").select("status").eq("id", conv.id).maybeSingle();
            if (cAhora?.status !== "handoff") { await log("asistencia_handoff", true, { waId, enviado: false, motivo: "status_cambio" }); return; }
            // Anti-eco: model != 'human-agent' → cuando WATI rebote el eco (owner=true), se reconoce como
            // envío propio y NO se guarda como asesor (no resetea el reloj ni dispara handoff falso).
            const quiereEnviar = liveAllowed(waId);
            const insA = await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: salida, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: quiereEnviar ? "live" : "shadow", model: "assist-handoff", tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, latency_ms: Date.now() - t0 }).select("id");
            let enviado = false;
            if (quiereEnviar) { enviado = await enviarWati(waId, salida); if (!enviado) await sb.from("messages").update({ mode: "shadow" }).eq("id", (insA.data?.[0] as any)?.id); }
            await log("asistencia_handoff", true, { waId, enviado, mins_sin_humano: Math.round(minsSinHumano) });
          } catch (e) { await log("error", false, { waId, fase: "asistencia", error: String(e).slice(0, 300) }); }
        })();
        correrEnSegundoPlano(asistir);
        return Response.json({ ok: true, asistencia: true });
      } else {
        // Asesor activo hace poco (<umbral), no es pregunta básica, o handoff sin asesor → callar (v30).
        return Response.json({ ok: true, skipped: "en_handoff" });
      }
    }
    if (conv.turns_today > MAX_TURNS_DIA) { await log("tope_turnos", true, { waId }); return Response.json({ ok: true, skipped: "tope_diario" }); }

    // Anti-interrupción 1 (v15 + v31): si el negocio atendió la conversación quedó en status='handoff'
    // (se marca cuando un owner=true escribe, arriba). El bloque de arriba (v31) ya decidió: o se calló,
    // o asistió con info básica (y retornó), o —si el asesor llevaba >24h— la retomó (status='bot') y
    // cae aquí al flujo normal como cualquier cliente. El bot nunca pisa a un asesor activo.

    // Anti-interrupción 2: señales de trámite/pago/dato fiscal en curso → abstenerse.
    if (INTERRUPT_RE.test(texto)) { await log("abstencion_interrupcion", true, { waId }); return Response.json({ ok: true, skipped: "interrupcion_tramite" }); }

    if (HANDOFF_RE.test(texto)) {
      await sb.from("conversations").update({ status: "handoff" }).eq("id", conv.id);
      await sb.from("handoffs").insert({ conversation_id: conv.id, motivo: `keyword: ${texto.slice(0, 120)}` });
      const despedida = horarioPanama().dentro
        ? "Con gusto, ya le paso con un asesor que le responderá en breve. ¡Gracias por escribirnos!"
        : "Con gusto, un asesor le responderá apenas estemos en horario (Lun-Vie 9:00am–5:00pm). ¡Gracias por escribirnos!";
      const enviado = liveAllowed(waId) ? await enviarWati(waId, despedida) : false;
      await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: despedida, mode: enviado ? "live" : "shadow", latency_ms: Date.now() - t0 });
      return Response.json({ ok: true, handoff: true });
    }

    // Trabajo lento (historial + LLM + envío + guardado) en SEGUNDO PLANO: así le
    // respondemos a WATI al instante y evitamos su timeout/reintentos (v14). El insert
    // del mensaje de usuario (dedup) ya ocurrió de forma síncrona más arriba.
    const procesar = (async () => {
      let respondido = false; // v23: marca si ya enviamos respuesta (para el respaldo del catch)
      try {
        // v19: si es una imagen del cliente, descárgala de WATI para pasarla a Claude vision.
        let imagen: { b64: string; mediaType: string } | null = null;
        if (esImagenCliente) {
          imagen = await descargarMediaWati(String(p.data ?? ""));
          if (!imagen) await log("imagen_no_descargada", false, { waId, url: String(p.data ?? "").slice(0, 160) });
        }
        // v20 (anti-duplicado, pre-LLM): si ya llegó un mensaje más nuevo, ni gastamos el LLM.
        if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "pre-llm" }); return; }
        const { data: hist } = await sb.from("messages").select("role,content,model,created_at").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);
        const history = (hist ?? []).reverse();
        const atributosWati = extraerCustomParams(p); // v25: datos que ya tenemos (best-effort, del payload)
        const linksTracked: Record<string, string> = {}; // v29 — handle → URL con tracking (lo llena buscar_producto)
        const r = await responderLLM(history as any, imagen ? false : NEEDS_TOOL_RE.test(texto), imagen, esImagenCliente && !imagen, waId, atributosWati, linksTracked);
        const salida = r.text ? reaplicarTracking(limpiarWhatsApp(r.text), linksTracked) : null; // v16 formato + v29 tracking
        // v20 (anti-duplicado, post-LLM): durante los ~8s del LLM pudo llegar otro mensaje → no enviar el viejo.
        if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "post-llm" }); return; }
        // v20 (anti-carrera): si el negocio tomó la conversación mientras pensábamos, no la pisamos.
        const { data: convAhora } = await sb.from("conversations").select("status").eq("id", conv.id).maybeSingle();
        if (convAhora?.status === "handoff") { await log("descartado_handoff_tardio", true, { waId }); return; }
        // v21 (anti-eco duro): insertar la respuesta ANTES de enviarla por WATI. Así, cuando WATI
        // rebota el eco (owner=true), el anti-eco encuentra esta fila y NO lo guarda como mensaje de
        // asesor → se evita el handoff falso. El modo se registra optimista y se corrige si falla.
        const quiereEnviar = !!(salida && liveAllowed(waId));
        let modoFinal = quiereEnviar ? "live" : "shadow";
        const insAsst = await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: salida, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: modoFinal, model: anthropic ? MODEL : null, tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, latency_ms: Date.now() - t0 }).select("id");
        let enviado = false;
        if (quiereEnviar) {
          enviado = await enviarWati(waId, salida);
          if (!enviado) { modoFinal = "shadow"; await sb.from("messages").update({ mode: "shadow" }).eq("id", insAsst.data?.[0]?.id); }
        }
        respondido = true; // v23: ya insertamos/enviamos la respuesta del bot
        if (esImagenCliente) await log("imagen_procesada", true, { waId, descargada: !!imagen, enviado });
        if (!anthropic) await log("llm_no_configurado", true, { waId });
      } catch (e) {
        await log("error", false, { waId, fase: "async", error: String(e).slice(0, 400) });
        // v23: respuesta de respaldo — si algo falló (p.ej. API de Anthropic 529/500) y NO alcanzamos
        // a responder, no dejamos al cliente en silencio. Solo si: live, no llegó un mensaje más nuevo,
        // y no entró un asesor. Mensaje consciente del horario.
        try {
          if (!respondido && liveAllowed(waId) && !(await hayMensajeClienteMasNuevo(conv.id, userCreatedAt))) {
            const { data: cf } = await sb.from("conversations").select("status").eq("id", conv.id).maybeSingle();
            if (cf?.status !== "handoff") {
              const fb = horarioPanama().dentro
                ? "Disculpá, estamos con alto volumen en este momento 🙏. Un asesor te ayuda en breve."
                : "Disculpá, estamos con alto volumen en este momento 🙏. Un asesor te ayuda apenas estemos en horario (Lun-Vie 9:00am–5:00pm).";
              const okfb = await enviarWati(waId, fb);
              await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: fb, mode: okfb ? "live" : "shadow", model: "fallback", latency_ms: Date.now() - t0 });
              await log("respuesta_respaldo", true, { waId, enviado: okfb });
            }
          }
        } catch { /* nunca romper */ }
      }
    })();
    correrEnSegundoPlano(procesar);
    return Response.json({ ok: true, queued: true });
  } catch (e) {
    await log("error", false, { waId, error: String(e).slice(0, 400) });
    return Response.json({ ok: false, error: "internal" }, { status: 200 });
  }
});
