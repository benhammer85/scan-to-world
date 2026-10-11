/**
 * Annulus, the prototype: you are one tree, and the screen shows its trunk in cross-section, held as
 * the volcano's globe is held. Each year adds a ring, plotted by the pen as the year goes round.
 *
 * It's played by how it's held (see tree.ts): level, the sap gathers under the uppermost side;
 * tipped, the year's growth pours toward the low side. Tip the phone, or hold a finger on the slice to
 * tip it down the screen (as the volcano pours with one hand); drag to turn the slice; pinch to come
 * closer. On a keyboard the arrows tip it and space holds.
 *
 * Nothing on the slice is a control, and no words are written on it: the sap shows as a crescent of
 * strokes, the weather as forces on the wood (rain widens the ring, drought thins it, the sun pulls the
 * growth toward its side, fire leaves a scar). A few quiet lines at the foot teach the hands, once.
 * When the tree falls, its slice is set out as a plate, and kept in the xylotheque.
 */
import '../volcano/fonts.css';
import { GestureRecognizer } from '../interact/gestures';
import { feel, keepImage, NATIVE, rumble, tap } from '../volcano/native';
import { TreeSim, K, RAIN, angleDiff, type News } from './tree';
import { treeOf } from './trees';
import { feltBy, fingerTip, downOf, tiltFrom, type Held } from './hold';
import { ARCS, PAPER, drawBark, drawRain, drawRing, drawShadow, drawSlice, drawSap, drawSmoke, drawSun, drawYear, inkArc, barkThickness, radiusAt, type View } from './draw';
import { drawPlate, recordOf } from './plate';
import { forgetTree, keepPlate, keepTree, plates, recallTree, snapshotTree, treeFrom, type KeptTree } from './save';

const $ = (id: string) => document.getElementById(id)!;
const TAU = Math.PI * 2;
const ASKED = new URLSearchParams(location.search);
const T = treeOf(ASKED.get('tree'));
/** Wander (?wander): the tree never dies; it's felled when you choose. */
const WANDER = ASKED.has('wander');
const wanted = Number(ASKED.get('seed'));
const RULES = { ...T.rules, endless: WANDER };
function remembered(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function remember(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* not remembered */ } }

// ---------------------------------------------------------------- settings
/** The ink: engraving (ink only, the default) or watercolour, as the volcano game offers it. */
let WATER = (ASKED.get('ink') ?? remembered('annulus.ink')) === 'water';
/** Whether the phone's own tilt tips the slice (else only a finger, or the keys). */
let PHONE = remembered('annulus.tilt') !== 'finger';

// ---------------------------------------------------------------- the tree
let seed = wanted || 1 + Math.floor(Math.random() * 1e6);
let tree = new TreeSim(seed, RULES);

// ---------------------------------------------------------------- the page
const canvas = $('slice') as HTMLCanvasElement, g = canvas.getContext('2d')!;
const frame = $('frame') as HTMLCanvasElement, fg = frame.getContext('2d')!;
const cache = document.createElement('canvas'), cg = cache.getContext('2d')!;
let W = 1, H = 1, px = 1;
function fit(): void {
  px = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(innerWidth * px)); H = Math.max(1, Math.round(innerHeight * px));
  for (const c of [canvas, frame, cache]) { c.width = W; c.height = H; }
  dirty = true; scale = 0;
  if (ending) drawEndFrame();
}
addEventListener('resize', fit);

/** The slice's turn, and how near (1 to CLOSEST). */
let turn = Math.PI / 2, spinV = 0, zoom = 1;
const CLOSEST = 3;
/** The scale (device px a mm), eased so a new ring doesn't jump the slice. */
let scale = 0;

/** The view now, without the lean. */
function view(): View {
  const top = 92 * px, foot = (ending ? 180 : 70) * px;
  if (!scale) scale = scaleWanted(roomNow());
  return { cx: W / 2, cy: top + (H - top - foot) / 2, s: scale * zoom, turn, px };
}
/** The scale the slice wants in its room: small while it's young, growing to fill it by about a century and a half. */
function scaleWanted(room: number): number {
  const R = Math.max(tree.k.pith, maxOuter()) + 0.0001;
  return (room * Math.min(1, (R / 180) ** 0.35)) / (R * 1.04);
}
function roomNow(): number {
  const top = 92 * px, foot = (ending ? 180 : 70) * px, side = 42 * px;
  return Math.max(40 * px, Math.min((W - side * 2) / 2, (H - top - foot) / 2));
}
function maxOuter(): number {
  let m = 0;
  for (let i = 0; i < K; i += 4) m = Math.max(m, tree.outer(i));
  return m;
}

// ---------------------------------------------------------------- the ink kept, and fading
/**
 * Inked rings are drawn once onto a canvas kept aside, and laid onto the page each frame, turned
 * and scaled to the view while a finger moves; once the slice is still they're drawn again, crisp.
 * Rings out of view (when you come close) are held 25 s, then fade over 45 s to pencil, never below;
 * turned back into view, the ink comes back along them, nearest the middle first (STYLE.md's fading ink).
 */
let dirty = true, cacheView: View | null = null, lastMoved = -10, lastRender = -10;
const HOLD = 25, FADE = 45, STALE = 0.35;
let seen: Float32Array[] = [];
/** Arcs faded and back in view, waiting for the ink; and those inked again but not yet in the kept drawing. */
let waiting: { i: number; c: number }[] = [];
let inking: { i: number; c: number; t: number; dur: number } | null = null;
let fresh: { i: number; c: number }[] = [];
const clock = () => performance.now() / 1000;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
function fadeOf(i: number, c: number): number {
  const s = seen[i]?.[c];
  return s === undefined ? 0 : smooth((clock() - s - HOLD) / FADE);
}
function seeAll(): void {
  const now = clock();
  seen = tree.rings.map(() => new Float32Array(ARCS).fill(now));
  waiting = []; fresh = []; inking = null; dirty = true;
}
let fadesDrawn = 0;
/** Which arcs are in view: those keep their ink; those faded and back in view wait for the pen. */
function survey(v: View): void {
  const now = clock(), m = 12 * px;
  let fading = 0;
  for (let i = 0; i < tree.rings.length; i++) {
    const s = seen[i] ?? (seen[i] = new Float32Array(ARCS).fill(now));
    for (let c = 0; c < ARCS; c++) {
      const a = ((c + 0.5) / ARCS) * TAU - 0, r = radiusAt(tree.rings[i], a), t = a + v.turn;
      const x = v.cx + v.s * r * Math.cos(t), y = v.cy - v.s * r * Math.sin(t);
      const f = fadeOf(i, c);
      if (f > 0.01) fading += f;
      if (x < -m || y < -m || x > W + m || y > H + m) continue;
      if (f > STALE) { if (!waiting.some((w) => w.i === i && w.c === c) && !(inking && inking.i === i && inking.c === c)) waiting.push({ i, c }); continue; }
      if (f < 0.01) s[c] = now;
    }
  }
  // (Faded ink is drawn again now and then as it fades, not every frame.)
  if (Math.abs(fading - fadesDrawn) > 2) { fadesDrawn = fading; dirty = true; }
}
/** The pen comes back for faded arcs, nearest the middle first, once the slice is at rest. */
function reink(dt: number, v: View): void {
  if (inking) {
    inking.t += dt;
    if (inking.t >= inking.dur) {
      seen[inking.i][inking.c] = clock();
      fresh.push({ i: inking.i, c: inking.c });
      inking = null;
    }
  }
  if (!inking && waiting.length && clock() - lastMoved > 0.6) {
    const dist = (w: { i: number; c: number }) => { const a = ((w.c + 0.5) / ARCS) * TAU + v.turn, r = radiusAt(tree.rings[w.i], a - v.turn) * v.s; return Math.hypot(v.cx + r * Math.cos(a) - W / 2, v.cy - r * Math.sin(a) - H / 2); };
    waiting.sort((a, b) => dist(a) - dist(b));
    const w = waiting.shift()!, len = (TAU / ARCS) * radiusAt(tree.rings[w.i], ((w.c + 0.5) / ARCS) * TAU) * v.s;
    inking = { ...w, t: 0, dur: Math.max(0.012, len / (5000 * px)) }; // (quick, and with no nib: the year's pen is the one that moves for attention)
  }
  if (!inking && !waiting.length && fresh.length) dirty = true;
}
function renderCache(v: View): void {
  cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.clearRect(0, 0, W, H);
  drawSlice(cg, tree, v, { water: WATER }, fadeOf);
  cacheView = { ...v };
  dirty = false; fresh = []; lastRender = clock();
}

// ---------------------------------------------------------------- held
const held: Held = { turn, tipAngle: -Math.PI / 2, tip: 0 };
let fingerHeld = false, fingerSince = 0, keysSince = 0;
const keys = new Set<string>();
/** The phone's down, as held when the tree began (level) and now, smoothed. */
let level: [number, number, number] | null = null, down: [number, number, number] | null = null, rawDown: [number, number, number] | null = null;
addEventListener('deviceorientation', (e) => {
  if (e.beta === null || e.gamma === null) return;
  rawDown = downOf(e.beta, e.gamma);
});
async function askForTilt(): Promise<void> {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  try { if (D?.requestPermission) await D.requestPermission(); } catch { /* a finger, then */ }
}
function phoneTilt(dt: number): { tipAngle: number; tip: number } | null {
  if (!PHONE || !rawDown) return null;
  if (!down) down = [...rawDown];
  const k = 1 - Math.exp(-dt / 0.25);
  for (let i = 0; i < 3; i++) down[i] += (rawDown[i] - down[i]) * k;
  if (!level) level = [...down];
  const t = tiltFrom(level, down, 1);
  // (A hand is never still: the first six degrees are still level, and a full tip is another twenty.)
  return { tipAngle: t.tipAngle, tip: Math.max(0, Math.min(1, (t.tip - 0.1) / 0.35)) };
}
function holdNow(dt: number): void {
  held.turn = turn;
  if (fingerHeld) { held.tipAngle = -Math.PI / 2; held.tip = fingerTip(tree.seconds - fingerSince); return; }
  const kx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), ky = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  if (kx || ky) { held.tipAngle = Math.atan2(ky, kx); held.tip = fingerTip(tree.seconds - keysSince); return; }
  const p = phoneTilt(dt);
  if (p) { held.tipAngle = p.tipAngle; held.tip = p.tip; return; }
  held.tip = 0;
}

// ---------------------------------------------------------------- touch
const finger = { x: 0, y: 0 };
let pinching = false;
function onSlice(x: number, y: number): boolean {
  const v = view(), r = Math.hypot(x * px - v.cx, y * px - v.cy) / v.s;
  return r < maxOuter() + barkThickness(tree, v) + (24 * px) / v.s;
}
/** Turning by a finger: the angle it swept about the pith (or, near the pith, its sideways drag). */
function turnBy(dx: number, dy: number): void {
  const v = view(), cx = v.cx / px, cy = v.cy / px;
  const x1 = finger.x - cx, y1 = -(finger.y - cy), x0 = x1 - dx, y0 = y1 + dy;
  const d = Math.hypot(x1, y1) > 30 ? angleDiff(Math.atan2(y1, x1), Math.atan2(y0, x0)) : -dx * 0.008;
  turn += d;
  lastMoved = clock(); turnedAt = tree.seconds;
}
const gestures = new GestureRecognizer({
  tap() { /* (nothing: the slice has no buttons) */ },
  spin(dx, dy) { spinV = 0; if (playing()) turnBy(dx, dy); },
  fling(vx, vy) {
    if (!playing()) return;
    const v = view(), x = finger.x - v.cx / px, y = -(finger.y - v.cy / px), r2 = Math.max(900, x * x + y * y);
    spinV = (x * -vy - y * vx) / r2;
  },
  zoom(f) { zoom = Math.max(1, Math.min(CLOSEST, zoom * f)); lastMoved = clock(); pinching = true; },
  twist(a) { if (playing()) { turn -= a; lastMoved = clock(); } },
  grab() { if (playing()) { fingerHeld = true; fingerSince = tree.seconds; feel(8); } },
  press() { /* (it tips the longer it's held: see fingerTip) */ },
  pull() { /* none */ },
  heldMove(dx, dy) { if (playing()) turnBy(dx, dy); },
  release() { fingerHeld = false; },
  drawer() { /* none */ },
}, (x, y) => playing() && onSlice(x, y));
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); finger.x = e.clientX; finger.y = e.clientY; document.body.classList.add('touching'); gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
canvas.addEventListener('pointermove', (e) => { finger.x = e.clientX; finger.y = e.clientY; gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => { document.body.classList.remove('touching'); gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp); if (pinching) { pinching = false; lastMoved = clock(); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); gestures.wheel(e.deltaY); }, { passive: false });
addEventListener('keydown', (e) => {
  if (!playing()) return;
  if (e.key.startsWith('Arrow')) { if (!keys.size) keysSince = tree.seconds; keys.add(e.key); e.preventDefault(); }
  if (e.key === ' ' && !e.repeat) { e.preventDefault(); fingerHeld = true; fingerSince = tree.seconds; }
});
addEventListener('keyup', (e) => { keys.delete(e.key); if (e.key === ' ') fingerHeld = false; });
function turnKeys(dt: number): void {
  const k = (keys.has('a') || keys.has(',') ? 1 : 0) - (keys.has('d') || keys.has('.') ? 1 : 0);
  if (k) { turn += k * 1.4 * dt; lastMoved = clock(); turnedAt = tree.seconds; }
}
addEventListener('keydown', (e) => { if (['a', 'd', ',', '.'].includes(e.key)) keys.add(e.key); });

// ---------------------------------------------------------------- the first lines, one idea at a time
/** A first line: when it's ready, what it says, when it's done; and the ghost finger showing it. */
type Cue = { ready: () => boolean; say: string; done: (since: number) => boolean; hand?: 'hold' | 'drag' };
let turnedAt = -10, firstPour = -1, cue = 0, cueShown = false, cueSince = 0;
const SHADE_DOWN = () => Math.abs(angleDiff(tree.k.sunAngle + Math.PI + turn, -Math.PI / 2)) < 0.6;
const COMPUTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
const CUES = (): Cue[] => [
  { ready: () => true, say: 'Held level, the sap gathers under the top of the slice', done: (s) => tree.fullness > 0.6 && s > 4 },
  ...(PHONE && rawDown && !COMPUTER ? [
    { ready: () => true, say: 'Tip the phone toward the shaded side, away from the sun, to pour the year’s growth there', done: (s: number) => firstPour >= 0 || s > 24 },
  ] : [
    { ready: () => true, hand: 'drag' as const, say: `Drag to turn the slice: bring the shaded side, away from the sun, to the foot`, done: (s: number) => (turnedAt > cueSince && SHADE_DOWN() && s > 3) || s > 16 },
    { ready: () => true, hand: 'hold' as const, say: `${COMPUTER ? 'Hold the mouse' : 'Hold a finger'} on the slice to tip it: the growth pours down the screen`, done: (s: number) => firstPour >= 0 || s > 24 },
  ]),
  { ready: () => tree.fullness >= 1, say: 'Heavy sap: tip it now, and the year surges', done: (s) => s > 7 },
  { ready: () => tree.brink > 0.78, say: 'Held too long, the trunk splits', done: (s) => s > 6 },
];
let cueList: Cue[] = [];
function cues(): void {
  if (cue >= cueList.length) return;
  const c = cueList[cue];
  if (!cueShown) {
    if (!c.ready()) return;
    cueShown = true; cueSince = tree.seconds;
    say(c.say);
    showGhost(c.hand ?? null);
    return;
  }
  if (c.done(tree.seconds - cueSince) && tree.seconds - cueSince > 3) { cue++; cueShown = false; showGhost(null); hush(); }
}
let sayTimer = 0;
function say(text: string): void {
  const el = $('event');
  el.textContent = text; el.classList.add('shown');
  clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => el.classList.remove('shown'), 9000);
}
function hush(): void { $('event').classList.remove('shown'); }
const ghost = $('ghost');
let ghostKind: 'hold' | 'drag' | null = null;
function showGhost(kind: 'hold' | 'drag' | null): void {
  ghostKind = kind;
  ghost.classList.remove('hold', 'drag');
  if (kind) ghost.classList.add(kind);
  ghost.classList.toggle('on', !!kind);
}
function placeGhost(v: View): void {
  if (!ghostKind) return;
  const r = maxOuter() * v.s / px, x = v.cx / px, y = v.cy / px + (ghostKind === 'drag' ? r * 0.75 : r * 0.35);
  ghost.style.transform = `translate(${x - 30}px, ${y - 6}px)`;
}

// ---------------------------------------------------------------- what the tree says, without words
let smoke: { angle: number; at: number } | null = null, lastTickAt = -1;
function heard(n: News): void {
  if (n.kind === 'ring' || n.kind === 'surge') {
    const i = tree.rings.length - 1;
    seen[i] = new Float32Array(ARCS).fill(clock());
    if (cacheView && !dirty) drawRing(cg, tree, cacheView, { water: WATER }, i);
    // A soft tick in the hand for each ring (on the iPhone, where it's a tick and not a buzz).
    if (NATIVE && tree.seconds - lastTickAt > 0.5) { lastTickAt = tree.seconds; tap({ strength: n.kind === 'surge' ? 0.32 : 0.14, sharpness: 0.65 }); }
  }
  if (n.kind === 'crack') { dirty = true; feel(30); }
  if (n.kind === 'fire') { dirty = true; smoke = { angle: n.angle ?? Math.PI, at: tree.seconds }; feel([20, 60, 20]); }
}

// ---------------------------------------------------------------- the card
let begun = false, kept: KeptTree | null = null;
const best = (): { even: number; years: number; met: boolean } | null => { try { return JSON.parse(remembered(`annulus.best.${T.id}`) ?? 'null'); } catch { return null; } };
function card(): void {
  const b = $('begin');
  (b.querySelector('.numeral') as HTMLElement).textContent = T.numeral;
  (b.querySelector('.name') as HTMLElement).textContent = T.name;
  (b.querySelector('.latin') as HTMLElement).textContent = T.latin;
  (b.querySelector('.mood') as HTMLElement).textContent = T.mood;
  (b.querySelector('.fact') as HTMLElement).textContent = T.fact;
  (b.querySelector('.todo') as HTMLElement).textContent = T.todo;
  (b.querySelector('.aims .first') as HTMLElement).textContent = WANDER ? 'Wander: the tree never dies.' : `Live ${T.years} years.`;
  (b.querySelector('.aims .second') as HTMLElement).textContent = WANDER ? 'Fell it when you choose.' : T.second;
  const bb = best();
  (b.querySelector('.best') as HTMLElement).textContent = !WANDER && bb ? `your best: ${bb.years} years${bb.met ? `, even to ${bb.even} in a hundred` : ''}` : '';
  const goingOn = begun ? tree : kept;
  (b.querySelector('.touch .what') as HTMLElement).textContent = goingOn ? 'Go on' : 'Begin';
  (b.querySelector('.touch small') as HTMLElement).textContent = goingOn ? `year ${begun ? tree.year : (kept!.sim.year as number)}` : '';
  (b.querySelector('[data-foot="wander"]') as HTMLElement).textContent = WANDER ? 'with an aim' : 'wander';
  for (const row of b.querySelectorAll<HTMLElement>('.row')) {
    const on = row.dataset.row === 'ink' ? (WATER ? 'water' : 'ink') : row.dataset.row === 'tilt' ? (PHONE ? 'phone' : 'finger') : (remembered('volcano.haptics') === 'off' ? 'off' : 'on');
    for (const o of row.querySelectorAll<HTMLElement>('button')) o.classList.toggle('on', o.dataset.v === on);
  }
  $('corner').textContent = T.numeral;
  $('stage-name').textContent = T.name;
}
$('begin').querySelector('.touch')!.addEventListener('click', async () => {
  await askForTilt();
  if (!begun && kept) {
    const t = treeFrom(kept, RULES);
    if (t) { tree = t; seed = kept.seed; turn = kept.turn; }
    seeAll();
  }
  if (!begun) {
    begun = true;
    cueList = CUES();
    // (Each lesson is taught until it's been done once: then not again.)
    if (remembered('annulus.learned') === '1') cueList = cueList.filter((c) => !c.hand && !c.say.startsWith('Held level') && !c.say.startsWith('Tip the phone'));
  }
  level = null; // (level is however the phone is held now)
  $('begin').classList.add('gone');
  document.body.classList.remove('carding');
  canvas.classList.add('shown');
  paused = false;
});
$('begin').querySelector('.foot')!.addEventListener('click', (e) => {
  const to = (e.target as HTMLElement).closest('button')?.dataset.foot;
  if (to === 'wander') { const q = new URLSearchParams(location.search); if (WANDER) q.delete('wander'); else q.set('wander', ''); q.delete('seed'); location.search = q.toString().replace(/wander=(&|$)/, 'wander$1'); }
  if (to === 'xylo') void openXylo();
  if (to === 'settings') { const s = $('begin').querySelector('.settings') as HTMLElement; s.hidden = !s.hidden; }
});
$('begin').querySelector('.settings')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'), row = b?.closest<HTMLElement>('.row')?.dataset.row, val = b?.dataset.v;
  if (!row || !val) return;
  if (row === 'ink') { WATER = val === 'water'; remember('annulus.ink', val); dirty = true; }
  if (row === 'tilt') { PHONE = val === 'phone'; remember('annulus.tilt', val); }
  if (row === 'haptics') remember('volcano.haptics', val);
  card();
});
let paused = true;
$('corner').addEventListener('click', () => {
  if (!playing()) return;
  paused = true; fingerHeld = false; save();
  card();
  $('begin').classList.remove('gone');
  document.body.classList.add('carding');
});
$('finish').addEventListener('click', () => { if (playing()) tree.fall('felled'); });
const playing = () => begun && !paused && !ending;

// ---------------------------------------------------------------- keeping it
function save(): void {
  if (!begun || ending || tree.over) return;
  void keepTree({ tree: T.id, seed, wander: WANDER, turn, sim: snapshotTree(tree) });
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// ---------------------------------------------------------------- the end
let ending: { at: number; plate?: HTMLCanvasElement } | null = null;
function end(): void {
  ending = { at: clock() };
  fingerHeld = false; showGhost(null); hush();
  document.body.classList.add('ended');
  rumble(0);
  feel([10, 80, 30]);
  const met = tree.year >= T.years, even = Math.round(100 * tree.evenness), was = best();
  if (!WANDER) remember(`annulus.best.${T.id}`, JSON.stringify({ years: Math.max(was?.years ?? 0, tree.year), met: met || !!was?.met, even: met ? Math.max(was?.met ? was.even : 0, even) : was?.even ?? 0 }));
  remember('annulus.learned', '1');
  void forgetTree();
}
function drawEndFrame(): void {
  fg.setTransform(1, 0, 0, 1, 0, 0);
  fg.clearRect(0, 0, W, H);
  if (!ending) return;
  const k = smooth((clock() - ending.at - 1.5) / 2);
  fg.globalAlpha = k;
  fg.strokeStyle = '#2e2118';
  const m = 14 * px;
  fg.lineWidth = 1.6 * px; fg.strokeRect(m, m, W - 2 * m, H - 2 * m);
  fg.lineWidth = 0.7 * px; fg.strokeRect(m + 6 * px, m + 6 * px, W - 2 * m - 12 * px, H - 2 * m - 12 * px);
  const rec = recordOf(tree, T), serif = '"Newsreader", "Iowan Old Style", Georgia, serif', y = H - 168 * px;
  fg.textAlign = 'center'; fg.fillStyle = '#2e2118';
  fg.font = `italic ${22 * px}px ${serif}`; fg.fillText(T.latin, W / 2, y);
  fg.font = `${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(`${T.name}, ${tree.year} years`, W / 2, y + 24 * px);
  fg.globalAlpha = k * 0.85;
  const notes = rec.notes, half = Math.ceil(notes.length / 2);
  fg.fillText(notes.slice(0, half).join('  ·  '), W / 2, y + 52 * px);
  fg.fillText(notes.slice(half).join('  ·  '), W / 2, y + 70 * px);
  fg.font = `italic ${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(rec.fate, W / 2, y + 96 * px);
  fg.globalAlpha = 1;
}
function keepThePlate(): void {
  if (!ending || ending.plate) return;
  const big = drawPlate(tree, T, WATER), small = document.createElement('canvas');
  ending.plate = big;
  small.width = 480; small.height = Math.round((480 * big.height) / big.width);
  { const sg = small.getContext('2d')!; sg.imageSmoothingQuality = 'high'; sg.drawImage(big, 0, 0, small.width, small.height); }
  void keepPlate({ tree: T.id, numeral: T.numeral, title: T.name, subtitle: recordOf(tree, T).subtitle, when: Date.now(), image: small.toDataURL('image/jpeg', 0.84), years: tree.year, evenness: Math.round(100 * tree.evenness) });
}
$('endlinks').addEventListener('click', (e) => {
  const to = (e.target as HTMLElement).closest('button')?.dataset.end;
  if (to === 'keep' && ending?.plate) void keepImage(ending.plate, `annulus-${T.id}-${tree.year}`);
  if (to === 'again') { const q = new URLSearchParams(location.search); q.delete('seed'); q.delete('grow'); location.search = q.toString().replace(/wander=(&|$)/, 'wander$1'); }
  if (to === 'xylo') void openXylo();
});

// ---------------------------------------------------------------- the xylotheque
async function openXylo(): Promise<void> {
  const box = $('xylo'), list = box.querySelector('.pages')!, view = box.querySelector('.view img') as HTMLImageElement;
  list.replaceChildren();
  const all = (await plates()).slice().reverse();
  if (!all.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No slices yet: each tree is kept here as a plate when it falls.'; list.appendChild(p); }
  for (const p of all) {
    const f = document.createElement('figure'), img = document.createElement('img'), cap = document.createElement('figcaption'), sm = document.createElement('small');
    img.src = p.image; img.alt = p.subtitle;
    cap.textContent = `${p.numeral}. ${p.title}`;
    sm.textContent = `${p.years} years · even ${p.evenness}%`;
    cap.appendChild(sm);
    f.append(img, cap);
    f.addEventListener('click', () => { view.src = p.image; box.classList.add('viewing'); });
    list.appendChild(f);
  }
  box.classList.add('open');
}
$('xylo').querySelector('.view')!.addEventListener('click', () => $('xylo').classList.remove('viewing'));
$('xylo').querySelector('.close')!.addEventListener('click', () => $('xylo').classList.remove('open', 'viewing'));

// ---------------------------------------------------------------- each frame
function goal(): void {
  const even = Math.round(100 * tree.evenness);
  $('goal').textContent = WANDER ? `Year ${tree.year} · wandering` : tree.year >= T.years ? `${tree.year} years: lived its ${T.years} · even ${even}%` : `Year ${tree.year} of ${T.years} · even ${even}%`;
  $('finish').classList.toggle('shown', WANDER && playing());
}
let last = performance.now(), brinkFelt = 0;
function frameStep(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing()) {
    turnKeys(dt);
    if (Math.abs(spinV) > 0.001) { turn += spinV * dt; spinV *= Math.exp(-dt * 2.5); lastMoved = clock(); }
    holdNow(dt);
    Object.assign(tree, feltBy(held));
    if (tree.tipped > 0 && firstPour < 0 && tree.sap < tree.k.heavy * 2) firstPour = tree.seconds;
    tree.step(dt);
    for (const n of tree.news) heard(n);
    tree.news.length = 0;
    cues();
    goal();
    // Near the brink, a low shudder in the hand (on the iPhone's own engine), rising to the split.
    const b = tree.brink;
    if (NATIVE) rumble(b > 0.8 ? (b - 0.8) * 2.5 : 0, 0.5);
    else if (b > 0.9 && tree.seconds - brinkFelt > 1.2) { brinkFelt = tree.seconds; feel(12); }
    if (tree.over) end();
    if (tree.seconds % 8 < dt) save();
  }
  if (ending) {
    // The slice comes to rest as the plate draws it: east to the right, whole, all its ink back.
    turn += angleDiff(0, turn) * Math.min(1, dt * 1.5);
    zoom += (1 - zoom) * Math.min(1, dt * 2);
    if (clock() - ending.at > 1 && !ending.plate) { seeAll(); keepThePlate(); }
    if (clock() - ending.at > 3) $('endlinks').classList.add('shown');
    drawEndFrame();
  }
  scale += (scaleWanted(roomNow()) - scale) * Math.min(1, dt * 3);
  draw(dt);
  requestAnimationFrame(frameStep);
}

function draw(dt: number): void {
  const v = view();
  if (playing() || ending) survey(v);
  reink(dt, v);
  const moving = clock() - lastMoved < 0.15, k = cacheView ? v.s / cacheView.s : 1;
  if (!cacheView || (dirty && !moving) || (!moving && (Math.abs(k - 1) > 0.012 || Math.abs(angleDiff(v.turn, cacheView.turn)) > 1e-4)) || (moving && zoom > 1.05 && clock() - lastRender > 0.25)) renderCache(v);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // Tipped, the slice leans a little toward the low side, as a globe held tipped does.
  const m = playing() ? tree.tipped : 0, a = -held.tipAngle, sq = 1 - 0.07 * m, off = 5 * px * m;
  const c = Math.cos(a), s = Math.sin(a);
  // (Squashed along the way it's tipped, about the pith, and moved a little toward it.)
  const A = c * c * sq + s * s, B = c * s * (sq - 1), D = s * s * sq + c * c;
  g.setTransform(A, B, B, D, v.cx - A * v.cx - B * v.cy + c * off, v.cy - B * v.cx - D * v.cy + s * off);
  drawShadow(g, tree, v);
  if (cacheView) {
    g.save();
    g.translate(v.cx, v.cy); g.rotate(-angleDiff(v.turn, cacheView.turn)); g.scale(v.s / cacheView.s, v.s / cacheView.s); g.translate(-cacheView.cx, -cacheView.cy);
    g.drawImage(cache, 0, 0);
    g.restore();
  }
  for (const f of fresh) inkArc(g, tree, v, f.i, (f.c / ARCS) * TAU, ((f.c + 1) / ARCS) * TAU);
  if (inking) inkArc(g, tree, v, inking.i, (inking.c / ARCS) * TAU, ((inking.c + Math.min(1, inking.t / inking.dur)) / ARCS) * TAU);
  drawYear(g, tree, v, playing());
  if (!ending) drawSap(g, tree, v);
  drawBark(g, tree, v);
  if (smoke) drawSmoke(g, tree, v, smoke.angle, tree.seconds - smoke.at);
  drawSun(g, tree, v);
  g.setTransform(1, 0, 0, 1, 0, 0);
  rainAmount += ((tree.weatherNow === RAIN && !ending ? 1 : 0) - rainAmount) * Math.min(1, dt * 0.8);
  drawRain(g, tree, v, W, H, clock(), rainAmount);
  placeGhost(v);
}
let rainAmount = 0;

// ---------------------------------------------------------------- begin
/**
 * (For trying it: ?grow=N grows the tree N years first, played as the card says, so the slice can be
 * seen grown without waiting.)
 */
function growFirst(years: number): void {
  let pouring = false, since = 0;
  const h: Held = { turn: -Math.PI / 2 - (tree.k.sunAngle + Math.PI), tipAngle: -Math.PI / 2, tip: 0 };
  while (tree.year < years && !tree.over) {
    if (!pouring && tree.fullness >= 1) { pouring = true; since = tree.seconds; }
    if (pouring && tree.sap < 0.05) pouring = false;
    h.tip = pouring ? fingerTip(tree.seconds - since) : 0;
    Object.assign(tree, feltBy(h));
    tree.step(1 / 30);
  }
  tree.news.length = 0;
}
fit();
card();
void (async () => {
  const grow = Number(ASKED.get('grow'));
  if (grow > 0) growFirst(grow);
  else if (!wanted) {
    const k = await recallTree();
    if (k && k.tree === T.id && !!k.wander === WANDER && k.sim) { kept = k; card(); }
  }
  seeAll();
  requestAnimationFrame(frameStep);
})();
