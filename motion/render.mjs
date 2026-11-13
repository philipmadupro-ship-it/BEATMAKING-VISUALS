#!/usr/bin/env node
// U2C beat-preview renderer: one command for any beat / stage / aspect / length.
//
//   node render.mjs --beat audio/atelmansion-3c-fmin-128.wav --stage rubedo --aspect 9:16 --len 30
//
// Options
//   --beat <wav>        source beat (any rate; analysed once, cached as <beat>.grid.json)
//   --stage <name>      nigredo | albedo | citrinitas | rubedo            (default nigredo)
//   --aspect <a>        9:16 | 16:9                                       (default 9:16)
//   --len <s>           15 | 30 | 60 (any; rounded to whole bars)         (default 30)
//   --start-bar <n>     force the section (song bar number); default = one bar before the first drop that fits
//   --title <text>      on-screen title (default from the filename)
//   --out <mp4>         output path (default out/v6/<stage>-<916|169>-<len>s.mp4)
//   --stills <t,t,...>  render PNG frames at these seconds instead of a video (fast review)
//   --filmstrip         also write a filmstrip PNG next to the video
//   --quality <q>       hyperframes quality for the picture (default: 12 Mbps target)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FILM = path.join(ROOT, 'film');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc; }, []));
const beat = path.resolve(args.beat || 'audio/atelmansion-3c-fmin-128.wav');
const stage = String(args.stage || 'nigredo').toLowerCase();
const aspect = String(args.aspect || '9:16').replace(':', '').replace('x', '');
const len = Number(args.len || 30);
if (!['nigredo', 'albedo', 'citrinitas', 'rubedo'].includes(stage)) throw new Error('unknown stage ' + stage);
if (!['916', '169'].includes(aspect)) throw new Error('aspect must be 9:16 or 16:9');
const base = path.basename(beat).replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const id = `${base}-${len}${args['start-bar'] ? '-b' + args['start-bar'] : ''}`;
const PY = fs.existsSync(path.join(ROOT, '.venv/bin/python')) ? path.join(ROOT, '.venv/bin/python') : 'python3';
const run = (cmd, a, opt = {}) => { const r = spawnSync(cmd, a, { stdio: opt.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opt }); if (r.status !== 0) { if (opt.quiet) process.stderr.write(r.stderr || ''); throw new Error(`${cmd} failed`); } return r.stdout; };

// 1. data + mastered clip (cached per beat/length/section)
const js = path.join(FILM, 'data', id + '.js');
if (!fs.existsSync(js) || fs.statSync(js).mtimeMs < fs.statSync(beat).mtimeMs || args.rebuild) {
  const a = ['tools/clipdata.py', '--beat', beat, '--len', String(len), '--id', id];
  if (args['start-bar']) a.push('--start-bar', String(args['start-bar']));
  if (args.title) a.push('--title', String(args.title));
  console.log(run(PY, a, { cwd: ROOT, quiet: true }).trim().split('\n').pop());
}
run('python3', ['tools/sync_elephant_loop.py'], { cwd: ROOT, quiet: true });
const D = JSON.parse(fs.readFileSync(js, 'utf8').replace(/^window\.U2C_DATA=/, '').replace(/;\s*$/, ''));
const [W, H] = aspect === '169' ? [1920, 1080] : [1080, 1920];

// 2. composition file for this render
const comp = `v6-${stage}-${aspect}-${id}.html`;
const tpl = fs.readFileSync(path.join(FILM, 'v6', 'template.html'), 'utf8')
  .replaceAll('{{W}}', W).replaceAll('{{H}}', H).replaceAll('{{DUR}}', D.duration).replaceAll('{{STAGE}}', stage)
  .replaceAll('{{ASPECT}}', aspect).replaceAll('{{DATA}}', `data/${id}.js`).replaceAll('{{RES}}', aspect === '169' ? 'landscape' : 'portrait');
fs.writeFileSync(path.join(FILM, comp), tpl);

// 3a. stills mode
if (args.stills) {
  const puppeteer = (await import('puppeteer-core')).default;
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, s) => { const p = path.join(FILM, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(FILM) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
  const pg = await br.newPage(); await pg.setViewport({ width: W, height: H });
  pg.on('pageerror', (e) => console.error('pageerror', e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/${comp}`, { waitUntil: 'load' });
  await pg.evaluate(() => window.U2C6.ready);
  const dir = path.resolve(args.out || path.join(ROOT, 'out', 'v6', 'stills', `${stage}-${aspect}-${len}`));
  fs.mkdirSync(dir, { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    await pg.evaluate((tt) => window.U2C6.renderAt(tt), t);
    const f = path.join(dir, `t-${t.toFixed(2)}.png`); await (await pg.$('#stage')).screenshot({ path: f }); console.log(f);
  }
  if (args.schedule) fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify(await pg.evaluate(() => ({ schedule: window.U2C6.schedule(), shots: window.U2C6.shots })), null, 1));
  await br.close(); srv.close(); process.exit(0);
}

// 3b. video: HyperFrames renders the picture; ffmpeg muxes the mastered clip (AAC 320k / 48 kHz)
const out = path.resolve(args.out || path.join(ROOT, 'out', 'v6', `${stage}-${aspect}-${Math.round(len)}s.mp4`));
fs.mkdirSync(path.dirname(out), { recursive: true });
const tmp = path.join(FILM, 'renders', `${path.basename(out, '.mp4')}-video.mp4`);
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1' };
const q = args.quality ? ['--quality', String(args.quality)] : ['--video-bitrate', '12M', '--max-bitrate', '14M'];
const t0 = Date.now();
run('npx', ['hyperframes', 'render', '.', '-c', comp, '-o', tmp, ...q, '--fps', '30', '--quiet'], { cwd: FILM, env, quiet: true });
run('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-i', path.join(FILM, 'data', id + '.wav'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out], { quiet: true });
const lo = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const s = lo.slice(lo.lastIndexOf('Summary:'));
console.log(`${out}  ${((Date.now() - t0) / 1000).toFixed(0)} s  I ${s.match(/I:\s+(-?[\d.]+)/)[1]} LUFS  TP ${s.match(/Peak:\s+(-?[\d.]+)/)[1]} dBTP  section: song bars ${D.song.startBar}-${D.song.startBar + D.bars - 1}`);
if (args.filmstrip) {
  const fs_ = out.replace(/\.mp4$/, '-filmstrip.png'), dir = path.join(ROOT, 'out', 'v6', 'filmstrips'); fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(fs_));
  run(path.join(ROOT, 'tools', 'filmstrip.sh'), [out, dst, aspect === '169' ? '6' : '8', len >= 60 ? '4' : '2'], { quiet: true });
  console.log(dst);
}
