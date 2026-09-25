// 20-policy.js — el cerebro: un transformer de verdad, pequeño y evolucionable.
//
// Por qué transformer y no el MLP anterior: el MLP recibía un vector plano y
// no podía distinguir «dónde está el objetivo» de «cómo viene el viento».
// Aquí cada fuente es un TOKEN con su propio embedding y su identidad, y la
// atención aprende a mezclarlos:
//
//   t0 objetivo         [dx, dy, dist]
//   t1 cuerpo           [x, y, vx, vy, enSuelo, sin φ, cos φ]
//   t2 viento en alas   [ux, uy, velAlearia, aireRelativo]  ← solo el transformer
//   t3 pata izquierda   [ángulo, velocidad, contacto]         puede usarlo bien
//   t4 pata derecha     [ángulo, velocidad, contacto]
//
// Bloque (post-norm, como «Attention Is All You Need», Vaswani et al. 2017):
//   X = embed(tokens)                          d_model = 12
//   X = LN(X + MHA(X))                         2 cabezas × 6 dims
//   X = LN(X + FFN(X))                         FFN 12→24→12
//   out = tanh(W_o · meanpool(X) + b_o)        4 actuadores
//
// MHA por cabeza:  A = softmax(QKᵀ/√d_k)V
//
// ~1 600 parámetros. Todos se guardan en UN Float64Array plano (el genotipo):
// la neuroevolución muta ese vector, sin backprop — igual que antes, pero con
// una arquitectura que puede aprender a CONDICIONARSE al viento.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var D = 12;        // d_model
  var HEADS = 2;     // cabezas de atención
  var DH = D / HEADS; // 6 dims por cabeza
  var DF = 24;       // ancho del FFN
  var TOK = [3, 7, 4, 3, 3]; // features por token
  var NT = TOK.length;       // 5 tokens
  var NOUT = 4;              // legL, legR, wing, jump

  // ---- layout del genotipo (offsets en el Float64Array plano) ----
  var off = {}, size = 0;
  function seg(name, n) { off[name] = size; size += n; return n; }
  seg('emb0', TOK[0] * D); seg('emb1', TOK[1] * D); seg('emb2', TOK[2] * D);
  seg('emb3', TOK[3] * D); seg('emb4', TOK[4] * D);
  seg('tokE', NT * D);              // identidad del token (type embedding)
  seg('Wq', D * D); seg('Wk', D * D); seg('Wv', D * D); seg('Wo', D * D);
  seg('ln1g', D); seg('ln1b', D);
  seg('Wf1', D * DF); seg('bf1', DF); seg('Wf2', DF * D); seg('bf2', D);
  seg('ln2g', D); seg('ln2b', D);
  seg('Wh', D * NOUT); seg('bh', NOUT);
  var NPARAMS = size; // ≈ 1 590

  function Policy(g) {
    this.g = g || new Float64Array(NPARAMS);
    // buffers reutilizados: cero basura por frame (importante en móvil)
    this.x = new Float64Array(NT * D);
    this.q = new Float64Array(NT * D);
    this.k = new Float64Array(NT * D);
    this.v = new Float64Array(NT * D);
    this.a = new Float64Array(NT * D);
    this.f = new Float64Array(NT * DF);
    this.o = new Float64Array(NOUT);
    this.feat = [new Float64Array(TOK[0]), new Float64Array(TOK[1]),
                 new Float64Array(TOK[2]), new Float64Array(TOK[3]), new Float64Array(TOK[4])];
  }

  Policy.random = function () {
    var g = new Float64Array(NPARAMS);
    for (var i = 0; i < NPARAMS; i++) g[i] = H.gauss() * 0.55;
    // LayerNorm arranca en identidad (γ=1, β=0): si no, el primer forward
    // sale distorsionado y la evolución pierde generaciones recolocándolo.
    var ones = [off.ln1g, off.ln2g];
    for (var k2 = 0; k2 < 2; k2++) for (var i2 = 0; i2 < D; i2++) g[ones[k2] + i2] = 1;
    return new Policy(g);
  };

  Policy.prototype.clone = function () {
    return new Policy(new Float64Array(this.g));
  };

  // Mutación gaussiana: cada parámetro con probabilidad pRate, σ proporcional
  // a su propia escala; con probabilidad resetRate, un parámetro se reinicia.
  Policy.prototype.mutate = function (sigma, pRate, resetRate) {
    var g = this.g;
    for (var i = 0; i < NPARAMS; i++) {
      if (Math.random() < pRate) g[i] += H.gauss() * sigma;
      else if (Math.random() < resetRate) g[i] = H.gauss() * 0.55;
    }
    return this;
  };

  function softmaxRow(buf, base, n) {
    var m = -Infinity, i, s = 0;
    for (i = 0; i < n; i++) { if (buf[base + i] > m) m = buf[base + i]; }
    for (i = 0; i < n; i++) { buf[base + i] = Math.exp(buf[base + i] - m); s += buf[base + i]; }
    s = 1 / (s || 1);
    for (i = 0; i < n; i++) buf[base + i] *= s;
  }

  function layerNorm(dst, src, base, gamma, beta) {
    var mean = 0, i, va = 0;
    for (i = 0; i < D; i++) mean += src[base + i];
    mean /= D;
    for (i = 0; i < D; i++) { var d = src[base + i] - mean; va += d * d; }
    var inv = 1 / Math.sqrt(va / D + 1e-5);
    for (i = 0; i < D; i++) dst[base + i] = gamma[i] * (src[base + i] - mean) * inv + beta[i];
  }

  // Un forward completo. `feats` = array de 5 Float64Array con las features de
  // cada token ya normalizadas. Devuelve this.o (4 salidas en [−1, 1]).
  Policy.prototype.forward = function (feats) {
    var g = this.g, x = this.x, q = this.q, k = this.k, v = this.v, a = this.a;
    var t, i, j, h, d, s;

    // 1) embedding: x[t] = W_t · feat[t] + tokE[t]
    var embs = [off.emb0, off.emb1, off.emb2, off.emb3, off.emb4];
    for (t = 0; t < NT; t++) {
      var f = feats[t], W = g.subarray(embs[t], embs[t] + TOK[t] * D);
      var xb = t * D;
      for (d = 0; d < D; d++) {
        s = g[off.tokE + t * D + d];
        for (i = 0; i < TOK[t]; i++) s += W[i * D + d] * f[i];
        x[xb + d] = s;
      }
    }

    // 2) QKV = x·W (d_model→d_model)
    for (t = 0; t < NT; t++) {
      var xb2 = t * D;
      for (d = 0; d < D; d++) {
        var sq = 0, sk = 0, sv = 0;
        for (i = 0; i < D; i++) {
          var xi = x[xb2 + i];
          sq += xi * g[off.Wq + i * D + d];
          sk += xi * g[off.Wk + i * D + d];
          sv += xi * g[off.Wv + i * D + d];
        }
        q[xb2 + d] = sq; k[xb2 + d] = sk; v[xb2 + d] = sv;
      }
    }

    // 3) atención por cabeza: A = softmax(QKᵀ/√d_k)V
    var scale = 1 / Math.sqrt(DH);
    var scores = this.a; // reutiliza buffer (se reescribe abajo)
    for (h = 0; h < HEADS; h++) {
      var ho = h * DH;
      for (t = 0; t < NT; t++) {
        var sb = t * NT;
        for (j = 0; j < NT; j++) {
          s = 0;
          for (d = 0; d < DH; d++) s += q[t * D + ho + d] * k[j * D + ho + d];
          scores[sb + j] = s * scale;
        }
        softmaxRow(scores, sb, NT);
      }
      for (t = 0; t < NT; t++) {
        for (d = 0; d < DH; d++) {
          s = 0;
          for (j = 0; j < NT; j++) s += scores[t * NT + j] * v[j * D + ho + d];
          // a[] guarda el resultado de la atención (post-proyección abajo)
          a[t * D + ho + d] = s;
        }
      }
    }

    // 4) proyección de salida + residual + LayerNorm (post-norm)
    for (t = 0; t < NT; t++) {
      var xb3 = t * D;
      for (d = 0; d < D; d++) {
        s = 0;
        for (i = 0; i < D; i++) s += a[xb3 + i] * g[off.Wo + i * D + d];
        a[xb3 + d] = x[xb3 + d] + s; // residual
      }
      layerNorm(x, a, xb3, g.subarray(off.ln1g, off.ln1g + D), g.subarray(off.ln1b, off.ln1b + D));
    }

    // 5) FFN por token: ReLU(xW₁+b₁)W₂+b₂ + residual + LayerNorm
    for (t = 0; t < NT; t++) {
      var xb4 = t * D, fb = t * DF;
      for (j = 0; j < DF; j++) {
        s = g[off.bf1 + j];
        for (i = 0; i < D; i++) s += x[xb4 + i] * g[off.Wf1 + i * DF + j];
        this.f[fb + j] = s > 0 ? s : 0;
      }
      for (d = 0; d < D; d++) {
        s = g[off.bf2 + d];
        for (j = 0; j < DF; j++) s += this.f[fb + j] * g[off.Wf2 + j * D + d];
        a[xb4 + d] = x[xb4 + d] + s;
      }
      layerNorm(x, a, xb4, g.subarray(off.ln2g, off.ln2g + D), g.subarray(off.ln2b, off.ln2b + D));
    }

    // 6) mean-pool → cabeza de salida → 4 actuadores en [−1, 1]
    var o = this.o;
    for (d = 0; d < NOUT; d++) {
      s = g[off.bh + d];
      for (i = 0; i < D; i++) {
        var pooled = 0;
        for (t = 0; t < NT; t++) pooled += x[t * D + i];
        s += (pooled / NT) * g[off.Wh + i * NOUT + d];
      }
      o[d] = Math.tanh(s);
    }
    return o;
  };

  H.Policy = Policy;
  H.NPARAMS = NPARAMS;
  H.TOK = TOK;
})();
