/**
 * The trees, in sequence, as the volcano has its worlds: each with its own physics (its rules), a
 * card (numeral, name, a mood line, one true fact, one line on what to do) and, in place of aims,
 * two calm lines: nothing can go wrong, and it ends when you let it rest.
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
  /** No aims: a line on the calm of it, and one on how it ends. */
  calm: string;
  rest: string;
  rules: Partial<Rules>;
}

export const TREES: Tree[] = [
  {
    id: 'oak',
    numeral: 'I',
    name: 'Oak on a Hill',
    latin: 'Quercus robur',
    mood: 'Sun from the south, and the seasons keep their time.',
    fact: 'Each ring is a year: pale wood laid down in spring, dark wood in late summer. Here each ring you paint is five.',
    todo: 'Paint each ring in one stroke round the last: slow for wide wood, quick for thin.',
    calm: 'Nothing can go wrong. The colours run and fade; the tree keeps growing.',
    rest: 'Let it rest whenever you like.',
    // (Steady seasons: rain, drought, wind and frost now and then, and two fires on the slope.)
    rules: {},
  },
];

export function treeOf(id: string | null | undefined): Tree {
  return TREES.find((t) => t.id === id) ?? TREES[0];
}
