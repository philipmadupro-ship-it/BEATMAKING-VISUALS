// Decode, demo synthesis and the worker bridge. Produces immutable Track objects.
import { analyzeMono, makeGrid } from './dsp.js';
import { hash } from '../util/draw.js';
import { stereoFeatures } from './stereo.js';
import { songStructure } from './structure.js';
import { clipData, songFacts } from './clipdata.js';
export function makeTrack(a, meta, bpm, t0, stereo = null) {
  const g = makeGrid(a, bpm ?? a.bpmDetected, t0);
  return Object.freeze({ ...a, ...g, song: songStructure(a, g), stereo, meta: Object.freeze({ ...meta }), bpmSource: meta.bpmSource || 'detected' });
}
/** New immutable track with a different grid (BPM edit / downbeat nudge). */
export function regrid(track, bpm, t0, source = 'edited') { const g = makeGrid(track, bpm, t0); return Object.freeze({ ...track, ...g, song: songStructure(track, g), bpmSource: source }); }
export function mixdown(buffer) { const len = buffer.length, nc = buffer.numberOfChannels, mono = new Float32Array(len); for (let c = 0; c < nc; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / nc; } return mono; }
let worker = null, jobId = 0;
function getWorker() { if (worker !== null) return worker; try { worker = new Worker(new URL('./analysis.worker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('[u2c] worker unavailable, analysing on the main thread', e); worker = false; } return worker; }
/** Analyse an AudioBuffer. Calls onQuick(track) after the fast pass; resolves with the full track. */
export function analyzeBuffer(buffer, meta, { onQuick, onProgress } = {}) {
  const mono = mixdown(buffer), sr = buffer.sampleRate, duration = buffer.duration, st = stereoFeatures(buffer);
  const LR = buffer.numberOfChannels > 1 ? { L: buffer.getChannelData(0), R: buffer.getChannelData(1) } : {};
  const w = getWorker();
  if (!w) return new Promise(res => setTimeout(() => { const a = analyzeMono(mono, sr, duration, { ...LR }); res(makeTrack(a, meta, meta.bpm, undefined, st)); }, 0));
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    let res = resolve, rej = reject;
    const on = e => { const d = e.data; if (d.id !== id) return;
      if (d.stage === 'progress') onProgress && onProgress(d.p);
      else if (d.stage === 'quick') onQuick && onQuick(makeTrack(d.a, { ...meta, quick: true }, meta.bpm, undefined, st));
      else if (d.stage === 'full') { w.removeEventListener('message', on); res(makeTrack(d.a, meta, meta.bpm, undefined, st)); }
      else if (d.stage === 'error') { w.removeEventListener('message', on); rej(new Error(d.message)); } };
    w.addEventListener('message', on);
    // a worker-level error fails this job once: drop the worker for later jobs and analyse on the main thread
    const onErr = err => { console.warn('[u2c] worker error, falling back', err && err.message); w.removeEventListener('message', on); w.removeEventListener('error', onErr); if (worker === w) { try { w.terminate(); } catch (_) {} worker = false; }
      res(makeTrack(analyzeMono(mono, sr, duration, { ...LR }), meta, meta.bpm, undefined, st)); };
    const done = () => { w.removeEventListener('error', onErr); };
    w.addEventListener('error', onErr);
    const res0 = res; res = v => { done(); res0(v); }; const rej0 = rej; rej = e => { done(); rej0(e); };
    w.postMessage({ mono, sr, duration, id, key: bufKey(buffer), ...LR }); // copied, not transferred: kept for the main-thread fallback
  });
}
export async function decodeFile(file, ac) { const ab = await file.arrayBuffer(); return await ac.decodeAudioData(ab); }
export function metaFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, ''); const m = base.match(/(?:^|[^\d])(\d{2,3})\s?(?:bpm)?(?![\d])/i); const bpm = m && +m[1] >= 60 && +m[1] <= 200 && /bpm|[-_ ]\d{2,3}$/i.test(base) ? +m[1] : null;
  // title: drop BPM and key tokens ("-fmin-128", "_140bpm", "F#m") and separators
  const isBpm = (w) => { const q = w.match(/^(\d{2,3})(bpm)?$/i); return !!q && +q[1] >= 60 && +q[1] <= 200; };
  const words = base.split(/[-_\s]+/).filter((w) => w && !isBpm(w) && !/^[a-g](#|b|s)?(m|min|maj|minor|major)$/i.test(w) && !/^bpm$/i.test(w));
  const title = words.join(' ').trim() || base;
  return { name, title, bpm, bpmSource: bpm ? 'from file name' : 'detected' };
}

/** 16-bar 140 BPM trap sketch in F# minor, rendered offline so the app opens with something to look at. */
export async function synthDemo() {
  const bpm = 140, spb = 60 / bpm, bars = 16, sr = 44100, dur = bars * 4 * spb + .2;
  const oc = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; const master = oc.createGain(); master.gain.value = .75; master.connect(comp); comp.connect(oc.destination);
  const nb = oc.createBuffer(1, sr, sr), nd = nb.getChannelData(0); for (let i = 0; i < sr; i++) nd[i] = hash(i, 77) * 2 - 1;
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0008, t + a + d); };
  const kick = t => { const o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + .11); env(g, t, .002, 1, .42); o.connect(g); g.connect(master); o.start(t); o.stop(t + .5); };
  const noise = (t, type, f, q, peak, d) => { const s = oc.createBufferSource(); s.buffer = nb; const fl = oc.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = oc.createGain(); env(g, t, .001, peak, d); s.connect(fl); fl.connect(g); g.connect(master); s.start(t, hash(t * 1000 | 0, 3) * .5); s.stop(t + d + .05); };
  const snare = t => { noise(t, 'bandpass', 1900, .6, .9, .2); const o = oc.createOscillator(), g = oc.createGain(); o.type = 'triangle'; o.frequency.value = 185; env(g, t, .001, .35, .1); o.connect(g); g.connect(master); o.start(t); o.stop(t + .15); };
  const hat = (t, v = 1) => noise(t, 'highpass', 7500, .7, .28 * v, .045);
  const bass = (t, f, d) => { const o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + .06); env(g, t, .005, .55, d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .1); };
  const stab = (t, fs, d) => { const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1600; const g = oc.createGain(); env(g, t, .01, .07, d); fl.connect(g); g.connect(master);
    for (const f of fs) { const o = oc.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (hash(f | 0, 1) - .5) * 14; o.connect(fl); o.start(t); o.stop(t + d + .1); } };
  const CH = [[185,220,277],[147,185,220],[165,208,247],[139,165,208]], RT = [46.25,36.7,41.2,34.65];
  for (let b = 0; b < bars; b++) { const T = b * 4 * spb, s16 = spb / 4, full = (b >= 4 && b < 12) || b >= 14, brk = b >= 12 && b < 14;
    stab(T, CH[b % 4], spb * 1.6); stab(T + spb * 2.5, CH[b % 4], spb * .8);
    for (let i = 0; i < 16; i++) if (i % 2 === 0 || (b % 2 === 1 && i >= 12)) hat(T + i * s16, i % 4 === 0 ? 1 : .6);
    if (full) { for (const i of (b % 2 ? [0,3,7,10] : [0,7,10,14])) kick(T + i * s16); snare(T + 2 * spb); if (b % 4 === 3) snare(T + 3.75 * spb); }
    if (full || brk) bass(T, RT[b % 4], spb * 2.2); }
  return oc.startRendering();
}

// ---- per-section v8 clip data (worker, main-thread fallback). Keyed by the AudioBuffer so the worker keeps its channels.
const KEYS = new WeakMap(); let nextKey = 0;
const bufKey = b => { let k = KEYS.get(b); if (!k) { k = 'b' + (++nextKey); KEYS.set(b, k); } return k; };
const factsCache = new WeakMap();
function channels(buffer) { const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L; return { L, R }; }
/** Clip data for [inT, inT + bars] of `buffer` (see clipdata.js). opts: {inT, bars, beat, fps, target, onProgress}. */
export function requestClipData(buffer, { inT, bars, beat, fps = 30, target = -14, onProgress } = {}) {
  const job = { inT, bars, beat, fps, target }, w = getWorker();
  const local = () => { const { L, R } = channels(buffer), sr = buffer.sampleRate; let f = factsCache.get(buffer); if (!f) { f = songFacts(L, R, sr); factsCache.set(buffer, f); }
    const D = clipData({ L, R, sr, ...job }); D.srcLufs = f.srcLufs; D.overview = f.overview; return D; };
  if (!w) return new Promise(res => setTimeout(() => res(local()), 0));
  const id = ++jobId, key = bufKey(buffer);
  return new Promise((resolve) => {
    const on = e => { const d = e.data; if (d.id !== id) return;
      if (d.stage === 'progress') { onProgress && onProgress(d.p); return; }
      if (d.stage === 'need-audio') { const { L, R } = channels(buffer); w.postMessage({ type: 'clip', id, key, ...job, L: L.slice(), R: R.slice(), sr: buffer.sampleRate }); return; }
      w.removeEventListener('message', on);
      if (d.stage === 'clip') resolve(d.D); else { console.warn('[u2c] clip data in the worker failed, using the main thread', d.message); resolve(local()); } };
    w.addEventListener('message', on);
    w.postMessage({ type: 'clip', id, key, ...job });
  });
}
