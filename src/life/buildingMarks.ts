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
import { MARKET, type Building, type Stall, type Street, type Town } from './settlements';

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
export function buildingMarks(topo: Topology, heights: Float32Array, buildings: Building[]): Polyline[] {
  const { positions: p, normals: n } = topo;
  return buildings.map((b) => {
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
export function streetMarks(topo: Topology, streets: Street[], buildings: Building[], frames: Map<number, SquareFrame>): Polyline[] {
  const { positions: p, normals: n } = topo;
  const byVertex = new Map(buildings.map((b) => [b.vertex, b]));
  const onSquare = (v: number) => { for (const f of frames.values()) if (f.ring.has(v)) return f; return undefined; };
  const out: Polyline[] = [];
  for (const st of streets) {
    if (st.path.length < 2) continue;
    if (st.kind === 'square') {
      const f = frames.get(st.town);
      if (f) out.push(circle(f));
      continue;
    }
    let pts: number[][] = st.path.map((v) => {
      const o = v * 3;
      return [p[o] + n[o] * MARK.lift, p[o + 1] + n[o + 1] * MARK.lift, p[o + 2] + n[o + 2] * MARK.lift];
    });
    for (const i of [0, pts.length - 1]) {
      const f = onSquare(st.path[i]);
      if (f) pts[i] = f.at(f.angleOf(st.path[i]), f.radius);
    }
    for (let r = 0; r < 2; r++) pts = chaikin(pts);
    for (const end of [0, 1]) {
      const b = byVertex.get(end === 0 ? st.path[0] : st.path[st.path.length - 1]);
      if (!b || pts.length < 2) continue;
      if (end === 1) pts.reverse();
      pts = trimStart(pts, pts[0], footprintRadius(b) * 1.05);
      if (end === 1) pts.reverse();
    }
    if (pts.length < 2) continue;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    if (length < MARK.shortest) continue;
    out.push({ level: 0, iso: 0, points: new Float32Array(pts.flat()), closed: false, length });
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
