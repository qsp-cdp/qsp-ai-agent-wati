# Auditoría de contexto — ¿el bot alucina? (25–27 ago 2026)

Pregunta de Isaac: cómo interactúan cliente, asesor humano y bot, y si el bot está alucinando o
contestando correctamente. Disparada por dos casos reales del 27-ago. Ventana: lunes 25 a miércoles
27 (hasta ~17:00). Método: dos frentes de solo lectura sobre Postgres de prod
(`frente-a-interaccion.md` = mapa de actores · `frente-b-alucinaciones.md` = revisión de los 861
turnos LLM del bot), más verificación puntual contra el catálogo Shopify.

## La respuesta corta

**861 turnos del bot · 5 alucinaciones confirmadas → 99,4 % limpio.** En los ~340 turnos con
precio/stock: **cero datos inventados y cero errores de aritmética** — todo trazable a una tool del
mismo turno. El bot casi nunca inventa DATOS. Cuando falla, falla en otra cosa: en decidir **de qué
producto se está hablando** (identificación) y, en modo asistencia, en **afirmar acciones que no
hizo** ("su correo quedó guardado" sin haber llamado ninguna tool de escritura).

## Los dos casos que trajo Isaac — mecanismo confirmado

**Camila (50764156725, mié 10:50).** No fue la visión: la imagen de la HP 9730 la mandó EL ASESOR, y
el bot no puede ver la media del asesor por diseño. Ante "¿Esa imprime a color?", resolvió el "esa"
con lo único que él veía —su propia Epson WF-C5810 ofrecida 4 min antes— y respondió sobre ella.
Tercera capa (verificada contra Shopify): la **HP OfficeJet Pro 9730 SÍ está en el catálogo** (activa,
5 uds, $395, título "Ideal para Formatos Grandes 11 X 17") y la búsqueda del bot no la trajo → declaró
"no tenemos 11x17" teniéndola. El asesor rescató la venta con la impresora correcta.

**K3ymib (50760466239, mié 11:49).** Conversación entera sobre la HP Laser 107A (tóner W1105A, sin
versión XL). El cliente adjuntó un PDF escaneado ("Esta impresora") y el bot respondió sobre una
LaserJet M428 con el CF258X ($299.60): identificó **el escáner que produjo el PDF** (las MFP de HP
estampan su modelo en el documento), no la impresora de la conversación, y pisó sin avisar el modelo
que el cliente había establecido 24 min antes. Un turno antes había hecho LO CORRECTO (preguntar el
modelo). El asesor corrigió a los 5 min.

## Las 5 alucinaciones (de 861 turnos)

| # | Cuándo · quién | Qué pasó | Clase | ¿Corregida? |
|---|---|---|---|---|
| 1 | mié 10:50 · Camila | "Esa" → respondió sobre SU Epson, no la HP de la imagen del asesor | Identificación (deíctico sobre media del asesor) | No (sin daño directo) |
| 2 | mié 11:49 · K3ymib | PDF escaneado → recomendó tóner de la impresora EQUIVOCADA ($299.60) | Identificación (metadata del escáner) | Asesor, a los 5 min |
| 3 | lun 11:19 · Pilar Conte | "ese correo ya quedó guardado" — falso (`lead_capturado` sin email) | Falsa captura (asistencia, sin tool) | No |
| 4 | mar 14:35 · Dental Pro | "correo anotado 📩" — falso (cero `lead_capturado`) | Falsa captura (asistencia, sin tool) | Asesor cerró él mismo |
| 5 | mié 16:16 · Vielka | "quedaron guardados su nombre y correo" — falso | Falsa captura (asistencia, sin tool) | Asesor activo |

Patrón nítido: **las 3 falsas capturas son todas de MODO ASISTENCIA sin llamada a tool de
escritura**; en flujo normal, las ~20 afirmaciones de "quedó guardado" restantes van TODAS pareadas
con un `guardar_lead`/`guardar_datos_envio` real (verificado una por una).

## El mapa de interacción (los 3 números que lo cuentan)

- **El bot es la primera línea**: abre el 98 % de las conversaciones compartidas, responde con
  mediana de **18 segundos** (asesor: 3,9 min, p90 26 min) y atiende solo el 20 % de las
  conversaciones de punta a punta. Tras "quiero un asesor", el humano llega con mediana **~26 min**
  (colas de 44–63 min).
- **El asesor manda MÁS media que los clientes** (258 vs 191 piezas en 3 días — cotizaciones PDF y
  promos, el material de CIERRE) y el bot no ve nada de eso. De ahí salió el caso Camila, la
  asistencia que le pidió al cliente "comparta la foto" que el propio equipo había mandado, y una
  cotización B2B de ~$4.500 que murió sin respuesta (mar 16:33, 50761681128).
- **77 cruces bot↔asesor <2 min** en 3 días — casi todos REDUNDANCIA (los dos contestan lo mismo),
  solo 1 contradicción real (caso 2). El relevo transfiere al cliente pero no el contexto: el B2B
  tuvo que re-pegar su pedido completo.

## Hallazgos de sistema (fuera de las alucinaciones)

1. **El barrido mastica "cierres" en bucle.** `es_ack` SÍ funciona; lo que inunda la cola son cierres
   de conversación ("Así será", "Le agradezco", "Muchas gracias joven") — la migración del 25-ago
   creó `es_cierre_conversacion` y la cableó SOLO en `resumen_diario`, no en `asistencia_pendientes`.
   El correo dejó de listarlos pero el barrido los re-evalúa con el LLM cada 20 min por 24 h: ~200
   llamadas/día que devuelven vacío; un cliente evaluado 41 veces en un día. **Tercera aparición de
   la forma v73.1** (dos RPC que comparten una regla, actualizada en un solo lado). Fix: una línea en
   el RPC + vocabulario ("joven", "agradezco", "así será").
2. **La cola `handoffs` no la lee nadie**: 78/78 registros de la ventana siguen `resuelto=false`.
3. **Fugas de forma** (3 días): 2 mensajes salieron al cliente con el rótulo interno
   `[Asesor del equipo]:`; 1 deliberación interna filtrada ("Lo más honesto es no adivinar…"); 1
   tool-call corrupta guardada (input con sintaxis XML dentro del JSON, caso Camila 10:46).
4. **Data**: el título de la tinta HP 711 CZ129A dice "29 ml" (la negra real es de 38 ml) — corregir
   en Shopify.

## Guardrails que cerrarían cada clase (propuesta)

1. **Deíctico sobre media del asesor** (clase del caso 1): pre-LLM en asistencia — si el último media
   del hilo es de `human-agent` y el cliente pregunta con "esa/esta/ese" sin nombrar modelo, instruir
   "no puedes ver ese adjunto: pide el modelo o difiere". El bot YA sabe hacerlo (25-ago 14:56
   respondió exactamente eso); falta forzarlo.
2. **Falsa captura en asistencia** (clase de 3-5): lint de salida estilo v44 — respuesta que matchea
   "quedó guardado/anotado/registrado" SIN `guardar_lead`/`guardar_datos_envio` en el turno →
   reescribir/bloquear; + línea dura en `ASSIST_SUFFIX`.
3. **PDF ≠ "esta impresora"** (clase del caso 2): regla de prompt — el modelo del PDF identifica al
   ESCÁNER; si un documento sugiere un modelo distinto al ya establecido en la conversación,
   PREGUNTAR antes de sustituir.
4. Los de sistema: `es_cierre_conversacion` en el RPC del barrido; strip determinista del prefijo
   `[Asesor del equipo]:`; decidir el destino de la cola `handoffs`.
