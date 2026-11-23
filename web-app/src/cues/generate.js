// Default cue sheets from the analysis (pure). The default reproduces the v8 film: wide by default, three focus pushes
// (in on the beat before a bar line, hold 1-2 bars, back out), placed on 4-bar phrase lines and chosen by the section
// there (v12: SECTION_PUSH per look - exe: drop -> spectrum, build -> waveform, break -> imager; no EQ pushes, the plan
// rotates waveform / spectrum / imager / levels; lab and scope keep logo / pendant), otherwise the look's rotation), pendant amplitude
// per section (drop 9 deg, else 4.6; RUBEDO 9.8 / 5), the logo cycling IN/OUT over 2 bars with a hero bar on the
// first drop, a 1-frame invert on the drop downbeat, glitch off. Every generated track is marked auto: it is rebuilt
// when the analysis, the section, the look or the stage changes, until the user edits it.
import { emptySheet, newId, defaultEase } from './schema.js';
import { FOCUS_PLAN, SECTION_PUSH, LAYOUT, CONTENT } from '../v8/layout.js';
import { stageOf } from '../v8/core.js';

export const PRESETS = {
  default: { name: 'Lab', blurb: 'the player: a window every 2 bars (waveform, hero, rack first), two wide breaths for the CTAs' },
  hero: { name: 'Hero', blurb: 'the player, the hero card every other visit: the cover is the resting place' },
  calm: { name: 'Calm / YouTube', blurb: 'the player, one slow move every 4 bars, a wide breath between visits' },
  tour: { name: 'Rack tour', blurb: 'the player, every window in turn, few wide breaths' },
  full: { name: 'Full beat', blurb: 'the whole beat: hero-preferred visits, plays in the player to the end and stops (no loop)' },
  drop: { name: 'Drop-focused', blurb: 'legacy looks: logo hero + cut in on every drop' },
};
// v23: the player presets (PLAYER_PRESETS) are what the Look tab, the home grid and batches offer; the legacy looks keep default/calm/drop/tour
export const PLAYER_PRESETS = ['default', 'hero', 'calm', 'tour', 'full'];
// v23 intro moments in COMPOSITION seconds (0 = frame 0, PRE_S = the play click / beat 0); the generator turns them into beats with the beat length,
// so the intro (and the voice, which is placed in seconds) times the same at every BPM. PRE_S is THE pre-roll (exporter, review and render.mjs read it).
export const PRE_S = 9.0;
// v26: no playerIn fade any more: the paused player is in place on frame 0 (the thumbnail = the loop's last frame is a finished picture)
export const INTRO_S = { press: 3.7, release: 5.9, pick: 6.3, land: 7.1, typeEnd: 7.9, select: 8.25 };
// v21 seeded randomness: mulberry32 on a string hash, so every beat gets its own (repeatable) variation; meta.seed overrides
const hashStr = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const shuffle = (R, arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const key = (b, v, extra = {}) => ({ id: newId(), b, v, ...extra });
const track = (path, kind, lane, keys) => ({ id: newId('t'), path, kind, lane, auto: true, keys: keys.map((k) => ({ ...k, ease: k.ease || defaultEase(kind) })) });

/**
 * generateSheet({bars, labels (per clip bar), look, stage, aspect, preset, title}) -> internal sheet.
 */
export function generateSheet({ bars = 16, labels = [], look = 'exe', stage = 'nigredo', aspect = '916', preset = 'default', meta = {} } = {}) {
  const seed = meta.seed != null && meta.seed !== '' ? hashStr('seed:' + meta.seed) : hashStr(meta.title || 'u2c');
  const S = stageOf(stage), sheet = emptySheet({ bars, look, aspect, preset, ...meta }), NB = bars, lab = (k) => labels[k] || 'groove';
  const ids = Object.keys(LAYOUT[look][aspect]), dropBars = []; for (let k = 0; k < NB; k++) if (lab(k) === 'drop' && (k === 0 || lab(k - 1) !== 'drop')) dropBars.push(k);
  sheet.base.look = look; sheet.base.stage = stage;
  if (look === 'player') sheet.base['meter.session.span'] = 1;
  if (look === 'player') sheet.base['result.on'] = false;   // v17: no end card: the film ends inside the hero cover and loops into the intro   // v14.2: the player waveform shows one bar = twice the detail
  // camera
  const cam = [];
  const push = (bar, id, hold, ease = 'easeInOut', dur = 1) => { cam.push(key(bar * 4, id, { transition: 'push', dur, ease })); cam.push(key((bar + hold) * 4, 'wide', { transition: 'push', dur, ease })); };
  if (look === 'player' && PLAYER_PRESETS.includes(preset)) {
    // v15.2 TikTok rhythm: in on a panel for 1 bar, back to wide for 1 bar, every 2 bars from bar 3; snappy half-beat moves
    const rot = ['spectrum', 'session', 'stereo', 'loud', 'stage'].filter((id) => ids.includes(id)); let i = 0;
    // v17 never-cut (v17 prompt): the camera TRAVELS panel to panel (no return to wide between them), one move every 2 bars, MD3 Emphasized,
    // 1 beat long, landing ON the bar; one wide breath per cycle; the last 2 bars push into the hero and the final bar zooms into its cover
    // (camera.zoom) so the video ends on the cover and loops into the cover-flow intro, which opens on the same cover
    // v19.1: wide breaths in the cycle; the two CTA alerts land on the first two wide breaths (over the whole desktop, never over a zoomed panel)
    // v21 seeded order (user: "random, the tapped window aleatoire; concentrate on the hero card sometimes"): groups of [panel, panel, wide, panel, wide] (two wide breaths per 16 bars for the two CTAs); the panels are a
    // seeded shuffle where the hero (stage) comes twice per cycle and the rack once, never the same window twice in a row; the first panel is seeded too
    const RND = rng(seed), others = ['spectrum', 'session', 'stereo', 'loud', ...(aspect === '169' ? ['meta'] : [])].filter((id) => ids.includes(id)), wides = []; let bar = 3, last = 'stage';
    const cyc = () => { const o = shuffle(RND, others.slice()), A = shuffle(RND, ['stage', 'inserts', 'session'].filter((q) => ids.includes(q))), B = shuffle(RND, o.filter((q) => q !== 'session').slice(0, 2)); return [...A, ...B]; };   // v22 (user): the first 3 visits = waveform + hero + rack, once each, seeded order
    // v23 player presets: hero (the hero every other visit), calm (a move every 4 bars, wide between visits, 4-beat glides), tour (every window, one
    // wide per 5 stops), full (the whole beat: hero-preferred like hero, 3-beat glides). Long clips (> 32 bars) prefer the hero in every preset.
    const heroPref = preset === 'hero' || preset === 'full' || NB > 32, WIDE = preset === 'calm' ? [1, 3] : preset === 'tour' ? [4] : [2, 4], CYC = preset === 'calm' ? 4 : 5, STEP = preset === 'calm' ? 4 : 2;
    const DUR = preset === 'calm' ? 4 : preset === 'full' || aspect === '169' ? 3 : 2; let nVis = 0;
    let pool = cyc(), pi = 0, slot = 0; const seq = { next() { { const sl = slot++ % CYC; if (WIDE.includes(sl)) return 'wide'; } if (heroPref && ids.includes('stage') && nVis++ % 2 === 1 && last !== 'stage') { last = 'stage'; return 'stage'; } if (pi >= pool.length) { pool = cyc(); pi = 0; } let id = pool[pi++]; if (heroPref && id === 'stage') { if (pi >= pool.length) { pool = cyc(); pi = 0; } id = pool[pi++]; } if (id === last && pi < pool.length) { [pool[pi - 1], pool[pi]] = [pool[pi], pool[pi - 1]]; id = pool[pi - 1]; } last = id; return id; } };
    // v26 camera rule (user: "when you zoom, it always goes back to full screen before and after clicking a window, if not it's too much"): every visit is
    // wide -> push into the window (DUR beats, landing ON the bar) -> hold HOLD beats -> back to wide (OUT beats); never panel-to-panel travel. A 'wide'
    // slot adds nothing (the camera is already wide): it is the long breath the two CTAs land on. The drop push (intro) and the hero ending stay in.
    const HOLD = preset === 'calm' ? 4 : 2, OUT = preset === 'calm' ? 4 : 2;
    for (; bar < NB - 4; bar += STEP) { const id = seq.next(); if (id === 'wide') { wides.push(bar); continue; } cam.push(key(bar * 4, id, { transition: 'push', dur: DUR, ease: 'spring' })); cam.push(key(bar * 4 + HOLD + OUT, 'wide', { transition: 'push', dur: OUT, ease: 'spring' })); }   // v19.1: YouTube 16:9 moves are calmer (3 beats)
    if (preset === 'full') sheet.base['outro.end'] = 'stop';
    if (wides[0] != null) { sheet.base['social.cta1.at'] = wides[0] * 4 + 1; sheet.base['social.cta1.len'] = 4; }
    if (wides[1] != null) { sheet.base['social.cta2.at'] = wides[1] * 4 + 1; sheet.base['social.cta2.len'] = 4; }
    // v21 terminal words (tags social.terminal[0..3]): LOADING right after the arrival, ANALYSING one phrase later, LAB TEST on the negative bar (or bar 7), EXPORT
    // COMPLETE before the hero outro; each clip types in, holds, deletes backwards. Never on a CTA beat.
    { const neg = (() => { for (let k2 = 4; k2 < NB - 1; k2++) if ((k2 - 2) % 4 === 0 && lab(k2) === 'drop') return k2; return 9; })(), T0 = [[2 * 4 + 3, 0, 5], [4 * 4 + 1, 1, 5], [neg * 4 + 1, 2, 5], [(NB - 4) * 4 + 1, 3, 4]];
      const busy = (b2) => [sheet.base['social.cta1.at'], sheet.base['social.cta2.at']].some((a2) => a2 != null && b2 + 5 > a2 && b2 < a2 + 4);
      sheet.tracks.push(track('term.line', 'clip', 'text', T0.filter(([b2]) => b2 < (NB - 3) * 4 && !busy(b2)).map(([b2, v, d]) => key(b2, v, { dur: d })))); }
    if (ids.includes('stage') && NB >= 8) { cam.push(key((NB - 3) * 4, 'stage', { transition: 'push', dur: 2, ease: 'spring' })); sheet.tracks.push(track('intro.open', 'number', 'stage', [key(0, 3, { ease: 'step' })]));
      }   // v25: the hero visit before the end = the CLOSE PROJECT? dialog, then the infinite zoom into the hero cover that becomes frame 0 (film.js outroZoom)
  } else if (preset === 'default') {
    const rot = FOCUS_PLAN[look].map(([, id, n]) => [id, n]), used = [];
    let i = 0;
    for (let bar = 3; bar < NB; bar += 4) {
      // a section change within a bar of the push picks the window for that section; otherwise the look's v8 rotation
      let [id, n] = rot[i % rot.length]; i++;
      const chg = [bar - 1, bar, bar + 1].find((k) => k > 0 && k < NB && lab(k) !== lab(k - 1)), sec = chg != null ? lab(chg) : null;
      const want = sec ? SECTION_PUSH[look][sec] || null : null;
      if (want && ids.includes(want) && used[used.length - 1] !== want) { id = want; n = want === 'chains' && look === 'lab' ? 1 : 2; }
      if (!ids.includes(id) || bar + n >= NB - 2) continue;
      push(bar, id, n); used.push(id);
    }
  } else if (preset === 'drop') {
    for (const d of dropBars) { if (d + 1 >= NB - 1) continue; cam.push(key(d * 4, ids.includes('chains') ? 'chains' : 'spectrum', { transition: 'cut', ease: 'step' })); cam.push(key(d * 4 + 4, 'wide', { transition: 'push', dur: 1, ease: 'expoOut' })); }
  } else if (preset === 'tour') {
    const tour = ['spectrum', 'loud', 'stereo', 'spectro', 'session', 'elephant', 'chains', 'surface'].filter((id) => ids.includes(id)); let j = 0;
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
  sheet.tracks.push(track('logo.cycle', 'number', 'logo', [key(0, preset === 'calm' || look === 'player' ? 4 : 2, { ease: 'step' })]));   // v17.2 player: 4-bar cycle = each letter threads over 2 beats (smoother in/out)
  const hero = preset !== 'drop' ? [] : dropBars.filter((d) => d < NB - 2).map((d) => key(d * 4, true, { dur: 4 }));
  sheet.tracks.push(track('logo.hero', 'clip', 'logo', hero));
  // pendant amplitude per section (degrees), stepped at section changes
  const amp = []; let prev = null;
  for (let k = 0; k < NB; k++) { const drop = lab(k) === 'drop', v = preset === 'calm' ? S.swingDeg.calm * 0.7 : (drop ? S.swingDeg.drop * (preset === 'drop' ? 1.25 : 1) : S.swingDeg.calm);
    if (v !== prev) { amp.push(key(k * 4, Math.round(v * 100) / 100, { ease: 'step' })); prev = v; } }
  sheet.tracks.push(track('pendant.amp', 'number', 'pendant', amp));
  sheet.tracks.push(track('text.cue', 'clip', 'text', []));
  // FX: the drop downbeat flash (v8: once per video), glitch opt-in (empty)
  const flash = [];   // v14: the 1-frame invert reads as a glitch on a phone: OFF by default in every look (still keyframeable: fx.flash)
  sheet.tracks.push(track('fx.flash', 'event', 'fx', flash));
  sheet.tracks.push(track('fx.glitch', 'clip', 'fx', []));
  // v15 scroll-stop: the first drop phrase bar after the lab opens (intro + >= 2 bars, on a 4-bar phrase) plays as the white negative (whole frame inverted for 1 bar, hard in / hard out); player look only
  sheet.tracks.push(track('fx.invert', 'clip', 'fx', look === 'player' ? (() => { const ib = NB >= 8 ? 2 : 0; for (let k2 = ib + 2; k2 < NB - 1; k2++) if ((k2 - ib) % 4 === 0 && lab(k2) === 'drop') return [key(k2 * 4, true, { dur: 4 })]; return []; })() : []));
  if (look === 'player') sheet.base['meter.session.style'] = 'blocks';
  // v11/v13 intro (2 bars at the clip start). START (v13): nothing is static: on beat 1 (t = 0) the cards fan out of one stack and the player
  // rises into place (intro.enter, linear 0 -> 1 over beats 0-2; the shapes are in intro.js: the fan lands on beat 2, the player on beat 3).
  // (v13) The cover-flow started on cover-4 and stepped toward cover-0; v17.1 opens on cover-0 (below), one card per beat, each eased snap
  // (half a beat of travel) LANDING ON beats 4, 5, 6, 7 (index 3..6 from 0); the selection brackets step in at beat 7 (index 6) and the push
  // (ZOOM INTO THE PROJECT) runs from there to the downbeat of bar 3: exponential zoom, EASE-IN (cubic-bezier(.7,0,1,1)): the speed peaks
  // exactly at the cut, where the lab opens on the same cover card (match cut) and dollies out (intro.open, default 2 beats, speed peaks at
  // the cut too): one move through the cover, with streak copies on both sides.
  if (NB >= 8 && look === 'player') {
    // v19.3 player intro logic (user): FIRST browse + choose (silent pre-roll, negative beats: the cursor clicks the cover-flow twice, 2 -> 1 -> 0,
    // then clicks the chosen card = selection brackets), THEN the cursor clicks play at beat 0 (the music starts) and the push into the project
    // runs over the first bar (intro.length 1); the lab opens on the cover and dollies out (intro.open 3). Pre-roll = 4 beats (native --preroll).
    sheet.tracks.push(track('intro.length', 'number', 'stage', [key(0, 0.25, { ease: 'step' })]));   // v27.1 (user): no push-in after the click: one beat on the card, then the lab opens on the cover and DE-ZOOMS out (intro.open)
    // v21 seeded browse (user: "sometimes left, sometimes right, sometimes it clicks directly"): +1 = the cards step in from the left (2 -> 1 -> 0, the cursor
    // clicks the left card), -1 = from the right (-2 -> -1 -> 0, clicks the right card), 0 = the beat cover is already centred and the cursor picks it directly
    const BR = rng(seed ^ 0x9e3779b9)(), browse = BR < 0.4 ? 1 : BR < 0.8 ? -1 : 0, s0 = 2 * browse; sheet.base['intro.browse'] = browse;
    // v22 ORBIT SPHERE intro (user): frame 0 = the covers on a slowly spinning sphere (seeded spin direction) -> the cursor drags it up
    // (beats -6 .. -4: pitch to the beat cover's ring, yaw to its longitude) -> clicks the beat cover (-3.5) -> it flies onto the card (-3.5 .. -2)
    // -> the selection brackets (-1.25) -> the cursor clicks play. Old flow (cards) = intro.style 'flow'.
    const SPIN = rng(seed ^ 0x51ed)() < 0.5 ? -1 : 1; sheet.base['intro.style'] = 'sphere'; sheet.base['intro.browse'] = 0;
    // v23 (user: the intro is too rapid, make the atmosphere believable): 9 s pre-roll; the moments are in seconds (INTRO_S) -> beats with the beat
    // length (meta.spb, default 128 BPM): the sphere spins while the player fades in and the ambience breathes, the cursor presses at 3.7 s and drags
    // slowly (2.2 s), picks at 6.3 s, the card types its title, brackets at 8.25 s, play at 9 s. First keys sit at or before frame 0.
    const SB = +meta.spb > 0 ? +meta.spb : 60 / 128, sb = (sec) => Math.round(((sec - PRE_S) / SB) * 960) / 960, F0 = sb(0) - 10 / 960, M = INTRO_S;   // on the 960-tick grid (BAR.BEAT.TICK round trip)
    sheet.tracks.push(track('intro.yaw', 'number', 'stage', [key(F0, SPIN * 1.1, { ease: 'linear' }), key(sb(M.press), SPIN * 0.45, { ease: 'standard' }), key(sb(M.release), 0, { ease: 'step' })]));
    sheet.tracks.push(track('intro.pitch', 'number', 'stage', [key(F0, 0, { ease: 'step' }), key(sb(M.press), 0, { ease: 'easeInOut' }), key(sb(M.release), -37 * Math.PI / 180, { ease: 'step' })]));
    sheet.tracks.push(track('intro.pick', 'number', 'stage', [key(F0, 0, { ease: 'step' }), key(sb(M.pick), 0, { ease: 'emphasized' }), key(sb(M.land), 1, { ease: 'step' })]));
    sheet.tracks.push(track('intro.type', 'number', 'stage', [key(F0, 0, { ease: 'step' }), key(sb(M.land), 0, { ease: 'linear' }), key(sb(M.typeEnd), 1, { ease: 'step' })]));
    sheet.tracks.push(track('intro.player.opacity', 'number', 'stage', [key(F0, 1, { ease: 'step' })]));   // v26: the player is there from frame 0
    sheet.tracks.push(track('intro.index', 'number', 'stage', [key(F0, 0, { ease: 'step' })]));   // v21 browse kept for intro.style 'flow' (see intro.browse)
    void browse; void s0;
    sheet.tracks.push(track('intro.enter', 'number', 'stage', [key(F0, 1, { ease: 'step' })]));   // v22: the sphere needs no fan-out
    sheet.tracks.push(track('intro.select', 'enum', 'stage', [key(sb(M.select), true, { ease: 'step' })]));
    sheet.tracks.push(track('intro.push', 'number', 'stage', [key(0, 0, { ease: 'step' }), key(1, 1, { ease: 'step' })]));
  } else if (NB >= 8) {
    // v17.1: the cover-flow OPENS on the beat's cover (cover 0, so frame 0 = the loop's last frame), browses to the other covers and comes back:
    // 0 -> 1 -> 2 -> 1 -> 0, one eased snap per beat, landing on beats 3, 4, 5, 6; the push still ends on cover 0 (the match cut)
    const IL = 2, land = IL * 4 - 2, SEQ = [0, 1, 2, 1, 0], idx = [key(0, SEQ[0], { ease: 'step' })];
    for (let k = 1; k <= 4; k++) { idx.push(key(land - 4 + k - 0.5, SEQ[k - 1], { ease: 'easeInOut' })); idx.push(key(land - 4 + k, SEQ[k], { ease: 'step' })); }
    sheet.tracks.push(track('intro.index', 'number', 'stage', idx));
    sheet.tracks.push(track('intro.enter', 'number', 'stage', [key(0, look === 'player' ? 0.4 : 0, { ease: 'linear' }), key(2, 1, { ease: 'step' })]));   // v19.1 player: frame 0 (the thumbnail) already 40 % fanned
    sheet.tracks.push(track('intro.push', 'number', 'stage', [key(land, 0, { ty: 'bezier', ob: [look === 'player' ? 0.42 : 0.7, 0], ease: 'easeInOut' }), key(IL * 4, 1, { ib: [0, 0], ease: 'step' })]));
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
