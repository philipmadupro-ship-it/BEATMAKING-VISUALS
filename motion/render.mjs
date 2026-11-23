#!/usr/bin/env node
// U2C beat-preview renderer: one command for any beat / stage / aspect / length.
//
//   node render.mjs --beat audio/atelmansion-3c-fmin-128.wav --stage rubedo --aspect 9:16 --len 30
//
// Options
//   --beat <wav>        source beat (any rate; analysed once, cached as <beat>.grid.json)
//   --look <name>       exe | lab | scope | player                                (default exe)
//   --stage <name>      nigredo | albedo | citrinitas | rubedo            (default nigredo)
//   --tags <json>       override any on-screen text (deep-merged over tags.default.json)
//   --aspect <a>        9:16 | 16:9                                       (default 9:16)
//   --len <s>           15 | 30 | 60 (any; rounded to whole bars)         (default 30)
//   --start-bar <n>     force the section (song bar number); default = one bar before the first drop that fits
//   --title <text>      on-screen title (default from the filename)
//   --out <mp4>         output path (default out/v8/<look>-<stage>-<916|169>-<len>s.mp4)
//   --clicks on|off [--click-db -16]  v19: synthesized UI mouse clicks under the beat at every cursor click (player)
//   --mblur N [--shutter 0.5]  v17: N sub-frames per frame averaged over shutter x 1 frame (default 3, 180 deg; 1 = off)
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
if (!['exe', 'lab', 'scope', 'player'].includes(look)) throw new Error('look must be exe, lab, scope or player');
const aspect = String(args.aspect || '9:16').replace(':', '').replace('x', '');
const len = Number(args.len || 30);
// v19 --preroll <s> (player look default 0.7): silent pause on the stopped player before the cursor clicks play; the audio starts on the click
const { PRE_S } = await import('./film/v9/src/cues/generate.js'), { VOICE_ATS, VOICE_DURS } = await import('./film/v9/src/v8/tags.js');   // v24: one source of truth (web + native)
const PRE = args.test ? 0 : Math.max(0, +(args.preroll ?? ((args.look || 'exe') === 'player' ? PRE_S : 0)));   // v22.2: 7 s pre-roll (voice); v22: 4 s pre-roll (orbit-sphere intro: spin, drag, pick, play)
if (!['nigredo', 'albedo', 'citrinitas', 'rubedo', 'white'].includes(stage)) throw new Error('unknown stage ' + stage);
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
const today = new Date().toUTCString().split(' ').slice(1, 4).join(' ').toUpperCase();
if (tags.date === '{today}') tags.date = today;
if (args.title) tags.title = String(args.title);
const tagFile = `data/tags-${look}-${stage}-${aspect}-${id}.js`;
fs.writeFileSync(path.join(FILM, tagFile), 'window.U2C_TAGS=' + JSON.stringify(tags) + ';\n');
let comp, CLICKS = [], SFX = [], STOPE = false, TAGS_AUDIO = {};
const cueTagsForAudio = () => TAGS_AUDIO;   // v23 STOPE: full beat plays to the end and stops (outro.end)
if (ENGINE === 'v9') {
  const sync = spawnSync('node', [path.join(ROOT, 'tools', 'sync_web.mjs'), '--check'], { encoding: 'utf8' });
  if (sync.status !== 0) console.warn('[v9] ' + sync.stdout.trim().split('\n').pop());
  const { parseSheet, serializeSheet } = await import('./film/v9/src/cues/schema.js');
  const { generateSheet } = await import('./film/v9/src/cues/generate.js');
  const { clipBarLabels } = await import('./film/v9/src/v8/data.js');
  let sheet = cueSheet || generateSheet({ bars: D.bars, labels: clipBarLabels(D), look, stage, aspect, preset: String(args.preset || 'default'), meta: { title: D.title, seed: args.seed, spb: D.beat } });
  // explicit --look / --stage flags win over the sheet's tracks
  for (const [p, v] of [['look', look], ['stage', stage]]) { sheet.base[p] = v; for (const tr of sheet.tracks) if (tr.path === p) tr.keys = [{ ...(tr.keys[0] || {}), b: 0, v }]; }
  if (args.hook !== undefined) sheet.base['social.hookIdx'] = +args.hook;   // v19.1 A/B hook variant (tags social.hooks)
  // v11 --intro on|off (default on): the 2-bar player + cover-flow intro at the clip start; off = start in the lab (as v10)
  const introFlag = args.intro === undefined ? null : !/^(off|0|false|no)$/i.test(String(args.intro));
  if (introFlag === false) { sheet.base['intro.on'] = false; sheet.tracks = sheet.tracks.filter((tr) => !tr.path.startsWith('intro.')); }
  else if (!args.test && (introFlag === true || sheet.base['intro.on'] !== false) && !sheet.tracks.some((tr) => tr.path === 'intro.index' || tr.path === 'intro.on' && tr.keys.some((k) => k.v === false))) {
    const gen = generateSheet({ bars: D.bars, labels: clipBarLabels(D), look, stage, aspect, preset: 'default', meta: { title: D.title, seed: args.seed, spb: D.beat } });   // sheets from before v11 get the default intro tracks
    sheet.tracks.push(...gen.tracks.filter((tr) => tr.path.startsWith('intro.')));
  }
  // v19 click times (composition seconds) = the mouse layer's clicks (same rules as film.js mouseWays): play, card, camera travels, CTA closes, hero
  { const oe = sheet.base['outro.end'] ?? 'auto'; STOPE = oe === 'stop' || (oe === 'auto' && D.bars > 32); TAGS_AUDIO = sheet.tags || {}; }
  if (look === 'player' && !args.test) { const BT = D.beat, ilT = sheet.tracks.find((tr) => tr.path === 'intro.length'), IBb = sheet.base['intro.on'] === false ? 0 : 4 * (ilT ? ilT.keys[0].v : 2), T2 = (bb) => bb * BT, w = [];
    if (PRE > 0) w.push(-0.06); if (IBb && PRE > 0 && sheet.base['intro.style'] === 'sphere') { const kb = (p, i, d) => { const tr = sheet.tracks.find((q) => q.path === p); return tr && tr.keys[i] ? tr.keys[i].b : d; }; w.push(T2(kb('intro.pitch', 1, -10.5)) - 0.02, T2(kb('intro.pitch', 2, -7)), T2(kb('intro.pick', 1, -6.1)) - 0.02); }   // v23: from the sheet's own keys   // v22 sphere: press, release after the drag, pick
    else if (IBb && PRE > 0) w.push(...(sheet.base['intro.browse'] === 0 ? [] : [T2(-3) - 0.02, T2(-2) - 0.02]), T2(-1.25) - 0.02);   // v21: no browse clicks on a direct pick else if (IBb) w.push(T2(Math.max(1, IBb - 2)) - 0.02);   // v19.3 browse x2 + choose, then play
    for (const tr of sheet.tracks) if (tr.path === 'camera.shot') for (const k of tr.keys) if (k.v !== 'wide') w.push(T2(k.b - (k.dur ?? 1)) - 0.02);
    for (const kk of ['cta1', 'cta2']) { const at = sheet.base[`social.${kk}.at`], ln = sheet.base[`social.${kk}.len`]; if (at != null) w.push(T2(at + (ln ?? 8)) - 0.02); }
    if (IBb && D.duration > T2(IBb + 16)) w.push((sheet.base['outro.mode'] ?? 'dialog') === 'dialog' ? D.duration - T2(STOPE ? 4 : 9) - 0.02 : D.duration - 2 * 4 * BT - T2(3) - 0.02);   // v23: full beat (stop) = the dialog 6.5 .. 4 beats before the end   // v21: the x of JOIN / CREATE PROJECT (E-9 beats)
    CLICKS = w.filter((x) => x + PRE >= 0 && x < D.duration).map((x) => +(x + PRE).toFixed(4)); }
  // v22.2 lab / computer SFX timeline (tools/sfx.py): the same moments the film shows: start swell, hook bleep + typing, sphere whir, lock-on, card title typing,
  // play boot, CTA bleeps + typing, terminal chirps + typing, the CLOSE PROJECT bleep + typing. Text lengths come from the film's own tags.
  if (look === 'player' && !args.test && !/^(off|0|false|no)$/i.test(String(args.sfx ?? 'on'))) { const { DEFAULT_TAGS } = await import('./film/v9/src/v8/tags.js');
    const BT = D.beat, T2 = (bb) => bb * BT, P = PRE, rate = BT / 24, get = (o, p) => p.split('.').reduce((q, k) => (q == null ? q : q[k]), o), tg = (p) => get(sheet.tags || {}, p) ?? get(DEFAULT_TAGS, p);
    const sub = (x) => String(x ?? '').replace(/\{[a-zA-Z]+\}/g, (m) => (m === '{title}' || m === '{titleWord}' ? String(D.title || '') : m === '{bpm}' ? String(Math.round(60 / BT)) : 'XXXX')), len = (x) => sub(x).length, E = [];
    E.push({ t: 0, kind: 'swell' }, { t: 0.25, kind: 'bleep' }, { t: 0.6, kind: 'type', n: len(tg('social.hook')), dt: BT / 12 });   // v22.5 hook at half speed
    { const L4 = tg('voice.lines') || [], at = String(tg('voice.ats') || VOICE_ATS).split(',').map(Number), du = String(tg('voice.durs') || VOICE_DURS).split(',').map(Number);
      if (P > 0) L4.forEach((q, i) => { const n = len(q) + 2; E.push({ t: at[i], kind: 'type', n, dt: (du[i] ?? 1.4) * 0.85 / Math.max(1, n - 2) }); }); }   // v22.5 the keys follow her lines
    const kb2 = (p, i, d) => { const tr = sheet.tracks.find((q) => q.path === p); return tr && tr.keys[i] ? tr.keys[i].b : d; }, SPK = kb2('intro.pick', 1, -6.1), STY = kb2('intro.type', 1, -4.4), STE = kb2('intro.type', 2, -3.4);
    if (sheet.base['intro.style'] === 'sphere') { const tl = String(D.title || '').length + 16; E.push({ t: P + T2(kb2('intro.pitch', 1, -10.5)), kind: 'whir', dur: T2(3.5) }, { t: P + T2(SPK) + 0.03, kind: 'lock' }, { t: P + T2(STY), kind: 'type', n: tl, dt: T2(STE - STY) / tl }); }
    if (P > 0) E.push({ t: P - 0.02, kind: 'boot' });
    for (const kk of ['cta1', 'cta2']) { const at = sheet.base[`social.${kk}.at`]; if (at != null) E.push({ t: P + T2(at), kind: 'bleep' }, { t: P + T2(at) + 0.15, kind: 'type', n: len(tg(`social.${kk}.title`)) + len(tg(`social.${kk}.body`)) + len(tg(`social.${kk}.sub`)), dt: rate }); }
    const term = tg('social.terminal') || []; for (const tr of sheet.tracks) if (tr.path === 'term.line') for (const k of tr.keys) { const tx = typeof k.v === 'number' ? term[k.v] : k.v; E.push({ t: P + T2(k.b), kind: 'chirp' }, { t: P + T2(k.b), kind: 'type', n: len(tx), dt: T2(1 / 16) }); }
    const ilT2 = sheet.tracks.find((tr) => tr.path === 'intro.length'), IB2 = sheet.base['intro.on'] === false ? 0 : 4 * (ilT2 ? ilT2.keys[0].v : 2);
    if (IB2 && (sheet.base['outro.mode'] ?? 'dialog') === 'dialog' && D.duration > T2(IB2 + 16)) { const w0 = D.duration / BT - (STOPE ? 1 : 6) - 5.5; E.push({ t: P + T2(w0), kind: 'bleep' }, { t: P + T2(w0) + 0.15, kind: 'type', n: len(tg('social.outro.title')) + len(tg('social.outro.body')) + len(tg('social.outro.sub')), dt: rate }); }
    // v22.3 (user: only keyboard taps, more serious): keep the typing, end each typed message with an enter press, drop the bleeps / chirps / swell / whir
    const keep = []; for (const e of E) if (e.kind === 'type') { keep.push(e); keep.push({ t: e.t + e.n * e.dt * 1.05 + 0.08, kind: 'enter' }); }
    // v22.6 recorded lab SFX (ElevenLabs library in U2C_SFX_DIR): CRT power-on at the start, centrifuge on the sphere drag, a scanner sweep on every camera
    // move, a relay clunk when each pop-up opens and on its x, data chatter on each terminal line, a quiet Geiger bed under the whole video
    const SD = process.env.U2C_SFX_DIR || '/home/user/research/sfx', has = (n) => fs.existsSync(path.join(SD, n + '.mp3')), smp = (t, n, db, extra = {}) => { if (has(n) && t >= 0) keep.push({ t, kind: 'sample', file: path.join(SD, n + '.mp3'), db, ...extra }); };
    // v22.7 (user: calmer, organic busy lab): lab ambience bed under the intro, glass clinks and little dings, no CRT / centrifuge / bloops
    if (P > 0 && (tg('sfx.stove') ?? true) !== false) smp(0.05, 'stove', 6);   // v23 the stove lights the lab
    if (P > 0) { smp(0.6, 'labamb', -7, { loop: true, dur: P - 0.2 }); for (const [tc, db] of [[1.1, -14], [2.9, -12], [5.2, -13], [6.9, -15]]) smp(tc, 'clink', db); smp(0.25, 'ding', -15); if (sheet.base['intro.style'] === 'sphere') { smp(P + T2(SPK) + 0.03, 'ding', -11); smp(P + T2(STY), 'clink', -10); } }   // v23: sparser, quieter (a room you could stand in)
    for (const tr of sheet.tracks) if (tr.path === 'camera.shot') for (const k of tr.keys) if (k.v !== 'wide') smp(P + T2(k.b - (k.dur ?? 1)), 'scan', -2);
    for (const kk of ['cta1', 'cta2']) { const at = sheet.base[`social.${kk}.at`], ln = sheet.base[`social.${kk}.len`] ?? 8; if (at != null) { smp(P + T2(at), 'relay', -6); smp(P + T2(at + ln) - 0.02, 'relay', -9); } }
    for (const tr of sheet.tracks) if (tr.path === 'term.line') for (const k of tr.keys) smp(P + T2(k.b), 'data', -4);
    if (IB2 && (sheet.base['outro.mode'] ?? 'dialog') === 'dialog' && D.duration > T2(IB2 + 16)) { const w0 = D.duration / BT - (STOPE ? 1 : 6) - 5.5; smp(P + T2(w0), 'relay', -6); smp(P + T2(w0 + 2.5) - 0.02, 'relay', -9); }
    smp(0, 'geiger', -14, { loop: true, dur: D.duration + P });
   // v22.5 room tone + two serious bloops (hook window, the pick)
    SFX = keep.filter((e) => e.t >= 0 && e.t < D.duration + P); }
  const cuesTags = {}; if (args.title) cuesTags.title = String(args.title);
  cuesTags.date = args.date ? String(args.date) : (tags.date === '{today}' || !tags.date ? today : tags.date);
  if (args.tags) Object.assign(cuesTags, JSON.parse(fs.readFileSync(path.resolve(String(args.tags)), 'utf8')));
  const cuesFile = `data/cues-${look}-${stage}-${aspect}-${id}${args.test ? '-test' : ''}.js`;
  fs.writeFileSync(path.join(FILM, cuesFile), 'window.U2C_CUES=' + JSON.stringify({ sheet: serializeSheet(sheet), tags: cuesTags, waveDebug: !!args['wave-debug'], preroll: PRE, mblur: args.stills ? 1 : Math.max(1, Math.round(+(args.mblur ?? 3))), shutter: +(args.shutter ?? 0.5) }) + ';\n');
  fs.writeFileSync(path.join(FILM, 'data', `cues-${look}-${stage}-${aspect}-${id}.json`), JSON.stringify(serializeSheet(sheet), null, 1));
  comp = `v9-${look}${args.test ? '-test-' + args.test : ''}-${stage}-${aspect}-${id}.html`;
  const DUR9 = args.test ? +(Math.min(D.duration, 4 * 4 * D.beat)).toFixed(6) : +(D.duration + PRE).toFixed(6);   // v19: + the silent click-to-play pre-roll
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
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf', '.css': 'text/css', '.ttf': 'font/ttf' };
  const srv = http.createServer((q, s) => { const p = path.join(FILM, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(FILM) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const br = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
  const pg = await br.newPage(); await pg.setViewport({ width: W, height: H });
  pg.on('pageerror', (e) => console.error('pageerror', e.message, (e.stack || '').slice(0, 300))); pg.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); }); pg.on('requestfailed', (r) => console.error('requestfailed', r.url()));
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
// v24 (audit V5): capture-bound, ~1 s per frame per Chrome; 2 workers render as fast as 4 on this 4-core box, so each render takes 2 and the
// 9:16 + 16:9 pair (rendered in parallel by u2c.py) fills the machine without oversubscribing it. --workers N overrides.
run('npx', ['hyperframes', 'render', '.', '-c', comp, '-o', tmp, ...q, '--fps', '30', '--workers', String(args.workers ?? 2), '--quiet'], { cwd: FILM, env, quiet: true });
const AUX = String(comp || 'u2c').replace(/\.html$/, '') + '-';   // v22.6: per-render temp audio (9:16 and 16:9 render in parallel)
const useClicks = CLICKS.length && !/^(off|0|false|no)$/i.test(String(args.clicks ?? 'on'));
if (useClicks) run('python3', [path.join(ROOT, 'tools', 'clicks.py'), '--out', path.join(FILM, 'renders', AUX + 'clicks.wav'), '--dur', String(D.duration + PRE), '--times', CLICKS.join(','), '--gain-db', String(args['click-db'] ?? -16)], { quiet: true });
const audioIn = path.join(FILM, 'data', id + '.wav'), dly = PRE > 0 ? `adelay=${Math.round(PRE * 1000)}:all=1,` : '';
// v22.1 lab voice (offline Piper, tools/voice.py): "<title>. Experimentation." while the hook rises, "Initiating playback." just before the play click
const useVoice = look === 'player' && PRE >= 3 && !args.test && !/^(off|0|false|no)$/i.test(String(args.voice ?? 'on')) && fs.existsSync(path.join(ROOT, 'tools', 'voice.py'));
const useSfx = SFX.length > 0; if (useSfx) { fs.writeFileSync(path.join(FILM, 'renders', AUX + 'sfx.json'), JSON.stringify(SFX)); run('python3', [path.join(ROOT, 'tools', 'sfx.py'), '--events', path.join(FILM, 'renders', AUX + 'sfx.json'), '--dur', String(D.duration + PRE), '--out', path.join(FILM, 'renders', AUX + 'sfx.wav'), '--gain-db', String(args['sfx-db'] ?? -14)], { quiet: true }); }
if (useVoice) run('python3', [path.join(ROOT, 'tools', 'voice.py'), '--title', String(D.title || args.title || 'U2C'), '--dur', String(D.duration + PRE), '--out', path.join(FILM, 'renders', AUX + 'voice.wav'), ...((args['voice-source'] || process.env.U2C_VOICE_SOURCE) ? ['--source', path.resolve(String(args['voice-source'] || process.env.U2C_VOICE_SOURCE)), '--ats', String(args['voice-ats'] || (TAGS_AUDIO.voice || {}).ats || VOICE_ATS), '--gain-db', '0'] : [])], { quiet: true });   // v22.2: a recorded take (ElevenLabs) when given
// v23 (user's sound design): the voice doubled one octave DOWN (-12 semitones, rubberband, formants shifted with it: a little scary), mixed
// under the dry voice (tag voice.sub dB, default -8; 'off' = none); and a gas-stove ignition (clicks, then the flame) on frame 0 (sfx.stove)
if (useVoice) { let subDb = String(args['voice-sub-db'] ?? (cueTagsForAudio().voice || {}).sub ?? '-8'); if (!/^(off|none|false)$/i.test(subDb)) { const vIn = path.join(FILM, 'renders', AUX + 'voice.wav'), vOut = path.join(FILM, 'renders', AUX + 'voice-sub.wav');
  run('ffmpeg', ['-v', 'error', '-y', '-i', vIn, '-filter_complex', `[0:a]asplit=2[a][b];[b]rubberband=pitch=0.5,adelay=12:all=1,volume=${+subDb}dB,lowpass=f=6000[s];[a][s]amix=inputs=2:normalize=0[o]`, '-map', '[o]', vOut], { quiet: true }); fs.renameSync(vOut, vIn); } }
{ const ins = ['-i', tmp, '-i', audioIn], parts = [`[1:a]${dly}aresample=48000[b]`], lab = ['[b]']; let n = 2;
  if (useClicks) { ins.push('-i', path.join(FILM, 'renders', AUX + 'clicks.wav')); parts.push(`[${n}:a]aresample=48000[k]`); lab.push('[k]'); n++; }
  if (useSfx) { ins.push('-i', path.join(FILM, 'renders', AUX + 'sfx.wav')); parts.push(`[${n}:a]aresample=48000[s]`); lab.push('[s]'); n++; }
  if (useVoice) { ins.push('-i', path.join(FILM, 'renders', AUX + 'voice.wav')); parts.push(`[${n}:a]aresample=48000[v]`); lab.push('[v]'); n++; }
  const fc = parts.join(';') + `;${lab.join('')}amix=inputs=${lab.length}:normalize=0:duration=first[a]`;
  run('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out], { quiet: true }); }
const lo = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const s = lo.slice(lo.lastIndexOf('Summary:'));
console.log(`${out}  ${((Date.now() - t0) / 1000).toFixed(0)} s  I ${s.match(/I:\s+(-?[\d.]+)/)[1]} LUFS  TP ${s.match(/Peak:\s+(-?[\d.]+)/)[1]} dBTP  section: song bars ${D.song.startBar}-${D.song.startBar + D.bars - 1}`);
if (args.filmstrip) {
  const fs_ = out.replace(/\.mp4$/, '-filmstrip.png'), dir = path.join(ROOT, 'out', ENGINE, 'filmstrips'); fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(fs_));
  run(path.join(ROOT, 'tools', 'filmstrip.sh'), [out, dst, aspect === '169' ? '6' : '8', len >= 60 ? '4' : '2'], { quiet: true });
  console.log(dst);
}
