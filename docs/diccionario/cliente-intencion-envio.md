# Diccionario: intención de envío / dirección espontánea (mensajes de CLIENTE)

Fuente: tabla `messages`, `role='user'` (29,458 mensajes de 4–250 chars analizados).
Cobertura de redes: red de intención de envío = **2,038 mensajes** (2,013 frases distintas — cola larguísima, casi todo n=1);
red de dirección cruda = **391 mensajes**; red de contraste pickup (retiro/mensajero propio) = **636 mensajes**.
Anonimizado: `<nombre>`, `<dir>`, `<lugar>`, `<edificio>`, `<empresa>`, `<coords>`, `<id>`.

---

## 1a. Sub-grupo A — Intención de envío (top 40, frase → n)

| # | Frase (normalizada) | n |
|---|---|---|
| 1 | tienen delivery | 2 |
| 2 | hacen entregas? | 2 |
| 3 | tienen entrega a domicilio? | 2 |
| 4 | hacen domicilio | 2 |
| 5 | cuanto seria el envio | 2 |
| 6 | hacen envíos? | 2 |
| 7 | hacen envíos a <lugar> | 2 |
| 8 | hacen envíos a <lugar>?? | 2 |
| 9 | es para enviar a <lugar> | 2 |
| 10 | con entrega | 2 |
| 11 | el envio | 2 |
| 12 | consulta hacen delivery? | 1 |
| 13 | ¿delivery gratis? | 1 |
| 14 | delivery? / domicilio? | 1 |
| 15 | cuentan con domicilio ? | 1 |
| 16 | consulta, no tienen servicio de envio? | 1 |
| 17 | tienen servicio a domicilio? necesito <producto> en el área de <lugar> | 1 |
| 18 | ustedes por favor tiene servicio a domicilio (estoy en <lugar>) | 1 |
| 19 | hacen envío al interior / envíos al interior? / realizan envios al interior? | 1 c/u |
| 20 | envían al interior de país. <lugar> | 1 |
| 21 | buenos días hacen envío al interior del país específicamente <lugar> | 1 |
| 22 | estoy en <lugar> hacen envío?? | 1 |
| 23 | hasta donde pueden llegar | 1 |
| 24 | cuánto cuesta el envío a domicilio | 1 |
| 25 | cuánto cuesta enviar a <lugar>? / costo de envio a <lugar> | 1 c/u |
| 26 | cuanto es valor del envio a <lugar> / cuánto sale el envío a <lugar> | 1 c/u |
| 27 | cuanto sale el delivery? / cuánto está el delivery / cuánto cobran por envío | 1 c/u |
| 28 | con delivery al corregimiento de <lugar> cuanto sería ? | 1 |
| 29 | cuanto saldría un delivery a <lugar> | 1 |
| 30 | delivery a <lugar> cuanto me sale? / delivery hacia <lugar> | 1 c/u |
| 31 | delivery para <lugar> tienen para hoy por favor? / cuenta con delivery para hoy mismo? | 1 c/u |
| 32 | cotízame incluyendo el delivery a <lugar> / envíame la cotización con delivery | 1 c/u |
| 33 | con delivery <dir> por favor / con envío a <empresa>, <dir> | 1 c/u |
| 34 | con envio / con delivery / con el delivery incluido / con envío al interior | 1 c/u |
| 35 | con envio por servientrega / envíamelo por servientrega / envíelo por servientrega | 1 c/u |
| 36 | necesito que me envíen un pedido a domicilio | 1 |
| 37 | quiero pedir delivery y quiero saber si pueden traerlo hoy? | 1 |
| 38 | me lo manden hoy mismo? / cuando me los puede enviar / a ver si me lo envías hoy mismo | 1 c/u |
| 39 | bueno me lo traen mañana / eso lo traen hoy mismo? / es que me gustaría pagar porque lo traigan | 1 c/u |
| 40 | cuál es el procedimiento para hacer la compra y me hagan el envio / como se ase la entrega y el pago | 1 c/u |

Otras variantes reales: "el envío lo quiero a <lugar>", "es para envío al interior", "cómo sería entrega en <lugar>",
"agregar el envio a <lugar>", "agregue el servicio de entrega en el precio", "favor incluir el costo de la encomienda hacia <lugar>",
"con eso en envio sale gratis?", "cual es el mínimo de compra para que la entrega salga gratis?", "para envíos tienen algún mínimo de compra?",
"el pago se hace cuando llegue el motorizado acá o por medio un link de pago?", "con tarjeta pos en el delivery ?",
"anteriormente ne han entregado a domicilio", "asen envió / asen entrega a domicilio" (ortografía libre),
"pueden enviarla a unoexpress en la sucursal de <lugar>", "cuánto saldría todo mandándonos por servíentrega".

## 1b. Sub-grupo B — Dirección cruda espontánea (top 40, frase → n)

| # | Patrón real (anonimizado) | n |
|---|---|---|
| 1 | calle <n> | 6 |
| 2 | <sector>, calle <n> | 2 |
| 3 | piso <n> | 2 |
| 4 | casa <color> | 2 |
| 5 | <empresa> — <sector>, calle <n> este, ph <edificio> locales <n> | 2 |
| 6 | [el cliente compartió su ubicación 📍] https://maps.google.com/?q=<coords> | 3 (variantes) |
| 7 | https://maps.app.goo.gl/<id> (a veces + "?g_st=iw") | ~10 links distintos |
| 8 | https://www.google.com/maps/place/<coords>... | 1 |
| 9 | <sector>, calle <n>, edificio <edificio>, piso <n> | 1 |
| 10 | <sector>, calle <nombre>, edificio <edificio>, piso <n>, oficina <n> | 1 |
| 11 | <sector>, altos de <lugar>, calle <n>, casa <n> | 1 |
| 12 | avenida <nombre> calle <n> edificio <edificio> | 1 |
| 13 | calle <n> obarrio, edificio <edificio>, piso <n> oficina <n> | 1 |
| 14 | calle <n> este, casa #<n> | 1 |
| 15 | calle <nombre> edificio ph <edificio> torre <n> piso <n> oficina <n> | 1 |
| 16 | urbanización/urb <lugar> calle <nombre> | 1 |
| 17 | barriada <nombre> / bda <nombre>, calle <n>, casa <n> | 1 c/u |
| 18 | residencial <nombre> casa <n>, <lugar> | 1 |
| 19 | casa <letra>-<n> / casa <n><letra> / apartamento <n> <letra> / apto <n> | 1 c/u |
| 20 | edificio <n> / edificio <nombre> pb | 1 c/u |
| 21 | ph <edificio>, piso <n> (sin más texto) | 1 |
| 22 | estamos en <lugar>, ph <edificio>, diagonal al <referencia> | 1 |
| 23 | estoy en <vía>, <sector>, ph <edificio> | 1 |
| 24 | estamos en <vía> a la altura del <referencia> | 1 |
| 25 | estamos ubicados en <sector> calle <n> detrás de <referencia> | 1 |
| 26 | dirección de entrega: <vía> edificio <edificio> al frente de <referencia> me llaman y bajo | 1 |
| 27 | dirección de entrega: <centro comercial>, entrada de <referencia>, al lado de <local> | 1 |
| 28 | al frente del edificio <edificio> / al frente de ph <edificio> | 1 c/u |
| 29 | entrando por <referencia>, <n> cuadras, casa a la derecha/izquierda | 1 |
| 30 | entrando por el ph <edificio> la 1ra calle a mano derecha 2da casa color <color> | 1 |
| 31 | <provincia>, <distrito>, <lugar>, calle principal, frente al <referencia> | 1 |
| 32 | <lugar> centro, vía principal / vía <nombre> instalación del <entidad>, teléfono <tel> | 1 c/u |
| 33 | a <lugar> calle <n> (destino de envío) | 1 |
| 34 | el envío lo quiero a <lugar> calle <n> | 1 |
| 35 | deben entregarlo en las instalaciones de <entidad> en <lugar> | 1 |
| 36 | deseo retirarlo hoy. mi sector es <lugar> | 1 |
| 37 | costo de envio. calle 2da. <sector> (con typo "cakke") | 1 |
| 38 | cambió mi dirección, ahora es <sector>, calle <n>, edificio <edificio>, apto <n> | 1 |
| 39 | <entidad pública> entrando por <referencia>, en recepción indicar que es para <nombre> | 1 |
| 40 | https://maps.app.goo.gl/<id> + "seria ingresar al edificio, piso <n>, oficina <n>" | 1 |

Nota clave: muchos bloques con dirección son **datos de facturación** (RUC/DV/correo + dirección fiscal) — no son
petición de envío. Y el prefijo `[el cliente compartió su ubicación 📍]` es la forma nativa de WATI para el location share.

---

## 2. Ambiguos reales (contienen palabras de la red pero NO son intención de envío)

| Frase real | Por qué NO captura | Señal para distinguir |
|---|---|---|
| donde estan ubicados / dónde están ubicados? (n≈60 sumando variantes) | Pregunta dónde queda LA TIENDA | interrogativa + "ubicados/queda" sin objeto-pedido |
| me puede enviar la ubicación / me envia la ubi | Pide que le manden el PIN de la tienda (va a retirar) | objeto = ubicación/dirección/info |
| me puede enviar la dirección / me da la dirección? | Ídem | objeto digital/informativo |
| me envía la cotización por favor (n=2) + decenas similares | "enviar" documento por chat/correo | objeto = cotización/factura/foto/correo/datos/guía |
| ya le envío el comprobante de pago / envío comprobante | El CLIENTE envía algo digital | sujeto=cliente, objeto=comprobante |
| buenas ya enviaron la cotización / a que correo la enviaste? | Seguimiento de documento | objeto documental |
| aun no me llegan las tintas / cuando estaria llegando? | Estado de pedido YA en curso | tiempo pasado/progresivo + pedido existente |
| ¿ya salió mi pedido? / como van con el despacho / consulta, la entrega sería hoy? | Tracking, no solicitud nueva | referencia a pedido/nº de orden ya hecho |
| a que hora entregan? / a qué hora me llevan las tintas? / a que hora traen el pedido? | ETA de entrega ya coordinada | "a qué hora" + pedido en curso |
| cuando le llegan los otros de 26 / sabe cuando le llega? / para cuando le llega ? | Restock del VENDEDOR, no envío al cliente | "le llega(n)" al negocio + producto agotado |
| voy llegando / ya estoy llegando | Cliente llegando a la tienda (pickup) | 1ª persona en movimiento hacia tienda |
| estoy en el estacionamiento del piso 4 / estoy estacionado en el 4to piso / estoy en recepción | Llegada a Plaza Aventura (la tienda), no dirección de entrega | "estoy en" + estacionamiento/piso/ascensor/recepción/entrada |
| en que piso están ubicados / en q piso de plaza aventura están / donde queda plaza aventura | Ubicación de la tienda | interrogativa sobre el local propio |
| para pasar a retirarlo / retiro en tienda / lo paso a buscar | PICKUP: lo contrario de delivery | verbos retirar/pasar a buscar |
| el mensajero pasará a retirar / mañana mando al mensajero a retirar / envío a mi secretaria a retirar | Mensajero DEL CLIENTE va a la tienda | mensajero+retirar (dirección tienda→) |
| boy a wnviar a retirarla en su local / gracias la mando a buscar | "enviar/mandar" a una persona a la tienda | enviar+persona+retirar/buscar |
| les contacto porque no me imprime y me mandar error | "manda error" = la impresora | contexto soporte técnico |
| cuando lo despachen le entregamos el cheque / acaban de entregarme el cheque | "entregar" = pago, no mercancía | objeto = cheque/pago |
| deben enviar nc o devolución | Nota de crédito (documento) | objeto contable |
| hola, el pedido se entrego a la dirección equivocada | Reclamo post-entrega | tiempo pasado + queja |

**Regla de oro para distinguir:** mirar (1) el OBJETO del verbo — si es documento/dato digital (cotización, comprobante,
factura, foto, ubicación, dirección, correo, guía, link) → NO; si es el pedido/producto/pronombre lo-la-los + lugar físico → SÍ;
(2) la DIRECCIÓN del movimiento — tienda→cliente = delivery (captura), cliente/mensajero→tienda = pickup (no captura);
(3) el TIEMPO — pregunta previa a la compra = intención (captura), seguimiento de orden ya pagada = tracking (otra categoría).

---

## 3. Regex propuesto — intención de envío del cliente (JS, flag `i`)

```js
const RE_INTENCION_ENVIO = new RegExp(
  [
    // ¿hacen/tienen/realizan (servicio de) envío(s)/delivery/entrega(s)/domicilio/encomienda?
    String.raw`\b(?:hacen|tienen|realizan|manejan|ofrecen|cuentan?\s+con|hay|no\s+tienen)\s+(?:servicio\s+(?:de\s+|a\s+)?)?(?:env[ií]os?|deliver[yi]|entregas?(?:\s+a\s+domicilio)?|domicilios?|encomiendas?)\b`,
    // ¿cuánto cuesta/sale/vale…? costo/valor/precio/tarifa … envío/delivery/domicilio/encomienda
    String.raw`\b(?:cu[aá]nt[oa]s?|costo|valor|precio|tarifa|cobran)\b[^\n.?!]{0,40}\b(?:env[ií]o|deliver[yi]|domicilio|encomienda)\b`,
    // me/nos (lo/la/los/las) (pueden/podrían) enviar|mandar|traer|llevar — con guarda anti-objeto-digital
    String.raw`\b(?:me|nos)\s+(?:l[oa]s?\s+)?(?:pueden?\s+|podr[ií]an?\s+|puedes\s+|van\s+a\s+)?(?:env[ií](?:an|en|a|e|ar|as)|mand(?:an|en|a|e|ar)|tra(?:en|e|er|igan?)|llev(?:an|en|a|ar))\b(?!\s+(?:el\s+|la\s+|los\s+|las\s+|una?\s+|mi\s+|su\s+)?(?:cotizaci[oó]n|comprobante|factur|proforma|foto|imagen|video|ubicaci[oó]n|ubi\b|direcci[oó]n|correo|dato|info|link|enlace|gu[ií]a|cat[aá]logo|n[uú]mero|cuenta|error|mensaje|contacto))`,
    // enclíticos: envíamelo, mándemelo(s), tráiganmelo…
    String.raw`\b(?:env[ií][ae]n?|m[aá]nd[ae]n?|tr[aá]ig[ae]n?|ll[eé]v[ae]n?)(?:me)?l[oa]s?\b`,
    // envío/delivery/entrega a|al|hacia|para|hasta <destino> · con envío/delivery
    String.raw`\b(?:env[ií]o|deliver[yi]|entrega)\s+(?:a|al|hacia|para|hasta)\s`,
    String.raw`\bcon\s+(?:(?:el\s+)?env[ií]o|deliver[yi]|entrega|domicilio)\b`,
    // a domicilio / al interior / hasta dónde llegan / lo traen (hoy/mañana)
    String.raw`\ba\s+domicilio\b`,
    String.raw`\benv[ií](?:an|a|o|os)\s+al?\s+interior\b`,
    String.raw`\bhasta\s+d[oó]nde\s+(?:llegan|env[ií]an|entregan|cubren|pueden\s+llegar)\b`,
    String.raw`\bl[oa]s?\s+(?:pueden\s+)?tra(?:en|igan?)\b`,
    // couriers al interior (señal fuerte de envío físico)
    String.raw`\bpor\s+(?:serv[ií]?\s?entrega|uno\s?ex?pr[eé]ss?)\b`,
  ].join('|'),
  'i'
);
```

Notas críticas descubiertas en los datos:
- **ILIKE/regex sin `í` pierde ~40% de las frases**: "envío/envían/envíen" NO matchean `envi`. Siempre usar `env[ií]`.
- Ortografía libre real: "asen envió", "enviö", "wnviar", "servíentrega", "cakke" — el regex tolera lo frecuente; el resto lo cubre el LLM.
- Post-filtro recomendado (segunda pasada): descartar si matchea `/(cotizaci[oó]n|comprobante|factura|nc\b|nota\s+de\s+cr[eé]dito|correo|@)/i` sin mención de producto/pedido, o si matchea la red de pickup `/\b(retir|paso\s+a\s+buscar|mensajero\s+(?:pasa|va|ir[aá])|recoger|voy\s+llegando)\b/i`.

## 4. Heurística para dirección cruda (estructural, no lista de calles)

```js
const VIA    = /\b(?:calle|av(?:e(?:nida)?)?\.?|v[ií]a|carretera|urb(?:anizaci[oó]n)?\.?|b(?:arria)?da\.?|residencial|res\.?|sector|corregimiento|altos\s+de)\b/i;
const UNIDAD = /\b(?:casa|edif(?:icio)?\.?|apto\.?|apartamento|p\.?\s?h\.?|torre|piso|local|oficina|ofic\.?|planta\s+baja|pb)\s*(?:#|n[oº]\.?\s*)?[a-z]?-?\d+[a-z]?\b|\bph\s+[a-záéíóú]/i;
const MAPA   = /maps\.(?:app\.goo\.gl|google\.com)|google\.[a-z.]+\/maps|compartió\s+su\s+ubicaci[oó]n|(-?\d{1,2}\.\d{4,}),\s*(-?\d{2,3}\.\d{4,})/i;
const REF    = /\b(?:frente\s+a[l]?|al\s+lado\s+de|diagonal\s+a[l]?|entrando\s+por|detr[aá]s\s+de|a\s+la\s+altura\s+de|pasando\s+(?:el|la)|a\s+mano\s+(?:izquierda|derecha)|despu[eé]s\s+de[l]?)\b/i;
const ES_PREGUNTA = /\?|^\s*(?:d[oó]nde|en\s+qu[eé]|cu[aá]l)\b/i;                    // ubicación de la tienda
const ES_LLEGADA  = /\bestoy\s+(?:en\s+(?:el|la)\s+)?(?:estacionamiento|ascensor|recepci[oó]n|entrada|puerta|abajo|afuera|camino)|voy\s+llegando|ya\s+estoy\s+llegando/i;
const ES_FISCAL   = /\b(?:ruc|dv)\b\s*[:.]?\s*[\d-]|@[a-z0-9.-]+\.[a-z]{2,}/i;       // bloque de facturación

const esDireccionCruda = (t) =>
  !ES_PREGUNTA.test(t) && !ES_LLEGADA.test(t) &&
  ( MAPA.test(t)
    || (VIA.test(t) && UNIDAD.test(t))                    // "calle 74, edificio X, apto 12B"
    || (UNIDAD.test(t) && REF.test(t))                    // "casa 88, frente a la escuela"
    || (VIA.test(t) && /,/.test(t) && !/[a-záéíóú]{3,}(?:mos|ría|ré)\b/i.test(t)) // frase nominal con comas
  ) && !ES_FISCAL.test(t);  // si es fiscal, rutéalo a "datos de facturación", no a delivery
```

Patrones estructurales observados: (a) cadena `sector → vía → unidad numerada` separada por comas o saltos de línea;
(b) `PH <Nombre>` es marcador panameño casi inequívoco de dirección; (c) número/letra pegado a la keyword (`casa 387`,
`apto 12b`, `piso 30`, `casa k14a`, `edificio 208`); (d) referencias relativas encadenadas ("entrando por X … tercera casa
a mano izquierda"); (e) link de maps o location-share de WhatsApp; (f) frase nominal sin verbo conjugado.
Anti-patrones: pregunta (tienda), "estoy en el estacionamiento/piso N" (llegada a la tienda, que está en un 4º piso de
plaza comercial), bloque con RUC/DV/correo (dirección fiscal para factura).

## 5. Lista de prueba

### DEBEN activar captura (12)
1. "tienen delivery" — regex (rama 1)
2. "¿hacen entregas a domicilio?" — regex (ramas 1 y 7)
3. "¿cuánto cuesta el envío a <lugar>?" — regex (rama 2)
4. "me lo pueden mandar a la oficina?" — regex (rama 3)
5. "necesito que me envíen un pedido a domicilio" — regex (ramas 3 y 7)
6. "hacen envíos al interior?" — regex (ramas 1 y 8)
7. "con delivery a <lugar> cuánto sería?" — regex (ramas 2/5/6)
8. "envíamelo por servientrega" — regex (ramas 4 y 11)
9. "eso lo traen hoy mismo?" — regex (rama 10)
10. "hasta dónde llegan?" — regex (rama 9)
11. "<sector>, calle 50, edificio <edificio>, piso 30" — heurística dirección (VIA+UNIDAD)
12. "https://maps.app.goo.gl/<id>" o "[el cliente compartió su ubicación 📍]" — heurística dirección (MAPA)

### NO deben activar (8)
1. "¿dónde están ubicados?" — pregunta por la tienda (ES_PREGUNTA)
2. "me puede enviar la cotización por favor" — objeto digital (guarda negativa rama 3)
3. "ya le envío el comprobante de pago" — cliente envía documento
4. "voy llegando" — llegada a tienda (ES_LLEGADA)
5. "el mensajero pasará mañana a retirar" — pickup (red de contraste)
6. "¿ya salió mi pedido? ¿cuándo llega?" — tracking de orden en curso
7. "estoy en el estacionamiento del piso 4" — llegada a la tienda (ES_LLEGADA)
8. "¿saben cuándo le llega el tóner? (agotado)" — restock del vendedor
