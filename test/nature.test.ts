import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology, type Topology } from '../src/mesh/topology';
import { SNOW, STREAM, WATER, findWater, seaFor, streamPaths, waterLines } from '../src/nature/water';
import { Settlements, streetVertices } from '../src/life/settlements';
import { SAIL, boatPosition } from '../src/life/buildingMarks';

function sphere(detail = 24): Topology {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return buildTopology(g.attributes.position.array, null);
}

/** High at +y, low at -y, with gentle ripples so water has somewhere to gather. */
function slope() {
  const topo = sphere();
  const P = topo.positions;
  const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.4 * P[v * 3 + 1] + 0.03 * Math.sin(P[v * 3] * 9) * Math.cos(P[v * 3 + 2] * 7));
  return { topo, h, w: findWater(topo, h, seaFor(topo, h)) };
}

describe('streams', () => {
  it('streams form where enough ground drains, and run downhill to water', () => {
    const { w } = slope();
    const paths = streamPaths(w);
    expect(paths.length).toBeGreaterThan(0);
    for (const { path } of paths) {
      // Down the filled surface: a stream may cross a puddle too small to be a lake.
      for (let i = 1; i < path.length; i++) expect(w.filled[path[i]]).toBeLessThanOrEqual(w.filled[path[i - 1]] + 1e-6);
      const end = path[path.length - 1];
      expect(w.wet[end] || w.stream[end]).toBeTruthy(); // into water, or into another stream
    }
    for (let v = 0; v < w.stream.length; v++) if (w.stream[v]) expect(w.flow[v]).toBeGreaterThanOrEqual(STREAM.minArea);
  });

  it('water never runs in a circle: every vertex drains to the sea', () => {
    const { w } = slope();
    for (let v = 0; v < w.down.length; v += 37) {
      let u = v, steps = 0;
      while (w.down[u] >= 0 && steps <= w.down.length) { u = w.down[u]; steps++; }
      expect(steps).toBeLessThanOrEqual(w.down.length);
    }
  });

  it('towns build off streams, and cross them only by bridges', () => {
    const { topo, h, w } = slope();
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth, w.stream, w.snow);
    // Found on the lower slopes, near a stream if one is there.
    const P = topo.positions;
    let near = -1;
    for (let v = 0; v < w.stream.length; v++) if (w.stream[v] && P[v * 3 + 1] < 0.2 && P[v * 3 + 1] > -0.3 && P[v * 3 + 2] > 0) { near = v; break; }
    const site = near >= 0 ? [P[near * 3] + 0.12, P[near * 3 + 1], P[near * 3 + 2]] : [0, 0, 1];
    s.tap(site);
    s.advance(14);
    expect(s.standing).toBeGreaterThan(5);
    for (const b of s.buildings) if (b.state === undefined) expect(w.stream[b.vertex]).toBe(0);
    for (const st of s.streets) for (const v of streetVertices(st)) if (w.stream[v]) expect(s.bridgeAt.has(v)).toBe(true);
  });
});

describe('snow and ice', () => {
  it('snow lies on the highest ground, and melts into the streams', () => {
    const { topo, h, w } = slope();
    let snowy = 0;
    const area = new Float32Array(topo.vertexCount);
    for (let v = 0; v < topo.vertexCount; v++) if (w.snow[v]) snowy++;
    expect(snowy / topo.vertexCount).toBeGreaterThan(SNOW.share * 0.5);
    expect(snowy / topo.vertexCount).toBeLessThan(SNOW.share * 1.5);
    const snowline = seaFor(topo, h).snowline!;
    for (let v = 0; v < topo.vertexCount; v++) if (w.snow[v]) expect(h[v]).toBeGreaterThanOrEqual(snowline);
    // Snowmelt: a snowy summit with nothing above it still gives more than its own ground's worth.
    void area;
    let top = 0;
    for (let v = 1; v < topo.vertexCount; v++) if (h[v] > h[top]) top = v;
    expect(w.snow[top]).toBe(1);
    const own = w.flow[top];
    const bare = findWater(topo, h, { ...seaFor(topo, h), snowline: Infinity }).flow[top];
    expect(own).toBeCloseTo(bare * SNOW.melt, 6);
  });

  it('a lake above the snowline is ice: pale, and no depth lines', () => {
    const topo = sphere();
    const P = topo.positions;
    // High ground with a hollow at the summit, and a sea below.
    const h = new Float32Array(topo.vertexCount).map((_, v) => {
      const y = P[v * 3 + 1], r = Math.acos(Math.min(1, y));
      return 0.5 + 0.4 * y - 0.2 * Math.max(0, 1 - (r / 0.3) ** 2);
    });
    const w = findWater(topo, h, seaFor(topo, h));
    const icy = [...w.ice.keys()].filter((v) => w.ice[v]);
    expect(icy.length).toBeGreaterThan(0);
    for (const v of icy) expect(w.wet[v]).toBe(1);
    // Its only line is the shore: every line near the ice is a shore line.
    const lines = waterLines(topo, w, 0);
    for (const l of lines.filter((x) => x.level > 0)) {
      for (let k = 0; k < l.points.length; k += 3) {
        let best = 0, bd = Infinity;
        for (let v = 0; v < topo.vertexCount; v++) { const d = (P[v * 3] - l.points[k]) ** 2 + (P[v * 3 + 1] - l.points[k + 1]) ** 2 + (P[v * 3 + 2] - l.points[k + 2]) ** 2; if (d < bd) { bd = d; best = v; } }
        expect(w.ice[best]).toBe(0);
      }
    }
    expect(WATER.depthStep).toBeGreaterThan(0);
  });

  it('towns do not build on snow', () => {
    const { topo, h, w } = slope();
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth, w.stream, w.snow);
    s.tap([0, 0.75, 0.66]); // high on the slope, below the summit
    s.advance(14);
    for (const b of s.buildings) if (b.state === undefined) expect(w.snow[b.vertex]).toBe(0);
  });
});

describe('roads, harbours and ferries', () => {
  /** Flat ground with a round lake at +z, and a drain far away. */
  function lakeTowns() {
    const topo = sphere();
    const h = new Float32Array(topo.vertexCount);
    let drain = 0;
    for (let v = 0; v < topo.vertexCount; v++) {
      const r = Math.acos(Math.min(1, topo.positions[v * 3 + 2]));
      h[v] = 0.5 - 0.25 * Math.max(0, 1 - (r / 0.3) ** 2);
      if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
    }
    h[drain] = 0;
    const w = findWater(topo, h);
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth, w.stream, w.snow);
    s.tap([0.5, 0, 0.87]);
    s.tap([-0.5, 0, 0.87]);
    s.advance(16);
    return { topo, w, s };
  }

  it('two harbour towns are joined port to port', () => {
    const { s } = lakeTowns();
    expect(s.harbours).toHaveLength(2);
    const roots = s.harbours.map((h) => h.pier[0]);
    const port = s.streets.find((st) => st.kind === 'road' && roots.includes(st.path[0]) && roots.includes(st.path[st.path.length - 1]));
    expect(port).toBeDefined();
  });

  it('harbours on the same water get a ferry, all the way over water, pier end to pier end', () => {
    const { w, s } = lakeTowns();
    expect(s.ferries).toHaveLength(1);
    const f = s.ferries[0];
    for (const v of f.route) expect(w.wet[v]).toBe(1);
    expect(f.route[0]).toBe(s.harbours[f.from].pier.at(-1));
    expect(f.route.at(-1)).toBe(s.harbours[f.to].pier.at(-1));
    // Its boat is out sailing, not moored.
    expect(s.sailingFrom(f.from)).toBe(1);
  });

  it('the ferry boat sails: on the route, moving, and back again', () => {
    const { topo, s } = lakeTowns();
    const route = s.ferries[0].route;
    const P = topo.positions;
    const onRoute = (q: number[]) => Math.min(...route.map((v) => Math.hypot(P[v * 3] - q[0], P[v * 3 + 1] - q[1], P[v * 3 + 2] - q[2])));
    let L = 0;
    for (let i = 1; i < route.length; i++) L += Math.hypot(P[route[i] * 3] - P[route[i - 1] * 3], P[route[i] * 3 + 1] - P[route[i - 1] * 3 + 1], P[route[i] * 3 + 2] - P[route[i - 1] * 3 + 2]);
    const trip = L / SAIL.speed;
    const at = (t: number) => boatPosition(topo, route, t).at;
    const start = at(0), mid = at(trip / 2), far = at(trip + SAIL.dwell / 2), home = at(2 * trip + SAIL.dwell * 1.5);
    for (const q of [start, mid, far, home]) expect(onRoute(q)).toBeLessThan(0.06);
    expect(Math.hypot(mid[0] - start[0], mid[1] - start[1], mid[2] - start[2])).toBeGreaterThan(L * 0.2);
    expect(Math.hypot(far[0] - start[0], far[1] - start[1], far[2] - start[2])).toBeGreaterThan(Math.hypot(mid[0] - start[0], mid[1] - start[1], mid[2] - start[2]));
    expect(Math.hypot(home[0] - start[0], home[1] - start[1], home[2] - start[2])).toBeLessThan(0.02);
  });
});
