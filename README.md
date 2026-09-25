# Julián Fonseca — Servicios Web e Inteligencia Artificial

> [**Ver la página en vivo →**](https://fonck95.github.io/julianfonseca/)

Sitio profesional construido con **Astro 5** (estático, sin frameworks de UI):
portafolio de servicios web y de IA desde Bucaramanga, Colombia.

## El hero

El punto del hero es un **ave articulada que evoluciona de verdad en el
navegador**: un cerebro *transformer* (5 tokens, 2 cabezas de atención,
~1 600 parámetros) que se optimiza por neuroevolución — hill-climbing con
mutación gaussiana annealed, sin backprop — hasta dominar tres etapas:
**caminar → saltar → volar** detrás del cursor (o del dedo, en móvil).

Vuela dentro de **viento real**: el aire es un campo de velocidad 2D que
resuelve las ecuaciones de Navier–Stokes incompresibles

$$\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u}\cdot\nabla)\mathbf{u} = -\frac{1}{\rho}\nabla p + \nu\nabla^2\mathbf{u} + \mathbf{f}, \qquad \nabla\cdot\mathbf{u} = 0$$

con el método de Jos Stam (*Stable Fluids*, SIGGRAPH 1999): advección
semilagangiana + difusión viscosa implícita + proyección de presión (Jacobi),
incondicionalmente estable. Las alas se resuelven por **paneles cuasi-
estacionarios** (blade-element): cada panel mide el viento relativo donde
está, calcula su ángulo de ataque y devuelve sustentación
$\tfrac12\rho v^2 S\,C_{L}\sin\alpha\cos\alpha$ y rozamiento
$\tfrac12\rho v^2 S\,(C_{D0}+C_{L}\sin^2\alpha)$ — y por Newton III la
reacción vuelve al campo: el downwash y los vórtices del aleteo se ven, y el
ave siguiente los siente. Los trazadores del fondo dibujan ese campo: cada
línea es aire moviéndose de verdad.

Todo corre en la CPU del navegador, también en móvil (rejilla y presupuestos
adaptativos), y va **incrustado en el HTML en el build**: cero peticiones de
módulos, cero WebGPU, cero dependencias nuevas.

> Nota de rigor: esto es dinámica de fluidos *numérica*, la herramienta
> estándar de la industria desde hace décadas. El problema del milenio de
> existencia y regularidad de NS 3D sigue formalmente abierto: en septiembre
> de 2026 el Clay Mathematics Institute lo declaró «aparentemente resuelto»
> tras una prueba anunciada por OpenAI, pero aún no la ha aceptado ni ha
> entregado el premio.

## Desarrollo local

```bash
npm install
npm run dev    # → http://localhost:4321/  (el sitio se sirve en la raíz)
```

> ⚠️ No abras la carpeta del proyecto con un servidor estático (Live Server y
> parecidos): Astro necesita su propio dev server para compilar `.astro`.

El motor del hero vive partido en `public/hero/` (core → fluido → política →
criatura → render → boot) y `NeuralCanvas.astro` lo concatena e incrusta en el
HTML durante el build.

## Despliegue

- **GitHub Pages** (producción): cada push a `main` dispara
  `.github/workflows/deploy.yml` → `https://fonck95.github.io/julianfonseca/`.
- **Railway** (alternativo): Railpack detecta Astro, compila y sirve `dist/`
  con Caddy. En Railway el sitio se sirve en la raíz (sin `/julianfonseca`):
  `astro.config.mjs` lo detecta con `RAILWAY_ENVIRONMENT`.
