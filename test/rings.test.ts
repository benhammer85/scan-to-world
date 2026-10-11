import { describe, expect, it } from 'vitest';
import { TreeSim, K, roundnessOf } from '../src/rings/tree';
import { feltBy, fingerTip, tiltFrom, downOf } from '../src/rings/hold';
import { snapshotTree, treeFrom } from '../src/rings/save';

const run = (t: TreeSim, seconds: number) => { for (let s = 0; s < seconds; s += 1 / 30) t.step(1 / 30); };
/** Held so the tree's angle `a` is at the foot of the screen, tipped down it by `tip`. */
const hold = (t: TreeSim, a: number, tip: number) => Object.assign(t, feltBy({ turn: -Math.PI / 2 - a, tipAngle: -Math.PI / 2, tip }));
const widthAt = (t: TreeSim, ring: number, a: number) => {
  const i = Math.round(((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * K) % K;
  return t.rings[ring][i] - (ring ? t.rings[ring - 1][i] : t.k.pith);
};
const calm = { fires: [] as [number, number][], rainEvery: [5000, 5000] as [number, number], droughtEvery: [5000, 5000] as [number, number], sunPull: 0 };

describe('held like a globe', () => {
  it('held level, the sap gathers, a ring a year', () => {
    const t = new TreeSim(1, calm);
    hold(t, 0, 0);
    run(t, t.k.yearSeconds * 2.5);
    expect(t.year).toBe(2);
    expect(t.sap).toBeGreaterThan(2);
    expect(t.pouredYear).toBe(0);
  });

  it('tipped, the growth pours toward the low side: wide there, thin opposite', () => {
    const t = new TreeSim(1, calm);
    hold(t, 0, 0);
    run(t, t.k.yearSeconds * 3);
    hold(t, Math.PI, 1); // (the tree's west to the foot, tipped fully)
    run(t, t.k.yearSeconds * 1.02);
    const last = t.rings.length - 1;
    expect(widthAt(t, last, Math.PI)).toBeGreaterThan(widthAt(t, last, 0) * 4);
  });

  it('tipped soon, a thin and even ring; held till heavy, a surge', () => {
    const soon = new TreeSim(2, calm);
    hold(soon, 0, 0); run(soon, soon.k.yearSeconds * 0.4);
    hold(soon, 0, 0.6); run(soon, soon.k.yearSeconds * 0.62);
    expect(soon.surges).toBe(0);
    expect(roundnessOf(soon.rings[soon.rings.length - 1])).toBeGreaterThan(0.6);
    const surge = new TreeSim(2, calm);
    hold(surge, 0, 0); run(surge, surge.k.yearSeconds * 3.2);
    hold(surge, 0, 1); run(surge, surge.k.yearSeconds * 0.85);
    expect(surge.surges).toBe(1);
  });

  it('held too long, the trunk splits where the sap lay; a sapling\'s only waits, full', () => {
    const young = new TreeSim(3, calm);
    hold(young, 0, 0);
    run(young, young.k.yearSeconds * 8);
    expect(young.cracks.length).toBe(0);
    expect(young.brink).toBeGreaterThan(0.99);
    const t = new TreeSim(3, { ...calm, crackFrom: 0 });
    hold(t, 0, 0);
    run(t, t.k.yearSeconds * 6);
    expect(t.cracks.length).toBe(1);
    expect(t.sap).toBeLessThan(1);
    expect(t.vigour).toBeLessThan(1);
  });

  it('a finger tips more the longer it is held; a phone tips by how far it has swung from level', () => {
    expect(fingerTip(0)).toBeLessThan(fingerTip(1));
    expect(fingerTip(5)).toBe(1);
    const level = downOf(50, 0), right = downOf(50, 20);
    const t = tiltFrom(level, right);
    expect(Math.cos(t.tipAngle)).toBeGreaterThan(0.9); // (tipped to the right: the low side is right)
    expect(tiltFrom(level, level).tip).toBe(0);
  });
});

describe('the weather, as forces', () => {
  it('the sun pulls growth toward its side', () => {
    const t = new TreeSim(4, { ...calm, sunPull: 0.4, crack: 1e9 }); // (no frost crack: its rib would widen the ring where it split)
    for (let y = 0; y < 20; y++) { hold(t, 0, 0); run(t, t.k.yearSeconds); }
    expect(widthAt(t, 10, t.k.sunAngle)).toBeGreaterThan(widthAt(t, 10, t.k.sunAngle + Math.PI) * 1.5);
  });

  it('rain widens a ring and drought thins it', () => {
    const wet = new TreeSim(5, { ...calm, rainEvery: [1, 1], rainLasts: [50, 50] });
    const dry = new TreeSim(5, { ...calm, droughtEvery: [1, 1], droughtLasts: [50, 50] });
    for (const t of [wet, dry]) { hold(t, 0, 0.3); run(t, t.k.yearSeconds * 5); }
    expect(widthAt(wet, 3, 1)).toBeGreaterThan(widthAt(dry, 3, 1) * 2);
  });

  it('fire leaves a scar on the uphill side, which the rings roll over', () => {
    const t = new TreeSim(6, { ...calm, fires: [[3, 3]] });
    for (let y = 0; y < 40; y++) { hold(t, 0, 0.3); run(t, t.k.yearSeconds); }
    expect(t.scars.length).toBe(1);
    expect(Math.abs(Math.cos(t.scars[0].angle - t.k.uphill))).toBeGreaterThan(0.9);
    expect(widthAt(t, 5, t.k.uphill)).toBeLessThan(widthAt(t, 5, t.k.uphill + Math.PI) * 0.2);
    expect(t.scars[0].open).toBe(0); // (healed over by now)
  });
});

describe('a life', () => {
  it('never touched, it cracks and falls young', () => {
    const t = new TreeSim(7);
    hold(t, 0, 0);
    run(t, 120);
    expect(t.over).toBe(true);
    expect(t.year).toBeLessThan(60);
    expect(t.cracks.length).toBeGreaterThan(0);
  });

  it('wandering, it never falls until it is felled', () => {
    const t = new TreeSim(7, { endless: true });
    hold(t, 0, 0);
    run(t, 120);
    expect(t.over).toBe(false);
    t.fall();
    expect(t.over).toBe(true);
    expect(t.cause).toBe('felled');
  });

  it('kept and taken up again, it is the same tree', () => {
    const t = new TreeSim(8, { fires: [[2, 2]] });
    hold(t, 0, 0); run(t, t.k.yearSeconds * 3.3);
    const again = treeFrom({ tree: 'oak', seed: 8, wander: false, turn: 0, sim: structuredClone(snapshotTree(t)) }, { fires: [[2, 2]] })!;
    expect(again.year).toBe(t.year);
    expect(again.rings[2][17]).toBe(t.rings[2][17]);
    expect(again.scars.length).toBe(t.scars.length);
    expect(again.sap).toBeCloseTo(t.sap);
  });
});
