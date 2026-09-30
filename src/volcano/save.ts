/**
 * Keeping a world: saved quietly as it's played, so closing the page and
 * coming back finds it as it was. One world at a time, in IndexedDB (which
 * keeps typed arrays as they are), dropped once the fire is out and the chart
 * has been drawn.
 */

/** A copy of an object's own fields, leaving out the ones named (the mesh, scratch space...). */
export function snapshotOf(obj: object, skip: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!skip.includes(k)) out[k] = v;
  return out;
}

/**
 * Put a snapshot back into an object: typed arrays and arrays are filled in place (some are
 * read-only fields, and others hold references to them), the named plain objects are merged
 * into (for the same reason), and everything else is simply set.
 */
export function restoreInto(obj: object, snap: Record<string, unknown>, merge: string[] = []): void {
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(snap)) {
    const cur = o[k];
    if (ArrayBuffer.isView(cur) && ArrayBuffer.isView(v)) (cur as unknown as Float32Array).set(v as unknown as Float32Array);
    else if (Array.isArray(cur) && Array.isArray(v)) { cur.length = 0; cur.push(...v); }
    else if (cur instanceof Map && v instanceof Map) { cur.clear(); for (const [a, b] of v) cur.set(a, b); }
    else if (merge.includes(k) && cur && typeof cur === 'object' && v && typeof v === 'object') Object.assign(cur, v);
    else o[k] = v;
  }
}

const DB = 'volcano', STORE = 'world', KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save the world; any failure (private browsing, no storage) is quietly let go. */
export async function keep(world: unknown): Promise<void> {
  try { await run('readwrite', (s) => s.put(world, KEY)); } catch { /* not kept, and that's all */ }
}

export async function recall<T>(): Promise<T | undefined> {
  try { return (await run('readonly', (s) => s.get(KEY))) as T | undefined; } catch { return undefined; }
}

export async function forget(): Promise<void> {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch { /* nothing to forget */ }
}
