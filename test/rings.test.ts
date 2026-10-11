import { describe, expect, it } from 'vitest';
import { TreeSim, K, OAK, RAIN, DROUGHT, WIND, FROST, type Rules } from '../src/rings/tree';
import { brushAt, pointerAt, bandOf, viewFor } from '../src/rings/hand';
import { snapshotTree, treeFrom } from '../src/rings/save';

const TAU = Math.PI * 2;
/** Always calm, no fire: the brush alone. */
const calm: Partial<Rules> = { calmFirst: 1000, fires: [] };
let clock = 0;
/**
 * One stroke round, as a hand paints it: from angle `from`, the way `dir` goes, at `pace` times the
 * steady pace (or as `paceAt(a)` says), `u(a)` bands from the bark, lifting after `round` turns.
 */
function paint(t: TreeSim, o: { from?: number; dir?: number; pace?: number; paceAt?: (a: number) => number; u?: (a: number) => number; round?: number } = {}): void {
  const dir = o.dir ?? 1, start = o.from ?? 1, steady = TAU / t.strokeSeconds, round = o.round ?? 2;
  let a = start;
  t.begin(clock, a, o.u?.(a) ?? 0);
  for (let n = 0; t.stroke && n < 20000; n++) {
    a += (dir * steady * (o.paceAt?.(a) ?? o.pace ?? 1)) / 60;
    clock += 1 / 60;
    t.move(clock, ((a % TAU) + TAU) % TAU, o.u?.(a) ?? 0);
    if (Math.abs(a - start) >= round * TAU) t.lift();
  }
  clock += 2;
}
const widthAt = (t: TreeSim, ring: number, a: number) => {
  const i = Math.round(((((a % TAU) + TAU) % TAU) / TAU) * K) % K;
  return t.rings[ring][i] - (ring ? t.rings[ring - 1][i] : t.k.pith);
};
const meanWidth = (t: TreeSim, ring: number) => { let s = 0; for (let i = 0; i < K; i++) s += widthAt(t, ring, (i / K) * TAU); return s / K; };
/** The sun's pull taken out, so a stroke at a steady pace comes out even. */
const sunless = { ...calm, sun: 0 };

describe('a ring painted in one stroke', () => {
  it('once round at the steady pace lays a ring, five years, and comes out even', () => {
    const t = new TreeSim(1, sunless);
    paint(t, { pace: 1.04 });
    expect(t.ring).toBe(1);
    expect(t.year).toBe(5);
    expect(t.living).toBe(1);
    expect(t.evenness).toBeGreaterThan(0.85);
  });

  it('slow lays wide wood, quick a thin line', () => {
    const t = new TreeSim(2, sunless);
    paint(t, { paceAt: (a) => (Math.cos(a) > 0 ? 0.7 : 1.6) }); // (slow on the east, quick on the west)
    expect(widthAt(t, 0, 0)).toBeGreaterThan(widthAt(t, 0, Math.PI) * 1.8);
  });

  it('the path is the ring\'s edge: painted further out, the wood is wider; inside the last ring, it\'s clamped to nothing, and dies there', () => {
    const t = new TreeSim(3, sunless);
    paint(t, { pace: 1.1 });
    paint(t, { pace: 1.1, u: (a) => (Math.sin(a) > 0.7 ? 0.8 : Math.sin(a) < -0.7 ? -1.6 : 0) });
    expect(widthAt(t, 1, Math.PI / 2)).toBeGreaterThan(widthAt(t, 1, 0) * 1.4);
    expect(widthAt(t, 1, -Math.PI / 2)).toBeCloseTo(0, 5);
    expect(t.alive[Math.round(0.75 * K)]).toBe(0); // (the south, where it was clamped)
    expect(t.alive[0]).toBe(1);
  });

  it('the brush holds one ring\'s ink: painted too slowly, it runs dry before the circle closes, and the dry end dies', () => {
    const t = new TreeSim(4, sunless);
    paint(t, { from: 0, pace: 0.6 });
    expect(t.living).toBeLessThan(0.75);
    // (The end of the stroke is where it starved: just short of where it began.)
    expect(t.alive[K - 6]).toBe(0);
    expect(t.alive[Math.round(K * 0.2)]).toBe(1);
  });

  it('a gap where the finger lifted stays: a small one a crack, a large one dead wood', () => {
    const small = new TreeSim(5, sunless);
    paint(small, { pace: 1.05, round: 0.97 });
    expect(small.cracks.length).toBe(1);
    expect(small.living).toBe(1);
    const large = new TreeSim(5, sunless);
    paint(large, { pace: 1.05, round: 0.7 });
    expect(large.cracks.length).toBe(0);
    expect(large.gaps).toBe(1);
    expect(large.living).toBeLessThan(0.75);
    expect(large.evenness).toBeLessThan(small.evenness);
  });

  it('either way round paints the same, its season running the way it went', () => {
    const t = new TreeSim(6, sunless);
    paint(t, { dir: -1, pace: 1.04 });
    expect(t.ring).toBe(1);
    expect(t.dirs[0]).toBe(-1);
    expect(t.evenness).toBeGreaterThan(0.85);
  });

  it('the tree grows: each ring longer, the ink levelling off, so the rings thin and the least width grows harder to keep', () => {
    const t = new TreeSim(7, sunless);
    const uMin: number[] = [];
    for (let n = 0; n < 50; n++) { uMin.push(t.uMin); paint(t, { pace: 1.04 }); }
    expect(meanWidth(t, 45)).toBeLessThan(meanWidth(t, 5) * 0.75);
    expect(uMin[45]).toBeGreaterThan(uMin[5] * 1.4);
    expect(t.strokeSeconds).toBeGreaterThan(new TreeSim(7).strokeSeconds);
  });
});

describe('the weather, as forces on the brush', () => {
  const ring = (kind: number, sun = OAK.sun) => { const t = new TreeSim(8, { ...calm, sun, calmFirst: 0, rainEvery: [1000, 1000], droughtEvery: [1000, 1000], windEvery: [1000, 1000], frostEvery: [1000, 1000] }); t.weather.fill(0); t.weather[1] = kind; paint(t, { pace: 1.04 }); paint(t, { pace: 1.04 }); return t; };

  it('the sun from the south widens the lit side by itself', () => {
    const t = ring(0);
    expect(widthAt(t, 1, t.k.sunAngle)).toBeGreaterThan(widthAt(t, 1, t.k.sunAngle + Math.PI) * 1.5);
  });

  it('rain bleeds the edge wider and untidier; drought gives less and breaks the line', () => {
    const plain = ring(0, 0), wet = ring(RAIN, 0), dry = ring(DROUGHT, 0);
    expect(meanWidth(wet, 1)).toBeGreaterThan(meanWidth(plain, 1) * 1.1);
    expect(wet.ringEven[1]).toBeLessThan(plain.ringEven[1]);
    expect(dry.ringEven[1]).toBeLessThan(plain.ringEven[1]);
    expect(meanWidth(dry, 1)).toBeLessThan(meanWidth(plain, 1) * 0.85);
  });

  it('wind pushes the stroke: the upwind side starves unless the hand holds against it', () => {
    const t = ring(WIND), up = t.windOf(1) + Math.PI;
    expect(widthAt(t, 1, up)).toBeLessThan(widthAt(t, 1, up + Math.PI) * 0.5);
    const held = new TreeSim(8, { ...calm, calmFirst: 0, rainEvery: [1000, 1000], droughtEvery: [1000, 1000], windEvery: [1000, 1000], frostEvery: [1000, 1000] });
    held.weather.fill(0); held.weather[1] = WIND;
    paint(held, { pace: 1.04 });
    paint(held, { pace: 1.04, u: (a) => -held.k.wind * Math.cos(a - held.windOf(1)) });
    expect(held.ringEven[1]).toBeGreaterThan(t.ringEven[1] + 0.1);
  });

  it('frost jolts the brush: a less even ring than a calm one', () => {
    expect(ring(FROST).ringEven[1]).toBeLessThan(ring(0).ringEven[1] - 0.05);
  });

  it('fire scorches a sector on the uphill side that takes no ink, and the rings roll over it', () => {
    const t = new TreeSim(9, { ...calm, sun: 0, fires: [[3, 3]] });
    for (let n = 0; n < 3; n++) paint(t, { pace: 1.04 });
    expect(t.scars.length).toBe(1);
    expect(Math.cos(t.scars[0].angle - t.k.uphill)).toBeGreaterThan(0.9);
    const scarred = K - t.alive.reduce((s, x) => s + x, 0);
    expect(scarred).toBeGreaterThan(10);
    paint(t, { pace: 1.04 });
    expect(widthAt(t, 3, t.scars[0].angle)).toBeCloseTo(0, 5);
    for (let n = 0; n < 20; n++) paint(t, { pace: 1.0 });
    expect(t.living).toBe(1); // (healed over)
  });

  it('what is coming is known ahead: each ring\'s weather, and the fires, from the seed', () => {
    const a = new TreeSim(10), b = new TreeSim(10);
    expect(Array.from(a.weather.slice(0, 60))).toEqual(Array.from(b.weather.slice(0, 60)));
    expect(a.weather.slice(0, a.k.calmFirst).every((w) => w === 0)).toBe(true);
    expect([RAIN, DROUGHT, WIND, FROST].every((w) => a.weather.slice(0, 80).includes(w))).toBe(true);
    expect(a.fireRings.length).toBe(2);
  });
});

describe('a life', () => {
  it('painted carelessly (quick, wobbly, never closed), it dies young', () => {
    const t = new TreeSim(11);
    for (let n = 0; n < 40 && !t.over; n++) paint(t, { pace: 2, round: 0.8, u: (a) => 0.6 * Math.sin(a * 5 + n) });
    expect(t.over).toBe(true);
    expect(t.year).toBeLessThan(100);
  });

  it('painted with care it lives its three hundred years, in sixty strokes', () => {
    const t = new TreeSim(12);
    while (!t.over && t.year < 300) {
      const w = t.weatherNow, wind = t.windOf();
      paint(t, { pace: 1, paceAt: (a) => (1 + t.k.sun * Math.cos(a - t.k.sunAngle)) / (w === DROUGHT ? 0.68 : 0.98), u: (a) => (w === WIND ? -t.k.wind * Math.cos(a - wind) : 0) });
    }
    expect(t.year).toBe(300);
    expect(t.ring).toBe(60);
    expect(t.evenness).toBeGreaterThan(0.8);
  });

  it('wandering, it never falls until it is felled', () => {
    const t = new TreeSim(13, { endless: true });
    for (let n = 0; n < 40; n++) paint(t, { pace: 2, round: 0.6 });
    expect(t.over).toBe(false);
    t.fall();
    expect(t.over).toBe(true);
    expect(t.cause).toBe('felled');
  });

  it('kept and taken up again, it is the same tree (a stroke cut off is painted again)', () => {
    const t = new TreeSim(14, { fires: [[2, 2]] });
    for (let n = 0; n < 4; n++) paint(t, { pace: 1.05 });
    t.begin(clock, 0, 0); t.move(clock + 0.1, 0.3, 0);
    const again = treeFrom({ tree: 'oak', seed: 14, wander: false, turn: 0, sim: structuredClone(snapshotTree(t)) }, { fires: [[2, 2]] })!;
    expect(again.ring).toBe(t.ring);
    expect(again.rings[2][17]).toBe(t.rings[2][17]);
    expect(again.scars.length).toBe(t.scars.length);
    expect(Array.from(again.alive)).toEqual(Array.from(t.alive));
    expect(again.evenness).toBeCloseTo(t.evenness);
    expect(again.stroke).toBe(null);
    paint(again, { pace: 1.05 });
    expect(again.ring).toBe(5);
  });
});

describe('the hand', () => {
  it('a pointer becomes the brush and back: the angle round the pith, the offset from the bark in bands', () => {
    const t = new TreeSim(15, sunless);
    for (let n = 0; n < 6; n++) paint(t, { pace: 1.05 });
    const v = viewFor(t, 390 * 3, 844 * 3, 3), band = bandOf(t, v);
    for (const [a, u] of [[0.3, 0], [2, 1.5], [4, -0.5]]) {
      const p = pointerAt(t, v, band, a, u), b = brushAt(t, v, band, p.x, p.y);
      expect(b.a).toBeCloseTo(a, 6);
      expect(b.u).toBeCloseTo(u, 6);
    }
    expect(band).toBeGreaterThanOrEqual(12 * 3);
  });
});
