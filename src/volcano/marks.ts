/**
 * Marks: up to three small marks on a world's plate for how it was done, once its aim is met.
 * Not a score: each is a plain thing you did or didn't do, and once earned it stays.
 *
 *   heat left: the aim met with a share of the heat still below;
 *   no setbacks: the mountain never blew apart, nor the ground fell in;
 *   in time: the aim met within a few unhurried minutes.
 *
 * The shares and minutes were set by letting the skilled bot play every world (bots/), then asking
 * a little less of the heat (about six tenths of what it kept) and a little more of the time (about
 * a third more than it took, in whole minutes), so a calm, careful game earns them.
 */
import type { WorldId } from './worlds';

export type Marks = [boolean, boolean, boolean];

/** For each world: the share of heat to have left (in hundredths: a half, third, quarter, fifth or tenth), and the minutes to be done within. */
export const MARK_AT: Record<WorldId, { heat: number; minutes: number }> = {
  first: { heat: 33, minutes: 5 },
  ocean: { heat: 20, minutes: 7 },
  moon: { heat: 25, minutes: 4 },
  mars: { heat: 25, minutes: 4 },
  ice: { heat: 25, minutes: 4 },
  asteroid: { heat: 20, minutes: 5 },
  young: { heat: 25, minutes: 4 },
  rogue: { heat: 10, minutes: 8 },
  snowball: { heat: 25, minutes: 3 },
  archean: { heat: 10, minutes: 6 },
  lengai: { heat: 25, minutes: 4 },
  ijen: { heat: 25, minutes: 4 },
  tonga: { heat: 33, minutes: 4 },
  io: { heat: 25, minutes: 4 },
  europa: { heat: 20, minutes: 4 },
  enceladus: { heat: 25, minutes: 4 },
  triton: { heat: 33, minutes: 3 },
  tumble: { heat: 33, minutes: 2 },
  mercury: { heat: 25, minutes: 4 },
  magma: { heat: 25, minutes: 4 },
  dust: { heat: 25, minutes: 4 },
  spin: { heat: 10, minutes: 6 },
  deep: { heat: 33, minutes: 3 },
  lamp: { heat: 33, minutes: 4 },
  hollow: { heat: 33, minutes: 4 },
  venus: { heat: 33, minutes: 3 },
  pluto: { heat: 33, minutes: 3 },
  grindavik: { heat: 50, minutes: 4 },
  twofires: { heat: 25, minutes: 4 }, // (its first mark is the whole town kept, not heat: see HOUSES)
};

/** Worlds whose first mark is every house standing, not heat left (the fire there runs its course whatever you do). */
const HOUSES: WorldId[] = ['grindavik'];

const SHARE: [number, string][] = [[50, 'half'], [33, 'a third'], [25, 'a quarter'], [20, 'a fifth'], [10, 'a tenth']];
const shareWords = (heat: number) => { const w = SHARE.find(([h]) => h <= heat)?.[1] ?? 'some'; return w === 'half' ? 'half the heat left' : `${w} of the heat left`; };

/** The three marks' names on a world, in order. */
export function markNames(world: WorldId): [string, string, string] {
  const at = MARK_AT[world] ?? { heat: 10, minutes: 8 };
  return [HOUSES.includes(world) ? 'every house standing' : shareWords(at.heat), 'no setbacks', `within ${at.minutes} minutes`];
}

/** What a won game earned: heat left (0 to 1; at Grindavík, the share of the town standing), setbacks (the mountain blown apart or fallen in), and its length in seconds. */
export function earned(world: WorldId, heatLeft: number, setbacks: number, seconds: number): Marks {
  const at = MARK_AT[world] ?? { heat: 10, minutes: 8 };
  return [HOUSES.includes(world) ? heatLeft >= 1 - 1e-6 : heatLeft * 100 >= at.heat - 1e-6, setbacks === 0, seconds <= at.minutes * 60];
}

/** Kept as three 0s and 1s ("101"); what's earned once stays earned. */
export function readMarks(s: string | null): Marks {
  return [s?.[0] === '1', s?.[1] === '1', s?.[2] === '1'];
}
export function writeMarks(m: Marks): string {
  return m.map((b) => (b ? '1' : '0')).join('');
}
export function mergeMarks(a: Marks, b: Marks): Marks {
  return [a[0] || b[0], a[1] || b[1], a[2] || b[2]];
}

/** What's still to earn on a world, in a line for its card ('' when all three are). */
export function stillToEarn(world: WorldId, have: Marks): string {
  const names = markNames(world), left = names.filter((_, i) => !have[i]);
  if (!left.length) return '';
  const list = left.length === 1 ? left[0] : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`;
  return have.some(Boolean) ? `Still to earn: ${list}.` : `Marks to earn: ${list}.`;
}
