// 10-fluid.js — el viento: Navier–Stokes incompresible 2D resuelto en rejilla.
//
//   ∂u/∂t + (u·∇)u = −(1/ρ)∇p + ν∇²u + f        (momento)
//   ∇·u = 0                                      (incompresibilidad)
//
// u = velocidad del aire, p = presión cinemática (p/ρ, se absorbe la densidad),
// ν = viscosidad cinemática, f = fuerzas externas: el viento ambiente y la
// reacción que las alas ejercen sobre el aire (tercera ley de Newton).
//
// Discretización: Jos Stam, «Stable Fluids» (SIGGRAPH 1999). Operator splitting
// en cinco pasos por frame:
//   1. viento + fuerzas   u += dt·f ; relajación hacia W(t)
//   2. difusión           (I − ν·dt·∇²)u = u₀   → implícita, Jacobi
//   3. proyección         ∇²p = ∇·u             → Jacobi; u −= ∇p
//   4. advección          semilagrangiana: se traza hacia atrás y se interpola
//   5. proyección         otra vez, para que el campo advectado siga siendo ∇·u = 0
//
// El paso viscoso implícito y la advección semilagragiana son incondicionalmente
// estables: el solver no revienta con una ráfaga fuerte ni con un dt grande.
// Paredes no-deslizantes (las componentes se invierten en el borde).
//
// Las derivadas usan pasos reales (sx, sy) en unidades de mundo, así que las
// celdas no necesitan ser cuadradas: la rejilla del móvil puede ser más basta
// sin que cambie la física.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  function Fluid(grid, opt) {
    opt = opt || {};
    var nx = (this.nx = grid.nx), ny = (this.ny = grid.ny);
    this.itersP = opt.itersP || 8;   // iteraciones de Jacobi en la presión
    this.itersD = opt.itersD || 4;   // iteraciones de Jacobi en la difusión
    // ν en unidades de mundo²/s. Con 1 unidad = 1 cm, ν_aire = 1.5e-5 m²/s
    // = 0.15 unidades²/s: el valor físico del aire a esta escala.
    this.nu = opt.nu === undefined ? 0.15 : opt.nu;
    this.decay = opt.decay === undefined ? 0.3 : opt.decay;
    // Techo de velocidad: el viento ambiente llega a ~340 u/s (3.4 m/s) y las
    // ráfagas del gesto a más. Con el viejo 120 todo se recortaba y el viento
    // no se notaba en las alas.
    this.maxSpeed = opt.maxSpeed || H.FLUID_MAX_SPEED || 400;
    // windK: a qué velocidad se relaja el campo hacia el viento ambiente.
    // Bajo (0.5) para que las estelas del aleteo duren varios frames.
    this.windK = opt.windK === undefined ? 0.5 : opt.windK;

    var n = nx * ny;
    this.u = new Float64Array(n);  this.v = new Float64Array(n);
    this.u0 = new Float64Array(n); this.v0 = new Float64Array(n);
    this.fx = new Float64Array(n); this.fy = new Float64Array(n);
    this.p = new Float64Array(n);  this.div = new Float64Array(n);

    this.sx = H.WORLD_W / (nx - 2);   // ancho de celda (unidades de mundo)
    this.sy = H.WORLD_H / (ny - 2);   // alto de celda
    this.ax = 1 / this.sx; this.ay = 1 / this.sy;
    this.ax2 = this.ax * this.ax; this.ay2 = this.ay * this.ay;
    this.wind = [0, 0];
    this.peak = 0;   // velocidad máxima del frame (para el HUD)
  }

  Fluid.prototype.reset = function () {
    this.u.fill(0); this.v.fill(0); this.u0.fill(0); this.v0.fill(0);
    this.fx.fill(0); this.fy.fill(0); this.p.fill(0); this.div.fill(0);
    this.peak = 0;
  };

  // Paredes no-deslizantes. b=1 → componente x (se invierte en las paredes
  // verticales), b=2 → componente y, b=0 → escalar (presión, divergencia).
  Fluid.prototype.setBnd = function (b, x) {
    var nx = this.nx, ny = this.ny, i, j;
    for (j = 1; j < ny - 1; j++) {
      x[j * nx] = b === 1 ? -x[1 + j * nx] : x[1 + j * nx];
      x[nx - 1 + j * nx] = b === 1 ? -x[nx - 2 + j * nx] : x[nx - 2 + j * nx];
    }
    for (i = 1; i < nx - 1; i++) {
      x[i] = b === 2 ? -x[i + nx] : x[i + nx];
      x[i + (ny - 1) * nx] = b === 2 ? -x[i + (ny - 2) * nx] : x[i + (ny - 2) * nx];
    }
    x[0] = 0.5 * (x[1] + x[nx]);
    x[(ny - 1) * nx] = 0.5 * (x[1 + (ny - 1) * nx] + x[nx * (ny - 2)]);
    x[nx - 1] = 0.5 * (x[nx - 2] + x[nx - 1 + nx]);
    x[nx - 1 + (ny - 1) * nx] = 0.5 * (x[nx - 2 + (ny - 1) * nx] + x[nx - 1 + (ny - 2) * nx]);
  };

  // Jacobi sobre  c·x[i,j] = x0[i,j] + a·(vecinos x) + b·(vecinos y)
  Fluid.prototype.linSolve = function (b, x, x0, a, bb, c, iters) {
    var nx = this.nx, ny = this.ny, i, j, k, idx;
    for (k = 0; k < iters; k++) {
      for (j = 1; j < ny - 1; j++) {
        idx = 1 + j * nx;
        for (i = 1; i < nx - 1; i++, idx++) {
          x[idx] = (x0[idx] + a * (x[idx - 1] + x[idx + 1]) + bb * (x[idx - nx] + x[idx + nx])) / c;
        }
      }
      this.setBnd(b, x);
    }
  };

  // Paso viscoso implícito: (I − ν·dt·∇²)u = u₀
  Fluid.prototype.diffuse = function (b, x, x0, dt) {
    var ta = this.nu * dt * this.ax2, tb = this.nu * dt * this.ay2;
    this.linSolve(b, x, x0, ta, tb, 1 + 2 * (ta + tb), this.itersD);
  };

  // Proyección de presión: resuelve  ∇²p = ∇·u*  y corrige  u = u* − ∇p.
  // Con eso ∇·u = 0 (salvo el error de truncamiento de Jacobi).
  Fluid.prototype.project = function () {
    var nx = this.nx, ny = this.ny, u = this.u, v = this.v, p = this.p, div = this.div;
    var ax = this.ax, ay = this.ay, ax2 = this.ax2, ay2 = this.ay2;
    var i, j, idx;
    for (j = 1; j < ny - 1; j++) {
      idx = 1 + j * nx;
      for (i = 1; i < nx - 1; i++, idx++) {
        // x0 de linSolve es −∇·u* (linSolve resuelve c·x = x0 + a·vecinos):
        div[idx] = -0.5 * (ax * (u[idx + 1] - u[idx - 1]) + ay * (v[idx + nx] - v[idx - nx]));
        p[idx] = 0;
      }
    }
    this.setBnd(0, div); this.setBnd(0, p);
    this.linSolve(0, p, div, ax2, ay2, 2 * (ax2 + ay2), this.itersP);
    // u −= ∇p con derivadas centrales: ∂p/∂x ≈ (p[i+1]−p[i−1])·ax/2
    for (j = 1; j < ny - 1; j++) {
      idx = 1 + j * nx;
      for (i = 1; i < nx - 1; i++, idx++) {
        u[idx] -= 0.5 * ax * (p[idx + 1] - p[idx - 1]);
        v[idx] -= 0.5 * ay * (p[idx + nx] - p[idx - nx]);
      }
    }
    this.setBnd(1, u); this.setBnd(2, v);
  };

  // Advección semilagrangiana: desde cada celda se traza hacia atrás siguiendo
  // el campo y se interpola bilinealmente el valor de allí. Estable para
  // cualquier dt (ese es el resultado central de Stam 1999).
  Fluid.prototype.advect = function (b, d, d0, dt) {
    var nx = this.nx, ny = this.ny, u = this.u, v = this.v;
    var i, j, idx, x, y, i0, i1, j0, j1, s0, s1, t0, t1;
    for (j = 1; j < ny - 1; j++) {
      idx = 1 + j * nx;
      for (i = 1; i < nx - 1; i++, idx++) {
        x = i - dt * u[idx] * this.ax;
        y = j - dt * v[idx] * this.ay;
        if (x < 0.5) x = 0.5; if (x > nx - 1.5) x = nx - 1.5;
        if (y < 0.5) y = 0.5; if (y > ny - 1.5) y = ny - 1.5;
        i0 = x | 0; i1 = i0 + 1; j0 = y | 0; j1 = j0 + 1;
        s1 = x - i0; s0 = 1 - s1; t1 = y - j0; t0 = 1 - t1;
        d[idx] = s0 * (t0 * d0[i0 + j0 * nx] + t1 * d0[i0 + j1 * nx]) +
                 s1 * (t0 * d0[i1 + j0 * nx] + t1 * d0[i1 + j1 * nx]);
      }
    }
    this.setBnd(b, d);
  };

  // El viento ambiente entra como relajación del campo hacia W(t): las ráfagas
  // viven DENTRO del campo resuelto y las alas las sienten igual que a la
  // estela que ellas mismas generan.
  Fluid.prototype.applyWind = function (dt) {
    var u = this.u, v = this.v, w = this.wind, k = 1 - Math.exp(-this.windK * dt);
    var n = this.nx * this.ny, i;
    for (i = 0; i < n; i++) {
      u[i] += (w[0] - u[i]) * k;
      v[i] += (w[1] - v[i]) * k;
    }
  };

  Fluid.prototype.applyForces = function (dt) {
    var u = this.u, v = this.v, fx = this.fx, fy = this.fy, n = u.length, i;
    for (i = 0; i < n; i++) { u[i] += dt * fx[i]; v[i] += dt * fy[i]; fx[i] = 0; fy[i] = 0; }
  };

  Fluid.prototype.clampSpeed = function () {
    var u = this.u, v = this.v, m = this.maxSpeed, m2 = m * m, i, s, peak = 0;
    for (i = 0; i < u.length; i++) {
      s = u[i] * u[i] + v[i] * v[i];
      if (s > peak) peak = s;
      if (s > m2) { s = m / Math.sqrt(s); u[i] *= s; v[i] *= s; }
    }
    this.peak = Math.sqrt(peak);
  };

  Fluid.prototype.step = function (dt) {
    this.applyWind(dt);
    this.applyForces(dt);
    // difusión viscosa ν∇²u
    this.u0.set(this.u); this.v0.set(this.v);
    this.diffuse(1, this.u, this.u0, dt);
    this.diffuse(2, this.v, this.v0, dt);
    this.project();
    // advección (u·∇)u
    this.u0.set(this.u); this.v0.set(this.v);
    this.advect(1, this.u, this.u0, dt);
    this.advect(2, this.v, this.v0, dt);
    this.project();
    // disipación numérica extra: sin ella el campo acumula energía para siempre
    var d = Math.exp(-this.decay * dt), i;
    for (i = 0; i < this.u.length; i++) { this.u[i] *= d; this.v[i] *= d; }
    this.clampSpeed();
  };

  // Velocidad del aire en un punto del mundo (interpolación bilineal).
  Fluid.prototype.sample = function (x, y, out) {
    var gx = x * this.ax + 0.5, gy = y * this.ay + 0.5;
    var nx = this.nx, ny = this.ny;
    var i0 = Math.floor(gx), j0 = Math.floor(gy);
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
    if (i0 > nx - 2) i0 = nx - 2; if (j0 > ny - 2) j0 = ny - 2;
    var s = gx - i0, t = gy - j0, a = i0 + j0 * nx, b = a + nx;
    out = out || [0, 0];
    out[0] = (1 - s) * ((1 - t) * this.u[a] + t * this.u[b]) + s * ((1 - t) * this.u[a + 1] + t * this.u[b + 1]);
    out[1] = (1 - s) * ((1 - t) * this.v[a] + t * this.v[b]) + s * ((1 - t) * this.v[a + 1] + t * this.v[b + 1]);
    return out;
  };

  // Reparte una fuerza puntual en las 4 celdas vecinas con pesos bilineales
  // (spreading tipo immersed-boundary). Los pesos ya suman 1, así que la fuerza
  // total se conserva. fx, fy son ACELERACIONES sobre el aire (unidades/s²).
  Fluid.prototype.inject = function (x, y, fx, fy) {
    var gx = x * this.ax + 0.5, gy = y * this.ay + 0.5;
    var i0 = Math.floor(gx), j0 = Math.floor(gy), s = gx - i0, t = gy - j0;
    if (i0 < 1 || j0 < 1 || i0 > this.nx - 3 || j0 > this.ny - 3) return;
    var nx = this.nx, a = i0 + j0 * nx, b = a + nx;
    var w = [(1 - s) * (1 - t), s * (1 - t), (1 - s) * t, s * t];
    var idx = [a, a + 1, b, b + 1];
    for (var k = 0; k < 4; k++) {
      this.fx[idx[k]] += fx * w[k];
      this.fy[idx[k]] += fy * w[k];
    }
  };

  H.Fluid = Fluid;
})();
