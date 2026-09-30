/**
 * Volcano: you are the heat beneath a young ocean planet, a mantle plume.
 *
 * The world begins smooth: one sea over one even floor, nothing on it. You
 * have a finite store of heat, and it rises out of you by itself, fastest at
 * first and slower as the planet cools, gathering as pressure where the plume
 * is. You decide only how to let it out and where:
 *
 *   let it out often, and it comes gently: fluid lava that runs and spreads
 *     into wide, low, lasting shields;
 *   let it build, and it bursts: ash thrown up and falling round the vent into
 *     a tall steep cone, soft and quick to wear away, but fertile;
 *   hold it too long, and it bursts on its own and tears the mountain open,
 *     its summit falling into the emptied chamber as a caldera.
 *
 * The plume creeps beneath the crust, slowly and on its own, and faster
 * towards where you call it; the land it leaves behind loses its warmth and
 * sinks, so a trail of islands is left behind it, old ones drowning as new
 * ones rise.
 *
 * Life begins in the warm water at the vents and spreads, into the shallows
 * as reefs and onto quiet land. It holds the ground together against the
 * rain and the sea, and reefs build up towards the light, so a sinking island
 * can leave a ring of reef behind. Lava clears it, ash kills it but makes the
 * ground rich, and the sky throws stones: impacts crater the ground and kill
 * what lives there (though their heat joins yours).
 *
 * Nothing opposes you but the planet itself: the sea, the rain, the sinking,
 * the stones, and the cooling, which is the clock. When the heat is gone, the
 * fire is out, and what you leave is whatever land and life last.
 *
 * This is the simulation alone, with no drawing, so it can be tested. Heights
 * are relative to the sea (0). Volumes are for a planet of `REFERENCE`
 * vertices and scale with the mesh, so a coarser test planet plays the same.
 */
import type { Topology } from '../mesh/topology';

const REFERENCE = 16002; // an icosphere of detail 40

export const VOLCANO = {
  /** The seafloor at the start: even, with only a fine roughness, so flows branch rather than following the mesh. */
  floor: -0.25,
  rough: 0.012,

  /**
   * The store of heat, and how fast it rises out: `rising` a second at first, less as the store
   * empties (as the square root of what is left), so it slows steadily and runs out after
   * `2 * heat / rising` seconds, about ten minutes, unless the sky adds to it.
   */
  heat: 420,
  rising: 1.4,
  /** Pressure bursts out on its own at this much; above `explosive`, an eruption is a burst rather than a flow. */
  cap: 24,
  explosive: 7,
  /** Burst out on its own, it tears the mountain open: a caldera this wide and deep, and death this far. */
  caldera: 0.09,
  calderaDepth: 0.12,
  calderaKills: 0.35,
  /** Less than this, and there isn't enough to erupt. */
  least: 0.6,
  /** Seconds an eruption takes to pour out. */
  pour: 2.2,

  /** A flow also breaks out at a flank this many steps down the slope, in its own direction, taking this share. */
  flank: 5,
  flankShare: 0.6,
  /** A burst throws this share of itself up as ash, falling within `ashReach` of the vent; the rest wells out as lava. */
  ashShare: 0.65,
  ashReach: 0.1,
  /** ...kills life out to this far, and dusts the ground out to `ashDusts`, making it rich for a long while. */
  ashKills: 0.13,
  ashDusts: 0.32,
  richLasts: 240,

  /** Tipping the world steers the lava: towards `downhill` counts as this much steeper, per unit of distance. */
  tilt: 0.9,
  /** How strongly lava keeps to the steepest way down (1 spreads evenly; higher runs in tongues). */
  channel: 3,
  flow: 10,
  /** Lava cools into rock at these rates per second: slowly on land, fast in the sea. */
  coolLand: 0.2,
  coolSea: 2.4,
  /** Thinner than this, lava is simply rock; thicker than `cover`, it clears the ground it runs over. */
  thin: 0.0015,
  cover: 0.006,

  /** The plume creeps on its own at this many radians a second, and towards where you call it at this. */
  drift: 0.0022,
  creep: 0.035,
  /** Its warmth reaches about this far. Warm ground swells a little; ground that has lost its warmth sinks. */
  warmth: 0.28,
  swell: 0.00025,
  sink: 0.0004,
  /** Cooled ground sinks no further than this, all told. */
  sinks: 0.09,

  /**
   * The sea wears exposed coasts at this rate, no further than the shallows; a coast behind
   * shallows is sheltered, since the waves break before they reach it. Rain wears the heights.
   */
  waves: 0.0018,
  breaks: 0.12,
  shallows: -0.03,
  rain: 0.0015,
  /** Ground steeper than this (height per unit distance, times its firmness) slumps, at this rate. */
  talus: 2,
  slump: 0.6,
  /** Ash is soft: it wears this many times faster than lava rock. */
  softer: 3,

  /** Life begins at the vents after this many seconds, in warm water no deeper than `vents`. */
  origin: 40,
  vents: -0.3,
  /** How fast life grows where it is, and reaches out to where it isn't (per second). */
  grow: 0.08,
  spread: 0.12,
  /** Bare rock takes this long to become ground life can take; rich ground, only `ashSoil`, and life grows there faster. */
  soil: 18,
  ashSoil: 5,
  /** Reefs: life in the shallows above `reefDeep` builds rock up towards the surface, at this rate. */
  reefDeep: -0.07,
  reef: 0.0012,
  /** Where life is at its fullest, the rain and the sea wear the ground this much less. */
  holds: 0.75,

  /** Stones from the sky: one every so many seconds (between), fewer as the planet ages; a crater's size. */
  impactEvery: [35, 70] as [number, number],
  impactWarning: 4,
  crater: 0.07,
  craterDepth: 0.06,
  impactHeat: 8,
};

export type Era = 'young' | 'burning' | 'cooling' | 'embers' | 'out';

interface Eruption { vertex: number; flank: number; left: number; rate: number }

export interface Impact { vertex: number; in: number }

export class Planet {
  /** Rock height at each vertex, relative to the sea. */
  readonly rock: Float32Array;
  /** Molten lava lying on the rock. */
  readonly lava: Float32Array;
  /** Seconds since lava last covered each vertex. */
  readonly age: Float32Array;
  /** How much of the ground is ash, 0 to 1: soft, and fertile. */
  readonly ash: Float32Array;
  /** How rich the ground is with fallen ash, 0 to 1: life takes it sooner and grows there faster. */
  readonly rich: Float32Array;
  /** Life at each vertex, 0 to 1: on land, and as reef in the shallows. */
  readonly life: Float32Array;
  /** How far the ground has sunk since it cooled. */
  private sunk: Float32Array;
  /** Which way is down for the lava, in the planet's own frame: the bottom of the screen, as you hold the world. */
  readonly downhill = { x: 0, y: -1, z: 0 };
  /** Where the plume is, as a unit vector, and the vertex above it. */
  readonly plume = { x: 0, y: 0, z: 1 };
  plumeVertex = 0;
  /** Where you have called the heat to, if anywhere. */
  target: { x: number; y: number; z: number } | null = null;

  /** Heat still in store, and gathered as pressure ready to come out. */
  reserve = VOLCANO.heat;
  pressure = 0;
  /** A stone on its way, if one is. */
  impact: Impact | null = null;
  /** What happened lately, for the words on the page: taken and cleared by whoever shows them. */
  readonly news: string[] = [];
  seconds = 0;

  private eruptions: Eruption[] = [];
  private next: Float32Array;
  private firmness: Float32Array;
  private drift: { x: number; y: number; z: number };
  private scale: number;
  private seed: number;
  private slowIn = 0;
  private impactIn: number;
  private began = false;
  private alive = false;

  constructor(private topo: Topology, start: number, seed = 1) {
    const n = topo.vertexCount, p = topo.basePositions;
    this.scale = n / REFERENCE;
    this.seed = seed;
    this.rock = new Float32Array(n);
    this.lava = new Float32Array(n);
    this.age = new Float32Array(n).fill(1e6);
    this.ash = new Float32Array(n);
    this.rich = new Float32Array(n);
    this.life = new Float32Array(n);
    this.sunk = new Float32Array(n);
    this.next = new Float32Array(n);
    this.firmness = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
      const fine = (Math.sin(x * 13.1 + z * 7.3) + Math.sin(y * 11.7 - x * 9.1 + 2.1) + Math.sin(z * 12.3 + y * 8.9 - 1.3)) / 3;
      this.firmness[v] = 0.55 + 0.9 * (0.5 + 0.5 * Math.sin(x * 17.3 + y * 5.1 - z * 11.9) * Math.sin(y * 13.7 + z * 6.3 + 0.7));
      this.rock[v] = VOLCANO.floor + VOLCANO.rough * fine;
    }
    this.plume.x = p[start * 3]; this.plume.y = p[start * 3 + 1]; this.plume.z = p[start * 3 + 2];
    this.plumeVertex = start;
    // The crust slides over the plume one way, all game: a direction across the plume, chosen once.
    const a = this.rand() * Math.PI * 2;
    const t1 = unit(cross(this.plume, Math.abs(this.plume.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
    const t2 = cross(this.plume, t1);
    this.drift = { x: t1.x * Math.cos(a) + t2.x * Math.sin(a), y: t1.y * Math.cos(a) + t2.y * Math.sin(a), z: t1.z * Math.cos(a) + t2.z * Math.sin(a) };
    this.impactIn = this.between(VOLCANO.impactEvery);
  }

  /** The share of the heat you began with that is still to come, gathered or not. */
  get heatLeft(): number {
    return (this.reserve + this.pressure) / VOLCANO.heat;
  }

  get era(): Era {
    const f = this.heatLeft;
    if (this.over) return 'out';
    return f > 0.7 ? 'young' : f > 0.4 ? 'burning' : f > 0.15 ? 'cooling' : 'embers';
  }

  /** The fire is out: no heat left to speak of, and nothing still flowing. */
  get over(): boolean {
    return this.reserve + this.pressure < VOLCANO.least && !this.erupting && this.molten < 0.01;
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

  /** Whether the pressure is enough that letting it out now would be a burst. */
  get bursting(): boolean {
    return this.pressure >= VOLCANO.explosive;
  }

  /**
   * Let the pressure out at the plume: all of it, as a flow if there is little, as a burst if it
   * has built. Returns what kind it was, or null if there wasn't enough.
   */
  erupt(blast = false): 'flow' | 'burst' | null {
    const volume = this.pressure;
    if (volume < VOLCANO.least) return null;
    this.pressure = 0;
    const v = this.plumeVertex, s = this.scale;
    if (volume < VOLCANO.explosive) {
      this.eruptions.push({ vertex: v, flank: this.flankOf(v), left: volume * s, rate: (volume * s) / VOLCANO.pour });
      return 'flow';
    }
    // A burst: most of it thrown up as ash that falls round the vent, the rest welling out.
    // Torn open, it throws its ash far and wide rather than piling it on the summit.
    this.fallOfAsh(v, volume * VOLCANO.ashShare * s, blast ? 3 : 1);
    const lava = volume * (1 - VOLCANO.ashShare) * s;
    this.eruptions.push({ vertex: v, flank: v, left: lava, rate: lava / VOLCANO.pour });
    return 'burst';
  }

  /** Call the heat towards a point on the world (a unit vector); it creeps there beneath the crust. */
  callTo(x: number, y: number, z: number): void {
    this.target = unit({ x, y, z });
  }

  step(dt: number): void {
    this.seconds += dt;
    // The heat rises out of its store: fast at first, slower as the planet cools, and then it is gone.
    const rise = Math.min(this.reserve, VOLCANO.rising * Math.sqrt(Math.max(0, this.reserve) / VOLCANO.heat) * dt + 1e-4 * dt);
    this.reserve -= rise;
    this.pressure += rise;
    if (this.pressure >= VOLCANO.cap) { this.collapse(); this.erupt(true); this.news.push('Held too long, the mountain tears open'); }
    // The store is spent: whatever pressure is left comes out by itself, the last of the fire.
    if (this.reserve < 0.01 && this.pressure >= VOLCANO.least && !this.erupting) { this.erupt(); this.news.push('The last of the heat comes out'); }
    if (this.reserve < 0.01 && this.pressure < VOLCANO.least) this.pressure = 0;
    this.movePlume(dt);
    this.pour(dt);
    this.flow(dt);
    this.cool(dt);
    for (let v = 0; v < this.age.length; v++) if (this.lava[v] < VOLCANO.thin) this.age[v] += dt;
    this.slowIn -= dt;
    if (this.slowIn <= 0) { this.slow(0.25); this.slowIn = 0.25; }
    this.stones(dt);
  }

  /** The summit falls into the emptied chamber, and the blast kills all round. */
  private collapse(): void {
    const p = this.topo.basePositions, at = this.plumeVertex, r = VOLCANO.caldera;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < r) this.rock[v] -= VOLCANO.calderaDepth * (1 - (d / r) ** 2) * Math.min(1, Math.max(0, this.rock[v] - VOLCANO.floor) * 4);
      if (d < VOLCANO.calderaKills) this.life[v] *= (d / VOLCANO.calderaKills) ** 3;
    }
  }

  /** A stone from the sky, at a vertex: a crater with a raised rim, and death round it. Its heat joins yours. */
  strike(at: number): void {
    const p = this.topo.basePositions, r = VOLCANO.crater;
    for (let v = 0; v < this.rock.length; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d > r * 2.5) continue;
      const k = d / r;
      // Dug out within the crater, thrown up as a rim just beyond it.
      this.rock[v] += VOLCANO.craterDepth * (k < 1 ? -(1 - k * k) : 0.35 * Math.exp(-((k - 1.15) ** 2) / 0.08));
      this.life[v] *= Math.min(1, k / 2.5);
      if (k < 1.5) this.age[v] = 0;
    }
    this.reserve += VOLCANO.impactHeat;
  }

  /** The share of the world that is land (above the sea). */
  landShare(): number {
    let k = 0;
    for (let v = 0; v < this.rock.length; v++) if (this.rock[v] > 0) k++;
    return k / this.rock.length;
  }

  /** The share of the world that is alive, on land or as reef. */
  lifeShare(): number {
    let k = 0;
    for (let v = 0; v < this.life.length; v++) k += this.life[v];
    return k / this.life.length;
  }

  /** The highest ground on the world, relative to the sea. */
  peak(): number {
    let m = -Infinity;
    for (let v = 0; v < this.rock.length; v++) m = Math.max(m, this.rock[v]);
    return m;
  }

  // ------------------------------------------------------------------ the plume

  private movePlume(dt: number): void {
    const q = this.plume;
    // On its own, slowly one way; towards where it's called, faster, until it gets there.
    let mx = this.drift.x * VOLCANO.drift, my = this.drift.y * VOLCANO.drift, mz = this.drift.z * VOLCANO.drift;
    if (this.target) {
      const t = this.target, along = t.x * q.x + t.y * q.y + t.z * q.z;
      const tx = t.x - along * q.x, ty = t.y - along * q.y, tz = t.z - along * q.z, tl = Math.hypot(tx, ty, tz);
      const angle = Math.acos(Math.min(1, along));
      if (angle < 0.01 || tl < 1e-6) this.target = null;
      else { const sp = Math.min(VOLCANO.creep, angle / dt); mx += (tx / tl) * sp; my += (ty / tl) * sp; mz += (tz / tl) * sp; }
    }
    const moved = unit({ x: q.x + mx * dt, y: q.y + my * dt, z: q.z + mz * dt });
    // The drift stays across the plume as it goes round the world.
    const d = this.drift, dd = d.x * moved.x + d.y * moved.y + d.z * moved.z;
    Object.assign(this.drift, unit({ x: d.x - dd * moved.x, y: d.y - dd * moved.y, z: d.z - dd * moved.z }));
    Object.assign(q, moved);
    // The vertex above it: walk to whichever neighbour is nearer until none is.
    const t = this.topo, p = t.basePositions, dist = (v: number) => (p[v * 3] - q.x) ** 2 + (p[v * 3 + 1] - q.y) ** 2 + (p[v * 3 + 2] - q.z) ** 2;
    let v = this.plumeVertex;
    for (let moves = 0; moves < 50; moves++) {
      let best = v;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) if (dist(t.nbrList[k]) < dist(best)) best = t.nbrList[k];
      if (best === v) break;
      v = best;
    }
    this.plumeVertex = v;
  }

  // ------------------------------------------------------------------ eruptions

  /**
   * Where a flow breaks out on the flank: a few steps from the vent, in a direction of its own,
   * downhill where the ground allows. So each flow sends a lobe its own way.
   */
  private flankOf(vent: number): number {
    const t = this.topo, p = t.basePositions;
    const ang = this.rand() * Math.PI * 2;
    const n = { x: p[vent * 3], y: p[vent * 3 + 1], z: p[vent * 3 + 2] };
    const a = unit(cross(n, Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })), b = cross(n, a);
    const dx = a.x * Math.cos(ang) + b.x * Math.sin(ang), dy = a.y * Math.cos(ang) + b.y * Math.sin(ang), dz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
    let v = vent;
    for (let k = 0; k < VOLCANO.flank; k++) {
      let best = v, score = -Infinity;
      for (let q = t.nbrOffsets[v]; q < t.nbrOffsets[v + 1]; q++) {
        const w = t.nbrList[q];
        const ex = p[w * 3] - p[v * 3], ey = p[w * 3 + 1] - p[v * 3 + 1], ez = p[w * 3 + 2] - p[v * 3 + 2];
        const s = (ex * dx + ey * dy + ez * dz) / (Math.hypot(ex, ey, ez) || 1) - (this.rock[w] - this.rock[v]) * 4;
        if (s > score) { score = s; best = w; }
      }
      v = best;
    }
    return v;
  }

  /** Ash falls round a vent, thickest nearest: a cone of soft ground, and death further out. */
  private fallOfAsh(at: number, volume: number, wide: number): void {
    const p = this.topo.basePositions, r = VOLCANO.ashReach * wide, n = this.rock.length;
    const w = this.next;
    let sum = 0;
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(p[v * 3] - p[at * 3], p[v * 3 + 1] - p[at * 3 + 1], p[v * 3 + 2] - p[at * 3 + 2]);
      if (d < VOLCANO.ashKills * wide) this.life[v] *= (d / (VOLCANO.ashKills * wide)) ** 2;
      if (d < VOLCANO.ashDusts * wide) this.rich[v] = Math.max(this.rich[v], 1 - (d / (VOLCANO.ashDusts * wide)) ** 2);
      w[v] = d < r * 3 ? Math.exp(-((d / r) ** 2)) : 0;
      sum += w[v];
    }
    for (let v = 0; v < n; v++) {
      if (!w[v]) continue;
      const add = (volume * w[v]) / sum;
      this.rock[v] += add;
      this.ash[v] = Math.min(1, this.ash[v] + add * 40);
      this.age[v] = Math.min(this.age[v], add > 0.003 ? 0 : this.age[v]);
    }
  }

  /** Lava poured from each eruption, into the vent and the ring round it, and out at its flank. */
  private pour(dt: number): void {
    const t = this.topo;
    const put = (v: number, amount: number) => {
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1], share = amount / (1 + (b - a) * 0.5);
      this.lava[v] += share;
      for (let q = a; q < b; q++) this.lava[t.nbrList[q]] += share * 0.5;
    };
    for (const e of this.eruptions) {
      const amount = Math.min(e.left, e.rate * dt);
      e.left -= amount;
      const flank = e.flank === e.vertex ? 0 : VOLCANO.flankShare;
      put(e.vertex, amount * (1 - flank));
      if (flank) put(e.flank, amount * flank);
    }
    this.eruptions = this.eruptions.filter((e) => e.left > 1e-6);
  }

  /** Lava runs downhill, mostly by the steepest way, and tipping the world tips the ways down. */
  private flow(dt: number): void {
    const t = this.topo, n = this.rock.length, next = this.next, p = t.basePositions, g = this.downhill;
    next.set(this.lava);
    for (let v = 0; v < n; v++) {
      const l = this.lava[v];
      if (l < VOLCANO.thin) continue;
      const s = this.rock[v] + l, a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
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
        if (d > 0) next[w] += (out * Math.pow(d, VOLCANO.channel)) / weights;
      }
    }
    this.lava.set(next);
  }

  /** Lava cools into rock: slowly on land, fast where it meets the sea. A real covering clears the ground. */
  private cool(dt: number): void {
    for (let v = 0; v < this.rock.length; v++) {
      const l = this.lava[v];
      if (l <= 0) continue;
      const sea = this.rock[v] + l < 0;
      const solid = l < VOLCANO.thin ? l : l * (1 - Math.exp(-(sea ? VOLCANO.coolSea : VOLCANO.coolLand) * dt));
      this.lava[v] -= solid;
      this.rock[v] += solid;
      if (l > VOLCANO.cover) { this.age[v] = 0; this.life[v] = 0; this.ash[v] = 0; this.rich[v] = 0; }
    }
  }

  // ------------------------------------------------------------------ the slow forces

  /** The planet's own slow work, every quarter second: warmth and sinking, the sea, the rain, slumping, and life. */
  private slow(dt: number): void {
    const t = this.topo, n = this.rock.length, p = t.basePositions, r = this.rock, q = this.plume;
    const next = this.next;
    next.set(r);
    const burning = Math.min(1, this.heatLeft * 2);
    for (let v = 0; v < n; v++) {
      const a = t.nbrOffsets[v], b = t.nbrOffsets[v + 1];
      const d = Math.hypot(p[v * 3] - q.x, p[v * 3 + 1] - q.y, p[v * 3 + 2] - q.z);
      const warm = Math.exp(-((d / VOLCANO.warmth) ** 2)) * burning;
      // Warm ground swells over the plume; ground the plume has left cools and sinks.
      next[v] += VOLCANO.swell * dt * warm;
      this.sunk[v] = Math.max(0, this.sunk[v] - VOLCANO.swell * dt * warm);
      if (this.sunk[v] < VOLCANO.sinks) { const s = VOLCANO.sink * dt * (1 - warm); next[v] -= s; this.sunk[v] += s; }
      if (this.lava[v] > VOLCANO.thin) continue;
      const wear = (1 + (VOLCANO.softer - 1) * this.ash[v]) * (1 - VOLCANO.holds * this.life[v]);
      if (r[v] > VOLCANO.shallows) {
        // Open to deep water, the waves strike hard; behind shallows, or a reef, they have broken already.
        let sea = 0;
        for (let k = a; k < b; k++) { const w = t.nbrList[k]; if (r[w] < 0) sea += Math.min(1, -r[w] / VOLCANO.breaks) * (1 - VOLCANO.holds * this.life[w]); }
        if (sea) next[v] -= Math.min(r[v] - VOLCANO.shallows, VOLCANO.waves * dt * (sea / (b - a)) * 2 * wear);
      }
      if (r[v] > 0) next[v] -= VOLCANO.rain * dt * r[v] * wear;
      // Too steep, and the ground slides towards its lower neighbours; ash stands less steeply than lava rock.
      const talus = VOLCANO.talus * this.firmness[v] * (1 - 0.4 * this.ash[v]);
      for (let k = a; k < b; k++) {
        const w = t.nbrList[k];
        const dd = Math.hypot(p[v * 3] - p[w * 3], p[v * 3 + 1] - p[w * 3 + 1], p[v * 3 + 2] - p[w * 3 + 2]) || 1e-6;
        const drop = r[v] - r[w];
        if (drop / dd > talus) {
          const move = (drop - talus * dd) * 0.5 * Math.min(1, VOLCANO.slump * dt);
          next[v] -= move;
          next[w] += move;
        }
      }
      // Reefs build up towards the light, but no further than the surface.
      if (this.life[v] > 0.2 && r[v] < -0.004 && r[v] > VOLCANO.reefDeep) next[v] += Math.min(-0.004 - r[v], VOLCANO.reef * dt * this.life[v]);
    }
    r.set(next);
    this.living(dt);
  }

  /** How much life the ground at a vertex could hold, 0 to 1. */
  private room(v: number): number {
    const h = this.rock[v];
    if (this.lava[v] > VOLCANO.thin) return 0;
    if (h < 0) return h > VOLCANO.reefDeep ? 0.7 : 0; // the shallows, as reef; the deep holds none
    const soil = VOLCANO.soil + (VOLCANO.ashSoil - VOLCANO.soil) * this.rich[v];
    return Math.min(1, this.age[v] / soil) * (0.7 + 0.3 * this.rich[v]);
  }

  private living(dt: number): void {
    const t = this.topo, n = this.life.length, L = this.life, next = this.next;
    // The first life: in the warm water at the vent, once the world has settled a little.
    // If it all dies, it can begin again there, as it did before.
    if (!this.alive && this.seconds > VOLCANO.origin && !this.over) {
      const v = this.warmWater();
      if (v >= 0) {
        L[v] = 0.5;
        for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) L[t.nbrList[k]] = 0.3;
        this.news.push(this.began ? 'Life begins again at the vents' : 'Life begins in the warm water at the vents');
        this.began = true;
      }
    }
    let alive = false;
    for (let v = 0; v < n; v++) {
      this.rich[v] = Math.max(0, this.rich[v] - dt / VOLCANO.richLasts);
      const room = this.room(v);
      let near = 0;
      for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) near = Math.max(near, L[t.nbrList[k]]);
      let l = L[v];
      if (room <= 0) l = Math.max(0, l - dt * 0.5); // the deep, or fresh lava: it dies back
      else if (l < room) l = Math.min(room, l + dt * (VOLCANO.grow * l + VOLCANO.spread * near * near) * room * (1 + 2 * this.rich[v]));
      else l = Math.max(room, l - dt * 0.05);
      if (l < 0.002) l = 0;
      if (l > 0) alive = true;
      next[v] = l;
    }
    L.set(next.subarray(0, n));
    this.alive = alive;
  }

  /** The nearest water to the plume that is warm and not too deep, or -1: a few rings out, at most. */
  private warmWater(): number {
    const t = this.topo;
    let ring = [this.plumeVertex];
    const seen = new Set(ring);
    for (let step = 0; step < 40; step++) {
      for (const v of ring) if (this.rock[v] < -0.005 && this.rock[v] > VOLCANO.vents && this.lava[v] < VOLCANO.thin) return v;
      const out: number[] = [];
      for (const v of ring) for (let k = t.nbrOffsets[v]; k < t.nbrOffsets[v + 1]; k++) { const w = t.nbrList[k]; if (!seen.has(w)) { seen.add(w); out.push(w); } }
      ring = out;
    }
    return -1;
  }

  /** The stones from the sky: fewer as the planet ages, each seen coming a few seconds before it lands. */
  private stones(dt: number): void {
    if (this.impact) {
      this.impact.in -= dt;
      if (this.impact.in <= 0) { this.strike(this.impact.vertex); this.impact = null; this.news.push('A stone from the sky'); }
      return;
    }
    if (this.over) return;
    this.impactIn -= dt * this.heatLeft;
    if (this.impactIn > 0) return;
    this.impactIn = this.between(VOLCANO.impactEvery);
    // Half of them fall near the plume, where they matter; the rest anywhere.
    const p = this.topo.basePositions;
    for (let tries = 0; tries < 200; tries++) {
      const v = Math.floor(this.rand() * this.rock.length);
      const d = Math.hypot(p[v * 3] - this.plume.x, p[v * 3 + 1] - this.plume.y, p[v * 3 + 2] - this.plume.z);
      if (d < 0.08) continue; // not on the vent itself
      if (this.rand() < 0.5 || d < 0.5) { this.impact = { vertex: v, in: VOLCANO.impactWarning }; return; }
    }
  }

  private between([lo, hi]: [number, number]): number {
    return lo + (hi - lo) * this.rand();
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}

type V3 = { x: number; y: number; z: number };
function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function unit(a: V3): V3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
