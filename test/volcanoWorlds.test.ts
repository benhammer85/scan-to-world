import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet } from '../src/volcano/sim';
import { Chain, CHAIN } from '../src/volcano/chain';
import { WORLDS, worldOf, nextWorld } from '../src/volcano/worlds';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
const p = topo.basePositions;
const nearest = (x: number, y: number, z: number) => {
  let best = 0, bd = Infinity;
  for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
  return best;
};
const run = (pl: Planet, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 20) pl.step(1 / 20); };

describe('the worlds', () => {
  it('come one after another, and each has its own aim', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['ocean', 'moon', 'mars']);
    expect(worldOf('moon').goal).toBe('basins');
    expect(worldOf('nowhere').id).toBe('ocean');
    expect(nextWorld(worldOf('ocean'))!.id).toBe('moon');
    expect(nextWorld(worldOf('moon'))!.id).toBe('mars');
    expect(nextWorld(worldOf('mars'))).toBe(null);
  });
});

describe('the ocean world', () => {
  it('carries the heat steadily round the world, one way', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    const chain = new Chain(pl.plume, pl.driftDirection);
    const at = (): number => chain.where(pl.plume).round;
    run(pl, 60);
    const a = at();
    run(pl, 60);
    expect(at()).toBeGreaterThan(a);
    expect(chain.where(pl.plume).off).toBeLessThan(0.02); // it keeps to the way
  });

  it('a stretch is held by life on or by the way, and the world is ringed when all are', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    const chain = new Chain(pl.plume, pl.driftDirection);
    expect(chain.update(pl, topo)).toBe(0);
    // Life all along the way.
    for (let v = 0; v < topo.vertexCount; v++) {
      if (chain.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] }).off < 0.05) { pl.life[v] = 1; pl.rock[v] = 0.05; }
    }
    expect(chain.update(pl, topo)).toBe(CHAIN.stretches);
    expect(chain.ringed).toBe(true);
    // One stretch lost, and it isn't.
    for (let v = 0; v < topo.vertexCount; v++) if (chain.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] }).round < 1 / CHAIN.stretches) pl.life[v] = 0;
    chain.update(pl, topo);
    expect(chain.ringed).toBe(false);
  });
});

describe('the Moon', () => {
  const moon = () => new Planet(topo, nearest(0, 0, 1), 5, worldOf('moon').rules);

  it('is dry highland scarred by great basins, with no life', () => {
    const pl = moon();
    expect(pl.basins.length).toBe(5);
    expect(Math.min(...pl.rock)).toBeGreaterThan(0); // no sea anywhere
    run(pl, 120);
    expect(pl.lifeShare()).toBe(0);
  });

  it('floods the basin its lava is poured into', () => {
    const pl = moon(), b = pl.basins[0];
    expect(pl.flooded(b)).toBe(0);
    for (let t = 0; t < 240; t += 1 / 20) {
      pl.callTo(b.x, b.y, b.z);
      pl.step(1 / 20);
      if (Math.round(t * 20) % 50 === 0) pl.erupt();
    }
    expect(pl.flooded(b)).toBeGreaterThan(0.5);
  });
});

describe('Mars', () => {
  const mars = () => new Planet(topo, nearest(0, 0, 1), 5, worldOf('mars').rules);

  it('keeps its heat in one place, and the mountain rises over it', () => {
    const pl = mars(), start = { ...pl.plume };
    const low = pl.summit;
    for (let t = 0; t < 120; t += 1 / 20) { pl.step(1 / 20); if (Math.round(t * 20) % 60 === 0) pl.erupt(); }
    expect(pl.plume.x).toBeCloseTo(start.x, 6);
    expect(pl.plume.y).toBeCloseTo(start.y, 6);
    expect(pl.plume.z).toBeCloseTo(start.z, 6);
    expect(pl.summit).toBeGreaterThan(low + 0.1);
  });

  it('dust storms come, seen rising first, and wear the heights while they blow', () => {
    // Two worlds alike in everything but the storms' wear: the one the storms wear ends lower.
    const worn = mars(), calm = new Planet(topo, nearest(0, 0, 1), 5, { ...worldOf('mars').rules, stormWear: 0 });
    let warned = false, blew = false;
    for (let t = 0; t < 260; t += 1 / 20) {
      for (const pl of [worn, calm]) { pl.step(1 / 20); if (Math.round(t * 20) % 60 === 0) pl.erupt(); }
      if (worn.stormComing !== null) warned = true;
      if (worn.storm) blew = true;
      if (blew && !worn.storm) break;
    }
    expect(warned).toBe(true);
    expect(blew).toBe(true);
    expect(worn.summit).toBeLessThan(calm.summit);
  });
});
