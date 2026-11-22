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
    p.add_argument('--at1', type=float, default=0.35); p.add_argument('--at2', type=float, default=2.62); p.add_argument('--line1'); p.add_argument('--line2'); p.add_argument('--gain-db', type=float, default=-3); p.add_argument('--source', help='a recorded take with both lines and a pause between them (e.g. ElevenLabs): split at the longest pause'); p.add_argument('--tempo1', type=float, default=1.0); p.add_argument('--ats', help='take mode: comma list of start times, one per phrase (the take is split at every pause)')
    a = p.parse_args()
    if a.source and a.ats:   # v22.2 multi-phrase take: split at EVERY pause, place phrase i at ats[i]
        r = subprocess.run(['ffmpeg', '-v', 'info', '-i', a.source, '-af', 'silencedetect=noise=-35dB:d=0.2', '-f', 'null', '-'], capture_output=True, text=True).stderr
        st = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', r)]; en = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', r)]
        cuts = [(0.0, st[0] if st else 99)] + [(e - 0.04, (st[i + 1] if i + 1 < len(st) else 99)) for i, e in enumerate(en)]
        ats = [float(x) for x in a.ats.split(',')]; d = tempfile.mkdtemp(); ins, parts = [], []
        cuts = [c for c in cuts if c[1] - c[0] > 0.08]   # v24 (audit V3): drop slivers, then merge the shortest gaps until there is one phrase per line
        while len(cuts) > len(ats) and len(cuts) > 1:
            g = min(range(len(cuts) - 1), key=lambda i: cuts[i + 1][0] - cuts[i][1]); cuts[g:g + 2] = [(cuts[g][0], cuts[g + 1][1])]
        fx = f'highpass=f=150,lowpass=f=9000,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=80,aecho=0.8:0.4:24:0.12,volume={a.gain_db}dB'
        for i, ((c0, c1), at) in enumerate(zip(cuts, ats)):
            f = os.path.join(d, f'{i}.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(max(0, c0)), '-i', a.source, *(['-t', str(c1 - max(0, c0))] if c1 < 99 else []), f], check=True); ins += ['-i', f]; parts.append(f'[{i}:a]{fx},adelay={int(at * 1000)}:all=1,aresample=48000[p{i}]')
        n = len(parts); fc = ';'.join(parts) + ';' + ''.join(f'[p{i}]' for i in range(n)) + f'amix=inputs={n}:normalize=0:duration=longest,apad=whole_dur={a.dur},atrim=0:{a.dur},aformat=channel_layouts=stereo[o]'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[o]', '-ar', '48000', a.out], check=True)
        print(f'voice: {n} phrases from {os.path.basename(a.source)} at {ats} -> {a.out}'); return
    if a.source:   # v22.2: ElevenLabs (or any) take -> split at its longest silence -> line 1 / line 2
        r = subprocess.run(['ffmpeg', '-v', 'info', '-i', a.source, '-af', 'silencedetect=noise=-35dB:d=0.2', '-f', 'null', '-'], capture_output=True, text=True).stderr
        st = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', r)]; en = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', r)]
        gaps = [(e - s0, s0, e) for s0, e in zip(st, en) if s0 > 0.3]; _, cut0, cut1 = max(gaps) if gaps else (0, None, None)
        d = tempfile.mkdtemp(); f1, f2 = os.path.join(d, '1.wav'), os.path.join(d, '2.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.source, '-t', str(cut0), f1], check=True); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(cut1 - 0.05), '-i', a.source, f2], check=True)
        l1, l2 = f'(take) 0-{cut0:.2f}s', f'(take) {cut1:.2f}s-end'
    else:
        l1 = a.line1 or f'{speakable(a.title)}. Experimentation.'; l2 = a.line2 or 'Initiating playback.'
        d = tempfile.mkdtemp(); f1, f2 = os.path.join(d, '1.wav'), os.path.join(d, '2.wav'); tts(l1, f1); tts(l2, f2)
    fx = f'highpass=f=180,lowpass=f=7000,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,aecho=0.8:0.5:28:0.18,volume={a.gain_db}dB'
    fc = (f'[0:a]atempo={a.tempo1},{fx},adelay={int(a.at1 * 1000)}:all=1,aresample=48000[a];[1:a]{fx},adelay={int(a.at2 * 1000)}:all=1,aresample=48000[b];'
          f'[a][b]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur={a.dur},atrim=0:{a.dur},aformat=channel_layouts=stereo[o]')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f1, '-i', f2, '-filter_complex', fc, '-map', '[o]', '-ar', '48000', a.out], check=True)
    print(f'voice: "{l1}" @ {a.at1}s · "{l2}" @ {a.at2}s -> {a.out}')

if __name__ == '__main__':
    main()
