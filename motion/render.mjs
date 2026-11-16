#!/usr/bin/env node
// U2C beat-preview renderer: one command for any beat / stage / aspect / length.
//
//   node render.mjs --beat audio/atelmansion-3c-fmin-128.wav --stage rubedo --aspect 9:16 --len 30
//
// Options
//   --beat <wav>        source beat (any rate; analysed once, cached as <beat>.grid.json)
//   --look <name>       exe | lab | scope                                  (default exe)
//   --stage <name>      nigredo | albedo | citrinitas | rubedo            (default nigredo)
//   --tags <json>       override any on-screen text (deep-merged over tags.default.json)
//   --aspect <a>        9:16 | 16:9                                       (default 9:16)
//   --len <s>           15 | 30 | 60 (any; rounded to whole bars)         (default 30)
//   --start-bar <n>     force the section (song bar number); default = one bar before the first drop that fits
//   --title <text>      on-screen title (default from the filename)
//   --out <mp4>         output path (default out/v8/<look>-<stage>-<916|169>-<len>s.mp4)
//   --stills <t,t,...>  render PNG frames at these seconds instead of a video (fast review)
//   --filmstrip         also write a filmstrip PNG next to the video
//   --test pendant      render the 4-bar pendant test (pendant alone) instead of the film
//   --quality <q>       hyperframes quality for the picture (default: 12 Mbps target)
//   --engine <v9|v8>    v9 (default): the web app's composition code (film/v9, synced from web-app/src by
//                       tools/sync_web.mjs) driven by a cue sheet; v8: the frozen v8 classic scripts (film/v8)
//   --cues <file.json>  v9: a u2c-cues v1 sheet (exported from U2C Studio, see web-app/CUES.md). Without it the default
//                       sheet is generated from the analysis (web-app src/cues/generate.js, same as the studio's default).
//                       The sheet's base look/stage are the defaults of --look/--stage; flags given explicitly win.
//   --preset <name>     v9 without --cues: default | calm | drop | tour
//   --intro on|off      v11: the 2-bar liquid-glass player + cover-flow intro at the clip start (default on; off = start in the lab)
//   --date <text>       v9: the {date} tag (default: the beat file's date)
//   --test waveform     v9: the waveform test card (session meter alone); --wave-debug with --stills dumps the columns
//   --trace             with --stills: dump the per-frame motion trace (v9: hand, every joint + link angle, body)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FILM = path.join(ROOT, 'film');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc; }, []));
const beat = path.resolve(args.beat || 'audio/atelmansion-3c-fmin-128.wav');
const ENGINE = String(args.engine || 'v9');
let cueSheet = null;
if (ENGINE === 'v9' && args.cues) {   // --cues: the sheet's look / stage become the defaults of the flags
  const { readCuesFile, nativeArgs } = await import('./film/v9/src/cues/adapter-native.mjs');
  cueSheet = readCuesFile(fs.readFileSync(path.resolve(String(args.cues)), 'utf8'));
  const d = nativeArgs(cueSheet, args); if (d.look) args.look = d.look; if (d.stage) args.stage = d.stage;
}
const stage = String(args.stage || 'nigredo').toLowerCase();
const look = String(args.look || 'exe').toLowerCase();
if (!['exe', 'lab', 'scope'].includes(look)) throw new Error('look must be exe, lab or scope');
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
const stale = () => !fs.existsSync(js) || fs.statSync(js).mtimeMs < fs.statSync(beat).mtimeMs || (ENGINE === 'v9' && !(() => { const s = fs.readFileSync(js, 'utf8'); return s.includes('"wave3"') && s.includes('"bandDb"'); })());
if (stale() || args.rebuild) {
  const a = ['tools/clipdata.py', '--beat', beat, '--len', String(len), '--id', id];
  if (args['start-bar']) a.push('--start-bar', String(args['start-bar']));
  if (args.title) a.push('--title', String(args.title));
  console.log(run(PY, a, { cwd: ROOT, quiet: true }).trim().split('\n').pop());
}
if (ENGINE === 'v9') {   // meters v2 streams (scope / polar / levels / M-S spectra) from the web app's analysis code
  if (!fs.readFileSync(js, 'utf8').includes('"meters":')) console.log(run('node', ['tools/meterdata.mjs', id], { cwd: ROOT, quiet: true }).trim());
}
run('python3', ['tools/sync_elephant_loop.py'], { cwd: ROOT, quiet: true });
const D = JSON.parse(fs.readFileSync(js, 'utf8').replace(/^window\.U2C_DATA=/, '').replace(/;\s*$/, ''));
const [W, H] = aspect === '169' ? [1920, 1080] : [1080, 1920];

// 2. tags (defaults + optional overrides) and the composition file for this render
const merge = (a, b) => { if (b == null) return a; if (Array.isArray(b) || typeof b !== 'object') return b; const o = { ...a }; for (const k of Object.keys(b)) o[k] = merge(a ? a[k] : undefined, b[k]); return o; };
let tags = JSON.parse(fs.readFileSync(path.join(ROOT, 'tags.default.json'), 'utf8'));
if (args.tags) tags = merge(tags, JSON.parse(fs.readFileSync(path.resolve(String(args.tags)), 'utf8')));
const today = new Date(fs.statSync(beat).mtimeMs).toUTCString().split(' ').slice(1, 4).join(' ').toUpperCase();
if (tags.date === '{today}') tags.date = today;
if (args.title) tags.title = String(args.title);
const tagFile = `data/tags-${look}-${stage}-${aspect}-${id}.js`;
fs.writeFileSync(path.join(FILM, tagFile), 'window.U2C_TAGS=' + JSON.stringify(tags) + ';\n');
let comp;
if (ENGINE === 'v9') {
  const sync = spawnSync('node', [path.join(ROOT, 'tools', 'sync_web.mjs'), '--check'], { encoding: 'utf8' });
  if (sync.status !== 0) console.warn('[v9] ' + sync.stdout.trim().split('\n').pop());
  const { parseSheet, serializeSheet } = await import('./film/v9/src/cues/schema.js');
  const { generateSheet } = await import('./film/v9/src/cues/generate.js');
  const { clipBarLabels } = await import('./film/v9/src/v8/data.js');
  let sheet = cueSheet || generateSheet({ bars: D.bars, labels: clipBarLabels(D), look, stage, aspect, preset: String(args.preset || 'default'), meta: { title: D.title } });
  // explicit --look / --stage flags win over the sheet's tracks
  for (const [p, v] of [['look', look], ['stage', stage]]) { sheet.base[p] = v; for (const tr of sheet.tracks) if (tr.path === p) tr.keys = [{ ...(tr.keys[0] || {}), b: 0, v }]; }
  // v11 --intro on|off (default on): the 2-bar player + cover-flow intro at the clip start; off = start in the lab (as v10)
  const introFlag = args.intro === undefined ? null : !/^(off|0|false|no)$/i.test(String(args.intro));
  if (introFlag === false) { sheet.base['intro.on'] = false; sheet.tracks = sheet.tracks.filter((tr) => !tr.path.startsWith('intro.')); }
  else if (!args.test && (introFlag === true || sheet.base['intro.on'] !== false) && !sheet.tracks.some((tr) => tr.path === 'intro.index' || tr.path === 'intro.on' && tr.keys.some((k) => k.v === false))) {
    const gen = generateSheet({ bars: D.bars, labels: clipBarLabels(D), look, stage, aspect, preset: 'default', meta: { title: D.title } });   // sheets from before v11 get the default intro tracks
    sheet.tracks.push(...gen.tracks.filter((tr) => tr.path.startsWith('intro.')));
  }
  const cuesTags = {}; if (args.title) cuesTags.title = String(args.title);
  cuesTags.date = args.date ? String(args.date) : (tags.date === '{today}' || !tags.date ? today : tags.date);
  if (args.tags) Object.assign(cuesTags, JSON.parse(fs.readFileSync(path.resolve(String(args.tags)), 'utf8')));
  const cuesFile = `data/cues-${look}-${stage}-${aspect}-${id}${args.test ? '-test' : ''}.js`;
  fs.writeFileSync(path.join(FILM, cuesFile), 'window.U2C_CUES=' + JSON.stringify({ sheet: serializeSheet(sheet), tags: cuesTags, waveDebug: !!args['wave-debug'] }) + ';\n');
  fs.writeFileSync(path.join(FILM, 'data', `cues-${look}-${stage}-${aspect}-${id}.json`), JSON.stringify(serializeSheet(sheet), null, 1));
  comp = `v9-${look}${args.test ? '-test-' + args.test : ''}-${stage}-${aspect}-${id}.html`;
  const DUR9 = args.test ? +(Math.min(D.duration, 4 * 4 * D.beat)).toFixed(6) : D.duration;
  fs.writeFileSync(path.join(FILM, comp), fs.readFileSync(path.join(FILM, 'v9', 'template.html'), 'utf8')
    .replaceAll('{{W}}', W).replaceAll('{{H}}', H).replaceAll('{{DUR}}', DUR9).replaceAll('{{TEST}}', args.test || '').replaceAll('{{STAGE}}', stage).replaceAll('{{LOOK}}', look)
    .replaceAll('{{ASPECT}}', aspect).replaceAll('{{DATA}}', `data/${id}.js`).replaceAll('{{CUES}}', cuesFile).replaceAll('{{RES}}', aspect === '169' ? 'landscape' : 'portrait'));
} else {
comp = `v8-${look}${args.test ? '-test-' + args.test : ''}-${stage}-${aspect}-${id}.html`;
const tpl = fs.readFileSync(path.join(FILM, 'v8', 'template.html'), 'utf8')
  .replaceAll('{{W}}', W).replaceAll('{{H}}', H).replaceAll('{{DUR}}', args.test ? +(Math.min(D.duration, 4 * 4 * D.beat)).toFixed(6) : D.duration).replaceAll('{{TEST}}', args.test || '').replaceAll('{{STAGE}}', stage).replaceAll('{{LOOK}}', look)
  .replaceAll('{{ASPECT}}', aspect).replaceAll('{{DATA}}', `data/${id}.js`).replaceAll('{{TAGS}}', tagFile).replaceAll('{{RES}}', aspect === '169' ? 'landscape' : 'portrait');
fs.writeFileSync(path.join(FILM, comp), tpl);
}

// 3a. stills mode
if (args.stills) {
  const puppeteer = (await import('puppeteer-core')).default;
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, s) => { const p = path.join(FILM, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(FILM) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
  const pg = await br.newPage(); await pg.setViewport({ width: W, height: H });
  pg.on('pageerror', (e) => console.error('pageerror', e.message)); pg.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); }); pg.on('requestfailed', (r) => console.error('requestfailed', r.url()));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/${comp}`, { waitUntil: 'load' });
  await Promise.race([pg.evaluate(() => window.U2C6.ready), new Promise((_, rej) => setTimeout(() => rej(new Error('page not ready after 90 s (see pageerror above)')), 90000))]);
  const dir = path.resolve(args.out || path.join(ROOT, 'out', ENGINE, 'stills', `${look}-${stage}-${aspect}-${len}`));
  fs.mkdirSync(dir, { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    await pg.evaluate((tt) => window.U2C6.renderAt(tt), t);
    const f = path.join(dir, `t-${t.toFixed(2)}.png`); await (await pg.$('#stage')).screenshot({ path: f }); console.log(f);
  }
  if (args['wave-debug']) fs.writeFileSync(path.join(dir, 'wave-debug.json'), JSON.stringify(await pg.evaluate(() => window.U2C6.waveDebug())));
  if (args.trace && ENGINE === 'v9') { const n = Math.round(4 * 4 * D.beat * 30), tr = await pg.evaluate((n) => Array.from({ length: n }, (_, f) => window.U2C6.trace(f / 30)), n);
    fs.writeFileSync(path.join(dir, 'trace-model.json'), JSON.stringify({ beat: D.beat, fps: 30, W, H, chain: await pg.evaluate(() => window.U2C6.chainInfo()), pts: tr })); }
  else if (args.trace) { const tr = await pg.evaluate((n) => Array.from({ length: n }, (_, f) => window.U2C6.trace(f / 30)), Math.round(4 * 4 * D.beat * 30)); fs.writeFileSync(path.join(dir, 'trace-model.json'), JSON.stringify({ beat: D.beat, fps: 30, W, H, pts: tr })); }
  if (args.schedule) fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify(await pg.evaluate(() => ({ schedule: window.U2C6.schedule(), shots: window.U2C6.shots })), null, 1));
  await br.close(); srv.close(); process.exit(0);
}

// 3b. video: HyperFrames renders the picture; ffmpeg muxes the mastered clip (AAC 320k / 48 kHz)
const out = path.resolve(args.out || path.join(ROOT, 'out', ENGINE, args.test ? `test-${args.test}-${stage}-4bars.mp4` : `${look}-${stage}-${aspect}-${Math.round(len)}s.mp4`));
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
  const fs_ = out.replace(/\.mp4$/, '-filmstrip.png'), dir = path.join(ROOT, 'out', ENGINE, 'filmstrips'); fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(fs_));
  run(path.join(ROOT, 'tools', 'filmstrip.sh'), [out, dst, aspect === '169' ? '6' : '8', len >= 60 ? '4' : '2'], { quiet: true });
  console.log(dst);
}
