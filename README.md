# Julián Fonseca — Servicios Web e Inteligencia Artificial

> [**Ver la página en vivo →**](https://fonck95.github.io/julianfonseca/)

Sitio profesional construido con **Astro 5** (build estático, desplegado en GitHub Pages por Actions). El hero es una pieza viva: **un ave que evoluciona de verdad dentro de un viento que resuelve las ecuaciones de Navier–Stokes**, con un cerebro transformer — y funciona igual en PC y en móvil.

## El motor del hero (`public/hero/`)

Todo se escribe en el build y se incrusta **inline en el HTML**: si la página se ve, el motor corre. No hay módulos externos que un servidor pueda responder mal (el error MIME que rompía los despliegues anteriores es estructuralmente imposible).

| Parte | Qué hace |
|---|---|
| `00-core.js` | Perfil PC/móvil (rejilla del fluido, trazadores, presupuesto de CPU por frame) y escala física: 1 unidad = 1 cm, g = 981 u/s² (9.81 m/s² reales). |
| `10-fluid.js` | **Navier–Stokes incompresible 2D** (método de Jos Stam, *Stable Fluids*, SIGGRAPH 1999): difusión viscosa implícita, proyección de presión (Jacobi) y advección semilagrangiana, incondicionalmente estables. El viento no es un vector: es un campo. |
| `20-policy.js` | **Cerebro transformer** (Vaswani et al. 2017): 5 tokens — objetivo, cuerpo, **viento relativo en las alas**, pata L, pata R —, d_model 12, atención de 2 cabezas $\mathrm{softmax}(QK^\top/\sqrt{d_k})V$, LayerNorm post-norm, FFN, ~1 900 parámetros. **9 salidas** que no dan el ángulo del ala paso a paso (imposible seguir 6–38 Hz a 60 fps): pilotan un **CPG** — frecuencia, amplitud, asimetría de carrera, emplumado (amplitud y fase), empuje, salto y patas. |
| `30-creature.js` | **Aerodinámica por paneles** (blade element, Ellington 1984) con **ángulo de ataque firmado**: $C_n = C_L\sin\alpha\cos\alpha$ (pre-pérdida) o meseta de placa plana (Dickinson et al. 1999); el arrastre va a lo largo del flujo relativo. Batiendo simétrico la fuerza neta es ≈0: para volar la política tiene que **aprender** la asimetría de carrera y el emplumado. Newton III: cada panel inyecta −F en el fluido — el ave vuela dentro de los vórtices que deja. Alas como oscilador de 2.º orden con tope muscular (curva de Hill): punta ≤ 6.7 m/s. |
| `40-render.js` | Trazadores que hacen visible el campo (cada línea es aire advectado por NS), fondo neuronal en PC, y en móvil el suelo sube por encima del HUD para que el ave se vea siempre. |
| `50-boot.js` | Bucle: dos rejillas NS (visible y de evolución barata), evolución con presupuesto de tiempo, HUD en vivo (aptitud, sustentación en ·G, gráfica de convergencia, etapas), ráfagas reales del dedo/cursor, pausa en segundo plano. |
| `99-entry.js` | Arranque tolerante a fallos: si algo revienta, el HUD lo dice en vez de morir en silencio. |

### Evolución

Neuroevolución por hill-climbing con mutación gaussiana annealed sobre el genotipo plano (sin backprop). Currículo de tres etapas — **caminar → saltar → volar** — cada una contra su fantasma y su viento. La aptitud de «volar» tiene forma: la altitud sostenida puntúa aunque el fantasma quede lejos, así el gradiente hacia volar existe desde el primer salto.

### Honestidad física

- Un modelo 2D cuasi-estacionario **no** reproduce la sustentación por vórtice de borde de ataque (LEV) que sostiene a un ave real de 5 g; la constante aerodinámica está en la escala comprimida donde el régimen 2D sigue siendo cualitativamente fiel (documentado en `30-creature.js`).
- El **problema del milenio** de Navier–Stokes (existencia y regularidad 3D) no está formalmente resuelto: en septiembre de 2026 OpenAI anunció una prueba de *blowup* y el Clay la declaró «aparentemente resuelta», pero aún no la acepta ni la premia, y el resultado no cambia la simulación numérica. Lo que se usa aquí es la herramienta estándar de la industria (Stam 1999), citada como tal.

### Validación

Todo el pipeline pasó validación numérica headless del código commiteado: incompresibilidad del campo (max|∇·u| → 0.04 tras 20 pasos), forward del transformer finito y en [−1,1] sobre 1 000 entradas aleatorias, atención exacta contra recálculo independiente, y evolución completa — **las tres etapas dominadas en 403 evaluaciones (~2 s)** con políticas de referencia.

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:4321 — siempre el servidor de Astro, nunca un servidor estático sobre la carpeta del proyecto
```

## Despliegue

Push a `main` → GitHub Actions compila y publica en GitHub Pages. En Railway el mismo repo se sirve con Caddy desde la raíz (`astro.config.mjs` detecta `RAILWAY_ENVIRONMENT` y cambia el `base`).
