/**
 * Drafting: working out the lines and the signs to draw, from the finer
 * surface's heights and fields, with nothing of the drawing itself in it. It
 * is the heaviest work the page does (the contours alone are tens of
 * milliseconds), so it runs in a worker (drafts.worker.ts), and the page only
 * takes what comes back and hands it to the pens and the stipple.
 */
import { extractContours, type Polyline } from '../terrain/contours';
import type { Topology } from '../mesh/topology';
import { stippleDots } from '../render/stippleDots';

/** The finer surface, as the worker knows it: its triangles, where each vertex is, and where it is now. */
export interface Surface {
  vertexCount: number;
  triangles: Uint32Array;
  basePositions: Float32Array;
  positions: Float32Array;
  normals: Float32Array;
}

export function surfaceOf(triangles: Uint32Array, basePositions: Float32Array): Surface {
  return { vertexCount: basePositions.length / 3, triangles, basePositions, positions: new Float32Array(basePositions.length), normals: basePositions.slice() };
}

/** Raise the surface to its heights, as the page draws it: land by `relief`, the sea at the sphere. */
export function shape(s: Surface, heights: Float32Array, relief: number): void {
  const b = s.basePositions, p = s.positions;
  for (let v = 0; v < s.vertexCount; v++) {
    const r = 1 + relief * Math.max(0, heights[v]);
    p[v * 3] = b[v * 3] * r; p[v * 3 + 1] = b[v * 3 + 1] * r; p[v * 3 + 2] = b[v * 3 + 2] * r;
  }
}

/** Scraps of line shorter than this are only the triangles showing, not the land: they're left out. */
export const SCRAP = 0.02;

/**
 * Contours as a hand would draw them: each corner cut twice (Chaikin's rule, a quarter and three
 * quarters along every segment), so the little zigzags where a line crosses the triangles go, and
 * the scraps are dropped.
 */
export function rounded(lines: Polyline[]): Polyline[] {
  const out: Polyline[] = [];
  for (const line of lines) {
    if (line.length < SCRAP) continue;
    // First eased along (each point drawn toward its neighbours), which takes out the sawtooth a
    // line gets crossing the triangles one by one on a steep slope; then its corners cut.
    let p = line.points;
    for (let pass = 0; pass < 3; pass++) p = ease(p, line.closed);
    for (let pass = 0; pass < 2; pass++) p = chaikin(p, line.closed);
    let length = 0;
    const n = p.length / 3;
    for (let i = 1; i < n + (line.closed ? 1 : 0); i++) {
      const a = (i - 1) * 3, b = (i % n) * 3;
      length += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    }
    out.push({ ...line, points: p, length });
  }
  return out;
}

/** Each point moved halfway toward the middle of its two neighbours (an open line keeps its ends). */
function ease(p: Float32Array, closed: boolean): Float32Array {
  const n = p.length / 3;
  if (n < 4) return p;
  const out = p.slice();
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = ((i - 1 + n) % n) * 3, b = i * 3, c = ((i + 1) % n) * 3;
    for (let k = 0; k < 3; k++) out[b + k] = p[b + k] * 0.5 + (p[a + k] + p[c + k]) * 0.25;
  }
  return out;
}

function chaikin(p: Float32Array, closed: boolean): Float32Array {
  const n = p.length / 3;
  if (n < 3) return p;
  const segs = closed ? n : n - 1, out = new Float32Array((segs * 2 + (closed ? 0 : 2)) * 3);
  let o = 0;
  const put = (x: number, y: number, z: number) => { out[o++] = x; out[o++] = y; out[o++] = z; };
  if (!closed) put(p[0], p[1], p[2]); // an open line keeps its ends where they are
  for (let s = 0; s < segs; s++) {
    const a = s * 3, b = ((s + 1) % n) * 3;
    put(p[a] + (p[b] - p[a]) * 0.25, p[a + 1] + (p[b + 1] - p[a + 1]) * 0.25, p[a + 2] + (p[b + 2] - p[a + 2]) * 0.25);
    put(p[a] + (p[b] - p[a]) * 0.75, p[a + 1] + (p[b + 1] - p[a + 1]) * 0.75, p[a + 2] + (p[b + 2] - p[a + 2]) * 0.75);
  }
  if (!closed) put(p[(n - 1) * 3], p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]);
  return out;
}

/**
 * The two sets of lines: the land's contours (the coast among them), and the sea's depth lines,
 * set wide, as a chart shows only a few. (No water-lining: of all the lines it was the most, and
 * the most often redrawn, and a calm map is better without it.)
 */
export function draftLines(s: Surface, h: Float32Array): { land: Polyline[]; sea: Polyline[] } {
  const n = s.vertexCount, sea = new Uint8Array(n), land = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (h[v] < 0) sea[v] = 1; else land[v] = 1;
  }
  const t = s as unknown as Topology; // the extractor uses only what a Surface has: triangles, positions, normals
  return {
    land: rounded(extractContours(t, h, { interval: 0.035, lift: 0.003, mask: sea })),
    sea: rounded(extractContours(t, h, { interval: 0.14, lift: 0.002, mask: land })),
  };
}

/**
 * Life's signs, and the breakers: for each kind, dots over the triangles where it lives, closer
 * where there's more of it (moss a fine stipple, the other signs set sparsely, as a map sets them:
 * `density` is each kind's dots per unit area at its thinnest, and what each step thicker adds);
 * and short strokes on the water off coasts the sea is wearing, thicker the harder it works.
 * `kind` is each vertex's kind (an index, or -1), and `fine` says which kinds are stippled finely.
 */
export function draftLife(s: Surface, life: Float32Array, wear: Float32Array, h: Float32Array, kind: Int8Array, density: [number, number][]): { kinds: Float32Array[]; foam: Float32Array } {
  const byKind = density.map(() => [[], [], [], []] as number[][]), surf: number[][] = [[], [], []];
  const t = s.triangles, P = s.positions;
  const push = (into: number[], a: number, b: number, d: number, lift: number) => {
    into.push(P[a * 3] * lift, P[a * 3 + 1] * lift, P[a * 3 + 2] * lift, P[b * 3] * lift, P[b * 3 + 1] * lift, P[b * 3 + 2] * lift, P[d * 3] * lift, P[d * 3 + 1] * lift, P[d * 3 + 2] * lift);
  };
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], d = t[i + 2];
    const l = Math.min(life[a], life[b], life[d]);
    if (l > 0.02) {
      const k = kind[a];
      if (k >= 0) push(byKind[k][Math.min(3, Math.floor(l * 4))], a, b, d, 1.002);
    }
    const w = Math.max(wear[a], wear[b], wear[d]);
    if (w > 0.0003 && Math.min(h[a], h[b], h[d]) < 0) push(surf[Math.min(2, Math.floor(w / 0.0012))], a, b, d, 1.0015);
  }
  return {
    kinds: byKind.map((levels, k) => Float32Array.from(clumped(levels.flatMap((tris, lv) => stippleDots(tris, density[k][0] + density[k][1] * lv, true)), 18 + k * 5, k))),
    foam: Float32Array.from(surf.flatMap((tris, lv) => stippleDots(tris, 900 + 1500 * lv, true))),
  };
}

/**
 * Life grows in patches, not evenly: keep each dot or not by a smooth noise over the world (by its
 * direction, so the same dot is always kept or not), thick in some places, thin or bare in others,
 * each kind its own pattern (`seed`) at its own scale.
 */
function clumped(dots: number[], scale: number, seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < dots.length; i += 3) {
    const x = dots[i], y = dots[i + 1], z = dots[i + 2], l = Math.hypot(x, y, z) || 1;
    const n = noise3(x / l * scale + seed * 17.1, y / l * scale - seed * 5.3, z / l * scale + seed * 9.7) * 0.65 + noise3(x / l * scale * 2.7, y / l * scale * 2.7, z / l * scale * 2.7 + seed) * 0.35;
    // And a fixed chance of its own, so the edge of a patch is ragged, not a cut line.
    if (hash3(Math.round(x / l * 4096), Math.round(y / l * 4096), Math.round(z / l * 4096)) < (n - 0.28) * 2.2) out.push(x, y, z);
  }
  return out;
}

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth value noise, 0 to 1. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const at = (a: number, b: number, c: number) => hash3(ix + a, iy + b, iz + c);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), sx), lerp(at(0, 1, 0), at(1, 1, 0), sx), sy),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), sx), lerp(at(0, 1, 1), at(1, 1, 1), sx), sy),
    sz,
  );
}

/**
 * Lines packed for the journey between threads: all their points in one array, and what each line
 * is in a few more, so sending them costs almost nothing, where thousands of small objects cost a lot.
 */
export interface Packed { points: Float32Array; starts: Uint32Array; levels: Float32Array; isos: Float32Array; closed: Uint8Array; lengths: Float32Array }

export function pack(lines: Polyline[]): Packed {
  let total = 0;
  for (const l of lines) total += l.points.length;
  const points = new Float32Array(total), starts = new Uint32Array(lines.length + 1);
  const levels = new Float32Array(lines.length), isos = new Float32Array(lines.length), closed = new Uint8Array(lines.length), lengths = new Float32Array(lines.length);
  let o = 0;
  lines.forEach((l, i) => {
    points.set(l.points, o); starts[i] = o; o += l.points.length;
    levels[i] = l.level; isos[i] = l.iso; closed[i] = l.closed ? 1 : 0; lengths[i] = l.length;
  });
  starts[lines.length] = o;
  return { points, starts, levels, isos, closed, lengths };
}

/** The lines again, each its points as a view into the one array. */
export function unpack(p: Packed): Polyline[] {
  const out: Polyline[] = [];
  for (let i = 0; i + 1 < p.starts.length; i++) {
    out.push({ level: p.levels[i], iso: p.isos[i], points: p.points.subarray(p.starts[i], p.starts[i + 1]), closed: p.closed[i] === 1, length: p.lengths[i] });
  }
  return out;
}

/** What to hand over with a packed set of lines, so its arrays move rather than being copied. */
export function packedBuffers(p: Packed): ArrayBuffer[] {
  return [p.points, p.starts, p.levels, p.isos, p.closed, p.lengths].map((a) => a.buffer as ArrayBuffer);
}
