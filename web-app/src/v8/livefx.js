// Live DAW layer: reactions to what the plugin measures in real time (hits, MIDI notes, per-track sends).
// State lives on globalThis.u2cLive (written by bridge/daw.js, read by the film every frame); every entry carries `at`, the
// performance.now() time the sound happened (already corrected by the sample position the plugin stamps on it).
// Each reaction has cue properties (live.<what>.on / .amt), so it is switchable and keyable like everything else.
//   kick  -> the logo glow / cover pulse envelope (the same one the analysed kicks drive) + a faint frame lift
//   snare -> a short brightness flash over the frame
//   hat   -> sparkles
//   MIDI notes (from the plugin's MIDI input): a layer with cue props midi.* - roll (falling notes) or pads (4x4 hit pads), and optionally the same pulses
//   sends (U2C Send instances, one per DAW track), each assigned a target in the DAW panel: pulses (its hits act like master hits),
//   shake (bass level shakes the camera), glow (mid level lights the frame)
const G = globalThis;
export const live = () => (G.u2cLive = G.u2cLive || { on: false, hits: [], notes: [], midi: [], sends: {}, meters: null, lat: 0 });
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Record a hit event (strengths 0..1, 0 = none) that happened at performance.now() time `at`. */
export function addHit(h, at) {
  const L = live(); L.hits.push({ at, kick: h.kick || 0, snare: h.snare || 0, hat: h.hat || 0, seed: at });
  const cut = at - 2500; while (L.hits.length && L.hits[0].at < cut) L.hits.shift();
}
function env(key, now, tau) { const L = live(); let m = 0;
  for (let i = L.hits.length - 1; i >= 0; i--) { const h = L.hits[i], d = (now - h.at) / 1000; if (d > tau * 9) break; if (d < 0 || !h[key]) continue; m = Math.max(m, Math.max(0.55, h[key]) * Math.exp(-d / tau)); }
  return m; }
const on = (V, w) => V(`live.${w}.on`, true) !== false;

/** Kick envelope 0..1 for the logo glow / cover pulse (0 unless the live layer is on and the kick reaction enabled). */
export function kickEnv(V, now = performance.now()) { const L = live(); if (!L.on || !on(V, 'kick')) return 0; return Math.min(1.5, env('kick', now, V('logo.decay', 0.17)) * V('live.kick.amt', 1)); }

/** MIDI note on/off (vel 0..1) that happened at performance.now() time `at`. A note stays held until its off (or 20 s). */
export function addMidi(m, at) {
  const L = live();
  if (m.on) { L.notes.push({ note: m.note, vel: m.vel, ch: m.ch || 0, t0: at, t1: null }); if (L.notes.length > 400) L.notes.shift(); }
  else for (let i = L.notes.length - 1; i >= 0; i--) { const n = L.notes[i]; if (n.note === m.note && (n.ch || 0) === (m.ch || 0) && n.t1 == null) { n.t1 = Math.max(n.t0, at); break; } }
}
/** Every held note ends (host stopped). */
export function releaseNotes(at = performance.now()) { for (const n of live().notes) if (n.t1 == null) n.t1 = Math.max(n.t0, at); }
function drawMidi(c, W, H, V, S, rgba, now) {
  const L = live(); if (V('midi.on', true) === false || !L.notes.length) return;
  const win = V('midi.window', 3) * 1000, cut = now - win - 200; while (L.notes.length && (L.notes[0].t1 ?? now) < cut && L.notes[0].t0 < cut) L.notes.shift();
  for (const n of L.notes) if (n.t1 == null && now - n.t0 > 20000) n.t1 = now;
  if (!L.notes.length) return;
  const bx = V('midi.x', 0.06) * W, by = V('midi.y', 0.12) * H, bw = V('midi.w', 0.88) * W, bh = V('midi.h', 0.76) * H, col = S.grey ? '#ffffff' : S.hot || S.ink, style = V('midi.style', 'roll');
  c.save(); c.globalAlpha = Math.max(0, Math.min(1, V('midi.opacity', 0.85))); c.beginPath(); c.rect(bx, by, bw, bh); c.clip();
  if (style === 'pads') {
    const cw = bw / 4, ch = bh / 4, lit = new Array(16).fill(0);
    for (const n of L.notes) { const p = n.note >= 36 && n.note < 52 ? n.note - 36 : n.note % 16, a = n.t1 == null ? 1 : Math.exp(-Math.max(0, now - n.t1) / 220); lit[p] = Math.max(lit[p], a * (0.35 + 0.65 * n.vel)); }
    for (let p = 0; p < 16; p++) { const x = bx + (p % 4) * cw, y = by + (3 - Math.floor(p / 4)) * ch;
      c.fillStyle = rgba(S.ink, 0.08); c.fillRect(x + 6, y + 6, cw - 12, ch - 12); if (lit[p] > 0.02) { c.fillStyle = rgba(col, Math.min(1, lit[p])); c.fillRect(x + 6, y + 6, cw - 12, ch - 12); } }
  } else {
    let lo = 127, hi = 0; for (const n of L.notes) { lo = Math.min(lo, n.note); hi = Math.max(hi, n.note); }
    lo = Math.max(0, Math.min(lo - 2, 60 - 12)); hi = Math.min(127, Math.max(hi + 2, 72 + 12)); const kw = bw / (hi - lo + 1);
    c.strokeStyle = rgba(S.ink, 0.12); c.lineWidth = 1; for (let k = lo; k <= hi; k += 12) { const x = bx + (k - lo) * kw; c.beginPath(); c.moveTo(x, by); c.lineTo(x, by + bh); c.stroke(); }
    for (const n of L.notes) { const y0 = by + (now - (n.t1 == null ? now : n.t1)) / win * bh, y1 = by + (now - n.t0) / win * bh;
      if (y1 < by || y0 > by + bh) continue; const a = 1 - Math.min(1, (now - n.t0) / win) * 0.7;
      c.fillStyle = rgba(col, Math.min(1, a * (0.4 + 0.6 * n.vel))); c.fillRect(bx + (n.note - lo) * kw + 1, Math.max(by, y0), Math.max(2, kw - 2), Math.max(3, Math.min(by + bh, y1) - Math.max(by, y0))); }
  }
  c.restore();
}
export const SEND_TARGETS = ['off', 'pulses', 'shake', 'glow'];
/** Replace the live send state from the plugin's `sends` list. cfg[id] = {target, off (ms), name, color}; `now` is performance.now(). */
export function updateSends(list, cfg, now = performance.now()) {
  const L = live(), seen = {};
  for (const e of list) { const c = cfg[e.id] || {}, tg = c.target || 'off', at = now - (c.off || 0), b = e.bands || [], sum = (a, z) => { let v = 0; for (let i = a; i <= z; i++) v += b[i] || 0; return v; };
    seen[e.id] = 1; L.sends[e.id] = { id: e.id, name: c.name || e.name, color: c.color || '', target: tg, at, rms: e.rms || 0, peak: e.peak || 0, bands: b, bass: Math.min(1, sum(0, 3) * 2.5), mid: Math.min(1, sum(3, 6) * 3) };
    if (tg === 'pulses' && (e.kick || e.snare || e.hat)) addHit({ kick: e.kick, snare: e.snare, hat: e.hat }, at); }
  for (const id of Object.keys(L.sends)) if (!seen[id]) delete L.sends[id];
}
const sendEnv = (key, target, now) => { let m = 0; for (const e of Object.values(live().sends)) { if (e.target !== target) continue; const d = Math.max(0, now - e.at); if (d < 1000) m = Math.max(m, e[key] * Math.exp(-d / 90)); } return m; };
/** Camera shake offset [dx, dy] (logical px) from the sends assigned to `shake`, or null. */
export function shake(V, now = performance.now()) {
  const L = live(); if (!L.on || V('live.send.on', true) === false) return null;
  const v = sendEnv('bass', 'shake', now) * V('live.send.amt', 1); if (v < 0.03) return null;
  const k = Math.floor(now / 33); return [(hash(k) - 0.5) * 2 * 26 * v, (hash(k + 99.1) - 0.5) * 2 * 26 * v];
}
export function draw(c, W, H, V, S, rgba, now = performance.now()) {
  const L = live(); if (!L.on) return;
  drawMidi(c, W, H, V, S, rgba, now);
  c.save();
  if (on(V, 'kick')) { const k = env('kick', now, 0.12) * V('live.kick.amt', 1); if (k > 0.02) { c.fillStyle = rgba('#ffffff', Math.min(0.5, 0.07 * k)); c.fillRect(0, 0, W, H); } }
  if (on(V, 'snare')) { const s = env('snare', now, 0.06) * V('live.snare.amt', 1); if (s > 0.02) { c.fillStyle = rgba(S.grey ? '#ffffff' : S.ink, Math.min(0.8, 0.32 * s)); c.fillRect(0, 0, W, H); } }
  if (on(V, 'hat')) { const amt = V('live.hat.amt', 1);
    for (let i = L.hits.length - 1; i >= 0; i--) { const h = L.hits[i], d = (now - h.at) / 1000; if (d > 0.35) break; if (d < 0 || !h.hat) continue;
      const a = Math.exp(-d / 0.11) * h.hat * amt, n = Math.round(10 * Math.min(1.5, amt));
      for (let j = 0; j < n; j++) { const x = hash(h.seed + j * 3.1) * W, y = hash(h.seed + j * 7.7) * H, r = (6 + 18 * hash(h.seed + j * 1.9)) * (0.6 + a);
        c.strokeStyle = rgba(S.grey ? '#ffffff' : S.hot || S.ink, Math.min(1, a)); c.lineWidth = 2; c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke(); } } }
  if (V('live.send.on', true) !== false) { const g = sendEnv('mid', 'glow', now) * V('live.send.amt', 1);
    if (g > 0.02) { const r = Math.max(W, H) * 0.7, gr = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r); gr.addColorStop(0, rgba(S.grey ? '#ffffff' : S.hot || S.ink, Math.min(0.6, 0.4 * g))); gr.addColorStop(1, rgba(S.hot || S.ink, 0)); c.fillStyle = gr; c.fillRect(0, 0, W, H); } }
  c.restore();
}
