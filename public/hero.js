// hero.js — script CLÁSICO (no módulo): cero peticiones de módulo, cero
// bundler, cero dependencia del `base`. Se sirve tal cual desde /public.
// Motor completo del ave evolutiva: neuroevolución (CPU) + render Canvas2D.
// Portado de src/lib/creature.ts y validado headless (caminar ~11 s,
// saltar ~22 s, volar después; metas 0.92/0.78/0.45, minEvals 1300).
(function () {
  'use strict';
  window.__HERO_LOADED__ = true;

  try { boot(); } catch (e) {
    var m = document.getElementById('hud-msg');
    if (m) m.textContent = 'el motor falló al arrancar: ' + (e && e.message ? e.message : e);
    if (window.console) console.error('[hero]', e);
  }

  function boot() {
    var canvas = document.getElementById('neural');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ---------------- motor (idéntico a creature.ts) ----------------
    var DT = 1 / 60, G = 9.8 * 2.2, LEG = 1.0, POP = 8;
    var STAGES = [
      { id: 'walk', label: 'caminar', goal: 0.92, minEvals: 1300, ghost: function (t) { return [50 + 22 * Math.sin(t * 0.25), 0]; } },
      { id: 'hop', label: 'saltar', goal: 0.78, minEvals: 1300, ghost: function (t) { return [50 + 18 * Math.sin(t * 0.3), Math.abs(Math.sin(t * 1.1)) * 8]; } },
      { id: 'fly', label: 'volar', goal: 0.45, minEvals: 1300, ghost: function (t) { return [50 + 30 * Math.sin(t * 0.45), 20 + 14 * Math.sin(t * 0.8 + 1)]; } }
    ];

    var rnd = function () { return Math.random() * 2 - 1; };

    function createNet() {
      var W1 = [], W2 = [], i, r;
      for (i = 0; i < 10; i++) { r = []; for (var j = 0; j < 8; j++) r.push(rnd() * 0.9); W1.push(r); }
      for (i = 0; i < 4; i++) { r = []; for (var k = 0; k < 10; k++) r.push(rnd() * 0.9); W2.push(r); }
      return { W1: W1, W2: W2 };
    }
    function cloneNet(n) {
      return { W1: n.W1.map(function (r) { return r.slice(); }), W2: n.W2.map(function (r) { return r.slice(); }) };
    }
    function mutateNet(n, mag) {
      [n.W1, n.W2].forEach(function (W) {
        for (var i = 0; i < W.length; i++) for (var j = 0; j < W[i].length; j++) {
          if (Math.random() < 0.25) W[i][j] += rnd() * mag;
          if (Math.random() < 0.05) W[i][j] = rnd() * 0.9;
        }
      });
      return n;
    }
    function forward(n, inp) {
      var h = n.W1.map(function (r) {
        var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * inp[i];
        return Math.tanh(s);
      });
      return n.W2.map(function (r) {
        var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * h[i];
        return Math.tanh(s);
      });
    }

    function makeBody(x) {
      return { x: x === undefined ? 50 : x, vx: 0, y: 0, vy: 0, ph: 0, legL: 0, legR: 0, wing: 0, jump: 0, grounded: true };
    }
    function stepBody(b, net, tx, ty) {
      var inp = [
        (tx - b.x) / 25, (ty - b.y) / 25,
        b.vx / 10, b.vy / 10, b.y / 30,
        Math.sin(b.ph), Math.cos(b.ph),
        b.grounded ? 1 : 0
      ];
      var o = forward(net, inp), lL = o[0], lR = o[1], w = o[2], j = o[3];

      b.grounded = b.y <= 0.02;
      if (b.grounded && j > 0.7) { b.vy += 6.5 * j; b.y = 0.03; b.grounded = false; }

      if (b.y < LEG * Math.cos(lL) + 0.05) b.vx += -(lL - b.legL) * 0.9 * 60 * DT * 2.2;
      if (b.y < LEG * Math.cos(lR) + 0.05) b.vx += -(lR - b.legR) * 0.9 * 60 * DT * 2.2;
      b.legL = lL; b.legR = lR;

      if (b.y > 0.05) {
        b.vy += (b.wing - w) * 28;
        b.vx += Math.sign(tx - b.x) * Math.abs(b.wing - w) * 3;
      }
      b.wing = w; b.jump = j;

      b.vy -= G * DT;
      b.vx *= 1 - 1.2 * DT;
      b.vy *= 1 - 0.9 * DT;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      if (b.y <= 0) { b.y = 0; if (b.vy < 0) b.vy = -b.vy * 0.15; }
      b.x = Math.max(2, Math.min(98, b.x));
      b.ph += DT * 4;

      return Math.hypot(tx - b.x, ty - b.y);
    }

    function evaluate(net, ghost, secs) {
      var b = makeBody(50), n = Math.round(secs / DT), fit = 0;
      for (var s = 0; s < n; s++) {
        var g = ghost(s * DT);
        fit += Math.exp(-stepBody(b, net, g[0], g[1]) / 8);
      }
      return fit / n;
    }

    function createEvolver() {
      var champ = createNet();
      return {
        champ: champ, stage: 0, stageEvals: 0, inGen: 0,
        best: evaluate(champ, STAGES[0].ghost, 4),
        evals: 0, history: [], mastered: [false, false, false]
      };
    }
    function evolveStep(ev, budget) {
      for (var i = 0; i < budget; i++) {
        var st = STAGES[ev.stage];
        var cand = mutateNet(cloneNet(ev.champ), 0.45 - 0.3 * (ev.inGen / POP));
        var f = evaluate(cand, st.ghost, 5);
        ev.evals++; ev.stageEvals++; ev.inGen++;
        if (f > ev.best) { ev.best = f; ev.champ = cand; }
        if (ev.inGen >= POP) {
          ev.inGen = 0;
          ev.history.push(ev.best);
          if (ev.history.length > 150) ev.history.shift();
        }
      }
      var s2 = STAGES[ev.stage];
      if (ev.best >= s2.goal && ev.stageEvals >= s2.minEvals && !ev.mastered[ev.stage]) {
        ev.mastered[ev.stage] = true;
        if (ev.stage < STAGES.length - 1) {
          ev.stage++;
          ev.stageEvals = 0; ev.inGen = 0;
          ev.best = evaluate(ev.champ, STAGES[ev.stage].ghost, 4);
        }
      }
    }

    // ---------------- estado visible ----------------
    var ev = createEvolver();
    var body = makeBody(50);
    var trail = []; // pares [x,y] en coords de mundo
    var tWorld = 0;
    var mouse = null;       // {x,y} en coords de mundo
    var lastMouse = -1e9;

    function reset() {
      ev = createEvolver();
      body = makeBody(50);
      trail = [];
      tWorld = 0;
      hudMsg.textContent = 'cerebro al azar: la criatura ni se mueve…';
    }

    // ---------------- HUD ----------------
    var fitEl = document.getElementById('hud-fit');
    var errEl = document.getElementById('hud-err');
    var stepsEl = document.getElementById('hud-steps');
    var hudMsg = document.getElementById('hud-msg');
    var curveEl = document.getElementById('hud-curve');
    var goalEl = document.getElementById('hud-goal');
    var dotEl = document.getElementById('hud-dot');
    var stagesEl = document.getElementById('hud-stages');
    var resetBtn = document.getElementById('hud-reset');
    var items = stagesEl ? stagesEl.querySelectorAll('li') : [];
    if (resetBtn) resetBtn.addEventListener('click', reset);

    var MSGS = [
      'aprendiendo a caminar: las patas aún tropiezan',
      'caminar dominado — ahora aprende a saltar',
      'el salto ya sale — a por las alas'
    ];
    var lastHud = 0;
    function updateHud(now, err) {
      if (now - lastHud < 90) return;
      lastHud = now;
      if (fitEl) fitEl.textContent = ev.best.toFixed(2);
      if (errEl) errEl.textContent = err.toFixed(1);
      if (stepsEl) stepsEl.textContent = ev.evals.toLocaleString('es');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('done', ev.mastered[i] === true && i !== ev.stage);
        items[i].classList.toggle('now', i === ev.stage);
      }
      var st = STAGES[ev.stage];
      var done = ev.mastered[0] && ev.mastered[1] && ev.mastered[2];
      if (dotEl) dotEl.classList.toggle('converged', done || ev.best >= st.goal);
      if (hudMsg) hudMsg.textContent = done ? 'dominadas las tres etapas: sigue tu cursor' : MSGS[ev.stage];
      if (curveEl) {
        var pts = [];
        for (var k = 0; k < ev.history.length; k++) {
          var x = (k / Math.max(1, ev.history.length - 1)) * 160;
          var y = 45 - Math.min(1, ev.history[k]) * 35;
          pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        curveEl.setAttribute('points', pts.join(' '));
      }
      if (goalEl) goalEl.setAttribute('y1', String(45 - st.goal * 35));
      if (goalEl) goalEl.setAttribute('y2', String(45 - st.goal * 35));
    }

    // ---------------- ratón / táctil ----------------
    var W = 0, H = 0, S = 1, OX = 0, GY = 0;
    function toWorldX(px) { return (px - OX) / S; }
    function toWorldY(py) { return (GY - py) / S; }
    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse = { x: toWorldX(e.clientX - r.left), y: toWorldY(e.clientY - r.top) };
      mouse.x = Math.max(2, Math.min(98, mouse.x));
      mouse.y = Math.max(0, Math.min(38, mouse.y));
      lastMouse = performance.now();
    }, { passive: true });

    // ---------------- fondo: campo neuronal ----------------
    var nodes = [];
    (function () {
      for (var i = 0; i < 44; i++) nodes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, s: 0.2 + Math.random() * 0.5 });
    })();
    function drawBg(now) {
      ctx.fillStyle = '#070a14';
      ctx.fillRect(0, 0, W, H);
      var t = now * 0.00004;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var nx = ((n.x + t * n.s) % 1) * W;
        var ny = n.y * H;
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var mx = ((m.x + t * m.s) % 1) * W;
          var my = m.y * H;
          var d2 = (nx - mx) * (nx - mx) + (ny - my) * (ny - my);
          if (d2 < 26000) {
            ctx.strokeStyle = 'rgba(89,215,255,' + (0.05 * (1 - d2 / 26000)).toFixed(3) + ')';
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(mx, my); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(255,91,115,0.16)';
        ctx.beginPath(); ctx.arc(nx, ny, n.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ---------------- dibujo del ave ----------------
    function wx(x) { return OX + x * S; }
    function wy(y) { return GY - y * S; }
    function seg(x1, y1, x2, y2, w, col) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function drawWorld(now) {
      var st = STAGES[ev.stage];
      // suelo (visible en etapas terrestres, tenue al volar)
      var ga = ev.stage === 2 ? 0.12 : 0.4;
      ctx.strokeStyle = 'rgba(89,215,255,' + ga + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();

      // objetivo actual (cursor o fantasma)
      var tgt = target(now);
      var gx = wx(tgt[0]), gy = wy(tgt[1]);
      var pulse = 4 + Math.sin(now * 0.006) * 1.5;
      ctx.fillStyle = 'rgba(255,199,89,0.9)';
      ctx.beginPath(); ctx.arc(gx, gy, pulse * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,199,89,0.35)';
      ctx.beginPath(); ctx.arc(gx, gy, pulse * 1.6, 0, Math.PI * 2); ctx.stroke();

      // estela
      if (trail.length > 2) {
        ctx.strokeStyle = 'rgba(255,91,115,0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(wx(trail[0][0]), wy(trail[0][1]));
        for (var i = 1; i < trail.length; i++) ctx.lineTo(wx(trail[i][0]), wy(trail[i][1]));
        ctx.stroke();
      }

      var b = body;
      var bx = wx(b.x), by = wy(b.y + 0.55);
      var s = S * 1.0;
      var dir = b.vx >= 0 ? 1 : -1;
      var tilt = Math.max(-0.5, Math.min(0.5, b.vy * 0.04)) * dir;

      // patas: cadera → rodilla → pie
      var hipX = bx - dir * s * 0.15, hipY = by + s * 0.25;
      [[b.legL, 0.55], [b.legR, -0.35]].forEach(function (L) {
        var a = L[0], off = L[1];
        var kx = hipX + dir * Math.sin(a) * s * 0.5, ky = hipY + s * 0.45;
        var fx = hipX + dir * Math.sin(a) * s * 0.9 + dir * off * s * 0.2, fy = Math.min(GY, hipY + s * 0.95);
        seg(hipX, hipY, kx, ky, 2, 'rgba(255,160,120,0.85)');
        seg(kx, ky, fx, fy, 2, 'rgba(255,160,120,0.85)');
      });

      // cuerpo
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(-tilt);
      ctx.fillStyle = '#ff5b73';
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.75, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      // cola
      ctx.strokeStyle = 'rgba(255,91,115,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-dir * s * 0.7, 0);
      ctx.quadraticCurveTo(-dir * s * 1.2, -s * 0.1 + Math.sin(now * 0.008) * s * 0.15, -dir * s * 1.5, -s * 0.25);
      ctx.stroke();
      // ala (bate con b.wing)
      var wa = b.wing * 0.9;
      ctx.fillStyle = 'rgba(89,215,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(-dir * s * 0.1, -s * 0.15);
      ctx.quadraticCurveTo(dir * s * 0.1, -s * (0.9 + wa), dir * s * 0.75, -s * (0.5 + wa * 0.8));
      ctx.quadraticCurveTo(dir * s * 0.35, -s * 0.1, -dir * s * 0.1, -s * 0.15);
      ctx.fill();
      // cabeza + pico + ojo
      var hx = dir * s * 0.78, hy = -s * 0.3;
      ctx.fillStyle = '#ff7d90';
      ctx.beginPath(); ctx.arc(hx, hy, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,199,89,0.95)';
      ctx.beginPath();
      ctx.moveTo(hx + dir * s * 0.2, hy - s * 0.06);
      ctx.lineTo(hx + dir * s * 0.62, hy + s * 0.05);
      ctx.lineTo(hx + dir * s * 0.2, hy + s * 0.14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a0d18';
      ctx.beginPath(); ctx.arc(hx + dir * s * 0.09, hy - s * 0.05, Math.max(1.2, s * 0.05), 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // destello de salto
      if (!b.grounded && b.jump > 0.3) {
        ctx.fillStyle = 'rgba(255,199,89,' + (0.5 * b.jump).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(hipX, GY, 5 * b.jump, 0, Math.PI * 2); ctx.fill();
      }
    }

    function target(now) {
      if (mouse && now - lastMouse < 3000) return [mouse.x, mouse.y];
      return STAGES[ev.stage].ghost(tWorld);
    }

    // ---------------- resize ----------------
    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = Math.min(W / 104, H / 46);
      OX = (W - 100 * S) / 2;
      GY = H - 7 * S;
    }
    window.addEventListener('resize', resize);
    resize();

    // ---------------- bucle principal ----------------
    var acc = 0, last = performance.now();
    function frame(now) {
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // entrena con presupuesto de tiempo (no bloquea el render)
      var t0 = performance.now();
      var n = 0;
      while (performance.now() - t0 < 5 && n < 4) { evolveStep(ev, 1); n++; }

      // anima la criatura visible a paso fijo
      acc += dt;
      var err = 0;
      while (acc >= DT) {
        acc -= DT;
        tWorld += DT;
        var tgt = target(performance.now());
        err = stepBody(body, ev.champ, tgt[0], tgt[1]);
        trail.push([body.x, body.y + 0.55]);
        if (trail.length > 48) trail.shift();
      }

      drawBg(now);
      drawWorld(now);
      updateHud(now, err);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
