# Blueprint de agentes de comercio (Anthropic + Shopify, 02-sep-2026): qué nos sirve

> Isaac pidió revisar dos anuncios en X (Shopify `2095246380251967997` y ClaudeDevs
> `2095233746366808420`) para ver si hay ideas o herramientas para el copiloto. X está bloqueado desde
> la sesión, así que se fue a las fuentes: el blog de Anthropic, los dos repos clonados y leídos, y la
> nota técnica. Fecha de los anuncios: 2 de septiembre de 2026.

## Qué son

**ClaudeDevs → `github.com/anthropics/commerce-agents`** (Apache-2.0, "referencia, no se mantiene").
Un blueprint con dos agentes: *shopping agent* (para el cliente: buscar, comparar, armar carrito, dudas
de pedido y políticas) y *merchant agent* (para el equipo: analítica, inventario, precios, campañas,
**siempre con aprobación humana antes de escribir**). Cinco "skills" por agente en Markdown, un paquete
común (`commerce_common`) con las guardas en código, tres formas de correrlo (Messages API, Agent SDK,
Managed Agents) y un plugin de Claude Code (`commerce-builder`: `/scaffold-commerce-agent`,
`/add-commerce-flow`, `/author-commerce-evals`, `/review-commerce-agent`). Nota técnica:
`claude.com/blog/the-anatomy-of-effective-commerce-agents`.

**Shopify → `github.com/Shopify/claude-for-commerce-examples`.** La implementación de ese blueprint
sobre una tienda Shopify real: el agente de tienda habla con **el mismo endpoint UCP que ya usamos**
(`/api/ucp/mcp`, con el perfil de agente en `meta.ucp-agent.profile`) y el agente de comerciante con la
Admin API, con escrituras en una bitácora que solo un humano aplica.

## Lo que aplica a nosotros, en orden de valor

### 1. 🟢 Carrito → checkout por WhatsApp (roadmap #16, en pausa desde el 22-jul) — **desbloqueado**

La fase 2 se pausó por no saber cómo era el checkout sobre UCP. El código de Shopify lo responde
completo, sobre **el endpoint que ya tenemos conectado desde v62**:

| Paso | Llamada UCP (`tools/call`, con `meta.ucp-agent.profile`) | Nota |
|---|---|---|
| Buscar | `search_catalog` / `get_product` / `lookup_catalog` | ya lo hacemos (v60/v62); `get_product` resuelve la variante |
| Crear carrito | `create_cart {cart: {line_items: [{item: {id: <variant gid>}, quantity}], context}}` | anónimo — **las llamadas de carrito no llevan token de comprador** |
| Modificar | `update_cart {id, cart: {line_items}}` | **reemplaza** el contenido: releer con `get_cart` antes de escribir |
| Checkout | `create_checkout {checkout: {…}}` → devuelve `continue_url` | el checkout existe aunque falte dato del comprador (`isError` + `id`) |
| Pagar | `complete_checkout` | **nunca se llama**: el cliente paga en la página de Shopify |

Encaja con la regla de la casa desde v42: el bot **arma y entrega el link, jamás cobra ni coordina
pago**. `continue_url` es el checkout hospedado de Shopify → el cliente paga en la web, con lo cual
además aplica el envío gratis >$300 que es exclusivo del checkout web (v60.2).

Dos detalles de diseño que hay que copiar tal cual:

- **El link de checkout no pasa por el modelo.** En el blueprint, `checkout_handoff` toma la URL
  después de la llamada y la inserta el código, "never passes through the model". Es la misma lección
  de v120 (el modelo inventó una URL con `ref_code=qsp01`): la URL la pone `reaplicarTracking`-style el
  código, no el LLM.
- **Procedencia de la variante.** El carrito solo acepta IDs que `buscar_producto` devolvió EN ESTA
  sesión (ver punto 2). Ya guardamos `variant_id` desde v60 para esto.

Lo que **no** aplica: *Sign in with Shop* es OAuth en navegador (personaliza `search_catalog` por
comprador) — en WhatsApp no hay navegador; modo invitado y listo. Y `get_order` (Order MCP) solo ve
pedidos hechos por el agente y requiere el scope `read_global_api_orders` — podría complementar
`estado_pedido` para los pedidos que nazcan de un link del bot, no reemplazarlo.

**Costo estimado:** una tool `armar_carrito(items)` + `create_cart`/`update_cart`/`create_checkout` en
`buscarCatalogoMCP`-style + la regla de prompt + locks. 2-3 días. **Decisión previa de Isaac:** la UX
("¿le armo el carrito y le paso el link para que pague en la web?") y si el asesor debe intervenir antes
del link en montos altos.

### 2. 🟢 Procedencia de IDs como regla general (`shopping_agent/gates.py`)

El blueprint mantiene por sesión el conjunto de IDs que el servidor le entregó al modelo
(`state.seen_products`), y **toda escritura o render acepta solo esos IDs**: "an ID that arrived any
other way — hallucinated, pasted by a user, planted in a review — is refused before the backend sees
it". Es exactamente la generalización de lo que hizo v120 con `ref_codes`. Dos cosas a tomar:

- Para la tool de carrito del punto 1: la variante debe estar en lo que `buscar_producto` devolvió en
  la sesión; si no, la tool devuelve un error **accionable** ("resuélvelo primero con buscar_producto")
  en vez de fallar — el mismo patrón de v63.2 (`url_no_corresponde`).
- Su mensaje de error explica por qué: "text search does not match ids, and an empty search reads to
  the model as proof the product does not exist" — vale para nuestra REGLA DE ORO.

### 3. 🟡 Fencing de ENTRADA (`commerce_common/fencing.py`)

Todo texto de terceros que el modelo lee (descripciones de catálogo, mensajes del cliente, texto de
PDF, mensajes del asesor) pasa por un sanitizador antes: quita caracteres invisibles/bidi (portadores
típicos de instrucciones ocultas), controles C0/C1, **marcadores de turno falsos** (`\n\nassistant:`),
etiquetas `<invoke>`/`<function_calls>`/`<system>` (con o sin namespace), y lo envuelve en una cerca
con etiqueta fija. Nosotros tenemos el guard **de salida** (`pareceFuncionEnTexto`, v44) y **nada de
entrada**: `especificaciones`, el texto del folleto (v63), el PDF del cliente (v98) y el propio mensaje
entran crudos. El módulo es ~150 líneas de regex lineales; portarlo a TS es barato y cierra una clase
de inyección que hoy no medimos. Prioridad media: no hay incidente, es endurecimiento.

### 4. 🟡 Memoria del cliente entre visitas (skill `memory-personalization`)

El blueprint extrae hechos al final del turno, **en proceso aparte** (no suma latencia), con reglas
duras: clave ≤64 chars, valor ≤200, tres categorías, **nunca identificadores ni datos de salud/
financieros**, y solo de lo que el cliente dijo (nunca de resultados de tools). Para QSP el hecho que
más vale es uno: **qué impresora tiene el cliente**. Hoy `cortarSesionVieja` (v61.5) tira la sesión
anterior completa, así que un cliente que vuelve al mes con *"tinta para mi impresora"* obliga a
preguntar de nuevo. Tenemos la mitad (`guardar_lead` → atributos WATI); falta el hecho de negocio.
Necesita decisión de datos (dónde vive, retención, cómo se borra) antes de código.

### 5. 🟡 Evaluación por instantáneas ("evaluate snapshots, not conversations")

Su método: 50-100 casos por flujo, tomados de **transcripciones reales y fallas reales**, evaluando el
siguiente turno dado un estado (no simulando clientes); suite completa cada noche y antes de cada
release. Nuestros 735 golden son **candados de código** (que el regex X exista, que el orden Y se
conserve) — no evalúan comportamiento del modelo. Tenemos la materia prima (la tabla `messages`, las
auditorías de contexto) para un banco de ~50 instantáneas reales (el 63XL, el HP 410 cabezal/tóner,
el "oficina 4008", los acks) que se corran contra el modelo antes de cambiar prompt o modelo. El plugin
`/author-commerce-evals` puede servir de arranque. Es proceso, no feature.

### 6. 🔵 Caché en tres segmentos

Ellos: global (system + tools) / **sesión** (perfil, carrito, historial estable) / volátil (hora,
página) **al final**. Reportan 90-99% de acierto. Nosotros (v35): global + volátil; el historial no se
cachea y medimos ~69% de ahorro real. Con un segundo breakpoint tras el historial, un hilo de 40
mensajes en asistencia (v121.1) leería del caché los turnos anteriores. Medible con la telemetría de
v38 antes de decidir. Bajo riesgo, ganancia de costo.

### 7. ⚪ Lo que NO conviene tomar

- **El stack.** Es una app web (FastAPI + Next.js, Python) con componentes de UI como tools. Lo nuestro
  es WhatsApp sobre Deno Edge Functions. Su tesis central —"un modelo en un loop estándar de agente con
  skills, tools y una suite de evals fuerte, sin subagentes"— **es lo que ya tenemos**. Se toman
  patrones, no código.
- **El merchant agent** (Admin API con escrituras en bitácora + aprobación). No es el copiloto de
  WATI; es un asistente interno de catálogo. El patrón de "el bot propone, el humano aplica" es bueno
  y ya lo usamos en pequeño (`captura_hasta`, tickets de promesa). Queda como idea para cuando el
  equipo pida ayuda con tags/compatibilidades/precios — no ahora.
- **`/review-commerce-agent`** sobre nuestro repo: barato de probar como segunda mirada, pero el plugin
  asume su estructura de paquetes; esperar poco.

## Recomendación

1. **Retomar la fase 2 (carrito → checkout)** con el patrón de Shopify. Es la ganancia comercial más
   directa y el bloqueo técnico ya no existe. Requiere una decisión de UX de Isaac antes de empezar.
2. **Memoria de "qué impresora tiene"** — la segunda en valor para QSP; requiere decisión de datos.
3. **Fencing de entrada** — endurecimiento barato, sin decisión previa.
4. **Banco de instantáneas reales** — proceso; se arma con lo que ya está en `messages`.

## Fuentes

- Blog: `claude.com/blog/claude-for-commerce-agents` · Nota técnica:
  `claude.com/blog/the-anatomy-of-effective-commerce-agents`
- Repos leídos: `anthropics/commerce-agents` (`docs/safety.md`, `commerce_common/fencing.py`,
  `commerce_common/grounding.py`, `shopping-agent/core/shopping_agent/gates.py`, skills) y
  `Shopify/claude-for-commerce-examples` (`storefront/api/ucp_client.py`, `shopify_backend.py`,
  `identity.py`, `catalog_warmup.py`, `merchant/api/staging.py`)
- Perfil de agente de referencia que publica Shopify:
  `https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json` (nosotros servimos
  el nuestro en `?ucp_profile=1` desde v62)
