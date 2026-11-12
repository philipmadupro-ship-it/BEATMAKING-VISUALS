// Title / caption / description / tags builder (TRENDS.md §5, §14).
export const DEFAULT_FORMAT = '[FREE] {A} x {B} Type Beat - "{name}" | {bpm} BPM (Prod. {producer})';
const tagify = s => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
export function buildCaptions(text, bpm, fmt = DEFAULT_FORMAT) {
  const L = text.lines || {}, v = id => (L[id] && L[id].text) || '';
  const A = text.artistA || 'Artist', B = text.artistB || 'Artist', name = v('title') || 'Untitled', key = v('key'), producer = (v('tag') || 'U2C').replace(/^prod\.?\s*/i, '') || 'U2C', handle = v('handle') || '@uche2crazy', link = text.link || '';
  const b = Math.round(bpm);
  const title = fmt.replace(/\{A\}/g, A).replace(/\{B\}/g, B).replace(/\{name\}/g, name).replace(/\{bpm\}/g, b).replace(/\{key\}/g, key).replace(/\{producer\}/g, producer);
  const hashtags = ['#typebeat', '#' + tagify(A) + 'typebeat', '#' + tagify(B) + 'typebeat', '#' + b + 'bpm', '#producer', '#beats'];
  const ig = `"${name}" · ${b} BPM ${key}\n${A} x ${B} type beat. Lease ${text.price || ''} — ${link}\nprod. ${handle}\n\n${hashtags.join(' ')}`;
  const yt = `Buy / download: ${link}\n${title}\n\nBPM: ${b} · Key: ${key}\nProduced by ${producer} (${handle})\nFree for non-profit use only. Credit (prod. ${producer}) in your title.\n\n${hashtags.slice(0, 4).join(' ')}`;
  const tags = [`${A} type beat`, `${B} type beat`, `${A} x ${B} type beat`, `${b} bpm beat`, `${key} beat`, 'trap beat', 'type beat 2026', `prod ${producer}`].map(t => t.toLowerCase());
  const txt = `TITLE\n${title}\n\nINSTAGRAM / TIKTOK CAPTION\n${ig}\n\nYOUTUBE DESCRIPTION\n${yt}\n\nTAGS\n${tags.join(', ')}\n`;
  return { title, ig, yt, tags, txt, titleLen: title.length };
}
