/**
 * The ocean world's aim: a chain of separate islands along the volcano's path.
 *
 * The crust carries the heat along a great circle from where it began, and the dotted line is the first part
 * of that way. Every separate island by the line counts, wherever along it (it once counted only one island
 * in each fifth of the line, which nobody could see: seven islands could count as two). The line's end is
 * the challenge: the heat drifts past it in about two and a half minutes, so the islands must come quickly,
 * and apart. Once counted, an island stays counted, though it sinks or grows into another later, as the
 * oldest of Hawaii's have sunk.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';

export const CHAIN = {
  /** Separate islands to raise. */
  stretches: 5,
  /** How far round the world the line runs (a share of the way round). */
  arc: 0.3,
  /** The stretch just ahead of the volcano, drawn a little stronger (a share of the way round). */
  ahead: 0.05,
  /** How near the path (as the sine of an angle from its circle) an island must come to be on it. */
  near: 0.14,
  /** Land on fewer vertices than this (on a planet of the drawn detail) is a rock, not an island of the chain. */
  least: 12,
};

type V3 = { x: number; y: number; z: number };

export class Chain {
  /** The way round: where it starts, the way it goes, and the pole of its circle. */
  readonly a: V3;
  readonly b: V3;
  readonly pole: V3;
  /** Each island counted: how far round the path it lies (from, to; shares of the way round). */
  readonly spans: { from: number; to: number }[] = [];
  /** Which counted island each vertex was last part of (-1: none). */
  private owner: Int32Array | null = null;
  /** Islands counted before the world was taken up again, whose ground isn't known now; and where they lay. */
  private before = 0;
  readonly earlier: { from: number; to: number }[] = [];
  private adopting = false;

  constructor(start: V3, along: V3) {
    this.a = norm(start);
    this.b = norm(along);
    this.pole = norm(cross(this.a, this.b));
  }

  /** Taken up again: so many islands were counted, along these spans; the islands standing now are among them. */
  restore(count: number, spans: { from: number; to: number }[] = []): void {
    this.before = count;
    this.earlier.push(...spans.map((s) => ({ ...s })));
    this.adopting = true;
  }

  /** How far round a point on the world is along the way (0 to 1), and how far off it (as a sine). */
  where(p: V3): { round: number; off: number } {
    const x = dot(p, this.a), y = dot(p, this.b);
    let t = Math.atan2(y, x) / (Math.PI * 2);
    if (t < 0) t += 1;
    return { round: t, off: Math.abs(dot(p, this.pole)) };
  }

  /** Reckon the islands along the path. Returns how many have been counted. */
  update(pl: Planet, topo: Topology): number {
    const p = topo.basePositions, N = pl.rock.length, least = CHAIN.least * (topo.vertexCount / 16002);
    if (!this.owner) this.owner = new Int32Array(N).fill(-1);
    const owner = this.owner, seen = new Uint8Array(N), taken = new Set<number>();
    let adopted = 0;
    for (let v = 0; v < N; v++) {
      if (seen[v] || pl.rock[v] <= 0) continue;
      const piece: number[] = [], stack = [v];
      seen[v] = 1;
      while (stack.length) {
        const u = stack.pop()!;
        piece.push(u);
        for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) { const w = topo.nbrList[k]; if (!seen[w] && pl.rock[w] > 0) { seen[w] = 1; stack.push(w); } }
      }
      if (piece.length < least) continue; // (a rock, too small to count)
      // Where it lies along the path, if it comes near it at all.
      let from = 2, to = -1;
      for (const u of piece) {
        const w = this.where({ x: p[u * 3], y: p[u * 3 + 1], z: p[u * 3 + 2] });
        if (w.off <= CHAIN.near && w.round < CHAIN.arc) { from = Math.min(from, w.round); to = Math.max(to, w.round); }
      }
      if (to < 0) continue;
      // An island counted before (or grown from one, or joined to one) is that island; else it's a new one.
      // (One that has split, or been cut, in two is two: the second piece is a new island.)
      let id = -1;
      for (const u of piece) if (owner[u] >= 0 && !taken.has(owner[u])) { id = owner[u]; break; }
      if (id < 0) {
        if (this.adopting) adopted++;
        id = this.spans.length;
        this.spans.push({ from, to });
      } else {
        const s = this.spans[id];
        s.from = Math.min(s.from, from); s.to = Math.max(s.to, to);
      }
      taken.add(id);
      for (const u of piece) owner[u] = id;
    }
    if (this.adopting) { this.adopting = false; this.before = Math.max(0, this.before - adopted); }
    return this.count;
  }

  get count(): number {
    return this.before + this.spans.length;
  }

  get ringed(): boolean {
    return this.count >= CHAIN.stretches;
  }

  /** The path between two shares of the way round, as points (on the unit sphere), for drawing. */
  between(from: number, to: number, step = 0.004): V3[] {
    const out: V3[] = [];
    for (let r = from; r <= to + 1e-9; r += step) {
      const t = r * Math.PI * 2;
      out.push({ x: this.a.x * Math.cos(t) + this.b.x * Math.sin(t), y: this.a.y * Math.cos(t) + this.b.y * Math.sin(t), z: this.a.z * Math.cos(t) + this.b.z * Math.sin(t) });
    }
    return out;
  }
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
