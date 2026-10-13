/**
 * The puzzle (puzzle.html), its reckoning (pure, no drawing): a target outline to grow a tree into, in so
 * many rings; which one is today's; and how well a slice fills it.
 */
const TAU = Math.PI * 2;

export interface Shape { id: string; name: string; r: (a: number) => number }
/** The targets: each an outline round the heart, its mean radius about 1. */
export const SHAPES: Shape[] = [
  { id: 'circle', name: 'a perfect circle', r: () => 1 },
  { id: 'oval', name: 'an oval', r: (a) => 1 / Math.sqrt((Math.cos(a) / 1.22) ** 2 + (Math.sin(a) / 0.82) ** 2) },
  { id: 'lobes', name: 'a five-lobed oak', r: (a) => 1 + 0.24 * Math.cos(5 * a - Math.PI / 2) },
];
/** Rings to grow in. */
export const RINGS = 8;

/** Today's target, the same for everyone that day (by the local date, as 2026-10-13); or one asked for. */
export function shapeFor(day: string, asked?: string | null): Shape {
  const named = SHAPES.find((s) => s.id === asked);
  if (named) return named;
  const [y, m, d] = day.split('-').map(Number), n = Math.round(Date.UTC(y, m - 1, d) / 864e5);
  return SHAPES[((n % SHAPES.length) + SHAPES.length) % SHAPES.length];
}

/**
 * How well a slice fills the target (0 to 1): the area both cover, over the area either covers (both
 * outlines round the same heart, as radius at angle a). Overshoot counts against it as much as falling
 * short.
 */
export function overlap(slice: (a: number) => number, target: (a: number) => number, steps = 720): number {
  let both = 0, either = 0;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU, s = Math.max(0, slice(a)), t = Math.max(0, target(a));
    both += Math.min(s, t) ** 2; either += Math.max(s, t) ** 2;
  }
  return either > 0 ? both / either : 0;
}

/** The score as it's said: 87.4%. */
export const percent = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
