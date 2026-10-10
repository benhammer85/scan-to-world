/**
 * The ocean world's aim: a chain of living islands all the way round the world.
 *
 * The crust carries the heat along a great circle from where it began. The first part of the way
 * round is cut into stretches; a stretch is held while an island of its own, with life on it, stands by it
 * (one island along several stretches holds only one). The world is ringed when every stretch is held
 * at once, before the fire goes out. (It was the whole way round, then half: too long a wait on the drift.) Old islands sink and wear, and unless reef holds them they
 * drop out of the chain, so the ring is a race against the sea as much as against the cooling.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';

export const CHAIN = {
  /** Stretches along the way. */
  stretches: 5,
  /** How much of the way round the world the chain runs. */
  arc: 0.3,
  /** How near the way (as the sine of an angle from its circle) living ground must be to hold a stretch. */
  near: 0.14,
  /** Life at least this strong holds. */
  living: 0.3,
  /** Land on fewer vertices than this (on a planet of the drawn detail) is a rock, not an island of the chain. */
  least: 4,
};

type V3 = { x: number; y: number; z: number };

export class Chain {
  readonly held: boolean[];
  /** The way round: where it starts, the way it goes, and the pole of its circle. */
  readonly a: V3;
  readonly b: V3;
  readonly pole: V3;

  constructor(start: V3, along: V3) {
    this.a = norm(start);
    this.b = norm(along);
    this.pole = norm(cross(this.a, this.b));
    this.held = new Array(CHAIN.stretches).fill(false);
  }

  /** How far round a point on the world is along the way (0 to 1), and how far off it (as a sine). */
  where(p: V3): { round: number; off: number } {
    const x = dot(p, this.a), y = dot(p, this.b);
    let t = Math.atan2(y, x) / (Math.PI * 2);
    if (t < 0) t += 1;
    return { round: t, off: Math.abs(dot(p, this.pole)) };
  }

  /**
   * Reckon which stretches are held. Returns how many. Each stretch is held by an island of its own standing by
   * the way there (land on enough of the world to be an island, not a rock); one island stretched along
   * the way holds only one of them, so the chain is of separate islands, as Hawaii's is. Once held, a stretch stays
   * held, though its island sinks later (as the oldest of Hawaii's have): the count never goes back.
   */
  update(pl: Planet, topo: Topology): number {
    const p = topo.basePositions, n = CHAIN.stretches, N = pl.rock.length;
    const island = new Int32Array(N).fill(-1), least = CHAIN.least * (topo.vertexCount / 16002);
    let islands = 0;
    for (let v = 0; v < N; v++) {
      if (island[v] !== -1 || pl.rock[v] <= 0) continue;
      const piece: number[] = [], stack = [v];
      island[v] = -2;
      while (stack.length) {
        const u = stack.pop()!;
        piece.push(u);
        for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) { const w = topo.nbrList[k]; if (island[w] === -1 && pl.rock[w] > 0) { island[w] = -2; stack.push(w); } }
      }
      const id = piece.length >= least ? islands++ : -3; // (-3: a rock, too small to count)
      for (const u of piece) island[u] = id;
    }
    // Which stretches each island stands by the way in.
    const on: Set<number>[] = Array.from({ length: islands }, () => new Set<number>());
    for (let v = 0; v < N; v++) {
      if (island[v] < 0) continue;
      const w = this.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] });
      if (w.off > CHAIN.near || w.round >= CHAIN.arc) continue;
      on[island[v]].add(Math.min(n - 1, Math.floor((w.round / CHAIN.arc) * n)));
    }
    // An island by a stretch already held is the island that holds it (or one joined to it since): it holds no other.
    const used = new Uint8Array(islands);
    for (let j = 0; j < islands; j++) for (const i of on[j]) if (this.held[i]) used[j] = 1;
    // Each other island to one stretch: along the way, each stretch still unheld takes the free island that could hold fewest others.
    for (let i = 0; i < n; i++) {
      if (this.held[i]) continue;
      let best = -1;
      for (let j = 0; j < islands; j++) if (!used[j] && on[j].has(i) && (best < 0 || on[j].size < on[best].size)) best = j;
      if (best >= 0) { used[best] = 1; this.held[i] = true; }
    }
    return this.count;
  }

  get count(): number {
    return this.held.filter(Boolean).length;
  }

  get ringed(): boolean {
    return this.held.every(Boolean);
  }

  /** The way, as points round its circle (on the unit sphere), for drawing: `per` points to a stretch. */
  points(per = 12): V3[] {
    const out: V3[] = [], total = CHAIN.stretches * per;
    for (let i = 0; i <= total; i++) {
      const t = (i / total) * Math.PI * 2 * CHAIN.arc;
      out.push({ x: this.a.x * Math.cos(t) + this.b.x * Math.sin(t), y: this.a.y * Math.cos(t) + this.b.y * Math.sin(t), z: this.a.z * Math.cos(t) + this.b.z * Math.sin(t) });
    }
    return out;
  }
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
