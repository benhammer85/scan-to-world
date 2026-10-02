/**
 * Streaks, as the online wind maps draw the wind: many small particles carried along by the lava's
 * own motion, each leaving a short trail that fades behind it, thicker at its head. Where the lava
 * runs fast they race and their trails stretch; where it slows they crawl; where it stops they die
 * away. Drawn as cuts in the woodblock: the paper showing through.
 *
 * The particles live on the CPU (a few hundred of them, a trail of a dozen points each); their
 * trails are drawn as ribbons a set number of pixels wide, worked out in the vertex shader, so they
 * stay fine at any zoom and on any screen.
 */
import * as THREE from 'three';

/** What the lava is doing at a point: its velocity (in the world's frame, units a second), how high the ground is drawn there, and whether there's lava to carry a streak. */
export interface Field {
  at(x: number, y: number, z: number, hint: number): { vx: number; vy: number; vz: number; lift: number; alive: boolean; hint: number };
}

const TRAIL = 14;

export class Streaks {
  readonly object: THREE.Mesh;
  private readonly max: number;
  /** Each particle's trail, newest first: TRAIL points of (x, y, z) on the drawn ground. */
  private readonly trail: Float32Array;
  private readonly count: Uint8Array;
  private readonly hint: Int32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly dead: Uint8Array;
  /** Where each particle is now, on the unit sphere. */
  private readonly pos: Float32Array;
  private readonly lift: Float32Array;
  private sinceSample = 0;
  private readonly aA: Float32Array;
  private readonly aB: Float32Array;
  private readonly aT: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  readonly width = { value: 1.6 };

  constructor(max: number, colour: THREE.Color, pxRatio: { value: number }, resolution: { value: THREE.Vector2 }) {
    this.max = max;
    this.trail = new Float32Array(max * TRAIL * 3);
    this.count = new Uint8Array(max);
    this.hint = new Int32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.dead = new Uint8Array(max).fill(1);
    this.pos = new Float32Array(max * 3);
    this.lift = new Float32Array(max);
    // Each segment of each trail is a quad: four corners, each knowing both ends of its segment.
    const segs = max * (TRAIL - 1), verts = segs * 4;
    this.aA = new Float32Array(verts * 3);
    this.aB = new Float32Array(verts * 3);
    this.aT = new Float32Array(verts * 2);
    const corner = new Float32Array(verts * 2), index = new Uint32Array(segs * 6);
    for (let s = 0; s < segs; s++) {
      for (let c = 0; c < 4; c++) { corner[(s * 4 + c) * 2] = c < 2 ? 0 : 1; corner[(s * 4 + c) * 2 + 1] = c % 2 ? 1 : -1; }
      index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3], s * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.aA, 3));
    g.setAttribute('aB', new THREE.BufferAttribute(this.aB, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(this.aT, 2));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    this.geometry = g;
    this.object = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // (Drawn over the ground, not tested against it, since it's laid on it as a cut is; on the far side of the world it fades away.)
      depthTest: false,
      // (Each ribbon's quads face whichever way their segment runs: drawn from both sides.)
      side: THREE.DoubleSide,
      uniforms: { uColour: { value: colour }, uWidth: this.width, uPx: pxRatio, uRes: resolution },
      vertexShader: /* glsl */ `
        attribute vec3 aB;
        attribute vec2 aT;
        attribute vec2 aCorner;
        uniform float uWidth, uPx;
        uniform vec2 uRes;
        varying float vAcross, vFade;
        void main() {
          vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0), b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
          vec2 sa = a.xy / a.w * uRes, sb = b.xy / b.w * uRes, d = sb - sa;
          float l = length(d);
          vec2 n = l > 1e-4 ? vec2(-d.y, d.x) / l : vec2(0.0);
          // Along the trail, from its head (0) to its tail (1): widest at the head, a hair at the tail, and fading.
          float t = mix(aT.x, aT.y, aCorner.x);
          float w = uWidth * uPx * (1.0 - 0.8 * t) * 0.5 + 0.6;
          vec4 p = mix(a, b, aCorner.x);
          p.xy += n * aCorner.y * w / uRes * p.w;
          gl_Position = p;
          vAcross = aCorner.y * w;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFade = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.2, dot(normalize(normalMatrix * position), normalize(-mv.xyz)));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColour;
        uniform float uWidth, uPx;
        varying float vAcross, vFade;
        void main() {
          float w = max(abs(vAcross), 0.0);
          gl_FragColor = vec4(uColour, vFade * clamp(1.0 - (abs(vAcross) - (uWidth * uPx * 0.5 - 0.5)), 0.0, 1.0));
          #include <colorspace_fragment>
        }`,
    }));
    this.object.renderOrder = 3;
    this.object.frustumCulled = false;
  }

  /**
   * Move the streaks on by `dt` seconds: each particle carried by the field; dead ones (no lava, too
   * slow, or old) let their trails shrink away; and new ones started where `spawn` says, up to `want`.
   */
  update(dt: number, field: Field, spawn: () => { x: number; y: number; z: number; hint: number } | null, want: number): void {
    let living = 0;
    for (let i = 0; i < this.max; i++) if (!this.dead[i]) living++;
    for (let i = 0; i < this.max && living < want; i++) {
      if (!this.dead[i] || this.count[i] > 0) continue;
      const s = spawn();
      if (!s) break;
      this.pos.set([s.x, s.y, s.z], i * 3);
      this.hint[i] = s.hint; this.dead[i] = 0; this.age[i] = 0; this.life[i] = 2.5 + Math.random() * 3; this.count[i] = 0;
      living++;
    }
    this.sinceSample += dt;
    const sample = this.sinceSample >= 1 / 12;
    if (sample) this.sinceSample = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * 3;
      if (!this.dead[i]) {
        const f = field.at(this.pos[o], this.pos[o + 1], this.pos[o + 2], this.hint[i]);
        this.hint[i] = f.hint;
        this.age[i] += dt;
        const speed = Math.hypot(f.vx, f.vy, f.vz);
        if (!f.alive || this.age[i] > this.life[i] || speed < 0.0015) this.dead[i] = 1;
        else {
          let x = this.pos[o] + f.vx * dt, y = this.pos[o + 1] + f.vy * dt, z = this.pos[o + 2] + f.vz * dt;
          const r = Math.hypot(x, y, z) || 1;
          x /= r; y /= r; z /= r;
          this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
          this.lift[i] = f.lift;
        }
      }
      if (!sample) continue;
      // Each sample: the trail moves up a place, and the head is where the particle is now (or, if
      // it's dead, the tail shortens instead, so the streak runs out rather than vanishing).
      const t = i * TRAIL * 3;
      if (this.dead[i]) { if (this.count[i] > 0) this.count[i]--; continue; }
      this.trail.copyWithin(t + 3, t, t + (TRAIL - 1) * 3);
      const k = this.lift[i];
      this.trail[t] = this.pos[o] * k; this.trail[t + 1] = this.pos[o + 1] * k; this.trail[t + 2] = this.pos[o + 2] * k;
      if (this.count[i] < TRAIL) this.count[i]++;
    }
    // The ribbons: each segment of each trail that's there; the rest folded away to nothing.
    const A = this.aA, B = this.aB, T = this.aT;
    for (let i = 0; i < this.max; i++) {
      const t = i * TRAIL * 3, n = this.count[i];
      for (let s = 0; s < TRAIL - 1; s++) {
        const q = (i * (TRAIL - 1) + s) * 4;
        const on = s + 1 < n;
        for (let c = 0; c < 4; c++) {
          const v = (q + c) * 3;
          if (on) {
            A[v] = this.trail[t + s * 3]; A[v + 1] = this.trail[t + s * 3 + 1]; A[v + 2] = this.trail[t + s * 3 + 2];
            B[v] = this.trail[t + s * 3 + 3]; B[v + 1] = this.trail[t + s * 3 + 4]; B[v + 2] = this.trail[t + s * 3 + 5];
            T[(q + c) * 2] = s / (TRAIL - 1); T[(q + c) * 2 + 1] = (s + 1) / (TRAIL - 1);
          } else { A[v] = A[v + 1] = A[v + 2] = B[v] = B[v + 1] = B[v + 2] = 0; }
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aB.needsUpdate = true;
    this.geometry.attributes.aT.needsUpdate = true;
  }
}
