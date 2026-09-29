import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology, type Topology } from '../src/mesh/topology';
import { findWater, seaFor } from '../src/nature/water';
import { BRIDGE, HARBOUR, Settlements, streetVertices } from '../src/life/settlements';
import { harbourMarks } from '../src/life/buildingMarks';

function sphere(detail = 24): Topology {
  const g = new THREE.IcosahedronGeometry(1, detail);
  return buildTopology(g.attributes.position.array, null);
}

function settle(topo: Topology, h: Float32Array, sites: number[][], days: number, useSea = true) {
  const w = findWater(topo, h, useSea ? seaFor(topo, h) : undefined);
  const s = new Settlements(topo, h);
  s.setWater(w.wet, w.depth);
  for (const site of sites) s.tap(site);
  s.advance(days);
  return { s, w };
}

/** Flat ground with a round lake at +z, and a drain far away. */
function lakeWorld() {
  const topo = sphere();
  const h = new Float32Array(topo.vertexCount);
  let drain = 0;
  for (let v = 0; v < topo.vertexCount; v++) {
    const r = Math.acos(Math.min(1, topo.positions[v * 3 + 2]));
    h[v] = 0.5 - 0.25 * Math.max(0, 1 - (r / 0.3) ** 2);
    if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
  }
  h[drain] = 0;
  return { topo, h };
}

/** A strait (a groove of water) along x = 0, `width` wide, with land either side. */
function straitWorld(width: number) {
  const topo = sphere();
  const h = new Float32Array(topo.vertexCount).map((_, v) => 0.5 - 0.3 * Math.max(0, 1 - (topo.positions[v * 3] / (width / 2)) ** 2));
  return { topo, h };
}

describe('harbours', () => {
  it('a town on the water gets a harbour: a pier from its shore street out into deeper water', () => {
    const { topo, h } = lakeWorld();
    const { s, w } = settle(topo, h, [[0.5, 0, 0.87]], 16, false);
    expect(s.standing - 1).toBeGreaterThanOrEqual(HARBOUR.at);
    expect(s.harbours).toHaveLength(1);
    const pier = s.harbours[0].pier;
    expect(w.wet[pier[0]]).toBe(0); // it starts on the shore
    expect(s.streets.some((st) => streetVertices(st).includes(pier[0]))).toBe(true); // at a street
    for (const v of pier.slice(1)) expect(w.wet[v]).toBe(1); // and runs out over the water
    for (let i = 2; i < pier.length; i++) expect(w.depth[pier[i]]).toBeGreaterThanOrEqual(w.depth[pier[i - 1]] - 1e-6);
    const marks = harbourMarks(topo, s.harbours, (x) => s.boatsAt(x));
    expect(marks.length).toBeGreaterThanOrEqual(3); // two rails and a head, at least
  });

  it('a town away from water gets none', () => {
    const { topo, h } = lakeWorld();
    const { s } = settle(topo, h, [[0, 0, -0.5].map((x, i) => (i === 1 ? 0.86 : x))], 16, false);
    expect(s.standing - 1).toBeGreaterThanOrEqual(HARBOUR.at);
    expect(s.harbours).toHaveLength(0);
  });
});

describe('bridges', () => {
  it('towns either side of a narrow strait are joined by a road that bridges it', () => {
    const { topo, h } = straitWorld(0.1);
    const { s, w } = settle(topo, h, [[-0.3, 0, 0.95], [0.3, 0, 0.95]], 10);
    const road = s.streets.find((st) => st.kind === 'road');
    expect(road).toBeDefined();
    const overWater = road!.path.filter((v) => w.wet[v]);
    expect(overWater.length).toBeGreaterThan(0);
    for (const v of overWater) expect(s.bridgeAt.has(v)).toBe(true);
  });

  it('nothing bridges water wider than a bridge can span', () => {
    const { topo, h } = straitWorld(BRIDGE.span * 2.5);
    const { s, w } = settle(topo, h, [[-0.4, 0, 0.92], [0.4, 0, 0.92]], 10);
    for (const st of s.streets) for (const v of st.path) expect(w.wet[v]).toBe(0);
  });

  it('no street stands in water except as a bridge', () => {
    const { topo, h } = straitWorld(0.1);
    const { s, w } = settle(topo, h, [[-0.3, 0, 0.95], [0.3, 0, 0.95]], 14);
    for (const st of s.streets) for (const v of st.path) if (w.wet[v]) expect(s.bridgeAt.has(v)).toBe(true);
  });
});

describe('floods', () => {
  function flooded() {
    const topo = sphere();
    const flat = new Float32Array(topo.vertexCount).fill(0.5);
    let drain = 0;
    for (let v = 0; v < topo.vertexCount; v++) if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
    flat[drain] = 0;
    const { s } = settle(topo, flat, [[0, 0, 1]], 12, false);
    const before = { all: s.buildings.length, standing: s.standing };
    const original = Float32Array.from(flat); // the settlements hold `flat` itself, and it is about to change
    // The ground sinks under the east side of the town.
    const sunk = flat.map((x, v) => x - 0.2 * Math.exp(-(((topo.positions[v * 3] - 0.15) ** 2 + topo.positions[v * 3 + 1] ** 2) / 0.006)));
    const w = findWater(topo, sunk);
    // The settlements keep reading the same array, so give it the new heights in place.
    (s as unknown as { heights: Float32Array }).heights.set(sunk);
    s.setWater(w.wet, w.depth);
    return { topo, flat: original, sunk, s, w, before };
  }

  it('water rising over houses drowns them: kept, not deleted, and off the ground', () => {
    const { s, w, before } = flooded();
    const drowned = s.buildings.filter((b) => b.state === 'drowned');
    expect(drowned.length).toBeGreaterThan(0);
    expect(s.buildings.length).toBe(before.all); // the record only grows
    for (const b of drowned) expect(w.wet[b.vertex]).toBe(1);
    for (const b of s.buildings) if (b.state === undefined) expect(w.wet[b.vertex]).toBe(0);
    expect(s.towns[0].rebuild).toBe(drowned.length);
  });

  it('the town rebuilds what it lost, on dry ground, faster than it grows', () => {
    const { s, w, before } = flooded();
    const lost = s.towns[0].rebuild;
    s.advance(lost / 4);
    expect(s.standing).toBeGreaterThanOrEqual(before.standing);
    for (const b of s.buildings) if (b.state === undefined) expect(w.wet[b.vertex]).toBe(0);
  });

  it('when the water goes down, drowned houses are ruins and their ground is free', () => {
    const { topo, flat, s } = flooded();
    const drownedAt = s.buildings.filter((b) => b.state === 'drowned').map((b) => b.vertex);
    (s as unknown as { heights: Float32Array }).heights.set(flat);
    const dry = findWater(topo, flat);
    s.setWater(dry.wet, dry.depth);
    for (const b of s.buildings) if (drownedAt.includes(b.vertex) && b.state !== undefined) expect(b.state).toBe('ruin');
    expect(s.buildings.some((b) => b.state === 'ruin')).toBe(true);
    // And the sunken streets are streets again.
    expect(s.submerged.size).toBe(0);
  });

  it('sunken streets leave the network: nothing is routed along them', () => {
    const { s, w } = flooded();
    expect(s.submerged.size).toBeGreaterThan(0);
    for (const v of s.submerged.keys()) expect(w.wet[v]).toBe(1);
    const before = s.streets.length;
    s.advance(4);
    for (const st of s.streets.slice(before)) for (const v of st.path) if (w.wet[v]) expect(s.bridgeAt.has(v)).toBe(true);
  });
});
