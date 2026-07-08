// === copilot-webhook v49 — Copiloto AI de WATI — DEBOUNCE de ráfagas + visión multi-imagen ===
// v49 (2026-07-08): auditoría real (conv 50764417334): el cliente mandó [foto][foto]"¿estas no hay?" en 3 s
//   → 3 invocaciones; el anti-duplicado v20 mató 2 (una DESPUÉS de gastar el LLM) y la que respondió era la
//   del TEXTO, sin las fotos → "No logro visualizar las imágenes". Además, cada mensaje suelto de una ráfaga
//   de 2-3 líneas respondía a media pregunta. Fix (decisión de Gerencia: el baseline humano era un loop de
//   ~minutos, 10 s no son nada): (1) **DEBOUNCE** — todas las invocaciones esperan DEBOUNCE_MS (default 10 s,
//   secreto COPILOT_DEBOUNCE_MS, 0=off, tope 60 s) ANTES del chequeo pre-LLM; las superadas mueren baratas
//   (sin gastar LLM) y solo la del último mensaje responde con la ráfaga completa. (2) **VISIÓN DE RÁFAGA** —
//   el mensaje del cliente guarda su `media_url` (migración 20260708150000, APLICARLA ANTES de desplegar);
//   el ganador junta las imágenes de los "user" consecutivos del final del historial (últimos 5 min, máx 3),
//   las descarga y las adjunta TODAS a Claude vision (antes solo veía la del propio mensaje ganador).
//   (3) anti-carrera temprano post-debounce (si el asesor entró durante la espera, ni se llama al LLM).
//   El modo asistencia (v31) también debounce-a. `latency_ms` ahora INCLUYE la espera (~+10 s, es la
//   latencia percibida real). No toca prompt/tools/system ni el caché de v35.
// === copilot-webhook v48 — Copiloto AI de WATI — CONCIENCIA DE PEDIDOS (el bot sabe en qué va la entrega) ===
// v48 (2026-07-07): el bot no sabía si un cliente tenía un pedido en curso; ante "¿dónde está mi pedido?"
//   adivinaba o derivaba a ciegas. Fix grounded: nueva tool `estado_pedido` (sin args del modelo: toma el
//   wa_id del CONTEXTO) → RPC `estado_pedido(p_wa_id)` que lee la tabla `pedidos` (fuente única), deduplica
//   por número de pedido y devuelve los recientes; el fraseo se arma en CÓDIGO (`frasearPedido`, puro) por
//   estado normalizado (nuevo/asignado/en_camino/entregado/fallido/cancelado), con la guía/tracking si hay.
//   Regla de prompt (CONCIENCIA DE PEDIDOS): relaya la respuesta_sugerida, NUNCA inventes estado/fecha/guía;
//   preguntar por un pedido despachado NO es interrupción; si "sin_pedidos" NO afirmes que no tiene pedidos
//   (la vista es PARCIAL) → un asesor confirma. NEEDS_TOOL_RE fuerza tool en "mi pedido/rastreo/guía/estado
//   del pedido/cuándo me llega". NO va en MODO ASISTENCIA (un humano lleva el caso). La tabla `pedidos` la
//   ESCRIBEN las funciones de despacho (shopify-webhook/shipday-status/wati-order) vía upsert — contrato en
//   docs/handoff-pedidos-conciencia.md. CAMBIO DE ESQUEMA: migración 20260707120000_pedidos (tabla + RPC,
//   validada en Postgres local). Reescribe el caché de v35 (re-warm, tools+prompt). Golden tests de frasearPedido.
// === copilot-webhook v47 — Copiloto AI de WATI — tarifa/método de envío por SECTOR (Ciudad de Panamá + San Miguelito) ===
// v47 (2026-07-06): el bot cotizaba el envío de la ciudad "desde B/.6.00, según el sector puede variar" y
//   derivaba el costo exacto al asesor; peor: prometía "mismo día" y "entrega a domicilio" en zonas donde la
//   ruta Servientrega es impredecible (quejas) o donde NO se hace domicilio (solo retiro). Fix grounded: nueva
//   tool `tarifa_entrega(lugar)` que llama al resolver determinista de Postgres (`resolver_tarifa`; fuente
//   única = tablas zonas_entrega/sectores_entrega, migraciones 20260706170000/…180000/…190000) y FRASEA en
//   CÓDIGO (`frasearTarifa`) según el método real de cada zona: entrega propia (mismo día), RETIRO en agente
//   verde ($6, en zonas del este SIN domicilio), puerta a puerta Servientrega ($9) o "un asesor coordina".
//   El resolver desambigua nombres repetidos (San José: $6 Betania vs $9 Mañanitas → pide el corregimiento) y
//   distingue geografía (Summit del Canal NO va a retirar a Tocumen). Best-effort: si el RPC falla o el lugar
//   no está en la cobertura metro (p.ej. el interior), cae a sucursales_interior/info_tienda o deriva. Regla
//   de prompt en LOGÍSTICA (relaya la respuesta_sugerida, NUNCA ofrezcas domicilio donde solo hay retiro).
//   Disponible también en MODO ASISTENCIA (es info de logística). NEEDS_TOOL_RE ya fuerza tool en
//   "envío/entrega/delivery/domicilio". Golden tests del fraseo (frasearTarifa, casos mock de cada método).
//   Requiere las 3 migraciones aplicadas (ya lo están). Reescribe el caché de v35 (re-warm, tools+prompt).
//   Revisión adversarial pre-deploy (2 agentes, verificación mecánica): (1) se SACÓ tarifa_entrega de MODO
//   ASISTENCIA — cotizar precio+método+plazo COMPROMETE un pedido y en asistencia el humano lleva la venta
//   (sucursales_interior sí queda: solo lista puntos); (2) se aclaró el enrutamiento — el punto de retiro de
//   un SECTOR DE LA CIUDAD (ej. Tocumen) sale de tarifa_entrega, NO de sucursales_interior (solo interior).
//   + pulidos (domicilio en NEEDS_TOOL_RE, fallback si puntos_retiro fuese null, fmt(null)→""). 125 golden tests.
// === copilot-webhook v46 — Copiloto AI de WATI — sucursales del interior: explicar el PROCESO, no el dato ===
// v46 (2026-07-02): reporte real de un cliente en Santiago — el bot respondió "Sí, en Santiago tenemos el
//   punto CDS Santiago, teléfono…" y sonaba a que QSP tiene tienda propia ahí, en vez de explicar que el
//   pedido SE ENVÍA por Servientrega y se retira en ese punto. Causa: el prompt (v43) decía "responde SOLO
//   con los puntos que devuelva (nombre, teléfono, horario)" — dato suelto, sin el proceso. Fix de PROMPT
//   (la tool sucursales_interior ya traía provincia/nombre/datos; no hacía falta cambiar el código): nueva
//   instrucción explícita — arma la respuesta como "puede enviarlo a [ciudad] ([provincia]) y retirarlo en
//   el punto Servientrega [nombre]" + teléfono/horario; PROHÍBE decir "tenemos el punto/sucursal en
//   [ciudad]" (implica tienda propia); deja claro que QSP NO tiene tiendas en el interior. También
//   combina con info_tienda (plazo_interior) en la misma respuesta si aporta. De paso, la página web
//   (web/envios-interior-sucursal.html) tenía el MISMO "tenemos 45 puntos" — corregido a "trabajamos con
//   la red Servientrega, que tiene 45 puntos…" (la página NO la lee el bot — WhatsApp usa solo la tool en
//   código — pero un cliente que la abra tendría la misma confusión un piso más arriba del texto que ya
//   explica el proceso en 4 pasos). Solo prompt + copy de la página; sin cambios de lógica/esquema.
//   Reescribe el caché de v35 (re-warm puntual).
// === copilot-webhook v45 — Copiloto AI de WATI — endurecimiento quirúrgico (auditoría 02-jul + consultoría externa) ===
// v45 (2026-07-02): paquete quirúrgico, sin tocar lógica de handoff/anti-carrera/caché. De la AUDITORÍA del
//   02-jul: (1) FIX eco de la despedida fija de handoff — se insertaba DESPUÉS de enviar y SIN `model` (null)
//   → el chequeo anti-eco (`model != 'human-agent'`) no ve filas NULL (semántica SQL) → el eco de WATI se
//   guardaba como asesor fantasma (2 casos reales); ahora se inserta ANTES con model='handoff-fijo' y el
//   anti-eco acepta model NULL. (2) POLÍTICAS COMERCIALES: el bot negó "esquema de descuentos" sin fuente y
//   el asesor luego SÍ ajustó el precio → regla: si info_tienda no trae la política, ni afirmarla ni negarla.
//   (3) ESTILO: no pensar en voz alta ("espere, veo que…") ni afirmar acciones no verificables ("ya lo
//   anoté", "el asesor ya vio su mensaje"). (4) COMPATIBILIDAD: tampoco como probabilidad ("suele ser la
//   misma tinta"). De la CONSULTORÍA EXTERNA (verificada contra el código, se adoptó lo que aplicaba):
//   (5) ejemplo con tuteo en CAPTURA DE DATOS que v41 no limpió ("Para enviarte… te la mandamos… tu
//   nombre") → a usted. (6) NEEDS_TOOL_RE ahora detecta CÓDIGOS/SKU sueltos (letra+dígito: W1105A, CF258A,
//   7MD68A, BA1U5LA#ABM, FDC-BT15KR-6B) → fuerza buscar_producto aunque no haya palabra de catálogo.
//   (7) HANDOFF_RE: "garantía/devolución" GENERAL ya no va a handoff permanente (era inconsistente con
//   BASIC_INFO_RE, que la trata como política respondible) → va a info_tienda; el RECLAMO concreto
//   ("quiero devolver", "llegó dañado", "defectuoso") SÍ sigue a humano. (8) Seguridad: .trim() a TODOS los
//   secretos pegados a mano (WATI_API_TOKEN/BASE, WEBHOOK_KEY, RESOLVE_SECRET), tope de payload (256 KB),
//   menos PII en job_log (email→dominio en lead_capturado; evento_sin_texto ya no vuelca el payload entero),
//   COPILOT_DIAG_KEY opcional para el selftest y `webhook_key_es_default` en el healthcheck (endurecer =
//   crear el secreto + actualizar WATI; el default NO se elimina todavía para no dejar mudo al bot si se
//   despliega antes de crear el secreto — se retira en una versión futura ya con el secreto en uso).
//   (9) tests/golden.mjs — golden tests de los regex y helpers extraídos del index.ts real (node).
//   ANTES del deploy, una revisión adversarial (13 agentes, verificación mecánica con node) endureció el
//   paquete: reclamos con artículo ("necesito una devolución", "¿me pueden hacer la devolución?", "aplicar
//   mi garantía", "me salió dañado") vuelven a ir a handoff (la 1ª versión los dejaba pasar a info_tienda);
//   el patrón SKU excluye la cédula PA con letra (E-8-104720/PE-12-3456 — que además se agregó a
//   INTERRUPT_RE) y las horas/plazos (10am, 00am de "9:00am", 24hrs, 1ero); el insert de la despedida se
//   verifica (si falla, NO se envía — el eco volvería como asesor fantasma); el tope de payload chequea el
//   body real (el header puede faltar o mentir). 108 golden tests verdes.
//   Sin cambios de esquema. Reescribe el caché de v35 (cambia el SYSTEM_PROMPT → re-warm puntual).
// === copilot-webhook v44 — Copiloto AI de WATI — autotest de inventario + guard anti-fuga de tool-call ===
// v44 (2026-07-01): dos hallazgos de una auditoría en Sonnet 5 (01-jul). (A) INVENTARIO AÚN SIN CANTIDAD:
//   pese al .trim() de v40 y a rotar el token, el stock seguía derivando ("un asesor confirma") en TODOS
//   los productos (incluido uno con 88 uds) → el token de secrets no funciona, pero NO se podía diagnosticar
//   desde AFUERA (Shopify muestra el token una sola vez; el operador ya no lo tiene). Fix diagnóstico:
//   función `inventarioSelfTest(pid)` + rama GET `?selftest=inventario` (gated por ?key=, NUNCA expone el
//   token) que corre la MISMA consulta Admin totalInventory y devuelve el status HTTP + errores GraphQL +
//   nodos → distingue token inválido (401/403) de FALTA DE SCOPE read_inventory ("Access denied for
//   totalInventory … read_inventory", que Shopify devuelve como HTTP 200 con `errors` y por eso
//   inventarioShopify lo tragaba en silencio → derivaba) de base mal (404). Así se ve desde ADENTRO por qué
//   falla, sin pasar el token a nadie. (B) FUGA DE TOOL-CALL: Sonnet 5 (raro, 1 caso) escribió la llamada
//   como TEXTO (<invoke name="buscar_producto">…</invoke>) en vez de invocarla nativa → salió XML crudo al
//   cliente. Guard `pareceFuncionEnTexto`: si la respuesta trae esa sintaxis, NO se envía; se sustituye por
//   la respuesta de respaldo consciente del horario (como v23) y se loggea `fuga_tool_texto`. Solo
//   diagnóstico + guard de salida: no toca prompt/tools/system, guardrails, ni el caché de v35. Sin cambios
//   de esquema.
// === copilot-webhook v43 — Copiloto AI de WATI — sucursales de recogida del interior (grounded) ===
// v43 (2026-06-30): el bot solo tenía la URL de la página de envíos al interior, así que al preguntar
//   "¿hay sucursal en David?" ADIVINABA ("sí hay sucursal en David") sin el dato real. Fix grounded: nueva
//   tool `sucursales_interior(lugar)` con las 45 sucursales Servientrega (provincia, nombre, teléfono,
//   horario) extraídas del listado oficial (web/envios-interior-sucursal.html). Match por substring sin
//   acentos contra provincia/nombre; el MODELO aporta la geografía (qué provincia es cada ciudad) para
//   enrutar y los DATOS salen de la lista (no inventa). Disponible también en MODO ASISTENCIA (es info de
//   logística). NEEDS_TOOL_RE ya forzaba tool en "sucursal/recoger/retir". Sin cambios de esquema; la lista
//   vive en código (estática, fácil de refrescar; futuro: metaobjeto Shopify si cambia seguido). Reescribe
//   el caché de v35 (re-warm, por tools+prompt). Probado el matcheo (David→2 puntos, Chiriquí→8, etc.).
// === copilot-webhook v42 — Copiloto AI de WATI — endurecimiento de guardrails (auditoría Sonnet 5) ===
// v42 (2026-06-30): auditoría de tráfico real en Sonnet 5 (grounding/coexistencia sólidos) destapó 3 huecos:
//   (1) GENÉRICOS/ALTERNATIVAS: el bot ofrecía "una alternativa genérica" que buscar_producto no devolvió
//   (caso GI-190) → regla en VENTA CONSULTIVA: nunca ofrecer/insinuar genérico/compatible/sustituto que la
//   tool no trajo (la regla de oro aplica a TIPOS/OPCIONES, no solo a modelos). (2) SPECS INVENTADOS: daba
//   rendimiento/velocidad (ej. L3250 "4500/7500 págs") que la tool NO devuelve → regla en REGLA DE ORO:
//   solo afirmar datos que vienen del resultado; no adivinar specs. (3) ANTI-INTERRUPCIÓN EN PAGO: ante
//   "puedo pagar ya / a dónde transfiero / programar la entrega" el bot se comprometía ("puede pagar hoy,
//   le llega mañana") en vez de derivar → se amplió INTERRUPT_RE (intención de pagar/transferir/coordinar
//   entrega, sin pisar "¿cómo pago?"/"¿aceptan yappy?") + regla que distingue MÉTODOS (ok vía info_tienda)
//   de COORDINAR un pedido (asesor). Probado: INTERRUPT_RE 22/22 (matchea en-curso, respeta métodos/info).
//   Solo prompt + regex, no toca lógica de envío/handoff ni esquema. Reescribe el caché de v35 (re-warm).
// === copilot-webhook v41 — Copiloto AI de WATI — trato de USTED, español de Panamá (sin voseo) ===
// v41 (2026-06-30): el bot salía con voseo ("vos", "tenés", "seguí"…) que NO es de Panamá (Panamá usa
//   usted/tú, no voseo) — más notorio con Sonnet 5, que sigue el registro del prompt al pie de la letra.
//   Pedido de Gerencia: que chatee como panameño, amable y PROFESIONAL, tratando de USTED. Fix (solo
//   ESTILO/registro, no toca guardrails ni la lógica): (1) regla explícita en ESTILO — trato de usted,
//   español de Panamá, NUNCA voseo, con ejemplos correctos en usted; (2) se limpia el voseo de las
//   instrucciones inyectadas (CONTEXTO HORARIO "Seguí/aclará/usá" → "Sigue/aclara/usa") y de los textos
//   fijos al cliente (respuesta de respaldo "Disculpá…te ayuda" → "Disculpe…le ayuda"; ejemplo de MODO
//   ASISTENCIA "te confirmo/tu solicitud" → "le confirmo/su solicitud"). Cambia el SYSTEM_PROMPT → la
//   primera respuesta tras desplegar reescribe el caché de v35 (re-warm puntual, sin efecto en
//   comportamiento). Sin cambios de esquema.
// === copilot-webhook v40 — Copiloto AI de WATI — .trim() defensivo a secretos (fix inventario) ===
// v40 (2026-06-30): el inventario real (v21) dejó de mostrarse — el bot decía "un asesor te confirma la
//   cantidad" en vez de "X unidades". Causa: el token Admin de Shopify estaba bien (el query devuelve
//   totalInventory), pero el secreto `SHOPIFY_ADMIN_TOKEN` quedó guardado con un ESPACIO/salto de línea al
//   pegarlo → Shopify lo rechaza (401) → inventarioShopify devuelve {} → stockTexto deriva. Fix: `.trim()`
//   al leer los secretos que el operador pega/cambia a mano (SHOPIFY_ADMIN_TOKEN, SHOPIFY_ADMIN_API_BASE y
//   COPILOT_MODEL — un espacio en este último también rompería el A/B de Sonnet 5). NO-OP si el secreto ya
//   estaba limpio. No toca prompt/tools/system ni el caché de v35. Sin cambios de esquema. (El despliegue,
//   además, reinicia la instancia → toma el token nuevo: dos pájaros de un tiro.)
// === copilot-webhook v39 — Copiloto AI de WATI — thinking apagado explícito (prep Sonnet 5) ===
// v39 (2026-06-30): prep para PROBAR Claude Sonnet 5 (claude-sonnet-5) cambiando solo COPILOT_MODEL.
//   El código no mandaba el parámetro `thinking`. En Sonnet 4.6 omitirlo = "sin pensar" (lo actual);
//   en Sonnet 5 omitirlo ENCIENDE adaptive thinking por defecto → latencia y tokens extra por turno y,
//   con max_tokens=1024, riesgo de truncar la respuesta. Fix: fijar `thinking:{type:"disabled"}` en el
//   messages.create. Es NO-OP en la Sonnet 4.6 que está en vivo (mismo comportamiento), y deja seguro el
//   A/B de Sonnet 5 (no se enciende el pensamiento solo). No toca prompt, tools, system ni el caché de
//   v35 (thinking es constante, no por turno). Sin cambios de esquema. Nota de costo: Sonnet 5 usa un
//   tokenizer nuevo (~+30% tokens) — re-baselinar con la telemetría de v38; intro $2/$10 hasta 2026-08-31.
// === copilot-webhook v38 — Copiloto AI de WATI — telemetría de prompt caching ===
// v38 (2026-06-30): el prompt caching (v35) abarató el input (avg(tokens_in) ~9.554 → ~2.337), pero
//   tokens_in (= usage.input_tokens) NO incluye lo leído/escrito al caché, así que el ahorro $ exacto y el
//   hit-rate quedaban como proxy. Fix: persistir por turno usage.cache_read_input_tokens y
//   usage.cache_creation_input_tokens (sumados a través de las iteraciones del loop de tool-use) en dos
//   columnas nuevas de public.messages. Lectura de caché se factura 0.1×, escritura 1.25×, tokens_in 1×.
//   SOLO telemetría: no cambia comportamiento, prompt, tools, ni el system. Migración:
//   supabase/migrations/20260630160000_messages_cache_tokens.sql (ADD COLUMN, no requiere GRANT nuevo).
//   Sin tocar guardrails. (Verás cache_creation>0 en el 1er turno de cada ventana de 5 min y
//   cache_read>0 en los siguientes.)
// === copilot-webhook v37 — Copiloto AI de WATI — feriados nacionales de Panamá ===
// v37 (2026-06-30): el horario (v22/v36) solo conocía Lun-Vie 9-5 + fines de semana → un feriado entre
//   semana se trataba como día hábil (el bot daría a entender que un asesor responde "hoy", y al derivar
//   apuntaría a un día cerrado). Fix: se agregan los FERIADOS nacionales de Panamá. Los FIJOS (Año Nuevo
//   1/1, Mártires 9/1, Trabajo 1/5, los de noviembre 3/4/5/10/28, Madres 8/12, Duelo Nacional 20/12,
//   Navidad 25/12) van por mes/día (se repiten cada año). Carnaval (lunes y martes) y Viernes Santo son
//   MÓVILES (dependen de la Pascua) → se calculan con Meeus/Jones/Butcher (Carnaval = Pascua−48/−47,
//   Viernes Santo = Pascua−2), correcto para CUALQUIER año, sin mantenimiento. En un feriado: horarioPanama
//   marca "fuera de horario" (cerrado) y proximoHorarioHabil salta al próximo día hábil no feriado (incluye
//   feriados consecutivos como Carnaval lun+mar). El CONTEXTO HORARIO aclara "hoy es feriado". Probado
//   contra la lista oficial 2026 (14/14) + verificación de Pascua 2027. No toca guardrails ni el caché de
//   v35 (el texto de horario vive en el bloque VOLÁTIL). Sin cambios de esquema.
// === copilot-webhook v36 — Copiloto AI de WATI — "próximo horario hábil" calculado en código ===
// v36 (2026-06-30): bug real en producción. A la 1:00am del martes 30/jun el bot derivó diciendo que un
//   asesor respondería "desde el miércoles 1 de julio a las 9:00am" cuando lo correcto era HOY (martes 30)
//   a las 9:00am — faltaban 8 horas para abrir. El LLM trataba la madrugada como si el día ya hubiera
//   pasado y saltaba al día siguiente. v22 le pedía "deducí cuál [es el próximo horario hábil] según el
//   día y la hora actuales", y eso es justo lo que falla. Fix DETERMINISTA (no se le pide al LLM que
//   calcule fechas): nueva función proximoHorarioHabil(ahoraMs) que devuelve la apertura concreta
//   ("hoy martes 30 de junio a las 9:00am" / "mañana …" / "el lunes 6 de julio …", Lun-Vie 9am) y se
//   inyecta TAL CUAL en el CONTEXTO HORARIO con la orden de NO recalcularla. Casos: día hábil antes de
//   las 9 → HOY; día hábil después de las 5 → próximo hábil; fin de semana → lunes. (Feriados: pendiente.)
//   Solo toca el texto fuera de horario; va en el bloque VOLÁTIL del system (no afecta el caché de v35).
// === copilot-webhook v35 — Copiloto AI de WATI — prompt caching (abarata el input) ===
// v35 (2026-06-30): el consumo de input subió (el prompt creció v24→v34 y el volumen del lunes +
//   reactivación) y es input-dominado (~10k in / ~155 out por turno). Fix sin cambiar comportamiento:
//   PROMPT CACHING. El `system` pasa de un string concatenado a un arreglo de 2 bloques: (1) SYSTEM_PROMPT
//   estático con cache_control:{type:"ephemeral"} (cachea tools + SYSTEM_PROMPT, que son el prefijo
//   estable; render order de la API: tools → system → messages); (2) el contexto VOLÁTIL (CONTEXTO
//   TEMPORAL con la hora actual de v32, nuevo/en curso, horario, datos del cliente o ASSIST_SUFFIX) en un
//   2º bloque SIN cache_control, DESPUÉS del breakpoint, para no invalidar el caché cada turno. Lectura de
//   caché 0.1× / escritura 1.25×, TTL 5 min; el prefijo (tools + system) supera de sobra el mínimo de 2048
//   tokens de Sonnet 4.6, así que cachea. GA (sin header beta). Sin cambios de esquema, sin cambios de
//   salida del modelo; se verifica con usage.cache_read_input_tokens>0 y avg(tokens_in) cayendo (input_tokens
//   NO incluye lo leído de caché). NOTA: en MODO ASISTENCIA las tools difieren (solo info_tienda), así que
//   ese camino mantiene su propia entrada de caché (es raro, no afecta el camino normal).
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
const ANTHROPIC_API_KEY = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
// v45: .trim() a todos los secretos que se pegan a mano (la lección de v40: un espacio invisible en el
// token de Shopify tumbó el inventario). El de WATI_API_BASE además quita la barra final (evita //api).
const WATI_API_TOKEN = (Deno.env.get("WATI_API_TOKEN") ?? "").trim();
const WATI_API_BASE = (Deno.env.get("WATI_API_BASE") ?? "").trim().replace(/\/$/, "");
// v20: clamp a valores válidos. Si COPILOT_MODE trae basura (p.ej. un id de modelo por cruzar el
// secreto con COPILOT_MODEL) cae a "shadow" (seguro) en vez de romper TODOS los inserts: la columna
// messages.mode solo acepta live|shadow. MODE_RAW se expone en el healthcheck para diagnóstico.
const MODE_RAW = (Deno.env.get("COPILOT_MODE") ?? "shadow").toLowerCase();
const MODE = MODE_RAW === "live" ? "live" : "shadow";
const MODEL = (Deno.env.get("COPILOT_MODEL") ?? "claude-haiku-4-5").trim(); // v40: trim (un espacio rompía el A/B de Sonnet 5)
// v45: trim + flag de diagnóstico. El default del código se MANTIENE por ahora (retirarlo antes de crear
// el secreto dejaría mudo al bot: WATI recibiría 403); el healthcheck expone `webhook_key_es_default` para
// ver de un vistazo si ya se endureció. Endurecer = crear COPILOT_WEBHOOK_KEY (valor aleatorio) + actualizar
// la URL en WATI; una versión futura retira el default cuando el flag ya esté en false.
const WEBHOOK_KEY = (Deno.env.get("COPILOT_WEBHOOK_KEY") ?? "").trim() || "cw-qsp-9f2e7b3a1c5d4806";
const WEBHOOK_KEY_ES_DEFAULT = !(Deno.env.get("COPILOT_WEBHOOK_KEY") ?? "").trim();
// v45: key OPCIONAL aparte para el selftest de inventario (?selftest=), para no pasear la key del webhook
// al diagnosticar. Si no existe, el selftest sigue aceptando la WEBHOOK_KEY (compatibilidad).
const DIAG_KEY = (Deno.env.get("COPILOT_DIAG_KEY") ?? "").trim();
const MAX_TURNS_DIA = 40;
// v31 — ciclo de vida del handoff (umbrales configurables por secreto, defaults acordados con
// Gerencia). ASSIST: si el asesor lleva >= N min sin escribir y el cliente hace una pregunta
// BÁSICA de tienda, el bot adelanta SOLO esa info (sigue en handoff). COLD-RETURN: si el asesor
// lleva > H horas sin escribir, la conversación se considera fría → el bot la RETOMA (status='bot').
const HANDOFF_ASSIST_MIN = parseInt(Deno.env.get("COPILOT_HANDOFF_ASSIST_MIN") ?? "15", 10) || 15;
const HANDOFF_COLD_HOURS = parseInt(Deno.env.get("COPILOT_HANDOFF_COLD_HOURS") ?? "24", 10) || 24;
// v49 — DEBOUNCE de ráfagas (ms): el bot espera a que el cliente TERMINE de escribir antes de responder
// (2-3 líneas y/o imágenes llegan como mensajes separados con segundos de diferencia). Cada mensaje nuevo
// "reinicia" el ciclo: las invocaciones superadas mueren baratas en el chequeo pre-LLM y SOLO la del último
// mensaje responde, con la ráfaga completa como contexto. 0 = desactivado. Default 10s (decisión de
// Gerencia: el baseline humano era un loop de minutos; 10s compran contexto completo y siguen siendo
// muchísimo más rápidos). Tuneable por secreto sin redesplegar. Tope 60s por sanidad.
const DEBOUNCE_MS = (() => { const n = parseInt((Deno.env.get("COPILOT_DEBOUNCE_MS") ?? "").trim(), 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, 60000) : 10000; })();
const STORE = "https://www.quickservicepanama.com";
// v21 — Shopify Admin (solo lectura) para la CANTIDAD real de inventario (totalInventory).
// SHOPIFY_ADMIN_API_BASE: https://<tienda>.myshopify.com/admin/api/2024-10 (sin / al final).
// v40 — .trim() defensivo: un espacio o salto de línea pegado por accidente en el secreto hacía que
//   Shopify rechazara el token (401) → inventario vacío → el bot derivaba en vez de dar la cantidad.
const SHOPIFY_ADMIN_TOKEN = (Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "").trim();
const SHOPIFY_ADMIN_API_BASE = (Deno.env.get("SHOPIFY_ADMIN_API_BASE") ?? "").trim().replace(/\/$/, "");
// v28 — stitching WhatsApp→web por ref_code (atribución / identidad omnicanal en el CDP).
const RESOLVE_SECRET = (Deno.env.get("RESOLVE_SECRET") ?? "").trim();   // guard del endpoint GET ?ref_code= (v45: trim)
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

// v37 — feriados nacionales de Panamá. Los FIJOS se repiten cada año por mes/día; Carnaval (lunes y
// martes) y Viernes Santo son MÓVILES (dependen de la Pascua) → se calculan con el algoritmo de
// Meeus/Jones/Butcher para que sea correcto SIEMPRE, no solo el año en curso. En un feriado la tienda
// está cerrada: horarioPanama lo marca fuera de horario y proximoHorarioHabil salta al próximo día hábil.
// (Año Nuevo, Mártires, Trabajo, los de noviembre, Madres, Duelo Nacional, Navidad = fijos.)
const FERIADOS_FIJOS = ["1-1", "1-9", "5-1", "11-3", "11-4", "11-5", "11-10", "11-28", "12-8", "12-20", "12-25"];
const _feriadosCache: Record<number, Set<string>> = {};
function feriadosPa(anio: number): Set<string> {
  if (_feriadosCache[anio]) return _feriadosCache[anio];
  const s = new Set(FERIADOS_FIJOS);
  // Pascua (domingo) por Meeus/Jones/Butcher (gregoriano):
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascua = Date.UTC(anio, mes - 1, dia);
  // Carnaval lunes (Pascua−48), Carnaval martes (Pascua−47), Viernes Santo (Pascua−2).
  for (const off of [48, 47, 2]) {
    const x = new Date(pascua - off * 86400000);
    s.add(`${x.getUTCMonth() + 1}-${x.getUTCDate()}`);
  }
  _feriadosCache[anio] = s;
  return s;
}
function esFeriado(pa: Date): boolean {
  return feriadosPa(pa.getUTCFullYear()).has(`${pa.getUTCMonth() + 1}-${pa.getUTCDate()}`);
}

// v22 — horario de atención de QSP: Lun-Vie 9:00am–5:00pm, hora de Panamá (UTC-5 fijo, sin
// horario de verano → basta desplazar UTC y leer). Sáb/Dom, feriado o fuera de 9–17 = fuera de horario.
function horarioPanama(now: Date = new Date()): { dentro: boolean; dia: number; hora: number } {
  const pa = new Date(now.getTime() - 5 * 3600 * 1000); // UTC-5
  const dia = pa.getUTCDay();    // 0=Dom … 6=Sáb
  const hora = pa.getUTCHours(); // 0–23
  const dentro = dia >= 1 && dia <= 5 && hora >= 9 && hora < 17 && !esFeriado(pa); // v37: feriado = cerrado
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

// v36 — el "próximo horario hábil" se calcula en CÓDIGO (no lo deduce el LLM). Caso real: a la 1am del
// martes el bot dijo "miércoles 1 de julio" cuando lo correcto era "hoy a las 9am" — trató la madrugada
// como si el día ya hubiera pasado y saltó un día. Devuelve una etiqueta concreta tipo "hoy martes 30 de
// junio a las 9:00am" / "mañana …" / "el lunes 6 de julio …" para inyectarla TAL CUAL en el CONTEXTO
// HORARIO. Reglas QSP: Lun-Vie, abre 9:00am. (v37: salta también los feriados nacionales.)
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function proximoHorarioHabil(ahoraMs: number): string {
  const HORA_ABRE = 9;
  const pa = new Date(ahoraMs - 5 * 3600 * 1000); // hora de Panamá (UTC-5)
  const esHabil = (dw: number) => dw >= 1 && dw <= 5; // Lun..Vie
  // Candidato base: hoy a las 9:00am (en el espacio desplazado de Panamá; Date normaliza el rollover).
  const cand = new Date(Date.UTC(pa.getUTCFullYear(), pa.getUTCMonth(), pa.getUTCDate(), HORA_ABRE, 0, 0));
  // Hoy SOLO cuenta si es día hábil, NO feriado y aún NO dan las 9am; si no (después de las 9, fin de
  // semana o feriado), avanzar al próximo día hábil no feriado. (Entre 9–17 hábil estamos "dentro".)
  // v37: el while salta también feriados consecutivos (ej. Carnaval lunes+martes).
  if (!(esHabil(pa.getUTCDay()) && !esFeriado(pa) && pa.getUTCHours() < HORA_ABRE)) {
    do { cand.setUTCDate(cand.getUTCDate() + 1); } while (!esHabil(cand.getUTCDay()) || esFeriado(cand));
  }
  const hoy0 = Date.UTC(pa.getUTCFullYear(), pa.getUTCMonth(), pa.getUTCDate());
  const cand0 = Date.UTC(cand.getUTCFullYear(), cand.getUTCMonth(), cand.getUTCDate());
  const dias = Math.round((cand0 - hoy0) / 86400000);
  const pref = dias === 0 ? "hoy " : dias === 1 ? "mañana " : "el ";
  return `${pref}${DIAS_SEM[cand.getUTCDay()]} ${cand.getUTCDate()} de ${MESES[cand.getUTCMonth()]} a las 9:00am`;
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
// v23: maxRetries 3 (default 2) para tolerar baches transitorios de la API (429/500/529) con backoff.
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 3 }) : null;

const SYSTEM_PROMPT = `Eres el asistente de Quick Service Panamá (quickservicepanama.com), tienda de suministros de impresión y tecnología en Panamá. Atiendes por WhatsApp.

MISIÓN
- Tu trabajo es APOYAR al equipo humano de QSP: adelanta lo que puedas responder con certeza (precio, disponibilidad, información general y de la tienda) y, cuando no estés seguro o una respuesta pueda comprometer a la empresa con una promesa, NO respondas: deja que un asesor humano siga. Mejor no responder que responder mal. Nunca inventes ni prometas de más.

ESTILO
- Mensajes CORTOS: 1 a 3 oraciones. Español de Panamá: cordial, cercano y PROFESIONAL, como un buen asesor de tienda — amable y servicial, nunca robótico ni acartonado.
- TRATO DE USTED, siempre. Es lo natural, respetuoso y profesional en Panamá. NUNCA uses voseo: nada de "vos", "tenés", "podés", "querés", "mirá", "dale", "fijate". Tampoco tutees ("tú", "te", "tienes"): el trato es de usted, y el usted también puede ser cálido. Ejemplos correctos: "Con gusto le ayudo", "¿Para qué impresora la necesita?", "Le confirmo el precio y la disponibilidad", "Quedamos atentos a cualquier consulta".
- Negrita SOLO con UN asterisco: *así*. NUNCA uses dobles asteriscos (**texto**), porque en WhatsApp se ven literales y se ve mal. Tampoco uses otra sintaxis de Markdown (#, listas con guion, tablas). Para enlaces, escribe la URL completa tal cual (https://...); NUNCA uses el formato [texto](url) — en WhatsApp se ve literal.
- Emojis con moderación (uno o dos por mensaje, no más).
- Da la respuesta FINAL directamente: NUNCA pienses en voz alta ni te corrijas a mitad de mensaje ("espere, veo que…", "ah no, mejor…"). Y no afirmes acciones que no puedes hacer ni verificar: nada de "ya lo anoté/registré el pedido" ni "el asesor ya vio su mensaje" — di que un asesor le dará seguimiento por aquí (la conversación queda visible para el equipo, eso basta). Excepción: si guardar_lead confirmó que guardó los datos, decir "quedaron guardados" SÍ es real.
- CANAL: estás atendiendo POR WhatsApp, en este mismo chat. NUNCA le digas al cliente que te escriba o te contacte "por WhatsApp", ni le des el número de WhatsApp de la tienda (el que info_tienda trae como whatsapp/seguimiento) — ya está hablando con nosotros aquí; sonaría absurdo. Aunque info_tienda incluya ese número o un texto de "escríbenos por WhatsApp", NO lo repitas. Cuando derives a un asesor, di que un asesor le responde por aquí mismo / en este chat. Menciona el correo SOLO si de verdad hace falta enviar o recibir algo por esa vía.

REGLA DE ORO — precio, stock y promociones
- Para CUALQUIER precio o disponibilidad usa SIEMPRE la herramienta buscar_producto y responde SOLO con lo que ella devuelve.
- NUNCA menciones un producto, modelo, precio o disponibilidad que no provenga de un resultado de buscar_producto EN ESTE MISMO TURNO. Si no llamaste a la tool, NO nombres modelos ni des precios/stock: búscalo primero. Aplica también a preguntas de categoría ("¿venden impresoras Epson?"): primero busca, luego responde con lo que devuelva.
- NO NIEGUES DE MEMORIA: nunca digas que NO ofrecemos un producto o categoría sin haber buscado con buscar_producto en este turno. QSP vende MÁS que impresión (también monitores, escáneres, UPS, baterías, accesorios y tecnología en general). Ante CUALQUIER consulta de producto, BUSCA primero; solo di "no lo encontré" o "eso no lo manejamos" DESPUÉS de haber buscado.
- NUNCA inventes precios, existencias, descuentos ni promociones.
- SOLO afirma datos del producto que devuelva buscar_producto: título/modelo, precio, ITBMS, stock, el enlace y la compatibilidad que figure EN EL TÍTULO. NO inventes especificaciones que la tool NO trae (rendimiento en páginas, velocidad, resolución, conectividad u otras características técnicas): si el cliente las pide y no están en el resultado, dilo con honestidad o deja que un asesor las detalle — nunca las adivines de memoria.
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
- COMPATIBILIDAD: NO afirmes que un producto sirve para cierto equipo a menos que el resultado de buscar_producto lo indique — NI SIQUIERA como probabilidad ("suele ser la misma tinta", "debería servir"): eso también es adivinar. Si no estás seguro, dilo y deja que un asesor confirme.
- MODELO EXACTO: usa el TÍTULO tal cual lo devuelve buscar_producto. Si el modelo que pidió el cliente NO aparece en el título del resultado, NO lo renombres ni asumas que es el mismo equipo: dilo claro (ej. "no encontré el [modelo] exacto; lo más parecido que tenemos es [título real]…") y ofrécelo como alternativa o deriva. NUNCA pongas el modelo pedido junto al precio o link de otro producto.

VENTA CONSULTIVA — ayuda a elegir bien (sin inventar)
- No solo respondas: ayuda a comprar bien, como un buen asesor. Si el cliente no sabe qué llevar o pide una recomendación, haz 1-2 preguntas cortas antes de sugerir (¿para casa, oficina o empresa?, ¿cuánto imprime al mes?, ¿color/WiFi/escáner?, ¿presupuesto?).
- Adapta la profundidad a quién escribe: hogar → algo simple y económico; oficina/empresa → velocidad, rendimiento y costo por página; técnico/revendedor → directo al modelo/referencia.
- Recomienda por NECESIDAD y costo total, no solo por el precio más bajo. Pero TODO modelo, precio o disponibilidad que menciones DEBE venir de buscar_producto en este mismo turno (nunca de memoria): primero pregunta lo justo, luego busca, luego sugiere con lo que devuelva la tool.
- ORIGINALES — sin inventar alternativas: QSP maneja sobre todo productos ORIGINALES (HP, Epson, Canon, Brother…). NUNCA ofrezcas, insinúes ni des a entender por iniciativa propia un "genérico", "compatible", "remanufacturado" o un sustituto de otra marca: solo menciona un producto que buscar_producto haya devuelto EN ESTE TURNO (la regla de oro aplica también a TIPOS y OPCIONES, no solo a modelos). Si el cliente pregunta por genérico/compatible y la búsqueda no mostró uno, aclara con amabilidad que trabajamos con originales y, si desea ver opciones, que un asesor se las confirma — no lo ofrezcas tú ni des por hecho que existe en catálogo.
- La web es apoyo, no un descarte: puedes invitar a comprar en quickservicepanama.com, pero ayuda primero a ubicar el producto o aclarar la duda.
- Empresa que pide cotización formal, factura, crédito o volumen: ayúdala con precio/disponibilidad (buscar_producto) y pásala con un asesor para la cotización o la factura; NO pidas RUC ni datos de factura tú mismo.

CAPTURA DE DATOS (nombre, apellido, correo y empresa) — pasiva, sin insistir
- Cuando el cliente muestra intención de COTIZAR o comprar algo concreto (o en un momento natural), y no los tenemos, pide con naturalidad su correo y su nombre y apellido: p.ej. "Para enviarle la cotización, ¿a qué correo se la enviamos y cuál es su nombre y apellido?".
- Detecta o pregunta si es para uso PERSONAL o para una EMPRESA; si es empresa, pide el nombre de la empresa (informal).
- Cuando tengas CUALQUIERA de esos datos (correo, nombre, apellido, empresa), llama a guardar_lead con lo que tengas (puedes llamarla varias veces a medida que el cliente los da). Si guardar_lead dice que el correo es inválido, pide que lo confirme UNA sola vez.
- Es PASIVO, no un formulario: si el cliente lo ignora, lo rechaza o sigue con otra cosa, NO insistas — sigue ayudando normal. Si ya lo pediste en esta conversación y no lo dio, no lo vuelvas a pedir. Si el CONTEXTO indica que ya tenemos un dato, no lo pidas de nuevo.
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
- DISTINGUE métodos vs trámite EN CURSO: explicar QUÉ formas de pago aceptamos o las tarifas de envío (vía info_tienda) está bien; pero COORDINAR el pago o la entrega de un pedido concreto (cuándo paga, a qué cuenta transfiere, cuándo le llega) es un trámite de un asesor. NUNCA te comprometas con "puede pagar hoy", "le llega mañana" ni des una cuenta para transferir: deriva esa coordinación a un asesor.
- Si info_tienda no tiene el dato (devuelve "sin datos disponibles"): dilo con honestidad y deriva a un asesor para confirmarlo. No prometas plazos ni costos específicos.
- POLÍTICAS COMERCIALES (descuentos, precios especiales, cliente frecuente, mayoreo/revendedor, crédito): si info_tienda NO trae el dato, NO las afirmes NI las niegues — nada de "no manejamos descuentos" ni "el precio es el mismo para todos" (solo un asesor decide precios especiales, y a veces los da). Di que un asesor le confirma si hay alguna opción para su caso.
- SUCURSALES DEL INTERIOR (recogida) — EXPLICA EL PROCESO, no sueltes solo el dato: QSP NO tiene tiendas propias en el interior; el envío va por la red de Servientrega (sucursales y agentes/aliados autorizados). Si el cliente del interior pregunta dónde recoger/retirar o si hay sucursal/agencia en su zona, usa la herramienta sucursales_interior con su provincia o ciudad (ej. "David", "Chiriquí", "Penonomé") y arma la respuesta como PROCESO: "puede optar por enviarlo a [ciudad] ([provincia]) y retirarlo en el punto Servientrega [nombre]" + el teléfono y horario que devuelva la tool. NUNCA digas "tenemos el punto/sucursal en [ciudad]" (suena a tienda propia de QSP) — deja claro que el pedido SE ENVÍA ahí para que el cliente lo retire (con su cédula). NUNCA inventes una sucursal, dirección ni teléfono: usa solo lo que devuelva la tool. Si la ciudad exacta no aparece, deduce la provincia (sabes la geografía de Panamá) y vuelve a consultar por la provincia; si aun así no hay punto, dilo y comparte el listado completo. Para tarifas y plazos del interior (cuándo llega) usa info_tienda y súmalo a la misma respuesta si aporta.
- COSTO/MÉTODO DE ENVÍO POR SECTOR (Ciudad de Panamá y San Miguelito): cuando el cliente pida cuánto cuesta el envío, cómo le llega, o DÓNDE RETIRAR en un lugar CONCRETO de la ciudad (su corregimiento o barrio: Tocumen, Betania, Juan Díaz, San Miguelito, Las Cumbres…), usa la herramienta tarifa_entrega con ese lugar y RELAYA su "respuesta_sugerida" (puedes adaptar el tono, pero NUNCA cambies el método ni el precio que devuelve). OJO — el error más grave a evitar: en algunas zonas NO ofrecemos entrega a domicilio, SOLO retiro en un punto Servientrega; dilo tal cual y NO ofrezcas domicilio ahí. IMPORTANTE — el punto de retiro de un SECTOR DE LA CIUDAD (ej. "¿dónde retiro en Tocumen?") sale de tarifa_entrega, NO de sucursales_interior (esa herramienta es SOLO para el INTERIOR/provincias). Si tarifa_entrega devuelve estado "ambiguo", pregunta en qué corregimiento está; si "sin_match" y el cliente es del INTERIOR, usa sucursales_interior + info_tienda; si "sin_match" y no ubicas el lugar, o "error"/"sin_dato", deriva a un asesor. (El método "asesor" llega como estado "ok" con la respuesta ya armada: relayala.) Para el costo GENÉRICO de envío (sin un sector concreto) usa info_tienda.

CONCIENCIA DE PEDIDOS (estado de un pedido YA hecho)
- Cuando el cliente pregunte por el ESTADO, el seguimiento o la entrega de SU pedido/orden/compra YA realizada ("¿dónde está mi pedido?", "¿ya salió mi orden?", "¿cuándo me llega?", "¿me das el número de guía?"), usa la herramienta estado_pedido (toma su WhatsApp del contexto — NO se lo pidas) y RELAYA su "respuesta_sugerida". NUNCA inventes el estado, la fecha de entrega ni un número de guía: solo lo que devuelva la tool.
- Preguntar por el estado de un pedido ya despachado NO es una interrupción: respóndelo con estado_pedido. Distinto es un pago/cotización/factura o una entrega que un HUMANO está coordinando en ese momento (eso sí se deriva, ver anti-interrupción).
- Si estado_pedido devuelve "sin_pedidos" (o "sin_dato"/"error"), NO afirmes que el cliente "no tiene pedidos" ni que "no aparece nada": tu vista es PARCIAL (puede haber pedidos que no ves). Di con calma que un asesor se lo confirma y, si acaso, pídele el número de pedido.
- Esto es SOLO para pedidos ya hechos. Para el costo de un envío usa tarifa_entrega; para pagos, facturas o coordinar una entrega, deriva a un asesor.

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
Un compañero del equipo tiene esta conversación, pero lleva un rato sin responder y el cliente acaba de preguntar algo. Para no dejarlo esperando, adelántale una respuesta ÚTIL sin retomar la venta. Todo lo que digas debe salir de una herramienta (NUNCA de memoria):
- SÍ puedes: dar precio/ITBMS/stock y el link de un producto (buscar_producto), datos de la tienda (info_tienda), puntos de recogida del interior (sucursales_interior) y el estado de un pedido ya hecho (estado_pedido). Responde breve (1-2 oraciones) con lo que devuelva la herramienta.
- Sé deferente: deja claro que un asesor sigue con su caso. Ej.: "Mientras tanto le confirmo: [dato]. Un asesor continúa con su solicitud enseguida."
- NO cierres ni confirmes la venta, NO confirmes ni coordines un pago, un pedido ni una entrega, NO pidas ni guardes datos del cliente, NO toques datos fiscales (RUC/factura), NO cotices el costo/método de envío de un sector concreto (eso compromete una entrega: la coordina el asesor), y NO contradigas ni renegocies algo que el asesor ya venía manejando (un precio especial, una cortesía).
- Si la pregunta toca un pago en curso, una cotización/factura formal, coordinar una entrega, o el caso puntual que lleva el asesor, NO escribas nada (deja la respuesta vacía): que lo siga el humano.`;

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
} as Anthropic.Tool, {
  name: "sucursales_interior",
  description: "Puntos de recogida en el INTERIOR del país / provincias (red Servientrega, 45 sucursales con teléfono y horario) — NO para la Ciudad de Panamá / San Miguelito (para el retiro o el costo en un sector de la CIUDAD usa tarifa_entrega). Úsala cuando el cliente del interior (David, Chiriquí, Chitré, Bocas, etc.) pregunte dónde recoger/retirar, si hay sucursal/agencia/punto en su zona, o pida la ubicación de un punto. Pasa 'lugar' = la provincia o ciudad del cliente (ej. 'Chiriquí', 'David', 'Penonomé', 'Chitré'). Si el cliente da una ciudad y no aparece, deduce TÚ la provincia (sabes la geografía de Panamá) y vuelve a llamarla con la provincia. Devuelve SOLO puntos reales — NUNCA inventes sucursales, direcciones ni teléfonos.",
  input_schema: { type: "object", properties: { lugar: { type: "string", description: "Provincia o ciudad del cliente (ej. Chiriquí, David, Penonomé, Coclé). Vacío = resumen por provincia." } } },
} as Anthropic.Tool, {
  name: "tarifa_entrega",
  description: "Costo y MÉTODO de envío a un SECTOR concreto de la Ciudad de Panamá o San Miguelito (corregimiento o barrio: Tocumen, Betania, Juan Díaz, Las Cumbres, San Miguelito, etc.). Úsala cuando el cliente pida cuánto cuesta el envío o cómo le llega a SU zona y dé un lugar concreto. Pasa 'lugar' = ese corregimiento o barrio. Devuelve un veredicto determinista con 'respuesta_sugerida' ya armada: el método puede ser entrega propia (mismo día), RETIRO en un punto Servientrega (en algunas zonas NO hay domicilio), entrega a domicilio Servientrega, o que lo coordine un asesor. RELAYA la respuesta_sugerida sin cambiar el método ni el precio. NO es para el interior del país (usa sucursales_interior) ni para el costo genérico sin sector (usa info_tienda). Si devuelve 'ambiguo', pregunta el corregimiento; 'sin_match'/'error' → deriva o usa sucursales_interior según indique la nota (el método 'asesor' llega como 'ok' con la respuesta ya armada).",
  input_schema: { type: "object", properties: { lugar: { type: "string", description: "Corregimiento o barrio del cliente en la Ciudad de Panamá / San Miguelito (ej. Tocumen, Betania, Juan Díaz, Las Cumbres)." } } },
} as Anthropic.Tool, {
  name: "estado_pedido",
  description: "Consulta el ESTADO / seguimiento del pedido del cliente que está escribiendo (por su WhatsApp, tomado del CONTEXTO — NO pidas ni pases el número). Úsala SOLO cuando el cliente pregunte por el estado, seguimiento o entrega de SU pedido/orden/compra YA hecha (\"¿dónde está mi pedido?\", \"¿ya salió mi orden?\", \"¿cuándo me llega?\", \"número de guía\"). Devuelve 'respuesta_sugerida' ya armada: RELÁYALA sin inventar estados, fechas ni guías. Si el estado es 'sin_pedidos'/'sin_dato'/'error', NO afirmes que el cliente no tiene pedidos (tu vista es PARCIAL): relaya la sugerencia (un asesor lo confirma). NO es para cotizar el costo de un envío (usa tarifa_entrega) ni para pagos/facturas/coordinar una entrega en curso (eso lo maneja un asesor).",
  input_schema: { type: "object", properties: {} },
} as Anthropic.Tool];

// v45: "garantía/devolución" GENERAL ("¿qué garantía tienen?") ya NO va a handoff permanente — era
// inconsistente: BASIC_INFO_RE la trata como política respondible (info_tienda) en modo asistencia, pero
// aquí mandaba al cliente a esperar un humano por una pregunta de política. Ahora la pregunta general la
// responde info_tienda (NEEDS_TOOL_RE la fuerza) y el RECLAMO concreto (intención de devolver / producto
// dañado o defectuoso / aplicar la garantía de una compra) SÍ sigue yendo a humano.
// Sesgo CONSERVADOR: ante ambigüedad ("¿tiene garantía?", "la devolución") se deriva igual que en v44;
// solo la pregunta CLARAMENTE general ("política de devolución", "¿hacen devoluciones?", "¿qué garantía
// tienen?" — plural/sin artículo) pasa a info_tienda. Endurecido tras revisión adversarial pre-deploy:
// la 1ª versión de v45 dejaba pasar "necesito una devolución", "aplicar mi garantía", "me salió dañado".
const HANDOFF_RE = /\b(humano|persona|asesor|agente|reclamo|queja|hablar con alguien|supervisor|quiero devolver|devolver (el|la|lo|los|las|un|una|mi|este|esta|esto|eso)|devolverl[oa]s?|devuelvan|cambiarl[oa]s?|(una|la|mi|su|esa|esta) devoluci[oó]n|(aplicar|usar|reclamar|validar|activar|hacer (v[aá]lida|efectiva)) (la |mi |su )?garant[ií]a|(mi|su) garant[ií]a|en garant[ií]a|tiene garant[ií]a|sali[oó] (mal|malo|mala|da[ñn]ad[oa]|defectuos[oa])|(lleg[oó]|vino) (mal|malo|mala|da[ñn]ad[oa]|roto|rota|defectuos[oa])|defectuos[oa]s?|me vendieron (uno|una|algo) (malo|mala|da[ñn]ad[oa]|defectuos[oa]))\b/i;

// Anti-interrupción (guardrail PRE-LLM): señales de un trámite/pago/dato fiscal EN CURSO
// (típicamente atendido por un humano). Si el texto entrante matchea, el bot se ABSTIENE
// (no llama al LLM, solo loggea). Sesgo deliberado: mejor callar que cortar una venta humana.
// Evita matchear preguntas legítimas ("¿aceptan yappy?", "¿dónde retiro?") — esas las
// resuelve info_tienda.
const INTERRUPT_RE = new RegExp([
  // datos fiscales / facturación
  "\\bruc\\b", "\\bdv\\b", "c[eé]dula", "raz[oó]n social", "factura a nombre", "facturar a", "datos (de|para) (la )?factura", "a nombre de",
  "\\b\\d{1,4}-\\d{2,4}-\\d{4,7}\\b", // RUC/cédula PA (ej. 557-538-101617); no matchea fechas (último grupo >=4 dígitos)
  "\\b[a-z]{1,2}-\\d{1,4}-\\d{3,7}\\b", // v45: cédula PA con letra (E-8-104720, PE-12-3456, N-19-1234); no matchea SKUs (GI-190 = 1 solo grupo; FDC-… = 3 letras)
  // pago/comprobante EN CURSO (no "¿aceptan X?" / "¿cómo pago?", que son métodos → info_tienda)
  "le adjunto", "adjunto (el|la|mi) ?(pago|comprobante|transferencia|recibo)", "comprobante", "ya (le |te )?(hice|mand[eé]|envi[eé]|pagu[eé])", "dep[oó]sit",
  "pagar\\s+(ya|ahora|de una|hoy|mañana)", // intención de pagar YA (no "pagar con tarjeta/yappy" — eso no lleva ya/ahora/hoy)
  // v50 (revisión adversarial): pago COMPLETADO sin "ya" — "hice/realicé el pago", "acabo de pagar",
  // "te mandé el pago", "mi pago". Cruzaban NEEDS_TOOL_RE (\bpago/pagar) pero NO INTERRUPT → con la
  // asistencia ampliada, el bot podía responder sobre un pago en curso. Requieren VERBO+sustantivo de pago
  // o "mi/su pago" → NO tocan las PREGUNTAS de método ("¿cómo pago?", "¿aceptan yappy?", "formas de pago").
  "(hice|mand[eé]|pas[eé]|envi[eé]|pagu[eé]|realic[eé]|deposit[eé]|transfer[ií]) (le |te |ya |el |la |mi |su )*(pago|transferencia|dep[oó]sito|comprobante)",
  "acabo de (pagar|transferir|depositar)", "\\b(mi|su) pago\\b",
  "\\btransfiero\\b", "le transfiero", "a qu[eé] cuenta", "n[uú]mero de cuenta", "a d[oó]nde (le |te )?(pago|deposito|transfiero|consigno)", // a dónde pago/transfiero (el bot NUNCA da la cuenta)
  // entrega/retiro EN CURSO
  "mensajer[oa]", "el chico", "va en camino", "que retir", "va a retirar", "pas(o|a|ar[eé]) (el |la )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|mañana|hoy)",
  "(programar|coordinar|agendar|cuadrar|coordinamos|programamos) (la |mi |el )?(entrega|env[ií]o|retiro)",
].join("|"), "i");

// Mensajes que piden datos de catálogo o de la tienda → forzar uso de tool (tool_choice:"any").
// Haiku a veces responde "de memoria" en preguntas genéricas; esto lo obliga a buscar/consultar.
// No incluye saludos/acks (esos no fuerzan tool). garantía/devolución las intercepta HANDOFF_RE.
const NEEDS_TOOL_RE = new RegExp([
  "impresor", "multifuncional", "\\btinta", "t[oó]ner", "toner", "cartuch", "consumible", "\\bpapel", "resma",
  "precio", "cu[aá]nto", "cuesta", "cotiza", "disponib", "stock", "existenc", "\\bmodelo", "\\bvende", "manejan",
  "epson", "canon", "\\bhp\\b", "brother", "pixma", "ecotank", "workforce", "laserjet", "deskjet", "officejet", "\\bg\\d{3,4}\\b", "\\bl\\d{3,4}\\b", "gi-?\\d",
  "env[ií]o", "entrega", "delivery", "domicilio", "horario", "ubicaci", "direcci", "\\bd[oó]nde\\b", "\\bpago", "pagar", "yappy", "\\bach\\b", "transferen", "tarjeta", "reembols",
  "repar", "soporte t[eé]cnico", "averi", "da[ñn]ad", "no enciende", "no prende", "no imprime", "sucursal", "recoger", "retir",
  // v25: catálogo completo (no solo impresión) → fuerza la búsqueda antes de negar.
  "monitor", "pantalla", "esc[aá]ner", "escaner", "scanner", "\\bups\\b", "bater[ií]a", "estabilizador", "regulador", "no.?break",
  "laptop", "port[aá]til", "computador", "comput", "\\bpc\\b", "all.?in.?one", "mouse", "rat[oó]n", "teclado", "webcam", "c[aá]mara",
  "\\bcable", "\\bhdmi\\b", "\\bvga\\b", "\\busb\\b", "adaptador", "disco", "\\bssd\\b", "\\bhdd\\b", "almacenamiento", "memoria", "\\bram\\b", "pendrive",
  "router", "\\bswitch\\b", "access.?point", "\\bwifi\\b", "audifon", "auricular", "parlante", "bocina", "proyector", "accesori", "perif[eé]ric", "tecnolog", "suministr",
  "dell", "lenovo", "\\bjbl\\b", "xtech", "alliance", "tablet",
  // v45: garantía/devolución/cambios GENERAL → fuerza tool (info_tienda tiene la política); el reclamo
  // concreto nunca llega aquí (HANDOFF_RE y el guardrail del prompt lo derivan antes).
  "garant[ií]a", "devoluci", "\\bcambios?\\b",
  // v45: CÓDIGOS/SKU sueltos — el cliente a veces manda SOLO el código (W1105A, CF258A, 7MD68A,
  // BA1U5LA#ABM, FDC-BT15KR-6B) sin palabra de catálogo → antes no forzaba tool y el modelo podía negar
  // de memoria. Dos formas (endurecidas tras revisión adversarial pre-deploy):
  // (a) multi-segmento con guion/# — requiere letra Y dígito, y EXCLUYE la forma de cédula panameña con
  //     letra / ref fiscal ([1-2 letras]-dígitos-dígitos…: E-8-104720, PE-12-3456, F-2024-001 — INTERRUPT_RE
  //     también las atrapa ahora); FDC-BT15KR-6B y GI-190 sí matchean (cabeza de 3 letras / 1 solo grupo).
  // (b) token mixto de 4-10 chars con una LETRA ANTES de un dígito — así horas/cantidades con sufijo
  //     ("10am", "00am" de 9:00am, "24hrs", "1ero", "20usd") NO matchean; W1105A/CF258A/7MD68A/L220 sí.
  //     Trade-off aceptado: un código PURO dígitos+sufijo ("954xl" solo, sin más texto) no fuerza — igual
  //     que antes de v45 (paridad); con cualquier palabra de catálogo ("tinta 954xl") sí.
  "\\b(?![a-z]{1,2}(?:-\\d+){2,}\\b)(?=[a-z0-9#-]*[a-z])(?=[a-z0-9#-]*\\d)[a-z0-9]+(?:[-#][a-z0-9]+)+\\b",
  "\\b(?=[a-z0-9]{4,10}\\b)(?=[a-z0-9]*[a-z][a-z0-9]*\\d)[a-z0-9]+\\b",
  // v48: ESTADO/seguimiento de un PEDIDO ya hecho → fuerza tool (estado_pedido). Targeted (revisión
  // adversarial): NO "pedido/orden" a secas (no forzar en "quiero hacer un pedido"); NO "guía"/"seguimiento"
  // sueltos (evita "guía de instalación", "seguimiento médico"); "\\brastre" con borde evita "arrastre".
  "\\bmis? (pedidos?|[oó]rden(es)?|compras?|paquetes?)\\b",
  "\\brastre", "\\btracking\\b", "n[uú]mero de (gu[ií]a|orden|pedido|seguimiento|rastreo)",
  "seguimiento (de(l)? )?(mi |su |el |la )?(pedido|orden|env[ií]o|entrega|paquete|compra|gu[ií]a)",
  "estado (de(l)? )?(mi |su |la |el )?(pedido|orden|env[ií]o|entrega|compra)",
  "cu[aá]ndo (me |le )?(llega|entregan|lleg[oó])", "ya (sali[oó]|despach)",
].join("|"), "i");

// v31 — pregunta BÁSICA de tienda que el bot SÍ puede adelantar mientras un asesor está ausente
// (handoff-assist): ubicación, horario, formas de pago que aceptamos, envíos/entregas y política de
// devoluciones — todo lo que vive en store_facts (lo responde info_tienda). No incluye precios/productos
// (esta regex no los matchea) ni nada transaccional/fiscal (lo bloquea INTERRUPT_RE, que se evalúa antes).
// "garantía/devolución" caen aquí a propósito (política general); el caso puntual lo sigue el asesor.
// v50 — la asistencia ya NO se limita a esto: el trigger `puedeAsistir` también admite NEEDS_TOOL_RE
// (catálogo/precio/pedido) → el bot hace preventa grounded (buscar_producto) sin retomar la venta.
// Esta regex sigue igual (define solo el subconjunto "info de tienda"); la ampliación es el OR del call site.
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

// v44 — autotest de inventario (diagnóstico). Corre la MISMA consulta Admin que inventarioShopify pero
// devuelve el DETALLE (status HTTP, errores GraphQL, nodos) SIN exponer el token, para ver desde ADENTRO
// por qué el stock no aparece: token inválido → 401/403; falta el scope read_inventory → HTTP 200 con
// `errors` "Access denied for totalInventory … read_inventory" (lo que inventarioShopify traga en silencio
// → deriva); base mal → 404. Gated por ?key= en el healthcheck GET. NUNCA incluye el token (solo su largo).
async function inventarioSelfTest(pid: string): Promise<Record<string, unknown>> {
  const base = {
    configured: !!(SHOPIFY_ADMIN_TOKEN && SHOPIFY_ADMIN_API_BASE),
    token_present: !!SHOPIFY_ADMIN_TOKEN,
    token_len: SHOPIFY_ADMIN_TOKEN.length, // longitud, NUNCA el token
    api_base: SHOPIFY_ADMIN_API_BASE || null,
    pid,
  };
  if (!SHOPIFY_ADMIN_TOKEN || !SHOPIFY_ADMIN_API_BASE) return { ...base, ok: false, diagnostico: "faltan_secretos" };
  const gid = `gid://shopify/Product/${String(pid).replace(/\D/g, "")}`;
  if (!/\d/.test(gid)) return { ...base, ok: false, diagnostico: "pid_invalido" };
  try {
    const query = "query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id title totalInventory } } }";
    const r = await fetch(`${SHOPIFY_ADMIN_API_BASE}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN },
      body: JSON.stringify({ query, variables: { ids: [gid] } }),
      signal: AbortSignal.timeout(6000),
    });
    let j: any = null;
    try { j = await r.json(); } catch { /* respuesta no-JSON (p.ej. 401 con HTML) */ }
    const nodes = ((j?.data?.nodes ?? []) as any[]).map((n) => ({ id: n?.id ?? null, title: n?.title ?? null, totalInventory: n?.totalInventory ?? null }));
    const errs = j?.errors ?? null;
    const diagnostico = !r.ok
      ? (r.status === 401 || r.status === 403 ? "token_invalido_o_sin_permiso" : `http_${r.status}`)
      : (errs?.length ? "graphql_error_probable_falta_scope_read_inventory"
        : (nodes.length && typeof nodes[0].totalInventory === "number" ? "ok_inventario_visible" : "sin_nodos"));
    return { ...base, http_status: r.status, ok: r.ok && !errs?.length, graphql_errors: errs, nodes, diagnostico };
  } catch (e) {
    return { ...base, ok: false, diagnostico: "excepcion", error: String(e).slice(0, 200) };
  }
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

// v43 — sucursales de recogida en el INTERIOR (red Servientrega, 45 puntos). Datos del listado oficial
// (web/envios-interior-sucursal.html = la página /pages/envios-al-interior). El bot NUNCA debe inventar
// sucursales/direcciones/teléfonos: esta tool los da GROUNDED. El modelo aporta la geografía (qué provincia
// es cada ciudad) para enrutar; los DATOS salen de aquí. Si la red Servientrega cambia, actualizar esta lista.
const SUCURSALES_URL = "https://quickservicepanama.com/pages/envios-al-interior";
const SUCURSALES: { prov: string; nombre: string; datos: string }[] = [
  { prov: "Panamá", nombre: "CDS Parque Lefevre", datos: "2133000 · Lun–Vie 8:00 AM–7:00 PM · Sáb 8:00 AM–3:00 PM" },
  { prov: "Panamá", nombre: "CDS Plaza Aventura – El Dorado", datos: "62069207 · Lun–Vie 8:00 AM–5:30 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá", nombre: "CDS Plaza Concordia – Vía España", datos: "62527762 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá", nombre: "CDS Paitilla – Vía Italia", datos: "63003052 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá", nombre: "CDS Logística Móvil", datos: "62069238 · Lun–Vie 8:00 AM–5:30 PM · Sáb 8:00 AM–1:30 PM" },
  { prov: "Panamá", nombre: "CDS Los Andes Mall – San Miguelito", datos: "62821785 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá", nombre: "CDS Mañanitas", datos: "62034204 · Lun–Vie 8:00 AM–5:00 PM · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá", nombre: "AV Perugraff (Torti)", datos: "69797445 · Lun–Sáb 9 AM–6 PM" },
  { prov: "Panamá", nombre: "AV TSB Cargo San Francisco", datos: "3736590 / +507 6720-9891 · Lun–Vie 8 AM–5 PM · Sáb 9 AM–2 PM · Dom 10 AM–2 PM" },
  { prov: "Panamá", nombre: "AV Cargo Box Express (Hato Pintado)", datos: "+507 67768244 / 2754225 · Lun–Vie 9 AM–6 PM · Sáb 9 AM–2 PM" },
  { prov: "Panamá", nombre: "AV Mr. Mail – El Dorado", datos: "+507 6607-2164 · Lun–Vie 10 AM–5:30 PM · Sáb 10 AM–1:30 PM" },
  { prov: "Panamá", nombre: "AV Mr Mail – Vía Argentina", datos: "+507 6672-6745 · Lun–Vie 10 AM–5:30 PM · Sáb 9 AM–1 PM" },
  { prov: "Panamá", nombre: "AV Compucel Chepo", datos: "+507 62223298 · Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM" },
  { prov: "Panamá", nombre: "AV Shop Box Don Bosco", datos: "+507 65007378 / 66150948 · Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM" },
  { prov: "Panamá", nombre: "AV Nuevo Tocumen Shopline", datos: "+507 64373481 · Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM" },
  { prov: "Panamá Oeste", nombre: "CDS Chorrera", datos: "63003046 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Panamá Oeste", nombre: "AV PtyBuy Express Arraiján", datos: "6780-9187 · Lun–Vie 10 AM–6 PM · Sáb 10 AM–3 PM" },
  { prov: "Panamá Oeste", nombre: "AV Kabak Store Coronado", datos: "+507 66367979 / 349-6301 · Lun–Vie 9:30 AM–6 PM · Sáb 9 AM–3 PM" },
  { prov: "Panamá Oeste", nombre: "AV Western Union Chorrera Guadalupe", datos: "+507 6133-4883 · Lun–Vie 8 AM–5 PM · Sáb 8 AM–1 PM" },
  { prov: "Colón", nombre: "CDS Colón", datos: "62069261 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Colón", nombre: "AV Colón Cristóbal Este (Service Freight Jare)", datos: "+507 62996136 / 69250730 · Lun–Sáb 8 AM–5 PM" },
  { prov: "Colón", nombre: "AV Colón San Juan El 20 (Curiosidades Thamara)", datos: "+507 63907939 · Lun–Vie 9 AM–6 PM · Sáb 9 AM–5 PM" },
  { prov: "Coclé", nombre: "CDS Aguadulce", datos: "62822609 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Coclé", nombre: "CDS Penonomé", datos: "62069222 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Coclé", nombre: "AV El Valle de Antón (Valle Express)", datos: "6983-8292 · Lun–Vie 8 AM–5 PM · Sáb 8 AM–1 PM" },
  { prov: "Herrera", nombre: "CDS Chitré", datos: "62822831 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12:30–1:30) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Los Santos", nombre: "CDS Las Tablas", datos: "Calle Joaquín Pablo Franco, frente a La Paulina Café · Teléfono y horario: por confirmar" },
  { prov: "Los Santos", nombre: "AV Guararé (Malala)", datos: "+507 68763077 / 9945246 · Lun–Vie 8 AM–5 PM · Sáb 9 AM–2 PM" },
  { prov: "Los Santos", nombre: "AV Tonosí (Hostal Victoria)", datos: "+507 66432936 · Lun–Vie 8 AM–3:30 PM · Sáb 8 AM–12 MD" },
  { prov: "Veraguas", nombre: "CDS Santiago", datos: "62382594 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Chiriquí", nombre: "CDS David Centro Calle 4ta", datos: "62821798 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Chiriquí", nombre: "CDS David El Rocío", datos: "62069219 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 12–1) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Chiriquí", nombre: "AV Concepción Bugaba", datos: "+507 788-3060 / 6733-7049 / 6629-3267 · Lun–Vie 9:00 AM–5:30 PM · Sáb 9:00 AM–2:00 PM (Dom cerrado)" },
  { prov: "Chiriquí", nombre: "AV Río Sereno (Farmacia Don Andrés)", datos: "+507 6551-2690 · Lun–Sáb 8 AM–2 PM y 4 PM–6 PM" },
  { prov: "Chiriquí", nombre: "AV Volcán (Alfa Cell)", datos: "+507 6557-9415 / 6115-3333 · Lun–Sáb 9 AM–5 PM" },
  { prov: "Chiriquí", nombre: "AV Monchis Compras (Tolé)", datos: "+507 62125251 · Lun–Vie 8 AM–4 PM · Sáb 9 AM–1 PM" },
  { prov: "Chiriquí", nombre: "AV Rapid Service Barú", datos: "+507 6585-2214 · Lun–Sáb 9 AM–5 PM" },
  { prov: "Chiriquí", nombre: "AV E-Box Express (Paso Canoas)", datos: "+507 6924-9023 · Lun–Vie 10 AM–6 PM · Sáb 9 AM–2 PM" },
  { prov: "Bocas del Toro", nombre: "CDS Changuinola", datos: "62311466 · Lun–Vie 8:00 AM–5:00 PM (almuerzo 1–2) · Sáb 8:00 AM–1:00 PM" },
  { prov: "Bocas del Toro", nombre: "AV Almirante", datos: "+507 6500-3365 / 6471-8191 · Lun–Vie 9:00 AM–6:00 PM · Sáb 9:00 AM–5:00 PM" },
  { prov: "Bocas del Toro", nombre: "AV Bocas Island Express", datos: "+507 760-8459 · Lun–Vie 8:30 AM–4:30 PM · Sáb 8:30 AM–2:00 PM" },
  { prov: "Bocas del Toro", nombre: "AV Chiriquí Grande (Zamarci)", datos: "+507 6285-0553 / 6236-3712 · Lun–Sáb 8:00 AM–4:00 PM" },
  { prov: "Darién", nombre: "AV Metetí Darién (Valeria's)", datos: "+507 6168-5748 · Lun–Sáb 9 AM–5 PM" },
  { prov: "Otras ubicaciones", nombre: "AV Servicios y Utilería M&C", datos: "+507 64540865 · Lun–Sáb 8:30 AM–7:00 PM" },
  { prov: "Otras ubicaciones", nombre: "AV Jece Soluciones", datos: "+507 308-6977 / 62132930 / 6201-7543 · Lun–Vie 8 AM–5 PM · Sáb 8 AM–12 PM" },
];
// Devuelve los puntos de recogida del interior que coincidan con `lugar` (provincia o ciudad). Match por
// substring sin acentos contra provincia y nombre del punto. Sin `lugar`: resumen por provincia. Sin
// coincidencia: invita a dar la provincia + el listado completo. NUNCA inventa: solo lo de SUCURSALES.
function sucursalesInterior(lugar: string = ""): string {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i").replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n").trim();
  const q = norm(lugar);
  if (!q) {
    const provs = [...new Set(SUCURSALES.map((s) => s.prov))].map((p) => `${p} (${SUCURSALES.filter((s) => s.prov === p).length})`);
    return JSON.stringify({ resultado: "pide la provincia o ciudad del cliente para dar el punto exacto", provincias_con_puntos: provs, listado_completo: SUCURSALES_URL });
  }
  const hits = SUCURSALES.filter((s) => { const p = norm(s.prov), n = norm(s.nombre); return p.includes(q) || q.includes(p) || n.includes(q); });
  if (!hits.length) {
    return JSON.stringify({ resultado: `no hay un punto que coincida con "${lugar}"`, sugerencia: "si sabes la provincia (Chiriquí, Coclé, Los Santos, etc.), vuelve a buscar por la provincia; o comparte el listado completo", listado_completo: SUCURSALES_URL });
  }
  return JSON.stringify({ sucursales: hits.slice(0, 8).map((h) => ({ provincia: h.prov, nombre: h.nombre, datos: h.datos })), total_coincidencias: hits.length, listado_completo: SUCURSALES_URL });
}

// v47 — TARIFA/MÉTODO DE ENVÍO POR SECTOR (Ciudad de Panamá + San Miguelito). El veredicto lo calcula el
// resolver determinista de Postgres (resolver_tarifa; fuente única = tablas zonas_entrega/sectores_entrega),
// y el fraseo se arma en CÓDIGO (frasearTarifa) para que el bot NO confunda el método — el error a evitar es
// ofrecer "entrega a domicilio" donde SOLO hay retiro en un agente verde. frasearTarifa es puro (testeable).
function frasearTarifa(v: any): Record<string, unknown> {
  const fmt = (x: any) => { if (x === null || x === undefined) return ""; const n = Number(x); return isFinite(n) ? n.toFixed(2) : ""; };
  const estado = v?.estado;
  if (estado === "sin_match") {
    return { estado: "sin_match", consulta: v.consulta ?? null,
      nota: "Ese lugar no está en la cobertura metro (Ciudad de Panamá / San Miguelito). Si el cliente es del INTERIOR, usa sucursales_interior + info_tienda (tarifa/plazo del interior). Si no lo ubicas, deriva a un asesor para que cotice." };
  }
  if (estado === "ambiguo") {
    const desc = (o: any) => o.metodo === "retiro_agente_verde" ? `retiro por B/.${fmt(o.tarifa_usd)}`
      : o.metodo === "asesor" ? "lo coordina un asesor" : `B/.${fmt(o.tarifa_usd)} a domicilio`;
    const ops = (v.opciones ?? []).map((o: any) => `${o.corregimiento} (${desc(o)})`);
    return { estado: "ambiguo", opciones: v.opciones ?? [],
      respuesta_sugerida: `Hay más de una zona con ese nombre y el envío cambia según cuál: ${ops.join("; ")}. ¿En qué corregimiento se encuentra, para confirmarle el costo exacto?` };
  }
  if (estado === "ok") {
    const met = v.metodo;
    const t = fmt(v.tarifa_usd);
    let msg = "";
    if (met === "retiro_agente_verde") {
      msg = `En su zona no hacemos entrega a domicilio, pero puede retirar su pedido en un punto Servientrega (${v.puntos_retiro || "un punto Servientrega cercano; un asesor le indica cuál"}). El costo es B/.${t} y estaría listo para retirar al día hábil siguiente.`;
    } else if (met === "servientrega") {
      msg = `A su zona entregamos a domicilio por B/.${t}, al día hábil siguiente (vía Servientrega).`;
    } else if (met === "asesor") {
      msg = `Para su zona, un asesor coordina la entrega y el costo según la dirección exacta; con gusto le paso con un asesor.`;
    } else { // propia
      msg = `El envío a su zona es B/.${t} (${v.plazo}).`;
    }
    if (v.confianza === "Media" && met !== "asesor") msg += " Un asesor confirma el costo exacto al cerrar, según la dirección.";
    return { estado: "ok", metodo: met, tarifa_usd: v.tarifa_usd ?? null, puntos_retiro: v.puntos_retiro ?? null,
      plazo: v.plazo ?? null, confianza: v.confianza ?? null, respuesta_sugerida: msg };
  }
  return { estado: estado ?? "desconocido", nota: "No se pudo resolver; usa info_tienda (genérico) o deriva a un asesor." };
}

async function tarifaEntrega(lugar: string = ""): Promise<string> {
  const q = String(lugar ?? "").trim();
  if (!q) return JSON.stringify({ estado: "sin_dato", nota: "Pide al cliente su corregimiento o barrio (Ciudad de Panamá / San Miguelito) para dar el costo de envío exacto." });
  try {
    const { data, error } = await sb.rpc("resolver_tarifa", { p_lugar: q });
    if (error) throw new Error(error.message);
    return JSON.stringify(frasearTarifa(data));
  } catch (e) {
    await log("error", false, { fase: "tarifa_entrega", error: String(e).slice(0, 200) });
    return JSON.stringify({ estado: "error", nota: "No se pudo calcular la tarifa; usa info_tienda (genérico) o deriva a un asesor." });
  }
}

// v48 — CONCIENCIA DE PEDIDOS. La lectura la hace el RPC estado_pedido (fuente única = tabla `pedidos`, que
// escriben las funciones de despacho: shopify-webhook / shipday-status / wati-order — ver
// docs/handoff-pedidos-conciencia.md). El fraseo se arma en CÓDIGO (frasearPedido, puro/testeable) para que
// el bot NO invente estados/fechas/guías: relaya SOLO lo que la tabla tiene. Si no hay pedido visible, NO
// afirma "usted no tiene pedidos" (la vista del bot es PARCIAL: hay pedidos manuales/viejos que no ve) →
// deriva a un asesor. El wa_id sale del CONTEXTO, nunca del modelo (privacidad: no se consulta a nadie más).
function frasearPedido(v: any): Record<string, unknown> {
  // Frase por estado NORMALIZADO. Local (no módulo) para que el golden test lo extraiga self-contained.
  const FRASE = {
    nuevo: "está registrado y en preparación",
    asignado: "ya fue asignado para su despacho",
    en_camino: "va en camino",
    entregado: "figura como entregado",
    fallido: "tuvo un inconveniente en la entrega; un asesor lo contacta",
    cancelado: "figura como cancelado",
    desconocido: "está en proceso",
  };
  // Filtra elementos no-objeto (defensa, finding 7: el RPC nunca los emite, pero un jsonb raro no debe
  // tumbar la respuesta). Si no queda nada usable → sin_pedidos (deriva; no afirma que no tiene pedidos).
  const items = (v?.estado === "ok" && Array.isArray(v?.pedidos))
    ? v.pedidos.filter((p: any) => p && typeof p === "object") : [];
  if (!items.length) {
    return { estado: "sin_pedidos",
      respuesta_sugerida: "No veo el estado de un pedido a su nombre en este momento. Con gusto un asesor se lo confirma; si tiene el número de pedido a mano, compártalo y lo revisamos." };
  }
  const frase = (p: any) => {
    const ref = p.pedido_ref ? `Su pedido ${p.pedido_ref}` : "Su pedido";
    let s = `${ref} ${FRASE[p.estado] || "está en proceso"}.`;
    if (p.tracking && (p.estado === "en_camino" || p.estado === "asignado")) {
      s += p.metodo === "servientrega" ? ` Puede rastrearlo con la guía ${p.tracking}.` : ` Puede seguirlo aquí: ${p.tracking}.`;
    }
    return s;
  };
  const msg = items.length === 1
    ? frase(items[0])
    : "Encontré estos pedidos a su nombre: " +
      items.map((p: any) => `${p.pedido_ref || "un pedido"} (${FRASE[p.estado] || "en proceso"})`).join("; ") + ".";
  // v48 (revisión adversarial F1): devolver SOLO la respuesta fraseada en CÓDIGO — NO el array crudo de
  // pedidos. Si se pasara `v.pedidos` al modelo, vería estado_raw/total_usd/resumen (p.ej. un "ETA 07/08
  // 3:45pm" en estado_raw, o un precio) y podría emitir una FECHA de entrega o un PRECIO fuera de
  // buscar_producto — rompiendo el grounding. `respuesta_sugerida` ya trae ref/estado/tracking; con eso basta.
  return { estado: "ok", respuesta_sugerida: msg };
}

async function estadoPedido(waId: string = ""): Promise<string> {
  const wa = String(waId ?? "").replace(/\D/g, "");
  if (wa.length < 6) return JSON.stringify({ estado: "sin_dato", nota: "No hay un número de cliente en el contexto; deriva a un asesor para revisar el pedido." });
  try {
    const { data, error } = await sb.rpc("estado_pedido", { p_wa_id: wa });
    if (error) throw new Error(error.message);
    return JSON.stringify(frasearPedido(data));
  } catch (e) {
    await log("error", false, { fase: "estado_pedido", error: String(e).slice(0, 200) });
    return JSON.stringify({ estado: "error", nota: "No se pudo consultar el estado del pedido; deriva a un asesor para que lo revise." });
  }
}

async function responderLLM(history: { role: string; content: string; model?: string | null; created_at?: string | null }[], forceTool: boolean, imagenes?: { b64: string; mediaType: string }[] | null, imagenFallo?: boolean, waId: string = "", atributos: Record<string, string> = {}, linksTracked: Record<string, string> = {}, modoAsistencia: boolean = false): Promise<{ text: string | null; toolCalls: unknown[]; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number }> {
  if (!anthropic) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
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
  // v36 — el próximo horario hábil va CALCULADO (no lo deduce el LLM): a la 1am del martes decía
  // "miércoles 1 de julio" en vez de "hoy a las 9am". Se inyecta TAL CUAL para que no lo recalcule.
  // v37 — si hoy es feriado, se aclara (la tienda está cerrada) y el próximo hábil ya salta el feriado.
  const feriadoHoy = esFeriado(new Date(ahoraMs - 5 * 3600 * 1000));
  const ctxHorario = hh.dentro ? "" :
    `\n\nCONTEXTO HORARIO: Ahora es ${DIAS_SEM[hh.dia]} ~${hh.hora}:00 en Panamá${feriadoHoy ? " y hoy es FERIADO nacional en Panamá (la tienda está cerrada)" : ""}, FUERA del horario de atención de QSP (atención por WhatsApp y tienda: Lun-Vie 9:00am–5:00pm; sábados, domingos y feriados cerrado). Sigue ayudando con lo automático (precio/ITBMS, stock, info de tienda). Pero si el cliente necesita un asesor, una cotización formal o coordinar pago/entrega, aclara con calma que un asesor le responderá en el próximo horario hábil, que es ${proximoHorarioHabil(ahoraMs)} (usa esa fecha/hora TAL CUAL, NO la recalcules), y NO prometas respuesta humana inmediata.`;
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
  // v35 — prompt caching: el prefijo estable (tools + SYSTEM_PROMPT) se cachea con un solo
  // cache_control al final del bloque grande; el contexto VOLÁTIL (que cambia cada turno: el
  // CONTEXTO TEMPORAL con la hora actual, si es nuevo/en curso, horario, datos del cliente o el
  // sufijo de asistencia) va en un 2º bloque SIN cache_control, DESPUÉS del breakpoint, para no
  // invalidar el caché. Render order de la API: tools → system → messages; con el breakpoint al
  // final de SYSTEM_PROMPT, tools + SYSTEM_PROMPT quedan cacheados (lectura 0.1×). Resultado: ~misma
  // salida, input mucho más barato en turnos con cache-hit (verificar con usage.cache_read_input_tokens).
  const systemDinamico = ctx + ctxAhora + ctxHorario + (modoAsistencia ? ASSIST_SUFFIX : ctxDatos);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: systemDinamico },
  ];
  // v50 — en asistencia el bot ahora hace PREVENTA grounded: buscar_producto (precio/ITBMS/stock/link),
  // info_tienda, sucursales_interior y estado_pedido. Sigue FUERA: guardar_lead (no captura datos del
  // cliente con un humano a cargo) y tarifa_entrega (cotizar método+precio de envío COMPROMETE una entrega
  // —v47—; si en asistencia preguntan el costo, cae a info_tienda genérico, no comprometido). ASSIST_SUFFIX
  // gobierna qué NO cerrar/coordinar; INTERRUPT_RE ya bloqueó pago/fiscal/coordinar entrega antes de llegar.
  const toolsActivas = modoAsistencia ? TOOLS.filter((t) => ["buscar_producto", "info_tienda", "sucursales_interior", "estado_pedido"].includes(t.name)) : TOOLS;
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
  if (!messages.length) return { text: null, toolCalls: [], tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 };
  // v19 (visión) + v49 (ráfaga): adjunta las imágenes del cliente al ÚLTIMO mensaje de usuario. Con el
  // debounce, ese mensaje puede ser texto ("¿estas no hay?") y las fotos venir de mensajes anteriores de
  // la misma ráfaga — se adjuntan TODAS (máx 3) en orden cronológico, antes del texto.
  if (((imagenes && imagenes.length) || imagenFallo) && messages.length) {
    const last = messages[messages.length - 1];
    if (last.role === "user" && typeof last.content === "string") {
      const cap = (last.content && last.content !== "[imagen]" && last.content !== "(vacío)") ? last.content : "";
      if (imagenes && imagenes.length) {
        last.content = [
          ...imagenes.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType as any, data: im.b64 } })),
          { type: "text", text: cap || "El cliente envió esta(s) imagen(es). Si muestran un producto, identifica marca y modelo y búscalo con buscar_producto." },
        ] as any;
      } else {
        last.content = (cap ? cap + " " : "") + "[Nota interna: el cliente envió una imagen que no se pudo cargar. Pídele el modelo exacto o deriva a un asesor.]";
      }
    }
  }
  const toolCalls: unknown[] = [];
  let tokensIn = 0, tokensOut = 0;
  // v38 — telemetría de prompt caching: acumular tokens leídos/escritos al caché por turno (sumando
  // las iteraciones del loop de tool-use). input_tokens NO los incluye; estos dan el ahorro $ exacto.
  let cacheRead = 0, cacheWrite = 0;
  for (let i = 0; i < 4; i++) {
    // v21: garantía dura — la conversación SIEMPRE termina en mensaje de usuario antes de CADA
    // llamada al modelo (cierra el error 400 "does not support assistant message prefill").
    while (messages.length && messages[messages.length - 1].role === "assistant") messages.pop();
    if (!messages.length) break;
    const resp = await anthropic.messages.create({
      // v39: thinking EXPLÍCITAMENTE apagado. En Sonnet 4.6 omitirlo ya es "sin pensar" (no-op),
      // pero en Sonnet 5 omitirlo enciende adaptive thinking por defecto → latencia/tokens extra y
      // riesgo de truncar la respuesta con max_tokens=1024. Dejarlo fijo hace seguro probar Sonnet 5
      // (cambiando solo COPILOT_MODEL) sin que el bot empiece a "pensar" en cada turno.
      model: MODEL, max_tokens: 1024, thinking: { type: "disabled" }, system, tools: toolsActivas, messages,
      ...(i === 0 && forceTool ? { tool_choice: { type: "any" as const } } : {}),
    });
    tokensIn += resp.usage.input_tokens; tokensOut += resp.usage.output_tokens;
    cacheRead += resp.usage.cache_read_input_tokens ?? 0; cacheWrite += resp.usage.cache_creation_input_tokens ?? 0;
    if (resp.stop_reason !== "tool_use") {
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      return { text: text || null, toolCalls, tokensIn, tokensOut, cacheRead, cacheWrite };
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
          : block.name === "sucursales_interior"
          ? sucursalesInterior((block.input as any).lugar ?? "")
          : block.name === "tarifa_entrega"
          ? await tarifaEntrega((block.input as any).lugar ?? "")
          : block.name === "estado_pedido"
          ? await estadoPedido(waId)
          : JSON.stringify({ error: "tool desconocida" });
        results.push({ type: "tool_result", tool_use_id: block.id, content: out });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: null, toolCalls, tokensIn, tokensOut, cacheRead, cacheWrite };
}

// Limpia formato que WhatsApp NO renderiza (si no, se ve literal): links markdown [texto](url) → URL
// pelada, y dobles asteriscos → uno solo. (v16 — estilo)
function limpiarWhatsApp(t: string): string {
  return t
    .replace(new RegExp("\\[([^\\]]*)\\]\\((https?://[^)\\s]+)\\)", "g"), "$2")
    .replace(new RegExp("\\*\\*([^*\\n]+)\\*\\*", "g"), "*$1*");
}

// v44 — detecta cuando el modelo ESCRIBE la llamada a una herramienta como TEXTO (en vez de invocarla de
// forma nativa) y se filtraría al cliente como XML crudo. Visto en Sonnet 5 (raro): <invoke
// name="buscar_producto"><parameter name="consulta">…</parameter></invoke>. Cubre las variantes con y sin
// el prefijo antml: y, como respaldo, cualquier atributo name="<tool nuestra>". El bot escribe español de
// ventas, nunca etiquetas ni nombres de tool entre comillas → riesgo de falso positivo insignificante.
function pareceFuncionEnTexto(t: string): boolean {
  if (!t) return false;
  return /<\s*\/?\s*(antml:)?(invoke|function_calls|parameter)\b/i.test(t)
    || /\bname\s*=\s*"(buscar_producto|info_tienda|guardar_lead|sucursales_interior)"/i.test(t);
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
    // v45: no guardar el email completo en job_log (PII); el dato real ya quedó en los atributos de WATI.
    await log("lead_capturado", r.ok, { waId, campos: params.map((x) => x.name), email_dominio: e.includes("@") ? e.split("@")[1] : null, wati_status: r.status });
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
    // v44 — autotest de inventario (diagnóstico), gated por ?key= (NO expone el token). Uso:
    //   GET ?key=<WEBHOOK_KEY>&selftest=inventario[&pid=<product_id>]
    // Corre la consulta Admin totalInventory desde ADENTRO y reporta status/errores/nodos, para ver por qué
    // el stock no aparece (token inválido → 401/403; falta scope → HTTP 200 con "Access denied … read_inventory").
    if (url.searchParams.get("selftest") === "inventario") {
      // v45: acepta COPILOT_DIAG_KEY (si existe) además de la WEBHOOK_KEY, para diagnosticar sin pasear
      // la key del webhook en URLs/navegadores.
      const k = url.searchParams.get("key");
      if (k !== WEBHOOK_KEY && !(DIAG_KEY && k === DIAG_KEY)) return Response.json({ error: "forbidden" }, { status: 403 });
      const pid = (url.searchParams.get("pid") ?? "1167574466607").replace(/\D/g, "") || "1167574466607";
      const diag = await inventarioSelfTest(pid);
      return Response.json({ selftest: "inventario", ...diag, ts: new Date().toISOString() });
    }
    return Response.json({ status: "ok", function: "copilot-webhook", version: "v51-reengage", mode: MODE, mode_raw: MODE_RAW, model: MODEL, llm_configured: !!anthropic, wati_send_configured: !!(WATI_API_TOKEN && WATI_API_BASE), inventario_configurado: !!(SHOPIFY_ADMIN_TOKEN && SHOPIFY_ADMIN_API_BASE), resolve_configured: !!RESOLVE_SECRET, webhook_key_es_default: WEBHOOK_KEY_ES_DEFAULT, handoff_assist_min: HANDOFF_ASSIST_MIN, handoff_cold_hours: HANDOFF_COLD_HOURS, debounce_ms: DEBOUNCE_MS, live_targets: MODE === "live" ? (LIVE_ALL ? "all" : LIVE_ALLOWLIST.length) : 0, ts: new Date().toISOString() });
  }
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (url.searchParams.get("key") !== WEBHOOK_KEY) return Response.json({ error: "forbidden" }, { status: 403 });

  // v45: tope de tamaño del payload — los webhooks de WATI son chicos (el media llega como URL, no como
  // bytes); un body enorme es un error o abuso. Se chequea el header (fast path) Y el body real (el
  // header puede faltar —chunked— o mentir; el límite duro de memoria lo pone la plataforma).
  const clen = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (clen > 262144) return Response.json({ error: "payload_too_large" }, { status: 413 });

  let p: any;
  try {
    const raw = await req.text();
    if (raw.length > 262144) return Response.json({ error: "payload_too_large" }, { status: 413 });
    p = JSON.parse(raw);
  } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

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

  // v51 — evento de PLANTILLA saliente (WATI "Template Message Sent"): p.ej. el cron de re-enganche
  // (reengage-expired) le mandó una plantilla HSM a un cliente cuya ventana expiró, o un asesor disparó una
  // plantilla (captura de dirección). NO es un asesor escribiendo: si cayera en el path owner=true de abajo
  // se marcaría un HANDOFF FALSO y arrancaría el reloj de asesor (el cliente que responda quedaría en modo
  // asistencia en vez de ser atendido por el bot). Se registra y se salta. (El eventType real se ve en el
  // log `evento_plantilla_saliente`; el guard es amplio a propósito: cualquier evento de plantilla saliente.)
  if (eventType.includes("template") || eventType.includes("plantilla")) {
    await log("evento_plantilla_saliente", true, { waId: waId || null, eventType });
    return Response.json({ ok: true, skipped: "template_message_sent" });
  }

  // Mensaje del NEGOCIO (owner=true): asesor humano/automático, o el ECO de un envío propio del bot.
  if (esDelNegocio && waId && texto && tipo === "text") {
    const { data: convH } = await sb.from("conversations").select("id,status").eq("wa_id", waId).maybeSingle();
    if (convH?.id) {
      // ¿Eco de un envío propio reciente del bot? (mismo texto, respuesta del bot < 5 min) → ignorar.
      const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      // v45: `.or(model.is.null,…)` — con `.neq` solo, una fila con model NULL queda EXCLUIDA (NULL <>
      // 'human-agent' es NULL en SQL) → el eco de la despedida fija (que se insertaba sin model) se
      // guardaba como asesor fantasma. Cinturón y tirantes: la despedida ahora también lleva model.
      const { data: eco } = await sb.from("messages").select("id").eq("conversation_id", convH.id)
        .eq("role", "assistant").or("model.is.null,model.neq.human-agent").eq("content", texto).gte("created_at", desde).limit(1);
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
    // v45: el volcado COMPLETO del payload (diagnóstico v18.1) ya cumplió su propósito (descubrir el
    // shape de media de WATI) y metía texto libre/PII del cliente en job_log. Ahora solo campos de
    // diagnóstico: las llaves del payload (para detectar shapes nuevos) + tipo/URL del media.
    const muestra: Record<string, unknown> = {
      keys: Object.keys(p ?? {}).slice(0, 40),
      type: p?.type ?? null,
      filename: p?.filename ?? null,
      mimeType: p?.mimeType ?? p?.mime_type ?? null,
      data: typeof p?.data === "string" ? p.data.slice(0, 160) : null, // URL del media (debug de descarga)
    };
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
    // v49: se guarda la URL del media — antes solo quedaba "[imagen]" y una foto que llegaba ANTES del
    // último mensaje de la ráfaga era imposible de recuperar (el ganador no podía verla). Requiere la
    // migración 20260708150000_messages_media_url (aplicarla ANTES de desplegar v49).
    const ins = await sb.from("messages").insert({ conversation_id: conv.id, role: "user", content: contenido.slice(0, 4000), mode: MODE, wati_message_id: watiMsgId, media_url: esImagenCliente ? (String(p.data ?? "").slice(0, 500) || null) : null }).select("id,created_at");
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
      // v50 — asistencia ampliada a PREVENTA: además de las preguntas básicas de tienda (BASIC_INFO_RE),
      // ahora también asiste ante catálogo/precio/stock/estado de pedido (NEEDS_TOOL_RE) → el bot da precios
      // grounded (buscar_producto) sin retomar la venta. Guardrails ANTES del OR (revisión adversarial v50):
      // INTERRUPT_RE (pago/fiscal/coordinar entrega en curso) y HANDOFF_RE (reclamo/devolución/garantía/
      // "quiero un asesor") bloquean la asistencia → esos casos los lleva el humano, el bot calla.
      const puedeAsistir = !!ultHumano && !frio && minsSinHumano >= HANDOFF_ASSIST_MIN
        && conv.turns_today <= MAX_TURNS_DIA && !interrumpe && !HANDOFF_RE.test(texto)
        && (BASIC_INFO_RE.test(texto) || NEEDS_TOOL_RE.test(texto));

      if (frio) {
        // COLD-RETURN: el asesor lleva >umbral sin escribir → conversación fría. El bot la retoma por
        // completo: la marcamos 'bot' y NO retornamos (cae al flujo normal de abajo: turnos/INTERRUPT/
        // HANDOFF/LLM completo). Si el asesor vuelve durante el LLM, owner=true la regresa a handoff y
        // el anti-carrera (justo antes de enviar) evita pisarlo.
        await sb.from("conversations").update({ status: "bot" }).eq("id", conv.id);
        conv.status = "bot";
        await log("handoff_cold_return", true, { waId, horas_sin_humano: Math.round(minsSinHumano / 60) });
      } else if (puedeAsistir) {
        // ASISTENCIA: tarea aparte en segundo plano. v50 — el bot hace PREVENTA grounded (precio/stock vía
        // buscar_producto, info de tienda, puntos del interior, estado de pedido), pero NO saca la
        // conversación de handoff, NO cierra/coordina la venta y NO le quita el caso al asesor.
        const asistir = (async () => {
          try {
            if (DEBOUNCE_MS > 0) await new Promise((res) => setTimeout(res, DEBOUNCE_MS)); // v49: misma espera de ráfaga
            if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "asist-pre" }); return; }
            const { data: hist } = await sb.from("messages").select("role,content,model,created_at").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);
            const history = (hist ?? []).reverse();
            // v50 — asistencia hace preventa grounded. forceTool=FALSE a propósito (revisión adversarial):
            // aquí la respuesta correcta suele ser CALLARSE (el humano lleva el caso), así que NO forzamos una
            // tool — el modelo puede devolver vacío ante un pago/descuento/cotización/reclamo (guiado por
            // ASSIST_SUFFIX) en vez de ser empujado a cotizar. El grounding se mantiene por la REGLA DE ORO +
            // ASSIST_SUFFIX ("todo debe salir de una herramienta, nunca de memoria"). modoAsistencia=true acota
            // las tools. linksTracked + reaplicarTracking reponen el tracking de buscar_producto (v29).
            const linksTracked: Record<string, string> = {};
            const r = await responderLLM(history as any, false, null, false, waId, {}, linksTracked, true);
            let salida = r.text ? reaplicarTracking(limpiarWhatsApp(r.text), linksTracked) : null;
            // v44 guard anti-fuga: si la tool-call se filtró como texto, no la enviamos (aquí un humano ya
            // tiene el caso → basta con no responder). Loggea para telemetría.
            if (salida && pareceFuncionEnTexto(salida)) { await log("fuga_tool_texto", false, { waId, fase: "asistencia", muestra: (r.text ?? "").slice(0, 200) }); salida = null; }
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
            const insA = await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: salida, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: quiereEnviar ? "live" : "shadow", model: "assist-handoff", tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, cache_read_input_tokens: r.cacheRead || null, cache_creation_input_tokens: r.cacheWrite || null, latency_ms: Date.now() - t0 }).select("id");
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
      // v45: insertar ANTES de enviar y con model explícito (anti-eco duro, como v21). Antes se insertaba
      // DESPUÉS y sin model (NULL) → el anti-eco no encontraba la fila → el eco de WATI se guardaba como
      // mensaje de asesor fantasma (2 casos reales el 02-jul) y reseteaba el reloj del handoff (v31).
      const quiereEnviarH = liveAllowed(waId);
      const insH = await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: despedida, mode: quiereEnviarH ? "live" : "shadow", model: "handoff-fijo", latency_ms: Date.now() - t0 }).select("id");
      // Si el insert falló, NO enviamos: el eco volvería sin fila que lo reconozca (asesor fantasma).
      // La conversación ya quedó en handoff; el asesor saluda él mismo. Telemetría para verlo.
      if (insH.error) {
        await log("error", false, { waId, fase: "handoff_despedida_insert", error: String(insH.error.message ?? insH.error).slice(0, 200) });
        return Response.json({ ok: true, handoff: true, despedida: "omitida_insert_fallo" });
      }
      const enviado = quiereEnviarH ? await enviarWati(waId, despedida) : false;
      if (quiereEnviarH && !enviado) await sb.from("messages").update({ mode: "shadow" }).eq("id", (insH.data?.[0] as any)?.id);
      return Response.json({ ok: true, handoff: true });
    }

    // Trabajo lento (historial + LLM + envío + guardado) en SEGUNDO PLANO: así le
    // respondemos a WATI al instante y evitamos su timeout/reintentos (v14). El insert
    // del mensaje de usuario (dedup) ya ocurrió de forma síncrona más arriba.
    const procesar = (async () => {
      let respondido = false; // v23: marca si ya enviamos respuesta (para el respaldo del catch)
      try {
        // v49 — DEBOUNCE: esperar a que la ráfaga se asiente. El cliente que escribe 2-3 líneas (o manda
        // fotos y luego pregunta) genera mensajes separados por segundos; antes, cada uno corría su propio
        // LLM y el anti-duplicado (v20) tiraba respuestas ya generadas (plata quemada) o respondía a media
        // pregunta. Ahora TODAS las invocaciones esperan DEBOUNCE_MS; las superadas mueren baratas en el
        // chequeo pre-LLM (sin llamar al modelo) y solo la del ÚLTIMO mensaje responde con todo el contexto.
        if (DEBOUNCE_MS > 0) await new Promise((res) => setTimeout(res, DEBOUNCE_MS));
        // v20 (anti-duplicado, pre-LLM): si ya llegó un mensaje más nuevo, ni gastamos el LLM.
        if (await hayMensajeClienteMasNuevo(conv.id, userCreatedAt)) { await log("descartado_superado", true, { waId, fase: "pre-llm" }); return; }
        // v49 (anti-carrera temprano): si un asesor tomó la conversación DURANTE la espera, no gastamos
        // el LLM ni la pisamos (el chequeo v20 post-LLM seguía existiendo, pero este ahorra la llamada).
        const { data: convTrasEspera } = await sb.from("conversations").select("status").eq("id", conv.id).maybeSingle();
        if (convTrasEspera?.status === "handoff") { await log("descartado_handoff_tardio", true, { waId, fase: "post-debounce" }); return; }
        const { data: hist } = await sb.from("messages").select("role,content,model,created_at,media_url").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(10);
        const history = (hist ?? []).reverse();
        // v49 — VISIÓN de ráfaga: junta las imágenes de la COLA de mensajes del cliente (los "user"
        // consecutivos del final del historial, últimos 5 min) y descarga hasta 3. Antes solo se veía la
        // imagen del mensaje ganador: si el cliente mandaba [foto][foto]"¿estas no hay?", el ganador era el
        // texto y las fotos se perdían ("No logro visualizar…" — caso real auditado el 08-jul).
        const hace5min = Date.now() - 5 * 60 * 1000;
        const urlsRafaga: string[] = [];
        for (let i = history.length - 1; i >= 0 && (history[i] as any).role === "user"; i--) {
          const m = history[i] as any;
          if (m.media_url && new Date(m.created_at).getTime() > hace5min) urlsRafaga.unshift(String(m.media_url));
        }
        const imagenes: { b64: string; mediaType: string }[] = [];
        for (const u of urlsRafaga.slice(-3)) { // máx 3 (payload); las más recientes, en orden cronológico
          const img = await descargarMediaWati(u);
          if (img) imagenes.push(img);
        }
        if (urlsRafaga.length && !imagenes.length) await log("imagen_no_descargada", false, { waId, urls_en_rafaga: urlsRafaga.length });
        const atributosWati = extraerCustomParams(p); // v25: datos que ya tenemos (best-effort, del payload)
        const linksTracked: Record<string, string> = {}; // v29 — handle → URL con tracking (lo llena buscar_producto)
        const r = await responderLLM(history as any, imagenes.length ? false : NEEDS_TOOL_RE.test(texto), imagenes, urlsRafaga.length > 0 && imagenes.length === 0, waId, atributosWati, linksTracked);
        let salida = r.text ? reaplicarTracking(limpiarWhatsApp(r.text), linksTracked) : null; // v16 formato + v29 tracking
        // v44 (guard anti-fuga de tool-call): si el modelo escribió la llamada como TEXTO (visto en Sonnet 5)
        // en vez de invocarla nativa, NO mandamos ese XML; va la respuesta de respaldo (consciente del
        // horario, como v23) y se loggea. Mejor una deferencia segura que basura al cliente.
        let fugaTool = false;
        if (salida && pareceFuncionEnTexto(salida)) {
          fugaTool = true;
          salida = horarioPanama().dentro
            ? "Disculpe, tuve un inconveniente procesando su consulta 🙏. Un asesor le ayuda en breve."
            : "Disculpe, tuve un inconveniente procesando su consulta 🙏. Un asesor le ayuda apenas estemos en horario (Lun-Vie 9:00am–5:00pm).";
        }
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
        const insAsst = await sb.from("messages").insert({ conversation_id: conv.id, role: "assistant", content: salida, tool_calls: r.toolCalls.length ? r.toolCalls : null, mode: modoFinal, model: anthropic ? MODEL : null, tokens_in: r.tokensIn || null, tokens_out: r.tokensOut || null, cache_read_input_tokens: r.cacheRead || null, cache_creation_input_tokens: r.cacheWrite || null, latency_ms: Date.now() - t0 }).select("id");
        let enviado = false;
        if (quiereEnviar) {
          enviado = await enviarWati(waId, salida);
          if (!enviado) { modoFinal = "shadow"; await sb.from("messages").update({ mode: "shadow" }).eq("id", insAsst.data?.[0]?.id); }
        }
        respondido = true; // v23: ya insertamos/enviamos la respuesta del bot
        if (urlsRafaga.length) await log("imagen_procesada", true, { waId, en_rafaga: urlsRafaga.length, descargadas: imagenes.length, enviado });
        if (fugaTool) await log("fuga_tool_texto", false, { waId, enviado, muestra: (r.text ?? "").slice(0, 200) });
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
                ? "Disculpe, estamos con alto volumen en este momento 🙏. Un asesor le ayuda en breve."
                : "Disculpe, estamos con alto volumen en este momento 🙏. Un asesor le ayuda apenas estemos en horario (Lun-Vie 9:00am–5:00pm).";
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
