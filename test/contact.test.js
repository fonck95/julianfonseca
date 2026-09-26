// Física de contacto con colisiones reales: reposo sobre patas, señal de
// impacto y viento expuesto al render. Determinista (sembrado, sin evolución).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './harness.mjs';

const H = loadEngine(7);
const Z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const pol = { forward: () => Z };
const step = (b, n) => { for (let i = 0; i < n; i++) H.stepBird(b, pol, 50, 0, null, false); };

test('contacto: la cadera reposa a la altura de las patas, no hundida en 0', () => {
  assert.ok(H.STAND_H > 1.5 && H.STAND_H < H.LEG_WORLD + 0.5,
    'STAND_H incoherente con la longitud de pata: ' + H.STAND_H);
  const b = new H.Bird(50); b.y = H.STAND_H; b.grounded = true;
  step(b, 30);
  assert.ok(b.grounded, 'un ave posada no está grounded');
  assert.ok(Math.abs(b.y - H.STAND_H) < 0.6, 'y=' + b.y.toFixed(2) + ' vs STAND_H=' + H.STAND_H);
});

test('colisión: caer desde 12 cm aterriza sin hundirse y dispara landFlash', () => {
  const b = new H.Bird(50); b.y = 12; b.grounded = false;
  let flash = 0, minY = 1e9;
  for (let i = 0; i < 150; i++) {
    H.stepBird(b, pol, 50, 0, null, false);
    flash = Math.max(flash, b.landFlash || 0);
    if (b.grounded) minY = Math.min(minY, b.y);
  }
  assert.ok(b.grounded, 'no aterrizó');
  assert.ok(flash > 0.1, 'ninguna señal de impacto: landFlash=' + flash);
  assert.ok(minY >= H.STAND_H - 0.3, 'se hundió bajo el reposo: ' + minY.toFixed(2));
  assert.ok(Math.abs(b.y - H.STAND_H) < 0.6, 'y final=' + b.y.toFixed(2));
});

test('sincronía de render: el ave expone el viento que siente (b.wx/b.wy)', () => {
  const b = new H.Bird(50); b.y = H.STAND_H || 0; b.grounded = true;
  const fluid = { sample: () => [80, 5], reset() {}, step() {}, wind: [0, 0], inject() {} };
  H.stepBird(b, pol, 50, 0, fluid, false);
  assert.equal(b.wx, 80, 'b.wx no es el viento muestreado');
  assert.equal(b.wy, 5);
});
