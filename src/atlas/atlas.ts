/**
 * The atlas: every world you have made, laid out together on one celestial
 * chart, and the uncharted ones still to make shown as dotted places. And the
 * celestial railway between worlds: it leaves a station on one world, climbs
 * off into the sky, passes a halfway station, and comes down to the other. A
 * train runs on it, and brings settlers.
 *
 * Drawn as an old chart of the heavens draws a comet's course: a fine line
 * marked with its places, the train a comet with its tail. The fancy is in
 * the idea, never in the drawing (see STYLE.md).
 */
import * as THREE from 'three';

type V = THREE.Vector3;

export const ATLAS = {
  /** Worlds this far apart on the chart (a world is about 2 across). */
  spacing: 5.2,
  /** The railway: how far out from each world it climbs before it turns for the other. */
  climb: 1.3,
  /** Its course is marked with a small ring every so far, and the train's tail is so long. */
  place: 0.45,
  tail: 0.3,
  /** The train: world units per second, and how long it stands at each end. */
  speed: 0.9,
  dwell: 2.5,
};

/** Where each world sits on the chart: a slow spiral out from the middle, as stars on a chart are placed. */
export function layout(names: string[]): Map<string, V> {
  const out = new Map<string, V>();
  names.forEach((name, i) => {
    if (i === 0) { out.set(name, new THREE.Vector3(0, 0, 0)); return; }
    const a = i * 2.39996, r = ATLAS.spacing * Math.sqrt(i) * 0.95;
    out.set(name, new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.9, 0));
  });
  return out;
}

export interface Railway {
  a: string;
  b: string;
  /** The station at each end: a vertex of that world. */
  stationA: number;
  stationB: number;
  /** Seconds since the session began when it was laid. */
  born: number;
  /** Trips made: each brings settlers to the far end. */
  trips: number;
}

export interface End {
  at: V;
  up: V;
}

/** The railway's line through space, from one station to the other. */
export function railwayCurve(a: End, b: End): THREE.CubicBezierCurve3 {
  const span = a.at.distanceTo(b.at);
  const lift = Math.min(ATLAS.climb, span * 0.45);
  // Bowed to one side across the chart, as an orbit is drawn on a chart of the heavens:
  // a line straight from world to world read as a bridge, not a railway through the sky.
  const across = new THREE.Vector3().crossVectors(b.at.clone().sub(a.at), new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(span * 0.28);
  return new THREE.CubicBezierCurve3(
    a.at.clone(),
    a.at.clone().addScaledVector(a.up, lift).add(across),
    b.at.clone().addScaledVector(b.up, lift).add(across),
    b.at.clone(),
  );
}

/**
 * The railway as drawn: as a chart of the heavens draws a comet's course, not
 * as an engineer draws a bridge. A single fine line from station to station,
 * with a small ring at every so far along it, as a comet's course is marked
 * with its places night by night; a ring at each station; and at the halfway
 * point the sign for a station, a ring with a dot in it. No trestles, no
 * chains: the one fanciful thing is that the line is there at all.
 */
export function railwayLines(curve: THREE.CubicBezierCurve3, centreA: V, centreB: V, eye: V, growth = 1, scale = 1): V[][] {
  void centreA; void centreB;
  const out: V[][] = [];
  const N = 160, pts = curve.getSpacedPoints(N), len = curve.getLength();
  // Laid from both ends at once, meeting in the middle as it is finished.
  const shown = Math.min(1, growth);
  const visible = (i: number) => i / N <= shown / 2 || i / N >= 1 - shown / 2;
  const facing = (at: V) => {
    const view = eye.clone().sub(at).normalize();
    const u = new THREE.Vector3().crossVectors(view, Math.abs(view.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
    return { u, w: new THREE.Vector3().crossVectors(view, u).normalize() };
  };
  let run: V[] = [];
  for (let i = 0; i <= N; i++) {
    if (!visible(i)) { if (run.length > 1) out.push(run); run = []; continue; }
    run.push(pts[i].clone());
  }
  if (run.length > 1) out.push(run);
  // Its places along the way, and a station at each end.
  const places = Math.max(2, Math.round(len / (ATLAS.place * scale)));
  for (let k = 1; k < places; k++) {
    const i = Math.round((k / places) * N);
    if (!visible(i) || Math.abs(k / places - 0.5) < 0.5 / places) continue;
    const { u, w } = facing(pts[i]);
    circle(pts[i], u, w, 0.012 * scale, out);
  }
  for (const i of [0, N]) {
    const { u, w } = facing(pts[i]);
    circle(pts[i], u, w, 0.02 * scale, out);
  }
  // The halfway station: the sign for one, a ring with a dot in it.
  if (shown >= 1) {
    const m = curve.getPointAt(0.5), { u, w } = facing(m);
    circle(m, u, w, 0.032 * scale, out);
    circle(m, u, w, 0.006 * scale, out);
  }
  return out;
}

/** Where the train is at `seconds`: out along the line, a rest, back, a rest. */
export function trainAt(curve: THREE.CubicBezierCurve3, seconds: number, phase: number): { t: number; dir: number; arrivals: number } {
  const len = curve.getLength(), trip = len / ATLAS.speed, cycle = 2 * (trip + ATLAS.dwell);
  const s = ((seconds + phase * cycle) % cycle + cycle) % cycle;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const arrivals = Math.floor((seconds + phase * cycle) / (trip + ATLAS.dwell));
  if (s < trip) return { t: ease(s / trip), dir: 1, arrivals };
  if (s < trip + ATLAS.dwell) return { t: 1, dir: 1, arrivals };
  if (s < 2 * trip + ATLAS.dwell) return { t: 1 - ease((s - trip - ATLAS.dwell) / trip), dir: -1, arrivals };
  return { t: 0, dir: -1, arrivals };
}

/**
 * The train, drawn as a comet is: a small head, and a fine tail of three
 * lines streaming back along its course behind it, whichever way it goes.
 */
export function trainLines(curve: THREE.CubicBezierCurve3, t: number, eye: V, scale = 1, dir = 1): V[][] {
  const out: V[][] = [];
  const len = curve.getLength();
  const head = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  const view = eye.clone().sub(head).normalize();
  const tan = curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1)).multiplyScalar(dir);
  const side = new THREE.Vector3().crossVectors(tan, view).normalize();
  circle(head, side, new THREE.Vector3().crossVectors(view, side).normalize(), 0.014 * scale, out);
  const tail = ATLAS.tail * scale;
  for (const spread of [-1, 0, 1]) {
    const line: V[] = [];
    for (let j = 0; j <= 8; j++) {
      const back = (j / 8) * tail;
      const u = THREE.MathUtils.clamp(t - (dir * back) / len, 0, 1);
      line.push(curve.getPointAt(u).addScaledVector(side, spread * 0.018 * scale * (j / 8)));
    }
    // Starting at the head's rim, not its middle.
    line[0] = head.clone().addScaledVector(tan, -0.014 * scale).addScaledVector(side, spread * 0.006 * scale);
    out.push(line);
  }
  return out;
}

/**
 * The chart itself: a faint graticule round the
 * middle, as a celestial chart is ruled; stars in ink, most of them dots and
 * the brighter ones crosses; and here and there a constellation's figure,
 * joined in faint lines that stop short of each star, as an engraver would.
 *
 * The stars are placed cell by cell on a fixed grid, by a rule of the cell
 * alone, so the sky never moves when a new world is added and the chart grows.
 */
export const STARS = {
  /** One chance of a star in each cell this big. */
  cell: 1.15,
  chance: 0.62,
  /** No star this near a world. */
  clear: 1.35,
  /** A constellation joins stars at most this far apart, of three to this many. */
  reach: 2.3,
  most: 6,
};

export interface Star { at: V; magnitude: 0 | 1 | 2 }

export interface ChartDrawing { rule: V[][]; stars: V[][]; figures: V[][] }

export function starsOf(centre: V, radius: number, avoid: V[] = []): Star[] {
  const out: Star[] = [];
  const z = -1.6; // behind the worlds
  const c = STARS.cell, n = Math.ceil(radius / c) + 1;
  const ix0 = Math.floor(centre.x / c), iy0 = Math.floor(centre.y / c);
  for (let ix = ix0 - n; ix <= ix0 + n; ix++) for (let iy = iy0 - n; iy <= iy0 + n; iy++) {
    if (cellHash(ix, iy, 1) > STARS.chance) continue;
    const at = new THREE.Vector3((ix + cellHash(ix, iy, 2)) * c, (iy + cellHash(ix, iy, 3)) * c, z);
    if (Math.hypot(at.x - centre.x, at.y - centre.y) > radius) continue;
    if (avoid.some((w) => Math.hypot(at.x - w.x, at.y - w.y) < STARS.clear)) continue;
    const m = cellHash(ix, iy, 4);
    out.push({ at, magnitude: m < 0.62 ? 0 : m < 0.9 ? 1 : 2 });
  }
  return out;
}

export function chartLines(centre: V, radius: number, avoid: V[] = []): ChartDrawing {
  const rule: V[][] = [], stars: V[][] = [], figures: V[][] = [];
  const z = -1.6;
  for (let r = ATLAS.spacing; r <= radius; r += ATLAS.spacing) {
    const ring: V[] = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * 2 * Math.PI; ring.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + Math.sin(a) * r, z)); }
    rule.push(...dashed(ring, 0.06, 0.12));
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    rule.push(...dashed([new THREE.Vector3(centre.x + Math.cos(a) * 1.4, centre.y + Math.sin(a) * 1.4, z), new THREE.Vector3(centre.x + Math.cos(a) * radius, centre.y + Math.sin(a) * radius, z)], 0.06, 0.12));
  }

  const all = starsOf(centre, radius * 1.15, avoid);
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  for (const { at, magnitude } of all) {
    // A dot: a ring too small to see as one.
    circle(at, X, Y, magnitude === 0 ? 0.011 : 0.016, stars);
    if (magnitude === 0) continue;
    const m = magnitude === 1 ? 0.04 : 0.075;
    stars.push([at.clone().addScaledVector(X, -m), at.clone().addScaledVector(X, m)], [at.clone().addScaledVector(Y, -m), at.clone().addScaledVector(Y, m)]);
    if (magnitude === 2) {
      const d = m * 0.38;
      stars.push([at.clone().add(new THREE.Vector3(-d, -d, 0)), at.clone().add(new THREE.Vector3(d, d, 0))], [at.clone().add(new THREE.Vector3(-d, d, 0)), at.clone().add(new THREE.Vector3(d, -d, 0))]);
    }
  }
  figures.push(...constellations(all));
  return { rule, stars, figures };
}

/**
 * Constellations: from a bright star, walk to the nearest bright star not yet
 * in a figure, and on, three to six stars; sometimes a branch off the second.
 */
export function constellations(all: Star[]): V[][] {
  const out: V[][] = [];
  const bright = all.filter((s) => s.magnitude > 0).sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y);
  const used = new Set<Star>();
  const nearestTo = (s: Star) => {
    let best: Star | null = null, bd = STARS.reach;
    for (const o of bright) {
      if (used.has(o)) continue;
      const d = s.at.distanceTo(o.at);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };
  for (const seed of bright) {
    if (used.has(seed) || seed.magnitude < 2) continue;
    const h = frac(Math.sin(seed.at.x * 91.7 + seed.at.y * 47.3) * 43758.5453);
    const want = 3 + Math.floor(h * (STARS.most - 2));
    const chain = [seed];
    used.add(seed);
    while (chain.length < want) {
      const next = nearestTo(chain[chain.length - 1]);
      if (!next) break;
      chain.push(next); used.add(next);
    }
    if (chain.length < 3) { for (const s of chain.slice(1)) used.delete(s); continue; }
    const joins: [Star, Star][] = [];
    for (let i = 1; i < chain.length; i++) joins.push([chain[i - 1], chain[i]]);
    if (h > 0.55) { const off = nearestTo(chain[1]); if (off) { used.add(off); joins.push([chain[1], off]); } }
    for (const [a, b] of joins) {
      const d = a.at.distanceTo(b.at), gap = 0.07;
      if (d < gap * 3) continue;
      out.push([a.at.clone().lerp(b.at, gap / d), b.at.clone().lerp(a.at, gap / d)]);
    }
  }
  return out;
}

function cellHash(ix: number, iy: number, k: number): number {
  return frac(Math.sin(ix * 127.1 + iy * 311.7 + k * 74.7) * 43758.5453);
}

/** An uncharted place: a dotted circle where a world will be. */
export function unchartedLines(at: V): V[][] {
  const ring: V[] = [];
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * 2 * Math.PI; ring.push(new THREE.Vector3(at.x + Math.cos(a), at.y + Math.sin(a), at.z)); }
  return dashed(ring, 0.03, 0.05);
}

/** A pencilled line from the finger's start to where it is now, while a railway is being laid. */
export function sketchLines(a: V, b: V): V[][] {
  return dashed([a, b], 0.05, 0.04);
}

/** Lines as one geometry of line segments. */
export function segments(lines: V[][]): THREE.BufferGeometry {
  let n = 0;
  for (const l of lines) n += Math.max(0, l.length - 1);
  const pos = new Float32Array(n * 6);
  let k = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) {
    pos.set([l[i - 1].x, l[i - 1].y, l[i - 1].z, l[i].x, l[i].y, l[i].z], k);
    k += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

function circle(c: V, u: V, w: V, r: number, out: V[][]): void {
  const q: V[] = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * 2 * Math.PI; q.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r)); }
  out.push(q);
}

function dashed(line: V[], on: number, off: number): V[][] {
  const out: V[][] = [];
  let drawing = true, left = on, run: V[] = [line[0].clone()];
  for (let i = 1; i < line.length; i++) {
    let a = line[i - 1].clone();
    const b = line[i];
    let d = a.distanceTo(b);
    while (d > left) {
      const c = a.clone().lerp(b, left / d);
      if (drawing) { run.push(c); out.push(run); run = []; } else run = [c];
      drawing = !drawing; d -= left; a = c; left = drawing ? on : off;
    }
    left -= d;
    if (drawing) run.push(b.clone());
  }
  if (drawing && run.length > 1) out.push(run);
  return out;
}

function frac(x: number): number {
  return x - Math.floor(x);
}
