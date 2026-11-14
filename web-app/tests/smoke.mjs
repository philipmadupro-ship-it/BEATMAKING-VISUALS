// Smoke test for U2C Studio (Playwright, headless Chromium).
//   node tests/smoke.mjs [audioFile]        (serves web-app/ itself on a free port unless URL is set)
// Env: URL (use a running server), SHOTS (screenshot folder, default ./shots), CDN_CACHE (folder: serve the CDN and Google
// Fonts from a local cache, filling it with curl on a miss; use where the browser cannot reach them), NOEXPORT=1.
// Flow: boot without console errors -> upload the test beat -> analysis (tempo, sections) -> the three look cards draw ->
// open the studio -> the default cue sheet is generated from the analysis (v8 focus plan) -> edit keys through the UI
// (click a camera key, retarget it in the inspector, drag it, undo / redo, add + edit a text cue, split, delete, add a
// property track from the inspector) -> the preview reflects every edit -> autosave survives a reload -> JSON round trip
// -> sync (events on the grid within 1 frame, the flash on its frame, pendant extremes on the beats, camera lands on its
// key) -> NIGREDO stays grey -> a 4-bar export is a valid MP4 (ffprobe) -> screenshots at 1440x900 and 390x844.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.resolve(process.env.SHOTS || 'shots'), CACHE = process.env.CDN_CACHE || '';
const AUDIO = process.argv[2] || ['/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav', path.join(ROOT, 'demo/test-beat-142.wav')].find((f) => fs.existsSync(f)) || '';
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [], results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
// static server (unless URL is given)
let URL0 = process.env.URL, server = null;
if (!URL0) { const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
  server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); URL0 = `http://127.0.0.1:${server.address().port}/`; }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || 'dark' });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (process.env.VERBOSE || /\[u2c\]/.test(m.text())) console.log('  console.' + m.type() + ':', m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
if (CACHE) { fs.mkdirSync(CACHE, { recursive: true });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, async (route) => { const u = route.request().url(), f = path.join(CACHE, u.replace(/[^a-z0-9.@-]+/gi, '_').slice(0, 200));
    if (!fs.existsSync(f)) { try { execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 Chrome/120', '-o', f, u]); } catch (e) { return route.fulfill({ status: 404, body: 'miss' }); } }
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': /css2/.test(u) ? 'text/css' : /woff2/.test(u) ? 'font/woff2' : 'text/javascript', 'access-control-allow-origin': '*' } }); }); }
const shot = (f) => page.screenshot({ path: path.join(SHOTS, f) });
const ev = (fn, arg) => page.evaluate(fn, arg);
const t0 = Date.now();
await page.goto(URL0);
await ev(() => { try { localStorage.clear(); } catch (_) {} }); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 });
ok('boot + demo analysis', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
// ---- upload the test beat
const uploadAndWait = async () => { await page.setInputFiles('#file', AUDIO); const base = path.basename(AUDIO);
  await page.waitForFunction((b) => { const tr = window.u2c.store.session.track; return tr && !tr.meta.quick && tr.meta.name === b; }, base, { timeout: 120000 });
  await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.ready && window.u2c.cues.sheet.tracks.length > 0; }, null, { timeout: 120000 }); };
if (!AUDIO) ok('test beat available', false, 'pass an audio file: node tests/smoke.mjs beat.wav'); else await uploadAndWait();
const ana = await ev(() => { const tr = window.u2c.store.session.track; return { bpm: tr.bpm, t0: tr.t0, phrases: tr.song.phrases.map((q) => q.bar + ':' + q.label).join(' '), key: tr.key }; });
ok('analysis: tempo, downbeat, sections', ana.bpm > 60 && ana.phrases.includes('drop'), `${ana.bpm} BPM · bar 1 at ${ana.t0.toFixed(4)} s · ${ana.key} · ${ana.phrases}`);
await page.waitForFunction(() => window.u2c.grid.entry && window.u2c.grid.entry.ready, null, { timeout: 60000 }); await page.waitForTimeout(1500); await shot('home-1440.png');
const cards = await page.$$eval('#grid .card canvas', (cs) => cs.map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; }));
ok('home: three look cards draw the beat', cards.length === 3 && cards.every((v) => v > 60), cards.join(' / '));
// ---- studio + default cue sheet
await page.click('#grid .card >> nth=0');
await page.waitForFunction(() => !document.querySelector('#studio').hidden && window.u2c.clip.current().ready, null, { timeout: 60000 }); await page.waitForTimeout(800);
const def = await ev(() => { const s = window.u2c.cues.sheet, cam = s.tracks.find((t) => t.path === 'camera.shot'); return { n: s.tracks.length, cam: cam.keys.map((k) => `${k.b}:${k.v}`).join(' '), bars: s.meta.bars, labels: window.u2c.clip.current().labels.join(',') }; });
ok('default cue sheet from the analysis (v8 focus plan by section)', def.n >= 10 && /chains|eq|elephant|spectrum/.test(def.cam), `${def.n} tracks · ${def.bars} bars · camera ${def.cam} · sections ${def.labels}`);
// helpers to reach the timeline canvas
const cvBox = await page.$eval('#cueCv', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const keyXY = (pathName, idx) => ev(([p, i]) => { const tl = window.u2c.cuetl, rows = tl.rows(), ri = rows.findIndex((r) => r.path === p), t = rows[ri].track, k = t.keys[i];
  tl.focusRowOf(p); tl.markDirty(); tl.draw(); const r = document.querySelector('#cueCv').getBoundingClientRect(), y = 22 + 14 + ri * 24 - tl.state.vscroll + 12; return { x: r.x + tl.xOf(k.b), y: r.y + y, b: k.b, v: k.v, id: k.id }; }, [pathName, idx]);
const frameAt = (beat) => ev(async (b) => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'); const s = makeSurface(270, 480), info = {};
  app.renderFrame(p.inT + b * tr.spb, s, p, tr, { info }); const d = s.ctx.getImageData(0, 0, 270, 480).data; let sum = 0; const sig = []; for (let i = 0; i < d.length; i += 4 * 97) { sig.push(d[i] + d[i + 1] + d[i + 2]); sum += d[i]; } return { sig, cam: info.cam, look: info.look }; }, beat);
const diff = (a, b) => a.sig.reduce((s, v, i) => s + Math.abs(v - b.sig[i]), 0) / a.sig.length / 7.65;
// 1. click the first focus key on the camera lane -> it is selected in the inspector
const k0 = await keyXY('camera.shot', 0); await page.mouse.click(k0.x, k0.y); await page.waitForTimeout(150);
const sel = await ev(() => window.u2c.cuetl.selected().map(([r, k]) => r.path + ':' + k.v));
ok('UI: click a camera key selects it', sel.length === 1 && sel[0] === 'camera.shot:' + k0.v, sel.join());
const before = await frameAt(k0.b + 0.5);
// 2. retarget it in the inspector (value select) -> the preview pushes to the new window
const target = await ev(() => { const o = [...document.querySelectorAll('#insp [data-k="v"] option')].map((x) => x.value); return o.find((v) => v !== 'wide' && v !== window.u2c.cuetl.selected()[0][1].v && v !== 'chains'); });
await page.selectOption('#insp [data-k="v"]', target); await page.waitForTimeout(200);
const after = await frameAt(k0.b + 0.5), rect = await ev((id) => window.u2c.clip.film(window.u2c.clip.current(), '916').rects(window.u2c.cues.ev(), 0, window.u2c.store.project.look)[id], target);
const camOn = after.cam && rect && Math.abs(after.cam.x - (rect[0] + rect[2] / 2)) < rect[2] && after.cam.z > 1.1;
ok('UI: retarget in the inspector -> preview pushes to that window', camOn && diff(before, after) > 1, `${k0.v} → ${target} · camera ${after.cam && after.cam.x.toFixed(0)},${after.cam && after.cam.y.toFixed(0)} z ${after.cam && after.cam.z.toFixed(2)} · frame changed ${diff(before, after).toFixed(1)} %`);
await shot('studio-edit-1440.png');
// 3. drag the key one bar later (snap = beat) then undo / redo with the keyboard
const ppb = await ev(() => window.u2c.cuetl.state.ppb);
await page.mouse.move(k0.x, k0.y); await page.mouse.down(); await page.mouse.move(k0.x + ppb * 2, k0.y, { steps: 4 }); await page.mouse.move(k0.x + ppb * 4.2, k0.y, { steps: 4 }); await page.mouse.up();
const dragged = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z'); const undone = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
await page.keyboard.press('ControlOrMeta+Shift+z'); const redone = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
ok('UI: drag a key snaps to the grid; Cmd+Z / Shift+Cmd+Z', dragged === k0.b + 4 && undone === k0.b && redone === k0.b + 4, `beat ${k0.b} → ${dragged} · undo ${undone} · redo ${redone}`);
await page.keyboard.press('ControlOrMeta+z');
// 4. arrow-key nudge by the grid
await page.mouse.click(k0.x, k0.y); await page.keyboard.press('ArrowRight'); const nudged = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id); await page.keyboard.press('ControlOrMeta+z');
ok('UI: arrow nudges the selection by the grid', nudged === k0.b + 1, `beat ${k0.b} → ${nudged}`);
// 5. double-click the Text lane at bar 2 -> a text cue; type its text in the inspector; S splits it; Del deletes
const textRow = await ev(() => { const tl = window.u2c.cuetl; tl.focusRowOf('text.cue'); tl.draw(); const rows = tl.rows(), ri = rows.findIndex((r) => r.path === 'text.cue'), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + tl.xOf(4), y: r.y + 36 + ri * 24 - tl.state.vscroll + 12 }; });
await page.mouse.dblclick(textRow.x + 2, textRow.y); await page.waitForTimeout(150);
await page.fill('#insp textarea[data-k="v"]', 'LAB RESULT {bpm}'); await page.locator('#insp textarea[data-k="v"]').dispatchEvent('change');
const txt = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue'); return t.keys.map((k) => `${k.b}:${k.v}:${k.dur}`); });
const noText = await frameAt(4 + 1.5); await ev(() => {}); const tf = await frameAt(4 + 1.5);
const withText = await ev(async () => { const app = window.u2c, t = app.cues.sheet.tracks.find((x) => x.path === 'text.cue'); const k = t.keys[0]; return k.v; });
ok('UI: double-click adds a text cue, the inspector sets its text', txt.length === 1 && /LAB RESULT/.test(withText), txt.join(' | '));
const offText = await ev(async () => { const app = window.u2c, s = app.cues.sheet, t = s.tracks.find((x) => x.path === 'text.cue'), keep = t.mute; t.mute = true; app.cues.preview(() => {}); return keep; });
const muted = await frameAt(4 + 1.5); await ev(() => { const app = window.u2c, t = app.cues.sheet.tracks.find((x) => x.path === 'text.cue'); t.mute = false; app.cues.preview(() => {}); });
ok('preview reflects the text cue (typed on the grid)', diff(muted, tf) > .3, `frame difference with / without the cue ${diff(muted, tf).toFixed(2)} %`); void noText; void offText;
await ev(() => window.u2c.actions.seek(window.u2c.store.project.inT + 6 * window.u2c.store.session.track.spb)); await page.waitForTimeout(100);
await page.focus('#cueCv'); await page.keyboard.press('s'); const split = await ev(() => window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue').keys.map((k) => `${k.b}+${k.dur}`).join(' '));
ok('S splits the clip at the playhead', /^4\+2 6\+2$/.test(split), split);
await ev(() => window.u2c.cuetl.select(window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue').keys.map((k) => k.id).slice(1))); await page.keyboard.press('Delete');
const afterDel = await ev(() => window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue').keys.length);
ok('Delete removes the selected key', afterDel === 1, `${afterDel} text cue left`);
// 6. copy / paste at the playhead
await ev(() => window.u2c.cuetl.select(window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue').keys.map((k) => k.id)));
await page.keyboard.press('ControlOrMeta+c'); await ev(() => window.u2c.actions.seek(window.u2c.store.project.inT + 16 * window.u2c.store.session.track.spb)); await page.waitForTimeout(80); await page.keyboard.press('ControlOrMeta+v');
const pasted = await ev(() => window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue').keys.map((k) => k.b).join(','));
ok('Cmd+C / Cmd+V pastes at the playhead', pasted === '4,16', pasted);
// 7. add a property track from the inspector (Element -> property -> keyframe) and edit it: the window moves
await page.keyboard.press('Escape'); await page.click('.tabs [data-tab="inspect"]');
await page.selectOption('#insp [data-k="element"]', 'win.eq'); await page.waitForTimeout(100);
await page.click('#insp .prop[data-path="win.eq.x"] [data-act="kf"]'); await page.waitForTimeout(150);
const kfTrack = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'win.eq.x'); return t ? t.keys.length : 0; });
await page.fill('#insp input[type="number"][data-k="v"]', '300'); await page.locator('#insp input[type="number"][data-k="v"]').dispatchEvent('change');
const moved = await ev(() => { const app = window.u2c, f = app.clip.film(app.clip.current(), '916'), b = app.cuetl.state.playhead; return f.rects(app.cues.ev(), b + 1, app.store.project.look).eq; });
ok('Add track: keyframe any registry property (win.eq.x) and edit it', kfTrack === 1 && moved && moved[0] === 300, `track keys ${kfTrack} · eq window x = ${moved && moved[0]}`);
const regN = await ev(() => Object.keys(window.u2c.registry().byPath).length);
ok('property registry covers every element (windows, meters, brand, camera, stage colours, tags)', regN > 150, `${regN} keyframeable properties for this look`);
// 8. preset + JSON round trip
await ev(() => window.u2c.actions.applyPreset('tour')); const tour = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.length);
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z'); const back = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'win.eq.x') != null);
ok('presets (Meter tour) apply and undo', tour >= 4 && back, `tour camera keys ${tour} · undo restores the edited sheet ${back}`);
const rt = await ev(async () => { const S = await import('/src/cues/schema.js'), a = window.u2c.cues.sheet, j = JSON.stringify(S.serializeSheet(a)), b = S.parseSheet(JSON.parse(j)); const strip = (s) => JSON.stringify(s.tracks.map((t) => [t.path, t.keys.map((k) => [Math.round(k.b * 960), k.v, k.ease, k.dur ?? null])])); return { same: strip(a) === strip(b), bytes: j.length, at: JSON.parse(j).tracks[0].keys[0].at }; });
ok('cue sheet JSON export / import round trip (BAR.BEAT.TICK)', rt.same, `${rt.bytes} bytes · first key at "${rt.at}"`);
// 9. autosave per project survives a reload (same file -> same sheet)
const savedTarget = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0].v);
await page.waitForTimeout(600); await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 }); await uploadAndWait();
const restored = await ev(() => ({ cam: window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0].v, eq: !!window.u2c.cues.sheet.tracks.find((t) => t.path === 'win.eq.x') }));
ok('autosave: the edited cue sheet is restored for the same beat', restored.cam === savedTarget && restored.eq, `camera ${restored.cam} · win.eq.x track ${restored.eq}`);
await page.click('#grid .card >> nth=0'); await page.waitForFunction(() => !document.querySelector('#studio').hidden && window.u2c.clip.current().ready, null, { timeout: 60000 });
// ---- sync: scheduled events on the grid, flash on its frame, pendant extremes on the beats, camera lands on its key
const sync = await ev(async () => {
  const app = window.u2c, p = app.store.project, tr = app.store.session.track, e = app.clip.current(), film = app.clip.film(e, p.aspect), FPS = 30, spb = tr.spb, frame = 1 / FPS, sched = film.schedule(app.cues.ev(), { look: p.look, stage: p.stage });
  let worst = 0; for (const s of sched) { const g = Math.round(s.b * 32) / 32, err = Math.abs(s.b - g) * spb; if (err > worst) worst = err; }
  // flash: the inverted frame is the frame holding the key time
  const { makeSurface } = await import('/src/engine/render.js'), sf = makeSurface(108, 192), lum = (b) => { app.renderFrame(p.inT + b, sf, p, tr, { fps: FPS }); const d = sf.ctx.getImageData(0, 0, 108, 192).data; let s = 0; for (let i = 0; i < d.length; i += 16) s += d[i]; return s / (d.length / 16); };
  const fl = app.cues.sheet.tracks.find((t) => t.path === 'fx.flash'), fk = fl && fl.keys[0]; let flash = null;
  if (fk) { const f0 = Math.floor(fk.b * spb * FPS + 1e-6), L = [-2, -1, 0, 1, 2].map((d) => lum((f0 + d) / FPS)), mx = L.indexOf(Math.max(...L)); flash = { off: mx - 2, ratio: L[2] / Math.max(1, (L[1] + L[3]) / 2) }; }
  // pendant: |theta| peaks within 1 frame of every beat
  let pw = 0, pn = 0; const per = app.cues.ev().value('pendant.period', 0, 2);
  for (let k = 1; k < e.bars * 4 - 1; k++) { const tb = k * per / 2 * spb; if (tb > e.D.duration - .1) break; let best = -1, bf = 0; for (let f = Math.round(tb * FPS) - 4; f <= Math.round(tb * FPS) + 4; f++) { const th = Math.abs(film.trace(f / FPS, app.cues.ev()).th); if (th > best) { best = th; bf = f; } } pw = Math.max(pw, Math.abs(bf / FPS + .5 / FPS - tb) * FPS); pn++; }
  // camera: at the landing frame the zoom has reached the shot's framing
  const cam = app.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.find((k) => k.v !== 'wide'); let land = null;
  if (cam) { const info = {}, info2 = {}, f = Math.ceil(cam.b * spb * FPS - .5); app.renderFrame(p.inT + f / FPS, sf, p, tr, { info, fps: FPS }); app.renderFrame(p.inT + (f + 3) / FPS, sf, p, tr, { info: info2, fps: FPS }); land = { z: info.cam.z, z3: info2.cam.z }; }
  const onsets = e.D.onsets.kick.every(([, , tq]) => Math.abs(tq - Math.round(tq / (spb / 4)) * (spb / 4)) < 1e-5);
  return { n: sched.length, worst: worst / frame, flash, pw, pn, land, onsets };
});
ok('sync: every scheduled event on the 32nd grid within 1 frame', sync.n > 100 && sync.worst <= 1, `${sync.n} events · worst ${sync.worst.toFixed(3)} frame`);
ok('sync: the 1-frame invert lands on its key frame', sync.flash && sync.flash.off === 0 && sync.flash.ratio > 1.5, sync.flash ? `peak at offset ${sync.flash.off} frame, ${sync.flash.ratio.toFixed(1)}x brighter than its neighbours` : 'no flash key');
ok('sync: pendant extremes within 1 frame of the beats', sync.pn > 8 && sync.pw <= 1 + 1e-6, `${sync.pn} extremes · worst ${sync.pw.toFixed(2)} frame`);
ok('sync: camera push lands on its key (zoom settled at the landing frame)', sync.land && Math.abs(sync.land.z - sync.land.z3) < 0.01 && sync.land.z > 1.1, sync.land ? `z ${sync.land.z.toFixed(3)} at landing, ${sync.land.z3.toFixed(3)} three frames later` : 'no focus key');
ok('sync: kick onsets quantised to the 16th grid', sync.onsets);
// ---- NIGREDO grey + every look renders
const grey = await ev(async () => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'), s = makeSurface(540, 960); let mx = 0;
  for (const b of [2.5, 9.5, 21.5]) { app.renderFrame(p.inT + b * tr.spb, s, { ...p, stage: 'nigredo' }, tr, {}); const d = s.ctx.getImageData(0, 0, 540, 960).data; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2])); } return mx; });
ok('NIGREDO is greys only (max |R-G|, |G-B|)', grey <= 2, String(grey));
// ---- screenshots: studio + timeline at 1440x900
await ev(() => { window.u2c.cuetl.clearSel(); window.u2c.actions.seek(window.u2c.store.project.inT + 13 * window.u2c.store.session.track.spb); }); await page.waitForTimeout(400);
await shot('studio-1440.png'); await page.locator('#dock').screenshot({ path: path.join(SHOTS, 'timeline-1440.png') });
await page.locator('#cueCv').click({ position: { x: 300, y: 50 } });
// ---- 4-bar export
if (!process.env.NOEXPORT) {
  await ev(() => { const tr = window.u2c.store.session.track, p = window.u2c.store.project; window.u2c.actions.setClip(p.inT, p.inT + 4 * tr.barDur, 'test'); });
  await page.waitForFunction(() => window.u2c.clip.current().ready, null, { timeout: 60000 });
  await page.click('.tabs [data-tab="export"]'); const t1 = Date.now(); await page.click('#exBtn');
  await page.waitForSelector('#results .res', { timeout: 900000 });
  const res = await page.$eval('#results .res', (el) => ({ size: +el.dataset.size, name: el.querySelector('b').textContent, info: el.querySelector('span').textContent }));
  ok('export (4 bars, offline encoder)', res.size > 10000, `${res.name} · ${res.info} · wall ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  const b64 = await page.$eval('#results .res video', async (v) => { const b = await (await fetch(v.src)).blob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }); });
  const mp4 = path.join(SHOTS, res.name); fs.writeFileSync(mp4, Buffer.from(b64, 'base64'));
  try { const want = await ev(() => { const p = window.u2c.store.project; return p.outT - p.inT; });
    const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames,r_frame_rate:format=duration,format_name', '-of', 'json', mp4]).toString());
    const v = pr.streams.find((s) => s.codec_type === 'video'), a = pr.streams.find((s) => s.codec_type === 'audio'), dur = +pr.format.duration;
    ok('ffprobe: valid MP4 of the 4-bar section', /mp4/.test(pr.format.format_name) && v && a && Math.abs(dur - want) < .1 && Math.abs(+v.nb_read_frames - Math.round(want * 30)) <= 1, `${pr.format.format_name} · ${v.codec_name} ${v.width}×${v.height} ${v.nb_read_frames} frames @ ${v.r_frame_rate} · ${a.codec_name} · ${dur.toFixed(3)} s (section ${want.toFixed(3)} s)`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'select=not(mod(n\\,30)),scale=180:-2,tile=8x1', '-frames:v', '1', path.join(SHOTS, 'export-strip.png')]);
  } catch (e) { ok('ffprobe', false, e.message.slice(0, 200)); }
  await shot('export-1440.png');
}
// ---- phone 390x844: collapsed lanes, tap a key -> bottom sheet
await page.setViewportSize({ width: 390, height: 844 }); await page.click('.tabs [data-tab="inspect"]'); await page.waitForTimeout(600);
const collapsed = await ev(() => window.u2c.cuetl.state.collapsed);
await page.locator('#cueCv').scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await shot('studio-390.png');
const tap = await ev(() => { const tl = window.u2c.cuetl, k = window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0], r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + tl.xOf(k.b), y: r.y + 60 }; });
await page.mouse.click(tap.x, tap.y); await page.waitForTimeout(400);
const sheet = await ev(() => ({ sel: window.u2c.cuetl.selected().length, inSheet: !!document.querySelector('#sheetBody #insp'), vis: getComputedStyle(document.querySelector('#sheet')).transform }));
await shot('timeline-390.png');
ok('phone: lanes collapse, tap selects, inspector opens as a bottom sheet', collapsed && sheet.sel >= 1 && sheet.inSheet, `collapsed ${collapsed} · selected ${sheet.sel} · sheet ${sheet.inSheet}`);
await page.click('#sheetClose'); const overflow = await ev(() => document.documentElement.scrollWidth - window.innerWidth);
ok('phone width: no horizontal scroll', overflow <= 0, 'overflow ' + overflow + 'px');
await page.click('#backBtn'); await page.waitForTimeout(500); await shot('home-390.png');
const real = errors.filter((e) => !/favicon/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close(); if (server) server.close();
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
