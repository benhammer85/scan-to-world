/**
 * Touch reshaping. Edits live in their own per-vertex field layered on top of the
 * scanned heightfield, so the original scan signal is never lost and we can offer
 * two falloff behaviours:
 *
 *  - 'gaussian': each touch adds a permanent local Gaussian bump.
 *  - 'diffuse':  each touch injects "heat" that spreads over the surface (heat
 *                equation on the mesh graph) and fades, so mountains rise, slump
 *                and settle organically.
 */
import { computeNormals, smoothScalar, type Topology } from '../mesh/topology';

export type Falloff = 'gaussian' | 'diffuse';

export interface BrushOptions {
  radius: number;
  /** Height units added per second at the brush centre (negative digs). */
  strength: number;
  falloff: Falloff;
}

export class TerrainEdits {
  /** Total edit height per vertex (permanent + transient); read-only for callers. */
  readonly field: Float32Array;
  /** Gaussian-brush edits: stay where they were made. */
  private permanent: Float32Array;
  /** Diffuse-brush edits: spread and fade over time. */
  private transient: Float32Array;
  private scratch: Float32Array;

  constructor(private topo: Topology) {
    this.field = new Float32Array(topo.vertexCount);
    this.permanent = new Float32Array(topo.vertexCount);
    this.transient = new Float32Array(topo.vertexCount);
    this.scratch = new Float32Array(topo.vertexCount);
  }

  /** Apply the brush for `dt` seconds at a surface point. Returns true if anything changed. */
  brush(center: ArrayLike<number>, opts: BrushOptions, dt: number): boolean {
    const diffuse = opts.falloff === 'diffuse';
    // Diffuse mode drops a tighter, hotter impulse and lets diffusion widen it.
    const sigma = opts.radius * (diffuse ? 0.35 : 0.5);
    const cutoff = sigma * 3;
    const inv2s2 = 1 / (2 * sigma * sigma);
    const amount = opts.strength * dt * (diffuse ? 2 : 1);
    const target = diffuse ? this.transient : this.permanent;
    const p = this.topo.positions;
    let changed = false;
    for (let v = 0; v < this.topo.vertexCount; v++) {
      const dx = p[v * 3] - center[0], dy = p[v * 3 + 1] - center[1], dz = p[v * 3 + 2] - center[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > cutoff * cutoff) continue;
      const add = amount * Math.exp(-d2 * inv2s2);
      target[v] += add;
      this.field[v] += add;
      changed = true;
    }
    return changed;
  }

  /**
   * Advance diffusion/fade of the transient layer by dt seconds. `rate` is
   * diffusion steps per second, `fade` is the fraction of height lost per second.
   * Returns true if the field changed.
   */
  relax(dt: number, rate: number, fade: number): boolean {
    const t = this.transient;
    let maxAbs = 0;
    for (const v of t) maxAbs = Math.max(maxAbs, Math.abs(v));
    if (maxAbs === 0) return false;
    if (maxAbs < 1e-4) {
      t.fill(0);
    } else {
      const steps = Math.max(1, Math.round(rate * dt));
      for (let i = 0; i < steps; i++) {
        smoothScalar(this.topo, t, 0.5, this.scratch);
        t.set(this.scratch);
      }
      const keep = Math.max(0, 1 - fade * dt);
      for (let v = 0; v < t.length; v++) t[v] *= keep;
    }
    for (let v = 0; v < t.length; v++) this.field[v] = this.permanent[v] + t[v];
    return true;
  }

  clear(): void {
    this.field.fill(0);
    this.permanent.fill(0);
    this.transient.fill(0);
  }
}

/**
 * Physically move the surface along its original normals by the edit field so the
 * object itself bulges where the player pushes, then refresh normals.
 */
export function applyDisplacement(topo: Topology, edits: Float32Array, amplitude: number): void {
  const { basePositions: bp, baseNormals: bn, positions } = topo;
  for (let v = 0; v < topo.vertexCount; v++) {
    const d = edits[v] * amplitude;
    positions[v * 3] = bp[v * 3] + bn[v * 3] * d;
    positions[v * 3 + 1] = bp[v * 3 + 1] + bn[v * 3 + 1] * d;
    positions[v * 3 + 2] = bp[v * 3 + 2] + bn[v * 3 + 2] * d;
  }
  computeNormals(positions, topo.triangles, topo.normals);
}
