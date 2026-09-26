// 20-policy.js — cerebro transformer: 12 salidas que pilotan un CPG.
//
// TOKENS (5):
//   t0 objetivo       [dx, dy, dist]
//   t1 cuerpo         [x, y, vx, vy, enSuelo, sinφ, cosφ, sinφL, cosφL]
//   t2 viento en alas [ux, uy, |u_rel|, velocidad de punta]  ← solo el transformer
//   t3 pata izquierda [ángulo, velocidad, sinφL, contacto]
//   t4 pata derecha   [ángulo, velocidad, cosφL, contacto]
//
// SALIDAS (12 en [−1,1]):
//   o[0] legL       comando de pata izquierda
//   o[1] legR       comando de pata derecha
//   o[2] jump       impulso de salto (solo en tierra)
//   o[3] cpgFreq    frecuencia del CPG de patas
//   o[4] cpgAmp     amplitud del CPG de patas
//   o[5] cpgAsym    asimetría del CPG de patas
//   o[6] wingFreq   frecuencia del CPG de alas
//   o[7] wingAmp    amplitud de batido
//   o[8] wingAsym   asimetría de carrera
//   o[9] pitchAmp   amplitud de emplumado
//   o[10] pitchPh   fase de emplumado
//   o[11] lean      inclinación de empuje
//
// El CPG vive en 30-creature.js: la política no da el ángulo del ala paso a
// paso sino los PARÁMETROS del oscilador que lo genera. Así la evolución busca
// en un espacio continuo de 12D en vez de una secuencia temporal de 60 pasos.
//
// Bloque transformer (post-norm, Vaswani et al. 2017): d_model=16, 2 cabezas
// de 8 dims, FFN 16→32→16. ~1900 parámetros en UN Float64Array plano (el
// genotipo): la neuroevolución muta ese vector, sin backprop.
(function () {
  'use strict';
  var H = (window.__HERO__ = window.__HERO__ || {});

  var D = 16;
  var HEADS = 2;
  var DH = D / HEADS; // 8
  var DF = 32;
  var TOK = [3, 9, 4, 4, 4];
  var NT = TOK.length;
  var NOUT = 12;

  var off = {}, size = 0;
  function seg(name, n) { off[name] = size; size += n; return n; }
  seg('emb0', TOK[0] * D); seg('emb1', TOK[1] * D); seg('emb2', TOK[2] * D);
  seg('emb3', TOK[3] * D); seg('emb4', TOK[4] * D);
  seg('tokE', NT * D);
  seg('Wq', D * D); seg('Wk', D * D); seg('Wv', D * D); seg('Wo', D * D);
  seg('ln1g', D); seg('ln1b', D);
  seg('Wf1', D * DF); seg('bf1', DF); seg('Wf2', DF * D); seg('bf2', D);
  seg('ln2g', D); seg('ln2b', D);
  seg('Wh', D * NOUT); seg('bh', NOUT);
  var NPARAMS = size;

  function Policy(g) {
    this.g = g || new Float64Array(NPARAMS);
    this.x = new Float64Array(NT * D);
    this.a = new Float64Array(NT * D);
    this.q = new Float64Array(NT * D);
    this.k = new Float64Array(NT * D);
    this.v = new Float64Array(NT * D);
    this.att = new Float64Array(NT * D);
    this.f = new Float64Array(NT * DF);
    this.o = new Float64Array(NOUT);
    this.feat = [new Float64Array(TOK[0]), new Float64Array(TOK[1]),
                 new Float64Array(TOK[2]), new Float64Array(TOK[3]),
                 new Float64Array(TOK[4])];
  }

  Policy.random = function () {
    var g = new Float64Array(NPARAMS);
    var scale = 1 / Math.sqrt(D);
    for (var i = 0; i < NPARAMS; i++) g[i] = H.gauss() * scale;
    for (var d = 0; d < D; d++) { g[off.ln1g + d] = 1; g[off.ln2g + d] = 1; }
    return new Policy(g);
  };

  Policy.prototype.clone = function () {
    return new Policy(new Float64Array(this.g));
  };

  Policy.prototype.mutate = function (sigma, rate) {
    var g = this.g, n = g.length;
    for (var i = 0; i < n; i++) {
      if (Math.random() < rate) g[i] += H.gauss() * sigma;
    }
    return this;
  };

  function layerNorm(dst, src, offset, gain, bias) {
    var mean = 0, i;
    for (i = 0; i < D; i++) mean += src[offset + i];
    mean /= D;
    var varSum = 0;
    for (i = 0; i < D; i++) { var d = src[offset + i] - mean; varSum += d * d; }
    var inv = 1 / Math.sqrt(varSum / D + 1e-5);
    for (i = 0; i < D; i++) dst[offset + i] = (src[offset + i] - mean) * inv * gain[i] + bias[i];
  }

  Policy.prototype.forward = function (feats) {
    var g = this.g, x = this.x, a = this.a;
    var q = this.q, k = this.k, v = this.v, att = this.att;
    var i, j, t, d, h, s, t2;

    // 1) embed tokens (+ identidad del token)
    for (t = 0; t < NT; t++) {
      var ft = feats[t], nf = TOK[t], xb = t * D;
      for (d = 0; d < D; d++) {
        s = g[off.tokE + t * D + d];
        for (i = 0; i < nf; i++) s += ft[i] * g[off['emb' + t] + i * D + d];
        x[xb + d] = s;
      }
    }

    // 2) MHA: A = softmax(QKᵀ/√d_k)V, 2 cabezas × 8 dims
    for (t = 0; t < NT; t++) {
      var xb2 = t * D;
      for (d = 0; d < D; d++) {
        s = 0; for (i = 0; i < D; i++) s += x[xb2 + i] * g[off.Wq + i * D + d]; q[xb2 + d] = s;
        s = 0; for (i = 0; i < D; i++) s += x[xb2 + i] * g[off.Wk + i * D + d]; k[xb2 + d] = s;
        s = 0; for (i = 0; i < D; i++) s += x[xb2 + i] * g[off.Wv + i * D + d]; v[xb2 + d] = s;
      }
    }
    var scale = 1 / Math.sqrt(DH);
    for (h = 0; h < HEADS; h++) {
      var hb = h * DH;
      for (t = 0; t < NT; t++) {
        var xb3 = t * D;
        var maxS = -1e9;
        var sc = [];
        for (t2 = 0; t2 < NT; t2++) {
          s = 0;
          for (d = 0; d < DH; d++) s += q[t * D + hb + d] * k[t2 * D + hb + d];
          s *= scale; sc.push(s); if (s > maxS) maxS = s;
        }
        var sumE = 0;
        for (t2 = 0; t2 < NT; t2++) { sc[t2] = Math.exp(sc[t2] - maxS); sumE += sc[t2]; }
        for (d = 0; d < DH; d++) {
          s = 0;
          for (t2 = 0; t2 < NT; t2++) s += (sc[t2] / sumE) * v[t2 * D + hb + d];
          att[t * D + hb + d] = s;
        }
      }
    }
    // Wo + residual + LayerNorm
    for (t = 0; t < NT; t++) {
      var xb3b = t * D;
      for (d = 0; d < D; d++) {
        s = 0; for (i = 0; i < D; i++) s += att[xb3b + i] * g[off.Wo + i * D + d];
        a[xb3b + d] = x[xb3b + d] + s;
      }
      layerNorm(x, a, xb3b, g.subarray(off.ln1g, off.ln1g + D), g.subarray(off.ln1b, off.ln1b + D));
    }

    // 3) FFN por token: ReLU(xW₁+b₁)W₂+b₂ + residual + LayerNorm
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

    // 4) mean-pool → cabeza de salida → 12 actuadores en [−1, 1]
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
