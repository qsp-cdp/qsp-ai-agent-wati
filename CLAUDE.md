# CLAUDE.md — Copiloto AI de WhatsApp (WATI) · Quick Service Panamá

> Contexto base para Claude Code trabajando en ESTE repo. Lee esto primero.
> Generado 2026-06-15; actualizado 2026-07-07 (v48 en el repo —CONCIENCIA DE PEDIDOS: tool `estado_pedido`
> + tabla/RPC `pedidos`/`estado_pedido` [migración APLICADA 07-jul, verificada]; el bot LEE el
> estado del pedido y lo relaya sin inventar. **Opción A hecha:** se unió (git merge) el puente Tookan→Shipday
> [5 Edge Functions + `_shared/` + servicio Node con pruebas] y las 3 funciones de despacho CABLEAN el upsert
> a `pedidos` por (fuente,pedido_ref) [contrato en `docs/handoff-pedidos-conciencia.md`]; acumulativo sobre v46+v47.
> v47 —tarifa/método de envío por SECTOR: tool `tarifa_entrega` + DATA LAYER de zonas en Supabase
> [`zonas_entrega`/`sectores_entrega`/`resolver_tarifa`, 3 migraciones YA APLICADAS]; acumulativo sobre v46
> sucursales-proceso [sin desplegar aún]; v45 EN VIVO, probando Sonnet 5) +
> esquema del proyecto Supabase. Docs de diseño originales en el repo
> `qsp-cdp/qsp-cdp-docs` (`docs/design/2026-06-12-proyecto-copilot-wati.md` y
> `docs/design/2026-06-13-copilot-analisis-sombra-prompt-v2.md`).

## Qué es
Copiloto de IA dentro de **WATI** (WhatsApp, ~90% de las ventas de QSP). Apoya al
equipo humano: contesta preguntas generales, indica disponibilidad/stock y da precio
con certeza, y calla/deriva cuando es mejor que responda un humano. Tienda:
**quickservicepanama.com** (suministros de impresión y tecnología en Panamá).

## Estado actual (2026-08-04)
- **EN EL REPO, LISTO PARA DESPLEGAR: v61.3 (`v61.3-datos-local`).** Auditoría de la conv 50766740669: la
  clienta (piso 2 del mismo edificio) preguntó *"Q oficina es"* y el bot dijo **"oficina 4008"** y la
  **RECONFIRMÓ** al dudar ella — la real es la **454** (`store_facts.direccion`) y su esposo iba subiendo.
  Los `tool_calls` de ese turno están **vacíos**: respondió de MEMORIA. Tres fixes:
  1. **`NEEDS_TOOL_RE` + regla DATOS DEL LOCAL:** ni "oficina" ni "piso" estaban en los patrones (sí
     "ubicaci"/"direcci") → nada forzaba `info_tienda`. Ahora `oficina|piso|local|suite|apto|cómo llego|en
     qué parte` fuerzan tool, y el prompt exige que dirección/piso/oficina/teléfono salgan de `info_tienda`
     EN EL MISMO TURNO, tal cual, nunca de memoria ni de lo dicho antes en el hilo.
  2. **Falsas afirmaciones de acción:** el bot dijo *"quedó anotado"* y *"ya le avisamos al equipo que va
     subiendo"* — **nadie fue avisado** (esa respuesta ni genera ticket). La regla de estilo v45 solo listaba
     "ya lo anoté"/"el asesor ya vio"; ahora enumera explícitamente *quedó anotado / lo registré / ya le
     avisamos al equipo / se lo tenemos apartado* y aclara que el bot **NO puede anotar, apartar, reservar,
     preparar ni avisarle a nadie**. Se mantiene la excepción real de `guardar_lead`.
  3. **Anti-interrupción sobre la RÁFAGA + RUC de persona jurídica.** La clienta mandó [razón social][RUC]
     [correo] en 23 s; con el debounce se responde al ÚLTIMO (el correo, inocente) → el RUC no pasaba por el
     guard. Ahora `textoDeRafagaSinResponder` concatena los mensajes del cliente posteriores a la última
     respuesta (tope 3 min / 8 filas, para que una abstención no deje al bot mudo para siempre). **Y un BUG
     de fondo:** el patrón de RUC exigía 1-4 dígitos en el primer grupo (`557-538-101617`), así que el **RUC
     de PERSONA JURÍDICA `155634770-2-2016` NO disparaba** — agregado `\d{6,10}-\d{1,2}-\d{4}` (no colisiona
     con fechas ni teléfonos, verificado). Telemetría: `abstencion_interrupcion.por_rafaga`.
  480 golden + 21 node tests. Sin migración.
## Estado histórico (2026-08-03)
- **🚀 EN VIVO (desplegado 03-ago; VERIFICADO con el caso real que falló esa mañana: "¿tienen cabezales para impresora HP 410?" → ofreció los cabezales de Ink Tank M0H51AL/M0H50AL **y el Combo 3YP86AL $48**, nunca el tóner): v61 + v61.1 + v61.2 (`v61.2-tipo-excluyente`).** La SIMULACIÓN
  del caso real contra la tienda (query `cabezal HP 410` al MCP) destapó que el fix de prompt de v61.1 **no
  alcanzaba**: el MCP rankea perfecto (5 cabezales, el **Combo de Cabezales HP 3YP86AL $48 en el puesto 3**)
  pero el TÓNER `CF410A` sale 8º y **su título contiene "410"** → (a) el re-ranking de v61 lo hoisteaba al
  **#1** (bucket "con código"), y (b) el guard v60.1 no hallaba "410" en los títulos de cabezales —los títulos
  se ACORTARON y ya no listan "Ink Tank 315|415"— así que la escalera literal buscaba `410`, encontraba el
  tóner y lo daba por **coincidencia exacta**. O sea: el bot habría vuelto a ofrecer tóner pese al prompt.
  Dos fixes de CÓDIGO: (1) **el re-ranking ya NO hoistea por "código en título"** — solo promueve combos DE LA
  FAMILIA y respeta el ranking semántico del MCP para todo lo demás; (2) **`tipoPedido`/`tituloDeTipo`**: el
  tipo que nombra el cliente (**cabezal / tóner / tinta**) es EXCLUYENTE y se aplica en código —no solo en el
  prompt— filtrando el set del MCP y **cada intento de la escalera literal** (si queda vacío cae al crudo:
  nunca rompe). Un tóner ya no satisface un pedido de cabezal ni al revés; un título sin tipo claro no se
  descarta (conservador). 455 golden + 21 node tests. Sin migración.
- **EN EL REPO (incluido arriba): v61.1 (`v61.1-cabezales-tipo`).** Caso real (conv
  50767698701, 03-ago): el cliente preguntó *"¿tienen **cabezales** para impresora **HP 410**?"* y el bot
  respondió *"la línea HP 410 corresponde a **tóner**… **no a cabezales**"* y cotizó el CF410A — pero el
  cliente hablaba de la **HP Ink Tank 410** y **SÍ tenemos** sus cabezales (M0H50AL / M0H51AL / 3YP86AL); un
  asesor lo rescató 11 min después ofreciendo *"el kit de cabezales, vienen ambos"*. (Verificado: a ese hilo
  **no llegó ninguna imagen** — los 4 mensajes del cliente tienen `media_url` null, así que no fue falla de
  visión.) Dos fixes de PROMPT + uno de lógica: (1) **EL TIPO DE PRODUCTO LO DEFINE EL CLIENTE, NO EL
  NÚMERO** — si dice "cabezal/tóner/tinta/cartucho/cinta", esa palabra manda sobre la interpretación del
  número (HP 410 existe como línea de TÓNER láser y como Ink Tank de TINTA con CABEZALES): buscar CON esa
  palabra, y **NUNCA corregir al cliente** sobre qué usa su equipo por inferencia propia — si no aparece,
  buscar la otra lectura o preguntar qué impresora tiene; (2) la regla de combos se generaliza a **TINTAS Y
  CABEZALES** (las de tanque llevan DOS —negro y tricolor— y suele haber kit de ambos: ofrecerlo en vez de
  cotizar uno solo); (3) **código**: el gate de la sonda ahora cubre `cabezal` (antes solo tinta/botella/
  cartucho → los cabezales quedaban fuera del v61) y `esComboTitulo` reconoce **plurales** ("Kit**s** de
  Cabezales", "Combo**s** de tintas", "multipack"). 444 golden + 21 node tests. Sin migración.
## Estado histórico (2026-07-28)
- **EN EL REPO, LISTO PARA DESPLEGAR: v61 (`v61-combos-tintas`).** Incidente real (28-jul): la clienta pidió la
  familia Epson T544 y el bot cotizó las 4 tintas individuales ($43 + ITBMS) ofreciendo solo el combo x3 ($29)
  — **el COMBO x4 existe a $36 con 31 uds** y la clienta lo encontró sola con una captura del sitio. Raíz: el
  MCP devolvía 5 y su ranking semántico llenaba el top-5 con las 4 individuales + el combo x3 → **el combo x4
  quedaba en posición 6+ y nunca llegaba al modelo**; además el guardrail `algunTituloConCodigo` no lo
  rescataba (su título dice "Epson 544", no "T544" — la única de las 6 familias con ese hueco), y no había
  regla de prompt que mandara ofrecer el combo. **4 piezas:** (1) **`BUSQUEDA_MCP_LIMIT`** (env, default
  **10**, clamp 1-50) — se le piden 10 al MCP en vez de 5 (al modelo siguen llegando 5 → costo de
  tokens/ref_codes/inventario sin cambio); (2) **`rerankearCombos`** (pura) — elige los 5 con **RESERVA de 2
  slots para combos** (sin la reserva, las 4 individuales que llevan el código llenan el top-5 y el combo
  queda fuera igual: el golden lo cazó), combos con el código en el título primero, resto por ranking del MCP;
  (3) **sonda `anexarCombo`** (respaldo) — si el set final no trae combo Y hay contexto de TINTA, UNA búsqueda
  extra `combo <forma corta>` por MCP→(si no hay hit de familia) suggest, anexa máx 1 hit **validado contra la
  familia** como 6º marcado `combo_disponible`; telemetría `job_log` **`combo_sonda`** (solo el disparo real,
  en background) para decidir en ~1 mes si el limit 10 alcanza; (4) **regla de prompt COMBOS / JUEGOS DE
  TINTAS** — LEER el título antes de ofrecerlo (el flag es léxico: un "Pack x2 negra" no es el juego de 4),
  cotizar el combo si quiere el juego completo, comparar con **`calcular_cotizacion`** (nunca sumar de
  memoria), **grounded** (solo combos de ESE turno), NO aplica en `aproximada`, y si no sabe el modelo →
  CONSUMIBLE SIN MODELO primero. `enriquecer` expone `combo:true` (solo en exactos) y `precio_desde`.
  437 golden + 21 node tests. **Revisión adversarial (4 lentes + verificación adversarial): 6 hallazgos
  CONFIRMADOS y corregidos antes de commitear** — (a) la sonda anexaba CUALQUIER combo sin validar familia
  (reabría el bug v60.1 por la puerta de atrás); (b) el re-ranking hoisteaba combos AJENOS por encima del
  producto pedido ("toner TN830XL" → "Kit de limpieza" #1) y el golden lo lockeaba; (c) RESERVA=2 con max=5
  expulsaba la tinta AMARILLA del caso insignia → max=6; (d) pedir 10 ensanchaba el guard v60.1 → se evalúa
  sobre el top-5 ORIGINAL del MCP; (e) la regla mandaba sumar de memoria (contradecía v57); (f) el flag combo
  viajaba en `aproximada`. Sin migración. **Deploy:** `.\deploy.ps1 copilot-webhook`
  (no-op sin la env var: el default 10 aplica igual) → smoke test de las 6 familias (T544, T504, GI-11,
  GI-190, GI-16, GT52) → monitorear `combo_sonda`. **Pendiente de DATA (manual, no código):** agregar "T544"
  a los tags del combo Epson 544 x4 (handle `juego-de-tintas-epson-t544-…`, SKU `T544520-4P`) para darle señal
  léxica al ranking; preferir TAGS sobre tocar el título (plan SEO vigente).
## Estado histórico (2026-07-23)
- **EN EL REPO, LISTO PARA DESPLEGAR: v60.2 (`v60.2-envio-gratis-web`).** Corrección de negocio (23-jul): el
  **envío gratis >$300 es EXCLUSIVO del checkout WEB**; en un pedido/cotización coordinado por WhatsApp NO
  aplica (se cobra la tarifa normal). La regla de v59.2 lo hacía "siempre aclarar gratis" → el bot prometía
  "sigue calificando para envío gratis 🎉" en una cotización WhatsApp de $326 (caso real). Fix: (1) regla de
  prompt reescrita — envío gratis SOLO al completar la compra por la web; por WhatsApp NUNCA decir "califica
  para envío gratis" (puede mencionarlo como opción "si compra por la web >$300"); (2) migración
  `20260723160000_store_facts_envio_gratis_web.sql` reescribe `envio_resumen` (web-only, espejar en Shopify).
  **El rescate de despacho de `shopify-webhook` (v59.2) NO cambia** — ese es para pedidos WEB reales, que sí
  llevan envío gratis. 398 golden tests. Deploy: `.\deploy.ps1 copilot-webhook` + la migración.
- **EN EL REPO, LISTO PARA DESPLEGAR: v60.1 (`v60.1-busqueda-hibrida`).** Dos fixes del feedback real del
  23-jul sobre el v60 en vivo ("productos que tenemos no los encuentra; y no recomienda el similar obvio"):
  (1) **BUG del cross-check v60:** con código no-en-títulos-MCP, si suggest.json confirmaba que el producto
  existía, igual se devolvían los 5 vecinos del MCP (sin el producto) marcados como exactos → el bot decía
  "no lo encontré" TENIÉNDOLO. Ahora el flujo es HÍBRIDO: código-no-en-MCP → **la escalera literal
  (v18–v55: variantes con/sin guion + tags + body) busca el EXACTO** y responde si lo halla; los vecinos del
  MCP quedan de respaldo y salen como `coincidencia:"aproximada"` SOLO si la escalera tampoco halla (lock:
  el aproximada sale AL FINAL). El shadow lock v59 se actualizó (auto-apagado `!BUSQUEDA_MCP`).
  (2) **Regla ALTERNATIVAS CON CRITERIO** (caso real: pidió Canon MF656Cdw láser COLOR y ofreció HP 137fnw
  B/N en vez de la Canon MF665CDW que sí manejamos): al sustituir, CONSERVAR marca y atributos clave
  (color/B-N, multifuncional, láser/tinta) con una búsqueda NUEVA de esos atributos antes de cambiar de
  marca/categoría; nunca B/N por color sin aclararlo. 398 golden + 21 node tests. Deploy:
  `.\deploy.ps1 copilot-webhook` (sin migración; `BUSQUEDA_MCP` sigue en 1).
- **🚀 EN VIVO (flipeado 22-jul con `BUSQUEDA_MCP=1`, validado con 6 pruebas reales; superseded por v60.1 en repo): v60 (`v60-busqueda-catalog-mcp`).**
  El motor de búsqueda pasa de `suggest.json` (literal AND) a **`search_catalog` (Catalog MCP de Shopify)**.
  Motivado por la auditoría del 22-jul: ~10% de las búsquedas daban 0 y **el 94% de esos "no" eran FALSOS**
  (el producto existía) — pura formulación literal (formato GI-16BK, unidades 610mm, color "morada", lenguaje
  "oficina básica"). En `buscarProducto`, si **`BUSQUEDA_MCP=1`** (default OFF), el primario es
  `buscarCatalogoMCP`; **suggest.json queda de FALLBACK** (si el MCP falla/timeout → escalera de siempre, la
  búsqueda nunca se rompe; `job_log` `busqueda_mcp_fallo`) **y de VERIFICADOR** (cross-check). **GUARDRAIL
  obligatorio** (la lección del audit: el MCP es semántico, nunca da vacío — "Printhead PF-04" devolvió *una
  mochila*): si la consulta trae un código y NINGÚN título del MCP lo contiene, se cruza con suggest.json; si el
  literal (con tags/body) TAMPOCO halla → `enriquecer` marca **`coincidencia:"aproximada"`** con `alternativas` +
  nota de **PEDIDO ESPECIAL** (regla de prompt nueva: el bot NO presenta el vecino como el modelo pedido, lo
  ofrece como alternativa y deriva el pedido especial). `parseCatalogoMCP` ahora también da `id` (gid, para
  `inventarioShopify`) y `descripcion_html` (para `especificaciones`); el resto del enriquecimiento (ITBMS en
  código, stock por Admin GraphQL, ref_codes/tracking) se reusa igual. El shadow (v59) se auto-apaga si MCP es
  primario. 393 golden + 21 node tests. Revisión adversarial inline. **Endpoint:** `SHOPIFY_CATALOG_MCP_URL`
  (default el legacy `/api/mcp`, que el shadow probó con 0 errores; muere ~31-ago → migrar a `/api/ucp/mcp` con
  perfil de agente ANTES del flip definitivo). **Deploy:** `.\deploy.ps1 copilot-webhook` (no-op) → probar con
  las insignia (TN830XL, PF-04, bond 30, Kyocera 3253ci) seteando `BUSQUEDA_MCP=1` → confirmar el guardrail →
  apagar `BUSQUEDA_SHADOW`. Rollback instantáneo: `BUSQUEDA_MCP=0`. **NO retira** la escalera de guiones/
  `normalizarConsulta`/`juntarModelosEspaciados`/`algunTituloConCodigo` — son el fallback + verificador.
## Estado histórico (2026-07-20)
- **EN EL REPO, LISTO PARA DESPLEGAR: v59.2 (`v59.2-envio-gratis-interior`) + rescate de despacho.** Frente
  "envíos de Shopify", punto 1 (el envío gratis >$300). DOS piezas, mismo redeploy:
  (1) **Bot (v59.2, `copilot-webhook`):** regla de prompt ENVÍO GRATIS — >$300 gratis en TODO el país, pero
  **SIEMPRE aclarar** la distinción: ciudad = a domicilio; **interior = a la sucursal Servientrega para RETIRO,
  NO puerta a puerta** (evita el reclamo del cliente del interior que esperaba domicilio gratis). + migración
  `20260722130000_store_facts_envio_gratis.sql` que reescribe `store_facts.envio_resumen` con esa distinción
  (espejar en el metaobjeto Shopify). Coexiste con la regla de interior v58 (retiro $6/puerta $9 para <$300).
  (2) **Despacho (`shopify-webhook`):** RESCATE — la tarifa "¡Envío GRATIS!" no pasaba el filtro por nombre →
  los pedidos >$300 (los más grandes) no llegaban a Shipday. Ahora, si no pasa el filtro pero es envío gratis
  (`esEnvioGratis`, por término del NOMBRE de la tarifa —env `SHOPIFY_FREE_SHIP_TERMS`, default `gratis,free`—
  no por $0), se resuelve la zona y se despacha **solo si es flota propia** (ciudad); el interior gratis va a la
  sucursal Servientrega → no Shipday. **Estrictamente aditivo** (solo agrega despachos que hoy se pierden; RPC
  caído = statu quo). `job_log` `envio_gratis_rescatado`/`omitido`. Revisión adversarial inline (solo agrega,
  RPC-fail=statu quo, sin doble RPC, esFlotaPropia correcto en los 4 estados, esEnvioGratis por nombre no $0).
  383 golden + 21 node tests. Deploy: `.\deploy.ps1 copilot-webhook shopify-webhook` + la migración +
  espejo Shopify.
- **EN EL REPO, LISTO PARA DESPLEGAR: v59.1 (`v59.1-ambiguo-condensado`).** Pulido del fraseo `ambiguo` de
  `tarifa_entrega`: los corredores (Transístmica/Domingo Díaz cruzan ~5 zonas → el resolver v2 devuelve 5
  opciones) + el ITBMS-por-opción de v58 hacían un muro de texto en WhatsApp (5 líneas, cada una con su
  ITBMS). Ahora `frasearTarifa` CONDENSA el ambiguo: RANGO de costo (min–max con ITBMS, ej. "va desde B/.6.42
  hasta B/.9.63 según el sector") + una nota de método SOLO si hay algo distinto de entrega propia (para no
  prometer domicilio donde hay retiro) + pide el corregimiento; el precio EXACTO sale en la re-consulta
  (flujo v47, ya existente). Verificado contra `resolver_tarifa('transistmica')` real (5 tramos). 377 golden
  tests. Solo `frasearTarifa`; sin migración; sin tocar el shadow de v59. Deploy: `.\deploy.ps1 copilot-webhook`.
- **EN EL REPO, LISTO PARA DESPLEGAR (SHADOW, riesgo cero al cliente): v59 (`v59-busqueda-shadow`).** Prep para
  reemplazar el motor de búsqueda por el **Catalog MCP de Shopify** (`search_catalog`). Contexto: v18/v33/v53/v54/
  v55 fueron 5 versiones peleando la MISMA raíz — `suggest.json` es búsqueda literal tipo AND (un término que no
  existe tal cual → 0). Probado contra la tienda REAL, `search_catalog` resuelve los 2 casos insignia **como
  resultado #1, en español**: "toner TN830XL" (sin guion, la regresión v55) → el tóner correcto $116; "papel bond
  30 pulgadas plotter" (el `30"` de v53) → el rollo correcto $20. Devuelve precio (minor units, SIN ITBMS →
  nuestro cálculo en código queda igual), `variant_id` (habilita carrito/checkout fase 2), specs e imágenes.
  **v59 = SHADOW:** en el dispatch, tras `buscarProducto`, se dispara `compararShadow` en BACKGROUND
  (`EdgeRuntime.waitUntil`, NO agrega latencia ni cambia la respuesta) que llama `search_catalog` y loguea ambos
  a `job_log` (`busqueda_shadow`: `suggest_n`/`mcp_n`/títulos/`mcp_gana`/`suggest_gana`). Gateado por
  **`BUSQUEDA_SHADOW=1`** (default OFF, ADN de COPILOT_MODE). Endpoint por env **`SHOPIFY_CATALOG_MCP_URL`**
  (default el legacy `/api/mcp`, público y stateless, funciona hoy). Parser aislado en `parseCatalogoMCP` (puro,
  probado con la respuesta REAL). 372 golden tests. **Endpoint UCP:** el catálogo ya migró a `/api/ucp/mcp` (el
  `/api/mcp` legacy muere ~31-ago); `/api/ucp/mcp` exige un **perfil de agente hosteado** (`meta.ucp-agent.profile`,
  probado: sin token, solo el perfil) → se sirve desde una ruta GET del copiloto y se migra ANTES del flip. Deploy:
  `.\deploy.ps1 copilot-webhook` + setear `BUSQUEDA_SHADOW=1` para arrancar la medición. **Plan:** v59 shadow (mide
  recall una semana) → v60 flip a `search_catalog` (con suggest.json de fallback; retira la escalera de guiones/
  `normalizarConsulta`/`juntarModelosEspaciados`/`algunTituloConCodigo`) → fase 2 carrito→checkout por WhatsApp.
- **🚀 EN VIVO (desplegado 20-jul, healthcheck `version:v58-envio-interior-domicilio`; SQL de `store_facts` aplicado; espejo en metaobjeto Shopify PENDIENTE): v58 (`v58-envio-interior-domicilio`).** Dos cosas del envío, de un caso
  real (Chitré): (1) **el interior ofrecía SOLO retiro en sucursal ($6), omitía la entrega a domicilio puerta
  a puerta ($9)**. Raíz: NO era la data — `store_facts.tarifa_interior` YA traía ambas; el bot relayó solo la
  mitad porque la regla de prompt del interior (v46) lo enmarcaba **solo como retiro**. Fix de PROMPT
  (price-agnostic): la regla SUCURSALES DEL INTERIOR ahora manda ofrecer **las DOS formas** (retiro / domicilio
  puerta a puerta) con precios/plazos de `info_tienda`, sin omitir el domicilio ni inventar. Guardrail v46
  intacto. (2) **TODO el costo de envío causa ITBMS 7%** (decisión de Gerencia): antes la data y el tool
  cotizaban el envío pelado (`B/.6.00`/`B/.9.00`). Ahora se muestra base + ITBMS + total, **calculado en
  código** (nunca de memoria), igual que los productos: `frasearTarifa` (tool `tarifa_entrega`, ciudad) usa un
  helper `conImp` (`B/.6.00 + ITBMS (7%) = B/.6.42`), y la migración `20260720120000_store_facts_envio_itbms.sql`
  actualiza `tarifa_interior` + `tarifa_ciudad_panama` ($6→$6.42, $7→$7.49, $9→$9.63). 356 golden tests.
  Reescribe el caché de v35 (re-warm). Deploy: `.\deploy.ps1 copilot-webhook` **+ aplicar la migración**
  `20260720120000_store_facts_envio_itbms.sql` (y espejar los 2 valores en el metaobjeto Shopify
  `store_facts/datos-tienda` para que un re-sync no los revierta).
- **🚀 EN VIVO (desplegado 20-jul, healthcheck `version:v57-cotizacion-cantidades`, sobre Sonnet 5): v57 (`v57-cotizacion-cantidades`).** Caso real (conv 50760979705): el
  cliente pidió 2 PG-145XL + 2 CL-146XL; el bot dio bien las líneas por unidad pero **erró el TOTAL por doble
  ITBMS** — sumó los totales que YA tenían ITBMS ($42.38 + $49.22 = $91.60), los tomó como subtotal y volvió a
  aplicar el 7% → dijo **$98.60** cuando el correcto es **$91.59** (~$7 de más). Raíz: `buscar_producto` calcula
  el ITBMS **por unidad**, pero para cantidades / varios productos la tool no da el total → el modelo multiplica,
  suma y grava **de memoria** (justo lo que el diseño de ITBMS-en-código quería evitar) y se equivocó. Fix
  (código, como la lección del proyecto): nueva tool **`calcular_cotizacion(items)`** — recibe `{descripcion,
  precio_usd (SIN ITBMS, el de buscar_producto), cantidad}` por línea y **computa TODO determinista en centavos**
  (línea = precio×cant, subtotal = Σ, **ITBMS UNA sola vez sobre el subtotal**, total) y devuelve
  `respuesta_sugerida` ya armada que el bot relaya. Regla de prompt **CANTIDADES / VARIOS PRODUCTOS** (nunca
  multiplicar/sumar/gravar de memoria; el 7% va una sola vez). Disponible también en MODO ASISTENCIA (es
  aritmética read-only sobre precios que la asistencia ya expone; excluirla empujaría a hacer la cuenta a mano =
  el mismo bug). Errores (sin items / precio inválido) → objeto de error, deriva a buscar_producto, nunca cotiza
  basura. 347 golden tests (lock del caso real: $85.60/$5.99/$91.59, y que $98.60 no reaparezca). Sin esquema.
  Reescribe el caché de v35 (re-warm, tools+prompt). Deploy: `.\deploy.ps1 copilot-webhook` (sin migración).
- **🚀 EN VIVO (desplegado 17-jul; VERIFICADO con 2 pruebas reales: TN-830XL→tóner con 7 uds, y "¿puedo pasar a comprar?"→"venga directo, sin pedido previo"; los 2 SQL de data aplicados): v56 (`v56-tienda-directa`).** Caso real del 17-jul: el bot presentó
  la tienda como "punto de retiro" y dijo "al comprar en línea, solo elige Recoger en tienda al pagar" —
  como si hubiera que comprar por la web primero. Regla nueva de prompt TIENDA FÍSICA — COMPRA DIRECTA:
  el cliente puede LLEGAR Y COMPRAR directo (ubicación/horario de info_tienda); NUNCA presentar la tienda
  como solo punto de retiro; "Recoger en tienda" del checkout web = ALTERNATIVA opcional, no requisito.
  Solo prompt (reescribe el caché v35, re-warm). 328 golden tests. **CONFIRMADO: el fraseo venía del
  DATO** — `store_facts.recoger_en_tienda` decía "Elige Recoger en tienda al pagar y retira en…"; se
  entregaron 2 UPDATEs de data (recoger_en_tienda reescrito como tienda física de compra directa +
  metodos_pago ampliado con los métodos EN TIENDA confirmados por Gerencia: Visa, Mastercard, Clave,
  Yappy y transferencia — SIN efectivo). Deploy: `.\deploy.ps1 copilot-webhook` + los 2 SQL.
- **🚀 EN VIVO (desplegado 17-jul; supersede v54): v55 (`v55-ranking-titulo`).** Regresión REAL detectada en vivo el
  mismo 17-jul (horas después de desplegar v54): "toner TN830XL" — **el caso insignia validado de v18** —
  volvió a fallar. Causa: v52 agregó `body` a la búsqueda → el 1er intento ("toner TN830XL") ya no daba 0
  sino que matcheaba la ficha de la IMPRESORA HL-L2460DW (que menciona el tóner como consumible) → la
  escalera v18 se detenía en ese hit tangencial y NUNCA llegaba al intento "TN-830XL" (con guion) que
  encuentra el tóner real (verificado: el producto SÍ está publicado). Fix quirúrgico: nueva función pura
  **`algunTituloConCodigo`** (normaliza guiones/espacios en ambos lados) — si la consulta trae códigos de
  modelo, un intento solo "gana" si algún TÍTULO contiene el código; si no, queda de FALLBACK y la escalera
  sigue. Si ningún intento matchea por título, se devuelve el fallback (= comportamiento pre-v55, protege
  los compatibles hallados por tag cuyo título no lleva el código). El enriquecimiento (ITBMS/stock/
  tracking/specs) se refactorizó a una función interna `enriquecer` compartida. 324 golden tests (locks con
  los títulos reales de la impresora y el tóner). Sin esquema. Deploy: `.\deploy.ps1 copilot-webhook`.
- **🚀 EN VIVO (desplegado 17-jul, healthcheck `version:v54-telemetria-intake`; supersede v53): v54 (`v54-telemetria-intake`).** De la auditoría semanal del 17-jul
  (semana completa de v53 con ~1.850 respuestas) + decisiones de Gerencia. 7 fixes, sin esquema:
  1. **TELEMETRÍA DE INVENTARIO** — el token de Shopify murió DOS veces (01-jul y ~10-jul) y ambas nos
     enteramos días tarde (la 2ª: **6 días** sirviendo "un asesor verifica" sin que nadie lo notara, y el
     fallo se tragaba en silencio). `inventarioShopify` ahora loggea cada fallo a `job_log`
     (`inventario_fallo`, distinguiendo `token_401_403` / `http_N` / `graphql_error` / `timeout_o_red`) →
     detección en horas. (El token se rotó el 17-jul; selftest `ok_inventario_visible`, PG-145XL 59 uds.)
  2. **`INTERRUPT_RE` pagos** (casos reales de la cola de tickets): "adjunto pago realizado" se escapaba
     (el patrón exigía artículo), + "pago (ya está) realizado/hecho", + urgencia de transacción
     ("¿demoran para la transacción? me urge"), + "hacer el pago antes de que venza". Las preguntas de
     MÉTODO ("¿cómo pago?", "¿cómo hago el pago?") siguen respondibles.
  3. **TICKETS SIN RUIDO** — la cola de v52 capturó 144 promesas en la semana pero ~12% con motivo inútil
     ("Si", "Precio", "[imagen]") y ~25% duplicados (3 tickets idénticos en 4 min). Nuevo helper
     `insertarTicketPromesa` (centraliza los 3 caminos: normal/asistencia/fallback): **dedup** (si la
     conversación ya tiene ticket de bot sin resolver <24h, no duplica; `job_log promesa_dedup`) +
     **motivo enriquecido** (`motivoTicket`: un motivo trivial hereda la última pregunta sustancial del
     historial → "Tienen rollo de vellum 36 x 150? » Si").
  4. **INTAKE-FIRST para consumibles** (pedido de Gerencia): "¿tienen tinta Canon?" sin modelo ya NO
     escupe una lista — el bot confirma la marca y PREGUNTA el modelo de la tinta o de la impresora
     (o pide foto); solo da 1-2 ejemplos si el cliente no lo sabe. Regla nueva CONSUMIBLE SIN MODELO;
     las categorías de EQUIPOS ("¿venden impresoras Epson?") siguen con ejemplos como antes.
  5. **MODELOS ESPACIADOS** — espejo de v53: "tinta para Canon IPF **785**" daba 0 aunque la PFI-107 SÍ
     se vende (título "IPF785" pegado). `juntarModelosEspaciados` ("IPF 785"→"IPF785", "PFI 107"→"PFI107",
     "LQ 590II"→"LQ590II") como ÚLTIMO intento de `buscarProducto`, con stoplist que protege el fix v53
     ("papel bond 30" queda intacto).
  6. **SIN STOCK → BOTÓN DE AVISO (Klaviyo)** — regla de prompt: producto agotado → además de derivar,
     compartir el link e indicar el botón "Avísame cuando esté disponible" de la página (reusa el
     back-in-stock de Klaviyo ya pagado; el aviso WhatsApp-nativo por webhook queda para v55).
  7. **PRECIO DISTRIBUIDOR → ASESOR** (decisión de Gerencia): "precio de distribuidor/mayorista",
     "al por mayor" → `HANDOFF_RE` (política comercial, la maneja un humano).
  **Revisión adversarial pre-deploy HECHA (veredicto SAFE TO DEPLOY) — cerró sus 4 should-fixes:** "el
  pago antes" se acotó a "antes de que" (bloqueaba "¿puedo hacer el pago antes de recoger?"); formas
  PASIVAS/impersonales de pago completado cubiertas ("el pago fue realizado", "ya se realizó la
  transferencia", "transferencia realizada", "acabamos de pagar"); "precio DEL distribuidor" (faltaba el
  artículo "del"); el dedup de tickets loggea el motivo suprimido (pérdida cero). 315 golden tests.
  **Pendientes de DATA (no código):** SQL `store_facts` clave `convenio_marco` (NO registrados en
  PanamáCompra); tags de modelos en cintas matriciales y en el kit de cabezales (G4110); verificar que el
  botón Klaviyo BIS aparece en una página de producto agotado real (la regla nueva lo asume).
  Deploy: `.\deploy.ps1 copilot-webhook` (sin migración).
- **🚀 EN VIVO (desplegado 10-jul; supersede v52): v53 (`v53-busqueda-dimensiones`).** De la auditoría del 10-jul (foco:
  "le mostraron una imagen/consulta y el bot dijo que no había, pero SÍ teníamos"). Resultado: **la visión
  está sólida** (el bot identifica bien los modelos de las fotos), y **NO se perdió ninguna venta** (los
  humanos rescataron las 3 fallas). La raíz de las fallas NO es visión ni datos ni el `body` de v52 —
  es **FORMULACIÓN de la query**: Shopify (`suggest.json`) matchea tipo AND, y un solo término que no exista
  en el producto tira todo a 0. El catálogo escribe la medida como el símbolo **`30"`** (nunca "pulgadas")
  y como **`30" x 150'`** (tokens separados, nunca "30x150"). Casos reales: el bot buscó "papel bond 30
  pulgadas plotter" y "…30x150…" → 0 resultados, **aunque el rollo *Papel Bond Alliance 30" x 150'* SÍ
  existe y está en stock** (2 clientes distintos, misma falla). **Verificado contra la tienda real:**
  `q=papel bond 30` encuentra el rollo; `q=…30 pulgadas…` da 0. Fix (código, como la lección del proyecto):
  nueva función pura **`normalizarConsulta`** que quita "pulgadas"/comillas y parte "NxM" → "N M"; se agrega
  como intento ADICIONAL en `buscarProducto` (el original va primero → costo mínimo, solo corre si el
  original falló). No parte códigos de modelo ("TN-830XL" intacto: la x debe estar entre dígitos). + regla de
  prompt de MEDIDAS/DIMENSIONES (buscar "papel bond 30", nunca "30 pulgadas"/"30x150"). 265 golden tests
  (locks con las queries EXACTAS que fallaron hoy). Solo prompt + búsqueda; sin esquema. Deploy: `.\deploy.ps1
  copilot-webhook` (sin migración). **Pendiente aparte (data, no código):** la 3ª falla (cabezal "G4110" →
  el kit está titulado "…G4100", compatible pero no matchea) se arregla agregando "G4110/G3110/G2110" a los
  TAGS del kit en Shopify (1 min, como v34) — no requiere deploy.
- **EN VIVO (desplegado 10-jul, healthcheck `version:v52-specs-ticket`): v52 (`v52-specs-ticket`).** De una auditoría real (conv
  50765912382, Anaiska Córdoba): pidió una impresora con "bandeja legal y carta" → el bot hizo **10
  búsquedas fallidas** (0 resultados) porque `suggest.json` no lee la DESCRIPCIÓN del producto, solo
  título/tipo/tag/marca — y el dato SÍ estaba en la ficha. Prometió "un asesor confirma" DOS VECES y
  **nadie la contactó nunca**; volvió sola 5 días después a insistir. Dos fixes de esa raíz + dos de
  calibración de guardrails de la auditoría del 09-jul:
  1. **Búsqueda por CARACTERÍSTICA** — se agrega `body` a `resources[options][fields]` de `suggest.json`
     (mismo patrón que v34 con `tag`). **Probado contra la tienda real:** "bandeja legal" SIN body → 0
     resultados; CON body → 5 impresoras reales, incluido el Canon MF289dw ($320, disponible) con la
     frase exacta "Bandeja de entrada... papel tamaño carta o legal" en su ficha.
  2. **`especificaciones` grounded** — `buscarProducto` limpia el HTML de la descripción (`limpiarHtml`)
     y expone hasta 1500 chars como campo `especificaciones` (validado: a esa longitud alcanza specs
     que el marketing entierra ~carácter 1200). REGLA DE ORO actualizada: el modelo puede confirmar una
     característica SOLO si aparece en el título o en `especificaciones` — nunca por "lógica" (ni
     "una impresora de oficina imprime carta" sin la fuente). Sigue 100% grounded, cero relajación real
     del guardrail v42.
  3. **Guardrails calibrados** (mensajes reales del 09-jul que se escaparon): `INTERRUPT_RE` ahora cubre
     formas PLURALES de pago completado ("realizamos/hicimos/enviamos la transferencia" — antes solo
     cubría 1ª persona singular); `HANDOFF_RE` ahora cubre reclamo de FACTURACIÓN ("nota de crédito",
     "me facturaron de más/los N", "me cobraron de más", "factura incorrecta") — antes activaba
     asistencia en vez de ir a un humano.
  4. **TICKET DE PROMESA** (la pieza que cierra el caso Anaiska): cuando la respuesta del bot deja algo
     GENUINAMENTE sin resolver (no encontró / sin stock / no pudo confirmar) Y promete que "un asesor
     confirma", se inserta una fila en la tabla YA EXISTENTE `handoffs` (sin migración nueva; misma
     tabla que ya usa el handoff por keyword) — **sin** forzar `status='handoff'` (no le quita el chat
     al bot, es solo una cola consultable para que el equipo no pierda promesas: `select * from handoffs
     where resuelto=false order by created_at asc`). Detección determinista (2 regex: "quedó sin
     resolver" + "promete asesor"), NO depende de que el modelo llame una tool — cablea en ambos flujos
     (normal y asistencia v50). Solo se registra si el mensaje REALMENTE se envió (`enviado=true`).
  5. **DÍA DE LA SEMANA (hallazgo en vivo el mismo 09-jul, mientras se construía v52):** un cliente dijo
     "el sábado trataré de ir x allá" y el bot confirmó "puede pasar el sábado" **dos veces** sin
     consultar nada — la tienda NO atiende sábados (Lun-Vie 9-5), un cliente pudo hacer un viaje en
     vano. `INTERRUPT_RE` ya tenía un patrón para esto ("paso el sábado") pero exigía el verbo "pasar"
     pegado al día; este mensaje usaba otro verbo ("trataré de ir") y otro orden de palabras y se coló
     por ambos guardrails. Fix: `NEEDS_TOOL_RE` ahora fuerza tool cuando un DÍA de la semana aparece
     junto a un verbo de visitar/ir (en cualquier orden) + nueva regla de prompt explícita (nunca
     confirmar/negar un día sin consultar `info_tienda` primero, ni "por inercia conversacional").
  **⚠️ 2 bugs reales hallados y corregidos durante la construcción:** (a) `\w`/`\b` en JS son ASCII-only
  (no reconocen tildes) → `"no encontr\w+"` o `"est[aá]\b"` NUNCA matcheaban tras una vocal acentuada
  ("encontré", "está") porque la é/á no cuenta como `\w`; corregido usando el radical sin sufijo o un
  espacio literal en vez de `\b`. (b) el patrón de contraste de facturación terminaba en el radical
  "factur" (no una palabra completa) → el `\b` global de HANDOFF_RE fallaba porque el texto real sigue
  con "aron"/"ó" (facturaron); corregido con `factur\w*`. **Revisión adversarial pre-deploy HECHA —
  cerró 8 hallazgos más:** especificaciones ahora avisa si el texto se truncó (`especificaciones_truncada`,
  antes cortaba en silencio y el bot podía decir "no lo tiene" cuando el dato pudo quedar después del
  corte); la REGLA DE ORO aclara que `especificaciones` pertenece EXCLUSIVAMENTE al producto de ESE
  resultado (anti atribución cruzada entre modelos de la misma familia) y que NUNCA se cita precio/
  promo/teléfono de ahí (solo características físicas/técnicas); el ticket de promesa usa `contenido`
  (con fallback "[imagen]"), no `texto` crudo — una foto sin caption dejaba el motivo vacío, justo el
  caso que la feature nació para no perder; los 3 inserts a `handoffs` ahora chequean error (antes
  fallaban en silencio); el fallback v23 (apagón de Anthropic) también genera ticket ahora (antes era
  el único de los 4 caminos de envío sin ninguno); nueva columna `origen` en `handoffs` (migración
  `20260709120000_handoffs_origen.sql`, idempotente, validada en Postgres local) distingue el handoff
  por keyword del ticket pasivo del bot; `HANDOFF_RE` sumó la 3ª persona singular ("facturó"/"cobró") y
  acotó el catch-all "los? \d+" (disparaba con cualquier "me facturaron los N", incluido un
  agradecimiento sin reclamo) a un patrón de CONTRASTE real; `RESPUESTA_NO_RESUELTA_RE` sumó
  "puedo/tenemos/podemos/logramos". 254 golden tests. Deploy: `.\deploy.ps1 copilot-webhook` + la
  migración `20260709120000_handoffs_origen.sql`.
- **🚀 EN VIVO (desplegado 09-jul por CLI, healthcheck `version:v51-reengage`, `debounce_ms:10000`): v49+v50+v51.**
  El deploy del 09-jul subió las 7 funciones (copiloto + puente + `reengage-expired`).
- **v51 (`v51-reengage`) — RECUPERACIÓN DE FIN DE SEMANA (cron).** Los
  clientes que escriben viernes/sábado noche expiran la ventana de 24h de WhatsApp; el lunes había que
  reabrir cada chat a mano con una plantilla. Ahora hay un **cron** que lo automatiza. Decisión de diseño
  tras investigar WATI (agente): NO se puede 100% dentro de WATI (Broadcast sí, pero no filtra por
  "última entrada / ventana expirada"), así que el descubrimiento va por **NUESTRO Postgres**. Piezas:
  (1) **Edge Function nueva `reengage-expired`** (importa `_shared` → deploy SOLO por CLI), disparada por
  **pg_cron** los lunes 9am Panamá (=14:00 UTC) vía `net.http_post`; **SHADOW-FIRST** (default
  `REENGAGE_MODE=shadow` = DRY-RUN: loguea a quién re-engancharía, NO envía) — mismo ADN que `COPILOT_MODE`;
  self-gate de feriado/día-hábil en TS (hereda la lógica del copiloto). (2) **RPC `reengage_candidates`**
  (migración `20260708190000_reengage.sql`) que halla los "colgados": último msg del hilo = del cliente
  (sin responder) + ventana 24h vencida + dentro del lookback (96h) + `status!='cerrada'` + sin `reengage_optout`
  + no re-enganchado desde su última entrada (idempotencia). **VALIDADO contra Postgres 16 local
  end-to-end** (devuelve EXACTO los elegibles; excluye respondido/reciente/viejo/cerrada/optout/ya-reenganchado/
  último-msg-asesor; params ok). (3) **`_shared`**: `sendWatiTemplateMessage` (envío de PLANTILLA HSM — el
  primero del repo, único válido fuera de la ventana 24h; `sendSessionMessage` no sirve), `fetchReengageCandidates`/
  `markReengaged`/`logJob`, `panama.ts` (feriados/TZ reusable), `.trim()` defensivo a los secretos WATI.
  (4) **Copiloto v51 (`v51-reengage`)**: guard que **salta el evento "Template Message Sent"** de WATI
  (`evento_plantilla_saliente`) → el envío del cron NO se confunde con un asesor humano (evita falso handoff).
  207 golden tests. **Revisión adversarial pre-deploy HECHA — cerró 4:** el RPC re-enganchaba `handoff`
  (pisaba al asesor) → ahora exige `status='bot'`; envío/marcado desacoplados con reintento (sin doble envío
  si falla el marcado; `reengage_marca_fallo`); el guard de plantilla exige `esDelNegocio`; deadline 120s
  anti wall-limit. **ESTADO OPERATIVO (09-jul):** migraciones APLICADAS y verificadas (1,1,1,1); función
  DESPLEGADA; plantilla **`reenganche_conversacion` APROBADA por Meta** (⚠️ reclasificada UTILITY→MARKETING,
  aceptable — ver `docs/reengage-cron.md`); **cron programado** (`reengage-lunes-9am-pa`, lunes 14:00 UTC);
  RPC probado contra PROD: devolvió 1 candidato real. **ACTIVACIÓN (17-jul):** `REENGAGE_KEY` rotada (la 1ª
  quedó expuesta en chat) + `cron.schedule` re-corrido con la nueva (jobid 4, `0 14 * * 1`); secretos
  `WATI_REENGAGE_TEMPLATE=reenganche_conversacion` y `REENGAGE_MODE=live` seteados; dry-run shadow OK
  (`reengage_dryrun`, 1 candidato real). **BUG HALLADO EN EL 1er ENVÍO LIVE (17-jul):** `sendWatiTemplateMessage`
  copiaba el shape de `sendSessionMessage` (número en el PATH) pero el endpoint de PLANTILLA de WATI lleva el
  número como QUERY param (`?whatsappNumber=`) → gateway 403 con body vacío (`reengage_fallo`, `enviados:0`).
  **FIX:** `_shared/watiapi.ts` usa `sendTemplateMessage?whatsappNumber=…` y, si eso da 403/404, cae al endpoint
  BULK `sendTemplateMessages` (`receivers[].customParams`) — el 403/404 rechaza ANTES de procesar, así que el
  fallback no duplica; además ahora detecta el `{result:false}` de WATI (200 con fallo de negocio) para no marcar
  reengaged un envío que no salió. **PENDIENTE:** `git pull` + `.\deploy.ps1 reengage-expired` + re-disparar
  `?key=…&force=1` → confirmar `reengage_run` con `enviados:1` y que la plantilla llegue al chat.
  Puesta en marcha + SQL del cron + plantilla: `docs/reengage-cron.md`.
- **EN VIVO (incluido en el deploy del 09-jul): v50 (`v50-asistencia-preventa`).** Decisión de Gerencia sobre el
  ciclo de vida del handoff: tras 15 min sin el asesor, el bot ya NO se limita a info básica de tienda —
  ahora hace **PREVENTA grounded** para no dejar al cliente esperando. Cambios (solo prompt + lógica del
  handoff, sin esquema): (1) el trigger `puedeAsistir` se amplía de `BASIC_INFO_RE` a
  `(BASIC_INFO_RE || NEEDS_TOOL_RE)` → catálogo/precio/stock/estado de pedido también activan la asistencia;
  (2) las tools de asistencia pasan de `{info_tienda, sucursales_interior}` a `{buscar_producto, info_tienda,
  sucursales_interior, estado_pedido}` — SIGUEN FUERA `guardar_lead` (no captura datos con el humano a cargo)
  y `tarifa_entrega` (cotizar método+precio de envío COMPROMETE una entrega; el costo genérico cae a
  info_tienda); (3) `ASSIST_SUFFIX` reescrito: habilita precio/ITBMS/stock/link + estado de pedido, pero
  PROHÍBE cerrar/coordinar venta, pago, pedido o entrega, pedir/guardar datos, tocar RUC/factura, cotizar
  envío por sector y renegociar lo que el asesor venía dando; (4) la asistencia repone el tracking de links
  (`reaplicarTracking`, v29) igual que el flujo normal. **Guardrails intactos:** `INTERRUPT_RE`
  (pago/fiscal/coordinar entrega) sigue bloqueando ANTES del OR; si el asesor vuelve a escribir, `owner=true`
  regresa a handoff y el anti-carrera lo protege; la respuesta sigue marcada `model='assist-handoff'`
  (anti-eco). Golden (v50 cambia: el lock v48 que EXCLUÍA `estado_pedido` de asistencia se
  invirtió; +6 casos de pago-en-curso + locks de F2/F3). **Revisión adversarial pre-deploy HECHA — cerró 3
  hallazgos** que la asistencia ampliada abría (v49 los silenciaba): F1 frases de pago COMPLETADO sin "ya"
  (`hice/realicé el pago`, `acabo de pagar`, `mi pago`) cruzaban `NEEDS_TOOL_RE` pero no `INTERRUPT_RE` → se
  ampliaron los patrones de pago-en-curso de `INTERRUPT_RE` (endurece también el flujo normal; no toca
  `¿cómo pago?`/`¿aceptan yappy?`); F2 un reclamo/devolución/garantía activaba la asistencia → se agregó
  `!HANDOFF_RE.test(texto)` al gate (reclamo → humano); F3/F4 `forceTool` empujaba a cotizar aun cuando
  correspondía callar → en asistencia ahora `forceTool=false` (el modelo puede devolver vacío ante
  pago/descuento/cotización; el grounding lo mantiene la REGLA DE ORO + `ASSIST_SUFFIX`). 203 golden tests.
  Acumulativo sobre v49 → desplegar trae v49+v50 (aplicar
  la migración `20260708150000_messages_media_url` de v49 ANTES). Deploy: `.\deploy.ps1 copilot-webhook`.
- **EN VIVO (incluido en el deploy del 09-jul; migración `media_url` APLICADA 08-jul): v49
  (`v49-debounce-rafaga`).** De la auditoría real de la conv
  50764417334 ([foto][foto]"¿estas no hay?" → el bot no vio las fotos) + decisión de Gerencia (baseline
  humano = loop de minutos → 10 s no son nada): (1) **DEBOUNCE de ráfagas** — todas las invocaciones esperan
  `COPILOT_DEBOUNCE_MS` (default 10000, 0=off, tope 60 s) antes del chequeo pre-LLM; las superadas mueren
  SIN gastar LLM (antes se tiraban respuestas ya generadas) y solo el último mensaje responde con la ráfaga
  completa; (2) **VISIÓN DE RÁFAGA** — el mensaje del cliente persiste su `media_url` (migración
  **`20260708150000_messages_media_url` — APLICARLA ANTES de desplegar v49**, si no el insert del mensaje
  falla y el bot queda MUDO) y el ganador adjunta TODAS las imágenes de la cola de user consecutivos
  (últimos 5 min, máx 3) a Claude vision; (3) anti-carrera temprano post-debounce (asesor que entra durante
  la espera gana sin gastar LLM). El modo asistencia también debounce-a. `latency_ms` ahora INCLUYE la
  espera (~+10 s — es latencia percibida real; ajustar expectativas en las auditorías). 181 golden tests.
  No toca prompt/tools/caché v35. Deploy: migración primero → `.\deploy.ps1 copilot-webhook`.
- **🎉 CÍRCULO DE PEDIDOS COMPLETO Y PROBADO EN VIVO (08-jul).** Las 3 patas verificadas end-to-end con tráfico
  real (no solo código desplegado):
  1. **Captura:** flujo WATI "Dirección de envío" (regla `Contiene: registrar envio` → 3 preguntas → webhook a
     `wati-address`) — probado, escribió en la libreta `contacts` (`source=wati`).
  2. **Despacho:** flujo WATI "Despachar pedido" (regla `Contiene: confirmar envio` → webhook a `wati-order` con
     `{telefono:{{phone}}}`) — probado 2 veces, creó órdenes reales en Shipday (ids 50009967 y la de 08-jul) y
     escribió en `pedidos` (`fuente=wati`, `estado=nuevo`, `pedido_ref=WATI-…`).
  3. **Lectura:** tool `estado_pedido` del copiloto — ya puede leer esas filas.
  Ambos flujos son SOLO webhook (sin mensaje de cierre propio; `wati-address`/`wati-order` ya notifican al
  cliente). **Aprendizaje clave:** las reglas de WATI disparan con mensajes ENTRANTES (del cliente) — un
  mensaje que escribe el asesor desde el inbox es saliente y NO dispara nada; por eso ambos flujos se activan
  con el CLIENTE escribiendo el keyword (el asesor se lo pide primero). WATI no tiene disparador por
  etiqueta/tag (solo por atributo de contacto) — evaluado y descartado por ahora, el patrón por keyword ya
  cumple. **Housekeeping pendiente:** cancelar en Shipday las 2 órdenes de prueba (WATI-1783450748729 /
  WATI-1783524383338); limpiar la fila de contacto de prueba si se desea. Los 5 atributos "cosméticos" de WATI
  (`direccion_envio` etc., solo para que el asesor los vea en el panel) siguen sin crear — no son necesarios
  para que el circuito funcione.
- **Base histórica (v48, fue EN VIVO 07→09-jul, hoy corriendo bajo v51): `copilot-webhook` v48
  (`v48-conciencia-pedidos`)** (desplegado 07-jul por Browse; superseded por el deploy CLI del 09-jul).
  Acumulado v40–v47 + el **LECTOR** de conciencia de pedidos (tool `estado_pedido`). Migraciones `pedidos` +
  `contacts_grant` **APLICADAS** (07-jul). Los **ESCRITORES** del puente Shipday ya se desplegaron por CLI
  (`.\deploy.ps1`, sin argumentos = las 6 funciones) — `pedidos` ya se llena con tráfico real. Secretos del
  puente completos; `WATI_WEBHOOK_TOKEN` y `SHIPDAY_WEBHOOK_TOKEN` rotados a valores random fuertes durante
  esta sesión (los viejos habían quedado expuestos en chat). Nota: los escritores del puente NO se pueden
  desplegar por Browse (importan `../_shared`) — siempre por CLI.
- **Base histórica (v45, ahora corriendo bajo v48): `copilot-webhook` v45 (`v45-endurecimiento-quirurgico`).** Desplegado con `verify_jwt=false`
  (incluye v40–v44: `.trim()` a secretos, trato de usted, guardrails, sucursales del interior, autotest de
  inventario y guard anti-fuga; + v45 endurecimiento quirúrgico — ver detalle abajo). **`COPILOT_WEBHOOK_KEY`
  YA ENDURECIDA** (02-jul): secreto aleatorio + URL actualizada en WATI, verificado con tráfico real
  (`webhook_key_es_default:false`). **INVENTARIO RESUELTO (01-jul):** el stock derivaba en TODOS
  los productos por un token de Shopify viejo; se subió un token nuevo (15:39) y el deploy de v44 (16:05)
  reinició la instancia y lo cargó. El autotest lo confirmó desde adentro (`diagnostico:ok_inventario_visible`,
  HTTP 200, PG-145XL `totalInventory:87`); como el bot usa el MISMO token y la MISMA consulta, ya muestra la
  cantidad real. Migraciones aplicadas (`ref_codes`, `messages_cache_tokens`). **Prompt caching (v35/v38) confirmado:**
  `avg(tokens_in)` ~9.554 → ~2.337; ~−69% de costo de input real. v36/v37 (horario + feriados) en vivo.
  **PROBANDO Sonnet 5:** `COPILOT_MODEL=claude-sonnet-5` (flipeado ~21:02Z; v39 dejó `thinking` apagado para
  que sea seguro). A/B en curso (auditoría: grounding/coexistencia sólidos). Revertir = `claude-sonnet-4-6`.
- **DESPLEGADO (01-jul ~16:05): v44 (`v44-inv-selftest-antifuga`).** Dos cosas de la auditoría del
  01-jul (Sonnet 5): (a) **autotest de inventario** — como el `.trim()` de v40 no arregló el stock (seguía
  derivando en todos los productos) y el token de Shopify no se puede diagnosticar desde afuera (ya no lo
  tenemos), se agrega `inventarioSelfTest(pid)` + rama GET `?selftest=inventario` (gated por `?key=`, NO expone
  el token) que corre la consulta Admin `totalInventory` desde ADENTRO y devuelve status HTTP + errores GraphQL
  + nodos → distingue token inválido (401/403) de FALTA DE SCOPE `read_inventory` (HTTP 200 con "Access denied
  … read_inventory", que `inventarioShopify` tragaba en silencio → derivaba) de base mal. (b) **guard anti-fuga
  de tool-call** — Sonnet 5 (raro, 1 caso) escribió `<invoke name="buscar_producto">…</invoke>` como TEXTO en
  vez de invocarla nativa → salía XML crudo al cliente; `pareceFuncionEnTexto` lo detecta y manda la respuesta
  de respaldo (como v23) en su lugar (`job_log` `fuga_tool_texto`). Solo diagnóstico + guard de salida; no toca
  prompt/tools/system, guardrails ni el caché de v35. Sin cambios de esquema. **Verificado en prod:** el
  autotest (`?selftest=inventario`) dio `ok_inventario_visible` con PG-145XL `totalInventory:87` → el token
  nuevo funciona y el inventario ya se muestra. (Hallazgo aparte: `COPILOT_WEBHOOK_KEY` no estaba en secrets
  → ✅ **endurecido el 02-jul** tras desplegar v45: secreto aleatorio + WATI actualizado + verificado.)
- **EN EL REPO, LISTO PARA DESPLEGAR (empareja con su escritor): v48 (`v48-conciencia-pedidos`).** El bot no
  sabía si un cliente tenía un pedido en curso; ante "¿dónde está mi pedido?" adivinaba o derivaba a ciegas.
  Fix grounded: nueva tool **`estado_pedido`** (sin args del modelo: toma el `wa_id` del CONTEXTO) → RPC
  **`estado_pedido(p_wa_id)`** que lee la tabla **`pedidos`** (dedup+fusión por número de pedido) y **frasea
  en CÓDIGO** (`frasearPedido`, pura) por estado normalizado, con guía/tracking si hay. Regla de prompt
  (CONCIENCIA DE PEDIDOS): relaya la `respuesta_sugerida`, NUNCA inventa estado/fecha/guía; preguntar por un
  pedido despachado NO es interrupción; si `sin_pedidos` NO afirma que el cliente no tiene pedidos (vista
  PARCIAL) → un asesor confirma. **(v48 la sacaba de MODO ASISTENCIA; v50 la INCLUYE** — el estado es
  read-only y no compromete nada.) `NEEDS_TOOL_RE` fuerza tool en "mi pedido/
  rastreo/guía/estado del pedido/cuándo me llega". **Los ESCRITORES YA ESTÁN EN EL REPO Y CABLEADOS (Opción
  A):** se unió (git merge) la rama del puente Tookan→Shipday — 5 Edge Functions (shopify-webhook/
  shipday-status/wati-order/wati-address/contacts-lookup + `_shared/`) + el servicio Node `src/` con pruebas —
  y las 3 funciones de despacho ahora hacen `upsertPedido()` (best-effort, con timeout, en `_shared/db.ts`) a
  `pedidos` por **(fuente, pedido_ref)** (shipday-status NO trae id interno de Shipday → el número de pedido es
  la llave común); el copiloto lo LEE. Todo en el MISMO proyecto Supabase (`config.toml` = `jbigmlcalcwiphqeudxd`;
  se le agregó `copilot-webhook` con verify_jwt=false). **CAMBIO DE ESQUEMA:** `20260707120000_pedidos.sql`
  (tabla + RPC + índice único (fuente,pedido_ref), validada en Postgres local end-to-end; **APLICADA 07-jul**,
  verificada: grants ok + RPC devuelve `sin_pedidos`). 172
  golden + 18 node tests verdes. Contrato/estado en `docs/handoff-pedidos-conciencia.md`. **Revisión
  adversarial:** (lector, 2 agentes) cerró F1 (no filtrar el array crudo al modelo), la regresión de `estado`
  en el merge del RPC (rank de avance → un evento tardío no lo hace retroceder), colisión de clave y falsos
  positivos del regex; (cableado, verificación mecánica) confirmó el join `wa_id` sólido end-to-end + revisó
  convergencia/merge/deploy. **Seguro de desplegar aunque la tabla esté vacía** (cae a `sin_pedidos` → deriva).
  Para que aporte valor: aplicar la migración + (re)desplegar las funciones de despacho ya cableadas +
  `copilot-webhook`; confirmar que el pedido de Shipday lleva `orderNumber` = número de Shopify (convergencia).
- **EN EL REPO, LISTO PARA DESPLEGAR: v47 (`v47-tarifa-envio-sector`).** El bot cotizaba el envío de la
  ciudad "desde B/.6.00, según el sector varía" y derivaba; peor, prometía "mismo día"/"a domicilio" en zonas
  donde la ruta Servientrega es impredecible (quejas) o donde NO se hace domicilio (solo retiro). Fix
  GROUNDED: nueva tool **`tarifa_entrega(lugar)`** que llama al **resolver determinista de Postgres**
  (`resolver_tarifa`; fuente ÚNICA = tablas `zonas_entrega`/`sectores_entrega`) y **frasea en CÓDIGO**
  (`frasearTarifa`, pura) según el método REAL de cada zona: entrega propia (mismo día, $6-7), RETIRO en
  agente verde ($6, este SIN domicilio), puerta a puerta Servientrega ($9) o "un asesor coordina". El resolver
  desambigua nombres repetidos (San José: $6 Betania vs $6 retiro Mañanitas → pide corregimiento) y respeta la
  geografía (Summit del Canal NO va a retirar a Tocumen). El **modelo de zonas se decidió paso a paso con
  Gerencia** (este: Tocumen/Mañanitas/24-Dic retiro $6 sin domicilio; Pacora/Las Garzas/San Martín/Felipillo
  + Ancón-Canal puerta a puerta $9; Cerro Azul asesor; Z5 Norte $9; interior por Servientrega) y quedó
  **VALIDADO contra Postgres real** (3 migraciones YA APLICADAS — ver abajo). Best-effort: fuera de la
  cobertura metro cae a `sucursales_interior`/`info_tienda` o deriva. **Revisión adversarial pre-deploy (2
  agentes, verificación mecánica):** sacó `tarifa_entrega` de MODO ASISTENCIA (cotizar COMPROMETE un pedido y
  ahí el humano lleva la venta; `sucursales_interior` sí queda) y aclaró el enrutamiento (retiro de un sector
  de la CIUDAD = `tarifa_entrega`, no `sucursales_interior`). 125 golden tests. **Acumulativo sobre v46** →
  desplegar trae v46+v47. `git pull` + `.\deploy.ps1` (o Browse). También corregido `store_facts` (genérico de
  envío honesto: Tocumen ya no dice $10, "mismo día" con la excepción este/norte).
- **INCLUIDO EN v47 (acumulativo, aún sin desplegar): v46 (`v46-sucursales-proceso`).** Reporte real de un cliente en
  Santiago: el bot respondió *"Sí, en Santiago tenemos el punto CDS Santiago, teléfono…"* — sonaba a que
  QSP tiene tienda propia ahí, en vez de explicar que el pedido SE ENVÍA por Servientrega y se retira en
  ese punto. Causa: el prompt (desde v43) decía "responde SOLO con los puntos que devuelva" — dato suelto,
  sin el proceso; la tool `sucursales_interior` ya traía todo lo necesario (provincia/nombre/datos), no
  hacía falta tocar código. Fix de PROMPT: nueva instrucción explícita — arma la respuesta como "puede
  enviarlo a [ciudad] ([provincia]) y retirarlo en el punto Servientrega [nombre]" + teléfono/horario;
  PROHÍBE decir "tenemos el punto/sucursal en [ciudad]"; aclara que QSP NO tiene tiendas en el interior;
  combina con `info_tienda` (`plazo_interior`) en la misma respuesta si aporta. De paso, la página web
  (`web/envios-interior-sucursal.html`) tenía el MISMO "tenemos 45 puntos" → corregido a "trabajamos con
  la red Servientrega, que tiene 45 puntos…" (la página NO la lee el bot, pero un cliente que la abra
  tendría la misma confusión un piso más arriba del texto que ya explica el proceso en 4 pasos). 2 golden
  tests nuevos (112 en total) que verifican que la frase prohibida esté explícitamente vetada en el prompt
  y que la explicación del proceso (Servientrega) esté presente — regresión imposible de colar en silencio.
  Solo prompt + copy; sin cambios de lógica/esquema. Reescribe el caché de v35 (re-warm puntual).
- **DESPLEGADO (02-jul): v45 (`v45-endurecimiento-quirurgico`).** Paquete quirúrgico de la
  auditoría del 02-jul (día completo: 205 msgs, 44 convs, inventario ya mostrando cantidades, 0 críticos)
  + una consultoría externa (ChatGPT) CONTRASTADA contra el código — se adoptó lo verificado, se difirió lo
  riesgoso. Adoptado: (1) **fix eco de despedida de handoff** (bug real, 2 casos: se insertaba después de
  enviar y sin `model` → el anti-eco no ve filas NULL → el eco quedaba como "asesor fantasma" y reseteaba el
  reloj de v31; ahora insert-antes con `model='handoff-fijo'` + anti-eco null-safe); (2) **políticas
  comerciales** — el bot negó "esquema de descuentos" sin fuente y el asesor luego SÍ ajustó precio → regla:
  ni afirmarlas ni negarlas sin info_tienda; (3) **ejemplo con tuteo** en CAPTURA DE DATOS que v41 no limpió;
  (4) **SKU sueltos fuerzan tool** (W1105A, BA1U5LA#ABM, FDC-BT15KR-6B… letra+dígito; teléfonos/RUC/cantidades,
  cédulas con letra y horas NO matchean); (5) **garantía/devolución GENERAL → info_tienda** (era inconsistente
  con BASIC_INFO_RE); el reclamo concreto ("quiero devolver", "necesito una devolución", "aplicar mi garantía",
  "llegó dañado") sigue a humano, con sesgo conservador (lo ambiguo → handoff como en v44); (6) estilo: no
  pensar en voz alta, no "ya lo anoté/el asesor ya vio", compatibilidad ni "como probabilidad"; (7) seguridad:
  `.trim()` a todos los secretos, tope de payload 256KB (header + body real), cédula PA con letra
  (E-8-104720) agregada a `INTERRUPT_RE`, email→dominio en `job_log`, `evento_sin_texto` ya no vuelca el
  payload, `COPILOT_DIAG_KEY` opcional para el selftest, `webhook_key_es_default` en healthcheck;
  (8) **`tests/golden.mjs`** (108 casos, extrae los regex/helpers del index.ts real; correr
  `node tests/golden.mjs` antes de cada deploy). **Antes del deploy, una revisión adversarial (13 agentes,
  verificación mecánica) halló y corrigió 2 regresiones mayores de la 1ª versión del paquete** (reclamos con
  artículo que dejaban de ir a handoff; el patrón SKU matcheaba cédulas con letra y horas) — los
  contraejemplos quedaron en la suite.
  DIFERIDO con razón: re-ranking de búsqueda (validar contra tienda viva primero), validador post-LLM duro
  (habría roto respuestas correctas del 02-jul), tabla de sucursales (decisión documentada), audio (v46),
  quitar el default de WEBHOOK_KEY (primero crear el secreto + WATI, si no el bot queda mudo). Sin cambios
  de esquema. Reescribe el caché de v35 (re-warm).
- **MODO: LIVE A TODOS.** `COPILOT_MODE=live` + `COPILOT_LIVE_ALLOWLIST=all`
  (`live_targets:"all"`). El piloto por allowlist (sombra → número por número) ya se
  completó; hoy el bot responde a todos los clientes. El default del CÓDIGO sigue
  siendo **sombra** (si faltara el secreto, no envía) — ver guardrails.
- **MODELO: `claude-sonnet-4-6`** (`COPILOT_MODEL`). Tras evaluar Haiku 4.5, Sonnet 4.6
  y Opus 4.8 sobre tráfico real, Sonnet quedó como el punto justo (ver abajo). Haiku es
  solo el FALLBACK del código si faltara el secreto.
- **Coexistencia con asesor humano: VALIDADA** (la razón por la que se había frenado el
  piloto). Fix v15: cuando el negocio escribe (`owner=true`), la conversación pasa a
  `status='handoff'` y el bot ya NO la retoma solo (antes volvía a los 45 min y se
  "robaba" ventas humanas). El bot solo atiende contactos nuevos / sin asignar.
- **v18 validado en producción (2026-06-18):** el cliente escribió `toner tn830xl` (sin
  guion) → el bot encontró el *TN-830XL ($116)* en vez de decir "no lo tengo". Fix del
  guion (con/sin) funcionando.
- **v19 (visión) validado en producción (2026-06-18):** caso A (foto de producto) → el
  bot identifica, busca con `buscar_producto` y da precio real; caso B (comprobante de
  pago / dato fiscal) → se ABSTIENE ("un asesor lo revisa"). Los dos caminos —el útil y
  el seguro— funcionando. El descubrimiento del shape de media de WATI se hizo con el
  diagnóstico v18.1 (la URL del archivo viene en el campo `data`).
- **v20 (endurecimiento) tras AUDITAR el 1er día live a todos (2026-06-18):** la auditoría
  (101 convs, 156 resp del bot, 88 con asesor) confirmó la coexistencia → **0 clientes
  reales pisados** (las 2 alarmas eran la línea de pruebas), 13 abstenciones, visión 15/15,
  grounding ~50%. Se hallaron 2 problemas NO de seguridad, arreglados en v20: (1) respuestas
  dobles/triples en ráfaga → **anti-duplicado** (solo el último mensaje contesta, chequeo
  pre/post LLM); (2) 23 errores `messages_mode_check` por cruzar `COPILOT_MODE`↔`COPILOT_MODEL`
  → **clamp de MODE** (inválido cae a `shadow`, no rompe inserts). Además **anti-carrera**
  (no pisar si un asesor entró durante el LLM) y **guard de prefill** (la conversación
  siempre termina en mensaje de usuario). Veredicto: **GO** para mantenerlo abierto a todos.
- **v21 (ITBMS + inventario real + anti-eco duro + prefill, 2026-06-19):** (1) **ITBMS** — los
  precios de Shopify son SIN impuesto; `buscar_producto` calcula en CÓDIGO y devuelve `precio_usd`
  + `itbms_7pct` + `total_con_itbms` (el LLM no hace aritmética). (2) **Inventario real** —
  `buscar_producto` consulta Shopify Admin (`totalInventory`) y devuelve un campo `stock` ya
  resuelto: >3 muestra el número, ≤3 (incl. 0) deriva a un asesor para verificar inventario físico
  (el bot nunca ve ni inventa el número); best-effort (sin token → "un asesor confirma"). (3)
  **Anti-eco duro** — la respuesta se inserta ANTES de enviarse por WATI → el eco no se guarda como
  asesor → se acabaron los handoffs falsos (eran ~5/día). (4) **Guard de prefill** endurecido.
  Validado en prod (Epson 544 → $10.00 + ITBMS = $10.70; plotter → "un asesor verifica stock").
- **v22 (conciencia de horario, 2026-06-19):** atención Lun-Vie **9:00am–5:00pm** (Panamá, UTC-5
  fijo). Fuera de horario el bot SIGUE respondiendo lo automático, pero al derivar aclara que un
  asesor responde en el próximo horario hábil (no promete humano inmediato); el handoff fijo
  también es consciente del horario. (Feriados: resueltos en v37.) Validado en prod.
- **v23 (resiliencia ante fallos de API, 2026-06-23):** tras una auditoría que halló un bache de
  Anthropic (`529 overloaded` / `500 internal`) de ~33 min que dejó ~21 turnos sin respuesta:
  `maxRetries=3` en el SDK + **respuesta de respaldo** (si la API falla y no se alcanzó a responder,
  en vez de silencio se manda "estamos con alto volumen, un asesor te ayuda…", consciente del
  horario; respeta live/anti-duplicado/handoff; `job_log` `respuesta_respaldo`, `model='fallback'`).
- **v24 (venta consultiva, 2026-06-24):** sección "VENTA CONSULTIVA" en el prompt — el bot asesora
  (intake antes de recomendar, se adapta al tipo de cliente, recomienda por necesidad, posiciona
  originales, usa la web como apoyo, B2B→deriva) sin aflojar la regla de oro ni la anti-interrupción.
  Destilado de la nueva `docs/base-conocimiento-qsp.md` (KB de negocio versionada).
- **v25 (captura de lead + buscar antes de negar, 2026-06-24):** (1) BUSCAR ANTES DE NEGAR: se amplió
  `NEEDS_TOOL_RE` al catálogo completo (monitores, escáneres, UPS, accesorios, laptops, cables…, no
  solo impresión) + regla "nunca niegues sin buscar" → se acabó el "no lo tenemos" de memoria que
  luego se corregía (validado en prod: "¿venden monitores?" → sí + modelos reales). (2) CAPTURA DE
  LEAD (pasiva): tool `guardar_lead` escribe en atributos de WATI; lee los que ya tenemos (del
  payload) para no repreguntar; respeta anti-interrupción (nunca RUC/factura). Validado en prod.
- **v26 (conciencia de canal, 2026-06-24):** el bot atiende POR WhatsApp → ya NO dice "escríbenos por
  WhatsApp" ni da el número de la tienda; al derivar dice "un asesor te responde por aquí".
- **v27 (nombre y apellido, 2026-06-24):** `guardar_lead` también captura `nombre` y `apellido`
  (atributos de WATI), además de `email` y `empresa`; el correo ya no es obligatorio (guarda lo que el
  cliente dé). Captura real validada en prod.
- **v28–v30 (puente WhatsApp→web por `ref_code`, 2026-06-24/25):** los links de producto que emite
  `buscar_producto` llevan tracking para atribución / identidad omnicanal en el CDP. (v28) URL **apex**
  (sin www) + UTMs + un `ref_code` opaco de 8 alfanuméricos (crypto) por producto; se guarda
  `{ref_code→wa_id,handle}` en la tabla **`ref_codes`** (best-effort; NUNCA se emite un code sin guardar)
  + endpoint **GET `?ref_code=`** que el CDP resuelve. (v29) fix DETERMINISTA: el LLM "limpiaba" el link
  (le quitaba el `?utm…&ref_code=`) → `reaplicarTracking` reaplica el tracking post-LLM. (v30) el endpoint
  acepta `Authorization: Bearer <RESOLVE_SECRET>` (el CDP lo lee por Bearer). Privacidad: nunca `wa_id`/PII
  en la URL, solo el `ref_code`. Contrato y verificación: `docs/handoff-cdp-ref-code-bridge.md`. Verificado
  end-to-end en prod.
- **v31 (ciclo de vida del handoff, 2026-06-26):** el bot deja de quedarse MUDO para siempre en
  `status='handoff'`. REACTIVO (lo gatilla un mensaje del cliente), midiendo el tiempo desde el **último
  mensaje del asesor** (`model='human-agent'`): (1) **ASISTENCIA** (≥15 min sin asesor) — si el cliente
  hace una pregunta BÁSICA de tienda (ubicación/horario/pago/envío/devolución; `BASIC_INFO_RE`), el bot
  adelanta SOLO esa info vía `info_tienda` (única tool, `modoAsistencia`), breve y deferente, y la
  conversación **SIGUE en handoff** (no le quita la venta al humano). (2) **COLD-RETURN** (>24 h sin asesor)
  — la atención humana se considera fría → el bot **RETOMA todo** (`status→'bot'`) y procesa como cualquier
  cliente. Umbrales configurables (`COPILOT_HANDOFF_ASSIST_MIN`/`COPILOT_HANDOFF_COLD_HOURS`). **Guardrails
  intactos:** `INTERRUPT_RE` (pago/fiscal/trámite) bloquea AMBOS caminos; si el asesor vuelve a escribir,
  `owner=true` regresa a handoff y el anti-carrera evita pisarlo; el anti-eco reconoce el envío propio
  (`model='assist-handoff'`, no resetea el reloj). Si NUNCA escribió un humano (handoff por keyword), se
  mantiene el comportamiento v30. Sin cambios de esquema. (Diseño acordado con Gerencia: 15 min / 24 h,
  reactivo, solo conversaciones activas.)
- **v32 (conciencia temporal, 2026-06-26):** el bot mezclaba el "ayer" con el "hoy" porque el historial
  se le pasaba SIN marca de tiempo y, dentro de horario, ni sabía la fecha. Caso real: ayer el cliente
  dijo *"mañana le paso"*; hoy escribió *"buenas tardes"* y el bot respondió *"le esperamos mañana"*
  (cuando venía HOY). Fix, todo CONTEXTO (no toca guardrails): (1) `CONTEXTO TEMPORAL` fijo con la
  fecha/hora actual de Panamá (antes solo se inyectaba fuera de horario); (2) cada mensaje ANTERIOR del
  historial se marca con cuándo se dijo (`[hoy …]`/`[ayer …]`/`[fecha …]`, hora de Panamá) — el
  último/actual va limpio (no interfiere con el caption de visión); (3) regla: los mensajes de días
  previos son contexto PASADO, no arrastrar "mañana/hoy/ahora" viejos, y un saludo nuevo tras un corte
  de día = visita nueva. Se agrega `created_at` al fetch del historial. Sin cambios de esquema.
- **v33 (extracción de modelo robusta, 2026-06-29):** `modelosEn` tenía 2 huecos que rompían búsquedas
  reales: (1) códigos que empiezan con dígito + sufijo (140XL, 141XL, 3253ci) no se extraían; (2) códigos
  de varios segmentos con guion (PT-H110) se partían mal (agarraba "H110"). Confirmado con tráfico real:
  la etiquetadora Brother existe como handle `…-brother-pth110` pero el bot buscaba "PT-H110" y no la
  hallaba. Fix: `modelosEn` toma cualquier token alfanumérico (con guiones) con ≥1 dígito y largo≥3;
  `variantesModelo` amplía las formas con/sin guion (multi-segmento). Probado en los casos que fallaban +
  regresión. NO resuelve "modelo de IMPRESORA → consumible" (Kyocera 3253ci → tóner TK-8337K): eso es
  brecha de DATOS de compatibilidad (roadmap #3), no de extracción.
- **v34 (la búsqueda lee los tags de compatibilidad, 2026-06-29):** la compatibilidad impresora→consumible
  YA está cargada en Shopify como **tags** del producto ("Canon PIXMA MG2110", "Kyocera TASKalfa 3253ci"…),
  pero `suggest.json` por defecto NO busca en los tags (solo title/product_type/variants.title/vendor). Fix
  de UNA línea: agregar `tag` a `resources[options][fields]`. **Probado contra la tienda real:** `q=3253ci`
  SIN tag → 0 resultados; CON tag → los 4 TK-8337 (C/M/Y/K), limpio. Resuelve la brecha del v33 (3253ci →
  TK-8337) reusando el dato que el equipo ya mantiene en tags. (Futuro opcional: sumar `body` para
  compatibilidad escrita solo en la descripción.)
- **v35 (prompt caching, 2026-06-30 — listo para desplegar):** el input subió (el prompt creció
  v24→v34 + el volumen del lunes/reactivación) y es **input-dominado** (~10k in / ~155 out por turno).
  Fix **sin cambiar comportamiento**: el `system` pasa de un string concatenado a un arreglo de 2 bloques
  → (1) `SYSTEM_PROMPT` estático con `cache_control:{type:"ephemeral"}` (cachea **tools + SYSTEM_PROMPT**,
  el prefijo estable; render order de la API: tools → system → messages) y (2) el contexto **VOLÁTIL**
  (el `CONTEXTO TEMPORAL` con la hora actual de v32, nuevo/en-curso, horario, datos del cliente o
  `ASSIST_SUFFIX`) en un 2º bloque **SIN** `cache_control`, DESPUÉS del breakpoint, para no invalidar el
  caché cada turno. Lectura de caché 0.1× / escritura 1.25×, TTL 5 min; el prefijo supera de sobra el
  mínimo de 2048 tokens de Sonnet 4.6. GA (sin header beta). Verificar con `usage.cache_read_input_tokens>0`
  y `avg(tokens_in)` cayendo (`input_tokens` NO incluye lo leído de caché). En MODO ASISTENCIA las tools
  difieren (subconjunto acotado; v50) → ese camino mantiene su propia entrada de caché (raro, no afecta el normal).
  Sin cambios de esquema. **Desplegado y confirmado en prod (2026-06-30):** `avg(tokens_in)` ~9.554 → ~2.337
  (−75% de input a 1×); turnos simples ~800–1.300 in (prefijo servido del caché), turnos con tool 2.7k–7.6k
  (el historial y el JSON de productos NO se cachean, por diseño).
- **v36 (próximo horario hábil calculado en código, 2026-06-30 — desplegado):** bug real en prod
  → a la 1:00am del martes 30/jun el bot derivó diciendo que un asesor respondería "desde el miércoles 1 de
  julio a las 9:00am" cuando lo correcto era **HOY** (martes 30) a las 9:00am (faltaban 8 h para abrir). v22
  le pedía al LLM "deducí cuál [es el próximo horario hábil]" y eso es lo que falla: trata la madrugada como
  si el día ya hubiera pasado. Fix **determinista** (no toca guardrails ni el caché de v35): nueva función
  `proximoHorarioHabil(ahoraMs)` que devuelve la apertura concreta ("hoy martes 30 de junio a las 9:00am" /
  "mañana …" / "el lunes 6 de julio …", Lun-Vie 9am) y se inyecta TAL CUAL en el CONTEXTO HORARIO con la
  orden de NO recalcularla. Casos cubiertos (probados): día hábil antes de las 9 → HOY; día hábil después de
  las 5 → próximo hábil; fin de semana → lunes; rollover de mes/año. Va en el bloque VOLÁTIL del system (no
  invalida el caché). Sin cambios de esquema.
- **v37 (feriados nacionales de Panamá, 2026-06-30 — desplegado):** v22/v36 solo conocían Lun-Vie
  9-5 + fines de semana → un feriado entre semana se trataba como día hábil (el bot daría a entender que un
  asesor responde "hoy", y al derivar apuntaría a un día cerrado). Fix determinista: se agregan los feriados
  nacionales. Los **FIJOS** (Año Nuevo 1/1, Mártires 9/1, Trabajo 1/5, los de noviembre 3/4/5/10/28, Madres
  8/12, Duelo Nacional 20/12, Navidad 25/12) van por mes/día. **Carnaval (lun/mar) y Viernes Santo son
  MÓVILES** (dependen de la Pascua) → se calculan con **Meeus/Jones/Butcher** (Carnaval = Pascua−48/−47,
  Viernes Santo = Pascua−2), correcto para CUALQUIER año, sin mantenimiento. En un feriado: `horarioPanama`
  marca cerrado y `proximoHorarioHabil` salta al próximo día hábil no feriado (incluye feriados consecutivos
  como Carnaval lun+mar); el CONTEXTO HORARIO aclara "hoy es feriado". Probado contra la lista oficial 2026
  (14/14) + verificación de Pascua 2027. No toca guardrails ni el caché de v35. Sin cambios de esquema.
- **v38 (telemetría de prompt caching, 2026-06-30 — desplegado):** el caching de v35 abarató el
  input (`avg(tokens_in)` ~9.554 → ~2.337) pero `tokens_in` (= `usage.input_tokens`) NO incluye lo
  leído/escrito al caché → el ahorro $ exacto y el hit-rate quedaban como proxy. Fix: persistir por turno
  `usage.cache_read_input_tokens` y `usage.cache_creation_input_tokens` (sumados a través de las iteraciones
  del loop de tool-use) en dos columnas nuevas de `messages`. **SOLO telemetría** — no cambia comportamiento,
  prompt, tools ni system. **CAMBIO DE ESQUEMA:** migración `20260630160000_messages_cache_tokens.sql`
  (`ADD COLUMN`, idempotente, no requiere GRANT nuevo porque el grant a `service_role` es a nivel de tabla).
  Lectura de caché se factura 0.1×, escritura 1.25×, `tokens_in` 1× → con estas columnas se calcula el $
  real. Verás `cache_creation>0` en el 1er turno de cada ventana de 5 min y `cache_read>0` en los siguientes.
  **Confirmado en prod:** turnos con `cache_read≈9.660` a 0.1×, `cache_creation=null` (lecturas) → ~−69% de
  costo de input real (no solo proxy).
- **v39 (thinking apagado explícito — prep Sonnet 5, 2026-06-30 — desplegado):** prep para PROBAR
  **Claude Sonnet 5** cambiando solo `COPILOT_MODEL`. El código no mandaba `thinking`; en Sonnet 4.6 eso es
  "sin pensar" (lo actual), pero en **Sonnet 5 omitirlo enciende adaptive thinking por defecto** → latencia y
  tokens extra y, con `max_tokens=1024`, riesgo de truncar la respuesta. Fix: `thinking:{type:"disabled"}`
  fijo en el `messages.create`. **NO-OP en la Sonnet 4.6 viva** (mismo comportamiento), deja seguro el A/B de
  Sonnet 5. No toca prompt/tools/system ni el caché de v35 (thinking es constante, no por turno). Sin cambios
  de esquema. (`temperature`/`top_p`/prefill no nos afectan — no los usamos.) **Plan:** desplegar v39 →
  cambiar `COPILOT_MODEL=claude-sonnet-5` en un número de prueba → comparar grounding y costo (tokenizer +30%,
  intro $2/$10 hasta 2026-08-31) con la telemetría de v38 → decidir antes del 31/ago (volver a 4.6 = flipear
  el secreto).
- **v40 (.trim() defensivo a secretos — fix inventario, 2026-06-30 — listo para desplegar):** el inventario
  real (v21) dejó de mostrarse: el bot decía "un asesor te confirma la cantidad" en vez de "X unidades". El
  token Admin de Shopify estaba bien (el query Admin devuelve `totalInventory`), pero el secreto
  `SHOPIFY_ADMIN_TOKEN` quedó guardado **con un espacio/salto de línea** al pegarlo → Shopify 401 →
  `inventarioShopify` devuelve `{}` → `stockTexto` deriva. Fix: `.trim()` al leer `SHOPIFY_ADMIN_TOKEN`,
  `SHOPIFY_ADMIN_API_BASE` y `COPILOT_MODEL` (un espacio en este último también rompería el A/B de Sonnet 5).
  NO-OP si el secreto ya estaba limpio. El deploy además reinicia la instancia → toma el token nuevo. No toca
  prompt/tools/system ni el caché de v35. Sin cambios de esquema. (La regla de stock >3/≤3 ya existía: el
  problema era de pipeline/secreto, no de lógica.)
- **v41 (trato de usted, español de Panamá — sin voseo, 2026-06-30 — listo para desplegar):** el bot salía
  con voseo ("vos", "tenés", "seguí"…) que no es de Panamá (Panamá usa usted/tú), más notorio con Sonnet 5
  (sigue el registro al pie de la letra). Pedido de Gerencia: chatear como panameño, amable y PROFESIONAL,
  de **usted**. Fix de ESTILO (no toca guardrails ni lógica): (1) regla explícita en `ESTILO` — trato de
  usted, NUNCA voseo, con ejemplos correctos; (2) se limpió el voseo de las instrucciones inyectadas
  (`CONTEXTO HORARIO` "Seguí/aclará/usá" → "Sigue/aclara/usa") y de los textos fijos al cliente (respuesta de
  respaldo "Disculpá…te ayuda" → "Disculpe…le ayuda"; ejemplo de MODO ASISTENCIA "te confirmo/tu solicitud" →
  "le confirmo/su solicitud"). Cambia el SYSTEM_PROMPT → la 1ª respuesta tras desplegar reescribe el caché de
  v35 (re-warm puntual). Sin cambios de esquema.
- **v42 (endurecimiento de guardrails — auditoría Sonnet 5, 2026-06-30 — listo para desplegar):** se auditó
  tráfico real en Sonnet 5 (grounding y coexistencia sólidos: el bot hace preventa, los humanos cierran
  cotización/pago/factura sin que el bot toque datos fiscales). 3 huecos hallados y cerrados: (1) **genéricos**
  — el bot ofrecía "una alternativa genérica" que `buscar_producto` no devolvió (caso GI-190); regla en VENTA
  CONSULTIVA: nunca ofrecer/insinuar genérico/compatible/sustituto que la tool no trajo (la regla de oro
  aplica a TIPOS/OPCIONES, no solo a modelos). (2) **specs inventados** — daba rendimiento/velocidad (ej.
  L3250 "4500/7500 págs") que la tool NO devuelve; regla en REGLA DE ORO: solo afirmar datos del resultado,
  no adivinar specs. (3) **anti-interrupción en pago** — ante "puedo pagar ya / a dónde transfiero / programar
  la entrega" se comprometía ("puede pagar hoy, le llega mañana") en vez de derivar; se amplió `INTERRUPT_RE`
  (intención de pagar/transferir/coordinar entrega, sin pisar "¿cómo pago?"/"¿aceptan yappy?" — probado 22/22)
  + regla que distingue MÉTODOS (ok vía info_tienda) de COORDINAR un pedido (asesor). Solo prompt + regex, no
  toca lógica de envío/handoff ni esquema. Reescribe el caché de v35 (re-warm). (Estos huecos los amplificaba
  la tendencia más consultiva de Sonnet 5.)
- **v43 (sucursales de recogida del interior — grounded, 2026-06-30 — listo para desplegar):** el bot solo
  tenía la URL de la página de envíos al interior, así que ante "¿hay sucursal en David?" ADIVINABA ("sí hay
  sucursal en David") sin el dato real. Fix grounded: nueva tool **`sucursales_interior(lugar)`** con las **45
  sucursales Servientrega** (provincia, nombre, teléfono, horario) extraídas del listado oficial
  (`web/envios-interior-sucursal.html`). Match por substring sin acentos contra provincia/nombre; **el modelo
  aporta la geografía** (qué provincia es cada ciudad → enruta David→Chiriquí) y los **datos salen de la lista**
  (no inventa). Disponible también en MODO ASISTENCIA (es info de logística). `NEEDS_TOOL_RE` ya forzaba tool
  en "sucursal/recoger/retir". Respuesta de diseño a Gerencia: hay que **dotarlo de los datos** (no confiar en
  que el modelo sepa direcciones/teléfonos); la geografía sí la sabe el lenguaje. La lista vive en código
  (estática, fácil de refrescar; futuro opcional: metaobjeto de Shopify si la red cambia seguido). Sin cambios
  de esquema.
- **Despliegue por CLI (2026-06-26):** se agregó **`deploy.ps1`** (raíz del repo) — `git pull` + `.\deploy.ps1`
  hace `supabase functions deploy … --no-verify-jwt` (byte-exacto desde disco, sin re-escribir contenido)
  y verifica el healthcheck. Es la vía recomendada (ver Despliegue): evita el error de un agente que
  trunca el archivo al pegarlo (rompió prod una vez con el MCP).
- **Auditorías diarias (2026-06-19 y 06-23):** coexistencia perfecta (`bot_piso_a_humano=0`,
  `ecos_falsos=0`), anti-interrupción impecable (pago/fiscal/reembolso → humanos), ITBMS/inventario/
  visión funcionando. Los errores vistos eran **externos** (baches de Anthropic), no de nuestro código.
- `store_facts` **aplicada** con los datos reales de QSP (envío, pagos, ubicación, horario,
  devoluciones, contacto) + **`soporte_reparaciones`** (contactos de servicio técnico por marca,
  verificados — 2026-06-24) y la **URL real** en `sucursales_interior`. Secretos WATI configurados
  (`wati_send_configured:true`).
- **Evaluación de modelos sobre tráfico real:** Haiku ~$0.0036/turno (4.2 s, ~21%
  grounding) · Sonnet ~$0.017/turno (8 s, ~51% grounding) · Opus ~$0.034/turno (7.2 s,
  ~39% grounding). Conclusión: **Opus no justifica el costo** (cuesta 2× Sonnet y
  aterriza MENOS); **Sonnet 4.6 es el punto justo**. Lección: los huecos de búsqueda se
  arreglan en CÓDIGO (determinista), no esperando que un LLM más caro adivine.
- **Sonnet 5 (`claude-sonnet-5`) — por evaluar (v39 deja el terreno listo):** "casi nivel Opus" en
  agéntico/coding y sigue instrucciones más literal (juega a favor del "no inventar"). Mismo contexto (1M) y
  caching (el prefijo supera el mínimo, v35/v38 intactos). **OJO al cambiar:** (1) omitir `thinking` enciende
  adaptive por defecto → v39 lo fija en `disabled`; (2) tokenizer nuevo ~+30% tokens; (3) precio estándar
  igual a 4.6 ($3/$15) pero **intro $2/$10 hasta 2026-08-31**. Costo real con caching: ~−13% vs 4.6 durante
  el intro (el −33% cancela el +30% del tokenizer) y ~+30% después. Plan: A/B en un número de prueba con la
  telemetría de v38 antes del 31/ago; volver a 4.6 = flipear `COPILOT_MODEL`.

## Arquitectura
```
WATI (WhatsApp) ──webhook POST?key=──► Supabase Edge Function `copilot-webhook`
                                          │  (Deno/TS, verify_jwt=false; ACK rápido,
                                          │   trabajo lento en EdgeRuntime.waitUntil)
                                          ├─► Anthropic Messages API (Sonnet 4.6, maxRetries=3) + tool use + visión
                                          │      ├─ imágenes del cliente → descarga de WATI (campo data) → base64
                                          │      ├─ tool buscar_producto → Shopify search/suggest.json (+ ITBMS en código)
                                          │      │                          + Shopify Admin GraphQL totalInventory (stock real)
                                          │      └─ tool info_tienda     → Postgres store_facts
                                          ├─► Postgres (conversations/messages/handoffs/job_log)
                                          └─► WATI sendSessionMessage (solo si liveAllowed:
                                                 MODE=live Y wa_id en allowlist) ◄─ ventana 24h
```
- **Proyecto Supabase:** `jbigmlcalcwiphqeudxd` (**qsp-wati-copilot**). Es
  **SEPARADO** del CDP `tuyheailysudfxiuppmg` (qsp-data-hub) — decisión de
  aislamiento. Comparten la **llave natural `wa_id`** (teléfono) para poder
  cruzar con el CDP más adelante.
- **Deps:** `npm:@anthropic-ai/sdk@0.39.0`, `npm:@supabase/supabase-js@2.45.4`.
- Código canónico: `supabase/functions/copilot-webhook/index.ts` (en este repo) =
  lo desplegado. Para verificar lo que está EN VIVO:
  `mcp__Supabase__get_edge_function(project_id=jbigmlcalcwiphqeudxd, slug=copilot-webhook)`,
  o el healthcheck GET `https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook`.

## Modelo de datos (schema `public`, RLS on, solo service_role)
- **conversations** — `id`, `wa_id` (unique, = teléfono), `sender_name`,
  `status` (`bot`/`handoff`/`cerrada`), `turns_today`/`turns_date` (tope
  anti-costos), `last_message_at`, `confirmed_new` (bool — del evento newContact),
  `first_contact_at`. **v15:** cuando un humano del negocio escribe, pasa a
  `status='handoff'`; para devolverla al bot: `update … set status='bot'`. **v31:** el bot ya gestiona
  el ciclo de vida del handoff solo (asiste a ≥15 min y retoma a >24 h sin asesor); el `update` manual
  sigue funcionando si se quiere forzar.
- **messages** — `conversation_id` FK, `role` (user/assistant/tool/system),
  `content`, `tool_calls` jsonb, `mode` (**shadow**/live), `model`, `tokens_in/out`,
  `cache_read_input_tokens`/`cache_creation_input_tokens` (v38 — telemetría de prompt caching; `tokens_in`
  NO los incluye), `latency_ms`, `wati_message_id` (dedup de webhooks reintentados, índice único).
  Nota v13: los mensajes de un asesor humano se guardan con `role='assistant'` y
  `model='human-agent'` (contexto para el agente).
- **handoffs** — `conversation_id`, `motivo`, `resuelto`.
- **job_log** — `function_name`, `action`, `ok`, `detail` jsonb (telemetría;
  "nunca romper"). Acciones clave: `mensaje_humano`, `abstencion_interrupcion`,
  `contacto_nuevo`, `tope_turnos`, `evento_sin_texto`, `error`, `descartado_superado` (v20
  anti-duplicado), `descartado_handoff_tardio` (v20 anti-carrera), `imagen_procesada`/
  `imagen_no_descargada` (v19), `respuesta_respaldo` (v23 fallback), `lead_capturado` (v25/v27 captura de lead),
  `ref_code_insert_error` (v28), `handoff_cold_return`/`asistencia_handoff` (v31 ciclo de vida del handoff),
  `fuga_tool_texto` (v44 — el modelo escribió una tool-call como texto; NO se envió el XML, fue la respuesta de respaldo).
- **store_facts** (Fase 1.5) — `key`/`value` (vacío = no disponible). Espejo
  (snapshot) del metaobjeto Shopify `store_facts/datos-tienda` (envío, pagos, ubicación, horario,
  devoluciones, contacto, **soporte_reparaciones**, **sucursales_interior**…). Fuente única de
  `info_tienda`. **v25/v27:** `guardar_lead` ESCRIBE en WATI (no en esta tabla) los atributos
  `email`/`nombre`/`apellido`/`empresa` del cliente.
- **ref_codes** (v28) — `ref_code` (PK, 8 alfanuméricos opacos), `wa_id`, `producto_handle`,
  `created_at`. Mapeo para el stitching WhatsApp→web: `buscar_producto` inserta una fila por link de
  producto emitido; el CDP resuelve `ref_code→wa_id` vía el endpoint GET `?ref_code=` (guard
  `RESOLVE_SECRET`). El `wa_id` vive SOLO aquí, nunca en la URL. Contrato: `docs/handoff-cdp-ref-code-bridge.md`.
- **pedidos** (v48) — estado de pedidos/entregas para la CONCIENCIA del bot. Llave natural `wa_id`. La
  ESCRIBEN las funciones de despacho (shopify-webhook/shipday-status/wati-order) vía `upsertPedido()`
  (best-effort) con upsert por **(fuente, pedido_ref)**; la LEE el bot vía RPC `estado_pedido(p_wa_id)`. Campos: `fuente`
  (shopify/wati/shipday/manual), `pedido_ref`, `estado` (normalizado: nuevo/asignado/en_camino/entregado/
  fallido/cancelado), `estado_raw`, `metodo` (propia/servientrega/retiro_agente_verde/asesor), `tracking`,
  `total_usd`, `resumen`. **PII-light** (sin dirección/cédula/pago). Contrato: `docs/handoff-pedidos-conciencia.md`.
- **RPC `estado_pedido(p_wa_id)`** (v48) — lectura del bot: pedidos recientes de un `wa_id` (normaliza el
  teléfono a dígitos en ambos lados), máx 3, **deduplicados y fusionados por número de pedido** (una fila
  shopify + una shipday del mismo pedido → un solo estado, el más fresco, sin perder método/total). `security
  definer`, solo `service_role`. Devuelve jsonb `ok`/`sin_pedidos`.
- **RPC `upsert_conversation(p_wa_id, p_sender_name)`** — upsert atómico por
  `wa_id` + incremento del contador diario de turnos. `security definer`, solo
  `service_role`.

Migraciones (ver `supabase/migrations/`):
`copilot_schema_inicial`, `rpc_upsert_conversation`, `fix_grant_service_role`,
`grants_service_role_tablas`, `conversations_confirmed_new`,
`store_facts` (Fase 1.5 — **aplicada**, 17 datos reales),
`20260624180000_ref_codes` (v28 — **aplicada**, stitching WhatsApp→web),
`20260630160000_messages_cache_tokens` (v38 — **aplicada**, 2 columnas de telemetría de caché),
`20260701000000_contacts` + `20260703000000_contacts_envio` (puente Shipday — libreta de direcciones desde
Tookan; **en prod desde 01-jul**; llegaron al repo con el merge de Opción A),
`20260707130000_contacts_grant` (v48 — **APLICADA 07-jul**, `grant … contacts to service_role` que
faltaba en la migración original; idempotente),
`20260708150000_messages_media_url` (v49 — **FALTA APLICAR, ANTES de desplegar v49** [si no, el insert del
mensaje del cliente falla y el bot queda mudo]: columna `media_url` en `messages` para la visión de ráfaga),
`20260706170000_zonas_entrega` (v47 — **aplicada**, tablas `zonas_entrega`+`sectores_entrega` [419 sectores de
Panamá+San Miguelito] + RPC `resolver_tarifa`, fuente ÚNICA de envíos por sector),
`20260706180000_zonas_este_retiro` (v47 — **aplicada**, refactor de la zona este: retiro $6 / puerta $9 / asesor),
`20260706190000_store_facts_zonas` (v47 — **aplicada**, genérico de envío honesto: Tocumen, "mismo día"),
`20260707120000_pedidos` (v48 — **APLICADA 07-jul** (validada antes en local), tabla `pedidos` + RPC `estado_pedido`,
puente de conciencia de pedidos del bot),
`20260721170000_resolver_tarifa_v2` + `20260721171000_sectores_corredores` (back-port al repo del cambio manual
de prod 21-jul: RPC `resolver_tarifa` v2 [frontera de palabra] + los 8 sectores/corredores 420-427; **YA en prod**
—estas migraciones son para fidelidad del repo, no hace falta re-aplicarlas—; **validadas end-to-end en Postgres 16
local**: cadena completa corre limpia, 427 sectores, resolver reproduce prod en 7 casos clave).

**Data layer de envíos (v47 — fuente única, editable en Supabase):**
- **zonas_entrega** — `zona` (PK), `tarifa_base_usd` (nullable), `metodo` (`propia`/`servientrega`/
  `retiro_agente_verde`/`asesor` — el ENRUTADOR: propia→motorizado/Shipday, servientrega→a domicilio,
  retiro→agente verde, asesor→humano), `plazo`, `puntos_retiro`. 8 zonas (Z1 $6 · Z2/Z3/Z6 $7 propia · Z4a
  retiro $6 · Z4b puerta $9 · Z4c asesor · Z5 $9).
- **sectores_entrega** — `corregimiento`+`barrio`+`alias`→`zona`, con `validacion` (Alta/Media) y
  `barrio_norm`/`alias_norm` (match sin acentos). **427 filas** (21-jul: +8, ids 420-427, cierran Tumba Muerto,
  Paseo del Norte, San Miguelito, Vía Tocumen, Vía España). **Convención CORREDORES** (avenidas que cruzan
  varias zonas: Domingo Díaz en 5, Transístmica en 3 con $6/$7/$9): se cargan como VARIAS filas —una por zona—
  con el mismo `barrio_norm` → el resolver devuelve `ambiguo` y el bot pregunta el tramo. Al agregar nombres:
  frase completa, nunca fragmento (`boyd roosevelt` sí, `boyd` no — colisiona con Av. Federico Boyd).
- **RPC `resolver_tarifa(p_lugar)`** → jsonb: `ok`/`ambiguo`/`sin_match`. `security definer`, solo `service_role`.
  **v2 en vivo (21-jul; v1 = `resolver_tarifa_v1_backup`; el bot la llama por nombre → sin redeploy):** ranking
  con **frontera de palabra** (mató los falsos positivos por subcadena: `san miguel` ⊄ `san miguelito`, "La Boca"
  ⊄ "Bocas del Toro") + 3 niveles con desempate por longitud (exacto 300 / palabras completas 200 / consulta
  contenida 100) + alias por coma + split de camelCase. **Contrato: campo NUEVO `match`** (array, diagnóstico de
  contra qué matcheó) — additivo, `frasearTarifa` lo ignora; el `opciones[]` de `ambiguo` sigue con
  `corregimiento`/`metodo`/`tarifa_usd` (verificado, no rompe el fraseo). Impacto: 2.202 `ok` (antes 1.939),
  67 `ambiguo` (antes 216). Lo llaman el bot (tool tarifa_entrega) y —futuro— el Carrier Service de Shopify.
  Arquitectura: Supabase = verdad de la LÓGICA; Shopify/Shipday/Servientrega derivan; nunca se replica a 3 lados.

## Flujo del webhook (resumen de index.ts)
1. **GET** = healthcheck (status/version/mode/model/live_targets).
2. **POST**: valida `?key=` (guard, porque `verify_jwt=false`) → parse JSON.
3. Si `eventType` incluye `newcontact` (evento WATI `newContactMessageReceived`,
   sin texto): marca `confirmed_new=true` + `first_contact_at`, loggea y retorna.
4. **`owner=true` (mensaje del negocio):** si coincide con un envío propio reciente del
   bot (<5 min, mismo texto) → se ignora (**anti-eco**, v13); si es un asesor humano real
   → se guarda en el hilo (`model='human-agent'`), se pone la conversación en
   `status='handoff'` (**v15**: el bot no la retoma solo) y se registra `mensaje_humano`.
   Retorna.
5. Filtra: skip si falta `waId`. **v19:** una imagen de un cliente (`type:image`,
   `owner=false`) SÍ pasa (visión); el resto de no-texto (documento/audio/imagen del
   negocio) se registra (`evento_sin_texto.payload`, diagnóstico v18.1) y se salta.
   `upsert_conversation` → inserta msg de usuario (el caption o `[imagen]`; dedup por
   `wati_message_id`, síncrono).
6. **Ciclo de vida del handoff (v31):** si `status=handoff`, el bot ya NO se calla sin más. Lee el
   tiempo desde el último mensaje del asesor (`model='human-agent'`): **>24 h** (y el mensaje NO es
   INTERRUPT) → **cold-return** (`status→'bot'`, cae al flujo normal y retoma todo); **≥15 min** +
   pregunta básica (`BASIC_INFO_RE`) + no INTERRUPT + bajo el tope → **asistencia** (responde SOLO esa
   info vía `info_tienda` en una tarea aparte, sigue en handoff); si no, **skip** (como v30). Si nunca
   escribió un humano (handoff por keyword) → skip (v30). Luego: si `turns_today>40` → skip.
   **Anti-interrupción 2:** si el texto matchea `INTERRUPT_RE` (RUC/cédula/razón social/pago/comprobante/
   mensajero…) → ABSTENERSE (no llama al LLM). Si matchea `HANDOFF_RE` (humano|asesor|reclamo|…) →
   handoff. (La vieja regla de "humano hace <45 min" vía job_log se RETIRÓ en v15.)
7. **(v14) Trabajo lento en SEGUNDO PLANO** (`EdgeRuntime.waitUntil`): el webhook ya
   respondió 200 a WATI (evita su timeout/`Err`). En background: trae historial (últimos
   10 user/assistant; los de asesor van etiquetados `[Asesor del equipo]:`) →
   `responderLLM` (Sonnet + loop de tool use, máx 4 iter). **Forzado de tool (v12):** si
   el texto matchea `NEEDS_TOOL_RE` (catálogo/tienda/reparación) se fuerza
   `tool_choice:"any"` en la 1ª iteración → grounding garantizado. **(v22)** Fuera de horario
   (Lun-Vie 9-5 Panamá) se inyecta un CONTEXTO HORARIO para que el bot aclare cuándo responde un asesor.
8. **(v16)** Antes de enviar, `limpiarWhatsApp` convierte links markdown `[txt](url)` →
   URL pelada y `**` → `*` (WhatsApp los muestra literales). **(v20) Re-chequeos antes de
   enviar:** si llegó un mensaje de cliente más nuevo → descarta (`descartado_superado`); si
   pasó a `handoff` durante el LLM → no envía (`descartado_handoff_tardio`). **(v21)** la respuesta
   se INSERTA antes de enviarse por WATI (para que el eco no dispare un handoff falso), con `mode`
   shadow|live. Envía por WATI **solo si `liveAllowed(waId)`** (MODE=live Y el número en el
   allowlist/`all`); si no, queda en sombra. **(v23)** si el LLM falla y no se alcanzó a responder
   → respuesta de respaldo en vez de silencio (`respuesta_respaldo`, `model='fallback'`).

## System prompt (íntegro — es el corazón del comportamiento)
Reglas clave (texto completo en `index.ts`, const `SYSTEM_PROMPT`):
- **MISIÓN (v10):** apoyar al equipo humano; responder con certeza lo que se pueda y
  callar/derivar ante la duda o si puede comprometer a la empresa. Mejor no responder
  que responder mal.
- **ESTILO:** mensajes cortos (1-3 oraciones), español de Panamá amable y profesional,
  **trato de USTED (v41 — sin voseo: nada de "vos/tenés/seguí")**, **negrita con UN
  solo asterisco** `*así*` (NUNCA `**` — en WhatsApp se ve literal), sin Markdown, URLs
  peladas (NUNCA `[texto](url)`).
- **REGLA DE ORO (v11/v12):** precio/stock/promos SOLO vía `buscar_producto` EN EL
  MISMO TURNO; nunca inventar ni nombrar modelos sin haber buscado. Reforzada en
  código con forzado de tool (`NEEDS_TOOL_RE` → `tool_choice:"any"`).
- **BÚSQUEDA (v10):** términos concisos (marca+modelo; el modelo es la señal más fuerte);
  sinónimos/línea (Pixma↔Canon…); reformular si no encuentra; preguntas de categoría con
  1-2 ejemplos; NO afirmar compatibilidad sin evidencia del catálogo.
- **MODELO EXACTO (v17):** usar el TÍTULO tal cual lo devuelve `buscar_producto`; si el
  modelo pedido NO aparece en el título, decirlo y ofrecerlo como alternativa — NUNCA
  poner el modelo pedido junto al precio/link de otro producto (corrige el caso del
  monitor 322pv respondido con el link de otro modelo).
- **SOPORTE/REPARACIONES (v17):** QSP NO repara ni da soporte técnico; ante "reparar /
  no enciende / no imprime" usar `info_tienda` y sugerir la empresa de la marca que
  figure ahí; nunca inventar teléfonos/empresas; si no hay dato, derivar.
- **IMÁGENES (v19):** si llega una foto, mirarla: si es un PRODUCTO → identificar
  marca/modelo y buscar con `buscar_producto` (precio SOLO de la tool, nunca leído de la
  imagen); si es un COMPROBANTE/dato fiscal → abstenerse; si no se entiende → derivar.
- **PRECIO + ITBMS (v21):** los precios son SIN ITBMS; mostrar precio + ITBMS (7%) + total con los
  valores que devuelve la tool (`precio_usd`/`itbms_7pct`/`total_con_itbms`), NUNCA calcular de memoria.
- **STOCK (v21):** usar el campo `stock` de la tool tal cual (">N unidades", o "un asesor verifica el
  inventario físico" si ≤3); NUNCA inventar una cantidad.
- **HORARIO (v22):** fuera de Lun-Vie 9-5 (Panamá) ayudar igual con lo automático pero aclarar cuándo
  responde un asesor; no prometer humano inmediato (se inyecta como CONTEXTO HORARIO).
- **CONTACTO NUEVO vs CONOCIDO:** bienvenida+presentación una sola vez al nuevo;
  al conocido ir al grano.
- **REGLA ANTI-INTERRUPCIÓN:** si un humano está atendiendo (datos de trámite,
  pago en curso, comprobante, etc.) → ABSTENERSE y derivar. Ante la duda, NO
  interrumpir. Acks sueltos ("ok","gracias") no requieren respuesta.
- **LOGÍSTICA/PAGOS (v11):** vía tool `info_tienda` (single source = `store_facts`);
  no inventar montos/horarios ni compartir números de cuenta; si falta el dato, derivar.
- **VENTA CONSULTIVA (v24):** ante una recomendación, hace 1-2 preguntas de intake (uso, volumen,
  color/WiFi, presupuesto), se adapta al tipo de cliente y recomienda por necesidad — pero TODO
  modelo/precio sale de `buscar_producto` (regla de oro intacta); B2B/cotización formal → deriva.
- **ORIGINALES / NO INVENTAR OPCIONES NI SPECS (v42):** QSP maneja originales; el bot NUNCA ofrece ni
  insinúa un genérico/compatible/sustituto que `buscar_producto` no devolvió (la regla de oro aplica a
  TIPOS/OPCIONES, no solo a modelos), y NO inventa specs que la tool no trae (rendimiento, velocidad…). Se
  endureció tras auditar Sonnet 5 (su tendencia consultiva amplificaba ambos). + anti-interrupción ante
  intención de pagar/transferir/coordinar entrega (no comprometerse con "pague hoy/le llega mañana").
- **BUSCAR ANTES DE NEGAR (v25):** NUNCA decir "no lo tenemos" de memoria; QSP vende más que impresión
  (monitores, escáneres, UPS, accesorios…). `NEEDS_TOOL_RE` ampliado + regla → siempre busca antes de negar.
- **CAPTURA DE DATOS (v25/v27, pasiva):** ante intención de cotizar/comprar y si no los tenemos, pide
  con naturalidad correo + nombre/apellido (y empresa si aplica) y los guarda con `guardar_lead`. No
  insiste, respeta el "no", no repregunta lo que ya tenemos. NUNCA pide RUC/cédula/factura (→ asesor).
- **CANAL (v26):** atiende POR WhatsApp → no manda al cliente a "escribir por WhatsApp" ni da el
  número de la tienda; al derivar, "un asesor te responde por aquí".
- **MODO ASISTENCIA (v31, ampliado en v50; se ANEXA al prompt vía `ASSIST_SUFFIX`):** cuando un asesor tiene
  el chat pero lleva ≥15 min sin responder y el cliente vuelve a preguntar, el bot adelanta una respuesta
  ÚTIL grounded, breve y deferente ("un asesor sigue con su caso"), SIN retomar la venta. **v50:** ya no se
  limita a info básica — puede dar **precio/ITBMS/stock/link** (`buscar_producto`), datos de tienda
  (`info_tienda`), puntos del interior (`sucursales_interior`) y **estado de un pedido** (`estado_pedido`);
  todo desde una tool, nunca de memoria. SIGUE prohibido: cerrar/confirmar/coordinar venta, pago, pedido o
  entrega; pedir/guardar datos del cliente; tocar RUC/factura; cotizar el envío de un sector concreto
  (`tarifa_entrega` NO está disponible aquí → el costo cae a `info_tienda` genérico); y contradecir/renegociar
  lo que el asesor venía manejando. Tools disponibles en este modo: `buscar_producto`, `info_tienda`,
  `sucursales_interior`, `estado_pedido` (NO `guardar_lead` ni `tarifa_entrega`). `INTERRUPT_RE` bloquea antes.
- **HANDOFF** y **LÍMITES** (no legal/médico, nada fuera de la tienda).

## Tools
- **`buscar_producto(consulta)`** — `GET ${STORE}/search/suggest.json?q=...`
  (`STORE=https://www.quickservicepanama.com`). **v21:** devuelve `{titulo, precio_usd,
  itbms_7pct, total_con_itbms, stock, marca, tipo, url}` (máx 5) — el **ITBMS (7%) se calcula en
  código** (el precio de Shopify es sin impuesto) y el **`stock`** se resuelve con **Shopify Admin
  GraphQL `totalInventory`** (>3 → "X unidades"; ≤3 → "un asesor verifica el inventario físico";
  sin token/falla → "un asesor confirma"). v10: si la consulta libre no encuentra, reintenta por
  número/código de modelo (G2170, 954…). **v18/v33:** cada código de modelo se prueba CON y SIN guion
  (`TN830XL` ↔ `TN-830XL`, `PT-H110` ↔ `PTH110`); `modelosEn` ahora capta también códigos que empiezan con
  dígito (140XL, 3253ci) y multi-segmento; intentos deduplicados. **v34:** la búsqueda incluye `tag` en
  `resources[options][fields]` → lee los **tags de compatibilidad** (impresora→consumible: "3253ci" →
  TK-8337). El prompt maneja sinónimos/línea, preguntas de categoría y **no inventa la marca** si no se la
  dieron (v33).
- **`info_tienda(tema?)`** (Fase 1.5, desplegada) — lee `store_facts` y devuelve TODOS
  los pares `key→value` con valor (omite vacíos); si no hay datos, el bot deriva a un asesor.
- **`guardar_lead(email?, nombre?, apellido?, empresa?)`** (v25/v27, desplegada) — captura de lead
  PASIVA: escribe los atributos del cliente en WATI vía `updateContactAttributes` (reusa `email`,
  `nombre`, `apellido`, `empresa`, que ya existen en WATI). Valida el formato del email; el número se
  toma del contexto (no del modelo); NO acepta RUC/datos fiscales (anti-interrupción). El bot lee los
  atributos existentes del payload de WATI para no repreguntar. Telemetría: `job_log` `lead_capturado`.
  El email enriquece el CDP y ayuda a los vendedores a cotizar más rápido.
- **`sucursales_interior(lugar?)`** (v43, lista para desplegar) — puntos de recogida del INTERIOR (red
  Servientrega, **45 sucursales** con provincia/nombre/teléfono/horario, del listado oficial
  `web/envios-interior-sucursal.html`). Match por substring sin acentos contra provincia/nombre; el modelo
  enruta la geografía (David→Chiriquí) y los datos salen de la lista (NO inventa). Sin `lugar` → resumen por
  provincia + URL. Está en código (estática); también disponible en MODO ASISTENCIA. Cierra el "adivinar
  sucursal" que se vio en la auditoría. **v47:** su descripción aclara que es SOLO interior/provincias (para
  un sector de la CIUDAD usa `tarifa_entrega`).
- **`tarifa_entrega(lugar)`** (v47, lista para desplegar) — costo y MÉTODO de envío a un SECTOR de la Ciudad de
  Panamá / San Miguelito. Llama al RPC `resolver_tarifa` (data layer de envíos) y **frasea en código**
  (`frasearTarifa`, pura) según el método: propia mismo día ($6-7), RETIRO en agente verde ($6, este SIN
  domicilio), puerta a puerta Servientrega ($9), o "un asesor coordina". Devuelve `respuesta_sugerida` +
  campos; el prompt manda RELAYARLA sin cambiar método/precio y NUNCA ofrecer domicilio donde solo hay retiro.
  `ambiguo`→pide corregimiento; `sin_match`→interior (`sucursales_interior`)/`info_tienda`/deriva. **NO va en
  MODO ASISTENCIA** (cotizar compromete un pedido; ahí el humano lleva la venta — decisión de la revisión
  adversarial). El punto de retiro de un sector de la ciudad sale de AQUÍ, no de `sucursales_interior`.
- **Visión (v19, desplegada — no es una tool, es entrada multimodal):** las imágenes del
  cliente (`type:image`, `owner=false`) se descargan de WATI (`descargarMediaWati`: campo
  `data` + `Authorization: Bearer WATI_API_TOKEN`, base64, límite ~3.5 MB) y se adjuntan al
  último mensaje de usuario para Claude vision. Si la descarga falla → el bot pide el modelo
  o deriva. Telemetría: `job_log` `imagen_procesada` / `imagen_no_descargada`.

## Variables de entorno / secretos (en Supabase Edge Function secrets — NO en el repo)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WATI_API_TOKEN`,
`WATI_API_BASE`, `COPILOT_MODE` (shadow|live, default **shadow**),
`COPILOT_LIVE_ALLOWLIST` (`wa_id` permitidos en live; vacío = nadie, `all`/`*` = todos),
`COPILOT_MODEL` (default del código `claude-haiku-4-5`; en producción `claude-sonnet-4-6`),
`COPILOT_WEBHOOK_KEY` (guard del `?key=`; ✅ **endurecida el 2026-07-02**: secreto aleatorio creado + URL
actualizada en WATI, verificado con `webhook_key_es_default:false` y tráfico real fluyendo; el default del
código `cw-qsp-9f2e7b3a1c5d4806` quedó MUERTO — retirarlo del código en una versión futura para fail-closed),
`COPILOT_DIAG_KEY` (v45, opcional — key aparte para `?selftest=`; si falta, el selftest acepta la WEBHOOK_KEY),
**`SHOPIFY_ADMIN_TOKEN`** + **`SHOPIFY_ADMIN_API_BASE`**
(v21 — inventario real vía Admin GraphQL; app de Shopify de **solo lectura** `read_products`+`read_inventory`;
base `https://quick-service-supplies.myshopify.com/admin/api/2025-10`; si faltan, el `stock` cae a
"un asesor confirma"). **`RESOLVE_SECRET`** (v28/v30 — guard del endpoint GET `?ref_code=`; el CDP lo lee
por `Authorization: Bearer`; si falta, el endpoint da 403). **`COPILOT_HANDOFF_ASSIST_MIN`** (v31, default
**15**) y **`COPILOT_HANDOFF_COLD_HOURS`** (v31, default **24**) — umbrales del ciclo de vida del handoff.
**`COPILOT_DEBOUNCE_MS`** (v49, default **10000**, 0=off, tope 60000) — espera de ráfaga antes de responder
(el bot junta 2-3 líneas y/o imágenes del cliente como UN contexto; tuneable sin redesplegar).
El healthcheck expone `inventario_configurado`, `resolve_configured`, `handoff_assist_min`, `handoff_cold_hours`,
`debounce_ms`.

> ⚠️ **OJO — no cruzar `COPILOT_MODE` con `COPILOT_MODEL`** (pasó 3 veces): el ID del
> modelo (`claude-…`) va SIEMPRE en `COPILOT_MODE**L**` (la L = modeLo). `COPILOT_MODE`
> es solo `live` o `shadow`. Si se cruzan, `MODE` deja de ser `live` y el bot queda
> mudo (`live_targets:0`). **(v20)** Ya no es catastrófico: un `COPILOT_MODE` inválido cae a
> `shadow` (no rompe los inserts como antes — eran 23 errores/día) y el healthcheck muestra
> `mode_raw` con el valor crudo para detectarlo. Verificar siempre el healthcheck tras tocar secretos.

## Guardrails (NO romper)
- **MODO SOMBRA es el default del código.** Hoy el secreto está en `live`+`all`, pero si
  faltara `COPILOT_MODE` el código cae a sombra (no envía). Cualquier cambio que pueda
  alterar a quién/si se le manda = avisar antes.
- **Anti-interrupción es sagrada:** mejor no contestar que cortar una venta humana.
  (1) **v15:** owner=true → `status='handoff'`, el bot no retoma solo. (2) Guardrail
  PRE-LLM `INTERRUPT_RE` que ABSTIENE ante trámites/pagos/datos fiscales. (3) **v20:**
  re-chequeo de `status='handoff'` JUSTO antes de enviar (anti-carrera: si un asesor entró
  durante los ~8s del LLM, el bot no la pisa). El bot NUNCA captura ni repite RUC/datos de
  factura/pago.
- **Ciclo de vida del handoff dentro de los límites (v31):** el bot puede asistir/retomar conversaciones
  en handoff, pero SIN romper la anti-interrupción. `INTERRUPT_RE` (pago/fiscal/trámite) bloquea TANTO la
  asistencia COMO el cold-return (un mensaje de trámite en handoff sigue silencioso). La asistencia solo
  responde info de tienda (única tool `info_tienda`), nunca retoma la venta ni saca de handoff. El reloj
  mide desde el último mensaje del asesor (`model='human-agent'`); si el asesor vuelve a escribir,
  `owner=true` regresa a handoff y el anti-carrera lo protege. La respuesta de asistencia se marca
  `model='assist-handoff'` para que el anti-eco la reconozca (no resetea el reloj, no dispara handoff falso).
- **Anti-duplicado (v20):** en ráfaga, solo el ÚLTIMO mensaje del cliente recibe respuesta
  (chequeo pre/post LLM de "¿hay uno más nuevo?") → no más respuestas dobles/triples.
- **MODE a prueba de typos (v20):** `COPILOT_MODE` inválido → `shadow` (no rompe los inserts);
  `mode_raw` en el healthcheck delata el cruce.
- **Resiliencia (v23):** ante fallo de la API (429/500/529), `maxRetries=3` + **respuesta de
  respaldo** (nunca dejar al cliente en silencio); respeta live/anti-duplicado/handoff.
- **Anti-eco (v13):** un `owner=true` que sea el eco de un envío propio del bot NO se
  trata como humano (evita que el bot se auto-abstenga / se ponga en handoff en live).
- **Captura de lead dentro de los límites (v25/v27):** `guardar_lead` solo guarda datos livianos
  (email/nombre/apellido/empresa); NUNCA RUC/factura (la tool ni los acepta como parámetros). Es
  pasiva (no insiste). **Canal (v26):** el bot no redirige al cliente a WhatsApp (ya está ahí).
- **Auto-expose OFF** en este proyecto → toda tabla nueva necesita `GRANT` manual a
  `service_role` (si no, la función da `permission denied`).
- **RLS on sin policies** = solo `service_role`. El `?key=` es obligatorio.
- Dedup por `wati_message_id`; tope `MAX_TURNS_DIA=40`.
- Deploy con `verify_jwt=false` (es un webhook público guardado por `?key=`).

## Despliegue
**Vía recomendada (CLI, byte-exacto desde disco):** desde la raíz del repo, en la máquina del usuario,
`git pull` + **`.\deploy.ps1`** (Windows) — corre `npx supabase functions deploy copilot-webhook
--project-ref jbigmlcalcwiphqeudxd --no-verify-jwt` y verifica el healthcheck. Requiere `npx supabase
login` una sola vez (access token de https://supabase.com/dashboard/account/tokens). **Por qué CLI:** sube
el archivo TAL CUAL; ni el MCP ni el dashboard hacen eso (ambos pasan el contenido por un agente/editor que
puede truncarlo — pasó: un deploy por MCP con contenido inline truncado tumbó prod; el fix fue el CLI).
Alternativas: `mcp__Supabase__deploy_edge_function(project_id=jbigmlcalcwiphqeudxd, …, verify_jwt:false)`
desde el Claude LOCAL del usuario (el MCP de Supabase está bloqueado por la policy de red en la sesión
remota — `mcp.supabase.com` da 403), o el dashboard (raw de GitHub → editor → Verify JWT OFF → deploy).
⚠️ **`--no-verify-jwt`/Verify JWT OFF es obligatorio** (webhook público guardado por `?key=`; si queda en
true, WATI recibe 401). El SQL lo corre el usuario en el SQL Editor.
El webhook de WATI apunta a:
`https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>`.
Eventos WATI suscritos (necesarios): **Message Received**, **Session Message Sent**
(owner=true para detectar al asesor) y **New Contact Message Received**.

## Roadmap (próximas fases)
1. **Fase 1.5 — `info_tienda`: ✅ desplegada y `store_facts` aplicada** (17 datos reales).
   Opción futura: re-apuntar la fuente a un metaobjeto/páginas de Shopify para unificar
   con el "single source of truth" del proyecto SEO (qsp-cdp-docs).
2. **v19 — Visión / imágenes: ✅ desplegada y validada (2026-06-18).** El bot maneja
   `type:image` de clientes: descarga de WATI (campo `data`), Claude vision clasifica
   (producto → buscar en catálogo; pago/dato fiscal → abstenerse), nunca cotiza precio
   desde la imagen. Pendiente menor: extender a `type:document` (PDF) si hace falta; hoy
   los documentos se registran y se saltan.
3. **Compatibilidad impresora→consumible: ✅ resuelto el lado búsqueda en v34.** La compatibilidad ya
   vive en los **tags** de Shopify ("Canon PIXMA MG2110", "Kyocera TASKalfa 3253ci"…); v34 hizo que
   `suggest.json` los lea (`fields=…,tag`) → el bot encuentra el consumible por el modelo de la impresora.
   Pendiente opcional: sumar `body` (compatibilidad escrita solo en la descripción) y/o enriquecer
   `products/{handle}.json` para specs. NO se hace réplica completa de Shopify en Supabase (riesgo de datos
   viejos para un bot "no inventar"; precio/stock se mantienen en vivo).
4. **Debounce / anti-repetición: ✅ hecho en v20.** En ráfaga, solo el último mensaje del
   cliente contesta (chequeo pre/post LLM) → mata las respuestas dobles/triples. Sin timers:
   si llega uno más nuevo, el viejo se descarta antes de enviar (`descartado_superado`).
5. **Página web "Envíos al interior y recogida en sucursal"** (`web/envios-interior-sucursal.html`,
   45 sucursales) → ✅ **publicada** en Shopify (`/pages/envios-al-interior`). ✅ **2026-06-24:** URL
   puesta en `store_facts.sucursales_interior` y `store_facts.soporte_reparaciones` cargada (contactos
   de servicio técnico por marca, verificados). Ambos pendientes de este punto: hechos.
6. **Recall de productos:** ante combo agotado, ofrecer variantes/tintas individuales en
   stock en vez de derivar.
7. **Reseñas por WhatsApp** (generar volumen; tie-in con Klaviyo/CDP).
8. Omnichannel / cruce con identidad del CDP por `wa_id`. (Orquestador multi-modelo:
   evaluado y descartado por ahora — prematuro; un router por reglas solo si hace falta.)
9. **Folletos/fichas de equipos** (solo equipos, NO consumibles): specs/compatibilidad como
   descripción/metafield en Shopify (ya hay token Admin) → tool `ficha_producto`. **Medir primero**
   la demanda (cuántas veces el bot deriva por specs/compatibilidad) antes de construir. (Discutido
   2026-06-24: el usuario tiene PDFs de equipos; EN PAUSA hasta decidir descripción vs metafield y
   cómo cargar el contenido.)
10. **Captura de lead** (correo/nombre/apellido/empresa) en atributos de WATI → ✅ **HECHA en v25/v27**
    (pasiva, dentro del agente actual, sin pedir datos fiscales; `guardar_lead`). Pendiente: el puente
    **WATI→CDP** (evaluando **Make**) para que el dato capturado enriquezca el CDP automáticamente.
11. **Feriados** en la lógica de horario: ✅ **HECHO en v37** (fijos por mes/día + Carnaval/Viernes Santo
    calculados desde la Pascua con Meeus/Jones/Butcher → correcto cualquier año, sin mantenimiento).
12. **Puente WhatsApp→web por `ref_code` (v28–v30): ✅ mitad del copiloto lista** (emite + guarda +
    expone). Pendiente del lado **CDP**: el resolver inverso (leer el endpoint → enriquecer `contacts`) +
    entregar `RESOLVE_SECRET` por canal seguro. Opcional copiloto: purga `pg_cron` de `ref_codes` ≥90 d.
    Contrato: `docs/handoff-cdp-ref-code-bridge.md`.
13. **Ciclo de vida del handoff (v31): ✅ hecho** (asistencia ≥15 min + cold-return >24 h, reactivo).
    Pendiente/futuro: (a) medir en prod (cuántas asistencias/cold-returns, falsos positivos) y calibrar
    umbrales; (b) extender cold-return a handoffs por keyword (hoy solo cuando hubo un asesor real);
    (c) afinar `BASIC_INFO_RE` según lo que pregunten de verdad.
14. **Conciencia de pedidos (v48): ✅ LECTOR + ESCRITORES + unificación hechos.** (a) ✅ lector: tool
    `estado_pedido` + RPC/tabla `pedidos`; (b) ✅ **Opción A: unido el puente Tookan→Shipday al repo** (git
    merge de la rama real, con sus pruebas Node) y **las 3 funciones de despacho cablean `upsertPedido()`** a
    `pedidos` por (fuente, pedido_ref). Pendiente: **APLICAR la migración** `20260707120000_pedidos.sql` +
    (re)desplegar las funciones de despacho ya cableadas y `copilot-webhook`; confirmar convergencia
    (`orderNumber` de Shipday = número de Shopify). Opcional a futuro: (c) derivar el `metodo` por sector desde
    `resolver_tarifa` (fuente única) si Shipday empieza a rutear servientrega/retiro; (d) purga de pedidos
    entregados/cancelados viejos (como `ref_codes`); (e) la libreta `contacts` del puente puede cruzarse con el
    CDP por `wa_id` como el resto.
15. **Aviso de reingreso (back-in-stock) NATIVO de WhatsApp:** hoy (v54) hay solo la versión LIVIANA —
    regla de prompt que, ante `stock:"sin stock…"`, comparte el link y manda al cliente a activar el botón
    *"Avísame cuando esté disponible"* de la página (reusa el back-in-stock de **Klaviyo** que ya se paga; el
    cliente sale de WhatsApp a la web). **Pendiente (acordado 17-jul, "la próxima"):** que el BOT capture el
    "avísame cuando llegue" dentro del chat y le mande un **WhatsApp** apenas reingrese. Piezas: (a) tabla de
    suscripciones (`wa_id` + producto/handle/variante, con dedup e idempotencia estilo `reengaged_at`); (b)
    Edge Function con **webhook de Shopify** que detecte la transición a *in-stock* (`inventory_level`/variante
    → de 0 a >0); (c) el envío de aviso. **El 80% ya existe:** el reingreso ocurre días después → el cliente
    está fuera de la ventana de 24h → hay que usar **plantilla HSM** = exactamente `sendWatiTemplateMessage`
    (el del cron de re-enganche, con el fix del endpoint `?whatsappNumber=` del 17-jul) + el patrón de webhook
    del puente Shipday. **Falta decidir:** plantilla nueva aprobada por Meta (ej. "¡Buenas noticias! El
    [producto] ya está disponible") y el disparador exacto en Shopify (evitar spam si el stock oscila 0↔1).
16. **Carrito WATI → checkout (fase 2 del MCP) + migración UCP — EN PAUSA (decisión 22-jul: "luego lo
    vemos").** El plan acordado: tool `armar_carrito` sobre el **UCP Cart MCP** (`update_cart`/`get_cart` →
    URL de checkout con todo adentro; v60 ya captura `variant_id` para esto), con guardrails (el bot arma y
    deja el LINK listo; nunca paga ni coordina pago). Sinergia: requiere el **perfil de agente hosteado** en
    `/api/ucp/mcp` = la MISMA migración de endpoint que el catálogo necesita **antes del ~31-ago** (el legacy
    `/api/mcp` que usa v60 muere; la migración del endpoint puede hacerse sola sin el carrito si se acerca la
    fecha). Contexto contable (decisión de la misma conversación): la migración **Sage 50 → QBO Advanced** va
    a fin de año; se DESCARTÓ escribir cotizaciones en Sage 50 desde el bot (ODBC es solo-lectura, escribir
    vía ODBC arriesga corromper la contabilidad, requeriría un puente local a la PC, y sería descartable en
    ~5 meses). El ODBC read-only de Sage queda para análisis LOCALES del usuario; el match **SKU Shopify ↔
    items Sage** validado es la llave para la futura integración. **Post-migración (≈enero):** cotización
    formal vía **QBO Estimates API** (nube, OAuth) — el bot arma el borrador (items por SKU + lead +
    `calcular_cotizacion`) y el ASESOR revisa/envía (datos fiscales siguen en manos humanas).

## Cómo leer el estado real (debugging)
- Código en vivo: `get_edge_function` o healthcheck GET. Esquema: `list_tables`.
- **Inventario (v44):** si el stock no aparece, `GET …/copilot-webhook?key=<COPILOT_WEBHOOK_KEY>&selftest=inventario`
  (opcional `&pid=<product_id>`) → corre la consulta Admin `totalInventory` DESDE ADENTRO y devuelve
  `diagnostico`: `ok_inventario_visible` (funciona, muestra `nodes[].totalInventory`), `token_invalido_o_sin_permiso`
  (401/403 → token mal), `graphql_error_probable_falta_scope_read_inventory` (HTTP 200 + `graphql_errors` →
  falta el scope), `faltan_secretos`/`http_404`/… — NUNCA expone el token (solo su `token_len`).
- Fugas de tool-call (v44): `select * from public.job_log where action='fuga_tool_texto' order by created_at desc;`
  (el `detail.muestra` trae el inicio del texto que el modelo escribió como si fuera una tool-call).
- Calidad/telemetría: `select mode, model, tokens_in, tokens_out, latency_ms from
  public.messages order by created_at desc` y `select * from public.job_log order
  by created_at desc`.
- Ahorro del prompt caching (v38): `select count(*) turnos, round(avg(tokens_in)) avg_in,
  round(avg(cache_read_input_tokens)) avg_cread, round(avg(cache_creation_input_tokens)) avg_cwrite,
  round(100.0*sum(cache_read_input_tokens)/nullif(sum(tokens_in+coalesce(cache_read_input_tokens,0)+coalesce(cache_creation_input_tokens,0)),0),1) pct_leido_de_cache
  from public.messages where model='claude-sonnet-4-6' and created_at >= now() - interval '1 day';`
  El **$ de input** ≈ `(tokens_in*1 + cache_read*0.1 + cache_creation*1.25)/1e6 * $3`.
- Devolver una conversación del humano al bot: `update public.conversations set
  status='bot' where wa_id='<numero>';` (v31: el bot ya lo hace solo tras 24 h sin asesor).
- Ciclo de vida del handoff (v31): `select * from public.job_log where action in
  ('handoff_cold_return','asistencia_handoff') order by created_at desc;` (el `detail` trae
  `horas_sin_humano` / `mins_sin_humano` / `enviado` / `motivo`).
- Análisis de sombra (categorías de mensajes, prompt v2): doc
  `2026-06-13-copilot-analisis-sombra-prompt-v2.md` en qsp-cdp-docs.
