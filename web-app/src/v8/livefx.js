// Live DAW layer: reactions to what the plugin measures in real time (hits, MIDI notes, per-track sends).
// State lives on globalThis.u2cLive (written by bridge/daw.js, read by the film every frame); every entry carries `at`, the
// performance.now() time the sound happened (already corrected by the sample position the plugin stamps on it).
// Each reaction has cue properties (live.<what>.on / .amt), so it is switchable and keyable like everything else.
//   kick  -> the logo glow / cover pulse envelope (the same one the analysed kicks drive) + a faint frame lift
//   snare -> a short brightness flash over the frame
//   hat   -> sparkles
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

export function draw(c, W, H, V, S, rgba, now = performance.now()) {
  const L = live(); if (!L.on) return;
  c.save();
  if (on(V, 'kick')) { const k = env('kick', now, 0.12) * V('live.kick.amt', 1); if (k > 0.02) { c.fillStyle = rgba('#ffffff', Math.min(0.5, 0.07 * k)); c.fillRect(0, 0, W, H); } }
  if (on(V, 'snare')) { const s = env('snare', now, 0.06) * V('live.snare.amt', 1); if (s > 0.02) { c.fillStyle = rgba(S.grey ? '#ffffff' : S.ink, Math.min(0.8, 0.32 * s)); c.fillRect(0, 0, W, H); } }
  if (on(V, 'hat')) { const amt = V('live.hat.amt', 1);
    for (let i = L.hits.length - 1; i >= 0; i--) { const h = L.hits[i], d = (now - h.at) / 1000; if (d > 0.35) break; if (d < 0 || !h.hat) continue;
      const a = Math.exp(-d / 0.11) * h.hat * amt, n = Math.round(10 * Math.min(1.5, amt));
      for (let j = 0; j < n; j++) { const x = hash(h.seed + j * 3.1) * W, y = hash(h.seed + j * 7.7) * H, r = (6 + 18 * hash(h.seed + j * 1.9)) * (0.6 + a);
        c.strokeStyle = rgba(S.grey ? '#ffffff' : S.hot || S.ink, Math.min(1, a)); c.lineWidth = 2; c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke(); } } }
  c.restore();
}
