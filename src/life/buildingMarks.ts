/**
 * Buildings as pen marks: a small closed rectangle lying on the surface,
 * long side along the contour, the way houses terrace a hillside. Positions
 * are read from the current ground every time, so buildings ride the terrain
 * when it is sculpted.
 */
import type { Topology } from '../mesh/topology';
import type { Polyline } from '../terrain/contours';
import { streetVertices, type Building, type Stall, type Street, type Town } from './settlements';

export const MARK = {
  long: 0.024,
  short: 0.015,
  /** A town's first building is its hall, and is drawn bigger. */
  hall: 1.5,
  lift: 0.003,
};

export function buildingMarks(topo: Topology, heights: Float32Array, buildings: Building[], streets: Street[] = []): Polyline[] {
  const { positions: p, normals: n } = topo;
  const along = streetDirections(streets);
  return buildings.map((b) => {
    const v = b.vertex, o = v * 3;
    const nx = n[o], ny = n[o + 1], nz = n[o + 2];
    // A house faces its street: its long side runs parallel to the street at its front.
    const dir = b.front !== undefined ? along.get(b.front) : undefined;
    // Uphill direction: neighbour offsets weighted by the height difference,
    // flattened into the tangent plane. The long side runs across it.
    let gx = 0, gy = 0, gz = 0;
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) {
      const u = topo.nbrList[k] * 3, dh = heights[u / 3] - heights[v];
      gx += (p[u] - p[o]) * dh; gy += (p[u + 1] - p[o + 1]) * dh; gz += (p[u + 2] - p[o + 2]) * dh;
    }
    if (dir) {
      // Stand in for "uphill" with the direction across the street, so the
      // long side (normal × this) runs along it.
      const [a, c] = dir, sx = p[c * 3] - p[a * 3], sy = p[c * 3 + 1] - p[a * 3 + 1], sz = p[c * 3 + 2] - p[a * 3 + 2];
      gx = ny * sz - nz * sy; gy = nz * sx - nx * sz; gz = nx * sy - ny * sx;
      gx = -gx; gy = -gy; gz = -gz;
    }
    let dot = gx * nx + gy * ny + gz * nz;
    gx -= dot * nx; gy -= dot * ny; gz -= dot * nz;
    let gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-9) {
      // Flat: no uphill, so take any tangent, turned by the vertex so it's stable.
      const a = (v * 2.399963) % (2 * Math.PI);
      const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      dot = ref[0] * nx + ref[1] * ny + ref[2] * nz;
      const tx = ref[0] - dot * nx, ty = ref[1] - dot * ny, tz = ref[2] - dot * nz;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      gx = Math.cos(a) * tx + Math.sin(a) * bx; gy = Math.cos(a) * ty + Math.sin(a) * by; gz = Math.cos(a) * tz + Math.sin(a) * bz;
      gl = Math.hypot(gx, gy, gz);
    }
    gx /= gl; gy /= gl; gz /= gl;
    // Along the contour = normal × uphill.
    const ax = ny * gz - nz * gy, ay = nz * gx - nx * gz, az = nx * gy - ny * gx;
    const s = b.order === 0 ? MARK.hall : 1;
    const hl = (MARK.long * s) / 2, hs = (MARK.short * s) / 2;
    const cx = p[o] + nx * MARK.lift, cy = p[o + 1] + ny * MARK.lift, cz = p[o + 2] + nz * MARK.lift;
    const pts = new Float32Array(12);
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([i, j], k) => {
      pts[k * 3] = cx + ax * hl * i + gx * hs * j;
      pts[k * 3 + 1] = cy + ay * hl * i + gy * hs * j;
      pts[k * 3 + 2] = cz + az * hl * i + gz * hs * j;
    });
    // Level 1: drawn after the streets (level 0), the way a person draws a town.
    return { level: 1, iso: 0, points: pts, closed: true, length: 2 * (MARK.long + MARK.short) * s };
  });
}

/** For each street vertex, two vertices either side of it along its street. */
function streetDirections(streets: Street[]): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const st of streets) {
    const path = streetVertices(st);
    for (let i = 0; i < path.length; i++) {
      if (out.has(path[i])) continue;
      const a = path[Math.max(0, i - 1)], c = path[Math.min(path.length - 1, i + 1)];
      if (a !== c) out.set(path[i], [a, c]);
    }
  }
  return out;
}

/** Half the diagonal of a building's footprint: nothing else may be drawn inside it. */
export function footprintRadius(b: Building): number {
  const s = b.order === 0 ? MARK.hall : 1;
  return Math.hypot(MARK.long * s, MARK.short * s) / 2;
}

/**
 * Streets as pen lines. A path along mesh edges is a staircase, so it gets
 * two rounds of corner cutting (as the map app does to its contours), with
 * the ends held so streets still meet exactly at their junctions. A street's
 * first end is at its building; it is trimmed back to the footprint so the
 * street reaches the door and doesn't run into the house.
 */
export function streetMarks(topo: Topology, streets: Street[], buildings: Building[]): Polyline[] {
  const { positions: p, normals: n } = topo;
  const byVertex = new Map(buildings.map((b) => [b.vertex, b]));
  const out: Polyline[] = [];
  for (const st of streets) {
    if (st.path.length < 2) continue;
    let pts: number[][] = st.path.map((v) => {
      const o = v * 3;
      return [p[o] + n[o] * MARK.lift, p[o + 1] + n[o + 1] * MARK.lift, p[o + 2] + n[o + 2] * MARK.lift];
    });
    // A square's edge is a ring: round it off all the way, with no fixed start.
    const ring = st.kind === 'square' && st.path[0] === st.path[st.path.length - 1];
    if (ring) {
      pts.pop();
      for (let r = 0; r < 2; r++) pts = chaikinRing(pts);
      const flat = new Float32Array(pts.flat());
      let length = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      out.push({ level: 0, iso: 0, points: flat, closed: true, length });
      continue;
    }
    for (let r = 0; r < 2; r++) pts = chaikin(pts);
    const home = st.fromHouse ? byVertex.get(st.path[0]) : undefined;
    if (home) pts = trimStart(pts, pts[0], footprintRadius(home) * 1.05);
    // A street that arrives at a hall stops at its door too.
    const end = byVertex.get(st.path[st.path.length - 1]);
    if (end && pts.length >= 2) pts = trimStart(pts.reverse(), pts[0], footprintRadius(end) * 1.05).reverse();
    const start = home === undefined ? byVertex.get(st.path[0]) : undefined;
    if (start && pts.length >= 2) pts = trimStart(pts, pts[0], footprintRadius(start) * 1.05);
    if (pts.length < 2) continue;
    const flat = new Float32Array(pts.flat());
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    out.push({ level: 0, iso: 0, points: flat, closed: false, length });
  }
  return out;
}

function chaikinRing(pts: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a.map((x, k) => 0.75 * x + 0.25 * b[k]), a.map((x, k) => 0.25 * x + 0.75 * b[k]));
  }
  return out;
}

export const STALL = { long: 0.013, short: 0.008 };

/**
 * Market stalls: small marks in the square, each turned to face the hall,
 * drawn after the houses the way a market goes up after a town has formed.
 */
export function stallMarks(topo: Topology, stalls: Stall[], towns: Town[]): Polyline[] {
  const { positions: p, normals: n } = topo;
  return stalls.map((st) => {
    const o = st.vertex * 3, h = towns[st.town].centre * 3;
    const nx = n[o], ny = n[o + 1], nz = n[o + 2];
    // Towards the hall, flattened onto the ground here; the long side runs across it.
    let rx = p[h] - p[o], ry = p[h + 1] - p[o + 1], rz = p[h + 2] - p[o + 2];
    const dot = rx * nx + ry * ny + rz * nz;
    rx -= dot * nx; ry -= dot * ny; rz -= dot * nz;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    const ax = ny * rz - nz * ry, ay = nz * rx - nx * rz, az = nx * ry - ny * rx;
    const cx = p[o] + nx * MARK.lift, cy = p[o + 1] + ny * MARK.lift, cz = p[o + 2] + nz * MARK.lift;
    const hl = STALL.long / 2, hs = STALL.short / 2;
    const pts = new Float32Array(12);
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([i, j], k) => {
      pts[k * 3] = cx + ax * hl * i + rx * hs * j;
      pts[k * 3 + 1] = cy + ay * hl * i + ry * hs * j;
      pts[k * 3 + 2] = cz + az * hl * i + rz * hs * j;
    });
    return { level: 2, iso: 0, points: pts, closed: true, length: 2 * (STALL.long + STALL.short) };
  });
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
