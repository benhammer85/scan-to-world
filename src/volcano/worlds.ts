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
 *   VIII A young Earth, with no moon yet: its cone holds the pressure down, the taller the more,
 *       and the biggest bursts throw rock clear into orbit, where it gathers into a moon.
 */
import type { Rules } from './sim';

export type WorldId = 'ocean' | 'moon' | 'mars' | 'ice' | 'io' | 'enceladus' | 'asteroid' | 'young';

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
  goal: 'ring' | 'basins' | 'height' | 'cover' | 'plumes' | 'feed' | 'round' | 'orbit';
  /** What kind of world it is, without its name: for a world of this kind round another star (see system.ts). */
  kind: string;
  /** For a world whose aim is height: how high, in km, and how many km a unit of the world's height stands for. */
  height?: { target: number; kmPerUnit: number };
  /** For a world whose aim is to make its surface new: the share of it. */
  cover?: number;
  /** For a world whose aim is to be round: how much of its first spread from round must go. */
  round?: number;
  /** For a world whose aim is great plumes: how many. */
  plumes?: number;
  /** For a world whose aim is a moon: how much rock it takes, thrown into orbit; or, feeding a giant's ring, how much the ring must hold at once. */
  orbit?: number;
  /** How far apart its contours are, in height (0.035 unless it says). */
  contour?: number;
}

export const WORLDS: World[] = [
  {
    id: 'ocean',
    kind: 'An ocean world',
    numeral: 'I',
    title: 'An ocean world',
    first: 'A young ocean world, with heat beneath it that won’t last.',
    then: 'The heat travels along the dotted line on its own. Keep building islands as it goes, and keep them alive: a gap breaks the chain. Hold the world level and pressure builds; tip it and lava pours out; tip it when the smoke is heavy and it erupts.',
    second: 'Big islands leave atolls when they sink: spend the heat on a few big ones, or spread it thin to keep the chain whole.',
    rules: { drift: 0.0125, rises: 0, heat: 740, rising: 1.4, steady: true, reseed: 15, floor: -0.22, impactEvery: [60, 100], atolls: true },
    palette: {
      paper: '#ecdfc2', basalt: '#9a8a76', ash: '#b3ada2', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#6b4a2e', landInkHigh: '#4a2f1c', pencil: '#b9a68c', seaInk: '#5b82a3',
    },
    goal: 'ring',
  },
  {
    id: 'moon',
    kind: 'A grey moon',
    numeral: 'II',
    title: 'The Moon',
    first: 'The Moon: old, airless, and nearly cold.',
    then: 'Lava here runs like water and fills low ground. Turn a dotted basin to the top and wait: the heat creeps under it, and the smoke rises there. Then tip gently to pour until it\'s full, and turn the next one up. Flood all four before the heat runs out.',
    second: 'Lava spilled outside a basin is wasted: the neater the seas, the better.',
    rules: {
      terrain: 'moon', basins: 4, floor: 0.22, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 16, channel: 1, coolLand: 0.06,
      drift: 0, rises: 0.035, heat: 400, rising: 1.48,
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
    id: 'mars',
    kind: 'A red world',
    numeral: 'III',
    title: 'Mars',
    first: 'Mars: cold, red, and still.',
    then: 'The heat stays in one place, so the mountain grows over it. A tall mountain needs a wide base. Dust storms wear it down, loose ash most of all, so cover ash with lava before a storm arrives. Raise the mountain 28 km high.',
    second: 'A narrow peak rises fastest; a broad base lasts.',
    rules: {
      terrain: 'mars', basins: 0, craters: 18, floor: 0.05, rough: 0.025,
      waves: 0, rain: 0, sink: 0, life: false,
      talus: 2.2, flow: 8, channel: 2, coolLand: 0.25,
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
    id: 'ice',
    kind: 'An ice moon',
    numeral: 'IV',
    title: 'An ice moon',
    first: 'An ice moon: a frozen shell over a hidden sea.',
    then: 'Here water is the lava and ice is the rock. The heat rises to whatever you turn to the top; tip the world to pour. Bursts throw frost far across the ice. Make 35% of the surface new before the heat runs out.',
    second: 'New ice everywhere, or one great sheet?',
    rules: {
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
    cover: 0.35,
    contour: 0.07,
  },
  {
    id: 'io',
    kind: 'A tidal moon',
    numeral: 'V',
    title: 'Io',
    first: 'Io: a moon kneaded by the giant planet it circles.',
    then: 'Its heat comes in tides: slow, then fast, then slow again. At high tide the smoke thickens fast, and a burst throws far further: burst at the height of it, and the plume throws a great ring of sulphur. At low tide a burst only fizzles, so move the heat then, outside the dotted rings. Raise 8 great plumes, each on fresh ground.',
    second: 'One great plume as wide as it can be, or many?',
    rules: {
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
    id: 'enceladus',
    kind: 'A small ice moon',
    numeral: 'VI',
    title: 'Enceladus',
    first: 'Enceladus: a small ice moon of a ringed giant.',
    then: 'Its plumes feed the giant\'s ring, and the ring thins away unless it\'s fed. When the smoke is heavy, tip the world towards the giant, at the top left: its ring darkens when you\'re aimed right, and the burst flies into it. Tipped any other way, it falls back as frost. Fill the ring.',
    second: 'Feed the ring, or frost the moon white?',
    rules: {
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
    id: 'asteroid',
    kind: 'A lumpy asteroid',
    numeral: 'VII',
    title: 'A lumpy asteroid',
    first: 'A lumpy asteroid, with a little heat inside it.',
    then: 'On so small a world, lava runs to its own low places, wherever it comes out. Turn a hollow to the top and wait: the heat creeps under it. Then tip gently to pour, and fill it. The deepest hollows are stippled. Fill them until the asteroid is 45% rounder. A burst piles rock where you are.',
    second: 'Keep the lava in the hollows: the neater, the better.',
    rules: {
      terrain: 'asteroid', basins: 0, craters: 25, floor: 0.3, rough: 0.015, lumps: 0.15, selfGravity: 1,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 14, channel: 1, coolLand: 0.08,
      drift: 0, rises: 0.045, heat: 800, rising: 1.8, steady: true,
      impactEvery: [55, 95], impactWarning: 14, impactHeat: 4, ageCraters: 0.06,
    },
    palette: {
      // Dark old rock, a little brown; fresh lava paler basalt.
      paper: '#d3cbbd', basalt: '#a49a8c', ash: '#c2baae', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#4f463c', landInkHigh: '#342c24', pencil: '#b2a796', seaInk: '#5b82a3',
    },
    goal: 'round',
    round: 0.45,
    contour: 0.05,
  },
  {
    id: 'young',
    kind: 'A young world',
    numeral: 'VIII',
    title: 'A young Earth',
    first: 'A young Earth, hot, and with no moon yet.',
    then: 'Here the cone holds the pressure down: the taller it stands, the more it can hold, and the more a burst throws. Build it up, then hold the world level as long as you dare and tip it: the rock that flies clear goes into orbit. Held too long, the cone blows apart and throws nothing. Throw up enough rock to make a moon.',
    second: 'How big a moon? Bigger bursts throw more, but risk the cone.',
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
    orbit: 100,
  },
];

export function worldOf(id: string | null | undefined): World {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}

/** The world after this one, if there is one. */
export function nextWorld(w: World): World | null {
  const i = WORLDS.indexOf(w);
  return i >= 0 && i + 1 < WORLDS.length ? WORLDS[i + 1] : null;
}
