// Meter streams of a mastered clip (meters v2), shared by the web analysis (clipdata.js) and the native renderer
// (u2c-motion tools/meterdata.mjs computes them from the mastered clip WAV with this same code, so both renderers
// read identical numbers):
//  - scope: the 8 kHz L/R stream (every sample of the scope rate, Int16, 1/16384 per step) the stereo scope plots
//  - polar: per frame, energy per 2° sector of the scope samples (dB re the frame's sample count)
//  - lv: level meters, 1 ms blocks of sample peak, mean square and clip flags (2+ consecutive samples at full scale)
//  - ms: msspec.js stereoSpectra (M/S spectrogram, width, analyzer, LTAS)
// packStreams turns the typed arrays into JSON-safe base64 records (native data file); v8/data.js unpackStreams reverses it.
import { CLIP_LEVEL } from './stereo.js';
import { stereoSpectra } from './msspec.js';
import { polarLevels } from '../v8/meterlib.js';
import { bandEnvStream } from './bandenv.js';   // v11: 1 ms band-limited detector for the dynamic EQ
export const POLAR_N = 90;
const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

export function meterStreams({ L: cL, R: cR, sr, NF, fps, bars, barLen }) {
  const n = cL.length, dt = 1 / fps;
  const dec = Math.max(1, Math.round(sr / 8000)), ns = Math.floor(n / dec), scL = new Int16Array(ns), scR = new Int16Array(ns);
  for (let i = 0; i < ns; i++) { scL[i] = clampv(Math.round(cL[i * dec] * 16384), -32767, 32767); scR[i] = clampv(Math.round(cR[i * dec] * 16384), -32767, 32767); }
  const polar = new Float32Array(NF * POLAR_N), pv = new Float32Array(POLAR_N), srate = sr / dec;
  for (let f = 1; f < NF; f++) { const e = Math.min(ns, Math.floor(f * dt * srate)), a = Math.max(0, e - Math.round(srate * dt)); polarLevels(scL, scR, a, e, POLAR_N, pv, 1 / 16384); for (let j = 0; j < POLAR_N; j++) polar[f * POLAR_N + j] = Math.round(pv[j] * 10) / 10; }
  polar.fill(-150, 0, POLAR_N);
  const LR = 1000, nLv = Math.floor(n * LR / sr), lev = { rate: LR, n: nLv, pkL: new Float32Array(nLv), pkR: new Float32Array(nLv), msL: new Float32Array(nLv), msR: new Float32Array(nLv), clipL: new Uint8Array(nLv), clipR: new Uint8Array(nLv) };
  [[cL, lev.pkL, lev.msL, lev.clipL], [cR, lev.pkR, lev.msR, lev.clipR]].forEach(([ch, PK, MS, CLP]) => { let run = 0;
    for (let b = 0; b < nLv; b++) { const a = Math.round(b * sr / LR), e = Math.round((b + 1) * sr / LR); let p = 0, q = 0;
      for (let i = a; i < e; i++) { const v = Math.abs(ch[i]); if (v > p) p = v; q += v * v; run = v >= CLIP_LEVEL ? run + 1 : 0; if (run >= 2) CLP[b] = 1; }
      PK[b] = p; MS[b] = q / Math.max(1, e - a); } });
  const ms = stereoSpectra({ L: cL, R: cR, sr, NF, fps, bars, barLen });
  return { scope: { rate: sr / dec, scale: 1 / 16384, L: scL, R: scR }, polar, polarN: POLAR_N, lv: lev, ms, be: bandEnvStream({ L: cL, R: cR, sr }) };
}

const toB64 = (u8) => { if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
/** Typed arrays -> {"$t": type, "b64": little-endian bytes}, recursively (JSON-safe). */
export function packStreams(o) {
  if (ArrayBuffer.isView(o)) return { $t: o.constructor.name, b64: toB64(new Uint8Array(o.buffer, o.byteOffset, o.byteLength)) };
  if (o && typeof o === 'object') { const r = Array.isArray(o) ? [] : {}; for (const k of Object.keys(o)) r[k] = packStreams(o[k]); return r; }
  return o;
}
