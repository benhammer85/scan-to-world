import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { fromText, grove, keepInGrove, keepTree, recallTree, setAside, setGrove, snapshotTree, toText, treeFrom, type KeptTree } from '../src/rings/save';
import { TreeSim } from '../src/rings/tree';

/** A tree with `n` rings, drawn as the daily practice draws them (anywhere round is the year's edge). */
function grown(n: number, seed = 7): TreeSim {
  const t = new TreeSim(seed, {});
  t.free = true;
  let time = 0;
  for (let k = 0; k < n; k++) {
    let a = 0.3 * k;
    t.begin(time, a, 1);
    while (t.stroke) { a += Math.PI * 2 / 120; time += 1 / 60; t.move(time, a % (Math.PI * 2), 1 + 0.2 * Math.sin(a * 2)); }
    time += 2;
  }
  return t;
}
const keptOf = (t: TreeSim, extra: Partial<KeptTree> = {}): KeptTree => ({ v: 1, tree: 'oak', seed: t.seed, wander: false, turn: 0, sim: snapshotTree(t), days: t.rings.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`), ...extra });
const keys = () => new Promise<IDBValidKey[]>((ok) => { const q = indexedDB.open('annulus', 1); q.onsuccess = () => { q.result.transaction('kept').objectStore('kept').getAllKeys().onsuccess = (e) => ok((e.target as IDBRequest<IDBValidKey[]>).result); }; });

beforeEach(() => { (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory(); });

describe('keeping the year', () => {
  it('keeps a tree and reads it back whole', async () => {
    const t = grown(5);
    expect(await keepTree(keptOf(t), 'diary')).toBe(true);
    const back = await recallTree('diary'), t2 = back && treeFrom(back, {});
    expect(t2).toBeTruthy();
    expect(t2!.rings.length).toBe(5);
    expect(Array.from(t2!.rings[4])).toEqual(Array.from(t.rings[4]));
  });

  it('stands a year in the grove only once it truly is there, and keeps every year after', async () => {
    const a = grown(3, 11), b = grown(4, 12);
    expect(await keepInGrove(keptOf(a))).toBe(true);
    expect(await keepInGrove(keptOf(b))).toBe(true);
    const g = await grove();
    expect(g.map((k) => k.seed)).toEqual([11, 12]);
  });

  it('says so when a year cannot be stood in the grove', async () => {
    // (A record that can't be stored: a function in it can't be cloned into the store.)
    const bad = { ...keptOf(grown(2)), oops: () => 1 } as unknown as KeptTree;
    expect(await keepInGrove(bad)).toBe(false);
    expect(await grove()).toEqual([]);
  });

  it('reads a tree back whole or not at all', () => {
    const t = grown(3), k = keptOf(t);
    expect(treeFrom(k, {})).toBeTruthy();
    const short = { ...k, sim: { ...k.sim, rings: [new Float32Array(10)] } };
    expect(treeFrom(short, {})).toBeNull();
    const nan = { ...k, sim: { ...k.sim, rings: (k.sim.rings as Float32Array[]).map((r, i) => (i === 1 ? r.map(() => NaN) : r)) } };
    expect(treeFrom(nan, {})).toBeNull();
    expect(treeFrom({ ...k, sim: undefined as unknown as Record<string, unknown> }, {})).toBeNull();
    expect(treeFrom({ ...k, seed: 'x' as unknown as number }, {})).toBeNull();
  });

  it('sets aside what it must not lose, never over anything', async () => {
    expect(await setAside({ hello: 1 }, 'unreadable')).toBe(true);
    expect(await setAside({ hello: 2 }, 'unreadable')).toBe(true);
    const ks = (await keys()).map(String).filter((k) => k.startsWith('aside/unreadable/'));
    expect(ks.length).toBeGreaterThanOrEqual(1);
  });

  it('replaces the grove whole from a copy, and lets the old records go', async () => {
    await keepInGrove(keptOf(grown(2, 1)));
    await keepInGrove(keptOf(grown(2, 2)));
    await setGrove([keptOf(grown(3, 3))]);
    expect((await grove()).map((k) => k.seed)).toEqual([3]);
    expect((await keys()).map(String).filter((k) => k.startsWith('grove/')).length).toBe(1);
  });

  it('leaves the grove as it was if a copy fails part way', async () => {
    await keepInGrove(keptOf(grown(2, 1)));
    const bad = { ...keptOf(grown(2, 9)), oops: () => 1 } as unknown as KeptTree;
    await expect(setGrove([keptOf(grown(2, 8)), bad])).rejects.toBeTruthy();
    expect((await grove()).map((k) => k.seed)).toEqual([1]);
  });

  it('writes a copy as a file and reads it back, rings and all', () => {
    const t = grown(4), all = { wellRounded: 1, v: 1, diary: keptOf(t), grove: [keptOf(grown(2, 5))] };
    const back = fromText(toText(all)) as typeof all;
    const t2 = treeFrom(back.diary, {});
    expect(t2).toBeTruthy();
    expect(Array.from(t2!.rings[3])).toEqual(Array.from(t.rings[3]));
    expect(back.grove[0].seed).toBe(5);
  });
});
