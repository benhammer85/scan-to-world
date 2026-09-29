/**
 * Stand-in "scan" so the prototype runs before you have a real one: a slightly
 * oblate, lumpy sphere with peel dimples and a navel, vertex-coloured orange.
 * Replace it with a real Scaniverse/KIRI export via the file picker.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function makeDemoOrange(detail = 23): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);

  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const peel = new THREE.Color('#f28a1e');
  const deep = new THREE.Color('#c85d0c');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const lumps = 0.07 * fbm(v.x * 1.6, v.y * 1.6, v.z * 1.6, 3);
    const dimples = 0.008 * noise3(v.x * 28, v.y * 28, v.z * 28);
    const navel = -0.06 * Math.exp(-((1 - v.y) ** 2) / 0.002);
    const stem = 0.03 * Math.exp(-((1 + v.y) ** 2) / 0.001);
    const r = 1 + lumps + dimples + navel + stem;
    pos.setXYZ(i, v.x * r * 1.03, v.y * r * 0.94, v.z * r * 1.03);
    c.copy(deep).lerp(peel, THREE.MathUtils.clamp(0.5 + lumps * 6 + dimples * 20, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Small self-contained value noise so the demo has no extra dependencies.
function hash(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), fx), lerp(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), fx), lerp(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
    fz,
  );
}

function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    amp *= 0.5; x *= 2; y *= 2; z *= 2;
  }
  return sum / norm;
}
