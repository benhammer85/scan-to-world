/**
 * The surface, worked out in a worker away from the page's own thread (surface.worker.ts): from the simulation's heights and
 * the land's colours (the sea's is worked out in the shader, from its depth), carried onto the finer surface (fine.ts), the ground raised by its relief and its
 * normals found. The page draws what comes back, so the world keeps turning smoothly while the
 * lava runs, which is when this is asked for most.
 */
import { FineSurface } from './fine';
import type { Handler } from './offthread';

let fine: FineSurface | null = null;
let triangles: Uint32Array, base: Float32Array, relief = 0.32;

type Ask =
  | { init: { parts: FineSurface['parts']; triangles: Uint32Array; basePositions: Float32Array; relief: number } }
  | { shape: { height: Float32Array; land: Float32Array; marks: Float32Array; flow: Float32Array } };

/** Answer one ask (in the worker, or on the page if no worker could be started). */
export const handleSurface: Handler = (message, post) => {
  const ask = message as Ask;
  if ('init' in ask) {
    fine = FineSurface.fromParts(ask.init.parts);
    triangles = ask.init.triangles; base = ask.init.basePositions; relief = ask.init.relief;
    return;
  }
  if (!fine) return;
  const n = base.length / 3;
  const height = new Float32Array(n), land = new Float32Array(n * 3);
  fine.carryDrawn(ask.shape.height, ask.shape.land, height, land);
  fine.ease(land, 3); // (the colours eased as the marks are, or the edges of their washes ripple in a saw)
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const r = 1 + relief * Math.max(0, height[v]);
    position[v * 3] = base[v * 3] * r; position[v * 3 + 1] = base[v * 3 + 1] * r; position[v * 3 + 2] = base[v * 3 + 2] * r;
  }
  // Each normal the sum of its triangles' (weighted by their area).
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normal[a] += nx; normal[a + 1] += ny; normal[a + 2] += nz;
    normal[b] += nx; normal[b + 1] += ny; normal[b + 2] += nz;
    normal[c] += nx; normal[c + 1] += ny; normal[c + 2] += nz;
  }
  for (let i = 0; i < normal.length; i += 3) {
    const l = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    normal[i] /= l; normal[i + 1] /= l; normal[i + 2] /= l;
  }
  // Where lava lies and where it has lain, carried as amounts, not colours: the shader draws their edges crisply.
  const marks = new Float32Array(n * 4);
  fine.carryMarks(ask.shape.marks, marks);
  const flow = new Float32Array(n);
  fine.carry(ask.shape.flow, flow); fine.ease(flow, 1);
  post({ height, land, position, normal, marks, flow }, [height.buffer, land.buffer, position.buffer, normal.buffer, marks.buffer, flow.buffer]);
};
