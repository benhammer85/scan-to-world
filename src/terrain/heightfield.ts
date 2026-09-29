/**
 * Heightfield extraction: turn the scanned surface into one elevation value per
 * welded vertex. The *geometry itself* is the source of truth; these functions only
 * decide how "bumpiness" maps to "altitude".
 *
 * Output heights are normalised so the bulk of the surface falls in [0, 1]. Touch
 * edits are added on top in the same units, so they can push above 1 or below 0.
 */
import { smoothScalar, type Topology } from '../mesh/topology';

export type HeightMode = 'radial' | 'curvature';

export interface HeightOptions {
  mode: HeightMode;
  /** Laplacian smoothing passes applied to the raw signal (denoises scan grain). */
  smoothing: number;
  /**
   * Percentile clip used for normalisation (0..0.5). Scans have outlier spikes;
   * clipping the top/bottom few percent keeps them from flattening everything else.
   */
  clip: number;
}

export const defaultHeightOptions: HeightOptions = { mode: 'radial', smoothing: 2, clip: 0.02 };

export function extractHeights(topo: Topology, opts: HeightOptions = defaultHeightOptions): Float32Array {
  let raw: Float32Array = opts.mode === 'radial' ? radialSignal(topo) : curvatureSignal(topo);
  let spare: Float32Array = new Float32Array(raw.length);
  for (let i = 0; i < opts.smoothing; i++) {
    const next = smoothScalar(topo, raw, 0.5, spare);
    spare = raw;
    raw = next;
  }
  return normalise(raw, opts.clip);
}

/** Distance from the centroid. Good for round, bumpy objects (orange, rock, potato). */
export function radialSignal(topo: Topology): Float32Array {
  const p = topo.basePositions;
  const n = topo.vertexCount;
  let cx = 0, cy = 0, cz = 0;
  for (let v = 0; v < n; v++) { cx += p[v * 3]; cy += p[v * 3 + 1]; cz += p[v * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) out[v] = Math.hypot(p[v * 3] - cx, p[v * 3 + 1] - cy, p[v * 3 + 2] - cz);
  return out;
}

/**
 * Discrete mean-curvature proxy: how far a vertex sticks out past the average of its
 * neighbours, measured along its normal. Convex = positive (peak), concave = negative
 * (valley). Works for non-round objects (LEGO brick, mug) where "distance from
 * centre" is meaningless, but is noisier and wants more smoothing.
 */
export function curvatureSignal(topo: Topology): Float32Array {
  const p = topo.basePositions, nrm = topo.baseNormals;
  const { nbrOffsets, nbrList } = topo;
  const out = new Float32Array(topo.vertexCount);
  for (let v = 0; v < topo.vertexCount; v++) {
    const s = nbrOffsets[v], e = nbrOffsets[v + 1];
    if (e === s) continue;
    let mx = 0, my = 0, mz = 0, edge = 0;
    for (let k = s; k < e; k++) {
      const u = nbrList[k] * 3;
      mx += p[u]; my += p[u + 1]; mz += p[u + 2];
      edge += Math.hypot(p[u] - p[v * 3], p[u + 1] - p[v * 3 + 1], p[u + 2] - p[v * 3 + 2]);
    }
    const inv = 1 / (e - s);
    const lx = mx * inv - p[v * 3], ly = my * inv - p[v * 3 + 1], lz = mz * inv - p[v * 3 + 2];
    // Divide by mean edge length so the value is resolution-independent.
    out[v] = -(lx * nrm[v * 3] + ly * nrm[v * 3 + 1] + lz * nrm[v * 3 + 2]) / ((edge * inv) || 1);
  }
  return out;
}

export function normalise(values: Float32Array, clip: number): Float32Array {
  const sorted = Float32Array.from(values).sort();
  const lo = sorted[Math.floor(clip * (sorted.length - 1))];
  const hi = sorted[Math.ceil((1 - clip) * (sorted.length - 1))];
  const range = hi - lo || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = Math.min(1, Math.max(0, (values[i] - lo) / range));
  return out;
}
