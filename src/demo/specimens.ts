/**
 * Specimens: ready-made objects to make worlds of until you scan your own.
 * Each is a solid described by its signed distance (negative inside), meshed
 * by surface nets into one closed, welded surface, so the terrain, water and
 * towns treat it exactly as they would a scan. Coloured as the thing is:
 * the paper takes a little of that colour, as it does from a scan.
 */
import * as THREE from 'three';
import { makeDemoOrange } from './orange';
import type { HeightMode } from '../terrain/heightfield';

export interface Specimen {
  id: string;
  /** Its caption on the plate, as an old natural history plate would have it. */
  caption: string;
  make: () => THREE.BufferGeometry;
  /**
   * How its shape becomes altitude, where the object's own choice is wrong for
   * it: a smooth pebble or duck has no bumps for curvature to find, and came
   * out as stripes of water and a body all snow. Height from the middle suits them.
   */
  mode?: HeightMode;
}

type V = [number, number, number];
type Sdf = (x: number, y: number, z: number) => number;

export const SPECIMENS: Specimen[] = [
  { id: 'orange', caption: 'An Orange', make: () => makeDemoOrange() },
  { id: 'brick', caption: 'A Toy Brick', make: brick },
  { id: 'chopstick', caption: 'A Chopstick', make: chopstick, mode: 'radial' },
  { id: 'pistachio', caption: 'A Pistachio', make: pistachio },
  { id: 'pebble', caption: 'A River Pebble', make: pebble, mode: 'radial' },
  { id: 'duck', caption: 'A Bath Duck', make: duck, mode: 'radial' },
];

// ------------------------------------------------------------ the specimens

/** A two-by-four toy brick: a slightly rounded block, eight studs on top, a little moulded give at every edge. */
function brick(): THREE.BufferGeometry {
  const body: Sdf = (x, y, z) => roundBox(x, y, z, 2, 0.6, 1, 0.08);
  const studs: Sdf = (x, y, z) => {
    let d = Infinity;
    for (const sx of [-1.5, -0.5, 0.5, 1.5]) for (const sz of [-0.5, 0.5]) d = Math.min(d, roundCylinderY(x - sx, y - 0.72, z - sz, 0.3, 0.14, 0.04));
    return d;
  };
  const sdf: Sdf = (x, y, z) => smoothMin(body(x, y, z), studs(x, y, z), 0.05);
  const red = new THREE.Color('#c8372d'), dark = new THREE.Color('#9e2820');
  return surfaceNets(sdf, [-2.2, -0.8, -1.2], [2.2, 1.0, 1.2], 0.035, (p) => (p[1] > 0.62 ? red : red.clone().lerp(dark, 0.3 + 0.2 * Math.sin(p[0] * 9))));
}

/** A wooden chopstick: square at the top, tapering round to its tip, with the grain in it. */
function chopstick(): THREE.BufferGeometry {
  const L = 2.4;
  const sdf: Sdf = (x, y, z) => {
    const t = Math.min(1, Math.max(0, (x + L / 2) / L)); // 0 at the top, 1 at the tip
    const r = 0.13 - 0.085 * t;
    // Square at the top, round at the tip.
    const n = 2 + 6 * (1 - t) ** 2, radial = (Math.abs(y) ** n + Math.abs(z) ** n) ** (1 / n);
    const grain = 0.004 * Math.sin(x * 40 + Math.sin(y * 30) * 2);
    const side = radial - r + grain;
    const ends = Math.abs(x) - L / 2;
    return Math.max(side, ends) - 0.004;
  };
  const wood = new THREE.Color('#c9a26b'), grain = new THREE.Color('#a57a44');
  return surfaceNets(sdf, [-1.3, -0.18, -0.18], [1.3, 0.18, 0.18], 0.012, (p) => wood.clone().lerp(grain, 0.5 + 0.5 * Math.sin(p[0] * 38 + p[1] * 60)));
}

/** A pistachio: its shell, gaping along the seam, and the green nut showing in the crack. A valley to settle. */
function pistachio(): THREE.BufferGeometry {
  const shell: Sdf = (x, y, z) => {
    // Plumper at one end, pointed at the other.
    const k = 1 + 0.18 * x;
    const e = ellipsoid(x, y / k, z / k, 1, 0.62, 0.68) * Math.min(1, k);
    // The seam, open along the top: widest in the middle, shut at the ends.
    const gap = 0.14 * Math.max(0, 1 - (x / 0.85) ** 2);
    const slit = Math.max(Math.abs(z) - gap, 0.1 - y);
    return Math.max(e, -slit);
  };
  const nut: Sdf = (x, y, z) => ellipsoid(x, y + 0.02, z, 0.86, 0.5, 0.55);
  const sdf: Sdf = (x, y, z) => Math.min(shell(x, y, z), nut(x, y, z));
  const husk = new THREE.Color('#dcc59a'), green = new THREE.Color('#8fa64a'), purple = new THREE.Color('#7a4a5a');
  return surfaceNets(sdf, [-1.15, -0.8, -0.85], [1.15, 0.8, 0.85], 0.03, (p) => {
    if (nut(p[0], p[1], p[2]) < 0.01 && shell(p[0], p[1], p[2]) > 0.005) return green.clone().lerp(purple, Math.max(0, p[1] - 0.25) * 2);
    return husk.clone().multiplyScalar(0.92 + 0.08 * Math.sin(p[0] * 20 + p[2] * 13));
  });
}

/** A river pebble: flattened, worn smooth, not quite even. */
function pebble(): THREE.BufferGeometry {
  const sdf: Sdf = (x, y, z) => ellipsoid(x, y, z, 1.2, 0.55, 0.9) - hills(x, y, z, 0.035);
  const grey = new THREE.Color('#8e8a82'), light = new THREE.Color('#b9b2a4');
  return surfaceNets(sdf, [-1.35, -0.7, -1.05], [1.35, 0.7, 1.05], 0.03, (p) => grey.clone().lerp(light, 0.5 + 0.5 * Math.sin(p[0] * 7 + p[2] * 4 + Math.sin(p[1] * 13))));
}

/** A bath duck: body, head, beak, a little upturned tail. */
function duck(): THREE.BufferGeometry {
  const body: Sdf = (x, y, z) => ellipsoid(x, y, z, 1, 0.62, 0.72) - 0.08 * Math.max(0, x - 0.6);
  const tail: Sdf = (x, y, z) => ellipsoid(x - 0.85, y - 0.25, z, 0.28, 0.2, 0.2);
  const head: Sdf = (x, y, z) => ellipsoid(x + 0.45, y - 0.75, z, 0.45, 0.43, 0.43);
  const beak: Sdf = (x, y, z) => ellipsoid(x + 0.92, y - 0.68, z, 0.26, 0.09, 0.17);
  const sdf: Sdf = (x, y, z) => smoothMin(smoothMin(smoothMin(body(x, y, z), tail(x, y, z), 0.15), head(x, y, z), 0.2), beak(x, y, z), 0.05) - hills(x, y, z, 0.018);
  const yellow = new THREE.Color('#f1c232'), orange = new THREE.Color('#e8792a'), eye = new THREE.Color('#1c1a17');
  return surfaceNets(sdf, [-1.3, -0.7, -0.8], [1.2, 1.25, 0.8], 0.028, (p) => {
    if (beak(p[0], p[1], p[2]) < 0.02) return orange;
    if (Math.hypot(p[0] + 0.72, p[1] - 0.88, Math.abs(p[2]) - 0.3) < 0.06) return eye;
    return yellow;
  });
}

/** Gentle rolling hills to lay over a smooth surface: a few waves of its own, never the same twice over. */
function hills(x: number, y: number, z: number, amount: number): number {
  return amount * (Math.sin(x * 3.1 + z * 2.3 + 0.7) * Math.cos(z * 2.7 - x * 1.3 + y) * 0.7
    + Math.sin(x * 5.3 - y * 4.1 + z * 3.7 + 1.9) * 0.35
    + Math.sin(x * 9.7 + y * 7.9 - z * 8.3) * 0.12);
}

// ------------------------------------------------------------ distance functions

function roundBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function roundCylinderY(x: number, y: number, z: number, r: number, h: number, round: number): number {
  const dx = Math.hypot(x, z) - r + round, dy = Math.abs(y) - h + round;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
}

/** An ellipsoid's distance, near enough (exact on its surface, and the right sign everywhere). */
function ellipsoid(x: number, y: number, z: number, a: number, b: number, c: number): number {
  const k0 = Math.hypot(x / a, y / b, z / c), k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b, c);
}

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

// ------------------------------------------------------------ surface nets

/**
 * Mesh the surface where `sdf` is zero, inside the box `lo`..`hi`, on a grid
 * `cell` apart. Surface nets: a vertex in every cell the surface passes
 * through, at the mean of its crossings, and a quad across every grid edge
 * the surface cuts. The result is closed and welded, as the topology needs.
 */
export function surfaceNets(sdf: Sdf, lo: V, hi: V, cell: number, colour: (p: V) => THREE.Color, most = MOST_TRIANGLES): THREE.BufferGeometry {
  // As fine as asked, but no finer than a phone can turn smoothly: coarser, and again, until it is.
  for (;;) {
    const g = nets(sdf, lo, hi, cell, colour);
    const tris = (g.index?.count ?? 0) / 3;
    if (tris <= most * 1.15) return g;
    g.dispose();
    cell *= Math.sqrt(tris / most) * 1.02;
  }
}

/** About as many triangles as the demo orange: enough for towns, few enough for a phone. */
export const MOST_TRIANGLES = 20000;

function nets(sdf: Sdf, lo: V, hi: V, cell: number, colour: (p: V) => THREE.Color): THREE.BufferGeometry {
  // Padded a cell each side, so the surface closes inside the grid.
  const o: V = [lo[0] - cell, lo[1] - cell, lo[2] - cell];
  const n = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / cell) + 3) as V;
  const at = (i: number, j: number, k: number) => i + n[0] * (j + n[1] * k);
  const field = new Float32Array(n[0] * n[1] * n[2]);
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    field[at(i, j, k)] = sdf(o[0] + i * cell, o[1] + j * cell, o[2] + k * cell);
  }
  const vertexOf = new Int32Array(field.length).fill(-1);
  const positions: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const vals = corners.map(([a, b, c]) => field[at(i + a, j + b, k + c)]);
    let inside = 0;
    for (const v of vals) if (v < 0) inside++;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of edges) {
      const va = vals[a], vb = vals[b];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb), ca = corners[a], cb = corners[b];
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t;
      m++;
    }
    vertexOf[at(i, j, k)] = positions.length / 3;
    positions.push(o[0] + (i + sx / m) * cell, o[1] + (j + sy / m) * cell, o[2] + (k + sz / m) * cell);
  }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const v0 = field[at(i, j, k)] < 0;
    // The edge along x from here: the four cells round it.
    if (v0 !== field[at(i + 1, j, k)] < 0) quad(vertexOf[at(i, j - 1, k - 1)], vertexOf[at(i, j, k - 1)], vertexOf[at(i, j, k)], vertexOf[at(i, j - 1, k)], v0);
    if (v0 !== field[at(i, j + 1, k)] < 0) quad(vertexOf[at(i - 1, j, k - 1)], vertexOf[at(i - 1, j, k)], vertexOf[at(i, j, k)], vertexOf[at(i, j, k - 1)], v0);
    if (v0 !== field[at(i, j, k + 1)] < 0) quad(vertexOf[at(i - 1, j - 1, k)], vertexOf[at(i, j - 1, k)], vertexOf[at(i, j, k)], vertexOf[at(i - 1, j, k)], v0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(index);
  const colours = new Float32Array(positions.length);
  for (let v = 0; v < positions.length / 3; v++) {
    const c = colour([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
    colours.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
