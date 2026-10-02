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
/** The depth about which lava runs freely: much thinner, and it hardly moves (see `flow`). */
const VISCOUS = 0.0138, VISCOUS_15 = VISCOUS * Math.sqrt(VISCOUS);

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
  /**
   * Tidal heat, on a moon kneaded by its giant planet: the heat rises faster and slower with the
   * tide, by this share either way, round once every `tidePeriod` seconds. 0: no tide.
   */
  tide: 0,
  tidePeriod: 50,
  /** And a burst throws this much further at high tide, and as much less at low: as if this share more (or less) of it. */
  tideThrow: 0,
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
  /**
   * Where there's no air to hold it, a burst's ash flies out and falls in a ring this many times
   * its reach from the vent, as a great plume's does, and further the bigger the burst; 0 heaps it
   * round the vent.
   */
  ashRing: 0,
  /**
   * A burst at least this big is a great plume, and counted, if it rises no nearer than
   * `plumesApart` (radians) to an earlier one: fresh ground. 0: none are counted.
   */
  great: 0,
  plumesApart: 0.5,
  /**
   * A cone holds its pressure down: the pressure that bursts out on its own rises by this much for
   * each unit the ground round the vent stands above the floor. 0: `cap` alone.
   */
  lid: 0,
  /** Of a burst bigger than `explosive`, this share of what's over is thrown clear of the world, into orbit. */
  orbitShare: 0,
  /**
   * A small moon feeding its giant planet's ring, as Enceladus feeds Saturn's: a burst thrown
   * towards the giant (the world tipped its way, within `ringAim` radians) sends this share of
   * itself into the ring, and the ring thins away at `ringThins` a second. 0: no ring.
   */
  ringShare: 0,
  ringAim: 0.7,
  ringThins: 0,
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
  /** In the long age on an airless world, small stones still fall: about this many a second. */
  ageCraters: 0,
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
  terrain: 'ocean' as 'ocean' | 'moon' | 'mars' | 'ice' | 'io' | 'young' | 'asteroid' | 'spin' | 'glass',
  /** On a lumpy asteroid: how far its ground rises and falls from round, in broad lumps (and one great crater). */
  lumps: 0,
  /**
   * How much the world's own gravity, rather than how it's held, decides which way lava runs, 0 to
   * 1: on a body as small as an asteroid, down is towards its own middle, so lava finds its own
   * hollows, and the hand only nudges it.
   */
  selfGravity: 0,
  /**
   * A world spinning so fast it bulges (as Haumea does): lava is flung towards its equator this
   * strongly, whatever the ground's slope, and the equator stands this much higher to begin with.
   * The spin's axis is the planet's y. 0: no spin.
   */
  spin: 0,
  bulge: 0,
  /** On a spinning world: how high (above where it began) the ground along the equator must be raised for a stretch of it to count as ridge. */
  ridge: 0,
  /**
   * The lava-lamp world: hot rock lighter than the glassy deep. Nothing flows; the heat buds off
   * glowing blobs (see `Blob`) that float to whatever is uppermost while hot, cool as they go (the
   * bigger, the slower they cool and the slower they move), merge when two hot ones touch, and sink
   * back into the deep once cold. Blobs that reach the far shore (`shore`) pool there.
   */
  lamp: false,
  /** A small blob's speed (radians a second), and how long (seconds) it stays hot. */
  blobSpeed: 0.05,
  blobHot: 30,
  /**
   * Three suns (a three-body world): three suns wander round the planet under each other's pull and
   * a weak hold that keeps them from flying apart. Each one's tide on the planet grows as the cube
   * of its nearness, and the heat rises with their tides together, as does the sea's wear on the
   * coasts. When one swings close the era turns chaotic; when they keep their distance, it's stable.
   */
  suns: false,
  /**
   * A tumbling moon, as Hyperion tumbles: its spin wanders and grows of itself toward `tumble`
   * radians a second, its axis drifting, `tumbleGrow` a second; and every eruption pushes against
   * the spin where it breaks out, taking away `tumbleKick` of the spin across the vent for a burst
   * of the usual size (a pour, a third as much; never more than 0.45 at once), most on the tumble's
   * equator and little towards its poles. So erupt where the ground is sweeping past, and the
   * tumble eases. 0: no tumble.
   */
  tumble: 0,
  tumbleGrow: 0.0015,
  tumbleKick: 0.4,
  /**
   * The deep ocean's lava tubes: lava running over crust laid within `tubeFresh` seconds cools only
   * this share as fast in the sea, as if in a tube of its own crust; so flow after flow down the
   * same way carries it further. 1: no tubes.
   */
  tubes: 1,
  tubeFresh: 40,
  /** On the deep ocean: a shallow bank this far (radians) from where the heat begins, its top just under the sea. 0: none. */
  bankFar: 0,
  /** Free play: the heat never runs out, and the fire goes on until it's ended (see `end`). */
  endless: false,
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

/**
 * Lava on its way out: where, how much is left, and how fast. Given a `dur`, it comes as a real
 * eruption does, not all at once: a trickle that swells to its height and tails away (its `total`
 * let out over `dur` seconds as the integral of a sine's square), so a pour has weight.
 */
interface Eruption { vertex: number; flank: number; left: number; rate: number; total?: number; t?: number; dur?: number }
/** How much of a swelling eruption is out by `x` (0..1) of its time: slow, then most, then slow. */
const swell = (x: number): number => x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);

/**
 * A blob of hot rock on the lava-lamp world: where it is (a unit vector), how much of it, and how
 * hot (1 to 0). (The blob still budding at the vent is the pressure itself: held level it grows,
 * and tipped it lets go.)
 */
export interface Blob { x: number; y: number; z: number; area: number; heat: number }
/** A blob's radius, in radians across the world, from how much of it there is. */
export const blobRadius = (area: number): number => 0.035 * Math.sqrt(area);

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
  /** Whether the heat was called somewhere by touch: it goes there, whatever is uppermost, until it arrives. */
  called = false;
  /** Whether the vent is held shut (a finger pressed on the world): nothing pours, however the world is tipped, and the pressure builds. */
  clamped = false;

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
  /** Where lava has just burned living ground: 1, fading over half a minute or so (it's drawn scorched before it's gone). */
  readonly scorch: Float32Array;
  /**
   * A tumbling moon's spin (an angular velocity, in the world's own frame, radians a second): it
   * wanders and grows of itself, and each eruption pushes against it (see `kick`).
   */
  readonly spinNow = { x: 0, y: 0, z: 0 };
  /** The great plumes counted so far: where, and how far their rings reached (radians). */
  readonly plumes: { x: number; y: number; z: number; reach: number }[] = [];
  /** Rock thrown clear of the world, into orbit, so far; or, round a giant, what its ring holds now. */
  orbit = 0;
  /** Which way the giant planet is, in the planet's frame (a unit vector), on a world that has one in its sky. */
  giant: { x: number; y: number; z: number } | null = null;
  /** On the lava-lamp world: the blobs, the far shore they're to be brought to, how much has pooled there, and the biggest that came. */
  readonly blobs: Blob[] = [];
  shore: { x: number; y: number; z: number; r: number } | null = null;
  pooled = 0;
  pooledBiggest = 0;
  /** The three suns: where each is and how it moves, in their own plane, the planet at the middle. */
  readonly stars: { x: number; y: number; vx: number; vy: number }[] = [];
  /** Whether the era is chaotic now (a sun close), on a three-sun world. */
  chaotic = false;
  /** The deep ocean's bank: where, and how wide. */
  bank: { x: number; y: number; z: number; r: number } | null = null;
  /** Seconds since lava last set into rock at each vertex (for its tubes). */
  readonly laid: Float32Array;
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
    this.scorch = new Float32Array(n);
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
    // The deep ocean's bank: a seamount whose top is just under the sea, some way from the heat.
    if (this.k.bankFar > 0) {
      const q = this.plume, a = this.rand() * Math.PI * 2, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1), far = this.k.bankFar;
      const d = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) };
      const b = { ...unit({ x: q.x * Math.cos(far) + d.x * Math.sin(far), y: q.y * Math.cos(far) + d.y * Math.sin(far), z: q.z * Math.cos(far) + d.z * Math.sin(far) }), r: 0.16 };
      this.bank = b;
      const p = this.topo.basePositions;
      for (let v = 0; v < n; v++) {
        const dd = Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) / b.r;
        if (dd < 2.5) this.rock[v] = Math.max(this.rock[v], -0.035 + (this.k.floor + 0.035) * Math.min(1, dd * dd / 4));
      }
    }
    // The three suns, set going at random, about the planet.
    if (this.k.suns) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.rand() * 0.8, r = 0.9 + this.rand() * 0.5, s = 0.6 + this.rand() * 0.3;
      this.stars.push({ x: r * Math.cos(a), y: r * Math.sin(a), vx: -s * Math.sin(a) + (this.rand() - 0.5) * 0.4, vy: s * Math.cos(a) + (this.rand() - 0.5) * 0.4 });
    }
    this.laid = new Float32Array(n).fill(1e6);
    this.start = this.rock.slice();
    // The lava lamp's far shore: two radians round the world from where the heat is, some way.
    if (this.k.lamp) {
      const q = this.plume, a = this.rand() * Math.PI * 2, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1);
      const d = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) }, far = 2.0;
      this.shore = { ...unit({ x: q.x * Math.cos(far) + d.x * Math.sin(far), y: q.y * Math.cos(far) + d.y * Math.sin(far), z: q.z * Math.cos(far) + d.z * Math.sin(far) }), r: 0.3 };
    }
  }

  /** The ground as this fire found it: what roundness is measured against, and where its hollows were. */
  readonly start: Float32Array;
  private startSpread = -1;
  /** How far the ground (and lava on it) strays from round: the spread of its heights about their mean. */
  spreadOf(h: (v: number) => number): number {
    const n = this.rock.length;
    let m = 0;
    for (let v = 0; v < n; v++) m += h(v);
    m /= n;
    let d = 0;
    for (let v = 0; v < n; v++) d += (h(v) - m) ** 2;
    return Math.sqrt(d / n);
  }
  /** How much rounder the world is than it was, 0 to 1: how much of its first spread from round is gone. */
  get roundness(): number {
    if (this.startSpread < 0) this.startSpread = this.spreadOf((v) => this.start[v]);
    return this.startSpread > 0 ? Math.max(0, 1 - this.spreadOf((v) => this.rock[v] + this.lava[v]) / this.startSpread) : 0;
  }
  /** The mean height of the ground as it was found: below it, a hollow. */
  get startMean(): number {
    let m = 0;
    for (let v = 0; v < this.start.length; v++) m += this.start[v];
    return m / this.start.length;
  }

  /** On a spinning world: the equator in stretches, round the axis, and whether each is raised enough to be ridge. */
  static readonly RIDGE_STRETCHES = 16;
  static readonly RIDGE_BAND = 0.12;
  ridgeRaise(): number[] {
    const p = this.topo.basePositions, n = Planet.RIDGE_STRETCHES, sum = new Array(n).fill(0), count = new Array(n).fill(0);
    for (let v = 0; v < this.rock.length; v++) {
      if (Math.abs(p[v * 3 + 1]) > Planet.RIDGE_BAND) continue;
      let a = Math.atan2(p[v * 3 + 2], p[v * 3]) / (Math.PI * 2);
      if (a < 0) a += 1;
      const k = Math.min(n - 1, Math.floor(a * n));
      sum[k] += this.rock[v] - this.start[v];
      count[k]++;
    }
    return sum.map((x, k) => (count[k] ? x / count[k] : 0));
  }

  /** On the deep ocean: how many vertices of the bank stand above the sea. */
  get bankLand(): number {
    const b = this.bank;
    if (!b) return 0;
    const p = this.topo.basePositions;
    let k = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.rock[v] > 0 && Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) < b.r) k++;
    return k / this.scale;
  }

  /** In free play, end the fire when you choose: what heat is left is let go, and the long age begins. */
  end(): void {
    this.k.endless = false;
    this.reserve = 0;
    this.pressure = 0;
  }

  /**
   * An old, airless world: the great basins its first stones dug (each a broad bowl with a raised
   * rim), and a scatter of smaller craters over the highland between them. The basins are kept,
   * by where they are and how wide, for a world whose aim is to flood them.
   */
  readonly basins: { x: number; y: number; z: number; r: number }[] = [];
  /**
   * Every bowl dug in this world's ground (basins, craters, stones' craters): where, how wide, and
   * when (in `seconds`; the first ones long before the fire). For drawing them as a chart does.
   */
  readonly craters: { x: number; y: number; z: number; r: number; born: number }[] = [];
  /** A crater: a bowl `r` across and `depth` deep about a point, with a raised rim. */
  private bowl(c: { x: number; y: number; z: number }, r: number, depth: number): void {
    const p = this.topo.basePositions, n = this.rock.length;
    this.craters.push({ x: c.x, y: c.y, z: c.z, r, born: -1e4 });
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(p[v * 3] - c.x, p[v * 3 + 1] - c.y, p[v * 3 + 2] - c.z) / r;
      if (d > 1.6) continue;
      this.rock[v] += depth * (d < 1 ? -(1 - d * d) : 0.3 * Math.exp(-((d - 1.1) ** 2) / 0.05));
    }
  }
  private scar(): void {
    const n = this.rock.length, bowl = (c: { x: number; y: number; z: number }, r: number, depth: number) => this.bowl(c, r, depth);
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
    // A lumpy asteroid: broad lumps and hollows, as a rubble of rock not yet pulled round, and one
    // great crater gouged out of it, as Vesta's south pole was.
    if (this.k.terrain === 'asteroid' && this.k.lumps > 0) {
      const p = this.topo.basePositions, waves = Array.from({ length: 6 }, (_, i) => ({ d: point(), f: 1.2 + i * 0.55 + this.rand() * 0.6, ph: this.rand() * Math.PI * 2, a: 1 / (1 + i * 0.5) }));
      const sum = waves.reduce((t, w) => t + w.a, 0);
      for (let v = 0; v < n; v++) {
        let h = 0;
        for (const w of waves) h += w.a * Math.sin(w.f * (p[v * 3] * w.d.x + p[v * 3 + 1] * w.d.y + p[v * 3 + 2] * w.d.z) * Math.PI + w.ph);
        this.rock[v] += (this.k.lumps * 1.6 * h) / sum;
      }
      bowl(unit({ x: -this.plume.x, y: -this.plume.y + 0.4, z: -this.plume.z }), 0.75, this.k.lumps * 1.2);
    }
    // Spun fast, the world bulges at its equator.
    if (this.k.bulge > 0) { const p = this.topo.basePositions; for (let v = 0; v < n; v++) this.rock[v] += this.k.bulge * (1 - p[v * 3 + 1] ** 2); }
    if (this.k.terrain !== 'ocean' && this.k.terrain !== 'moon') for (let v = 0; v < n; v++) this.rock[v] = Math.max(0.004, this.rock[v]);
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

  /** The tide now, from -1 (low) to 1 (high): it begins rising. */
  get tideNow(): number {
    return this.k.tide > 0 ? Math.sin((this.seconds / this.k.tidePeriod) * Math.PI * 2) : 0;
  }

  /** How high the ground round the vent stands above the floor: the cone holding the pressure down. */
  get cone(): number {
    const t = this.topo, v = this.plumeVertex;
    let s = this.rock[v], c = 1;
    for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) { s += this.rock[t.nbrList[k]]; c++; }
    return Math.max(0, s / c - this.k.floor);
  }

  /**
   * Whether the world is tipped towards the giant, so a burst now would fly its way: the way the
   * vent leans from uppermost, against the way the giant is, both along the ground.
   */
  get towardGiant(): boolean {
    const g = this.gravity, s = this.giant;
    if (!g || !s) return false;
    const p = this.topo.basePositions, v = this.plumeVertex, n = { x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2] };
    const up = unit({ x: -g.x, y: -g.y, z: -g.z }), along = (a: { x: number; y: number; z: number }) => {
      const d = a.x * up.x + a.y * up.y + a.z * up.z;
      return { x: a.x - d * up.x, y: a.y - d * up.y, z: a.z - d * up.z };
    };
    const h = along(n), w = along(s), hl = Math.hypot(h.x, h.y, h.z), wl = Math.hypot(w.x, w.y, w.z);
    if (hl < 0.05 || wl < 1e-6) return false;
    return (h.x * w.x + h.y * w.y + h.z * w.z) / (hl * wl) > Math.cos(this.k.ringAim);
  }

  /** The suns' tides together (each as the cube of its nearness). */
  private get rawTide(): number {
    let t = 0;
    for (const s of this.stars) { const c = 1 / Math.sqrt(s.x * s.x + s.y * s.y + 0.05); t += c * c * c; }
    return t / 3;
  }
  /** The suns' tides, against this world's own usual: averaged over the last few seconds, and over the long run. */
  private tideNear = -1;
  private tideUsual = -1;
  /** The suns' tides now, as a share of their usual: 1 in an ordinary while, more as one swings close. */
  get sunTide(): number {
    if (!this.stars.length || this.tideUsual <= 0) return 1;
    return Math.max(0.3, Math.min(3, this.rawTide / this.tideUsual));
  }

  /** The three suns move: each pulled by the others, and gently back towards the middle so none flies off. In small steps, slowly. */
  private sunsMove(dt: number): void {
    const S = this.stars, steps = 4, h = (dt * 0.35) / steps;
    for (let k = 0; k < steps; k++) {
      for (const a of S) {
        let ax = -0.4 * a.x, ay = -0.4 * a.y;
        for (const b of S) {
          if (a === b) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy + 0.04, f = 0.8 / (d2 * Math.sqrt(d2));
          ax += dx * f; ay += dy * f;
        }
        a.vx += ax * h; a.vy += ay * h;
      }
      for (const a of S) { a.x += a.vx * h; a.y += a.vy * h; }
    }
    // An era is chaotic while the tides of the last few seconds run well above their long-run usual.
    const raw = this.rawTide;
    if (this.tideUsual < 0) this.tideNear = this.tideUsual = raw;
    this.tideNear += (raw - this.tideNear) * Math.min(1, dt / 8);
    this.tideUsual += (raw - this.tideUsual) * Math.min(1, dt / 90);
    if (!this.chaotic && this.tideNear > this.tideUsual * 1.25) { this.chaotic = true; this.tell('A chaotic era begins'); }
    else if (this.chaotic && this.tideNear < this.tideUsual) { this.chaotic = false; this.tell('A stable era begins'); }
  }

  /** How hard a burst of this much would throw now: more at high tide, less at low, on a tidal moon. */
  throwOf(volume: number): number {
    return volume * (1 + this.k.tideThrow * this.tideNow);
  }

  /** The pressure that bursts out on its own: more under a tall cone, on a world where the cone holds it. */
  get capNow(): number {
    return this.k.cap + (this.k.lid > 0 ? this.k.lid * this.cone : 0);
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
    // The lava lamp: the bud lets go as one blob; held too long, it bursts into small ones, which cool before they get far.
    if (this.k.lamp) {
      const q = this.plume;
      if (blast) { this.scatter(volume); return 'burst'; }
      this.tally.flows++;
      this.blobs.push({ x: q.x, y: q.y, z: q.z, area: volume, heat: 1 });
      return 'flow';
    }
    const v = this.plumeVertex, s = this.scale;
    if (volume < this.k.explosive) {
      this.tally.flows++;
      this.eruptions.push({ vertex: v, flank: this.flankOf(v), left: volume * s, rate: (volume * s) / this.k.pour, total: volume * s, t: 0, dur: this.k.pour * 1.7 });
      this.kick(volume, 0.35);
      return 'flow';
    }
    // A burst: most of it thrown up as ash that falls round the vent, the rest welling out.
    // Torn open, it throws its ash far and wide rather than piling it on the summit.
    // Where it can, the biggest throw some clear of the world altogether, into orbit.
    let left = volume;
    if (!blast && this.k.ringShare > 0 && this.towardGiant) {
      const fed = volume * this.k.ringShare;
      this.orbit += fed;
      left -= fed;
      this.tell('The plume reaches the ring');
    }
    if (!blast && this.k.orbitShare > 0 && volume > this.k.explosive) {
      const thrown = (volume - this.k.explosive) * this.k.orbitShare;
      this.orbit += thrown;
      left -= thrown;
    }
    // Where there's no air, the bigger the burst, the further its ash flies; and on a tidal moon,
    // further at high tide.
    const strength = this.throwOf(volume), far = this.k.ashRing > 0 ? Math.sqrt(strength / this.k.explosive) : 1;
    this.fallOfAsh(v, left * this.k.ashShare * s, (blast ? 3 : 1) * far);
    if (!blast) this.tally.bursts++;
    if (!blast && this.k.great > 0 && strength >= this.k.great) this.greatPlume(this.k.ashReach * this.k.ashRing * far);
    const lava = left * (1 - this.k.ashShare) * s;
    this.eruptions.push({ vertex: v, flank: v, left: lava, rate: lava / this.k.pour, total: lava, t: 0, dur: this.k.pour * 1.5 });
    if (!blast) this.kick(volume, 1);
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
    // Held shut, nothing pours: the world can be turned and tipped to aim, and the pressure builds.
    if (this.clamped) { this.pouring = tip >= this.k.tipPour; return; }
    // The lava lamp: tipped, the bud lets go (once each time the world is tipped); held level, it grows.
    if (this.k.lamp) {
      if (!this.pouring && tip >= this.k.tipPour) { this.pouring = true; this.erupt(); }
      else if (this.pouring && tip < this.k.tipPour * 0.7) this.pouring = false;
      return;
    }
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

  // ------------------------------------------------------------------ the lava lamp

  /** A burst: the heat flung out as a ring of small blobs round the vent. */
  private scatter(volume: number): void {
    const q = this.plume, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1), k = 6;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + this.rand(), o = 0.14;
      this.blobs.push({ ...unit({ x: q.x + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * o, y: q.y + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * o, z: q.z + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * o }), area: volume / k, heat: 1 });
    }
  }

  /** The blobs float, cool, merge, sink, and reach the far shore. */
  private lampStep(dt: number): void {
    const g = this.gravity, q = this.plume, up = g ? unit({ x: -g.x, y: -g.y, z: -g.z }) : { ...q };
    const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
    for (const b of this.blobs) {
      // Hot, it floats up; cold, it sinks: the way the world is held. Big blobs are slower, and cool slower.
      const size = Math.sqrt(Math.sqrt(b.area / 4)), towards = b.heat > 0.45 ? up : { x: -up.x, y: -up.y, z: -up.z };
      const speed = (this.k.blobSpeed * Math.sqrt(Math.abs(b.heat - 0.45) / 0.55)) / size, far = angle(b, towards);
      if (far > 1e-3) {
        const d = b.x * towards.x + b.y * towards.y + b.z * towards.z, tx = towards.x - d * b.x, ty = towards.y - d * b.y, tz = towards.z - d * b.z, tl = Math.hypot(tx, ty, tz) || 1, step = Math.min(far, speed * dt);
        Object.assign(b, unit({ x: b.x + (tx / tl) * step, y: b.y + (ty / tl) * step, z: b.z + (tz / tl) * step }));
      }
      // It cools as it goes; near the heat, it warms again.
      b.heat -= dt / (this.k.blobHot * Math.sqrt(b.area / 4));
      if (angle(b, q) < this.k.warmth) b.heat = Math.min(1, b.heat + dt * 0.25);
    }
    // Two hot blobs that touch run together.
    for (let i = 0; i < this.blobs.length; i++) {
      for (let j = i + 1; j < this.blobs.length; j++) {
        const a = this.blobs[i], b = this.blobs[j];
        if (a.heat < 0.5 || b.heat < 0.5 || angle(a, b) > (blobRadius(a.area) + blobRadius(b.area)) * 0.8) continue;
        const area = a.area + b.area;
        Object.assign(a, unit({ x: a.x * a.area + b.x * b.area, y: a.y * a.area + b.y * b.area, z: a.z * a.area + b.z * b.area }));
        a.heat = (a.heat * a.area + b.heat * b.area) / area;
        a.area = area;
        this.blobs.splice(j, 1);
        j--;
      }
    }
    // The far shore: a blob that reaches it still warm pools there. A cold one sinks into the deep and is gone.
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      if (this.shore && b.heat > 0.2 && angle(b, this.shore) < this.shore.r) {
        this.pooled += b.area;
        this.pooledBiggest = Math.max(this.pooledBiggest, b.area);
        this.blobs.splice(i, 1);
        this.tell('A blob reaches the far shore');
      } else if (b.heat <= 0) this.blobs.splice(i, 1);
    }
    // (No more than the lamp can draw: the coldest small ones go first.)
    while (this.blobs.length > 23) {
      let worst = 0;
      for (let i = 1; i < this.blobs.length; i++) if (this.blobs[i].heat * this.blobs[i].area < this.blobs[worst].heat * this.blobs[worst].area) worst = i;
      this.blobs.splice(worst, 1);
    }
  }

  /** The finger lifts from the vent held shut: whatever has built comes out at once, a flow or, if it's heavy, a burst. */
  unclamp(): void {
    if (!this.clamped) return;
    this.clamped = false;
    this.erupt();
  }

  /** Call the heat towards a point on the world (a unit vector); it creeps there beneath the crust. */
  callTo(x: number, y: number, z: number): void {
    this.target = unit({ x, y, z });
    this.called = true;
  }

  /** The tumble wanders and grows: its axis drifts, and its rate creeps back toward `tumble`. */
  private tumbleOn(dt: number): void {
    const w = this.spinNow, r = Math.hypot(w.x, w.y, w.z);
    if (r < 1e-6) { const a = unit({ x: 0.3, y: 1, z: 0.2 }); w.x = a.x * this.k.tumble; w.y = a.y * this.k.tumble; w.z = a.z * this.k.tumble; return; }
    // Its axis wanders, as a chaotic tumble's does.
    const j = 0.35 * Math.sqrt(dt), d = unit({ x: w.x / r + (this.rand() - 0.5) * j, y: w.y / r + (this.rand() - 0.5) * j, z: w.z / r + (this.rand() - 0.5) * j });
    const to = Math.min(this.k.tumble, r + this.k.tumbleGrow * dt);
    w.x = d.x * to; w.y = d.y * to; w.z = d.z * to;
  }
  /**
   * An eruption pushes against the tumble where it breaks out: it takes away part of the spin
   * across the vent (the part that sweeps the ground there past), so erupting where the ground is
   * rushing by calms it most, and at the pole of the spin, not at all.
   */
  private kick(volume: number, share: number): void {
    if (this.k.tumble <= 0) return;
    const w = this.spinNow, p = this.plume, along = w.x * p.x + w.y * p.y + w.z * p.z, r = Math.hypot(w.x, w.y, w.z);
    // (Most where the vent is on the tumble's equator, sweeping fastest; little towards its poles.)
    const square = r > 1e-6 ? (1 - Math.abs(along) / r) ** 2 : 0;
    const by = Math.min(0.45, this.k.tumbleKick * share * Math.min(1.5, volume / this.k.explosive)) * square;
    w.x -= by * (w.x - along * p.x); w.y -= by * (w.y - along * p.y); w.z -= by * (w.z - along * p.z);
  }
  /** How fast the moon tumbles now, as a share of how fast it tumbles left alone. */
  get tumbling(): number { return Math.hypot(this.spinNow.x, this.spinNow.y, this.spinNow.z) / Math.max(1e-6, this.k.tumble); }

  step(dt: number): void {
    this.seconds += dt;
    if (this.k.tumble > 0) this.tumbleOn(dt);
    for (let v = 0, f = Math.exp(-dt / 25); v < this.scorch.length; v++) if (this.scorch[v] > 0) this.scorch[v] *= f;
    // The heat rises out of its store: fast at first, slower as the planet cools, and then it is gone.
    // (Or, on a world whose heat rises evenly, at one pace until it's gone.)
    // (And on a tidal moon, faster at high tide and slower at low.)
    if (this.k.suns) this.sunsMove(dt);
    const rise = Math.min(this.reserve, this.k.rising * (this.k.steady ? 1 : Math.sqrt(Math.max(0, this.reserve) / this.k.heat)) * (1 + this.k.tide * this.tideNow) * (this.k.suns ? this.sunTide : 1) * dt + 1e-4 * dt);
    if (!this.k.endless) this.reserve -= rise; // (in free play, the store never empties)
    this.pressure += rise;
    if (this.pressure >= this.capNow) {
      if (!this.k.lamp) this.collapse();
      this.erupt(true);
      this.tally.calderas++;
      this.tell(this.k.lamp ? 'Held too long: the blob burst apart' : 'Held too long: the mountain blew apart');
    }
    // The store is spent: whatever pressure is left comes out by itself, the last of the fire.
    if (this.reserve < 0.01 && this.pressure >= this.k.least && !this.erupting) { this.erupt(); this.tell('The last of the heat escapes'); }
    if (this.reserve < 0.01 && this.pressure < this.k.least) this.pressure = 0;
    if (this.gravity) this.tipped(dt);
    if (this.k.lamp) this.lampStep(dt);
    // A giant's ring thins away, unless it's fed.
    if (this.k.ringThins > 0) this.orbit -= this.orbit * this.k.ringThins * dt;
    this.movePlume(dt);
    this.pour(dt);
    this.flow(dt);
    this.cool(dt);
    for (let v = 0; v < this.age.length; v++) { if (this.lava[v] < this.k.thin) this.age[v] += dt; this.laid[v] += dt; }
    // The slow forces every quarter second, and life the step after, so no one step carries both.
    this.slowIn -= dt;
    const half = this.rock.length >> 1;
    if (this.slowHalf) { this.slowHalf = false; this.slow(0.25, half, this.rock.length); this.livingDue = true; }
    else if (this.livingDue) { this.livingDue = false; this.living(0.25); }
    else if (this.slowIn <= 0) { this.slow(0.25, 0, half); this.slowIn = 0.25; this.slowHalf = true; }
    this.stones(dt);
    this.storms(dt);
    // The long age on an airless world: small stones still fall, and pock what the fire left.
    if (this.over && this.k.ageCraters > 0 && this.rand() < this.k.ageCraters * dt) {
      const z = this.rand() * 2 - 1, a = this.rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      this.bowl({ x: s * Math.cos(a), y: s * Math.sin(a), z }, 0.02 + this.rand() * 0.035, 0.02);
    }
  }

  /** Whether a dust storm is blowing now; and, if one is on its way, how soon it comes. */
  storm = false;
  stormComing: number | null = null;
  private stormIn = 0;
  private stormLeft = 0;
  private storms(dt: number): void {
    // (The storms go on in the long age after the fire, wearing what it built.)
    if (this.k.stormEvery[1] <= 0) { this.storm = false; return; }
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
    this.craters.push({ x: p[at * 3], y: p[at * 3 + 1], z: p[at * 3 + 2], r, born: this.seconds });
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
    if (g && this.k.rises > 0 && !this.called) this.target = unit({ x: -g.x, y: -g.y, z: -g.z });
    // On its own, slowly one way; towards where it's called, faster, until it gets there.
    // (Once the fire is out there is nothing to carry: the world is still, for its long age.)
    const drift = this.over ? 0 : this.k.drift;
    let mx = this.drift.x * drift, my = this.drift.y * drift, mz = this.drift.z * drift;
    if (this.target) {
      const t = this.target, along = t.x * q.x + t.y * q.y + t.z * q.z;
      const tx = t.x - along * q.x, ty = t.y - along * q.y, tz = t.z - along * q.z, tl = Math.hypot(tx, ty, tz);
      const angle = Math.acos(Math.min(1, along));
      if (angle < 0.01 || tl < 1e-6) { this.target = null; this.called = false; }
      else { const sp = Math.min(this.called ? Math.max(this.k.rises, 0.04) : g ? this.k.rises : this.k.creep, angle / dt); mx += (tx / tl) * sp; my += (ty / tl) * sp; mz += (tz / tl) * sp; }
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

  /** A great plume has risen from the vent: counted if it's on fresh ground, far enough from the others. */
  private greatPlume(reach: number): void {
    const q = this.plume, apart = Math.cos(this.k.plumesApart);
    if (this.plumes.some((o) => o.x * q.x + o.y * q.y + o.z * q.z > apart)) { this.tell('A great plume, but too near an earlier one'); return; }
    this.plumes.push({ x: q.x, y: q.y, z: q.z, reach });
    this.tell(`A great plume: ${this.plumes.length}`);
  }

  /** Ash falls round a vent, thickest nearest: a cone of soft ground, and death further out. Or, where there's no air, in a ring. */
  private fallOfAsh(at: number, volume: number, wide: number): void {
    const p = this.topo.basePositions, r = this.k.ashReach * wide, n = this.rock.length;
    const w = this.next;
    let sum = 0;
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < this.k.ashKills * wide) this.life[v] *= (d / (this.k.ashKills * wide)) ** 2;
      if (d < this.k.ashDusts * wide) this.rich[v] = Math.max(this.rich[v], 1 - (d / (this.k.ashDusts * wide)) ** 2);
      const ring = this.k.ashRing;
      w[v] = ring > 0 ? (Math.abs(d - r * ring) < r ? Math.exp(-(((d - r * ring) / (r * 0.3)) ** 2)) : 0) : d < r * 3 ? Math.exp(-((d / r) ** 2)) : 0;
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
      let amount: number;
      if (e.dur && e.total !== undefined && e.t !== undefined) {
        const x0 = Math.min(1, e.t / e.dur), x1 = Math.min(1, (e.t + dt) / e.dur);
        e.t += dt;
        amount = x1 >= 1 ? e.left : Math.min(e.left, e.total * (swell(x1) - swell(x0)));
      } else amount = Math.min(e.left, e.rate * dt);
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
      const own = (w: number) => s - (this.rock[w] + this.lava[w]), selfG = this.k.selfGravity;
      const held = G
        // Held like a globe: how far down the neighbour is along gravity, the ground raised as it
        // is drawn, counted back into the ground's own heights. Near the top the relief is all of
        // it; further round, the curve of the world pulls the lava down its side.
        ? (w: number) => {
          const sw = this.rock[w] + this.lava[w], kv = 1 + R * s, kw = 1 + R * sw;
          return ((p[w * 3] * kw - p[v * 3] * kv) * G.x + (p[w * 3 + 1] * kw - p[v * 3 + 1] * kv) * G.y + (p[w * 3 + 2] * kw - p[v * 3 + 2] * kv) * G.z) / R;
        }
        : own;
      const base = selfG > 0 && G ? (w: number) => selfG * own(w) + (1 - selfG) * held(w) : held, spin = this.k.spin;
      // Spun fast, lava is flung outwards from the axis: towards the equator, as much as down.
      const drop = spin > 0 ? (w: number) => base(w) + spin * (p[v * 3 + 1] ** 2 - p[w * 3 + 1] ** 2) : base;
      let sum = 0, weights = 0;
      for (let q = a; q < b; q++) { const d = drop(t.nbrList[q]); if (d > 0) { sum += d; weights += Math.pow(d, this.k.channel); } }
      if (sum <= 0) continue;
      // Viscous, as lava is: it runs fast where it lies deep and hardly at all where it's thin (its
      // flux rising as its depth to the power two and a half, nearly as a Bingham fluid's does down a slope), so a
      // flow's thick core pushes its thin margin ahead of it in blunt, rounded lobes.
      const lv = l * Math.sqrt(l), out = Math.min(l * 0.5, this.k.flow * dt * sum * lv / (lv + VISCOUS_15));
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
      // (In a tube of its own fresh crust, lava in the sea cools far slower.)
      const tube = sea && this.k.tubes < 1 && this.laid[v] < this.k.tubeFresh ? this.k.tubes : 1;
      const solid = l < this.k.thin ? l : l * (1 - Math.exp(-(sea ? this.k.coolSea * tube : this.k.coolLand) * dt));
      if (solid > 0) this.laid[v] = 0;
      this.lava[v] -= solid;
      this.rock[v] += solid;
      if (l > this.k.cover) { if (this.life[v] > 0.05) this.scorch[v] = 1; this.age[v] = 0; this.life[v] = 0; this.ash[v] = 0; this.rich[v] = 0; }
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
        // (On a three-sun world the tides surge with the suns, and wear the coasts the harder.)
        const worn = sea ? Math.min(r[v] - this.k.shallows, this.k.waves * (this.k.suns ? this.sunTide ** 2 : 1) * dt * (sea / (b - a)) * 2 * wear) : 0;
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
    if (this.over || !this.stonesFall || this.k.impactEvery[1] <= 0) return;
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
