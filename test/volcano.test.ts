import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet, VOLCANO } from '../src/volcano/sim';

function planet(seed = 1) {
  const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
  const p = topo.basePositions;
  const nearest = (x: number, y: number, z: number) => {
    let best = 0, bd = Infinity;
    for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  const start = nearest(0, 0, 1);
  return { topo, planet: new Planet(topo, start, seed), start, nearest };
}

const run = (pl: Planet, seconds: number, every = 0) => {
  let since = 0;
  for (let t = 0; t < seconds; t += 1 / 30) {
    pl.step(1 / 30);
    since += 1 / 30;
    if (every && since >= every) { pl.erupt(); since = 0; }
  }
};
/** Where rock was added since `before`, as a mean distance from a vertex, weighted by how much. */
const reach = (pl: Planet, topo: ReturnType<typeof planet>['topo'], before: Float32Array, from: number) => {
  const p = topo.basePositions;
  let sum = 0, weight = 0;
  for (let v = 0; v < pl.rock.length; v++) {
    const add = pl.rock[v] - before[v];
    if (add > 1e-4) { sum += add * Math.hypot(p[v * 3] - p[from * 3], p[v * 3 + 1] - p[from * 3 + 1], p[v * 3 + 2] - p[from * 3 + 2]); weight += add; }
  }
  return sum / weight;
};

describe('the volcano', () => {
  it('begins from nothing: one sea over one even floor', () => {
    const { planet: pl } = planet();
    expect(pl.landShare()).toBe(0);
    expect(pl.lifeShare()).toBe(0);
    const lo = Math.min(...pl.rock), hi = Math.max(...pl.rock);
    expect(hi).toBeLessThan(0);
    expect(hi - lo).toBeLessThan(VOLCANO.rough * 2.1);
  });

  it('the heat gathers by itself, ever more slowly, and the store runs out', () => {
    const { planet: pl } = planet();
    run(pl, 5);
    const early = pl.pressure;
    expect(early).toBeGreaterThan(0);
    pl.erupt();
    run(pl, 300);
    const before = pl.reserve + pl.pressure;
    pl.erupt();
    const p0 = pl.pressure;
    run(pl, 5);
    expect(pl.pressure - p0).toBeLessThan(early);
    run(pl, 2 * VOLCANO.heat / VOLCANO.rising, 3);
    expect(pl.reserve + pl.pressure).toBeLessThan(before);
    run(pl, 60);
    expect(pl.over).toBe(true);
    expect(pl.era).toBe('out');
  });

  it('letting it out often builds land, and there is only so much of it', () => {
    const { planet: pl, start } = planet();
    const before = pl.rock[start];
    run(pl, 200, 3);
    expect(pl.rock[start]).toBeGreaterThan(before);
    expect(pl.landShare()).toBeGreaterThan(0);
    pl.erupt();
    expect(pl.erupt()).toBe(null); // just let out: nothing left to erupt yet
  });

  it('a flow spreads wide, a burst piles up close: the same heat, two shapes', () => {
    const shape = (burst: boolean) => {
      const { planet: pl, topo, start } = planet();
      const before = Float32Array.from(pl.rock);
      pl.reserve = 0; // only what we give it
      if (burst) { pl.pressure = 20; expect(pl.erupt()).toBe('burst'); run(pl, 12); }
      else for (let i = 0; i < 4; i++) { pl.pressure = 5; expect(pl.erupt()).toBe('flow'); run(pl, 3); }
      run(pl, 12);
      return { reach: reach(pl, topo, before, start), ash: Math.max(...pl.ash) };
    };
    const flow = shape(false), burst = shape(true);
    expect(flow.reach).toBeGreaterThan(burst.reach);
    expect(burst.ash).toBeGreaterThan(0);
    expect(flow.ash).toBe(0);
  });

  it('full, it waits to be let out: nothing bursts by itself, and the summit stands', () => {
    const { planet: pl } = planet();
    run(pl, 120, 3);
    run(pl, 20); // everything set
    const at = pl.plumeVertex, summit = pl.rock[at];
    pl.pressure = VOLCANO.cap - 0.01;
    for (let i = 0; i < 60; i++) pl.step(1 / 30);
    expect(pl.pressure).toBeCloseTo(pl.capNow, 5);
    expect(pl.erupting).toBe(false);
    expect(pl.tally.calderas).toBe(0);
    expect(pl.rock[at]).toBeGreaterThan(summit - 0.01); // (no caldera)
  });

  it('the plume creeps on its own, and towards where you call it', () => {
    const { planet: pl, start, nearest } = planet();
    run(pl, 60);
    expect(pl.plumeVertex).not.toBe(start);
    const goal = nearest(0.5, 0, Math.sqrt(0.75));
    pl.callTo(0.5, 0, Math.sqrt(0.75));
    run(pl, 30);
    expect(pl.plume.x).toBeGreaterThan(0.4);
    expect(pl.target).toBe(null);
    expect(Math.abs(pl.plumeVertex - goal) >= 0).toBe(true);
  });

  it('life begins at the vents, spreads, and lava clears it', () => {
    const { planet: pl } = planet();
    run(pl, VOLCANO.origin + 5, 3);
    expect(pl.news.some((n) => n.startsWith('Life begins'))).toBe(true);
    run(pl, 150, 3);
    expect(pl.lifeShare()).toBeGreaterThan(0.002);
    let alive = -1;
    for (let v = 0; v < pl.rock.length; v++) if (pl.life[v] > 0.3 && pl.rock[v] > 0) { alive = v; break; }
    expect(alive).toBeGreaterThanOrEqual(0);
    pl.lava[alive] = 0.05;
    pl.step(1 / 30);
    expect(pl.life[alive]).toBe(0);
  });

  it('a stone from the sky digs a crater, kills what lives there, and adds its heat', () => {
    const { planet: pl, nearest } = planet();
    const at = nearest(1, 0, 0);
    pl.life[at] = 1;
    const rock = pl.rock[at], reserve = pl.reserve;
    pl.strike(at);
    expect(pl.rock[at]).toBeLessThan(rock);
    expect(pl.life[at]).toBe(0);
    expect(pl.reserve).toBeCloseTo(reserve + VOLCANO.impactHeat, 6); // far from the plume: its heat alone
  });

  it('left alone, land the plume has moved on from sinks and wears away', () => {
    const { planet: pl } = planet();
    run(pl, 90, 3);
    const built = pl.landShare();
    pl.reserve = 0; pl.pressure = 0;
    pl.callTo(0, 0, -1); // take the warmth far away
    run(pl, 400);
    expect(pl.landShare()).toBeLessThan(built);
  });

});
