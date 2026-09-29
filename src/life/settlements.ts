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
 *  - Whatever is drawn is what the world is made of (1). Streets keep clear of
 *    buildings and buildings stay off streets, both as rules checked before
 *    anything is laid.
 *  - Streets are grown one at a time and each stops at the first street it
 *    meets (5b, 5c). They run along mesh edges, so two streets can only meet
 *    at a vertex: every crossing is a junction by construction.
 *  - Infrastructure knows why it exists (7). A building's street is its way to
 *    the rest of the town, and a road exists because two towns need one.
 *
 * Time is rotation: `advance(days)` grows every town, in true time order
 * across towns, so ten small advances build the same world as one big one.
 */
import type { Topology } from '../mesh/topology';

export const TOWN = {
  /** Closest two buildings may stand, in world units (object radius = 1)... */
  spacing: 0.065,
  /** ...and never closer than this many mesh edges. Streets run on the mesh,
   *  so houses closer than the mesh's own resolution take every vertex and
   *  leave no ground for a street between them. Measured: with houses 0.042
   *  apart on edges of 0.040 and 0.051, no loop ever closed; at 1.7 edges
   *  apart, 10 and 4 did. */
  edgesBetween: 1.7,
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

export const STREET = {
  /** No street passes closer than this to a building it doesn't serve,
   *  and no building stands closer than this to a street. */
  clearance: 0.019,
  /** A building with no street within this reach is refused. */
  reach: 0.3,
  /** Streets may be steeper than building plots, but not cliffs. */
  steepness: 1.6,
  /** Climbing cost for streets, so they wind round hills along the contours. */
  climb: 6,
  /** Two towns are joined by a road once both have this many buildings. */
  roadAt: 6,
  /** A hall always keeps this many open sides for streets to arrive by. */
  hallOpen: 2,
  /** A lane closes a loop when the way round by street is this many times
   *  the lane's own length, and the lane is no longer than `loopReach`. */
  loopDetour: 3,
  loopReach: 0.16,
  roadReach: 3.5,
};

export interface Street {
  /** Welded vertices, from the building (or town) it serves to where it met the network. */
  path: number[];
  town: number;
  kind: 'street' | 'road' | 'lane';
}

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
  readonly streets: Street[] = [];
  /** Vertex -> town, for every vertex a street runs through (and each hall). */
  private network = new Map<number, number>();
  private joined = new Set<string>();
  /** Slope per welded vertex, in height units per world unit, from the ground as it was scanned. */
  readonly slope: Float32Array;
  readonly buildableSlope: number;
  /** House spacing for this mesh: `TOWN.spacing`, or wider on a coarse mesh. */
  readonly spacing: number;
  private occupied: number[] = []; // vertex per building, for spacing checks
  private buildingAt = new Set<number>();

  constructor(private topo: Topology, private heights: Float32Array) {
    this.slope = slopes(topo, heights);
    const sorted = Float32Array.from(this.slope).sort();
    this.buildableSlope = Math.max(TOWN.gentle, sorted[Math.floor(TOWN.buildableRank * (sorted.length - 1))]);
    this.spacing = Math.max(TOWN.spacing, TOWN.edgesBetween * meanEdge(topo));
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
    this.lay(t, site, null);
    this.network.set(site, t.id); // the hall is where the first streets lead
    this.expand(t, site, 0);
    return { kind: 'founded', town: t.id, vertex: site };
  }

  /** Time passes: every town grows. Returns how many marks were laid. */
  advance(days: number): number {
    // Event by event in true time order across all towns: whichever town is
    // next due builds next, whatever size the step. The rate depends on the
    // town's size, and towns take each other's ground, so growing one town
    // for the whole step and then the next would make the world depend on
    // the frame rate.
    let laid = 0, left = days;
    const rate = (t: Town) => TOWN.baseRate + TOWN.rateBySize * Math.sqrt(t.buildings.length);
    const live = new Set(this.towns.filter((t) => t.frontier.length > 0));
    while (left > 0 && live.size) {
      let next: Town | null = null, soonest = Infinity;
      for (const t of live) {
        const until = (1 - t.owed) / rate(t);
        if (until < soonest) { soonest = until; next = t; } // ties go to the older town
      }
      if (!next || soonest > left) {
        for (const t of live) t.owed += rate(t) * left;
        break;
      }
      for (const t of live) if (t !== next) t.owed += rate(t) * soonest;
      next.owed = 0;
      left -= soonest;
      if (this.growOne(next) === null) { live.delete(next); continue; }
      laid++;
      laid += this.joinTowns();
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
        const path = this.connect(v);
        if (!path) continue; // unreachable: refused, never built and then stranded
        this.lay(t, v, path);
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
      const path = this.buildable(u) && this.roomFor(u) ? this.connect(u) : null;
      if (path) {
        this.lay(t, u, path);
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

  private lay(t: Town, v: number, path: number[] | null): void {
    this.buildings.push({ vertex: v, town: t.id, order: t.buildings.length });
    t.buildings.push(v);
    this.occupied.push(v);
    this.buildingAt.add(v);
    if (path) {
      this.addStreet({ path, town: t.id, kind: 'street' });
      this.closeLoop(path, t.id);
    }
  }

  /**
   * A street that grew one at a time and stopped at the first street it met
   * makes a tree: every house on its own spur, and nothing loops. So after a
   * street is laid, look near its door for a point on the network that is
   * close over the ground but a long way round by street, and if one is,
   * lay the lane between them. Asked the real question, as whatwesaved's
   * PRINCIPLES.md 4 puts it: road distance against the crow flight.
   */
  private closeLoop(street: number[], town: number): void {
    if (STREET.loopDetour === Infinity || street.length < 2) return;
    // From every point of the new street, not only its door: the branch a
    // loop could close to is usually the one growing next to it later, and
    // measured, looking from the door alone found no loop in forty streets.
    const own = new Set(street);
    let best: number[] | null = null, bestLen = Infinity;
    for (const from of street.slice(1)) {
      const byStreet = this.networkDistances(from, STREET.loopReach * STREET.loopDetour * 2);
      const lane = this.route(
        [from],
        (u, len) => this.network.has(u) && !own.has(u) && (byStreet.get(u) ?? Infinity) > STREET.loopDetour * len,
        STREET.loopReach,
        -1,
      );
      const len = lane ? this.pathLength(lane) : Infinity;
      if (len < bestLen) { best = lane; bestLen = len; }
    }
    if (best) this.addStreet({ path: best, town, kind: 'lane' });
  }

  private pathLength(path: number[]): number {
    let l = 0;
    for (let i = 1; i < path.length; i++) l += this.dist(path[i - 1], path[i]);
    return l;
  }

  /** Distance along streets from `from` to every network vertex within `limit`. */
  private networkDistances(from: number, limit: number): Map<number, number> {
    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (const st of this.streets) {
      const path = st.kind === 'street' ? st.path.slice(1) : st.path; // the house itself isn't street
      for (let i = 1; i < path.length; i++) link(path[i - 1], path[i]);
    }
    const out = new Map<number, number>([[from, 0]]);
    const f = new Settlements.Frontier();
    f.push(0, from);
    while (f.size) {
      const [d, u] = f.pop();
      if (d > (out.get(u) ?? Infinity) || d > limit) continue;
      for (const w of adj.get(u) ?? []) {
        const nd = d + this.dist(u, w);
        if (nd < (out.get(w) ?? Infinity)) { out.set(w, nd); f.push(nd, w); }
      }
    }
    return out;
  }

  private addStreet(st: Street): void {
    this.streets.push(st);
    // The building's own vertex is the building, not street.
    for (const u of st.kind === 'street' ? st.path.slice(1) : st.path) if (!this.network.has(u)) this.network.set(u, st.town);
  }

  // ------------------------------------------------------------ streets

  /** The way from a new building to the nearest street, or null if there is none in reach. */
  private connect(v: number): number[] | null {
    return this.route([v], (u) => this.network.has(u), STREET.reach, v);
  }

  /** Roads between towns that have both grown, once per pair. */
  private joinTowns(): number {
    let laid = 0;
    for (const a of this.towns) {
      if (a.buildings.length < STREET.roadAt) continue;
      for (const b of this.towns) {
        if (b.id <= a.id || b.buildings.length < STREET.roadAt) continue;
        const key = `${a.id}-${b.id}`;
        if (this.joined.has(key)) continue;
        this.joined.add(key); // tried once; a road that can't be found isn't retried every frame
        const from = [...this.network].filter(([, t]) => t === a.id).map(([u]) => u).sort((x, y) => x - y);
        const path = this.route(from, (u) => this.network.get(u) === b.id, STREET.roadReach, -1);
        if (path) { this.addStreet({ path, town: a.id, kind: 'road' }); laid++; }
      }
    }
    return laid;
  }

  /**
   * Cheapest way over the surface from any of `sources` to a vertex that
   * satisfies `isTarget`: distance, plus climbing. Passes only where a street
   * may run. `own` is the building the route serves, which it may start from.
   */
  private route(sources: number[], isTarget: (u: number, len: number) => boolean, reach: number, own: number): number[] | null {
    const f = new Settlements.Frontier();
    const cost = new Map<number, number>(), prev = new Map<number, number>(), length = new Map<number, number>();
    for (const s of sources) { f.push(0, s); cost.set(s, 0); length.set(s, 0); }
    const done = new Set<number>();
    const srcSet = new Set(sources);
    while (f.size) {
      const [c, u] = f.pop();
      if (done.has(u)) continue;
      done.add(u);
      if (!srcSet.has(u) && isTarget(u, length.get(u)!)) {
        const path = [u];
        for (let w = u; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
        return path.reverse();
      }
      this.eachNeighbour(u, (w, d) => {
        if (done.has(w)) return;
        const len = length.get(u)! + d;
        if (len > reach) return;
        // Only the end may be on the network: a new way never runs along an
        // existing street, or the pen would draw the same street twice.
        if (!isTarget(w, len) && (this.network.has(w) || !this.streetMayRun(w, own))) return;
        const step = d * (1 + STREET.climb * Math.abs(this.heights[w] - this.heights[u]) / d / (this.buildableSlope || 1));
        const nc = c + step;
        if (nc < (cost.get(w) ?? Infinity)) {
          cost.set(w, nc); prev.set(w, u); length.set(w, len);
          f.push(nc, w);
        }
      });
    }
    return null;
  }

  private streetMayRun(u: number, own: number): boolean {
    if (this.localSlope(u) > this.buildableSlope * STREET.steepness) return false;
    for (const o of this.occupied) if (o !== own && this.dist(u, o) < STREET.clearance) return false;
    return true;
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
    for (const o of this.occupied) if (this.dist(v, o) < this.spacing) return false;
    for (const u of this.network.keys()) if (this.dist(v, u) < STREET.clearance) return false;
    return !this.wouldEnclose(v);
  }

  /**
   * Would a building here wall in a town's hall? On a coarse mesh the first
   * ring of houses can take every vertex round it, and then no later building
   * can reach a street: measured, a town stalled at seven buildings with 2,689
   * of 2,695 connections refused. Refused here, before it is laid, rather than
   * repaired afterwards (whatwesaved PRINCIPLES.md, 3).
   */
  private wouldEnclose(v: number): boolean {
    for (const t of this.towns) {
      const h = t.centre;
      let adjacent = false, open = 0;
      this.eachNeighbour(h, (w) => {
        if (w === v) { adjacent = true; return; }
        if (!this.buildingAt.has(w)) open++;
      });
      if (adjacent && open < STREET.hallOpen) return true;
    }
    return false;
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

function meanEdge(topo: Topology): number {
  const { nbrOffsets, nbrList, basePositions: p } = topo;
  let sum = 0, n = 0;
  for (let v = 0; v < topo.vertexCount; v++) {
    for (let k = nbrOffsets[v]; k < nbrOffsets[v + 1]; k++) {
      const u = nbrList[k];
      if (u < v) continue;
      sum += Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 1] - p[v * 3 + 1], p[u * 3 + 2] - p[v * 3 + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}
