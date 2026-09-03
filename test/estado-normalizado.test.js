// Prueba del mapeo Shipday → estado NORMALIZADO que alimenta la tabla `pedidos` (conciencia del copiloto).
// Extrae el helper REAL de supabase/functions/_shared/status.ts (Deno) y lo evalúa aislado — así no se
// desactualiza una copia y no hace falta un runtime de Deno. Un mapeo malo = estado equivocado al cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions', '_shared', 'status.ts'),
  'utf8',
);

// Extrae el objeto ESTADO_NORMALIZADO y la función estadoNormalizado (pura, sin deps de Deno) y los evalúa.
function extraerEstadoNormalizado() {
  const mapM = src.match(/const ESTADO_NORMALIZADO[^=]*=\s*(\{[\s\S]*?\});/);
  if (!mapM) throw new Error('no encontré ESTADO_NORMALIZADO');
  const fnM = src.match(/export function estadoNormalizado\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!fnM) throw new Error('no encontré estadoNormalizado');
  const map = eval(`(${mapM[1]})`);
  // cuerpo con tipos TS quitados de la firma; el cuerpo no usa tipos
  const fn = new Function('ESTADO_NORMALIZADO', 'shipdayStatus', fnM[1]);
  return (s) => fn(map, s);
}

const estadoNormalizado = extraerEstadoNormalizado();

test('mapea los estados de Shipday a los normalizados', () => {
  const casos = {
    ORDER_ASSIGNED: 'asignado', ORDER_ACCEPTED: 'asignado', ACCEPTED: 'asignado',
    STARTED: 'en_camino', ORDER_ONTHEWAY: 'en_camino', ONTHEWAY: 'en_camino', PICKED_UP: 'en_camino',
    ORDER_COMPLETED: 'entregado', COMPLETED: 'entregado', DELIVERED: 'entregado',
    ORDER_FAILED: 'fallido', FAILED_DELIVERY: 'fallido', INCOMPLETE: 'fallido',
  };
  for (const [raw, norm] of Object.entries(casos)) {
    assert.equal(estadoNormalizado(raw), norm, `${raw} → ${norm}`);
  }
});

test('normaliza mayúsculas/minúsculas y espacios', () => {
  assert.equal(estadoNormalizado('order ontheway'), 'en_camino');
  assert.equal(estadoNormalizado('Order Completed'), 'entregado');
});

test('lo desconocido/ vacío cae a "desconocido" (para que shipday-status NO degrade el estado bueno)', () => {
  for (const s of ['', 'NOT_ASSIGNED', 'SOME_NEW_EVENT', 'edited', undefined, null]) {
    assert.equal(estadoNormalizado(s), 'desconocido', `${s} → desconocido`);
  }
});
