// UI motion with GSAP (no-ops when GSAP is missing or the viewer prefers reduced motion).
export function createMotion(gsap) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, ok = !!gsap && !reduce;
  return {
    ok,
    staggerIn(els) { if (ok && els.length) gsap.fromTo(els, { y: 26, opacity: 0, rotateX: -10 }, { y: 0, opacity: 1, rotateX: 0, duration: .65, ease: 'power3.out', stagger: .045, clearProps: 'opacity' }); },
    tilt(el) { if (!ok) return; el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; gsap.to(el, { rotateY: x * 12, rotateX: -y * 9, y: -6, duration: .4, ease: 'power2.out', overwrite: 'auto' }); });
      el.addEventListener('pointerleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, duration: .8, ease: 'elastic.out(1,0.5)', overwrite: 'auto' })); },
    press(root) { root.addEventListener('pointerdown', e => { const b = e.target.closest('button,label.btn,.chip'); if (b && ok) gsap.fromTo(b, { scale: .94 }, { scale: 1, duration: .4, ease: 'back.out(3)', clearProps: 'scale' }); }); },
    underline(el, idx) { if (ok) gsap.to(el, { xPercent: idx * 100, duration: .4, ease: 'power3.out' }); else el.style.transform = `translateX(${idx * 100}%)`; },
    paneIn(el) { if (ok) gsap.fromTo(el.children, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .35, stagger: .035, ease: 'power2.out', clearProps: 'transform,opacity' }); },
    viewIn(el) { if (ok) gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .5, ease: 'power3.out', clearProps: 'transform,opacity' }); },
    flash(el) { if (ok) gsap.fromTo(el, { backgroundColor: 'rgba(200,200,200,.25)' }, { backgroundColor: 'rgba(200,200,200,0)', duration: .6, clearProps: 'backgroundColor' }); },
  };
}
