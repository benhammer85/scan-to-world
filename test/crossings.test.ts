import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology, type Topology } from '../src/mesh/topology';
import { findWater } from '../src/nature/water';
import { Settlements, streetVertices } from '../src/life/settlements';
import { CROSSING, crossingFrames, crossingMarks, movers } from '../src/life/buildingMarks';

function sphere(detail = 24): Topology {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return buildTopology(g.attributes.position.array, null);
}

function twoTowns(topo: Topology) {
  const P = topo.positions;
  const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.25 * P[v * 3 + 1] * P[v * 3 + 1]);
  let drain = 0;
  for (let v = 0; v < topo.vertexCount; v++) if (P[v * 3 + 2] < P[drain * 3 + 2]) drain = v;
  h[drain] = 0;
  const w = findWater(topo, h);
  const s = new Settlements(topo, h);
  s.setWater(w.wet, w.depth, w.stream, w.snow);
  s.tap([-0.35, 0, 0.94]);
  s.tap([0.35, 0, 0.94]);
  s.advance(60);
  return s;
}

/** Fewest-edges path between two vertices, for laying test ways by hand. */
function hops(topo: Topology, a: number, b: number): number[] {
  const prev = new Map<number, number>([[a, -1]]), queue = [a];
  for (let i = 0; i < queue.length && !prev.has(b); i++) {
    const u = queue[i];
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (!prev.has(w)) { prev.set(w, u); queue.push(w); }
    }
  }
  const path = [b];
  for (let v = b; prev.get(v)! >= 0; ) { v = prev.get(v)!; path.push(v); }
  return path.reverse();
}

function nearest(topo: Topology, q: number[]): number {
  const P = topo.positions;
  let best = 0, bd = Infinity;
  for (let v = 0; v < topo.vertexCount; v++) {
    const d = (P[v * 3] - q[0]) ** 2 + (P[v * 3 + 1] - q[1]) ** 2 + (P[v * 3 + 2] - q[2]) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

describe('level crossings', () => {
  it('rails and streets only ever meet at a shared vertex, and every one is a crossing', () => {
    const topo = sphere();
    const s = twoTowns(topo);
    expect(s.rails).toHaveLength(1);
    const adjacent = (a: number, b: number) => Array.from(topo.nbrList.subarray(topo.nbrOffsets[a], topo.nbrOffsets[a + 1])).includes(b);
    // Both run along mesh edges, so neither can pass the other between vertices.
    for (const r of s.rails) for (let i = 1; i < r.path.length; i++) expect(adjacent(r.path[i - 1], r.path[i])).toBe(true);
    for (const st of s.streets) {
      if (st.kind === 'square') continue;
      const p = streetVertices(st);
      for (let i = 1; i < p.length; i++) expect(adjacent(p[i - 1], p[i])).toBe(true);
    }
    // And every vertex they share, but the line's two stations, is a crossing.
    const onStreet = new Set(s.streets.filter((x) => x.kind !== 'square').flatMap((x) => streetVertices(x)));
    const shared = s.rails[0].path.slice(1, -1).filter((v) => onStreet.has(v));
    expect(new Set(s.crossings().map((c) => c.vertex))).toEqual(new Set(shared));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('each crossing is marked with gateposts', () => {
    const topo = sphere();
    const s = twoTowns(topo);
    const frames = crossingFrames(topo, s);
    expect(frames.length).toBeGreaterThan(0);
    expect(crossingMarks(frames)).toHaveLength(frames.length * 4);
  });

  it('the barriers come down when a train is near, and traffic waits: no car is ever on the line with a train', () => {
    const topo = sphere();
    const s = new Settlements(topo, new Float32Array(topo.vertexCount).fill(0.5));
    // A road east to west and a railway north to south, laid by hand to cross in the middle.
    const road = hops(topo, nearest(topo, [-0.25, 0, 0.97]), nearest(topo, [0.25, 0, 0.97]));
    const mid = road[Math.floor(road.length / 2)];
    const rail = [...hops(topo, nearest(topo, [0, -0.25, 0.97]), mid), ...hops(topo, mid, nearest(topo, [0, 0.25, 0.97])).slice(1)];
    const net = (s as unknown as { network: Map<number, number> }).network;
    for (const v of road) net.set(v, 0);
    s.streets.push({ path: road, town: 0, kind: 'road', grade: 2, joins: [0, 0] });
    s.rails.push({ from: 0, to: 0, path: rail });
    const frames = crossingFrames(topo, s);
    const crossing = frames.find((f) => f.vertex === mid)!;
    expect(crossing).toBeDefined();

    const delays = new Map<string, number>();
    const P = topo.positions;
    const at = [P[mid * 3], P[mid * 3 + 1], P[mid * 3 + 2]];
    const dist = (m: { points: Float32Array }) => {
      let x = 0, y = 0, z = 0;
      const n = m.points.length / 3;
      for (let i = 0; i < m.points.length; i += 3) { x += m.points[i]; y += m.points[i + 1]; z += m.points[i + 2]; }
      return Math.hypot(x / n - at[0], y / n - at[1], z / n - at[2]);
    };
    let closedFrames = 0, clash = 0;
    const dt = 0.05;
    for (let t = 0; t < 180; t += dt) {
      const ms = movers(topo, s, t, dt, delays, frames);
      // "On the line": within a sleeper's half-length and a car's.
      const onLine = 0.0045 + 0.004;
      const trainOn = ms.some((m) => m.kind === 'train' && dist(m) < onLine);
      if (ms.some((m) => m.kind === 'barrier')) closedFrames++;
      if (trainOn && ms.some((m) => (m.kind === 'car' || m.kind === 'cart') && dist(m) < onLine)) clash++;
    }
    expect(closedFrames).toBeGreaterThan(0); // the barriers did come down
    expect(clash).toBe(0); // and nothing was on the line with a train
    expect([...delays.values()].some((d) => d > 0)).toBe(true); // because somebody waited
    expect(CROSSING.stop).toBeLessThan(CROSSING.warn);
  });
});
