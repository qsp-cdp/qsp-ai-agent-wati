# Diccionario — CLIENTE pide comprar / cotizar / precio / disponibilidad

Fuente: tabla `messages`, `role='user'` (30,940 mensajes de cliente; 29,458 en rango 4–250 chars).
La red amplia de intención de compra matchea **5,896 mensajes (~20% del total de cliente)**.
Minado 2026-08-21 con `lower(trim(content))` + `group by` (deduplicado). ~1,650 filas únicas revisadas en 6 barridos (3 redes ILIKE, 1 descubrimiento fuera de red, 1 recompra, 1 verbos secundarios).

Anonimización: `<nombre>`, `<empresa>`, `<ruc>`, `<correo>`, `<tel>` sustituyen datos personales. Los nombres de producto se conservan (son la señal).

---

## 1. Tablas frase → frecuencia por sub-grupo

### a) Pedido directo (top 40)

| # | Frase (normalizada) | n |
|---|---|---|
| 1 | hola! quiero información 🙂 *(CTA de anuncio click-to-WhatsApp — ver ambiguos)* | 267 |
| 2 | hola! quiero información � *(misma CTA, emoji roto)* | 117 |
| 3 | ¡hola! quiero más información *(CTA)* | 98 |
| 4 | hola! quiero información *(CTA)* | 31 |
| 5 | enlace: ¡hola! quiero más información *(CTA con link de producto)* | 11 |
| 6 | si me interesa | 6 |
| 7 | necesito | 4 |
| 8 | necesito una cotizacion / cotización | 3+3 |
| 9 | necesito 2 de cada una | 3 |
| 10 | necesito cotizar | 2 |
| 11 | necesito toner | 2 |
| 12 | necesito una cotización formal | 2 |
| 13 | necesito un plotter | 2 |
| 14 | necesito dos | 2 |
| 15 | para comprar | 2 |
| 16 | me interesa | 2 |
| 17 | me interesa esta | 2 |
| 18 | estoy interesada en comprar esto | 2 |
| 19 | necesito esta tinta | 2 |
| 20 | necesito 2 | 2 |
| 21 | para hacer un pedido de tintas de impresora hp 964xl serían 1 black y 1 magenta | 2 |
| 22 | necesito cotización de estos 4 colores de toner | 2 |
| 23 | necesito 3 tintas hp 951xl cyan, 3 magenta y 3 amarillas para una officejet pro 8600. ¿me cotizas? | 2 |
| 24 | necesito una repuesto para una impresor. cinta encoder para hp smart tank 530 | 2 |
| 25 | buen día para hacer un pedido: papel carta 3 resmas, papel a4 3 resmas, tintas hp 964 xl… | 2 |
| 26 | para un pedido de tintas hp 9730… factura a nombre de `<nombre>` `<ruc>` | 2 |
| 27 | hola, estoy interesado en los productos. ¿me puedes ayudar con más información? | 2 |
| 28 | necesito un proyector epson láser | 2 |
| 29 | hola. necesito un toner cannon negro 067 de alto rendimiento. ¿tienen disponibilidad? | 2 |
| 30 | deseo comprar la tinta hp 11 magenta y cyan y 2 rollos de albanene | 1 |
| 31 | deseo comprar unas tintas / deseo comprarla / deseo hacer la compra | 1 c/u |
| 32 | deseo pedir el toner | 1 |
| 33 | quiero pedir un tóner negro para una impresora color laserjet pro mfp m283fdw… quiero pedir delivery | 1 |
| 34 | necesito pedir un tomer por favor *(sic)* | 1 |
| 35 | favor solicito me despachen este toner | 1 |
| 36 | buenos días, de parte del dr. `<nombre>` para realizar pedido de 4 tintas negras xl 145 | 1 |
| 37 | estoy interesado en adquirir 2 unidades de etiqueta brother dk-2251 - 2.4" x 50 pies | 1 |
| 38 | me urge comprar el tóner. | 1 |
| 39 | estoy interesada en comprar una impresora epson l4360 | 1 |
| 40 | favor comprar toner 2unidades / hola! buenos días para solicitar 2 toner color negro para mi impresora | 1 c/u |

**Patrones del sub-grupo:** `quiero/deseo/necesito/requiero/me urge + [comprar|pedir|N unidades|producto]`, `para (hacer|realizar) un pedido`, `estoy interesad@ en …`, `favor + verbo`, y muy frecuente: saludo + producto + cantidades en lista (viñetas con colores/unidades). Los pedidos B2B suelen traer razón social + RUC/DV en el mismo mensaje.

### b) Cotización / precio (top 40)

| # | Frase (normalizada) | n |
|---|---|---|
| 1 | precio | 16 |
| 2 | para cotizar | 9 |
| 3 | para una cotizacion | 5 |
| 4 | favor cotizar | 4 |
| 5 | me puedes apoyar con esta cotización | 4 |
| 6 | me puedes cotizar | 4 |
| 7 | que precio tiene | 3 |
| 8 | me puedes cotizar esto | 3 |
| 9 | para realizar una cotización | 3 |
| 10 | para cotizar una impresora | 3 |
| 11 | me podría cotizar | 3 |
| 12 | cotización | 3 |
| 13 | precio? | 3 |
| 14 | necesito una cotización / cotizacion | 3+3 |
| 15 | deseo una cotización | 2 |
| 16 | para cotizar un tóner marca ricoh modelo imc6010 color negro | 2 |
| 17 | me lo cotiza | 2 |
| 18 | para una cotización por favor | 2 |
| 19 | cuanto salen | 2 |
| 20 | mejor precio | 2 |
| 21 | me cotiza porfa | 2 |
| 22 | ¿precio de tinta epson 544? | 2 |
| 23 | me cotizas por favor | 2 |
| 24 | deseo cotizar | 2 |
| 25 | me puede cotizar | 2 |
| 26 | precio tinta canon pg-145xl | 2 |
| 27 | que precio / que precio tienen | 2+2 |
| 28 | que cuesta | 2 |
| 29 | quisiera cotizar una impresora | 2 |
| 30 | me puedes hacer una cotización | 2 |
| 31 | cuanto seria? / cuanto seria el envio *(envío: ambiguo)* | 2+2 |
| 32 | cotizame esta con las tintas | 2 |
| 33 | cotizar 2 cartucho de mantenimiento a nombre de `<empresa>` | 2 |
| 34 | me puede ayudar con una cotización de tintas: hp 964 negro xl, cyan, yellow, magenta | 2 |
| 35 | por favor cotizar toner negro hp w2300a 230a negro | 2 |
| 36 | buenos dias. quisiera solicitar una cotizacion | 2 |
| 37 | buenas tardes por favor me cotizas: 2 cartuchos canon 145xl (color), 1 canon 146xl (negro) | 2 |
| 38 | porfavor cotizar / porfavor cotizar la ecológica | 2+2 |
| 39 | cotizar a nombre de `<empresa>` ruc: `<ruc>` dv: `<dv>` | 2 |
| 40 | a cuanto salen las tinta de impresoras epson l3150 / en cuanto me sale las 4 tinta para epson l220 | 1 c/u |

**Patrones del sub-grupo:** raíz `cotiz*` domina por goleada (cotizar, cotízame, me cotiza(s), cotización formal, proforma implícita); `precio (de) <producto>`, `qué/que precio tiene(n)`, `cuánto cuesta/vale/sale/salen`, `a cuánto están`, `en cuánto me sale`. Muy común "cotizar **a nombre de** `<empresa>` + RUC/DV" (cotización formal B2B, a menudo gobierno). También `cotización igual actualizada` (revalidar precio).

### c) Disponibilidad / stock (top 40)

| # | Frase (normalizada) | n |
|---|---|---|
| 1 | tienen disponible? / tienen disponible | 7+7 |
| 2 | tienen? | 6 |
| 3 | tienen la tinta azul y negra | 5 |
| 4 | ¿tienen tóner para hp laserjet? | 4 |
| 5 | disponible | 4 |
| 6 | ¿venden impresoras epson? | 4 |
| 7 | venden monitores? | 3 |
| 8 | buen día venden impresora epson l5590 | 3 |
| 9 | tiene disponible | 3 |
| 10 | tendran esto | 3 |
| 11 | tienen | 2 |
| 12 | ustedes venden impresoras? | 2 |
| 13 | tienen cartucho de mantenimiento canon mc-g04 / mc-g04 | 2+2 |
| 14 | tienen este producto | 2 |
| 15 | hola tienen pantalla para scan cut dx sdx85s. | 2 |
| 16 | buenas tardes tiene disponible cabezal hp 711 (c1q10a) - hp designjet t120/t520/t130/t530 | 2 |
| 17 | tienen esta? | 2 |
| 18 | buen dia. tienen tinta epson 748xxl negro cían magenta y amarillo. ? | 2 |
| 19 | tiene disponibilidad | 2 |
| 20 | papel de sublimado en rollo de 40cm o 60cm… mantienen? | 2 |
| 21 | disponibles | 2 |
| 22 | no tienen? | 2 |
| 23 | ¿tienes este producto en stock? | 1 |
| 24 | ¿tienen tinta para epson l3210? / para mi canon pixma g2170? | 1 c/u |
| 25 | ¿tienen papel bond de 30 pulgadas para plotter? | 1 |
| 26 | aun tienen este toner? / aun tienen? / aun tienes disponible? / aun hay disponibles ? | 1 c/u |
| 27 | aun mantienen la tinta / aún mantienen | 1 c/u |
| 28 | busco tinta negra para impresora canon g3160 | 1 |
| 29 | busco toner 206x / busco toner para lexmark mx331 pero el economico | 1 c/u |
| 30 | busco una impresora / busco una impresora canon g4010 / busco un impresora que imprima 11x17 | 1 c/u |
| 31 | busco los cabezales de hp smart tank 580 | 1 |
| 32 | almohadillas epson l3110 tienen | 1 |
| 33 | buenas el l575 cabezal tienen? / cabezal para este equipo tienen? | 1 c/u |
| 34 | toner kyocera 1175 black le quedan / consulta de los toner tn-450 todavia les quedan disponible? | 1 c/u |
| 35 | 2170 hay ? | 1 |
| 36 | disponible hp laserjet m111w? | 1 |
| 37 | de casualidad ustedes tienen cabezales para impresora hp 410 | 1 |
| 38 | consulta impresoras canon tienen? / consulta tienen toner | 1 c/u |
| 39 | desearía consultar si tendran disponibilidad de la impresora matriz de puntos, epson lq-590ii? | 1 |
| 40 | deseo confirmar si la tienen disponible? / deseo conocer si tienen tintas pgi 1100 xl | 1 c/u |

**Patrones del sub-grupo:** `tienen/tiene/tendrán/tienes + [disponible|producto]` (a menudo el verbo va AL FINAL: "almohadillas epson l3110 **tienen**"), `venden + producto`, `mantienen` (panameñismo por "tienen en stock"), `les queda(n)`, `aún hay`, `busco + producto`, `hay ?` tras un modelo, `disponibilidad`, `en stock`. El producto suele venir en el mismo mensaje o en la foto inmediatamente anterior ("tienen esta?").

---

## 2. Descubrimiento fuera de red — formas de pedir que las redes no ven

Del barrido de mensajes que NO matchean ninguna palabra clave (400 filas revisadas):

1. **Modelo solo, sin verbo**: "canon g4110" (4), "canon g3160" (4), "hp officejet pro 9730" (3), "epson l14150", "toner hp pro 200 m276nw", "tóner hp 150a", "epson sc-t5170", "hp smart tank 530", "maxify gx 7010", "printhead pf-04", "impresora 3253ci", "sdsdxxd-128g-gn4in". El cliente manda el modelo (o foto del cartucho) y espera precio/stock.
2. **Cantidad sola** (continuación de conversación): "2 unidades" (6), "los 4 colores" (6), "1 de cada una" (5), "4 unidades", "2 de cada una", "juego completo", "solo la negra" (2), "solo negra", "2 tintas negras", "dos de cada una", "5 de cada una", "el combo completo".
3. **URL de producto de la propia tienda**: enlaces `quickservicepanama.com/products/...` pegados sin texto = intención de compra sobre ese producto.
4. **Descripción de item tipo lista de compras**: "5 toners hp 58a", "5 rollos de papel albanene 36x150", "un rollo alabanne", "cinta encoder o tira codificadora para impresora hp ink tank 415" (3), "2 toner para lazotea".
5. **Datos de facturación como señal de cierre**: razón social + RUC + DV + correo ("`<empresa>` ruc `<ruc>` dv `<dv>` `<correo>`") — el cliente ya decidió comprar y está pasando datos para factura/cotización formal.
6. **CTA en inglés**: "hello! can i get more info on this?" (3+2) — versión inglesa del anuncio.
7. **Foto + texto mínimo**: "esta tinta", "este modelo", "seria esta", "este toner", "esta es la impresora" — el producto está en la imagen adjunta.

---

## 3. AMBIGUOS — tienen las palabras pero NO son intención de compra

| # | Frase real | Por qué NO dispara | Cómo distinguir |
|---|---|---|---|
| 1 | "vale" (51), "vale gracias" (16), "ok vale", "a vale", "vale, quedo atenta" | "vale" = "OK" en Panamá, no "¿cuánto vale?" | `vale` solo/final de frase sin sujeto = acuse; solo cuenta "cuánto vale / qué vale X" |
| 2 | "ya hice el pedido" (2), "acabo de hacer un pedido #8542" | Pedido YA hecho → estado/confirmación | Verbo en pasado (hice, realicé, acabo de) + "pedido" |
| 3 | "¿a qué hora traen el pedido?", "buenos días, a qué hora me van a traer el pedido?" | Logística de entrega | `a qué hora|cuándo + traen/entregan/llega` |
| 4 | "el pedido no llegó ayer", "realicé un pedido… y no han llegado" | Queja/seguimiento | negación + llegar/entregar |
| 5 | "como en cuanto tiempo me entregan el pedido" | "cuánto" de TIEMPO, no precio | `cuánto` seguido de `tiempo|tarda|demora` |
| 6 | "¿cuánto cuesta enviar a chitré?", "¿hacen envíos y cuánto cuesta?" | Pregunta el flete, no el producto (semi-ambiguo: sigue en funnel) | `cuesta/cuánto` + `envío|enviar|delivery` sin producto |
| 7 | "no me ha llegado la cotizacion" (2), "aún espero la cotización", "estamos esperando la cotizacion" | Reclamo de una cotización prometida | negación/espera + cotización |
| 8 | "adjunto pago de esta cotización", "aprobada la cotizacion", "ayer me hicieron el pago de la cotización" | Cierre/pago, no solicitud | `adjunto|aprobada|pago` + cotización |
| 9 | "buenas tardes solo necesito saber si tienen estacionamiento para clientes" | "tienen" pero pregunta operativa | `tienen` + estacionamiento/horario/local |
| 10 | "tienen tienda física?" (3+2), "tienen delivery" (2), "tienen entrega a domicilio?" (2), "¿tienen sucursal en colón?" | Operativa de tienda, no stock | `tienen` + tienda/sucursal/delivery/domicilio/horario/cuenta/link de pago |
| 11 | "quiero hablar con un asesor" (4), "necesito hablar con un vendedor" (2) | Handoff humano | `quiero/necesito + hablar` |
| 12 | "que horario tienen hoy?", "¿tienen para pago a cuotas con algun tarjeta?" | horario / financiamiento | `tienen` + horario/cuotas/crédito/financiamiento |
| 13 | "cuando la tienen?", "avíseme cuando está disponible" | Restock futuro — es lead pero flujo distinto (back-order) | `cuándo` + tienen/llega/disponible |
| 14 | "es q necesito saber cuales compre y no me sale el registro de esa compra" | Post-venta (historial) | pasado de comprar + saber/registro |
| 15 | "buenos días, necesito una respuesta por favor" | Seguimiento genérico | `necesito` + respuesta/ayuda/saber (sin producto) |
| 16 | "canon toner 067 amarillo [5099c001aa] precio unitario: $ 45.65 disponible: 12.00unidades" | Cliente reenvía la ficha del catálogo (cita, no pregunta) | contiene `precio unitario:` + `$` + `disponible: N unidades` |
| 17 | "hola! quiero información 🙂" (524 en familia) | CTA autogenerada del anuncio: intención genérica SIN producto | match exacto de plantilla → flujo de bienvenida/calificación, no cotizador |
| 18 | "gracias por escribir a `<empresa>`… indicanos tu pedido" | Auto-respuesta del bot de OTRO negocio (el cliente es a su vez comercio) | plantillas con "gracias por comunicarte/escribir a" |
| 19 | "6733-5806 cuando este hay el motorizado llamar a este número…" | "hay" en instrucciones de entrega | `hay` sin producto/pregunta |
| 20 | "aqui pago ach del pedido que le hice ayer", "listo el pago" (7) | Pago de pedido existente | pago/ach/yappy + pasado |

**Regla general de desambiguación:** la intención de compra vive en (verbo de deseo/solicitud EN PRESENTE o pregunta) + (producto o demostrativo con foto). Si el mensaje habla de un pedido en pasado, de horas/tiempos, de envío sin producto, de pagos adjuntos, o de atributos de la tienda (horario, local, delivery, crédito), NO es una nueva intención de compra.

---

## 4. Regex propuesto (JS, flag `i`)

Ejecutar primero la exclusión; si no excluye, evaluar la intención.

```js
// 1) EXCLUSIONES (estado de pedido, logística, pagos, operativa de tienda, muletilla "vale")
const RE_NO_INTENCION = /(?:^|\s)vale[\s,.!]*(?:gracias)?\s*$|ya\s+(?:hice|realic[eé]|hicimos|realizamos)\s+(?:el|un|mi)?\s*pedido|acab[oé]\s+de\s+hacer\s+(?:el|un)\s+pedido|a\s+qu[ée]\s+hora\s+(?:traen|entregan|llega|viene)|cu[aá]nto\s+(?:tiempo|tarda|demora)|no\s+(?:me\s+)?ha[n]?\s+llegado|(?:espero|esperando)\s+la\s+cotizaci[oó]n|(?:adjunto|aprobada?|realic[eé])\s+(?:el\s+)?(?:pago|la\s+cotizaci[oó]n)|estado\s+del?\s+pedido|mi\s+pedido\s+(?:no|#)|tienen\s+(?:tienda|sucursal|estacionamiento|delivery|entrega|env[ií]os?|horario|cuenta|link|punto\s+de\s+venta|cr[eé]dito|financiamiento|para\s+pago)|qu[eé]\s+horario\s+tienen|(?:quiero|necesito|deseo)\s+hablar\s+con|precio\s+unitario\s*:/i;

// 2) INTENCIÓN DE COMPRA / COTIZACIÓN / DISPONIBILIDAD
const RE_INTENCION_COMPRA = new RegExp([
  // b) cotización / precio
  'cotiz\\w*', 'proforma',
  '\\bprecios?\\b\\s*(?:de|del|tiene|tienen|\\?|$)?',
  'cu[aá]nt[oa]s?\\s+(?:cuesta|cuestan|vale|valen|sale|salen|cobran|ser[ií]a|es\\b)',
  'en\\s+cu[aá]nto\\s+(?:me\\s+)?(?:sale|salen)',
  'a\\s+cu[aá]nto\\s+(?:est[aá]n?|salen?)',
  'q(?:u[eé])?\\s+(?:precio|cuesta|vale)',
  // a) pedido directo
  '(?:hacer|realizar|para|confirmar)\\s+(?:un\\s+|el\\s+|mi\\s+)?pedido',
  '(?:quiero|deseo|quisiera|me\\s+gustar[ií]a|vamos\\s+a|voy\\s+a)\\s+(?:comprar|pedir|cotizar|adquirir|ordenar|encargar|llevar)',
  'v[eé]nd[ea]me',
  'me\\s+interesa\\w*', 'interesad[oa]s?\\s+en',
  '(?:necesit(?:o|amos)|ocup(?:o|amos)|requi?er(?:o|imos)|me\\s+urge[n]?|deseo|solicit(?:o|amos))\\s+(?:\\d+|un[oa]?s?|el|la|los|las|dos|tres|esta?e?|tinta|t[oó]ner|toner|cartucho|impresora|cabezal|papel|plotter|bater[ií]a|repuesto|rollo|resma|cinta|kit|caja)',
  '(?:favor|porfa\\w*|por\\s+favor)\\s+(?:cotizar|comprar|despachar|enviar\\w*\\s+cotizaci[oó]n)',
  'para\\s+(?:solicitar|ordenar|adquirir)\\s',
  // c) disponibilidad / stock
  '(?:tienen?|tienes|tendr[aá][ns]?|mantienen|manejan|venden|hay)\\s+(?:\\w+\\s+){0,3}?(?:disponib\\w*|stock|tintas?|t[oó]ner\\w*|toner\\w*|cartuchos?|impresoras?|cabezal\\w*|papel|bater[ií]as?|rollos?|cintas?|repuestos?|almohadillas?|pantallas?|monitores)',
  'tienen\\s+(?:disponible|esta?o?s?\\b|\\?|$)',
  'disponibilidad', 'en\\s+stock', 'les?\\s+queda[n]?\\b', 'a[uú]n\\s+(?:tienen|hay|quedan)',
  'busco\\s+(?:un[oa]?s?|el|la|tintas?|t[oó]ner|toner|cartuchos?|impresoras?|cabezal\\w*|repuestos?|papel)',
  // recompra ("lo mismo de la vez pasada")
  '(?:el|la|lo|los|las)\\s+mism[oa]s?\\s+(?:de|que|cotizaci[oó]n|pedido|cantidad|modelo|tintas?|t[oó]ner)',
  '(?:el|la|los|las)\\s+de\\s+siempre',
  'repetir\\s+(?:este\\s+|el\\s+)?pedido',
  'volver\\s+a\\s+(?:comprar|pedir|cotizar)',
  '(?:compr\\w+|ped[ií]\\w*|cotiz\\w+|trajo)\\s+(?:la\\s+)?(?:[uú]ltima\\s+vez|vez\\s+pasada|el\\s+mes\\s+pasado|la\\s+semana\\s+pasada)|(?:[uú]ltima\\s+vez|vez\\s+pasada|mes\\s+pasado|semana\\s+pasada)\\s*(?:que\\s+)?(?:compr|pedi|cotiz|trajo|me\\s+)'
].join('|'), 'i');

// Validado 2026-08-21 en Node: 12/12 frases positivas activan, 8/8 negativas no activan.

// Uso:
const esIntencionCompra = (msg) =>
  !RE_NO_INTENCION.test(msg) && RE_INTENCION_COMPRA.test(msg);
```

**Complemento imprescindible (descubrimiento §2):** un mensaje corto que sea solo un producto también es intención. Detector auxiliar:

```js
// Modelo/producto "pelado": marca+modelo, SKU, o cantidad+producto, o URL de la tienda
const RE_PRODUCTO_SOLO = /^(?:\d+\s+)?(?:(?:tintas?|t[oó]ner(?:es|s)?|toners?|cartuchos?|cabezal(?:es)?|impresoras?|rollos?|resmas?|cintas?|papel|kit|caja\s+de\s+mantenimiento)\s+)?(?:hp|epson|canon|brother|lexmark|kyocera|ricoh|xerox|apc)\b[\w\s.\-]{0,40}$|^[a-z]{1,3}[-\s]?\d{2,4}\s?(?:xl|xxl|a|h|x)?\b.{0,30}$|quickservicepanama\.com\/products\//i;
// Si RE_PRODUCTO_SOLO matchea y el mensaje tiene <60 chars → tratar como consulta de precio/stock.
```

Nota: la CTA "hola! quiero información" matchea `quiero` pero NO el regex (exige `quiero + comprar/pedir/...`); tratarla aparte con match de plantilla → flujo de bienvenida.

---

## 5. Hallazgo especial — cómo piden la RECOMPRA ("lo mismo de la vez pasada")

Frases reales encontradas (todas n=1 salvo indicado):

- "hola para repetir este pedido"
- "vamos a repetir esto"
- "favor cotícenme lo mismo"
- "quiero la misma cotización" / "quiero la misma cotización otra vez pero sin el toner de canon" *(recompra con modificación)*
- "la de siempre" / "los de siempre" / "de siempre." / "que sea donde siempre" *(entrega)*
- "soy el mismo cliente de siempre necesito cotizar un toner amarillo t10"
- "necesitamos por favor 1 cartucho de tinta negra y de color, el mismo modelo que compramos la ultima vez"
- "necesito dos de los kit de mantenimiento de la epson que te compre la última vez"
- "y las que le compre el mes pasado, ya se nos agoto." *(recompra por agotamiento)*
- "deseamos comprar las misma e igual cantidad" / "la misma cantidad" / "con las cantidad anteriores"
- "solicitamos esto de nuevo"
- "podrias despacharme exactamente las mismas tintas con envio?"
- "para volver a comprar tinta"
- "me pueden volver a cotizar estas tintas, por favor?"
- "esta fue la que me despacharon y las necesito igual"
- "buen dia necesito una cotizacion igualito fecha actualizada" / "este precio se mantiene, me envías una cotización igual actualizada" *(refresh de cotización vencida)*
- "agradezco me pueda enviar cotizaciones de las tintas que regularmente cotizamos"
- "me podria cotizar otra immpresora como la última q nos trajo"
- Por número de cotización previa: "actualiceme la cotizacion de esta bateria apc", "confírmeme existencia por favor de la cotización 77874", "aquí encontré una cotización. me agrega 1 106a"
- "creo que es ? puede verificar mi compra anterior si es 104 a" *(pide que el negocio consulte SU historial)*

**Implicación para el bot:** la recompra casi nunca nombra el producto — referencia el HISTORIAL ("la última vez", "el mes pasado", "lo de siempre", nº de cotización, "verifica mi compra anterior") o adjunta la foto/PDF de la cotización vieja. El bot necesita lookup de últimas compras/cotizaciones por teléfono, y detectar el patrón `mismo|igual|de siempre|otra vez|de nuevo|última vez|anterior|actualizada` + contexto de compra. Variante clave: recompra **con delta** ("lo mismo pero sin X", "igual pero 3 negras").

---

## 6. Lista de prueba

### DEBEN activar al bot (12)

1. "quiero hacer un pedido"
2. "necesito 3 tintas hp 951xl cyan, 3 magenta y 3 amarillas, ¿me cotizas?"
3. "me puede cotizar un tóner hp 85a"
4. "¿cuánto cuesta la impresora epson l3250?"
5. "precio de tinta epson 544?"
6. "¿tienen tóner para hp laserjet?"
7. "busco tinta negra para impresora canon g3160"
8. "buen día venden impresora epson l5590"
9. "¿tienen disponible el cartucho de mantenimiento canon mc-g04?"
10. "favor cotizar 2 toner ricoh p502 a nombre de mi empresa"
11. "necesitamos 1 cartucho negro y uno de color, el mismo modelo que compramos la última vez"
12. "estoy interesado en comprar una tinta brother bt5001, ¿cuál es el procedimiento?"

### NO deben activar (8)

1. "vale gracias"
2. "ya hice el pedido por el app"
3. "¿a qué hora traen el pedido?"
4. "el pedido no llegó ayer"
5. "¿cuánto tiempo tarda el envío a chitré?"
6. "aún espero la cotización" / "no me ha llegado la cotización"
7. "¿tienen tienda física?"
8. "quiero hablar con un asesor"
