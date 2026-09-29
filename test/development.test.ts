import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { DEVELOPMENT, developedGround, developmentOutline, takenDots } from '../src/life/development';
import { stippleDots } from '../src/render/stipple';

function sphere() {
  const g = new THREE.IcosahedronGeometry(1, 30);
  return buildTopology(g.attributes.position.array, null);
}

describe('development', () => {
  const topo = sphere();
  const p = topo.positions;
  const near = (v: number, x: number, y: number, z: number, r: number) => Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z) < r;
  const all = [...Array(topo.vertexCount).keys()];
  // A settlement round the top of the world.
  const built = all.filter((v) => near(v, 0, 0, 1, 0.12));

  it('takes the ground round what is built, and not ground far from it', () => {
    const ground = developedGround(topo, built, () => true);
    for (const v of built.filter((u) => near(u, 0, 0, 1, 0.08))) expect(ground[v]).toBe(1);
    for (const v of all.filter((u) => !near(u, 0, 0, 1, 0.12 + DEVELOPMENT.reach + 0.05))) expect(ground[v]).toBe(0);
  });

  it('draws one fine outline round it, not one round every speck', () => {
    const ground = developedGround(topo, [...built, all.find((v) => near(v, 1, 0, 0, 0.05))!], () => true);
    const lines = developmentOutline(topo, (v) => ground[v] === 1);
    expect(lines).toHaveLength(1); // the lone speck by the equator is too small to outline
    expect(lines[0].closed).toBe(true);
  });

  it('dots the taken ground lightly, and what is built densely', () => {
    const ground = developedGround(topo, built, () => true);
    const light = takenDots(topo, (v) => ground[v] === 1).length / 3;
    expect(light).toBeGreaterThan(0);
    const square = [0, 0, 0, 0.1, 0, 0, 0.1, 0.1, 0, 0, 0, 0, 0.1, 0.1, 0, 0, 0.1, 0];
    expect(stippleDots(square, DEVELOPMENT.core).length).toBeGreaterThan(stippleDots(square, DEVELOPMENT.field).length * 10);
  });

  it('puts the same dots in the same places every time, so a growing town never shimmers', () => {
    const square = [0, 0, 0, 0.03, 0, 0, 0.03, 0.03, 0];
    expect(stippleDots(square)).toEqual(stippleDots(square));
  });
});
