// 70-bird-real.js — pose pura + dibujo. Todo sale del estado físico: pitch de
// la velocidad vertical, cabeza contra el viento relativo (b.wx/b.wy), cola
// que se abre al frenar, patas con IK al plano de colisión exacto (y=0 del
// solver = cadera en STAND_H) y flexión en landFlash.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});
  var SH = function () { return H.STAND_H || 1.6; };

  // pose(b) -> ángulos en radianes. Pura: sin canvas, testeable en Node.
  H.birdPose = function (b) {
    var sp = Math.hypot(b.vx || 0, b.vy || 0);
    // pitch: nariz arriba al ascender, abajo al picar; en tierra, erguido
    var pitch = b.grounded ? 0 : Math.atan2(b.vy || 0, Math.max(40, sp) * 0.6);
    pitch = H.clamp(pitch, -0.5, 0.7);
    // cabeza contra el viento relativo (el ave mira de dónde viene el aire)
    var wx = (b.wx == null) ? 60 : b.wx, wy = (b.wy == null) ? 0 : b.wy;
    var head = b.grounded ? 0 : H.clamp(Math.atan2(wy, Math.max(20, Math.abs(wx))) * (wx >= 0 ? -1 : 1), -0.35, 0.35);
    // cola: abanico al frenar (vy<0 = cayendo/frenando) y al estar en tierra
    var tail = b.grounded ? 0.30 : H.clamp(0.12 + -(b.vy || 0) / 220, 0.05, 0.55);
    // patas: en tierra extendidas al suelo; en vuelo recogidas hacia atrás
    var leg = b.grounded ? 1 : H.clamp(0.25 + Math.abs(b.vy || 0) / 400, 0.2, 0.6);
    var crouch = H.clamp((b.landFlash || 0) * 0.45, 0, 0.45); // flexión al impactar
    return { pitch: pitch, head: head, tail: tail, leg: leg, crouch: crouch, grounded: !!b.grounded };
  };

  // IK de pata: del punto de cadera (0,0 local) al suelo (sy en coords mundo)
  // con dos segmentos de longitud L. Devuelve rodilla y pie locales.
  H.legIK = function (L, hipX, hipY, footX, footY) {
    var dx = footX - hipX, dy = footY - hipY;
    var d = Math.hypot(dx, dy);
    if (d < 1e-6) d = 1e-6;
    var dc = Math.min(d, 2 * L - 1e-3);
    var a = Math.atan2(dy, dx);
    var cosk = H.clamp((dc * dc) / (2 * L * L) - 1, -1, 1); // ley de cosenos
    var bend = Math.acos(cosk) * 0.5;
    var kneeA = a + (dx >= 0 ? -bend : bend); // rodilla hacia atrás
    return { knee: [hipX + Math.cos(kneeA) * L, hipY + Math.sin(kneeA) * L],
             foot: [hipX + Math.cos(a) * dc, hipY + Math.sin(a) * dc] };
  };
})();
