/**
 * Pen-plotter reveal for contour polylines, ported from the map app's reveal
 * (whatwesaved: `studio.PAGE`'s `plot()` and `ink()`), moved from a 2D canvas
 * mask onto lines lying on a 3D surface.
 *
 * What carries over, and why each rule exists there:
 *  - One pen at constant speed. The time a reveal takes is however much line
 *    there is to draw, clamped to 1.5–20 s, and eased at both ends of the whole
 *    run, because "a constant rate starts and stops dead, which is the one
 *    thing a hand never does".
 *  - Nearest-neighbour order starting where you touched, inside windows and
 *    never across them. Here a window is one contour level, so levels still
 *    go on bottom-up while the pen doesn't fly around the object inside one.
 *    An open line is reversed if its far end is the nearer one.
 *  - Every mark costs a moment. Short lines get a floor so they are drawn,
 *    not just "appearing".
 *  - A visible nib at the pen position ("watching a plotter is mostly
 *    watching this").
 *  - Only new marks are plotted. Anything already inked stays put, and a new
 *    reveal cuts the running one short by finishing it (`anim.end()`).
 *
 * New here: lines changed while the player is still dragging show as pencil
 * (faint, fully visible) so the terrain reshapes live. On release the pen inks
 * them, starting from where the stroke began. Nothing is deleted and redrawn.
 */
import * as THREE from 'three';
import type { Polyline } from '../terrain/contours';
import { rimGlsl } from './rim';

export interface PlotterStyle {
  ink: THREE.ColorRepresentation;
  /** Ink colour for the highest contours; lines are tinted by level between the two. */
  inkHigh: THREE.ColorRepresentation;
  pencil: THREE.ColorRepresentation;
  /** Pen speed in object widths per second (the map app used page widths: 0.25). */
  widthsPerSecond: number;
  minSeconds: number;
  maxSeconds: number;
  /** Floor on what one line costs the pen, in world units. */
  minMarkLength: number;
  /** Every Nth level is drawn darker, like index contours on a topo map. */
  indexEvery: number;
  /** How strong ordinary lines and index lines are drawn (0..1). */
  alpha: number;
  indexAlpha: number;
  /**
   * Fading ink (after whatwesaved's fading plate: the pen is the only light
   * on the sheet). Ink out of sight is held this many seconds, then fades
   * over `fadeSeconds` to pencil, never below. Turned back into view, the pen
   * inks it again. 0 turns fading off.
   */
  holdSeconds: number;
  fadeSeconds: number;
  /**
   * Whether a pen draws these lines at all. Without one, nothing is plotted: a new line
   * simply comes into being, fading in over `appearSeconds`, as the land's life does.
   */
  pen: boolean;
  appearSeconds: number;
}

export const defaultPlotterStyle: PlotterStyle = {
  ink: '#1d2a3a',
  inkHigh: '#7a2e12',
  pencil: '#8a8578',
  widthsPerSecond: 0.25,
  minSeconds: 1.5,
  maxSeconds: 20,
  minMarkLength: 0.05,
  indexEvery: 5,
  alpha: 0.72,
  indexAlpha: 1,
  holdSeconds: 25,
  fadeSeconds: 45,
  pen: true,
  appearSeconds: 4,
};

/** A line faces the eye, for fading, if the ground under it looks at least this much towards it. */
const FACING = 0.2;
/** Faded this far (of the way to pencil) and back in view, a line is inked again. */
const STALE = 0.35;

/**
 *  - plot:   forget what's inked and plot everything (first load, replay)
 *  - settle: everything is simply there (a settings change, like the map app's
 *            `restate`, which redraws with animate=False)
 *  - live:   inked lines stay inked, anything new or changed is pencil
 *  - ink:    the pen inks whatever isn't inked yet, starting at `from`
 */
export type RevealMode = 'plot' | 'settle' | 'live' | 'ink';

const NOT_YET = 1e9;

const vertexShader = /* glsl */ `
  ${rimGlsl}
  varying float vRim;
  attribute float aAlong;
  attribute vec2 aTiming;   // (pen distance at which this line starts, its charged length)
  attribute float aLevel;
  attribute float aPencil;
  attribute float aSeen;
  attribute float aBorn;
  uniform float uAppear;
  varying float vAppear;
  uniform float uDrawn;
  uniform float uNow;
  uniform float uHold;
  uniform float uFade;
  varying float vFaded;
  varying float vAlong;
  varying float vProgress;
  varying float vLevel;
  varying float vPencil;
  void main() {
    vAlong = aAlong;
    vLevel = aLevel;
    vPencil = aPencil;
    vProgress = aTiming.y <= 0.0 ? 1.0 : clamp((uDrawn - aTiming.x) / aTiming.y, 0.0, 1.0);
    vFaded = uFade <= 0.0 ? 0.0 : smoothstep(0.0, 1.0, (uNow - aSeen - uHold) / uFade);
    vAppear = uAppear <= 0.0 ? 1.0 : smoothstep(0.0, uAppear, uNow - aBorn);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vRim = rimFade(position, mv);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uInkHigh;
  uniform vec3 uPencil;
  uniform float uIndexEvery;
  uniform float uLevelCount;
  uniform float uAlpha;
  uniform float uIndexAlpha;
  varying float vAlong;
  varying float vProgress;
  varying float vLevel;
  varying float vPencil;
  varying float vFaded;
  varying float vRim;
  varying float vAppear;
  void main() {
    if (vRim <= 0.0 || vAppear <= 0.0) discard;
    bool inked = vProgress > 0.0 && vAlong <= vProgress;
    if (!inked) {
      if (vPencil < 0.5) discard;
      gl_FragColor = vec4(uPencil, 0.55 * vRim * vAppear);
      return;
    }
    vec3 ink = mix(uInk, uInkHigh, clamp(vLevel / max(uLevelCount - 1.0, 1.0), 0.0, 1.0));
    bool isIndex = mod(vLevel + 0.5, uIndexEvery) < 1.0;
    // Out of sight long enough, ink fades back to pencil, and no further.
    gl_FragColor = vec4(mix(ink, uPencil, vFaded), mix(isIndex ? uIndexAlpha : uAlpha, 0.55, vFaded) * vRim * vAppear);
  }
`;

/** A line's identity. Contour extraction is deterministic, so a line the edit
 *  didn't touch comes back bit-identical and keeps its key. */
export function lineKey(l: Polyline): string {
  const p = l.points, n = p.length;
  const m = Math.floor(n / 6) * 3;
  return `${l.level}|${n}|${l.closed ? 1 : 0}|${p[0]},${p[1]},${p[2]}|${p[m]},${p[m + 1]},${p[m + 2]}|${p[n - 3]},${p[n - 2]},${p[n - 1]}`;
}

interface Run {
  key: string;
  points: Float32Array;
  /** Pen distance at which it starts, and what it's charged. */
  start: number;
  cost: number;
  length: number;
  closed: boolean;
}

export class PlotterLines {
  readonly object = new THREE.Group();
  private lines: THREE.LineSegments;
  private nib: THREE.Group;
  private nibRing: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private inked = new Set<string>();
  private runs: Run[] = [];
  private total = 0;
  private elapsed = 0;
  private duration = 0;
  /** Size of the object (the pen's "page width"), for pen speed. */
  width = 2;
  pace = 1;

  constructor(private style: PlotterStyle = defaultPlotterStyle) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uDrawn: { value: 0 },
        uInk: { value: new THREE.Color(style.ink) },
        uInkHigh: { value: new THREE.Color(style.inkHigh) },
        uPencil: { value: new THREE.Color(style.pencil) },
        uIndexEvery: { value: style.indexEvery },
        uAlpha: { value: style.alpha },
        uIndexAlpha: { value: style.indexAlpha },
        uLevelCount: { value: 1 },
        uNow: { value: 0 },
        uHold: { value: style.holdSeconds },
        uFade: { value: style.fadeSeconds },
        uAppear: { value: style.pen ? 0 : style.appearSeconds },
      },
    });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;

    // The nib: a dot and a faint ring round it, as in the map app's overlay.
    // The ring lies flat on the ground under the pen. Turned to face the
    // camera, it stood upright in the surface, and the half of it below
    // the ground was hidden: it read as a half moon.
    this.nib = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: '#14141e' }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.026, 0.034, 32),
      new THREE.MeshBasicMaterial({ color: '#14141e', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false }),
    );
    // Never cut by a bump of the ground near the pen; hidden instead when the pen is round the back.
    ring.renderOrder = 3;
    this.nibRing = ring;
    this.nib.add(dot, ring);
    this.nib.visible = false;
    this.object.add(this.lines, this.nib);
  }

  /** Has the pen inked this line (by `lineKey`)? */
  isInked(key: string): boolean {
    return this.inked.has(key) && !this.runs.some((r) => r.key === key);
  }

  get animating(): boolean {
    return this.elapsed < this.duration;
  }

  /** How many lines are pencil or still waiting for the pen. */
  get uninked(): number {
    return this.uninkedCount;
  }
  private uninkedCount = 0;

  setLines(lines: Polyline[], mode: RevealMode, from?: THREE.Vector3): void {
    // A new reveal cuts the running one short by finishing it, never by
    // dropping it: whatever the pen was still going to draw counts as drawn.
    if (this.animating) this.finish();

    const keys = lines.map(lineKey);
    // Without a pen, nothing waits to be drawn: every line is there, each fading in from when it first came.
    if (!this.style.pen) mode = 'settle';
    // The same lines, all inked, asked for again: nothing to do. (A grown
    // world is thousands of lines, and rebuilding them all cost 370 ms.)
    const same = keys.join('\n');
    if (mode !== 'plot' && same === this.lastKeys && keys.every((k) => this.inked.has(k))) return;
    this.lastKeys = same;
    if (mode === 'plot') this.inked.clear();
    if (mode === 'settle') this.inked = new Set(keys);
    if (mode === 'ink') {
      // Forget lines that are gone, so the set doesn't grow forever.
      const live = new Set(keys);
      for (const k of this.inked) if (!live.has(k)) this.inked.delete(k);
    }

    const pending: number[] = [];
    if (mode === 'plot' || mode === 'ink') {
      lines.forEach((_, i) => { if (!this.inked.has(keys[i])) pending.push(i); });
    }
    this.runs = this.order(lines, keys, pending, from ?? new THREE.Vector3());
    this.total = this.runs.reduce((s, r) => s + r.cost, 0);
    const seconds = this.total / (this.width * this.style.widthsPerSecond * this.pace);
    this.duration = this.runs.length
      ? Math.max(this.style.minSeconds / this.pace, Math.min(this.style.maxSeconds / this.pace, seconds))
      : 0;
    this.elapsed = 0;
    this.uninkedCount = keys.filter((k) => !this.inked.has(k)).length;

    this.shown = { lines, keys };
    this.stale = []; // indices into the lines just replaced
    this.build(lines, keys, mode !== 'plot');
    this.update(0);
  }

  // ---- fading ink

  /** Seconds since this pen was made: the clock the fading runs on. */
  private clock = 0;
  private lastSurvey = -1;
  /** When each line (by key) first came, on `clock`: without a pen, it fades in from then. */
  private bornAt = new Map<string, number>();
  /** When each line (by key) last faced the eye, on `clock`. */
  private seenAt = new Map<string, number>();
  /** Each drawn line's vertices in the geometry, and a point on it. */
  private ranges: { from: number; to: number; mid: number[] }[] = [];
  private shown: { lines: Polyline[]; keys: string[] } = { lines: [], keys: [] };
  /** Faded lines back in view, waiting for the pen (indices into `shown`). */
  private stale: number[] = [];

  /**
   * Which lines face the eye now: those are seen, and keep their ink; those
   * that have faded and come back into view wait for the pen. The object is
   * centred on its origin, so a point's outward direction is its ground's up.
   */
  private survey(camera: THREE.Camera): void {
    if (this.style.fadeSeconds <= 0 || !this.ranges.length) return;
    const eye = this.object.worldToLocal(NIB_EYE.setFromMatrixPosition(camera.matrixWorld));
    const attr = this.lines.geometry.getAttribute('aSeen') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array, now = this.clock, faded = this.style.holdSeconds + this.style.fadeSeconds * STALE;
    let touched = false;
    this.stale = [];
    this.ranges.forEach((r, li) => {
      const [x, y, z] = r.mid, l = Math.hypot(x, y, z) || 1;
      const ex = eye.x - x, ey = eye.y - y, ez = eye.z - z, el = Math.hypot(ex, ey, ez) || 1;
      if ((x * ex + y * ey + z * ez) / (l * el) < FACING) return;
      const key = this.shown.keys[li], was = this.seenAt.get(key) ?? now;
      if (!this.inked.has(key)) return;
      if (now - was > faded) { this.stale.push(li); return; } // faded: the pen will come for it
      if (now - was < 1) return;
      this.seenAt.set(key, now);
      arr.fill(now, r.from, r.to);
      touched = true;
    });
    if (touched) attr.needsUpdate = true;
  }

  /** Just drawn: these lines are fresh ink now, not from when the pen set out for them. */
  private freshen(keys: string[]): void {
    const attr = this.lines.geometry.getAttribute('aSeen') as THREE.BufferAttribute | undefined;
    if (!attr || !keys.length) return;
    const want = new Set(keys), arr = attr.array as Float32Array;
    this.shown.keys.forEach((k, li) => {
      if (!want.has(k) || !this.ranges[li]) return;
      this.seenAt.set(k, this.clock);
      arr.fill(this.clock, this.ranges[li].from, this.ranges[li].to);
    });
    attr.needsUpdate = true;
  }

  /** How far this line (by key) has faded towards pencil, 0 to 1, as the shader draws it. */
  fadeOf(key: string): number {
    const f = this.style.fadeSeconds;
    if (f <= 0) return 0;
    const x = Math.min(1, Math.max(0, (this.clock - (this.seenAt.get(key) ?? this.clock) - this.style.holdSeconds) / f));
    return x * x * (3 - 2 * x);
  }

  /**
   * The pen comes back for faded lines that are in view again, nearest the eye
   * first, and inks them. Called when the world is at rest. Returns whether it
   * started.
   */
  reinkFaded(): boolean {
    if (this.animating || !this.stale.length) return false;
    const { lines, keys } = this.shown;
    for (const i of this.stale) this.inked.delete(keys[i]);
    const [x, y, z] = this.ranges[this.stale[0]].mid;
    const from = new THREE.Vector3(x, y, z);
    this.runs = this.order(lines, keys, this.stale, from);
    this.stale = [];
    this.total = this.runs.reduce((s, r) => s + r.cost, 0);
    const seconds = this.total / (this.width * this.style.widthsPerSecond * this.pace);
    this.duration = Math.max(this.style.minSeconds / this.pace, Math.min(this.style.maxSeconds / this.pace, seconds));
    this.elapsed = 0;
    this.uninkedCount = keys.filter((k) => !this.inked.has(k)).length;
    this.build(lines, keys, true);
    this.update(0);
    return true;
  }

  private lastKeys = '';

  /**
   * Nearest-neighbour, one level (window) at a time, bottom-up. Line ends are
   * kept in a grid, so the nearest next line is found among its neighbours
   * rather than by measuring every line left: with thousands of lines that
   * search was a second and more.
   */
  private order(lines: Polyline[], keys: string[], pending: number[], from: THREE.Vector3): Run[] {
    const byLevel = new Map<number, number[]>();
    for (const i of pending) {
      const l = byLevel.get(lines[i].level);
      if (l) l.push(i); else byLevel.set(lines[i].level, [i]);
    }
    const here = from.clone();
    const runs: Run[] = [];
    let at = 0;
    for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
      const grid = new EndGrid(lines, byLevel.get(level)!);
      for (;;) {
        const pick = grid.nearest(here);
        if (!pick) break;
        const { i, flip } = pick;
        const l = lines[i];
        // The run goes the way the pen goes; the line itself is left as it was given. (Turned
        // round in place, a line kept by its caller changed its key, and came back as new.)
        const points = flip ? reversePoints(l.points) : l.points;
        const cost = Math.max(l.length, this.style.minMarkLength);
        runs.push({ key: keys[i], points, start: at, cost, length: l.length, closed: l.closed });
        at += cost;
        const p = points, n = p.length;
        if (l.closed) here.set(p[0], p[1], p[2]);
        else here.set(p[n - 3], p[n - 2], p[n - 1]);
      }
    }
    return runs;
  }

  /** @param underlay queued lines keep their pencil under the ink until the pen
   *  gets there. Only a first plot starts from bare surface: a line that was
   *  visible and then went while it waited for the pen is what the eye calls
   *  deletion (whatwesaved PRINCIPLES.md, 21). */
  private build(lines: Polyline[], keys: string[], underlay: boolean): void {
    const runOf = new Map(this.runs.map((r) => [r.key, r]));
    let segCount = 0;
    for (const l of lines) segCount += l.points.length / 3 - 1 + (l.closed ? 1 : 0);

    const position = new Float32Array(segCount * 6);
    const along = new Float32Array(segCount * 2);
    const timing = new Float32Array(segCount * 4);
    const level = new Float32Array(segCount * 2);
    const pencil = new Float32Array(segCount * 2);
    const seen = new Float32Array(segCount * 2);
    const born = new Float32Array(segCount * 2);
    const live = new Set(keys);
    for (const k of this.bornAt.keys()) if (!live.has(k)) this.bornAt.delete(k);
    this.ranges = [];
    let maxLevel = 0, o = 0;

    lines.forEach((line, li) => {
      const run = runOf.get(keys[li]);
      const isInked = this.inked.has(keys[li]);
      // Inked: fully drawn. Queued: drawn by the pen. Otherwise: pencil.
      const start = isInked ? -1 : run ? run.start : NOT_YET;
      const cost = isInked ? 0 : run ? run.cost : 1;
      const isPencil = !isInked && (!run || underlay) ? 1 : 0;
      maxLevel = Math.max(maxLevel, line.level);

      const pts = run ? run.points : line.points, n = pts.length / 3;
      const segs = n - 1 + (line.closed ? 1 : 0);
      // When it was last seen: a line just drawn, or queued for the pen, is fresh.
      if (!isInked || !this.seenAt.has(keys[li])) this.seenAt.set(keys[li], this.clock);
      const when = this.seenAt.get(keys[li])!;
      if (!this.bornAt.has(keys[li])) this.bornAt.set(keys[li], this.clock);
      const came = this.bornAt.get(keys[li])!;
      const m = Math.floor(n / 2) * 3;
      this.ranges.push({ from: o * 2, to: (o + segs) * 2, mid: [pts[m], pts[m + 1], pts[m + 2]] });
      let d = 0;
      for (let s = 0; s < segs; s++) {
        const i = s, j = (s + 1) % n;
        const seg = Math.hypot(pts[j * 3] - pts[i * 3], pts[j * 3 + 1] - pts[i * 3 + 1], pts[j * 3 + 2] - pts[i * 3 + 2]);
        for (let e = 0; e < 2; e++) {
          const src = e === 0 ? i : j, v = o * 2 + e;
          position.set(pts.subarray(src * 3, src * 3 + 3), v * 3);
          along[v] = line.length > 0 ? (d + (e === 0 ? 0 : seg)) / line.length : 1;
          timing[v * 2] = start;
          timing[v * 2 + 1] = cost;
          level[v] = line.level;
          pencil[v] = isPencil;
          seen[v] = when;
          born[v] = came;
        }
        d += seg;
        o++;
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geom.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geom.setAttribute('aTiming', new THREE.BufferAttribute(timing, 2));
    geom.setAttribute('aLevel', new THREE.BufferAttribute(level, 1));
    geom.setAttribute('aPencil', new THREE.BufferAttribute(pencil, 1));
    geom.setAttribute('aSeen', new THREE.BufferAttribute(seen, 1));
    geom.setAttribute('aBorn', new THREE.BufferAttribute(born, 1));
    this.lines.geometry.dispose();
    this.lines.geometry = geom;
    this.material.uniforms.uLevelCount.value = maxLevel + 1;
  }

  /** Mark everything queued as inked and lift the pen. */
  private finish(): void {
    for (const r of this.runs) this.inked.add(r.key);
    this.freshen(this.runs.map((r) => r.key));
    this.uninkedCount -= this.runs.length;
    this.runs = [];
    this.elapsed = this.duration;
    this.material.uniforms.uDrawn.value = this.total + 1;
    this.nib.visible = false;
  }

  update(dt: number, camera?: THREE.Camera): void {
    this.clock += dt;
    this.material.uniforms.uNow.value = this.clock;
    if (camera && this.clock - this.lastSurvey > 0.3) { this.lastSurvey = this.clock; this.survey(camera); }
    if (!this.runs.length) { this.nib.visible = false; return; }
    this.elapsed += dt;
    if (this.elapsed >= this.duration) { this.finish(); return; }
    const t = this.elapsed / this.duration;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const drawn = eased * this.total;
    this.material.uniforms.uDrawn.value = drawn;

    // Where the pen is right now.
    let lo = 0, hi = this.runs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.runs[mid].start <= drawn) lo = mid; else hi = mid - 1;
    }
    const run = this.runs[lo];
    const along = Math.min(1, Math.max(0, (drawn - run.start) / run.cost)) * run.length;
    pointAlong(run.points, run.closed, along, this.nib.position);
    this.nib.visible = true;
    // Flat on the ground: the object is centred on its origin, so outward is up, near enough.
    const up = NIB_UP.copy(this.nib.position).normalize();
    this.nibRing.quaternion.setFromUnitVectors(NIB_FACE, up);
    this.nibRing.position.copy(up).multiplyScalar(0.003);
    if (camera) {
      const eye = this.object.worldToLocal(NIB_EYE.setFromMatrixPosition(camera.matrixWorld));
      this.nibRing.visible = eye.sub(this.nib.position).dot(up) > 0;
    }
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

function dist(p: Float32Array, o: number, q: THREE.Vector3): number {
  return Math.hypot(p[o] - q.x, p[o + 1] - q.y, p[o + 2] - q.z);
}

function reversePoints(p: Float32Array): Float32Array {
  const n = p.length / 3, out = new Float32Array(p.length);
  for (let i = 0; i < n; i++) out.set(p.subarray(i * 3, i * 3 + 3), (n - 1 - i) * 3);
  return out;
}

/** The point `upto` along a polyline; a ring includes its closing segment. */
export function pointAlong(p: Float32Array, closed: boolean, upto: number, out: THREE.Vector3): void {
  let len = 0;
  const n = p.length / 3;
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const a = s * 3, b = ((s + 1) % n) * 3;
    const d = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    if (len + d >= upto) {
      const t = (upto - len) / Math.max(d, 1e-9);
      out.set(p[a] + (p[b] - p[a]) * t, p[a + 1] + (p[b + 1] - p[a + 1]) * t, p[a + 2] + (p[b + 2] - p[a + 2]) * t);
      return;
    }
    len += d;
  }
  const e = closed ? 0 : (n - 1) * 3;
  out.set(p[e], p[e + 1], p[e + 2]);
}

const NIB_FACE = new THREE.Vector3(0, 0, 1);
const NIB_UP = new THREE.Vector3();
const NIB_EYE = new THREE.Vector3();

/**
 * The ends of the lines still to draw, in a grid of cells, for finding the
 * nearest to the pen quickly: search the pen's cell, then rings of cells
 * round it, until no nearer end can be further out.
 */
class EndGrid {
  private cells = new Map<string, { i: number; end: number }[]>();
  private used = new Set<number>();
  private left: number;
  private size: number;

  constructor(private lines: Polyline[], items: number[]) {
    this.left = items.length;
    // About a line's length on a side: a few ends to a cell.
    let span = 0;
    for (const i of items) span += lines[i].length;
    const size = (span / Math.max(1, items.length)) * 2;
    this.size = Number.isFinite(size) ? Math.max(0.01, Math.min(0.2, size)) : 0.05;
    for (const i of items) {
      const l = lines[i], n = l.points.length;
      this.put(i, 0, l.points[0], l.points[1], l.points[2]);
      if (!l.closed) this.put(i, n - 3, l.points[n - 3], l.points[n - 2], l.points[n - 1]);
    }
  }

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`;
  }

  private put(i: number, end: number, x: number, y: number, z: number): void {
    const k = this.key(x, y, z);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push({ i, end });
  }

  nearest(p: THREE.Vector3): { i: number; flip: boolean } | null {
    if (!this.left) return null;
    const cx = Math.floor(p.x / this.size), cy = Math.floor(p.y / this.size), cz = Math.floor(p.z / this.size);
    let best: { i: number; end: number } | null = null, bd = Infinity;
    // Rings of mostly empty cells soon cost more than looking at every end
    // left; past that point, just look at every end.
    const most = this.cells.size;
    let sure = false;
    for (let r = 0, looked = 0; r < 64 && looked < most; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // this ring's shell only
        looked++;
        const key = `${cx + dx},${cy + dy},${cz + dz}`, cell = this.cells.get(key);
        if (!cell) continue;
        for (let k = cell.length - 1; k >= 0; k--) {
          const e = cell[k];
          if (this.used.has(e.i)) { cell.splice(k, 1); continue; }
          const d = dist(this.lines[e.i].points, e.end, p);
          if (d < bd) { bd = d; best = e; }
        }
        if (!cell.length) this.cells.delete(key);
      }
      // Nothing in a further ring can be nearer than this ring's inside edge.
      if (best && bd <= r * this.size) { sure = true; break; }
    }
    if (!sure) {
      // Far from everything left (the pen jumped): nearest by a plain look.
      for (const cell of this.cells.values()) for (const e of cell) {
        if (this.used.has(e.i)) continue;
        const d = dist(this.lines[e.i].points, e.end, p);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (!best) return null;
    this.used.add(best.i);
    this.left--;
    return { i: best.i, flip: best.end !== 0 };
  }
}
