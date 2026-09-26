// 50-boot.js — orquesta todo: fluidos, evolución, escena, HUD y bucle.
//
// Dos rejillas de Navier–Stokes: la visible (cara) y la de evolución (barata).
// El bucle gasta un presupuesto de tiempo en evolucionar y deja siempre
// tiempo para el frame: en móvil la evolución va más lenta, pero la animación
// nunca se traba. Si la pestaña se oculta, todo se pausa (batería).
//
// Aquí se sobreescriben drawWorld/drawBird del Renderer: el ave nueva tiene
// otros campos (th, be, pL, pR) y se dibuja en unidades del mundo reales, así
// que en móvil por fin se ve.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  // ---------- dibujo del mundo y del ave (campos nuevos) ----------
  H.Renderer.prototype.drawWorld = function (ev, tgt, now, trail) {
    var ctx = this.ctx;
    var gy = this.wy(0);

    // suelo
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(this.wx(0), gy); ctx.lineTo(this.wx(100), gy); ctx.stroke();
    var grd = ctx.createLinearGradient(0, gy, 0, gy + 26);
    grd.addColorStop(0, 'rgba(255,91,115,.09)');
    grd.addColorStop(1, 'rgba(255,91,115,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(this.wx(0), gy, 100 * this.S, 26);

    // objetivo fantasma
    if (tgt) {
      var tx = this.wx(tgt[0]), ty = this.wy(tgt[1]);
      var pulse = 1 + 0.18 * Math.sin(now * 0.005);
      ctx.strokeStyle = 'rgba(255,199,89,.5)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(tx, ty, 7 * pulse, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,199,89,.3)';
      ctx.beginPath(); ctx.arc(tx, ty, 2.2, 0, 6.283); ctx.fill();
    }

    // estela
    if (trail && trail.length > 1) {
      ctx.beginPath();
      for (var i = 0; i < trail.length; i++) {
        var px = this.wx(trail[i][0]), py = this.wy(trail[i][1]);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = 'rgba(255,91,115,.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    this.drawBird(ev.bird, now);
  };

  H.Renderer.prototype.drawBird = function (b, now) {
    var ctx = this.ctx;
    // móvil: el mundo entero cabe en ~360 px; el ave (14 cm de envergadura en
    // un mundo de 100 cm) se dibuja ×1.5 para que se vea de verdad.
    var u = this.S * (this.cfg.light ? 1.5 : 1);
    var bx = this.wx(b.x);
    var by = this.wy(b.y + (b.grounded ? 2 : 0.6));
    var dir = b.vx >= -2 ? 1 : -1;
    var G = H.G_WORLD || 981;
    var Lpx = 7 * u * 0.95; // semienvergadura: 7 cm del mundo

    function wing(th, be, alpha) {
      var tipx = bx + dir * Math.cos(th) * Lpx;
      var tipy = by - Math.sin(th) * Lpx;
      var ch = 2.1 * u * (0.35 + 0.65 * Math.abs(Math.cos(be))); // emplumado visible
      var dx = tipx - bx, dy = tipy - by;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len * ch, ny = dx / len * ch;
      var mx = (bx + tipx) / 2, my = (by + tipy) / 2;
      ctx.fillStyle = 'rgba(89,215,255,' + alpha + ')';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx + nx, my + ny, tipx, tipy);
      ctx.quadraticCurveTo(mx - nx * 0.4, my - ny * 0.4, bx, by);
      ctx.fill();
    }

    wing(-b.th * 0.7, -b.be, 0.3); // ala lejana

    // patas
    ctx.strokeStyle = 'rgba(255,199,89,.8)';
    ctx.lineWidth = Math.max(1, u * 0.18);
    var hipY = by + u * 0.5;
    if (b.grounded || b.y < 3) {
      var ps = [b.pL, b.pR];
      for (var k = 0; k < 2; k++) {
        var hx0 = bx + (k ? dir * u * 0.4 : -dir * u * 0.4);
        ctx.beginPath(); ctx.moveTo(hx0, hipY);
        ctx.lineTo(hx0 + Math.sin(ps[k]) * 2 * u, hipY + Math.cos(ps[k]) * 2 * u);
        ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(bx, hipY);
      ctx.lineTo(bx - dir * u * 0.8, hipY + u * 0.9); ctx.stroke();
    }

    // cuerpo
    ctx.fillStyle = 'rgba(255,91,115,.92)';
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(bx, by, 2.2 * u, 1.15 * u, 0, 0, 6.283);
    else ctx.arc(bx, by, 1.6 * u, 0, 6.283);
    ctx.fill();

    wing(b.th, b.be, 0.8); // ala cercana

    // cabeza, pico, ojo
    var hx = bx + dir * 2.5 * u, hy = by - 0.9 * u;
    ctx.fillStyle = '#ff7d90';
    ctx.beginPath(); ctx.arc(hx, hy, 0.95 * u, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,199,89,.95)';
    ctx.beginPath();
    ctx.moveTo(hx + dir * 0.7 * u, hy - 0.15 * u);
    ctx.lineTo(hx + dir * 1.9 * u, hy + 0.1 * u);
    ctx.lineTo(hx + dir * 0.7 * u, hy + 0.35 * u);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0d18';
    ctx.beginPath(); ctx.arc(hx + dir * 0.3 * u, hy - 0.2 * u, Math.max(1, u * 0.16), 0, 6.283); ctx.fill();

    // halo cuando la sustentación aguanta al ave
    if (!b.grounded && b.lift > G * 0.5) {
      ctx.strokeStyle = 'rgba(255,199,89,' + (0.08 + 0.14 * Math.min(1, b.lift / G)).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(bx, by, 3.6 * u, 2.4 * u, 0, 0, 6.283);
      else ctx.arc(bx, by, 3 * u, 0, 6.283);
      ctx.stroke();
    }

    if (this.rewardFlashT > 0) {
      ctx.strokeStyle = 'rgba(255,199,89,' + (0.25 + 0.5 * this.rewardFlashT).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(bx, by, (5 + 3 * (1 - this.rewardFlashT)) * u, (3.4 + 2 * (1 - this.rewardFlashT)) * u, 0, 0, 6.283);
      else ctx.arc(bx, by, 4.5 * u, 0, 6.283);
      ctx.stroke();
    }
  };

  // ---------- arranque ----------
  H.boot = function () {
    var canvas = document.getElementById('neural');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var hudMsg = document.getElementById('hud-msg');
    try {
      bootInner(canvas, ctx, hudMsg);
    } catch (e) {
      if (hudMsg) hudMsg.textContent = 'error del motor: ' + ((e && e.message) || e);
    }
  };

  function bootInner(canvas, ctx, hudMsg) {
    var cfg = H.cfg;

    var fluidVis = new H.Fluid(cfg.vis, { itersP: cfg.light ? 6 : 10 });
    var fluidEv = new H.Fluid(cfg.ev, { itersP: 5, itersD: 2 });
    var ev = new H.Evolver(fluidVis, fluidEv);
    var renderer = new H.Renderer(canvas, ctx, cfg);
    renderer.resize();
    window.addEventListener('resize', function () { renderer.resize(); });

    // ---- HUD ----
    var fitEl = document.getElementById('hud-fit');
    var errEl = document.getElementById('hud-err');
    var stepsEl = document.getElementById('hud-steps');
    var liftEl = document.getElementById('hud-lift');
    var curveEl = document.getElementById('hud-curve');
    var goalEl = document.getElementById('hud-goal');
    var dotEl = document.querySelector('.lab-dot');
    var stagesEl = document.getElementById('hud-stages');
    var resetBtn = document.getElementById('hud-reset');
    var rewardBtn = document.getElementById('hud-reward');
    var rewardsEl = document.getElementById('hud-rewards');
    var items = stagesEl ? stagesEl.querySelectorAll('li') : [];

    var MSGS = [
      'aprendiendo a caminar: persigue la zanahoria, las patas aún tropiezan',
      'caminar dominado — ahora aprende a saltar y a caer bien',
      'el salto ya sale — a por las alas, contra el viento',
      'las tres etapas dominadas — el ave te sigue a ti'
    ];

    var tWorld = 0, acc = 0, last = 0, running = true;
    var trail = [];

    function reset() {
      ev.reset();
      trail.length = 0;
      tWorld = 0;
      if (hudMsg) hudMsg.textContent = 'cerebro al azar: el ave ni se sostiene…';
    }
    if (resetBtn) resetBtn.addEventListener('click', reset);
    if (rewardBtn) rewardBtn.addEventListener('click', function () {
      ev.reward();
      if (rewardsEl) rewardsEl.textContent = String(ev.rewards);
      ev.rewardFlash = 0.6;
      rewardBtn.classList.remove('pulse');
      void rewardBtn.offsetWidth;
      rewardBtn.classList.add('pulse');
    });

    // ---- objetivo: cursor/dedo, con vuelta a la trayectoria automática ----
    var manual = null, manualUntil = 0, lastP = null;

    function toWorld(e) {
      var r = canvas.getBoundingClientRect();
      return [renderer.toWorldX(e.clientX - r.left), renderer.toWorldY(e.clientY - r.top)];
    }
    function onPointer(e) {
      var w = toWorld(e);
      var x = H.clamp(w[0], 4, 96), y = H.clamp(w[1], 1, 36);
      var nowT = performance.now();
      if (lastP) {
        var dx = x - lastP[0], dy = y - lastP[1];
        if (Math.hypot(dx, dy) > 0.3) {
          // ráfaga REAL en el fluido: el gesto se convierte en viento que el
          // solver advecta y el ave siente en sus alas
          fluidVis.inject(x, y, H.clamp(dx * 300, -4000, 4000), H.clamp(dy * 300, -4000, 4000));
        }
      }
      lastP = [x, y];
      manual = [x, y];
      manualUntil = nowT + 2600;
    }
    canvas.addEventListener('pointerdown', function (e) {
      // captura del puntero: el arrastre sigue llegando aunque el dedo salga
      // del canvas (en móvil, sin captura, el gesto se pierde al borde)
      if (e.pointerId !== undefined && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      }
      onPointer(e);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' && e.buttons === 0 && manual === null) return;
      onPointer(e);
    });

    function target() {
      if (manual && performance.now() < manualUntil) return manual;
      manual = null; lastP = null;
      return H.STAGES[ev.stage].ghost(tWorld);
    }

    var lastHud = 0;
    function updateHud(now, err) {
      if (now - lastHud < 110) return;
      lastHud = now;
      if (fitEl) fitEl.textContent = ev.best.toFixed(2);
      if (errEl) errEl.textContent = isFinite(err) ? err.toFixed(1) : '—';
      if (stepsEl) stepsEl.textContent = ev.evals.toLocaleString('es');
      if (liftEl) liftEl.textContent = (ev.bird.lift / (H.G_WORLD || 981)).toFixed(2) + '·G';
      for (var i = 0; i < items.length; i++) {
        items[i].className = ev.mastered[i] ? 'done' : (i === ev.stage ? 'now' : '');
      }
      if (goalEl) {
        var gy2 = 45 - 45 * H.STAGES[ev.stage].goal;
        goalEl.setAttribute('y1', gy2); goalEl.setAttribute('y2', gy2);
      }
      if (curveEl && ev.history.length > 1) {
        var pts = [];
        for (var j = 0; j < ev.history.length; j++) {
          pts.push((j / (ev.history.length - 1) * 160).toFixed(1) + ',' +
                   (45 - 45 * Math.min(1, ev.history[j])).toFixed(1));
        }
        curveEl.setAttribute('points', pts.join(' '));
      }
      if (hudMsg) {
        hudMsg.textContent = ev.mastered[2] ? MSGS[3] : MSGS[ev.stage];
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else { running = true; last = performance.now(); acc = 0; }
    });

    function frame(now) {
      requestAnimationFrame(frame);
      if (!running) return;
      if (!last) last = now;
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // evolución con presupuesto de tiempo
      var t0 = performance.now(), n = 0;
      ev.improved = false;
      while (performance.now() - t0 < cfg.budgetMs && n < cfg.maxEvals) {
        ev.step(1); n++;
      }

      // física visible a paso fijo
      acc += dt;
      var err = 0, guard = 0;
      while (acc >= H.DT && guard++ < 4) {
        acc -= H.DT;
        tWorld += H.DT;
        if (ev.rewardFlash > 0) ev.rewardFlash -= H.DT;
        err = ev.tickVisible(tWorld, target(), H.windVisible);
        trail.push([ev.bird.x, ev.bird.y + 1]);
        if (trail.length > 48) trail.shift();
      }

      renderer.bg(now);
      renderer.rewardFlashT = ev.rewardFlash || 0;
      renderer.drawWind(fluidVis, dt);
      renderer.drawWorld(ev, target(), now, trail);
      updateHud(now, err);
    }
    requestAnimationFrame(frame);
  }
})();
