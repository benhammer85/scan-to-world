/**
 * Keeping a tree: saved quietly as it grows, so closing the page and coming back finds it as it was
 * (as the volcano keeps its world: the same snapshot and restore, see ../volcano/save.ts); and the
 * xylotheque, the wood library, where every finished slice is kept as a plate, as the volcano's atlas
 * keeps its charts. In a store of its own, so the two games' keepsakes never mix.
 */
import { restoreInto, snapshotOf } from '../volcano/save';
import { TreeSim, type Rules } from './tree';

// (The store keeps the game's first name, so trees and plates kept before it was Well Rounded still load.)
const DB = 'annulus', STORE = 'kept', CURRENT = 'current', PLATES = 'plates';

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
export interface KeptTree { tree: string; seed: number; wander: boolean; turn: number; sim: Record<string, unknown>; days?: string[] }

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
