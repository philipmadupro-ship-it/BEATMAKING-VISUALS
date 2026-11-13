// Render storyboard stills (one per scene) or arbitrary frames straight from the composition, headless.
// node tools/stills.mjs storyboard [A,B,C] [916|169]      -> storyboard/<variant>/scene-N.png
// node tools/stills.mjs frames <variant> <aspect> <out-dir> t1 t2 ...  -> <out-dir>/t-<t>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILM = path.join(ROOT, 'film');
const CHROME = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.json': 'application/json', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  const p = path.join(FILM, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(FILM) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'] });

async function shoot(variant, aspect, jobs) {
  const page = await browser.newPage();
  const [W, H] = aspect === '169' ? [1920, 1080] : [1080, 1920];
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/${aspect === '169' ? 'wide' : 'index'}.html?variant=${variant}`, { waitUntil: 'load' });
  await page.evaluate(() => window.U2C.ready);
  for (const [t, out] of jobs) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.evaluate((tt) => window.U2C.renderAt(tt), t);
    const el = await page.$('#stage');
    await el.screenshot({ path: out });
    console.log(out);
  }
  await page.close();
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'storyboard') {
  const variants = (rest[0] || 'A,B,C').split(','), aspect = rest[1] || '916';
  for (const v of variants) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html?variant=${v}`, { waitUntil: 'load' });
    await page.evaluate(() => window.U2C.ready);
    const scenes = await page.evaluate((vv) => window.U2C.V.SCENES[vv], v);
    await page.close();
    const dir = path.join(ROOT, 'storyboard', v + (aspect === '169' ? '-169' : ''));
    fs.writeFileSync(path.join(path.dirname(dir), `${path.basename(dir)}.scenes.json`), JSON.stringify(scenes));
    await shoot(v, aspect, scenes.map(([, t], i) => [t, path.join(dir, `scene-${i + 1}.png`)]));
  }
} else {
  const [variant, aspect, outDir, ...ts] = rest;
  await shoot(variant, aspect, ts.map((t) => [Number(t), path.join(outDir, `t-${Number(t).toFixed(2)}.png`)]));
}
await browser.close(); server.close();
