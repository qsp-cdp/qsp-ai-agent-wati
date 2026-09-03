# Un robot no es un asesor (03-sep-2026)

> Isaac, tras el arreglo del despacho: *"¿Entonces este chatbot queda como está?"*

La respuesta corta es no, y buscando por qué apareció algo que no estaba en el radar: **el chatbot de WATI
le estaba reseteando al copiloto el reloj del asesor**, y en el peor momento posible.

## Lo que se archivaba mal

Todo lo que sale del inbox de WATI llega al webhook con `owner=true`. Hasta hoy, cualquier saliente que no
fuera un eco propio del bot se guardaba como **`human-agent`**: ponía la conversación en `handoff` y
arrancaba el reloj de 15 (ahora 10) minutos durante los cuales el copiloto calla para no pisar al asesor.

Pero de los cinco operadores del inbox, **dos no son personas**. Medido sobre 60 días de `job_log`:

| operador | mensajes | convs | qué es |
|---|---:|---:|---|
| Irving Herazo | 6.530 | 1.122 | persona |
| Miguel Cabrera | 5.719 | 834 | persona |
| Isaac Gerente de Ventas | 782 | 346 | persona |
| **Bot** | **114** | **20** | el chatbot del flowbuilder |
| **api-token-user.764@clare.ai** | **30** | **24** | el token de la API (`wati-order`, `shipday-status`) |

**144 mensajes en 44 conversaciones haciéndose pasar por asesor.** Y de esos 144, **96 tuvieron un mensaje
del cliente dentro de los 10 minutos siguientes** — exactamente la ventana en la que el copiloto concluye
"hay un asesor atendiendo" y se aparta.

## Por qué no era solo telemetría

El chatbot *"Despachar a Shipday"* abre con **"Necesitamos tu dirección de entrega primero 📍"** y sigue con
las tres preguntas del flujo viejo. Probadas contra el `PIDE_ENVIO_RE` real del copiloto, **cuatro de sus
cinco frases matchean**:

```
MATCH  Necesitamos tu dirección de entrega primero 📍
MATCH  ¿Cuál es la dirección exacta?
MATCH  ¿Alguna referencia?
MATCH  Por favor comparte tu ubicación 📎
no     ⚠️ No pudimos guardar tu dirección, un asesor te ayudará en un momento.
```

Como se archivaban como `human-agent`, encendían `pidioEnvioElAsesor`. Y en v121 esa señal **anula a
propósito** la espera de 10 minutos:

```ts
const puedeAsistir = habriaAsistido && (!asesorActivo || pidioEnvioElAsesor || continuaAsistencia);
```

Es una excepción diseñada para cuando **una persona** acaba de pedir la dirección: ahí el bot debe ayudar,
no callar. Con un robot disparándola, el copiloto arrancaba su propia captura de dirección **encima** de
las tres preguntas del chatbot. Dos flujos preguntando lo mismo al mismo tiempo — y solo uno de los dos
guarda de verdad, porque el del chatbot postea a `wati-address`, retirada el 21-ago (responde 410).

Encaja con lo que se ve en el hilo del incidente del despacho a las 10:31: el cliente contestando
*"agente"*, *"panama treasures"*, y después *"¿Cada vez que les compro debo repetir lo mismo?"*.

## El arreglo (v123)

Una denylist de operadores-máquina; todo lo demás se presume persona:

```ts
const OPERADOR_MAQUINA_RE = /^(?:bot|api-token-user\.\d+@[\w.-]+)$/i;
const esOperadorHumano = (operador: string): boolean => !OPERADOR_MAQUINA_RE.test((operador ?? "").trim());
```

Un mensaje de máquina **se sigue guardando** —el bot debe leer al cliente, al asesor y a sí mismo en
secuencia, que es el pedido explícito de Isaac— pero bajo `model = 'sistema-wati'`, que no es
`human-agent`: no arranca el reloj, no enciende `pidioEnvioElAsesor`, no manda a `handoff`. En el historial
se rotula como **`[Mensaje automático del sistema]`**: sin rótulo el modelo lo leería como algo que dijo él
mismo y daría por hecho que ya preguntó la dirección. Es la cuarta voz del hilo.

`mensaje_humano` en `job_log` queda limpio (solo personas); las máquinas van a `mensaje_sistema`.

### Por qué DENYLIST y no allowlist

Isaac dio la lista de quién *debería* estar: Miguel, Isaac, Irving y el token de la API. Es tentador
convertirla en allowlist, pero el fallo es asimétrico:

- **Allowlist** — el día que entre un asesor nuevo que nadie agregó, el copiloto le habla **encima
  mientras cierra una venta**. Es exactamente lo que la anti-interrupción existe para impedir.
- **Denylist** — un robot nuevo sin listar hace que el bot **calle de más**. Se ve en la telemetría y se
  corrige con una línea.

El error se elige hacia el lado que no le cuesta una venta a nadie. El patrón del token cubre cualquier
número, no solo el 764.

### El orden importa

El copiloto envía por **ese mismo token**, así que sus propias respuestas también vuelven como
`api-token-user.…`. Lo único que las distingue de una notificación de `wati-order` es el **anti-eco**
(mismo texto, <5 min), que por eso sigue corriendo **antes** de la decisión humano/máquina. Invertirlo haría
que el bot guardara cada respuesta suya una segunda vez y la leyera duplicada. Hay un golden que lo fija.

## Efecto en los RPC que leen `human-agent`

| RPC | efecto |
|---|---|
| `asistencia_pendientes` (barrido) | **Deseado.** Mide el silencio desde el último asesor *real*; deja de darse por satisfecho con un robot. |
| `resumen_diario` | `atendidos` y `sin_atencion` **no cambian** (son un `OR` de los dos baldes). Solo se reclasifican ~2,4 de ~330 mensajes/día de `de_asesores` a `del_bot`. |
| `contactos_posibles_proveedores` | Misma reclasificación, magnitud despreciable. |

**Lo que NO se toca:** la lista *"sin responder"* del correo diario se calcula por *"el último mensaje es
del cliente"*, no por `hubo_bot`/`hubo_asesor` — un mensaje de máquina no puede esconder a un cliente sin
atender. Verificado en el fuente del RPC.

## Pruebas

**762 golden** (19 nuevos) + las 4 suites. Los locks fijan: los cinco operadores reales; que un asesor
**nuevo no listado** siga siendo persona (el lock que define el diseño); que el operador vacío se presuma
persona; que el patrón del token generalice; el orden anti-eco → decisión; y el rótulo del historial.

Dos locks de v121 se actualizaron porque el contrato se volvió **más estricto** (tener operador ya no basta
para ser persona). Se conservan las dos propiedades que protegían: el entrante nunca cuenta como asesor, y
el re-enganche del cron tampoco.

## Lo que sigue pendiente del lado de WATI

Esto arregla el lado del copiloto, pero **no arregla el chatbot**. Su rama de error sigue haciendo tres
preguntas y mandándolas a `wati-address`, retirada el 21-ago porque duplicaba la captura del copiloto
(hoy responde 410; ver `docs/legacy/README.md`): el cliente contesta todo y no se guarda nada. Con
`wati-order` v64 eso ya solo le pasa a un cliente **nuevo** — el que estrena, el peor a quien fallarle.

En el flowbuilder: quitar las tres preguntas y el POST, y dejar un webhook-call a

```
POST https://jbigmlcalcwiphqeudxd.functions.supabase.co/copilot-webhook?captura=1&key=<COPILOT_WEBHOOK_KEY>
body: {"waId": "{{phone}}"}
```

## Verificar tras desplegar

```sql
-- Debe empezar a aparecer (y `mensaje_humano` a quedarse solo con los tres nombres de personas)
select detail->>'operador' as operador, count(*) from job_log
where action = 'mensaje_sistema' and created_at >= now() - interval '7 days' group by 1;

-- La medida del cambio: asistencias que ANTES quedaban bloqueadas por un robot
select detail->>'motivo' as motivo, count(*) from job_log
where action = 'asistencia_handoff' and created_at >= now() - interval '7 days' group by 1;
```
