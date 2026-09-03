// Utilidades de hora de Panamá (UTC-5 fijo, sin horario de verano) + feriados nacionales.
// Extraído del copiloto (copilot-webhook/index.ts, funciones feriadosPa/esFeriado/horarioPanama) para
// reusarlo en el cron de re-enganche. La lógica de fechas es IDÉNTICA (fijos por mes/día + Carnaval y
// Viernes Santo por Meeus/Jones/Butcher desde la Pascua). NOTA: el copiloto mantiene su copia inline
// (histórica, en el mismo archivo que su prompt); si se toca la lógica de feriados, actualizar AMBAS o
// consolidar. La verdad de negocio (qué días son feriado) es la misma en los dos.

const FERIADOS_FIJOS = ["1-1", "1-9", "5-1", "11-3", "11-4", "11-5", "11-10", "11-28", "12-8", "12-20", "12-25"];
const _cache: Record<number, Set<string>> = {};

export function feriadosPa(anio: number): Set<string> {
  if (_cache[anio]) return _cache[anio];
  const s = new Set(FERIADOS_FIJOS);
  // Pascua (domingo) por Meeus/Jones/Butcher (gregoriano):
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * mm + 114) / 31), dia = ((h + l - 7 * mm + 114) % 31) + 1;
  const pascua = Date.UTC(anio, mes - 1, dia);
  // Carnaval lunes (Pascua−48), Carnaval martes (Pascua−47), Viernes Santo (Pascua−2).
  for (const off of [48, 47, 2]) {
    const x = new Date(pascua - off * 86400000);
    s.add(`${x.getUTCMonth() + 1}-${x.getUTCDate()}`);
  }
  _cache[anio] = s;
  return s;
}

export function esFeriado(pa: Date): boolean {
  return feriadosPa(pa.getUTCFullYear()).has(`${pa.getUTCMonth() + 1}-${pa.getUTCDate()}`);
}

// "now" desplazado a hora de Panamá (UTC-5). Leer con getUTC* da la hora local de Panamá.
export function ahoraPanama(now: Date = new Date()): Date {
  return new Date(now.getTime() - 5 * 3600 * 1000);
}

// Día hábil de QSP = Lun-Vie y NO feriado (independiente de la hora). Lo usa el cron para no correr
// en fin de semana ni feriado, aunque pg_cron lo dispare (defensa; el schedule ya apunta al lunes 9am).
export function esDiaHabilPanama(now: Date = new Date()): boolean {
  const pa = ahoraPanama(now);
  const dia = pa.getUTCDay(); // 0=Dom … 6=Sáb
  return dia >= 1 && dia <= 5 && !esFeriado(pa);
}
