// watchdog — vigilante de actividad (v69).
//
// POR QUÉ EXISTE: el 15-ago (sábado) WATI desactivó el webhook tras una racha de timeouts y el bot quedó
// FUERA DE SERVICIO ~8 horas. Nadie se enteró: los mensajes entraban al inbox de WATI, la base no recibía
// nada, y el healthcheck de la función seguía VERDE (la función estaba sana; el que no llamaba era WATI).
// No teníamos ninguna señal de "no está entrando NADA". Esto la crea.
//
// SEÑAL: la marca de tiempo del último mensaje en `messages` (cualquier rol). `job_log` NO sirve de latido
// —un turno normal exitoso no siempre escribe ahí—. Con ~205 mensajes/día en 8 h hábiles (≈25/hora), un
// silencio TOTAL de 90 min en horario hábil es anómalo.
//
// ALERTA POR CORREO (Resend), no por WhatsApp: la alerta no debe viajar por el canal que puede estar roto
// —avisar por WATI de que WATI no responde es apostar a que el sistema caído funcione— y además no
// requiere plantilla aprobada por Meta.
//
// SHADOW-FIRST (mismo ADN que COPILOT_MODE / REENGAGE_MODE): por default WATCHDOG_MODE=shadow → mide y
// registra en job_log lo que HABRÍA alertado, sin mandar correo. Una semana así calibra el umbral con
// datos reales antes de que empiece a escribir a nadie.
//
// Disparo: pg_cron cada 30 min en horario hábil (ver docs/watchdog.md).
// Importa ../_shared → SOLO se despliega por CLI (deploy.ps1), nunca por dashboard.

import { jobLogRecientes, logJob, resumenDiario, ultimoJobLog, ultimoMensajeAt, type ResumenDiario } from "../_shared/db.ts";
import { enviarCorreo } from "../_shared/resend.ts";
import { ahoraPanama, esDiaHabilPanama } from "../_shared/panama.ts";

const VERSION = "watchdog-v1";
const FN = "watchdog";

const KEY = (Deno.env.get("WATCHDOG_KEY") ?? "").trim();
const MODE_RAW = (Deno.env.get("WATCHDOG_MODE") ?? "shadow").trim().toLowerCase();
const MODE = MODE_RAW === "live" ? "live" : "shadow";
const DESTINATARIOS = (Deno.env.get("ALERTA_EMAILS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function intEnv(name: string, def: number, min: number, max: number): number {
  const n = parseInt((Deno.env.get(name) ?? "").trim(), 10);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : def;
}
const UMBRAL_MIN = intEnv("WATCHDOG_UMBRAL_MIN", 90, 15, 480);      // silencio que dispara la alerta
const REPETIR_MIN = intEnv("WATCHDOG_REPETIR_MIN", 180, 30, 1440);  // no re-alertar antes de esto
const HORA_INICIO = intEnv("WATCHDOG_HORA_INICIO", 9, 0, 23);       // horario hábil de la tienda
const HORA_FIN = intEnv("WATCHDOG_HORA_FIN", 17, 1, 24);

// URL del healthcheck del copiloto: el correo distingue "la función está caída" de "la función está bien
// pero WATI no la llama" — justo la confusión que costó horas el 15-ago.
const HEALTH_URL = (Deno.env.get("COPILOT_HEALTH_URL") ?? "").trim()
  || `${(Deno.env.get("SUPABASE_URL") ?? "").trim().replace(".supabase.co", ".functions.supabase.co")}/copilot-webhook`;

export type AccionWatchdog = "ok" | "alerta" | "alerta_suprimida" | "recuperado";

// DECISIÓN PURA (sin IO): qué hacer según el silencio medido y el historial de alertas. Aislada aquí para
// poder probar la tabla de casos sin base de datos ni correo (tests/watchdog.test.js).
export function decidirAccion(
  minutosSinMensajes: number,
  umbralMin: number,
  minutosDesdeUltimaAlerta: number | null,   // null = no hubo alerta reciente
  repetirMin: number,
  recuperacionPendiente: boolean,            // hubo alerta y todavía no se avisó que volvió
): AccionWatchdog {
  const enSilencio = minutosSinMensajes >= umbralMin;
  if (enSilencio) {
    if (minutosDesdeUltimaAlerta != null && minutosDesdeUltimaAlerta < repetirMin) return "alerta_suprimida";
    return "alerta";
  }
  // Hay tráfico: si veníamos de una alerta, avisar que se restableció (si no, uno se queda con la duda).
  if (recuperacionPendiente) return "recuperado";
  return "ok";
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtPanama(iso: string | null): string {
  if (!iso) return "nunca";
  const pa = ahoraPanama(new Date(iso));
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const hh = String(pa.getHours()).padStart(2, "0"), mm = String(pa.getMinutes()).padStart(2, "0");
  return `${dias[pa.getDay()]} ${pa.getDate()}/${pa.getMonth() + 1} ${hh}:${mm}`;
}

// Estado del copiloto visto desde afuera. No usa key (el healthcheck es público sin ella).
async function estadoCopiloto(): Promise<string> {
  try {
    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return `responde HTTP ${r.status} ⚠️`;
    const j = await r.json();
    return `OK (${j.version}, mode ${j.mode}, live_targets ${j.live_targets})`;
  } catch {
    return "NO RESPONDE ⚠️ (la función está caída, no es solo el webhook)";
  }
}

// --- RESUMEN DIARIO (v69.1) ----------------------------------------------------------------------
// La alerta por silencio solo habla cuando algo falla, y eso deja un hueco: si el watchdog MISMO se muere
// (cron desprogramado, función rota, key de Resend vencida) no llega nada y nadie lo nota — el mismo
// agujero que estamos tapando, un piso más arriba. El correo diario es la PRUEBA DE VIDA: si un día no
// llega, esa ausencia ES la alarma. Y de paso da el pulso del negocio (a cuánta gente se atendió y, sobre
// todo, quién quedó SIN respuesta — dinero sobre la mesa).
const ESPERA_SIN_RESPONDER = intEnv("WATCHDOG_ESPERA_SIN_RESPONDER", 45, 5, 480);

// v72.1 — SEMÁFORO. El asunto tiene que decir en un vistazo si hay que abrir el correo o no:
//   🔴 algo roto (silencio anómalo del sistema, envíos fallidos, errores)
//   🟡 hay clientes esperando respuesta
//   🟢 todo atendido y funcionando
function semaforo(r: ResumenDiario, minutosSinMensajes: number, saludOk: boolean): { icono: string; estado: string } {
  const inc = r.incidencias ?? {};
  const roto = !saludOk || minutosSinMensajes >= UMBRAL_MIN
    || Number(inc.envio_fallido ?? 0) > 0 || Number(inc.errores ?? 0) > 0;
  if (roto) return { icono: "🔴", estado: "revisar el sistema" };
  if ((r.sin_responder_n ?? 0) > 0) return { icono: "🟡", estado: `${r.sin_responder_n} esperando` };
  return { icono: "🟢", estado: "todo al día" };
}

function htmlResumen(r: ResumenDiario, salud: string, minutosSinMensajes: number, urgentes: Set<string>): string {
  const c = r.clientes ?? { escribieron: 0, atendidos: 0, sin_atencion: 0 };
  const inc = r.incidencias ?? {};
  const incidencias = Object.entries(inc).filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: <strong>${v}</strong>`).join(" · ") || "ninguna";
  // Los marcados 💰 son los que el copiloto NO puede atender (pago, factura, reclamo): necesitan a una
  // persona sí o sí. Salen primero porque son los de mayor valor.
  const lista = [...(r.sin_responder ?? [])].sort((a, b) =>
    (urgentes.has(b.wa_id) ? 1 : 0) - (urgentes.has(a.wa_id) ? 1 : 0) || b.espera_min - a.espera_min);
  const filas = lista.map((s) => {
    const urge = urgentes.has(s.wa_id);
    return `<tr style="${urge ? "background:#fff4f4" : ""}">
      <td style="padding:5px 10px 5px 0;white-space:nowrap">${urge ? "💰 " : ""}${s.hora}</td>
      <td style="padding:5px 10px 5px 0;white-space:nowrap"><strong>${s.wa_id}</strong>${s.nombre ? `<br><span style="color:#666">${s.nombre}</span>` : ""}</td>
      <td style="padding:5px 10px 5px 0;white-space:nowrap">${s.espera_min} min</td>
      <td style="padding:5px 0;color:#444">${(s.texto ?? "").replace(/[<>]/g, "")}</td></tr>`;
  }).join("");
  const bloqueSin = r.sin_responder_n > 0
    ? `<h3 style="margin:18px 0 6px">⚠️ Esperando respuesta (${r.sin_responder_n})</h3>
       <table style="border-collapse:collapse;font-size:13px">${filas}</table>
       <p style="color:#666;font-size:12px">Escribieron y no contestó nadie —ni el bot ni un asesor— hace
          más de ${ESPERA_SIN_RESPONDER} min. Los marcados 💰 son de <strong>pago, factura o reclamo</strong>:
          el copiloto no puede atenderlos por diseño, necesitan a una persona.</p>`
    : `<p style="font-size:15px">✅ <strong>Nadie está esperando respuesta.</strong></p>`;
  return `<h2 style="margin:0 0 10px">Copiloto — cómo va el día</h2>
    <p style="font-size:15px"><strong>Clientes atendidos: ${c.atendidos} de ${c.escribieron}</strong> que han escrito hoy
       ${c.sin_atencion > 0 ? `· <strong style="color:#b00">${c.sin_atencion} sin atención</strong>` : ""}</p>
    ${bloqueSin}
    <h3 style="margin:18px 0 6px">Salud del sistema</h3>
    <p>Mensajes hoy: ${r.mensajes?.de_clientes ?? 0} de clientes · ${(r.mensajes?.del_bot ?? 0) + (r.mensajes?.de_asesores ?? 0)} de respuesta
       (${r.mensajes?.del_bot ?? 0} del bot, ${r.mensajes?.de_asesores ?? 0} de asesores)<br>
       Último mensaje: hace ${minutosSinMensajes} min · Silencio máximo del día: ${r.silencio_max_min} min<br>
       Incidencias: ${incidencias}<br>
       Copiloto: ${salud}</p>
    <p style="color:#666;font-size:12px">Watchdog QSP · llega 3 veces al día (11:00, 2:30pm y 4:00pm) en días
       hábiles: si algún día NO llega, el vigilante está caído. Las caídas del sistema se avisan aparte y al instante.</p>`;
}

async function correrResumen(): Promise<Record<string, unknown>> {
  const r = await resumenDiario(ESPERA_SIN_RESPONDER);
  if (!r) {
    await logJob(FN, "watchdog_resumen", false, { error: "rpc_resumen_diario_fallo" });
    return { error: "rpc_resumen_diario_fallo" };
  }
  const salud = await estadoCopiloto();
  const ultimo = await ultimoMensajeAt();
  const minutos = ultimo ? Math.round((Date.now() - new Date(ultimo).getTime()) / 60000) : 99999;
  // Los casos que el barrido marcó como "el bot no puede" (pago/factura/reclamo) — los escribe
  // copilot-webhook en job_log; aquí solo se leen para destacarlos en la lista.
  const desde = new Date(Date.now() - 14 * 3600 * 1000).toISOString();
  const av = await jobLogRecientes("desatencion_avisada", desde, 100);
  const urgentes = new Set<string>(av.map((x) => String(x?.detail?.waId ?? "")).filter(Boolean));
  const sem = semaforo(r, minutos, !salud.includes("NO RESPONDE") && !salud.includes("⚠️"));
  const c = r.clientes ?? { escribieron: 0, atendidos: 0 };
  const asunto = `${sem.icono} Copiloto — ${c.atendidos}/${c.escribieron} atendidos · ${sem.estado}`;
  const resumenLog = { mode: MODE, semaforo: sem.icono, clientes: c, mensajes: r.mensajes, sin_responder_n: r.sin_responder_n, urgentes: urgentes.size, silencio_max_min: r.silencio_max_min };
  if (MODE !== "live") {
    await logJob(FN, "watchdog_resumen", true, { ...resumenLog, shadow: true, asunto });
    return { ...resumenLog, shadow: true, asunto };
  }
  const envio = await enviarCorreo(asunto, htmlResumen(r, salud, minutos, urgentes), DESTINATARIOS);
  await logJob(FN, "watchdog_resumen", envio.ok, { ...resumenLog, asunto, email_id: envio.id ?? null, error: envio.error ?? null });
  return { ...resumenLog, enviado: envio.ok, error: envio.error ?? null };
}

async function correr(force: boolean): Promise<Record<string, unknown>> {
  const pa = ahoraPanama();
  const hora = pa.getHours();
  const enHorario = esDiaHabilPanama() && hora >= HORA_INICIO && hora < HORA_FIN;
  if (!force && !enHorario) return { skipped: "fuera_de_horario", hora_panama: hora };

  const ultimo = await ultimoMensajeAt();
  const minutos = ultimo ? Math.round((Date.now() - new Date(ultimo).getTime()) / 60000) : 99999;

  // Historial de alertas para el anti-spam y la recuperación (ventana amplia: 12 h).
  const desde12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const ultAlerta = await ultimoJobLog("watchdog_alerta", desde12h);
  const ultRecup = await ultimoJobLog("watchdog_recuperado", desde12h);
  const minDesdeAlerta = ultAlerta ? Math.round((Date.now() - new Date(ultAlerta.created_at).getTime()) / 60000) : null;
  // Hay recuperación pendiente si la última alerta es MÁS NUEVA que el último aviso de recuperación.
  const recuperacionPendiente = !!ultAlerta
    && (!ultRecup || new Date(ultAlerta.created_at).getTime() > new Date(ultRecup.created_at).getTime());

  const accion = decidirAccion(minutos, UMBRAL_MIN, minDesdeAlerta, REPETIR_MIN, recuperacionPendiente);
  const base = { mode: MODE, minutos_sin_mensajes: minutos, umbral: UMBRAL_MIN, ultimo_mensaje: ultimo, accion };

  if (accion === "ok") { await logJob(FN, "watchdog_run", true, base); return base; }
  if (accion === "alerta_suprimida") {
    await logJob(FN, "watchdog_run", true, { ...base, motivo: "alerta_reciente", min_desde_alerta: minDesdeAlerta });
    return base;
  }

  const salud = await estadoCopiloto();
  const esAlerta = accion === "alerta";
  const asunto = esAlerta
    ? `🚨 Copiloto sin mensajes desde hace ${fmtMin(minutos)}`
    : `✅ Copiloto recuperado — ya están entrando mensajes`;
  const html = esAlerta
    ? `<p><strong>El copiloto no registra ningún mensaje desde hace ${fmtMin(minutos)}.</strong></p>
       <p>Último mensaje: <strong>${fmtPanama(ultimo)}</strong> (hora de Panamá)<br>
          Estado de la función: ${salud}</p>
       <p>Si la función responde OK, lo más probable es que <strong>WATI haya dejado de llamar al webhook</strong>
          (pasó el 15-ago: lo desactivó tras una racha de fallos).</p>
       <p><strong>Qué revisar:</strong> WATI → Configuración → Webhooks → que el webhook del copiloto siga
          activo y con los eventos <em>Mensaje Recibido</em>, <em>Mensaje de sesión enviado</em> y
          <em>Nuevo mensaje de contacto</em>. Si aparece defectuoso, reinstalarlo.</p>
       <p style="color:#666;font-size:12px">Watchdog QSP · umbral ${UMBRAL_MIN} min · ${fmtPanama(new Date().toISOString())}</p>`
    : `<p><strong>Ya están entrando mensajes de nuevo.</strong></p>
       <p>Último mensaje: ${fmtPanama(ultimo)} (hora de Panamá)<br>Estado de la función: ${salud}</p>
       <p style="color:#666;font-size:12px">Watchdog QSP · ${fmtPanama(new Date().toISOString())}</p>`;

  // SHADOW: se registra lo que se habría enviado, sin mandar nada.
  if (MODE !== "live") {
    await logJob(FN, esAlerta ? "watchdog_alerta" : "watchdog_recuperado", true, { ...base, shadow: true, asunto, salud });
    return { ...base, shadow: true, asunto };
  }
  const envio = await enviarCorreo(asunto, html, DESTINATARIOS);
  await logJob(FN, esAlerta ? "watchdog_alerta" : "watchdog_recuperado", envio.ok, {
    ...base, asunto, salud, destinatarios: DESTINATARIOS.length, email_id: envio.id ?? null, error: envio.error ?? null,
  });
  return { ...base, enviado: envio.ok, error: envio.error ?? null };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Healthcheck (GET sin key): estado + config, sin secretos.
  if (req.method === "GET" && !url.searchParams.get("key")) {
    return Response.json({
      status: "ok", function: FN, version: VERSION, mode: MODE, mode_raw: MODE_RAW,
      key_configured: !!KEY, resend_configured: !!(Deno.env.get("RESEND_API_KEY") ?? "").trim(),
      destinatarios: DESTINATARIOS.length, umbral_min: UMBRAL_MIN, repetir_min: REPETIR_MIN,
      horario: `${HORA_INICIO}-${HORA_FIN}`, health_url: HEALTH_URL, ts: new Date().toISOString(),
    });
  }

  // Guard: público (verify_jwt=false) → exige ?key=. Fail-closed si no hay KEY configurada.
  if (!KEY || url.searchParams.get("key") !== KEY) return Response.json({ error: "forbidden" }, { status: 403 });

  const force = url.searchParams.get("force") === "1"; // salta el gate de horario, para pruebas manuales
  try {
    // ?resumen=1 → correo de cierre del día (cron aparte, 5:00pm). Sin el parámetro, vigilancia normal.
    const r = url.searchParams.get("resumen") === "1" ? await correrResumen() : await correr(force);
    return Response.json({ ok: true, ...r, ts: new Date().toISOString() });
  } catch (e) {
    await logJob(FN, "watchdog_error", false, { error: String(e).slice(0, 300) });
    return Response.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
});
