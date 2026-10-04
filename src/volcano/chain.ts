/**
 * The ocean world's aim: a chain of living islands all the way round the world.
 *
 * The crust carries the heat along a great circle from where it began. The first half of the way
 * round (as far as the Hawaiian chain runs, near enough) is cut into stretches; a stretch is held while something lives on or by it
 * (land with life on it, or reef in the shallows). The world is ringed when every stretch is held
 * at once, before the fire goes out. (It was the whole way round: about eight and a half minutes of
 * drift before the last stretch could even be reached, too long for the first world.) Old islands sink and wear, and unless reef holds them they
 * drop out of the chain, so the ring is a race against the sea as much as against the cooling.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';

export const CHAIN = {
  /** Stretches along the way. */
  stretches: 8,
  /** How much of the way round the world the chain runs. */
  arc: 0.5,
  /** How near the way (as the sine of an angle from its circle) living ground must be to hold a stretch. */
  near: 0.14,
  /** Life at least this strong holds. */
  living: 0.3,
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

  /** Reckon which stretches are held now. Returns how many. */
  update(pl: Planet, topo: Topology): number {
    this.held.fill(false);
    const p = topo.basePositions, n = CHAIN.stretches;
    for (let v = 0; v < pl.life.length; v++) {
      if (pl.life[v] < CHAIN.living) continue;
      const w = this.where({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] });
      if (w.off > CHAIN.near || w.round >= CHAIN.arc) continue;
      this.held[Math.min(n - 1, Math.floor((w.round / CHAIN.arc) * n))] = true;
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
