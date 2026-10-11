/**
 * Well Rounded, the prototype: you are one tree, and the screen shows its trunk in cross-section. Each
 * ring is drawn by hand, in one unhurried line round the last (an ensō): the finger is the pen (the
 * mouse, dragged, on a computer), and the line it draws is the ring's outer edge. A faint pencil circle
 * shows where an even ring would land; tracing it truly is the practice. The pace is the player's own:
 * it changes the line's tone, never its width, and the brush holds a ring's worth of wood, not of time.
 * Lift the finger to rest; touch the drop to go on (see tree.ts).
 *
 * Drawing is the one verb. Pinch (or the wheel) comes closer to read the rings, and springs back.
 *
 * Nothing on the slice is a control, and no words are written on it. The weather is told by the habit
 * drawing in the corner, a small engraving of the whole oak on its hill where the seasons turn in a
 * calm beat between strokes and what's coming gathers a ring or two ahead; it's heard there too (rain,
 * wind), and felt as forces on the line. The pen is heard on the paper, and on the iPhone felt as a
 * fine texture in the hand. A few quiet lines at the head teach the hand, once. When the tree falls,
 * its whole life is played back in about twenty seconds, and its slice is set out as a plate and kept
 * in the xylotheque.
 */
import '../volcano/fonts.css';
import { feel, keepImage, NATIVE, rumble, tap } from '../volcano/native';
import { TreeSim, DROUGHT, RAIN, WIND, type News, type Weather } from './tree';
import { pen, setSound, soundOff, tick, wake, weather as weatherSound } from './sound';
import { treeOf, EVEN_AIM } from './trees';
import { bandOf, brushAt, pointerAt, roomOf, scaleFor, tall, type View } from './hand';
import { ARCS, PAPER, drawBark, drawDamp, drawGuide, drawPaper, drawShadow, drawSlice, drawSun, drawTip, drawWet, inkArc, radiusAt } from './draw';
import { drawHabit, type Box, type Scene } from './habit';
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
/** The ink: watercolour (the default, as in the volcano game) or engraving, ink only. */
let WATER = (ASKED.get('ink') ?? remembered('annulus.ink') ?? 'water') === 'water';
/** Seconds a ring laid stays damp: its dark wet ink drying into the wash; painted over before then, they bleed. */
const DAMP = 3.6;
let closedAt = -100;
/** The pencil circle breathes, slowly (about six breaths a minute), as a suggestion of pace; or keeps still. */
let BREATH = remembered('annulus.breath') !== 'off';

// ---------------------------------------------------------------- the tree
let seed = wanted || 1 + Math.floor(Math.random() * 1e6);
let tree = new TreeSim(seed, RULES);

// ---------------------------------------------------------------- the page
const canvas = $('slice') as HTMLCanvasElement, g = canvas.getContext('2d')!;
const frame = $('frame') as HTMLCanvasElement, fg = frame.getContext('2d')!;
const cache = document.createElement('canvas'), cg = cache.getContext('2d')!;
/** The bark, kept aside as the rings are (it's laid faint while a wet stroke is painted against it). */
const barkCache = document.createElement('canvas'), bg = barkCache.getContext('2d')!;
let W = 1, H = 1, px = 1;
function fit(): void {
  px = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(innerWidth * px)); H = Math.max(1, Math.round(innerHeight * px));
  for (const c of [canvas, frame, cache, barkCache]) { c.width = W; c.height = H; }
  dirty = true; scale = 0;
  if (ending) drawEndFrame();
}
addEventListener('resize', fit);

/** How near (1 to CLOSEST), eased back to 1 a few seconds after a pinch. */
let zoom = 1, zoomedAt = -10;
const CLOSEST = 3;
/** The scale (device px a mm), eased between strokes so a new ring doesn't jump the slice. */
let scale = 0;

function view(): View {
  const r = roomOf(W, H, px, !!ending);
  if (!scale) scale = scaleFor(tree, r.room, px);
  return { cx: r.cx, cy: r.cy, s: scale * zoom, turn: 0, px };
}
/** Where the habit drawing sits: under the slice on a tall screen, else in the lower right corner. */
function habitBox(): Box {
  if (ending && ending.plate) return { x: 0, y: 0, w: 0, h: 0 };
  if (tall(W, H)) {
    const w = Math.min(W - 40 * px, 300 * px), h = Math.min(150 * px, w * 0.55);
    return { x: (W - w) / 2, y: H - h - 22 * px, w, h };
  }
  const w = Math.min(260 * px, W * 0.24), h = w * 0.72;
  return { x: W - w - 22 * px, y: H - h - 22 * px, w, h };
}

// ---------------------------------------------------------------- the ink kept, and fading
/**
 * Inked rings are drawn once onto a canvas kept aside, and laid onto the page each frame (scaled while
 * a pinch moves; drawn again crisp once it stops). Rings out of view (when you come close) are held
 * 25 s, then fade over 45 s to pencil, never below; back in view, the ink comes back along them,
 * nearest the middle first (STYLE.md's fading ink).
 */
let dirty = true, cacheView: View | null = null, lastMoved = -10, lastRender = -10, cacheUpto = -1;
const HOLD = 25, FADE = 45, STALE = 0.35;
let seen: Float32Array[] = [];
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
function survey(v: View): void {
  const now = clock(), m = 12 * px;
  let fading = 0;
  for (let i = 0; i < tree.rings.length; i++) {
    const s = seen[i] ?? (seen[i] = new Float32Array(ARCS).fill(now));
    for (let c = 0; c < ARCS; c++) {
      const a = ((c + 0.5) / ARCS) * TAU, r = radiusAt(tree.rings[i], a), t = a + v.turn;
      const x = v.cx + v.s * r * Math.cos(t), y = v.cy - v.s * r * Math.sin(t);
      const f = fadeOf(i, c);
      if (f > 0.01) fading += f;
      if (x < -m || y < -m || x > W + m || y > H + m) continue;
      if (f > STALE) { if (!waiting.some((w) => w.i === i && w.c === c) && !(inking && inking.i === i && inking.c === c)) waiting.push({ i, c }); continue; }
      if (f < 0.01) s[c] = now;
    }
  }
  if (Math.abs(fading - fadesDrawn) > 2) { fadesDrawn = fading; dirty = true; }
}
function reink(dt: number, v: View): void {
  if (inking) {
    inking.t += dt;
    if (inking.t >= inking.dur) { seen[inking.i][inking.c] = clock(); fresh.push({ i: inking.i, c: inking.c }); inking = null; }
  }
  if (!inking && waiting.length && clock() - lastMoved > 0.6) {
    const dist = (w: { i: number; c: number }) => { const a = ((w.c + 0.5) / ARCS) * TAU, r = radiusAt(tree.rings[w.i], a) * v.s; return Math.hypot(v.cx + r * Math.cos(a) - W / 2, v.cy - r * Math.sin(a) - H / 2); };
    waiting.sort((a, b) => dist(a) - dist(b));
    const w = waiting.shift()!, len = (TAU / ARCS) * radiusAt(tree.rings[w.i], ((w.c + 0.5) / ARCS) * TAU) * v.s;
    inking = { ...w, t: 0, dur: Math.max(0.012, len / (5000 * px)) }; // (quick, and with no nib: the brush is what moves for attention)
  }
  if (!inking && !waiting.length && fresh.length) dirty = true;
}
function renderCache(v: View, upto = tree.rings.length): void {
  cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.clearRect(0, 0, W, H);
  // (The shadow first, then the slice laid over it on clean paper; the bark on its own.)
  drawShadow(cg, tree, v, upto);
  drawSlice(cg, tree, v, { water: WATER }, ending ? undefined : fadeOf, upto);
  bg.setTransform(1, 0, 0, 1, 0, 0);
  bg.clearRect(0, 0, W, H);
  drawBark(bg, tree, v, upto);
  cacheView = { ...v }; cacheUpto = upto;
  dirty = false; fresh = []; lastRender = clock();
}

// ---------------------------------------------------------------- the year's turn
/**
 * One stroke is a ring (five years). Ready: the pen waits. Painting: the line is being drawn (the
 * finger down, or resting). Drying: the wet line draws in to the true ring. Beat: a calm breath, autumn
 * to winter to spring in the habit drawing, and what comes next arrives there.
 */
type Phase = 'ready' | 'painting' | 'drying' | 'beat';
let phase: Phase = 'ready', phaseAt = 0;
const DRYING = 0.6, BEAT = 1.3;
function enter(p: Phase): void { phase = p; phaseAt = clock(); }
/** The view and band frozen for the stroke (and its drying), so the brush's frame never moves under the finger. */
let strokeView: View | null = null, strokeBand = 1;
/** Where the drop of ink waits: where the last stroke ended (the north, at first). */
let restAngle = Math.PI / 2;
/** Seconds of breath: the pencil circle's slow pulse. */
const BREATHE = 10;

// ---------------------------------------------------------------- the hand
const pointers = new Map<number, { x: number; y: number }>();
let painter: number | null = null, pinch: { d: number; z: number } | null = null;
const spread = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
const now = (e: PointerEvent) => (e.timeStamp > 0 ? e.timeStamp / 1000 : clock());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  document.body.classList.add('touching');
  wake();
  if (ending) { if (clock() - ending.at > 1.2 && !ending.plate) ending.skip = true; return; }
  if (pointers.size === 2 && painter === null) { pinch = { d: spread(), z: zoom }; return; }
  if (pointers.size !== 1 || !playing()) return;
  // Resting: a touch near the drop takes the line up again, where it stopped.
  if (phase === 'painting' && strokeView && tree.resting) {
    const b = brushAt(tree, strokeView, strokeBand, e.clientX * px, e.clientY * px);
    if (b.u > -3 && b.u < 6 && tree.begin(now(e), b.a, b.u)) { painter = e.pointerId; feel(4); }
    return;
  }
  if (phase !== 'ready') return;
  // A touch near the bark takes up the pen (within a few bands of it, either side).
  const v = view(), band = bandOf(tree, v), b = brushAt(tree, v, band, e.clientX * px, e.clientY * px);
  if (b.u < -2.5 || b.u > 5) return;
  strokeView = v; strokeBand = band;
  const sb = brushAt(tree, strokeView, strokeBand, e.clientX * px, e.clientY * px);
  // (Begun while the last ring is still damp, the two washes bleed together, wet-in-wet.)
  const damp = WATER && tree.ring > 0 && clock() - closedAt < DAMP;
  if (tree.begin(now(e), sb.a, sb.u)) { painter = e.pointerId; enter('painting'); feel(6); if (damp) { tree.bleed(); dirty = true; } }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) { zoom = Math.max(1, Math.min(CLOSEST, (pinch.z * spread()) / Math.max(1, pinch.d))); zoomedAt = clock(); lastMoved = clock(); return; }
  if (e.pointerId !== painter || !strokeView) return;
  // (Every point the hand passed through, not only those a frame shows: a stroke is its whole path.)
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const b = brushAt(tree, strokeView, strokeBand, c.clientX * px, c.clientY * px);
    tree.move(now(c), b.a, b.u);
  }
  hear();
});
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => {
  pointers.delete(e.pointerId);
  if (!pointers.size) document.body.classList.remove('touching');
  if (pointers.size < 2) pinch = null;
  if (e.pointerId === painter) { painter = null; tree.lift(); hear(); if (tree.resting && firstRest < 0) firstRest = tree.ring; }
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (phase === 'painting') return; zoom = Math.max(1, Math.min(CLOSEST, zoom * Math.exp(-e.deltaY * 0.002))); zoomedAt = clock(); lastMoved = clock(); }, { passive: false });

// ---------------------------------------------------------------- the first lines, one idea at a time
/** A first line: when it's ready, what it says, when it's done; and whether the ghost finger shows it. */
type Cue = { ready: () => boolean; say: string; done: (since: number) => boolean; hand?: boolean };
let cue = 0, cueShown = false, cueSince = 0, firstWound = -1, firstRest = -1;
const COMPUTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
const CUES = (): Cue[] => [
  { ready: () => true, hand: true, say: `${COMPUTER ? 'Drag the mouse' : 'Draw with a finger'} round the slice, along the pencil circle, in one unhurried line`, done: () => tree.ring >= 1 },
  { ready: () => tree.ring >= 1, say: 'Your line is the ring’s edge. Trace the circle as truly as you can; take all the time you like', done: () => tree.ring >= 3 },
  { ready: () => firstRest >= 0, say: 'Rest whenever you like: touch the drop to go on', done: (s) => s > 6 && !tree.resting },
  { ready: () => firstWound >= 0, say: 'Too close to the bark, and the wood there dies; the rings after it roll over the wound', done: (s) => s > 7 && phase === 'ready' },
];
let cueList: Cue[] = [];
function cues(): void {
  if (cue >= cueList.length) return;
  const c = cueList[cue];
  if (!cueShown) {
    if (!c.ready()) return;
    cueShown = true; cueSince = clock();
    say(c.say);
    ghostOn = !!c.hand;
    return;
  }
  if (c.done(clock() - cueSince)) { cue++; cueShown = false; ghostOn = false; hush(); }
}
let sayTimer = 0;
function say(text: string): void {
  const el = $('event');
  el.textContent = text; el.classList.add('shown');
  clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => el.classList.remove('shown'), 11000);
}
function hush(): void { $('event').classList.remove('shown'); }
/** The ghost finger: a soft round light going round the bark, as a finger would. */
const ghost = $('ghost');
let ghostOn = false;
function placeGhost(v: View): void {
  const on = ghostOn && phase === 'ready' && playing();
  ghost.classList.toggle('on', on);
  if (!on) return;
  const t = (clock() % 5) / 5, a = Math.PI / 2 + t * TAU, gu = tree.guide(), p = pointerAt(tree, v, bandOf(tree, v), a, radiusAt(gu, a));
  ghost.style.transform = `translate(${p.x / px - 30}px, ${p.y / px - 6}px)`;
  ghost.style.opacity = String(Math.sin(Math.PI * Math.min(1, t * 1.15)));
}

// ---------------------------------------------------------------- what the tree says, without words
let fireAt = -100, lastTickAt = -1;
function hear(): void {
  for (const n of tree.news) heard(n);
  tree.news.length = 0;
}
function heard(n: News): void {
  if (n.kind === 'ring') {
    const i = tree.rings.length - 1;
    seen[i] = new Float32Array(ARCS).fill(clock());
    dirty = true;
    enter('drying');
    closedAt = clock();
    restAngle = tree.starts[i] + tree.dirs[i] * TAU;
    // A soft tick in the hand as a ring closes (on the iPhone's own engine; in a browser, nothing).
    if (clock() - lastTickAt > 0.3) { lastTickAt = clock(); tick(); if (NATIVE) tap({ strength: 0.24, sharpness: 0.7 }); }
    if (NATIVE) rumble(0);
    pen(0);
    save();
  }
  if (n.kind === 'died') { dirty = true; if (firstWound < 0) firstWound = tree.ring; }
  if (n.kind === 'healed' || n.kind === 'gap' || n.kind === 'crack') dirty = true;
  if (n.kind === 'fire') { dirty = true; fireAt = clock(); feel([20, 60, 20]); }
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
  (b.querySelector('.aims .first') as HTMLElement).textContent = WANDER ? 'Wander: the tree never dies.' : `Live ${T.years} years: never let a side starve.`;
  (b.querySelector('.aims .second') as HTMLElement).textContent = WANDER ? 'Fell it when you choose.' : T.second;
  const bb = best();
  (b.querySelector('.best') as HTMLElement).textContent = !WANDER && bb ? `your best: ${bb.years} years${bb.met ? `, even to ${bb.even} in a hundred` : ''}` : '';
  const goingOn = begun ? tree : kept;
  (b.querySelector('.touch .what') as HTMLElement).textContent = goingOn ? 'Go on' : 'Begin';
  (b.querySelector('.touch small') as HTMLElement).textContent = goingOn ? `year ${begun ? tree.year : (kept!.sim.rings as unknown[]).length * tree.k.yearsPerRing}` : '';
  const again = b.querySelector('.again') as HTMLButtonElement;
  again.hidden = !goingOn;
  again.classList.remove('asking');
  again.textContent = 'plant again';
  (b.querySelector('[data-foot="wander"]') as HTMLElement).textContent = WANDER ? 'with an aim' : 'wander';
  for (const row of b.querySelectorAll<HTMLElement>('.row')) {
    const on = row.dataset.row === 'ink' ? (WATER ? 'water' : 'ink') : row.dataset.row === 'sound' ? (soundOff() ? 'off' : 'on') : row.dataset.row === 'breath' ? (BREATH ? 'on' : 'off') : (remembered('volcano.haptics') === 'off' ? 'off' : 'on');
    for (const o of row.querySelectorAll<HTMLElement>('button')) o.classList.toggle('on', o.dataset.v === on);
  }
  $('corner').textContent = T.numeral;
  $('stage-name').textContent = T.name;
}
$('begin').querySelector('.touch')!.addEventListener('click', () => {
  wake();
  if (!begun && kept) {
    const t = treeFrom(kept, RULES);
    if (t) { tree = t; seed = kept.seed; scale = 0; }
    seeAll();
  }
  if (!begun) {
    begun = true;
    cueList = CUES();
    // (Each lesson is taught until the tree's been painted through once: then not again.)
    if (remembered('annulus.learned') === '1') cueList = cueList.slice(2);
  }
  $('begin').classList.add('gone');
  document.body.classList.remove('carding');
  canvas.classList.add('shown');
  paused = false;
});
/**
 * Plant again: a fresh tree, the one in play let go. It asks once (the tree can't be had back), and
 * forgets the question after a few seconds.
 */
let askedAt = 0;
$('begin').querySelector('.again')!.addEventListener('click', () => {
  const b = $('begin').querySelector('.again') as HTMLButtonElement;
  wake();
  if (!b.classList.contains('asking') || clock() - askedAt > 5) {
    b.classList.add('asking'); b.textContent = 'let this tree go? tap again'; askedAt = clock();
    setTimeout(() => { if (b.classList.contains('asking') && clock() - askedAt >= 4.9) card(); }, 5000);
    return;
  }
  plantAgain();
});
function plantAgain(): void {
  void forgetTree();
  kept = null;
  seed = 1 + Math.floor(Math.random() * 1e6);
  tree = new TreeSim(seed, RULES);
  painter = null; strokeView = null; scale = 0; zoom = 1; fireAt = -100; restAngle = Math.PI / 2;
  cue = 0; cueShown = false; ghostOn = false; firstWound = -1; firstRest = -1; hush();
  enter('ready');
  seeAll();
  begun = false;
  card();
  ($('begin').querySelector('.touch') as HTMLButtonElement).click();
}
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
  if (row === 'haptics') remember('volcano.haptics', val);
  if (row === 'sound') { wake(); setSound(val === 'on'); }
  if (row === 'breath') { BREATH = val === 'on'; remember('annulus.breath', val); }
  card();
});
let paused = true;
$('corner').addEventListener('click', () => {
  if (!playing()) return;
  // (A ring part drawn is let go: it's drawn again, from the start, when the tree is taken up.)
  if (tree.stroke) { tree.cancel(); painter = null; strokeView = null; enter('ready'); }
  closedAt = -100;
  pen(0); weatherSound(0, 0, 0); if (NATIVE) rumble(0);
  paused = true; save();
  card();
  $('begin').classList.remove('gone');
  document.body.classList.add('carding');
});
$('finish').addEventListener('click', () => { if (playing()) { tree.fall('felled'); hear(); } });
const playing = () => begun && !paused && !ending;

// ---------------------------------------------------------------- keeping it
function save(): void {
  if (!begun || ending || tree.over) return;
  void keepTree({ tree: T.id, seed, wander: WANDER, turn: 0, sim: snapshotTree(tree) });
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// ---------------------------------------------------------------- the end: the whole life again, then the plate
/** The time-lapse: about twenty seconds, the rings spreading from the pith as the little tree grows, then it falls. */
const LAPSE = 18, FALLING = 2.5;
let ending: { at: number; plate?: HTMLCanvasElement; skip?: boolean } | null = null;
function end(): void {
  ending = { at: clock() };
  painter = null; ghostOn = false; hush();
  document.body.classList.add('ended');
  rumble(0); pen(0); weatherSound(0, 0, 0);
  feel([10, 80, 30]);
  const met = tree.year >= T.years, even = Math.round(100 * tree.evenness), was = best();
  if (!WANDER) remember(`annulus.best.${T.id}`, JSON.stringify({ years: Math.max(was?.years ?? 0, tree.year), met: met || !!was?.met, even: met ? Math.max(was?.met ? was.even : 0, even) : was?.even ?? 0 }));
  remember('annulus.learned', '1');
  void forgetTree();
  scale = 0; zoom = 1; dirty = true;
}
/** How far through the time-lapse (seconds), or past it. */
const lapsed = () => (ending ? (ending.skip ? LAPSE + FALLING + 1 : clock() - ending.at) : 0);
function drawEndFrame(): void {
  fg.setTransform(1, 0, 0, 1, 0, 0);
  fg.clearRect(0, 0, W, H);
  if (!ending || !ending.plate) return;
  const k = smooth((lapsed() - LAPSE - FALLING - 0.3) / 1.5);
  fg.globalAlpha = k;
  fg.strokeStyle = '#2e2118';
  const m = 14 * px;
  fg.lineWidth = 1.6 * px; fg.strokeRect(m, m, W - 2 * m, H - 2 * m);
  fg.lineWidth = 0.7 * px; fg.strokeRect(m + 6 * px, m + 6 * px, W - 2 * m - 12 * px, H - 2 * m - 12 * px);
  const rec = recordOf(tree, T), serif = '"Newsreader", "Iowan Old Style", Georgia, serif', y = H - 190 * px;
  fg.textAlign = 'center'; fg.fillStyle = '#2e2118';
  fg.font = `italic ${22 * px}px ${serif}`; fg.fillText(T.latin, W / 2, y);
  fg.font = `${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(`Well Rounded · ${T.name}, ${tree.year} years`, W / 2, y + 24 * px);
  fg.globalAlpha = k * 0.85;
  // What the wood records, as many to a line as the page is wide.
  const lines: string[] = [];
  for (const n of rec.notes) { const l = lines.length ? `${lines[lines.length - 1]}  ·  ${n}` : n; if (lines.length && fg.measureText(l).width < W - 60 * px) lines[lines.length - 1] = l; else lines.push(n); }
  lines.forEach((l, i) => fg.fillText(l, W / 2, y + (50 + 18 * i) * px));
  fg.font = `italic ${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(rec.fate, W / 2, y + (58 + 18 * lines.length) * px);
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
  if (to === 'keep' && ending?.plate) void keepImage(ending.plate, `well-rounded-${T.id}-${tree.year}`);
  if (to === 'again') { const q = new URLSearchParams(location.search); q.delete('seed'); q.delete('grow'); location.search = q.toString().replace(/wander=(&|$)/, 'wander$1'); }
  if (to === 'xylo') void openXylo();
});

// ---------------------------------------------------------------- the xylotheque
async function openXylo(): Promise<void> {
  const box = $('xylo'), list = box.querySelector('.pages')!, img = box.querySelector('.view img') as HTMLImageElement;
  list.replaceChildren();
  const all = (await plates()).slice().reverse();
  if (!all.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No slices yet: each tree is kept here as a plate when it falls.'; list.appendChild(p); }
  for (const p of all) {
    const f = document.createElement('figure'), im = document.createElement('img'), cap = document.createElement('figcaption'), sm = document.createElement('small');
    im.src = p.image; im.alt = p.subtitle;
    cap.textContent = `${p.numeral}. ${p.title}`;
    im.title = `Well Rounded, plate ${p.numeral}: ${p.subtitle}`;
    sm.textContent = `${p.years} years · even ${p.evenness}%`;
    cap.appendChild(sm);
    f.append(im, cap);
    f.addEventListener('click', () => { img.src = p.image; box.classList.add('viewing'); });
    list.appendChild(f);
  }
  box.classList.add('open');
}
$('xylo').querySelector('.view')!.addEventListener('click', () => $('xylo').classList.remove('viewing'));
$('xylo').querySelector('.close')!.addEventListener('click', () => $('xylo').classList.remove('open', 'viewing'));

// ---------------------------------------------------------------- each frame
function goal(): void {
  const even = Math.round(100 * tree.evenness);
  $('goal').textContent = WANDER ? `Year ${tree.year} · wandering` : tree.year >= T.years ? `${tree.year} years: lived its ${T.years} · even ${even}%${even >= EVEN_AIM ? '' : ` of ${EVEN_AIM}`}` : `Year ${tree.year} of ${T.years} · even ${even}%`;
  $('finish').classList.toggle('shown', WANDER && playing());
}
let last = performance.now();
function frameStep(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (playing()) {
    if (phase === 'drying' && clock() - phaseAt > DRYING) enter('beat');
    if (phase === 'beat' && clock() - phaseAt > BEAT) { enter('ready'); strokeView = null; }
    // The pen on the paper: heard, and on the iPhone felt as a fine texture in the hand while it moves.
    const tip = tree.tip, moving = phase === 'painting' && painter !== null && tip ? Math.min(1, (tip.w * tree.radius * scale) / (420 * px)) : 0;
    pen(moving);
    if (NATIVE) rumble(moving > 0.03 ? 0.05 + 0.1 * moving * (tree.inkLeft > 0.02 ? 1 : 0.6) : 0, tree.inkLeft > 0.02 ? 0.85 : 0.35);
    // The weather in the habit drawing, heard: rain, and wind (with the gathering of what's coming).
    const sc = sceneNow(), level = (k: Weather) => (sc.weather === k ? 1 : 0) + (sc.coming === k && sc.weather !== k ? 0.5 * sc.gather : 0);
    weatherSound(level(RAIN), level(WIND), clock());
    hear();
    cues();
    goal();
    if (tree.over) end();
  }
  if (ending) {
    if (lapsed() > LAPSE + FALLING && !ending.plate) { keepThePlate(); seeAll(); dirty = true; }
    if (lapsed() > LAPSE + FALLING + 1.5) $('endlinks').classList.add('shown');
    drawEndFrame();
  }
  // The slice grows into its room between strokes; and a pinch springs back once it's let be.
  if (phase !== 'painting' && phase !== 'drying') scale += (scaleFor(tree, roomOf(W, H, px, !!ending).room, px) - scale) * Math.min(1, dt * 3);
  if (!pinch && zoom > 1 && clock() - zoomedAt > 4 && phase !== 'painting' && phase !== 'drying') { zoom = 1 + (zoom - 1) * Math.exp(-dt * 3); if (zoom < 1.003) zoom = 1; lastMoved = clock(); }
  draw(dt);
  requestAnimationFrame(frameStep);
}

/** The scene in the habit drawing now: the season by where the year is, the weather now and coming. */
function sceneNow(): Scene {
  const r = tree.ring, next1 = tree.weatherOf(r + 1), next2 = tree.weatherOf(r + 2);
  const since = clock() - phaseAt;
  // Spring to autumn as the stroke goes round; autumn to winter to spring in the beat between.
  const season = phase === 'painting' ? 0.12 + 0.42 * tree.progress
    : phase === 'drying' ? 0.52 + 0.1 * Math.min(1, since / DRYING)
    : phase === 'beat' ? 0.62 + 0.5 * Math.min(1, since / BEAT)
    : 0.12;
  const coming: Weather = next1 || next2, gather = next1 ? 0.6 + 0.4 * (phase === 'painting' ? tree.progress : phase === 'ready' ? 0 : 1) : next2 ? 0.3 : 0;
  const fireComing = tree.fireBefore(r + 1) ? 0.6 + 0.4 * tree.progress : tree.fireBefore(r + 2) ? 0.3 : 0;
  const burning = Math.max(0, 1 - Math.max(0, clock() - fireAt - 2.5) / 3);
  return {
    age: tree.year + (phase === 'painting' ? tree.progress * tree.k.yearsPerRing : 0), season, weather: tree.weatherNow, now: 1, coming, gather, fire: burning, fireComing,
    wind: Math.cos(tree.windOf(tree.weatherNow === WIND ? r : r + 1)), time: clock(), fallen: 0, water: WATER, seed: tree.seed, px,
  };
}
/** The scene in the time-lapse: the life played back, a ring a breath; and at the end, the fall. */
function sceneLapse(f: number, ring: number): Scene {
  const i = Math.min(tree.ringWeather.length - 1, Math.max(0, ring));
  const w = (tree.ringWeather[i] ?? 0) as Weather, fire = tree.scars.some((s) => Math.abs(s.ring - f * tree.rings.length) < 0.8) ? 1 : 0;
  const t = lapsed();
  return {
    age: f * tree.year, season: 0.15 + 0.5 * ((f * tree.rings.length) / 4 % 1), weather: w, now: 1, coming: 0, gather: 0, fire, fireComing: 0,
    wind: Math.cos(tree.windOf(i)), time: clock(), fallen: tree.k.endless && tree.cause === 'felled' ? smooth((t - LAPSE) / FALLING) : smooth((t - LAPSE) / FALLING) ** 2, water: WATER, seed: tree.seed, px,
  };
}

function draw(dt: number): void {
  const v = view();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  if (ending) { drawEnding(v); return; }
  if (playing()) survey(v);
  reink(dt, v);
  const moving = clock() - lastMoved < 0.15, k = cacheView ? v.s / cacheView.s : 1;
  if (!cacheView || cacheUpto !== tree.rings.length || (dirty && !moving) || (!moving && Math.abs(k - 1) > 0.012) || (moving && zoom > 1.05 && clock() - lastRender > 0.25)) renderCache(v);
  const wet = phase === 'painting' || phase === 'drying';
  const sv = wet && strokeView ? strokeView : v;
  const bark = phase === 'painting' ? 0.3 : phase === 'drying' ? 0.3 + 0.7 * smooth((clock() - phaseAt) / DRYING) : 1;
  if (cacheView) {
    g.save();
    g.translate(sv.cx, sv.cy); g.scale(sv.s / cacheView.s, sv.s / cacheView.s); g.translate(-cacheView.cx, -cacheView.cy);
    g.drawImage(cache, 0, 0);
    g.globalAlpha = bark; g.drawImage(barkCache, 0, 0);
    g.restore();
  }
  // The ring just laid, still damp in watercolour: dark wet ink, drying over a few seconds into its wash.
  if (WATER && playing() && tree.ring > 0 && phase !== 'drying') drawDamp(g, tree, sv, tree.ring - 1, 1 - smooth((clock() - closedAt) / DAMP));
  for (const f of fresh) inkArc(g, tree, sv, f.i, (f.c / ARCS) * TAU, ((f.c + 1) / ARCS) * TAU);
  if (inking) inkArc(g, tree, sv, inking.i, (inking.c / ARCS) * TAU, ((inking.c + Math.min(1, inking.t / inking.dur)) / ARCS) * TAU);
  const band = wet ? strokeBand : bandOf(tree, v);
  if (playing()) {
    // (The pencil circle breathes, if it's to: in over five seconds, out over five.)
    const breath = BREATH ? 0.72 + 0.28 * Math.cos((clock() * TAU) / BREATHE) : 1;
    const beat = phase === 'beat' ? smooth((clock() - phaseAt) / BEAT) : 0;
    drawGuide(g, tree, sv, band, (phase === 'ready' ? 1 : phase === 'painting' ? 0.6 : beat) * breath);
    if (phase === 'painting') drawWet(g, tree, sv, band, WATER);
    if (phase === 'drying') drawWet(g, tree, sv, band, WATER, { dry: smooth((clock() - phaseAt) / DRYING), from: tree.rings.length - 1 });
    const tip = tree.tip;
    if (phase === 'painting' && tip) {
      const p = pointerAt(tree, sv, band, tip.a, tip.u), rest = tree.resting ? 0.85 + 0.15 * Math.sin(clock() * 1.3) : 1;
      drawTip(g, p.x, p.y, tree.inkLeft * rest, sv, band);
    }
    if (phase === 'ready') { const gu = tree.guide(), p = pointerAt(tree, sv, band, restAngle, radiusAt(gu, restAngle)), pulse = 0.85 + 0.15 * Math.sin(clock() * 1.3); drawTip(g, p.x, p.y, pulse, sv, band); }
  }
  drawSun(g, tree, sv, tree.weatherNow === DROUGHT, 3.5 * band);
  drawHabit(g, habitBox(), sceneNow());
  if (WATER) drawPaper(g, W, H);
  placeGhost(sv);
}

function drawEnding(v: View): void {
  const t = lapsed(), n = tree.rings.length, f = Math.min(1, t / LAPSE), upto = Math.min(n, Math.ceil(f * n));
  if (!cacheView || cacheUpto !== upto || dirty || Math.abs(cacheView.s - v.s) > 1e-6) renderCache(v, upto);
  g.drawImage(cache, 0, 0);
  g.drawImage(barkCache, 0, 0);
  if (!ending!.plate) drawHabit(g, habitBox(), sceneLapse(f, upto - 1));
  if (WATER) drawPaper(g, W, H);
}

// ---------------------------------------------------------------- begin
/**
 * (For trying it: ?grow=N grows the tree N years first, painted evenly by a steady, careful hand in
 * the tree's own terms, so the slice can be seen grown without painting it.)
 */
function growFirst(years: number): void {
  let time = 0;
  while (tree.year < years && !tree.over) {
    const start = Math.random() * TAU, gu = tree.guide(), pace = TAU / (4 + Math.random() * 2);
    let a = start;
    tree.begin(time, a, radiusAt(gu, a));
    while (tree.stroke) {
      a += pace / 60; time += 1 / 60;
      const sun = -tree.k.sun * Math.cos(a - tree.k.sunAngle), push = tree.weatherNow === WIND ? -tree.k.wind * Math.cos(a - tree.windOf()) : 0;
      tree.move(time, a % TAU, radiusAt(gu, a) * (tree.weatherNow === DROUGHT ? 0.9 : 1) + sun + push);
    }
    time += 1;
  }
  tree.news.length = 0;
}
// (?debug: the tree and the view, for a headless browser to paint with, as hand.ts paints.)
if (ASKED.has('debug')) Object.assign(window, { annulus: { get tree() { return tree; }, get view() { return view(); }, get phase() { return phase; }, get band() { return bandOf(tree, view()); } } });
fit();
card();
void (async () => {
  const grow = Number(ASKED.get('grow'));
  if (grow > 0) growFirst(grow);
  else if (!wanted) {
    const k = await recallTree();
    if (k && k.tree === T.id && !!k.wander === WANDER && k.sim && Array.isArray(k.sim.ringEven)) { kept = k; card(); }
  }
  seeAll();
  requestAnimationFrame(frameStep);
})();
