/**
 * The atolls: the ocean world's chain of islands, a million years on, sinking as the sea floor carries them away
 * from the hot spot. Each island is a place where an atoll can be made: its shore, a ring round it, ringed with
 * living reef that keeps up with the sinking, until the island itself is gone under and only the ring is left at
 * the surface round a lagoon, as Darwin worked out in 1842. Islands no reef grew round just drown.
 *
 * The islands are found once, on the ground the world begins on; each keeps its middle (the land as it was) and
 * its ring (the shallows just off its shore, where the reef must stand).
 */
import type { Topology } from '../mesh/topology';

export interface AtollPlace {
  /** The island's middle, on the unit sphere, and how far its shore lies from it (radians). */
  centre: { x: number; y: number; z: number };
  r: number;
  /** The land it stood on when the world began. */
  core: number[];
  /** The ring just off its shore, where the reef must stand for it to be an atoll. */
  ring: number[];
}

export const ATOLLS = {
  /** Land on fewer vertices than this (on a planet of the drawn detail) is a rock, not an island to make an atoll of. */
  least: 6,
  /** The ring: from the shore out this far again (a share of the island's own radius), and at least this wide (radians). */
  ringOut: 0.55,
  ringLeast: 0.035,
  /** Reef counts in the ring once it's alive and within this of the surface. */
  near: -0.03,
  /** An atoll is made when its island has gone under and this share of its ring is living reef near the surface. */
  share: 0.5,
  /** Living, as the reef: at least this much life. */
  living: 0.2,
  /** A million years on, the oldest island's peak stands this far above the sea, and each younger one this much higher. */
  lowest: 0.025,
  higher: 0.015,
  /** Coral begins round an island once the volcano has come within this of its shore (radians), and rings it in this many seconds. */
  reach: 0.1,
  grows: 30,
};

type Ground = { rock: ArrayLike<number>; life: ArrayLike<number> };
type LiveGround = { rock: ArrayLike<number>; life: Float32Array; lava: ArrayLike<number> };

/** The islands of the ground as the world begins: each a place an atoll could be made. Largest first, at most `most`. */
export function atollPlaces(rock: ArrayLike<number>, topo: Topology, most = 7): AtollPlace[] {
  const n = topo.vertexCount, p = topo.basePositions, seen = new Uint8Array(n), least = ATOLLS.least * (n / 16002);
  const pieces: number[][] = [];
  for (let v = 0; v < n; v++) {
    if (seen[v] || rock[v] <= 0) continue;
    const piece: number[] = [], stack = [v];
    seen[v] = 1;
    while (stack.length) {
      const u = stack.pop()!;
      piece.push(u);
      for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) { const w = topo.nbrList[k]; if (!seen[w] && rock[w] > 0) { seen[w] = 1; stack.push(w); } }
    }
    if (piece.length >= least) pieces.push(piece);
  }
  pieces.sort((a, b) => b.length - a.length);
  return pieces.slice(0, most).map((core) => {
    let x = 0, y = 0, z = 0;
    for (const v of core) { x += p[v * 3]; y += p[v * 3 + 1]; z += p[v * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1, c = { x: x / l, y: y / l, z: z / l };
    let r = 0;
    for (const v of core) r = Math.max(r, Math.acos(Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z)));
    const out = Math.max(ATOLLS.ringLeast, r * ATOLLS.ringOut), ring: number[] = [];
    for (let v = 0; v < n; v++) {
      const a = Math.acos(Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z));
      if (a > r * 0.85 && a <= r + out) ring.push(v);
    }
    return { centre: c, r, core, ring };
  });
}

/** How far a place has come: whether its island has gone under, and how much of its ring is living reef near the surface. */
export function atollState(g: Ground, place: AtollPlace): { sunk: boolean; reef: number; made: boolean } {
  let above = 0;
  for (const v of place.core) if (g.rock[v] > 0) above++;
  let reef = 0;
  for (const v of place.ring) if (g.life[v] >= ATOLLS.living && g.rock[v] > ATOLLS.near) reef++;
  const share = place.ring.length ? reef / place.ring.length : 0, sunk = above <= place.core.length * 0.1;
  return { sunk, reef: share, made: sunk && share >= ATOLLS.share };
}

/**
 * The coral round each island: none until the volcano has come near it (life begins in the warm water by the
 * vent), then growing round it by itself, a little further round its shore each second, until it rings it; where
 * lava lies, none. Kept as the share of the ring begun (`coral`, one a place), and laid down as life in the ring's
 * shallows, which the reef rule then builds up to the surface as the island sinks. A share already living there
 * counts as begun (so a world taken up again carries on).
 */
export function tendCoral(g: LiveGround, topo: Topology, places: AtollPlace[], coral: Float32Array, vent: V, dt: number, reefDeep: number): void {
  const p = topo.basePositions;
  places.forEach((q, i) => {
    coral[i] = Math.max(coral[i], atollState(g, q).reef);
    if (coral[i] <= 0 && Math.acos(Math.min(1, dot(norm(vent), q.centre))) < q.r + ATOLLS.reach) coral[i] = 1e-3;
    if (coral[i] <= 0) return;
    coral[i] = Math.min(1, coral[i] + dt / ATOLLS.grows);
    // (Round the shore from the side nearest the vent, both ways at once, so it closes on the far side.)
    const a = norm(vent), side = norm({ x: a.x - q.centre.x * dot(a, q.centre), y: a.y - q.centre.y * dot(a, q.centre), z: a.z - q.centre.z * dot(a, q.centre) });
    for (const v of q.ring) {
      if (g.rock[v] <= reefDeep || g.lava[v] > 0.001) continue;
      const o = { x: p[v * 3] - q.centre.x, y: p[v * 3 + 1] - q.centre.y, z: p[v * 3 + 2] - q.centre.z }, l = Math.hypot(o.x, o.y, o.z) || 1;
      const round = Math.acos(Math.max(-1, Math.min(1, dot(o, side) / l))) / Math.PI; // 0 nearest the vent, 1 opposite
      if (round <= coral[i]) g.life[v] = Math.max(g.life[v], 0.8);
    }
  });
}

/**
 * A chain of old volcanic islands, for when the ocean world's own isn't there to begin on (it was never finished
 * here): `count` islands along a great circle beyond `start`, the furthest along the oldest and lowest, on a sea
 * floor at `floor`. Heights relative to the sea.
 */
export function defaultChain(topo: Topology, start: { x: number; y: number; z: number }, floor: number, count = 5): Float32Array {
  const p = topo.basePositions, n = topo.vertexCount, rock = new Float32Array(n).fill(floor);
  const a = norm(start), up = Math.abs(a.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const b = norm(cross(cross(a, up), a));
  for (let i = 0; i < count; i++) {
    const t = 0.3 * (i + 1), c = norm({ x: a.x * Math.cos(t) + b.x * Math.sin(t), y: a.y * Math.cos(t) + b.y * Math.sin(t), z: a.z * Math.cos(t) + b.z * Math.sin(t) });
    const peak = 0.12 - 0.01 * i, r = 0.16;
    for (let v = 0; v < n; v++) {
      const d = Math.acos(Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z));
      if (d < r * 3) rock[v] = Math.max(rock[v], floor + (peak - floor) * Math.exp(-((d / r) ** 2) * 1.6));
    }
  }
  return rock;
}

type V = { x: number; y: number; z: number };
const norm = (a: V): V => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * A million years on: the islands worn down and settled, the oldest (furthest from the hot spot at `from`) the
 * lowest, so they go under one by one rather than all together. Each island's peak is brought to its height in
 * turn, scaled from the sea floor so it keeps its shape; then the land is a little smoothed, as rain and the sea
 * round off what was sharp.
 */
export function aged(rock: ArrayLike<number>, topo: Topology, places: AtollPlace[], from: { x: number; y: number; z: number }, floor: number): Float32Array {
  const p = topo.basePositions, n = topo.vertexCount, out = Float32Array.from(rock);
  const angle = (v: number, c: V) => Math.acos(Math.min(1, p[v * 3] * c.x + p[v * 3 + 1] * c.y + p[v * 3 + 2] * c.z));
  const f = norm(from), farFirst = places.slice().sort((a, b) => dot(a.centre, f) - dot(b.centre, f));
  farFirst.forEach((q, j) => {
    let peak = floor;
    for (const v of q.core) peak = Math.max(peak, rock[v]);
    const want = ATOLLS.lowest + ATOLLS.higher * j, scale = (want - floor) / Math.max(1e-6, peak - floor);
    for (let v = 0; v < n; v++) if (rock[v] > floor && angle(v, q.centre) < q.r * 1.6) out[v] = floor + (rock[v] - floor) * scale;
  });
  for (let pass = 0; pass < 2; pass++) {
    const was = Float32Array.from(out);
    for (let v = 0; v < n; v++) {
      if (was[v] <= 0) continue;
      let s = 0, c = 0;
      for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) { s += was[topo.nbrList[k]]; c++; }
      if (c) out[v] = was[v] * 0.6 + (s / c) * 0.4;
    }
  }
  return out;
}

const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
