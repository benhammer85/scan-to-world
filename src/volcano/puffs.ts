/**
 * Puffs: steam where lava meets the sea, ash thrown up by a burst, and the
 * thin smoke of a vent under pressure. Each is a short wavy stroke of the pen,
 * as the old engraved maps drew smoke curling up from a volcano, drifting
 * slowly up, lengthening and fading; a few together read as a wisp. A fixed number of them, reused
 * in turn, so there's never more than the page can bear.
 */
import * as THREE from 'three';
import { rimGlsl } from '../render/rim';

export type PuffKind = 'steam' | 'ash' | 'smoke';

const TINT: Record<PuffKind, number> = { steam: 0, ash: 1, smoke: 2 };
const MOST = 700;

interface Puff { alive: boolean; age: number; life: number; x: number; y: number; z: number; ux: number; uy: number; uz: number; rise: number; size: number; grow: number; kind: number }

export class Puffs {
  readonly object: THREE.Points;
  private puffs: Puff[] = [];
  private nextSlot = 0;
  private position = new Float32Array(MOST * 3);
  private alpha = new Float32Array(MOST);
  private size = new Float32Array(MOST);
  private tint = new Float32Array(MOST);
  private seed = new Float32Array(MOST);

  constructor(pixelRatio: number) {
    for (let i = 0; i < MOST; i++) this.puffs.push({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, ux: 0, uy: 0, uz: 0, rise: 0, size: 0, grow: 0, kind: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Drawn over the map, as an engraver draws smoke over the land it rises from, rather than
      // lost behind the slope it drifts up (the far side of the world fades it away regardless).
      depthTest: false,
      uniforms: { uScale: { value: 900 * pixelRatio } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aAlpha;
        attribute float aSize;
        attribute float aTint;
        attribute float aSeed;
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * v;
          gl_PointSize = aSize * uScale / -v.z;
          vAlpha = aAlpha * rimFade(position, v);
          vTint = aTint;
          vSeed = aSeed;
          vPx = gl_PointSize;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        void main() {
          // A short wavy stroke across the point, one crest up and one down (which way, and how
          // deep, its own), in a fine line fading at its edges over about a pixel.
          vec2 q = (gl_PointCoord - 0.5) * 2.0;
          float x = clamp(q.x, -0.8, 0.8);
          float amp = (0.12 + 0.1 * fract(vSeed * 3.7)) * (vSeed > 0.5 ? 1.0 : -1.0);
          float y = amp * sin(x * 3.927);
          float d = length(vec2(q.x - x, -q.y - y)) * vPx * 0.5;
          float line = clamp(0.9 - d, 0.0, 1.0);
          float a = vAlpha * line;
          if (a <= 0.01) discard;
          // Steam in the sea's blue ink, ash and smoke in sepia.
          vec3 c = vTint < 0.5 ? vec3(0.36, 0.49, 0.6) : vTint < 1.5 ? vec3(0.23, 0.17, 0.12) : vec3(0.35, 0.28, 0.22);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Points(g, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  /**
   * A puff at a point on the ground (in the planet's frame), rising along its up; or, given a
   * way to drift (`dir`, in the same frame), mostly that way, as smoke drawn on a map goes up the page.
   */
  add(kind: PuffKind, x: number, y: number, z: number, strength = 1, rand = Math.random, dir?: { x: number; y: number; z: number }): void {
    const p = this.puffs[this.nextSlot];
    this.nextSlot = (this.nextSlot + 1) % MOST;
    const l = Math.hypot(x, y, z) || 1;
    // Up, tipped a little at random, so a column of them spreads as it goes.
    const d = dir ?? { x: 0, y: 0, z: 0 }, lean = dir ? 1.6 : 0;
    p.ux = x / l * 0.4 + d.x * lean + (rand() - 0.5) * 0.5; p.uy = y / l * 0.4 + d.y * lean + (rand() - 0.5) * 0.5; p.uz = z / l * 0.4 + d.z * lean + (rand() - 0.5) * 0.5;
    const ul = Math.hypot(p.ux, p.uy, p.uz); p.ux /= ul; p.uy /= ul; p.uz /= ul;
    p.x = x; p.y = y; p.z = z;
    p.alive = true;
    p.age = 0;
    p.kind = TINT[kind];
    this.seed[this.nextSlot === 0 ? MOST - 1 : this.nextSlot - 1] = rand();
    if (kind === 'steam') { p.life = 2.2 + rand(); p.rise = 0.035; p.size = 0.012; p.grow = 0.02; }
    else if (kind === 'ash') { p.life = 5 + rand() * 3; p.rise = 0.14 * strength * (0.6 + rand() * 0.8); p.size = 0.018; p.grow = 0.03; }
    else { p.life = 4.5 + rand() * 1.5; p.rise = 0.035 * strength; p.size = 0.012 + 0.006 * strength; p.grow = 0.02 * strength; }
  }

  update(dt: number): void {
    for (let i = 0; i < MOST; i++) {
      const p = this.puffs[i];
      if (!p.alive) { this.alpha[i] = 0; continue; }
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.alpha[i] = 0; continue; }
      // Rising, and slowing as it goes, as a column does once the heat has left it.
      const slow = Math.exp(-p.age * 0.6);
      p.x += p.ux * p.rise * slow * dt; p.y += p.uy * p.rise * slow * dt; p.z += p.uz * p.rise * slow * dt;
      const f = p.age / p.life;
      this.position[i * 3] = p.x; this.position[i * 3 + 1] = p.y; this.position[i * 3 + 2] = p.z;
      this.size[i] = p.size + p.grow * f;
      this.alpha[i] = (p.kind === 1 ? 0.6 : p.kind === 0 ? 0.45 : 0.5) * Math.min(1, f * 6) * (1 - f) ** 1.5;
      this.tint[i] = p.kind;
    }
    const g = this.object.geometry;
    for (const name of ['position', 'aAlpha', 'aSize', 'aTint', 'aSeed']) g.getAttribute(name).needsUpdate = true;
  }
}
