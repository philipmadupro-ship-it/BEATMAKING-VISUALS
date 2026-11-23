// v25 SIMPLE / PRO (user: "too crowded, I don't understand what everything does or why it is here"). CapCut / Clipchamp logic:
//   Simple (default): left = Library (Presets, Layers, Media, History), centre = the preview (always visible), bottom = a timeline with
//   plain-named tracks (Intro, Camera, Text, Effects + whatever you moved), right = Edit (the selected thing, task controls), Look, Export.
//   Every panel opens with one line saying what it is for. Pro (one switch in the top bar) brings back every Premiere-level panel:
//   Text / Meta / Beat tabs, Markers, raw-path inspector, graph and cue-sheet tools. Remembered per browser.
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const KEY = 'u2c.mode.v1';
const HELP = {
  'pane-inspect': 'Edit the selected thing. Click a window on the preview or a clip on the timeline; nothing selected = the main settings by task.',
  'pane-look': 'Pick a look preset (all built on the player), the colour stage, and the order the camera visits the windows.',
  'pane-export': 'Make the MP4: length, format, then Export. Review first shows the key frames and checks the loop.',
  'pane-text': 'Every word in the video, by its tag.', 'pane-meta': 'The metadata card and a search over every word on screen.', 'pane-beat': 'Tempo, key and sections of the beat.',
  'pane-presets': 'One click applies a look. Save your own: everything you moved or changed becomes a preset you can reuse on every video.',
  'pane-media': 'Your covers, voice take and lab sounds. Files stay in this browser.', 'pane-history': 'Every change by name. Click a step to go back to it.',
  'layerList': 'The windows and pieces of the video. The eye hides one; click a name to edit it.',
};
export function createSimpleMode(app) {
  let pro = false; try { pro = localStorage.getItem(KEY) === 'pro'; } catch (_) {}
  const top = $('#wsSeg') || $('#projBtn'); const sw = document.createElement('label'); sw.className = 'tog modesw'; sw.dataset.tip = 'Pro mode|Shows every Premiere-level panel: Text, Meta and Beat tabs, Markers, raw properties, graph and cue-sheet tools. Off = the simple editor.|';
  sw.innerHTML = '<span class="sw"><input type="checkbox" role="switch" id="proMode" aria-label="Pro mode"><i aria-hidden="true"></i></span> Pro'; top.parentElement.insertBefore(sw, top);
  for (const [id, txt] of Object.entries(HELP)) { const el = document.getElementById(id); if (!el || el.querySelector(':scope > .pane-help')) continue; const p = document.createElement('p'); p.className = 'pane-help'; p.textContent = txt; el.prepend(p); }
  const rename = (sel, simple, full) => { const el = $(sel); if (el) el.textContent = pro ? full : simple; };
  function apply() {
    document.body.classList.toggle('simple', !pro); $('#proMode').checked = pro;
    rename('#tab-inspect', 'Edit', 'Inspect');
    const cur = $('.tabs [aria-selected="true"]'); if (!pro && cur && /text|meta|beat/.test(cur.dataset.tab)) $('#tab-inspect').click();
    const rail = $('#railTabs [aria-selected="true"]'); if (!pro && rail && rail.dataset.pane === 'markers') { const b = $('#railTabs [data-pane="layers"]'); if (b) b.click(); }
    if (app.quick && app.quick.sync) app.quick.sync();
    if (app.cuetl) { app.cuetl.markDirty && app.cuetl.markDirty(); app.cuetl.rebuild && app.cuetl.rebuild(); }
    if (app.studio && !$('#studio').hidden) requestAnimationFrame(() => app.studio.layout());
  }
  $('#proMode').addEventListener('change', (e) => { pro = e.target.checked; try { localStorage.setItem(KEY, pro ? 'pro' : 'simple'); } catch (_) {} apply(); app.toast && app.toast(pro ? 'Pro mode: every panel is back' : 'Simple mode: only what you need'); });
  apply();
  return { get pro() { return pro; }, set(v) { pro = !!v; apply(); } };
}
