#!/usr/bin/env bash
# render.sh <variant A|B|C> <916|169> <out.mp4> [quality=delivery]
# HyperFrames renders the composition (deterministic, seeked frame by frame in headless Chromium);
# ffmpeg then muxes the -14 LUFS master as AAC 320k / 48 kHz (video stream copied) and reports loudness.
set -euo pipefail
out_abs="$(realpath -m "$3")"
cd "$(dirname "$0")/../film"
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_NO_UPDATE_CHECK=1
v="$1"; aspect="$2"; out="$out_abs"; q="${4:-delivery}"
comp=index.html; [ "$aspect" = "169" ] && comp=wide.html
tmp="renders/${v}-${aspect}-video.mp4"
npx hyperframes render . -c "$comp" -o "$tmp" --variables "{\"variant\":\"$v\"}" --video-bitrate 12M --max-bitrate 14M --fps 30 --quiet >/dev/null
mkdir -p "$(dirname "$out")"
ffmpeg -v error -y -i "$tmp" -i assets/clip.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 \
  -movflags +faststart -shortest "$out"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -of csv=p=0 "$out" | tr '\n' ' '
ffmpeg -hide_banner -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -A14 Summary | grep -E "I:|Peak:" | tr -s ' ' | tr '\n' ' '; echo
