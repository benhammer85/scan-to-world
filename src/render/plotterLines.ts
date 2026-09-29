/**
 * Pen-plotter reveal for contour polylines.
 *
 * Every polyline is packed into one LineSegments geometry with two extra
 * per-vertex attributes:
 *   aAlong  - normalised arc length (0 at the pen-down point, 1 at the end)
 *   aTiming - (start time, duration) of that line's stroke
 * The fragment shader discards anything the pen hasn't reached yet, which is the
 * classic dash-offset / stroke-reveal trick moved from SVG paths onto a 3D surface.
 *
 * This is the seam where the old map app's plotter code should plug in: anything
 * that turns Polyline[] into a timed stroke animation can replace `schedule()`.
 */
import * as THREE from 'three';
import type { Polyline } from '../terrain/contours';

export interface PlotterStyle {
  ink: THREE.ColorRepresentation;
  /** Ink colour for the highest contours; lines are tinted by level between the two. */
  inkHigh: THREE.ColorRepresentation;
  /** Seconds of stagger between successive contour levels. */
  levelStagger: number;
  /** Pen speed in world units per second. */
  penSpeed: number;
  /** Every Nth level is drawn darker, like index contours on a topo map. */
  indexEvery: number;
}

export const defaultPlotterStyle: PlotterStyle = {
  ink: '#1d2a3a',
  inkHigh: '#7a2e12',
  levelStagger: 0.18,
  penSpeed: 1.6,
  indexEvery: 5,
};

const vertexShader = /* glsl */ `
  attribute float aAlong;
  attribute vec2 aTiming;
  attribute float aLevel;
  uniform float uTime;
  varying float vAlong;
  varying float vProgress;
  varying float vLevel;
  void main() {
    vAlong = aAlong;
    vLevel = aLevel;
    vProgress = clamp((uTime - aTiming.x) / max(aTiming.y, 1e-4), 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uInkHigh;
  uniform float uIndexEvery;
  uniform float uLevelCount;
  varying float vAlong;
  varying float vProgress;
  varying float vLevel;
  void main() {
    if (vProgress <= 0.0 || vAlong > vProgress) discard;
    vec3 ink = mix(uInk, uInkHigh, clamp(vLevel / max(uLevelCount - 1.0, 1.0), 0.0, 1.0));
    bool isIndex = mod(vLevel + 0.5, uIndexEvery) < 1.0;
    // The pen tip glows slightly while it's still moving.
    float tip = (vProgress < 1.0) ? smoothstep(0.06, 0.0, vProgress - vAlong) : 0.0;
    float alpha = isIndex ? 1.0 : 0.72;
    gl_FragColor = vec4(mix(ink, vec3(1.0, 0.55, 0.2), tip * 0.8), alpha);
  }
`;

export class PlotterLines {
  readonly object: THREE.LineSegments;
  private material: THREE.ShaderMaterial;
  private clock = 0;
  private endTime = 0;

  constructor(private style: PlotterStyle = defaultPlotterStyle) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uInk: { value: new THREE.Color(style.ink) },
        uInkHigh: { value: new THREE.Color(style.inkHigh) },
        uIndexEvery: { value: style.indexEvery },
        uLevelCount: { value: 1 },
      },
    });
    this.object = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 1;
  }

  /**
   * Replace the drawn lines.
   * @param animate true = plot them in from scratch; false = show fully drawn
   *                (used for live reshaping, where replaying would be distracting).
   */
  setLines(lines: Polyline[], animate: boolean): void {
    let segCount = 0;
    for (const l of lines) segCount += l.points.length / 3 - 1 + (l.closed ? 1 : 0);

    const position = new Float32Array(segCount * 6);
    const along = new Float32Array(segCount * 2);
    const timing = new Float32Array(segCount * 4);
    const level = new Float32Array(segCount * 2);

    const schedule = animate ? this.schedule(lines) : lines.map(() => [-1, 0] as [number, number]);
    let maxLevel = 0;
    let o = 0;
    lines.forEach((line, li) => {
      const pts = line.points;
      const n = pts.length / 3;
      const [start, duration] = schedule[li];
      maxLevel = Math.max(maxLevel, line.level);
      let dist = 0;
      const segs = n - 1 + (line.closed ? 1 : 0);
      for (let s = 0; s < segs; s++) {
        const i = s, j = (s + 1) % n;
        const seg = Math.hypot(pts[j * 3] - pts[i * 3], pts[j * 3 + 1] - pts[i * 3 + 1], pts[j * 3 + 2] - pts[i * 3 + 2]);
        for (let e = 0; e < 2; e++) {
          const src = e === 0 ? i : j;
          position.set(pts.subarray(src * 3, src * 3 + 3), (o * 2 + e) * 3);
          along[o * 2 + e] = line.length > 0 ? (dist + (e === 0 ? 0 : seg)) / line.length : 1;
          timing[(o * 2 + e) * 2] = start;
          timing[(o * 2 + e) * 2 + 1] = duration;
          level[o * 2 + e] = line.level;
        }
        dist += seg;
        o++;
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geom.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geom.setAttribute('aTiming', new THREE.BufferAttribute(timing, 2));
    geom.setAttribute('aLevel', new THREE.BufferAttribute(level, 1));
    this.object.geometry.dispose();
    this.object.geometry = geom;
    this.material.uniforms.uLevelCount.value = maxLevel + 1;

    if (animate) {
      this.clock = 0;
      this.endTime = schedule.reduce((m, [s, d]) => Math.max(m, s + d), 0);
    }
  }

  /** Start/duration per line: levels are plotted bottom-up, with the lines of a
   *  level drawn roughly together (several pens), so peaks "rise" last. */
  private schedule(lines: Polyline[]): [number, number][] {
    return lines.map((l) => {
      const jitter = pseudoRandom(l.level * 7919 + l.points.length) * this.style.levelStagger;
      return [l.level * this.style.levelStagger + jitter, 0.25 + l.length / this.style.penSpeed];
    });
  }

  get animating(): boolean {
    return this.clock < this.endTime;
  }

  update(dt: number): void {
    this.clock += dt;
    this.material.uniforms.uTime.value = this.clock;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
