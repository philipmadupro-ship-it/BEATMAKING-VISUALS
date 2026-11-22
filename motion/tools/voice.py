#!/usr/bin/env python3
"""voice.py: the lab voice for the U2C intro (offline Piper TTS, female en_GB "jenny_dioco"), placed on the pre-roll timeline.

  python3 tools/voice.py --title "ATELMANSION 3" --dur 34 --out voice.wav [--at1 0.6] [--at2 3.0] [--line1 "..."] [--line2 "..."]

Line 1 (default "<title>. Experimentation.") starts at --at1 s, line 2 (default "Initiating playback.") at --at2 s, so it ends just before the
cursor clicks play (pre-roll 4 s). Lab treatment: high-pass 180 Hz, low-pass 7 kHz, light compression, a short room (ffmpeg). Output: 48 kHz stereo.
The model lives in /home/user/research/voices (never in the public repo).
"""
import argparse, os, re, subprocess, tempfile, wave
MODEL = os.environ.get('U2C_VOICE', '/home/user/research/voices/en_GB-jenny_dioco-medium.onnx')

def speakable(title):
    t = re.sub(r'(?<=[A-Za-z])(\d)', r' \1', str(title)).replace('_', ' ')
    nums = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'}
    return ' '.join(nums.get(w, w) for w in t.split()).title()

def tts(text, path):
    from piper import PiperVoice
    v = PiperVoice.load(MODEL)
    with wave.open(path, 'wb') as w:
        try: v.synthesize_wav(text, w)
        except AttributeError: v.synthesize(text, w)

def main():
    p = argparse.ArgumentParser(); p.add_argument('--title', required=True); p.add_argument('--dur', type=float, required=True); p.add_argument('--out', required=True)
    p.add_argument('--at1', type=float, default=0.35); p.add_argument('--at2', type=float, default=2.62); p.add_argument('--line1'); p.add_argument('--line2'); p.add_argument('--gain-db', type=float, default=-3)
    a = p.parse_args()
    l1 = a.line1 or f'{speakable(a.title)}. Experimentation.'; l2 = a.line2 or 'Initiating playback.'
    d = tempfile.mkdtemp(); f1, f2 = os.path.join(d, '1.wav'), os.path.join(d, '2.wav'); tts(l1, f1); tts(l2, f2)
    fx = f'highpass=f=180,lowpass=f=7000,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,aecho=0.8:0.5:28:0.18,volume={a.gain_db}dB'
    fc = (f'[0:a]{fx},adelay={int(a.at1 * 1000)}:all=1,aresample=48000[a];[1:a]{fx},adelay={int(a.at2 * 1000)}:all=1,aresample=48000[b];'
          f'[a][b]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur={a.dur},atrim=0:{a.dur},aformat=channel_layouts=stereo[o]')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f1, '-i', f2, '-filter_complex', fc, '-map', '[o]', '-ar', '48000', a.out], check=True)
    print(f'voice: "{l1}" @ {a.at1}s · "{l2}" @ {a.at2}s -> {a.out}')

if __name__ == '__main__':
    main()
