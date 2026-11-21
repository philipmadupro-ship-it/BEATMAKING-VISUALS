// v14 player panels contact sheets: levels / imager (variant 'player') and the 4 inserts at the 16:9 and 9:16 target sizes, at a kick and between kicks.
//   node tools/player-stills.mjs [stages=nigredo,rubedo] [audio]   -> shots/player/panels_<stage>_<kick|between>.png   (env KICK=n, DPR=2)
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), OUT = path.join(ROOT, 'shots/player');
const STAGES = (process.argv[2] || 'nigredo,rubedo').split(','), AUDIO = path.resolve(process.argv[3] || ['/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav', path.join(ROOT, 'demo/test-beat-142.wav')].find((f) => fs.existsSync(f)));
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
const KICK = +(process.env.KICK || 12), DPR = +(process.env.DPR || 2);
for (const stage of STAGES) for (const when of ['kick', 'between']) {
  const png = await page.evaluate(async ([stage, when, KICK, DPR]) => {
    const { createCore, stageOf } = await import('/src/v8/core.js'), { createMeters } = await import('/src/v8/meters.js'), INS = await import('/src/v8/inserts.js');
    const e = window.u2c.clip.current(), D = e.D, L = createCore(D), S = stageOf(stage); L.tagGet = () => ''; L.curWin = 'loud'; const M = createMeters(L);
    const tq = D.onsets.kick[KICK][2], f0 = Math.max(0, Math.ceil(tq * D.fps - 0.5)), t = when === 'kick' ? (f0 + 0.5) / D.fps : tq + 0.62 * D.beat;
    const W = 1150, H = 1020, c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR; const g = c.getContext('2d');
    L.view.camZ = 1; L.view.base = DPR; g.fillStyle = S.bg; g.fillRect(0, 0, c.width, c.height); g.scale(DPR, DPR);
    const card = (x, y, w, h) => { g.fillStyle = S.card; g.globalAlpha = 0.9; g.fill(L.rr(x, y, w, h, 16)); g.globalAlpha = 1; g.strokeStyle = S.ink; g.globalAlpha = 0.18; g.stroke(L.rr(x + 0.5, y + 0.5, w - 1, h - 1, 16)); g.globalAlpha = 1; };
    const place = (x, y, w, h, fn) => { card(x - 14, y - 14, w + 28, h + 28); fn([x, y, w, h]); };
    // 16:9
    place(20, 20, 330, 360, (r) => M.levels(g, S, r, t, 1, { variant: 'player' }));
    place(400, 20, 280, 360, (r) => M.imager(g, S, r, t, 1, { variant: 'player' }));
    place(720, 20, 450 - 40, 90, (r) => INS.draw(g, r, t * D.fps, { L, S }));
    // 9:16
    place(20, 430, 300, 420, (r) => M.levels(g, S, r, t, 1, { variant: 'player' }));
    place(370, 430, 300, 420, (r) => M.imager(g, S, r, t, 1, { variant: 'player' }));
    place(720, 200, 400, 120, (r) => INS.draw(g, r, t * D.fps, { L, S }));
    place(20, 900, 1100, 70, (r) => INS.draw(g, r, t * D.fps, { L, S }));
    return c.toDataURL('image/png').split(',')[1];
  }, [stage, when, KICK, DPR]);
  const f = path.join(OUT, `panels_${stage}_${when}.png`); fs.writeFileSync(f, Buffer.from(png, 'base64')); console.log(f);
}
await browser.close(); server.close();
