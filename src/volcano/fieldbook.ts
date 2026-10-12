/**
 * The field book: the formations a world's rock can be made into, if you play it a certain way. Each is a real
 * thing, named as geologists name it, and kept once it's made, so a world played again a different way can still
 * have something in it to find. (Found in the simulation: see `formations` in sim.ts.)
 */
import { worldOf, type WorldId } from './worlds';

/** Each formation: its name, how it forms, and a plain hint for finding it (shown until it's found). */
export const FORMATIONS: Record<string, { name: string; how: string; hint: string }> = {
  pillow: { name: 'Pillow lava', how: 'Lava running into the sea cools in round pillows.', hint: 'Steer lava from the island into the sea.' },
  hair: { name: "Pele's hair", how: 'A tall lava fountain, spun by the wind into threads of glass.', hint: 'Once the volcano is above the sea, let the circle fill completely, then erupt.' },
  aureole: { name: 'An aureole', how: 'A side of the mountain that gave way, spread far out in ridges, as round Olympus Mons.', hint: 'Build the mountain too tall for one of its sides.' },
  rootless: { name: 'Rootless cones', how: 'Lava over ice in the ground boils it, and the steam blasts up small cones.', hint: 'Pour lava over the pale blue patches.' },
  caldera: { name: 'A caldera', how: 'An emptied magma chamber gives way, and the summit falls in.', hint: 'Keep pouring without stopping.' },
  resurgent: { name: 'A resurgent dome', how: 'The chamber fills again and lifts the fallen summit higher than before.', hint: 'After the top collapses, build it higher than it was before.' },
  pahoehoe: { name: 'Pāhoehoe', how: 'A small, slow flow keeps its skin, and wrinkles it into ropes.', hint: 'Pour just a tiny amount, then stop.' },
  aa: { name: 'ʻAʻā', how: 'A big, fast flow tears its crust into rough clinker.', hint: 'Pour a lot of lava at once.' },
  littoral: { name: 'A littoral cone', how: 'Lava poured into the sea bursts into steam and builds a cone of glassy sand.', hint: 'Pour lava straight into the sea.' },
  salt: { name: 'Salt flats', how: 'A sea that dries away leaves its salt behind in a white plain.', hint: 'Let the sea shrink below a quarter of the planet.' },
  lenticulae: { name: 'Lenticulae', how: 'Warm ice rises under the crust without breaking through: freckles of domes and pits.', hint: 'Erupt before the circle fills.' },
  plume: { name: 'A water plume', how: 'Ocean water blasted up through the ice into space.', hint: 'Wait until the circle starts to empty, then erupt.' },
  phreatic: { name: 'A steam-blast crater', how: 'Ice strikes hot rock and flashes to steam, blowing out a crater.', hint: 'Let an icy comet land on the volcano.' },
  tektites: { name: 'Tektites', how: 'A stone strikes molten lava and splashes it into the sky, where it freezes into beads of glass.', hint: 'Let a stone land on flowing lava.' },
  stromatolite: { name: 'Stromatolites', how: 'Mats of life in the shallows build up in layers: the oldest fossils there are.', hint: 'Pour shallow seas for life to grow in.' },
  banded: { name: 'Banded iron', how: 'The first oxygen meets iron in the sea and rusts it out in red stripes.', hint: 'Make half of the oxygen you need.' },
  blacksand: { name: 'A black sand beach', how: 'The waves grind new lava down into black sand.', hint: 'Let the waves reach new lava on the shore.' },
  guyot: { name: 'A guyot', how: 'An island worn flat by the waves sinks below the sea, keeping its flat top.', hint: 'Let an island sink back under the sea.' },
  sunglass: { name: 'Sun-melted glass', how: 'Lava laid in the day melts again under the swollen Sun, and sets as glass.', hint: 'Pour lava on the sunny side.' },
  lavalake: { name: 'A lava lake', how: 'Lava erupted in full daylight never cools, and pools in a lake of fire.', hint: 'Erupt while the volcano is in sunlight.' },
  tuff: { name: 'A tuff ring', how: 'A burst through shallow water blows the cone open, leaving a low ring of ash round a flooded crater.', hint: 'Make your first giant wave.' },
  pumice: { name: 'A pumice raft', how: 'Bursting deep under the sea, lava froths into stone light enough to float.', hint: 'Erupt while the volcano is deep under the sea.' },
  weird: { name: 'Weird terrain', how: 'A shock through the planet breaks the far side into jumbled hills.', hint: 'Raise the far side once.' },
  faculae: { name: 'A pyroclastic vent', how: 'A great burst leaves a bright halo of ash round a pit.', hint: 'Let the circle fill completely, then erupt.' },
  pele: { name: 'A Pele ring', how: "A great plume's sulphur falls in a red ring hundreds of km across.", hint: 'Make a big eruption at high tide.' },
  frost: { name: 'Sulphur frost', how: 'A plume that falls short freezes round the vent in a white rime.', hint: 'Make a big eruption at low tide.' },
};

/** Which formations a world hides: its own rules say (see `formations` in sim.ts). */
export const hiddenIn = (world: WorldId): string[] => worldOf(world).rules.formations ?? [];

const KEY = 'volcano.fieldbook';

/** The formations found so far, on any world. */
export function foundSoFar(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/** Keep a formation as found; whether it's new to the book. */
export function keepFound(id: string): boolean {
  const all = foundSoFar();
  if (all.includes(id)) return false;
  all.push(id);
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* (private browsing: kept for this game only) */ }
  return true;
}

/** The line for a world's card: how many of its formations are found, and their names. Empty where it hides none. */
export function bookLine(world: WorldId): string {
  const here = hiddenIn(world);
  if (!here?.length) return '';
  const found = foundSoFar().filter((f) => here.includes(f));
  if (!found.length) return `Field book · ${here.length} things to find here`;
  return `Field book · ${found.length} of ${here.length} found · ${found.map((f) => FORMATIONS[f].name).join(', ')}`;
}
