// 50-boot.js — orquesta todo: fluidos, evolución, escena, HUD y bucle.
//
// Dos rejillas de Navier–Stokes: la visible (cara) y la de evolución (barata).
// El bucle gasta un presupuesto de tiempo en evolucionar y deja siempre
// tiempo para el frame: en móvil la evolución va más lenta, pero la animación
// nunca se traba. Si la pestaña se oculta, todo se pausa (battery).
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  H.boot = function () {
    var canvas = document.getElementById('neural');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
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
    var hudMsg = document.getElementById('hud-msg');
    var curveEl = document.getElementById('hud-curve');
    var goalEl = document.getElementById('hud-goal');
    var dotEl = document.getElementById('hud-dot');
    var stagesEl = document.getElementById('hud-stages');
    var resetBtn = document.getElementById('hud-reset');
    var items = stagesEl ? stagesEl.querySelectorAll('li') : [];

    function reset() {
      ev.reset();
      trail.length = 0;
      tWorld = 0;
      if (hudMsg) hudMsg.textContent = 'cerebro al azar: el ave ni se sostiene…';
    }
    if (resetBtn) resetBtn.addEventListener('click', reset);

    var MSGS = [
      'aprendiendo a caminar: las patas aún tropiezan',
      'caminar dominado — ahora aprende a saltar',
      'el salto ya sale — a por las alas, contra el viento'
    ];
    var lastHud = 0;
    function updateHud(now, err) {
      if (now - lastHud < 110) return;
      lastHud = now;
      if (fitEl) fitEl.textContent = ev.best.toFixed(2);
      if (errEl) errEl.textContent = isFinite(err) ? err.toFixed(1) : '—';
      if (stepsEl) stepsEl.textContent = ev.evals.toLocaleString('es');
      if (liftEl) liftEl.textContent = ev.bird.lift.toFixed(1);
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('done', ev.mastered[i] === true && i !== ev.stage);
        items[i].classList.toggle('now', i === ev.stage);
      }
      var st = H.STAGES[ev.stage];
      var done = ev.mastered[0] && ev.mastered[1] && ev.mastered[2];
      if (dotEl) dotEl.classList.toggle('converged', done || ev.best >= st.goal);
      if (hudMsg) hudMsg.textContent = done ? 'dominadas las tres etapas: sigue tu dedo o cursor, contra el viento' : MSGS[ev.stage];
      if (curveEl) {
        var pts = [];
        for (var k = 0; k < ev.history.length; k++) {
          var x = (k / Math.max(1, ev.history.length - 1)) * 160;
          var y = 45 - Math.min(1, ev.history[k]) * 35;
          pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        curveEl.setAttribute('points', pts.join(' '));
      }
      if (goalEl) { goalEl.setAttribute('y1', String(45 - st.goal * 35)); goalEl.setAttribute('y2', String(45 - st.goal * 35)); }
    }

    // ---- objetivo: cursor, dedo o fantasma ----
    var mouse = null, lastMouse = -1e9;
    function onPointer(e) {
      var r = canvas.getBoundingClientRect();
      var x = renderer.toWorldX(e.clientX - r.left);
      var y = renderer.toWorldY(e.clientY - r.top);
      mouse = { x: H.clamp(x, 2, 98), y: H.clamp(y, 0, 38) };
      lastMouse = performance.now();
      // el dedo/cursor también remueve el aire: una ráfaga real en el campo
      fluidVis.inject(mouse.x, mouse.y, (e.movementX || 0) * 3, -(e.movementY || 0) * 3);
    }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (e.touches.length) onPointer({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, movementX: 0, movementY: 0 });
    }, { passive: true });

    var tWorld = 0;
    function target(now) {
      if (mouse && now - lastMouse < 3500) return [mouse.x, mouse.y];
      return H.STAGES[ev.stage].ghost(tWorld);
    }

    // ---- bucle ----
    var trail = [];
    var acc = 0, last = performance.now(), running = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else { running = true; last = performance.now(); acc = 0; }
    });

    function frame(now) {
      requestAnimationFrame(frame);
      if (!running) return;
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // evolución con presupuesto de tiempo
      var t0 = performance.now(), n = 0;
      while (performance.now() - t0 < cfg.budgetMs && n < cfg.maxEvals) {
        ev.step(1); n++;
      }

      // física visible a paso fijo
      acc += dt;
      var err = 0;
      var guard = 0;
      while (acc >= H.DT && guard++ < 4) {
        acc -= H.DT;
        tWorld += H.DT;
        var tgt = target(now);
        err = ev.tickVisible(tWorld, tgt, H.windVisible);
        trail.push([ev.bird.x, ev.bird.y + 0.55]);
        if (trail.length > 48) trail.shift();
      }

      renderer.bg(now);
      renderer.drawWind(fluidVis, dt);
      var tgt2 = target(now);
      renderer.drawWorld(ev, tgt2, now, trail);
      updateHud(now, err);
    }
    requestAnimationFrame(frame);
  };
})();
