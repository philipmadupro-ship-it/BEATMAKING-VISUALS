// Parity check (v9): one cue sheet, two renderers. Exports the studio's default cue sheet for a beat, renders frames
//   (A) in the browser with the web app's composition code (src/v8) on the NATIVE analysis (u2c-motion film/data/<id>.js,
//       through fromNative) = what the web export draws given the same data,
//   (W) in the web app itself (its own in-browser analysis + renderFrame: the studio preview / MP4 export path),
// and writes PNGs + the sheet; tools/parity_diff.py compares them with the native stills (node render.mjs --cues ...).
//   node tools/parity.mjs <outDir> [beat.wav] [nativeDataId=atelmansion-3c-fmin-128-30] [times=1,5,9.5,14,22,28]
// Env: U2C_MOTION (default /home/user/u2c-motion), DATE, TITLE (the {date} / {title} tags used on both sides).
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), MOTION = process.env.U2C_MOTION || '/home/user/u2c-motion';
const OUT = path.resolve(process.argv[2] || 'parity'), AUDIO = path.resolve(process.argv[3] || path.join(MOTION, 'audio/atelmansion-3c-fmin-128.wav'));
const DID = process.argv[4] || 'atelmansion-3c-fmin-128-30', TIMES = (process.argv[5] || '1,5,9.5,14,22,28').split(',').map(Number);
const DATE = process.env.DATE || 'PARITY', TITLE = process.env.TITLE || 'ATELMANSION 3';
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]), base = ROOT;
  if (u.startsWith('/__native/')) { base = path.join(MOTION, 'film'); u = u.slice('/__native'.length); }
  const p = path.join(base, u.replace(/\/$/, '/index.html')); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const URL0 = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
// 1. the studio: load the beat, 30 s section, exe / 9:16 / nigredo, the default sheet -> export JSON
await page.goto(URL0); await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} }); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 });
await page.setInputFiles('#file', AUDIO);
await page.waitForFunction((b) => { const tr = window.u2c.store.session.track; return tr && !tr.meta.quick && tr.meta.name === b; }, path.basename(AUDIO), { timeout: 180000 });
await page.evaluate(() => { const A = window.u2c.actions; A.openStudio('exe', '916'); A.setAspect('916'); A.setStage('nigredo'); A.applyHook(30); });
await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.ready; }, null, { timeout: 180000 });
await page.evaluate(() => window.u2c.actions.applyPreset('default')); await page.waitForTimeout(500);
const sheet = await page.evaluate(() => window.u2c.cues.toJSON()); fs.writeFileSync(path.join(OUT, 'cues-web-default.json'), JSON.stringify(sheet, null, 1));
const info = await page.evaluate(() => { const e = window.u2c.clip.current(); return { bars: e.bars, inT: e.inT, startBar: e.D.song.startBar, key: e.D.key, bpm: e.D.bpm }; });
console.log('web section', JSON.stringify(info));
// (W) the web app's own render path
for (const t of TIMES) {
  const b64 = await page.evaluate(([t, DATE]) => { const app = window.u2c, p = app.store.project, e = app.clip.current(), c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const tags = app.cues.tags(DATE); app.renderFrame(e.inT + t, { canvas: c, ctx: c.getContext('2d'), w: 1080, h: 1920 }, { ...p, aspect: '916' }, app.store.session.track, { tags }); return c.toDataURL('image/png').split(',')[1]; }, [t, DATE]);
  fs.writeFileSync(path.join(OUT, `web-app-t-${t.toFixed(2)}.png`), Buffer.from(b64, 'base64'));
}
// (A) the same composition code on the native analysis, in a bare page with the native template's local fonts
// same browser build + flags as the native stills (u2c-motion render.mjs), so rasterisation matches too
const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const b2 = await chromium.launch(fs.existsSync(shell) ? { executablePath: shell, args: ['--no-sandbox'] } : {});
const p2 = await b2.newPage({ viewport: { width: 1080, height: 1920 } }); p2.on('pageerror', (e) => console.log('pageerror(A)', e.message));
await p2.goto(URL0 + '__parity-origin').catch(() => {});   // same origin for the module imports
await p2.setContent(`<!doctype html><html><head><base href="${URL0}"><style>
@font-face { font-family: "Instrument Sans"; font-weight: 600; src: url("__native/assets/fonts/instrument-sans-latin-600-normal.woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 400; src: url("__native/assets/fonts/jetbrains-mono-latin-400-normal.woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 500; src: url("__native/assets/fonts/jetbrains-mono-latin-500-normal.woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 700; src: url("__native/assets/fonts/jetbrains-mono-latin-700-normal.woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 800; src: url("__native/assets/fonts/jetbrains-mono-latin-800-normal.woff2"); }
@font-face { font-family: "Instrument Serif"; font-style: italic; font-weight: 400; src: url("__native/assets/fonts/instrument-serif-latin-400-italic.woff2"); }
@font-face { font-family: "Caveat"; font-weight: 700; src: url("__native/assets/fonts/Caveat-700-latin.woff2"); }
</style></head><body><canvas id="c" width="1080" height="1920"></canvas><script src="__native/data/${DID}.js"></script></body></html>`);
await p2.waitForFunction(() => !!window.U2C_DATA, null, { timeout: 60000 });
await p2.evaluate(async ([sheet, DATE, TITLE]) => {
  const [{ createFilm }, { fromNative }, { loadAssets }, { DEFAULT_TAGS }, S] = await Promise.all(['src/v8/film.js', 'src/v8/data.js', 'src/v8/assets.js', 'src/v8/tags.js', 'src/cues/schema.js'].map((m) => import('/' + m)));
  await Promise.all(['800 22px "JetBrains Mono"', '700 22px "JetBrains Mono"', '500 22px "JetBrains Mono"', '400 22px "JetBrains Mono"', '600 22px "Instrument Sans"', 'italic 400 40px "Instrument Serif"', '700 24px "Caveat"'].map((f) => document.fonts.load(f, 'EXP-03 Atelmansion 0123456789')));
  const D = fromNative(window.U2C_DATA), assets = await loadAssets('assets/'), film = createFilm({ D, assets, aspect: '916' }), sh = S.parseSheet(sheet);
  const tags = S.mergeDeep(S.mergeDeep(DEFAULT_TAGS, sh.tags || {}), { date: DATE, title: TITLE });
  window.__A = { film, opts: { ev: S.createEvaluator(sh), tags, fps: 30, look: 'exe', stage: 'nigredo' } };
}, [sheet, DATE, TITLE]);
for (const t of TIMES) {
  const b64 = await p2.evaluate((t) => { const c = document.getElementById('c'); window.__A.film.render(c.getContext('2d'), t, window.__A.opts); return c.toDataURL('image/png').split(',')[1]; }, t);
  fs.writeFileSync(path.join(OUT, `web-code-t-${t.toFixed(2)}.png`), Buffer.from(b64, 'base64'));
}
console.log('wrote', OUT, 'times', TIMES.join(','));
await b2.close(); await browser.close(); srv.close();
