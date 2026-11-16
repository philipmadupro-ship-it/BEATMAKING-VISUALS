// Default cue sheets from the analysis (pure). The default reproduces the v8 film: wide by default, three focus pushes
// (in on the beat before a bar line, hold 1-2 bars, back out), placed on 4-bar phrase lines and chosen by the section
// there (a drop gets the logo, a build the EQ, a break the pendant, otherwise the look's v8 rotation), pendant amplitude
// per section (drop 9 deg, else 4.6; RUBEDO 9.8 / 5), the logo cycling IN/OUT over 2 bars with a hero bar on the
// first drop, a 1-frame invert on the drop downbeat, glitch off. Every generated track is marked auto: it is rebuilt
// when the analysis, the section, the look or the stage changes, until the user edits it.
import { emptySheet, newId, defaultEase } from './schema.js';
import { FOCUS_PLAN, LAYOUT, CONTENT } from '../v8/layout.js';
import { stageOf } from '../v8/core.js';

export const PRESETS = {
  default: { name: 'From the analysis', blurb: 'v8: three focus pushes on phrase lines, picked by section' },
  calm: { name: 'Calm', blurb: 'wide the whole time, gentle swing, logo on a 4-bar cycle' },
  drop: { name: 'Drop-focused', blurb: 'logo hero + cut in on every drop, bigger swing, a flash per drop' },
  tour: { name: 'Meter tour', blurb: 'a different meter featured every 2 bars, pushes on bar lines' },
};
const key = (b, v, extra = {}) => ({ id: newId(), b, v, ...extra });
const track = (path, kind, lane, keys) => ({ id: newId('t'), path, kind, lane, auto: true, keys: keys.map((k) => ({ ...k, ease: k.ease || defaultEase(kind) })) });

/**
 * generateSheet({bars, labels (per clip bar), look, stage, aspect, preset, title}) -> internal sheet.
 */
export function generateSheet({ bars = 16, labels = [], look = 'exe', stage = 'nigredo', aspect = '916', preset = 'default', meta = {} } = {}) {
  const S = stageOf(stage), sheet = emptySheet({ bars, look, aspect, preset, ...meta }), NB = bars, lab = (k) => labels[k] || 'groove';
  const ids = Object.keys(LAYOUT[look][aspect]), dropBars = []; for (let k = 0; k < NB; k++) if (lab(k) === 'drop' && (k === 0 || lab(k - 1) !== 'drop')) dropBars.push(k);
  sheet.base.look = look; sheet.base.stage = stage;
  // camera
  const cam = [];
  const push = (bar, id, hold, ease = 'easeInOut', dur = 1) => { cam.push(key(bar * 4, id, { transition: 'push', dur, ease })); cam.push(key((bar + hold) * 4, 'wide', { transition: 'push', dur, ease })); };
  if (preset === 'default') {
    const rot = FOCUS_PLAN[look].map(([, id, n]) => [id, n]), used = [];
    let i = 0;
    for (let bar = 3; bar < NB; bar += 4) {
      // a section change within a bar of the push picks the window for that section; otherwise the look's v8 rotation
      let [id, n] = rot[i % rot.length]; i++;
      const chg = [bar - 1, bar, bar + 1].find((k) => k > 0 && k < NB && lab(k) !== lab(k - 1)), sec = chg != null ? lab(chg) : null;
      const want = sec === 'drop' ? 'chains' : sec === 'build' ? 'eq' : sec === 'break' ? 'elephant' : null;
      if (want && ids.includes(want) && used[used.length - 1] !== want) { id = want; n = want === 'chains' && look === 'lab' ? 1 : 2; }
      if (!ids.includes(id) || bar + n >= NB - 2) continue;
      push(bar, id, n); used.push(id);
    }
  } else if (preset === 'drop') {
    for (const d of dropBars) { if (d + 1 >= NB - 1) continue; cam.push(key(d * 4, 'chains', { transition: 'cut', ease: 'step' })); cam.push(key(d * 4 + 4, 'wide', { transition: 'push', dur: 1, ease: 'expoOut' })); }
  } else if (preset === 'tour') {
    const tour = ['spectrum', 'eq', 'loud', 'stereo', 'spectro', 'session', 'elephant', 'chains', 'surface'].filter((id) => ids.includes(id)); let j = 0;
    for (let bar = 2; bar + 2 <= NB - 2; bar += 2) { const id = tour[j++ % tour.length]; cam.push(key(bar * 4, id, { transition: 'push', dur: 1, ease: 'easeInOut' })); }
    if (cam.length) cam.push(key(Math.min(NB - 2, 2 + 2 * j) * 4, 'wide', { transition: 'push', dur: 1, ease: 'easeInOut' }));
  }
  sheet.tracks.push(track('camera.shot', 'shot', 'camera', cam));
  // featured meter
  const feat = [key(0, 'auto')];
  if (preset === 'tour') { const tour = cam.filter((k) => k.v !== 'wide'); for (const k of tour) feat.push(key(k.b, k.v)); feat.push(key((NB - 2) * 4, 'auto')); }
  if (preset === 'calm') feat[0].v = 'none';
  sheet.tracks.push(track('focus.featured', 'enum', 'focus', feat));
  sheet.tracks.push(track('look', 'enum', 'look', [key(0, look)]));
  sheet.tracks.push(track('stage', 'enum', 'stage', [key(0, stage)]));
  // logo: cycle length (bars) + hero moments
  sheet.tracks.push(track('logo.cycle', 'number', 'logo', [key(0, preset === 'calm' ? 4 : 2, { ease: 'step' })]));
  const hero = preset !== 'drop' ? [] : dropBars.filter((d) => d < NB - 2).map((d) => key(d * 4, true, { dur: 4 }));
  sheet.tracks.push(track('logo.hero', 'clip', 'logo', hero));
  // pendant amplitude per section (degrees), stepped at section changes
  const amp = []; let prev = null;
  for (let k = 0; k < NB; k++) { const drop = lab(k) === 'drop', v = preset === 'calm' ? S.swingDeg.calm * 0.7 : (drop ? S.swingDeg.drop * (preset === 'drop' ? 1.25 : 1) : S.swingDeg.calm);
    if (v !== prev) { amp.push(key(k * 4, Math.round(v * 100) / 100, { ease: 'step' })); prev = v; } }
  sheet.tracks.push(track('pendant.amp', 'number', 'pendant', amp));
  sheet.tracks.push(track('text.cue', 'clip', 'text', []));
  // FX: the drop downbeat flash (v8: once per video), glitch opt-in (empty)
  const flash = preset === 'calm' ? [] : (preset === 'drop' ? dropBars : dropBars.slice(0, 1).length ? dropBars.slice(0, 1) : [NB >= 8 ? 5 : 1]).map((d) => (NB >= 8 && d < 2 ? d + 4 : d)).filter((d) => d < NB).map((d) => key(d * 4, true));
  sheet.tracks.push(track('fx.flash', 'event', 'fx', flash));
  sheet.tracks.push(track('fx.glitch', 'clip', 'fx', []));
  // v11 intro (2 bars at the clip start): the cover-flow starts on cover-4 and steps monotonically toward cover-0
  // (4 → 3 → 2 → 1 → 0), one card per beat, each eased snap (half a beat of travel) LANDING ON beats 3, 4, 5, 6; the selection
  // brackets step in at beat 6, then a hard push-in (exponential zoom, accelerating) that cuts into the lab on the downbeat of bar 3.
  if (NB >= 8) {
    const IL = 2, land = IL * 4 - 2, v0 = 4, idx = [key(0, v0, { ease: 'step' })];
    for (let k = 1; k <= 4; k++) { idx.push(key(land - 4 + k - 0.5, v0 - (k - 1), { ease: 'easeInOut' })); idx.push(key(land - 4 + k, v0 - k, { ease: 'step' })); }
    sheet.tracks.push(track('intro.index', 'number', 'stage', idx));
    sheet.tracks.push(track('intro.push', 'number', 'stage', [key(land, 0, { ty: 'bezier', ob: [0.62, 0], ease: 'easeInOut' }), key(IL * 4, 1, { ib: [-0.12, 0], ease: 'step' })]));
  }
  return sheet;
}

/** Replace the auto tracks of `sheet` with freshly generated ones (user-edited tracks are kept). */
export function refreshAuto(sheet, opts) {
  const gen = generateSheet({ ...opts, preset: sheet.meta.preset || 'default' }), keep = sheet.tracks.filter((t) => !t.auto), paths = new Set(keep.map((t) => t.path));
  sheet.tracks = [...gen.tracks.filter((t) => !paths.has(t.path)), ...keep];
  sheet.meta = { ...sheet.meta, bars: opts.bars, look: opts.look, aspect: opts.aspect };
  return sheet;
}
export { CONTENT };
