import { describe, expect, it } from 'vitest';
import { TreeSim, K, RAIN, DROUGHT, WIND, FROST, type Rules } from '../src/rings/tree';
import { brushAt, pointerAt, bandOf, radiusAt, scaleFor, viewFor, warpFor, warpR, unwarpR } from '../src/rings/hand';
import { Wash, type RGB } from '../src/rings/wash';
import { pigmentOf, weatheringOf } from '../src/rings/paint';
import { STAGES, stageAt } from '../src/rings/plates';
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

  it('drawn as slowly as you like, the ring is the same: nothing runs out, nothing presses', () => {
    const slow = new TreeSim(6, still), wide = new TreeSim(6, still);
    paint(slow, { round: 60 });
    expect(slow.living).toBe(1);
    expect(slow.evenness).toBeGreaterThan(0.95);
    const gu = wide.guide();
    paint(wide, { from: 0, u: (a) => radiusAt(gu, a) * 2 });
    // (Pushed out twice as far all round, the wood is twice as wide all round: no brush runs dry.)
    expect(widthAt(wide, 0, TAU - 0.5) / widthAt(slow, 0, TAU - 0.5)).toBeGreaterThan(1.8);
    expect(wide.ringEven[0]).toBeGreaterThan(0.95);
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

  it('let go most of the way round, the ring is closed for it: the gap eased shut, the ring whole and round', () => {
    const t = new TreeSim(7, still), gu = t.guide();
    let a = 1;
    t.begin(clock, a, radiusAt(gu, a));
    for (; a < 1 + 0.9 * TAU; a += 0.02) { clock += 1 / 60; t.move(clock, a % TAU, radiusAt(gu, a)); }
    expect(t.ring).toBe(0);
    expect(t.finish()).toBe(true);
    expect(t.stroke).toBe(null);
    expect(t.ring).toBe(1);
    expect(t.news.some((n) => n.kind === 'ring')).toBe(true);
    expect(t.living).toBe(1);
    expect(t.evenness).toBeGreaterThan(0.95);
    clock += 2;
  });

  it('let go under most of the way round, it is not closed: the line rests, to be taken up', () => {
    const t = new TreeSim(7, still), gu = t.guide();
    let a = 1;
    t.begin(clock, a, radiusAt(gu, a));
    for (; a < 1 + 0.5 * TAU; a += 0.02) { clock += 1 / 60; t.move(clock, a % TAU, radiusAt(gu, a)); }
    expect(t.finish()).toBe(false);
    expect(t.ring).toBe(0);
    expect(t.stroke).not.toBe(null);
    t.cancel(); clock += 2;
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
  it('nothing can kill it: rings drawn right on the bark, ring after ring, and it grows on', () => {
    const t = new TreeSim(11);
    for (let n = 0; n < 80; n++) paint(t, { u: () => 0.03 });
    expect(t.over).toBe(false);
    expect(t.living).toBe(1);
    expect(t.wounds.length).toBe(0);
    expect(t.ring).toBe(80);
  });

  it('nor age: four hundred years on, still growing', () => {
    const t = new TreeSim(18);
    for (let n = 0; n < 90; n++) paint(t);
    expect(t.over).toBe(false);
    expect(t.year).toBe(450);
  });

  it('it ends only when it is kept as a plate', () => {
    const t = new TreeSim(12);
    for (let n = 0; n < 3; n++) paint(t);
    t.fall('felled');
    expect(t.over).toBe(true);
    expect(t.cause).toBe('felled');
  });
});

describe('the weather, as colour and mood', () => {
  it('never pushes the line: traced at the circle, every weather lays a true circle', () => {
    for (const kind of [0, RAIN, DROUGHT, WIND, FROST]) {
      const t = new TreeSim(14, { calmFirst: 1000, fires: [] });
      t.weather.fill(0); t.weather[1] = kind;
      paint(t); paint(t);
      expect(t.ringEven[1]).toBeGreaterThan(0.95);
    }
  });

  it('it changes the paint: rain cooler and wetter, drought a thin ochre that dries fast, wind drifts it, frost a pale blue', () => {
    const t = new TreeSim(14, { calmFirst: 1000, fires: [] });
    t.weather.fill(0); t.weather[1] = RAIN; t.weather[2] = DROUGHT; t.weather[3] = WIND; t.weather[4] = FROST;
    const calmW = weatheringOf(t, 0), rain = weatheringOf(t, 1), dry = weatheringOf(t, 2), wind = weatheringOf(t, 3);
    expect(rain.wet).toBeGreaterThan(calmW.wet);
    expect(dry.dry).toBeGreaterThan(calmW.dry);
    expect(Math.hypot(...wind.drift)).toBeGreaterThan(0);
    // (Absorbance: rain absorbs less blue than a calm summer gold does; drought less paint in all.)
    const gold = pigmentOf(0, 0.25), blue = pigmentOf(RAIN, 0.25), ochre = pigmentOf(DROUGHT, 0.25), pale = pigmentOf(FROST, 0.25);
    expect(blue[2] / blue[0]).toBeLessThan(gold[2] / gold[0]);
    expect(ochre[0] + ochre[1] + ochre[2]).toBeLessThan(gold[0] + gold[1] + gold[2]);
    expect(pale[0] + pale[1] + pale[2]).toBeLessThan(gold[0] + gold[1] + gold[2]);
  });

  it('the seasons run round each ring, spring to spring, and a slow hand lays deeper colour', () => {
    const spring = pigmentOf(0, 0), autumn = pigmentOf(0, 0.5), again = pigmentOf(0, 1);
    expect(Math.abs(spring[1] - autumn[1])).toBeGreaterThan(0.1);
    for (let c = 0; c < 3; c++) expect(again[c]).toBeCloseTo(spring[c], 3);
    const quick = pigmentOf(0, 0.3, 0), slow = pigmentOf(0, 0.3, 1);
    expect(slow[0]).toBeGreaterThan(quick[0] * 1.3);
  });

  it('fire is only colour: a bloom on the uphill side, and the wood grows on', () => {
    const t = new TreeSim(15, { ...calm, fires: [[3, 3]] });
    for (let n = 0; n < 4; n++) paint(t);
    expect(t.scars.length).toBe(1);
    expect(Math.cos(t.scars[0].angle - t.k.uphill)).toBeGreaterThan(0.9);
    expect(t.living).toBe(1);
    expect(widthAt(t, 3, t.scars[0].angle)).toBeGreaterThan(0.8 * t.laidW);
  });

  it('weather is occasional and known ahead: mostly calm, a spell every several rings, never back to back', () => {
    const a = new TreeSim(16), b = new TreeSim(16);
    expect(Array.from(a.weather.slice(0, 80))).toEqual(Array.from(b.weather.slice(0, 80)));
    const first = Array.from(a.weather.slice(0, 80));
    expect(first.slice(0, a.k.calmFirst).every((w) => w === 0)).toBe(true);
    expect(first.filter((w) => w === 0).length / first.length).toBeGreaterThan(0.6);
    let lastEnd = -10;
    for (let i = 1; i < first.length; i++) if (first[i] && !first[i - 1]) { expect(i - lastEnd).toBeGreaterThanOrEqual(3); }
    else if (!first[i] && first[i - 1]) lastEnd = i;
    expect([RAIN, DROUGHT, WIND, FROST].every((w) => a.weather.slice(0, 200).includes(w))).toBe(true);
    expect(a.fireRings.length).toBe(2);
  });
});

describe('the watercolour paper', () => {
  /** A disc of paint, laid at once. */
  const disc = (w: Wash, r: number, ink: RGB, x = 0, y = 0) => { for (let c = 0; c < w.n * w.n; c++) { const [cx, cy] = w.centre(c); if (Math.hypot(cx - x, cy - y) <= r) w.lay(c, 0.9, ink); } };
  const at = (w: Wash, x: number, y: number) => { const c = w.cell(x, y); return w.dep[c * 3] + w.dep[c * 3 + 1] + w.dep[c * 3 + 2] + w.sus[c * 3] + w.sus[c * 3 + 1] + w.sus[c * 3 + 2]; };

  it('a wash dries in a few seconds, keeping its pigment; held wet, it waits', () => {
    const w = new Wash(96, 20);
    disc(w, 8, [0.3, 0.2, 0.1]);
    const before = w.pigment;
    w.weather = { wet: 1, dry: 0, drift: [0, 0] };
    for (let k = 0; k < 600; k++) w.step(1 / 60);
    expect(w.wet).toBe(true); // (ten seconds held, and still wet)
    w.weather = { wet: 1, dry: 1, drift: [0, 0] };
    let t = 0;
    while (w.wet && t < 30) { w.step(1 / 60); t += 1 / 60; }
    expect(w.wet).toBe(false);
    expect(t).toBeGreaterThan(1.5);
    expect(t).toBeLessThan(12);
    expect(w.pigment).toBeCloseTo(before, 0);
  });

  it('as it dries, the pigment gathers at its edge: the coffee-ring effect, a dark rim', () => {
    const w = new Wash(96, 20);
    disc(w, 10, [0.3, 0.3, 0.3]);
    while (w.wet) w.step(1 / 60);
    expect(Math.max(at(w, 9.6, 0), at(w, 9.9, 0))).toBeGreaterThan(at(w, 0, 0) * 1.3);
  });

  it('wet-in-wet: laid against a damp wash, the colours run together; against a dry one, the edge stays', () => {
    const run = (wait: number) => {
      const w = new Wash(96, 20);
      disc(w, 6, [0.4, 0, 0], -5, 0);
      for (let k = 0; k < wait; k++) w.step(1 / 60);
      disc(w, 6, [0, 0, 0.4], 7, 0);
      while (w.wet) w.step(1 / 60);
      const c = w.cell(0, 0); // (a millimetre inside the red)
      return w.dep[c * 3 + 2] + w.sus[c * 3 + 2]; // (the blue found inside the red)
    };
    expect(run(20)).toBeGreaterThan(0.03);
    expect(run(900)).toBeLessThan(0.002);
  });

  it('a ring laid point by point while held wet dries without a seam where it closed', () => {
    const w = new Wash(160, 30), STEP = TAU / 240;
    w.weather = { wet: 1, dry: 0, drift: [0, 0] };
    for (let i = 0; i < 240; i++) { w.layArc(i * STEP, (i + 1) * STEP, () => 12, () => 22, 0.9, () => [0.2, 0.2, 0.2]); w.step(1 / 60); }
    w.weather = { wet: 1, dry: 1, drift: [0, 0] };
    while (w.wet) w.step(1 / 60);
    const ring = (a: number) => { let s = 0; for (let r = 13; r <= 21; r += 0.5) s += at(w, r * Math.cos(a), r * Math.sin(a)); return s; };
    const seam = ring(0.002), round = [1, 2, 3, 4, 5].map((k) => ring(k)).reduce((a, b) => a + b, 0) / 5;
    expect(seam / round).toBeLessThan(1.25);
    expect(seam / round).toBeGreaterThan(0.8);
  });

  it('paint goes down in the season\'s colour and settles into the wood\'s as it dries', () => {
    const w = new Wash(64, 20), green: RGB = [0.5, 0.2, 0.6], wood: RGB = [0.1, 0.3, 0.6];
    for (let c = 0; c < w.n * w.n; c++) { const [x, y] = w.centre(c); if (Math.hypot(x, y) < 6) w.lay(c, 0.9, green, 0, wood, 0.85); }
    const c = w.cell(0, 0), share = (a: Float32Array) => a[c * 3] / (a[c * 3] + a[c * 3 + 1] + a[c * 3 + 2]);
    expect(share(w.sus)).toBeCloseTo(0.5 / 1.3, 3); // (wet: the season's colour)
    while (w.wet) w.step(1 / 60);
    expect(share(w.dep)).toBeLessThan(0.2); // (dry: mostly the wood's)
    expect(share(w.dep)).toBeGreaterThan(0.1 / 1.0); // (with a whisper of its season)
  });

  it('resampled for a new warp, the paint is kept', () => {
    const w = new Wash(96, 20);
    disc(w, 8, [0.3, 0.2, 0.1]);
    while (w.wet) w.step(1 / 60);
    const before = w.pigment;
    w.remap(20, (x, y) => [x, y]);
    expect(w.pigment / before).toBeGreaterThan(0.97);
    w.remap(40, (x, y) => [x / 2, y / 2]); // (the paper twice as wide, its paint drawn twice as large: the same cells)
    expect(w.pigment / before).toBeGreaterThan(0.95);
    expect(w.pigment / before).toBeLessThan(1.05);
  });
});

describe('the warp', () => {
  it('keeps the newest ring wide on an old trunk, leaves a young one true, and goes back exactly', () => {
    const young = new TreeSim(30), old = new TreeSim(30);
    paint(young);
    for (let n = 0; n < 60; n++) paint(old);
    expect(warpFor(young).beta).toBe(0);
    const w = warpFor(old), R = old.radius;
    expect(w.beta).toBeGreaterThan(0);
    expect((warpR(w, R + old.wRef) - warpR(w, R)) / warpR(w, w.R)).toBeGreaterThan(0.07);
    for (const r of [0, 10, 100, R, R + 5]) expect(unwarpR(w, warpR(w, r))).toBeCloseTo(r, 4);
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
    for (let n = 0; n < 4; n++) { if (n === 2) t.bleed(); paint(t); }
    expect(t.bleeds[1]).toBe(1); // (ring 2 begun while ring 1 was damp: wet-in-wet)
    t.begin(clock, 0, 1); t.move(clock + 0.1, 0.3, 1);
    const again = treeFrom({ tree: 'oak', seed: 20, wander: false, turn: 0, sim: structuredClone(snapshotTree(t)) }, { fires: [[2, 2]] })!;
    expect(again.ring).toBe(t.ring);
    expect(again.rings[2][17]).toBe(t.rings[2][17]);
    expect(Array.from(again.tones[1])).toEqual(Array.from(t.tones[1]));
    expect(again.bleeds).toEqual(t.bleeds);
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

describe('the plates', () => {
  it('the tree is drawn from real prints, one for each stage of its life, crossing over as it ages', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['acorns', 'young', 'sapling', 'lane', 'prime', 'great', 'ancient']);
    expect(stageAt(0)).toMatchObject({ blend: 0 });
    expect(stageAt(0).stage.id).toBe('acorns');
    expect(stageAt(120).stage.id).toBe('lane');
    expect(stageAt(300).stage.id).toBe('great');
    expect(stageAt(500).stage.id).toBe('ancient');
    // (Nearing the next stage, the one gives way to the other.)
    const near = stageAt(145);
    expect(near.next?.id).toBe('prime');
    expect(near.blend).toBeGreaterThan(0);
    expect(near.blend).toBeLessThan(1);
    for (const s of STAGES) { expect(s.url).toBeTruthy(); expect(s.credit.length).toBeGreaterThan(5); }
  });
});
