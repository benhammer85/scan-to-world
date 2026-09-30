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

/**
 * The mark each point is drawn as. A dot by default; the others are the conventional signs of
 * the old survey maps, drawn in fine ink: a small circle (woods), a cross (rocks, reefs), a short
 * dash (grass), a marsh tuft (three ticks on a line), and a caret (heights, heath).
 */
export type Sign = 'dot' | 'ring' | 'cross' | 'dash' | 'tuft' | 'caret';
const SIGNS: Sign[] = ['dot', 'ring', 'cross', 'dash', 'tuft', 'caret'];

export class Stipple {
  readonly object: THREE.Points;
  /** @param size a sign's size in CSS pixels (a dot's is `STIPPLE.size`) */
  constructor(ink: string, sign: Sign = 'dot', size: number = STIPPLE.size) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      defines: { SIGN: SIGNS.indexOf(sign) },
      uniforms: { uInk: { value: new THREE.Color(ink) }, uSize: { value: size * Math.min(2, window.devicePixelRatio || 1) }, uNow: { value: 0 }, uAppear: { value: STIPPLE.appear } },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uNow;
        uniform float uAppear;
        attribute float aBorn;
        varying float vRim;
        varying float vSize;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * v;
          // Finer from further off, so a town far away is a grey of dots, not a black blot.
          gl_PointSize = uSize * clamp(2.6 / -v.z, 0.5, 1.3);
          vSize = gl_PointSize;
          gl_PointSize += 1.0; // room for the soft edge
          // A new dot comes in slowly, as light does when a place grows: never all at once.
          vRim = rimFade(position, v) * smoothstep(0.0, uAppear, uNow - aBorn);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uInk;
        varying float vRim;
        varying float vSize;
        float segment(vec2 p, vec2 a, vec2 b) {
          vec2 pa = p - a, ba = b - a;
          return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
        }
        void main() {
          // In pixels from the middle of the mark; the point is a pixel larger than the mark, for its soft edge.
          vec2 p = (gl_PointCoord - 0.5) * (vSize + 1.0);
          #if SIGN == 0
          // A round dot with a soft edge a pixel wide, so the stipple is smooth at any size, not stepped.
          float cover = clamp(vSize * 0.5 - length(p) + 0.5, 0.0, 1.0);
          #else
          // A sign in a fine line, its distance from the line fading to nothing over a pixel.
          float R = vSize * 0.42, w = max(0.55, vSize * 0.07), d;
          #if SIGN == 1
          w = max(0.8, vSize * 0.09); // a small circle needs a firmer line to be seen at all
          d = abs(length(p) - R * 0.75);
          #elif SIGN == 2
          d = min(segment(p, vec2(-R, 0.0), vec2(R, 0.0)), segment(p, vec2(0.0, -R), vec2(0.0, R)));
          #elif SIGN == 3
          d = segment(p, vec2(-R, 0.0), vec2(R, 0.0));
          #elif SIGN == 4
          d = min(segment(p, vec2(-R, R * 0.45), vec2(R, R * 0.45)),
              min(segment(p, vec2(0.0, R * 0.45), vec2(0.0, -R * 0.55)),
              min(segment(p, vec2(-R * 0.6, R * 0.45), vec2(-R * 0.75, -R * 0.25)), segment(p, vec2(R * 0.6, R * 0.45), vec2(R * 0.75, -R * 0.25)))));
          #else
          d = min(segment(p, vec2(-R * 0.8, R * 0.4), vec2(0.0, -R * 0.45)), segment(p, vec2(0.0, -R * 0.45), vec2(R * 0.8, R * 0.4)));
          #endif
          float cover = clamp(w + 0.5 - d, 0.0, 1.0);
          #endif
          if (cover <= 0.0 || vRim <= 0.0) discard;
          gl_FragColor = vec4(uInk, vRim * cover);
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
