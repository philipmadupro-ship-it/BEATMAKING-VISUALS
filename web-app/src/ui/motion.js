// UI motion with GSAP (v21: no opacity fades on entrance, transform-only expo-out moves = hard cut + settle) (no-ops when GSAP is missing or the viewer prefers reduced motion).
export function createMotion(gsap) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, ok = !!gsap && !reduce;
  return {
    ok,
    staggerIn(els) { if (ok && els.length) gsap.fromTo(els, { y: 26, rotateX: -10 }, { y: 0, rotateX: 0, duration: .55, ease: 'expo.out', stagger: .045, clearProps: 'transform' }); },
    tilt(el) { if (!ok) return; el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; gsap.to(el, { rotateY: x * 12, rotateX: -y * 9, y: -6, duration: .4, ease: 'power2.out', overwrite: 'auto' }); });
      el.addEventListener('pointerleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, y: 0, duration: .8, ease: 'elastic.out(1,0.5)', overwrite: 'auto' })); },
    press(root) { root.addEventListener('pointerdown', e => { const b = e.target.closest('button,label.btn,.chip'); if (b && ok) gsap.fromTo(b, { scale: .94 }, { scale: 1, duration: .4, ease: 'back.out(3)', clearProps: 'scale' }); }); },
    underline(el, idx) { if (ok) gsap.to(el, { xPercent: idx * 100, duration: .4, ease: 'power3.out' }); else el.style.transform = `translateX(${idx * 100}%)`; },
    paneIn(el) { if (ok) gsap.fromTo(el.children, { y: 12 }, { y: 0, duration: .35, stagger: .035, ease: 'expo.out', clearProps: 'transform' }); },
    viewIn(el) { if (ok) gsap.fromTo(el, { y: 14 }, { y: 0, duration: .45, ease: 'expo.out', clearProps: 'transform' }); },
    flash(el) { if (ok) gsap.fromTo(el, { backgroundColor: 'rgba(200,200,200,.25)' }, { backgroundColor: 'rgba(200,200,200,0)', duration: .6, clearProps: 'backgroundColor' }); },
  };
}
