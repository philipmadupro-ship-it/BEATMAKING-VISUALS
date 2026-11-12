// Template registry. A template: {id, name, category, pal, surface, chainStyle, ownText, params[], defaults(aspect), draw(ctx, frameState, params, palette, assets)}.
// Templates never read audio or the clock; everything arrives in frameState + params.
import lab from './lab.js'; import handset from './handset.js'; import exe from './exe.js';
import chrome from './chrome.js'; import kinetic from './kinetic.js'; import scope from './scope.js'; import daw from './daw.js';
import bloom from './bloom.js'; import deck from './deck.js'; import terrain from './terrain.js'; import poster from './poster.js'; import slicer from './slicer.js';
export const TEMPLATE_LIST = [lab, handset, exe, chrome, kinetic, scope, daw, bloom, deck, terrain, poster, slicer];
export const TEMPLATES = Object.fromEntries(TEMPLATE_LIST.map(t => [t.id, t]));
export const TEMPLATE_ORDER = TEMPLATE_LIST.map(t => t.id);
export function paramDefaults(t) { return Object.fromEntries((t.params || []).map(p => [p.id, p.def])); }
/** Reset overlay + text positions to the template's defaults for the project's aspect. */
export function applyDefaults(project, id) { const d = TEMPLATES[id].defaults(project.aspect); Object.assign(project.chains, d.chains); Object.assign(project.eleph, d.eleph); if (d.text) Object.assign(project.text, d.text); return project; }
