import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { STAGE, Settlements, type Street } from '../src/life/settlements';

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
  });

  it('a house starts as a hut, and grows only once it has stood a while', () => {
    const { s } = town(8);
    for (const b of s.buildings.filter((x) => x.order > 0)) {
      const stage = s.houseStage(b), age = s.day - b.born!;
      expect(stage === 0).toBe(age < STAGE.house);
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

});
