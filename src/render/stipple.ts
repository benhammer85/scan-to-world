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

export const STIPPLE = {
  /** Dots per unit of area. */
  density: 70000,
  /** A dot's size, in pixels on a phone-sharp screen. */
  size: 2.1,
};

/** Dots over these triangles (xyz triples, three to a triangle). */
export function stippleDots(tris: number[], density = STIPPLE.density): number[] {
  const out: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const a = tris.slice(i, i + 3), b = tris.slice(i + 3, i + 6), c = tris.slice(i + 6, i + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    const seed = Math.round(a[0] * 7919 + a[1] * 104729 + a[2] * 1299709);
    const want = area * density, n = Math.floor(want) + (rand(seed, 0) < want - Math.floor(want) ? 1 : 0);
    for (let k = 1; k <= n; k++) {
      let s = rand(seed, k * 2), t = rand(seed, k * 2 + 1);
      if (s + t > 1) { s = 1 - s; t = 1 - t; }
      out.push(a[0] + u[0] * s + v[0] * t, a[1] + u[1] * s + v[1] * t, a[2] + u[2] * s + v[2] * t);
    }
  }
  return out;
}

function rand(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class Stipple {
  readonly object: THREE.Points;
  constructor(ink: string) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uInk: { value: new THREE.Color(ink) }, uSize: { value: STIPPLE.size * Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: /* glsl */ `
        uniform float uSize;
        varying float vRim;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * v;
          // Finer from further off, so a town far away is a grey of dots, not a black blot.
          gl_PointSize = uSize * clamp(2.6 / -v.z, 0.5, 1.3);
          vRim = rimFade(position, v);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uInk;
        varying float vRim;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          if (dot(d, d) > 0.25 || vRim <= 0.0) discard;
          gl_FragColor = vec4(uInk, vRim);
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Points(new THREE.BufferGeometry(), material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  set(dots: number[]): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dots), 3));
    this.object.geometry.dispose();
    this.object.geometry = g;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
