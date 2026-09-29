/**
 * Buildings as pen marks: a small closed rectangle lying on the surface,
 * long side along the contour, the way houses terrace a hillside. Positions
 * are read from the current ground every time, so buildings ride the terrain
 * when it is sculpted.
 */
import type { Topology } from '../mesh/topology';
import type { Polyline } from '../terrain/contours';
import type { Building } from './settlements';

export const MARK = {
  long: 0.024,
  short: 0.015,
  /** A town's first building is its hall, and is drawn bigger. */
  hall: 1.5,
  lift: 0.003,
};

export function buildingMarks(topo: Topology, heights: Float32Array, buildings: Building[]): Polyline[] {
  const { positions: p, normals: n } = topo;
  return buildings.map((b) => {
    const v = b.vertex, o = v * 3;
    const nx = n[o], ny = n[o + 1], nz = n[o + 2];
    // Uphill direction: neighbour offsets weighted by the height difference,
    // flattened into the tangent plane. The long side runs across it.
    let gx = 0, gy = 0, gz = 0;
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) {
      const u = topo.nbrList[k] * 3, dh = heights[u / 3] - heights[v];
      gx += (p[u] - p[o]) * dh; gy += (p[u + 1] - p[o + 1]) * dh; gz += (p[u + 2] - p[o + 2]) * dh;
    }
    let dot = gx * nx + gy * ny + gz * nz;
    gx -= dot * nx; gy -= dot * ny; gz -= dot * nz;
    let gl = Math.hypot(gx, gy, gz);
    if (gl < 1e-9) {
      // Flat: no uphill, so take any tangent, turned by the vertex so it's stable.
      const a = (v * 2.399963) % (2 * Math.PI);
      const ref = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      dot = ref[0] * nx + ref[1] * ny + ref[2] * nz;
      const tx = ref[0] - dot * nx, ty = ref[1] - dot * ny, tz = ref[2] - dot * nz;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      gx = Math.cos(a) * tx + Math.sin(a) * bx; gy = Math.cos(a) * ty + Math.sin(a) * by; gz = Math.cos(a) * tz + Math.sin(a) * bz;
      gl = Math.hypot(gx, gy, gz);
    }
    gx /= gl; gy /= gl; gz /= gl;
    // Along the contour = normal × uphill.
    const ax = ny * gz - nz * gy, ay = nz * gx - nx * gz, az = nx * gy - ny * gx;
    const s = b.order === 0 ? MARK.hall : 1;
    const hl = (MARK.long * s) / 2, hs = (MARK.short * s) / 2;
    const cx = p[o] + nx * MARK.lift, cy = p[o + 1] + ny * MARK.lift, cz = p[o + 2] + nz * MARK.lift;
    const pts = new Float32Array(12);
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([i, j], k) => {
      pts[k * 3] = cx + ax * hl * i + gx * hs * j;
      pts[k * 3 + 1] = cy + ay * hl * i + gy * hs * j;
      pts[k * 3 + 2] = cz + az * hl * i + gz * hs * j;
    });
    return { level: 0, iso: 0, points: pts, closed: true, length: 2 * (MARK.long + MARK.short) * s };
  });
}
