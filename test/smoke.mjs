// Smoke test: sirve el build de dist/ y mira la página en un navegador real.
// Comprueba que el canvas no está en blanco y que CAMBIA entre dos capturas
// separadas un segundo (la simulación corre), en escritorio y en móvil.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function handler(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no encontrado'); return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}

const server = createServer(handler);
await new Promise((r) => server.listen(4321, r));

const browser = await chromium.launch();
let failed = false;

async function check(name, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });

  const problems = [];
  if (errors.length) problems.push('errores de consola: ' + errors.slice(0, 3).join(' | '));

  const loaded = await page.evaluate(() => window.__HERO_LOADED__ === true);
  if (!loaded) problems.push('el motor no arrancó (window.__HERO_LOADED__ != true)');

  // el canvas existe, se ve y no está en blanco
  const box = await page.locator('#neural').boundingBox();
  if (!box || box.width < 50 || box.height < 50) problems.push('el canvas no se ve');

  const shot1 = await page.evaluate(() => {
    const c = document.getElementById('neural');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4000) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  if (shot1 === 0) problems.push('el canvas está en negro (nada dibujado)');

  await page.waitForTimeout(1200);
  const shot2 = await page.evaluate(() => {
    const c = document.getElementById('neural');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4000) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
  if (shot1 === shot2) problems.push('el canvas no cambia en 1.2 s (la simulación está congelada)');

  // el HUD avanza: las simulaciones tienen que subir
  const s1 = await page.locator('#hud-steps').textContent().catch(() => '0');
  await page.waitForTimeout(800);
  const s2 = await page.locator('#hud-steps').textContent().catch(() => '0');
  if (s1 === s2) problems.push('el contador de simulaciones no avanza (' + s1 + ')');

  await page.screenshot({ path: 'smoke-' + width + '.png' });
  await ctx.close();

  if (problems.length) { failed = true; console.error('✗ ' + name + ':\n  ' + problems.join('\n  ')); }
  else console.log('✓ ' + name);
}

await check('escritorio 1280px', 1280, 800);
await check('móvil 390px', 390, 844);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
