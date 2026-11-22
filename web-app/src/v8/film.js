// THE LABORATORY v8 composition (ported from u2c-motion film/v8/film.js) driven by a cue sheet.
// The v6 lab-OS bench (live windows, specimen tags, handwritten notes, stamps) per LOOK (exe | lab | scope), a camera
// that holds the whole bench wide and pushes in to one window on the grid, the logo chain threading IN / running OUT,
// the elephant pendant swinging on its own chain, every window showing live data from the audio.
// createFilm({D, assets, aspect}).render(ctx, t, {ev, fps}) draws clip time t (seconds from bar 1). Everything that can
// change over the video is read through ev.value(path, beat, default): see v8/registry.js for the paths.
import { createCore, stageOf, STAGE_COLOR_KEYS } from './core.js';
import { createLab } from './lab.js';
import { createMeters } from './meters.js';
import { createBrand } from './brand.js';
import { LAYOUT, CONTENT, openBeat, WINDOW_IDS, HUD_BAND, HERO, SIDEBAR, TOPBAR } from './layout.js';
import { createPlayer, TAB_OF } from './player.js';   // v14 player look
import { DEFAULT_TAGS } from './tags.js';
import { mergeDeep, createEvaluator, emptySheet } from '../cues/schema.js';
import { buildRegistry, meterPath } from './registry.js';
import { INTRO_HIT, createIntro, coverScrim } from './intro.js';   // v11 intro

const METER_KIND = { scope: 'logo', session: 'waveform', spectro: 'spectrogram', loud: 'loudness' };

export function createFilm({ D, assets, aspect = '916' }) {
  const L = createCore(D), lab = createLab(L), M = createMeters(L), BR = createBrand(L, assets), INTRO = createIntro(L, assets && assets.intro);
  const { F, FPS, BEAT, BAR, T, U, steps, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hs, hash, kickEnv, labelAt, SANS, MONO, SERIF, HAND, DISPLAY, UI } = L;
  const port = aspect === '916', W = port ? 1080 : 1920, H = port ? 1920 : 1080, NB = D.bars;
  let PRE = 0, RWB0 = 0, RWB = 0, OUTD = false, c = null, ev = createEvaluator(emptySheet()), b = 0, IB = 0, LOOK = 'exe', S = stageOf('nigredo'), LY = {}, IDS = [], tagDoc = DEFAULT_TAGS;
  const V = (path, def) => ev.value(path, b, def);
  // ---------------------------------------------------------------- tag variables (every on-screen word is editable)
  const titleCase = D.title.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  const getTag = (path) => { const parts = path.split('.'); let v = tagDoc; for (const p of parts) v = v == null ? v : v[p];
    if (Array.isArray(v)) return v.map((x, i) => V(`tag.${path}.${i}`, x)); return v == null ? undefined : V('tag.' + path, v); };
  L.tagGet = getTag; const tag = L.tag; const PL = createPlayer(L, { tag, V });
  L.meter = (kind, key, def) => V(`meter.${kind}.${key}`, def);
  function setVars() {
    L.tagVars({ title: D.title, Title: titleCase, titleWord: D.title.split(' ')[0], bpm: String(Math.round(D.bpm)), bpm2: D.bpm.toFixed(2), key: D.key,
      keyShort: D.key.replace(' MIN', 'm').replace(' MAJ', ''), stage: S.name, stageN: String(S.n), look: LOOK.toUpperCase(), lufs: fmt(D.summary.I),
      srcLufs: fmt(D.srcLufs != null ? D.srcLufs : -10.7), lra: D.summary.LRA.toFixed(1), tp: fmt(D.summary.TP), bars: String(NB) });
    L.tagVars({ producer: tag('producer'), experiment: tag('experiment'), today: tag('date') }); L.tagVars({ date: tag('date') });
  }
  // v13 logo glow / cover pulse: ONE envelope from the analysed kicks: full strength on the kick's own frame (sharp attack, no ramp),
  // then a smooth exponential decay (cue logo.decay, default 0.17 s), never a hard off (the tail is carried to 1.6 s).
  const KICKS = L.kickHits.map(([tk, st]) => [Math.max(0.55, Math.min(1, st)), L.kickF(tk)]);   // on-grid kicks only (L.kickT timing), the same frame as kickEnv
  function glowAt(f, tau = V('logo.decay', 0.17)) {
    let m = 0; for (let i = KICKS.length - 1; i >= 0; i--) { const d = (f - KICKS[i][1]) / FPS; if (d < 0) continue; if (d > 1.6) break; m = Math.max(m, KICKS[i][0] * Math.exp(-d / tau)); } return m;
  }
  const WIN = (id) => tag('windows.' + (id === 'chains' ? 'logo' : id === 'session' ? 'wave' : id === 'stereo' ? 'gonio' : id)) || id;

  // ---------------------------------------------------------------- windows: rect, open steps, content
  const rectOf = (id) => { const r = LAYOUT[LOOK][aspect][id]; return [V(`win.${id}.x`, r[0]), V(`win.${id}.y`, r[1]), V(`win.${id}.w`, r[2]), V(`win.${id}.h`, r[3])]; };
  // v11 intro: with an intro of IB beats the lab builds after it (default open beats shift by IB; -2 = open at the cut)
  // v16.1 dashboard-load choreography (motion-design skill: lead with the hero, centre-out stagger, 50-100 ms steps, total < 500 ms): after the intro cut
  // the player panels open in rings by distance from the hero, one 32nd note (~59 ms at 128 BPM) apart, every start on the 32nd grid
  const ringOf = (id) => { const h = LAYOUT[LOOK][aspect].stage, r = LAYOUT[LOOK][aspect][id]; if (!h || !r) return 0; const d = Math.hypot(r[0] + r[2] / 2 - h[0] - h[2] / 2, r[1] + r[3] / 2 - h[1] - h[3] / 2); return Math.min(7, Math.round(d / (port ? 260 : 380))); };
  const winOpen = (id) => { if (IB && (id === 'now' || id === 'stage')) return 0;
    if (IB && LOOK === 'player' && openBeat(LOOK, aspect, id) < 0) return V(`win.${id}.open`, IB + ringOf(id) * 0.25);   // v13: the cover card is already there at the cut (the intro push ends on it), it does not build in
    const d = openBeat(LOOK, aspect, id); return V(`win.${id}.open`, IB ? (d < 0 ? IB : d + IB) : d); };
  function openStep(id, t) {
    const n0 = steps(t, winOpen(id), 6, LOOK === 'player' ? U.s16 : U.t32),   // v17.2 player: panels build over 6 sixteenths (smoother)
      k = ev.lastKey(`win.${id}.visible`, t / BEAT);
    if (!k) return V(`win.${id}.visible`, true) ? n0 : 0;
    const was = k.prev ? !!k.prev.v : true, on = !!k.key.v;
    if (on) return was ? n0 : Math.min(n0 || 6, steps(t, k.key.b, 6, U.t32));
    return was ? Math.max(0, 6 - steps(t, k.key.b, 6, U.t32)) : 0;
  }
  const contentOf = (id) => V(`win.${id}.content`, LOOK === 'player' && id === 'stage' ? 'hero' : CONTENT[id]);
  // ---------------------------------------------------------------- camera: wide, or a push / cut to one window
  function framing(id) {
    if (!id || id === 'wide' || !LY[id]) return { x: W / 2, y: H / 2, z: 1 };
    const [x, y, w, h] = LY[id], pad = 40, z = clamp(Math.min(W / (w + 2 * pad), H / (h + 2 * pad)), LOOK === 'player' ? 1 : 1.15, 2.2), mx = 30;
    if (LOOK === 'player') return { x: x + w / 2, y: y + h / 2, z };   // v22.1 (user: panels framed correctly): the whole panel fits (zoom >= 1) and sits centred; the ground extends past the desktop
    return { x: clamp(x + w / 2, W / (2 * z) - mx, W - W / (2 * z) + mx), y: clamp(y + h / 2, H / (2 * z) - mx, H - H / (2 * z) + mx), z };
  }
  // v17 closed-form spring punch (v17 prompt, build 2): the sum of one critically damped impulse response per kick, x(tau) = (tau / tp) e^(1 - tau / tp),
  // peak 1 at tau = tp (40 ms), settles with no overshoot; a pure function of time (L.kickHits = the on-grid kicks, at grid time, with strength)
  const KH = L.kickHits || [];
  function punchSpring(tt, tMin = -1e9) { const tp = 0.04; let s = 0, lo = 0, hi = KH.length; while (lo < hi) { const m = (lo + hi) >> 1; if (KH[m][0] <= tt) lo = m + 1; else hi = m; }
    for (let j = lo - 1; j >= 0; j--) { const tau = tt - KH[j][0]; if (tau > 0.6 || KH[j][0] < tMin) break; s += (tau / tp) * Math.exp(1 - tau / tp); } return Math.min(1.3, s); }
  function camera() {
    const s = ev.shot(b), A = framing(s.from), Bf = framing(s.to), u = s.u, zm = V('camera.zoom', 1);
    L.shotTo = s.to;   // meters can switch to their focus-shot version when the camera is on their window
    const cam = { x: lerp(A.x, Bf.x, u) + V('camera.x', 0), y: lerp(A.y, Bf.y, u) + V('camera.y', 0), z: lerp(A.z, Bf.z, u) * zm };
    // v13 (intro agent): the lab opens ON the cover (match cut from the intro push) and dollies out; L.openFx drives the streak copies + hides the HUD
    let op = IB ? INTRO.openCam(b, ev, IB, cam, { W, H, look: LOOK, aspect }) : null;
    // v17.1 loop: the beats before the rewind mirror the opening dolly (dolly IN onto the hero cover, same framing + streaks as the match cut)
    if (!op && RWB) { const open = ev.value('intro.open', 0, 2), b0 = RWB - open; if (open > 0 && b >= b0 && b < RWB) op = INTRO.openCam(IB + open * (1 - (b - b0) / open) - 1e-6, ev, IB, cam, { W, H, look: LOOK, aspect }); } L.openFx = op; if (op) return { x: op.x, y: op.y, z: op.z };
    if (b >= IB) { const p = V('fx.punch', LOOK === 'player' ? 0.014 : 0), calm = LOOK === 'player' ? T(IB + ev.value('intro.open', 0, 2) + 4) : 0; if (p > 0 && !(RWB && b >= RWB - ev.value('intro.open', 0, 2) - 6)) cam.z *= 1 + p * punchSpring(T(b), calm); }   // v17: closed-form spring per kick; v21: still for one bar after the arrival and through the outro
    return cam;
  }
  // ---------------------------------------------------------------- attention: the window this beat is about
  const kickAt = new Set(D.onsets.kick.map((o) => Math.round(o[2] / BEAT * 4))), snrAt = new Set(D.onsets.snare.map((o) => Math.round(o[2] / BEAT * 4)));
  function attention(t) {
    const has = (id) => LY[id] && openStep(id, t) >= 6, fe = V('focus.featured', 'auto');
    if (fe === 'none') return null; if (fe !== 'auto') return has(fe) ? fe : null;
    const bb = Math.floor(t / BEAT), q = bb * 4;
    let id = snrAt.has(q) ? 'spectrum' : kickAt.has(q) ? 'loud' : null;
    if (bb % 4 === 0) id = has('chains') ? 'chains' : 'session';
    if (bb % 8 === 6) id = has('elephant') ? 'elephant' : 'stereo';
    if (!id || !has(id)) { const be = F.bands[fidx(bb * BEAT)], i = be.indexOf(Math.max(...be)); id = ['stereo', 'spectrum', 'spectrum', 'spectrum', 'spectro', 'spectro'][i]; }
    if (!has(id)) id = has('session') ? 'session' : 'chains';
    return id;
  }
  // v11: the handwritten notes, stamps, specimen tags and terminal chatter are gone (they said nothing). Only real
  // readouts (Hz, dB, LUFS, BPM, key, bar.beat) and the title / credit stay on screen.

  // ---------------------------------------------------------------- v11 window chrome: liquid glass (returns the content rect)
  // Opening steps (n = 1..6 on 32nds): 1 = the top hairline, 2 = the whole hairline outline, 3+ = the glass; content
  // grows over steps 4..6. No title bar, no window buttons: one hairline label in the UI voice, top left. The logo and
  // the pendant windows carry no label (the art is the label). The exe and lab looks share the glass; lab keeps faint
  // graph paper inside, scope adds a recessed CRT screen. API for content code: V11-SHELL-API.md.
  const NO_LABEL = new Set(['logo', 'pendant', 'cover', 'hero', 'now']);
  const PAD = 20, LABEL_H = port ? 46 : 40;
  /** Content rect of window id for its rect r (also used by the camera framing and the API). */
  function contentRect(id, r) {
    const [x, y, w, h] = r, kind = contentOf(id), top = NO_LABEL.has(kind) ? PAD : LABEL_H;
    if (LOOK === 'scope') { const sr = screenRect(id, r); return [sr[0] + 10, sr[1] + 10, sr[2] - 20, sr[3] - 20]; }
    return [x + PAD, y + top, w - 2 * PAD, h - top - PAD];
  }
  const screenRect = (id, r) => { const [x, y, w, h] = r, top = NO_LABEL.has(contentOf(id)) ? 16 : LABEL_H - 4; return [x + 16, y + top, w - 32, h - top - 16]; };
  // v15.2 macOS window chrome: three traffic lights top-left (close x / minimise - / zoom +), real colours (chrome.lightsColor) pre-inverted when the
  // frame will be inverted (white stage XOR fx.invert) so they always read red / yellow / green
  const invHex = (h) => '#' + (0xffffff ^ parseInt(h.slice(1), 16)).toString(16).padStart(6, '0');
  // v18 MIDI map (reverse-engineered from the user's reference): the beat's melodic peaks (spectrogram bins ~1 semitone each, 110 Hz-1.8 kHz,
  // top 5 local maxima per frame above the frame median) as notes. Past = halftone dot trails (dot size = level) moving into a fixed playhead;
  // the sounding note = a solid ink bar with a soft halo; note onsets get a thin crosshair circle; a dotted guide one beat back; on the right,
  // three boxed mini-rolls show the NEXT bar of the 3 strongest voices (step lines + a cursor line). Pure function of time (peaks precomputed).
  // v19 hero ride: the logo rises / falls with the melody (strongest MIDI-map note, row position averaged over 0.3 s), +-7 % of the cell
  let RIDE = null;
  function rideY(t) { const P = rollPeaks(); if (!RIDE) { RIDE = new Float32Array(P.NFr); let last = 0.5; for (let f = 0; f < P.NFr; f++) { const bi = P.bin[f * P.K]; if (bi >= 0) last = (bi - P.lo) / (P.hi - P.lo); RIDE[f] = last; } }
    const f0 = Math.min(P.NFr - 1, fidx(t)), n = Math.round(0.3 * FPS); let s2 = 0, cnt = 0; for (let f = Math.max(0, f0 - n); f <= f0; f++) { s2 += RIDE[f]; cnt++; } return (0.5 - s2 / cnt) * 0.14 * V('hero.rideAmt', 1); }
  let PK = null;
  function rollPeaks() { if (PK) return PK; const NB2 = D.spectroBins || 128, SP = D.spectro, NFr = Math.floor(SP.length / NB2), lo = 31, hi = 84, K = 5;
    const bin = new Int16Array(NFr * K).fill(-1), lv = new Float32Array(NFr * K);
    for (let f = 0; f < NFr; f++) { const o = f * NB2, row = []; for (let i = lo; i <= hi; i++) row.push(SP[o + i]); const med = row.slice().sort((a2, b2) => a2 - b2)[row.length >> 1], cand = [];
      for (let i = lo + 1; i < hi; i++) { const v = SP[o + i]; if (v > SP[o + i - 1] && v >= SP[o + i + 1] && v > med + 22 && v > 78) cand.push([v, i]); }
      cand.sort((a2, b2) => b2[0] - a2[0]); for (let j = 0; j < Math.min(K, cand.length); j++) { bin[f * K + j] = cand[j][1]; lv[f * K + j] = Math.min(1, (cand[j][0] - med) / 70); } }
    // v19.3: notes must persist (a peak within +-1 bin in the previous AND next frame), so drum transients and noise drop out
    const has = (f, bi) => { if (f < 0 || f >= NFr) return false; for (let j = 0; j < K; j++) { const q = bin[f * K + j]; if (q >= 0 && Math.abs(q - bi) <= 1) return true; } return false; };
    const keep = new Int16Array(bin.length).fill(-1); for (let f = 0; f < NFr; f++) for (let j = 0; j < K; j++) { const bi = bin[f * K + j]; if (bi >= 0 && has(f - 1, bi) && has(f + 1, bi) && (has(f - 2, bi) || has(f + 2, bi))) keep[f * K + j] = bi; }
    return (PK = { bin: keep, lv, K, lo, hi, NFr }); }
  function pianoRoll(x, y, w, h, t, Sx) {
    const P = rollPeaks(), fry = V('hero.fry', Sx.grey ? 'negative' : Sx.name === 'RUBEDO' ? 'thermal' : 'stage'), ink = V('roll.color', fry === 'negative' ? '#0b0b0b' : Sx.grey ? Sx.ink : Sx.hot), f0 = Math.min(P.NFr - 1, fidx(t));
    const span = V('roll.span', 4) * BEAT, px = x + w * V('roll.playhead', 0.56), pxPerS = (px - x) / span, row = (i) => y + h * 0.1 + h * 0.8 * (1 - (i - P.lo) / (P.hi - P.lo)), FPSr = FPS;
    c.save(); c.strokeStyle = rgba(ink, 0.55); c.lineWidth = 1; c.beginPath(); c.moveTo(px + 0.5, y); c.lineTo(px + 0.5, y + h); c.stroke();
    c.setLineDash([2, 4]); c.strokeStyle = rgba(ink, 0.35); c.beginPath(); c.moveTo(px - BEAT * pxPerS + 0.5, y); c.lineTo(px - BEAT * pxPerS + 0.5, y + h); c.stroke(); c.setLineDash([]);
    for (let k2 = 1; k2 < 6; k2++) { const yy = y + h * k2 / 6; c.fillStyle = rgba(ink, 0.45); c.fillRect(px + 2, yy, 8, 1); }
    // trails: one column of dots per frame; 3 rows of halftone when loud
    const nBack = Math.min(f0, Math.round(span * FPSr));
    for (let d = nBack; d >= 1; d--) { const f = f0 - d, xx = px - d / FPSr * pxPerS;
      for (let j = 0; j < P.K; j++) { const bi = P.bin[f * P.K + j]; if (bi < 0) continue; const lvv = P.lv[f * P.K + j], yy = row(bi), r = 0.6 + 3.2 * lvv;
        c.fillStyle = rgba(ink, 0.35 + 0.6 * lvv); c.beginPath(); c.arc(xx, yy, r, 0, 6.2832); c.fill();
        if (lvv > 0.45) { c.beginPath(); c.arc(xx, yy - r * 2.1, r * 0.6, 0, 6.2832); c.arc(xx, yy + r * 2.1, r * 0.6, 0, 6.2832); c.fill(); }
        const pb = f > 0 ? P.bin.subarray((f - 1) * P.K, f * P.K) : []; let isOn = true; for (const q of pb) if (q >= 0 && Math.abs(q - bi) <= 1) isOn = false;
        if (isOn && lvv > 0.35 && d < nBack - 2) { c.strokeStyle = rgba(ink, 0.5); c.lineWidth = 1; c.beginPath(); c.arc(xx, yy, 10 + 8 * lvv, 0, 6.2832); c.stroke(); c.beginPath(); c.moveTo(xx, yy - 26); c.lineTo(xx, yy + 26); c.stroke(); } } }
    // the sounding notes: solid bars into the playhead + soft ink halo
    for (let j = 0; j < P.K; j++) { const bi = P.bin[f0 * P.K + j]; if (bi < 0) continue; const lvv = P.lv[f0 * P.K + j], yy = row(bi), bl = 18 + 46 * lvv, th = 2 + 7 * lvv;
      const g = c.createRadialGradient(px, yy, 0, px, yy, 22 + 40 * lvv); g.addColorStop(0, rgba(ink, 0.35 * lvv)); g.addColorStop(1, rgba(ink, 0)); c.fillStyle = g; c.fillRect(px - 70, yy - 70, 140, 140);
      c.fillStyle = rgba(ink, 0.95); c.fillRect(px - bl, yy - th / 2, bl, th); }
    // v21 hero bands (user: "a block waveform like in Edison"): the right column = three complete block waveforms of the CURRENT BAR, one lane per band
    // (LOW = kick + sub 20-150 Hz, MID 150 Hz-2 kHz, HIGH 2-20 kHz) from the real 1 ms band envelope (D.be), mirrored blocks, one per 1/32 note;
    // played blocks solid, the rest of the bar dim, a playhead, the LOW lane lights on each kick. hero.bands = false brings back the mini-rolls.
    if (V('hero.bands', true) && D.be) { bandLanes(x + w * 0.72, y + 14, w * 0.26, (h - 28 - 12) / 3, t, ink); }
    else if (V('roll.mini', true)) { const mx = x + w * 0.79, mw = w * 0.18, mh = (h - 40) / 3 - 8, nF = Math.round(BAR * FPSr);
      for (let m = 0; m < 3; m++) { const my = y + 20 + m * (mh + 8); c.strokeStyle = rgba(ink, 0.35); c.lineWidth = 1; c.strokeRect(Math.round(mx) + 0.5, Math.round(my) + 0.5, Math.round(mw), Math.round(mh));
        c.fillStyle = rgba(ink, 0.5); for (const [cx2, cy2] of [[mx - 6, my - 6], [mx + mw + 6, my - 6]]) { c.fillRect(cx2 - 3, cy2, 7, 1); c.fillRect(cx2, cy2 - 3, 1, 7); }
        c.strokeStyle = rgba(ink, 0.8); c.lineWidth = 1.4; c.beginPath(); let started = false;
        for (let d = 0; d < nF; d += 2) { const f = Math.min(P.NFr - 1, f0 + d), bi = P.bin[f * P.K + m]; const xx = mx + 4 + (mw - 8) * d / nF;
          if (bi < 0) { started = false; continue; } const yy = my + 4 + (mh - 8) * (1 - (bi - P.lo) / (P.hi - P.lo)); if (!started) { c.moveTo(xx, yy); started = true; } else c.lineTo(xx, yy); }
        c.stroke(); c.strokeStyle = rgba(ink, 0.45); c.beginPath(); c.moveTo(mx + mw * 0.5, my + 4); c.lineTo(mx + mw * 0.5, my + mh - 4); c.stroke(); } }
    c.restore();
  }
  // v16 detection boxes (Y2K lab-scan): label tab (dark on scan green) + double frame + corner brackets + crosshair; re-acquire (hard step) each downbeat, flash on kicks
  const BG3 = [[0, 1], [2, 3], [4, 5]], BNAME = ['LOW', 'MID', 'HIGH'];
  function bandLevel(ta, tb, gi) { const BE = D.be; if (!BE) return 0; const [a2, b2] = BG3[gi]; let mx = 0;
    for (let m = Math.max(0, Math.floor(ta * 1000)); m <= Math.min(BE.n - 1, Math.ceil(tb * 1000)); m++) { let e = 0; for (let j = a2; j <= b2; j++) e += Math.pow(10, (BE.q[m * BE.nb + j] / 2 - 120) / 10); if (e > mx) mx = e; } return Math.sqrt(mx); }
  function bandRef(gi) { const BE = D.be; if (!BE._ref) BE._ref = []; if (BE._ref[gi] == null) { const v = []; const [a2, b2] = BG3[gi]; for (let m = 0; m < BE.n; m += 11) { let e = 0; for (let j = a2; j <= b2; j++) e += Math.pow(10, (BE.q[m * BE.nb + j] / 2 - 120) / 10); v.push(e); } v.sort((p1, p2) => p1 - p2); BE._ref[gi] = Math.sqrt(v[Math.floor(v.length * 0.995)] || 1e-9); } return BE._ref[gi]; }
  function bandLanes(mx, y0, mw, mh, t, ink) {
    // Edison-style (user: "complete waveforms, less sparse, no labels"): per lane a dense mirrored FILLED waveform of the current bar, one column per pixel
    // (max of the band's 1 ms envelope over that column), the played part bright, the rest dim, a hairline centre, a playhead; LOW lights on each kick
    const tt = Math.max(0, t), bar0 = Math.floor(tt / BAR + 1e-9) * BAR, u = (tt - bar0) / BAR, I = glowAt(fidx(tt)), cols = Math.max(24, Math.round(mw - 8));
    for (let m = 0; m < 3; m++) { const my = y0 + m * (mh + 6), cy = my + mh / 2, hh = mh / 2 - 3, ref = bandRef(m), A = new Float32Array(cols);
      for (let i = 0; i < cols; i++) { const ta = bar0 + i * BAR / cols; A[i] = Math.pow(clamp(bandLevel(ta, ta + BAR / cols, m) / ref * (m === 2 ? 1.25 : 1)), 0.8); }
      c.fillStyle = rgba(ink, 0.1); c.fillRect(Math.round(mx), Math.round(my), Math.round(mw), Math.round(mh));
      const X = (i) => mx + 4 + (mw - 8) * i / (cols - 1), split = Math.round(u * (cols - 1));
      for (const played of [true, false]) { const i0 = played ? 0 : split, i1 = played ? split : cols - 1; if (i1 <= i0) continue;
        c.beginPath(); c.moveTo(X(i0), cy - A[i0] * hh); for (let i = i0 + 1; i <= i1; i++) c.lineTo(X(i), cy - Math.max(0.6, A[i] * hh)); for (let i = i1; i >= i0; i--) c.lineTo(X(i), cy + Math.max(0.6, A[i] * hh)); c.closePath();
        c.fillStyle = rgba(ink, played ? (m === 0 ? 0.78 + 0.22 * I : 0.88) : 0.3); c.fill(); }
      c.fillStyle = rgba(ink, 0.25); c.fillRect(Math.round(mx + 2), Math.round(cy), Math.round(mw - 4), 1);
      const px = Math.round(X(split)) + 0.5; c.strokeStyle = rgba(ink, 0.95); c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, my + 2); c.lineTo(px, my + mh - 2); c.stroke(); }
  }

  const DET = [[0.035, 0.12, 0.2, 0.52], [0.765, 0.08, 0.2, 0.44], [0.69, 0.6, 0.27, 0.32], [0.06, 0.7, 0.24, 0.24]];
  function detect(x, y, w, h, t, Sx) {
    const G = V('scan.color', Sx.grey ? '#0a0a0a' : Sx.hot), TXT = V('scan.text', Sx.grey ? '#f2f2f2' : '#0a0a0a'), labs = tag('player.detect') || [], bar = 0, I = 0, fz = port ? 17 : 15, th = fz + 8;   // v16.1: stage colours, static (no flash, no re-acquire)
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    DET.forEach(([fx, fy, fw, fh], i) => { if (!labs[i]) return; if (fx > 0.6 && V('hero.bands', true) && D.be && LOOK === 'player') return;   // v21: the right column belongs to the band lanes
      const jx = 0, jy = 0, bx = Math.round(x + fx * w + jx) + 0.5, by = Math.round(y + fy * h + jy + th) + 0.5, bw = Math.round(fw * w), bh = Math.round(fh * h - th);
      c.strokeStyle = rgba(G, 0.9); c.lineWidth = 1.2 + 1.2 * I; c.strokeRect(bx, by, bw, bh); c.lineWidth = 1; c.strokeStyle = rgba(G, 0.45); c.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);
      const k = Math.min(14, bw * 0.18); c.strokeStyle = G; c.lineWidth = 2; c.beginPath();
      for (const [cx2, cy2, sx, sy] of [[bx + 6, by + 6, 1, 1], [bx + bw - 6, by + 6, -1, 1], [bx + 6, by + bh - 6, 1, -1], [bx + bw - 6, by + bh - 6, -1, -1]]) { c.moveTo(cx2, cy2 + sy * k); c.lineTo(cx2, cy2); c.lineTo(cx2 + sx * k, cy2); } c.stroke();
      const mx = bx + bw / 2, my = by + bh / 2; c.lineWidth = 1; c.strokeStyle = rgba(G, 0.7); c.beginPath(); c.moveTo(mx - 6, my); c.lineTo(mx + 6, my); c.moveTo(mx, my - 6); c.lineTo(mx, my + 6); c.stroke();
      const lab = String(labs[i]).toUpperCase(), conf = `${78 + Math.floor(hs(bar * 31 + i) * 21)}%`; c.font = `600 ${fz}px ${UI}`; const tw2 = Math.min(bw + 60, c.measureText(lab).width * 1.12 + lab.length * 1.5 + 20);
      c.fillStyle = rgba(G, 0.92 + 0.08 * I); c.fillRect(bx - 0.5, by - th, tw2, th); text(c, lab, bx + 7, by - th / 2, { size: fz, fam: UI, w: 600, col: TXT, maxW: tw2 - 10 });
      if (V('scan.conf', false)) text(c, conf, bx + bw, by - th / 2, { size: fz - 2, w: 700, col: rgba(G, 0.95), align: 'right' });
      if (I > 0.05) { c.fillStyle = rgba(G, 0.08 * I); c.fillRect(bx, by, bw, bh); } });
    c.restore();
  }
  function lights(x, y, Sx, active) {
    // v16: stage colours (Nigredo = black buttons with an ink hairline; colour stages = hot / sig2 / sig1); the white stage / negative invert them naturally
    const col = V('chrome.lightsColor', true), r = port ? 8 : 7, gp = port ? 24 : 21, neg = false, P3 = Sx.grey ? ['#0a0a0a', '#0a0a0a', '#0a0a0a'] : [Sx.hot, Sx.sig2, Sx.sig1];
    P3.forEach((h, i) => { const cx = x + i * gp, cc = col ? h : rgba(Sx.ink, 0.35);
      c.beginPath(); c.arc(cx, y, r, 0, 2 * Math.PI); c.fillStyle = cc; c.globalAlpha = active || !col ? 1 : 0.85; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = Sx.grey ? rgba(Sx.ink, 0.55) : 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8; c.stroke();
      if (V('chrome.glyphs', true)) { const gcol = Sx.grey ? rgba(Sx.ink, 0.75) : 'rgba(0,0,0,0.55)', d = r * 0.45; c.strokeStyle = gcol; c.lineWidth = 1.3; c.beginPath();
        if (i === 0) { c.moveTo(cx - d, y - d); c.lineTo(cx + d, y + d); c.moveTo(cx + d, y - d); c.lineTo(cx - d, y + d); } else { c.moveTo(cx - d * 1.2, y); c.lineTo(cx + d * 1.2, y); if (i === 2) { c.moveTo(cx, y - d * 1.2); c.lineTo(cx, y + d * 1.2); } }
        c.stroke(); } });
    return 3 * gp + 4;
  }
  function label(id, x, y, w, Sx, active) {
    if (V('chrome.lights', LOOK === 'player') && contentOf(id) !== 'now') { const lw = lights(x + PAD + 8, y + (port ? 26 : 24), Sx, active); if (NO_LABEL.has(contentOf(id))) return; x += lw; }
    if (NO_LABEL.has(contentOf(id))) return;
    if (LOOK === 'player') { PL.icon(c, contentOf(id) === 'inserts' ? 'bars' : contentOf(id) === 'meta' ? 'meta' : 'bars', x + PAD + 10, y + (port ? 26 : 24), 22, rgba(Sx.ink, active ? 0.95 : 0.7), true); x += 30; }
    text(c, String(WIN(id)).toUpperCase(), x + PAD + 2, y + (port ? 26 : 24), { size: 18, fam: UI, w: 500, ls: 2.4, col: rgba(Sx.ink, active ? 0.95 : 0.52), maxW: w - 2 * PAD });
  }
  function chrome(id, r, n, t, Sx, active) {
    const [x, y, w, h] = r, rad = V('glass.radius', 22), lit = rgba(Sx.ink, 0.55);
    if (n < 3) {   // hairline build: top edge, then the full outline
      c.strokeStyle = lit; c.lineWidth = 1.2;
      if (n === 1) { c.beginPath(); c.moveTo(x + rad, y); c.lineTo(x + w - rad, y); c.stroke(); } else c.stroke(L.rr(x, y, w, h, rad));
      c.lineWidth = 1; return null;
    }
    // v12 depth (exe): the meter windows sit behind the hero: darker, calmer glass (lower edge light, softer shadow)
    const back = LOOK === 'exe' || LOOK === 'player' ? V('glass.back', 1) : 0;
    L.glass(c, x, y, w, h, Sx, { r: rad, tint: V('glass.tint', LOOK === 'scope' ? 0.5 : 0.36) + 0.2 * back, active: active && V('bracket.on', LOOK !== 'player'), edge: 1 - 0.4 * back, shadow: 1 - 0.25 * back });
    // v14 player: double bezel, the glass is the tray and an inner core sits 6 px in (concentric radius, top-lit hairline) = machined hardware
    if (LOOK === 'player' && V('glass.bezel', 1) > 0) { const bz = V('glass.bezel', 1), q = 6; c.save(); c.lineWidth = 1;
      c.strokeStyle = rgba(S.ink, 0.07 * bz); c.stroke(L.rr(x + q + 0.5, y + q + 0.5, w - 2 * q - 1, h - 2 * q - 1, Math.max(4, rad - q)));
      const g = c.createLinearGradient(0, y + q, 0, y + q + 40); g.addColorStop(0, rgba(S.ink, 0.10 * bz)); g.addColorStop(1, rgba(S.ink, 0));
      c.strokeStyle = g; c.beginPath(); c.moveTo(x + q + rad, y + q + 1.5); c.lineTo(x + w - q - rad, y + q + 1.5); c.stroke(); c.restore(); }
    if (LOOK === 'lab') { c.save(); c.clip(L.rr(x, y, w, h, rad)); lab.graphPaper(c, x, y, w, h, Sx, 10, 50, 0.45); c.restore(); }
    if (LOOK === 'scope') { const sr = screenRect(id, r); c.fillStyle = rgba(Sx.bg, 0.62); c.fill(L.rr(sr[0], sr[1], sr[2], sr[3], 12)); c.strokeStyle = rgba(Sx.ink, 0.12); c.stroke(L.rr(sr[0] + 0.5, sr[1] + 0.5, sr[2] - 1, sr[3] - 1, 12)); }
    if (n >= 5 || LOOK !== 'player') label(id, x, y, w, Sx, active);   // v17 (tip C): the label + buttons wait until the glass is mostly open
    return contentRect(id, r);
  }

  // ---------------------------------------------------------------- window contents
  function chainsBody(cr, t, k, Sx) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 4, y - 4, w + 8, (h + 8) * k); c.clip();
    const C = Math.max(4, Math.round(V('logo.cycle', 2) * 4)), hero = ev.clipsAt('logo.hero', b).some((q) => q.v !== false);
    if (LOOK === 'scope') {   // CRT: graticule 10 x 8 div, the two live traces run behind the logo, triggered on the 16th
      c.strokeStyle = rgba(Sx.ink, 0.1); for (let i = 0; i <= 10; i++) { const X = Math.round(x + w * i / 10) + 0.5; c.beginPath(); c.moveTo(X, y); c.lineTo(X, y + h - 40); c.stroke(); }
      for (let j = 0; j <= 8; j++) { const Y = Math.round(y + (h - 40) * j / 8) + 0.5; c.beginPath(); c.moveTo(x, Y); c.lineTo(x + w, Y); c.stroke(); }
      M.trace(c, Sx, [x, y, w, h - 40], t, { span: BEAT * V(meterPath('logo', 'span'), 0.25), amp: V(meterPath('logo', 'amp'), 0.2), lanes: [[0, 0.3, Sx.sig1], [1, 0.72, Sx.sig2]] });
    }
    const s = BR.logo(c, Sx, [x, y, w, h - (LOOK === 'scope' ? 40 : 34)], t, { cycle: C, mode: V('logo.mode', 'cycle'), hero, scale: V('logo.scale', 1),
      glow: V('logo.glow', 1), kickI: glowAt(fidx(t)), pulse: glowAt(fidx(t)), bloom: V('logo.bloom', 1) * dropBloom(t), runner: V('logo.runner', true) });
    if (LOOK === 'scope') text(c, `${(BEAT * 1000 * V(meterPath('logo', 'span'), 0.25) / 10).toFixed(1)} ms/div`, x + w, y + h - 14, { size: 18, col: rgba(Sx.ink, 0.5), align: 'right', maxW: w * 0.4 });   // real timebase only (v11)
    c.restore();
  }
  // pendant geometry inside a content rect: the hand (top of the chain) and the chain length (v9 chain wave)
  function pendantGeom(cr) {
    const [x, y, w, h] = cr, avail = h - 80, len = avail * clamp(V('pendant.chain', 0.3), 0, 0.6), size = Math.min(w * 0.8, (avail - len) / 0.95) * V('pendant.size', 1);
    return { size, len, ax: x + w / 2 + size * (346 / 700 - 0.5) + V('pendant.x', 0), ay: y + 22 + V('pendant.y', 0) };
  }
  // drop bloom: inside a drop 0.35, plus an envelope from each drop phrase's downbeat that decays over 2 beats
  function dropBloom(t) {
    const bar = Math.floor(t / BAR); if (labelAt(bar) !== 'drop') return 0;
    const sb = D.song.startBar + bar; let p0 = sb; for (const q of D.song.phrases) if (q.bar <= sb) p0 = q.bar;
    return 0.35 + 0.65 * Math.exp(-Math.max(0, t - (p0 - D.song.startBar) * BAR) / (2 * BEAT));
  }
  function elephantBody(cr, t, k, Sx) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 14, y - 14, w + 28, (h + 28) * k); c.clip();
    const { size, len, ax, ay } = pendantGeom(cr), g = BR.drawChainFx(c, Sx, ax, ay, len, t);
    const sw = BR.elephant(c, Sx, g.end[0], g.end[1], size, t, g.ang[g.ang.length - 1]);
    if (LOOK === 'scope') { c.fillStyle = rgba(Sx.ink, 0.8); c.fillRect(ax - 22, ay - 20, 44, 10); c.fillRect(ax - 3, ay - 12, 6, 12); }
    c.restore();
  }

  // ---------------------------------------------------------------- v12 hero (exe): logo + pendant as ONE object, front layer
  // The pendant's chain hangs from the bottom of the U (LOGO_AT, logo px), so the chain sim's anchor follows the logo (its
  // kick punch and the hero.* offsets); the beat pushes still start at that hand. The hero is drawn after every window into its
  // own layer (same pixels + camera transform as the frame) and composited over them with a soft two-part shadow.
  const HERO_HIDE = new Set(['loud', 'stereo']);   // a push to the levels / imager is a clear view of that window (hard cut, no fade)
  // v13: the hero is the U2C logo alone, centred on its bounding box in the stage card (cx, cy = the card's centre).
  function heroGeom(t) {
    const H0 = HERO[aspect], k = V('hero.scale', 1), st = LY.stage || LAYOUT.exe[aspect].stage, bb = BR.logoBBox(), w = H0.logoW * V('logo.scale', 1) * k;
    return { cx: st[0] + st[2] / 2 + V('hero.x', 0), cy: st[1] + st[3] / 2 + V('hero.y', 0), w, s: w / bb.w, bb };
  }
  // v12: the hero logo dwells fully threaded between an IN and an OUT (logo.hold bars, default 10 -> a 48-beat period, ~80 % complete);
  // the break sits around beat 28-36, clear of the usual stills at 10 s and 18 s
  const HOLD = (C) => ((LOOK === 'exe' || LOOK === 'player') && V('hero.on', true) ? Math.round(V('logo.hold', LOOK === 'player' ? 0 : 10) * 4) : 0), HOLD_OFF = 16;
  function heroArt(cx, t) {   // draws into ctx cx (world transform already set)
    const g = heroGeom(t), hero = ev.clipsAt('logo.hero', b).some((q) => q.v !== false), C = Math.max(4, Math.round(V('logo.cycle', 2) * 4)), I = glowAt(fidx(t));
    BR.logo(cx, S, [0, 0, 0, 0], t, { at: { cx: g.cx, cy: g.cy, w: g.w }, cycle: C, dwell: HOLD(C), off: HOLD_OFF, mode: V('logo.mode', 'cycle'), hero,
      glow: V('logo.glow', 1), kickI: I, pulse: I, bloom: V('logo.bloom', 1) * dropBloom(t), runner: V('logo.runner', true) });
  }
  let HL = null;
  const mkCanvas = (w, h) => { const q = document.createElement('canvas'); q.width = Math.max(1, Math.ceil(w)); q.height = Math.max(1, Math.ceil(h)); return q; };
  function hero(t, cam, scale, sh) {
    if (LOOK !== 'exe' || !V('hero.on', true) || (sh && (sh.from !== 'wide' || sh.to !== 'wide') && (HERO_HIDE.has(sh.from) || HERO_HIDE.has(sh.to)))) return;
    const main = c, cv = main.canvas, z = cam.z;
    if (!HL || HL.a.width !== cv.width || HL.a.height !== cv.height) HL = { a: mkCanvas(cv.width, cv.height), s: mkCanvas(cv.width / 4, cv.height / 4) };
    const hx = HL.a.getContext('2d'); hx.setTransform(1, 0, 0, 1, 0, 0); hx.globalAlpha = 1; hx.globalCompositeOperation = 'source-over'; hx.clearRect(0, 0, cv.width, cv.height);
    hx.setTransform(scale * z, 0, 0, scale * z, scale * (W / 2 - cam.x * z), scale * (H / 2 - cam.y * z)); hx.imageSmoothingEnabled = true;
    c = hx; try { heroArt(hx, t); } finally { c = main; }
    // shadow: the layer's silhouette, 1/4 resolution, blurred, dropped below the object (wide soft + tight contact)
    const sx = HL.s.getContext('2d'), px = scale * z, light = L.isLight(S);
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, HL.s.width, HL.s.height); sx.drawImage(HL.a, 0, 0, HL.s.width, HL.s.height);
    sx.globalCompositeOperation = 'source-in'; sx.fillStyle = light ? rgba(S.ink, 1) : '#000'; sx.fillRect(0, 0, HL.s.width, HL.s.height); sx.globalCompositeOperation = 'source-over';
    // soft dark vignette under the hero (reads in front): a radial pool behind the logo + pendant, in the same world transform
    { const g = heroGeom(t), cyv = g.cy, rx = g.w * 0.62, ry = rx * 0.8;
      main.save(); main.setTransform(scale * z, 0, 0, scale * z, scale * (W / 2 - cam.x * z), scale * (H / 2 - cam.y * z)); main.translate(g.cx, cyv); main.scale(1, ry / rx);
      const rg = main.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx), va = V('hero.vignette', 0.7) * (light ? 0.35 : 1), vc = light ? '40,40,40' : '0,0,0';
      rg.addColorStop(0, `rgba(${vc},${va})`); rg.addColorStop(0.55, `rgba(${vc},${va * 0.55})`); rg.addColorStop(1, `rgba(${vc},0)`);
      main.fillStyle = rg; main.fillRect(-rx, -rx, 2 * rx, 2 * rx); main.restore(); }
    main.save(); main.setTransform(1, 0, 0, 1, 0, 0); main.imageSmoothingEnabled = true; main.imageSmoothingQuality = 'high';
    for (const [dx, dy, bl, a] of [[10, 34, 16, 0.5], [4, 12, 5, 0.34]]) { main.filter = `blur(${bl * px}px)`; main.globalAlpha = a * (light ? 0.6 : 1) * V('hero.shadow', 1); main.drawImage(HL.s, dx * px, dy * px, cv.width, cv.height); }
    main.filter = 'none'; main.globalAlpha = 1; main.drawImage(HL.a, 0, 0); main.restore();
  }
  // ---------------------------------------------------------------- v13 stage: cover card + 16-step beat grid (under the hero logo)
  // The cover (cover-0, the beat's own, greys in Nigredo) fills the card (object-fit cover, the same pixels the intro's match-cut ends on),
  // kick pulse = scale 1 + 0.012 I and a small brightness lift (no fade). L.coverRect = the card rect, set every frame.
  function stepGrid(x, y, w, h, t, Sx, I) {
    const pad = port ? 22 : 18, H0 = port ? 30 : 24, gw = w - 2 * pad, gx = x + pad, gy = y + h - pad - H0, gap = 4, big = port ? 12 : 10;
    const cw = (gw - 3 * big - 12 * gap) / 16, Q = BEAT / 4, q16 = Math.floor(t / Q + 1e-6), cur = ((q16 % 16) + 16) % 16, barq = q16 - cur, gl = V('stepgrid.glow', 1), light = L.isLight(Sx);
    c.fillStyle = rgba(light ? Sx.card : Sx.bg, light ? 0.5 : 0.5); c.fill(L.rr(gx - 12, gy - 10, gw + 24, H0 + 34, 14));
    for (let i = 0; i < 16; i++) {
      const X = gx + i * (cw + gap) + Math.floor(i / 4) * (big - gap), qq = barq + i, isK = kickAt.has(qq), isS = snrAt.has(qq);
      let age = t - qq * Q; if (age < -1e-6) age += BAR;   // seconds since this step last sounded
      const lit = Math.exp(-Math.max(0, age) / 0.12), m = isK ? 1 : isS ? 0.82 : 0.42, ink = Sx.ink;
      const base = isK ? 0.2 : isS ? 0.15 : 0.08, a = clamp(base + m * lit * gl, 0, 1);
      if (isK && lit > 0.05) { c.fillStyle = rgba(ink, 0.18 * lit * gl); c.fill(L.rr(X - 3, gy - 3, cw + 6, H0 + 6, 7)); }
      c.fillStyle = rgba(ink, a); c.fill(L.rr(X, gy, cw, H0, 5));
      if (i === cur) { c.strokeStyle = rgba(Sx.hot, 0.95); c.lineWidth = 1.6; c.stroke(L.rr(X - 1, gy - 1, cw + 2, H0 + 2, 6)); c.lineWidth = 1; }
      // markers under the step: filled dot = a kick lands here in this bar, ring = snare
      if (isK || isS) { c.beginPath(); c.arc(X + cw / 2, gy + H0 + 12, 3, 0, 2 * Math.PI); if (isK) { c.fillStyle = rgba(ink, 0.8); c.fill(); } else { c.strokeStyle = rgba(ink, 0.7); c.stroke(); } }
    }
  }
  function coverBody(cr, t, k, Sx) {
    const fry = LOOK === 'player' ? V('hero.fry', Sx.grey ? 'negative' : Sx.name === 'RUBEDO' ? 'thermal' : 'stage') : 'none', r = L.winRect, [x, y, w, h] = r, rad = V('glass.radius', 22), I = glowAt(fidx(t)) * V('cover.pulse', 1), cv = INTRO.coverFried ? INTRO.coverFried(Math.round(V('player.cover', 0)), Sx, fry + (V('hero.halftone', true) ? '+ht' : '')) : null;
    L.coverRect = r; L.coverRadius = rad;
    c.save(); c.beginPath(); c.rect(x, y, w, h * k); c.clip(); c.clip(L.rr(x, y, w, h, rad));
    if (cv) { const z = L.openFx ? 1 : 1 + 0.012 * I, sc = Math.max(w, h) / cv.width * z; c.drawImage(cv, x + w / 2 - cv.width * sc / 2, y + h / 2 - cv.height * sc / 2, cv.width * sc, cv.height * sc); }   // (the scale pulse waits for the dolly to land: the match cut is an exact crop)
    else { c.fillStyle = Sx.card; c.fillRect(x, y, w, h); }
    const light = L.isLight(Sx);
    coverScrim(c, Sx, x, y, w, h, { dim: V('cover.dim', fry === 'negative' ? 0.9 : fry !== 'none' ? 0.55 : 1), light });   // v13: darker, so the logo reads (the intro push darkens into this same scrim)
    if (I > 0.02) { c.fillStyle = rgba(light ? Sx.bg : '#ffffff', 0.05 * I); c.fillRect(x, y, w, h); }   // kick lift, a brightness step that decays (no fade in)
    if (V('stepgrid.on', false) && k >= 1) stepGrid(x, y, w, h, t, Sx, I);
    c.restore();
    c.strokeStyle = rgba(Sx.ink, 0.38); c.lineWidth = 1.2; c.stroke(L.rr(x + 0.6, y + 0.6, w - 1.2, h - 1.2, rad)); c.lineWidth = 1;
  }
  // v12: spectrum + spectrogram calls are wrapped here so the merge can switch them to SV.draw / SG.draw(ctx, rect, frame, opts)
  const drawSpectrum = (cr, t, k, Sx) => M.spectrum(c, Sx, cr, t, k), drawSpectrogram = (cr, t, k, Sx) => M.spectro(c, Sx, cr, t, k);
  // ---------------------------------------------------------------- v19 VIDEO LAYER hook (UI-provided)
  // L.videoLayer = { src, w, h } (assets.videoLayer, else globalThis.u2cVideoLayer: app.assets is frozen) (src: HTMLVideoElement | canvas | ImageBitmap, already at the right frame; null = no video) is set from assets.videoLayer.
  // Cue props: video.on / .target (hero | full | waveform) / .blend / .opacity / .fit / .desat (offset is read by the UI, which seeks the source).
  // Every draw is wrapped in save()/restore(): the blend op, alpha and filter must never leak (a leaked op broke the invert pass once).
  Object.defineProperty(L, 'videoLayer', { get: () => (assets && assets.videoLayer) || globalThis.u2cVideoLayer || null, configurable: true });
  const VBLEND = ['screen', 'multiply', 'overlay', 'difference', 'lighten', 'darken', 'luminosity', 'soft-light'];
  function videoDraw(target, rx, ry, rw, rh) {
    const vl = L.videoLayer; if (!vl || !vl.w || !vl.h || (vl.src.readyState != null && vl.src.readyState < 2) || !V('video.on', false)) return;
    const tg = V('video.target', 'hero'); if (tg !== target && !(target === 'full' && tg === 'hero' && LOOK !== 'player')) return;
    const bl = V('video.blend', 'screen'), fit = V('video.fit', 'cover'), ds = clamp(V('video.desat', S.grey ? 1 : 0), 0, 1), sc = (fit === 'cover' ? Math.max : Math.min)(rw / vl.w, rh / vl.h), dw = vl.w * sc, dh = vl.h * sc;
    c.save(); c.beginPath(); c.rect(rx, ry, rw, rh); c.clip();
    c.globalAlpha = clamp(V('video.opacity', 0.8), 0, 1); c.globalCompositeOperation = VBLEND.includes(bl) ? bl : 'screen';
    if (ds > 0 && 'filter' in c) c.filter = `grayscale(${ds})`;
    try { c.drawImage(vl.src, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh); } catch (_) { /* source not decodable yet */ }
    c.restore();
  }
  // ---------------------------------------------------------------- v14 player: hero, now-playing, inserts, metadata
  // hero: the U2C chain logo centred in its cell (thread in/out + exponential kick glow unchanged), the elephant STATIC under the U (a logo mark, no swing),
  // the caption block bottom right, registration crosses. L.heroRect (set here) = the cell.
  function playerHero(cr, t, k, Sx) {
    const [x, y, w, h] = L.winRect, cx = x + w / 2 + V('hero.x', 0), cy = y + h * (V('hero.elephant', false) ? 0.40 : 0.5) + V('hero.y', 0) + (V('hero.ride', true) ? rideY(t) * h : 0), bb = BR.logoBBox(), lw = Math.min(w * (port ? 0.52 : 0.43), h * 0.62 * bb.w / bb.h) * V('hero.scale', 1) * V('logo.scale', 1), lh = lw * bb.h / bb.w;
    if (V('hero.cover', true)) coverBody(cr, t, k, Sx);   // v14.1: the darkened cover-0 behind the logo = the intro's match-cut target
    videoDraw('hero', x, y, w, h * k);   // v19 video layer: after the cover, before the MIDI map
    if (V('roll.on', true)) { const [rx, ry, rw, rh] = L.winRect; c.save(); c.beginPath(); c.rect(rx, ry, rw, rh * k); c.clip(); c.clip(L.rr(rx, ry, rw, rh, V('glass.radius', 22))); pianoRoll(rx, ry, rw, rh, t, Sx); c.restore(); }
    c.save(); c.beginPath(); c.rect(x, y, w, h * k); c.clip();
    const hero = ev.clipsAt('logo.hero', b).some((q) => q.v !== false), C = Math.max(4, Math.round(V('logo.cycle', 2) * 4)), I = glowAt(fidx(t));
    BR.logo(c, Sx, [0, 0, 0, 0], t, { at: { cx, cy, w: lw }, cycle: C, dwell: HOLD(C), off: HOLD_OFF, mode: V('logo.mode', 'cycle'), hero, glow: V('logo.glow', 1), kickI: I, pulse: I, bloom: V('logo.bloom', 1) * dropBloom(t), runner: V('logo.runner', true) });
    const d = lw * V('pendant.size', 1) * 0.5; if (V('hero.elephant', false)) BR.elephantMark(c, Sx, cx - lw * (port ? 0.2 : 0.16) + V('pendant.x', 0), cy + lh / 2 + d * 0.52 + V('pendant.y', 0), d, d);
    const ink = Sx.ink; PL.crosses(c, Sx, [[x + 30, cy], [x + w - 30, cy]], 20);
    if (V('scan.on', true) && (V('scan.always', false) || ev.shot(b).to === 'stage' || ev.shot(b).from === 'stage')) detect(x, y, w, h, t, Sx);   // v19.1: boxes only when the camera is on the hero
    if (V('hero.caption', false)) PL.heroCaption(c, Sx, port ? x + w - 24 : x + w - 24, y + h - 22 - 25 * 3, 'right', 205);
    c.restore();
  }
  const nowCover = (r) => { const [x, y, w, h] = r, cp = w > 700 && h < 220; return cp ? [x + 20, y + 20, h - 40, h - 40] : [x + 20, y + 20, w - 40, Math.round((w - 40) * 0.5)]; };
  function playerNow(cr, t, k, Sx) {
    const r = L.winRect; c.save(); c.beginPath(); c.rect(r[0], r[1], r[2], r[3] * k); c.clip();
    PL.now(c, Sx, r, t, { cover: INTRO.coverCanvas ? INTRO.coverCanvas(Math.round(V('player.cover', 0)), Sx) : null, dim: V('cover.dim', 1) });
    c.restore();
  }
  function playerInserts(cr, t, k, Sx) {
    const [x, y, w, h] = cr;
    if (M.inserts) return M.inserts(c, Sx, cr, t, k);   // panels agent: 4 live tiles (spectrum, GR history, width/corr trace, rotating cube)
    const g = 12, tw = (w - 3 * g) / 4; for (let i = 0; i < 4; i++) L.panel(c, x + i * (tw + g), y, tw, h, Sx, { r: 10 });   // placeholder: empty glass tiles until the module exists
  }
  const BODY = { hero: playerHero, now: playerNow, inserts: playerInserts, meta: (cr, t, k, Sx) => PL.meta(c, Sx, cr, t, { cover: INTRO.coverCanvas ? INTRO.coverCanvas(Math.round(V('player.cover', 0)), Sx) : null }),
    cover: coverBody, logo: chainsBody, pendant: elephantBody, waveform: (cr, t, k, Sx) => { M.session(c, Sx, cr, t, k); videoDraw('waveform', cr[0], cr[1], cr[2], cr[3] * k); }, clock: (cr, t, k, Sx) => M.clock(c, Sx, cr, t, k), bands: (cr, t, k, Sx) => M.bands(c, Sx, cr, t, k),
    eq: (cr, t, k, Sx) => M.eq(c, Sx, cr, t, k), spectrum: drawSpectrum, loudness: (cr, t, k, Sx) => (LOOK === 'player' ? M.levels(c, Sx, cr, t, k, { variant: 'player' }) : M.loud(c, Sx, cr, t, k)), stereo: (cr, t, k, Sx) => M.stereo(c, Sx, cr, t, k, LOOK === 'player' ? { variant: 'player' } : undefined),
    spectrogram: drawSpectrogram, surface: (cr, t, k, Sx) => M.surface(c, Sx, cr, t, k),
    levels: (cr, t, k, Sx) => M.levels(c, Sx, cr, t, k), ghost: (cr, t, k, Sx) => M.ghost(c, Sx, cr, t, k) };
  // v14 player shell: sidebar (16:9) + top bar, in the world under the camera, drawn before the cards
  function playerShell(t) {
    const sb = SIDEBAR[aspect], tb = TOPBAR[aspect], s = ev.shot(b), tab = s.to === 'wide' ? 0 : (TAB_OF[s.to] ?? 0), I = glowAt(fidx(t));
    if (sb) { L.glass(c, sb[0], sb[1], sb[2], sb[3], S, { r: V('glass.radius', 22), tint: 0.36 + 0.2, edge: 0.6, shadow: 0.75 });
      PL.sidebar(c, S, sb, t, { pulse: I, logo: ([lx, ly], lw) => { const bb = BR.logoBBox(); BR.logo(c, S, [0, 0, 0, 0], t, { at: { cx: lx, cy: ly, w: lw }, cycle: 8, hero: true, glow: 0, kickI: 0, pulse: 0, bloom: 0, runner: false }); } }); }
    PL.topbar(c, S, tb, t, { port, tab, tabs: port || V('player.tabs169', false) });
  }
  // v17 (tip B) focus bracket: a stage-colour frame that travels between panels with the camera. Each edge rides its own closed-form spring:
  // the edges on the side of travel (leading) are faster (w 13) than the trailing ones (w 7), so the frame stretches ahead and settles
  const spr = (p, w) => (p <= 0 ? 0 : p >= 1.6 ? 1 : 1 - (1 + w * p) * Math.exp(-w * p));
  function focusBracket(t) {
    const s = ev.shot(b); if (!s.key || (s.from === 'wide' && s.to === 'wide')) return;
    const RA = s.from === 'wide' ? null : LY[s.from], RB = s.to === 'wide' ? null : LY[s.to]; if (!RA && !RB) return;
    const d = Math.max(1e-6, s.key.dur ?? 1), p = s.key.transition === 'cut' ? 1 : (b - (s.key.b - d)) / d, A = RA || RB, Bq = RB || RA;
    const a0 = [A[0], A[1], A[0] + A[2], A[1] + A[3]], b0 = [Bq[0], Bq[1], Bq[0] + Bq[2], Bq[1] + Bq[3]];
    const right = b0[0] + b0[2] > a0[0] + a0[2], down = b0[1] + b0[3] > a0[1] + a0[3], lead = [!right, !down, right, down];
    const e = a0.map((v, i) => v + (b0[i] - v) * spr(p, lead[i] ? 13 : 7)), al = RB ? 1 : 1 - Math.min(1, p * 1.5);
    if (al <= 0.01) return; const pad = 6, col = S.grey ? S.ink : S.hot;
    c.save(); c.globalAlpha = 0.85 * al; c.strokeStyle = col; c.lineWidth = 2; const k = 26;
    const [x0, y0, x1, y1] = [e[0] - pad, e[1] - pad, e[2] + pad, e[3] + pad]; c.beginPath();
    for (const [cx2, cy2, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { c.moveTo(cx2, cy2 + sy * k); c.lineTo(cx2, cy2); c.lineTo(cx2 + sx * k, cy2); }
    c.stroke(); c.restore();
  }
  // v18 Y2K cursor (the v17 prompt: "a cursor drives every change"): before each camera travel it glides (spring) to the target panel's title bar,
  // clicks ON the beat the travel starts (press + ring), then rides along; world space, so it stays on the panel while the camera moves
  let CUR = null;
  function cursorPath() { if (CUR && CUR.ev === ev) return CUR.p; const p = [];
    for (const k of ev.keysIn('camera.shot', 0, 1e6)) { const r = k.v !== 'wide' && LY[k.v]; if (!r) continue; const d = k.dur ?? 1; p.push({ b: k.b - d, x: r[0] + 92, y: r[1] + (port ? 28 : 26) }); }
    CUR = { ev, p }; return p; }
  function cursor(t) {
    const P = cursorPath(); if (!P.length) return; const h = LY.stage, home = h ? { x: h[0] + h[2] * 0.62, y: h[1] + h[3] * 0.6 } : { x: W / 2, y: H / 2 };
    let i = P.findIndex((q) => q.b > b); if (i < 0) i = P.length; const A = i > 0 ? P[i - 1] : { ...home, b: IB }, Bq = i < P.length ? P[i] : A;
    const t0 = T(A.b) + 0.15, t1 = T(Bq.b) - 0.12, u = t1 > t0 ? clamp((t - t0) / (t1 - t0)) : 1, e = spr(u * 1.25, 7);
    const x = A.x + (Bq.x - A.x) * e, y = A.y + (Bq.y - A.y) * e, dt = t - T(Bq.b) >= -0.12 && t - T(Bq.b) < 0.25 ? t - T(Bq.b) : t - T(A.b), press = dt >= -0.04 && dt < 0.1 ? 0.86 : 1;
    const s = (port ? 2.1 : 1.6) * press; c.save(); c.translate(x, y);
    if (dt >= 0 && dt < 0.25) { c.beginPath(); c.arc(0, 0, 10 + 60 * dt / 0.25, 0, 2 * Math.PI); c.strokeStyle = rgba(S.grey ? S.ink : S.hot, 0.7 * (1 - dt / 0.25)); c.lineWidth = 2; c.stroke(); }
    c.scale(s, s); c.beginPath(); [[0, 0], [0, 17], [4, 13], [7, 20], [9.5, 19], [6.5, 12], [12, 12]].forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#000000'; c.stroke(); c.restore();
  }
  function card(id, t, active) {
    const r = LY[id], n = openStep(id, t); if (n <= 0) return;
    const acc = V(`win.${id}.accent`, null), Sx = acc && acc !== S.hot ? Object.assign({}, S, { hot: acc }) : S;
    const cr = chrome(id, r, n, t, Sx, active); if (!cr) return;
    const k = n >= 6 ? 1 : n === 5 ? 0.66 : n === 4 ? 0.33 : 0;
    c.save(); c.clip(L.rr(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2, V('glass.radius', 22)));
    L.avoid = []; L.curWin = id; L.winRect = r; L.contentRect = cr;
    if (k > 0) (BODY[contentOf(id)] || BODY.spectrum)(cr, t, k, Sx);
    c.restore();
  }
  const resultAt = () => V('result.at', Math.max(0, (NB - (NB >= 8 ? 2 : 1)) * 4));
  // ---------------------------------------------------------------- overlays: end card, HUD, text cues, textures
  // v11 end card: one liquid-glass card over the blurred bench (the frame itself is its backdrop). Six steps on half
  // beats: card, title (display voice), tempo + key (mono), credit (UI voice), a scrub bar with the real clip time
  // (it echoes the intro player), the measured loudness. Hard reveals, no fades.
  function result(t) {
    const ra = resultAt(); if (!V('result.on', true) || t < T(ra)) return;
    const n = steps(t, ra, 6, 0.5), R = (p) => tag('result.' + p), light = L.isLight(S);
    c.fillStyle = rgba(S.bg, light ? 0.35 : 0.55); c.fillRect(0, 0, W, H);   // the bench steps back (one step, no ramp)
    L.snap(c, 'frame', 4);
    const cw = port ? 860 : 1040, ch = port ? 760 : 560, x = (W - cw) / 2, y = port ? (H - ch) / 2 - 40 : (H - ch) / 2, cx = W / 2;
    L.glass(c, x, y, cw, ch, S, { r: 36, backdrop: 'frame', tint: light ? 0.5 : 0.3 });
    const ink = S.ink, dim = rgba(S.ink, 0.55), inner = cw - 120;
    if (n >= 2) text(c, R('title').toUpperCase(), cx, y + ch * 0.34, { size: port ? 84 : 92, fam: DISPLAY, w: 800, col: ink, align: 'center', base: 'alphabetic', maxW: inner, ls: -1 });
    if (n >= 3) text(c, R('meta'), cx, y + ch * 0.34 + 62, { size: 26, w: 500, col: dim, align: 'center', ls: 3, maxW: inner });
    if (n >= 4) text(c, R('producer'), cx, y + ch * 0.6, { size: 44, fam: UI, w: 500, col: ink, align: 'center', maxW: inner });
    if (n >= 5) {   // scrub bar: real position in the clip
      const bx = x + 60, bw = cw - 120, by = y + ch * 0.76, u = clamp(t / D.duration);
      c.fillStyle = rgba(S.ink, 0.16); c.fill(L.rr(bx, by - 3, bw, 6, 3)); c.fillStyle = S.hot; c.fill(L.rr(bx, by - 3, Math.max(6, bw * u), 6, 3));
      text(c, tc(t).slice(0, 5), bx, by + 34, { size: 20, col: dim }); text(c, tc(D.duration).slice(0, 5), bx + bw, by + 34, { size: 20, col: dim, align: 'right' });
    }
    if (n >= 6) text(c, R('measure'), cx, y + ch - 44, { size: 20, col: rgba(S.ink, 0.42), align: 'center', maxW: inner });
  }
  // v11 HUD: four quiet readouts in the margins (title, tempo + key, bar.beat, credit); no bars, no REC. It shows on
  // the wide shot only: from the first frame of a push until the camera is wide again it is off (hard), so it never
  // covers a pushed-in window.
  function hud(t, s) {
    if (!V('hud.on', true) || LOOK === 'player') return;
    if (s && (s.to !== 'wide' || s.from !== 'wide') || L.openFx) return;
    const hv = { tc: tc(t), bbt: bbt(t), songBar: String(D.song.startBar + Math.floor(t / BAR)) }, [, t1, b0] = HUD_BAND[aspect];
    const m = port ? 52 : 52, top = t1 / 2 + 4, bot = (b0 + H) / 2 - 2, dim = rgba(S.ink, 0.55);
    text(c, tag('hud.left', hv), m, top, { size: port ? 24 : 22, fam: DISPLAY, w: 800, col: S.ink, ls: 0.5, maxW: W * 0.55 });
    text(c, tag('hud.right', hv), W - m, top, { size: 20, w: 500, col: dim, align: 'right', ls: 1.5 });
    text(c, tag('hud.bottomLeft', hv), m, bot, { size: 20, w: 500, col: dim, ls: 1.5 });
    text(c, tag('hud.bottomRight', hv), W - m, bot, { size: 20, fam: UI, w: 500, col: dim, align: 'right', ls: 0.5 });
  }
  // text cues: typed one character per 64th note from the key, hard cut at the end of the clip (no fades)
  // v18 social layer (Y2K system dialogs, screen space, inside the TikTok safe zone): HOOK on frame 0 (readable with the sound off; a loading bar
  // fills over the intro = anticipation), CTA 1 (comment keyword) and CTA 2 (link in bio) as pop-up alerts; spring pop-in (no fade), hard out.
  // All text is tags (social.*), timing is cue paths (social.cta1.at / .len, social.cta2.at / .len in beats); social.on switches it all.
  // v22.1 TYPING (user: "every notification typed like a computer"): title, then body, then sub, one character per 64th note from typeT = 0;
  // a block caret rides the end of the line being typed. slow = the hook's slow entrance (rises 46 px on a soft spring over ~0.9 s).
  // v22.1 DEPTH OF FIELD (user: "a blur on anything not in focus, fading in and out, high luxury"): blur what is already drawn by amt x maxPx
  // (logical px), via a snapshot + ctx.filter, before the in-focus layer (focused window, dialog) is drawn on top. amt eases with the cause.
  const DOFC = { cv: null };
  function dof(amt, maxPx) { if (!(amt > 0.01) || !V('fx.dof', LOOK === 'player')) return; const cv = c.canvas; let t2 = DOFC.cv; if (!t2 || t2.width !== cv.width || t2.height !== cv.height) { t2 = DOFC.cv = document.createElement('canvas'); t2.width = cv.width; t2.height = cv.height; }
    const g2 = t2.getContext('2d'); g2.clearRect(0, 0, t2.width, t2.height); g2.drawImage(cv, 0, 0); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${(amt * maxPx * cv.width / W).toFixed(2)}px)`; c.drawImage(t2, 0, 0); c.restore(); }
  // v22.5 VOICE CAPTIONS (user: "the keyboard follows what she says"): each voice line (tags voice.lines, editable on the site) types as a console line
  // while she says it: phrase i starts at voice.ats[i] (composition s) and types over 85 % of voice.durs[i]; lines stack upward, older ones dim.
  const vNums = (k, def) => String(tag(k) || def).split(',').map(Number);
  function voiceLines() { const nn = String(tag('voice.number') || '01'), L4 = (tag('voice.lines') || []).map((q) => String(q).replace(/\{n\}/g, nn).toUpperCase()), at = vNums('voice.ats', '0.7,3.0,5.0'), du = vNums('voice.durs', '2.0,1.6,1.3');
    return L4.map((txt, i) => ({ txt, t: at[i] ?? (0.45 + i * 1.6), rate: (du[i] ?? 1.4) * 0.85 / Math.max(1, txt.length) })); }
  function voiceCaptions(tc) {
    // 9:16 keeps only the newest two lines (clear of the card); 16:9 shows all four
    if (!V('voice.captions', LOOK === 'player') || PRE <= 0 || tc > PRE + 0.05) return; const VL = voiceLines(), fz = port ? 26 : 20, x0 = port ? 64 : W / 2 - 560, y0 = port ? 1388 : 828, lh = fz * 1.55;
    const live = VL.filter((q) => tc >= q.t).slice(port ? -2 : -4); live.forEach((q, j) => { const n = Math.min(q.txt.length, Math.floor((tc - q.t) / q.rate + 1e-6) + 1), str = '> ' + q.txt.slice(0, n), last = j === live.length - 1, y = y0 - (live.length - 1 - j) * lh;
      text(c, str, x0, y, { size: fz, fam: DISPLAY, w: 800, col: rgba(S.ink, last ? 0.95 : 0.4), maxW: W - x0 - 60 });
      if (last && (n < q.txt.length || Math.floor(tc / 0.27) % 2 === 0)) { c.font = `800 ${fz}px ${DISPLAY}`; const cw = Math.min(W - x0 - 60, c.measureText(str).width * 1.04); c.fillStyle = rgba(S.ink, 0.9); c.fillRect(x0 + cw + 6, y - fz * 0.42, fz * 0.5, fz * 0.84); } });
  }
  function typed(strs, typeT, rate = T(1 / 24)) { if (typeT == null) return strs; let n = Math.max(0, Math.floor(typeT / rate + 1e-6)); return strs.map((q) => { const s0 = String(q || ''), k = Math.min(s0.length, n); n -= k; return s0.slice(0, k); }); }
  function dialog(cx, cy, wD, title, body, sub, t0, t, prog, typeT = null, slow = false, rate = T(1 / 24)) {
    const ue = Math.max(0, t - t0) / (slow ? 0.9 : 0.35), sp0 = spr(ue, slow ? 6 : 9), sc = (slow ? 0.9 : 0.94) + (slow ? 0.1 : 0.06) * sp0; cy += slow ? (1 - sp0) * 46 : 0; const big = port ? 22 : 0, h = (sub ? 168 : 136) + big, x = cx - wD / 2, y = cy - h / 2, col = S.grey ? '#0a0a0a' : S.hot;
    c.save(); c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy);
    L.glass(c, x, y, wD, h, S, { r: 18, tint: 0.62, shadow: 1 });
    c.fillStyle = rgba(S.ink, 0.08); c.fillRect(x + 1, y + 1, wD - 2, 40); c.fillStyle = rgba(S.ink, 0.18); c.fillRect(x, y + 41, wD, 1);
    lights(x + 26, y + 21, S, true);
    const full3 = [String(title).toUpperCase(), String(body).toUpperCase(), sub ? String(sub).toUpperCase() : ''], totalN = full3.join('').length; [title, body, sub] = typed(full3, typeT, rate); const typing = typeT != null && (title.length + body.length + sub.length) < totalN;
    text(c, String(title).toUpperCase(), x + wD / 2, y + 21, { size: 18, fam: UI, w: 600, ls: 1.5, col: rgba(S.ink, 0.8), align: 'center', maxW: wD - 180 });
    text(c, String(body).toUpperCase(), x + wD / 2, y + 82 + big / 2, { size: port ? 56 : 32, fam: DISPLAY, w: 800, col: S.ink, align: 'center', maxW: wD - 48 });
    if (typing || (typeT != null && Math.floor(Math.max(0, typeT) / T(1 / 8)) % 2 === 0)) { const line = sub ? 2 : body ? 1 : 0, ly = [y + 21, y + 82 + big / 2, y + 126 + big][line], fz2 = [18, port ? 56 : 32, 20][line], str = [title, body, sub][line]; c.font = `800 ${fz2}px ${line === 1 ? DISPLAY : UI}`; const cw = Math.min(wD - 48, c.measureText(str).width * 1.04); c.fillStyle = rgba(S.ink, 0.9); c.fillRect(x + wD / 2 + cw / 2 + 4, ly - fz2 * 0.42, fz2 * 0.45, fz2 * 0.84); }
    if (sub) text(c, String(sub).toUpperCase(), x + wD / 2, y + 126 + big, { size: 20, fam: UI, w: 500, ls: 1.2, col: rgba(S.ink, 0.65), align: 'center', maxW: wD - 48 });
    if (prog != null) { const bx = x + 24, by = y + h - 18, bw = wD - 48; c.fillStyle = rgba(S.ink, 0.12); c.fillRect(bx, by, bw, 6); const n = Math.floor(clamp(prog) * 24);
      c.fillStyle = S.grey ? S.ink : col; for (let i = 0; i < n; i++) c.fillRect(bx + i * bw / 24 + 1, by, bw / 24 - 2, 6); }
    c.restore();
  }
  function social(t, intro) {
    if (!V('social.on', LOOK === 'player')) return;
    const wD = port ? 900 : 760, cx = W / 2;   // v19.5: wider + bigger hook text (reads at thumb-scroll size)
    if (intro) { const p = clamp(t / T(IB)); const hi = Math.round(V('social.hookIdx', -1)), hooks = tag('social.hooks') || [], hookTxt = hi >= 0 && hooks[hi] ? hooks[hi] : tag('social.hook'); const hs = -PRE + 0.25; if (t < hs) return; dialog(cx, port ? 330 : 150, wD, tag('social.title'), hookTxt, null, hs, t, p, t - hs - 0.75, true, T(1 / 12)); return; }   // v22.5: the hook types at half speed (user: too fast)   // v22.1: frame 0 = no hook; it rises in slowly, then types   // v19.1: A/B hook variants
    for (const [k, def] of [['cta1', 32], ['cta2', Math.max(36, Math.round(D.duration / BEAT) - 20)]]) {
      const at = V(`social.${k}.at`, def), len = V(`social.${k}.len`, 8); if (b < at || b >= at + len) continue;
      dof(Math.min(clamp((b - at) / 0.6), clamp((at + len - b) / 0.6)), 7); dialog(cx, port ? H * 0.5 : H * 0.5, wD, tag(`social.${k}.title`), tag(`social.${k}.body`), tag(`social.${k}.sub`), T(at), t, null, t - T(at) - 0.15);
    }
  }
  // v19 MOUSE LAYER (screen space, drawn last): the cursor drives the film like a real computer. Waypoints in film time (pre-roll < 0):
  // rest -> clicks PLAY on the stopped player (the audio starts on that click) -> clicks the chosen cover card (the push-in follows) -> clicks
  // each panel's title bar right before the camera travels there -> closes each CTA alert with its x (the alert dies on the click) -> clicks
  // the hero before the outro dolly -> glides back to rest, so the last frame = frame 0. Motion: minimum-jerk easing on a gently curved
  // (quadratic) path, a 60 ms press before each click, a ring after it. Panel targets are world points re-projected with the current camera.
  let MW = null;
  function mouseWays() { if (MW && MW.ev === ev) return MW.w; const w = [], P = PRE, rest = { sx: W * 0.8, sy: H * (port ? 0.84 : 0.88) };
    w.push({ t: -P, ...rest }); if (P > 0) w.push({ t: -0.06, play: true, click: true });
    if (IB && LOOK === 'player' && P > 0 && ev.value('intro.style', -4, 'flow') === 'sphere') { const g = INTRO.geom(W, H), R = Math.min(g.cw * 0.95, 420), cy0 = g.cy - R * 0.05;   // v22 sphere: press low on the sphere, drag up (held), click the beat cover
      w.push({ t: T(-10.5) - 0.02, sx: g.cx + g.cw * 0.06, sy: cy0 + R * 0.5, click: true }); w.push({ t: T(-7), sx: g.cx + g.cw * 0.04, sy: cy0 + R * 0.04, drag: true, click: true }); w.push({ t: T(-6.1) - 0.02, sx: g.cx + g.cw * 0.03, sy: cy0 - R * 0.02, click: true }); }
    else if (IB && LOOK === 'player' && P > 0) { const g = INTRO.geom(W, H); const br = Math.round(ev.value('intro.browse', -4, 1)); if (br) for (const bb of [-3, -2]) w.push({ t: T(bb) - 0.02, sx: g.cx - br * g.xs1 * 0.95, sy: g.cy + g.cw * 0.1, click: true }); w.push({ t: T(-1.25) - 0.02, sx: g.cx + g.cw * 0.12, sy: g.cy + g.cw * 0.25, click: true }); }   // v19.3: browse x2, choose; v21: browse side follows the seed (+1 left card, -1 right card, 0 direct)
    else if (IB) { const g = INTRO.geom(W, H); w.push({ t: T(Math.max(1, IB - 2)) - 0.02, sx: g.cx + g.cw * 0.18, sy: g.cy + g.cw * 0.2, click: true }); }
    for (const k of ev.keysIn('camera.shot', 0, 1e6)) { const r = k.v !== 'wide' && LY[k.v]; if (!r) continue; const d = k.dur ?? 1; w.push({ t: T(k.b - d) - 0.02, wx: r[0] + 92, wy: r[1] + (port ? 28 : 26), click: true }); }
    if (V('social.on', LOOK === 'player')) for (const [kk, def] of [['cta1', 32], ['cta2', Math.max(36, Math.round(D.duration / BEAT) - 20)]]) { const at = V(`social.${kk}.at`, def), len = V(`social.${kk}.len`, 8);
      w.push({ t: T(at + len) - 0.02, sx: W / 2 - (port ? 450 : 380) + 26, sy: H * 0.5 - (port ? 95 : 84) + 21, click: true, cta: kk }); }
    if (RWB0 && OUTD) { const w2 = outroWin(); w.push({ t: T(w2[1]) - 0.02, sx: W / 2 - (port ? 450 : 380) + 26, sy: H * 0.5 - (port ? 95 : 84) + 21, click: true }); }   // v21: the x of JOIN / CREATE PROJECT
    else if (RWB0) w.push({ t: T(RWB0) - T(3) - 0.02, wx: (LY.stage || [W / 2, H / 2, 0, 0])[0] + (LY.stage ? LY.stage[2] * 0.5 : 0), wy: (LY.stage || [0, H / 2, 0, 0])[1] + (LY.stage ? LY.stage[3] * 0.55 : 0), click: true });
    w.push({ t: D.duration, ...rest }); w.sort((a2, b2) => a2.t - b2.t); MW = { ev, w }; return w; }
  const mj = (u) => u * u * u * (10 - 15 * u + 6 * u * u);
  // v19.4: click times in COMPOSITION seconds (film time + pre-roll), for the export's UI click sounds; call after one render()
  const clickTimes = () => mouseWays().filter((q) => q.click).map((q) => q.t + PRE).filter((x) => x >= 0);
  // v22.4: the typing moments in COMPOSITION seconds (for the web export's keyboard taps; render.mjs builds the same list for the native render):
  // [{t, n (characters), dt (seconds per character)}]. Call after one render().
  const introMarks = () => ({ pick: LOOK === 'player' && PRE > 0 && ev.value('intro.style', -4, 'flow') === 'sphere' ? PRE + T(-6.1) + 0.03 : null });
  function typeEvents() {
    const E = [], rate = T(1 / 24), len = (q) => String(q ?? '').length, P = PRE, add = (t, n, dt) => { if (n > 0 && t >= 0) E.push({ t, n, dt }); };
    if (LOOK !== 'player' || !V('social.on', true)) return E;
    const hi = Math.round(V('social.hookIdx', -1)), hooks = tag('social.hooks') || [], hk = hi >= 0 && hooks[hi] ? hooks[hi] : tag('social.hook'); if (P > 0) add(1.0, len(tag('social.title')) + len(hk), T(1 / 12));
    if (P > 0 && V('voice.captions', true)) for (const q of voiceLines()) add(q.t, q.txt.length + 2, q.rate);   // v22.5 the console lines follow the voice
    if (ev.value('intro.style', -4, 'flow') === 'sphere' && P > 0) { const n = len(tag('intro.title') || D.title) + len(tag('intro.credit') || 'prod. @uche2crazy'); add(P + T(-4.4), n, T(1) / Math.max(1, n)); }
    for (const [k, def] of [['cta1', 32], ['cta2', Math.max(36, Math.round(D.duration / BEAT) - 20)]]) { const at = V(`social.${k}.at`, def); add(P + T(at) + 0.15, len(tag(`social.${k}.title`)) + len(tag(`social.${k}.body`)) + len(tag(`social.${k}.sub`)), rate); }
    const term = tag('social.terminal') || []; for (const k of ev.keysIn('term.line', 0, 1e6)) add(P + T(k.b), len(typeof k.v === 'number' ? term[k.v] : L.sub(String(k.v ?? ''))), T(1 / 16));
    const w2 = outroWin(); if (w2) add(P + T(w2[0]) + 0.15, len(tag('social.outro.title')) + len(tag('social.outro.body')) + len(tag('social.outro.sub')), rate);
    return E;
  }
  function mousePos(q, cam) { if (q.play) return INTRO_HIT.play || [W * 0.3, H * 0.8]; if (q.wx != null) { if (!cam) return [W / 2, H / 2]; return [(q.wx - cam.x) * cam.z + W / 2, (q.wy - cam.y) * cam.z + H / 2]; } return [q.sx, q.sy]; }
  function mouse(tf, cam) {
    if (!V('cursor.on', LOOK === 'player')) return; const w = mouseWays(); let i = w.findIndex((q) => q.t > tf); if (i < 0) i = w.length - 1; if (i === 0) i = 1;
    const A = w[i - 1], B = w[i], pa = mousePos(A, cam), pb = mousePos(B, cam), gap = B.t - A.t, mv = B.drag ? gap : Math.min(0.6, Math.max(0.12, gap - 0.12)), s0 = B.drag ? A.t : B.t - mv - 0.06, u = clamp((tf - s0) / mv), e = B.drag ? u * u * (3 - 2 * u) : mj(u);   // v22: a drag moves for the whole segment, with the button held
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], bend = 0.12, mxp = pa[0] + dx / 2 - dy * bend, myp = pa[1] + dy / 2 + dx * bend;
    const x = (1 - e) * (1 - e) * pa[0] + 2 * (1 - e) * e * mxp + e * e * pb[0], y = (1 - e) * (1 - e) * pa[1] + 2 * (1 - e) * e * myp + e * e * pb[1];
    const sinceA = tf - A.t, toB = B.t - tf, press = (B.drag && tf >= A.t) || (B.click && toB < 0.06 && toB >= 0) || (A.click && sinceA < 0.08) ? 0.84 : 1, s = (port ? 2.9 : 2.0) * press;
    c.save(); c.setTransform(c.canvas.width / W, 0, 0, c.canvas.width / W, 0, 0);
    if (A.click && sinceA >= 0 && sinceA < 0.3) { c.beginPath(); c.arc(x, y, 12 + 70 * sinceA / 0.3, 0, 2 * Math.PI); c.strokeStyle = rgba(S.grey ? S.ink : S.hot, 0.75 * (1 - sinceA / 0.3)); c.lineWidth = 2.5; c.stroke(); }
    c.translate(x, y); c.rotate(-0.04); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 6; c.shadowOffsetX = 2; c.shadowOffsetY = 3; c.beginPath();
    [[0, 0], [0, 17], [4, 13], [7, 20], [9.5, 19], [6.5, 12], [12, 12]].forEach(([px2, py2], j) => (j ? c.lineTo(px2, py2) : c.moveTo(px2, py2))); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); c.shadowColor = 'transparent'; c.lineWidth = 1.2; c.strokeStyle = '#000000'; c.stroke(); c.restore();
  }
  // v21 outro dialog (screen space, on the hero shot): JOIN / CREATE PROJECT pops (spring) 5 beats before the cut back, the cursor closes it with x 2 beats later
  const outroWin = () => (OUTD && RWB ? [RWB - 5.5, RWB - 3] : null);   // v22.1: 2.5 beats so CLOSE PROJECT? types out fully
  function outroDialog(t) { const w2 = outroWin(); if (!w2 || b < w2[0] || b >= w2[1] + 0.5) return; const uo = clamp((b - w2[1]) / 0.5), ox = b >= w2[1] ? 1 - uo * uo * (3 - 2 * uo) : 1; if (ox <= 0.01) return; dof(Math.min(clamp((b - w2[0]) / 0.6), ox), 7); c.save(); c.translate(W / 2, H * 0.5); c.scale(ox, ox); c.translate(-W / 2, -H * 0.5); dialog(W / 2, H * 0.5, port ? 900 : 760, tag('social.outro.title') || 'U2C LAB', tag('social.outro.body') || 'JOIN / CREATE PROJECT', tag('social.outro.sub') || '', T(w2[0]), t, null, t - T(w2[0]) - 0.15); c.restore(); }   // v22: CLOSE PROJECT?; after the x click it shrinks away (half a beat) as the dolly starts
  // v21 TERMINAL WORDS (user: "words that come in and out, like on a computer"): term.line clips type in one character per 64th note, hold, then delete backwards
  // (one character per 128th) before the clip ends; a small system toast, bottom-left inside the safe zone; text is a tag string with {vars}
  function terminal(t) {
    if (!V('term.on', LOOK === 'player')) return;
    for (const k of ev.clipsAt('term.line', b)) { const s0 = (typeof k.v === 'number' ? String((tag('social.terminal') || [])[k.v] || '') : L.sub(String(k.v ?? ''))).toUpperCase(); if (!s0) continue; const dur = k.dur ?? 4, age = t - T(k.b), left = T(k.b + dur) - t;
      const nIn = Math.floor(age / T(1 / 16) + 1e-6) + 1, nOut = Math.floor(left / T(1 / 32) + 1e-6), n = Math.max(0, Math.min(s0.length, nIn, nOut)); if (!n) continue;
      const str = s0.slice(0, n), fz = port ? 30 : 24, x0 = port ? 64 : 300, y0 = port ? 1380 : 940; c.font = `800 ${fz}px ${DISPLAY}`; const tw = c.measureText(s0).width * 1.06 + 64;
      L.glass(c, x0, y0 - fz, tw, fz * 2, S, { r: 10, tint: 0.7, shadow: 0.8 }); c.fillStyle = rgba(S.ink, 0.9); c.fillRect(x0 + 16, y0 - 2, 10, 4);
      text(c, str, x0 + 36, y0, { size: fz, fam: DISPLAY, w: 800, col: S.ink, maxW: W - x0 - 80 });
      const caret = (Math.floor(age / T(1 / 8)) % 2 === 0) || n < s0.length; if (caret) { c.font = `800 ${fz}px ${DISPLAY}`; const cw = Math.min(W - x0 - 80, c.measureText(str).width * 1.06); c.fillStyle = S.ink; c.fillRect(x0 + 40 + cw, y0 - fz * 0.45, fz * 0.5, fz * 0.9); } }
  }
  function textCues(t) {
    for (const k of ev.clipsAt('text.cue', b)) {
      const s = L.sub(String(k.v ?? '')); if (!s) continue;
      const n = Math.min(s.length, Math.floor((t - T(k.b)) / T(1 / 16) + 1e-6) + 1), str = s.slice(0, n), size = k.size || 56, x = (k.x ?? 0.5) * W, y = (k.y ?? 0.5) * H;
      const colr = k.color === 'hot' ? S.hot : k.color === 'dim' ? S.dim : /^#/.test(k.color || '') ? k.color : S.ink, al = k.align || 'center', st = k.font || 'mono';
      const fam = st === 'display' ? DISPLAY : st === 'sans' || st === 'ui' ? UI : MONO;
      if (k.box !== false) { c.font = `700 ${size}px ${fam}`; const tw = Math.min(W - 40, c.measureText(s).width + size * 1.2), bx = al === 'left' ? x - size * 0.6 : al === 'right' ? x - tw + size * 0.6 : x - tw / 2;
        L.glass(c, bx, y - size * 0.95, tw, size * 1.9, S, { r: size * 0.95, backdrop: 'ground', tint: 0.45, shadow: 0.6 }); }
      if (st === 'hand') lab.hand(c, str, x, y + size * 0.3, size, colr, t, 40 + Math.floor(k.b), -0.02, al);
      else if (st === 'stencil') lab.stencil(c, str.toUpperCase(), al === 'center' ? x : x, y, size, colr, al);
      else text(c, st === 'display' ? str.toUpperCase() : str, x, y, { size, fam: st === 'serif' ? SERIF : fam, w: st === 'serif' ? 400 : st === 'display' ? 800 : st === 'mono' ? 700 : 500, style: st === 'serif' ? 'italic' : '', col: colr, align: al, maxW: W - 60 });
    }
  }
  const grain = [];
  for (let q = 0; q < 4; q++) { const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256); for (let i = 0; i < 65536; i++) { const v = hash(i * 1.37 + q * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } gx.putImageData(im, 0, 0); grain.push(g); }
  function textures(t) {
    const f = fidx(t), g = grain[((Math.floor(t / T(U.s16)) % 4) + 4) % 4], gr = V('fx.grain', S.grain), vg = V('fx.vignette', S.vignette), sc = V('fx.scan', 0);
    if (gr > 0) { c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = gr * 0.8; const ox = (hash(f * 3.1) * 256) | 0, oy = (hash(f * 7.7) * 256) | 0;
      for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) c.drawImage(g, xx, yy); c.restore(); }
    if (sc > 0) { c.fillStyle = `rgba(0,0,0,${0.45 * sc})`; for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2); }
    if (vg > 0) { const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${vg * 0.7})`); c.fillStyle = v; c.fillRect(0, 0, W, H); }
  }
  // v21 EDITORIAL GROUND (user refs: lyric sheet / ANGEL(s) / CORTEX): organised chaos behind the glass. Static (cached per stage + aspect + title):
  // huge soft words (big/small contrast), hairline registration lines with crosshairs, FIG labels and tiny annotation blocks. The glass blurs it further.
  const EDC = new Map();
  function editorial() {
    const words = (tag('ground.words') || []).map((q) => String(q).toUpperCase()).filter(Boolean), key = S.name + '|' + aspect + '|' + words.join('/') + '|' + D.title;
    let cv = EDC.get(key); if (cv) return cv; cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'), ink = S.ink;
    // big words: blurred, very faint, stacked like the lyric sheet
    g.save(); try { g.filter = 'blur(5px)'; } catch (_) {} g.fillStyle = rgba(ink, 0.16); g.textBaseline = 'alphabetic';
    const bs = port ? 150 : 132; words.forEach((wd, i) => { g.font = `800 ${bs}px ${DISPLAY}`; const tw = g.measureText(wd).width, sx = Math.min(1, (W - 60) / tw); g.save(); g.translate(30, (port ? 420 : 300) + i * bs * (port ? 2.6 : 2.2)); g.scale(sx, 1); g.fillText(wd, 0, 0); g.restore(); });
    g.restore();
    // registration hairlines + crosshairs (a seeded but static grid)
    const R = (n) => hash(n * 12.9898 + D.title.length * 7.7), xs = [0.18, 0.47, 0.83].map((q, i) => Math.round(W * (q + (R(i) - 0.5) * 0.06)) + 0.5), ys = [0.24, 0.51, 0.77].map((q, i) => Math.round(H * (q + (R(i + 9) - 0.5) * 0.06)) + 0.5);
    g.strokeStyle = rgba(ink, 0.22); g.lineWidth = 1; g.beginPath(); for (const xx of xs) { g.moveTo(xx, 0); g.lineTo(xx, H); } for (const yy of ys) { g.moveTo(0, yy); g.lineTo(W, yy); } g.stroke();
    g.strokeStyle = rgba(ink, 0.5); g.beginPath(); for (const xx of xs) for (const yy of ys) { g.moveTo(xx - 9, yy); g.lineTo(xx + 9, yy); g.moveTo(xx, yy - 9); g.lineTo(xx, yy + 9); } g.stroke();
    // small type: FIG labels at intersections + annotation blocks (tags ground.notes)
    const notes = (tag('ground.notes') || []).map((q) => String(q).toUpperCase());
    let k = 0; for (const xx of xs) for (const yy of ys) { if (R(k + 30) < 0.45) { k++; continue; } g.font = `600 13px ${UI}`; g.fillStyle = rgba(ink, 0.55); g.fillText(`FIG ${String(k + 1).padStart(3, '0')}`, xx + 6, yy - 6);
      const nt = notes[k % Math.max(1, notes.length)]; if (nt) { g.font = `500 11px ${UI}`; g.fillStyle = rgba(ink, 0.38); nt.split('|').forEach((ln, j) => g.fillText(ln.trim(), xx + 6, yy + 16 + j * 14)); } k++; }
    g.font = `800 28px ${DISPLAY}`; g.fillStyle = rgba(ink, 0.3); g.fillText('[01]', xs[1] + 14, ys[2] + 40); g.textAlign = 'right'; g.fillText('07/??', W - 40, ys[0] - 14); g.textAlign = 'left';
    // v22.2 BRUTALIST CHAOS (user refs + cc-dr Nigredo rules: overprint until signs lose authority, misregistration, structure forcing through, no decoration
    // for its own sake: every word is a tag or real data)
    if (V('ground.brutal', true)) {
      // misregistered ghost of the big words (a second pass, offset, no blur)
      g.fillStyle = rgba(ink, 0.07); words.forEach((wd, i) => { g.font = `800 ${bs}px ${DISPLAY}`; const tw = g.measureText(wd).width, sx = Math.min(1, (W - 60) / tw); g.save(); g.translate(30 + 9, (port ? 420 : 300) + i * bs * (port ? 2.6 : 2.2) + 7); g.scale(sx, 1); g.fillText(wd, 0, 0); g.restore(); });
      // overprinted block: the title word repeated until unreadable
      const ow = String(tag('titleWord') || D.title || 'U2C').toUpperCase(), oz = port ? 46 : 40, ox = W * (port ? 0.42 : 0.58), oy = H * (port ? 0.58 : 0.18);
      g.font = `800 ${oz}px ${DISPLAY}`; g.fillStyle = rgba(ink, 0.085); for (let r = 0; r < 7; r++) for (let q = 0; q < 3; q++) g.fillText(ow, ox + q * oz * 2.9 - r * 11, oy + r * oz * 0.58);
      // typewriter-sheet columns: every word of the video as small ruled text (tags), like the lyric sheet
      const lines = [...(tag('social.hooks') || []), tag('social.hook'), ...(tag('social.terminal') || []), ...notes.flatMap((n) => n.split('|')), tag('social.caption'), tag('social.hashtags')].filter(Boolean).map((q) => String(q).toUpperCase());
      g.font = `500 12px ${UI}`; g.fillStyle = rgba(ink, 0.42);
      const col = (x0, y0, n, w0) => { for (let j = 0; j < n; j++) { const ln = lines[(j * 7 + Math.floor(x0)) % lines.length]; g.fillText(ln.length > 46 ? ln.slice(0, 46) : ln, x0, y0 + j * 15, w0); } };
      col(W * 0.56, H * (port ? 0.07 : 0.09), port ? 9 : 7, W * 0.4); col(W * 0.04, H * (port ? 0.81 : 0.72), port ? 7 : 6, W * 0.36); col(W * 0.62, H * (port ? 0.86 : 0.82), 6, W * 0.34);
      // strike-through bars on the second big word
      if (words[1]) { g.fillStyle = rgba(ink, 0.14); const y1 = (port ? 420 : 300) + bs * (port ? 2.6 : 2.2) - bs * 0.32; g.fillRect(24, y1, W * 0.7, 3); g.fillRect(24, y1 + 14, W * 0.46, 2); }
      // vertical pill label (ANGEL "EYES EVERYWHERE")
      const vt = String(tag('ground.vertical') || 'U2C · NO SIMULATION · ©').toUpperCase(), vx = port ? 22 : xs[2] - 20, vy = H * (port ? 0.36 : 0.3); g.save(); g.translate(vx, vy); g.rotate(Math.PI / 2);
      g.font = `600 13px ${UI}`; const vw = g.measureText(vt).width + 28; g.strokeStyle = rgba(ink, 0.4); g.lineWidth = 1.2; g.beginPath(); g.roundRect ? g.roundRect(0, -12, vw, 24, 12) : g.rect(0, -12, vw, 24); g.stroke(); g.fillStyle = rgba(ink, 0.45); g.fillText(vt, 14, 5); g.restore();
      // circled numerals (CORTEX), a barcode of the title, a halftone dot field
      g.lineWidth = 1.2; for (let q = 0; q < 6; q++) { const cx = xs[0] + 40 + (q % 2) * 30, cy = ys[1] + 30 + Math.floor(q / 2) * 30; g.strokeStyle = rgba(ink, 0.35); g.beginPath(); g.arc(cx, cy, 11, 0, 6.2832); g.stroke(); g.font = `700 12px ${DISPLAY}`; g.fillStyle = rgba(ink, 0.45); g.textAlign = 'center'; g.fillText(String([5, 6, 3, 4, 1, 2][q]), cx, cy + 4); g.textAlign = 'left'; }
      if (PL.barcode) PL.barcode(g, S, W - (port ? 250 : 300), H * (port ? 0.955 : 0.94), port ? 200 : 240, 26, D.title || 'U2C', rgba(ink, 0.35));
      for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 14; xx++) { const r0 = 3.4 * (1 - (xx + yy) / 22); if (r0 <= 0.3) continue; g.fillStyle = rgba(ink, 0.16); g.beginPath(); g.arc(W - 40 - xx * 12, H * (port ? 0.2 : 0.45) + yy * 12, r0, 0, 6.2832); g.fill(); }
    }
    EDC.set(key, cv); return cv;
  }
  // v22.2 screen frame (refs: registration + counters): a hairline inset, corner crosses, a live frame counter and the beat clock, FIG labels. Real data only.
  // v22.3 MATRIX DRIFT (user: "like in the Matrix, always going up and down, a bit fucked up"): the editorial layer is cut into vertical columns; each
  // scrolls up or down (seeded direction + 1-2 whole cycles over the composition, so the loop closes), wraps around, and on some kicks a column
  // jolts sideways and vertically for ~80 ms (a hard, deterministic glitch, no fade). TC = composition seconds, LC = composition length.
  let TC = 0, LC = 1;
  function drawEditorial() {
    const cv = editorial(), N = port ? 7 : 10, cw = W / N, sp = V('ground.drift', 1);
    for (let i = 0; i < N; i++) { const dir = hash(i * 3.7 + 1) < 0.5 ? -1 : 1, k = 1 + Math.floor(hash(i * 5.3 + 2) * 2), off0 = ((TC / LC) * k * dir * H * sp) % H;
      const f = Math.floor(TC * FPS), kick = kickEnv[Math.max(0, Math.min(kickEnv.length - 1, Math.floor((TC - PRE) * FPS)))] || 0, jolt = TC > PRE && kick > 0.75 && hash(i * 11.1 + Math.floor(TC * 8)) > 0.7;
      const jx = jolt ? (hash(f * 1.3 + i) - 0.5) * 14 : 0, jy = jolt ? (hash(f * 2.1 + i) - 0.5) * 40 : 0, off = ((off0 + jy) % H + H) % H, sx = i * cw;
      c.drawImage(cv, sx, 0, cw, H, sx + jx, off, cw, H); c.drawImage(cv, sx, 0, cw, H, sx + jx, off - H, cw, H);
      if (V('ground.data', true)) dataRain(i, sx + jx, cw, off); }
    if (V('ground.scan', true)) scanSweep();
  }
  // v22.6 TEST EXPERIMENT (user): the Matrix columns stream the beat's REAL band levels (dB of 6 bands, newest at the column's head), and a scanner
  // line sweeps down the whole frame every 2 bars (beat-locked) leaving a short bright wake. Both deterministic; numbers are measurements, not noise.
  function dataRain(i, x, cw, off) {
    const fz = port ? 13 : 12, rows = Math.ceil(H / (fz * 1.5)) + 1, f0 = Math.max(0, Math.floor(Math.max(0, TC - PRE) * FPS)), FB = F.bands; if (!FB) return;
    c.save(); c.font = `600 ${fz}px ${UI}`; c.textAlign = 'left';
    for (let r = 0; r < rows; r++) { const y = ((off + r * fz * 1.5) % H + H) % H, ff = Math.max(0, f0 - r * 2), bi = (i + r) % 6, v = FB[Math.min(FB.length - 1, ff)][bi], db = 20 * Math.log10(Math.max(1e-4, v)), head = r < 3;
      c.fillStyle = rgba(S.ink, head ? 0.5 - r * 0.12 : 0.13 * (1 - r / rows) + 0.03); c.fillText((db >= 0 ? '+' : '') + db.toFixed(1), x + 6 + (i % 2) * cw * 0.45, y); }
    c.restore();
  }
  function scanSweep() {
    const per = 8 * BEAT, u = ((Math.max(0, TC - PRE)) % per) / per, y = u * H * 1.15 - H * 0.075, g = c.createLinearGradient(0, y - 120, 0, y);
    g.addColorStop(0, rgba(S.ink, 0)); g.addColorStop(1, rgba(S.ink, 0.07)); c.fillStyle = g; c.fillRect(0, y - 120, W, 120); c.fillStyle = rgba(S.ink, 0.35); c.fillRect(0, y, W, 1.5);
  }
  const introGround = () => { if (LOOK === 'player' && V('ground.editorial', true)) drawEditorial(); };
  function brutalFrame(t) {
    if (!V('ground.brutal', LOOK === 'player')) return; const m = 14, ink = S.ink, fz = 12, fr = Math.max(0, Math.round((t + PRE) * FPS)), tot = Math.round((D.duration + PRE) * FPS);
    c.save(); c.strokeStyle = rgba(ink, 0.18); c.lineWidth = 1; c.strokeRect(m + 0.5, m + 0.5, W - 2 * m - 1, H - 2 * m - 1);
    c.strokeStyle = rgba(ink, 0.5); c.beginPath(); for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) { c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.moveTo(x, y - 7); c.lineTo(x, y + 7); } c.stroke();
    text(c, `F ${String(fr).padStart(4, '0')}/${tot}`, m + 12, H - m - 12, { size: fz, fam: UI, w: 600, ls: 1.4, col: rgba(ink, 0.5) });
    text(c, `${bbt(Math.max(0, t))} · ${String(tag('titleWord') || '').toUpperCase()}`, W - m - 12, H - m - 12, { size: fz, fam: UI, w: 600, ls: 1.4, col: rgba(ink, 0.5), align: 'right' });
    text(c, 'FIG 001 · ' + String(tag('player.meta.subject') || 'SUBJECT').toUpperCase(), m + 12, m + 14, { size: fz, fam: UI, w: 600, ls: 1.4, col: rgba(ink, 0.45) });
    // v22.6 live test log (real data): trial, elapsed, kicks so far, status
    if (V('ground.testlog', true)) { const el = Math.max(0, t), kk = (L.kickHits || []).filter((q) => q[0] <= el).length, lines = [`TEST 01 · TRIAL ${String(1 + Math.floor(el / (8 * BEAT))).padStart(2, '0')}`, `T+${tc(el)}`, `KICKS ${String(kk).padStart(3, '0')}`, String(tag('player.meta.status') || 'UNSTABLE').toUpperCase() === 'UNSTABLE' ? 'STATUS: UNSTABLE' : `STATUS: ${String(tag('player.meta.status')).toUpperCase()}`];
      lines.forEach((ln, j) => text(c, ln, m + 12, H - m - 34 - (lines.length - 1 - j) * 16, { size: fz, fam: UI, w: 600, ls: 1.4, col: rgba(ink, j === lines.length - 1 ? 0.6 : 0.42) })); }
    c.restore();
  }
  function ground() {
    c.fillStyle = S.paper; c.fillRect(-W, -H, 3 * W, 3 * H);
    // v11: two soft light pools in the ground (the ink colour, so Nigredo stays grey) give the glass something to blur
    const pool = V('ground.pool', L.isLight(S) ? 0.5 : 1) * (L.isLight(S) ? 0.16 : 0.13);
    if (pool > 0) for (const [px, py, pr] of [[0.2, 0.3, 0.75], [0.85, 0.72, 0.6]]) { const g = c.createRadialGradient(W * px, H * py, 0, W * px, H * py, Math.max(W, H) * pr);
      g.addColorStop(0, rgba(S.ink, pool)); g.addColorStop(1, rgba(S.ink, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    const pat = V('ground.pattern', 'auto'), p = pat === 'auto' ? { lab: 'graph', exe: 'dots', scope: 'scan' }[LOOK] : pat, gA = V('ground.gridA', S.gridA);
    if (p === 'graph') lab.graphPaper(c, 0, 0, W, H, Object.assign({}, S, { gridA: gA }), 20, 100, 1);
    else if (p === 'dots') { c.fillStyle = rgba(S.ink, 0.13 * gA / (S.gridA || 0.07)); for (let y = 30; y < H; y += 40) for (let x = 20; x < W; x += 40) c.fillRect(x, y, 2, 2); }
    else if (p === 'scan') { c.fillStyle = rgba(S.ink, 0.05 * gA / (S.gridA || 0.07)); for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 1); }
    if (LOOK === 'player' && V('ground.editorial', true)) drawEditorial();
  }
  // opt-in glitch: on each beat inside a glitch clip, 3-4 thin horizontal slices shifted sideways for <= 80 ms
  function glitch(t, scale) {
    for (const k of ev.clipsAt('fx.glitch', b)) { const amt = clamp(+k.v || 0); if (amt <= 0) continue;
      const bb = Math.floor(b), age = (b - bb) * BEAT; if (age > 0.08) continue; const e = (1 - age / 0.08) ** 2, cv = c.canvas, w = cv.width, h = cv.height, seed = bb * 7.31 + 3;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const n = 3 + Math.floor(amt * 2.2);
      for (let j = 0; j < n; j++) { const y = Math.floor(hash(seed + j * 1.7) * h * 0.92), hh = Math.max(1, Math.round((3 + 12 * hash(seed + j * 2.9)) * scale * (0.7 + amt))), dx = Math.round(hs(seed, j) * (8 + 34 * hash(seed + j * 4.3)) * scale * (0.4 + 1.6 * amt) * e);
        if (dx) c.drawImage(cv, 0, y, w, hh, dx, y, w, hh); }
      c.restore(); }
  }
  // ---------------------------------------------------------------- per-frame state
  function setState(look, stage) {
    LOOK = LAYOUT[look] ? look : 'exe';
    const over = {}; for (const k of STAGE_COLOR_KEYS) { const v = V('stage.' + k, null); if (v) over[k] = v; }
    S = stageOf(stage, over); LY = {}; IDS = Object.keys(LAYOUT[LOOK][aspect]); for (const id of IDS) LY[id] = rectOf(id);
    L.look = LOOK; L.coverRect = LY.stage || null; L.coverRadius = V('glass.radius', 22);   // the match-cut target is known on intro frames too (not only after the lab drew)
    setVars(); L.pendantMark = LOOK === 'exe' ? (ctx, Sx, cx, cy, d) => BR.elephantMark(ctx, Sx, cx, cy, d, d) : null;
  }
  function pendulum() {
    BR.pendulum((k) => { const st = ev.value('stage', k, 'nigredo'); return ev.value('pendant.amp', k, stageOf(st).swingDeg.calm); }, V('pendant.period', 2), V('pendant.react', 0.32),
      { links: V('pendant.links', 10), wave: V('pendant.wave', 0.75), damp: V('pendant.damp', 0.35) });
  }
  // test modes (native --test pendant | waveform, and the motion / waveform tests): one element alone, no camera or textures
  const testRect = () => (port ? [90, 240, 900, 1480] : [560, 90, 800, 900]);
  const waveRect = () => (port ? [24, 420, 1032, 1000] : [24, 160, 1872, 760]);
  function testMode(kind, t) {
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H); ground();
    if (kind === 'waveform') { const r = waveRect(); c.fillStyle = S.card; c.fillRect(r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16); M.session(c, S, r, t, 1); text(c, `WAVEFORM TEST · ${bbt(t)}`, 40, 120, { size: 28, w: 700, col: S.ink }); return; }
    elephantBody(testRect(), t, 1, S);
    const bb = Math.floor(t / BEAT + 1e-6); text(c, `PENDANT · CHAIN WAVE · beat ${bb + 1} · ${bbt(t)}`, 40, port ? 120 : 50, { size: 28, w: 700, col: S.ink });
  }
  // v14 stage `white` (NIGREDO INVERSE): the finished frame inverted, the same op as the flash (grey in = grey out, so R=G=B holds)
  function invertAll() { const neg = ev.clipsAt('fx.invert', b).some((q) => q.v !== false && q.v !== 0); if (!S.inverse === !neg) return;   // v15: stage inverse XOR the fx.invert clip
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'difference'; c.fillStyle = '#ffffff'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }
  function flash(t) { const f = fidx(t); if (ev.keysIn('fx.flash', 0, NB * 4 + 1).some((k) => fidx(T(k.b) + 0.5 / FPS) === f)) { c.globalCompositeOperation = 'difference'; c.fillStyle = S.grey ? '#ffffff' : S.ink; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; } }
  /** Draw clip time t into ctx (a canvas of width W*scale). opts: {ev, fps (sample at the frame centre), look, stage}. */
  function render(ctx, t, opts = {}) {
    TC = t; LC = D.duration + Math.max(0, opts.preroll || 0);   // v22.3 composition clock for the drifting background
    c = ctx; ev = opts.ev || ev; tagDoc = opts.tags || DEFAULT_TAGS; IB = INTRO.beats(ev);
    const fps = opts.fps || FPS, scale = ctx.canvas.width / W;
    L.view.minPx = LOOK === 'player' && port ? 25 : 0;   // v19.1: phone legibility floor (player 9:16)
    PRE = Math.max(0, opts.preroll || 0); const filmT = t - PRE; let paused = filmT < 0; t = filmT;   // v19.3: negative t = the silent pre-roll browse (intro keys at negative beats)   // v19: click-to-play pre-roll (native passes opts.preroll); filmT < 0 = paused
    t = clamp(t, -PRE, D.duration - 1 / fps) + 0.5 / fps; b = t / BEAT;
    { const b0 = Math.max(0, b); setState(ev.value('look', b0, opts.look || 'exe'), ev.value('stage', b0, opts.stage || 'nigredo')); } pendulum();   // v20: the pre-roll (b < 0) uses the look / stage of beat 0 (the base could be stale in old sheets)
    c.setTransform(scale, 0, 0, scale, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = true;
    if (opts.test) { L.view.camZ = 1; L.view.base = scale; testMode(opts.test, t); c.setTransform(1, 0, 0, 1, 0, 0); return { look: LOOK, stage: S.name, test: opts.test }; }
    // v17.1 seamless loop (player): the final bar plays the intro BACKWARDS (cubic ease-out into t = 0), so the last frame flows into frame 0
    OUTD = LOOK === 'player' && V('outro.mode', 'dialog') === 'dialog';
    RWB = LOOK === 'player' && IB && V('outro.rewind', true) && D.duration > T(IB + 16) ? (OUTD ? D.duration / BEAT - 6 : (D.duration - 2 * BAR) / BEAT) : 0;   // v17.2: 2-bar rewind; v21 dialog outro: the cut back into the intro 6 beats before the end
    RWB0 = RWB;
    if (RWB && OUTD && t >= RWB * BEAT) {
      // v21 OUTRO (user: "a JOIN / CREATE PROJECT pop-up, the cursor presses x, it goes back and it stops"; never glitchy): the dialog lived on the hero (E-11 .. E-9),
      // the camera dollied into the hero cover (E-9 .. E-6, the match cut in reverse); here: on the intro's pushed-in card, ONE zoom out (push 1 -> 0, decelerating,
      // 3 beats), then the cover-flow glides back to its frame-0 card and the fan closes to its frame-0 state (2 beats, ease in-out), the hook dialog springs back in,
      // the player is paused. The intro is drawn at frame-0 time, so the last frame IS frame 0.
      const o = (t - RWB * BEAT) / BEAT, tI = -PRE + 0.5 / fps, bI = tI / BEAT, sm = (u) => { u = clamp(u); return u * u * u * (u * (6 * u - 15) + 10); };
      const idx0 = ev.value('intro.index', bI, 0), ent0 = ev.value('intro.enter', bI, 1), u1 = clamp(o / 3), u2 = sm((o - 3) / 2);
      const OV = { 'intro.push': Math.pow(1 - u1, 3), 'intro.index': lerp(0, idx0, u2), 'intro.enter': lerp(1, ent0, u2), 'intro.select': false };
      if (ev.value('intro.style', bI, 'flow') === 'sphere') { const uP = sm((o - 3) / 1.25), uR = sm((o - 3.5) / 1.5);   // v22: the card flies back into the sphere, the sphere turns back to frame 0
        OV['intro.pick'] = lerp(1, ev.value('intro.pick', bI, 0), uP); OV['intro.type'] = 1 - clamp((o - 2.3) / 0.7); OV['intro.player.opacity'] = lerp(1, ev.value('intro.player.opacity', bI, 1), uR); OV['intro.pitch'] = lerp(ev.value('intro.pitch', 0, 0), ev.value('intro.pitch', bI, 0), uR); OV['intro.yaw'] = lerp(ev.value('intro.yaw', 0, 0), ev.value('intro.yaw', bI, 0), uR); }
      b = bI; const Vo = (pth, d) => (pth in OV ? OV[pth] : V(pth, d));
      L.view.camZ = 1; L.view.base = scale; INTRO.draw(c, tI, { S, V: Vo, ev, tag, W, H, look: LOOK, aspect, paused: true, playerIn: !!PRE, ground: introGround });
      c.setTransform(scale, 0, 0, scale, 0, 0);
      brutalFrame(t); textures(tI); mouse(filmT, null); c.setTransform(1, 0, 0, 1, 0, 0); invertAll();
      return { look: LOOK, stage: S.name, intro: true, index: OV['intro.index'], push: OV['intro.push'], enter: OV['intro.enter'] };
    }
    if (RWB && !OUTD && t >= RWB * BEAT) { const u = clamp((t - RWB * BEAT) / (2 * BAR)), e = 0.5 - 0.5 * Math.cos(Math.PI * u); t = T(IB) - e * (T(IB) + PRE) + 0.5 / fps * (1 - e); if (PRE) t = Math.max(-PRE + 0.5 / fps, t); else t = Math.max(0.5 / fps, t); paused = t < 0; b = t / BEAT; }   // v19.3: rewinds through the browse back to the first frame
    if (IB && t < T(IB)) {   // v11 intro: player + cover-flow + push-in (hard cut into the lab at beat IB); grain / vignette stay on top
      L.view.camZ = 1; L.view.base = scale; INTRO.draw(c, t, { S, V, ev, tag, W, H, look: LOOK, aspect, paused: paused && LOOK === 'player', playerIn: !!PRE && LOOK === 'player', ground: introGround }); c.setTransform(scale, 0, 0, scale, 0, 0); brutalFrame(t); voiceCaptions(t + PRE); social(t, true); textCues(t); textures(t); flash(t); mouse(filmT, null); c.setTransform(1, 0, 0, 1, 0, 0); invertAll();
      return { look: LOOK, stage: S.name, intro: true, index: V('intro.index', 0), push: V('intro.push', 0), enter: V('intro.enter', 1) };
    }
    const cam = camera(), z = cam.z; L.view.camZ = z; L.view.base = scale;
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    c.setTransform(scale * z, 0, 0, scale * z, scale * (W / 2 - cam.x * z), scale * (H / 2 - cam.y * z));
    ground(); L.snap(c, 'ground', LOOK === 'exe' || LOOK === 'player' ? 3 + 4 * V('glass.back', 1) : 3);   // v12: exe glass blurs the ground more (depth)
    const att = attention(t);
    if (LOOK === 'player') playerShell(t);
    // v19.5: the lifted (focused) window leaves its slot: the slot copy fades out as the window rises, so it never shows twice
    let liftId = null, liftAmt = 0; if (LOOK === 'player' && port && V('focus.window', true)) { const s3 = ev.shot(b), id3 = s3.to !== 'wide' ? s3.to : s3.from !== 'wide' ? s3.from : null;
      if (id3 && LY[id3]) { const r3 = LY[id3], syC = (r3[1] + r3[3] / 2 - cam.y) * z + H / 2, hh3 = r3[3] * z / 2; if (syC + hh3 > 1530 || syC - hh3 < 230) { liftId = id3; liftAmt = s3.to !== 'wide' ? (s3.from === s3.to ? 1 : s3.u) : 1 - s3.u; } } }
    for (const id of IDS) { if (id === liftId && liftAmt > 0.01) { if (liftAmt < 0.99) { c.save(); c.globalAlpha = 1 - liftAmt; card(id, t, att === id); c.restore(); } continue; } card(id, t, att === id); }
    // v19.3 window focus (user): a clicked panel comes to the front: everything else sinks behind a scrim, the panel is redrawn on top, 3 % bigger
    if (LOOK === 'player' && V('focus.window', true)) { const s2 = ev.shot(b), id2 = s2.to !== 'wide' ? s2.to : s2.from !== 'wide' ? s2.from : null;
      if (id2 && LY[id2]) { const amt = s2.to !== 'wide' ? (s2.from === s2.to ? 1 : s2.u) : 1 - s2.u; if (amt > 0.01) { const r2 = LY[id2], cx2 = r2[0] + r2[2] / 2, cy2 = r2[1] + r2[3] / 2, sc2 = 1 + 0.03 * amt;
        { const sv = c.getTransform(); dof(amt, 6); c.setTransform(sv); } c.fillStyle = rgba(S.bg, 0.55 * amt * V('focus.dim', 1)); c.fillRect(-W, -H, 3 * W, 3 * H);   // v22.1: the rest goes soft behind the focused window
        // v19.5: a window that rests under the TikTok caption (y > 1548) or the header lifts into the safe band while focused (same spring as the camera)
        let lift = 0; if (port) { const syC = (cy2 - cam.y) * z + H / 2, hh2 = r2[3] * z * sc2 / 2, want = Math.min(Math.max(syC, 230 + hh2), 1530 - hh2); lift = (want - syC) / z * amt; }
        c.save(); c.translate(cx2, cy2 + lift); c.scale(sc2, sc2); c.translate(-cx2, -cy2); card(id2, t, true); c.restore(); } } }
    if (LOOK === 'player' && V('focus.bracket', true)) focusBracket(t);
    hero(t, cam, scale, ev.shot(b));   // v12: logo + pendant over the windows (front layer, soft shadow)
    c.setTransform(scale, 0, 0, scale, 0, 0); L.view.camZ = 1;
    videoDraw('full', 0, 0, W, H);   // v19 video layer, full frame (screen space, over the windows, under halation / overlays)
    if (!L.isLight(S)) L.halation(c, V('fx.halation', 0.16));
    if (L.openFx) INTRO.streak(c, L.openFx.px, L.openFx.py, L.openFx.dl);   // v13 intro: directional streak copies on the opening dolly-out
    result(t); hud(t, ev.shot(b)); brutalFrame(t); social(t, false); outroDialog(t); terminal(t); textCues(t); textures(t); mouse(filmT, cam);
    flash(t);
    glitch(t, scale);
    c.setTransform(1, 0, 0, 1, 0, 0); invertAll();
    return { look: LOOK, stage: S.name, cam, attention: att };
  }
  /** Every scheduled visual event of the current cue sheet (beats + labels), for the sync test and the timeline. */
  function schedule(evx, opts = {}) {
    ev = evx; IB = INTRO.beats(ev); const out = [], add = (bb, what) => { if (bb >= 0 && bb <= NB * 4) out.push({ b: bb, t: T(bb), what }); };
    b = 0; setState(V('look', opts.look || 'exe'), V('stage', opts.stage || 'nigredo'));
    for (const t of ev.tracksOf('camera.shot')) for (const k of t.keys) { if (k.transition !== 'cut') add(k.b - (k.dur ?? 1), `camera push → ${k.v} (start)`); add(k.b, `camera ${k.transition === 'cut' ? 'cut' : 'push'} → ${k.v} (land)`); }
    for (const [bb, w] of INTRO.events(ev)) add(bb, w);   // v11 intro
    for (const id of IDS) { const o = winOpen(id); if (o >= 0) for (let q = 0; q < 6; q++) add(o + q * U.t32, `open ${id} step ${q + 1}`); }
    const ra = resultAt(); for (let q = 0; q < 6; q++) add(ra + q * 0.5, `result line ${q + 1}`);
    for (const [bb, w] of BR.logoEvents(0, NB * 4, Math.max(4, Math.round(V('logo.cycle', 2) * 4)), HOLD(), HOLD_OFF)) add(bb, w);
    if (LOOK === 'exe') for (let q = 0; q < NB * 16; q++) add(q / 4, 'step grid step (16th)');
    if (V('logo.runner', true)) for (let q = 0; q < NB * 16; q++) add(q / 4, 'logo runner step (16th)');
    for (const k of ev.keysIn('fx.flash', 0, NB * 4)) add(k.b, '1-frame invert');
    for (const k of ev.keysIn('text.cue', 0, NB * 4)) add(k.b, `text cue "${String(k.v).slice(0, 24)}"`);
    for (const t of ev.sheet.tracks) if (!['camera.shot', 'text.cue', 'fx.flash'].includes(t.path)) for (const k of t.keys) add(k.b, `${t.path} key`);
    return out.sort((x, y) => x.b - y.b);
  }
  /** Window rects of a look (with the sheet's overrides at beat bb), for hit testing and camera framing in the UI. */
  function rects(evx, bb, look) { ev = evx; IB = INTRO.beats(ev); b = bb; setState(look || V('look', 'exe'), V('stage', 'nigredo')); return { ...LY }; }
  // motion trace in the pendant test geometry (testRect): hand, every joint, every link angle, the body angle
  const trace = (t, evx) => { if (evx) ev = evx; b = 0; pendulum(); const g = pendantGeom(testRect()); return BR.tracePts(g.ax, g.ay, g.size, t + 0.5 / FPS, g.len); };
  return { W, H, D, render, clickTimes, typeEvents, introMarks, schedule, rects, trace, testRect, waveRect, registry: (o = {}) => buildRegistry({ aspect, bars: NB, ...o }), core: L, brand: BR, WINDOW_IDS };
}
export { mergeDeep };
