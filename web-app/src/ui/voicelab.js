// v23 VOICE LAB (left rail -> Media -> Intro voice): a new intro take straight from ElevenLabs, through the viewer's own claude.ai connector
// (the page never holds a key). Pick one of your voices (your created voices first), edit what she says (tags voice.number + voice.lines,
// the same words the console types), Generate = ONE take (eleven_v4, credits spent only on that click), it becomes the intro voice take
// (split at its pauses, phrase i placed at voice.ats[i]). Every take is a new intro. Without the connector (or outside claude.ai) the
// panel says so and the old route stays: Copy ElevenLabs prompt, then Load voice take.
// API: app.voiceLab = { refresh(), prompt(), voices() }.
import { setTagIn } from './metadata.js';
import { VOICE_ATS, VOICE_DURS } from '../v8/tags.js';
import { phrases, placeVoice, room, stove } from '../export/labaudio.js';
import { PRE_S, INTRO_S } from '../cues/generate.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const SERVER = 'ElevenLabs', MODEL = 'eleven_v4';
const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const pay = (r) => { if (!r) return null; if (r.payload != null) return r.payload; if (r.structuredContent != null) return r.structuredContent; const t = (r.content || []).find((q) => q.type === 'text'); if (t) { try { return JSON.parse(t.text); } catch (_) { return null; } } return null; };

export function createVoiceLab(app) {
  const root = $('#voiceLab'); if (!root) return null;
  let mcp, voices = [], busy = false, takes = [];
  const tags = () => app.cues.tags('') || {}, V = () => tags().voice || {};
  // v23 migration: v22.8 projects said the title as phrase 3; the title is now only written on the card
  { const v = V(), L = v.lines || []; if (L.some((q) => /\{title\}/i.test(String(q)))) app.cues.edit((s) => { setTagIn(s, 'voice.lines', L.filter((q) => !/\{title\}/i.test(String(q)))); setTagIn(s, 'voice.ats', VOICE_ATS); setTagIn(s, 'voice.durs', VOICE_DURS); }, 'voice: drop the spoken title'); }
  function spoken() {   // what she says, written for the voice ("Nº 01" -> "number one", "UCHE2CRAZY" -> "Oo-chay Two Crazy")
    const v = V(), nn = String(v.number || '01'), n = parseInt(nn, 10), nw = Number.isFinite(n) && n <= 20 ? NUMW[n] : nn;
    return (v.lines || []).map((q) => String(q).replace(/\{n\}/g, nw).replace(/Nº|N°|No\.?/gi, 'number').replace(/uche ?2 ?crazy/gi, 'Oo-chay Two Crazy').replace(/\{title\}/g, app.store.project.title || '').toLowerCase().replace(/^./, (c) => c.toUpperCase()));
  }
  const prompt = () => `[${V().style || 'smooth, calm, confident, like a lab announcement'}] ` + spoken().map((w, i, a) => w + (i < a.length - 1 ? '... [pause]' : '.')).join(' ');
  const status = (t, cls = '') => { const el = root.querySelector('.vl-status'); el.textContent = t; el.className = 'hint vl-status ' + cls; };
  function render() {
    const v = V(), L = v.lines || [];
    root.innerHTML = `<div class="group-h"><span class="lbl">Voice lab <span class="hint">ElevenLabs</span></span><span class="vl-dot" aria-hidden="true"></span></div>
      <div class="vl-grid">
        <label class="lbl" for="vlVoice">Voice</label><div class="inrow"><select class="inp small" id="vlVoice" aria-label="ElevenLabs voice"><option value="">${mcp ? 'load your voices…' : 'connector not available'}</option></select><button class="btn tiny" id="vlLoad" data-tip="Load voices|Lists the voices in your ElevenLabs account, the ones you created first.">Load</button></div>
        <label class="lbl" for="vlNum">Experiment Nº</label><input class="inp mono small" id="vlNum" value="${esc(v.number || '01')}" inputmode="numeric" data-tip="Experiment number|Fills {n} in her first line and in the console caption.">
        ${L.map((q, i) => `<label class="lbl" for="vlL${i}">Line ${i + 1}</label><input class="inp small vl-line" id="vlL${i}" data-i="${i}" value="${esc(q)}">`).join('')}
        <label class="lbl" for="vlStyle">Delivery</label><input class="inp small" id="vlStyle" value="${esc(v.style || '')}" placeholder="smooth, calm, confident" data-tip="Delivery|ElevenLabs v4 direction tag, e.g. calm, clinical, close to the mic.">
      </div>
      <p class="hint vl-say" aria-live="polite"></p>
      <div class="vl-time"><div class="group-h"><span class="lbl">When she speaks</span><span class="inrow"><button class="btn tiny" id="vlListen" data-tip="Listen|Plays the intro sound (stove, room, her lines where you placed them). Click again to stop.|">▶ Listen</button><button class="btn tiny" id="vlAuto" data-tip="Auto-place|First line after the stove, last line ends just before the play click, the middle one in between.|">Auto-place</button></span></div>
        <svg class="vl-tl" viewBox="0 0 300 96" role="img" aria-label="Intro timeline: drag her lines to place them"></svg>
        <div class="vl-ats">${L.map((q, i) => `<label class="vl-at"><span>Line ${i + 1}</span><input class="inp mono small" type="number" step="0.05" min="0" max="${PRE_S}" data-at="${i}" aria-label="Line ${i + 1} starts at (seconds)"><i>s</i></label>`).join('')}</div>
        <p class="hint">Drag a line on the strip (or type its start). The beat starts at ${PRE_S.toFixed(1)} s, on the play click. The keyboard follows her words.</p></div>
      <div class="inrow"><button class="btn small primary" id="vlGen" data-tip="Generate a new intro|One ElevenLabs take with these lines and voice (spends credits). It becomes the intro voice take.">Generate intro take</button><button class="btn small" id="vlCopy" data-tip="Copy prompt|Copy the exact prompt to paste into ElevenLabs yourself.">Copy prompt</button></div>
      <p class="hint vl-status" role="status"></p><ul class="vl-takes"></ul>`;
    root.querySelector('.vl-say').textContent = '“' + spoken().join(' … ') + '”';
    fillVoices(); renderTakes(); drawTime();
  }
  function fillVoices() { const sel = root.querySelector('#vlVoice'), cur = V().voice_id || ''; if (!voices.length) return;
    const own = voices.filter((q) => !q.is_library_voice), lib = voices.filter((q) => q.is_library_voice);
    sel.innerHTML = (own.length ? `<optgroup label="Your voices">${own.map((q) => `<option value="${esc(q.voice_id)}">${esc(q.name)}</option>`).join('')}</optgroup>` : '') + (lib.length ? `<optgroup label="Library">${lib.map((q) => `<option value="${esc(q.voice_id)}">${esc(q.name)}</option>`).join('')}</optgroup>` : '');
    const byName = String(V().voice_name || '').trim().toLowerCase(), named = byName && voices.find((q) => String(q.name).trim().toLowerCase() === byName);   // v23: the preferred voice by name (default AI 1 girl)
    sel.value = voices.some((q) => q.voice_id === cur) ? cur : (named || own[0] || voices[0]).voice_id; }
  function renderTakes() { const ul = root.querySelector('.vl-takes'); ul.innerHTML = takes.map((tk, i) => `<li><button class="btn tiny" data-use="${i}">${tk.blob ? 'Use' : 'Open'}</button> <span>${esc(tk.name)}</span>${tk.blob ? '' : ' <span class="hint">save it, then Load voice take</span>'}</li>`).join(''); }
  const setTag = (path, v, why) => app.cues.edit((s) => setTagIn(s, path, v), why);
  root.addEventListener('change', (e) => { const el = e.target;
    if (el.id === 'vlNum') setTag('voice.number', el.value.trim() || '01', 'experiment number');
    else if (el.id === 'vlStyle') setTag('voice.style', el.value, 'voice delivery');
    else if (el.classList.contains('vl-line')) setTag(`voice.lines.${el.dataset.i}`, el.value.toUpperCase(), 'voice line');
    else if (el.id === 'vlVoice') { const q = voices.find((x) => x.voice_id === el.value); app.cues.edit((s) => { setTagIn(s, 'voice.voice_id', el.value); setTagIn(s, 'voice.voice_name', q ? q.name : ''); }, 'voice'); }
    root.querySelector('.vl-say').textContent = '“' + spoken().join(' … ') + '”'; });
  async function loadVoices() {
    if (!mcp) { status('The ElevenLabs connector is not available here: open U2C Studio in claude.ai with ElevenLabs connected, or use Copy prompt + Load voice take.', 'warn'); return; }
    status('loading your voices…');
    try { const out = []; let cursor; for (let pg = 0; pg < 3; pg++) { const r = pay(await mcp.callTool(SERVER, 'creative_list_voices', { languages: ['en'], page_size: 100, ...(cursor ? { cursor } : {}) })); if (!r) break; out.push(...(r.voices || [])); if (!r.has_more || !r.next_cursor) break; cursor = r.next_cursor; }
      voices = out; fillVoices(); status(`${voices.filter((q) => !q.is_library_voice).length} of your voices, ${voices.filter((q) => q.is_library_voice).length} library voices`);
      const sel = root.querySelector('#vlVoice'); if (sel.value && sel.value !== V().voice_id) sel.dispatchEvent(new Event('change', { bubbles: true })); }
    catch (err) { status(err && err.code === 'not_granted' ? 'Access to ElevenLabs was declined for this page.' : `Could not list voices (${(err && (err.code || err.message)) || 'error'}).`, 'warn'); }
  }
  async function generate() {
    if (busy) return; const voice_id = root.querySelector('#vlVoice').value; if (!mcp) { await loadVoices(); return; } if (!voice_id) { status('Load your voices and pick one first.', 'warn'); return; }
    busy = true; root.querySelector('#vlGen').disabled = true; status('generating one take…');
    try {
      const r = pay(await mcp.callTool(SERVER, 'creative_generate_speech', { prompt: prompt(), model_id: MODEL, voice_id, generations_count: 1 }, { cache: false })) || {};
      const flow = r.flow_id, sids = r.session_ids || (r.session_id ? [r.session_id] : []); let gen = (r.generations || []).find((g) => g.content_url && g.status === 'completed');
      for (let i = 0; !gen && flow && sids.length && i < 60; i++) { await new Promise((ok) => setTimeout(ok, 1000 * Math.min(6, Math.max(1.5, +r.poll_after_seconds || 3))));
        const st = pay(await mcp.callTool(SERVER, 'creative_get_flow_run_status', { flow_id: flow, session_ids: sids }, { cache: false })) || {};
        gen = (st.generations || []).find((g) => g.content_url && g.status === 'completed'); if (!gen && (st.has_failures || st.all_completed)) break; status(`generating… ${i + 1}`); }
      if (!gen) throw { message: 'the take did not finish' };
      const name = `ElevenLabs · ${(voices.find((q) => q.voice_id === voice_id) || {}).name || 'voice'} · Nº ${V().number || '01'}`;
      let blob = null; try { const res = await fetch(gen.content_url); if (res.ok) blob = await res.blob(); } catch (_) { blob = null; }
      takes.unshift({ name, url: gen.content_url, blob }); renderTakes();
      if (blob) { await app.media.setVoice(blob, name); status('New intro take loaded: it plays on the intro in the export (Review shows the timing).', 'ok'); }
      else status('The take is ready, but this page cannot download it: Open it, save the file, then Load voice take.', 'warn');
    } catch (err) { status(`Generation failed (${(err && (err.code || err.message)) || 'error'}). Nothing was retried.`, 'warn'); }
    busy = false; const g = root.querySelector('#vlGen'); if (g) g.disabled = false;
  }
  // ---- v26 timing: her lines on the 0..PRE_S intro strip (seconds), with the intro moments; drag or type; listen; auto-place
  let durs = null, takeKey = '', playing = null;
  const ats = () => String(V().ats || VOICE_ATS).split(',').map(Number), nL = () => (V().lines || []).length;
  async function measure() { const vt = app.media && app.media.voice; if (!vt) { durs = null; return; } const k = vt.name + vt.blob.size; if (k === takeKey) return; takeKey = k;
    try { const take = await app.clock.ctx.decodeAudioData(await vt.blob.arrayBuffer()); durs = phrases(take, nL()).map(([a, b]) => b - a); drawTime(); } catch (_) { durs = null; } }
  const X = (t) => 10 + t / PRE_S * 280;
  function drawTime() { const svg = root.querySelector('.vl-tl'); if (!svg) return; const A = ats(), D = durs || String(V().durs || VOICE_DURS).split(',').map(Number);
    const ev = [['hook', 0.25], ['drag', INTRO_S.press], ['pick', INTRO_S.pick], ['play', PRE_S]];
    let h = `<rect x="10" y="26" width="280" height="44" rx="4" class="vl-bg"/>`;
    for (let s2 = 0; s2 <= PRE_S; s2++) h += `<line x1="${X(s2)}" x2="${X(s2)}" y1="70" y2="76" class="vl-tick"/><text x="${X(s2)}" y="88" class="vl-tt">${s2}</text>`;
    for (const [n, t] of ev) h += `<line x1="${X(t)}" x2="${X(t)}" y1="12" y2="72" class="vl-ev${n === 'play' ? ' play' : ''}"/><text x="${X(t) + (n === 'play' ? -3 : 2)}" y="10" class="vl-et" text-anchor="${n === 'play' ? 'end' : 'start'}">${n}</text>`;
    A.forEach((t, i) => { const d = D[i] ?? 1.4; h += `<g class="vl-ph" data-ph="${i}" tabindex="0" role="slider" aria-label="Line ${i + 1}" aria-valuemin="0" aria-valuemax="${PRE_S}" aria-valuenow="${t.toFixed(2)}"><rect x="${X(t)}" y="${30 + (i % 2) * 18}" width="${Math.max(8, d / PRE_S * 280)}" height="16" rx="3"/><text x="${X(t) + 4}" y="${42 + (i % 2) * 18}">${i + 1}</text></g>`; });
    svg.innerHTML = h; root.querySelectorAll('[data-at]').forEach((inp) => { if (document.activeElement !== inp) inp.value = (A[+inp.dataset.at] ?? 0).toFixed(2); }); }
  const setAts = (A, live) => { const str = A.map((x) => Math.max(0, Math.min(PRE_S - 0.2, x)).toFixed(2)).join(','); if (live) app.cues.preview((s) => setTagIn(s, 'voice.ats', str)); else app.cues.edit((s) => setTagIn(s, 'voice.ats', str), 'voice timing'); drawTime(); };
  let dragPh = null;
  root.addEventListener('pointerdown', (e) => { const g = e.target.closest('.vl-ph'); if (!g) return; const svg = root.querySelector('.vl-tl'), r = svg.getBoundingClientRect(); dragPh = { i: +g.dataset.ph, x0: e.clientX, a0: ats(), k: 300 / r.width }; app.cues.begin(); g.setPointerCapture(e.pointerId); });
  root.addEventListener('pointermove', (e) => { if (!dragPh) return; const A = dragPh.a0.slice(); A[dragPh.i] = Math.round((dragPh.a0[dragPh.i] + (e.clientX - dragPh.x0) * dragPh.k / 280 * PRE_S) * 20) / 20; setAts(A, true); });
  root.addEventListener('pointerup', () => { if (!dragPh) return; dragPh = null; app.cues.commit('voice timing'); drawTime(); });
  root.addEventListener('keydown', (e) => { const g = e.target.closest && e.target.closest('.vl-ph'); if (!g || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return; e.preventDefault(); const A = ats(), i = +g.dataset.ph; A[i] += (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.5 : 0.05); setAts(A, false); root.querySelector(`[data-ph="${i}"]`)?.focus(); });
  root.addEventListener('change', (e) => { const el = e.target; if (el.dataset.at == null) return; const A = ats(); A[+el.dataset.at] = +el.value; setAts(A, false); });
  function autoPlace() { const n = nL(), D = durs || String(V().durs || VOICE_DURS).split(',').map(Number), A = [];
    const first = 1.4, lastEnd = PRE_S - 0.3, last = Math.max(first + 1, lastEnd - (D[n - 1] ?? 1.4));
    for (let i = 0; i < n; i++) A.push(n === 1 ? first : i === n - 1 ? last : first + (last - first) * i / (n - 1) - (D[i] ?? 1.4) * 0.25);
    setAts(A, false); if (durs) app.cues.edit((s) => setTagIn(s, 'voice.durs', durs.map((d) => d.toFixed(2)).join(',')), 'voice phrase lengths'); }
  async function listen() { const btn = root.querySelector('#vlListen'); if (playing) { try { playing.stop(); } catch (_) {} playing = null; btn.textContent = '▶ Listen'; return; }
    const ac = app.clock.ctx, vt = app.media && app.media.voice, buf = ac.createBuffer(2, Math.round((PRE_S + 1) * ac.sampleRate), ac.sampleRate);
    room(buf, PRE_S + 0.4, { gainDb: -14 }); if ((tags().sfx || {}).stove !== false) stove(buf, 0.05, { gainDb: 0 });
    if (vt) { try { const take = await ac.decodeAudioData(await vt.blob.arrayBuffer()); const sd = String(V().sub ?? '-8'); placeVoice(buf, take, ats(), { subDb: /^(off|none|false)$/i.test(sd) ? null : +sd }); } catch (_) { status('Could not read the voice take.', 'warn'); } }
    else status('No voice take yet: generate one or load one (Media → Load voice take). Playing the room and the stove.', 'warn');
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); if (ac.state === 'suspended') await ac.resume(); src.start(); playing = src; btn.textContent = '■ Stop';
    src.onended = () => { if (playing === src) { playing = null; btn.textContent = '▶ Listen'; } }; }
  setInterval(measure, 1500);
  root.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'vlLoad') loadVoices(); else if (t.id === 'vlGen') generate(); else if (t.id === 'vlListen') listen(); else if (t.id === 'vlAuto') autoPlace();
    else if (t.id === 'vlCopy') { navigator.clipboard?.writeText(prompt()).then(() => status('Prompt copied.', 'ok'), () => status(prompt())); }
    else if (t.dataset.use != null) { const tk = takes[+t.dataset.use]; if (tk.blob) app.media.setVoice(tk.blob, tk.name).then(() => status('Take loaded.', 'ok')); else window.open(tk.url, '_blank', 'noopener'); } });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved' && !root.contains(document.activeElement)) render(); });
  render();
  if (window.claude && window.claude.use) window.claude.use('mcp').then((m) => { mcp = m; render(); }).catch(() => {});
  return { refresh: render, prompt, voices: () => voices };
}
