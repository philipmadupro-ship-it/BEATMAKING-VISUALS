// Pendant chain test stills: consecutive frames (one contact sheet) + a big single frame, from the app's own analysis.
//   node tools/chain-stills.mjs [audio] [stage=nigredo] [startBeat=20] [outDir=shots/chain]   (Playwright; serves web-app/)
// Env: STEP (frames between stills, default 1), LOGO=1 (the logo chain's link steps instead of the pendant), ASPECT.
// Output: <out>/strip_<stage>.png (8 consecutive frames, cropped to the pendant), <out>/frame_<stage>.png (full 1080x1920).
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AUDIO = path.resolve(process.argv[2] || ['/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav', path.join(ROOT, 'demo/test-beat-142.wav')].find((f) => fs.existsSync(f)));
const STAGE = process.argv[3] || 'nigredo', B0 = +(process.argv[4] || 20), OUT = path.resolve(process.argv[5] || path.join(ROOT, 'shots/chain'));
const STEP = +(process.env.STEP || 1), ASPECT = process.env.ASPECT || '916'; fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error', m.text()); }); page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} }); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 });
await page.setInputFiles('#file', AUDIO);
await page.waitForFunction((b) => { const tr = window.u2c.store.session.track; return tr && !tr.meta.quick && tr.meta.name === b; }, path.basename(AUDIO), { timeout: 180000 });
await page.click('#grid .card >> nth=0'); await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.ready; }, null, { timeout: 180000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate((l) => { window.__LOGO = l; }, !!process.env.LOGO);
const r = await page.evaluate(async ([stage, B0, STEP, aspect]) => {
  const { createEvaluator, emptySheet } = await import('/src/cues/schema.js'), e = window.u2c.clip.current(), film = window.u2c.clip.film(e, aspect), ev = createEvaluator(emptySheet()), beat = e.D.beat, FPS = e.D.fps;
  const W = film.W, H = film.H, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const t0 = Math.floor(B0 * beat * FPS) / FPS, n = 8, tr = film.testRect(), cw = Math.round(tr[2] * 0.55), ch = Math.round(tr[3] * 0.62), sx = Math.round(tr[0] + tr[2] / 2 - cw / 2), sy = Math.round(tr[1] - 10);
  const sheet = document.createElement('canvas'); sheet.width = cw * 4; sheet.height = ch * 2; const sg = sheet.getContext('2d'); let big = null; const t1 = performance.now();
  if (window.__LOGO) { const { stageOf } = await import('/src/v8/core.js'), S = stageOf(stage), lw = 887, lh = 647; sheet.width = lw * 4 * 0.5; sheet.height = lh * 2 * 0.5; sg.scale(0.5, 0.5);
    for (let i = 0; i < n; i++) { g.fillStyle = S.bg; g.fillRect(0, 0, lw, lh); film.brand.logo(g, S, [0, 0, lw, lh], t0 + i * STEP / FPS + 0.5 / FPS, { cycle: 8, mode: 'cycle', glow: 0 }); sg.drawImage(c, 0, 0, lw, lh, (i % 4) * lw, Math.floor(i / 4) * lh, lw, lh); if (i === 0) big = c.toDataURL('image/png').split(',')[1]; }
    return { strip: sheet.toDataURL('image/png').split(',')[1], big, ms: performance.now() - t1, info: {} }; }
  for (let i = 0; i < n; i++) { film.render(g, t0 + i * STEP / FPS, { ev, look: 'exe', stage, test: 'pendant', fps: FPS }); sg.drawImage(c, sx, sy, cw, ch, (i % 4) * cw, Math.floor(i / 4) * ch, cw, ch); if (i === 0) big = c.toDataURL('image/png').split(',')[1]; }
  return { strip: sheet.toDataURL('image/png').split(',')[1], big, ms: performance.now() - t1, info: film.brand.chainInfo() };
}, [STAGE, B0, STEP, ASPECT]);
fs.writeFileSync(path.join(OUT, `strip_${STAGE}.png`), Buffer.from(r.strip, 'base64')); fs.writeFileSync(path.join(OUT, `frame_${STAGE}.png`), Buffer.from(r.big, 'base64'));
console.log(path.join(OUT, `strip_${STAGE}.png`), `render ${r.ms.toFixed(0)} ms`, JSON.stringify(r.info)); await browser.close(); server.close();
