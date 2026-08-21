# Diccionario: acuses de recibo y cierres del cliente (`es_ack`)

Minado de `messages` (role='user', 30,940 mensajes; 17,859 con longitud 1–25, donde vive ~todo el universo de acks).
Fuente: top 400 frases cortas dedupe + redes ILIKE de arranque ack con longitud > 25 + mensajes sin letras.
Nombres de personas anonimizados como `[nombre]`.

---

## 1. Acks puros (frase → frecuencia, top 50)

Mensaje completo = cierre. El bot NO debe responder (o a lo sumo reaccionar con 👍).

| # | Frase (normalizada lower/trim) | n |
|---|---|---|
| 1 | gracias | 1063 |
| 2 | ok | 465 |
| 3 | muchas gracias | 231 |
| 4 | listo | 131 |
| 5 | ok gracias | 120 |
| 6 | perfecto | 82 |
| 7 | vale | 51 |
| 8 | gracias! | 36 |
| 9 | correcto | 33 |
| 10 | listo gracias | 31 |
| 11 | excelente | 26 |
| 12 | mil gracias | 25 |
| 13 | recibido | 19 |
| 14 | vale gracias | 16 |
| 15 | gracias. | 15 |
| 16 | entiendo | 15 |
| 17 | esta bien | 15 |
| 18 | ok, gracias | 14 |
| 19 | muy amable | 14 |
| 20 | le agradezco | 14 |
| 21 | 👍 | 13 |
| 22 | solo eso | 13 |
| 23 | . (punto solo) | 13 |
| 24 | si gracias | 12 |
| 25 | muchas gracias! | 11 |
| 26 | no gracias | 11 |
| 27 | okis | 10 |
| 28 | ok muchas gracias | 10 |
| 29 | ok listo | 10 |
| 30 | 👍🏻 | 9 |
| 31 | perfecto gracias | 8 |
| 32 | okis gracias | 8 |
| 33 | super | 8 |
| 34 | con mucho gusto | 8 |
| 35 | bendiciones | 8 |
| 36 | vale muchas gracias | 7 |
| 37 | gracias [nombre] | 7 |
| 38 | gracia (typo) | 7 |
| 39 | listo, gracias | 7 |
| 40 | listo, muchas gracias | 7 |
| 41 | okey | 7 |
| 42 | gracias!! | 7 |
| 43 | perfecto muchas gracias | 7 |
| 44 | recibido, gracias | 7 |
| 45 | ah ok | 7 |
| 46 | 🫡 | 6 |
| 47 | gracias muy amable | 6 |
| 48 | gracias mil | 6 |
| 49 | igualmente | 6 |
| 50 | comprendo | 6 |

Variantes de cola frecuentes (n=3–6): `oki`, `oky`, `okk`, `okay`, `ok.`, `a ok`, `ahh ok`, `ah ok gracias`, `muchas gracias.`, `entiendo, muchas gracias`, `excelente gracias`, `excelente muchas gracias`, `dele gracias`, `okay gracias`, `de acuerdo`, `ok listo gracias`, `ok esta bien`, `ok perfecto`, `graciasss`, `graxias`, `graciad`, `thks`, `y gracias`, `gracias a ustedes`, `gracias por todo`, `gracias igual`, `se lo agradezco`, `muy agradecido`, `agradecida`, `muchísimas gracias`, `es correcto`, `exacto`, `solo eso gracias`, `recibido. gracias`, `recibida`, `gracias 🙏`, `gracias por la información` (26–33 chars, ack puro pese a ser "largo").

Emojis-ack sin letras (sección 3 del método): `👍 👍🏻 👍🏼 👍🏽 👍🏾 🙏 🙏🏻 🙏🏽 🫡 ☺️ 🙌 🫶🏽 😊 ❤️` y combinaciones/repeticiones. OJO: `?`, `??`, `???` (79+17+7) NO son acks — son nudges que exigen respuesta. Números sueltos (`1`, `2`, `530`) tampoco: suelen ser respuestas a menús o cantidades.

---

## 2. Falsos acks: empiezan como cierre pero PIDEN algo (→ sí responder)

### 2a. Cortos (≤25 chars) que la regla de longitud dejaría pasar como ack

| Frase | n | Por qué NO es ack |
|---|---|---|
| me confirma | 11 | pide confirmación |
| listo el pago | 7 | aviso de pago → confirmar recibo |
| pagado | 6 | aviso de pago |
| me avisa | 6 | pide aviso |
| tienen? / tienes? | 6+3 | pregunta |
| me confirmas | 5 | pide confirmación |
| pago realizado | 4 | aviso de pago |
| esperando respuesta | 4 | nudge, exige respuesta |
| aprobado | 4 | luz verde → continuar flujo |
| ok espero | 3 | espera activa |
| adjunto pago | 3 | aviso de pago |
| me confirma por favor | 3 | pide confirmación |
| ok si | 3 | respuesta a pregunta del bot |
| procedo | 3 | luz verde |
| dele / dale / oki dele | 9+4+6 | luz verde: "adelante" → el bot debe continuar |

### 2b. Largos (>25 chars) con arranque de ack

| Frase (ejemplos reales) | n | Patrón |
|---|---|---|
| ok, gracias por la información | 3 | (este SÍ es ack puro — contraejemplo del corte a 25) |
| gracias me confirma el envio en servi entrega / y por q transporte | 2 | gracias + pedir confirmación |
| gracias, me comparte la ubicacion por favor | 1 | gracias + pedir dato |
| gracias, hasta que hora se podria retirar? | 1 | gracias + pregunta |
| gracias, la impresora viene con alguna tinta incluida? | 1 | gracias + pregunta producto |
| gracias !!!! para el pago lo puedo hacer con tarjeta ? | 1 | gracias + pregunta pago |
| gracias buen día. y cual es el gramaje máximo de hojas...? | 1 | gracias + despedida + pregunta |
| gracias tienes disponibles tintas canon 210xl y 211xl | 1 | gracias + consulta stock (sin "?") |
| gracias de eso también lo mantienes en stock ? | 1 | gracias + stock |
| gracias si la tienes hasme la cotizacion ... y reservame una | 1 | gracias + orden |
| gracias y algun sitio que me recomiende por favor | 1 | gracias + pedido |
| excelente, por favor me pueden confirmar si tienen la tinta a color 141 | 1 | excelente + consulta |
| excelente podrias hacerme una cotizacion a nombre de... | 1 | excelente + cotización |
| listo añádame por favor a esta cotización. cómo es el servicio de instalación? | 1 | listo + orden + pregunta |
| listo me confirman para pagar | 1 | listo + confirmación |
| listo me envia para pagarselo por yappy | 1 | listo + pedir link/datos |
| listo, me puede enviar la cotizacion a mi correo | 1 | listo + pedido |
| listo seria pago contra entrega?? | 1 | listo + pregunta |
| listo, pero seguro que tienen? | 1 | listo + "pero" + duda |
| listo, es que necesito de 36" | 1 | listo + corrección de pedido |
| ok cotizame las 6. cuando estarían llegando más? | 1 | ok + orden + pregunta |
| ok me pueden enviar la cotización. | 1 | ok + pedido |
| ok hasta que hora pueden entregar ? | 1 | ok + pregunta |
| ok me puede pasar la cuenta para hacer la transferencia | 1 | ok + pedir datos |
| ok me podria ajustar el precio? | 1 | ok + negociación |
| dele y si me envia el enlace para pagar con la tarjeta | 1 | dele + pedido |
| correcto, más la compra del repuesto, cuánto sería todo | 1 | correcto + pregunta precio |
| ok pero falta la negra (patrón "pero") | — | ack + corrección |

### 2c. TRAMPA MAYOR: auto-respuestas de OTROS bots de WhatsApp (~60 casos)

Mensajes `role='user'` que son autoresponders de otras empresas: `"gracias por comunicarte con [empresa]. ¿cómo podemos ayudarte?"`, `"gracias por tu mensaje. en este momento no podemos responder..."` (n=5 la variante genérica). Empiezan con "gracias" Y contienen pregunta — una regla ingenua "contiene ? → responder" haría que nuestro bot le conteste a otro bot (loop infinito). Deben tratarse como NO-responder, pero con etiqueta propia (`bot_ajeno`), no como ack humano.
Patrón: `^gracias por (comunicart|comunicars|contactar|escribir|tu mensaje|su mensaje|el mensaje)`.

### 2d. Cierres-espera y avisos logísticos (zona gris)

- `quedo atento/atenta` (12+19), `quedo a la espera` (8), `quedo al pendiente` (3): cierre cortés PERO dejan algo pendiente (usualmente esperan al asesor humano). No responder con texto, pero deberían disparar recordatorio/escalado interno, no silencio total.
- `voy` (14), `voy en camino` (4), `llegando` (3), `voy para allá` (3+3), `ya le digo` (3), `le confirmo` (3), `le aviso` (3), `deme un momento` (3), `lo reviso` (3): status del cliente, no requieren respuesta del bot (👍 opcional).
- Avisos de pago (`listo el pago`, `pagado`, `adjunto pago`, `pago realizado`, `buenas tardes, adjunto comprobante de pago`): NO son ack — requieren confirmación de recibo por humano.

---

## 3. Saludos de APERTURA (sí esperan respuesta) vs despedidas

| Saludo | n |
|---|---|
| hola | 590 |
| buenas tardes | 495 |
| buenos días / buenos dias | 272+225 |
| buen día / buen dia | 188+172 |
| hola buenas tardes | 137 |
| buenas | 136 |
| hola buenos días/dias | 70+50 |
| hola buen dia/día | 57+50 |
| saludos | 38 |
| hola! quiero información | 31 |
| hola buenas | 29 |
| hola! / que tal / holaaa / hola que tal | 24+23+12+12 |
| buenas noches | 6 |

**Cómo separar apertura de despedida** (mismas palabras, intención opuesta):

1. **Posición en la conversación**: saludo standalone como primer mensaje de la sesión (o tras gap > 6 h desde el último intercambio) = APERTURA → responder. En los datos, "buen día"/"buenas tardes" solos son abrumadoramente aperturas (el cliente saluda y espera el "¿en qué puedo ayudarle?" antes de escribir su pedido — patrón WhatsApp panameño).
2. **Composición**: saludo pegado a token de gratitud = despedida → ack. Ej.: `gracias x su atención e igual tenga buenas noches`, `gracias buen día`, `ok gracias, saludos`. Regla: si la frase contiene `gracias|agradezco|amable` + saludo, gana el cierre.
3. **Contenido posterior**: saludo + pedido en el mismo mensaje (`buen día venden impresora epson l5590`, n=3) = apertura con contenido → responder al pedido.
4. **Nudge disfrazado**: `buenas tardes\nesperando respuesta` (n=4) = reclamo → responder/escalar.

Default seguro: saludo puro SIN gracias → responder siempre (costo de responder de más a una despedida rara es menor que ignorar una apertura).

---

## 4. Heurística propuesta (JS, flag i)

```js
// Normaliza: minúsculas, trim, sin tildes
const norm = s => s.toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// 0) Auto-respuesta de OTRO bot de WhatsApp -> no responder, etiquetar bot_ajeno
const RE_BOT_AJENO = /^gracias por (comunicar|contactar|escribir|(tu|su|el) mensaje)/i;

// 1) Solo emojis / puntuación de cierre (sin letras, dígitos ni '?')
const RE_SOLO_EMOJI = /^(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|‍|️|[\s.,!])+$/u;

// 2) Señales de PEDIDO: matan el ack aunque arranque con gracias/ok/listo
const RE_PIDE = /[?¿]|\b(me (confirma|confirman|avisa|avisan|envia|envian|manda|comparte|cotiza|indica|pasa|ayuda)s?|necesito|quiero|falta[n]?|cotiza(r|me|cion)?|puede[ns]?|podria[ns]?|tiene[ns]?|tendra[ns]?|hay|cuanto|cuanta|cual(es)?|donde|cuando|como (es|hago)|que precio|espero (la|el|que)|esperando|pero|y (la|el|los|las)\s)\b/i;

// 3) Aviso de pago: no es ack, requiere confirmación de recibo
const RE_PAGO = /\b(pago|pague|yappy|ach|transferencia|comprobante)\b/i;
const RE_PAGO_HECHO = /\b(listo|realizado|hecho|adjunto|enviado|pagado|capture)\b/i;

// 4) Frase compuesta SOLO de tokens de cierre (repetibles, con , . ! entre ellos)
const RE_ACK = /^(?:(?:muchas|muchisimas|mil|ok+|okay|okey|oki(?:s)?|oky|a{1,2}h?|listo|lista|perfecto|excelente|super|genial|vale|correcto|exacto|entendido|entiendo|comprendo|recibid[oa]|anotado|de acuerdo|esta bien|gracias+|gracia|graxias|graciad|thanks|thx|thks|muy amable|(?:muy )?agradecid[oa]|(?:se )?l[eo] agradezco|con mucho gusto|bendiciones|igualmente|igual|saludos|solo eso|nada mas|no gracias|si gracias|por (?:todo|la (?:informacion|atencion|ayuda|cotizacion))|a ustedes?|feliz (?:dia|tarde|noche|semana)|buen (?:dia|provecho)|buenas? (?:tardes?|noches?)|hasta luego|nos vemos|chao|adios|\[nombre\]|\w{2,15})[\s,.!;:]*)*(?:gracias+|ok+|listo|perfecto|vale|correcto|entendido|recibid[oa]|de acuerdo|esta bien|muy amable|igualmente|bendiciones|solo eso|excelente)[\s,.!;:\u{1F44D}\u{1F64F}\u{1FAE1}]*$/iu;
// Nota: en producción conviene implementarlo como token-set (split por [\s,.!]
// y exigir que TODOS los tokens estén en ACK_SET) en vez de un mega-regex.

// Saludo puro (posible apertura)
const RE_SALUDO_PURO = /^(?:hola+!?|alo|buen dia|buenos dias|buenas(?: tardes?| noches?)?|que tal|saludos|tardes)[\s,.!]*$/i;

// Confirmaciones/luz verde: son RESPUESTA al bot si hay pregunta pendiente
const RE_LUZ_VERDE = /^(?:si+|sip|no|dale|dele|ok|correcto|exacto|aprobado|procedo|de acuerdo)[\s,.!]*$/i;

function esAck(raw, ctx = {}) {
  // ctx.esInicioConversacion: 1er msg o gap > 6h
  // ctx.botPreguntoAlgo: el último mensaje del assistant terminó en pregunta/menú
  const t = norm(raw);
  if (RE_BOT_AJENO.test(t))  return { ack: true,  motivo: 'bot_ajeno' };   // no responder, no es humano
  if (RE_SOLO_EMOJI.test(raw.trim())) return { ack: true, motivo: 'emoji' };
  if (RE_PAGO.test(t) && RE_PAGO_HECHO.test(t)) return { ack: false, motivo: 'aviso_pago' };
  if (t.length > 80)         return { ack: false, motivo: 'largo' };
  if (RE_PIDE.test(t))       return { ack: false, motivo: 'pide_algo' };
  if (RE_SALUDO_PURO.test(t) && ctx.esInicioConversacion !== false)
                             return { ack: false, motivo: 'saludo_apertura' };
  if (RE_LUZ_VERDE.test(t) && ctx.botPreguntoAlgo)
                             return { ack: false, motivo: 'respuesta_a_pregunta' }; // continuar flujo
  if (RE_ACK.test(t))        return { ack: true,  motivo: 'ack_puro' };
  return { ack: false, motivo: 'default_responder' };
}
```

Orden de evaluación clave: **bot_ajeno → emoji → pago → longitud → pide-algo → saludo-apertura → luz-verde-con-pregunta-pendiente → ack**. El corte de longitud sube de 25 a ~80 porque `ok, gracias por la información` (28 chars) es ack puro; RE_PIDE es quien realmente separa.

---

## 5. Lista de prueba

### 12 que SON ack (no responder) — todos minados de datos reales

1. `gracias`
2. `ok gracias`
3. `muchas gracias!`
4. `listo, muchas gracias`
5. `perfecto gracias`
6. `vale, gracias`
7. `👍🏻`
8. `🙏`
9. `recibido, gracias`
10. `ok, gracias por la información` (>25 chars y sigue siendo ack)
11. `solo eso gracias`
12. `gracias muy amable` / `gracias x su atención e igual tenga buenas noches` (despedida con saludo)

### 8 que NO son ack (sí responder / actuar)

1. `gracias, y cuánto cuesta el envío?` → pregunta tras gracias
2. `ok pero falta la negra` → corrección de pedido
3. `listo, ¿me confirmas cuando salga?` → pide confirmación futura
4. `listo el pago` → aviso de pago: confirmar recibo (humano)
5. `buenas tardes` (primer mensaje de la sesión) → apertura, saludar y atender
6. `esperando respuesta` / `buenas tardes esperando respuesta` → nudge, responder o escalar
7. `gracias tienes disponibles tintas canon 210xl y 211xl` → consulta de stock sin signo de pregunta
8. `dele y si me envia el enlace para pagar con la tarjeta` → luz verde + pedido de link de pago
