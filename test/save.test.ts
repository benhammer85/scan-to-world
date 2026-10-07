import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Settlements } from '../src/life/settlements';
import { Countryside } from '../src/life/country';
import { Landmarks } from '../src/life/landmarks';
import { restoreInto, stateOf } from '../src/save';

function ground() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) h[v] = 0.3 + 0.1 * topo.positions[v * 3 + 1];
  return { topo, h };
}

function world(topo: ReturnType<typeof ground>['topo'], h: Float32Array) {
  const st = new Settlements(topo, h);
  st.organic = true;
  const c = new Countryside(topo, st, h);
  const lm = new Landmarks(topo, st, h, c);
  return { st, c, lm };
}

function grow(w: ReturnType<typeof world>, days: number) {
  for (let d = 0; d < days; d += 0.5) { w.st.advance(0.5); w.c.update(); w.lm.update(); }
}

const summary = (w: ReturnType<typeof world>) => ({
  day: w.st.day,
  buildings: w.st.buildings.map((b) => [b.vertex, b.town, b.order, b.born]),
  streets: w.st.streets.map((s) => [s.kind, s.path.join(',')]),
  towns: w.st.towns.map((t) => [t.centre, t.buildings.length]),
  claims: [...w.c.claims.keys()].sort((a, b) => a - b),
  planted: [...w.c.planted.keys()].sort((a, b) => a - b),
});

describe('keeping a world', () => {
  it('a world kept and brought back is the same world, and goes on growing exactly as the original does', () => {
    const { topo, h } = ground();
    const a = world(topo, h);
    a.st.tap([0, 0, 1]);
    a.st.tap([0.7, 0, 0.7]);
    grow(a, 20);

    // Kept as the browser keeps it: taken field by field, then structured-cloned.
    const ctx = [topo, h, a.st, a.c];
    const kept = structuredClone({ st: stateOf(a.st, ctx), c: stateOf(a.c, ctx), lm: stateOf(a.lm, ctx) });

    const b = world(topo, h);
    restoreInto(b.st, kept.st);
    restoreInto(b.c, kept.c);
    restoreInto(b.lm, kept.lm);
    expect(summary(b)).toEqual(summary(a));

    grow(a, 15);
    grow(b, 15);
    expect(summary(b)).toEqual(summary(a));
    // And a tap does the same in both.
    expect(b.st.tap([-0.7, 0, 0.7])).toEqual(a.st.tap([-0.7, 0, 0.7]));
  });

  it('keeps none of what a world is given to work on: the ground and the other simulations are its own', () => {
    const { topo, h } = ground();
    const a = world(topo, h);
    const ctx: unknown[] = [topo, h, a.st, a.c];
    for (const state of [stateOf(a.st, ctx), stateOf(a.c, ctx), stateOf(a.lm, ctx)]) {
      for (const v of Object.values(state)) expect(ctx.includes(v)).toBe(false);
    }
  });
});
