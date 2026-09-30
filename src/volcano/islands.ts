/**
 * The islands, found and named. Each connected piece of land big enough to
 * count is an island, and it gets a name when it first breaks the surface. It
 * keeps that name while any of the ground that bore it is still above the
 * sea, so an island that grows, erodes or joins another stays itself; when two
 * join, the elder name goes on. Names are made from a few soft syllables, by
 * the world's own seed, so the same world always names its islands alike.
 */
import type { Topology } from '../mesh/topology';

export interface Island {
  name: string;
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

const FIRST = ['A', 'E', 'I', 'O', 'U', 'Ka', 'Le', 'Mo', 'Na', 'Ri', 'Sa', 'Te', 'Va', 'Lu', 'Ho', 'Pe'];
const MIDDLE = ['la', 'ri', 'no', 'ma', 'si', 'lo', 'ne', 'ta', 'ru', 'vi', 'ka', 'mu'];
const LAST = ['', '', 'a', 'e', 'o', 'n', 'l', 'ra', 'lin', 'mar', 'sen', 'dol'];

export class Islands {
  list: Island[] = [];
  private seed: number;
  private used = new Set<string>();
  private scale: number;

  constructor(private topo: Topology, seed: number) {
    this.seed = Math.max(1, Math.floor(seed) % 2147483646);
    this.scale = topo.vertexCount / 16002;
  }

  /** Find the islands in the land as it is now (heights relative to the sea), keeping names that carry over. Returns the newly named. */
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
    // Each piece keeps the eldest name among the old islands it shares ground with.
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
        const isl = { name: this.name(), vertices: piece, centre, born: now };
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

  private name(): string {
    for (let tries = 0; tries < 50; tries++) {
      const pick = (a: string[]) => a[Math.floor(this.rand() * a.length)];
      const name = pick(FIRST) + (this.rand() < 0.6 ? pick(MIDDLE) : '') + pick(LAST);
      if (name.length >= 3 && !this.used.has(name)) { this.used.add(name); return name; }
    }
    return `Isle ${this.used.size + 1}`;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
