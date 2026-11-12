// Hand a file to the viewer. Inside a claude.ai artifact this goes through the `downloads` capability; elsewhere a normal download.
export async function saveFile(blob, name) {
  try { const c = window.claude; const d = c && c.use ? await c.use('downloads') : null;
    if (d) { await d.save({ filename: name, data: blob }); return 'saved'; } }
  catch (e) { if (e && e.code === 'declined') return 'declined'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); return 'downloaded';
}
