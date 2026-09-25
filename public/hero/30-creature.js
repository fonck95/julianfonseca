// 30-creature.js — el ave, su cuerpo y su aerodinámica.
//
// AERODINÁMICA CUASI-ESTACIONARIA POR PANELES (teoría de elemento de pala,
// Ellington 1984; el régimen de un ave pequeña, Re ≈ 10³).
//
// En cada panel del ala:
//   v_rel = v_ala − u(x)            velocidad del panel MENOS el aire que el
//                                   fluido resuelve ahí (viento + estela propia)
//   α     = atan2(v_rel⊥, v_rel∥)   ángulo de ataque del panel contra su flujo
//   L     = ½ρ v_rel² S (C_Lmax·sin α·cos α)   sustentación ⊥ al flujo
//   D     = ½ρ v_rel² S (C_D0 + C_Lmax·sin²α)  resistencia ∥ al flujo
//
// C_Lmax = 1.5, C_D0 = 0.45, ρ_aire = 1.2 kg/m³ a escala del mundo. El aleteo
// cuenta de verdad: un ala que se mueve CONTRA el viento siente más v_rel y
// genera más sustentación; a favor, menos. Y por Newton III la reacción vuelve
// al fluido: cada panel inyecta −L−D en la rejilla (downwash + vórtices), así
// que el ave vuela dentro del aire que ella misma remueve.
//
// El cuerpo arrastra igual (panel único con C_D de esfera ≈ 0.9).
// Patas: contacto con el suelo, empuje por fricción y rebote inelástico.
//
// EVOLUCIÓN: hill-climbing con mutación gaussiana annealed (σ: 0.35→0.05) y
// reset puntual, sobre el genotipo plano del transformer. Tres etapas con
// objetivos crecientes: caminar (perseguir un fantasma en el suelo), saltar
// (fantasma que brinca) y volar (fantasma en el aire, contra viento variable).
// Cada candidato se evalúa en la rejilla barata (cfg.ev), a 30 Hz.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var DT = H.DT;
  var G = 21.6;              // 9.8 m/s² · 2.2 (mundo comprimido, igual que antes)
  var RHO = 1.2;             // densidad del aire, kg/m³
  var CL_MAX = 1.5, CD0 = 0.45, CD_BODY = 0.9;
  var WING_LEN = 3.5;        // semienvergadura en unidades de mundo (≈ 3.5 cm)
  var PANELS = 4;            // paneles por ala
  var PANEL_S = (WING_LEN / PANELS) * 1.4; // superficie de panel (cm²→unidades²)
  var MASS = 0.028;          // masa del ave (kg) — ~28 g, un gorrión
  var LEG_LEN = 1.0;
  var WORLD_CM = H.CM;       // unidades → metros para las fuerzas

  function Bird(x) {
    this.x = x === undefined ? 50 : x; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.wingL = 0.6; this.wingR = 0.6;   // ángulo de aleteo actual
    this.wingLv = 0; this.wingRv = 0;     // velocidad angular de aleteo
    this.legL = 0; this.legR = 0;
    this.legLv = 0; this.legRv = 0;
    this.ph = 0;
    this.grounded = true;
    this.lift = 0; this.dragF = 0;       // telemetría del último paso
    this.airV = [0, 0];                   // aire relativo en el cuerpo
  }

  // Un paso de física completa. Devuelve la distancia al objetivo.
  // `fluid` resuelve el viento; `inject` dice si la reacción va al campo
  // (true en la simulación visible, false en la de evolución — ver abajo).
  function stepBird(b, out, tx, ty, fluid, inject) {
    var i, s, c;

    // --- entrada del transformer (features por token, normalizadas) ---
    var air = fluid.sample(b.x, b.y + 1.2, b.airV); // aire donde está el cuerpo
    var relVx = air[0] - b.vx, relVy = air[1] - b.vy; // viento relativo sentido
    var wingTipV = (b.wingLv + b.wingRv) * 0.5 * WING_LEN; // velocidad de punta
    var f0 = out.feat[0], f1 = out.feat[1], f2 = out.feat[2], f3 = out.feat[3], f4 = out.feat[4];
    var dx = (tx - b.x) / 25, dy = (ty - b.y) / 25;
    f0[0] = dx; f0[1] = dy; f0[2] = Math.min(2, Math.hypot(dx, dy)) * 0.7;
    f1[0] = b.x / 100; f1[1] = b.y / 40; f1[2] = b.vx / 12; f1[3] = b.vy / 12;
    f1[4] = b.grounded ? 1 : -1; f1[5] = Math.sin(b.ph); f1[6] = Math.cos(b.ph);
    f2[0] = relVx / 10; f2[1] = relVy / 10;
    f2[2] = Math.hypot(relVx, relVy) / 10; f2[3] = wingTipV / 10;
    f3[0] = b.legL; f3[1] = b.legLv * 3; f3[2] = b.grounded && Math.cos(b.legL) > 0.5 ? 1 : 0;
    f4[0] = b.legR; f4[1] = b.legRv * 3; f4[2] = b.grounded && Math.cos(b.legR) > 0.5 ? 1 : 0;

    var o = out.forward(out.feat);
    var cmdLegL = o[0], cmdLegR = o[1], cmdWing = o[2], cmdJump = (o[3] + 1) * 0.5;

    // --- actuadores con dinámica (las articulaciones tienen inercia) ---
    var legStiff = 22;
    var nlegL = b.legL + b.legLv * DT;
    var nlegR = b.legR + b.legRv * DT;
    b.legLv += (cmdLegL * 1.1 - nlegL) * legStiff * DT - b.legLv * 6 * DT;
    b.legRv += (cmdLegR * 1.1 - nlegR) * legStiff * DT - b.legRv * 6 * DT;
    b.legL = nlegL; b.legR = nlegR;
    var wingStiff = 30;
    var nwL = b.wingL + b.wingLv * DT, nwR = b.wingR + b.wingRv * DT;
    b.wingLv += ((0.75 + cmdWing * 0.75) - nwL) * wingStiff * DT - b.wingLv * 3.2 * DT;
    b.wingRv += ((0.75 + cmdWing * 0.75) - nwR) * wingStiff * DT - b.wingRv * 3.2 * DT;
    b.wingL = nwL; b.wingR = nwR;

    // --- salto desde el suelo ---
    if (b.grounded && cmdJump > 0.75) {
      b.vy += 6.5 * cmdJump; b.y = 0.05; b.grounded = false;
    }

    // --- patas: empuje por fricción cuando tocan ---
    if (b.y < LEG_LEN * Math.cos(b.legL) + 0.05) b.vx += -b.legLv * 0.55;
    if (b.y < LEG_LEN * Math.cos(b.legR) + 0.05) b.vx += -b.legRv * 0.55;

    // --- AERODINÁMICA: paneles del ala contra el aire resuelto ---
    var lift = 0, dragX = 0;
    if (!b.grounded || b.y > 0.05) {
      var dirX = b.vx >= 0 ? 1 : -1; // el ave mira hacia donde va
      for (i = 0; i < PANELS; i++) {
        // panel i a lo largo del ala; el ala bate → velocidad vertical de panel
        var frac = (i + 0.5) / PANELS;
        var wAng = (b.wingL + b.wingR) * 0.5;
        var wRate = (b.wingLv + b.wingRv) * 0.5;
        var px = b.x - dirX * frac * WING_LEN * 0.45;
        var py = b.y + 0.8 + frac * WING_LEN * Math.sin(wAng);
        var pvy = wRate * frac * WING_LEN * Math.cos(wAng); // velocidad del panel
        var pv = fluid.sample(px, py, TMP);
        // velocidad del panel relativa al aire
        var rvx = -pv[0];                    // el ala no se mueve en x
        var rvy = pvy - pv[1];
        var vRel = Math.hypot(rvx, rvy);
        if (vRel < 0.05) continue;
        // ángulo de ataque: cuerda del ala ≈ horizontal; α contra el flujo
        var alpha = Math.atan2(-rvy, Math.abs(rvx) + 1e-6);
        alpha = H.clamp(alpha, -1.2, 1.2);
        s = Math.sin(alpha); c = Math.cos(alpha);
        var q05 = 0.5 * RHO * vRel * vRel * PANEL_S * WORLD_CM * WORLD_CM / MASS; // ½ρv²S/m
        var lF = q05 * CL_MAX * s * c;   // ⊥ al flujo
        var dF = q05 * (CD0 + CL_MAX * s * s); // ∥ al flujo
        // descomponer: sustentación vertical, arrastre contra v_rel
        var ux = rvx / vRel, uy = rvy / vRel;
        lift += lF * Math.abs(c) * (vySign(pvy) >= 0 ? 1 : 1) + dF * (-uy);
        dragX += dF * (-ux) + lF * (rvx >= 0 ? -uy : -uy) * 0; // arrastre en x
        // Newton III: el aire recibe −fuerza (downwash + estela del ala)
        if (inject) {
          fluid.inject(px, py, (-dF * ux - lF * uy * 0.4) * 26, (-dF * uy - lF) * 26);
        }
      }
      // arrastre del cuerpo (esfera) contra el aire relativo
      var cvx = air[0] - b.vx, cvy = air[1] - b.vy;
      var vBody = Math.hypot(cvx, cvy);
      var qB = 0.5 * RHO * vBody * vBody * 0.9 * 2.4 * WORLD_CM * WORLD_CM / MASS;
      if (vBody > 1e-4) {
        dragX += qB * CD_BODY * (cvx / vBody);
        lift += qB * CD_BODY * (cvy / vBody);
      }
    }
    b.lift = lift; b.dragF = dragX;

    // --- integración ---
    b.vy += (lift - G) * DT;
    b.vx += dragX * DT;
    // rozamiento global con el suelo/aire (pérdidas no modeladas)
    b.vx *= 1 - 1.2 * DT;
    b.vy *= 1 - 0.9 * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    if (b.y <= 0) {
      b.y = 0;
      b.grounded = true;
      if (b.vy < 0) b.vy = -b.vy * 0.12; // rebote inelástico
      b.vx *= 0.92;                       // fricción de suelo
    } else if (b.y > 0.06) {
      b.grounded = false;
    }
    b.x = H.clamp(b.x, 2, 98);
    b.ph += DT * 4;
    return Math.hypot(tx - b.x, ty - b.y);
  }

  var TMP = [0, 0];
  function vySign(v) { return v >= 0 ? 1 : -1; }

  // ---------------- evolución ----------------
  var STAGES = [
    { id: 'walk', label: 'caminar', goal: 0.9, minEvals: 900,
      ghost: function (t) { return [50 + 22 * Math.sin(t * 0.25), 0]; } },
    { id: 'hop', label: 'saltar', goal: 0.72, minEvals: 900,
      ghost: function (t) { return [50 + 18 * Math.sin(t * 0.3), Math.abs(Math.sin(t * 1.1)) * 8]; } },
    { id: 'fly', label: 'volar', goal: 0.42, minEvals: 900,
      ghost: function (t) { return [50 + 30 * Math.sin(t * 0.45), 20 + 14 * Math.sin(t * 0.8 + 1)]; } }
  ];

  function Evolver(fluid) {
    this.fluid = fluid;
    this.champ = H.Policy.random();
    this.stage = 0; this.stageEvals = 0; this.inGen = 0; this.evals = 0;
    this.mastered = [false, false, false];
    this.history = [];
    this.best = this.evaluate(this.champ, STAGES[0].ghost, 4);
    this.bird = new Bird(50);   // el ave visible usa siempre al campeón
  }

  Evolver.POP = 8;

  Evolver.prototype.evaluate = function (pol, ghost, secs) {
    var b = new Bird(50), n = Math.round(secs / (DT * 2)); // 30 Hz: más barato
    var fit = 0, f = this.fluid, dt2 = DT * 2;
    for (var s = 0; s < n; s++) {
      var g = ghost(s * dt2);
      var d = stepBird(b, pol, g[0], g[1], f, false);
      if (!isFinite(d)) return 0;
      fit += Math.exp(-d / 8);
      // el viento de la evaluación avanza con ella
      f.step(dt2);
    }
    return fit / n;
  };

  Evolver.prototype.step = function (budget) {
    var sigma = 0.35 - 0.3 * (this.inGen / Evolver.POP);
    for (var i = 0; i < budget; i++) {
      var st = STAGES[this.stage];
      var cand = this.champ.clone().mutate(sigma, 0.22, 0.04);
      var f = this.evaluate(cand, st.ghost, 5);
      this.evals++; this.stageEvals++; this.inGen++;
      if (f > this.best) { this.best = f; this.champ = cand; }
      if (this.inGen >= Evolver.POP) {
        this.inGen = 0;
        this.history.push(this.best);
        if (this.history.length > 150) this.history.shift();
      }
    }
    var s2 = STAGES[this.stage];
    if (this.best >= s2.goal && this.stageEvals >= s2.minEvals && !this.mastered[this.stage]) {
      this.mastered[this.stage] = true;
      if (this.stage < STAGES.length - 1) {
        this.stage++;
        this.stageEvals = 0; this.inGen = 0;
        this.best = this.evaluate(this.champ, STAGES[this.stage].ghost, 4);
      }
    }
  };

  Evolver.prototype.reset = function () {
    this.champ = H.Policy.random();
    this.stage = 0; this.stageEvals = 0; this.inGen = 0; this.evals = 0;
    this.mastered = [false, false, false];
    this.history = [];
    this.best = this.evaluate(this.champ, STAGES[0].ghost, 4);
    this.bird = new Bird(50);
    this.fluid.reset();
  };

  // paso de la simulación VISIBLE: ave del campeón + fluido + viento que respira
  Evolver.prototype.tickVisible = function (tWorld, tgt, windFn) {
    var f = this.fluid;
    var w = windFn(tWorld);
    f.wind[0] = w[0]; f.wind[1] = w[1];
    f.step(DT);
    var d = stepBird(this.bird, this.champ, tgt[0], tgt[1], f, true);
    return d;
  };

  H.Bird = Bird;
  H.Evolver = Evolver;
  H.STAGES = STAGES;
  H.stepBird = stepBird;
})();
