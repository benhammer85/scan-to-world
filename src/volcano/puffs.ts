/**
 * Puffs: steam where lava meets the sea, ash thrown up by a burst, and the smoke of a vent under
 * pressure, each a billow drawn as a print draws smoke: a lumpy shape in two flat tones (lit above,
 * shadowed beneath, the shadow warmed red by lava below it while it's young), growing as it rises,
 * overlapping its neighbours into a plume, and at the end breaking up into specks rather than
 * fading. (They were fine dots of stipple, rising in strings, which looked like beads.) Embers, and
 * the dust a storm drives, stay dots. A fixed number of them, reused in turn, so there's never more
 * than the page can bear.
 */
import * as THREE from 'three';
import { rimGlsl } from '../render/rim';

export type PuffKind = 'steam' | 'ash' | 'smoke' | 'ember' | 'dust';

const TINT: Record<PuffKind, number> = { steam: 0, ash: 1, smoke: 2, ember: 3, dust: 4 };
const MOST = 1200;

interface Puff { alive: boolean; age: number; life: number; x: number; y: number; z: number; ux: number; uy: number; uz: number; rise: number; size: number; grow: number; kind: number; nx: number; ny: number; nz: number; vz: number; warm: number }

export class Puffs {
  readonly object: THREE.Points;
  /** Lighter smoke, and no red beneath it (the quiet print). */
  calm = false;
  private puffs: Puff[] = [];
  private nextSlot = 0;
  private position = new Float32Array(MOST * 3);
  private alpha = new Float32Array(MOST);
  private size = new Float32Array(MOST);
  private tint = new Float32Array(MOST);
  private seed = new Float32Array(MOST);
  private life = new Float32Array(MOST);
  private warmth = new Float32Array(MOST);

  constructor(pixelRatio: number) {
    for (let i = 0; i < MOST; i++) this.puffs.push({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, ux: 0, uy: 0, uz: 0, rise: 0, size: 0, grow: 0, kind: 0, nx: 0, ny: 0, nz: 0, vz: 0, warm: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aWarm', new THREE.BufferAttribute(this.warmth, 1));
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
        attribute float aLife;
        attribute float aWarm;
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        varying float vLife;
        varying float vWarm;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * v;
          gl_PointSize = aSize * uScale / -v.z;
          vAlpha = aAlpha * rimFade(position, v);
          vTint = aTint;
          vSeed = aSeed;
          vPx = gl_PointSize;
          vLife = aLife;
          vWarm = aWarm;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        varying float vLife;
        varying float vWarm;
        // (Hashed without sin, which phones work out roughly.)
        float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y);
        }
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * 2.0;
          if (vTint > 2.5) {
            // Embers and dust: a round dot with a soft edge a pixel wide, a touch larger or smaller by its own seed.
            float r = vPx * 0.5 * (0.75 + 0.25 * vSeed);
            float a = vAlpha * clamp(r - length(q) * vPx * 0.5 + 0.5, 0.0, 1.0);
            if (a <= 0.01) discard;
            gl_FragColor = vec4(vTint < 3.5 ? vec3(0.91, 0.47, 0.18) : vec3(0.24, 0.18, 0.14), a);
          } else {
            // A billow: its edge lumpy, the lumps turning slowly as it rises.
            float d = length(q), ang = atan(q.y, q.x), t = vLife * 4.0;
            vec2 ca = vec2(cos(ang), sin(ang));
            float lump = n2(ca * 1.3 + vSeed * 17.0 + t * 0.3) * 0.7 + n2(ca * 3.6 + vSeed * 5.0 - t * 0.5) * 0.3; // (broad lobes, as a cauliflower's)
            float edge = 0.45 + 0.5 * lump, aa = 2.5 / max(vPx, 1.0);
            float cover = 1.0 - smoothstep(edge - aa, edge + aa, d);
            // A fringe of halftone dots beyond its edge, thinning outward, so it's vapour and not a stone.
            vec2 cell = gl_PointCoord * vPx / 3.2, cf = fract(cell) - 0.5;
            float fr = (d - edge) / max(1.0 - edge, 0.05), dotR = 0.42 * (1.0 - fr) * step(0.0, fr);
            float fringe = (1.0 - smoothstep(dotR - 0.15, dotR + 0.15, length(cf))) * step(h2(floor(cell) + vSeed * 13.0), 0.6) * 0.7;
            cover = max(cover, fringe * 0.8);
            // Lit from above and to the left (as the world is), shadowed beneath: two flat tones.
            float lit = 1.0 - smoothstep(edge * 0.74 - aa, edge * 0.74 + aa, length(q - vec2(-0.2, -0.28)) + 0.18 * (n2(q * 3.0 + vSeed * 9.0) - 0.5));
            // Old, it breaks up into specks of paper, as worn ink does, rather than fading.
            float g = h2(floor(gl_PointCoord * vPx / 1.7) + vSeed * 91.0);
            cover *= step(smoothstep(0.45, 1.0, vLife) * 0.97, g);
            float a = vAlpha * cover;
            if (a <= 0.01) discard;
            vec3 shade = vTint < 0.5 ? vec3(0.32, 0.42, 0.5) : vTint < 1.5 ? vec3(0.06, 0.05, 0.05) : vec3(0.17, 0.15, 0.15);
            vec3 light = vTint < 0.5 ? vec3(0.72, 0.78, 0.8) : vTint < 1.5 ? vec3(0.26, 0.23, 0.21) : vec3(0.56, 0.5, 0.44);
            vec3 c = mix(shade, light, lit);
            // Young, over lava, its underside is lit red from below.
            c = mix(c, vec3(0.26, 0.035, 0.015), 0.75 * vWarm * (1.0 - lit) * (1.0 - smoothstep(0.03, 0.22, vLife))); // (only the youngest, and only beneath: more turned them pink)
            gl_FragColor = vec4(c, a);
          }
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
  add(kind: PuffKind, x: number, y: number, z: number, strength = 1, rand = Math.random, dir?: { x: number; y: number; z: number }, warm = 0): void {
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
    p.warm = this.calm ? 0 : warm;
    this.seed[this.nextSlot === 0 ? MOST - 1 : this.nextSlot - 1] = rand();
    if (kind === 'steam') { p.life = 2.6 + rand(); p.rise = 0.035; p.size = 0.03 + 0.02 * rand(); p.grow = 0.1; }
    else if (kind === 'ash') { p.life = 5 + rand() * 3; p.rise = 0.14 * strength * (0.6 + rand() * 0.8); p.size = 0.05 + 0.04 * rand(); p.grow = 0.2 + 0.12 * rand(); }
    else if (kind === 'dust') { p.life = 4 + rand() * 3; p.rise = 0.06 * strength; p.size = 0.0035 + 0.0015 * strength; p.grow = 0.002; }
    else if (kind === 'ember') {
      // Thrown up from the vent, out to one side, and falling back: an arc, not a drift.
      p.nx = x / l; p.ny = y / l; p.nz = z / l;
      const t = { x: p.ny * 0.3 - p.nz * 0.7, y: p.nz * 0.5 - p.nx * 0.3, z: p.nx * 0.7 - p.ny * 0.5 };
      const a = rand() * Math.PI * 2, b = { x: p.ny * t.z - p.nz * t.y, y: p.nz * t.x - p.nx * t.z, z: p.nx * t.y - p.ny * t.x };
      const tl = Math.hypot(t.x, t.y, t.z) || 1, bl = Math.hypot(b.x, b.y, b.z) || 1;
      p.ux = (t.x / tl) * Math.cos(a) + (b.x / bl) * Math.sin(a); p.uy = (t.y / tl) * Math.cos(a) + (b.y / bl) * Math.sin(a); p.uz = (t.z / tl) * Math.cos(a) + (b.z / bl) * Math.sin(a);
      p.rise = (0.02 + 0.05 * rand()) * strength;
      p.vz = (0.1 + 0.12 * rand()) * strength;
      p.life = 1.4 + rand() * 1.2; p.size = 0.0032 + 0.002 * rand(); p.grow = -0.001;
    }
    else { p.life = 4.5 + rand() * 3; p.rise = (0.1 + 0.06 * rand()) * strength; p.size = 0.008 + 0.006 * rand(); p.grow = 0.18 + 0.1 * strength; }
  }

  update(dt: number): void {
    for (let i = 0; i < MOST; i++) {
      const p = this.puffs[i];
      if (!p.alive) { this.alpha[i] = 0; continue; }
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.alpha[i] = 0; continue; }
      if (p.kind === 3) {
        // An ember: out and up, and gravity bringing it back down.
        p.vz -= 0.2 * dt;
        p.x += (p.ux * p.rise + p.nx * p.vz) * dt; p.y += (p.uy * p.rise + p.ny * p.vz) * dt; p.z += (p.uz * p.rise + p.nz * p.vz) * dt;
      } else {
        // Rising, and slowing as it goes, as a column does once the heat has left it.
        const slow = Math.exp(-p.age * (p.kind === 2 ? 0.18 : 0.45)); // (smoke keeps rising, so the column stands tall)
        p.x += p.ux * p.rise * slow * dt; p.y += p.uy * p.rise * slow * dt; p.z += p.uz * p.rise * slow * dt;
      }
      const f = p.age / p.life;
      this.position[i * 3] = p.x; this.position[i * 3 + 1] = p.y; this.position[i * 3 + 2] = p.z;
      this.size[i] = p.size + p.grow * f;
      // Coming in quickly, then fading slowly as it thins; smoke the strongest, so a wisp is seen.
      // (Billows come in quickly and then hold their tone, breaking up at the end in the shader; dots fade.)
      this.alpha[i] = (this.calm && p.kind !== 3 ? 0.6 : 1) * (p.kind === 3 ? 0.95 * (1 - f) ** 0.7 : p.kind === 4 ? 0.7 * Math.min(1, f * 5) * (1 - f) ** 1.2 : (p.kind === 1 ? 0.85 : p.kind === 0 ? 0.6 : 0.72) * Math.min(1, f * (p.kind === 2 ? 3 : 8))); // (smoke leaves the vent a faint wisp, not a ball)
      this.tint[i] = p.kind;
      this.life[i] = f;
      this.warmth[i] = p.warm;
    }
    const g = this.object.geometry;
    for (const name of ['position', 'aAlpha', 'aSize', 'aTint', 'aSeed', 'aLife', 'aWarm']) g.getAttribute(name).needsUpdate = true;
  }
}
