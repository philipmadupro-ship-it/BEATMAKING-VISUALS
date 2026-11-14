#!/usr/bin/env node
// Sync the shared look code from the U2C Studio web app into the native renderer (single source of truth: the web
// app's src/v8 + src/cues). The native v9 page (film/v9) imports these files as ES modules, so both renderers run the
// SAME composition code. Never edit film/v9/src by hand: edit web-app/src and re-run this.
//
//   node tools/sync_web.mjs [--web /home/user/beatmaking-visuals/web-app] [--check]
//   --check   exit 1 if film/v9/src differs from the web app (render.mjs runs this and warns)
// Writes film/v9/SYNCED.json: source path, git commit of the web repo, sha256 of every file.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WEB = path.resolve(opt('--web', process.env.U2C_WEB || '/home/user/beatmaking-visuals/web-app')), CHECK = argv.includes('--check');
const DST = path.join(ROOT, 'film', 'v9');
const FILES = [
  ...fs.readdirSync(path.join(WEB, 'src/v8')).filter((f) => f.endsWith('.js')).map((f) => ['src/v8/' + f, 'src/v8/' + f]),
  ...['schema.js', 'generate.js', 'adapter-native.mjs'].map((f) => ['src/cues/' + f, 'src/cues/' + f]),
  // meters v2: the analysis modules tools/meterdata.mjs runs for the native data (same numbers as the web app)
  ...['meterstreams.js', 'msspec.js', 'dsp.js', 'stereo.js', 'truepeak.js'].map((f) => ['src/analysis/' + f, 'src/analysis/' + f]),
  ['src/export/audio.js', 'src/export/audio.js'],
  ...['u2c-links.png', 'u2c-links-edge.png', 'elephant.png', 'elephant-rig.json'].map((f) => ['assets/' + f, 'assets/' + f]),
];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
let diff = 0; const man = { source: WEB, commit: spawnSync('git', ['-C', WEB, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), files: {} };
for (const [src, dst] of FILES) {
  const a = path.join(WEB, src), b = path.join(DST, dst); man.files[dst] = sha(a);
  const same = fs.existsSync(b) && sha(b) === man.files[dst];
  if (!same) { diff++; if (CHECK) console.log('differs: ' + dst); else { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); } }
}
if (CHECK) { console.log(diff ? `film/v9 is ${diff} file(s) behind ${WEB} (run node tools/sync_web.mjs)` : 'film/v9 in sync with ' + WEB); process.exit(diff ? 1 : 0); }
fs.writeFileSync(path.join(DST, 'SYNCED.json'), JSON.stringify(man, null, 1) + '\n');
console.log(`synced ${FILES.length} files (${diff} changed) from ${WEB} @ ${man.commit}`);
