/**
 * The wash: wet watercolour on paper, as a small simulation on a grid over the slice.
 *
 * Each cell holds water, pigment still afloat in it (wet), and pigment settled into the paper (dry),
 * each pigment as optical density in red, green and blue, so colours mix as paint does: their densities
 * add, and blue over gold goes green. While a cell is wet:
 *   its pigment spreads to wet neighbours (colours run into one another);
 *   the water creeps a little into dry paper beside it, carrying pigment (the soft, feathered bloom);
 *   the wash drifts on a slow swirl, and on the wind when there is one;
 *   as it dries, pigment is drawn toward the drying edge, so a wash dries with a darker rim;
 *   and some settles all the while, more in the paper's valleys (granulation).
 * Dry pigment fades slowly (the disappearing ink), so the newest ring is vivid and the older ones
 * pale to ghosts; the ghosts themselves are drawn beneath, by draw.ts, and never fade.
 *
 * The grid is fixed on the screen. When the slice is drawn smaller as it grows, the wash is scaled with
 * it (rescale); when a wet stroke, painted wide to be seen, closes into its true ring, the wash outside
 * the bark is drawn in to it (compress).
 */
import { K } from './tree';
import type { RGB } from './palette';

const TAU = Math.PI * 2;
/** 255 × e^−density, for densities 0 to 8 in steps of 1/128. */
const LUT_SCALE = 128;
const LUT = Uint8ClampedArray.from({ length: 8 * LUT_SCALE + 1 }, (_, i) => Math.round(255 * Math.exp(-i / LUT_SCALE)));

function hash(n: number): number { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash(a * 157.1 + b * 311.7);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

export interface Weathering {
  /** How fast water leaves (per second, of a full wetting). */
  evaporate: number;
  /** A drift (device px a second, screen axes), e.g. the wind's. */
  vx: number;
  vy: number;
}

export class Wash {
  readonly N: number;
  /** The grid's middle and its cell size, in device pixels. */
  cx = 0;
  cy = 0;
  cell = 1;
  readonly W: Float32Array;
  readonly P: Float32Array[];
  readonly D: Float32Array[];
  private readonly grain: Float32Array;
  private readonly tmp: Float32Array[];
  /** For each cell, its angle round the middle (as a ring point) and its distance (device px); and the cells of each point, nearest first. */
  private bin = new Int16Array(0);
  private rad = new Float32Array(0);
  private byBin: Int32Array[] = [];
  readonly canvas: HTMLCanvasElement | null;
  private readonly img: ImageData | null;
  private time = 0;
  /** Whether anything is wet (and so moving), and frames since the last drawing of it. */
  wet = false;
  private since = 99;

  constructor(N = 240) {
    this.N = N;
    const n = N * N, f = () => new Float32Array(n);
    this.W = f();
    this.P = [f(), f(), f()];
    this.D = [f(), f(), f()];
    this.tmp = [f(), f(), f(), f(), f(), f(), f()];
    this.grain = f();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // The paper's tooth: a fine grain and a broader cockle.
      this.grain[y * N + x] = 0.55 * vnoise(x * 0.9, y * 0.9) + 0.3 * vnoise(x * 0.23 + 9, y * 0.23 + 4) + 0.15 * hash(x * 13.1 + y * 7.7);
    }
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = N; this.canvas.height = N;
      this.img = this.canvas.getContext('2d')!.createImageData(N, N);
    } else { this.canvas = null; this.img = null; }
  }

  /** Lays the grid over a square `half` device px from (cx, cy) either way, empty. */
  place(cx: number, cy: number, half: number): void {
    const N = this.N;
    this.cx = cx; this.cy = cy; this.cell = (2 * half) / N;
    this.clear();
    this.bin = new Int16Array(N * N); this.rad = new Float32Array(N * N);
    const lists: number[][] = Array.from({ length: K }, () => []);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, px = (x + 0.5 - N / 2) * this.cell, py = (y + 0.5 - N / 2) * this.cell;
      const a = (Math.atan2(-py, px) + TAU) % TAU, b = Math.round((a / TAU) * K) % K;
      this.bin[i] = b; this.rad[i] = Math.hypot(px, py);
      lists[b].push(i);
    }
    this.byBin = lists.map((l) => Int32Array.from(l.sort((p, q) => this.rad[p] - this.rad[q])));
  }

  clear(): void {
    this.W.fill(0);
    for (const a of [...this.P, ...this.D]) a.fill(0);
    this.wet = false; this.since = 99;
  }

  /**
   * Paints ring point `b` (its wedge of the grid) from `r0` to `r1` device px from the middle: water,
   * and pigment of density `dens` (a little uneven, as a brush lays it), feathered at the edges.
   */
  deposit(b: number, r0: number, r1: number, dens: RGB, water: number): void {
    const list = this.byBin[((b % K) + K) % K], c = this.cell, soft = 1.7 * c, rad = this.rad;
    if (!list) return;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (rad[list[m]] < r0 - soft) lo = m + 1; else hi = m; }
    for (let k = lo; k < list.length; k++) {
      const i = list[k], r = rad[i];
      if (r > r1 + 2 * soft) break;
      const w = Math.min(1, (r - (r0 - soft)) / (2 * soft), ((r1 + 2 * soft) - r) / (3 * soft));
      if (w <= 0) continue;
      const g = 0.8 + 0.4 * hash(i * 0.37 + b);
      this.W[i] = Math.max(this.W[i], water * w);
      for (let ch = 0; ch < 3; ch++) this.P[ch][i] += dens[ch] * w * g;
    }
    this.wet = true;
  }

  /** A drop of colour at (x, y) device px, `r` across: water and pigment, blooming out as it spreads. */
  drop(x: number, y: number, r: number, dens: RGB, water: number): void {
    const N = this.N, c = this.cell, gx = (x - this.cx) / c + N / 2, gy = (y - this.cy) / c + N / 2, gr = r / c;
    for (let yy = Math.max(0, Math.floor(gy - gr - 1)); yy <= Math.min(N - 1, Math.ceil(gy + gr + 1)); yy++) {
      for (let xx = Math.max(0, Math.floor(gx - gr - 1)); xx <= Math.min(N - 1, Math.ceil(gx + gr + 1)); xx++) {
        const d = Math.hypot(xx + 0.5 - gx, yy + 0.5 - gy), w = Math.max(0, Math.min(1, gr + 0.5 - d));
        if (w <= 0) continue;
        const i = yy * N + xx;
        this.W[i] = Math.max(this.W[i], water * w);
        for (let ch = 0; ch < 3; ch++) this.P[ch][i] += dens[ch] * w;
      }
    }
    this.wet = true;
  }

  /** Time passes: wet paint runs, swirls, drifts, rims and settles; dry paint slowly fades (over `fade` s). */
  step(dt: number, wx: Weathering, fade: number): void {
    this.time += dt;
    const fadeBy = Math.exp(-dt / fade);
    for (const d of this.D) for (let i = 0; i < d.length; i++) d[i] *= fadeBy;
    this.since++;
    if (!this.wet) return;
    const sub = 2, h = dt / sub;
    for (let s = 0; s < sub; s++) this.substep(h, wx);
    this.since = 99;
  }

  private substep(dt: number, wx: Weathering): void {
    const N = this.N, W = this.W, P = this.P, D = this.D, g = this.grain;
    const [nW, n0, n1, n2] = this.tmp;
    const [P0, P1, P2] = P;
    // Only where it's wet (and a cell round it) is anything to do.
    let x0 = N, x1 = -1, y0 = N, y1 = -1;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if (W[y * N + x] > 0.002) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { this.wet = false; return; }
    x0 = Math.max(1, x0 - 1); x1 = Math.min(N - 2, x1 + 1); y0 = Math.max(1, y0 - 1); y1 = Math.min(N - 2, y1 + 1);
    nW.set(W); n0.set(P0); n1.set(P1); n2.set(P2);
    // Running and bleeding: pigment spreads between wet cells, faster the wetter both are; the water
    // creeps into dry paper only from where it's very wet; pigment is drawn toward a drier neighbour,
    // so the drying edge gathers the colour.
    const run = Math.min(0.22, 9 * dt) * 0.5, creep = Math.min(0.06, 2 * dt), rim = Math.min(0.12, 6 * dt) * 0.25;
    const pair = (i: number, j: number, wi: number) => {
      const wj = W[j];
      if (wj > 0.002) {
        const m = run * Math.min(wi, wj);
        n0[i] += m * (P0[j] - P0[i]); n1[i] += m * (P1[j] - P1[i]); n2[i] += m * (P2[j] - P2[i]);
        if (wj < wi) {
          const f = rim * (wi - wj), q0 = f * P0[i], q1 = f * P1[i], q2 = f * P2[i];
          n0[i] -= q0; n1[i] -= q1; n2[i] -= q2; n0[j] += q0; n1[j] += q1; n2[j] += q2;
        }
      } else if (wi > 0.45) {
        // Into dry paper, a little: the feathered edge of a wet wash.
        const q = creep * (wi - 0.45) * (0.5 + g[j]), p = q * 0.6;
        nW[j] += q; nW[i] -= q * 0.5;
        n0[j] += P0[i] * p; n1[j] += P1[i] * p; n2[j] += P2[i] * p;
        n0[i] -= P0[i] * p; n1[i] -= P1[i] * p; n2[i] -= P2[i] * p;
      }
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x, wi = W[i];
      if (wi <= 0.002) continue;
      pair(i, i - 1, wi); pair(i, i + 1, wi); pair(i, i - N, wi); pair(i, i + N, wi);
    }
    W.set(nW); P0.set(n0); P1.set(n1); P2.set(n2);
    // Drifting: wet paint carried on a slow swirl, and on the weather's drift (semi-Lagrangian).
    const t = this.time, c = this.cell, sw = 2.2 * dt; // (swirl, in cells)
    const ax = (wx.vx / c) * dt, ay = (wx.vy / c) * dt;
    const s0 = this.tmp[4], s1 = this.tmp[5], s2 = this.tmp[6], sW = nW;
    s0.set(P0); s1.set(P1); s2.set(P2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x, wi = W[i];
      if (wi <= 0.002) continue;
      // The swirl: the curl of a slowly turning field, so it neither gathers nor thins the paint.
      const px = x * 0.045, py = y * 0.05;
      const vx = Math.cos(py + t * 0.21) * Math.sin(px * 0.7 - t * 0.13), vy = -Math.sin(px + t * 0.17) * Math.cos(py * 0.8 + t * 0.11);
      const sx = Math.max(0, Math.min(N - 1.001, x - (vx * sw + ax) * wi)), sy = Math.max(0, Math.min(N - 1.001, y - (vy * sw + ay) * wi));
      const xi = Math.floor(sx), yi = Math.floor(sy), fx = sx - xi, fy = sy - yi, j = yi * N + xi;
      if (sW[j] <= 0.002 && sW[j + 1] <= 0.002 && sW[j + N] <= 0.002) continue;
      const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), cc = (1 - fx) * fy, d = fx * fy;
      P0[i] = s0[j] * a + s0[j + 1] * b + s0[j + N] * cc + s0[j + N + 1] * d;
      P1[i] = s1[j] * a + s1[j + 1] * b + s1[j + N] * cc + s1[j + N + 1] * d;
      P2[i] = s2[j] * a + s2[j + 1] * b + s2[j + N] * cc + s2[j + N + 1] * d;
    }
    // Drying and settling: the water leaves; pigment settles into the paper, more in its valleys, and
    // all of it once the paper's dry.
    const ev = wx.evaporate * dt, settle = 0.18 * dt;
    const [D0, D1, D2] = D;
    let any = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x;
      if (W[i] <= 0.002) continue;
      W[i] = Math.max(0, W[i] - ev * (0.7 + 0.6 * g[i]));
      const dry = W[i] <= 0.002, f = dry ? 1 : settle * (0.6 + 0.8 * g[i]), k = 0.85 + 0.3 * g[i];
      if (!dry) any = true;
      D0[i] += P0[i] * f * k; D1[i] += P1[i] * f * k; D2[i] += P2[i] * f * k;
      P0[i] -= P0[i] * f; P1[i] -= P1[i] * f; P2[i] -= P2[i] * f;
    }
    this.wet = any;
  }

  /** The slice drawn `k` times as large about the middle: the wash with it. */
  rescale(k: number): void {
    if (Math.abs(k - 1) < 1e-4) return;
    const N = this.N;
    this.remap((x, y) => [N / 2 + (x - N / 2) / k, N / 2 + (y - N / 2) / k, 1]);
  }

  /**
   * Draws everything beyond the bark in toward it by `k` (the wide wet stroke settling into its true
   * ring), its colour deepening as it gathers. `bark(a)` is the bark's distance (device px) at angle a.
   */
  compress(bark: (a: number) => number, k: number): void {
    if (k > 0.97) return;
    // (Gathered in, the colour deepens a little, but not by all it's drawn in: most of it soaks into
    // the paper on the way, or a thin ring would dry to a dark rim.)
    const N = this.N, c = this.cell, deepen = Math.min(1.12, 1 / Math.sqrt(k));
    this.remap((x, y) => {
      const px = (x - N / 2) * c, py = (y - N / 2) * c, r = Math.hypot(px, py), a = Math.atan2(-py, px), b = bark(a);
      if (r <= b) return [x, y, 1];
      const rs = b + (r - b) / k, f = rs / Math.max(1e-6, r);
      return [N / 2 + (x - N / 2) * f, N / 2 + (y - N / 2) * f, deepen];
    });
  }

  /** Every field resampled: each cell takes what was at the source the map gives (bilinear), times its gain. */
  private remap(from: (x: number, y: number) => [number, number, number]): void {
    const N = this.N, fields = [this.W, ...this.P, ...this.D], copies = fields.map((f) => f.slice());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const [sx0, sy0, gain] = from(x + 0.5, y + 0.5), sx = sx0 - 0.5, sy = sy0 - 0.5, i = y * N + x;
      if (sx < 0 || sy < 0 || sx > N - 1.001 || sy > N - 1.001) { for (const f of fields) f[i] = 0; continue; }
      const xi = Math.floor(sx), yi = Math.floor(sy), fx = sx - xi, fy = sy - yi, j = yi * N + xi;
      fields.forEach((f, k) => {
        const a = copies[k];
        const v = (a[j] * (1 - fx) + a[j + 1] * fx) * (1 - fy) + (a[j + N] * (1 - fx) + a[j + N + 1] * fx) * fy;
        f[i] = k === 0 ? v : v * gain;
      });
    }
  }

  /** The wash as a picture (white where there's none, to be multiplied onto the page). */
  render(): void {
    if (!this.img || !this.canvas) return;
    const d = this.img.data, [P0, P1, P2] = this.P, [D0, D1, D2] = this.D, W = this.W, n = this.N * this.N;
    // (Light through the paint: e^−density, looked up rather than worked out a hundred thousand times a frame.)
    const lut = LUT, s = LUT_SCALE, top = LUT.length - 1;
    for (let i = 0; i < n; i++) {
      // (Wet paint looks deeper than it dries: a wash dries lighter.)
      const wet = W[i] > 0.002 ? 1.08 : 1, o = i * 4;
      d[o] = lut[Math.min(top, ((D0[i] * 0.9 + P0[i] * wet) * s) | 0)];
      d[o + 1] = lut[Math.min(top, ((D1[i] * 0.9 + P1[i] * wet) * s) | 0)];
      d[o + 2] = lut[Math.min(top, ((D2[i] * 0.9 + P2[i] * wet) * s) | 0)];
      d[o + 3] = 255;
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
  }

  /** Laid onto the page, multiplied, the grid's square smoothly scaled to its place. */
  draw(g: CanvasRenderingContext2D): void {
    if (!this.canvas) return;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const half = (this.cell * this.N) / 2;
    g.drawImage(this.canvas, this.cx - half, this.cy - half, 2 * half, 2 * half);
    g.restore();
  }

  /** How much colour there is at a cell (for tests). */
  densityAt(x: number, y: number): number {
    const N = this.N, c = this.cell, gx = Math.floor((x - this.cx) / c + N / 2), gy = Math.floor((y - this.cy) / c + N / 2);
    if (gx < 0 || gy < 0 || gx >= N || gy >= N) return 0;
    const i = gy * N + gx;
    return this.P[0][i] + this.P[1][i] + this.P[2][i] + this.D[0][i] + this.D[1][i] + this.D[2][i];
  }
}
