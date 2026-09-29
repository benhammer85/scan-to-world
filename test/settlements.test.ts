import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Settlements, STREET } from '../src/life/settlements';
import { buildingMarks, footprintRadius, streetMarks } from '../src/life/buildingMarks';

/** A sphere whose height is a gentle swell, plus a steep ridge round x = 0.3. */
function world() {
  const g = new THREE.IcosahedronGeometry(1, 20);
  const topo = buildTopology(g.attributes.position.array, null);
  const h = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const x = topo.positions[v * 3], y = topo.positions[v * 3 + 1];
    h[v] = 0.3 + 0.1 * y + 0.6 / (1 + Math.exp(-(x - 0.3) * 60)); // a cliff at x ≈ 0.3
  }
  return { topo, h };
}

const FRONT = [0, 0, 1]; // well to the low side of the cliff

function dist(topo: ReturnType<typeof world>['topo'], a: number, b: number) {
  const p = topo.positions;
  return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
}

describe('settlements', () => {
  it('a tap on open ground founds a town there', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    const r = s.tap(FRONT);
    expect(r.kind).toBe('founded');
    expect(s.buildings).toHaveLength(1);
  });

  it('a tap on the cliff is moved off it or refused, never built on', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    const onCliff = [Math.cos(Math.asin(0)) * 0.3, 0, Math.sqrt(1 - 0.09)];
    const r = s.tap(onCliff);
    if (r.kind !== 'refused') expect(s.buildable(r.vertex)).toBe(true);
  });

  it('towns grow with time, stay on buildable ground, keep their spacing, and do not climb the cliff', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(12);
    expect(s.buildings.length).toBeGreaterThan(30);
    for (const b of s.buildings) {
      expect(s.buildable(b.vertex)).toBe(true);
      expect(topo.positions[b.vertex * 3]).toBeLessThan(0.3); // stayed below the cliff
    }
    for (let i = 0; i < s.buildings.length; i++)
      for (let j = i + 1; j < s.buildings.length; j++)
        expect(dist(topo, s.buildings[i].vertex, s.buildings[j].vertex)).toBeGreaterThanOrEqual(s.spacing - 1e-6);
  });

  it('growth does not depend on how time was sliced', () => {
    const a = world(), b = world();
    const one = new Settlements(a.topo, a.h), many = new Settlements(b.topo, b.h);
    one.tap(FRONT); many.tap(FRONT);
    one.advance(5);
    for (let i = 0; i < 500; i++) many.advance(0.01);
    expect(many.buildings.map((x) => x.vertex)).toEqual(one.buildings.map((x) => x.vertex));
  });

  it('founding a town far away does not move a single existing building', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(3);
    const before = s.buildings.map((b) => b.vertex);
    s.tap([-0.2, 0.9, 0.3]);
    expect(s.buildings.slice(0, before.length).map((b) => b.vertex)).toEqual(before);
    expect(s.towns).toHaveLength(2);
  });

  it('a tap on a town grows it instead of founding another', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    const r = s.tap([0.02, 0.02, 1]);
    expect(r.kind).toBe('grew');
    expect(s.towns).toHaveLength(1);
    expect(s.buildings.length).toBeGreaterThan(1);
  });

  it('buildings are drawn as small closed rectangles lying on the ground', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(2);
    for (const [i, m] of buildingMarks(topo, h, s.buildings).entries()) {
      expect(m.closed).toBe(true);
      expect(m.points.length).toBe(12);
      const v = s.buildings[i].vertex * 3;
      for (let k = 0; k < 12; k += 3) {
        const d = Math.hypot(m.points[k] - topo.positions[v], m.points[k + 1] - topo.positions[v + 1], m.points[k + 2] - topo.positions[v + 2]);
        expect(d).toBeLessThan(0.03);
      }
    }
  });
});

describe('streets', () => {
  function grown(days = 10) {
    const w = world();
    const s = new Settlements(w.topo, w.h);
    s.tap(FRONT);
    s.advance(days);
    return { ...w, s };
  }

  it('every building but the hall has a street, and it leads to the network', () => {
    const { s } = grown();
    const halls = new Set(s.towns.map((t) => t.centre));
    const served = new Map(s.streets.filter((st) => st.kind === 'street').map((st) => [st.path[0], st]));
    const reached = new Set<number>([...halls]);
    for (const st of s.streets) for (const v of st.path.slice(1)) reached.add(v);
    for (const b of s.buildings) {
      if (halls.has(b.vertex)) continue;
      const st = served.get(b.vertex);
      expect(st, `building ${b.vertex} has no street`).toBeDefined();
      // It ends on a street laid before it, or on the hall.
      const end = st!.path[st!.path.length - 1];
      expect(reached.has(end)).toBe(true);
    }
  });

  it('no street runs through a building, as laid or as drawn', () => {
    const { topo, s } = grown();
    const buildingAt = new Set(s.buildings.map((b) => b.vertex));
    for (const st of s.streets) for (const v of st.path.slice(1, -1)) expect(buildingAt.has(v)).toBe(false);

    // The drawn line, after smoothing, keeps out of every footprint but its own door.
    const marks = streetMarks(topo, s.streets, s.buildings);
    const byVertex = new Map(s.buildings.map((b) => [b.vertex, b]));
    let worst = Infinity;
    marks.forEach((m, i) => {
      const st = s.streets.filter((x) => x.path.length >= 2)[i];
      for (const b of s.buildings) {
        if (st.kind === 'street' && b.vertex === st.path[0]) continue;
        const o = b.vertex * 3;
        for (let k = 0; k < m.points.length; k += 3) {
          const d = Math.hypot(m.points[k] - topo.positions[o], m.points[k + 1] - topo.positions[o + 1], m.points[k + 2] - topo.positions[o + 2]);
          worst = Math.min(worst, d - footprintRadius(byVertex.get(b.vertex)!));
        }
      }
    });
    expect(worst).toBeGreaterThan(0);
  });

  it('streets follow the contours: they climb less than the ground around them', () => {
    const { topo, h, s } = grown(14);
    const climb = (a: number, b: number) => Math.abs(h[a] - h[b]) / dist(topo, a, b);
    let sc = 0, sn = 0;
    for (const st of s.streets) for (let i = 1; i < st.path.length; i++) { sc += climb(st.path[i - 1], st.path[i]); sn++; }
    // Every mesh edge in the same patch of ground, for comparison.
    const near = new Set<number>();
    for (const st of s.streets) for (const v of st.path) near.add(v);
    let gc = 0, gn = 0;
    for (const v of near) for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) { gc += climb(v, topo.nbrList[k]); gn++; }
    expect(sn).toBeGreaterThan(20);
    expect(sc / sn).toBeLessThan((gc / gn) * 0.8);
  });

  it('two grown towns are joined by a road', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.tap([-0.1, -0.35, 0.93]);
    expect(s.towns).toHaveLength(2);
    s.advance(6);
    const roads = s.streets.filter((st) => st.kind === 'road');
    expect(roads.length).toBe(1);
    expect(s.towns.every((t) => t.buildings.length >= STREET.roadAt)).toBe(true);
  });

  it('with two towns, growth still does not depend on how time was sliced', () => {
    const build = (steps: number) => {
      const { topo, h } = world();
      const s = new Settlements(topo, h);
      s.tap(FRONT);
      s.tap([-0.1, -0.35, 0.93]);
      for (let i = 0; i < steps; i++) s.advance(6 / steps);
      return { b: s.buildings.map((x) => x.vertex), st: s.streets.map((x) => x.path.join(',')) };
    };
    expect(build(300)).toEqual(build(1));
  });
});

describe('loops', () => {
  /** Independent cycles in the street graph: E - V + C (whatwesaved PRINCIPLES.md, 5d). */
  function cycles(s: Settlements) {
    const edges = new Set<string>(), verts = new Set<number>();
    const adj = new Map<number, number[]>();
    for (const st of s.streets) {
      const p = st.kind === 'street' ? st.path.slice(1) : st.path;
      p.forEach((v) => verts.add(v));
      for (let i = 1; i < p.length; i++) {
        const [a, b] = [p[i - 1], p[i]].sort((x, y) => x - y);
        if (edges.has(`${a}-${b}`)) continue;
        edges.add(`${a}-${b}`);
        (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
        (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
      }
    }
    for (const t of s.towns) verts.add(t.centre);
    let comps = 0;
    const seen = new Set<number>();
    for (const v of verts) {
      if (seen.has(v)) continue;
      comps++;
      const stack = [v];
      while (stack.length) { const u = stack.pop()!; if (seen.has(u)) continue; seen.add(u); stack.push(...(adj.get(u) ?? [])); }
    }
    return edges.size - verts.size + comps;
  }

  /** Mean of (distance by street / distance over the ground) between house doors. */
  function detour(s: Settlements, topo: ReturnType<typeof world>['topo']) {
    const doors = s.streets.filter((st) => st.kind === 'street').map((st) => st.path[1]);
    const d = (s as unknown as { networkDistances(v: number, l: number): Map<number, number> }).networkDistances.bind(s);
    let sum = 0, n = 0;
    for (let i = 0; i < doors.length; i++) {
      const byStreet = d(doors[i], Infinity);
      for (let j = i + 1; j < doors.length; j++) {
        const crow = dist(topo, doors[i], doors[j]);
        if (crow < 0.05 || crow > 0.3) continue;
        sum += (byStreet.get(doors[j]) ?? 10) / crow; n++;
      }
    }
    return sum / n;
  }

  function grow(loopDetour: number, site: number[] = FRONT) {
    const saved = STREET.loopDetour;
    STREET.loopDetour = loopDetour;
    try {
      const { topo, h } = world();
      const s = new Settlements(topo, h);
      s.tap(site);
      s.advance(14);
      return { s, topo };
    } finally {
      STREET.loopDetour = saved;
    }
  }

  it('without lanes the streets are a tree; with them the town has loops', () => {
    const tree = grow(Infinity), town = grow(STREET.loopDetour);
    expect(cycles(tree.s)).toBe(0);
    expect(cycles(town.s)).toBeGreaterThanOrEqual(3);
  });

  // Three towns, not one: one seed measures the seed (whatwesaved PRINCIPLES.md, 4a).
  // Measured on three sites: 1.80, 1.81, 1.98 without lanes; 1.47, 1.40, 1.42 with.
  it('loops make towns easier to cross: less detour between houses, over three towns', () => {
    const sites = [FRONT, [-0.5, 0.3, 0.81], [-0.3, -0.6, 0.74]];
    const mean = (ld: number) => sites.reduce((sum, site) => { const g = grow(ld, site); return sum + detour(g.s, g.topo); }, 0) / sites.length;
    expect(mean(STREET.loopDetour)).toBeLessThan(mean(Infinity) * 0.85);
  });

  it('no two streets cross without a junction: a way only ever meets another at its end', () => {
    const { s } = grow(STREET.loopDetour);
    const interior = new Map<number, number>(); // vertex -> the way it's inside of
    s.streets.forEach((st, i) => {
      const p = st.kind === 'street' ? st.path.slice(1) : st.path;
      for (const v of p.slice(1, -1)) interior.set(v, i);
    });
    s.streets.forEach((st, i) => {
      const p = st.kind === 'street' ? st.path.slice(1) : st.path;
      for (const v of p.slice(1, -1)) expect(interior.get(v)).toBe(i); // no other way passes through
    });
  });

  it('lanes never run along an existing street', () => {
    const { s } = grow(STREET.loopDetour);
    const count = new Map<string, number>();
    for (const st of s.streets) {
      const p = st.kind === 'street' ? st.path.slice(1) : st.path;
      for (let i = 1; i < p.length; i++) {
        const k = [p[i - 1], p[i]].sort((x, y) => x - y).join('-');
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    expect([...count.values()].every((c) => c === 1)).toBe(true);
  });
});
