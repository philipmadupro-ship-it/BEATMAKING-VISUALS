// Render every frame of a composition page in headless Chromium (the same page + code the video render uses) and write
// per-frame metrics for tests/onset_sync.py: mean luma + mean abs frame-to-frame diff in each element's ROI, plus the
// camera state and the intro flag returned by film.render. frame f is drawn with renderAt(f / fps) = the frame centre.
//   node tests/onset_probe.mjs <composition.html> <out.json> [--f0 0] [--f1 899] [--aspect 916] [--look exe]
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname)), FILM = path.join(ROOT, 'film');
const [comp, outf] = [process.argv[2], process.argv[3]];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const f0 = +arg('f0', 0), f1 = +arg('f1', 899), aspect = arg('aspect', '916'), look = arg('look', 'exe'), FPS = 30;
const { LAYOUT, HERO } = await import(path.join(FILM, 'v9/src/v8/layout.js'));
const R = LAYOUT[look][aspect], H = HERO[aspect];
const rois = {}; for (const id of Object.keys(R)) rois[id] = R[id];
rois.logo = [H.cx - H.logoW / 2, H.cy - H.logoW * 0.16, H.logoW, H.logoW * 0.32];
rois.frame = [0, 0, aspect === '916' ? 1080 : 1920, aspect === '916' ? 1920 : 1080];
const puppeteer = (await import('puppeteer-core')).default;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf', '.css': 'text/css', '.ttf': 'font/ttf', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, s) => { const p = path.join(FILM, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(FILM) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const br = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'], protocolTimeout: 900000 });
const pg = await br.newPage(); const W = aspect === '916' ? 1080 : 1920, Hh = aspect === '916' ? 1920 : 1080; await pg.setViewport({ width: W, height: Hh });
pg.on('pageerror', (e) => console.error('pageerror', e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/${comp}`, { waitUntil: 'load' });
await pg.evaluate(() => window.U2C6.ready);
const out = { rois: Object.keys(rois), luma: {}, diff: {}, cam: [], intro: [], idx: [], push: [], enter: [] }; for (const k of out.rois) { out.luma[k] = []; out.diff[k] = []; }
for (let c0 = f0; c0 <= f1; c0 += 40) {
  const part = await pg.evaluate((c0, c1, rois, FPS) => {
    const cv = document.getElementById('stage'), g = cv.getContext('2d'), res = { luma: {}, diff: {}, cam: [], intro: [], idx: [], push: [], enter: [] }; window.__prev = window.__prev || {};
    const prev = window.__prev; for (const k of Object.keys(rois)) { res.luma[k] = []; res.diff[k] = []; }
    for (let f = c0; f <= c1; f++) {
      const r = window.U2C6.renderAt(f / FPS);
      res.cam.push(r && r.cam ? [r.cam.x, r.cam.y, r.cam.z] : null); res.intro.push(r && r.intro ? 1 : 0); res.idx.push(r && r.intro ? r.index : null); res.push.push(r && r.intro ? r.push : null); res.enter.push(r && r.intro ? r.enter : null);
      for (const k of Object.keys(rois)) {
        const [x, y, w, h] = rois[k].map((v) => Math.round(v)), im = g.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, Math.min(w, cv.width - x)), Math.max(1, Math.min(h, cv.height - y))).data;
        let s = 0, d = 0, n = 0; const p = prev[k]; const cur = new Uint8Array(Math.ceil(im.length / 16));
        for (let i = 0, j = 0; i < im.length; i += 16, j++) { const l = (im[i] + im[i + 1] + im[i + 2]) / 3; cur[j] = l; s += l; if (p && p.length === cur.length) d += Math.abs(l - p[j]); n++; }
        prev[k] = cur; res.luma[k].push(s / n); res.diff[k].push(d / n);
      }
    }
    return res;
  }, c0, Math.min(f1, c0 + 39), rois, FPS);
  for (const k of out.rois) { out.luma[k].push(...part.luma[k]); out.diff[k].push(...part.diff[k]); } out.cam.push(...part.cam); out.intro.push(...part.intro); out.idx.push(...part.idx); out.push.push(...part.push); out.enter.push(...part.enter);
}
out.f0 = f0; out.fps = FPS; out.rect = rois;
fs.writeFileSync(outf, JSON.stringify(out)); await br.close(); srv.close(); console.log('wrote', outf, out.luma.frame.length, 'frames');
