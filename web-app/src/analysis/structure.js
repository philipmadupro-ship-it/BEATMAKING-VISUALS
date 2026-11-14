// Song structure in 4-bar phrases, ported from the v8 native analysis (u2c-motion tools/beatgrid.py):
// per-bar level (mean square of the mono mix, dB) -> energy 0..1 relative to the loudest bar (18 dB range),
// "song bar 1" = the first downbeat where the music is sounding (> -50 dB), phrases of 4 bars from bar 1,
// labels by energy relative to the loudest phrase: drop >= 0.93, 0.8..0.93 build (right before a drop) or groove,
// lower: intro before the first drop, outro after the last, break in between.
// Pure: works on the analysis object (rmsRaw at a.fps) plus a grid ({bars, barDur}).

/** Per-bar rows and labelled phrases. Returns {startIdx, bar1, bars:[{bar,t,db,energy}], phrases:[{bar,bars,t,energy,label}]}. */
export function songStructure(a, grid) {
  const fr = a.fps, n = a.frames, rows = [];
  const segDb = (t0, t1) => { const i0 = Math.max(0, Math.floor(t0 * fr)), i1 = Math.min(n, Math.floor(t1 * fr)); if (i1 <= i0) return -120;
    let s = 0; for (let i = i0; i < i1; i++) s += a.rmsRaw[i] * a.rmsRaw[i]; return 10 * Math.log10(s / (i1 - i0) + 1e-12); };
  const B = grid.bars, bd = grid.barDur;
  let startIdx = 0; while (startIdx < B.length - 1 && segDb(B[startIdx], B[startIdx] + bd) <= -50) startIdx++;
  for (let i = 0; i < B.length; i++) { if (B[i] + bd > a.duration + .01) break; rows.push({ idx: i, bar: i - startIdx + 1, t: B[i], db: segDb(B[i], B[i] + bd) }); }
  const dmax = rows.reduce((m, r) => Math.max(m, r.db), -120);
  for (const r of rows) r.energy = Math.min(1, Math.max(0, (r.db - (dmax - 18)) / 18));
  const first = rows.filter(r => r.bar >= 1), phrases = [];
  for (let j = 0; j < first.length; j += 4) { const g = first.slice(j, j + 4); phrases.push({ bar: g[0].bar, t: g[0].t, bars: g.length, energy: g.reduce((s, r) => s + r.energy, 0) / g.length }); }
  const emax = phrases.reduce((m, q) => Math.max(m, q.energy), 0) || 1;
  const drops = phrases.map((q, i) => (q.energy >= .93 * emax ? i : -1)).filter(i => i >= 0);
  phrases.forEach((q, i) => { const e = q.energy / emax;
    q.label = e >= .93 ? 'drop' : e >= .8 ? (drops.includes(i + 1) ? 'build' : 'groove') : drops.length && i < drops[0] ? 'intro' : drops.length && i > drops[drops.length - 1] ? 'outro' : 'break'; });
  return { startIdx, bar1: B[startIdx] ?? 0, bars: rows, phrases };
}

/** Song bar number (1-based, may be <= 0 before the music starts) of the bar that starts at time t. */
export function songBarAt(track, t) { return Math.round((t - track.t0) / track.barDur) - track.song.startIdx + 1; }

/** Label of the phrase holding song bar `sb`. */
export function labelAtSongBar(song, sb) { let lab = 'intro'; for (const q of song.phrases) if (q.bar <= sb) lab = q.label; return lab; }
