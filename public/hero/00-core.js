// 00-core.js — configuración adaptativa y utilidades compartidas del hero.
//
// El mismo motor corre en un portátil y en un móvil: lo único que cambia es el
// tamaño de la rejilla del fluido, cuántos trazadores se dibujan y cuánto
// presupuesto de CPU se le da a la evolución por frame. La física y el cerebro
// son idénticos en los dos.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var mq = function (q) {
    return !!(window.matchMedia && window.matchMedia(q).matches);
  };
  var cores = navigator.hardwareConcurrency || 4;
  // Móvil o máquina corta de núcleos: rejilla más basta y menos CPU por frame.
  var light = mq('(max-width: 860px)') || mq('(pointer: coarse)') || cores <= 4;

  // Escala física: 1 unidad de mundo = 1 cm. Con esa escala un ala de ~3.5 cm
  // de envergadura batiendo a ~0.4 m/s cae en Re ≈ 10^3, el régimen de un ave
  // pequeña / insecto grande, que es donde valen los coeficientes cuasi-
  // estacionarios que usa 30-creature.js.
  H.WORLD_W = 100; // x ∈ [0, 100]
  H.WORLD_H = 40;  // y ∈ [0, 40], y = 0 es el suelo
  H.DT = 1 / 60;   // paso de la física visible
  H.CM = 0.01;     // metros por unidad de mundo

  // Una rejilla de nx celdas a lo ancho; ny sale de la proporción del mundo.
  H.gridFor = function (nx) {
    var ny = Math.round((nx - 2) * (H.WORLD_H / H.WORLD_W)) + 2;
    return { nx: nx, ny: ny };
  };

  var vis = H.gridFor(light ? 46 : 80);   // fluido que se ve
  var ev = H.gridFor(light ? 24 : 34);    // fluido con el que evoluciona

  H.cfg = {
    light: light,
    vis: vis,
    ev: ev,
    tracers: light ? 110 : 320,
    budgetMs: light ? 3 : 6,        // CPU por frame para evolucionar
    maxEvals: light ? 2 : 4,        // tope de evaluaciones por frame
    dpr: Math.min(light ? 1.5 : 2, window.devicePixelRatio || 1),
    reduced: mq('(prefers-reduced-motion: reduce)')
  };

  H.rnd = function () { return Math.random() * 2 - 1; };
  H.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  H.gauss = function () {
    // Box–Muller: la mutación gaussiana converge mejor que la uniforme.
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
})();
