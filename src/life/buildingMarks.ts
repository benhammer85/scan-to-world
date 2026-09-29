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
import { MARKET, type Building, type Harbour, type Stall, type Street, type Town } from './settlements';

export const MARK = {
  long: 0.024,
  short: 0.015,
  /** A town's first building is its hall, and is drawn bigger. */
  hall: 1.5,
  lift: 0.003,
  /** Street fragments shorter than this after trimming are not drawn: they read as stray ticks. */
  shortest: 0.015,
};

export const STALL = { long: 0.013, short: 0.008 };

export const BRIDGE_MARK = { halfWidth: 0.006, tick: 0.008 };
export const PIER_MARK = { halfWidth: 0.004, head: 0.012 };
export const BOAT = { long: 0.012, beam: 0.005 };

/** What the drawing needs to know about each street vertex. */
export interface WaterState {
  bridgeAt: Set<number>;
  submerged: Map<number, number>;
}

const DRY: WaterState = { bridgeAt: new Set(), submerged: new Map() };

type V3 = [number, number, number];

/** Half the diagonal of a building's footprint: nothing else may be drawn inside it. */
export function footprintRadius(b: Building): number {
  const s = b.order === 0 ? MARK.hall : 1;
  return Math.hypot(MARK.long * s, MARK.short * s) / 2;
}

// ------------------------------------------------------------ squares

/** A town's square as drawn: a circle on the ground round its hall. */
export interface SquareFrame {
  hall: number;
  radius: number;
  /** Ring vertices of the network, for street ends to snap to. */
  ring: Set<number>;
  angleOf(u: number): number;
  /** A point on the ground at `angle` and `r` from the hall, lifted for drawing. */
  at(angle: number, r: number): V3;
  /** Any point in the square, moved onto the ground and lifted. */
  onGround(q: V3): V3;
  /** How far the ground at `q` stands above it, along the hall's normal (negative if below). */
  clearance(q: V3): number;
}

export function squareFrames(topo: Topology, streets: Street[], towns: Town[]): Map<number, SquareFrame> {
  const { positions: p, normals: n } = topo;
  const out = new Map<number, SquareFrame>();
  for (const st of streets) {
    if (st.kind !== 'square') continue;
    const hall = towns[st.town].centre, h = hall * 3;
    const nx = n[h], ny = n[h + 1], nz = n[h + 2];
    const ax0 = tangent(Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0], [nx, ny, nz])!;
    const [ax, ay, az] = ax0;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    const ring = new Set(st.path);
    // Every vertex of the square's ground, not only its edge and hall: the
    // ground curves between them, and heights taken from the edge alone put
    // stalls under the surface, half hidden.
    const samples = groundWithin(topo, hall, Math.max(...[...ring].map((u) => Math.hypot(p[u * 3] - p[h], p[u * 3 + 1] - p[h + 1], p[u * 3 + 2] - p[h + 2]))) * 1.05);
    const off = (u: number): V3 => [p[u * 3] - p[h], p[u * 3 + 1] - p[h + 1], p[u * 3 + 2] - p[h + 2]];
    let radius = 0;
    for (const u of ring) { const d = off(u); radius += Math.hypot(d[0], d[1], d[2]); }
    radius /= ring.size;
    const angleOf = (u: number) => { const d = off(u); return Math.atan2(d[0] * bx + d[1] * by + d[2] * bz, d[0] * ax + d[1] * ay + d[2] * az); };
    const onGround = (q: V3): V3 => {
      const d: V3 = [q[0] - p[h], q[1] - p[h + 1], q[2] - p[h + 2]];
      const dn = d[0] * nx + d[1] * ny + d[2] * nz;
      return lay(d[0] - dn * nx, d[1] - dn * ny, d[2] - dn * nz);
    };
    const at = (angle: number, r: number): V3 => {
      const c = Math.cos(angle) * r, s = Math.sin(angle) * r;
      return lay(c * ax + s * bx, c * ay + s * by, c * az + s * bz);
    };
    // How far the ground at a point rises above the smooth surface `lay`
    // uses: the ground under a point is a triangle among its nearest
    // vertices, never higher than the highest of the three.
    const clearance = (q: V3): number => {
      const d: V3 = [q[0] - p[h], q[1] - p[h + 1], q[2] - p[h + 2]];
      const qn = d[0] * nx + d[1] * ny + d[2] * nz;
      const near = samples.map((u) => { const o = off(u); return [Math.hypot(o[0] - d[0], o[1] - d[1], o[2] - d[2]), o[0] * nx + o[1] * ny + o[2] * nz]; });
      near.sort((x, y) => x[0] - y[0]);
      return Math.max(...near.slice(0, 3).map((x) => x[1])) - qn;
    };
    // The whole circle is lifted by the most any point of it needs, so it stays round and above ground.
    let extra = 0;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * 2 * Math.PI, c = Math.cos(a) * radius, s = Math.sin(a) * radius;
      const q = lay(c * ax + s * bx, c * ay + s * by, c * az + s * bz);
      extra = Math.max(extra, clearance(q) + MARK.lift);
    }
    function lay(tx: number, ty: number, tz: number): V3 {
      // Height above the hall's tangent plane, interpolated from the ring
      // and the hall by inverse distance, so the circle lies on the ground.
      let wsum = 0, hsum = 0;
      const nearest: [number, number][] = [];
      for (const u of samples) {
        const d = off(u);
        const du = Math.hypot(d[0] - tx, d[1] - ty, d[2] - tz) + 1e-6;
        const w = 1 / (du * du), hu = d[0] * nx + d[1] * ny + d[2] * nz;
        wsum += w;
        hsum += w * hu;
        nearest.push([du, hu]);
      }
      nearest.sort((x, y) => x[0] - y[0]);
      // Smooth, so the circle is round; `clearance` below keeps it off the ground.
      const up = hsum / wsum + MARK.lift + extra;
      void nearest;
      return [p[h] + tx + nx * up, p[h + 1] + ty + ny * up, p[h + 2] + tz + nz * up];
    }
    out.set(st.town, { hall, radius, ring, angleOf, at, onGround, clearance });
  }
  return out;
}

/**
 * The vertices within `r` of `from`, and never fewer than its two nearest
 * rings of neighbours. A radius alone is in world units and the mesh is not:
 * on a coarse mesh a house-sized radius held only the house's own vertex, so
 * every point was "draped" onto that one height, which is flat.
 */
function groundWithin(topo: Topology, from: number, r: number, rings = 2): number[] {
  const p = topo.positions, out: number[] = [];
  const depth = new Map([[from, 0]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    out.push(u);
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (depth.has(w)) continue;
      const dw = depth.get(u)! + 1;
      const near = Math.hypot(p[w * 3] - p[from * 3], p[w * 3 + 1] - p[from * 3 + 1], p[w * 3 + 2] - p[from * 3 + 2]) <= r;
      if (!near && dw > rings) continue;
      depth.set(w, dw);
      queue.push(w);
    }
  }
  return out;
}

// ------------------------------------------------------------ houses

/**
 * A small closed rectangle on the ground. A house is turned to face the
 * street point it fronts, so a row along one street stands in line. A hall
 * (no front) runs along the contour.
 */
export function buildingMarks(topo: Topology, heights: Float32Array, buildings: Building[], which: 'standing' | 'drowned' = 'standing'): Polyline[] {
  const { positions: p, normals: n } = topo;
  const shown = buildings.filter((b) => (which === 'standing' ? b.state === undefined : b.state === 'drowned'));
  return shown.map((b) => {
    const v = b.vertex, o = v * 3;
    const nr: V3 = [n[o], n[o + 1], n[o + 2]];
    let g: V3 = [0, 0, 0];
    if (b.front !== undefined) {
      // Across: from the house to its street.
      const f = b.front * 3;
      g = [p[f] - p[o], p[f + 1] - p[o + 1], p[f + 2] - p[o + 2]];
    } else {
      // Uphill, from neighbour offsets weighted by the height difference.
      for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) {
        const u = topo.nbrList[k] * 3, dh = heights[u / 3] - heights[v];
        g[0] += (p[u] - p[o]) * dh; g[1] += (p[u + 1] - p[o + 1]) * dh; g[2] += (p[u + 2] - p[o + 2]) * dh;
      }
    }
    const across = tangent(g, nr) ?? anyDirection(v, nr);
    const s = b.order === 0 ? MARK.hall : 1;
    const c: V3 = [p[o], p[o + 1], p[o + 2]];
    return rectangle(c, nr, across, MARK.long * s, MARK.short * s, 1, clearanceNear(topo, v, nr, MARK.long * s));
  });
}

/**
 * Where a house drowned and the water has since gone: the corners of its
 * outline and nothing else, unless something new stands on the spot.
 */
export function ruinMarks(topo: Topology, heights: Float32Array, buildings: Building[]): Polyline[] {
  const standingAt = new Set(buildings.filter((b) => b.state === undefined).map((b) => b.vertex));
  const ruins = buildings.filter((b) => b.state === 'ruin' && !standingAt.has(b.vertex));
  const whole = buildingMarks(topo, heights, ruins.map((b) => ({ ...b, state: undefined })));
  const out: Polyline[] = [];
  for (const m of whole) {
    const n = m.points.length / 3, per = n / 4;
    for (let c = 0; c < 4; c++) {
      const at = (i: number) => m.points.subarray((((i % n) + n) % n) * 3, (((i % n) + n) % n) * 3 + 3);
      const pts = new Float32Array([...at(c * per - 1), ...at(c * per), ...at(c * per + 1)]);
      let length = 0;
      for (let k = 3; k < 9; k += 3) length += Math.hypot(pts[k] - pts[k - 3], pts[k + 1] - pts[k - 2], pts[k + 2] - pts[k - 1]);
      out.push({ level: 1, iso: 0, points: pts, closed: false, length });
    }
  }
  return out;
}

/** Market stalls in even slots on a ring round the hall, each facing it. */
export function stallMarks(stalls: Stall[], frames: Map<number, SquareFrame>, topo: Topology): Polyline[] {
  const { positions: p, normals: n } = topo;
  const out: Polyline[] = [];
  for (const st of stalls) {
    const f = frames.get(st.town);
    if (!f) continue;
    const c = f.at(stallAngle(st.slot), f.radius * MARKET.ring);
    const h = f.hall * 3;
    const nr: V3 = [n[h], n[h + 1], n[h + 2]];
    const toHall = tangent([p[h] - c[0], p[h + 1] - c[1], p[h + 2] - c[2]], nr) ?? anyDirection(f.hall, nr);
    const base = f.onGround(c);
    out.push(rectangle(base, nr, toHall, STALL.long, STALL.short, 2, (q) => f.clearance(q)));
  }
  return out;
}

export function stallAngle(slot: number): number {
  return ((slot + 0.5) / MARKET.most) * 2 * Math.PI;
}

// ------------------------------------------------------------ streets

/**
 * Streets as pen lines. A path along mesh edges is a staircase, so it gets
 * two rounds of corner cutting (as the map app does to its contours), with
 * the ends held so streets still meet exactly at their junctions. An end at
 * a house or hall is trimmed back to the footprint; an end on a square is
 * moved onto the square's drawn circle.
 */
export function streetMarks(topo: Topology, streets: Street[], buildings: Building[], frames: Map<number, SquareFrame>, water: WaterState = DRY): Polyline[] {
  const out: Polyline[] = [];
  for (const st of streets) {
    if (st.path.length < 2) continue;
    if (st.kind === 'square') {
      const f = frames.get(st.town);
      if (f) out.push(...squareEdge(f, water, 'dry'));
      continue;
    }
    for (const run of runsOf(st.path, water)) {
      if (run.kind === 'dry') {
        const m = groundLine(topo, run.path, buildings, frames, run.first, run.last);
        if (m) out.push(m);
      } else if (run.kind === 'bridge') {
        out.push(...deck(topo, run.path, BRIDGE_MARK.halfWidth, 'ticks'));
      }
    }
  }
  return out;
}

/** The parts of streets now under water, for drawing with the water. */
export function sunkenMarks(topo: Topology, streets: Street[], water: WaterState, frames?: Map<number, SquareFrame>): Polyline[] {
  const out: Polyline[] = [];
  for (const st of streets) {
    if (st.kind === 'square') {
      const f = frames?.get(st.town);
      if (f) out.push(...squareEdge(f, water, 'sunk'));
      continue;
    }
    for (const run of runsOf(st.path, water)) {
      if (run.kind !== 'sunk') continue;
      const pts = chaikin(chaikin(run.path.map((v) => lifted(topo, v))));
      out.push(polyline(pts, 0));
    }
  }
  return out;
}

type Run = { kind: 'dry' | 'bridge' | 'sunk'; path: number[]; first: boolean; last: boolean };

/**
 * A street split where it goes over water (a bridge) or under it (sunk).
 * Neighbouring runs share their boundary vertex, so a bridge reaches from
 * bank to bank and the street on either side meets it.
 */
function runsOf(path: number[], water: WaterState): Run[] {
  const kind = (v: number): Run['kind'] => (water.bridgeAt.has(v) ? 'bridge' : water.submerged.has(v) ? 'sunk' : 'dry');
  const runs: Run[] = [];
  let start = 0;
  for (let i = 1; i <= path.length; i++) {
    const k = kind(path[start]);
    if (i < path.length && kind(path[i]) === k) continue;
    // Wet runs take the bank vertex on each side; dry runs stop at the bank.
    const from = k === 'dry' ? start : Math.max(0, start - 1);
    const to = k === 'dry' ? i - 1 : Math.min(path.length - 1, i);
    const piece = path.slice(from, to + 1);
    if (piece.length >= 2) runs.push({ kind: k, path: piece, first: from === 0, last: to === path.length - 1 });
    start = i;
  }
  return runs;
}

/** A street on the ground: smoothed, its ends snapped onto squares and trimmed at buildings. */
function groundLine(topo: Topology, path: number[], buildings: Building[], frames: Map<number, SquareFrame>, first: boolean, last: boolean): Polyline | null {
  const byVertex = new Map(buildings.filter((b) => b.state === undefined).map((b) => [b.vertex, b]));
  const onSquare = (v: number) => { for (const f of frames.values()) if (f.ring.has(v)) return f; return undefined; };
  let pts: number[][] = path.map((v) => lifted(topo, v));
  for (const [i, isEnd] of [[0, first], [pts.length - 1, last]] as [number, boolean][]) {
    const f = isEnd ? onSquare(path[i]) : undefined;
    if (f) pts[i] = f.at(f.angleOf(path[i]), f.radius);
  }
  for (let r = 0; r < 2; r++) pts = chaikin(pts);
  for (const end of [0, 1]) {
    const b = byVertex.get(end === 0 ? path[0] : path[path.length - 1]);
    if (!b || pts.length < 2) continue;
    if (end === 1) pts.reverse();
    pts = trimStart(pts, pts[0], footprintRadius(b) * 1.05);
    if (end === 1) pts.reverse();
  }
  if (pts.length < 2) return null;
  const m = polyline(pts, 0);
  return m.length < MARK.shortest ? null : m;
}

/**
 * Two rails either side of a centreline: a bridge deck (with the splayed
 * end ticks maps give a bridge) or a pier (with a head across its end).
 */
function deck(topo: Topology, path: number[], half: number, ends: 'ticks' | 'head'): Polyline[] {
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

export const SAIL = {
  /** World units per second. */
  speed: 0.05,
  /** Seconds tied up at each end before sailing back. */
  dwell: 2,
};

/**
 * Where each ferry's boat is at `seconds`: out along the route, a rest at
 * the far pier, back, a rest at home, and again. Pointed the way it sails.
 */
export function boatPosition(topo: Topology, route: number[], seconds: number, phase = 0): { at: V3; heading: V3; normal: V3 } {
  const p = topo.positions, n = topo.normals;
  const pts = route.map((v) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]] as V3);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1] || 1e-6, trip = L / SAIL.speed, cycle = 2 * (trip + SAIL.dwell);
  let t = (seconds + phase * cycle) % cycle;
  // Eased at both ends, so a boat slows into the pier and gathers way leaving it.
  const ease = (x: number) => x * x * (3 - 2 * x);
  let s: number, dir = 1;
  if (t < trip) s = ease(t / trip) * L;
  else if ((t -= trip) < SAIL.dwell) s = L;
  else if ((t -= SAIL.dwell) < trip) { s = L - ease(t / trip) * L; dir = -1; }
  else { s = 0; dir = -1; }
  const i = Math.max(1, cum.findIndex((c) => c >= s));
  const k = Math.min(1, (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]));
  const at = pts[i - 1].map((x, j) => x + (pts[i][j] - x) * k) as V3;
  const nv = route[i - 1] * 3;
  const normal: V3 = [n[nv], n[nv + 1], n[nv + 2]];
  const heading = pts[i].map((x, j) => (x - pts[i - 1][j]) * dir) as V3;
  const lift = 0.004;
  return { at: [at[0] + normal[0] * lift, at[1] + normal[1] * lift, at[2] + normal[2] * lift], heading, normal };
}

/** The boats out on the ferries, as they are at `seconds`. */
export function sailingBoats(topo: Topology, ferries: { route: number[] }[], seconds: number): Polyline[] {
  return ferries.filter((f) => f.route.length >= 2).map((f, i) => {
    const { at, heading, normal } = boatPosition(topo, f.route, seconds, i * 0.37);
    const along = tangent(heading, normal) ?? anyDirection(f.route[0], normal);
    const across: V3 = [normal[1] * along[2] - normal[2] * along[1], normal[2] * along[0] - normal[0] * along[2], normal[0] * along[1] - normal[1] * along[0]];
    return hull(at, along, across);
  });
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

/**
 * A square's edge, dry arcs or sunken ones. Whole and round while the square
 * is dry; where water has come over part of its ring, that part goes to the
 * water and the rest stays in ink, as for any other street.
 */
function squareEdge(f: SquareFrame, water: WaterState, want: 'dry' | 'sunk', samples = 64): Polyline[] {
  const ring = [...f.ring].map((u) => ({ a: f.angleOf(u), sunk: water.submerged.has(u) }));
  if (!ring.some((r) => r.sunk)) return want === 'dry' ? [circle(f, samples)] : [];
  if (ring.every((r) => r.sunk)) return want === 'sunk' ? [circle(f, samples)] : [];
  const sunkAt = (a: number) => {
    let best = ring[0], bd = Infinity;
    for (const r of ring) { const d = Math.abs(Math.atan2(Math.sin(a - r.a), Math.cos(a - r.a))); if (d < bd) { bd = d; best = r; } }
    return best.sunk;
  };
  // Start the walk where the kind changes, so no arc is split across the seam.
  const angles = Array.from({ length: samples }, (_, i) => (i / samples) * 2 * Math.PI);
  let start = angles.findIndex((a, i) => sunkAt(a) !== sunkAt(angles[(i + samples - 1) % samples]));
  if (start < 0) start = 0;
  const out: Polyline[] = [];
  let arc: number[][] = [];
  for (let k = 0; k <= samples; k++) {
    const a = angles[(start + k) % samples], s = sunkAt(a);
    const mine = (want === 'sunk') === s;
    if (mine) arc.push(f.at(a, f.radius));
    if ((!mine || k === samples) && arc.length) {
      if (mine === false) arc.push(f.at(a, f.radius)); // meet the next arc
      if (arc.length >= 2) out.push(polyline(arc, 0));
      arc = [];
    }
  }
  return out;
}

function circle(f: SquareFrame, samples = 64): Polyline {
  const pts = new Float32Array(samples * 3);
  for (let i = 0; i < samples; i++) pts.set(f.at((i / samples) * 2 * Math.PI, f.radius), i * 3);
  return { level: 0, iso: 0, points: pts, closed: true, length: 2 * Math.PI * f.radius };
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

/**
 * How far the ground near vertex `v` rises above a point, along `nr`. The
 * ground under a point is a triangle among its nearest vertices, and no
 * triangle is higher than its highest corner, so that is the bound.
 */
function clearanceNear(topo: Topology, v: number, nr: V3, size: number): (q: V3) => number {
  const p = topo.positions;
  const near = groundWithin(topo, v, size * 1.6);
  return (q) => {
    const best = near
      .map((u) => { const d: V3 = [p[u * 3] - q[0], p[u * 3 + 1] - q[1], p[u * 3 + 2] - q[2]]; return [Math.hypot(d[0], d[1], d[2]), d[0] * nr[0] + d[1] * nr[1] + d[2] * nr[2]]; })
      .sort((x, y) => x[0] - y[0]);
    return Math.max(...best.slice(0, 3).map((x) => x[1]));
  };
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

/** Drop the start of a polyline that lies within `r` of `c`, cutting the crossing segment exactly. */
function trimStart(pts: number[][], c: number[], r: number): number[][] {
  const d = (q: number[]) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
  let i = 0;
  while (i < pts.length && d(pts[i]) < r) i++;
  if (i === 0 || i >= pts.length) return i >= pts.length ? [] : pts;
  const a = pts[i - 1], b = pts[i], da = d(a), db = d(b);
  const t = (r - da) / (db - da || 1);
  return [a.map((x, k) => x + (b[k] - x) * t), ...pts.slice(i)];
}
