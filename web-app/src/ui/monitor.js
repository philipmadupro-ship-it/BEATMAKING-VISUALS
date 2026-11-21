// v21 PROGRAM MONITOR: the viewer's pro tools.
//   Guides (viewer bar): action-safe 93 % + title-safe 90 % (SMPTE ST 2046-1), rule of thirds, centre cross; the TikTok /
//   YouTube UI zones stay on "Safe area".  Resolution: Full / 1/2 / 1/4 preview pixels (Premiere "Playback Resolution";
//   export is always full).  Compare A/B: a wipe between the current cue sheet (A, left) and a snapshot (B, right): "Snap B"
//   stores the current state, opening a saved project sets B to its saved version. Drag the divider.
//   Transport: frame back / forward, Loop I/O (plays the in/out range; sets 4 bars at the playhead when none).
//   Timeline: audio scrub while dragging the playhead in the ruler (short grains, as Premiere / Ableton), and a filmstrip
//   of the film along the ruler (rendered lazily from the same renderFrame, cached per cue sheet version).
import { makeSurface } from '../engine/render.js';
import { mergeDeep } from '../cues/schema.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { ASPECTS } from '../v8/layout.js';
const $ = (s) => document.querySelector(s);
const KEY = 'u2c.monitor.v1';
const today = () => new Date().toUTCString().split(' ').slice(1, 4).join(' ').toUpperCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createMonitor(app) {
  const P = () => app.store.project, track = () => app.store.session.track, tl = () => app.cuetl;
  let pref = { guides: { action: false, title: false, thirds: false, center: false }, res: 1, thumbs: true, scrub: true };
  try { pref = mergeDeep(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch {} };

  // ---------------------------------------------------------------- guides
  const guides = $('#guides');
  function drawGuides() {
    const g = pref.guides, on = g.action || g.title || g.thirds || g.center;
    guides.hidden = !on;
    guides.innerHTML = (g.action ? '<b class="g-act" title="action safe 93%"><span>action safe</span></b>' : '') + (g.title ? '<b class="g-ttl" title="title safe 90%"><span>title safe</span></b>' : '') +
      (g.thirds ? '<i class="g-v" style="left:33.333%"></i><i class="g-v" style="left:66.667%"></i><i class="g-h" style="top:33.333%"></i><i class="g-h" style="top:66.667%"></i>' : '') +
      (g.center ? '<em class="g-c"></em>' : '');
    for (const c of document.querySelectorAll('#guideMenu input[data-g]')) c.checked = !!g[c.dataset.g];
    $('#guidesBtn').setAttribute('aria-pressed', String(on));
  }
  function setGuide(k, v) { pref.guides[k] = v == null ? !pref.guides[k] : !!v; drawGuides(); save(); }
  $('#guidesBtn').addEventListener('click', (e) => { const m = $('#guideMenu'), open = m.hidden; m.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open)); if (open) m.querySelector('input').focus(); });
  $('#guideMenu').addEventListener('change', (e) => { const k = e.target.dataset.g; if (k) setGuide(k, e.target.checked); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#guideMenu,#guidesBtn')) { $('#guideMenu').hidden = true; $('#guidesBtn').setAttribute('aria-expanded', 'false'); } });
  $('#guideMenu').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#guideMenu').hidden = true; $('#guidesBtn').focus(); } });
  drawGuides();

  // ---------------------------------------------------------------- resolution
  const resSel = $('#resSel');
  function setRes(f) { f = [1, 0.5, 0.25].includes(+f) ? +f : 1; pref.res = f; resSel.value = String(f); app.studio.setRes(f); save(); }
  resSel.addEventListener('change', () => setRes(+resSel.value));
  setRes(pref.res);

  // ---------------------------------------------------------------- compare A/B
  const ab = { on: false, x: 0.5, B: null, off: null };
  const wipe = $('#abWipe');
  function snapshotB(label = 'snapshot') { ab.B = { sheet: clone(app.cues.sheet), project: clone(P()), label, at: Date.now() }; $('#abInfo').textContent = 'B: ' + label + ' ' + new Date(ab.B.at).toTimeString().slice(0, 5); app.studio.markDirty(); return ab.B; }
  function setB(sheet, project, label) { ab.B = { sheet: clone(sheet), project: clone(project || P()), label, at: Date.now() }; $('#abInfo').textContent = 'B: ' + label; app.studio.markDirty(); }
  function setCompare(on) { ab.on = on == null ? !ab.on : !!on; if (ab.on && !ab.B) snapshotB(); $('#abBtn').setAttribute('aria-pressed', String(ab.on)); wipe.hidden = !ab.on; $('#abInfo').hidden = !ab.on; placeWipe(); app.studio.markDirty(); }
  const placeWipe = () => { wipe.style.left = (ab.x * 100) + '%'; };
  $('#abBtn').addEventListener('click', () => setCompare());
  $('#abSnap').addEventListener('click', () => { snapshotB(); app.toast && app.toast('B = the current state. Edit, then compare.'); if (!ab.on) setCompare(true); });
  let wd = null;
  wipe.addEventListener('pointerdown', (e) => { e.stopPropagation(); wd = true; wipe.setPointerCapture(e.pointerId); });
  wipe.addEventListener('pointermove', (e) => { if (!wd) return; const r = $('#view').getBoundingClientRect(); ab.x = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)); placeWipe(); app.studio.markDirty(); });
  wipe.addEventListener('pointerup', () => { wd = null; });
  wipe.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); ab.x = Math.max(0.02, Math.min(0.98, ab.x + (e.key === 'ArrowRight' ? 0.05 : -0.05))); placeWipe(); app.studio.markDirty(); } });
  app.studio.onPostDraw((t, surf, p, tr) => {
    if (!ab.on || !ab.B) return; const w = surf.w, h = surf.h;
    if (!ab.off || ab.off.w !== w || ab.off.h !== h) ab.off = makeSurface(w, h);
    const bp = { ...p, look: ab.B.project.look, stage: ab.B.project.stage }, tags = mergeDeep(DEFAULT_TAGS, ab.B.sheet.tags || {}); if (tags.date === '{today}') tags.date = today();
    if (!ab.B.sheet.__ab) Object.defineProperty(ab.B.sheet, '__ab', { value: 1, enumerable: false });
    app.renderFrame(t, ab.off, bp, tr, { sheet: ab.B.sheet, tags });
    const sx = Math.round(ab.x * w); surf.ctx.save(); surf.ctx.setTransform(1, 0, 0, 1, 0, 0); surf.ctx.drawImage(ab.off.canvas, sx, 0, w - sx, h, sx, 0, w - sx, h); surf.ctx.restore();
  });

  // ---------------------------------------------------------------- transport: frame step, loop in/out
  const fps = () => P().export.fps || 30;
  function stepFrames(n) { const p = P(); app.clock.pause(); app.actions.seek(Math.max(p.inT, Math.min(p.outT - 1 / fps(), app.clock.time() + n / fps()))); }
  $('#frBack').addEventListener('click', () => stepFrames(-1)); $('#frFwd').addEventListener('click', () => stepFrames(1));
  function loopIO(on) { const T = tl(), want = on == null ? !T.state.loop : on;
    if (!want) T.clearLoop(); else if (!T.state.loop) { const a = Math.floor(T.state.playhead / 4) * 4, tot = (P().outT - P().inT) / track().spb; T.state.loop = { a, b: Math.min(tot, a + 16) }; T.markDirty(); app.actions.loopChanged && app.actions.loopChanged(); }
    syncLoop(); }
  const syncLoop = () => $('#loopIOBtn').setAttribute('aria-pressed', String(!!(tl() && tl().state.loop)));
  $('#loopIOBtn').addEventListener('click', () => loopIO());
  const la = app.actions.loopChanged; app.actions.loopChanged = () => { la && la(); syncLoop(); };

  // ---------------------------------------------------------------- audio scrub (drag the playhead in the ruler)
  let scrubbing = false, lastGrain = 0;
  const cv = $('#cueCv');
  cv.addEventListener('pointerdown', (e) => { const r = cv.getBoundingClientRect(), h = tl().hit(e.clientX - r.left, e.clientY - r.top); scrubbing = !!(h && (h.zone === 'ruler' || h.zone === 'sect') && !e.altKey && !app.clock.playing); if (scrubbing) grain(); });
  cv.addEventListener('pointermove', () => { if (scrubbing) grain(); });
  const endS = () => { scrubbing = false; }; cv.addEventListener('pointerup', endS); cv.addEventListener('pointercancel', endS); cv.addEventListener('lostpointercapture', endS);
  let lastT = -1;
  function grain(force) {
    if (!pref.scrub) return; const now = performance.now(), buf = app.store.session.buffer; if (!buf || (!force && now - lastGrain < 45)) return;
    const t = app.clock.time(); if (!force && Math.abs(t - lastT) < 0.004) return; lastT = t; lastGrain = now;
    try { const ac = app.clock.ctx; ac.resume(); const src = ac.createBufferSource(), g = ac.createGain(), d = 0.07, t0 = ac.currentTime, vol = +(($('#vol') || {}).value || 0.9);
      src.buffer = buf; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * 0.8, t0 + 0.006); g.gain.setValueAtTime(vol * 0.8, t0 + d - 0.015); g.gain.linearRampToValueAtTime(0, t0 + d);
      src.connect(g); g.connect(ac.destination); src.start(t0, Math.max(0, Math.min(buf.duration - d, t)), d); grains++; } catch {}
  }
  let grains = 0;

  // ---------------------------------------------------------------- filmstrip along the ruler
  const strip = $('#thumbs'), sc = $('#thumbCv'), sctx = sc.getContext('2d'), cache = new Map(); let cacheKey = '', pendingKey = '', keyAt = 0, lastDraw = '';
  function setThumbs(on) { pref.thumbs = on == null ? !pref.thumbs : !!on; strip.hidden = !pref.thumbs; $('#thumbsBtn').setAttribute('aria-pressed', String(pref.thumbs)); save(); lastDraw = ''; }
  $('#thumbsBtn').addEventListener('click', () => setThumbs());
  strip.hidden = !pref.thumbs; $('#thumbsBtn').setAttribute('aria-pressed', String(pref.thumbs));
  strip.addEventListener('click', (e) => { const r = sc.getBoundingClientRect(), b = tl().bOf(e.clientX - r.left), tr = track(); if (!tr || b < 0) return; app.actions.seek(P().inT + Math.round(b * tr.spb * 30) / 30); });
  function thumbTick() {
    requestAnimationFrame(thumbTick);
    if (strip.hidden || $('#studio').hidden || app.store.session.exporting) return; const tr = track(), e = app.clip.current(); if (!tr || !e || !e.ready) return;
    const p = P(), key = [app.cues.version, p.aspect, p.inT.toFixed(3), p.outT.toFixed(3), e.key, p.look, p.stage].join('|'), now = performance.now();
    if (key !== cacheKey) { if (key !== pendingKey) { pendingKey = key; keyAt = now; } if (now - keyAt > 450 || !cache.size) { cacheKey = key; cache.clear(); lastDraw = ''; } }   // re-render after edits settle
    const r = sc.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (r.width < 10) return;
    if (sc.width !== Math.round(r.width * dpr) || sc.height !== Math.round(r.height * dpr)) { sc.width = Math.round(r.width * dpr); sc.height = Math.round(r.height * dpr); lastDraw = ''; }
    const { W, H } = ASPECTS[p.aspect], th = r.height, tw = th * W / H, T = tl(), V = T.view(), ppb = (T.xOf(1) - T.xOf(0)) || 1, q = Math.pow(2, Math.round(Math.log2(Math.max(1 / 16, tw / ppb))));
    const head = T.xOf(V.a), b0 = Math.max(0, Math.floor(V.a / q) * q), b1 = Math.min(V.total, V.z);
    // render missing thumbs within a small per-frame budget (not while playing: the preview has priority)
    if (!app.clock.playing) { const t0 = performance.now(); for (let b = b0; b < b1 && performance.now() - t0 < 8; b += q) { const k = b.toFixed(4); if (cache.has(k)) continue;
      const s = makeSurface(Math.round(tw * 2), Math.round(th * 2)); app.renderFrame(p.inT + (b + q / 2) * tr.spb, s, p, tr, {}); cache.set(k, s.canvas); lastDraw = ''; } }
    const dk = [V.a.toFixed(3), V.z.toFixed(3), cache.size, sc.width].join('|'); if (dk === lastDraw) return; lastDraw = dk;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, r.width, th);
    for (let b = b0; b < b1; b += q) { const c = cache.get(b.toFixed(4)); const x = T.xOf(b), w = q * ppb; if (x + w < head || !c) continue;
      const cw = Math.min(w, tw), sx = (tw - cw) / 2 / tw * c.width; sctx.save(); sctx.beginPath(); sctx.rect(head, 0, r.width - head, th); sctx.clip();
      sctx.drawImage(c, sx, 0, cw / tw * c.width, c.height, x + (w - cw) / 2, 0, cw, th); sctx.restore(); }
    sctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#999'; sctx.font = '500 10px "JetBrains Mono", monospace'; sctx.textBaseline = 'middle'; sctx.fillText('FILM', 8, th / 2);
  }
  requestAnimationFrame(thumbTick);

  return {
    setGuide, get guides() { return { ...pref.guides }; }, setRes, get res() { return pref.res; },
    setCompare, snapshotB, setB, get compare() { return { on: ab.on, x: ab.x, hasB: !!ab.B, label: ab.B && ab.B.label }; }, set wipe(x) { ab.x = x; placeWipe(); app.studio.markDirty(); },
    stepFrames, loopIO, setThumbs, get thumbs() { return { on: pref.thumbs, cached: cache.size }; }, grain: () => grain(true), get grains() { return grains; },
  };
}
