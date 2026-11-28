// MPC: a small 4x4 pad sampler on the side of the studio. Dropped sounds (e.g. slices from Edison / Slicex) land on the next free pad.
// Pads play on click, on keys (1-4 / Q-R / A-F / Z-V, row by row, while the panel is open) and on MIDI notes 36-51 from the plugin's MIDI input.
// Each pad has a name, a colour and a pulse target (off / kick / snare / hat): a hit drives the visuals like a drum hit does. Pads are kept in IndexedDB.
import { addHit, live as liveState } from '../v8/livefx.js';
export const KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
export const TARGETS = ['off', 'kick', 'snare', 'hat'];
export const padForKey = (k) => KEYS.indexOf(String(k).toLowerCase());
export const padForNote = (n) => (n >= 36 && n < 52 ? n - 36 : ((n % 16) + 16) % 16);
export const nextFree = (pads) => pads.findIndex((p) => !p || !p.blob);
export const padColor = (i) => `hsl(${(i * 47 + 20) % 360} 70% 58%)`;
const hex = (c) => { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = c; return g.fillStyle; };
const DB = 'u2c-mpc';
const open = () => new Promise((res, rej) => { try { const q = indexedDB.open(DB, 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } });
async function kv(mode, fn) { const db = await open(); try { return await new Promise((res, rej) => { const t = db.transaction('kv', mode), r = fn(t.objectStore('kv')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); } finally { db.close(); } }

export function createMpc(app) {
  const pads = Array.from({ length: 16 }, (_, i) => ({ name: '', color: '', target: 'off', blob: null })), bufs = new Map();
  let sel = 0, ctx = null, collapsed = true;   // starts as a small tab so it never covers the timeline
  const audio = () => { if (!ctx) ctx = (app.clock && app.clock.ctx) || new (window.AudioContext || window.webkitAudioContext)(); return ctx; };
  const save = async () => { try { await kv('readwrite', (s) => s.put(pads.map((p) => ({ name: p.name, color: p.color, target: p.target, blob: p.blob })), 'pads')); } catch (_) {} };
  async function buffer(i) { if (bufs.has(i)) return bufs.get(i); const p = pads[i]; if (!p.blob) return null; const ab = await p.blob.arrayBuffer(), b = await audio().decodeAudioData(ab); bufs.set(i, b); return b; }
  async function addSound(blob, name = 'sound', at = nextFree(pads)) {
    if (at < 0) at = sel;   // all pads full: replace the selected one
    pads[at] = { name: String(name).replace(/\.[a-z0-9]+$/i, '').slice(0, 14), color: pads[at].color || padColor(at), target: pads[at].target || 'off', blob }; bufs.delete(at); sel = at; render(); await save(); return at;
  }
  async function play(i, vel = 1) {
    const p = pads[i]; if (!p || !p.blob) return; flash(i);
    if (p.target !== 'off') { liveState().on = !(app.store && app.store.session.exporting); addHit({ [p.target]: Math.max(0.4, Math.min(1, vel)) }, performance.now()); if (app.studio && app.studio.markDirty) app.studio.markDirty(); }
    try { const c = audio(); if (c.state === 'suspended') await c.resume(); const b = await buffer(i); if (!b) return; const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = Math.max(0.1, Math.min(1, vel)); s.connect(g); g.connect(c.destination); s.start(); } catch (_) {}
  }
  const midi = (m) => { if (m && m.on) play(padForNote(m.note), m.vel || 0.8); };
  // ---- UI
  const el = document.createElement('div'); el.id = 'u2cMpc';
  el.style.cssText = 'position:fixed;left:6px;top:46%;z-index:9000;font:12px/1.3 ui-monospace,monospace;background:#111e;color:#eee;border:1px solid #555;border-radius:8px;padding:6px 8px;backdrop-filter:blur(6px);user-select:none';
  document.body.appendChild(el);
  const esc = (x) => String(x).replace(/[<>&"]/g, '');
  function render() {
    const p = pads[sel];
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;cursor:pointer" data-h><b>MPC</b><span style="opacity:.6">${collapsed ? 'drop sounds here' : 'drop sounds on a pad'}</span><span style="margin-left:auto" data-t>${collapsed ? '▸' : '▾'}</span></div>` + (collapsed ? '' :
      `<div data-g style="display:grid;grid-template-columns:repeat(4,58px);gap:4px;margin-top:6px">${pads.map((q, i) => `<button data-p="${i}" title="${KEYS[i].toUpperCase()}" style="height:44px;cursor:pointer;border-radius:5px;border:${i === sel ? '2px solid #fff' : '1px solid #666'};background:${q.blob ? (q.color || padColor(i)) + '55' : '#ffffff0d'};color:#fff;font:10px ui-monospace,monospace;overflow:hidden;padding:2px"><span style="opacity:.55">${KEYS[i].toUpperCase()}</span><br>${esc(q.name)}</button>`).join('')}</div>
      <div style="display:flex;gap:4px;margin-top:6px;align-items:center"><input data-n value="${esc(p.name)}" placeholder="name" size="8"><input type="color" data-c value="${hex(p.color || padColor(sel))}" style="width:22px;height:22px;padding:0;border:0"><select data-x title="Pulse target">${TARGETS.map((t) => `<option${t === p.target ? ' selected' : ''}>${t}</option>`).join('')}</select><button data-k title="Clear this pad">×</button></div>`);
  }
  function flash(i) { const b = el.querySelector(`[data-p="${i}"]`); if (b) { b.style.filter = 'brightness(2)'; setTimeout(() => { b.style.filter = ''; }, 90); } }
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-h]')) { collapsed = !collapsed; render(); return; }
    const b = e.target.closest('[data-p]'); if (b) { sel = +b.dataset.p; if (e.shiftKey || !pads[sel].blob) render(); else { render(); play(sel); } return; }
    if (e.target.closest('[data-k]')) { pads[sel] = { name: '', color: '', target: 'off', blob: null }; bufs.delete(sel); render(); save(); }
  });
  el.addEventListener('change', (e) => { const p = pads[sel];
    if (e.target.matches('[data-n]')) p.name = e.target.value.slice(0, 14); else if (e.target.matches('[data-c]')) p.color = e.target.value; else if (e.target.matches('[data-x]')) p.target = e.target.value; else return; render(); save(); });
  window.addEventListener('keydown', (e) => {
    if (collapsed || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return; const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const i = padForKey(e.key); if (i >= 0) { e.preventDefault(); sel = i; play(i); } });
  render();
  (async () => { try { const s = await kv('readonly', (st) => st.get('pads')); if (Array.isArray(s)) s.slice(0, 16).forEach((q, i) => { if (q) pads[i] = { name: q.name || '', color: q.color || '', target: q.target || 'off', blob: q.blob || null }; }); render(); } catch (_) {} })();
  return { addSound, play, midi, pads, el, get selected() { return sel; }, setCollapsed(v) { collapsed = !!v; render(); } };
}
