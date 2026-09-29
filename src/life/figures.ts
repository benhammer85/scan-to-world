/**
 * Standing figures: what an old map draws in profile rather than in plan.
 * Trees, a church's tower or spire, a windmill, a castle's keep, a lighthouse
 * are drawn as little upright pictures on a map otherwise seen from above.
 * Here they stand up off the world as paper cutouts, each turning to face you
 * as the world turns (see STYLE.md, and `render/standing.ts`).
 *
 * The marks code asks `standing()`. When it is on, a symbol is handed over
 * with `stand()` instead of drawn in strokes. A layer is built inside
 * `gathering()`, which collects what was handed over. Called outside any
 * gathering (as the tests call it), everything is drawn flat as before.
 */
type V3 = [number, number, number] | number[];

export type FigureKind = 'tree' | 'fir' | 'spire' | 'tower' | 'mill' | 'keep' | 'ruin' | 'lighthouse';

export interface Figure {
  kind: FigureKind;
  /** Where it stands, and which way is up there (the ground's normal). */
  at: V3;
  up: V3;
  /** Its height, in world units. */
  size: number;
  seed: number;
}

/**
 * Off with `?flat` in the address, to compare with the map drawn wholly in
 * plan. `?stipple` draws the towns' buildings as stipple instead (see
 * `render/stipple.ts`).
 */
export const STANDING = { on: true, stipple: false };

let sink: Figure[] | null = null;

export function standing(): boolean {
  return STANDING.on && sink !== null;
}

export function stand(f: Figure): void {
  sink?.push(f);
}

export function gathering<T>(make: () => T): T & { figures: Figure[] } {
  const was = sink;
  sink = [];
  try {
    const value = make();
    return Object.assign(value as object, { figures: sink }) as T & { figures: Figure[] };
  } finally {
    sink = was;
  }
}
