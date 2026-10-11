/**
 * The colours: watercolour pigments, as a full-strength wash of each looks on white paper. Each ring
 * runs through the seasons the way its stroke went: sap green in spring, gold in high summer, sienna
 * and madder in autumn. The weather mixes its own pigment in: rain indigo, drought ochre (and paler),
 * wind viridian, frost cerulean; a fire on the slope blooms vermilion. Mixed as paint mixes: their
 * densities add (wash.ts), so blue over gold goes green and red over green goes brown.
 */
import { RAIN, DROUGHT, WIND, FROST, hash } from './tree';

export type RGB = [number, number, number];

/** Spring to autumn, along a stroke. */
const SEASONS: [number, RGB][] = [
  [0.0, [0.6, 0.76, 0.42]],   // sap green
  [0.22, [0.74, 0.78, 0.36]], // green-gold
  [0.45, [0.95, 0.76, 0.3]],  // new gamboge
  [0.65, [0.86, 0.56, 0.28]], // raw sienna
  [0.85, [0.74, 0.36, 0.24]], // burnt sienna
  [1.0, [0.66, 0.27, 0.33]],  // madder
];
const WEATHER: Record<number, [RGB, number]> = {
  [RAIN]: [[0.36, 0.46, 0.64], 0.4],    // indigo
  [DROUGHT]: [[0.9, 0.78, 0.52], 0.45], // yellow ochre, pale
  [WIND]: [[0.36, 0.64, 0.6], 0.3],     // viridian
  [FROST]: [[0.52, 0.72, 0.9], 0.45],   // cerulean
};
export const FIRE: RGB = [0.94, 0.36, 0.2]; // vermilion
export const BARK: RGB = [0.62, 0.52, 0.44]; // a sepia wash

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The colour a stroke lays at `f` (0 to 1) of the way round, in a ring's weather; `ring` varies it a little. */
export function colourOf(f: number, weather: number, ring = 0): RGB {
  // (Each ring's seasons fall a little differently, so no two are the same.)
  const g = Math.max(0, Math.min(1, f * (0.9 + 0.2 * hash(ring * 3.7)) + (hash(ring * 1.3) - 0.5) * 0.08));
  let c: RGB = SEASONS[SEASONS.length - 1][1];
  for (let i = 1; i < SEASONS.length; i++) {
    const [f1, c1] = SEASONS[i], [f0, c0] = SEASONS[i - 1];
    if (g <= f1) { c = mix(c0, c1, (g - f0) / (f1 - f0)); break; }
  }
  const w = WEATHER[weather];
  return w ? mix(c, w[0], w[1]) : c;
}

/** A colour as optical density (how much of each of red, green and blue light it takes away). */
export function densityOf(c: RGB, strength = 1): RGB {
  return [-Math.log(Math.max(0.04, c[0])) * strength, -Math.log(Math.max(0.04, c[1])) * strength, -Math.log(Math.max(0.04, c[2])) * strength];
}

/** As a CSS colour, at an alpha. */
export function css(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha.toFixed(3)})`;
}
