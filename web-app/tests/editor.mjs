// v21 editor test for U2C Studio (Playwright, headless Chromium): the pro-editor features added in v21.
//   node tests/editor.mjs [audioFile]      (serves web-app/ itself on a free port unless URL is set)
// Env: URL, SHOTS (screenshot folder, default ./shots/editor), CDN_CACHE (serve the CDN + Google Fonts from a local cache),
// NOEXPORT=1 (skip the real queue render).
// Flow: boot -> upload the beat -> studio -> command palette (Cmd/Ctrl+K: actions, properties, words) -> shortcut sheet (?) ->
// metadata panel (every field, overrides reach the film data) + word search edit + undo -> marker list (add, rename, jump,
// delete) -> keyframe copy / paste across lanes -> program monitor (guides, resolution, compare A/B, frame step, loop in/out,
// audio scrub, filmstrip) -> workspace (resize + collapse panels) -> export queue (presets, template names, one real render)
// -> projects (save, save as, duplicate, rename, open restores, .u2cproj export / import with covers, delete, recent on home)
// -> screenshots 1440x900 + 390x844 (no horizontal scroll) -> no console errors.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.resolve(process.env.SHOTS || 'shots/editor'), CACHE = process.env.CDN_CACHE || '';
const AUDIO = process.argv[2] || ['/home/user/u2c-motion/audio/atelmansion-3c-fmin-128.wav', path.join(ROOT, 'demo/test-beat-142.wav')].find((f) => fs.existsSync(f)) || '';
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [], results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
let URL0 = process.env.URL, server = null;
if (!URL0) { const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf' };
  server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); URL0 = `http://127.0.0.1:${server.address().port}/`; }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', acceptDownloads: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (process.env.VERBOSE) console.log('  console.' + m.type() + ':', m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
if (CACHE) { fs.mkdirSync(CACHE, { recursive: true });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, async (route) => { const u = route.request().url(), f = path.join(CACHE, u.replace(/[^a-z0-9.@-]+/gi, '_').slice(0, 200));
    if (!fs.existsSync(f)) { try { execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 Chrome/120', '-o', f, u]); } catch (e) { return route.fulfill({ status: 404, body: 'miss' }); } }
    route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': /css2/.test(u) ? 'text/css' : /woff2/.test(u) ? 'font/woff2' : 'text/javascript', 'access-control-allow-origin': '*' } }); }); }
const shot = async (f) => { for (let i = 0; i < 2; i++) { try { await page.screenshot({ path: path.join(SHOTS, f), timeout: 60000 }); return; } catch (e) { if (i) console.log('  screenshot failed', f, e.message.slice(0, 80)); } } };
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const t0 = Date.now();
await page.goto(URL0);
await ev(async () => { try { localStorage.clear(); localStorage.setItem('u2c.mode.v1', 'pro'); } catch (_) {} for (const n of ['u2c-projects', 'u2c-media']) await new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); }); });
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.track === '1', null, { timeout: 120000 });
ok('boot + demo analysis', true, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
await page.setInputFiles('#file', AUDIO);
await page.waitForFunction((b) => { const tr = window.u2c.store.session.track; return tr && !tr.meta.quick && tr.meta.name === b; }, path.basename(AUDIO), { timeout: 120000 });
await page.waitForFunction(() => { const e = window.u2c.clip.current(); return e && e.ready && window.u2c.cues.sheet.tracks.length > 0; }, null, { timeout: 120000 });
// ---------------------------------------------------------------- v22 home: big title -> drop -> recent -> looks, first-run coach
const home = await ev(() => { const q = (s) => document.querySelector(s), order = ['.home-title', '.hero', '#recent', '#grid'].map((s) => [...document.querySelectorAll('#home *')].indexOf(q(s)));
  return { order, sorted: order.every((v, i) => v >= 0 && (!i || v > order[i - 1])), h1: parseFloat(getComputedStyle(q('.home-title h1')).fontSize), coach: !q('#coachHome').hidden, steps: document.querySelectorAll('#coachHome li').length }; });
await shot('home-first-run-1440.png');
ok('home: big title, drop, recent, looks in that order; first-run coach with 3 steps', home.sorted && home.h1 >= 60 && home.coach && home.steps === 3, JSON.stringify(home));
// open the PLAYER look in the studio
await ev(() => window.u2c.actions.openStudio('player', '916'));
await page.waitForFunction(() => !document.querySelector('#studio').hidden && window.u2c.clip.current().ready, null, { timeout: 60000 }); await wait(800);
ok('studio open (player look)', await ev(() => window.u2c.store.project.look === 'player'));

// ---------------------------------------------------------------- v22 status strip, task controls, advanced, coach
await ev(() => window.u2c.actions.seek(window.u2c.store.project.inT + 9 * window.u2c.store.session.track.spb));
await page.waitForFunction(() => /Position 3\.2\./i.test(document.querySelector('#statusBar').innerText), null, { timeout: 15000 }).catch(() => {});   // v27: wait on the state, not a fixed 300 ms
const sb = await ev(() => ({ t: document.querySelector('#statusBar').innerText.replace(/\s+/g, ' '), vis: document.querySelector('#statusBar').getBoundingClientRect().bottom <= innerHeight + 1 }));
ok('status strip: beat, BPM, key, section, format, stage, intro, export preset, position', sb.vis && /atelmansion/i.test(sb.t) && /BPM 1\d\d/i.test(sb.t) && /Key \S/i.test(sb.t) && /Section \d+ bars/i.test(sb.t) && /Format 9:16/i.test(sb.t) && /Stage \S/i.test(sb.t) && /Intro (sphere|flow)/i.test(sb.t) && /Export \S+/i.test(sb.t) && /Position 3\.2\./i.test(sb.t), sb.t);
const coach2 = await ev(() => ({ step: window.u2c.quick.coach.step, slim: !document.querySelector('#coachStudio').hidden }));
const qrows = await ev(() => ({ groups: [...document.querySelectorAll('#quick .qg')].map((g) => g.dataset.g), rows: document.querySelectorAll('#quick .qc').length, labelled: [...document.querySelectorAll('#quick .qc')].filter((r) => r.querySelector('.qc-l').textContent && r.querySelector('.qc-v')).length, hints: document.querySelectorAll('#quick .qc-hint').length, adv: document.querySelector('#advInsp').open }));
ok('controls by task: Intro, Camera, Text, Colours, Export; label + value + hint; raw paths under Advanced', qrows.groups.join() === 'Intro,Camera,Text,Colours,Export' && qrows.rows >= 25 && qrows.labelled === qrows.rows && qrows.hints >= 20 && !qrows.adv && coach2.step === 2 && coach2.slim, JSON.stringify({ ...qrows, coach: coach2 }));
await page.click('#quick .qg[data-g="Intro"] button[data-v="flow"]'); await wait(150);
const st1 = await ev(() => ({ v: window.u2c.cues.ev().value('intro.style', 0, 'x'), out: document.querySelector('#quick [data-out="intro.style"]').textContent }));
await page.click('#quick .qg[data-g="Intro"] button[data-v="sphere"]'); await wait(150);
const st2 = await ev(() => window.u2c.cues.ev().value('intro.style', 0, 'x'));
const seed0 = await ev(() => ({ s: window.u2c.cues.sheet.meta.seed, cam: JSON.stringify(window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.map((k) => k.v)) }));
await page.click('#quick [data-qact="newseed"]'); await wait(300);
const seed1 = await ev(() => ({ s: window.u2c.cues.sheet.meta.seed, cam: JSON.stringify(window.u2c.cues.sheet.tracks.find((t) => t.path === 'camera.shot').keys.map((k) => k.v)), inp: document.querySelector('#quick [data-q="seed"]').value }));
ok('intro style toggle (sphere / flow) + seed "New variation"', st1.v === 'flow' && st1.out === 'Flow' && st2 === 'sphere' && seed1.s && seed1.s !== seed0.s && seed1.inp === seed1.s, `flow→sphere ok · seed ${seed0.s || 'auto'} → ${seed1.s} · camera ${seed0.cam === seed1.cam ? 'same' : 'reshuffled'}`);
await ev(() => window.u2c.quick.set('fx.punch', 0.03)); await wait(100);
const punch = await ev(() => ({ v: window.u2c.cues.ev().value('fx.punch', window.u2c.cuetl.state.playhead, 0), out: document.querySelector('#quick [data-out="fx.punch"]').textContent }));
await page.fill('#quick [data-q="social.terminal.2"]', 'LAB TEST: PASSED'); await page.press('#quick [data-q="social.terminal.2"]', 'Tab'); await wait(100);
await page.fill('#quick [data-q="social.outro.body"]', 'SAVE THE LAB?'); await page.press('#quick [data-q="social.outro.body"]', 'Tab'); await wait(100);
const words = await ev(() => { const t = window.u2c.cues.sheet.tags.social, m = window.u2c.cues.tags('').social; return { arr: Array.isArray(t.terminal), n: t.terminal.length, v2: m.terminal[2], v0: m.terminal[0], outro: m.outro.body, outroT: m.outro.title }; });
await shot('controls-1440.png');
ok('values with units; terminal lines (a list) and the outro dialog edit as words', Math.abs(punch.v - 0.03) < 1e-9 && punch.out === '3.0 %' && words.arr && words.n === 4 && words.v2 === 'LAB TEST: PASSED' && /LOADING/.test(words.v0) && words.outro === 'SAVE THE LAB?' && words.outroT === 'U2C LAB', JSON.stringify({ punch, words }));

// ---------------------------------------------------------------- v22 edit in the timeline
const tlp = (id) => ev((id) => { const p = window.u2c.cuetl.keyPoint(id), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + p.x, y: r.y + p.y }; }, id);
const cam = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'camera.shot'), k = t.keys.find((q) => q.b > 4) || t.keys[0]; return { id: k.id, v: k.v }; });
let pt = await tlp(cam.id); await page.mouse.dblclick(pt.x, pt.y); await wait(200);
const inl = await ev(() => { const s = document.querySelector('.tl-inline select'); return s ? { opts: [...s.options].map((o) => o.textContent), vis: !document.querySelector('.tl-inline').hidden } : null; });
const newT = cam.v === 'spectrum' ? 'session' : 'spectrum';
if (inl) await page.selectOption('.tl-inline select', newT); await wait(150);
const camV = await ev((id) => window.u2c.cuetl.findKey(id)[1].v, cam.id);
ok('timeline: double-click a camera key -> dropdown of window names changes its target', inl && inl.vis && inl.opts.includes('Hero (cover + logo)') && camV === newT, `${cam.v} → ${camV} · ${inl && inl.opts.slice(0, 4).join(', ')}`);
await shot('timeline-inline-1440.png');
const num = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.kind === 'number' && x.keys.length && !x.lock); return t && { id: t.keys[0].id, path: t.path, v: t.keys[0].v }; });
pt = await tlp(num.id); await page.mouse.dblclick(pt.x, pt.y); await wait(200);
const hasNum = await ev(() => !!document.querySelector('.tl-inline input[type=number]'));
const want = await ev((p) => { const r = window.u2c.registry().byPath[p.path] || {}, lo = r.min ?? 0, hi = r.max ?? 1; return +(lo + (hi - lo) * 0.37).toFixed(3); }, num);
if (hasNum) { await page.fill('.tl-inline input[type=number]', String(want)); await page.keyboard.press('Enter'); } await wait(150);
const numV = await ev((id) => window.u2c.cuetl.findKey(id)[1].v, num.id);
ok('timeline: double-click a number key -> inline number field', hasNum && Math.abs(numV - want) < 1e-6, `${num.path}: ${num.v} → ${numV}`);
const term = await ev(() => { const t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'term.line'); if (!t || !t.keys.length) return null; const k = t.keys.find((q) => typeof q.v === 'number') || t.keys[0], T = window.u2c.cuetl, p = T.keyPoint(k.id), r = document.querySelector('#cueCv').getBoundingClientRect();
  return { id: k.id, v: k.v, b: k.b, dur: k.dur, x: r.x + (p.x + T.xOf(k.b + (k.dur ?? 1))) / 2, y: r.y + p.y, x0: r.x + p.x }; });
let termOk = false, termInfo = 'no term.line track';
if (term) { await page.mouse.click(term.x, term.y); await wait(250); const has = await ev(() => { const i = document.querySelector('.tl-inline input'); return i ? i.value : null; });
  if (has != null) { await page.fill('.tl-inline input', 'ANALYSING THE LAB'); await page.keyboard.press('Enter'); await wait(150); }
  const after = await ev((v) => (typeof v === 'number' ? window.u2c.cues.tags('').social.terminal[v] : null), term.v); termOk = has != null && after === 'ANALYSING THE LAB'; termInfo = `"${has}" → "${after}"`; }
ok('timeline: click a terminal clip -> edit its text in place', termOk, termInfo);
if (term) { const p0 = await ev((id) => { const k = window.u2c.cuetl.findKey(id)[1]; return { b: k.b, end: k.b + (k.dur ?? 1) }; }, term.id), ppb = await ev(() => window.u2c.cuetl.xOf(1) - window.u2c.cuetl.xOf(0));
  await page.mouse.move(term.x0 + 2, term.y); await page.mouse.down(); await page.mouse.move(term.x0 + 2 + ppb * 0.5, term.y, { steps: 5 }); await page.mouse.up(); await wait(150);
  const p1 = await ev((id) => { const k = window.u2c.cuetl.findKey(id)[1]; return { b: k.b, end: k.b + (k.dur ?? 1) }; }, term.id);
  ok('timeline: drag a clip\'s start edge (trim in, the end stays)', p1.b > p0.b + 0.2 && Math.abs(p1.end - p0.end) < 1e-6, `${p0.b}-${p0.end} → ${p1.b}-${p1.end}`); }
pt = await tlp(cam.id); await page.mouse.click(pt.x, pt.y, { button: 'right' }); await wait(150);
const menu = await ev(() => [...document.querySelectorAll('.tl-menu:not([hidden]) button')].map((b) => b.textContent));
await shot('timeline-menu-1440.png');
const nCam0 = await ev(() => window.u2c.cues.sheet.tracks.find((x) => x.path === 'camera.shot').keys.length);
await page.click('.tl-menu button[data-m="delete"]'); await wait(150);
const nCam1 = await ev(() => window.u2c.cues.sheet.tracks.find((x) => x.path === 'camera.shot').keys.length); await ev(() => window.u2c.cues.undo());
const lane = await ev(() => { const T = window.u2c.cuetl, t = window.u2c.cues.sheet.tracks.find((x) => x.path === 'camera.shot'), ks = t.keys.map((k) => k.b).sort((a, b) => a - b); let b = 1.5; for (let i = 0; i < ks.length - 1; i++) if (ks[i + 1] - ks[i] > 4) { b = Math.floor(ks[i] + 2); break; }
  const p = T.pointOf('camera.shot', b), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + p.x, y: r.y + p.y, b }; });
ok('timeline: right-click menu (edit, targets, ease, copy, delete)', menu.some((m) => /Change target/.test(m)) && menu.some((m) => /Hold/.test(m)) && menu.some((m) => /Delete key/.test(m)) && nCam1 === nCam0 - 1, `${menu.length} items · delete ${nCam0} → ${nCam1}`);
const sc0 = await ev(() => ({ v: window.u2c.cuetl.state.vscroll, s: window.u2c.cuetl.state.scroll, z: window.u2c.cuetl.state.ppb, fit: window.u2c.cuetl.lanesFit() }));
const cvb = await page.$eval('#cueCv', (c) => { const r = c.getBoundingClientRect(); return { x: r.x + r.width * 0.6, y: r.y + r.height * 0.6 }; });
await page.mouse.move(cvb.x, cvb.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control'); await wait(100);
const sc2 = await ev(() => ({ z: window.u2c.cuetl.state.ppb, v: window.u2c.cuetl.state.vscroll, s: window.u2c.cuetl.state.scroll }));
await page.keyboard.down('Shift'); await page.mouse.wheel(0, 300); await page.keyboard.up('Shift'); await wait(100);
const sc1 = await ev(() => ({ s: window.u2c.cuetl.state.scroll })); await page.mouse.wheel(0, 200); await wait(100); const sc3 = await ev(() => window.u2c.cuetl.state.vscroll);
ok('timeline wheel: shift = time, ctrl = zoom, vertical = lanes', sc1.s > sc2.s && sc2.z > sc0.z && (sc0.fit || sc3 > sc2.v), `scroll ${sc0.s.toFixed(1)} → ${sc1.s.toFixed(1)} · zoom ${sc0.z.toFixed(1)} → ${sc2.z.toFixed(1)} · lanes ${sc0.fit ? 'fit (page scrolls)' : sc2.v + ' → ' + sc3}`);
await ev(() => window.u2c.cuetl.fit());
await page.click('#coachStudio [data-coach="x"]'); await wait(100);
ok('coach: dismissed and remembered', await ev(() => document.querySelector('#coachStudio').hidden && JSON.parse(localStorage.getItem('u2c.coach.v1')).done === true));
await ev(() => window.u2c.cuetl.select([window.u2c.cues.sheet.tracks.find((x) => x.path === 'camera.shot').keys[0].id])); await wait(150);
const advA = await ev(() => ({ adv: document.querySelector('#advInsp').open, quickHidden: document.querySelector('#quick').hidden })); await page.click('#quickBack'); await wait(150);
const advB = await ev(() => ({ adv: document.querySelector('#advInsp').open, quick: !document.querySelector('#quick').hidden, sel: window.u2c.cuetl.selected().length }));
ok('Advanced opens itself while keys are selected; "back" returns to the simple controls', advA.adv && advA.quickHidden && !advB.adv && advB.quick && !advB.sel, JSON.stringify({ advA, advB }));

// ---------------------------------------------------------------- v27 free transform, smart guides, Layers lock, user effects, Simple quick + deep
// a beat after the intro where the camera holds wide (no move), the player paused there
const ftBeat = await ev(() => { const a = window.u2c, e = a.cues.ev(), ib = Math.round(e.value('intro.length', 0, 2) * 4) + 1, end = (a.store.project.outT - a.store.project.inT) / a.store.session.track.spb - 8;
  for (let b = ib; b < end; b += 0.5) { const s = e.shot(b); if (s.from === 'wide' && s.to === 'wide' && !s.moving) return b; } return ib + 4; });
await ev((b) => { const a = window.u2c; a.clock.pause(); a.actions.seek(a.store.project.inT + Math.round(b * a.store.session.track.spb * 30) / 30); }, ftBeat);
await page.waitForFunction((b) => { const a = window.u2c; return Math.abs(a.cuetl.state.playhead - b) < 0.05 && a.studio.info && a.studio.info.look === 'player'; }, ftBeat, { timeout: 20000 });
const FT = 'spectrum';
await page.click('#railTabs [data-pane="layers"]');
await page.click(`#layerList [data-sel="win.${FT}"]`);
await page.waitForFunction((id) => window.u2c.studio.pick === id && !document.querySelector('#pickBox').hidden && document.querySelectorAll('#pickBox .th').length === 8, FT, { timeout: 10000 });
const rectOf = () => ev((id) => window.u2c.studio.rects()[id].map((v) => Math.round(v * 100) / 100), FT);
const hist = () => ev(() => window.u2c.cues.history().past);
const ftR0 = await rectOf(), ftH0 = (await hist()).length;
const se = await page.$eval('#pickBox .th-se', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(se.x, se.y); await page.mouse.down(); await page.mouse.move(se.x - 18, se.y + 14, { steps: 6 }); await page.mouse.up();
await page.waitForFunction((n) => window.u2c.cues.history().past.length === n + 1, ftH0, { timeout: 5000 }).catch(() => {});
const ftR1 = await rectOf(), ftH1 = await hist();
await ev(() => window.u2c.cues.undo()); await page.waitForFunction(() => window.u2c.cues.history().future.length >= 1, null, { timeout: 5000 }).catch(() => {});
const ftR2 = await rectOf();
ok('free transform: drag a corner handle resizes the window (x / y stay), one undo step + History entry', ftR1[2] < ftR0[2] && ftR1[3] > ftR0[3] && ftR1[0] === ftR0[0] && ftR1[1] === ftR0[1] && ftH1.length === ftH0 + 1 && /^resize /.test(ftH1[ftH1.length - 1]) && JSON.stringify(ftR2) === JSON.stringify(ftR0),
  `${ftR0.slice(2).join('×')} → ${ftR1.slice(2).join('×')} · "${ftH1[ftH1.length - 1]}" · undo → ${ftR2.slice(2).join('×')}`);
// arrow nudge (the preview has focus): 1 px, Shift = 10 px, one step each
await page.focus('#view'); const nz0 = await rectOf(), nh0 = (await hist()).length;
await page.keyboard.press('ArrowRight'); await page.waitForFunction((x) => Math.round(window.u2c.studio.rects().spectrum[0]) === x + 1, nz0[0], { timeout: 5000 }).catch(() => {});
await page.keyboard.press('Shift+ArrowDown'); await page.waitForFunction((y) => Math.round(window.u2c.studio.rects().spectrum[1]) === y + 10, nz0[1], { timeout: 5000 }).catch(() => {});
const nz1 = await rectOf(), nh1 = await hist();
await ev(() => { window.u2c.cues.undo(); window.u2c.cues.undo(); });
ok('free transform: arrow keys nudge 1 px, Shift 10 px (one History step each)', nz1[0] === nz0[0] + 1 && nz1[1] === nz0[1] + 10 && nh1.length === nh0 + 2 && /^nudge /.test(nh1[nh1.length - 1]), `${nz0[0]},${nz0[1]} → ${nz1[0]},${nz1[1]} · ${nh1.slice(-2).join(' / ')}`);
// smart guides: drag the window so its centre lands 1.5 px off the frame centre -> it snaps onto it, a guide line shows while dragging
await page.waitForFunction((r) => JSON.stringify(window.u2c.studio.rects().spectrum.map((v) => Math.round(v * 100) / 100)) === JSON.stringify(r), nz0, { timeout: 5000 }).catch(() => {});
const sg = await ev((id) => { const a = window.u2c, r = a.studio.rects()[id], c = a.studio.info.cam || { z: 1 }, W = a.store.project.aspect === '916' ? 1080 : 1920, vr = document.querySelector('#view').getBoundingClientRect(), bb = document.querySelector('#pickBox').getBoundingClientRect();
  const dxw = (W / 2 + 1.5) - (r[0] + r[2] / 2); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, dx: dxw * c.z * vr.width / W, W }; }, FT);
await page.mouse.move(sg.x, sg.y); await page.mouse.down(); await page.mouse.move(sg.x + sg.dx * 0.5, sg.y + 1, { steps: 4 }); await page.mouse.move(sg.x + sg.dx, sg.y, { steps: 4 });
const sgLines = await ev(() => document.querySelectorAll('.snapg .sg.v').length); await page.mouse.up();
await page.waitForFunction(() => !document.querySelector('.snapg .sg'), null, { timeout: 5000 }).catch(() => {});
const sgR = await rectOf(), sgC = sgR[0] + sgR[2] / 2;
await ev(() => window.u2c.cues.undo());
ok('smart guides: the moving window snaps to the frame centre with a visible guide line', sgLines >= 1 && Math.abs(sgC - sg.W / 2) <= 0.5, `${sgLines} vertical guide(s) while dragging · centre x ${sgC} (frame centre ${sg.W / 2})`);
// Layers lock: a locked window cannot be picked on the preview; unlocked it can
await page.waitForFunction((r) => JSON.stringify(window.u2c.studio.rects().spectrum.map((v) => Math.round(v * 100) / 100)) === JSON.stringify(r), nz0, { timeout: 5000 }).catch(() => {});
await page.click(`#layerList [data-lock="win.${FT}"]`);
await page.waitForFunction((id) => (window.u2c.cues.sheet.meta.locks || {})['win.' + id] === true, FT, { timeout: 5000 }).catch(() => {});
const lockedRow = await ev((id) => !!document.querySelector(`#layerList .layer.locked[data-id="win.${id}"]`), FT);
await ev(() => window.u2c.studio.clearPick());
const lp = await ev((id) => { const a = window.u2c, r = a.studio.rects()[id], p = a.studio.toScreen([r[0] + r[2] * 0.3, r[1] + r[3] * 0.5, 1, 1]), vr = document.querySelector('#view').getBoundingClientRect(); return { x: vr.x + p.l / 100 * vr.width, y: vr.y + p.t / 100 * vr.height }; }, FT);
await page.mouse.click(lp.x, lp.y); await page.waitForFunction(() => window.u2c.cues.history().past.length > 0, null, { timeout: 2000 }).catch(() => {});
const pickLocked = await ev(() => window.u2c.studio.pick);
await page.click(`#layerList [data-lock="win.${FT}"]`);
await page.waitForFunction((id) => !(window.u2c.cues.sheet.meta.locks || {})['win.' + id], FT, { timeout: 5000 }).catch(() => {});
await ev(() => window.u2c.studio.clearPick()); await page.mouse.click(lp.x, lp.y);
await page.waitForFunction((id) => window.u2c.studio.pick === id, FT, { timeout: 5000 }).catch(() => {});
const pickFree = await ev(() => window.u2c.studio.pick), lockHist = await hist();
ok('Layers: lock blocks picking the window on the preview (unlock brings it back)', lockedRow && pickLocked !== FT && pickFree === FT && lockHist.some((l) => /^lock /.test(l)) && lockHist.some((l) => /^unlock /.test(l)), `locked → picked ${pickLocked} · unlocked → picked ${pickFree}`);
await ev(() => window.u2c.studio.clearPick());
// user effects: + Layer → Effects library → Negative at the playhead, intensity from the inspector slider, the frame changes
const sumPx = () => ev(async () => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'), s = makeSurface(108, 192, { read: true });
  app.renderFrame(p.inT + app.cuetl.state.playhead * tr.spb, s, p, tr, {}); const d = s.ctx.getImageData(0, 0, s.w, s.h).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; return sum / (d.length / 4) / 3; });
const px0 = await sumPx();
await page.click('#addTrackBtn'); await page.click('.addlayer [data-al="fxlib"]');
await page.waitForFunction(() => window.u2c.effects.isOpen, null, { timeout: 5000 });
const libN = await ev(() => document.querySelectorAll('.fxlib [data-fx]').length);
await page.click('.fxlib [data-fx="neg"]');
await page.waitForFunction(() => { const t = window.u2c.cues.sheet.tracks.find((q) => q.path === 'ufx.neg'); return t && t.keys.length === 1 && document.querySelector('#insp .fx-int input[type=range]'); }, null, { timeout: 5000 });
const fxk = await ev(() => { const k = window.u2c.cues.sheet.tracks.find((q) => q.path === 'ufx.neg').keys[0]; return { id: k.id, b: k.b, v: k.v, dur: k.dur }; });
const px1 = await sumPx();
await ev(() => { const r = document.querySelector('#insp .fx-int input[type=range]'); r.value = '0.5'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForFunction(() => window.u2c.cues.sheet.tracks.find((q) => q.path === 'ufx.neg').keys[0].v === 0.5, null, { timeout: 5000 }).catch(() => {});
const px2 = await sumPx(), fxH = await hist(), fxV = await ev(() => window.u2c.cues.sheet.tracks.find((q) => q.path === 'ufx.neg').keys[0].v);
ok('effects: library (8) → Negative clip at the playhead, intensity slider = one step, the rendered frame changes', libN === 8 && Math.abs(fxk.b - Math.round(ftBeat)) < 1e-6 && fxk.dur === 4 && fxV === 0.5 && fxH.slice(-2).join('|') === 'add effect Negative|edit key' && Math.abs(px1 - px0) > 20 && Math.abs(px2 - px1) > 10 && Math.abs(px2 - 127) < Math.abs(px0 - 127) + 1,
  `mean luma ${px0.toFixed(1)} → ${px1.toFixed(1)} (100 %) → ${px2.toFixed(1)} (50 %) · ${fxH.slice(-2).join(' / ')}`);
// stretch the effect clip on the timeline (drag its end edge one beat)
const fe = await ev((id) => { const T = window.u2c.cuetl, f = T.findKey(id), k = f[1], p = T.keyPoint(id), r = document.querySelector('#cueCv').getBoundingClientRect(); return { x: r.x + T.xOf(k.b + k.dur) - 2, y: r.y + p.y, ppb: T.xOf(1) - T.xOf(0) }; }, fxk.id);
await page.mouse.move(fe.x, fe.y); await page.mouse.down(); await page.mouse.move(fe.x + fe.ppb, fe.y, { steps: 5 }); await page.mouse.up();
await page.waitForFunction((id) => window.u2c.cuetl.findKey(id)[1].dur > 4.4, fxk.id, { timeout: 5000 }).catch(() => {});
const fxDur = await ev((id) => window.u2c.cuetl.findKey(id)[1].dur, fxk.id);
ok('effects: the clip stretches on the Effects track (drag its end)', fxDur > 4.4, `length 4 → ${fxDur} beats`);
await ev(() => { window.u2c.cuetl.clearSel(); window.u2c.cues.edit((s) => { s.tracks = s.tracks.filter((t) => !t.path.startsWith('ufx.')); }, 'clear test effects'); });
// Simple mode: the guide strip, the bigger timeline, quick setup always underneath the selection's properties
await ev(() => window.u2c.simple.set(false));
await page.waitForFunction(() => document.body.classList.contains('simple'), null, { timeout: 5000 });
await ev(() => { window.u2c.studio.select('spectrum'); });
await page.waitForFunction(() => document.querySelector('#advInsp').open && !document.querySelector('#quickNote').hidden, null, { timeout: 5000 }).catch(() => {});
const sm = await ev(() => { const q = (s) => document.querySelector(s), vis = (s) => { const e = q(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
  return { guide: vis('.tl-guide'), quick: vis('#quick'), quickRows: document.querySelectorAll('#quick .qc').length, head: vis('#quickNote'), name: q('#quickSel').textContent, back: q('#quickBack').textContent,
    order: +getComputedStyle(q('#quickNote')).order < +getComputedStyle(q('#advInsp')).order && q('#advInsp').getBoundingClientRect().top < q('#quick').getBoundingClientRect().top && q('#advInsp').getBoundingClientRect().bottom <= q('#quickH').getBoundingClientRect().top + 1, dock: Math.round(q('#dock').getBoundingClientRect().height) }; });
await shot('simple-quick-deep-1440.png');
await page.click('#quickBack'); await page.waitForFunction(() => !window.u2c.studio.pick && !document.querySelector('#advInsp').open, null, { timeout: 5000 }).catch(() => {});
const smBack = await ev(() => ({ pick: window.u2c.studio.pick, adv: document.querySelector('#advInsp').open, quick: !document.querySelector('#quick').hidden }));
await ev(() => window.u2c.simple.set(true)); await page.waitForFunction(() => !document.body.classList.contains('simple'), null, { timeout: 5000 });
ok('Simple mode: guide strip, a taller timeline, the selection on top with "Back to quick setup", quick controls underneath', sm.guide && sm.quick && sm.quickRows >= 20 && sm.head && /spectrum/i.test(sm.name) && /quick setup/i.test(sm.back) && sm.order && sm.dock >= 300 && !smBack.pick && !smBack.adv && smBack.quick, JSON.stringify({ ...sm, back: smBack }));

// ---------------------------------------------------------------- command palette
await page.click('#cueCv', { position: { x: 400, y: 5 } }).catch(() => {});
await page.keyboard.press('Control+k'); await wait(150);
const palOpen = await ev(() => document.querySelector('#palette').open && document.activeElement.id === 'palIn');
await page.keyboard.type('zoom fit'); await wait(100);
const palTop = await ev(() => { const s = window.u2c.palette.search('zoom fit'); return s[0] && s[0].id; });
await page.keyboard.press('Enter'); await wait(150);
ok('palette: Ctrl+K opens, fuzzy search, Enter runs and closes', palOpen && palTop === 'zoom-fit' && !(await ev(() => document.querySelector('#palette').open)), `top hit ${palTop}`);
const palDyn = await ev(() => { const P = window.u2c.palette, a = P.search('cursor on'), w = P.search('lab test'); return { prop: a.filter((c) => c.group === 'Property').length, word: w.filter((c) => c.group === 'Word').length, n: P.commands().length }; });
ok('palette: every property and every on-screen word is reachable', palDyn.prop > 0 && palDyn.word > 0 && palDyn.n > 150, `${palDyn.n} commands · "cursor on" ${palDyn.prop} properties · "lab test" ${palDyn.word} words`);
await ev(() => window.u2c.palette.open('cursor')); await wait(100);
await page.keyboard.press('Enter'); await page.waitForFunction(() => document.activeElement && document.activeElement.closest('#insp'), null, { timeout: 5000 }).catch(() => {});
const jumped = await ev(() => { const a = document.activeElement; return { tab: document.querySelector('.tabs [aria-selected="true"]').dataset.tab, inInsp: !!(a && a.closest('#insp')) }; });
ok('palette: jump to a property focuses it in the inspector', jumped.tab === 'inspect' && jumped.inInsp, JSON.stringify(jumped));
await ev(() => window.u2c.palette.open('')); await wait(50); await shot('palette-1440.png'); await page.keyboard.press('Escape'); await wait(100);

// ---------------------------------------------------------------- shortcut sheet
await ev(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Shift+Slash'); await wait(200);
const keys = await ev(() => ({ open: document.querySelector('#keysDlg').open, n: document.querySelectorAll('#keysBody kbd').length, groups: document.querySelectorAll('#keysBody section').length }));
await shot('shortcuts-1440.png');
await page.keyboard.press('Escape'); await wait(100);
ok('? opens the keyboard shortcut sheet', keys.open && keys.n >= 40 && keys.groups === 4, `${keys.n} keys in ${keys.groups} groups`);

// ---------------------------------------------------------------- metadata
await page.click('.tabs [data-tab="meta"]'); await wait(200);
await page.fill('#mDur', '2:34'); await page.press('#mDur', 'Enter'); await wait(100);
await page.fill('#mTags', 'DRILL, DARK'); await page.press('#mTags', 'Enter'); await wait(100);
await page.selectOption('#mBits', '16'); await wait(100);
await page.fill('#mSize', '12.5'); await page.press('#mSize', 'Enter'); await wait(100);
await page.fill('#mDate', 'NOV 21 2026'); await page.press('#mDate', 'Enter'); await wait(100);
await page.fill('#mProd', '@labrat'); await page.press('#mProd', 'Enter'); await wait(100);
const meta = await ev(async () => { const app = window.u2c, p = app.store.project, tr = app.store.session.track, { makeSurface } = await import('/src/engine/render.js'); app.renderFrame(p.inT + 8, makeSurface(108, 192), p, tr, {});
  const D = app.clip.current().D, f = app.meta.fields(); return { dur: D.song.duration, bytes: D.fileInfo.bytes, bits: D.fileInfo.bits, f: { duration: f.duration, tags: f.tags, format: f.format, size: f.size, date: f.date, producer: f.producer }, tag: app.cues.tags('').player.meta.tags, prodTag: app.cues.tags('').producer }; });
ok('metadata: every field edits the video (duration, size, format, date, tags, producer)', meta.dur === 154 && Math.abs(meta.bytes / 1048576 - 12.5) < 0.01 && meta.bits === 16 && meta.tag === 'DRILL, DARK' && meta.f.date === 'NOV 21 2026' && meta.prodTag === '@labrat' && /16-BIT/.test(meta.f.format),
  JSON.stringify(meta.f));
await page.fill('#wordSearch', 'lab test'); await wait(150);
const hits = await ev(() => document.querySelectorAll('#wordResults [data-tag]').length);
const wpath = await ev(() => document.querySelector('#wordResults [data-tag]').dataset.tag);
await page.fill(`#wordResults [data-tag="${wpath}"]`, 'THIS BEAT PASSED'); await page.click('#wordCount'); await wait(150);
const wv = await ev((p) => p.split('.').reduce((a, k) => a && a[k], window.u2c.cues.tags('')), wpath);
await shot('meta-1440.png');
await ev(() => window.u2c.cues.undo()); await wait(100);
const wv2 = await ev((p) => p.split('.').reduce((a, k) => a && a[k], window.u2c.cues.tags('')), wpath);
ok('metadata: search every word, edit in place, undo', hits >= 1 && wv === 'THIS BEAT PASSED' && wv2 !== 'THIS BEAT PASSED', `${hits} hits · ${wpath}: "${wv}" → undo "${wv2}"`);

// ---------------------------------------------------------------- marker list
await page.click('#railTabs [data-pane="markers"]'); await wait(100);
await ev(() => window.u2c.actions.seek(window.u2c.store.project.inT + 6 * window.u2c.store.session.track.spb)); await wait(150);
await page.click('#markerAdd'); await wait(150);
await page.keyboard.type('DROP'); await page.keyboard.press('Enter'); await wait(150);
const mk = await ev(() => (window.u2c.cues.sheet.markers || []).map((m) => m.label + '@' + m.b));
await ev(() => window.u2c.actions.seek(window.u2c.store.project.inT)); await wait(100);
await page.click('#markerItems li.marker .mk-t'); await wait(300);
const ph = await ev(() => { const a = window.u2c; return (a.clock.time() - a.store.project.inT) / a.store.session.track.spb; });
const sections = await ev(() => document.querySelectorAll('#markerItems li.section').length);
await shot('markers-1440.png');
ok('marker list: add, rename, jump, sections listed', mk.length === 1 && mk[0].startsWith('DROP@') && Math.abs(ph - +mk[0].split('@')[1]) < 0.08 && sections >= 1, `${mk.join(',')} · playhead ${ph.toFixed(2)} · ${sections} sections`);
await page.click('#markerItems .mk-x'); await wait(100);
ok('marker list: delete', await ev(() => (window.u2c.cues.sheet.markers || []).length === 0));

// ---------------------------------------------------------------- keyframe copy / paste across lanes
const cp = await ev(() => { const app = window.u2c, T = app.cuetl, R = app.registry().byPath, a = app.cues.sheet.tracks.find((t) => t.kind === 'number' && t.keys.length && !t.lock);
  const to = Object.keys(R).find((p) => R[p].kind === 'number' && p !== (a && a.path) && !app.cues.sheet.tracks.some((t) => t.path === p && t.keys.length)); if (!a || !to) return { skip: true, a: !!a, to };
  const k = a.keys[0]; T.select([k.id]); T.copy(); T.clearSel(); T.state.playhead = 3.5;
  const okp = app.palette.pasteToLane(to); const t = app.cues.sheet.tracks.find((x) => x.path === to), p = R[to], want = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, +k.v));
  return { from: a.path, to, okp, n0: 0, n1: t ? t.keys.length : 0, at: !!t && t.keys.some((q) => Math.abs(q.b - 3.5) < 1e-6 && Math.abs(q.v - want) < 1e-9) }; });
ok('keyframes: copy on one lane, paste into another lane', !cp.skip && cp.okp && cp.n1 === cp.n0 + 1 && cp.at, JSON.stringify(cp));
await ev(() => window.u2c.cues.undo());

// ---------------------------------------------------------------- program monitor
await ev(() => { const m = window.u2c.monitor; for (const g of ['action', 'title', 'thirds', 'center']) m.setGuide(g, true); });
const gd = await ev(() => ({ hidden: document.querySelector('#guides').hidden, n: document.querySelectorAll('#guides > *').length }));
ok('monitor: action / title safe, thirds, centre guides', !gd.hidden && gd.n === 7, `${gd.n} guide elements`);
const w1 = await ev(() => document.querySelector('#view').width); await ev(() => window.u2c.monitor.setRes(0.5)); await wait(150);
const w2 = await ev(() => document.querySelector('#view').width); await ev(() => window.u2c.monitor.setRes(1)); await wait(150);
ok('monitor: preview resolution 1/2', Math.abs(w2 - w1 / 2) <= 1, `${w1} → ${w2} px`);
// compare: B = nigredo snapshot, A = rubedo; the right half of the preview shows B
const half = () => ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('#view'), g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(Math.round(w * 0.6), 0, Math.round(w * 0.4), h).data; let s = 0, col = 0;
  for (let i = 0; i < d.length; i += 64) { s += d[i] + d[i + 1] + d[i + 2]; col += Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]); } r({ s, col }); }))));
await ev(() => { window.u2c.clock.pause(); window.u2c.actions.seek(window.u2c.store.project.inT + 10 * window.u2c.store.session.track.spb); window.u2c.monitor.snapshotB(); window.u2c.actions.setStage('rubedo'); window.u2c.studio.markDirty(); }); await wait(500);
const offR = await half(); await ev(() => { window.u2c.monitor.setCompare(true); window.u2c.monitor.wipe = 0.5; }); await wait(500); const onR = await half();
await shot('compare-1440.png');
await ev(() => { window.u2c.monitor.setCompare(false); window.u2c.actions.setStage('nigredo'); for (const g of ['action', 'title', 'thirds', 'center']) window.u2c.monitor.setGuide(g, false); }); await wait(200);
ok('monitor: compare A/B wipe shows the snapshot on the right', onR.col < offR.col * 0.5, `right-half colour ${offR.col} (A, rubedo) → ${onR.col} (B, nigredo)`);
const tA = await ev(() => window.u2c.clock.time()); await page.click('#frFwd'); await page.click('#frFwd'); await wait(100); const tB = await ev(() => window.u2c.clock.time());
await page.click('#frBack'); await wait(100); const tC = await ev(() => window.u2c.clock.time());
ok('monitor: frame step buttons', Math.abs(tB - tA - 2 / 30) < 1e-3 && Math.abs(tB - tC - 1 / 30) < 1e-3, `${tA.toFixed(3)} → ${tB.toFixed(3)} → ${tC.toFixed(3)}`);
await page.click('#loopIOBtn'); await wait(100); const loop = await ev(() => window.u2c.cuetl.state.loop);
await page.click('#loopIOBtn'); await wait(100); const loop2 = await ev(() => window.u2c.cuetl.state.loop);
ok('monitor: loop in/out button', loop && loop.b - loop.a === 16 && !loop2, JSON.stringify(loop));
const rb = await page.$eval('#cueCv', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
const g0 = await ev(() => window.u2c.monitor.grains);
await page.mouse.move(rb.x + 300, rb.y + 8); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(rb.x + 300 + i * 25, rb.y + 8); await wait(60); } await page.mouse.up();
const g1 = await ev(() => window.u2c.monitor.grains);
ok('timeline: dragging the playhead in the ruler scrubs audio', g1 - g0 >= 4, `${g1 - g0} audio grains`);
await page.waitForFunction(() => window.u2c.monitor.thumbs.cached >= 12, null, { timeout: 90000 }).catch(() => {});
const th = await ev(() => { const c = document.querySelector('#thumbCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return { cached: window.u2c.monitor.thumbs.cached, painted: n / (d.length / 16) }; });
ok('timeline: filmstrip of the film along the ruler', th.cached >= 12 && th.painted > 0.15, `${th.cached} thumbs · ${(th.painted * 100).toFixed(0)} % painted`);

// ---------------------------------------------------------------- workspace
const pw0 = await page.$eval('.panel', (e) => e.getBoundingClientRect().width);
const gr = await page.$eval('#gripR', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 200 }; });
await page.mouse.move(gr.x, gr.y); await page.mouse.down(); await page.mouse.move(gr.x - 60, gr.y, { steps: 4 }); await page.mouse.up(); await wait(150);
const pw1 = await page.$eval('.panel', (e) => e.getBoundingClientRect().width);
await page.click('#leftToggle'); await wait(150); const lh = await ev(() => getComputedStyle(document.querySelector('#layers')).display);
const vw1 = await page.$eval('#view', (e) => e.getBoundingClientRect().width);
await page.click('#leftToggle'); await wait(150); const lh2 = await ev(() => getComputedStyle(document.querySelector('#layers')).display);
ok('workspace: resize the right panel, collapse / restore the left', Math.abs(pw1 - pw0 - 60) <= 2 && lh === 'none' && lh2 !== 'none', `panel ${pw0} → ${pw1} px · left ${lh} → ${lh2} · viewer ${vw1.toFixed(0)} px`);
await ev(() => window.u2c.workspace.reset()); await wait(100);

// ---------------------------------------------------------------- export queue
await page.click('.tabs [data-tab="export"]'); await wait(150);
await page.click('[data-qp="tiktok"]'); await page.click('[data-qp="youtube"]'); await page.click('[data-qp="reels"]'); await wait(100);
await page.fill('#qTpl', '{title}-{preset}-{aspect}-{len}s'); await wait(100);
const qn = await ev(() => window.u2c.queue.items.map((it) => window.u2c.queue.nameOf(it)));
await shot('queue-1440.png');
ok('queue: presets + file name template', qn.length === 3 && /TikTok-9x16-30s$/.test(qn[0]) && /YouTube-16x9-\d+s$/.test(qn[1]) && /Reels-9x16-15s$/.test(qn[2]), qn.join(' · '));
await page.click('#qClear'); await wait(50);
if (!process.env.NOEXPORT) {
  await ev(() => { window.u2c.queue.add({ name: 'Test', label: 'Test 9:16 · 2 bars', aspect: '916', len: 4, draft: true }); window.u2c.queue.add({ name: 'Test', label: 'Test 16:9 · 2 bars', aspect: '169', len: 4, draft: true }); });
  const tq = Date.now(); const done = await ev(() => window.u2c.queue.run());
  const st = await ev(() => ({ s: window.u2c.queue.items.map((i) => i.status + ':' + (i.file || '')), res: document.querySelectorAll('#results .res').length }));
  ok('queue: renders its items one after another', done === 2 && st.s.every((x) => x.startsWith('done:')) && st.res >= 2, `${st.s.join(' · ')} · ${((Date.now() - tq) / 1000).toFixed(0)} s`);
  await page.click('#qClear');
}

// ---------------------------------------------------------------- projects
const projA = await ev(async () => { const app = window.u2c, c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 64);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); await app.media.setCover(1, blob, 'red.png'); app.cuetl.addMarker('A-MARK'); return app.projects.save('Project A'); });
await ev(() => { const t = document.querySelector('#projTitle'); t.value = 'Second Beat'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); window.u2c.cuetl.clearSel(); window.u2c.cues.edit((s) => { s.markers = []; }, 'x'); });
await ev(() => window.u2c.projects.saveAs('Project B')); await wait(100);
const dup = await ev(async () => (await window.u2c.projects.duplicate(window.u2c.projects.list().find((p) => p.name === 'Project B').id)).name);
const ren = await ev(async (dup) => { const id = window.u2c.projects.list().find((p) => p.name === dup).id; await window.u2c.projects.rename(id, 'Project C'); return window.u2c.projects.list().map((p) => p.name); }, dup);
ok('projects: save, save as, duplicate, rename', projA && ren.length === 3 && ren.includes('Project A') && ren.includes('Project B') && ren.includes('Project C'), ren.join(' · '));
await ev(() => window.u2c.projects.openDialog()); await wait(200); await shot('projects-1440.png'); await page.click('#pjClose');
await ev(() => window.u2c.media.resetCover(1));
const opened = await ev(async () => { const app = window.u2c, id = app.projects.list().find((p) => p.name === 'Project A').id; const r = await app.projects.open(id);
  return { r, title: app.store.project.title, marks: (app.cues.sheet.markers || []).map((m) => m.label), cover1: app.media.list()[1].name, cur: app.projects.current === id, metaTags: app.cues.tags('').player.meta.tags, dur: app.store.project.meta.duration }; });
ok('projects: open restores title, cue sheet, markers, covers, metadata', opened.r && opened.title !== 'Second Beat' && opened.marks.includes('A-MARK') && opened.cover1 === 'red.png' && opened.cur && opened.metaTags === 'DRILL, DARK' && opened.dur === 154, JSON.stringify(opened));
const file = await ev(async () => { const x = await window.u2c.projects.exportFile(null, { download: false, audio: false }); return { text: await x.blob.text(), fname: x.fname }; });
const doc = JSON.parse(file.text);
ok('projects: .u2cproj export holds the cue sheet, tags and covers', doc.format === 'u2cproj' && doc.sheet && doc.sheet.tracks.length > 5 && doc.tags && doc.covers.length === 1 && /^data:image\/png/.test(doc.covers[0].data) && /\.u2cproj$/.test(file.fname), `${file.fname} · ${(file.text.length / 1024).toFixed(0)} KB · ${doc.sheet.tracks.length} tracks · ${doc.covers.length} cover`);
doc.name = 'Imported'; doc.project.title = 'Imported Title';
const imp = await ev(async (t) => { const app = window.u2c; await app.media.resetCover(1); const e = await app.projects.importFile(t); return { e: e && e.name, n: app.projects.list().length, title: app.store.project.title, cover1: app.media.list()[1].name, marks: (app.cues.sheet.markers || []).map((m) => m.label) }; }, JSON.stringify(doc));
ok('projects: import a .u2cproj (new project, opened)', imp.e === 'Imported' && imp.n === 4 && imp.title === 'Imported Title' && imp.cover1 === 'red.png' && imp.marks.includes('A-MARK'), JSON.stringify(imp));
const del = await ev(async () => { const app = window.u2c, id = app.projects.list().find((p) => p.name === 'Project C').id; await app.projects.remove(id); return app.projects.list().map((p) => p.name); });
ok('projects: delete', del.length === 3 && !del.includes('Project C'), del.join(' · '));
await page.click('#backBtn'); await wait(500);
const recent = await ev(() => ({ hidden: document.querySelector('#recent').hidden, n: document.querySelectorAll('#recentList .pj').length, img: document.querySelectorAll('#recentList img').length }));
await shot('home-1440.png');
ok('home: recent projects with thumbnails', !recent.hidden && recent.n === 3 && recent.img >= 1, JSON.stringify(recent));
// open from home -> studio
await page.click('#recentList [data-open] >> nth=0'); await page.waitForFunction(() => !document.querySelector('#studio').hidden, null, { timeout: 60000 }); await wait(800);
ok('home: a recent project opens in the studio', await ev(() => !document.querySelector('#studio').hidden && !!window.u2c.projects.current));
await ev(() => { for (const g of ['action', 'title', 'thirds']) window.u2c.monitor.setGuide(g, true); }); await page.click('.tabs [data-tab="inspect"]'); await wait(400);
await shot('studio-1440.png');
await ev(() => { for (const g of ['action', 'title', 'thirds']) window.u2c.monitor.setGuide(g, false); });

// ---------------------------------------------------------------- phone
await page.setViewportSize({ width: 390, height: 844 }); await wait(700);
await shot('studio-390.png');
const of1 = await ev(() => document.documentElement.scrollWidth - window.innerWidth);
await ev(() => window.u2c.palette.open('')); await wait(150); await shot('palette-390.png'); await page.keyboard.press('Escape');
await page.click('.tabs [data-tab="meta"]'); await page.locator('#pane-meta').scrollIntoViewIfNeeded(); await wait(200); await shot('meta-390.png');
await page.click('.tabs [data-tab="export"]'); await wait(150); await page.locator('#qList').scrollIntoViewIfNeeded(); await shot('queue-390.png');
await page.click('#backBtn'); await wait(500); await shot('home-390.png');
const of2 = await ev(() => document.documentElement.scrollWidth - window.innerWidth);
ok('phone 390: studio and home without horizontal scroll', of1 <= 0 && of2 <= 0, `overflow ${of1} / ${of2} px`);
const real = errors.filter((e) => !/favicon/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 5).join(' | '));
// v25 presets: save what you changed (a moved window), change it again, apply the preset -> the saved position comes back; capture keeps only changes
{ const r = await ev(async () => { const app = window.u2c; app.actions.setProp('win.spectrum.x', 123); const id = app.presets.save('Test layout'), d = app.presets.list().find((q) => q.id === id).data;
    app.actions.setProp('win.spectrum.x', 456); app.presets.apply(id); const x = app.cues.ev().value('win.spectrum.x', 0, null);
    const n = Object.keys(d.base).length; app.presets.remove(id); return { x, n, has: 'win.spectrum.x' in d.base || d.tracks.some((t) => t.path === 'win.spectrum.x'), left: app.presets.list().length }; });
  ok('presets: save a moved window, apply it back (only changes captured), delete', r.x === 123 && r.has && r.left === 0, JSON.stringify(r)); }
await browser.close(); if (server) server.close();
const failed = results.filter((r) => !r.pass).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
