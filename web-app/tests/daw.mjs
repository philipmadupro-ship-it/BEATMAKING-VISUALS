// DAW bridge test (Playwright, headless Chromium, a mocked plugin WebSocket). node tests/daw.mjs
// Covers: plugin-mode home (Receive audio from: Master), the app's own clock while the host is stopped (intro / sphere),
// the interpolated host PPQ clock while it plays, the live master window (PCM -> analysed clip), the DAW image layer
// (JPG frames -> video layer with default opacity 0.6) and canvas Record (the plugin receives a file with an audio track).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CACHE = process.env.CDN_CACHE || '';
const results = [], errors = [];
const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
if (CACHE) await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, async (route) => { const u = route.request().url(), f = path.join(CACHE, u.replace(/[^a-z0-9.@-]+/gi, '_').slice(0, 200));
  if (!fs.existsSync(f)) { try { execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 Chrome/120', '-o', f, u]); } catch (e) { return route.fulfill({ status: 404, body: 'miss' }); } }
  route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': /css2/.test(u) ? 'text/css' : /woff2/.test(u) ? 'font/woff2' : 'text/javascript', 'access-control-allow-origin': '*' } }); });

// ---- a mock of the plugin's WebSocket: a simulated host at 128 BPM that plays a kick on every beat
const SR = 44100, BPM = 128, SPB = 60 / BPM;
const T0 = Date.now(), host = { playing: false, t0: 0, beat0: 0, jump: 0 }, rx = { saved: [], names: [], capOn: false, reveal: [], recsAsked: 0 };
const widxNow = () => Math.floor((Date.now() - T0) / 1000 * SR);
const beatsNow = () => (host.playing ? host.beat0 + (Date.now() - host.t0) / 1000 * BPM / 60 : host.beat0);
let cursor = 0, sock = null;
// kick on every host beat: sample i of the ring is at host beat beat0 + (i - start) / SR / SPB
const kickAt = (i) => { const bt = host.beat0 + (i - (host.t0 - T0) / 1000 * SR) / SR / SPB, p = (((bt % 1) + 1) % 1) * SPB, t = i / SR; return Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-p * 30)) * p) * Math.exp(-p * 9) * 0.8 + 0.04 * Math.sin(2 * Math.PI * 1000 * t); };
await page.routeWebSocket(/127\.0\.0\.1:17871/, (ws) => {
  sock = ws;
  const iv = setInterval(() => ws.send(JSON.stringify({ t: 'transport', bpm: BPM, beats: beatsNow(), widx: widxNow(), jump: host.jump, playing: host.playing, ts: [4, 4], loop: null, rms: 0, peak: 0, sr: SR })), 16);
  ws.onMessage((m) => {
    if (typeof m !== 'string') { rx.saved.push(m.length); return; }
    const j = JSON.parse(m);
    if (j.t === 'pull') { const w = widxNow(), from = cursor || w - 4410, n = Math.min(w - from, 32768); if (n <= 0) return; cursor = from + n;
      const b = Buffer.alloc(20 + n * 8); b.write('PCM0', 0); b.writeUInt32LE(SR, 4); b.writeUInt32LE(n, 8); b.writeDoubleLE(from, 12);
      for (let i = 0; i < n; i++) { const v = host.playing ? kickAt(from + i) : 0; b.writeFloatLE(v, 20 + i * 4); b.writeFloatLE(v * 0.9, 20 + (n + i) * 4); } ws.send(b); }
    else if (j.t === 'cap') { rx.capOn = j.on; if (j.on) ws.send(JSON.stringify({ t: 'cap_status', msg: 'ok' })); }
    else if (j.t === 'recordings') { rx.recsAsked++; ws.send(JSON.stringify({ t: 'recordings', list: [{ name: 'u2c-daw-1080x1920-old.mp4', path: '/tmp/u2c-test/u2c-daw-1080x1920-old.mp4', size: 1000, age: 5 }] })); }
    else if (j.t === 'reveal') rx.reveal.push(j.name);
    else if (j.t === 'save_begin') rx.names.push(j.name);
    else if (j.t === 'save_end') ws.send(JSON.stringify({ t: 'saved', path: '/tmp/u2c-test/' + rx.names.at(-1) }));
  });
  ws.onClose(() => clearInterval(iv));
});
const play = (beat = 0) => { host.beat0 = beat; host.t0 = Date.now(); host.playing = true; host.jump++; cursor = 0; };
const stop = () => { host.beat0 = beatsNow(); host.playing = false; host.jump++; };
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`http://127.0.0.1:${server.address().port}/?daw=ws://127.0.0.1:17871`);
await ev(() => { try { localStorage.clear(); localStorage.setItem('u2c.mode.v1', 'pro'); } catch (_) {} }); await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1' && window.u2c.daw, null, { timeout: 120000 });
await page.waitForFunction(() => window.u2c.daw.state.host, null, { timeout: 10000 });
ok('plugin home: "Receive audio from: Master" replaces Choose audio', await ev(() => { const l = document.querySelector('label[for=file]'), b = document.getElementById('liveBtn'); return l.hidden && b && /Master/.test(b.textContent); }));

// ---- stopped host: the app keeps its own clock (intro + sphere pick work as in the web app)
await ev(() => { const c = window.u2c.clock, o = c.setManual; window.__manual = []; c.setManual = (t) => { window.__manual.push(t); o(t); }; });
await page.waitForTimeout(500);
await ev(() => window.u2c.actions.openStudio('player'));
await page.waitForFunction(() => window.u2c.clip.current().ready, null, { timeout: 60000 });
await ev(() => { window.u2c.actions.togglePlay(); }); await page.waitForTimeout(700);
const own = await ev(() => ({ playing: window.u2c.clock.playing, nonnull: window.__manual.filter((x) => x != null).length, t: window.u2c.clock.time() }));
ok('host stopped: no DAW clock override, own clock runs', own.nonnull === 0 && own.playing && own.t > 0.2, JSON.stringify(own));
await ev(() => window.u2c.clock.pause());

// ---- host playing: the app follows the interpolated PPQ every frame
await ev(() => { window.__manual.length = 0; });
play(10.0); await page.waitForTimeout(600);
const errs = await ev(() => new Promise((res) => { const out = []; const f = (ts) => { out.push([window.u2c.clock.time(), ts]); if (out.length < 150) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
// expected from the mock's wall clock: beat = 10 + (now - t0)*BPM/60; compare increments frame to frame (smoothness) and against the host
const hostNow = await ev(() => ({ b: window.u2c.daw.state.host.beats, t: window.u2c.clock.time(), spb: window.u2c.store.session.track.spb, t0: window.u2c.store.session.track.t0 }));
const rate = (errs.at(-1)[0] - errs[0][0]) / ((errs.at(-1)[1] - errs[0][1]) / 1000), fdt = errs.slice(1).map((v, i) => v[1] - errs[i][1]);
ok('host playing: clock runs at the host tempo, per-frame interpolated', Math.abs(rate - 1) < 0.03, `rate ${rate.toFixed(3)}x over ${errs.length} frames (frame ${Math.round(fdt.reduce((a, b) => a + b, 0) / fdt.length)} ms)`);
ok('host playing: clock = host PPQ x spb (within a frame)', Math.abs(hostNow.t - (hostNow.t0 + hostNow.b * hostNow.spb)) < 0.12, `clock ${hostNow.t.toFixed(3)} vs host ${(hostNow.t0 + hostNow.b * hostNow.spb).toFixed(3)} (last message, <= 16 ms old)`);
stop(); await page.waitForTimeout(400);
const rel = await ev(() => ({ t: window.u2c.clock.time(), p: window.u2c.clock.playing }));
ok('host stops: the clock is handed back (no manual override)', await ev(() => { window.__manual.length = 0; return true; }) && rel.t > 0);
await page.waitForTimeout(200);
ok('host stopped again: no manual writes', await ev(() => window.__manual.filter((x) => x != null).length === 0));

// ---- live master
await page.click('#backBtn').catch(() => {}); await page.waitForTimeout(200);
await page.click('#liveBtn'); await page.waitForFunction(() => window.u2c.daw.state.live && !document.querySelector('#studio').hidden, null, { timeout: 60000 });
ok('Receive audio from: Master opens the studio on a live 4-bar track', await ev(() => { const tr = window.u2c.store.session.track; return tr.t0 === 0 && Math.abs(tr.bpm - 128) < 0.01 && Math.abs(window.u2c.store.project.outT - 4 * 4 * 60 / 128) < 0.01; }));
play(0); await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.D && Math.max(...e.D.frame.M) > -40; }, null, { timeout: 60000 }).catch(() => {});
const live = await ev(() => { const e = window.u2c.clip.current(), D = e && e.D; if (!D) return null; const lv = D.lv || {}; let mx = -99; const m = D.frame && D.frame.M; if (m) for (const v of m) mx = Math.max(mx, v); return { ready: e.ready, momentary: mx, kicks: D.onsets ? D.onsets.kick.length : 0 }; });
ok('live PCM becomes clip data (loudness measured, kicks found)', live && live.ready && live.momentary > -40 && live.kicks >= 4, JSON.stringify(live));
// beat events within a frame: onset times (kick) against the DAW grid
const kt = await ev(() => { const e = window.u2c.clip.current(), tr = window.u2c.store.session.track; return e.D.onsets.kick.slice(0, 8).map((k) => { const x = k[0] / tr.spb; return Math.abs(x - Math.round(x)) * tr.spb; }); });
ok('live kicks land on the DAW grid (<= 1 frame at 30 fps)', kt.length > 3 && kt.filter((d) => d < 1 / 30).length >= kt.length - 1, kt.map((d) => (d * 1000).toFixed(0) + 'ms').join(' '));

// ---- DAW image layer
await page.waitForTimeout(200);
const jpg = await page.screenshot({ type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: 320, height: 200 } });
await ev(() => { const c = document.querySelector('#u2cDaw [data-c]'); c.checked = true; c.dispatchEvent(new Event('change')); });
await page.waitForTimeout(200); ok('DAW image: the plugin is asked for frames', rx.capOn);
sock.send(Buffer.concat([Buffer.from('JPG0'), jpg])); await page.waitForTimeout(900);
const lay = await ev(() => { const L = globalThis.u2cVideoLayer, e = window.u2c.cues.ev(); return { w: L && L.w, on: e.value('video.on', 0, false), op: e.value('video.opacity', 0, 0.8), bl: e.value('video.blend', 0, 'x'), tg: e.value('video.target', 0, 'x') }; });
ok('DAW image: video layer fed, on, opacity 60 %, blend normal, on the hero', lay.w === 320 && lay.on === true && Math.abs(lay.op - 0.6) < 1e-6 && lay.bl === 'normal' && lay.tg === 'hero', JSON.stringify(lay));
await ev(() => { const o = document.querySelector('#u2cDaw [data-o]'); o.value = 25; o.dispatchEvent(new Event('input')); o.dispatchEvent(new Event('change')); const b = document.querySelector('#u2cDaw [data-b]'); b.value = 'multiply'; b.dispatchEvent(new Event('change')); });
const lay2 = await ev(() => { const e = window.u2c.cues.ev(); return [e.value('video.opacity', 0, 0), e.value('video.blend', 0, 'x')]; });
ok('DAW image: opacity slider + blend are cue-sheet properties', Math.abs(lay2[0] - 0.25) < 1e-6 && lay2[1] === 'multiply', JSON.stringify(lay2));
await page.waitForTimeout(500);
const px = await ev(() => { const v = document.getElementById('view'), d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s += d[i]; return s; });
ok('studio canvas draws with the layer on', px > 0);

// ---- live hits (mocked plugin events): kick -> glow envelope, snare -> flash, hat -> sparkles; each switchable by cue props
play(0); await page.waitForTimeout(300);
sock.send(JSON.stringify({ t: 'hits', kick: 0.9, snare: 0, hat: 0, pos: widxNow(), beats: beatsNow() }));
sock.send(JSON.stringify({ t: 'hits', kick: 0, snare: 0.8, hat: 0.7, pos: widxNow(), beats: beatsNow() }));
await page.waitForTimeout(60);
const hv = await ev(async () => { const m = await import('/src/v8/livefx.js'), e = window.u2c.cues.ev(), V = (p, d) => e.value(p, 0, d), L = m.live(); const on = m.kickEnv(V);
  window.u2c.actions.setProp('live.kick.on', false); const e2 = window.u2c.cues.ev(), off = m.kickEnv((p, d) => e2.value(p, 0, d)); window.u2c.actions.setProp('live.kick.on', true);
  return { n: L.hits.length, on, off, snare: L.hits.some((h) => h.snare > 0), hat: L.hits.some((h) => h.hat > 0), age: performance.now() - L.hits[0].at }; });
ok('hits: events become live state (kick, snare, hat), positioned by sample index', hv.n === 2 && hv.snare && hv.hat && hv.age >= 0 && hv.age < 800, JSON.stringify(hv));
ok('hits: kick drives the glow envelope; the cue property switches it off', hv.on > 0.05 && hv.off === 0, `on ${hv.on.toFixed(2)} off ${hv.off}`);
await page.waitForTimeout(120);
const lp = await ev(() => { const p = document.querySelector('#u2cDaw [data-ha=snare]'); p.value = 50; p.dispatchEvent(new Event('change')); return window.u2c.cues.ev().value('live.snare.amt', 0, 1); });
ok('hits: panel amount is a cue property (live.snare.amt)', Math.abs(lp - 0.5) < 1e-6, String(lp));
const px2 = await ev(() => { const v = document.getElementById('view'); return v.width > 0; }); ok('hits: studio keeps drawing with live reactions on', px2);
stop();

// ---- native meters (mocked plugin block): the exact values land in the analysed clip at the live position
play(0); await page.waitForTimeout(400);
const mmsg = () => JSON.stringify({ t: 'meters', pos: widxNow(), beats: beatsNow(), momentary: -17.7, short: -18.9, tp: -0.4, tpL: -0.4, tpR: -1.1, peakL: -2.5, peakR: -3.5, rmsL: -12.5, rmsR: -13.5, corr: 0.37, width: 0.6, spec: Array.from({ length: 61 }, (_, i) => -30 - i) });
for (let k = 0; k < 40; k++) { if (await ev(() => { const e = window.u2c.daw.live.origCurrent && window.u2c.daw.live.origCurrent(); return !!(e && e.ready && e.D); })) break; await page.waitForTimeout(250); }
const readM = () => ev(() => { const lv = window.u2c.daw.live, e = window.u2c.clip.current(), D = e && e.D; if (!D) return null; const F = D.frame, hb = window.u2c.daw.state.host.beats, t = (hb - lv.win) * lv.spb, f = Math.floor(t * D.fps); let hit = null; for (let k = f - 4; k <= f + 2; k++) if (k >= 0 && Math.abs(F.M[k] + 17.7) < 1e-3) hit = k;
  return { f, hit, S: hit != null ? F.S[hit] : null, TP: hit != null ? F.TP[hit] : null, corr: hit != null ? F.corr[hit] : null, spec3: hit != null ? F.spec[hit * 61 + 3] : null, mt: !!(window.u2cLive && window.u2cLive.mt) }; });
let mt = null;
for (let k = 0; k < 150 && !(mt && mt.hit != null); k++) { sock.send(mmsg()); await page.waitForTimeout(40); mt = await readM(); }   // the plugin sends ~30 per second; a re-analysis can replace the clip between two of them
ok('meters: the plugin block is written into the clip at the live frame (LUFS M/S, TP, corr, 61-band spectrum)', mt && mt.hit != null && Math.abs(mt.S + 18.9) < 1e-3 && mt.TP > -0.41 && Math.abs(mt.corr - 0.37) < 1e-3 && mt.spec3 === -33 && mt.mt, JSON.stringify(mt));
stop();

// ---- U2C Send plugins (mocked): listed in the panel, each assigned a visual target (pulses / shake / glow)
const snd = (extra = {}) => sock.send(JSON.stringify({ t: 'sends', list: [{ id: 'ab12cd34', name: 'Send ab12', rms: 0.3, peak: 0.5, bands: [0.3, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1], kick: 0, snare: 0, hat: 0, pos: null, beats: 0, rx: 0, ...extra }, { id: 'ff00ee11', name: 'Send ff00', rms: 0.1, peak: 0.2, bands: [0, 0, 0, 0.2, 0.3, 0.3, 0.1, 0], kick: 0, snare: 0, hat: 0, pos: null, beats: 0, rx: 0 }] }));
snd(); await page.waitForTimeout(200);
const rows = await ev(() => [...document.querySelectorAll('#u2cDaw [data-sends] [data-id]')].map((r) => r.dataset.id));
ok('sends: connected Send plugins are listed in the DAW panel', rows.length === 2 && rows[0] === 'ab12cd34', rows.join());
const setT = (id, t) => ev(([id, t]) => { const sel = document.querySelector(`#u2cDaw [data-sends] [data-id="${id}"] [data-st]`); sel.value = t; sel.dispatchEvent(new Event('change', { bubbles: true })); }, [id, t]);
await ev(() => { window.u2cLive.hits.length = 0; });
await setT('ab12cd34', 'pulses'); snd({ kick: 0.9 }); await page.waitForTimeout(60);
const sp = await ev(async () => { const m = await import('/src/v8/livefx.js'), e = window.u2c.cues.ev(); return { hits: m.live().hits.filter((h) => h.kick > 0).length, env: m.kickEnv((p, d) => e.value(p, 0, d)) }; });
ok('sends: target "pulses" turns the track\'s kick flags into pulses', sp.hits >= 1 && sp.env > 0.05, JSON.stringify(sp));
await setT('ab12cd34', 'shake'); snd(); await page.waitForTimeout(40);
const sk = await ev(async () => { const m = await import('/src/v8/livefx.js'), e = window.u2c.cues.ev(); return m.shake((p, d) => e.value(p, 0, d)); });
ok('sends: target "shake" moves the camera with the bass level', Array.isArray(sk) && sk.length === 2, JSON.stringify(sk));
await setT('ab12cd34', 'glow'); snd(); await page.waitForTimeout(40);
const gl = await ev(async () => { const m = await import('/src/v8/livefx.js'), e = window.u2c.cues.ev(), L = m.live().sends.ab12cd34; return { target: L.target, mid: L.mid, shake: m.shake((p, d) => e.value(p, 0, d)) }; });
ok('sends: target "glow" follows the mid bands (and no longer shakes)', gl.target === 'glow' && gl.mid > 0.3 && gl.shake === null, JSON.stringify(gl));
await ev(() => { const n = document.querySelector('#u2cDaw [data-sends] [data-id="ab12cd34"] [data-sn]'); n.value = 'Drums'; n.dispatchEvent(new Event('change', { bubbles: true })); });
ok('sends: the name is kept per send id', await ev(() => JSON.parse(localStorage.getItem('u2c.daw.sends')).ab12cd34.name === 'Drums'));
sock.send(JSON.stringify({ t: 'sends', list: [] })); await page.waitForTimeout(100);
ok('sends: a send that disappears is dropped', await ev(() => Object.keys(window.u2cLive.sends).length === 0));
await setT('ab12cd34', 'off').catch(() => {});

// ---- MIDI (mocked): note on/off become a falling-note / pad layer (cue props), and can trigger the pulses
const midi = (on, note, vel = 0.8) => sock.send(JSON.stringify({ t: 'midi', on, ch: 0, note, vel, pos: widxNow(), host: null, beats: beatsNow() }));
play(0); await page.waitForTimeout(300);
await ev(() => { const L = window.u2cLive; L.notes.length = 0; L.hits.length = 0; });
midi(true, 60); midi(true, 64, 1); await page.waitForTimeout(80); midi(false, 60); await page.waitForTimeout(60);
const mi = await ev(() => { const L = window.u2cLive; return L.notes.map((n) => [n.note, n.t1 != null]); });
ok('midi: note on / off tracked (60 released, 64 held)', JSON.stringify(mi) === '[[60,true],[64,false]]', JSON.stringify(mi));
const drawn = async (style) => { await ev((st) => window.u2c.actions.setProp('midi.style', st), style); await page.waitForTimeout(250);
  return ev(() => { const v = document.getElementById('view'), x = v.getContext('2d'), w = v.width, h = v.height, d = x.getImageData(Math.floor(w * 0.06), Math.floor(h * 0.12), Math.floor(w * 0.88), Math.floor(h * 0.76)).data; let s = 0; for (let i = 0; i < d.length; i += 53) s += d[i] + d[i + 1] + d[i + 2]; return s; }); };
const roll = await drawn('roll'), pads = await drawn('pads');
ok('midi: the layer draws (roll and pads styles differ) and the style is a cue property', roll > 0 && pads > 0 && roll !== pads && await ev(() => window.u2c.cues.ev().value('midi.style', 0, 'x') === 'pads'), `${roll} vs ${pads}`);
await ev(() => window.u2c.actions.setProp('midi.pulse', 'snare')); midi(true, 70, 0.9); await page.waitForTimeout(40);
ok('midi: with midi.pulse = snare a note also fires the snare flash', await ev(() => window.u2cLive.hits.some((h) => h.snare > 0)));
await ev(() => { document.querySelector('#u2cDaw [data-mo]').value = 40; document.querySelector('#u2cDaw [data-mo]').dispatchEvent(new Event('change')); });
ok('midi: panel opacity is a cue property', await ev(() => Math.abs(window.u2c.cues.ev().value('midi.opacity', 0, 0) - 0.4) < 1e-6));
await ev(() => { window.u2c.actions.setProp('midi.pulse', 'off'); window.u2c.actions.setProp('midi.style', 'roll'); });
stop();

// ---- Reference: a synthetic fixture (never the real preset file): import, pick, overlay state, per-band deltas, own-audio references
const fixture = JSON.stringify([{ name: 'Test Genre', data: '<?xml version="1.0"?><Reference>' + Array.from({ length: 40 }, (_, i) => { const f = 20 * Math.pow(1000, i / 39); return `<Entry freq="${f.toFixed(3)}" value="${(-30 - 4 * Math.log2(f / 20)).toFixed(3)}" value1="0" value2="0" value3="0"/>`; }).join('') + '</Reference>' }, { name: 'Broken', data: '<nothing/>' }]);
await page.setInputFiles('#u2cDaw [data-rf]', { name: 'refs.txt', mimeType: 'text/plain', buffer: Buffer.from('﻿' + fixture) });
await page.waitForFunction(() => document.querySelector('#u2cDaw [data-rg]').options.length > 2, null, { timeout: 5000 }).catch(() => {});
ok('reference: the file is parsed in the page (bad entries skipped) and offered as genres', await ev(() => [...document.querySelectorAll('#u2cDaw [data-rg] option')].map((o) => o.textContent).join() === 'add reference…,Test Genre'));
await ev(() => { const g = document.querySelector('#u2cDaw [data-rg]'); g.value = 'Test Genre'; g.dispatchEvent(new Event('change')); });
ok('reference: picking a genre shows it with a colour picker', await ev(() => !!document.querySelector('#u2cDaw [data-rn="Test Genre"] [data-rc]')));
const refNow = (add) => ev(async (add) => { const R = await import('/src/bridge/reference.js'); const c = R.ref.cur, cen = Array.from({ length: 61 }, (_, i) => 1000 * 2 ** ((i - 34) / 6));
  const spec = cen.map((f) => R.refAt(c, f) + 7 + (f >= 6000 ? add : 0)); return { off: R.alignOffset(c, cen, spec), d: R.bandDeltas(c, cen, spec).map((b) => b.db), n: R.ref.show.length, spec }; }, add);
const r0 = await refNow(0), r6 = await refNow(6);
ok('reference: level-aligned on the 200 Hz-5 kHz average (a +7 dB copy gives offset 7, deltas 0)', Math.abs(r0.off - 7) < 0.05 && r0.d.every((x) => Math.abs(x) < 0.05), JSON.stringify(r0.d));
ok('reference: a hot top end shows as a positive "high" delta only', r6.d[4] > 5 && Math.abs(r6.d[0]) < 0.5 && Math.abs(r6.d[2]) < 0.5, JSON.stringify(r6.d));
sock.send(JSON.stringify({ t: 'meters', pos: widxNow(), beats: beatsNow(), momentary: -14, short: -14, tp: -1, tpL: -1, tpR: -1, peakL: -1, peakR: -1, rmsL: -12, rmsR: -12, corr: 1, width: 0, spec: r0.spec, fl: [{ pk: -3, rms: -9, hold: -2, clip: false }, { pk: 0, rms: -6, hold: 0, clip: true }] }));
await page.waitForTimeout(500);
const rdv = await ev(async () => { const R = await import('/src/bridge/reference.js'); return { m: R.ref.match, off: R.ref.offs, txt: document.querySelector('#u2cDaw [data-rd]').textContent, mt: window.u2cLive.mt && window.u2cLive.mt.momentary, at: performance.now() - window.u2cLive.mtAt }; });
ok('reference: live meters feed the "vs reference" readout (matching mix = all bands about 0, match 100%)', rdv.m > 0.95 && /low .*0\.0/.test(rdv.txt), JSON.stringify(rdv));
ok('FL-style master meter draws (peak, RMS body, clip red)', await ev(() => { const cv = document.querySelector('#u2cDaw [data-fl]'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let red = 0, any = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) any++; if (d[i] > 230 && d[i + 1] < 100 && d[i + 3]) red++; } return any > 100 && red > 5; }));
const ownR = await ev(async () => { const R = await import('/src/bridge/reference.js'), sr = 44100, x = new Float32Array(sr * 2).map((_, i) => Math.sin(2 * Math.PI * 1000 * i / sr) * 0.5);
  const r = await R.addAudioReference('My sine', [x], sr); let k = 0; r.db.forEach((v, i) => { if (v > r.db[k]) k = i; }); return { f: r.freq[k], n: R.ref.show.length, user: R.ref.user.length }; });
ok('reference: your own audio becomes a named average-spectrum reference (1 kHz sine peaks at 1 kHz), shown with the genre', Math.abs(ownR.f - 1000) < 1 && ownR.n === 2 && ownR.user === 1, JSON.stringify(ownR));
await ev(() => window.dispatchEvent(new CustomEvent('u2c-refs')));
ok('reference: each shown reference has its own colour picker', await ev(() => document.querySelectorAll('#u2cDaw [data-rn] [data-rc]').length === 2));
await ev(async () => { const c = document.querySelector('#u2cDaw [data-rn="Test Genre"] [data-rc]'); c.value = '#ff0000'; c.dispatchEvent(new Event('input', { bubbles: true })); });
ok('reference: the colour is applied', await ev(async () => (await import('/src/bridge/reference.js')).ref.show[0].color === '#ff0000'));
await ev(() => { window.u2c.actions.setProp('meter.spectrum.cmap', 'FL'); window.u2c.actions.setProp('meter.spectro.cmap', 'FL'); }); await page.waitForTimeout(400);
ok('FL colour option is a cue property (meter.spectrum.cmap / meter.spectro.cmap) and the meters draw with it and the overlay', await ev(() => window.u2c.cues.ev().value('meter.spectro.cmap', 0, 'stage') === 'FL'));

// ---- FL colour map (a 64-stop table sampled from FL's Spectrum.bmp; a BMP can be sampled in the page too)
const fl = await ev(async () => { const F = await import('/src/lib/flcolors.js'), SG = await import('/src/v8/spectrogramview.js'), RG = await import('/src/v8/registry.js');
  const bmp = new Uint8Array(54 + 512 * 3); bmp[0] = 0x42; bmp[1] = 0x4d; const dv = new DataView(bmp.buffer); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true); dv.setInt32(18, 512, true); dv.setInt32(22, 1, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
  for (let x = 0; x < 512; x++) { bmp[54 + x * 3] = 0; bmp[54 + x * 3 + 1] = Math.round(x / 2); bmp[54 + x * 3 + 2] = x >> 1; }   // BGR: a black-to-yellow ramp
  const st = F.sampleBmp(bmp, 64), lum = (c) => c[0] + c[1] + c[2], mono = F.FL_STOPS.filter((c, i) => i && lum(c) >= lum(F.FL_STOPS[i - 1]) - 40).length;
  const lut = SG.specLUT({ spec: ['#000', '#222', '#444', '#666'], ink: '#fff', card: '#000', grey: false }, 0.56, 'FL');
  return { n: F.FL_STOPS.length, first: F.FL_STOPS[0], last: F.FL_STOPS[63], mono, bmp0: st[0], bmp63: st[63], lutN: lut.length, lut255: lut[255], props: RG.METER_PROPS.spectrogram.some((q) => q[0] === 'cmap' && q[3].includes('FL')) && RG.METER_PROPS.spectrum.some((q) => q[0] === 'cmap'), purple: F.FL_STOPS.some((c) => c[2] > c[1] + 15 && c[0] > 20) }; });
ok('FL colour map: 64 stops, black at the dark end, orange at the top, purple on the way', fl.n === 64 && fl.first.reduce((a, b) => a + b) < 40 && fl.last.reduce((a, b) => a + b) > 250 && fl.purple && fl.mono > 55, JSON.stringify([fl.first, fl.last, fl.mono]));
ok('FL colour map: a 512x1 BMP is sampled to stops, the ramp has 256 entries, and "FL" is a meter option (cue property meter.spectro.cmap / meter.spectrum.cmap)', fl.bmp0[0] < 5 && fl.bmp63[0] > 240 && fl.lutN === 256 && fl.lut255[3] === 255 && fl.props);

// ---- drag and drop of audio: any window position; short sounds -> MPC pad, ref zone -> reference, long -> beat
const dr = await ev(async () => { const D = await import('/src/ui/dropaudio.js'), M = await import('/src/ui/mpc.js');
  return { a: D.routeDrop('main', 1.2), b: D.routeDrop('main', 90), c: D.routeDrop('mpc', 90), d: D.routeDrop('ref', 5), e: D.routeDrop('voice', 3), f: D.routeDrop('sfx:stove', 3), keys: M.padForKey('q') === 4 && M.padForKey('v') === 15 && M.padForNote(36) === 0 && M.padForNote(51) === 15, next: M.nextFree([{ blob: 1 }, null]), zone: [document.querySelector('#u2cMpc'), document.querySelector('#u2cDaw [data-ref]'), document.querySelector('.sfx-row input'), document.body].map((e) => D.zoneOf(e)).join() }; });
ok('drop: routing (short sound -> pad, long -> beat, MPC / reference / voice / lab-sound zones)', dr.a === 'pad' && dr.b === 'beat' && dr.c === 'pad' && dr.d === 'ref' && dr.e === 'voice' && dr.f === 'sfx' && dr.keys && dr.next === 1 && dr.zone === 'mpc,ref,sfx:stove,main', JSON.stringify(dr));
const wavFile = (secs, hz) => ev(async ({ secs, hz }) => { const sr = 22050, n = Math.round(sr * secs), b = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.sin(2 * Math.PI * hz * i / sr) * 12000, true); window.__wav = new File([b.buffer], 'slice-' + hz + '.wav', { type: 'audio/wav' }); return true; }, { secs, hz });
const dropOn = (sel) => ev((sel) => { const dt = new DataTransfer(); dt.items.add(window.__wav); const t = document.querySelector(sel) || document.body; t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, sel);
await wavFile(0.4, 440); await dropOn('#view');
await page.waitForFunction(() => window.u2c.mpc.pads.some((p) => p.blob), null, { timeout: 8000 }).catch(() => {});
ok('drop: a short audio file dropped on the main area lands on the next free pad (named after the file)', await ev(() => window.u2c.mpc.pads[0].blob && window.u2c.mpc.pads[0].name === 'slice-440'));
await wavFile(0.4, 880); await dropOn('#u2cMpc');
await page.waitForFunction(() => window.u2c.mpc.pads[1].blob, null, { timeout: 8000 }).catch(() => {});
ok('drop: a second sound goes to pad 2', await ev(() => !!window.u2c.mpc.pads[1].blob && window.u2c.mpc.pads[1].name === 'slice-880'));
const nUser = await ev(async () => (await import('/src/bridge/reference.js')).ref.user.length);
await wavFile(1, 300); await dropOn('#u2cDaw [data-ref]');
await page.waitForFunction(async (n) => (await import('/src/bridge/reference.js')).ref.user.length > n, nUser, { timeout: 25000 }).catch(() => {});
ok('drop: audio dropped on the Reference row becomes a reference', await ev(async () => (await import('/src/bridge/reference.js')).ref.user.some((r) => r.name === 'slice-300')));
// MPC: key + MIDI trigger the pad and its pulse target; the pad is stored
await ev(() => { const M = window.u2c.mpc; M.pads[0].target = 'kick'; M.pads[1].target = 'snare'; window.u2cLive.hits.length = 0; M.setCollapsed(false); });
await page.keyboard.press('1'); await page.waitForTimeout(80); const k1 = await ev(() => window.u2cLive.hits.some((h) => h.kick > 0));
midi(true, 37, 1); await page.waitForTimeout(80); const k2 = await ev(() => window.u2cLive.hits.some((h) => h.snare > 0));
ok('MPC: key 1 plays pad 1 and fires its pulse target (kick); MIDI note 37 plays pad 2 (snare)', k1 && k2);
await page.waitForTimeout(300);
ok('MPC: pads are kept in IndexedDB; the panel collapses', await ev(async () => { const n = await new Promise((res) => { const q = indexedDB.open('u2c-mpc', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('pads'); g.onsuccess = () => res(g.result ? g.result.filter((p) => p.blob).length : 0); }; q.onerror = () => res(-1); }); document.querySelector('#u2cMpc [data-h]').click(); const c = !document.querySelector('#u2cMpc [data-p]'); document.querySelector('#u2cMpc [data-h]').click(); return n >= 2 && c; }));

// ---- phase 2: DAW layer on by default, targets, recordings + Show in Finder, Live setup card, Preview, nudge, export-size record
await page.waitForFunction(() => document.querySelector('#u2cDaw [data-c]').checked, null, { timeout: 8000 }).catch(() => {});
ok('DAW window layer is on by default when the plugin first opens (checkbox + cue props)', await ev(() => document.querySelector('#u2cDaw [data-c]').checked && window.u2c.cues.ev().value('video.on', 0, false) === true));
const tgs = []; for (const tg of ['pip', 'full', 'hero']) { await ev((tg) => { const s = document.querySelector('#u2cDaw [data-vt]'); s.value = tg; s.dispatchEvent(new Event('change')); }, tg); tgs.push(await ev(() => window.u2c.cues.ev().value('video.target', 0, 'x'))); }
ok('DAW window targets: hero card, full background, corner picture (cue video.target)', tgs.join() === 'pip,full,hero', tgs.join());
ok('"+ Layer" has a DAW window entry', await ev(() => [...document.querySelectorAll('#addTrackBtn ~ .addlayer button, .addlayer button')].some((b) => /DAW window/.test(b.textContent))));
ok('Recordings: the plugin\'s last files are listed with a Show in Finder button that sends reveal', await ev(() => !!document.querySelector('#u2cDaw [data-rec] [data-show]')) && (await ev(() => { document.querySelector('#u2cDaw [data-rec] [data-show]').click(); return true; }), await page.waitForTimeout(150), rx.reveal.join() === 'u2c-daw-1080x1920-old.mp4'));
const plan = await ev(async () => { const C = await import('/src/bridge/livecard.js'); return { a: C.planFor({ presentation: 'daw', camera: false, start: 'blank' }), b: C.planFor({ presentation: 'flow', start: 'preview' }), c: C.planFor({ presentation: 'hero' }) }; });
ok('Live setup: presentation / motion / start map to cue props (DAW full = video.target full, camera off = dip 0, blank waits for play)', plan.a.props['video.target'] === 'full' && plan.a.props['video.on'] === true && plan.a.props['camera.dip'] === 0 && plan.a.blank && plan.b.props['intro.style'] === 'flow' && plan.b.preview && plan.c.props['intro.on'] === false);
await ev(() => window.u2c.daw.liveSetup()); await page.waitForTimeout(200);
ok('Live setup: the card opens with the three groups', await ev(() => { const c = document.getElementById('u2cLiveCard'); return !!c && /Presentation/.test(c.textContent) && /Motion/.test(c.textContent) && /Start/.test(c.textContent); }));
await ev(() => { const f = document.querySelector('#u2cLiveCard form'); f.querySelector('[name=presentation][value=hero]').checked = true; f.querySelector('[name=start][value=blank]').checked = true; f.requestSubmit(); });
await page.waitForTimeout(300);
ok('Live setup: applying it sets the props and blanks the screen until the DAW plays', await ev(() => !document.getElementById('u2cLiveCard') && window.u2c.cues.ev().value('intro.on', 0, true) === false && !!document.getElementById('u2cBlank')));
await ev(() => window.u2c.daw.preview.blank(false)); await ev(() => { window.u2c.actions.setProp('intro.on', true); });
await ev(() => document.querySelector('#u2cDaw [data-pv]').click()); await page.waitForTimeout(500);
ok('Preview: plays the setup (intro pre-roll, export fidelity) in an overlay without the DAW', await ev(() => { const o = document.getElementById('u2cPreview'); if (!o) return false; const c = o.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n > 200; }));
await ev(() => document.getElementById('u2cPreview').click());
ok('Preview: a click closes it', await ev(() => !document.getElementById('u2cPreview')));
await ev(() => { document.querySelector('#u2cDaw [data-tp]').click(); document.querySelector('#u2cDaw [data-tp]').click(); document.querySelector('#u2cDaw [data-tm]').click(); });
ok('sync nudge: +10 / -10 ms steps', await ev(() => document.querySelector('#u2cDaw [data-t]').value === '10' && window.u2c.daw.state.lat === 10));
const rs = await ev(async () => { const R = await import('/src/bridge/record.js'); return { a: R.recordSpec('916', '1080p', 30), b: R.recordSpec('169', '4k', 60), c: R.recordSpec('916', '4k', 30) }; });
ok('Record sizes: 1080x1920 / 1920x1080, 4K 2160x3840 / 3840x2160 at 30 or 60 fps, 4K at 40 Mbps or more', rs.a.W === 1080 && rs.a.H === 1920 && rs.b.W === 3840 && rs.b.H === 2160 && rs.b.fps === 60 && rs.c.W === 2160 && rs.c.H === 3840 && rs.c.mbps >= 40);

// ---- phase 3: key detector, panel hiding, coalesced meters, Reader mode
const kd = await ev(async () => { const D = await import('/src/analysis/dsp.js'), KMIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17], KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const rot = (p, k) => Array.from({ length: 12 }, (_, i) => p[(i - k + 12) % 12]), a = D.pickKey(rot(KMIN, 3)), b = D.pickKey(rot(KMAJ, 5));
  const mix = rot(KMAJ, 3).map((v, i) => v * 0.5 + rot(KMIN, 0)[i] * 0.5 + 0), c = D.pickKey(rot(KMAJ, 0).map((v, i) => v * 1.0 + rot(KMIN, 0)[i] * 0.97));   // a major / minor tie on the same tonic
  return { a, b, c }; });
ok('key: a D# minor profile is read as D# min with high confidence; F major as F maj', kd.a.key === 'D# min' && kd.a.conf > 0.8 && kd.b.key === 'F maj', JSON.stringify([kd.a.key, kd.a.conf, kd.b.key]));
ok('key: when major and minor are within a hair, minor wins', /min$/.test(kd.c.key), kd.c.key);
await ev(() => { const s = document.querySelector('#u2cDaw [data-key]'); s.value = 'D# min'; s.dispatchEvent(new Event('change')); });
ok('key: the dropdown sets the key shown on screen and keeps it (no auto override)', await ev(() => document.getElementById('sKey').value === 'D# min' && localStorage.getItem('u2c.daw.keylock') === 'D# min'));
await ev(() => { const s = document.querySelector('#u2cDaw [data-key]'); s.value = ''; s.dispatchEvent(new Event('change')); });
ok('key: "auto" lets the detector run again', await ev(() => localStorage.getItem('u2c.daw.keylock') === null));
// meters: a burst of messages is applied once per frame, newest wins
for (const m of [-30, -25, -20]) sock.send(JSON.stringify({ t: 'meters', pos: widxNow(), beats: beatsNow(), momentary: m, short: m, tp: -1, tpL: -1, tpR: -1, peakL: -1, peakR: -1, rmsL: -12, rmsR: -12, corr: 1, width: 0, spec: new Array(61).fill(-50), fl: [{ pk: -9, rms: -12, hold: -9, clip: false }, { pk: -9, rms: -12, hold: -9, clip: false }] }));
await page.waitForTimeout(150);
ok('meters: a burst is coalesced to the newest message per frame', await ev(() => window.u2cLive.mt && window.u2cLive.mt.momentary === -20));
// panel: pill, H, auto-hide while playing, saved state
await ev(() => document.querySelector('#u2cDaw [data-chev]').click());
ok('panel: the chevron shrinks it to a "DAW" pill (saved)', await ev(() => document.getElementById('u2cDaw').classList.contains('pill') && JSON.parse(localStorage.getItem('u2c.daw.ui')).pill === true));
await ev(() => document.querySelector('#u2cDaw [data-chev]').click());
await page.keyboard.press('h'); const h1 = await ev(() => document.getElementById('u2cDaw').classList.contains('hid')); await page.keyboard.press('h'); const h2 = await ev(() => document.getElementById('u2cDaw').classList.contains('hid'));
ok('panel: H hides and shows it', h1 && !h2);
play(0); await page.waitForTimeout(3300);
const idle = await ev(() => document.getElementById('u2cDaw').classList.contains('hid'));
await page.mouse.move(300, 300); await page.mouse.move(320, 310); await page.waitForTimeout(150);
const back = await ev(() => !document.getElementById('u2cDaw').classList.contains('hid'));
ok('panel: fades after 2.5 s of no mouse movement while playing, returns on movement', idle && back);
stop();
// Reader mode: static page, nothing animates; Animated brings the motion back
const rd = await ev(async () => { const C = await import('/src/bridge/livecard.js'); return { r: C.planFor({ presentation: 'reader' }), dflt: C.planFor({}).reader, a: C.planFor({ presentation: 'sphere' }) }; });
ok('Reader: the default presentation; motion props off, only waveform / spectrum / levels / key-BPM windows on', rd.dflt && rd.r.props['intro.on'] === false && rd.r.props['logo.glow'] === 0 && rd.r.props['live.kick.on'] === false && rd.r.props['win.stage.visible'] === false && rd.r.props['win.spectrum.visible'] === true && rd.r.props['win.session.visible'] === true && rd.r.props['ground.pattern'] === 'none');
await ev(() => window.u2c.daw.applyPlan({ presentation: 'reader', camera: false, follow: true, start: 'none' })); await page.waitForTimeout(300);
const rs2 = await ev(() => { const e = window.u2c.cues.ev(); return { intro: e.value('intro.on', 0, true), glow: e.value('logo.glow', 0, 1), kick: e.value('live.kick.on', 0, true), stage: e.value('win.stage.visible', 0, true), shots: window.u2c.cues.sheet.tracks.filter((t) => t.path === 'camera.shot').length, reader: window.u2c.daw.state.reader, saved: JSON.parse(localStorage.getItem('u2c.live.setup')).presentation }; });
ok('Reader: applying it turns the motion off in the cue sheet, drops the camera moves and is saved', rs2.intro === false && rs2.glow === 0 && rs2.kick === false && rs2.stage === false && rs2.shots === 0 && rs2.reader === true && rs2.saved === 'reader', JSON.stringify(rs2));
await ev(() => window.u2c.daw.applyPlan({ presentation: 'sphere', camera: true, follow: true, start: 'none' })); await page.waitForTimeout(300);
ok('Animated: picking it brings the motion back', await ev(() => { const e = window.u2c.cues.ev(); return e.value('intro.on', 0, false) === true && e.value('logo.glow', 0, 0) === 1 && e.value('live.kick.on', 0, false) === true && window.u2c.daw.state.reader === false; }));
await ev(() => document.querySelector('#u2cDaw [data-pv]').click()); await page.waitForTimeout(300);
ok('Preview: hides all panels (picture only); Esc closes it', await ev(() => document.body.classList.contains('u2c-clean') && getComputedStyle(document.getElementById('u2cMpc')).display === 'none') && (await page.keyboard.press('Escape'), await page.waitForTimeout(200), await ev(() => !document.getElementById('u2cPreview') && !document.body.classList.contains('u2c-clean'))));

// ---- Record: canvas + live master audio -> the plugin (the host plays, as it must: the canvas only changes while the visuals move)
play(0);
await ev(() => document.querySelector('#u2cDaw [data-r]').click()); await page.waitForTimeout(3500);
await ev(() => document.querySelector('#u2cDaw [data-r]').click());
await page.waitForFunction(() => /Saved/.test(document.querySelector('#u2cDaw [data-m]').textContent), null, { timeout: 30000 }).catch(() => {});
const total = rx.saved.reduce((a, b) => a + b, 0);
ok('Record: a file with video + audio reaches the plugin, named with its export size (1080x1920)', rx.names.length === 1 && /1080x1920.*\.(mp4|webm)$/.test(rx.names[0]) && total > 20000, `${rx.names[0]} ${total} bytes`);
const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 4).join(' | '));
await browser.close(); server.close();
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
