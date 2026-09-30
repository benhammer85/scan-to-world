/**
 * The islands, found and followed. Each connected piece of land big enough to
 * count is an island. It stays the same island while any of the ground it rose
 * on is still above the sea, so one that grows, erodes or joins another is
 * still itself, and when two join, the elder goes on. They aren't named: the
 * map is the land's, not ours.
 */
import type { Topology } from '../mesh/topology';

export interface Island {
  /** Which island it is, in the order they rose. */
  id: number;
  /** Its vertices, and one of them that is near its middle, for its label. */
  vertices: number[];
  centre: number;
  /** When it was named, in the world's seconds. */
  born: number;
}

export const ISLANDS = {
  /** Land on fewer vertices than this (on a planet of the drawn detail) is a rock, not an island. */
  least: 12,
};

export class Islands {
  list: Island[] = [];
  private risen = 0;
  private scale: number;

  constructor(private topo: Topology) {
    this.scale = topo.vertexCount / 16002;
  }

  /** Find the islands in the land as it is now (heights relative to the sea), following the ones already known. Returns the new ones. */
  update(height: ArrayLike<number>, now: number): Island[] {
    const t = this.topo, n = t.vertexCount, seen = new Uint8Array(n);
    const pieces: number[][] = [];
    for (let v = 0; v < n; v++) {
      if (seen[v] || height[v] <= 0) continue;
      const piece: number[] = [], stack = [v];
      seen[v] = 1;
      while (stack.length) {
        const u = stack.pop()!;
        piece.push(u);
        for (let k = t.nbrOffsets[u]; k < t.nbrOffsets[u + 1]; k++) {
          const w = t.nbrList[k];
          if (!seen[w] && height[w] > 0) { seen[w] = 1; stack.push(w); }
        }
      }
      if (piece.length >= ISLANDS.least * this.scale) pieces.push(piece);
    }
    // Each piece is the eldest of the old islands it shares ground with, if any.
    const owner = new Int32Array(n).fill(-1);
    this.list.forEach((isl, i) => { for (const v of isl.vertices) owner[v] = i; });
    const next: Island[] = [], fresh: Island[] = [], taken = new Set<number>();
    for (const piece of pieces) {
      let best = -1;
      for (const v of piece) {
        const o = owner[v];
        if (o >= 0 && !taken.has(o) && (best < 0 || this.list[o].born < this.list[best].born)) best = o;
      }
      const centre = this.middle(piece);
      if (best >= 0) {
        taken.add(best);
        next.push({ ...this.list[best], vertices: piece, centre });
      } else {
        const isl = { id: ++this.risen, vertices: piece, centre, born: now };
        next.push(isl);
        fresh.push(isl);
      }
    }
    this.list = next;
    return fresh;
  }

  /** The vertex of a piece nearest its average position. */
  private middle(piece: number[]): number {
    const p = this.topo.basePositions;
    let x = 0, y = 0, z = 0;
    for (const v of piece) { x += p[v * 3]; y += p[v * 3 + 1]; z += p[v * 3 + 2]; }
    let best = piece[0], bd = Infinity;
    for (const v of piece) {
      const d = (p[v * 3] * piece.length - x) ** 2 + (p[v * 3 + 1] * piece.length - y) ** 2 + (p[v * 3 + 2] * piece.length - z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}
