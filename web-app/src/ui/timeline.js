// Timeline: wavesurfer.js (regions = bar-snapped clip, bar + drop markers; timeline ruler; minimap; hover).
// Falls back to a Canvas2D strip if wavesurfer is unavailable. The audio clock stays the source of truth.
import { fmtTC, clamp } from '../util/draw.js';
// small mono marker labels (wavesurfer's default region content is 14px body text and collides with the ruler)
const mkLabel = s => { const e = document.createElement('span'); e.textContent = s; e.style.cssText = 'font:500 9px/1 "JetBrains Mono",monospace;letter-spacing:.06em;padding:2px 3px;opacity:.8;text-transform:uppercase'; return e; };
export function createTimeline(app) {
  const host = document.getElementById('wave'); let ws = null, regions = null, clip = null, fallback = null, track = null, lastSet = -1;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const snap = (t, free) => { if (free || !track) return t; const k = Math.round((t - track.t0) / track.barDur); return clamp(track.t0 + k * track.barDur, 0, track.duration); };
  const barLabel = t => { if (!track) return fmtTC(t); const b = (t - track.t0) / track.spb; return `bar ${Math.floor(b / 4) + 1}.${(Math.floor(b) % 4 + 4) % 4 + 1} · ${fmtTC(t)}`; };
  function destroy() { if (ws) { try { ws.destroy(); } catch (_) {} } ws = null; regions = null; clip = null; host.innerHTML = ''; fallback = null; }
  function build(tr) {
    destroy(); track = tr; const L = app.libs; const pr = app.store.project;
    if (L.WaveSurfer && L.Regions) {
      try {
        regions = L.Regions.create();
        const plugins = [regions];
        if (false && L.Timeline) plugins.push(L.Timeline.create({ height: 16, timeInterval: 1, primaryLabelInterval: 10, secondaryLabelInterval: 5, style: { fontSize: '10px', color: css('--muted') || '#8b8b8b', fontFamily: 'JetBrains Mono, monospace' } }));
        if (L.Hover) plugins.push(L.Hover.create({ lineColor: css('--fg') || '#e6e6e6', lineWidth: 1, labelBackground: '#161616', labelColor: '#e6e6e6', labelSize: '11px', formatTimeCallback: barLabel }));
        if (false && L.Minimap) plugins.push(L.Minimap.create({ height: 18, waveColor: 'rgba(160,160,160,.35)', progressColor: css('--accent') || '#c8c8c8', overlayColor: 'rgba(200,200,200,.12)', cursorWidth: 0 }));
        const peaks = Array.from(tr.peaks.max, (v, i) => Math.max(v, -tr.peaks.min[i]));
        ws = L.WaveSurfer.create({ container: host, height: 40, waveColor: 'rgba(160,160,160,.45)', progressColor: css('--accent') || '#c8c8c8', cursorColor: css('--fg') || '#e6e6e6', cursorWidth: 1,
          barWidth: 2, barGap: 1, barRadius: 1, peaks: [peaks], duration: tr.duration, interact: true, dragToSeek: true, autoScroll: true, autoCenter: false, hideScrollbar: false, normalize: false, plugins });
        ws.on('interaction', t => app.actions.seek(t));
        const me = ws; let added = false;
        const addRegions = () => { if (added || ws !== me) return; added = true; const p = app.store.project;
          // song structure: one marker per 4-bar phrase (song bar number + label), drops brighter
          tr.song.phrases.forEach(q => { const t = tr.song.bar1 + (q.bar - 1) * tr.barDur; if (t < tr.duration) regions.addRegion({ start: t, content: mkLabel(q.bar + ' ' + q.label), color: q.label === 'drop' ? 'rgba(236,236,236,.85)' : 'rgba(160,160,160,.35)', drag: false, resize: false }); });
          clip = regions.addRegion({ id: 'clip', start: p.inT, end: p.outT, color: 'rgba(200,200,200,.16)', drag: true, resize: true, minLength: tr.barDur * .99 });
          ws.setTime(app.clock.time()); };
        ws.once('ready', addRegions); ws.once('decode', addRegions); setTimeout(addRegions, 400);
        regions.on('region-updated', r => { if (r !== clip) return; const a = snap(r.start), b = Math.max(a + tr.barDur, snap(r.end)); app.actions.setClip(a, b, 'drag'); });
        void pr; return;
      } catch (e) { console.warn('[u2c] wavesurfer failed, using fallback timeline', e); destroy(); }
    }
    buildFallback();
  }
  function buildFallback() {
    const cv = document.createElement('canvas'); cv.id = 'tlFallback'; host.appendChild(cv); const g = cv.getContext('2d'); let drag = null;
    const X = t => t / track.duration * cv.clientWidth, T = x => clamp(x / cv.clientWidth) * track.duration;
    fallback = { draw(t) { const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const pr = app.store.project, acc = css('--accent') || '#c8c8c8'; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = '10px JetBrains Mono, monospace'; g.textBaseline = 'top';
      track.bars.forEach((bt, k) => { const x = X(bt); g.fillStyle = k % 4 ? 'rgba(128,128,128,.2)' : 'rgba(128,128,128,.6)'; g.fillRect(x, k % 4 ? 12 : 2, 1, k % 4 ? 6 : 16); if (k % 8 === 0) { g.fillStyle = '#8b8b8b'; g.fillText(String(k + 1), x + 3, 2); } });
      const mid = 64, hh = 40; for (let x = 0; x < w; x++) { const a = Math.floor(x / w * track.peaks.cols), v = Math.max(track.peaks.max[a], -track.peaks.min[a]), tt = x / w * track.duration; g.fillStyle = tt >= pr.inT && tt <= pr.outT ? acc : 'rgba(128,128,128,.45)'; g.fillRect(x, mid - v * hh, 1, Math.max(1, 2 * v * hh)); }
      const xi = X(pr.inT), xo = X(pr.outT); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 20, xi, h - 20); g.fillRect(xo, 20, w - xo, h - 20); g.fillStyle = acc; for (const x of [xi, xo]) { g.fillRect(x - 1, 20, 2, h - 20); g.fillRect(x - 5, 20, 10, 14); }
      g.fillStyle = css('--fg') || '#fff'; g.fillRect(X(t), 0, 1.5, h); } };
    cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, pr = app.store.project; cv.setPointerCapture(e.pointerId); drag = Math.abs(x - X(pr.inT)) < 10 ? 'in' : Math.abs(x - X(pr.outT)) < 10 ? 'out' : 'seek'; if (drag === 'seek') app.actions.seek(T(x)); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const r = cv.getBoundingClientRect(), t = snap(T(e.clientX - r.left), e.shiftKey), pr = app.store.project;
      if (drag === 'in') app.actions.setClip(Math.min(t, pr.outT - track.barDur), pr.outT, 'drag'); else if (drag === 'out') app.actions.setClip(pr.inT, Math.max(t, pr.inT + track.barDur), 'drag'); else app.actions.seek(T(e.clientX - r.left)); });
    cv.addEventListener('pointerup', () => { drag = null; });
  }
  return {
    build, destroy, snap,
    get kind() { return ws ? 'wavesurfer' : fallback ? 'canvas' : 'none'; },
    setClip(a, b) { if (clip) { try { clip.setOptions({ start: a, end: b }); } catch (_) {} } },
    setTime(t, force) { if (ws) { if (force || Math.abs(t - lastSet) > 1 / 40) { lastSet = t; try { ws.setTime(t); } catch (_) {} } } else if (fallback) fallback.draw(t); },
    zoom(px) { if (ws) { try { ws.zoom(px); } catch (_) {} } },
    recolor() { if (ws) try { ws.setOptions({ progressColor: css('--accent') }); } catch (_) {} },
  };
}
