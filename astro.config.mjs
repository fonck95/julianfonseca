import { defineConfig } from 'astro/config';

// En Railway (Railpack + Caddy) el sitio se sirve desde la raíz;
// en GitHub Pages vive bajo /julianfonseca.
const onRailway = !!process.env.RAILWAY_ENVIRONMENT;

export default defineConfig({
  base: onRailway ? '/' : '/julianfonseca',
  site: onRailway
    ? (process.env.RAILWAY_STATIC_URL || 'https://example.up.railway.app')
    : 'https://fonck95.github.io',
});
