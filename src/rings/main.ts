/**
 * Well Rounded (the working title was Annulus), the prototype: you are one tree, and the screen shows
 * its trunk in cross-section. Each ring is painted by hand in watercolour, in one stroke round the last
 * (an ensō): the finger is the brush (the mouse, dragged, on a computer). Slow lays wide wood, quick a
 * thin line. Nothing can go wrong: lift too soon and touch again to carry on, or leave it and the water
 * closes the ring; the tree never dies, and its life ends when you let it rest (see tree.ts).
 *
 * The paint is alive while it's wet (wash.ts): colours run into one another, drift and swirl, gather
 * at their drying edges, and settle into the paper; then they fade, so the newest ring glows and the
 * older ones pale to ghosts. Each ring runs spring green to summer gold to autumn sienna the way its
 * stroke went, and the weather mixes its own pigment in (palette.ts).
 *
 * No words on the slice. The weather is told by the habit drawing in the corner, a small watercolour of
 * the whole oak on its hill where the seasons turn between strokes and what's coming gathers a ring or
 * two ahead. A few quiet lines at the head teach the hand, once. When you let the tree rest, its whole
 * life plays back in about twenty seconds, all its colour returned, and its slice is set out as a
 * plate and kept in the xylotheque.
 */
import '../volcano/fonts.css';
import { feel, keepImage, NATIVE, rumble, tap } from '../volcano/native';
import { TreeSim, K, RAIN, DROUGHT, WIND, FROST, type News, type Weather } from './tree';
import { treeOf } from './trees';
import { bandOf, brushAt, pointerAt, roomOf, scaleFor, tall, radiusAt, type View } from './hand';
import { PAPER, drawBark, drawGhosts, drawGuide, drawTip, paper } from './draw';
import { colourOf, densityOf, FIRE } from './palette';
import { Wash } from './wash';
import { drawHabit, type Box, type Scene } from './habit';
import { drawPlate, recordOf } from './plate';
import { forgetTree, keepPlate, keepTree, plates, recallTree, snapshotTree, treeFrom, type KeptTree } from './save';

const $ = (id: string) => document.getElementById(id)!;
const TAU = Math.PI * 2;
const ASKED = new URLSearchParams(location.search);
const T = treeOf(ASKED.get('tree'));
const wanted = Number(ASKED.get('seed'));
const RULES = { ...T.rules };
function remembered(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function remember(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* not remembered */ } }

// ---------------------------------------------------------------- the tree
let seed = wanted || 1 + Math.floor(Math.random() * 1e6);
let tree = new TreeSim(seed, RULES);

// ---------------------------------------------------------------- the page
const canvas = $('slice') as HTMLCanvasElement, g = canvas.getContext('2d')!;
const frame = $('frame') as HTMLCanvasElement, fg = frame.getContext('2d')!;
/** The ghosts of the rings laid, kept aside and drawn again only when a ring is laid or the slice is rescaled. */
const cache = document.createElement('canvas'), cg = cache.getContext('2d')!;
let paperSheet: HTMLCanvasElement | null = null;
const wash = new Wash(240);
/** The scale the wash was painted at (it's drawn scaled to the slice's scale now, and resampled when a stroke begins). */
let washS = 0;
let W = 1, H = 1, px = 1;
function fit(): void {
  px = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(innerWidth * px)); H = Math.max(1, Math.round(innerHeight * px));
  for (const c of [canvas, frame, cache]) { c.width = W; c.height = H; }
  paperSheet = paper(W, H, px);
  scale = 0; dirty = true;
  const r = roomOf(W, H, px, !!ending);
  wash.place(r.cx, r.cy, r.room * 1.05);
  washS = 0;
  if (ending) drawEndFrame();
}
addEventListener('resize', fit);

/** The scale (device px a mm), eased between strokes so a new ring doesn't jump the slice. */
let scale = 0;
function view(): View {
  const r = roomOf(W, H, px, !!ending);
  if (!scale) scale = scaleFor(tree, r.room, px);
  return { cx: r.cx, cy: r.cy, s: scale, turn: 0, px };
}
/** Where the habit drawing sits: under the slice on a tall screen, else in the lower right corner. */
function habitBox(): Box {
  if (tall(W, H)) {
    const w = Math.min(W - 40 * px, 300 * px), h = Math.min(150 * px, w * 0.55);
    return { x: (W - w) / 2, y: H - h - 22 * px, w, h };
  }
  const w = Math.min(260 * px, W * 0.24), h = w * 0.72;
  return { x: W - w - 22 * px, y: H - h - 22 * px, w, h };
}

// ---------------------------------------------------------------- the ghosts
let dirty = true, cacheView: View | null = null, cacheUpto = -1, cacheStrength = 0;
/** How strong a laid ring's ghost is, live: what the wash fades to. */
const GHOST = 0.26;
const clock = () => performance.now() / 1000;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
function renderCache(v: View, upto = tree.rings.length, strength = GHOST): void {
  cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.clearRect(0, 0, W, H);
  drawGhosts(cg, tree, v, strength, upto);
  cacheView = { ...v }; cacheUpto = upto; cacheStrength = strength;
  dirty = false;
}

// ---------------------------------------------------------------- the year's turn
/**
 * One stroke is a ring (five years). Ready: the brush waits. Painting: the finger is down (or lifted,
 * waiting to carry on). Drying: the wet stroke settles into its ring. Beat: autumn to winter to spring
 * in the habit drawing, and what comes next arrives there.
 */
type Phase = 'ready' | 'painting' | 'drying' | 'beat';
let phase: Phase = 'ready', phaseAt = 0;
const DRYING = 0.7, BEAT = 0.7, CARRY_ON = 1.6;
function enter(p: Phase): void { phase = p; phaseAt = clock(); }
/** The view and band frozen for the stroke (and its drying), so the brush's frame never moves under the finger. */
let strokeView: View | null = null, strokeBand = 1;
/** The bark the stroke is painted against, and which of its points have been put into the wash. */
const barkBefore = new Float32Array(K);
const laid = new Uint8Array(K);
/** Where the bead of paint waits: where the last stroke ended (the north, at first). */
let restAngle = Math.PI / 2;
/** The wet stroke being drawn in to its true ring: how far it's to go, and how far it has. */
let settling: { k: number; done: number } | null = null;

/** The paint the brush lays at point i: its colour by how far round, its weather, paler as the brush empties. */
function layPoint(i: number, v: View, band: number): void {
  const st = tree.state[i];
  if (!st || laid[i]) return;
  laid[i] = 1;
  const w = tree.weatherNow, bark = barkBefore[i] * v.s;
  const c = colourOf(tree.at[i], w, tree.ring), strength = (st === 2 ? 0.4 : 0.42 + 0.45 * Math.min(1, tree.inkAt[i] * 1.6)) * (w === DROUGHT ? 0.85 : 1);
  const water = w === RAIN ? 1 : w === DROUGHT ? 0.55 : w === FROST ? 0.7 : 0.85;
  wash.deposit(i, bark + tree.lo[i] * band, bark + tree.hi[i] * band, densityOf(c, strength), water);
}
function layNew(): void { if (strokeView) for (let i = 0; i < K; i++) layPoint(i, strokeView, strokeBand); }

// ---------------------------------------------------------------- the hand
let painter: number | null = null;
const now = (e: PointerEvent) => (e.timeStamp > 0 ? e.timeStamp / 1000 : clock());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  document.body.classList.add('touching');
  if (ending) { if (lapsed() > 1.2 && !ending.plate) ending.skip = true; return; }
  if (painter !== null || !playing()) return;
  // Lifted mid-stroke: a touch near where it left off carries it on.
  if (phase === 'painting' && tree.waiting && strokeView) {
    const b = brushAt(tree, strokeView, strokeBand, e.clientX * px, e.clientY * px);
    // (The bark is still the old one while the stroke's unfinished: the brush is measured from it.)
    if (Math.abs(b.u) < 5 && tree.begin(now(e), b.a, b.u)) { painter = e.pointerId; feel(4); }
    return;
  }
  if (phase !== 'ready') return;
  // A touch near the bark takes up the brush (within a few bands of it, either side).
  const v = view(), band = bandOf(tree, v), b = brushAt(tree, v, band, e.clientX * px, e.clientY * px);
  if (b.u < -2.5 || b.u > 4.5) return;
  // (The wash follows the slice's new scale before the new paint goes on.)
  if (washS) wash.rescale(v.s / washS);
  washS = v.s;
  strokeView = v; strokeBand = band;
  for (let i = 0; i < K; i++) barkBefore[i] = tree.inner(i);
  laid.fill(0);
  if (tree.begin(now(e), b.a, b.u)) { painter = e.pointerId; enter('painting'); feel(6); }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== painter || !strokeView) return;
  // (Every point the hand passed through, not only those a frame shows: a stroke is its whole path.)
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const b = brushAt(tree, strokeView, strokeBand, c.clientX * px, c.clientY * px);
    tree.move(now(c), b.a, b.u);
  }
  layNew();
  hear();
});
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => {
  document.body.classList.remove('touching');
  if (e.pointerId === painter) { painter = null; tree.lift(now(e)); if (!tree.stroke && phase === 'painting') enter('ready'); hear(); }
});

// ---------------------------------------------------------------- the first lines, one idea at a time
/** A first line: when it's ready, what it says, when it's done; and whether the ghost finger shows it. */
type Cue = { ready: () => boolean; say: string; done: (since: number) => boolean; hand?: boolean };
let cue = 0, cueShown = false, cueSince = 0, firstLift = -1;
const COMPUTER = matchMedia('(hover: hover) and (pointer: fine)').matches;
const CUES = (): Cue[] => [
  { ready: () => true, hand: true, say: `${COMPUTER ? 'Drag the mouse' : 'Paint with a finger'} round the slice, along the bark, in one stroke`, done: () => tree.ring >= 1 },
  { ready: () => tree.ring >= 1, say: 'Slow lays wide wood, quick a thin line', done: () => tree.ring >= 3 },
  { ready: () => firstLift >= 0, say: 'Touch where you stopped to carry on, or leave it: the water closes the ring', done: (s) => s > 5 && phase === 'ready' },
  { ready: () => tree.ring >= 6, say: 'Nothing can go wrong. Let the tree rest whenever you like', done: (s) => s > 7 },
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
  const t = (clock() % 3.4) / 3.4, a = Math.PI / 2 + t * TAU, p = pointerAt(tree, v, bandOf(tree, v), a, 0.4);
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
    layNew();
    dirty = true;
    enter('drying');
    const i = tree.rings.length - 1;
    restAngle = tree.starts[i] + tree.dirs[i] * TAU;
    // The wide wet stroke settles into its true ring as it dries.
    settling = { k: Math.min(1, (tree.laidW * strokeView!.s) / strokeBand), done: 1 };
    if (NATIVE && clock() - lastTickAt > 0.3) { lastTickAt = clock(); tap({ strength: 0.22, sharpness: 0.7 }); }
    if (NATIVE) rumble(0);
    save();
  }
  if (n.kind === 'fire') {
    // A fire on the slope: vermilion blooms just outside the bark on the uphill side, wet, to run
    // into the next stroke.
    fireAt = clock();
    const v = strokeView ?? view();
    for (let k = 0; k < 7; k++) {
      const a = (n.angle ?? Math.PI) + (k - 3) * 0.09, r = radiusAt((i) => tree.inner(i), a) * v.s + (0.6 + 0.8 * Math.random()) * strokeBand;
      wash.drop(v.cx + r * Math.cos(a), v.cy - r * Math.sin(a), (6 + 8 * Math.random()) * px, densityOf(FIRE, 0.55), 1);
    }
    feel([20, 60, 20]);
  }
}

// ---------------------------------------------------------------- the card
let begun = false, kept: KeptTree | null = null;
function card(): void {
  const b = $('begin');
  (b.querySelector('.numeral') as HTMLElement).textContent = T.numeral;
  (b.querySelector('.name') as HTMLElement).textContent = T.name;
  (b.querySelector('.latin') as HTMLElement).textContent = T.latin;
  (b.querySelector('.mood') as HTMLElement).textContent = T.mood;
  (b.querySelector('.fact') as HTMLElement).textContent = T.fact;
  (b.querySelector('.todo') as HTMLElement).textContent = T.todo;
  (b.querySelector('.aims .first') as HTMLElement).textContent = T.calm;
  (b.querySelector('.aims .second') as HTMLElement).textContent = T.rest;
  const last = remembered(`annulus.last.${T.id}`);
  (b.querySelector('.best') as HTMLElement).textContent = last ? `your last oak: ${last} years` : '';
  const goingOn = begun ? tree : kept;
  (b.querySelector('.touch .what') as HTMLElement).textContent = goingOn ? 'Go on' : 'Begin';
  (b.querySelector('.touch small') as HTMLElement).textContent = goingOn ? `year ${begun ? tree.year : (kept!.sim.rings as unknown[]).length * tree.k.yearsPerRing}` : '';
  for (const row of b.querySelectorAll<HTMLElement>('.row')) {
    const on = remembered('volcano.haptics') === 'off' ? 'off' : 'on';
    for (const o of row.querySelectorAll<HTMLElement>('button')) o.classList.toggle('on', o.dataset.v === on);
  }
  $('corner').textContent = T.numeral;
  $('stage-name').textContent = T.name;
}
$('begin').querySelector('.touch')!.addEventListener('click', () => {
  if (!begun && kept) {
    const t = treeFrom(kept, RULES);
    if (t) { tree = t; seed = kept.seed; scale = 0; dirty = true; }
  }
  if (!begun) {
    begun = true;
    cueList = CUES();
    // (Each lesson is taught until a tree's been let rest once: then not again.)
    if (remembered('annulus.learned') === '1') cueList = cueList.slice(2);
  }
  $('begin').classList.add('gone');
  document.body.classList.remove('carding');
  canvas.classList.add('shown');
  paused = false;
});
$('begin').querySelector('.foot')!.addEventListener('click', (e) => {
  const to = (e.target as HTMLElement).closest('button')?.dataset.foot;
  if (to === 'xylo') void openXylo();
  if (to === 'settings') { const s = $('begin').querySelector('.settings') as HTMLElement; s.hidden = !s.hidden; }
});
$('begin').querySelector('.settings')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button'), row = b?.closest<HTMLElement>('.row')?.dataset.row, val = b?.dataset.v;
  if (!row || !val) return;
  if (row === 'haptics') remember('volcano.haptics', val);
  card();
});
let paused = true;
$('corner').addEventListener('click', () => {
  if (!playing()) return;
  if (tree.stroke) { painter = null; tree.finish(); hear(); }
  paused = true; save();
  card();
  $('begin').classList.remove('gone');
  document.body.classList.add('carding');
});
$('finish').addEventListener('click', () => { if (playing() && phase !== 'painting') { tree.fall(); hear(); } });
const playing = () => begun && !paused && !ending;

// ---------------------------------------------------------------- keeping it
function save(): void {
  if (!begun || ending || tree.over) return;
  void keepTree({ tree: T.id, seed, wander: false, turn: 0, sim: snapshotTree(tree) });
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

// ---------------------------------------------------------------- the end: the whole life again, then the plate
/** The time-lapse: about twenty seconds, the rings washing out from the pith as the little tree grows, then it falls. */
const LAPSE = 18, FALLING = 2.5;
let ending: { at: number; plate?: HTMLCanvasElement; skip?: boolean } | null = null;
function end(): void {
  ending = { at: clock() };
  painter = null; ghostOn = false; hush();
  document.body.classList.add('ended');
  rumble(0);
  feel([10, 80, 30]);
  remember(`annulus.last.${T.id}`, String(tree.year));
  remember('annulus.learned', '1');
  void forgetTree();
  scale = 0; dirty = true;
}
const lapsed = () => (ending ? (ending.skip ? LAPSE + FALLING + 1 : clock() - ending.at) : 0);
function drawEndFrame(): void {
  fg.setTransform(1, 0, 0, 1, 0, 0);
  fg.clearRect(0, 0, W, H);
  if (!ending || !ending.plate) return;
  const k = smooth((lapsed() - LAPSE - FALLING - 0.3) / 1.5);
  fg.globalAlpha = k;
  fg.strokeStyle = 'rgba(92,70,52,0.8)';
  const m = 14 * px;
  fg.lineWidth = 1.2 * px; fg.strokeRect(m, m, W - 2 * m, H - 2 * m);
  fg.lineWidth = 0.6 * px; fg.strokeRect(m + 6 * px, m + 6 * px, W - 2 * m - 12 * px, H - 2 * m - 12 * px);
  const rec = recordOf(tree, T), serif = '"Newsreader", "Iowan Old Style", Georgia, serif', y = H - 190 * px;
  fg.textAlign = 'center'; fg.fillStyle = '#2e2118';
  fg.font = `italic ${22 * px}px ${serif}`; fg.fillText(T.latin, W / 2, y);
  fg.font = `${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(`${T.name}, ${tree.year} years`, W / 2, y + 24 * px);
  fg.globalAlpha = k * 0.85;
  const lines: string[] = [];
  for (const n of rec.notes) { const l = lines.length ? `${lines[lines.length - 1]}  ·  ${n}` : n; if (lines.length && fg.measureText(l).width < W - 60 * px) lines[lines.length - 1] = l; else lines.push(n); }
  lines.forEach((l, i) => fg.fillText(l, W / 2, y + (50 + 18 * i) * px));
  fg.font = `italic ${13 * px}px ${serif}`; fg.globalAlpha = k * 0.75;
  fg.fillText(rec.fate, W / 2, y + (58 + 18 * lines.length) * px);
  fg.globalAlpha = 1;
}
function keepThePlate(): void {
  if (!ending || ending.plate) return;
  const big = drawPlate(tree, T), small = document.createElement('canvas');
  ending.plate = big;
  small.width = 480; small.height = Math.round((480 * big.height) / big.width);
  { const sg = small.getContext('2d')!; sg.imageSmoothingQuality = 'high'; sg.drawImage(big, 0, 0, small.width, small.height); }
  void keepPlate({ tree: T.id, numeral: T.numeral, title: T.name, subtitle: recordOf(tree, T).subtitle, when: Date.now(), image: small.toDataURL('image/jpeg', 0.86), years: tree.year, evenness: Math.round(100 * tree.evenness) });
}
$('endlinks').addEventListener('click', (e) => {
  const to = (e.target as HTMLElement).closest('button')?.dataset.end;
  if (to === 'keep' && ending?.plate) void keepImage(ending.plate, `well-rounded-${T.id}-${tree.year}`);
  if (to === 'again') { const q = new URLSearchParams(location.search); q.delete('seed'); q.delete('grow'); location.search = q.toString(); }
  if (to === 'xylo') void openXylo();
});

// ---------------------------------------------------------------- the xylotheque
async function openXylo(): Promise<void> {
  const box = $('xylo'), list = box.querySelector('.pages')!, img = box.querySelector('.view img') as HTMLImageElement;
  list.replaceChildren();
  const all = (await plates()).slice().reverse();
  if (!all.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No slices yet: each tree is kept here as a plate when it rests.'; list.appendChild(p); }
  for (const p of all) {
    const f = document.createElement('figure'), im = document.createElement('img'), cap = document.createElement('figcaption'), sm = document.createElement('small');
    im.src = p.image; im.alt = p.subtitle;
    cap.textContent = `${p.numeral}. ${p.title}`;
    sm.textContent = `${p.years} years`;
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
  $('goal').textContent = `Year ${tree.year}`;
  $('finish').classList.toggle('shown', playing() && tree.ring >= 3 && phase !== 'painting');
}
/** How the wet paint is weathering now: how fast it dries, and the wind's drift on it. */
function weathering(): { evaporate: number; vx: number; vy: number } {
  // (While painting, this ring's weather; after, the ring just laid's, as its paint dries.)
  const n = phase === 'painting' ? tree.ring : Math.max(0, tree.ring - 1), w = tree.weatherOf(n);
  const wind = w === WIND ? 55 * px : 0, a = tree.windOf(n);
  return { evaporate: w === RAIN ? 0.13 : w === DROUGHT ? 0.55 : w === FROST ? 0.38 : 0.24, vx: Math.cos(a) * wind, vy: -Math.sin(a) * wind };
}
let last = performance.now(), renderedAt = 0;
function frameStep(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (playing()) {
    // Lifted and left: the water closes the ring.
    if (phase === 'painting' && tree.waiting && painter === null && clock() - liftedAt() > CARRY_ON) { tree.finish(); layNew(); hear(); }
    if (phase === 'painting' && tree.waiting && firstLift < 0) firstLift = tree.ring;
    if (phase === 'drying' && settling) {
      // (Drawn in over the drying, a little at a time.)
      const f = smooth((clock() - phaseAt) / DRYING), want = settling.k ** f, by = want / settling.done;
      if (by < 0.995 && strokeView) { const v = strokeView; wash.compress((a) => radiusAt(barkBefore, a) * v.s, by); settling.done = want; }
    }
    if (phase === 'drying' && clock() - phaseAt > DRYING) { settling = null; enter('beat'); }
    if (phase === 'beat' && clock() - phaseAt > BEAT) { enter('ready'); strokeView = null; }
    // The brush nearly empty: a softer, grainier texture in the hand than a ring's tick.
    if (NATIVE) rumble(phase === 'painting' && painter !== null && tree.inkLeft < 0.2 ? 0.1 : 0, 0.08);
    hear();
    cues();
    goal();
    if (tree.over) end();
  }
  wash.step(dt, weathering(), ending ? 2 : 26);
  if (ending) {
    if (lapsed() > LAPSE + FALLING && !ending.plate) keepThePlate();
    if (lapsed() > LAPSE + FALLING + 1.5) $('endlinks').classList.add('shown');
    drawEndFrame();
  }
  // The slice grows into its room between strokes.
  if (phase !== 'painting' && phase !== 'drying') scale += (scaleFor(tree, roomOf(W, H, px, !!ending).room, px) - scale) * Math.min(1, dt * 3);
  draw(t);
  requestAnimationFrame(frameStep);
}
/** When the finger last lifted mid-stroke (seconds, on the pointer events' clock, which is the page's). */
function liftedAt(): number { return tree.stroke && tree.stroke.lifted >= 0 ? tree.stroke.lifted : Infinity; }

/** The scene in the habit drawing now: the season by where the year is, the weather now and coming. */
function sceneNow(): Scene {
  const r = tree.ring, next1 = tree.weatherOf(r + 1), next2 = tree.weatherOf(r + 2);
  const since = clock() - phaseAt;
  const season = phase === 'painting' ? 0.12 + 0.42 * tree.progress
    : phase === 'drying' ? 0.54 + 0.08 * Math.min(1, since / DRYING)
    : phase === 'beat' ? 0.62 + 0.5 * Math.min(1, since / BEAT)
    : 0.12;
  const coming: Weather = next1 || next2, gather = next1 ? 0.6 + 0.4 * (phase === 'painting' ? tree.progress : phase === 'ready' ? 0 : 1) : next2 ? 0.3 : 0;
  const fireComing = tree.fireBefore(r + 1) ? 0.6 + 0.4 * tree.progress : tree.fireBefore(r + 2) ? 0.3 : 0;
  const burning = Math.max(0, 1 - Math.max(0, clock() - fireAt - 2.5) / 3);
  return {
    age: tree.year + (phase === 'painting' ? tree.progress * tree.k.yearsPerRing : 0), season, weather: tree.weatherNow, now: 1, coming, gather, fire: burning, fireComing,
    wind: Math.cos(tree.windOf(tree.weatherNow === WIND ? r : r + 1)), time: clock(), fallen: 0, water: true, seed: tree.seed, px,
  };
}
/** The scene in the time-lapse: the life played back; and at the end, the fall. */
function sceneLapse(f: number, ring: number): Scene {
  const i = Math.min(tree.ringWeather.length - 1, Math.max(0, ring));
  const w = (tree.ringWeather[i] ?? 0) as Weather, fire = tree.scars.some((s) => Math.abs(s.ring - f * tree.rings.length) < 0.8) ? 1 : 0;
  const t = lapsed();
  return {
    age: f * tree.year, season: 0.15 + 0.5 * (((f * tree.rings.length) / 4) % 1), weather: w, now: 1, coming: 0, gather: 0, fire, fireComing: 0,
    wind: Math.cos(tree.windOf(i)), time: clock(), fallen: smooth((t - LAPSE) / FALLING) ** 2, water: true, seed: tree.seed, px,
  };
}

function draw(t: number): void {
  const v = view();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (paperSheet) g.drawImage(paperSheet, 0, 0); else { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }
  if (ending) { drawEnding(v); return; }
  const wet = phase === 'painting' || phase === 'drying';
  const sv = wet && strokeView ? strokeView : v;
  if (!cacheView || cacheUpto !== tree.rings.length || dirty || Math.abs(cacheView.s / sv.s - 1) > 0.01) renderCache(sv);
  g.save();
  g.translate(sv.cx, sv.cy); g.scale(sv.s / cacheView!.s, sv.s / cacheView!.s); g.translate(-cacheView!.cx, -cacheView!.cy);
  g.drawImage(cache, 0, 0);
  g.restore();
  // The live wash, drawn at the slice's scale now (it's resampled to it when the next stroke begins).
  if (t - renderedAt > (wash.wet ? 0 : 120)) { wash.render(); renderedAt = t; }
  g.save();
  const k = washS ? sv.s / washS : 1;
  g.translate(wash.cx, wash.cy); g.scale(k, k); g.translate(-wash.cx, -wash.cy);
  wash.draw(g);
  g.restore();
  const band = wet ? strokeBand : bandOf(tree, v);
  drawBark(g, tree, sv, tree.rings.length, phase === 'painting' ? 0.35 : 1);
  if (playing()) {
    drawGuide(g, tree, sv, band, phase === 'ready' ? 1 : phase === 'painting' ? 0.45 : 0);
    const tip = tree.tip;
    if (phase === 'painting' && tip && strokeView) {
      const r = radiusAt(barkBefore, tip.a) * sv.s + (tip.u + tip.h) * band;
      drawTip(g, sv.cx + r * Math.cos(tip.a), sv.cy - r * Math.sin(tip.a), tree.inkLeft, colourOf(tree.progress, tree.weatherNow, tree.ring), sv, band);
    }
    if (phase === 'ready') { const p = pointerAt(tree, sv, band, restAngle, 0.5), pulse = 0.85 + 0.15 * Math.sin(clock() * 2); drawTip(g, p.x, p.y, pulse, colourOf(0, tree.weatherNow, tree.ring), sv, band); }
  }
  drawHabit(g, habitBox(), sceneNow());
  placeGhost(sv);
}

function drawEnding(v: View): void {
  const t = lapsed(), n = tree.rings.length, f = Math.min(1, t / LAPSE), upto = Math.min(n, Math.ceil(f * n));
  // All the life's colour comes back as it plays: each ring washes in at full strength.
  if (!cacheView || cacheUpto !== upto || dirty || cacheStrength !== 0.85 || Math.abs(cacheView.s - v.s) > 1e-6) renderCache(v, upto, 0.85);
  g.drawImage(cache, 0, 0);
  wash.render();
  g.save(); const k = washS ? v.s / washS : 1; g.translate(wash.cx, wash.cy); g.scale(k, k); g.translate(-wash.cx, -wash.cy); wash.draw(g); g.restore();
  drawBark(g, tree, v, upto);
  if (!ending!.plate) drawHabit(g, habitBox(), sceneLapse(f, upto - 1));
}

// ---------------------------------------------------------------- begin
/**
 * (For trying it: ?grow=N grows the tree N years first, painted evenly by a steady hand in the tree's
 * own terms, so the slice can be seen grown without painting it. Its rings are ghosts already.)
 */
function growFirst(years: number): void {
  let time = 0;
  while (tree.year < years && !tree.over) {
    const steady = TAU / tree.strokeSeconds, start = Math.random() * TAU;
    let a = start;
    tree.begin(time, a, 0);
    while (tree.stroke) {
      const left = tree.inkLeft * tree.capacity, rest = Math.max(0.05, 1 - (a - start) / TAU), want = Math.max(0.3, (left / rest) * 0.96);
      a += (steady * (1 + tree.k.sun * Math.cos(a - tree.k.sunAngle))) / want / 60; time += 1 / 60;
      const push = tree.weatherNow === WIND ? -tree.k.wind * Math.cos(a - tree.windOf()) : 0;
      tree.move(time, a % TAU, push);
    }
    time += 1;
  }
  tree.news.length = 0;
}
// (?debug: the tree and the view, for a headless browser to paint with, as hand.ts paints.)
if (ASKED.has('debug')) Object.assign(window, { annulus: { get tree() { return tree; }, get view() { return view(); }, get phase() { return phase; }, get band() { return bandOf(tree, view()); }, wash } });
fit();
card();
void (async () => {
  const grow = Number(ASKED.get('grow'));
  if (grow > 0) growFirst(grow);
  else if (!wanted) {
    const k = await recallTree();
    if (k && k.tree === T.id && k.sim && Array.isArray(k.sim.ringWeather) && !('alive' in k.sim)) { kept = k; card(); }
  }
  requestAnimationFrame(frameStep);
})();
