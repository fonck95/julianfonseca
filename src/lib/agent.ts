// Agente que APRENDE de verdad en el navegador.
//
// Es un MLP mínimo (5 → 8 → 2, activación tanh) entrenado con descenso de
// gradiente estocástico online: cada frame se hace una pasada de forward,
// se compara la salida con la dirección ideal hacia el objetivo y se
// retropropaga el error actualizando los pesos (backprop a mano, sin
// librerías). La red decide la aceleración del punto luminoso del hero, así
// que al principio falla visiblemente — se pasa, oscila, se desvía — y en
// pocos segundos aprende a perseguir el cursor con suavidad.
//
// Entrada  x = [dx, dy, vx, vy, dist]  (normalizados)
// Salida   y = [ax, ay] ∈ (-1, 1)      (aceleración deseada)
// Objetivo t = clamp(3·(objetivo - posición))  (lo que haría un controlador P)
// Pérdida  L = Σ (y - t)²  → dL/dy = 2(y - t), con la derivada de tanh.

const H = 8;         // neuronas ocultas
const IN = 5;
const OUT = 2;
const LR = 0.05;     // tasa de aprendizaje
const HIST = 140;    // puntos de la curva de error

export interface Agent {
  /** posición del agente, 0..1 con origen abajo-izquierda */
  px: number;
  py: number;
  /** velocidad */
  vx: number;
  vy: number;
  /** objetivo actual (cursor real o fantasma autónomo) */
  gx: number;
  gy: number;
  /** distancia agente→objetivo: lo que se ve caer en la gráfica */
  err: number;
  /** MSE del último paso de entrenamiento */
  loss: number;
  /** pasos de backprop aplicados desde que cargó la página */
  trained: number;
  /** cómo de activa está la red ahora (0..1): brillo y reorganización */
  energy: number;
  /** curva de error suavizada, del más viejo al más nuevo */
  history: Float32Array;
  historyLen: number;
  /** estela reciente del agente, para dibujarla */
  trail: Float32Array;
  trailLen: number;
}

let w1: Float32Array, b1: Float32Array, w2: Float32Array, b2: Float32Array;
let dh: Float32Array, dout: Float32Array, hin: Float32Array, h: Float32Array, out: Float32Array;

function seedWeights() {
  const rnd = () => Math.random() * 2 - 1;
  const s1 = Math.sqrt(2 / IN), s2 = Math.sqrt(2 / H);
  w1 = new Float32Array(IN * H); b1 = new Float32Array(H);
  w2 = new Float32Array(H * OUT); b2 = new Float32Array(OUT);
  for (let i = 0; i < w1.length; i++) w1[i] = rnd() * s1;
  for (let i = 0; i < w2.length; i++) w2[i] = rnd() * s2;
  dh = new Float32Array(H); dout = new Float32Array(OUT);
  hin = new Float32Array(H); h = new Float32Array(H); out = new Float32Array(OUT);
}

/** forward: x → out (guarda h y hin para la retropropagación) */
function forward(x: Float32Array) {
  for (let j = 0; j < H; j++) {
    let s = b1[j];
    for (let i = 0; i < IN; i++) s += x[i] * w1[i * H + j];
    hin[j] = s;
    h[j] = Math.tanh(s);
  }
  for (let k = 0; k < OUT; k++) {
    let s = b2[k];
    for (let j = 0; j < H; j++) s += h[j] * w2[j * OUT + k];
    out[k] = Math.tanh(s);
  }
}

/** un paso de SGD: forward + backprop + actualización de pesos. Devuelve la pérdida. */
function step(x: Float32Array, tx: number, ty: number): number {
  forward(x);
  let loss = 0;
  for (let k = 0; k < OUT; k++) {
    const e = out[k] - (k === 0 ? tx : ty);
    loss += e * e;
    dout[k] = e * (1 - out[k] * out[k]);
  }
  for (let j = 0; j < H; j++) {
    let s = 0;
    for (let k = 0; k < OUT; k++) s += dout[k] * w2[j * OUT + k];
    dh[j] = s * (1 - h[j] * h[j]);
  }
  for (let j = 0; j < H; j++)
    for (let k = 0; k < OUT; k++)
      w2[j * OUT + k] -= LR * dout[k] * h[j];
  for (let k = 0; k < OUT; k++) b2[k] -= LR * dout[k];
  for (let i = 0; i < IN; i++)
    for (let j = 0; j < H; j++)
      w1[i * H + j] -= LR * dh[j] * x[i];
  for (let j = 0; j < H; j++) b1[j] -= LR * dh[j];
  return loss;
}

const clamp = (v: number, lo = -1, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

export function createAgent(): Agent {
  seedWeights();
  const a: Agent = {
    px: 0.2 + Math.random() * 0.2,
    py: 0.25 + Math.random() * 0.2,
    vx: 0, vy: 0,
    gx: 0.5, gy: 0.5,
    err: 0, loss: 0, trained: 0, energy: 1,
    history: new Float32Array(HIST),
    historyLen: 0,
    trail: new Float32Array(32),
    trailLen: 0,
  };
  a.history.fill(1);
  return a;
}

/** trayectoria autónoma del objetivo cuando nadie mueve el cursor */
export function ghostTarget(t: number): [number, number] {
  const jump = Math.sin(t * 0.29) > 0.9 ? 0.28 : 0;
  return [
    0.5 + 0.33 * Math.sin(t * 0.61 + 1.3) + jump * Math.sin(t * 9),
    0.5 + 0.3 * Math.sin(t * 0.47 + 2.1) + jump * Math.cos(t * 7.5),
  ];
}

const x = new Float32Array(IN);

/**
 * Avanza un frame: entrena la red contra el objetivo actual y mueve el agente
 * con la aceleración que la red decide.
 */
export function updateAgent(a: Agent, t: number, pointer: { x: number; y: number; active: boolean }) {
  if (pointer.active) {
    a.gx = pointer.x;
    a.gy = pointer.y;
  } else {
    const g = ghostTarget(t);
    a.gx = g[0];
    a.gy = g[1];
  }

  const dx = a.gx - a.px;
  const dy = a.gy - a.py;
  const dist = Math.hypot(dx, dy);

  x[0] = clamp(dx * 2);
  x[1] = clamp(dy * 2);
  x[2] = clamp(a.vx * 4);
  x[3] = clamp(a.vy * 4);
  x[4] = Math.min(dist * 2, 1);

  // el "profesor": lo que haría un controlador proporcional ideal
  const tx = clamp(dx * 3);
  const ty = clamp(dy * 3);

  a.loss = step(x, tx, ty);
  a.trained++;

  // física: la salida de la red es la aceleración; hay fricción para que
  // no se dispare mientras los pesos aún son ruidosos
  a.vx = a.vx * 0.94 + out[0] * 0.0125;
  a.vy = a.vy * 0.94 + out[1] * 0.0125;
  a.px = Math.min(1.05, Math.max(-0.05, a.px + a.vx));
  a.py = Math.min(1.05, Math.max(-0.05, a.py + a.vy));

  a.err = dist;
  // energía = cuánto está corrigiendo todavía: alta al principio, casi nula al converger
  const target = Math.min(1, dist * 3 + a.loss * 2);
  a.energy += (target - a.energy) * 0.08;

  // historial de error (suavizado) para la gráfica
  const prev = a.historyLen ? a.history[(a.historyLen - 1) % HIST] : 1;
  const smooth = prev + (dist - prev) * 0.18;
  a.history[a.historyLen % HIST] = smooth;
  a.historyLen = Math.min(a.historyLen + 1, HIST);

  // estela
  a.trail.copyWithin(2, 0, 30);
  a.trail[0] = a.px;
  a.trail[1] = a.py;
  a.trailLen = Math.min(a.trailLen + 1, 16);
}

/** reinicia los pesos: útil para el botón «reiniciar aprendizaje» */
export function resetAgent(a: Agent) {
  seedWeights();
  a.trained = 0;
  a.historyLen = 0;
  a.history.fill(1);
  a.trailLen = 0;
}
