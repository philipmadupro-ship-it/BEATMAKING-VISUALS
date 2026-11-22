// v22 STATUS STRIP (bottom of the window, always visible): the facts you check before every export, in one line:
// beat, BPM, key, section length, format, stage, intro style, export preset and the play position (bar.beat.tick + time).
// Click an item to jump to where it is changed. API: app.statusBar = { update(), items() }.
import { STAGES } from '../v8/core.js';
import { fmtTC } from '../util/draw.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function presetName(aspect, sec) { const s = Math.round(sec);
  if (aspect === '169') return `YouTube 16:9 · ${s} s`; if (Math.abs(s - 15) <= 1) return 'Reels 9:16 · 15 s'; if (Math.abs(s - 30) <= 2) return 'TikTok 9:16 · 30 s'; if (Math.abs(s - 60) <= 3) return 'Shorts 9:16 · 60 s'; return `9:16 · ${s} s`; }
export function createStatusBar(app) {
  const bar = $('#statusBar'), P = () => app.store.project;
  const go = (tab) => () => { if ($('#studio').hidden) return; const b = document.querySelector(`.tabs [data-tab="${tab}"]`); if (b) b.click(); };
  function items() { const p = P(), tr = app.store.session.track, len = p.outT - p.inT, S = STAGES[p.stage] || {};
    let intro = '—'; try { const d = app.registry().byPath['intro.style']; intro = p.look === 'player' ? app.cues.ev().value('intro.style', 0, d ? d.default : 'flow') : 'cards'; } catch {}
    const q = app.queue ? app.queue.items.filter((i) => i.status === 'queued').length : 0;
    return [['beat', 'Beat', tr ? (tr.meta.title || tr.meta.name) : 'no beat', 'beat'], ['bpm', 'BPM', tr ? String(Math.round(tr.bpm * 100) / 100) : '—', 'beat', 1], ['key', 'Key', (p.key || (tr && tr.key) || '—'), 'meta', 1],
      ['len', 'Section', tr ? `${Math.round(len / tr.barDur)} bars · ${len.toFixed(1)} s` : '—', 'export', 1], ['fmt', 'Format', p.aspect === '916' ? '9:16' : '16:9', 'export', 1], ['stage', 'Stage', S.label || S.name || p.stage, 'look'],
      ['intro', 'Intro', intro, 'inspect'], ['preset', 'Export', presetName(p.aspect, len) + (q ? ` · +${q} queued` : ''), 'export']]; }
  function update() { bar.querySelector('.sb-items').innerHTML = items().map(([id, l, v, tab, big]) => `<button type="button" class="sb-i${big ? ' big' : ''}" data-sb="${id}" data-go="${tab}" title="${esc(l)}: change it in ${esc(tab)}"><span>${esc(l)}</span><b>${esc(v)}</b></button>`).join(''); }
  bar.addEventListener('click', (e) => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go)(); });
  app.store.subscribe(() => update()); app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') update(); });
  let last = '';
  (function tick() { requestAnimationFrame(tick); const tr = app.store.session.track; if (!tr) return; const p = P(), t = Math.max(0, app.clock.time() - p.inT), b = t / tr.spb, s = `${app.cuetl ? app.cuetl.bbt(b) : b.toFixed(2)}|${fmtTC(t)}`;
    if (s !== last) { last = s; const [bb, tc] = s.split('|'); $('#sbPos').innerHTML = `<span>Position</span><b>${esc(bb)}</b><i>${esc(tc)}</i>`; } })();
  update(); return { update, items };
}
