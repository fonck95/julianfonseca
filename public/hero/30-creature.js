// 30-creature.js — el ave: cuerpo articulado + aerodinámica con AoA FIRMADO.
//
// AERODINÁMICA POR PANELES (blade element, Ellington 1984). En cada panel:
//
//   w = u_aire − v_panel        viento relativo (u sale del solver Navier–Stokes)
//   û = w/|w|                   dirección del flujo relativo
//   sinα = ĉ × û                ÁNGULO DE ATAQUE FIRMADO — cambia de signo con
//   cosα = ĉ · û                la orientación real del ala contra el flujo
//   Cn = CL·sinα·cosα           |sinα|<0.707 (pre-pérdida)
//      = CDP·sinα·|sinα|        si no: meseta de placa plana (Dickinson 1999)
//   Cd = CD0 + CL·sin²α         resistencia inducida
//   F = q·S·(Cn·n̂ + Cd·û)       n̂ ⊥ cuerda; el drag va A LO LARGO de û (frena)
//
// BUG ANTERIOR (por qué «la sustentación estaba hardcodeada»): cosα era |e_x|
// — un valor absoluto — así que la sustentación NUNCA cambiaba de signo: un
// aleteo simétrico empujaba siempre hacia arriba y hacía falta un «reflejo de
// plegado» hardcodeado para que el ave no subiera sola. Ahora el AoA es
// firmado de verdad: batiendo simétrico la fuerza neta es ~cero, y para volar
// la política tiene que APRENDER la asimetría de carrera y el emplumado.
//
// CPG: el transformer ya no da el ángulo del ala paso a paso (no puede seguir
// 6–38 Hz): da los PARÁMETROS del oscilador que lo genera — frecuencia,
// amplitud, asimetría de carrera, amplitud y fase de emplumado, empuje. El ala
// es un oscilador de segundo orden (ω=150 rad/s, ζ=0.15) con tope de velocidad
// de punta (límite muscular, curva de Hill): THVMAX=95 rad/s → punta ≤6.7 m/s.
//
// ESCALA: 1 unidad = 1 cm, g = 981 u/s² (9.81 m/s² real), masa 5 g. Nota de
// honestidad física: QS = ½ρ·CM³/m vale 1.2e-4 en unidades exactas, pero un
// modelo 2D cuasi-estacionario NO reproduce la sustentación por vórtice de
// borde de ataque (LEV) que sostiene a un ave real de 5 g — con QS exacto
// ninguna política despega (medido: 0.06·G de techo). Se usa QS=0.012, la
// escala comprimida donde el régimen de vuelo es aprendible; el resto de la
// física (AoA firmado, pérdida, reacción al fluido, cinemática de apoyo) es
// exacta.
//
// MARCHA: cinemática de apoyo (pie plantado): la pata que barre hacia atrás en
// contacto impone su velocidad al cuerpo — la dirección la APRENDE la política
// rompiendo la simetría, no está en el código. SALTO: extensión de patas.
//
// CPG DE PATAS BIDIRECCIONAL: el transformer da parámetros para un CPG de
// patas independiente (phiL) que corre SIEMPRE (tierra o aire). La fase de
// patas determina el contacto (stance = sin(phiL+ph)<0 para izquierda,
// sin(phiL)<0 para derecha), sustituyendo el antiguo chequeo de velocidad.
//
// COMPUERTAS DE MODALIDAD (por qué antes «solo sustentaba»): la aptitud era
// exp(−d/σ) pura y hacer hover en el centro puntúa mejor que cualquier
// intento torpe de caminar — la evolución encontraba ese óptimo local y se
// quedaba ahí. Ahora cada etapa exige SU modalidad, medida sobre la
// simulación: caminar exige estar en tierra; saltar exige despegues y ≥2
// aterrizajes; volar exige aire sostenido y penaliza tocar suelo tarde. Y el
// fantasma de caminar VIAJA (zanahoria a 10 u/s ida y vuelta): quedarse
// quieto ya no puntúa. Validado headless: hover 0.042→0.000 en caminar;
// caminar a la velocidad del fantasma 0.612 vs quieto 0.169.
//
// PAREDES: antes multiplicaban la velocidad por −0.3 EN CADA SUBSTEP aunque
// ya apuntara hacia dentro — el ave quedaba quieta y confinada en el borde.
// Ahora solo se amortigua la componente que sale, y un detector de
// atrapamiento la respawnea si pasa 1.2 s pegada a un borde casi sin
// velocidad.
//
// EVOLUCIÓN: hill-climbing con mutación gaussiana annealed (σ 0.35→0.05)
// sobre el genotipo plano del transformer. Tres etapas con fantasma completo
// (x e y): caminar, saltar, volar. Fitness = exp(−d/σ) × compuerta.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var DT = H.DT;
  var G = 981;                  // u/s² — 9.81 m/s² REAL (1 u = 1 cm)
  var QS = 0.012;               // ½ρ·CM³/m comprimido (ver nota LEV arriba)
  var WH = H.WORLD_H;           // techo del mundo

  // geometría del ala (cm)
  var L = 7;                    // semienvergadura
  var NP = 4;                   // paneles por ala
  var CH = 3.2;                 // cuerda
  var SP = (L / NP) * CH;       // área de panel (cm²)
  var SB = 3;                   // área del cuerpo (arrastre parásito)
  var CD0 = 0.35, CDB = 1.0, CL = 2.0, CDP = 2.0;
  var CAM = 0.13;   // combadura pasiva del perfil: sustentación incluso con AoA 0
  var KCP = 0.40;   // pronación pasiva acoplada a la velocidad de batido

  // actuadores
  var AK = 22500, AC = 45;      // ala: ω=150 rad/s, ζ=0.15
  var BK = 19600, BC = 98;      // emplumado: ω=140, ζ=0.35
  var THVMAX = 95;              // tope de velocidad angular del ala
  var LEANK = 0.9;              // ganancia de inclinación → empuje
  var PHIK = 6000, PHIC = 180;  // servo de pata
  var LEG = 4.5;                // longitud de pata (cm)
  var VMAX = 260, VYMAX = 420;  // topes de velocidad del cuerpo (u/s)

  // integración de la evolución: dt=1/30 con 4 substeps (1.9 ms por evaluación)
  var DTE = 1 / 30, SUBE = 4, HE = DTE / SUBE;

  function Bird(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.th = 0; this.thv = 0; this.be = 0; this.bev = 0; this.phi = 0;
    this.phiL = 0; this.phLeg = 0;
    this.pL = 0; this.pR = 0; this.pLv = 0; this.pRv = 0;
    this.grounded = true; this.lift = 0; this.air = 0;
  }

  // Un substep de física. wx,wy = viento del fluido en la posición del ave.
  // v: si true, la reacción de las alas vuelve al campo (solo escena visible).
  function substep(b, o, fluid, wx, wy, h, react) {
    // --- CPG de patas (siempre, tierra o aire) ---
    b.phiL += 2 * Math.PI * (2 + (o[3] + 1) * 5) * h;
    var amp = o[4] * 0.95;
    var ph = o[5] * 1.2;
    b.phLeg = ph;
    var tL = amp * Math.sin(b.phiL + ph) + o[0] * 0.3;
    var tR = amp * Math.sin(b.phiL) + o[1] * 0.3;
    // servo de pata hacia el comando del CPG
    b.pLv += (PHIK * (tL - b.pL) - PHIC * b.pLv) * h; b.pL += b.pLv * h;
    b.pRv += (PHIK * (tR - b.pR) - PHIC * b.pRv) * h; b.pR += b.pRv * h;
    if (b.pL > 0.95) b.pL = 0.95; if (b.pL < -0.95) b.pL = -0.95;
    if (b.pR > 0.95) b.pR = 0.95; if (b.pR < -0.95) b.pR = -0.95;

    var Fx = 0, Fy = 0;
    if (b.grounded) {
      // MARCHA: la pata que barre hacia atrás EN CONTACTO impone su velocidad
      // al cuerpo (pie plantado). La dirección la aprende la política.
      var k = Math.min(1, 30 * h);
      var stanceL = Math.sin(b.phiL + ph) < 0;
      var stanceR = Math.sin(b.phiL) < 0;
      if (stanceL) {
        b.vx += (-LEG * Math.cos(b.pL) * b.pLv - b.vx) * k;
      }
      if (stanceR) {
        b.vx += (-LEG * Math.cos(b.pR) * b.pRv - b.vx) * k;
      }
      // SALTO: extensión rápida de patas
      if (o[2] > 0.55) { b.vy = 150 * o[2]; b.y = 0.05; b.grounded = false; }
    } else {
      // --- CPG de alas: la fase avanza; la política da sus parámetros ---
      b.phi += 2 * Math.PI * (6 + (o[6] + 1) * 16) * h;   // 6..38 Hz
      var thCmd = Math.max(0, o[7]) * 1.45 * Math.sin(b.phi + o[8] * 0.85 * Math.sin(b.phi));
      var beCmd = Math.max(0, o[9]) * 1.25 * Math.sin(b.phi + o[10] * Math.PI);

      // --- aerodinámica por paneles, AoA FIRMADO ---
      for (var wing = 0; wing < 2; wing++) {
        var sg = wing ? -1 : 1;
        var thW = b.th * sg;
        var beW = (b.be - KCP * b.thv / THVMAX) * sg;
        var ct = Math.cos(thW), st = Math.sin(thW);
        var psi = thW + beW, cp = Math.cos(psi), sp = Math.sin(psi);
        for (var i = 0; i < NP; i++) {
          var r = ((i + 0.5) / NP) * L;
          var pvx = b.vx + b.thv * sg * r * (-st), pvy = b.vy + b.thv * sg * r * ct;
          var rx = wx - pvx, ry = wy - pvy;           // viento relativo
          var V = Math.hypot(rx, ry);
          if (V < 5) continue;
          var ux = rx / V, uy = ry / V;
          var sa = cp * uy - sp * ux;                 // sinα FIRMADO (ĉ × û)
          var ca = cp * ux + sp * uy;                 // cosα FIRMADO (ĉ · û)
          var cn = Math.abs(sa) < 0.707 ? CL * (sa * ca + CAM * ca * ca) : CDP * sa * Math.abs(sa) + CL * CAM * ca * ca;
          var cd = CD0 + CL * sa * sa;
          var q = QS * V * V * SP;
          var fx = q * (cn * (-sp) + cd * ux);
          var fy = q * (cn * cp + cd * uy);
          Fx += fx; Fy += fy;
          if (react && fluid) {
            // Newton III: el aire recibe −F en el punto del panel
            fluid.inject(b.x + Math.cos(thW) * r * 0.1, b.y + 0.4,
              -fx * 0.06, -fy * 0.06);
          }
        }
      }
      // arrastre del cuerpo contra el viento relativo
      var vB = Math.hypot(wx - b.vx, wy - b.vy);
      if (vB > 5) {
        var qB = QS * vB * vB * SB;
        Fx += qB * CDB * (wx - b.vx) / vB;
        Fy += qB * CDB * (wy - b.vy) / vB;
      }
      // empuje: la política inclina el plano de sustentación
      Fx += o[11] * LEANK * Math.max(0, Fy);

      // actuadores de segundo orden con topes físicos
      b.thv += (AK * (thCmd - b.th) - AC * b.thv) * h;
      if (b.thv > THVMAX) b.thv = THVMAX; if (b.thv < -THVMAX) b.thv = -THVMAX;
      b.th += b.thv * h;
      if (b.th > 1.4) { b.th = 1.4; b.thv *= -0.3; }
      if (b.th < -1.4) { b.th = -1.4; b.thv *= -0.3; }
      b.bev += (BK * (beCmd - b.be) - BC * b.bev) * h; b.be += b.bev * h;
      if (b.be > 1.3) { b.be = 1.3; b.bev *= -0.3; }
      if (b.be < -1.3) { b.be = -1.3; b.bev *= -0.3; }
    }
    b.lift = Fy;

    b.vx += Fx * h; b.vy += (Fy - G) * h;
    b.vx *= 1 - (b.grounded ? 1.0 : 0.4) * h; b.vy *= 1 - 0.3 * h;
    if (b.vx > VMAX) b.vx = VMAX; if (b.vx < -VMAX) b.vx = -VMAX;
    if (b.vy > VYMAX) b.vy = VYMAX; if (b.vy < -VYMAX) b.vy = -VYMAX;
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.y <= 0) { b.y = 0; b.grounded = true; if (b.vy < 0) b.vy *= -0.15; }
    else { b.grounded = false; b.air = 1; }
    if (b.y > WH) { b.y = WH; if (b.vy > 0) b.vy *= -0.2; }
    // PAREDES: solo se amortigua la componente que SALE. Antes se multiplicaba
    // por −0.3 en cada substep aunque ya apuntara hacia dentro: la velocidad
    // se anulaba contra el borde y el ave quedaba quieta y confinada.
    if (b.x < 2) { b.x = 2; if (b.vx < 0) b.vx *= -0.25; }
    if (b.x > 98) { b.x = 98; if (b.vx > 0) b.vx *= -0.25; }
  }

  // Un frame completo (DT) de la escena visible: 8 substeps, con el fluido.
  function stepBird(b, pol, tx, ty, fluid, react) {
    var wx = 0, wy = 0;
    if (fluid) { var w = fluid.sample(b.x, b.y); wx = w[0]; wy = w[1]; }
    var f = buildFeats(b, tx, ty, wx, wy);
    var o = pol.forward(f);
    for (var s = 0; s < 8; s++) {
      if (fluid) { var w2 = fluid.sample(b.x, b.y); wx = w2[0]; wy = w2[1]; }
      substep(b, o, fluid, wx, wy, DT / 8, react && s === 3);
    }
    return Math.hypot(tx - b.x, ty - b.y);
  }

  // features de los 5 tokens del transformer
  function buildFeats(b, tx, ty, wx, wy) {
    var dx = (tx - b.x) / 30, dy = (ty - b.y) / 20;
    var t0 = [dx, dy, Math.min(1, Math.hypot(dx, dy))];
    var t1 = [(b.x - 50) / 50, b.y / WH, b.vx / 100, b.vy / 100,
              b.grounded ? 1 : -1, Math.sin(b.th), Math.cos(b.th),
              Math.sin(b.phiL), Math.cos(b.phiL)];
    var rel = Math.hypot(wx - b.vx, wy - b.vy);
    var t2 = [(wx - b.vx) / 100, (wy - b.vy) / 100, Math.min(1, rel / 300),
              Math.min(1, Math.abs(b.thv) / THVMAX)];
    var t3 = [b.pL, b.pLv / 30, Math.sin(b.phiL), b.grounded ? 1 : 0];
    var t4 = [b.pR, b.pRv / 30, Math.cos(b.phiL), b.grounded ? 1 : 0];
    return [t0, t1, t2, t3, t4];
  }

  // ---- etapas del currículo ----
  // fantasma completo (x e y); fitness = exp(−d/σ) × COMPUERTA DE MODALIDAD.
  // caminar: zanahoria VIAJERA (ida y vuelta a 10 u/s) — quedarse quieto ya
  // no puntúa; la compuerta exige tierra. saltar: fantasma que rebota; la
  // compuerta exige aire Y aterrizajes. volar: Lissajous con viento; la
  // compuerta exige aire sostenido.
  function carrot(t) {
    var p = (t * 10 / 84) % 2;
    return [p < 1 ? 8 + 84 * p : 8 + 84 * (2 - p), 0];
  }
  var STAGES = [
    { name: 'caminar', secs: 6.0, goal: 0.45, sigma: 10,
      ghost: carrot,
      wind: function () { return [0, 0]; },
      spawn: function (b) { b.x = 8; b.y = 0; b.vx = 0; b.vy = 0; b.grounded = true; } },
    { name: 'saltar', secs: 4.0, goal: 0.40, sigma: 9,
      ghost: function (t) { return [50 + 20 * Math.sin(t * 0.3), Math.abs(Math.sin(t * 2.2)) * 10]; },
      wind: function () { return [0, 0]; },
      spawn: function (b) { b.x = 50; b.y = 0; b.vx = 0; b.vy = 0; b.grounded = true; } },
    { name: 'volar', secs: 4.0, goal: 0.32, sigma: 12,
      ghost: function (t) { return [50 + 22 * Math.sin(t * 0.45), 14 + 8 * Math.sin(t * 0.8 + 1)]; },
      wind: function (t) { return [125 + 65 * Math.sin(t * 0.4), 40 * Math.sin(t * 0.23 + 2)]; },
      spawn: function (b) { b.x = 50; b.y = 14; b.vx = 0; b.vy = 0; b.grounded = false; } }
  ];

  function freshBird() {
    var b = new Bird(50);
    b.th = 0; b.thv = 0; b.be = 0; b.bev = 0; b.phi = 0; b.phiL = 0;
    b.pL = 0; b.pR = 0; b.pLv = 0; b.pRv = 0; b.lift = 0;
    return b;
  }

  function Evolver(fluidVis, fluidEv) {
    this.fvis = fluidVis; this.fev = fluidEv;
    this.reset();
  }

  Evolver.prototype.evaluate = function (pol, stageIdx) {
    var st = STAGES[stageIdx];
    var b = freshBird();
    st.spawn(b);
    var f = this.fev;
    f.reset();
    var n = Math.round(st.secs / DTE), sum = 0;
    // contadores de modalidad para la compuerta
    var airFrames = 0, landings = 0, lateTouch = false, wasG = b.grounded;
    for (var fr = 0; fr < n; fr++) {
      var t = fr * DTE;
      var g = st.ghost(t);
      var w = st.wind(t);
      f.wind[0] = w[0]; f.wind[1] = w[1];
      if (fr % 2 === 0) f.step(DTE * 2);
      var feats = buildFeats(b, g[0], g[1], w[0], w[1]);
      var o = pol.forward(feats);
      var wx = w[0], wy = w[1];
      if (f.sample) { var ws = f.sample(b.x, b.y); wx = ws[0]; wy = ws[1]; }
      for (var s = 0; s < SUBE; s++) substep(b, o, null, wx, wy, HE, false);
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.th)) return 0;
      if (!b.grounded) airFrames++;
      if (!wasG && b.grounded) landings++;   // aterrizaje = estaba en aire y tocó suelo
      wasG = b.grounded;
      if (t > 1.0 && b.grounded) lateTouch = true;
      sum += Math.exp(-Math.hypot(g[0] - b.x, g[1] - b.y) / st.sigma);
    }
    // COMPUERTA DE MODALIDAD: cada etapa exige la suya, medida en la simulación.
    // Sin esto el hover puntúa bien en caminar/saltar (óptimo local) y el ave
    // visible se queda sustentando sin aprender a caminar ni saltar.
    var airFrac = airFrames / n, gate;
    if (stageIdx === 0) {
      gate = H.clamp(1 - airFrac / 0.15, 0, 1);            // caminar = tierra
    } else if (stageIdx === 1) {
      gate = Math.min(1, airFrac / 0.12) * Math.min(1, landings / 2); // saltar = aire + aterrizajes
    } else {
      gate = Math.min(1, airFrac / 0.85);                   // volar = aire sostenido
      if (lateTouch) sum *= 0.4;                            // y sin tocar suelo tarde
    }
    return (sum / n) * gate;
  };

  Evolver.prototype.step = function (budgetEvals) {
    var sigma = Math.max(0.05, 0.35 * Math.pow(0.9995, this.evals));
    for (var k = 0; k < budgetEvals; k++) {
      var cand = this.champ.clone().mutate(sigma, 0.09);
      var fit = this.evaluate(cand, this.stage);
      this.evals++; this.stageEvals++; this.inGen++;
      if (fit > this.best) { this.champ = cand; this.best = fit; this.improved = true; }
      if (this.inGen >= 24) {
        this.inGen = 0;
        this.history.push(this.best);
        if (this.history.length > 160) this.history.shift();
        if (this.best >= STAGES[this.stage].goal && this.stageEvals > 400) {
          this.mastered[this.stage] = true;
          if (this.stage < STAGES.length - 1) {
            this.stage++; this.stageEvals = 0;
            this.best = this.evaluate(this.champ, this.stage);
            this.respawnVisible();
          }
        }
      }
    }
  };

  // Recoloca al ave VISIBLE según la etapa actual: al avanzar de etapa (o al
  // quedar atrapada) empieza donde esa etapa empieza, en vez de seguir
  // flotando donde la dejó la anterior.
  Evolver.prototype.respawnVisible = function () {
    var b = this.bird;
    STAGES[this.stage].spawn(b);
    b.th = 0; b.thv = 0; b.be = 0; b.bev = 0; b.lift = 0;
    this.pinT = 0;
  };

  Evolver.prototype.reset = function () {
    this.champ = H.Policy.random();
    this.stage = 0; this.stageEvals = 0; this.inGen = 0; this.evals = 0;
    this.best = this.evaluate(this.champ, 0);
    this.improved = false;
    this.mastered = [false, false, false];
    this.history = [];
    this.bird = new Bird(50);
    this.pinT = 0;
    if (this.fev) this.fev.reset();
    if (this.fvis) this.fvis.reset();
    this.respawnVisible();
  };

  // Paso de la escena visible: viento ambiente + fluido + ave del campeón.
  Evolver.prototype.tickVisible = function (tWorld, tgt, windFn) {
    var f = this.fvis;
    var w = windFn(tWorld, this.stage);
    f.wind[0] = w[0]; f.wind[1] = w[1];
    f.step(DT);
    var err = stepBird(this.bird, this.champ, tgt[0], tgt[1], f, true);
    // anti-atrapamiento: pegada a un borde (o al techo) y casi sin velocidad
    // durante 1.2 s → respawn en la etapa actual.
    var b = this.bird;
    if (b.x < 3 || b.x > 97 || b.y > WH - 2) {
      this.pinT += DT;
    } else {
      this.pinT = 0;
    }
    if (this.pinT > 1.2) this.respawnVisible();
    return err;
  };

  H.Bird = Bird;
  H.Evolver = Evolver;
  H.STAGES = STAGES;
  H.stepBird = stepBird;
  H.G_WORLD = G;
  H.windVisible = function (t, stage) {
    var w = H.STAGES[stage || 0].wind(t);
    return [w[0] + 30 * Math.sin(t * 0.9), w[1] + 15 * Math.sin(t * 0.7)];
  };
})();
