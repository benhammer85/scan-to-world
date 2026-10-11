/**
 * The field book: the formations a world's rock can be made into, if you play it a certain way. Each is a real
 * thing, named as geologists name it, and kept once it's made, so a world played again a different way can still
 * have something in it to find. (Found in the simulation: see `formations` in sim.ts.)
 */
import type { WorldId } from './worlds';

export const FORMATIONS: Record<string, { name: string; how: string }> = {
  pillow: { name: 'Pillow lava', how: 'Lava running into the sea cools in round pillows.' },
  hair: { name: "Pele's hair", how: 'A tall lava fountain, spun by the wind into threads of glass.' },
  aureole: { name: 'An aureole', how: 'A side of the mountain that gave way, spread far out in ridges, as round Olympus Mons.' },
  rootless: { name: 'Rootless cones', how: 'Lava over ice in the ground boils it, and the steam blasts up small cones.' },
};

/** Which formations each world hides. */
export const HIDDEN: Partial<Record<WorldId, string[]>> = {
  surtsey: ['pillow', 'hair'],
  mars: ['aureole', 'rootless'],
};

const KEY = 'volcano.fieldbook';

/** The formations found so far, on any world. */
export function foundSoFar(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/** Keep a formation as found; whether it's new to the book. */
export function keepFound(id: string): boolean {
  const all = foundSoFar();
  if (all.includes(id)) return false;
  all.push(id);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* (private browsing: kept for this game only) */ }
  return true;
}

/** The line for a world's card: how many of its formations are found, and their names. Empty where it hides none. */
export function bookLine(world: WorldId): string {
  const here = HIDDEN[world];
  if (!here?.length) return '';
  const found = foundSoFar().filter((f) => here.includes(f));
  if (!found.length) return `Field book · ${here.length} things to find here`;
  return `Field book · ${found.length} of ${here.length} found · ${found.map((f) => FORMATIONS[f].name).join(', ')}`;
}
