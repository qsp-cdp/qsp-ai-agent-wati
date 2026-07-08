# Cron de recuperación de fin de semana (v51)

Re-engancha por **plantilla HSM** a los clientes cuya ventana de 24h de WhatsApp expiró y quedaron sin
respuesta (típico: escribieron viernes/sábado noche). Antes el asesor los reabría uno por uno; esto lo
automatiza — **shadow-first** (por default NO envía, solo loguea a quién re-engancharía).

## Arquitectura

```
pg_cron (lunes 9:00am Panamá = 14:00 UTC)
  └─ net.http_post ─► Edge Function `reengage-expired?key=<REENGAGE_KEY>`
        ├─ ¿día hábil de Panamá? (feriado/fin de semana → skip)  [lógica en TS, hereda feriados del copiloto]
        ├─ RPC reengage_candidates(lookback, window, max)  ─► NUESTRO Postgres (no la API de WATI)
        │     · último msg del hilo = del cliente (sin responder)
        │     · ventana 24h vencida  ·  dentro del lookback (96h)
        │     · status = 'bot' (NUNCA handoff → no pisa al asesor; ni cerrada)  ·  sin opt-out  ·  no re-enganchado
        └─ por cada candidato:
              DRY-RUN (default) → job_log `reengage_dryrun` (no envía)
              LIVE               → sendTemplateMessage(WATI) + marca reengaged_at (idempotencia)
```

El descubrimiento sale de **nuestra base** (ya guardamos todos los entrantes); WATI solo se usa para **enviar**.
Cuando el cron envía, WATI eco-notifica *"Template Message Sent"* → el copiloto lo **salta** (guard v51,
`evento_plantilla_saliente`) para que NO se marque un handoff falso.

## Requisitos previos (una sola vez)

### 1. Aplicar la migración
`supabase/migrations/20260708190000_reengage.sql` — agrega `reengaged_at`/`reengage_optout` a `conversations`
y crea el RPC `reengage_candidates`. Correr en el SQL Editor (validada contra Postgres local end-to-end).

### 2. Desplegar la función
`.\deploy.ps1 reengage-expired` (importa `_shared` → **solo por CLI**, no por Browse). Ya está en la lista
por default de `deploy.ps1` y en `config.toml` (`verify_jwt=false`).

### 3. Crear + aprobar la plantilla HSM en WATI/Meta
Categoría **Utility**, idioma **español**, **SIN variables** (recomendado — evita fallos por parámetro vacío).
Borrador sugerido (ajústalo a tu voz):

> 👋 ¡Hola! En *Quick Service Panamá* vimos tu mensaje. Seguimos disponibles para ayudarte con tu compra o
> cotización. ¿Continuamos por aquí? 🙂

Anota el **nombre** de la plantilla aprobada (lo necesitas para `WATI_REENGAGE_TEMPLATE`).

### 4. Secretos / env vars de la función (Edge Function secrets)
| Var | Default | Qué es |
|---|---|---|
| `REENGAGE_MODE` | `shadow` | `shadow`=DRY-RUN (no envía) · `live`=envía. **Arranca en shadow.** |
| `WATI_REENGAGE_TEMPLATE` | — | nombre EXACTO de la plantilla aprobada en WATI |
| `WATI_REENGAGE_BROADCAST` | `reengage_<template>` | nombre de broadcast que WATI exige (cualquiera identificable) |
| `REENGAGE_KEY` | — | guard del `?key=` (secreto aleatorio fuerte; el cron lo pasa) |
| `REENGAGE_LOOKBACK_HOURS` | `96` | cuánto atrás mirar (96h ≈ vie 9am→lun 9am) |
| `REENGAGE_WINDOW_HOURS` | `24` | ventana de sesión de WhatsApp (solo re-engancha si venció) |
| `REENGAGE_MAX` | `100` | tope de envíos por corrida (anti-blast) |

Reusa `WATI_API_BASE`/`WATI_API_TOKEN` y `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (ya existen).

### 5. Programar el cron (pg_cron + pg_net)
Correr en el **SQL Editor** del proyecto `jbigmlcalcwiphqeudxd` (contiene la `REENGAGE_KEY` → NO se commitea):

```sql
-- Habilitar extensiones (una vez). En Supabase también se pueden prender en Database → Extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Programar: lunes 14:00 UTC = 9:00am Panamá (UTC-5 fijo, sin horario de verano).
-- (Para correr todos los días hábiles en vez de solo lunes: '0 14 * * 1-5' — la función igual
--  se auto-protege de feriados y solo re-engancha lo que quedó sin responder.)
select cron.schedule(
  'reengage-lunes-9am-pa',
  '0 14 * * 1',
  $$ select net.http_post(
       url    := 'https://jbigmlcalcwiphqeudxd.functions.supabase.co/reengage-expired?key=REEMPLAZA_REENGAGE_KEY',
       headers:= '{"Content-Type":"application/json"}'::jsonb,
       body   := '{}'::jsonb
     ) $$
);

-- Para desprogramar:  select cron.unschedule('reengage-lunes-9am-pa');
-- Para ver los jobs:  select * from cron.job;
```

> **Nota de seguridad:** el `?key=` queda en la definición del job (`cron.job`), legible solo por el rol
> admin/postgres. Opción más limpia: guardar la key en **Supabase Vault** (`vault.create_secret`) y leerla en
> el `$$…$$` con `(select decrypted_secret from vault.decrypted_secrets where name='reengage_key')`.

## Puesta en marcha segura (shadow → live)

1. Deploy + migración + cron programado, con `REENGAGE_MODE=shadow` (default).
2. Dispararlo a mano una vez para ver el DRY-RUN:
   `GET https://jbigmlcalcwiphqeudxd.functions.supabase.co/reengage-expired?key=<REENGAGE_KEY>&force=1`
   (`force=1` salta el chequeo de día hábil, para probar cualquier día).
3. Revisar a quién habría contactado:
   ```sql
   select created_at, action, detail from public.job_log
   where function_name='reengage-expired' order by created_at desc limit 20;
   ```
   `reengage_dryrun.detail.muestra` trae los primeros 25 `wa_id` + su `last_inbound_at`.
4. Si el listado y el volumen se ven bien → crear la plantilla, poner `WATI_REENGAGE_TEMPLATE`, y flipear
   `REENGAGE_MODE=live`. La próxima corrida (o el `force=1`) ya envía.

## Salud y monitoreo

- Healthcheck (sin key): `GET …/reengage-expired` → `{mode, template_configured, key_configured, lookback_hours, …}`.
- `job_log`: `reengage_dryrun` (shadow), `reengage_run` (`enviados`/`fallidos`), `reengage_fallo` (por contacto),
  `reengage_skip` (no hábil), `reengage_error`.
- Idempotencia: un contacto no se re-engancha dos veces hasta que **vuelva a escribir** (`reengaged_at` <
  su última entrada). Para excluir a alguien de estos mensajes:
  `update public.conversations set reengage_optout=true where wa_id='<numero>';`

## Decisiones abiertas / a calibrar tras ver el DRY-RUN

- **A quién:** hoy = conversaciones **gestionadas por el bot** (`status='bot'`) cuyo último mensaje es del
  cliente y quedó sin responder. Los `handoff` (un humano está/estuvo a cargo) se EXCLUYEN a propósito
  (anti-interrupción — no le mandamos una plantilla automática a un cliente que un asesor atiende). Si algún
  día querés incluirlos, relajá el RPC de `c.status = 'bot'` a `c.status <> 'cerrada'`. El dry-run dirá el volumen real.
- **Interruptor independiente:** el cron se gobierna SOLO por `REENGAGE_MODE`. NO mira `COPILOT_MODE` ni
  `COPILOT_LIVE_ALLOWLIST` → un rollback del copiloto a shadow/allowlist **no frena el cron**. Si querés
  pausarlo, poné `REENGAGE_MODE=shadow` (o desprogramá el cron).
- **Endpoint de plantilla a confirmar en vivo:** el helper usa `POST /api/v1/sendTemplateMessage/{numero}`
  con `{template_name, broadcast_name, parameters:[]}`. Algunas cuentas de WATI exponen el bulk
  `POST /api/v1/sendTemplateMessages` (plural, con `receivers[]`). En el test `force=1` inicial, si el
  single-send da 404/400, cambiar al bulk es un ajuste chico en `_shared/watiapi.ts`.
- **Frecuencia:** default lunes. Cambiar a `0 14 * * 1-5` (Lun-Vie) recupera también chats de entre semana.
- **Calidad de WhatsApp:** enviar plantillas a mucha gente que no responde baja el rating de calidad del número.
  El tope `REENGAGE_MAX` + el opt-out + la idempotencia lo acotan; empezar conservador (lunes, solo sin-responder).
- **Personalización:** la plantilla MVP va sin variables. Si se quiere `{{1}}=nombre`, es un cambio chico
  (pasar el primer nombre en `parameters`), pero cada contacto sin nombre necesitaría un fallback.
