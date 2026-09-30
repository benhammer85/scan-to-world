/**
 * Volcano: you are a vent on the floor of an ocean planet. Build pressure,
 * erupt, and the lava you send out flows downhill and cools into rock, and
 * rock that stands above the sea is land. The planet pushes back: the sea
 * wears your coasts away, steep ground slumps and weathers, and a rival vent
 * raises land of its own and can bury yours, as you can bury its. Land that
 * stays quiet long enough is taken by life.
 *
 * This is the simulation alone, with no drawing, so it can be tested. Heights
 * are relative to the sea (0): the seafloor is below it, land above.
 */
import type { Topology } from '../mesh/topology';

export const VOLCANO = {
  /** The seafloor: how deep, and how much it undulates. Shallower near the vents, so an island is in reach. */
  floor: -0.32,
  undulation: 0.08,
  shoal: 0.14,
  shoalReach: 0.45,
  /** Fine roughness of the floor, so flows branch and islands grow in lobes, not as the mesh's hexagons. */
  rough: 0.035,
  /** Each eruption also breaks out at a flank this many steps down the slope, in its own direction, taking this share. */
  flank: 5,
  flankShare: 0.6,
  /**
   * Tipping the world steers the lava: it runs towards `downhill` (set from the bottom of the
   * screen) as if that way were this much steeper, per unit of distance.
   */
  tilt: 0.9,
  /** How strongly lava keeps to the steepest way down (1 spreads evenly, as a fluid; higher runs in tongues). */
  channel: 3,
  /** Lava flows towards lower neighbours at this rate per unit of height difference, per second. */
  flow: 10,
  /** Lava cools into rock at these rates per second: slowly on land, fast in the sea. */
  coolLand: 0.2,
  coolSea: 2.4,
  /** Thinner than this, lava is simply rock; thicker than `cover`, it clears the ground it runs over. */
  thin: 0.0015,
  cover: 0.006,
  /** An eruption: its volume for a full charge (and a gentle one), poured over so many seconds. */
  volume: 14,
  least: 1.6,
  pour: 2.6,
  /** Seconds of holding for a full charge. */
  charge: 3.5,
  /** The sea wears exposed coasts down at this rate (per second, for a coast open to the sea all round)... */
  waves: 0.0025,
  /** ...but no further than just below the sea: a worn coast becomes shallows. */
  shallows: -0.03,
  /** Ground steeper than this (height per unit distance) slumps towards its neighbours, at this rate. */
  talus: 2,
  slump: 0.6,
  /** Rain wears the high ground down, a little, in proportion to its height (per second). */
  rain: 0.0015,
  /** The rival erupts every so many seconds (between), more strongly as its land grows. */
  rivalEvery: [6, 12] as [number, number],
  rivalVolume: 9,
  /** Life takes quiet land after this many seconds, and is at its fullest after this many more. */
  lifeAfter: 20,
  lifeFull: 60,
  /** New vents: allowed once your land is this share of the world, up to so many. */
  ventsAt: 0.05,
  mostVents: 4,
};

export type Owner = 0 | 1 | 2; // nobody, you, the rival

export interface Vent { vertex: number; owner: Owner }

interface Eruption { vent: Vent; left: number; rate: number; flank: number }

export type Stage = 'seamount' | 'island' | 'volcano' | 'archipelago';

export class Planet {
  /** Rock height at each vertex, relative to the sea. */
  readonly rock: Float32Array;
  /** Molten lava lying on the rock. */
  readonly lava: Float32Array;
  /** Whose rock (and whose lava) it is. */
  readonly owner: Uint8Array;
  private lavaOwner: Uint8Array;
  /** Seconds since lava last covered each vertex (for fresh basalt, and for life). */
  readonly age: Float32Array;
  readonly vents: Vent[] = [];
  /** Which way is down for the lava, in the planet's own frame: the bottom of the screen, as you hold the world. */
  readonly downhill = { x: 0, y: -1, z: 0 };
  private eruptions: Eruption[] = [];
  private next: Float32Array;
  /** How steep the rock at each vertex may stand before it slumps, as a share of `talus`. */
  private firmness: Float32Array;
  private rivalIn = 5;
  private seed = 1;
  private erodeIn = 0;
  seconds = 0;

  constructor(private topo: Topology, you: number, rival: number) {
    const n = topo.vertexCount, p = topo.basePositions;
    this.rock = new Float32Array(n);
    this.lava = new Float32Array(n);
    this.owner = new Uint8Array(n);
    this.lavaOwner = new Uint8Array(n);
    this.age = new Float32Array(n).fill(1e6);
    this.next = new Float32Array(n);
    this.firmness = new Float32Array(n);
    const at = (v: number) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
    const a = at(you), b = at(rival);
    for (let v = 0; v < n; v++) {
      const [x, y, z] = at(v);
      const wave = (Math.sin(x * 3.1 + y * 1.7) + Math.sin(y * 2.3 - z * 2.9 + 1.3) + Math.sin(z * 2.7 + x * 1.9 - 0.7)) / 3;
      const near = (q: number[]) => Math.max(0, 1 - Math.hypot(x - q[0], y - q[1], z - q[2]) / VOLCANO.shoalReach);
      const fine = (Math.sin(x * 13.1 + z * 7.3) + Math.sin(y * 11.7 - x * 9.1 + 2.1) + Math.sin(z * 12.3 + y * 8.9 - 1.3)) / 3;
      this.firmness[v] = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(x * 17.3 + y * 5.1 - z * 11.9) * Math.sin(y * 13.7 + z * 6.3 + 0.7));
      this.rock[v] = VOLCANO.floor + VOLCANO.undulation * wave + VOLCANO.rough * fine + VOLCANO.shoal * (near(a) ** 2 + near(b) ** 2);
    }
    this.vents.push({ vertex: you, owner: 1 }, { vertex: rival, owner: 2 });
  }

  /** Erupt from a vent, with a charge from 0 (a gentle one) to 1 (full). */
  erupt(vent: Vent, charge: number): void {
    const c = Math.max(0, Math.min(1, charge));
    const volume = vent.owner === 2 ? VOLCANO.rivalVolume * (1 + this.landShare(2) * 8) : VOLCANO.least + (VOLCANO.volume - VOLCANO.least) * c;
    this.eruptions.push({ vent, left: volume, rate: volume / VOLCANO.pour, flank: this.flankOf(vent.vertex) });
  }

  /** A new vent of yours, on your own land near its coast; refused (false) if it isn't yet allowed or the ground won't do. */
  openVent(v: number): boolean {
    if (this.landShare(1) < VOLCANO.ventsAt || this.vents.filter((x) => x.owner === 1).length >= VOLCANO.mostVents) return false;
    if (this.owner[v] !== 1 || this.rock[v] < 0 || this.rock[v] > 0.12) return false;
    this.vents.push({ vertex: v, owner: 1 });
    return true;
  }

  get erupting(): boolean {
    return this.eruptions.length > 0;
  }

  /** How much lava is still flowing, over the whole world. */
  get molten(): number {
    let s = 0;
    for (let v = 0; v < this.lava.length; v++) s += this.lava[v];
    return s;
  }

  step(dt: number): void {
    this.seconds += dt;
    this.pour(dt);
    this.flow(dt);
    this.cool(dt);
    this.erodeIn -= dt;
    if (this.erodeIn <= 0) { this.erode(0.25); this.erodeIn = 0.25; }
    for (let v = 0; v < this.age.length; v++) if (this.lava[v] < VOLCANO.thin) this.age[v] += dt;
    this.rivalIn -= dt;
    if (this.rivalIn <= 0) {
      const theirs = this.vents.filter((x) => x.owner === 2);
      this.erupt(theirs[Math.floor(this.rand() * theirs.length)], 1);
      const [lo, hi] = VOLCANO.rivalEvery;
      this.rivalIn = lo + (hi - lo) * this.rand();
      // Grown enough, the rival opens a vent of its own on its coast too.
      if (this.landShare(2) > VOLCANO.ventsAt && theirs.length < VOLCANO.mostVents && this.rand() < 0.3) {
        for (let tries = 0; tries < 50; tries++) {
          const v = Math.floor(this.rand() * this.rock.length);
          if (this.owner[v] === 2 && this.rock[v] > 0 && this.rock[v] < 0.1) { this.vents.push({ vertex: v, owner: 2 }); break; }
        }
      }
    }
  }

  /**
   * Where an eruption breaks out on the flank: a few steps from the vent, in a direction of its
   * own, downhill where the ground allows. So each eruption sends a lobe its own way.
   */
  private flankOf(vent: number): number {
    const t = this.topo, p = t.basePositions;
    const ang = this.rand() * Math.PI * 2;
    // A direction in the ground's plane at the vent.
    const nx = p[vent * 3], ny = p[vent * 3 + 1], nz = p[vent * 3 + 2];
    const ux = Math.abs(ny) < 0.9 ? 0 : 1, uy = Math.abs(ny) < 0.9 ? 1 : 0;
    let ax = uy * nz - 0 * ny, ay = 0 * nx - ux * nz, az = ux * ny - uy * nx;
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
    const dx = ax * Math.cos(ang) + bx * Math.sin(ang), dy = ay * Math.cos(ang) + by * Math.sin(ang), dz = az * Math.cos(ang) + bz * Math.sin(ang);
    let v = vent;
    for (let k = 0; k < VOLCANO.flank; k++) {
      let best = v, score = -Infinity;
      for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) {
        const w = t.nbrList[q];
        const ex = p[w * 3] - p[v * 3], ey = p[w * 3 + 1] - p[v * 3 + 1], ez = p[w * 3 + 2] - p[v * 3 + 2];
        const along = (ex * dx + ey * dy + ez * dz) / (Math.hypot(ex, ey, ez) || 1);
        const s = along - (this.rock[w] - this.rock[v]) * 4;
        if (s > score) { score = s; best = w; }
      }
      v = best;
    }
    return v;
  }

  /** Lava poured from each erupting vent, into it and the ring round it, and out at its flank. */
  private pour(dt: number): void {
    const t = this.topo;
    const put = (v: number, amount: number, owner: Owner) => {
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1], share = amount / (1 + (b - a) * 0.5);
      this.lava[v] += share;
      this.lavaOwner[v] = owner;
      for (let q = a; q < b; q++) { const w = t.nbrList[q]; this.lava[w] += share * 0.5; this.lavaOwner[w] = owner; }
    };
    for (const e of this.eruptions) {
      const amount = Math.min(e.left, e.rate * dt);
      e.left -= amount;
      put(e.vent.vertex, amount * (1 - VOLCANO.flankShare), e.vent.owner);
      put(e.flank, amount * VOLCANO.flankShare, e.vent.owner);
    }
    this.eruptions = this.eruptions.filter((e) => e.left > 1e-6);
  }

  /** Lava runs downhill: each vertex sends some of its lava to its lower neighbours, in proportion to how much lower. */
  private flow(dt: number): void {
    const t = this.topo, n = this.rock.length, next = this.next;
    next.set(this.lava);
    for (let v = 0; v < n; v++) {
      const l = this.lava[v];
      if (l < VOLCANO.thin) continue;
      const s = this.rock[v] + l, a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      // It leaves by the ways down, but mostly by the steepest, so flows run in tongues and
      // islands grow in lobes rather than spreading as even rings. Tipping the world tips the
      // ways down: towards the bottom of the screen counts as steeper.
      const p = t.basePositions, g = this.downhill;
      const drop = (w: number) => {
        const ex = p[w * 3] - p[v * 3], ey = p[w * 3 + 1] - p[v * 3 + 1], ez = p[w * 3 + 2] - p[v * 3 + 2];
        return s - (this.rock[w] + this.lava[w]) + VOLCANO.tilt * (ex * g.x + ey * g.y + ez * g.z);
      };
      let sum = 0, weights = 0;
      for (let q = a; q < b; q++) { const d = drop(t.nbrList[q]); if (d > 0) { sum += d; weights += Math.pow(d, VOLCANO.channel); } }
      if (sum <= 0) continue;
      const out = Math.min(l * 0.5, VOLCANO.flow * dt * sum * l / (l + 0.02));
      next[v] -= out;
      for (let q = a; q < b; q++) {
        const w = t.nbrList[q], d = drop(w);
        if (d <= 0) continue;
        next[w] += (out * Math.pow(d, VOLCANO.channel)) / weights;
        if (this.lava[w] < l) this.lavaOwner[w] = this.lavaOwner[v];
      }
    }
    this.lava.set(next);
  }

  /** Lava cools into rock: slowly on land, fast where it meets the sea. The rock is whoever's lava it was. */
  private cool(dt: number): void {
    for (let v = 0; v < this.rock.length; v++) {
      const l = this.lava[v];
      if (l <= 0) continue;
      const sea = this.rock[v] + l < 0;
      const solid = l < VOLCANO.thin ? l : l * (1 - Math.exp(-(sea ? VOLCANO.coolSea : VOLCANO.coolLand) * dt));
      this.lava[v] -= solid;
      this.rock[v] += solid;
      this.owner[v] = this.lavaOwner[v];
      if (l > VOLCANO.cover) this.age[v] = 0; // a real covering of lava clears the ground; a trickle does not
    }
  }

  /** The planet's own forces: the sea at the coasts, the slumping of steep ground, rain on the heights. */
  private erode(dt: number): void {
    const t = this.topo, n = this.rock.length, p = t.basePositions, r = this.rock;
    const next = this.next;
    next.set(r);
    for (let v = 0; v < n; v++) {
      if (this.lava[v] > VOLCANO.thin) continue;
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      if (r[v] > VOLCANO.shallows) {
        // The sea: a coast wears in proportion to how open it is to the water.
        let sea = 0;
        for (let q = a; q < b; q++) if (r[t.nbrList[q]] < 0) sea++;
        if (sea && r[v] > VOLCANO.shallows) next[v] -= Math.min(r[v] - VOLCANO.shallows, VOLCANO.waves * dt * (sea / (b - a)) * 2);
      }
      if (r[v] > 0) next[v] -= VOLCANO.rain * dt * r[v];
      // Slumping: too steep, and the ground slides towards its lower neighbours.
      for (let q = a; q < b; q++) {
        const w = t.nbrList[q];
        const d = Math.hypot(p[v * 3] - p[w * 3], p[v * 3 + 1] - p[w * 3 + 1], p[v * 3 + 2] - p[w * 3 + 2]) || 1e-6;
        const drop = r[v] - r[w];
        // How steep the ground may stand varies with the rock, so the land's edges are its own, not the mesh's.
        const talus = VOLCANO.talus * this.firmness[v];
        if (drop / d > talus) {
          const move = (drop - talus * d) * 0.5 * Math.min(1, VOLCANO.slump * dt);
          next[v] -= move;
          next[w] += move;
          if (this.owner[w] === 0) this.owner[w] = this.owner[v];
        }
      }
    }
    r.set(next);
  }

  /** The share of the world's surface that is this owner's land (above the sea). */
  landShare(who: Owner): number {
    let k = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.rock[v] > 0 && this.owner[v] === who) k++;
    return k / this.rock.length;
  }

  /** Your highest ground, relative to the sea. */
  peak(who: Owner): number {
    let m = -Infinity;
    for (let v = 0; v < this.rock.length; v++) if (this.owner[v] === who) m = Math.max(m, this.rock[v]);
    return m;
  }

  /** How far your volcano has come: under the sea, an island, a great volcano, an archipelago. */
  stage(): Stage {
    const land = this.landShare(1), peak = this.peak(1);
    if (peak < 0 || land === 0) return 'seamount';
    if (land >= VOLCANO.ventsAt) return 'archipelago';
    if (peak > 0.18 && land > 0.015) return 'volcano';
    return 'island';
  }

  /** How much life there is on land at a vertex, 0 to 1: quiet land is taken by it. */
  life(v: number): number {
    if (this.rock[v] <= 0.005) return 0;
    return Math.max(0, Math.min(1, (this.age[v] - VOLCANO.lifeAfter) / VOLCANO.lifeFull));
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
