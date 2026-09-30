/**
 * Kinds of life, each needing its own ground, and the wishes life makes.
 *
 * The planet's life is one field (how much lives at each vertex), but what
 * kind it is depends on the ground it lives on. Only the shape of the land
 * decides that, and the shape of the land is what the player makes:
 *
 *   moss      on bare new rock, the first to come
 *   reef      in the shallows, which gentle flows build as they run into the sea
 *   mangrove  on a low, gentle shore, a long coast only just above the water
 *   meadow    on ground made rich by fallen ash, which only a burst gives
 *   forest    on high ground
 *   heath     on the heights of a cone of ash, which only bursts build
 *
 * So one way of letting the heat out never makes every kind: flows give
 * shallows and low shores, bursts give heights and rich ground. What the world
 * holds when the fire goes out is how many kinds took hold.
 *
 * Wishes, one at a time: now and then life asks for a kind it doesn't yet
 * have, at a place near where it lives. Make that ground there, and let life
 * take it, and the wish is kept. Nothing is lost if it isn't.
 */
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';
import type { Sign } from '../render/stipple';

export type Kind = 'moss' | 'reef' | 'mangrove' | 'meadow' | 'forest' | 'heath';

/**
 * Each kind is drawn as the old survey maps drew it, by a little picture of what grows there (see
 * render/signs.ts), and tinted as the hand-coloured maps were, in soft watercolour inks rather
 * than bright ones: each sign somewhere between its kind's two, so a wood or a reef is never one
 * flat colour.
 */
export const KINDS: { kind: Kind; name: string; wants: string; ink: string; ink2: string; sign: Sign }[] = [
  { kind: 'moss', name: 'moss', wants: 'new rock', ink: '#6f8a4a', ink2: '#8f8f4c', sign: 'dot' },
  { kind: 'reef', name: 'reef', wants: 'shallows', ink: '#c0604e', ink2: '#cf8a48', sign: 'dot' },
  { kind: 'mangrove', name: 'mangroves', wants: 'a low, gentle shore', ink: '#4c6a3c', ink2: '#6b5a3a', sign: 'reeds' },
  { kind: 'meadow', name: 'meadows', wants: 'ground rich with ash', ink: '#86983c', ink2: '#a8923e', sign: 'grass' },
  { kind: 'forest', name: 'forest', wants: 'high ground', ink: '#2f5a36', ink2: '#44602c', sign: 'tree' },
  { kind: 'heath', name: 'heath', wants: 'a high cone of ash', ink: '#7a4a6c', ink2: '#8c5a48', sign: 'shrub' },
];

export const ECOLOGY = {
  /** The shallows are no deeper than this; a low shore no higher than `lowShore`. */
  reefDeep: -0.07,
  lowShore: 0.03,
  /** Rich enough with ash for a meadow. */
  meadowRich: 0.35,
  /** High ground for forest from here; heath from here, on ground at least `heathAsh` ash. */
  forestFrom: 0.07,
  heathFrom: 0.15,
  heathAsh: 0.3,
  /** Life at least this strong counts as that kind living there. */
  living: 0.3,
  /** A kind has taken hold when it lives on this share of the world (as vertices). */
  holds: 0.0012,
  /** A wish comes every so many seconds (between) once life has begun, lasts this long, and wants its kind this near. */
  wishEvery: [60, 100] as [number, number],
  wishLasts: 100,
  wishReach: 0.14,
  /** Kept, it wants this many vertices of its kind there (on a planet of the drawn detail), and stirs the fire this much. */
  wishNeeds: 6,
  wishHeat: 6,
};

export interface Wish { kind: Kind; vertex: number; left: number }

/** What kind of life the ground at a vertex would hold, if any. */
export function habitat(pl: Planet, topo: Topology, v: number): Kind | null {
  const h = pl.rock[v];
  if (pl.lava[v] > 0.0015) return null;
  if (h < 0) return h > ECOLOGY.reefDeep ? 'reef' : null;
  if (h < ECOLOGY.lowShore) {
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (pl.rock[topo.nbrList[k]] < 0) return 'mangrove';
  }
  if (h >= ECOLOGY.heathFrom && pl.ash[v] >= ECOLOGY.heathAsh) return 'heath';
  if (pl.rich[v] >= ECOLOGY.meadowRich) return 'meadow';
  if (h >= ECOLOGY.forestFrom) return 'forest';
  return 'moss';
}

export class Ecology {
  /** Each vertex's kind, as an index into KINDS (-1 for none), at the last reckoning. */
  readonly kind: Int8Array;
  /** How many vertices each kind lives on. */
  readonly count = new Map<Kind, number>();
  /** The kinds that have taken hold, in the order they did. */
  readonly held: Kind[] = [];
  wish: Wish | null = null;
  kept = 0;
  private wishIn = 0;
  private scale: number;
  private seed = 7;

  constructor(private pl: Planet, private topo: Topology) {
    this.kind = new Int8Array(topo.vertexCount).fill(-1);
    this.scale = topo.vertexCount / 16002;
    this.wishIn = ECOLOGY.wishEvery[0];
  }

  /** The kinds living now, on enough of the world to count: what the world holds. */
  get living(): Kind[] {
    return KINDS.filter((k) => this.count.get(k.kind)! >= ECOLOGY.holds * this.kind.length).map((k) => k.kind);
  }

  /** Reckon the kinds anew, and see to the wishes. Call now and then (every second or so), with the seconds since. */
  update(dt: number): void {
    const pl = this.pl, n = this.kind.length;
    for (const k of KINDS) this.count.set(k.kind, 0);
    for (let v = 0; v < n; v++) {
      const kind = pl.life[v] >= ECOLOGY.living ? habitat(pl, this.topo, v) : null;
      this.kind[v] = kind ? KINDS.findIndex((k) => k.kind === kind) : -1;
      if (kind) this.count.set(kind, this.count.get(kind)! + 1);
    }
    for (const k of KINDS) {
      if (!this.held.includes(k.kind) && this.count.get(k.kind)! >= ECOLOGY.holds * n) {
        this.held.push(k.kind);
        pl.tell(k.kind === 'moss' ? 'Moss grows on the new rock' : `The first ${k.name} ${k.kind === 'forest' || k.kind === 'heath' || k.kind === 'reef' ? 'takes' : 'take'} hold`);
      }
    }
    this.wishes(dt);
  }

  private wishes(dt: number): void {
    const pl = this.pl;
    if (this.wish) {
      this.wish.left -= dt;
      if (this.here(this.wish) >= ECOLOGY.wishNeeds * this.scale) {
        const k = KINDS.find((x) => x.kind === this.wish!.kind)!;
        this.kept++;
        pl.reserve += ECOLOGY.wishHeat;
        pl.tell(`Wish met: ${k.name}. More heat`);
        this.wish = null;
        this.wishIn = this.between();
      } else if (this.wish.left <= 0 || pl.over) {
        this.wish = null;
        this.wishIn = this.between();
      }
      return;
    }
    if (pl.over || !this.anyAlive()) return;
    this.wishIn -= dt;
    if (this.wishIn > 0) return;
    // Wish for a kind not yet held, if there is one, else for the rarest; near a place where life is.
    const want = KINDS.filter((k) => k.kind !== 'moss' && !this.held.includes(k.kind));
    const pool = want.length ? want : KINDS.filter((k) => k.kind !== 'moss').sort((a, b) => this.count.get(a.kind)! - this.count.get(b.kind)!).slice(0, 2);
    const kind = pool[Math.floor(this.rand() * pool.length)].kind;
    const living: number[] = [];
    for (let v = 0; v < this.kind.length; v++) if (this.kind[v] >= 0) living.push(v);
    if (!living.length) return;
    const vertex = living[Math.floor(this.rand() * living.length)];
    const wish = { kind, vertex, left: ECOLOGY.wishLasts };
    if (this.here(wish) >= ECOLOGY.wishNeeds * this.scale) { this.wishIn = 3; return; } // already there: ask for something else
    this.wish = wish;
    const k = KINDS.find((x) => x.kind === kind)!;
    pl.tell(`Wanted where pencilled: ${k.name}, on ${k.wants}`);
  }

  /** How many vertices of the wished-for kind live near the wish. */
  here(w: Wish): number {
    const p = this.topo.basePositions, idx = KINDS.findIndex((k) => k.kind === w.kind);
    let c = 0;
    for (let v = 0; v < this.kind.length; v++) {
      if (this.kind[v] !== idx) continue;
      if (Math.hypot(p[v * 3] - p[w.vertex * 3], p[v * 3 + 1] - p[w.vertex * 3 + 1], p[v * 3 + 2] - p[w.vertex * 3 + 2]) < ECOLOGY.wishReach) c++;
    }
    return c;
  }

  private anyAlive(): boolean {
    for (let v = 0; v < this.kind.length; v++) if (this.kind[v] >= 0) return true;
    return false;
  }

  private between(): number {
    const [lo, hi] = ECOLOGY.wishEvery;
    return lo + (hi - lo) * this.rand();
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
