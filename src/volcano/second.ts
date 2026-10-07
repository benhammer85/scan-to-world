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
 *   Io              raise the great plumes, and one as wide as it can be: the widest needs the
 *                   pressure held deep into the tide, which costs plumes, and risks the cone.
 *   An asteroid     round it, and keep the lava in its hollows: pouring fast, or bursting, spills
 *                   it over the lumps, which rounds it less and leaves it messier.
 *   Tumbling moon   how still it's left: calming it past the aim means bursting just where the ground sweeps past
 *   A deep ocean    an island on the bank, and the longest tube to it: one long tube is slow to
 *                   build; short ones won't reach.
 *   A spinning world  ring its equator with a ridge, and raise it high: spreading thin finishes
 *                   the ring fastest, a tall ridge asks you to stay.
 *   A lava lamp     fill the far shore, and in as great a blob as can be: a great blob lasts the
 *                   journey, but takes long to gather, and the heat runs on meanwhile.
 *   Enceladus       fill the giant's ring, and frost the moon itself white: every burst aimed at
 *                   the ring is frost the moon doesn't get.
 *   A young Earth   make a moon, as big as it can be: bigger bursts throw more, but held too long
 *                   the cone blows apart and throws nothing.
 *   A rogue planet  keep life warm, and as much as possible still alive as the fire ends: the last
 *                   of the heat poured out fast covers what lives.
 *   Snowball Earth  make the ice give way, and soon: the sooner it does, the more open sea there is
 *                   as the fire ends.
 *   Boiling away    outgrow what the star boils, and lose as little to it as can be: pouring only
 *                   in the night is slower to turn to.
 *   The first world gather the rubble, and as much as can be: each stone caught is heat, too.
 *   The orange Earth turn the sky blue, and past it: more oxygen than it needs.
 *   Europa          break the ice into chaos, and as much of it as can be: big fields cost time.
 *   Triton          lay the geyser streaks, and darken as much of the ice as can be: bigger geysers, held longer.
 *   Ol Doinyo Lengai a white summit, and as much of the mountain white as can be: pours that build it blacken it.
 *   Kawah Ijen      light the night, and as much of the crater, ever: pouring wide and pouring new pull apart.
 *   Hunga Tonga     send the waves, and more: every one needs the cone built again.
 *   Mercury         raise the far side, and the near side as little: bursts heap ash here too.
 *   A lava world    make rock snow, and pile it deep in one place: snow spreads along all the edge
 *                   of night, and turning the world to pile it costs the molten pool.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';
import type { World } from './worlds';

/** An island this big (in vertices, on a planet of the drawn detail) leaves an atoll when it sinks. */
export const ATOLL_ISLAND = 30;
/** Mars's radius, for its base's width in km; and the height (km) its base is measured at. */
const MARS_KM = 3390, BASE_AT_KM = 5;
/** Io's radius, for its plumes' width in km; and our Moon's width, for a moon made of as much rock as the aim asks. */
const IO_KM = 1822, MOON_KM = 3474;

export interface Second { value: number; words: string }

export function secondWords(goal: World['goal'], value: number): string {
  switch (goal) {
    case 'ring': return `${value} ${value === 1 ? 'atoll' : 'atolls'}`;
    case 'basins': return `${value}% kept in the basins`;
    case 'height': return `a base ${value} km wide`;
    case 'cover': return `the largest sheet ${value}%`;
    case 'round': return `${value}% of the lava kept in the hollows`;
    case 'calm': return `${value}% still at the end`;
    case 'bank': return `a tube ${value.toLocaleString('en')} km long`;
    case 'ridge': return `a ridge ${value} km high`;
    case 'lamp': return `${value}% of the pool brought in one blob`;
    case 'feed': return `${value}% of the moon frosted new`;
    case 'plumes': return `the widest plume ${value.toLocaleString('en')} km across`;
    case 'orbit': return value > 0 ? `a moon ${value.toLocaleString('en')} km across` : 'no moon';
    case 'hearth': return `${value} living as the fire ended`;
    case 'thaw': return `${value}% open sea`;
    case 'outbuild': return `${value}% of it kept from the star`;
    case 'snow': return `drifts ${value} km deep`;
    case 'gather': return `${value} stones gathered`;
    case 'antipode': return `the near side ${value} km high`;
    case 'white': return `${value}% of the mountain white`;
    case 'glow': return `${value}% of the crater ever lit`;
    case 'waves': return `${value} waves`;
    case 'oxygen': return `${value}% more oxygen than the sky needed`;
    case 'chaos': return `${value}% of the ice broken`;
    case 'streaks': return `${value}% of the ice streaked`;
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
  } else if (world.goal === 'plumes') {
    // The widest ring a counted plume threw: its reach (radians) either side, in km.
    value = Math.round((Math.max(0, ...pl.plumes.map((q) => q.reach)) * 2 * IO_KM) / 10) * 10;
  } else if (world.goal === 'round') {
    // Of the ground lava has lain on this fire, the share that was hollow (below the mean) when it began.
    const mean = pl.startMean;
    let all = 0, low = 0;
    for (let v = 0; v < n; v++) {
      if (pl.age[v] >= 1e5) continue;
      all++;
      if (pl.start[v] < mean) low++;
    }
    value = all ? Math.round((100 * low) / all) : 0;
  } else if (world.goal === 'calm') {
    // How still it was left as the fire ended: calming it further than the aim asks is the second aim.
    value = Math.max(0, Math.round((1 - pl.tumbling) * 100));
  } else if (world.goal === 'bank') {
    // How far from the heat its lava has built (new rock, a fair amount of it), in km on a world as big as ours.
    const q = pl.plume;
    let far = 0;
    for (let v = 0; v < n; v++) if (pl.rock[v] - pl.start[v] > 0.02) far = Math.max(far, Math.acos(Math.min(1, p[v * 3] * q.x + p[v * 3 + 1] * q.y + p[v * 3 + 2] * q.z)));
    value = Math.round((far * 6371) / 10) * 10;
  } else if (world.goal === 'ridge') {
    // How high the ridge stands, on average round the whole equator, in km.
    const raise = pl.ridgeRaise();
    value = Math.round((raise.reduce((a, b) => a + b, 0) / raise.length) * (world.height?.kmPerUnit ?? 40) * 10) / 10;
  } else if (world.goal === 'lamp') {
    value = pl.pooled > 0 ? Math.round((100 * pl.pooledBiggest) / pl.pooled) : 0;
  } else if (world.goal === 'feed') {
    value = Math.round(pl.covered * 100);
  } else if (world.goal === 'orbit') {
    // As much rock as the aim asks makes a moon as wide as ours; more, a wider one, by the cube root.
    const aim = world.orbit ?? 1;
    value = pl.orbit >= aim ? Math.round((MOON_KM * Math.cbrt(pl.orbit / aim)) / 10) * 10 : 0;
  } else if (world.goal === 'hearth') {
    value = Math.round(pl.livingLand);
  } else if (world.goal === 'thaw') {
    // (The ice band's edge is a latitude's sine, so the open band holds just that share of the surface.)
    value = Math.round(pl.iceLine * 100);
  } else if (world.goal === 'outbuild') {
    const laid = Math.max(0, pl.grownBy) + pl.lost;
    value = laid > 0 ? Math.round((100 * Math.max(0, pl.grownBy)) / laid) : 0;
  } else if (world.goal === 'white') {
    value = Math.round(pl.whiteShare * 100);
  } else if (world.goal === 'glow') {
    let lit = 0;
    for (let v = 0; v < n; v++) if (pl.age[v] < 1e5) lit++;
    value = Math.round((100 * lit) / n);
  } else if (world.goal === 'waves') {
    value = pl.waves.length;
  } else if (world.goal === 'antipode') {
    // (The near mountain: the second aim is to keep it low, every burst sent through rather than heaped here.)
    value = Math.round(Math.max(0, pl.summit) * (world.height?.kmPerUnit ?? 40));
  } else if (world.goal === 'gather') {
    value = pl.tally.caught;
  } else if (world.goal === 'oxygen') {
    value = Math.max(0, Math.round((100 * pl.oxygen) / (world.oxygen ?? 1)) - 100);
  } else if (world.goal === 'chaos') {
    let broken = 0;
    for (let v = 0; v < n; v++) if (pl.age[v] < 1e5) broken++;
    value = Math.round((100 * broken) / n);
  } else if (world.goal === 'streaks') {
    let dark = 0;
    for (let v = 0; v < n; v++) if (pl.ash[v] > 0.3) dark++;
    value = Math.round((100 * dark) / n);
  } else if (world.goal === 'snow') {
    let most = 0;
    for (let v = 0; v < n; v++) if (pl.ash[v] > 0.5) most = Math.max(most, pl.rock[v] - pl.start[v]);
    value = Math.round(most * (world.height?.kmPerUnit ?? 40) * 10) / 10;
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
