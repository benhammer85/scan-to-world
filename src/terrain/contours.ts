/**
 * Isolines on an arbitrary triangle mesh ("marching triangles").
 *
 * This is the 3D-surface analogue of marching squares on a 2D map grid: instead of
 * walking grid cells we walk triangles, and a contour crosses a triangle along the
 * two edges whose endpoints straddle the iso value. Segments are then chained into
 * polylines through shared edges, so each contour can be drawn in as one stroke by
 * the plotter shader (which needs arc length along a continuous line).
 */
import type { Topology } from '../mesh/topology';

export interface Polyline {
  /** Index of the contour level (0 = lowest). */
  level: number;
  /** Iso value this line traces. */
  iso: number;
  /** xyz points, already lifted off the surface along the normal. */
  points: Float32Array;
  closed: boolean;
  /** Total arc length. */
  length: number;
  /** What a moving mark is (a train, a car...), for anything that needs to tell them apart. */
  kind?: string;
}

export interface ContourOptions {
  /** Height spacing between contour lines, in heightfield units. */
  interval: number;
  /** Distance to lift lines off the surface (avoids z-fighting). */
  lift: number;
  /** Vertices to leave out: a triangle with all three masked gets no line (land contours stop at the shore). */
  mask?: Uint8Array;
}

/** Contour levels are anchored to multiples of `interval`, so editing the terrain
 *  never shifts existing lines, it only bends them or adds new levels. */
export function contourLevels(heights: Float32Array, interval: number): number[] {
  let min = Infinity, max = -Infinity;
  for (const h of heights) { if (h < min) min = h; if (h > max) max = h; }
  const levels: number[] = [];
  for (let k = Math.floor(min / interval) + 1; k * interval < max; k++) levels.push(k * interval);
  return levels;
}

export function extractContours(topo: Topology, heights: Float32Array, opts: ContourOptions): Polyline[] {
  const levels = contourLevels(heights, opts.interval);
  if (levels.length === 0) return [];
  const base = levels[0] / opts.interval;
  const { triangles, positions, normals } = topo;
  const nv = topo.vertexCount;

  // Bucket crossing segments by level. A triangle spanning [hmin, hmax] only
  // intersects levels inside that range, so we skip the rest.
  const segsByLevel: number[][] = levels.map(() => []); // flat list of edge-key pairs
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    if (opts.mask && opts.mask[a] && opts.mask[b] && opts.mask[c]) continue;
    const ha = heights[a], hb = heights[b], hc = heights[c];
    const lo = Math.min(ha, hb, hc), hi = Math.max(ha, hb, hc);
    // Small tolerance so float error never drops a level; the >= test below decides.
    const k0 = Math.max(0, Math.ceil(lo / opts.interval - base - 1e-6));
    const k1 = Math.min(levels.length - 1, Math.floor(hi / opts.interval - base + 1e-6));
    for (let k = k0; k <= k1; k++) {
      const iso = levels[k];
      const ua = ha >= iso, ub = hb >= iso, uc = hc >= iso;
      if (ua === ub && ub === uc) continue;
      // Exactly two of the three edges straddle iso.
      const crossings: number[] = [];
      if (ua !== ub) crossings.push(edgeKey(a, b, nv));
      if (ub !== uc) crossings.push(edgeKey(b, c, nv));
      if (uc !== ua) crossings.push(edgeKey(c, a, nv));
      segsByLevel[k].push(crossings[0], crossings[1]);
    }
  }

  const out: Polyline[] = [];
  for (let k = 0; k < levels.length; k++) {
    const iso = levels[k];
    for (const chain of chainSegments(segsByLevel[k])) {
      const count = chain.keys.length;
      const pts = new Float32Array(count * 3);
      let length = 0;
      for (let i = 0; i < count; i++) {
        edgePoint(chain.keys[i], nv, iso, heights, positions, normals, opts.lift, pts, i * 3);
        if (i > 0) length += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
      }
      if (chain.closed && count > 1) {
        length += Math.hypot(pts[0] - pts[count * 3 - 3], pts[1] - pts[count * 3 - 2], pts[2] - pts[count * 3 - 1]);
      }
      out.push({ level: k, iso, points: pts, closed: chain.closed, length });
    }
  }
  return out;
}

function edgeKey(a: number, b: number, nv: number): number {
  return a < b ? a * nv + b : b * nv + a;
}

function edgePoint(
  key: number, nv: number, iso: number, heights: Float32Array,
  positions: Float32Array, normals: Float32Array, lift: number,
  out: Float32Array, o: number,
): void {
  const a = Math.floor(key / nv), b = key - a * nv;
  const t = (iso - heights[a]) / (heights[b] - heights[a]);
  const a3 = a * 3, b3 = b * 3;
  for (let i = 0; i < 3; i++) {
    const p = positions[a3 + i] + t * (positions[b3 + i] - positions[a3 + i]);
    const n = normals[a3 + i] + t * (normals[b3 + i] - normals[a3 + i]);
    out[o + i] = p + n * lift;
  }
}

/**
 * Chain segments (pairs of edge keys) into polylines. On a manifold mesh every
 * crossed edge is shared by at most two segments, so each chain is a simple walk.
 * Chains that hit a mesh boundary (holes in the scan) come out open.
 */
export function chainSegments(flat: number[]): { keys: number[]; closed: boolean }[] {
  const segCount = flat.length / 2;
  const byEdge = new Map<number, number[]>();
  for (let s = 0; s < segCount; s++) {
    for (const key of [flat[s * 2], flat[s * 2 + 1]]) {
      const list = byEdge.get(key);
      if (list) list.push(s); else byEdge.set(key, [s]);
    }
  }
  const used = new Uint8Array(segCount);

  const walk = (seg: number, fromKey: number, into: number[]): boolean => {
    // Follow segments starting at `seg`, entering through `fromKey`. Returns true if
    // we arrive back at the starting edge (closed loop).
    let key = fromKey;
    const startKey = fromKey;
    let s = seg;
    for (;;) {
      used[s] = 1;
      const next = flat[s * 2] === key ? flat[s * 2 + 1] : flat[s * 2];
      if (next === startKey) return true;
      into.push(next);
      key = next;
      const cands = byEdge.get(key)!;
      const nextSeg = cands.find((c) => !used[c]);
      if (nextSeg === undefined) return false;
      s = nextSeg;
    }
  };

  const chains: { keys: number[]; closed: boolean }[] = [];
  for (let s = 0; s < segCount; s++) {
    if (used[s]) continue;
    const start = flat[s * 2];
    const forward: number[] = [start];
    const closed = walk(s, start, forward);
    if (closed) { chains.push({ keys: forward, closed: true }); continue; }
    // Open chain: also extend backwards from the start edge.
    const backward: number[] = [];
    const cands = byEdge.get(start)!;
    const back = cands.find((c) => !used[c]);
    if (back !== undefined) walk(back, start, backward);
    chains.push({ keys: backward.reverse().concat(forward), closed: false });
  }
  return chains;
}
