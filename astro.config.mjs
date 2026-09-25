import { defineConfig } from 'astro/config';

// En Railway (Railpack + Caddy) el sitio se sirve desde la raíz;
// en GitHub Pages vive bajo /julianfonseca; en `npm run dev` desde la raíz
// (si no, localhost:PUERTO/ devuelve 404 HTML y los módulos fallan por MIME).
const onRailway = !!process.env.RAILWAY_ENVIRONMENT;
const isDev =
  process.env.npm_lifecycle_event === 'dev' ||
  process.env.NODE_ENV === 'development';

// `site` solo se declara si es una URL válida: Astro falla el build con
// "Invalid url" si no lo es, y en Railway RAILWAY_STATIC_URL puede venir
// sin esquema. Ningún componente usa Astro.site, así que omitirla es seguro.
function safeSite(candidate) {
  if (!candidate) return undefined;
  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
}

const site = onRailway
  ? safeSite(process.env.RAILWAY_STATIC_URL)
  : 'https://fonck95.github.io/';

export default defineConfig({
  base: onRailway || isDev ? '/' : '/julianfonseca',
  ...(site ? { site } : {}),
});
