// Arnés: carga el motor REAL de public/hero/ (no un proxy) en un sandbox vm
// con Math.random sembrado: cada test es determinista y reproducible.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = fileURLToPath(new URL('../public/hero/', import.meta.url));
export const PARTS = ['00-core.js', '10-fluid.js', '20-policy.js', '30-creature.js'];

export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadEngine(seed = 1, parts = PARTS) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.navigator = { hardwareConcurrency: 8 };
  sandbox.devicePixelRatio = 1;
  sandbox.performance = { now: () => Date.now() };
  sandbox.matchMedia = () => ({ matches: false });
  sandbox.requestAnimationFrame = () => 0;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`Math.random = (${mulberry32.toString()})(${seed});`, ctx);
  for (const p of parts) {
    vm.runInContext(readFileSync(DIR + p, 'utf8'), ctx, { filename: p });
  }
  if (!sandbox.__HERO__ || !sandbox.__HERO__.Evolver) {
    throw new Error('el motor no cargó: falta alguna parte');
  }
  return sandbox.__HERO__;
}
