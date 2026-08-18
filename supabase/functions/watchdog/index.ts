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

// --- PLANTILLAS DE CORREO ------------------------------------------------------------------------
// HTML apto para correo: tablas, estilos EN LÍNEA y tipografías del sistema — Gmail y Outlook descartan
// flexbox, grid, hojas de estilo y tipografías externas. Ancho útil 540 px (se lee en el teléfono).
// El color vive en BORDES y fondos claros, nunca en bandas oscuras: el modo oscuro de Gmail invierte los
// fondos sin avisar y un encabezado de color sólido queda ilegible.
const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TINTA = "#15212B", SUAVE = "#55636F", TENUE = "#7A8894", LINEA = "#D9E1E7", HILO = "#EDF1F4";
const ROJO = "#B23A2B", ROJO_BG = "#FBEDEA", AMBAR = "#96690A", AMBAR_BG = "#FCF3E0", AMBAR_LINEA = "#EBD9AF", VERDE = "#146B52";

function marco(colorFranja: string, cuerpo: string, pie: string): string {
  return `<div style="margin:0;padding:24px 12px;background:#EDF1F4;font-family:${FUENTE}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:540px;max-width:100%;border-collapse:collapse;background:#FFFFFF;border:1px solid ${LINEA};border-top:5px solid ${colorFranja}">
    ${cuerpo}
    <tr><td style="padding:22px 26px 26px">
      <div style="border-top:1px solid ${HILO};padding-top:14px;font-size:12.5px;line-height:1.5;color:${TENUE}">${pie}</div>
    </td></tr>
  </table>
</div>`;
}

function rotulo(texto: string, color = SUAVE): string {
  return `<div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${color};font-weight:700;margin-bottom:10px">${texto}</div>`;
}

// Fila de dato: etiqueta a la izquierda, valor a la derecha.
function filaDato(etiqueta: string, valor: string, color = TINTA, ultima = false): string {
  const borde = ultima ? "" : `border-bottom:1px solid ${HILO};`;
  return `<tr>
    <td style="padding:10px 0;${borde}color:${SUAVE};width:52%">${etiqueta}</td>
    <td style="padding:10px 0;${borde}color:${color};font-weight:600;text-align:right">${valor}</td></tr>`;
}

function escapar(t: string): string {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PIE_VIGILANTE = "Si algún día dejan de llegar estos correos, el vigilante está caído.";

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

function htmlResumen(r: ResumenDiario, salud: string, minutosSinMensajes: number, urgentes: Set<string>, franja: string): string {
  const c = r.clientes ?? { escribieron: 0, atendidos: 0, sin_atencion: 0 };
  const inc = r.incidencias ?? {};
  const incidencias = Object.entries(inc).filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(" · ");
  const saludOk = !salud.includes("NO RESPONDE") && !salud.includes("⚠️");
  const pa = ahoraPanama();
  const hh = pa.getHours() > 12 ? `${pa.getHours() - 12}:${String(pa.getMinutes()).padStart(2, "0")} p.m.` : `${pa.getHours()}:${String(pa.getMinutes()).padStart(2, "0")} a.m.`;

  // Los 💰 (pago/factura/reclamo) van PRIMERO: el copiloto no puede atenderlos y son los de mayor valor.
  const lista = [...(r.sin_responder ?? [])].sort((a, b) =>
    (urgentes.has(b.wa_id) ? 1 : 0) - (urgentes.has(a.wa_id) ? 1 : 0) || b.espera_min - a.espera_min);
  const tarjetas = lista.map((s) => {
    const urge = urgentes.has(s.wa_id);
    const fondo = urge ? `background:${AMBAR_BG};border:1px solid ${AMBAR_LINEA}` : `border:1px solid ${LINEA}`;
    const cinta = urge ? `<div style="font-size:12px;font-weight:700;color:${AMBAR};letter-spacing:.06em;text-transform:uppercase;margin-bottom:7px">💰 Pago o factura · el bot no puede</div>` : "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;${fondo};margin-bottom:10px"><tr><td style="padding:14px 16px">
      ${cinta}
      <div style="font-size:18px;font-weight:700;color:${TINTA}">${escapar(s.wa_id)}${s.nombre ? ` <span style="font-size:14px;font-weight:400;color:${SUAVE}">· ${escapar(s.nombre)}</span>` : ""}</div>
      <div style="font-size:14.5px;line-height:1.5;color:${TINTA};margin-top:7px">«${escapar(s.texto)}»</div>
      <div style="font-size:13px;color:${urge ? AMBAR : SUAVE};font-weight:600;margin-top:7px">${escapar(s.hora)} · esperando ${fmtMin(s.espera_min)}</div>
    </td></tr></table>`;
  }).join("");

  const bloqueEsperando = r.sin_responder_n > 0
    ? `<tr><td style="padding:22px 26px 0">${rotulo("Esperando respuesta")}${tarjetas}</td></tr>`
    : `<tr><td style="padding:22px 26px 0"><div style="background:#E4F3EC;border:1px solid #BFE0D0;padding:14px 16px;font-size:15px;color:${TINTA}">✅ <strong>Nadie está esperando respuesta.</strong></div></td></tr>`;

  const cuerpo = `<tr><td style="padding:26px 26px 4px">
      ${rotulo(`Corte de las ${hh} · ${fmtPanama(new Date().toISOString())}`, TENUE)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>
        <td style="vertical-align:bottom">
          <div style="font-size:34px;line-height:1;font-weight:700;color:${TINTA};letter-spacing:-.025em">${c.atendidos}<span style="color:${TENUE};font-weight:600"> / ${c.escribieron}</span></div>
          <div style="font-size:14px;color:${SUAVE};margin-top:6px">clientes atendidos hoy</div>
        </td>
        <td style="vertical-align:bottom;text-align:right">
          <div style="font-size:34px;line-height:1;font-weight:700;color:${r.sin_responder_n > 0 ? AMBAR : VERDE};letter-spacing:-.025em">${r.sin_responder_n}</div>
          <div style="font-size:14px;color:${SUAVE};margin-top:6px">esperando respuesta</div>
        </td>
      </tr></table>
    </td></tr>
    ${bloqueEsperando}
    <tr><td style="padding:26px 26px 0">
      ${rotulo("Salud del sistema")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14.5px">
        ${filaDato("Mensajes de clientes", String(r.mensajes?.de_clientes ?? 0))}
        ${filaDato(`Respuestas <span style="color:${TENUE}">(bot / asesores)</span>`, `${r.mensajes?.del_bot ?? 0} / ${r.mensajes?.de_asesores ?? 0}`)}
        ${filaDato("Silencio más largo del día", `${r.silencio_max_min} min`)}
        ${filaDato("Incidencias", incidencias || "ninguna", incidencias ? AMBAR : VERDE)}
        ${filaDato("Copiloto", saludOk ? "Funcionando" : escapar(salud), saludOk ? VERDE : ROJO, true)}
      </table>
    </td></tr>`;

  return marco(franja, cuerpo,
    `Vigilante del copiloto · llega a las 11:00, 2:30 p.m. y 4:00 p.m. en días hábiles.<br>${PIE_VIGILANTE}`);
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
  const franja = sem.icono === "🔴" ? ROJO : sem.icono === "🟡" ? AMBAR : VERDE;
  const envio = await enviarCorreo(asunto, htmlResumen(r, salud, minutos, urgentes, franja), DESTINATARIOS);
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
  const saludOk = !salud.includes("NO RESPONDE") && !salud.includes("⚠️");
  const html = esAlerta
    ? marco(ROJO, `<tr><td style="padding:26px 26px 8px">
          ${rotulo("Sistema sin actividad", ROJO)}
          <div style="font-size:28px;line-height:1.15;font-weight:700;color:${TINTA};letter-spacing:-.02em">No entran mensajes<br>desde hace ${fmtMin(minutos)}</div>
        </td></tr>
        <tr><td style="padding:18px 26px 4px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:15px">
            ${filaDato("Último mensaje", fmtPanama(ultimo))}
            ${filaDato("Copiloto", saludOk ? "Funcionando" : escapar(salud), saludOk ? VERDE : ROJO)}
            ${filaDato("Conexión con WhatsApp", "Sin llamadas entrantes", ROJO, true)}
          </table>
        </td></tr>
        <tr><td style="padding:20px 26px 0">
          <div style="background:${ROJO_BG};border-left:4px solid ${ROJO};padding:14px 16px;font-size:15px;line-height:1.55;color:${TINTA}">
            ${saludOk
              ? "El copiloto está sano, pero <strong>WATI dejó de enviarle los mensajes</strong>. Los clientes escriben y aparecen en el inbox, pero nadie los está atendiendo automáticamente."
              : "<strong>La función del copiloto no responde.</strong> No es solo la conexión con WATI: el servicio está caído."}
          </div>
        </td></tr>
        <tr><td style="padding:22px 26px 6px">
          ${rotulo("Qué hacer ahora")}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5">
            <tr><td style="padding:0 12px 14px 0;vertical-align:top;width:26px;color:${ROJO};font-weight:700">1</td>
                <td style="padding:0 0 14px;vertical-align:top;color:${TINTA}">Abra WATI y atienda a mano lo que haya entrado.</td></tr>
            <tr><td style="padding:0 12px 14px 0;vertical-align:top;color:${ROJO};font-weight:700">2</td>
                <td style="padding:0 0 14px;vertical-align:top;color:${TINTA}">Revise <strong>Configuración → Webhooks</strong>: si el webhook del copiloto aparece desactivado o defectuoso, reinstálelo con los eventos <em>Mensaje Recibido</em>, <em>Mensaje de sesión enviado</em> y <em>Nuevo mensaje de contacto</em>.</td></tr>
            <tr><td style="padding:0 12px 0 0;vertical-align:top;color:${ROJO};font-weight:700">3</td>
                <td style="padding:0;vertical-align:top;color:${TINTA}">Avise a Gerencia.</td></tr>
          </table>
        </td></tr>`,
        `Vigilante del copiloto · revisa cada 30 minutos en horario de atención (umbral ${UMBRAL_MIN} min).<br>${PIE_VIGILANTE}`)
    : marco(VERDE, `<tr><td style="padding:26px 26px 8px">
          ${rotulo("Servicio restablecido", VERDE)}
          <div style="font-size:28px;line-height:1.15;font-weight:700;color:${TINTA};letter-spacing:-.02em">Ya están entrando<br>mensajes de nuevo</div>
        </td></tr>
        <tr><td style="padding:18px 26px 4px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:15px">
            ${filaDato("Último mensaje", fmtPanama(ultimo))}
            ${filaDato("Copiloto", saludOk ? "Funcionando" : escapar(salud), saludOk ? VERDE : ROJO, true)}
          </table>
        </td></tr>
        <tr><td style="padding:20px 26px 0">
          <div style="background:#E4F3EC;border-left:4px solid ${VERDE};padding:14px 16px;font-size:15px;line-height:1.55;color:${TINTA}">
            Revise el inbox por si quedó alguien sin responder durante la interrupción.
          </div>
        </td></tr>`,
        `Vigilante del copiloto.<br>${PIE_VIGILANTE}`);

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
