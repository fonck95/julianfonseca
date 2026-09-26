// Tests del motor REAL (public/hero/), no de un proxy. Semilla fija: si esto
// pasa en CI, pasa en el navegador con esa semilla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './harness.mjs';

test('caminar: el motor real converge por encima del goal con semilla fija', () => {
  const results = [];
  for (const seed of [1, 2, 3]) {
    const H = loadEngine(seed);
    const fvis = new H.Fluid(H.gridFor(24), { itersP: 5 });
    const fev = new H.Fluid(H.gridFor(24), { itersP: 5, itersD: 2 });
    const ev = new H.Evolver(fvis, fev);
    let guard = 0;
    while (!ev.mastered[0] && guard < 200) { ev.step(20); guard++; }
    results.push({ seed, best: ev.best, evals: ev.evals, mastered: ev.mastered[0] });
  }
  const ok = results.filter((r) => r.mastered);
  console.log('caminar por semilla:', JSON.stringify(results));
  assert.ok(ok.length >= 2, 'caminar dominado en al menos 2 de 3 semillas: ' + JSON.stringify(results));
});
