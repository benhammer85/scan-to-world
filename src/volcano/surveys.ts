/**
 * Surveys: a world played backwards. Once a world is done, a real place made the same way can be surveyed on it: its
 * outline is pencilled round the volcano, and the aim is to make it again, near enough. (How near: the share of the
 * outline and of what was made that lie on each other, as a map is laid over a map.)
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';
import type { WorldId } from './worlds';

export interface Survey {
  /** The place, and when, as the card names it. */
  title: string;
  /** What it asks, on the card. */
  aim: string;
  /** How to, said once it begins. */
  tip: string;
  /** Its true story, at the end. */
  why: string;
  /** Its outline round the vent, as points (east, north) on a unit; and how far a unit reaches over the world (radians). */
  outline: [number, number][];
  scale: number;
  /** Where the vent stood in it (east, north, on the same unit): the outline is laid so. */
  vent?: [number, number];
  /** What counts as made: hard land above the sea (lava rock, not loose ash), or ground lava has built up (`baseThick` thick). */
  made: 'land' | 'built';
  /** How near, as a share, counts as made again. */
  need: number;
}

export const SURVEYS: Partial<Record<WorldId, Survey>> = {
  surtsey: {
    title: 'Surtsey, 1967',
    aim: 'Make Surtsey again, as it was in 1967.',
    tip: 'Its outline is pencilled round the volcano. The craters were in the north of the island; the lava ran south and built a broad apron there. Erupt until the island stands clear of the sea, then pour lava south, turning the world so each flow runs where the outline is still empty. Only hard land counts, not loose ash, and land outside the outline counts against you. It is judged once the fire is out, or when you choose "survey it now".',
    why: 'By 1967 Surtsey was about 2.7 square km: a lava shield to the south, its ash cones in the middle, and a spit of washed sand reaching north. The sea has taken half of it since.',
    // (Traced from its 1967 shape: long north to south, the spit to the north, broad and round to the south.)
    outline: [[0, 1], [0.12, 0.72], [0.38, 0.5], [0.66, 0.2], [0.74, -0.2], [0.56, -0.6], [0.16, -0.84], [-0.3, -0.8], [-0.64, -0.46], [-0.74, 0], [-0.54, 0.34], [-0.2, 0.56], [-0.06, 0.8]],
    scale: 0.22,
    vent: [-0.05, 0.38],
    made: 'land',
    need: 0.7,
  },
  mars: {
    title: 'Olympus Mons',
    aim: 'Make Olympus Mons again: a wide shield, the shape of its outline.',
    tip: 'Its outline is pencilled round the volcano: long north to south, narrow east to west. Pour down every side, but most to the north and south, turning the world between pours, until the mountain fills it. Ground built outside it counts against you. It is judged once the fire is out, or when you choose "survey it now".',
    why: 'Olympus Mons is about 600 km across and 22 km high, so gentle you could not see its summit from its foot. Cliffs up to 8 km high ring it, where its sides gave way.',
    outline: Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [0.72 * Math.cos(a), 1.2 * Math.sin(a) + 0.05 * Math.cos(3 * a)] as [number, number]; }),
    scale: 0.33,
    made: 'built',
    need: 0.62,
  },
};

type V = { x: number; y: number; z: number };

/** East and north at a point on the world (as a map is drawn: north towards the pole). */
function frame(c: V): { e: V; n: V } {
  const up = Math.abs(c.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let e = { x: up.y * c.z - up.z * c.y, y: up.z * c.x - up.x * c.z, z: up.x * c.y - up.y * c.x };
  const l = Math.hypot(e.x, e.y, e.z); e = { x: e.x / l, y: e.y / l, z: e.z / l };
  const n = { x: c.y * e.z - c.z * e.y, y: c.z * e.x - c.x * e.z, z: c.x * e.y - c.y * e.x };
  return { e, n };
}

/** Whether a point (east, north) lies inside the outline. */
function inside(outline: [number, number][], x: number, y: number): boolean {
  let at = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) at = !at;
  }
  return at;
}

/** The outline laid on the world round a point: which vertices lie inside it. */
export function surveyMask(topo: Topology, c: V, s: Survey): Uint8Array {
  const p = topo.basePositions, n = topo.vertexCount, out = new Uint8Array(n), { e, n: north } = frame(c);
  for (let v = 0; v < n; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], d = x * c.x + y * c.y + z * c.z;
    if (d < Math.cos(s.scale * 1.8)) continue;
    // (Flattened onto the ground there, as a small map is.)
    const ex = (x * e.x + y * e.y + z * e.z) / s.scale + (s.vent?.[0] ?? 0), ny = (x * north.x + y * north.y + z * north.z) / s.scale + (s.vent?.[1] ?? 0);
    if (inside(s.outline, ex, ny)) out[v] = 1;
  }
  return out;
}

/** The outline as points on the world, for drawing it. */
export function surveyLine(c: V, s: Survey, per = 5): V[] {
  const { e, n } = frame(c), out: V[] = [];
  for (let i = 0; i < s.outline.length; i++) {
    const [x0, y0] = s.outline[i], [x1, y1] = s.outline[(i + 1) % s.outline.length];
    for (let k = 0; k < per; k++) {
      const t = k / per, x = (x0 + (x1 - x0) * t - (s.vent?.[0] ?? 0)) * s.scale, y = (y0 + (y1 - y0) * t - (s.vent?.[1] ?? 0)) * s.scale, h = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      out.push({ x: c.x * h + e.x * x + n.x * y, y: c.y * h + e.y * x + n.y * y, z: c.z * h + e.z * x + n.z * y });
    }
  }
  return out;
}

/** Whether a vertex counts as made, for this survey. */
export function madeAt(pl: Planet, v: number, s: Survey): boolean {
  return s.made === 'land' ? pl.rock[v] > 0.004 && pl.ash[v] < 0.4 : pl.rock[v] - pl.start[v] > pl.k.baseThick && pl.laid[v] < 1e5;
}

/** How near what's made is to the outline: what they share, over all either covers (0 to 1). */
export function surveyMatch(pl: Planet, mask: Uint8Array, s: Survey): number {
  let both = 0, either = 0;
  for (let v = 0; v < mask.length; v++) {
    const m = madeAt(pl, v, s);
    if (m && mask[v]) both++;
    if (m || mask[v]) either++;
  }
  return either ? both / either : 0;
}
