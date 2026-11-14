#!/usr/bin/env bash
# All v6 deliverables for the ATELMANSION 3 beat (see README.md for the single-render CLI).
set -euo pipefail
cd "$(dirname "$0")/.."
B=audio/atelmansion-3c-fmin-128.wav; T="ATELMANSION 3"
r() { node render.mjs --beat "$B" --title "$T" --filmstrip "$@" 2>&1 | grep -E "mp4|png" ; }
r --stage nigredo    --aspect 9:16 --len 30 --rebuild
r --stage albedo     --aspect 9:16 --len 30
r --stage citrinitas --aspect 9:16 --len 30
r --stage rubedo     --aspect 9:16 --len 30
r --stage nigredo    --aspect 9:16 --len 15 --rebuild
r --stage nigredo    --aspect 9:16 --len 60 --rebuild
r --stage nigredo    --aspect 16:9 --len 60
r --stage rubedo     --aspect 9:16 --len 60
r --stage rubedo     --aspect 16:9 --len 60
echo ALL DONE
