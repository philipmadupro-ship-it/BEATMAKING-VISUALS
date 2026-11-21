// Tiny store: one serialisable `project` (autosaved), a remembered producer `profile`, and a non-serialised `session`
// (track, audio buffer, libs). The cue sheet lives in its own store (cues/store.js), saved per project.
const PROJECT_KEY = 'u2c.project.v4', PROFILE_KEY = 'u2c.profile.v3';
export const LOOK_IDS = ['exe', 'lab', 'scope', 'player'];
export const DEFAULT_PROJECT = {
  look: 'exe', stage: 'nigredo', aspect: '916',
  title: 'Night Shift', producer: '@uche2crazy', key: '',
  text: { artistA: 'Travis Scott', artistB: 'Future', price: '$29', link: 'link in bio', titleFormat: '' },
  inT: 0, outT: 15, loop: true, clipLen: 30,
  timeline: { snap: 'beat', pxPerBeat: 0, collapsed: null, compact: null, closed: {}, density: 'fewer', magnet: true },
  export: { fps: 30, mbps: 12, loudness: -14, loopSafe: false, draft: false, voiceTag: false, voiceEvery: 25, batch: ['exe', 'lab', 'scope'], batchLens: [15], both: false },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
function deepMerge(a, b) { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v); else a[k] = v; } return a; }
export function read(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
export function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (_) { return false; } }
/** Saved project from an older or foreign version -> current shape (unknown looks fall back to EXE). */
export function migrateProject(p) {
  if (!p || typeof p !== 'object') return p;
  if (!LOOK_IDS.includes(p.look)) p.look = 'exe';
  if (p.export && Array.isArray(p.export.batch)) { const b = p.export.batch.filter((id) => LOOK_IDS.includes(id)); p.export.batch = b.length ? b : [...DEFAULT_PROJECT.export.batch]; }
  return p;
}
export function createStore() {
  const project = migrateProject(deepMerge(clone(DEFAULT_PROJECT), read(PROJECT_KEY) || {}));
  const profile = read(PROFILE_KEY); if (profile) { if (profile.producer) project.producer = profile.producer; if (profile.text) deepMerge(project.text, profile.text); }
  const state = { project, session: { track: null, buffer: null, exporting: false, voiceTag: null } };
  const subs = new Set(); let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { write(PROJECT_KEY, state.project); write(PROFILE_KEY, { producer: state.project.producer, text: state.project.text }); }, 300); };
  return {
    get: () => state,
    get project() { return state.project; },
    get session() { return state.session; },
    /** set({project: {...}}) deep-merges, then notifies with the top-level keys touched */
    set(patch, why = '') {
      const keys = [];
      if (patch.project) { deepMerge(state.project, clone(patch.project)); keys.push(...Object.keys(patch.project).map((k) => 'project.' + k)); save(); }
      if (patch.session) { Object.assign(state.session, patch.session); keys.push(...Object.keys(patch.session).map((k) => 'session.' + k)); }
      subs.forEach((fn) => fn(state, keys, why));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    snapshot: () => clone(state.project),
  };
}
export const store = createStore();
