/**
 * Settlements: a tap says "people here", and the ground decides the rest.
 *
 * Rules carried over from whatwesaved (PRINCIPLES.md):
 *  - Where a thing can stand comes from the ground; the touch only says which
 *    place wakes up (2). Buildable ground is a fact about the object's own slope.
 *  - Refuse before committing (3). A building is laid only where it may stand,
 *    and once laid it is never taken back.
 *  - A mark must not depend on anything that isn't about that mark (20). Each
 *    town grows from its own queue, so founding one town doesn't move a single
 *    building in another.
 *  - A shared routine doesn't carry its caller's scale (12). Spacing is in world
 *    units, not vertices, so a denser scan doesn't get a denser town.
 *
 * Time is rotation: `advance(days)` grows every town. It is batch-independent,
 * so ten small advances build the same town as one big one.
 */
import type { Topology } from '../mesh/topology';

export const TOWN = {
  /** Closest two buildings may stand, in world units (object radius = 1). */
  spacing: 0.042,
  /** Buildable if the slope is below this rank of the object's own slopes... */
  buildableRank: 0.6,
  /** ...or gentler than this in absolute terms (height range per object radius).
   *  Rank alone calls the steepest 40% of any object unbuildable, however
   *  gentle all of it is: the threshold would be deciding, not the ground. */
  gentle: 1.5,
  /** How far a tap on steep ground looks for somewhere it can stand. */
  searchRadius: 0.15,
  /** A tap this close to a town grows it instead of founding another. */
  joinRadius: 0.1,
  /** Buildings per day: a hamlet grows steadily, a town faster. */
  baseRate: 2,
  rateBySize: 0.25,
  /** Cost of climbing, relative to distance, and of height itself. */
  slopeCost: 4,
  heightCost: 1.5,
};

export interface Building {
  vertex: number;
  town: number;
  /** 0 for the first building of a town (its hall), counting up. */
  order: number;
}

export interface Town {
  id: number;
  centre: number;
  buildings: number[];
  /** Fractional buildings owed by time already passed. */
  owed: number;
  /** Dijkstra frontier: [cost, vertex], kept sorted by cost then vertex. */
  frontier: [number, number][];
  settled: Map<number, number>;
}

export type TapResult =
  | { kind: 'founded'; town: number; vertex: number }
  | { kind: 'grew'; town: number; vertex: number }
  | { kind: 'refused' };

export class Settlements {
  readonly towns: Town[] = [];
  readonly buildings: Building[] = [];
  /** Slope per welded vertex, in height units per world unit, from the ground as it was scanned. */
  readonly slope: Float32Array;
  readonly buildableSlope: number;
  private occupied: number[] = []; // vertex per building, for spacing checks

  constructor(private topo: Topology, private heights: Float32Array) {
    this.slope = slopes(topo, heights);
    const sorted = Float32Array.from(this.slope).sort();
    this.buildableSlope = Math.max(TOWN.gentle, sorted[Math.floor(TOWN.buildableRank * (sorted.length - 1))]);
  }

  /** Can a building stand on this vertex, given the ground as it is now? */
  buildable(v: number): boolean {
    return this.localSlope(v) <= this.buildableSlope;
  }

  /** A tap at a surface point (local space). */
  tap(point: ArrayLike<number>): TapResult {
    const near = this.nearestVertex(point);
    const town = this.townNear(near);
    if (town) {
      const grown = this.growNear(town, near, 3);
      return grown === null ? { kind: 'refused' } : { kind: 'grew', town: town.id, vertex: grown };
    }
    const site = this.findSite(near);
    if (site === null) return { kind: 'refused' };
    const t: Town = { id: this.towns.length, centre: site, buildings: [], owed: 0, frontier: [], settled: new Map() };
    this.towns.push(t);
    this.lay(t, site);
    this.expand(t, site, 0);
    return { kind: 'founded', town: t.id, vertex: site };
  }

  /** Time passes: every town grows. Returns how many buildings were laid. */
  advance(days: number): number {
    let laid = 0;
    for (const t of this.towns) {
      // Building by building, because the rate depends on the size: one
      // advance of a day must build what ten advances of a tenth do.
      let left = days;
      while (left > 0) {
        const rate = TOWN.baseRate + TOWN.rateBySize * Math.sqrt(t.buildings.length);
        const until = (1 - t.owed) / rate;
        if (until > left) { t.owed += rate * left; break; }
        left -= until;
        t.owed = 0;
        if (this.growOne(t) === null) break; // nowhere left to go
        laid++;
      }
    }
    return laid;
  }

  // ------------------------------------------------------------ growth

  private growOne(t: Town): number | null {
    while (t.frontier.length) {
      const [cost, v] = t.frontier.shift()!;
      if (t.settled.has(v)) continue;
      t.settled.set(v, cost);
      this.expand(t, v, cost);
      // Refused here, not undone later: the ground may have been sculpted
      // steep since this vertex was queued.
      if (this.buildable(v) && this.roomFor(v)) {
        this.lay(t, v);
        return v;
      }
    }
    return null;
  }

  /** A tap on a town: lay up to `count` buildings nearest to where it landed. */
  private growNear(t: Town, v: number, count: number): number | null {
    let first: number | null = null;
    const local = new Settlements.Frontier();
    local.push(0, v);
    const seen = new Set<number>();
    let laid = 0;
    while (local.size && laid < count) {
      const [cost, u] = local.pop();
      if (seen.has(u) || cost > TOWN.searchRadius) continue;
      seen.add(u);
      if (this.buildable(u) && this.roomFor(u)) {
        this.lay(t, u);
        if (!t.settled.has(u)) { t.settled.set(u, 0); this.expand(t, u, 0); }
        first ??= u;
        laid++;
      }
      this.eachNeighbour(u, (w, d) => { if (!seen.has(w)) local.push(cost + d, w); });
    }
    return first;
  }

  private expand(t: Town, v: number, cost: number): void {
    this.eachNeighbour(v, (w, d) => {
      if (t.settled.has(w) || !this.buildable(w)) return;
      const step = d * (1 + TOWN.slopeCost * this.localSlope(w) / (this.buildableSlope || 1)) + TOWN.heightCost * d * Math.max(0, this.heights[w]);
      insertSorted(t.frontier, [cost + step, w]);
    });
  }

  private lay(t: Town, v: number): void {
    this.buildings.push({ vertex: v, town: t.id, order: t.buildings.length });
    t.buildings.push(v);
    this.occupied.push(v);
  }

  // ------------------------------------------------------------ the ground

  private findSite(v: number): number | null {
    // Nearest buildable ground with room, within reach of the tap, by distance over the surface.
    const f = new Settlements.Frontier();
    f.push(0, v);
    const seen = new Set<number>();
    while (f.size) {
      const [d, u] = f.pop();
      if (seen.has(u) || d > TOWN.searchRadius) continue;
      seen.add(u);
      if (this.buildable(u) && this.roomFor(u)) return u;
      this.eachNeighbour(u, (w, e) => { if (!seen.has(w)) f.push(d + e, w); });
    }
    return null;
  }

  private townNear(v: number): Town | null {
    let best: Town | null = null, bd = TOWN.joinRadius;
    for (const b of this.buildings) {
      const d = this.dist(v, b.vertex);
      if (d < bd) { bd = d; best = this.towns[b.town]; }
    }
    return best;
  }

  private roomFor(v: number): boolean {
    for (const o of this.occupied) if (this.dist(v, o) < TOWN.spacing) return false;
    return true;
  }

  /** Slope with the current edits, so sculpted cliffs refuse building. */
  private localSlope(v: number): number {
    const { nbrOffsets, nbrList, positions } = this.topo;
    let s = 0;
    for (let k = nbrOffsets[v]; k < nbrOffsets[v + 1]; k++) {
      const u = nbrList[k];
      const d = Math.hypot(positions[u * 3] - positions[v * 3], positions[u * 3 + 1] - positions[v * 3 + 1], positions[u * 3 + 2] - positions[v * 3 + 2]);
      if (d > 0) s = Math.max(s, Math.abs(this.heights[u] - this.heights[v]) / d);
    }
    return s;
  }

  private nearestVertex(p: ArrayLike<number>): number {
    const pos = this.topo.positions;
    let best = 0, bd = Infinity;
    for (let v = 0; v < this.topo.vertexCount; v++) {
      const d = (pos[v * 3] - p[0]) ** 2 + (pos[v * 3 + 1] - p[1]) ** 2 + (pos[v * 3 + 2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private dist(a: number, b: number): number {
    const p = this.topo.positions;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  private eachNeighbour(v: number, fn: (w: number, d: number) => void): void {
    const { nbrOffsets, nbrList } = this.topo;
    for (let k = nbrOffsets[v]; k < nbrOffsets[v + 1]; k++) {
      const w = nbrList[k];
      fn(w, this.dist(v, w));
    }
  }

  /** Small binary heap for local searches. */
  static Frontier = class {
    private h: [number, number][] = [];
    get size(): number { return this.h.length; }
    push(cost: number, v: number): void {
      const h = this.h;
      h.push([cost, v]);
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (less(h[p], h[i])) break;
        [h[p], h[i]] = [h[i], h[p]];
        i = p;
      }
    }
    pop(): [number, number] {
      const h = this.h, top = h[0], last = h.pop()!;
      if (h.length) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < h.length && less(h[l], h[m])) m = l;
          if (r < h.length && less(h[r], h[m])) m = r;
          if (m === i) break;
          [h[m], h[i]] = [h[i], h[m]];
          i = m;
        }
      }
      return top;
    }
  };
}

/** Ties broken by vertex, so growth never depends on insertion order. */
function less(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

function insertSorted(list: [number, number][], item: [number, number]): void {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (less(list[mid], item)) lo = mid + 1; else hi = mid;
  }
  list.splice(lo, 0, item);
}

function slopes(topo: Topology, heights: Float32Array): Float32Array {
  const out = new Float32Array(topo.vertexCount);
  const { nbrOffsets, nbrList, basePositions: p } = topo;
  for (let v = 0; v < topo.vertexCount; v++) {
    let s = 0;
    for (let k = nbrOffsets[v]; k < nbrOffsets[v + 1]; k++) {
      const u = nbrList[k];
      const d = Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 1] - p[v * 3 + 1], p[u * 3 + 2] - p[v * 3 + 2]);
      if (d > 0) s = Math.max(s, Math.abs(heights[u] - heights[v]) / d);
    }
    out[v] = s;
  }
  return out;
}
