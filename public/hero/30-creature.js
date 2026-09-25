// 30-creature.js — el ave: cuerpo articulado + aerodinámica cuasi-estacionaria.
//
// AERODINÁMICA POR PANELES (blade element, Ellington 1984; régimen de ave
// pequeña, Re ≈ 10³). En cada panel del ala:
//
//   v_rel = v_panel + v_ave − u(x)   velocidad del panel contra el aire que
//                                    resuelve Navier–Stokes ahí (viento + estela)
//   e = v_rel/|v_rel|               dirección del flujo relativo
//   sinα = −e_y , cosα = |e_x|      ángulo de ataque de la cuerda (horizontal)
//   q = ½ρ·|v_rel|²·S_eff/m         presión dinámica por unidad de masa
//   L = q·C_Lmax·sinα·cosα          sustentación, ⊥ al flujo: n = (−e_y, e_x)
//   D = q·(C_D0 + C_Lmax·sin²α)     resistencia, opuesta a e
//   F = L·n − D·e
//
// S_eff = S·(1 − 0.7·plegado): al subir el ala se pliega (menos superficie,
// menos sustentación parásita hacia abajo). Sin plegado el aleteo simétrico
// da fuerza NETA cero; con plegado asimétrico el downstroke domina — como un
// ave de verdad. Newton III: el aire recibe −F en el punto del panel
// (downwash y vórtices que el propio fluido transporta después).
//
// Unidades: 1 unidad de mundo = 1 cm. QS = ½ρ·(cm/m)²/m convierte v²·S a
// aceleración en unidades/s², comparable con G (verificado: aleteo máximo
// ≈ 1.8·G — volar exige optimizar, no es gratis ni imposible).
//
// EVOLUCIÓN: hill-climbing con mutación gaussiana annealed (σ 0.35→0.05) sobre
// el genotipo plano del transformer. Tres etapas — caminar, saltar, volar —
// cada una contra su fantasma y su viento. Los candidatos se evalúan en la
// rejilla barata (cfg.ev) a 30 Hz con el fluido a 15 Hz.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var DT = H.DT;
  var G = 21.6;                 // gravedad del mundo (comprimida ×2.2)
  var RHO = 1.2;                // densidad del aire kg/m³
  var CL_MAX = 1.5, CD0 = 0.45, CD_BODY = 0.9;
  var WING_LEN = 3.5;           // semienvergadura (unidades ≈ cm)
  var PANELS = 4;
  var PANEL_S = (WING_LEN / PANELS) * 1.4;   // cm² por panel
  var S_BODY = 2.4;                          // cm² frontal del cuerpo
  var MASS = 0.069;             // kg (~69 g, un gorrión)
  // ½ρ·(cm→m)²/m : v²[unidades²/s²]·S[cm²] → aceleración [unidades/s²]
  var QS = 0.5 * RHO * H.CM * H.CM / (MASS * H.CM);
  var LEG_LEN = 1.0;
  var REACT = 0.8;              // ganancia de la reacción al fluido visible
  var TMP = [0, 0];

  function Bird(x) {
    this.x = x === undefined ? 50 : x; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.wingL = 0.6; this.wingR = 0.6;
    this.wingLv = 0; this.wingRv = 0;
    this.fold = 0;              // plegado actual [0..1]
    this.foldV = 0;
    this.legL = 0; this.legR = 0;
    this.legLv = 0; this.legRv = 0;
    this.ph = 0; this.grounded = true;
    this.lift = 0; this.dragF = 0;
    this.airV = [0, 0];
  }

  // Un paso de física. `pol` = transformer; `fluid` = viento resuelto;
  // `inject` = si la reacción vuelve al campo (visible: true; evolución: false).
  function stepBird(b, pol, tx, ty, fluid, inject) {
    var i;

    // ---- tokens del transformer ----
    var air = fluid.sample(b.x, b.y + 1.2, b.airV);
    var relVx = air[0] - b.vx, relVy = air[1] - b.vy;
    var wTip = (b.wingLv + b.wingRv) * 0.5 * WING_LEN;
    var f0 = pol.feat[0], f1 = pol.feat[1], f2 = pol.feat[2], f3 = pol.feat[3], f4 = pol.feat[4];
    var dx = (tx - b.x) / 25, dy = (ty - b.y) / 25;
    f0[0] = dx; f0[1] = dy; f0[2] = Math.min(2, Math.hypot(dx, dy)) * 0.7;
    f1[0] = b.x / 100; f1[1] = b.y / 40; f1[2] = b.vx / 12; f1[3] = b.vy / 12;
    f1[4] = b.grounded ? 1 : -1; f1[5] = Math.sin(b.ph); f1[6] = Math.cos(b.ph);
    f2[0] = relVx / 10; f2[1] = relVy / 10;
    f2[2] = Math.hypot(relVx, relVy) / 10; f2[3] = wTip / 10;
    f3[0] = b.legL; f3[1] = b.legLv * 3; f3[2] = b.grounded && Math.cos(b.legL) > 0.5 ? 1 : 0;
    f4[0] = b.legR; f4[1] = b.legRv * 3; f4[2] = b.grounded && Math.cos(b.legR) > 0.5 ? 1 : 0;

    var o = pol.forward(pol.feat);
    var cmdLegL = o[0], cmdLegR = o[1], cmdWing = o[2];
    // 4ª salida: en tierra es el impulso de salto; en el aire es el plegado.
    var cmd4 = o[3];

    // ---- actuadores con inercia ----
    var legStiff = 22;
    b.legLv += (cmdLegL * 1.1 - b.legL) * legStiff * DT - b.legLv * 6 * DT;
    b.legRv += (cmdLegR * 1.1 - b.legR) * legStiff * DT - b.legRv * 6 * DT;
    b.legL += b.legLv * DT; b.legR += b.legRv * DT;
    var wingStiff = 30;
    var wCmd = 0.75 + cmdWing * 0.75;
    b.wingLv += (wCmd - b.wingL) * wingStiff * DT - b.wingLv * 3.2 * DT;
    b.wingRv += (wCmd - b.wingR) * wingStiff * DT - b.wingRv * 3.2 * DT;
    b.wingL += b.wingLv * DT; b.wingR += b.wingRv * DT;
    var foldCmd = b.grounded ? 0 : Math.max(0, cmd4);
    b.foldV += (foldCmd - b.fold) * 24 * DT - b.foldV * 8 * DT;
    b.fold += b.foldV * DT;
    b.fold = H.clamp(b.fold, 0, 1);

    // ---- salto (solo en tierra; cmd4 > 0.75) ----
    if (b.grounded && cmd4 > 0.75) {
      b.vy += 6.5 * cmd4; b.y = 0.05; b.grounded = false;
    }

    // ---- patas: empuje por fricción cuando tocan ----
    if (b.y < LEG_LEN * Math.cos(b.legL) + 0.05) b.vx += -b.legLv * 0.55;
    if (b.y < LEG_LEN * Math.cos(b.legR) + 0.05) b.vx += -b.legRv * 0.55;

    // ---- aerodinámica de las alas (solo fuera del suelo) ----
    var fxT = 0, fyT = 0;
    if (b.y > 0.05 || !b.grounded) {
      var dirX = b.vx >= 0 ? 1 : -1;
      var wAng = (b.wingL + b.wingR) * 0.5;
      var wRate = (b.wingLv + b.wingRv) * 0.5;
      var sEff = PANEL_S * (1 - 0.7 * b.fold);   // superficie efectiva
      for (i = 0; i < PANELS; i++) {
        var frac = (i + 0.5) / PANELS;
        var px = b.x - dirX * frac * WING_LEN * 0.45;
        var py = b.y + 0.8 + frac * WING_LEN * Math.sin(wAng);
        // velocidad del panel: aleteo (vertical) + traslación del cuerpo
        var pvx = b.vx, pvy = b.vy + wRate * frac * WING_LEN * Math.cos(wAng);
        var pu = fluid.sample(px, py, TMP);
        // movimiento relativo al aire
        var rvx = pvx - pu[0], rvy = pvy - pu[1];
        var vRel = Math.hypot(rvx, rvy);
        if (vRel < 0.05) continue;
        var ux = rvx / vRel, uy = rvy / vRel;
        var sa = -uy, ca = Math.abs(ux);        // sinα, cosα
        var q = QS * vRel * vRel * sEff;
        var lF = q * CL_MAX * sa * ca;
        var dF = q * (CD0 + CL_MAX * sa * sa);
        var Fx = lF * (-uy) - dF * ux;
        var Fy = lF * ux - dF * uy;
        fxT += Fx; fyT += Fy;
        if (inject) fluid.inject(px, py, -Fx * REACT, -Fy * REACT);
      }
      // arrastre del cuerpo contra el aire relativo
      var cvx = air[0] - b.vx, cvy = air[1] - b.vy;
      var vB = Math.hypot(cvx, cvy);
      if (vB > 1e-4) {
        var qB = QS * vB * vB * S_BODY;
        fxT += qB * CD_BODY * (cvx / vB);
        fyT += qB * CD_BODY * (cvy / vB);
      }
    }
    b.lift = fyT; b.dragF = fxT;

    // ---- integración ----
    b.vy += (fyT - G) * DT;
    b.vx += fxT * DT;
    b.vx *= 1 - 1.2 * DT;
    b.vy *= 1 - 0.9 * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    if (b.y <= 0) {
      b.y = 0; b.grounded = true;
      if (b.vy < 0) b.vy = -b.vy * 0.12;
      b.vx *= 0.92;
    } else if (b.y > 0.06) {
      b.grounded = false;
    }
    b.x = H.clamp(b.x, 2, 98);
    b.ph += DT * 4;

    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy)) {
      b.x = 50; b.y = 0; b.vx = 0; b.vy = 0; b.wingLv = 0; b.wingRv = 0;
      b.legLv = 0; b.legRv = 0; b.fold = 0; b.foldV = 0;
      return Infinity; // aptitud 0: el candidato se descarta solo
    }
    return Math.hypot(tx - b.x, ty - b.y);
  }

  // ---------------- etapas y viento ----------------
  var STAGES = [
    { id: 'walk', label: 'caminar', goal: 0.9, minEvals: 900,
      ghost: function (t) { return [50 + 22 * Math.sin(t * 0.25), 0]; },
      wind: function (t) { return [1.5 * Math.sin(t * 0.3), 0]; } },
    { id: 'hop', label: 'saltar', goal: 0.72, minEvals: 900,
      ghost: function (t) { return [50 + 18 * Math.sin(t * 0.3), Math.abs(Math.sin(t * 1.1)) * 8]; },
      wind: function (t) { return [2.5 * Math.sin(t * 0.35), 0.8 * Math.sin(t * 0.7)]; } },
    { id: 'fly', label: 'volar', goal: 0.42, minEvals: 900,
      ghost: function (t) { return [50 + 30 * Math.sin(t * 0.45), 20 + 14 * Math.sin(t * 0.8 + 1)]; },
      wind: function (t) { return [6 * Math.sin(t * 0.4), 3 * Math.sin(t * 0.23 + 2)]; } }
  ];

  function Evolver(fluidVis, fluidEv) {
    this.fvis = fluidVis;
    this.fev = fluidEv;
    this.champ = H.Policy.random();
    this.stage = 0; this.stageEvals = 0; this.inGen = 0; this.evals = 0;
    this.mastered = [false, false, false];
    this.history = [];
    this.bird = new Bird(50);
    this.best = this.evaluate(this.champ, 0, 4);
  }

  Evolver.POP = 8;

  // Evalúa un candidato en la rejilla barata: ave a 30 Hz, fluido a 15 Hz.
  Evolver.prototype.evaluate = function (pol, stageIdx, secs) {
    var st = STAGES[stageIdx === undefined ? this.stage : stageIdx];
    var b = new Bird(50), f = this.fev, dt2 = DT * 2;
    var n = Math.round(secs / dt2), fit = 0;
    for (var s = 0; s < n; s++) {
      var t = s * dt2;
      var g = st.ghost(t);
      var d = stepBird(b, pol, g[0], g[1], f, false);
      if (!isFinite(d)) return 0;
      fit += Math.exp(-d / 8);
      if (s % 2 === 0) {
        var w = st.wind(t);
        f.wind[0] = w[0]; f.wind[1] = w[1];
        f.step(dt2 * 2);
      }
    }
    return fit / n;
  };

  Evolver.prototype.step = function (budget) {
    var sigma = 0.35 - 0.3 * (this.inGen / Evolver.POP);
    for (var i = 0; i < budget; i++) {
      var cand = this.champ.clone().mutate(sigma, 0.22, 0.04);
      var f = this.evaluate(cand, undefined, 5);
      this.evals++; this.stageEvals++; this.inGen++;
      if (f > this.best) { this.best = f; this.champ = cand; }
      if (this.inGen >= Evolver.POP) {
        this.inGen = 0;
        this.history.push(this.best);
        if (this.history.length > 150) this.history.shift();
      }
    }
    var st = STAGES[this.stage];
    if (this.best >= st.goal && this.stageEvals >= st.minEvals && !this.mastered[this.stage]) {
      this.mastered[this.stage] = true;
      if (this.stage < STAGES.length - 1) {
        this.stage++;
        this.stageEvals = 0; this.inGen = 0;
        this.best = this.evaluate(this.champ, this.stage, 4);
      }
    }
  };

  Evolver.prototype.reset = function () {
    this.champ = H.Policy.random();
    this.stage = 0; this.stageEvals = 0; this.inGen = 0; this.evals = 0;
    this.mastered = [false, false, false];
    this.history = [];
    this.bird = new Bird(50);
    this.fev.reset(); this.fvis.reset();
  };

  // Paso de la escena visible: viento ambiente + fluido + ave del campeón.
  // La reacción de las alas SÍ vuelve al campo aquí: la estela que ves es la
  // que el ave dejó de verdad.
  Evolver.prototype.tickVisible = function (tWorld, tgt, windFn) {
    var f = this.fvis;
    var w = windFn(tWorld);
    f.wind[0] = w[0]; f.wind[1] = w[1];
    f.step(DT);
    return stepBird(this.bird, this.champ, tgt[0], tgt[1], f, true);
  };

  H.Bird = Bird;
  H.Evolver = Evolver;
  H.STAGES = STAGES;
  H.stepBird = stepBird;
  H.windVisible = function (t) {
    // brisa ambiental de la escena: la misma familia que la de las etapas
    return [2.2 * Math.sin(t * 0.31) + 1.2 * Math.sin(t * 0.83 + 1.7),
            0.9 * Math.sin(t * 0.47 + 0.4)];
  };
})();
