import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { MARKET, Settlements, STREET, streetVertices } from '../src/life/settlements';

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

});

describe('streets', () => {
  function grown(days = 10) {
    const w = world();
    const s = new Settlements(w.topo, w.h);
    s.tap(FRONT);
    s.advance(days);
    return { ...w, s };
  }

  it('every house but a hall faces a street, one step away', () => {
    const { topo, s } = grown();
    const onStreet = new Set<number>();
    for (const st of s.streets) streetVertices(st).forEach((v) => onStreet.add(v));
    const halls = new Set(s.towns.map((t) => t.centre));
    for (const b of s.buildings) {
      if (halls.has(b.vertex)) continue;
      expect(b.front, `house ${b.vertex} has no front`).toBeDefined();
      expect(onStreet.has(b.front!)).toBe(true);
      const nb = Array.from(topo.nbrList.subarray(topo.nbrOffsets[b.vertex], topo.nbrOffsets[b.vertex + 1]));
      expect(nb).toContain(b.front);
    }
  });

  it('every street reaches its hall', () => {
    const { s } = grown();
    const d = (s as unknown as { networkDistances(v: number, l: number): Map<number, number> }).networkDistances.bind(s);
    for (const t of s.towns) {
      // From the square's edge: the hall stands in the square, and the square's edge is where streets start.
      const edge = s.streets.find((x) => x.kind === 'square' && x.town === t.id)!;
      const reach = d(edge.path[0], Infinity);
      for (const st of s.streets.filter((x) => x.town === t.id)) for (const v of streetVertices(st)) expect(reach.has(v)).toBe(true);
    }
  });

  it('streets are lined with houses, not spurs to them', () => {
    const { s } = grown(14);
    // Houses per street, averaged: the old one-spur-per-house model was exactly 1.
    const streets = s.streets.filter((st) => st.kind === 'street');
    const houses = s.buildings.filter((b) => b.front !== undefined);
    expect(houses.length / streets.length).toBeGreaterThan(2);
    // And the sharper question: does a house share its street with others?
    const wayOf = new Map<number, number>();
    s.streets.forEach((st, i) => streetVertices(st).forEach((v) => { if (!wayOf.has(v)) wayOf.set(v, i); }));
    const perWay = new Map<number, number>();
    for (const b of houses) { const w = wayOf.get(b.front!)!; perWay.set(w, (perWay.get(w) ?? 0) + 1); }
    const shared = houses.filter((b) => perWay.get(wayOf.get(b.front!)!)! >= 2).length;
    expect(shared / houses.length).toBeGreaterThan(0.8);
  });

  // Measured against what the mesh allows, not against the mean: on a triangle
  // mesh even the least-climbing edge at each point climbs 0.72 of the mean
  // here, so "less than the ground" alone is nearly true of any path
  // (whatwesaved PRINCIPLES.md, 4). Measured: contour streets 0.84 of the mean.
  it('streets run along the contours, close to the least climb the mesh allows', () => {
    const g = new THREE.IcosahedronGeometry(1, 24);
    const topo = buildTopology(g.attributes.position.array, null);
    const h = new Float32Array(topo.vertexCount);
    for (let v = 0; v < topo.vertexCount; v++) h[v] = 0.3 + 0.8 * topo.positions[v * 3 + 1];
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(14);
    const climb = (a: number, b: number) => Math.abs(h[a] - h[b]) / dist(topo, a, b);
    let sc = 0, sn = 0;
    const near = new Set<number>();
    for (const st of s.streets.filter((x) => x.kind === 'street')) {
      const p = streetVertices(st);
      p.forEach((v) => near.add(v));
      for (let i = 1; i < p.length; i++) { sc += climb(p[i - 1], p[i]); sn++; }
    }
    let mean = 0, mn = 0, least = 0;
    for (const v of near) {
      let m = Infinity;
      for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) { const c = climb(v, topo.nbrList[k]); mean += c; mn++; m = Math.min(m, c); }
      least += m;
    }
    expect(sn).toBeGreaterThan(20);
    expect(sc / sn).toBeLessThan((least / near.size) * 1.3);
    expect(sc / sn).toBeLessThan((mean / mn) * 0.95);
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
      const p = streetVertices(st);
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
    // A house's door is the street vertex it faces.
    const doors = s.buildings.filter((b) => b.front !== undefined).map((b) => b.front!);
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

  it('lanes close loops: the town has cycles that the streets alone do not', () => {
    const tree = grow(Infinity), town = grow(STREET.loopDetour);
    expect(cycles(town.s)).toBeGreaterThanOrEqual(cycles(tree.s) + 3);
  });

  // Three towns, not one: one seed measures the seed (whatwesaved PRINCIPLES.md, 4a).
  // Measured with frontage on three sites: 1.77, 1.72, 1.80 without lanes;
  // 1.49, 1.58, 1.62 with. Smaller than before frontage (1.80 -> 1.43),
  // because streets laid along the contour already connect better.
  it('loops make towns easier to cross: less detour between houses, over three towns', () => {
    const sites = [FRONT, [-0.5, 0.3, 0.81], [-0.3, -0.6, 0.74]];
    const mean = (ld: number) => sites.reduce((sum, site) => { const g = grow(ld, site); return sum + detour(g.s, g.topo); }, 0) / sites.length;
    expect(mean(STREET.loopDetour)).toBeLessThan(mean(Infinity) * 0.93);
  });

  it('no two streets cross without a junction: a way only ever meets another at its end', () => {
    const { s } = grow(STREET.loopDetour);
    const interior = new Map<number, number>(); // vertex -> the way it's inside of
    s.streets.forEach((st, i) => {
      const p = streetVertices(st);
      for (const v of p.slice(1, -1)) interior.set(v, i);
    });
    s.streets.forEach((st, i) => {
      const p = streetVertices(st);
      for (const v of p.slice(1, -1)) expect(interior.get(v)).toBe(i); // no other way passes through
    });
  });

  it('lanes never run along an existing street', () => {
    const { s } = grow(STREET.loopDetour);
    const count = new Map<string, number>();
    for (const st of s.streets) {
      const p = streetVertices(st);
      for (let i = 1; i < p.length; i++) {
        const k = [p[i - 1], p[i]].sort((x, y) => x - y).join('-');
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    expect([...count.values()].every((c) => c === 1)).toBe(true);
  });
});

describe('square and market', () => {
  function town(days: number) {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(days);
    return { topo, s };
  }

  it('the hall stands in an open square: no house or street inside it', () => {
    const { topo, s } = town(14);
    const hall = s.towns[0].centre;
    const inner = s.squareRadius * 0.9;
    for (const b of s.buildings) if (b.vertex !== hall) expect(dist(topo, b.vertex, hall)).toBeGreaterThan(inner);
    const edge = new Set(s.streets.find((x) => x.kind === 'square')!.path);
    for (const st of s.streets) {
      if (st.kind === 'square') continue;
      // A street may end on the square's edge (that's where it joins); it may not enter.
      for (const v of streetVertices(st)) if (!edge.has(v)) expect(dist(topo, v, hall)).toBeGreaterThan(inner);
    }
  });

  it('houses front the square', () => {
    const { s } = town(14);
    const edge = new Set(s.streets.find((x) => x.kind === 'square')!.path);
    expect(s.buildings.filter((b) => b.front !== undefined && edge.has(b.front)).length).toBeGreaterThanOrEqual(3);
  });

  it('the market comes when the town has grown, and only grows after that', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    for (let day = 0; day < 20; day++) {
      s.advance(1);
      if (s.buildings.length - 1 < MARKET.at) expect(s.stalls).toHaveLength(0);
      // Slots fill in order and never move: stall k is in slot k.
      expect(s.stalls.map((x) => x.slot)).toEqual(s.stalls.map((_, i) => i));
    }
    expect(s.stalls.length).toBeGreaterThanOrEqual(2);
  });

  it('a town is not founded where its square would not fit', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(6);
    // Right beside the first town's houses: nearest room for a whole square is too far for the tap.
    const b = s.buildings[s.buildings.length - 1].vertex * 3;
    const r = s.tap([topo.positions[b], topo.positions[b + 1], topo.positions[b + 2]]);
    expect(s.towns).toHaveLength(1); // it grew the town instead, or was refused
    expect(r.kind).not.toBe('founded');
  });
});

describe('towns keep apart', () => {
  it('a tap near a town, but outside it, grows that town rather than founding another', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(3);
    const r = s.tap([0.22, 0, 0.975]); // well clear of its buildings, but close
    expect(s.towns).toHaveLength(1);
    expect(r.kind).not.toBe('founded');
  });

  it('far enough off, a tap founds a new town', () => {
    const { topo, h } = world();
    const s = new Settlements(topo, h);
    s.tap(FRONT);
    s.advance(3);
    s.tap([-0.1, -0.5, 0.86]);
    expect(s.towns).toHaveLength(2);
  });
});
