/**
 * A finer surface to draw on than the simulation runs on.
 *
 * The simulation's icosphere is coarse enough to run quickly, but drawn as it
 * is, its triangles show: colours smear across them and every coast is a ring
 * of straight cuts. So the world is drawn on the icosphere of twice the
 * detail, whose vertices are the coarse ones plus one at the middle of every
 * coarse edge, and each value is carried across by Loop's subdivision rules.
 * A new vertex takes 3/8 of each end of its edge and 1/8 of each of the two
 * vertices across from it; an old one keeps 5/8 of itself (for its usual six
 * neighbours) and takes the rest from them. That doesn't only fill in the new
 * points: it rounds the field, so contours and coasts come out as curves.
 */
import type { Topology } from '../mesh/topology';

export class FineSurface {
  /** For each fine vertex, the coarse vertices it takes from and how much of each. */
  private offsets: Uint32Array;
  private from: Uint32Array;
  private weights: Float32Array;

  /** The carrying rules alone, to hand to a worker, which can make its own with `fromParts`. */
  get parts(): { offsets: Uint32Array; from: Uint32Array; weights: Float32Array; vertexCount: number; nbrOffsets: Uint32Array; nbrList: Uint32Array } {
    return { offsets: this.offsets, from: this.from, weights: this.weights, vertexCount: this.fine.vertexCount, nbrOffsets: this.fine.nbrOffsets, nbrList: this.fine.nbrList };
  }

  /** A FineSurface from its carrying rules alone (see `parts`): enough to carry fields, with no mesh behind it. */
  static fromParts(p: { offsets: Uint32Array; from: Uint32Array; weights: Float32Array; vertexCount: number; nbrOffsets: Uint32Array; nbrList: Uint32Array }): FineSurface {
    const f = Object.create(FineSurface.prototype) as FineSurface;
    Object.assign(f, { eased: [], offsets: p.offsets, from: p.from, weights: p.weights, fine: { vertexCount: p.vertexCount, nbrOffsets: p.nbrOffsets, nbrList: p.nbrList } });
    return f;
  }

  constructor(coarse: Topology, readonly fine: Topology) {
    const cp = coarse.basePositions, fp = fine.basePositions, n = fine.vertexCount;
    // The coarse vertices in a grid of cells, to find the nearest to each fine one quickly.
    // About an edge's length to a cell, so a fine vertex's nearest coarse one is always in the cells round it.
    const cell = 1.2 * Math.sqrt((4 * Math.PI) / coarse.vertexCount), grid = new Map<string, number[]>();
    const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let v = 0; v < coarse.vertexCount; v++) {
      const k = key(cp[v * 3], cp[v * 3 + 1], cp[v * 3 + 2]);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(v);
    }
    const nearest = (x: number, y: number, z: number) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      let best = -1, bd = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const v of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          const d = (cp[v * 3] - x) ** 2 + (cp[v * 3 + 1] - y) ** 2 + (cp[v * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = v; }
        }
      }
      return { v: best, d: Math.sqrt(bd) };
    };
    const nbrs = (v: number) => Array.from(coarse.nbrList.subarray(coarse.nbrOffsets[v], coarse.nbrOffsets[v + 1]));

    const offsets = new Uint32Array(n + 1), from: number[] = [], weights: number[] = [];
    for (let f = 0; f < n; f++) {
      const x = fp[f * 3], y = fp[f * 3 + 1], z = fp[f * 3 + 2];
      const { v: a, d } = nearest(x, y, z);
      const ring = nbrs(a);
      if (d < 1e-4) {
        // An old vertex: most of itself, the rest from its neighbours (Loop's vertex rule).
        const k = ring.length, beta = k > 3 ? 3 / (8 * k) : 3 / 16;
        from.push(a); weights.push(1 - k * beta);
        for (const w of ring) { from.push(w); weights.push(beta); }
      } else {
        // A new vertex, on the edge from its nearest old one to whichever neighbour's midpoint it sits at.
        let b = ring[0], bd = Infinity;
        for (const w of ring) {
          let mx = cp[a * 3] + cp[w * 3], my = cp[a * 3 + 1] + cp[w * 3 + 1], mz = cp[a * 3 + 2] + cp[w * 3 + 2];
          const l = Math.hypot(mx, my, mz); mx /= l; my /= l; mz /= l;
          const dd = (mx - x) ** 2 + (my - y) ** 2 + (mz - z) ** 2;
          if (dd < bd) { bd = dd; b = w; }
        }
        const across = ring.filter((w) => w !== b && nbrs(b).includes(w));
        if (across.length === 2) {
          from.push(a, b, across[0], across[1]); weights.push(3 / 8, 3 / 8, 1 / 8, 1 / 8);
        } else {
          from.push(a, b); weights.push(0.5, 0.5); // an edge with only one triangle: halfway along it
        }
      }
      offsets[f + 1] = from.length;
    }
    this.offsets = offsets;
    this.from = Uint32Array.from(from);
    this.weights = Float32Array.from(weights);
  }

  /**
   * Carry the drawn fields in one pass: a height and a colour a vertex, the colour packed three to
   * a vertex. One pass over the weights rather than one a field, since this runs many times a
   * second while lava flows.
   */
  carryDrawn(h: ArrayLike<number>, a: ArrayLike<number>, fh: Float32Array, fa: Float32Array): void {
    const o = this.offsets, from = this.from, w = this.weights, n = this.fine.vertexCount;
    for (let f = 0; f < n; f++) {
      let sh = 0, a0 = 0, a1 = 0, a2 = 0;
      for (let k = o[f], end = o[f + 1]; k < end; k++) {
        const v = from[k], x = w[k], v3 = v * 3;
        sh += h[v] * x;
        a0 += a[v3] * x; a1 += a[v3 + 1] * x; a2 += a[v3 + 2] * x;
      }
      const f3 = f * 3;
      fh[f] = sh;
      fa[f3] = a0; fa[f3 + 1] = a1; fa[f3 + 2] = a2;
    }
  }

  /** The coarse vertex nearest a fine one (the first it takes from, in both of Loop's rules). */
  nearestCoarse(f: number): number {
    return this.from[this.offsets[f]];
  }

  /**
   * Carry the marks (four a vertex), whose edges the shader draws where they cross a half: carried,
   * then eased twice over the fine vertices. (One step of Loop's rules leaves the old vertices and the
   * new a little apart wherever a field bends, as across a flow's margin it always does; the edge drawn
   * through them rippled at the spacing of the simulation's vertices, in a fine saw.)
   */
  carryMarks(coarse: ArrayLike<number>, fine: Float32Array): void {
    this.carry(coarse, fine, 4);
    this.ease(fine, 4);
  }

  /** A field (of `stride` values a vertex) eased twice toward its fine neighbours (see `carryMarks`). */
  ease(field: Float32Array, stride: number): void {
    const o = this.fine.nbrOffsets, l = this.fine.nbrList, n = this.fine.vertexCount;
    const next = (this.eased[stride] ??= new Float32Array(n * stride));
    for (let pass = 0; pass < 2; pass++) {
      for (let v = 0; v < n; v++) {
        const by = 0.5 / Math.max(1, o[v + 1] - o[v]);
        for (let s = 0; s < stride; s++) {
          let sum = 0;
          for (let k = o[v]; k < o[v + 1]; k++) sum += field[l[k] * stride + s];
          next[v * stride + s] = field[v * stride + s] * 0.5 + sum * by;
        }
      }
      field.set(next);
    }
  }
  private eased: Float32Array[] = [];

  /** Carry a field (of `stride` values a vertex) from the coarse vertices onto the fine. */
  carry(coarse: ArrayLike<number>, fine: Float32Array, stride = 1): void {
    const o = this.offsets, from = this.from, w = this.weights, n = this.fine.vertexCount;
    for (let f = 0; f < n; f++) {
      for (let s = 0; s < stride; s++) {
        let sum = 0;
        for (let k = o[f]; k < o[f + 1]; k++) sum += coarse[from[k] * stride + s] * w[k];
        fine[f * stride + s] = sum;
      }
    }
  }
}
