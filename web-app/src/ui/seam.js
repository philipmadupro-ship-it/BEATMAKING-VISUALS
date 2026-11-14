// Seam check: plays the last 2 s of the loop straight into its first 2 s, on repeat (using the same cross-faded loop
// buffer as the export), and shows the last and first frames side by side with their pixel difference.
import { makeSurface } from '../engine/render.js';
import { ASPECTS } from '../engine/layout.js';
const $ = s => document.querySelector(s);
/** Mean absolute RGB difference of two same-size canvases, 0..100 %. */
export function frameDiff(a, b) {
  const w = 96, h = Math.round(96 * a.height / a.width), c = document.createElement('canvas'); c.width = w * 2; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(a, 0, 0, w, h); g.drawImage(b, w, 0, w, h); const A = g.getImageData(0, 0, w, h).data, B = g.getImageData(w, 0, w, h).data; let s = 0;
  for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
  return s / (A.length / 4 * 3 * 255) * 100;
}
export function createSeam(app) {
  let on = false;
  function frames() {
    const p = app.store.snapshot(), tr = app.store.session.track; if (!tr) return null; const { W, H } = ASPECTS[p.aspect], fps = p.export.fps;
    const cw = 270, ch = Math.round(cw * H / W), out = [];
    for (const [id, t] of [['#seamLast', p.outT - 1 / fps], ['#seamFirst', p.inT]]) { const cv = $(id); cv.width = cw; cv.height = ch; const s = makeSurface(cw, ch); app.renderFrame(t, s, p, tr, { target: cv.getContext('2d') }); out.push(cv); }
    const d = frameDiff(out[0], out[1]); $('#seamInfo').textContent = `last frame ${(p.outT - 1 / fps).toFixed(3)} s → first frame ${p.inT.toFixed(3)} s · pixel difference ${d.toFixed(1)} % · audio: ${Math.round(Math.min(tr.spb, (p.outT - p.inT) / 4) * 1000)} ms equal-power crossfade`;
    $('#seamBox').dataset.diff = d.toFixed(2); return d;
  }
  function start() {
    const p = app.store.project, tr = app.store.session.track, buf = app.store.session.buffer; if (!tr || !buf) return;
    const lb = app.actions.loopBuf(), sr = lb.sampleRate, L = lb.duration, half = Math.min(2, L / 2), n = Math.round(half * sr);
    const reel = new AudioBuffer({ length: 2 * n, numberOfChannels: 2, sampleRate: sr });
    for (let c = 0; c < 2; c++) { const s = lb.getChannelData(c), d = reel.getChannelData(c); d.set(s.subarray(lb.length - n), 0); d.set(s.subarray(0, n), n); }
    const inT = p.inT, outT = p.outT;
    $('#seamBox').hidden = false; frames(); on = true; $('#seamBtn').setAttribute('aria-pressed', 'true');
    app.clock.playBuffer(reel, { map: x => (x < half ? outT - half + x : inT + (x - half)), kind: 'seam' });
  }
  function stop() { if (!on) return; on = false; $('#seamBtn').setAttribute('aria-pressed', 'false'); if (app.clock.mode === 'seam') app.clock.pause(); }
  $('#seamBtn').addEventListener('click', () => { if (on) { stop(); $('#seamBox').hidden = true; } else start(); });
  $('#seamClose').addEventListener('click', () => { stop(); $('#seamBox').hidden = true; });
  return { start, stop, frames, get on() { return on; } };
}
