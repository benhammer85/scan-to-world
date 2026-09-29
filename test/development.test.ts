import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { GLOW, glowDensity, glowDots, glowField } from '../src/life/development';
import type { Building } from '../src/life/settlements';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 30).attributes.position.array, null);
const p = topo.positions;
const all = [...Array(topo.vertexCount).keys()];
const dist = (v: number, x: number, y: number, z: number) => Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z);
const house = (vertex: number, extra: Partial<Building> = {}): Building => ({ vertex, town: 0, order: 1, born: 0, ...extra });

describe('development as light', () => {
  // A town round the top of the world, and a lone farm by the equator.
  const town = all.filter((v) => dist(v, 0, 0, 1) < 0.1).map((v) => house(v));
  const farm = house(all.find((v) => dist(v, 1, 0, 0) < 0.04)!, { farm: true });
  const light = glowField(topo, [...town, farm], [], () => 3);

  it('is brightest at the core, and falls off with distance from it', () => {
    const at = (r: number) => { const vs = all.filter((v) => Math.abs(dist(v, 0, 0, 1) - r) < 0.02); return vs.reduce((s, v) => s + light[v], 0) / vs.length; };
    expect(at(0.02)).toBeGreaterThan(at(0.12));
    expect(at(0.12)).toBeGreaterThan(at(0.2));
    expect(at(0.5)).toBe(0);
  });

  it('a farm is a faint light, a town a bright one', () => {
    expect(light[farm.vertex]).toBeLessThan(light[town[0].vertex] / 3);
    expect(light[farm.vertex]).toBeGreaterThan(0);
  });

  it('is kept, not lost, as it spreads', () => {
    const total = light.reduce((s, x) => s + x, 0);
    const given = town.length * GLOW.stages[3] + GLOW.farm; // no hall among them: every house has order 1
    expect(total / given).toBeGreaterThan(0.9);
    expect(total / given).toBeLessThan(1.1);
  });

  it('draws the core nearly solid and the country empty, and the same dots every time', () => {
    expect(glowDensity(0)).toBe(0);
    expect(glowDensity(5)).toBeGreaterThan(0.95);
    const dots = glowDots(topo, light);
    let core = 0, far = 0;
    for (let i = 0; i < dots.length; i += 3) {
      const d = Math.hypot(dots[i], dots[i + 1], dots[i + 2] - 1);
      if (d < 0.06) core++; else if (d > 0.5 && Math.hypot(dots[i] - 1, dots[i + 1], dots[i + 2]) > 0.2) far++;
    }
    expect(core).toBeGreaterThan(50);
    expect(far).toBe(0);
    expect(glowDots(topo, light)).toEqual(dots);
  });
});
