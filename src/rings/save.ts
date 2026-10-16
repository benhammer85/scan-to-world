/**
 * Keeping a tree: saved quietly as it grows, so closing the page and coming back finds it as it was
 * (as the volcano keeps its world: the same snapshot and restore, see ../volcano/save.ts); and the
 * xylotheque, the wood library, where every finished slice is kept as a plate, as the volcano's atlas
 * keeps its charts. In a store of its own, so the two games' keepsakes never mix.
 */
import { restoreInto, snapshotOf } from '../volcano/save';
import { TreeSim, type Rules } from './tree';

// (The store keeps the game's first name, so trees and plates kept before it was Well Rounded still load.)
const DB = 'annulus', STORE = 'kept', CURRENT = 'current', PLATES = 'plates', GROVE = 'grove';

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

/** A tree as it's kept: which, its seed (its weather comes from it), whether wandering, and itself. */
/** (`at`: where on the sheet the seed was planted, as shares of its width and height.) */
/** (A child's tree also keeps their `name`, their `birth` (as 2023-05-02), and how many of its first rings are
 * `whole` years, grown before the days began to be drawn.) */
export interface KeptTree {
  tree: string; seed: number; wander: boolean; turn: number; sim: Record<string, unknown>; days?: string[]; at?: [number, number];
  name?: string; birth?: string; whole?: number;
  /** (A child's tree, as well: whether the sound of the moment shapes each day; their height at each
   * birthday by age; the years finished, each its own tree; this year's age; the words kept with its days.) */
  listen?: boolean; heights?: Record<number, number>; age?: number; notes?: (string | null)[];
  years?: { age: number; seed: number; sim: Record<string, unknown>; days: string[]; notes: (string | null)[] }[];
}

/**
 * What of a tree is kept: everything but its rules and its weather (which come fresh from its seed),
 * and the stroke being painted (a stroke cut off is painted again).
 */
export function snapshotTree(t: TreeSim): Record<string, unknown> {
  const s = snapshotOf(t, ['k', 'seed', 'weather', 'winds', 'fireRings', 'news', 'stroke', 'lo', 'hi', 'tone', 'at', 'inkAt', 'state']);
  // (Each ring copied, so a later change to the tree doesn't reach into what's kept.)
  s.rings = t.rings.map((r) => r.slice());
  s.tones = t.tones.map((r) => r.slice());
  s.alive = t.alive.slice();
  s.burnt = t.burnt.slice();
  s.stressed = t.stressed.slice();
  for (const k of ['starts', 'dirs', 'ringWeather', 'ringEven', 'bleeds'] as const) s[k] = t[k].slice();
  s.scars = t.scars.map((x) => ({ ...x }));
  s.cracks = t.cracks.map((x) => ({ ...x }));
  s.wounds = t.wounds.map((x) => ({ ...x }));
  return s;
}

/** A kept tree, grown again from its seed and filled in as it was; null if it can't be. */
export function treeFrom(k: KeptTree, rules: Partial<Rules>): TreeSim | null {
  const t = new TreeSim(k.seed, rules);
  return restoreInto(t, k.sim) ? t : null;
}

// (`key`: the game's tree is kept as 'current'; the daily practice keeps its own, as 'diary'.)
export async function keepTree(k: KeptTree, key = CURRENT): Promise<void> {
  try { await run('readwrite', (s) => s.put(k, key)); } catch { /* not kept, and that's all */ }
}
export async function recallTree(key = CURRENT): Promise<KeptTree | undefined> {
  try { return (await run('readonly', (s) => s.get(key))) as KeptTree | undefined; } catch { return undefined; }
}
export async function forgetTree(key = CURRENT): Promise<void> {
  try { await run('readwrite', (s) => s.delete(key)); } catch { /* nothing to forget */ }
}

/** A plate in the xylotheque: a small picture of it, and what it says. The last eighty kept. */
export interface Plate { tree: string; numeral: string; title: string; subtitle: string; when: number; image: string; years: number; evenness: number }

export async function keepPlate(p: Plate): Promise<void> {
  try {
    const all = ((await run('readonly', (s) => s.get(PLATES))) as Plate[] | undefined) ?? [];
    all.push(p);
    while (all.length > 80) all.shift();
    await run('readwrite', (s) => s.put(all, PLATES));
  } catch { /* not kept, and that's all */ }
}
export async function plates(): Promise<Plate[]> {
  try { return ((await run('readonly', (s) => s.get(PLATES))) as Plate[] | undefined) ?? []; } catch { return []; }
}

/**
 * The grove: each tree of the practice, once finished, kept standing, oldest first: each its own record
 * (`grove/<n>`), with a list of them (`grove`), so a write touches one tree and a failed one loses none.
 * (Kept before as one list of trees: moved over the first time it's read.)
 */
const GROVE_PREFIX = 'grove/';
async function groveKeys(): Promise<string[]> {
  const got = (await run('readonly', (s) => s.get(GROVE))) as unknown;
  if (Array.isArray(got) && got.length && typeof got[0] !== 'string') {
    // (The old way: the trees themselves in the list.)
    const keys: string[] = [];
    for (const [i, k] of (got as KeptTree[]).entries()) { const key = `${GROVE_PREFIX}${Date.now()}-${i}`; await run('readwrite', (s) => s.put(k, key)); keys.push(key); }
    await run('readwrite', (s) => s.put(keys, GROVE));
    return keys;
  }
  return (got as string[] | undefined) ?? [];
}
export async function keepInGrove(k: KeptTree): Promise<void> {
  try {
    const keys = await groveKeys(), key = `${GROVE_PREFIX}${Date.now()}`;
    await run('readwrite', (s) => s.put(k, key));
    await run('readwrite', (s) => s.put([...keys, key], GROVE));
  } catch { /* not kept, and that's all */ }
}
export async function grove(): Promise<KeptTree[]> {
  try {
    const out: KeptTree[] = [];
    for (const key of await groveKeys()) { const k = (await run('readonly', (s) => s.get(key))) as KeptTree | undefined; if (k) out.push(k); }
    return out;
  } catch { return []; }
}
/** The grove replaced whole (a copy taken back). */
export async function setGrove(all: KeptTree[]): Promise<void> {
  const keys: string[] = [];
  for (const [i, k] of all.entries()) { const key = `${GROVE_PREFIX}${Date.now()}-${i}`; await run('readwrite', (s) => s.put(k, key)); keys.push(key); }
  await run('readwrite', (s) => s.put(keys, GROVE));
}

/**
 * A kept tree as text, for a copy kept as a file: its typed arrays written out as lists and read back as
 * typed arrays (JSON alone would turn them into plain objects).
 */
export const toText = (x: unknown): string => JSON.stringify(x, (_k, v) => (v instanceof Float32Array ? { f32: Array.from(v) } : v instanceof Uint8Array ? { u8: Array.from(v) } : v));
export const fromText = (t: string): unknown => JSON.parse(t, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? (Array.isArray(v.f32) && Object.keys(v).length === 1 ? Float32Array.from(v.f32) : Array.isArray(v.u8) && Object.keys(v).length === 1 ? Uint8Array.from(v.u8) : v) : v));
