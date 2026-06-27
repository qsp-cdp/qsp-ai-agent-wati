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

---

## 7. Aclaraciones del contrato (Q&A con el CDP, 2026-06-25)
- **🔑 `RESOLVE_SECRET`:** la env var que lee el endpoint del copiloto se llama exactamente
  **`RESOLVE_SECRET`** (pueden nombrar igual el secret del lado CDP). El valor se entrega por
  **canal seguro** (ideal: cargarlo directo como secret del proyecto CDP), NUNCA por chat/repo/PR/logs.
- **Estabilidad:** v30 es prod estable; la URL y el contrato del endpoint se mantienen (no se rompen
  en versiones futuras).
- **Sin ventana de `404` espurio:** la fila se inserta (`await`, commit) DENTRO de `buscar_producto`,
  ANTES de devolver/enviar el link; el click ocurre segundos/minutos después → el `GET` da `200`
  inmediato. Además, si el insert falla, el bot **NO emite** el `ref_code` (no existe un code sin
  fila). ⇒ todo `ref_code` emitido está guardado.
- **`404` = terminal:** el `ref_code` no existe (nunca se emitió, o fue purgado). Tratarlo como
  no-match definitivo (no reintentar).
- **`wa_id`:** siempre dígitos con código de país, sin `+` (ej. `50766746530`). El bot guarda el
  `waId` de WATI tal cual (solo dígitos). Casos raros posibles: números internacionales o algún
  malformado; el `+`-prefix para E.164 es correcto en el caso normal.
- **Rate limit:** no hay límite explícito en el endpoint; el volumen descrito (1×/click sin resolver,
  lotes ~cada 15 min) es bajo y está bien. ⚠️ El endpoint comparte la función con el webhook de
  WhatsApp en vivo → evitar ráfagas grandes (concurrencia modesta, ≤~5-10).
- **Limpieza `ref_codes`:** el pg_cron de purga está **PENDIENTE** (hoy no se purga nada; la tabla
  crece). Cuando se aplique será a **≥90 días** (muy por encima del piso de 30d del CDP) ⇒ sin riesgo
  de `404` por purga para clicks frescos.
- **`producto_handle`:** siempre un handle válido de Shopify (sale del propio URL de producto; solo se
  guarda la fila si hay handle).

---

## 8. Respuesta al spec consolidado del CDP (2026-06-26)

> El CDP envió un spec consolidado (reemplaza las instrucciones parciales previas) pidiendo (A) que el
> copiloto implemente el loop WhatsApp→web y (B) confirmar contratos. **La Parte A ya está LIVE (v28–v30,
> hoy bajo v32).** Acá las confirmaciones, con un ajuste de ruta importante.

### 8.1 Parte A — estado real (todo en vivo, verificado)
- **A1 `ref_code` ✅** — 8 caracteres `[A-Za-z0-9]` case-sensitive, crypto-random (alfabeto de 62);
  unicidad por PK. **Matiz:** ante colisión NO regeneramos — el insert falla y ese link sale SIN
  `ref_code` (jamás se emite un code sin guardar). Con 62⁸ ≈ 2.18×10¹⁴ y RNG criptográfico la colisión
  es despreciable; el fail-safe es "sin code antes que un code no guardado". (Si el CDP lo exige, se
  agrega retry-on-collision, pero es innecesario.)
- **A2 link ✅** — apex, determinista (post-LLM `reaplicarTracking`, no depende del LLM). ⚠️ **El link
  emitido lleva UTMs además del `ref_code`** — URL real:
  `https://quickservicepanama.com/products/<handle>?utm_source=whatsapp&utm_medium=chatbot&utm_campaign=copilot-wati&ref_code=XXXXXXXX`
  El `ref_code` va al final y su valor es exactamente 8 `[A-Za-z0-9]` → pasa el `^[A-Za-z0-9]{8}$` del
  Worker. Los UTMs son para reporte de canal nativo; no afectan la captura.
- **A3 mapeo ✅** — tabla `ref_codes`: `{ ref_code (PK), wa_id, producto_handle, created_at }`, una fila
  por link emitido.
- **A4 endpoint ✅ — ⚠️ la RUTA NO es `/resolve-ref`.** Es el GET de la propia función `copilot-webhook`:
  ```
  GET https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?ref_code=XXXXXXXX
  Authorization: Bearer <RESOLVE_SECRET>
  → 200 { "wa_id": "...", "producto_handle": "...", "ts": "<created_at ISO>" }
  → 404 no existe · 403 auth inválida/ausente · 400 ref_code ≠ ^[A-Za-z0-9]{8}$ · 500 db
  ```
  (También acepta `&key=<RESOLVE_SECRET>` para probar en navegador.) `ts` = `created_at` (momento de
  EMISIÓN). `RESOLVE_SECRET` ya configurado (`resolve_configured:true`); se entrega por canal seguro.
- **A5 privacidad ✅** — nunca `wa_id`/email/PII en la URL; solo el `ref_code` opaco.

### 8.2 Parte B — contratos confirmados (del código)
**Resolver (WhatsApp→web):**
- **`wa_id`:** dígitos PELADOS, con código de país, SIN `+` ni espacios (ej. `50761980416`). Se guarda
  como `waId.replace(/\D/g,"")` del webhook → el `phone_e164 = '+' || <dígitos>` del CDP calza directo.
- A1–A4 en vivo y verificados end-to-end.

**Puente WATI→CDP (`wati-cdp-sync`):** segundo puente, independiente; lo construye el CDP. El copiloto
solo confirma los datos que escribe `guardar_lead`:
- **customParams (exactos, case-sensitive, todos en minúscula):** `email`, `nombre`, `apellido`,
  `empresa`. Nunca datos fiscales (RUC/dv/factura) — la tool ni los acepta como parámetros.
- **Teléfono:** el copiloto usa el `waId` del webhook (dígitos sin `+`). El `getContacts` lo llama el
  CDP (su edge function); WATI devuelve el id en `wAid` (mismos dígitos) → normalizar igual
  (`'+' || dígitos`) y verificar contra una respuesta real (esa llamada vive del lado CDP).
- `guardar_lead` LIVE desde v25/v27, validado en prod (`job_log` `lead_capturado`).

---

## 9. Lado CDP — resolución, enriquecimiento y cierre (cross-ref)

El lado CDP del puente vive en el repo `qsp-cdp/qsp-cdp-docs`:

- **Resolver inverso** `wa-ref-resolver` (WA→web): consume este `copilot-webhook`
  (`GET ?ref_code=` con `Authorization: Bearer RESOLVE_SECRET`), teje edges
  `bridge:ref_match` y enriquece contactos. Fuente:
  `cdp/edge-functions/wa-ref-resolver/index.ts`.
- **Bridge de atributos** `wati-cdp-sync` (WATI→CDP): enriquece `contacts` con los
  lead attrs de `guardar_lead`. Fuente: `cdp/edge-functions/wati-cdp-sync/index.ts`.
- Evidencia de cierre (CERRADO-VERIFICADO-EN-VIVO, 2026-06-27):
  `docs/audit-evidence/2026-06-27-cierre-loop-wa-web.md` y
  `docs/audit-evidence/2026-06-27-cierre-bridge-wati-cdp.md`.
- Automatización: pg_cron job 40 (`wa-ref-resolver-sweep`, `*/30 * * * *`) y job 41
  (`wati-cdp-sync-enrich`, `15,45 * * * *`) en el proyecto CDP `tuyheailysudfxiuppmg`.
- Commit de referencia: `dab60a7` (qsp-cdp-docs, PR #5, branch `claude/jolly-gates-093yd4`).

▸ Claude Code · Opus 4.8 · Ultracode
