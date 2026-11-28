// Preview without the DAW: the film with its click-to-play pre-roll (the intro: browse, press, pick, sphere / cards, land) drawn at export fidelity into a
// full-window overlay, looping, using the same renderFrame the exporter and the recorder use. Click or Esc closes it. blank(on): a black cover
// until the DAW plays ("Blank - wait for play").
import { makeSurface } from '../engine/render.js';
import { PRE_S } from '../cues/generate.js';
export const loopLen = (secs) => PRE_S + Math.max(4, Math.min(12, secs || 8));
export function createPreview(app) {
  let ov = null, raf = 0, cover = null;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; if (ov) ov.remove(); ov = null; document.body.classList.remove('u2c-clean'); };
  function start() {
    stop(); const P = app.store.project, tr = app.store.session.track; if (!tr) return false;
    const port = P.aspect === '916', W = port ? 540 : 960, H = port ? 960 : 540, surf = makeSurface(W, H), len = loopLen(P.outT - P.inT);
    ov = document.createElement('div'); ov.id = 'u2cPreview'; ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:#000;display:flex;align-items:center;justify-content:center;cursor:pointer';
    surf.canvas.style.cssText = port ? 'height:100vh;width:auto;max-width:100vw' : 'width:100vw;height:auto;max-height:100vh'; ov.appendChild(surf.canvas); document.body.appendChild(ov); document.body.classList.add('u2c-clean');   // only the picture: no panels
    const hint = document.createElement('div'); hint.textContent = 'Preview: click or Esc to close'; hint.style.cssText = 'position:fixed;left:12px;top:10px;color:#fff9;font:12px ui-monospace,monospace'; ov.appendChild(hint);
    const t0 = performance.now(); ov.onclick = stop; const esc = (e) => { if (e.key === 'Escape') { stop(); window.removeEventListener('keydown', esc); } }; window.addEventListener('keydown', esc);
    let lastDraw = 0;
    const frame = () => { if (!ov) return; raf = requestAnimationFrame(frame); const nw = performance.now(); if (nw - lastDraw < 30) return; lastDraw = nw;   // 30 fps: steady, half the cost of drawing every 60 Hz frame
      const t = P.inT - PRE_S + ((performance.now() - t0) / 1000) % len;
      try { app.renderFrame(t, surf, P, tr, { fps: 30, preroll: PRE_S }); } catch (e) { console.warn(e); } };
    frame(); return true;
  }
  function blank(on) {
    if (on && !cover) { cover = document.createElement('div'); cover.id = 'u2cBlank'; cover.style.cssText = 'position:fixed;inset:0;z-index:99980;background:#000;color:#fff6;display:flex;align-items:center;justify-content:center;font:13px ui-monospace,monospace;pointer-events:none'; cover.textContent = 'waiting for the DAW to play'; document.body.appendChild(cover); }
    if (!on && cover) { cover.remove(); cover = null; }
  }
  return { start, stop, blank, get open() { return !!ov; }, get blanked() { return !!cover; } };
}
