// Layer preview panel (Playwright, headless Chromium). node tests/layerpreview.mjs
// Covers: one thumbnail per layer + the composite, thumbnails drawn (non-blank), eye / solo hide windows, 5 fps cap and pause when collapsed,
// the saved state, and the panel is not part of a rendered / recorded frame.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [], errors = [];
const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); s.end(fs.readFileSync(p)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const ev = (fn, arg) => page.evaluate(fn, arg);
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await ev(() => { try { localStorage.clear(); localStorage.setItem('u2c.mode.v1', 'pro'); } catch (_) {} }); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 });
await ev(() => { if (document.getElementById('studio').hidden) window.u2c.actions.openStudio(); window.u2c.clock.seek(30); window.u2c.clock.pause(); window.u2c.studio.markDirty(); });
await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.ready; }, null, { timeout: 60000 });
await page.waitForTimeout(800);
await ev(() => document.getElementById('layerPreviewBtn').click()); await page.waitForTimeout(900);
const info = await ev(() => { const el = document.getElementById('u2cLayerPreview'), rows = [...el.querySelectorAll('[data-lid]')]; let drawn = 0;
  for (const r of rows) { const c = r.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 20) n++; if (n > 10) drawn++; }
  return { shown: !el.hidden, rows: rows.length, ids: rows.map((r) => r.dataset.lid), maxW: Math.max(...rows.map((r) => r.querySelector('canvas').width)), drawn }; });
ok('toolbar button opens the panel; one tile per layer plus the composite', info.shown && info.rows >= 4 && info.ids[0] === '*', info.ids.join());
ok('thumbnails are at most 160 px wide and are drawn (not blank)', info.maxW <= 160 && info.drawn >= 3, `maxW ${info.maxW}, drawn ${info.drawn}/${info.rows}`);
const win = info.ids.find((i) => i !== '*' && !i.startsWith('@'));
await ev((w) => { document.querySelector(`#u2cLayerPreview [data-lid="${w}"] [data-eye]`).click(); }, win); await page.waitForTimeout(400);
const hid = await ev((w) => window.u2c.cues.ev().value(`win.${w}.visible`, window.u2c.cuetl.state.playhead, true), win);
ok('eye hides the window (cue prop win.<id>.visible = false) and shows it again', hid === false && await (async () => { await ev((w) => document.querySelector(`#u2cLayerPreview [data-lid="${w}"] [data-eye]`).click(), win); await page.waitForTimeout(300); return ev((w) => window.u2c.cues.ev().value(`win.${w}.visible`, window.u2c.cuetl.state.playhead, true) !== false, win); })());
await ev((w) => document.querySelector(`#u2cLayerPreview [data-lid="${w}"] [data-solo]`).click(), win); await page.waitForTimeout(400);
const so = await ev((w) => { const ev = window.u2c.cues.ev(), ph = window.u2c.cuetl.state.playhead, ids = [...document.querySelectorAll('#u2cLayerPreview [data-lid]')].map((r) => r.dataset.lid).filter((i) => i !== '*' && !i.startsWith('@')); return { me: ev.value(`win.${w}.visible`, ph, true), others: ids.filter((i) => i !== w).map((i) => ev.value(`win.${i}.visible`, ph, true)) }; }, win);
ok('solo shows only that layer', so.me !== false && so.others.length > 2 && so.others.every((v) => v === false), JSON.stringify(so));
await ev((w) => document.querySelector(`#u2cLayerPreview [data-lid="${w}"] [data-solo]`).click(), win); await page.waitForTimeout(400);
const un = await ev(() => { const ev = window.u2c.cues.ev(), ph = window.u2c.cuetl.state.playhead; return [...document.querySelectorAll('#u2cLayerPreview [data-lid]')].map((r) => r.dataset.lid).filter((i) => i !== '*' && !i.startsWith('@')).every((i) => ev.value(`win.${i}.visible`, ph, true) !== false); });
ok('un-solo restores the other layers', un);
await ev((w) => { const r = document.querySelector(`#u2cLayerPreview [data-lid="${w}"] canvas`); r.click(); }, win);
ok('clicking a tile selects that layer on the canvas', await ev((w) => window.u2c.studio.pick === w, win));
// cost: 5 fps cap, paused when collapsed
const calls = await ev(async () => { const lp = window.u2c.layerPreview; let n = 0; const c = lp.el.querySelector('canvas'), g = c.getContext('2d'), orig = g.drawImage.bind(g); g.drawImage = (...a) => { n++; return orig(...a); };
  window.u2c.clock.seek(31); window.u2c.studio.markDirty(); await new Promise((r) => setTimeout(r, 2000)); g.drawImage = orig; return n; });
ok('refresh is capped at about 5 per second', calls <= 12, `${calls} composite draws in 2 s`);
await ev(() => document.querySelector('#u2cLayerPreview [data-c]').click());
ok('collapsing stops the refresh timer', await ev(() => !window.u2c.layerPreview.running && document.querySelector('#u2cLayerPreview [data-list]').hidden));
const saved = await ev(() => JSON.parse(localStorage.getItem('u2c.layerpreview')));
ok('panel state is saved to localStorage (open, collapsed, position)', saved && saved.open === true && saved.collapsed === true && typeof saved.x === 'number');
await ev(() => document.querySelector('#u2cLayerPreview [data-c]').click());
// the panel is DOM: a rendered frame (what the recorder / exporter draws) is identical with the panel open and closed
const same = await ev(async () => { const A = window.u2c, one = () => { const cv = document.createElement('canvas'); cv.width = 270; cv.height = 480; const s = { canvas: cv, ctx: cv.getContext('2d'), w: 270, h: 480 }; A.renderFrame(33, s, A.store.project, A.store.session.track, { fps: 30 }); return cv.toDataURL(); };
  A.layerPreview.toggle(true); const a = one(); A.layerPreview.toggle(false); const b = one(); return { same: a === b, len: a.length }; });
ok('the panel is not part of a rendered / recorded frame', same.same && same.len > 5000, `${same.len} chars`);
ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close();
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
