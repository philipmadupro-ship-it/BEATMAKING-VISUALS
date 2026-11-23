// v23 RICH TOOLTIPS (Adobe-style: a name, what it does, the shortcut). Any element with data-tip="Name|What it does|Shortcut" gets one; buttons
// and fields with a plain title="…" in the studio get one too (the title is moved into data-tip, "(K)" at the end becomes the shortcut chip).
// Shows after 450 ms of hover or on keyboard focus, hides on leave / Escape / scroll; never covers the pointer. One shared element, aria-describedby.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function createTips(root = document) {
  const tip = document.createElement('div'); tip.className = 'rtip'; tip.id = 'rtip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.append(tip);
  let timer = 0, cur = null;
  function upgrade(scope = document) { for (const el of scope.querySelectorAll('#studio [title], #dock [title]')) { if (el.dataset.tip) { el.removeAttribute('title'); continue; }
      const t = el.getAttribute('title'); if (!t) continue; const m = t.match(/^(.*?)(?:\s*\(([^()]{1,24})\))?$/), name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const body = (m ? m[1] : t).trim(); el.dataset.tip = `${name && name.toLowerCase() !== body.toLowerCase() ? name : body}|${name && name.toLowerCase() !== body.toLowerCase() ? body : ''}|${m && m[2] ? m[2] : ''}`; el.removeAttribute('title'); } }
  function show(el) { const [name, body, key] = String(el.dataset.tip).split('|'); if (!name && !body) return;
    tip.innerHTML = `<b>${esc(name)}</b>${key ? `<kbd>${esc(key)}</kbd>` : ''}${body ? `<span>${esc(body)}</span>` : ''}`; tip.hidden = false;
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight; let x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2)), y = r.bottom + 8; if (y + th > window.innerHeight - 8) y = r.top - th - 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; el.setAttribute('aria-describedby', 'rtip'); cur = el; }
  function hide() { clearTimeout(timer); tip.hidden = true; if (cur) cur.removeAttribute('aria-describedby'); cur = null; }
  root.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el === cur) return; hide(); if (el) timer = setTimeout(() => show(el), 450); });
  root.addEventListener('pointerout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
  root.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); hide(); if (el && el.matches(':focus-visible')) show(el); });
  root.addEventListener('focusout', hide); root.addEventListener('pointerdown', hide); window.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  let pend = false; upgrade(); new MutationObserver(() => { if (pend) return; pend = true; setTimeout(() => { pend = false; upgrade(); }, 250); }).observe(document.getElementById('studio') || document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  return { upgrade, hide };
}
