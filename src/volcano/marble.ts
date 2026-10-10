/**
 * Io's two fires, as a lava lamp: two fluids that never mix, in a round pool, marbled as ink is on water. Everything
 * done to the pool is kept as a list of moves, oldest first: a drop of colour pushing what's there straight outward,
 * a finger drawn through it dragging the colours along, a slow current turning them round. The colour anywhere is
 * found by undoing the moves from the newest back, until a drop is found that covered the point: so a line stays
 * crisp however thin it's been drawn out. Once the list is long, its oldest moves are pressed into a picture of the
 * pool (`base`), and the list goes on from there.
 *
 * All in a flat map of the pool (the world seen straight down on it): x and y in radians across, near enough.
 */

export type Vec3 = { x: number; y: number; z: number };

/** One move: a drop of your lava (1) or of the blue (2), a finger dragged (3), a current turning (4). */
export interface MarbleMove {
  type: 1 | 2 | 3 | 4;
  /** Where: the drop's middle, the finger, the current's middle. */
  x: number; y: number;
  /** A finger: which way it went (unit). */
  dx: number; dy: number;
  /** A drop: the square of the radius it covers. A finger: how far it dragged. A current: how far it turned its middle (radians). */
  amount: number;
  /** A finger: how wide it drags; a current: how wide it turns. */
  width: number;
  /** When it began (seconds), so the drawing can let it grow in rather than appear. */
  at: number;
}

/** How long each kind of move takes to come in, in the drawing (seconds). */
export const MOVE_GROWS = [0, 0.7, 0.9, 0, 3];

export class Marble {
  /** Moves kept for drawing exactly; past this many, the oldest half is pressed into the picture. */
  static readonly MOVES = 64;
  /** The picture of the pool under the moves: its side, in texels. */
  static readonly SIDE = 256;
  /** How much of a finger's way the colours under it are dragged, step by step: some, falling behind it, as a finger through oil. */
  static readonly DRAG = 0.5;
  readonly t1: Vec3; readonly t2: Vec3;
  /** The pool's radius in the flat map. */
  readonly R: number;
  readonly moves: MarbleMove[] = [];
  /** What lies under the moves: per texel, 0 none, 1 your lava, 2 the blue. */
  base: Uint8Array = new Uint8Array(Marble.SIDE * Marble.SIDE);
  /** Counts up each time `base` changes, so the drawing knows to send it again. */
  baked = 0;

  constructor(readonly centre: Vec3, radius: number) {
    const c = centre, up = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const a = unitOf({ x: c.y * up.z - c.z * up.y, y: c.z * up.x - c.x * up.z, z: c.x * up.y - c.y * up.x });
    this.t1 = a;
    this.t2 = { x: c.y * a.z - c.z * a.y, y: c.z * a.x - c.x * a.z, z: c.x * a.y - c.y * a.x };
    this.R = Math.tan(radius);
  }

  /** A point on the world, in the flat map (seen straight down from over the pool's middle). */
  toMap(p: Vec3): [number, number] {
    const c = this.centre, d = p.x * c.x + p.y * c.y + p.z * c.z;
    if (d <= 0.05) return [1e3, 1e3];
    return [(p.x * this.t1.x + p.y * this.t1.y + p.z * this.t1.z) / d, (p.x * this.t2.x + p.y * this.t2.y + p.z * this.t2.z) / d];
  }

  inPool(x: number, y: number): boolean { return x * x + y * y < this.R * this.R; }

  drop(x: number, y: number, kind: 1 | 2, area: number, at: number): void {
    this.add({ type: kind, x, y, dx: 0, dy: 0, amount: area, width: 0, at });
  }
  /** A drop grown a little more where it is: the same drop if nothing has moved since, else a new one inside it. */
  grow(x: number, y: number, more: number, at: number): boolean {
    const m = this.moves[this.moves.length - 1];
    if (m && m.type === 1 && m.x === x && m.y === y) { m.amount += more; return false; }
    this.drop(x, y, 1, more, at);
    return true;
  }
  /**
   * A finger drawn from one place to another through the pool, the colours dragged along with it, most where it
   * passed and less to either side. Cut into short steps, each no further than undoing it can follow.
   */
  stir(x0: number, y0: number, x1: number, y1: number, width: number, at: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-5) return;
    const steps = Math.ceil(len / (width * 0.9)), dx = (x1 - x0) / len, dy = (y1 - y0) / len;
    for (let i = 0; i < steps; i++) {
      const f = (i + 0.5) / steps;
      this.add({ type: 3, x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, dx, dy, amount: (len / steps) * Marble.DRAG, width, at });
    }
  }
  /** A slow current, turning the colours round a middle, most there and fading out. */
  turn(x: number, y: number, angle: number, width: number, at: number): void {
    this.add({ type: 4, x, y, dx: 0, dy: 0, amount: angle, width, at });
  }

  private add(m: MarbleMove): void {
    if (this.moves.length >= Marble.MOVES) { this.pressing ??= this.startPress(); this.work(Marble.SIDE); } // (out of room: finished at once)
    this.moves.push(m);
    if (this.moves.length >= Marble.PRESS_AT && !this.pressing) this.pressing = this.startPress();
  }
  /** Past this many moves, the oldest are pressed into the picture, a few rows at a time (see `work`). */
  static readonly PRESS_AT = 40;
  private pressing: { n: number; next: Uint8Array; row: number } | null = null;
  private startPress(): { n: number; next: Uint8Array; row: number } { return { n: Marble.PRESS_AT >> 1, next: new Uint8Array(Marble.SIDE * Marble.SIDE), row: 0 }; }
  /**
   * Some rows more of the picture pressed (the oldest moves undone texel by texel, then the old picture under them);
   * once it's all done, it takes the old one's place and those moves are let go. Until then, both stand as they were.
   */
  work(rows = 32): void {
    const job = this.pressing;
    if (!job) return;
    const S = Marble.SIDE, old = this.base, done = this.moves.slice(0, job.n), end = Math.min(S, job.row + rows);
    for (let j = job.row; j < end; j++) {
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S * 2 - 1) * this.R, y = ((j + 0.5) / S * 2 - 1) * this.R;
        if (!this.inPool(x, y)) continue;
        let p: [number, number] | null = [x, y], kind = -1;
        for (let k = done.length - 1; k >= 0; k--) { p = Marble.undo(done[k], p); if (!p) { kind = done[k].type; break; } }
        if (kind < 0) {
          const pi = Math.floor((p![0] / this.R * 0.5 + 0.5) * S), pj = Math.floor((p![1] / this.R * 0.5 + 0.5) * S);
          kind = pi >= 0 && pj >= 0 && pi < S && pj < S && this.inPool(p![0], p![1]) ? old[pj * S + pi] : 0;
        }
        job.next[j * S + i] = kind;
      }
    }
    job.row = end;
    if (end < S) return;
    this.base = job.next;
    this.moves.splice(0, job.n);
    this.pressing = null;
    this.baked++;
  }

  /** Where a point was before move `m` (and, if `m` is a drop that covered it, null). */
  static undo(m: MarbleMove, p: [number, number], share = 1): [number, number] | null {
    const [x, y] = p;
    if (m.type <= 2) {
      const A = m.amount * share, ex = x - m.x, ey = y - m.y, r2 = ex * ex + ey * ey;
      if (r2 <= A) return null;
      const f = Math.sqrt((r2 - A) / r2);
      return [m.x + ex * f, m.y + ey * f];
    }
    if (m.type === 3) {
      // (Dragged by a Gaussian of the distance from the finger: undone by stepping back, three times, from where
      // it is now to where it would have had to be. The steps are short enough that this settles.)
      let px = x, py = y;
      const w2 = m.width * m.width, a = m.amount * share;
      for (let k = 0; k < 3; k++) {
        const ex = px - m.x, ey = py - m.y, f = a * Math.exp(-(ex * ex + ey * ey) / w2);
        px = x - m.dx * f; py = y - m.dy * f;
      }
      return [px, py];
    }
    const ex = x - m.x, ey = y - m.y, th = -m.amount * share * Math.exp(-(ex * ex + ey * ey) / (m.width * m.width)), c = Math.cos(th), s = Math.sin(th);
    return [m.x + ex * c - ey * s, m.y + ex * s + ey * c];
  }

  /** The colour at a point of the flat map: 0 none, 1 your lava, 2 the blue. */
  kindAt(x: number, y: number): number {
    if (!this.inPool(x, y)) return 0;
    let p: [number, number] | null = [x, y];
    for (let i = this.moves.length - 1; i >= 0; i--) {
      p = Marble.undo(this.moves[i], p);
      if (!p) return this.moves[i].type;
    }
    return this.baseAt(p[0], p[1]);
  }
  kindAtWorld(pt: Vec3): number { const [x, y] = this.toMap(unitOf(pt)); return this.kindAt(x, y); }

  /** What the picture under the moves holds at a point (nearest texel; none outside the pool). */
  baseAt(x: number, y: number): number {
    if (!this.inPool(x, y)) return 0;
    const S = Marble.SIDE, i = Math.min(S - 1, Math.max(0, Math.floor((x / this.R * 0.5 + 0.5) * S))), j = Math.min(S - 1, Math.max(0, Math.floor((y / this.R * 0.5 + 0.5) * S)));
    return this.base[j * S + i];
  }

  /**
   * How marbled the pool is: over a grid across it, how often neighbours differ in colour (the lines between the
   * two, drawn out long and fine), against `lines`; and how much of the pool each colour holds.
   */
  measure(lines: number, N = 48): { pattern: number; lava: number; blue: number } {
    const kinds = new Int8Array(N * N).fill(-1);
    let inside = 0, lava = 0, blue = 0, edges = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N * 2 - 1) * this.R, y = ((j + 0.5) / N * 2 - 1) * this.R;
      if (!this.inPool(x, y)) continue;
      const k = this.kindAt(x, y);
      kinds[j * N + i] = k; inside++;
      if (k === 1) lava++; else if (k === 2) blue++;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = kinds[j * N + i];
      if (k <= 0) continue;
      if (i + 1 < N && kinds[j * N + i + 1] > 0 && kinds[j * N + i + 1] !== k) edges++; // (only where the two colours meet)
      if (j + 1 < N && kinds[(j + 1) * N + i] > 0 && kinds[(j + 1) * N + i] !== k) edges++;
    }
    // (Counted on a 48-wide grid; scaled so a finer or coarser grid reads the same.)
    return { pattern: Math.min(1, (edges * 48) / N / lines), lava: lava / Math.max(1, inside), blue: blue / Math.max(1, inside) };
  }
}

function unitOf(p: Vec3): Vec3 { const l = Math.hypot(p.x, p.y, p.z) || 1; return { x: p.x / l, y: p.y / l, z: p.z / l }; }
