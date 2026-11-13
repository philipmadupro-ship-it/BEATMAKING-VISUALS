// Template registry. A template: {id, name, category, pal, surface, chainStyle, owns[], textPos, params[], defaults(aspect),
// draw(ctx, frameState, params, palette, assets)}. v5 scope: three looks only, in grid order U2C.EXE, LAB, SCOPE.
// Templates never read audio or the clock; everything arrives in frameState + params. Printed text comes from the
// Text panel model (overlays/text.js); a template only places the lines it `owns` while their position is "auto".
import u2cexe from './u2cexe.js'; import lab from './lab.js'; import scope from './scope.js';
export const TEMPLATE_LIST = [u2cexe, lab, scope];
export const DEFAULT_TEMPLATE = 'u2cexe';
export const TEMPLATES = Object.fromEntries(TEMPLATE_LIST.map(t => [t.id, t]));
export const TEMPLATE_ORDER = TEMPLATE_LIST.map(t => t.id);
export function paramDefaults(t) { return Object.fromEntries((t.params || []).map(p => [p.id, p.def])); }
/** Reset the chains + elephant placement to the template's defaults for the project's aspect. */
export function applyDefaults(project, id) { const d = TEMPLATES[id].defaults(project.aspect); Object.assign(project.chains, d.chains); Object.assign(project.eleph, { y: 0, len: 0, ...d.eleph }); return project; }
