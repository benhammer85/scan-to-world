/**
 * The worlds, one after another: the same heat and the same hands, but each world its own
 * physics, its own aim, and its own way of being drawn, as each has its own kind of volcanism.
 *
 *   I   An ocean world: the crust drifts over the heat, and a chain of islands is left behind it.
 *       Carry the chain, living, all the way round.
 *   II  The Moon: no air, no water, no drift, and stones falling all the while; lava so fluid it
 *       floods the low ground rather than building mountains. Flood the great basins into seas.
 *   IV  An ice moon: a frozen shell over a hidden sea, where water is the lava and ice the rock.
 *       Cover the old, cratered ice with new.
 *   III Mars: no drift, so the heat stays in one place, as it did under the great Martian
 *       volcanoes, and gravity weak enough for slopes to stand steep; thin air, and dust storms
 *       that scour the heights, soft ash most. Raise the great mountain to its height.
 *   V   Io: a moon kneaded by its giant planet, so its heat comes in tides. With no air, a burst
 *       at the height of the tide throws a great ring of sulphur. Raise great plumes, each on
 *       fresh ground: the question here is when, not only where.
 *   VI  Enceladus: a small ice moon of a ringed giant, its plumes feeding the giant's ring, which
 *       thins away unless it's fed. Tip each burst towards the giant: the question is which way.
 *   VII A lumpy asteroid, not yet pulled round: fill its hollows with lava until it's a little
 *       round world, as Vesta began to be. The question is where not to put it.
 *   VIII A world spinning so fast it bulges, as Haumea does: lava is flung to its equator, and the
 *       aim is a ridge all the way round it, as Iapetus has.
 *   IX  A lava-lamp world: hot rock lighter than the deep, rising in blobs that float to whatever is
 *       uppermost, cool, merge and sink. Carry them, merged big enough to last, to the far shore.
 *   X   A tumbling moon, as Hyperion tumbles: its spin wanders and never settles, and every
 *       eruption pushes against it. Erupt where the ground sweeps past, and calm it.
 *   XI  A deep ocean world: lava cools fast in the cold deep, but in a tube of its own fresh crust
 *       it runs far. Build out to the shallow bank and raise an island there.
 *   XII A young Earth, with no moon yet: its cone holds the pressure down, the taller the more,
 *       and the biggest bursts throw rock clear into orbit, where it gathers into a moon.
 */
import type { Rules } from './sim';

export type WorldId = 'ocean' | 'moon' | 'mars' | 'ice' | 'io' | 'enceladus' | 'asteroid' | 'spin' | 'lamp' | 'tumble' | 'deep' | 'young' | 'rogue' | 'snowball' | 'dust' | 'magma' | 'first' | 'archean' | 'europa' | 'triton' | 'mercury' | 'lengai' | 'ijen' | 'tonga';

export interface Palette {
  /** The ground: bare old rock, fresh basalt, ash, lava as it runs (and where it lies thick), and, for worlds that keep a mark of it, rock that lava has flooded. */
  paper: string;
  basalt: string;
  ash: string;
  lava: string;
  deepLava: string;
  flooded?: string;
  /** The sea, over the shallows and the deep (worlds without one never show it). */
  shallow: string;
  deep: string;
  /** The land's contours, lighter and darker; and the sea's lines. */
  landInk: string;
  landInkHigh: string;
  pencil: string;
  seaInk: string;
}

export interface World {
  id: WorldId;
  numeral: string;
  title: string;
  /** What the card the world begins from says. */
  first: string;
  then: string;
  rules: Partial<Rules>;
  /** Its second aim, for the card: one that pulls against the first (see second.ts). */
  second: string;
  palette: Palette;
  goal: 'ring' | 'basins' | 'height' | 'cover' | 'plumes' | 'feed' | 'round' | 'ridge' | 'lamp' | 'calm' | 'bank' | 'orbit' | 'hearth' | 'thaw' | 'outbuild' | 'snow' | 'gather' | 'oxygen' | 'chaos' | 'streaks' | 'antipode' | 'white' | 'glow' | 'waves';
  /** For Ol Doinyo Lengai: how much of the summit must turn white, once the peak stands its `height`. */
  whiteness?: number;
  /** For Kawah Ijen: how much must glow at once (in vertices of a planet of the drawn detail), for two minutes in all, to count as lit. */
  glow?: number;
  /** For Hunga Tonga: how many pressure waves. */
  rings?: number;
  /** For Mercury: how high (km) the far side's mountain must stand. */
  farKm?: number;
  /** For a world whose star crosses its sky: how fast (radians a second, about the sky's up). */
  sunTurns?: number;
  /** For the first world: how many stones of the rubble to catch. */
  gather?: number;
  /** For the orange Earth: how much oxygen life must breathe into the sky. */
  oxygen?: number;
  /** For Europa and Triton: how many chaos fields, or streaks, each apart from the others. */
  fields?: number;
  /** For a world with its star in the sky: which way it is, as seen (x right, y up, z towards us). */
  sun?: [number, number, number];
  /** For the rogue planet: how much living ground at once (in vertices of a planet of the drawn detail). */
  hearth?: number;
  /** For the world boiling away: how much it must grow, all told, despite what it loses (in the volume heat is reckoned in). */
  outbuild?: number;
  /** For the lava world: how much rock snow must fall (in the volume heat is reckoned in). */
  snowfall?: number;
  /** What kind of world it is, without its name: for a world of this kind round another star (see system.ts). */
  kind: string;
  /** For a world whose aim is height: how high, in km, and how many km a unit of the world's height stands for. */
  height?: { target: number; kmPerUnit: number };
  /** For a world whose aim is to make its surface new: the share of it. */
  cover?: number;
  /** For a world whose aim is to be round: how much of its first spread from round must go. */
  round?: number;
  /** For the tumbling moon: how much of its tumble (in %) must be calmed. */
  calm?: number;
  /** For the deep ocean: how much of the bank (in vertices of a planet of the drawn detail) must stand above the sea. */
  island?: number;
  /** For the lava lamp: how much must pool on the far shore. */
  pool?: number;
  /** For a world whose aim is great plumes: how many. */
  plumes?: number;
  /** For a world whose aim is a moon: how much rock it takes, thrown into orbit; or, feeding a giant's ring, how much the ring must hold at once. */
  orbit?: number;
  /** How far apart its contours are, in height (0.035 unless it says). */
  contour?: number;
}

export const WORLDS: World[] = [
  {
    id: 'mars',
    kind: 'A red world',
    numeral: 'I',
    title: 'Mars',
    first: 'Cold red ground under a thin, dusty sky.',
    then: 'With gravity this light, a volcano can stand higher than any on Earth.',
    second: 'Pour in one place again and again, and the mountain rises.',
    rules: {
      g: 0.38, // (Mars's gravity, Earth's being 1)
      terrain: 'mars', basins: 0, craters: 18, floor: 0.05, rough: 0.025,
      waves: 0, rain: 0, sink: 0, life: false,
      talus: 1.65, flow: 8, channel: 2, coolLand: 1, // (its gravity makes slopes stand steeper still; and it sets fast, so poured lava stacks into a mountain rather than running off)
      drift: 0, rises: 0, heat: 250, rising: 0.52, steady: true,
      impactEvery: [60, 100], impactWarning: 14, impactHeat: 6,
      stormEvery: [60, 100], stormWarning: 12, stormLasts: 22, stormWear: 0.006,
    },
    palette: {
      paper: '#ead3b4', basalt: '#a67a5c', ash: '#c9ad92', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#7a4a2e', landInkHigh: '#5a321c', pencil: '#cfae8e', seaInk: '#5b82a3',
    },
    goal: 'height',
    height: { target: 28, kmPerUnit: 40 },
  },
  {
    id: 'moon',
    kind: 'A grey moon',
    numeral: 'II',
    title: 'The Moon',
    first: 'Old, airless, and nearly cold.',
    then: 'These are its real basins. Lava flooded them once, and made the face we know.',
    second: 'Turn a basin uppermost and tip gently, and it fills dark.',
    rules: {
      g: 0.17, // (the Moon's gravity, Earth's being 1)
      terrain: 'moon', basins: 9, floor: 0.4, rough: 0.008, craters: 0,
      // (Its real heights, and its real seas, where they are and as wide (latitude, longitude, km): Imbrium,
      // Serenitatis, Tranquillitatis, Crisium, Nectaris, Fecunditatis, Nubium, Humorum, and Orientale on the edge.)
      real: 'moon', realScale: 0.04, realRadius: 1737,
      realBasins: [[33, -16, 550], [27, 18, 330], [8.5, 31, 350], [17, 59, 280], [-15, 35, 170], [-8, 51, 300], [-21, -17, 350], [-24, -39, 190], [-19, -95, 320]],
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 16, channel: 1, coolLand: 0.06,
      drift: 0, rises: 0.035, heat: 270, rising: 1.0, // (its seas lie close together, as the real ones do: less heat, so they're still a fire's work)
      impactEvery: [12, 22], impactWarning: 12, crater: 0.08, craterDepth: 0.05, impactHeat: 4, ageCraters: 0.12,
    },
    palette: {
      paper: '#e4e1da', basalt: '#9c9a95', ash: '#b9b6b0', lava: '#b8563c', deepLava: '#8f3b28', flooded: '#6f7074',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#55524d', landInkHigh: '#35332f', pencil: '#b6b2aa', seaInk: '#5b82a3',
    },
    goal: 'basins',
  },
  {
    id: 'ice',
    kind: 'An ice moon',
    numeral: 'III',
    title: 'An ice moon',
    first: 'A frozen shell over a hidden sea.',
    then: 'Here water is the lava, and it freezes into fresh white ice.',
    second: 'Tip the world to pour, and the old grey ice turns new.',
    rules: {
      g: 0.15, // (an icy moon, as Ganymede's gravity, Earth's being 1)
      terrain: 'ice', basins: 0, craters: 40, floor: 0.05, rough: 0.015,
      waves: 0, rain: 0, sink: 0, life: false,
      flow: 20, channel: 1, coolLand: 0.08,
      drift: 0, rises: 0.02, heat: 380, rising: 1.4, ashShare: 0.75,
      impactEvery: [50, 90], impactWarning: 12, impactHeat: 4, ageCraters: 0.06,
    },
    palette: {
      // Old ice grey with age and dust; new ice clean and white; water as it runs, blue.
      paper: '#d8dcd8', basalt: '#eef3f5', ash: '#fbfcfc', lava: '#7fb0c8', deepLava: '#5a8fae', flooded: '#f3f6f7',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#5a7080', landInkHigh: '#3c5463', pencil: '#b3bfc6', seaInk: '#5b82a3',
    },
    goal: 'cover',
    cover: 0.7,
    contour: 0.07,
  },
  {
    id: 'asteroid',
    kind: 'A lumpy asteroid',
    numeral: 'IV',
    title: 'A lumpy asteroid',
    first: 'A small rock with a little warmth inside.',
    then: 'Too small to pull itself round, it has stayed lumpy.',
    second: 'Turn a hollow uppermost and pour, and the world rounds.',
    rules: {
      g: 0.025, // (Vesta's gravity, Earth's being 1)
      terrain: 'asteroid', basins: 0, craters: 25, floor: 0.3, rough: 0.015, lumps: 0.15, selfGravity: 1,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 14, channel: 1, coolLand: 0.08,
      drift: 0, rises: 0.045, heat: 800, rising: 1.8, steady: true, pourLeast: 2.6, pourMost: 4, // (its heat rises fast, so tipped it pours faster, or tipping wouldn't drain it)
      impactEvery: [55, 95], impactWarning: 14, impactHeat: 4, ageCraters: 0.06,
    },
    palette: {
      // Dark old rock, a little brown; fresh lava paler basalt.
      paper: '#d3cbbd', basalt: '#a49a8c', ash: '#c2baae', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4f463c', landInkHigh: '#342c24', pencil: '#b2a796', seaInk: '#5b82a3',
    },
    goal: 'round',
    round: 0.31,
    contour: 0.05,
  },
  {
    id: 'rogue',
    kind: 'A world without a sun',
    numeral: 'V',
    title: 'A rogue planet',
    first: 'Dark and alone between the stars.',
    then: 'With no sun, the only warmth is from inside, and life gathers wherever new rock is still warm.',
    second: 'Pour, turn a little, and pour beside it, to keep warm ground alive.',
    rules: {
      terrain: 'rogue', basins: 0, craters: 14, floor: 0.05, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0,
      origin: 1e9, arrives: 0.5, hearth: 1.0, warmLasts: 160, reef: 0, wishes: false, // (life lands only near the vent, and lives only while the rock is warm)
      talus: 2.2, flow: 10, channel: 2, coolLand: 0.25,
      drift: 0, rises: 0.035, heat: 520, rising: 1.2, steady: true,
      impactEvery: [90, 140], impactWarning: 14, impactHeat: 6,
    },
    palette: {
      paper: '#cfd2d8', basalt: '#7d818c', ash: '#9da1ab', lava: '#c8603a', deepLava: '#9a4128',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#3d4250', landInkHigh: '#262a35', pencil: '#a3a8b4', seaInk: '#5b82a3',
    },
    goal: 'hearth',
    hearth: 1850,
  },
  {
    id: 'first',
    kind: 'A world still forming',
    numeral: 'VI',
    title: 'The first world',
    first: 'Molten all over, in a rain of rubble.',
    then: 'Planets grow by gathering the rubble round them: what lands in the molten rock becomes the world.',
    second: 'Turn the world so the glow is under each stone as it falls.',
    rules: {
      g: 0.6, // (a world still growing's gravity, Earth's being 1)
      terrain: 'first', basins: 0, craters: 30, floor: 0.05, rough: 0.025,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      magma: 0.012, impactMelt: 0.02, // (molten at first, crusting over as it cools; each stone melts its crater again)
      talus: 2.2, flow: 10, channel: 2, coolLand: 0.05,
      drift: 0, rises: 0.07, heat: 300, rising: 1.0, steady: true,
      impactEvery: [9, 15], impactWarning: 11, impactNear: 0.75, impactHeat: 3, crater: 0.07, craterDepth: 0.04,
    },
    palette: {
      paper: '#d9cbb8', basalt: '#8a7a6c', ash: '#a69888', lava: '#c25a36', deepLava: '#94402a',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4f3e30', landInkHigh: '#33271c', pencil: '#b9a892', seaInk: '#5b82a3',
    },
    goal: 'gather',
    gather: 10,
  },
  {
    id: 'young',
    kind: 'A young world',
    numeral: 'VII',
    title: 'A young Earth',
    first: 'Hot and new, with no moon yet.',
    then: 'Here, rock thrown fast enough doesn’t fall back, but circles and gathers.',
    second: 'Let the pressure build, then tip, and a moon begins to gather.',
    rules: {
      terrain: 'young', basins: 0, craters: 25, floor: 0.05, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2.2, flow: 9, channel: 2, coolLand: 0.2,
      drift: 0, rises: 0, heat: 420, rising: 1.0, steady: true,
      cap: 12, lid: 15, orbitShare: 0.6,
      impactEvery: [45, 75], impactWarning: 14, impactHeat: 6,
    },
    palette: {
      paper: '#ddd3c2', basalt: '#8f8377', ash: '#9a9088', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4e3f33', landInkHigh: '#33271d', pencil: '#b8aa96', seaInk: '#5b82a3',
    },
    goal: 'orbit',
    orbit: 75,
  },
  {
    id: 'archean',
    kind: 'A young blue world, its sky still orange',
    numeral: 'VIII',
    title: 'The orange Earth',
    first: 'Shallow green seas under an orange sky.',
    then: 'For two billion years Earth had no oxygen, until life in the shallows breathed it out, and the sky turned blue.',
    second: 'Pour a shallow shelf, then turn and pour the next, and leave each to life.',
    rules: {
      drift: 0, rises: 0.03, heat: 420, rising: 1.3, steady: true, sink: 0,
      breathe: 0.06, arrives: 1, hearth: 1.2, // (mats drift in and settle on any shallows near the fire)
    },
    palette: {
      paper: '#e2d6bd', basalt: '#8a8072', ash: '#a59a88', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#c8d8c4', deep: '#9fb8b0',
      landInk: '#4f463a', landInkHigh: '#332d25', pencil: '#b4a891', seaInk: '#4f7a78',
    },
    goal: 'oxygen',
    oxygen: 600,
  },
  {
    id: 'snowball',
    kind: 'A frozen world',
    numeral: 'IX',
    title: 'Snowball Earth',
    first: 'Ice from pole to pole, as Earth once was.',
    then: 'It thawed because volcanoes breathed out gas that warmed the sky, until the ice gave way.',
    second: 'Build up through the ice, then let the gas out into the sky.',
    rules: {
      drift: 0, rises: 0, heat: 420, rising: 1.3, steady: true, sink: 0,
      gas: 1, gasPour: 0.35, drawdown: 0.012, thawAt: 100,
    },
    palette: {
      paper: '#e6e0d2', basalt: '#8a8478', ash: '#a39d92', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#c9dde8', deep: '#9fbcd0',
      landInk: '#4f4a40', landInkHigh: '#332f28', pencil: '#b4ab9a', seaInk: '#4f7898',
    },
    goal: 'thaw',
  },
  {
    id: 'ocean',
    kind: 'An ocean world',
    numeral: 'X',
    title: 'An ocean world',
    first: 'Open water, and a fire far below.',
    then: 'The sea floor drifts over the fire, leaving a trail of islands.',
    second: 'Tip the world as the fire moves, and islands rise along the line.',
    rules: { drift: 0.0125, rises: 0, heat: 740, rising: 1.4, steady: true, reseed: 15, floor: -0.22, sink: 0.00015, impactEvery: [60, 100], atolls: true },
    palette: {
      paper: '#ecdfc2', basalt: '#9a8a76', ash: '#b3ada2', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#6b4a2e', landInkHigh: '#4a2f1c', pencil: '#b9a68c', seaInk: '#5b82a3',
    },
    goal: 'ring',
  },
  {
    id: 'lengai',
    kind: 'A volcano of black lava that turns white',
    numeral: 'XI',
    title: 'Ol Doinyo Lengai',
    first: 'The only volcano whose lava runs black and turns white.',
    then: 'Its lava is cool and thin as oil; set, it turns white within days, so the mountain looks snow-capped near the equator.',
    second: 'Build the peak, then hold still and let it turn white.',
    rules: {
      terrain: 'young', basins: 0, craters: 0, floor: 0.05, rough: 0.025,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2, flow: 12, channel: 2, coolLand: 1.2, // (carbonatite: thin as oil, but cool, so it sets soon, in narrow tongues)
      drift: 0, rises: 0, heat: 380, rising: 1.3, steady: true,
      whiteAt: 30, whiteReach: 0.55, cap: 75, // (the cone holds a long breath: time for the summit to whiten)
      impactEvery: [0, 0],
    },
    palette: {
      paper: '#e3d6bd', basalt: '#5d554c', ash: '#c9bda8', lava: '#3a332d', deepLava: '#221d19', flooded: '#f7f4ec',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#5a4632', landInkHigh: '#3b2c1e', pencil: '#c4b294', seaInk: '#5b82a3',
    },
    goal: 'white',
    height: { target: 28, kmPerUnit: 40 },
    whiteness: 0.9,
  },
  {
    id: 'ijen',
    kind: 'A crater of blue fire',
    numeral: 'XII',
    title: 'Kawah Ijen',
    first: 'An acid lake in a crater, and blue fire at night.',
    then: 'Its gas comes out so hot it burns as it meets the air, and molten sulphur runs downhill in blue flame.',
    second: 'Pour thin and wide, and keep the night lit.',
    rules: {
      terrain: 'young', basins: 0, craters: 6, floor: 0.05, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2, flow: 18, channel: 1, coolLand: 0.45,
      drift: 0, rises: 0.03, heat: 380, rising: 1.3, steady: true,
      burns: 25,
      impactEvery: [0, 0],
    },
    palette: {
      paper: '#cfd3d6', basalt: '#7f8790', ash: '#c9c27a', lava: '#4d8fd1', deepLava: '#2d5f9a',
      shallow: '#bfe0d8', deep: '#8fc4bb',
      landInk: '#3d4652', landInkHigh: '#262d36', pencil: '#a3abb4', seaInk: '#4f8a84',
    },
    goal: 'glow',
    glow: 1400,
  },
  {
    id: 'tonga',
    kind: 'A volcano under the sea',
    numeral: 'XIII',
    title: 'Hunga Tonga',
    first: 'An undersea volcano in the South Pacific.',
    then: 'In 2022 it erupted just under the sea, and its shock went round the whole Earth four times.',
    second: 'Build the cone almost to the surface, then burst.',
    rules: {
      drift: 0, rises: 0, heat: 420, rising: 1.3, steady: true, sink: 0,
      wave: 0.08, waveDig: 0.3, ashShare: 0.3,
    },
    palette: {
      paper: '#e8dfcc', basalt: '#8d8478', ash: '#b0a99d', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#c6d9e6', deep: '#8aa9c1',
      landInk: '#5a4632', landInkHigh: '#3b2c1e', pencil: '#b3a68f', seaInk: '#3f6787',
    },
    goal: 'waves',
    rings: 12,
  },
  {
    id: 'io',
    kind: 'A tidal moon',
    numeral: 'XIV',
    title: 'Io',
    first: 'A yellow moon, never still.',
    then: 'The giant’s pull squeezes it as it circles, so its heat comes in tides.',
    second: 'Tip at high tide, and a great plume rises.',
    rules: {
      g: 0.18, // (Io's gravity, Earth's being 1)
      terrain: 'io', basins: 0, craters: 0, floor: 0.05, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 12, channel: 2, coolLand: 0.15,
      drift: 0, rises: 0.03, heat: 520, rising: 1.2, steady: true, tide: 0.9, tidePeriod: 50, tideThrow: 0.7,
      ashShare: 0.8, ashRing: 2.0, great: 18, plumesApart: 0.5,
      impactEvery: [0, 0],
    },
    palette: {
      // Sulphur yellow, red rings where the plumes fall, fresh lava dark.
      paper: '#ece0a6', basalt: '#a8875a', ash: '#c4603a', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#7a5a22', landInkHigh: '#55390f', pencil: '#c8b478', seaInk: '#5b82a3',
    },
    goal: 'plumes',
    plumes: 8,
  },
  {
    id: 'europa',
    kind: 'An ice moon with a sea beneath',
    numeral: 'XV',
    title: 'Europa',
    first: 'Smooth ice over a deep salt sea.',
    then: 'Where warm water rises beneath it, the ice breaks into rafts that drift and freeze again: chaos terrain.',
    second: 'Hold, and lift before the smoke turns grey: the ice breaks into rafts.',
    rules: {
      g: 0.13, // (Europa's gravity, Earth's being 1)
      terrain: 'ice', basins: 0, craters: 6, floor: 0.05, rough: 0.012,
      waves: 0, rain: 0, sink: 0, life: false,
      flow: 20, channel: 1, coolLand: 0.08,
      drift: 0, rises: 0.03, heat: 380, rising: 1.4, ashShare: 0.75, explosive: 9,
      chaos: 5, plumesApart: 0.55, // (let out between 5 and the burst point, the heat breaks the ice; a burst doesn't)
      impactEvery: [80, 120], impactWarning: 12, impactHeat: 4,
    },
    palette: {
      paper: '#e6dccb', basalt: '#f1f2ee', ash: '#f7f6f2', lava: '#8fb6c6', deepLava: '#6a98ae', flooded: '#f4f3ee',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#7a5a46', landInkHigh: '#5a3e2e', pencil: '#c6b29c', seaInk: '#5b82a3',
    },
    goal: 'chaos',
    fields: 10,
    contour: 0.07,
  },
  {
    id: 'enceladus',
    kind: 'A small ice moon',
    numeral: 'XVI',
    title: 'Enceladus',
    first: 'A small moon of ice, circling a ringed giant.',
    then: 'Its ice drifts out to become the giant’s ring.',
    second: 'Tip toward the giant, and the ring grows.',
    rules: {
      g: 0.011, // (Enceladus's gravity, Earth's being 1)
      terrain: 'ice', basins: 0, craters: 30, floor: 0.05, rough: 0.012,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 20, channel: 1, coolLand: 0.08,
      drift: 0, rises: 0, heat: 380, rising: 1.0, steady: true, ashShare: 0.75,
      ringShare: 0.8, ringAim: 0.7, ringThins: 0.003,
      impactEvery: [50, 90], impactWarning: 12, impactHeat: 4, ageCraters: 0.04,
    },
    palette: {
      // Brilliant fresh ice, bluer in the cracks; water as it runs, blue.
      paper: '#e3e7e8', basalt: '#f4f8f9', ash: '#fdfefe', lava: '#7fb0c8', deepLava: '#5a8fae', flooded: '#f6f9fa',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#56707e', landInkHigh: '#38525f', pencil: '#b3c0c7', seaInk: '#5b82a3',
    },
    goal: 'feed',
    orbit: 100,
    contour: 0.07,
  },
  {
    id: 'triton',
    kind: 'A frozen moon going round backwards',
    numeral: 'XVII',
    title: 'Triton',
    first: 'Pink nitrogen ice, far from a faint sun.',
    then: 'Where sunlight warms the ice, geysers rise, and thin winds blow their dark plumes into long streaks.',
    second: 'Hold until the sun is over the vent, and lift: a geyser.',
    rules: {
      g: 0.08, // (Triton's gravity, Earth's being 1)
      terrain: 'triton', basins: 0, craters: 8, floor: 0.05, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2.2, flow: 9, channel: 2, coolLand: 0.3,
      drift: 0, rises: 0.04, heat: 400, rising: 1.3, steady: true,
      streak: 0.55, plumesApart: 0.35,
      impactEvery: [90, 140], impactWarning: 14, impactHeat: 6,
    },
    palette: {
      paper: '#ecd9d2', basalt: '#b09d98', ash: '#7d6a64', lava: '#9a6a5c', deepLava: '#6e4a40',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#6a4a44', landInkHigh: '#4a302b', pencil: '#cdb3aa', seaInk: '#5b82a3',
    },
    sun: [0.75, 0.25, 0.6],
    sunTurns: 0.05,
    goal: 'streaks',
    fields: 8,
  },
  {
    id: 'tumble',
    kind: 'A tumbling moon',
    numeral: 'XVIII',
    title: 'A tumbling moon',
    first: 'A battered moon, rolling end over end.',
    then: 'Knocked askew long ago, it has never settled into a steady spin.',
    second: 'Erupt where the ground sweeps past, and the tumbling slows.',
    rules: {
      g: 0.002, // (Hyperion's gravity, Earth's being 1)
      // As Hyperion tumbles: slowly, but never settling. The heat rises to whatever is uppermost, so as
      // the moon rolls the vent wanders, and pours break out wherever it tips.
      terrain: 'moon', basins: 0, craters: 30, floor: 0.05, rough: 0.02,
      // (Airless, as the other moons are: it grew life, a sea and rain without these.)
      waves: 0, rain: 0, sink: 0, swell: 0, life: false, drift: 0,
      rises: 0.03, heat: 560, rising: 1.3, steady: true, impactEvery: [70, 110],
      tumble: 0.3, tumbleGrow: 0.0025, tumbleKick: 0.4,
    },
    palette: {
      // Pale, porous rock, a little warm.
      paper: '#e2dccd', basalt: '#9d968a', ash: '#bcb6aa', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#5e554a', landInkHigh: '#3f372e', pencil: '#b8ae9e', seaInk: '#5b82a3',
    },
    goal: 'calm',
    calm: 85,
  },
  {
    id: 'mercury',
    kind: 'A small scorched world',
    numeral: 'XIX',
    title: 'Mercury',
    first: 'Small, scorched, and wrinkled as it cooled.',
    then: 'When a great stone struck it, the shock went through the whole world and broke the ground on the far side.',
    second: 'Burst here, and a moment later the far side breaks open.',
    rules: {
      g: 0.38, // (Mercury's gravity, Earth's being 1)
      terrain: 'moon', basins: 0, craters: 45, floor: 0.22, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2.2, flow: 9, channel: 2, coolLand: 0.25,
      drift: 0, rises: 0, heat: 420, rising: 1.3, steady: true,
      antipode: 0.35, antipodeDelay: 6,
      impactEvery: [60, 100], impactWarning: 12, impactHeat: 4, ageCraters: 0.08,
    },
    palette: {
      paper: '#ddd8cf', basalt: '#948e85', ash: '#aaa49b', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4d4943', landInkHigh: '#302d29', pencil: '#b2aca2', seaInk: '#5b82a3',
    },
    goal: 'antipode',
    farKm: 30,
  },
  {
    id: 'magma',
    kind: 'A lava world',
    numeral: 'XX',
    title: 'A lava world',
    first: 'One face always to its star, and that face molten.',
    then: 'On worlds like this, rock boils into the air on the day side and falls as rock snow in the night.',
    second: 'Turn the vent into the starlight, and pour.',
    rules: {
      g: 2.3, // (55 Cancri e, a super-Earth's gravity, Earth's being 1)
      terrain: 'magma', basins: 0, craters: 8, floor: 0.1, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 14, channel: 1, coolLand: 0.3, dayCool: 0.04, vapour: 0.05,
      drift: 0, rises: 0, heat: 420, rising: 1.2, steady: true,
      impactEvery: [90, 140], impactWarning: 14, impactHeat: 6,
    },
    palette: {
      paper: '#d9d2c8', basalt: '#7e766c', ash: '#efece6', lava: '#c25a36', deepLava: '#94402a',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4a4038', landInkHigh: '#2f2822', pencil: '#b5aa9c', seaInk: '#5b82a3',
    },
    sun: [0.88, 0.25, -0.4],
    goal: 'snow',
    snowfall: 170,
  },
  {
    id: 'dust',
    kind: 'A world boiling away',
    numeral: 'XXI',
    title: 'A disintegrating planet',
    first: 'So close to its star that it is boiling away.',
    then: 'Worlds like this trail a tail of dust, like a comet, and grow smaller every orbit.',
    second: 'Turn the vent into the night, and pour there.',
    rules: {
      g: 0.1, // (a small world boiling away's gravity, Earth's being 1)
      terrain: 'dust', basins: 0, craters: 10, floor: 0.3, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      talus: 2.2, flow: 9, channel: 2, coolLand: 0.3,
      drift: 0, rises: 0, heat: 420, rising: 1.2, steady: true,
      boil: 0.03,
      impactEvery: [90, 140], impactWarning: 14, impactHeat: 6,
    },
    palette: {
      paper: '#e3cdb0', basalt: '#9a7a62', ash: '#c4a98c', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#6e4630', landInkHigh: '#4c2d1c', pencil: '#cdb08f', seaInk: '#5b82a3',
    },
    sun: [0.9, 0.2, 0.25],
    goal: 'outbuild',
    outbuild: 350,
  },
  {
    id: 'spin',
    kind: 'A spinning world',
    numeral: 'XXII',
    title: 'A spinning world',
    first: 'Turning fast, swollen at its middle.',
    then: 'Its spin flings whatever flows out toward its middle.',
    second: 'Pour, and a ridge rises all the way round its middle.',
    rules: {
      g: 0.04, // (Haumea's gravity, Earth's being 1)
      terrain: 'spin', basins: 0, craters: 25, floor: 0.05, rough: 0.015, bulge: 0.08, spin: 2.5, ridge: 0.07,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 10, channel: 2, coolLand: 0.12,
      drift: 0, rises: 0.04, heat: 520, rising: 1.2, steady: true,
      impactEvery: [55, 95], impactWarning: 14, impactHeat: 5,
    },
    palette: {
      // Pale slate, as of a world of ice and rock; fresh lava grey.
      paper: '#d9dce0', basalt: '#9ea4ad', ash: '#c4c8ce', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4a5260', landInkHigh: '#2f3642', pencil: '#aab1bc', seaInk: '#5b82a3',
    },
    goal: 'ridge',
    height: { target: 0, kmPerUnit: 40 },
  },
  {
    id: 'deep',
    kind: 'A deep ocean world',
    numeral: 'XXIII',
    title: 'A deep ocean world',
    first: 'Cold, dark water, with fire on the sea floor.',
    then: 'Lava cools fast in deep water, but inside its own crust it stays hot and runs on.',
    second: 'Pour toward the bank again and again, and an island rises there.',
    rules: {
      terrain: 'ocean', floor: -0.45, sink: 0, swell: 0,
      // (Life comes to the island only once it's risen, as it came to Surtsey: from elsewhere, not at the vents; and no reefs.)
      origin: 1e9, arrives: 20, reef: 0, wishes: false,
      drift: 0, rises: 0, heat: 450, rising: 1.2, steady: true,
      tubes: 0.02, tubeFresh: 40, bankFar: 0.52, selfGravity: 0, breakout: 0, // (here the tilt steers, aimed at the bank; and the lava runs on in its tubes, without breaking out)
      impactEvery: [60, 100],
    },
    palette: {
      paper: '#e8dfcc', basalt: '#8d8478', ash: '#b0a99d', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#c6d9e6', deep: '#8aa9c1',
      landInk: '#5a4632', landInkHigh: '#3b2c1e', pencil: '#b3a68f', seaInk: '#3f6787',
    },
    goal: 'bank',
    island: 90,
  },
  {
    id: 'lamp',
    kind: 'A world of glass',
    numeral: 'XXIV',
    title: 'A world of glass',
    first: 'Glass, and glowing rock that rises.',
    then: 'Hot rock here is lighter than the deep, so it floats.',
    second: 'Turn the far shore uppermost, and warm blobs drift to it.',
    rules: {
      terrain: 'glass', basins: 0, craters: 0, floor: 0.05, rough: 0.004,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      lamp: true, blobSpeed: 0.07, blobHot: 45,
      drift: 0, rises: 0, heat: 400, rising: 1.0, steady: true,
      impactEvery: [0, 0],
    },
    palette: {
      // Lilac glass; the blobs glowing orange, deepening to red as they cool.
      paper: '#ddd6e3', basalt: '#ddd6e3', ash: '#ddd6e3', lava: '#ea7a3a', deepLava: '#9c3a2a',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#5a4f6b', landInkHigh: '#3e3450', pencil: '#b9afc7', seaInk: '#5b82a3',
    },
    goal: 'lamp',
    pool: 140,
  },
];

/**
 * The worlds in five chapters, each teaching one thing (see the README): pouring and turning; one
 * world through its ages (ages.ts); Earth's strangest real volcanoes; bursts; and placing and
 * steering, last the lava lamp.
 */
export const CHAPTERS: { numeral: string; title: string; worlds: WorldId[] }[] = [
  { numeral: 'I', title: 'Our neighbours', worlds: ['mars', 'moon', 'ice', 'asteroid', 'rogue'] },
  { numeral: 'II', title: 'One world, through time', worlds: ['first', 'young', 'archean', 'snowball', 'ocean'] },
  { numeral: 'III', title: 'Strange fires', worlds: ['lengai', 'ijen', 'tonga'] },
  { numeral: 'IV', title: 'Pressure', worlds: ['io', 'europa', 'enceladus', 'triton', 'tumble', 'mercury'] },
  { numeral: 'V', title: 'Far worlds', worlds: ['magma', 'dust', 'spin', 'deep', 'lamp'] },
];

/** The chapter a world is in. */
export function chapterOf(id: WorldId): (typeof CHAPTERS)[number] {
  return CHAPTERS.find((c) => c.worlds.includes(id)) ?? CHAPTERS[0];
}

export function worldOf(id: string | null | undefined): World {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}

/** The world after this one, if there is one. */
export function nextWorld(w: World): World | null {
  const i = WORLDS.indexOf(w);
  return i >= 0 && i + 1 < WORLDS.length ? WORLDS[i + 1] : null;
}
