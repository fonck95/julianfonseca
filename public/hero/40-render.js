// 40-render.js — dibujo: el campo de viento visible, el ave y el HUD.
//
// Lo nuevo: TRAZADORES. Cientos de partículas que se advectan con el campo que
// resuelve Navier–Stokes: el viento deja de ser invisible y se ven las
// estelas y los vórtices que el aleteo deja en el aire. El color de cada
// traza depende de su velocidad.
//
// Móvil: menos trazadores, sin el fondo de campo neuronal (que era lo más
// caro de dibujar) y con el HUD compacto.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  function Renderer(canvas, ctx, cfg) {
    this.canvas = canvas; this.ctx = ctx; this.cfg = cfg;
    this.W = 0; this.H2 = 0; this.S = 1; this.OX = 0; this.GY = 0;
    this.tracers = [];
    for (var i = 0; i < cfg.tracers; i++) this.tracers.push(this.spawn());
    this.nodes = [];
    if (!cfg.light) {
      for (var j = 0; j < 40; j++) {
        this.nodes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, s: 0.15 + Math.random() * 0.4 });
      }
    }
  }

  Renderer.prototype.spawn = function () {
    return {
      x: 2 + Math.random() * (H.WORLD_W - 4),
      y: Math.random() * H.WORLD_H,
      age: 0, max: 40 + Math.random() * 90,
      px: 0, py: 0
    };
  };

  Renderer.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var dpr = this.cfg.dpr;
    this.W = r.width; this.H2 = r.height;
    this.canvas.width = Math.max(1, Math.round(this.W * dpr));
    this.canvas.height = Math.max(1, Math.round(this.H2 * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.S = Math.min(this.W / 104, this.H2 / 46);
    this.OX = (this.W - 100 * this.S) / 2;
    // En móvil el HUD fijo tapa el borde inferior del canvas: sube el suelo
    // por encima de él o el ave (que vive junto al suelo) nunca se ve.
    var hud = document.getElementById('hud');
    var hudH = (this.cfg.light && hud) ? hud.getBoundingClientRect().height : 0;
    this.GY = this.H2 - 7 * this.S - hudH - (hudH ? 16 : 0);
    if (this.GY < this.H2 * 0.5) this.GY = this.H2 * 0.5;
  };

  Renderer.prototype.wx = function (x) { return this.OX + x * this.S; };
  Renderer.prototype.wy = function (y) { return this.GY - y * this.S; };
  Renderer.prototype.toWorldX = function (px) { return (px - this.OX) / this.S; };
  Renderer.prototype.toWorldY = function (py) { return (this.GY - py) / this.S; };

  Renderer.prototype.bg = function (now) {
    var ctx = this.ctx;
    ctx.fillStyle = '#070a14';
    ctx.fillRect(0, 0, this.W, this.H2);
    if (this.cfg.light) return; // en móvil solo el fondo liso: más batería
    var t = now * 0.00004;
    for (var i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i];
      var nx = ((n.x + t * n.s) % 1) * this.W, ny = n.y * this.H2;
      for (var j = i + 1; j < this.nodes.length; j++) {
        var m = this.nodes[j];
        var mx = ((m.x + t * m.s) % 1) * this.W, my = m.y * this.H2;
        var d2 = (nx - mx) * (nx - mx) + (ny - my) * (ny - my);
        if (d2 < 26000) {
          ctx.strokeStyle = 'rgba(89,215,255,' + (0.05 * (1 - d2 / 26000)).toFixed(3) + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(mx, my); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(255,91,115,0.14)';
      ctx.beginPath(); ctx.arc(nx, ny, n.r, 0, Math.PI * 2); ctx.fill();
    }
  };

  // Trazadores: se advectan con el campo y dejan una estela corta.
  Renderer.prototype.drawWind = function (fluid, dt) {
    var ctx = this.ctx, v = [0, 0];
    ctx.lineCap = 'round';
    for (var i = 0; i < this.tracers.length; i++) {
      var p = this.tracers[i];
      fluid.sample(p.x, p.y, v);
      p.px = p.x; p.py = p.y;
      p.x += v[0] * dt; p.y += v[1] * dt;
      p.age++;
      var sp = Math.min(1, Math.hypot(v[0], v[1]) / 12);
      if (p.age > p.max || p.x < 1 || p.x > H.WORLD_W - 1 || p.y < 0.2 || p.y > H.WORLD_H - 1) {
        this.tracers[i] = this.spawn();
        continue;
      }
      var alpha = (0.05 + sp * 0.5) * (1 - p.age / p.max);
      ctx.strokeStyle = 'rgba(' + (89 + sp * 166 | 0) + ',' + (215 - sp * 124 | 0) + ',255,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 0.7 + sp * 1.1;
      ctx.beginPath();
      ctx.moveTo(this.wx(p.px), this.wy(p.py));
      ctx.lineTo(this.wx(p.x), this.wy(p.y));
      ctx.stroke();
    }
  };

  Renderer.prototype.drawWorld = function (ev, tgt, now, trail) {
    var ctx = this.ctx, b = ev.bird;
    // el ave se dibuja con su propia escala: en móvil (light) ×1.8 y nunca
    // por debajo de 9 px, o es una mancha invisible sobre el fondo liso
    var s = Math.max(9, this.S * (this.cfg.light ? 1.8 : 1));
    var st = H.STAGES[ev.stage];

    // suelo
    var ga = ev.stage === 2 ? 0.12 : 0.4;
    ctx.strokeStyle = 'rgba(89,215,255,' + ga + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, this.GY); ctx.lineTo(this.W, this.GY); ctx.stroke();

    // objetivo
    var gx = this.wx(tgt[0]), gy = this.wy(tgt[1]);
    var pulse = 4 + Math.sin(now * 0.006) * 1.5;
    ctx.fillStyle = 'rgba(255,199,89,0.9)';
    ctx.beginPath(); ctx.arc(gx, gy, pulse * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,199,89,0.35)';
    ctx.beginPath(); ctx.arc(gx, gy, pulse * 1.6, 0, Math.PI * 2); ctx.stroke();

    // estela del ave
    if (trail.length > 2) {
      ctx.strokeStyle = 'rgba(255,91,115,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.wx(trail[0][0]), this.wy(trail[0][1]));
      for (var i = 1; i < trail.length; i++) ctx.lineTo(this.wx(trail[i][0]), this.wy(trail[i][1]));
      ctx.stroke();
    }

    var bx = this.wx(b.x), by = this.wy(b.y + 0.55);
    var dir = b.vx >= 0 ? 1 : -1;
    var tilt = Math.max(-0.5, Math.min(0.5, b.vy * 0.04)) * dir;

    // patas
    var hipX = bx - dir * s * 0.15, hipY = by + s * 0.25;
    var legs = [[b.legL, 0.55], [b.legR, -0.35]];
    for (var li = 0; li < 2; li++) {
      var a = legs[li][0], o2 = legs[li][1];
      var kx = hipX + dir * Math.sin(a) * s * 0.5, ky = hipY + s * 0.45;
      var fx = hipX + dir * Math.sin(a) * s * 0.9 + dir * o2 * s * 0.2;
      var fy = Math.min(this.GY, hipY + s * 0.95);
      ctx.strokeStyle = 'rgba(255,160,120,0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }

    // cuerpo + cola + alas + cabeza
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(-tilt);
    ctx.fillStyle = '#ff5b73';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.75, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,91,115,0.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-dir * s * 0.7, 0);
    ctx.quadraticCurveTo(-dir * s * 1.2, -s * 0.1 + Math.sin(now * 0.008) * s * 0.15, -dir * s * 1.5, -s * 0.25);
    ctx.stroke();
    // alas: el ángulo real de aleteo (b.wingL/R) las mueve — lo que siente el
    // aire es exactamente lo que se ve
    var wa = (b.wingL + b.wingR) * 0.5;
    ctx.fillStyle = 'rgba(89,215,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(-dir * s * 0.1, -s * 0.15);
    ctx.quadraticCurveTo(dir * s * 0.1, -s * (0.9 + wa), dir * s * 0.75, -s * (0.5 + wa * 0.8));
    ctx.quadraticCurveTo(dir * s * 0.35, -s * 0.1, -dir * s * 0.1, -s * 0.15);
    ctx.fill();
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
    if (!b.grounded && b.wingLv > 0.5) {
      ctx.fillStyle = 'rgba(255,199,89,0.25)';
      ctx.beginPath(); ctx.arc(hipX, this.GY, 4, 0, Math.PI * 2); ctx.fill();
    }
  };

  H.Renderer = Renderer;
})();
