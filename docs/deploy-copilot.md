# Desplegar `copilot-webhook` v74 (captura de datos de envío)

El código está commiteado en la rama `claude/supabase-agent-review-tvvg61`. Solo falta
desplegarlo con la CLI de Supabase desde tu máquina (el entorno remoto no pudo por el
tamaño del archivo). **No toca secretos ni base de datos** — la migración `captura_hasta`
ya está aplicada en producción.

Proyecto: **qsp-wati-copilot** · ref: **`jbigmlcalcwiphqeudxd`**

---

## 1. Requisitos (una sola vez)

```bash
# CLI de Supabase (si no la tienes)
brew install supabase/tap/supabase        # macOS
# o: npm i -g supabase                     # cualquier SO

# Autenticarte (abre el navegador y crea un token)
supabase login
```

## 2. Traer el código de la rama

```bash
git clone https://github.com/qsp-cdp/qsp-ai-agent-wati.git   # si aún no lo tienes
cd qsp-ai-agent-wati
git fetch origin
git checkout claude/supabase-agent-review-tvvg61
git pull
```

> Si el PR #3 ya se fusionó a `main`, usa `git checkout main && git pull` en su lugar.

## 3. Desplegar SOLO el copiloto

```bash
supabase functions deploy copilot-webhook \
  --project-ref jbigmlcalcwiphqeudxd \
  --no-verify-jwt
```

- **Despliega el copiloto por NOMBRE**, a propósito: NO corras `supabase functions deploy`
  sin nombre (eso desplegaría todas las funciones del repo a la vez).
- `--no-verify-jwt` es obligatorio: el webhook valida su propia `?key=`, no un JWT.

## 4. Verificar (debe decir `v74-captura-envio`)

```bash
curl -s "https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook" | grep -o '"version":"[^"]*"'
```

Esperado: `"version":"v74-captura-envio"`. También lo ves en el dashboard →
Edge Functions → copilot-webhook → última versión/deployment.

## 5. Prueba de humo (real, con un número tuyo)

- **P3-a (modo bot):** escribe al WhatsApp del negocio desde un número que NO esté en
  handoff: "quiero que me lo envíen a domicilio". El bot debe pedirte dirección y
  referencia, y confirmar la zona/costo.
- **P3-b (handoff):** con una conversación atendida por un asesor, dispara:
  ```bash
  curl -s -X POST \
    "https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?key=<KEY_DEL_WEBHOOK>&captura=1" \
    -H "Content-Type: application/json" \
    -d '{"waId":"5076XXXXXXX"}'
  ```
  El bot le escribe al cliente pidiendo los datos de entrega, sin sacar la conversación
  del handoff. `<KEY_DEL_WEBHOOK>` = la misma key de la URL del webhook de WATI.

Los datos capturados quedan en la libreta `contacts`; el asesor lanza el despacho con
"Despachar a Shipday" (`wati-order`) como siempre.

## 6. Crear el chatbot de WATI "Captura con AI" (para P3-b sin curl)

Un chatbot/flow de WATI con un solo paso **Webhook / API call**:
- Método `POST`, URL: `…/functions/v1/copilot-webhook?key=<KEY_DEL_WEBHOOK>&captura=1`
- Body JSON: `{"waId": "{{contact.phone}}"}`
- El asesor lo dispara desde el inbox, igual que "Despachar a Shipday".

Detalle completo del comportamiento en `docs/captura-envio.md`.

---

## Rollback (si algo sale mal)

El código anterior (v182, sin captura) está commiteado en `c79b40f`:

```bash
git checkout c79b40f -- supabase/functions/copilot-webhook/index.ts
supabase functions deploy copilot-webhook --project-ref jbigmlcalcwiphqeudxd --no-verify-jwt
git checkout HEAD -- supabase/functions/copilot-webhook/index.ts   # restaura tu working tree
```

Ese rollback devuelve el bot a como estaba antes de este cambio, sin perder nada más.
