// Prueba de la DECISIÓN del watchdog (v69). Extrae la función REAL `decidirAccion` de la Edge Function
// (Deno) y la evalúa aislada — así no se desactualiza una copia y no hace falta runtime de Deno.
//
// Por qué importa: un watchdog que alerta de más se ignora (y deja de servir), y uno que alerta de menos
// no existe. La tabla de casos de abajo ES el contrato del vigilante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions', 'watchdog', 'index.ts'),
  'utf8',
);

function extraerDecidirAccion() {
  const m = src.match(/export function decidirAccion\([\s\S]*?\n\): AccionWatchdog \{([\s\S]*?)\n\}/);
  if (!m) throw new Error('no encontré decidirAccion');
  return new Function(
    'minutosSinMensajes', 'umbralMin', 'minutosDesdeUltimaAlerta', 'repetirMin', 'recuperacionPendiente',
    m[1],
  );
}
const decidirAccion = extraerDecidirAccion();

test('silencio bajo el umbral = todo bien (no alerta)', () => {
  assert.equal(decidirAccion(0, 90, null, 180, false), 'ok');
  assert.equal(decidirAccion(89, 90, null, 180, false), 'ok');
});

test('silencio en o sobre el umbral = alerta', () => {
  assert.equal(decidirAccion(90, 90, null, 180, false), 'alerta');
  assert.equal(decidirAccion(240, 90, null, 180, false), 'alerta');
});

test('no repite la alerta dentro de la ventana (una alerta, no doce)', () => {
  // el apagón del 15-ago duró 8 h: con repetición cada 30 min habrían sido 16 correos
  assert.equal(decidirAccion(300, 90, 30, 180, false), 'alerta_suprimida');
  assert.equal(decidirAccion(300, 90, 179, 180, false), 'alerta_suprimida');
});

test('vuelve a alertar cuando pasó la ventana (el problema sigue vivo)', () => {
  assert.equal(decidirAccion(300, 90, 180, 180, false), 'alerta');
  assert.equal(decidirAccion(300, 90, 400, 180, false), 'alerta');
});

test('tráfico restablecido tras una alerta = aviso de recuperación', () => {
  assert.equal(decidirAccion(5, 90, 60, 180, true), 'recuperado');
});

test('el aviso de recuperación NO se repite (ya se avisó)', () => {
  assert.equal(decidirAccion(5, 90, 60, 180, false), 'ok');
});

test('en silencio NO se manda recuperación aunque esté pendiente', () => {
  // caso borde: hubo alerta, sigue el silencio → toca alerta (o suprimida), nunca "recuperado"
  assert.equal(decidirAccion(300, 90, null, 180, true), 'alerta');
  assert.equal(decidirAccion(300, 90, 10, 180, true), 'alerta_suprimida');
});

test('umbral configurable (no está clavado en 90)', () => {
  assert.equal(decidirAccion(45, 30, null, 180, false), 'alerta');
  assert.equal(decidirAccion(45, 120, null, 180, false), 'ok');
});
