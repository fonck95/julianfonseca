// 60-contact.js — capa de contacto de la escena visible: dibujo y colisión
// usan el MISMO suelo, sin tocar la física interna ni el entrenamiento.
// Envuelve DOS puntos de entrada:
//   - H.stepBird (lo usan los tests);
//   - Evolver.prototype.tickVisible (lo usa el bucle visible — llama al
//     stepBird de su closure, así que parchear solo H.stepBird no basta).
// Qué añade:
//   - STAND_H: la cadera reposa a la altura real de las patas (1.6 cm). Se
//     hace TRASLADANDO la y que ve la física interna (y' = y − STAND_H): el
//     suelo del solver sigue en 0, la marcha y el salto no cambian, y la
//     cadera visible queda donde el dibujo pone las patas.
//   - landFlash: señal de impacto al aterrizar (∝ |vy| real de llegada) que
//     consume el dibujo: la colisión se ve, no se inventa.
//   - b.wx/b.wy: viento relativo que siente el ave, para orientarla contra el
//     viento como un ave real.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});
  var STAND_H = 1.6;              // cm: cadera sobre patas en reposo
  H.STAND_H = STAND_H;
  H.LEG_WORLD = 4.5;

  function pre(b) {
    if (b.landFlash > 0) b.landFlash = Math.max(0, b.landFlash - H.DT * 2.5);
    b._wasAir = !b.grounded; b._vy0 = b.vy;
    b.y -= STAND_H;
  }
  function post(b, fluid) {
    b.y += STAND_H;
    if (b._wasAir && b.grounded && b._vy0 < -20) {
      b.landFlash = H.clamp(-b._vy0 / 250, 0.35, 1);
    }
    if (fluid && fluid.sample) { var w = fluid.sample(b.x, b.y); b.wx = w[0]; b.wy = w[1]; }
    else { b.wx = 0; b.wy = 0; }
  }

  var innerStep = H.stepBird;
  H.stepBird = function (b, pol, tx, ty, fluid, react) {
    pre(b);
    var err = innerStep(b, pol, tx, ty, fluid, react);
    post(b, fluid);
    return err;
  };

  var innerTick = H.Evolver.prototype.tickVisible;
  H.Evolver.prototype.tickVisible = function (tWorld, tgt, windFn) {
    var b = this.bird;
    pre(b);
    var err = innerTick.call(this, tWorld, tgt, windFn);
    post(b, this.fvis);
    return err;
  };
})();
