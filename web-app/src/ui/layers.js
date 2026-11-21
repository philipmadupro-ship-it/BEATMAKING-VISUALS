// Layers: the left rail of the studio. One row per element of the current look, straight from the registry: every
// window (waveform, spectrum, imager, levels ...) with an eye that opens / closes it (win.<id>.visible), then the brand
// pieces (hero, logo, pendant) and the scene controls (camera, FX ...). Click a row to edit it in the inspector and to
// box it on the preview. Rows with keys on the timeline carry a diamond. Arrow keys move between rows.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const BRAND = ['hero', 'logo', 'pendant'];
const SCENE = ['scene', 'camera', 'focus', 'intro', 'ground', 'overlays', 'fx', 'stagecol', 'text'];
const EYE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z"/><circle cx="7" cy="7" r="1.6" fill="currentColor" stroke="none"/></svg>';
const EYE_OFF = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" opacity=".4"/><path d="M2 12L12 2"/></svg>';

export function createLayers(app, root, hooks = {}) {
  const count = document.getElementById('layerCount');
  let sig = '';
  function model() {
    const R = app.registry(), beat = app.cuetl ? app.cuetl.state.playhead : 0, ev = app.cues.ev();
    const animated = new Set(app.cues.sheet.tracks.filter((t) => t.keys.length).map((t) => t.path));
    const row = (e, win) => ({ id: e.id, label: e.label.replace(/\s*\(.*\)$/, ''), win, vis: win ? !!ev.value(`${e.id}.visible`, beat, true) : true, anim: e.props.some((p) => animated.has(p.path)) });
    const by = (ids) => ids.map((id) => R.elements.find((e) => e.id === id)).filter(Boolean).map((e) => row(e, false));
    return [['Windows', R.elements.filter((e) => e.id.startsWith('win.')).map((e) => row(e, true))], ['Brand', by(BRAND)], ['Scene', by(SCENE)]];
  }
  function draw(M) {
    const cur = app.inspector ? app.inspector.element : '';
    root.innerHTML = M.map(([name, rows]) => rows.length ? `<div class="lgroup" role="group" aria-label="${name}"><div class="lhead">${name}</div>${rows.map((r) => `<div class="layer${r.id === cur ? ' on' : ''}${r.vis ? '' : ' off'}" data-id="${esc(r.id)}">
      ${r.win ? `<button class="eye" data-eye="${esc(r.id)}" aria-pressed="${r.vis}" aria-label="${r.vis ? 'Hide' : 'Show'} ${esc(r.label)}" title="${r.vis ? 'Hide' : 'Show'} (a key on the timeline opens / closes it)">${r.vis ? EYE : EYE_OFF}</button>` : '<span class="eye ph" aria-hidden="true"></span>'}
      <button class="lname" data-sel="${esc(r.id)}" aria-current="${r.id === cur}">${esc(r.label)}</button>${r.anim ? '<i class="kd" title="has keys on the timeline" aria-label="animated">◆</i>' : ''}</div>`).join('')}</div>` : '').join('');
    count.textContent = M[0][1].length + ' windows';
  }
  function update(force) {
    const M = model(), cur = app.inspector ? app.inspector.element : '', s = cur + '|' + M.map(([, rows]) => rows.map((r) => r.id + (r.vis ? 1 : 0) + (r.anim ? 'a' : '')).join(',')).join(';');
    if (!force && s === sig) return; sig = s;
    const a = document.activeElement, keep = root.contains(a) ? (a.dataset.sel ? ['sel', a.dataset.sel] : a.dataset.eye ? ['eye', a.dataset.eye] : null) : null;
    draw(M); if (keep) { const n = root.querySelector(`[data-${keep[0]}="${keep[1]}"]`); if (n) n.focus(); }
  }
  root.addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]'), sel = e.target.closest('[data-sel]');
    if (eye) { const id = eye.dataset.eye, p = id + '.visible', now = !!app.cues.ev().value(p, app.cuetl ? app.cuetl.state.playhead : 0, true); app.actions.setProp(p, !now); update(); return; }
    if (sel) { const id = sel.dataset.sel; document.querySelector('.tabs [data-tab="inspect"]').click(); app.inspector.showElement(id); if (hooks.pick) hooks.pick(id.startsWith('win.') ? id.slice(4) : null); update(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const all = [...root.querySelectorAll('.lname')], i = all.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus();
  });
  return { update };
}
