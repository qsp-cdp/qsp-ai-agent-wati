# Copiloto v125 — el asesor es "él", sombra de modelos OpenAI y ficha con foto (03-sep-2026)

Tres pedidos de Gerencia en una versión. Cada uno tiene su palanca y ninguno cambia lo que el cliente
recibe hasta que se encienda (salvo el primero, que es solo concordancia de género y aplica siempre).

| Pedido | Qué cambia | Palanca | Default |
|---|---|---|---|
| El copiloto habla en masculino | Prompt + candado determinista `corregirGeneroBot` | — (siempre) | activo |
| Probar modelos de OpenAI en sombra | Cada turno real se re-corre contra N modelos y queda en `job_log` | `COPILOT_SOMBRA_OPENAI` | vacío = apagado |
| Ficha con foto, link solo al repreguntar | La foto del producto va primero; el link se reserva | `COPILOT_FICHA_IMAGEN` | apagado |

Healthcheck: `curl -s https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook` debe decir
`"version":"v125-asesor-sombra-openai-ficha-foto"` y expone `sombra_openai`, `sombra_openai_pct`,
`sombra_openai_esfuerzo` y `ficha_imagen`.

---

## 1. El copiloto es "él"

Los asesores de QSP son hombres. El bot, aun presentándose como "el asistente", a veces cerraba con
"encantada de ayudarle" o "quedo atenta": un cliente que ayer habló con Miguel y hoy lee eso nota el
cambio de voz.

- **Prompt** (ESTILO → QUIÉN ERES): habla de sí mismo en masculino, sin nombre propio ni "asistente
  virtual". Aclara además que cuando las reglas dicen "un asesor" hablan de una PERSONA del equipo, no
  del bot (el prompt usa esa palabra decenas de veces para derivar; no se cambió su significado).
- **Candado** `corregirGeneroBot` (patrón v87: el prompt pide, el código garantiza). Corrige solo
  concordancias en primera persona que no admiten otra lectura: "encantada", "yo misma" y el adjetivo
  que sigue a un verbo en primera persona ("quedo/estoy/estaré/sigo… atenta/lista/dispuesta"). **No toca**
  lo que pueda referirse al cliente o a un producto ("la impresora está lista", "gracias por estar
  atenta"). Corre en el flujo normal y en asistencia, después de `limpiarWhatsApp` y `reaplicarTracking`.
- La sombra (abajo) registra `femenino_sombra`: si el modelo alternativo se va al femenino más que Claude.

## 2. Sombra de modelos OpenAI

Mismo patrón con el que entraron el MCP (v59) y la réplica (v120): **medir antes de cambiar**. Con la
lista puesta, después de responder con Claude y en segundo plano, el mismo turno —mismo system
(estático + dinámico), mismo historial con sus marcas de tiempo, mismas imágenes/PDF en base64, mismas
herramientas del modo— se corre contra cada modelo de la lista. El cliente recibe lo de siempre.

### Secretos

| Secreto | Valor | Notas |
|---|---|---|
| `COPILOT_SOMBRA_OPENAI` | `gpt-5-mini,gpt-5` | lista separada por coma, máx 4. Vacío = apagado. |
| `OPENAI_API_KEY` | (ya existe, la del STT) | sin ella la sombra no corre aunque haya lista |
| `COPILOT_SOMBRA_OPENAI_PCT` | `100` | % de turnos que se sombrean; bajar si el costo molesta |
| `COPILOT_SOMBRA_OPENAI_ESFUERZO` | `low` | `reasoning_effort` para gpt-5*/o*: minimal, low, medium, high |

Los modelos se corren **en serie** (una sola instancia de Edge; el costo se controla con PCT). Un
modelo que la API rechace (nombre inexistente, parámetro no soportado) queda como fila con `error`
—con la key enmascarada, lección de v68— y no afecta a los demás ni al turno real.

### Qué NO hace la sombra

- No envía nada por WATI ni escribe en `messages` (una fila en el hilo entraría al historial del
  siguiente turno y contaminaría al bot real).
- `guardar_lead` y `guardar_datos_envio` van **stubeadas** (responden "guardado" sin guardar): la sombra
  no puede escribirle la ficha de WATI ni la libreta de despacho a un cliente que no ve su respuesta.
- `buscar_producto` corre con `sinRef`: no emite `ref_codes`. Un ref_code es una promesa de atribución
  de algo que se le mostró al cliente; además el guard v120 los toma como "emitidos por nosotros" y no
  debe aflojarse por una búsqueda que nadie vio.
- Las herramientas de solo lectura (info_tienda, sucursales, tarifa, estado_pedido, folleto, asesoría,
  cotización) corren igual que en el turno real: es lo que hace comparables las dos respuestas.

### Cómo leerla

Una fila por turno y por modelo en `job_log`, `action='sombra_openai'`:

```sql
select detail->>'modelo' modelo, count(*) turnos,
       round(avg((detail->>'ms')::int)) ms,
       sum((detail->>'callo_sombra')::bool::int) callo_sombra,
       sum((detail->>'callo_real')::bool::int)   callo_real,
       sum((detail->>'fuga_tool_sombra')::bool::int) fugas_tool,
       sum((detail->>'links_fuera_del_turno_sombra')::int) links_inventados,
       sum((detail->>'femenino_sombra')::bool::int) femenino,
       sum((detail->>'marcador_burbujas_sombra')::bool::int) usa_burbujas,
       sum(case when detail->>'error' is not null then 1 else 0 end) errores
from job_log
where action = 'sombra_openai' and created_at > now() - interval '7 days'
group by 1 order by 1;
```

Y para leer respuestas lado a lado (`texto_real` vs `texto_sombra`, con las tools que llamó cada uno):

```sql
select created_at, detail->>'modelo' modelo, detail->>'modo' modo,
       detail->'tools_real' tools_real, detail->'tools_sombra' tools_sombra,
       detail->>'texto_real' real, detail->>'texto_sombra' sombra
from job_log where action = 'sombra_openai' order by created_at desc limit 50;
```

Las señales son las mismas que vigila el camino real: `callo_*` (respuesta vacía), `fuga_tool_sombra`
(escribió la llamada a la tool como texto, el caso v44), `links_fuera_del_turno_sombra` (citó un producto
que no buscó en el turno: la forma del incidente v120), `femenino_sombra`, y si respeta el marcador
de burbujas. Con esos números por modelo se decide si vale la pena un A/B en vivo; el A/B en sí sigue
siendo cambiar `COPILOT_MODEL` (Claude) o, si un modelo de OpenAI gana, una versión que lo cablee al
camino real —eso no está en esta versión a propósito.

## 3. Ficha con foto (link solo al repreguntar)

Un asesor humano no manda un link cada vez que cotiza: manda una **captura** del producto y, si el
cliente quiere ver más o comprar en la web, ahí le pasa el link. El bot hacía lo contrario (título +
link en cada cotización, con la tarjeta de WhatsApp como "foto").

Con `COPILOT_FICHA_IMAGEN=1`, al cotizar **un** producto:

1. **Foto** oficial del producto (la de Shopify), con la parte (1) del texto como pie: la frase de
   contexto + el *título exacto*.
2. **Precio** con ITBMS (burbuja 2, si `COPILOT_BURBUJAS=1`; si no, junto con el stock en un mensaje).
3. **Stock** + pregunta de cierre.

El link **no va** en esa respuesta. El prompt (sufijo dinámico `FICHA_SUFFIX`, solo con el flag: el
prefijo cacheado no cambia) reserva la URL para cuando el cliente vuelve a preguntar por ese producto
—detalles, "¿me pasa el link?", verlo o comprarlo en la web— y le manda volver a llamar
`buscar_producto` en ese turno para tenerla (nunca de memoria; el guard v120 sigue vigilando).
Listas, comparaciones, `calcular_cotizacion` y asistencia siguen con el formato de siempre, con link.

### Cómo se decide de qué producto es la foto (en código, no por el modelo)

`fichaParaImagen` busca, entre las fichas que `buscar_producto` devolvió **en este turno**, la que
tiene su título exacto (normalizado) o su handle en la respuesta. **Solo si hay una**: con dos o más es
una lista (no va foto); con cero, no se cotizó nada concreto. La foto queda atada al mismo resultado
del que salieron precio y stock: no se puede mandar la foto de un producto con el precio de otro. El
modelo nunca ve URLs de imágenes.

La foto viene de tres fuentes, sin viaje extra: `suggest.json` (`image`/`featured_image`), el MCP si
la trae, y Admin GraphQL (`featuredImage`) en la **misma consulta** con la que ya se lee el stock.

### Invariantes que se conservan

- **Fila antes de enviar** (v21): la foto se inserta como `model='copilot-imagen'` antes de subirla a
  WATI; si el insert falla no se manda.
- **Anti-eco**: hasta hoy "el bot nunca envía media" era la premisa del camino de media del negocio
  (v65). Ahora, una imagen `owner=true` con una fila `copilot-imagen` en los últimos 5 min se descarta
  como `eco_propio_imagen`. Sin esto, la foto del bot volvería como "asesor mandó una captura" →
  handoff falso + reloj de asesor arrancado por el bot.
- **Orden de los guards**: la foto se decide DESPUÉS del guard de producto inventado (v120) y de la
  fuga de tool (v44), y nunca sobre una respuesta de respaldo.
- **Si la foto falla** (descarga, tamaño, formato webp —WhatsApp lo vuelve sticker—, WATI), el texto
  sale **completo**, con la parte (1) incluida: el cliente nunca se queda sin la cotización. Telemetría
  en `ficha_imagen` / `ficha_imagen_fallo`.
- **Freno duro**: `enviarImagenWati` pasa por `WA_IGNORAR` igual que el texto; solo descarga de
  `cdn.shopify.com`/`*.shopify.com`/`quickservicepanama.com`, tope 5 MB, a 1024 px de ancho.

### Encendido sugerido

1. Desplegar (no-op: los dos flags apagados, la sombra sin lista).
2. `COPILOT_SOMBRA_OPENAI=gpt-5-mini` una semana; leer la consulta de arriba; agregar modelos.
3. `COPILOT_FICHA_IMAGEN=1` con `COPILOT_LIVE_ALLOWLIST` acotado a un número propio; verificar en el
   teléfono: foto con pie → precio → stock, y que un "¿me pasa el link?" traiga la URL con tracking.
   Revisar que no aparezca ninguna fila `human-agent` con `[image]` justo después de una foto del bot
   (sería un eco no reconocido).
4. Abrir a todos.

### Rollback

Apagar el flag correspondiente (sin redeploy). Para volver al código anterior:
`git checkout 658e16c -- supabase/functions/copilot-webhook/index.ts` y desplegar.
