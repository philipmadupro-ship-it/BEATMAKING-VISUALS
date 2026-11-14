#!/usr/bin/env bash
# filmstrip.sh <video> <out.png> [cols=8] [rows=2] : evenly spaced frames tiled, with timecode burnt in.
set -euo pipefail
v="$1"; out="$2"; cols="${3:-8}"; rows="${4:-2}"
n=$((cols * rows)); dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$v")
fps=$(python3 -c "print(${n}/${dur})")
ffmpeg -v error -y -i "$v" -vf "fps=${fps},scale=270:-2,drawtext=text='%{pts\:hms}':x=8:y=8:fontsize=16:fontcolor=0xc8c8c8:box=1:boxcolor=0x161616@0.8,tile=${cols}x${rows}:padding=6:color=0x161616" -frames:v 1 "$out"
echo "$out"
