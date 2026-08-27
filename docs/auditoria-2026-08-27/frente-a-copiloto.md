# Frente A — Auditoría del copiloto v119.1 (`copilot-webhook`)

Auditoría de solo lectura, 2026-08-27. Archivo auditado COMPLETO (4.707 líneas):
`supabase/functions/copilot-webhook/index.ts` del worktree `audit-v119` (commit `3a8e3cc`/`bae05ba`).
Referencia histórica: rama v73.1 en `/home/user/qsp-ai-agent-wati`. Prod verificado por API de
management de Supabase (deploy 243) y con SELECTs de diagnóstico sobre `jbigmlcalcwiphqeudxd`.

## 1. Veredicto (3 líneas)

El contrato de abstención está VIVO y más endurecido que en v73 (anti-eco en los 8 caminos de envío, anti-carrera, ráfaga, 'cerrada' blindada tras el incidente del 25-ago), y prod corre EXACTAMENTE la rama (byte-idéntico). Los dos riesgos grandes son de otra naturaleza: **la red de 667 golden tests ya no existe en la rama desplegada** (el espejo TS↔SQL de `es_ack` "lo sostiene la mano" — hoy coincide, lo verifiqué contra prod), y **volvió a entrar trabajo lento ANTES del 200 a WATI** — el puente v119 hace un fetch a la API de WATI (timeout 8 s) síncrono en el camino del webhook, con 4 timeouts REALES registrados hoy mismo (18:13, tres concurrentes del mismo número: la ráfaga derrota el caché de 12 h). Es la misma clase de falla que tumbó el canal el 15-ago; nada está roto hoy, pero el margen contra el timeout de WATI se está gastando en piezas nuevas (v112, v119) y en una mina latente (STT `shadow` síncrono pre-dedup).

## 2. Drift rama ↔ prod

**NO HAY DRIFT — byte-idéntico.** Deploy **243** de `copilot-webhook`
(`ezbr_sha256 cb6d42d0…`), `verify_jwt=false` (correcto para el webhook), un solo archivo
`copilot-webhook/index.ts`. SHA-256 del contenido desplegado = SHA-256 del archivo de la rama
(`f38ea52ac7ce3440…`, 424.553 bytes ambos). El `entrypoint_path` muestra que el deploy salió de un
runner de GitHub Actions (`/home/runner/work/qsp-ai-agent-wati/…`) — la deriva por parches a mano en
prod (el incidente histórico) quedó estructuralmente cerrada mientras se despliegue por CI.
El healthcheck GET directo no fue alcanzable desde esta sesión (proxy 403), pero job_log confirma la
configuración viva: `COPILOT_STT=live`, `COPILOT_SWEEP=live`, burbujas activas, barrido corriendo
(87 `sweep_run` en 4 días) y avisos de desatención saliendo en live.

También verificado en prod: columnas del puente v119 aplicadas (`cerrada_por`,
`no_cliente_revisado_at`, `captura_hasta`), RPC `asistencia_pendientes/5` (firma v73), `es_ack/1`
con vocabulario **idéntico** al `ACK_PALABRAS` del TS (diff exacto TS ↔ migración ↔ función viva en
prod: iguales los tres), y las 7 tablas clave presentes.

## 3. Hallazgos por severidad

*(rutas relativas a `supabase/functions/copilot-webhook/index.ts` del worktree salvo indicación)*

### P0 — ninguno
Nada está rompiendo el canal ni el contrato de abstención hoy.

### P1

**P1-a. Lección v14 violada por v119: fetch a la API de WATI síncrono ANTES del 200, y la ráfaga derrota el caché.**
`index.ts:4244` (llamada en el camino de TODO mensaje de cliente) → `index.ts:2941-2943` (fetch
`getContacts` con `AbortSignal.timeout(8000)`). El sello `no_cliente_revisado_at` se escribe DESPUÉS
del fetch (`:2954` éxito / `:2966` fallo), así que N mensajes en ráfaga = N invocaciones concurrentes
que ven el sello viejo y hacen N fetches de 8 s en paralelo, cada una bloqueando su ACK a WATI.
**No es teórico: pasó hoy.** job_log `no_es_cliente_sync` registra 3 `TimeoutError` para el MISMO
número a las 18:13:55.79 / 18:13:55.82 / 18:13:56.23 y un cuarto de otro número a las 18:14 — cuatro
entregas de webhook que respondieron a WATI después de ~8 s, cuando el timeout de WATI (inferido del
incidente v68.1) ronda los 5 s. Escenario de falla completo: WATI API degradada durante horario hábil
→ cada primer mensaje de cada contacto (caché de 12 h vencido) bloquea 8 s → entregas marcadas `Err`
en serie → WATI desactiva el webhook, exactamente el modo de falla que dejó el bot fuera de servicio
8 horas el 15-ago. Mitigantes reales: el dedup por `wati_message_id` corre ANTES (`:4216`), así los
REINTENTOS son baratos; y el catch sella el caché (un contacto no reintenta el fetch en 12 h).
**Fix sugerido:** sellar `no_cliente_revisado_at` ANTES de hacer el fetch (colapsa la ráfaga
concurrente) y bajar el timeout a ~2-3 s — o mover la consulta a `correrEnSegundoPlano` aplicando la
marca al PRÓXIMO mensaje (el puente tolera un mensaje de retraso por diseño: ya tolera 12 h).

**P1-b. La red de golden tests NO existe en la rama desplegada.**
La v73 tenía `tests/golden.mjs` (1.367 líneas, 667 casos: locks de INTERRUPT_RE/HANDOFF_RE, cédulas
vs SKU, `partirMensaje`, paridad de vocabulario ack TS↔SQL, etc.). En la rama v119 `tests/` solo
contiene `test_shipday_campos.mjs`. El propio código lo admite: `index.ts:3462-3464` — «El golden
test que citaba el comentario viejo (tests/golden.mjs) NO existe en el repo: el espejo lo sostiene la
mano». Escenario de fallo: cualquier edición futura a `ACK_PALABRAS`, a un regex de guardrail o a un
helper puro entra sin contraejemplos que la frenen — la forma exacta de regresión que este proyecto
ya sufrió dos veces (v55, v61.2) y que la suite existía para impedir. Hoy verifiqué a mano que
TS==SQL==prod en `es_ack`; nada garantiza que siga así al próximo commit.
**Fix sugerido:** restaurar `tests/golden.mjs` desde la rama v73 y adaptarlo a los regex/helpers
nuevos (mínimo: paridad `ACK_PALABRAS`↔`es_ack`, INTERRUPT/HANDOFF/PAGOS/COBRO, `soloPideAsesor`,
`partirMensaje`, `esMetaAbstencion`, `coordsDeMaps`).

**P1-c (latente, armada por config). STT `shadow` transcribe síncrono, ANTES del dedup y del ACK — la mina del incidente v68.1 sigue puesta.**
`index.ts:4020-4030`: con `COPILOT_STT=shadow`, `await transcribirAudio(...)` (descarga 20 s +
Whisper 45 s de timeout) corre en el handler, ANTES del insert con dedup (`:4052`/`:4216`) y del 200.
Cada reintento de WATI del mismo audio vuelve a transcribir y a tardar — la secuencia exacta que el
14-15-ago disparó 18 transcripciones del mismo audio y terminó con WATI desactivando el webhook. Hoy
está inerte porque `COPILOT_STT=live` (verificado en job_log), pero el procedimiento documentado del
proyecto para evaluar un modelo STT nuevo (`OPENAI_STT_MODEL`) es justamente «shadow primero»: el
flip de un secreto re-arma el incidente. El comentario (`:4021-4022`) reconoce que es síncrono pero
no la implicación del reintento.
**Fix sugerido:** en shadow, insertar la fila `[audio]` con dedup y responder 200 PRIMERO, y
transcribir/loguear en `correrEnSegundoPlano` (idéntico al camino live) — o retirar el modo shadow y
dejar solo el autotest `?selftest=stt`, que ya lo reemplaza mejor según el propio código.

### P2

**P2-a. Envíos a WATI síncronos antes del ACK en tres caminos fijos (uno NUEVO en v112).**
`index.ts:4432-4452` (aviso de interrupción v112, nuevo), `:4459-4475` (despedida de handoff,
preexistente desde v45 — igual en v73:3069), `:4064-4079` (puente de audio, preexistente v67).
`enviarWati` tiene timeout de 20 s (`:2991`): si el `sendSessionMessage` de WATI se pone lento
(correlacionado con WATI degradado), el ACK del webhook se retrasa hasta 20 s → entrega `Err` →
reintento (el dedup lo absorbe, pero el contador de fallos del webhook en WATI crece). Acotado: son
mensajes fijos, uno por conversación por ventana (30 min el aviso). Escenario: tarde de WATI lento +
varios clientes mandando comprobantes → varios `Err` seguidos sobre el mismo endpoint.
**Fix sugerido:** envolver insert+envío de estos tres caminos en `correrEnSegundoPlano` (el insert
síncrono no es necesario para el dedup del mensaje ENTRANTE, que ya ocurrió arriba).

**P2-b. Puente `no_es_cliente`: quitar la marca tarda hasta 12 h en surtir efecto — un cliente real mal marcado queda mudo ese lapso.**
Respuesta directa a la pregunta de la auditoría: SÍ, un atributo mal puesto silencia a un cliente
real (cualquiera del equipo puede ponerlo desde la ficha en WATI; `sincronizarNoEsCliente` cierra la
conversación en el siguiente mensaje o hasta 12 h después). Y la REVERSIÓN es asimétrica: al quitar
el atributo, `index.ts:2937-2938` salta la re-consulta mientras `no_cliente_revisado_at` tenga <12 h
→ cada mensaje del cliente cae en `conv.status==='cerrada'` (`:4246-4249`) y se ignora hasta que el
sello venza. Escenario: lunes 9:00 marcan por error a un cliente B2B; 9:30 lo notan y quitan el
atributo; el cliente sigue sin respuesta hasta ~21:00. Mitigantes: `?diag=no_es_cliente&seco=0`
(v119.1) fuerza la resincronización YA, y el UPDATE por SQL también — pero ninguno es el camino
natural del equipo de ventas, que es quitar el atributo y asumir que basta. Diseño por lo demás
sólido: solo reabre lo que él mismo cerró (`cerrada_por='wati_atributo'`), exige coincidencia de
teléfono contra el contacto devuelto (filtro `name` difuso, `:2948-2950`), y ante cualquier fallo
ATIENDE (fail-open correcto).
**Fix sugerido:** TTL corto (30-60 min) SOLO cuando `status='cerrada' && cerrada_por='wati_atributo'`
— son poquísimas conversaciones y el costo es mínimo.

**P2-c. El barrido NO aplica `PAGOS_ASESOR_RE` ni `COBRO_RE` — dos versiones de la regla que el propio código jura que no existen.**
El camino reactivo de handoff (v79/v102) bloquea la asistencia con `tocaPagos` y `asesorCobrando`
(`index.ts:4333-4373`); el barrido solo evalúa `INTERRUPT_RE`, `HANDOFF_RE`/`soloPideAsesor` y
`esAck` (`:3621-3630`), mientras su comentario afirma «los MISMOS guardrails … para que no existan
dos versiones de la regla» (`:3447-3449`, `:3622-3623`) — era cierto en v71, dejó de serlo en v79.
Escenario: asesor manda el link de Yappy a las 10:00 y se ausenta; cliente 10:05: «¿puedo pagar con
tarjeta clave?» (no matchea INTERRUPT_RE: es pregunta de método) → el camino reactivo calla BIEN
(`tocaPagos`); a las 10:30 el barrido lo toma como candidato, no chequea pagos ni que el último
mensaje del asesor sea un cobro, y el bot interviene en pleno cierre de venta (el `ASSIST_SUFFIX`
acota el daño a una línea deflectora, pero la política v79 para ese contexto era silencio total). De
paso, esa población (quiere pagar, sin matchear INTERRUPT) tampoco entra al correo de desatención
(`urgentes` solo se llena con INTERRUPT/HANDOFF, `:3626-3629`).
**Fix sugerido:** en el loop del barrido, omitir (y opcionalmente avisar) cuando
`PAGOS_ASESOR_RE.test(rafaga)` o el último mensaje del asesor matchee `COBRO_RE`.

**P2-d. `?captura=1` no respeta `status='cerrada'`: le abre conversación a un proveedor y después ignora sus respuestas.**
`index.ts:3853-3885` activa la ventana y ENVÍA la apertura («¿me comparte la dirección…?») sin mirar
el status; pero la respuesta del cliente entra por el flujo normal y muere en el corte de 'cerrada'
(`:4246-4249`), ANTES del gate de captura (que vive dentro de la rama handoff, `:4307-4314`).
Escenario: un asesor dispara «Captura con AI» sobre el contacto equivocado (justo un proveedor
marcado 'cerrada') → el bot le pide la dirección al proveedor y luego lo deja en visto — la
combinación exacta (preguntar y no escuchar) que el proyecto considera la peor UX. `WA_IGNORAR` sí lo
frena, pero solo para los números del secret, no para cualquier 'cerrada'.
**Fix sugerido:** en `?captura=1`, devolver error si `status='cerrada'` (o exigir `&force=1`).

### P3

**P3-a. Secreto interno hardcodeado.** La key de la función `geo-fallback` está escrita literal en
`index.ts:2402` (cliente) y en `supabase/functions/geo-fallback/index.ts:14` (servidor) — no la cito
por política. Radio de daño bajo (función interna con caché y tope diario), pero es un secreto en el
repo y en dos lugares que pueden desincronizarse. El default muerto de `COPILOT_WEBHOOK_KEY` sigue en
código (`index.ts:425`) — documentado, el healthcheck lo delata (`webhook_key_es_default`); retirarlo
sigue pendiente desde v45. (Nota relacionada, aceptada por diseño: las keys de webhook/watchdog van
en texto plano dentro de `cron.job` — visibles a cualquier lector SQL.)

**P3-b. El barrido corre hasta 10 asistencias LLM en serie DENTRO del request** (`index.ts:3607-3646`
+ `:3842-3845`): con candidatos lentos puede acercarse al límite de wall-clock del runtime, y si
pg_net corta la conexión no hay garantía documentada de que el isolate termine — un corte a mitad
dejaría candidatos sin atender y SIN la fila `sweep_run` final (hueco de telemetría). Hoy funciona
(87 `sweep_run` completos en 4 días). Fix barato: responder 200 al cron de una vez y correr el
barrido en `correrEnSegundoPlano`, o loguear `sweep_run` incremental.

**P3-c. Texto fijo que contradice al propio prompt.** `index.ts:3403` responde «Ya quedó anotado su
mensaje…» fuera de horario, y el SYSTEM_PROMPT (`:687`) PROHÍBE exactamente «quedó anotado» porque
hace creer que alguien actuó. Aquí es semi-verdad (hay fila en `handoffs` si el handoff fue por
keyword), pero es el mismo fraseo que el proyecto vetó tras el caso de la oficina 454.

**P3-d. Métricas que se leen distinto tras v112.** El aviso fijo de interrupción inserta una fila
assistant → en `resumen_diario` ese cliente cuenta como «atendido» y sale de la lista «sin
responder», aunque solo recibió una promesa enlatada. La población NO queda ciega — verificado que el
watchdog la cubre por otra vía (`aviso_facturacion` lee `abstencion_interrupcion` de job_log y
chequea si un asesor escribió después) — pero el número «atendidos» del resumen queda inflado y quien
audite «sin responder» ya no los ve ahí. Menor, documentarlo. (Relacionado: `asistencia_handoff` del
barrido sin-asesor loggea `mins_sin_humano: 0` — el RPC manda null y el código lo colapsa a 0; y
`envio_timeout` cuenta como entregado con `ok:false` — ambiguo para dashboards, ya comentado en
código.)

## 4. Invariantes históricos verificados VIVOS en v119.1

- **Anti-eco insert-antes-de-enviar con `model` explícito en LOS OCHO caminos de envío**: normal
  (`:4618`), burbujas — una fila POR burbuja, aborta si falla (`:4639-4655`), asistencia (`:3422-3426`),
  respaldo v23 (`:4683-4686`), despedida handoff (`:4466`), aviso v112 (`:4442`), puente de audio
  (`:4068`, `:4523`), apertura de captura (`:3873`). Chequeo de eco null-safe (`:3960-3962`).
- **Lección v14 en el camino del LLM**: debounce, historial, visión, PDF, STT live y el LLM corren en
  `correrEnSegundoPlano` tras el 200 (`:4481-4701`); dedup síncrono antes (`:4216-4219`). (Las
  excepciones nuevas son los hallazgos P1-a/P1-c/P2-a.)
- **Anti-duplicado pre/post-LLM + debounce de ráfaga** (`:4489-4491`, `:4599`) y **anti-carrera**
  (post-debounce `:4494-4495`, pre-envío `:4601-4602`; en asistencia: `asesor_volvio` + status
  re-chequeado `:3410-3418`).
- **INTERRUPT_RE/HANDOFF_RE intactos** (todas las formas v42-v70 presentes, ninguna retirada), y la
  anti-interrupción evalúa la **RÁFAGA completa** en normal y handoff (`:4299`, `:4411`); sobre una
  nota de voz transcrita se RE-EVALÚAN los guardrails (`:4510-4516` normal, `:4290-4292` handoff).
- **`cerrada` blindada** (v115): un asesor que escribe no la promueve a handoff (`:3973`, `:3989`);
  el cold-return no la toca; el puente de audio la respeta (`:4059`); `WA_IGNORAR` en la puerta de
  salida única (`:2984-2987`).
- **`soloPideAsesor` + `PIDIO_ASESOR_SUFFIX`** (v73) vivos (`:944-950`, `:3627-3635`); `es_ack` con
  vocabulario idéntico TS ↔ migración ↔ **función viva en prod** (verificado por diff exacto hoy).
- **Grounding y aritmética en código**: ITBMS solo en `conItbms`/`calcularCotizacion` (centavos, 7%
  una vez)/`conImp`/`bloqueConfirmacion`; oferta y stock calculados en código; `frasearPedido` NO pasa
  `total_usd`/`estado_raw` al modelo (F1 intacto; `compras_anteriores` solo nombres); folleto con
  allowlist `cdn.shopify.com`; media con allowlist `*.wati.io`; `FACTS_PRIVADOS` fail-closed; guard
  anti-fuga de tool-call + `esMetaAbstencion`; tope de turnos, tope de payload 256 KB, clamp de MODE,
  y **todas las tools devuelven errores honestos que derivan** (verificado una a una).
- **Tools de v119.1 (10)**: buscar_producto, info_tienda, guardar_lead, guardar_datos_envio,
  sucursales_interior, tarifa_entrega, estado_pedido, asesorar_impresora, calcular_cotizacion,
  consultar_folleto. `guardar_lead` sigue FUERA de asistencia y captura.
- **Invariantes MUTADOS a propósito (no bugs, dejar constancia)**: la asistencia ya no exige 15 min de
  silencio del asesor (v79, «por contexto, no por reloj») e incluye `tarifa_entrega`,
  `guardar_datos_envio` y `asesorar_impresora` (v84/v105) — el contrato v47/v50 («cotizar envío
  compromete» / «reloj de 15 min») fue reemplazado por guardas de contexto nuevas (PAGOS_ASESOR_RE,
  COBRO_RE, v110 sin-tool-con-asesor-activo, v111 anti-relleno). Con 951 `asistencia_handoff` en 4
  días, la asistencia es hoy un canal PRINCIPAL, no una excepción — cualquier auditoría futura debe
  mirarla con el mismo rigor que el flujo normal.

## 5. Qué NO pude verificar y por qué

- **El timeout real del webhook de WATI** (lo infiero en ~5 s del incidente v68.1) y **si WATI
  acumula timeouts esporádicos hacia la desactivación del webhook** o solo consecutivos — no hay
  documentación accesible desde esta sesión; condiciona la urgencia de P1-a/P2-a.
- **El healthcheck GET en vivo** (el proxy de red de la sesión bloquea el dominio con 403) —
  compensado con el byte-diff del deploy 243 y con job_log (STT live, sweep live, burbujas on).
- **El comportamiento del Edge Runtime si pg_net corta la conexión del barrido a mitad** (¿el isolate
  termina o muere?) — no comprobable sin experimentar; la evidencia indirecta (87 `sweep_run`
  completos) sugiere que hoy termina.
- **Los secretos vivos** (valores de `WA_IGNORAR`, allowlist, etc.) — no son legibles por diseño;
  solo sus efectos en job_log.
- **Las demás Edge Functions y los RPC de despacho** (watchdog, wati-order, shipday-status,
  geo-fallback, ficha-pdf, specs-centinela) — son de otros frentes; del watchdog solo verifiqué lo
  necesario para P3-d (`avisarFacturacionSinAtender` cubre la población de abstenciones), y noto que
  esta rama solo trae migraciones desde el 19-ago: la historia SQL previa (pedidos, zonas,
  `asistencia_pendientes`) vive únicamente en prod, verificada por firma (`/5`) pero no por
  definición completa.
