/**
 * The field book: the formations a world's rock can be made into, if you play it a certain way. Each is a real
 * thing, named as geologists name it, and kept once it's made, so a world played again a different way can still
 * have something in it to find. (Found in the simulation: see `formations` in sim.ts.)
 */
import { worldOf, type WorldId } from './worlds';

export const FORMATIONS: Record<string, { name: string; how: string }> = {
  pillow: { name: 'Pillow lava', how: 'Lava running into the sea cools in round pillows.' },
  hair: { name: "Pele's hair", how: 'A tall lava fountain, spun by the wind into threads of glass.' },
  aureole: { name: 'An aureole', how: 'A side of the mountain that gave way, spread far out in ridges, as round Olympus Mons.' },
  rootless: { name: 'Rootless cones', how: 'Lava over ice in the ground boils it, and the steam blasts up small cones.' },
  caldera: { name: 'A caldera', how: 'An emptied magma chamber gives way, and the summit falls in.' },
  resurgent: { name: 'A resurgent dome', how: 'The chamber fills again and lifts the fallen summit higher than before.' },
  pahoehoe: { name: 'Pāhoehoe', how: 'A small, slow flow keeps its skin, and wrinkles it into ropes.' },
  aa: { name: 'ʻAʻā', how: 'A big, fast flow tears its crust into rough clinker.' },
  littoral: { name: 'A littoral cone', how: 'Lava poured into the sea bursts into steam and builds a cone of glassy sand.' },
  salt: { name: 'Salt flats', how: 'A sea that dries away leaves its salt behind in a white plain.' },
  lenticulae: { name: 'Lenticulae', how: 'Warm ice rises under the crust without breaking through: freckles of domes and pits.' },
  plume: { name: 'A water plume', how: 'Ocean water blasted up through the ice into space.' },
  phreatic: { name: 'A steam-blast crater', how: 'Ice strikes hot rock and flashes to steam, blowing out a crater.' },
  tektites: { name: 'Tektites', how: 'A stone strikes molten lava and splashes it into the sky, where it freezes into beads of glass.' },
  stromatolite: { name: 'Stromatolites', how: 'Mats of life in the shallows build up in layers: the oldest fossils there are.' },
  banded: { name: 'Banded iron', how: 'The first oxygen meets iron in the sea and rusts it out in red stripes.' },
  blacksand: { name: 'A black sand beach', how: 'The waves grind new lava down into black sand.' },
  guyot: { name: 'A guyot', how: 'An island worn flat by the waves sinks below the sea, keeping its flat top.' },
  sunglass: { name: 'Sun-melted glass', how: 'Lava laid in the day melts again under the swollen Sun, and sets as glass.' },
  lavalake: { name: 'A lava lake', how: 'Lava erupted in full daylight never cools, and pools in a lake of fire.' },
  tuff: { name: 'A tuff ring', how: 'A burst through shallow water blows the cone open, leaving a low ring of ash round a flooded crater.' },
  pumice: { name: 'A pumice raft', how: 'Bursting deep under the sea, lava froths into stone light enough to float.' },
  weird: { name: 'Weird terrain', how: 'A shock through the planet breaks the far side into jumbled hills.' },
  faculae: { name: 'A pyroclastic vent', how: 'A great burst leaves a bright halo of ash round a pit.' },
  pele: { name: 'A Pele ring', how: "A great plume's sulphur falls in a red ring hundreds of km across." },
  frost: { name: 'Sulphur frost', how: 'A plume that falls short freezes round the vent in a white rime.' },
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
