/**
 * The trees, in sequence, as the volcano has its worlds: each with its own physics (its rules), a
 * card (numeral, name, a mood line, one true fact, one line on what to do), a first aim and a second
 * aim that pulls against it.
 *
 * Only the oak is built so far. Those to come, each with what will set it apart:
 *   II   a redwood, that fires come through and it outlives;
 *   III  a bristlecone, ringed by drought, thousands of years on a mountain;
 *   IV   a mangrove, worked by the tides;
 *   V    an olive, pruned by people;
 *   VI   a birch, fast and fragile.
 */
import type { Rules } from './tree';

export type TreeId = 'oak';

export interface Tree {
  id: TreeId;
  numeral: string;
  name: string;
  /** Its botanical name, as a plate gives it. */
  latin: string;
  /** The mood, in a line. */
  mood: string;
  /** One true thing about such a tree. */
  fact: string;
  /** What to do, in a line. */
  todo: string;
  /** The first aim: live this many years. */
  years: number;
  /** The second aim, which pulls against the first. */
  second: string;
  rules: Partial<Rules>;
}

export const TREES: Tree[] = [
  {
    id: 'oak',
    numeral: 'I',
    name: 'Oak on a Hill',
    latin: 'Quercus robur',
    mood: 'Sun from the south, and the seasons keep their time.',
    fact: 'Each ring is a year: pale wood laid down in spring, dark wood in late summer.',
    todo: 'Let the sap gather, then tip it toward the shaded side.',
    years: 300,
    second: 'And keep the slice even: round, and its rings alike.',
    // (Steady seasons: rain and drought now and then, and the rare fire, which on a slope burns the uphill side.)
    rules: {},
  },
];

export function treeOf(id: string | null | undefined): Tree {
  return TREES.find((t) => t.id === id) ?? TREES[0];
}
