// 40-render.js — dibujo: el campo de viento visible, el ave y el fondo.
//
// TRAZADORES: cientos de partículas que se advectan con el campo que resuelve
// Navier–Stokes: el viento deja de ser invisible y se ven las estelas y los
// vórtices que el aleteo deja en el aire. El color de cada traza depende de su
// velocidad.
//
// Con BirdLab (widget exclusivo) NADA flota sobre el canvas: la telemetría
// vive fuera del escenario, así que el suelo usa todo el alto del marco.
//
// Móvil: menos trazadores, sin el fondo de red neuronal (lo más caro de
// dibujar) y escala ×1.8 para el ave.
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
    // el mundo (100×40) cabe entero en el escenario; el suelo queda 8 px por
    // encima del borde inferior para que el ave tenga "suelo" visible
    this.S = Math.min(this.W / 104, this.H2 / 46);
    this.OX = (this.W - 100 * this.S) / 2;
    this.GY = this.H2 - 8;
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

  // drawWorld y drawBird los sobrescribe 50-boot.js con los campos nuevos del
  // ave (th, be, pL, pR) y las unidades del mundo reales.
  H.Renderer = Renderer;
})();
