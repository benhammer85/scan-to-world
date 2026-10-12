/**
 * The watercolour itself: a small simulation of water and pigment on paper, which is how Well Rounded's
 * wood gets its colour. Nothing here is painted as a picture of watercolour; the paint behaves, and the
 * picture is what it leaves.
 *
 * The paper is a square grid of cells. Each holds water, pigment still in suspension (three channels
 * of absorbance, so colours mix as paints do, subtractively), and pigment settled into the paper.
 *
 *   Water spreads between wet cells, and creeps a little into dry paper from a very wet one: a bloom.
 *   Pigment moves with the water: it diffuses through a wet patch, and is carried toward its drier
 *     edge as it evaporates, so a wash dries with a dark rim (the coffee-ring effect): a ring's
 *     latewood line, made by the paint.
 *   Where two wet colours meet, they run into one another.
 *   Water evaporates, quicker at an edge; as it goes the pigment settles, and when it's gone, it stays.
 *   Pigment may change as it settles: laid with a colour to dry to, a cell's paint goes down in one
 *     colour and settles into another (the season's living colour drying into wood).
 *   Wind drifts the suspended pigment downwind.
 *
 * The grid lies in the slice's own plane (warped millimetres: see hand.ts), centred on the pith, so the
 * same paint is drawn at any scale; when the slice's warp changes between rings, the paper is
 * resampled. The simulation has no drawing in it (render() fills an ImageData), so it can be tested
 * and run without a browser.
 */
export type RGB = [number, number, number];

/** Reflectance (0 to 1 a channel) as absorbance, and back: paints mix by adding absorbance. */
export const absorb = (c: RGB): RGB => [-Math.log(Math.max(0.02, c[0])), -Math.log(Math.max(0.02, c[1])), -Math.log(Math.max(0.02, c[2]))];

const PAPER: RGB = [244, 239, 228];

export interface Weathering { wet: number; dry: number; drift: [number, number] }

export class Wash {
  readonly n: number;
  /** Half the paper's width, in the slice's (warped) millimetres. */
  extent: number;
  readonly water: Float32Array;
  readonly sus: Float32Array;
  readonly dep: Float32Array;
  /** How strongly pigment flows to a drying edge (the coffee-ring effect's dark rim); 2.2 by default. */
  edgeFlow = 2.2;
  /** The paper's tooth, 0 to 1: pits where pigment settles (granulation). */
  readonly tooth: Float32Array;
  /** How much each cell's pigment granulates (drought's ochre does; most don't much). */
  readonly gran: Float32Array;
  /** The colour each cell's pigment settles into (absorbance, summing to 1), and how far (0 keeps its own). */
  readonly tint: Float32Array;
  readonly turn: Float32Array;
  private active: Int32Array;
  private count = 0;
  private next: Int32Array;
  /** Whether a cell is on the list of wet cells; and the step that last touched it. */
  private listed: Uint8Array;
  private mark: Uint32Array;
  private stamp = 1;
  private dW: Float32Array;
  private dS: Float32Array;
  /** The weather on the paper now: how slowly it dries (wet), how quickly (dry), and the wind. */
  weather: Weathering = { wet: 1, dry: 1, drift: [0, 0] };

  constructor(n = 320, extent = 40) {
    this.n = n; this.extent = extent;
    const N = n * n;
    this.water = new Float32Array(N);
    this.sus = new Float32Array(N * 3);
    this.dep = new Float32Array(N * 3);
    this.tooth = new Float32Array(N);
    this.gran = new Float32Array(N);
    this.tint = new Float32Array(N * 3);
    this.turn = new Float32Array(N);
    this.active = new Int32Array(N);
    this.next = new Int32Array(N);
    this.mark = new Uint32Array(N);
    this.listed = new Uint8Array(N);
    this.dW = new Float32Array(N);
    this.dS = new Float32Array(N * 3);
    let s = 1234567;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // (Tooth: fine noise, a little clumped, as cold-pressed paper is.)
    for (let i = 0; i < N; i++) this.tooth[i] = rnd();
    for (let pass = 0; pass < 1; pass++) for (let i = n + 1; i < N - n - 1; i++) this.tooth[i] = 0.5 * this.tooth[i] + 0.125 * (this.tooth[i - 1] + this.tooth[i + 1] + this.tooth[i - n] + this.tooth[i + n]);
  }

  /** Cell size (mm). */
  get h(): number { return (2 * this.extent) / this.n; }
  /** Whether any of the paper is wet. */
  get wet(): boolean { return this.count > 0; }
  /** The cell at a point of the plane (mm, y up), or −1 off the paper. */
  cell(x: number, y: number): number {
    const i = Math.floor((x + this.extent) / this.h), j = Math.floor((this.extent - y) / this.h);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i;
  }
  /** The centre of cell c, in the plane. */
  centre(c: number): [number, number] {
    const i = c % this.n, j = Math.floor(c / this.n), h = this.h;
    return [-this.extent + (i + 0.5) * h, this.extent - (j + 0.5) * h];
  }

  /**
   * Wet paint laid on a cell: water to `water`, and pigment of absorbance `ink` (added to what's there,
   * so a colour laid into a wet one mixes with it).
   */
  lay(c: number, water: number, ink: RGB, granulate = 0, dries?: RGB, turn = 0.85): void {
    if (c < 0) return;
    // Water on dried paint lifts some of it again (as re-wetting a wash does), so it can run anew.
    if (water > this.water[c] && this.water[c] < 0.3) {
      const lift = 0.55 * (water - this.water[c]);
      for (let ch = 0; ch < 3; ch++) { const f = this.dep[c * 3 + ch] * lift; this.dep[c * 3 + ch] -= f; this.sus[c * 3 + ch] += f; }
    }
    this.water[c] = Math.max(this.water[c], water);
    this.sus[c * 3] += ink[0]; this.sus[c * 3 + 1] += ink[1]; this.sus[c * 3 + 2] += ink[2];
    this.gran[c] = Math.max(this.gran[c] * 0.7, granulate);
    if (dries) { const t = dries[0] + dries[1] + dries[2] || 1; this.tint[c * 3] = dries[0] / t; this.tint[c * 3 + 1] = dries[1] / t; this.tint[c * 3 + 2] = dries[2] / t; this.turn[c] = turn; }
    if (!this.listed[c]) { this.listed[c] = 1; this.active[this.count++] = c; }
  }

  /**
   * Paint laid over a sector of a ring: every cell whose centre lies between angles a0 and a1 (radians,
   * anticlockwise, in the plane) and between radii rIn and rOut (mm) there. `ink(a)` gives the pigment at
   * angle a. Each cell is laid once a call, so a sector is laid exactly, with no seams between sectors.
   */
  layArc(a0: number, a1: number, rIn: (a: number) => number, rOut: (a: number) => number, water: number, ink: (a: number) => RGB, granulate = 0, dries?: RGB, turn = 0.85): void {
    const TAU = Math.PI * 2, span = a1 - a0;
    if (span <= 0) return;
    // The sector's bounding box, from points along its edges.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (span * k) / 8, ri = rIn(a), ro = rOut(a);
      for (const r of [ri, ro]) { const x = r * Math.cos(a), y = r * Math.sin(a); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const h = this.h, n = this.n;
    const i0 = Math.max(0, Math.floor((x0 + this.extent) / h) - 1), i1 = Math.min(n - 1, Math.ceil((x1 + this.extent) / h) + 1);
    const j0 = Math.max(0, Math.floor((this.extent - y1) / h) - 1), j1 = Math.min(n - 1, Math.ceil((this.extent - y0) / h) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -this.extent + (i + 0.5) * h, y = this.extent - (j + 0.5) * h;
      let a = Math.atan2(y, x) - a0;
      a = ((a % TAU) + TAU) % TAU;
      if (a >= span) continue;
      const r = Math.hypot(x, y), at = a0 + a;
      if (r < rIn(at) || r > rOut(at)) continue;
      this.lay(j * n + i, water, ink(at), granulate, dries, turn);
    }
  }

  /** Pigment `f` (three channels) settles into cell c: turned toward the colour it dries to. */
  private settle(c: number, f0: number, f1: number, f2: number): void {
    const k = this.turn[c], D = this.dep;
    if (k <= 0) { D[c * 3] += f0; D[c * 3 + 1] += f1; D[c * 3 + 2] += f2; return; }
    const m = f0 + f1 + f2;
    D[c * 3] += f0 * (1 - k) + this.tint[c * 3] * m * k;
    D[c * 3 + 1] += f1 * (1 - k) + this.tint[c * 3 + 1] * m * k;
    D[c * 3 + 2] += f2 * (1 - k) + this.tint[c * 3 + 2] * m * k;
  }

  /** One step of the paper drying (dt seconds). */
  step(dt = 1 / 60): void {
    if (!this.count) return;
    const n = this.n, W = this.water, S = this.sus, dW = this.dW, dS = this.dS, w = this.weather;
    const kw = 0.22, kp = 0.1, ke = this.edgeFlow, kb = w.dry > 0 ? 0.012 * w.wet : 0;
    // How quickly it dries: about four seconds for a wash, slower in rain, quicker in a drought.
    const ev = (dt / 4) * w.dry / w.wet;
    const [dx, dy] = w.drift;
    const act = this.active, cnt = this.count;
    // Every wet cell and its neighbours are touched this step.
    this.stamp = (this.stamp + 1) >>> 0 || 1;
    let touched = 0;
    const list = this.next;
    const add = (c: number) => { if (this.mark[c] !== this.stamp) { this.mark[c] = this.stamp; list[touched++] = c; dW[c] = 0; dS[c * 3] = 0; dS[c * 3 + 1] = 0; dS[c * 3 + 2] = 0; } };
    for (let k = 0; k < cnt; k++) add(act[k]);
    for (let k = 0; k < cnt; k++) {
      const c = act[k], wc = W[c];
      if (wc <= 0) continue;
      const x = c % n;
      let dry = 0;
      for (let d = 0; d < 4; d++) {
        const m = d === 0 ? (x + 1 < n ? c + 1 : -1) : d === 1 ? (x > 0 ? c - 1 : -1) : d === 2 ? (c + n < n * n ? c + n : -1) : (c - n >= 0 ? c - n : -1);
        if (m < 0) { dry++; continue; }
        const wm = W[m];
        if (wm > 0) {
          // Wet to wet: each pair once (from the lower-numbered cell; both are on the list).
          if (m < c && this.listed[m]) continue;
          add(m);
          const q = kw * (wc - wm) * 0.5;
          dW[c] -= q; dW[m] += q;
          const share = Math.min(wc, wm);
          for (let ch = 0; ch < 3; ch++) {
            const sc = S[c * 3 + ch], sm = S[m * 3 + ch];
            // Diffusing through the wet, and carried toward the drier side as it evaporates.
            let f = kp * share * (sc - sm);
            f += wc > wm ? ke * (wc - wm) * sc * 0.25 : -ke * (wm - wc) * sm * 0.25;
            dS[c * 3 + ch] -= f; dS[m * 3 + ch] += f;
          }
        } else {
          dry++;
          // A very wet cell creeps into the dry paper beside it: a bloom, carrying a little colour.
          if (wc > 0.6) {
            add(m);
            const q = kb * (wc - 0.6);
            dW[c] -= q; dW[m] += q;
            for (let ch = 0; ch < 3; ch++) { const f = S[c * 3 + ch] * (q / wc) * 0.35; dS[c * 3 + ch] -= f; dS[m * 3 + ch] += f; }
          }
        }
      }
      // Wind: the suspended pigment drifts downwind, a little each step.
      if (dx || dy) {
        const m = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (x + 1 < n ? c + 1 : -1) : (x > 0 ? c - 1 : -1)) : (dy > 0 ? (c - n >= 0 ? c - n : -1) : (c + n < n * n ? c + n : -1));
        if (m >= 0 && W[m] > 0) { add(m); const a = Math.min(0.2, Math.hypot(dx, dy)) * wc; for (let ch = 0; ch < 3; ch++) { const f = S[c * 3 + ch] * a; dS[c * 3 + ch] -= f; dS[m * 3 + ch] += f; } }
      }
      // Evaporation, quicker at an edge.
      dW[c] -= ev * (1 + 3 * (dry / 4));
    }
    // Apply, settle, and keep what's still wet.
    let alive = 0;
    for (let k = 0; k < cnt; k++) this.listed[act[k]] = 0;
    for (let k = 0; k < touched; k++) {
      const c = list[k];
      const wc = W[c] + dW[c];
      for (let ch = 0; ch < 3; ch++) S[c * 3 + ch] = Math.max(0, S[c * 3 + ch] + dS[c * 3 + ch]);
      if (wc <= 0.01) {
        // Dry: everything still in suspension settles where it is.
        this.settle(c, S[c * 3], S[c * 3 + 1], S[c * 3 + 2]);
        S[c * 3] = 0; S[c * 3 + 1] = 0; S[c * 3 + 2] = 0;
        W[c] = 0;
        continue;
      }
      // Settling as it dries, into the paper's pits first.
      const settle = w.dry > 0 ? (0.004 + 0.05 * (1 - Math.min(1, wc))) * (0.6 + 0.8 * this.tooth[c]) : 0;
      if (settle > 0) {
        const f0 = S[c * 3] * settle, f1 = S[c * 3 + 1] * settle, f2 = S[c * 3 + 2] * settle;
        this.settle(c, f0, f1, f2);
        S[c * 3] -= f0; S[c * 3 + 1] -= f1; S[c * 3 + 2] -= f2;
      }
      W[c] = Math.min(1.2, wc);
      act[alive++] = c;
      this.listed[c] = 1;
    }
    this.count = alive;
  }

  /** Dry it all at once (what's in suspension settles where it is). */
  dryAll(): void {
    for (let k = 0; k < this.count; k++) {
      const c = this.active[k];
      this.settle(c, this.sus[c * 3], this.sus[c * 3 + 1], this.sus[c * 3 + 2]);
      for (let ch = 0; ch < 3; ch++) this.sus[c * 3 + ch] = 0;
      this.water[c] = 0; this.listed[c] = 0;
    }
    this.count = 0;
  }

  /** Clear the paper. */
  clear(): void { this.water.fill(0); this.sus.fill(0); this.dep.fill(0); this.gran.fill(0); this.tint.fill(0); this.turn.fill(0); this.listed.fill(0); this.count = 0; }

  /**
   * Resample the paper for a new plane: `from(x, y)` says where in the old plane (mm) a point of the new
   * one (mm) was, and `extent` is the new paper's half-width. (Between rings, as the slice's warp changes.)
   */
  remap(extent: number, from: (x: number, y: number) => [number, number]): void {
    const n = this.n, N = n * n, oldE = this.extent, oldH = this.h;
    const W = this.water.slice(), S = this.sus.slice(), D = this.dep.slice(), G = this.gran.slice(), Tn = this.tint.slice(), Tk = this.turn.slice();
    this.extent = extent;
    const h = this.h;
    this.water.fill(0); this.sus.fill(0); this.dep.fill(0); this.gran.fill(0); this.tint.fill(0); this.turn.fill(0);
    let cnt = 0;
    this.listed.fill(0);
    for (let c = 0; c < N; c++) {
      const i = c % n, j = Math.floor(c / n), x = -extent + (i + 0.5) * h, y = extent - (j + 0.5) * h;
      const [ox, oy] = from(x, y);
      // (Bilinear, from the old grid.)
      const fx = (ox + oldE) / oldH - 0.5, fy = (oldE - oy) / oldH - 0.5, i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
      if (i0 < 0 || j0 < 0 || i0 + 1 >= n || j0 + 1 >= n) continue;
      const a = j0 * n + i0, b = a + 1, cc = a + n, d = cc + 1;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wcc = (1 - tx) * ty, wd = tx * ty;
      const w = W[a] * wa + W[b] * wb + W[cc] * wcc + W[d] * wd;
      for (let ch = 0; ch < 3; ch++) {
        this.sus[c * 3 + ch] = S[a * 3 + ch] * wa + S[b * 3 + ch] * wb + S[cc * 3 + ch] * wcc + S[d * 3 + ch] * wd;
        this.dep[c * 3 + ch] = D[a * 3 + ch] * wa + D[b * 3 + ch] * wb + D[cc * 3 + ch] * wcc + D[d * 3 + ch] * wd;
      }
      this.gran[c] = G[a] * wa + G[b] * wb + G[cc] * wcc + G[d] * wd;
      // (What it dries to: the nearest old cell's.)
      const near = tx < 0.5 ? (ty < 0.5 ? a : cc) : (ty < 0.5 ? b : d);
      for (let ch = 0; ch < 3; ch++) this.tint[c * 3 + ch] = Tn[near * 3 + ch];
      this.turn[c] = Tk[near];
      if (w > 0.01) { this.water[c] = w; this.active[cnt++] = c; this.listed[c] = 1; }
      else { this.settle(c, this.sus[c * 3], this.sus[c * 3 + 1], this.sus[c * 3 + 2]); for (let ch = 0; ch < 3; ch++) this.sus[c * 3 + ch] = 0; }
    }
    this.count = cnt;
  }

  /** The paper as pixels (n × n, RGBA): paper tinted by its pigment, granulated, a wet sheen where it's wet. */
  render(out: Uint8ClampedArray, strength = 1): void {
    const N = this.n * this.n, W = this.water, S = this.sus, D = this.dep, T = this.tooth, G = this.gran;
    for (let c = 0; c < N; c++) {
      const g = 1 + G[c] * (T[c] - 0.5) * 1.6, wet = 1 - 0.06 * Math.min(1, W[c]);
      const o = c * 4;
      let ink = 0;
      for (let ch = 0; ch < 3; ch++) {
        const a = (D[c * 3 + ch] * g + S[c * 3 + ch]) * strength;
        ink += a;
        out[o + ch] = PAPER[ch] * Math.exp(-a) * wet;
      }
      // (Transparent where there's no paint, so the page's own paper shows.)
      out[o + 3] = ink > 0.002 || W[c] > 0 ? 255 : 0;
    }
  }

  /** How much pigment is on the paper in all (absorbance summed): for tests. */
  get pigment(): number { let s = 0; for (let i = 0; i < this.sus.length; i++) s += this.sus[i] + this.dep[i]; return s; }
}
