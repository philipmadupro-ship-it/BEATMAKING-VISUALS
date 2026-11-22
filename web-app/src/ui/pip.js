// v23.2 ALWAYS SEE THE PREVIEW (user): when the program monitor scrolls out of view (phone / narrow layouts, long inspector panes), a floating
// glass mini-monitor mirrors it live (same pixels, drawn from #view every frame while shown). Click it to jump back to the monitor, drag it to a
// corner, × hides it for this session. It never shows on the home screen or while the real monitor is visible.
const $ = (s) => document.querySelector(s);
export function createPip(app) {
  const stage = $('#stage'), view = $('#view'); if (!stage || !view || !window.IntersectionObserver) return null;
  const box = document.createElement('div'); box.className = 'pip'; box.hidden = true; box.setAttribute('role', 'button'); box.tabIndex = 0; box.setAttribute('aria-label', 'Preview (click to go back to the monitor)');
  box.innerHTML = '<canvas aria-hidden="true"></canvas><span class="pip-l">PREVIEW</span><button class="pip-x" aria-label="Hide the floating preview">×</button>'; document.body.append(box);
  const cv = box.querySelector('canvas'), g = cv.getContext('2d'); let inView = true, off = false, raf = 0, drag = null;
  function size() { const ar = view.width && view.height ? view.width / view.height : 9 / 16, w = ar < 1 ? 132 : 240; cv.width = w * 2; cv.height = Math.round(w / ar) * 2; cv.style.width = w + 'px'; cv.style.height = Math.round(w / ar) + 'px'; }
  function tick() { raf = 0; if (box.hidden) return; try { g.drawImage(view, 0, 0, cv.width, cv.height); } catch (_) {} raf = requestAnimationFrame(tick); }
  function sync() { const show = !off && !inView && !$('#studio').hidden; if (show === !box.hidden) return; box.hidden = !show; if (show) { size(); if (!raf) raf = requestAnimationFrame(tick); } }
  new IntersectionObserver((es) => { inView = es[0].isIntersecting && es[0].intersectionRatio > 0.35; sync(); }, { threshold: [0, 0.35, 1] }).observe(stage);
  new MutationObserver(sync).observe($('#studio'), { attributes: true, attributeFilter: ['hidden'] });
  box.addEventListener('click', (e) => { if (e.target.closest('.pip-x')) { off = true; sync(); return; } if (drag && drag.moved) return; stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stage.scrollIntoView({ block: 'center' }); } });
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('.pip-x')) return; const r = box.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top, moved: false }; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => { if (!drag) return; drag.moved = true; box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, e.clientX - drag.x)) + 'px'; box.style.top = Math.max(8, Math.min(innerHeight - box.offsetHeight - 8, e.clientY - drag.y)) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; });
  box.addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
  // glass sliders show their filled part (CSS var --v): on input, and for sliders set from code / added later (cheap periodic pass)
  const fill = (el) => { const lo = +el.min || 0, hi = el.max === '' ? 100 : +el.max, v = +el.value; el.style.setProperty('--v', ((v - lo) / Math.max(1e-9, hi - lo) * 100).toFixed(2) + '%'); };
  document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('input[type=range]')) fill(e.target); }, true);
  const all = () => document.querySelectorAll('input[type=range]').forEach(fill); all(); setInterval(all, 700);
  return { sync, get shown() { return !box.hidden; } };
}
