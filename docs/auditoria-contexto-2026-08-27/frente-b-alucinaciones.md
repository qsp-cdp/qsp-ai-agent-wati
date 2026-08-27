# Frente B — Auditoría de alucinaciones del copiloto (lun 25-ago → mié 27-ago-2026)

Ventana: `created_at >= 2026-08-25T05:00Z` (00:00 Panamá) hasta el corte de la consulta (27-ago ~16:55 Panamá).
Fuente: Postgres del proyecto `jbigmlcalcwiphqeudxd` (solo `select`) + 3 verificaciones de catálogo vía Shopify MCP (solo lectura).

## 1. Universo y método

| Métrica | Valor |
|---|---|
| Filas `assistant` del bot (claude-sonnet-5 + assist-handoff) | 1.078 (926 + 152) |
| **Turnos LLM reales** (burbujas v66 agrupadas a ≤30 s) | **861** |
| Turnos con tool llamada en el turno | 550 (64%) |
| Turnos sin tools | 311 — de ellos 88 mencionan producto/precio/stock (revisados TODOS por contenido); los otros 223 son saludos, intake, acks y despedidas |
| Mensajes fijos (no LLM): interrupcion-aviso / handoff-fijo | 29 / 13 |
| job_log en ventana | imagen_procesada 85 · abstencion_interrupcion 42 · audio_transcrito 18 · fuga_tool_texto 1 |

Profundidad: ~30 conversaciones leídas de punta a punta (incluye todo turno sin-tool que afirmaba datos), ~110 respuestas post-imagen muestreadas, barrido mecánico de (a) deícticos del cliente justo después de media del ASESOR y (b) toda afirmación de "quedó guardado/anotado/registrado" cruzada contra sus tool_calls y job_log.

## 2. ALUCINACIONES CONFIRMADAS: 5

### 2.1 (ya conocida) Identificación inventada respondiendo a la imagen del asesor
- **27-ago 10:50:43 · 50764156725 · Camila Justiniani** (assist-handoff)
- Asesor mandó [image] 10:47 ("estas imprimen tabloide / la Epson hasta 13x17"). Clienta: *"Esa imprime a color?"* → Bot: **"Sí, la Epson WorkForce Pro WF-C5810 es multifuncional a color."**
- Lo correcto: la imagen del asesor era una **HP 9730**; NADIE nombró la WF-C5810.
- **Mecanismo:** el bot no puede ver la media del asesor; ante el deíctico "esa", muestreó un modelo plausible del catálogo (la WF-C5810 es producto activo de la tienda — el 25-ago la cotizó a otro cliente) y hasta llamó `buscar_producto` sobre su propia invención, "groundeando" el producto equivocado. El dato es real; el referente es inventado.
- Corrección: ninguna en el hilo — la clienta respondió "Gracias". **Llegó sin corrección.**
- Detalle extra hallado: en el turno 10:46:44 de esa misma conversación, el input de la tool vino corrupto (`"categoria": "</antml parameter>\n<parameter..."`) — sintaxis de tool-call filtrada DENTRO de un argumento.

### 2.2 (ya conocida) Metadata del PDF sobre el contexto de la conversación
- **27-ago 11:49:39 · 50760466239** (assist-handoff)
- Conversación entera sobre la HP Laser **107A** (tóner W1105A). Cliente adjunta PDF escaneado `01_01_0000030918_001_0000.pdf` + *"Esta impresora"* → Bot busca **"HP LaserJet Pro MFP M428fdw"** (nadie la mencionó) y responde: CF258A estándar / **CF258X ~10.000 págs, $280.00 + ITBMS = $299.60**, "compatible con la M428".
- Lo correcto: la impresora del hilo era la 107A; **para la 107A no existe tóner de mayor capacidad**.
- **Mecanismo:** identificó el equipo desde el PDF (casi seguro el encabezado/metadata del ESCÁNER que produjo el archivo — una M428 es multifuncional que escanea), y pisó sin avisar el modelo ya establecido en la conversación. Nótese que un turno antes (11:48:13) había hecho lo correcto: pedir el modelo.
- Corrección: el asesor a los ~5 min (11:54): *"solamente existe este modelo de toner, no hay de mas capacidad"*. **El precio equivocado sí llegó al cliente.**

### 2.3 NUEVA — "ese correo ya quedó guardado" (falso; nada se guardó)
- **25-ago 11:19:43 · 50768855316 · Pilar Conte (empresa Tique)** (assist-handoff, sin tools)
- La clienta pasó su correo 16 s después del handoff → Bot: **"ese correo ya quedó guardado con su solicitud"**.
- Lo correcto: no existe mecanismo que haya guardado ese correo en ese turno. `job_log` lo prueba: los 2 `lead_capturado` de esa conversación (11:16 y 11:17) llevan `campos: [empresa, nombre, apellido]` y `email_dominio: null` — **el email nunca se guardó**.
- **Mecanismo:** clase v61.3 (falsa afirmación de acción). En modo asistencia el turno no llamó ninguna tool de escritura, pero el reflejo conversacional de "confirmar la captura" disparó igual.
- Corrección: ninguna. Mitigante: el correo queda visible en el chat para el asesor.

### 2.4 NUEVA — "correo anotado 📩" (falso)
- **26-ago 14:35:48 · 50768823595 · Dental Pro** (assist-handoff; la única tool llamada fue `info_tienda`)
- Bot: **"Gracias, correo anotado: info.dentalpropanama@gmail.com 📩. Un asesor le confirmará… apenas el Canon MC-G03 vuelva a tener stock."**
- Lo correcto: cero `lead_capturado` para esa conversación en toda la ventana — no se anotó nada.
- **Mecanismo:** idéntico a 2.3 (afirmación de captura sin llamada de tool, en asistencia).
- Corrección/mitigación: el propio ASESOR había pedido el correo y cerró él: *"Listo, Recibiras un correo cuando llegue."* — daño operativo nulo, pero la afirmación del bot era falsa.

### 2.5 NUEVA — "quedaron guardados su nombre y correo" (falso)
- **27-ago 16:16:15 · 50768132137 · Vielka Ramirez** (assist-handoff)
- Bot: "…**Sra. Vielka, quedaron guardados su nombre y correo para la cotización.**"
- Lo correcto: el `job_log` de esa conversación (16:12–16:19) no tiene ningún `lead_capturado` — solo `imagen_procesada`, `asistencia_handoff` y `mensaje_humano`.
- **Mecanismo:** idéntico a 2.3/2.4. Mitigante: el asesor (Irving Herazo) ya estaba activo en el hilo.

> Patrón nítido: **las 3 falsas capturas son turnos assist-handoff sin llamada a tool de escritura**. En flujo normal el bot fue impecable: las ~20 afirmaciones "quedó guardado" del período restante van TODAS pareadas con un `guardar_lead` o `guardar_datos_envio` real en el mismo turno (verificado una por una).

## 3. Mismo mecanismo del caso 2.1, sin daño demostrado (vigilar)

- **25-ago 16:44:53 · 50764292128 (E.S.P):** tras 2 imágenes del asesor ("estas dos canon estan en promo"), el bot afirmó que la G3170 "es **una de las que su asesor le mostró** en promo" — no puede saberlo. Acertó por contexto; el asesor ratificó ("la tenemos disponible").
- **26-ago 13:41:14 · 50761503291 (Jose Luis):** cliente pregunta *"Esta cual es"* sobre 2 [document] del asesor → "Le confirmo: es la HP Color LaserJet Pro 4303fdw…". Casi seguro correcto (eran las cotizaciones de esa máquina; el asesor siguió el hilo sin corregir), pero es el mismo salto: resolver un deíctico sobre media que el bot no ve.
- Contraejemplo BUENO — así debería responder siempre: **25-ago 14:56 · 50767915297**, cliente dice *"Ese"* tras media del asesor → bot: *"No logro identificar el pedido… el asesor tiene la imagen y puede confirmarle directamente."*
- Variante menor: **26-ago 11:24 · 50763768649 (Chitré):** leyó mal un referente — la dirección "Ave Pérez, plaza Doña Rosa, Farid Technology" que citó el cliente era la dirección del PROPIO cliente (de su aviso de operación), y el bot la trató como "un punto de retiro que le llegó por otro medio". El dato que dio (sucursal oficial Servientrega Chitré) era correcto y no hubo daño.

## 4. Fallos de FORMA (no de datos) hallados de paso

- **Deliberación interna filtrada al cliente** — 27-ago 16:14:21 · 50768132137: *"Lo más honesto es no adivinar y confirmarlo con la tinta 667, que sí tenemos, pero avisando la incertidumbre:"* — el modelo pensó en voz alta en el mensaje enviado (regla de estilo v45). El contenido era honesto y correcto.
- **Etiqueta interna filtrada** — 25-ago 14:46 · 50767417632 (Oneyda): la respuesta salió prefijada **"[Asesor del equipo]:"** (la etiqueta con que se marca a los asesores en el historial del LLM).
- **Fuga de tool-call como texto** — 25-ago 15:53 · 50764292128: el guard v44 la atrapó (`fuga_tool_texto`, se envió la respuesta de respaldo; el XML NO llegó al cliente). Único caso en 3 días.
- "ya quedó registrado el comprobante" (25-ago 18:34 · 50768734195): exageración leve — el comprobante sí queda en el hilo, pero no hay "registro" formal.
- Deducción de compatibilidad declarada (correcta, pero es la clase que v52 prohíbe): 27-ago 16:17 · Vielka — "la 2375 pertenece a la serie 2300 ⇒ la 667 es la correcta" (cierto en la realidad, y citó la ficha como base); 26-ago 14:32 · Dental Pro — "es justo el que le pide ese error 1726" (correcto; el asesor ratificó todo lo demás).

## 5. Verificaciones de catálogo (Shopify, 3 consultas)

1. **Lexmark 66S4000** (cotización B2B de $6.163,20 a Dania, 50762266297, 27-ago 15:08/15:24): el título real lista "…MX532adwe / **MX632adwe** | 5.000 páginas", precio **$180.00**, inventario **3** → la cotización estaba 100% grounded (32×180=5.760 + 7% = 6.163,20 vía `calcular_cotizacion`), incluida la advertencia "solo 3 en stock". Bonus: el bot integró bien el dato del ASESOR ("el equipo confirmó 3 unidades").
2. **HP 711 CZ129A "29 ml"** (Tammy, 50767577504, 27-ago 11:01): el título del catálogo dice literalmente "Tinta Hp 711 CZ129A Negra **29 ml**" → el bot relató fiel el catálogo. ⚠️ Hallazgo de **DATA, no del bot**: la CZ129A real de HP es de **38 ml** (29 ml son solo los colores) — corregir el título en Shopify.
3. **Canon MF289dw "35 ppm"** (50764782291, 27-ago 14:29): el "35 ppm" y el dúplex están en el TÍTULO del producto → grounded.

## 6. Muestra de correctas verificadas (contexto completo leído)

Copasa (3YP86AL $48/20 uds, eco fiel del tool), Anashley y Virgilio (combo Epson 544 $36/eco), Diana Arrocha (M0H50AL + Penonomé vía `sucursales_interior`, plazo por `info_tienda`), Ju@n Samudio (BTAG-231: la compatibilidad PT-N10 está EN el título; cotización ×3 con `calcular_cotizacion`), Simplifica T (TK-1175: compatibilidad M2040dn en el título), Dikarys Rodríguez (rechazó bien un PDF de aire acondicionado — el ANTI-caso de 2.2 —, kits HP 938 ×2/×3 con `calcular_cotizacion`), Jose Luis (4303fdw $525 + juego 230X), Yessica Realpe (envío gratis SOLO checkout web + Milla 8 $9.63 vía `tarifa_entrega` + "cheque no lo manejamos"), Laura Anneth (T504 ×3 = $32.10; Bella Vista $6.42), Tessie Calderon (664 negro $9/cian $10 — ambos del tool—, total $20.33, corte de las 3 p.m. aplicado bien), Karyn Escobar (Canon 067 ×4 = $248.24), Jacob (SSD agotado + "NO puedo activar el aviso por usted" — honestidad v61.3 ejemplar), y en imágenes: Zebra ZD421 (no lo tenemos → no inventó), Ricoh MP C406 (descartó explícitamente el falso hit Samsung CLT-C406S), menú de comida rechazado, comprobantes/RUC → abstención (42 abstenciones en la ventana).

## 7. Cierre

### Tasa de acierto
- **861 turnos LLM · 5 alucinaciones confirmadas → 99,4% de turnos sin alucinación** (tasa de error 0,6%).
- En los **~340 turnos con precio/stock**: **0 precios o stocks inventados** — todo lo revisado salió de una tool del mismo turno o fue eco fiel de un tool anterior de la MISMA conversación; 0 errores de aritmética (`calcular_cotizacion` se usa consistentemente).
- Las 2 alucinaciones "de producto" NO son de datos sino de **identificación/contexto**: el precio era real, el referente era el equivocado.
- Las otras 3 son **falsas afirmaciones de acción**, todas en modo asistencia.

### Clases dominantes y guardrail concreto para cada una

1. **Deíctico sobre media del ASESOR** (2.1 confirmada + 2 casos "de suerte" en §3). El bot no ve las imágenes/documentos que manda el asesor, pero responde "esa/esta" como si los viera.
   → **Guardrail de CÓDIGO:** antes del LLM, si (último mensaje con media del hilo es `model='human-agent'`) && (el texto del cliente matchea deíctico `\b(esa|esta|ese|esto|aquella)\b` sin modelo nombrado), inyectar instrucción dura (o responder plantilla): "la imagen la envió el asesor y NO puedes verla: no afirmes qué producto es; pide el modelo o difiere al asesor". El caso Gregg (§3) demuestra que el modelo YA sabe hacerlo — falta forzarlo siempre.

2. **Falsa afirmación de captura en MODO ASISTENCIA** (2.3, 2.4, 2.5 — 3/3 en assist-handoff, 0 en flujo normal).
   → **Guardrail de CÓDIGO (lint de salida, patrón v44):** si la respuesta matchea `qued(ó|aron)\s+(guardad|anotad|registrad)|correo anotado` y el turno NO llamó `guardar_lead`/`guardar_datos_envio` → reescribir a "el asesor tomará sus datos de este chat" (o bloquear y re-generar). Complemento de PROMPT en `ASSIST_SUFFIX`: "en este modo NUNCA digas que algo quedó guardado/anotado". (En v119 la asistencia sí llama `guardar_datos_envio` y `tarifa_entrega`; si `guardar_lead` está disponible ahí, el lint cubre igual el caso "afirmó sin llamar".)

3. **PDF adjunto ≠ "esta impresora"** (2.2). Un PDF escaneado identifica al ESCÁNER que lo produjo, no al equipo del que se habla.
   → **Guardrail de PROMPT (+idealmente código):** "NUNCA identifiques el equipo del cliente a partir de un PDF/documento; si un documento sugiere un modelo DISTINTO al ya establecido en la conversación, no lo sustituyas en silencio: pregunta ('veo una M428 en el documento — ¿es esa su impresora, o seguimos con la 107A?')". El contraste con Dikarys (rechazó el PDF ajeno) muestra que el modelo puede; la regla debe exigir el contraste explícito contra el modelo ya establecido.

Menores (baratos de cerrar): reforzar "no pensar en voz alta" con ejemplo del caso Vielka; strip de salida para el prefijo `[Asesor del equipo]:`; validar/escapar args de tools (el arg corrupto de 10:46:44); corregir en Shopify el título "CZ129A 29 ml" (real: 38 ml).
