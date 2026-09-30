import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet } from '../src/volcano/sim';
import { worldOf } from '../src/volcano/worlds';
import { measureSecond, ATOLL_ISLAND } from '../src/volcano/second';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
const p = topo.basePositions, n = topo.vertexCount, scale = n / 16002;
const near = (v: number, c: { x: number; y: number; z: number }, r: number) => Math.hypot(p[v * 3] - c.x, p[v * 3 + 1] - c.y, p[v * 3 + 2] - c.z) < r;
const verts = (c: { x: number; y: number; z: number }, r: number) => Array.from({ length: n }, (_, v) => v).filter((v) => near(v, c, r));

describe('the second aims', () => {
  it('ocean: only big islands count as atolls to come', () => {
    const pl = new Planet(topo, 0, 1, worldOf('ocean').rules);
    const big = verts({ x: 0, y: 0, z: 1 }, 0.3), small = verts({ x: 1, y: 0, z: 0 }, 0.05);
    expect(big.length).toBeGreaterThan(ATOLL_ISLAND * scale);
    expect(small.length).toBeLessThan(ATOLL_ISLAND * scale);
    expect(measureSecond(worldOf('ocean'), pl, topo, [{ vertices: big }, { vertices: small }]).value).toBe(1);
  });

  it('Moon: lava spilled outside the basins lowers the share kept in them', () => {
    const pl = new Planet(topo, 0, 5, worldOf('moon').rules), b = pl.basins[0];
    for (const v of verts(b, b.r * 0.7)) pl.age[v] = 1;
    expect(measureSecond(worldOf('moon'), pl, topo, []).value).toBe(100);
    for (const v of verts({ x: -b.x, y: -b.y, z: -b.z }, b.r * 0.7)) pl.age[v] = 1;
    expect(measureSecond(worldOf('moon'), pl, topo, []).value).toBeLessThan(70);
  });

  it('Mars: a broad mountain has a wider base than a narrow one', () => {
    const w = worldOf('mars'), up = w.rules.floor! + 0.3;
    const narrow = new Planet(topo, 0, 5, w.rules), broad = new Planet(topo, 0, 5, w.rules), q = narrow.plume;
    for (const v of verts(q, 0.1)) narrow.rock[v] = up;
    for (const v of verts(q, 0.4)) broad.rock[v] = up;
    expect(measureSecond(w, broad, topo, []).value).toBeGreaterThan(measureSecond(w, narrow, topo, []).value * 2);
  });

  it('ice moon: one sheet counts for more than the same ice in pieces', () => {
    const w = worldOf('ice');
    const one = new Planet(topo, 0, 5, w.rules), pieces = new Planet(topo, 0, 5, w.rules);
    for (const v of verts({ x: 0, y: 0, z: 1 }, 0.5)) one.age[v] = 1;
    for (const c of [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }]) for (const v of verts(c, 0.25)) pieces.age[v] = 1;
    expect(measureSecond(w, one, topo, []).value).toBeGreaterThan(measureSecond(w, pieces, topo, []).value * 2);
  });
});
