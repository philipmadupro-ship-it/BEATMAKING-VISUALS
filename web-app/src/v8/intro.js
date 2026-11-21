// v11 INTRO (about 2 bars): a liquid-glass music player playing the beat (now-playing pill with cover thumbnail, title,
// credit, a scrub bar that follows the real audio time), above it a cover-flow carousel of 5 glass cards that steps one
// card per beat (eased snaps that LAND on the beat) and lands on cover-0, then a hard push-in on the chosen cover that
// ends in a hard cut into the lab. No fades anywhere: every element is simply present, the motion is position / scale.
// Owned by the intro agent; film.js calls createIntro(L, assets.intro) once and intro.draw(...) for t < intro length.
//
// Cue-sheet properties (v8/registry.js, CUES.md):
//   intro.on (bool, 0 = no intro)   intro.length (bars)   intro.index (carousel position in cards, eased keys)
//   intro.push (0..1 push-in, exponential zoom)   intro.zoom (max zoom, 0 = fill the frame)   intro.select (bool: corner brackets)
//   intro.player.scale / intro.player.opacity (1 / 1; keyframeable, default static)
//   v13: intro.enter (0..1, default keys 0 -> 1 over beats 0..2): the START. On beat 1 the player rises into place and the cards fan out of
//        one stack into the carousel (staggered, a small overshoot that settles on the beat; nothing is ever static).
//   v13: intro.open (beats, default 2): the lab opens ON the cover: the camera starts at the cover-fill zoom (the exact frame the intro push
//        ends on: a match cut), then dollies out to the wide shot, landing on the beat. Both halves of the zoom carry directional streak
//        copies (a radial motion blur, deterministic, no fades). The cover's rect in the lab is coverTarget(): the lab's `L.coverRect`
//        (compose agent: the glass card in the middle compartment behind the logo) or, until it exists, the compartment centre rect.
// Deterministic: draw(t) is a pure function of t, the sheet and the clip data (no state between frames except caches).
import { clamp, lerp, hexRgb, FONT } from './core.js';
import { LAYOUT, HERO } from './layout.js';

export const INTRO_DISPLAY = FONT.display, INTRO_UI = FONT.ui;   // the shell's font tokens; drop the brand files in assets/fonts to swap
export const COVER_N = 5, TW = 600, TH = 738;   // card texture: square cover (TW) + caption plate (TH - TW)
const GAP_CARD = 14;   // inset of the fallback cover rect inside the compartment (px at scale 1)
/**
 * THE single parameter of the match cut: the rect [x, y, w, h] (frame px at camera zoom 1) the cover card occupies in the lab.
 * Preference: L.coverRect (array or function, set by the lab composition when it draws the cover card in the middle compartment),
 * else the centre rect of the compartment between LEVELS and IMAGER (exe 9:16), else a square on the hero position.
 */
export function coverTarget(L, look, aspect) {
  const cr = L && L.coverRect, r = typeof cr === 'function' ? cr() : cr;
  if (r && r.length === 4 && r.every(Number.isFinite)) return r;
  const R = (LAYOUT[look] || LAYOUT.exe)[aspect] || LAYOUT.exe['916'];
  if (R.loud && R.stereo && aspect === '916') {
    const x0 = R.loud[0] + R.loud[2] + GAP_CARD, x1 = R.stereo[0] - GAP_CARD, y0 = Math.max(R.loud[1], R.stereo[1]), y1 = Math.min(R.loud[1] + R.loud[3], R.stereo[1] + R.stereo[3]);
    return [x0, y0, x1 - x0, y1 - y0];
  }
  const h = HERO[aspect] || HERO['916'], sz = h.logoW * 1.25; return [h.cx - sz / 2, h.cy - sz / 2, sz, sz];
}
/**
 * The cover card's scrim, ONE function for the lab's card and the intro's last push frames (so the match cut is the same picture):
 * a flat darkening (v13: 0.74, the logo must read on top) plus a deeper floor towards the bottom. `amount` 0..1 scales both (the intro push
 * darkens into it, reaching 1 at the cut). Drawn over the rect x,y,w,h (the gradient is anchored to it; the flat part covers whatever is filled).
 */
export const COVER_SCRIM = 0.74, COVER_FLOOR = 0.82;
export function coverScrim(c, S, x, y, w, h, { dim = 1, light = false, amount = 1, fill = null } = {}) {
  const a = Math.min(1, COVER_SCRIM * dim) * amount, f = Math.min(1, COVER_FLOOR * dim) * amount, base = light ? S.card : S.bg, [fx, fy, fw, fh] = fill || [x, y, w, h];
  c.fillStyle = rgba2(base, a); c.fillRect(fx, fy, fw, fh);
  const gr = c.createLinearGradient(0, y + h * 0.55, 0, y + h); gr.addColorStop(0, rgba2(S.bg, 0)); gr.addColorStop(1, rgba2(S.bg, Math.max(0, f - a) / Math.max(1e-6, 1 - a)));
  c.fillStyle = gr; c.fillRect(fx, fy, fw, fh);
  const tl = c.createLinearGradient(0, y, 0, y + h * 0.3); tl.addColorStop(0, `rgba(255,255,255,${0.07 * amount})`); tl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = tl; c.fillRect(fx, fy, fw, fh);   // the glass top light
}
const rgba2 = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** Zoom that makes a rect w x h fill the W x H frame (object-fit: cover). */
/** (v13: 6 % overscan, so the card's rounded corners and hairline are off-frame at the cut; both halves of the zoom use the same number) */
const OVERSCAN = 1.06, fillZoom = (w, h, W, H) => Math.max(W / w, H / h) * OVERSCAN;

// ---------------------------------------------------------------- assets (covers + the two display fonts, all optional)
const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function loadFont(family, base, stem) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  for (const ext of ['otf', 'woff2', 'ttf']) {
    try { const f = new FontFace(family, `url(${base}fonts/${stem}.${ext})`, { weight: '400', style: 'normal' }); await f.load(); document.fonts.add(f); return true; } catch (e) { /* try the next extension, then the fallback stack */ }
  }
  return false;
}
/** Covers (assets/covers/cover-0..4.jpg; null = procedural placeholder) and the fonts. Never throws. */
export async function loadIntroAssets(base = 'assets/') {
  const [covers, akira, synkopy] = await Promise.all([Promise.all([0, 1, 2, 3, 4].map((i) => img(`${base}covers/cover-${i}.jpg`))),
    loadFont('Akira Expanded', base, 'AkiraExpanded'), loadFont('Synkopy', base, 'Synkopy')]);
  return { covers, fonts: { akira, synkopy } };
}

// ---------------------------------------------------------------- small drawing helpers
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const ss = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
let TEXT = null;   // the shell's text() helper (set by createIntro): numbers in Akira, words in Synkopy, '@' / '%' in the fallback face
function tx(c, s, x, y, size, fam, col, align = 'left', maxW = 0, ls = 0) {
  const o = { size, col, align, maxW, ls }; if (fam === INTRO_DISPLAY) o.fam = FONT.display;   // UI voice = text()'s default (mixed runs)
  TEXT(c, s, x, y, o);
}
function boxBlur(d, w, h, r) {   // separable box blur on RGBA ImageData, 3 passes ~ gaussian; deterministic integer maths
  const t = new Float32Array(d.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) for (let ch = 0; ch < 3; ch++) { let acc = 0, n = 0; for (let x = -r; x <= r; x++) { acc += d[(y * w + clamp(x, 0, w - 1) * 1) * 4 + ch]; n++; }
      for (let x = 0; x < w; x++) { t[(y * w + x) * 4 + ch] = acc / n; acc += d[(y * w + Math.min(w - 1, x + r + 1)) * 4 + ch] - d[(y * w + Math.max(0, x - r)) * 4 + ch]; } }
    for (let x = 0; x < w; x++) for (let ch = 0; ch < 3; ch++) { let acc = 0, n = 0; for (let y = -r; y <= r; y++) { acc += t[(clamp(y, 0, h - 1) * w + x) * 4 + ch]; n++; }
      for (let y = 0; y < h; y++) { d[(y * w + x) * 4 + ch] = acc / n; acc += t[(Math.min(h - 1, y + r + 1) * w + x) * 4 + ch] - t[(Math.max(0, y - r) * w + x) * 4 + ch]; } }
  }
}


// ---------------------------------------------------------------- directional motion blur (radial streak copies about the zoom pivot)
// The frame is snapshotted and re-drawn n times, each copy scaled by up to exp(dl) about the pivot (px, py) at 1/(k+1) alpha, i.e. the
// equal-weight average of n sub-frame renders of the zoom. Copies only ever scale UP, so they cover the frame (no dark edge). Pure function
// of (frame, dl): deterministic. dl = the natural-log scale change over (almost) one frame time.
let SNAP = null;
export function streak(c, px, py, dl) {
  if (!(dl > 0.004)) return;
  const cv = c.canvas, sc = c.getTransform().a;
  if (!SNAP || SNAP.width !== cv.width || SNAP.height !== cv.height) SNAP = mk(cv.width, cv.height);
  const g = SNAP.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, SNAP.width, SNAP.height); g.drawImage(cv, 0, 0);
  const n = clamp(Math.ceil(dl / 0.012) + 1, 2, 16), PX = px * sc, PY = py * sc;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true;
  for (let k = 1; k < n; k++) { const s = Math.exp(dl * k / (n - 1)); c.globalAlpha = 1 / (k + 1); c.setTransform(s, 0, 0, s, PX * (1 - s), PY * (1 - s)); c.drawImage(SNAP, 0, 0); }
  c.restore();
}
const easeOut3 = (u) => 1 - Math.pow(1 - clamp(u), 3);
const backOut = (u, k = 1.1) => { u = clamp(u); const c3 = k + 1; return 1 + c3 * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2); };

/** createIntro(L, assets): the intro's drawing; L = the shared core (v8/core.js createCore), assets = loadIntroAssets() result (or undefined). */
export function createIntro(L, A = {}) {
  TEXT = L.text; const { D, BEAT, BAR, T, U, steps, kickEnv, fidx, F } = L, covers = (A && A.covers) || [], CACHE = new Map();
  const song = D.song, total = song.duration || 120;
  // ---- stage-mapped covers: Nigredo = pure grey; other stages = luminance mapped through the stage ramp (spec stops, dark to light)
  function ramp(S) {
    if (S.grey) return null;
    const st = S.spec.map(hexRgb).sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2])); return st;
  }
  function coverCanvas(i, S) {
    const key = `cv${i}|${S.name}`; let cv = CACHE.get(key); if (cv) return cv;
    cv = mk(TW, TW); const g = cv.getContext('2d'), im = covers[i];
    if (im) { const s = Math.max(TW / im.width, TW / im.height); g.drawImage(im, (TW - im.width * s) / 2, (TW - im.height * s) / 2, im.width * s, im.height * s); }
    else {   // procedural placeholder: rings + a diagonal sweep, seeded by the card index
      const gr = g.createLinearGradient(0, 0, TW, TW); gr.addColorStop(0, '#202020'); gr.addColorStop(1, '#8a8a8a'); g.fillStyle = gr; g.fillRect(0, 0, TW, TW);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; for (let k = 1; k < 7; k++) { g.beginPath(); g.arc(TW * (0.3 + 0.1 * i), TW * 0.55, k * 48, 0, 7); g.stroke(); }
    }
    const d = g.getImageData(0, 0, TW, TW), px = d.data, R = ramp(S);
    for (let p = 0; p < px.length; p += 4) {
      const lum = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) / 255;
      if (!R) { const v = Math.round(255 * Math.pow(lum, 1.08)); px[p] = px[p + 1] = px[p + 2] = v; }
      else { const f = lum * (R.length - 1), j = Math.min(R.length - 2, Math.floor(f)), k = f - j; for (let q = 0; q < 3; q++) px[p + q] = Math.round(R[j][q] + (R[j + 1][q] - R[j][q]) * k); }
    }
    g.putImageData(d, 0, 0); CACHE.set(key, cv); return cv;
  }
  // blurred colour bloom of a cover (48 x 48, three box passes), the light the whole scene sits in
  function bloomCanvas(i, S) {
    const key = `bl${i}|${S.name}`; let cv = CACHE.get(key); if (cv) return cv;
    const N = 48; cv = mk(N, N); const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(coverCanvas(i, S), 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N); boxBlur(d.data, N, N, 5); g.putImageData(d, 0, 0);
    let sum = 0; for (let p = 0; p < d.data.length; p += 4) sum += (d.data[p] + d.data[p + 1] + d.data[p + 2]) / 765;
    cv.lum = sum / (N * N); CACHE.set(key, cv); return cv;
  }
  // card texture: cover + glass caption plate (title, credit), hairline rim; and its reflection (flipped, faded)
  function cardTex(i, S, title, credit) {
    const key = `ct${i}|${S.name}|${title}|${credit}`; let t = CACHE.get(key); if (t) return t;
    const cv = mk(TW, TH), g = cv.getContext('2d'), r = 36, py = TW, ph = TH - TW;
    g.save(); rr(g, 0, 0, TW, TH, r); g.clip();
    g.drawImage(coverCanvas(i, S), 0, 0, TW, TW);
    g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, py, TW, ph);
    const gp = g.createLinearGradient(0, py, 0, TH); gp.addColorStop(0, 'rgba(255,255,255,0.17)'); gp.addColorStop(1, 'rgba(255,255,255,0.05)'); g.fillStyle = gp; g.fillRect(0, py, TW, ph);
    g.fillStyle = 'rgba(255,255,255,0.34)'; g.fillRect(0, py, TW, 1.5);
    if (title) { tx(g, title, TW / 2, py + ph * 0.40, 36, INTRO_DISPLAY, S.ink, 'center', TW - 70, 1);
      tx(g, credit, TW / 2, py + ph * 0.74, 27, INTRO_UI, 'rgba(255,255,255,0.66)', 'center', TW - 70); }   // only the chosen cover is captioned
    g.restore();
    const rim = g.createLinearGradient(0, 0, TW, TH); rim.addColorStop(0, 'rgba(255,255,255,0.62)'); rim.addColorStop(0.5, 'rgba(255,255,255,0.16)'); rim.addColorStop(1, 'rgba(255,255,255,0.34)');
    g.strokeStyle = rim; g.lineWidth = 2.4; rr(g, 1.2, 1.2, TW - 2.4, TH - 2.4, r); g.stroke();
    const RH = Math.round(TH * 0.42), rf = mk(TW, RH), h = rf.getContext('2d');
    h.save(); h.translate(0, TH); h.scale(1, -1); h.drawImage(cv, 0, 0); h.restore();   // flipped: its top rows are the card's bottom rows
    h.globalCompositeOperation = 'destination-in'; const gm = h.createLinearGradient(0, 0, 0, RH); gm.addColorStop(0, 'rgba(0,0,0,0.5)'); gm.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = gm; h.fillRect(0, 0, TW, RH);
    t = { tex: cv, refl: rf, RH }; CACHE.set(key, t); return t;
  }

  // ---- geometry per aspect (logical px of the W x H frame)
  function geom(W, H) {
    if (H >= W) return { cx: W / 2, cy: 860, cw: 660, xs1: 470, xs2: 300, pl: [32, 1403, W - 64, 190], top: 92, dy1: 40 };
    return { cx: W / 2, cy: 440, cw: 380, xs1: 260, xs2: 190, pl: [(W - 1180) / 2, 862, 1180, 136], top: 54, dy1: 26 };
  }
  // ---- liquid glass panel: soft shadow, frosted body (the bloom again, brighter, clipped inside), inner highlight, hairline edge
  function glass(c, S, bloomFx, x, y, w, h, r, o = {}) {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = o.shadow ?? 46; c.shadowOffsetY = (o.shadow ?? 46) * 0.45; c.fillStyle = 'rgba(14,14,14,0.55)'; rr(c, x, y, w, h, r); c.fill(); c.restore();
    c.save(); rr(c, x, y, w, h, r); c.clip();
    bloomFx(0.5 * (o.frost ?? 1));
    const gb = c.createLinearGradient(0, y, 0, y + h); gb.addColorStop(0, `rgba(255,255,255,${o.dark ? 0.05 : 0.15})`); gb.addColorStop(1, `rgba(255,255,255,${o.dark ? 0.02 : 0.05})`); c.fillStyle = gb; c.fillRect(x, y, w, h);
    if (o.dark) { c.fillStyle = 'rgba(0,0,0,0.34)'; c.fillRect(x, y, w, h); }
    const sp = c.createRadialGradient(x + w * 0.18, y, 0, x + w * 0.18, y, w * 0.55); sp.addColorStop(0, 'rgba(255,255,255,0.20)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sp; c.fillRect(x, y, w, h * 0.9);
    c.restore();
    const hl = c.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,255,255,0.62)'); hl.addColorStop(0.35, 'rgba(255,255,255,0.10)'); hl.addColorStop(1, 'rgba(255,255,255,0.26)');
    c.strokeStyle = hl; c.lineWidth = 1.6; rr(c, x + 0.8, y + 0.8, w - 1.6, h - 1.6, r); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1; rr(c, x + 3.5, y + 3.5, w - 7, h - 7, Math.max(2, r - 3)); c.stroke();
  }
  function icon(c, kind, x, y, s, col) {   // transport icons: prev, next, pause (vector, centred on x,y)
    c.fillStyle = col; c.beginPath();
    if (kind === 'pause') { rr(c, x - s * 0.48, y - s * 0.55, s * 0.34, s * 1.1, s * 0.07); c.fill(); c.beginPath(); rr(c, x + s * 0.14, y - s * 0.55, s * 0.34, s * 1.1, s * 0.07); c.fill(); return; }
    const d = kind === 'next' ? 1 : -1;
    for (const o of [-0.42, 0.42]) { const x0 = x + o * s * d * 0.9; c.moveTo(x0 - d * s * 0.46, y - s * 0.46); c.lineTo(x0 + d * s * 0.46, y); c.lineTo(x0 - d * s * 0.46, y + s * 0.46); c.closePath(); }
    c.fill();
  }
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /** intro length in beats for the current sheet (0 = off) */
  function beats(ev) { return ev.value('intro.on', 0, true) === false ? 0 : Math.max(0, Math.round(ev.value('intro.length', 0, 2) * 4)); }

  /** Draw the intro at clip time t. o = { S (stage), V (path, default -> value at this beat), ev, tag, W, H, look, aspect } */
  function draw(c, t, o) {
    const { S, V, W, H, ev } = o, g = geom(W, H), b = t / BEAT, f = fidx(t), kick0 = kickEnv[f];
    const title = o.tag('intro.title') || D.title, credit = o.tag('intro.credit') || 'prod. @uche2crazy', names = o.tag('intro.cards');
    const pos = V('intro.index', 0), push = clamp(V('intro.push', 0)), kick = kick0 * (1 - push);   // the kick punch dies out as the push lands (exact match cut)
    // v13 match cut: the push ends with the cover filling the frame EXACTLY as the lab's cover card does at the lab's opening zoom
    const tgt = coverTarget(L, o.look, o.aspect), zf = o.look === 'player' ? Math.min(W / tgt[2], H / tgt[3]) : fillZoom(tgt[2], tgt[3], W, H), zmax = V('intro.zoom', 0) || Math.max(tgt[2], tgt[3]) * zf / g.cw;
    // v13 start: enter 0 -> 1 over the first 2 beats (linear keys; the shapes live here): the cards fan out of one stack and land on beat 2
    // (index 1 of the 4), the player rises into place and lands on beat 3. Without the key (old sheets) enter = 1 = the carousel as it was.
    const enter = clamp(V('intro.enter', 1)), fanU = clamp(enter * 2), playerE = easeOut3(enter), groupS = lerp(0.6, 1, backOut(fanU, 0.8));
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    // blurred bloom of the cards near the centre (pulses with the kick): the light the glass is made of
    const wts = []; for (let i = 0; i < COVER_N; i++) { const od = ((((i - pos + 2.5) % 5) + 5) % 5) - 2.5, w = Math.max(0, 1 - Math.abs(od)); if (w > 0) wts.push([i, w]); }
    // the cover is only a soft, low-intensity glow behind the centre card: every bloom is normalised to the same mean luminance
    // (a bright cover never lifts the frame), kept small, and a vignette to the stage ground closes the edges
    const bloomA = (0.30 + 0.07 * kick) * (0.45 + 0.55 * fanU), bs = Math.max(W, H) * 0.62, REF = 0.14;
    const bloom = (k) => { c.save(); for (const [i, w] of wts) { const bc = bloomCanvas(i, S); c.globalAlpha = clamp(w * bloomA * k * Math.min(1.6, REF / Math.max(0.05, bc.lum))); c.drawImage(bc, g.cx - bs * 0.5, g.cy - bs * 0.5, bs, bs); } c.restore(); };
    c.save();
    // push-in: exponential zoom about the chosen cover's centre; the pivot glides to the frame centre so the cover ends centred, filling the frame
    const cardH = g.cw * TH / TW, coverCy = g.cy - cardH / 2 + g.cw / 2, Z = Math.exp(Math.log(zmax) * push), gk = ss(push * 1.4);
    const pvx = lerp(g.cx, W / 2, gk), pvy = lerp(coverCy, H / 2, gk);
    c.translate(pvx, pvy); c.scale(Z, Z); c.translate(-g.cx, -coverCy);
    // the fan-out also scales the whole group about the carousel centre
    c.save(); c.translate(g.cx, g.cy); c.scale(groupS, groupS); c.translate(-g.cx, -g.cy);
    bloom(1);
    { const vg = c.createRadialGradient(g.cx, g.cy, bs * 0.12, g.cx, g.cy, bs * 0.5); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, S.bg); c.fillStyle = vg; c.fillRect(g.cx - bs * 0.5 - 2, g.cy - bs * 0.5 - 2, bs + 4, bs + 4); }
    // top readouts (real data): tempo / key and the bar.beat counter
    if (push < 0.02) {
      tx(c, `${Math.round(D.bpm)} BPM  ${D.key}`, g.pl[0] + 8, g.top, 20, INTRO_DISPLAY, 'rgba(255,255,255,0.62)', 'left', 0, 1); tx(c, L.bbt(t), W - g.pl[0] - 8, g.top, 20, INTRO_DISPLAY, 'rgba(255,255,255,0.62)', 'right', 0, 1);
    }
    // ---- cover-flow
    const items = []; for (let i = 0; i < COVER_N; i++) items.push([i, ((((i - pos + 2.5) % 5) + 5) % 5) - 2.5]); items.sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
    const d3 = g.cw * 1.6;
    const mtx = c.getTransform(), dev = Math.hypot(mtx.a, mtx.b);   // device px per logical px: strips are ~3 device px wide (cheap in small previews)
    for (const [i, od0] of items) {
      // fan-out: the card's offset from the centre grows from 0 (one stack) to its place; outer cards start a touch later, all land with fanU = 1
      const a00 = Math.abs(od0), fan = backOut(fanU * 1.3 - 0.1 * a00, 0.9), od = od0 * fan;
      const a0 = Math.abs(od), sg = Math.sign(od) || 1, near = 1 - ss(a0 / 0.6);
      const k = (1 - 0.2 * Math.min(a0, 1) - 0.1 * clamp(a0 - 1, 0, 1)) * clamp((2.5 - a0) / 0.4) * (1 + (0.022 * kick) * near);
      if (k <= 0.001) continue;
      const x = g.cx + sg * (Math.min(a0, 1) * g.xs1 + clamp(a0 - 1, 0, 1.5) * g.xs2), y = g.cy + g.dy1 * Math.min(a0, 1) + 22 * clamp(a0 - 1, 0, 1);
      const ang = sg * (0.78 * Math.min(a0, 1) + 0.16 * clamp(a0 - 1, 0, 1)), w = g.cw * k, h = w * TH / TW, hw = w / 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const nm = names[i] != null ? String(names[i]) : title, ct = cardTex(i, S, nm, credit), n = clamp(Math.ceil(w * dev / 3), 6, 320), shade = 0.52 * Math.min(a0, 1) + 0.12 * clamp(a0 - 1, 0, 1);
      for (let j = 0; j < n; j++) {
        const u0 = -hw + w * j / n, u1 = -hw + w * (j + 1) / n, s0 = d3 / (d3 + u0 * sa), s1 = d3 / (d3 + u1 * sa), sm = (s0 + s1) / 2, xa = x + u0 * ca * s0, xb = x + u1 * ca * s1, hh = h * sm, top = y - hh / 2;
        c.drawImage(ct.tex, j * TW / n, 0, TW / n, TH, xa, top, xb - xa + 0.7, hh);
        if (shade > 0.004) { c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(xa, top, xb - xa + 0.7, hh); }
        c.globalAlpha = 0.30 * (1 - 0.5 * Math.min(a0, 1)); c.drawImage(ct.refl, j * TW / n, 0, TW / n, ct.RH, xa, top + hh + 8 * sm, xb - xa + 0.7, hh * ct.RH / TH); c.globalAlpha = 1;
      }
    }
    // selection: four corner brackets step in around the chosen card (32nd-note steps), like the lab's attention bracket
    const sk = selectKey(ev, b);
    if (sk && sk.key.v && push < 0.5) {
      const n = steps(t, sk.key.b, 4, U.t32), w = g.cw * (1 + 0.022 * kick), h = w * TH / TW, gap = 12 + (4 - n) * 10, L0 = 38, x0 = g.cx - w / 2 - gap, x1 = g.cx + w / 2 + gap, y0 = g.cy - h / 2 - gap, y1 = g.cy + h / 2 + gap;
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 3; c.beginPath();
      for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { c.moveTo(px + sx * L0, py); c.lineTo(px, py); c.lineTo(px, py + sy * L0); }
      c.stroke();
    }
    c.restore();   // end of the fan-out group scale
    // ---- player: liquid-glass bar (transport, now-playing pill with cover thumb + title + credit + scrub bar, level bars)
    const ps = V('intro.player.scale', 1), pa = clamp(V('intro.player.opacity', 1));
    if (pa > 0.001) {
      const psE = ps * (0.88 + 0.12 * playerE), rise = (1 - playerE) * (H - g.pl[1] + 40);   // v13: the player rises from below the frame into place
      const [px0, py0, pw0, ph0] = g.pl, pw = pw0 * psE, ph = ph0 * psE, px = px0 + (pw0 - pw) / 2, py = py0 + (ph0 - ph) / 2 + rise, v = psE * ph0 / 150, hz = psE;   // v: vertical / type scale, hz: horizontal
      c.save(); c.globalAlpha = pa;
      glass(c, S, bloom, px, py, pw, ph, ph / 2);
      const cy = py + ph / 2, ink = 'rgba(255,255,255,0.92)';
      icon(c, 'prev', px + 96 * hz, cy, 30 * v, ink); icon(c, 'pause', px + 182 * hz, cy, 40 * v, ink); icon(c, 'next', px + 268 * hz, cy, 30 * v, ink);
      const x0 = px + 348 * hz, x1 = px + pw - 200 * hz, y0 = py + 17 * v, y1 = py + ph - 17 * v;
      glass(c, S, bloom, x0, y0, x1 - x0, y1 - y0, 30 * v, { dark: true, shadow: 0, frost: 0.4 });
      const th = 76 * v, tX = x0 + 16 * v, tY = (y0 + y1) / 2 - th / 2 - 6 * v;
      c.save(); rr(c, tX, tY, th, th, 16 * v); c.clip(); c.drawImage(coverCanvas(0, S), tX, tY, th, th); c.restore(); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1.2; rr(c, tX, tY, th, th, 16 * v); c.stroke();
      const tx0 = tX + th + 20 * v, tw = x1 - tx0 - 20 * v;
      tx(c, title, tx0, tY + 22 * v, 25 * v, INTRO_DISPLAY, S.ink, 'left', tw, 0.5); tx(c, credit, tx0, tY + 57 * v, 23 * v, INTRO_UI, 'rgba(255,255,255,0.66)', 'left', tw);
      const sy = y1 - 17 * v, sx0 = tx0, sx1 = x1 - 22 * v, prog = clamp(((song.startTime || 0) + t) / total);
      c.fillStyle = 'rgba(255,255,255,0.24)'; rr(c, sx0, sy - 2.5 * v, sx1 - sx0, 5 * v, 2.5 * v); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.92)'; rr(c, sx0, sy - 2.5 * v, Math.max(5 * v, (sx1 - sx0) * prog), 5 * v, 2.5 * v); c.fill();
      c.beginPath(); c.arc(sx0 + (sx1 - sx0) * prog, sy, 7 * v, 0, 7); c.fill();
      // right: elapsed time (real audio position), Akira
      tx(c, mmss((song.startTime || 0) + t), px + pw - 40 * hz, cy, 26 * v, INTRO_DISPLAY, ink, 'right', 0, 1);
      c.restore();
    }
    c.restore();
    // v13: the push darkens into the lab's cover scrim (the same function, anchored where the lab's card lands at the cut), so the cut shows no brightness jump
    if (push > 0) { const sa = ss(push), [rx, ry, rw, rh] = tgt, K = zf; coverScrim(c, S, W / 2 - rw * K / 2, H / 2 - rh * K / 2, rw * K, rh * K, { dim: V('cover.dim', 1), light: false, amount: sa, fill: [0, 0, W, H] }); }
    // v13: directional motion blur on the zoom: the scale change over the last frame time (the same exponential zoom at t - 0.9 frame)
    const pPrev = clamp(ev.value('intro.push', (t - 0.9 / D.fps) / BEAT, 0)), dl = Math.log(zmax) * (push - pPrev);
    if (dl > 0) streak(c, pvx, pvy, dl);
  }
  // selection brackets: an explicit intro.select key, else they step in where the push starts (first intro.push key)
  function selectKey(ev, b) {
    const k = ev.lastKey('intro.select', b); if (k) return k;
    const pt = ev.tracksOf('intro.push')[0]; return pt && pt.keys.length && b >= pt.keys[0].b - 1e-9 ? { key: { b: pt.keys[0].b, v: true } } : null;
  }
  /**
   * v13: the lab's opening dolly (the second half of the zoom through the cover). Called by film.camera() with the normal camera `cam`
   * ({x, y, z}: usually the wide shot) at beat b. During intro.open beats after the cut (default 2) the camera starts framing the cover card
   * (the coverTarget rect fills the frame: the same picture the intro push ended on) and eases out (cubic ease-out, exponential zoom) to `cam`.
   * Returns null outside that window, else {x, y, z, dl, px, py}: the camera, the ln-scale change over the last frame (for streak()) and the
   * screen position of the cover centre (the streak pivot).
   */
  function openCam(b, ev, IB, cam, o) {
    const open = ev.value('intro.open', 0, 2); if (!IB || !(open > 0) || b < IB - 1e-9 || b >= IB + open) return null;
    const [tx0, ty0, tw, th] = coverTarget(L, o.look, o.aspect), cx = tx0 + tw / 2, cy = ty0 + th / 2, zf = o.look === 'player' ? Math.min(o.W / tw, o.H / th) : fillZoom(tw, th, o.W, o.H);
    const e = (bb) => easeOut3((bb - IB) / open), ee = e(b), z = Math.exp(lerp(Math.log(zf), Math.log(cam.z), ee)), x = lerp(cx, cam.x, ee), y = lerp(cy, cam.y, ee);
    const uu = (b - IB) / open, dl = Math.log(zf / cam.z) * 3 * (1 - uu) * (1 - uu) / open * (0.9 / D.fps / BEAT);   // d(ease)/db x one frame: full blur on the first lab frame too
    return { x, y, z, dl, px: o.W / 2 + (cx - x) * z, py: o.H / 2 + (cy - y) * z };
  }
  /** Events for the sync test / the timeline (beats): the enter, the selection steps, the hard cut into the lab, the dolly-out landing. */
  function events(ev) {
    const out = [], ib = beats(ev); if (!ib) return out;
    const et = ev.tracksOf('intro.enter')[0]; if (et && et.keys.length > 1) out.push([et.keys[et.keys.length - 1].b, 'intro enter lands (cards fanned, player in place)']);
    out.push([ib, 'intro → lab hard cut']);
    const sk = selectKey(ev, ib); if (sk && sk.key.v) for (let q = 0; q < 4; q++) out.push([sk.key.b + q * U.t32, `intro select bracket step ${q + 1}`]);
    const op = ev.value('intro.open', 0, 2); if (op > 0) out.push([ib + op, 'lab dolly-out lands']);
    return out;
  }
  return { draw, beats, events, geom, cardTex, coverCanvas, openCam, streak, coverTarget: (look, aspect) => coverTarget(L, look, aspect) };
}
