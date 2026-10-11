/**
 * Well Rounded: you are one tree, and this is its trunk, seen in cross-section. Each ring is drawn by
 * hand, in one unhurried line round the last, as an ensō is drawn.
 *
 * The line the hand draws is the ring's outer edge: the player places it where the wood is to end, at
 * whatever pace they like. Its pace never changes its width; only its tone (a slow line lays a darker,
 * denser latewood, a quick one a lighter). The path is low-passed over some fifteen degrees of arc, so
 * a shaky hand makes gentle undulations, as real rings are uneven, and never spikes.
 *
 *   The brush holds a ring's worth of wood (an area, not a time): how far out the edge may be pushed,
 *     in all, round the ring. Drawn slowly, it lasts just as long. Spent, the line trails on thin.
 *   A faint pencil circle round the pith shows where an even ring of the steady size would land.
 *     Tracing it truly is the practice: the second aim is a slice of true circles.
 *   Too close to the bark in the same place two rings running, and the cambium there dies (one thin
 *     stretch is only a stress, and in the first few rings nothing dies at all): the living wood
 *     beside a wound rolls over it in the rings after.
 *   Lifting the finger rests the line; touching the drop again goes on with it.
 *   The trunk grows: each ring is longer, while the wood a ring holds levels off once the crown is
 *     grown, so old rings come out thin, as in real trees. Past three hundred years it grows old.
 *
 * The weather is occasional, and always known a ring or two ahead in the habit drawing. It acts on the
 * line, never in words: rain wets the paper (more wood, and the line bleeds outward), drought dries the
 * brush (less wood), wind pushes the line sideways, frost makes the hand tremble, the sun from the
 * south draws the lit side outward a little, and fire scorches a sector that takes no wood.
 *
 * Everything here is in the tree's own frame: angles from its east, anticlockwise, radii in mm. The
 * line's radial place is in band units: 0 on the bark, 1 one steady ring's width outside it (see
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
  /** Wood a ring holds once the crown is grown (mm² of wood); the crown grows over `crownYears`. */
  crown: number;
  crownYears: number;
  /** Old age: the wood a ring holds falls from `oldFrom` years, to a share `oldInk` of itself by `oldTo`. */
  oldFrom: number;
  oldTo: number;
  oldInk: number;
  /** The brush holds this many steady rings' wood (band units, the mean round the ring). */
  ink: number;
  /** Once it's spent, the line trails on no wider than this (band units). */
  dryTrail: number;
  /** The least width (band units) the cambium needs, judged a few points at a time. */
  thin: number;
  /** Rings at the start in which nothing dies, and the tree can't fall: mistakes heal over. */
  grace: number;
  /** The low-pass on the drawn edge: its standard deviation (radians of arc). */
  smooth: number;
  /** How far the living wood beside a wound rolls over it each ring (its spread, radians). */
  roll: number;
  /** Seconds once round at a calm pace: slower than this lays darker latewood, quicker lighter. */
  calmPace: number;
  /** Where the sun is, and how far it draws the line outward on the lit side (band units). */
  sunAngle: number;
  sun: number;
  /** Uphill: where fire scars it (leaves pile up against a trunk on its uphill side, and burn there). */
  uphill: number;
  /** Rings of calm to learn in; then the rings between spells of weather, and how likely each kind. */
  calmFirst: number;
  every: [number, number];
  /** Rain, drought, wind, frost: how likely each is when weather comes. */
  odds: [number, number, number, number];
  /** Rain: more wood, and the wet line bleeds outward (band units). */
  rainInk: number;
  rainBleed: number;
  /** Drought: less wood. */
  droughtInk: number;
  /** Wind: how far it pushes the line (band units). Frost: how far the hand trembles, and its wood. */
  wind: number;
  frost: number;
  frostInk: number;
  /** Windows of rings in which a fire comes (one in each); half the arc it scorches; what it costs. */
  fires: [number, number][];
  fireHalf: number;
  fireCost: number;
  /** The tree falls when less than this share of its cambium lives. */
  deadFall: number;
  /** Vigour: each ring feeds it by how much wood was laid (band units, mean round) against the need. */
  need: number;
  feed: number;
  /** Never falls (wander, and now always: the tree lives as long as it's drawn). */
  endless: boolean;
  /** Whether a fire scorches wood that takes no more (else it's only colour: a bloom of vermilion). */
  fireKills: boolean;
}

export const OAK: Rules = {
  yearsPerRing: 5,
  pith: 6,
  crown: 14000,
  crownYears: 60,
  oldFrom: 300,
  oldTo: 420,
  oldInk: 0.35,
  ink: 3,
  dryTrail: 0.5,
  thin: 0,
  grace: 5,
  smooth: (6.5 * Math.PI) / 180,
  roll: (10 * Math.PI) / 180,
  calmPace: 4.5,
  sunAngle: -Math.PI / 2,
  sun: 0,
  uphill: Math.PI,
  calmFirst: 5,
  every: [4, 7],
  odds: [0.32, 0.24, 0.26, 0.18],
  rainInk: 1.25,
  rainBleed: 0,
  droughtInk: 0.64,
  wind: 0,
  frost: 0,
  frostInk: 0.95,
  fires: [[22, 36], [46, 56]],
  fireHalf: 0.3,
  fireCost: 0.08,
  deadFall: 0.5,
  need: 0.85,
  feed: 0.3,
  endless: true,
  fireKills: false,
};

export type News = { kind: 'ring' | 'died' | 'healed' | 'crack' | 'gap' | 'fire' | 'fell'; ring: number; angle?: number; count?: number };

/** A fire's scar: on the boundary before ring `ring`, where, and how wide. */
export interface Scar { ring: number; angle: number; half: number }
/** A crack where a stroke didn't close (only in trees kept from before a line could rest). */
export interface Crack { ring: number; angle: number; depth: number }
/** Where the cambium died, under ring `ring`'s line, from angle a0 anticlockwise to a1. */
export interface Wound { ring: number; a0: number; a1: number }

/** The line being drawn. */
interface Stroke {
  /** The last time and raw angle; the angle unwrapped since the start; where it began. */
  t: number;
  a: number;
  raw: number;
  start: number;
  /** Which way round (1 anticlockwise, −1 clockwise; 0 till it's moved). */
  dir: number;
  /** How far round it has drawn (radians). */
  done: number;
  /** The line's place (band units from the bark, with the weather's push), its pace (smoothed, rad/s), and both at the last point drawn. */
  u: number;
  w: number;
  pu: number;
  pt: number;
  /** Seconds spent drawing (rests left out), for the weather's push. */
  ts: number;
  /** Wood spent (band units, mean round). */
  spent: number;
  /** Lifted: resting until the finger comes back to the drop. */
  resting: boolean;
}

const MAX_RINGS = 400;

/** A Gaussian low-pass round the circle: σ in points; `w` the weight of each point (0 where nothing's drawn). */
function lowpass(x: ArrayLike<number>, w: ArrayLike<number>, sigma: number, out = new Float32Array(K), weights?: Float32Array): Float32Array {
  const reach = Math.ceil(sigma * 3), ker: number[] = [];
  for (let d = -reach; d <= reach; d++) ker.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const whole = ker.reduce((a, b) => a + b, 0);
  for (let i = 0; i < K; i++) {
    let s = 0, n = 0;
    for (let d = -reach; d <= reach; d++) {
      const j = (i + d + K) % K, q = ker[d + reach] * w[j];
      s += q * x[j]; n += q;
    }
    out[i] = n > 1e-9 ? s / n : 0;
    if (weights) weights[i] = n / whole;
  }
  return out;
}

export class TreeSim {
  readonly k: Rules;
  readonly seed: number;
  /** Each ring's weather, its wind's heading, and the rings a fire comes before. */
  readonly weather: Uint8Array;
  readonly winds: Float32Array;
  readonly fireRings: number[];

  /** Each ring's outer edge, radius at each of K angles. */
  readonly rings: Float32Array[] = [];
  /** Each ring's tone round it (0 a quick, light line, 1 a slow, dark one), at every eighth point. */
  readonly tones: Float32Array[] = [];
  /** Where each ring's stroke began, which way it went, its weather, and how true a circle it came out. */
  readonly starts: number[] = [];
  readonly dirs: number[] = [];
  readonly ringWeather: number[] = [];
  readonly ringEven: number[] = [];
  /** Whether each ring was still damp when the next was painted, so the two bled together (1), as watercolour does wet-in-wet. */
  readonly bleeds: number[] = [];
  /** Whether the cambium lives at each angle (1) or is dead under a wound (0); and if fire killed it (1). */
  readonly alive = new Uint8Array(K).fill(1);
  readonly burnt = new Uint8Array(K);
  /** Where the last ring came out too thin (1): thin there again, and the cambium dies. */
  readonly stressed = new Uint8Array(K);
  vigour = 1;
  readonly scars: Scar[] = [];
  readonly cracks: Crack[] = [];
  readonly wounds: Wound[] = [];
  /** Rings left open (only in trees kept from before a line could rest). */
  gaps = 0;
  over = false;
  cause: 'old' | 'starved' | 'withered' | 'felled' | null = null;
  readonly news: News[] = [];

  // ---- the line being drawn (never kept: a stroke cut off is drawn again)
  stroke: Stroke | null = null;
  /** The steady width (mm) the last ring dried to: its marks (below) stay till the next stroke, to be seen drying. */
  laidW = 0;
  /** Each point's line as drawn (band units from the bark), its tone, how far round the stroke was, the wood left then; and its state (0 not yet, 1 drawn, 2 dead wood). After a ring closes, `hi` is its smoothed edge. */
  readonly lo = new Float32Array(K);
  readonly hi = new Float32Array(K);
  readonly tone = new Float32Array(K);
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
    // Calm, mostly: the first few rings to learn the line in, then a spell of weather every several
    // rings, one kind at a time, never the same twice running. Rain and drought may last two rings.
    let last = -1;
    for (let y = k.calmFirst + between(k.every) - 1; y < MAX_RINGS;) {
      let kind = 0;
      for (let tries = 0; tries < 4 && (kind === 0 || kind === last); tries++) {
        let r = rnd() * k.odds.reduce((a, b) => a + b, 0);
        kind = 1;
        while (kind < 4 && r > k.odds[kind - 1]) { r -= k.odds[kind - 1]; kind++; }
      }
      last = kind;
      const n = kind === RAIN || kind === DROUGHT ? (rnd() < 0.35 ? 2 : 1) : 1;
      for (let i = 0; i < n && y < MAX_RINGS; i++, y++) this.weather[y] = kind;
      y += between(k.every) - 1;
    }
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
  /** The bark (as `inner`): the line being drawn is wet, and not yet wood. */
  outer(i: number): number { return this.inner(i); }

  /** Mean radius of the bark (mm). */
  get radius(): number {
    let s = 0;
    for (let i = 0; i < K; i++) s += this.inner(i);
    return s / K;
  }

  /** The wood this ring's crown gives (mm²), its crown grown; old age is in `capacity`. */
  get inkMm(): number {
    const k = this.k, age = this.year + k.yearsPerRing;
    // (The crown is slow to start: a seedling's first rings are narrow.)
    return k.crown * (1 - Math.exp(-((age / k.crownYears) ** 1.4)));
  }
  /** The steady ring's width (mm): the crown's wood, spread evenly round the bark. */
  get wRef(): number {
    const R = this.radius;
    return Math.sqrt(R * R + this.inkMm / Math.PI) - R;
  }
  /** The least width a ring must lay, in band units. */
  get uMin(): number { return this.k.thin; }
  /** How old (0 in its prime, 1 at `oldTo`). */
  get old(): number { const k = this.k; return Math.max(0, Math.min(1, (this.year + k.yearsPerRing - k.oldFrom) / (k.oldTo - k.oldFrom))); }
  /** The wood the brush holds this ring (band units, the mean round): the weather's, less when weak or old. */
  get capacity(): number {
    const w = this.weatherNow, k = this.k, o = this.old;
    const weather = w === RAIN ? k.rainInk : w === DROUGHT ? k.droughtInk : w === FROST ? k.frostInk : 1;
    return k.ink * weather * (0.7 + 0.3 * Math.min(1, Math.max(0, this.vigour))) * (1 - (1 - k.oldInk) * o * o * (3 - 2 * o));
  }
  /** The wood left in the brush, as a share of what it held (1 before the stroke). */
  get inkLeft(): number { return this.stroke ? Math.max(0, 1 - this.stroke.spent / this.capacity) : 1; }
  /** How far round the stroke has drawn, 0 to 1. */
  get progress(): number { return this.stroke ? Math.max(0, this.stroke.done) / TAU : 0; }
  /** Whether the line is resting (the finger lifted mid-ring). */
  get resting(): boolean { return !!this.stroke?.resting; }
  /** The share of the cambium alive. */
  get living(): number { let n = 0; for (let i = 0; i < K; i++) n += this.alive[i]; return n / K; }

  /**
   * The pencil circle: where an even ring of the steady size would land, as band units outside the bark
   * at each point. A true circle round the pith, so tracing it rounds out a lopsided trunk; but never
   * asking more than half as much again of the wood anywhere (a deep notch is filled over some rings,
   * as a tree fills it, not in one).
   */
  guide(): Float32Array {
    const out = new Float32Array(K), w = this.wRef;
    let s = 0, n = 0, top = 0;
    for (let i = 0; i < K; i++) if (this.alive[i]) { s += this.inner(i); n++; top = Math.max(top, this.inner(i)); }
    const R = Math.max((n ? s / n : this.radius) + w, top + 0.4 * w);
    for (let i = 0; i < K; i++) out[i] = Math.min(1.5, (R - this.inner(i)) / w);
    return out;
  }

  // ---------------------------------------------------------------- the line
  /** The pen touches down at angle a, u band units from the bark, at time t (s). (Or, resting, takes it up again.) */
  begin(t: number, a: number, u: number): boolean {
    if (this.over) return false;
    if (this.stroke) return this.resume(t, a, u);
    this.lo.fill(0); this.hi.fill(0); this.tone.fill(0); this.at.fill(0); this.inkAt.fill(0); this.state.fill(0);
    const p = u + this.push(a, 0);
    this.stroke = { t, a, raw: 0, start: a, dir: 0, done: -1e-9, u: p, w: TAU / this.k.calmPace, pu: p, pt: 0.5, ts: 0, spent: 0, resting: false };
    return true;
  }

  /** Whether a touch at angle a would take up the resting line (near where it stopped). */
  near(a: number): boolean {
    const s = this.stroke;
    return !!s && Math.abs(angleDiff(a, s.a)) < 0.6;
  }

  /** The finger comes back to a resting line: it goes on from there. */
  resume(t: number, a: number, u: number): boolean {
    const s = this.stroke;
    if (!s || this.over || !s.resting || !this.near(a)) return false;
    s.raw += angleDiff(a, s.a); s.a = a; s.t = t; s.resting = false;
    s.u = u + this.push(a, s.ts); s.pu = s.u;
    return true;
  }

  /** The pen moves to angle a, u band units from the bark, at time t. */
  move(t: number, a: number, u: number): void {
    const s = this.stroke;
    if (!s || this.over || s.resting) return;
    const dt = t - s.t;
    if (dt <= 0) return;
    const da = angleDiff(a, s.a);
    s.a = a; s.raw += da; s.t = t; s.ts += Math.min(dt, 0.1);
    // (The place as drawn, with the weather's push: the low-pass at the close does the smoothing, so a
    // hesitation is never a spike. The pace, smoothed over a breath, sets only the tone.)
    s.u = u + this.push(a, s.ts);
    s.w += (Math.abs(da) / dt - s.w) * (1 - Math.exp(-dt / 0.25));
    if (!s.dir) {
      if (Math.abs(s.raw) < 0.05) { s.pu = s.u; return; }
      s.dir = Math.sign(s.raw);
    }
    const tone = Math.max(0, Math.min(1, 0.5 + 0.45 * Math.log2(TAU / this.k.calmPace / Math.max(0.05, s.w))));
    const p = Math.min(TAU, s.dir * s.raw);
    if (p > s.done) {
      // Each point the line has passed since the last, between the two.
      // (The same rounding both ends: a point on the boundary is drawn once, however slowly the line comes to it.)
      const k0 = Math.max(0, Math.floor(s.done / STEP + 1e-9) + 1), k1 = Math.min(K - 1, Math.floor(p / STEP + 1e-9));
      const i0 = Math.round(s.start / STEP), span = p - s.done;
      for (let j = k0; j <= k1; j++) {
        const f = span > 0 ? Math.max(0, Math.min(1, (j * STEP - s.done) / span)) : 1;
        this.paint((((i0 + s.dir * j) % K) + K) % K, s.pu + (s.u - s.pu) * f, s.pt + (tone - s.pt) * f, (j * STEP) / TAU);
      }
      s.done = p;
    }
    s.pu = s.u; s.pt = tone;
    if (s.done >= TAU - STEP * 0.5) this.close();
  }

  /** The finger lifts: the line rests where it is, to be taken up again. */
  lift(): void { if (this.stroke && !this.over) this.stroke.resting = true; }

  /** The last ring was still damp when this one began: their washes bleed together. */
  bleed(): void { if (this.rings.length) this.bleeds[this.rings.length - 1] = 1; }

  /** The line given up (the card opened mid-ring): it's drawn again from the start. */
  cancel(): void { this.stroke = null; this.state.fill(0); }

  /** Where the pen is now (for drawing it): its angle, its line's place, and its pace (rad/s). */
  get tip(): { a: number; u: number; w: number } | null {
    const s = this.stroke;
    return s ? { a: s.a, u: Math.max(0, s.u), w: s.resting ? 0 : s.w } : null;
  }

  /**
   * The edge as it will dry, so far: the drawn points low-passed (each point's weight how much drawn
   * line is near it, 0 to 1, in `weight`).
   */
  edgeNow(weight?: Float32Array): Float32Array {
    const w = new Float32Array(K);
    for (let i = 0; i < K; i++) w[i] = this.state[i] === 1 ? 1 : 0;
    const out = lowpass(this.hi, w, this.k.smooth / STEP, new Float32Array(K), weight);
    return out;
  }

  /** The weather's push on the line, outward (band units), at angle a, ts seconds into the stroke. */
  private push(a: number, ts: number): number {
    const w = this.weatherNow, k = this.k;
    let p = k.sun * Math.cos(a - k.sunAngle);
    if (w === RAIN) p += k.rainBleed * (0.7 + 0.3 * Math.sin(2 * a + this.seed));
    if (w === WIND) {
      // A steady drift, gathering in the first moments, gusting a little.
      const gust = Math.min(1, ts / 0.8), g = gust * gust * (3 - 2 * gust);
      p += k.wind * g * (0.85 + 0.15 * Math.sin(ts * 1.3 + this.seed)) * Math.cos(a - this.windOf());
    }
    // (A slow tremble, a second or so: a cold hand's, not a buzz the low-pass would hide.)
    if (w === FROST) p += k.frost * (0.6 * Math.sin(ts * 6.3 + this.seed) + 0.4 * Math.sin(ts * 10.1 + 2 * this.seed));
    return p;
  }

  /** One point of the ring drawn: its place clamped to the bark, and paid for in wood. */
  private paint(i: number, u: number, tone: number, progress: number): void {
    const s = this.stroke!, cap = this.capacity;
    this.at[i] = progress;
    this.tone[i] = tone;
    this.inkAt[i] = Math.max(0, 1 - s.spent / cap);
    if (!this.alive[i]) { this.state[i] = 2; return; } // (dead wood takes none)
    u = Math.max(0, u);
    // The wood is an area: once it's spent, the line trails on thin.
    if (s.spent >= cap) u = Math.min(u, this.k.dryTrail);
    else if (s.spent + u / K > cap) { u = Math.max(Math.min(u, this.k.dryTrail), (cap - s.spent) * K); s.spent = cap; }
    else s.spent += u / K;
    this.hi[i] = u;
    this.state[i] = 1;
  }

  // ---------------------------------------------------------------- a ring laid
  private close(): void {
    const s = this.stroke!, k = this.k, n = this.rings.length, wx = this.weatherNow;
    // The edge, low-passed round the circle (dead wood aside): a shaky hand's line, gently uneven.
    const drawn = new Float32Array(K);
    for (let i = 0; i < K; i++) drawn[i] = this.state[i] === 1 ? 1 : 0;
    const uo = lowpass(this.hi, drawn, k.smooth / STEP);
    // The living wood beside a wound rolls over it: a callus, thickest at the wound's edges.
    const roll = lowpass(this.hi, drawn.map(() => 1), k.roll / STEP);
    for (let i = 0; i < K; i++) if (!drawn[i]) uo[i] = 0.85 * roll[i] * (1 - Math.exp(-roll[i] / 0.15));
    const grace = n < k.grace;
    // Too thin two rings running, and the cambium there dies (judged a few points at a time: a pinch is
    // only a pinch); where a callus has rolled over dead wood far enough, it lives again.
    const sector = (i: number) => { let t = 0; for (let j = -2; j <= 2; j++) t += uo[(i + j + K) % K]; return t / 5; };
    const dying = new Uint8Array(K);
    let died = 0, healed = 0;
    for (let i = 0; i < K; i++) {
      const thin = sector(i) < k.thin;
      if (this.alive[i] && !grace && thin && this.stressed[i]) { dying[i] = 1; died++; }
      if (!this.alive[i] && uo[i] >= k.thin) { this.alive[i] = 1; this.burnt[i] = 0; healed++; }
      this.stressed[i] = thin && !grace ? 1 : 0;
    }
    // (In the first rings nothing dies, and a thin stretch is only thin: the rings after cover it.)
    const w = this.wRef, ring = new Float32Array(K);
    for (let i = 0; i < K; i++) ring[i] = this.inner(i) + w * uo[i];
    for (const [from, len] of runs((i) => dying[i] === 1)) {
      if (len === K) { this.wounds.push({ ring: n, a0: 0, a1: TAU }); break; }
      this.wounds.push({ ring: n, a0: from * STEP, a1: (from + len) * STEP });
    }
    for (let i = 0; i < K; i++) if (dying[i]) this.alive[i] = 0;
    if (died) this.news.push({ kind: 'died', ring: n, count: died });
    if (healed) this.news.push({ kind: 'healed', ring: n, count: healed });
    // How true a circle it came out: the outer edge's spread about its mean, in steady widths (the
    // living wood only: a wound's notch is the fire's, not the hand's).
    let sum = 0, sq = 0, m = 0;
    for (let i = 0; i < K; i++) if (drawn[i]) { sum += ring[i]; m++; }
    const mean = m ? sum / m : 0;
    for (let i = 0; i < K; i++) if (drawn[i]) sq += (ring[i] - mean) ** 2;
    const spread = m ? Math.sqrt(sq / m) / w : 1;
    this.ringEven.push(Math.max(0, Math.min(1, 1 - 1.5 * spread)) * (m / K) ** 0.5);
    // The tone round the ring, every eighth point, low-passed as the edge is.
    const tone = lowpass(this.tone, drawn.map(() => 1), k.smooth / STEP), kept = new Float32Array(K / 8);
    for (let j = 0; j < K / 8; j++) kept[j] = tone[j * 8];
    // The vigour: fed by the wood laid, against the need, which rises in old age.
    let all = 0;
    for (let i = 0; i < K; i++) all += uo[i];
    const need = k.need * (1 + 0.8 * this.old);
    this.vigour = Math.min(1.25, this.vigour + k.feed * (all / K - need));
    if (grace) this.vigour = Math.max(0.4, this.vigour);
    this.rings.push(ring);
    this.tones.push(kept);
    this.starts.push(s.start);
    this.dirs.push(s.dir || 1);
    this.ringWeather.push(wx);
    this.hi.set(uo);
    for (let i = 0; i < K; i++) this.state[i] = drawn[i] ? 1 : this.state[i];
    this.stroke = null;
    this.laidW = w;
    this.news.push({ kind: 'ring', ring: n });
    // A fire before the next ring scorches a sector on the uphill side, which takes no wood.
    const next = this.rings.length;
    if (this.fireBefore(next) && !k.fireKills) {
      // (Only colour now: the fire is a bloom on the paper, and the wood grows on.)
      this.scars.push({ ring: next, angle: k.uphill + (hash(this.seed * 7 + next) - 0.5) * 0.6, half: 0 });
      this.news.push({ kind: 'fire', ring: next, angle: this.scars[this.scars.length - 1].angle });
    } else if (this.fireBefore(next)) {
      const half = k.fireHalf * (1.2 - 0.4 * Math.min(1, Math.max(0, this.vigour))), angle = k.uphill + (hash(this.seed * 7 + next) - 0.5) * 0.6;
      for (let i = 0; i < K; i++) if (Math.abs(angleDiff(i * STEP, angle)) <= half) { this.alive[i] = 0; this.burnt[i] = 1; }
      this.scars.push({ ring: next, angle, half });
      this.vigour -= k.fireCost;
      this.news.push({ kind: 'fire', ring: next, angle });
    }
    if (k.endless) {
      // (Wandering, the tree never dies: past half its girth dead, the cambium wakes again.)
      if (this.living < 0.5) for (let i = 0; i < K; i++) if (!this.burnt[i]) this.alive[i] = 1;
      this.vigour = Math.max(0.1, this.vigour);
      return;
    }
    if (next < k.grace) return;
    if (this.living < k.deadFall) this.fall(this.year >= k.oldFrom ? 'old' : 'withered');
    else if (this.vigour <= 0) this.fall(this.year >= k.oldFrom ? 'old' : 'starved');
  }

  /** The end of its life: it falls. (In wander, only when it's felled.) */
  fall(cause: NonNullable<TreeSim['cause']> = 'felled'): void {
    if (this.over) return;
    this.over = true;
    this.stroke = null;
    this.state.fill(0);
    this.cause = cause;
    this.vigour = Math.max(0, this.vigour);
    this.news.push({ kind: 'fell', ring: this.rings.length });
  }

  /** The slice's evenness, 0 to 1: how true a circle round the pith each ring came out. */
  get evenness(): number {
    if (!this.ringEven.length) return 1;
    let s = 0;
    for (const e of this.ringEven) s += e;
    return s / this.ringEven.length;
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

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth value noise, 0 to 1. */
export function noise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
