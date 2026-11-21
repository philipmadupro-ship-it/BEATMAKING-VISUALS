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
  "surface": "surface",
  "now": "",
  "stage": "",
  "inserts": "inserts",
  "meta": "metadata"
 },
 "player": {
  "nav": ["PLAYER", "LIBRARY", "ANALYSIS", "TOOLS", "PROJECTS", "ARCHIVE"],
  "vol": "VOL.03",
  "tracks": ["{title}", "ATELMANSION 2", "ATELMANSION 1"],
  "mark": "U2C\u00ae",
  "coords": ["48.8566\u00b0 N", "2.3522\u00b0 E"],
  "tabs": ["PLAYER", "ANALYSIS", "MIX", "MASTER", "ARCHIVE"],
  "sub": "U2C \u00b7 ARCHIVE \u00b7 VOL.03",
  "info": "{bpm} BPM \u2022 {key}",
  "pill": "U2C",
  "now": { "title": "{title}", "sub": "U2C \u00b7 VOL.03 \u00b7 {bpm} BPM \u00b7 {key}" },
  "caption": ["{title}", "PROD. {producer}", "VOL.03", "U2C\u00ae"],
  "meta": { "labels": ["FORMAT", "DURATION", "SIZE", "DATE", "TAGS"], "tags": "EXPERIMENTAL, TRAP" }
 },
 "result": {
  "title": "{Title}",
  "meta": "{bpm} BPM  ·  {key}  ·  4/4",
  "producer": "prod. {producer}",
  "measure": "I {lufs} LUFS · LRA {lra} LU · TP {tp} dBTP"
 },
 "intro": {
  "title": "{title}",
  "credit": "prod. {producer}",
  "cards": [
   "{title}",
   "",
   "",
   "",
   ""
  ]
 },
 "hud": {
  "left": "{title}",
  "right": "{bpm} BPM · {key}",
  "bottomLeft": "{bbt}",
  "bottomRight": "prod. {producer}"
 }
};
