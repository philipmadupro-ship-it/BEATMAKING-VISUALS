// v24 HISTORY (left rail → History; Premiere's History panel): every undo step by name, oldest at the top, the current state lit, the redo
// steps greyed below it. Click a step to jump there (undo / redo as many times as needed, so nothing is lost until the next edit).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nice = (l) => String(l || 'edit').replace(/^set /, 'Set ').replace(/^./, (c) => c.toUpperCase());
export function createHistory(app) {
  const root = $('#histItems'); if (!root) return null;
  function render() { const h = app.cues.history(), P = h.past, F = h.future;
    $('#histCount').textContent = `${P.length} step${P.length === 1 ? '' : 's'}${F.length ? ` · ${F.length} to redo` : ''}`;
    const rows = [`<li class="${P.length ? '' : 'now'}"><button data-j="${-P.length}"><i>0</i><span>Opened</span></button></li>`,
      ...P.map((l, i) => `<li class="${i === P.length - 1 ? 'now' : ''}"><button data-j="${i + 1 - P.length}" aria-current="${i === P.length - 1}"><i>${i + 1}</i><span>${esc(nice(l))}</span></button></li>`),
      ...F.map((l, i) => `<li class="fut"><button data-j="${i + 1}"><i>+${i + 1}</i><span>${esc(nice(l))}</span></button></li>`)];
    root.innerHTML = rows.join(''); const cur = root.querySelector('.now'); if (cur && root.closest('.rail').dataset.pane === 'history') cur.scrollIntoView({ block: 'nearest' }); }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-j]'); if (!b) return; const n = +b.dataset.j; if (n) app.cues.jump(n); });
  $('#histUndo').addEventListener('click', () => app.cues.undo()); $('#histRedo').addEventListener('click', () => app.cues.redo());
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') render(); });
  render(); return { render };
}
