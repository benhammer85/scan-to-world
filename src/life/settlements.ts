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
  /** A tap this close to a town grows it instead of founding another... */
  joinRadius: 0.1,
  /** ...and no new town is founded nearer than this to another: a tap there
   *  grows the nearest town instead. Without it, tapping about founded a
   *  crowd of hamlets, square against square. */
  apart: 0.32,
  /** Buildings per day: a hamlet grows steadily, a town faster. */
  baseRate: 2,
  rateBySize: 0.25,
  /** Extra houses per day, for each house the water took that is not yet rebuilt. */
  rebuildRate: 1,
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
  /** A new street run keeps going along the contour for up to this far... */
  runLength: 0.26,
  /** ...and keeps this many mesh edges from other streets, so a row of houses fits between. */
  runGapEdges: 2.6,
  /** How straight a run must keep: the least cosine between one step and the next. */
  runStraightness: 0.45,
  /** A new street shorter than this many mesh edges is refused. */
  shortestRun: 2,

  roadReach: 3.5,
};

export const SQUARE = {
  /** Open ground kept round a town's hall, in world units... */
  radius: 0.07,
  /** ...and never narrower than this many mesh edges, so there is ground inside to stand in. */
  radiusEdges: 1.8,
  /** A site needs this share of its square buildable to found a town there. */
  buildableShare: 0.7,
};

export const MARKET = {
  /** A town gets its market when it reaches this many houses... */
  at: 10,
  /** ...and one more stall for every this many houses after that... */
  per: 4,
  /** ...up to this many. */
  most: 8,
  /** Stalls stand in a ring round the hall, at this share of the square's radius, in `most` even slots. */
  ring: 0.55,
};

export const BRIDGE = {
  /** A bridge may cross water up to this wide (world units)... */
  span: 0.14,
  /** ...and a step over water costs this many times a step on land, so a
   *  bridge is only built where it saves a real detour. */
  cost: 3,
};

export const HARBOUR = {
  /** A town gets a harbour at this many houses, if it has a street on the shore... */
  at: 6,
  /** ...with a pier out into the water up to this long... */
  pier: 0.08,
  /** ...and one boat for every this many houses, up to `boats`. */
  perBoat: 8,
  boats: 4,
};

export const FERRY = {
  /** Harbours on the same water this close by boat get a ferry between them. */
  reach: 2,
};

export interface Ferry {
  /** Indexes into `harbours`. */
  from: number;
  to: number;
  /** Over water, from one pier's end to the other's. */
  route: number[];
}

export interface Harbour {
  town: number;
  /** From the shore street out over the water. */
  pier: number[];
  drowned?: boolean;
}

export interface Stall {
  town: number;
  /** Which of the market's even slots round the hall; slots fill in order and never move. */
  slot: number;
}

export interface Street {
  /** Welded vertices, from its start to where it met the network. */
  path: number[];
  town: number;
  /** street: along the contour, houses front it. link: climbs from the network to a street. */
  kind: 'street' | 'link' | 'road' | 'lane' | 'square';
  /** Its first vertex is a house (the old per-house spur). The house isn't street. */
  fromHouse?: boolean;
  /** A road's two towns, for how much it carries. */
  joins?: [number, number];
  /** A road wears in with use: 0 a track, 1 a lane, 2 a made road. Only ever goes up. */
  grade?: number;
}

export const TRADE = {
  /** A road is worn into a lane, then made up, when the smaller of its towns reaches... */
  lane: 12,
  road: 24,
};

export const RAIL = {
  /** Two towns this big get a railway between them... */
  at: 28,
  reach: 3.5,
  /**
   * ...held to the gentlest ruling gradient the ground allows, with this much
   * slack. A railway is limited by its steepest pitch, so that is what is
   * chosen: first the least steepest-pitch any way can have, then the
   * shortest way within it. Costing the climb (or even its square) could
   * not do this: any line over a ridge climbs the same height in all, and
   * measured, the rail's ruling gradient came out equal to the road's
   * (0.575 each), better at one weight and worse again at a higher one.
   * The slack trades gradient for straightness, measured on the orange:
   * 1.05 wound the line to 2.64 times the direct distance, 1.2 to 1.78
   * with a ruling grade still gentler than a road's; 1.4 was steeper than a road.
   */
  slack: 1.2,
  /** A rail may cross a street (a level crossing), at this extra cost. */
  crossing: 1,
};

export const CABLE = {
  /** A town this big, with snow within reach, gets a cable line up to it. */
  at: 16,
  reach: 0.45,
};

export interface Rail {
  from: number;
  to: number;
  path: number[];
}

export interface Cable {
  town: number;
  /** From the town up over the ground to the snow. */
  path: number[];
}

/** The vertices of a way that are street, not house. */
export function streetVertices(st: Street): number[] {
  return st.fromHouse ? st.path.slice(1) : st.path;
}

export interface Building {
  vertex: number;
  town: number;
  /** 0 for the first building of a town (its hall), counting up. */
  order: number;
  /** The street vertex this house faces. Every house but a hall has one. */
  front?: number;
  /**
   * Standing unless the water came: a drowned house is under water, and a
   * ruin is where one stood when the water went down. Never removed: the
   * record only grows (whatwesaved PRINCIPLES.md, 3).
   */
  state?: 'drowned' | 'ruin';
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
  /** Houses the water took that the town has yet to build again. */
  rebuild: number;
}

export type TapResult =
  | { kind: 'founded'; town: number; vertex: number }
  | { kind: 'grew'; town: number; vertex: number }
  | { kind: 'refused' };

export class Settlements {
  readonly towns: Town[] = [];
  readonly buildings: Building[] = [];
  readonly streets: Street[] = [];
  readonly stalls: Stall[] = [];
  readonly harbours: Harbour[] = [];
  readonly ferries: Ferry[] = [];
  readonly rails: Rail[] = [];
  readonly railAt = new Set<number>();
  readonly cables: Cable[] = [];
  /** Days since the world began: carts give way to cars as it ages. */
  day = 0;
  /** Street vertices carried over water. */
  readonly bridgeAt = new Set<number>();
  /** Street vertices under water now (not bridges): out of the network until the water goes. */
  readonly submerged = new Map<number, number>();
  /** For each wet vertex, how far it is to dry ground; a bridge may cross only narrow water. */
  private shoreDist: Float32Array | null = null;
  private depth: Float32Array | null = null;
  /** Vertex -> town, for the open ground of each town's square (its edge is street). */
  private reserved = new Map<number, number>();
  /** Radius of a square on this mesh. */
  readonly squareRadius: number;
  /** Vertex -> town, for every vertex a street runs through (and each hall). */
  private network = new Map<number, number>();
  private joined = new Set<string>();
  /** Slope per welded vertex, in height units per world unit, from the ground as it was scanned. */
  readonly slope: Float32Array;
  readonly buildableSlope: number;
  /** House spacing for this mesh: `TOWN.spacing`, or wider on a coarse mesh. */
  readonly spacing: number;
  /** Mean mesh edge length. */
  readonly edge: number;
  private occupied: number[] = []; // vertex per building, for spacing checks
  private buildingAt = new Set<number>();

  constructor(private topo: Topology, private heights: Float32Array) {
    this.slope = slopes(topo, heights);
    const sorted = Float32Array.from(this.slope).sort();
    this.buildableSlope = Math.max(TOWN.gentle, sorted[Math.floor(TOWN.buildableRank * (sorted.length - 1))]);
    this.edge = meanEdge(topo);
    this.spacing = Math.max(TOWN.spacing, TOWN.edgesBetween * this.edge);
    this.squareRadius = Math.max(SQUARE.radius, SQUARE.radiusEdges * this.edge);
  }

  /** Can a building stand on this vertex, given the ground as it is now? */
  buildable(v: number): boolean {
    return !this.wet?.[v] && !this.stream?.[v] && !this.snow?.[v] && this.localSlope(v) <= this.buildableSlope;
  }

  /**
   * Water on the ground now: nothing is built or routed on it (but bridges),
   * and it is the same mask the shore is drawn from. Where water has come up
   * over what was built, that is drowned; where it has gone down, what
   * drowned is a ruin, and the ground is free again.
   */
  setWater(wet: Uint8Array, depth?: Float32Array, stream?: Uint8Array, snow?: Uint8Array): void {
    this.wet = wet;
    this.depth = depth ?? null;
    this.stream = stream ?? null;
    this.snow = snow ?? null;
    this.shoreDist = distanceToDry(this.topo, wet);
    this.flood();
    this.linkHarbours();
  }

  private flood(): void {
    const wet = this.wet!;
    for (const b of this.buildings) {
      // A stream that has come to run through a house takes it too.
      if (b.state === undefined && (wet[b.vertex] || this.stream?.[b.vertex])) {
        b.state = 'drowned';
        this.buildingAt.delete(b.vertex);
        this.occupied.splice(this.occupied.indexOf(b.vertex), 1);
        this.towns[b.town].rebuild++;
      } else if (b.state === 'drowned' && !wet[b.vertex] && !this.stream?.[b.vertex]) {
        b.state = 'ruin';
      }
    }
    for (const [u, town] of this.network) {
      if ((wet[u] || this.stream?.[u]) && !this.bridgeAt.has(u)) { this.network.delete(u); this.submerged.set(u, town); }
    }
    for (const [u, town] of this.submerged) {
      if (!wet[u] && !this.stream?.[u]) { this.submerged.delete(u); this.network.set(u, town); }
    }
    for (const h of this.harbours) if (wet[h.pier[0]]) h.drowned = true;
  }

  /** How many houses are standing (not drowned, not ruins). */
  get standing(): number {
    return this.buildings.filter((b) => b.state === undefined).length;
  }
  private wet: Uint8Array | null = null;
  private stream: Uint8Array | null = null;
  private snow: Uint8Array | null = null;

  /** A tap at a surface point (local space). */
  tap(point: ArrayLike<number>): TapResult {
    const near = this.nearestVertex(point);
    const town = this.townNear(near) ?? this.townWithin(near, TOWN.apart);
    if (town) {
      const grown = this.growNear(town, near, 3);
      return grown === null ? { kind: 'refused' } : { kind: 'grew', town: town.id, vertex: grown };
    }
    const site = this.findSite(near);
    if (site === null) return { kind: 'refused' };
    const t: Town = { id: this.towns.length, centre: site, buildings: [], owed: 0, frontier: [], settled: new Map(), rebuild: 0 };
    this.towns.push(t);
    this.lay(t, site);
    this.openSquare(t);
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
    // A town that lost houses to the water rebuilds them faster than it grows.
    const rate = (t: Town) => TOWN.baseRate + TOWN.rateBySize * Math.sqrt(t.buildings.length) + TOWN.rebuildRate * t.rebuild;
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
      this.wearRoads();
      laid += this.joinRails() + this.liftToSnow();
    }
    this.day += days;
    return laid;
  }

  // ------------------------------------------------------------ transport

  /** Roads wear in with the trade they carry: track, then lane, then made road. Never back. */
  private wearRoads(): void {
    const houses = (t: number) => this.buildings.filter((b) => b.town === t && b.state === undefined).length - 1;
    for (const st of this.streets) {
      if (st.kind !== 'road' || !st.joins) continue;
      const trade = Math.min(houses(st.joins[0]), houses(st.joins[1]));
      const grade = trade >= TRADE.road ? 2 : trade >= TRADE.lane ? 1 : 0;
      if (grade > (st.grade ?? 0)) st.grade = grade;
    }
  }

  /**
   * Railways between big towns, once per pair, running to a harbour where
   * there is one (whatwesaved PRINCIPLES.md, 7). Gentle gradients; they cross
   * streets on the level but never run along them, and are not streets.
   */
  private joinRails(): number {
    let laid = 0;
    const houses = (t: Town) => this.buildings.filter((b) => b.town === t.id && b.state === undefined).length - 1;
    const end = (t: Town) => this.harbours.find((h) => h.town === t.id && !h.drowned)?.pier[0]
      ?? this.streets.find((x) => x.kind === 'square' && x.town === t.id)?.path[0];
    for (const a of this.towns) {
      if (houses(a) < RAIL.at) continue;
      for (const b of this.towns) {
        if (b.id <= a.id || houses(b) < RAIL.at) continue;
        const key = `rail ${a.id}-${b.id}`;
        if (this.joined.has(key)) continue;
        this.joined.add(key);
        const from = end(a), to = end(b);
        if (from === undefined || to === undefined) continue;
        const path = this.railRoute(from, to);
        if (!path) continue;
        this.rails.push({ from: a.id, to: b.id, path });
        for (const v of path) this.railAt.add(v);
        laid++;
      }
    }
    return laid;
  }

  private railRoute(from: number, to: number): number[] | null {
    const grade = (u: number, w: number, d: number) => Math.abs(this.heights[w] - this.heights[u]) / d;
    const mayPass = (w: number) => {
      if (w === to) return true;
      // Not across a square, nor round its edge: that is street, and a rail never runs along a street.
      if (this.buildingAt.has(w) || this.reserved.has(w)) return false;
      if (this.wet?.[w] && (this.shoreDist?.[w] ?? Infinity) > BRIDGE.span / 2) return false;
      return !this.snow?.[w];
    };
    // 1. The least ruling gradient any way from `from` to `to` can have (minimax path).
    const worst = new Map([[from, 0]]);
    const f1 = new Settlements.Frontier();
    f1.push(0, from);
    let ruling = Infinity;
    while (f1.size) {
      const [g, u] = f1.pop();
      if (g > (worst.get(u) ?? Infinity)) continue;
      if (u === to) { ruling = g; break; }
      this.eachNeighbour(u, (w, d) => {
        if (!mayPass(w)) return;
        const ng = Math.max(g, grade(u, w, d));
        if (ng < (worst.get(w) ?? Infinity)) { worst.set(w, ng); f1.push(ng, w); }
      });
    }
    if (!Number.isFinite(ruling)) return null;
    // 2. The shortest way that never pitches steeper than that (and a little).
    // If that is too long to lay, allow a steeper pitch, a step at a time.
    for (let allow = ruling * RAIL.slack; allow <= ruling * 3 + 1e-9; allow *= 1.25) {
      const cost = new Map([[from, 0]]), prev = new Map<number, number>(), len = new Map([[from, 0]]);
      const f = new Settlements.Frontier();
      f.push(0, from);
      while (f.size) {
        const [c, u] = f.pop();
        if (c > (cost.get(u) ?? Infinity)) continue;
        if (u === to) {
          const path = [to];
          for (let w = to; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
          return path.reverse();
        }
        this.eachNeighbour(u, (w, d) => {
          if (!mayPass(w) || grade(u, w, d) > allow + 1e-12) return;
          const l = len.get(u)! + d;
          if (l > RAIL.reach) return;
          const step = d * (1 + (this.network.has(w) ? RAIL.crossing : 0) + (this.wet?.[w] ? BRIDGE.cost : 0));
          const nc = c + step;
          if (nc < (cost.get(w) ?? Infinity)) { cost.set(w, nc); prev.set(w, u); len.set(w, l); f.push(nc, w); }
        });
      }
    }
    return null;
  }

  /**
   * Level crossings: where a railway meets a street. Rails and streets both
   * run along mesh edges, so they can only meet at a shared vertex, and
   * every such vertex is a crossing (its two ends are stations, not crossings).
   */
  crossings(): { vertex: number; rail: number }[] {
    const out: { vertex: number; rail: number }[] = [];
    this.rails.forEach((r, ri) => {
      for (const v of r.path.slice(1, -1)) if (this.network.has(v)) out.push({ vertex: v, rail: ri });
    });
    return out;
  }

  /** A cable line from a grown town up to the snow above it, if there is snow within reach. */
  private liftToSnow(): number {
    if (!this.snow) return 0;
    let laid = 0;
    for (const t of this.towns) {
      if (this.cables.some((c) => c.town === t.id)) continue;
      const houses = this.buildings.filter((b) => b.town === t.id && b.state === undefined).length - 1;
      if (houses < CABLE.at) continue;
      const start = this.streets.find((x) => x.kind === 'square' && x.town === t.id)?.path[0];
      if (start === undefined) continue;
      // Up to the highest snow within reach: a cable goes to the top.
      const f = new Settlements.Frontier(), seen = new Map([[start, 0]]), prev = new Map<number, number>();
      f.push(0, start);
      let top = -1;
      while (f.size) {
        const [d, u] = f.pop();
        if (d > (seen.get(u) ?? Infinity)) continue;
        if (this.snow[u] && (top < 0 || this.heights[u] > this.heights[top])) top = u;
        this.eachNeighbour(u, (w, e) => {
          const nd = d + e;
          if (nd > CABLE.reach || nd >= (seen.get(w) ?? Infinity) || this.wet?.[w]) return;
          seen.set(w, nd); prev.set(w, u); f.push(nd, w);
        });
      }
      if (top < 0) continue; // no snow in reach yet; it may come if the ground is raised
      const path = [top];
      for (let w = top; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
      this.cables.push({ town: t.id, path: path.reverse() });
      laid++;
    }
    return laid;
  }

  /**
   * Where a harbour's fishing boats go: out over the water to grounds a
   * little way off and back, each boat its own ground, all over water.
   */
  fishingRoutes(h: Harbour): number[][] {
    if (!this.wet || h.drowned) return [];
    const count = Math.max(0, Math.min(2, this.boatsAt(h) - 1));
    if (!count) return [];
    // Asked every frame by the boats themselves: worked out again only when the water or the fleet changes.
    const cached = this.fishingCache.get(h);
    if (cached && cached.wet === this.wet && cached.count === count) return cached.routes;
    const routes = this.findFishingRoutes(h, count);
    this.fishingCache.set(h, { wet: this.wet, count, routes });
    return routes;
  }
  private fishingCache = new Map<Harbour, { wet: Uint8Array; count: number; routes: number[][] }>();

  private findFishingRoutes(h: Harbour, count: number): number[][] {
    const start = h.pier[h.pier.length - 1];
    // Every wet vertex within reach, by distance over water.
    const f = new Settlements.Frontier(), dist = new Map([[start, 0]]), prev = new Map<number, number>();
    f.push(0, start);
    while (f.size) {
      const [d, u] = f.pop();
      if (d > (dist.get(u) ?? Infinity)) continue;
      this.eachNeighbour(u, (w, e) => {
        const nd = d + e;
        if (!this.wet![w] || nd > 0.3 || nd >= (dist.get(w) ?? Infinity)) return;
        dist.set(w, nd); prev.set(w, u); f.push(nd, w);
      });
    }
    // Grounds: the farthest reachable water, then the farthest from that ground, and so on.
    const grounds: number[] = [];
    const reachable = [...dist.keys()].sort((a, b) => a - b);
    for (let i = 0; i < count; i++) {
      let best = -1, bestScore = -Infinity;
      for (const v of reachable) {
        const apart = grounds.length ? Math.min(...grounds.map((g) => this.dist(g, v))) : 0;
        const score = dist.get(v)! + 2 * apart;
        if (score > bestScore) { bestScore = score; best = v; }
      }
      if (best < 0 || dist.get(best)! < 0.06) break;
      grounds.push(best);
    }
    return grounds.map((g) => {
      const path = [g];
      for (let w = g; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
      return path.reverse();
    });
  }

  // ------------------------------------------------------------ growth

  /**
   * One house. Streets come first and houses fill the frontage along them:
   * a house goes on the best free plot beside one of its town's streets,
   * facing it. Only when there is no frontage left does the town lay a new
   * street run, towards the cheapest ground, and then build on that.
   */
  private growOne(t: Town): number | null {
    const plot = this.bestFrontage(t);
    if (plot) return this.layHouse(t, plot);
    while (t.frontier.length) {
      const [cost, v] = t.frontier.shift()!;
      if (t.settled.has(v)) continue;
      t.settled.set(v, cost);
      this.expand(t, v, cost);
      if (!this.layRun(t, v)) continue;
      const next = this.bestFrontage(t);
      if (next) return this.layHouse(t, next);
    }
    return null;
  }

  /** A tap on a town: up to `count` houses on the frontage nearest where it landed. */
  private growNear(t: Town, v: number, count: number): number | null {
    let first: number | null = null;
    // Reach past the square: a tap on the square is a tap on the town, and a
    // square's size depends on the mesh, so a fixed reach fell short of it.
    const reach = TOWN.searchRadius + this.squareRadius;
    for (let i = 0; i < count; i++) {
      let plot = this.bestFrontage(t, v, reach);
      if (!plot) {
        // No frontage near the finger: lay a street out towards it first.
        const start = this.nearestWhere(v, reach, (u) => this.runMayStart(u));
        if (start === null || !this.layRun(t, start)) break;
        plot = this.bestFrontage(t, v, reach);
        if (!plot) break;
      }
      const laid = this.layHouse(t, plot);
      first ??= laid;
    }
    return first;
  }

  /**
   * The best free plot beside one of this town's streets: nearest to `near`
   * if given, else cheapest by the town's growth cost, so it grows compactly.
   */
  private bestFrontage(t: Town, near?: number, reach = TOWN.searchRadius): { v: number; front: number } | null {
    let best: { v: number; front: number } | null = null, bestScore = Infinity;
    const halls = new Set(this.towns.map((x) => x.centre));
    for (const [s, town] of this.network) {
      if (town !== t.id || halls.has(s)) continue; // a hall isn't frontage: streets lead out from it
      this.eachNeighbour(s, (w, d) => {
        if (this.network.has(w) || this.buildingAt.has(w)) return;
        const score = near !== undefined ? this.dist(w, near) : (t.settled.get(w) ?? 2 * this.dist(w, t.centre)) + d * 1e-3;
        if (near !== undefined && score > reach) return;
        if (score > bestScore || (score === bestScore && best && w > best.v)) return;
        if (!this.buildable(w) || !this.roomFor(w)) return;
        best = { v: w, front: s };
        bestScore = score;
      });
    }
    return best;
  }

  private layHouse(t: Town, plot: { v: number; front: number }): number {
    this.lay(t, plot.v, plot.front);
    this.growMarket(t);
    return plot.v;
  }

  // ------------------------------------------------------------ square and market

  /** The ground within a square's radius of a hall. */
  private squareOf(hall: number): number[] {
    const out: number[] = [];
    const f = new Settlements.Frontier();
    f.push(0, hall);
    const seen = new Set<number>();
    while (f.size) {
      const [, u] = f.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      if (this.dist(u, hall) > this.squareRadius) continue;
      out.push(u);
      this.eachNeighbour(u, (w) => { if (!seen.has(w)) f.push(this.dist(w, hall), w); });
    }
    return out.sort((a, b) => a - b);
  }

  /** Can a town be founded here: a hall, and a whole square of free, mostly buildable ground round it? */
  private squareFits(hall: number): boolean {
    if (!this.buildable(hall) || !this.roomFor(hall)) return false;
    const ground = this.squareOf(hall);
    let ok = 0;
    for (const u of ground) {
      if (this.network.has(u) || this.buildingAt.has(u) || this.reserved.has(u) || this.wet?.[u]) return false;
      for (const o of this.occupied) if (this.dist(u, o) < this.spacing) return false;
      if (this.buildable(u)) ok++;
    }
    return ok >= SQUARE.buildableShare * ground.length;
  }

  /**
   * Keep the ground round the hall open, and make its edge a street: houses
   * front the square, and the first streets lead out from it.
   */
  private openSquare(t: Town): void {
    const ground = this.squareOf(t.centre);
    const inside = new Set(ground);
    for (const u of ground) this.reserved.set(u, t.id);
    // The edge: ground with a neighbour outside, in order round the hall.
    const edge = ground.filter((u) => {
      let out = false;
      this.eachNeighbour(u, (w) => { if (!inside.has(w)) out = true; });
      return out;
    });
    const angle = this.angleRound(t.centre);
    edge.sort((a, b) => angle(a) - angle(b) || a - b);
    if (edge.length < 3) return;
    this.addStreet({ path: [...edge, edge[0]], town: t.id, kind: 'square' });
  }

  /** Angle of a vertex round `centre`, in the surface's tangent plane there. */
  private angleRound(centre: number): (u: number) => number {
    const p = this.topo.positions, n = this.topo.normals, c = centre * 3;
    const nx = n[c], ny = n[c + 1], nz = n[c + 2];
    const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const dot = ref[0] * nx + ref[1] * ny + ref[2] * nz;
    const ax = ref[0] - dot * nx, ay = ref[1] - dot * ny, az = ref[2] - dot * nz;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    return (u) => {
      const dx = p[u * 3] - p[c], dy = p[u * 3 + 1] - p[c + 1], dz = p[u * 3 + 2] - p[c + 2];
      return Math.atan2(dx * bx + dy * by + dz * bz, dx * ax + dy * ay + dz * az);
    };
  }

  /** Stalls go up in the square as the town grows: append-only, never moved. */
  private growMarket(t: Town): void {
    const houses = t.buildings.length - 1;
    if (houses < MARKET.at) return;
    const want = Math.min(MARKET.most, 1 + Math.floor((houses - MARKET.at) / MARKET.per));
    let have = this.stalls.filter((x) => x.town === t.id).length;
    while (have < want) this.stalls.push({ town: t.id, slot: have++ });
  }



  private runMayStart(v: number): boolean {
    return !this.network.has(v) && !this.buildingAt.has(v) && this.streetMayRun(v, -1);
  }

  /**
   * A new street: from `v` back to the network by the cheapest way, then on
   * outwards from `v` along the contour, keeping straight and keeping clear
   * of other streets so a row of houses fits between. Returns false if it
   * can't be laid, before anything is committed.
   */
  private layRun(t: Town, v: number): boolean {
    if (!this.runMayStart(v)) return false;
    const head = this.route([v], (u) => this.network.get(u) === t.id, STREET.reach, -1, true);
    if (!head) return false;
    const junction = head[head.length - 1];
    const gap = STREET.runGapEdges * this.edge;
    const inRun = new Set(head);
    const clearOfOthers = (w: number) => {
      for (const u of this.network.keys()) {
        if (inRun.has(u)) continue;
        if (this.dist(u, junction) < gap * 1.5) continue; // the street it branched from is close by at first
        if (this.dist(w, u) < gap) return false;
      }
      return true;
    };
    // The street runs both ways along the contour from `v`, and the head is
    // the link that climbs to it. Continuing the link's own direction instead
    // sent streets straight uphill: measured, weighting the climb four times
    // harder moved street climb from 0.82 to 0.81 of the ground's, because
    // the direction was already set before the weight could act.
    const p = this.topo.positions;
    const steps: { w: number; d: number; score: number; dir: number[] }[] = [];
    this.eachNeighbour(v, (w, d) => {
      if (inRun.has(w) || !this.runMayStart(w) || !this.buildable(w) || !clearOfOthers(w)) return;
      const dir = [(p[w * 3] - p[v * 3]) / d, (p[w * 3 + 1] - p[v * 3 + 1]) / d, (p[w * 3 + 2] - p[v * 3 + 2]) / d];
      steps.push({ w, d, dir, score: Math.abs(this.heights[w] - this.heights[v]) / d + w * 1e-9 });
    });
    steps.sort((x, y) => x.score - y.score);
    const first = steps[0];
    const second = first && steps.find((x) => x.dir[0] * first.dir[0] + x.dir[1] * first.dir[1] + x.dir[2] * first.dir[2] < -0.3);
    const arms = [first, second].filter((x): x is (typeof steps)[number] => !!x).map((f) => {
      inRun.add(f.w);
      return this.extend(f.w, v, f.d, inRun, clearOfOthers);
    });
    if (!arms.length) return false;
    const street = [...arms[0].reverse(), v, ...(arms[1] ?? [])];
    // Too short to be a street: a vertex or two of line reads as a stray tick.
    if (this.pathLength(street) < STREET.shortestRun * this.edge) return false;
    // No street is laid that no house could front: refused here, before it
    // exists (whatwesaved PRINCIPLES.md, 3), rather than a town of empty roads.
    if (!this.couldFront(street)) return false;
    this.addStreet({ path: head, town: t.id, kind: 'link' });
    this.addStreet({ path: street, town: t.id, kind: 'street' });
    this.closeLoop(street, t.id);
    return true;
  }

  /** Carry a street on from `tip` (having come from `prev`) along the contour, keeping fairly straight. */
  private extend(tip: number, prev: number, travelled: number, inRun: Set<number>, clear: (w: number) => boolean): number[] {
    const p = this.topo.positions;
    const out = [tip];
    let length = travelled;
    while (length < STREET.runLength) {
      const dx = p[tip * 3] - p[prev * 3], dy = p[tip * 3 + 1] - p[prev * 3 + 1], dz = p[tip * 3 + 2] - p[prev * 3 + 2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      let pick = -1, pickScore = Infinity, pickD = 0;
      this.eachNeighbour(tip, (w, d) => {
        if (inRun.has(w) || !this.runMayStart(w) || !this.buildable(w)) return;
        const cos = ((p[w * 3] - p[tip * 3]) * dx + (p[w * 3 + 1] - p[tip * 3 + 1]) * dy + (p[w * 3 + 2] - p[tip * 3 + 2]) * dz) / (d * dl);
        if (cos < STREET.runStraightness) return;
        // Along the contour first, then straight.
        const score = Math.abs(this.heights[w] - this.heights[tip]) / d / (this.buildableSlope || 1) + 0.25 * (1 - cos) + w * 1e-9;
        if (score < pickScore && clear(w)) { pick = w; pickScore = score; pickD = d; }
      });
      if (pick < 0) break;
      out.push(pick);
      inRun.add(pick);
      prev = tip; tip = pick; length += pickD;
    }
    return out;
  }

  private couldFront(path: number[]): boolean {
    const on = new Set(path);
    for (const s of path.slice(0, -1)) { // not the junction: that frontage belongs to the old street
      let ok = false;
      this.eachNeighbour(s, (w) => {
        if (ok || on.has(w) || this.network.has(w) || this.buildingAt.has(w)) return;
        if (!this.buildable(w)) return;
        for (const u of on) if (this.dist(w, u) < STREET.clearance) return;
        if (this.roomFor(w)) ok = true;
      });
      if (ok) return true;
    }
    return false;
  }

  private nearestWhere(v: number, reach: number, ok: (u: number) => boolean): number | null {
    const f = new Settlements.Frontier();
    f.push(0, v);
    const seen = new Set<number>();
    while (f.size) {
      const [d, u] = f.pop();
      if (seen.has(u) || d > reach) continue;
      seen.add(u);
      if (ok(u)) return u;
      this.eachNeighbour(u, (w, e) => { if (!seen.has(w)) f.push(d + e, w); });
    }
    return null;
  }

  private expand(t: Town, v: number, cost: number): void {
    this.eachNeighbour(v, (w, d) => {
      if (t.settled.has(w) || !this.buildable(w)) return;
      const step = d * (1 + TOWN.slopeCost * this.localSlope(w) / (this.buildableSlope || 1)) + TOWN.heightCost * d * Math.max(0, this.heights[w]);
      insertSorted(t.frontier, [cost + step, w]);
    });
  }

  private lay(t: Town, v: number, front?: number): void {
    this.buildings.push({ vertex: v, town: t.id, order: t.buildings.length, front });
    t.buildings.push(v);
    this.occupied.push(v);
    this.buildingAt.add(v);
    if (front !== undefined && t.rebuild > 0) t.rebuild--;
    if (front !== undefined) this.maybeHarbour(t);
  }

  // ------------------------------------------------------------ harbour

  /**
   * A town on the water gets a harbour once it has grown: a pier from its
   * shore street nearest the square, out into deepening water.
   */
  private maybeHarbour(t: Town): void {
    if (!this.wet || !this.depth || this.harbours.some((h) => h.town === t.id)) return;
    const houses = this.buildings.filter((b) => b.town === t.id && b.state === undefined).length - 1;
    if (houses < HARBOUR.at) return;
    let best = -1, bestD = Infinity;
    for (const [u, town] of this.network) {
      if (town !== t.id || this.bridgeAt.has(u) || this.reserved.has(u)) continue;
      let shore = false;
      this.eachNeighbour(u, (w) => { if (this.wet![w]) shore = true; });
      if (!shore) continue;
      const d = this.dist(u, t.centre) + u * 1e-9;
      if (d < bestD) { bestD = d; best = u; }
    }
    if (best < 0) return;
    // Out over the water, always into deeper water, up to a pier's length.
    const pier = [best];
    let tip = best, length = 0;
    while (length < HARBOUR.pier) {
      let next = -1, nd = -Infinity, step = 0;
      this.eachNeighbour(tip, (w, d) => {
        if (!this.wet![w] || pier.includes(w)) return;
        const deeper = this.depth![w] - (this.wet![tip] ? this.depth![tip] : 0) + w * 1e-9;
        if (deeper > nd) { nd = deeper; next = w; step = d; }
      });
      if (next < 0 || (pier.length > 1 && nd < 0)) break;
      pier.push(next);
      tip = next;
      length += step;
    }
    if (pier.length < 2) return;
    this.harbours.push({ town: t.id, pier });
    this.linkHarbours();
  }

  /**
   * Ferries between harbours on the same water: a way over the water from
   * one pier's end to the other's. Water changes, so a ferry whose way is no
   * longer all water, or whose harbour drowned, is dropped and looked for again.
   */
  private linkHarbours(): void {
    const wet = this.wet;
    if (!wet) return;
    for (let i = this.ferries.length - 1; i >= 0; i--) {
      const f = this.ferries[i];
      if (this.harbours[f.from].drowned || this.harbours[f.to].drowned || f.route.some((v) => !wet[v])) this.ferries.splice(i, 1);
    }
    for (let a = 0; a < this.harbours.length; a++) {
      for (let b = a + 1; b < this.harbours.length; b++) {
        const ha = this.harbours[a], hb = this.harbours[b];
        if (ha.drowned || hb.drowned || ha.town === hb.town) continue;
        if (this.ferries.some((f) => f.from === a && f.to === b)) continue;
        const start = ha.pier[ha.pier.length - 1], end = hb.pier[hb.pier.length - 1];
        const route = this.overWater(start, end, FERRY.reach);
        if (route) this.ferries.push({ from: a, to: b, route });
      }
    }
  }

  /** Shortest way from `a` to `b` over wet vertices only. */
  private overWater(a: number, b: number, reach: number): number[] | null {
    const wet = this.wet!;
    const f = new Settlements.Frontier(), dist = new Map([[a, 0]]), prev = new Map<number, number>();
    f.push(0, a);
    while (f.size) {
      const [d, u] = f.pop();
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (u === b) {
        const path = [b];
        for (let w = b; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
        return path.reverse();
      }
      this.eachNeighbour(u, (w, e) => {
        if (!wet[w]) return;
        const nd = d + e;
        if (nd > reach || nd >= (dist.get(w) ?? Infinity)) return;
        dist.set(w, nd); prev.set(w, u); f.push(nd, w);
      });
    }
    return null;
  }

  /** Boats sailing a ferry: one per ferry, out of its first harbour. */
  sailingFrom(harbour: number): number {
    return this.ferries.filter((f) => f.from === harbour).length;
  }

  /** Boats moored at a harbour: more as its town grows. */
  boatsAt(h: Harbour): number {
    const houses = this.buildings.filter((b) => b.town === h.town && b.state === undefined).length - 1;
    if (h.drowned) return 0;
    const all = Math.min(HARBOUR.boats, Math.floor((houses - HARBOUR.at) / HARBOUR.perBoat) + 1);
    // The ones out on a ferry aren't moored.
    return Math.max(0, all - this.sailingFrom(this.harbours.indexOf(h)));
  }

  /** Boats tied up at the pier: those not out on a ferry or fishing. */
  mooredAt(h: Harbour): number {
    return Math.max(0, this.boatsAt(h) - this.fishingRoutes(h).length);
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
        true,
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
      const path = streetVertices(st);
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
    // What it carries over water is bridge; the rest is street on the ground.
    if (this.wet) for (const u of st.path) if (this.wet[u] || this.stream?.[u]) this.bridgeAt.add(u);
    for (const u of streetVertices(st)) if (!this.network.has(u)) this.network.set(u, st.town);
  }

  // ------------------------------------------------------------ streets

  /** Roads between towns that have both grown, once per pair. */
  private joinTowns(): number {
    let laid = this.joinPorts();
    // Counted in houses, like harbours, so a town's harbour is settled before its roads.
    const houses = (t: Town) => t.buildings.length - 1;
    for (const a of this.towns) {
      if (houses(a) < STREET.roadAt) continue;
      for (const b of this.towns) {
        if (b.id <= a.id || houses(b) < STREET.roadAt) continue;
        const key = `${a.id}-${b.id}`;
        if (this.joined.has(key)) continue;
        this.joined.add(key); // tried once; a road that can't be found isn't retried every frame
        // A road exists to carry what the towns trade, so where a town has a
        // harbour it runs from the harbour (whatwesaved PRINCIPLES.md, 7:
        // where there is a port, the railway runs to the port).
        const portOf = (t: Town) => this.harbours.find((h) => h.town === t.id && !h.drowned)?.pier[0];
        const pa = portOf(a), pb = portOf(b);
        const from = pa !== undefined ? [pa] : [...this.network].filter(([, t]) => t === a.id).map(([u]) => u).sort((x, y) => x - y);
        const everywhere = [...this.network].filter(([, t]) => t === a.id).map(([u]) => u).sort((x, y) => x - y);
        const path =
          this.route(from, (u) => (pb !== undefined ? u === pb : this.network.get(u) === b.id), STREET.roadReach, -1, true) ??
          // No way between the harbours: the towns still get a road.
          (pa !== undefined || pb !== undefined ? this.route(everywhere, (u) => this.network.get(u) === b.id, STREET.roadReach, -1, true) : null);
        if (path) { this.addStreet({ path, town: a.id, kind: 'road', joins: [a.id, b.id], grade: 0 }); laid++; }
      }
    }
    return laid;
  }

  /**
   * A road between every two harbours, once. Roads carry what towns trade, so
   * ports are joined port to port, even where the towns already had a road:
   * a town only becomes a port when its streets reach the water, and that is
   * usually after its first road (measured: the road at 6 houses, harbours
   * at 7 and at 37).
   */
  private joinPorts(): number {
    let laid = 0;
    const live = this.harbours.filter((h) => !h.drowned);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.town === b.town) continue;
        const key = `port ${Math.min(a.town, b.town)}-${Math.max(a.town, b.town)}`;
        if (this.joined.has(key)) continue;
        this.joined.add(key);
        const path = this.route([a.pier[0]], (u) => u === b.pier[0], STREET.roadReach, -1, true);
        if (path) { this.addStreet({ path, town: a.town, kind: 'road', joins: [a.town, b.town], grade: 0 }); laid++; }
      }
    }
    return laid;
  }

  /**
   * Cheapest way over the surface from any of `sources` to a vertex that
   * satisfies `isTarget`: distance, plus climbing. Passes only where a street
   * may run. `own` is the building the route serves, which it may start from.
   */
  private route(sources: number[], isTarget: (u: number, len: number) => boolean, reach: number, own: number, bridging = false): number[] | null {
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
        if (!isTarget(w, len) && (this.network.has(w) || !this.streetMayRun(w, own, bridging))) return;
        const overWater = !!this.wet?.[w] || !!this.stream?.[w];
        const step = overWater
          ? d * BRIDGE.cost // a bridge is level, but dear
          : d * (1 + STREET.climb * Math.abs(this.heights[w] - this.heights[u]) / d / (this.buildableSlope || 1));
        const nc = c + step;
        if (nc < (cost.get(w) ?? Infinity)) {
          cost.set(w, nc); prev.set(w, u); length.set(w, len);
          f.push(nc, w);
        }
      });
    }
    return null;
  }

  private streetMayRun(u: number, own: number, bridging = false): boolean {
    if (this.reserved.has(u)) return false; // not across a square; its edge is already street
    if (this.submerged.has(u)) return false;
    if (this.wet?.[u]) {
      // Over water only as a bridge, and only where the water is narrow.
      if (!bridging || (this.shoreDist?.[u] ?? Infinity) > BRIDGE.span / 2) return false;
    } else if (this.stream?.[u]) {
      // Across a stream only as a bridge; never along one.
      if (!bridging) return false;
    } else if (this.snow?.[u] && !bridging) {
      return false; // town streets stay below the snow; only roads cross it
    } else if (this.localSlope(u) > this.buildableSlope * STREET.steepness) return false;
    for (const o of this.occupied) if (o !== own && this.dist(u, o) < STREET.clearance) return false;
    return true;
  }

  // ------------------------------------------------------------ the ground

  private findSite(v: number): number | null {
    // Nearest ground within reach of the tap where a hall and its whole square fit.
    return this.nearestWhere(v, TOWN.searchRadius, (u) => this.squareFits(u));
  }

  /** The town with a building nearest `v`, if any is within `reach`. */
  private townWithin(v: number, reach: number): Town | null {
    let best: Town | null = null, bd = reach;
    for (const b of this.buildings) {
      const d = this.dist(v, b.vertex);
      if (d < bd) { bd = d; best = this.towns[b.town]; }
    }
    return best;
  }

  private townNear(v: number): Town | null {
    let best: Town | null = null, bd = Math.max(TOWN.joinRadius, this.squareRadius);
    for (const b of this.buildings) {
      const d = this.dist(v, b.vertex);
      if (d < bd) { bd = d; best = this.towns[b.town]; }
    }
    return best;
  }

  private roomFor(v: number): boolean {
    if (this.reserved.has(v)) return false; // a square stays open (its hall was laid before it was reserved)
    if (this.railAt.has(v)) return false; // nor is a house built on the line
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

/** For each wet vertex, the distance over the surface to the nearest dry one; 0 where dry. */
function distanceToDry(topo: Topology, wet: Uint8Array): Float32Array {
  const n = topo.vertexCount, p = topo.positions;
  const out = new Float32Array(n).fill(Infinity);
  const f = new Settlements.Frontier();
  for (let v = 0; v < n; v++) if (!wet[v]) { out[v] = 0; f.push(0, v); }
  while (f.size) {
    const [d, u] = f.pop();
    if (d > out[u]) continue;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (!wet[w]) continue;
      const nd = d + Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]);
      if (nd < out[w]) { out[w] = nd; f.push(nd, w); }
    }
  }
  return out;
}
