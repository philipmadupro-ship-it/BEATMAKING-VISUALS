// v21 tiny IndexedDB key-value store (one object store per database). Every call resolves (null / [] on failure) so a
// private window or blocked storage degrades to "nothing saved" instead of throwing.
export function kv(dbName, storeName = 'kv') {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const q = indexedDB.open(dbName, 1); q.onupgradeneeded = () => q.result.createObjectStore(storeName); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }));
  const run = async (mode, fn) => { try { const db = await open(); return await new Promise((res, rej) => { const tx = db.transaction(storeName, mode), st = tx.objectStore(storeName), r = fn(st); tx.oncomplete = () => res(r && 'result' in r ? r.result : undefined); tx.onerror = () => rej(tx.error); }); } catch (e) { console.warn('[u2c] storage', e && e.message); return null; } };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    put: (k, v) => run('readwrite', (s) => s.put(v, k)).then((r) => r !== null),
    del: (k) => run('readwrite', (s) => s.delete(k)),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())) || [],
    all: async () => (await run('readonly', (s) => s.getAll())) || [],
  };
}
/** Blob <-> data URL (project files carry covers / audio as data URLs). */
export const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
export async function dataURLToBlob(url) { return (await fetch(url)).blob(); }
