/**
 * Development, as the Earth is seen at night from space: never buildings,
 * never outlines, only light. Every house is a small light, older ones a
 * little brighter; a farm a faint one; the ways between places a thin
 * thread. The light spreads over the ground and fades with distance, as a
 * city's density falls off from its core, and is drawn as stipple: dots
 * almost solid where the light is strongest, thinning to a halo, to single
 * specks out in the country (see STYLE.md).
 *
 * The shapes this makes are the simulation's own: a town grows along its
 * ways and follows the ground, so its glow does too, fingers down the
 * valleys and the roads, cores that merge as towns meet.
 */
import type { Topology } from '../mesh/topology';
import type { Building, Street } from './settlements';

export const GLOW = {
  /**
   * How much light a house gives, by what it has grown into: a hut at the edge a little, a
   * house more, one with its wings more again, and the terraces and courts of an old core
   * most. Then a farm, a street's vertex, a road's.
   */
  stages: [0.2, 0.5, 1, 3.5],
  farm: 0.22,
  street: 0.18,
  road: 0.3,
  /** How far it spreads: rounds of blurring over the ground, and how much each round takes from a vertex. */
  spread: 2,
  share: 0.55,
  /**
   * How light becomes stipple: 1 - e^(-light / scale), raised to a power so dim light gives
   * only rare specks and bright light nearly solid ground, as a night-lights picture from
   * space has it: bright cores, dark gaps, faint scattered points. The densest, in dots per unit of area.
   */
  scale: 0.45,
  contrast: 2.6,
  /** Crowding: light counts for more where there is more of it, as a city's life grows faster than its size. */
  crowding: 1.4,
  dense: 55000,
  /** Lifted this far off the ground, so the dots sit on it, not in it. */
  lift: 0.0015,
};

/** The light at each vertex. */
export function glowField(topo: Topology, buildings: Building[], streets: Street[], stage: (b: Building) => number): Float32Array {
  const n = topo.vertexCount;
  let f = new Float32Array(n);
  for (const b of buildings) {
    if (b.state === 'drowned') continue;
    if (b.state === 'ruin') { f[b.vertex] += GLOW.farm * 0.5; continue; }
    if (b.farm) { f[b.vertex] += GLOW.farm; continue; }
    f[b.vertex] += GLOW.stages[Math.max(0, Math.min(GLOW.stages.length - 1, stage(b)))];
  }
  for (const s of streets) {
    const w = s.kind === 'road' ? GLOW.road : GLOW.street;
    for (const v of s.path) f[v] += w;
  }
  for (let r = 0; r < GLOW.spread; r++) {
    const next = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const a = topo.nbrOffsets[v], b = topo.nbrOffsets[v + 1];
      let sum = 0;
      for (let q = a; q < b; q++) sum += f[topo.nbrList[q]];
      next[v] = f[v] * (1 - GLOW.share) + (b > a ? (sum / (b - a)) * GLOW.share : 0);
    }
    // Light is kept, not lost, as it spreads: the total stays what the sources gave.
    f = next;
  }
  return f;
}

/** How dense the stipple is for so much light: none for none, nearing solid for a great deal. */
export function glowDensity(light: number): number {
  return Math.pow(1 - Math.exp(-Math.pow(light, GLOW.crowding) / GLOW.scale), GLOW.contrast);
}

/**
 * The stipple for the light: candidate dots at the densest spacing over every
 * lit triangle, each kept with the chance the light where it falls gives. The
 * light is blended across the triangle, so the grey runs smooth, not in
 * facets. Placed by a fixed rule of the triangle, so a growing town keeps its
 * dots and gains more: nothing shimmers.
 */
export function glowDots(topo: Topology, light: Float32Array, dry: (v: number) => boolean = () => true): number[] {
  const t = topo.triangles, p = topo.positions, nm = topo.normals, out: number[] = [];
  const least = 0.004;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2];
    const la = light[a], lb = light[b], lc = light[c];
    if (la < least && lb < least && lc < least) continue;
    if (!dry(a) || !dry(b) || !dry(c)) continue; // no light on the water
    const u = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const w = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    const area = 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
    const want = area * GLOW.dense, count = Math.floor(want) + (rand(i, 0) < want % 1 ? 1 : 0);
    for (let k = 1; k <= count; k++) {
      let s = rand(i, k * 3), q = rand(i, k * 3 + 1);
      if (s + q > 1) { s = 1 - s; q = 1 - q; }
      const here = la * (1 - s - q) + lb * s + lc * q;
      if (rand(i, k * 3 + 2) > glowDensity(here)) continue;
      for (let j = 0; j < 3; j++) {
        const nrm = nm[a * 3 + j] * (1 - s - q) + nm[b * 3 + j] * s + nm[c * 3 + j] * q;
        out.push(p[a * 3 + j] + u[j] * s + w[j] * q + nrm * GLOW.lift);
      }
    }
  }
  return out;
}

function rand(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
