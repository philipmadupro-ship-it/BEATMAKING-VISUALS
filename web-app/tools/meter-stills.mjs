// Render each meter as a still at 1080 px wide (its window scaled up, as in a focus shot) for every stage asked,
// from the app's own analysis of a real beat. Output: shots/meters/<meter>_<stage>.png (gitignored).
//   node tools/meter-stills.mjs [audio] [stages=nigredo,rubedo] [meters=...]   (Playwright; serves web-app/ itself)
// Env: T (clip time in s, default 1/2 of the clip), MODES (e.g. "stereo.mode=level") for extra variants.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), OUT = path.join(ROOT, 'shots/meters');
const AUDIO = path.resolve(process.argv[2] || ['/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav', path.join(ROOT, 'demo/test-beat-142.wav')].find((f) => fs.existsSync(f)));
const STAGES = (process.argv[3] || 'nigredo,rubedo').split(',');
// [file name, meter fn, window w, h, overrides]
const ALL = [['imager-sample', 'imager', 330, 290, { 'stereo.mode': 'sample' }], ['imager-level', 'imager', 330, 290, { 'stereo.mode': 'level' }], ['imager-lissajous', 'imager', 330, 290, { 'stereo.mode': 'lissajous' }],
  ['spectro-ms', 'spectro', 330, 290, {}], ['eq', 'eq', 496, 302, {}], ['levels', 'levels', 376, 228, {}], ['levels-k14', 'levels', 376, 228, { 'levels.mode': 'k14' }], ['loudness', 'loud', 340, 290, {}], ['ghost', 'ghost', 340, 290, {}], ['spectrum-ms', 'spectrum', 496, 302, { 'spectrum.mode': 'ms' }]];
const WANT = process.argv[4] ? process.argv[4].split(',') : null, JOBS = ALL.filter(([n]) => !WANT || WANT.some((w) => n.startsWith(w)));
fs.mkdirSync(OUT, { recursive: true });
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
for (const stage of STAGES) for (const [name, fn, w, h, over] of JOBS) {
  const png = await page.evaluate(async ([stage, fn, w, h, over, T]) => {
    const { createCore, stageOf } = await import('/src/v8/core.js'), { createMeters } = await import('/src/v8/meters.js');
    const e = window.u2c.clip.current(), L = createCore(e.D), S = stageOf(stage); L.meter = (k, key, d) => (over[k + '.' + key] ?? d); L.tagGet = () => ''; L.curWin = 'loud';
    const M = createMeters(L), sc = 1000 / w, W = 1080, H = Math.round(h * sc + 80), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    L.view.camZ = sc; g.fillStyle = S.bg; g.fillRect(0, 0, W, H); g.translate(40, 40); g.scale(sc, sc);
    g.fillStyle = S.card; g.fillRect(0, 0, w, h); g.strokeStyle = S.ink; g.globalAlpha = 0.5; g.strokeRect(0.5, 0.5, w - 1, h - 1); g.globalAlpha = 1;
    const t = T != null ? T : e.D.duration * 0.5; M[fn](g, S, [8, 8, w - 16, h - 16], t, 1);
    return c.toDataURL('image/png').split(',')[1];
  }, [stage, fn, w, h, over, process.env.T ? +process.env.T : null]);
  const f = path.join(OUT, `${name}_${stage}.png`); fs.writeFileSync(f, Buffer.from(png, 'base64')); console.log(f);
}
// full film frames (1080x1920, exe look): the camera on one window, as in a focus shot, plus the wide bench
for (const stage of STAGES) for (const shotTo of (process.env.FILM || 'wide,stereo,loud,eq,bands').split(',').filter(Boolean)) {
  const png = await page.evaluate(async ([stage, shotTo]) => {
    const { createEvaluator, emptySheet } = await import('/src/cues/schema.js'), e = window.u2c.clip.current(), film = window.u2c.clip.film(e, '916');
    const sh = emptySheet(); sh.tracks.push({ id: 't1', path: 'camera.shot', kind: 'shot', lane: 'camera', keys: [{ id: 'k1', b: 0, v: shotTo, ease: 'cut' }] }, { id: 't2', path: 'stage', kind: 'enum', lane: 'stage', keys: [{ id: 'k2', b: 0, v: stage }] });
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; film.render(c.getContext('2d'), e.D.duration * 0.5, { ev: createEvaluator(sh), look: 'exe', stage });
    return c.toDataURL('image/png').split(',')[1];
  }, [stage, shotTo]);
  const f = path.join(OUT, `film-${shotTo}_${stage}.png`); fs.writeFileSync(f, Buffer.from(png, 'base64')); console.log(f);
}
await browser.close(); server.close();
