// v12 spectrum stills: node tools/spectrum-stills.mjs [audio]  -> shots/spectrum/spectrum_<WxH>_<stage>_<kick|between>.png
// Env: STAGES=nigredo,rubedo SIZES=984x340,470x300 (a 1080-wide frame with the window scaled 1:1)
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), OUT = path.join(ROOT, 'shots/spectrum');
const AUDIO = path.resolve(process.argv[2] || '/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav');
const STAGES = (process.env.STAGES || 'nigredo,rubedo').split(','), SIZES = (process.env.SIZES || '984x340,470x300').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.otf': 'font/otf', '.woff2': 'font/woff2' };
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
for (const stage of STAGES) for (const [w, h] of SIZES) for (const when of ['kick', 'between']) {
  const png = await page.evaluate(async ([stage, w, h, when]) => {
    const { createCore, stageOf } = await import('/src/v8/core.js'), { createMeters } = await import('/src/v8/meters.js'), SV = await import('/src/v8/spectrumview.js');
    const e = window.u2c.clip.current(), L = createCore(e.D), S = stageOf(stage); L.meter = (k, key, d) => d; L.tagGet = () => '';
    const D = e.D, strong = D.onsets.kick.filter((k) => k[1] >= 0.9 && k[2] > 2 && k[2] < D.duration - 1), kq = strong[1] ? strong[1][2] : D.onsets.kick[4][2], t = when === 'kick' ? kq + 1 / D.fps : kq + 0.30;
    const M = createMeters(L), W = Math.max(1080, w + 80), H = h + 80, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = S.bg; g.fillRect(0, 0, W, H); g.translate(40, 40); L.snap(g, 'ground'); L.glass(g, 0, 0, w, h, S, {});
    M.spectrum(g, S, [8, 4, w - 16, h - 8], t, 1);
    return c.toDataURL('image/png').split(',')[1];
  }, [stage, w, h, when]);
  const f = path.join(OUT, `spectrum_${w}x${h}_${stage}_${when}.png`); fs.writeFileSync(f, Buffer.from(png, 'base64')); console.log(f);
}
await browser.close(); server.close();
