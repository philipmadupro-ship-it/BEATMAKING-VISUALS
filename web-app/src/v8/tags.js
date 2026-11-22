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
 "voice": { "number": "01", "lines": ["EXPERIMENTATION N\u00ba {n}", "BY UCHE2CRAZY", "{title}"], "ats": "0.7,3.0,5.0", "durs": "2.0,1.6,1.3", "style": "smooth, confident, slightly clinical, like a lab announcement" },
 "ground": { "vertical": "U2C \u00b7 NO SIMULATION \u00b7 EYES EVERYWHERE", "words": ["{titleWord}", "LAB TEST", "NO SIMULATION"], "notes": ["SUBJECT {title}|{bpm} BPM \u00b7 {key}", "NO SIMULATION|IT'S GONNA BE TRUE", "SIGNAL DETECTED|SOURCE: U2C LAB", "PROD. {producer}|ALL RIGHTS RESERVED", "ENTRY ONE|FIELD REPORT", "WARNING|UNSTABLE MATERIAL"] },
 "social": {
  "caption": "{title} \u00b7 {bpm} BPM \u00b7 {key}. this beat failed the lab test. comment LAB for the file \ud83e\uddea",
  "hashtags": "#typebeat #producer #beatmaker #flstudio #y2k #prod{producer}",
  "hooks": ["THIS BEAT FAILED THE LAB TEST", "DO NOT PRESS PLAY", "EXPERIMENT #003: THE DROP"],
  "title": "EXPERIMENT_{titleWord}.EXE",
  "hook": "THIS BEAT FAILED THE LAB TEST",
  "cta1": { "title": "U2C ALERT", "body": "COMMENT \"LAB\"", "sub": "FOR THE FREE DOWNLOAD" },
  "cta2": { "title": "U2C SYSTEM", "body": "FULL BEAT: LINK IN BIO", "sub": "{bpm} BPM \u00b7 {key} \u00b7 PROD. {producer}" },
  "outro": { "title": "U2C LAB", "body": "CLOSE PROJECT?", "sub": "{title} \u00b7 SAVED TO THE LAB" },
  "terminal": ["LOADING {titleWord}.WAV", "ANALYSING\u2026 {bpm} BPM \u00b7 {key}", "LAB TEST: FAILED", "EXPORT COMPLETE"]
 },
 "player": {
  "nav": ["PLAYER", "LIBRARY", "ANALYSIS", "TOOLS", "PROJECTS", "ARCHIVE"],
  "vol": "",
  "tracks": [],
  "mark": "U2C\u00ae",
  "coords": [],
  "tabs": ["PLAYER"],
  "inserts": ["SCOPE", "LIMITER", "WIDTH", "3D"],
  "detect": ["{title}", "{bpm} BPM", "{key}", "PROD. {producer}"],
  "sub": "U2C \u00b7 ARCHIVE",
  "info": "{bpm} BPM \u2022 {key}",
  "pill": "U2C",
  "now": { "title": "{title}", "sub": "U2C \u00b7 {bpm} BPM \u00b7 {key}" },
  "caption": ["{title}", "PROD. {producer}", "U2C\u00ae"],
  "meta": { "labels": ["NAME", "BPM", "KEY", "FORMAT", "DURATION", "SIZE", "DATE", "STATUS"], "tags": "EXPERIMENTAL, TRAP", "status": "UNSTABLE", "subject": "SUBJECT" }
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
