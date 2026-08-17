# Watchdog de actividad — puesta en marcha (v69)

> **Por qué existe:** el sábado 15-ago-2026, WATI desactivó el webhook del copiloto tras una racha de
> timeouts (bug del STT, ver v68.1) y **el bot quedó fuera de servicio ~8 horas sin que nadie se enterara**.
> Los mensajes entraban al inbox de WATI, la base no recibía nada, y el healthcheck de la función seguía
> **verde** (la función estaba sana; el que no llamaba era WATI). No existía ninguna señal de "no está
> entrando NADA". Esto la crea.

## Arquitectura

```
pg_cron (cada 30 min, Lun-Vie en horario hábil)
   └─ net.http_post ─► Edge Function `watchdog?key=<WATCHDOG_KEY>`
        ├─ ¿día hábil de Panamá y hora entre 9 y 17?   (panama.ts: feriados incluidos)
        ├─ ¿MAX(created_at) de `messages` > umbral?     (90 min por default)
        ├─ consulta el healthcheck del copiloto         (distingue "función caída" de "WATI no llama")
        └─ correo vía Resend a ALERTA_EMAILS            (+ fila en job_log)
```

**La señal es `messages`, no `job_log`:** un turno normal exitoso no siempre escribe en `job_log`, así que
no sirve de latido. Con ~205 mensajes/día en 8 h hábiles (≈25/hora), un silencio TOTAL de 90 min en horario
hábil es anómalo.

**La alerta va por CORREO, no por WhatsApp:** no debe viajar por el canal que puede estar roto — avisar por
WATI de que WATI no responde es apostar a que el sistema caído funcione. Además evita depender de una
plantilla aprobada por Meta.

## Secretos

| secreto | qué es | default |
|---|---|---|
| `WATCHDOG_KEY` | guard del `?key=` (la función es pública, `verify_jwt=false`). **Fail-closed:** sin este valor la función rechaza todo | — |
| `WATCHDOG_MODE` | `shadow` (mide y registra, NO manda correo) \| `live` | `shadow` |
| `RESEND_API_KEY` | API key de Resend | — |
| `ALERTA_EMAILS` | destinatarios separados por coma | — |
| `ALERTA_FROM` | remitente (debe ser de un dominio verificado en Resend) | `alertas@quickservicepanama.com` |
| `WATCHDOG_UMBRAL_MIN` | minutos de silencio que disparan la alerta | `90` |
| `WATCHDOG_REPETIR_MIN` | no re-alertar antes de esto (anti-spam) | `180` |
| `WATCHDOG_HORA_INICIO` / `WATCHDOG_HORA_FIN` | horario hábil vigilado (hora de Panamá) | `9` / `17` |
| `COPILOT_HEALTH_URL` | healthcheck a consultar | se deriva de `SUPABASE_URL` |

⚠️ PowerShell parte la línea con valores largos: usa el par **entre comillas** y `--project-ref` primero:
`npx supabase secrets set --project-ref jbigmlcalcwiphqeudxd "ALERTA_EMAILS=uno@x.com,dos@y.com"`

## Programar el cron

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cada 30 min de 14:00 a 21:30 UTC = 9:00am a 4:30pm Panamá (UTC-5 fijo), Lun-Vie.
-- La función igual se auto-protege: si es feriado o está fuera del horario, no hace nada.
select cron.schedule(
  'watchdog-30min-habil-pa',
  '*/30 14-21 * * 1-5',
  $$ select net.http_post(
       url    := 'https://jbigmlcalcwiphqeudxd.functions.supabase.co/watchdog?key=REEMPLAZA_WATCHDOG_KEY',
       headers:= '{"Content-Type":"application/json"}'::jsonb,
       body   := '{}'::jsonb
     ) $$
);

-- Desprogramar:  select cron.unschedule('watchdog-30min-habil-pa');
-- Ver los jobs:  select * from cron.job;
```

> **Nota de seguridad:** el `?key=` queda en la definición del job (`cron.job`), legible solo por el rol
> admin. Igual que el cron de re-enganche; la opción limpia es Supabase Vault.

## Puesta en marcha segura (shadow → live)

1. **Deploy:** `.\deploy.ps1 watchdog` (importa `_shared` → SOLO por CLI, nunca por dashboard).
2. Setear `WATCHDOG_KEY` y programar el cron. Dejar `WATCHDOG_MODE` en `shadow` (default).
3. **Dispararlo a mano** para ver que mide bien (`?force=1` salta el gate de horario):
   ```
   https://jbigmlcalcwiphqeudxd.functions.supabase.co/watchdog?key=<WATCHDOG_KEY>&force=1
   ```
4. **Una semana en shadow** para calibrar el umbral con datos reales:
   ```sql
   select to_char(created_at at time zone 'America/Panama','DD/MM HH24:MI') as hora,
          action, detail->>'minutos_sin_mensajes' as silencio_min, detail->>'accion' as accion
   from job_log where function_name = 'watchdog'
   order by created_at desc limit 50;
   ```
   Lo que se busca: cuántas veces habría alertado. **Si alertó en un día normal, el umbral es muy corto.**
   El pico de silencio legítimo (almuerzo, martes flojo) marca el piso del umbral.
5. **Live:** configurar Resend (`RESEND_API_KEY`, `ALERTA_EMAILS`, dominio verificado) y
   `WATCHDOG_MODE=live`. Probar de verdad: bajar el umbral a 15 min un rato fuera de tráfico y confirmar
   que **el correo llega y no cae en spam** (si cae en spam, el watchdog no existe).

## Qué NO cubre

- **Si Supabase entero se cae, el watchdog cae con él** (corre en el mismo proyecto). Cubrir eso exige un
  vigilante externo (un cron fuera de Supabase que pegue al healthcheck).
- Solo vigila el horario hábil configurado: un apagón que empieza el viernes 6pm se detecta el lunes 9am.
- No detecta "el bot responde mal" — solo "no está entrando nada". Para calidad están las auditorías.
