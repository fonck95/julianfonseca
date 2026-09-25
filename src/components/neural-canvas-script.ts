// Bucle del hero: entrena el cerebro por evolución (CPU) y pinta la criatura (GPU).
import { WGSL } from '../lib/shader';
import {
  createEvolver, evolveStep, stageTarget, STAGES,
  createCreature, stepCreature, resetCreature, WORLD,
} from '../lib/creature';

// ---------------------------------------------------------------------------
// HUD compartido por ambos renderizadores
// ---------------------------------------------------------------------------
interface HudView {
  stage: number; mastered: boolean[]; best: number; err: number;
  evals: number; history: number[];
}

function bootHud(reset: () => void) {
  const fitEl = document.getElementById('hud-fit');
  const errEl = document.getElementById('hud-err');
  const stepsEl = document.getElementById('hud-steps');
  const msgEl = document.getElementById('hud-msg');
  const curveEl = document.getElementById('hud-curve');
  const goalEl = document.getElementById('hud-goal');
  const dotEl = document.getElementById('hud-dot');
  const stagesEl = document.getElementById('hud-stages');
  const resetBtn = document.getElementById('hud-reset');
  if (!fitEl || !errEl || !stepsEl || !msgEl || !curveEl || !dotEl || !stagesEl || !goalEl) return () => {};
  resetBtn?.addEventListener('click', () => reset());

  const items = stagesEl.querySelectorAll('li');
  let last = 0;
  return (v: HudView) => {
    const now = performance.now();
    if (now - last < 90) return; // ~11 Hz: legible y barato
    last = now;
    fitEl.textContent = v.best.toFixed(2);
    errEl.textContent = v.err.toFixed(1);
    stepsEl.textContent = v.evals.toLocaleString('es');

    items.forEach((li, i) => {
      li.classList.toggle('done', v.mastered[i] === true && i !== v.stage);
      li.classList.toggle('now', i === v.stage);
    });
    const st = STAGES[v.stage];
    const done = v.mastered.every(Boolean);
    dotEl.classList.toggle('converged', done || v.best >= st.goal);
    msgEl.textContent = done
      ? 'dominadas las tres etapas: sigue al cursor caminando, saltando o volando según lo que pida'
      : v.best < st.goal * 0.35
        ? `aprendiendo a ${st.label}: probando variantes, todavía tropieza`
        : v.best < st.goal
          ? `aprendiendo a ${st.label}: la aptitud sube, ya se sostiene`
          : `domina ${st.label} · pasando a la siguiente etapa`;

    // línea de meta de la etapa actual
    const gy = 45 - Math.min(st.goal, 1) * 43;
    goalEl.setAttribute('y1', gy.toFixed(1));
    goalEl.setAttribute('y2', gy.toFixed(1));

    const n = Math.min(v.history.length, 140);
    if (n > 1) {
      const start = v.history.length - n;
      let pts = '';
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 160;
        const y = 45 - Math.min(v.history[start + i] ?? 0, 1) * 43;
        pts += `${x.toFixed(1)},${y.toFixed(1)} `;
      }
      curveEl.setAttribute('points', pts.trim());
    }
  };
}

// ---------------------------------------------------------------------------
// Mundo compartido
// ---------------------------------------------------------------------------
function boot(canvas: HTMLCanvasElement) {
  const evolver = createEvolver();
  const creature = createCreature();
  const pointer = { x: 0.5, y: 0.5, active: false };
  let idleSince = performance.now();
  const smooth = { mx: 0.5, my: 0.5 };
  let err = 0;
  // Ritmo de aprendizaje: 2 simulaciones de 5 s por frame (~120/s). Así cada
  // etapa se ve madurar en varios segundos — caminar, luego saltar, luego
  // volar — en vez de resolverse en un parpadeo.
  const BUDGET = 2;

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width;
    pointer.y = 1 - (e.clientY - r.top) / r.height;
    pointer.active = true;
    idleSince = performance.now();
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) idleSince = performance.now();
  });

  const reset = () => {
    Object.assign(evolver, createEvolver());
    resetCreature(creature);
  };
  const hud = bootHud(reset);

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };

  // de mundo (0..100 x, 0..40 y) a coordenadas del canvas (0..1, y hacia arriba)
  const toScreen = (wx: number, wy: number): [number, number] => [
    wx / WORLD.w,
    0.16 + (wy / WORLD.h) * 0.62,
  ];
  const toWorld = (sx: number, sy: number): [number, number] => [
    sx * WORLD.w,
    Math.max(0, ((sy - 0.16) / 0.62) * WORLD.h),
  ];

  const tick = (t: number) => {
    if (pointer.active && performance.now() - idleSince > 4000) pointer.active = false;

    // 1) entrenar (CPU): unas cuantas variantes del campeón por frame
    evolveStep(evolver, BUDGET);

    // 2) objetivo de la criatura visible: el cursor si lo hay; si no, el fantasma
    const ghost = stageTarget(evolver, t);
    const [tx, ty] = pointer.active ? toWorld(pointer.x, pointer.y) : ghost;

    // 3) animar la criatura con el cerebro campeón
    err = stepCreature(creature, evolver.champ, tx, ty);

    // 4) el puntero «suave» es solo para el campo de fondo
    const gx = pointer.active ? pointer.x : ghost[0] / WORLD.w;
    const gy = pointer.active ? pointer.y : 0.16 + (ghost[1] / WORLD.h) * 0.62;
    smooth.mx += (gx - smooth.mx) * 0.06;
    smooth.my += (gy - smooth.my) * 0.06;

    hud({
      stage: evolver.stage, mastered: evolver.mastered, best: evolver.best,
      err, evals: evolver.evals, history: evolver.history,
    });
  };

  const pose = () => creature.pose;
  const screenAgent = (): [number, number] => toScreen(creature.body.x, creature.body.y);
  const screenGoal = (): [number, number] => {
    if (pointer.active) return [pointer.x, pointer.y];
    const [tx, ty] = stageTarget(evolver, performance.now() / 1000);
    return toScreen(tx, ty);
  };

  async function initWebGPU(): Promise<boolean> {
    if (!('gpu' in navigator)) return false;
    try {
      const nav = navigator as any;
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) return false;
      const device = await adapter.requestDevice();
      const ctx = canvas.getContext('webgpu') as any;
      if (!ctx) return false;
      const format = nav.gpu.getPreferredCanvasFormat();
      fit();
      ctx.configure({ device, format, alphaMode: 'opaque' });

      const module = device.createShaderModule({ code: WGSL });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module },
        fragment: { module, targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });

      // 64 bytes: res(8) time(4) mouse(8) agent(8) goal(8) energy(4) conv(4)
      //           wing(4) legL(4) legR(4) grounded(4)
      const buf = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: buf } }],
      });

      const data = new ArrayBuffer(64);
      const f32 = new Float32Array(data);
      const start = performance.now();
      window.addEventListener('resize', fit, { passive: true });

      const frame = () => {
        const t = (performance.now() - start) / 1000;
        tick(t);
        const [ax, ay] = screenAgent();
        const [gxp, gyp] = screenGoal();
        const st = STAGES[evolver.stage];
        const asp = canvas.width / Math.max(1, canvas.height);
        f32[0] = canvas.width; f32[1] = canvas.height;
        f32[2] = t;
        f32[4] = smooth.mx; f32[5] = smooth.my;
        f32[6] = ax * asp; f32[7] = ay;
        f32[8] = gxp * asp; f32[9] = gyp;
        f32[10] = Math.min(1, Math.max(0, 1 - evolver.best / st.goal));
        f32[11] = Math.min(1, evolver.best / st.goal);
        const p = pose();
        f32[12] = p.wing; f32[13] = p.legL; f32[14] = p.legR;
        f32[15] = p.grounded ? 1 : 0;
        device.queue.writeBuffer(buf, 0, data);

        const enc = device.createCommandEncoder();
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0.02, g: 0.03, b: 0.06, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bind);
        pass.draw(3);
        pass.end();
        device.queue.submit([enc.finish()]);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      return true;
    } catch {
      return false;
    }
  }

  // Fallback 2D: misma criatura, misma evolución, dibujada con Canvas2D
  function initFallback() {
    fit();
    const c2 = canvas.getContext('2d');
    if (!c2) return;
    window.addEventListener('resize', fit, { passive: true });
    const N = 46;
    const nodes: { x: number; y: number; vx: number; vy: number; hue: number }[] = [];
    for (let i = 0; i < N; i++) {
      nodes.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006,
        hue: Math.random() < 0.5 ? 351 : 197,
      });
    }
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      tick(t);
      const W = canvas.width, H = canvas.height;
      const U = Math.min(W, H);
      c2.fillStyle = '#06080f';
      c2.fillRect(0, 0, W, H);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 0.16) {
            c2.strokeStyle = `hsla(${a.hue}, 90%, 65%, ${(0.16 - d) * 1.4})`;
            c2.lineWidth = 1;
            c2.beginPath();
            c2.moveTo(a.x * W, a.y * H);
            c2.lineTo(b.x * W, b.y * H);
            c2.stroke();
          }
        }
      }
      for (const n of nodes) {
        c2.fillStyle = `hsla(${n.hue}, 90%, 68%, 0.85)`;
        c2.beginPath(); c2.arc(n.x * W, n.y * H, 1.8, 0, Math.PI * 2); c2.fill();
      }

      // suelo en etapas terrestres
      const st = STAGES[evolver.stage];
      const conv = Math.min(1, evolver.best / st.goal);
      if (conv < 1) {
        const gyPix = (1 - 0.16) * H;
        c2.strokeStyle = `rgba(120, 160, 220, ${0.1 * (1 - conv)})`;
        c2.lineWidth = 1;
        c2.beginPath(); c2.moveTo(0, gyPix); c2.lineTo(W, gyPix); c2.stroke();
      }

      const [ax0, ay0] = screenAgent();
      const ax = ax0 * W, ay = (1 - ay0) * H;
      const [gx0, gy0] = screenGoal();
      const gx = gx0 * W, gy = (1 - gy0) * H;
      const p = pose();
      const S = U * 0.09 * (p.grounded ? 1 : 0.62);

      // estela
      for (let i = 1; i < creature.trailLen; i++) {
        const x0 = (creature.trail[(i - 1) * 2] / WORLD.w) * W;
        const y0 = (1 - (0.16 + (creature.trail[(i - 1) * 2 + 1] / WORLD.h) * 0.62)) * H;
        const x1 = (creature.trail[i * 2] / WORLD.w) * W;
        const y1 = (1 - (0.16 + (creature.trail[i * 2 + 1] / WORLD.h) * 0.62)) * H;
        c2.strokeStyle = `hsla(${351 - 154 * conv}, 92%, 66%, ${0.22 * (1 - i / creature.trailLen)})`;
        c2.lineWidth = 2;
        c2.beginPath(); c2.moveTo(x0, y0); c2.lineTo(x1, y1); c2.stroke();
      }

      // línea de error punteada
      c2.save();
      c2.setLineDash([4, 6]);
      c2.lineDashOffset = -t * 24;
      c2.strokeStyle = `hsla(${351 - 154 * conv}, 92%, 68%, ${0.22 + 0.4 * (1 - conv)})`;
      c2.lineWidth = 1.4;
      c2.beginPath(); c2.moveTo(ax, ay); c2.lineTo(gx, gy); c2.stroke();
      c2.restore();

      // objetivo
      const rr = (0.05 - 0.03 * conv) * U + 3 * Math.sin(t * 3) * (1 - conv);
      c2.strokeStyle = `rgba(255, 199, 89, ${0.55 - 0.3 * conv})`;
      c2.lineWidth = 1.2;
      c2.beginPath(); c2.arc(gx, gy, Math.max(rr, 4), 0, Math.PI * 2); c2.stroke();

      // --- el pájaro ---
      const dir = gx >= ax ? 1 : -1;
      const learnHue = 351 - 154 * conv;
      const seg = (x0: number, y0: number, x1: number, y1: number, wdt: number, col: string) => {
        c2.strokeStyle = col; c2.lineWidth = wdt; c2.lineCap = 'round';
        c2.beginPath(); c2.moveTo(x0, y0); c2.lineTo(x1, y1); c2.stroke();
      };

      // halo
      const halo = c2.createRadialGradient(ax, ay, 0, ax, ay, S * 2.4);
      halo.addColorStop(0, `hsla(${learnHue}, 95%, 68%, ${0.2 + 0.15 * (1 - conv)})`);
      halo.addColorStop(1, 'transparent');
      c2.fillStyle = halo;
      c2.beginPath(); c2.arc(ax, ay, S * 2.4, 0, Math.PI * 2); c2.fill();

      // patas (detrás)
      const hipX = ax - dir * S * 0.2, hipY = ay + S * 0.3;
      for (const [ang, alpha] of [[p.legR, 0.45], [p.legL, 0.75]] as [number, number][]) {
        const kx = hipX + Math.sin(ang) * S * 0.85;
        const ky = hipY + Math.abs(Math.cos(ang)) * S * 0.95;
        seg(hipX, hipY, kx, ky, 2, `hsla(41, 92%, 66%, ${alpha})`);
        c2.fillStyle = `hsla(41, 92%, 66%, ${alpha})`;
        c2.beginPath(); c2.arc(kx, ky, 2.4, 0, Math.PI * 2); c2.fill();
      }

      // ala trasera
      const wx1 = ax + dir * Math.sin(p.wing + 2.4) * S * 0.7;
      const wy1 = ay - Math.cos(p.wing + 2.4) * S * 0.8;
      seg(ax, ay, wx1, wy1, 3, `hsla(${learnHue}, 90%, 60%, 0.3)`);

      // cuerpo
      c2.fillStyle = `hsla(${learnHue}, 90%, ${68 + 8 * conv}%, 0.92)`;
      c2.beginPath();
      c2.ellipse(ax + dir * S * 0.12, ay, S * 0.62, S * 0.42, 0, 0, Math.PI * 2);
      c2.fill();

      // ala delantera
      const wx0 = ax - dir * Math.sin(p.wing) * S * 1.0;
      const wy0 = ay - Math.cos(p.wing) * S * 1.05;
      seg(ax, ay - S * 0.15, wx0, wy0, 3.4, `hsla(${learnHue}, 95%, 72%, ${0.6 + 0.35 * conv})`);

      // cabeza + pico + ojo
      const hx = ax + dir * S * 0.78, hy = ay - S * 0.3;
      c2.fillStyle = `hsla(${learnHue}, 92%, 76%, 0.95)`;
      c2.beginPath(); c2.arc(hx, hy, S * 0.28, 0, Math.PI * 2); c2.fill();
      seg(hx, hy, hx + dir * S * 0.42, hy + S * 0.08, 2.6, 'hsla(41, 92%, 62%, 0.95)');
      c2.fillStyle = '#0a0d18';
      c2.beginPath(); c2.arc(hx + dir * S * 0.09, hy - S * 0.05, 1.6, 0, Math.PI * 2); c2.fill();

      // destello de salto
      if (!p.grounded && p.jump > 0.3) {
        c2.fillStyle = `hsla(41, 95%, 70%, ${0.5 * p.jump})`;
        c2.beginPath(); c2.arc(hipX, hipY + S * 0.9, 5 * p.jump, 0, Math.PI * 2); c2.fill();
      }

      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  initWebGPU().then((ok) => { if (!ok) initFallback(); });
}

const canvas = document.getElementById('neural');
if (canvas instanceof HTMLCanvasElement) boot(canvas);
