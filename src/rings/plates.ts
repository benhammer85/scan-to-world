/**
 * The plates the oak is drawn from: real prints of about 1805 to 1825, in the public domain, from the
 * Wellcome Collection's scans (wellcomecollection.org), turned into ink on a transparent ground
 * (scripts/plates.py did it: each cropped to its picture, its paper lifted away, so it prints on the
 * game's own paper). Each is a stage of the tree's life, from the age it begins at.
 *
 *   acorns    Studies of acorns, pencil (Wellcome Collection 22357i)
 *   young     An oak trained with two shoots, woodcut, W. Billington, Facts, Hints, Observations and
 *             Experiments on … Raising Young Plantations of Oaks, 1825
 *   sapling   An oak pruned to three shoots, woodcut, the same, 1825
 *   lane      Oak trees by a country lane in Berkshire, soft-ground etching by W. Delamotte, 1805
 *   prime     A tall oak in Fredville Park, etching after J. G. Strutt, Sylva Britannica, 1824
 *   great     A large oak in open parkland, etching after J. G. Strutt, Sylva Britannica, 1823
 *   ancient   A gnarled and hollow old oak, etching after J. G. Strutt, Sylva Britannica, c. 1823
 *   winter    The Oak in Winter, woodcut, W. Billington's frontispiece, 1825 (on the card)
 */
import acornUrl from './plates/acorn.webp';
import youngUrl from './plates/young.webp';
import saplingUrl from './plates/sapling.webp';
import laneUrl from './plates/lane.webp';
import primeUrl from './plates/prime.webp';
import greatUrl from './plates/great.webp';
import ancientUrl from './plates/ancient.webp';
import winterUrl from './plates/winter.webp';

export interface Stage {
  id: string;
  /** The age it begins at (years). */
  from: number;
  url: string;
  /** Who made it, and when. */
  credit: string;
  /** How tall it stands on the page (a share of the page's height); where its trunk is across it (0 to 1); how far below its foot the ground lies (a share of its height). */
  page: number;
  trunk: number;
  foot: number;
  /** Whether it's in leaf (washed with the season), and how far down its crown reaches (a share of its height). */
  leafy: boolean;
  crown: number;
}

export const STAGES: Stage[] = [
  { id: 'acorns', from: 0, url: acornUrl, credit: 'Studies of acorns, pencil', page: 0.16, trunk: 0.5, foot: 0, leafy: false, crown: 0 },
  { id: 'young', from: 10, url: youngUrl, credit: 'after W. Billington, 1825', page: 0.62, trunk: 0.48, foot: 0.06, leafy: false, crown: 0 },
  { id: 'sapling', from: 35, url: saplingUrl, credit: 'after W. Billington, 1825', page: 0.72, trunk: 0.5, foot: 0.05, leafy: false, crown: 0 },
  { id: 'lane', from: 80, url: laneUrl, credit: 'W. Delamotte, 1805', page: 0.95, trunk: 0.62, foot: 0.08, leafy: true, crown: 0.7 },
  { id: 'prime', from: 150, url: primeUrl, credit: 'after J. G. Strutt, 1824', page: 1.0, trunk: 0.47, foot: 0.06, leafy: true, crown: 0.72 },
  { id: 'great', from: 250, url: greatUrl, credit: 'after J. G. Strutt, 1823', page: 0.9, trunk: 0.55, foot: 0.08, leafy: true, crown: 0.7 },
  { id: 'ancient', from: 400, url: ancientUrl, credit: 'after J. G. Strutt, c. 1823', page: 0.86, trunk: 0.43, foot: 0.06, leafy: true, crown: 0.65 },
];
export const WINTER = { url: winterUrl, credit: 'The Oak in Winter, after W. Billington, 1825' };

/** Years before a stage over which the plate before it gives way to it. */
const CROSS = 12;

/** The stage for an age, the next, and how far the one has given way to the other (0 to 1). */
export function stageAt(age: number): { stage: Stage; next: Stage | null; blend: number } {
  let k = 0;
  while (k + 1 < STAGES.length && age >= STAGES[k + 1].from) k++;
  const next = STAGES[k + 1] ?? null;
  // (Over the last years of a stage, never more than half of it.)
  const cross = next ? Math.min(CROSS, (next.from - STAGES[k].from) / 2) : 1;
  const blend = next ? Math.max(0, Math.min(1, (age - (next.from - cross)) / cross)) : 0;
  return { stage: STAGES[k], next, blend };
}

const images = new Map<string, HTMLImageElement>();
/** A stage's plate, loading (start them all early: preloadPlates). */
export function plateImage(st: Stage): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let im = images.get(st.id);
  if (!im) { im = new Image(); im.decoding = 'async'; im.src = st.url; images.set(st.id, im); }
  return im;
}
/** Start every plate loading; resolves when they're all in. */
export function preloadPlates(): Promise<void> {
  return Promise.all(STAGES.map((st) => { const im = plateImage(st); return im ? im.decode().catch(() => {}) : Promise.resolve(); })).then(() => {});
}
