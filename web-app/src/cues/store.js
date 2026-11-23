// Cue sheet store for the app: the current sheet, its evaluator (rebuilt per edit), undo / redo (whole-sheet snapshots),
// autosave per project in localStorage (try/catch: private windows and blocked storage just skip it), a clipboard.
import { parseSheet, serializeSheet, cloneSheet, createEvaluator, emptySheet, mergeDeep } from './schema.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { read, write } from '../state.js';

const PREFIX = 'u2c.cues.v1:', INDEX = 'u2c.cues.index';
export function createCueStore() {
  let sheet = emptySheet(), ev = createEvaluator(sheet), version = 0, key = null, past = [], future = [], pastL = [], futureL = [], pending = null, saveT = 0, lastSaved = 0;
  const subs = new Set(), clip = { keys: [] };
  const notify = (why) => subs.forEach((f) => f(why));
  const snap = () => JSON.stringify(sheet);
  function rebuild() { ev = createEvaluator(sheet); version++; }
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { if (!key) return; const ok = write(PREFIX + key, serializeSheet(sheet));
    if (ok) { lastSaved = Date.now(); const idx = read(INDEX) || {}; idx[key] = { at: lastSaved, title: sheet.meta.title || key }; write(INDEX, idx); } notify('saved'); }, 250); }
  const api = {
    get sheet() { return sheet; }, get version() { return version; }, get key() { return key; }, get lastSaved() { return lastSaved; },
    ev: () => ev,
    /** Merged tag document (defaults <- sheet overrides), with {today} resolved. */
    tags(date) { const t = mergeDeep(DEFAULT_TAGS, sheet.tags); if (t.date === '{today}') t.date = date; return t; },
    /** Mutate the sheet through fn(sheet); one undo step. */
    edit(fn, label = 'edit') { past.push(snap()); pastL.push(label); if (past.length > 300) { past.shift(); pastL.shift(); } future = []; futureL = []; fn(sheet); rebuild(); save(); notify(label); },
    /** View-state changes (lane height, targeting): saved with the sheet but not an undo step. */
    touch(fn, label = 'view') { fn(sheet); rebuild(); save(); notify(label); },
    /** Live edits (drags): begin() snapshots once, preview() mutates without history, commit() records the step. */
    begin() { if (!pending) pending = snap(); },
    preview(fn) { fn(sheet); rebuild(); notify('preview'); },
    commit(label = 'drag') { if (pending) { if (pending !== snap()) { past.push(pending); pastL.push(label); future = []; futureL = []; save(); } pending = null; } rebuild(); notify(label); },
    cancel() { if (pending) { sheet = JSON.parse(pending); pending = null; rebuild(); notify('cancel'); } },
    undo() { if (!past.length) return false; future.push(snap()); futureL.push(pastL.pop() || 'edit'); sheet = JSON.parse(past.pop()); rebuild(); save(); notify('undo'); return true; },
    redo() { if (!future.length) return false; past.push(snap()); pastL.push(futureL.pop() || 'edit'); sheet = JSON.parse(future.pop()); rebuild(); save(); notify('redo'); return true; },
    /** v24 History panel: the labels of the undo / redo stacks (oldest first) and a jump by n steps (negative = undo). */
    history() { return { past: pastL.slice(), future: futureL.slice().reverse() }; },
    jump(n) { let k = 0; while (n < 0 && this.undo()) { n++; k++; } while (n > 0 && this.redo()) { n--; k++; } return k; },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
    /** Replace the whole sheet (preset, import, regenerate); undoable unless fresh = true (a new project). */
    replace(next, label = 'replace', fresh = false) { if (!fresh) { past.push(snap()); pastL.push(label); future = []; futureL = []; } else { past = []; future = []; pastL = []; futureL = []; } sheet = cloneSheet(next); rebuild(); save(); notify(label); },
    /** Switch to a project's saved sheet; returns false when none is stored (the caller generates a default). */
    open(projectKey) { key = projectKey; past = []; future = []; pastL = []; futureL = []; const d = read(PREFIX + projectKey);
      if (d) { try { sheet = parseSheet(d); rebuild(); notify('open'); return true; } catch (e) { console.warn('[u2c] saved cue sheet unreadable, regenerating', e); } } return false; },
    toJSON: () => serializeSheet(sheet),
    clipboard: clip,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}
