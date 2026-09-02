# El asesor activo tiene la palabra: 10 minutos antes de que el bot intervenga (02-sep-2026)

> Pedido de Isaac tras revisar la operación del 31-ago al 02-sep: *"Está pisando a los asesores humanos,
> mejor le damos un tiempo de delay de 10 minutos, para que intervenga. Además le falta leer lo que el
> asesor humano escribe también para mejorar su contexto."*

## Lo que mostró la revisión (31-ago → 02-sep, hora Panamá)

| | 31-ago | 01-sep | 02-sep |
|---|---|---|---|
| mensajes de clientes | 536 | 471 | 504 |
| mensajes de asesores | 345 | 297 | 251 |
| respuestas del bot (flujo normal) | 204 | 234 | 206 |
| asistencias en handoff enviadas | ~43/día (128 en total) | | |

### "Está pisando a los asesores" — confirmado, y con causa

**47 respuestas del bot en conversaciones donde el asesor había escrito hacía menos de 10 minutos**, en
29 conversaciones. **27 de las 47 a menos de 2 minutos** del mensaje del asesor. 45 de las 47 salieron por
el camino de asistencia (`assist-handoff`).

La causa no es un bug: es **v79 (20-ago)**, que quitó el reloj de 15 minutos a propósito ("asistencia por
contexto, no por reloj"). Desde entonces, si el cliente preguntaba algo que el bot responde con una
herramienta (precio, stock, tarifa), el bot respondía **aunque el asesor acabara de escribir**. El único
freno que quedó, v110, calla al bot solo cuando NO llamó a ninguna herramienta — y en estos 47 casos casi
siempre la llamó. Con el dato en la mano, se metía en medio de la venta.

Ejemplos reales del período (asesor hacía N min → lo que dijo el bot):

- 1 min → *"No, los precios se mantienen igual a los de la cotización que le pasé: $67.00, $51.00…"* (el
  bot habla de "la cotización que le pasé" — la había pasado el asesor).
- 0 min → *"⚠️ Le confirmo: actualmente ninguno de los 4 tóner tiene stock disponible…"*
- 2 min → *"Para la Brother HL-L2380DW, el tóner compatible es: Tóner Brother TN-660…"*
- 6 min → *"No veo en el chat cuál es el modelo exacto de cyan/magenta que ya cotizó el asesor, así que
  no quiero…"* (ver el punto siguiente).

### "Le falta leer lo que el asesor escribe" — dos huecos concretos

El mecanismo existe: los mensajes del asesor se guardan (`model='human-agent'`, 894 en el período, ninguno
con model nulo) y entran al historial etiquetados `[Asesor del equipo]:`. Pero:

1. **El 23% de lo que escribe el asesor es un archivo** — 205 de 896 mensajes son `[document]` o
   `[image]`: la cotización en PDF, la captura de pantalla. El bot ve el marcador y **nada más**. Sin
   aviso, lo trataba como un hueco y se ponía a adivinar (*"no veo en el chat cuál es el modelo que ya
   cotizó el asesor"*, *"no tengo claro cuál es 'la máquina' que el asesor le está cotizando (el
   documento…"*).
2. **La ventana de historial de la asistencia era de 10 filas.** En el **28% de las asistencias** (36 de
   128) esa ventana dejaba fuera mensajes del asesor de la misma sesión — hasta 21 en un caso. El bot
   respondía sin haber leído lo que el asesor ya había dicho.

## El cambio (v121)

1. **Vuelve el reloj, a 10 minutos.** `HANDOFF_ASSIST_MIN` pasa de 15 a **10** por default, y
   `puedeAsistir` exige que el asesor lleve ≥10 min callado. Excepciones, las que el asesor mismo
   provoca: la captura de dirección que él activó (`captura_hasta`), el "¿me da su dirección?" que él
   escribió (`asesor_pidio_envio`), y la continuidad **estricta** de una asistencia que el bot ya tenía
   abierta (`continuaAsistencia`: el último en hablar fue el bot *en asistencia* — un aviso fijo tipo "le
   paso con un asesor" no cuenta). El cold-return y los guardarraíles de contexto no cambian.
2. **El barrido es la red de seguridad, con el mismo número.** El barrido ya recibe `p_asesor_min:
   HANDOFF_ASSIST_MIN`, así que también pasa a 10 sin tocarlo. Un cliente al que el bot calló aquí y al
   que el asesor tampoco respondió lo rescata el barrido cuando el silencio del asesor pase de 10 min.
3. **La asistencia lee 20 filas** en vez de 10. El flujo normal (`status='bot'`) sigue en 10: ahí no hay
   asesor que leer.
4. **El archivo del asesor va etiquetado**: `[Asesor del equipo — envió un archivo cuyo contenido NO
   puedes ver; no supongas qué dice]: [document]`. Ni lo repite, ni lo contradice, ni lo inventa.
5. **Telemetría:** cada vez que el reloj calla al bot en un caso que ANTES habría asistido queda
   `asistencia_handoff {motivo: asesor_activo_espera, mins_sin_asesor}`. Ese número dice si los 10
   minutos están bien calibrados.

## Lo que hay que hacer aparte del deploy (operación)

El reloj sin barrido ágil deja un hueco: hoy el barrido corre **cada 20 min** y exige **25 min** de espera
del cliente → un cliente callado por el reloj podría esperar hasta ~45 min. Para que la espera sea de
10-20 min:

```sql
-- SQL Editor: el barrido cada 10 min (mismo horario hábil)
select cron.alter_job(
  (select jobid from cron.job where jobname = 'asistencia-sweep-20min'),
  schedule := '*/10 14-21 * * 1-5'
);
```

```powershell
# secretos: espera del cliente 25 → 10 (el umbral del asesor ya queda en 10 por el default del código)
npx supabase secrets set --project-ref jbigmlcalcwiphqeudxd "COPILOT_SWEEP_ESPERA_MIN=10"
```

Si se prefiere otro umbral, `COPILOT_HANDOFF_ASSIST_MIN` lo cambia sin redeploy (gobierna el reloj
reactivo Y el barrido a la vez — a propósito: si divergen, el bot calla por un número y rescata por otro).

## Cómo leer si funcionó (una semana después)

```sql
-- ¿Cuántas veces el reloj calló al bot, y cuánto llevaba el asesor? (debe parecerse a los 47 de la
-- revisión: ~15/día)
select date_trunc('day', created_at at time zone 'America/Panama') as dia, count(*),
       round(avg((detail->>'mins_sin_asesor')::numeric), 1) as mins_prom
from job_log where action = 'asistencia_handoff' and detail->>'motivo' = 'asesor_activo_espera'
group by 1 order by 1;

-- ¿Las pisadas desaparecieron? (misma consulta de la revisión: bot <10 min tras el asesor)
-- Debe quedar solo lo invitado: captura / asesor_pidio_envio / continuación.
select count(*) from messages b
where b.model = 'assist-handoff' and b.created_at > now() - interval '7 days'
  and exists (select 1 from messages a where a.conversation_id = b.conversation_id
              and a.model = 'human-agent' and a.created_at < b.created_at
              and b.created_at - a.created_at < interval '10 min');

-- ¿El barrido está rescatando a los que el reloj calló? (origen=barrido, enviados)
select count(*) from job_log where action = 'asistencia_handoff'
  and detail->>'origen' = 'barrido' and (detail->>'enviado')::boolean
  and created_at > now() - interval '7 days';
```

## Lo que este cambio NO resuelve

- **El bot sigue sin poder leer el contenido de un PDF del asesor.** Solo sabe que existe. Leerlo es
  posible (v98 ya lee PDFs del cliente), pero un PDF de cotización trae precios y el riesgo de que el bot
  los re-cite es exactamente el que v98 prohíbe. Queda para decidir aparte, con un caso de uso claro.
- **250 veces el asesor entró <10 min después del bot en el flujo normal** (`status='bot'`). Eso NO es
  pisar: es el diseño — el bot responde primero a un contacto nuevo y el asesor sigue. Si lo que se
  quiere es que el bot espere también ahí, es otra decisión (bot como red de seguridad, no como primera
  respuesta) y cambia el modelo entero. No se tocó.

## Segunda vuelta (02-sep, tarde): "me parece que el bot no lee lo que escribe el asesor"

Isaac insistió, con razón. Al buscar evidencia en vez de repetir que "el mecanismo existe" aparecieron
**tres huecos más**, y uno de ellos es literal:

### 1. La plantilla del asesor era invisible (351 en 14 días)

El evento `templateMessageSent` de WATI **no trae `owner=true`**. El guard de v51 lo exigía, así que
nunca lo veía, y el evento caía a `evento_sin_texto` — descartado sin guardar. **~25 plantillas por
día.** Y una plantilla es la *única* forma de escribirle a un cliente cuya ventana de 24 h venció: justo
el mensaje con el que el asesor **retoma** la conversación. Ni quedaba como contexto ni pasaba la
conversación a handoff. Caso del 02-sep: plantilla 15:22 → el cliente `50769038791` responde 15:23
*"¿cuánto tiempo toma que lo envíen?"* → cero mensajes del asesor en el hilo → el bot contesta dos veces
como si nadie le hubiera escrito.

**Fix:** el texto de la plantilla siempre se guarda. Si la mandó una persona (hay operador) y no es el
re-enganche del cron → `human-agent` + handoff, como un mensaje tecleado. Si la mandó el sistema →
`plantilla-saliente`, sin tocar el status (lo que v51 protegía). `templateName`/`sourceType` quedan en
`evento_plantilla_saliente` para calibrar la regla: hoy solo conocemos las claves del payload, no los
valores.

### 2. El modelo leía las frases del asesor como propias

Los mensajes del asesor entran al modelo con rol `assistant` y la etiqueta `[Asesor del equipo]:` —
pero **el prompt nunca explicaba qué significa esa etiqueta**. Resultado, en 14 días: *"la cotización
que le pasé"* (la pasó el asesor), *"ya le confirmé la llegada del tóner"* (lo confirmó el asesor:
"Puede pasar a comprar directamente"), *"esa es la que le confirmé"*. El bot leía al asesor, pero se
lo atribuía a sí mismo — y desde ahí es fácil contradecirlo o repetirlo.

**Fix:** regla en el prompt (REGLA ANTI-INTERRUPCIÓN): esa etiqueta es una PERSONA del equipo, nunca
presentarlo como propio, no contradecirlo, no repetir lo que ya respondió, y no suponer el contenido de
un archivo suyo. Reescribe el caché de v35 (re-warm puntual).

### 3. El botón de plantilla del cliente quedaba en visto

`type: button` (20 en 14 días) — el cliente toca "Sí, confirmo" y caía a `evento_sin_texto`. Ahora, si
trae texto, es un mensaje de texto.

### Cómo verificar (una semana después)

```sql
-- ¿Qué plantillas manda el equipo y cómo las atribuye WATI? (calibrar esHumano)
select detail->>'plantilla' as plantilla, detail->>'sourceType' as source,
       (detail->>'con_operador')::boolean as con_operador, (detail->>'como_asesor')::boolean as como_asesor,
       count(*)
from job_log where action = 'evento_plantilla_saliente' and created_at > now() - interval '7 days'
group by 1,2,3,4 order by 5 desc;

-- ¿Sigue cayendo algo del negocio a evento_sin_texto? (debe ser ~0 de tipo template/button)
select detail->>'tipo', count(*) from job_log
where action = 'evento_sin_texto' and created_at > now() - interval '7 days' group by 1;

-- ¿Bajó la atribución en primera persona? (misma regex de la revisión)
select count(*) from messages where role='assistant' and model in ('claude-sonnet-5','assist-handoff')
  and created_at > now() - interval '7 days'
  and content ~* '\m(que|como|ya) le (pas[eé]|envi[eé]|cotic[eé]|compart[ií]|confirm[eé])\M';
```

## Tercera vuelta (02-sep): ¿el bot lee la SECUENCIA de los tres? (v121.1)

Isaac planteó el rol del copiloto en una frase que sirve de especificación:

> *"Los asesores pueden continuar contestando o resolviendo las consultas de los usuarios. Para eso
> deben leer toda la conversación… El bot debe leer qué escribe el usuario, qué escribe el asesor
> humano y qué escribe el propio bot **en secuencia**, para entonces saber si tiene las herramientas
> para contestar."*

Contra esa especificación, lo que había:

| Requisito | Estado |
|---|---|
| Los tres interlocutores llegan al modelo | ✅ el historial trae `role in (user, assistant)`; el asesor es `model='human-agent'`, el bot `claude-*`/`assist-handoff` |
| En orden cronológico | ✅ se pide desc y se invierte (`.reverse()`) |
| Distinguibles entre sí | ✅ el asesor va prefijado `[Asesor del equipo]:`; v121 además explica en el prompt que es una PERSONA |
| Con marca de tiempo | ✅ v32 prefija `[hoy/ayer/fecha]` a cada mensaje anterior |
| **Toda la conversación** | ❌ **la ventana truncaba** |

### La medida que faltaba

Sobre **598 asistencias de 14 días**, tamaño de la sesión activa (hueco > 6 h = sesión nueva):

```
mediana ......... 14 mensajes
promedio ........ 16.6
p90 ............. 35
máximo .......... 72
> 10 mensajes ... 380 (64%)   ← lo que truncaba la ventana original
> 20 mensajes ... 169 (28%)   ← lo que seguía truncando v121
```

O sea: v121 mejoró de 64% a 28% de sesiones truncadas, pero no cerró el punto. **v121.1 lleva la
ventana a 40** (`COPILOT_HIST_ASISTENCIA`, tope 100), que cubre hasta el p90.

**Por qué 40 es seguro y no arrastra lo de otro día:** `cortarSesionVieja` (v61.5) vive DENTRO de
`responderLLM`, así que corta por hueco de 7 días antes de armar el contexto. Sin esa pieza, una
ventana grande sí sería un riesgo.

**El flujo normal se queda en 10, con evidencia:** de 3.210 respuestas del flujo normal en 14 días,
solo **7** ocurrieron en conversaciones con mensajes de asesor y **ninguna** perdió uno. Ahí no hay
asesor que leer; ampliar sería pagar tokens sin ganar contexto.

De paso, la asistencia ahora pide los **mismos campos** que el flujo normal (`media_url` incluido):
las dos rutas ven el hilo igual.

### Con qué herramientas cuenta al decidir

En asistencia el modelo tiene 9 de las herramientas: `buscar_producto`, `info_tienda`,
`sucursales_interior`, `estado_pedido`, `calcular_cotizacion`, `consultar_folleto`,
`guardar_datos_envio`, `tarifa_entrega`, `asesorar_impresora`. Queda fuera `guardar_lead` (no captura
datos con el humano a cargo). Y `forceTool=false` a propósito: en asistencia la respuesta correcta
suele ser **callarse**, así que no se lo empuja a usar una herramienta.

### Un borde medido y NO corregido (0.8%)

El guard anti-prefill descarta los mensajes `assistant` finales del historial (la API no acepta
terminar en assistant con herramientas). Si lo último del hilo lo escribió el **asesor**, se cae del
contexto. Medido: pasa en **5 de 598** asistencias (0.8%) — el 98.5% de las veces el último mensaje es
del cliente, que es la condición que dispara la asistencia. No se construyó maquinaria para eso; queda
anotado por si la proporción cambia.
