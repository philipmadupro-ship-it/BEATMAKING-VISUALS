// Object snapping: one sorted array of snap points (markers, keys outside the dragged selection, playhead, loop in / out,
// bar lines), rebuilt when a drag starts, queried by binary search on every move. Behaviour after Kdenlive's SnapModel
// (sorted points, closest within a distance, ignore the dragged items) and Premiere's magnet; code written from scratch.
// Within the distance the highest priority wins (marker > key > playhead/loop > bar), then the nearest.

export const SNAP_PRI = { marker: 4, key: 3, playhead: 2, loop: 2, bar: 1 };

export function createSnapModel(points = []) {
  const P = points.filter((p) => Number.isFinite(p.b)).sort((a, b) => a.b - b.b);
  const lower = (b) => { let lo = 0, hi = P.length; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].b < b) lo = m + 1; else hi = m; } return lo; };
  return {
    points: P,
    /** Best point within tol beats of b, or null. */
    closest(b, tol) { let best = null; for (let i = lower(b - tol); i < P.length && P[i].b <= b + tol; i++) { const p = P[i], d = Math.abs(p.b - b), pr = p.pri ?? SNAP_PRI[p.kind] ?? 0;
        if (!best || pr > best.pr || (pr === best.pr && d < best.d)) best = { ...p, d, pr }; } return best; },
    /** Next / previous point strictly after / before b (for navigation). */
    next(b) { const i = lower(b + 1e-6); return P[i] || null; },
    prev(b) { const i = lower(b - 1e-6) - 1; return i >= 0 ? P[i] : null; },
  };
}
