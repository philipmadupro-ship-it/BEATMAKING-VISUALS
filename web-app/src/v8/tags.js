// Every on-screen text of the v8 looks (u2c-motion tags.default.json). {vars}: title, Title, producer, bpm, bpm2, key,
// keyShort, stage, stageN, look, experiment, date, today, lufs, srcLufs, lra, tp, bars, titleWord, angle, tc, bbt, songBar.
// The cue sheet's `tags` deep-merges over this; any leaf can also be keyframed as a text track (tag.<path>).
export const DEFAULT_TAGS = {
 "title": "{title}",
 "producer": "@uche2crazy",
 "experiment": "",
 "date": "{today}",
 "windows": {
  "logo": "chain",
  "elephant": "pendant",
  "wave": "waveform",
  "spectrum": "spectrum",
  "spectro": "spectrogram",
  "eq": "eq",
  "loud": "levels",
  "gonio": "imager",
  "scope": "scope",
  "surface": "surface"
 },
 "result": {
  "title": "{Title}",
  "meta": "{bpm} BPM  ·  {key}  ·  4/4",
  "producer": "prod. {producer}",
  "measure": "I {lufs} LUFS · LRA {lra} LU · TP {tp} dBTP"
 },
 "hud": {
  "left": "{title}",
  "right": "{bpm} BPM · {key}",
  "bottomLeft": "{bbt}",
  "bottomRight": "prod. {producer}"
 }
};
