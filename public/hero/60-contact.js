// 60-contact.js — capa de contacto de la escena visible: dibujo y colisión
// usan el MISMO suelo. Parchea stepBird sin tocar la física interna (la
// evolución entrena igual que antes):
//   - STAND_H: la cadera reposa a la altura real de las patas (1.6 cm); antes
//     se hundía en y=0 y el dibujo inventaba un offset flotante.
//   - landFlash: señal de impacto al aterrizar (proporcional a |vy| de llegada)
//     que consume el dibujo: la colisión se VE, no se imagina.
//   - b.wx/b.wy: viento relativo que siente el ave, para que cuerpo y cabeza
//     miren al viento como un ave real.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});
  var STAND_H = 1.6;              // cm: cadera sobre patas en reposo
  H.STAND_H = STAND_H;
  H.LEG_WORLD = 4.5;

  var inner = H.stepBird;
  H.stepBird = function (b, pol, tx, ty, fluid, react) {
    if (b.landFlash > 0) b.landFlash = Math.max(0, b.landFlash - H.DT * 2.5);
    var wasAir = !b.grounded, vy0 = b.vy;
    var err = inner(b, pol, tx, ty, fluid, react);
    // suelo visible = suelo físico: la cadera no baja de STAND_H en tierra
    if (b.grounded && b.y < STAND_H) b.y = STAND_H;
    // señal de impacto: venía del aire y aterrizó rápido
    if (wasAir && b.grounded && vy0 < -20) {
      b.landFlash = H.clamp(-vy0 / 250, 0.35, 1);
    }
    // viento relativo expuesto al render
    if (fluid && fluid.sample) { var w = fluid.sample(b.x, b.y); b.wx = w[0]; b.wy = w[1]; }
    else { b.wx = 0; b.wy = 0; }
    return err;
  };
})();
