# Handoff — Puente WhatsApp→web por `ref_code` (mitad del copiloto, LIVE)

> **De:** copiloto `qsp-ai-agent-wati` · Supabase `jbigmlcalcwiphqeudxd` (qsp-wati-copilot)
> **Para:** CDP `qsp-data-hub` · Supabase `tuyheailysudfxiuppmg`
> **Fecha:** 2026-06-25 · **Estado:** ✅ Emite + Guarda + Expone — verificado end-to-end en producción
> **Versión:** `copilot-webhook` **v30** (`v30-resolve-bearer`), ACTIVE, `verify_jwt=false`

## TL;DR
El bot emite los links de producto con un `ref_code` opaco, guarda el mapeo
`ref_code → wa_id + producto_handle`, y expone un endpoint de lectura. **La mitad del copiloto está
lista y verificada.** Falta que el CDP construya el **resolver inverso** (leer el endpoint →
`matched_wa_id` → enriquecer `contacts`).

⚠️ **No confundir** con el flujo existente **web→WhatsApp** (`[Ref:xxxxxxxx]` en el texto del link +
`wati-bridge-stitch` que lo parsea de los mensajes). Eso queda **igual, no se toca**. Esto es la
**dirección inversa** (WhatsApp→web): el bot **genera** el `ref_code` al emitir el link de producto y
guarda el mapeo proactivamente — no lo parsea de un mensaje.

---

## 1. El contrato (lo que el CDP consume)

### 1.1 Endpoint de resolución
```
GET https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?ref_code=<REF_CODE>
Authorization: Bearer <RESOLVE_SECRET>
```
- **Auth:** `Authorization: Bearer <RESOLVE_SECRET>` (preferido — no deja el secreto en la URL/logs).
  También acepta `&key=<RESOLVE_SECRET>` en la query (cómodo para probar en navegador).
- **El valor de `RESOLVE_SECRET` se entrega por canal seguro** (NO está en este documento).
- **Respuesta `200`:**
  ```json
  { "wa_id": "50766746530", "producto_handle": "monitor-hp-322pe-fhd-de-21-45", "ts": "2026-06-25T21:51:37.280709+00:00" }
  ```
- **Errores:** `403` (auth inválida/ausente) · `400` (`ref_code` no cumple `^[A-Za-z0-9]{8}$`) ·
  `404` (no existe) · `500` (error de DB).
- **Nota de ruta:** es un `GET` dentro de la misma función `copilot-webhook` (no es `/resolve-ref`).
  El `GET` sin `?ref_code=` devuelve el healthcheck.

Ejemplo:
```bash
curl -s -H "Authorization: Bearer <RESOLVE_SECRET>" \
  "https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?ref_code=xyEQKZjD"
# → {"wa_id":"50766746530","producto_handle":"monitor-hp-322pe-fhd-de-21-45","ts":"2026-06-25T21:51:37..."}
```

### 1.2 Formatos
| Campo | Formato | Ejemplo |
|---|---|---|
| `ref_code` | `^[A-Za-z0-9]{8}$` — opaco, aleatorio (crypto), único | `xyEQKZjD` |
| `wa_id` | dígitos, con código país, **sin `+`** | `50766746530` |
| `producto_handle` | handle de Shopify | `monitor-hp-322pe-fhd-de-21-45` |
| `ts` | timestamptz — momento de **EMISIÓN** del link (no del click) | `2026-06-25T21:51:37...` |

### 1.3 El link que emite el bot
```
https://quickservicepanama.com/products/<handle>?utm_source=whatsapp&utm_medium=chatbot&utm_campaign=copilot-wati&ref_code=<REF_CODE>
```
- **Apex** (sin `www`; www mete un redirect). Las **UTMs** son para reporte de canal
  (Shopify/GA/Klaviyo, nativo); el **stitch lo hace el `ref_code`**.

---

## 2. Flujo / arquitectura
1. Cliente pide un producto por WhatsApp → el bot busca (Shopify) y **emite el link con `?ref_code=`**
   + guarda `{ref_code, wa_id, producto_handle, created_at}` en su tabla `ref_codes`
   (proyecto copiloto).
2. Cliente abre el link → el **storefront (theme `qsp-tracking.liquid`)** captura `?ref_code=` +
   identidad web (qsp_uid, fbp, fbc, ga_client_id) y postea al **Worker `qsp-ingest`** →
   fila en `wa_ref_codes` con `matched_wa_id` = null. *(YA LIVE — lado CDP, verificado.)*
3. **[PENDIENTE — lado CDP] Resolver inverso:** por cada fila de `wa_ref_codes` sin resolver, llamar
   al endpoint del copiloto con su `ref_code` → obtener `wa_id` + `producto_handle` → setear
   `matched_wa_id` → enriquecer `contacts` (identidad web + interés de producto por el handle).

> **Volumen:** el copiloto crea una fila de `ref_code` por **cada link emitido** (haya click o no).
> El subconjunto que efectivamente se **clickeó** es el que aparece en `wa_ref_codes` (CDP) — el
> resolver solo necesita resolver esos. Cada `ref_code` resuelve a exactamente una fila (es PK).

---

## 3. Aislamiento y privacidad
- **Aislamiento:** el copiloto NO escribe al CDP. Solo **emite** (el link), **guarda** (en SU propia
  DB) y **expone** (endpoint de lectura). El intermediario es el link web + el endpoint — nunca una
  escritura directa al CDP.
- **Privacidad:** ⛔ NUNCA `wa_id`, email ni PII cruda en la URL — solo el `ref_code` opaco. El mapeo
  `ref_code → wa_id` vive en la DB del copiloto, jamás en la URL. El `ref_code` aleatorio no es
  reversible sin esa tabla. El endpoint que devuelve `wa_id` (PII) está guardado por `RESOLVE_SECRET`
  (fail-closed: sin secreto válido → `403`).

---

## 4. Verificación (evidencia, 2026-06-25)
- **Emite ✅** — mensaje real del bot a *"¿venden monitores?"* devolvió:
  `https://quickservicepanama.com/products/monitor-hp-322pe-fhd-de-21-45?utm_source=whatsapp&utm_medium=chatbot&utm_campaign=copilot-wati&ref_code=xyEQKZjD`
- **Guarda ✅** — fila en `ref_codes`: `xyEQKZjD → 50766746530 / monitor-hp-322pe-fhd-de-21-45`.
- **Expone ✅** — `GET …?ref_code=xyEQKZjD` devolvió
  `{"wa_id":"50766746530","producto_handle":"monitor-hp-322pe-fhd-de-21-45","ts":"2026-06-25T21:51:37..."}`.

> Detalle resuelto: una versión previa "limpiaba" el link (el LLM le quitaba el `?…&ref_code=`). Se
> corrigió de forma **determinista** (v29): el bot reaplica el tracking a los links de producto
> después del LLM. La emisión ahora es confiable.

---

## 5. Próximos pasos (lado CDP)
1. Construir el **resolver inverso** que consume el endpoint de la §1.1 (por Bearer).
2. Recibir el `RESOLVE_SECRET` por canal seguro (lo entrega Gerencia/copiloto).
3. (Opcional) usar `producto_handle` para sumar "interés de producto" al contacto.

---

## 6. Notas operativas
- La tabla `ref_codes` del copiloto crece ~5 filas por búsqueda (la mayoría sin click). Limpieza
  prevista: purga de filas > 90 días (pg_cron).
- Versiones relevantes del copiloto: **v28** (ref_code: emit + store + resolve), **v29** (fix: el link
  sale con el tracking intacto), **v30** (el resolve acepta `Authorization: Bearer`).
- No mezclar proyectos: CDP = `tuyheailysudfxiuppmg` · Copiloto = `jbigmlcalcwiphqeudxd`.
