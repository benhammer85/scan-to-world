import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { WATER, fill, findWater, seaFor, waterLines } from '../src/nature/water';
import { extractContours } from '../src/terrain/contours';
import { Settlements, streetVertices } from '../src/life/settlements';
import { TerrainEdits } from '../src/interact/sculpt';

function sphere(detail = 20) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return buildTopology(g.attributes.position.array, null);
}

/** Height 0.5 everywhere, with a round hollow of `depth` at +z and a single lowest point at -z (the drain). */
function withHollow(depth = 0.2, width = 0.25) {
  const topo = sphere();
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const z = topo.positions[v * 3 + 2];
    const r = Math.acos(Math.min(1, z)); // angle from +z
    h[v] = 0.5 - depth * Math.max(0, 1 - (r / width) ** 2);
  }
  // A drain on the far side: the vertex nearest -z, lowest of all.
  let drain = 0;
  for (let v = 1; v < topo.vertexCount; v++) if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
  h[drain] = 0;
  return { topo, h };
}

describe('water', () => {
  it('a hollow fills, and nothing else does', () => {
    const { topo, h } = withHollow();
    const w = findWater(topo, h);
    expect(w.lakes).toBe(1);
    for (let v = 0; v < topo.vertexCount; v++) {
      const inHollow = Math.acos(Math.min(1, topo.positions[v * 3 + 2])) < 0.25;
      if (w.wet[v]) expect(inHollow).toBe(true);
    }
  });

  it('a lake is level, and stands at the height where it would spill', () => {
    const { topo, h } = withHollow();
    const w = findWater(topo, h);
    const levels = new Set<number>();
    for (let v = 0; v < topo.vertexCount; v++) if (w.wet[v]) levels.add(+w.level[v].toFixed(6));
    expect(levels.size).toBe(1);
    expect([...levels][0]).toBeCloseTo(0.5, 5); // the rim of the hollow
  });

  it('a hump holds no water, and a dimple too shallow or too small is not a lake', () => {
    const topo = sphere();
    const hump = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.2 * topo.positions[v * 3 + 2]);
    expect(findWater(topo, hump).lakes).toBe(0);
    expect(findWater(topo, withHollow(WATER.minDepth * 0.5).h).lakes).toBe(0);
    expect(findWater(topo, withHollow(0.2, 0.02).h).lakes).toBe(0);
  });

  it('the level never lies below the ground', () => {
    const { topo, h } = withHollow();
    const l = fill(topo, h);
    for (let v = 0; v < topo.vertexCount; v++) expect(l[v]).toBeGreaterThanOrEqual(h[v]);
  });

  it('the drawn shore is the edge of the wet mask: every shore point lies between wet and dry', () => {
    const { topo, h } = withHollow();
    const w = findWater(topo, h);
    const lines = waterLines(topo, w, 0);
    const shore = lines.filter((l) => l.level === 0);
    expect(shore.length).toBe(1);
    expect(shore[0].closed).toBe(true);
    // Every shore point is within one mesh edge of both a wet and a dry vertex.
    const P = topo.positions;
    for (let k = 0; k < shore[0].points.length; k += 3) {
      let wet = Infinity, dry = Infinity;
      for (let v = 0; v < topo.vertexCount; v++) {
        const d = Math.hypot(P[v * 3] - shore[0].points[k], P[v * 3 + 1] - shore[0].points[k + 1], P[v * 3 + 2] - shore[0].points[k + 2]);
        if (w.wet[v]) wet = Math.min(wet, d); else dry = Math.min(dry, d);
      }
      expect(Math.max(wet, dry)).toBeLessThan(0.07);
    }
    expect(lines.length).toBeGreaterThan(1); // and depth lines inside it
  });

  it('pressing into the ground makes a lake there', () => {
    const topo = sphere();
    const base = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.3 * topo.positions[v * 3 + 2]);
    const level = seaFor(topo, base);
    expect(findWater(topo, base, level).lakes).toBe(0);
    const edits = new TerrainEdits(topo);
    edits.brush([0, 0, 1], { radius: 0.3, strength: -0.3, falloff: 'gaussian' }, 1);
    const h = base.map((x, v) => x + edits.field[v]);
    const w = findWater(topo, h, level);
    expect(w.lakes).toBe(1);
  });

  it('towns keep out of the water: no house, street or square on it', () => {
    const { topo, h } = withHollow(0.2, 0.35);
    const w = findWater(topo, h);
    const s = new Settlements(topo, h);
    s.setWater(w.wet);
    // Found beside the lake, and grow.
    s.tap([0.55, 0, 0.83]);
    s.advance(14);
    expect(s.buildings.length).toBeGreaterThan(10);
    for (const b of s.buildings) expect(w.wet[b.vertex]).toBe(0);
    for (const st of s.streets) for (const v of streetVertices(st)) expect(w.wet[v]).toBe(0);
  });
});

describe('the sea', () => {
  it('a planet has a sea over its lowest ground, set from the scan, and it stays put', () => {
    const topo = sphere();
    const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.3 * topo.positions[v * 3 + 2]);
    const w = findWater(topo, h, seaFor(topo, h));
    expect(w.share).toBeGreaterThan(WATER.seaShare * 0.8);
    expect(w.share).toBeLessThan(WATER.seaShare * 1.2);
    for (let v = 0; v < topo.vertexCount; v++) if (w.wet[v]) expect(topo.positions[v * 3 + 2]).toBeLessThan(0);
  });

  it('a pit dug deeper than the sea, inland, still fills: it becomes a lake, not a new drain', () => {
    const topo = sphere();
    const base = new Float32Array(topo.vertexCount).map((_, v) => 0.5 + 0.3 * topo.positions[v * 3 + 2]);
    const level = seaFor(topo, base);
    const edits = new TerrainEdits(topo);
    edits.brush([0, 0, 1], { radius: 0.3, strength: -1.2, falloff: 'gaussian' }, 1); // far below sea level
    const h = base.map((x, v) => x + edits.field[v]);
    const w = findWater(topo, h, level);
    expect(w.lakes).toBe(1);
    // And the sea is where it was.
    const before = findWater(topo, base, level);
    for (let v = 0; v < topo.vertexCount; v++) if (before.sea[v]) expect(w.sea[v]).toBe(1);
  });
});

describe('the map under water', () => {
  it('land contours stop at the shore: none runs across water', () => {
    const { topo, h } = withHollow(0.3, 0.4);
    const w = findWater(topo, h);
    const P = topo.positions;
    // Points of a line well inside the lake: no dry vertex within one edge.
    const inside = (lines: ReturnType<typeof extractContours>) => {
      let n = 0;
      for (const l of lines) for (let k = 0; k < l.points.length; k += 3) {
        let dryNear = false;
        for (let v = 0; v < topo.vertexCount && !dryNear; v++) {
          if (w.wet[v]) continue;
          if (Math.hypot(P[v * 3] - l.points[k], P[v * 3 + 1] - l.points[k + 1], P[v * 3 + 2] - l.points[k + 2]) < 0.07) dryNear = true;
        }
        if (!dryNear) n++;
      }
      return n;
    };
    expect(inside(extractContours(topo, h, { interval: 0.05, lift: 0, mask: w.wet }))).toBe(0);
    // And the mask is what does it: without it, the hollow's contours run right across the lake.
    // (Counting lines instead said the opposite: masking cuts rings at the shore, so there are more pieces.)
    expect(inside(extractContours(topo, h, { interval: 0.05, lift: 0 }))).toBeGreaterThan(20);
  });
});
