import { describe, expect, it } from 'vitest';
import { TreeSim, K, OAK, RAIN, WIND, type Rules } from '../src/rings/tree';
import { brushAt, pointerAt, bandOf, viewFor } from '../src/rings/hand';
import { snapshotTree, treeFrom } from '../src/rings/save';
import { colourOf, densityOf } from '../src/rings/palette';
import { Wash } from '../src/rings/wash';

const TAU = Math.PI * 2;
/** Always calm, no fire: the brush alone. */
const calm: Partial<Rules> = { calmFirst: 1000, fires: [] };
let clock = 0;
/**
 * One stroke round, as a hand paints it: from angle `from`, the way `dir` goes, at `pace` times the
 * steady pace (or as `paceAt(a)` says), `u(a)` bands from the bark, lifting after `round` turns
 * (and then leaving it, so the water closes the ring).
 */
function paint(t: TreeSim, o: { from?: number; dir?: number; pace?: number; paceAt?: (a: number) => number; u?: (a: number) => number; round?: number } = {}): void {
  const dir = o.dir ?? 1, start = o.from ?? 1, steady = TAU / t.strokeSeconds, round = o.round ?? 2;
  let a = start;
  t.begin(clock, a, o.u?.(a) ?? 0);
  for (let n = 0; t.stroke && !t.waiting && n < 20000; n++) {
    a += (dir * steady * (o.paceAt?.(a) ?? o.pace ?? 1)) / 60;
    clock += 1 / 60;
    t.move(clock, ((a % TAU) + TAU) % TAU, o.u?.(a) ?? 0);
    if (Math.abs(a - start) >= round * TAU) t.lift(clock);
  }
  t.finish();
  clock += 2;
}
const widthAt = (t: TreeSim, ring: number, a: number) => {
  const i = Math.round(((((a % TAU) + TAU) % TAU) / TAU) * K) % K;
  return t.rings[ring][i] - (ring ? t.rings[ring - 1][i] : t.k.pith);
};
const minWidth = (t: TreeSim, ring: number) => { let m = Infinity; for (let i = 0; i < K; i++) m = Math.min(m, widthAt(t, ring, (i / K) * TAU)); return m; };
const meanWidth = (t: TreeSim, ring: number) => { let s = 0; for (let i = 0; i < K; i++) s += widthAt(t, ring, (i / K) * TAU); return s / K; };
const sunless = { ...calm, sun: 0 };

describe('a ring painted in one stroke', () => {
  it('once round lays a ring, five years', () => {
    const t = new TreeSim(1, sunless);
    paint(t, { pace: 1.04 });
    expect(t.ring).toBe(1);
    expect(t.year).toBe(5);
    expect(t.evenness).toBeGreaterThan(0.85);
  });

  it('slow lays wide wood, quick a thin line', () => {
    const t = new TreeSim(2, sunless);
    paint(t, { paceAt: (a) => (Math.cos(a) > 0 ? 0.7 : 1.6) });
    expect(widthAt(t, 0, 0)).toBeGreaterThan(widthAt(t, 0, Math.PI) * 1.8);
  });

  it('painted further out the wood is wider; inside the last ring it is only clamped, never to nothing', () => {
    const t = new TreeSim(3, sunless);
    paint(t, { pace: 1.1 });
    paint(t, { pace: 1.1, u: (a) => (Math.sin(a) > 0.7 ? 0.8 : Math.sin(a) < -0.7 ? -1.6 : 0) });
    expect(widthAt(t, 1, Math.PI / 2)).toBeGreaterThan(widthAt(t, 1, 0) * 1.4);
    expect(widthAt(t, 1, -Math.PI / 2)).toBeGreaterThan(0);
    expect(minWidth(t, 1)).toBeGreaterThan(0);
  });

  it('the brush pales as it empties but never runs dry: painted too slowly, the ring still closes all round', () => {
    const t = new TreeSim(4, sunless);
    paint(t, { from: 0, pace: 0.5 });
    expect(t.ring).toBe(1);
    expect(minWidth(t, 0)).toBeGreaterThan(0);
    expect(widthAt(t, 0, -0.1)).toBeLessThan(widthAt(t, 0, 0.5));
  });

  it('lifted too soon, a touch where it stopped carries the stroke on', () => {
    const t = new TreeSim(5, sunless), steady = TAU / t.strokeSeconds;
    let a = 1;
    t.begin(clock, a, 0);
    for (let n = 0; n < 2000 && a < 1 + Math.PI; n++) { a += steady * 1.04 / 60; clock += 1 / 60; t.move(clock, a % TAU, 0); }
    t.lift(clock);
    expect(t.waiting).toBe(true);
    expect(t.begin(clock + 0.5, (a + 2) % TAU, 0)).toBe(false); // (too far from where it stopped)
    clock += 0.6;
    expect(t.begin(clock, (a + 0.05) % TAU, 0)).toBe(true);
    for (let n = 0; n < 2000 && t.stroke && !t.waiting; n++) { a += steady * 1.04 / 60; clock += 1 / 60; t.move(clock, a % TAU, 0); }
    expect(t.ring).toBe(1);
    expect(Array.from(t.state).every((s) => s === 1)).toBe(true); // (all of it painted, nothing wicked across)
  });

  it('lifted and left, the water wicks across the gap and closes the ring', () => {
    const t = new TreeSim(5, sunless);
    paint(t, { pace: 1.05, round: 0.6 });
    expect(t.ring).toBe(1);
    expect(Array.from(t.state).some((s) => s === 2)).toBe(true);
    expect(minWidth(t, 0)).toBeGreaterThan(0);
  });

  it('either way round paints the same, its season running the way it went', () => {
    const t = new TreeSim(6, sunless);
    paint(t, { dir: -1, pace: 1.04 });
    expect(t.ring).toBe(1);
    expect(t.dirs[0]).toBe(-1);
  });

  it('the tree grows: each ring longer, the ink levelling off, so the rings thin', () => {
    const t = new TreeSim(7, sunless);
    for (let n = 0; n < 50; n++) paint(t, { pace: 1.04 });
    expect(meanWidth(t, 45)).toBeLessThan(meanWidth(t, 5) * 0.75);
    expect(t.strokeSeconds).toBeGreaterThan(new TreeSim(7).strokeSeconds);
  });
});

describe('the weather, in the brush', () => {
  const ring = (kind: number, sun = OAK.sun) => { const t = new TreeSim(8, { ...calm, sun, calmFirst: 0, rainEvery: [1000, 1000], droughtEvery: [1000, 1000], windEvery: [1000, 1000], frostEvery: [1000, 1000] }); t.weather.fill(0); t.weather[1] = kind; paint(t, { pace: 1.04 }); paint(t, { pace: 1.04 }); return t; };

  it('the sun from the south widens the lit side by itself', () => {
    const t = ring(0);
    expect(widthAt(t, 1, t.k.sunAngle)).toBeGreaterThan(widthAt(t, 1, t.k.sunAngle + Math.PI) * 1.3);
  });

  it('rain bleeds the edge wider; wind pushes the stroke, thinner upwind', () => {
    expect(meanWidth(ring(RAIN, 0), 1)).toBeGreaterThan(meanWidth(ring(0, 0), 1) * 1.1);
    const t = ring(WIND, 0), up = t.windOf(1) + Math.PI;
    expect(widthAt(t, 1, up)).toBeLessThan(widthAt(t, 1, up + Math.PI));
  });

  it('a fire on the slope comes before its ring, on the uphill side; and each ring\'s weather is known ahead', () => {
    const t = new TreeSim(9, { ...calm, fires: [[3, 3]] });
    for (let n = 0; n < 3; n++) paint(t, { pace: 1.04 });
    expect(t.scars.length).toBe(1);
    expect(Math.cos(t.scars[0].angle - t.k.uphill)).toBeGreaterThan(0.9);
    const a = new TreeSim(10), b = new TreeSim(10);
    expect(Array.from(a.weather.slice(0, 60))).toEqual(Array.from(b.weather.slice(0, 60)));
    expect(a.weather.slice(0, a.k.calmFirst).every((w) => w === 0)).toBe(true);
  });
});

describe('a life, with nothing to lose', () => {
  it('painted carelessly (quick, wobbly, never closed), it simply keeps growing', () => {
    const t = new TreeSim(11);
    for (let n = 0; n < 60; n++) paint(t, { pace: 2.2, round: 0.7, u: (a) => 0.8 * Math.sin(a * 5 + n) });
    expect(t.over).toBe(false);
    expect(t.year).toBe(300);
    for (let n = 0; n < 60; n++) expect(minWidth(t, n)).toBeGreaterThan(0);
  });

  it('it ends when it is let rest', () => {
    const t = new TreeSim(13);
    paint(t, { pace: 1 });
    t.fall();
    expect(t.over).toBe(true);
    expect(t.news.some((n) => n.kind === 'fell')).toBe(true);
  });

  it('kept and taken up again, it is the same tree (a stroke cut off is painted again)', () => {
    const t = new TreeSim(14, { fires: [[2, 2]] });
    for (let n = 0; n < 4; n++) paint(t, { pace: 1.05 });
    t.begin(clock, 0, 0); t.move(clock + 0.1, 0.3, 0);
    const again = treeFrom({ tree: 'oak', seed: 14, wander: false, turn: 0, sim: structuredClone(snapshotTree(t)) }, { fires: [[2, 2]] })!;
    expect(again.ring).toBe(t.ring);
    expect(again.rings[2][17]).toBe(t.rings[2][17]);
    expect(again.scars.length).toBe(t.scars.length);
    expect(again.stroke).toBe(null);
    paint(again, { pace: 1.05 });
    expect(again.ring).toBe(5);
  });
});

describe('the colours', () => {
  it('each ring runs spring green to autumn sienna, and the weather mixes its pigment in', () => {
    const spring = colourOf(0, 0), autumn = colourOf(1, 0);
    expect(spring[1]).toBeGreaterThan(spring[0]); // (green)
    expect(autumn[0]).toBeGreaterThan(autumn[1] * 1.5); // (red-brown)
    const wet = colourOf(0.5, RAIN), dry = colourOf(0.5, 0);
    expect(wet[2] / wet[0]).toBeGreaterThan(dry[2] / dry[0]); // (rain cools it toward indigo)
  });

  it('they mix as paint does: blue over yellow goes green', () => {
    const blue = densityOf([0.3, 0.5, 0.9]), yellow = densityOf([0.95, 0.85, 0.2]);
    const mixed = [0, 1, 2].map((c) => Math.exp(-(blue[c] + yellow[c])));
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });
});

describe('the wash', () => {
  const fresh = () => { const w = new Wash(80); w.place(400, 400, 200); return w; };
  const calmAir = { evaporate: 0.25, vx: 0, vy: 0 };
  /** Pigment, wet or dry, at a distance from the middle (device px) to the east. */
  const at = (w: Wash, r: number) => w.densityAt(400 + r, 400 - 1);
  /** Paints the points round the east, from r0 to r1. */
  const east = (w: Wash, r0: number, r1: number, dens: [number, number, number]) => { for (let b = -6; b <= 6; b++) w.deposit(b, r0, r1, dens, 1); };

  it('wet paint runs into the wet paint beside it, and spreads a little into dry paper', () => {
    const w = fresh();
    east(w, 60, 80, [0.8, 0.2, 0.6]);
    east(w, 80, 110, [0, 0, 0]); // (clear water beside it)
    expect(at(w, 100)).toBeLessThan(0.05);
    for (let k = 0; k < 30; k++) w.step(1 / 30, calmAir, 1000);
    expect(at(w, 100)).toBeGreaterThan(0.01);
  });

  it('dries, then fades: the newest bright, the older pale', () => {
    const w = fresh();
    east(w, 60, 90, [0.8, 0.4, 0.2]);
    for (let k = 0; k < 300; k++) w.step(1 / 30, calmAir, 1000);
    expect(w.wet).toBe(false);
    const dry = at(w, 75);
    expect(dry).toBeGreaterThan(0.3);
    for (let k = 0; k < 300; k++) w.step(1 / 30, calmAir, 5);
    expect(at(w, 75)).toBeLessThan(dry * 0.2);
  });

  it('rescaled with the slice, and drawn in to its true ring as it settles', () => {
    const w = fresh();
    east(w, 100, 140, [0.6, 0.6, 0.6]);
    w.rescale(0.5);
    expect(at(w, 60)).toBeGreaterThan(0.5);
    expect(at(w, 120)).toBeLessThan(0.05);
    w.compress(() => 40, 0.5); // (the bark at 40: everything outside it drawn in by half)
    expect(at(w, 46)).toBeGreaterThan(0.5);
    expect(at(w, 62)).toBeLessThan(0.05);
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
  });
});
