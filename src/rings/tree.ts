/**
 * Well Rounded: you are one tree, and this is its trunk, seen in cross-section. Each ring is painted by
 * hand, in one stroke round the last, as an ensō is painted, in watercolour.
 *
 * Nothing can go wrong. The finger is the brush: its path is the ring's outer edge, smoothed only a
 * little, and the mark has a width the hand controls as a calligrapher's does (slow lays wide wood,
 * quick a thin line). The brush holds about one ring's ink and pales as it empties, but it never runs
 * quite dry. Lift too soon and touch again where you left off to carry on; leave it, and the water
 * wicks across the gap and closes the ring for you. A stroke inside the last ring is only clamped to
 * it (wood can't shrink). The tree never dies: its life ends when you let it rest.
 *
 * The weather is felt in the brush and seen in the colours (palette.ts, wash.ts): rain wets the paper
 * (the edge bleeds outward), drought dries the brush (scratchy, less ink), wind pushes the stroke
 * sideways, frost makes it jitter, the sun from the south widens the lit side by itself, and a fire
 * on the slope leaves a warm bloom. Each is known a ring or two ahead, in the habit drawing.
 *
 * Everything here is in the tree's own frame: angles from its east, anticlockwise, radii in mm. The
 * brush's radial position is in band units: 0 on the bark, 1 one steady half-mark outside it (see
 * hand.ts, which turns a pointer on the screen into these, for the game and its playtest bot alike).
 */

/** Points round each ring. */
export const K = 240;
const TAU = Math.PI * 2;
const STEP = TAU / K;

export const CALM = 0, RAIN = 1, DROUGHT = 2, WIND = 3, FROST = 4;
export type Weather = 0 | 1 | 2 | 3 | 4;

export interface Rules {
  /** Years a ring (a stroke) is: one stroke is a few years' growth, so a long life is a short game. */
  yearsPerRing: number;
  /** The radius of the pith (mm). */
  pith: number;
  /** Ink a ring holds once the crown is grown (mm² of wood); the crown grows over `crownYears`. */
  crown: number;
  crownYears: number;
  /** Old age: the ink falls from `oldFrom` years, to a share `oldInk` of itself by `oldTo`. */
  oldFrom: number;
  oldTo: number;
  oldInk: number;
  /** Seconds a full brush lasts at the steady pace: a sapling's ring, and an old tree's (by its radius, mm). */
  strokeSeconds: [number, number];
  strokeAt: number;
  /** The brush's half-mark at its widest and thinnest (band units); and the least it lays, however dry. */
  widest: number;
  thinnest: number;
  least: number;
  /** Where the sun is, and how much it widens the lit side by itself. */
  sunAngle: number;
  sun: number;
  /** Uphill: where a fire on the slope comes from. */
  uphill: number;
  /** Rings of calm to begin in, then rings between spells of each weather, and how long they last. */
  calmFirst: number;
  rainEvery: [number, number];
  rainLasts: [number, number];
  droughtEvery: [number, number];
  droughtLasts: [number, number];
  windEvery: [number, number];
  frostEvery: [number, number];
  /** Rain: more ink, and the wet edge bleeds outward, raggedly (up to this far, band units). */
  rainInk: number;
  rainBleed: number;
  /** Drought: less ink, and the dry brush breaks (how much of its mark it loses in a scratch). */
  droughtInk: number;
  dry: number;
  /** Wind: how far it pushes the stroke (band units). Frost: how far it jolts it, and its ink. */
  wind: number;
  frost: number;
  frostInk: number;
  /** Windows of rings in which a fire comes (one in each); half the arc of its bloom. */
  fires: [number, number][];
  fireHalf: number;
  /** A brush lifted can be touched down again to carry on, within this many radians of where it left off. */
  resume: number;
}

export const OAK: Rules = {
  yearsPerRing: 5,
  pith: 6,
  crown: 14000,
  crownYears: 60,
  oldFrom: 300,
  oldTo: 440,
  oldInk: 0.45,
  strokeSeconds: [3.2, 6],
  strokeAt: 420,
  widest: 3,
  thinnest: 0.15,
  least: 0.25,
  sunAngle: -Math.PI / 2,
  sun: 0.25,
  uphill: Math.PI,
  calmFirst: 4,
  rainEvery: [4, 8],
  rainLasts: [1, 2],
  droughtEvery: [7, 12],
  droughtLasts: [1, 2],
  windEvery: [5, 9],
  frostEvery: [7, 13],
  rainInk: 1.25,
  rainBleed: 0.45,
  droughtInk: 0.75,
  dry: 0.45,
  wind: 0.45,
  frost: 0.18,
  frostInk: 0.92,
  fires: [[22, 36], [46, 56]],
  fireHalf: 0.4,
  resume: 0.7,
};

export type News = { kind: 'ring' | 'fire' | 'fell'; ring: number; angle?: number };

/** A fire on the slope: before ring `ring`, where, and how wide its bloom. */
export interface Scar { ring: number; angle: number; half: number }

/** The stroke being painted. */
interface Stroke {
  t0: number;
  t: number;
  /** The last raw angle, and the angle unwrapped since the start. */
  a: number;
  raw: number;
  start: number;
  /** Which way round (1 anticlockwise, −1 clockwise; 0 till it's moved). */
  dir: number;
  /** How far round it has painted (radians). */
  done: number;
  /** The brush's offset from the bark (smoothed), its angular speed (smoothed), its half-mark: now and at the last point. */
  u: number;
  w: number;
  pu: number;
  ph: number;
  /** Ink left (a full ring at the steady width is 1). */
  ink: number;
  /** When the finger lifted (it can come back down to carry on), or −1 while it's down. */
  lifted: number;
}

const MAX_RINGS = 400;

export class TreeSim {
  readonly k: Rules;
  readonly seed: number;
  /** Each ring's weather, its wind's heading, and the rings a fire comes before. */
  readonly weather: Uint8Array;
  readonly winds: Float32Array;
  readonly fireRings: number[];

  /** Each ring's outer edge, radius at each of K angles. */
  readonly rings: Float32Array[] = [];
  /** Where each ring's stroke began, which way it went, and its weather. */
  readonly starts: number[] = [];
  readonly dirs: number[] = [];
  readonly ringWeather: number[] = [];
  readonly scars: Scar[] = [];
  over = false;
  readonly news: News[] = [];

  // ---- the stroke being painted (never kept: a stroke cut off is painted again)
  stroke: Stroke | null = null;
  /** The steady width (mm) the last ring was laid at: its marks (below) stay till the next stroke, to be seen drying. */
  laidW = 0;
  /** Each point's mark (band units from the bark, inner and outer), how far round the stroke was, the ink then; and its state (0 not yet, 1 painted, 2 bridged: the water wicked across). */
  readonly lo = new Float32Array(K);
  readonly hi = new Float32Array(K);
  readonly at = new Float32Array(K);
  readonly inkAt = new Float32Array(K);
  readonly state = new Uint8Array(K);

  constructor(seed = 1, rules: Partial<Rules> = {}) {
    this.k = { ...OAK, ...rules };
    this.seed = seed;
    let s = (seed * 9301 + 49297) % 233280;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const between = ([a, b]: [number, number]) => a + Math.floor(rnd() * (b - a + 1));
    const k = this.k;
    this.weather = new Uint8Array(MAX_RINGS);
    this.winds = new Float32Array(MAX_RINGS);
    for (let i = 0; i < MAX_RINGS; i++) this.winds[i] = rnd() * TAU;
    // Each weather in spells, some rings apart; the first few rings calm. Rain first, then drought
    // where it isn't raining, then wind and frost in what's left.
    const lay = (kind: Weather, every: [number, number], lasts: [number, number]) => {
      for (let y = k.calmFirst + between(every) - 1; y < MAX_RINGS; y += between(every)) {
        const n = between(lasts);
        for (let i = 0; i < n && y < MAX_RINGS; i++, y++) if (!this.weather[y]) this.weather[y] = kind;
      }
    };
    lay(RAIN, k.rainEvery, k.rainLasts);
    lay(DROUGHT, k.droughtEvery, k.droughtLasts);
    lay(WIND, k.windEvery, [1, 1]);
    lay(FROST, k.frostEvery, [1, 1]);
    this.fireRings = k.fires.map((w) => between(w));
  }

  /** Rings laid. */
  get ring(): number { return this.rings.length; }
  /** The age in years. */
  get year(): number { return this.rings.length * this.k.yearsPerRing; }
  /** A ring's weather (this ring's, by default). */
  weatherOf(n = this.rings.length): Weather { return this.weather[Math.min(n, MAX_RINGS - 1)] as Weather; }
  get weatherNow(): Weather { return this.weatherOf(); }
  /** The wind's heading in ring n (where it blows to). */
  windOf(n = this.rings.length): number { return this.winds[Math.min(n, MAX_RINGS - 1)]; }
  /** Whether a fire comes before ring n. */
  fireBefore(n: number): boolean { return this.fireRings.includes(n); }

  /** The radius of the last ring laid (or the pith) at point i: the bark. */
  inner(i: number): number { return this.rings.length ? this.rings[this.rings.length - 1][i] : this.k.pith; }

  /** Mean radius of the bark (mm). */
  get radius(): number {
    let s = 0;
    for (let i = 0; i < K; i++) s += this.inner(i);
    return s / K;
  }

  /** The ink this ring's crown gives (mm² of wood): growing with the crown, falling in old age. */
  get inkMm(): number {
    const k = this.k, age = this.year + k.yearsPerRing;
    const old = Math.max(0, Math.min(1, (age - k.oldFrom) / (k.oldTo - k.oldFrom)));
    // (The crown is slow to start: a seedling's first rings are narrow, painted round a pith a finger can circle.)
    return k.crown * (1 - Math.exp(-((age / k.crownYears) ** 1.4))) * (1 - (1 - k.oldInk) * old * old * (3 - 2 * old));
  }
  /** The steady ring's width (mm): the full ink, spread evenly round the bark. Old rings come out thin. */
  get wRef(): number {
    const R = this.radius;
    return Math.sqrt(R * R + this.inkMm / Math.PI) - R;
  }
  /** Seconds the full brush lasts at the steady pace (longer as the trunk grows). */
  get strokeSeconds(): number {
    const [a, b] = this.k.strokeSeconds, f = Math.min(1, this.radius / this.k.strokeAt);
    return a + (b - a) * f * f * (3 - 2 * f);
  }
  /** What the brush holds this ring. */
  get capacity(): number {
    const w = this.weatherNow, k = this.k;
    return w === RAIN ? k.rainInk : w === DROUGHT ? k.droughtInk : w === FROST ? k.frostInk : 1;
  }
  /** The ink left in the brush, as a share of what it held (1 before the stroke). */
  get inkLeft(): number { return this.stroke ? this.stroke.ink / this.capacity : 1; }
  /** How far round the stroke has painted, 0 to 1. */
  get progress(): number { return this.stroke ? Math.max(0, this.stroke.done) / TAU : 0; }
  /** Whether the brush is lifted mid-stroke, waiting to be touched down again. */
  get waiting(): boolean { return !!this.stroke && this.stroke.lifted >= 0; }

  // ---------------------------------------------------------------- the brush
  /**
   * The brush touches down at angle a, u band units from the bark, at time t (s). Lifted mid-stroke,
   * a touch near where it left off carries the stroke on (true); anywhere else, nothing.
   */
  begin(t: number, a: number, u: number): boolean {
    if (this.over) return false;
    const s = this.stroke;
    if (s) {
      if (s.lifted < 0) return false;
      const there = s.start + s.dir * Math.max(0, s.done);
      if (Math.abs(angleDiff(a, there)) > this.k.resume) return false;
      // (Carried on from where it left off: the angle is taken up from there, not from the gap.)
      s.lifted = -1; s.t = t; s.a = there; s.raw = s.dir * s.done;
      s.u = u; s.pu = u;
      return true;
    }
    this.lo.fill(0); this.hi.fill(0); this.at.fill(0); this.inkAt.fill(0); this.state.fill(0);
    const push = this.push(a, 0);
    // (The brush touches down already moving at about the steady pace: a hand sweeps into an ensō.)
    this.stroke = { t0: t, t, a, raw: 0, start: a, dir: 0, done: -1e-9, u: u + push, w: (0.8 * TAU) / this.strokeSeconds, pu: u + push, ph: 1, ink: this.capacity, lifted: -1 };
    return true;
  }

  /** The brush moves to angle a, u band units from the bark, at time t. */
  move(t: number, a: number, u: number): void {
    const s = this.stroke;
    if (!s || this.over || s.lifted >= 0) return;
    const dt = t - s.t;
    if (dt <= 0) return;
    const da = angleDiff(a, s.a);
    s.a = a; s.raw += da; s.t = t;
    const ts = t - s.t0;
    // (Lightly smoothed, so a wobble stays a wobble; the speed over a little longer, as a brush's
    // load answers the hand.)
    s.u += (u + this.push(a, ts) - s.u) * (1 - Math.exp(-dt / 0.03));
    s.w += (Math.abs(da) / dt - s.w) * (1 - Math.exp(-dt / 0.08));
    if (!s.dir) {
      if (Math.abs(s.raw) < 0.05) { s.pu = s.u; return; }
      s.dir = Math.sign(s.raw);
    }
    const h = this.half(a, s.w, ts, s.ink), p = Math.min(TAU, s.dir * s.raw);
    if (p > s.done) {
      // Each point the brush has passed since the last, its mark between the two.
      const k0 = Math.max(0, Math.floor(s.done / STEP) + 1), k1 = Math.min(K - 1, Math.floor(p / STEP + 1e-9));
      const i0 = Math.round(s.start / STEP), span = p - s.done;
      for (let j = k0; j <= k1; j++) {
        const f = span > 0 ? Math.max(0, Math.min(1, (j * STEP - s.done) / span)) : 1;
        this.paint((((i0 + s.dir * j) % K) + K) % K, s.pu + (s.u - s.pu) * f, s.ph + (h - s.ph) * f, (j * STEP) / TAU);
      }
      s.done = p;
    }
    s.pu = s.u; s.ph = h;
    if (s.done >= TAU - STEP * 0.5) this.close();
  }

  /** The finger lifts: the stroke waits to be carried on (see begin), or finished (finish). */
  lift(t: number): void {
    const s = this.stroke;
    if (!s || this.over) return;
    if (!s.dir) { this.stroke = null; return; } // (a touch that never went anywhere)
    s.lifted = t;
  }

  /** The stroke is let be: the ring is laid as far as it went, and the water wicks across the rest. */
  finish(): void { if (this.stroke && !this.over) this.close(); }

  /** Where the brush's mark is now (for drawing it): its angle, offset and half-mark. */
  get tip(): { a: number; u: number; h: number } | null {
    const s = this.stroke;
    return s ? { a: s.a, u: s.u, h: s.ph } : null;
  }

  /** The weather's push on the brush, outward (band units), at angle a, ts seconds into the stroke. */
  private push(a: number, ts: number): number {
    const w = this.weatherNow, k = this.k;
    if (w === WIND) {
      const gust = Math.min(1, ts / 0.7), g = gust * gust * (3 - 2 * gust);
      return k.wind * g * (0.85 + 0.15 * Math.sin(ts * 2.1 + this.seed)) * Math.cos(a - this.windOf());
    }
    if (w === FROST) return k.frost * (0.6 * Math.sin(ts * 41 + this.seed) + 0.4 * Math.sin(ts * 67 + 2 * this.seed));
    return 0;
  }

  /** The brush's half-mark (band units) at angle a, moving at w radians a second, with `ink` left. */
  private half(a: number, w: number, ts: number, ink: number): number {
    const k = this.k, wx = this.weatherNow;
    const steady = TAU / this.strokeSeconds;
    // Ink laid along the way is the flow over the speed: at the steady pace, one band.
    let h = steady / Math.max(w, 0.04);
    h = Math.max(k.thinnest, Math.min(wx === DROUGHT ? k.widest * 0.7 : k.widest, h));
    h *= 1 + k.sun * Math.cos(a - k.sunAngle);
    if (wx === RAIN) h *= 1.1;
    if (wx === DROUGHT) h *= 1 - k.dry * smooth((noise(a * 13 + this.rings.length * 5.1 + this.seed) - 0.35) / 0.35);
    if (wx === FROST) h *= 1 + 0.15 * Math.sin(ts * 53 + 3 * this.seed);
    // Emptying: the last fifth of the ink pales and thins the mark, though never to nothing.
    const f = ink / (0.2 * this.capacity);
    if (f < 1) h *= 0.4 + 0.6 * Math.sqrt(Math.max(0, f));
    return h;
  }

  /** One point of the ring painted: its mark clamped to the bark, and paid for in ink (never below the least). */
  private paint(i: number, u: number, h: number, progress: number): void {
    const s = this.stroke!;
    this.at[i] = progress;
    this.inkAt[i] = s.ink / this.capacity;
    let hi = Math.max(this.k.least, u + h);
    const lo = Math.max(0, u - h), cost = hi / K;
    if (cost > s.ink) { hi = Math.max(this.k.least, s.ink * K); s.ink = 0; } else s.ink -= cost;
    this.hi[i] = hi; this.lo[i] = Math.min(lo, hi);
    this.state[i] = 1;
  }

  // ---------------------------------------------------------------- a ring laid
  private close(): void {
    const s = this.stroke!, k = this.k, wx = this.weatherNow;
    const uo = new Float32Array(K);
    for (let i = 0; i < K; i++) uo[i] = this.state[i] === 1 ? this.hi[i] : 0;
    // Where the brush never went, the water wicks across: the gap is bridged from its two sides.
    const gaps = runs((i) => this.state[i] === 0);
    if (gaps.length && gaps[0][1] < K) for (const [from, len] of gaps) {
      const l = uo[(from + K - 1) % K], r = uo[(from + len) % K];
      for (let j = 0; j < len; j++) {
        const i = (from + j) % K, f = (j + 1) / (len + 1);
        uo[i] = Math.max(k.least, (l + (r - l) * f) * (0.75 + 0.25 * Math.abs(2 * f - 1)));
        this.hi[i] = uo[i]; this.lo[i] = 0; this.state[i] = 2;
        this.at[i] = this.at[(from + K - 1) % K]; this.inkAt[i] = 0.3;
      }
    } else if (gaps.length) uo.fill(k.least);
    // (Very lightly smoothed between neighbours: a brush's edge, not a pixel's.)
    const raw = uo.slice();
    for (let i = 0; i < K; i++) uo[i] = 0.25 * raw[(i + K - 1) % K] + 0.5 * raw[i] + 0.25 * raw[(i + 1) % K];
    // Rain: the wet edge bleeds outward, unevenly.
    if (wx === RAIN) for (let i = 0; i < K; i++) uo[i] += k.rainBleed * (0.15 + 0.85 * noise(i * 0.35 + this.rings.length * 7.7 + this.seed));
    const w = this.wRef, ring = new Float32Array(K);
    for (let i = 0; i < K; i++) ring[i] = this.inner(i) + w * uo[i];
    this.rings.push(ring);
    this.starts.push(s.start);
    this.dirs.push(s.dir || 1);
    this.ringWeather.push(wx);
    this.stroke = null;
    this.laidW = w;
    this.news.push({ kind: 'ring', ring: this.rings.length - 1 });
    // A fire on the slope before the next ring: a warm bloom on the uphill side.
    const next = this.rings.length;
    if (this.fireBefore(next)) {
      const angle = k.uphill + (hash(this.seed * 7 + next) - 0.5) * 0.6;
      this.scars.push({ ring: next, angle, half: k.fireHalf });
      this.news.push({ kind: 'fire', ring: next, angle });
    }
  }

  /** Its life is let rest: the tree is felled, whenever the painter chooses. */
  fall(): void {
    if (this.over) return;
    if (this.stroke && this.stroke.dir) this.close();
    this.over = true;
    this.stroke = null;
    this.news.push({ kind: 'fell', ring: this.rings.length });
  }

  /** How alike each ring's width is all round, 0 to 1 (a set of true circles is 1): something to notice, not an aim. */
  get evenness(): number {
    if (!this.rings.length) return 1;
    let total = 0;
    for (let n = 0; n < this.rings.length; n++) {
      let sum = 0, sq = 0;
      for (let i = 0; i < K; i++) { const w = this.rings[n][i] - (n ? this.rings[n - 1][i] : this.k.pith); sum += w; sq += w * w; }
      const mean = sum / K, cv = mean > 0 ? Math.sqrt(Math.max(0, sq / K - mean * mean)) / mean : 1;
      total += Math.max(0, 1 - 1.2 * cv);
    }
    return total / this.rings.length;
  }
}

/** Runs of consecutive points (round the circle) where `is` holds: [first, length]. */
function runs(is: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < K; i++) if (!is(i)) { start = i; break; }
  if (start < 0) return [[0, K]];
  for (let j = 1; j <= K; j++) {
    const i = (start + j) % K;
    if (is(i)) {
      let len = 0;
      while (len < K && is((i + len) % K)) len++;
      out.push([i, len]);
      j += len;
    }
  }
  return out;
}

/** The shortest turn from b to a, in radians (−π to π). */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function smooth(x: number): number { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); }

export function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth value noise, 0 to 1. */
export function noise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
