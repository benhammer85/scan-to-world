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
};

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
  attribute float aAlong;
  attribute vec2 aTiming;   // (pen distance at which this line starts, its charged length)
  attribute float aLevel;
  attribute float aPencil;
  uniform float uDrawn;
  varying float vAlong;
  varying float vProgress;
  varying float vLevel;
  varying float vPencil;
  void main() {
    vAlong = aAlong;
    vLevel = aLevel;
    vPencil = aPencil;
    vProgress = aTiming.y <= 0.0 ? 1.0 : clamp((uDrawn - aTiming.x) / aTiming.y, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
  void main() {
    bool inked = vProgress > 0.0 && vAlong <= vProgress;
    if (!inked) {
      if (vPencil < 0.5) discard;
      gl_FragColor = vec4(uPencil, 0.55);
      return;
    }
    vec3 ink = mix(uInk, uInkHigh, clamp(vLevel / max(uLevelCount - 1.0, 1.0), 0.0, 1.0));
    bool isIndex = mod(vLevel + 0.5, uIndexEvery) < 1.0;
    gl_FragColor = vec4(ink, isIndex ? uIndexAlpha : uAlpha);
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
      },
    });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;

    // The nib: a dot and a faint ring round it, as in the map app's overlay.
    this.nib = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: '#14141e' }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.026, 0.034, 32),
      new THREE.MeshBasicMaterial({ color: '#14141e', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.userData.billboard = true;
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

    this.build(lines, keys, mode !== 'plot');
    this.update(0);
  }

  /** Nearest-neighbour, one level (window) at a time, bottom-up. */
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
      const left = byLevel.get(level)!;
      while (left.length) {
        let best = 0, bd = Infinity, flip = false;
        for (let j = 0; j < left.length; j++) {
          const l = lines[left[j]], n = l.points.length;
          const da = dist(l.points, 0, here);
          const db = l.closed ? Infinity : dist(l.points, n - 3, here);
          if (da < bd) { bd = da; best = j; flip = false; }
          if (db < bd) { bd = db; best = j; flip = true; }
        }
        const i = left.splice(best, 1)[0];
        const l = lines[i];
        // Keep the geometry and the run going the same way (the key was taken first).
        if (flip) l.points = reversePoints(l.points);
        const cost = Math.max(l.length, this.style.minMarkLength);
        runs.push({ key: keys[i], points: l.points, start: at, cost, length: l.length, closed: l.closed });
        at += cost;
        const p = l.points, n = p.length;
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
    let maxLevel = 0, o = 0;

    lines.forEach((line, li) => {
      const run = runOf.get(keys[li]);
      const isInked = this.inked.has(keys[li]);
      // Inked: fully drawn. Queued: drawn by the pen. Otherwise: pencil.
      const start = isInked ? -1 : run ? run.start : NOT_YET;
      const cost = isInked ? 0 : run ? run.cost : 1;
      const isPencil = !isInked && (!run || underlay) ? 1 : 0;
      maxLevel = Math.max(maxLevel, line.level);

      const pts = line.points, n = pts.length / 3;
      const segs = n - 1 + (line.closed ? 1 : 0);
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
    this.lines.geometry.dispose();
    this.lines.geometry = geom;
    this.material.uniforms.uLevelCount.value = maxLevel + 1;
  }

  /** Mark everything queued as inked and lift the pen. */
  private finish(): void {
    for (const r of this.runs) this.inked.add(r.key);
    this.uninkedCount -= this.runs.length;
    this.runs = [];
    this.elapsed = this.duration;
    this.material.uniforms.uDrawn.value = this.total + 1;
    this.nib.visible = false;
  }

  update(dt: number, camera?: THREE.Camera): void {
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
    if (camera) for (const c of this.nib.children) if (c.userData.billboard) c.quaternion.copy(camera.quaternion);
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
