/**
 * Water, from the shape of the ground. A planet has a sea: the low ground
 * below its sea level that is joined to its lowest point. Every other hollow
 * fills to the height at which it would spill over, draining in the end to
 * the sea (priority-flood depression filling, on the mesh graph), and any
 * holes in the scan drain too.
 *
 * The sea level is set once, from the ground as scanned. Using the current
 * lowest point as the drain instead was unstable: dig a pit deeper than
 * anything else and it became the drain and stayed dry, and the drain could
 * jump across the object, filling a basin somewhere else entirely. Where a
 * thing is comes from the ground, not from the last touch (whatwesaved
 * PRINCIPLES.md, 2).
 *
 * Nobody made the water, so it is not plotted by the pen (whatwesaved's
 * reveal skips the country for the same reason). And what is drawn is what
 * the world is made of (PRINCIPLES.md, 1): the drawn shore is exactly the
 * edge of the `wet` mask that towns keep out of.
 */
import type { Topology } from '../mesh/topology';
import { extractContours, type Polyline } from '../terrain/contours';

export const WATER = {
  /** The sea covers the lowest this share of the scanned surface. */
  seaShare: 0.15,
  /** A basin is a lake only if it is at least this deep (height units)... */
  minDepth: 0.04,
  /** ...and covers at least this much ground (world units², object radius = 1). */
  minArea: 0.004,
  /** Ground under less water than this is shore, not lake. */
  shore: 0.004,
  /** Depth lines inside a lake, every this many height units below the surface. */
  depthStep: 0.04,
};

export const SNOW = {
  /** Snow lies on the highest this share of the scanned surface... */
  share: 0.08,
  /** ...and melts: ground under snow gives this many times the water of bare ground. */
  melt: 3,
};

export const STREAM = {
  /** Ground that drains through a point before a stream shows there (world units²). */
  minArea: 0.3,
  /** Past this much, a stream is a river, drawn with two banks. */
  riverArea: 1.1,
};

export interface Water {
  /** Water surface height per vertex (equals the ground where dry). */
  level: Float32Array;
  /** Depth of water per vertex in a kept lake; 0 where dry. */
  depth: Float32Array;
  /** 1 where a vertex is under water. */
  wet: Uint8Array;
  /** Lakes, not counting the sea. */
  lakes: number;
  /** 1 where a vertex is sea rather than lake. */
  sea: Uint8Array;
  /** Share of the surface under water. */
  share: number;
  /** The filled surface: where water would stand if every hollow held it. Drainage runs down this. */
  filled: Float32Array;
  /** Where each vertex drains to next (-1 at the sea or a drain). */
  down: Int32Array;
  /** Ground draining through each vertex, itself included (world units²). */
  flow: Float32Array;
  /** 1 where a stream runs over dry ground. */
  stream: Uint8Array;
  /** 1 where snow lies (dry ground above the snowline). */
  snow: Uint8Array;
  /** 1 where a lake is frozen (its surface above the snowline). */
  ice: Uint8Array;
}

/** The height below which `share` of the surface lies (by area), from the ground as scanned. */
export function seaLevelFor(topo: Topology, heights: Float32Array, share = WATER.seaShare): number {
  const area = vertexAreas(topo);
  const order = Array.from(heights.keys()).sort((a, b) => heights[a] - heights[b] || a - b);
  let total = 0;
  for (const a of area) total += a;
  let acc = 0;
  for (const v of order) {
    acc += area[v];
    if (acc >= share * total) return heights[v];
  }
  return heights[order[order.length - 1]];
}

/** Where a planet's sea is, fixed from the ground as scanned: its level, and the lowest point it spreads from. */
export interface Sea {
  level: number;
  anchor: number;
  /** Above this height there is snow, and lakes are ice. Also fixed from the scan. */
  snowline?: number;
}

export function seaFor(topo: Topology, scanned: Float32Array, share = WATER.seaShare): Sea {
  let anchor = 0;
  for (let v = 1; v < scanned.length; v++) if (scanned[v] < scanned[anchor]) anchor = v;
  return { level: seaLevelFor(topo, scanned, share), anchor, snowline: seaLevelFor(topo, scanned, 1 - SNOW.share) };
}

export function findWater(topo: Topology, heights: Float32Array, seaAt?: Sea): Water {
  const n = topo.vertexCount;
  const seaLevel = seaAt?.level ?? -Infinity;
  const sea = seaAt ? seaRegion(topo, heights, seaAt) : new Uint8Array(n);
  const down = new Int32Array(n).fill(-1), order = new Int32Array(n);
  const level = fill(topo, heights, sea, seaLevel, down, order);
  const raw = new Float32Array(n);
  for (let v = 0; v < n; v++) raw[v] = level[v] - heights[v];

  // Group flooded ground into basins and keep only those that are lakes.
  const area = vertexAreas(topo);
  const depth = new Float32Array(n);
  const wet = new Uint8Array(n);
  const seen = new Uint8Array(n);
  let lakes = 0, wetArea = 0, total = 0;
  for (let v = 0; v < n; v++) total += area[v];
  for (let v = 0; v < n; v++) {
    if (!sea[v]) continue;
    depth[v] = raw[v]; wet[v] = raw[v] > WATER.shore ? 1 : 0; seen[v] = 1;
    if (wet[v]) wetArea += area[v];
  }
  for (let v = 0; v < n; v++) {
    if (seen[v] || raw[v] <= WATER.shore) continue;
    const basin: number[] = [];
    const stack = [v];
    seen[v] = 1;
    let deepest = 0, a = 0;
    while (stack.length) {
      const u = stack.pop()!;
      basin.push(u);
      deepest = Math.max(deepest, raw[u]);
      a += area[u];
      for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
        const w = topo.nbrList[k];
        if (!seen[w] && !sea[w] && raw[w] > WATER.shore) { seen[w] = 1; stack.push(w); }
      }
    }
    if (deepest < WATER.minDepth || a < WATER.minArea) continue;
    lakes++;
    wetArea += a;
    for (const u of basin) { depth[u] = raw[u]; wet[u] = 1; }
  }
  // Where there is no water, the level is the ground.
  const filled = Float32Array.from(level);
  for (let v = 0; v < n; v++) if (!wet[v]) level[v] = heights[v];

  // Snow above the snowline, and ice on lakes that stand above it.
  const snowline = seaAt?.snowline ?? Infinity;
  const snow = new Uint8Array(n), ice = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (wet[v]) { if (!sea[v] && level[v] >= snowline) ice[v] = 1; }
    else if (heights[v] >= snowline) snow[v] = 1;
  }

  // Rain on every vertex, and snowmelt more, carried down the drainage the
  // flood found: each vertex hands everything it has gathered to the one it
  // drains to, from the highest down, so a vertex's flow is all the ground
  // above it. So streams start from the snowcaps.
  const flow = Float32Array.from(area, (a, v) => (snow[v] ? a * SNOW.melt : a));
  for (let i = n - 1; i >= 0; i--) {
    const v = order[i], d = down[v];
    if (d >= 0) flow[d] += flow[v];
  }
  const stream = new Uint8Array(n);
  for (let v = 0; v < n; v++) if (!wet[v] && flow[v] >= STREAM.minArea) stream[v] = 1;
  return { level, filled, depth, wet, sea, lakes, share: total ? wetArea / total : 0, down, flow, stream, snow, ice };
}

/**
 * Streams as lines: from each head down to where it meets water or another
 * stream. A river (enough flow) is flagged level 1, for two banks.
 */
export function streamPaths(water: Water): { path: number[]; river: boolean }[] {
  const n = water.stream.length;
  const fedBy = new Uint8Array(n);
  for (let v = 0; v < n; v++) if (water.stream[v] && water.down[v] >= 0) fedBy[water.down[v]]++;
  const walked = new Uint8Array(n);
  const out: { path: number[]; river: boolean }[] = [];
  // Heads first, then any stretch left over (a lake's outlet).
  const starts: number[] = [];
  for (let v = 0; v < n; v++) if (water.stream[v] && !fedBy[v]) starts.push(v);
  for (let v = 0; v < n; v++) if (water.stream[v]) starts.push(v);
  for (const head of starts) {
    if (walked[head]) continue;
    const path = [head];
    walked[head] = 1;
    let v = head;
    for (;;) {
      const d = water.down[v];
      if (d < 0) break;
      path.push(d);
      // Stop where it reaches water, or runs into a stream already drawn.
      if (!water.stream[d] || walked[d]) break;
      walked[d] = 1;
      v = d;
    }
    // Rivers by the flow at the far end, split where a stream grows into a river.
    const cut = path.findIndex((u) => water.flow[u] >= STREAM.riverArea);
    if (cut > 0) {
      out.push({ path: path.slice(0, cut + 1), river: false });
      out.push({ path: path.slice(cut), river: true });
    } else if (path.length >= 2) out.push({ path, river: cut === 0 });
  }
  return out;
}

/**
 * The sea: ground below sea level joined to the sea's anchor, the lowest
 * point of the ground as scanned. Not the current lowest point: then a pit
 * dug deep enough became the sea's anchor instead of a lake.
 */
function seaRegion(topo: Topology, heights: Float32Array, { level: seaLevel, anchor }: Sea): Uint8Array {
  const sea = new Uint8Array(topo.vertexCount);
  if (!(heights[anchor] < seaLevel)) return sea;
  const stack = [anchor];
  sea[anchor] = 1;
  while (stack.length) {
    const u = stack.pop()!;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (!sea[w] && heights[w] < seaLevel) { sea[w] = 1; stack.push(w); }
    }
  }
  return sea;
}

/**
 * Priority-flood: the lowest height at which water standing on each vertex
 * could reach the sea (or leave through a hole in the scan). With no sea,
 * the lowest vertex is the drain.
 */
export function fill(
  topo: Topology, heights: Float32Array, sea?: Uint8Array, seaLevel = -Infinity,
  down?: Int32Array, order?: Int32Array,
): Float32Array {
  const n = topo.vertexCount;
  const level = new Float32Array(n);
  const done = new Uint8Array(n);
  const heap = new MinHeap();
  const seeds: number[] = [];
  if (sea) for (let v = 0; v < n; v++) if (sea[v]) seeds.push(v);
  if (!seeds.length) {
    let lowest = 0;
    for (let v = 1; v < n; v++) if (heights[v] < heights[lowest]) lowest = v;
    seeds.push(lowest);
  }
  for (const s of [...seeds, ...boundaryVertices(topo)]) {
    if (done[s]) continue;
    done[s] = 1;
    level[s] = sea?.[s] ? Math.max(heights[s], seaLevel) : heights[s];
    heap.push(level[s], s);
  }
  // The flood also finds the drainage: a vertex drains to the one it was
  // reached from, which is lower or level with it and nearer the sea, so
  // water can never run in a circle.
  let i = 0;
  while (heap.size) {
    const [l, u] = heap.pop();
    if (order) order[i++] = u;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (done[w]) continue;
      done[w] = 1;
      level[w] = Math.max(heights[w], l);
      if (down) down[w] = u;
      heap.push(level[w], w);
    }
  }
  return level;
}

/**
 * The water as drawn: the shoreline, and depth lines inside it that run
 * parallel to the shore, the way a map draws a lake.
 */
export function waterLines(topo: Topology, water: Water, lift = 0.002): Polyline[] {
  // Any water at all, sea included: a planet with a sea and no lakes had no shore drawn.
  if (!water.wet.some((x) => x)) return [];
  // Depth field: positive in kept lakes, clearly negative on dry ground, so a
  // line at depth L is where the water is exactly L deep.
  const field = new Float32Array(topo.vertexCount);
  let deepest = 0;
  for (let v = 0; v < field.length; v++) {
    field[v] = water.wet[v] ? water.depth[v] : -1;
    deepest = Math.max(deepest, water.depth[v]);
  }
  const out: Polyline[] = [];
  const levels = [WATER.shore];
  for (let d = WATER.depthStep; d < deepest; d += WATER.depthStep) levels.push(d);
  levels.forEach((L, i) => {
    // Ice has a shore but no depth lines: you can't see into a frozen lake.
    const shifted = field.map((x, v) => (i > 0 && water.ice[v] ? WATER.shore - L : x - L));
    // One line per call: with a huge interval the only level is zero.
    for (const line of extractContours(topo, shifted, { interval: 1e3, lift })) out.push({ ...line, level: i, iso: L });
  });
  return out;
}

// Facts about a mesh that never change, worked out once: rebuilding them on
// every call was most of the 49 ms that water took per update on the orange.
const boundaryCache = new WeakMap<Topology, number[]>();
const areaCache = new WeakMap<Topology, Float32Array>();

/** Streams as drawn: one line, or two banks for a river. */
export function streamLines(topo: Topology, water: Water, lift = 0.0025): Polyline[] {
  const p = topo.positions, n = topo.normals, out: Polyline[] = [];
  for (const { path, river } of streamPaths(water)) {
    let pts = path.map((v) => [p[v * 3] + n[v * 3] * lift, p[v * 3 + 1] + n[v * 3 + 1] * lift, p[v * 3 + 2] + n[v * 3 + 2] * lift]);
    for (let r = 0; r < 2; r++) pts = chaikinOpen(pts);
    if (!river) { out.push(line(pts)); continue; }
    const half = 0.004;
    const side = (i: number) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], v = path[Math.min(path.length - 1, Math.round((i / (pts.length - 1)) * (path.length - 1)))] * 3;
      const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], nr = [n[v], n[v + 1], n[v + 2]];
      const s = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      return s.map((x) => x / l);
    };
    for (const sign of [1, -1]) out.push(line(pts.map((q, i) => { const s = side(i); return q.map((x, k) => x + sign * half * s[k]); })));
  }
  return out;
}

/** The snowline, dashed, where the snow ends on dry ground. */
export function snowLines(topo: Topology, water: Water, heights: Float32Array, snowline: number, lift = 0.002): Polyline[] {
  if (!Number.isFinite(snowline) || !water.snow.some((x) => x)) return [];
  const field = heights.map((h) => h - snowline);
  const lines = extractContours(topo, field, { interval: 1e3, lift, mask: water.wet });
  // Dash it: every other short piece.
  const out: Polyline[] = [];
  for (const l of lines) {
    const pts: number[][] = [];
    for (let k = 0; k < l.points.length; k += 3) pts.push([l.points[k], l.points[k + 1], l.points[k + 2]]);
    let run: number[][] = [], along = 0, on = true;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      if (on) { if (!run.length) run.push(pts[i - 1]); run.push(pts[i]); }
      along += d;
      if (along > 0.012) { along = 0; if (on && run.length >= 2) out.push(line(run)); run = []; on = !on; }
    }
    if (on && run.length >= 2) out.push(line(run));
  }
  return out;
}

function chaikinOpen(pts: number[][]): number[][] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a.map((x, k) => 0.75 * x + 0.25 * b[k]), a.map((x, k) => 0.25 * x + 0.75 * b[k]));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function line(pts: number[][]): Polyline {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return { level: 0, iso: 0, points: new Float32Array(pts.flat()), closed: false, length };
}

function boundaryVertices(topo: Topology): number[] {
  let b = boundaryCache.get(topo);
  if (!b) boundaryCache.set(topo, (b = findBoundary(topo)));
  return b;
}

function vertexAreas(topo: Topology): Float32Array {
  let a = areaCache.get(topo);
  if (!a) areaCache.set(topo, (a = areas(topo)));
  return a;
}

function findBoundary(topo: Topology): number[] {
  const count = new Map<number, number>();
  const n = topo.vertexCount, t = topo.triangles;
  for (let i = 0; i < t.length; i += 3) {
    for (const [a, b] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
      const key = a < b ? a * n + b : b * n + a;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  const out = new Set<number>();
  for (const [key, c] of count) if (c === 1) { out.add(Math.floor(key / n)); out.add(key % n); }
  return [...out];
}

function areas(topo: Topology): Float32Array {
  const a = new Float32Array(topo.vertexCount);
  const p = topo.positions, t = topo.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const [x, y, z] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    const e1 = [p[y] - p[x], p[y + 1] - p[x + 1], p[y + 2] - p[x + 2]];
    const e2 = [p[z] - p[x], p[z + 1] - p[x + 1], p[z + 2] - p[x + 2]];
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    a[t[i]] += area / 3; a[t[i + 1]] += area / 3; a[t[i + 2]] += area / 3;
  }
  return a;
}

class MinHeap {
  private h: [number, number][] = [];
  get size(): number { return this.h.length; }
  push(k: number, v: number): void {
    const h = this.h;
    h.push([k, v]);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] < h[i][0] || (h[p][0] === h[i][0] && h[p][1] < h[i][1])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const h = this.h, top = h[0], last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const less = (a: number, b: number) => h[a][0] < h[b][0] || (h[a][0] === h[b][0] && h[a][1] < h[b][1]);
        if (l < h.length && less(l, m)) m = l;
        if (r < h.length && less(r, m)) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}
