// Shader WGSL del hero: campo neuronal de fondo + pájaro dibujado con SDF.
// Uniforms (64 bytes): res@0 time@8 mouse@16 agent@24 goal@32 energy@40
// conv@44 wing@48 legL@52 legR@56 grounded@60
export const WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f, time: f32, mouse: vec2f,
  agent: vec2f, goal: vec2f, energy: f32, conv: f32,
  wing: f32, legL: f32, legR: f32, grounded: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn nodeLayer(uv: vec2f, cells: f32, t: f32, seed: f32) -> vec3f {
  let g = uv * cells;
  let cell = floor(g);
  let f = fract(g);
  var col = vec3f(0.0);
  for (var dy = -1.0; dy <= 1.0; dy = dy + 1.0) {
    for (var dx = -1.0; dx <= 1.0; dx = dx + 1.0) {
      let o = vec2f(dx, dy);
      let id = cell + o;
      let rnd = hash21(id + seed);
      if (rnd < 0.55) { continue; }
      let breathe = sin(t * (0.6 + rnd) + rnd * 20.0) * 0.5 + 0.5;
      let pos = o + vec2f(hash21(id + 7.7 + seed), hash21(id + 3.3 + seed)) * 0.8 + 0.1;
      let d = length(f - pos);
      let glow = (0.012 + 0.01 * breathe) / (d * d + 0.0015);
      let pink = vec3f(1.0, 0.36, 0.45);
      let cyan = vec3f(0.35, 0.84, 1.0);
      let c = mix(cyan, pink, hash21(id * 1.7 + seed));
      col += c * glow * 0.0025 * (0.55 + 0.75 * breathe);
    }
  }
  return col;
}

fn sdSeg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let l2 = max(dot(ab, ab), 1e-8);
  let t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
  return length(p - a - ab * t);
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = frag.xy / u.res;
  let asp = u.res.x / u.res.y;
  var p = vec2f(uv.x * asp, uv.y);
  let t = u.time;
  let m = vec2f(u.mouse.x * asp, u.mouse.y);
  let A = vec2f(u.agent.x * asp, u.agent.y);
  let GO = vec2f(u.goal.x * asp, u.goal.y);
  let e = u.energy;
  let conv = u.conv;

  // fondo: niebla profunda con domain warp lento
  var q = p * 1.6;
  q += 0.25 * vec2f(sin(q.y * 2.1 + t * 0.17), cos(q.x * 1.9 - t * 0.13));
  let fog = 0.5 + 0.5 * sin(q.x * 1.7 + sin(q.y * 2.3 + t * 0.11) * 1.4);
  var col = mix(vec3f(0.024, 0.031, 0.06), vec3f(0.05, 0.07, 0.14), fog * 0.85);

  // capas de nodos a distintas escalas
  col += nodeLayer(p, 6.0, t, 0.0) * 1.0;
  col += nodeLayer(p, 11.0, t * 1.1, 40.0) * 0.55;
  col += nodeLayer(p, 19.0, t * 0.9, 90.0) * 0.3;

  // sinapsis del campo: despiertan cerca del puntero
  let dm = length(p - m);
  let pull = exp(-dm * 3.2);
  let threads = sin(p.x * 42.0 + t * 2.0) * sin(p.y * 42.0 - t * 1.7);
  col += vec3f(1.0, 0.45, 0.55) * smoothstep(0.75, 1.0, threads) * pull * 0.35;
  col += vec3f(0.4, 0.8, 1.0) * pull * 0.12;
  col += vec3f(1.0, 0.42, 0.52) * (0.004 / (dm * dm + 0.02)) * 0.05;

  // suelo sutil: la criatura camina sobre él en las primeras etapas
  let gy0 = A.y - 0.055;
  col += vec3f(0.30, 0.45, 0.66) * exp(-max(p.y - gy0, 0.0) * 30.0) * (1.0 - conv) * 0.05;
  col += vec3f(0.55, 0.72, 0.95) * smoothstep(0.0016, 0.0, abs(p.y - gy0)) * 0.07 * (1.0 - conv);

  // color de aprendizaje: rosa mientras lo intenta, cian cuando domina
  let learnCol = mix(vec3f(1.0, 0.36, 0.45), vec3f(0.35, 0.85, 1.0), conv);

  // halo de esfuerzo alrededor del cuerpo
  let dA = length(p - A);
  let wob = sin(p.x * 60.0 + t * 5.0) * sin(p.y * 55.0 - t * 4.3);
  col += learnCol * exp(-dA / (0.05 + 0.04 * e)) * (0.07 + 0.11 * e) * (1.0 + wob * 0.3 * e);

  // --- el pájaro (SDF, vista lateral) ---
  let f = select(-1.0, 1.0, GO.x >= A.x);
  let wAng = u.wing * 1.25;
  let s = mix(0.45, 1.0, u.grounded);

  // cuerpo: cápsula corta
  let dBody = sdSeg(p, A - vec2f(f * 0.022, 0.0), A + vec2f(f * 0.026, 0.004));
  let bodyM = smoothstep(0.019, 0.012, dBody);
  col += mix(vec3f(0.85, 0.9, 1.0), learnCol, 0.35) * bodyM * (0.55 + 0.35 * e);

  // cabeza + pico
  let head = A + vec2f(f * 0.040, 0.014);
  let dHead = length(p - head);
  col += mix(vec3f(0.92, 0.95, 1.0), learnCol, 0.3) * smoothstep(0.012, 0.007, dHead) * 0.8;
  let beak = sdSeg(p, head + vec2f(f * 0.008, 0.0), head + vec2f(f * 0.020, -0.003));
  col += vec3f(1.0, 0.78, 0.35) * smoothstep(0.0035, 0.0, beak) * 0.85;

  // cola
  let tail = sdSeg(p, A - vec2f(f * 0.024, 0.0), A - vec2f(f * 0.052, 0.010 + sin(t * 1.5) * 0.004));
  col += learnCol * smoothstep(0.008, 0.002, tail) * 0.45;

  // alas: dos segmentos que baten con desfase (la trasera, más tenue)
  let shoulder = A + vec2f(0.0, 0.012);
  let tipF = shoulder + vec2f(-f * 0.048, sin(wAng) * 0.052);
  let dWf = sdSeg(p, shoulder, tipF);
  col += mix(vec3f(1.0, 0.55, 0.62), vec3f(0.55, 0.9, 1.0), conv) * smoothstep(0.011, 0.003, dWf) * (0.5 + 0.4 * e);
  let tipB = shoulder + vec2f(-f * 0.034, sin(wAng + 2.4) * 0.038);
  let dWb = sdSeg(p, shoulder, tipB);
  col += mix(vec3f(0.75, 0.35, 0.42), vec3f(0.3, 0.6, 0.8), conv) * smoothstep(0.008, 0.002, dWb) * 0.3;

  // patas: cadera → pie, recogidas en vuelo
  let hip = A + vec2f(-f * 0.010, -0.014);
  let footL = hip + vec2f(sin(u.legL) * 0.040 * s, -abs(cos(u.legL)) * 0.046 * s);
  let footR = hip + vec2f(sin(u.legR) * 0.040 * s, -abs(cos(u.legR)) * 0.046 * s);
  let dL1 = sdSeg(p, hip, footL);
  let dL2 = sdSeg(p, hip, footR);
  let legCol = vec3f(1.0, 0.78, 0.35);
  col += legCol * smoothstep(0.0032, 0.0, dL1) * 0.7;
  col += legCol * smoothstep(0.0032, 0.0, dL2) * 0.5;
  col += legCol * smoothstep(0.0038, 0.0, length(p - footL)) * 0.7;
  col += legCol * smoothstep(0.0038, 0.0, length(p - footR)) * 0.5;

  // impulso de salto: destello bajo las patas al despegar
  let dJ = length(p - (hip + vec2f(0.0, -0.03)));
  col += legCol * exp(-dJ / 0.02) * 0.5 * u.jump * (1.0 - u.grounded);

  // objetivo: anillo dorado que respira; se cierra al acercarse
  let dgl = length(p - GO);
  let rr = mix(0.05, 0.018, conv) + 0.006 * sin(t * 3.0) * (1.0 - conv);
  col += vec3f(1.0, 0.78, 0.35) * smoothstep(0.004, 0.0, abs(dgl - rr)) * (0.55 - 0.3 * conv);
  let crossG = min(abs(p.x - GO.x), abs(p.y - GO.y));
  let inBox = step(abs(p.x - GO.x) / asp, 0.012) * step(abs(p.y - GO.y), 0.012);
  col += vec3f(1.0, 0.78, 0.35) * smoothstep(0.0025, 0.0, crossG) * inBox * 0.5 * (1.0 - conv);

  // línea de error punteada: se apaga al dominar
  let seg = GO - A;
  let segL = max(length(seg), 1e-4);
  let dir = seg / segL;
  let rel = p - A;
  let proj = clamp(dot(rel, dir), 0.0, segL);
  let perp = length(rel - dir * proj);
  let dash = 0.5 + 0.5 * sin(proj * 90.0 - t * 6.0);
  col += mix(vec3f(1.0, 0.45, 0.5), vec3f(0.35, 0.85, 1.0), conv)
    * smoothstep(0.0035, 0.0, perp) * dash * (0.12 + 0.35 * (1.0 - conv));

  // grano y viñeta
  col += (hash21(uv * u.res + fract(t)) - 0.5) * 0.03;
  col *= 1.0 - 0.45 * length((uv - 0.5) * vec2f(1.15, 1.0));

  return vec4f(col, 1.0);
}
`;
