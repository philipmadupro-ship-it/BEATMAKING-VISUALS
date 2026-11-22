// v21 WORKSPACE: resizable side panels (drag the column edges or focus them and press ← →), collapsible side panels
// (the two panel buttons in the viewer bar, Cmd/Ctrl+Alt+[ / ]), remembered per browser. The phone layout (stacked) ignores all of it.
const $ = (s) => document.querySelector(s);
const KEY = 'u2c.workspace.v1', LIM = { left: [160, 420], right: [280, 560] };
export function createWorkspace(app) {
  const studio = $('#studio');
  let ws = { left: 0, right: 0, noLeft: false, noRight: false };
  try { ws = { ...ws, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ws)); } catch {} };
  function apply() {
    if (ws.left) studio.style.setProperty('--left-w', ws.left + 'px'); else studio.style.removeProperty('--left-w');
    if (ws.right) studio.style.setProperty('--right-w', ws.right + 'px'); else studio.style.removeProperty('--right-w');
    studio.classList.toggle('no-left', !!ws.noLeft); studio.classList.toggle('no-right', !!ws.noRight);
    $('#leftToggle').setAttribute('aria-pressed', String(!ws.noLeft)); $('#rightToggle').setAttribute('aria-pressed', String(!ws.noRight));
    for (const [id, side] of [['#gripL', 'left'], ['#gripR', 'right']]) { const g = $(id), w = side === 'left' ? $('#layers').getBoundingClientRect().width : $('.panel').getBoundingClientRect().width;
      g.setAttribute('aria-valuenow', String(Math.round(w))); g.setAttribute('aria-valuemin', String(LIM[side][0])); g.setAttribute('aria-valuemax', String(LIM[side][1])); }
    if (app.studio && !studio.hidden) requestAnimationFrame(() => app.studio.layout());
  }
  const clampW = (side, w) => Math.max(LIM[side][0], Math.min(LIM[side][1], Math.round(w)));
  function grip(el, side) {
    let x0 = null, w0 = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; w0 = (side === 'left' ? $('#layers') : $('.panel')).getBoundingClientRect().width; el.setPointerCapture(e.pointerId); document.body.classList.add('col-resizing'); });
    el.addEventListener('pointermove', (e) => { if (x0 == null) return; const dx = e.clientX - x0; ws[side] = clampW(side, side === 'left' ? w0 + dx : w0 - dx); apply(); });
    const end = () => { if (x0 == null) return; x0 = null; document.body.classList.remove('col-resizing'); save(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => { ws[side] = 0; apply(); save(); });
    el.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const cur = (side === 'left' ? $('#layers') : $('.panel')).getBoundingClientRect().width, d = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 16 : -16);
      ws[side] = clampW(side, cur + d); apply(); save(); });
  }
  grip($('#gripL'), 'left'); grip($('#gripR'), 'right');
  const toggle = (side, on) => { const k = side === 'left' ? 'noLeft' : 'noRight'; ws[k] = on == null ? !ws[k] : !on; apply(); save(); };
  $('#leftToggle').addEventListener('click', () => toggle('left'));
  $('#rightToggle').addEventListener('click', () => toggle('right'));
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { e.preventDefault(); toggle(e.code === 'BracketLeft' ? 'left' : 'right'); } });
  apply();
  return { toggle, get state() { return { ...ws }; }, setWidth(side, w) { ws[side] = w ? clampW(side, w) : 0; apply(); save(); }, reset() { ws = { left: 0, right: 0, noLeft: false, noRight: false }; apply(); save(); } };
}
