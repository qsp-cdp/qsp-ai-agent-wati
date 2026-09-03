# Frente A — Mapa de interacción cliente · asesor · bot (25–27 ago 2026)

Fuente: Postgres del proyecto `jbigmlcalcwiphqeudxd` (solo `select`). Ventana: `created_at >= '2026-08-25T05:00:00Z'`
(lunes 00:00 Panamá) hasta el momento de la consulta (miércoles 27-ago por la tarde). Horas en hora de Panamá.
Nota: el miércoles estaba EN CURSO al medir; sus números de cierre de día son provisionales.

---

## 1. Volumen y reparto

**Mensajes por día** (`group by (created_at at time zone 'America/Panama')::date, actor`):

| Día | Convs activas | Cliente | Asesor | Bot (total) | Bot normal | Bot asistencia | Bot aviso-interrupción | Bot handoff-fijo |
|---|---|---|---|---|---|---|---|---|
| Lun 25 | 100 | 610 | 331 | 398 | 332 | 55 | 9 | 2 |
| Mar 26 | 86  | 674 | 357 | 380 | 324 | 41 | 9 | 6 |
| Mié 27 | 87  | 557 | 272 | 342 | 270 | 56 | 11 | 5 |
| **Total** | **236 distintas** | **1.841** | **959** | **1.120** | 926 | 152 | 29 | 13 |

- El bot emite el **54%** de todas las respuestas (1.120 de 2.079 mensajes assistant); el asesor el 46%. En volumen bruto van casi parejos, pero cubren trabajos distintos (ver mapa, §6).
- **Quién atendió cada conversación** (bool_or por conversation_id + join a `conversations.status`):
  - **Ambos** (bot y asesor): **185** convs (78%) — 182 terminan en `handoff`, 2 en `bot`, 1 `cerrada`.
  - **Solo bot**: **48** convs (20%) — todas terminan en `bot`.
  - **Solo asesor**: 3 convs.
  - **Nadie respondió** (solo mensajes de cliente en toda la ventana): **0**.
- En las 185 conversaciones con ambos actores, **el bot habló primero en 181 (98%)**: el bot es la primera línea universal y el asesor entra después. Solo 13 de esas entradas fueron por keyword del cliente ("asesor/agente", `model='handoff-fijo'`); el resto fue el asesor escribiendo por su cuenta (`mensaje_humano`: 960 eventos).

## 2. Dinámica del handoff

- **Vías de entrada**: 13 por keyword (tabla `handoffs` origen `keyword` = 13, cuadra con los 13 `handoff-fijo`); el resto de las ~171 transiciones fue el asesor entrando a escribir (owner=true). Además hubo **65 tickets `bot_promise`** en `handoffs` — y **los 78 registros de la ventana siguen `resuelto=false`**: nadie trabaja esa cola (la lección del caso Anaiska, intacta un año después).
- **Cold-returns**: 100 eventos `handoff_cold_return` en 3 días — un tercio del parque conversacional vuelve al bot cada día tras 24 h sin asesor. El ciclo bot→asesor→bot es la norma, no la excepción.
- **Tiempos de respuesta al cliente** (hueco entre un mensaje de cliente y la respuesta inmediata siguiente, `lag()` por conversación):
  - **Bot**: 958 respuestas, mediana **0,3 min**, p90 0,4 min.
  - **Asesor**: 245 respuestas, mediana **3,9 min**, p90 **25,9 min**, 8 casos >1 h.
- **Cuando el cliente pide humano explícitamente** (~15 casos limpios): el bot acusa al instante y el humano llega con mediana **~26 min** — con colas de 44 min (Pilar, lun 11:19), 56 min (":)", mar 8:11), 63 min (Rock Industries, mar 13:03), 42 min y reintento (BAIC Panamá, mar 13:19 y 17:21).
- **Asistencia dentro del handoff** (`asistencia_handoff`: 860 eventos, 124 clientes distintos): **152 enviadas** (18%) — origen: 69 `reactiva`, 54 `continuacion`, 15 `barrido`, 12 `captura`, 1 `audio_handoff`, 1 `asesor_pidio_envio` — y **708 evaluaciones que terminaron en silencio** (626 `sin_respuesta` = el modelo corrió y devolvió vacío; 77 `sin_tool_asesor_activo`). En **75 de las 152 asistencias (49%) el asesor escribió en los 30 min siguientes**: la asistencia funciona como puente, pero convive muy pegada a la voz humana.
- **¿El asesor contradijo al bot?** Muestreo de mensajes humanos "correctivos" tras un mensaje del bot (regex "no contamos/solamente/no es así/disculpe la información…", <45 min): 4 hits, leídos:
  - 🔴 **Contradicción real — 50760466239 (K3ymib), mié 11:48–11:54**: en asistencia, el cliente pregunta si el tóner de su HP Laser 107A tiene versión de mayor capacidad; manda un PDF, y el bot responde "Sí existe: … CF258A (58A) … versión de mayor rendimiento" — **familia de impresora equivocada** (la 107A usa W1105A). El asesor corrige 5 min después: *"solamente existe este modelo de toner, no hay de mas capacidad"*.
  - ✅ Concordancia — 50768819070 (IMÁGENES DIGITALES, mar 11:39–11:47): bot honesto ("no encontré tóner Ricoh MP C407") + captura el correo; asesor confirma 1 min después lo mismo. Duplicación leve, cero contradicción.
  - Los otros 2 ("EH" mar 10:55; "IB" mar 13:30) son el asesor cerrando un "no tenemos" que el bot ya había insinuado.

## 3. El barrido y los correos

- **`sweep_run`**: 24 corridas/día (72 en total), ninguna vacía. Candidatos→atendidos→omitidos: lun **187→187→0**, mar 113→110→3, mié 119→113→6 (omitidos = guardrail `interrupcion`, correcto: p.ej. un comprobante PDF).
- **El barrido mastica acks en bucle**: la muestra del lunes trae "oks", "Gracia", "Ah ok 👍🏻", "gracias, le avisamos" como candidatos con hasta 1.426 min de espera. Verificado en vivo: **`es_ack()` existe en prod, devuelve `true` para esos textos, y `asistencia_pendientes` la referencia** — y aun así siguen saliendo como candidatos (o la función desplegada no la aplica a toda la población, o el barrido de v119 no usa ese filtro en la rama que corre). Consecuencia medible: **419 evaluaciones para 15 asistencias de barrido enviadas**; el cliente 50768489164 fue evaluado **41 veces** (9:00→16:40, 1 envío), y otros 5 clientes 24-26 veces cada uno. ~200 llamadas al modelo por día que terminan en `sin_respuesta`.
- **Frases-cierre que no son acks** engordan la cola todo el día: "Excelente le confirmo mañana", "Le agradezco", "Así será", "Muchas gracias joven" — `es_ack` da `false` para todas (verificado) y quedan 24 h como candidatos.
- **`desatencion_avisada`**: 5 avisos / 4 correos (mar 12:40 ×1; mié 9:20, 13:00 y 16:00 ×2), todos `interrupcion` (pago/reclamo), esperas 26–40 min. El circuito de "el bot no puede, que se entere un humano" está VIVO y con volumen sano.
- **Clientes sin respuesta de nadie al cierre del día** (última fila del día = user, filtrando acks con `es_ack`): lun **6**, mar **8**, mié **9** (provisional). Leídos los 14 de lun-mar: la mayoría son cierres blandos que no exigen respuesta ("Voy en camino", "ok paso en un rato", "le confirmo mañana"). Los genuinos:
  - **50764292128 (E.S.P), lun 17:09**: *"Ooo encerio y ese sria el precio?"* — pregunta de PRECIO sin respuesta; venía de una imagen de promo **que mandó el asesor** y el bot no puede ver (ver §5).
  - **50761681128 ("."), mar 16:33**: cliente B2B repite *"me cotiza 12 [impresoras de $374.50]"* + *"juego de 4 tintas x 10 cajas"* — nadie contestó ese día; a la mañana siguiente (9:00) el barrido respondió **confundiendo las dos preguntas en una** ("No encuentro un producto exacto a $374.50 con esa descripción de juego de 4 tintas"). Una venta de ~$4.500 atendida así.
  - **50767355040 (mnc), mar 16:29**: *"si por fa"* — aceptó un ofrecimiento y quedó en el aire.

## 4. Fricciones entre actores

- **Cruces bot↔asesor con <2 min de diferencia: 77, en 50 conversaciones** (27% de las 185 compartidas tuvo al menos uno). Muestreados y leídos:
  - **50768100470 (Arq. Valdespino), lun 12:00**: bot responde "El envío a Bella Vista es B/.6.00 + ITBMS = B/.6.42" y **8 segundos** después el asesor manda "$6.00 + ITBMS" — la misma respuesta dos veces; luego el asesor adjunta cotización y el bot todavía agrega un "Confirmo: en Bella Vista…".
  - **50767503374 (Jona), lun 15:11**: bot: "No veo que me haya llegado la imagen… ¿qué modelo quiere?" y **6 segundos** después el asesor: "que modelo ?" — ambos preguntando lo mismo a la vez.
  - **50763565964 (~💻), lun 11:24**: bienvenida del bot → 52 s → asesor "¿Como puedo ayudarle?" → 46 s → bot responde la pregunta real del cabezal. Tres voces intercaladas en 2 minutos.
  - **50769171110, lun 14:04**: bot manda el link de Maps → 51 s → asesor repite horario+ubicación → bot remata con la regla de "no puedo apartar productos".
  - **50766703397 (M), lun 10:22**: asesor: "la 711 negra xl está disponible, pase a retirar" → 97 s → asistencia del bot con el detalle de la misma 711 CZ133A. **Complementario, no contradictorio** — pero dos voces en 90 s.
  - El patrón dominante del cruce NO es contradicción sino **redundancia**: el asesor entra con "Buenos días / ¿En qué puedo ayudarle?" justo cuando el bot ya está resolviendo (los 15 min de gracia de la asistencia y el owner=true se pisan en la franja 11:00–15:00).
- **Cliente pidió humano y el bot siguió**: el diseño v73+ ("le adelanto mientras llega el asesor") se cumple sin descontrol — tras el keyword el bot manda el `handoff-fijo` y calla; los casos donde "volvió a hablar" son asistencias legítimas ≥15 min (p.ej. K3ymib §2 — que salió mal por CONTENIDO, no por hablar). En Compras Cattan (mié 9:36, "Necesito al asesor urgente") el humano llegó a los 6 min y el bot metió una asistencia a los 11 — cruce menor.
- 🐛 **Fuga del rótulo interno**: 2 mensajes `assist-handoff` en modo **live** salieron al cliente empezando con **"[Asesor del equipo]:"** (lun 14:47 a 50767417632 y lun 15:12 a 50767503374) — el modelo imitó la etiqueta con que se le marca el historial. Cosmético pero es texto interno llegando al cliente.
- Señales nuevas de v119 que amortiguan fricción: `asesor_cobrando` (96 eventos — silencia al bot cuando el asesor está cobrando), `interrupcion-aviso` (29 mensajes "un asesor continúa con usted" en vez de silencio mudo ante pago/fiscal), `abstencion_interrupcion` 42, `abstencion_meta` 24, `descartado_handoff_tardio` 4 (anti-carrera trabajando).

## 5. Media: el punto ciego más grande

Conteo (`media_url` en user; content `[image]`/`[document]` con `model='human-agent'`):

| Quién | Total | Imágenes | Documentos/PDF | Audios |
|---|---|---|---|---|
| Cliente | 191 | 117 | 24 | 19 (18 transcritos) |
| **Asesor** | **258** | 66 | **192** | — |

- **El asesor manda MÁS media que el cliente** (258 vs 191 en 3 días; ~86/día). Son cotizaciones PDF y capturas de promos — el contenido comercial de cierre — y **el bot no ve ninguna**: cuando el cliente responde sobre ese material, el bot contesta a ciegas.
- Caso ilustrativo completo — **50764292128 (E.S.P), lun**: asesor manda 2 imágenes + "estas dos canon estan en promo hasta septiembre" (16:23) → cliente: "Aqui m aprece esta..." (16:42) → la asistencia responde *"cuénteme cuál es el modelo o comparta la foto"* — pidiéndole al cliente lo que YA está en el hilo → cliente insiste "¿y ese sería el precio?" (17:09) → silencio hasta el día siguiente.
- Del lado positivo: los 24 PDF de cliente ya se procesan (`pdf_cliente`: 8 eventos) y 18/19 audios se transcribieron (`audio_transcrito`) — la ceguera que queda es asimétrica: es hacia lo que manda EL PROPIO EQUIPO.

## 6. El mapa de un día típico

Con el martes 26 como día tipo (86 conversaciones, 1.411 mensajes):

- **Cliente**: 674 mensajes (48% del tráfico).
- **Bot**: 380 respuestas (27%) — pero cubre el **80% de las PRIMERAS respuestas** (958 vs 245 en la ventana) con mediana de 18 segundos. Es la primera línea en el 98% de las conversaciones y el único actor en el 20% de ellas (48 convs que nunca necesitaron humano).
- **Asesor**: 357 mensajes (25%) — concentrado en las 185 conversaciones compartidas: cierra venta, cotiza en PDF (64 documentos/día) y maneja pago/factura. Mediana 3,9 min cuando responde directo, p90 26 min.
- **Los huecos** (cliente esperando): (a) la cola post-"quiero asesor" — mediana 26 min, colas de 44–63 min; (b) la franja 16:30–17:00 — los 3 casos genuinos sin responder de lun-mar murieron ahí, cuando el asesor suelta el teclado y la asistencia ya habló o no aplica; (c) preguntas sobre media del asesor, que el bot no puede rescatar (§5).
- **Los choques** (dos respondiendo): la franja 11:00–15:00, en el minuto en que el asesor entra a una conversación que el bot tiene caliente — 77 cruces <2 min en 3 días, casi todos redundancia ("Buenos días, ¿en qué le ayudo?" sobre una consulta ya en curso) y no contradicción (1 contradicción real hallada, K3ymib).
- **El sistema de vigilancia** (barrido + correos) funciona pero con desperdicio: 24 corridas/día, ~140 evaluaciones/día, ~5 asistencias útiles/día y ~200 llamadas al modelo/día que devuelven vacío porque la cola está llena de acks y frases-cierre que el filtro no reconoce.

---

## Los 3 patrones de interacción más importantes

1. **Relevo sin traspaso de contexto.** El bot arranca el 98% de las conversaciones compartidas y el asesor entra SIN leer lo acumulado: pregunta "¿en qué puedo ayudarle?" sobre consultas ya especificadas (caso B2B 50761681128: el cliente tuvo que re-pegar su pedido de 12 impresoras; 77 cruces redundantes en 3 días). El traspaso bot→humano transfiere el CLIENTE pero no el CONTEXTO, y el cliente paga el peaje repitiéndose.

2. **La media del asesor es un agujero de contexto estructural.** El asesor comunica el cierre comercial en PDF/imagen (258 piezas en 3 días, más que los clientes) y el bot queda ciego justo en la fase de mayor valor: responde "compárteme la foto" sobre una promo que su propio equipo acaba de mandar, y una pregunta de precio muere sin respuesta (E.S.P). La asistencia post-15-min opera con un hilo al que le falta la mitad comercial.

3. **El barrido vigila, pero mastica ruido.** El círculo detecta y avisa lo crítico (5 desatenciones de pago/reclamo, esperas 26–40 min — sano), pero re-evalúa con LLM los mismos acks y frases-cierre cada 20 min durante horas (un cliente 41 veces/día; 419 evaluaciones→15 envíos), pese a que `es_ack()` en prod SÍ reconoce esos textos: el filtro no está actuando donde corre v119. Y el único rescate de fondo que salió mal (respuesta del barrido al B2B a la mañana siguiente) falló por leer una ráfaga de 3 mensajes como una sola consulta.

## Recomendaciones para Isaac

1. **Cablear el filtro de acks en el RPC que de verdad corre en prod** (la lección v73.1 otra vez): `not es_ack(content)` antes del limit en la población del barrido, y ampliar el vocabulario con las frases-cierre reales de esta semana ("le confirmo mañana", "le agradezco", "así será", "quedo atento", tratamientos como "joven"). Ahorro directo: ~200 llamadas/día al modelo y una cola que sí significa algo.
2. **Un resumen de traspaso al entrar el asesor** (una línea en WATI o nota interna: qué pidió, qué cotizó el bot, qué falta) — es la contraparte del clasificador que ya está en el backlog; mataría a la vez la redundancia de los 77 cruces y el "¿qué es lo que requiere?" a clientes que ya lo dijeron.
3. **Cerrar el punto ciego de la media del asesor**, aunque sea en versión mínima: guardar un caption/etiqueta cuando el asesor manda [document]/[image] (o pasar el PDF de cotización por el mismo lector `pdf_cliente` que ya existe) para que la asistencia no pida al cliente lo que el equipo ya mandó.
4. Dos arreglos puntuales: (a) la fuga "[Asesor del equipo]:" en `assist-handoff` (2 casos live — un strip determinista del prefijo antes de enviar, como `limpiarWhatsApp`); (b) un vistazo a la cola `handoffs` (78/78 sin resolver): o alguien la lee, o que el aviso de desatención sea su único consumidor oficial y se documente así.
