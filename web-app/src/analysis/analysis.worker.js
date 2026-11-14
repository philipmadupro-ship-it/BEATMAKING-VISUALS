// Analysis worker. Job "analyse": a quick low-resolution pass first (fast first preview), then the full pass; the
// channels are kept here for "clip" jobs: the per-frame v8 clip data (src/analysis/clipdata.js) for a section.
import { analyzeMono } from './dsp.js';
import { clipData, songFacts, transferables } from './clipdata.js';
let held = null; // { key, L, R, sr, facts }
self.onmessage = e => {
  const d = e.data;
  if (d.type === 'clip') {
    try {
      if (d.L && d.R) held = { key: d.key, L: d.L, R: d.R, sr: d.sr, facts: null };
      if (!held || held.key !== d.key) { self.postMessage({ id: d.id, stage: 'need-audio' }); return; }
      if (!held.facts) held.facts = songFacts(held.L, held.R, held.sr);
      const D = clipData({ L: held.L, R: held.R, sr: held.sr, inT: d.inT, bars: d.bars, beat: d.beat, fps: d.fps, target: d.target, progress: p => self.postMessage({ id: d.id, stage: 'progress', p }) });
      D.srcLufs = held.facts.srcLufs; D.overview = held.facts.overview.slice();
      self.postMessage({ id: d.id, stage: 'clip', D }, transferables(D));
    } catch (err) { self.postMessage({ id: d.id, stage: 'error', message: String(err && err.message || err) }); }
    return;
  }
  const { mono, sr, duration, id, L, R, key } = d;
  try {
    held = { key, L: L || mono, R: R || mono, sr, facts: null };
    // quick pass on a 2x decimated signal with a short FFT
    const dec = new Float32Array(Math.floor(mono.length / 2)); for (let i = 0; i < dec.length; i++) dec[i] = .5 * (mono[2 * i] + mono[2 * i + 1]);
    const quick = analyzeMono(dec, sr / 2, duration, { N: 1024, hop: 512 });
    self.postMessage({ id, stage: 'quick', a: quick });
    const full = analyzeMono(mono, sr, duration, { N: 2048, hop: 512, L, R, progress: p => self.postMessage({ id, stage: 'progress', p }) });
    self.postMessage({ id, stage: 'full', a: full });
  } catch (err) { self.postMessage({ id, stage: 'error', message: String(err && err.message || err) }); }
};
