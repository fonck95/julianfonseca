// Tests del motor REAL: capa de contacto (60-contact.js) con semilla fija.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, PARTS } from './harness.mjs';

const H = loadEngine(7, [...PARTS, '60-contact.js']);
const Z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const pol = { forward: () => Z };

test('contacto: STAND_H expuesto y coherente con la pata', () => {
  assert.ok(H.STAND_H > 1 && H.STAND_H < H.LEG_WORLD,
    'STAND_H=' + H.STAND_H + ' fuera del rango de la pata (' + H.LEG_WORLD + ')');
});

test('contacto: la cadera visible reposa en STAND_H, no hundida en 0', () => {
  const b = new H.Bird(50); b.y = H.STAND_H; b.grounded = true;
  for (let i = 0; i < 30; i++) H.stepBird(b, pol, 50, 0, null, false);
  assert.ok(b.grounded, 'posada deja de estar grounded');
  assert.ok(b.y >= H.STAND_H - 0.01, 'hundida: y=' + b.y.toFixed(2));
  assert.ok(Math.abs(b.y - H.STAND_H) < 0.6, 'y=' + b.y.toFixed(2) + ' != STAND_H=' + H.STAND_H);
});

test('colisión: caer desde 12 cm aterriza en STAND_H y dispara landFlash', () => {
  const b = new H.Bird(50); b.y = 12; b.grounded = false;
  let flash = 0;
  for (let i = 0; i < 150; i++) {
    H.stepBird(b, pol, 50, 0, null, false);
    flash = Math.max(flash, b.landFlash || 0);
  }
  assert.ok(b.grounded, 'no aterrizó');
  assert.ok(flash > 0.1, 'sin señal de impacto: landFlash=' + flash);
  assert.ok(b.y >= H.STAND_H - 0.01, 'se hundió: ' + b.y.toFixed(2));
});

test('sincronía de render: stepBird expone el viento que siente (b.wx/b.wy)', () => {
  const b = new H.Bird(50); b.y = H.STAND_H; b.grounded = true;
  const fluid = { sample: () => [80, 5], reset() {}, step() {}, wind: [0, 0], inject() {} };
  H.stepBird(b, pol, 50, 0, fluid, false);
  assert.equal(b.wx, 80, 'b.wx no es el viento muestreado');
  assert.equal(b.wy, 5);
});
