/**
 * Development, as the map draws it: not towns of streets and houses you could
 * walk down, but ground that people have taken, shown the way a small-scale
 * survey shows built-up land. A fine outline round it; a light stipple over
 * all of it; and the stipple thickening where it is most built. You see how
 * much, and where, and how it spreads, never quite what it is (see STYLE.md).
 */
import type { Topology } from '../mesh/topology';
import { chainSegments, type Polyline } from '../terrain/contours';
import { chaikin, mid, polyline } from './countryMarks';
import { stippleDots } from '../render/stipple';

export const DEVELOPMENT = {
  /** Dots per unit of area: over built footprints, and over the rest of the taken ground. */
  core: 70000,
  field: 3000,
  /** Ground this near something built is developed; smoothed so many times. */
  reach: 0.045,
  smooth: 2,
  /** Outlines shorter than this (small holes, a lone farmstead) are left out: only real extents are drawn. */
  least: 0.36,
  /** Lifted this far off the ground, so the dots and the outline sit on it, not in it. */
  lift: 0.0015,
};

/** The fine line round the taken ground: where it meets the untaken. */
export function developmentOutline(topo: Topology, taken: (v: number) => boolean): Polyline[] {
  const n = topo.vertexCount, t = topo.triangles, p = topo.positions, nm = topo.normals;
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const flat: number[] = [];
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    const ta = taken(a), tb = taken(b), tc = taken(c);
    if (ta === tb && tb === tc) continue;
    const e: number[] = [];
    if (ta !== tb) e.push(key(a, b));
    if (tb !== tc) e.push(key(b, c));
    if (tc !== ta) e.push(key(c, a));
    flat.push(e[0], e[1]);
  }
  const out: Polyline[] = [];
  for (const chain of chainSegments(flat)) {
    if (chain.keys.length < 3) continue;
    let pts = chain.keys.map((k) => { const a = Math.floor(k / n); return mid(p, nm, a, k - a * n, DEVELOPMENT.lift); });
    if (chain.closed) pts.push(pts[0]);
    for (let r = 0; r < 2; r++) pts = chaikin(pts);
    const line = { ...polyline(pts, 1), closed: chain.closed };
    if (line.length >= DEVELOPMENT.least) out.push(line);
  }
  return out;
}

/**
 * The developed ground: every vertex near enough something built, smoothed
 * so its edge runs easily, as a surveyor would draw a town's extent, rather
 * than following each field and garden.
 */
export function developedGround(topo: Topology, built: number[], keep: (v: number) => boolean): Uint8Array {
  const n = topo.vertexCount, p = topo.positions, r = DEVELOPMENT.reach;
  const cell = (x: number) => Math.floor(x / r);
  const grid = new Map<string, number[]>();
  for (const v of built) {
    const k = `${cell(p[v * 3])},${cell(p[v * 3 + 1])},${cell(p[v * 3 + 2])}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(v);
  }
  let on = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    if (!keep(v)) continue;
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], cx = cell(x), cy = cell(y), cz = cell(z);
    search: for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      for (const u of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
        if (Math.hypot(p[u * 3] - x, p[u * 3 + 1] - y, p[u * 3 + 2] - z) < r) { on[v] = 1; break search; }
      }
    }
  }
  for (let s = 0; s < DEVELOPMENT.smooth; s++) {
    const next = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      let k = 0, m = 0;
      for (let q = topo.nbrOffsets[v]; q < topo.nbrOffsets[v + 1]; q++) { m++; k += on[topo.nbrList[q]]; }
      next[v] = keep(v) && (k * 2 > m || (on[v] && k * 2 === m)) ? 1 : 0;
    }
    on = next;
  }
  return on;
}

/** The light stipple over all the taken ground. */
export function takenDots(topo: Topology, taken: (v: number) => boolean): number[] {
  const t = topo.triangles, p = topo.positions, nm = topo.normals, tris: number[] = [];
  for (let i = 0; i < t.length; i += 3) {
    if (!taken(t[i]) || !taken(t[i + 1]) || !taken(t[i + 2])) continue;
    for (let k = 0; k < 3; k++) {
      const v = t[i + k];
      tris.push(p[v * 3] + nm[v * 3] * DEVELOPMENT.lift, p[v * 3 + 1] + nm[v * 3 + 1] * DEVELOPMENT.lift, p[v * 3 + 2] + nm[v * 3 + 2] * DEVELOPMENT.lift);
    }
  }
  return stippleDots(tris, DEVELOPMENT.field);
}
