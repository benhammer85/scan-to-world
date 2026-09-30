/**
 * The worlds, one after another: the same heat and the same hands, but each world its own
 * physics, its own aim, and its own way of being drawn, as each has its own kind of volcanism.
 *
 *   I   An ocean world: the crust drifts over the heat, and a chain of islands is left behind it.
 *       Carry the chain, living, all the way round.
 *   II  The Moon: no air, no water, no drift, and stones falling all the while; lava so fluid it
 *       floods the low ground rather than building mountains. Flood the great basins into seas.
 *   III Mars: no drift, so the heat stays in one place, as it did under the great Martian
 *       volcanoes, and gravity weak enough for slopes to stand steep; thin air, and dust storms
 *       that scour the heights, soft ash most. Raise the great mountain to its height.
 */
import type { Rules } from './sim';

export type WorldId = 'ocean' | 'moon' | 'mars';

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
  palette: Palette;
  goal: 'ring' | 'basins' | 'height';
  /** For a world whose aim is height: how high, in km, and how many km a unit of the world's height stands for. */
  height?: { target: number; kmPerUnit: number };
}

export const WORLDS: World[] = [
  {
    id: 'ocean',
    numeral: 'I',
    title: 'An ocean world',
    first: 'A young ocean world, with heat beneath it that won’t last.',
    then: 'The sea floor drifts slowly over the heat. Hold the world level and pressure builds; tip it and lava pours out; tip it when the smoke is heavy and it erupts. Build living islands along the dotted line, all the way round, before the heat runs out.',
    rules: { drift: 0.0065, rises: 0, heat: 740, floor: -0.22, impactEvery: [90, 150] },
    palette: {
      paper: '#ecdfc2', basalt: '#9a8a76', ash: '#b3ada2', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#6b4a2e', landInkHigh: '#4a2f1c', pencil: '#b9a68c', seaInk: '#5b82a3',
    },
    goal: 'ring',
  },
  {
    id: 'moon',
    numeral: 'II',
    title: 'The Moon',
    first: 'The Moon: old, airless, and nearly cold.',
    then: 'Lava here runs like water and fills low ground. The heat rises to whatever you turn to the top; tip the world to pour. Flood each dotted basin before the heat runs out.',
    rules: {
      terrain: 'moon', basins: 5, floor: 0.22, rough: 0.02,
      waves: 0, rain: 0, sink: 0, swell: 0, life: false,
      flow: 16, channel: 1, coolLand: 0.06,
      drift: 0, rises: 0.02, heat: 400, rising: 1.3,
      impactEvery: [12, 22], impactWarning: 12, crater: 0.08, craterDepth: 0.05, impactHeat: 4,
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
    numeral: 'III',
    title: 'Mars',
    first: 'Mars: cold, red, and still.',
    then: 'The heat stays in one place, so the mountain grows over it. A tall mountain needs a wide base. Dust storms wear it down, loose ash most of all, so cover ash with lava before a storm arrives. Raise the mountain 26 km high.',
    rules: {
      terrain: 'mars', basins: 0, craters: 18, floor: 0.05, rough: 0.025,
      waves: 0, rain: 0, sink: 0, life: false,
      talus: 2.2, flow: 8, channel: 2, coolLand: 0.25,
      drift: 0, rises: 0, heat: 250, rising: 1.3,
      impactEvery: [60, 100], impactWarning: 14, impactHeat: 6,
      stormEvery: [60, 100], stormWarning: 12, stormLasts: 22, stormWear: 0.02,
    },
    palette: {
      paper: '#ead3b4', basalt: '#a67a5c', ash: '#c9ad92', lava: '#b8563c', deepLava: '#8f3b28',
      shallow: '#d4e3ec', deep: '#b1c8d8',
      landInk: '#7a4a2e', landInkHigh: '#5a321c', pencil: '#cfae8e', seaInk: '#5b82a3',
    },
    goal: 'height',
    height: { target: 26, kmPerUnit: 40 },
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
