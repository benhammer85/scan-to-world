import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet, VOLCANO } from '../src/volcano/sim';
import { Ecology, ECOLOGY, habitat } from '../src/volcano/ecology';
import { Islands } from '../src/volcano/islands';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
const p = topo.basePositions;
const nearest = (x: number, y: number, z: number) => {
  let best = 0, bd = Infinity;
  for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
  return best;
};
const within = (v: number, r: number) => {
  const out: number[] = [];
  for (let w = 0; w < topo.vertexCount; w++) if (Math.hypot(p[w * 3] - p[v * 3], p[w * 3 + 1] - p[v * 3 + 1], p[w * 3 + 2] - p[v * 3 + 2]) < r) out.push(w);
  return out;
};
const fresh = () => new Planet(topo, nearest(0, 0, 1), 3);

describe('the kinds of life, and the ground each needs', () => {
  it('each kind of ground holds its own kind', () => {
    const pl = fresh(), v = nearest(1, 0, 0), ring = within(v, 0.2);
    for (const w of ring) pl.rock[w] = 0.1; // an island, well above the sea
    expect(habitat(pl, topo, v)).toBe('forest');
    pl.rock[v] = 0.03; pl.ash[v] = 0; pl.rich[v] = 0;
    expect(habitat(pl, topo, v)).toBe('moss');
    pl.rich[v] = 1;
    expect(habitat(pl, topo, v)).toBe('meadow');
    pl.rock[v] = 0.2; pl.ash[v] = 1;
    expect(habitat(pl, topo, v)).toBe('heath');
    pl.rock[v] = -0.03;
    expect(habitat(pl, topo, v)).toBe('reef');
    pl.rock[v] = -0.2;
    expect(habitat(pl, topo, v)).toBe(null);
    // A low shore: just above the water, beside it.
    const shore = nearest(0, 1, 0), nb = topo.nbrList[topo.nbrOffsets[shore]];
    pl.rock[shore] = 0.01; pl.rock[nb] = -0.02;
    expect(habitat(pl, topo, shore)).toBe('mangrove');
  });

  it('a kind takes hold when it lives on enough of the world, and is counted as living', () => {
    const pl = fresh(), eco = new Ecology(pl, topo), v = nearest(1, 0, 0);
    for (const w of within(v, 0.25)) { pl.rock[w] = 0.1; pl.life[w] = 1; }
    eco.update(1);
    expect(eco.held).toContain('forest');
    expect(eco.living).toContain('forest');
    expect(pl.news.some((n) => n.includes('forest'))).toBe(true);
  });

  it('a wish is kept when its kind comes to live near it, and the fire stirs', () => {
    const pl = fresh(), eco = new Ecology(pl, topo), v = nearest(1, 0, 0);
    for (const w of within(v, 0.25)) { pl.rock[w] = 0.03; pl.life[w] = 1; } // moss everywhere
    eco.wish = { kind: 'forest', vertex: v, left: ECOLOGY.wishLasts };
    eco.update(1);
    expect(eco.kept).toBe(0);
    const heat = pl.reserve;
    for (const w of within(v, 0.1)) pl.rock[w] = 0.1; // high ground by the wish
    eco.update(1);
    expect(eco.kept).toBe(1);
    expect(eco.wish).toBe(null);
    expect(pl.reserve).toBe(heat + ECOLOGY.wishHeat);
  });
});

describe('the islands', () => {
  it('each island is found when it rises, and is still itself as it grows', () => {
    const isl = new Islands(topo), h = new Float32Array(topo.vertexCount).fill(-0.1);
    const a = nearest(1, 0, 0), b = nearest(-1, 0, 0);
    for (const w of within(a, 0.15)) h[w] = 0.05;
    for (const w of within(b, 0.15)) h[w] = 0.05;
    const named = isl.update(h, 1);
    expect(named.length).toBe(2);
    expect(named[0].id).not.toBe(named[1].id);
    const first = isl.list.find((i) => i.vertices.includes(a))!.id;
    for (const w of within(a, 0.3)) h[w] = 0.05; // it grows
    expect(isl.update(h, 2).length).toBe(0);
    expect(isl.list.find((i) => i.vertices.includes(a))!.id).toBe(first);
  });

  it('a rock too small to count is not an island', () => {
    const isl = new Islands(topo), h = new Float32Array(topo.vertexCount).fill(-0.1);
    h[nearest(0, 1, 0)] = 0.05;
    expect(isl.update(h, 1).length).toBe(0);
  });
});

describe('stones from the sky', () => {
  it('are seen coming well before they land', () => {
    const pl = fresh();
    pl.impact = null;
    for (let t = 0; t < 200 && !pl.impact; t += 0.5) pl.step(0.5);
    expect(pl.impact).not.toBe(null);
    expect(pl.impact!.in).toBeGreaterThan(10);
  });

  it('give far more heat if the plume is beneath them when they land', () => {
    const near = fresh(), far = fresh();
    const r0 = near.reserve;
    near.strike(near.plumeVertex);
    far.strike(nearest(0, 0, -1));
    expect(near.reserve - r0).toBeGreaterThan((far.reserve - r0) * 2);
    expect(near.tally.caught).toBe(1);
    expect(VOLCANO.caught).toBeGreaterThan(1);
  });
});
