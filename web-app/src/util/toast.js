// v21 toasts: one polite live region, newest on top, auto-dismiss (4 s). app.toast(message, {kind: 'ok'|'warn'|'bad'}).
export function createToast() {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  return function toast(msg, opt = {}) {
    const el = document.createElement('div'); el.className = 'toast' + (opt.kind ? ' ' + opt.kind : ''); el.textContent = msg; box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, opt.ms || 4000);
    return el;
  };
}
