// hero.js — punto de entrada del motor del hero.
//
// El motor está partido en public/hero/ (00-core, 10-fluid, 20-policy,
// 30-creature, 40-render, 50-boot, 60-contact, 70-bird-real) para poder
// escribir y validar cada pieza por separado. BirdLab.astro concatena las
// partes EN ORDEN y este archivo va al final: instala la capa de contacto y
// el dibujo de ave real (que pisan lo que definió 50-boot) y arranca todo.
//
// Todo va incrustado inline en el HTML (script clásico, cero módulos): si la
// página se ve, el ave corre — en PC y en móvil, en Pages y en Railway.
(function () {
  'use strict';
  window.__HERO_LOADED__ = true;
  try {
    var H = window.__HERO__;
    if (!H || !H.boot) {
      throw new Error('partes del motor faltantes (¿concatenación incompleta?)');
    }
    if (H.installContact) H.installContact();
    if (H.installRealBird) H.installRealBird();
    H.boot();
  } catch (e) {
    var m = document.getElementById('hud-msg');
    if (m) m.textContent = 'el motor falló al arrancar: ' + (e && e.message ? e.message : e);
    if (window.console) console.error('[hero]', e);
  }
})();
