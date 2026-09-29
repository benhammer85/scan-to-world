/**
 * The country round the towns: fields, farms and woods.
 *
 * The land is divided once, for the whole object, into a cadastre of field
 * cells (a fixed patchwork, as whatwesaved's `fields()`: "it depends only on
 * the page, never on where anybody has clicked"). Towns and farms claim
 * cells as they grow, nearest and gentlest first; the town builds over the
 * nearest in time and its fields move out. What a field is follows from its
 * ground: arable on the flat, terraces on the steep, meadow by the water,
 * rough grazing high up under the snow.
 *
 * Woods stand on ground too steep to farm and in scattered copses, and are
 * felled as the fields reach them. The map only shows what has been
 * surveyed: the country near somebody, as an old estate map does.
 *
 * A tap is a seed, and the ground says what of: on a field, the field goes
 * back to wood (a planted wood, which is kept: nothing is built there); on
 * a wood, it is felled and opens for fields; on ground too steep to build,
 * a wood is planted. Taps on towns and open ground are the settlements'.
 */
import type { Topology } from '../mesh/topology';
import type { Building, Settlements, Town } from './settlements';
import { hash } from './buildingMarks';

export const FIELD = {
  /** Field cells are about this far apart (world units, object radius = 1). */
  size: 0.11,
  /** Fields a town works, per house. */
  perHouse: 0.3,
  /** And no further from its middle than this. */
  reach: 0.8,
  /** A town's first fields, nearest it, are market gardens. */
  gardens: 2,
  /** Days a field is only hedged before it is ploughed; terraces take longer to build. */
  plough: 0.8,
  terrace: 1.6,
  /** Slope (share of the buildable slope) above which a field is terraced, and above which it can't be worked at all. */
  steep: 0.55,
  tooSteep: 1.5,
  /** A cell with this share of water or snow isn't a field. */
  wet: 0.35,
  /** Ground this near a street or a house is the town's, not a field's; a cell this much the town's is built over. */
  townGround: 0.032,
  built: 0.3,
  /** Share of a town's flat fields that are pasture rather than arable. */
  pasture: 0.35,
  /** Ground this sloped (share of the buildable slope), but not terraced, is where orchards go. */
  orchard: 0.22,
};

export const FARMLAND = {
  /** A farm works up to this many fields, one more every `every` days. */
  fields: 5,
  every: 0.7,
  /** A town this big sends farms out to its far fields, this far from its middle, this far apart. */
  from: 18,
  outlying: 0.34,
  apart: 0.3,
};

export const WOOD = {
  /** Cells steeper than this (share of the buildable slope) are wooded... */
  steep: 0.45,
  /** ...and this share of the rest are copses. */
  copse: 0.16,
  /** A planted wood grows to its full height over this many days. */
  grow: 4,
  /** Only the country this near somebody is on the map. */
  surveyed: 0.55,
};

/**
 * Every town has its common: open grazing by the village, unhedged, with
 * its pond and its gorse. When the town is big it is enclosed, ruled into
 * small square fields, unless somebody has kept it (a tap), and then it is
 * the village green, and in a city a park.
 */
export const COMMON = { enclose: 35, park: 60, least: 0.12 };

/** A wet meadow of a town this big can be drained (a tap): straight ditches, and in time ploughland. */
export const MARSH = { at: 15, dry: 2 };

/** A year, in days (turns of the world): the fields' colour goes round with it. */
export const SEASON = { days: 8 };

export type Crop = 'arable' | 'pasture' | 'meadow' | 'terrace' | 'garden' | 'grazing' | 'orchard' | 'park' | 'drained';

export interface Cell {
  id: number;
  centre: number;
  vertices: number[];
  /** Triangles (index of first corner) wholly in this cell. */
  tris: number[];
  neighbours: number[];
}

export interface Cadastre {
  cellOf: Int32Array;
  cells: Cell[];
}

export interface Claim {
  /** 't<id>' for a town, 'f<vertex>' for a farm. */
  owner: string;
  born: number;
  /** Order among its owner's claims: the first are nearest. */
  rank: number;
}

const cadastres = new WeakMap<Topology, Cadastre>();

/** The object's fixed patchwork of field cells, made once. */
export function cadastre(topo: Topology): Cadastre {
  const had = cadastres.get(topo);
  if (had) return had;
  const n = topo.vertexCount, p = topo.basePositions;
  // Centres: a spread of vertices no two nearer than a field's size, taken
  // in an order that depends only on each vertex, through a coarse grid.
  const order = Array.from({ length: n }, (_, v) => v).sort((a, b) => hash(a, 61) - hash(b, 61) || a - b);
  const cellSize = FIELD.size, grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
  const centres: number[] = [];
  for (const v of order) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 1 && ok; dy++) for (let dz = -1; dz <= 1 && ok; dz++) {
      for (const u of grid.get(key(x + dx * cellSize, y + dy * cellSize, z + dz * cellSize)) ?? []) {
        if (Math.hypot(p[u * 3] - x, p[u * 3 + 1] - y, p[u * 3 + 2] - z) < FIELD.size) { ok = false; break; }
      }
    }
    if (!ok) continue;
    centres.push(v);
    const k = key(x, y, z);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(v);
  }
  // Each vertex to its nearest centre over the surface.
  const cellOf = new Int32Array(n).fill(-1), dist = new Float64Array(n).fill(Infinity);
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  centres.forEach((c, i) => { cellOf[c] = i; dist[c] = 0; push(0, c); });
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      const nd = d + Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]);
      if (nd < dist[w]) { dist[w] = nd; cellOf[w] = cellOf[u]; push(nd, w); }
    }
  }
  const cells: Cell[] = centres.map((c, id) => ({ id, centre: c, vertices: [], tris: [], neighbours: [] }));
  for (let v = 0; v < n; v++) if (cellOf[v] >= 0) cells[cellOf[v]].vertices.push(v);
  const nb = cells.map(() => new Set<number>());
  for (let v = 0; v < n; v++) for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) {
    const a = cellOf[v], b = cellOf[topo.nbrList[k]];
    if (a >= 0 && b >= 0 && a !== b) nb[a].add(b);
  }
  cells.forEach((c, i) => { c.neighbours = [...nb[i]].sort((x, y) => x - y); });
  const t = topo.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const a = cellOf[t[i]];
    if (a >= 0 && a === cellOf[t[i + 1]] && a === cellOf[t[i + 2]]) cells[a].tris.push(i);
  }
  const out = { cellOf, cells };
  cadastres.set(topo, out);
  return out;
}

export type CountryTap = 'spared' | 'felled' | 'planted' | 'kept' | 'drained';

export interface Common {
  cell: number;
  born: number;
  kept?: number;
  enclosed?: number;
}

export class Countryside {
  readonly land: Cadastre;
  /** Field cells worked, and by whom. */
  readonly claims = new Map<number, Claim>();
  /** Woods somebody planted (cell -> day): kept, nothing built there. */
  readonly planted = new Map<number, number>();
  /** Woods somebody felled: open ground from then on. */
  readonly felled = new Set<number>();
  /** Fields the town has built over (cell -> day): the map remembers where their hedges ran. */
  readonly remembered = new Map<number, number>();
  /** Each town's common. */
  readonly commons = new Map<number, Common>();
  /** Meadows drained (cell -> day). */
  readonly drained = new Map<number, number>();
  /** Ground the landmarks keep for themselves (a castle's hill, an abbey's close). */
  reserved = new Set<number>();
  /** Ground that is the town's (streets, houses, squares, and a little round them), as of the last update. */
  townGround: Uint8Array;
  private slopeOf: Float32Array;
  private lastKey = '';

  constructor(private topo: Topology, private st: Settlements, private heights: Float32Array) {
    this.land = cadastre(topo);
    this.townGround = new Uint8Array(topo.vertexCount);
    this.slopeOf = new Float32Array(this.land.cells.length);
    const b = st.buildableSlope || 1;
    for (const c of this.land.cells) {
      let s = 0;
      for (const v of c.vertices) s += st.slope[v];
      this.slopeOf[c.id] = c.vertices.length ? s / c.vertices.length / b : 0;
    }
  }

  heightAt(v: number): number {
    return this.heights[v];
  }

  /** A cell's slope, as a share of the slope a house can stand on. */
  steepness(cell: number): number {
    return this.slopeOf[cell];
  }

  /** Share of a cell under water, stream or snow. */
  private wetShare(cell: number): number {
    const { wet, stream, snow } = this.st.ground;
    const c = this.land.cells[cell];
    let k = 0;
    for (const v of c.vertices) if (wet?.[v] || stream?.[v] || snow?.[v]) k++;
    return c.vertices.length ? k / c.vertices.length : 1;
  }

  private builtShare(cell: number): number {
    const c = this.land.cells[cell];
    let k = 0;
    for (const v of c.vertices) if (this.townGround[v]) k++;
    return c.vertices.length ? k / c.vertices.length : 1;
  }

  /** What a field is, from its ground. */
  cropOf(cell: number): Crop {
    const c = this.land.cells[cell], claim = this.claims.get(cell);
    if (this.drained.has(cell)) return 'drained';
    const { wet, stream, snow } = this.st.ground;
    const nearWater = c.vertices.some((v) => stream?.[v] || wet?.[v]);
    if (nearWater) return 'meadow';
    // High, under the snow: rough grazing, walled.
    let nearSnow = false;
    if (snow) for (const n of c.neighbours) if (this.land.cells[n].vertices.some((v) => snow[v])) { nearSnow = true; break; }
    if (nearSnow) return 'grazing';
    // A country house's fields are its park.
    if (claim?.owner.startsWith('f') && this.st.buildings.some((b) => b.estate !== undefined && `f${b.vertex}` === claim.owner)) return 'park';
    if (this.slopeOf[cell] > FIELD.steep) return 'terrace';
    if (claim && claim.owner.startsWith('t') && claim.rank < FIELD.gardens) return 'garden';
    // Orchards on the gentle slopes, where the frost runs off.
    if (this.slopeOf[cell] > FIELD.orchard && hash(cell, 77) < 0.35) return 'orchard';
    return hash(cell, 71) < FIELD.pasture ? 'pasture' : 'arable';
  }

  /** Is this cell wooded now? */
  isWood(cell: number): boolean {
    if (this.planted.has(cell)) return true;
    for (const c of this.commons.values()) if (c.cell === cell) return false;
    if (this.claims.has(cell) || this.felled.has(cell)) return false;
    if (this.wetShare(cell) > FIELD.wet || this.builtShare(cell) > FIELD.built) return false;
    return this.slopeOf[cell] > WOOD.steep || hash(cell, 73) < WOOD.copse;
  }

  /** How grown a wood is: 1 for the wild, less for one planted lately. */
  woodGrowth(cell: number): number {
    const born = this.planted.get(cell);
    return born === undefined ? 1 : Math.min(1, 0.2 + (this.st.day - born) / WOOD.grow);
  }

  /** Is this cell on the map: near somebody? */
  surveyed(cell: number, near = this.nearPeople()): boolean {
    return near.has(cell);
  }

  /** The cells within survey of any building. */
  nearPeople(): Set<number> {
    const out = new Set<number>(), p = this.topo.positions;
    const people = this.st.buildings.filter((b) => b.state === undefined).map((b) => b.vertex);
    if (!people.length) return out;
    for (const c of this.land.cells) {
      const q = c.centre * 3;
      for (const v of people) {
        if (Math.hypot(p[v * 3] - p[q], p[v * 3 + 1] - p[q + 1], p[v * 3 + 2] - p[q + 2]) < WOOD.surveyed) { out.add(c.id); break; }
      }
    }
    for (const cell of this.planted.keys()) out.add(cell);
    return out;
  }

  /**
   * A tap on the country. On a field: it goes back to wood. On a wood:
   * felled. On ground too steep to build on: a wood planted. Anything else
   * is for the settlements (null).
   */
  tap(v: number): CountryTap | null {
    const cell = this.land.cellOf[v];
    if (cell < 0) return null;
    const { wet, stream, snow } = this.st.ground;
    if (wet?.[v] || stream?.[v] || snow?.[v]) return null;
    const common = [...this.commons.values()].find((x) => x.cell === cell);
    if (common && common.enclosed === undefined && common.kept === undefined) {
      common.kept = this.st.day;
      return 'kept';
    }
    if (this.claims.has(cell)) {
      // A wet meadow of a grown town is drained, not given up.
      const owner = this.claims.get(cell)!.owner;
      if (this.cropOf(cell) === 'meadow' && owner.startsWith('t') && this.st.size(Number(owner.slice(1))) >= MARSH.at) {
        this.drained.set(cell, this.st.day);
        return 'drained';
      }
      this.claims.delete(cell);
      this.plant(cell);
      return 'spared';
    }
    // Only a wood on the map: unsurveyed country has its woods, but nobody can see them to fell
    // them, and a first tap on a new world felled one instead of founding a town.
    if (this.isWood(cell) && !this.townGround[v] && this.nearPeople().has(cell)) {
      this.planted.delete(cell);
      this.felled.add(cell);
      this.keepOut();
      return 'felled';
    }
    if (!this.townGround[v] && !this.st.buildable(v) && this.slopeOf[cell] < FIELD.tooSteep * 2) {
      this.plant(cell);
      return 'planted';
    }
    return null;
  }

  private plant(cell: number): void {
    this.felled.delete(cell);
    this.planted.set(cell, this.st.day);
    this.keepOut();
  }

  /** Planted woods and open commons are kept: the settlements build nothing there. Nor where a landmark stands. */
  keepOut(): void {
    const mask = new Uint8Array(this.topo.vertexCount);
    for (const cell of this.planted.keys()) for (const v of this.land.cells[cell].vertices) mask[v] = 1;
    for (const c of this.commons.values()) if (c.enclosed === undefined) for (const v of this.land.cells[c.cell].vertices) mask[v] = 1;
    for (const v of this.reserved) mask[v] = 1;
    this.st.keepOut = mask;
  }

  /**
   * Bring the country up to date with the towns: the town's ground, fields
   * built over, new fields claimed where towns and farms want them, and
   * farms sent out to the far fields. Returns whether anything changed.
   */
  update(force = false): boolean {
    const st = this.st;
    const key = `${st.buildings.length}|${st.streets.length}|${Math.floor(st.day / 0.1)}|${this.planted.size}|${this.felled.size}|${st.towns.length}`;
    if (!force && key === this.lastKey) return false;
    this.lastKey = key;
    this.townGround = groundOf(this.topo, st);
    let changed = false;
    // Built over: the town has taken it.
    for (const [cell] of [...this.claims]) {
      if (this.builtShare(cell) > FIELD.built || this.wetShare(cell) > FIELD.wet) {
        if (this.builtShare(cell) > FIELD.built) this.remembered.set(cell, st.day);
        this.claims.delete(cell);
        changed = true;
      }
    }
    const owners: { id: string; origin: number; want: number; at: number }[] = [];
    for (const t of st.towns) {
      const houses = st.buildings.filter((b) => b.town === t.id && b.state === undefined && !b.farm).length - 1;
      owners.push({ id: `t${t.id}`, origin: t.centre, want: Math.round(FIELD.perHouse * houses), at: t.centre });
    }
    for (const f of st.farms) {
      const age = st.day - (f.born ?? 0);
      owners.push({ id: `f${f.vertex}`, origin: f.vertex, want: Math.min(FARMLAND.fields, 1 + Math.floor(age / FARMLAND.every)), at: f.vertex });
    }
    if (this.updateCommons()) changed = true;
    // In rounds, a field each, so towns next to each other share the land between them.
    const orders = new Map(owners.map((o) => [o.id, this.claimOrder(o.origin)]));
    for (let round = 0; round < 200; round++) {
      let any = false;
      for (const o of owners) {
        const have = [...this.claims.values()].filter((c) => c.owner === o.id).length;
        if (have >= o.want) continue;
        const next = orders.get(o.id)!.find((cell) => !this.claims.has(cell) && this.claimable(cell));
        if (next === undefined) continue;
        this.claims.set(next, { owner: o.id, born: st.day, rank: have });
        this.felled.delete(next);
        any = changed = true;
      }
      if (!any) break;
    }
    if (this.sendFarms()) changed = true;
    return changed;
  }

  private claimable(cell: number): boolean {
    for (const c of this.commons.values()) if (c.cell === cell && c.enclosed === undefined) return false;
    return !this.planted.has(cell) && this.slopeOf[cell] < FIELD.tooSteep && this.wetShare(cell) <= FIELD.wet && this.builtShare(cell) <= FIELD.built;
  }

  /** Cells in the order an owner at `origin` would take them: nearest first, gentle ground cheaper, woods a little dearer. */
  private claimOrder(origin: number): number[] {
    const cells = this.land.cells, p = this.topo.positions;
    const start = this.land.cellOf[origin];
    const cost = new Map([[start, 0]]), done = new Set<number>(), out: number[] = [];
    const frontier: [number, number][] = [[0, start]];
    while (frontier.length) {
      frontier.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [c, u] = frontier.shift()!;
      if (done.has(u)) continue;
      done.add(u);
      out.push(u);
      for (const w of cells[u].neighbours) {
        if (done.has(w)) continue;
        const a = cells[u].centre * 3, b = cells[w].centre * 3;
        const d = Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]);
        const far = Math.hypot(p[origin * 3] - p[b], p[origin * 3 + 1] - p[b + 1], p[origin * 3 + 2] - p[b + 2]);
        if (far > FIELD.reach) continue;
        const nc = c + d * (1 + 2 * Math.max(0, this.slopeOf[w] - 0.3) + (this.isWood(w) ? 0.4 : 0));
        if (nc < (cost.get(w) ?? Infinity)) { cost.set(w, nc); frontier.push([nc, w]); }
      }
    }
    return out;
  }

  /** Each town's common, found when it is founded; enclosed when the town is big, unless kept. */
  private updateCommons(): boolean {
    const st = this.st, p = this.topo.positions;
    let changed = false;
    for (const t of st.towns) {
      const had = this.commons.get(t.id);
      if (!had) {
        const cell = this.claimOrder(t.centre).find((cell) => {
          const v = this.land.cells[cell].centre;
          const d = Math.hypot(p[v * 3] - p[t.centre * 3], p[v * 3 + 1] - p[t.centre * 3 + 1], p[v * 3 + 2] - p[t.centre * 3 + 2]);
          return d > COMMON.least && !this.claims.has(cell) && this.claimable(cell) && this.slopeOf[cell] < 0.4 && ![...this.commons.values()].some((x) => x.cell === cell);
        });
        if (cell === undefined) continue;
        this.commons.set(t.id, { cell, born: st.day });
        this.keepOut();
        changed = true;
      } else if (had.enclosed === undefined && had.kept === undefined && st.size(t.id) >= COMMON.enclose) {
        had.enclosed = st.day;
        this.claims.set(had.cell, { owner: `t${t.id}`, born: st.day, rank: 99 });
        this.keepOut();
        changed = true;
      }
    }
    return changed;
  }

  /** A grown town sends a farm out to a far field of its with no farm near it. One at a time. */
  private sendFarms(): boolean {
    const st = this.st, p = this.topo.positions;
    const d = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    for (const t of st.towns) {
      if (t.buildings.length < FARMLAND.from) continue;
      const mine = [...this.claims].filter(([, c]) => c.owner === `t${t.id}`).map(([cell]) => cell).sort((a, b) => a - b);
      for (const cell of mine) {
        const v = this.land.cells[cell].centre;
        if (d(v, t.centre) < FARMLAND.outlying) continue;
        if (st.farms.some((f) => d(f.vertex, v) < FARMLAND.apart)) continue;
        if (st.sowFarm(v, t as Town) !== null) return true;
      }
    }
    return false;
  }

  commonTown(c: Common): number {
    for (const [t, x] of this.commons) if (x === c) return t;
    return 0;
  }

  /** Everything the country's look depends on besides the claims, as one number. */
  signature(): number {
    let sig = this.claims.size * 1000;
    for (const c of this.claims.values()) {
      const age = this.st.day - c.born;
      sig += (age >= FIELD.plough ? 1 : 0) + (age >= FIELD.terrace ? 1 : 0);
    }
    for (const cell of this.planted.keys()) sig += Math.round(this.woodGrowth(cell) * 5) * 3;
    sig += this.remembered.size * 7;
    for (const c of this.commons.values()) sig += 11 + (c.kept !== undefined ? 3 : 0) + (c.enclosed !== undefined ? 5 : 0) + (c.kept !== undefined && this.st.size(this.commonTown(c)) >= COMMON.park ? 2 : 0);
    for (const day of this.drained.values()) sig += this.st.day - day >= MARSH.dry ? 13 : 17;
    return sig;
  }
}

/** Ground that is the town's: within `FIELD.townGround` of a street, a house, or a square. */
function groundOf(topo: Topology, st: Settlements): Uint8Array {
  const n = topo.vertexCount, p = topo.positions, out = new Uint8Array(n), dist = new Float64Array(n).fill(Infinity);
  const queue: number[] = [];
  const seed = (v: number) => { if (dist[v] > 0) { dist[v] = 0; queue.push(v); } };
  for (const s of st.streets) for (const v of s.path) seed(v);
  for (const b of st.buildings as Building[]) if (b.state === undefined) seed(b.vertex);
  for (let v = 0; v < n; v++) if (st.isSquare(v)) seed(v);
  // Breadth first is enough: the reach is under two mesh edges.
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    out[u] = 1;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      const nd = dist[u] + Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]);
      if (nd <= FIELD.townGround && nd < dist[w]) { dist[w] = nd; queue.push(w); }
    }
  }
  return out;
}
