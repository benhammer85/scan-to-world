/**
 * Each world's second aim: one that pulls against its first, so that how the heat is spent is a
 * choice, not a matter of doing the one right thing. Measured as the fire ends, and kept, with the
 * best so far on each world.
 *
 *   An ocean world  ring the world (the first aim) with a chain of islands, and leave atolls: an
 *                   island sinks into an atoll only if it was big, and the heat is finite and the
 *                   crust keeps moving, so a few big islands mean gaps in the chain.
 *   The Moon        flood the basins, and keep the lava in them: lava spilled outside a basin is
 *                   wasted, so flooding fast and flooding neatly pull apart.
 *   Mars            raise the mountain, and give it a broad base: a spike rises fastest, a
 *                   shield lasts.
 *   An ice moon     make the ice new, and in one great sheet: new ice everywhere covers most, one
 *                   sheet asks you to stay.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';
import type { World } from './worlds';

/** An island this big (in vertices, on a planet of the drawn detail) leaves an atoll when it sinks. */
export const ATOLL_ISLAND = 30;
/** Mars's radius, for its base's width in km; and the height (km) its base is measured at. */
const MARS_KM = 3390, BASE_AT_KM = 5;

export interface Second { value: number; words: string }

export function secondWords(goal: World['goal'], value: number): string {
  switch (goal) {
    case 'ring': return `${value} ${value === 1 ? 'atoll' : 'atolls'}`;
    case 'basins': return `${value}% kept in the basins`;
    case 'height': return `a base ${value} km wide`;
    case 'cover': return `the largest sheet ${value}%`;
  }
}

export function measureSecond(world: World, pl: Planet, topo: Topology, islands: { vertices: number[] }[]): Second {
  const n = pl.rock.length, scale = n / 16002, p = topo.basePositions;
  let value = 0;
  if (world.goal === 'ring') {
    value = islands.filter((i) => i.vertices.length >= ATOLL_ISLAND * scale).length;
  } else if (world.goal === 'basins') {
    let all = 0, inside = 0;
    for (let v = 0; v < n; v++) {
      if (pl.age[v] >= 1e5) continue;
      all++;
      if (pl.basins.some((b) => Math.hypot(p[v * 3] - b.x, p[v * 3 + 1] - b.y, p[v * 3 + 2] - b.z) < b.r)) inside++;
    }
    value = all ? Math.round((100 * inside) / all) : 0;
  } else if (world.goal === 'height') {
    const q = pl.plume, above = pl.k.floor + BASE_AT_KM / (world.height?.kmPerUnit ?? 40), near = Math.cos(0.8);
    let c = 0;
    for (let v = 0; v < n; v++) if (p[v * 3] * q.x + p[v * 3 + 1] * q.y + p[v * 3 + 2] * q.z > near && pl.rock[v] > above) c++;
    // The area it stands on, as a round cap of the same area, and that cap's width.
    const area = (c / n) * 4 * Math.PI, angle = Math.acos(Math.max(-1, 1 - area / (2 * Math.PI)));
    value = Math.round((2 * angle * MARS_KM) / 10) * 10;
  } else {
    // The largest connected sheet of new ice (or frost), as a share of the surface.
    const covered = (v: number) => pl.age[v] < 1e5 || pl.ash[v] > 0.15, seen = new Uint8Array(n);
    let best = 0;
    for (let v = 0; v < n; v++) {
      if (seen[v] || !covered(v)) continue;
      let size = 0;
      const stack = [v];
      seen[v] = 1;
      while (stack.length) {
        const w = stack.pop()!;
        size++;
        for (let k = topo.nbrOffsets[w]; k < topo.nbrOffsets[w + 1]; k++) { const u = topo.nbrList[k]; if (!seen[u] && covered(u)) { seen[u] = 1; stack.push(u); } }
      }
      best = Math.max(best, size);
    }
    value = Math.round((100 * best) / n);
  }
  return { value, words: secondWords(world.goal, value) };
}
