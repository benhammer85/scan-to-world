/**
 * The atlas: every world you have made, laid out together on one celestial
 * chart, and the uncharted ones still to make shown as dotted places. And the
 * celestial railway between worlds: it leaves a station on one world on ever
 * taller trestles, climbs off into the sky, passes a halfway station floating
 * in the empty paper, and comes down on trestles to the other. A train runs on
 * it, and brings settlers.
 *
 * Drawn in the same sepia ink as the towns, as an old chart of the heavens
 * would draw a thing nobody ought to have built.
 */
import * as THREE from 'three';

type V = THREE.Vector3;

export const ATLAS = {
  /** Worlds this far apart on the chart (a world is about 2 across). */
  spacing: 5.2,
  /** The railway: how far out from each world it climbs before it turns for the other. */
  climb: 1.3,
  /** The rails' gauge, a tie every so far, the trestles for this share of each end. */
  gauge: 0.022,
  tie: 0.05,
  trestles: 0.24,
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
 * The railway as drawn: two rails, their ties, trestles down to each world
 * near its ends (with cross-bracing), and the halfway station.
 */
export function railwayLines(curve: THREE.CubicBezierCurve3, centreA: V, centreB: V, eye: V, growth = 1, scale = 1): V[][] {
  const out: V[][] = [];
  const N = 120, pts = curve.getSpacedPoints(N), len = curve.getLength();
  // Laid out from both ends at once, meeting in the middle as it is finished.
  const shown = Math.min(1, growth);
  const side = (i: number): V => {
    const t = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const view = eye.clone().sub(pts[i]).normalize();
    return new THREE.Vector3().crossVectors(t, view).normalize();
  };
  const visible = (i: number) => i / N <= shown / 2 || i / N >= 1 - shown / 2;
  for (const sgn of [1, -1]) {
    let run: V[] = [];
    for (let i = 0; i <= N; i++) {
      if (!visible(i)) { if (run.length > 1) out.push(run); run = []; continue; }
      run.push(pts[i].clone().addScaledVector(side(i), (sgn * ATLAS.gauge * scale) / 2));
    }
    if (run.length > 1) out.push(run);
  }
  const every = Math.max(1, Math.round((ATLAS.tie * scale / len) * N));
  for (let i = 0; i <= N; i += every) {
    if (!visible(i)) continue;
    const s = side(i);
    out.push([pts[i].clone().addScaledVector(s, -ATLAS.gauge * scale * 0.9), pts[i].clone().addScaledVector(s, ATLAS.gauge * scale * 0.9)]);
  }
  // Trestles: posts from the track down to the ground, taller as it climbs, braced across.
  let prevFoot: V | null = null, prevTop: V | null = null;
  for (let i = 0; i <= N; i += 3) {
    const f = i / N;
    const end = f < ATLAS.trestles ? centreA : f > 1 - ATLAS.trestles ? centreB : null;
    if (!end || !visible(i)) { prevFoot = prevTop = null; continue; }
    const top = pts[i];
    const down = end.clone().sub(top).normalize();
    // The foot: where the post meets the world, near enough (the world is about 1 across its middle).
    const foot = end.clone().addScaledVector(down, -Math.max(0.98, 0));
    if (top.distanceTo(end) < 1.03) { prevFoot = prevTop = null; continue; }
    out.push([top.clone(), foot]);
    if (prevFoot && prevTop) out.push([prevTop, foot], [prevFoot, top.clone()]);
    prevFoot = foot; prevTop = top.clone();
  }
  // The halfway station: a platform floating in the sky, its little house, and its lamp.
  if (shown >= 1) {
    const m = curve.getPointAt(0.5), t = curve.getTangentAt(0.5), s = side(Math.round(N / 2));
    const up = new THREE.Vector3().crossVectors(s, t).normalize();
    const k = scale, g = ATLAS.gauge * k;
    const box = (c: V, u: V, w: V, a: number, b: number) => {
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => c.clone().addScaledVector(u, a * i).addScaledVector(w, b * j));
      out.push(q);
    };
    box(m.clone().addScaledVector(s, g * 2.2), t, s, 0.09 * k, 0.02 * k);
    box(m.clone().addScaledVector(s, g * 2.2 + 0.05 * k), t, s, 0.035 * k, 0.022 * k);
    const lamp = m.clone().addScaledVector(s, -g * 2.2);
    out.push([lamp, lamp.clone().addScaledVector(up, 0.07 * k)]);
    circle(lamp.clone().addScaledVector(up, 0.08 * k), t, up, 0.012 * k, out);
    // And the chains it hangs from, going up into nothing, as if from a hook in the sky.
    for (const d of [-0.08, 0.08]) {
      const p = m.clone().addScaledVector(t, d * k).addScaledVector(s, g * 2.2);
      out.push(...dashed([p, p.clone().addScaledVector(up, 0.35 * k)], 0.012 * k, 0.012 * k));
    }
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

/** The train, drawn: an engine with its funnel, and two carriages. */
export function trainLines(curve: THREE.CubicBezierCurve3, t: number, eye: V, scale = 1): V[][] {
  const out: V[][] = [];
  const len = curve.getLength();
  for (let k = 0; k < 3; k++) {
    const u = THREE.MathUtils.clamp(t - (k * 0.07 * scale) / len, 0, 1);
    const c = curve.getPointAt(u), tan = curve.getTangentAt(u);
    const view = eye.clone().sub(c).normalize(), s = new THREE.Vector3().crossVectors(tan, view).normalize();
    const up = new THREE.Vector3().crossVectors(s, tan).normalize();
    const z = scale, lift = c.clone().addScaledVector(up, 0.018 * z);
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([i, j]) => lift.clone().addScaledVector(tan, 0.03 * z * i).addScaledVector(up, 0.013 * z * j));
    out.push(q);
    if (k === 0) {
      const f = lift.clone().addScaledVector(tan, 0.018 * z).addScaledVector(up, 0.013 * z);
      out.push([f, f.clone().addScaledVector(up, 0.018 * z)]);
      // A little smoke behind it, in puffs.
      for (let j = 1; j <= 3; j++) circle(f.clone().addScaledVector(up, (0.02 + j * 0.018) * z).addScaledVector(tan, -j * 0.02 * z), tan, up, (0.006 + j * 0.003) * z, out);
    }
  }
  return out;
}

/**
 * The chart itself: a faint graticule round the middle, as a celestial chart
 * is ruled, and stars here and there in the empty paper.
 */
export function chartLines(centre: V, radius: number): V[][] {
  const out: V[][] = [];
  const z = -1.6; // behind the worlds
  for (let r = ATLAS.spacing; r <= radius; r += ATLAS.spacing) {
    const ring: V[] = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * 2 * Math.PI; ring.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + Math.sin(a) * r, z)); }
    out.push(...dashed(ring, 0.06, 0.12));
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    out.push(...dashed([new THREE.Vector3(centre.x + Math.cos(a) * 1.4, centre.y + Math.sin(a) * 1.4, z), new THREE.Vector3(centre.x + Math.cos(a) * radius, centre.y + Math.sin(a) * radius, z)], 0.06, 0.12));
  }
  // Stars: four-pointed, of three magnitudes, placed by a fixed rule so they never move.
  for (let i = 0; i < 90; i++) {
    const a = frac(Math.sin(i * 12.9898) * 43758.5453) * 2 * Math.PI, r = Math.sqrt(frac(Math.sin(i * 78.233) * 12345.678)) * radius * 1.15;
    const c = new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + Math.sin(a) * r, z);
    const m = [0.03, 0.05, 0.08][i % 3];
    out.push([c.clone().add(new THREE.Vector3(-m, 0, 0)), c.clone().add(new THREE.Vector3(m, 0, 0))], [c.clone().add(new THREE.Vector3(0, -m, 0)), c.clone().add(new THREE.Vector3(0, m, 0))]);
    if (i % 3 === 2) out.push([c.clone().add(new THREE.Vector3(-m * 0.5, -m * 0.5, 0)), c.clone().add(new THREE.Vector3(m * 0.5, m * 0.5, 0))], [c.clone().add(new THREE.Vector3(-m * 0.5, m * 0.5, 0)), c.clone().add(new THREE.Vector3(m * 0.5, -m * 0.5, 0))]);
  }
  return out;
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
