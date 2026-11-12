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
const EXPECT = ['lab', 'handset', 'exe', 'bloom', 'orbit', 'halo', 'scope', 'poster', 'slicer'];

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
ok('boot + demo analysis', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + (await page.textContent('#fxBadge')));
if (AUDIO) {
  await page.setInputFiles('#file', AUDIO);
  await page.waitForFunction(() => /Hz/.test(document.querySelector('#trackInfo').textContent) && !/refining/.test(document.querySelector('#status').textContent) && !/demo/.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
  ok('upload + analysis', true, (await page.textContent('#status')).replace(/\s+/g, ' ').slice(0, 160));
}
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOTS, 'grid-916.png'), fullPage: true });
const cards = await page.$$('#grid .card canvas');
let nonBlank = 0; for (const c of cards) { const r = await c.evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; }); if (r > 30) nonBlank++; }
const ids = await page.$$eval('#grid .card', els => els.map(e => e.dataset.tpl));
ok('grid: 9 looks in order', ids.join() === EXPECT.join() && nonBlank === cards.length, `${ids.join(', ')} · ${nonBlank}/${cards.length} drawn`);
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

// ---- glitch slider: UI sets the store; slices only on a strong-kick frame and gone within 80 ms
await page.click('.tabs [data-tab="fx"]');
await page.$eval('#fxGlitch', el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
const g0 = await page.evaluate(() => window.u2c.store.project.fx.glitch);
await page.$eval('#fxGlitch', el => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
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
ok('glitch slider', g0 === 0 && Math.abs(g30 - .3) < 1e-6 && gl.onHit > .2 && gl.onHit < 15 && gl.after < .01, `store 0→${g0}, 30→${g30} · strong kick @${gl.kick.toFixed(2)} s: ${gl.onHit.toFixed(2)} % of pixels moved by glitch 100 on the hit, ${gl.after.toFixed(3)} % 120 ms later`);

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
