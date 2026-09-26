// 60-contact.js — capa de contacto de la escena visible: dibujo y colisión
// usan el MISMO suelo. Parchea stepBird sin tocar la física interna ni el
// entrenamiento (evaluate usa substep directo):
//   - STAND_H: la cadera reposa a la altura real de las patas (1.6 cm). Se
//     hace TRASLADANDO la coordenada y que ve stepBird (y' = y - STAND_H):
//     el suelo del solver sigue en 0, la marcha y el salto no cambian, y la
//     cadera visible queda a la altura del dibujo. Levantar y a posteriori
//     habría hecho «flotar» al ave y roto la cinemática de apoyo.
//   - landFlash: señal de impacto al aterrizar (proporcional a |vy| real de
//     llegada): la colisión se VE (destello + flexión de patas), no se inventa.
//   - b.wx/b.wy: viento relativo que siente el ave, para que el dibujo la
//     oriente contra el viento como un ave real.
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
    // el solver ve el suelo en 0; el mundo visible lo ve en STAND_H
    b.y -= STAND_H;
    var err = inner(b, pol, tx, ty, fluid, react);
    b.y += STAND_H;
    if (wasAir && b.grounded && vy0 < -20) {
      b.landFlash = H.clamp(-vy0 / 250, 0.35, 1);
    }
    // viento relativo expuesto al render
    if (fluid && fluid.sample) { var w = fluid.sample(b.x, b.y); b.wx = w[0]; b.wy = w[1]; }
    else { b.wx = 0; b.wy = 0; }
    return err;
  };
})();
