/**
 * The country as an old survey draws it, in pen with a light wash:
 * hedgerows with their hedge trees, dry-stone walls dotted on the high
 * grazing, fine parallel lines for the plough, stepped lines where a
 * hillside is terraced, marsh tufts in wet meadows, woods as little
 * shaded tree crowns on stems, and the windmill's cross and the mill's
 * wheel. The washes are hand colour: faint, muted, soft at their edges.
 */
import type { Topology } from '../mesh/topology';
import { chainSegments, type Polyline } from '../terrain/contours';
import { hash } from './buildingMarks';
import type { Settlements } from './settlements';
import { COMMON, FIELD, MARSH, SEASON, type Countryside, type Crop } from './country';

type V3 = [number, number, number];

export const COUNTRY = {
  lift: 0.0022,
  /** Plough lines apart, and a market garden's beds. */
  furrow: 0.0085,
  bed: 0.0055,
  /** Terrace steps, apart over the ground. */
  step: 0.026,
  /** A hedge tree every so often along a hedgerow. */
  hedgeTree: 0.028,
  /** Drains across a drained marsh, this far apart. */
  drain: 0.022,
  /** Enclosure: a common ruled into fields this size. */
  enclosure: 0.02,
  /** Orchard trees this far apart. */
  orchard: 0.011,
  /** Wood: tree crowns, and the share of a wood's vertices that have one. */
  crown: 0.0042,
  trees: 0.6,
  /** A windmill for a town this big. */
  windmillAt: 16,
};

/** Hand colours. Muted: a wash, not paint. */
export const WASH: Record<Crop | 'wood', [number, number, number]> = {
  arable: [1, 1, 1], // coloured by the season instead
  terrace: [1, 1, 1],
  pasture: [0.66, 0.72, 0.5],
  meadow: [0.6, 0.7, 0.64],
  grazing: [0.72, 0.69, 0.55],
  garden: [0.56, 0.66, 0.42],
  orchard: [0.6, 0.68, 0.46],
  park: [0.62, 0.72, 0.52],
  drained: [1, 1, 1],
  wood: [0.44, 0.55, 0.38],
};
export const WASH_ALPHA = 0.5;

/** The ploughland's colour through the year: turned earth, green shoots, ripe, stubble. */
const YEAR: [number, number, number][] = [[0.58, 0.44, 0.33], [0.62, 0.68, 0.4], [0.85, 0.7, 0.36], [0.78, 0.68, 0.5]];

export function seasonColour(day: number): [number, number, number] {
  const t = ((((day / SEASON.days) % 1) + 1) % 1) * YEAR.length, i = Math.floor(t), f = t - i;
  const a = YEAR[i % YEAR.length], b = YEAR[(i + 1) % YEAR.length], e = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
}

export interface Wash {
  /** xyz per corner. */
  positions: number[];
  /** rgba per corner. */
  colours: number[];
}

/** Something that turns: a windmill's sails, a mill's wheel. */
export interface Turning {
  kind: 'sails' | 'wheel' | 'beam';
  at: V3;
  nr: V3;
  ax: V3;
  bx: V3;
  size: number;
}

export interface CountryDrawing {
  lines: Polyline[];
  /** Washes that keep their colour, the ploughland's, whose colour is the season's, and the wet meadows', which flood in spring. */
  wash: Wash;
  seasonal: Wash;
  meadow: Wash;
  turning: Turning[];
}

/** How much the map has matured: a young world's map is drawn sparely, an old one's richly. */
export const MAP = { mature: 40 };
export function maturity(day: number): number {
  return Math.min(1, day / MAP.mature);
}

/** How wet the spring is: the meadows flood, most at the turn from winter to spring. */
export function springFlood(day: number): number {
  const t = ((((day / SEASON.days) % 1) + 1) % 1);
  return Math.max(0, Math.cos((t - 0.2) * 2 * Math.PI * 1.6)) * (t < 0.5 ? 1 : 0);
}

/** How deep in winter: 1 at midwinter, 0 from spring to autumn. */
export function winter(day: number): number {
  const t = ((((day / SEASON.days) % 1) + 1) % 1);
  return Math.max(0, Math.cos(t * 2 * Math.PI));
}

/**
 * `detail`: the fine work (hedge trees, the ghosts of old hedges, gorse,
 * marsh tufts) is left out while the world is turning, and drawn once it
 * settles, when the pen inks: it is most of the strokes and the least of
 * what a turning map needs.
 */
/**
 * The country, seen from very high up: no field is outlined (no hedges, walls or
 * enclosure grids, which showed the fixed field cells as a pattern), nothing is
 * built (no mills), and no single tree stands out (orchards, parkland).
 * Farmland is its rows and washes, woods their trees in clumps, commons a wash.
 */
export function countryMarks(topo: Topology, st: Settlements, c: Countryside, detail = true): CountryDrawing {
  const out: CountryDrawing = { lines: [], wash: { positions: [], colours: [] }, seasonal: { positions: [], colours: [] }, meadow: { positions: [], colours: [] }, turning: [] };
  const rich = 0.7 + 0.3 * maturity(st.day);
  const { cells, cellOf } = c.land;
  const n = topo.vertexCount, p = topo.positions, nm = topo.normals;
  const { wet, stream, snow } = st.ground;
  const water = (v: number) => !!(wet?.[v] || stream?.[v] || snow?.[v]);
  const open = (v: number) => !water(v) && !c.townGround[v];

  // Which field each vertex is in: its cell if that is worked, else none.
  const label = new Int32Array(n).fill(-1);
  for (const [cell] of c.claims) for (const v of cells[cell].vertices) if (open(v)) label[v] = cell;
  const crops = new Map([...c.claims.keys()].map((cell) => [cell, c.cropOf(cell)]));

  const t = topo.triangles;

  // ---- inside the fields, and their washes
  const season = seasonColour(st.day);
  void season;
  const turning: Turning[] = [];
  for (const [cell, claim] of c.claims) {
    const crop = crops.get(cell)!, age = st.day - claim.born;
    const inside = cells[cell].tris.filter((i) => label[t[i]] === cell && label[t[i + 1]] === cell && label[t[i + 2]] === cell);
    const edge = (v: number) => { for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (label[topo.nbrList[k]] !== cell) return true; return false; };
    const drying = crop === 'drained' && age < MARSH.dry;
    const tint = drying ? WASH.meadow : WASH[crop], seasonal = crop === 'arable' || crop === 'terrace' || (crop === 'drained' && !drying);
    const vary = 0.88 + 0.12 * hash(cell, 85);
    const into = seasonal ? out.seasonal : crop === 'meadow' || drying ? out.meadow : out.wash;
    for (const i of inside) for (const v of [t[i], t[i + 1], t[i + 2]]) {
      into.positions.push(...lifted(p, nm, v, COUNTRY.lift * 0.6));
      into.colours.push(tint[0] * vary, tint[1] * vary, tint[2] * vary, edge(v) ? 0 : WASH_ALPHA * rich);
    }
    const c0 = cells[cell].centre, fr = frameAt(nm, c0);
    if (crop === 'arable' && age >= FIELD.plough) {
      const a = hash(cell, 87) * Math.PI, dir: V3 = [0, 1, 2].map((k) => fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) as V3;
      out.lines.push(...isoLines(topo, inside, (v) => p[v * 3] * dir[0] + p[v * 3 + 1] * dir[1] + p[v * 3 + 2] * dir[2], COUNTRY.furrow, COUNTRY.lift));
    } else if (crop === 'garden' && age >= FIELD.plough) {
      // Beds, and every other strip of them dug the other way.
      const a = hash(cell, 89) * Math.PI;
      const u: V3 = [0, 1, 2].map((k) => fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) as V3;
      const w: V3 = [0, 1, 2].map((k) => -fr.ax[k] * Math.sin(a) + fr.bx[k] * Math.cos(a)) as V3;
      const along = (v: number) => p[v * 3] * u[0] + p[v * 3 + 1] * u[1] + p[v * 3 + 2] * u[2];
      const across = (v: number) => p[v * 3] * w[0] + p[v * 3 + 1] * w[1] + p[v * 3 + 2] * w[2];
      const strip = (i: number) => Math.floor(along(t[i]) / 0.03) % 2 === 0;
      out.lines.push(...isoLines(topo, inside.filter(strip), across, COUNTRY.bed, COUNTRY.lift));
      out.lines.push(...isoLines(topo, inside.filter((i) => !strip(i)), along, COUNTRY.bed, COUNTRY.lift));
    } else if (crop === 'terrace' && age >= FIELD.terrace) {
      // Level steps: the ground's own contours, close together.
      const h = st.slope, grade = Math.max(1e-4, cells[cell].vertices.reduce((s, v) => s + h[v], 0) / cells[cell].vertices.length);
      out.lines.push(...isoLines(topo, inside, (v) => c.heightAt(v), grade * COUNTRY.step, COUNTRY.lift));
    } else if (crop === 'drained') {
      // Ruler-straight drains across it, the way a fen is drained, and one main drain the other way.
      const since = st.day - (c.drained.get(cell) ?? st.day);
      const a = hash(cell, 97) * Math.PI;
      const u: V3 = [0, 1, 2].map((k) => fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) as V3;
      const w: V3 = [0, 1, 2].map((k) => -fr.ax[k] * Math.sin(a) + fr.bx[k] * Math.cos(a)) as V3;
      out.lines.push(...isoLines(topo, inside, (v) => p[v * 3] * u[0] + p[v * 3 + 1] * u[1] + p[v * 3 + 2] * u[2], COUNTRY.drain, COUNTRY.lift));
      const main = isoLines(topo, inside, (v) => p[v * 3] * w[0] + p[v * 3 + 1] * w[1] + p[v * 3 + 2] * w[2], 1, COUNTRY.lift);
      out.lines.push(...main.slice(0, 1));
      if (since < MARSH.dry) for (const v of cells[cell].vertices) if (label[v] === cell && !edge(v) && hash(v, 91) < 0.15) out.lines.push(...tuft(lifted(p, nm, v, COUNTRY.lift) as V3, frameAt(nm, v), v));
    } else if (crop === 'meadow' && age >= FIELD.plough && detail) {
      for (const v of cells[cell].vertices) if (label[v] === cell && !edge(v) && hash(v, 91) < 0.35) out.lines.push(...tuft(lifted(p, nm, v, COUNTRY.lift) as V3, frameAt(nm, v), v));
    }
  }

  // ---- commons: open, kept as a green (a park in a city), or enclosed into ruled fields
  for (const [town, common] of c.commons) {
    const cell = common.cell, own = (v: number) => cellOf[v] === cell && open(v);
    const inside = cells[cell].tris.filter((i) => own(t[i]) && own(t[i + 1]) && own(t[i + 2]));
    const fr = frameAt(nm, cells[cell].centre);
    if (common.enclosed !== undefined) continue; // enclosed, it is fields like any other
    // Open: a wash of heath, gorse here and there, and the pond at its lowest.
    const edge = (v: number) => { for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (!own(topo.nbrList[k])) return true; return false; };
    for (const i of inside) for (const v of [t[i], t[i + 1], t[i + 2]]) {
      out.wash.positions.push(...lifted(p, nm, v, COUNTRY.lift * 0.6));
      out.wash.colours.push(0.7, 0.72, 0.52, edge(v) ? 0 : WASH_ALPHA * 0.8 * rich);
    }
    const vs = cells[cell].vertices.filter(own);
    if (!vs.length) continue;
    const kept = common.kept !== undefined, park = kept && st.size(town) >= COMMON.park;
    for (const v of vs) {
      if (edge(v)) continue;
      if (detail && !park && hash(v, 103) < 0.3) out.lines.push(...gorse(lifted(p, nm, v, COUNTRY.lift) as V3, frameAt(nm, v), v));
    }
    const low = vs.reduce((a, b) => (c.heightAt(b) < c.heightAt(a) ? b : a), vs[0]);
    const pond = lifted(p, nm, low, COUNTRY.lift), pf = frameAt(nm, low), r = park ? 0.012 : 0.0065, ring: number[][] = [];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 2 * Math.PI; ring.push([0, 1, 2].map((k) => pond[k] + (pf.ax[k] * Math.cos(a) * 1.3 + pf.bx[k] * Math.sin(a) * (1 + 0.15 * Math.sin(3 * a))) * r)); }
    out.lines.push({ ...polyline(ring, 0), closed: true });
    for (let i = 0; i < 18; i++) { out.wash.positions.push(...pond, ...ring[i], ...ring[(i + 1) % 18]); out.wash.colours.push(0.55, 0.68, 0.8, 0.6, 0.55, 0.68, 0.8, 0.3, 0.55, 0.68, 0.8, 0.3); }
    if (park) {
      // A park's walks: winding, dotted, across it.
      const a = hash(cell, 107) * Math.PI;
      const u: V3 = [0, 1, 2].map((k) => fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) as V3;
      const w: V3 = [0, 1, 2].map((k) => -fr.ax[k] * Math.sin(a) + fr.bx[k] * Math.cos(a)) as V3;
      const cc = p.subarray(cells[cell].centre * 3, cells[cell].centre * 3 + 3);
      for (const off of [-0.02, 0.02]) {
        const walk = (v: number) => {
          const x = p[v * 3] * u[0] + p[v * 3 + 1] * u[1] + p[v * 3 + 2] * u[2] - (cc[0] * u[0] + cc[1] * u[1] + cc[2] * u[2]);
          const y = p[v * 3] * w[0] + p[v * 3 + 1] * w[1] + p[v * 3 + 2] * w[2] - (cc[0] * w[0] + cc[1] * w[1] + cc[2] * w[2]);
          return y + 0.012 * Math.sin(x / 0.02) - off + 50; // the one level at 50: a single winding walk
        };
        for (const m of isoLines(topo, inside, walk, 50, COUNTRY.lift)) out.lines.push(...dashes(m, 0.002, 0.003));
      }
    }
  }

  // ---- woods, where the map has been surveyed
  const near = c.nearPeople();
  for (const cell of near) {
    if (!c.isWood(cell)) continue;
    const g = c.woodGrowth(cell);
    const own = (v: number) => cellOf[v] === cell && open(v);
    for (const i of cells[cell].tris) {
      if (!own(t[i]) || !own(t[i + 1]) || !own(t[i + 2])) continue;
      for (const v of [t[i], t[i + 1], t[i + 2]]) {
        let edge = false;
        for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (!own(topo.nbrList[k])) edge = true;
        out.wash.positions.push(...lifted(p, nm, v, COUNTRY.lift * 0.6));
        const tint = WASH.wood;
        out.wash.colours.push(tint[0], tint[1], tint[2], edge ? 0 : WASH_ALPHA * (0.5 + 0.5 * g));
      }
    }
    for (const v of cells[cell].vertices) {
      if (!own(v)) continue;
      // Woods as a small-scale map draws them: clumps of trees with clearings between, not
      // one tree to every vertex, which spread evenly over the country and read as the mesh.
      // Where the wood is thick, two or three trees stand together, scattered off the vertex.
      const thick = clump(p, v);
      const count = hash(v, 51) < COUNTRY.trees * thick ? (thick > 0.7 ? 2 + (hash(v, 55) < 0.4 ? 1 : 0) : 1) : 0;
      for (let k2 = 0; k2 < count; k2++) {
        const fr = frameAt(nm, v), j = 0.036;
        const at = [0, 1, 2].map((k) => p[v * 3 + k] + fr.ax[k] * (hash(v, 52 + k2 * 7) - 0.5) * j + fr.bx[k] * (hash(v, 53 + k2 * 7) - 0.5) * j + nm[v * 3 + k] * COUNTRY.lift) as V3;
        out.lines.push(...tree(at, fr, COUNTRY.crown * (0.6 + 0.5 * hash(v, 54 + k2)) * (0.35 + 0.65 * g), v * 3 + k2));
      }
    }
  }

  out.turning = turning;
  return out;
}

/** The turning parts as they are at `seconds`: sails round slowly, the wheel a little faster. */
export function turningMarks(turning: Turning[], seconds: number): Polyline[] {
  const out: Polyline[] = [];
  for (const w of turning) {
    const spin = seconds * (w.kind === 'sails' ? 0.5 : w.kind === 'beam' ? 0.7 : 0.9) + hash(Math.round(w.at[0] * 1e4), 95) * 6.283;
    if (w.kind === 'beam') {
      // A lighthouse's light, going round: a dotted ray out over the water.
      const ca = Math.cos(spin), sa = Math.sin(spin);
      for (let d = 0.008; d < w.size; d += 0.007) {
        const q = [0, 1, 2].map((k) => w.at[k] + (w.ax[k] * ca + w.bx[k] * sa) * d), r = [0, 1, 2].map((k) => w.at[k] + (w.ax[k] * ca + w.bx[k] * sa) * (d + 0.003));
        out.push(polyline([q, r], 2));
      }
      continue;
    }
    const arms = w.kind === 'sails' ? 4 : 6;
    for (let i = 0; i < arms; i++) {
      const a = spin + (i / arms) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      const tip = [0, 1, 2].map((k) => w.at[k] + (w.ax[k] * ca + w.bx[k] * sa) * w.size);
      if (w.kind === 'sails') {
        // A sail: its stock, and the cloth down one side of it.
        const side = [0, 1, 2].map((k) => (-w.ax[k] * sa + w.bx[k] * ca) * w.size * 0.22);
        const root = [0, 1, 2].map((k) => w.at[k] + (w.ax[k] * ca + w.bx[k] * sa) * w.size * 0.3);
        out.push(polyline([w.at, tip], 2), polyline([root, root.map((x, k) => x + side[k]), tip.map((x, k) => x + side[k]), tip], 2));
      } else out.push(polyline([w.at, tip], 2));
    }
  }
  return out;
}

// ------------------------------------------------------------ symbols

/** How thick the wood is here: a smooth, fixed pattern over the ground, 0 (a clearing) to 1. */
function clump(p: Float32Array, v: number): number {
  const k = 1 / 0.09, x = p[v * 3] * k, y = p[v * 3 + 1] * k, z = p[v * 3 + 2] * k;
  const n = (Math.sin(x * 1.1 + y * 0.5 + 0.3) + Math.sin(y * 1.3 - z * 0.6 + 2.2) + Math.sin(z * 0.9 + x * 0.8 - 1.1)) / 6 + 0.5;
  return Math.max(0, Math.min(1, (n - 0.35) / 0.4));
}

/**
 * A tree, as an old map draws one: a round crown, shaded down one side
 * with a second stroke, on a short stem.
 */
export function tree(at: V3, fr: Frame, r: number, seed: number, shaded = true): Polyline[] {
  if (r < 0.0012) return [];
  const pts: number[][] = [];
  const bumps = 5 + Math.floor(hash(seed, 97) * 3), phase = hash(seed, 98) * 6.283;
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * 2 * Math.PI;
    const rr = r * (1 + 0.12 * Math.sin(a * bumps + phase));
    pts.push([0, 1, 2].map((k) => at[k] + (fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) * rr + fr.bx[k] * r));
  }
  const shade: number[][] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -0.9 + (i / 6) * 1.5;
    shade.push([0, 1, 2].map((k) => at[k] + (fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) * r * 0.72 + fr.bx[k] * r));
  }
  const stem = [at, [0, 1, 2].map((k) => at[k] - fr.bx[k] * r * 0.55)];
  if (!shaded) return [{ ...polyline(pts, 0), closed: true }];
  return [{ ...polyline(pts, 0), closed: true }, polyline(shade, 0), polyline(stem, 0)];
}

/** Gorse on a common: a little spray of short strokes. */
function gorse(at: V3, fr: Frame, seed: number): Polyline[] {
  const out: Polyline[] = [], s = 0.0028 * (0.8 + 0.4 * hash(seed, 104));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + hash(seed, 106) * 0.8;
    out.push(polyline([[0, 1, 2].map((k) => at[k] - (fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) * s), [0, 1, 2].map((k) => at[k] + (fr.ax[k] * Math.cos(a) + fr.bx[k] * Math.sin(a)) * s)], 0));
  }
  return out;
}

/** A marsh tuft: a short ground stroke, and three blades rising from it. */
function tuft(at: V3, fr: Frame, seed: number): Polyline[] {
  const s = 0.0032 * (0.8 + 0.4 * hash(seed, 99));
  const base = (x: number) => [0, 1, 2].map((k) => at[k] + fr.ax[k] * x);
  const out = [polyline([base(-s * 1.2), base(s * 1.2)], 0)];
  for (const [x, lean] of [[-0.6, -0.5], [0, 0], [0.6, 0.5]]) {
    const b = base(x * s);
    out.push(polyline([b, [0, 1, 2].map((k) => b[k] + fr.bx[k] * s * (x === 0 ? 1.3 : 1) + fr.ax[k] * lean * s)], 0));
  }
  return out;
}

/**
 * Iso-lines of `f` over just these triangles, `every` apart: parallel
 * plough lines when `f` is a direction, terrace steps when it is height.
 * Only the field's own triangles, so the lines stop short of the hedge,
 * as a headland does.
 */
export function isoLines(topo: Topology, tris: number[], f: (v: number) => number, every: number, lift: number): Polyline[] {
  const t = topo.triangles, n = topo.vertexCount, p = topo.positions, nm = topo.normals;
  const val = new Map<number, number>();
  const F = (v: number) => { let x = val.get(v); if (x === undefined) { x = f(v); val.set(v, x); } return x; };
  const byLevel = new Map<number, number[]>();
  for (const i of tris) {
    const vs = [t[i], t[i + 1], t[i + 2]], fs = vs.map(F);
    const k0 = Math.ceil(Math.min(...fs) / every), k1 = Math.floor(Math.max(...fs) / every);
    for (let k = k0; k <= k1; k++) {
      const iso = k * every, up = fs.map((x) => x >= iso), e: number[] = [];
      for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) if (up[x] !== up[y]) e.push(vs[x] < vs[y] ? vs[x] * n + vs[y] : vs[y] * n + vs[x]);
      if (e.length === 2) (byLevel.get(k) ?? byLevel.set(k, []).get(k)!).push(e[0], e[1]);
    }
  }
  const out: Polyline[] = [];
  for (const [k, flat] of byLevel) {
    const iso = k * every;
    for (const chain of chainSegments(flat)) {
      if (chain.keys.length < 2) continue;
      const pts = chain.keys.map((key) => {
        const a = Math.floor(key / n), b = key - a * n, fa = F(a), fb = F(b), s = (iso - fa) / (fb - fa || 1);
        return [0, 1, 2].map((j) => p[a * 3 + j] + (p[b * 3 + j] - p[a * 3 + j]) * s + (nm[a * 3 + j] + (nm[b * 3 + j] - nm[a * 3 + j]) * s) * lift);
      });
      if (chain.closed) pts.push(pts[0]);
      const m = polyline(pts, 0);
      if (m.length > 0.006) out.push(m);
    }
  }
  return out;
}

// ------------------------------------------------------------ geometry

export interface Frame { nr: V3; ax: V3; bx: V3 }

/**
 * A tangent frame at a vertex, with `bx` towards the map's north (the
 * object's +y), so every tree stands upright on the sheet, as an old map's do.
 */
export function frameAt(nm: Float32Array, v: number): Frame {
  const nr: V3 = [nm[v * 3], nm[v * 3 + 1], nm[v * 3 + 2]];
  const up: V3 = Math.abs(nr[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1];
  const d = up[0] * nr[0] + up[1] * nr[1] + up[2] * nr[2];
  const b = normalised([up[0] - d * nr[0], up[1] - d * nr[1], up[2] - d * nr[2]]);
  const a: V3 = [b[1] * nr[2] - b[2] * nr[1], b[2] * nr[0] - b[0] * nr[2], b[0] * nr[1] - b[1] * nr[0]];
  return { nr, ax: a, bx: b };
}

function normalised(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function lifted(p: Float32Array, nm: Float32Array, v: number, lift: number): number[] {
  return [p[v * 3] + nm[v * 3] * lift, p[v * 3 + 1] + nm[v * 3 + 1] * lift, p[v * 3 + 2] + nm[v * 3 + 2] * lift];
}

export function mid(p: Float32Array, nm: Float32Array, a: number, b: number, lift: number): number[] {
  return [0, 1, 2].map((k) => (p[a * 3 + k] + p[b * 3 + k]) / 2 + ((nm[a * 3 + k] + nm[b * 3 + k]) / 2) * lift);
}

function dist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function polyline(pts: number[][], level: number): Polyline {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += dist(pts[i], pts[i - 1]);
  return { level, iso: 0, points: new Float32Array(pts.flat()), closed: false, length };
}

export function chaikin(pts: number[][]): number[][] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a.map((x, k) => 0.75 * x + 0.25 * b[k]), a.map((x, k) => 0.25 * x + 0.75 * b[k]));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function dashes(m: Polyline, on: number, off: number): Polyline[] {
  const pts: number[][] = [];
  for (let k = 0; k < m.points.length; k += 3) pts.push([m.points[k], m.points[k + 1], m.points[k + 2]]);
  const out: Polyline[] = [];
  let drawing = true, left = on, run: number[][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = dist(a, b);
    while (d > left) {
      const s = left / d, c = a.map((x, k) => x + (b[k] - x) * s);
      if (drawing) { run.push(c); if (run.length >= 2) out.push(polyline(run, m.level)); run = []; } else run = [c];
      drawing = !drawing; d -= left; a = c; left = drawing ? on : off;
    }
    left -= d;
    if (drawing) run.push(b);
  }
  if (drawing && run.length >= 2) out.push(polyline(run, m.level));
  return out;
}
