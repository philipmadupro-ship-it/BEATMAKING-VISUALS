// Property registry: every element of a look and every animatable property, generated from the look's element tree
// (its windows from the layout table, the meters those windows show, the brand pieces, overlays, stage colours and
// every tag leaf). A new window or tag automatically becomes keyframeable. Paths are what cue tracks address.
// prop: { path, label, kind (number|color|enum|bool|text|shot|clip|event), default, min, max, step, unit, options }
import { LAYOUT, LOOKS, WINDOW_LABELS, CONTENT, CONTENT_KINDS, openBeat } from './layout.js';
import { STAGE_IDS, stageOf, STAGE_COLOR_KEYS } from './core.js';
import { DEFAULT_TAGS } from './tags.js';
import { flattenTags, mergeDeep } from '../cues/schema.js';
import { UFX } from './usereffects.js';

const num = (path, label, def, min, max, step, unit = '') => ({ path, label, kind: 'number', default: def, min, max, step, unit });
const en = (path, label, def, options) => ({ path, label, kind: 'enum', default: def, options });
const bool = (path, label, def) => ({ path, label, kind: 'bool', default: def });
const col = (path, label, def) => ({ path, label, kind: 'color', default: def });

/** Meter settings per content kind (applies to every window showing that kind). */
export const METER_PROPS = {
  spectrum: [['floor', 'Bottom of the scale (dB below 0)', 72, 30, 120, 1, 'dB'], ['top', 'Top of the scale (dB)', -6, -24, 6, 1, 'dB'], ['hold', 'Peak hold', true], ['mode', 'Legacy (v11 display mode, ignored)', 'bars', ['bars', 'ms']], ['trail', 'Legacy (ignored)', 0.22, 0, 1, 0.01, 's'], ['smooth', 'Legacy (ignored)', 1, 1, 12, 1, 'frames']],
  spectrogram: [['mode', 'Panes (M + S, or M only)', 'ms', ['ms', 'm']], ['range', 'Range (floor below 0 dBFS)', 90, 40, 120, 1, 'dB'], ['window', 'Time window', 8, 1, 16, 0.5, 's'], ['gamma', 'Alpha curve (Aurora v^g)', 0.56, 0.2, 1.5, 0.01, '']],
  eq: [['range', 'EQ scale ± (0 = auto: 12/18/30)', 0, 0, 30, 1, 'dB'], ['anRange', 'Analyzer range', 90, 60, 120, 30, 'dB'], ['mode', 'Analyzer', 'pre-post', ['pre-post', 'pre', 'off']],
    ['tilt', 'Analyzer tilt (about 1 kHz)', 4.5, 0, 6, 0.1, 'dB/oct'], ['smoothing', 'Analyzer release', 20, 3, 120, 1, 'dB/s'], ['hold', 'Analyzer peak hold (0 = off)', 1, 0, 10, 0.1, 's'],
    ['strength', 'Match strength', 50, 0, 100, 5, '%'],
    ['depth', 'Dynamic depth (low band, dB at full detector)', 5, 0, 12, 0.5, 'dB'], ['attack', 'Detector attack', 4, 1, 50, 1, 'ms'], ['release', 'Detector release', 140, 20, 600, 10, 'ms'], ['sens', 'Detector sensitivity (dB jump = full)', 10, 3, 24, 1, 'dB'],
    ['ghost', 'Gain-reduction ghost trail', 0.14, 0, 0.3, 0.01, 's'], ['regions', 'Band regions', true], ['piano', 'Piano strip', true]],
  loudness: [['layout', 'Layout', 'history', ['history', 'gauge']], ['focus', 'Focus shot shows', 'ghost', ['ghost', 'meter']], ['target', 'Target marker', -14, -24, -6, 0.5, 'LUFS'],
    ['floor', 'Range (history floor)', -54, -70, -18, 1, 'LUFS'], ['scale', 'LUFS scale', 'linear', ['linear', 'compressed']], ['window', 'History window (0 = whole clip)', 0, 0, 30, 1, 's']],
  levels: [['mode', 'Mode (peak + RMS 300 ms, or K-system 600 ms)', 'peak-rms', ['peak-rms', 'k20', 'k14', 'k12']], ['scale', 'Scale', 'live', ['live', 'linear']], ['range', 'Range (linear scale)', 60, 24, 96, 1, 'dB'],
    ['smoothing', 'Peak release', 20, 5, 60, 0.1, 'dB/s'], ['hold', 'Peak hold', 1.5, 0, 10, 0.1, 's'], ['style', 'Bar style', 'auto', ['auto', 'gradient', 'segment']],
    ['grThresh', 'GR threshold (0 = auto from the hits)', 0, -48, 0, 0.5, 'dB'], ['grRatio', 'GR ratio', 4, 1, 20, 0.5, ':1'], ['grRelease', 'GR release', 120, 20, 600, 5, 'ms'], ['grDet', 'GR detector', 'peak', ['peak', 'rms']]],
  ghost: [['history', 'History line length', 4, 1, 16, 0.5, 's']],
  stereo: [['mode', 'Vectorscope mode', 'sample', ['sample', 'level', 'lissajous']], ['range', 'Radius range (log)', 40, 12, 80, 1, 'dB'], ['persist', 'Persistence (sample / Lissajous)', 0.42, 0.03, 1.5, 0.01, 's'],
    ['smoothing', 'Polar level release', 12, 1, 60, 0.5, 'dB/s'], ['hold', 'Polar level outline hold', 0.5, 0, 4, 0.05, 's'], ['gain', 'Scope gain', 1, 0.25, 4, 0.05, '×']],
  waveform: [['span', 'Detail window', 2, 1, 8, 1, 'bars'], ['style', 'Draw style (blocks = 3-band boxes, player default)', 'smooth', ['smooth', 'blocks']], ['spikes', 'Bright transient columns (off: they flicker while scrolling)', false], ['kickflash', 'Played side flashes on each kick', false], ['look', 'Columns (envelope = 12 ms peak hold, exact = every column; the accuracy test renders exact)', 'envelope', ['envelope', 'exact']]],
  logo: [['span', 'Scope timebase (scope look)', 0.25, 0.0625, 2, 0.0625, 'beats'], ['amp', 'Scope trace gain', 0.2, 0.05, 0.6, 0.01, '']],
  surface: [['rows', 'History rows', 34, 8, 60, 1, '']],
};
const meterKey = { levels: 'levels', bands: 'levels', ghost: 'ghost', spectrum: 'spectrum', spectrogram: 'spectro', eq: 'eq', loudness: 'loud', stereo: 'stereo', waveform: 'session', logo: 'scope', surface: 'surface' };
export const meterPath = (kind, key) => `meter.${meterKey[kind] || kind}.${key}`;

/**
 * buildRegistry({look, aspect, stage, bars, tags}) -> {elements: [{id, label, group, props[]}], byPath: {path: prop}}.
 */
export function buildRegistry({ look = 'exe', aspect = '916', stage = 'nigredo', bars = 16, tags = {} } = {}) {
  const S = stageOf(stage), L = LAYOUT[look] ? LAYOUT[look][aspect] : LAYOUT.exe[aspect], ids = Object.keys(L), E = [];
  const el = (id, label, group, props) => E.push({ id, label, group, props });
  const wins = ['wide', ...ids];
  el('scene', 'Scene', 'Scene', [en('look', 'Look', look, LOOKS), en('stage', 'Stage', stage, STAGE_IDS)]);
  el('intro', 'Intro (player + cover-flow)', 'Intro', [bool('intro.on', 'Intro on (0 = start in the lab)', true), num('intro.length', 'Length', 2, 1, 4, 1, 'bars'),
    num('intro.index', 'Carousel position (eased keys land on beats)', 0, -20, 20, 0.01, 'cards'), num('intro.push', 'Push-in (hard cut at the end of the intro)', 0, 0, 1, 0.01),
    num('intro.zoom', 'Push zoom (0 = exactly the lab cover framing)', 0, 0, 8, 0.05, '×'), num('intro.enter', 'Start: cards fan out + player rises (0..1, linear keys over beats 0-2)', 1, 0, 1, 0.01), num('intro.open', 'Lab opening dolly-out from the cover (beats after the cut, 0 = none)', 2, 0, 4, 0.25, 'beats'), bool('intro.select', 'Selection brackets', false),
    bool('intro.coverFrame', 'Cover frame: the hook card is on frame 0 (for platforms that use frame 0 as the thumbnail)', false), en('intro.style', 'Intro style (sphere = covers on a 3D orbit sphere, flow = cards)', 'flow', ['sphere', 'flow']), num('intro.yaw', 'Sphere spin (yaw)', 0, -6.3, 6.3, 0.01, 'rad'), num('intro.pitch', 'Sphere tilt (pitch: the cursor drag)', 0, -1.6, 1.6, 0.01, 'rad'), num('intro.pick', 'Picked cover flies onto the card (0..1)', 1, 0, 1, 0.01), num('intro.type', 'Card title typed (0..1)', 1, 0, 1, 0.01), bool('fx.dof', 'Depth of field: blur what is not in focus', true),
    num('intro.player.scale', 'Player scale', 1, 0.5, 1.5, 0.01, '×'), num('intro.player.opacity', 'Player opacity (static by default: no fades)', 1, 0, 1, 0.01)]);
  el('camera', 'Camera', 'Camera', [{ path: 'camera.shot', label: 'Shot (wide / focus window)', kind: 'shot', default: 'wide', options: wins },
    num('camera.zoom', 'Zoom multiplier', 1, 0.5, 3, 0.01, '×'), bool('camera.oneform', 'One-form camera (log zoom around the fixed point, panel-to-panel dip)', true), num('camera.dip', 'Panel-to-panel dip amount', 1, 0, 2, 0.05, '×'), num('camera.x', 'Pan X', 0, -600, 600, 1, 'px'), num('camera.y', 'Pan Y', 0, -900, 900, 1, 'px')]);
  el('focus', 'Featured meter', 'Camera', [en('focus.featured', 'Hero window (bracket + lit header)', 'auto', ['auto', 'none', ...ids])]);
  el('logo', 'Logo chain', 'Brand', [en('logo.mode', 'Mode', 'cycle', ['cycle', 'full', 'off']), num('logo.cycle', 'IN/OUT cycle', 2, 1, 8, 1, 'bars'), num('logo.hold', 'Hero hold (fully threaded)', 10, 0, 40, 1, 'bars'),
    num('logo.glow', 'Glow (pulses on kicks)', 1, 0, 2, 0.01, '×'), num('logo.bloom', 'Bloom on drops', 1, 0, 2, 0.01, '×'), bool('logo.runner', 'Runner (lit link on 16ths)', true),
    { path: 'logo.hero', label: 'Hero moment', kind: 'clip', default: false }, num('logo.scale', 'Scale', 1, 0.5, 1.5, 0.01, '×')]);
  el('pendant', 'Pendant (elephant)', 'Brand', [num('pendant.amp', 'Amplitude', S.swingDeg.calm, 0, 25, 0.1, '°'), num('pendant.period', 'Period', 2, 1, 8, 0.5, 'beats'),
    num('pendant.react', 'Bass reaction', 0.32, 0, 1, 0.01, ''),
    num('pendant.links', 'Chain links', 10, 3, 24, 1, ''), num('pendant.wave', 'Chain looseness (joint friction; high = slack)', 0.75, 0.05, 1.5, 0.01, ''), num('pendant.damp', 'Pendulum damping', 0.35, 0.1, 0.9, 0.01, 'ζ'),
    num('pendant.chain', 'Chain length (of the window)', 0.3, 0, 0.6, 0.01, ''), num('pendant.size', 'Size', 1, 0.4, 1.6, 0.01, '×'), num('pendant.x', 'Pivot X offset', 0, -300, 300, 1, 'px'), num('pendant.y', 'Pivot Y offset', 0, -300, 300, 1, 'px')]);
  if (look === 'player') el('hero', 'Hero (U2C logo + static elephant)', 'Brand', [bool('hero.on', 'Hero on', true), num('hero.scale', 'Scale (logo)', 1, 0.5, 1.6, 0.01, '×'), num('hero.x', 'Offset X', 0, -400, 400, 1, 'px'),
    num('hero.y', 'Offset Y', 0, -400, 400, 1, 'px'), bool('hero.caption', 'Caption block (title / prod. / vol.)', false), bool('hero.cover', 'Darkened cover behind the logo (intro match-cut target)', true), bool('hero.elephant', 'Elephant mark under the logo', false), en('hero.fry', 'Cover treatment (deep-fried)', S.grey ? 'negative' : S.name === 'RUBEDO' ? 'thermal' : 'stage', ['none', 'negative', 'thermal', 'night', 'stage']), bool('cover.all', 'Cover preset on every sphere tile (not just the hero)', false), bool('scan.on', 'Detection boxes on the hero', true), bool('roll.on', 'MIDI map on the hero (melodic peaks as a piano roll)', true), bool('hero.ride', 'Logo rides the melody (up / down with the pitch)', true), num('hero.rideAmt', 'Ride amount', 1, 0, 3, 0.05, '×'), bool('roll.mini', 'MIDI map mini-rolls (next bar)', true), num('roll.span', 'MIDI map history (beats)', 4, 1, 16, 1, 'beats'), num('roll.playhead', 'MIDI map playhead position', 0.56, 0.2, 0.9, 0.01, ''), col('scan.color', 'Detection box colour (stage default: black / hot)', S.grey ? '#0a0a0a' : S.hot), col('scan.text', 'Detection tab text colour', S.grey ? '#f2f2f2' : '#0a0a0a'),
    num('player.cover', 'Cover (0 = the beat; 1-4 = the others; Upload cover replaces 0)', 0, 0, 4, 1, ''), bool('player.tabs169', 'Top tabs on 16:9', false)]);
  if (look === 'exe') el('hero', 'Hero (U2C logo, front layer)', 'Brand', [bool('hero.on', 'Hero on', true), num('hero.scale', 'Scale (logo)', 1, 0.5, 1.6, 0.01, '×'), num('hero.x', 'Offset X', 0, -400, 400, 1, 'px'),
    num('hero.y', 'Offset Y', 0, -400, 400, 1, 'px'), num('hero.shadow', 'Shadow', 1, 0, 2, 0.05, '×'), num('hero.vignette', 'Dark pool under the hero', 0.7, 0, 1.5, 0.05, '×'),
    num('cover.pulse', 'Cover kick pulse (scale + brightness)', 1, 0, 3, 0.05, '×'), num('cover.dim', 'Cover darkening (card scrim)', 1, 0, 2, 0.05, '×'), bool('stepgrid.on', '16-step beat grid (off by default)', false), num('stepgrid.glow', 'Step grid brightness', 1, 0, 2, 0.05, '×'),
    num('logo.decay', 'Logo glow kick decay (time constant)', 0.17, 0.05, 0.6, 0.01, 's'), num('glass.back', 'Meter windows pushed back (dim + blur)', 1, 0, 1.5, 0.05, '')]);
  el('video', 'Video layer (uploaded screen recording)', 'Scene', [bool('video.on', 'Video on', false), en('video.target', 'Blend into (hero = the player hero cell, full = whole frame, waveform = the waveform window)', 'hero', ['hero', 'full', 'waveform']),
    en('video.blend', 'Blend mode', 'screen', ['normal', 'screen', 'multiply', 'overlay', 'difference', 'lighten', 'darken', 'luminosity', 'soft-light']), num('video.opacity', 'Opacity', 0.8, 0, 1, 0.01), num('video.offset', 'Offset (video time = clip time + offset)', 0, -120, 120, 0.01, 's'),
    en('video.fit', 'Fit', 'cover', ['cover', 'contain']), num('video.desat', 'Desaturate (Nigredo defaults to 1: stays grey)', S.grey ? 1 : 0, 0, 1, 0.01)]);
  el('text', 'Text cues', 'Text', [{ path: 'text.cue', label: 'Text cue', kind: 'clip', default: '' }]);
  el('fx', 'FX', 'Finish', [{ path: 'fx.glitch', label: 'Glitch (opt-in)', kind: 'clip', default: 0, min: 0, max: 1, step: 0.01 }, { path: 'fx.invert', label: 'Negative (whole frame inverted while the clip runs)', kind: 'clip', default: false }, { path: 'chrome.lights', label: 'Window traffic lights (macOS)', kind: 'bool', default: look === 'player' }, { path: 'chrome.lightsColor', label: 'Traffic lights in colour (off = stage greys)', kind: 'bool', default: true }, { path: 'chrome.glyphs', label: 'Traffic light glyphs (x - +)', kind: 'bool', default: true }, { path: 'focus.window', label: 'Clicked window comes to the front (others dim)', kind: 'bool', default: look === 'player' }, { path: 'focus.dim', label: 'Background dim when a window is in front', kind: 'number', default: 1, min: 0, max: 1.6, step: 0.05 }, { path: 'focus.bracket', label: 'Focus bracket (travels between panels, edges on separate springs)', kind: 'bool', default: look === 'player' }, { path: 'outro.rewind', label: 'Loop outro: the last bar rewinds into the intro (seamless loop)', kind: 'bool', default: look === 'player' }, en('outro.mode', 'Outro: JOIN / CREATE PROJECT dialog (closed by the cursor) or the old rewind', 'dialog', ['dialog', 'rewind']), en('outro.end', 'Ending (loop = rewind into the intro, stop = play to the end and stop; auto = stop past 32 bars)', 'auto', ['auto', 'loop', 'stop']),
    { path: 'intro.browse', label: 'Intro browse: 1 from the left, -1 from the right, 0 direct click (seeded per beat)', kind: 'number', default: 1, min: -1, max: 1, step: 1 },
    { path: 'hero.bands', label: 'Hero right column: LOW / MID / HIGH block waveforms (off = mini piano rolls)', kind: 'bool', default: true },
    { path: 'term.on', label: 'Terminal words (type in / delete out)', kind: 'bool', default: look === 'player' },
    { path: 'term.line', label: 'Terminal line (number = social.terminal[n], or text)', kind: 'clip', default: 0 }, { path: 'social.on', label: 'Social layer: hook + 2 CTAs (Y2K dialogs)', kind: 'bool', default: look === 'player' }, { path: 'social.hookIdx', label: 'Hook variant (-1 = social.hook tag, 0-2 = social.hooks list)', kind: 'number', default: -1, min: -1, max: 2, step: 1 }, { path: 'social.cta1.at', label: 'CTA 1 at (beat)', kind: 'number', default: 32, min: 0, max: 512, step: 1 }, { path: 'social.cta1.len', label: 'CTA 1 length (beats)', kind: 'number', default: 8, min: 1, max: 32, step: 1 }, { path: 'social.cta2.at', label: 'CTA 2 at (beat)', kind: 'number', default: 44, min: 0, max: 512, step: 1 }, { path: 'social.cta2.len', label: 'CTA 2 length (beats)', kind: 'number', default: 8, min: 1, max: 32, step: 1 }, { path: 'cursor.on', label: 'Y2K cursor clicks each camera move', kind: 'bool', default: look === 'player' }, { path: 'fx.punch', label: 'Kick punch-in (camera zoom per kick)', kind: 'number', default: 0.014, min: 0, max: 0.06, step: 0.001 }, { path: 'fx.flash', label: '1-frame invert', kind: 'event', default: false },
    num('fx.grain', 'Grain', S.grain, 0, 0.5, 0.01), num('fx.vignette', 'Vignette', S.vignette, 0, 1, 0.01), num('fx.scan', 'Scanlines', 0, 0, 1, 0.01), num('fx.halation', 'Halation (dark stages)', 0.16, 0, 0.6, 0.01)]);
  // v27 user effects: one clip path per library effect (v = intensity 0..1; key fields dur, ein, eout, col, off), drawn by v8/usereffects.js
  el('ufx', 'Effects (yours)', 'Finish', UFX.map(([id, name, desc]) => ({ path: 'ufx.' + id, label: `${name} (${desc.replace(/[().]/g, '')})`, kind: 'clip', default: 0, min: 0, max: 1, step: 0.01 })));
  el('ground', 'Grid / background', 'Finish', [en('ground.pattern', 'Pattern', 'auto', ['auto', 'graph', 'dots', 'scan', 'none']), { path: 'voice.captions', label: 'Voice lines type as console lines while she speaks (tags voice.*)', kind: 'bool', default: look === 'player' }, { path: 'ground.data', label: 'Data rain: real band levels stream in the background columns', kind: 'bool', default: true }, { path: 'ground.scan', label: 'Scanner sweep every 2 bars', kind: 'bool', default: true }, { path: 'ground.akira', label: 'Akira matrix: big / medium / small stretched words in the drift columns', kind: 'bool', default: true }, { path: 'ground.testlog', label: 'Live test log (trial, time, kicks, status)', kind: 'bool', default: true }, { path: 'ground.drift', label: 'Background drift (Matrix columns up / down; 0 = still)', kind: 'number', default: 1, min: 0, max: 3, step: 0.1 }, { path: 'ground.brutal', label: 'Brutalist layer: overprint, misregistration, ruled text columns, vertical label, barcode, frame counters', kind: 'bool', default: look === 'player' }, { path: 'ground.editorial', label: 'Editorial layer: big soft words, registration lines, FIG notes (tags ground.*)', kind: 'bool', default: look === 'player' }, { path: 'hero.halftone', label: 'Hero cover printed as a halftone', kind: 'bool', default: true }, num('ground.gridA', 'Grid strength', S.gridA, 0, 0.4, 0.005), num('ground.pool', 'Light pools', 1, 0, 2, 0.05)]);
  el('stagecol', 'Stage colours', 'Finish', STAGE_COLOR_KEYS.map((k) => col('stage.' + k, k, S[k])));
  el('overlays', 'Overlays', 'Overlays', [bool('hud.on', 'HUD', true), bool('result.on', 'Result card', true),
    num('result.at', 'Result card at', Math.max(0, (bars - (bars >= 8 ? 2 : 1)) * 4), 0, bars * 4, 0.25, 'beats'), bool('bracket.on', 'Accent rim on the hero window', true),
    num('glass.radius', 'Glass corner radius', 22, 0, 48, 1, 'px'), num('glass.bezel', 'Double bezel (player look: inner core hairline)', 1, 0, 2, 0.05, '×'), num('glass.tint', 'Glass tint', 0.36, 0, 0.9, 0.01)]);
  for (const id of ids) { const r = L[id], c = CONTENT[id];
    el('win.' + id, WINDOW_LABELS[id] || id, 'Windows', [num(`win.${id}.x`, 'X', r[0], -400, 2400, 1, 'px'), num(`win.${id}.y`, 'Y', r[1], -400, 2400, 1, 'px'), num(`win.${id}.w`, 'Width', r[2], 60, 2000, 1, 'px'), num(`win.${id}.h`, 'Height', r[3], 60, 2000, 1, 'px'),
      bool(`win.${id}.visible`, 'Visible (key = open / close)', true), num(`win.${id}.open`, 'Opens at', openBeat(look, aspect, id), -2, bars * 4, 0.125, 'beats'),
      en(`win.${id}.content`, 'Shows', c, CONTENT_KINDS), col(`win.${id}.accent`, 'Accent', S.hot)]); }
  const kinds = [...new Set(['eq', ...ids.flatMap((id) => (CONTENT[id] === 'bands' ? ['levels'] : CONTENT[id] === 'loudness' ? ['loudness', 'levels', 'ghost'] : [CONTENT[id]]))])];
  { const g = S.grey, wc = g ? ['#7d7d7d', '#b9b9b9', '#ffffff'] : [S.sig1, S.sig2 === S.sig1 ? S.ink : S.sig2, S.waveHi === S.sig1 ? S.ink : S.waveHi];   // v15.1 waveform 3-band colours
    el('wavecols', 'Waveform band colours (blocks style)', 'Meters', [col('meter.session.low', 'Low 20-150 Hz (kick, 808)', wc[0]), col('meter.session.mid', 'Mid 150 Hz-2 kHz (snare, vocals)', wc[1]), col('meter.session.high', 'High 2-20 kHz (hats, air)', wc[2])]); }
  for (const k of kinds) if (METER_PROPS[k]) el('meter.' + k, `Meter · ${k}`, 'Meters', METER_PROPS[k].map(([key, label, def, min, max, step, unit]) => (Array.isArray(min) ? en(meterPath(k, key), label, def, min) : typeof def === 'boolean' ? bool(meterPath(k, key), label, def) : num(meterPath(k, key), label, def, min, max, step, unit))));
  const eqEl = E.find((e) => e.id === 'meter.eq'); if (eqEl && !ids.some((id) => CONTENT[id] === 'eq')) eqEl.hidden = true;   // v12: no EQ window; keys stay registered for old sheets
  const flat = flattenTags(mergeDeep(DEFAULT_TAGS, tags)), groups = {};
  for (const [p, v] of Object.entries(flat)) { const g = p.split('.')[0]; (groups[g] = groups[g] || []).push({ path: 'tag.' + p, label: p, kind: 'text', default: String(v) }); }
  for (const [g, props] of Object.entries(groups)) el('tag.' + g, `Tags · ${g}`, 'Tags', props);
  const byPath = {}; for (const e of E) for (const p of e.props) byPath[p.path] = { ...p, element: e.id, elementLabel: e.label };
  return { elements: E, byPath };
}
