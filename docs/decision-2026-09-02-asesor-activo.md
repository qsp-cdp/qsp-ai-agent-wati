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
