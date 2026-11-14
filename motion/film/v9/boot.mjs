// Native v9 boot: the web app's composition (src/v8/film.js, synced) on the native analysis (window.U2C_DATA, adapted
// by fromNative) driven by window.U2C_CUES = { sheet, tags, opts }. Exposes U2C6 {renderAt, schedule, trace, waveDebug}.
import { createFilm } from './src/v8/film.js';
import { fromNative } from './src/v8/data.js';
import { loadAssets } from './src/v8/assets.js';
import { DEFAULT_TAGS } from './src/v8/tags.js';
import { parseSheet, createEvaluator, mergeDeep } from './src/cues/schema.js';
const C = window.U2C_CUES, html = document.documentElement, aspect = html.dataset.aspect, test = html.dataset.test || '';
const D = fromNative(window.U2C_DATA);
const [assets] = await Promise.all([loadAssets('v9/assets/'),
  ...['800 22px "JetBrains Mono"', '700 22px "JetBrains Mono"', '500 22px "JetBrains Mono"', '400 22px "JetBrains Mono"', '600 22px "Instrument Sans"', 'italic 400 40px "Instrument Serif"', '700 24px "Caveat"']
    .map((f) => document.fonts.load(f, 'EXP-03 Atelmansion 0123456789'))]);
const film = createFilm({ D, assets, aspect }), sheet = parseSheet(C.sheet), ev = createEvaluator(sheet);
const tags = mergeDeep(mergeDeep(DEFAULT_TAGS, sheet.tags || {}), C.tags || {});
const ctx = document.getElementById('stage').getContext('2d');
const opts = { ev, tags, fps: D.fps, look: html.dataset.look, stage: html.dataset.stage, test };
if (C.waveDebug) film.core.waveDebug = {};
const render = (t) => film.render(ctx, t, opts);
window.__u2cBoot(render, {
  film, sheet, D,
  schedule: () => film.schedule(ev, opts),
  trace: (t) => film.trace(t, ev),
  chainInfo: () => { film.trace(0, ev); return film.brand.chainInfo(); },
  waveDebug: () => film.core.waveDebug,
});
