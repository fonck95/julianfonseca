# Julián Fonseca — Servicios Web e Inteligencia Artificial

> [**Ver la página en vivo →**](https://fonck95.github.io/julianfonseca/)

Sitio profesional construido con **[Astro](https://astro.build)** y desplegado en GitHub Pages mediante GitHub Actions.

**El concepto:** la propia página es la demostración. En el hero vive una **criatura articulada que evoluciona de verdad en tu navegador**: un pájaro con cuerpo, alas y patas controlado por una red neuronal mínima (MLP 8→10→4) cuyo cerebro se entrena por neuroevolución en la CPU — aprende primero a **caminar**, luego a **saltar** y por último a **volar** tras el cursor — mientras un shader WGSL sobre WebGPU pinta el resultado en tiempo real, con un HUD que muestra la aptitud, la etapa y las simulaciones. Sin WebGPU, un canvas 2D dibuja la misma criatura con el mismo cerebro.

## Servicios

- Agentes de IA para tareas específicas y de uso general
- RAG y embeddings sobre documentos propios
- Integraciones API y Model Context Protocol (MCP)
- Juicio calibrado con Jev / TypeSafe
- Experiencias y cómputo WebGPU

## Stack del sitio

- **Astro 5** — componentes `.astro`, islas de script, cero JS de framework en runtime
- **Neuroevolución en TypeScript** — física 2D de la criatura y entrenamiento por mutación (`src/lib/creature.ts`)
- **WebGPU / WGSL** — shader de fragmentos fullscreen: campo neuronal de fondo y ave dibujada con SDF (`src/lib/shader.ts`)
- **Tipografía** — Sora (display) + Inter (texto) vía Google Fonts
- **Iconografía** — SVG propios trazados a mano (sin emojis, sin librerías)
- **CI/CD** — GitHub Actions (`withastro/action` + `actions/deploy-pages`)

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:4321/  (la raíz: en dev el sitio NO vive bajo /julianfonseca)
npm run build    # genera dist/
npm run preview  # sirve dist/ tal como lo verá GitHub Pages
```

Requiere Node ≥ 20. Importante: hay que usar el servidor de Astro (`npm run dev`). Un servidor estático apuntando a la carpeta del proyecto (Live Server, `serve`, etc.) no compila los `.astro` ni los `.ts` y responde HTML a las peticiones de módulos — el navegador lo reporta como error MIME y el hero no arranca.

## Despliegue

Cada push a `main` dispara el workflow `Deploy to GitHub Pages`, que construye y publica automáticamente. La primera vez hay que activar Pages en **Settings → Pages → Source: GitHub Actions**.

En Railway (Railpack + Caddy) el mismo código se sirve desde la raíz: `astro.config.mjs` detecta el entorno y ajusta `base` y `site` solo.
