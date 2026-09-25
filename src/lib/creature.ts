// Criatura que evoluciona: primero caminar, luego saltar, luego volar.
//
// Física 2D mínima (cuerpo, dos patas, dos alas) y un MLP 8→10→4 (tanh) que
// decide cada articulación. El cerebro se entrena por neuroevolución: se muta
// el campeón de la etapa, se simula la variante contra una trayectoria
// fantasma y se conserva la que mejor la sigue. Al dominar una etapa (aptitud
// meta + tiempo mínimo para que se vea progresar), el mismo cerebro pasa a la
// siguiente — no se reinicia: lo aprendido caminando es la base de lo que
// vendrá. Todo corre en la CPU del navegador.

export const DT = 1 / 60;
export const WORLD = { w: 100, h: 40 };
const G = 9.8 * 2.2;
const LEG = 1.0;

// ---------------------------------------------------------------------------
// Red neuronal mínima
// ---------------------------------------------------------------------------
export interface Net { W1: number[][]; W2: number[][]; }

const rnd = () => Math.random() * 2 - 1;

export function createNet(): Net {
  const W1: number[][] = [];
  for (let i = 0; i < 10; i++) W1.push(Array.from({ length: 8 }, () => rnd() * 0.9));
  const W2: number[][] = [];
  for (let i = 0; i < 4; i++) W2.push(Array.from({ length: 10 }, () => rnd() * 0.9));
  return { W1, W2 };
}

function cloneNet(n: Net): Net {
  return { W1: n.W1.map((r) => r.slice()), W2: n.W2.map((r) => r.slice()) };
}

function mutateNet(n: Net, mag: number): Net {
  for (const r of n.W1)
    for (let i = 0; i < r.length; i++) {
      if (Math.random() < 0.25) r[i] += rnd() * mag;
      if (Math.random() < 0.05) r[i] = rnd() * 0.9;
    }
  for (const r of n.W2)
    for (let i = 0; i < r.length; i++) {
      if (Math.random() < 0.25) r[i] += rnd() * mag;
      if (Math.random() < 0.05) r[i] = rnd() * 0.9;
    }
  return n;
}

function forward(n: Net, inp: number[]): number[] {
  const h = n.W1.map((r) => Math.tanh(r.reduce((a, w, i) => a + w * inp[i], 0)));
  return n.W2.map((r) => Math.tanh(r.reduce((a, w, i) => a + w * h[i], 0)));
}

// ---------------------------------------------------------------------------
// Cuerpo: física del pájaro
// ---------------------------------------------------------------------------
export interface Body {
  x: number; vx: number; y: number; vy: number; ph: number;
  legL: number; legR: number; wing: number; jump: number;
  grounded: boolean;
}

function makeBody(x = 50): Body {
  return { x, vx: 0, y: 0, vy: 0, ph: 0, legL: 0, legR: 0, wing: 0, jump: 0, grounded: true };
}

function stepBody(b: Body, net: Net, tx: number, ty: number): number {
  const inp = [
    (tx - b.x) / 25, (ty - b.y) / 25,
    b.vx / 10, b.vy / 10, b.y / 30,
    Math.sin(b.ph), Math.cos(b.ph),
    b.grounded ? 1 : 0,
  ];
  const [lL, lR, w, j] = forward(net, inp);

  b.grounded = b.y <= 0.02;
  if (b.grounded && j > 0.7) { b.vy += 6.5 * j; b.y = 0.03; b.grounded = false; }

  // patas: solo empujan si el pie toca el suelo
  if (b.y < LEG * Math.cos(lL) + 0.05) b.vx += -(lL - b.legL) * 0.9 * 60 * DT * 2.2;
  if (b.y < LEG * Math.cos(lR) + 0.05) b.vx += -(lR - b.legR) * 0.9 * 60 * DT * 2.2;
  b.legL = lL; b.legR = lR;

  // alas: el aleteo hacia abajo genera sustentación y algo de empuje
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

// ---------------------------------------------------------------------------
// Etapas del currículo: caminar → saltar → volar
//
// `goal` es la aptitud necesaria para pasar (fracción de tiempo pegado al
// fantasma) y `minEvals` el número mínimo de simulaciones antes de poder
// ascender: sin ese suelo la primera variante con suerte «gana» la etapa en
// medio segundo y el visitante no ve aprender nada.
// ---------------------------------------------------------------------------
export interface Stage {
  id: string; label: string;
  ghost: (t: number) => [number, number];
  goal: number; minEvals: number;
}

export const STAGES: Stage[] = [
  { id: 'walk', label: 'caminar', ghost: (t) => [50 + 22 * Math.sin(t * 0.25), 0], goal: 0.92, minEvals: 1300 },
  { id: 'hop', label: 'saltar', ghost: (t) => [50 + 18 * Math.sin(t * 0.3), Math.abs(Math.sin(t * 1.1)) * 8], goal: 0.78, minEvals: 1300 },
  { id: 'fly', label: 'volar', ghost: (t) => [50 + 30 * Math.sin(t * 0.45), 20 + 14 * Math.sin(t * 0.8 + 1)], goal: 0.45, minEvals: 1300 },
];

export function evaluate(net: Net, ghost: (t: number) => [number, number], secs: number): number {
  const b = makeBody(50);
  const n = Math.round(secs / DT);
  let fit = 0;
  for (let s = 0; s < n; s++) {
    const [tx, ty] = ghost(s * DT);
    fit += Math.exp(-stepBody(b, net, tx, ty) / 8);
  }
  return fit / n;
}

// ---------------------------------------------------------------------------
// Evolucionador: colina ascendiente con mutaciones, por etapas
// ---------------------------------------------------------------------------
export interface Evolver {
  champ: Net; stage: number; stageEvals: number; inGen: number;
  best: number; evals: number; history: number[]; mastered: boolean[];
}

const POP = 8;

export function createEvolver(): Evolver {
  const champ = createNet();
  return {
    champ, stage: 0, stageEvals: 0, inGen: 0,
    best: evaluate(champ, STAGES[0].ghost, 4),
    evals: 0, history: [], mastered: [false, false, false],
  };
}

export function evolveStep(ev: Evolver, budget = 1): void {
  for (let i = 0; i < budget; i++) {
    const st = STAGES[ev.stage];
    const cand = mutateNet(cloneNet(ev.champ), 0.45 - 0.3 * (ev.inGen / POP));
    const f = evaluate(cand, st.ghost, 5);
    ev.evals++;
    ev.stageEvals++;
    ev.inGen++;
    if (f > ev.best) { ev.best = f; ev.champ = cand; }
    if (ev.inGen >= POP) {
      ev.inGen = 0;
      ev.history.push(ev.best);
      if (ev.history.length > 150) ev.history.shift();
    }
  }
  const st = STAGES[ev.stage];
  if (ev.best >= st.goal && ev.stageEvals >= st.minEvals && !ev.mastered[ev.stage]) {
    ev.mastered[ev.stage] = true;
    if (ev.stage < STAGES.length - 1) {
      ev.stage++;
      ev.stageEvals = 0;
      ev.inGen = 0;
      ev.best = evaluate(ev.champ, STAGES[ev.stage].ghost, 4);
    }
  }
}

export function stageTarget(ev: Evolver, t: number): [number, number] {
  return STAGES[ev.stage].ghost(t);
}

// ---------------------------------------------------------------------------
// Criatura visible: mismo cuerpo, corre con el cerebro campeón actual
// ---------------------------------------------------------------------------
export interface Pose {
  legL: number; legR: number; wing: number; jump: number;
  grounded: boolean; vx: number; vy: number;
}

export interface Creature {
  body: Body; pose: Pose; trail: Float32Array; trailLen: number;
}

export function createCreature(): Creature {
  return {
    body: makeBody(50),
    pose: { legL: 0, legR: 0, wing: 0, jump: 0, grounded: true, vx: 0, vy: 0 },
    trail: new Float32Array(96),
    trailLen: 0,
  };
}

export function stepCreature(c: Creature, net: Net, tx: number, ty: number): number {
  const d = stepBody(c.body, net, tx, ty);
  const b = c.body;
  c.pose = { legL: b.legL, legR: b.legR, wing: b.wing, jump: b.jump, grounded: b.grounded, vx: b.vx, vy: b.vy };
  if (c.trailLen < 48) {
    c.trail[c.trailLen * 2] = b.x;
    c.trail[c.trailLen * 2 + 1] = b.y;
    c.trailLen++;
  } else {
    c.trail.copyWithin(0, 2);
    c.trail[94] = b.x;
    c.trail[95] = b.y;
  }
  return d;
}

export function resetCreature(c: Creature): void {
  c.body = makeBody(50);
  c.trailLen = 0;
}
