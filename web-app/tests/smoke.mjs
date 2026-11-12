// Smoke test for U2C Studio (Playwright, headless Chromium).
//   1. python3 -m http.server 8765   (from the project root)
//   2. node tests/smoke.mjs [audioFile]
// Env: URL (default http://localhost:8765/), SHOTS (screenshot folder, default ./shots),
//      CDN_CACHE (optional folder: serve cdn.jsdelivr.net from a local cache, filling it with curl on a miss;
//      use this where the browser cannot reach the CDN directly).
// Checks: page boots with no console errors, the grid renders, every template draws non-blank pixels in
// both aspects, and a 3 s export produces a non-empty video file.
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
const QUICK = !!process.env.QUICK;
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [], results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };

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
const t0 = Date.now();
await page.goto(URL0);
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 90000 });
ok('boot + demo analysis', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + (await page.textContent('#fxBadge')));
if (AUDIO) {
  await page.setInputFiles('#file', AUDIO);
  await page.waitForFunction(() => /Hz/.test(document.querySelector('#trackInfo').textContent) && !/refining/.test(document.querySelector('#status').textContent) && !/demo/.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
  ok('upload + analysis', true, (await page.textContent('#status')).replace(/\s+/g, ' ').slice(0, 160));
}
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOTS, 'grid-916.png'), fullPage: true });
const blank = async sel => page.$eval(sel, c => { const g = document.createElement('canvas'); g.width = 64; g.height = 64; const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; });
const cards = await page.$$('#grid .card canvas');
let nonBlank = 0; for (const c of cards) { const r = await c.evaluate(cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 400) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn; }); if (r > 30) nonBlank++; }
ok('grid renders', cards.length >= 9 && nonBlank === cards.length, `${nonBlank}/${cards.length} cards drawn`);
await page.click('#gridAspect button[data-a="169"]'); await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(SHOTS, 'grid-169.png'), fullPage: true });
await page.click('#gridAspect button[data-a="916"]'); await page.waitForTimeout(500);
// studio: each template, both aspects
const ids = await page.$$eval('#grid .card', els => els.map(e => e.dataset.tpl));
await page.click('#grid .card >> nth=0'); await page.waitForTimeout(800);
await page.click('#zoomSeg button[data-z="100"]');
if (process.env.PAL) await page.click(`#palChips .chip:has-text("${process.env.PAL}")`);
for (const asp of (process.env.ASPECTS || '916,169').split(',')) {
  await page.click(`#aspectSeg button[data-a="${asp}"]`); await page.waitForTimeout(400);
  for (const [i, id] of ids.entries()) {
    if (QUICK && i > 2) break;
    await page.click(`#lookGrid .lk[data-tpl="${id}"]`);
    // scrub to a few beats after the in point so the chains have landed, then let a frame render
    await page.evaluate(() => { document.querySelector('#restartBtn').click(); });
    for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const spread = await blank('#view');
    ok(`template ${id} ${asp}`, spread > 30, 'pixel spread ' + spread);
    fs.writeFileSync(path.join(SHOTS, `${id}-${asp}${process.env.PAL ? '-' + process.env.PAL.toLowerCase() : ''}.png`), Buffer.from((await page.$eval('#view', c => c.toDataURL('image/png'))).split(',')[1], 'base64'));
  }
}
await page.click('#aspectSeg button[data-a="916"]'); await page.click('#zoomSeg button[data-z="fit"]'); await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, 'studio.png') });
if (process.env.NOEXPORT) { await browser.close(); console.log(results.filter(r => !r.pass).length ? 'some failed' : 'ok'); process.exit(0); }
// 3 s export (frame-exact offline when WebCodecs can encode, otherwise real time)
await page.click('.tabs [data-tab="export"]');
await page.evaluate(() => { document.querySelector('[data-len="7"]').click(); });
await page.waitForTimeout(300);
// shorten to ~3 s: set out = in + 3 s through the store via keyboard: seek then press O
await page.evaluate(() => { document.querySelector('#restartBtn').click(); });
for (let k = 0; k < 7; k++) await page.keyboard.press('ArrowRight');
await page.keyboard.press('o');
await page.waitForTimeout(200);
const t1 = Date.now();
await page.click('#exBtn');
await page.waitForSelector('#results .res', { timeout: 180000 });
const res = await page.$eval('#results .res', el => ({ size: +el.dataset.size, type: el.dataset.type, name: el.querySelector('b').textContent, info: el.querySelector('span').textContent }));
ok('export', res.size > 10000, `${res.name} · ${res.size} bytes · ${res.info} · ${((Date.now() - t1) / 1000).toFixed(1)} s`);
const b64 = await page.$eval('#results .res video', async v => { const b = await (await fetch(v.src)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }); });
fs.writeFileSync(path.join(SHOTS, res.name), Buffer.from(b64, 'base64'));
await page.screenshot({ path: path.join(SHOTS, 'export.png') });
await page.click('#thumbBtn'); await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 3, null, { timeout: 60000 });
const th = await page.$$eval('#thumbs img', ims => ims.map(i => i.naturalWidth + 'x' + i.naturalHeight));
ok('youtube thumbnails', th.length === 3 && th.every(s => s === '1280x720'), th.join(', '));
await page.click('.tabs [data-tab="text"]'); await page.waitForTimeout(300);
const cap = await page.$eval('#capOut', t => t.value);
ok('caption builder', /Type Beat/.test(cap) && /#typebeat/.test(cap), cap.split('\n')[1]);
// phone width
await page.setViewportSize({ width: 390, height: 844 }); await page.click('#backBtn'); await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('phone width: no horizontal scroll', overflow <= 0, 'overflow ' + overflow + 'px');
await page.screenshot({ path: path.join(SHOTS, 'phone-home.png') });
const real = errors.filter(e => !/favicon/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter(r => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
