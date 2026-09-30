/**
 * Volcano: you are the heat beneath a young ocean planet, a mantle plume.
 *
 * The world begins smooth: one sea over one even floor, nothing on it. You
 * have a finite store of heat, and it rises out of you by itself, fastest at
 * first and slower as the planet cools, gathering as pressure where the plume
 * is. You play it only by how you hold the world, as a globe in the hands:
 *
 *   held level, the pressure gathers; tipped, it pours out and runs down the
 *     world the way gravity would take it, into wide, low, lasting shields;
 *   tipped once it has built, it bursts: ash thrown up and falling round the
 *     vent into a tall steep cone, soft and quick to wear away, but fertile;
 *   held level too long, it bursts on its own and tears the mountain open,
 *     its summit falling into the emptied chamber as a caldera.
 *
 * The heat is buoyant, and creeps beneath the crust towards whatever is
 * uppermost, and slowly on its own besides; the land it leaves behind loses its warmth and
 * sinks, so a trail of islands is left behind it, old ones drowning as new
 * ones rise.
 *
 * Life begins in the warm water at the vents and spreads, into the shallows
 * as reefs and onto quiet land. It holds the ground together against the
 * rain and the sea, and reefs build up towards the light, so a sinking island
 * can leave a ring of reef behind. Lava clears it, ash kills it but makes the
 * ground rich, and the sky throws stones: impacts crater the ground and kill
 * what lives there (though their heat joins yours).
 *
 * Nothing opposes you but the planet itself: the sea, the rain, the sinking,
 * the stones, and the cooling, which is the clock. When the heat is gone, the
 * fire is out, and what you leave is whatever land and life last.
 *
 * This is the simulation alone, with no drawing, so it can be tested. Heights
 * are relative to the sea (0). Volumes are for a planet of `REFERENCE`
 * vertices and scale with the mesh, so a coarser test planet plays the same.
 */
import type { Topology } from '../mesh/topology';

const REFERENCE = 16002; // an icosphere of detail 40

export const VOLCANO = {
  /** The seafloor at the start: even, with only a fine roughness, so flows branch rather than following the mesh. */
  floor: -0.25,
  rough: 0.012,

  /**
   * The store of heat, and how fast it rises out: `rising` a second at first, less as the store
   * empties (as the square root of what is left), so it slows steadily and runs out after
   * `2 * heat / rising` seconds, about ten minutes, unless the sky adds to it.
   */
  heat: 420,
  rising: 1.4,
  /** Whether the heat rises evenly, at `rising` a second until it's gone, rather than fast at first and slowing. */
  steady: false,
  /** Pressure bursts out on its own at this much; above `explosive`, an eruption is a burst rather than a flow. */
  cap: 24,
  explosive: 7,
  /** Burst out on its own, it tears the mountain open: a caldera this wide and deep, and death this far. */
  caldera: 0.09,
  calderaDepth: 0.12,
  calderaKills: 0.35,
  /** Less than this, and there isn't enough to erupt. */
  least: 0.6,
  /** Seconds an eruption takes to pour out. */
  pour: 2.2,

  /** A flow also breaks out at a flank this many steps down the slope, in its own direction, taking this share. */
  flank: 5,
  flankShare: 0.6,
  /** A burst throws this share of itself up as ash, falling within `ashReach` of the vent; the rest wells out as lava. */
  ashShare: 0.65,
  ashReach: 0.1,
  /** ...kills life out to this far, and dusts the ground out to `ashDusts`, making it rich for a long while. */
  ashKills: 0.13,
  ashDusts: 0.32,
  richLasts: 240,

  /**
   * Held as a globe is held (when `gravity` is set): lava runs down the world as it is seen, its
   * relief raised this much as it is drawn, so what looks downhill is downhill. Tipped at least
   * `tipPour` (the sine of the angle from level, at the vent), the heat pours out, faster the more
   * it is tipped; tipped when it's past `explosive`, it bursts. And the heat, which is buoyant,
   * creeps towards whatever is uppermost, at this many radians a second.
   */
  relief: 0.32,
  tipPour: 0.22,
  pourLeast: 0.8,
  pourMost: 6,
  rises: 0.016,
  /** How strongly lava keeps to the steepest way down (1 spreads evenly; higher runs in tongues). */
  channel: 3,
  flow: 10,
  /** Lava cools into rock at these rates per second: slowly on land, fast in the sea. */
  coolLand: 0.2,
  coolSea: 2.4,
  /** Thinner than this, lava is simply rock; thicker than `cover`, it clears the ground it runs over. */
  thin: 0.0015,
  cover: 0.006,

  /** The plume creeps on its own at this many radians a second, and towards where you call it at this. */
  drift: 0.0022,
  creep: 0.035,
  /** Its warmth reaches about this far. Warm ground swells a little; ground that has lost its warmth sinks. */
  warmth: 0.28,
  swell: 0.00025,
  sink: 0.0004,
  /** Cooled ground sinks no further than this, all told. */
  sinks: 0.09,

  /**
   * The sea wears exposed coasts at this rate, no further than the shallows; a coast behind
   * shallows is sheltered, since the waves break before they reach it. Rain wears the heights.
   */
  waves: 0.0018,
  breaks: 0.12,
  shallows: -0.03,
  rain: 0.0015,
  /** Ground steeper than this (height per unit distance, times its firmness) slumps, at this rate. */
  talus: 2,
  slump: 0.6,
  /** Ash is soft: it wears this many times faster than lava rock. */
  softer: 3,

  /** Life begins at the vents after this many seconds, in warm water no deeper than `vents`. */
  origin: 40,
  vents: -0.3,
  /** How fast life grows where it is, and reaches out to where it isn't (per second). */
  grow: 0.08,
  spread: 0.12,
  /** Bare rock takes this long to become ground life can take; rich ground, only `ashSoil`, and life grows there faster. */
  soil: 18,
  ashSoil: 5,
  /** Reefs: life in the shallows above `reefDeep` builds rock up towards the surface, at this rate. */
  reefDeep: -0.07,
  reef: 0.0012,
  /**
   * Atolls, on a world with a sea: once the fire is out, the long age lets the islands sink much
   * further (`ageSink` a second, to `ageSinks` in all), and coral keeps growing up on their
   * seaward shores, where it faces open water, to just above the surface. The island drowns
   * inside its reef, and a ring of coral islets is left round a lagoon, as Darwin saw.
   */
  atolls: false,
  ageSink: 0.0011,
  ageSinks: 0.4,
  /** How high coral builds its islets above the surface. */
  islets: 0.006,
  /** Where life is at its fullest, the rain and the sea wear the ground this much less. */
  holds: 0.75,

  /**
   * Stones from the sky: one every so many seconds (between), fewer as the planet ages, each seen
   * coming this long before it lands, so there's time to answer it; a crater's size. Its heat joins
   * yours, up to `caught` times as much if the plume is under it when it lands.
   */
  impactEvery: [45, 80] as [number, number],
  impactWarning: 20,
  crater: 0.07,
  craterDepth: 0.06,
  impactHeat: 5,
  caught: 4,

  /**
   * What the world is like at the start: 'ocean', one sea over an even floor; or 'moon', airless
   * highland scarred by `basins` great old impact basins, and a scatter of smaller craters.
   */
  terrain: 'ocean' as 'ocean' | 'moon' | 'mars' | 'ice',
  basins: 0,
  /** Smaller craters scattered over the ground, on a world that starts scarred. */
  craters: 40,
  /**
   * Dust storms, on a world with thin air: one every so many seconds (between; none if both are 0),
   * each seen rising `stormWarning` seconds before it comes, lasting `stormLasts`, and scouring
   * the heights while it blows (per second, in proportion to how high the ground stands above the
   * floor, and more where it's soft ash).
   */
  stormEvery: [0, 0] as [number, number],
  stormWarning: 12,
  stormLasts: 22,
  stormWear: 0.012,
  /** How much of a mountain's top counts as its summit (see `summit`), as vertices on a planet of the drawn detail. */
  summitOf: 30,
  /** Whether there is life at all; and, if there is, how often (seconds) it begins afresh at a vent that has none near it. */
  life: true,
  reseed: 30,
  seedReach: 0.3,
};

/** A world's settings: the same fields as VOLCANO, which are the ocean world's. */
export type Rules = typeof VOLCANO;

export type Era = 'young' | 'burning' | 'cooling' | 'embers' | 'out';

interface Eruption { vertex: number; flank: number; left: number; rate: number }

export interface Impact { vertex: number; in: number }

export class Planet {
  /** Rock height at each vertex, relative to the sea. */
  readonly rock: Float32Array;
  /** Molten lava lying on the rock. */
  readonly lava: Float32Array;
  /** Seconds since lava last covered each vertex. */
  readonly age: Float32Array;
  /** How much of the ground is ash, 0 to 1: soft, and fertile. */
  readonly ash: Float32Array;
  /** How rich the ground is with fallen ash, 0 to 1: life takes it sooner and grows there faster. */
  readonly rich: Float32Array;
  /** Life at each vertex, 0 to 1: on land, and as reef in the shallows. */
  readonly life: Float32Array;
  /** How far the ground has sunk since it cooled. */
  private sunk: Float32Array;
  /**
   * Which way gravity pulls, in the planet's frame, as the world is held: set it (a unit vector)
   * and the lava runs down the world as it is seen, the heat pours when the world is tipped, and
   * rises to whatever is uppermost. Left null (as in some tests), lava follows the ground alone
   * and the heat is let out only by `erupt`.
   */
  gravity: { x: number; y: number; z: number } | null = null;
  /** Whether the heat is pouring out now, the world being tipped. */
  pouring = false;
  /** Where the plume is, as a unit vector, and the vertex above it. */
  readonly plume = { x: 0, y: 0, z: 1 };
  plumeVertex = 0;
  /** Where you have called the heat to, if anywhere. */
  target: { x: number; y: number; z: number } | null = null;

  /** Heat still in store, and gathered as pressure ready to come out. */
  reserve: number;
  pressure = 0;
  /** A stone on its way, if one is. */
  impact: Impact | null = null;
  /** What happened lately, for the words on the page: taken and cleared by whoever shows them. */
  readonly news: string[] = [];
  /** Everything worth remembering, and when: for the chart at the end. */
  readonly log: { t: number; text: string }[] = [];
  /** How the heat came out, and what the sky did. */
  readonly tally = { flows: 0, bursts: 0, calderas: 0, stones: 0, caught: 0 };
  /** How hard the sea wore at each vertex, at the last reckoning (per second): where the surf is. */
  readonly wear: Float32Array;
  /** Whether stones fall at all: off until the player has been shown them. */
  stonesFall = true;
  seconds = 0;

  private eruptions: Eruption[] = [];
  private next: Float32Array;
  private firmness: Float32Array;
  private drift: { x: number; y: number; z: number };
  private scale: number;
  private seed: number;
  private slowIn = 0;
  private impactIn: number;
  private began = false;
  private seedIn = 0;
  private livingDue = false;
  private slowHalf = false;
  private slowDelta: Float32Array;
  private alive = false;

  /** This world's own settings: VOLCANO, with whatever the world changes (see worlds.ts). */
  readonly k: Rules;

  /**
   * @param ground the ground an earlier fire on this world left, to begin on instead of new rough
   *   plain (see `Ground` in main.ts): the geology of past games, with this fire rising through it.
   */
  constructor(private topo: Topology, start: number, seed = 1, rules: Partial<Rules> = {}, ground?: Float32Array) {
    this.k = { ...VOLCANO, ...rules };
    this.reserve = this.k.heat;
    const n = topo.vertexCount, p = topo.basePositions;
    this.scale = n / REFERENCE;
    this.seed = seed;
    this.rock = new Float32Array(n);
    this.lava = new Float32Array(n);
    this.age = new Float32Array(n).fill(1e6);
    this.ash = new Float32Array(n);
    this.rich = new Float32Array(n);
    this.life = new Float32Array(n);
    this.sunk = new Float32Array(n);
    this.wear = new Float32Array(n);
    this.next = new Float32Array(n);
    this.slowDelta = new Float32Array(n);
    this.firmness = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      const fine = (Math.sin(x * 13.1 + z * 7.3) + Math.sin(y * 11.7 - x * 9.1 + 2.1) + Math.sin(z * 12.3 + y * 8.9 - 1.3)) / 3;
      this.firmness[v] = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(x * 17.3 + y * 5.1 - z * 11.9) * Math.sin(y * 13.7 + z * 6.3 + 0.7));
      this.rock[v] = this.k.floor + this.k.rough * fine;
    }
    this.plume.x = p[start * 3]; this.plume.y = p[start * 3 + 1]; this.plume.z = p[start * 3 + 2];
    this.plumeVertex = start;
    // The crust slides over the plume one way, all game: a direction across the plume, chosen once.
    const a = this.rand() * Math.PI * 2;
    const t1 = unit(cross(this.plume, Math.abs(this.plume.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
    const t2 = cross(this.plume, t1);
    this.drift = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) };
    this.impactIn = this.between(this.k.impactEvery);
    if (ground && ground.length === n) this.rock.set(ground);
    if (this.k.terrain !== 'ocean') this.scar();
    if (this.k.stormEvery[1] > 0) this.stormIn = this.between(this.k.stormEvery);
  }

  /**
   * An old, airless world: the great basins its first stones dug (each a broad bowl with a raised
   * rim), and a scatter of smaller craters over the highland between them. The basins are kept,
   * by where they are and how wide, for a world whose aim is to flood them.
   */
  readonly basins: { x: number; y: number; z: number; r: number }[] = [];
  private scar(): void {
    const p = this.topo.basePositions, n = this.rock.length;
    const bowl = (c: { x: number; y: number; z: number }, r: number, depth: number) => {
      for (let v = 0; v < n; v++) {
        const d = Math.hypot(p[v * 3] - c.x, p[v * 3 + 1] - c.y, p[v * 3 + 2] - c.z) / r;
        if (d > 1.6) continue;
        this.rock[v] += depth * (d < 1 ? -(1 - d * d) : 0.3 * Math.exp(-((d - 1.1) ** 2) / 0.05));
      }
    };
    const point = () => {
      const z = this.rand() * 2 - 1, a = this.rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      return { x: s * Math.cos(a), y: s * Math.sin(a), z };
    };
    // The basins, well apart, one near where the heat begins so the first is in reach.
    for (let tries = 0; this.basins.length < this.k.basins && tries < 400; tries++) {
      const c = this.basins.length === 0 ? unit({ x: this.plume.x + 0.25, y: this.plume.y - 0.2, z: this.plume.z }) : point();
      const r = 0.22 + this.rand() * 0.14;
      if (this.basins.some((b) => Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) < b.r + r + 0.15)) continue;
      this.basins.push({ ...c, r });
      bowl(c, r, 0.12);
    }
    for (let i = 0; i < this.k.craters; i++) bowl(point(), 0.03 + this.rand() * 0.06, 0.05);
    // A world without a sea keeps even its deepest craters dry.
    if (this.k.terrain === 'mars' || this.k.terrain === 'ice') for (let v = 0; v < n; v++) this.rock[v] = Math.max(0.004, this.rock[v]);
  }

  /** Which way the crust carries the heat, along the ground at the vent (a unit vector). */
  get driftDirection(): { x: number; y: number; z: number } {
    return { ...this.drift };
  }

  /** The share of a basin's floor that lava has flooded, 0 to 1. */
  flooded(b: { x: number; y: number; z: number; r: number }): number {
    const p = this.topo.basePositions;
    let inside = 0, filled = 0;
    for (let v = 0; v < this.rock.length; v++) {
      if (Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) > b.r * 0.8) continue;
      inside++;
      if (this.age[v] < 1e5) filled++; // lava has lain here
    }
    return inside ? filled / inside : 0;
  }

  /** The share of the heat you began with that is still to come, gathered or not. */
  get heatLeft(): number {
    return (this.reserve + this.pressure) / this.k.heat;
  }

  get era(): Era {
    const f = this.heatLeft;
    if (this.over) return 'out';
    return f > 0.7 ? 'young' : f > 0.4 ? 'burning' : f > 0.15 ? 'cooling' : 'embers';
  }

  /** The fire is out: no heat left to speak of, and nothing still flowing. */
  get over(): boolean {
    return this.reserve + this.pressure < this.k.least && !this.erupting && this.molten < 0.01;
  }

  get erupting(): boolean {
    return this.eruptions.length > 0;
  }

  /** How much lava is still flowing, over the whole world. */
  get molten(): number {
    let s = 0;
    for (let v = 0; v < this.lava.length; v++) s += this.lava[v];
    return s;
  }

  /** Whether the pressure is enough that letting it out now would be a burst. */
  get bursting(): boolean {
    return this.pressure >= this.k.explosive;
  }

  /**
   * Let the pressure out at the plume: all of it, as a flow if there is little, as a burst if it
   * has built. Returns what kind it was, or null if there wasn't enough.
   */
  erupt(blast = false): 'flow' | 'burst' | null {
    const volume = this.pressure;
    if (volume < this.k.least) return null;
    this.pressure = 0;
    const v = this.plumeVertex, s = this.scale;
    if (volume < this.k.explosive) {
      this.tally.flows++;
      this.eruptions.push({ vertex: v, flank: this.flankOf(v), left: volume * s, rate: (volume * s) / this.k.pour });
      return 'flow';
    }
    // A burst: most of it thrown up as ash that falls round the vent, the rest welling out.
    // Torn open, it throws its ash far and wide rather than piling it on the summit.
    this.fallOfAsh(v, volume * this.k.ashShare * s, blast ? 3 : 1);
    if (!blast) this.tally.bursts++;
    const lava = volume * (1 - this.k.ashShare) * s;
    this.eruptions.push({ vertex: v, flank: v, left: lava, rate: lava / this.k.pour });
    return 'burst';
  }

  /** How far from level the world is at the vent, as held: 0 with the vent uppermost, 1 on its side. */
  get tip(): number {
    const g = this.gravity;
    if (!g) return 0;
    const p = this.topo.basePositions, v = this.plumeVertex;
    const along = g.x * p[v * 3] + g.y * p[v * 3 + 1] + g.z * p[v * 3 + 2];
    return Math.hypot(g.x - along * p[v * 3], g.y - along * p[v * 3 + 1], g.z - along * p[v * 3 + 2]);
  }

  /** Held like a globe: level, the pressure builds; tipped, it pours, and tipped when full, it bursts. */
  private tipped(dt: number): void {
    const tip = this.tip;
    if (!this.pouring && tip >= this.k.tipPour) {
      this.pouring = true;
      if (this.pressure >= this.k.explosive) { this.erupt(); return; }
      if (this.pressure >= this.k.least) this.tally.flows++;
    } else if (this.pouring && tip < this.k.tipPour * 0.7) this.pouring = false;
    if (!this.pouring) return;
    const rate = this.k.pourLeast + (this.k.pourMost - this.k.pourLeast) * Math.min(1, (tip - this.k.tipPour) / (1 - this.k.tipPour));
    const amount = Math.min(this.pressure, Math.max(0, rate) * dt);
    if (amount <= 0) return;
    this.pressure -= amount;
    const v = this.plumeVertex, a = amount * this.scale;
    this.eruptions.push({ vertex: v, flank: v, left: a, rate: a / dt });
  }

  /** Call the heat towards a point on the world (a unit vector); it creeps there beneath the crust. */
  callTo(x: number, y: number, z: number): void {
    this.target = unit({ x, y, z });
  }

  step(dt: number): void {
    this.seconds += dt;
    // The heat rises out of its store: fast at first, slower as the planet cools, and then it is gone.
    // (Or, on a world whose heat rises evenly, at one pace until it's gone.)
    const rise = Math.min(this.reserve, this.k.rising * (this.k.steady ? 1 : Math.sqrt(Math.max(0, this.reserve) / this.k.heat)) * dt + 1e-4 * dt);
    this.reserve -= rise;
    this.pressure += rise;
    if (this.pressure >= this.k.cap) { this.collapse(); this.erupt(true); this.tally.calderas++; this.tell('Held too long: the mountain blew apart'); }
    // The store is spent: whatever pressure is left comes out by itself, the last of the fire.
    if (this.reserve < 0.01 && this.pressure >= this.k.least && !this.erupting) { this.erupt(); this.tell('The last of the heat escapes'); }
    if (this.reserve < 0.01 && this.pressure < this.k.least) this.pressure = 0;
    if (this.gravity) this.tipped(dt);
    this.movePlume(dt);
    this.pour(dt);
    this.flow(dt);
    this.cool(dt);
    for (let v = 0; v < this.age.length; v++) if (this.lava[v] < this.k.thin) this.age[v] += dt;
    // The slow forces every quarter second, and life the step after, so no one step carries both.
    this.slowIn -= dt;
    const half = this.rock.length >> 1;
    if (this.slowHalf) { this.slowHalf = false; this.slow(0.25, half, this.rock.length); this.livingDue = true; }
    else if (this.livingDue) { this.livingDue = false; this.living(0.25); }
    else if (this.slowIn <= 0) { this.slow(0.25, 0, half); this.slowIn = 0.25; this.slowHalf = true; }
    this.stones(dt);
    this.storms(dt);
  }

  /** Whether a dust storm is blowing now; and, if one is on its way, how soon it comes. */
  storm = false;
  stormComing: number | null = null;
  private stormIn = 0;
  private stormLeft = 0;
  private storms(dt: number): void {
    if (this.k.stormEvery[1] <= 0 || this.over) { this.storm = false; return; }
    if (this.storm) {
      this.stormLeft -= dt;
      if (this.stormLeft <= 0) { this.storm = false; this.stormIn = this.between(this.k.stormEvery); this.tell('The storm passes'); }
      return;
    }
    this.stormIn -= dt;
    if (this.stormComing === null && this.stormIn <= this.k.stormWarning) { this.stormComing = this.stormIn; this.tell('A dust storm is coming'); }
    if (this.stormComing !== null) this.stormComing = Math.max(0, this.stormIn);
    if (this.stormIn <= 0) { this.storm = true; this.stormComing = null; this.stormLeft = this.k.stormLasts; }
  }

  /**
   * How high the mountain stands above the floor: not its single highest point (lava piles a spike
   * at the vent that is no mountain) but the height that a fair patch of its top reaches, the
   * `summitOf`-th highest ground (on a planet of the drawn detail).
   */
  get summit(): number {
    // Only the mountain over this fire: near where the heat is, not an old one elsewhere.
    const k = Math.max(1, Math.round(this.k.summitOf * this.scale)), top: number[] = [], p = this.topo.basePositions, q = this.plume, near = Math.cos(0.45);
    for (let v = 0; v < this.rock.length; v++) {
      if (p[v * 3] * q.x + p[v * 3 + 1] * q.y + p[v * 3 + 2] * q.z < near) continue;
      const h = this.rock[v];
      if (top.length < k) { top.push(h); top.sort((a, b) => a - b); }
      else if (h > top[0]) { top[0] = h; top.sort((a, b) => a - b); }
    }
    return top[0] - this.k.floor;
  }

  /** The share of the world's surface made new this fire: lava has lain on it, or a burst's ash (or frost) covers it. */
  get covered(): number {
    let c = 0;
    for (let v = 0; v < this.age.length; v++) if (this.age[v] < 1e5 || this.ash[v] > 0.15) c++;
    return c / this.age.length;
  }

  /** Say something, and remember it for the chart. */
  tell(text: string): void {
    this.news.push(text);
    this.log.push({ t: this.seconds, text });
  }

  /** How warm the plume keeps the ground at a vertex, 0 to 1. */
  warmthAt(v: number): number {
    const p = this.topo.basePositions, q = this.plume;
    const d = Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z);
    return Math.exp(-((d / this.k.warmth) ** 2));
  }

  /** The summit falls into the emptied chamber, and the blast kills all round. */
  private collapse(): void {
    const p = this.topo.basePositions, at = this.plumeVertex, r = this.k.caldera;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < r) this.rock[v] -= this.k.calderaDepth * (1 - (d / r) ** 2) * Math.min(1, Math.max(0, this.rock[v] - this.k.floor) * 4);
      if (d < this.k.calderaKills) this.life[v] *= (d / this.k.calderaKills) ** 3;
    }
  }

  /** A stone from the sky, at a vertex: a crater with a raised rim, and death round it. Its heat joins yours. */
  strike(at: number): void {
    const p = this.topo.basePositions, r = this.k.crater;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d > r * 2.5) continue;
      const k = d / r;
      // Dug out within the crater, thrown up as a rim just beyond it.
      this.rock[v] += this.k.craterDepth * (k < 1 ? -(1 - k * k) : 0.35 * Math.exp(-((k - 1.15) ** 2) / 0.08));
      this.life[v] *= Math.min(1, k / 2.5);
      if (k < 1.5) this.age[v] = 0;
    }
    // Its heat joins yours, and far more of it if the plume is there to take it in.
    const caught = this.warmthAt(at);
    this.reserve += this.k.impactHeat * (1 + (this.k.caught - 1) * caught);
    this.tally.stones++;
    if (caught > 0.5) { this.tally.caught++; this.tell('Stone caught: more heat'); }
  }

  /** The share of the world that is land (above the sea). */
  landShare(): number {
    let k = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.rock[v] > 0) k++;
    return k / this.rock.length;
  }

  /** The share of the world that is alive, on land or as reef. */
  lifeShare(): number {
    let k = 0;
    for (let v = 0; v < this.life.length; v++) k += this.life[v];
    return k / this.life.length;
  }

  /** The highest ground on the world, relative to the sea. */
  peak(): number {
    let m = -Infinity;
    for (let v = 0; v < this.rock.length; v++) m = Math.max(m, this.rock[v]);
    return m;
  }

  // ------------------------------------------------------------------ the plume

  private movePlume(dt: number): void {
    const q = this.plume;
    // Held like a globe, the heat rises towards whatever is uppermost, slowly.
    const g = this.gravity;
    if (g && this.k.rises > 0) this.target = unit({ x: -g.x, y: -g.y, z: -g.z });
    // On its own, slowly one way; towards where it's called, faster, until it gets there.
    // (Once the fire is out there is nothing to carry: the world is still, for its long age.)
    const drift = this.over ? 0 : this.k.drift;
    let mx = this.drift.x * drift, my = this.drift.y * drift, mz = this.drift.z * drift;
    if (this.target) {
      const t = this.target, along = t.x * q.x + t.y * q.y + t.z * q.z;
      const tx = t.x - along * q.x, ty = t.y - along * q.y, tz = t.z - along * q.z, tl = Math.hypot(tx, ty, tz);
      const angle = Math.acos(Math.min(1, along));
      if (angle < 0.01 || tl < 1e-6) this.target = null;
      else { const sp = Math.min(g ? this.k.rises : this.k.creep, angle / dt); mx += (tx / tl) * sp; my += (ty / tl) * sp; mz += (tz / tl) * sp; }
    }
    const moved = unit({ x: q.x + mx * dt, y: q.y + my * dt, z: q.z + mz * dt });
    // The drift stays across the plume as it goes round the world.
    const d = this.drift, dd = d.x * moved.x + d.y * moved.y + d.z * moved.z;
    Object.assign(this.drift, unit({ x: d.x - dd * moved.x, y: d.y - dd * moved.y, z: d.z - dd * moved.z }));
    Object.assign(q, moved);
    // The vertex above it: walk to whichever neighbour is nearer until none is.
    const t = this.topo, p = t.basePositions, dist = (v: number) => (p[v * 3] - q.x) ** 2 + (p[v * 3 + 1] - q.y) ** 2 + (p[v * 3 + 2] - q.z) ** 2;
    let v = this.plumeVertex;
    for (let moves = 0; moves < 50; moves++) {
      let best = v;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (dist(t.nbrList[k]) < dist(best)) best = t.nbrList[k];
      if (best === v) break;
      v = best;
    }
    this.plumeVertex = v;
  }

  // ------------------------------------------------------------------ eruptions

  /**
   * Where a flow breaks out on the flank: a few steps from the vent, in a direction of its own,
   * downhill where the ground allows. So each flow sends a lobe its own way.
   */
  private flankOf(vent: number): number {
    const t = this.topo, p = t.basePositions;
    const ang = this.rand() * Math.PI * 2;
    const n = { x: p[vent * 3], y: p[vent * 3 + 1], z: p[vent * 3 + 2] };
    const a = unit(cross(n, Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), b = cross(n, a);
    const dx = a.x * Math.cos(ang) + b.x * Math.sin(ang), dy = a.y * Math.cos(ang) + b.y * Math.sin(ang), dz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
    let v = vent;
    for (let k = 0; k < this.k.flank; k++) {
      let best = v, score = -Infinity;
      for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) {
        const w = t.nbrList[q];
        const ex = p[w * 3] - p[v * 3], ey = p[w * 3 + 1] - p[v * 3 + 1], ez = p[w * 3 + 2] - p[v * 3 + 2];
        const s = (ex * dx + ey * dy + ez * dz) / (Math.hypot(ex, ey, ez) || 1) - (this.rock[w] - this.rock[v]) * 4;
        if (s > score) { score = s; best = w; }
      }
      v = best;
    }
    return v;
  }

  /** Ash falls round a vent, thickest nearest: a cone of soft ground, and death further out. */
  private fallOfAsh(at: number, volume: number, wide: number): void {
    const p = this.topo.basePositions, r = this.k.ashReach * wide, n = this.rock.length;
    const w = this.next;
    let sum = 0;
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < this.k.ashKills * wide) this.life[v] *= (d / (this.k.ashKills * wide)) ** 2;
      if (d < this.k.ashDusts * wide) this.rich[v] = Math.max(this.rich[v], 1 - (d / (this.k.ashDusts * wide)) ** 2);
      w[v] = d < r * 3 ? Math.exp(-((d / r) ** 2)) : 0;
      sum += w[v];
    }
    for (let v = 0; v < n; v++) {
      if (!w[v]) continue;
      const add = (volume * w[v]) / sum;
      this.rock[v] += add;
      this.ash[v] = Math.min(1, this.ash[v] + add * 40);
      this.age[v] = Math.min(this.age[v], add > 0.003 ? 0 : this.age[v]);
    }
  }

  /** Lava poured from each eruption, into the vent and the ring round it, and out at its flank. */
  private pour(dt: number): void {
    const t = this.topo;
    const put = (v: number, amount: number) => {
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1], share = amount / (1 + (b - a) * 0.5);
      this.lava[v] += share;
      for (let q = a; q < b; q++) this.lava[t.nbrList[q]] += share * 0.5;
    };
    for (const e of this.eruptions) {
      const amount = Math.min(e.left, e.rate * dt);
      e.left -= amount;
      const flank = e.flank === e.vertex ? 0 : this.k.flankShare;
      put(e.vertex, amount * (1 - flank));
      if (flank) put(e.flank, amount * flank);
    }
    this.eruptions = this.eruptions.filter((e) => e.left > 1e-6);
  }

  /** Lava runs downhill, mostly by the steepest way, and downhill is as the world is held. */
  private flow(dt: number): void {
    const t = this.topo, n = this.rock.length, next = this.next, p = t.basePositions;
    const G = this.gravity, R = this.k.relief;
    next.set(this.lava);
    for (let v = 0; v < n; v++) {
      const l = this.lava[v];
      if (l < this.k.thin) continue;
      const s = this.rock[v] + l, a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      const drop = G
        // Held like a globe: how far down the neighbour is along gravity, the ground raised as it
        // is drawn, counted back into the ground's own heights. Near the top the relief is all of
        // it; further round, the curve of the world pulls the lava down its side.
        ? (w: number) => {
          const sw = this.rock[w] + this.lava[w], kv = 1 + R * s, kw = 1 + R * sw;
          return ((p[w * 3] * kw - p[v * 3] * kv) * G.x + (p[w * 3 + 1] * kw - p[v * 3 + 1] * kv) * G.y + (p[w * 3 + 2] * kw - p[v * 3 + 2] * kv) * G.z) / R;
        }
        : (w: number) => s - (this.rock[w] + this.lava[w]);
      let sum = 0, weights = 0;
      for (let q = a; q < b; q++) { const d = drop(t.nbrList[q]); if (d > 0) { sum += d; weights += Math.pow(d, this.k.channel); } }
      if (sum <= 0) continue;
      const out = Math.min(l * 0.5, this.k.flow * dt * sum * l / (l + 0.02));
      next[v] -= out;
      for (let q = a; q < b; q++) {
        const w = t.nbrList[q], d = drop(w);
        if (d > 0) next[w] += (out * Math.pow(d, this.k.channel)) / weights;
      }
    }
    this.lava.set(next);
  }

  /** Lava cools into rock: slowly on land, fast where it meets the sea. A real covering clears the ground. */
  private cool(dt: number): void {
    for (let v = 0; v < this.rock.length; v++) {
      const l = this.lava[v];
      if (l <= 0) continue;
      const sea = this.rock[v] + l < 0;
      const solid = l < this.k.thin ? l : l * (1 - Math.exp(-(sea ? this.k.coolSea : this.k.coolLand) * dt));
      this.lava[v] -= solid;
      this.rock[v] += solid;
      if (l > this.k.cover) { this.age[v] = 0; this.life[v] = 0; this.ash[v] = 0; this.rich[v] = 0; }
    }
  }

  // ------------------------------------------------------------------ the slow forces

  /** The planet's own slow work, every quarter second: warmth and sinking, the sea, the rain, slumping, and life. */
  /**
   * Done in two halves, a step apart (the vertices from `from` to `to`), so no one step carries
   * all of it: each half adds what it would change to `slowDelta`, and the changes are made
   * together once the second half is done, so neither half sees the other's.
   */
  private slow(dt: number, from: number, to: number): void {
    const t = this.topo, n = this.rock.length, p = t.basePositions, r = this.rock, q = this.plume;
    const next = this.slowDelta;
    if (from === 0) next.fill(0);
    const burning = Math.min(1, this.heatLeft * 2), ageing = this.k.atolls && this.over;
    const sink = ageing ? this.k.ageSink : this.k.sink, sinks = ageing ? this.k.ageSinks : this.k.sinks;
    for (let v = from; v < to; v++) {
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      const d = Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z);
      const warm = Math.exp(-((d / this.k.warmth) ** 2)) * burning;
      // Warm ground swells over the plume; ground the plume has left cools and sinks.
      next[v] += this.k.swell * dt * warm;
      this.sunk[v] = Math.max(0, this.sunk[v] - this.k.swell * dt * warm);
      if (this.sunk[v] < sinks) { const s = sink * dt * (1 - warm); next[v] -= s; this.sunk[v] += s; }
      if (this.lava[v] > this.k.thin) continue;
      const wear = (1 + (this.k.softer - 1) * this.ash[v]) * (1 - this.k.holds * this.life[v]);
      // (Coral islets in the long age are held by their reef: the waves don't take them.)
      if (r[v] > this.k.shallows && !(ageing && this.life[v] > 0.2 && r[v] < this.k.islets * 2)) {
        // Open to deep water, the waves strike hard; behind shallows, or a reef, they have broken already.
        let sea = 0;
        for (let k = a; k < b; k++) { const w = t.nbrList[k]; if (r[w] < 0) sea += Math.min(1, -r[w] / this.k.breaks) * (1 - this.k.holds * this.life[w]); }
        const worn = sea ? Math.min(r[v] - this.k.shallows, this.k.waves * dt * (sea / (b - a)) * 2 * wear) : 0;
        next[v] -= worn;
        this.wear[v] = worn / dt;
      } else this.wear[v] = 0;
      if (r[v] > 0) next[v] -= this.k.rain * dt * r[v] * wear;
      // A dust storm scours whatever stands high, and soft ash most of all.
      if (this.storm && r[v] > this.k.floor) next[v] -= this.k.stormWear * dt * (r[v] - this.k.floor) * (1 + (this.k.softer - 1) * this.ash[v]);
      // Too steep, and the ground slides towards its lower neighbours; ash stands less steeply than lava rock.
      const talus = this.k.talus * this.firmness[v] * (1 - 0.4 * this.ash[v]);
      // (Reef rock is cemented: in the long age an atoll's rim stands over its deepening lagoon.)
      if (!(ageing && this.atollRim()[v])) for (let k = a; k < b; k++) {
        const w = t.nbrList[k];
        const dd = Math.hypot(p[v * 3] - p[w * 3], p[v * 3 + 1] - p[w * 3 + 1], p[v * 3 + 2] - p[w * 3 + 2]) || 1e-6;
        const drop = r[v] - r[w];
        if (drop / dd > talus) {
          const move = (drop - talus * dd) * 0.5 * Math.min(1, this.k.slump * dt);
          next[v] -= move;
          next[w] += move;
        }
      }
      // Reefs build up towards the light, but no further than the surface.
      if (!ageing) {
        if (this.life[v] > 0.2 && r[v] < -0.004 && r[v] > this.k.reefDeep) next[v] += Math.min(-0.004 - r[v], this.k.reef * dt * this.life[v]);
      } else if (this.atollRim()[v]) {
        // In the long age, only the reef's seaward edge keeps up with the sinking; the sheltered
        // middle doesn't, and becomes the lagoon. Along the edge, here and there, coral sand builds
        // islets a little above the surface; between them the reef lies just awash.
        const top = this.isletAt(v) ? this.k.islets : -0.004;
        if (r[v] < top) next[v] += Math.min(top - r[v], this.k.reef * 2.5 * dt + sink * dt);
        // Bare coral sand, too new and salt for anything to live on it yet: drawn as islets, not a thicket.
        if (r[v] > 0) this.life[v] = Math.min(this.life[v], 0.2);
      }
    }
    if (to === n) for (let v = 0; v < n; v++) r[v] += next[v];
  }

  /**
   * The reef's seaward edge, as it was when the long age began: living ground (land or shallows)
   * bordering water that holds nothing, and the living ground just inside it, a ring three wide.
   */
  private rim: Uint8Array | null = null;
  /** Whether coral sand builds an islet at this vertex of an atoll's rim: in clusters, by a smooth noise over the world. */
  private isletAt(v: number): boolean {
    const p = this.topo.basePositions, x = p[v * 3] * 11, y = p[v * 3 + 1] * 11, z = p[v * 3 + 2] * 11;
    return Math.sin(x + 1.3) * Math.sin(y * 1.1 - 0.7) * Math.sin(z * 0.9 + 2.1) + 0.25 * Math.sin(x * 2.3 + y * 1.7 - z * 2.9) > -0.1;
  }
  private atollRim(): Uint8Array {
    if (this.rim) return this.rim;
    const t = this.topo, n = this.rock.length, r = this.rock, L = this.life, edge = new Uint8Array(n), rim = new Uint8Array(n);
    const alive = (v: number) => L[v] > 0.2 && r[v] > this.k.reefDeep;
    for (let v = 0; v < n; v++) {
      if (!alive(v)) continue;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (!alive(t.nbrList[k]) && r[t.nbrList[k]] < 0) { edge[v] = 1; break; }
    }
    // Three wide: the edge, and the living ground within two steps of it.
    rim.set(edge);
    for (let pass = 0; pass < 2; pass++) {
      const was = rim.slice();
      for (let v = 0; v < n; v++) {
        if (was[v] || !alive(v)) continue;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (was[t.nbrList[k]]) { rim[v] = 1; break; }
      }
    }
    return (this.rim = rim);
  }

  /** How many atolls the long age has left: rings of coral islets, each at least a few vertices of reef edge standing at the surface. */
  get atolls(): number {
    const rim = this.rim;
    if (!rim) return 0;
    const t = this.topo, n = this.rock.length, seen = new Uint8Array(n), up = (v: number) => rim[v] && this.rock[v] > -0.006;
    let count = 0;
    for (let v = 0; v < n; v++) {
      if (seen[v] || !up(v)) continue;
      let size = 0;
      const stack = [v];
      seen[v] = 1;
      while (stack.length) {
        const w = stack.pop()!;
        size++;
        for (let k = t.nbrOffsets[w]; k < t.nbrOffsets[w + 1]; k++) { const u = t.nbrList[k]; if (!seen[u] && up(u)) { seen[u] = 1; stack.push(u); } }
      }
      if (size >= 6 * this.scale) count++;
    }
    return count;
  }

  /** How much life the ground at a vertex could hold, 0 to 1. */
  private room(v: number): number {
    const h = this.rock[v];
    if (this.lava[v] > this.k.thin) return 0;
    if (h < 0) return h > this.k.reefDeep ? 0.7 : 0; // the shallows, as reef; the deep holds none
    const soil = this.k.soil + (this.k.ashSoil - this.k.soil) * this.rich[v];
    return Math.min(1, this.age[v] / soil) * (0.7 + 0.3 * this.rich[v]);
  }

  private living(dt: number): void {
    const t = this.topo, n = this.life.length, L = this.life, next = this.next;
    // The first life: in the warm water at the vent, once the world has settled a little.
    // If it all dies, it can begin again there, as it did before.
    // And wherever the heat has gone on to, out of reach of the life there is, it begins again there
    // before long: life comes up at the vents, and so an island chain is alive all along.
    this.seedIn -= dt;
    const lonely = this.alive && this.seedIn <= 0 && !this.lifeNear(this.plumeVertex, this.k.seedReach);
    if (this.seedIn <= 0) this.seedIn = this.k.reseed;
    if (this.k.life && (!this.alive || lonely) && this.seconds > this.k.origin && !this.over) {
      const v = this.warmWater();
      if (v >= 0) {
        L[v] = 0.5;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) L[t.nbrList[k]] = 0.3;
        if (!this.began) this.tell('Life begins in the warm water');
        this.began = true;
      }
    }
    let alive = false;
    for (let v = 0; v < n; v++) {
      // Rich ground stays rich where life holds it; bare, it washes out.
      if (L[v] < 0.3) this.rich[v] = Math.max(0, this.rich[v] - dt / this.k.richLasts);
      const room = this.room(v);
      let near = 0;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) near = Math.max(near, L[t.nbrList[k]]);
      let l = L[v];
      if (room <= 0) l = Math.max(0, l - dt * 0.5); // the deep, or fresh lava: it dies back
      else if (l < room) l = Math.min(room, l + dt * (this.k.grow * l + this.k.spread * near * near) * room * (1 + 2 * this.rich[v]));
      else l = Math.max(room, l - dt * 0.05);
      if (l < 0.002) l = 0;
      if (l > 0) alive = true;
      next[v] = l;
    }
    L.set(next.subarray(0, n));
    this.alive = alive;
  }

  /** Whether anything lives within `reach` of a vertex. */
  private lifeNear(at: number, reach: number): boolean {
    const p = this.topo.basePositions;
    for (let v = 0; v < this.life.length; v++) {
      if (this.life[v] < 0.2) continue;
      if (Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]) < reach) return true;
    }
    return false;
  }

  /** The nearest water to the plume that is warm and not too deep, or -1: a few rings out, at most. */
  private warmWater(): number {
    const t = this.topo;
    let ring = [this.plumeVertex];
    const seen = new Set(ring);
    for (let step = 0; step < 40; step++) {
      for (const v of ring) if (this.rock[v] < -0.005 && this.rock[v] > this.k.vents && this.lava[v] < this.k.thin) return v;
      const out: number[] = [];
      for (const v of ring) for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) { const w = t.nbrList[k]; if (!seen.has(w)) { seen.add(w); out.push(w); } }
      ring = out;
    }
    return -1;
  }

  /** The stones from the sky: fewer as the planet ages, each seen coming a few seconds before it lands. */
  private stones(dt: number): void {
    if (this.impact) {
      this.impact.in -= dt;
      if (this.impact.in <= 0) { this.strike(this.impact.vertex); this.impact = null; this.tell('The stone falls'); }
      return;
    }
    if (this.over || !this.stonesFall) return;
    this.impactIn -= dt * this.heatLeft;
    if (this.impactIn > 0) return;
    this.impactIn = this.between(this.k.impactEvery);
    // Half of them fall near the plume, where they matter; the rest anywhere.
    const p = this.topo.basePositions;
    for (let tries = 0; tries < 200; tries++) {
      const v = Math.floor(this.rand() * this.rock.length);
      const d = Math.hypot(p[v * 3] - this.plume.x, p[v * 3 + 1] - this.plume.y, p[v * 3 + 2] - this.plume.z);
      if (d < 0.08) continue; // not on the vent itself
      if (this.rand() < 0.5 || d < 0.5) { this.impact = { vertex: v, in: this.k.impactWarning }; this.tell('A stone is coming'); return; }
    }
  }

  private between([lo, hi]: [number, number]): number {
    return lo + (hi - lo) * this.rand();
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}

type V3 = { x: number; y: number; z: number };
function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function unit(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
