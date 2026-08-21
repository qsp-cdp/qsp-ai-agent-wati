# Diccionario de frases reales — "machine learning manual"

Idea del negocio (21-ago-2026): en vez de inventar los patrones que activan al bot, **minarlos de las
conversaciones reales**. Cinco agentes escanearon los 3 meses de historial en `messages`
(30,940 mensajes de clientes + 14,521 de asesores humanos, 12-jun → 21-ago-2026), deduplicando por
`lower(trim(content))` y clasificando por frecuencia. Todo anonimizado: sin nombres, teléfonos,
direcciones ni montos reales.

Los cinco entregables completos viven en `docs/diccionario/` — cada uno con tablas frase→frecuencia,
ambiguos reales, regex propuesto y lista de prueba:

| Archivo | Categoría | Corpus que cubre |
|---|---|---|
| `asesor-pide-direccion.md` | El ASESOR pide dirección/ubicación/datos de entrega | ~65 frases distintas, ~215 mensajes |
| `cliente-intencion-envio.md` | El CLIENTE pide envío o da su dirección cruda | ~2,038 + 391 mensajes |
| `cliente-pedido-cotizacion.md` | Pedido / cotización / precio / disponibilidad | ~5,896 mensajes (~20% del tráfico) |
| `cliente-cierre-gracias.md` | Acks, cierres, saludos (cuándo NO responder) | 17,859 mensajes cortos analizados |
| `pagos-quejas-silencio.md` | Pagos, facturación, quejas, descuentos (bot calla) | ~1,970 mensajes en las redes |

## Qué ya se aplicó al código (v101)

1. **`PIDE_ENVIO_RE` reescrito con la evidencia** (copilot-webhook). El regex de v100 (escrito de
   memoria) tenía falsos negativos con la familia real más común ("¿dónde es/sería la entrega?",
   "a que dirección desea el envío?" n=70) y falsos positivos graves: la red ancha
   `artículo + dirección/ubicación` matcheaba "las entregas tienen un costo adicional según la
   ubicación", "guardamos tu dirección ✅" (n=12) y "va en ruta hacia su ubicación" — cada uno habría
   abierto una captura sin que nadie pidiera nada. El nuevo pasa 42/42 frases de prueba (26 reales +
   sintéticas que piden, 16 que no).
2. **`NEEDS_TOOL_RE` y `BASIC_INFO_RE`**: se añadieron "encomienda" y "lo(s) traen / tráigan"
   — formas reales de pedir envío que ninguna red cubría ("favor incluir el costo de la encomienda
   hacia <lugar>", "eso lo traen hoy mismo?").

## Hallazgos que piden cambios FUTUROS (no aplicados aún)

Por orden de valor:

1. **Autoresponders de otros negocios** (`cliente-cierre-gracias.md` §2c): ~60 mensajes `role='user'`
   son bots de otras empresas ("gracias por comunicarte con X… ¿cómo podemos ayudarte?"). Contienen
   `?`, así que las reglas "pregunta → responder" pueden armar un loop bot-a-bot. Patrón de detección:
   `^gracias por (comunicar|contactar|escribir|(tu|su|el) mensaje)`. Dónde aplicaría: `es_ack` (barrido)
   y el filtro de contenido del flujo normal.
2. **Avisos de pago no son acks** (`cliente-cierre-gracias.md` §2a): "listo el pago" (n=7), "pagado"
   (n=6), "pago realizado" (n=4) son cortos y sin pregunta — parecen cierre pero exigen confirmación
   HUMANA de recibo. Hoy `es_ack` podría tragárselos; deberían escalar al asesor (ticket), no callar.
3. **Señal de "cobro en curso" del lado del asesor** (`pagos-quejas-silencio.md` §2): los 3 mensajes
   más repetidos de TODO el corpus del asesor son los datos bancarios (n=673), el link de Yappy (n=461)
   y "factura emitida" (~380). Si el último mensaje del asesor matchea
   `factura emitida|voy facturando|link\.yappy|cuenta de ahorro|nota de cr[eé]dito|devoluci[oó]n`,
   el bot debería quedar mudo en esa conversación hasta que el humano cierre (hoy `tocaPagos` solo mira
   el mensaje del CLIENTE).
4. **Recompra por historial** (`cliente-pedido-cotizacion.md` §5): "lo mismo de la última vez",
   "la de siempre", nº de cotización previa, "verifica mi compra anterior" — nunca nombran el producto.
   Necesita una tool de últimas compras/cotizaciones por teléfono (hoy `estado_pedido` solo ve pedidos
   en curso). Variante clave: recompra con delta ("lo mismo pero sin el toner de canon").
5. **CTA del anuncio** (`cliente-pedido-cotizacion.md` §3 #17): "hola! quiero información 🙂" y
   variantes son ~524 mensajes — es la plantilla del anuncio click-to-WhatsApp, intención genérica SIN
   producto. Match exacto de plantilla → flujo de bienvenida/calificación, no búsqueda de catálogo.
6. **Producto pelado** (`cliente-pedido-cotizacion.md` §2): "canon g4110", "2 unidades", URL de la
   tienda, foto + "tienen esta?" — intención de compra sin ninguna palabra clave. El LLM ya los maneja
   en modo bot; el hueco es el gate de ASISTENCIA en handoff (NEEDS_TOOL_RE cubre marcas/códigos, así
   que el hueco real es pequeño: cantidades solas tipo "2 unidades" y demostrativos con foto).
7. **Tokens polisémicos de pagos** (`pagos-quejas-silencio.md` §3): `pag` (pago/página), `cuenta`
   (bancaria/"cuentan con"), `crédito` (línea/"tarjeta de crédito"), `garantía` (reclamo/atributo).
   El minero propone 2 capas (`RE_VEDADO` + rescate `RE_INFO_OK`) — útil si algún día se endurece
   `tocaPagos`, que hoy ya funciona con INTERRUPT_RE.

## Cómo repetir la minería

Los prompts de los 5 mineros están implícitos en los encabezados de cada archivo: SELECT-only sobre
`messages`, dedupe `lower(trim(content))` + `count(*)`, redes ILIKE amplias por categoría + un pase de
descubrimiento fuera de red + contraejemplos. Vale la pena repetirla cada 2-3 meses: el corpus crece
~10,000 mensajes/mes y las frases nuevas (promos, temporada escolar, nuevos couriers) aparecen primero
en la cola larga.
