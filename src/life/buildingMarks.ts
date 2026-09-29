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
import { MARKET, STAGE, type Block, type Building, type Cable, type Harbour, type Rail, type Settlements, type Stall, type Street, type Town } from './settlements';

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

/**
 * Streets are drawn as two lines, the way a town plan draws a street, so a
 * street can never be mistaken for a contour. Wider for the ways between towns.
 */
export const STREET_WIDTH: Record<string, number> = { street: 0.0032, link: 0.0028, lane: 0.0026, road: 0.0046 };
export const PIER_MARK = { halfWidth: 0.004, head: 0.012 };
export const BOAT = { long: 0.012, beam: 0.005 };

/** What the drawing needs to know about each street vertex. */
export interface WaterState {
  bridgeAt: Set<number>;
  submerged: Map<number, number>;
}

const DRY: WaterState = { bridgeAt: new Set(), submerged: new Map() };

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

/** What the world says about how far everything has grown. */
export function lookOf(st: Settlements): Look {
  const stages = st.streetStages();
  return { house: (b) => st.houseStage(b), hall: (t) => st.hallStands(t), street: (x) => stages.get(x) ?? 2 };
}

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

/**
 * A house's own shape. Every house a rectangle of one size read as
 * procedural, so each varies: size, proportion, a little turn off square,
 * set back unevenly from the street, and about one in three has a wing.
 * Later houses are the outskirts, and stand bigger (farmhouses); the first
 * ones, round the square, narrower (town houses).
 */
export interface HouseShape { long: number; short: number; turn: number; setback: number; wing: null | { side: number; long: number; short: number } }

export function houseShape(b: Building, stage = 2, hall = true): HouseShape {
  if (b.order === 0 && hall) return { long: MARK.long * MARK.hall, short: MARK.short * MARK.hall, turn: 0, setback: 0, wing: null };
  // A town's first building, before it is the hall, is its farmstead: the biggest house.
  const v = b.vertex, out = b.order === 0 ? 1 : Math.min(1, b.order / 60);
  const size = (0.78 + 0.45 * hash(v, 1)) * (0.9 + 0.35 * out);
  const aspect = 1.25 + 0.7 * hash(v, 2) + 0.35 * (1 - out);
  const long = MARK.long * size, short = long / aspect;
  const turn = (hash(v, 7) - 0.5) * 0.35, setback = (hash(v, 8) - 0.5) * 0.004;
  // A hut first: small and squarish. Then the house, and in time its wing.
  if (stage === 0) { const l = long * 0.6; return { long: l, short: Math.min(short * 0.85, l / 1.1), turn, setback, wing: null }; }
  const wing = stage >= 2 && hash(v, 3) < 0.33 ? { side: hash(v, 4) < 0.5 ? -1 : 1, long: long * (0.38 + 0.2 * hash(v, 5)), short: short * (0.6 + 0.3 * hash(v, 6)) } : null;
  return { long, short, turn, setback, wing };
}

function shapeOf(b: Building, look: Look): HouseShape {
  return houseShape(b, look.house(b), look.hall(b.town));
}

/** The furthest any part of a building reaches from its vertex: nothing else may be drawn inside it. */
export function footprintRadius(b: Building, look: Look = GROWN): number {
  const h = shapeOf(b, look);
  let r = Math.hypot(h.long, h.short) / 2 + Math.abs(h.setback);
  if (h.wing) r = Math.max(r, Math.hypot(h.long / 2, h.short / 2 + h.wing.short) + Math.abs(h.setback));
  return r;
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
  /** How far the square reaches at `angle`: its edge follows the ground it keeps, smoothed. */
  radiusAt(angle: number): number;
  /** The point on the square's edge at `angle`. */
  edgeAt(angle: number): V3;
  /** Any point in the square, moved onto the ground and lifted. */
  onGround(q: V3): V3;
  /** How far the ground at `q` stands above it, along the hall's normal (negative if below). */
  clearance(q: V3): number;
  /** Is it a square yet? Until the farmstead is a hall, the ways run in to the farm. */
  open: boolean;
}

export function squareFrames(topo: Topology, streets: Street[], towns: Town[], look: Look = GROWN): Map<number, SquareFrame> {
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
    // The edge is the ground the square keeps, not a compass circle: at each
    // angle, the distance to the ring's vertices, averaged over a wide angle
    // so it is smooth. A true circle read as a rendering bug; the raw ring
    // read as lumpy. This is the shape between them.
    const ringAt = [...ring].map((u) => { const d = off(u); return { a: angleOf(u), r: Math.hypot(d[0], d[1], d[2]) }; });
    const radiusAt = (angle: number) => {
      let w = 0, r = 0;
      for (const q of ringAt) {
        const da = Math.atan2(Math.sin(angle - q.a), Math.cos(angle - q.a));
        const k = Math.exp(-(da * da) / (2 * 0.45 * 0.45));
        w += k; r += k * q.r;
      }
      return w ? r / w : radius;
    };
    const onGround = (q: V3): V3 => {
      const d: V3 = [q[0] - p[h], q[1] - p[h + 1], q[2] - p[h + 2]];
      const dn = d[0] * nx + d[1] * ny + d[2] * nz;
      return lay(d[0] - dn * nx, d[1] - dn * ny, d[2] - dn * nz);
    };
    const at = (angle: number, r: number): V3 => {
      const c = Math.cos(angle) * r, s = Math.sin(angle) * r;
      return lay(c * ax + s * bx, c * ay + s * by, c * az + s * bz);
    };
    const edgeAt = (angle: number) => at(angle, radiusAt(angle));
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
    // The whole edge is lifted by the most any point of it needs, so it stays smooth and above ground.
    let extra = 0;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * 2 * Math.PI, ra = radiusAt(a), c = Math.cos(a) * ra, s = Math.sin(a) * ra;
      const q = lay(c * ax + s * bx, c * ay + s * by, c * az + s * bz);
      extra = Math.max(extra, clearance(q) + MARK.lift);
    }
    function lay(tx: number, ty: number, tz: number): V3 {
      // Height above the hall's tangent plane, interpolated from the ring
      // and the hall by inverse distance, so the circle lies on the ground.
      let wsum = 0, hsum = 0;
      for (const u of samples) {
        const d = off(u);
        const du = Math.hypot(d[0] - tx, d[1] - ty, d[2] - tz) + 1e-6;
        const w = 1 / (du * du);
        wsum += w;
        hsum += w * (d[0] * nx + d[1] * ny + d[2] * nz);
      }
      // Smooth, so the edge is smooth; `extra` keeps it off the ground.
      const up = hsum / wsum + MARK.lift + extra;
      return [p[h] + tx + nx * up, p[h + 1] + ty + ny * up, p[h + 2] + tz + nz * up];
    }
    out.set(st.town, { hall, radius, ring, angleOf, at, radiusAt, edgeAt, onGround, clearance, open: look.hall(st.town) });
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
export function buildingMarks(topo: Topology, heights: Float32Array, buildings: Building[], which: 'standing' | 'drowned' = 'standing', look: Look = GROWN): Polyline[] {
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
    const shape = shapeOf(b, look);
    const across = turned(tangent(g, nr) ?? anyDirection(v, nr), nr, shape.turn);
    const c: V3 = [0, 1, 2].map((k) => p[o + k] - across[k] * shape.setback) as V3;
    return rectangle(c, nr, across, shape.long, shape.short, 1, clearanceNear(topo, v, nr, shape.long * 1.4));
  });
}

/** The wings of the houses that have one: behind the house, at one end, like an added room. */
export function wingMarks(topo: Topology, heights: Float32Array, buildings: Building[], which: 'standing' | 'drowned' = 'standing', look: Look = GROWN): Polyline[] {
  const { positions: p, normals: n } = topo;
  const out: Polyline[] = [];
  for (const b of buildings) {
    if (which === 'standing' ? b.state !== undefined : b.state !== 'drowned') continue;
    const shape = shapeOf(b, look);
    if (!shape.wing || b.front === undefined) continue;
    const v = b.vertex, o = v * 3, f = b.front * 3;
    const nr: V3 = [n[o], n[o + 1], n[o + 2]];
    const across = turned(tangent([p[f] - p[o], p[f + 1] - p[o + 1], p[f + 2] - p[o + 2]], nr) ?? anyDirection(v, nr), nr, shape.turn);
    const along: V3 = [nr[1] * across[2] - nr[2] * across[1], nr[2] * across[0] - nr[0] * across[2], nr[0] * across[1] - nr[1] * across[0]];
    const w = shape.wing;
    // Behind (away from the street), flush with one end, overlapping the house a little so they join.
    const back = shape.setback + shape.short / 2 + w.short / 2 - 0.0008;
    const end = w.side * (shape.long / 2 - w.long / 2);
    const c: V3 = [0, 1, 2].map((k) => p[o + k] - across[k] * back + along[k] * end) as V3;
    out.push(rectangle(c, nr, across, w.long, w.short, 1, clearanceNear(topo, v, nr, shape.long * 1.4)));
  }
  void heights;
  return out;
}

export const TERRACE = {
  /** A terrace is a row of narrow houses this wide, each its own depth, so the back of the row steps... */
  unit: 0.012,
  depth: [0.88, 1.18],
  /** ...its front this far back from the street's side; and it fills a gap between houses up to this many spacings. */
  front: 0.0028,
  infill: 2.5,
};

/**
 * Terraces. In the old core, the houses along one side of a street are
 * built into one row: a strip that follows the street as it is drawn, set
 * just back from it, from the first of them to the last, cut into narrow
 * houses of their own depths so the back of the row steps. A row stops
 * short of any street that joins, and a house with no neighbour in the row
 * stays as it was. Laid along the street rather than along each house:
 * on a coarse mesh the houses of one row stand staggered, as the street's
 * vertices do, and houses stretched along their own sides never met.
 */
export function terraceMarks(topo: Topology, streets: Street[], buildings: Building[], frames: Map<number, SquareFrame>, look: Look = GROWN, spacing = 0.065): { marks: Polyline[]; joined: Set<Building> } {
  const out: Polyline[] = [], joined = new Set<Building>();
  const n = topo.normals, p = topo.positions;
  const row = buildings.filter((b) => b.state === undefined && b.front !== undefined && look.house(b) === 3);
  if (!row.length) return { marks: out, joined };
  const through = new Map<number, Street[]>(); // the ways that end at, or pass through, each vertex
  for (const st of streets) for (const v of st.path) (through.get(v) ?? through.set(v, []).get(v)!).push(st);
  for (const st of streets) {
    if (st.kind === 'square' || st.kind === 'road' || look.street(st) < 2) continue;
    // A house at a corner fronts two streets, but is in one row.
    const onIt = row.filter((b) => !joined.has(b) && st.path.includes(b.front!));
    if (onIt.length < 2) continue;
    const line = groundLine(topo, st.path, buildings, frames, true, true, wander(st, look.street(st)), look);
    if (!line) continue;
    const c: number[][] = [];
    for (let k = 0; k < line.points.length; k += 3) c.push([line.points[k], line.points[k + 1], line.points[k + 2]]);
    const cum = [0];
    for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + d3(c[i], c[i - 1]));
    const normalAt = (i: number): V3 => { const v = st.path[Math.min(st.path.length - 1, Math.round((i / Math.max(1, c.length - 1)) * (st.path.length - 1)))] * 3; return [n[v], n[v + 1], n[v + 2]]; };
    const sideAt = (i: number): V3 => {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)], nr = normalAt(i);
      return normalised([nr[1] * (b[2] - a[2]) - nr[2] * (b[1] - a[1]), nr[2] * (b[0] - a[0]) - nr[0] * (b[2] - a[2]), nr[0] * (b[1] - a[1]) - nr[1] * (b[0] - a[0])]);
    };
    // Where each house stands along the line, and on which side.
    const place = (q: number[]) => {
      let best = { s: 0, i: 0, d: Infinity };
      for (let i = 1; i < c.length; i++) {
        const a = c[i - 1], b = c[i], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / L2));
        const d = d3(q, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
        if (d < best.d) best = { s: cum[i - 1] + t * Math.sqrt(L2), i, d };
      }
      const sd = sideAt(best.i), o = c[best.i];
      return { s: best.s, side: Math.sign((q[0] - o[0]) * sd[0] + (q[1] - o[1]) * sd[1] + (q[2] - o[2]) * sd[2]) || 1 };
    };
    // Junctions along it: a row doesn't run across a way that joins, on the side it leaves by.
    const own = new Set(st.path), cuts: { s: number; side: number }[] = [];
    st.path.forEach((v, i) => {
      if (i === 0 || i === st.path.length - 1) return;
      for (const other of through.get(v) ?? []) {
        if (other === st) continue;
        const j = other.path.indexOf(v);
        for (const w of [other.path[j - 1], other.path[j + 1]]) {
          if (w === undefined || own.has(w)) continue;
          const at = place([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]).s;
          cuts.push({ s: at, side: place([p[w * 3], p[w * 3 + 1], p[w * 3 + 2]]).side });
        }
      }
    });
    const half = (STREET_WIDTH[st.kind] ?? 0.003) * (look.street(st) === 3 ? WAY.main : 1);
    for (const side of [1, -1]) {
      const here = onIt.map((b) => ({ b, ...place([p[b.vertex * 3], p[b.vertex * 3 + 1], p[b.vertex * 3 + 2]]) })).filter((x) => x.side === side).sort((x, y) => x.s - y.s);
      const cut = cuts.filter((x) => x.side === side).map((x) => x.s);
      let group: typeof here = [];
      const flush = () => {
        if (group.length >= 2) {
          // A street's ends are junctions too, and it bends there to meet what it meets.
          const clear = half + TERRACE.front * 2 + STAGE.rowDepth * TERRACE.depth[1];
          const s0 = Math.max(clear, group[0].s - STAGE.rowEnd), s1 = Math.min(cum[cum.length - 1] - clear, group[group.length - 1].s + STAGE.rowEnd);
          const m = strip(c, cum, sideAt, side, s0, s1, half + TERRACE.front, group[0].b.vertex, cut, half);
          if (m) { out.push(m); for (const g of group) joined.add(g.b); }
        }
        group = [];
      };
      for (const x of here) {
        const prev = group[group.length - 1];
        // An empty plot or two between old houses is built in; a longer gap, or a way that joins, ends the row.
        if (prev && (x.s - prev.s > spacing * TERRACE.infill || cut.some((s) => s > prev.s && s < x.s))) flush();
        group.push(x);
      }
      flush();
    }
  }
  return { marks: out, joined };
}

/** A terrace's strip along a line, from `s0` to `s1`, `off` out to one side, its houses each their own depth. */
function strip(c: number[][], cum: number[], sideAt: (i: number) => V3, side: number, s0: number, s1: number, off: number, seed: number, cuts: number[], half: number): Polyline | null {
  // Pulled back from any junction inside it (the way that joins is drawn there).
  for (const s of cuts) {
    if (s > s0 - 0.01 && s < s0 + 0.01) s0 = s + half + TERRACE.front * 2;
    if (s > s1 - 0.01 && s < s1 + 0.01) s1 = s - half - TERRACE.front * 2;
  }
  if (s1 - s0 < TERRACE.unit * 1.5) return null;
  const at = (s: number, out: number): number[] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = c[i - 1], b = c[i], sd = sideAt(i);
    return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t + sd[k] * side * out);
  };
  const units = Math.max(2, Math.round((s1 - s0) / TERRACE.unit));
  const ss = Array.from({ length: units + 1 }, (_, i) => s0 + ((s1 - s0) * i) / units);
  const depth = (i: number) => STAGE.rowDepth * (TERRACE.depth[0] + (TERRACE.depth[1] - TERRACE.depth[0]) * hash(seed * 17 + i, 41));
  // The front follows the street closely, a point every few thousandths.
  const front: number[][] = [];
  for (let s = s0; s < s1; s += 0.003) front.push(at(s, off));
  front.push(at(s1, off));
  const back: number[][] = [];
  for (let i = units - 1; i >= 0; i--) back.push(at(ss[i + 1], off + depth(i)), at(ss[i], off + depth(i)));
  const fill: number[] = [];
  for (let i = 0; i < units; i++) {
    const a = at(ss[i], off), b = at(ss[i + 1], off), cc = at(ss[i + 1], off + depth(i)), d = at(ss[i], off + depth(i));
    fill.push(...a, ...b, ...cc, ...a, ...cc, ...d);
  }
  return { ...polyline([...front, ...back], 1), closed: true, fill };
}

function d3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A flat closed outline and the quads that fill it, lifted as a whole by
 * the most any point needs to clear the ground (as `rectangle` is).
 */
function flatSolid(outline: V3[], quads: V3[][], nr: V3, clearance: (q: V3) => number, level = 1, lift = liftFor(outline, clearance)): Polyline {
  const up = (q: V3): V3 => [q[0] + nr[0] * lift, q[1] + nr[1] * lift, q[2] + nr[2] * lift];
  const fill: number[] = [];
  for (const [a, b, c, d] of quads.map((q) => q.map(up))) fill.push(...a, ...b, ...c, ...a, ...c, ...d);
  return { ...polyline(outline.map(up), level), closed: true, fill };
}

/** How high a flat outline must be lifted for every point along it to clear the ground. */
function liftFor(outline: V3[], clearance: (q: V3) => number): number {
  const samples: V3[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    for (let t = 0; t < 3; t++) samples.push([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * (t / 3)) as V3);
  }
  return Math.max(0, ...samples.map(clearance)) + MARK.lift;
}

/** `d` turned by `angle` about the normal `nr`. */
function turned(d: V3, nr: V3, angle: number): V3 {
  if (!angle) return d;
  const b: V3 = [nr[1] * d[2] - nr[2] * d[1], nr[2] * d[0] - nr[0] * d[2], nr[0] * d[1] - nr[1] * d[0]];
  const c = Math.cos(angle), s = Math.sin(angle);
  return [d[0] * c + b[0] * s, d[1] * c + b[1] * s, d[2] * c + b[2] * s];
}

// ------------------------------------------------------------ terraces and blocks

/** Gardens and courtyard blocks, drawn, and which houses a built-round block has taken in. */
export interface BlockDrawing {
  lines: Polyline[];
  absorbed: Set<number>;
}

export const BLOCK = {
  /**
   * A block's building stands this far in from the drawn streets round it:
   * a made street's half-width, and a walked path's meander, and a little.
   */
  gap: 0.013,
  /** Each house round the court is about this wide and this deep... */
  unit: 0.016,
  depth: 0.013,
  /** ...and a block that would leave a court narrower than this is built over whole. */
  court: 0.01,
  /** Garden rows: this far apart, and in from the edge. (Dotted like furrows they came to thousands of marks for the pen.) */
  row: 0.009,
  margin: 0.012,
};

/**
 * Blocks as they have grown up: gardens first, rows between the houses;
 * the oldest near the core built round all sides with a courtyard inside
 * (whatwesaved's `_perimeter`: the shape a city, rather than a town, is
 * made of), as a ring of narrow houses, each its own depth.
 */
export function blockMarks(topo: Topology, blocks: Block[], stageOf: (k: Block) => number, buildings: Building[], streets: Street[], look: Look = GROWN): BlockDrawing {
  const out: BlockDrawing = { lines: [], absorbed: new Set() };
  const standing = buildings.filter((b) => b.state === undefined);
  const p = topo.positions;
  for (const k of blocks) {
    const stage = stageOf(k);
    if (!stage) continue;
    const ring = new Set(k.ring), segs: [V3, V3][] = [];
    for (const st of streets) for (let i = 1; i < st.path.length; i++) {
      const a = st.path[i - 1], b = st.path[i];
      // Either end: a corner of the block's streets needn't touch its ground, and without it the rays leak out.
      if (ring.has(a) || ring.has(b)) segs.push([[p[a * 3], p[a * 3 + 1], p[a * 3 + 2]], [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]]]);
    }
    const f = blockFrame(topo, k, segs);
    if (!f) continue;
    if (stage === 2) {
      const n = Math.max(8, Math.round(f.perimeter / BLOCK.unit));
      const angles = Array.from({ length: n + 1 }, (_, i) => (i / n) * 2 * Math.PI);
      const R = angles.map((a) => f.radiusAt(a) - BLOCK.gap);
      if (Math.min(...R) < BLOCK.depth * 0.6) continue; // too small to build round: its houses stay as they are
      for (const b of standing) if (k.vertices.includes(b.vertex)) out.absorbed.add(b.vertex);
      if (Math.max(...R) < BLOCK.depth + BLOCK.court) {
        // A small block is built over whole: no court.
        const c = f.flat(0, 0), outer = angles.slice(0, n).map((a, i) => f.flat(a, R[i]));
        out.lines.push(flatSolid(outer, outer.map((q, i) => [c, q, outer[(i + 1) % n], c]), f.nr, f.clearance));
        continue;
      }
      // Round the court, a house to each stretch of frontage, each its own
      // depth, and never so deep it fills the court: where the block
      // pinches in, a house is shallower, or there is a gap (a way through).
      const units: V3[][] = [];
      for (let i = 0; i < n; i++) {
        const want = BLOCK.depth * (0.75 + 0.55 * hash(k.vertices[0] * 29 + i, 43));
        const d = Math.min(want, Math.min(R[i], R[i + 1]) - BLOCK.court);
        if (d < BLOCK.depth * 0.5) continue;
        const a0 = angles[i], a1 = angles[i + 1];
        units.push([f.flat(a0, R[i]), f.flat(a1, R[i + 1]), f.flat(a1, R[i + 1] - d), f.flat(a0, R[i] - d)]);
      }
      const lift = Math.max(...units.map((u) => liftFor(u, f.clearance)));
      for (const u of units) out.lines.push(flatSolid(u, [u], f.nr, f.clearance, 1, lift));
      continue;
    }
    // Gardens: rows across the block, clear of its houses.
    const houses = standing.filter((b) => k.vertices.includes(b.vertex)).map((b) => ({ q: f.planar(b.vertex), r: footprintRadius(b, look) * 1.2 }));
    const dir = hash(k.vertices[0], 31) * Math.PI, u = [Math.cos(dir), Math.sin(dir)], w = [-u[1], u[0]];
    const reach = f.reach, lift = f.lift + MARK.lift;
    for (let o = -reach + BLOCK.row / 2; o < reach; o += BLOCK.row) {
      let run: number[][] = [];
      const flush = () => {
        if (run.length >= 2) {
          const m = polyline(run, 0);
          if (m.length > 0.008) out.lines.push(m);
        }
        run = [];
      };
      for (let t = -reach; t <= reach; t += 0.002) {
        const x = w[0] * o + u[0] * t, y = w[1] * o + u[1] * t;
        const inside = Math.hypot(x, y) < f.radiusAt(Math.atan2(y, x)) - BLOCK.margin && houses.every((h) => Math.hypot(x - h.q[0], y - h.q[1]) > h.r);
        if (!inside) { flush(); continue; }
        const q = f.xy(x, y);
        run.push([q[0] + f.nr[0] * lift, q[1] + f.nr[1] * lift, q[2] + f.nr[2] * lift]);
      }
      flush();
    }
  }
  return out;
}

/**
 * A block laid flat in the tangent plane at its middle, with its edge at
 * each angle where a ray from the middle first reaches a street round it.
 * An edge averaged from the ring's vertices overshot the street wherever
 * the block was concave, and its buildings were drawn across the street.
 */
function blockFrame(topo: Topology, k: Block, segs: [V3, V3][]) {
  const { positions: p, normals: n } = topo;
  if (!segs.length) return null;
  const c: V3 = [0, 0, 0], ns: V3 = [0, 0, 0];
  for (const v of k.vertices) for (let j = 0; j < 3; j++) { c[j] += p[v * 3 + j] / k.vertices.length; ns[j] += n[v * 3 + j]; }
  const nr = normalised(ns);
  const ax = tangent(Math.abs(nr[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], nr)!;
  const bx: V3 = [nr[1] * ax[2] - nr[2] * ax[1], nr[2] * ax[0] - nr[0] * ax[2], nr[0] * ax[1] - nr[1] * ax[0]];
  const proj = (q: V3): [number, number] => {
    const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
    return [d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2], d[0] * bx[0] + d[1] * bx[1] + d[2] * bx[2]];
  };
  const planar = (u: number) => proj([p[u * 3], p[u * 3 + 1], p[u * 3 + 2]]);
  const flatSegs = segs.map(([a, b]) => [proj(a), proj(b)]);
  // The middle must be on the block's own ground (a crescent's isn't), or the rays mean nothing.
  const nearest = (vs: number[]) => Math.min(...vs.map((u) => Math.hypot(...planar(u))));
  if (nearest(k.ring) < nearest(k.vertices)) return null;
  const ray = (angle: number): number => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best = Infinity;
    for (const [[x0, y0], [x1, y1]] of flatSegs) {
      const ex = x1 - x0, ey = y1 - y0, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (x0 * ey - y0 * ex) / den, s = (x0 * dy - y0 * dx) / den;
      if (t > 0 && s >= -0.05 && s <= 1.05) best = Math.min(best, t);
    }
    return best;
  };
  const N = 72, raw = Array.from({ length: N }, (_, i) => ray((i / N) * 2 * Math.PI));
  if (raw.some((r) => !Number.isFinite(r) || r > 0.25)) return null;
  // Smoothed, but never out past the street: each angle takes the least of itself and its neighbours' mean.
  const R = raw.map((r, i) => Math.min(r, (raw[(i + N - 1) % N] + r + raw[(i + 1) % N]) / 3));
  const radiusAt = (angle: number) => {
    const x = ((((angle / (2 * Math.PI)) % 1) + 1) % 1) * N, i = Math.floor(x) % N, t = x - Math.floor(x);
    return R[i] * (1 - t) + R[(i + 1) % N] * t;
  };
  const xy = (x: number, y: number): V3 => [c[0] + ax[0] * x + bx[0] * y, c[1] + ax[1] * x + bx[1] * y, c[2] + ax[2] * x + bx[2] * y];
  const flat = (a: number, r: number): V3 => xy(Math.cos(a) * r, Math.sin(a) * r);
  const reach = Math.max(...R);
  let perimeter = 0;
  for (let i = 0; i < N; i++) perimeter += Math.hypot(R[i] - R[(i + 1) % N], R[i] * (2 * Math.PI) / N);
  const middle = k.vertices.reduce((best, v) => (Math.hypot(...planar(v)) < Math.hypot(...planar(best)) ? v : best), k.vertices[0]);
  const clearance = clearanceNear(topo, middle, nr, reach);
  let lift = clearance(flat(0, 0));
  for (let i = 0; i < 24; i++) lift = Math.max(lift, clearance(flat((i / 24) * 2 * Math.PI, radiusAt((i / 24) * 2 * Math.PI) * 0.8)));
  return { nr, planar, radiusAt, xy, flat, reach, perimeter, clearance, lift };
}

function normalised(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
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

/**
 * Market stalls in slots round the hall, each roughly facing it. Each stall
 * is nudged off its slot, in and out of the ring, and in size, seeded by
 * itself alone, so the market reads as a crowd and not a clock face.
 */
export function stallMarks(stalls: Stall[], frames: Map<number, SquareFrame>, topo: Topology): Polyline[] {
  const { positions: p, normals: n } = topo;
  const out: Polyline[] = [];
  for (const st of stalls) {
    const f = frames.get(st.town);
    if (!f) continue;
    const seed = st.town * 31 + st.slot;
    const a = stallAngle(st.slot) + (hash(seed, 11) - 0.5) * (Math.PI / MARKET.most) * 0.5;
    // Never in on the hall: at least its reach and a stall's from its middle.
    const r = Math.max(f.radiusAt(a) * MARKET.ring * (0.85 + 0.25 * hash(seed, 12)), footprintRadius({ vertex: f.hall, town: st.town, order: 0 }) + STALL_CLEAR);
    const c = f.at(a, r);
    const h = f.hall * 3;
    const nr: V3 = [n[h], n[h + 1], n[h + 2]];
    const toHall = tangent([p[h] - c[0], p[h + 1] - c[1], p[h + 2] - c[2]], nr) ?? anyDirection(f.hall, nr);
    const base = f.onGround(c);
    const size = 0.8 + 0.4 * hash(seed, 13);
    out.push(rectangle(base, nr, turned(toHall, nr, (hash(seed, 14) - 0.5) * 0.6), STALL.long * size, STALL.short * size, 2, (q) => f.clearance(q)));
  }
  return out;
}

/** A stall stands this far beyond the hall's reach: its own half-diagonal, and room to pass. */
const STALL_CLEAR = 0.0145;

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
export function streetMarks(topo: Topology, streets: Street[], buildings: Building[], frames: Map<number, SquareFrame>, water: WaterState = DRY, look: Look = GROWN): Polyline[] {
  const out: Polyline[] = [];
  for (const st of streets) {
    // A square's edge isn't drawn: a square is the open ground the houses
    // and streets leave round the hall. Drawn as a ring (and paved), it read
    // as a selection, or a rendering bug.
    if (st.path.length < 2 || st.kind === 'square') continue;
    const stage = look.street(st);
    for (const run of runsOf(st.path, water)) {
      if (run.kind === 'dry') {
        const m = groundLine(topo, run.path, buildings, frames, run.first, run.last, wander(st, stage), look);
        if (!m) continue;
        // Drawn by what it has worn into, as a survey draws them: a dotted
        // footpath, a dashed track, a made street, and the main street wider.
        if (stage === 0) out.push(...dashes(m, WAY.path[0], WAY.path[1]));
        else if (stage === 1) out.push(...dashes(m, WAY.track[0], WAY.track[1]));
        else out.push(...twoSides(topo, m, run.path, (STREET_WIDTH[st.kind] ?? 0.003) * (stage === 3 ? WAY.main : 1)));
      } else if (run.kind === 'bridge') {
        out.push(...deck(topo, run.path, BRIDGE_MARK.halfWidth, 'ticks'));
      }
    }
  }
  return out;
}

/**
 * Before there is a square, the houses round the farmstead's yard are
 * reached by walking across it: a dotted path from each door to the farm.
 * The yard's edge is a street in the plan, but nobody has made it up yet.
 */
export function yardPaths(topo: Topology, buildings: Building[], frames: Map<number, SquareFrame>, look: Look = GROWN): Polyline[] {
  const out: Polyline[] = [];
  const byVertex = new Map(buildings.filter((b) => b.state === undefined).map((b) => [b.vertex, b]));
  for (const f of frames.values()) {
    if (f.open) continue;
    const farm = byVertex.get(f.hall);
    if (!farm) continue;
    for (const b of byVertex.values()) {
      if (b.front === undefined || !f.ring.has(b.front)) continue;
      const a = f.angleOf(b.front), inward = footprintRadius(farm, look) * 1.15;
      let pts: number[][] = [lifted(topo, b.vertex), f.edgeAt(a), f.at(a, (f.radiusAt(a) + inward) / 2), f.at(a, inward)];
      for (let r = 0; r < 3; r++) pts = chaikin(pts);
      pts = trimStart(pts, pts[0], footprintRadius(b, look) * 1.05);
      if (pts.length >= 2) out.push(...dashes(polyline(pts, 0), WAY.path[0], WAY.path[1]));
    }
  }
  return out;
}

/** Dash and gap of a walked path and a worn track, and how much wider a main street is. */
export const WAY = { path: [0.0028, 0.0055], track: [0.011, 0.0045], main: 1.45 };

/** The parts of streets now under water, for drawing with the water. */
export function sunkenMarks(topo: Topology, streets: Street[], water: WaterState, frames?: Map<number, SquareFrame>): Polyline[] {
  const out: Polyline[] = [];
  void frames;
  for (const st of streets) {
    if (st.kind === 'square') continue;
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
/**
 * How much a way meanders, and its own seed. Every road the same clean curve
 * read as procedural: a track wanders most, a made road least.
 */
function wander(st: Street, stage: number): { amount: number; seed: number } {
  // A walked path wanders most; a way is straightened a little each time it is made up.
  const byStage = [0.0065, 0.005, 0.003, 0.0025][stage] ?? 0.003;
  const byKind: Record<string, number> = { street: 1, link: 0.75, lane: 0.95, road: 1.15 };
  return { amount: byStage * (byKind[st.kind] ?? 1), seed: st.path[0] * 31 + st.path[st.path.length - 1] };
}

/** Lay a gentle meander across a line: two waves, settling to nothing at each end so junctions still meet. */
function meander(topo: Topology, pts: number[][], path: number[], amount: number, seed: number): number[][] {
  if (pts.length < 3 || !amount) return pts;
  const n = topo.normals, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1];
  const p0 = hash(seed, 10) * 6.283, p1 = hash(seed, 11) * 6.283, p2 = hash(seed, 12) * 6.283;
  const l0 = 0.14 + 0.08 * hash(seed, 15), l1 = 0.06 + 0.04 * hash(seed, 13), l2 = 0.025 + 0.015 * hash(seed, 14);
  return pts.map((q, i) => {
    if (i === 0 || i === pts.length - 1) return q;
    const s = cum[i], settle = Math.min(1, s / 0.03, (L - s) / 0.03);
    const a = pts[i - 1], b = pts[i + 1], v = path[Math.min(path.length - 1, Math.round((i / (pts.length - 1)) * (path.length - 1)))] * 3;
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], nr = [n[v], n[v + 1], n[v + 2]];
    const side = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
    const sl = Math.hypot(side[0], side[1], side[2]) || 1;
    // A long slow bend, a middling wander, and a little unevenness on top.
    const off = amount * settle * (0.9 * Math.sin((6.283 * s) / l0 + p0) + 0.6 * Math.sin((6.283 * s) / l1 + p1) + 0.25 * Math.sin((6.283 * s) / l2 + p2));
    return q.map((x, k) => x + (side[k] / sl) * off);
  });
}

function groundLine(topo: Topology, path: number[], buildings: Building[], frames: Map<number, SquareFrame>, first: boolean, last: boolean, wobble = { amount: 0, seed: 0 }, look: Look = GROWN): Polyline | null {
  const byVertex = new Map(buildings.filter((b) => b.state === undefined).map((b) => [b.vertex, b]));
  const onSquare = (v: number) => { for (const f of frames.values()) if (f.ring.has(v)) return f; return undefined; };
  let pts: number[][] = path.map((v) => lifted(topo, v));
  for (const [i, isEnd] of [[0, first], [pts.length - 1, last]] as [number, boolean][]) {
    const f = isEnd ? onSquare(path[i]) : undefined;
    if (!f) continue;
    if (f.open) { pts[i] = f.edgeAt(f.angleOf(path[i])); continue; }
    // No square yet: the ways run on in to the farmstead's door.
    const farm = byVertex.get(f.hall);
    const reach = farm ? footprintRadius(farm, look) * 1.15 : f.radius * 0.3;
    const a = f.angleOf(path[i]), inward = [f.edgeAt(a), f.at(a, (f.radiusAt(a) + reach) / 2), f.at(a, reach)];
    if (i === 0) pts.splice(0, 1, ...inward.reverse());
    else pts.splice(pts.length - 1, 1, ...inward);
  }
  // Four rounds, not two: the mesh only turns in steps of about 60°, and with
  // two rounds a town's streets still read as a honeycomb of those angles.
  for (let r = 0; r < 4; r++) pts = chaikin(pts);
  pts = meander(topo, pts, path, wobble.amount, wobble.seed);
  for (const end of [0, 1]) {
    const b = byVertex.get(end === 0 ? path[0] : path[path.length - 1]);
    if (!b || pts.length < 2) continue;
    if (end === 1) pts.reverse();
    pts = trimStart(pts, pts[0], footprintRadius(b, look) * 1.05);
    if (end === 1) pts.reverse();
  }
  if (pts.length < 2) return null;
  const m = polyline(pts, 0);
  return m.length < MARK.shortest ? null : m;
}

/** A street's two sides, either side of its drawn centre line. */
function twoSides(topo: Topology, centre: Polyline, path: number[], half: number): Polyline[] {
  const n = topo.normals, c: number[][] = [];
  for (let k = 0; k < centre.points.length; k += 3) c.push([centre.points[k], centre.points[k + 1], centre.points[k + 2]]);
  const side = (i: number): V3 => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    const t: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = path[Math.min(path.length - 1, Math.round((i / Math.max(1, c.length - 1)) * (path.length - 1)))] * 3;
    const nr: V3 = [n[v], n[v + 1], n[v + 2]];
    const s: V3 = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
    const l = Math.hypot(s[0], s[1], s[2]) || 1;
    return [s[0] / l, s[1] / l, s[2] / l];
  };
  const sides = c.map((_, i) => side(i));
  // A street isn't the same width all along: it swells and narrows a little.
  const seed = path[0] * 7 + path[path.length - 1], ph = hash(seed, 21) * 6.283;
  let along = 0;
  const widths = c.map((q, i) => {
    if (i) along += Math.hypot(q[0] - c[i - 1][0], q[1] - c[i - 1][1], q[2] - c[i - 1][2]);
    return half * (1 + 0.18 * Math.sin((6.283 * along) / 0.08 + ph));
  });
  return [1, -1].map((sign) => polyline(c.map((q, i) => q.map((x, k) => x + sign * widths[i] * sides[i][k])), 0));
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

/** A line cut into dashes `on` long with gaps `off` long. */
function dashes(m: Polyline, on0: number, off = on0): Polyline[] {
  const pts: number[][] = [];
  for (let k = 0; k < m.points.length; k += 3) pts.push([m.points[k], m.points[k + 1], m.points[k + 2]]);
  const out: Polyline[] = [];
  // Cut exactly, at any spacing: a footpath's dots are shorter than the line's own steps.
  let on = true, left = on0;
  let run: number[][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (d > left) {
      const t = left / d, c = a.map((x, k) => x + (b[k] - x) * t);
      if (on) { run.push(c); if (run.length >= 2) out.push(polyline(run, m.level)); run = []; }
      else run = [c];
      on = !on; d -= left; a = c; left = on ? on0 : off;
    }
    left -= d;
    if (on) run.push(b);
  }
  if (on && run.length >= 2) out.push(polyline(run, m.level));
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

/** Gateposts either side of the line, on both sides of the road: a level crossing as maps mark one. */
export function crossingMarks(frames: CrossingFrame[]): Polyline[] {
  const out: Polyline[] = [];
  for (const f of frames) {
    const side: V3 = [f.normal[1] * f.road[2] - f.normal[2] * f.road[1], f.normal[2] * f.road[0] - f.normal[0] * f.road[2], f.normal[0] * f.road[1] - f.normal[1] * f.road[0]];
    for (const along of [1, -1]) for (const across of [1, -1]) {
      const c = [0, 1, 2].map((k) => f.at[k] + f.road[k] * along * CROSSING.gate + side[k] * across * f.half * 2.2) as V3;
      out.push(rectangle(c, f.normal, f.road, 0.0028, 0.0028, 1, () => 0));
    }
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

/** A cable line: the cable held above the ground, and pylons down to it. */
export function cableMarks(topo: Topology, cables: Cable[]): Polyline[] {
  const out: Polyline[] = [];
  for (const c of cables) {
    const ground = c.path.map((v) => lifted(topo, v, 0.002));
    const high = c.path.map((v, i) => lifted(topo, v, i === 0 || i === c.path.length - 1 ? 0.004 : CABLE_MARK.height));
    out.push(polyline(chaikin(high), 0));
    let since = CABLE_MARK.pylonEvery;
    for (let i = 1; i < c.path.length - 1; i++) {
      since += Math.hypot(ground[i][0] - ground[i - 1][0], ground[i][1] - ground[i - 1][1], ground[i][2] - ground[i - 1][2]);
      if (since < CABLE_MARK.pylonEvery) continue;
      since = 0;
      out.push(polyline([ground[i], high[i]], 0));
    }
    // A station at each end.
    for (const i of [0, c.path.length - 1]) {
      const v = c.path[i] * 3, nr: V3 = [topo.normals[v], topo.normals[v + 1], topo.normals[v + 2]];
      const across = anyDirection(c.path[i], nr);
      const q: V3 = [ground[i][0], ground[i][1], ground[i][2]];
      out.push(rectangle(q, nr, across, 0.012, 0.008, 1, () => 0));
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

/**
 * How far the ground near vertex `v` rises above a point, along `nr`. The
 * ground under a point is a triangle among its nearest vertices, and no
 * triangle is higher than its highest corner, so that is the bound.
 */
function clearanceNear(topo: Topology, v: number, nr: V3, size: number): (q: V3) => number {
  const p = topo.positions;
  const near = groundWithin(topo, v, size * 1.6);
  const xs = new Float64Array(near.length * 3);
  near.forEach((u, i) => xs.set([p[u * 3], p[u * 3 + 1], p[u * 3 + 2]], i * 3));
  return (q) => {
    // The three nearest, in one pass: this is asked for every sample of every outline.
    let d0 = Infinity, d1 = Infinity, d2 = Infinity, h0 = 0, h1 = 0, h2 = 0;
    for (let i = 0; i < xs.length; i += 3) {
      const dx = xs[i] - q[0], dy = xs[i + 1] - q[1], dz = xs[i + 2] - q[2];
      const d = dx * dx + dy * dy + dz * dz, h = dx * nr[0] + dy * nr[1] + dz * nr[2];
      if (d < d0) { d2 = d1; h2 = h1; d1 = d0; h1 = h0; d0 = d; h0 = h; }
      else if (d < d1) { d2 = d1; h2 = h1; d1 = d; h1 = h; }
      else if (d < d2) { d2 = d; h2 = h; }
    }
    return Math.max(h0, d1 < Infinity ? h1 : -Infinity, d2 < Infinity ? h2 : -Infinity);
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
