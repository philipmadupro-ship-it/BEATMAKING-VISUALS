// Tiny store: one serialisable `project` (autosaved), a remembered producer `profile`, and a non-serialised `session`
// (track, audio buffer, libs). This is the only shared mutable state in the app.
const PROJECT_KEY = 'u2c.project.v3', PROFILE_KEY = 'u2c.profile.v2', OLD_PROFILE_KEY = 'u2c.profile.v1';
const line = (on, text, o = {}) => ({ on, text, font: 'mono', size: 1, pos: 'auto', x: .5, y: .5, case: 'upper', color: 'main', ...o });
export const LINE_IDS = ['title', 'bpm', 'key', 'tag', 'handle', 'cta', 'c1', 'c2', 'c3'];
export const LINE_LABELS = { title: 'Title', bpm: 'BPM', key: 'Key', tag: 'Producer tag', handle: '@handle', cta: 'Price / CTA', c1: 'Custom 1', c2: 'Custom 2', c3: 'Custom 3' };
export const DEFAULT_PROJECT = {
  tpl: 'u2cexe', pal: 'charcoal', aspect: '916',
  custom: { bg: '#161616', main: '#c8c8c8', accent: '#f2c14e' },
  chains: { on: true, x: .5, y: .5, s: .8, cycle: 'auto' },
  eleph: { on: true, x: .5, y: 0, s: .6, len: 0, swing: .4 },
  finish: { grain: .22, intensity: 1, zoom: true },
  params: {},
  // amount = master FX intensity. Glitch (slices + RGB split) and shockwave are opt-in: 0 by default.
  fx: { on: true, react: .45, reactPreset: 'balanced', amount: .35, crt: .35, rgb: .6, glitch: 0, glitchOn: 'phrases', bloom: .6, shock: 0, shatter: 0 },
  text: {
    lines: {
      title: line(true, 'Night Shift', { font: 'sans', size: 1.2 }),
      bpm: line(true, '{bpm} BPM'), key: line(true, 'F# min'), tag: line(true, 'prod. U2C', { font: 'serif', case: 'as', color: 'hi' }),
      handle: line(false, '@uche2crazy', { case: 'as' }), cta: line(false, 'Lease $29 — link in bio', { color: 'accent' }),
      c1: line(false, '[FREE] Travis Scott x Future type beat'), c2: line(false, ''), c3: line(false, ''),
    },
    artistA: 'Travis Scott', artistB: 'Future', price: '$29', link: 'link in bio',
  },
  inT: 0, outT: 13.7, loop: true, clipLen: 15,
  export: { fps: 30, mbps: 11, loudness: -14, loopSafe: true, draft: false, voiceTag: false, voiceEvery: 25, batch: ['u2cexe', 'lab', 'scope'], batchLens: [15] },
};
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(a, b) { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v); else a[k] = v; } return a; }
function read(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {} }
/** v1 profile ({tag, handle, artistA, ...}) → v2 shape. */
function migrateProfile(p) {
  if (!p || p.text) return p; const t = {};
  for (const k of ['artistA', 'artistB', 'price', 'link', 'titleFormat']) if (p[k] != null) t[k] = p[k];
  t.lines = {}; if (p.tag) t.lines.tag = { text: p.tag }; if (p.handle) t.lines.handle = { text: p.handle };
  return { text: t };
}
export function createStore() {
  const project = deepMerge(clone(DEFAULT_PROJECT), read(PROJECT_KEY) || {});
  const profile = migrateProfile(read(PROFILE_KEY) || read(OLD_PROFILE_KEY));
  if (profile) { if (profile.text) deepMerge(project.text, profile.text); if (profile.custom) deepMerge(project.custom, profile.custom); }
  const state = { project, session: { track: null, buffer: null, libs: {}, assets: null, playing: false, time: 0, exporting: false, voiceTag: null } };
  const subs = new Set(); let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => {
    write(PROJECT_KEY, state.project);
    // the producer profile: every text line (style + wording), caption fields and the custom colours
    const t = clone(state.project.text); write(PROFILE_KEY, { text: t, custom: state.project.custom });
  }, 300); };
  return {
    get: () => state,
    get project() { return state.project; },
    get session() { return state.session; },
    // set({ project: {...} }) deep-merges, then notifies with the list of top-level keys touched
    set(patch, why = '') {
      const keys = [];
      if (patch.project) { deepMerge(state.project, clone(patch.project)); keys.push(...Object.keys(patch.project).map(k => 'project.' + k)); save(); }
      if (patch.session) { Object.assign(state.session, patch.session); keys.push(...Object.keys(patch.session).map(k => 'session.' + k)); }
      subs.forEach(fn => fn(state, keys, why));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    snapshot: () => clone(state.project),
  };
}
export const store = createStore();
