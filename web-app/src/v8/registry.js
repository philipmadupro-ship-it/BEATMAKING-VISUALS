// Property registry: every element of a look and every animatable property, generated from the look's element tree
// (its windows from the layout table, the meters those windows show, the brand pieces, overlays, stage colours and
// every tag leaf). A new window or tag automatically becomes keyframeable. Paths are what cue tracks address.
// prop: { path, label, kind (number|color|enum|bool|text|shot|clip|event), default, min, max, step, unit, options }
import { LAYOUT, LOOKS, WINDOW_LABELS, CONTENT, CONTENT_KINDS, openBeat } from './layout.js';
import { STAGE_IDS, stageOf, STAGE_COLOR_KEYS } from './core.js';
import { DEFAULT_TAGS } from './tags.js';
import { flattenTags, mergeDeep } from '../cues/schema.js';

const num = (path, label, def, min, max, step, unit = '') => ({ path, label, kind: 'number', default: def, min, max, step, unit });
const en = (path, label, def, options) => ({ path, label, kind: 'enum', default: def, options });
const bool = (path, label, def) => ({ path, label, kind: 'bool', default: def });
const col = (path, label, def) => ({ path, label, kind: 'color', default: def });

/** Meter settings per content kind (applies to every window showing that kind). */
export const METER_PROPS = {
  spectrum: [['floor', 'Range (dB below 0)', 90, 30, 120, 1, 'dB'], ['trail', 'Trail', 0.22, 0, 1, 0.01, 's'], ['smooth', 'Smoothing', 1, 1, 12, 1, 'frames'], ['hold', 'Peak hold', true]],
  spectrogram: [['mode', 'Panes (M + S, or M only)', 'ms', ['ms', 'm']], ['range', 'Range (floor below 0 dBFS)', 90, 40, 120, 1, 'dB'], ['window', 'Time window', 8, 1, 16, 0.5, 's'], ['gamma', 'Alpha curve (Aurora v^g)', 0.56, 0.2, 1.5, 0.01, '']],
  eq: [['range', 'EQ scale ± (0 = auto: 3/6/12/30)', 0, 0, 30, 1, 'dB'], ['anRange', 'Analyzer range', 90, 60, 120, 30, 'dB'], ['mode', 'Analyzer', 'pre-post', ['pre-post', 'pre', 'off']],
    ['tilt', 'Analyzer tilt (about 1 kHz)', 4.5, 0, 6, 0.1, 'dB/oct'], ['smoothing', 'Analyzer release', 20, 3, 120, 1, 'dB/s'], ['hold', 'Analyzer peak hold (0 = off)', 1, 0, 10, 0.1, 's'],
    ['strength', 'Match strength', 50, 0, 100, 5, '%']],
  loudness: [['target', 'Target marker', -14, -24, -6, 0.5, 'LUFS'], ['floor', 'Gauge floor', -36, -60, -18, 1, 'LUFS']],
  stereo: [['mode', 'Vectorscope mode', 'sample', ['sample', 'level', 'lissajous']], ['range', 'Radius range (log)', 40, 12, 80, 1, 'dB'], ['persist', 'Persistence (sample / Lissajous)', 0.42, 0.03, 1.5, 0.01, 's'],
    ['smoothing', 'Polar level release', 12, 1, 60, 0.5, 'dB/s'], ['hold', 'Polar level outline hold', 0.5, 0, 4, 0.05, 's'], ['gain', 'Scope gain', 1, 0.25, 4, 0.05, '×']],
  waveform: [['span', 'Detail window', 2, 1, 8, 1, 'bars']],
  logo: [['span', 'Scope timebase (scope look)', 0.25, 0.0625, 2, 0.0625, 'beats'], ['amp', 'Scope trace gain', 0.2, 0.05, 0.6, 0.01, '']],
  surface: [['rows', 'History rows', 34, 8, 60, 1, '']],
};
const meterKey = { spectrum: 'spectrum', spectrogram: 'spectro', eq: 'eq', loudness: 'loud', stereo: 'stereo', waveform: 'session', logo: 'scope', surface: 'surface' };
export const meterPath = (kind, key) => `meter.${meterKey[kind] || kind}.${key}`;

/**
 * buildRegistry({look, aspect, stage, bars, tags}) -> {elements: [{id, label, group, props[]}], byPath: {path: prop}}.
 */
export function buildRegistry({ look = 'exe', aspect = '916', stage = 'nigredo', bars = 16, tags = {} } = {}) {
  const S = stageOf(stage), L = LAYOUT[look] ? LAYOUT[look][aspect] : LAYOUT.exe[aspect], ids = Object.keys(L), E = [];
  const el = (id, label, group, props) => E.push({ id, label, group, props });
  const wins = ['wide', ...ids];
  el('scene', 'Scene', 'Scene', [en('look', 'Look', look, LOOKS), en('stage', 'Stage', stage, STAGE_IDS)]);
  el('camera', 'Camera', 'Camera', [{ path: 'camera.shot', label: 'Shot (wide / focus window)', kind: 'shot', default: 'wide', options: wins },
    num('camera.zoom', 'Zoom multiplier', 1, 0.5, 3, 0.01, '×'), num('camera.x', 'Pan X', 0, -600, 600, 1, 'px'), num('camera.y', 'Pan Y', 0, -900, 900, 1, 'px')]);
  el('focus', 'Featured meter', 'Camera', [en('focus.featured', 'Hero window (bracket + lit header)', 'auto', ['auto', 'none', ...ids])]);
  el('logo', 'Logo chain', 'Brand', [en('logo.mode', 'Mode', 'cycle', ['cycle', 'full', 'off']), num('logo.cycle', 'IN/OUT cycle', 2, 1, 8, 1, 'bars'),
    { path: 'logo.hero', label: 'Hero moment', kind: 'clip', default: false }, num('logo.scale', 'Scale', 1, 0.5, 1.5, 0.01, '×')]);
  el('pendant', 'Pendant (elephant)', 'Brand', [num('pendant.amp', 'Amplitude', S.swingDeg.calm, 0, 25, 0.1, '°'), num('pendant.period', 'Period', 2, 1, 8, 0.5, 'beats'),
    num('pendant.react', 'Bass reaction', 0.32, 0, 1, 0.01, ''), num('pendant.size', 'Size', 1, 0.4, 1.6, 0.01, '×'), num('pendant.x', 'Pivot X offset', 0, -300, 300, 1, 'px'), num('pendant.y', 'Pivot Y offset', 0, -300, 300, 1, 'px')]);
  el('text', 'Text cues', 'Text', [{ path: 'text.cue', label: 'Text cue', kind: 'clip', default: '' }]);
  el('fx', 'FX', 'Finish', [{ path: 'fx.glitch', label: 'Glitch (opt-in)', kind: 'clip', default: 0, min: 0, max: 1, step: 0.01 }, { path: 'fx.flash', label: '1-frame invert', kind: 'event', default: false },
    num('fx.grain', 'Grain', S.grain, 0, 0.5, 0.01), num('fx.vignette', 'Vignette', S.vignette, 0, 1, 0.01), num('fx.scan', 'Scanlines', 0, 0, 1, 0.01)]);
  el('ground', 'Grid / background', 'Finish', [en('ground.pattern', 'Pattern', 'auto', ['auto', 'graph', 'dots', 'scan', 'none']), num('ground.gridA', 'Grid strength', S.gridA, 0, 0.4, 0.005)]);
  el('stagecol', 'Stage colours', 'Finish', STAGE_COLOR_KEYS.map((k) => col('stage.' + k, k, S[k])));
  el('overlays', 'Overlays', 'Overlays', [bool('hud.on', 'HUD', true), bool('boot.on', 'Boot terminal (bar 1)', true), bool('result.on', 'Result card', true),
    num('result.at', 'Result card at', Math.max(0, (bars - (bars >= 8 ? 2 : 1)) * 4), 0, bars * 4, 0.25, 'beats'), bool('bracket.on', 'Attention bracket', true), bool('wires.on', 'Wires (exe)', true),
    bool('notes.on', 'Handwritten notes', true), bool('furniture.on', 'Tape / pins / residue', true)]);
  for (const id of ids) { const r = L[id], c = CONTENT[id];
    el('win.' + id, WINDOW_LABELS[id] || id, 'Windows', [num(`win.${id}.x`, 'X', r[0], -400, 2400, 1, 'px'), num(`win.${id}.y`, 'Y', r[1], -400, 2400, 1, 'px'), num(`win.${id}.w`, 'Width', r[2], 60, 2000, 1, 'px'), num(`win.${id}.h`, 'Height', r[3], 60, 2000, 1, 'px'),
      bool(`win.${id}.visible`, 'Visible (key = open / close)', true), num(`win.${id}.open`, 'Opens at', openBeat(look, aspect, id), -2, bars * 4, 0.125, 'beats'),
      en(`win.${id}.content`, 'Shows', c, CONTENT_KINDS), col(`win.${id}.accent`, 'Accent', S.hot)]); }
  const kinds = [...new Set(ids.map((id) => CONTENT[id]))];
  for (const k of kinds) if (METER_PROPS[k]) el('meter.' + k, `Meter · ${k}`, 'Meters', METER_PROPS[k].map(([key, label, def, min, max, step, unit]) => (Array.isArray(min) ? en(meterPath(k, key), label, def, min) : typeof def === 'boolean' ? bool(meterPath(k, key), label, def) : num(meterPath(k, key), label, def, min, max, step, unit))));
  const flat = flattenTags(mergeDeep(DEFAULT_TAGS, tags)), groups = {};
  for (const [p, v] of Object.entries(flat)) { const g = p.split('.')[0]; (groups[g] = groups[g] || []).push({ path: 'tag.' + p, label: p, kind: 'text', default: String(v) }); }
  for (const [g, props] of Object.entries(groups)) el('tag.' + g, `Tags · ${g}`, 'Tags', props);
  const byPath = {}; for (const e of E) for (const p of e.props) byPath[p.path] = { ...p, element: e.id, elementLabel: e.label };
  return { elements: E, byPath };
}
