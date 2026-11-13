// Smoke test for U2C Studio v2 (Playwright, headless Chromium).
//   1. python3 -m http.server 8765   (from the project root)
//   2. node tests/smoke.mjs [audioFile]
// Env: URL (default http://localhost:8765/), SHOTS (screenshot folder, default ./shots),
//      CDN_CACHE (optional folder: serve cdn.jsdelivr.net from a local cache, filling it with curl on a miss;
//      use this where the browser cannot reach the CDN directly), NOEXPORT=1 to skip the MP4 export.
// Checks: boot with no console errors; the 9-look grid renders; every template draws non-blank pixels in both
// aspects; variant contact sheets (every template × every palette variant + custom); the glitch slider works and
// glitch stays short; seam check (in-app pixel diff); a 4-bar loop export is a valid MP4 (ffprobe) whose
// last→first frame difference is no larger than the clip's ordinary frame-to-frame differences.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL0 = process.env.URL || 'http://localhost:8765/';
const SHOTS = process.env.SHOTS || path.resolve('shots');
const CACHE = process.env.CDN_CACHE || '';
const AUDIO = process.argv[2] || '';
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [], results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const EXPECT = ['u2cexe', 'lab', 'handset', 'exe', 'bloom', 'orbit', 'halo', 'scope', 'poster', 'slicer'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || 'dark' });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (process.env.VERBOSE || /\[u2c\]/.test(m.text())) console.log('  console.' + m.type() + ':', m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
if (CACHE) {
  fs.mkdirSync(CACHE, { recursive: true });
  await page.route('https://cdn.jsdelivr.net/**', async route => {
    const u = route.request().url(), f = path.join(CACHE, u.replace(/[^a-z0-9.@-]+/gi, '_'));
    if (!fs.existsSync(f)) { try { execFileSync('curl', ['-sSfL', '-o', f, u]); } catch (e) { return route.fulfill({ status: 404, body: 'miss' }); } }
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } });
  });
}
const saveCanvas = async (sel, file) => fs.writeFileSync(path.join(SHOTS, file), Buffer.from((await page.$eval(sel, c => c.toDataURL('image/png'))).split(',')[1], 'base64'));
const t0 = Date.now();
await page.goto(URL0);
await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 90000 });
ok('boot + demo analysis', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + (await page.getAttribute('#fxBadge', 'title')));
if (AUDIO) {
  await page.evaluate(() => { window.u2c.store.session.quickAt = 0; });
  await page.setInputFiles('#file', AUDIO);
  await page.waitForFunction(() => /Hz/.test(document.querySelector('#trackInfo').textContent) && !/refining/.test(document.querySelector('#status').textContent) && !/demo/.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
  const qp = await page.evaluate(() => window.u2c.store.session.quickAt || 0);
  ok('R29 fast first preview (quick pass, then refined)', !!qp && !/refining/.test(await page.textContent('#status')), 'quick-pass track shown first, then replaced by the full analysis');
  ok('upload + analysis', true, (await page.textContent('#status')).replace(/\s+/g, ' ').slice(0, 160));
}
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOTS, 'grid-916.png'), fullPage: true });
const cards = await page.$$('#grid .card canvas');
let nonBlank = 0; for (const c of cards) { const r = await c.evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; }); if (r > 30) nonBlank++; }
const ids = await page.$$eval('#grid .card', els => els.map(e => e.dataset.tpl));
await page.click('#gridAspect button[data-a="916"]'); await page.hover('#grid .card >> nth=1'); await page.waitForTimeout(400);
const hoverPlay = await page.evaluate(() => window.u2c.clock.playing); await page.mouse.move(2, 2); await page.waitForTimeout(200);
const hoverStop = await page.evaluate(() => !window.u2c.clock.playing);
ok('R28 grid hover-to-hear', hoverPlay && hoverStop, `hover → playing ${hoverPlay}, leave → stopped ${hoverStop}`);
ok('grid: 10 looks in order (U2C.EXE first)', ids.join() === EXPECT.join() && nonBlank === cards.length, `${ids.join(', ')} · ${nonBlank}/${cards.length} drawn`);
await page.click('#gridAspect button[data-a="169"]'); await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(SHOTS, 'grid-169.png'), fullPage: true });
await page.click('#gridAspect button[data-a="916"]'); await page.waitForTimeout(500);

// ---- studio: each template, both aspects (frame a few beats after the in point: chains landed)
const blank = async sel => page.$eval(sel, c => { const g = document.createElement('canvas'); g.width = 64; g.height = 64; const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; });
await page.click('#grid .card >> nth=0'); await page.waitForTimeout(800);
await page.click('#zoomSeg button[data-z="100"]');
for (const asp of ['916', '169']) {
  await page.click(`#aspectSeg button[data-a="${asp}"]`); await page.waitForTimeout(400);
  for (const id of ids) {
    await page.click(`#lookGrid .lk[data-tpl="${id}"]`);
    await page.evaluate(() => { document.querySelector('#restartBtn').click(); });
    for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const spread = await blank('#view');
    ok(`template ${id} ${asp}`, spread > 30, 'pixel spread ' + spread);
    await saveCanvas('#view', `${id}-${asp}.png`);
  }
}
await page.click('#aspectSeg button[data-a="916"]'); await page.click('#zoomSeg button[data-z="fit"]'); await page.click('#lookGrid .lk[data-tpl="bloom"]'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, 'studio.png') });

// ---- variant contact sheets: rows = looks, columns = 9 palette variants + Custom
for (const asp of ['916', '169']) {
  const url = await page.evaluate(async asp => {
    const app = window.u2c, tr = app.store.session.track, pals = ['charcoal', 'charcoal-paper', 'charcoal-steel', 'rust', 'rust-sepia', 'rust-burnt', 'amethyst', 'amethyst-lilac', 'amethyst-ruby', 'custom'];
    const { TEMPLATE_LIST, applyDefaults } = await import('/src/templates/index.js'), { makeSurface } = await import('/src/engine/render.js');
    const tw = asp === '916' ? 144 : 256, th = asp === '916' ? 256 : 144, sheet = document.createElement('canvas'); sheet.width = tw * pals.length; sheet.height = th * TEMPLATE_LIST.length; const g = sheet.getContext('2d');
    const surf = makeSurface(tw * 2, th * 2), tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
    TEMPLATE_LIST.forEach((t, r) => pals.forEach((pal, c) => { const p = app.store.snapshot(); p.tpl = t.id; p.aspect = asp; p.pal = pal; p.custom = { bg: '#1d1426', main: '#f2c14e', accent: '#e0475f' }; applyDefaults(p, t.id);
      app.renderFrame(p.inT + 6 * tr.spb + .05, surf, p, tr, { target: tmp.getContext('2d') }); g.drawImage(tmp, c * tw, r * th); }));
    return sheet.toDataURL('image/png');
  }, asp);
  fs.writeFileSync(path.join(SHOTS, `variants-${asp}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
ok('variant sheets', fs.existsSync(path.join(SHOTS, 'variants-916.png')), '9 looks × 10 palettes, both aspects');

// ---- V2 sync: the frame with the maximum kick envelope is within ±1 frame of each detected onset (30 fps)
const sync = await page.evaluate(async () => {
  const app = window.u2c, tr = app.store.session.track, p = app.store.snapshot(), { getFrameState } = await import('/src/engine/frame.js'), { makeParams } = await import('/src/engine/layout.js'), P = makeParams(p, tr), fps = 30, errs = [];
  for (const k of tr.kicks.t) { if (k < p.inT + .3 || k > p.outT - .3) continue; const f0 = Math.round((k - p.inT) * fps); let best = -1, bv = -1;
    for (let f = f0 - 4; f <= f0 + 4; f++) { const v = getFrameState(tr, p.inT + f / fps, { loop: P.loop }).kick; if (v > bv) { bv = v; best = f; } } errs.push(best - f0); }
  return { n: errs.length, worst: Math.max(...errs.map(Math.abs)) };
});
ok('V2 kick sync ±1 frame', sync.n > 3 && sync.worst <= 1, `${sync.n} kicks in the clip, worst offset ${sync.worst} frame(s)`);
// ---- meters + elephant size + no overlaps (text vs reserved rects, and U2C.EXE windows vs each other)
const geo = await page.evaluate(async () => {
  const app = window.u2c, tr = app.store.session.track, { TEMPLATE_LIST, applyDefaults } = await import('/src/templates/index.js'), { makeParams } = await import('/src/engine/layout.js'), { getFrameState } = await import('/src/engine/frame.js');
  const { textBoxes, reservedRects } = await import('/src/overlays/text.js'), { elephantBounds } = await import('/src/overlays/elephant.js'), c = document.createElement('canvas').getContext('2d');
  const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), out = { worst: 0, where: '', eleph: {}, win: 0, meters: null };
  for (const asp of ['916', '169']) for (const t of TEMPLATE_LIST) { const p = app.store.snapshot(); p.tpl = t.id; p.aspect = asp; applyDefaults(p, t.id); const P = makeParams(p, tr), fs = getFrameState(tr, p.inT + 2, { loop: P.loop });
    const res = reservedRects(P, t, app.assets); for (const b of textBoxes(c, P, fs, t, app.assets)) { const box = { x: b.x, y: b.y, w: b.bw, h: b.bh }, f = res.reduce((a, r) => a + ov(box, r), 0) / (box.w * box.h); if (f > out.worst) { out.worst = f; out.where = t.id + ' ' + asp + ' ' + b.id; } }
    if (t.id === 'u2cexe') { const { rects } = await import('/src/templates/u2cexe.js'), Rw = rects(P, null); out.eleph[asp] = { win: Rw.eleph.w / P.W, img: elephantBounds(P, app.assets).w / Rw.eleph.w }; const R = t.reserved(P); for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) out.win = Math.max(out.win, ov(R[i], R[j])); } }
  const p = app.store.snapshot(), fs = getFrameState(tr, p.inT + 2, {}), M = fs.m; out.meters = { M: M.lufsM(fs.t), S: M.lufsS(fs.t), I: M.lufsI(p.inT, p.outT), TP: M.truePeak(fs.t), pk: M.peakBar(0, fs.t), hold: M.holdDb(0, fs.t), corr: M.corr(fs.t), mono: M.mono, swing: M.groove.swing };
  return out;
});
const mt = geo.meters, finite = Object.values(mt).every(v => typeof v !== 'number' || Number.isFinite(v));
ok('V3 meters compute', finite && mt.hold >= mt.pk - .01 && mt.I < 0 && mt.TP <= .5, `M ${mt.M.toFixed(1)} · S ${mt.S.toFixed(1)} · I ${mt.I.toFixed(1)} LUFS · TP ${mt.TP.toFixed(1)} dBTP · peak ${mt.pk.toFixed(1)} / hold ${mt.hold.toFixed(1)} dB · corr ${mt.corr.toFixed(2)} · ${mt.mono ? 'MONO' : 'stereo'} · swing ${mt.swing}%`);
ok('V1 elephant size in U2C.EXE', geo.eleph['916'].win >= .35 && geo.eleph['916'].win <= .45 && geo.eleph['916'].img >= .7, `elephant.sys ${(geo.eleph['916'].win * 100).toFixed(0)} % of the width on 9:16 (elephant fills ${(geo.eleph['916'].img * 100).toFixed(0)} % of it) · 16:9 column ${(geo.eleph['169'].win * 100).toFixed(0)} %, filled ${(geo.eleph['169'].img * 100).toFixed(0)} %`);
ok('R13 no text overlaps (reserved-rect check)', geo.worst < .08 && geo.win === 0, `worst text/reserved overlap ${(geo.worst * 100).toFixed(1)} % (${geo.where || '-'}) · U2C.EXE window overlap ${geo.win}px²`);
// ---- keyboard shortcuts, BPM edit, presets, safe area, canvas drag, region drag
await page.click('#lookGrid .lk[data-tpl="u2cexe"]'); await page.click('#view', { position: { x: 5, y: 5 } }).catch(() => {});
const k0 = await page.evaluate(() => window.u2c.clock.time());
await page.keyboard.press('ArrowRight'); const k1 = await page.evaluate(() => window.u2c.clock.time());
await page.keyboard.press('2'); const kTpl = await page.evaluate(() => window.u2c.store.project.tpl);
await page.keyboard.press('1'); await page.keyboard.press('Space'); await page.waitForTimeout(300); const kPlay = await page.evaluate(() => window.u2c.clock.playing); await page.keyboard.press('Space');
ok('R28 keyboard shortcuts', k1 > k0 && kTpl === 'lab' && kPlay, `→ ${k0.toFixed(2)}→${k1.toFixed(2)} s · "2" selects ${kTpl} · space plays ${kPlay}`);
await page.click('.tabs [data-tab="beat"]'); await page.fill('#sBpm', '141'); await page.dispatchEvent('#sBpm', 'change'); await page.waitForTimeout(300);
const bpm1 = await page.evaluate(() => window.u2c.store.session.track.bpm); await page.fill('#sBpm', '140'); await page.dispatchEvent('#sBpm', 'change'); await page.waitForTimeout(300);
ok('R17 BPM editable', Math.abs(bpm1 - 141) < .01, `set 141 → track ${bpm1}`);
const hooks = {}; for (const L of ['7', '15', '30', 'full']) { await page.evaluate(L => document.querySelector(`[data-len="${L}"]`).click(), L); await page.waitForTimeout(150);
  hooks[L] = await page.evaluate(() => { const p = window.u2c.store.project, tr = window.u2c.store.session.track; return { bars: +((p.outT - p.inT) / tr.barDur).toFixed(2), onBar: Math.abs(((p.inT - tr.t0) / tr.barDur) - Math.round((p.inT - tr.t0) / tr.barDur)) < 1e-3 || p.inT === 0 }; }); }
ok('R19 hook presets snap to phrases on a downbeat', hooks['7'].bars === 4 && hooks['15'].bars === 8 && hooks['30'].bars === 16 && hooks['7'].onBar && hooks['15'].onBar, Object.entries(hooks).map(([k, v]) => `${k}:${v.bars} bars${v.onBar ? '' : ' (off-grid!)'}`).join(' · '));
await page.evaluate(() => document.querySelector('[data-len="15"]').click());
await page.click('#safeBtn'); const safe = await page.$$eval('#safe i', els => els.map(e => e.textContent)); await page.click('#safeBtn');
ok('R21 safe-area overlay', safe.length >= 3 && safe.some(s => /caption/.test(s)), safe.join(' | '));
const lines = await page.evaluate(() => { const L = window.u2c.store.project.text.lines; return [L.c1.text, L.cta.text, L.handle.text]; });
ok('R22 text presets available as lines', /type beat/i.test(lines[0]) && /lease/i.test(lines[1]) && /@/.test(lines[2]), lines.join(' · '));
// canvas drag: drag the logo by 120 px on the 100 % stage
await page.evaluate(() => window.u2c.actions.setTemplate('poster')); await page.waitForTimeout(300);
const vb = await page.$eval('#view', c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const c0 = await page.evaluate(() => ({ ...window.u2c.store.project.chains }));
await page.mouse.move(vb.x + vb.w * c0.x, vb.y + vb.h * c0.y); await page.mouse.down(); await page.mouse.move(vb.x + vb.w * c0.x + 60, vb.y + vb.h * c0.y + 30, { steps: 6 }); await page.mouse.up();
const c1 = await page.evaluate(() => ({ ...window.u2c.store.project.chains }));
ok('R28 drag overlays on the canvas', Math.abs(c1.x - c0.x) > .02 && Math.abs(c1.y - c0.y) > .005, `chains ${c0.x.toFixed(3)},${c0.y.toFixed(3)} → ${c1.x.toFixed(3)},${c1.y.toFixed(3)}`);
// timeline region drag (wavesurfer regions; snaps to bars)
const reg = await page.evaluate(() => { const host = document.querySelector('#wave'), all = []; const walk = n => { if (!n) return; if (n.getAttribute && /region/.test(n.getAttribute('part') || '') && n.style && n.style.width && parseFloat(n.style.width) > 1) all.push(n); (n.shadowRoot ? [...n.shadowRoot.children] : []).concat([...(n.children || [])]).forEach(walk); }; walk(host);
  const el = all.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
let regOk = false, regInfo = 'no region element found';
if (reg) { const before = await page.evaluate(() => window.u2c.store.project.inT); await page.mouse.move(reg.x + reg.w / 2, reg.y + reg.h / 2); await page.mouse.down(); await page.mouse.move(reg.x + reg.w / 2 + 80, reg.y + reg.h / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const p = window.u2c.store.project, tr = window.u2c.store.session.track; return { inT: p.inT, onBar: Math.abs((p.inT - tr.t0) / tr.barDur - Math.round((p.inT - tr.t0) / tr.barDur)) < 1e-3 }; });
  regOk = after.inT !== before && after.onBar; regInfo = `in ${before.toFixed(3)} → ${after.inT.toFixed(3)} s, on a bar line ${after.onBar}`; }
ok('R28 timeline region drag (bar-snapped)', regOk, regInfo);
await page.evaluate(() => { document.querySelector('[data-len="15"]').click(); window.u2c.actions.setTemplate('u2cexe'); }); await page.click('.tabs [data-tab="look"]');

// ---- glitch slider: UI sets the store; slices only on a strong-kick frame and gone within 80 ms
await page.click('.tabs [data-tab="fx"]');
// glitch is opt-in: default 0; the slider turns it on (kick trigger chosen explicitly for the test)
const g0 = await page.evaluate(() => window.u2c.store.project.fx.glitch);
await page.$eval('#fxGlitch', el => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.selectOption('#fxGlitchOn', 'kicks');
const g30 = await page.evaluate(() => window.u2c.store.project.fx.glitch);
const gl = await page.evaluate(async () => {
  const app = window.u2c, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js');
  const s = Array.from(tr.kicks.s).sort((a, b) => a - b), thr = s[Math.floor(s.length * .75)], p0 = app.store.snapshot();
  let k = -1; for (let j = 0; j < tr.kicks.t.length; j++) if (tr.kicks.s[j] >= thr && tr.kicks.t[j] > p0.inT + .5 && tr.kicks.t[j] < p0.outT - .5) { k = tr.kicks.t[j]; break; }
  // full-resolution frames, glitch 100 vs 0 (RGB split, CRT and grain off so only the slices differ)
  const shot = (t, glitch) => { const p = app.store.snapshot(); p.fx.glitch = glitch; p.fx.rgb = 0; p.fx.crt = 0; p.finish.grain = 0; const s1 = makeSurface(p.aspect === '916' ? 1080 : 1920, p.aspect === '916' ? 1920 : 1080), c = document.createElement('canvas'); c.width = s1.w; c.height = s1.h; const g = c.getContext('2d', { willReadFrequently: true }); app.renderFrame(t, s1, p, tr, { target: g }); return g.getImageData(0, 0, c.width, c.height).data; };
  const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n / (a.length / 4) * 100; };
  return { kick: k, onHit: changed(shot(k + .015, 1), shot(k + .015, 0)), after: changed(shot(k + .12, 1), shot(k + .12, 0)) };
});
ok('glitch: off by default, slider opt-in', g0 === 0 && Math.abs(g30 - .3) < 1e-6 && gl.onHit > .2 && gl.onHit < 15 && gl.after < .01, `default ${g0}, slider 30→${g30} · strong kick @${gl.kick.toFixed(2)} s: ${gl.onHit.toFixed(2)} % of pixels moved by glitch 100 on the hit, ${gl.after.toFixed(3)} % 120 ms later`);

// ---- U2C.EXE across one phrase (rebuild → full → mid-dissolve → end), rope determinism + rope seam
for (const asp of ['916', '169']) {
  const url = await page.evaluate(async asp => {
    const app = window.u2c, tr = app.store.session.track, { applyDefaults } = await import('/src/templates/index.js'), { makeSurface } = await import('/src/engine/render.js'), { makeParams } = await import('/src/engine/layout.js');
    const p = app.store.snapshot(); p.tpl = 'u2cexe'; p.aspect = asp; p.pal = 'charcoal'; applyDefaults(p, 'u2cexe'); const C = makeParams(p, tr).cycleBeats, beats = [.7, C * .4, C - 1.6, C - .25];
    const tw = asp === '916' ? 540 : 960, th = asp === '916' ? 960 : 540, sheet = document.createElement('canvas'); sheet.width = tw * 4; sheet.height = th; const g = sheet.getContext('2d'), surf = makeSurface(tw * 2, th * 2), tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
    beats.forEach((b, i) => { app.renderFrame(p.inT + b * tr.spb, surf, p, tr, { target: tmp.getContext('2d') }); g.drawImage(tmp, i * tw, 0); });
    return sheet.toDataURL('image/png');
  }, asp);
  fs.writeFileSync(path.join(SHOTS, `u2cexe-phrase-${asp}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
const rope = await page.evaluate(async () => {
  const app = window.u2c, tr = app.store.session.track, { makeParams } = await import('/src/engine/layout.js'), { getFrameState } = await import('/src/engine/frame.js'), { ropeNodes } = await import('/src/overlays/elephant.js');
  const p = app.store.snapshot(), P = makeParams(p, tr), at = t => ropeNodes(getFrameState(tr, t, { loop: P.loop }), P), d = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const t1 = p.inT + 1.234, a = Array.from(at(t1)), b = Array.from(at(t1)), first = Array.from(at(p.inT)), last = Array.from(at(p.outT)), mid = Array.from(at(p.inT + (p.outT - p.inT) / 2));
  const step = Array.from(at(p.inT + 1 / 30));
  let maxDeg = 0; for (let k = 0; k < 160; k++) { const n = at(p.inT + (p.outT - p.inT) * k / 160), e = n.length - 2; maxDeg = Math.max(maxDeg, Math.abs(Math.atan2(n[e], n[e + 1])) * 180 / Math.PI); }
  return { repeat: d(a, b), seam: d(first, last), step: d(first, step), swing: Math.abs(mid[mid.length - 2]), maxDeg };
});
ok('rope physics: gentle, deterministic, seamless', rope.repeat === 0 && rope.seam < 1e-3 && rope.maxDeg > .5 && rope.maxDeg <= 8.5, `max swing ${rope.maxDeg.toFixed(1)}° · repeat diff ${rope.repeat} · out→in diff ${rope.seam.toExponential(1)} (one frame of motion ${rope.step.toExponential(1)})`);

// ---- 4-bar loop + seam check
await page.click('.tabs [data-tab="export"]');
await page.evaluate(() => { document.querySelector('[data-len="7"]').click(); });
await page.waitForTimeout(300);
const clip = await page.evaluate(() => { const p = window.u2c.store.project, tr = window.u2c.store.session.track; return { inT: p.inT, outT: p.outT, bars: (p.outT - p.inT) / tr.barDur }; });
ok('loop snaps to a phrase', Math.abs(clip.bars - 4) < .01, `${clip.inT.toFixed(3)} → ${clip.outT.toFixed(3)} s = ${clip.bars.toFixed(2)} bars`);
await page.click('#seamBtn'); await page.waitForFunction(() => document.querySelector('#seamBox').dataset.diff, null, { timeout: 20000 }); await page.waitForTimeout(1200);
const seamUi = await page.evaluate(() => ({ diff: +document.querySelector('#seamBox').dataset.diff, mode: window.u2c.clock.mode, playing: window.u2c.clock.playing, t: window.u2c.clock.time() }));
await page.screenshot({ path: path.join(SHOTS, 'seam-check.png') });
ok('seam check', seamUi.mode === 'seam' && seamUi.playing && seamUi.diff < 8, `in-app last→first frame diff ${seamUi.diff} % · playing ${seamUi.mode} reel at t=${seamUi.t.toFixed(2)} s`);
await page.click('#seamClose');

if (!process.env.NOEXPORT) {
  const t1 = Date.now();
  await page.click('#exBtn');
  await page.waitForSelector('#results .res', { timeout: 900000 });
  const res = await page.$eval('#results .res', el => ({ size: +el.dataset.size, type: el.dataset.type, fps: el.dataset.fps, name: el.querySelector('b').textContent, info: el.querySelector('span').textContent }));
  ok('export', res.size > 10000, `${res.name} · ${res.info} · wall ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  const b64 = await page.$eval('#results .res video', async v => { const b = await (await fetch(v.src)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }); });
  const mp4 = path.join(SHOTS, res.name); fs.writeFileSync(mp4, Buffer.from(b64, 'base64'));
  try {
    const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_read_frames,r_frame_rate:format=duration,format_name', '-of', 'json', mp4]).toString());
    const v = pr.streams.find(s => s.codec_type === 'video'), a = pr.streams.find(s => s.codec_type === 'audio'), dur = +pr.format.duration, want = clip.outT - clip.inT;
    ok('ffprobe: valid MP4', /mp4/.test(pr.format.format_name) && v && a && Math.abs(dur - want) < .1, `${pr.format.format_name} · ${v.codec_name} ${v.width}×${v.height} ${v.nb_read_frames} frames @ ${v.r_frame_rate} · ${a.codec_name} · ${dur.toFixed(3)} s (clip ${want.toFixed(3)} s)`);
    // seam: decode every frame small + grey; compare last→first with the ordinary frame-to-frame differences
    const W = 108, H = Math.round(108 * v.height / v.width), raw = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 }), n = Math.floor(raw.length / (W * H));
    const fr = i => raw.subarray(i * W * H, (i + 1) * W * H), dd = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length / 255 * 100; };
    const adj = []; for (let i = 1; i < n; i++) adj.push(dd(fr(i - 1), fr(i))); const sorted = [...adj].sort((x, y) => x - y), seam = dd(fr(n - 1), fr(0)), med = sorted[Math.floor(sorted.length / 2)], max = sorted[sorted.length - 1];
    const rank = sorted.filter(x => x < seam).length / sorted.length;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select='eq(n\\,0)+eq(n\\,${n - 1})',scale=270:-2,tile=2x1`, '-frames:v', '1', path.join(SHOTS, 'seam-last-first.png')]);
    // frame 0 is the phrase downbeat (chains slam), so the seam should look like an ordinary hit, not a jump cut
    ok('exported loop seam', seam <= max * 1.25, `last→first ${seam.toFixed(2)} % vs frame-to-frame median ${med.toFixed(2)} %, max ${max.toFixed(2)} % (seam is at the ${Math.round(rank * 100)}th percentile)`);
  } catch (e) { ok('ffprobe / seam measurement', false, e.message.slice(0, 200)); }
  await page.screenshot({ path: path.join(SHOTS, 'export.png') });
  await page.click('#thumbBtn'); await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 3, null, { timeout: 60000 });
  const th = await page.$$eval('#thumbs img', ims => ims.map(i => i.naturalWidth + 'x' + i.naturalHeight));
  ok('youtube thumbnails', th.length === 3 && th.every(s => s === '1280x720'), th.join(', '));
  ok('R25 loudness measured + shown', /LUFS/.test(await page.textContent('#loudKv')), (await page.textContent('#loudKv')).replace(/\s+/g, ' '));
  // R26 voice tag: upload a 1 s tag, check it is mixed in (tagged export audio differs from clean)
  const wav = path.join(SHOTS, '_tag.wav'); { const sr = 44100, n = sr, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * (300 + 600 * i / n)) * 12000 * Math.min(1, (n - i) / 2000)), 44 + i * 2); fs.writeFileSync(wav, b); }
  await page.setInputFiles('#vtFile', wav); await page.waitForFunction(() => /_tag\.wav/.test(document.querySelector('#vtInfo').textContent), null, { timeout: 10000 });
  const vt = await page.evaluate(async () => { const app = window.u2c, { prepareAudio } = await import('/src/export/audio.js'), p = app.store.snapshot(), buf = app.store.session.buffer, tr = app.store.session.track;
    const o = { loopSafe: true, xf: tr.spb, loudness: 'off', voiceEvery: 25 }; const clean = await prepareAudio(buf, p, o), tagged = await prepareAudio(buf, p, { ...o, voiceTag: app.store.session.voiceTag });
    const a = clean.buffer.getChannelData(0), b = tagged.buffer.getChannelData(0), s0 = Math.round(1.6 * 48000); let d = 0; for (let i = s0; i < s0 + 24000; i++) d += Math.abs(a[i] - b[i]); return { on: app.store.project.export.voiceTag, diff: d / 24000 }; });
  ok('R26 voice tag mixed into the tagged export', vt.on && vt.diff > .005, `toggle ${vt.on} · mean |tagged − clean| at 1.5 s = ${vt.diff.toFixed(4)}`);
  await page.uncheck('#vtOn');
  // R27 batch: 2 looks × 7 s, draft
  await page.check('#exDraft'); await page.evaluate(() => { document.querySelectorAll('[data-btpl]').forEach(c => { c.checked = ['u2cexe', 'scope'].includes(c.dataset.btpl); }); document.querySelector('#batchTpl').dispatchEvent(new Event('change'));
    document.querySelectorAll('[data-blen]').forEach(c => { c.checked = c.dataset.blen === '7'; c.dispatchEvent(new Event('change')); }); });
  const nRes = await page.$$eval('#results .res', e => e.length); const tb = Date.now(); await page.click('#batchBtn');
  await page.waitForFunction(n => document.querySelectorAll('#results .res').length >= n + 2 && !document.querySelector('#exBtn').disabled, nRes, { timeout: 600000 });
  const bnames = await page.$$eval('#results .res b', e => e.slice(0, 2).map(x => x.textContent));
  ok('R27 batch export', bnames.length === 2 && bnames.some(n => /u2cexe/.test(n)) && bnames.some(n => /scope/.test(n)), bnames.join(', ') + ` · ${((Date.now() - tb) / 1000).toFixed(0)} s (draft)`);
  await page.uncheck('#exDraft');
}
// ---- text panel: edit the key with the picker and a custom line; it reaches the frame model and the caption
await page.click('.tabs [data-tab="text"]'); await page.waitForTimeout(300);
await page.selectOption('.tline[data-line="key"] [data-f="keypick"]', 'F# min');
await page.$eval('.tline[data-line="c1"] [data-f="on"]', el => { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.selectOption('.tline[data-line="c1"] [data-f="pos"]', 'centre');
const tx = await page.evaluate(() => { const L = window.u2c.store.project.text.lines; return { key: L.key.text, c1: L.c1.on && L.c1.pos }; });
const cap = await page.$eval('#capOut', t => t.value);
ok('text panel', tx.key === 'F# min' && tx.c1 === 'centre' && /Type Beat/.test(cap), `key ${tx.key} · custom line ${tx.c1} · ${cap.split('\n')[1]}`);
await saveCanvas('#view', 'text-panel-916.png');
// ---- phone width
await page.setViewportSize({ width: 390, height: 844 }); await page.click('#backBtn'); await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('phone width: no horizontal scroll', overflow <= 0, 'overflow ' + overflow + 'px');
await page.screenshot({ path: path.join(SHOTS, 'phone-home.png') });
const real = errors.filter(e => !/favicon/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter(r => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
