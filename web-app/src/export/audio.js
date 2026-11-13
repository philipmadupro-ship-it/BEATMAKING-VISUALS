// Export audio: slice in->out, optional loop-seam crossfade, optional voice tag, resample to 48 kHz,
// ITU-R BS.1770 loudness measurement and normalisation (target LUFS with a -1 dBTP ceiling).
function biquad(x, b0, b1, b2, a1, a2) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
export function kWeight(x, fs) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = .7071752369554196, K = Math.tan(Math.PI * f0 / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, .4996667741545416), a0 = 1 + K / Q + K * K;
  const s1 = biquad(x, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444; Q = .5003270373238773; K = Math.tan(Math.PI * f0 / fs); a0 = 1 + K / Q + K * K;
  return biquad(s1, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
}
export function measure(buf) {
  const fs = buf.sampleRate, chans = [...Array(buf.numberOfChannels)].map((_, c) => kWeight(buf.getChannelData(c), fs));
  const blk = Math.round(.4 * fs), hop = Math.round(.1 * fs), L = []; let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (i) { const m = Math.abs(.5 * (d[i] + d[i - 1])) * 1.06; if (m > peak) peak = m; } } }
  for (let s = 0; s + blk <= chans[0].length; s += hop) { let z = 0; for (const ch of chans) { let a = 0; for (let i = s; i < s + blk; i++) a += ch[i] * ch[i]; z += a / blk; } L.push(z); }
  const lk = z => -.691 + 10 * Math.log10(z || 1e-12); const g1 = L.filter(z => lk(z) > -70); if (!g1.length) return { lufs: -70, peakDb: 20 * Math.log10(peak || 1e-9) };
  const rel = lk(g1.reduce((a, b) => a + b, 0) / g1.length) - 10, g2 = g1.filter(z => lk(z) > rel);
  return { lufs: lk(g2.reduce((a, b) => a + b, 0) / Math.max(1, g2.length)), peakDb: 20 * Math.log10(peak || 1e-9) };
}
/**
 * The clip [inT, outT) as a loop: the last ~beat is equal-power cross-faded with the audio just BEFORE the in point,
 * so when the clip repeats, the tail already sounds like the lead-in to bar 1 and the seam is inaudible.
 * Preview playback, the Seam check and the export all use this same buffer.
 */
const loopCache = new WeakMap();
export function loopBuffer(buffer, inT, outT, xfSec, loopSafe = true) {
  const key = [inT, outT, xfSec, loopSafe].join('|'); let m = loopCache.get(buffer); if (!m) { m = new Map(); loopCache.set(buffer, m); } if (m.has(key)) return m.get(key);
  const sr = buffer.sampleRate, nc = Math.min(2, buffer.numberOfChannels), a = Math.round(inT * sr), b = Math.min(buffer.length, Math.round(outT * sr)), n = Math.max(1, b - a);
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }), xf = Math.min(Math.round(xfSec * sr), a, Math.floor(n / 4));
  for (let c = 0; c < 2; c++) { const src = buffer.getChannelData(Math.min(c, nc - 1)), dst = out.getChannelData(c); dst.set(src.subarray(a, b));
    if (loopSafe && xf > 16) for (let i = 0; i < xf; i++) { const k = (i + .5) / xf * Math.PI / 2; dst[n - xf + i] = dst[n - xf + i] * Math.cos(k) + src[a - xf + i] * Math.sin(k); } }
  if (m.size > 8) m.clear(); m.set(key, out); return out;
}
const prepCache = new WeakMap();
/** Export audio (loop buffer → voice tag → 48 kHz → loudness). Cached per source buffer + options, so batch jobs reuse it. */
export async function prepareAudio(buffer, project, opts = {}) {
  const key = [project.inT, project.outT, opts.xf, !!opts.loopSafe, opts.loudness, opts.voiceTag ? opts.voiceEvery : 'clean'].join('|');
  let m = prepCache.get(buffer); if (!m) { m = new Map(); prepCache.set(buffer, m); }
  if (m.has(key)) return m.get(key);
  const res = await prepareAudioUncached(buffer, project, opts); if (m.size > 6) m.clear(); m.set(key, res); return res;
}
async function prepareAudioUncached(buffer, project, opts) {
  const sr = buffer.sampleRate, lb = loopBuffer(buffer, project.inT, project.outT, opts.xf || .02, !!opts.loopSafe), n = lb.length;
  let out = lb;
  if (opts.voiceTag) { out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); for (let c = 0; c < 2; c++) out.getChannelData(c).set(lb.getChannelData(c)); const vt = opts.voiceTag, every = Math.max(5, opts.voiceEvery || 25); for (let t0 = 1.5; t0 < n / sr; t0 += every) { const o = Math.round(t0 * sr);
    for (let c = 0; c < 2; c++) { const s = vt.getChannelData(Math.min(c, vt.numberOfChannels - 1)), d = out.getChannelData(c), ratio = vt.sampleRate / sr; for (let i = 0; o + i < n; i++) { const j = Math.floor(i * ratio); if (j >= s.length) break; d[o + i] += s[j] * .8; } } } }
  // resample to 48 kHz
  const oc = new OfflineAudioContext(2, Math.max(1, Math.round(n / sr * 48000)), 48000), node = oc.createBufferSource(); node.buffer = out; node.connect(oc.destination); node.start();
  let res = await oc.startRendering(); const before = measure(res); let gainDb = 0;
  if (opts.loudness !== 'off' && opts.loudness != null && isFinite(before.lufs) && before.lufs > -60) {
    gainDb = +opts.loudness - before.lufs; const ceiling = -1; if (before.peakDb + gainDb > ceiling) gainDb = ceiling - before.peakDb;
    const g = Math.pow(10, gainDb / 20); for (let c = 0; c < 2; c++) { const d = res.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
  const after = measure(res);
  return { buffer: res, stats: { inLufs: before.lufs, outLufs: after.lufs, peakDb: after.peakDb, gainDb } };
}
