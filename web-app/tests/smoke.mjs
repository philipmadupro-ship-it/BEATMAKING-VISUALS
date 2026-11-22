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
await page.evaluate(() => { const c = document.querySelectorAll('#grid .card'); if (c.length) c[c.length - 1].scrollIntoView({ block: 'center' }); }); await page.waitForFunction(() => { const c = document.querySelectorAll('#grid .card canvas'); const l = c[c.length - 1]; if (!l) return false; const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn > 60; }, null, { timeout: 45000 }).catch(() => {});   // v14: four looks, the last may sit below the fold
const cards = await page.$$eval('#grid .card canvas', (cs) => cs.map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; }));
ok('home: five player preset cards draw the beat', cards.length === 5 && cards.every((v) => v > 60), cards.join(' / '));
// ---- studio + default cue sheet
await page.click('#grid .card >> nth=0');
await page.waitForFunction(() => !document.querySelector('#studio').hidden && window.u2c.clip.current().ready, null, { timeout: 60000 }); await page.waitForTimeout(800);
const def = await ev(() => { const s = window.u2c.cues.sheet, cam = s.tracks.find((t) => t.path === 'camera.shot'); return { n: s.tracks.length, cam: cam.keys.map((k) => `${k.b}:${k.v}`).join(' '), bars: s.meta.bars, labels: window.u2c.clip.current().labels.join(',') }; });
ok('default cue sheet from the analysis (v8 focus plan by section)', def.n >= 10 && /chains|eq|elephant|spectrum|stage|session|inserts/.test(def.cam), `${def.n} tracks · ${def.bars} bars · camera ${def.cam} · sections ${def.labels}`);
// helpers to reach the timeline canvas
const cvBox = await page.$eval('#cueCv', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const keyXY = (pathName, idx) => ev(([p, i]) => { const tl = window.u2c.cuetl, t = tl.rows().find((r) => r.path === p).track, k = t.keys[i], pt = tl.pointOf(p, k.b), r = document.querySelector('#cueCv').getBoundingClientRect();
  return { x: r.x + pt.x, y: r.y + pt.y, b: k.b, v: k.v, id: k.id }; }, [pathName, idx]);
const frameAt = (beat) => ev(async (b) => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'); const s = makeSurface(270, 480), info = {};
  app.renderFrame(p.inT + b * tr.spb, s, p, tr, { info }); const d = s.ctx.getImageData(0, 0, 270, 480).data; let sum = 0; const sig = []; for (let i = 0; i < d.length; i += 4 * 97) { sig.push(d[i] + d[i + 1] + d[i + 2]); sum += d[i]; } return { sig, cam: info.cam, look: info.look }; }, beat);
const diff = (a, b) => a.sig.reduce((s, v, i) => s + Math.abs(v - b.sig[i]), 0) / a.sig.length / 7.65;
// 1. click the first focus key on the camera lane -> it is selected in the inspector
const k0 = await keyXY('camera.shot', 0); await page.mouse.click(k0.x, k0.y); await page.waitForTimeout(150);
const sel = await ev(() => window.u2c.cuetl.selected().map(([r, k]) => r.path + ':' + k.v));
ok('UI: click a camera key selects it', sel.length === 1 && sel[0] === 'camera.shot:' + k0.v, sel.join());
const before = await frameAt(k0.b + 0.5);
// 2. retarget it in the inspector (value select) -> the preview pushes to the new window
const target = await ev(() => { const o = [...document.querySelectorAll('#insp [data-k="v"] option')].map((x) => x.value); const cur = window.u2c.cuetl.selected()[0][1].v; return o.includes('spectrum') && cur !== 'spectrum' ? 'spectrum' : o.find((v) => v !== 'wide' && v !== cur && v !== 'chains'); });   // v9: session + chains are both full width (same framing): prefer a half-width window
await page.selectOption('#insp [data-k="v"]', target); await page.waitForTimeout(200);
const after = await frameAt(k0.b + 0.5), rect = await ev((id) => window.u2c.clip.film(window.u2c.clip.current(), '916').rects(window.u2c.cues.ev(), 0, window.u2c.store.project.look)[id], target);
const camOn = after.cam && rect && Math.abs(after.cam.x - (rect[0] + rect[2] / 2)) < rect[2] && after.cam.z > 1.02;   // v23: the player frames the whole panel (zoom >= 1)
ok('UI: retarget in the inspector -> preview pushes to that window', camOn && diff(before, after) > 1, `${k0.v} → ${target} · camera ${after.cam && after.cam.x.toFixed(0)},${after.cam && after.cam.y.toFixed(0)} z ${after.cam && after.cam.z.toFixed(2)} · frame changed ${diff(before, after).toFixed(1)} %`);
await shot('studio-edit-1440.png');
// 3. drag the key one bar later (snap = beat) then undo / redo with the keyboard
await page.click('#magnetBtn'); const magOff = await ev(() => window.u2c.store.project.timeline.magnet === false);   // grid-only drag first (magnet tested below)
const ppb = await ev(() => window.u2c.cuetl.state.ppb);
await page.mouse.move(k0.x, k0.y); await page.mouse.down(); await page.mouse.move(k0.x + ppb * 2, k0.y, { steps: 4 }); await page.mouse.move(k0.x + ppb * 4.2, k0.y, { steps: 4 }); await page.mouse.up();
const dragged = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z'); const undone = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
await page.keyboard.press('ControlOrMeta+Shift+z'); const redone = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id);
await page.click('#magnetBtn');
ok('UI: drag a key snaps to the grid; Cmd+Z / Shift+Cmd+Z', magOff && dragged === k0.b + 4 && undone === k0.b && redone === k0.b + 4, `beat ${k0.b} → ${dragged} · undo ${undone} · redo ${redone}`);
await page.keyboard.press('ControlOrMeta+z');
// 4. arrow-key nudge by the grid
await page.mouse.click(k0.x, k0.y); await page.keyboard.press('ArrowRight'); const nudged = await ev((id) => window.u2c.cuetl.findKey(id)[1].b, k0.id); await page.keyboard.press('ControlOrMeta+z');
ok('UI: arrow nudges the selection by the grid', nudged === k0.b + 1, `beat ${k0.b} → ${nudged}`);
// 5. double-click the Text lane at bar 2 -> a text cue; type its text in the inspector; S splits it; Del deletes
const textRow = await ev(() => { const tl = window.u2c.cuetl, pt = tl.pointOf('text.cue', 4), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + pt.x, y: r.y + pt.y }; });
await page.mouse.dblclick(textRow.x + 2, textRow.y); await page.waitForTimeout(150);
await page.fill('#insp textarea[data-k="v"]', 'LAB RESULT {bpm}'); await page.locator('#insp textarea[data-k="v"]').dispatchEvent('change');
const txt = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'text.cue'); return t.keys.map((k) => `${k.b}:${k.v}:${k.dur}`); });
const tf = await frameAt(4 + 1.5);
const withText = await ev(async () => { const app = window.u2c, t = app.cues.sheet.tracks.find((x) => x.path === 'text.cue'); const k = t.keys[0]; return k.v; });
ok('UI: double-click adds a text cue, the inspector sets its text', txt.length === 1 && /LAB RESULT/.test(withText), txt.join(' | '));
await ev(() => { const app = window.u2c, t = app.cues.sheet.tracks.find((x) => x.path === 'text.cue'); t.mute = true; app.cues.preview(() => {}); });
const muted = await frameAt(4 + 1.5); await ev(() => { const app = window.u2c, t = app.cues.sheet.tracks.find((x) => x.path === 'text.cue'); t.mute = false; app.cues.preview(() => {}); });
ok('preview reflects the text cue (typed on the grid)', diff(muted, tf) > .3, `frame difference with / without the cue ${diff(muted, tf).toFixed(2)} %`);
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
await page.selectOption('#insp [data-k="element"]', 'win.spectrum'); await page.waitForTimeout(100);
await page.click('#insp .prop[data-path="win.spectrum.x"] [data-act="kf"]'); await page.waitForTimeout(150);
const kfTrack = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'win.spectrum.x'); return t ? t.keys.length : 0; });
await page.fill('#insp input[type="number"][data-k="v"]', '300'); await page.locator('#insp input[type="number"][data-k="v"]').dispatchEvent('change');
const moved = await ev(() => { const app = window.u2c, f = app.clip.film(app.clip.current(), '916'), b = app.cuetl.state.playhead; return f.rects(app.cues.ev(), b + 1, app.store.project.look).spectrum; });
ok('Add track: keyframe any registry property (win.spectrum.x) and edit it', kfTrack === 1 && moved && moved[0] === 300, `track keys ${kfTrack} · spectrum window x = ${moved && moved[0]}`);
const regN = await ev(() => Object.keys(window.u2c.registry().byPath).length);
ok('property registry covers every element (windows, meters, brand, camera, stage colours, tags)', regN > 150, `${regN} keyframeable properties for this look`);
// 8. preset + JSON round trip
await ev(() => window.u2c.actions.applyPreset('tour')); const tour = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.length);
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z'); const back = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'win.spectrum.x') != null);
ok('presets (Meter tour) apply and undo', tour >= 4 && back, `tour camera keys ${tour} · undo restores the edited sheet ${back}`);
const rt = await ev(async () => { const S = await import('/src/cues/schema.js'), a = window.u2c.cues.sheet, j = JSON.stringify(S.serializeSheet(a)), b = S.parseSheet(JSON.parse(j)); const strip = (s) => JSON.stringify(s.tracks.map((t) => [t.path, t.keys.map((k) => [Math.round(k.b * 960), k.v, k.ease, k.dur ?? null])])); return { same: strip(a) === strip(b), bytes: j.length, at: JSON.parse(j).tracks[0].keys[0].at }; });
ok('cue sheet JSON export / import round trip (BAR.BEAT.TICK)', rt.same, `${rt.bytes} bytes · first key at "${rt.at}"`);
// 9. autosave per project survives a reload (same file -> same sheet)
const savedTarget = await ev(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0].v);
await page.waitForTimeout(600); await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 }); await uploadAndWait();
const restored = await ev(() => ({ cam: window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0].v, eq: !!window.u2c.cues.sheet.tracks.find((t) => t.path === 'win.spectrum.x') }));
ok('autosave: the edited cue sheet is restored for the same beat', restored.cam === savedTarget && restored.eq, `camera ${restored.cam} · win.spectrum.x track ${restored.eq}`);
await page.click('#grid .card >> nth=0'); await page.waitForFunction(() => !document.querySelector('#studio').hidden && window.u2c.clip.current().ready, null, { timeout: 60000 });
// ---- sync: scheduled events on the grid, flash on its frame, pendant extremes on the beats, camera lands on its key
const syncEval = () => ev(async () => {
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
const sync = await syncEval();
ok('sync: every scheduled event on the 32nd grid within 1 frame', sync.n > 100 && sync.worst <= 1, `${sync.n} events · worst ${sync.worst.toFixed(3)} frame`);
ok('sync: the 1-frame invert lands on its key frame (off by default since v14)', !sync.flash || sync.flash.off === 0 && sync.flash.ratio > 1.5, sync.flash ? `peak at offset ${sync.flash.off} frame, ${sync.flash.ratio.toFixed(1)}x brighter than its neighbours` : 'no flash key');
ok('sync: pendant extremes within 1 frame of the beats', sync.pn > 8 && sync.pw <= 1 + 1e-6, `${sync.pn} extremes · worst ${sync.pw.toFixed(2)} frame`);
ok('sync: camera push lands on its key (zoom settled at the landing frame)', sync.land && Math.abs(sync.land.z - sync.land.z3) < 0.01 && sync.land.z > 1.1, sync.land ? `z ${sync.land.z.toFixed(3)} at landing, ${sync.land.z3.toFixed(3)} three frames later` : 'no focus key');
ok('sync: kick onsets quantised to the 16th grid', sync.onsets);
// ---- NIGREDO grey + every look renders
const grey = await ev(async () => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'), s = makeSurface(540, 960); let mx = 0;
  for (const b of [2.5, 9.5, 21.5]) { app.renderFrame(p.inT + b * tr.spb, s, { ...p, stage: 'nigredo' }, tr, {}); const d = s.ctx.getImageData(0, 0, 540, 960).data; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2])); } return mx; });
ok('NIGREDO is greys only (max |R-G|, |G-B|)', grey <= 2, String(grey));
// ---- timeline v2: the ranked 12 through the UI (keys, mouse, toolbar, inspector)
const cvR = () => ev(() => { const r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x, y: r.y }; });
const tlEv = (fn, arg) => ev(fn, arg);
const clickHead = async (p, part) => { const o = await cvR(), pt = await tlEv(([p, part]) => window.u2c.cuetl.headPoint(p, part), [p, part]); await page.mouse.click(o.x + pt.x, o.y + pt.y); await page.waitForTimeout(60); };
const seekB = (b) => tlEv((b) => { const a = window.u2c; a.actions.seek(a.store.project.inT + Math.round(b * a.store.session.track.spb * 30) / 30); a.cuetl.setTime(b * a.store.session.track.spb); }, b);
const HF = 0.05;   // half a frame in beats at 128 BPM is 0.036: the playhead sits on frames
const pend = () => tlEv(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'pendant.amp').keys.map((k) => ({ id: k.id, b: k.b, v: k.v, ty: k.ty, ob: k.ob, ib: k.ib, ease: k.ease })));
await page.keyboard.press('Escape'); await ev(() => window.u2c.cuetl.clearSel());
// 0. laptop fit: every lane reachable at 1440x900 (compact rows + folded groups), no vertical scrolling needed
const fit0 = await tlEv(() => ({ fit: window.u2c.cuetl.lanesFit(), compact: window.u2c.cuetl.compact, rows: window.u2c.cuetl.rows().map((r) => r.path + ':' + r.h).join(' ') }));
ok('laptop: all lanes fit the dock (compact rows, folded groups)', fit0.fit, `${fit0.compact ? 'compact' : 'normal'} · ${fit0.rows}`);
// v23.3 Alt-drag a camera shot onto another: the windows swap, the times stay (one undo step)
{ const before = await tlEv(() => { const t = window.u2c.cues.sheet.tracks.find((q) => q.path === 'camera.shot'), K = t.keys.filter((k) => k.b > 0); const i = K.findIndex((k, j) => j < K.length - 1 && K[j + 1].v !== k.v); return i < 0 ? null : { a: K[i].id, b: K[i + 1].id, va: K[i].v, vb: K[i + 1].v, ba: K[i].b, bb: K[i + 1].b }; });
  let swapOk = false, info = 'no two different shots';
  if (before) { const o = await cvR(), pa = await tlEv((id) => window.u2c.cuetl.keyPoint(id), before.a), pb = await tlEv((id) => window.u2c.cuetl.keyPoint(id), before.b);
    if (pa && pb) { await page.keyboard.down('Alt'); await page.mouse.move(o.x + pa.x, o.y + pa.y); await page.mouse.down(); await page.mouse.move(o.x + pb.x, o.y + pb.y, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Alt'); await page.waitForTimeout(150);
      const after = await tlEv((q) => { const K = window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys, A = K.find((k) => k.id === q.a), B = K.find((k) => k.id === q.b); return { va: A.v, vb: B.v, ba: A.b, bb: B.b }; }, before);
      swapOk = after.va === before.vb && after.vb === before.va && Math.abs(after.ba - before.ba) < 1e-6 && Math.abs(after.bb - before.bb) < 1e-6; info = `${before.va}/${before.vb} -> ${after.va}/${after.vb} · times ${after.ba},${after.bb}`;
      await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z'); await page.waitForTimeout(100); } else info = 'keys not on screen'; }
  ok('timeline: Alt-drag a camera shot onto another swaps the windows, times stay', swapOk, info); }
// v24 drag a push shot's start edge = its move length (dur); the History panel lists the step and jumping back restores it
{ const k0 = await tlEv(() => { const t = window.u2c.cues.sheet.tracks.find((q) => q.path === 'camera.shot'), k = t.keys.find((q) => q.b > 4 && q.transition !== 'cut' && (q.dur ?? 1) >= 1); return k ? { id: k.id, b: k.b, dur: k.dur ?? 1 } : null; });
  let lenOk = false, histOk = false, info2 = 'no push shot';
  if (k0) { const o = await cvR(), kp = await tlEv((id) => window.u2c.cuetl.keyPoint(id), k0.id), ppb = await tlEv(() => window.u2c.cuetl.state.ppb), xs = o.x + kp.x - k0.dur * ppb;
    await page.mouse.move(xs, o.y + kp.y); await page.mouse.down(); await page.mouse.move(xs - ppb, o.y + kp.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
    const k1 = await tlEv((id) => { const k = window.u2c.cues.sheet.tracks.find((q) => q.path === 'camera.shot').keys.find((q) => q.id === id); return { b: k.b, dur: k.dur }; }, k0.id);
    lenOk = Math.abs(k1.b - k0.b) < 1e-6 && Math.abs(k1.dur - (k0.dur + 1)) < 0.26;
    const h = await ev(() => window.u2c.cues.history()); await page.click('#railTabs [data-pane="history"]'); const n = await ev(() => document.querySelectorAll('#histItems li').length);
    await page.click('#histItems li:nth-last-child(2) button'); await page.waitForTimeout(100);
    const k2 = await tlEv((id) => (window.u2c.cues.sheet.tracks.find((q) => q.path === 'camera.shot').keys.find((q) => q.id === id) || {}).dur ?? 1, k0.id);
    histOk = /move length/.test(h.past[h.past.length - 1] || '') && n >= 2 && Math.abs(k2 - k0.dur) < 1e-6; await ev(() => window.u2c.cues.redo()); await ev(() => window.u2c.cues.undo());
    info2 = `dur ${k0.dur} -> ${k1.dur} (land ${k1.b}) · history "${h.past[h.past.length - 1]}" ${n} rows · jump back dur ${k2}`; await page.click('#railTabs [data-pane="layers"]'); }
  ok('timeline: drag a camera move start edge = move length; History lists it and jumps back', lenOk && histOk, info2); }
// 1. previous / next key: click the Pendant lane header, ] from bar 1 lands on its next key, [ comes back
await seekB(0.5); await clickHead('pendant.amp', 'label'); await page.focus('#cueCv'); await seekB(0.5);
const P0 = await pend(); await page.keyboard.press(']'); const n1 = await tlEv(() => ({ ph: window.u2c.cuetl.state.playhead, sel: window.u2c.cuetl.selected().map(([r, k]) => r.path + '@' + k.b) }));
await page.keyboard.press('['); const n0 = await tlEv(() => window.u2c.cuetl.state.playhead);
await clickHead('pendant.amp', 'next'); const n2 = await tlEv(() => window.u2c.cuetl.state.playhead);
ok('1. ] / [ jump to the next / previous key of the focused lane (and the header ‹ ›)', Math.abs(n1.ph - P0[1].b) < HF && n1.sel[0] === 'pendant.amp@' + P0[1].b && Math.abs(n0 - P0[0].b) < HF && Math.abs(n2 - P0[1].b) < HF, `next ${n1.ph} (${n1.sel}) · prev ${n0} · header › ${n2}`);
// 3. markers: the strip holds the analysis (kicks, snares, downbeats, sections); click one to jump; M adds one; Shift+] walks them
const mk = await tlEv(() => { const M = window.u2c.cuetl.markers(); const c = {}; for (const m of M) c[m.kind] = (c[m.kind] || 0) + 1; const kick = M.find((m) => m.kind === 'kick' && m.b > 6 && m.b % 1 !== 0) || M.find((m) => m.kind === 'kick' && m.b > 6); return { c, kick: kick && kick.b }; });
const o0 = await cvR(), kx = await tlEv((b) => ({ x: window.u2c.cuetl.xOf(b), y: window.u2c.cuetl.markerY() }), mk.kick);
await page.mouse.click(o0.x + kx.x, o0.y + kx.y); const jumped = await tlEv(() => window.u2c.cuetl.state.playhead);
const dens0 = await tlEv(() => window.u2c.store.project.timeline.density); await page.mouse.click(o0.x + 40, o0.y + kx.y); const dens1 = await tlEv(() => window.u2c.store.project.timeline.density); await tlEv(() => window.u2c.cuetl.setDensity('fewer'));
await seekB(8); await page.focus('#cueCv'); await page.keyboard.press('m'); const um = await tlEv(() => window.u2c.cues.sheet.markers);
await seekB(0); await page.keyboard.press('Shift+BracketRight'); const nm = await tlEv(() => window.u2c.cuetl.state.playhead);
ok('3. marker strip from the analysis; click jumps; density cycles; M adds a marker; Shift+] next marker', mk.c.kick > 3 && mk.c.section >= 1 && mk.c.downbeat > 3 && Math.abs(jumped - mk.kick) < HF && dens1 !== dens0 && um && um.length === 1 && um[0].b === 8 && nm > 0,
  `${JSON.stringify(mk.c)} · clicked kick at ${mk.kick} -> playhead ${jumped.toFixed(3)} · density ${dens0}->${dens1} · marker at ${um && um[0].b} · Shift+] -> ${nm}`);
// 2. object snapping: drag the pendant key near a kick marker: it lands ON the marker (magnet), guide line shown while dragging; Alt drags free
await page.keyboard.press('Escape');
const snapT = await tlEv(() => { const M = window.u2c.cuetl.markers().filter((m) => (m.kind === 'kick' || m.kind === 'snare') && m.b > 1.2 && m.b < 3.6); return M.length ? M[0].b : null; }) ?? mk.kick;
const kp = await tlEv((id) => window.u2c.cuetl.keyPoint(id), P0[1].id), pp = await tlEv(() => window.u2c.cuetl.state.ppb), o1 = await cvR();
await page.mouse.move(o1.x + kp.x, o1.y + kp.y); await page.mouse.down(); const dx = (snapT - P0[1].b) * pp + 0.18 * pp; await page.mouse.move(o1.x + kp.x + dx / 2, o1.y + kp.y, { steps: 3 }); await page.mouse.move(o1.x + kp.x + dx, o1.y + kp.y, { steps: 3 });
const guide = await tlEv(() => window.u2c.cuetl.state.guide); await page.mouse.up(); const snapped = (await pend()).find((k) => k.id === P0[1].id).b;
await page.keyboard.press('ControlOrMeta+z');
ok('2. magnet: a dragged key snaps to the marker (sorted snap model, guide line)', Math.abs(snapped - snapT) < 1e-6 && guide && guide.kind === 'marker', `dropped ${(P0[1].b + dx / pp).toFixed(3)} -> ${snapped} (marker ${snapT}) · guide ${guide && guide.kind}`);
// 6. quantise: put the key off-grid (Alt drag, no snap), press Q -> on the nearest marker; Shift+Q -> the grid
const kp2 = await tlEv((id) => window.u2c.cuetl.keyPoint(id), P0[1].id); await page.keyboard.down('Alt'); await page.mouse.move(o1.x + kp2.x, o1.y + kp2.y); await page.mouse.down(); await page.mouse.move(o1.x + kp2.x + 2.13 * pp, o1.y + kp2.y, { steps: 3 }); await page.mouse.up(); await page.keyboard.up('Alt');
const off = (await pend()).find((k) => k.id === P0[1].id).b; await page.focus('#cueCv'); await page.keyboard.press('q'); const qm = (await pend()).find((k) => k.id === P0[1].id).b;
const near = await tlEv((b) => { const M = window.u2c.cuetl.markers().filter((m) => m.kind !== 'hat'); let best = null; for (const m of M) if (best == null || Math.abs(m.b - b) < Math.abs(best - b)) best = m.b; return best; }, off);
await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('Shift+q'); const qg = (await pend()).find((k) => k.id === P0[1].id).b; await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+z');
ok('6. Q quantises selected keys to the nearest marker, Shift+Q to the grid', Math.abs(off - P0[1].b) > 1 && Math.abs(qm - near) < 1e-6 && Math.abs(qg - Math.round(off)) < 1e-6, `${off.toFixed(4)} -> marker ${qm} · grid ${qg}`);
// 4. lanes: G expands the focused lane, drag its bottom edge, chevron folds a group, lock / solo / mute from the header
await tlEv(() => window.u2c.cuetl.clearSel()); await clickHead('pendant.amp', 'label'); await page.focus('#cueCv'); await page.keyboard.press('g'); const hG = await tlEv(() => window.u2c.cuetl.rows().find((r) => r.path === 'pendant.amp').h);
const rz = await tlEv(() => window.u2c.cuetl.headPoint('pendant.amp', 'resize')), o2 = await cvR(); await page.mouse.move(o2.x + 60, o2.y + rz.y); await page.mouse.down(); await page.mouse.move(o2.x + 60, o2.y + rz.y + 20, { steps: 3 }); await page.mouse.up();
const hR = await tlEv(() => window.u2c.cuetl.rows().find((r) => r.path === 'pendant.amp').h);
await tlEv(() => window.u2c.cuetl.focusRowOf('logo.cycle')); const chev0 = await tlEv(() => window.u2c.cuetl.rows().some((r) => r.summary && r.group === 'logo')); await clickHead('logo.cycle', 'chevron'); const chev1 = await tlEv(() => window.u2c.cuetl.rows().some((r) => r.summary && r.group === 'logo'));
const camK = await keyXY('camera.shot', 0); await clickHead('camera.shot', 'L'); await page.mouse.click(camK.x, camK.y); const lockSel = await tlEv(() => window.u2c.cuetl.selected().length); const lk = await tlEv(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').lock); await clickHead('camera.shot', 'L');
await clickHead('pendant.amp', 'S'); const solo = await tlEv(() => ({ s: window.u2c.cues.ev().soloing, cam: window.u2c.cues.ev().tracksOf('camera.shot').length, p: window.u2c.cues.ev().tracksOf('pendant.amp').length })); await clickHead('pendant.amp', 'S');
await clickHead('pendant.amp', 'M'); const mute = await tlEv(() => window.u2c.cues.ev().tracksOf('pendant.amp').length); await clickHead('pendant.amp', 'M');
ok('4. lanes: G expands, drag resizes, chevron folds a group, lock blocks selection, solo isolates, mute', hG >= 80 && hR > hG + 10 && chev0 !== chev1 && lk && lockSel === 0 && solo.s && solo.cam === 0 && solo.p === 1 && mute === 0,
  `G ${hG}px · drag ${hR}px · logo folded ${chev0}->${chev1} · locked click selects ${lockSel} · solo: camera tracks ${solo.cam}, pendant ${solo.p} · muted pendant tracks ${mute}`);
if (chev1) await clickHead('logo.cycle', 'chevron');
// 5. value curve: the expanded lane draws the evaluated curve (pixels on the line where the evaluator says)
const curve = await ev(() => { const app = window.u2c, tl = app.cuetl, K = app.cues.sheet.tracks.find((t) => t.path === 'pendant.amp').keys, b = K[2] ? (K[1].b + K[2].b) / 2 + 0.3 : K[1].b + 4.3, v = app.cues.ev().value('pendant.amp', b, 0), y = tl.valueY('pendant.amp', v), x = Math.round(tl.xOf(b)), cv = document.querySelector('#cueCv'), d = Math.min(2, devicePixelRatio || 1), g = cv.getContext('2d');
  const col = g.getImageData(x * d, 0, 1, cv.height).data; let best = -1, by = 0; const r = tl.rows().find((q) => q.path === 'pendant.amp'); for (let yy = 0; yy < cv.height; yy++) { const l = col[yy * 4] + col[yy * 4 + 1] + col[yy * 4 + 2]; if (Math.abs(yy / d - y) < 40 && l > best) { best = l; by = yy / d; } } return { y, by, best, v }; });
ok('5. value curve in the number lane follows the evaluator', curve.best > 300 && Math.abs(curve.by - curve.y) <= 3, `value ${curve.v.toFixed(2)} drawn at y ${curve.by} (expected ${curve.y.toFixed(1)}) · brightness ${curve.best}`);
// 7. bezier: pick "Bezier" in the inspector, drag the out handle, the evaluator follows the monotone cubic; golden table; graph view (E)
const P1 = await pend(); await tlEv((id) => window.u2c.cuetl.select([id]), P1[0].id); await page.selectOption('#insp [data-k="interp"]', 'bezier'); await page.waitForTimeout(100);
const hp = await tlEv((id) => window.u2c.cuetl.keyPoint(id), P1[0].id), o3 = await cvR();
await page.mouse.move(o3.x + hp.handles.out[0], o3.y + hp.handles.out[1]); await page.mouse.down(); await page.mouse.move(o3.x + hp.x + 2, o3.y + hp.handles.out[1] - 30, { steps: 4 }); await page.mouse.up();
const bz = await ev(async () => { const S = await import('/src/cues/schema.js'), app = window.u2c, K = app.cues.sheet.tracks.find((t) => t.path === 'pendant.amp').keys, k = K[0], nx = K[1], ib = nx.ib || [-1 / 3, -1 / 3], b = k.b + (nx.b - k.b) * 0.25;
  const want = +k.v + (+nx.v - +k.v) * S.bezierAt(k.ob[0], k.ob[1], 1 + ib[0], 1 + ib[1], 0.25), got = app.cues.ev().value('pendant.amp', b, 0);
  const gold = [[[.25, .1, .25, 1], .5, .8024], [[.42, 0, .58, 1], .5, .5], [[.42, 0, .58, 1], .25, .1292], [[0, 0, 1, 1], .3, .3], [[.34, 1.56, .64, 1], .5, 1.0874]].map(([c, u, y]) => Math.abs(S.bezierAt(...c, u) - y) < 2e-3);
  let mono = true, prev = -1; for (let u = 0; u <= 1.0001; u += 0.01) { const y = S.bezierAt(.9, 0, .1, 1, u); if (y < prev - 1e-9) mono = false; prev = y; }
  return { ty: k.ty, ob: k.ob, want, got, gold: gold.every(Boolean), mono, glyph: app.cuetl.findKey(k.id) && k.ty }; });
await page.focus('#cueCv'); await page.keyboard.press('e'); const graph = await tlEv(() => ({ rows: window.u2c.cuetl.rows().length, h: window.u2c.cuetl.rows()[0].h, path: window.u2c.cuetl.state.graph })); await page.waitForTimeout(200);
await page.locator('#dock').screenshot({ path: path.join(SHOTS, 'graph-1440.png') }); await page.keyboard.press('e');
await page.keyboard.press('b'); const cyc = (await pend())[0].ty; await page.keyboard.press('ControlOrMeta+z');
ok('7. bezier: inspector type + handle drag shape the curve (monotone solver, golden table); graph view; B cycles', bz.ty === 'bezier' && bz.ob[1] > 0.05 && Math.abs(bz.want - bz.got) < 1e-6 && bz.gold && bz.mono && graph.rows === 1 && graph.h > 100 && graph.path === 'pendant.amp' && cyc === 'auto',
  `ob ${bz.ob.map((v) => v.toFixed(2))} · value at 25% ${bz.got.toFixed(3)} = ${bz.want.toFixed(3)} · golden ${bz.gold} · monotone ${bz.mono} · graph ${graph.rows} lane ${graph.h}px · B -> ${cyc}`);
// 8. zoom to selection (Z) and the minimap viewport (drag pans)
await tlEv((ids) => window.u2c.cuetl.select(ids), [P1[0].id, P1[1].id]); await page.focus('#cueCv'); const z0 = await tlEv(() => window.u2c.cuetl.state.ppb); await page.keyboard.press('z');
const z1 = await tlEv(() => ({ ppb: window.u2c.cuetl.state.ppb, v: window.u2c.cuetl.view() }));
const o4 = await cvR(), my = await tlEv(() => window.u2c.cuetl.miniY()), mx0 = await tlEv(() => { const tl = window.u2c.cuetl, V = tl.view(); return 176 + (V.a + (V.z - V.a) / 2) / V.total * (document.querySelector('#cueCv').getBoundingClientRect().width - 176); });
await page.mouse.move(o4.x + mx0, o4.y + my); await page.mouse.down(); await page.mouse.move(o4.x + mx0 + 120, o4.y + my, { steps: 4 }); await page.mouse.up(); const z2 = await tlEv(() => window.u2c.cuetl.view());
await page.keyboard.press('\\'); const z3 = await tlEv(() => window.u2c.cuetl.view());
ok('8. Z zooms to the selection; dragging the minimap viewport pans; \\ fits', z1.ppb > z0 * 1.5 && z1.v.a <= P1[0].b && z1.v.z >= P1[1].b && z2.a > z1.v.a + 1 && z3.a <= 0, `ppb ${z0.toFixed(1)} -> ${z1.ppb.toFixed(1)} · view ${z1.v.a.toFixed(2)}..${z1.v.z.toFixed(2)} · minimap drag -> ${z2.a.toFixed(2)} · fit -> ${z3.a.toFixed(2)}`);
// 9. paste attributes (Shift+Cmd+V), key presets + stamp on every bar, stamp the selection on every kick
await tlEv((id) => window.u2c.cuetl.select([id]), P1[0].id); await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+c'); await tlEv((id) => window.u2c.cuetl.select([id]), P1[2] ? P1[2].id : P1[1].id); await page.keyboard.press('ControlOrMeta+Shift+v');
const pa = await tlEv(([a, b]) => { const K = window.u2c.cues.sheet.tracks.find((t) => t.path === 'pendant.amp').keys, x = K.find((k) => k.id === a), y = K.find((k) => k.id === b); return { same: x.ty === y.ty && JSON.stringify(x.ob) === JSON.stringify(y.ob), ty: y.ty }; }, [P1[0].id, P1[2] ? P1[2].id : P1[1].id]);
await page.keyboard.press('Escape'); await tlEv(() => { window.u2c.cuetl.clearSel(); window.u2c.cuetl.clearLoop(); });
await page.selectOption('#insp [data-k="preset"]', 'zoom-punch'); await page.selectOption('#insp [data-k="stamp-rule"]', 'bar'); await page.click('#insp [data-act="preset-stamp"]');
const zp = await tlEv(() => { const t = window.u2c.cues.sheet.tracks.find((q) => q.path === 'camera.zoom'); return t ? t.keys.length : 0; }), nb = await tlEv(() => window.u2c.cues.sheet.meta.bars || 16);
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z');
await tlEv(() => { const t = window.u2c.cues.sheet.tracks.find((q) => q.path === 'fx.flash'); if (t && !t.keys.length) { window.u2c.cues.sheet.tracks.find((q) => q.path === 'fx.flash').keys.push({ id: 'k-flash-test', b: 20, v: true, ease: 'step' }); } });   // v14: flash is OFF by default (no keys): seed one
const fl = await tlEv(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'fx.flash').keys.map((k) => k.id)); await tlEv((ids) => window.u2c.cuetl.select(ids.slice(0, 1)), fl);
await page.selectOption('#insp [data-k="stamp-rule"]', 'kick'); await page.click('#insp [data-act="stamp"]');
const st = await ev(async () => { const app = window.u2c, Mk = await import('/src/cues/markers.js'), kicks = new Set(Mk.analysisMarkers(app.clip.current()).filter((m) => m.kind === 'kick').map((m) => m.b)); const K = app.cues.sheet.tracks.find((t) => t.path === 'fx.flash').keys; return { n: K.length, onKicks: K.filter((k) => [...kicks].some((b) => Math.abs(b - k.b) < 1e-6)).length }; });
await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z');
ok('9. paste attributes; key preset stamped on every bar; selection stamped on every kick (one undo each)', pa.same && pa.ty === 'bezier' && zp >= nb * 2 - 1 && st.n > 3 && st.onKicks >= st.n - 1, `attrs copied ${pa.same} · zoom punch keys ${zp} for ${nb} bars · flash keys ${st.n} (${st.onKicks} on kicks)`);
await page.keyboard.press('ControlOrMeta+z');   // paste attributes
// 10. effect controls: grouped per element, mini key strip per animated property, scrubby label, ‹ › per property
await tlEv(() => window.u2c.cuetl.clearSel()); await page.click('.tabs [data-tab="inspect"]'); await page.selectOption('#insp [data-k="element"]', 'pendant'); await page.waitForTimeout(100);
const fxv = await ev(() => ({ groups: document.querySelectorAll('#insp details.fx').length, strips: document.querySelectorAll('#insp .prop[data-path="pendant.amp"] .kstrip i').length }));
const lb = await page.locator('#insp .prop[data-path="pendant.period"] [data-scrub]').boundingBox(); const per0 = await tlEv(() => window.u2c.cues.ev().value('pendant.period', window.u2c.cuetl.state.playhead, 2));
await page.mouse.move(lb.x + 10, lb.y + lb.height / 2); await page.mouse.down(); await page.mouse.move(lb.x + 40, lb.y + lb.height / 2, { steps: 4 }); await page.mouse.up();
const per1 = await tlEv(() => window.u2c.cues.ev().value('pendant.period', window.u2c.cuetl.state.playhead, 2)); await page.focus('#cueCv'); await page.keyboard.press('ControlOrMeta+z');
await seekB(0.5); await page.click('#insp .prop[data-path="pendant.amp"] [data-act="nk"]'); const ecNav = await tlEv(() => window.u2c.cuetl.state.playhead);
ok('10. effect controls: element groups, mini key strips, scrubby label (one undo), per-property next key', fxv.groups >= 2 && fxv.strips >= 2 && per1 > per0 && Math.abs(ecNav - P1[1].b) < HF, `${fxv.groups} groups · ${fxv.strips} keys on the amp strip · period ${per0} -> ${per1} by dragging its label · › -> ${ecNav}`);
// 11. ripple: R inserts a bar at the playhead's bar (later keys + markers move 4 beats), Shift+R deletes it again
await tlEv(() => window.u2c.cuetl.clearSel()); await seekB(12); await page.focus('#cueCv'); await page.keyboard.press('m'); await tlEv(() => window.u2c.cuetl.clearSel()); await seekB(5); await page.focus('#cueCv'); const rb0 = await pend(); const mk0 = await tlEv(() => window.u2c.cues.sheet.markers.slice(-1)[0].b);
await page.keyboard.press('r'); const rb1 = await pend(), mk1 = await tlEv(() => window.u2c.cues.sheet.markers.slice(-1)[0].b); await page.keyboard.press('Shift+R'); const rb2 = await pend();
const later = rb0.filter((k) => k.b >= 4), earlier = rb0.filter((k) => k.b < 4);
ok('11. ripple: R inserts a bar (later keys and markers shift), Shift+R deletes it', later.every((k) => rb1.find((q) => q.id === k.id).b === k.b + 4) && earlier.every((k) => rb1.find((q) => q.id === k.id).b === k.b) && mk1 === mk0 + 4 && JSON.stringify(rb2.map((k) => k.b)) === JSON.stringify(rb0.map((k) => k.b)),
  `pendant ${rb0.map((k) => k.b).join(',')} -> ${rb1.map((k) => k.b).join(',')} -> ${rb2.map((k) => k.b).join(',')} · marker ${mk0} -> ${mk1}`);
// 12. track targeting: target the Pendant lane (header T); with nothing selected ] walks only its keys and R ripples only it; paste lands on it
await clickHead('pendant.amp', 'T'); await tlEv(() => window.u2c.cuetl.clearSel()); await tlEv(() => window.u2c.cuetl.focusRowOf('camera.shot')); await seekB(0.5); await page.focus('#cueCv');
await page.keyboard.press(']'); const tn = await tlEv(() => window.u2c.cuetl.selected().map(([r]) => r.path)); const cam0 = await tlEv(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.map((k) => k.b).join(','));
await tlEv(() => window.u2c.cuetl.clearSel()); await seekB(1); await page.keyboard.press('r'); const cam1 = await tlEv(() => window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.map((k) => k.b).join(',')), pr = await pend(); await page.keyboard.press('ControlOrMeta+z');
await clickHead('pendant.amp', 'T'); const tg = await tlEv(() => window.u2c.cuetl.targeted());
ok('12. track targeting: ] and ripple act on the targeted lane only', tn.length && tn.every((p) => p === 'pendant.amp') && cam0 === cam1 && pr.find((k) => k.id === P1[1].id).b === P1[1].b + 4 && tg.length === 0, `] selected ${tn} · camera unchanged ${cam0 === cam1} · pendant key ${P1[1].b} -> ${pr.find((k) => k.id === P1[1].id).b} · untargeted ${tg.length === 0}`);
// format: new fields are optional, v1 sheets load, markers / interpolation / lane flags round-trip
const fmt = await ev(async () => { const S = await import('/src/cues/schema.js'), a = window.u2c.cues.sheet; a.markers = a.markers || [];
  const j = S.serializeSheet(a), b = S.parseSheet(JSON.parse(JSON.stringify(j))), v1 = S.parseSheet({ format: 'u2c-cues', version: 1, tracks: [{ path: 'pendant.amp', kind: 'number', keys: [{ at: '1.1.0', v: 4, ease: 'easeInOut' }, { at: '2.1.0', v: 9, ty: 'warp', ob: 'x' }] }] });
  const ev1 = S.createEvaluator(v1), mid = ev1.value('pendant.amp', 2, 0), want = 4 + 5 * S.EASES.easeInOut(0.5);
  return { version: j.version, markers: (j.markers || []).length === (a.markers || []).length, same: JSON.stringify(b.tracks.map((t) => t.keys.map((k) => [k.b, k.ty || '', k.ob || ''])) ) === JSON.stringify(a.tracks.map((t) => t.keys.map((k) => [Math.round(k.b * 960) / 960, k.ty || '', k.ob || '']))), v1ok: Math.abs(mid - want) < 1e-9 && !('ty' in v1.tracks[0].keys[1]) && !('ob' in v1.tracks[0].keys[1]) }; });
ok('cue sheet stays version 1: new fields optional, v1 sheets load (bad fields dropped), markers + bezier round-trip', fmt.version === 1 && fmt.markers && fmt.same && fmt.v1ok, JSON.stringify(fmt));
await tlEv(() => { window.u2c.cuetl.setLaneHeight('pendant.amp', 0); window.u2c.cuetl.clearSel(); });
const sync2 = await syncEval();
ok('sync after the timeline edits: scheduled events on the grid within 1 frame', sync2.n > 100 && sync2.worst <= 1, `${sync2.n} events · worst ${sync2.worst.toFixed(3)} frame`);
const curveShot = async () => { await tlEv(() => { const tl = window.u2c.cuetl, K = window.u2c.cues.sheet.tracks.find((t) => t.path === 'pendant.amp').keys; tl.setLaneHeight('pendant.amp', 84); tl.focusRowOf('pendant.amp'); tl.select([K[0].id]); tl.setInterp('hit'); tl.select([K[0].id]); }); await page.waitForTimeout(250); };
// ---- screenshots: studio + timeline at 1440x900
await ev(() => { window.u2c.cuetl.clearSel(); window.u2c.actions.seek(window.u2c.store.project.inT + 13 * window.u2c.store.session.track.spb); }); await page.waitForTimeout(400);
await shot('studio-1440.png'); await page.locator('#dock').screenshot({ path: path.join(SHOTS, 'timeline-1440.png') });
await curveShot(); await shot('studio-curve-1440.png'); await page.locator('#dock').screenshot({ path: path.join(SHOTS, 'timeline-curve-1440.png') }); await tlEv(() => { window.u2c.cues.undo(); window.u2c.cuetl.setLaneHeight('pendant.amp', 0); window.u2c.cuetl.clearSel(); });
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
const tap = await ev(() => { const tl = window.u2c.cuetl, k = window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys[0], pt = tl.pointOf('camera.shot', k.b), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + pt.x, y: r.y + pt.y }; });
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
