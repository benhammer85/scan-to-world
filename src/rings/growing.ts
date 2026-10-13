/**
 * How a tree grows, besides the hand (pure, no drawing): its own slow swells round its girth, and the
 * pace of a year's growth through its season.
 */
import { noise } from './tree';

const TAU = Math.PI * 2;

/**
 * How much more (or less) the tree grows at angle a in its year n, for a tree of this seed: never a fixed
 * pattern, but a few broad swells (a lean toward the light, a lobe, a flat side) each slowly waxing,
 * waning and turning, year on year, so the rings deform and recover as a trunk's do. Each swell's strength
 * wanders over a season or two of years; its heading drifts slower still (the lean slowest), so a lobe
 * builds and the slice's outline comes to carry it.
 */
export function growth(seed: number, a: number, n: number): number {
  let e = 0;
  for (let m = 1; m <= 4; m++) {
    const s = seed * 0.0137 + m * 17.3, amp = [0, 0.32, 0.2, 0.12, 0.07][m];
    const k = amp * (noise(s + n / (20 + 10 * m)) * 1.6 - 0.3), ph = 1.6 * TAU * noise(s + 50 + n / (m === 1 ? 320 : 110 + 40 * m));
    e += k * Math.cos(m * a - ph);
  }
  return Math.exp(e);
}

/** How far through its growth a season is, t of 1 (0 to 1): early growth quick, easing to a stop. */
export const season = (t: number) => { const x = Math.max(0, Math.min(1, t)); return 1 - (1 - x) ** 2.6 * (1 + 1.6 * x); };

/** A steady hash, 0 to 1. */
const hash = (x: number) => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
/**
 * The tree's own years, besides the hand: how much wider or narrower year n grows than the hand alone
 * would make it, for a tree of this seed. Runs of good years and lean ones (a slow swing over a few weeks
 * of years), a little from year to year, and now and then a hard year, very narrow, as a drought or a late
 * frost leaves. Between about a third and two.
 */
export function climate(seed: number, n: number): number {
  const s = seed * 0.0213;
  const slow = noise(s + n / 11) - 0.5, quick = noise(s + 70 + n / 2.3) - 0.5;
  const hard = hash(s * 3.7 + n * 0.731) < 0.035 ? 0.42 : 1;
  return Math.exp(1.0 * slow + 0.55 * quick) * hard;
}
