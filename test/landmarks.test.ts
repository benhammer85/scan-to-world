import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Settlements } from '../src/life/settlements';
import { Countryside, FIELD } from '../src/life/country';
import { CHURCH, Landmarks, WALL, landmarkMarks } from '../src/life/landmarks';
import { lookOf, squareFrames } from '../src/life/buildingMarks';
import { frameAt } from '../src/life/countryMarks';

function world() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const x = topo.positions[v * 3], y = topo.positions[v * 3 + 1];
    h[v] = 0.3 + 0.1 * y + 0.6 / (1 + Math.exp(-(x - 0.3) * 60));
  }
  return { topo, h };
}

function grow(days: number) {
  const { topo, h } = world();
  const s = new Settlements(topo, h), c = new Countryside(topo, s, h), l = new Landmarks(topo, s);
  s.tap([0, 0, 1]);
  const step = () => { s.advance(0.25); c.update(); l.update(); };
  for (let i = 0; i < days * 4; i++) step();
  return { topo, h, s, c, l, step };
}

describe('walls', () => {
  it('an old enough town is walled round its old town, and the wall stays where it was built', () => {
    const { topo, s, l, step } = grow(14);
    expect(s.size(0)).toBeGreaterThanOrEqual(WALL.at);
    const w = l.walls.get(0)!;
    expect(w).toBeDefined();
    const fr = frameAt(topo.normals, w.centre), p = topo.positions;
    const polar = (v: number) => {
      const d = [0, 1, 2].map((k) => p[v * 3 + k] - p[w.centre * 3 + k]);
      const x = d[0] * fr.ax[0] + d[1] * fr.ax[1] + d[2] * fr.ax[2], y = d[0] * fr.bx[0] + d[1] * fr.bx[1] + d[2] * fr.bx[2];
      return { a: Math.atan2(y, x), r: Math.hypot(x, y) };
    };
    const at = (a: number) => { const x = ((((a / (2 * Math.PI)) % 1) + 1) % 1) * 48, i = Math.floor(x) % 48, f = x - Math.floor(x); return w.radii[i] * (1 - f) + w.radii[(i + 1) % 48] * f; };
    for (const b of s.buildings.filter((x) => x.town === 0 && !x.farm && x.order < WALL.old)) {
      const q = polar(b.vertex);
      expect(q.r).toBeLessThan(at(q.a));
    }
    const radii = [...w.radii];
    for (let i = 0; i < 20; i++) step();
    expect(l.walls.get(0)!.radii).toEqual(radii);
  });

  it('comes down only once the town has long outgrown it', () => {
    const { s, l, step } = grow(14);
    for (let i = 0; i < 60; i++) {
      step();
      if (l.walls.get(0)?.gone !== undefined) expect(s.size(0)).toBeGreaterThanOrEqual(WALL.outgrown);
    }
  });
});

describe('landmarks and memory', () => {
  it('a town with a market gets its church on the square', () => {
    const { topo, h, s, c, l } = grow(12);
    expect(s.size(0)).toBeGreaterThanOrEqual(CHURCH.at);
    const look = lookOf(s), frames = squareFrames(topo, s.streets, s.towns, look);
    const f = frames.get(0)!, hall = topo.positions.subarray(f.hall * 3, f.hall * 3 + 3);
    const solids = landmarkMarks(topo, h, s, c, l, frames, look, () => null).lines.filter((m) => m.fill);
    const onSquare = solids.filter((m) => Math.hypot(m.points[0] - hall[0], m.points[1] - hall[1], m.points[2] - hall[2]) < f.radius * 1.1);
    expect(onSquare.length).toBeGreaterThanOrEqual(3); // nave, transept, tower
  });

  it("a country house's fields are its park", () => {
    const { s, c, step } = grow(16);
    const farm = s.farms[0];
    expect(farm).toBeDefined();
    farm.estate = s.day;
    step();
    const own = [...c.claims].filter(([, x]) => x.owner === `f${farm.vertex}`).map(([cell]) => cell);
    expect(own.length).toBeGreaterThan(0);
    for (const cell of own) expect(c.cropOf(cell)).toBe('park');
  });

  it('the map remembers the fields the town built over', () => {
    const { c } = grow(16);
    expect(c.remembered.size).toBeGreaterThan(0);
    for (const cell of c.remembered.keys()) expect(c.claims.has(cell)).toBe(false);
  });

  it('orchards are on the gentle slopes, not the flat and not the steep', () => {
    const { c } = grow(20);
    for (const [cell] of c.claims) if (c.cropOf(cell) === 'orchard') {
      expect(c.steepness(cell)).toBeGreaterThan(FIELD.orchard);
      expect(c.steepness(cell)).toBeLessThanOrEqual(FIELD.steep);
    }
  });
});
