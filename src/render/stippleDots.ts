/**
 * Where stipple dots go: placed by a fixed rule of where they are, so ground that is dotted
 * again keeps its old dots and gains new ones, and nothing shimmers. Kept apart from the drawing
 * (stipple.ts), with nothing of three.js in it, so it can run in a worker.
 */
export const STIPPLE = {
  /** Dots per unit of area. */
  density: 70000,
  /** A dot's size, in pixels on a phone-sharp screen. */
  size: 2.1,
  /** Seconds a new dot takes to come in. */
  appear: 6,
};

/**
 * Dots over these triangles (xyz triples, three to a triangle). Where they go is fixed by where
 * each triangle is; `byDirection` fixes it by the triangle's direction from the middle instead, so
 * on ground that rises and wears (a volcano's), the dots stay put rather than jumping about.
 */
export function stippleDots(tris: number[], density = STIPPLE.density, byDirection = false): number[] {
  const out: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const a = tris.slice(i, i + 3), b = tris.slice(i + 3, i + 6), c = tris.slice(i + 6, i + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    const l = byDirection ? Math.hypot(a[0], a[1], a[2]) || 1 : 1;
    const seed = Math.round((a[0] * 7919 + a[1] * 104729 + a[2] * 1299709) / l * (byDirection ? 4 : 1));
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


