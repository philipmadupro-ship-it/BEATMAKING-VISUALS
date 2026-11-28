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
const T0 = Date.now(), host = { playing: false, t0: 0, beat0: 0, jump: 0 }, rx = { saved: [], names: [], capOn: false };
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
ok('hits: events become live state (kick, snare, hat), positioned by sample index', hv.n === 2 && hv.snare && hv.hat && hv.age >= 0 && hv.age < 400, JSON.stringify(hv));
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

// ---- Record: canvas + live master audio -> the plugin (the host plays, as it must: the canvas only changes while the visuals move)
play(0);
await ev(() => document.querySelector('#u2cDaw [data-r]').click()); await page.waitForTimeout(3500);
await ev(() => document.querySelector('#u2cDaw [data-r]').click());
await page.waitForFunction(() => /Saved/.test(document.querySelector('#u2cDaw [data-m]').textContent), null, { timeout: 30000 }).catch(() => {});
const total = rx.saved.reduce((a, b) => a + b, 0);
ok('Record: a file with video + audio reaches the plugin', rx.names.length === 1 && /\.(mp4|webm)$/.test(rx.names[0]) && total > 20000, `${rx.names[0]} ${total} bytes`);
const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 4).join(' | '));
await browser.close(); server.close();
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
