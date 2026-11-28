// "Live" setup card, shown on the first plugin open: how the visuals are presented, how they move, and what the screen does before the DAW plays.
//   presentation: sphere (covers on the orbit sphere) | flow (cover cards) | hero (hero card only, no intro) | daw (the DAW window, full)
//   motion: camera moves on / off, follow the host beats
//   start: 'blank' (black until the DAW plays, then it starts) | 'preview' (loops the intro without the DAW)
// pure: planFor(choice) -> {props: {path: value}, follow, blank, preview}; the card applies it through app.actions.setProp.
export const PRESENTATIONS = [['sphere', 'Sphere orbit'], ['flow', 'Flow'], ['hero', 'Hero card only'], ['daw', 'DAW window full']];
export function planFor(c = {}) {
  const pres = c.presentation || 'sphere', props = {};
  props['intro.style'] = pres === 'flow' ? 'flow' : 'sphere';
  props['intro.on'] = pres === 'sphere' || pres === 'flow';
  props['video.on'] = pres === 'daw'; if (pres === 'daw') props['video.target'] = 'full';
  if (pres === 'hero') props['video.target'] = 'hero';
  props['camera.dip'] = c.camera === false ? 0 : 1;
  return { props, follow: c.follow !== false, blank: c.start === 'blank', preview: c.start === 'preview', pres };
}
export function showCard(app, onApply, saved = {}) {
  const el = document.createElement('div'); el.id = 'u2cLiveCard';
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:#000a;font:14px/1.45 system-ui,sans-serif;color:#eee';
  const opt = (name, list, cur) => list.map(([v, l]) => `<label style="display:block;margin:2px 0"><input type="radio" name="${name}" value="${v}"${v === cur ? ' checked' : ''}> ${l}</label>`).join('');
  el.innerHTML = `<form style="background:#161616;border:1px solid #666;border-radius:12px;padding:22px 26px;min-width:min(520px,92vw);max-height:90vh;overflow:auto"><h2 style="margin:0 0 4px;font-size:20px">Live setup</h2><p style="margin:0 0 14px;opacity:.7">How U2C Studio looks while you work in the DAW. Change it any time in the panel.</p>
    <fieldset style="border:0;padding:0;margin:0 0 12px"><legend style="font-weight:600;margin-bottom:4px">Presentation</legend>${opt('presentation', PRESENTATIONS, saved.presentation || 'sphere')}</fieldset>
    <fieldset style="border:0;padding:0;margin:0 0 12px"><legend style="font-weight:600;margin-bottom:4px">Motion</legend><label style="display:block"><input type="checkbox" name="camera"${saved.camera === false ? '' : ' checked'}> Camera moves between windows</label><label style="display:block"><input type="checkbox" name="follow"${saved.follow === false ? '' : ' checked'}> Follow the DAW beats</label></fieldset>
    <fieldset style="border:0;padding:0;margin:0 0 16px"><legend style="font-weight:600;margin-bottom:4px">Start</legend>${opt('start', [['blank', 'Blank: black until the DAW plays, then it starts'], ['preview', 'Preview now: loop the intro without the DAW']], saved.start || 'blank')}</fieldset>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" data-skip style="padding:8px 14px;cursor:pointer">Skip</button><button type="submit" style="padding:8px 18px;cursor:pointer;font-weight:600">Start</button></div></form>`;
  document.body.appendChild(el);
  const done = (c) => { el.remove(); onApply(c); };
  el.querySelector('[data-skip]').onclick = () => done(null);
  el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const f = e.target;
    done({ presentation: f.presentation.value, camera: f.camera.checked, follow: f.follow.checked, start: f.start.value }); };
  return el;
}
