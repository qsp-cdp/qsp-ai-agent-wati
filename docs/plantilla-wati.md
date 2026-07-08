# Flujo WATI: captura de dirección, atributos y despacho a Shipday

> **✅ Implementado y probado en vivo (08-jul-2026).** El diseño real terminó más simple que el borrador
> original de este doc: SIN los 5 atributos de contacto (son solo cosméticos, para que el asesor vea el dato
> en el panel; el despacho no los necesita — la dirección vive en la libreta `contacts`), y con disparadores
> por KEYWORD en vez de un botón/etiqueta (WATI no tiene disparador por etiqueta, solo por mensaje entrante o
> por cambio de atributo). Lo que sigue abajo es el diseño ORIGINAL (útil como referencia de intención); la
> sección **"Lo que quedó armado de verdad"** al final documenta la implementación real.

Diseño del flujo de compra asistida por WhatsApp:

```
1. CAPTURA    El flujo pide dirección (+ referencia y mapa opcionales)
              → POST wati-address → guarda en Supabase
              → refleja como ATRIBUTOS del contacto en WATI
2. VISIBILIDAD El agente ve en el perfil del contacto si ya tiene datos
              de envío completos (atributo envio_datos = "completo")
3. DESPACHO   El agente confirma la venta → POST wati-order
              → crea la orden en Shipday (dirección desde la libreta)
              → anuncia al cliente: "tu pedido va a preparación para envío"
              → Shipday envía luego su tracking cuando el repartidor sale
```

URLs (project ref `jbigmlcalcwiphqeudxd`), siempre con header `x-wati-token`:

| Acción | Endpoint |
|---|---|
| Guardar/actualizar dirección | `POST /functions/v1/wati-address` |
| Consultar si hay dirección | `GET /functions/v1/contacts-lookup?phone={{waId}}` |
| Despachar pedido a Shipday | `POST /functions/v1/wati-order` |

---

## Paso 0 — Crear los atributos en WATI (una vez)

WATI → **Contactos → Atributos de contacto → Agregar atributo** (tipo texto):

- `direccion_envio` — dirección completa de entrega
- `referencia_envio` — punto de referencia
- `maps_envio` — link de Google Maps
- `envio_datos` — "completo" cuando ya se capturó todo
- `envio_fecha` — fecha de la última actualización

Con esto, el agente abre cualquier chat y ve de un vistazo en el panel derecho si el cliente tiene datos de envío y cuáles son.

## Paso 1 — Flujo de captura «Dirección de envío»

WATI → Chatbots/Flow Builder → nuevo flujo:

1. *(Opcional)* **Webhook GET** a `contacts-lookup?phone={{waId}}`: si responde `found:true`, preguntar «¿Entregamos en *{{contact.address}}* como la vez pasada?» (botones **Sí** → saltar a despacho / **Actualizar** → seguir).
2. Pregunta → variable `direccion`: «📍 ¿Cuál es la dirección exacta de entrega? (calle, edificio, piso/apto, barrio)»
3. Pregunta → variable `referencia`: «🏠 ¿Alguna referencia? (frente a qué queda, color del edificio…)» — puede responder "ninguna".
4. Pregunta → variable `maps` (opcional): «🗺️ Para que el repartidor llegue exacto, lo ideal es que uses **📎 Adjuntar → Ubicación** de WhatsApp y compartas tu ubicación. También puedes pegar un link de Google Maps, o escribir "no".»
   - **Ubicación nativa de WhatsApp** = lo más preciso: WATI entrega latitud/longitud directas → pin exacto en Shipday. Si el flujo las expone como variables, mándalas también en el body como `lat` y `lng`.
   - **Link de Google Maps** (largo o corto tipo `maps.app.goo.gl`): la función lo resuelve sola siguiendo la redirección para sacar las coordenadas. Si no puede, el link igual viaja como instrucción tappable para el repartidor.
5. **Webhook POST** a `.../wati-address`
   - Headers: `x-wati-token: <WATI_WEBHOOK_TOKEN>` · `Content-Type: application/json`
   - Body:
     ```json
     {
       "waId": "{{waId}}",
       "nombre": "{{name}}",
       "direccion": "{{direccion}}",
       "referencia": "{{referencia}}",
       "maps_url": "{{maps}}",
     "lat": "{{latitud}}",
     "lng": "{{longitud}}"
     }
     ```
   (`lat`/`lng` solo si el flujo captó la ubicación nativa de WhatsApp; si no, se omiten y se resuelve desde `maps_url`.)
6. Mensaje de cierre: «¡Listo! Guardamos tu dirección de entrega ✅».

La función guarda el contacto en la libreta y actualiza los atributos; si el link de Maps trae coordenadas, también las guarda (y luego viajan a Shipday para clavar el pin del repartidor).

## Paso 2 — Plantilla HSM para iniciar la captura (fuera de 24 h)

> **Nombre:** `captura_direccion_envio` · Categoría: *Utility* · Idioma: `es`
>
> Hola {{1}} 👋 Para coordinar la entrega de tu pedido necesitamos confirmar tu dirección. ¿Me la compartes por aquí? Solo toma un minuto:
> 📍 Dirección exacta · 🏠 Referencia · 🗺️ Ubicación (opcional)

(Dentro de la ventana de 24 h no hace falta plantilla: el flujo pregunta directo.)

## Paso 3 — Despacho (agente o bot)

Cuando la venta está confirmada, un flujo corto «Despachar pedido» (o un botón que el agente dispara) hace **Webhook POST** a `.../wati-order`:

```json
{
  "waId": "{{waId}}",
  "pedido": "{{resumen_pedido}}",
  "total": "{{total}}"
}
```

No hace falta mandar la dirección: la función la toma de la libreta (la que capturó `wati-address`). Si el cliente no tiene dirección registrada, responde 400 con el mensaje claro — señal para correr primero el flujo de captura.

La función entonces:
1. Crea la orden en **Shipday** (con referencia, link de mapa en las instrucciones del repartidor y coordenadas si las hay).
2. Envía al cliente el anuncio automático:
   > 🛠️ {nombre}, tu pedido ya está en preparación para envío 📦
   > Entregaremos en: {dirección}
   > Te avisaremos por aquí cuando salga en camino. 🚚
   (desactivable con `"notificar": false`)
3. Devuelve `orderNumber` por si el flujo quiere mostrárselo al cliente.

Después, cuando el repartidor toma la orden, **Shipday** manda su propio WhatsApp con el link de tracking en vivo (Branded Premium) — el ciclo queda: *preparación (nuestro mensaje) → en camino (Shipday) → entregado (Shipday)*.

## Prueba end-to-end

```bash
# 1. Capturar dirección (simulando el flujo)
curl -X POST https://jbigmlcalcwiphqeudxd.supabase.co/functions/v1/wati-address \
  -H "x-wati-token: <TOKEN>" -H "Content-Type: application/json" \
  -d '{"waId":"507XXXXXXXX","nombre":"Prueba","direccion":"PH Prueba, Calle 50","referencia":"frente al banco","maps_url":"https://maps.google.com/?q=8.98,-79.52"}'
# → {"ok":true,"guardado":true,"atributos_wati":true}
#   y en WATI el contacto muestra los atributos llenos

# 2. Despachar (sin mandar dirección: la toma de la libreta)
curl -X POST https://jbigmlcalcwiphqeudxd.supabase.co/functions/v1/wati-order \
  -H "x-wati-token: <TOKEN>" -H "Content-Type: application/json" \
  -d '{"waId":"507XXXXXXXX","pedido":"1x Tinta HP 954","total":"32.10"}'
# → orden en Shipday + WhatsApp "en preparación" al cliente
```

## Lo que quedó armado de verdad (implementación real, 08-jul-2026)

Probado end-to-end con tráfico real (no solo curl). Dos flujos de WATI, cada uno un disparador por keyword +
un único paso Webhook — sin atributos de contacto ni botones.

### Flujo 1 — "Dirección de envío" (captura)
- **Regla** (Automatizaciones): mensaje entrante **Contiene** `registrar envio` → inicia el chatbot.
- **Pasos:** 3 preguntas (dirección → referencia → link de Maps/"no") guardadas en variables, luego
  **Webhook** POST a `wati-address` con `{"telefono":"{{phone}}","nombre":"{{name}}","direccion":"@direccion","referencia":"@referencia","maps_url":"@maps"}`,
  luego un mensaje de cierre ("¡Listo! Guardamos su dirección de entrega ✅…").
- **Plantilla HSM** `captura_direccion_envio` creada y **aprobada por Meta** (Utility, español) — para
  iniciar la captura fuera de la ventana de 24 h (dentro de la ventana, el asesor solo pide el keyword).

### Flujo 2 — "Despachar pedido"
- **Regla:** mensaje entrante **Contiene** `confirmar envio` → inicia el chatbot.
- **Un solo paso:** Webhook POST a `wati-order` con `{"telefono":"{{phone}}"}` (sin más campos — la función
  toma dirección/nombre de la libreta). Sin mensaje de cierre propio: `wati-order` ya le manda al cliente su
  confirmación ("tu pedido ya está en preparación...").
- El asesor le pide al cliente que escriba el keyword para **confirmar** el envío antes de despachar (doble
  chequeo de la dirección, y evita que un asesor dispare por error desde el inbox).

### Aprendizajes operativos (por si se toca esto de nuevo)
- **Las reglas de WATI disparan con mensajes ENTRANTES.** Un mensaje que el asesor escribe desde el inbox es
  SALIENTE — no dispara la regla, y tampoco lo captura un paso "Hacer una pregunta" del flujo (verificado: el
  asesor contestó la pregunta de dirección desde el inbox y el flujo se quedó esperando). Los 3 pasos del
  Flujo 1 y el keyword de ambas reglas los tiene que escribir el **cliente**, no el asesor.
- **WATI no tiene disparador por etiqueta** (solo por mensaje entrante, o por cambio de atributo de contacto,
  o eventos de KnowBot/IA). Se evaluó y se descartó por ahora — el patrón por keyword ya cumple.
- **Cada disparo del Flujo 2 crea una orden nueva en Shipday.** Si el cliente escribe el keyword dos veces,
  salen dos órdenes — cancelar la duplicada a mano en el dashboard de Shipday.
- **`maps_url` guarda lo que el cliente escriba tal cual** (si responde "no", queda `maps_url:"no"` en la
  libreta, y `wati-order` lo mete literal en las instrucciones del repartidor como "📍 Mapa: no"). Cosmético,
  no bloquea el despacho — pendiente de un fix menor en `wati-address` (tratar "no"/"ninguna" como vacío).
- Los **5 atributos de contacto** del diseño original (`direccion_envio` etc.) NO se crearon — son solo para
  que el asesor vea el dato en el panel de WATI, y el circuito completo funciona sin ellos. Se pueden agregar
  después sin tocar nada del backend (el código de `wati-address` ya los escribe *best-effort* si existen).
