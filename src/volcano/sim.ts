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
import { realHeight, pointAt, type RealName } from './real';
import { Marble } from './marble';

const REFERENCE = 16002; // an icosphere of detail 40
/** The depth about which lava runs freely: much thinner, and it hardly moves (see `flow`). */
const VISCOUS = 0.0138, VISCOUS_15 = VISCOUS * Math.sqrt(VISCOUS);
/**
 * Lava's own clock, against everything else's: it spreads and sets this much slower than the
 * worlds' rules say, both alike, so a flow ends where it always did but takes its time getting
 * there, creeping and staying molten long enough to be watched.
 */
const LAVA_PACE = 0.3;
/** The fastest lava runs off a vertex, as a rate per second (it used to be half of it each twentieth of a second). */
const RUN_MOST = 13.9;
/** How fast a smear thinner than `thin` sets, per second: at once, as it was, at the full pace. */
const THIN_SETS = 20;

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
  /**
   * A hollow world: a thin crust over one shallow chamber, which every eruption drains. This much heat let
   * out empties it (0: no chamber to empty); it fills again at `hollowRefill` of itself a second. Emptying,
   * the ground over it sags; emptied, the summit falls in, a caldera `hollowDepth` times the usual
   * depth, and what was built there goes down with it. (As Kilauea's summit did in 2018.)
   */
  hollow: 0,
  hollowRefill: 0.02,
  hollowDepth: 1.5,
  caldera: 0.09,
  calderaDepth: 0.12,
  calderaKills: 0.35,
  /** Less than this, and there isn't enough to erupt. */
  least: 0.6,
  /** Seconds an eruption takes to pour out. */
  pour: 4.5,

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
  /** Io: a great plume is counted only with the tide at least this high (1 the highest); -1: at any tide. */
  greatTide: -1,
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
  pourLeast: 1.8,
  /** (It ran from 0.8 to 6: tipped hard, lava gushed out several times faster than an eruption lets it, so it was fast one moment and
   *  slow the next. Tipped a little it pours as it did; tipped hard, no longer a gush. Faster than the heat rises, so tipping drains it.) */
  pourMost: 3,
  rises: 0.016,
  /** How strongly lava keeps to the steepest way down (1 spreads evenly; higher runs in tongues). */
  channel: 3,
  /** How much the ground's grain steers the lava (each way down weighted by 0.35 plus this times its grain), and how much of that grain is fine, point to point, so a flow splits round small rises into tongues. */
  grainPull: 3,
  grainFine: 1.2, // (so a front splits round small rises: grained only broadly, flows spread as round lobes)
  flow: 10,
  /** Lava cools into rock at these rates per second: slowly on land, fast in the sea. */
  coolLand: 0.2,
  coolSea: 2.4,
  /** Thinner than this, lava is simply rock; thicker than `cover`, it clears the ground it runs over. */
  thin: 0.003, // (stiff, as lava is: a thin front stops rather than creeping on, so a flow runs on in tongues where it's deep instead of spreading in a sheet; 0.0015 made balloons)
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
  /**
   * The world's surface gravity, Earth's being 1. Weaker, slopes stand steeper, lava runs slower and
   * a burst throws its ash further; each softened (by a small power) and held within bounds, so a
   * tiny moon still plays: see `gravity`. The rules below are Earth's, and scaled by it.
   */
  g: 1,
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
   * The first world: the glow a stone is caught in grows as the volcano is built, up to this much wider (a share
   * of its first size) once `catchFull` of lava has been let out, by pouring or bursting. 0: it doesn't grow.
   */
  /**
   * The first world, growing as a planet grows: each stone caught adds its size to the world's (`mass`, 1 at first),
   * and stones come in sizes to match, some too big to hold; grown to this size, Theia comes. 0: stones are only heat.
   */
  accrete: 0,
  catchGrow: 0,
  catchFull: 150,

  /**
   * What the world is like at the start: 'ocean', one sea over an even floor; or 'moon', airless
   * highland scarred by `basins` great old impact basins, and a scatter of smaller craters.
   */
  terrain: 'ocean' as 'ocean' | 'moon' | 'mars' | 'ice' | 'io' | 'young' | 'asteroid' | 'spin' | 'glass' | 'rogue' | 'dust' | 'magma' | 'first' | 'triton',
  /** On a lumpy asteroid: how far its ground rises and falls from round, in broad lumps (and one great crater). */
  lumps: 0,
  /**
   * How much the world's own gravity, rather than how it's held, decides which way lava runs, 0 to
   * 1: on a body as small as an asteroid, down is towards its own middle, so lava finds its own
   * hollows, and the hand only nudges it.
   */
  selfGravity: 0.35, // (less than it was, 0.6: the phone's tilt, which the player steers by, counts for more)
  /**
   * Levees: a flow's thin margin, next to bare ground, sets this many times faster than its body, so
   * a flow walls itself in and runs on down its own channel, as basalt does. 1: no levees.
   */
  levee: 3,
  /**
   * Breakouts: a flow's front doesn't creep evenly but swells and holds, then breaks out in a new
   * lobe, here and then there (pahoehoe's toes). How much it holds back between: 0, not at all.
   */
  breakout: 0.75,
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
  /** Lava laid within this many seconds is still fresh and hard, and a storm doesn't wear it: pour just before one, and the peak is kept (0: every height wears alike). */
  stormFresh: 0,
  /** How much of a mountain's top counts as its summit (see `summit`), as vertices on a planet of the drawn detail. */
  summitOf: 30,
  /** Whether there is life at all; and, if there is, how often (seconds) it begins afresh at a vent that has none near it. */
  life: true,
  reseed: 30,
  seedReach: 0.3,
  /**
   * The drying seas, a billion years on, the sun brighter: the sea falls this much a second (all the ground rises
   * against it, as it were); a burst's ash in the sky shades it, and it falls by only a fifth as fast while the sky
   * is full of ash. A burst of `shadeFull` fills the sky (smaller ones much less: by the square of their size, as
   * only great eruptions reach high enough to cool a world), and the ash thins away over `shadeLasts` seconds. (The
   * sky holds only so much, so bursts that keep it full do more than a few great ones with clear sky between.)
   */
  dries: 0,
  shadeFull: 12,
  shadeLasts: 14,
  /** Whether life begins only in the shallows near the vent, where it can live (as coral), rather than in any warm water. */
  seedShallow: false,
  /**
   * How long living ground takes to grow up (seconds; twice as fast on ground rich with ash): first
   * moss, then grass and ferns, then what the ground will hold, a wood on the heights, as a new
   * volcanic island greens. (See `grown`, and the stages drawn in ecology.ts.)
   */
  mature: 150,
  /**
   * Life arriving from elsewhere, as it came to Surtsey: every so many seconds, a seed lands on
   * bare ground that stands above the sea (0: never; life only begins at the vents).
   */
  arrives: 0,
  /** Whether life asks for kinds of ground (ecology.ts's wishes). */
  wishes: false, // (the kinds are no longer an aim anywhere, so a wish for one was a stray sign)

  /**
   * Real terrain: the world's own heights, from NASA's maps (see real/), each km of them `realScale`
   * of the world's height (far steeper than life, as a relief globe is); and its basins, where they
   * really are (latitude, longitude, radius in km on a world `realRadius` km round). '': made up.
   */
  /**
   * The first world: it begins molten all over, magma this deep, crusting as it cools; and each
   * stone of the rubble that falls melts this much of its crater again. 0: none.
   */
  magma: 0,
  /** (Where the first world's magma lies deepest: a turn of its patches, so not every first world crusts alike.) */
  magmaSeed: 1.3,
  impactMelt: 0,
  /** Stones fall within this far of the vent (radians; 0: half near it, the rest anywhere), so each can be reached in time. */
  impactNear: 0,
  /**
   * Earth's first water: this share of the stones are icy comets (pale), the rest rock. A comet brings no heat: landing on
   * the volcano it chills it, taking `iceCool` of the heat; landing on lava laid within `iceWarmFor` seconds, it melts
   * into a pond (counted in `water`); on cold ground it only freezes. 0: all rock.
   */
  icy: 0,
  iceCool: 20,
  iceWarmFor: 30,
  /** And how near the volcano an icy comet falls (radians: lava can be poured out that far), and how near the spot it lands warm lava must be to melt it. */
  iceNear: 0.45,
  iceReach: 0.1,
  /** The orange Earth: an eruption's gas uses up this much of the oxygen in the sky for each unit of heat let out (a pour's, none). 0: none. */
  gasEats: 0,
  /** The orange Earth: life in the shallows breathes out this much oxygen a second, at full strength over a planet of the drawn detail's worth of shallows. 0: none. */
  breathe: 0,
  /**
   * Europa: let out from `chaos` up, the heat melts up through the ice and breaks it into rafts: a chaos
   * field, counted if it's `plumesApart` from the last. Held on past `explosive`, it bursts, and blasts a hole
   * through the ice instead, which breaks nothing. 0: none.
   */
  chaos: 0,
  /**
   * Venus and Wright Mons: a dome is counted once the ground at the vent stands this much above
   * where it began, if it's `plumesApart` from the others. 0: none. With `domeRing`, a great hollow
   * lies this far (radians) from where the heat begins, and only a mound on the ring round it,
   * within `domeBand` of the ring, is counted (as Wright Mons is a ring of mounds round a pit).
   */
  dome: 0,
  domeRing: 0,
  domeBand: 0.12,
  /**
   * Grindavík: a town this far (radians) down the slope from the fissure, `townR` across, its
   * houses lost where lava reaches them; the ground falls `slope` from the fissure to the town (over
   * the whole world, a gentle tilt). Lava runs by the ground alone, however the world is held
   * (`byGround`), and `walls` taps of earth can be raised as walls `wallHeight` high to turn it.
   */
  town: 0,
  townR: 0.08,
  slope: 0,
  byGround: false,
  /**
   * Grindavík: the heat comes up along a fissure, not a point: a line this long either side of the vent (radians),
   * across the slope but turned `fissureTurn` (radians) from straight across, lava welling out all along it, most
   * in its middle. 0: a single vent.
   */
  fissure: 0,
  fissureTurn: 0.35,
  /**
   * A new island, as Surtsey was: seabirds come to nest on land that has stood dry and cool for `nestAfter`
   * seconds (lava rock, set and cooled, not ash), one every `nestEvery` seconds, no nearer than `nestApart` (radians) to another nest or `nestVent`
   * to the vent. A nest is lost where lava reaches it, ash buries it, or the sea wears away the ground under it.
   * 0: no birds come.
   */
  nests: 0,
  nestAfter: 15,
  nestEvery: 3,
  nestApart: 0.07,
  nestVent: 0.07,
  /**
   * Whether this world's rock keeps a record of how it was made, for the field book: lava run into the sea from
   * land sets as pillows; a fountain let go nearly full from a dry vent spins threads of glass.
   */
  formations: [] as string[],
  /**
   * Mars: how tall (in height) the mountain may stand for each radian its narrowest side reaches out from the vent;
   * built taller, that side gives way, and `collapseTakes` of the excess falls from the top. 0: it never does.
   */
  taper: 0,
  collapseTakes: 0.8,
  /** ...counting as its base only ground built up this thick. */
  baseThick: 0.04,
  /** The orange Earth: the oxygen at which the sea's iron rusts out in bands, for the field book (0: never). */
  bandedAt: 0,
  /** Mars: patches of ice under the ground, this many, `iceR` across, round the mountain; lava over them blasts small steam cones. */
  groundIce: 0,
  iceR: 0.05,
  /** Mars: how much a storm favours the side facing it (0, all sides alike; 1, only the side facing it, three times as hard). */
  stormSide: 0,
  /** Where the vent stands lower than this, the sea still reaches it, and a burst is all ash. 0: as on any world. */
  wet: 0,
  /**
   * Io's two fires, a lava lamp: within this far (radians) of where the heat begins is a round pool of two fluids
   * that never mix, marbled as ink is on water (see marble.ts). A finger held in it pours your lava there, `marblePour`
   * heat a second, each unit of heat covering `marbleArea` (square radians); drawn through it, it drags the colours
   * along. Blue wells up by itself somewhere in the pool every `sulphurEvery` seconds, `sulphurArea` at a time, and
   * slow currents turn the colours round, one every `currentEvery` seconds, as far as `currentTurn` (radians) at their
   * middle. Marbled is when the two colours meet along `marbleLines` (see Marble.measure). 0: none.
   */
  marble: 0,
  sulphurEvery: 4,
  sulphurArea: 0.006,
  marbleArea: 0.0016,
  marblePour: 3,
  currentEvery: 2.5,
  currentTurn: 0.7,
  marbleLines: 600,
  /** ...and how far (radians) the way down is tipped from straight into the ground, towards the town. */
  fallTilt: 0.8,
  walls: 0,
  wallHeight: 0.035,
  /** How wide a wall is, on a world of the drawn detail (scaled with the ground's points elsewhere). */
  wallWidth: 0.026,
  /**
   * Triton: a burst in sunlight is a geyser, its dark plume blown downwind (east, along the
   * world's turning) into a streak this long (radians), counted if it's `plumesApart` from the last.
   * 0: none.
   */
  streak: 0,
  /**
   * Mercury: a burst's shock goes through the world and meets again at the exact opposite point,
   * the antipode, as the Caloris impact's did, breaking the ground there into the "weird terrain":
   * after `antipodeDelay` seconds, this share of it erupts there, far more for a bigger burst (by the
   * square of how far past the burst point it was held). 0: none.
   */
  antipode: 0,
  antipodeDelay: 6,
  /**
   * Ol Doinyo Lengai's carbonatite: lava set this many seconds ago turns from black to white, as its
   * soda lava does in a day or two (0: it doesn't); how white the cone is is reckoned within
   * `whiteReach` (radians) of the vent.
   */
  whiteAt: 0,
  whiteReach: 0.35,
  /** Kawah Ijen: sulphur burning blue as it runs, and still glowing this many seconds after it sets (0: none). */
  burns: 0,
  /**
   * Hunga Tonga: a burst from a vent just under the sea, no deeper than this, is the kind that shakes
   * the air: a pressure wave rings the whole world. Any burst from as high or higher blows the cone
   * apart, `waveDig` of it gone. 0: none.
   */
  wave: 0,
  waveDig: 0.08,
  /**
   * Breathing, the calm way to play: the volcano lets its heat out by itself each time the pressure
   * reaches this, as a flow down the world as it's held (0: only as the player tips it). A finger held
   * down holds the breath, for a bigger one.
   */
  pulse: 0,
  real: '' as '' | RealName,
  realScale: 0.04,
  realRadius: 1737,
  realBasins: [] as [number, number, number][],

  /**
   * A rogue planet, with no star: life lives only on ground still warm from lava, for this many
   * seconds after it last set there, and dies as it cools (0: life needs no warmth). Life lands only within
   * `hearth` (radians) of the vent, the one warm place (0: anywhere).
   */
  warmLasts: 0,
  /**
   * The rogue planet: ground is warm for `warmLasts` seconds after lava last ran beside it (within two steps of the
   * mesh), not only where it was laid; so life does best in a band along a flow's edge, and dies under the lava. 0: off.
   */
  warmNear: 0,
  /**
   * Pluto: its slush freezes fast, so a mound is built in short pours, each layer let freeze. Poured on for more
   * than this many seconds at once, the mound slumps, its top lowered by `slumpBy` a second (0: never).
   */
  slumpAfter: 0,
  slumpBy: 0.03,
  hearth: 0,
  /**
   * Snowball Earth: ice from pole to pole, and the eruptions' gas warming the sky. Each unit of heat
   * let out through open air (the vent on land above the sea, or in open water) gives this much gas
   * as a burst, `gasPour` of it as a flow; the sky loses `drawdown` of what it holds a second (the
   * rock drawing it down). With `thawAt` in the sky the ice gives way of itself, from the equator
   * out, until the world is open sea. 0: no ice.
   */
  gas: 0,
  gasPour: 0.35,
  drawdown: 0.012,
  thawAt: 100,
  /**
   * A world boiling away under its star, as Kepler-1520b is: new ground facing the star (lava, and
   * the rock it has laid) loses this much height a second, full on, and what it loses streams away in
   * a tail of dust. 0: none.
   */
  boil: 0,
  /**
   * A lava world, one face to its star: lava there cools only `dayCool` as fast, staying molten, and
   * this much of it a second rises as rock vapour, which falls as rock snow on the night side, near
   * its edge. 0: none.
   */
  vapour: 0,
  dayCool: 1,
  /**
   * The red giant: the swollen Sun's light melts whatever stands in the day, this much height a second full on,
   * down to `meltFloor`; and the night shrinks as the fire burns on (the Sun still swelling), the edge of day
   * moving from facing it to `nightShrink` round towards the far side (as a cosine: 0, half the world in night;
   * -0.75, about a sixth). 0: none.
   */
  melt: 0,
  meltFloor: 0.01,
  nightShrink: 0,
};

/** A world's rules as its gravity makes them: steeper, slower and further-thrown where it's weaker. */
export function gravity(k: Rules): Rules {
  if (k.g === 1) return k;
  const by = (power: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, k.g ** power));
  return { ...k, talus: k.talus * by(-0.3, 0.8, 2), flow: k.flow * by(0.3, 0.45, 1.3), ashReach: k.ashReach * by(-0.4, 0.8, 3) };
}

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
export interface Blob { x: number; y: number; z: number; area: number; heat: number; /** Running into another (merging), or into the pool on the far shore: given over a moment, not at once. */ into?: Blob | 'pool' }
/** A blob's radius, in radians across the world, from how much of it there is. */
export const blobRadius = (area: number): number => 0.035 * Math.sqrt(area);

export interface Impact { vertex: number; in: number; icy?: boolean; size?: number; theia?: boolean }

export class Planet {
  /** Rock height at each vertex, relative to the sea. */
  readonly rock: Float32Array;
  /** Molten lava lying on the rock. */
  readonly lava: Float32Array;
  /** Seconds since lava last covered each vertex. */
  readonly age: Float32Array;
  /**
   * Which flow last covered each vertex: the number of the pour that laid it (see `flowsPoured`), or
   * -1000 where none has. (A pour is a new flow when it comes after a quiet while: the pour itself starts
   * and stops as the world is tipped.) Drawn, so the flows read in the order they came.
   */
  readonly flowOf: Int32Array;
  /** How many flows have been poured. */
  flowsPoured = 0;
  private pouredAt = -1e9;
  /** How much of the ground is ash, 0 to 1: soft, and fertile. */
  readonly ash: Float32Array;
  /** How rich the ground is with fallen ash, 0 to 1: life takes it sooner and grows there faster. */
  readonly rich: Float32Array;
  /** Life at each vertex, 0 to 1: on land, and as reef in the shallows. */
  readonly life: Float32Array;
  /** How grown up the life on land is, 0 (just come) to 1 (all the ground will hold), over `mature` seconds. */
  readonly grown: Float32Array;
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
  private pourCounted = true;
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
  /**
   * How far the phone is tipped from level, 0 to 1, as the player holds it (null: reckoned from the
   * vent's place, as held). Pouring goes by this, so turning the world never pours by itself.
   */
  tilt: number | null = null;
  /** Which way is down when the phone is held level, in the planet's frame (null: as gravity is). The heat rises against this, so tipping to pour doesn't drag the vent the other way. */
  upright: { x: number; y: number; z: number } | null = null;
  /** Which way its star is, in the planet's frame (a unit vector), on a world it boils or bakes. */
  star: { x: number; y: number; z: number } | null = null;
  /** Snowball Earth: the gas in the sky; how far from the equator the ice has let go (as the sine of the latitude); and whether it has given way of itself. */
  greenhouse = 0;
  iceLine = 0;
  thawed = false;
  /** Ol Doinyo Lengai: the share of the cone (within `whiteReach` of the vent) that its lava has turned white. */
  get whiteShare(): number {
    const p = this.topo.basePositions, q = this.plume;
    let all = 0, white = 0;
    for (let v = 0; v < this.rock.length; v++) {
      if (Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z) > this.k.whiteReach) continue;
      all++;
      if (this.laid[v] < 1e5 && this.laid[v] >= this.k.whiteAt && this.lava[v] < this.k.thin) white++; // (lava set there a while: ash doesn't whiten)
    }
    return all ? white / all : 0;
  }
  /** Ol Doinyo Lengai: the share of its summit (within 0.1 of the vent) turned white. */
  get whiteSummit(): number {
    const p = this.topo.basePositions, q = this.plume;
    let all = 0, white = 0;
    for (let v = 0; v < this.rock.length; v++) {
      if (Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z) > 0.1) continue;
      all++;
      if (this.laid[v] < 1e5 && this.laid[v] >= this.k.whiteAt && this.lava[v] < this.k.thin) white++;
    }
    return all ? white / all : 0;
  }
  /** Kawah Ijen: how much of the world its blue fire lights now (in vertices of a planet of the drawn detail): lava running, or set within `burns` seconds. */
  get burning(): number {
    let c = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.lava[v] > this.k.thin || (this.laid[v] < this.k.burns && this.age[v] < 1e5)) c++;
    return c / this.scale;
  }
  /** Hunga Tonga: the pressure waves sent round the world: where they began, and when. */
  readonly waves: { x: number; y: number; z: number; at: number }[] = [];
  /** Mercury: the far side, opposite where the heat began (with the width its mountain is measured across); what's on its way there; and how many have arrived. */
  far: { x: number; y: number; z: number; r: number } | null = null;
  private echoes: { at: number; volume: number }[] = [];
  echoed = 0;
  /** How high new ground stands at the far side, at its highest (in the world's height). */
  get farRaised(): number {
    const f = this.far, p = this.topo.basePositions;
    if (!f) return 0;
    let most = 0;
    for (let v = 0; v < this.rock.length; v++) if (Math.hypot(p[v * 3] - f.x, p[v * 3 + 1] - f.y, p[v * 3 + 2] - f.z) < f.r) most = Math.max(most, this.rock[v] - this.start[v]);
    return most;
  }
  /** The orange Earth: the oxygen life has breathed into the sky so far, less what eruptions' gas has used up (below 0, a debt). */
  oxygen = 0;
  /** The drying seas: how full the sky is of a burst's ash (0 to 1), and how far the sea has fallen in all. */
  ashSky = 0;
  dried = 0;
  /** Rock boiled away by the star, and rock snow fallen on the night side, so far (in the volume heat is reckoned in). */
  lost = 0;
  snow = 0;
  /** On the lava-lamp world: the blobs, the far shore they're to be brought to, how much has pooled there, and the biggest that came. */
  readonly blobs: Blob[] = [];
  shore: { x: number; y: number; z: number; r: number } | null = null;
  pooled = 0;
  pooledBiggest = 0;
  /** The deep ocean's bank: where, and how wide. */
  bank: { x: number; y: number; z: number; r: number } | null = null;
  /** Which vertices are on the bank's shallow top: lava crossing it sets there, tube or not. */
  private onBank: Uint8Array | null = null;
  /** Seconds since lava last set into rock at each vertex (for its tubes). */
  readonly laid: Float32Array;
  /** Seconds since lava last ran at or beside each vertex (see `warmNear`). */
  readonly nearLaid: Float32Array;
  /** Where the ground has ever stood clear of the sea. */
  readonly wasLand: Uint8Array;
  /** Mars: where there's ice under the ground (1), not yet reached by lava. */
  readonly frozen: Uint8Array;
  /** A new island: how long the ground at each vertex has stood dry, out of the sea and clear of lava (seconds). */
  readonly dryFor: Float32Array;
  /** ...the seabirds' nests standing, and how many have been lost, to the lava and to the sea. */
  readonly nests: { v: number; at: number }[] = [];
  readonly nestsLost = { lava: 0, sea: 0, ash: 0 };
  nestIn = 0;
  private nestTick = 0;
  /** The field book: the formations this world's rock has made so far (see `formations`), as they were first made. */
  readonly found: string[] = [];
  /** Each place's own moment for breaking out (see `breakout`). */
  private readonly breakPhase: Float32Array;
  /** Whether stones fall at all: off until the player has been shown them. */
  stonesFall = true;
  /** Earth's first water: icy comets melted into ponds on warm lava. */
  water = 0;
  seconds = 0;

  private eruptions: Eruption[] = [];
  private next: Float32Array;
  /**
   * The ground's grain, as lava finds it (0 to 1, fixed): where a flow divides between the ways
   * down, it favours the rougher-grained ones, a little, so it runs in fingers and lobes, as lava
   * does, rather than spreading in even discs round the vent. Only where it goes, not how much.
   */
  private grainOf: Float32Array;
  private firmness: Float32Array;
  private drift: { x: number; y: number; z: number };
  private scale: number;
  private seed: number;
  private slowIn = 0;
  private impactIn: number;
  /** Earth's first water: whether each of the last two to fall was an icy comet. */
  private lastKinds: boolean[] = [];
  private began = false;
  private seedIn = 0;
  private arriveIn = 0;
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
    this.k = gravity({ ...VOLCANO, ...rules });
    this.reserve = this.k.heat;
    const n = topo.vertexCount, p = topo.basePositions;
    this.scale = n / REFERENCE;
    this.seed = seed;
    this.rock = new Float32Array(n);
    this.lava = new Float32Array(n);
    this.age = new Float32Array(n).fill(1e6);
    this.flowOf = new Int32Array(n).fill(-1000);
    this.ash = new Float32Array(n);
    this.rich = new Float32Array(n);
    this.life = new Float32Array(n);
    this.grown = new Float32Array(n);
    this.sunk = new Float32Array(n);
    this.wear = new Float32Array(n);
    this.scorch = new Float32Array(n);
    this.next = new Float32Array(n);
    this.grainOf = new Float32Array(n);
    this.slowDelta = new Float32Array(n);
    this.firmness = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      this.grainOf[v] = 0.5 + (Math.sin(x * 23.1 + y * 9.7 + 0.7) + Math.sin(y * 21.3 - z * 11.9 + 1.9) + Math.sin(z * 24.7 + x * 8.3 - 2.3) + Math.sin((x + y - z) * 37.9)) / 8;
      if (this.k.grainFine > 0) { const h = Math.sin(x * 412.7 + y * 289.3 + z * 157.1) * 43758.5453; this.grainOf[v] = Math.max(0, this.grainOf[v] + this.k.grainFine * (h - Math.floor(h) - 0.5)); }
      const fine = (Math.sin(x * 13.1 + z * 7.3) + Math.sin(y * 11.7 - x * 9.1 + 2.1) + Math.sin(z * 12.3 + y * 8.9 - 1.3)) / 3;
      this.firmness[v] = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(x * 17.3 + y * 5.1 - z * 11.9) * Math.sin(y * 13.7 + z * 6.3 + 0.7));
      this.rock[v] = this.k.floor + this.k.rough * fine + (this.k.real ? this.k.realScale * realHeight(this.k.real, x, y, z) : 0);
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
    // Mars: ice under the ground, in patches round where the mountain will stand, a little way off.
    this.frozen = new Uint8Array(this.rock.length);
    for (let i = 0; i < this.k.groundIce; i++) {
      const q = this.plume, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1);
      const a = (i / this.k.groundIce) * Math.PI * 2 + this.rand() * 1.2, r = 0.2 + this.rand() * 0.12;
      const c = unit({ x: q.x * Math.cos(r) + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * Math.sin(r), y: q.y * Math.cos(r) + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * Math.sin(r), z: q.z * Math.cos(r) + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * Math.sin(r) });
      const P = this.topo.basePositions;
      for (let v = 0; v < this.rock.length; v++) if (Math.hypot(P[v * 3] - c.x, P[v * 3 + 1] - c.y, P[v * 3 + 2] - c.z) < this.k.iceR) this.frozen[v] = 1;
    }
    // (Not evenly: deeper in the low ground and in broad patches, so it crusts over a piece at a time, the last of it
    // lying molten in the hollows. Even all over, it all thinned to setting at the same moment, some twenty seconds in,
    // and the whole world's running stopped at once.)
    if (this.k.magma > 0) {
      const p = this.topo.basePositions, R = this.rock;
      let lo = Infinity, hi = -Infinity;
      for (let v = 0; v < n; v++) { lo = Math.min(lo, R[v]); hi = Math.max(hi, R[v]); }
      for (let v = 0; v < n; v++) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        const patch = 0.5 + 0.25 * Math.sin(3.1 * x + 1.7 * y + this.k.magmaSeed) + 0.25 * Math.sin(2.3 * y - 2.9 * z + 2 * this.k.magmaSeed);
        const low = 1 - (R[v] - lo) / Math.max(1e-6, hi - lo);
        this.lava[v] = this.k.magma * (0.35 + 0.9 * patch + 0.75 * low * low);
        this.age[v] = 0;
      }
    }
    if (this.k.antipode > 0) this.far = { x: -this.plume.x, y: -this.plume.y, z: -this.plume.z, r: 0.16 };
    if (this.k.stormEvery[1] > 0) this.stormIn = this.between(this.k.stormEvery);
    // The deep ocean's bank: a seamount whose top is just under the sea, some way from the heat.
    if (this.k.bankFar > 0) {
      const q = this.plume, a = this.rand() * Math.PI * 2, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1), far = this.k.bankFar;
      const d = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) };
      const b = { ...unit({ x: q.x * Math.cos(far) + d.x * Math.sin(far), y: q.y * Math.cos(far) + d.y * Math.sin(far), z: q.z * Math.cos(far) + d.z * Math.sin(far) }), r: 0.24 };
      this.bank = b;
      const p = this.topo.basePositions;
      for (let v = 0; v < n; v++) {
        const dd = Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) / b.r;
        if (dd < 2.5) this.rock[v] = Math.max(this.rock[v], -0.014 + (this.k.floor + 0.014) * Math.min(1, dd * dd / 4));
      }
      this.onBank = new Uint8Array(n);
      for (let v = 0; v < n; v++) if (Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) < b.r) this.onBank[v] = 1;
    }
    this.laid = new Float32Array(n).fill(1e6);
    this.nearLaid = new Float32Array(n).fill(1e6);
    this.dryFor = new Float32Array(n);
    this.wasLand = new Uint8Array(n);
    this.breakPhase = new Float32Array(n);
    for (let v = 0; v < n; v++) { const x = Math.sin(v * 12.9898 + 78.233) * 43758.5453; this.breakPhase[v] = (x - Math.floor(x)) * Math.PI * 2; }
    // Wright Mons's hollow: a great pit, the heat beginning on the ring round it.
    if (this.k.domeRing > 0) {
      const q = this.plume, t = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), r = this.k.domeRing;
      const c = unit({ x: q.x * Math.cos(r) + t.x * Math.sin(r), y: q.y * Math.cos(r) + t.y * Math.sin(r), z: q.z * Math.cos(r) + t.z * Math.sin(r) });
      this.domeCentre = c;
      for (let v = 0; v < n; v++) {
        const d = Math.acos(Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z)) / (r * 0.7);
        if (d < 1) this.rock[v] = Math.max(0.004, this.rock[v] - this.k.floor * 0.85 * (1 - d * d) ** 1.5);
      }
    }
    // Grindavík: the ground falling from the fissure towards the town, and the town's houses on a loose grid.
    if (this.k.town > 0) {
      const q = this.plume, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), r = this.k.town;
      const c = unit({ x: q.x * Math.cos(r) - t1.x * Math.sin(r), y: q.y * Math.cos(r) - t1.y * Math.sin(r), z: q.z * Math.cos(r) - t1.z * Math.sin(r) });
      this.townAt = c;
      { const m = unit({ x: q.x + c.x, y: q.y + c.y, z: q.z + c.z }), dd = c.x * m.x + c.y * m.y + c.z * m.z, t = unit({ x: c.x - dd * m.x, y: c.y - dd * m.y, z: c.z - dd * m.z }), tilt = this.k.fallTilt;
        this.fall = unit({ x: -m.x * Math.cos(tilt) + t.x * Math.sin(tilt), y: -m.y * Math.cos(tilt) + t.y * Math.sin(tilt), z: -m.z * Math.cos(tilt) + t.z * Math.sin(tilt) }); }
      if (this.k.fissure > 0) {
        // Across the slope at the vent, turned a little: down from the vent towards the town, and square to it.
        const dq = c.x * q.x + c.y * q.y + c.z * q.z, down = unit({ x: c.x - dq * q.x, y: c.y - dq * q.y, z: c.z - dq * q.z }), across = unit(cross(q, down)), tn = this.k.fissureTurn;
        const ax = unit({ x: across.x * Math.cos(tn) + down.x * Math.sin(tn), y: across.y * Math.cos(tn) + down.y * Math.sin(tn), z: across.z * Math.cos(tn) + down.z * Math.sin(tn) });
        this.fissureAxis = ax;
        const L = this.k.fissure, seen = new Map<number, number>();
        for (let i = -12; i <= 12; i++) {
          const a = (i / 12) * L, w = 1 - 0.6 * Math.abs(i / 12);
          const pt = { x: q.x * Math.cos(a) + ax.x * Math.sin(a), y: q.y * Math.cos(a) + ax.y * Math.sin(a), z: q.z * Math.cos(a) + ax.z * Math.sin(a) };
          let best = 0, bd = Infinity;
          for (let v = 0; v < n; v++) { const d = (p[v * 3] - pt.x) ** 2 + (p[v * 3 + 1] - pt.y) ** 2 + (p[v * 3 + 2] - pt.z) ** 2; if (d < bd) { bd = d; best = v; } }
          seen.set(best, Math.max(seen.get(best) ?? 0, w));
        }
        const sum = [...seen.values()].reduce((x, y) => x + y, 0);
        this.fissureVents = [...seen].map(([v, w]) => ({ v, share: w / sum }));
      }
      // (A tilt about the midway point, half the fall above it and half below, fading out a little way beyond the two.)
      const m = unit({ x: q.x + c.x, y: q.y + c.y, z: q.z + c.z }), fall = 2 * (1 - Math.cos(r));
      for (let v = 0; v < n; v++) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], off = Math.acos(Math.min(1, x * m.x + y * m.y + z * m.z)) / (r * 2.2);
        if (off < 1) this.rock[v] += (this.k.slope * ((x * q.x + y * q.y + z * q.z) - (x * c.x + y * c.y + z * c.z))) / fall * (1 - off * off) ** 2;
      }
      for (let v = 0; v < n; v++) this.rock[v] = Math.max(0.004, this.rock[v]);
      const u = unit(cross(c, t1)), w = unit(cross(c, u)), R = this.k.townR, step = R / 3.2;
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        const jx = (this.rand() - 0.5) * step * 0.5, jy = (this.rand() - 0.5) * step * 0.5, a = i * step + jx, b = j * step + jy;
        if (Math.hypot(a, b) > R || this.rand() < 0.15) continue;
        const h = unit({ x: c.x + u.x * a + w.x * b, y: c.y + u.y * a + w.y * b, z: c.z + u.z * a + w.z * b });
        let best = 0, bd = Infinity;
        for (let v = 0; v < n; v++) { const d = (p[v * 3] - h.x) ** 2 + (p[v * 3 + 1] - h.y) ** 2 + (p[v * 3 + 2] - h.z) ** 2; if (d < bd) { bd = d; best = v; } }
        this.houses.push({ ...h, v: best });
      }
      this.wallsLeft = this.k.walls;
    }
    // Io's two fires: the pool round where the heat begins, and the sulphur spring in its middle.
    if (this.k.marble > 0) {
      this.marble = new Marble(unit(this.plume), this.k.marble);
      this.sulphurIn = 1;
      this.currentIn = this.k.currentEvery;
    }
    this.start = this.rock.slice();
    // The lava lamp's far shore: well round the world from where the heat is.
    if (this.k.lamp) {
      const q = this.plume, a = this.rand() * Math.PI * 2, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1);
      const d = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) }, far = 1.6; // (in reach: at two radians a middling blob turned back a hair short of it)
      this.shore = { ...unit({ x: q.x * Math.cos(far) + d.x * Math.sin(far), y: q.y * Math.cos(far) + d.y * Math.sin(far), z: q.z * Math.cos(far) + d.z * Math.sin(far) }), r: 0.3 };
    }
  }

  /** The ground as this fire found it: what roundness is measured against, and where its hollows were. */
  readonly start: Float32Array;
  /** Wright Mons: the middle of its great hollow, the mounds to be raised round it (null on other worlds). */
  domeCentre: { x: number; y: number; z: number } | null = null;
  /** Io's two fires: the pool (null on other worlds). */
  marble: Marble | null = null;
  /** The pool's middle (null on other worlds). */
  get marbleAt(): { x: number; y: number; z: number } | null { return this.marble ? this.marble.centre : null; }
  private sulphurIn = 0;
  private currentIn = 0;
  /** How many drops of each colour have fallen. */
  readonly drops = { lava: 0, sulphur: 0 };
  /** Grindavík: where the town is, its houses (and the vertex each stands on), the walls raised, and how many taps of earth are left. */
  townAt: { x: number; y: number; z: number } | null = null;
  /**
   * Grindavík: which way is down for the lava, whatever way the world is held: into the ground under the fissure
   * and the town, tipped well over towards the town, so a flow runs down the land to it as a tongue. (By the
   * ground's own slope alone, a flow piled as high as the slope fell from one point to the next, and spread every
   * way in a round pool, uphill too; steep enough to stop that, the land would have stood as a great hump.)
   */
  fall: { x: number; y: number; z: number } | null = null;
  /** Grindavík's fissure: which way it runs along the ground through the vent, and the points lava wells out of along it, each with its share. */
  fissureAxis: { x: number; y: number; z: number } | null = null;
  fissureVents: { v: number; share: number }[] = [];
  /** Which way the lava runs down: the fixed fall where lava runs by the ground, or as the world is held. */
  private get downward(): { x: number; y: number; z: number } | null { return this.k.byGround ? this.fall : this.gravity; }
  readonly houses: { x: number; y: number; z: number; v: number }[] = [];
  readonly walls: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] = [];
  wallsLeft = 0;
  private lastWall: { x: number; y: number; z: number } | null = null;
  private domeIn = 0;
  private domeTold = -1e9;
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
    // On real ground, its own basins, where they are (and its craters are its own, in its heights).
    for (const [lat, lon, km] of this.k.real ? this.k.realBasins : []) this.basins.push({ ...pointAt(lat, lon), r: km / this.k.realRadius });
    // The basins, well apart, one near where the heat begins so the first is in reach.
    if (!this.k.real) for (let tries = 0; this.basins.length < this.k.basins && tries < 400; tries++) {
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
    // (On the glass world, not while blobs still float: the last of them counted for nothing.)
    return this.reserve + this.pressure < this.k.least && !this.erupting && this.molten < 0.01 && !(this.k.lamp && this.blobs.length > 0);
  }

  get erupting(): boolean {
    return this.eruptions.length > 0;
  }

  /** How much lava is still flowing, over the whole world. */
  get molten(): number {
    // (Kept until the lava next changes: it was summed over every vertex several times a step.)
    if (this.moltenKnown) return this.moltenWas;
    let s = 0;
    for (let v = 0; v < this.lava.length; v++) s += this.lava[v];
    this.moltenWas = s; this.moltenKnown = true;
    return s;
  }
  private moltenWas = 0;
  private moltenKnown = false;
  /** Lava has changed (here, or from outside): the total is to be summed afresh. */
  lavaChanged(): void { this.moltenKnown = false; }

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
    this.drained += volume; // (a hollow world's chamber gives it, flow or burst alike)
    this.breathe(volume, volume >= this.k.explosive);
    if (this.k.dries > 0 && volume >= this.k.explosive) this.ashSky = Math.min(1, this.ashSky + (volume / this.k.shadeFull) ** 2);
    // (The orange Earth: the gas of an eruption takes oxygen out of the sky, as volcanic gases did then.)
    if (this.k.gasEats > 0 && !blast) { this.oxygen -= volume * this.k.gasEats; // (below none, a debt the life must breathe off first)
      this.tell('The eruption\'s gas uses up oxygen'); }
    // The lava lamp: the bud lets go as one blob; held too long, it bursts into small ones, which cool before they get far.
    if (this.k.lamp) {
      const q = this.plume;
      if (blast) { this.scatter(volume); return 'burst'; }
      this.tally.flows++;
      this.blobs.push({ x: q.x, y: q.y, z: q.z, area: volume, heat: 1 });
      return 'flow';
    }
    const v = this.plumeVertex, s = this.scale;
    // Io's two fires: let out in the pool, it's dropped as colour, not run as lava.
    if (this.marbleAt && this.angleTo(this.plume, this.marbleAt) < this.k.marble) {
      this.marble!.drop(0, 0, 1, Math.min(0.03, volume * this.k.marbleArea), this.seconds);
      this.pressure = 0;
      this.drops.lava++;
      if (volume < this.k.explosive) this.tally.flows++; else this.tally.bursts++;
      return volume < this.k.explosive ? 'flow' : 'burst';
    }
    if (volume < this.k.explosive) {
      this.tally.flows++;
      if (!blast) this.lavaKind(volume);
      if (this.k.chaos > 0 && !blast && volume < this.k.chaos) { this.tell('Too early: wait for the circle around the volcano to fill'); this.find('lenticulae', 'lenticulae. Warm ice rose under the crust but didn\'t break through, leaving freckles of domes and pits'); }
      if (this.k.antipode > 0 && !blast) this.tell('Too small to reach the far side: wait for the circle around the volcano to fill');
      if (this.k.chaos > 0 && !blast && volume >= this.k.chaos) this.counted(Math.sqrt(volume / this.k.explosive) * 0.16, 'The ice cracks', 'The ice cracks, but too close to an earlier crack: move further away');
      // (It lasts by its size, so lava comes out at much the same pace whatever the eruption: it
      // lasted the same whatever its size, so a small one dribbled and a big one gushed.)
      const dur = this.k.pour * Math.min(3.2, 0.8 + volume * 0.16);
      // (Along a fissure, a share out of each point of it, straight out where it is: a curtain of lava, not one mouth.)
      if (this.fissureVents.length) for (const f of this.fissureVents) this.eruptions.push({ vertex: f.v, flank: f.v, left: volume * s * f.share, rate: (volume * s * f.share) / this.k.pour, total: volume * s * f.share, t: 0, dur });
      else this.eruptions.push({ vertex: v, flank: this.aimedFlank(v) ?? this.flankOf(v), left: volume * s, rate: (volume * s) / this.k.pour, total: volume * s, t: 0, dur });
      this.kick(volume, 0.35);
      return 'flow';
    }
    // A burst: most of it thrown up as ash that falls round the vent, the rest welling out.
    // Torn open, it throws its ash far and wide rather than piling it on the summit.
    // Where it can, the biggest throw some clear of the world altogether, into orbit.
    // (Europa: held too long, a burst blasts a hole through the ice, and breaks no rafts: let go while the circle is whole.)
    if (this.k.chaos > 0 && !blast) { this.tell('Too late: the eruption blasted a hole instead of cracking the ice'); this.find('plume', 'a water plume. The burst blasted ocean water up through the ice into space, as telescopes may have seen over Europa'); }
    let left = volume;
    if (!blast && this.k.ringShare > 0 && this.towardGiant) {
      const fed = volume * this.k.ringShare;
      this.orbit += fed;
      left -= fed;
      this.tell("Ice reached Saturn's ring");
    } else if (!blast && this.k.ringShare > 0) this.tell("The burst missed Saturn's ring: turn the volcano towards Saturn first");
    if (!blast && this.k.orbitShare > 0 && volume > this.k.explosive) {
      // (Any burst throws some: counted from a little under the burst point, so a burst when the smoke
      // is heavy makes a start, and a bigger one, held longer, throws more.)
      const thrown = (volume - this.k.explosive * 0.6) * this.k.orbitShare;
      this.orbit += thrown;
      left -= thrown;
    }
    // Where there's no air, the bigger the burst, the further its ash flies; and on a tidal moon,
    // further at high tide.
    const strength = this.throwOf(volume), far = this.k.ashRing > 0 ? Math.sqrt(strength / this.k.explosive) : 1;
    // Hunga Tonga (before its ash falls on the vent): a burst through shallow water shakes the air round the world, and blows the cone apart.
    // (Above the sea too, the cone is blown apart, as the real island was; but only through shallow water does the wave go round.)
    if (!blast && this.k.wave > 0 && this.rock[v] > -this.k.wave) {
      const p = this.topo.basePositions, shallow = this.rock[v] < 0;
      for (let w = 0; w < this.rock.length; w++) { const d = Math.hypot(p[w * 3] - p[v * 3], p[w * 3 + 1] - p[v * 3 + 1], p[w * 3 + 2] - p[v * 3 + 2]); if (d < 0.14) this.rock[w] -= this.k.waveDig * (1 - (d / 0.14) ** 2); }
      if (shallow) {
        this.waves.push({ x: p[v * 3], y: p[v * 3 + 1], z: p[v * 3 + 2], at: this.seconds });
        this.tell(`A giant wave: ${this.waves.length}`);
        this.find('tuff', 'a tuff ring. The burst through shallow water blew the cone open, and left a low ring of ash round a flooded crater');
      } else this.tell('No wave: the top of the volcano was above the sea. Keep the top just under the sea');
    } else if (!blast && this.k.wave > 0 && this.rock[v] <= -this.k.wave) this.find('pumice', 'a pumice raft. Bursting deep under the sea, the lava frothed into stone light enough to float');
    // (On Triton, a burst in sunlight is a geyser: all its plume blown downwind into a streak.)
    const geysering = !blast && this.k.streak > 0 && !!this.star && this.dayAt(this.plumeVertex) > 0.2;
    // (Where the sea still reaches the vent, the water shatters all of it to ash: no lava wells out after, as at Surtsey.)
    const ashShare = this.k.wet > 0 && this.rock[v] < this.k.wet ? 1 : this.k.ashShare;
    // (The field book: a fountain from a dry vent, let go nearly full, flung high enough for the wind to spin its lava into glass.)
    if (!blast && ashShare < 1 && volume >= this.capNow * 0.9) this.find('hair', "Pele's hair. A tall lava fountain, spun by the wind into threads of glass");
    if (!blast && this.k.streak > 0 && this.star && !geysering) this.tell('In the dark, no geyser: turn the volcano into the sunlight first');
    if (geysering) this.geyser(left * ashShare * s);
    else this.fallOfAsh(v, left * ashShare * s, (blast ? 3 : 1) * far);
    if (!blast) this.tally.bursts++;
    // (Its shock on its way through the world: the bigger the burst, the more of it reaches the far side.)
    if (!blast && this.k.antipode > 0 && volume >= this.capNow * 0.95) this.find('faculae', 'a pyroclastic vent. A great burst left a bright halo of ash round a pit, as on Mercury');
    if (!blast && this.k.antipode > 0) { this.echoes.push({ at: this.seconds + this.k.antipodeDelay, volume: volume * this.k.antipode * Math.min(2.5, (volume / this.k.explosive) ** 2) }); this.tell(`The shock is on its way to the far side: it rises in ${Math.round(this.k.antipodeDelay)} seconds`); }
    if (!blast && this.k.great > 0 && strength >= this.k.great) {
      if (this.tideNow < this.k.greatTide) { this.tell('Not high tide, so the eruption was too weak: wait for the circle around the volcano to fill'); this.find('frost', 'sulphur frost. A plume that fell short froze round the vent in a white rime'); }
      else { this.greatPlume(this.k.ashReach * this.k.ashRing * far); this.find('pele', 'a Pele ring. A great plume\'s sulphur fell in a red ring hundreds of km across, as round Io\'s volcano Pele'); }
    }
    const lava = left * (1 - ashShare) * s;
    if (lava > 0) this.eruptions.push({ vertex: v, flank: v, left: lava, rate: lava / this.k.pour, total: lava, t: 0, dur: this.k.pour * 1.5 });
    if (!blast) this.kick(volume, 1);
    return 'burst';
  }

  /** How far from level the world is at the vent, as held: 0 with the vent uppermost, 1 on its side. */
  /**
   * Whether a pour begun with the pressure past a burst bursts (tipping: the jug full, it gushes). Played with one
   * hand, a pour only ever pours, and an eruption is its own touch (a tap), so a big one is always chosen.
   */
  burstOnPour = true;

  get tip(): number {
    if (this.tilt !== null) return this.tilt;
    const g = this.gravity;
    if (!g) return 0;
    const p = this.topo.basePositions, v = this.plumeVertex;
    const along = g.x * p[v * 3] + g.y * p[v * 3 + 1] + g.z * p[v * 3 + 2];
    return Math.hypot(g.x - along * p[v * 3], g.y - along * p[v * 3 + 1], g.z - along * p[v * 3 + 2]);
  }

  /** Seconds poured without a rest (see `slumpAfter`), and rested since. */
  private pourRun = 0;
  private pourRest = 0;
  private slumpSaid = false;
  /** Held like a globe: level, the pressure builds; tipped, it pours, and tipped when full, it bursts. */
  private tipped(dt: number): void {
    const tip = this.tip;
    if (this.k.slumpAfter > 0) this.slumping(dt);
    // Held shut, nothing pours: the world can be turned and tipped to aim, and the pressure builds.
    if (this.clamped) { this.pouring = tip >= this.k.tipPour; return; }
    // The lava lamp: tipped, the bud lets go (once each time the world is tipped); held level, it grows.
    if (this.k.lamp) {
      if (!this.pouring && tip >= this.k.tipPour) { this.pouring = true; this.erupt(); }
      else if (this.pouring && tip < this.k.tipPour * 0.7) this.pouring = false;
      // Kept tipped (as while the far shore is turned up to watch a blob float there), each new bud
      // lets go once it's grown a fair size, rather than growing on until it bursts apart.
      else if (this.pouring && this.pressure >= this.capNow * 0.75) this.erupt();
      return;
    }
    if (!this.pouring && tip >= this.k.tipPour) {
      this.pouring = true;
      if (this.pressure >= this.k.explosive && this.burstOnPour) { this.erupt(); return; }
      this.pourCounted = false;
    // (It stops a little short of where it starts, so a shaking hand doesn't flicker it; but not so far
    // short that the phone held level again, the vent a little off the top, keeps it trickling away.)
    } else if (this.pouring && tip < this.k.tipPour * 0.9) { this.pouring = false; this.lavaKind(this.pourRunOut); }
    if (!this.pouring) { this.pourRunOut = 0; return; }
    const rate = this.k.pourLeast + (this.k.pourMost - this.k.pourLeast) * Math.min(1, (tip - this.k.tipPour) / (1 - this.k.tipPour));
    const amount = Math.min(this.pressure, Math.max(0, rate) * dt);
    if (amount <= 0) return;
    this.pressure -= amount;
    this.pourRunOut += amount;
    this.breathe(amount, false);
    // (Counted once it pours at all: a gentle pour, begun under the least, never counted.)
    if (!this.pourCounted) { this.pourCounted = true; this.tally.flows++; }
    // (Most of it a few steps out the way it's tipped: a pour shows its way at once, as from a jug.)
    const v = this.plumeVertex, a = amount * this.scale;
    this.eruptions.push({ vertex: v, flank: this.aimedFlank(v) ?? v, left: a, rate: a / dt });
  }

  /** How much the pour going now has let out. */
  private pourRunOut = 0;
  /** The field book: what a flow's size makes of it, a gentle one ropy, a great one rough clinker. */
  private lavaKind(volume: number): void {
    if (volume <= 0) return;
    if (volume <= this.k.least * 1.3) this.find('pahoehoe', 'pāhoehoe. A small, slow flow kept its skin, and wrinkled it into ropes');
    else if (volume >= this.k.explosive * 0.8) this.find('aa', 'ʻaʻā. A big, fast flow tore its crust into rough clinker');
  }
  /** Pluto: poured on too long at once, the mound's top slumps, as slush does that can't freeze as fast as it comes. */
  private slumping(dt: number): void {
    if (this.pouring) { this.pourRun += dt; this.pourRest = 0; } else { this.pourRest += dt; if (this.pourRest > 1) { this.pourRun = 0; this.slumpSaid = false; } }
    if (this.pourRun <= this.k.slumpAfter) return;
    if (!this.slumpSaid) { this.slumpSaid = true; this.tell(this.k.dome > 0 && this.k.domeRing <= 0 ? 'The dome slumps: pour in short bursts, and let each set' : 'The mound slumps: pour in short bursts, and let each freeze'); }
    const p = this.topo.basePositions, v0 = this.plumeVertex, r = 0.07;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[v0 * 3], p[v * 3 + 1] - p[v0 * 3 + 1], p[v * 3 + 2] - p[v0 * 3 + 2]);
      if (d < r && this.rock[v] > this.start[v]) this.rock[v] = Math.max(this.start[v], this.rock[v] - this.k.slumpBy * dt * (1 - d / r));
    }
  }

  // ------------------------------------------------------------------ the lava lamp

  /** A burst: the heat flung out as a ring of small blobs round the vent. */
  private scatter(volume: number): void {
    const q = this.plume, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1), k = 6;
    const turn = this.rand() * Math.PI * 2; // (one turn for the whole ring: each its own, they landed on each other and ran together at once)
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + turn, o = 0.3; // (flung clear of each other: closer, they ran straight back together)
      this.blobs.push({ ...unit({ x: q.x + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * o, y: q.y + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * o, z: q.z + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * o }), area: volume / k, heat: 1 });
    }
  }

  /** The blobs float, cool, merge, sink, and reach the far shore. */
  private lampStep(dt: number): void {
    const g = this.gravity, q = this.plume, up = g ? unit({ x: -g.x, y: -g.y, z: -g.z }) : { ...q };
    const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
    // (Running together, or into the pool: a share each moment, sliding in as it goes, so nothing jumps.)
    const give = 1 - Math.exp(-dt / 0.14);
    const slide = (b: Blob, to: { x: number; y: number; z: number }, f: number) => Object.assign(b, unit({ x: b.x + (to.x - b.x) * f, y: b.y + (to.y - b.y) * f, z: b.z + (to.z - b.z) * f }));
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      if (!b.into) continue;
      const share = b.area * give;
      if (b.into === 'pool') { if (this.shore) slide(b, this.shore, give); this.pooled += share; }
      else if (this.blobs.includes(b.into)) {
        const t = b.into;
        t.heat = (t.heat * t.area + b.heat * share) / (t.area + share);
        slide(t, b, share / (t.area + share)); // (the one taking it in leans towards it, as the middle of the two would)
        t.area += share;
        slide(b, t, give);
      } else b.into = undefined; // (what it was running into is gone: it goes on alone)
      b.area -= share;
      if (b.area < 0.06) {
        if (b.into === 'pool') this.pooled += b.area; else if (b.into) b.into.area += b.area;
        this.blobs.splice(i, 1);
      }
    }
    for (const b of this.blobs) {
      if (b.into) continue;
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
    // Two warm blobs that touch run together: the smaller into the bigger. (Warm, not only hot: from where
    // they turn back, or two drawn as one lump came apart again.)
    for (let i = 0; i < this.blobs.length; i++) {
      for (let j = i + 1; j < this.blobs.length; j++) {
        const a = this.blobs[i], b = this.blobs[j];
        if (a.into || b.into || a.heat < 0.45 || b.heat < 0.45 || angle(a, b) > (blobRadius(a.area) + blobRadius(b.area)) * 0.8) continue;
        if (a.area >= b.area) b.into = a; else a.into = b;
      }
    }
    // The far shore: a blob still warm that reaches it (any of it over the line, not only its middle) pools
    // there. A cold one sinks into the deep and is gone.
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      if (b.into) continue;
      if (this.shore && b.heat > 0.2 && angle(b, this.shore) < this.shore.r + blobRadius(b.area) * 0.5) {
        b.into = 'pool';
        this.pooledBiggest = Math.max(this.pooledBiggest, b.area);
        this.tell('A blob reaches the far shore');
      } else if (b.heat <= 0) this.blobs.splice(i, 1);
    }
    // (No more than the lamp can draw: the coldest small ones go first.)
    while (this.blobs.length > 23) {
      let worst = 0;
      for (let i = 1; i < this.blobs.length; i++) if (this.blobs[i].heat * this.blobs[i].area < this.blobs[worst].heat * this.blobs[worst].area) worst = i;
      const gone = this.blobs.splice(worst, 1)[0];
      for (const b of this.blobs) if (b.into === gone) b.into = undefined;
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
    if (square < 0.25) this.tell('Too near the still point: erupt on the dotted line');
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
    const rise = Math.min(this.reserve, this.k.rising * (this.k.steady ? 1 : Math.sqrt(Math.max(0, this.reserve) / this.k.heat)) * (1 + this.k.tide * this.tideNow) * dt + 1e-4 * dt);
    if (!this.k.endless) this.reserve -= rise; // (in free play, the store never empties)
    this.pressure += rise;
    // (Pouring, the heat can still rise faster than it pours, as at Io's high tide: then it bursts,
    // as tipping when it's past the dashed ring does, rather than the mountain blowing apart.)
    if (this.pressure >= this.capNow && this.pouring && !this.k.lamp) this.erupt();
    // Full, it waits: the heat stays below till it's let out (it used to blow the mountain apart, which
    // forced the pace). The lamp's blob still bursts, held too long: that's its own rule.
    else if (this.pressure >= this.capNow && !this.k.lamp) { this.reserve += this.pressure - this.capNow; this.pressure = this.capNow; }
    else if (this.pressure >= this.capNow) {
      if (!this.k.lamp) this.collapse();
      this.erupt(true);
      this.tally.calderas++;
      this.tell(this.k.lamp ? 'Held too long: the blob burst apart' : 'Held too long: the mountain blew apart');
    }
    // The store is spent: whatever pressure is left comes out by itself, the last of the fire.
    if (this.reserve < 0.01 && this.pressure >= this.k.least && !this.erupting) { this.erupt(); this.tell('The volcano is out of heat: one last eruption'); }
    if (this.reserve < 0.01 && this.pressure < this.k.least) this.pressure = 0;
    if (this.gravity && !this.marble) this.tipped(dt); // (Io's two fires: lava is poured with a finger, not by tipping)
    if (this.pouring || this.erupting) { if (this.seconds - this.pouredAt > 20) this.flowsPoured++; this.pouredAt = this.seconds; }
    for (let v = 0; v < this.lava.length; v++) if (this.lava[v] > 0.002) this.flowOf[v] = this.flowsPoured;
    if (this.k.pulse > 0 && !this.clamped && !this.k.lamp && this.pressure >= this.k.pulse && (!this.erupting || (this.pressure >= this.k.explosive * 0.9 && this.rock[this.plumeVertex] > 0))) this.erupt(); // (and again before the last is done, rather than let it build to a burst; under the sea it may, as Surtsey did)
    if (this.k.lamp) this.lampStep(dt);
    // A giant's ring thins away, unless it's fed.
    if (this.k.ringThins > 0) this.orbit -= this.orbit * this.k.ringThins * dt;
    this.movePlume(dt);
    this.pour(dt);
    this.chamber(dt);
    // (On a world still molten all over, with no eruption running, the magma's slow running is worked out ten
    // times a second, not every frame: over the whole sheet of it, every frame, the first world stuttered on a phone.)
    if (this.k.magma > 0 && !this.erupting) { this.flowDue += dt; if (this.flowDue >= 0.1) { this.flow(this.flowDue); this.flowDue = 0; } }
    else { this.flow(dt + this.flowDue); this.flowDue = 0; }
    this.cool(dt);
    this.skies(dt);
    this.farSide();
    for (let v = 0; v < this.age.length; v++) { if (this.lava[v] < this.k.thin) this.age[v] += dt; this.laid[v] += dt; }
    if (this.k.warmNear > 0) {
      const t = this.topo, N = this.nearLaid;
      for (let v = 0; v < N.length; v++) N[v] += dt;
      for (let v = 0; v < N.length; v++) {
        if (this.lava[v] <= this.k.thin) continue;
        N[v] = 0;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) {
          const a = t.nbrList[k]; N[a] = 0;
          for (let j = t.nbrOffsets[a]; j < t.nbrOffsets[a + 1]; j++) N[t.nbrList[j]] = 0;
        }
      }
    }
    // The slow forces every quarter second, and life the step after, so no one step carries both.
    this.slowIn -= dt;
    const half = this.rock.length >> 1;
    if (this.slowHalf) { this.slowHalf = false; this.slow(0.25, half, this.rock.length); this.livingDue = true; }
    else if (this.livingDue) { this.livingDue = false; this.living(0.25); }
    else if (this.slowIn <= 0) { this.slow(0.25, 0, half); this.slowIn = 0.25; this.slowHalf = true; }
    if (this.k.dome > 0 && (this.domeIn -= dt) <= 0) { this.domeIn = 0.5; this.domed(); }
    if (this.k.melt > 0 && this.erupting && this.dayAt(this.plumeVertex) > 0.3) this.find('lavalake', 'a lava lake. Erupting in full daylight, the lava never cooled, and pooled in a lake of fire');
    if (this.k.taper > 0 && (this.collapseIn -= dt) <= 0) { this.collapseIn = 1; this.collapses(); }
    if (this.k.nests > 0) { this.nestTick += dt; if (this.nestTick >= 0.5) { this.nesting(this.nestTick); this.nestTick = 0; } }
    if (this.marble && !this.over) this.lampOfIo(dt);
    this.stones(dt);
    this.storms(dt);
    // The long age on an airless world: small stones still fall, and pock what the fire left.
    if (this.over && this.k.ageCraters > 0 && this.rand() < this.k.ageCraters * dt) {
      const z = this.rand() * 2 - 1, a = this.rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      this.bowl({ x: s * Math.cos(a), y: s * Math.sin(a), z }, 0.02 + this.rand() * 0.035, 0.02);
    }
  }

  /**
   * Which way the coming (or blowing) storm blows from, as a direction along the ground at the vent (a unit vector),
   * where storms have a side (`stormSide`): it scours the side of the mountain facing it hardest, the lee hardly at all.
   */
  stormFrom: { x: number; y: number; z: number } | null = null;
  /** How hard the storm wears the ground at a vertex, for its side: 1 everywhere where storms have none. */
  windward(v: number): number {
    const w = this.stormFrom;
    if (!w || this.k.stormSide <= 0) return 1;
    const p = this.topo.basePositions, q = this.plume, dx = p[v * 3] - q.x, dy = p[v * 3 + 1] - q.y, dz = p[v * 3 + 2] - q.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return 1;
    const facing = (dx * w.x + dy * w.y + dz * w.z) / d;
    return 1 - this.k.stormSide + this.k.stormSide * 3 * Math.max(0, facing);
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
      if (this.stormLeft <= 0) { this.storm = false; this.stormFrom = null; this.stormIn = this.between(this.k.stormEvery); this.tell('The storm passes'); }
      return;
    }
    this.stormIn -= dt;
    if (this.stormComing === null && this.stormIn <= this.k.stormWarning) {
      this.stormComing = this.stormIn;
      // (Where storms have a side: a new one each time, round the mountain.)
      if (this.k.stormSide > 0) { const q = this.plume, t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1), a = this.rand() * Math.PI * 2; this.stormFrom = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) }; }
      this.tell(this.k.stormSide > 0 ? 'A dust storm is coming. It will wear down the side the wind blows onto: pour fresh lava there' : 'A dust storm is coming');
    }
    if (this.stormComing !== null) this.stormComing = Math.max(0, this.stormIn);
    if (this.stormIn <= 0) { this.storm = true; this.stormComing = null; this.stormLeft = this.k.stormLasts; }
  }

  /** The sides of a mountain, round its vent, as Mars reckons them. */
  static readonly FLANKS = 8;
  /** The way round the vent each vertex near it lies (its sector), and how far out; -1 beyond. Reckoned with the vent where it is. */
  /** Mars: how far out from the vent (radians) the mountain is reckoned. */
  static readonly MOUNT = 0.42;
  private flankSector: Int8Array | null = null;
  private flankR: Float32Array | null = null;
  private flankAt = -1;
  private flankWays(): void {
    const n = this.rock.length, p = this.topo.basePositions, q = this.plume, F = Planet.FLANKS;
    if (this.flankSector && this.flankAt === this.plumeVertex) return;
    this.flankAt = this.plumeVertex;
    this.flankSector ??= new Int8Array(n); this.flankR ??= new Float32Array(n);
    const t1 = unit(cross(q, Math.abs(q.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(q, t1);
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], r = Math.acos(Math.max(-1, Math.min(1, x * q.x + y * q.y + z * q.z)));
      // (Out past the mountain's own ground too, to 0.65, so a side's fallen apron always has ground to spread on.)
      if (r > 0.65) { this.flankSector[v] = -1; continue; }
      const a = Math.atan2(x * t2.x + y * t2.y + z * t2.z, x * t1.x + y * t1.y + z * t1.z);
      this.flankSector[v] = Math.floor(((a + Math.PI) / (Math.PI * 2)) * F) % F;
      this.flankR[v] = r;
    }
  }
  /** Mars: how far out each side of the mountain's built ground reaches from the vent (radians), as last reckoned. */
  readonly reach = new Float32Array(8);
  /** ...reckoned now. */
  reaching(): void {
    this.flankWays();
    this.reach.fill(0);
    for (let v = 0; v < this.rock.length; v++) {
      const s = this.flankSector![v];
      if (s >= 0 && this.flankR![v] <= Planet.MOUNT && this.laid[v] < 1e5 && this.ash[v] < 0.4 && this.rock[v] - this.start[v] > this.k.baseThick && this.flankR![v] > this.reach[s]) this.reach[s] = this.flankR![v];
    }
  }
  /** Mars: how wide (radians out from the vent, on every side) the mountain must be to stand this high (in height). */
  baseFor(height: number): number { return height / this.k.taper; }
  /**
   * Mars: a mountain stands only so tall for its width, as Olympus Mons did (it is 600 km across for its 22 km). Built
   * taller than its narrowest side allows, that side gives way: the ground there slides off from high on the flank and
   * spreads far out beyond as a hummocky apron (its "aureole"), and the top falls back to what the side can hold.
   */
  private collapses(): void {
    this.reaching();
    let s = 0;
    for (let i = 1; i < Planet.FLANKS; i++) if (this.reach[i] < this.reach[s]) s = i;
    // (Above the ground it was built on: the world's own hills stand as they are.)
    const h = this.summit;
    this.summitBefore ??= h;
    const allowed = this.summitBefore + this.k.taper * this.reach[s];
    if (h <= allowed || this.seconds < this.slidAt[s] + 8) return;
    this.slidAt[s] = this.seconds;
    const p = this.topo.basePositions;
    let gone = 0;
    for (let v = 0; v < this.rock.length; v++) {
      const sec = this.flankSector![v], r = this.flankR![v]; if (sec < 0 || r > Planet.MOUNT) continue;
      // (Whatever stands above what the side can hold falls back; and the side itself slides, most from high on it.)
      let take = Math.max(0, this.rock[v] - this.k.floor - allowed) * this.k.collapseTakes;
      if (sec === s && r < 0.22) take += Math.max(0, this.rock[v] - this.start[v]) * this.k.collapseTakes * 0.5 * (1 - r / 0.22);
      take = Math.min(take, Math.max(0, this.rock[v] - this.start[v]));
      if (take <= 0) continue;
      this.rock[v] -= take; gone += take; this.lava[v] = 0;
    }
    if (gone <= 0) return;
    // (Out beyond the side, in ridges and hummocks, not an even sheet; and always over a band wide enough to hold it,
    // however far the side reached, so it can't pile up on a sliver of ground into a spike.)
    // (And no ground in it raised more than a little, slide after slide: what won't fit runs on further out.)
    const w = this.next, from = Math.min(Math.max(0.2, this.reach[s]), Planet.MOUNT), most = 0.08;
    let left = gone, sx = 0, sy = 0, sz = 0;
    for (let band = 0.23; left > 1e-6 && band < 0.7; band += 0.1) {
      for (let pass = 0; pass < 4 && left > 1e-6; pass++) {
        let sum = 0;
        for (let v = 0; v < this.rock.length; v++) {
          w[v] = 0;
          if (this.flankSector![v] !== s || this.flankR![v] < from || this.rock[v] >= this.start[v] + most) continue;
          w[v] = Math.max(0, (1 - (this.flankR![v] - from) / band) * (0.75 + 0.25 * Math.sin(p[v * 3] * 90 + p[v * 3 + 1] * 70) * Math.cos(p[v * 3 + 2] * 80)));
          sum += w[v];
        }
        if (sum <= 0) break;
        const share = left / sum;
        for (let v = 0; v < this.rock.length; v++) {
          if (w[v] <= 0) continue;
          const put = Math.min(share * w[v], this.start[v] + most - this.rock[v]);
          this.rock[v] += put; left -= put; this.ash[v] = Math.max(this.ash[v], 0.5);
          sx += put * p[v * 3]; sy += put * p[v * 3 + 1]; sz += put * p[v * 3 + 2];
        }
      }
    }
    this.slides++;
    this.slidWay = s;
    { const r = Math.hypot(sx, sy, sz); this.slidTo = r > 0 ? { x: sx / r, y: sy / r, z: sz / r } : null; }
    this.find('aureole', 'an aureole. A side that gave way, spread far out in ridges, as round Olympus Mons');
    this.tell('Too narrow: a side collapsed. Pour where the dotted ring is still faint');
  }
  /** Mars: how high the ground under the mountain stood before it, as first reckoned. */
  summitBefore: number | null = null;
  /** Mars: where the last side to give way spread its debris (a direction from the centre), if any. */
  slidTo: { x: number; y: number; z: number } | null = null;
  /** Mars: the side that last gave way (a sector), if any. */
  slidWay = -1;
  /** Mars: how many flanks have given way. */
  slides = 0;
  private collapseIn = 1;
  private readonly slidAt = new Float32Array(8).fill(-100);

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
  /**
   * The ice moon: the largest single sheet of new ground, as a share of the world: new ground joined to new ground,
   * point by neighbouring point. Scattered patches don't add up; one sheet, grown outward, does.
   */
  get coveredSheet(): number {
    const n = this.age.length, t = this.topo, seen = new Uint8Array(n), stack: number[] = [];
    const fresh = (v: number) => this.age[v] < 1e5 || this.ash[v] > 0.15;
    let most = 0;
    for (let v0 = 0; v0 < n; v0++) {
      if (seen[v0] || !fresh(v0)) continue;
      let size = 0;
      seen[v0] = 1; stack.push(v0);
      while (stack.length) {
        const v = stack.pop()!;
        size++;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) { const w = t.nbrList[k]; if (!seen[w] && fresh(w)) { seen[w] = 1; stack.push(w); } }
      }
      most = Math.max(most, size);
    }
    return most / n;
  }

  /** The ice moon: the edge of the biggest sheet of new ice, the one that counts (its vertices next to old ground). */
  sheetEdge(): number[] {
    const n = this.age.length, t = this.topo, seen = new Int32Array(n).fill(-1), stack: number[] = [];
    const fresh = (v: number) => this.age[v] < 1e5 || this.ash[v] > 0.15;
    let best = -1, most = 0, id = 0;
    for (let v0 = 0; v0 < n; v0++) {
      if (seen[v0] >= 0 || !fresh(v0)) continue;
      let size = 0;
      seen[v0] = id; stack.push(v0);
      while (stack.length) {
        const v = stack.pop()!;
        size++;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) { const w = t.nbrList[k]; if (seen[w] < 0 && fresh(w)) { seen[w] = id; stack.push(w); } }
      }
      if (size > most) { most = size; best = id; }
      id++;
    }
    const edge: number[] = [];
    if (best < 0) return edge;
    for (let v = 0; v < n; v++) {
      if (seen[v] !== best) continue;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (seen[t.nbrList[k]] !== best) { edge.push(v); break; }
    }
    return edge;
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

  /** How far round the vent a falling stone is caught (radians, as `warmth` is): wider as the volcano grows. */
  get catchReach(): number {
    // (A growing world: wider as it grows, not as it pours.)
    const grown = this.k.accrete > 0 ? (this.mass - 1) / (this.k.accrete - 1) : this.drained / this.k.catchFull;
    return this.k.warmth * (1 + this.k.catchGrow * Math.max(0, Math.min(1, grown)));
  }
  /** The first world: how big it has grown (1 at first; `accrete` when grown); and whether Theia has struck. */
  mass = 1;
  theiaStruck = false;
  /** ...and how many pieces too-big stones have broken off. */
  chunks = 0;
  /** Whether a stone of this size is more than the world can hold: caught, it breaks a piece off. */
  tooBig(size: number): boolean { return size > this.mass * 0.6; }
  /** How surely a stone landing at a vertex is caught, 0 to 1 (more than a half, and it is). */
  catchAt(v: number): number {
    const p = this.topo.basePositions, q = this.plume;
    const d = Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z);
    return Math.exp(-((d / this.catchReach) ** 2));
  }

  /** The summit falls into the emptied chamber, and the blast kills all round. */
  /** On a hollow world, how much lava the chamber under it has given (see `hollow`). */
  drained = 0;
  private sinkingSaid = false;
  /** How empty the chamber is: 0 full, 1 empty and about to give way. */
  get hollowness(): number {
    return this.k.hollow > 0 ? Math.min(1, this.drained / this.k.hollow) : 0;
  }
  /** The chamber: refilling, the ground over it sagging as it empties, and, emptied, falling in. */
  private chamber(dt: number): void {
    if (this.k.hollow <= 0) return;
    this.drained = Math.max(0, this.drained - this.k.hollow * this.k.hollowRefill * dt);
    const h = this.drained / this.k.hollow, p = this.topo.basePositions, at = this.plumeVertex, r = this.k.caldera * 1.6;
    if (h > 0.45) {
      // (A sag, slow and shallow, over the chamber: the warning, before it goes.)
      const sink = 0.004 * (h - 0.45) * dt;
      for (let v = 0; v < this.rock.length; v++) {
        const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
        if (d < r && this.rock[v] > this.k.floor) this.rock[v] -= sink * (1 - (d / r) ** 2);
      }
    }
    if (h > 0.6 && !this.sinkingSaid) { this.sinkingSaid = true; this.tell('The ground is sinking: stop pouring for a while'); }
    else if (h < 0.3) this.sinkingSaid = false;
    if (h >= 1) {
      this.fellFrom = Math.max(this.fellFrom ?? 0, this.summit);
      // (Wide as well as deep: the whole summit over the chamber, not a pit at its tip.)
      const depth = this.k.calderaDepth, width = this.k.caldera;
      this.k.calderaDepth = depth * this.k.hollowDepth; this.k.caldera = width * 2.2;
      this.collapse();
      this.k.calderaDepth = depth; this.k.caldera = width;
      this.drained = this.k.hollow * 0.3;
      this.tally.calderas++;
      this.lavaChanged();
      this.tell('You poured too fast: the top of the volcano collapsed');
      this.find('caldera', 'a caldera. The emptied chamber gave way and the summit fell in, as at Crater Lake');
    }
    // (Built back higher than it fell from: the chamber refilled under it, lifting it again.)
    if (this.fellFrom !== null && (this.resurgeIn -= dt) <= 0) { this.resurgeIn = 1; if (this.summit > this.fellFrom + 0.01) this.find('resurgent', 'a resurgent dome. The chamber filled again and lifted the fallen summit higher than before, as at Yellowstone'); }
  }
  /** The hollow world: how high the summit stood when it last fell in (null: it hasn't). */
  fellFrom: number | null = null;
  private resurgeIn = 1;

  private collapse(): void {
    const p = this.topo.basePositions, at = this.plumeVertex, r = this.k.caldera;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < r) this.rock[v] -= this.k.calderaDepth * (1 - (d / r) ** 2) * Math.min(1, Math.max(0, this.rock[v] - this.k.floor) * 4);
      if (d < this.k.calderaKills) this.life[v] *= (d / this.k.calderaKills) ** 3;
    }
  }

  /** A stone from the sky, at a vertex: a crater with a raised rim, and death round it. Its heat joins yours. */
  strike(at: number, icy = false, size?: number, theia = false): void {
    // (A growing world's stones dig craters as big as they are, against the world: Theia's, a great part of it.)
    const p = this.topo.basePositions, r = this.k.crater * (icy ? 0.75 : 1) * (size ? Math.min(theia ? 4 : 2.2, Math.sqrt((size / this.mass) * 3)) : 1);
    // (An icy comet: is the ground it strikes warm with lava laid lately? Looked at before its crater changes it.)
    let warm = false;
    if (icy) warm = this.warmUnder(at) || this.warmthAt(at) > 0.5;
    this.craters.push({ x: p[at * 3], y: p[at * 3 + 1], z: p[at * 3 + 2], r, born: this.seconds });
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d > r * 2.5) continue;
      const k = d / r;
      // Dug out within the crater, thrown up as a rim just beyond it.
      this.rock[v] += this.k.craterDepth * (k < 1 ? -(1 - k * k) : 0.35 * Math.exp(-((k - 1.15) ** 2) / 0.08));
      this.life[v] *= Math.min(1, k / 2.5);
      if (k < 1.5) this.age[v] = 0;
      if (this.k.impactMelt > 0 && k < 1) this.lava[v] += this.k.impactMelt * (1 - k * k);
      // (Melted on warm lava, it pools: its crater's floor below the sea, a pond of the first water.)
      if (icy && warm && k < 0.85) { this.rock[v] = Math.min(this.rock[v], -0.012 * (1 - k)); this.lava[v] = 0; }
    }
    if (icy) {
      this.tally.stones++;
      // (On the volcano itself it melts too, it's the hottest ground there is; but it takes the volcano's heat to do it.)
      if (this.warmthAt(at) > 0.5) { const cool = Math.min(this.reserve, this.k.iceCool); this.reserve -= cool; this.water++; this.tell(`The comet melted on the volcano, but cost some of its heat: water ${this.water}`); this.find('phreatic', 'a steam-blast crater. Ice struck hot rock and flashed to steam, blowing out a crater'); }
      else if (warm) { this.water++; this.tell(`Ice melted on warm lava: water ${this.water}`); }
      else this.tell('The comet froze: it landed on old, cold rock. Pour fresh lava where the next one lands');
      return;
    }
    if (this.lava[at] > this.k.thin) this.find('tektites', 'tektites. A stone struck molten lava and splashed it into the sky, where it froze into beads of glass');
    // Its heat joins yours, and far more of it if the plume is there to take it in (the bigger the volcano, the further round it).
    const caught = this.catchAt(at);
    this.reserve += this.k.impactHeat * (1 + (this.k.caught - 1) * caught);
    this.tally.stones++;
    // A growing world: a stone caught is part of it, a little bigger; one too big breaks a piece off; Theia, caught, is the giant impact.
    if (size && this.k.accrete > 0) {
      if (theia) {
        if (caught > 0.5) { this.theiaStruck = true; this.tally.caught++; this.tell('Theia caught: the crash throws up rock that will form the Moon'); }
        else this.tell('Theia missed. It will come back: get its circle inside the gold ring');
        return;
      }
      if (caught > 0.5 && this.tooBig(size)) { this.mass = Math.max(1, this.mass * 0.65); this.chunks++; this.tell('That stone was too big: it broke a piece off your planet. Keep dark red stones outside the gold ring'); return; }
      if (caught > 0.5) { this.mass += size; this.tally.caught++; this.tell('Stone caught: your planet grows'); return; }
      this.tell(this.tooBig(size) ? 'The big stone fell outside the gold ring: well let past' : 'Missed: catch stones inside the gold ring');
      return;
    }
    if (caught > 0.5) { this.tally.caught++; this.tell('Stone caught: your volcano gets more heat'); }
    else if (this.k.impactNear > 0) this.tell(this.k.icy > 0 ? 'Missed: turn the volcano under the next dark stone' : 'Missed: catch stones inside the gold ring'); // (where catching them is the aim, a miss is said too)
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
    const g = this.gravity, u = this.upright ?? g;
    if (u && g && this.k.rises > 0 && !this.called) this.target = unit({ x: -u.x, y: -u.y, z: -u.z });
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

  /** Where lava poured the way the world is held breaks out: a few steps from the vent, down the tip; null if it's held level. */
  private aimedFlank(vent: number): number | null {
    const g = this.downward, p = this.topo.basePositions, t = this.topo;
    if (!g) return null;
    const n = { x: p[vent * 3], y: p[vent * 3 + 1], z: p[vent * 3 + 2] }, along = g.x * n.x + g.y * n.y + g.z * n.z;
    const dx = g.x - along * n.x, dy = g.y - along * n.y, dz = g.z - along * n.z, l = Math.hypot(dx, dy, dz);
    if (l < 0.08) return null;
    let v = vent;
    for (let k = 0; k < 3; k++) {
      let best = v, score = -Infinity;
      for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) {
        const w = t.nbrList[q], ex = p[w * 3] - p[v * 3], ey = p[w * 3 + 1] - p[v * 3 + 1], ez = p[w * 3 + 2] - p[v * 3 + 2];
        const sc = (ex * dx + ey * dy + ez * dz) / l / (Math.hypot(ex, ey, ez) || 1);
        if (sc > score) { score = sc; best = w; }
      }
      v = best;
    }
    return v;
  }

  /**
   * Where lava would run from a vertex, the world held as it is: the steepest way down, step by step,
   * as far as `steps` or until nowhere is lower. For the faint line that shows a pour's way before it goes.
   */
  pathFrom(from: number, steps: number): number[] {
    const t = this.topo, p = t.basePositions, G = this.downward, R = this.k.relief, out = [from];
    let v = from;
    const seen = new Set([from]);
    for (let k = 0; k < steps; k++) {
      const s = this.rock[v] + this.lava[v];
      let best = -1, drop = 0;
      for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) {
        const w = t.nbrList[q];
        if (seen.has(w)) continue;
        const own = s - (this.rock[w] + this.lava[w]);
        const round = G ? ((p[w * 3] - p[v * 3]) * G.x + (p[w * 3 + 1] - p[v * 3 + 1]) * G.y + (p[w * 3 + 2] - p[v * 3 + 2]) * G.z) * (1 + R * s) / R : 0;
        const d = this.k.selfGravity * own + (1 - this.k.selfGravity) * (round + own);
        if (d > drop) { drop = d; best = w; }
      }
      if (best < 0) break;
      v = best; seen.add(v); out.push(v);
    }
    return out;
  }

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
  /** A field counted for the aim (a chaos field, a streak), kept with the great plumes: if far enough from the others. */
  private counted(reach: number, said: string, tooNear: string): boolean {
    const q = this.plume, apart = Math.cos(this.k.plumesApart);
    if (this.plumes.some((o) => o.x * q.x + o.y * q.y + o.z * q.z > apart)) { this.tell(tooNear); return false; }
    this.plumes.push({ x: q.x, y: q.y, z: q.z, reach });
    this.tell(`${said}: ${this.plumes.length}`);
    return true;
  }

  /** Whether lava has reached a house (it burns, and is lost, even once the lava has set). */
  houseLost(i: number): boolean { const v = this.houses[i].v; return this.age[v] < 1e5 || this.lava[v] > 0.002; }
  /** How many of the town's houses are standing. */
  get housesKept(): number { let k = 0; for (let i = 0; i < this.houses.length; i++) if (!this.houseLost(i)) k++; return k; }
  /**
   * Grindavík: raise a wall of earth where the world was tapped (a unit vector). Tapped near the last
   * one, the wall runs on from it to here; anywhere else, it begins as a short mound. Each tap is one
   * of `walls`; none left, nothing. Not on lava, nor on the town itself.
   */
  raiseWall(at: { x: number; y: number; z: number }): boolean {
    if (this.wallsLeft <= 0) return false;
    const c = unit(at), t = this.townAt;
    if (t && Math.acos(Math.min(1, c.x * t.x + c.y * t.y + c.z * t.z)) < this.k.townR * 0.9) return false;
    const l = this.lastWall, joins = l && Math.acos(Math.min(1, l.x * c.x + l.y * c.y + l.z * c.z)) < 0.14;
    const a = joins ? l! : c;
    const p = this.topo.basePositions, n = this.rock.length, h = this.k.wallHeight;
    // (Wider than the ground's own points are apart: narrower, lava slipped across the line between two points
    // either side of it, each raised less than half the wall's height, and the walls hardly held anything.)
    const width = this.k.wallWidth * Math.sqrt((4 * Math.PI) / n) / Math.sqrt((4 * Math.PI) / 16002);
    const ab = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }, len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 > 0.04 && (x - a.x) ** 2 + (y - a.y) ** 2 + (z - a.z) ** 2 > 0.04) continue;
      const s = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * ab.x + (y - a.y) * ab.y + (z - a.z) * ab.z) / len2)) : 0;
      const d = Math.hypot(x - a.x - ab.x * s, y - a.y - ab.y * s, z - a.z - ab.z * s);
      if (d > width * 2.5 || this.lava[v] > 0.004) continue;
      // (Earth heaped to the wall's height, not on top of what's there: a second pass over the same ground adds nothing.)
      const want = this.start[v] + h * Math.exp(-((d / width) ** 2));
      if (this.rock[v] < want) this.rock[v] = want;
    }
    this.walls.push({ a: { ...a }, b: { ...c } });
    this.lastWall = c;
    this.wallsLeft--;
    return true;
  }

  private angleTo(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number { return Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))))); }
  /** Io's two fires: blue welling up by itself somewhere in the pool, and the slow currents turning the colours round. */
  private lampOfIo(dt: number): void {
    const m = this.marble!, R = m.R;
    m.work();
    const somewhere = (most: number): [number, number] => { const a = this.rand() * Math.PI * 2, r = R * most * Math.sqrt(this.rand()); return [r * Math.cos(a), r * Math.sin(a)]; };
    if (this.reserve > 0.01 && (this.sulphurIn -= dt) <= 0) {
      this.sulphurIn = this.k.sulphurEvery;
      const [x, y] = somewhere(0.6);
      m.drop(x, y, 2, this.k.sulphurArea * (0.7 + 0.6 * this.rand()), this.seconds);
      this.drops.sulphur++;
    }
    if ((this.currentIn -= dt) <= 0) {
      this.currentIn = this.k.currentEvery;
      const [x, y] = somewhere(0.7);
      m.turn(x, y, this.k.currentTurn * (0.6 + 0.4 * this.rand()) * (this.rand() < 0.5 ? -1 : 1), R * (0.3 + 0.25 * this.rand()), this.seconds);
    }
  }
  /** A finger held at `at` in the pool pours your lava there, as long as there's heat to pour. Returns whether it poured. */
  marblePour(at: { x: number; y: number; z: number }, dt: number): boolean {
    const m = this.marble;
    if (!m || this.over || this.pressure <= 0.01) return false;
    const [x, y] = m.toMap(unit(at));
    if (!m.inPool(x, y)) return false;
    const heat = Math.min(this.pressure, this.k.marblePour * dt);
    this.pressure -= heat;
    if (m.grow(x, y, heat * this.k.marbleArea, this.seconds)) { this.drops.lava++; this.tally.flows++; }
    return true;
  }
  /** Where `at` is in the pool's flat map (for a finger that keeps pouring at one spot). */
  marbleMap(at: { x: number; y: number; z: number }): [number, number] | null {
    const m = this.marble;
    if (!m) return null;
    const p = m.toMap(unit(at));
    return m.inPool(p[0], p[1]) ? p : null;
  }
  /** A finger drawn through the pool from `a` to `b`, dragging the colours along. */
  marbleStir(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void {
    const m = this.marble;
    if (!m) return;
    const [x0, y0] = m.toMap(unit(a)), [x1, y1] = m.toMap(unit(b));
    if (!m.inPool(x0, y0) && !m.inPool(x1, y1)) return;
    m.stir(x0, y0, x1, y1, m.R * 0.16, this.seconds);
  }
  /** The colour at a point of the pool (0 none, 1 your lava, 2 the blue). */
  marbleKindAt(pt: { x: number; y: number; z: number }): number { return this.marble ? this.marble.kindAtWorld(pt) : 0; }
  /**
   * How marbled the pool is, 0 to 1: how long the lines are where the two colours meet, against `marbleLines`, and
   * only as far as each colour holds a fair share of the pool (a pool all blue, with a thread of lava, isn't it).
   */
  get marbled(): number {
    const m = this.marble;
    if (!m) return 0;
    const { pattern, lava, blue } = m.measure(this.k.marbleLines);
    return pattern * Math.min(1, Math.min(lava, blue) / 0.25);
  }

  /** How high the ground at the vent stands above where it began (Venus's and Wright Mons's domes). */
  get domeRise(): number { return this.rock[this.plumeVertex] - this.start[this.plumeVertex]; }
  /** How far the vent is from the ring round Wright Mons's hollow, in radians (0 on the ring; 0 on other worlds). */
  get offRing(): number {
    const c = this.domeCentre, q = this.plume;
    return c ? Math.abs(Math.acos(Math.min(1, c.x * q.x + c.y * q.y + c.z * q.z)) - this.k.domeRing) : 0;
  }
  /** A dome stands at the vent: counted, if it's apart from the others (and, round a hollow, on its ring). */
  private domed(): void {
    if (this.domeRise < this.k.dome) return;
    const q = this.plume, apart = Math.cos(this.k.plumesApart), quiet = this.seconds - this.domeTold < 20;
    if (this.plumes.some((o) => o.x * q.x + o.y * q.y + o.z * q.z > apart)) return; // (the one it's on, or too near one: said once, below)
    if (this.offRing > this.k.domeBand) { if (!quiet) { this.domeTold = this.seconds; this.tell('A mound, but not on the dotted circle'); } return; }
    this.counted(this.k.plumesApart, this.domeCentre ? 'A mound on the dotted circle' : 'A lava dome', this.domeCentre ? 'A mound, but too close to another: start the next further round' : 'A dome, but too close to another: move outside its circle');
  }

  /** Triton: a geyser's plume, blown downwind into a long dark streak. */
  private geyser(volume: number): void {
    const p = this.topo.basePositions, q = this.plume, n = this.rock.length, len = this.k.streak;
    // (Downwind: east, along the world's own turning about its north.)
    const east = unit(cross({ x: 0, y: 1, z: 0 }, q));
    if (!isFinite(east.x)) return;
    const w = this.next;
    let sum = 0;
    for (let v = 0; v < n; v++) {
      const dx = p[v * 3] - q.x, dy = p[v * 3 + 1] - q.y, dz = p[v * 3 + 2] - q.z;
      const along = dx * east.x + dy * east.y + dz * east.z, side = Math.hypot(dx - along * east.x, dy - along * east.y, dz - along * east.z);
      w[v] = along > 0 && along < len ? Math.exp(-((side / (0.018 + 0.022 * along / len)) ** 2)) * (1 - 0.6 * along / len) : 0;
      sum += w[v];
    }
    if (!(sum > 0)) return;
    for (let v = 0; v < n; v++) if (w[v]) { const add = (volume * w[v]) / sum; this.rock[v] += add * 0.3; this.ash[v] = Math.min(0.8, this.ash[v] + add * 45); }
    this.counted(len, 'A dark streak', 'A streak, but too close to an earlier one: move further away');
  }

  private greatPlume(reach: number): void {
    const q = this.plume, apart = Math.cos(this.k.plumesApart);
    if (this.plumes.some((o) => o.x * q.x + o.y * q.y + o.z * q.z > apart)) { this.tell('A big eruption, but too close to an earlier one: move further away'); return; }
    this.plumes.push({ x: q.x, y: q.y, z: q.z, reach });
    this.tell(`A big eruption: ${this.plumes.length}`);
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
    if (!(sum > 0)) return; // (no ground in reach on a coarse mesh: nothing falls, rather than NaN)
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
    this.moltenKnown = false;
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

  /** Each neighbour's drop and pull, for the vertex `flow` is working on (no vertex has more than a dozen neighbours). */
  /** How much lava is running, a second (as on a planet of the drawn detail): a still sheet of magma, however wide, runs hardly at all. */
  moved = 0;
  private flowDue = 0;
  private readonly dropBuf = new Float64Array(16);
  private readonly pullBuf = new Float64Array(16);

  /** Lava runs downhill, mostly by the steepest way, and downhill is as the world is held. */
  private flow(dt: number): void {
    this.moltenKnown = false;
    const t = this.topo, n = this.rock.length, next = this.next, p = t.basePositions;
    const G = this.downward, R = this.k.relief;
    next.set(this.lava);
    const rock = this.rock, lava = this.lava, selfG = this.k.selfGravity, spin = this.k.spin, grain = this.grainOf, chan = this.k.channel, pull = this.k.grainPull;
    // How far the neighbour `w` lies below `v` (whose surface stands at `s`), as the world is held.
    // (Worked out once per step, not as fresh functions for every vertex: on a world under a sheet of magma,
    // that was some sixty thousand small functions a frame, and the first world stuttered on a phone.)
    const dropTo = (v: number, s: number, w: number): number => {
      const own = s - (rock[w] + lava[w]);
      let d = own;
      if (G) {
        // Held like a globe: how far down the neighbour is along gravity, the ground raised as it
        // is drawn, counted back into the ground's own heights. Near the top the relief is all of
        // it; further round, the curve of the world pulls the lava down its side.
        // (The ground's own heights count as they would facing up, at least in part, however the ground
        // faces: on the world's underside, "down" points out of the ground, and a pile of lava counted as
        // lower than its neighbours, drew in more, and grew into a needle tens of times the tallest mountain.)
        const up = -(p[w * 3] * G.x + p[w * 3 + 1] * G.y + p[w * 3 + 2] * G.z);
        const round = ((p[w * 3] - p[v * 3]) * G.x + (p[w * 3 + 1] - p[v * 3 + 1]) * G.y + (p[w * 3 + 2] - p[v * 3 + 2]) * G.z) * (1 + R * s) / R;
        const held = round + Math.max(0.3, up) * own;
        d = selfG > 0 ? selfG * own + (1 - selfG) * held : held;
      }
      // Spun fast, lava is flung outwards from the axis: towards the equator, as much as down.
      if (spin > 0) d += spin * (p[v * 3 + 1] ** 2 - p[w * 3 + 1] ** 2);
      return d;
    };
    const drops = this.dropBuf, pulls = this.pullBuf;
    let moved = 0;
    for (let v = 0; v < n; v++) {
      const l = lava[v];
      if (l < this.k.thin) continue;
      const s = rock[v] + l, a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      let sum = 0, weights = 0;
      for (let q = a; q < b; q++) {
        const w = t.nbrList[q], d = dropTo(v, s, w);
        drops[q - a] = d;
        if (d > 0) { const wt = Math.pow(d, chan) * (0.35 + pull * grain[w]); pulls[q - a] = wt; sum += d; weights += wt; }
      }
      if (sum <= 0) continue;
      // Viscous, as lava is: it runs fast where it lies deep and hardly at all where it's thin (its
      // flux rising as its depth to the power two and a half, nearly as a Bingham fluid's does down a slope), so a
      // flow's thick core pushes its thin margin ahead of it in blunt, rounded lobes.
      // (As a rate, at lava's own pace, so a step's length doesn't change how far it gets.)
      const lv = l * Math.sqrt(l);
      let rate = Math.min(RUN_MOST, (this.k.flow * sum * lv) / (lv + VISCOUS_15) / l);
      // At the front (where it lies thin), it swells and holds, then breaks out: each place in its own
      // time, so a front buds out here and then there rather than creeping evenly.
      if (this.k.breakout > 0 && l < 0.012) {
        const ph = this.breakPhase[v], pulse = 0.5 + 0.5 * Math.sin(this.seconds * LAVA_PACE * 0.9 + ph);
        rate *= 1 - this.k.breakout * (1 - pulse * pulse * pulse) * (1 - l / 0.012);
      }
      const out = l * (1 - Math.exp(-rate * LAVA_PACE * dt));
      next[v] -= out;
      moved += out;
      for (let q = a; q < b; q++) if (drops[q - a] > 0) next[t.nbrList[q]] += (out * pulls[q - a]) / weights;
    }
    this.lava.set(next);
    this.moved = moved / Math.max(1e-6, dt) / this.scale; // (as a rate, and as on a planet of the drawn detail)
  }

  /** Lava cools into rock: slowly on land, fast where it meets the sea. A real covering clears the ground. */
  private cool(dt: number): void {
    this.moltenKnown = false;
    for (let v = 0; v < this.rock.length; v++) {
      const l = this.lava[v];
      if (l <= 0) continue;
      const sea = this.rock[v] + l < 0;
      // (In a tube of its own fresh crust, lava in the sea cools far slower.)
      const tube = sea && this.k.tubes < 1 && this.laid[v] < this.k.tubeFresh && !this.onBank?.[v] ? this.k.tubes : 1;
      // (A trace too small to matter is rock at once, or it lingers for ever, costing a step each time.)
      // (At a flow's margin, next to bare ground, it sets faster: its levees.)
      let edge = 1;
      if (!sea && this.k.levee > 1 && l < 0.004) {
        const t = this.topo;
        for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) if (this.lava[t.nbrList[q]] < this.k.thin) { edge = this.k.levee; break; }
      }
      // (On a lava world, facing its star, it hardly cools at all.)
      const baked = this.k.dayCool < 1 && this.star ? 1 + (this.k.dayCool - 1) * this.dayAt(v) : 1;
      const solid = l < 1e-7 ? l : l * (1 - Math.exp(-(l < this.k.thin ? THIN_SETS : (sea ? this.k.coolSea * tube : this.k.coolLand * edge) * baked) * LAVA_PACE * dt));
      if (solid > 2e-5) this.laid[v] = 0; // (a layer, not a trace: a last trickle setting doesn't make it fresh again)
      this.lava[v] -= solid;
      this.rock[v] += solid;
      if (this.k.formations.length && solid > 2e-5 && sea) this.formed(v);
      if (this.k.formations.length && sea && l > 0.02) this.find('littoral', 'a littoral cone. Lava poured into the sea burst into steam and built a cone of glassy sand on the shore');
      if (this.frozen[v] && l > this.k.cover) this.steamCone(v);
      if (l > this.k.cover) { if (this.life[v] > 0.05) this.scorch[v] = 1; this.age[v] = 0; this.life[v] = 0; this.grown[v] = 0; this.ash[v] = 0; this.rich[v] = 0; }
    }
  }

  /**
   * The field book: what the rock setting here says of how it was made, the first time it says it. (Lava welling
   * up under the sea at the vent doesn't count as pillows: it's lava run from the land into the sea that does.)
   */
  private formed(v: number): void {
    if (!this.k.formations.includes('pillow') || this.found.includes('pillow') || this.rock[this.plumeVertex] <= 0) return;
    const p = this.topo.basePositions, q = this.plume, d = Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z);
    if (d > 0.08) this.find('pillow', 'pillow lava. Lava running into the sea cools in round pillows');
  }

  /**
   * A new island: the seabirds. Ground that stands dry and clear of lava long enough is somewhere to nest, and
   * now and then a bird comes and does; a nest is lost to lava running over it, or to the sea taking its ground.
   */
  private nesting(dt: number): void {
    const n = this.rock.length, thin = this.k.thin;
    for (let v = 0; v < n; v++) this.dryFor[v] = this.rock[v] > 0.004 && this.lava[v] < thin ? this.dryFor[v] + dt : 0;
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const v = this.nests[i].v, burnt = this.lava[v] >= thin, drowned = this.rock[v] < 0.002, buried = this.ash[v] > 0.5;
      if (!burnt && !drowned && !buried) continue;
      this.nests.splice(i, 1);
      if (burnt) { this.nestsLost.lava++; this.tell('A nest lost under the lava: steer the lava away from the birds'); }
      else if (buried) { this.nestsLost.ash++; this.tell('A nest buried in ash: once birds come, pour rather than erupt'); }
      else { this.nestsLost.sea++; this.tell('A nest lost to the sea: the waves wore its ground away'); }
    }
    if ((this.nestIn -= dt) > 0 || this.nests.length >= this.k.nests * 2) return;
    this.nestIn = this.k.nestEvery;
    // (Somewhere it's been dry and cool long enough, away from the vent and the other nests: one such place, by lot.)
    const p = this.topo.basePositions, q = this.plume, apart = this.k.nestApart;
    let pick = -1, seen = 0;
    for (let v = 0; v < n; v++) {
      // (On lava rock, set and cooled: not loose ash, which the birds won't trust, nor fresh lava, still hot.)
      if (this.dryFor[v] < this.k.nestAfter || this.laid[v] < this.k.nestAfter || this.laid[v] >= 1e5 || this.ash[v] > 0.3) continue;
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      if (Math.hypot(x - q.x, y - q.y, z - q.z) < this.k.nestVent) continue;
      let near = false;
      for (const s of this.nests) { const w = s.v; if (Math.hypot(x - p[w * 3], y - p[w * 3 + 1], z - p[w * 3 + 2]) < apart) { near = true; break; } }
      if (near) continue;
      if (this.rand() * ++seen < 1) pick = v;
    }
    if (pick < 0) return;
    this.nests.push({ v: pick, at: this.seconds });
    this.tell(this.nests.length === 1 && this.nestsLost.lava + this.nestsLost.sea + this.nestsLost.ash === 0 ? 'A seabird nests on the new land' : `A seabird nests: ${this.nests.length}`);
  }

  /**
   * Mars: lava run over ice in the ground boils it, and the steam blasts up through the lava in small cones with
   * craters in their tops, "rootless" because no vent feeds them, as on Mars's lava plains (and Iceland's).
   */
  private steamCone(v: number): void {
    this.frozen[v] = 0;
    // (Not every point of the patch: a cone here and there.)
    if (this.rand() > 0.15) return;
    const t = this.topo;
    this.rock[v] += 0.006;
    for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) this.rock[t.nbrList[q]] += 0.01;
    this.find('rootless', 'rootless cones. Lava over ice in the ground boils it, and steam blasts up small cones');
  }

  /**
   * A touch on running lava chills it where it lies, as the people of Heimaey chilled theirs with seawater in 1973:
   * it sets at once, in a low wall, and what comes after runs round it. Not at the vent itself (a touch there erupts).
   */
  chill(at: { x: number; y: number; z: number }): boolean {
    const p = this.topo.basePositions, q = this.plume, r = 0.035;
    if (Math.hypot(at.x - q.x, at.y - q.y, at.z - q.z) < 0.06) return false;
    const near: number[] = [];
    let running = false;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - at.x, p[v * 3 + 1] - at.y, p[v * 3 + 2] - at.z);
      if (d > r) continue;
      near.push(v);
      if (this.lava[v] > this.k.thin) running = true;
    }
    if (!running) return false;
    for (const v of near) {
      const d = Math.hypot(p[v * 3] - at.x, p[v * 3 + 1] - at.y, p[v * 3 + 2] - at.z);
      this.rock[v] += this.lava[v] + 0.006 * (1 - d / r);
      if (this.lava[v] > 2e-5) this.laid[v] = 0;
      this.lava[v] = 0;
    }
    this.moltenKnown = false;
    this.chilled++;
    if (this.chilled === 1) this.tell('Chilled: the lava hardened where you touched it, and the flow goes another way');
    return true;
  }
  /** The field book: a formation made, the first time, on a world that keeps them. */
  private find(id: string, text: string): void {
    if (!this.k.formations.includes(id) || this.found.includes(id)) return;
    this.found.push(id);
    this.tell(`Found: ${text}`);
  }
  /** How many times lava has been chilled by a touch. */
  chilled = 0;

  /** Mercury: a burst's shock arriving at the far side, and erupting there. */
  private farSide(): void {
    if (!this.far || !this.echoes.length || this.echoes[0].at > this.seconds) return;
    const e = this.echoes.shift()!, v = this.vertexAt(this.far), a = e.volume * this.scale;
    this.eruptions.push({ vertex: v, flank: v, left: a, rate: a / this.k.pour, total: a, t: 0, dur: this.k.pour * 1.5 });
    this.echoed++;
    this.find('weird', 'weird terrain. The shock came through the planet and broke the far side into jumbled hills, as opposite Mercury\'s Caloris basin');
    this.tell('The shock arrives: the far side breaks open and rises');
  }

  /** How squarely the ground at a vertex faces the star: 0 on the night side and at the edge, to 1 under it. */
  dayAt(v: number): number {
    const s = this.star, p = this.topo.basePositions;
    if (!s) return 0;
    const d = p[v * 3] * s.x + p[v * 3 + 1] * s.y + p[v * 3 + 2] * s.z;
    const edge = 0.08 + this.nightShift;
    return d <= edge ? 0 : Math.min(1, (d - edge) / 0.5);
  }
  /** The red giant: how far the edge of day has moved round into the night (0 to `nightShrink`), as the fire burns on. */
  get nightShift(): number {
    return this.k.nightShrink ? -0.15 + (this.k.nightShrink + 0.15) * Math.min(1, Math.max(0, 1 - this.reserve / this.k.heat)) : 0;
  }
  /** The share of the world in the night. */
  get nightShare(): number {
    return Math.max(0, Math.min(1, (1 + 0.08 + this.nightShift) / 2));
  }

  /** Snowball Earth: whether the vent breathes into open air (from land above the sea, or open water). */
  get ventOpen(): boolean {
    const v = this.plumeVertex, p = this.topo.basePositions;
    return this.rock[v] > 0 || Math.abs(p[v * 3 + 1]) < this.iceLine;
  }

  /** Whether the ground at a vertex is under the ice, on Snowball Earth. */
  iced(v: number): boolean {
    return this.k.gas > 0 && Math.abs(this.topo.basePositions[v * 3 + 1]) >= this.iceLine;
  }

  /** Heat let out: on Snowball Earth, its gas, if the vent is open to the sky. */
  private breathe(volume: number, burst: boolean): void {
    if (this.k.gas <= 0 || !this.ventOpen) return;
    this.greenhouse += volume * this.k.gas * (burst ? 1 : this.k.gasPour);
  }

  /** What the sky does: the gas warming Snowball Earth; a star boiling a world away, or raising its lava as vapour. */
  private skies(dt: number): void {
    if (this.k.breathe > 0) {
      let mats = 0;
      for (let v = 0; v < this.rock.length; v++) if (this.rock[v] < 0 && this.rock[v] > this.k.reefDeep) mats += this.life[v];
      this.oxygen += (mats / this.scale) * this.k.breathe * dt;
      if (mats / this.scale > 20) this.find('stromatolite', 'stromatolites. Mats of life in the shallows built up in layers, the oldest fossils there are');
      if (this.k.bandedAt > 0 && this.oxygen >= this.k.bandedAt) this.find('banded', 'banded iron. The first oxygen met iron in the sea and rusted it out in red stripes, as in rocks 2.5 billion years old');
    }
    if (this.k.gas > 0) {
      this.greenhouse -= this.greenhouse * this.k.drawdown * dt;
      const thaw = this.greenhouse / this.k.thawAt;
      if (thaw >= 1 && !this.thawed) { this.thawed = true; this.tell('The ice gives way'); }
      // (Before it gives way, the ice lets go of the tropics only, as far as the gas holds it back;
      // once it gives way, it goes on of itself, darker water taking in more sun, to the poles.)
      const to = this.thawed ? 1 : 0.42 * Math.min(1, thaw);
      this.iceLine += (to - this.iceLine) * Math.min(1, dt * (this.thawed ? 0.02 : 0.15));
    }
    if (!this.star || (this.k.boil <= 0 && this.k.vapour <= 0)) return;
    const n = this.rock.length, s = this.scale;
    let rose = 0;
    for (let v = 0; v < n; v++) {
      const day = this.dayAt(v);
      if (day <= 0) continue;
      if (this.k.boil > 0) {
        // (Lava lying there boils first; then the new rock. The old crust beneath is too baked to boil
        // any more: the world is shrinking, but over ages, not in a game.)
        let off = this.k.boil * day * dt;
        const fromLava = Math.min(this.lava[v], off);
        this.lava[v] -= fromLava; off = Math.min(off - fromLava, Math.max(0, this.rock[v] - this.start[v]));
        this.rock[v] -= off;
        this.lost += (fromLava + off) / s;
      }
      if (this.k.vapour > 0 && this.lava[v] > 0) {
        const up = this.lava[v] * Math.min(1, this.k.vapour * day * dt);
        this.lava[v] -= up;
        rose += up;
      }
    }
    if (rose > 0) this.snowFall(rose);
  }

  /** Rock vapour falling as snow on the night side, most just past the edge of day. */
  private snowFall(volume: number): void {
    const p = this.topo.basePositions, st = this.star!, n = this.rock.length;
    let sum = 0;
    const w = this.next;
    for (let v = 0; v < n; v++) {
      const d = p[v * 3] * st.x + p[v * 3 + 1] * st.y + p[v * 3 + 2] * st.z;
      w[v] = d < 0.05 && d > -0.6 ? Math.exp(-(((d + 0.18) / 0.16) ** 2)) : 0;
      sum += w[v];
    }
    if (!(sum > 0)) return;
    for (let v = 0; v < n; v++) {
      if (!w[v]) continue;
      const add = (volume * w[v]) / sum;
      this.rock[v] += add;
      this.ash[v] = Math.min(1, this.ash[v] + add * 60);
    }
    this.snow += volume / this.scale;
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
      if (r[v] > 0.01) this.wasLand[v] = 1; else if (this.wasLand[v] && r[v] < -0.015 && this.k.formations.includes('guyot')) this.find('guyot', 'a guyot. An island worn flat by the waves sank below the sea, keeping its flat top');
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
        if (worn > 0 && this.laid[v] < 1e5 && r[v] > 0) this.find('blacksand', 'a black sand beach. The waves ground new lava down into black sand');
      } else this.wear[v] = 0;
      if (r[v] > 0) next[v] -= this.k.rain * dt * r[v] * wear;
      // A dust storm scours whatever stands high, and soft ash most of all.
      if (this.storm && r[v] > this.k.floor && !(this.age[v] < this.k.stormFresh)) next[v] -= this.k.stormWear * dt * (r[v] - this.k.floor) * (1 + (this.k.softer - 1) * this.ash[v]) * this.windward(v);
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
    // The red giant's day melts whatever stands in it.
    if (to === n && this.k.melt > 0 && this.star) for (let v = 0; v < n; v++) {
      const day = this.dayAt(v);
      if (day > 0 && r[v] > this.k.meltFloor) { r[v] = Math.max(this.k.meltFloor, r[v] - this.k.melt * day * dt); if (day > 0.5 && this.laid[v] < 1e5) this.find('sunglass', 'sun-melted glass. Lava laid in the day melted again under the swollen Sun, and set as glass'); }
    }
    // The sea falls (and so the ground stands higher against it), more slowly under a burst's ash.
    if (to === n && this.k.dries > 0 && !this.over) {
      const d = this.k.dries * dt * (1 - 0.8 * Math.min(1, this.ashSky));
      for (let v = 0; v < n; v++) r[v] += d;
      this.dried += d;
      this.ashSky = Math.max(0, this.ashSky - dt / this.k.shadeLasts);
      if (this.k.formations.includes('salt') && !this.found.includes('salt') && this.seaShare < 0.25) this.find('salt', 'salt flats. Where a sea dried away, it left its salt behind in a white plain, as in Death Valley');
    }
  }
  /** The share of the world under the sea. */
  get seaShare(): number {
    let wet = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.rock[v] < 0) wet++;
    return wet / this.rock.length;
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
    // (Under Snowball Earth's ice, nothing lives but by the vent's warmth.)
    if (this.iced(v) && this.dist(v, this.plumeVertex) > 0.12) return 0;
    if (h < 0) return h > this.k.reefDeep && this.k.reef > 0 ? 0.7 : 0; // the shallows, as reef (where reefs grow); the deep holds none
    const soil = this.k.soil + (this.k.ashSoil - this.k.soil) * this.rich[v];
    // (On a rogue planet, only while the ground is warm.)
    const since = this.k.warmNear > 0 ? this.nearLaid[v] : this.laid[v], warm = this.k.warmLasts > 0 ? Math.max(0, Math.min(1, (this.k.warmLasts - since) / (this.k.warmLasts * 0.3))) : 1; // (warm from lava set there, or run beside it; ash falls cold)
    return Math.min(1, this.age[v] / soil) * (0.7 + 0.3 * this.rich[v]) * warm;
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
    // Life from elsewhere, on the wind and the waves and the birds, landing on bare ground above the sea.
    if (this.k.arrives > 0) {
      this.arriveIn -= dt;
      if (this.arriveIn <= 0) {
        this.arriveIn = this.k.arrives;
        const v = this.landing();
        if (v >= 0) {
          L[v] = Math.max(L[v], 0.4);
          if (!this.began) this.tell('Life arrives on the new land');
          this.began = true;
        }
      }
    }
    let alive = false;
    const G = this.grown, grows = dt / this.k.mature;
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
      // Grown up a little more where it holds on land; where it has all but died, it starts over.
      if (l < 0.1 || this.rock[v] <= 0) G[v] = 0;
      else if (l >= 0.3) G[v] = Math.min(1, G[v] + grows * (1 + this.rich[v]));
    }
    L.set(next.subarray(0, n));
    this.alive = alive;
  }

  /** Somewhere for life to land: bare ground above the sea (or, on the orange Earth, the shallows) that could take it (near the vent, on a world with a hearth); or -1. */
  private landing(): number {
    const n = this.rock.length;
    for (let tries = 0; tries < 400; tries++) {
      const v = this.k.hearth > 0 ? this.near(this.plume, this.k.hearth) : Math.floor(this.rand() * n);
      if (this.rock[v] > (this.k.breathe > 0 ? this.k.reefDeep : 0) && this.life[v] < 0.1 && this.room(v) > 0.3) return v; // (on the orange Earth, in the shallows too)
    }
    return -1;
  }

  /** A vertex picked at random within `reach` (radians) of a point. */
  private near(c: { x: number; y: number; z: number }, reach: number): number {
    const t1 = unit(cross(c, Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), t2 = cross(c, t1);
    const a = this.rand() * Math.PI * 2, r = reach * Math.sqrt(this.rand());
    return this.vertexAt(unit({ x: c.x * Math.cos(r) + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * Math.sin(r), y: c.y * Math.cos(r) + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * Math.sin(r), z: c.z * Math.cos(r) + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * Math.sin(r) }));
  }

  /** The vertex nearest a point on the world, walked to from the plume's. */
  private vertexAt(q: { x: number; y: number; z: number }): number {
    const t = this.topo, p = t.basePositions, dist = (v: number) => (p[v * 3] - q.x) ** 2 + (p[v * 3 + 1] - q.y) ** 2 + (p[v * 3 + 2] - q.z) ** 2;
    let v = this.plumeVertex;
    for (let moves = 0; moves < 400; moves++) {
      let best = v;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (dist(t.nbrList[k]) < dist(best)) best = t.nbrList[k];
      if (best === v) break;
      v = best;
    }
    return v;
  }

  /** How far apart two vertices are (straight through, as the other distances here are). */
  private dist(a: number, b: number): number {
    const p = this.topo.basePositions;
    return Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  }

  /** On a rogue planet: how much living ground there is (in vertices of a planet of the drawn detail). */
  get livingLand(): number {
    let c = 0;
    for (let v = 0; v < this.life.length; v++) if (this.life[v] >= 0.3 && this.rock[v] > 0) c++;
    return c / this.scale;
  }

  /** How much new ground stands on the world (in the volume heat is reckoned in): what was laid, less what boiled away. */
  get grownBy(): number {
    let d = 0;
    for (let v = 0; v < this.rock.length; v++) d += Math.max(0, this.rock[v] + this.lava[v] - this.start[v]);
    return d / this.scale;
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
      for (const v of ring) if (this.rock[v] < -0.005 && this.rock[v] > (this.k.seedShallow ? this.k.reefDeep : this.k.vents) && this.lava[v] < this.k.thin) return v;
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
      if (this.impact.in <= 0) { const icy = !!this.impact.icy, size = this.impact.size, theia = this.impact.theia; this.strike(this.impact.vertex, icy, size, theia); this.impact = null; if (!icy && !theia) this.tell('The stone lands'); }
      return;
    }
    if (this.over || !this.stonesFall || this.k.impactEvery[1] <= 0) return;
    this.impactIn -= dt * this.heatLeft;
    if (this.impactIn > 0) return;
    this.impactIn = this.between(this.k.impactEvery);
    // Half of them fall near the plume, where they matter; the rest anywhere.
    // (Decided once: chosen afresh at each try, an icy comet's narrower ring lost it to stones nearly every time. And
    // never three of a kind in a row: a run of six stones left too few comets to reach the aim, however well played.)
    const p = this.topo.basePositions, run = this.lastKinds;
    let icyNext = this.k.icy > 0 && this.rand() < this.k.icy;
    if (this.k.icy > 0 && run.length >= 2 && run[run.length - 1] === run[run.length - 2]) icyNext = !run[run.length - 1];
    if (this.k.icy > 0) { run.push(icyNext); if (run.length > 2) run.shift(); }
    for (let tries = 0; tries < 200; tries++) {
      const v = Math.floor(this.rand() * this.rock.length);
      const d = Math.hypot(p[v * 3] - this.plume.x, p[v * 3 + 1] - this.plume.y, p[v * 3 + 2] - this.plume.z);
      if (d < 0.08) continue; // not on the vent itself
      // (An icy comet falls nearer the volcano than a stone may, where lava can be poured out to meet it.)
      if (this.k.impactNear > 0) { const icy = icyNext; if (d > 0.2 && d < (icy ? this.k.iceNear : this.k.impactNear)) { this.impact = { vertex: v, in: this.k.impactWarning, icy, ...this.stoneSize() }; this.tell(icy ? 'An icy comet is coming: turn its circle to just below the volcano, and pour' : this.impact.theia ? 'Theia is coming, a world as big as Mars: catch it in the gold ring' : this.impact.size && this.tooBig(this.impact.size) ? 'A stone too big to hold is coming: keep the gold ring away from it' : 'A stone is coming'); return; } continue; }
      if (this.rand() < 0.5 || d < 0.5) { this.impact = { vertex: v, in: this.k.impactWarning, icy: this.rand() < this.k.icy }; this.tell(this.impact.icy ? 'An icy comet is coming' : 'A stone is coming'); return; }
    }
  }

  /** The first world: how big the coming stone is, against the world as it is now; grown, Theia. */
  private stoneSize(): { size?: number; theia?: boolean } {
    if (this.k.accrete <= 0) return {};
    if (this.mass >= this.k.accrete) return { size: this.mass, theia: true };
    // (Every size, from a crumb to near the world's own: the biggest that still fits grow it most; past six tenths, too big.)
    return { size: this.mass * (0.15 + 0.75 * this.rand()) };
  }

  /** Whether an icy comet landing at a vertex would melt: warm lava lies near enough (lately laid, or still running). */
  warmUnder(at: number): boolean {
    const p = this.topo.basePositions, x = p[at * 3], y = p[at * 3 + 1], z = p[at * 3 + 2], r = this.k.iceReach;
    for (let v = 0; v < this.rock.length; v++) {
      if (!(this.lava[v] > this.k.thin || this.age[v] < this.k.iceWarmFor)) continue;
      if (Math.abs(p[v * 3] - x) < r && Math.abs(p[v * 3 + 1] - y) < r && Math.hypot(p[v * 3] - x, p[v * 3 + 1] - y, p[v * 3 + 2] - z) < r) return true;
    }
    return false;
  }

  /** When the next stone lands, in seconds, counting its warning (null: none to come). */
  get stoneDue(): number | null {
    if (this.impact) return this.impact.in;
    if (this.over || !this.stonesFall || this.k.impactEvery[1] <= 0) return null;
    return this.impactIn / Math.max(0.05, this.heatLeft) + this.k.impactWarning;
  }
  /** Io's two lavas: when the blue next wells up, in seconds (null on other worlds). */
  get blueDue(): number | null { return this.marble && !this.over && this.reserve > 0.01 ? Math.max(0, this.sulphurIn) : null; }
  /** When the next dust storm comes, in seconds (0 while one blows; null: none on this world). */
  get stormDue(): number | null {
    if (this.k.stormEvery[1] <= 0) return null;
    return this.storm ? 0 : Math.max(0, this.stormIn);
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
