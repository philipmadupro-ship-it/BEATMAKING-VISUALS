// Pendant chain test stills: consecutive frames (one contact sheet) + a big single frame, from the app's own analysis.
//   node tools/chain-stills.mjs [audio] [stage=nigredo] [startBeat=20] [outDir=shots/chain]   (Playwright; serves web-app/)
// Env: CLIP=<fps> renders 6 beats as PNG frames + chain-<fps>fps.mp4 in the out dir (needs ffmpeg) and prints the 60 fps extreme offsets; STEP (frames between stills, default 1), LOGO=1 (the logo chain's link steps instead of the pendant), ASPECT.
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
if (process.env.CLIP) {
  const FPSC = +process.env.CLIP, NFR = Math.round(6 * 60 / 128 * FPSC), dir = path.join(OUT, 'clip'); fs.mkdirSync(dir, { recursive: true });
  const info = await page.evaluate(async ([stage, B0, aspect, FPSC, NFR]) => {
    const { createEvaluator, emptySheet } = await import('/src/cues/schema.js'), e = window.u2c.clip.current(), film = window.u2c.clip.film(e, aspect), ev = createEvaluator(emptySheet());
    const c = document.createElement('canvas'); c.width = film.W; c.height = film.H; const g = c.getContext('2d'), tr = film.testRect(), t0 = B0 * e.D.beat; window.__frames = [];
    const cw = Math.round(tr[2] * 0.6), ch = Math.round(tr[3] * 0.7), sx = Math.round(tr[0] + tr[2] / 2 - cw / 2), sy = Math.round(tr[1] - 10), o = document.createElement('canvas'); o.width = cw; o.height = ch; const og = o.getContext('2d');
    for (let i = 0; i < NFR; i++) { film.render(g, t0 + i / FPSC, { ev, look: 'exe', stage, test: 'pendant', fps: FPSC }); og.drawImage(c, sx, sy, cw, ch, 0, 0, cw, ch); window.__frames.push(o.toDataURL('image/png').split(',')[1]); }
    // extremes of the pendant angle (model) vs the beats, in 30 fps frames
    let worst = 0, n = 0; const th = (t) => Math.abs(film.trace(t, ev).th); for (let k = 1; k * e.D.beat < 40; k++) { const tb = (B0 + k) * e.D.beat; if (tb > e.D.duration - 0.3) break; let best = -1, bt = 0; for (let f = -8; f <= 8; f++) { const t = tb + f / 240, v = th(t); if (v > best) { best = v; bt = t; } } worst = Math.max(worst, Math.abs(bt - tb) * 30); n++; }
    return { n, worst, frames: NFR };
  }, [STAGE, B0, ASPECT, FPSC, NFR]);
  for (let i = 0; i < info.frames; i++) fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(await page.evaluate((i) => window.__frames[i], i), 'base64'));
  console.log('clip frames', info.frames, 'extremes', info.n, 'worst offset (30 fps frames)', info.worst.toFixed(2));
  const { execFileSync } = await import('node:child_process'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPSC), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(OUT, `chain-${FPSC}fps.mp4`)]); console.log(path.join(OUT, `chain-${FPSC}fps.mp4`));
  await browser.close(); server.close(); process.exit(0);
}
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
