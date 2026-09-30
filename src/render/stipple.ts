/**
 * Stipple: a town drawn as the small-scale survey maps drew built-up
 * ground, in dots instead of buildings. Each building's ground is dotted at
 * an even density, so a hamlet is a few dots and a city a dark field of
 * them, and development reads as density, not as little houses.
 *
 * The dots are placed by a fixed rule of where they are, so a town that
 * grows keeps its old dots and gains new ones: nothing shimmers.
 */
import * as THREE from 'three';
import { rimGlsl } from './rim';
import { STIPPLE } from './stippleDots';

// Where the dots go is worked out apart from the drawing, so it can be done off the main thread.
export { STIPPLE, stippleDots } from './stippleDots';

import { MIRRORS, signGlsl, type Sign } from './signs';
export type { Sign } from './signs';

export class Stipple {
  readonly object: THREE.Points;
  /**
   * @param size a sign's size in CSS pixels (a dot's is `STIPPLE.size`)
   * @param vary for living things: each sign drawn its own way, as a hand draws, by where it stands:
   *   one of the sign's shapes, a little larger or smaller, leaning a little, some mirrored, and
   *   its colour somewhere between `ink` and `ink2`, lighter or darker. Otherwise every mark alike.
   */
  constructor(ink: string, sign: Sign = 'dot', size: number = STIPPLE.size, vary: { ink2?: string } | null = null) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      defines: { DOT: sign === 'dot' ? 1 : 0, MIRROR: MIRRORS[sign] ? 1 : 0, VARY: vary ? 1 : 0 },
      uniforms: { uInk: { value: new THREE.Color(ink) }, uInk2: { value: new THREE.Color(vary?.ink2 ?? ink) }, uSize: { value: size * Math.min(2, window.devicePixelRatio || 1) }, uNow: { value: 0 }, uAppear: { value: STIPPLE.appear } },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uNow;
        uniform float uAppear;
        attribute float aBorn;
        varying float vRim;
        varying float vSize;
        varying float vFlip;
        varying vec4 vWay;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * v;
          // Finer from further off, so a town far away is a grey of dots, not a black blot.
          gl_PointSize = uSize * clamp(2.6 / -v.z, 0.5, 1.3);
          // Each sign a little its own, by where it stands: a touch larger or smaller, and some the other way round.
          float h = fract(sin(dot(position, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          #if VARY == 1
          gl_PointSize *= DOT == 1 ? 0.55 + 0.9 * h : 0.72 + 0.56 * h;
          #elif DOT == 0
          gl_PointSize *= 0.82 + 0.36 * h;
          #endif
          vFlip = MIRROR == 1 && fract(h * 7.0) > 0.5 ? -1.0 : 1.0;
          // Which of its shapes, how far it leans, where between its two inks, how light: each its own.
          vWay = vec4(fract(h * 13.7), (fract(h * 31.3) - 0.5) * 0.45, fract(h * 57.1), fract(h * 91.9));
          vSize = gl_PointSize;
          gl_PointSize += 1.0; // room for the soft edge
          // A new dot comes in slowly, as light does when a place grows: never all at once.
          vRim = rimFade(position, v) * smoothstep(0.0, uAppear, uNow - aBorn);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uInk;
        uniform vec3 uInk2;
        varying float vRim;
        varying float vSize;
        varying float vFlip;
        varying vec4 vWay;
        float segment(vec2 p, vec2 a, vec2 b) {
          vec2 pa = p - a, ba = b - a;
          return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
        }
        void main() {
          // In pixels from the middle of the mark; the point is a pixel larger than the mark, for its soft edge.
          vec2 p = (gl_PointCoord - 0.5) * (vSize + 1.0);
          #if DOT == 1
          // A round dot with a soft edge a pixel wide, so the stipple is smooth at any size, not stepped.
          float cover = clamp(vSize * 0.5 - length(p) + 0.5, 0.0, 1.0);
          #else
          // A sign in a fine line, its distance from the strokes fading to nothing over a pixel.
          // (The strokes are in a box from -1 to 1, y up; the point's y runs down.)
          float R = vSize * 0.44, w = max(0.6, vSize * 0.06);
          vec2 q = vec2(p.x * vFlip, -p.y) / R;
          float way = 0.0;
          #if VARY == 1
          way = vWay.x;
          float c = cos(vWay.y), s = sin(vWay.y);
          q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
          w *= 0.8 + 0.45 * vWay.w;
          #endif
          float d = 1e9;
          ${signGlsl(sign, 'q', 'way')}
          float cover = clamp(w + 0.5 - d * R, 0.0, 1.0);
          #endif
          if (cover <= 0.0 || vRim <= 0.0) discard;
          vec3 ink = uInk;
          #if VARY == 1
          ink = mix(uInk, uInk2, vWay.z) * (0.85 + 0.3 * vWay.w);
          #endif
          gl_FragColor = vec4(ink, vRim * cover);
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Points(new THREE.BufferGeometry(), material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  private clock = 0;
  /** When each dot (by where it is, as one number) first came: it keeps that however often the dots are set again. */
  private bornAt = new Map<number, number>();

  update(dt: number): void {
    this.clock += dt;
    (this.object.material as THREE.ShaderMaterial).uniforms.uNow.value = this.clock;
  }

  /** Know a dot by its direction from the middle rather than where it is, so it keeps its age as the ground rises and wears under it. */
  byDirection = false;

  set(dots: ArrayLike<number>): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dots instanceof Float32Array ? dots : new Float32Array(dots), 3));
    const born = new Float32Array(dots.length / 3), next = new Map<number, number>();
    for (let i = 0; i < born.length; i++) {
      // Where it is, to a 4096th, packed into one number (exact: well under 2^53), so no strings are made.
      const l = this.byDirection ? Math.hypot(dots[i * 3], dots[i * 3 + 1], dots[i * 3 + 2]) || 1 : 1;
      const key = ((Math.round(dots[i * 3] / l * 4096) + 16384) * 32768 + (Math.round(dots[i * 3 + 1] / l * 4096) + 16384)) * 32768 + (Math.round(dots[i * 3 + 2] / l * 4096) + 16384);
      const when = this.bornAt.get(key) ?? this.clock;
      next.set(key, when);
      born[i] = when;
    }
    this.bornAt = next;
    g.setAttribute('aBorn', new THREE.BufferAttribute(born, 1));
    this.object.geometry.dispose();
    this.object.geometry = g;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
