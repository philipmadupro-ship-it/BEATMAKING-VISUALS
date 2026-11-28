// REFERENCE spectra: genre presets the user imports (a JSON list; each item has a name and a `data` string of <Entry freq value .../> rows in dB).
// Nothing is bundled: the file is parsed here and kept in this browser's IndexedDB. The curve is drawn over the live spectrum, level-aligned
// by matching the average of 200 Hz .. 5 kHz, and compared per band (low / low-mid / mid / high-mid / high).
export const REF_BANDS = [['low', 20, 150], ['low-mid', 150, 500], ['mid', 500, 2000], ['high-mid', 2000, 6000], ['high', 6000, 20000]];
const ALIGN = [200, 5000];
/** Parse the import. Returns [{name, freq[], db[]}], skipping entries without a usable curve. Throws if the text is not a JSON list. */
export function parseReferences(text) {
  const j = JSON.parse(String(text).replace(/^﻿/, ''));
  if (!Array.isArray(j)) throw new Error('expected a JSON list of presets');
  const out = [];
  for (const e of j) {
    if (!e || typeof e.name !== 'string' || typeof e.data !== 'string') continue;
    const freq = [], db = [];
    for (const m of e.data.matchAll(/<Entry\b([^>]*)>/g)) {
      const a = {}; for (const k of m[1].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) a[k[1]] = parseFloat(k[2]);
      if (a.freq > 0 && Number.isFinite(a.value) && (!freq.length || a.freq > freq[freq.length - 1])) { freq.push(a.freq); db.push(a.value); }
    }
    if (freq.length >= 8) out.push({ name: e.name, freq, db });
  }
  return out;
}
/** dB of the curve at hz (linear in dB over log frequency, held at the ends). */
export function refAt(r, hz) {
  const f = r.freq, n = f.length; if (hz <= f[0]) return r.db[0]; if (hz >= f[n - 1]) return r.db[n - 1];
  let a = 0, b = n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (f[m] <= hz) a = m; else b = m; }
  const u = Math.log(hz / f[a]) / Math.log(f[b] / f[a]); return r.db[a] + (r.db[b] - r.db[a]) * u;
}
/** Level offset (dB) to add to the reference so its 200 Hz-5 kHz average sits on the spectrum's. spec[i] is the dB at centres[i]. */
export function alignOffset(r, centres, spec) {
  let s = 0, n = 0; centres.forEach((c, i) => { if (c >= ALIGN[0] && c <= ALIGN[1] && Number.isFinite(spec[i])) { s += spec[i] - refAt(r, c); n++; } });
  return n ? s / n : 0;
}
/** Per-band mean of (spectrum - aligned reference) in dB: positive = the mix is louder than the reference there. */
export function bandDeltas(r, centres, spec, off = alignOffset(r, centres, spec)) {
  return REF_BANDS.map(([name, lo, hi]) => { let s = 0, n = 0; centres.forEach((c, i) => { if (c >= lo && c < hi && Number.isFinite(spec[i])) { s += spec[i] - refAt(r, c) - off; n++; } }); return { name, db: n ? s / n : 0 }; });
}
/** 0..1: 1 when every band is within 1 dB of the reference, 0 at an average miss of 7 dB or more. */
export function matchScore(d) { const m = d.reduce((a, b) => a + Math.abs(b.db), 0) / Math.max(1, d.length); return Math.max(0, Math.min(1, (7 - m) / 6)); }

/** Average spectrum of an audio signal as a reference curve: Hann 8192, hop 4096, mean power per 1/6-octave band (centres as the meters). */
export function averageSpectrum(x, sr, name = 'reference') {
  const N = 8192, hop = 4096, bins = N / 2, pw = new Float64Array(bins), win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const re = new Float64Array(N), im = new Float64Array(N); let frames = 0;
  for (let s = 0; s + N <= Math.max(N, x.length); s += hop) {
    for (let i = 0; i < N; i++) { re[i] = (x[s + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im); for (let k = 0; k < bins; k++) pw[k] += re[k] * re[k] + im[k] * im[k]; frames++;
  }
  const freq = [], db = [], r = 2 ** (1 / 12), hz = N / sr;
  for (let i = 0; i < 61; i++) { const c = 1000 * 2 ** ((i - 34) / 6); if (c * r > sr / 2) break;
    const a = Math.ceil(c / r * hz), z = Math.min(bins, Math.ceil(c * r * hz)); let p = 0, n = 0;
    if (z > a) { for (let k = a; k < z; k++) p += pw[k]; n = z - a; } else { p = pw[Math.min(bins - 1, Math.round(c * hz))]; n = 1; }
    freq.push(c); db.push(10 * Math.log10(Math.max(1e-20, p / n / frames / (N * N)))); }
  return { name, freq, db, user: true };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
const PALETTE = ['#ffffff', '#ffd23f', '#3fd0ff', '#ff6b8b', '#8dff7a', '#c79bff'];

/** Shared live state. `list`: imported genres, `user`: references analysed from the user's own audio, `show`: [{name, color}] drawn at once.
 *  `cur` (the first shown) drives the band deltas, the match score and the glow; every shown curve is aligned independently. */
export const ref = { list: [], user: [], show: [], cur: null, off: 0, deltas: null, match: 0, seen: false, offs: {} };
export const allRefs = () => [...ref.list, ...ref.user];
const find = (name) => allRefs().find((r) => r.name === name);
export const shown = () => ref.show.map((s) => ({ ...s, r: find(s.name) })).filter((s) => s.r);
function sync() { const f = shown()[0]; ref.cur = f ? f.r : null; ref.deltas = null; ref.match = 0; ref.seen = false; ref.offs = {}; }
export function setRefs(list, show = ref.show) { ref.list = list; ref.show = show.filter((s) => find(s.name)); sync(); }
export function addShow(name, color) { if (!find(name) || ref.show.some((s) => s.name === name)) return; ref.show.push({ name, color: color || PALETTE[ref.show.length % PALETTE.length] }); sync(); }
export function removeShow(name) { ref.show = ref.show.filter((s) => s.name !== name); sync(); }
export function setColor(name, color) { const s = ref.show.find((q) => q.name === name); if (s) s.color = color; }
export function addUser(r) { ref.user = [...ref.user.filter((q) => q.name !== r.name), r]; addShow(r.name); sync(); }
/** Feed a spectrum (dB at centres). The offsets are smoothed so the overlay does not jump with every transient. */
export function refUpdate(centres, spec, k = 0.12) {
  for (const s of shown()) { const raw = alignOffset(s.r, centres, spec); ref.offs[s.name] = ref.offs[s.name] == null ? raw : ref.offs[s.name] + (raw - ref.offs[s.name]) * k; }
  if (!ref.cur) return; const off = ref.offs[ref.cur.name]; ref.off = off; ref.seen = true; ref.deltas = bandDeltas(ref.cur, centres, spec, off); ref.match = matchScore(ref.deltas);
}

// ---- storage (IndexedDB; every call guarded: the page works without it)
const DB = 'u2c-reference';
const open = () => new Promise((res, rej) => { try { const q = indexedDB.open(DB, 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } });
async function kv(mode, fn) { const db = await open(); try { return await new Promise((res, rej) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); } finally { db.close(); } }
export const saveRefs = async () => { try { await kv('readwrite', (st) => { st.put(ref.list, 'list'); st.put(ref.user, 'user'); st.put(ref.show, 'show'); }); } catch (_) {} };
export async function loadRefs() { try { const g = (k) => kv('readonly', (st) => st.get(k)), [list, user, show] = [await g('list'), await g('user'), await g('show')]; return { list: Array.isArray(list) ? list : [], user: Array.isArray(user) ? user : [], show: Array.isArray(show) ? show : [] }; } catch (_) { return { list: [], user: [], show: [] }; } }
/** Import a file's text: parse and store the genres. Returns the list. */
export async function importReferences(text) { const list = parseReferences(text); if (!list.length) throw new Error('no reference curves found'); setRefs(list); await saveRefs(); return list; }
/** Analyse decoded audio (channel arrays) into a named user reference. */
export async function addAudioReference(name, channels, sr) { const n = channels[0].length, m = new Float32Array(n); for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length; const r = averageSpectrum(m, sr, name); addUser(r); await saveRefs(); return r; }
export async function initReferences() { const s = await loadRefs(); ref.user = s.user; setRefs(s.list, s.show); return s; }
