"""Local transcription with faster-whisper (CPU, int8).
Usage: .venv/bin/python tools/transcribe.py <audio> [model=tiny.en] > words.json
Audio is decoded with the system ffmpeg (avoids a PyAV version mismatch) to 16 kHz mono float32."""
import json, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel
path = sys.argv[1]; name = sys.argv[2] if len(sys.argv) > 2 else "tiny.en"
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                     check=True, capture_output=True).stdout
audio = np.frombuffer(pcm, np.float32)
model = WhisperModel(name, device="cpu", compute_type="int8")
segs, info = model.transcribe(audio, word_timestamps=True, vad_filter=True)
out = [{"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()} for s in segs for w in s.words]
print(json.dumps({"language": info.language, "words": out}, indent=1))
