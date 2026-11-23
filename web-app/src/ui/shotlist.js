// v23 SHOT LIST (Look tab, under the presets; Premiere's "sequence" idea for the camera): every camera stop of the current preset in time
// order. Drag a row (or use the arrows) to change the ORDER of the windows: the times stay on the grid, the windows move between them. Change a
// stop's window from its menu, × removes it, "+ Stop at playhead" adds one. Every change is one undo step and marks the camera track as yours
// (a preset switch keeps it). Click the time to jump there.
import { newId } from '../cues/schema.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const WIN_NAMES = { wide: 'Wide (whole desktop)', stage: 'Hero card', session: 'Waveform', inserts: 'Rack', spectrum: 'Spectrum', stereo: 'Imager (orbit)', loud: 'Levels', meta: 'Metadata', spectro: 'Spectrogram', eq: 'EQ', chains: 'Logo chain', elephant: 'Pendant', surface: '3D surface' };
export function createShotList(app) {
  const root = $('#shotList'); if (!root) return null;
  const cam = (s) => s.tracks.find((t) => t.path === 'camera.shot');
  let drag = -1;
  function ids() { const R = app.registry(); return ['wide', ...R.elements.filter((e) => e.id.startsWith('win.')).map((e) => e.id.slice(4))]; }
  function render() {
    const t = cam(app.cues.sheet), K = t ? t.keys.filter((k) => k.b >= 0) : [], all = ids(), bbt = (b) => (app.cuetl ? app.cuetl.bbt(b) : b);
    root.innerHTML = `<ol class="shots" aria-label="Camera stops in order">${K.map((k, i) => `<li class="shot-row" draggable="true" data-i="${i}" data-tip="Camera stop ${i + 1}|Drag to change the order; the time stays, the window moves.|">
      <span class="grip" aria-hidden="true">⋮⋮</span><button class="btn tiny mono" data-go="${k.b}" aria-label="Go to ${bbt(k.b)}">${bbt(k.b)}</button>
      <select class="inp small" data-win="${i}" aria-label="Window for stop ${i + 1}">${all.map((id) => `<option value="${id}"${id === k.v ? ' selected' : ''}>${esc(WIN_NAMES[id] || id)}</option>`).join('')}</select>
      <span class="hint">${k.dur ?? 1} b</span><button class="ib sm" data-up="${i}" aria-label="Move stop ${i + 1} earlier"${i ? '' : ' disabled'}>↑</button><button class="ib sm" data-dn="${i}" aria-label="Move stop ${i + 1} later"${i < K.length - 1 ? '' : ' disabled'}>↓</button><button class="ib sm" data-del="${i}" aria-label="Remove stop ${i + 1}">×</button></li>`).join('')}</ol>
      <div class="inrow"><button class="btn small" id="shotAdd" data-tip="Add a stop|A camera visit at the playhead (snapped to the bar), to the hero card.|">+ Stop at playhead</button><button class="btn small" id="shotShuffle" data-tip="Shuffle|A new seeded order of the same windows at the same times.|">Shuffle order</button><span class="hint">${K.length} stops · ${t && !t.auto ? 'edited (kept on preset change)' : 'from the preset'}</span></div>`;
  }
  const keysOf = (s) => cam(s).keys.filter((k) => k.b >= 0);
  function permute(fn, why) { app.cues.edit((s) => { const t = cam(s); if (!t) return; t.auto = false; const K = keysOf(s), vals = K.map((k) => k.v), out = fn(vals); K.forEach((k, i) => { k.v = out[i]; }); }, why); }
  const move = (a, b) => permute((v) => { const o = v.slice(), [x] = o.splice(a, 1); o.splice(b, 0, x); return o; }, 'reorder shots');
  root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go != null) { const tr = app.store.session.track; if (tr) app.actions.seek(app.store.project.inT + +b.dataset.go * tr.spb); }
    else if (b.dataset.up != null) move(+b.dataset.up, +b.dataset.up - 1);
    else if (b.dataset.dn != null) move(+b.dataset.dn, +b.dataset.dn + 1);
    else if (b.dataset.del != null) app.cues.edit((s) => { const t = cam(s), k = keysOf(s)[+b.dataset.del]; t.auto = false; t.keys = t.keys.filter((q) => q !== k); }, 'remove shot');
    else if (b.id === 'shotAdd') app.cues.edit((s) => { let t = cam(s); if (!t) { t = { id: newId('t'), path: 'camera.shot', kind: 'shot', lane: 'camera', auto: false, keys: [] }; s.tracks.push(t); } t.auto = false; const bb = Math.max(4, Math.round((app.cuetl ? app.cuetl.state.playhead : 0) / 4) * 4);
      t.keys = t.keys.filter((q) => Math.abs(q.b - bb) > 1e-6); t.keys.push({ id: newId(), b: bb, v: 'stage', transition: 'push', dur: 2, ease: 'spring' }); t.keys.sort((x, y) => x.b - y.b); }, 'add shot');
    else if (b.id === 'shotShuffle') permute((v) => { const o = v.slice(); let seed = (Date.now() & 0xffff) + 1; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }, 'shuffle shots'); });
  root.addEventListener('change', (e) => { const el = e.target; if (el.dataset.win == null) return; const i = +el.dataset.win; app.cues.edit((s) => { const t = cam(s); t.auto = false; keysOf(s)[i].v = el.value; }, 'shot window'); });
  root.addEventListener('dragstart', (e) => { const li = e.target.closest('.shot-row'); if (!li) return; drag = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(drag)); } catch (_) {} li.classList.add('dragging'); });
  root.addEventListener('dragover', (e) => { const li = e.target.closest('.shot-row'); if (!li || drag < 0) return; e.preventDefault(); root.querySelectorAll('.shot-row').forEach((x) => x.classList.toggle('over', x === li)); });
  root.addEventListener('drop', (e) => { const li = e.target.closest('.shot-row'); if (!li || drag < 0) return; e.preventDefault(); const to = +li.dataset.i, from = drag; drag = -1; if (to !== from) move(from, to); });
  root.addEventListener('dragend', () => { drag = -1; root.querySelectorAll('.shot-row').forEach((x) => x.classList.remove('over', 'dragging')); });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved' && !root.contains(document.activeElement)) render(); });
  render();
  return { refresh: render };
}
