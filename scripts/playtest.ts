// Playtest bots: each plays a world with the same inputs a player has (turn the globe, tilt the phone,
// hold a finger), through the same Planet the game uses, and reports how the aim went.
//
//   npx vite-node scripts/playtest.ts <world> <bot> [seed]
//
// bots: card (does what the start card says), skilled (the same, done well), aimless (turns, tilts
// and holds at random), lifter (holds a finger and lifts at AT times the burst size).
// Prints one line of JSON: won, at (seconds), done (% of the aim), heatLeft, longestStill (the longest
// wait without 2% more of the aim), bursts, flows, blewApart, and the aim every 30 seconds.
// To try a change without editing the game: RULES='{"coolLand":1}' WORLD='{"cover":0.7}' CHAIN='{"stretches":8}' HOLD=30.
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { Planet } from '../src/volcano/sim';
import { Ecology } from '../src/volcano/ecology';
import { Chain, CHAIN } from '../src/volcano/chain';
import { worldOf } from '../src/volcano/worlds';

const [worldId, botKind, seedArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 5);
const W = { ...worldOf(worldId), ...JSON.parse(process.env.WORLD ?? '{}') };
const RULES = { ...W.rules, ...JSON.parse(process.env.RULES ?? '{}') };
const topo = buildTopology(new THREE.IcosahedronGeometry(1, 40).attributes.position.array, null);
const P = topo.basePositions, N = topo.vertexCount;
const nearest = (x: number, y: number, z: number) => { let b = 0, bd = Infinity; for (let v = 0; v < N; v++) { const d = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2; if (d < bd) { bd = d; b = v; } } return b; };
const pl = new Planet(topo, nearest(0.1, 0.15, 0.98), seed, RULES);
pl.stonesFall = W.goal === 'gather'; // (on the first world, the stones are the aim)
const LIFE = pl.k.life;
const eco = new Ecology(pl, topo);
Object.assign(CHAIN, JSON.parse(process.env.CHAIN ?? '{}'));
const chain = W.goal === 'ring' ? new Chain(pl.plume, pl.driftDirection) : null;

// The aim, reckoned as main.ts reckons it.
const HEIGHT = W.height ?? { target: 0, kmPerUnit: 40 };
const CALM = W.calm ?? 0, ISLAND = W.island ?? 0, POOL = W.pool ?? 0, ROUND = Math.round((W.round ?? 0) * 100), COVER = Math.round((W.cover ?? 0) * 100), PLUMES = W.plumes ?? 0, ORBIT = W.orbit ?? 0;
const HEARTH = W.hearth ?? 0, OUTBUILD = W.outbuild ?? 0, SNOWFALL = W.snowfall ?? 0, GATHER = W.gather ?? 0, OXYGEN = W.oxygen ?? 0, FIELDS = W.fields ?? 0;
let calmHeld = 0, calmAt = 0, litFor = 0, litAt = 0;
function aim(): [number, number] {
  switch (W.goal) {
    case 'ring': return [chain!.update(pl, topo), CHAIN.stretches];
    case 'height': return [Math.max(0, pl.summit * HEIGHT.kmPerUnit), HEIGHT.target];
    case 'cover': return [pl.covered * 100, COVER];
    case 'plumes': return [pl.plumes.length, PLUMES];
    case 'round': return [pl.roundness * 100, ROUND];
    case 'ridge': return [pl.ridgeRaise().filter((r) => r >= pl.k.ridge).length, Planet.RIDGE_STRETCHES];
    case 'lamp': return [(100 * pl.pooled) / POOL, 100];
    case 'calm': { const d = Math.max(0, Math.round((1 - pl.tumbling) * 100)); calmHeld = d >= CALM ? calmHeld + (pl.seconds - calmAt) : 0; calmAt = pl.seconds; return [d, CALM]; }
    case 'bank': return [(100 * pl.bankLand) / ISLAND, 100];
    case 'orbit': case 'feed': return [(100 * pl.orbit) / ORBIT, 100];
    case 'hearth': return [(100 * pl.livingLand) / HEARTH, 100];
    case 'thaw': return [pl.thawed ? 100 : Math.min(99, (100 * pl.greenhouse) / pl.k.thawAt), 100];
    case 'outbuild': return [Math.max(0, (100 * pl.grownBy) / OUTBUILD), 100];
    case 'snow': return [(100 * pl.snow) / SNOWFALL, 100];
    case 'gather': return [pl.tally.caught, GATHER];
    case 'antipode': return [pl.farRaised * HEIGHT.kmPerUnit, W.farKm ?? 0];
    case 'white': { const km = Math.max(0, pl.summit * HEIGHT.kmPerUnit); return [km < HEIGHT.target ? (50 * km) / HEIGHT.target : 50 + 50 * Math.min(1, pl.whiteSummit / (W.whiteness ?? 1)), 100]; }
    case 'glow': { if (pl.burning >= (W.glow ?? 1)) litFor += pl.seconds - litAt; litAt = pl.seconds; return [(100 * litFor) / 120, 100]; }
    case 'waves': return [pl.waves.length, W.rings ?? 0];
    case 'oxygen': return [(100 * pl.oxygen) / OXYGEN, 100];
    case 'chaos': case 'streaks': return [pl.plumes.length, FIELDS];
    default: return [pl.basins.filter((b) => pl.flooded(b) >= 0.7).length, pl.basins.length];
  }
}
const won = (d: number, of: number) => of > 0 && d >= of && (W.goal !== 'calm' || calmHeld >= Number(process.env.HOLD ?? 20));

// The camera's frame in the planet's: F towards the viewer (the middle of the globe as seen), S up the screen, R right.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const F = V(0, 0, 1), S = V(0, 1, 0), R = V();
const ortho = () => { S.addScaledVector(F, -S.dot(F)); if (S.lengthSq() < 1e-6) S.set(1, 0, 0).addScaledVector(F, -F.x); S.normalize(); R.crossVectors(S, F).normalize(); };
ortho();
const LEVEL = V(0, -0.3, -1).normalize();
const hold = LEVEL.clone(); // which way is down, in the camera's frame
const toPlanet = (c: THREE.Vector3) => V().addScaledVector(R, c.x).addScaledVector(S, c.y).addScaledVector(F, c.z);
const GIANT = V(-0.95, 2.6, -4.8).normalize(), SUNV = W.sun ? V(...(W.sun as [number, number, number])).normalize() : null;
const vent = () => V(pl.plume.x, pl.plume.y, pl.plume.z);
/** Drag the globe so `p` comes towards the middle, at a hand's pace (radians a second). */
function turnTowards(p: THREE.Vector3, dt: number, pace = 1.2): void {
  // (Brings `p` to the top, as the world is held level: a little up the screen from the middle.)
  const U = toPlanet(LEVEL).negate().normalize();
  const a = U.angleTo(p); if (a < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(U, p.clone().normalize());
  const part = new THREE.Quaternion().slerp(q, Math.min(1, (pace * dt) / a));
  F.applyQuaternion(part); S.applyQuaternion(part); ortho();
}
/** Drag the globe so the vent comes to a place on the screen (a direction, as seen), at a hand's pace. */
function bringVentTo(view: THREE.Vector3, dt: number, pace = 1.2): void {
  const U = toPlanet(view.clone().normalize()).normalize(), p = vent();
  const a = U.angleTo(p); if (a < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(U, p);
  const part = new THREE.Quaternion().slerp(q, Math.min(1, (pace * dt) / a));
  F.applyQuaternion(part); S.applyQuaternion(part); ortho();
}
const level = () => hold.copy(LEVEL);
/** Tilt the phone so lava runs towards `p` on the world (or a screen direction), by `amt`. */
function tiltTowards(p: THREE.Vector3 | null, amt: number): void {
  let dx: number, dy: number;
  if (p) { const d = p.clone().sub(vent()); dx = d.dot(R); dy = d.dot(S); const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
  else { const a = rnd() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
  hold.set(LEVEL.x + amt * dx, LEVEL.y + amt * dy, LEVEL.z).normalize();
}
let rs = seed * 9301 + 49297; const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
const randomNear = (c: THREE.Vector3, ang: number) => { const t = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5); t.addScaledVector(c, -t.dot(c)).normalize(); return c.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang)).normalize(); };
const angleBetween = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z))));
const setInputs = () => { if (SUNV) { const s = toPlanet(SUNV).normalize(); pl.star = { x: s.x, y: s.y, z: s.z }; } if (botKind === 'nogravity') { pl.gravity = null; return; } const g = toPlanet(hold).normalize(); pl.gravity = { x: g.x, y: g.y, z: g.z }; if (W.goal === 'feed') { const s = toPlanet(GIANT).normalize(); pl.giant = { x: s.x, y: s.y, z: s.z }; } };
function clampOn(): void { pl.clamped = true; }
function lift(): void { if (pl.clamped) pl.unclamp(); }

// ---------------------------------------------------------------- the bots
type Bot = (dt: number) => void;
let phase = 'build', dir: THREE.Vector3 | null = null, focus: THREE.Vector3 | null = null, timer = 0, pourAmt = 0.6;
const SKILLED = botKind === 'skilled';
const POUR_AT = Number(process.env.AT ?? (SKILLED ? 0.85 : 0.6)); // pours when the smoke is middling (a share of the burst point)
/** The pour cycle: level while it gathers, tilted (towards `towards`, or anywhere) until it's spent. */
function pourCycle(towards: THREE.Vector3 | null, amt = 0.6): void {
  if (SKILLED) amt = Number(process.env.AMT ?? 0.8);
  if (phase === 'build') { level(); if (SKILLED && !focus) turnTowards(vent(), 1 / 20); if (pl.pressure >= pl.k.explosive * POUR_AT) { phase = 'pour'; dir = towards; pourAmt = amt; if (!towards) tiltTowards(null, amt); } }
  if (phase === 'pour') { if (dir) tiltTowards(dir, pourAmt); if (pl.pressure < pl.k.least * 0.5) { phase = 'build'; level(); } }
}
/** Hold a finger on it until `ready`, aim with `aimAt` meanwhile, then lift. */
function holdAndLift(ready: () => boolean, aimAt?: (dt: number) => boolean): (dt: number) => void {
  return (dt) => {
    level();
    if (!pl.clamped) clampOn();
    const aimed = aimAt ? aimAt(dt) : true;
    if (ready() && aimed) lift();
  };
}

const plumesReach = () => pl.plumes;
const card: Record<string, Bot> = {
  // Pour as the fire goes (the world slides so the fire stays in view).
  ring: () => pourCycle(null),
  // Turn a basin to the top, then pour gently until it fills; then the next.
  basins: (dt) => {
    const open = pl.basins.filter((b) => pl.flooded(b) < 0.7);
    if (!open.length) return pourCycle(null);
    const v = vent(); open.sort((a, b) => angleBetween(a, v) - angleBetween(b, v));
    const b = V(open[0].x, open[0].y, open[0].z).normalize();
    turnTowards(b, dt);
    if (angleBetween(b, v) < open[0].r * 0.7) pourCycle(null, 0.45);
    else { level(); if (pl.pressure > pl.k.explosive * 0.9) { tiltTowards(b, 0.5); } }
  },
  height: () => pourCycle(null),
  // Pour across the old grey ice: after each pour, turn somewhere fresh nearby.
  cover: (dt) => {
    if (!focus || (phase === 'build' && timer <= 0)) {
      let best = vent(), bestFresh = -1;
      for (let i = 0; i < 10; i++) { const c = randomNear(vent(), 0.45); const v = nearest(c.x, c.y, c.z); const fresh = pl.age[v] >= 1e5 ? 1 : 0; if (fresh + rnd() * 0.1 > bestFresh) { bestFresh = fresh + rnd() * 0.1; best = c; } }
      focus = best; timer = 12;
    }
    timer -= dt; turnTowards(focus, dt);
    pourCycle(null);
  },
  // Hold until the smoke darkens (a great plume ready), lift; then move somewhere outside the rings.
  plumes: (dt) => {
    if (!focus) focus = vent();
    turnTowards(focus, dt);
    const fresh = plumesReach().every((p) => angleBetween(p, vent()) > p.reach);
    if (!pl.clamped) clampOn();
    level();
    const dark = pl.throwOf(pl.pressure) >= pl.k.great;
    if (dark && fresh) { lift(); const before = pl.plumes.length; void before; let c = vent(); for (let i = 0; i < 30; i++) { c = randomNear(vent(), 0.6 + rnd() * 0.6); if (plumesReach().every((p) => angleBetween(p, c) > p.reach * 1.15)) break; } focus = c; }
    else if (pl.pressure > pl.capNow * 0.93) lift(); // about to blow: let it go
  },
  // Hold until the smoke is heavy, turn the vent towards the giant, let it burst.
  feed: (dt) => {
    if (!pl.clamped) clampOn();
    if (pl.pressure < pl.k.explosive) { level(); return; }
    // Find a way of holding it that has the vent towards the giant: drag the globe a little at a time.
    if (!pl.towardGiant) {
      let best: THREE.Vector3 | null = null;
      const save = F.clone(), saveS = S.clone();
      for (let i = 0; i < 40 && !best; i++) {
        const c = randomNear(vent(), 0.25 + rnd() * 0.5);
        F.copy(c); S.copy(saveS); ortho(); setInputs();
        if (pl.towardGiant) best = c;
      }
      F.copy(save); S.copy(saveS); ortho(); setInputs();
      if (best) focus = best;
      if (focus) turnTowards(focus, dt);
      if (pl.pressure > pl.capNow * 0.93) lift();
    } else lift();
  },
  // Turn a hollow to the top and pour into it.
  round: (dt) => {
    if (!focus || timer <= 0) {
      let best = vent(), deep = Infinity;
      for (let i = 0; i < 60; i++) { const c = randomNear(vent(), rnd() * 1.2); const v = nearest(c.x, c.y, c.z); if (pl.rock[v] < deep) { deep = pl.rock[v]; best = V(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } }
      focus = best; timer = 25;
    }
    timer -= dt; turnTowards(focus, dt);
    if (angleBetween(focus, vent()) < 0.2) pourCycle(null); else { level(); if (pl.pressure > pl.k.explosive * 0.9) tiltTowards(null, 0.5); }
  },
  // Pour where the ridge is lowest round the middle: turn that stretch to the top, and pour.
  ridge: (dt) => {
    if (!focus || (phase === 'build' && timer <= 0)) {
      const r = pl.ridgeRaise(); let k = 0; for (let i = 0; i < r.length; i++) if (r[i] < r[k] - 0.01 || (Math.abs(r[i] - r[k]) <= 0.01 && angleBetween(V(Math.cos((i + 0.5) / r.length * Math.PI * 2), 0, Math.sin((i + 0.5) / r.length * Math.PI * 2)), vent()) < angleBetween(V(Math.cos((k + 0.5) / r.length * Math.PI * 2), 0, Math.sin((k + 0.5) / r.length * Math.PI * 2)), vent()))) k = i;
      const a = (k + 0.5) / r.length * Math.PI * 2; focus = V(Math.cos(a), 0, Math.sin(a)); timer = 15;
    }
    timer -= dt; turnTowards(focus, dt);
    if (angleBetween(focus, vent()) < 0.25) pourCycle(null); else { level(); if (pl.pressure > pl.k.explosive * 0.9) tiltTowards(null, 0.5); }
  },
  // Level to grow a blob, tilt to let it go, then turn the far shore to the top while it floats.
  lamp: (dt) => {
    const shore = V(pl.shore!.x, pl.shore!.y, pl.shore!.z);
    if (phase === 'build') { turnTowards(vent(), dt); level(); if (pl.pressure >= pl.k.least * 4) { phase = 'let'; timer = 0.6; } }
    else if (phase === 'let') { tiltTowards(null, 0.7); timer -= dt; if (timer <= 0) { phase = 'float'; timer = 14; level(); } }
    else { turnTowards(shore, dt); level(); timer -= dt; if (timer <= 0 || pl.blobs.length === 0) phase = 'build'; }
  },
  // Hold until heavy, bring the vent onto the dotted ring (square to the spin), let it burst.
  calm: (dt) => {
    const w = V(pl.spinNow.x, pl.spinNow.y, pl.spinNow.z); const v = vent();
    const onRing = w.lengthSq() > 1e-10 ? v.clone().addScaledVector(w.clone().normalize(), -v.dot(w.clone().normalize())).normalize() : v;
    turnTowards(onRing, dt);
    if (!pl.clamped) clampOn();
    level();
    const near = w.lengthSq() > 1e-10 ? Math.abs(v.dot(w.clone().normalize())) < 0.3 : true;
    if (pl.pressure >= pl.k.explosive && near) lift(); else if (pl.pressure > pl.capNow * 0.93) lift();
  },
  // Pour towards the bank, again and again.
  bank: () => { const b = V(pl.bank!.x, pl.bank!.y, pl.bank!.z); pourCycle(b, 0.6); },
  // Pour, each time a little round from the last, never on what lives.
  // Turn a little after each pour, so the vent creeps on, and pour beside what lives, not on it.
  hearth: (dt) => {
    if (!focus || (phase === 'build' && timer <= 0)) { const v = vent(), t = V(0, 1, 0).cross(v).normalize(); focus = v.clone().addScaledVector(t.applyAxisAngle(v, pl.tally.flows * 1.1), 0.3).normalize(); timer = 25; }
    timer -= dt; turnTowards(focus, dt, 0.3);
    pourCycle(null, 0.5);
  },
  // Pour until the mountain stands above the sea, then hold and burst.
  thaw: () => { if (pl.rock[pl.plumeVertex] < 0.02) return pourCycle(null); if (!pl.clamped) clampOn(); level(); if (pl.pressure >= pl.k.explosive * 1.05) lift(); },
  // Turn the place a stone will fall to the top, so the glow creeps under it; pour meanwhile.
  gather: (dt) => {
    if (pl.impact) { const v = pl.impact.vertex; turnTowards(V(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), dt, 1.5); level(); return; }
    pourCycle(null);
  },
  // Pour gently, each time a different way, to spread shallows.
  // Pour a shelf, then turn a little to the next, leaving each to life.
  oxygen: (dt) => {
    if (!focus || (phase === 'build' && timer <= 0)) { const v = vent(), t = V(0, 1, 0).cross(v).normalize(); focus = v.clone().addScaledVector(t.applyAxisAngle(v, pl.tally.flows * 1.3), 0.35).normalize(); timer = 30; }
    timer -= dt; turnTowards(focus, dt, 0.3);
    pourCycle(null, 0.45);
  },
  // Pour a little, each time a different way round the cone.
  // Build the peak; then hold still while the summit whitens.
  white: () => { if (pl.summit * HEIGHT.kmPerUnit < HEIGHT.target) return pourCycle(null); if (!pl.clamped) clampOn(); level(); if (pl.pressure > pl.capNow * 0.95) lift(); },
  // Pour thin and wide, a new way each time.
  glow: (dt) => {
    if (!focus || (phase === 'build' && timer <= 0)) { const v = vent(), t = V(0, 1, 0).cross(v).normalize(); focus = v.clone().addScaledVector(t.applyAxisAngle(v, pl.tally.flows * 1.1), 0.35).normalize(); timer = 20; }
    timer -= dt; turnTowards(focus, dt, 0.3);
    pourCycle(null, 0.75);
  },
  // Build until just under the sea, then hold and burst.
  waves: () => { if (pl.rock[pl.plumeVertex] < -pl.k.wave * 0.7) { if (pl.clamped) lift(); return pourCycle(null); } if (!pl.clamped) clampOn(); level(); if (pl.pressure >= pl.k.explosive * 1.05) lift(); },
  // Hold until heavy, and lift: the shock goes through.
  antipode: () => { if (!pl.clamped) clampOn(); level(); if (pl.pressure >= pl.k.explosive * 1.6) lift(); else if (pl.pressure > pl.capNow * 0.9) lift(); },
  // Hold, and lift while the smoke is light; then turn somewhere apart for the next.
  chaos: (dt) => {
    if (!focus) focus = vent();
    turnTowards(focus, dt);
    if (!pl.clamped) clampOn();
    level();
    const fresh = pl.plumes.every((p) => angleBetween(p, vent()) > pl.k.plumesApart);
    if (pl.pressure >= pl.k.chaos * 1.2 && fresh) { lift(); let c = vent(); for (let i = 0; i < 30; i++) { c = randomNear(vent(), 0.6 + rnd() * 0.4); if (pl.plumes.every((p) => angleBetween(p, c) > pl.k.plumesApart * 1.15)) break; } focus = c; }
    else if (pl.pressure >= pl.k.explosive * 0.9) lift(); // (too long held: let it go)
  },
  // Hold until heavy, and lift when the sun is on the vent; then turn somewhere apart.
  streaks: (dt) => {
    if (!focus) focus = vent();
    turnTowards(focus, dt);
    if (!pl.clamped) clampOn();
    level();
    const fresh = pl.plumes.every((p) => angleBetween(p, vent()) > pl.k.plumesApart), lit = pl.dayAt(pl.plumeVertex) > 0.3;
    if (pl.pressure >= pl.k.explosive * 1.05 && fresh && lit) { lift(); let c = vent(); for (let i = 0; i < 30; i++) { c = randomNear(vent(), 0.5 + rnd() * 0.4); if (pl.plumes.every((p) => angleBetween(p, c) > pl.k.plumesApart * 1.15)) break; } focus = c; }
    else if (pl.pressure > pl.capNow * 0.93) lift();
  },
  // Drag the vent round into the night, where it pours of itself.
  outbuild: (dt) => { bringVentTo(V(-0.55, 0.1, 0.83), dt); level(); },
  // Drag the vent round into the starlight, where it pours of itself.
  snow: (dt) => { bringVentTo(V(0.62, 0.2, 0.76), dt); level(); },
  // Hold until the smoke is heavy, then let it burst.
  orbit: () => { if (!pl.clamped) clampOn(); level(); if (pl.pressure >= pl.k.explosive * 1.05) lift(); else if (pl.pressure > pl.capNow * 0.93) lift(); },
};
// Someone who hasn't understood: turns about, tilts and holds at random.
let next = 0, act = 'still';
const aimless: Bot = (dt) => {
  next -= dt;
  if (next <= 0) {
    lift(); level();
    const r = rnd(); act = r < 0.3 ? 'turn' : r < 0.6 ? 'tilt' : r < 0.85 ? 'hold' : 'still';
    next = 2 + rnd() * 6; focus = randomNear(F, 0.3 + rnd() * 0.6);
    if (act === 'tilt') tiltTowards(null, 0.3 + rnd() * 0.6);
    if (act === 'hold') clampOn();
  }
  if (act === 'turn') turnTowards(focus!, dt);
};
// Holds a finger on it, and lifts it just short of a burst: lets it out at the vent, the world level.
const lifter: Bot = (dt) => { turnTowards(vent(), dt); level(); if (!pl.clamped) clampOn(); if (pl.pressure >= Math.max(pl.k.least * 1.05, pl.k.explosive * AT)) lift(); };
const AT = Number(process.env.AT ?? 0.85);
const nograv: Bot = () => { if (pl.pressure >= Math.max(pl.k.least, pl.k.explosive * AT)) pl.erupt(); };
const bot = botKind === 'nogravity' ? nograv : botKind === 'aimless' ? aimless : botKind === 'lifter' ? lifter : card[W.goal];
const focusFree = ['ring', 'height', 'ridge', 'bank'];

// ---------------------------------------------------------------- play
const dt = 1 / 20, LIMIT = 1200;
let markAt = 0;
let t = 0, best = 0, lastGain = 0, longestStill = 0, firstGain = -1, wonAt = -1, lastEco = 0;
const trace: string[] = [];
while (t < LIMIT) {
  if (SUNV && W.sunTurns && !pl.over) SUNV.applyAxisAngle(V(0, 1, 0), W.sunTurns * dt); // (Triton's sun crosses the sky)
  bot(dt); setInputs();
  const before = vent();
  pl.step(dt); t += dt;
  if (pl.k.tumble > 0) { const w = pl.spinNow, r = Math.hypot(w.x, w.y, w.z); if (r > 1e-6) { const q = new THREE.Quaternion().setFromAxisAngle(V(w.x / r, w.y / r, w.z / r), -r * dt); F.applyQuaternion(q); S.applyQuaternion(q); ortho(); } }
  if (pl.k.rises <= 0 && pl.k.drift > 0) { const q = new THREE.Quaternion().setFromUnitVectors(before, vent()); F.applyQuaternion(q); S.applyQuaternion(q); ortho(); }
  if (LIFE && t - lastEco >= 1) { eco.update(t - lastEco); lastEco = t; }
  if (Math.abs(t - Math.round(t)) < dt / 2) {
    const [d, of] = aim();
    if (d > best + 1e-6 * Math.max(1, of)) { if (firstGain < 0 && d > 0.02 * of) firstGain = t; best = d; }
    if (d - markAt >= 0.02 * of) { longestStill = Math.max(longestStill, t - lastGain); lastGain = t; markAt = d; }
    if (Math.round(t) % 30 === 0) trace.push(`${Math.round(t)}:${Math.round((100 * d) / Math.max(1e-9, of))}%`);
    if (won(d, of)) { wonAt = t; break; }
    if (pl.over) break;
  }
}
const [d, of] = aim();
longestStill = Math.max(longestStill, t - lastGain);
console.log(JSON.stringify({ world: worldId, bot: botKind, seed, won: wonAt >= 0, at: Math.round(t), over: pl.over, done: Math.round((100 * d) / Math.max(1e-9, of)), heatLeft: Math.round(100 * pl.heatLeft), firstGain: Math.round(firstGain), longestStill: Math.round(longestStill), bursts: pl.tally.bursts, flows: pl.tally.flows, blewApart: pl.tally.calderas, trace: trace.join(' ') }));
