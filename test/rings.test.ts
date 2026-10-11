import { describe, expect, it } from 'vitest';
import { TreeSim, K, RAIN, DROUGHT, WIND, FROST, type Rules } from '../src/rings/tree';
import { brushAt, pointerAt, bandOf, radiusAt, scaleFor, viewFor } from '../src/rings/hand';
import { snapshotTree, treeFrom } from '../src/rings/save';

const TAU = Math.PI * 2;
/** Always calm, no fire: the line alone. */
const calm: Partial<Rules> = { calmFirst: 1000, fires: [] };
/** The sun's pull taken out too. */
const still = { ...calm, sun: 0 };
let clock = 0;
/**
 * One line round, as a hand draws it: from angle `from`, the way `dir` goes, once round in `round`
 * seconds (or at `paceAt(a)` times that pace), `u(a)` bands from the bark (the pencil circle, by
 * default), with pointer events every `dt()` seconds; lifting after `turns` turns.
 */
function paint(t: TreeSim, o: { from?: number; dir?: number; round?: number; paceAt?: (a: number) => number; u?: (a: number) => number; turns?: number; dt?: () => number } = {}): void {
  const dir = o.dir ?? 1, start = o.from ?? 1, pace = TAU / (o.round ?? 4.5), turns = o.turns ?? 2, gu = t.guide();
  const u = o.u ?? ((a: number) => radiusAt(gu, a));
  let a = start;
  t.begin(clock, a, u(a));
  for (let n = 0; t.stroke && !t.resting && n < 200000; n++) {
    const dt = o.dt?.() ?? 1 / 60;
    a += dir * pace * (o.paceAt?.(a) ?? 1) * dt;
    clock += dt;
    t.move(clock, ((a % TAU) + TAU) % TAU, u(a));
    if (Math.abs(a - start) >= turns * TAU) t.lift();
  }
  if (t.stroke) t.cancel();
  clock += 2;
}
const widthAt = (t: TreeSim, ring: number, a: number) => {
  const i = Math.round(((((a % TAU) + TAU) % TAU) / TAU) * K) % K;
  return t.rings[ring][i] - (ring ? t.rings[ring - 1][i] : t.k.pith);
};
const widths = (t: TreeSim, ring: number) => Array.from({ length: K }, (_, i) => widthAt(t, ring, (i / K) * TAU));
const meanWidth = (t: TreeSim, ring: number) => widths(t, ring).reduce((a, b) => a + b, 0) / K;
/** A seeded random, for a shaky hand. */
function rng(seed: number) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

describe('a ring drawn in one line', () => {
  it('traced round the pencil circle, it lays a ring of five years, a true circle', () => {
    const t = new TreeSim(1, still);
    paint(t);
    expect(t.ring).toBe(1);
    expect(t.year).toBe(5);
    expect(t.living).toBe(1);
    expect(t.evenness).toBeGreaterThan(0.95);
    expect(meanWidth(t, 0)).toBeCloseTo(t.laidW, 0);
  });

  it('the pace never sets the width: slow and quick lay the same wood; slow only darkens its tone', () => {
    const slow = new TreeSim(2, still), quick = new TreeSim(2, still), mixed = new TreeSim(2, still);
    paint(slow, { round: 14 });
    paint(quick, { round: 2 });
    paint(mixed, { paceAt: (a) => (Math.cos(a) > 0 ? 0.3 : 2.5) });
    expect(meanWidth(slow, 0)).toBeCloseTo(meanWidth(quick, 0), 1);
    const w = widths(mixed, 0), lo = Math.min(...w), hi = Math.max(...w);
    expect(hi / lo).toBeLessThan(1.03);
    const tone = (x: TreeSim) => x.tones[0].reduce((a, b) => a + b, 0) / x.tones[0].length;
    expect(tone(slow)).toBeGreaterThan(tone(quick) + 0.3);
  });

  it('a hesitation, or pointer events coming unevenly, makes no spike', () => {
    const r = rng(3), t = new TreeSim(3, still);
    // (Events 8 to 33 ms apart, and one in twenty-five a stall of a tenth of a second or more.)
    paint(t, { dt: () => (r() < 0.04 ? 0.1 + 0.2 * r() : 0.008 + 0.025 * r()), paceAt: () => (r() < 0.05 ? 0 : 1) });
    const w = widths(t, 0), mean = meanWidth(t, 0);
    expect(Math.max(...w) / mean).toBeLessThan(1.04);
    expect(Math.min(...w) / mean).toBeGreaterThan(0.96);
  });

  it('a shaky hand makes gentle undulations, never spikes: the edge is low-passed over some fifteen degrees', () => {
    const r = rng(4), t = new TreeSim(4, still), gu = t.guide();
    let wob = 0;
    // (A finger wandering a third of a ring's width, and trembling besides.)
    paint(t, { u: (a) => { wob += -wob * 0.06 + 0.12 * (r() - 0.5); return radiusAt(gu, a) + wob + 0.15 * (r() - 0.5); } });
    const w = widths(t, 0), mean = meanWidth(t, 0);
    // No point stands out from its neighbours: the change from one point to the next is tiny…
    let steep = 0;
    for (let i = 0; i < K; i++) steep = Math.max(steep, Math.abs(w[(i + 1) % K] - w[i]) / mean);
    expect(steep).toBeLessThan(0.03);
    // …and the curvature tinier: undulations, not corners.
    let bend = 0;
    for (let i = 0; i < K; i++) bend = Math.max(bend, Math.abs(w[(i + 1) % K] - 2 * w[i] + w[(i + K - 1) % K]) / mean);
    expect(bend).toBeLessThan(0.006);
    expect(t.living).toBe(1);
  });

  it('the line is the edge: placed further out, the wood is wider; inside the bark, it is clamped to nothing', () => {
    const t = new TreeSim(5, still);
    paint(t);
    const gu = t.guide();
    paint(t, { u: (a) => radiusAt(gu, a) * (Math.sin(a) > 0.5 ? 1.4 : Math.sin(a) < -0.5 ? -1 : 1) });
    expect(widthAt(t, 1, Math.PI / 2)).toBeGreaterThan(widthAt(t, 1, 0) * 1.25);
    expect(widthAt(t, 1, -Math.PI / 2)).toBeLessThan(0.05 * widthAt(t, 1, 0));
  });

  it('the wood is an area, not a time: drawn as slowly as you like it lasts; pushed far out everywhere, it trails off thin', () => {
    const slow = new TreeSim(6, still);
    paint(slow, { round: 60 });
    expect(slow.living).toBe(1);
    expect(slow.evenness).toBeGreaterThan(0.95);
    const greedy = new TreeSim(6, still), gu = greedy.guide();
    paint(greedy, { from: 0, u: (a) => radiusAt(gu, a) * 2 });
    expect(widthAt(greedy, 0, 0.5)).toBeGreaterThan(widthAt(greedy, 0, TAU - 0.5) * 2.5);
    expect(greedy.ringEven[0]).toBeLessThan(slow.ringEven[0] - 0.2);
  });

  it('lifting rests the line; touching the drop again goes on with it, and the ring closes whole', () => {
    const t = new TreeSim(7, still), gu = t.guide();
    paint(t, { turns: 0.4 });
    // (paint gives a stroke up when it lifts: draw this one by hand.)
    let a = 1;
    t.begin(clock, a, radiusAt(gu, a));
    for (; a < 1 + 0.4 * TAU; a += 0.02) { clock += 1 / 60; t.move(clock, a % TAU, radiusAt(gu, a)); }
    t.lift();
    expect(t.resting).toBe(true);
    expect(t.ring).toBe(0);
    clock += 30; // (a long rest costs nothing)
    expect(t.begin(clock, (a + 2) % TAU, 0)).toBe(false); // (too far from the drop)
    expect(t.begin(clock, a % TAU, radiusAt(gu, a))).toBe(true);
    for (; t.stroke; a += 0.02) { clock += 1 / 60; t.move(clock, a % TAU, radiusAt(gu, a)); }
    expect(t.ring).toBe(1);
    expect(t.living).toBe(1);
    expect(t.evenness).toBeGreaterThan(0.95);
  });

  it('either way round draws the same, its season running the way it went', () => {
    const t = new TreeSim(8, still);
    paint(t, { dir: -1 });
    expect(t.ring).toBe(1);
    expect(t.dirs[0]).toBe(-1);
    expect(t.evenness).toBeGreaterThan(0.95);
  });

  it('the pencil circle is a true circle round the pith: traced, it rounds out a lopsided trunk', () => {
    const t = new TreeSim(9, still), gu = t.guide();
    paint(t, { u: (a) => radiusAt(gu, a) * (1 + 0.45 * Math.cos(a)) });
    const lop = (x: TreeSim, n: number) => (x.rings[n][0] - x.rings[n][K / 2]) / x.wRef;
    expect(lop(t, 0)).toBeGreaterThan(0.3);
    for (let n = 0; n < 3; n++) paint(t);
    expect(Math.abs(lop(t, 3))).toBeLessThan(0.05);
  });

  it('the tree grows: each ring longer, the wood levelling off, so the rings thin', () => {
    const t = new TreeSim(10, still);
    for (let n = 0; n < 50; n++) paint(t);
    expect(meanWidth(t, 45)).toBeLessThan(meanWidth(t, 5) * 0.75);
    expect(t.over).toBe(false);
  });
});

describe('forgiving', () => {
  it('the first five rings cannot kill it, however thin; the rings after cover them', () => {
    const t = new TreeSim(11, still);
    for (let n = 0; n < 5; n++) paint(t, { u: () => 0.05 });
    expect(t.over).toBe(false);
    expect(t.living).toBe(1);
    for (let n = 0; n < 5; n++) paint(t);
    expect(t.over).toBe(false);
    expect(t.vigour).toBeGreaterThan(0.4);
  });

  it('one thin stretch is a stress; thin there two rings running, and the wood there dies; then the living wood rolls over it', () => {
    const t = new TreeSim(12, still);
    for (let n = 0; n < 6; n++) paint(t);
    const pinch = (x: TreeSim) => { const gu = x.guide(); return (a: number) => radiusAt(gu, a) * (Math.cos(a) > 0.95 ? 0 : 1); };
    paint(t, { u: pinch(t) });
    expect(t.living).toBe(1);
    paint(t, { u: pinch(t) });
    expect(t.living).toBeLessThan(1);
    expect(t.wounds.length).toBeGreaterThan(0);
    for (let n = 0; n < 8; n++) paint(t);
    expect(t.living).toBe(1); // (rolled over)
  });

  it('only sustained neglect starves it: rings drawn too near the bark, ring after ring', () => {
    const t = new TreeSim(13, still);
    for (let n = 0; n < 60 && !t.over; n++) { const gu = t.guide(); paint(t, { u: (a) => radiusAt(gu, a) * 0.55 }); }
    expect(t.over).toBe(true);
    expect(t.ring).toBeGreaterThan(8);
  });
});

describe('the weather, as forces on the line', () => {
  const only = (kind: number, rules: Partial<Rules> = {}) => { const t = new TreeSim(14, { ...calm, ...rules }); t.weather.fill(0); t.weather[1] = kind; paint(t); paint(t); return t; };

  it('the sun from the south draws the lit side outward a little', () => {
    const t = new TreeSim(14, calm);
    paint(t);
    expect(widthAt(t, 0, t.k.sunAngle)).toBeGreaterThan(widthAt(t, 0, t.k.sunAngle + Math.PI) + 0.15 * t.laidW);
  });

  it('rain wets the paper: more wood, and the line bleeds outward; drought dries the brush: less', () => {
    const plain = only(0, { sun: 0 }), wet = only(RAIN, { sun: 0 }), dry = only(DROUGHT, { sun: 0 });
    expect(meanWidth(wet, 1)).toBeGreaterThan(meanWidth(plain, 1) * 1.1);
    expect(dry.ringEven[1]).toBeLessThan(plain.ringEven[1] - 0.05); // (traced at the circle, the brush runs out)
    expect(meanWidth(dry, 1)).toBeLessThan(meanWidth(plain, 1) * 0.95);
  });

  it('wind pushes the line: an eccentric ring unless the hand holds against it', () => {
    const t = only(WIND, { sun: 0 }), down = t.windOf(1), w = widths(t, 1);
    // (Widest downwind, thinnest upwind: an eccentric ring, as a wind-blown tree's.)
    expect(Math.max(...w) / Math.min(...w)).toBeGreaterThan(1.5);
    expect(widthAt(t, 1, down)).toBeGreaterThan(meanWidth(t, 1) * 1.15);
    const held = new TreeSim(14, { ...calm, sun: 0 });
    held.weather.fill(0); held.weather[1] = WIND;
    paint(held);
    const gu = held.guide();
    paint(held, { u: (a) => radiusAt(gu, a) - held.k.wind * Math.cos(a - held.windOf(1)) });
    expect(held.ringEven[1]).toBeGreaterThan(t.ringEven[1] + 0.1);
  });

  it('frost makes the hand tremble: gentle undulations, a less true circle than a calm one', () => {
    expect(only(FROST).ringEven[1]).toBeLessThan(only(0).ringEven[1] - 0.03);
  });

  it('fire scorches a sector on the uphill side that takes no wood, and the rings roll over it', () => {
    const t = new TreeSim(15, { ...calm, sun: 0, fires: [[6, 6]] });
    for (let n = 0; n < 6; n++) paint(t);
    expect(t.scars.length).toBe(1);
    expect(Math.cos(t.scars[0].angle - t.k.uphill)).toBeGreaterThan(0.9);
    expect(K - t.alive.reduce((s, x) => s + x, 0)).toBeGreaterThan(10);
    paint(t);
    expect(widthAt(t, 6, t.scars[0].angle)).toBeLessThan(0.25 * t.laidW);
    for (let n = 0; n < 12; n++) paint(t);
    expect(t.living).toBe(1);
  });

  it('weather is occasional and known ahead: mostly calm, a spell every several rings, never back to back', () => {
    const a = new TreeSim(16), b = new TreeSim(16);
    expect(Array.from(a.weather.slice(0, 80))).toEqual(Array.from(b.weather.slice(0, 80)));
    const first = Array.from(a.weather.slice(0, 80));
    expect(first.slice(0, a.k.calmFirst).every((w) => w === 0)).toBe(true);
    expect(first.filter((w) => w === 0).length / first.length).toBeGreaterThan(0.6);
    // (Between two spells, at least three calm rings: time to see the next one gathering.)
    let lastEnd = -10;
    for (let i = 1; i < first.length; i++) if (first[i] && !first[i - 1]) { expect(i - lastEnd).toBeGreaterThanOrEqual(3); }
    else if (!first[i] && first[i - 1]) lastEnd = i;
    expect([RAIN, DROUGHT, WIND, FROST].every((w) => a.weather.slice(0, 200).includes(w))).toBe(true);
    expect(a.fireRings.length).toBe(2);
  });
});

describe('a life', () => {
  it('drawn with care it lives its three hundred years, in sixty strokes, a slice of true circles', () => {
    const t = new TreeSim(17);
    while (!t.over && t.year < 300) {
      const w = t.weatherNow, wind = t.windOf(), gu = t.guide(), k = t.k;
      const spare = w === DROUGHT ? 0.72 : 1;
      paint(t, { u: (a) => radiusAt(gu, a) * spare - k.sun * Math.cos(a - k.sunAngle) - (w === WIND ? k.wind * Math.cos(a - wind) : 0) - (w === RAIN ? 0.85 * k.rainBleed : 0) });
    }
    expect(t.year).toBe(300);
    expect(t.ring).toBe(60);
    expect(t.evenness).toBeGreaterThan(0.85);
  });

  it('it grows old: past three hundred years, even a careful hand cannot keep it for ever', () => {
    const t = new TreeSim(18, { fires: [] });
    for (let n = 0; n < 120 && !t.over; n++) paint(t);
    expect(t.over).toBe(true);
    expect(t.cause).toBe('old');
    expect(t.year).toBeGreaterThan(330);
  });

  it('wandering, it never falls until it is felled', () => {
    const t = new TreeSim(19, { endless: true });
    for (let n = 0; n < 40; n++) paint(t, { u: () => 0.1 });
    expect(t.over).toBe(false);
    t.fall();
    expect(t.over).toBe(true);
    expect(t.cause).toBe('felled');
  });

  it('kept and taken up again, it is the same tree (a stroke cut off is drawn again)', () => {
    const t = new TreeSim(20, { fires: [[2, 2]] });
    for (let n = 0; n < 4; n++) paint(t);
    t.begin(clock, 0, 1); t.move(clock + 0.1, 0.3, 1);
    const again = treeFrom({ tree: 'oak', seed: 20, wander: false, turn: 0, sim: structuredClone(snapshotTree(t)) }, { fires: [[2, 2]] })!;
    expect(again.ring).toBe(t.ring);
    expect(again.rings[2][17]).toBe(t.rings[2][17]);
    expect(Array.from(again.tones[1])).toEqual(Array.from(t.tones[1]));
    expect(again.scars.length).toBe(t.scars.length);
    expect(Array.from(again.alive)).toEqual(Array.from(t.alive));
    expect(again.evenness).toBeCloseTo(t.evenness);
    expect(again.stroke).toBe(null);
    paint(again);
    expect(again.ring).toBe(5);
  });

  it('a tree kept before the line could rest (no tones, no stress) still loads, and goes on', () => {
    const t = new TreeSim(21);
    for (let n = 0; n < 3; n++) paint(t);
    const sim = structuredClone(snapshotTree(t));
    delete sim.tones; delete sim.stressed;
    const again = treeFrom({ tree: 'oak', seed: 21, wander: false, turn: 0, sim }, {})!;
    expect(again.ring).toBe(3);
    paint(again);
    expect(again.ring).toBe(4);
  });
});

describe('the hand', () => {
  it('a pointer becomes the line and back: the angle round the pith, the offset from the bark in bands', () => {
    const t = new TreeSim(22, still);
    for (let n = 0; n < 6; n++) paint(t);
    const v = viewFor(t, 390 * 3, 844 * 3, 3), band = bandOf(t, v);
    for (const [a, u] of [[0.3, 0], [2, 1.5], [4, -0.5]]) {
      const p = pointerAt(t, v, band, a, u), b = brushAt(t, v, band, p.x, p.y);
      expect(b.a).toBeCloseTo(a, 6);
      expect(b.u).toBeCloseTo(u, 6);
    }
    expect(band).toBeGreaterThanOrEqual(16 * 3);
  });

  it('the camera keeps the ring being drawn large: a sapling and an old trunk fill the room alike', () => {
    const young = new TreeSim(23, still), old = new TreeSim(23, still);
    paint(young);
    for (let n = 0; n < 60; n++) paint(old);
    const room = 500, size = (t: TreeSim) => (t.radius + t.wRef) * scaleFor(t, room, 3);
    expect(size(young)).toBeGreaterThan(room * 0.6);
    expect(size(old)).toBeGreaterThan(room * 0.6);
    expect(size(young) / size(old)).toBeGreaterThan(0.75);
  });
});
