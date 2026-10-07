import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet } from '../src/volcano/sim';
import { Ecology } from '../src/volcano/ecology';
import { snapshotOf, restoreInto } from '../src/volcano/save';

const topo = buildTopology(new THREE.IcosahedronGeometry(1, 16).attributes.position.array, null);
const run = (pl: Planet, eco: Ecology, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 20) { pl.step(1 / 20); if (Math.round(t * 20) % 20 === 0) eco.update(1); }
};
const SKIP = ['topo', 'next', 'firmness', 'scale', 'news'];

describe('keeping a world', () => {
  it('a world taken up again goes on exactly as the one that was kept', () => {
    const a = new Planet(topo, 0, 9), ea = new Ecology(a, topo);
    a.gravity = { x: 0.4, y: 0, z: -Math.sqrt(1 - 0.16) };
    run(a, ea, 60);
    // Through a structured clone, as IndexedDB keeps it.
    const kept = structuredClone({ planet: snapshotOf(a, SKIP), ecology: snapshotOf(ea, ['pl', 'topo', 'scale']) });
    const b = new Planet(topo, 0, 1), eb = new Ecology(b, topo);
    restoreInto(b, kept.planet, ['plume', 'tally', 'drift', 'wear']);
    restoreInto(eb, kept.ecology);
    expect(Array.from(b.rock)).toEqual(Array.from(a.rock));
    expect(b.pressure).toBe(a.pressure);
    run(a, ea, 20);
    run(b, eb, 20);
    expect(Array.from(b.rock)).toEqual(Array.from(a.rock));
    expect(Array.from(b.life)).toEqual(Array.from(a.life));
    expect(b.plume).toEqual(a.plume);
    expect(eb.kept).toBe(ea.kept);
  });
});
