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
    expect(WORLDS.map((w) => w.id)).toEqual(['ocean', 'moon', 'mars', 'ice']);
    expect(worldOf('moon').goal).toBe('basins');
    expect(worldOf('nowhere').id).toBe('ocean');
    expect(nextWorld(worldOf('ocean'))!.id).toBe('moon');
    expect(nextWorld(worldOf('moon'))!.id).toBe('mars');
    expect(nextWorld(worldOf('mars'))!.id).toBe('ice');
    expect(nextWorld(worldOf('ice'))).toBe(null);
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
    expect(pl.basins.length).toBe(4);
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

describe('an ice moon', () => {
  const ice = (ground?: Float32Array) => new Planet(topo, nearest(0, 0, 1), 5, worldOf('ice').rules, ground);

  it('is dry, cratered ice, and pouring water on it makes its surface new', () => {
    const pl = ice();
    expect(Math.min(...pl.rock)).toBeGreaterThan(0);
    expect(pl.covered).toBe(0);
    // Tipped, the water pours out and freezes over the old ice.
    const q = pl.plume;
    pl.gravity = { x: -q.x * 0.6 + 0.7, y: -q.y * 0.6, z: -q.z * 0.6 };
    run(pl, 90);
    expect(pl.covered).toBeGreaterThan(0.01);
  });
});

describe('past fires', () => {
  it('leave their ground for the next to rise through', () => {
    const first = new Planet(topo, nearest(0, 0, 1), 5, worldOf('mars').rules);
    for (let t = 0; t < 60; t += 1 / 20) { first.step(1 / 20); if (Math.round(t * 20) % 60 === 0) first.erupt(); }
    const left = first.rock.slice();
    const next = new Planet(topo, nearest(1, 0, 0), 9, worldOf('mars').rules, left);
    // The old mountain still stands (fresh craters aside), and the new fire's summit is measured where it is, not there.
    const at = first.plumeVertex;
    expect(next.rock[at]).toBeGreaterThan(worldOf('mars').rules.floor! + 0.1);
    expect(next.summit).toBeLessThan(first.summit * 0.5);
  });
});

describe('atolls', () => {
  it('in the long age an island sinks inside its reef, and a ring of coral is left round a lagoon', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3, worldOf('ocean').rules);
    pl.reserve = 0; pl.pressure = 0; // the fire is out
    // A living island: a dome 0.14 across, and reef in the shallows round it.
    const c = { x: 0.6, y: 0, z: 0.8 };
    const r = (v: number) => Math.hypot(p[v * 3] - c.x, p[v * 3 + 1] - c.y, p[v * 3 + 2] - c.z);
    for (let v = 0; v < topo.vertexCount; v++) {
      const d = r(v);
      if (d < 0.2) { pl.rock[v] = 0.12 * (1 - (d / 0.16) ** 2); pl.life[v] = 1; }
    }
    expect(pl.over).toBe(true);
    run(pl, 400);
    const ring: number[] = [], middle: number[] = [];
    for (let v = 0; v < topo.vertexCount; v++) {
      const d = r(v);
      if (d < 0.05) middle.push(pl.rock[v]);
      if (d > 0.13 && d < 0.19) ring.push(pl.rock[v]);
    }
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    // The middle has drowned; the rim stands at the surface, higher than the middle.
    expect(mean(middle)).toBeLessThan(-0.01);
    expect(Math.max(...ring)).toBeGreaterThan(-0.002);
    expect(Math.max(...ring)).toBeGreaterThan(mean(middle) + 0.02);
  });
});
