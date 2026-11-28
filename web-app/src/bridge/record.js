// Record the visuals at export quality. The film is drawn into an OFFSCREEN canvas at the export size (1080x1920 / 1920x1080, or 4K) with the same
// renderFrame the exporter uses, driven by the live clock at a steady 30 or 60 fps; that canvas goes through captureStream(fps) into MediaRecorder
// together with the master audio. The small preview canvas is never recorded. The measured fps is reported (4K in real time may drop frames).
import { makeSurface } from '../engine/render.js';
export const QUALITY = { '1080p': { 916: [1080, 1920], 169: [1920, 1080], mbps: 16 }, '4k': { 916: [2160, 3840], 169: [3840, 2160], mbps: 48 } };
/** {W, H, fps, mbps} for a project aspect ('916' | '169'), quality ('1080p' | '4k') and fps (30 | 60). */
export function recordSpec(aspect, q = '1080p', fps = 30) {
  const Q = QUALITY[q] || QUALITY['1080p'], [W, H] = Q[aspect === '916' ? 916 : 169];
  return { W, H, fps: fps === 60 ? 60 : 30, mbps: Q.mbps * (fps === 60 ? 1.5 : 1) };
}
export const pickMime = (MR = globalThis.MediaRecorder) => ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MR && MR.isTypeSupported && MR.isTypeSupported(m)) || '';
/** Start drawing + capturing. Returns {stream, stop(), spec, stats()}; `onStats({fps, drops})` runs about once a second. */
export function startOffscreen(app, spec, onStats = () => {}) {
  const surf = makeSurface(spec.W, spec.H), clk = app.clock, step = 1000 / spec.fps;
  const stream = surf.canvas.captureStream(spec.fps); let alive = true, next = performance.now(), n = 0, last = performance.now(), fps = 0, drops = 0;
  const frame = () => {
    if (!alive) return; requestAnimationFrame(frame);
    const now = performance.now(); if (now < next - 2) return;
    if (now > next + step * 1.5) drops += Math.floor((now - next) / step);
    next = Math.max(next + step, now - step);
    try { const P = app.store.project; app.renderFrame(clk.time(), surf, P, app.store.session.track, { fps: spec.fps }); } catch (e) { console.warn(e); }
    n++; if (now - last >= 1000) { fps = n * 1000 / (now - last); n = 0; last = now; onStats({ fps, drops }); }
  };
  requestAnimationFrame(frame);
  return { stream, spec, surf, stop() { alive = false; stream.getTracks().forEach((t) => t.stop()); }, stats: () => ({ fps, drops }) };
}
