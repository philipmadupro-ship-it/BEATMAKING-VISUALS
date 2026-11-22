// v20 MEDIA BIN (Premiere "Project" panel, left rail tab): every asset the film uses, replaceable before export.
//   Covers: 5 slots. Slot 0 = the beat's cover (hero, now playing, the card the cursor chooses, the loop's last frame); slots 1-4 =
//   the cover-flow covers the cursor browses past. Drop several images on the bin (they fill the slots in order from the first
//   one you have not replaced, or from the slot you drop on), click a slot to replace it, drag a slot onto another to swap,
//   x resets it to the built-in cover. Persisted in IndexedDB (the files never leave the browser) and restored on boot.
//   Video: the DAW screen-recording layer (ui/video.js). Audio: the beat.
// API: app.media = { setCover(i, blob, name), resetCover(i), swap(a, b), list(), ready }  (tests drive it through window.u2c.media)
const $ = (s) => document.querySelector(s);
const NAMES = ['Beat cover', 'Browse 1', 'Browse 2', 'Browse 3', 'Browse 4'];
const DB = 'u2c-media', STORE = 'covers';
function idb() { return new Promise((res, rej) => { try { const q = indexedDB.open(DB, 1); q.onupgradeneeded = () => q.result.createObjectStore(STORE); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }); }
async function dbDo(mode, fn) { try { const db = await idb(); return await new Promise((res, rej) => { const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); } catch { return null; } }
const decode = async (blob) => { const im = new Image(), u = URL.createObjectURL(blob); im.src = u; await im.decode(); return im; };

export function createMedia(app) {
  const covers = (app.assets.intro && app.assets.intro.covers) || [], orig = covers.slice(), meta = covers.map(() => null);   // meta[i] = { name, w, h } when user-replaced
  const root = $('#mediaCovers'), info = $('#mediaInfo'), input = $('#mediaFile');
  let target = null, dragFrom = null;
  const bump = () => { covers.v = (covers.v || 0) + 1; app.studio && app.studio.markDirty(); app.grid && app.grid.redraw && app.grid.redraw(); render(); };
  function thumb(i) { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), im = covers[i];
    if (im) { const s = Math.max(96 / im.width, 96 / im.height); g.drawImage(im, (96 - im.width * s) / 2, (96 - im.height * s) / 2, im.width * s, im.height * s); }
    else { g.fillStyle = '#222'; g.fillRect(0, 0, 96, 96); g.fillStyle = '#777'; g.font = '600 11px sans-serif'; g.textAlign = 'center'; g.fillText('procedural', 48, 52); } return c; }
  function render() {
    root.innerHTML = '';
    covers.forEach((_, i) => { const b = document.createElement('div'); b.className = 'cv-slot' + (i === 0 ? ' hero' : '') + (meta[i] ? ' user' : ''); b.draggable = true; b.dataset.i = i; b.tabIndex = 0;
      b.setAttribute('role', 'button'); b.setAttribute('aria-label', `${NAMES[i]}: ${meta[i] ? meta[i].name : 'built-in'}. Enter to replace.`);
      b.append(thumb(i)); const cap = document.createElement('span'); cap.className = 'cv-cap'; cap.innerHTML = `<b>${i}</b> ${NAMES[i]}`; b.append(cap);
      if (meta[i]) { const x = document.createElement('button'); x.className = 'cv-x'; x.title = 'Reset to the built-in cover'; x.textContent = '×'; x.onclick = (e) => { e.stopPropagation(); resetCover(i); }; b.append(x);
        const d = document.createElement('span'); d.className = 'cv-dim'; d.textContent = `${meta[i].w}×${meta[i].h}${Math.min(meta[i].w, meta[i].h) < 1000 ? ' · low res' : ''}`; b.append(d); }
      b.onclick = () => { target = i; input.multiple = false; input.click(); };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.onclick(); } if ((e.key === 'Delete' || e.key === 'Backspace') && meta[i]) resetCover(i); };
      b.ondragstart = (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cover:' + i); };
      b.ondragover = (e) => { e.preventDefault(); b.classList.add('over'); }; b.ondragleave = () => b.classList.remove('over');
      b.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.remove('over'); const fs = [...(e.dataTransfer.files || [])].filter((f) => /^image\//.test(f.type));
        if (fs.length) return addFiles(fs, i); if (dragFrom != null && dragFrom !== i) swap(dragFrom, i); dragFrom = null; };
      root.append(b); });
    const n = meta.filter(Boolean).length; info.textContent = n ? `${n} of ${covers.length} covers are yours · saved in this browser` : 'built-in covers · drop your images here (the first one becomes the beat cover)';
  }
  async function setCover(i, blob, name = 'cover', persist = true) {
    const im = await decode(blob); covers[i] = im; meta[i] = { name, w: im.naturalWidth, h: im.naturalHeight };
    if (persist) await dbDo('readwrite', (st) => st.put({ blob, name }, i)); bump(); return meta[i];
  }
  async function resetCover(i) { covers[i] = orig[i]; meta[i] = null; await dbDo('readwrite', (st) => st.delete(i)); bump(); }
  async function swap(a, b) { [covers[a], covers[b]] = [covers[b], covers[a]]; [meta[a], meta[b]] = [meta[b], meta[a]]; [orig[a], orig[b]] = [orig[b], orig[a]];
    const ra = await dbDo('readonly', (st) => st.get(a)), rb = await dbDo('readonly', (st) => st.get(b));
    await dbDo('readwrite', (st) => { if (rb) st.put(rb, a); else st.delete(a); if (ra) st.put(ra, b); else st.delete(b); }); bump(); }
  async function addFiles(files, from = null) {
    let i = from != null ? from : Math.max(0, meta.findIndex((m) => !m)); const done = [];
    for (const f of files) { if (i >= covers.length) break; try { await setCover(i, f, f.name); done.push(i); } catch { info.textContent = `could not read ${f.name}`; } i++; }
    if (done.length) app.toast && app.toast(`${done.length} cover${done.length > 1 ? 's' : ''} loaded into slot${done.length > 1 ? 's' : ''} ${done.join(', ')}`);
    return done;
  }
  input.addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; if (target != null) { await addFiles(fs.slice(0, 1), target); target = null; } else await addFiles(fs); input.multiple = true; });
  $('#mediaAdd').addEventListener('click', () => { target = null; input.multiple = true; input.click(); });
  $('#mediaReset').addEventListener('click', async () => { for (let i = 0; i < covers.length; i++) if (meta[i]) await resetCover(i); });
  const pane = $('#pane-media'); pane.addEventListener('dragover', (e) => { e.preventDefault(); pane.classList.add('drop'); }); pane.addEventListener('dragleave', (e) => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('drop'); });
  pane.addEventListener('drop', async (e) => { e.preventDefault(); pane.classList.remove('drop'); const fs = [...(e.dataTransfer.files || [])];
    const im = fs.filter((f) => /^image\//.test(f.type)), vid = fs.find((f) => /^video\//.test(f.type)), au = fs.find((f) => /^audio\//.test(f.type));
    if (im.length) await addFiles(im); if (vid && app.videoLayer) await app.videoLayer.load(vid); if (au) { const fi = $('#file'), dt = new DataTransfer(); dt.items.add(au); fi.files = dt.files; fi.dispatchEvent(new Event('change', { bubbles: true })); } });
  // the old single "Upload cover" control (Look tab) now feeds slot 0 through the bin
  const old = $('#coverFile'); if (old) old.addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { await setCover(0, f, f.name); $('#coverInfo').textContent = f.name; } });
  // left-rail tabs (Layers | Media)
  for (const b of document.querySelectorAll('#railTabs button')) b.addEventListener('click', () => { for (const o of document.querySelectorAll('#railTabs button')) o.setAttribute('aria-selected', o === b); $('#layerList').parentElement.dataset.pane = b.dataset.pane; });
  const ready = (async () => { const rows = await dbDo('readonly', (st) => st.getAllKeys()); if (rows) for (const k of rows) { const r = await dbDo('readonly', (st) => st.get(k)); if (r && r.blob && k < covers.length) { try { await setCover(k, r.blob, r.name, false); } catch {} } } render(); })();
  render();
  /** v21 projects: the user covers as blobs ({slot, blob, name}) and restoring a project's set (other slots reset). */
  async function blobs() { const out = []; for (let i = 0; i < covers.length; i++) if (meta[i]) { const r = await dbDo('readonly', (st) => st.get(i)); if (r && r.blob) out.push({ slot: i, blob: r.blob, name: r.name || meta[i].name }); } return out; }
  async function restore(list = []) { const by = new Map(list.map((c) => [c.slot, c])); for (let i = 0; i < covers.length; i++) { const c = by.get(i); if (c && c.blob) { try { await setCover(i, c.blob, c.name || 'cover'); } catch { await resetCover(i); } } else if (meta[i]) await resetCover(i); } }
  // v22.4 intro voice take (IndexedDB key 'voice'): the exporter splits it at its pauses and places the phrases on the intro (export.voiceAts)
  let voice = null; const vInfo = document.getElementById('mediaVoice'), vClear = document.getElementById('voiceClear');
  const showVoice = () => { if (vInfo) vInfo.textContent = voice ? `${voice.name} · placed on the intro at export` : 'one take with pauses between the phrases (e.g. ElevenLabs): split at the pauses, placed on the intro'; if (vClear) vClear.hidden = !voice; };
  async function setVoice(blob, name = 'voice', persist = true) { voice = { blob, name }; if (persist) await dbDo('readwrite', (st) => st.put({ blob, name }, 'voice')); showVoice(); }
  async function clearVoice() { voice = null; await dbDo('readwrite', (st) => st.delete('voice')); showVoice(); }
  document.getElementById('voiceFile')?.addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await setVoice(f, f.name); });
  vClear?.addEventListener('click', clearVoice);
  // v22.5: her words are the tags voice.lines (editable in Text / Review / Metadata); this builds the ElevenLabs prompt from them, so a new take matches the captions
  document.getElementById('voicePrompt')?.addEventListener('click', async () => { const tg = app.cues.tags(''), L4 = (tg.voice && tg.voice.lines) || [], sub = (q) => String(q).replace(/\{title\}/g, String(tg.title || '').replace(/\{title\}/g, app.store.project.title || ''));
    const nn = String((tg.voice && tg.voice.number) || '01'), numWord = (x) => { const n = parseInt(x, 10); const W1 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']; return Number.isFinite(n) && n <= 12 ? W1[n] : String(x); };
    const words = L4.map((q) => sub(String(q).replace(/N\u00ba \{n\}|\{n\}/g, 'number ' + numWord(nn))).toLowerCase().replace(/\b(\w)/g, (m) => m.toUpperCase()).replace(/Uche2crazy/gi, 'Oo-chay Two Crazy').replace(/\b0?1\b/, 'one'));
    const prompt = `[${(tg.voice && tg.voice.style) || 'calm, clinical lab announcement'}] ` + words.filter(Boolean).map((w, i) => (i ? '[pause] ' : '') + w + (i ? '.' : '...')).join(' ');
    try { await navigator.clipboard.writeText(prompt); if (vInfo) vInfo.textContent = 'prompt copied: ' + prompt; } catch { if (vInfo) vInfo.textContent = prompt; } });
  // v24 (audit V6) LAB SOUNDS: your own recordings (e.g. the ElevenLabs stove, lab ambience, glass clink) for the web export, in place of the
  // synthesised twins; kept in this browser (IndexedDB keys sfx:<id>), never uploaded. The native render uses the same files from U2C_SFX_DIR.
  const SFX_IDS = ['stove', 'labamb', 'clink'], sfx = {};
  const showSfx = () => { for (const id of SFX_IDS) { const el = document.getElementById('sfxInfo-' + id); if (el) el.textContent = sfx[id] ? sfx[id].name : 'built-in (synth)'; const x = document.getElementById('sfxClear-' + id); if (x) x.hidden = !sfx[id]; } };
  async function setSfx(id, blob, name, persist = true) { sfx[id] = { blob, name }; if (persist) await dbDo('readwrite', (st) => st.put({ blob, name }, 'sfx:' + id)); showSfx(); }
  async function clearSfx(id) { delete sfx[id]; await dbDo('readwrite', (st) => st.delete('sfx:' + id)); showSfx(); }
  for (const id of SFX_IDS) { document.getElementById('sfxFile-' + id)?.addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await setSfx(id, f, f.name); });
    document.getElementById('sfxClear-' + id)?.addEventListener('click', () => clearSfx(id));
    dbDo('readonly', (st) => st.get('sfx:' + id)).then((r) => { if (r && r.blob) setSfx(id, r.blob, r.name, false); }); }
  showSfx();
  dbDo('readonly', (st) => st.get('voice')).then((r) => { if (r && r.blob) setVoice(r.blob, r.name, false); });
  return { setVoice, clearVoice, get voice() { return voice; }, setSfx, clearSfx, get sfx() { return sfx; }, setCover, resetCover, swap, addFiles, blobs, restore, list: () => meta.map((m, i) => ({ slot: i, name: m ? m.name : 'built-in', user: !!m, w: m ? m.w : covers[i] ? covers[i].width : 0 })), ready, get covers() { return covers; } };
}
