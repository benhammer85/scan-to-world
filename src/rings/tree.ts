/**
 * Well Rounded: you are one tree, and this is its trunk, seen in cross-section. Each ring is painted by
 * hand, in one stroke round the last, as an ensō is painted.
 *
 * The finger is the brush. Its path is the ring's outer edge (smoothed only a little, so wobbles
 * stay), and the brush's mark has a width the hand controls as a calligrapher's does: slow lays more
 * ink, so the wood is wide there; quick gives a thin line. The brush holds one ring's ink (the sap):
 * at the steady pace it lasts exactly once round, so lingering on one side means hurrying on
 * another, and a brush spent before the circle closes trails off into a dry line.
 *
 *   Every ring needs a minimum width all the way round, or the cambium there dies: that sector stops
 *     growing, and reads as a wound the rings after it must roll over (wide wood beside a wound heals
 *     it faster).
 *   A gap where the finger lifted stays as a flaw: a small one a crack, a large one dead wood.
 *   The ring may not cross inside the last: wood can't shrink. A stroke that tries is clamped to it.
 *   The trunk grows: each ring is longer, while the ink per ring levels off, so old rings come out
 *     thin, as in real trees, and the minimum width grows harder to keep.
 *
 * The weather acts on the brush, never in words: rain wets the paper (the edge bleeds outward,
 * wider and untidy), drought dries the brush (scratchy, broken, little ink), wind pushes the stroke
 * sideways, frost makes the brush stiff and jittery, the sun from the south widens the lit side by
 * itself, and fire scorches a sector that won't take ink. Each is known a ring or two ahead.
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
  /** The least wood a ring must lay everywhere (mm), or the cambium there dies. */
  minWidth: number;
  /** Seconds a full brush lasts at the steady pace: a sapling's ring, and an old tree's (by its radius, mm). */
  strokeSeconds: [number, number];
  strokeAt: number;
  /** The brush's half-mark at its widest and thinnest (band units). */
  widest: number;
  thinnest: number;
  /** Where the sun is, and how much it widens the lit side by itself. */
  sunAngle: number;
  sun: number;
  /** Uphill: where fire scars it (leaves pile up against a trunk on its uphill side, and burn there). */
  uphill: number;
  /** Rings of calm to learn in, then rings between spells of each weather, and how long they last. */
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
  /** Windows of rings in which a fire comes (one in each); half the arc it scorches; what it costs. */
  fires: [number, number][];
  fireHalf: number;
  fireCost: number;
  /** Points of a wound rolled over each ring from each edge, for each band unit of wood beside it. */
  heal: number;
  /** A gap up to this (radians) is a crack, bridged; a wider one is dead wood. */
  crackGap: number;
  /** The tree falls when less than this share of its cambium lives. */
  deadFall: number;
  /** Vigour: each ring feeds it by how much wood was laid (band units, mean round) against the need. */
  need: number;
  feed: number;
  /** Never falls (wander). */
  endless: boolean;
}

export const OAK: Rules = {
  yearsPerRing: 5,
  pith: 6,
  crown: 14000,
  crownYears: 60,
  oldFrom: 300,
  oldTo: 440,
  oldInk: 0.45,
  minWidth: 2.0,
  strokeSeconds: [2.8, 5.4],
  strokeAt: 420,
  widest: 3,
  thinnest: 0.12,
  sunAngle: -Math.PI / 2,
  sun: 0.32,
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
  droughtInk: 0.72,
  dry: 0.55,
  wind: 0.6,
  frost: 0.25,
  frostInk: 0.92,
  fires: [[22, 36], [46, 56]],
  fireHalf: 0.35,
  fireCost: 0.1,
  heal: 3,
  crackGap: 0.3,
  deadFall: 0.5,
  need: 0.7,
  feed: 0.35,
  endless: false,
};

export type News = { kind: 'ring' | 'died' | 'crack' | 'gap' | 'fire' | 'fell'; ring: number; angle?: number; count?: number };

/** A fire's scar: on the boundary before ring `ring`, where, and how wide. */
export interface Scar { ring: number; angle: number; half: number }
/** A crack where a stroke didn't close: in ring `ring`, at an angle. */
export interface Crack { ring: number; angle: number; depth: number }
/** Where the cambium died, under ring `ring`'s line, from angle a0 anticlockwise to a1. */
export interface Wound { ring: number; a0: number; a1: number }

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
  /** Where each ring's stroke began, which way it went, its weather, and how even it came out. */
  readonly starts: number[] = [];
  readonly dirs: number[] = [];
  readonly ringWeather: number[] = [];
  readonly ringEven: number[] = [];
  /** Whether the cambium lives at each angle (1) or is dead under a wound (0); and if fire killed it (1). */
  readonly alive = new Uint8Array(K).fill(1);
  readonly burnt = new Uint8Array(K);
  vigour = 1;
  readonly scars: Scar[] = [];
  readonly cracks: Crack[] = [];
  readonly wounds: Wound[] = [];
  /** Rings left open wider than a crack (their gap dead wood). */
  gaps = 0;
  over = false;
  cause: 'old' | 'starved' | 'withered' | 'felled' | null = null;
  readonly news: News[] = [];

  // ---- the stroke being painted (never kept: a stroke cut off is painted again)
  stroke: Stroke | null = null;
  /** The steady width (mm) the last ring dried to: its marks (below) stay till the next stroke, to be seen drying. */
  laidW = 0;
  /** Each point's mark (band units from the bark, inner and outer), how far round the stroke was, the ink then; and its state (0 not yet, 1 painted, 2 refused: dead wood). */
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
    // Each weather in spells, some rings apart; the first few rings calm, to learn the brush in. Rain
    // first, then drought where it isn't raining, then wind and frost in what's left.
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
  /** The bark (as `inner`): the stroke being painted is wet, and not yet wood. */
  outer(i: number): number { return this.inner(i); }

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
    // (The crown is slow to start: a seedling's first rings are narrow, so they're painted round a pith
    // a finger can circle, not one a few pixels wide.)
    return k.crown * (1 - Math.exp(-((age / k.crownYears) ** 1.4))) * (1 - (1 - k.oldInk) * old * old * (3 - 2 * old));
  }
  /** The steady ring's width (mm): the full ink, spread evenly round the bark. */
  get wRef(): number {
    const R = this.radius;
    return Math.sqrt(R * R + this.inkMm / Math.PI) - R;
  }
  /** The least width a ring must lay, in band units: harder as the rings thin. */
  get uMin(): number { return this.k.minWidth / this.wRef; }
  /** Seconds the full brush lasts at the steady pace (longer as the trunk grows). */
  get strokeSeconds(): number {
    const [a, b] = this.k.strokeSeconds, f = Math.min(1, this.radius / this.k.strokeAt);
    return a + (b - a) * f * f * (3 - 2 * f);
  }
  /** What the brush holds this ring: the weather's ink, less when the tree is weak. */
  get capacity(): number {
    const w = this.weatherNow, k = this.k;
    const weather = w === RAIN ? k.rainInk : w === DROUGHT ? k.droughtInk : w === FROST ? k.frostInk : 1;
    return weather * (0.6 + 0.4 * Math.min(1, Math.max(0, this.vigour)));
  }
  /** The ink left in the brush, as a share of what it held (1 before the stroke). */
  get inkLeft(): number { return this.stroke ? this.stroke.ink / this.capacity : 1; }
  /** How far round the stroke has painted, 0 to 1. */
  get progress(): number { return this.stroke ? this.stroke.done / TAU : 0; }
  /** The share of the cambium alive. */
  get living(): number { let n = 0; for (let i = 0; i < K; i++) n += this.alive[i]; return n / K; }

  // ---------------------------------------------------------------- the brush
  /** The brush touches down at angle a, u band units from the bark, at time t (s). */
  begin(t: number, a: number, u: number): boolean {
    if (this.over || this.stroke) return false;
    this.lo.fill(0); this.hi.fill(0); this.at.fill(0); this.inkAt.fill(0); this.state.fill(0);
    const push = this.push(a, 0);
    // (The brush touches down already moving at about the steady pace: a hand sweeps into an ensō.)
    this.stroke = { t0: t, t, a, raw: 0, start: a, dir: 0, done: -1e-9, u: u + push, w: (0.8 * TAU) / this.strokeSeconds, pu: u + push, ph: 1, ink: this.capacity };
    return true;
  }

  /** The brush moves to angle a, u band units from the bark, at time t. */
  move(t: number, a: number, u: number): void {
    const s = this.stroke;
    if (!s || this.over) return;
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

  /** The brush lifts: the ring is laid as far as it went, a gap where it didn't. */
  lift(): void { if (this.stroke && !this.over) this.close(); }

  /** Where the brush's mark is now (for drawing it): its angle, offset and half-mark. */
  get tip(): { a: number; u: number; h: number } | null {
    const s = this.stroke;
    return s ? { a: s.a, u: s.u, h: s.ph } : null;
  }

  /** The weather's push on the brush, outward (band units), at angle a, ts seconds into the stroke. */
  private push(a: number, ts: number): number {
    const w = this.weatherNow, k = this.k;
    if (w === WIND) {
      // A steady drift, gathering in the first moments, gusting a little.
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
    h = Math.max(k.thinnest, Math.min(wx === DROUGHT ? k.widest * 0.6 : k.widest, h));
    // A loaded brush blots: a wide mark is a less tidy one.
    if (h > 1.4) h *= 1 + 0.32 * (h - 1.4) * (noise(a * 7 + this.seed + this.rings.length * 3.3) - 0.5);
    h *= 1 + k.sun * Math.cos(a - k.sunAngle);
    if (wx === RAIN) h *= 1.1;
    if (wx === DROUGHT) h *= 1 - k.dry * smooth((noise(a * 13 + this.rings.length * 5.1 + this.seed) - 0.35) / 0.35);
    if (wx === FROST) h *= 1 + 0.2 * Math.sin(ts * 53 + 3 * this.seed);
    // Running dry: the last tenth of the ink thins the mark as it goes.
    const f = ink / (0.1 * this.capacity);
    if (f < 1) h *= 0.25 + 0.75 * Math.sqrt(Math.max(0, f));
    return h;
  }

  /** One point of the ring painted: its mark clamped to the bark, and paid for in ink. */
  private paint(i: number, u: number, h: number, progress: number): void {
    const s = this.stroke!;
    this.at[i] = progress;
    this.inkAt[i] = s.ink / this.capacity;
    if (!this.alive[i]) { this.state[i] = 2; return; } // (dead wood won't take the ink)
    let hi = Math.max(0, u + h);
    const lo = Math.max(0, u - h), cost = hi / K;
    if (cost > s.ink) { hi = s.ink * K; s.ink = 0; } else s.ink -= cost;
    this.hi[i] = hi; this.lo[i] = Math.min(lo, hi);
    this.state[i] = 1;
  }

  // ---------------------------------------------------------------- a ring laid
  private close(): void {
    const s = this.stroke!, k = this.k, n = this.rings.length, wx = this.weatherNow;
    const uo = new Float32Array(K);
    for (let i = 0; i < K; i++) uo[i] = this.state[i] === 1 ? this.hi[i] : 0;
    // (Very lightly smoothed between painted neighbours: a brush's edge, not a pixel's.)
    const raw = uo.slice();
    for (let i = 0; i < K; i++) {
      if (this.state[i] !== 1) continue;
      const l = (i + K - 1) % K, r = (i + 1) % K;
      if (this.state[l] === 1 && this.state[r] === 1) uo[i] = 0.25 * raw[l] + 0.5 * raw[i] + 0.25 * raw[r];
    }
    // Rain: the wet edge bleeds outward, unevenly.
    if (wx === RAIN) for (let i = 0; i < K; i++) if (this.state[i] === 1 && uo[i] > 0) uo[i] += k.rainBleed * (0.15 + 0.85 * noise(i * 0.35 + n * 7.7 + this.seed));
    const uMin = this.uMin;
    // Gaps where the brush never went: a small one a crack (bridged with callus), a large one dead.
    let gaps = 0;
    for (const [from, len] of runs((i) => this.state[i] === 0)) {
      if (len === K) break;
      const mid = ((from + len / 2) % K) * STEP;
      if (len * STEP <= k.crackGap) {
        for (let j = 0; j < len; j++) uo[(from + j) % K] = uMin * 1.05;
        this.cracks.push({ ring: n, angle: mid, depth: 0.5 + 0.3 * hash(this.seed + n) });
        this.news.push({ kind: 'crack', ring: n, angle: mid });
      } else { gaps++; this.gaps++; this.news.push({ kind: 'gap', ring: n, angle: mid }); }
    }
    // How even it came out: how alike its width is all round (dead wood aside), less for a flaw.
    let sum = 0, sq = 0, m = 0;
    for (let i = 0; i < K; i++) if (this.state[i] !== 2) { sum += uo[i]; sq += uo[i] * uo[i]; m++; }
    const mean = m ? sum / m : 0, cv = mean > 0 ? Math.sqrt(Math.max(0, sq / m - mean * mean)) / mean : 1;
    const flaws = this.cracks.filter((c) => c.ring === n).length;
    this.ringEven.push(Math.max(0, Math.min(1, 1 - 1.2 * cv)) * 0.9 ** flaws * 0.7 ** gaps);
    // Wounds roll over: wide wood beside a dead stretch heals it from each edge.
    const heal = new Uint8Array(K);
    for (const [from, len] of runs((i) => !this.alive[i])) {
      if (len === K) break;
      const edge = (side: number) => { let e = 0; for (let j = 1; j <= 3; j++) e += uo[(from + (side < 0 ? -j : len - 1 + j) + K * 2) % K]; return e / 3; };
      const left = Math.min(len, Math.round(k.heal * edge(-1))), right = Math.min(len - left, Math.round(k.heal * edge(1)));
      for (let j = 0; j < left; j++) heal[(from + j) % K] = 1;
      for (let j = 0; j < right; j++) heal[(from + len - 1 - j) % K] = 1;
    }
    // Too thin, and the cambium there dies.
    let died = 0;
    const dying = new Uint8Array(K);
    // (Judged a few points at a time: a sector of cambium dies, not a point. A pinch is only a pinch.)
    const sector = (i: number) => { let s = 0; for (let j = -2; j <= 2; j++) s += uo[(i + j + K) % K]; return s / 5; };
    for (let i = 0; i < K; i++) if (this.alive[i] && sector(i) < uMin) { dying[i] = 1; died++; }
    const w = this.wRef, ring = new Float32Array(K);
    for (let i = 0; i < K; i++) ring[i] = this.inner(i) + (this.state[i] === 2 ? 0 : w * uo[i]);
    for (const [from, len] of runs((i) => dying[i] === 1)) {
      if (len === K) { this.wounds.push({ ring: n, a0: 0, a1: TAU }); break; }
      this.wounds.push({ ring: n, a0: from * STEP, a1: (from + len) * STEP });
    }
    for (let i = 0; i < K; i++) { if (dying[i]) this.alive[i] = 0; if (heal[i]) { this.alive[i] = 1; this.burnt[i] = 0; } }
    if (died) this.news.push({ kind: 'died', ring: n, count: died });
    // The vigour: fed by the wood laid, against the need.
    let all = 0;
    for (let i = 0; i < K; i++) all += this.state[i] === 2 ? 0 : uo[i];
    this.vigour = Math.min(1.25, this.vigour + k.feed * (all / K - k.need));
    this.rings.push(ring);
    this.starts.push(s.start);
    this.dirs.push(s.dir || 1);
    this.ringWeather.push(wx);
    this.stroke = null;
    this.laidW = w;
    this.news.push({ kind: 'ring', ring: n });
    // A fire before the next ring scorches a sector on the uphill side, which won't take ink.
    const next = this.rings.length;
    if (this.fireBefore(next)) {
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

  /** The slice's evenness, 0 to 1: how alike each ring's width is all the way round, a set of true circles. */
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

function smooth(x: number): number { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); }

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth value noise, 0 to 1. */
export function noise(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
