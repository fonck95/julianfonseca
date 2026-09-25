# Julián Fonseca — Servicios Web e Inteligencia Artificial

> [**Ver la página en vivo →**](https://fonck95.github.io/julianfonseca/)

Sitio profesional construido con **[Astro](https://astro.build)** y desplegado en GitHub Pages mediante GitHub Actions.

**El concepto:** la propia página es la demostración. El hero corre un **campo neuronal escrito en WGSL sobre WebGPU** en tiempo real —nodos que respiran, sinapsis que despiertan cerca del cursor, niebla con domain warp— con fallback elegante en canvas 2D para navegadores sin WebGPU.

## Servicios

- Agentes de IA para tareas específicas y de uso general
- RAG y embeddings sobre documentos propios
- Integraciones API y Model Context Protocol (MCP)
- Juicio calibrado con Jev / TypeSafe
- Experiencias y cómputo WebGPU

## Stack del sitio

- **Astro 5** — componentes `.astro`, islas de script, cero JS de framework en runtime
- **WebGPU / WGSL** — shader de fragmentos fullscreen con uniforms (resolución, tiempo, puntero)
- **Tipografía** — Sora (display) + Inter (texto) vía Google Fonts
- **Iconografía** — SVG propios trazados a mano (sin emojis, sin librerías)
- **CI/CD** — GitHub Actions (`withastro/action` + `actions/deploy-pages`)

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:4321/julianfonseca/
npm run build    # genera dist/
```

Requiere Node ≥ 20.

## Despliegue

Cada push a `main` dispara el workflow `Deploy to GitHub Pages`, que construye y publica automáticamente. La primera vez hay que activar Pages en **Settings → Pages → Source: GitHub Actions**.
