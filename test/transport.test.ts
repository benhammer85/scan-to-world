import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology, type Topology } from '../src/mesh/topology';
import { findWater, seaFor } from '../src/nature/water';
import { CABLE, RAIL, Settlements, TRADE } from '../src/life/settlements';
import { MOVE, movers } from '../src/life/buildingMarks';

function sphere(detail = 24): Topology {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return buildTopology(g.attributes.position.array, null);
}

/** Two towns on open ground: gently sloped along x so gradients mean something. */
function twoTowns(slope = 0.25) {
  const topo = sphere();
  const P = topo.positions;
  const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + slope * P[v * 3 + 1] * P[v * 3 + 1]);
  let drain = 0;
  for (let v = 0; v < topo.vertexCount; v++) if (P[v * 3 + 2] < P[drain * 3 + 2]) drain = v;
  h[drain] = 0;
  const w = findWater(topo, h);
  const s = new Settlements(topo, h);
  s.setWater(w.wet, w.depth, w.stream, w.snow);
  s.tap([-0.35, 0, 0.94]);
  s.tap([0.35, 0, 0.94]);
  return { topo, h, s };
}

describe('roads wear in', () => {
  it('a road starts as a track and is worn into a lane, then a made road, as trade grows, never back', () => {
    const { s } = twoTowns();
    const seen: number[] = [];
    for (let day = 0; day < 40; day++) {
      s.advance(1);
      const road = s.streets.find((x) => x.kind === 'road');
      if (road) seen.push(road.grade ?? 0);
    }
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(TRADE.road).toBeGreaterThan(TRADE.lane);
  });
});

describe('traffic', () => {
  it('busier roads carry more, and carts give way to cars as the world ages', () => {
    const { topo, s } = twoTowns();
    s.advance(12);
    const road = s.streets.find((x) => x.kind === 'road')!;
    const traffic = (t: number) => movers(topo, s, t).filter((m) => m.kind === 'cart' || m.kind === 'car');
    const roads = s.streets.filter((x) => x.kind === 'road');
    const before = traffic(10);
    expect(before.length).toBe(roads.reduce((n, r) => n + (r.grade ?? 0) + 1, 0));
    expect(before.every((m) => m.kind === 'cart')).toBe(true);
    void road;
    const size = (m: { points: Float32Array }) => Math.hypot(m.points[0] - m.points[24], m.points[1] - m.points[25], m.points[2] - m.points[26]);
    const cart = size(before[0]);
    s.advance(Math.max(0, MOVE.carsFrom - s.day + 1));
    const later = traffic(10);
    expect(later.every((m) => m.kind === 'car')).toBe(true);
    expect(size(later[0])).toBeGreaterThan(cart * 1.3); // a car is longer than a cart
  });

  it('traffic moves along its road', () => {
    const { topo, s } = twoTowns();
    s.advance(12);
    const road = s.streets.find((x) => x.kind === 'road')!;
    const P = topo.positions;
    const centre = (m: { points: Float32Array }) => [0, 1, 2].map((k) => { let t = 0; for (let i = k; i < m.points.length; i += 3) t += m.points[i]; return t / (m.points.length / 3); });
    const onRoad = (q: number[]) => Math.min(...road.path.map((v) => Math.hypot(P[v * 3] - q[0], P[v * 3 + 1] - q[1], P[v * 3 + 2] - q[2])));
    const first = (t: number) => movers(topo, s, t).filter((m) => m.kind === 'cart' || m.kind === 'car')[0];
    const a = centre(first(3)), b = centre(first(6));
    expect(onRoad(a)).toBeLessThan(0.06);
    expect(onRoad(b)).toBeLessThan(0.06);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.01);
  });
});

describe('railways', () => {
  it('big towns get a railway, and no house is built on the line', () => {
    const { s } = twoTowns(0.6);
    s.advance(60);
    const houses = (t: number) => s.buildings.filter((b) => b.town === t && b.state === undefined).length - 1;
    expect(Math.min(houses(0), houses(1))).toBeGreaterThanOrEqual(RAIL.at);
    expect(s.rails).toHaveLength(1);
    for (const b of s.buildings) if (b.state === undefined) expect(s.railAt.has(b.vertex)).toBe(false);
  });

  // The rule, measured on its own (whatwesaved PRINCIPLES.md, 13). Comparing a
  // town's railway with its road measured the town instead: the road is laid
  // early over open ground, the railway late, threading between everything
  // built since, and it read steeper (0.125 against 0.04) for that reason.
  it('a railway takes a gentler ruling gradient than a road would, over the same hill', () => {
    const topo = sphere();
    const P = topo.positions;
    // A ridge across the way from A to B, lower towards one side.
    const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.5 * Math.exp(-(P[v * 3] ** 2) / 0.01) * (1 + P[v * 3 + 1] * 3));
    const s = new Settlements(topo, h) as unknown as {
      railRoute(a: number, b: number): number[] | null;
      route(src: number[], t: (u: number) => boolean, reach: number, own: number, bridging: boolean): number[] | null;
    };
    const near = (q: number[]) => { let best = 0, bd = Infinity; for (let v = 0; v < topo.vertexCount; v++) { const d = (P[v * 3] - q[0]) ** 2 + (P[v * 3 + 1] - q[1]) ** 2 + (P[v * 3 + 2] - q[2]) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
    const A = near([-0.4, 0, 0.92]), B = near([0.4, 0, 0.92]);
    const rail = s.railRoute(A, B)!, road = s.route([A], (u) => u === B, 3.5, -1, true)!;
    const ruling = (path: number[]) => Math.max(...path.slice(1).map((v, i) => Math.abs(h[v] - h[path[i]]) / Math.hypot(P[v * 3] - P[path[i] * 3], P[v * 3 + 1] - P[path[i] * 3 + 1], P[v * 3 + 2] - P[path[i] * 3 + 2])));
    expect(rail).not.toBeNull();
    expect(road).not.toBeNull();
    expect(ruling(rail)).toBeLessThan(ruling(road) * 0.85);
  });
});

describe('fishing', () => {
  it('a harbour sends boats out to fishing grounds over water, and they come back', () => {
    const topo = sphere();
    const h = new Float32Array(topo.vertexCount);
    let drain = 0;
    for (let v = 0; v < topo.vertexCount; v++) {
      const r = Math.acos(Math.min(1, topo.positions[v * 3 + 2]));
      h[v] = 0.5 - 0.25 * Math.max(0, 1 - (r / 0.35) ** 2);
      if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
    }
    h[drain] = 0;
    const w = findWater(topo, h);
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth, w.stream, w.snow);
    s.tap([0.55, 0, 0.83]);
    s.advance(30);
    expect(s.harbours).toHaveLength(1);
    const routes = s.fishingRoutes(s.harbours[0]);
    expect(routes.length).toBeGreaterThan(0);
    const pierEnd = s.harbours[0].pier.at(-1);
    for (const r of routes) {
      expect(r[0]).toBe(pierEnd);
      for (const v of r) expect(w.wet[v]).toBe(1);
    }
    expect(s.mooredAt(s.harbours[0])).toBe(s.boatsAt(s.harbours[0]) - routes.length);
  });
});

describe('cable cars', () => {
  it('a grown town below the snow gets a cable line from its square up onto the snow', () => {
    const topo = sphere();
    const P = topo.positions;
    const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.4 * P[v * 3 + 1]);
    const sea = seaFor(topo, h);
    const w = findWater(topo, h, sea);
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth, w.stream, w.snow);
    // Found just below the snowline, facing the viewer.
    let site = 0, best = Infinity;
    for (let v = 0; v < topo.vertexCount; v++) {
      if (w.snow[v] || P[v * 3 + 2] < 0.3) continue;
      const d = sea.snowline! - h[v];
      if (d > 0.08 && d < best) { best = d; site = v; }
    }
    s.tap([P[site * 3], P[site * 3 + 1], P[site * 3 + 2]]);
    s.advance(20);
    expect(s.standing - 1).toBeGreaterThanOrEqual(CABLE.at);
    expect(s.cables).toHaveLength(1);
    const c = s.cables[0];
    const ring = s.streets.find((x) => x.kind === 'square')!.path;
    expect(ring).toContain(c.path[0]);
    expect(w.snow[c.path.at(-1)!]).toBe(1);
  });
});
