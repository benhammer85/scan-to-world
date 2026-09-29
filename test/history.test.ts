import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology, type Topology } from '../src/mesh/topology';
import { findWater } from '../src/nature/water';
import { HARBOUR, Settlements } from '../src/life/settlements';
import { COMMON, Countryside } from '../src/life/country';
import { ABBEY, CASTLE, CANAL, Landmarks } from '../src/life/landmarks';
import { springFlood, winter } from '../src/life/countryMarks';

function cliffWorld() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const x = topo.positions[v * 3], y = topo.positions[v * 3 + 1];
    h[v] = 0.3 + 0.1 * y + 0.6 / (1 + Math.exp(-(x - 0.3) * 60));
  }
  return { topo, h };
}

function grow(topo: Topology, h: Float32Array, sites: number[][], days: number) {
  const s = new Settlements(topo, h), c = new Countryside(topo, s, h), l = new Landmarks(topo, s, h, c);
  for (const x of sites) s.tap(x);
  const step = () => { s.advance(0.25); c.update(); l.update(); };
  for (let i = 0; i < days * 4; i++) step();
  return { s, c, l, step };
}

const d3 = (p: Float32Array, a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);

describe('commons and enclosure', () => {
  it('a town has its common, open and unbuilt, until it is big enough to enclose it', () => {
    const { topo, h } = cliffWorld();
    const { s, c, step } = grow(topo, h, [[0, 0, 1]], 2);
    const common = c.commons.get(0)!;
    expect(common).toBeDefined();
    const ground = new Set(c.land.cells[common.cell].vertices);
    for (let i = 0; i < 200 && common.enclosed === undefined; i++) {
      step();
      if (common.enclosed === undefined) for (const b of s.buildings) expect(ground.has(b.vertex)).toBe(false);
    }
    expect(common.enclosed).toBeDefined();
    expect(s.size(0)).toBeGreaterThanOrEqual(COMMON.enclose);
    expect(c.claims.get(common.cell)?.owner).toBe('t0'); // ruled into fields, the town's
  });

  it('a common somebody kept is never enclosed', () => {
    const { topo, h } = cliffWorld();
    const { s, c, step } = grow(topo, h, [[0, 0, 1]], 2);
    const common = c.commons.get(0)!;
    const v = c.land.cells[common.cell].vertices.find((u) => !c.townGround[u])!;
    expect(c.tap(v)).toBe('kept');
    for (let i = 0; i < 120; i++) step();
    expect(s.size(0)).toBeGreaterThan(COMMON.enclose);
    expect(common.enclosed).toBeUndefined();
    expect(c.claims.has(common.cell)).toBe(false);
  });
});

describe('castles, abbeys, canals', () => {
  it('an old town builds its castle on the top of the nearest high ground, and nothing is built on it', () => {
    const { topo, h } = cliffWorld();
    const { s, l, step } = grow(topo, h, [[0, 0, 1]], 16);
    expect(s.size(0)).toBeGreaterThanOrEqual(CASTLE.at);
    const k = l.castles.get(0)!;
    expect(k).toBeDefined();
    expect(d3(topo.positions, k.vertex, s.towns[0].centre)).toBeLessThan(CASTLE.reach + 1e-6);
    const before = new Set(s.buildings.map((b) => b.vertex));
    for (let i = 0; i < 40; i++) step();
    for (const b of s.buildings) if (!before.has(b.vertex)) expect(d3(topo.positions, b.vertex, k.vertex)).toBeGreaterThan(0.015);
  });

  it('the abbey stands apart from everyone, in a valley near a grown town', () => {
    const { topo, h } = cliffWorld();
    const { s, l } = grow(topo, h, [[0, 0, 1]], 12);
    expect(l.abbeys.length).toBe(1);
    const a = l.abbeys[0];
    const others = s.buildings.filter((b) => (b.born ?? 0) <= a.born);
    for (const b of others) expect(d3(topo.positions, b.vertex, a.vertex)).toBeGreaterThanOrEqual(ABBEY.apart);
  });

  it('two big towns are joined by a canal along the level', () => {
    const { topo, h } = cliffWorld();
    const { s, l } = grow(topo, h, [[0, 0, 1], [-0.1, -0.35, 0.93]], 22);
    if (s.size(0) < CANAL.at || s.size(1) < CANAL.at) return;
    const cn = l.canals[0];
    expect(cn).toBeDefined();
    expect(cn.path.length).toBeGreaterThan(2);
    for (let i = 1; i < cn.path.length; i++) expect(d3(topo.positions, cn.path[i - 1], cn.path[i])).toBeLessThan(0.1);
  });
});

describe('the passing of time', () => {
  it('a harbour silts up in time, whether or not its town is growing, and the next is built further along', () => {
    const g = new THREE.IcosahedronGeometry(1, 24);
    const topo = buildTopology(g.attributes.position.array, null);
    const h = new Float32Array(topo.vertexCount);
    let drain = 0;
    for (let v = 0; v < topo.vertexCount; v++) {
      const r = Math.acos(Math.min(1, topo.positions[v * 3 + 2]));
      h[v] = 0.5 - 0.25 * Math.max(0, 1 - (r / 0.3) ** 2);
      if (topo.positions[v * 3 + 2] < topo.positions[drain * 3 + 2]) drain = v;
    }
    h[drain] = 0;
    const w = findWater(topo, h);
    const s = new Settlements(topo, h);
    s.setWater(w.wet, w.depth);
    s.tap([0.5, 0, 0.87]);
    s.advance(16);
    expect(s.harbours).toHaveLength(1);
    const first = s.harbours[0];
    s.advance(HARBOUR.silt);
    expect(first.silted).toBeCloseTo((first.born ?? 0) + HARBOUR.silt, 6);
    const next = s.harbours.find((x) => x !== first);
    if (next) expect(d3(topo.positions, next.pier[0], first.pier[0])).toBeGreaterThanOrEqual(HARBOUR.apart);
  });

  it('the year has its winter and its spring floods, and they come round', () => {
    expect(winter(0)).toBeCloseTo(1, 6);
    expect(winter(4)).toBe(0);
    expect(winter(8)).toBeCloseTo(winter(0), 6);
    expect(Math.max(...[0.5, 1, 1.5, 2].map(springFlood))).toBeGreaterThan(0.5);
    expect(springFlood(5)).toBe(0);
  });
});
