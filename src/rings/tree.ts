/**
 * Annulus: you are one tree, and this is its trunk, seen in cross-section. Each year adds a ring.
 *
 * It's played as the volcano is, by how it's held:
 *   held level, the year's sap gathers under whatever side is uppermost;
 *   tipped, the year's growth pours toward the low side: the ring grows wide there and thin
 *     opposite, as real trees grow eccentric rings;
 *   tip soon, and the ring is thin and even; hold until the sap is heavy, then tip, for a surge
 *     year; hold too long and the trunk splits: a frost crack, as the volcano's caldera.
 *
 * The weather acts on the slice as forces: rain widens the ring, drought thins it, the sun from one
 * side pulls growth toward it, and fire leaves a permanent scar, which the rings after it roll over.
 *
 * The tree lives on its vigour: what a year's ring feeds it (wood on the sunny side feeds more than
 * wood in the shade), less what it needs, which rises as it grows old. Thin years starve it; surges
 * feed it. When the vigour is gone, the tree falls.
 *
 * Everything here is in the tree's own frame: angles measured from its east, anticlockwise, radii
 * in millimetres. How it's drawn and held is main.ts's business, so this can be played by a bot
 * (scripts/playtest.ts) and tested without a browser.
 */

/** Points round each ring. */
export const K = 240;
const TAU = Math.PI * 2;
/** Each year's pen starts a golden angle on from the last, so no seam of pale and dark lines up. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export interface Rules {
  /** Seconds a year takes. */
  yearSeconds: number;
  /** The radius of the pith, the first year's wood (mm). */
  pith: number;
  /** A thin year's ring, its mean width (mm): what grows of itself, sap or none. */
  base: number;
  /** Sap gathered in a year, held level. */
  gather: number;
  /** Sap poured in a year is a surge from here. */
  heavy: number;
  /** Sap held to here, and the trunk splits. */
  crack: number;
  /** Sap poured in a year, at a full tip. */
  pour: number;
  /** Ring (mean width, mm) a unit of sap makes. */
  sapWidth: number;
  /** A tip less than this is still level (a hand isn't still). */
  dead: number;
  /** Where the sun is, and how much it pulls the growth toward it. */
  sunAngle: number;
  sunPull: number;
  /** How much more wood on the sunny side feeds the tree than wood on the shaded side. */
  light: number;
  /** Uphill: where fire scars it (leaves pile up against a trunk on its uphill side, and burn there). */
  uphill: number;
  /** Food (light-weighted mean ring width, mm) a year needs, while the tree is in its prime. */
  need: number;
  /** Vigour gained (or lost) for each mm of food above (or below) the need. */
  feed: number;
  /** Vigour a surge year gives besides (a surge grows the crown, which feeds the years after). */
  surgeFeed: number;
  /** The need starts rising at this age, and is twice what it was `oldOver` years on. */
  oldFrom: number;
  oldOver: number;
  /** What a frost crack costs the vigour; and the age before which the trunk is too slender to crack. */
  crackCost: number;
  crackFrom: number;
  /** A young tree, its crown small, needs a share of the full need: this much at first, all of it by `fullFrom` years. */
  youngNeed: number;
  fullFrom: number;
  /** Years between spells of rain, and how long they last; and of drought. */
  rainEvery: [number, number];
  rainLasts: [number, number];
  droughtEvery: [number, number];
  droughtLasts: [number, number];
  /** Windows of years in which a fire comes (one in each). */
  fires: [number, number][];
  /** Half the arc a fire kills (radians), at full vigour; and what it costs the vigour. */
  fireArc: number;
  fireCost: number;
  /** Radians a year a scar's edges roll in over it. */
  heal: number;
  /** Never falls (wander). */
  endless: boolean;
}

export const OAK: Rules = {
  yearSeconds: 1.25,
  pith: 2.5,
  base: 0.42,
  gather: 1,
  heavy: 3,
  crack: 5.5,
  pour: 6,
  sapWidth: 0.95,
  dead: 0.12,
  sunAngle: 0,
  sunPull: 0.4,
  light: 0.5,
  uphill: Math.PI,
  need: 1.3,
  feed: 0.05,
  surgeFeed: 0.08,
  oldFrom: 255,
  oldOver: 110,
  crackCost: 0.15,
  crackFrom: 25,
  youngNeed: 0.3,
  fullFrom: 50,
  rainEvery: [9, 22],
  rainLasts: [2, 5],
  droughtEvery: [14, 30],
  droughtLasts: [2, 4],
  fires: [[110, 190], [230, 290]],
  fireArc: 0.55,
  fireCost: 0.08,
  heal: 0.035,
  endless: false,
};

export type Weather = 0 | 1 | 2;
export const RAIN = 1, DROUGHT = 2;
export type News = { kind: 'ring' | 'surge' | 'crack' | 'fire' | 'rain' | 'drought' | 'fell'; year: number; angle?: number };

/** A fire's scar: where, how wide it was, and how much of it is still open. */
export interface Scar { year: number; angle: number; half: number; open: number }
export interface Crack { year: number; angle: number; depth: number }

const MAX_YEARS = 2000;

export class TreeSim {
  readonly k: Rules;
  readonly seed: number;
  /** Each year's weather, and the years a fire comes. */
  readonly weather: Uint8Array;
  readonly fireYears: number[];

  /** Rings laid, the age in years. */
  year = 0;
  /** How far round this year has gone, 0 to 1. */
  t = 0;
  seconds = 0;
  sap = 0;
  vigour = 1;
  /** Each ring's outer edge, radius at each of K angles. */
  readonly rings: Float32Array[] = [];
  /** Where each ring's pen began, its sap poured, and its weather. */
  readonly starts: number[] = [];
  readonly poured: number[] = [];
  readonly ringWeather: number[] = [];
  /** This year's growth so far, at each angle. */
  readonly cur = new Float32Array(K);
  pouredYear = 0;
  /** Where this year's pen began (each year's a golden angle on from the last). */
  yearStart = Math.PI / 2;
  surges = 0;
  readonly scars: Scar[] = [];
  readonly cracks: Crack[] = [];
  /** Where the sap is lying (it slides round to the low side as it's poured). */
  sapAngle = Math.PI / 2;
  over = false;
  cause: 'old' | 'starved' | 'cracked' | 'burnt' | 'felled' | null = null;
  readonly news: News[] = [];

  // ---- held: set before each step
  /** Uppermost, in the tree's frame: where the sap gathers. */
  up = Math.PI / 2;
  /** The low side, and how far it's tipped (0 level, 1 fully). */
  low = -Math.PI / 2;
  tilt = 0;

  /** Scratch: this step's share of the growth at each angle. */
  private share = new Float32Array(K);

  constructor(seed = 1, rules: Partial<Rules> = {}) {
    this.k = { ...OAK, ...rules };
    this.seed = seed;
    let s = (seed * 9301 + 49297) % 233280;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const between = ([a, b]: [number, number]) => a + Math.floor(rnd() * (b - a + 1));
    this.weather = new Uint8Array(MAX_YEARS);
    // Rain and drought, each in spells, each spell some years after the last; drought where rain isn't.
    for (let y = between(this.k.rainEvery); y < MAX_YEARS; y += between(this.k.rainEvery)) {
      const n = between(this.k.rainLasts);
      for (let i = 0; i < n && y < MAX_YEARS; i++, y++) this.weather[y] = RAIN;
    }
    for (let y = between(this.k.droughtEvery); y < MAX_YEARS; y += between(this.k.droughtEvery)) {
      const n = between(this.k.droughtLasts);
      for (let i = 0; i < n && y < MAX_YEARS; i++, y++) if (!this.weather[y]) this.weather[y] = DROUGHT;
    }
    this.fireYears = this.k.fires.map((w) => between(w));
  }

  /** This year's weather. */
  get weatherNow(): Weather { return this.weather[Math.min(this.year, MAX_YEARS - 1)] as Weather; }

  /** How full the sap is: 1 when it's heavy enough to surge; `crack / heavy` splits. */
  get fullness(): number { return this.sap / this.k.heavy; }
  get brink(): number { return this.sap / this.k.crack; }

  /** How far tipped counts for, past the dead zone, 0 to 1. */
  get tipped(): number { return Math.max(0, Math.min(1, (this.tilt - this.k.dead) / (1 - this.k.dead))); }

  /** The radius of the last ring laid (or the pith) at sample i. */
  inner(i: number): number { return this.rings.length ? this.rings[this.rings.length - 1][i] : this.k.pith; }
  /** The bark's radius now: the last ring and this year's growth. */
  outer(i: number): number { return this.inner(i) + this.cur[i]; }

  /** Whether the wood at angle a is alive (0 dead under an open scar, 1 alive), and how much a scar's edge rolls in there. */
  private alive(a: number): { alive: number; edge: number } {
    let alive = 1, edge = 0;
    for (const s of this.scars) {
      if (s.open <= 0) continue;
      // (Eased at the edge: cut off sharp, the rings stepped round the scar in a jagged bark.)
      const d = Math.abs(angleDiff(a, s.angle)), e = Math.max(0, Math.min(1, (d - s.open) / 0.08));
      alive = Math.min(alive, e * e * (3 - 2 * e));
      if (d > s.open && d < s.open + 0.25) edge = Math.max(edge, Math.sin((Math.PI * (d - s.open)) / 0.25));
    }
    return { alive, edge };
  }

  step(dt: number): void {
    if (this.over) return;
    const k = this.k, f = dt / k.yearSeconds, w = this.weatherNow, m = this.tipped;
    this.seconds += dt;
    // The sap lies under the uppermost side; tipped, it slides round to the low side as it pours.
    const target = m > 0 ? this.low : this.up;
    this.sapAngle += angleDiff(target, this.sapAngle) * Math.min(1, dt * (m > 0 ? 5 : 1.5));
    let poured = 0;
    if (m > 0) {
      poured = Math.min(this.sap, k.pour * m * f);
      this.sap -= poured;
      this.pouredYear += poured;
    } else {
      this.sap += k.gather * (w === RAIN ? 1.6 : w === DROUGHT ? 0.4 : 1) * f;
    }
    // (In a drought what's held dries, a little.)
    if (w === DROUGHT) this.sap = Math.max(0, this.sap - 0.25 * this.sap * f);
    const mean = k.base * (w === RAIN ? 1.4 : w === DROUGHT ? 0.5 : 1) * f + poured * k.sapWidth;
    // Where it goes: evenly, or poured toward the low side by how far it's tipped; and drawn toward
    // the sun. Dead wood under a scar grows nothing, and its edges roll in over it.
    let sum = 0;
    for (let i = 0; i < K; i++) {
      const a = (i / K) * TAU;
      const s = 1 + 0.9 * m * Math.cos(a - this.low) + k.sunPull * Math.cos(a - k.sunAngle);
      sum += s;
      const { alive, edge } = this.alive(a);
      this.share[i] = s * alive * (1 + 0.8 * edge);
    }
    const norm = K / sum;
    if (mean > 0) for (let i = 0; i < K; i++) this.cur[i] += mean * this.share[i] * norm;
    // Held too long: the trunk splits where the sap lay. (A sapling's thin trunk doesn't split: its sap
    // waits, full, till it's poured, as the volcano's does. Frost cracks come in trunks grown wide.)
    if (this.sap >= k.crack && this.year < k.crackFrom) this.sap = k.crack * 0.999;
    else if (this.sap >= k.crack) {
      this.cracks.push({ year: this.year, angle: this.sapAngle, depth: 0.25 + 0.15 * hash(this.seed + this.cracks.length) });
      this.sap = 0;
      this.vigour -= k.crackCost;
      this.news.push({ kind: 'crack', year: this.year, angle: this.sapAngle });
      if (this.vigour <= 0 && !k.endless) return this.fall('cracked');
    }
    this.t += f;
    if (this.t >= 1) this.endYear();
  }

  private endYear(): void {
    const k = this.k, ring = new Float32Array(K);
    // A frost crack is closed over by a rib: a little more wood beside it for some years after.
    let food = 0;
    for (let i = 0; i < K; i++) {
      const a = (i / K) * TAU;
      // (The strongest rib, not their sum: cracks again and again in one place had built a spike.)
      let rib = 0;
      for (const c of this.cracks) {
        const since = this.year - c.year;
        if (since < 20) rib = Math.max(rib, 0.15 * Math.exp(-since / 6) * Math.max(0, 1 - Math.abs(angleDiff(a, c.angle)) / 0.12));
      }
      ring[i] = this.inner(i) + this.cur[i] + rib;
      food += this.cur[i] * (1 + k.light * Math.cos(a - k.sunAngle));
    }
    food /= K;
    const old = Math.max(0, this.year - k.oldFrom) / k.oldOver, young = Math.min(1, k.youngNeed + ((1 - k.youngNeed) * this.year) / k.fullFrom), need = k.need * young * (1 + old);
    const surge = this.pouredYear >= k.heavy * 0.8;
    this.vigour = Math.min(1, this.vigour + k.feed * (food - need) + (surge ? k.surgeFeed : 0));
    this.rings.push(ring);
    this.starts.push(this.yearStart);
    this.yearStart = (this.yearStart + GOLDEN) % TAU;
    this.poured.push(this.pouredYear);
    this.ringWeather.push(this.weatherNow);
    if (surge) this.surges++;
    this.year++;
    this.t -= 1;
    this.cur.fill(0);
    this.pouredYear = 0;
    this.news.push({ kind: surge ? 'surge' : 'ring', year: this.year });
    // Scars close a little each year, faster where the wood is growing well.
    for (const s of this.scars) if (s.open > 0) s.open = Math.max(0, s.open - k.heal * (0.6 + Math.min(1.4, food)));
    // What the new year brings.
    const w = this.weatherNow;
    if (w && w !== this.weather[this.year - 1]) this.news.push({ kind: w === RAIN ? 'rain' : 'drought', year: this.year });
    if (this.fireYears.includes(this.year)) {
      const half = k.fireArc * (1.25 - 0.5 * Math.max(0, this.vigour)), angle = k.uphill + (hash(this.seed * 7 + this.year) - 0.5) * 0.5;
      this.scars.push({ year: this.year, angle, half, open: half });
      this.vigour -= k.fireCost;
      this.news.push({ kind: 'fire', year: this.year, angle });
    }
    if (this.vigour <= 0 && !k.endless && !this.over) this.fall(old > 0.05 ? 'old' : this.scars.length && this.scars[this.scars.length - 1].year === this.year ? 'burnt' : 'starved');
    if (k.endless) this.vigour = Math.max(0.05, this.vigour);
  }


  /** The end of its life: it falls. (In wander, only when it's felled.) */
  fall(cause: NonNullable<TreeSim['cause']> = 'felled'): void {
    if (this.over) return;
    this.over = true;
    // (The year it fell in is laid as far as it got.)
    if (this.t > 0.05) this.endYear();
    this.t = 0;
    this.cause = cause;
    this.vigour = Math.max(0, this.vigour);
    this.news.push({ kind: 'fell', year: this.year });
  }

  /**
   * The slice's evenness, 0 to 1: half how round it is, centred on its pith (roundnessOf), and half how
   * alike its rings are, year to year (grainOf): a slow, even-grained oak is the cabinetmaker's prize,
   * and every surge year is a wide ring among thin ones.
   */
  get evenness(): number {
    return this.rings.length ? 0.5 * roundnessOf(this.rings[this.rings.length - 1]) + 0.5 * this.grain : 1;
  }
  /** How alike the rings are, 1 all the same width: the mean change in width from one year to the next, against the mean width. */
  get grain(): number {
    const n = this.rings.length;
    if (n < 3) return 1;
    let total = 0, change = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let j = 0; j < K; j += 6) w += this.rings[i][j] - (i ? this.rings[i - 1][j] : this.k.pith);
      w /= K / 6;
      total += w;
      if (i) change += Math.abs(w - prev);
      prev = w;
    }
    return Math.max(0, Math.min(1, 1 - (0.5 * change) / (n - 1) / (total / n)));
  }

  /** Mean radius of the bark (mm). */
  get radius(): number {
    let s = 0;
    for (let i = 0; i < K; i++) s += this.outer(i);
    return s / K;
  }
}

/**
 * How round a ring is: its pith's offset from its middle (the first harmonic of its radius, as a share
 * of its mean), and how far it wanders from that circle besides. 1 is a perfect circle round the pith.
 */
export function roundnessOf(r: Float32Array | null): number {
  if (!r) return 1;
  let a0 = 0, a1 = 0, b1 = 0;
  for (let i = 0; i < K; i++) { const a = (i / K) * TAU; a0 += r[i]; a1 += r[i] * Math.cos(a); b1 += r[i] * Math.sin(a); }
  a0 /= K; a1 *= 2 / K; b1 *= 2 / K;
  let rest = 0;
  for (let i = 0; i < K; i++) { const a = (i / K) * TAU, d = r[i] - a0 - a1 * Math.cos(a) - b1 * Math.sin(a); rest += d * d; }
  rest = Math.sqrt(rest / K);
  return Math.max(0, Math.min(1, 1 - (2 * Math.hypot(a1, b1) + 3 * rest) / a0));
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
