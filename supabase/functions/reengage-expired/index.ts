// reengage-expired — CRON de recuperación de fin de semana (v51).
//
// Problema: los clientes que escriben viernes/sábado noche caen fuera de la ventana de 24h de WhatsApp; el
// lunes hay que reabrir el chat con una PLANTILLA HSM aprobada (un mensaje de sesión NO se entrega fuera de
// la ventana). Hoy un asesor reabre cada chat a mano. Esta función lo automatiza.
//
// Disparo: pg_cron los lunes 9:00am Panamá (= 14:00 UTC) hace un net.http_post a
//   https://<proj>.functions.supabase.co/reengage-expired?key=<REENGAGE_KEY>
// (ver docs/reengage-cron.md). La lógica de feriados/zona horaria vive en TS (heredada del copiloto) para
// que un feriado lunes NO dispare envíos con la tienda cerrada.
//
// SHADOW-FIRST (mismo ADN que COPILOT_MODE): por default REENGAGE_MODE=shadow → DRY-RUN: loguea a quién
// re-engancharía pero NO envía y NO marca. Solo con REENGAGE_MODE=live envía la plantilla + marca
// reengaged_at (idempotencia: no re-envía hasta que el cliente vuelva a escribir). El descubrimiento sale
// de NUESTRO Postgres (RPC reengage_candidates), no de la API de WATI.
//
// Importa ../_shared → SOLO se despliega por CLI (deploy.ps1), nunca por dashboard/Browse.

import { fetchReengageCandidates, markReengaged, logJob, type ReengageCandidate } from "../_shared/db.ts";
import { sendWatiTemplateMessage } from "../_shared/watiapi.ts";
import { esDiaHabilPanama } from "../_shared/panama.ts";

const VERSION = "reengage-v1";
const FN = "reengage-expired";

const KEY = (Deno.env.get("REENGAGE_KEY") ?? "").trim();
// Shadow-first: cualquier cosa distinta de 'live' (incl. faltante/typo) cae a dry-run (no envía).
const MODE_RAW = (Deno.env.get("REENGAGE_MODE") ?? "shadow").trim().toLowerCase();
const MODE = MODE_RAW === "live" ? "live" : "shadow";
const TEMPLATE = (Deno.env.get("WATI_REENGAGE_TEMPLATE") ?? "").trim();
const BROADCAST = (Deno.env.get("WATI_REENGAGE_BROADCAST") ?? "").trim() || (TEMPLATE ? `reengage_${TEMPLATE}` : "reengage");

function intEnv(name: string, def: number, min: number, max: number): number {
  const n = parseInt((Deno.env.get(name) ?? "").trim(), 10);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : def;
}
const LOOKBACK_H = intEnv("REENGAGE_LOOKBACK_HOURS", 96, 1, 720); // 96h ≈ vie 9am → lun 9am
const WINDOW_H = intEnv("REENGAGE_WINDOW_HOURS", 24, 1, 168);     // ventana de sesión de WhatsApp
const MAX_N = intEnv("REENGAGE_MAX", 100, 1, 1000);              // anti-blast
const CONCURRENCY = 5;

async function correr(): Promise<Record<string, unknown>> {
  const cands: ReengageCandidate[] = await fetchReengageCandidates(LOOKBACK_H, WINDOW_H, MAX_N);
  if (!cands.length) {
    await logJob(FN, "reengage_run", true, { mode: MODE, candidatos: 0 });
    return { candidatos: 0 };
  }
  // DRY-RUN (shadow): registrar a quién se re-engancharía, sin enviar ni marcar.
  if (MODE !== "live") {
    await logJob(FN, "reengage_dryrun", true, {
      mode: MODE, candidatos: cands.length,
      muestra: cands.slice(0, 25).map((c) => ({ wa_id: c.wa_id, last_inbound_at: c.last_inbound_at })),
    });
    return { candidatos: cands.length, mode: "shadow", enviados: 0 };
  }
  // LIVE pero sin plantilla configurada → no enviar (sería un error de config, no un silencio).
  if (!TEMPLATE) {
    await logJob(FN, "reengage_run", false, { motivo: "sin_template", candidatos: cands.length });
    return { candidatos: cands.length, error: "sin_template" };
  }
  // LIVE: enviar la plantilla + marcar, con concurrencia acotada y un DEADLINE global (si WATI se pone
  // lento, evita que la corrida supere el wall-limit de la Edge Function y muera a mitad sin registro;
  // lo que quede se loguea como restante, no se trunca en silencio).
  const t0 = Date.now();
  const DEADLINE_MS = 120000;
  let enviados = 0, fallidos = 0, marcaFallo = 0;
  for (let i = 0; i < cands.length; i += CONCURRENCY) {
    if (Date.now() - t0 > DEADLINE_MS) {
      await logJob(FN, "reengage_deadline", true, { procesados: i, restantes: cands.length - i, enviados, fallidos });
      break;
    }
    const chunk = cands.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (c) => {
      // 1) Enviar (plantilla SIN variables → sin fallos por parámetro vacío).
      try {
        await sendWatiTemplateMessage(c.wa_id, TEMPLATE, BROADCAST, []);
      } catch (e) {
        fallidos++;
        await logJob(FN, "reengage_fallo", false, { wa_id: c.wa_id, error: String(e).slice(0, 200) });
        return; // no salió → NO marcar (sigue candidato, se reintenta la próxima corrida)
      }
      enviados++;
      // 2) Marcar idempotencia. La plantilla YA salió (se facturó y afecta la calidad del número), así que
      // marcar es best-effort CON reintento; si aun así falla, log DISTINTO (sent=true) para vigilar el
      // riesgo de doble envío — NUNCA se re-cuenta como fallo de envío ni se re-envía en esta corrida.
      let marcado = false;
      for (let intento = 0; intento < 3 && !marcado; intento++) {
        try { await markReengaged(c.wa_id); marcado = true; }
        catch { if (intento < 2) await new Promise((r) => setTimeout(r, 500 * (intento + 1))); }
      }
      if (!marcado) { marcaFallo++; await logJob(FN, "reengage_marca_fallo", false, { wa_id: c.wa_id, sent: true }); }
    }));
  }
  await logJob(FN, "reengage_run", true, { mode: "live", candidatos: cands.length, enviados, fallidos, marca_fallo: marcaFallo });
  return { candidatos: cands.length, mode: "live", enviados, fallidos, marca_fallo: marcaFallo };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Healthcheck (GET sin key): estado + config, sin secretos.
  if (req.method === "GET" && !url.searchParams.get("key")) {
    return Response.json({
      status: "ok", function: FN, version: VERSION, mode: MODE, mode_raw: MODE_RAW,
      template_configured: !!TEMPLATE, key_configured: !!KEY,
      lookback_hours: LOOKBACK_H, window_hours: WINDOW_H, max: MAX_N,
      ts: new Date().toISOString(),
    });
  }

  // Guard: webhook público (verify_jwt=false) → exige ?key=. Fail-closed si no hay KEY configurada.
  if (!KEY || url.searchParams.get("key") !== KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Defensa: solo corre en día hábil de Panamá (el cron apunta al lunes 9am, pero si un feriado cae lunes
  // NO se envía con la tienda cerrada). `?force=1` lo salta para pruebas manuales.
  const force = url.searchParams.get("force") === "1";
  if (!force && !esDiaHabilPanama()) {
    await logJob(FN, "reengage_skip", true, { motivo: "no_habil_panama" });
    return Response.json({ ok: true, skipped: "no_habil_panama", ts: new Date().toISOString() });
  }

  // ACK rápido; el trabajo (leer candidatos + enviar) sigue en background. pg_net no bloquea, pero así
  // tampoco arriesgamos el wall-limit del request con lotes grandes.
  const run = correr().catch(async (e) => {
    await logJob(FN, "reengage_error", false, { error: String(e).slice(0, 300) });
    return { error: String(e).slice(0, 200) };
  });
  // @ts-ignore EdgeRuntime es global en Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(run);
  else await run;

  return Response.json({ ok: true, mode: MODE, started: true, ts: new Date().toISOString() });
});
