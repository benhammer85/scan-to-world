/**
 * Earth's life story: chapter II is one world through its ages, not five. Each age begins on the
 * ground the age before it left (kept as `earth:<age>` when its fire is done, won or not): the
 * rubble you gathered is what the young Earth's Moon was thrown from; between the young Earth and
 * the orange Earth, the oceans fill, so the mountains you raised are its first islands; Snowball
 * Earth freezes those islands over; and the ocean world is them thawed, greening and sinking.
 * Played out of order (or the age before never finished), an age begins on fresh ground, as any
 * world does.
 */
import type { WorldId } from './worlds';

export const AGES: WorldId[] = ['first', 'young', 'archean', 'snowball', 'ocean'];

/** The age before this one, if it's an age of Earth and not the first. */
export function ageBefore(id: WorldId): WorldId | null {
  const i = AGES.indexOf(id);
  return i > 0 ? AGES[i - 1] : null;
}

/** Where an age's ground is kept, for the age after it. */
export const ageKey = (id: WorldId): string => `earth:${id}`;

/** Whether a world's ground is under a sea (the ages from the orange Earth on). */
const SEA_AGES: WorldId[] = ['archean', 'snowball', 'ocean'];

/**
 * The ground the age before left, as this age begins on it. Dry to wet, the oceans fill: the ground
 * is lowered so its middle height lies at the sea floor, and only what stood well above it (the
 * mountains, the rims) is land. Otherwise it's as it was.
 */
export function carried(from: WorldId, to: WorldId, rock: Float32Array, seaFloor: number): Float32Array {
  const out = rock.slice();
  if (!SEA_AGES.includes(from) && SEA_AGES.includes(to)) {
    const sorted = Array.from(rock).sort((a, b) => a - b), middle = sorted[sorted.length >> 1];
    for (let v = 0; v < out.length; v++) out[v] = seaFloor + (rock[v] - middle) * 1.6;
  }
  return out;
}
