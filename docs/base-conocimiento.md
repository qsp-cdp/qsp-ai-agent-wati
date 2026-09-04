# Base de conocimiento del bot — tabla `store_facts`

Fuente **única** de los datos de la tienda que el bot puede decir: ubicación, horario, métodos de
pago, tarifas y plazos de envío, devoluciones, contacto, soporte. La herramienta `info_tienda` la
lee entera y el prompt obliga al bot a responder esos temas **solo** con lo que ella devuelva —
nunca de memoria (regla nacida de un caso real: el bot dijo "oficina 4008" cuando es la 454).

Estructura: `key` (PK) · `value` · `updated_at`. Es el espejo del metaobjeto de Shopify
`store_facts/datos-tienda`.

## Agregar o cambiar un dato

Editar el metaobjeto en Shopify, o aplicar una migración de datos (patrón:
`20260821150000_fase0_referencias_de_ubicacion.sql` — upsert por `key`, idempotente). No hace falta
tocar código ni redesplegar: `info_tienda` devuelve todos los pares públicos, así que una fila nueva
llega al bot en la siguiente consulta.

Escribir el `value` **como se le diría al cliente** (frase completa, trato de usted): el bot lo
relaya casi tal cual.

## Llaves PRIVADAS: nunca llegan al modelo (v88)

`store_facts` mezcla datos públicos con operativos (`cotizador_key`, que consume la Edge Function
del cotizador). Todo lo que `info_tienda` devuelve entra al contexto del LLM y **puede terminar
escrito en un chat** — el bot ya demostró que a veces escribe lo que debería quedarse adentro
(v87: "pensando en voz alta").

`factEsPublico()` en `copilot-webhook/index.ts` filtra por lista explícita **y** por patrón, de modo
que una llave nueva quede fuera **por defecto**:

| Queda fuera | Ejemplos |
|---|---|
| Lista explícita `FACTS_PRIVADOS` | `cotizador_key` |
| Termina en `_key`, `_token`, `_secret`, `_password` | `shipday_api_key`, `wati_token` |
| Contiene `apikey` / `api_key` / `webhook` | `google_maps_apikey`, `webhook_url` |
| Empieza con `_` | `_interno_notas` |

**Al agregar una llave operativa a esta tabla, nómbrala con uno de esos patrones.** Si no encaja en
ninguno, agrégala a `FACTS_PRIVADOS`. Mejor aún: si es un secreto de verdad, va en
Dashboard → Edge Functions → Secrets, no en esta tabla.

Verificado al desplegar v88: de las 22 llaves de producción, las 21 públicas pasan y `cotizador_key`
queda fuera.

## Datos de ubicación (Fase 0, 21-ago-2026)

| key | contenido |
|---|---|
| `direccion` | dirección postal: Plaza Aventura, Piso 4, Oficina 454, Vía Ricardo J. Alfaro |
| `como_llegar` | referencias de calle: diagonal a Panadería Momi, frente a Plaza La Galería |
| `estacionamiento` | estacionamientos techados en el Piso 1 de la plaza |

`NEEDS_TOOL_RE` y `BASIC_INFO_RE` incluyen `estacionamiento/estacionar/parqueo/parquear/parking`,
para que la pregunta fuerce `info_tienda` en modo bot y el bot pueda responderla también durante un
handoff. Los patrones están acotados a propósito: "frente al parque" (referencia de dirección muy
común) **no** dispara.
