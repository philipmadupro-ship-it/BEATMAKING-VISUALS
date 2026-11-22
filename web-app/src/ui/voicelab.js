// v23 VOICE LAB (left rail -> Media -> Intro voice): a new intro take straight from ElevenLabs, through the viewer's own claude.ai connector
// (the page never holds a key). Pick one of your voices (your created voices first), edit what she says (tags voice.number + voice.lines,
// the same words the console types), Generate = ONE take (eleven_v4, credits spent only on that click), it becomes the intro voice take
// (split at its pauses, phrase i placed at voice.ats[i]). Every take is a new intro. Without the connector (or outside claude.ai) the
// panel says so and the old route stays: Copy ElevenLabs prompt, then Load voice take.
// API: app.voiceLab = { refresh(), prompt(), voices() }.
import { setTagIn } from './metadata.js';
import { VOICE_ATS, VOICE_DURS } from '../v8/tags.js';
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
      <div class="inrow"><button class="btn small primary" id="vlGen" data-tip="Generate a new intro|One ElevenLabs take with these lines and voice (spends credits). It becomes the intro voice take.">Generate intro take</button><button class="btn small" id="vlCopy" data-tip="Copy prompt|Copy the exact prompt to paste into ElevenLabs yourself.">Copy prompt</button></div>
      <p class="hint vl-status" role="status"></p><ul class="vl-takes"></ul>`;
    root.querySelector('.vl-say').textContent = '“' + spoken().join(' … ') + '”';
    fillVoices(); renderTakes();
  }
  function fillVoices() { const sel = root.querySelector('#vlVoice'), cur = V().voice_id || ''; if (!voices.length) return;
    const own = voices.filter((q) => !q.is_library_voice), lib = voices.filter((q) => q.is_library_voice);
    sel.innerHTML = (own.length ? `<optgroup label="Your voices">${own.map((q) => `<option value="${esc(q.voice_id)}">${esc(q.name)}</option>`).join('')}</optgroup>` : '') + (lib.length ? `<optgroup label="Library">${lib.map((q) => `<option value="${esc(q.voice_id)}">${esc(q.name)}</option>`).join('')}</optgroup>` : '');
    sel.value = voices.some((q) => q.voice_id === cur) ? cur : (own[0] || voices[0]).voice_id; }
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
  root.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'vlLoad') loadVoices(); else if (t.id === 'vlGen') generate();
    else if (t.id === 'vlCopy') { navigator.clipboard?.writeText(prompt()).then(() => status('Prompt copied.', 'ok'), () => status(prompt())); }
    else if (t.dataset.use != null) { const tk = takes[+t.dataset.use]; if (tk.blob) app.media.setVoice(tk.blob, tk.name).then(() => status('Take loaded.', 'ok')); else window.open(tk.url, '_blank', 'noopener'); } });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved' && !root.contains(document.activeElement)) render(); });
  render();
  if (window.claude && window.claude.use) window.claude.use('mcp').then((m) => { mcp = m; render(); }).catch(() => {});
  return { refresh: render, prompt, voices: () => voices };
}
