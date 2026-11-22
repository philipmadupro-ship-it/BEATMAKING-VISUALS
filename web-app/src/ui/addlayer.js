// v23 ADD LAYER (the timeline's "+ Layer" button; Adobe's New Layer menu): what you can add at the playhead, grouped by intent, each with one
// line saying what it does. Picking one adds it (one undo step) and opens it in the inspector. Also: WORKSPACES (Premiere: Edit / Motion /
// Audio / Export arrange the panels in one click) and COVER PRESETS (Media bin: one click sets the cover treatment).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rid = () => 'k' + Math.random().toString(36).slice(2, 9);
export function createAddLayer(app) {
  const btn = $('#addTrackBtn'); if (!btn) return null;
  const ph = () => (app.cuetl ? app.cuetl.state.playhead : 0), bar = () => Math.max(0, Math.round(ph() / 4) * 4);
  const clip = (path, kind, lane, k, why) => app.cues.edit((s) => { let t = s.tracks.find((q) => q.path === path); if (!t) { t = { id: 't' + rid(), path, kind, lane, auto: false, keys: [] }; s.tracks.push(t); } t.auto = false; t.keys.push({ id: rid(), ...k }); t.keys.sort((a, b) => a.b - b.b); }, why);
  const open = (el) => { $('.tabs [data-tab="inspect"]').click(); if (app.inspector && app.inspector.showElement) app.inspector.showElement(el); };
  const GROUPS = [
    ['Text', [
      ['text', 'Text on screen', 'A line of big type over the video for 1 bar (edit the words in the inspector).', () => { clip('text.cue', 'clip', 'text', { b: ph(), v: 'NEW TEXT', dur: 4, ease: 'step' }, 'add text'); open('text'); }],
      ['term', 'Terminal line', 'A console line that types in and deletes itself (social.terminal words).', () => { clip('term.line', 'clip', 'text', { b: ph(), v: 0, dur: 5, ease: 'step' }, 'add terminal line'); open('text'); }],
      ['cta', 'Call to action', 'CTA 1 pop-up at the playhead (the cursor closes it with ×).', () => { app.cues.edit((s) => { s.base['social.cta1.at'] = ph(); s.base['social.cta1.len'] = 4; }, 'move CTA 1'); open('overlays'); }]]],
    ['Camera', [
      ['stop', 'Camera stop', 'The camera travels to the hero card here (change the window in the Look tab shot list).', () => { clip('camera.shot', 'shot', 'camera', { b: Math.max(4, bar()), v: 'stage', transition: 'push', dur: 2, ease: 'spring' }, 'add camera stop'); document.querySelector('.tabs [data-tab="look"]').click(); }],
      ['zoom', 'Zoom key', 'A camera zoom keyframe at the playhead (1 = framed, 1.2 = closer).', () => { app.actions.setProp('camera.zoom', 1.1); open('camera'); }]]],
    ['FX', [
      ['neg', 'Negative', 'The whole frame inverted for 1 bar (scroll-stop).', () => { clip('fx.invert', 'clip', 'fx', { b: bar(), v: true, dur: 4, ease: 'step' }, 'add negative'); open('fx'); }],
      ['flash', 'Flash', 'A one-frame invert on the beat.', () => { clip('fx.flash', 'event', 'fx', { b: Math.round(ph()), v: true, ease: 'step' }, 'add flash'); open('fx'); }]]],
    ['Cover', [
      ['fry', 'Cover look key', 'Change the cover treatment from here on (Media → Cover presets for the base).', () => { app.actions.setProp('hero.fry', 'night'); open('hero'); }]]],
    ['Marker', [
      ['mark', 'Marker', 'A named, coloured marker at the playhead (M). Chapter markers become YouTube chapters.', () => { app.cuetl.addMarker(); const b = document.querySelector('#railTabs [data-pane="markers"]'); if (b) b.click(); }]]],
  ];
  const menu = document.createElement('div'); menu.className = 'pop menu addlayer'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Add a layer');
  menu.innerHTML = GROUPS.map(([g, items]) => `<div class="al-g"><span class="al-h">${g}</span>${items.map(([id, name, d]) => `<button role="menuitem" data-al="${id}"><b>${esc(name)}</b><span>${esc(d)}</span></button>`).join('')}</div>`).join('');
  btn.parentElement.style.position = 'relative'; btn.parentElement.append(menu); btn.textContent = '+ Layer'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.dataset.tip = 'Add a layer|Text, camera stop, zoom, negative, flash, cover key or marker, at the playhead.|';
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('button').focus(); };
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-al]'); if (!b) return; for (const [, items] of GROUPS) for (const it of items) if (it[0] === b.dataset.al) it[3](); close(); btn.focus(); });
  menu.addEventListener('keydown', (e) => { const all = [...menu.querySelectorAll('button')], i = all.indexOf(document.activeElement); if (e.key === 'Escape') { close(); btn.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus(); } });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  return { GROUPS, close };
}

// ---- WORKSPACES: one click arranges the rail, the right panel tab and the dock height for a job
export const WORKSPACES = { edit: ['Edit', 'layers', 'inspect', 'Timeline + inspector: keys, layers, text'], motion: ['Motion', 'layers', 'look', 'Presets + shot order + camera'], audio: ['Audio', 'media', 'export', 'Voice lab, voice take, SFX, loudness'], export: ['Export', 'markers', 'export', 'Markers, chapters, review, queue'] };
export function createWorkspaces(app) {
  const box = $('#wsSeg'); if (!box) return null;
  box.innerHTML = Object.entries(WORKSPACES).map(([k, [n, , , d]]) => `<button data-ws="${k}" aria-pressed="false" data-tip="${esc(n)} workspace|${esc(d)}|">${esc(n)}</button>`).join('');
  // v24 (audit W7): each workspace remembers its own panel widths and dock height (saved when you leave it, restored when you come back)
  let cur = null; try { cur = localStorage.getItem('u2c.ws.name'); } catch (_) {}
  const LS = 'u2c.ws.sizes.v1', load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { return {}; } }, store = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (_) {} };
  const dockH = () => { const d = document.getElementById('studio'); return d ? d.style.getPropertyValue('--dock-h') : ''; };
  function remember() { if (!cur || !app.workspace) return; const all = load(), w = app.workspace.state; all[cur] = { left: w.left, right: w.right, dock: dockH() }; store(all); }
  function restore(k) { const z = load()[k]; if (!z || !app.workspace) return; app.workspace.setWidth('left', z.left || 0); app.workspace.setWidth('right', z.right || 0); if (z.dock) document.getElementById('studio').style.setProperty('--dock-h', z.dock); }
  function set(k) { const w = WORKSPACES[k]; if (!w) return; if (cur && cur !== k) remember(); restore(k); cur = k; const r = document.querySelector(`#railTabs [data-pane="${w[1]}"]`), t = document.querySelector(`.tabs [data-tab="${w[2]}"]`); if (r) r.click(); if (t) t.click();
    if (app.workspace && app.workspace.state.noLeft) app.workspace.toggle('left', true); if (app.workspace && app.workspace.state.noRight) app.workspace.toggle('right', true);
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ws === k))); try { localStorage.setItem('u2c.ws.name', k); } catch (_) {} }
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-ws]'); if (b) set(b.dataset.ws); });
  window.addEventListener('beforeunload', remember);
  return { set, remember };
}

// ---- COVER PRESETS: the cover treatment in one click (hero.fry + hero.halftone base values); "every tile" puts it on the sphere too (cover.all)
export const COVER_PRESETS = [['halftone', 'Halftone print', 'stage', true], ['night', 'Night vision', 'night', false], ['thermal', 'Thermal', 'thermal', false], ['negative', 'Negative', 'negative', true], ['clean', 'Clean', 'none', false], ['stage', 'Stage colours', 'stage', false]];
export function createCoverPresets(app) {
  const box = $('#coverPresets'); if (!box) return null;
  function render() { const ev = app.cues.ev(), fry = ev.value('hero.fry', 0, null), ht = ev.value('hero.halftone', 0, true), all = !!ev.value('cover.all', 0, false);
    box.innerHTML = COVER_PRESETS.map(([id, n, f, h]) => `<button class="cvp" data-cvp="${id}" aria-pressed="${fry === f && !!ht === h}" data-tip="${esc(n)}|Cover treatment: ${f === 'none' ? 'no treatment' : f}${h ? ' + halftone print' : ''}.|">${esc(n)}</button>`).join('') +
      `<label class="tog"><span class="sw"><input type="checkbox" role="switch" id="cvpAll"${all ? ' checked' : ''}><i aria-hidden="true"></i></span> Every sphere tile</label>`; }
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-cvp]'); if (!b) return; const p = COVER_PRESETS.find((q) => q[0] === b.dataset.cvp);
    app.cues.edit((s) => { for (const path of ['hero.fry', 'hero.halftone']) { const t = s.tracks.find((q) => q.path === path); if (t) t.keys = []; } s.base['hero.fry'] = p[2]; s.base['hero.halftone'] = p[3]; }, 'cover preset ' + p[1]); });
  box.addEventListener('change', (e) => { if (e.target.id === 'cvpAll') { const v = e.target.checked; app.cues.edit((s) => { s.base['cover.all'] = v; }, 'cover preset on every tile'); } });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') render(); });
  render(); return { render };
}
