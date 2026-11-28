// LAYER PREVIEW: a small floating panel over the studio with one thumbnail per layer (each window, the DAW window, the MPC pads) and the final
// composite, to see the parts separately without leaving the design. Cheap by construction: the thumbnails are CROPS of the canvas the studio has
// already drawn (no extra full-size render), at most 160 px wide, refreshed at 4-5 fps, only for tiles that are scrolled into view, only when the
// frame changed, and not at all while the panel is collapsed or closed or the tab is hidden. It is DOM, so it is never part of a recording or export.
// Click a tile: select that layer. Hover: outline it on the canvas. Eye: show / hide the window (cue prop win.<id>.visible). Solo: hide every other
// window until un-soloed (their previous visibility is restored). State (open, collapsed, position, solo) is kept in localStorage.
export const TILE_W = 160, FPS = 5, KEY = 'u2c.layerpreview';
export const cropOf = (p, vw, vh) => ({ x: p.l / 100 * vw, y: p.t / 100 * vh, w: p.w / 100 * vw, h: p.h / 100 * vh });   // percent box -> canvas pixels
export const tileSize = (cw, ch) => { const k = Math.min(1, TILE_W / Math.max(1, cw)); return [Math.max(1, Math.round(cw * k)), Math.max(1, Math.round(ch * k))]; };
export function createLayerPreview(app) {
  let st = { open: false, collapsed: false, x: 14, y: 90, solo: '' }; try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };
  const el = document.createElement('div'); el.id = 'u2cLayerPreview'; el.hidden = true;
  el.style.cssText = 'position:fixed;z-index:9500;width:196px;max-height:70vh;font:11px/1.3 ui-monospace,monospace;background:#111e;color:#eee;border:1px solid #555;border-radius:8px;backdrop-filter:blur(6px);display:flex;flex-direction:column';
  el.innerHTML = '<div data-h style="cursor:move;padding:5px 8px;display:flex;gap:6px;align-items:center;user-select:none"><b>Layers</b><span style="opacity:.55">preview</span><span style="margin-left:auto;cursor:pointer" data-c title="Collapse">▾</span><span style="cursor:pointer" data-x title="Close">×</span></div><div data-list style="overflow:auto;padding:0 8px 8px;display:grid;gap:6px"></div>';
  document.body.appendChild(el);
  const list = el.querySelector('[data-list]'), tiles = new Map(); let timer = 0, lastSig = '', force = true;
  const place = () => { el.style.left = Math.max(0, Math.min(innerWidth - 60, st.x)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 40, st.y)) + 'px'; };
  const view = () => document.getElementById('view');
  const reg = () => { try { return app.registry().elements.filter((e) => e.id.startsWith('win.')); } catch (_) { return []; } };
  const ph = () => (app.cuetl ? app.cuetl.state.playhead : 0);
  const visOf = (id) => { try { return app.cues.ev().value(`win.${id}.visible`, ph(), true) !== false; } catch (_) { return true; } };
  function entries() {
    const out = [{ id: '*', label: 'Composite', kind: 'all' }];
    for (const e of reg()) out.push({ id: e.id.slice(4), label: e.label.replace(/\s*\(.*\)$/, ''), kind: 'win' });
    if (globalThis.u2cVideoLayer) out.push({ id: '@daw', label: 'DAW window', kind: 'daw' });
    if (app.mpc) out.push({ id: '@pads', label: 'MPC pads', kind: 'pads' });
    return out;
  }
  function build() {
    const E = entries(), sig = E.map((e) => e.id).join(); if (sig === build.sig) return; build.sig = sig; list.innerHTML = ''; tiles.clear();
    for (const e of E) {
      const row = document.createElement('div'); row.dataset.lid = e.id; row.style.cssText = 'display:grid;gap:2px';
      const cv = document.createElement('canvas'); cv.width = TILE_W; cv.height = 90; cv.style.cssText = 'width:100%;background:#000;border:1px solid #444;border-radius:4px;cursor:pointer;display:block';
      const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;align-items:center';
      bar.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${String(e.label).replace(/[<>&]/g, '')}</span>` + (e.kind === 'win' ? '<button data-eye title="Show / hide" style="cursor:pointer">eye</button><button data-solo title="Solo" style="cursor:pointer">solo</button>' : '');
      row.append(cv, bar); list.appendChild(row); tiles.set(e.id, { e, cv, row, g: cv.getContext('2d') });
    }
    force = true;
  }
  function paintBtns() { for (const [id, t] of tiles) if (t.e.kind === 'win') { const eye = t.row.querySelector('[data-eye]'), so = t.row.querySelector('[data-solo]'); eye.style.opacity = visOf(id) ? 1 : 0.4; eye.textContent = visOf(id) ? 'eye' : 'off'; so.style.background = st.solo === id ? '#fa4' : ''; so.style.color = st.solo === id ? '#000' : ''; } }
  const inView = (t) => { const a = t.row.getBoundingClientRect(), b = list.getBoundingClientRect(); return a.bottom > b.top && a.top < b.bottom; };
  function draw(t, v, rects, cam) {
    const { cv, g, e } = t; let sx = 0, sy = 0, sw = v.width, sh = v.height;
    if (e.kind === 'win') { const r = rects[e.id]; if (!r || !cam) { g.clearRect(0, 0, cv.width, cv.height); return; } const p = cam(r), c = cropOf(p, v.width, v.height); sx = c.x; sy = c.y; sw = c.w; sh = c.h; }
    if (e.kind === 'daw') { const vl = globalThis.u2cVideoLayer; if (!vl) return; const [w, h] = tileSize(vl.w, vl.h); cv.width = w; cv.height = h; try { g.drawImage(vl.src, 0, 0, w, h); } catch (_) {} return; }
    if (e.kind === 'pads') { cv.width = 80; cv.height = 80; g.fillStyle = '#000'; g.fillRect(0, 0, 80, 80); (app.mpc ? app.mpc.pads : []).forEach((p, i) => { g.fillStyle = p.blob ? (p.color || '#888') : '#333'; g.fillRect((i % 4) * 20 + 1, Math.floor(i / 4) * 20 + 1, 18, 18); }); return; }
    if (sw < 1 || sh < 1) return; const [w, h] = tileSize(sw, sh); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    g.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
  }
  function refresh() {
    if (el.hidden || st.collapsed || document.hidden) return; const v = view(); if (!v) return; build();
    let rects = {}, cam = null; try { rects = app.studio.rects(); cam = app.studio.toScreen; } catch (_) {}
    const sig = [app.clock.time().toFixed(2), Object.values(rects).map((r) => r.join(',')).join(';'), v.width, st.solo, Object.keys(rects).map(visOf).join(''), globalThis.u2cVideoLayer ? Math.floor(performance.now() / 200) : 0].join('|');
    if (sig === lastSig && !force) return; lastSig = sig; force = false; paintBtns();
    for (const t of tiles.values()) if (inView(t)) draw(t, v, rects, cam);
  }
  const loop = () => { clearInterval(timer); timer = el.hidden || st.collapsed ? 0 : setInterval(refresh, 1000 / FPS); };
  function apply() { el.hidden = !st.open; list.hidden = st.collapsed; el.querySelector('[data-c]').textContent = st.collapsed ? '▸' : '▾'; place(); force = true; loop(); if (!el.hidden) refresh(); save(); }
  document.addEventListener('visibilitychange', () => { force = true; });
  // solo: hide the others, restore them afterwards
  let was = {};
  function setSolo(id) {
    const ids = [...tiles.keys()].filter((k) => tiles.get(k).e.kind === 'win');
    if (st.solo) { for (const k of ids) if (k in was) app.actions.setProp(`win.${k}.visible`, was[k]); was = {}; }
    if (id && id !== st.solo) { for (const k of ids) { was[k] = visOf(k); app.actions.setProp(`win.${k}.visible`, k === id); } st.solo = id; } else st.solo = '';
    force = true; save(); setTimeout(() => { refresh(); paintBtns(); }, 60); if (app.studio && app.studio.markDirty) app.studio.markDirty();
  }
  list.addEventListener('click', (e) => { const row = e.target.closest('[data-lid]'); if (!row) return; const id = row.dataset.lid;
    if (e.target.matches('[data-eye]')) { app.actions.setProp(`win.${id}.visible`, !visOf(id)); force = true; setTimeout(() => { refresh(); paintBtns(); }, 60); }
    else if (e.target.matches('[data-solo]')) setSolo(id);
    else if (tiles.get(id) && tiles.get(id).e.kind === 'win' && app.studio) app.studio.select(id); });
  list.addEventListener('pointerover', (e) => { const row = e.target.closest('[data-lid]'); if (app.studio && app.studio.hover) app.studio.hover(row && tiles.get(row.dataset.lid) && tiles.get(row.dataset.lid).e.kind === 'win' ? row.dataset.lid : null); });
  list.addEventListener('pointerleave', () => { if (app.studio && app.studio.hover) app.studio.hover(null); });
  el.querySelector('[data-x]').onclick = () => { st.open = false; apply(); syncBtn(); };
  el.querySelector('[data-c]').onclick = () => { st.collapsed = !st.collapsed; apply(); };
  el.querySelector('[data-h]').addEventListener('pointerdown', (e) => { if (e.target.matches('[data-c],[data-x]')) return; const ox = e.clientX - st.x, oy = e.clientY - st.y;
    const mv = (m) => { st.x = m.clientX - ox; st.y = m.clientY - oy; place(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  // toolbar toggle (next to Guides)
  const g = document.getElementById('guidesBtn'); let btn = null;
  if (g && g.parentElement) { btn = document.createElement('button'); btn.className = 'btn small'; btn.id = 'layerPreviewBtn'; btn.textContent = 'Layers'; btn.title = 'Layer preview: each layer on its own'; btn.setAttribute('aria-pressed', 'false'); g.parentElement.before(btn); btn.onclick = () => api.toggle(); }
  const syncBtn = () => { if (btn) btn.setAttribute('aria-pressed', String(st.open)); const d = document.querySelector('#u2cDaw [data-lp]'); if (d) d.setAttribute('aria-pressed', String(st.open)); };
  const api = { toggle(on) { st.open = on == null ? !st.open : !!on; apply(); syncBtn(); }, solo: setSolo, refresh: () => { force = true; refresh(); }, el, get state() { return st; }, get fps() { return FPS; }, get running() { return !!timer; } };
  apply(); syncBtn(); return api;
}
