# Beat Visualizer Research and Build Spec

## 0. Sources and confidence
- **Verified**: kollidelabs.com/noteframe landing page (fetched), the studio screenshot (assets/ref-kollide-studio.webp).
- **Not verifiable**: app.theflowstage.com is a JS shell. The fetch returned only the name "Flowstage", and 2 searches found nothing about it. Its workflow below is the generic pattern (labelled INFERRED) used by comparable tools (Videobolt, Renderforest, Banger.show), plus what the user told us. No claims about Flowstage's real UI.
- Noteframe's per-template audio mappings are not documented publicly. They are inferred from the product copy ("kicks, notes and chords drive the visuals; every look works from audio alone") and are marked INFERRED. Section (c) is our own design.

## (a) Workflow steps

### Noteframe (verified unless marked)
1. Free Kollide account, open /noteframe/studio. A project is created per track (Projects list, name editable, "saved" indicator).
2. Drop audio (WAV/MP3/FLAC, or MIDI; optional own video/photos). Audio stays local. Only settings, MIDI and cover art sync.
3. BPM and key are read from the file name or detected from audio, with one-tap correction. Title can come from the file name ("YOUR JERK FINAL @Producer").
4. Stems or notes are analysed into lanes: melody / chords / bass / drums, plus beat markers and waveform.
5. Pick a Look in the gallery (68 looks in the screenshot, 63 in the copy). Hover plays a preview. Each look has colour variants (Original, Kollide, Green, Ice, Amber) or custom colours.
6. Scrub and choose the clip: draggable in/out handles snap to bars. The readout shows in, out, len in seconds and bars.
7. Tweak via the right tabs Beat / Video / Look / Style / Words / Post (Words = text overlays, recolour and reposition).
8. Export: cost shown in the footer ("5 cr · watermark · 226.1 s · 9:16"). In-browser render and H.264 MP4 encode (Chrome or Edge recommended). Free tier: 30 fps, small watermark. Paid: 60 fps, no watermark, -14 LUFS. Credits are charged only when the export finishes. Previewing is free.
9. Extras: "Make with AI" (an LLM writes a sandboxed visualizer), AI Mode (auto-composes a design from tempo, energy and key; re-roll for variants).

### Flowstage (INFERRED, unverified)
1. Claim or landing link (`/claim?facet=...`) leads to an account or onboarding.
2. Upload the track.
3. The app auto-generates N (about 4-8) template variants of the same track, shown as a grid of live or looping previews.
4. The user picks one (favourite or regenerate).
5. A light editor: colours, text, cropping, aspect ratio.
6. Export or post: download MP4, or share direct to socials.
- **Pattern to copy**: no blank canvas. The first screen after upload is a grid of already-rendered variants of the user's own track.

## (b) UI layout spec (our app)
- **Top bar (48px)**: wordmark / project name (editable) / saved dot / Undo-Redo / Export button (primary, shows format and duration).
- **Left, canvas stage**: centred preview, letterboxed in a dark field.
  - Meta text top-left: "9:16 · 1080×1920 · 30 fps".
  - Top-right: Fit | 100% toggle, Safe area (overlay of IG UI zones: top 250px, bottom 340px, sides 60px), Fullscreen.
  - Aspect toggle 9:16 / 16:9 (plus 1:1 optional).
- **Variant row** under the canvas: label "VARIANT" plus colour chips (2-circle swatch + name). 5 palettes per template.
- **Transport**: play/pause, restart, loop toggle, timecode (mm:ss.mmm), bar counter ("bar 0.4" = bar.beat), in / out / len (s and bars), volume.
- **Timeline** (about 120px): bar ruler, note lanes (melody, chords, bass, drums, each coloured, with counts in a legend), waveform below, playhead, in/out handles snapping to bars, legend "drag handles · snaps to bars".
- **Right panel (about 450px)** with tabs:
  - **Beat**: BPM (editable, tap tempo, x2 and /2), key, downbeat offset, sensitivity.
  - **Look**: search, category chips with counts (All, Vector, Print, Blob, Wave, Spectrum, Interface, Depth...), 2-column card grid (thumbnail, name, category, optional popularity badge). Hover plays a live preview.
  - **Style**: palette, grain, glow, intensity.
  - **Words**: title, BPM, key, producer tag, timecode toggles, font, position.
  - **Video / Post**: background media, watermark, export options.
- **Export footer bar**: credits or watermark note, duration, format, button.
- **Landing-after-upload screen (Flowstage pattern)**: grid of 6 auto-rendered variants (our 6 templates on the user's audio), click to open the studio.
- Responsive: under 900px the right panel becomes a bottom sheet.

## (c) Six original templates (Canvas2D + WebAudio)
Shared analysis features per frame (see d): `sub` (20-60 Hz), `bass` (60-200), `lowMid` (200-500), `mid` (500-2k), `hi` (2k-8k), `air` (8k-16k), each 0-1 normalised with an auto-gain. `rms`, `kick` (low-band onset), `snare` (mid/hi onset), `beatPhase` (0-1 within the beat), `barPhase`, `flux` (spectral flux). Envelope follower: attack 0.5, release 0.08-0.2.

1. **Slicer Grid**
   - Visual: black 8×8 grid of rectangular tiles tiled with a monochrome halftone portrait or the cover art. Tiles are shifted and scaled like a sample chopper.
   - Mapping: `kick` triggers a random column offset (translateY ±40px, decay 120ms). `snare` flips 3 random tiles to the inverted palette for 80ms. `bass` drives the global grid gap (2-14px). `hi` drives tile jitter (0-3px). `barPhase` sweeps a vertical scan line.

2. **Meter Deck** (vector DAW UI)
   - Visual: skeuomorphic-flat panel: 2 big circular dials, a row of 16 vertical bar meters, a red clip LED, a central numeric readout (dB).
   - Mapping: dial needle angle = `rms`, with an inertial spring (k=0.18, damping 0.7). Dial 2 = `bass`. 16 bars = 16 log-spaced FFT bands, with peak-hold dots that fall at 0.5%/frame. Clip LED lights when `kick` > 0.8. Readout = 20·log10(rms). Panel shakes by `kick`×3px.

3. **Radial Bloom**
   - Visual: centred ring of 96 spokes, soft additive glow, rotating slowly, on a dark gradient.
   - Mapping: spoke length = FFT bin i (log-spaced, smoothed). Ring radius = 0.25 + 0.06·`kick` envelope. Rotation speed = 0.1 + 0.6·`mid` rad/s. Hue = base + 40·`beatPhase`. Bloom alpha = `hi`. A shockwave ring is spawned on each `snare` (radius grows with ease-out, 500ms).

4. **Waveform Terrain**
   - Visual: 40 stacked scrolling waveform lines in a perspective (Joy-Division style), each line is a previous frame's time-domain slice.
   - Mapping: newest line = the time-domain buffer (amplitude × `rms` gain). Scroll speed = BPM/60 lines per beat. Line fill occludes the lines behind. Line colour brightness = `hi`. Camera tilt = ±4° modulated by `lowMid`. `kick` bumps global amplitude ×1.4 for 100ms.

5. **Beat Poster** (typographic)
   - Visual: off-white paper with grain. Huge title text, BPM numeral, key, producer tag, a bar counter. Bold black and one accent colour.
   - Mapping: title scale = 1 + 0.08·`kick` envelope. On `snare`, the accent block flashes behind the text (80ms). BPM numeral ticks up and down ±0.5 with `beatPhase` (a pulse circle radius = 1-`beatPhase`). `air` drives grain opacity. Every bar (`barPhase` wrap) a ticker word advances. Ink "drip" length grows with `sub`.

6. **Stem Roll** (piano-roll)
   - Visual: horizontal lanes (melody / chords / bass / drums) with notes scrolling right to left toward a playhead, with note rectangles glowing as they cross it.
   - Mapping: note rectangles come from the analysis (per-band onset lists: drums = low and hi onsets, bass = bass-band peaks with pitch estimate, melody = mid-band peaks). Glow on crossing is proportional to the band energy of the lane. Lane height pulses with its band. Playhead flash on `kick`. Scroll speed locked to BPM (one bar = 25% of the width).

## (d) Technical approach

### Decoding and analysis (offline, once on load)
- `AudioContext.decodeAudioData(file.arrayBuffer())` gives an `AudioBuffer`. Mixdown to mono.
- **Waveform peaks**: for ~2000 columns across the clip, store min/max per bucket (Float32Array). Draw the timeline from the peaks with Canvas2D.
- **Offline features** (once, so the render is deterministic and export needs no live analysis):
  - STFT, FFT size 2048, hop 512 (use an inline radix-2 FFT, or `OfflineAudioContext` + `AnalyserNode` stepping). Compute log-spaced bands (the 6 bands above plus 16 or 96 display bins) per hop.
  - **Spectral flux** per hop: sum of positive differences of the log-magnitude spectrum. Low-band flux = kick onset signal. Mid/hi flux = snare/hat signal.
  - **Onset picking**: adaptive threshold (median over ±0.5 s × 1.5 + offset), local-maximum peak picking, minimum gap 80 ms.
  - **BPM**: autocorrelation of the onset-strength envelope over lags for 60-180 BPM, with a comb-filter score (lag, 2×lag, 4×lag). Fold into 80-160. Parabolic interpolation for precision. Optionally read BPM from the file name (regex `(\d{2,3})\s?bpm`). Provide tap-tempo and x2 / /2 overrides.
  - **Beat grid**: choose the phase offset maximizing the sum of onset strengths on the grid. Downbeat = the phase (of 4 beats) with the most low-band energy. User-adjustable offset.
  - **Key** (optional): chroma from the mid FFT bins, correlate with Krumhansl major/minor profiles.
  - Store all as typed arrays indexed by frame (`t·fps`). The renderer samples with linear interpolation and applies envelope followers.
- **Live path** (fallback or playback preview): `AnalyserNode` (`fftSize` 2048, `smoothingTimeConstant` 0.6) for `getByteFrequencyData` and `getFloatTimeDomainData`. Prefer the precomputed features, as they are identical in preview and export.

### Rendering
- One `render(t, features, params, ctx)` pure function per template, with a fixed logical resolution (1080×1920 or 1920×1080). Preview canvas scaled with CSS (Fit/100%). Time comes from `audioCtx.currentTime` minus start offset in preview, and from a frame counter in offline export.
- Safe-area overlay is a DOM layer, not drawn into the canvas.

### Export (in-browser)
- Two modes:
  1. **Realtime** (simple, works everywhere): play the clip once through the pipeline below and record.
  2. **Faster than realtime** (optional, Chrome/Edge): WebCodecs `VideoEncoder` + `mp4-muxer`/`webm-muxer` (from CDN with a pinned version), with audio encoded from the `AudioBuffer` via `AudioEncoder`. Frame-exact, deterministic due to the precomputed features.
- Realtime pipeline:
  ```js
  const canvas = Object.assign(document.createElement('canvas'), {width:1080,height:1920});
  const vStream = canvas.captureStream(30);                   // 30 fps (60 optional)
  const dest = audioCtx.createMediaStreamDestination();
  src.connect(dest); src.connect(audioCtx.destination);       // monitor + record
  const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm']
    .find(m => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:12e6, audioBitsPerSecond:192e3});
  const chunks=[]; rec.ondataavailable=e=>chunks.push(e.data);
  rec.onstop=()=>download(new Blob(chunks,{type:mime}));
  rec.start(1000); src.start(0, inPoint); /* stop at outPoint */
  ```
- Notes: MP4 in MediaRecorder works in Chrome 126+ and Safari, otherwise fall back to webm (flag clearly, offer "convert" hint). Keep the tab foregrounded (throttled rAF breaks realtime capture). Drive drawing with `requestAnimationFrame` and call `vTrack.requestFrame()` if using `captureStream(0)`. Disable the preview and DOM overlays during export. Show a progress bar (elapsed / len) and a cancel button.
- Formats: set canvas size per aspect (9:16 = 1080×1920, 16:9 = 1920×1080), then re-run layout. Templates must read `W,H` and use relative units.
- Watermark: draw a small text in the last step of `render` on free exports (toggle).
- Max safe duration guidance: warn above 3 min for realtime mode (memory of chunks).

## Build priorities
1. Decode and waveform and BPM/onset analysis, timeline with in/out snapping.
2. 2 templates (Radial Bloom, Beat Poster) plus text overlays.
3. Realtime export 9:16 and 16:9.
4. Remaining templates and variants, auto-variant grid after upload.
5. WebCodecs export (optional).
