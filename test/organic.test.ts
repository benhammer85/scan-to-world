import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { GROW, Settlements } from '../src/life/settlements';

/** A gentle swell of a world, as the settlements tests have it. */
function world() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) h[v] = 0.3 + 0.1 * topo.positions[v * 3 + 1];
  return { topo, h };
}

function grown(organic: boolean, days: number) {
  const { topo, h } = world();
  const s = new Settlements(topo, h);
  s.organic = organic;
  s.tap([0, 0, 1]);
  for (let d = 0; d < days; d += 0.5) s.advance(0.5);
  return { topo, s };
}

describe('organic growth', () => {
  const { topo, s } = grown(true, 40);
  const p = topo.positions;
  const dist = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);

  it('a grown place buds villages out along its ways, at irregular distances, never crowding it', () => {
    expect(s.towns.length).toBeGreaterThan(1);
    const home = s.towns[0];
    for (const t of s.towns.slice(1)) {
      const d = Math.min(...s.towns.filter((o) => o !== t && o.id < t.id).map((o) => dist(o.centre, t.centre)));
      expect(d).toBeGreaterThan(0.3);
    }
    expect(dist(s.towns[1].centre, home.centre)).toBeGreaterThanOrEqual(GROW.budNear - 1e-9);
    expect(dist(s.towns[1].centre, home.centre)).toBeLessThanOrEqual(GROW.budFar + 1e-9);
  });

  it('places come to unequal sizes: the first far outgrows its villages', () => {
    const sizes = s.towns.map((t) => t.buildings.length).sort((a, b) => b - a);
    expect(sizes[0]).toBeGreaterThan(sizes[sizes.length - 1] * 3);
  });

  it('grows raggedly, not as a disc: its edge reaches out further than a compact town of the same size', () => {
    const reach = (st: Settlements) => {
      const t = st.towns[0];
      const ds = t.buildings.map((v) => dist(v, t.centre)).sort((a, b) => a - b);
      return ds[Math.floor(ds.length * 0.95)] / Math.sqrt(ds.length);
    };
    const compact = grown(false, 25).s;
    expect(reach(s)).toBeGreaterThan(reach(compact));
  });

  it('grows the same way every time: nothing in it is left to Math.random', () => {
    const again = grown(true, 40).s;
    expect(again.buildings.map((b) => b.vertex)).toEqual(s.buildings.map((b) => b.vertex));
  });

  it('a tap near a place, not on it, draws the place that way rather than planting a farm', () => {
    const { s: t } = grown(true, 6);
    const town = t.towns[0], p0 = topo.positions;
    const c = [p0[town.centre * 3], p0[town.centre * 3 + 1], p0[town.centre * 3 + 2]];
    // A little way off the edge of what is built, towards +x.
    const far = Math.max(...town.buildings.map((v) => dist(v, town.centre)));
    const at = [c[0] + far + 0.07, c[1], c[2]];
    const r = t.tap(at);
    expect(r.kind).toBe('grew');
  });
});
