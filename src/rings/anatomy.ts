/**
 * The wood itself, for the press (press.ts on the CPU, gpu.ts on the graphics chip keeps its own copies of the
 * same formulas): the noise the grain is made of, each drawn wood's anatomy, and its rays.
 */
import type { Years } from './wood';
export type Kind = 'oak' | 'ash' | 'cherry' | 'maple' | 'birch' | 'pine' | 'redwood' | 'bristlecone' | 'olive' | 'fir' | 'juniper';
const TAU = Math.PI * 2;
export const h1 = (x: number) => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** Value noise, 0 to 1, smooth, from a fixed 256-square of randoms. */
export const NOISE = (() => { const a = new Float32Array(65536); let r = 20251; for (let i = 0; i < a.length; i++) { r = (r * 16807) % 2147483647; a[i] = r / 2147483647; } return a; })();
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const i0 = xi & 255, j0 = yi & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  const a = NOISE[j0 * 256 + i0], b = NOISE[j0 * 256 + i1], c = NOISE[j1 * 256 + i0], d = NOISE[j1 * 256 + i1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * How each of the drawn woods is built, year by year, for the press (`printYears` without a scan): how much
 * ink its earlywood takes (`early`, soft and open, printing light) and its latewood (`late`), the share of
 * the year that's latewood, the line at the year's edge, its rays (how many round, how wide, in the slice's
 * own px), its pores (how many, how large, whether gathered in the earlywood), how strongly its real fibre
 * shows, and a mottle (the olive's figure).
 */
export type Anatomy = { early: number; late: number; share: number; edge: number; rays: number; rayW: number; pores: number; poreR: number; poreEarly: number; fibre: number; mottle: number; sharp?: number };
export const ANATOMY: Partial<Record<Kind, Anatomy>> = {
  // Cherry: semi-diffuse, its pores a little crowded at each year's start, fine rays, a clear but soft edge.
  cherry: { early: 0.47, late: 1.0, share: 0.42, edge: 1.05, rays: 0.9, rayW: 0.42, pores: 0.11, poreR: 0.5, poreEarly: 0.6, fibre: 0.5, mottle: 0 },
  // Maple: even and close, light, each year closed by a thin dark line; fine rays.
  maple: { early: 0.43, late: 0.92, share: 0.32, edge: 1.04, rays: 1.1, rayW: 0.36, pores: 0.07, poreR: 0.38, poreEarly: 0.1, fibre: 0.45, mottle: 0 },
  // Birch: pale and plain, a faint edge, very fine pores; its rays too fine to see.
  birch: { early: 0.39, late: 0.8, share: 0.28, edge: 0.95, rays: 0, rayW: 0, pores: 0.09, poreR: 0.32, poreEarly: 0, fibre: 0.5, mottle: 0 },
  // The conifers: soft pale earlywood darkening steadily into a firm latewood, ending sharp; no pores.
  pine: { early: 0.29, late: 1.05, share: 0.34, edge: 1.08, rays: 0, rayW: 0, pores: 0, poreR: 0, poreEarly: 0, fibre: 0.45, mottle: 0 },
  redwood: { early: 0.36, late: 1.0, share: 0.38, edge: 1.04, rays: 0, rayW: 0, pores: 0, poreR: 0, poreEarly: 0, fibre: 0.55, mottle: 0 },
  bristlecone: { early: 0.32, late: 1.05, share: 0.42, edge: 1.08, rays: 0, rayW: 0, pores: 0, poreR: 0, poreEarly: 0, fibre: 0.45, mottle: 0 },
  // Olive: dense, close and irregular, its figure a dark mottle wandering through the years.
  olive: { early: 0.6, late: 0.96, share: 0.36, edge: 1.0, rays: 0.6, rayW: 0.3, pores: 0.05, poreR: 0.3, poreEarly: 0, fibre: 0.35, mottle: 0.45 },
  // Douglas fir: a pale, soft earlywood, then all at once a dark latewood: the boldest year of them all.
  fir: { early: 0.24, late: 1.15, share: 0.5, edge: 1.12, rays: 0, rayW: 0, pores: 0, poreR: 0, poreEarly: 0, fibre: 0.3, mottle: 0, sharp: 1.8 },
  // Juniper: fine and close, its latewood thin and its years irregular, a soft figure through them.
  juniper: { early: 0.3, late: 1.0, share: 0.36, edge: 1.04, rays: 0, rayW: 0, pores: 0, poreR: 0, poreEarly: 0, fibre: 0.45, mottle: 0.25 },
};
/**
 * How strongly each wood's rays print: oak's many and plain, a conifer's barely there.
 */
export const RAYS: Partial<Record<Kind, number>> = { fir: 0.3, juniper: 0.2, oak: 0.95, ash: 0.7, cherry: 0.75, maple: 0.8, birch: 0.45, olive: 0.55, pine: 0.3, redwood: 0.25, bristlecone: 0.25 };
/**
 * How long a wood's rays run before breaking off (in the slice's own px): oak's broad rays long, the others'
 * short flecks a few years tall, staggered; and how much of each ray's way is broken.
 */
export const RAY_RUN: Partial<Record<Kind, [number, number]>> = { fir: [7, 0.6], juniper: [5, 0.65], oak: [15, 0.32], ash: [9, 0.42], cherry: [5, 0.55], maple: [5, 0.5], birch: [4, 0.6], olive: [5, 0.55], pine: [7, 0.6], redwood: [7, 0.6], bristlecone: [7, 0.6] };
/**
 * The rays at a point (tree angle `a`, `rho` px out at the slice's own size), 0 to 1. Real rays keep about the
 * same distance apart all the way out: a few begin at the heart, and as the wood widens new ones begin between
 * them, each at its own radius; each wanders a little and breaks now and then. Laid out by levels, each twice
 * the last's, a ray begun at one level running on through all the rest, so none ever jumps.
 */
/** (`kp`: the slice's own px to a unit of the wood; `ws` how much finer a ray is drawn than a look in magnifies it.) */
export function rayAt(a: number, rho: number, run: [number, number] = [20, 0.3], kp = 1, ws = 1): number {
  const R0 = 10, GAP = 3.6;
  if (rho < R0 * 0.6) return 0;
  const lv = Math.max(0, Math.floor(Math.log2(rho / R0))), N0 = Math.max(6, Math.round((TAU * R0) / GAP)), N = N0 * 2 ** lv;
  const sAt = (((a / TAU) % 1) + 1) % 1 * N, k0 = Math.floor(sAt);
  let best = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    // (Which level it was born at: k's odd part.)
    let bk = ((k % N) + N) % N, bl = lv;
    while (bl > 0 && bk % 2 === 0) { bk /= 2; bl--; }
    const id = bk * 7.31 + bl * 31.7, nb = N0 * 2 ** bl, born = R0 * 2 ** bl * (bl ? 0.7 + 0.6 * h1(id * 1.9) : 0.6);
    if (rho < born) continue;
    // (Too far from where it could wander to, whatever its wandering: passed by without working it out.)
    const half = (0.07 + 0.16 * h1(id * 3.7) ** 2) * ws * (0.45 + 0.55 * Math.min(1, (rho - born) / 8)), home = (bk + 0.5 + (h1(id) - 0.5) * 0.5) / nb * N;
    let d0 = Math.abs(sAt - home); d0 = Math.min(d0, N - d0);
    if (((d0 - 0.8) * TAU * rho * kp) / N > half + 0.8 + 0.35) continue;
    // (Where it lies: its birth place, a little off even, wandering slowly outward.)
    // (Never ruled: it bends a little as the years about it swell and pinch, slowly and in small jogs.)
    const wander = Math.sin(rho / (40 + 30 * h1(id * 2.3)) + id) * 0.45 + (vnoise(id * 0.71, rho / 9) - 0.5) * 0.7;
    const at = ((bk + 0.5 + (h1(id) - 0.5) * 0.5) / nb + wander / N) * N;
    let dd = Math.abs(sAt - at); dd = Math.min(dd, N - dd);
    const dist = (dd * TAU * rho * kp) / N + (vnoise(rho * 2.4 + id, id * 0.13) - 0.5) * 0.35 * ws;
    if (dist > half + 0.6 * ws) continue;
    // (Never a ruled line: a ray is a run of lens-shaped flecks, each its own length, swelling and tapering to a
    // point at either end, staggered from its neighbours', now and then one missing.)
    const per = run[0] * (0.8 + 0.8 * h1(id * 5.3)), u = rho / per + h1(id * 8.1), seg = Math.floor(u), ph = u - seg;
    const on = (1 - run[1]) * (0.7 + 0.6 * h1(id * 2.9 + seg * 1.37));
    if (ph > on || h1(id * 3.1 + seg * 7.7) < run[1] * 0.35) continue;
    const lens = Math.pow(Math.sin((Math.PI * ph) / on), 0.7), hw = half * lens;
    if (dist > hw + 0.6 * ws) continue;
    best = Math.max(best, Math.min(1, smooth(1 - (dist - hw) / (0.6 * ws))) * Math.min(1, (rho - born) / 3) * Math.min(1, lens * 3));
  }
  return best;
}
/** A wood's years, every copy of them one after another, as one table (for the graphics chip). */
export const NONE = new Float32Array(1);
export function atlasOf(y: Years): Float32Array {
  let n = 0;
  for (const l of y.levels.slice(0, 12)) n += l.w * l.h;
  const d = new Float32Array(n);
  let o = 0;
  for (const l of y.levels.slice(0, 12)) { d.set(l.d.subarray(0, l.w * l.h), o); o += l.w * l.h; }
  return d;
}
