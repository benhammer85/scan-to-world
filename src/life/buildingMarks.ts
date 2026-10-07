/**
 * The town as pen marks: streets, houses, each square's edge and its market.
 * Positions are read from the current ground every time, so the town rides
 * the terrain when it is sculpted.
 *
 * What is drawn stays the plan's shape, only cleaner: a square's edge is the
 * network's ring of vertices, drawn as a true circle through its mean radius,
 * with the streets that meet it ending exactly on that circle.
 */
import type { Topology } from '../mesh/topology';
import type { Polyline } from '../terrain/contours';
import { type Building, type Harbour, type Rail, type Settlements, type Street } from './settlements';

export const MARK = {
  long: 0.024,
  short: 0.015,
  /** A town's first building is its hall, and is drawn bigger. */
  hall: 1.5,
  lift: 0.003,
  /** Street fragments shorter than this after trimming are not drawn: they read as stray ticks. */
  shortest: 0.015,
};

export const BRIDGE_MARK = { halfWidth: 0.006, tick: 0.008 };

/**
 * Streets are drawn as two lines, the way a town plan draws a street, so a
 * street can never be mistaken for a contour. Wider for the ways between towns.
 */
export const STREET_WIDTH: Record<string, number> = { street: 0.0032, link: 0.0028, lane: 0.0026, road: 0.0046 };
export const PIER_MARK = { halfWidth: 0.004, head: 0.012 };
export const BOAT = { long: 0.012, beam: 0.005 };

type V3 = [number, number, number];

/**
 * How far each thing has grown up, as the drawing needs it: a house's stage
 * (0 hut, 1 house, 2 with its wing, 3 in a terrace), whether a town's first
 * building is its hall yet, and a way's stage (0 walked, 1 a worn track,
 * 2 a made street, 3 the main street or a made road). `GROWN` is a town
 * fully grown up, for drawing without a world to ask.
 */
export interface Look {
  house(b: Building): number;
  hall(town: number): boolean;
  street(st: Street): number;
}
export const GROWN: Look = { house: () => 2, hall: () => true, street: (st) => (st.kind === 'road' ? 1 + (st.grade ?? 2) : 2) };

/**
 * A number in [0, 1) that depends only on `v` and `salt`. Every variation in
 * the drawing comes from one of these, so a house or a street is always drawn
 * the same way: seeded by itself, it can't shift when anything else changes
 * (whatwesaved PRINCIPLES.md, 20).
 */
export function hash(v: number, salt: number): number {
  let x = (v * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function deck(topo: Topology, path: number[], half: number, ends: 'ticks' | 'head' | 'none'): Polyline[] {
  const centre = chaikin(path.map((v) => lifted(topo, v, 0.004)));
  const n = topo.normals;
  const side = (i: number): V3 => {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const t: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = path[Math.min(path.length - 1, Math.round((i / (centre.length - 1)) * (path.length - 1)))] * 3;
    const nr: V3 = [n[v], n[v + 1], n[v + 2]];
    const s: V3 = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    return [s[0] / l, s[1] / l, s[2] / l];
  };
  const sides = centre.map((_, i) => side(i));
  const rail = (sign: number) => centre.map((c, i) => c.map((x, k) => x + sign * half * sides[i][k]));
  const out = [polyline(rail(1), 1), polyline(rail(-1), 1)];
  const last = centre.length - 1;
  if (ends === 'ticks') {
    for (const [i, dir] of [[0, -1], [last, 1]] as [number, number][]) {
      const a = centre[Math.max(0, Math.min(last, i - dir))], c = centre[i];
      const along = c.map((x, k) => x - a[k]), al = Math.hypot(along[0], along[1], along[2]) || 1;
      for (const sign of [1, -1]) {
        const root = c.map((x, k) => x + sign * half * sides[i][k]);
        const tip = root.map((x, k) => x + (along[k] / al) * BRIDGE_MARK.tick * 0.7 + sign * sides[i][k] * BRIDGE_MARK.tick * 0.7);
        out.push(polyline([root, tip], 1));
      }
    }
  } else {
    const c = centre[last];
    out.push(polyline([c.map((x, k) => x + PIER_MARK.head * sides[last][k]), c.map((x, k) => x - PIER_MARK.head * sides[last][k])], 1));
  }
  return out;
}

/** Harbours: a pier out over the water, and boats moored beside it. */
export function harbourMarks(topo: Topology, harbours: Harbour[], boats: (h: Harbour) => number): Polyline[] {
  const out: Polyline[] = [];
  for (const h of harbours) {
    if (h.drowned) continue;
    const rails = deck(topo, h.pier, PIER_MARK.halfWidth, 'head');
    out.push(...rails);
    const count = boats(h);
    if (!count) continue;
    // Alongside the pier's outer half, alternating sides.
    const p = topo.positions, nm = topo.normals;
    const end = h.pier[h.pier.length - 1], root = h.pier[0];
    const t: V3 = [p[end * 3] - p[root * 3], p[end * 3 + 1] - p[root * 3 + 1], p[end * 3 + 2] - p[root * 3 + 2]];
    const nr: V3 = [nm[end * 3], nm[end * 3 + 1], nm[end * 3 + 2]];
    const along = tangent(t, nr) ?? anyDirection(end, nr);
    const across: V3 = [nr[1] * along[2] - nr[2] * along[1], nr[2] * along[0] - nr[0] * along[2], nr[0] * along[1] - nr[1] * along[0]];
    for (let i = 0; i < count; i++) {
      const back = (Math.floor(i / 2) + 0.5) * BOAT.long * 1.3, side = i % 2 ? -1 : 1;
      const c: V3 = [0, 1, 2].map((k) => p[end * 3 + k] - along[k] * back + across[k] * side * (PIER_MARK.halfWidth + BOAT.beam * 1.6) + nr[k] * 0.004) as V3;
      out.push(hull(c, along, across));
    }
  }
  return out;
}

export const RAIL_MARK = { tie: 0.0045, every: 0.011 };

export const CROSSING = {
  /** Gates stand this far along the road either side of the line... */
  gate: 0.011,
  /** ...and close when a train is this close to the crossing. */
  warn: 0.07,
  /** A vehicle this close to a closed gate, heading for it, waits. */
  stop: 0.022,
};

/** A level crossing as drawn and worked: where it is, and which ways the road and the rail run. */
export interface CrossingFrame {
  vertex: number;
  at: V3;
  normal: V3;
  road: V3;
  rail: V3;
  /** Half the road's drawn width, for where the gateposts stand. */
  half: number;
}

export function crossingFrames(topo: Topology, st: Settlements): CrossingFrame[] {
  const p = topo.positions, n = topo.normals;
  const pos = (v: number): V3 => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
  const dirOf = (path: number[], v: number, nr: V3): V3 | null => {
    const i = path.indexOf(v);
    if (i < 0) return null;
    const a = pos(path[Math.max(0, i - 1)]), b = pos(path[Math.min(path.length - 1, i + 1)]);
    return tangent([b[0] - a[0], b[1] - a[1], b[2] - a[2]], nr);
  };
  const out: CrossingFrame[] = [];
  for (const c of st.crossings()) {
    const v = c.vertex, nr: V3 = [n[v * 3], n[v * 3 + 1], n[v * 3 + 2]];
    const street = st.streets.find((x) => x.kind !== 'square' && x.path.includes(v));
    const rail = dirOf(st.rails[c.rail].path, v, nr);
    const road = street ? dirOf(street.path, v, nr) : null;
    if (!rail || !road) continue;
    out.push({ vertex: v, at: lifted(topo, v, 0.004) as V3, normal: nr, road, rail, half: STREET_WIDTH[street!.kind] ?? 0.003 });
  }
  return out;
}

/** The barriers, down across the road, at a crossing that is closed. */
function barriers(f: CrossingFrame): Polyline[] {
  const side: V3 = [f.normal[1] * f.road[2] - f.normal[2] * f.road[1], f.normal[2] * f.road[0] - f.normal[0] * f.road[2], f.normal[0] * f.road[1] - f.normal[1] * f.road[0]];
  return [1, -1].map((along) => {
    const c = [0, 1, 2].map((k) => f.at[k] + f.road[k] * along * CROSSING.gate);
    return polyline([c.map((x, k) => x + side[k] * f.half * 2.2), c.map((x, k) => x - side[k] * f.half * 2.2)], 2);
  });
}
export const CABLE_MARK = { height: 0.014, pylonEvery: 0.06 };

/** A railway as maps draw one: a line with cross-ties. */
export function railMarks(topo: Topology, rails: Rail[], crossingAt: V3[] = []): Polyline[] {
  const out: Polyline[] = [];
  const nearCrossing = (c: number[]) => crossingAt.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < CROSSING.gate * 0.8);
  for (const r of rails) {
    const pts = chaikin(chaikin(r.path.map((v) => lifted(topo, v, 0.0035))));
    out.push(polyline(pts, 0));
    let along = RAIL_MARK.every / 2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      while (along < d) {
        const t = along / d, c = a.map((x, k) => x + (b[k] - x) * t);
        const v = r.path[Math.min(r.path.length - 1, Math.round((i / (pts.length - 1)) * (r.path.length - 1)))] * 3;
        const nr: V3 = [topo.normals[v], topo.normals[v + 1], topo.normals[v + 2]];
        const across = tangent([nr[1] * (b[2] - a[2]) - nr[2] * (b[1] - a[1]), nr[2] * (b[0] - a[0]) - nr[0] * (b[2] - a[2]), nr[0] * (b[1] - a[1]) - nr[1] * (b[0] - a[0])], nr);
        // No ties across the road itself: the road runs over the line there.
        if (across && !nearCrossing(c)) out.push(polyline([c.map((x, k) => x + across[k] * RAIL_MARK.tie), c.map((x, k) => x - across[k] * RAIL_MARK.tie)], 0));
        along += RAIL_MARK.every;
      }
      along -= d;
    }
  }
  return out;
}

/** A ferry's way across the water, dashed, as maps draw a ferry. */
export function ferryRoute(topo: Topology, route: number[]): Polyline[] {
  const pts = chaikin(chaikin(route.map((v) => lifted(topo, v, 0.003))));
  const out: Polyline[] = [];
  let run: number[][] = [], along = 0, on = true;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    if (on) { if (!run.length) run.push(pts[i - 1]); run.push(pts[i]); }
    along += d;
    if (along > 0.01) { along = 0; if (on && run.length >= 2) out.push(polyline(run, 0)); run = []; on = !on; }
  }
  if (on && run.length >= 2) out.push(polyline(run, 0));
  return out;
}

/**
 * Where something travelling a path is at `seconds`: out along it, a rest at
 * the far end, back, a rest at home, and again, eased at both ends so it
 * slows into a stop and gathers way leaving it. Pointed the way it goes.
 */
export function travel(topo: Topology, route: number[], seconds: number, speed: number, dwell: number, phase = 0, lift = 0.004):
  { at: V3; heading: V3; normal: V3 } {
  const p = topo.positions, n = topo.normals;
  const pts = route.map((v) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]] as V3);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1] || 1e-6, trip = L / speed, cycle = 2 * (trip + dwell);
  let t = (((seconds + phase * cycle) % cycle) + cycle) % cycle;
  const ease = (x: number) => x * x * (3 - 2 * x);
  let s: number, dir = 1;
  if (t < trip) s = ease(t / trip) * L;
  else if ((t -= trip) < dwell) s = L;
  else if ((t -= dwell) < trip) { s = L - ease(t / trip) * L; dir = -1; }
  else { s = 0; dir = -1; }
  const i = Math.max(1, cum.findIndex((c) => c >= s));
  const k = Math.min(1, (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]));
  const at = pts[i - 1].map((x, j) => x + (pts[i][j] - x) * k) as V3;
  const nv = route[i - 1] * 3;
  const normal: V3 = [n[nv], n[nv + 1], n[nv + 2]];
  const heading = pts[i].map((x, j) => (x - pts[i - 1][j]) * dir) as V3;
  return { at: [at[0] + normal[0] * lift, at[1] + normal[1] * lift, at[2] + normal[2] * lift], heading, normal };
}

export const SAIL = {
  /** World units per second. */
  speed: 0.05,
  /** Seconds tied up at each end before sailing back. */
  dwell: 2,
};

export const MOVE = {
  fishing: { speed: 0.025, dwell: 5 },
  cart: { speed: 0.02, dwell: 3 },
  car: { speed: 0.065, dwell: 1.5 },
  train: { speed: 0.08, dwell: 3 },
  cabin: { speed: 0.03, dwell: 2 },
  /** Carts give way to cars after this many days. */
  carsFrom: 30,
};

/** Ferry boat position: kept as its own name for the tests and the ferry. */
export function boatPosition(topo: Topology, route: number[], seconds: number, phase = 0): { at: V3; heading: V3; normal: V3 } {
  return travel(topo, route, seconds, SAIL.speed, SAIL.dwell, phase);
}

/** The boats out on the ferries, as they are at `seconds`. */
export function sailingBoats(topo: Topology, ferries: { route: number[] }[], seconds: number): Polyline[] {
  return ferries.filter((f) => f.route.length >= 2).map((f, i) => {
    const { at, heading, normal } = boatPosition(topo, f.route, seconds, i * 0.37);
    return hullAt(at, heading, normal, f.route[0]);
  });
}

function hullAt(at: V3, heading: V3, normal: V3, fallback: number): Polyline {
  const along = tangent(heading, normal) ?? anyDirection(fallback, normal);
  const across: V3 = [normal[1] * along[2] - normal[2] * along[1], normal[2] * along[0] - normal[0] * along[2], normal[0] * along[1] - normal[1] * along[0]];
  return hull(at, along, across);
}

/**
 * Everything that moves, as it is at `seconds`: ferry and fishing boats,
 * traffic on the roads (carts, then cars as the world ages), trains on the
 * railways, cabins on the cable lines. Not plotted: it's life, not building.
 */
export function movers(topo: Topology, st: Settlements, seconds: number, dt = 0, delays?: Map<string, number>, crossings?: CrossingFrame[]): Polyline[] {
  const out: Polyline[] = [...sailingBoats(topo, st.ferries, seconds)];
  // Trains first: where they are decides which crossings are closed.
  const engines: V3[] = [];
  st.rails.forEach((r, ri) => {
    for (let w = 0; w < 3; w++) {
      const { at, heading, normal } = travel(topo, r.path, seconds - w * 0.16, MOVE.train.speed, MOVE.train.dwell, ri * 0.41, 0.006);
      out.push({ ...vehicle(at, heading, normal, r.path[0], 0.01, 0.0045), kind: 'train' });
      engines.push(at);
    }
  });
  const frames = crossings ?? crossingFrames(topo, st);
  const closed = frames.filter((f) => engines.some((e) => Math.hypot(e[0] - f.at[0], e[1] - f.at[1], e[2] - f.at[2]) < CROSSING.warn));
  for (const f of closed) out.push(...barriers(f).map((b) => ({ ...b, kind: 'barrier' })));
  st.harbours.forEach((h, hi) => {
    st.fishingRoutes(h).forEach((route, i) => {
      if (route.length < 2) return;
      const { at, heading, normal } = travel(topo, route, seconds, MOVE.fishing.speed, MOVE.fishing.dwell, hi * 0.29 + i * 0.5);
      out.push({ ...hullAt(at, heading, normal, route[0]), kind: 'fishing' });
    });
  });
  const cars = st.day >= MOVE.carsFrom;
  st.streets.forEach((r, ri) => {
    if (r.kind !== 'road' || r.path.length < 2) return;
    // Busier roads carry more: one on a track, two on a lane, three on a made road.
    const count = (r.grade ?? 0) + 1;
    for (let i = 0; i < count; i++) {
      const m = cars ? MOVE.car : MOVE.cart;
      // Each vehicle keeps the time it has spent waiting at gates, and runs that much behind.
      const key = `${ri}:${i}`, held = delays?.get(key) ?? 0;
      const { at, heading, normal } = travel(topo, r.path, seconds - held, m.speed, m.dwell, ri * 0.23 + i / count, 0.005);
      out.push({ ...vehicle(at, heading, normal, r.path[0], cars ? 0.008 : 0.005, cars ? 0.004 : 0.004), kind: cars ? 'car' : 'cart' });
      // At a closed gate, heading for the line: wait there. Not once past the
      // gate, though: then it keeps going and clears the line, since held
      // wherever it was when the barriers dropped, a car already on the
      // crossing would stay on it. (The crossing test's first clashes were
      // not this: they were cars waiting at the gate, counted as on the line.)
      const waiting = closed.some((f) => {
        const d = [f.at[0] - at[0], f.at[1] - at[1], f.at[2] - at[2]], dist = Math.hypot(d[0], d[1], d[2]);
        return dist < CROSSING.stop && dist > CROSSING.gate * 0.85 && d[0] * heading[0] + d[1] * heading[1] + d[2] * heading[2] > 0;
      });
      if (waiting && delays) delays.set(key, held + dt);
    }
  });
  st.cables.forEach((c, ci) => {
    const { at, heading, normal } = travel(topo, c.path, seconds, MOVE.cabin.speed, MOVE.cabin.dwell, ci * 0.33, CABLE_MARK.height - 0.004);
    out.push({ ...vehicle(at, heading, normal, c.path[0], 0.005, 0.004), kind: 'cabin' });
  });
  return out;
}

function vehicle(at: V3, heading: V3, normal: V3, fallback: number, long: number, wide: number): Polyline {
  const along = tangent(heading, normal) ?? anyDirection(fallback, normal);
  const across: V3 = [normal[1] * along[2] - normal[2] * along[1], normal[2] * along[0] - normal[0] * along[2], normal[0] * along[1] - normal[1] * along[0]];
  return rectangle(at, normal, across, long, wide, 2, () => 0);
}

function hull(c: V3, along: V3, across: V3): Polyline {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 2 * Math.PI;
    const x = Math.cos(a) * BOAT.long / 2, y = Math.sin(a) * BOAT.beam / 2 * (1 - 0.4 * Math.cos(a)); // pointed bow
    pts.push(c.map((v, k) => v + along[k] * x + across[k] * y));
  }
  const m = polyline(pts, 2);
  return { ...m, closed: true };
}

function lifted(topo: Topology, v: number, lift = MARK.lift): number[] {
  const p = topo.positions, n = topo.normals, o = v * 3;
  return [p[o] + n[o] * lift, p[o + 1] + n[o + 1] * lift, p[o + 2] + n[o + 2] * lift];
}

function polyline(pts: number[][], level: number): Polyline {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return { level, iso: 0, points: new Float32Array(pts.flat()), closed: false, length };
}

// ------------------------------------------------------------ geometry

function tangent(g: V3, nr: V3): V3 | null {
  const d = g[0] * nr[0] + g[1] * nr[1] + g[2] * nr[2];
  const t: V3 = [g[0] - d * nr[0], g[1] - d * nr[1], g[2] - d * nr[2]];
  const l = Math.hypot(t[0], t[1], t[2]);
  return l < 1e-9 ? null : [t[0] / l, t[1] / l, t[2] / l];
}

/** A tangent direction that depends only on the vertex, for flat ground. */
function anyDirection(v: number, nr: V3): V3 {
  const a = (v * 2.399963) % (2 * Math.PI);
  const t = tangent(Math.abs(nr[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], nr)!;
  const b: V3 = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
  return [Math.cos(a) * t[0] + Math.sin(a) * b[0], Math.cos(a) * t[1] + Math.sin(a) * b[1], Math.cos(a) * t[2] + Math.sin(a) * b[2]];
}

/**
 * A flat rectangle centred at `c`, short side along `across`, long side along
 * normal × across, lifted as a whole by the most any point of it needs to
 * clear the ground. Flat keeps its sides straight; laying each point on the
 * ground separately made houses wobble with every bump of the peel. Each
 * side is split so the clearance is checked along it, not just at corners:
 * a rectangle over a bump otherwise buried its short sides and drew as two
 * stray strokes.
 */
function rectangle(c: V3, nr: V3, across: V3, long: number, short: number, level: number, clearance: (q: V3) => number): Polyline {
  const along: V3 = [nr[1] * across[2] - nr[2] * across[1], nr[2] * across[0] - nr[0] * across[2], nr[0] * across[1] - nr[1] * across[0]];
  const hl = long / 2, hs = short / 2, per = 4;
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const flat: V3[] = [];
  for (let e = 0; e < 4; e++) {
    const [i0, j0] = corners[e], [i1, j1] = corners[(e + 1) % 4];
    for (let t = 0; t < per; t++) {
      const f = t / per, i = i0 + (i1 - i0) * f, j = j0 + (j1 - j0) * f;
      flat.push([0, 1, 2].map((a) => c[a] + along[a] * hl * i + across[a] * hs * j) as V3);
    }
  }
  const lift = Math.max(0, ...flat.map(clearance)) + MARK.lift;
  const pts = new Float32Array(flat.length * 3);
  flat.forEach((q, k) => pts.set([q[0] + nr[0] * lift, q[1] + nr[1] * lift, q[2] + nr[2] * lift], k * 3));
  return { level, iso: 0, points: pts, closed: true, length: 2 * (long + short) };
}

function chaikin(pts: number[][]): number[][] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a.map((x, k) => 0.75 * x + 0.25 * b[k]), a.map((x, k) => 0.25 * x + 0.75 * b[k]));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

