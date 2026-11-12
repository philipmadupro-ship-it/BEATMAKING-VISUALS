// Template registry. A template: {id, name, category, pal, surface, chainStyle, owns[], textPos, params[], defaults(aspect),
// draw(ctx, frameState, params, palette, assets), drawAfter?(…), selfChains?, selfEleph?}.
// Templates never read audio or the clock; everything arrives in frameState + params. Printed text comes from the
// Text panel model (overlays/text.js); a template only places the lines it `owns` while their position is "auto".
import lab from './lab.js'; import handset from './handset.js'; import exe from './exe.js';
import bloom from './bloom.js'; import orbit from './orbit.js'; import halo from './halo.js';
import scope from './scope.js'; import poster from './poster.js'; import slicer from './slicer.js';
export const TEMPLATE_LIST = [lab, handset, exe, bloom, orbit, halo, scope, poster, slicer];
export const TEMPLATES = Object.fromEntries(TEMPLATE_LIST.map(t => [t.id, t]));
export const TEMPLATE_ORDER = TEMPLATE_LIST.map(t => t.id);
export function paramDefaults(t) { return Object.fromEntries((t.params || []).map(p => [p.id, p.def])); }
/** Reset the chains + elephant placement to the template's defaults for the project's aspect. */
export function applyDefaults(project, id) { const d = TEMPLATES[id].defaults(project.aspect); Object.assign(project.chains, d.chains); Object.assign(project.eleph, { y: 0, len: 0, ...d.eleph }); return project; }
