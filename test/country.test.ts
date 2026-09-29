import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Settlements } from '../src/life/settlements';
import { Countryside, FARMLAND, FIELD, SEASON, cadastre } from '../src/life/country';
import { countryMarks, seasonColour } from '../src/life/countryMarks';

/** The settlements tests' world: a gentle swell, and a cliff at x ≈ 0.3. */
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

function country(days: number) {
  const { topo, h } = world();
  const s = new Settlements(topo, h);
  const c = new Countryside(topo, s, h);
  s.tap([0, 0, 1]);
  c.update(true);
  for (let i = 0; i < days * 4; i++) { s.advance(0.25); c.update(); }
  return { topo, h, s, c };
}

const d3 = (p: Float32Array, a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);

describe('the land', () => {
  it('is divided once into field cells: every vertex in one, the same every time, their middles a field apart', () => {
    const { topo } = world();
    const a = cadastre(topo);
    for (const cell of a.cellOf) expect(cell).toBeGreaterThanOrEqual(0);
    const g = new THREE.IcosahedronGeometry(1, 20);
    const b = cadastre(buildTopology(g.attributes.position.array, null));
    expect([...b.cellOf]).toEqual([...a.cellOf]);
    const P = topo.basePositions;
    for (let i = 0; i < a.cells.length; i += 7) for (let j = i + 1; j < a.cells.length; j += 5) expect(d3(P, a.cells[i].centre, a.cells[j].centre)).toBeGreaterThanOrEqual(FIELD.size * 0.999);
  });
});

describe('fields', () => {
  it('a town works more fields as it grows, near it, and never on its own streets and houses', () => {
    const early = country(4), late = country(16);
    expect(late.c.claims.size).toBeGreaterThan(early.c.claims.size);
    const { topo, s, c } = late;
    const centre = s.towns[0].centre;
    for (const [cell, claim] of c.claims) {
      if (claim.owner === 't0') expect(d3(topo.positions, c.land.cells[cell].centre, centre)).toBeLessThan(FIELD.reach + FIELD.size);
      const verts = c.land.cells[cell].vertices, built = verts.filter((v) => c.townGround[v]).length / verts.length;
      expect(built).toBeLessThanOrEqual(FIELD.built);
    }
  });

  it('the town builds over its nearest fields in time, and its fields move out', () => {
    const { topo, s, c } = country(6);
    const first = [...c.claims.keys()];
    for (let i = 0; i < 60; i++) { s.advance(0.25); c.update(); }
    const taken = first.filter((cell) => !c.claims.has(cell));
    expect(taken.length).toBeGreaterThan(0);
    const mean = (cells: number[]) => cells.reduce((a, cell) => a + d3(topo.positions, c.land.cells[cell].centre, s.towns[0].centre), 0) / cells.length;
    expect(mean([...c.claims.keys()])).toBeGreaterThan(mean(first));
  });

  it("a field is what its ground makes it: terraced on the steep", () => {
    const { c } = country(16);
    for (const [cell] of c.claims) {
      if (c.steepness(cell) > FIELD.steep && c.cropOf(cell) !== 'meadow' && c.cropOf(cell) !== 'grazing') expect(c.cropOf(cell)).toBe('terrace');
      if (c.cropOf(cell) === 'terrace') expect(c.steepness(cell)).toBeGreaterThan(FIELD.steep);
    }
  });

  it('is drawn: hedges round the fields, plough lines in the ploughed ones, washes under them', () => {
    const { topo, s, c } = country(10);
    const d = countryMarks(topo, s, c);
    expect(d.lines.length).toBeGreaterThan(20);
    expect(d.wash.positions.length + d.seasonal.positions.length).toBeGreaterThan(0);
    expect(d.wash.colours.length / 4).toBe(d.wash.positions.length / 3);
  });
});

describe('seeds and changing course', () => {
  it('a tap on a field gives it back to the wood, and the town never builds there', () => {
    const { topo, s, c } = country(8);
    const [cell] = [...c.claims.keys()];
    const v = c.land.cells[cell].vertices.find((u) => !c.townGround[u])!;
    expect(c.tap(v)).toBe('spared');
    expect(c.isWood(cell)).toBe(true);
    const before = new Set(s.buildings.map((b) => b.vertex));
    for (let i = 0; i < 40; i++) { s.advance(0.25); c.update(); }
    const inCell = new Set(c.land.cells[cell].vertices);
    for (const b of s.buildings) if (!before.has(b.vertex)) expect(inCell.has(b.vertex)).toBe(false);
    expect(c.claims.has(cell)).toBe(false);
    void topo;
  });

  it('a tap on a wood fells it, and the fields may take it', () => {
    const { s, c } = country(8);
    const near = c.nearPeople();
    const wood = [...near].find((cell) => c.isWood(cell))!;
    expect(wood).toBeDefined();
    const v = c.land.cells[wood].vertices.find((u) => !c.townGround[u])!;
    expect(c.tap(v)).toBe('felled');
    expect(c.isWood(wood)).toBe(false);
    void s;
  });

  it('a tap in the country near a town plants a farm, on its own track, and it works more fields as it ages', () => {
    const { topo, s, c } = country(2);
    const P = topo.positions, centre = s.towns[0].centre;
    // Open ground a little way out: not on the town, not a field, not a wood.
    const spot = c.land.cells.map((x) => x.centre).find((v) => {
      const d = d3(P, v, centre);
      const clear = s.buildings.every((b) => d3(P, b.vertex, v) > 0.13);
      return d > 0.2 && d < 0.32 && clear && s.buildable(v) && !c.claims.has(c.land.cellOf[v]) && !c.isWood(c.land.cellOf[v]) && !c.townGround[v];
    })!;
    expect(spot).toBeDefined();
    const r = s.tap([P[spot * 3], P[spot * 3 + 1], P[spot * 3 + 2]]);
    expect(r.kind).toBe('farm');
    const farm = s.farms.find((f) => f.vertex === (r as { vertex: number }).vertex)!;
    const track = s.streets.find((x) => x.kind === 'track' && x.path[0] === farm.vertex)!;
    expect(track).toBeDefined();
    c.update(true);
    const count = () => [...c.claims.values()].filter((x) => x.owner === `f${farm.vertex}`).length;
    const first = count();
    for (let i = 0; i < 16; i++) { s.advance(0.25); c.update(); }
    expect(count()).toBeGreaterThan(first);
    expect(count()).toBeLessThanOrEqual(FARMLAND.fields);
  });

  it('the seasons come round: the ploughland is the same colour a year on', () => {
    for (const day of [0, 1.3, 5.7]) {
      const a = seasonColour(day), b = seasonColour(day + SEASON.days);
      for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k], 6);
    }
  });
});
