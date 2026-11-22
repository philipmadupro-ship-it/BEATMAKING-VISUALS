// v22.4 lab audio for the web export (parity with the native render's tools/sfx.py + tools/voice.py):
//   keyTaps(buffer, events, opts)  mechanical keyboard taps for the film's typing moments (film.typeEvents()): switch click + plate thock + spring
//                                  release, human pace (~15 taps/s across each typed span), an enter press after each message. Seeded: deterministic.
//   placeVoice(buffer, take, ats)  a recorded voice take (AudioBuffer) split at its pauses (>= 0.2 s under -35 dBFS), phrase i placed at ats[i] seconds.
// Both add into an AudioBuffer in place.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function tap(sr, R, heavy) {
  const m = Math.round(0.09 * sr), o = new Float32Array(m), vel = (0.7 + 0.3 * R()) * (heavy ? 1.25 : 1), fb = (heavy ? 150 : 190) + (R() * 65 - 20), r0 = Math.round((0.045 + 0.015 * R()) * sr);
  let prev = 0, lp = 0;
  for (let i = 0; i < m; i++) { const x = i / sr, n = R() * 2 - 1, hp = n - prev; prev = n; lp += (n - lp) * 0.12;
    o[i] = vel * (hp * Math.exp(-x / 0.0011) * 0.55 + Math.sin(2 * Math.PI * fb * x) * Math.exp(-x / (heavy ? 0.022 : 0.014)) * 0.7 + lp * Math.exp(-x / 0.008) * 0.35);
    if (i >= r0 && i < r0 + 0.012 * sr) o[i] += hp * Math.exp(-(i - r0) / (0.0009 * sr)) * 0.25 * vel; }
  return o;
}

export function keyTaps(buf, events, { gainDb = -10, seed = 7 } = {}) {
  const sr = buf.sampleRate, R = rng(seed), g = Math.pow(10, gainDb / 20) * 0.55, chans = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
  const put = (t, s) => { const i0 = Math.round(t * sr); for (const d of chans) for (let i = 0; i < s.length && i0 + i < d.length; i++) if (i0 + i >= 0) d[i0 + i] += s[i] * g; };
  for (const e of events) {
    let n = e.n, dt = e.dt; if (dt < 0.05) { const tot = n * dt; n = Math.max(1, Math.round(tot / 0.065)); dt = tot / n; }
    let tt = e.t; for (let i = 0; i < n; i++) { put(tt, tap(sr, R, R() < 0.08)); tt += dt * (0.7 + 0.6 * R()) * (R() < 0.12 ? 1.6 : 1); }
    put(e.t + e.n * e.dt * 1.05 + 0.08, tap(sr, R, true));   // enter
  }
}

// v23 one octave down with the timing kept (overlapping Hann grains read at half speed; formants shift with it: a little scary)
function octaveDown(src) { const N = 2048, hop = 512, out = new Float32Array(src.length); const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let g = 0; g < src.length; g += hop) for (let i = 0; i < N && g + i < out.length; i++) { const x = g + i * 0.5, x0 = Math.floor(x), a = src[x0] || 0, b2 = src[x0 + 1] || 0; out[g + i] += (a + (b2 - a) * (x - x0)) * win[i] * 0.5; }
  return out; }
export function placeVoice(buf, take, ats, { gainDb = 0, subDb = null } = {}) {
  const sr = take.sampleRate, src = take.getChannelData(0), win = Math.round(0.01 * sr), thr = Math.pow(10, -35 / 20), minGap = 0.2, segs = [];
  let inSpeech = false, s0 = 0, quiet = 0;
  for (let i = 0; i < src.length; i += win) { let pk = 0; for (let j = i; j < Math.min(src.length, i + win); j++) pk = Math.max(pk, Math.abs(src[j]));
    if (pk >= thr) { if (!inSpeech) { inSpeech = true; s0 = i; } quiet = 0; } else if (inSpeech) { quiet += win / sr; if (quiet >= minGap) { segs.push([s0, i - Math.round(quiet * sr) + win]); inSpeech = false; } } }
  if (inSpeech) segs.push([s0, src.length]);
  // v24 (audit V3): a take with an extra pause (a breath mid-line) would shift every later phrase: merge the shortest gaps until one phrase per line
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i][1] - segs[i][0] < 0.08 * sr) segs.splice(i, 1);
  while (segs.length > ats.length && segs.length > 1) { let g = 0; for (let i = 1; i < segs.length - 1; i++) if (segs[i + 1][0] - segs[i][1] < segs[g + 1][0] - segs[g][1]) g = i; segs.splice(g, 2, [segs[g][0], segs[g + 1][1]]); }
  const g = Math.pow(10, gainDb / 20), out = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c)), tk = [...Array(take.numberOfChannels)].map((_, c) => take.getChannelData(c)), k = sr / buf.sampleRate, gs = subDb == null ? 0 : Math.pow(10, subDb / 20), sub = gs ? tk.map((ch) => octaveDown(ch)) : null;
  segs.slice(0, ats.length).forEach(([a, b], si) => { const o0 = Math.round(ats[si] * buf.sampleRate), n = Math.round((b - a) / k);
    out.forEach((d, c) => { const s = tk[Math.min(c, tk.length - 1)]; for (let i = 0; i < n && o0 + i < d.length; i++) { const x = a + i * k, x0 = Math.floor(x); d[o0 + i] += (s[x0] + (s[x0 + 1] - s[x0]) * (x - x0) || 0) * g; if (sub) { const u = sub[Math.min(c, sub.length - 1)], j = x0 - Math.round(0.012 * sr); d[o0 + i] += (u[j] || 0) * gs * g; } } }); });
  return segs.length;
}

// v22.5 serious bloop (deep falling sine + sub) and the lab room tone (mains hum, air, faint relay ticks) - same recipes as tools/sfx.py
export function bloop(buf, t, { gainDb = -10 } = {}) {
  const sr = buf.sampleRate, n = Math.round(0.55 * sr), g = Math.pow(10, gainDb / 20) * 0.9, chans = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c)), i0 = Math.round(t * sr); let ph = 0;
  for (let i = 0; i < n; i++) { const x = i / sr, f = 62 + 148 * Math.exp(-x / 0.07); ph += 2 * Math.PI * f / sr; const v = (Math.sin(ph) + 0.35 * Math.sin(ph / 2)) * Math.exp(-x / 0.16) * Math.min(1, x / 0.006) * g; for (const d of chans) if (i0 + i < d.length && i0 + i >= 0) d[i0 + i] += v; }
}
export function room(buf, dur, { gainDb = -10, seed = 11 } = {}) {
  const sr = buf.sampleRate, n = Math.min(buf.length, Math.round(dur * sr)), g = Math.pow(10, gainDb / 20), R = rng(seed), chans = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
  let lp = 0; const ticks = new Set(); for (let k = 0; k < dur * 1.6; k++) ticks.add(Math.round((0.3 + R() * (dur - 0.5)) * sr));
  let tk = -1;
  for (let i = 0; i < n; i++) { const x = i / sr, e = Math.min(1, x / 0.8, (dur - x) / 0.6); lp += ((R() * 2 - 1) - lp) * 0.03;
    if (ticks.has(i)) tk = i; const tv = tk >= 0 && i - tk < 0.006 * sr ? (R() * 2 - 1) * Math.exp(-(i - tk) / (0.0008 * sr)) * 0.06 : 0;
    const v = (0.05 * Math.sin(2 * Math.PI * 50 * x) + 0.025 * Math.sin(2 * Math.PI * 100 * x) + 0.01 * Math.sin(2 * Math.PI * 150 * x) + lp * 0.35 * 3 + tv) * Math.max(0, e) * g;
    for (const d of chans) d[i] += v; }
}

// v23 gas-stove ignition (the web twin of the ElevenLabs sample): three piezo clicks, then the flame catches (a filtered noise whoosh) and settles to a hiss
export function stove(buf, t, { gainDb = -6, seed = 5 } = {}) {
  const sr = buf.sampleRate, R = rng(seed), g = Math.pow(10, gainDb / 20), n = Math.round(2.6 * sr), chans = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c)), i0 = Math.round(t * sr); let lp = 0, lp2 = 0;
  const clicks = [0, 0.075, 0.14].map((q) => Math.round((q + 0.2) * sr));
  for (let i = 0; i < n; i++) { const x = i / sr, nz = R() * 2 - 1; let v = 0;
    for (const c0 of clicks) if (i >= c0 && i < c0 + 0.004 * sr) v += nz * Math.exp(-(i - c0) / (0.0006 * sr)) * 0.9;
    lp += (nz - lp) * 0.12; lp2 += (lp - lp2) * 0.25; const wx = x - 0.36, env = wx < 0 ? 0 : Math.min(1, wx / 0.12) * (0.25 + 0.75 * Math.exp(-wx / 0.35)) * Math.max(0, Math.min(1, (2.6 - x) / 0.5));
    v += lp2 * env * 1.6; const o = i0 + i; if (o >= 0 && o < buf.length) for (const d of chans) d[o] += v * g; }
}
