// Every on-screen text of the v8 looks (u2c-motion tags.default.json). {vars}: title, Title, producer, bpm, bpm2, key,
// keyShort, stage, stageN, look, experiment, date, today, lufs, srcLufs, lra, tp, bars, titleWord, angle, tc, bbt, songBar.
// The cue sheet's `tags` deep-merges over this; any leaf can also be keyframed as a text track (tag.<path>).
export const DEFAULT_TAGS = {
 "title": "{title}",
 "producer": "@uche2crazy",
 "experiment": "EXP-03",
 "date": "{today}",
 "boot": [
  "> U2C.EXE  // {look} MODE",
  "> load {experiment} \"{title}\"",
  "> trial {bpm2} BPM · {key}",
  "> stage {stageN}: {stage}",
  "> run_"
 ],
 "windows": {
  "logo": "chains.dll",
  "elephant": "elephant.sys",
  "wave": "session.exe",
  "spectrum": "spectrum.vst",
  "spectro": "spectrogram.vst",
  "eq": "eq.vst",
  "loud": "loudness.exe",
  "gonio": "gonio.scope",
  "scope": "scope.osc",
  "surface": "surface.gl",
  "terminal": "terminal",
  "result": "result.txt"
 },
 "codes": {
  "prefix": "SPC",
  "trial": "TRIAL {bpm}"
 },
 "specimen": [
  "SPECIMEN 05",
  "ELEPHANT · {stage}",
  "CHAIN WAVE · T0 = 2 BEATS"
 ],
 "notes": {
  "loud_old": "SRC {srcLufs} LUFS",
  "loud_new": "→ {lufs} ✓ mastered",
  "spectrum": "808 lives here",
  "wave": "DROP A — we are here",
  "gonio": "corr > 0 ✓ mono-safe",
  "eq": "warm low end vs pink",
  "elephant": "θ = {angle}°"
 },
 "stamps": {
  "clock": [
   "TRIAL {bpm}",
   "GRID LOCKED"
  ],
  "result": [
   "RESULT: POSITIVE",
   "{date}"
  ]
 },
 "result": {
  "header": "{experiment} · RESULT",
  "title": "{Title}",
  "meta": "{bpm} BPM  ·  {key}  ·  4/4",
  "producer": "prod. {producer}",
  "cta": "full beat → link in bio",
  "measure": "I {lufs} LUFS · LRA {lra} LU · TP {tp} dBTP"
 },
 "bigwords": [
  "{bpm}",
  "{keyShort}",
  "U2C",
  "{titleWord}",
  "DROP",
  "BPM"
 ],
 "hud": {
  "left": "{experiment} · {stage}",
  "rec": "REC {tc}",
  "bottomLeft": "BAR {bbt} · SONG {songBar}",
  "bottomRight": "prod. {producer}"
 }
};
