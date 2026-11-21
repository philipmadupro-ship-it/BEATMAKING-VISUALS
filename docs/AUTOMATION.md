# Automating U2C videos (Python)

Everything runs through `tools/u2c.py`. The web app (U2C Studio) is where you design; Python renders the final files with the native renderer, so the two always match.

## The loop

1. **Design in U2C Studio**:
   - drop your covers in **Media**;
   - edit the timeline;
   - check **Review**, where every word in the video is editable.
2. **Save the cue sheet**: Export tab → *Cue sheet .json*. It holds every key, look, stage and text edit.
3. **Render with Python**, using the same sheet and the same covers:

```bash
python3 tools/u2c.py render --beat beats/atelmansion.wav --cues atelmansion.cues.json --covers covers/atelmansion/ -s nigredo,rubedo -a 9:16,16:9 --len 30
```

## Commands

| Command | What it does |
|---|---|
| `covers DIR\|IMG… [--web]` | Installs up to 5 images as the covers. Slot 0 is the beat cover, 1-4 are the browse covers. They're center-cropped to 1024 px. A file named `cover*`, `beat*` or `0*` goes first. `--web` also writes them into `web-app/assets/covers`, which is in the **public** repo, so don't commit them if they're private. |
| `render [-s stages] [-a aspects] [--len s] [--beat WAV] [--cues JSON] [--covers DIR] [--tags JSON] [--hook N]` | Final MP4s, both aspects in parallel. Short lengths get a `-15s`-style suffix, so they never overwrite the full render. |
| `stills -t 0.3,12 …` | PNG stills plus a contact sheet. Takes the same options as `render`. |
| `review VIDEO` | Key-moment strip plus the loop-seam check. |
| `batch MANIFEST.json` | Many beats in one go (below). |
| `test` | Web app meters plus the smoke test. |
| `sync` / `stage FILE…` | Web app → native renderer / → artifact publish folder. |

## Batch manifest

```json
{
  "defaults": { "look": "player", "aspects": ["9:16", "16:9"], "lengths": [30], "stages": ["nigredo"] },
  "jobs": [
    { "name": "atelmansion", "beat": "beats/atelmansion.wav", "covers": "covers/atelmansion", "cues": "sheets/atelmansion.json", "stages": ["nigredo", "rubedo"] },
    { "name": "night-lab", "beat": "beats/night-lab.wav", "covers": "covers/night-lab", "title": "NIGHT LAB", "lengths": [15, 30] }
  ]
}
```

```bash
python3 tools/u2c.py batch beats.json
```

Each job renders stages × aspects × lengths into `deliver-v14/<name>/`. Relative paths are relative to the manifest. Covers go back to the defaults after each job.
