# Temas vedados al bot: pagos, facturación, quejas y descuentos

Minado de `messages` (Supabase, proyecto `jbigmlcalcwiphqeudxd`) — 2026-08-21.
Corpus: 30,941 mensajes de cliente (`role='user'`), 14,521 de asesor humano (`role='assistant' AND model='human-agent'`).
Cobertura de las redes en mensajes de cliente: pagos ~1,252 · facturación/cuenta/crédito ~558 · quejas/devoluciones/garantía ~93 · descuentos/negociación ~71.
Todo anonimizado: `<nombre>`, `<empresa>`, `<monto>`, `<cuenta>`, `<ruc>`, `<correo>`, `<teléfono>`, `<n_factura>`.

Regla de negocio: el bot NO interviene en facturación, pagos, cobros, quejas/reclamos, ni negocia u ofrece descuentos. En esos temas: silencio + humano.

---

## 1. Frase → frecuencia por sub-tema (cliente)

### 1a. Pagos (ejecución/confirmación de pago — bot calla)

| Frase (normalizada) | n |
|---|---|
| listo el pago | 7 |
| pagado | 6 |
| pago realizado | 4 |
| yappy | 4 |
| adjunto comprobante de pago | 3 |
| el comprobante está dentro del documento | 3 |
| adjunto pago | 3 |
| el pago | 3 |
| voy a realizar el pago | 2 |
| me compartes los datos para el pago por ach | 2 |
| transferencia | 2 |
| ya se realizó el pago | 2 |
| para hacer el pago | 2 |
| adjunto el comprobante de pago | 2 |
| ya le envío el comprobante de pago | 2 |
| comprobante | 2 |
| buenas tardes, adjunto comprobante de pago | 2 |
| ya realizamos el pago | 2 |
| puedo pagar por yappy | 2 |
| adjunto el pago | 2 |
| aqui esta el pago | 2 |
| por ach | 2 |
| ya realizaron el pago | 2 |
| listo pagado | 2 |
| cual es el numero de cuenta o yappy | 1 |
| cual seria el yappy para hacer el pago | 1 |
| deme el yappy para pagar | 1 |
| envieme el banco y numero de cuenta para hacer el pago | 1 |
| dame los datos de pago por ach... transferencia | 1 |
| me salió error al procesar el pago | 1 |
| esta factura esta pagada 2 veces / por error se emitió un pago por esa cantidad | 1 |
| a fin de mes se le realizara el pago y le enviamos el comprobante | 1 |
| buenas lo que pasa es que mi jefe pago pero aun no recibo nada | 1 |
| el grupo educativo se encuentra exento del pago de itbms | 1 |
| ¿pago a cuotas no tienen? | 1 |

### 1b. Facturación / cuenta bancaria / crédito (bot calla)

| Frase (normalizada) | n |
|---|---|
| facturación.pa@<correo> | 3 |
| agradezco la factura sea emitida a nombre de <empresa> | 2 |
| banco general-cuenta de ahorro-<empresa> <cuenta> (cliente reenvía datos) | 2 |
| me realiza la factura a nombre de <nombre> <ruc> | 2 |
| numero de cuenta | 2 |
| la factura | 2 |
| tenemos crédito con ustedes? | 2 |
| para un pedido de tintas... factura a nombre de <nombre> ruc <ruc> | 2 |
| agrega mi ruc en la factura | 1 |
| factura a nombre de <empresa> / <nombre> <ruc> (decenas de variantes) | 1 c/u |
| me la pueden facturar a nombre de <nombre> | 1 |
| me lo factura porfa / me factura 1 unidad / facturemela | 1 c/u |
| me las factura por favor para pasar a pagar y retirar mañana | 1 |
| favor emitir factura con nombre <empresa> <ruc> | 1 |
| datos de facturación. / datos para facturar | 1 c/u |
| me envia la factura por este medio / por favor | 1 c/u |
| buenos dias, podrían enviarme la factura de ayer por este medio | 1 |
| hemos perdido la factura | 1 |
| me podrá ayudar con la factura? es que no la encuentro... solo tengo el comprobante del pago | 1 |
| factura errada / me hizo mal la factura | 1 c/u |
| factura puede corregir la fecha | 1 |
| la factura no. <n_factura> dice credito y debe decir contado | 1 |
| la factura dice <n> pero yo pedí para <n> | 1 |
| hola podrán arreglar la factura ya que el ruc no es | 1 |
| hagan la nota de credito y me corrijen la factura | 1 |
| me puedes emitir la nota de crédito para contabilidad | 1 |
| como se haria, nota de credito? | 1 |
| ayer me llego una factura pero no hemos comprado nada | 1 |
| me ayudan con el numero de cuenta por favor / me comparten la cuenta bancaria | 1 c/u |
| me envia su numero de cuenta para el pago de fin de mes por favor | 1 |
| manejan algun tipo de cuenta para realizar transferencia ? | 1 |
| con quien podría contactarme para realizar una solicitud de crédito | 1 |
| hace unos días envie un correo para solicitar credito, pero no he recibido respuestas | 1 |
| le escribo... nosotros tenemos crédito con ustedes | 1 |
| la joven de cuentas por pagar me indica de que nosotros somos retenedores de impuestos | 1 |

### 1c. Quejas / devoluciones / garantía en curso (bot calla)

| Frase (normalizada) | n |
|---|---|
| en caso q tenga un reclamo con una tinta hp que les compré, donde hago ese reclamo? | 1 |
| buen día al parecer nos vino una tinta dañada, adicional vino con un embalaje distinto | 1 |
| el día de ayer me entregaron una magenta <modelo> pero llegó dañada | 1 |
| creo que esta defectuoso | 1 |
| pero ya piden reemplazo porque hay unidades dañadas | 1 |
| yo había comprado unos cabezales... ya venían dañados de paquete, quiero saber si hay algún cambio | 1 |
| le vamos a devolver el toner..., les agradecemos que nos puedan hacer la devolución del dinero | 1 |
| me indica el gerente que les vamos a devolver el toner y necesitamos la devolución del dinero | 1 |
| requerimos nc y devolución del dinero del tambor <monto> | 1 |
| deben enviar nc ya que el pago debió ser <monto> deben enviar nc o devolución a la cuenta de <empresa> <monto> | 1 |
| si no la encuentran y les devuelvo la celeste me pueden devolver el dinero? | 1 |
| y no me puede devolver la diferencia? | 1 |
| igualmente si me pueden enviar el comprobante de la devolucion del dinero | 1 |
| solo me están devolviendo una tinta / hoy recibo correo de que me van a devolver solo dos tintas | 1 c/u |
| guia de la devolucion de la tinta | 1 |
| como seria la devolución? / usted reciben devolucion o cambios? | 1 c/u |
| sobre la tinta se la puedo devolver... la jefa no le acepto la tinta vencida | 1 |
| osea que esta vencida, si el cliente la rechaza aceptas la devolucion | 1 |
| hola, el pedido se entrego a la dirección equivocada | 1 |
| en días pasados me facturaron 4 rollos... pero solo me entregaron 2 | 1 |
| esta bien facturado pero despacho esta mal | 1 |
| disculpe, pero pagué para que lo llevaran a casa (y no llegó) | 1 |
| requiero revisión de un equipo... la cual debe estar en garantía... no alimenta papel | 1 |
| tengo una garantía de una impresora hp (caso activo) | 1 |
| que garantía me da si sale dañada?? | 1 |
| y eso lo cubre la garantía? / y sabe si para esos casos lo cubre la garantía? | 1 c/u |
| yo necesito hablar con alguien... que esto no sirve (cliente molesto) | 1 |
| no sirve | 1 |
| buenas vi que pague pero no se me aplico ningun descuento | 1 |
| intenté comprar con la tarjeta más de 5 veces y me sale mensaje de error | 1 |
| hola hice el pago mando error | 1 |

### 1d. Descuentos / negociación (bot calla)

| Frase (normalizada) | n |
|---|---|
| ese es el mejor precio que me puede dar | 2 |
| mejor precio | 2 |
| hay descuento? / tienes descuentos? / tiene algún descuento | 1 c/u |
| necesito un descuento | 1 |
| hay forma que me den un descuento | 1 |
| buen dia! tendria descuento | 1 |
| pero si nos pueden hacer algun descuento | 1 |
| esos equipos no tiene descuento? | 1 |
| y si tiene algun descuento | 1 |
| si. si tiene algun ultimo ajuste o descuento por esa impresora | 1 |
| sí y si hay algún descuento especial por ser última pieza ? | 1 |
| si por favor... si me llevo los dos hay algún descuento? | 1 |
| si contamos con algun descuento por ser clientes. siempre les compramos | 1 |
| referente a este precio, hable via correo con <nombre> sobre un descuento para distribuidor | 1 |
| deseo este pedido menos el descuento | 1 |
| me factura 1 con el descuento | 1 |
| no se me aplico ningun descuento como la ultima vez | 1 |
| ya los codigos de descuentos no los ofrecen por correo? | 1 |
| pero me llegó un correo con algo de un descuento | 1 |
| es el mejor precio? / un mejor precio? / que mejor precio | 1 c/u |
| ese es el mejor precio que nos pueden dar? / ese seria el mejor precio? | 1 c/u |
| y ese es el mejor precio que me puedes dar? | 1 |
| de estas cual es el mejor precio que me puede dar | 1 |
| puede mejorar el precio de la impresora? | 1 |
| yo he comprado anterior con ustedes no me dan mejor precio | 1 |
| agradecemos su mejor precio / cotizar el mejor precio posible (distribuidores) | ~8 variantes |
| pero rebajame el embio a <monto> | 1 |
| el otro mas barato | 1 |
| esa tinta en <competidor> la venden más barato... pensé que ustedes la podían vender más barato | 1 |
| las cuatro juntas cuánto sería, no tienen un pack que salgan más baratas? | 1 |
| cual es el último precio para pagar al cash | 1 |
| disculpe, de esta tinta si se compra por docena hay un mejor precio? | 1 |

---

## 2. Frases del ASESOR que señalan gestión de pago/queja EN CURSO

Si alguna de estas aparece en los últimos turnos del asesor humano, el bot NO debe retomar la conversación (hay una transacción o reclamo activo gestionado por humano):

| Frase del asesor (normalizada) | n |
|---|---|
| banco general-cuenta de ahorro-quick service supplies sa <cuenta> | **673** |
| https://link.yappy.com.pa/... (enlace de cobro Yappy) | **461** |
| factura emitida (y variantes: "listo, factura emitida", "buendia, factura emitida", "facturas emitidas") | **~380** |
| me permite a que nombre desea la factura y un correo electrónico | 21 |
| voy facturando / listo, voy facturando / le voy facturando | ~10 |
| a que nombre se factura? / a que nombre la factura? / a qué nombre desea la factura? | ~10 |
| me permite los datos de facturación / cuenta con ruc? / estos datos son correctos? para emitir la factura | ~6 |
| estamos en el directorio de yappy / debajo le paso el enlace de yappy | 4 |
| aceptamos yappy o transferencia / en tienda pueden pagar con efectivo, visa, clave o yappy | ~6 |
| el pago llego, en unos minutos lo facturo y le paso la guia / listo, pago recibido, factura emitida | 2 |
| al momento del pago nos debe adjuntar el comprobante de la retencion | 1 |
| desea que se le haga la devolución a la cuenta o una nota de crédito para su proxima compra | 1 |
| a que cuenta se le hace la devolucion? / enviar el numero de cuenta para la devolucion | 2 |
| ya se les realizo la devolución y se les envió la nota de crédito al correo | 1 |
| ok, la devolución sería por <monto>, favor me da sus datos bancarios | 1 |
| hubo un mal calculo, el total era de <monto>... podemos hacer la devolución de <monto> | 1 |
| se genera una nota de credito / se le haria una nota de credito / investigo lo de la nota de credito | ~6 |
| le facturo normal y le hacemos nota de credito? / queda el envio en nota de credito | ~4 |
| deben pasar con la factura y el toner defectuoso para realizarle el cambio | 1 |
| disculpe el inconveniente / mis disculpas (gestión de error propio) | ~5 |
| apenas se detecta el doble pago se le devolveria el dinero | 1 |
| le aviso cuando el jefe hace el reembolso / en breve procedemos con la devolución del dinero | 2 |
| hemos verificado que el inconveniente se debe a un error de autenticación de la tarjeta | 2 |
| si, de no completar el pago, se penaliza con el 10% de lo abonado y resto se le devuelve | 2 |

Hallazgo clave: los 2 mensajes más repetidos de TODO el corpus del asesor humano son los datos bancarios (673) y el enlace Yappy (461); "factura emitida" es el 3.º (~380). El cierre de cobro/factura es 100% territorio humano hoy — cualquier turno posterior a estas frases debe seguir en manos del humano.

---

## 3. Fronteras (frases reales) y criterio

| # | Frase real (anonimizada) | Lado | Criterio |
|---|---|---|---|
| 1 | "¿aceptan yappy?" (n=4+variantes) | **SÍ bot** | Pregunta informativa sobre métodos aceptados; no ejecuta cobro. |
| 2 | "se puede pagar con tarjeta de crédito?" (n=3) | **SÍ bot** | "tarjeta de crédito" = método de pago (info), no línea de crédito. |
| 3 | "consulta, tienen punto de venta o cuáles son los métodos de pago?" | **SÍ bot** | Info general publicable. |
| 4 | "el pago es contra entrega?" / "se puede pagar en efectivo?" | **SÍ bot** | Política de pago, no transacción en curso. |
| 5 | "esta impresora tiene garantía?" / "que tiempo de garantía ofrecen?" | **SÍ bot** | Garantía como atributo de producto (pre-venta). |
| 6 | "quisiera saber el costo de la garantía extendida de 3 años para este equipo" | **SÍ bot** | Cotización de producto/servicio, no reclamo. |
| 7 | "cuentan con cartucho de mantenimiento mc-g02 para canon" / "cuentan con domicilio?" | **SÍ bot** | "cuenta(n) con" = disponibilidad, NO cuenta bancaria. |
| 8 | "hasta que tamaño de pagina imprime..." / "cuantas paginas puede imprimir esta" | **SÍ bot** | 'pag' aquí es "página" (spec técnica), no "pago". |
| 9 | "tengo impresora epson l5590 error 100077 presupuesto de evaluación" | **SÍ bot** | Error técnico de equipo con código → consulta de soporte/cotización. |
| 10 | "mi impresora no imprime con los colores y aun tiene la mitad de tinta" | **SÍ bot** | Diagnóstico técnico de equipo del cliente (no es queja de pedido nuestro). |
| 11 | "me han dicho que la impresión en laser es más barato?" | **SÍ bot** | Comparación técnica de costos, no negociación de precio propio. |
| 12 | "hola intenté hacer esa compra y me sale error de conexión" (web, sin dinero movido) | **SÍ bot (borde)** | Falla técnica del sitio: el bot puede sugerir reintentar/canal alterno; si insiste o hubo cargo → humano. |
| 13 | "cual es el numero de cuenta o yappy" | **NO bot** | Pide datos de cobro → inicio de transacción real, la maneja el humano. |
| 14 | "listo el pago" / "adjunto comprobante de pago" | **NO bot** | Confirmación de pago: requiere verificación humana en banco/Yappy. |
| 15 | "buenas vi que pague pero no se me aplico ningun descuento" | **NO bot** | Pagó + discrepancia de cobro = disputa de facturación. |
| 16 | "intenté comprar con la tarjeta más de 5 veces y me sale mensaje de error" | **NO bot** | Error de PROCESAMIENTO DE PAGO (posibles cargos); distinto del error de impresora (#9). |
| 17 | "hace 2 días compré unos cabezales, pero la impresora sigue marcando error" | **NO bot (borde)** | Mismo vocabulario que #9, pero refiere a producto recién comprado a QSP → reclamo de garantía potencial. |
| 18 | "tenemos crédito con ustedes?" / "solicitar credito" | **NO bot** | Crédito comercial/cuenta corriente = decisión financiera humana. |
| 19 | "la factura a nombre de <empresa> ruc <ruc>" / "me lo factura porfa" | **NO bot** | Emisión fiscal: solo el humano factura. |
| 20 | "hagan la nota de credito y me corrijen la factura" / "factura errada" | **NO bot** | Corrección fiscal/contable. |
| 21 | "me entregaron una magenta pero llegó dañada" / "les vamos a devolver el toner... devolución del dinero" | **NO bot** | Queja de pedido / devolución de dinero. |
| 22 | "hay forma que me den un descuento" / "ese es el mejor precio que me puede dar?" / "rebajame el envio" | **NO bot** | Negociación: el bot no negocia ni ofrece descuentos. |
| 23 | "el pedido se entrego a la dirección equivocada" | **NO bot** | Incidencia de entrega = reclamo operativo. |
| 24 | "y eso lo cubre la garantía?" (tras describir un daño) | **NO bot** | Garantía en modo RECLAMO (post-venta con incidente), no info de producto. |

**Criterio general por token ambiguo:**
- `pag` → "página/páginas" (spec) = SÍ · "pago/pagar/pagué" = NO salvo pregunta de método ("¿aceptan…?", "¿se puede pagar con…?", "¿contra entrega?").
- `cuenta` → "cuentan con / tomar en cuenta / darse cuenta" = SÍ · "número de cuenta / cuenta bancaria / cuentas por pagar" = NO.
- `crédito` → "tarjeta de crédito" = SÍ · "línea/solicitud de crédito, nota de crédito, tenemos crédito" = NO.
- `garantía` → pregunta de atributo pre-venta = SÍ · reclamo con incidente ("dañado", "cubre", "hacer válida") = NO.
- `error / no funciona` → equipo del cliente (código, síntoma de impresora) = SÍ · pago, factura, pedido o producto recién comprado = NO.
- `descuento / mejor precio / rebaja / más barato` → SIEMPRE NO (el bot nunca cotiza concesiones), única excepción: comparación técnica genérica ("láser es más barato de operar").

---

## 4. Regex propuesto (JS, flag `i`)

Estrategia de dos capas: `RE_VEDADO` detecta el tema; `RE_INFO_OK` rescata las preguntas informativas de frontera. Decisión: **callar si `RE_VEDADO.test(msg) && !RE_INFO_OK.test(msg)`**.

```js
// Capa 1: tema potencialmente vedado (pagos/facturación/quejas/descuentos)
const RE_VEDADO = new RegExp(
  [
    // pagos en ejecución / confirmación / datos de cobro
    'comprobante', 'yappy', 'transferencia', '\\bach\\b', 'dep[oó]sit',
    '\\bpag(?:o|os|ar|ara[ns]?|amos|aron|ado|ada|u[eé])\\b',
    'n[uú]mero\\s+de\\s+cuenta', 'cuenta\\s+(?:bancaria|corriente|de\\s+ahorros?)',
    'datos\\s+(?:de\\s+pago|bancarios)', 'link\\s+de\\s+pago', 'cuentas?\\s+por\\s+pagar',
    // facturación / crédito comercial
    'factur', 'nota\\s+de\\s+cr[eé]dito', '\\bcr[eé]ditos?\\b', '\\bruc\\b', '\\bitbms?\\b',
    // quejas / devoluciones / garantía-reclamo
    'reclam', 'quej', 'devol', 'devuelv', 'reembols', 'garant[ií]a',
    'defectuos', 'dañad', 'vencid[oa]', 'equivocad', 'no\\s+sirve',
    'doble\\s+pago', 'cobr(?:o|aron)\\s+(?:de\\s+m[aá]s|doble)',
    'no\\s+(?:me\\s+)?(?:lleg[oó]|entregaron|recib[ií])',
    // descuentos / negociación
    'descuent', 'rebaj', 'm[aá]s\\s+barat', 'mejor\\s+precio', '[uú]ltimo\\s+precio', 'negoci',
  ].join('|'),
  'i'
);

// Capa 2: frontera informativa donde el bot SÍ puede responder
const RE_INFO_OK = new RegExp(
  [
    // métodos de pago (pregunta, no ejecución)
    '(?:qu[eé]|cu[aá]les?)\\s+(?:son\\s+)?(?:los\\s+|las\\s+)?(?:m[eé]todos?|formas?|medios?)\\s+de\\s+pago',
    'aceptan?\\s+(?:yappy|ach|tarjeta|transferencia|efectivo|visa|clave)',
    '(?:se\\s+puede|puedo|podemos)\\s+pagar\\s+(?:con|por|en)',
    'pago\\s+(?:es\\s+)?contra\\s+entrega', 'tarjeta\\s+de\\s+cr[eé]dito',
    // garantía como atributo pre-venta
    '(?:tiene[n]?|trae|viene\\s+con|ofrecen?|incluye)\\s+garant[ií]a',
    '(?:cu[aá]nt[oa]s?|qu[eé])\\s+(?:tiempo|meses|a[ñn]os?|per[ií]odo)\\s+(?:de\\s+)?garant[ií]a',
    'garant[ií]a\\s+extendida',
    // 'pag' = página, 'cuenta con' = disponibilidad
    'p[aá]ginas?\\b', 'cuentan?\\s+con\\b', 'tomar\\s+en\\s+cuenta', 'darse\\s+cuenta',
    // error técnico de equipo (no de pago/pedido)
    '(?:impresora|equipo|printer|cabezal|esc[aá]ner)[^.]{0,60}(?:error|no\\s+(?:imprime|funciona|enciende|escanea))',
    '(?:error|no\\s+(?:imprime|funciona))[^.]{0,60}(?:impresora|equipo|cartucho|cabezal|tinta\\s+(?:azul|negra|amarilla|magenta))',
    'error\\s+[a-z]?\\d{2,}',
  ].join('|'),
  'i'
);

// Regla final
const botDebeCallar = (msg) => RE_VEDADO.test(msg) && !RE_INFO_OK.test(msg);
```

Notas de calibración:
- `\bpag(...)` con límites de palabra evita "página/páginas" pero captura "pago, pagar, pagué, pagamos, pagado".
- `factur` es intencionalmente vedado SIEMPRE (aun "¿me llega la factura por correo?"): la emisión y corrección fiscal la maneja el humano; el costo de un falso positivo es bajo.
- Si `RE_INFO_OK` rescata pero el mensaje incluye evidencia de transacción hecha ("pagué", "comprobante", "ya realicé"), conviene una tercera guarda: `/(ya\s+(?:pagu[eé]|pagamos|realic[eé])|comprobante|adjunto\s+(?:el\s+)?pago)/i` fuerza silencio por encima del rescate.
- Adicional recomendado (estado de conversación, no regex de cliente): si el último mensaje del asesor humano matchea `/(factura\s+emitida|voy\s+facturando|link\.yappy\.com\.pa|cuenta\s+de\s+ahorro|nota\s+de\s+cr[eé]dito|devoluci[oó]n)/i`, el bot queda mudo en esa conversación hasta que el humano cierre.

---

## 5. Lista de prueba

### El bot DEBE CALLAR (12)

1. "listo el pago" *(confirmación de pago)*
2. "adjunto comprobante de pago" *(verificación bancaria humana)*
3. "cual es el numero de cuenta o yappy" *(datos de cobro)*
4. "me compartes los datos para el pago por ach" *(datos de cobro)*
5. "la factura a nombre de <empresa>, ruc <ruc> dv <dv>" *(emisión fiscal)*
6. "hagan la nota de credito y me corrijen la factura" *(corrección fiscal)*
7. "esta factura esta pagada 2 veces" *(disputa de cobro)*
8. "el día de ayer me entregaron una magenta pero llegó dañada" *(queja de pedido)*
9. "les vamos a devolver el toner y necesitamos la devolución del dinero" *(devolución)*
10. "hay forma que me den un descuento" *(negociación)*
11. "ese es el mejor precio que me puede dar?" *(negociación)*
12. "buenas vi que pague pero no se me aplico ningun descuento" *(pago + disputa)*

### El bot SÍ PUEDE responder (8)

1. "¿aceptan yappy?" *(info método de pago)*
2. "¿cuáles son los métodos de pago?" *(info)*
3. "se puede pagar con tarjeta de crédito?" *(info; 'crédito' rescatado por 'tarjeta de')*
4. "el pago es contra entrega?" *(info de proceso)*
5. "esta impresora tiene garantía?" *(atributo de producto)*
6. "¿cuánto tiempo de garantía ofrecen?" *(atributo de producto)*
7. "tengo impresora epson l5590 error 100077, ¿me pueden cotizar la evaluación?" *(soporte técnico)*
8. "¿hasta qué tamaño de página imprime y cuántas páginas por minuto?" *(spec; 'pag' = página)*
