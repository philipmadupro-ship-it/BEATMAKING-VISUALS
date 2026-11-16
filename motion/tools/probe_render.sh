#!/bin/bash
# tools/probe_render.sh <name> [render.mjs args]: build the composition page + cue sheet for a variant, freeze them as
# film/probe-<name>.html + film/data/cues-probe-<name>.js, then dump every frame's metrics with tests/onset_probe.mjs.
set -e; cd "$(dirname "$0")/.."; N=$1; shift
node render.mjs --beat audio/atelmansion-3c-fmin-128.wav --title "ATELMANSION 3" --stills 0 --out out/v13/tmp "$@" >/dev/null 2>&1
H=$(ls -t film/v9-exe-nigredo-916-atelmansion-3c-fmin-128-30.html | head -1)
C=film/data/cues-exe-nigredo-916-atelmansion-3c-fmin-128-30.js
cp $C film/data/cues-probe-$N.js
sed "s#data/cues-exe-nigredo-916-atelmansion-3c-fmin-128-30.js#data/cues-probe-$N.js#" $H > film/probe-$N.html
node tests/onset_probe.mjs probe-$N.html out/v13/probe-$N.json --f0 0 --f1 ${F1:-899}
