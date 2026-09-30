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

/**
 * The ground each world was left with: what the next fire on it rises through, so past games
 * become its geology. Kept apart from the world being played (and in localStorage, not IndexedDB,
 * since it's needed before the page can wait for anything): the heights, packed as text; how many
 * fires the world has had; and where lava has ever lain, for worlds that keep the mark of it.
 */
export interface Ground { rock: Float32Array; fires: number; marked: Uint8Array | null }

const groundKey = (world: string) => `volcano.ground.${world}`;

function toText(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromText(text: string): Uint8Array {
  const s = atob(text), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function keepGround(world: string, g: Ground): void {
  try {
    localStorage.setItem(groundKey(world), JSON.stringify({ rock: toText(new Uint8Array(g.rock.buffer.slice(0))), fires: g.fires, marked: g.marked ? toText(g.marked) : null }));
  } catch { /* not kept: the next fire begins on new ground, and that's all */ }
}

export function recallGround(world: string, n: number): Ground | null {
  try {
    const t = localStorage.getItem(groundKey(world));
    if (!t) return null;
    const o = JSON.parse(t) as { rock: string; fires: number; marked: string | null };
    const rock = new Float32Array(fromText(o.rock).buffer);
    if (rock.length !== n) return null;
    const marked = o.marked ? fromText(o.marked) : null;
    return { rock, fires: o.fires, marked: marked && marked.length === n ? marked : null };
  } catch { return null; }
}

export function forgetGround(world: string): void {
  try { localStorage.removeItem(groundKey(world)); } catch { /* nothing to forget */ }
}
