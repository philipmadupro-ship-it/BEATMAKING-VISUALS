// Clip manager: the per-frame clip data of a section (analysis worker) and one v8 film per aspect, cached by
// section + loudness (LRU of 4). The studio's section, the home grid's preview loop and batch jobs each get theirs.
import { requestClipData } from '../analysis/index.js';
import { filmData, clipBarLabels } from '../v8/data.js';
import { createFilm } from '../v8/film.js';

export function createClipManager(app) {
  const cache = new Map(); // key -> {key, ready, D, labels, films: {}, promise}
  const TID = new WeakMap(); let tid = 0; const trackId = (tr) => { let v = TID.get(tr); if (!v) { v = ++tid; TID.set(tr, v); } return v; };
  const keyOf = (tr, inT, bars, target, title) => [trackId(tr), tr.bpm, tr.t0.toFixed(5), inT.toFixed(5), bars, target, title].join('|');
  const barsOf = (tr, inT, outT) => Math.max(1, Math.round((outT - inT) / tr.barDur));
  function entry(inT, outT, opts = {}) {
    const st = app.store, tr = st.session.track, buf = st.session.buffer; if (!tr || !buf) return null;
    const p = st.project, bars = barsOf(tr, inT, outT), target = opts.target ?? p.export.loudness, title = opts.title ?? p.title, k = keyOf(tr, inT, bars, target, title);
    let e = cache.get(k);
    if (!e) {
      e = { key: k, ready: false, D: null, labels: [], films: {}, inT, bars };
      e.promise = requestClipData(buf, { inT, bars, beat: tr.spb, fps: 30, target: target === 'off' ? 'off' : +target, onProgress: opts.onProgress }).then((cd) => {
        const t2 = st.session.track; if (t2 !== tr) return e;   // a newer analysis replaced the track meanwhile
        e.D = filmData(cd, tr, { title, inT }); if (p.key) e.D.key = p.key.toUpperCase(); e.labels = clipBarLabels(e.D); e.ready = true; app.studio && app.studio.markDirty(); (opts.onReady || (() => {}))(e); return e; });
      cache.set(k, e); if (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return e;
  }
  return {
    entry,
    /** The studio section (project in/out). */
    current: () => { const p = app.store.project; return entry(p.inT, p.outT); },
    film(e, aspect) { if (!e || !e.ready) return null; return e.films[aspect] || (e.films[aspect] = createFilm({ D: e.D, assets: app.assets, aspect })); },
    async ensure(inT, outT, opts) { const e = entry(inT, outT, opts); if (!e) return null; await e.promise; return e; },
    clear() { cache.clear(); },
  };
}
