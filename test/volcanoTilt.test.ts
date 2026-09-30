import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet, VOLCANO } from '../src/volcano/sim';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 24).attributes.position.array, null);
const p = topo.basePositions;
const nearest = (x: number, y: number, z: number) => {
  let best = 0, bd = Infinity;
  for (let v = 0; v < topo.vertexCount; v++) { const d = Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
  return best;
};
const run = (pl: Planet, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) pl.step(1 / 30); };
/** Gravity tipped from straight down onto the vent (level, vent uppermost) by an angle towards +x. */
const tipped = (angle: number) => ({ x: Math.sin(angle), y: 0, z: -Math.cos(angle) });

describe('held like a globe', () => {
  it('level, the heat gathers and nothing pours', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3);
    pl.gravity = tipped(0);
    run(pl, 4);
    expect(pl.tip).toBeLessThan(0.05);
    expect(pl.pouring).toBe(false);
    expect(pl.pressure).toBeGreaterThan(3);
    expect(pl.molten).toBe(0);
  });

  it('tipped, it pours, and the pressure drains away', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3);
    pl.gravity = tipped(0);
    run(pl, 3);
    const built = pl.pressure;
    expect(built).toBeLessThan(VOLCANO.explosive);
    pl.gravity = tipped(0.6);
    run(pl, 3);
    expect(pl.pouring).toBe(true);
    expect(pl.pressure).toBeLessThan(built);
    expect(pl.tally.flows).toBe(1);
    expect(pl.tally.bursts).toBe(0);
  });

  it('tipped when it has built past the dashed ring, it bursts', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3);
    pl.gravity = tipped(0);
    pl.pressure = VOLCANO.explosive + 2;
    pl.gravity = tipped(0.6);
    pl.step(1 / 30);
    expect(pl.tally.bursts).toBe(1);
  });

  it('the lava runs the way the world is tipped', () => {
    const lean = (angle: number) => {
      const pl = new Planet(topo, nearest(0, 0, 1), 3);
      const before = Float32Array.from(pl.rock);
      pl.gravity = tipped(angle);
      pl.pressure = VOLCANO.explosive - 0.5;
      run(pl, 10);
      let sum = 0, weight = 0;
      for (let v = 0; v < pl.rock.length; v++) { const add = pl.rock[v] - before[v]; if (add > 0) { sum += add * p[v * 3]; weight += add; } }
      return sum / weight;
    };
    expect(lean(0.6)).toBeGreaterThan(0.02);
    expect(lean(-0.6)).toBeLessThan(-0.02);
  });

  it('the heat rises towards whatever is uppermost', () => {
    const pl = new Planet(topo, nearest(0, 0, 1), 3);
    pl.gravity = { x: -Math.sin(0.5), y: 0, z: -Math.cos(0.5) }; // uppermost is towards +x
    run(pl, 20);
    expect(pl.plume.x).toBeGreaterThan(0.15);
  });
});
