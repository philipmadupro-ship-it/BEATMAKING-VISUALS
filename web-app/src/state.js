// Tiny store: one serialisable `project` (autosaved), a remembered producer `profile`, and a non-serialised `session`
// (track, audio buffer, libs). This is the only shared mutable state in the app.
const PROJECT_KEY = 'u2c.project.v1', PROFILE_KEY = 'u2c.profile.v1';
export const DEFAULT_PROJECT = {
  tpl: 'lab', pal: 'charcoal', aspect: '916',
  chains: { on: true, x: .5, y: .5, s: .5, cycle: 'auto' },
  eleph: { on: true, x: .5, s: .5, len: 0 },
  finish: { grain: .45, intensity: 1, zoom: true },
  params: {},
  fx: { on: true, crt: .45, rgb: .45, glitch: .5, bloom: .5, shock: .7, shatter: .6 },
  text: { title: 'Night Shift', key: 'F# min', tag: 'prod. U2C', handle: '@uche2crazy', showTitle: true, showBpm: true, showTag: true, showHandle: false,
    preset: 'auto', artistA: 'Travis Scott', artistB: 'Future', price: '$29', link: 'link in bio', tx: .15, ty: .62 },
  inT: 0, outT: 15, loop: true, clipLen: 15,
  export: { fps: 30, mbps: 11, loudness: -14, loopSafe: true, voiceTag: false, voiceEvery: 25, batch: ['lab', 'handset', 'exe'], batchLens: [15] },
};
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(a, b) { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], v); else a[k] = v; } return a; }
function read(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {} }
export function createStore() {
  const project = deepMerge(clone(DEFAULT_PROJECT), read(PROJECT_KEY) || {});
  const profile = read(PROFILE_KEY);
  if (profile) deepMerge(project.text, profile);
  const state = { project, session: { track: null, buffer: null, libs: {}, assets: null, playing: false, time: 0, exporting: false, voiceTag: null } };
  const subs = new Set(); let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => {
    write(PROJECT_KEY, state.project);
    const t = state.project.text; write(PROFILE_KEY, { tag: t.tag, handle: t.handle, artistA: t.artistA, artistB: t.artistB, price: t.price, link: t.link, preset: t.preset });
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
