# Auditoría integral de solo lectura — 2026-08-27

Objetivo: el código REAL en producción (copiloto **v119.1**, rama `claude/supabase-agent-review-tvvg61`,
proyecto `jbigmlcalcwiphqeudxd`) — contrato de abstención, tools, puente Shipday, seguridad y pruebas.
Tres frentes en paralelo con acceso de lectura a prod (API de management + SELECTs de diagnóstico):

- `frente-a-copiloto.md` — copilot-webhook v119.1 (4.707 líneas leídas completas) + drift rama↔prod
- `frente-b-puente.md` — shopify-webhook/shipday-status/wati-order + funciones huérfanas + CI
- `frente-c-seguridad-pruebas.md` — superficie HTTP, ACL de RPC en prod, crons, fugas, pruebas

Adjuntos: `golden-portado-v119.mjs` (los 667 golden portados al index v119.1 — 629 pasan) y
`_unidad-reconstruido.mjs` (el helper que le falta al único test de la rama nueva).

## Veredicto global

El sistema está **sano en lo que más importa**: prod es byte-idéntico a la rama en las 4 funciones
verificadas (la deriva repo↔prod quedó cerrada por GitHub Actions), el contrato de abstención está
vivo y más duro que en v73, el círculo de pedidos funciona en sus 3 patas, el P0-1 de seguridad está
completo en prod y los 6 crons están limpios. Los riesgos grandes no son bugs puntuales sino
**hábitos nuevos**: llaves hardcodeadas en git, código productivo sin fuente versionada, CI que
despliega sin pruebas, y trabajo lento que volvió a colarse antes del ACK a WATI (la lección v14,
con 4 timeouts reales el mismo día de la auditoría).

## Prioridades

### P0 — retroceso de prod con un comando · ✅ MITIGADO en este mismo commit
La rama vieja (v73.1) seguía viva con un `deploy.ps1` cuyo default despliega 8 funciones: un
`git pull` + `.\deploy.ps1` de memoria muscular habría retrocedido el copiloto 46 versiones,
resucitado `wati-address` (retirada el 21-ago) y pisado `contacts-lookup` v2 con una v1 de
22 líneas. **El script ahora aborta con la explicación** (este commit). Complemento recomendado:
archivar la rama vieja cuando ya no haga falta como referencia.

### P1 — arreglar esta semana (todos viven en la rama nueva o en secretos de prod)

1. **`no_es_cliente` consulta la API de WATI síncrono ANTES del 200** (timeout 8 s; el sello del
   caché se escribe DESPUÉS del fetch → una ráfaga dispara N fetches concurrentes). **4 timeouts
   reales el 27-ago 18:13.** Es la clase de falla que desactivó el webhook el 15-ago. Fix: sellar
   el caché antes del fetch + bajar timeout, o mover a `EdgeRuntime.waitUntil`. [frente A, P1-a]
2. **Llaves de guard hardcodeadas en git**: `ficha-pdf`, `geo-fallback`, `ph-loader`,
   `specs-centinela` (y `code-host` en prod; el cron 15 usa la llave hardcodeada). Cualquiera con
   el repo puede escribir en la base de conocimiento de specs y en el directorio geográfico.
   Fix: pasar a secrets fail-closed (patrón watchdog) + ROTAR. [frente C, P1-a]
3. **La trampa `hmac_rechazado` (despacho v68) no la lee nadie**: ni `resumen_diario` ni el
   semáforo del watchdog. Un secreto HMAC desincronizado rebotaría todos los pedidos con el correo
   en 🟢. Fix: contarla en el RPC y pintarla 🔴 si > 0. [frente B, P1-1]
4. **La red de pruebas no existe y el CI despliega a ciegas**: la rama nueva tiene UNA prueba y
   no corre (importa `_unidad.mjs`, jamás commiteado); `deploy-copilot.yml` no ejecuta ningún test.
   El golden portado ya pasa 629/667 (38 por arbitrar, mayoría locks obsoletos de decisiones
   deliberadas) — adoptarlo + 4 líneas de CI. [frentes A P1-b, B P1-2, C]
5. **El workflow diffea solo el último commit del push** (`HEAD^ HEAD`): un push de 2 commits
   tocando funciones distintas deja una SIN desplegar en silencio — la clase de drift del
   ~06-ago. Fix: `github.event.before..github.sha` + `fetch-depth: 0`. [frente B, P1-3]
6. **Código productivo sin fuente en git**: `contacts-lookup` v2 (flujo WATI), `cotizador`
   (página de asesores), `wati-classify` (clasificador LLM v4). **Rescatados byte-exactos en
   `docs/rescate-prod-2026-08-27/`** (este commit); lo correcto es re-incorporarlos a la rama que
   despliega. `reengage-expired` (cron del lunes) tiene fuente SOLO en la rama vieja. [frente B/C]
7. **Mina latente `COPILOT_STT=shadow`**: transcribe síncrono pre-dedup y pre-ACK — el escenario
   exacto del incidente v68.1, re-armable con un flip de secreto. Hoy inerte (`live`). [frente A, P1-c]

### P2 — programar

- `fallido` nunca llega a `entregado` (rank terminal compartido) → el bot relata "fallido" de una
  entrega reintentada y entregada. [B]
- Revertir la marca `no_es_cliente` tarda hasta 12 h en surtir efecto (el caché no distingue
  dirección del cambio). [A]
- El barrido NO aplica `PAGOS_ASESOR_RE`/`COBRO_RE` (el comentario "mismos guardrails" quedó
  desactualizado desde v79): puede intervenir en pleno cobro del asesor. [A]
- `?captura=1` no respeta `cerrada`: pregunta la dirección y después no escucha la respuesta. [A]
- Grants TRUNCATE/REFERENCES/TRIGGER a `anon`/`authenticated` en ~15 tablas del negocio;
  `spatial_ref_sys` escribible por anon. [C]
- El default muerto de `COPILOT_WEBHOOK_KEY` sigue en el código (fail-open latente si el secreto
  faltara) — pendiente desde v45. `RESOLVE_SECRET` aceptado por query param (queda en logs). [C]
- La regla del DÍA DE LA SEMANA (v52) desapareció del prompt v119 (mitigada por NEEDS_TOOL_RE). [C]
- `wati-order` deriva al "flujo wati-address" (muerto, 410) y no hace `.trim()` al token. [B]
- Tres envíos a WATI síncronos pre-ACK acotados (aviso v112, despedida handoff, puente audio). [A]
- Huérfanas activas con `_shared` congelado (`contacts-lookup`, `reengage-expired`): un cambio de
  contrato en RPC/tablas las rompe sin que el CI pueda tocarlas. [B]

## Lo verificado en verde

- **Drift rama↔prod: CERO** en copilot-webhook, shopify-webhook, shipday-status y wati-order
  (SHA-256 comparados). Deploys por CI con entrypoints de GitHub Actions.
- **Contrato de abstención VIVO**: anti-eco insert-antes-de-enviar en los 8 caminos, INTERRUPT/
  HANDOFF sobre la ráfaga, re-chequeo sobre transcripciones, anti-carrera, `cerrada` blindada,
  `soloPideAsesor`, `es_ack` idéntico TS↔SQL↔prod (verificado palabra por palabra).
- **Grounding intacto**: ITBMS y aritmética 100 % en código, allowlists `*.wati.io` y
  `cdn.shopify.com`, guard anti-fuga, tools con errores honestos.
- **P0-1 completo en prod**: 17 RPC SECURITY DEFINER propias, todas con ACL solo
  `{postgres, service_role}`; las RPC nuevas de agosto nacieron ya revocadas.
- **Círculo de pedidos**: las 3 patas escriben (`shopify` 141 · `shipday` 56 · `wati` 11 filas),
  el lector `estado_pedido` intacto.
- **6 crons limpios** (reengage, watchdog 30min, sweep 20min, resumen 3×, specs-centinela lunes),
  sin huérfanos ni duplicados.
- **Higiene conservada**: enmascarado de errores OpenAI/Resend, `evento_sin_texto` sin payload,
  email→dominio, HMAC sin volcar cuerpo, tope 256 KB, RLS on en las 18 tablas.
