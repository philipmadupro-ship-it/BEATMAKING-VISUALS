// Analysis worker: a quick low-resolution pass first (fast first preview), then the full pass.
import { analyzeMono } from './dsp.js';
self.onmessage = e => {
  const { mono, sr, duration, id } = e.data;
  try {
    // quick pass on a 2x decimated signal with a short FFT
    const dec = new Float32Array(Math.floor(mono.length / 2)); for (let i = 0; i < dec.length; i++) dec[i] = .5 * (mono[2 * i] + mono[2 * i + 1]);
    const quick = analyzeMono(dec, sr / 2, duration, { N: 1024, hop: 512 });
    self.postMessage({ id, stage: 'quick', a: quick });
    const full = analyzeMono(mono, sr, duration, { N: 2048, hop: 512, progress: p => self.postMessage({ id, stage: 'progress', p }) });
    self.postMessage({ id, stage: 'full', a: full });
  } catch (err) { self.postMessage({ id, stage: 'error', message: String(err && err.message || err) }); }
};
