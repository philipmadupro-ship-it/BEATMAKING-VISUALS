// v26 TIMELINE GUIDE (user: "I get drops and markers, but how do I modify the timeline?"). Three helps, always in plain words:
//   1. A guide strip above the tracks that answers "what can I do here?" for whatever is under the pointer or selected
//      (empty track / a clip / a camera move / the ruler), with the exact gesture.
//   2. One-click add buttons per track (Camera visit, Text, Effect, Marker), so nothing needs a menu.
//   3. "How it works": a small card with the 6 gestures (move, length, add, edit, swap, undo), each with a tiny diagram.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TRACK = { camera: 'Camera: where the camera looks. Each block = one visit to a window; the slope before it = the move.', text: 'Text: words on screen (pop-ups, terminal lines).', fx: 'Effects: your effects (+ Effect), the negative, flashes. The line on a block = its intensity and ease in / out.', stage: 'Intro: the sphere, the pick and the push into the lab (built for you).', custom: 'What you changed by hand (moved windows, options).' };
const GEST = [['Move', 'Drag a block left or right.', 'M2 12h6M14 12h8M8 8l-4 4 4 4M16 8l4 4-4 4'], ['Length', 'Drag the edge of a block (or the start of a camera move).', 'M4 6v12M20 6v12M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3'],
  ['Add', 'Double-click an empty spot on a track, or use the + buttons.', 'M12 5v14M5 12h14'], ['Edit', 'Click a block: its settings open on the right. Double-click to type.', 'M4 20l4-1 11-11-3-3L5 16z'],
  ['Swap', 'Alt-drag a camera block onto another: the two windows trade places.', 'M4 8h13l-3-3M20 16H7l3 3'], ['Undo', 'Ctrl+Z, or click any step in History.', 'M9 7L4 12l5 5M4 12h10a6 6 0 010 12']];
export function createTimelineGuide(app) {
  const dock = $('#dock'), wrap = $('.cuewrap'); if (!dock || !wrap) return null;
  const bar = document.createElement('div'); bar.className = 'tl-guide'; bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = `<span class="tg-msg"></span><span class="tg-add" role="group" aria-label="Add to the timeline at the playhead"><button data-add="stop" data-tip="+ Camera visit|The camera travels to the hero card at the playhead (change the window in Look → Shot order or the floating toolbar).|">+ Camera</button><button data-add="text" data-tip="+ Text|A line of big type for one bar at the playhead.|">+ Text</button><button data-add="fxlib" aria-haspopup="menu" aria-expanded="false" data-tip="+ Effect|The Effects library: negative, flash, zoom pulse, shake, blur, glow, tint, RGB offset. Added at the playhead.|">+ Effect</button><button data-add="mark" data-tip="+ Marker|A named marker at the playhead (M).|">+ Marker</button></span><button class="tg-how" aria-expanded="false" data-tip="How the timeline works|The six gestures, in one card.|">How it works</button>`;
  wrap.parentElement.insertBefore(bar, wrap);
  const card = document.createElement('div'); card.className = 'tg-card'; card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'How the timeline works');
  card.innerHTML = `<div class="tg-card-h"><b>How the timeline works</b><button class="ib sm tg-x" aria-label="Close">×</button></div><p class="tg-lead">Time runs left to right (bars of the beat). Each row is a track; each block on it is something that happens. Click the ruler to move the playhead; the preview shows that moment.</p>
    <ul>${GEST.map(([n, d, p]) => `<li><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg><b>${n}</b><span>${d}</span></li>`).join('')}</ul>
    <p class="tg-lead">The tracks: <b>Intro</b> (built for you) · <b>Camera</b> (window visits) · <b>Text</b> · <b>Effects</b>. Pro mode shows every other track.</p>`;
  dock.append(card);
  const msg = bar.querySelector('.tg-msg'), how = bar.querySelector('.tg-how');
  const say = (h) => { msg.innerHTML = h; };
  const idle = () => say('<b>Tip</b> · drag a block to move it · drag its edge to change its length · double-click a track to add · click a block to edit it');
  function describe(h) { const T = app.cuetl; if (!h || !T) return idle();
    const row = h.row, lane = row ? (row.summary ? row.group : row.lane === 'custom' ? 'custom' : row.lane) : null;
    if (h.zone === 'key' && row) { const k = h.key, nm = row.path === 'camera.shot' ? `camera visit → <b>${esc(k.v)}</b>` : row.path === 'text.cue' ? `text <b>“${esc(String(k.v).slice(0, 24))}”</b>` : `<b>${esc(row.label || row.path)}</b>`;
      if (h.part === 'moveLen') return say(`${nm} · <b>drag</b> to make the camera move longer or shorter (it still lands on the same beat)`);
      if (h.part === 'end' || h.part === 'start') return say(`${nm} · <b>drag the edge</b> to change how long it lasts`);
      return say(`${nm} · <b>drag</b> to move${row.path === 'camera.shot' ? ' · <b>Alt-drag</b> onto another camera block to swap the windows' : ''} · <b>double-click</b> to type · <b>Delete</b> removes it`); }
    if (h.zone === 'lane' && row) return say(`${TRACK[lane] || esc(row.label || '')} · <b>double-click</b> here to add one at that spot`);
    if (h.zone === 'ruler' || h.zone === 'mark' || h.zone === 'markhead') return say('<b>Ruler</b> · click or drag to move the playhead; the preview shows that moment · <b>M</b> adds a marker');
    if (h.zone === 'head') return say(`${TRACK[lane] || 'A track'} · click the name to select it · <b>S</b> mute · lock · solo`);
    idle(); }
  const cv = $('#cueCv');
  cv.addEventListener('pointermove', (e) => { const T = app.cuetl; if (!T || !T.hit) return; const r = cv.getBoundingClientRect(); try { describe(T.hit(e.clientX - r.left, e.clientY - r.top)); } catch (_) { idle(); } });
  cv.addEventListener('pointerleave', () => { const sel = app.cuetl && app.cuetl.selected ? app.cuetl.selected() : []; if (sel.length) { const [row, k] = sel[0]; describe({ zone: 'key', row, key: k, part: 'body' }); } else idle(); });
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('tg-how')) { card.hidden = !card.hidden; how.setAttribute('aria-expanded', String(!card.hidden)); return; }
    if (b.dataset.add === 'fxlib') { if (app.effects) { if (app.effects.isOpen) app.effects.close(); else app.effects.open(b); } return; }
    const al = app.addLayer && app.addLayer.GROUPS; if (!al) return; for (const [, items] of al) for (const it of items) if (it[0] === b.dataset.add) it[3](); });
  card.addEventListener('click', (e) => { if (e.target.closest('.tg-x')) { card.hidden = true; how.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) { card.hidden = true; how.setAttribute('aria-expanded', 'false'); } });
  idle();
  return { describe, show(v = true) { card.hidden = !v; } };
}
