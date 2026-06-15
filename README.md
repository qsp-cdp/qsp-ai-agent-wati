# QSP WhatsApp AI Agent (WATI + Claude)

Agente de IA para WhatsApp construido sobre [`@wati-io/wati-cli`](https://www.npmjs.com/package/@wati-io/wati-cli)
y el LLM Claude (Anthropic). El agente:

1. **Escucha webhooks** de WATI (eventos `message` y `newContactMessageReceived`).
2. **Recupera el historial** de la conversación desde WATI.
3. **Genera una respuesta** con Claude, usando la base de conocimiento de QSP.
4. **Envía la respuesta** de vuelta por WhatsApp a través de WATI.

```
WhatsApp ─▶ WATI ──(webhook)──▶  Express (src/server.js)
                                      │  extrae el mensaje entrante
                                      ▼
                                 Agente (src/agent.js)
                          ┌───────────┼─────────────────┐
                          ▼           ▼                 ▼
              wati conversations   Claude          wati conversations
                  messages      (src/llm.js)          send-text
              (historial)     genera la respuesta   (responde)
                          ▲                                │
                          └──────── @wati-io/wati-cli ─────┘
```

## Requisitos

- **Node.js ≥ 18** (probado con Node 22).
- Una cuenta de **WATI** con token de API.
- Una **clave de API de Anthropic** (Claude).

## Instalación

```bash
npm install
cp .env.example .env
# edita .env con tus credenciales de WATI y Anthropic
```

Variables principales (ver `.env.example` para el detalle):

| Variable | Descripción |
|---|---|
| `WATI_BASE_URL` | URL base de tu instancia WATI (p. ej. `https://live-mt-server.wati.io/<tenant>`) |
| `WATI_AUTH_TOKEN` | Token Bearer de la API de WATI |
| `ANTHROPIC_API_KEY` | Clave de API de Claude |
| `ANTHROPIC_MODEL` | Modelo (por defecto `claude-sonnet-4-6`; usa `claude-opus-4-8` para máxima calidad o `claude-haiku-4-5` para menor costo) |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ADMIN_ACCESS_TOKEN` | Opcional: habilitan el catálogo en tiempo real (precio + stock) vía Shopify |
| `PORT` / `WEBHOOK_PATH` | Puerto y ruta del webhook (por defecto `3000` y `/webhook`) |

> Alternativamente puedes guardar las credenciales de WATI con `npx wati configure init`
> (se almacenan en `~/.watirc`). Las variables de `.env` tienen prioridad.

## Cómo ejecutarlo

```bash
npm start        # producción
npm run dev      # con recarga automática (node --watch)
```

Al arrancar verás un banner con la configuración detectada y el endpoint del webhook.

### Exponer el webhook con una URL pública (ngrok)

WATI necesita una URL pública HTTPS para enviarte los eventos. En otra terminal:

```bash
ngrok http 3000
```

Copia la URL `https://<id>.ngrok.io` que te da ngrok.

### Suscribir el webhook en WATI

```bash
PUBLIC_URL=https://<id>.ngrok.io npm run setup:webhook
```

Esto registra los eventos `message` y `newContactMessageReceived` apuntando a
`https://<id>.ngrok.io/webhook`. Para ver los webhooks ya configurados:

```bash
npm run setup:webhook -- --list
```

### Probar

Envía un mensaje de WhatsApp al número conectado a tu cuenta WATI. Deberías ver en
los logs cómo el agente recupera el historial, genera la respuesta y la envía.

## Estructura del proyecto

```
src/
  index.js        Punto de entrada: carga .env, valida config, arranca el server
  server.js       Servidor Express; recibe webhooks y los despacha al agente
  agent.js        Lógica del agente: historial → prompt → LLM → respuesta
  wati.js         Wrapper de @wati-io/wati-cli (historial, envío, webhooks)
  llm.js          Cliente de Claude y generación de respuestas
  knowledge.js    Carga la base de conocimiento desde knowledge/
  config.js       Configuración centralizada (variables de entorno)
scripts/
  setup-webhook.js  Suscribe/lista el webhook en WATI
knowledge/
  qsp-knowledge-base.md  Conocimiento de QSP (plantilla a completar)
  README.md              Cómo migrar el contenido de qsp-cdp-docs
```

## Catálogo en tiempo real (Shopify)

El agente puede responder **precio y existencias en vivo** consultando Shopify. Se
implementa con *tool-use*: Claude dispone de la herramienta `buscar_productos`
(definida en `src/catalog.js`) y la llama cuando el cliente pregunta por precio,
disponibilidad o si se vende un producto; el código consulta la **Shopify Admin
GraphQL API** y devuelve datos reales (precio, moneda, stock).

- Se activa solo si defines `SHOPIFY_STORE_DOMAIN` y `SHOPIFY_ADMIN_ACCESS_TOKEN`
  (el token Admin necesita permiso `read_products`). Sin ellos, el agente funciona
  igual pero sin precios/stock.
- El agente tiene instrucción de **no inventar** precios: usa la herramienta o lo
  dice y ofrece pasar con una persona.
- Nota de costo: los mensajes que disparan la herramienta hacen 2 llamadas al LLM
  (decidir + responder), por lo que cuestan ~2× respecto a un mensaje simple; el
  prompt caching del prefijo amortigua parte de ese costo.

```
Cliente: "¿Cuánto cuesta el taladro y tienen en stock?"
   → Claude llama buscar_productos("taladro")
       → src/catalog.js consulta Shopify Admin API (precio + inventoryQuantity)
   → Claude responde: "El taladro cuesta B/. 49.99 y tenemos 12 en stock."
```

## Base de conocimiento y migración desde `qsp-cdp-docs`

La "lógica de negocio" que el agente debe preservar (servicios, horarios, precios,
FAQ, políticas, tono de marca) vive en `knowledge/` como archivos Markdown que se
inyectan en el prompt del sistema. Para añadir o actualizar conocimiento, edita esos
archivos y reinicia el agente. Ver [`knowledge/README.md`](knowledge/README.md).

> **Nota sobre la migración automática:** el repositorio fuente
> [`qsp-cdp/qsp-cdp-docs`](https://github.com/qsp-cdp/qsp-cdp-docs) es **privado** y
> no fue accesible desde el entorno de ejecución (el proxy de git lo rechaza —
> *"repository not authorized"* — y vía web devuelve 404; tampoco está dentro del
> alcance del servidor de GitHub de esta sesión). Por eso la base de conocimiento se
> entrega como **plantilla estructurada** lista para rellenar. Para completar la
> migración, concede acceso al repo (o pega su contenido) y vuelca el material en
> `knowledge/` siguiendo `knowledge/README.md`. Toda la arquitectura del agente ya
> está lista y no depende de ese contenido para funcionar.

## ¿Conviene usar el WATI MCP Server?

Pregunta válida: existe [`wati-io/wati-mcp-server`](https://github.com/wati-io/wati-mcp-server).
Conclusión corta: **para este agente, no; el CLI es la opción correcta.** Son
herramientas para problemas distintos:

| | `@wati-io/wati-cli` (lo que usamos) | `wati-mcp-server` |
|---|---|---|
| Para qué sirve | Que **nuestro** código llame a WATI de forma determinista | Que un **cliente con LLM** (Claude Desktop, Cursor) llame a WATI por chat |
| Transporte | Proceso CLI en el mismo Node | MCP por **stdio** (subproceso lanzado por el cliente) |
| Runtime | Node.js (mismo del agente) | **Python 3.11+** (otro toolchain) |
| Encaje con un webhook 24/7 | Directo y simple | Forzado: habría que gestionar un subproceso Python por petición |

Razones para quedarnos con el CLI en el agente:

- **Topología.** MCP conecta un *cliente LLM* con herramientas. Aquí nuestro propio
  servicio ya orquesta el LLM; no necesitamos exponer WATI como herramientas a un
  cliente externo. El flujo (historial → generar → enviar) es fijo y se controla
  mejor en código que dejándoselo decidir al modelo.
- **Simplicidad y un solo lenguaje.** El CLI nos da exactamente lo que necesitamos
  (`conversations messages`, `conversations send-text`, `webhooks subscribe`) en
  Node, sin añadir Python ni un transporte stdio a un servicio que debe correr 24/7.
- **El objetivo del proyecto** pedía explícitamente `@wati-io/wati-cli`.

**Cuándo sí tiene sentido el MCP server** (es complementario, no rival):

- Para que una **persona del equipo** gestione WATI conversacionalmente desde
  Claude Desktop/Cursor ("manda esta plantilla a estos 50 contactos", "¿qué dijo el
  cliente X?"). Es un excelente caso de uso interno y se puede adoptar en paralelo
  sin tocar este agente.
- Si en el futuro quisiéramos que **el agente sea "agéntico"** (que el LLM decida
  buscar un contacto, mandar una plantilla o escalar a un humano a mitad de la
  conversación), el camino más limpio en este proyecto es definir *tool-use* de
  Anthropic respaldado por el mismo `src/wati.js` que ya tenemos —todo en Node— en
  lugar de introducir el servidor MCP de Python en la ruta de las peticiones.

## Notas

- El agente responde **solo a mensajes de texto** en esta versión (lo más simple
  que funciona). Mensajes con solo multimedia se reconocen y se ignoran.
- El webhook se confirma de inmediato (200) y el mensaje se procesa en segundo
  plano, para que WATI no reintente por timeout.
- **Prompt caching activado:** el prefijo estable (instrucciones + base de
  conocimiento) se marca con `cache_control`, así se reutiliza a ~0,1× del costo
  en mensajes seguidos. El contexto variable por conversación (nombre, bienvenida)
  va después del punto de caché para no invalidarla. El caching solo aplica cuando
  el prefijo supera el mínimo del modelo (~2.048 tokens en Sonnet, ~4.096 en Opus);
  con la base de conocimiento aún vacía puede no activarse todavía.
- El formato del historial de WATI puede variar según la cuenta; `normalizeHistory`
  en `src/agent.js` es tolerante y degrada con elegancia (si no puede leer el
  historial, igual responde al mensaje actual). Ajústalo si tu cuenta usa otros
  campos.
