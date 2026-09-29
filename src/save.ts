/**
 * Keeping the universe: every world made, what grew on it, the railways
 * between them, and which world you were on, kept in the browser's own
 * database so that closing the page loses nothing. Offline, on the device.
 *
 * What is kept is the least that brings a world back exactly as it was left:
 *  - where its shape came from: a specimen by its name (they are made the
 *    same every time), or a scan's own geometry;
 *  - the ground's permanent edits;
 *  - the simulation's own state (settlements, country, landmarks), taken
 *    field by field. The browser's structured clone keeps maps, sets, typed
 *    arrays and shared references as they were, so nothing is translated.
 * Everything else (heights, water, the drawing) is worked out again from those.
 */
import type { Railway } from './atlas/atlas';

export const SAVE = {
  /** Bumped when what is kept changes shape; an older save is then set aside, not misread. */
  version: 1,
  /** How often a changed universe is kept, in seconds. It is also kept when the page is hidden. */
  every: 8,
};

export type WorldSource =
  | { kind: 'specimen'; caption: string }
  | { kind: 'scan'; position: Float32Array; index: Uint32Array | null; color: Float32Array | null };

/** A world's own state, as `TerrainWorld.snapshot()` gives it. */
export interface WorldState {
  edits: Float32Array;
  settlements: Record<string, unknown>;
  country: Record<string, unknown>;
  landmarks: Record<string, unknown>;
}

export interface SavedWorld {
  name: string;
  source: WorldSource;
  heightMode: string;
  state: WorldState;
  /** Which way the world was turned, so you come back to the view you left. */
  turn?: number[];
}

export interface Universe {
  version: number;
  savedAt: number;
  current: string;
  worlds: SavedWorld[];
  railways: Railway[];
}

/**
 * An object's own state, field by field, leaving out what it was given to
 * work on (the ground, the heights, the other simulations): those are the
 * restoring world's own, not something to keep a copy of.
 */
export function stateOf(obj: object, context: unknown[]): Record<string, unknown> {
  const skip = new Set(context), out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (skip.has(v) || typeof v === 'function') continue;
    out[k] = v;
  }
  return out;
}

/** Pour kept state back into a freshly made object of the same kind. */
export function restoreInto(obj: object, state: Record<string, unknown>): void {
  Object.assign(obj, state);
}

const DB = 'atlas-minor', STORE = 'universe', KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The kept universe, or null if there is none (or it is from an older shape, or the browser won't say). */
export async function loadUniverse(): Promise<Universe | null> {
  try {
    const db = await open();
    const got = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const u = got as Universe | undefined;
    return u && u.version === SAVE.version && u.worlds?.length ? u : null;
  } catch {
    return null; // a private window, storage blocked: play on without keeping
  }
}

export async function saveUniverse(u: Universe): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(u, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function forgetUniverse(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch { /* nothing kept to forget */ }
}
