# Copiloto v126 — guard de precio por producto y reintento pensando (04-sep-2026)

## El caso

Replay del 03-sep (conversación de Gerencia, +50766746530, turno del UPS). Sonnet 5 escribió:

> también tenemos el *APC Easy BV650 650VA* a $56.00 + ITBMS = $59.92 (mismo precio…)

La búsqueda del turno decía **$66.00**. El modelo le puso al BV650 el precio del BV500 al redactar un
párrafo con dos productos. Terra y Luna, en sombra, dieron el precio correcto. Fue el único error de dato
de la noche y fue del modelo en producción.

No fue falta de datos ni de razonamiento: fue una **transcripción cruzada**, la misma forma del incidente
de los links (v120). Y tiene una propiedad incómoda: **$56.00 sí era un precio válido del turno** (el del
BV500). Un guard de "¿el monto existe en los resultados?" no lo habría visto.

## La decisión

Dos piezas, en este orden, y las dos en código antes que en modelos:

1. **`preciosInconsistentes` empareja título con precio.** Ancla cada producto del turno en el texto (por
   título exacto normalizado, o por un código de modelo del título que ningún otro producto del turno
   comparta: `BV650` sirve, `T544` no si hay cuatro tintas T544) y exige que cada monto con `$` o `B/.`
   que siga a esa ancla —hasta el siguiente producto, o hasta el primer párrafo en blanco después del
   primer monto— sea uno de los montos de **ese** producto: precio, ITBMS, total, precio de antes, ahorro.
   Los montos que producen las otras herramientas del turno (cotización de cantidades, tarifa de envío)
   quedan permitidos en cualquier parte: son deterministas.
2. **Si falla, se reintenta una vez pensando.** En vez de mandar la disculpa de una, el turno se repite con
   Sonnet 5 en `thinking: adaptive` y `effort: medium` (más `max_tokens`, porque el pensamiento cuenta
   contra el tope) y la nueva respuesta pasa por **todos** los guards otra vez: fuga de tool, producto
   inventado y precio. Solo si tampoco cuadra sale la deferencia ("déjeme verificar bien el precio…").
   Así el razonamiento se paga únicamente en el turno donde la pasada barata demostró estar mal.

En **asistencia** no hay reintento: un asesor tiene el caso, basta con callar (patrón v44/v120).

## Palanca y telemetría

| Secreto | Valores | Default |
|---|---|---|
| `COPILOT_GUARD_PRECIO` | `on` (bloquea y reintenta) · `log` (solo registra) · `off` | `on` |

`job_log`:

- `precio_inconsistente` — `casos` (título + monto que no cuadra), `fase` (primera / asistencia), `muestra`.
- `precio_reintento` — `ok`, `motivo` cuando falló (vacío, agotado, fuga_tool, producto_inventado,
  precio_inconsistente, excepción), `ms`, `muestra` del texto que sí se envió.

```sql
select date_trunc('day', created_at) dia, action, ok, count(*)
from job_log where action in ('precio_inconsistente','precio_reintento') and created_at > now() - interval '14 days'
group by 1,2,3 order by 1,2,3;
```

## Lo que hay que vigilar

- **Falsos positivos.** Un bloque que compare un combo con sus individuales en el mismo párrafo ("*Combo
  x4* $45.00 … frente a $12.00 cada una") puede disparar el guard: $12.00 es de otra ficha. El reintento
  pensando suele reescribirlo con la estructura de bloques; si no, sale la deferencia. Es el costo
  aceptado a cambio de no mandar nunca un precio cruzado. Si la telemetría muestra que se dispara sobre
  respuestas correctas, la respuesta es afinar el corte del segmento o pasar a `log`, no apagarlo.
- **Costo del reintento.** Una llamada extra con pensamiento solo en los turnos marcados. Con la
  frecuencia observada (1 de 17 turnos en la conversación del 03-sep) es despreciable.
- **Lo que este guard NO cubre:** especificaciones cruzadas (el "600 VA" del BV500, que es de 500). Eso no
  tiene una fuente determinista comparable; queda en manos del prompt y del modelo.

## Rollback

`COPILOT_GUARD_PRECIO=off` (sin redeploy). Para volver al código anterior: `git checkout 1ee909b -- supabase/functions/copilot-webhook/index.ts` y desplegar.
