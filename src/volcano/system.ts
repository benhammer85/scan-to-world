/**
 * A solar system: the worlds, played as one run. A star with a handful of unmade worlds round it,
 * each a kind of world from worlds.ts with a twist of its own (more stones, thin lava, tides from
 * a near neighbour...), so no two systems play alike. The worlds are played in whatever order you
 * choose, once each, and what one world makes it passes on to the next one played:
 *
 *   any world whose aim is met   warmth: more heat for the next, the more the better it did at
 *                                its second aim;
 *   a young world's moon         the moon it made joins the system, as a world of its own to play;
 *   a small ice moon's ring      ice from the giant's ring falls on the next as stones: more of
 *                                them, and more heat in each.
 *
 * So the order is the strategy, and the system's chart, every world as it was left, the keepsake.
 * This is the system alone, with no drawing, so it can be tested.
 */
import { VOLCANO, type Rules } from './sim';
import { WORLDS, worldOf, type World, type WorldId } from './worlds';

export interface Twist {
  id: string;
  /** In a few words, for the chart. */
  name: string;
  /** In a sentence, for the card. */
  words: string;
  /** What it changes, given the world's own rules (over the defaults). */
  rules: (r: Rules) => Partial<Rules>;
  /** How much of the aim it asks, where the aim is a quantity (1 unless it says). */
  aim?: number;
  /** Kinds of world it isn't given to: where it would mean nothing, or make the aim out of reach. */
  not?: WorldId[];
}

export const TWISTS: Twist[] = [
  { id: 'none', name: 'as it is', words: '', rules: () => ({}) },
  {
    id: 'restless', name: 'a restless sky', words: 'Stones fall twice as often.',
    rules: (r) => ({ impactEvery: [r.impactEvery[0] / 2, r.impactEvery[1] / 2] as [number, number] }), not: ['io', 'enceladus', 'lamp'],
  },
  // (The pace of the heat, not how much: a quicker fire or a slower one, the same heat in all.
  // Not on the ocean world, whose heat travels the route at the crust's pace.)
  {
    id: 'hot', name: 'a quick fire', words: 'The heat comes a quarter faster, and held too long it bursts out sooner.',
    rules: (r) => ({ rising: r.rising * 1.25, cap: r.cap * 0.8 }), not: ['ocean', 'io', 'lamp'],
  },
  {
    id: 'cold', name: 'a slow fire', words: 'The heat comes slowly, over a longer fire.',
    rules: (r) => ({ rising: r.rising * 0.8 }), not: ['ocean', 'enceladus'],
  },
  // (How lava runs and sets: thin, it runs far and sets late; thick, it piles up and sets soon.)
  { id: 'thin', name: 'thin lava', words: 'Lava runs far and thin before it sets.', rules: (r) => ({ flow: r.flow * 1.6, coolLand: r.coolLand * 0.6 }), not: ['lamp', 'spin'] },
  { id: 'thick', name: 'thick lava', words: 'Lava piles up near the vent and sets soon.', rules: (r) => ({ flow: r.flow * 0.5, coolLand: r.coolLand * 1.8 }), not: ['moon', 'enceladus', 'lamp'] },
  {
    id: 'tidal', name: 'a near neighbour', words: 'Its tides make the heat come and go, and bursts throw further at high tide.',
    rules: () => ({ tide: 0.6, tidePeriod: 60, tideThrow: 0.4 }), not: ['io', 'ocean', 'enceladus'],
  },
];
export const twistOf = (id: string): Twist => TWISTS.find((t) => t.id === id) ?? TWISTS[0];

/**
 * Where a twist made a world easier or harder than it is without one, its heat is set back so it
 * isn't: measured with bots that play each world well (a skilled player's win, as a share of the
 * fire, brought back within about 0.08 of the world's own), and kept here. (Twists that would have
 * needed more than heat to set right, as a quick fire on Io, which leaves too few tides, aren't
 * given to that world at all: see each twist's `not`.)
 */
export const BALANCE: Partial<Record<WorldId, Record<string, number>>> = {
  asteroid: { hot: 1.13, cold: 1.2, tidal: 1.1 },
  spin: { hot: 1.15, restless: 1.2, tidal: 0.88 },
  ice: { cold: 0.79, hot: 1.17 },
  io: { cold: 0.81, thin: 0.88 },
  mars: { thick: 0.86, thin: 1.11 },
  young: { cold: 0.88 },
};

/** A kind of world's rules with a twist: its own, the twist's, and the heat set back where the twist would unbalance it. */
export function twisted(world: WorldId, twistId: string): Partial<Rules> {
  const base = worldOf(world), own: Rules = { ...VOLCANO, ...base.rules };
  const rules: Partial<Rules> = { ...base.rules, ...twistOf(twistId).rules(own) };
  const by = BALANCE[world]?.[twistId];
  if (by) rules.heat = (rules.heat ?? own.heat) * by;
  return rules;
}
/** From the star outwards: the kinds of world in the order a system would have them, warmest first. */
const WARMTH: WorldId[] = ['young', 'ocean', 'mars', 'lamp', 'asteroid', 'spin', 'io', 'moon', 'ice', 'enceladus'];

export interface Made { met: boolean; second: number; words: string }
export interface Body {
  world: WorldId;
  twist: string;
  /** For a moon made by a world of the system: which body it circles. */
  moonOf?: number;
  made?: Made;
}
/** What a world that was made passes on to the next one played. */
export interface Gift { from: number; words: string; heat: number; stones: boolean }
export interface System {
  version: 1;
  seed: number;
  star: string;
  bodies: Body[];
  /** The bodies, in the order they were played. */
  order: number[];
  /** What the next world played will be given, if anything. */
  gift: Gift | null;
  /** Whether its chart has gone into the atlas, once every world was played. */
  kept?: boolean;
}

/** A good showing at each second aim: as good as this gives the most warmth (see `giftOf`). */
const GOOD: Record<World['goal'], number> = { ridge: 2, lamp: 60, round: 80, ring: 3, basins: 85, height: 700, cover: 30, plumes: 1400, feed: 15, orbit: 3474 };
/** The most warmth a world passes on: this share more heat. */
export const MOST_WARMTH = 0.15;
const STARS = ['a yellow star', 'an orange star', 'a pale white star', 'a small red star'];

/** A seeded random number, 0 to 1, so the same seed gives the same system. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new system: five kinds of world, warmest nearest the star, each with a twist (no more than one left as it is). */
export function newSystem(seed: number, count = 5): System {
  const r = rng(seed);
  const kinds = WARMTH.slice();
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const chosen = kinds.slice(0, Math.min(count, kinds.length)).sort((a, b) => WARMTH.indexOf(a) - WARMTH.indexOf(b));
  let plain = 0;
  const bodies = chosen.map((world) => {
    for (;;) {
      const t = TWISTS[Math.floor(r() * TWISTS.length)];
      if (t.not?.includes(world)) continue;
      if (t.id === 'none' && plain++ > 0) continue;
      return { world, twist: t.id };
    }
  });
  return { version: 1, seed, star: STARS[Math.floor(r() * STARS.length)], bodies, order: [], gift: null };
}

/** A body's name, as the chart and the card give it: its place from the star, and its kind. */
export function nameOf(sys: System, i: number): { numeral: string; title: string } {
  const b = sys.bodies[i], kind = worldOf(b.world).kind;
  if (b.moonOf !== undefined) return { numeral: `${numeral(placeOf(sys, b.moonOf))}a`, title: `${kind}, made by ${worldOf(sys.bodies[b.moonOf].world).kind.replace(/^An? /, 'the ').toLowerCase()}` };
  return { numeral: numeral(placeOf(sys, i)), title: kind };
}
/** Where a body is from the star, counting only worlds (not the moons they made), from 1. */
function placeOf(sys: System, i: number): number {
  let k = 0;
  for (let j = 0; j <= i; j++) if (sys.bodies[j].moonOf === undefined) k++;
  return k;
}
function numeral(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}

/**
 * A body as a world to play: its kind's world, with its twist, and whatever the last world made
 * gives it. Its aim scaled where the twist asks less of it.
 */
export function worldFor(sys: System, i: number): World {
  const b = sys.bodies[i], base = worldOf(b.world), twist = twistOf(b.twist);
  const rules = twisted(b.world, b.twist);
  const gift = sys.gift, words: string[] = [];
  if (twist.words) words.push(`${twist.name[0].toUpperCase()}${twist.name.slice(1)}: ${twist.words[0].toLowerCase()}${twist.words.slice(1)}`);
  if (gift) {
    const now: Rules = { ...VOLCANO, ...rules };
    if (gift.heat > 0) rules.heat = now.heat * (1 + gift.heat);
    if (gift.stones && now.impactEvery[1] > 0) {
      rules.impactEvery = [now.impactEvery[0] * 0.6, now.impactEvery[1] * 0.6];
      rules.impactHeat = now.impactHeat * 1.5;
    }
    words.push(gift.words);
  }
  const aim = twist.aim ?? 1, name = nameOf(sys, i);
  return {
    ...base,
    rules,
    numeral: name.numeral,
    title: name.title,
    first: `${name.title}, round ${sys.star}.`,
    then: base.then.replace(/\b\d+(\.\d+)?( km|%)/, (m) => scaleWords(m, aim)) + (words.length ? ' ' + words.join(' ') : ''),
    height: base.height ? { ...base.height, target: Math.round(base.height.target * aim) } : undefined,
    cover: base.cover ? Math.round(base.cover * aim * 100) / 100 : undefined,
    orbit: base.orbit ? Math.round(base.orbit * aim) : undefined,
  };
}
/** "28 km", say, scaled: as the card says it. */
function scaleWords(m: string, f: number): string {
  const n = parseFloat(m);
  return `${Math.round(n * f)}${m.slice(String(n).length)}`;
}

/** What a body that was made passes on to the next world played; and, for a young world, its moon. */
export function giftOf(sys: System, i: number): Gift | null {
  const b = sys.bodies[i];
  if (!b.made?.met) return null;
  const goal = worldOf(b.world).goal, name = nameOf(sys, i).title.replace(/^An? /, 'the ').replace(/^(\w)/, (c) => c.toLowerCase());
  const heat = Math.round(MOST_WARMTH * Math.min(1, Math.max(0, b.made.second) / GOOD[goal]) * 100) / 100;
  const stones = b.world === 'enceladus';
  const said = [heat > 0 ? `${Math.round(heat * 100)}% more heat, from ${name}` : '', stones ? 'and ice from its giant\'s ring falls here as stones: more of them, and more heat in each' : ''].filter(Boolean);
  if (!said.length) return null;
  return { from: i, heat, stones, words: `Given by the last world: ${said.join(', ')}.` };
}

/**
 * A body has been played: what it made is kept, the gift it was given is spent, and it passes on
 * its own. A young world that made its moon adds the moon to the system, as a world to play.
 */
export function recordPlayed(sys: System, i: number, made: Made): System {
  const out: System = { ...sys, bodies: sys.bodies.map((b) => ({ ...b })), order: [...sys.order, i] };
  out.bodies[i].made = made;
  out.gift = giftOf(out, i);
  if (made.met && out.bodies[i].world === 'young' && !out.bodies.some((b) => b.moonOf === i)) {
    out.bodies.splice(i + 1, 0, { world: 'moon', twist: 'none', moonOf: i });
    // (Everything after it moves along one.)
    out.order = out.order.map((k) => (k > i ? k + 1 : k));
    for (const b of out.bodies) if (b.moonOf !== undefined && b.moonOf > i && b !== out.bodies[i + 1]) b.moonOf++;
    if (out.gift && out.gift.from > i) out.gift.from++;
  }
  return out;
}

/** Whether every world in the system has been played. */
export const finished = (sys: System): boolean => sys.bodies.every((b) => b.made);
/** How many of its worlds were made, their aims met. */
export const madeCount = (sys: System): number => sys.bodies.filter((b) => b.made?.met).length;

const KEY = 'volcano.system';
export function loadSystem(): System | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as System | null;
    return s && s.version === 1 && Array.isArray(s.bodies) && s.bodies.every((b) => WORLDS.some((w) => w.id === b.world)) ? s : null;
  } catch {
    return null;
  }
}
export function saveSystem(sys: System): void {
  try { localStorage.setItem(KEY, JSON.stringify(sys)); } catch { /* not kept, and that's all */ }
}
