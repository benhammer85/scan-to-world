/**
 * The drying seas: the atolls' world a billion years on. The sun has brightened, and the oceans are going,
 * boiled off into the sky and lost to space (as ours will be, in a billion years or two). The plates have
 * moved the whole while, so the old flat sea floor is warped into broad basins and swells: as the sea
 * falls, it falls back into the deepest of them, and the last seas lie there.
 */
import type { Topology } from '../mesh/topology';

export const DRYING = {
  /** How deep the basins and how high the swells the plates have made, at most (heights against the sea). */
  warp: 0.12,
  /** How broad they are (radians), and how many. */
  broad: 0.55,
  count: 9,
};

type V = { x: number; y: number; z: number };

/** The plates' slow work: a smooth field of basins (below 0) and swells (above), -1 to 1, the same for a seed. */
export function warpField(topo: Topology, seed: number): Float32Array {
  const p = topo.basePositions, n = topo.vertexCount, out = new Float32Array(n);
  let s = (seed * 7919 + 13) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const centres: { c: V; sign: number; w: number }[] = [];
  for (let i = 0; i < DRYING.count; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    // (More basins than swells, and the basins broader: the seas need somewhere to go.)
    centres.push({ c: { x: r * Math.cos(a), y: r * Math.sin(a), z }, sign: i % 3 === 2 ? 1 : -1, w: DRYING.broad * (0.6 + 0.8 * rnd()) });
  }
  let most = 1e-6;
  for (let v = 0; v < n; v++) {
    let f = 0;
    for (const { c, sign, w } of centres) {
      const d = Math.acos(Math.max(-1, Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z)));
      f += sign * Math.exp(-((d / w) ** 2));
    }
    out[v] = f;
    most = Math.max(most, Math.abs(f));
  }
  for (let v = 0; v < n; v++) out[v] /= most;
  return out;
}

/** The share of the world under the sea, on this ground. */
export function seaShare(rock: ArrayLike<number>): number {
  let wet = 0;
  for (let i = 0; i < rock.length; i++) if (rock[i] < 0) wet++;
  return wet / rock.length;
}

/**
 * The ground a billion years on: warped by the plates, and the sea fallen until only `share` of the world is
 * under it. (So however the atolls were left, the drying begins from the same place.)
 */
export function dried(rock: ArrayLike<number>, topo: Topology, seed: number, share: number): Float32Array {
  const warp = warpField(topo, seed), n = rock.length, out = new Float32Array(n);
  for (let v = 0; v < n; v++) out[v] = rock[v] + DRYING.warp * warp[v];
  const sorted = Array.from(out).sort((a, b) => a - b), level = sorted[Math.min(n - 1, Math.floor(share * n))];
  for (let v = 0; v < n; v++) out[v] -= level;
  return out;
}
