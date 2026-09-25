// hero.js — punto de entrada del motor del hero.
//
// El motor está partido en public/hero/ (00-core, 10-fluid, 20-policy,
// 30-creature, 40-render, 50-boot) para poder escribir y validar cada pieza
// por separado. El build de NeuralCanvas.astro concatena las partes EN ORDEN,
// y este archivo va al final: es el único que arranca la simulación.
//
// Todo va incrustado inline en el HTML (script clásico, cero módulos): si la
// página se ve, el ave corre — en PC y en móvil, en Pages y en Railway.
(function () {
  'use strict';
  window.__HERO_LOADED__ = true;
  try {
    if (!window.__HERO__ || !window.__HERO__.boot) {
      throw new Error('partes del motor faltantes (¿concatenación incompleta?)');
    }
    window.__HERO__.boot();
  } catch (e) {
    var m = document.getElementById('hud-msg');
    if (m) m.textContent = 'el motor falló al arrancar: ' + (e && e.message ? e.message : e);
    if (window.console) console.error('[hero]', e);
  }
})();
