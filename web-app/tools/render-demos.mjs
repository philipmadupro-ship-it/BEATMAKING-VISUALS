// Render the demo MP4s through the app's own export path (Export tab → Export MP4: offline WebCodecs + Mediabunny)
// and extract filmstrips. Needs a static server on :8765 (python3 -m http.server 8765) and Playwright.
//   node tools/render-demos.mjs [audio=demo/test-beat-142.wav] [jobs=u2cexe:916,lab:916,scope:916,u2cexe:169]
// Output: demo/<look>_<aspect>_15s.mp4 + demo/<look>_<aspect>_filmstrip.png (16 frames, 1 per second)
// Headless Chromium has no AAC encoder, so the app falls back to Opus; the audio track is then re-encoded to AAC
// with ffmpeg (video stream copied untouched) so the files play everywhere.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), OUT = path.join(ROOT, 'demo');
const AUDIO = path.resolve(process.argv[2] || path.join(ROOT, 'demo/test-beat-142.wav'));
const JOBS = (process.argv[3] || 'u2cexe:916,lab:916,scope:916,u2cexe:169').split(',').map(s => s.split(':'));
const CACHE = process.env.CDN_CACHE || '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', m => { if (m.type() === 'error' || /\[u2c\] export/.test(m.text())) console.log('  ' + m.text()); });
if (CACHE) await page.route('https://cdn.jsdelivr.net/**', async route => { const u = route.request().url(), f = path.join(CACHE, u.replace(/[^a-z0-9.@-]+/gi, '_'));
  if (!fs.existsSync(f)) { try { execFileSync('curl', ['-sSfL', '-o', f, u]); } catch (e) { return route.fulfill({ status: 404, body: 'miss' }); } }
  route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }); });
await page.goto(process.env.URL || 'http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 90000 });
await page.setInputFiles('#file', AUDIO);
await page.waitForFunction(() => { const tr = window.u2c.store.session.track; return tr && !tr.meta.quick && !/demo/.test(tr.meta.name || ''); }, null, { timeout: 120000 });
await page.evaluate(() => { const L = window.u2c.store.project.text.lines; window.u2c.store.set({ project: { text: { lines: { title: { text: 'Night Shift' }, key: { text: 'F# min' } } } } }); void L; });
await page.click('#grid .card >> nth=0').catch(() => {});
for (const [tpl, asp] of JOBS) {
  await page.evaluate(([tpl, asp]) => { const A = window.u2c.actions; A.openStudio ? A.openStudio(tpl, asp) : A.setTemplate(tpl); A.setAspect && A.setAspect(asp); A.setTemplate(tpl); }, [tpl, asp]);
  await page.click('.tabs [data-tab="export"]'); await page.evaluate(() => document.querySelector('[data-len="15"]').click()); await page.waitForTimeout(400);
  const before = await page.$$eval('#results .res', els => els.length);
  const t0 = Date.now(); await page.click('#exBtn');
  await page.waitForFunction(n => document.querySelectorAll('#results .res').length > n, before, { timeout: 1800000 });
  const b64 = await page.$eval('#results .res video', async v => { const b = await (await fetch(v.src)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }); });
  const base = `${tpl}_${asp === '916' ? '9x16' : '16x9'}_15s`, raw = path.join(OUT, base + '.app.mp4'), mp4 = path.join(OUT, base + '.mp4');
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  const ac = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', raw]).toString().trim();
  if (ac === 'aac') fs.renameSync(raw, mp4); else { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', mp4]); fs.unlinkSync(raw); }
  const film = path.join(OUT, base + '_filmstrip.png'), sc = asp === '916' ? 'scale=270:-2' : 'scale=480:-2';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `fps=1,${sc},tile=${asp === '916' ? '8x2' : '4x4'}:padding=4:color=0x0b0b0b`, '-frames:v', '1', film]);
  console.log(`${base}: ${((Date.now() - t0) / 1000).toFixed(0)} s · audio ${ac}${ac === 'aac' ? '' : ' → aac'} · ${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB`);
}
await browser.close();
