import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { STAGE, Settlements, type Street } from '../src/life/settlements';
import { BLOCK, blockMarks, footprintRadius, houseShape, lookOf, squareFrames, streetMarks, terraceMarks, yardPaths } from '../src/life/buildingMarks';

/** The settlements tests' world: a gentle swell, and a cliff at x ≈ 0.3. */
function world() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const x = topo.positions[v * 3], y = topo.positions[v * 3 + 1];
    h[v] = 0.3 + 0.1 * y + 0.6 / (1 + Math.exp(-(x - 0.3) * 60));
  }
  return { topo, h };
}

function town(days: number) {
  const { topo, h } = world();
  const s = new Settlements(topo, h);
  s.tap([0, 0, 1]);
  s.advance(days);
  return { topo, h, s };
}

const P = (topo: ReturnType<typeof world>['topo'], v: number) => [topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]];
const d3 = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('ways wear in', () => {
  it('a way is walked before it is worn in, and worn in before it is made up; never back', () => {
    const { s } = town(4);
    const watched = s.streets.filter((x) => x.kind !== 'square' && x.kind !== 'road');
    expect(watched.length).toBeGreaterThan(0);
    const seen = new Map<Street, number[]>(watched.map((x) => [x, []]));
    for (let i = 0; i < 40; i++) {
      const stages = s.streetStages();
      for (const x of watched) seen.get(x)!.push(stages.get(x)!);
      s.advance(0.5);
    }
    for (const list of seen.values()) {
      for (let i = 1; i < list.length; i++) expect(list[i]).toBeGreaterThanOrEqual(list[i - 1]);
      expect(list.at(-1)!).toBeGreaterThanOrEqual(2);
    }
    // Every way is laid as a footpath: a fresh one is never already made up.
    const fresh = s.streets.filter((x) => x.kind !== 'road' && s.day - (x.born ?? 0) < STAGE.track);
    for (const x of fresh) expect(s.streetStages().get(x)).toBe(0);
  });

  it('no way is more made up than its town is big: a hamlet has no main street', () => {
    for (const days of [1, 3, 6, 12]) {
      const { s } = town(days);
      const n = s.towns[0].buildings.length;
      const cap = n < STAGE.trackAt ? 0 : n < STAGE.streetAt ? 1 : n < STAGE.mainAt ? 2 : 3;
      for (const [x, stage] of s.streetStages()) if (x.kind !== 'road') expect(stage).toBeLessThanOrEqual(cap);
    }
  });

  it('only a few ways become the main street: old, long streets', () => {
    const { topo, s } = town(30);
    const stages = s.streetStages();
    const own = s.streets.filter((x) => x.kind !== 'road' && x.kind !== 'square');
    const main = own.filter((x) => stages.get(x) === 3);
    expect(main.length).toBeGreaterThan(0);
    expect(main.length).toBeLessThan(own.length * 0.3);
    const length = (x: Street) => x.path.slice(1).reduce((l, v, i) => l + d3(P(topo, v), P(topo, x.path[i])), 0);
    for (const x of main) {
      expect(x.kind).toBe('street');
      expect(length(x)).toBeGreaterThanOrEqual(STAGE.mainLength);
      expect(s.day - x.born!).toBeGreaterThanOrEqual(STAGE.main);
    }
  });

  it('a way the water went over comes back washed out, and is walked again', () => {
    const { topo, s } = town(20);
    const way = s.streets.find((x) => x.kind === 'street' && s.streetStages().get(x)! >= 2)!;
    expect(way).toBeTruthy();
    const wet = new Uint8Array(topo.vertexCount);
    wet[way.path[1]] = 1;
    s.setWater(wet);
    s.setWater(new Uint8Array(topo.vertexCount));
    expect(s.streetStages().get(way)).toBe(0);
  });

  it('is drawn as it has worn: dotted, dashed, then two lines', () => {
    const { topo, s } = town(20);
    const look = lookOf(s), frames = squareFrames(topo, s.streets, s.towns, look);
    for (const [x, stage] of s.streetStages()) {
      if (x.kind === 'square' || x.kind === 'road') continue;
      const marks = streetMarks(topo, [x], s.buildings, frames, s, look);
      if (!marks.length) continue;
      const longest = Math.max(...marks.map((m) => m.length));
      if (stage === 0) expect(longest).toBeLessThan(0.004);
      else if (stage === 1) expect(longest).toBeLessThan(0.016);
      else expect(marks.length % 2).toBe(0); // its two sides
    }
  });
});

describe('people live there first', () => {
  it("a town's first building is a farmstead, and becomes the hall once the town has grown", () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap([0, 0, 1]);
    for (let i = 0; i < 40; i++) {
      expect(s.hallStands(0)).toBe(s.towns[0].buildings.length >= STAGE.hallAt);
      s.advance(0.1);
    }
    expect(s.hallStands(0)).toBe(true);
    const hall = s.buildings[0];
    expect(houseShape(hall, 2, false).long).toBeLessThan(houseShape(hall, 2, true).long);
  });

  it("before there's a square, the ways run in to the farmstead, and its houses are reached across the yard", () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap([0, 0, 1]);
    s.advance(1.5);
    expect(s.hallStands(0)).toBe(false);
    const look = lookOf(s), frames = squareFrames(topo, s.streets, s.towns, look);
    const f = frames.get(0)!;
    expect(f.open).toBe(false);
    const farm = P(topo, f.hall), reach = footprintRadius(s.buildings[0], look);
    const yard = yardPaths(topo, s.buildings, frames, look);
    expect(yard.length).toBeGreaterThan(0);
    // Each path ends at the farm's door.
    const ends = yard.map((m) => d3(m.points.subarray(m.points.length - 3), farm));
    expect(Math.min(...ends)).toBeLessThan(reach * 1.4);
    for (const x of s.streets.filter((y) => y.kind !== 'square' && (f.ring.has(y.path[0]) || f.ring.has(y.path.at(-1)!)))) {
      for (const m of streetMarks(topo, [x], s.buildings, frames, s, look)) {
        const e = [0, m.points.length - 3].map((k) => d3(m.points.subarray(k, k + 3), farm));
        expect(Math.min(...e)).toBeLessThan(f.radius * 0.8);
      }
    }
  });

  it('a house starts as a hut, and gets its wing only once it has stood a while', () => {
    const { s } = town(8);
    for (const b of s.buildings.filter((x) => x.order > 0)) {
      const stage = s.houseStage(b), age = s.day - b.born!;
      expect(stage === 0).toBe(age < STAGE.house);
      if (stage < 2) expect(houseShape(b, stage).wing).toBeNull();
      expect(houseShape(b, 0).long).toBeLessThan(houseShape(b, 1).long);
    }
  });

  it('growing up does not depend on how time was sliced', () => {
    const one = town(0), many = town(0);
    one.s.advance(10);
    for (let i = 0; i < 1000; i++) many.s.advance(0.01);
    expect(many.s.lookSignature()).toBeCloseTo(one.s.lookSignature(), 6);
    expect(many.s.blocks.map((k) => k.vertices.join(','))).toEqual(one.s.blocks.map((k) => k.vertices.join(',')));
  });
});

describe('terraces and blocks', () => {
  it("in the old core, a street's houses are built into rows that follow it, stop at a way that joins, and never cross a street", () => {
    const { topo, s } = town(24);
    const look = lookOf(s), frames = squareFrames(topo, s.streets, s.towns, look);
    const rows = terraceMarks(topo, s.streets, s.buildings, frames, look, s.spacing);
    expect(rows.marks.length).toBeGreaterThan(0);
    expect(rows.joined.size).toBeGreaterThanOrEqual(rows.marks.length * 2);
    for (const b of rows.joined) expect(s.houseStage(b)).toBe(3);
    // Clear of every street's drawn line, its own included: a street's line runs between its vertices.
    const lines = streetMarks(topo, s.streets, s.buildings, frames, s, look);
    for (const m of rows.marks) for (let k = 0; k < m.points.length; k += 3) {
      const q = m.points.subarray(k, k + 3);
      for (const l of lines) for (let j = 0; j < l.points.length; j += 3) expect(d3(q, l.points.subarray(j, j + 3))).toBeGreaterThan(0.0015);
    }
  });

  it('ground enclosed by streets is found as blocks, and a block keeps its stamp as time goes on', () => {
    const { s } = town(26);
    expect(s.blocks.length).toBeGreaterThan(0);
    const street = new Set(s.streets.flatMap((x) => x.path));
    for (const k of s.blocks) {
      for (const v of k.vertices) expect(street.has(v)).toBe(false);
      for (const v of k.ring) expect(street.has(v)).toBe(true);
    }
    const before = new Map(s.blocks.map((k) => [k.vertices.join(','), k.born]));
    s.advance(3);
    for (const k of s.blocks) {
      const was = before.get(k.vertices.join(','));
      if (was !== undefined) expect(k.born).toBe(was);
    }
  });

  it("an old block in the core is built round a courtyard, clear of the streets round it, and takes in the houses that stood there", () => {
    const { topo, s } = town(34);
    const look = lookOf(s);
    const courts = s.blocks.filter((k) => s.blockStage(k) === 2);
    expect(courts.length).toBeGreaterThan(0);
    const drawn = blockMarks(topo, courts, () => 2, s.buildings, s.streets, look);
    const walls = drawn.lines.filter((m) => m.fill);
    expect(walls.length).toBeGreaterThan(0);
    const street = s.streets.flatMap((x) => x.path).map((v) => P(topo, v));
    // A street's drawn line passes between its vertices, so measured from the segments.
    let nearest = Infinity;
    for (const m of walls) for (let k = 0; k < m.points.length; k += 3) {
      const q = m.points.subarray(k, k + 3);
      for (const x of s.streets) for (let i = 1; i < x.path.length; i++) {
        const a = P(topo, x.path[i - 1]), b = P(topo, x.path[i]);
        const ab = [0, 1, 2].map((j) => b[j] - a[j]), L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / L2));
        nearest = Math.min(nearest, d3(q, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
      }
    }
    void street;
    expect(nearest).toBeGreaterThan(BLOCK.gap * 0.5);
    for (const v of drawn.absorbed) expect(courts.some((k) => k.vertices.includes(v))).toBe(true);
  });
});
