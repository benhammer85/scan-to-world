/**
 * Landmarks, as an old map marks them.
 *
 *  - A town's wall, when it is old enough to need one: a toothed line round
 *    its middle, bastioned in a big town, with gatehouses where its ways go
 *    out. Where it stands is fixed the day it is built; when the town has
 *    long outgrown it, it comes down and its course becomes a boulevard,
 *    with trees along it.
 *  - The church on the square, facing east, with its churchyard; a
 *    cathedral and cloister in a city.
 *  - Country houses: a farm made an estate, with its house, its parterre,
 *    an avenue down its drive and a lake.
 *  - The coast: a lighthouse on the headland, salt pans on the flat shore,
 *    fish traps in the shallows, a quay at the harbour.
 *  - The high ground: beacons on the summits, a quarry in the cliff, and a
 *    pilgrims' way up to a shrine.
 *  - Avenues along the made roads between towns.
 *
 * All are drawn from the world as it is; only the walls are a record, since
 * where a wall stood doesn't follow from where the town is now.
 */
import type { Topology } from '../mesh/topology';
import type { Polyline } from '../terrain/contours';
import { hash, type Look, type SquareFrame } from './buildingMarks';
import type { Building, Settlements, Street } from './settlements';
import type { Countryside } from './country';
import { chaikin, dashes, frameAt, maturity, mid, polyline, tree, type Frame, type Turning, type Wash } from './countryMarks';
import { chainSegments } from '../terrain/contours';

type V3 = [number, number, number];

export const WALL = {
  /** A town gets its wall at this many houses, round the old town: its first this-many houses... */
  at: 30,
  old: 30,
  /** ...this far outside them, and never smaller than this. (Round every house near the middle, it took in the snowfield.) */
  margin: 0.022,
  least: 0.09,
  /** Drawn this thick, with teeth this big. */
  thick: 0.004,
  tooth: 0.0045,
  /** It takes this long to build. */
  build: 1.2,
  /** A town this big has bastions. */
  bastions: 55,
  /** It comes down when the town is this big and has this many houses outside it for each one in. (At 80 and 1.5 it stood a fortnight.) */
  outgrown: 160,
  outside: 3,
};

export const CHURCH = { at: 14, cathedral: 60 };
/** A castle on the town's hill at this many houses; a ruin this many days later. */
export const CASTLE = { at: 40, reach: 0.35, ruin: 90 };
/** An abbey, in a quiet valley near a grown town and away from everyone; a ruin in time. */
export const ABBEY = { town: 30, apart: 0.3, reach: 0.9, ruin: 100 };
/** Canals between big towns on gentle ground, with a lock at every such rise. */
export const CANAL = { at: 40, reach: 1.3, lock: 0.02 };
/** Milestones along the roads, inns where roads meet, a cemetery outside the walls. */
export const ROAD = { milestone: 0.07, cemetery: 50 };
export const ESTATE = { at: 20 };
export const COAST = { lighthouse: 12, saltPans: 10, traps: 6, reach: 0.4 };
export const HIGH = { beacon: 0.2, quarry: 12, shrine: 22, reach: 0.7 };

export interface Wall {
  town: number;
  centre: number;
  /** Radius at each of `N` angles round the centre, in its tangent frame. */
  radii: number[];
  born: number;
  gone?: number;
  bastions: boolean;
}

const N = 48;

export interface Site { vertex: number; born: number; town: number }

export class Landmarks {
  readonly walls = new Map<number, Wall>();
  readonly castles = new Map<number, Site>();
  readonly abbeys: Site[] = [];
  readonly canals: { from: number; to: number; path: number[]; born: number }[] = [];

  constructor(private topo: Topology, private st: Settlements, private heights?: Float32Array, private country?: Countryside) {}

  /** Walls go up and come down; castles, abbeys and canals are founded. Returns whether anything was. */
  update(): boolean {
    const st = this.st, p = this.topo.positions;
    let changed = this.found();
    for (const t of st.towns) {
      const n = st.size(t.id), w = this.walls.get(t.id);
      const fr = frameAt(this.topo.normals, t.centre);
      const polar = (v: number) => {
        const d = [p[v * 3] - p[t.centre * 3], p[v * 3 + 1] - p[t.centre * 3 + 1], p[v * 3 + 2] - p[t.centre * 3 + 2]];
        const x = d[0] * fr.ax[0] + d[1] * fr.ax[1] + d[2] * fr.ax[2], y = d[0] * fr.bx[0] + d[1] * fr.bx[1] + d[2] * fr.bx[2];
        return { a: Math.atan2(y, x), r: Math.hypot(x, y) };
      };
      const houses = st.buildings.filter((b) => b.town === t.id && b.state === undefined && !b.farm);
      if (!w && n >= WALL.at) {
        const r = new Array(N).fill(WALL.least);
        for (const b of houses) {
          if (b.order >= WALL.old) continue;
          const q = polar(b.vertex);
          const i = ((Math.round((q.a / (2 * Math.PI)) * N) % N) + N) % N;
          for (const j of [i - 1, i, i + 1]) r[(j + N) % N] = Math.max(r[(j + N) % N], q.r + WALL.margin);
        }
        // Smoothed round, never pulled in past a house.
        const smooth = r.map((_, i) => Math.max(r[i], (r[(i + N - 2) % N] + r[(i + N - 1) % N] + r[i] + r[(i + 1) % N] + r[(i + 2) % N]) / 5));
        this.walls.set(t.id, { town: t.id, centre: t.centre, radii: smooth, born: st.day, bastions: n >= WALL.bastions });
        changed = true;
      } else if (w && w.gone === undefined && n >= WALL.outgrown) {
        let inside = 0, outside = 0;
        for (const b of houses) { const q = polar(b.vertex); if (q.r < radiusAt(w, q.a)) inside++; else outside++; }
        if (outside >= inside * WALL.outside) { w.gone = st.day; changed = true; }
      }
    }
    return changed;
  }

  /** Castles on the hills of old towns, an abbey in a quiet valley, canals between big towns. */
  private found(): boolean {
    const st = this.st, h = this.heights, c = this.country;
    if (!h || !c) return false;
    const p = this.topo.positions, d = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    const { wet, snow } = st.ground;
    let changed = false;
    const reserve = (v: number, r: number) => { for (const u of around(this.topo, v, r)) c.reserved.add(u); c.keepOut(); };
    for (const t of st.towns) {
      if (this.castles.has(t.id) || st.size(t.id) < CASTLE.at) continue;
      // The top of the nearest high ground.
      let best = -1;
      for (const v of around(this.topo, t.centre, CASTLE.reach)) {
        if (wet?.[v] || snow?.[v] || st.isSquare(v)) continue;
        if (best < 0 || h[v] > h[best]) best = v;
      }
      if (best < 0) continue;
      this.castles.set(t.id, { vertex: best, born: st.day, town: t.id });
      reserve(best, 0.02);
      changed = true;
    }
    if (!this.abbeys.length && st.towns.some((t) => st.size(t.id) >= ABBEY.town)) {
      // Low, by water if there is any, away from everyone, and not too far from a town.
      const people = st.buildings.filter((b) => b.state === undefined).map((b) => b.vertex);
      let best = -1, score = Infinity;
      for (const cell of c.land.cells) {
        const v = cell.centre;
        if (!st.buildable(v) || c.townGround[v] || c.claims.has(cell.id)) continue;
        if (people.some((u) => d(u, v) < ABBEY.apart)) continue;
        const town = st.towns.find((t) => st.size(t.id) >= ABBEY.town && d(t.centre, v) < ABBEY.reach);
        if (!town) continue;
        const byWater = around(this.topo, v, 0.1).some((u) => st.ground.stream?.[u] || wet?.[u]);
        const sc = h[v] - (byWater ? 0.2 : 0) + hash(v, 3) * 0.01;
        if (sc < score) { score = sc; best = v; }
      }
      if (best >= 0) {
        const town = st.towns.filter((t) => st.size(t.id) >= ABBEY.town).sort((a, b) => d(a.centre, best) - d(b.centre, best))[0];
        this.abbeys.push({ vertex: best, born: st.day, town: town.id });
        reserve(best, 0.05);
        changed = true;
      }
    }
    for (const a of st.towns) for (const b of st.towns) {
      if (b.id <= a.id || st.size(a.id) < CANAL.at || st.size(b.id) < CANAL.at) continue;
      if (this.canals.some((x) => x.from === a.id && x.to === b.id) || d(a.centre, b.centre) > CANAL.reach) continue;
      const path = level(this.topo, h, a.centre, b.centre, wet, c.townGround);
      this.canals.push({ from: a.id, to: b.id, path: path ?? [], born: st.day });
      changed = true;
    }
    return changed;
  }

  signature(): number {
    let s = this.castles.size * 3 + this.abbeys.length * 5 + this.canals.length * 7;
    for (const x of this.castles.values()) if (this.st.day - x.born > CASTLE.ruin) s += 1;
    for (const x of this.abbeys) if (this.st.day - x.born > ABBEY.ruin) s += 1;
    for (const w of this.walls.values()) s += 1 + (w.gone !== undefined ? 2 : 0) + (this.st.day - w.born >= WALL.build ? 4 : 0);
    return s;
  }
}

function radiusAt(w: Wall, angle: number): number {
  const x = ((((angle / (2 * Math.PI)) % 1) + 1) % 1) * N, i = Math.floor(x) % N, f = x - Math.floor(x);
  return w.radii[i] * (1 - f) + w.radii[(i + 1) % N] * f;
}

export interface LandmarkDrawing {
  lines: Polyline[];
  wash: Wash;
  turning: Turning[];
}

/** Everything above, drawn. */
/** `detail`: the survey's lines, the hachures and the milestones only once the world settles (see `countryMarks`). */
export function landmarkMarks(topo: Topology, heights: Float32Array, st: Settlements, c: Countryside, lm: Landmarks, frames: Map<number, SquareFrame>, look: Look, ways: (st: Street) => Polyline | null, detail = true): LandmarkDrawing {
  const out: LandmarkDrawing = { lines: [], wash: { positions: [], colours: [] }, turning: [] };
  const { wet, depth, snow } = st.ground;
  const near = c.nearPeople();
  const surveyed = (v: number) => near.has(c.land.cellOf[v]);

  walls(topo, st, lm, out, look);
  churches(topo, st, frames, out);
  estates(topo, st, c, look, out);
  if (wet) coast(topo, st, c, wet, depth, out);
  const peaks = summits(topo, heights, surveyed);
  high(topo, heights, st, c, snow, surveyed, out, peaks);
  avenues(st, look, ways, out);
  castles(topo, st, lm, out);
  abbeys(topo, heights, st, lm, out);
  if (detail) roads(topo, st, c, lm, look, ways, out);
  canals(topo, heights, st, lm, out);
  if (detail) {
    survey(topo, st, c, surveyed, out, peaks);
    hachures(topo, heights, st, c, surveyed, out);
  }
  return out;
}

// ------------------------------------------------------------ helpers

/** A point in the tangent plane at `v`, laid on the ground: out from the object's middle to the nearest vertex's height. */
function onGround(topo: Topology, near: number[], q: number[], lift = 0.003): V3 {
  // As high as the highest of the three nearest vertices: the ground between vertices is a
  // triangle among them, never higher than its highest corner. At the nearest one's height,
  // a wall between vertices sank under every bump of the peel and could not be seen.
  const p = topo.positions;
  const best: [number, number][] = [];
  for (const u of near) {
    const dd = (p[u * 3] - q[0]) ** 2 + (p[u * 3 + 1] - q[1]) ** 2 + (p[u * 3 + 2] - q[2]) ** 2;
    if (best.length < 3 || dd < best[2][0]) { best.push([dd, u]); best.sort((a, b) => a[0] - b[0]); if (best.length > 3) best.pop(); }
  }
  const len = Math.hypot(q[0], q[1], q[2]) || 1;
  const r = Math.max(...best.map(([, u]) => Math.hypot(p[u * 3], p[u * 3 + 1], p[u * 3 + 2])));
  return [0, 1, 2].map((k) => (q[k] / len) * (r + lift)) as V3;
}

/** The vertices within `r` of `v` over the surface. */
function around(topo: Topology, v: number, r: number): number[] {
  const p = topo.positions, out = [v], dist = new Map([[v, 0]]);
  for (let i = 0; i < out.length; i++) {
    const u = out[i];
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      const nd = dist.get(u)! + Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]);
      if (nd > r || nd >= (dist.get(w) ?? Infinity)) continue;
      if (!dist.has(w)) out.push(w);
      dist.set(w, nd);
    }
  }
  return out;
}

/** A flat filled rectangle at `c`, `long` along `u` and `short` along `w`. */
function block(c: number[], u: number[], w: number[], long: number, short: number, level = 1): Polyline {
  const at = (i: number, j: number) => [0, 1, 2].map((k) => c[k] + u[k] * long * 0.5 * i + w[k] * short * 0.5 * j);
  const a = at(-1, -1), b = at(1, -1), cc = at(1, 1), dd = at(-1, 1);
  return { ...polyline([a, b, cc, dd], level), closed: true, fill: [...a, ...b, ...cc, ...a, ...cc, ...dd] };
}

function ring(c: number[], fr: Frame, r: number, from = 0, to = 2 * Math.PI, steps = 16, level = 0): Polyline {
  const pts: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([0, 1, 2].map((k) => c[k] + (fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) * r));
  }
  return polyline(pts, level);
}

function add(a: number[], b: number[], s = 1): number[] {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

// ------------------------------------------------------------ walls

function walls(topo: Topology, st: Settlements, lm: Landmarks, out: LandmarkDrawing, look: Look): void {
  const p = topo.positions;
  const { wet, snow, stream } = st.ground;
  // Nothing is built across water or snow: the wall, or the boulevard, stops at its edge.
  const dryAt = (near: number[], q: number[]) => {
    let best = near[0], bd = Infinity;
    for (const u of near) { const dd = (p[u * 3] - q[0]) ** 2 + (p[u * 3 + 1] - q[1]) ** 2 + (p[u * 3 + 2] - q[2]) ** 2; if (dd < bd) { bd = dd; best = u; } }
    return !wet?.[best] && !snow?.[best] && !stream?.[best];
  };
  for (const w of lm.walls.values()) {
    const fr = frameAt(topo.normals, w.centre), c = [p[w.centre * 3], p[w.centre * 3 + 1], p[w.centre * 3 + 2]];
    const maxR = Math.max(...w.radii) + 0.03, near = around(topo, w.centre, maxR);
    const flat = (a: number, r: number) => add(add(c, fr.ax, Math.cos(a) * r), fr.bx, Math.sin(a) * r);
    const S = N * 4, angle = (i: number) => (i / S) * 2 * Math.PI;
    // Where its town's made roads and main streets cross it: gates. Only those: gapped for every
    // lane that crossed it, a wall round a grown town came out as nothing but gaps.
    const gates: number[] = [];
    for (const s of st.streets) {
      if (s.town !== w.town || s.kind === 'square' || look.street(s) < 3) continue;
      for (let i = 1; i < s.path.length; i++) {
        const q0 = polarOf(p, fr, w.centre, s.path[i - 1]), q1 = polarOf(p, fr, w.centre, s.path[i]);
        const in0 = q0.r < radiusAt(w, q0.a), in1 = q1.r < radiusAt(w, q1.a);
        if (in0 !== in1) gates.push(Math.atan2(Math.sin(q0.a) + Math.sin(q1.a), Math.cos(q0.a) + Math.cos(q1.a)));
      }
    }
    const nearGate = (a: number, gap: number) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) * radiusAt(w, a) < gap) || !dryAt(near, flat(a, radiusAt(w, a)));
    const age = st.day - w.born;
    if (w.gone !== undefined) {
      // Its course, now a boulevard: two lines, trees along both sides.
      for (const off of [-0.0042, 0.0042]) {
        let run: number[][] = [];
        for (let i = 0; i <= S; i++) {
          const q = flat(angle(i), radiusAt(w, angle(i)) + off);
          if (dryAt(near, q)) run.push(onGround(topo, near, q));
          else { if (run.length >= 2) out.lines.push(polyline(run, 0)); run = []; }
        }
        if (run.length >= 2) out.lines.push(polyline(run, 0));
      }
      for (let i = 0; i < S; i += 3) {
        const a = angle(i), r = radiusAt(w, a);
        for (const off of [-0.0095, 0.0095]) { const q = flat(a, r + off); if (dryAt(near, q)) out.lines.push(...tree(onGround(topo, near, q), fr, 0.0024, w.centre * 7 + i, false)); }
      }
      continue;
    }
    // Building: its course pegged out, dotted, until it is done.
    const pts = Array.from({ length: S + 1 }, (_, i) => onGround(topo, near, flat(angle(i), radiusAt(w, angle(i)))));
    if (age < WALL.build) {
      let run: number[][] = [];
      for (let i = 0; i <= S; i++) { if (nearGate(angle(i), 0)) { if (run.length >= 2) out.lines.push(...dashes(polyline(run, 1), 0.003, 0.004)); run = []; } else run.push(pts[i]); }
      if (run.length >= 2) out.lines.push(...dashes(polyline(run, 1), 0.003, 0.004));
      continue;
    }
    // The wall: two lines, its thickness, with gaps at the gates...
    for (const off of [0, WALL.thick]) {
      let run: number[][] = [];
      const flush = () => { if (run.length >= 2) out.lines.push(polyline(run, 2)); run = []; };
      for (let i = 0; i <= S; i++) { if (nearGate(angle(i), 0.012)) { flush(); continue; } run.push(off ? onGround(topo, near, flat(angle(i), radiusAt(w, angle(i)) + off)) : pts[i]); }
      flush();
    }
    // ...and its battlements, outward: square teeth, as an old map draws a town wall.
    const outer = (a: number, extra = 0) => onGround(topo, near, flat(a, radiusAt(w, a) + WALL.thick + extra));
    for (let s = 0, i = 0; i < S * 3; i++) {
      const a = (i / (S * 3)) * 2 * Math.PI, r = radiusAt(w, a) + WALL.thick;
      if (nearGate(a, 0.016)) continue;
      const step = WALL.tooth / r;
      if (s++ % 2 || Math.floor(a / step) % 2) continue;
      const a1 = a + step * 0.9;
      out.lines.push(polyline([outer(a), outer(a, WALL.tooth), outer(a1, WALL.tooth), outer(a1)], 2));
      i += Math.max(1, Math.round((step * 2 * S * 3) / (2 * Math.PI))) - 1;
    }
    if (w.bastions) for (let b = 0; b < 7; b++) {
      const a = (b / 7) * 2 * Math.PI + hash(w.centre, 3) * 0.9;
      if (nearGate(a, 0.03)) continue;
      const r = radiusAt(w, a) + WALL.thick, da = 0.024 / r;
      out.lines.push({ ...polyline([onGround(topo, near, flat(a - da, r)), onGround(topo, near, flat(a - da * 0.35, r + 0.014)), onGround(topo, near, flat(a, r + 0.024)), onGround(topo, near, flat(a + da * 0.35, r + 0.014)), onGround(topo, near, flat(a + da, r))], 2) });
    }
    // A gatehouse either side of each way out.
    for (const g of gates) {
      const r = radiusAt(w, g), da = 0.0085 / r;
      for (const s of [-1, 1]) {
        const q = onGround(topo, near, flat(g + s * da, r));
        const u = [0, 1, 2].map((k) => -fr.ax[k] * Math.sin(g) + fr.bx[k] * Math.cos(g)), v = [0, 1, 2].map((k) => fr.ax[k] * Math.cos(g) + fr.bx[k] * Math.sin(g));
        out.lines.push(block(q, u, v, 0.0045, 0.0065));
      }
    }
  }
}

function polarOf(p: Float32Array, fr: Frame, centre: number, v: number): { a: number; r: number } {
  const d = [p[v * 3] - p[centre * 3], p[v * 3 + 1] - p[centre * 3 + 1], p[v * 3 + 2] - p[centre * 3 + 2]];
  const x = d[0] * fr.ax[0] + d[1] * fr.ax[1] + d[2] * fr.ax[2], y = d[0] * fr.bx[0] + d[1] * fr.bx[1] + d[2] * fr.bx[2];
  return { a: Math.atan2(y, x), r: Math.hypot(x, y) };
}

// ------------------------------------------------------------ churches

function churches(topo: Topology, st: Settlements, frames: Map<number, SquareFrame>, out: LandmarkDrawing): void {
  for (const t of st.towns) {
    const n = st.size(t.id), f = frames.get(t.id);
    if (!f || !f.open || n < CHURCH.at || !st.stalls.some((x) => x.town === t.id)) continue;
    const big = n >= CHURCH.cathedral ? 1.25 : 1;
    const a = hash(t.id + 11, 5) * 2 * Math.PI, c = f.at(a, f.radiusAt(a) * 0.8);
    // East is the map's east: a church faces it, as they are built to.
    const fr = frameAt(topo.normals, f.hall), east = fr.ax, north = fr.bx;
    const lift = (q: number[]) => { const up = Math.max(0, f.clearance(q as V3)) + 0.001; return add(q, fr.nr, up); };
    const L = 0.021 * big;
    out.lines.push(block(lift(c), east, north, L, 0.0075 * big)); // nave
    out.lines.push(block(lift(add(c, east, L * 0.18)), north, east, 0.017 * big, 0.0065 * big)); // transept
    out.lines.push(block(lift(add(c, east, -L * 0.55)), east, north, 0.0065 * big, 0.0065 * big)); // tower, at the west end
    if (big > 1) {
      // A cathedral's cloister, to the south: a walk round a garth.
      const q = lift(add(add(c, north, -0.016), east, L * 0.05));
      const sq = (s: number) => { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => add(add(q, east, i * s), north, j * s)); return polyline(pts, 1); };
      out.lines.push(sq(0.0085), sq(0.0045));
    }
    // The churchyard: its graves, little crosses, to the north.
    for (let i = 0; i < 6; i++) {
      const g = lift(add(add(c, north, 0.009 * big + 0.0035 * (i % 2)), east, (Math.floor(i / 2) - 1) * 0.005));
      out.lines.push(polyline([add(g, north, -0.0012), add(g, north, 0.0012)], 0), polyline([add(g, east, -0.0008), add(g, east, 0.0008)], 0));
    }
  }
}

// ------------------------------------------------------------ country houses

function estates(topo: Topology, st: Settlements, c: Countryside, look: Look, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  for (const b of st.farms) {
    if (b.estate === undefined || b.front === undefined) continue;
    const age = st.day - b.estate, v = b.vertex, fr = frameAt(nm, v), o = [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
    const f = [p[b.front * 3], p[b.front * 3 + 1], p[b.front * 3 + 2]];
    const g = [f[0] - o[0], f[1] - o[1], f[2] - o[2]], gn = g[0] * fr.nr[0] + g[1] * fr.nr[1] + g[2] * fr.nr[2];
    const tl = Math.hypot(g[0] - gn * fr.nr[0], g[1] - gn * fr.nr[1], g[2] - gn * fr.nr[2]) || 1;
    const toDrive = [0, 1, 2].map((k) => (g[k] - gn * fr.nr[k]) / tl);
    const side = [fr.nr[1] * toDrive[2] - fr.nr[2] * toDrive[1], fr.nr[2] * toDrive[0] - fr.nr[0] * toDrive[2], fr.nr[0] * toDrive[1] - fr.nr[1] * toDrive[0]];
    const base = add(o, fr.nr, 0.004);
    // The house: a front range, and two wings forward, round a court.
    out.lines.push(block(base, side, toDrive, 0.03, 0.009));
    for (const s of [-1, 1]) out.lines.push(block(add(add(base, side, s * 0.012), toDrive, 0.009), toDrive, side, 0.012, 0.0065));
    if (age < 1) continue;
    // The parterre behind: a square of beds with walks across it.
    const gc = add(base, toDrive, -0.03), h = 0.016;
    const corner = (i: number, j: number) => add(add(gc, side, i * h), toDrive, j * h);
    out.lines.push({ ...polyline([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], 0), closed: true });
    out.lines.push(polyline([corner(-1, 0), corner(1, 0)], 0), polyline([corner(0, -1), corner(0, 1)], 0));
    for (const [i, j] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      out.lines.push(ring(add(add(gc, side, i * h), toDrive, j * h), fr, 0.004, 0, 2 * Math.PI, 10));
    }
    // The avenue: trees both sides of the drive, as far as it goes straight.
    const track = st.streets.find((x) => x.kind === 'track' && x.path[0] === v);
    if (track) {
      let along = 0.02;
      for (let i = 1; i < track.path.length && along < 0.16; i++) {
        const a = track.path[i - 1], bb = track.path[i];
        const seg = [p[bb * 3] - p[a * 3], p[bb * 3 + 1] - p[a * 3 + 1], p[bb * 3 + 2] - p[a * 3 + 2]], L = Math.hypot(seg[0], seg[1], seg[2]) || 1;
        const fa = frameAt(nm, a), across = [fa.nr[1] * seg[2] - fa.nr[2] * seg[1], fa.nr[2] * seg[0] - fa.nr[0] * seg[2], fa.nr[0] * seg[1] - fa.nr[1] * seg[0]].map((x) => x / L);
        for (let s = 0; s < L; s += 0.012) {
          const q = add(add([p[a * 3], p[a * 3 + 1], p[a * 3 + 2]], seg, s / L), fa.nr, 0.003);
          for (const sgn of [-1, 1]) out.lines.push(...tree(add(q, across, sgn * 0.0065) as V3, fa, 0.0022, a * 13 + Math.round(s * 1e3) + sgn, false));
        }
        along += L;
      }
    }
    if (age < 2) continue;
    // And a lake in the park, washed.
    const lc = add(add(base, side, 0.045), toDrive, -0.01), pts: number[][] = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * 2 * Math.PI; pts.push(add(add(lc, side, Math.cos(a) * 0.016), toDrive, Math.sin(a) * 0.009 * (1 + 0.2 * Math.sin(3 * a)))); }
    out.lines.push({ ...polyline(pts, 0), closed: true });
    for (let i = 0; i < 20; i++) {
      out.wash.positions.push(...lc, ...pts[i], ...pts[(i + 1) % 20]);
      out.wash.colours.push(0.55, 0.68, 0.8, 0.55, 0.55, 0.68, 0.8, 0.2, 0.55, 0.68, 0.8, 0.2);
    }
  }
  void c; void look;
}

// ------------------------------------------------------------ the coast

function coast(topo: Topology, st: Settlements, c: Countryside, wet: Uint8Array, depth: Float32Array | null, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  const d = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  const shoreOf = (v: number) => { if (wet[v]) return false; for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (wet[topo.nbrList[k]]) return true; return false; };
  for (const t of st.towns) {
    const n = st.size(t.id);
    if (n < COAST.traps) continue;
    const local = around(topo, t.centre, COAST.reach);
    const shore = local.filter(shoreOf);
    if (!shore.length) continue;
    const harbour = st.harbours.find((h) => h.town === t.id && !h.drowned);
    // A harbour that silted up: its pier stranded, dotted, in marsh, and a bar of sand across the water.
    for (const h of st.harbours.filter((x) => x.town === t.id && x.silted !== undefined)) {
      const pts = h.pier.map((v) => [p[v * 3] + nm[v * 3] * 0.004, p[v * 3 + 1] + nm[v * 3 + 1] * 0.004, p[v * 3 + 2] + nm[v * 3 + 2] * 0.004]);
      out.lines.push(...dashes(polyline(pts, 1), 0.002, 0.002));
      const end = h.pier[h.pier.length - 1], fr = frameAt(nm, end), q = add([p[end * 3], p[end * 3 + 1], p[end * 3 + 2]], fr.nr, 0.003);
      for (let i = 0; i < 5; i++) {
        const a = hash(end + i, 12) * 2 * Math.PI, r = 0.006 + 0.012 * hash(end + i, 13), at = add(add(q, fr.ax, Math.cos(a) * r), fr.bx, Math.sin(a) * r);
        out.lines.push(polyline([add(at, fr.ax, -0.002), add(at, fr.ax, 0.002)], 0), polyline([at, add(at, fr.bx, 0.0028)], 0));
      }
      out.lines.push(...dashes(ring(q, fr, 0.03, -0.9, 0.9, 12, 0), 0.0015, 0.0025));
    }
    // Fish traps: a few V-shaped lines of stakes in the shallows, pointing out to sea.
    const shallows = local.filter((v) => wet[v] && (depth?.[v] ?? 0) < 0.03 && (depth?.[v] ?? 0) > 0.003).sort((a, b) => hash(a, 7) - hash(b, 7)).slice(0, 3);
    for (const v of shallows) {
      const fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.003);
      const a = hash(v, 8) * 2 * Math.PI, u = add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a));
      const w = add(fr.ax.map((x) => x * -Math.sin(a)), fr.bx, Math.cos(a));
      for (const s of [-1, 1]) out.lines.push(...dashes(polyline([q, add(add(q, u, -0.012), w, s * 0.007)], 0), 0.0012, 0.0018));
    }
    // A quay along the shore at the harbour: the water's edge walled, two lines.
    if (harbour) {
      const root = harbour.pier[0], fr = frameAt(nm, root);
      const edge = shore.filter((v) => d(v, root) < 0.06);
      const along = edge.length > 1 ? principal(p, edge, root, fr) : null;
      if (along) {
        const ordered = edge.map((v) => ({ v, s: dot3(sub3(p, v, root), along) })).sort((a, b) => a.s - b.s);
        const line = chaikin(ordered.map(({ v }) => [p[v * 3] + nm[v * 3] * 0.003, p[v * 3 + 1] + nm[v * 3 + 1] * 0.003, p[v * 3 + 2] + nm[v * 3 + 2] * 0.003]));
        out.lines.push(polyline(line, 2));
      }
    }
    // Salt pans on the flat shore: little ruled squares in rows.
    if (n >= COAST.saltPans) {
      const flat = shore.filter((v) => c.steepness(c.land.cellOf[v]) < 0.3 && !c.townGround[v]).sort((a, b) => d(a, t.centre) - d(b, t.centre)).slice(0, 8);
      for (const v of flat) {
        const fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.0025);
        for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const cc = add(add(q, fr.ax, i * 0.0042), fr.bx, j * 0.0042);
          out.lines.push({ ...polyline([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(add(cc, fr.ax, a * 0.0018), fr.bx, b * 0.0018)), 0), closed: true });
        }
      }
    }
    // A lighthouse on the headland: the shore point with most sea round it.
    if (harbour && n >= COAST.lighthouse) {
      let best = -1, score = -1;
      for (const v of shore) {
        const s = around(topo, v, 0.07).filter((u) => wet[u]).length + hash(v, 9) * 0.5;
        if (s > score) { score = s; best = v; }
      }
      if (best >= 0) {
        const fr = frameAt(nm, best), q = add([p[best * 3], p[best * 3 + 1], p[best * 3 + 2]], fr.nr, 0.004);
        out.lines.push({ ...ring(q, fr, 0.0028, 0, 2 * Math.PI, 12, 2), closed: true });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 2 * Math.PI, u = add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a));
          out.lines.push(polyline([add(q, u, 0.0042), add(q, u, i % 2 ? 0.0062 : 0.0078)], 1));
        }
        out.turning.push({ kind: 'beam', at: q as V3, ...fr, size: 0.07 });
      }
    }
  }
}

function sub3(p: Float32Array, a: number, b: number): number[] {
  return [p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]];
}
function dot3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
/** The direction along which a set of points near `root` spreads most, in the tangent plane. */
function principal(p: Float32Array, vs: number[], root: number, fr: Frame): number[] | null {
  let xx = 0, xy = 0, yy = 0;
  for (const v of vs) { const q = sub3(p, v, root), x = dot3(q, fr.ax), y = dot3(q, fr.bx); xx += x * x; xy += x * y; yy += y * y; }
  const a = 0.5 * Math.atan2(2 * xy, xx - yy);
  return add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a));
}

// ------------------------------------------------------------ the high ground

/** Summits: higher than everything within a beacon's reach, where the map has been surveyed. */
function summits(topo: Topology, heights: Float32Array, surveyed: (v: number) => boolean): number[] {
  const peaks: number[] = [];
  for (let v = 0; v < topo.vertexCount; v++) {
    if (!surveyed(v)) continue;
    let top = true;
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1] && top; k++) if (heights[topo.nbrList[k]] >= heights[v]) top = false;
    if (top && around(topo, v, HIGH.beacon).every((u) => u === v || heights[u] < heights[v])) peaks.push(v);
  }
  return peaks;
}

function high(topo: Topology, heights: Float32Array, st: Settlements, c: Countryside, snow: Uint8Array | null, surveyed: (v: number) => boolean, out: LandmarkDrawing, peaks: number[]): void {
  const p = topo.positions, nm = topo.normals;
  const d = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  const shrines = new Set<number>();
  for (const t of st.towns) {
    if (st.size(t.id) < HIGH.shrine) continue;
    const peak = peaks.filter((v) => d(v, t.centre) < HIGH.reach).sort((a, b) => heights[b] - heights[a])[0];
    if (peak === undefined || shrines.has(peak)) continue;
    shrines.add(peak);
    // The pilgrims' way: up from the town by the easiest going, which winds.
    const path = climb(topo, heights, t.centre, peak, st.ground.wet);
    if (path) {
      let pts: number[][] = path.map((v) => [p[v * 3] + nm[v * 3] * 0.0025, p[v * 3 + 1] + nm[v * 3 + 1] * 0.0025, p[v * 3 + 2] + nm[v * 3 + 2] * 0.0025]);
      const skip = pts.findIndex((_, i) => !c.townGround[path[i]]);
      pts = pts.slice(Math.max(0, skip));
      for (let r = 0; r < 3; r++) pts = chaikin(pts);
      if (pts.length > 2) out.lines.push(...dashes(polyline(pts, 0), 0.0014, 0.0035));
    }
    // The shrine: a small cross on the top.
    const fr = frameAt(nm, peak), q = add([p[peak * 3], p[peak * 3 + 1], p[peak * 3 + 2]], fr.nr, 0.004);
    out.lines.push(polyline([add(q, fr.bx, -0.004), add(q, fr.bx, 0.006)], 2), polyline([add(add(q, fr.bx, 0.003), fr.ax, -0.0035), add(add(q, fr.bx, 0.003), fr.ax, 0.0035)], 2));
  }
  // Beacons on the other summits: the survey's triangle, with its point.
  for (const v of peaks) {
    if (shrines.has(v)) continue;
    const fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.004), s = 0.0045;
    const tri = [0, 1, 2].map((i) => { const a = Math.PI / 2 + (i / 3) * 2 * Math.PI; return add(add(q, fr.ax, Math.cos(a) * s), fr.bx, Math.sin(a) * s); });
    out.lines.push({ ...polyline(tri, 1), closed: true }, polyline([add(q, fr.ax, -0.0006), add(q, fr.ax, 0.0006)], 1));
  }
  // A quarry in each grown town's nearest cliff: the face as an arc, hatched down into the pit.
  for (const t of st.towns) {
    if (st.size(t.id) < HIGH.quarry) continue;
    let best = -1, bd = HIGH.reach * 0.7;
    for (const cell of c.land.cells) {
      if (c.steepness(cell.id) < 1.3 || !surveyed(cell.centre) || snow?.[cell.centre]) continue;
      const dd = d(cell.centre, t.centre);
      if (dd < bd) { bd = dd; best = cell.centre; }
    }
    if (best < 0) continue;
    const fr = frameAt(nm, best), q = add([p[best * 3], p[best * 3 + 1], p[best * 3 + 2]], fr.nr, 0.003);
    // Uphill, from the neighbours: the face is on that side.
    const up = [0, 0, 0];
    for (let k = topo.nbrOffsets[best]; k < topo.nbrOffsets[best + 1]; k++) { const u = topo.nbrList[k], dh = heights[u] - heights[best]; for (let j = 0; j < 3; j++) up[j] += (p[u * 3 + j] - p[best * 3 + j]) * dh; }
    const face = Math.atan2(dot3(up, fr.bx), dot3(up, fr.ax)), R = 0.011;
    out.lines.push(ring(q, fr, R, face - 1.4, face + 1.4, 14, 1));
    for (let i = 0; i <= 8; i++) {
      const a = face - 1.3 + (i / 8) * 2.6, u = add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a));
      out.lines.push(polyline([add(q, u, R), add(q, u, R * (i % 2 ? 0.55 : 0.4))], 0));
    }
  }
  // Sheepfolds on the high grazing: a ring of stone with a gap, and the shepherd's hut.
  for (const [cell] of c.claims) {
    if (c.cropOf(cell) !== 'grazing' || hash(cell, 101) > 0.6) continue;
    const v = c.land.cells[cell].centre;
    if (c.townGround[v]) continue;
    const fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.003);
    const a0 = hash(cell, 102) * 2 * Math.PI;
    out.lines.push(ring(q, fr, 0.0055, a0 + 0.5, a0 + 2 * Math.PI - 0.5, 16, 1));
    out.lines.push(block(add(q, fr.ax, 0.0095), fr.ax, fr.bx, 0.0045, 0.0032));
  }
}

/** The easiest way up from `a` to `b`: steep going costs, and costs more the steeper, so it winds. */
function climb(topo: Topology, heights: Float32Array, a: number, b: number, wet: Uint8Array | null): number[] | null {
  const p = topo.positions, cost = new Map([[a, 0]]), prev = new Map<number, number>(), done = new Set<number>();
  const heap: [number, number][] = [[0, a]];
  while (heap.length) {
    let m = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[m][0]) m = i;
    const [cst, u] = heap.splice(m, 1)[0];
    if (done.has(u)) continue;
    done.add(u);
    if (u === b) {
      const path = [b];
      for (let w = b; prev.has(w); ) { w = prev.get(w)!; path.push(w); }
      return path.reverse();
    }
    if (done.size > 6000) return null;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (done.has(w) || wet?.[w]) continue;
      const dd = Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]) || 1e-6;
      const grade = Math.abs(heights[w] - heights[u]) / dd;
      const nc = cst + dd * (1 + 6 * grade * grade);
      if (nc < (cost.get(w) ?? Infinity)) { cost.set(w, nc); prev.set(w, u); heap.push([nc, w]); }
    }
  }
  return null;
}

// ------------------------------------------------------------ avenues

/** Made roads between towns are lined with trees, out in the country (not their ends, in the towns). */
function avenues(st: Settlements, look: Look, ways: (st: Street) => Polyline | null, out: LandmarkDrawing): void {
  for (const s of st.streets) {
    if (s.kind !== 'road' || look.street(s) < 3) continue;
    const m = ways(s);
    if (!m) continue;
    const pts: number[][] = [];
    for (let k = 0; k < m.points.length; k += 3) pts.push([m.points[k], m.points[k + 1], m.points[k + 2]]);
    let along = 0, next = 0.1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      along += L;
      if (along < next || along > m.length - 0.1) continue;
      next = along + 0.02;
      const nr = normal(a), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
      const side = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]];
      const fr: Frame = { nr: nr as V3, ax: t as V3, bx: side as V3 };
      for (const sg of [-1, 1]) out.lines.push(...tree(add(b, side, sg * 0.011) as V3, fr, 0.0024, i * 31 + sg + s.path[0], false));
    }
  }
}

function normal(q: number[]): number[] {
  const l = Math.hypot(q[0], q[1], q[2]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l];
}

export type { Building };

// ------------------------------------------------------------ castles and abbeys

function castles(topo: Topology, st: Settlements, lm: Landmarks, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  for (const k of lm.castles.values()) {
    const ruin = st.day - k.born > CASTLE.ruin, v = k.vertex, fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.004);
    const line = (m: Polyline) => (ruin ? dashes(m, 0.0025, 0.0018) : [m]);
    // The mound, hatched down all round.
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * 2 * Math.PI, u = add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a));
      out.lines.push(polyline([add(q, u, 0.017), add(q, u, 0.023)], 0));
    }
    // The curtain wall, six-sided, with a tower at each corner, and the keep in the middle.
    const corner = (i: number) => { const a = (i / 6) * 2 * Math.PI + 0.3; return add(add(q, fr.ax, Math.cos(a) * 0.013), fr.bx, Math.sin(a) * 0.013); };
    out.lines.push(...line({ ...polyline([0, 1, 2, 3, 4, 5].map(corner), 2), closed: true }));
    for (let i = 0; i < 6; i++) out.lines.push(...line({ ...ring(corner(i), fr, 0.0024, 0, 2 * Math.PI, 10, 2), closed: true }));
    const keep = block(q, fr.ax, fr.bx, 0.007, 0.007, 2);
    out.lines.push(ruin ? { ...keep, fill: undefined } : keep);
  }
}

function abbeys(topo: Topology, heights: Float32Array, st: Settlements, lm: Landmarks, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  for (const k of lm.abbeys) {
    const ruin = st.day - k.born > ABBEY.ruin, v = k.vertex, fr = frameAt(nm, v), q = add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.004);
    const solid = (m: Polyline) => (ruin ? dashes({ ...m, fill: undefined }, 0.002, 0.0015) : [m]);
    const east = fr.ax, north = fr.bx;
    out.lines.push(...solid(block(q, east, north, 0.026, 0.008)), ...solid(block(add(q, east, 0.006), north, east, 0.018, 0.007)));
    // The cloister to the south, and its garth.
    const cq = add(q, north, -0.015);
    for (const sz of [0.009, 0.005]) out.lines.push(...(ruin ? dashes : (m: Polyline) => [m])({ ...polyline([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => add(add(cq, east, i * sz), north, j * sz)), 1), closed: true }, 0.002, 0.0015));
    // Fishponds, downhill, washed (dry, and dotted, once it is a ruin).
    const down = around(topo, v, 0.06).reduce((a, b) => (heights[b] < heights[a] ? b : a), v);
    const dq = add([p[down * 3], p[down * 3 + 1], p[down * 3 + 2]], fr.nr, 0.003);
    for (let i = 0; i < 3; i++) {
      const c = add(dq, east, (i - 1) * 0.011), pond = block(c, east, north, 0.008, 0.005, 0);
      out.lines.push(...(ruin ? dashes({ ...pond, fill: undefined }, 0.0015, 0.002) : [{ ...pond, fill: undefined }]));
      if (!ruin && pond.fill) for (let j = 0; j < pond.fill.length; j += 3) { out.wash.positions.push(pond.fill[j], pond.fill[j + 1], pond.fill[j + 2]); out.wash.colours.push(0.55, 0.68, 0.8, 0.6); }
    }
    // Its grange: the abbey's farm, out along a track.
    const g = add(q, east, 0.05);
    out.lines.push(...solid(block(g, east, north, 0.009, 0.006)));
    out.lines.push(...dashes(polyline([add(q, east, 0.016), add(g, east, -0.006)], 0), 0.002, 0.003));
  }
}

// ------------------------------------------------------------ roads and canals

function roads(topo: Topology, st: Settlements, c: Countryside, lm: Landmarks, look: Look, ways: (s: Street) => Polyline | null, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  const through = new Map<number, number>();
  for (const s of st.streets) for (const v of s.path) through.set(v, (through.get(v) ?? 0) + 1);
  const inns: number[] = [];
  for (const s of st.streets) {
    if (s.kind !== 'road' || look.street(s) < 1) continue;
    const m = ways(s);
    if (m) {
      // Milestones: a small stone, a dot and its tick, every so far, out in the country.
      let along = 0, next = ROAD.milestone;
      for (let k = 3; k < m.points.length; k += 3) {
        const a = m.points.subarray(k - 3, k), b = m.points.subarray(k, k + 3);
        along += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (along < next) continue;
        next += ROAD.milestone;
        if (along > m.length - 0.05) break;
        const nr = normalOf(b), t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(t[0], t[1], t[2]) || 1;
        const side = [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]].map((x) => x / l);
        const q = add([b[0], b[1], b[2]], side, 0.009), fr: Frame = { nr: nr as V3, ax: t.map((x) => x / l) as V3, bx: side as V3 };
        out.lines.push({ ...ring(q, fr, 0.0012, 0, 2 * Math.PI, 8, 1), closed: true }, polyline([add(q, side, 0.0012), add(q, side, 0.0032)], 1));
      }
    }
    // Inns: where a road meets another way, out in the country.
    for (const v of s.path.slice(1, -1)) {
      if ((through.get(v) ?? 0) < 2 || c.townGround[v] && st.buildings.some((b) => b.vertex === v)) continue;
      if (c.townGround[v]) continue;
      if (inns.some((u) => Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 1] - p[v * 3 + 1], p[u * 3 + 2] - p[v * 3 + 2]) < 0.1)) continue;
      inns.push(v);
      const fr = frameAt(nm, v), q = add(add([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]], fr.nr, 0.003), fr.ax, 0.011);
      out.lines.push(block(q, fr.ax, fr.bx, 0.008, 0.0055));
      // Its sign on a post.
      const post = add(q, fr.ax, -0.0065);
      out.lines.push(polyline([post, add(post, fr.bx, 0.005)], 1), block(add(add(post, fr.bx, 0.005), fr.ax, 0.0015), fr.ax, fr.bx, 0.003, 0.002, 1));
    }
  }
  // A cemetery outside the walls of a big town, by a gate: a dotted enclosure, rows of little crosses.
  for (const w of lm.walls.values()) {
    if (st.size(w.town) < ROAD.cemetery) continue;
    const fr = frameAt(nm, w.centre), cp = [p[w.centre * 3], p[w.centre * 3 + 1], p[w.centre * 3 + 2]];
    const a = hash(w.centre, 17) * 2 * Math.PI, r = radiusAt(w, a) + 0.04;
    const near = around(topo, w.centre, r + 0.05);
    const at = onGround(topo, near, add(add(cp, fr.ax, Math.cos(a) * r), fr.bx, Math.sin(a) * r), 0.003);
    const u = add(fr.ax.map((x) => x * Math.cos(a)), fr.bx, Math.sin(a)), v = add(fr.ax.map((x) => x * -Math.sin(a)), fr.bx, Math.cos(a));
    const edge = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => add(add(at, u, i * 0.014), v, j * 0.02));
    out.lines.push(...dashes(polyline(edge, 1), 0.002, 0.0015));
    for (let i = -2; i <= 2; i++) for (let j = -3; j <= 3; j++) {
      const g = add(add(at, u, i * 0.0055), v, j * 0.0055);
      out.lines.push(polyline([add(g, v, -0.0012), add(g, v, 0.0012)], 0), polyline([add(g, u, -0.0008), add(g, u, 0.0008)], 0));
    }
  }
}

/** A canal's way: along the level as far as it can, since every rise is a lock. */
function level(topo: Topology, heights: Float32Array, a: number, b: number, wet: Uint8Array | null, town: Uint8Array): number[] | null {
  const p = topo.positions, cost = new Map([[a, 0]]), prev = new Map<number, number>(), done = new Set<number>();
  const heap: [number, number][] = [[0, a]];
  const push = (c: number, v: number) => { heap.push([c, v]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [c, u] = pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === b) { const path = [b]; for (let w = b; prev.has(w); ) { w = prev.get(w)!; path.push(w); } return path.reverse(); }
    if (done.size > 12000) return null;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (done.has(w) || wet?.[w]) continue;
      const dd = Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]) || 1e-6;
      const nc = c + dd * (1 + 60 * Math.abs(heights[w] - heights[u]) / dd + (town[w] ? 3 : 0));
      if (nc < (cost.get(w) ?? Infinity)) { cost.set(w, nc); prev.set(w, u); push(nc, w); }
    }
  }
  return null;
}

function canals(topo: Topology, heights: Float32Array, st: Settlements, lm: Landmarks, out: LandmarkDrawing): void {
  const p = topo.positions, nm = topo.normals;
  for (const cn of lm.canals) {
    if (cn.path.length < 3) continue;
    let pts = cn.path.map((v) => [p[v * 3] + nm[v * 3] * 0.0032, p[v * 3 + 1] + nm[v * 3 + 1] * 0.0032, p[v * 3 + 2] + nm[v * 3 + 2] * 0.0032]);
    for (let r = 0; r < 2; r++) pts = chaikin(pts);
    // Dug over a day or two: pegged out first.
    const age = st.day - cn.born;
    const side = (i: number) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(t[0], t[1], t[2]) || 1;
      const nr = normalOf(pts[i]);
      return { s: [nr[1] * t[2] - nr[2] * t[1], nr[2] * t[0] - nr[0] * t[2], nr[0] * t[1] - nr[1] * t[0]].map((x) => x / l), t: t.map((x) => x / l) };
    };
    if (age < 1.5) { out.lines.push(...dashes(polyline(pts, 1), 0.003, 0.004)); continue; }
    for (const off of [-0.0022, 0.0022]) out.lines.push(polyline(pts.map((q, i) => add(q, side(i).s, off)), 1));
    out.lines.push(...dashes(polyline(pts.map((q, i) => add(q, side(i).s, 0.0065)), 0), 0.0012, 0.0025)); // the towpath
    // Locks, at every rise: two gates across, and the chevron of the upper gate.
    let since = heights[cn.path[0]];
    for (let j = 1; j < cn.path.length; j++) {
      const hv = heights[cn.path[j]];
      if (Math.abs(hv - since) < CANAL.lock) continue;
      since = hv;
      const i = Math.min(pts.length - 1, Math.round((j / (cn.path.length - 1)) * (pts.length - 1))), { s, t } = side(i), q = pts[i];
      for (const g of [-0.003, 0.003]) out.lines.push(polyline([add(add(q, t, g), s, -0.0035), add(add(q, t, g), s, 0.0035)], 2));
      out.lines.push(polyline([add(add(q, t, 0.003), s, -0.0022), add(q, t, 0.0055), add(add(q, t, 0.003), s, 0.0022)], 2));
    }
  }
}

// ------------------------------------------------------------ the survey, and the map's own age

/**
 * The survey. Summits in sight of each other are joined by the fine straight
 * lines of the triangulation, as a national survey is carried across the
 * land; and the edge of what has been surveyed is marked, finely dotted.
 */
function survey(topo: Topology, st: Settlements, c: Countryside, surveyed: (v: number) => boolean, out: LandmarkDrawing, peaks: number[]): void {
  const p = topo.positions, n = topo.vertexCount;
  const d = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  const done = new Set<string>();
  for (const a of peaks) {
    const nearest = peaks.filter((b) => b !== a && d(a, b) < 0.8).sort((x, y) => d(a, x) - d(a, y)).slice(0, 3);
    for (const b of nearest) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (done.has(key)) continue;
      done.add(key);
      // Straight between them, laid over the ground below.
      const near = [...around(topo, a, d(a, b) * 0.6), ...around(topo, b, d(a, b) * 0.6)];
      const pts: number[][] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, q = [0, 1, 2].map((k) => p[a * 3 + k] * (1 - t) + p[b * 3 + k] * t);
        pts.push(onGround(topo, near, q, 0.0045));
      }
      out.lines.push(...dashes(polyline(pts, 0), 0.004, 0.003));
    }
  }
  // The limit of the survey, where the blank begins.
  const cellOf = c.land.cellOf, t = topo.triangles, flat: number[] = [];
  const inside = (v: number) => surveyed(v) && cellOf[v] >= 0;
  const key = (x: number, y: number) => (x < y ? x * n + y : y * n + x);
  for (let i = 0; i < t.length; i += 3) {
    const vs = [t[i], t[i + 1], t[i + 2]], ins = vs.map(inside);
    if (ins[0] === ins[1] && ins[1] === ins[2]) continue;
    if (vs.some((v) => st.ground.wet?.[v])) continue;
    const e: number[] = [];
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) if (ins[x] !== ins[y]) e.push(key(vs[x], vs[y]));
    flat.push(e[0], e[1]);
  }
  for (const chain of chainSegments(flat)) {
    if (chain.keys.length < 3) continue;
    let pts = chain.keys.map((k) => mid(p, topo.normals, Math.floor(k / n), k % n, 0.0025));
    for (let r = 0; r < 2; r++) pts = chaikin(pts);
    out.lines.push(...dashes(polyline(pts, 0), 0.001, 0.007));
  }
}

/**
 * Hachures: as the map matures, the steep ground is engraved with short
 * strokes down the slope, closer and longer the steeper, as old maps show
 * their hills. A young map hasn't the hand for it yet.
 */
function hachures(topo: Topology, heights: Float32Array, st: Settlements, c: Countryside, surveyed: (v: number) => boolean, out: LandmarkDrawing): void {
  const m = maturity(st.day);
  if (m < 0.3) return;
  const p = topo.positions, nm = topo.normals, b = st.buildableSlope || 1;
  const { wet, snow } = st.ground;
  for (let v = 0; v < topo.vertexCount; v++) {
    if (!surveyed(v) || wet?.[v] || snow?.[v] || c.townGround[v]) continue;
    const s = st.slope[v] / b;
    if (s < 0.7 || hash(v, 111) > 0.5 * m) continue;
    const g = [0, 0, 0];
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) { const u = topo.nbrList[k], dh = heights[u] - heights[v]; for (let j = 0; j < 3; j++) g[j] += (p[u * 3 + j] - p[v * 3 + j]) * dh; }
    const nr = [nm[v * 3], nm[v * 3 + 1], nm[v * 3 + 2]], gn = dot3(g, nr), tg = [g[0] - gn * nr[0], g[1] - gn * nr[1], g[2] - gn * nr[2]], l = Math.hypot(tg[0], tg[1], tg[2]);
    if (l < 1e-9) continue;
    const down = tg.map((x) => -x / l), len = 0.004 + 0.006 * Math.min(1, (s - 0.7) / 1.3);
    const q = [p[v * 3] + nr[0] * 0.003, p[v * 3 + 1] + nr[1] * 0.003, p[v * 3 + 2] + nr[2] * 0.003];
    out.lines.push(polyline([add(q, down, -len / 2), add(q, down, len / 2)], 0));
  }
}

function normalOf(q: ArrayLike<number>): number[] {
  const l = Math.hypot(q[0], q[1], q[2]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l];
}
