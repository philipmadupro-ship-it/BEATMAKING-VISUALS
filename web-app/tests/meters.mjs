// Meter accuracy test (PLAN-v5 item 5): the app's own analysis + metering code (src/analysis, src/engine/meters.js)
// run in Node on stereo test signals, compared with ffmpeg (ebur128 + astats) and numpy.
//   node tests/meters.mjs            (needs python3 + numpy + scipy and ffmpeg on PATH)
// Signals (48 kHz, 32-bit float, 10 s): 1 kHz sine at -18 dBFS (L = R), pink noise (independent L/R, -20 dBFS RMS),
// hard-left pink (R silent), out-of-phase pink (R = -L), digital silence, 100 Hz sine driven +6 dB into hard clipping.
// Asserts: sample peak and RMS within ±0.5 dB of astats/numpy · integrated LUFS within ±0.5 LU of ebur128 · true peak
// within ±0.5 dB of ebur128 (peak=true) · spectrum peak in the 1 kHz bin · correlation +1 / 0 / -1 · silence reads the
// floor (-inf) · clip LED only on the clipped file · EQ envelope vs pink: pink reads flat, the sine's 1 kHz node leads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { stereoFeatures } = await import(path.join(ROOT, 'src/analysis/stereo.js'));
const { analyzeMono } = await import(path.join(ROOT, 'src/analysis/dsp.js'));
const { makeTrack, mixdown } = await import(path.join(ROOT, 'src/analysis/index.js'));
const { meters } = await import(path.join(ROOT, 'src/engine/meters.js'));
const { clipData, OCT6 } = await import(path.join(ROOT, 'src/analysis/clipdata.js'));
const ML = await import(path.join(ROOT, 'src/v8/meterlib.js'));

const DIR = process.env.METERS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'u2c-meters-'));
const TOL = { peak: .5, rms: .5, lufs: .5, tp: .5 };
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };

// ---- 1. signals + numpy reference values
const PY = String.raw`
import json, sys, numpy as np
from scipy.io import wavfile
d = sys.argv[1]; sr = 48000; n = sr * 10; t = np.arange(n) / sr; rng = np.random.default_rng(7)
def pink(seed):
    r = np.random.default_rng(seed); w = r.standard_normal(n); W = np.fft.rfft(w); f = np.fft.rfftfreq(n, 1 / sr); f[0] = f[1]
    p = np.fft.irfft(W / np.sqrt(f), n); p -= p.mean(); return p / np.sqrt(np.mean(p ** 2)) * 10 ** (-20 / 20)
sine = 10 ** (-18 / 20) * np.sin(2 * np.pi * 1000 * t)
pl, pr = pink(1), pink(2)
sig = {
  'sine1k': (sine, sine),
  'pink': (pl, pr),
  'hardleft': (pl, np.zeros(n)),
  'outphase': (pl, -pl),
  'silence': (np.zeros(n), np.zeros(n)),
  'clipped': (np.clip(2.0 * np.sin(2 * np.pi * 100 * t), -1, 1),) * 2,
}
out = {}
db = lambda v: float(20 * np.log10(v)) if v > 0 else None
for k, (l, r) in sig.items():
    x = np.stack([l, r], 1).astype(np.float32); wavfile.write(f'{d}/{k}.wav', sr, x)
    l, r = x[:, 0].astype(np.float64), x[:, 1].astype(np.float64)
    el, er = np.sum(l * l), np.sum(r * r)
    corr = 0.0 if min(el, er) < 1e-12 else float(np.sum(l * r) / np.sqrt(el * er))
    P = (np.abs(np.fft.rfft(l)) ** 2 + np.abs(np.fft.rfft(r)) ** 2); f = np.fft.rfftfreq(n, 1 / sr)
    out[k] = {'peak': [db(np.max(np.abs(l))), db(np.max(np.abs(r)))], 'rms': [db(np.sqrt(np.mean(l * l))), db(np.sqrt(np.mean(r * r)))],
              'corr': corr, 'peakHz': float(f[np.argmax(P)]) if P.max() > 0 else None}
json.dump(out, open(f'{d}/numpy.json', 'w'))
`;
fs.writeFileSync(path.join(DIR, 'gen.py'), PY);
execFileSync('python3', ['-I', path.join(DIR, 'gen.py'), DIR], { stdio: 'inherit' });
const NP = JSON.parse(fs.readFileSync(path.join(DIR, 'numpy.json'), 'utf8'));

// ---- 2. ffmpeg reference values
function ffmpegRef(file) {
  const run = af => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }); return r.stderr; };
  const e = run('ebur128=peak=true'), sum = e.slice(e.lastIndexOf('Summary:'));
  const num = (re, s) => { const m = s.match(re); return m ? (/inf/i.test(m[1]) ? -Infinity : +m[1]) : NaN; };
  const lufs = num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/, sum), tp = num(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/, sum);
  const a = run('astats=measure_overall=none'), ch = a.split(/Channel: \d+/).slice(1);
  const pk = ch.map(s => num(/Peak level dB:\s+(-?[\d.]+|-inf)/, s)), rms = ch.map(s => num(/RMS level dB:\s+(-?[\d.]+|-inf)/, s));
  return { lufs, tp, peak: pk, rms };
}

// ---- 3. the app's analysis + meters on the same files
function readWav(file) {
  const b = fs.readFileSync(file); let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / (fmt.bits / 8) / fmt.ch, chans = [...Array(fmt.ch)].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) { const p = (i * fmt.ch + c) * fmt.bits / 8; chans[c][i] = fmt.tag === 3 ? data.readFloatLE(p) : data.readInt16LE(p) / 32768; }
  return { sampleRate: fmt.sr, length: n, numberOfChannels: fmt.ch, duration: n / fmt.sr, getChannelData: c => chans[c] };
}
function appMeasure(file) {
  const buf = readWav(file), st = stereoFeatures(buf), mono = mixdown(buf);
  const a = analyzeMono(mono, buf.sampleRate, buf.duration, { L: buf.getChannelData(0), R: buf.getChannelData(1) });
  const T = makeTrack(a, { name: path.basename(file) }, 120, 0, st), M = meters(T), dur = buf.duration, ts = [];
  for (let t = .5; t <= dur - .05; t += .01) ts.push(t);
  const pow = ch => { let s = 0; for (const t of ts) s += Math.pow(10, M.rmsDb(ch, t) / 10); return 10 * Math.log10(s / ts.length); };
  const corrs = ts.map(t => M.corr(t)).sort((x, y) => x - y), mid = dur / 2;
  const env = M.envelope(mid, 1), rel = M.pinkRel(mid, 1);
  let maxRel = 0; for (let k = 0; k < rel.rel.length; k++) { const f = M.binHz(k); if (f >= 60 && f <= 12000) maxRel = Math.max(maxRel, Math.abs(rel.rel[k])); }
  return {
    peak: [0, 1].map(ch => Math.max(...ts.map(t => M.peakDb(ch, t)))), rms: [pow(0), pow(1)], lufs: M.lufsI(0, dur), tp: Math.max(...ts.map(t => M.truePeak(t))),
    corr: corrs[corrs.length >> 1], clip: ts.some(t => M.clip(t)), peakHz: M.peakHz(env), peakBin: env.indexOf(Math.max(...env)), binOf: f => Math.floor(T.specBins * Math.log(f / 30) / Math.log(14000 / 30)),
    eq: M.eqBands(mid), maxRel, silent: rel.silent, lufsM: M.lufsM(mid),
  };
}

// ---- 4. compare
const fmt = v => (v === -Infinity || v == null ? '-inf' : v.toFixed(2));
const near = (a, b, tol) => (b === -Infinity || b == null ? a <= -100 : Math.abs(a - b) <= tol);
const table = [];
for (const k of ['sine1k', 'pink', 'hardleft', 'outphase', 'silence', 'clipped']) {
  const f = path.join(DIR, k + '.wav'), F = ffmpegRef(f), A = appMeasure(f), N = NP[k];
  const pk = [0, 1].map(c => near(A.peak[c], F.peak[c], TOL.peak) && near(A.peak[c], N.peak[c], TOL.peak));
  const rm = [0, 1].map(c => near(A.rms[c], F.rms[c], TOL.rms) && near(A.rms[c], N.rms[c], TOL.rms));
  ok(`${k}: sample peak L/R ±${TOL.peak} dB`, pk[0] && pk[1], `app ${fmt(A.peak[0])}/${fmt(A.peak[1])} · astats ${fmt(F.peak[0])}/${fmt(F.peak[1])} · numpy ${fmt(N.peak[0])}/${fmt(N.peak[1])}`);
  ok(`${k}: RMS L/R ±${TOL.rms} dB`, rm[0] && rm[1], `app ${fmt(A.rms[0])}/${fmt(A.rms[1])} · astats ${fmt(F.rms[0])}/${fmt(F.rms[1])} · numpy ${fmt(N.rms[0])}/${fmt(N.rms[1])}`);
  const lufsOk = k === 'silence' ? A.lufs <= -70 && F.lufs <= -70 : near(A.lufs, F.lufs, TOL.lufs);
  ok(`${k}: integrated LUFS ±${TOL.lufs} LU`, lufsOk, `app ${fmt(A.lufs)} · ebur128 ${fmt(F.lufs)}`);
  ok(`${k}: true peak ±${TOL.tp} dB`, near(A.tp, F.tp, TOL.tp), `app ${fmt(A.tp)} dBTP · ebur128 ${fmt(F.tp)} dBTP`);
  const wantCorr = { sine1k: 1, pink: 0, hardleft: 0, outphase: -1, silence: 0, clipped: 1 }[k];
  ok(`${k}: correlation ${wantCorr > 0 ? '+' : ''}${wantCorr}`, Math.abs(A.corr - wantCorr) <= .1 && Math.abs(A.corr - N.corr) <= .1, `app ${A.corr.toFixed(3)} · numpy ${N.corr.toFixed(3)}`);
  ok(`${k}: clip LED ${k === 'clipped' ? 'on' : 'off'}`, A.clip === (k === 'clipped'), `clip ${A.clip}`);
  table.push({ k, A, F, N });
  if (k === 'sine1k') {
    ok('sine1k: spectrum peak in the 1 kHz bin', A.peakBin === A.binOf(1000) && Math.abs(Math.log2(A.peakHz / 1000)) < 1 / 6, `peak bin ${A.peakBin} (1 kHz bin ${A.binOf(1000)}) · interpolated ${A.peakHz.toFixed(0)} Hz · numpy ${N.peakHz.toFixed(0)} Hz`);
    const n1 = A.eq.find(b => b.f === 1000), others = A.eq.filter(b => b.f !== 1000);
    ok('sine1k: EQ node at 1 kHz leads (measured envelope, not decorative)', others.every(b => n1.db > b.db + 10), A.eq.map(b => `${b.f >= 1000 ? b.f / 1000 + 'k' : b.f} ${b.db.toFixed(1)}`).join(' · '));
  }
  if (k === 'pink') ok('pink: EQ envelope flat vs the pink reference', A.eq.every(b => Math.abs(b.db) <= 1.5) && A.maxRel <= 3, `nodes ${A.eq.map(b => b.db.toFixed(1)).join(' / ')} dB · worst bin 60 Hz-12 kHz ${A.maxRel.toFixed(1)} dB`);
  if (k === 'silence') ok('silence: meters at the floor (−∞)', A.peak.every(v => v <= -100) && A.rms.every(v => v <= -100) && A.lufsM <= -70 && A.silent && A.tp <= -100, `peak ${fmt(A.peak[0])} · rms ${fmt(A.rms[0])} · LUFS-M ${fmt(A.lufsM)} · TP ${fmt(A.tp)}`);
}
// ---- 5. v8 clip meters (src/analysis/clipdata.js, the data behind the EXE / LAB / SCOPE looks) on the same signals:
// 4 bars at 120 BPM from t = 0, ungained ('off') and mastered to -14 LUFS
for (const k of ['sine1k', 'pink', 'outphase', 'clipped']) {
  const f = path.join(DIR, k + '.wav'), F = ffmpegRef(f), buf = readWav(f), L = buf.getChannelData(0), R = buf.getChannelData(1);
  const D = clipData({ L, R, sr: buf.sampleRate, inT: 0, bars: 4, beat: .5, target: 'off' }), last = D.frames - 1;
  ok(`v8 ${k}: clip integrated LUFS ±${TOL.lufs} LU`, near(D.summary.I, F.lufs, TOL.lufs), `clip ${fmt(D.summary.I)} · ebur128 ${fmt(F.lufs)} · LUFS-S at the end ${D.frame.S[last]}`);
  ok(`v8 ${k}: clip true peak ±${TOL.tp} dB`, near(D.summary.TP, F.tp, TOL.tp), `clip ${fmt(D.summary.TP)} dBTP · ebur128 ${fmt(F.tp)} dBTP`);
  const want = { sine1k: 1, pink: 0, outphase: -1, clipped: 1 }[k];
  ok(`v8 ${k}: smoothed correlation ${want}`, Math.abs(D.frame.corr[last] - want) <= .1, `corr ${D.frame.corr[last]}`);
  if (k === 'sine1k') { const mid = D.frames >> 1, sp = D.frame.spec.subarray(mid * 61, mid * 61 + 61), i = sp.indexOf(Math.max(...sp));
    ok('v8 sine1k: 1/6-oct spectrum peak = the 1 kHz band at -18 dBFS', Math.abs(OCT6[i] - 1000) < 1 && Math.abs(sp[i] + 18) <= .5, `band ${OCT6[i].toFixed(0)} Hz at ${sp[i]} dB`); }
  if (k === 'pink') { const M = clipData({ L, R, sr: buf.sampleRate, inT: 0, bars: 4, beat: .5, target: -14 });
    ok('v8 pink: mastered clip reads -14 LUFS integrated, TP <= -1 dBTP', Math.abs(M.summary.I + 14) <= .1 && M.summary.TP <= -1 + 1e-6, `I ${M.summary.I} · TP ${M.summary.TP} · gain ${M.summary.gainDb} dB`); }
}

// ---- 6. stereo scope geometry (METERS-SPEC §0.3 bug: side axis mirrored, abs() fold). Synthetic 48 kHz signals,
// 2 s, through clipData's 8 kHz scope stream and the scope maths the renderer uses (meterlib.polarSample/lissajous).
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const SYN = (() => { const sr = 48000, n = sr * 2, a = rng(11), b = rng(29), x = new Float32Array(n), y = new Float32Array(n); for (let i = 0; i < n; i++) { x[i] = 0.5 * a(); y[i] = 0.5 * b(); }
  const z = new Float32Array(n), neg = x.map((v) => -v);
  return { sr, sig: { mono: [x, x], hardL: [x, z], hardR: [z, x], anti: [x, neg], wide: [x, y] } }; })();
const synClip = {};
for (const [k, [Lc, Rc]] of Object.entries(SYN.sig)) synClip[k] = clipData({ L: Lc, R: Rc, sr: SYN.sr, inT: 0, bars: 1, beat: 0.5, target: 'off' });
const deg = (r) => r * 180 / Math.PI;
for (const [k, D] of Object.entries(synClip)) {
  const sc = D.scope, th = [], xs = [], ys = [], lj = [];
  for (let i = 800; i < sc.L.length - 800; i++) { const l = sc.L[i] * sc.scale, r = sc.R[i] * sc.scale, p = ML.polarSample(l, r, 40); if (!p) continue; th.push(deg(p[2])); xs.push(p[0]); ys.push(p[1]); lj.push(ML.lissajous(l, r, 1)); }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  const info = `θ mean ${mean(th).toFixed(1)}° sd ${sd(th).toFixed(1)}° · x̄ ${mean(xs).toFixed(3)} ȳ ${mean(ys).toFixed(3)} · n ${th.length}`;
  if (k === 'mono') ok('scope mono: vertical line (θ = 0°)', th.every((v) => Math.abs(v) < 1) && Math.abs(mean(xs)) < 0.01, info);
  if (k === 'hardL') ok('scope hard-L: one line leaning LEFT (θ = -45°, every x <= 0)', th.every((v) => Math.abs(v + 45) < 1) && xs.every((v) => v <= 0) && mean(xs) < -0.3 && lj.every(([X, Y]) => Math.abs(X + Y) < 1e-3 * Math.abs(Y) + 1e-4), info);
  if (k === 'hardR') ok('scope hard-R: one line leaning RIGHT (θ = +45°, every x >= 0)', th.every((v) => Math.abs(v - 45) < 1) && xs.every((v) => v >= 0) && mean(xs) > 0.3 && lj.every(([X, Y]) => Math.abs(X - Y) < 1e-3 * Math.abs(Y) + 1e-4), info);
  if (k === 'anti') ok('scope anti-phase: horizontal (|θ| = 90°, y = 0)', th.every((v) => Math.abs(Math.abs(v) - 90) < 1) && ys.every((v) => Math.abs(v) < 0.02), info);
  if (k === 'wide') { const left = xs.filter((v) => v < 0).length / xs.length;
    ok('scope wide noise: fills both sides symmetrically (θ sd > 30°, |θ̄| < 5°)', sd(th) > 30 && Math.abs(mean(th)) < 5 && left > 0.4 && left < 0.6, `${info} · left ${(left * 100).toFixed(0)} %`); }
  if (k === 'hardL') { let wrong = 0, tot = 0; for (let i = 0; i < D.gonioS.length; i++) { if (D.gonioM[i] > 2) { tot++; if (D.gonioS[i] > 0) wrong++; } } ok('gonio points hard-L: side <= 0 where mid > 0 (+S = right)', tot > 100 && wrong === 0, `${wrong}/${tot} on the wrong side`); }
}

// ---- 7. imager: spectral M/S per bin, width per frequency / per band, polar level sectors, M/S spectrogram panes
{ const fr = 30, mid = (D, n) => (a) => a.subarray(fr * n, fr * n + n), lvl = (v) => v / 2.55 - 100;
  const W = (D) => [...mid(D, D.ms.wBins)(D.ms.widthSpec)].slice(8, 60).map((v) => v / 255), BW = (D) => [...mid(D, 4)(D.ms.bandWidth)];
  const MSb = (D) => { const m = [...mid(D, 128)(D.ms.spectroM)].slice(40, 120).map(lvl), q = [...mid(D, 128)(D.ms.spectroS)].slice(40, 120).map(lvl); return [m.reduce((a, b) => a + b) / m.length, q.reduce((a, b) => a + b) / q.length]; };
  const pol = (D) => { const p = [...D.polar.subarray(fr * 90, fr * 90 + 90)]; const j = p.indexOf(Math.max(...p)); return [j, p]; };
  const m = synClip.mono, hl = synClip.hardL, hr = synClip.hardR, an = synClip.anti, wd = synClip.wide;
  ok('imager mono: S = 0 per bin (W = 0, band width 0 %, S pane at the floor)', W(m).every((v) => v === 0) && BW(m).every((v) => v === 0) && MSb(m)[1] <= -99, `W max ${Math.max(...W(m)).toFixed(2)} · bands ${BW(m).join('/')} · M ${MSb(m)[0].toFixed(1)} S ${MSb(m)[1].toFixed(1)} dB`);
  ok('imager hard-L: M = S per bin (W = 0.5, band width 100 %)', W(hl).every((v) => Math.abs(v - 0.5) < 0.01) && BW(hl).every((v) => Math.abs(v - 100) < 1) && Math.abs(MSb(hl)[0] - MSb(hl)[1]) < 0.5, `W ${Math.min(...W(hl)).toFixed(3)}..${Math.max(...W(hl)).toFixed(3)} · bands ${BW(hl).join('/')} · M ${MSb(hl)[0].toFixed(1)} S ${MSb(hl)[1].toFixed(1)}`);
  ok('imager hard-L vs mono: M and S each -6 dB', Math.abs(MSb(m)[0] - MSb(hl)[0] - 6.02) < 0.3, `mono M ${MSb(m)[0].toFixed(2)} · hard-L M ${MSb(hl)[0].toFixed(2)} S ${MSb(hl)[1].toFixed(2)} dB`);
  ok('imager anti-phase: M = 0 per bin (W = 1, M pane at the floor)', W(an).every((v) => v === 1) && MSb(an)[0] <= -99 && BW(an).every((v) => v >= 999), `W min ${Math.min(...W(an)).toFixed(2)} · M ${MSb(an)[0].toFixed(1)} S ${MSb(an)[1].toFixed(1)} dB`);
  const wW = W(wd), wMean = wW.reduce((a, b) => a + b) / wW.length;
  ok('imager wide (uncorrelated) noise: W ≈ 0.5, band width ≈ 100 %', Math.abs(wMean - 0.5) < 0.05 && BW(wd).every((v) => Math.abs(v - 100) < 15), `W mean ${wMean.toFixed(3)} · bands ${BW(wd).join('/')}`);
  const [jm] = pol(m), [jl] = pol(hl), [jr] = pol(hr), [, pa] = pol(an);
  ok('polar level: mono -> centre sector, hard-L -> -45°, hard-R -> +45°, anti -> the ±90° edges', jm === 45 && jl === 22 && jr === 67 && Math.max(pa[0], pa[89]) > -20 && pa.slice(5, 85).every((v) => v <= -150), `sectors ${jm} / ${jl} / ${jr} · anti edges ${pa[0].toFixed(1)} ${pa[89].toFixed(1)}`);
}
// the real beat (if present): the imager responds to its stereo content (S present, width between mono and anti-phase)
const BEAT = '/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav';
let realClip = null;
if (fs.existsSync(BEAT)) {
  const buf = readWav(BEAT), sr = buf.sampleRate, L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), inT = 32 * 4 * 0.46875 + 0.00025;
  realClip = clipData({ L: L0, R: R0, sr, inT, bars: 8, beat: 0.46875, target: -14 });
  const D = realClip, ms = D.ms, nf = D.frames; let wS = 0, wN = 0, sAct = 0; const bw = [0, 0, 0, 0];
  for (let f = 30; f < nf; f++) { for (let j = 0; j < ms.wBins; j++) { wS += ms.widthSpec[f * ms.wBins + j] / 255; wN++; } for (let b = 0; b < 4; b++) bw[b] += ms.bandWidth[f * 4 + b] / (nf - 30); for (let i = 0; i < 128; i++) if (ms.spectroS[f * 128 + i] > 100) sAct++; }
  const sideOK = sAct > 0.05 * (nf - 30) * 128, wMean = wS / wN;
  ok('real beat: imager shows real stereo (S pane active, 0.02 < W̄ < 0.5, low band narrowest)', sideOK && wMean > 0.02 && wMean < 0.5 && bw[0] < bw[2], `S active ${(100 * sAct / ((nf - 30) * 128)).toFixed(0)} % of cells · W̄ ${wMean.toFixed(3)} · band width ${bw.map((v) => v.toFixed(0) + '%').join(' / ')}`);
}

// ---- 8. EQ: RBJ magnitudes vs an independent scipy evaluation (≤ 0.1 dB), the match-EQ fit, the analyzer calibration
{ const SETS = [
    [{ type: 'LS', f: 80, g: 4.5, q: 0.71 }, { type: 'BELL', f: 176.1, g: 2.5, q: 1 }, { type: 'BELL', f: 2400, g: -3.2, q: 2.7 }, { type: 'HS', f: 9000, g: -2, q: 0.71 }],
    [{ type: 'HP', f: 30, g: 0, q: 0.541 }, { type: 'HP', f: 30, g: 0, q: 1.307 }, { type: 'LP', f: 18000, g: 0, q: 0.71 }, { type: 'BELL', f: 60, g: 6, q: 4 }, { type: 'BELL', f: 12000, g: -6, q: 0.5 }]];
  const freqs = Array.from({ length: 400 }, (_, i) => 20 * 1500 ** (i / 399));
  fs.writeFileSync(path.join(DIR, 'eq.json'), JSON.stringify({ sets: SETS, freqs, fss: [96000, 48000] }));
  const EQPY = String.raw`
import json, sys, numpy as np
from scipy.signal import freqz
d = json.load(open(sys.argv[1])); out = []
def coef(t, f0, G, Q, fs):
    A = 10 ** (G / 40); w0 = 2 * np.pi * min(f0, fs * 0.49) / fs; c = np.cos(w0); al = np.sin(w0) / (2 * Q); sA = 2 * np.sqrt(A) * al
    if t == 'LS': return [A*((A+1)-(A-1)*c+sA), 2*A*((A-1)-(A+1)*c), A*((A+1)-(A-1)*c-sA)], [(A+1)+(A-1)*c+sA, -2*((A-1)+(A+1)*c), (A+1)+(A-1)*c-sA]
    if t == 'HS': return [A*((A+1)+(A-1)*c+sA), -2*A*((A-1)+(A+1)*c), A*((A+1)+(A-1)*c-sA)], [(A+1)-(A-1)*c+sA, 2*((A-1)-(A+1)*c), (A+1)-(A-1)*c-sA]
    if t == 'HP': return [(1+c)/2, -(1+c), (1+c)/2], [1+al, -2*c, 1-al]
    if t == 'LP': return [(1-c)/2, 1-c, (1-c)/2], [1+al, -2*c, 1-al]
    return [1+al*A, -2*c, 1-al*A], [1+al/A, -2*c, 1-al/A]
for fs in d['fss']:
    for bands in d['sets']:
        tot = np.zeros(len(d['freqs']))
        for b in bands:
            bb, aa = coef(b['type'], b['f'], b['g'], b['q'], fs); _, H = freqz(bb, aa, worN=np.array(d['freqs']), fs=fs); tot += 20 * np.log10(np.abs(H))
        out.append(tot.tolist())
json.dump(out, open(sys.argv[2], 'w'))
`;
  fs.writeFileSync(path.join(DIR, 'eq.py'), EQPY); execFileSync('python3', ['-I', path.join(DIR, 'eq.py'), path.join(DIR, 'eq.json'), path.join(DIR, 'eq-ref.json')]);
  const REF = JSON.parse(fs.readFileSync(path.join(DIR, 'eq-ref.json'), 'utf8')); let worst = 0, idx = 0;
  for (const fsr of [96000, 48000]) for (const set of SETS) { const ref = REF[idx++]; freqs.forEach((fq, i) => { worst = Math.max(worst, Math.abs(ML.sumDb(set, fq, fsr) - ref[i])); }); }
  ok('EQ curve: RBJ magnitude per column vs scipy freqz ≤ 0.1 dB (2 band sets × 400 freqs × 2 fs)', worst <= 0.1, `worst ${worst.toExponential(2)} dB`);
  // match fit on an LTAS that already follows -4.5 dB/oct -> no bands; plus a +6 dB bump at 1 kHz -> one cut there
  const grid = ML.ltasGrid(96), ref45 = grid.map((fq) => -30 - 4.5 * Math.log2(fq / 1000)), bump = ref45.map((v, i) => v + 6 * Math.exp(-((Math.log2(grid[i] / 1000)) ** 2) / (2 * 0.3 ** 2)));
  const f0 = ML.fitMatch(grid, ref45), f1 = ML.fitMatch(grid, bump), b1 = f1[0] || {};
  ok('match EQ: a -4.5 dB/oct section needs no band; a +6 dB bump at 1 kHz gets a ≈ -3 dB bell there (50 %)', f0.length === 0 && f1.length >= 1 && b1.type === 'BELL' && Math.abs(Math.log2(b1.f / 1000)) < 0.2 && Math.abs(b1.g + 3) < 0.8,
    `flat → ${f0.length} bands · bump → ${f1.map((b) => `${b.type} ${b.f.toFixed(0)} Hz ${b.g} dB Q ${b.q}`).join(', ')}`);
  // analyzer calibration: a bin-centred sine (amplitude 0.5) on both channels reads -6.02 dB in its log bin
  const sr = 48000, n = sr * 2, fz = 171 * sr / 8192, sn = new Float32Array(n).map((_, i) => 0.5 * Math.sin(2 * Math.PI * fz * i / sr));
  const D = clipData({ L: sn, R: sn, sr, inT: 0, bars: 1, beat: 0.5, target: 'off' }), AB = D.ms.anBins, row = [...D.ms.anSpec.subarray(30 * AB, 31 * AB)].map((v) => -v / 2), pk = Math.max(...row), j = row.indexOf(pk), fj = 20 * 1500 ** ((j + 0.5) / AB);
  ok('EQ analyzer: 8192 Hann hop 1024, coherent scaling: bin-centred -6.02 dBFS sine reads -6 ±0.5 dB at its frequency', Math.abs(pk + 6.02) <= 0.5 && Math.abs(Math.log2(fj / fz)) < 0.02, `peak ${pk} dB at ${fj.toFixed(1)} Hz (sine ${fz.toFixed(1)} Hz)`);
  if (realClip) { const Dm = realClip, nT = Dm.ms.ltasN, lt = ML.ltasGrid(nT).map((_, i) => { let p = 0; for (let k = 0; k < Dm.bars; k++) p += 10 ** (Dm.ms.ltas[k * nT + i] / 10); return 10 * Math.log10(p / Dm.bars); });
    const fit = ML.fitMatch(ML.ltasGrid(nT), lt); ok('real beat: the match EQ fit gives 1-4 bands within ±6 dB from the measured LTAS', fit.length >= 1 && fit.length <= 4 && fit.every((b) => Math.abs(b.g) <= 6 && b.q >= 0.5 && b.q <= 4), fit.map((b) => `${b.type} ${b.f} Hz ${b.g} dB Q ${b.q}`).join(' · ')); }
}
fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(table.map(({ k, A, F, N }) => ({ k, app: { peak: A.peak, rms: A.rms, lufs: A.lufs, tp: A.tp, corr: A.corr, clip: A.clip, eq: A.eq }, ffmpeg: F, numpy: N })), null, 1));
const fails = results.filter(r => !r.pass).length;
console.log(`\n${results.length - fails}/${results.length} passed · signals + results in ${DIR}`);
process.exit(fails ? 1 : 0);
