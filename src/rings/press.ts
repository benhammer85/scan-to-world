/**
 * Well Rounded, the daily practice: the site's and the app's front page (the first game is rings.html,
 * published as classic.html). A ring a day, kept, so the slice becomes a diary of your days, read from
 * the heart outward (touch a ring for its day). Silent; nothing to learn.
 *
 * A painting made to look like wood: a watercolour study of a slice on good paper, lit from the upper
 * left. Each ring is painted in oak's straw and honey (its day's season only a tint), pale earlywood and
 * a fine umber line of latewood, inside a painted bark edge.
 *
 *   draw      a circle round the slice, at your own pace, as wide or close as you like, with a brush of
 *             the wood's own umber watercolour, a little way in from the fingertip (so the finger never
 *             hides the line): glossy and dark where it's wet, paling as it dries into the paper
 *   bloom     as the ring closes, its colour spreads from your line in toward the last ring, like water
 *             touching wet paint, while the slice draws back slowly to make room; the next ring can be
 *             begun at once
 *
 * The challenge (challenge.html, the same drawing): ten rings a run on a new tree, each as close to the
 * last as you dare, and quick, scored for both; each touch on the last ring's edge costs 30 and leaves a knot in the wood.
 * Nothing eased toward round, nothing kept in the diary; the best score is kept (`annulus.challenge`).
 *
 * On opening, the slice paints itself in from the heart. Each ring is eased a little toward round (the
 * way a tree evens out), so the slice stays organic, never a lump. `?demo` shows a year already drawn.
 */
import '../volcano/fonts.css';
import { NATIVE, tap } from '../volcano/native';
import { K, OAK, TreeSim } from './tree';
import { brushAt, radiusAt, scaleFor, unwarpR, warpFor, warpR, type View, type Warp } from './hand';
import { at, drawPaper } from './draw';
import { Paper } from './paint';
import { holdStill, steadySize } from './steady';
import { keepRun, keepTree, recallTree, runs, snapshotTree, treeFrom, type Run } from './save';

const TAU = Math.PI * 2, PAPER = '#f4efe4';
/**
 * The relief print, after tree-ring prints (the wood inked and pressed): the slice's look.
 * `?ink=water` shows the watercolour instead.
 */
const PRINT = new URLSearchParams(location.search).get('ink') !== 'water';
const canvas = document.getElementById('press') as HTMLCanvasElement;
// (The drawing goes to the page, or for a moment to a picture of the slice: see `picture`.)
let g = canvas.getContext('2d')!;
const words = document.getElementById('words')!;
let W = 1, H = 1, px = 1;
function fit(): void {
  // (Laid out again only when the size really changes: not as Safari's toolbar comes and goes.)
  const { w, h } = steadySize(), p = Math.min(3, window.devicePixelRatio || 1);
  if (Math.round(w * p) === W && Math.round(h * p) === H) return;
  px = p; W = Math.round(w * px); H = Math.round(h * px);
  canvas.width = W; canvas.height = H; canvas.style.height = `${h}px`; view = null;
}
holdStill(canvas);
addEventListener('resize', fit);
const clock = () => performance.now() / 1000;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the tree, a ring a day
// One ring is one year of the tree's, and one day of yours: the tree is kept between visits, and each
// ring remembers the day it was drawn. Draw one a day, or as many as you like; a day missed is no matter.
// The wood a ring holds is a fifth of the game's five-year ring, and the crown is grown in a few rings
// (so the first days aren't hairlines); the tree never grows old.
// No line to keep to and no wood to run out of: wherever the circle is drawn, round the slice, is the
// year's edge (a loose, wide circle a wide year; a close one, a narrow year).
/** The challenge (challenge.html) rather than the daily practice. */
const CHALLENGE = document.body.dataset.mode === 'challenge';
// The tree starts from a small heart (2 mm: a 6 mm one was a third of a young slice), and each ring's edge is
// smoothed over a wider arc (12°), so a hand's wobble becomes a gentle swell, as real rings are.
const DAILY = { yearsPerRing: 1, crown: OAK.crown / 5, crownYears: 6, oldFrom: 1e6, oldTo: 2e6, ink: 1e6, pith: 2, smooth: (12 * Math.PI) / 180 };
/** The widest year (steady widths): a circle drawn at the screen's edge stops at this. */
const WIDEST = 6;
/**
 * The brush is a little way in from the fingertip, toward the heart (CSS px): the finger rests just
 * outside the line, so the line, the bark and the gap between them are all in sight while drawing.
 */
const REACH = 30;
/** Where the brush is for a finger at (x, y) (device px). */
function brushPoint(v: View, x: number, y: number): [number, number] {
  const dx = x - v.cx, dy = y - v.cy, d = Math.hypot(dx, dy) || 1, k = Math.max(0, d - REACH * px) / d;
  return [v.cx + dx * k, v.cy + dy * k];
}
/** How far each ring is eased toward round (a tree evens out its lumps over the years). */
const ROUND = CHALLENGE ? 0 : 0.3;
/** Where the finger puts the line (steady widths from the bark), eased a little toward round. */
function rounded(a: number, u: number): number {
  return Math.min(WIDEST, u) * lean(a) + ROUND * (tree.radius - radiusAt((i) => tree.inner(i), a)) / tree.wRef;
}
/**
 * A tree grows a little more on one side (toward the light, or downhill), year after year, so its heart
 * comes to sit off the middle: each ring a sixth wider on that side and as much narrower on the other.
 * The side is the tree's own (from its seed). Not in the challenge, where the line is exactly yours.
 */
const ECCENTRIC = CHALLENGE ? 0 : 0.16;
function lean(a: number): number {
  const side = (Math.sin(tree.seed * 12.9898) * 43758.5453) % 1 * TAU;
  return 1 + ECCENTRIC * Math.cos(a - side);
}
const DIARY = 'diary', params = new URLSearchParams(location.search);
/**
 * The kind of tree, which decides how its wood prints (a tree keeps its kind; `?tree=pine` or `?tree=birch`
 * plants that kind when a tree is begun):
 *   oak    ring-porous: each year opens with a row of large pores; broad rays and fine; a thick fissured bark
 *   pine   a conifer: no pores; each year's latewood a crisp dark band, with resin canals in it as dark dots;
 *          no rays to see; a thick bark in plates
 *   birch  diffuse-porous: fine pores scattered evenly through the year, each year marked only by a thin
 *          line; a thin, pale, papery bark
 */
type Kind = 'oak' | 'pine' | 'birch';
const KINDS: Kind[] = ['oak', 'pine', 'birch'];
const asKind = (k: unknown): Kind | null => (KINDS.includes(k as Kind) ? (k as Kind) : null);
let kind: Kind = asKind(params.get('tree')) ?? 'oak';
let tree = new TreeSim(Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e6), DAILY);
/** The day each ring was drawn (local, as 2026-10-11). */
let days: string[] = [];
const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysDrawn = () => new Set(days).size;

const paper = new Paper(512);
// (The season's colour stays, half settled into the wood: green and gold to rust and violet, in oak.)
paper.turn = 0.5;
// (A gentle dark drying rim, as watercolour has; each ring's wash reaches under the last ring's line, so
// the rim it leaves there pools into that line rather than making a second one.)
paper.wash.edgeFlow = 1.3;
// Each year grown across its ring, as wood is (pale spring wood, a dark band of late summer's), in the
// colour of its day's season: spring green, summer gold, autumn rust, winter violet (northern seasons).
paper.across = (ring) => {
  const [y, m, d] = (days[ring] ?? dayOf()).split('-').map(Number);
  const doy = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5;
  return (((doy - 59) % 365) + 365) % 365 / 365;
};
let warp: Warp = warpFor(tree), view: View | null = null;

/** A year already drawn, by a hand that's calm some days and loose on others (for `?demo`; not kept). */
function demoYear(): void {
  let time = 0, rnd = tree.seed;
  const r = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const start = new Date(); start.setDate(start.getDate() - 365);
  for (let n = 0; n < 365; n++) {
    if (r() < 0.12) continue; // (some days missed)
    const day = new Date(start); day.setDate(start.getDate() + n);
    const width = 0.6 + 1.6 * r() ** 1.5, wob = 0.15 + 0.5 * r(), ph = r() * TAU;
    // (A person draws a round circle about the slice, at the day's distance, not the bark's shape again.)
    const R = (b: number) => tree.radius + width * tree.wRef * lean(b), u = (b: number) => Math.max(0.1, (R(b) - radiusAt((i) => tree.inner(i), b)) / tree.wRef + wob * Math.sin(2 * b + ph));
    let a = r() * TAU;
    tree.begin(time, a, u(a));
    while (tree.stroke) { a += TAU / 5 / 60; time += 1 / 60; tree.move(time, a % TAU, u(a % TAU)); }
    days.push(dayOf(day)); time += 2;
  }
  tree.news.length = 0;
}

/** The kept tree, if there is one (`?fresh` begins another). */
async function recall(): Promise<void> {
  if (CHALLENGE) return;
  if (params.has('demo')) { demoYear(); return; }
  if (params.has('fresh')) return;
  const k = await recallTree(DIARY), t = k && treeFrom(k, DAILY);
  if (!k || !t) return;
  tree = t; days = (k.days ?? []).slice(0, t.rings.length); kind = asKind(k.tree) ?? 'oak';
  while (days.length < t.rings.length) days.unshift(days[0] ?? dayOf());
}
function keep(): void {
  if (params.has('demo') || CHALLENGE) return;
  void keepTree({ tree: kind, seed: tree.seed, wander: false, turn: 0, sim: snapshotTree(tree), days: days.slice() }, DIARY);
}

/**
 * The slice on the screen. After each ring it draws back slowly to make room for the next (`ease`, over a
 * few seconds, from where the new bark was drawn to where it fits), never in a jump; a touch while it's
 * drawing back stops it where it is.
 */
let ease: { from: number; at: number } | null = null;
const EASE = 3;
function baseNow(t = clock()): View {
  if (!view) {
    // (A little above the middle, with room round it: a study on a sheet, in reach of the thumb. The bark
    // fills at least three-quarters of the room, however close the rings were drawn.)
    const room = Math.max(40 * px, Math.min(W / 2 - 34 * px, H * 0.27)), cy = Math.round(H * 0.47);
    let s = scaleFor(tree, room, px, warp);
    if (tree.rings.length) s = Math.max(s, (0.74 * room) / warpR(warp, tree.radius));
    view = { cx: W / 2, cy, s, turn: 0, px, warp };
    ease = null;
  }
  if (!ease) return view;
  const k = smooth((t - ease.at) / EASE);
  if (k >= 1) { ease = null; return view; }
  return { ...view, s: ease.from + (view.s - ease.from) * k };
}
/**
 * Looking closer: two fingers pinch the slice larger (up to three times) about where they are; one finger
 * then moves it about; a double tap goes back. While it's looked at closely, nothing is drawn.
 */
let look = { k: 1, ox: 0, oy: 0 }, lookBack: { k: number; ox: number; oy: number; at: number } | null = null;
const closer = () => look.k > 1.01;
function viewNow(t = clock()): View {
  const v = baseNow(t);
  if (lookBack) {
    const p = smooth((t - lookBack.at) / 0.45);
    look = { k: lookBack.k + (1 - lookBack.k) * p, ox: lookBack.ox * (1 - p), oy: lookBack.oy * (1 - p) };
    if (p >= 1) { lookBack = null; look = { k: 1, ox: 0, oy: 0 }; }
  }
  if (look.k === 1 && !look.ox && !look.oy) return v;
  return { ...v, s: v.s * look.k, cx: v.cx + look.ox, cy: v.cy + look.oy };
}
/** Zoom by f about the point (x, y) (device px). */
function zoomAbout(x: number, y: number, f: number): void {
  const v = viewNow(), k = Math.max(1, Math.min(3, look.k * f)), g2 = k / look.k, b = baseNow();
  const cx = x + (v.cx - x) * g2, cy = y + (v.cy - y) * g2;
  look = k <= 1.001 ? { k: 1, ox: 0, oy: 0 } : { k, ox: cx - b.cx, oy: cy - b.cy };
  lookBack = null;
  if (closer() && !hintedCloser) { hintedCloser = true; say('Double-tap to zoom out.', 3); }
}
let hintedCloser = false;
/** The ring closed: the slice laid out for the tree as it is now, eased to from where it was. */
function makeRoom(): void {
  const was = baseNow(), old = warp, bark = tree.radius;
  warp = warpFor(tree); paper.fit(warp, warp.R); view = null;
  const v = baseNow();
  // (Where the new bark was drawn, it stays at first: the slice then draws back from there.)
  const from = was.s * warpR(old, bark) / Math.max(1e-6, warpR(warp, bark));
  ease = { from: Math.min(from, 3 * v.s), at: clock() };
}
/** A touch: the slice stops drawing back, where it is. */
function holdView(): void {
  if (!ease) return;
  view = baseNow(); ease = null;
}

// ---------------------------------------------------------------- your runs
/** The runs page (challenge only): every run kept, best first, each a picture of its slice and its score. */
const runsEl = document.getElementById('runs');
const dateOf = (when: number) => new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
async function openRuns(): Promise<void> {
  if (!runsEl) return;
  keepTheRun();
  const all = (await runs()).slice().sort((a, b) => b.score - a.score || b.when - a.when);
  const grid = runsEl.querySelector('.grid')!;
  grid.replaceChildren();
  runsEl.querySelector('.none')?.toggleAttribute('hidden', all.length > 0);
  all.forEach((r: Run, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    const img = new Image(); img.src = r.image; img.alt = `The slice of a run: ${r.score} points`;
    const score = document.createElement('b'); score.textContent = r.score.toLocaleString();
    const meta = document.createElement('small'); meta.textContent = `${i === 0 ? 'Best · ' : ''}${dateOf(r.when)}`;
    card.append(img, score, meta);
    card.addEventListener('click', () => showRun(r));
    grid.append(card);
  });
  runsEl.classList.add('open');
}
function showRun(r: Run): void {
  const big = runsEl?.querySelector<HTMLElement>('.big');
  if (!big) return;
  big.querySelector('img')!.src = r.image;
  big.querySelector('b')!.textContent = `${r.score.toLocaleString()} points`;
  big.querySelector('small')!.textContent = `${r.rings} rings · ${dateOf(r.when)}`;
  big.classList.add('open');
}
runsEl?.querySelector('.close')?.addEventListener('click', () => runsEl.classList.remove('open'));
runsEl?.querySelector('.big')?.addEventListener('click', (e) => (e.currentTarget as HTMLElement).classList.remove('open'));
document.getElementById('open-runs')?.addEventListener('click', (e) => { e.preventDefault(); void openRuns(); });

// ---------------------------------------------------------------- the turn of a ring
// ---------------------------------------------------------------- the challenge
const scoreEl = document.getElementById('score');
/** Rings in a run; and what a touch on the last ring's edge costs. */
const RUN = 10, TOUCH = 30;
/**
 * The run: its points and rings, whether it's done; and this ring's: closeness (CSS px outside the last
 * ring's edge, summed), when it began, its touches, whether the brush is over the edge now, and whether
 * it has yet been outside it (touches count only once it has: a finger set down near the edge, its brush
 * a little way in, hasn't touched anything).
 */
let run = { score: 0, rings: 0, over: false, gapSum: 0, gapN: 0, began: 0, touches: 0, inside: false, out: false };
/** Where the brush has touched an edge this run (a tree angle and radius, so they stay on the slice). */
let marks: { a: number; r: number; at: number }[] = [];
/** When the run ended. */
let endedAt = 0;
const bestOf = () => { try { return Number(localStorage.getItem('annulus.challenge')) || 0; } catch { return 0; } };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
function showScore(): void {
  if (!scoreEl) return;
  const best = bestOf();
  scoreEl.textContent = run.rings || run.score ? `Ring ${Math.min(RUN, run.rings + 1)} of ${RUN} · ${plural(run.score, 'point', 'points')}` : best ? `Best: ${best.toLocaleString()}` : '';
}
/**
 * A ring's points: closeness (1 on the edge, a half at 5 px off, a sixth at 25; over the edge counts as
 * 10 px off, so hugging inside never pays) times pace (2 for a ring in 2 s or less, 1 at 4 s, a half at
 * 8), out of 200; less 30 a touch, never below nothing.
 */
function ringPoints(): number {
  const gap = run.gapN ? run.gapSum / run.gapN : 30, secs = Math.max(0.5, clock() - run.began);
  return Math.max(0, Math.round(100 * (1 / (1 + gap / 5)) * Math.min(2, 4 / secs)) - TOUCH * run.touches);
}
/** The brush went over the last ring's edge: it costs, and leaves a knot there. */
function touchEdge(a: number): void {
  run.touches++;
  marks.push({ a, r: radiusAt((i) => tree.inner(i), a), at: clock() });
  if (NATIVE) tap({ strength: 0.6, sharpness: 0.5 });
}
/**
 * A picture of the slice as it is (a square, JPEG): drawn afresh off the page, centred and whole, so
 * however it's being looked at, the picture is the same.
 */
function picture(n = 640): string {
  const off = document.createElement('canvas'); off.width = off.height = n;
  const c = off.getContext('2d')!, was = { g, px };
  let rmax = tree.k.pith;
  const last = tree.rings[tree.rings.length - 1];
  if (last) for (let i = 0; i < K; i++) rmax = Math.max(rmax, last[i]);
  // (True to scale, as a plate is: no fisheye.)
  const v: View = PRINT ? { cx: n / 2, cy: n / 2, s: (n * 0.4) / rmax, turn: 0, px: 2 } : { cx: n / 2, cy: n / 2, s: (n * 0.4) / warpR(warp, rmax), turn: 0, px: 2, warp };
  g = c; px = 2;
  try {
    c.fillStyle = PAPER; c.fillRect(0, 0, n, n);
    if (PRINT) {
      // (On a layer of its own, so the grain thins the ink to the paper beneath, not to nothing.)
      const lay = document.createElement('canvas'); lay.width = lay.height = n;
      g = lay.getContext('2d')!; drawPrint(v); inkGrain(lay, v); g = c; c.drawImage(lay, 0, 0);
    } else { paper.draw(c, v); drawLatewood(v); drawBark(v); }
    drawKnots(v, Infinity); drawPaper(c, n, n);
  } finally { g = was.g; px = was.px; }
  return off.toDataURL('image/jpeg', 0.86);
}
/** The run just ended, to be kept with its picture (once its last ring has bloomed). */
let toKeep: { score: number; rings: number; when: number } | null = null;
function keepTheRun(): void {
  if (!toKeep) return;
  const r = toKeep; toKeep = null;
  void keepRun({ ...r, image: picture() });
}
/** Ten rings drawn: the run's points, and the best. */
function endRun(): void {
  run.over = true; endedAt = clock();
  let best = bestOf();
  const isBest = run.score > best;
  if (isBest) { best = run.score; try { localStorage.setItem('annulus.challenge', String(best)); } catch { /* not kept */ } }
  toKeep = { score: run.score, rings: run.rings, when: Date.now() };
  window.setTimeout(keepTheRun, 1500);
  window.setTimeout(() => {
    words.classList.add('over');
    say(`Score: ${run.score.toLocaleString()}. ${isBest ? 'New best!' : `Best: ${best.toLocaleString()}.`} Tap to play again.`, 1e5);
    if (scoreEl) scoreEl.textContent = '';
  }, 1400);
}
/** A new run: a new seedling, a clean sheet. */
function restart(): void {
  keepTheRun();
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY);
  days = []; trail = []; marks = []; settle = { ring: -1, at: 0 };
  run = { score: 0, rings: 0, over: false, gapSum: 0, gapN: 0, began: 0, touches: 0, inside: false, out: false };
  warp = warpFor(tree); paper.fit(warp, warp.R); paper.bake(tree); view = null; ease = null;
  openedAt = clock();
  words.classList.remove('over', 'shown');
  showScore();
}

/** The ring just closed, blooming (a look only: the next can be begun at once). */
let settle = { ring: -1, at: 0 };
/** The brush's track: where, when, how wide it laid (slow is wide), and how fast. */
let trail: { a: number; r: number; t: number; w: number; fast: number }[] = [];
let strokeView: View | null = null, painter: number | null = null;
/** The finger's own path this stroke (CSS px): where it began, how far it has gone, and where it is. */
let loop = { x0: 0, y0: 0, x: 0, y: 0, len: 0, closed: false };

function say(text: string, fade = 10): void {
  // (Nothing to read while the hand is drawing.)
  if (painter !== null) return;
  words.textContent = text; words.classList.add('shown');
  clearTimeout(sayT); sayT = window.setTimeout(() => words.classList.remove('shown'), fade * 1000);
}
let sayT = 0;

// Between the practice and the challenge: a line of two words at the foot, away while drawing.
const nav = document.getElementById('nav');
// (On the dev server the practice is press.html; published, it's the index.)
if (import.meta.env.DEV) nav?.querySelector<HTMLAnchorElement>('a[data-page="practice"]')?.setAttribute('href', './press.html');
// (In the watercolour, the other page opens in the watercolour too.)
if (!PRINT) nav?.querySelectorAll<HTMLAnchorElement>('a[data-page]').forEach((a) => { a.href += `${a.href.includes('?') ? '&' : '?'}ink=water`; });
let navT = 0;
function navAway(away: boolean): void {
  clearTimeout(navT);
  if (away) nav?.classList.add('away');
  else navT = window.setTimeout(() => nav?.classList.remove('away'), 1500);
}

/** The fingers down (device px), a pinch in progress, and the touch that might be a tap. */
const fingers = new Map<number, { x: number; y: number }>();
let pinch: { d: number; mx: number; my: number } | null = null, pinched = false;
let tapStart = { x: 0, y: 0, at: 0 }, lastTap = 0;
const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  fingers.set(e.pointerId, { x: e.clientX * px, y: e.clientY * px });
  if (fingers.size === 1) { tapStart = { x: e.clientX, y: e.clientY, at: clock() }; pinched = false; }
  if (fingers.size === 2) {
    // A second finger: a pinch, not a ring (the line begun is let go).
    if (painter !== null) { tree.cancel(); trail = []; painter = null; }
    holdView(); pinch = spread(); pinched = true;
    return;
  }
  if (fingers.size > 2 || painter !== null) return;
  navAway(true);
  // (Looked at closely, or the run over: a finger moves the slice about, or taps; nothing is drawn.)
  if (closer() || run.over) return;
  words.classList.remove('shown');
  const x = e.clientX * px, y = e.clientY * px;
  holdView();
  const v = viewNow();
  if (tree.stroke && tree.resting) {
    // Taken up where it rested; or, touched anywhere else, the circle begins again from there.
    const sv = strokeView ?? v, b = brushAt(tree, sv, 0, ...brushPoint(sv, x, y));
    if (tree.begin(e.timeStamp / 1000, b.a, rounded(b.a, b.u))) { painter = e.pointerId; trailAt(b.a, b.u); return; }
    tree.cancel(); trail = [];
  }
  // Inside the slice, a ring's day is read; anywhere outside it, the circle begins (the brush a little
  // way in from the finger).
  if (brushAt(tree, v, 0, x, y).u < 0) { if (!CHALLENGE) readDay(shownOf(v), x, y); return; }
  const b = brushAt(tree, v, 0, ...brushPoint(v, x, y));
  strokeView = v;
  if (tree.begin(e.timeStamp / 1000, b.a, rounded(b.a, b.u))) {
    painter = e.pointerId; paper.begin(tree); trailAt(b.a, b.u);
    run.gapSum = 0; run.gapN = 0; run.began = clock(); run.touches = 0; run.inside = false; run.out = false;
    loop = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, len: 0, closed: false };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const f = fingers.get(e.pointerId);
  if (f) {
    const x = e.clientX * px, y = e.clientY * px, dx = x - f.x, dy = y - f.y;
    f.x = x; f.y = y;
    if (pinch && fingers.size >= 2) {
      const now = spread();
      // (Only a deliberate pinch: two fingers resting, or brushing the glass, look no closer.)
      if (!closer() && Math.abs(now.d - pinch.d) < 14 * px) return;
      zoomAbout(pinch.mx, pinch.my, now.d / pinch.d);
      look.ox += now.mx - pinch.mx; look.oy += now.my - pinch.my;
      pinch = now;
      return;
    }
    if (closer() && painter === null && fingers.size === 1) { look.ox += dx; look.oy += dy; return; }
  }
  if (e.pointerId !== painter || !strokeView) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const bp = brushPoint(strokeView, c.clientX * px, c.clientY * px), b = brushAt(tree, strokeView, 0, ...bp);
    if (CHALLENGE) {
      // How far the brush is outside the last ring's edge, on the screen: below nothing, it's over it.
      const sv = strokeView, edge = sv.s * warpR(sv.warp, radiusAt((i) => tree.inner(i), b.a));
      const gap = (Math.hypot(bp[0] - sv.cx, bp[1] - sv.cy) - edge) / px - barkCss(sv);
      if (gap >= 1) run.out = true;
      if (gap < 0 && run.out) { if (!run.inside) touchEdge(b.a); run.inside = true; }
      else if (gap >= 0) run.inside = false;
      if (run.out) { run.gapSum += gap < 0 ? 10 : gap; run.gapN++; }
    }
    tree.move(c.timeStamp / 1000, b.a, rounded(b.a, b.u));
    trailAt(b.a, b.u);
    if (!tree.stroke) break;
    // The finger come back round to where it began: the circle is drawn, whatever the angle says.
    loop.len += Math.hypot(c.clientX - loop.x, c.clientY - loop.y); loop.x = c.clientX; loop.y = c.clientY;
    if (loop.len > 160 && Math.hypot(loop.x - loop.x0, loop.y - loop.y0) < Math.max(28, loop.len / 16)) {
      loop.closed = true;
      if (tree.finish(CHALLENGE ? 0.9 : 0.5)) break;
    }
  }
  hear();
});
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => {
  fingers.delete(e.pointerId);
  if (fingers.size < 2) pinch = null;
  navAway(false);
  // A tap (short, still, one finger): a double tap goes back from looking closer; after a run, a tap
  // begins another.
  const tap = type === 'pointerup' && !pinched && fingers.size === 0 && clock() - tapStart.at < 0.3 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 12;
  if (tap) {
    const t = clock();
    if (closer() && t - lastTap < 0.35) { lookBack = { ...look, at: t }; lastTap = 0; return; }
    lastTap = t;
    if (run.over && !closer() && t - endedAt > 1.8) { restart(); return; }
  }
  if (e.pointerId !== painter) return;
  painter = null;
  // Let go most of the way round, the ring is closed for you; earlier, the line rests, to be taken up.
  if (tree.finish(CHALLENGE ? 0.95 : 0.8)) hear();
  // (A whole loop drawn, but not round the slice: let go, and said where, once the hand is off.)
  else if (loop.closed && tree.stroke) { tree.cancel(); say('Draw around the circle.', 4); }
  else { tree.lift(); restAt = clock(); }
});
// (On a computer, the wheel looks closer about the pointer.)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (painter !== null) return;
  holdView(); zoomAbout(e.clientX * px, e.clientY * px, Math.exp(-e.deltaY * 0.002));
}, { passive: false });
/** When the line was let go to rest (a line left resting a while fades away: no stray marks). */
let restAt = 0;

/** A touch inside the slice: the ring under it, lit for a moment, and the day it was drawn. */
let lit = -1, litAt = 0;
function readDay(v: View, x: number, y: number): void {
  const dx = x - v.cx, dy = v.cy - y, a = (((Math.atan2(dy, dx) - v.turn) % TAU) + TAU) % TAU;
  const r = unwarpR(v.warp, Math.hypot(dx, dy) / v.s);
  const i = tree.rings.findIndex((ring) => r <= radiusAt(ring, a));
  if (i < 0 || !days[i]) return;
  const [yy, mm, dd] = days[i].split('-').map(Number);
  say(new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 3);
  lit = i; litAt = clock();
}

/** The paint, laid exactly where the brush is (angle a, u steady widths from the bark). */
function trailAt(a: number, u: number): void {
  if (!strokeView) return;
  const t = clock(), last = trail[trail.length - 1], joined = last && Math.abs(last.a - a) < 0.5;
  const r = radiusAt((i) => tree.inner(i), a) + Math.max(0, Math.min(WIDEST, u)) * tree.wRef;
  // Speed on the screen, in CSS px a second, eased so the width swells and thins smoothly.
  let fast = last ? last.fast : 0;
  if (joined) {
    const [x0, y0] = at(strokeView, last.a, last.r), [x1, y1] = at(strokeView, a, r);
    const v = Math.hypot(x1 - x0, y1 - y0) / px / Math.max(0.008, t - last.t);
    fast += (Math.min(1, v / 600) - fast) * 0.25;
  }
  // A brush: full and wet when unhurried, thin and dry when quick, tapering in as it touches down.
  const n = joined ? trail.length : 0;
  const w = (3.5 + 4.5 * (1 - fast)) * Math.min(1, 0.3 + n / 8);
  trail.push({ a, r, t, w: joined && n ? last.w + (w - last.w) * 0.35 : w * 0.4, fast });
}
function hear(): void {
  for (const n of tree.news) if (n.kind === 'ring') {
    paper.paint(tree); paper.close(tree);
    // The day's ring, kept; the first of the day is counted, quietly, once it has settled.
    const today = dayOf(), first = !days.includes(today);
    days.push(today); keep();
    if (CHALLENGE) {
      const pts = ringPoints(), touches = run.touches;
      run.score += pts; run.rings++; showScore();
      window.setTimeout(() => say(`+${pts}${touches ? `  (touched the edge: −${TOUCH * touches})` : ''}`, 1.4), 150);
      if (run.rings >= RUN) endRun();
    } else if (first) editionAt = clock() + 1.6;
    // (The ring is done: it settles into the paper and the slice draws back to make room, while the
    // next can be begun as soon as the finger comes down again.)
    painter = null;
    settle = { ring: tree.rings.length - 1, at: clock() };
    makeRoom();
  }
  tree.news.length = 0;
}

// ---------------------------------------------------------------- drawing
/** The sheet: warm paper, lit from the upper left, a little shadowed toward the foot (made once a size). */
let ground: HTMLCanvasElement | null = null;
function groundOf(): HTMLCanvasElement {
  if (ground && ground.width === W && ground.height === H) return ground;
  ground = document.createElement('canvas'); ground.width = W; ground.height = H;
  const c = ground.getContext('2d')!;
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  const light = c.createRadialGradient(W * 0.2, H * 0.12, 0, W * 0.2, H * 0.12, Math.hypot(W, H));
  light.addColorStop(0, 'rgba(255,253,246,0.55)'); light.addColorStop(0.5, 'rgba(255,253,246,0)');
  light.addColorStop(1, 'rgba(120,96,70,0.10)');
  c.fillStyle = light; c.fillRect(0, 0, W, H);
  return ground;
}

/** A closed path round a ring (or the heart, ring -1), r(a) given; `dr(a)` CSS px out from it. */
function ringPath(v: View, r: (a: number) => number, dr: number | ((a: number) => number) = 0, n = K): void {
  g.beginPath();
  for (let j = 0; j <= n; j++) {
    const a = (j / n) * TAU, rr = v.s * warpR(v.warp, r(a)) + (typeof dr === 'number' ? dr : dr(a)) * px, t = a + v.turn;
    const x = v.cx + rr * Math.cos(t), y = v.cy - rr * Math.sin(t);
    if (j) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}
/** A ring's mean radius (the heart's, ring -1). */
function meanR(i: number): number {
  if (i < 0) return tree.k.pith;
  const r = tree.rings[i];
  let m = 0;
  for (let j = 0; j < K; j += 8) m += r[j];
  return m / Math.ceil(K / 8);
}
const barkOf = (i: number) => (a: number) => (i < 0 ? tree.k.pith : radiusAt(tree.rings[i], a));

/** The paper laid back over an annulus (inside r0, outside r1): paint not yet there, at `alpha`. */
function hideBetween(v: View, r0: (a: number) => number, r1: (a: number) => number, alpha = 1): void {
  g.save();
  g.beginPath();
  for (let j = 0; j <= K; j++) { const a = (j / K) * TAU, rr = v.s * warpR(v.warp, r1(a)), t = a + v.turn; const x = v.cx + rr * Math.cos(t), y = v.cy - rr * Math.sin(t); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K; j >= 0; j--) { const a = (j / K) * TAU, rr = Math.max(0, v.s * warpR(v.warp, r0(a))), t = a + v.turn; g.lineTo(v.cx + rr * Math.cos(t), v.cy - rr * Math.sin(t)); }
  g.closePath(); g.clip();
  g.globalAlpha = alpha; g.drawImage(groundOf(), 0, 0);
  g.restore();
}

/**
 * Each ring's edge: one fine line of the wood's umber, painted with a rigger, fainter as the ring is finer
 * on the screen (look closer, and it's there); hairline rings are left to the wash's tone.
 * It's the line the brush left, dried into the wood.
 */
function drawLatewood(v: View): void {
  const n = tree.rings.length;
  g.lineJoin = 'round';
  for (let i = 0; i < n - 1; i++) {
    const w = v.s * (warpR(v.warp, meanR(i)) - warpR(v.warp, meanR(i - 1))) / px;
    const k = Math.max(0, Math.min(1, (w - 1.1) / 3.5));
    if (k <= 0) continue;
    ringPath(v, barkOf(i));
    g.strokeStyle = `rgba(104,66,40,${(0.28 * k).toFixed(3)})`; g.lineWidth = 0.85 * px; g.setLineDash([]); g.stroke();
    // (Over it, the brush's pressure: a fuller stroke, broken irregularly, so the line swells and thins
    // along its length as a hand-painted one does, differently each year.)
    g.setLineDash(DASH.map((d) => d * px)); g.lineDashOffset = (i * 37.7) % 60 * px;
    g.strokeStyle = `rgba(96,60,36,${(0.11 * k).toFixed(3)})`; g.lineWidth = 1.8 * px; g.stroke();
  }
  g.setLineDash([]);
}
/** The swell and thinning of a painted line (CSS px: stroke, gap, ...). */
const DASH = [26, 2, 11, 1, 34, 3, 15, 2, 8, 1];

/** The bark: a painted edge, a little uneven, darker inside a softer band. */
function drawBark(v: View): void {
  const i = tree.rings.length - 1, r = barkOf(i);
  if (i < 0) {
    // (Before the first ring, the heart of the seedling: something to draw round.)
    ringPath(v, r); g.fillStyle = 'rgba(214,182,140,0.45)'; g.fill();
  }
  // (Its unevenness on the screen, a fraction of a CSS pixel: a painted line, not a ruled one.)
  const wob = (a: number) => 0.35 * Math.sin(7 * a + 1.3) + 0.25 * Math.sin(13 * a + 0.4);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(96,64,42,0.28)'; g.lineWidth = 3.2 * px; ringPath(v, r, (a) => 0.8 + wob(a), K * 2); g.stroke();
  g.strokeStyle = 'rgba(58,38,26,0.78)'; g.lineWidth = 1.15 * px; ringPath(v, r, wob, K * 2); g.stroke();
}


/**
 * The brush's line: the wood's own umber, as watercolour: a soft, translucent stroke, deepest down its
 * middle, wide when unhurried, thin when quick, tapering in. Wet, it's glossy and dark; as
 * it dries it pales and thins, sinking into the paper (where the ring's own edge is painted once it
 * closes). Each piece is drawn edge to edge with the next, so the translucent paint never doubles.
 */
function drawBrush(g: CanvasRenderingContext2D, v: View, t: number): void {
  const n = trail.length;
  if (n < 2) return;
  const pts = trail.map((q) => { const [x, y] = at(v, q.a, q.r); return { x, y, life: Math.exp(-(t - q.t) / 3.5), q, nx: 0, ny: 0, hw: 0 }; });
  const lap = (i: number) => Math.abs(trail[i].a - trail[i - 1].a) > 0.5;
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 && !lap(i) ? i - 1 : i], b = pts[i + 1 < n && !lap(i + 1) ? i + 1 : i];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, p = pts[i];
    p.nx = -dy / l; p.ny = dx / l; p.hw = 0.5 * p.q.w * (0.55 + 0.45 * p.life) * px;
  }
  const quad = (p: typeof pts[0], q: typeof pts[0], k0: number, k1: number) => {
    g.beginPath();
    g.moveTo(p.x + p.nx * k1 * p.hw, p.y + p.ny * k1 * p.hw); g.lineTo(q.x + q.nx * k1 * q.hw, q.y + q.ny * k1 * q.hw);
    g.lineTo(q.x + q.nx * k0 * q.hw, q.y + q.ny * k0 * q.hw); g.lineTo(p.x + p.nx * k0 * p.hw, p.y + p.ny * k0 * p.hw);
    g.closePath(); g.fill();
  };
  for (let i = 1; i < n; i++) {
    const p = pts[i - 1], q = pts[i], life = q.life;
    if (life < 0.02 || lap(i)) continue;
    const wet = life * life;
    // A soft stroke, its paint deepest down the middle and thinning to its edges, a little uneven along
    // its length, as a loaded brush lays it; a faint bleed beyond while it's wet.
    const tone = 0.85 + 0.15 * Math.sin(i * 0.37 + q.q.a * 3);
    g.fillStyle = `rgba(140,96,62,${(0.1 * wet).toFixed(3)})`; quad(p, q, 1, 1.4); quad(p, q, -1.4, -1);
    if (PRINT) {
      // (Printing ink, not watercolour: dense and dark while wet, breaking up dry as it fades.)
      if (life < 0.75 && h1(i * 0.613) > life + 0.25) continue;
      g.fillStyle = ink(0.55 * life + 0.3 * wet); quad(p, q, -1, 1);
      g.fillStyle = ink(0.3 * wet); quad(p, q, -0.6, 0.6);
      continue;
    }
    g.fillStyle = `rgba(112,70,42,${(0.3 * life * tone).toFixed(3)})`; quad(p, q, -1, 1);
    g.fillStyle = `rgba(92,56,32,${(0.3 * life * tone + 0.2 * wet).toFixed(3)})`; quad(p, q, -0.5, 0.5);
  }
}

/** Where the brush has touched an edge this run: a small knot in the wood, kept on the slice. */
function drawKnots(v: View, t: number): void {
  for (const m of marks) {
    const [mx, my] = at(v, m.a, m.r), k = smooth((t - m.at) / 0.8), tang = -(m.a + v.turn) + Math.PI / 2;
    g.save();
    g.translate(mx, my); g.rotate(tang); g.scale(1, 0.5);
    if (PRINT) {
      // A knot as a print shows one: a dark eye, the grain parting and swirling round it in rings.
      const r = (2.2 + 1.8 * k) * px;
      for (const [f, fill] of [[3.1, ink(0.85 * k)], [2.5, 'rgba(244,239,228,1)'], [1.9, ink(0.8 * k)], [1.35, 'rgba(244,239,228,1)'], [0.95, ink(0.95 * k)]] as [number, string][]) {
        g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, r * f, r * f * 0.82, 0, 0, TAU); g.fill();
      }
      g.restore();
      continue;
    }
    const r = (2.5 + 2.5 * k) * px;
    const bloom = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.9);
    bloom.addColorStop(0, 'rgba(250,244,230,0)'); bloom.addColorStop(0.6, `rgba(250,244,230,${(0.14 * k).toFixed(3)})`); bloom.addColorStop(1, 'rgba(250,244,230,0)');
    g.fillStyle = bloom; g.beginPath(); g.arc(0, 0, r * 1.9, 0, TAU); g.fill();
    const knot = g.createRadialGradient(0, 0, 0, 0, 0, r);
    knot.addColorStop(0, `rgba(80,50,30,${(0.5 * k).toFixed(3)})`); knot.addColorStop(0.5, `rgba(106,70,44,${(0.32 * k).toFixed(3)})`); knot.addColorStop(1, 'rgba(120,80,50,0)');
    g.fillStyle = knot; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.restore();
  }
}

// ---------------------------------------------------------------- the relief print (?ink=print)
/**
 * The slice as a relief print, as a slice of oak inked and pressed prints itself: each year's latewood
 * takes the ink (a band at the ring's outer edge), its springwood stays the paper; oak's rays cut every
 * band into short bricks, their white gaps running out from the heart; the bands' edges are ragged and
 * the ink a little starved here and there; the dense heart prints near solid; the bark is a heavy,
 * broken border. All of it drawn as shapes, so looking closer finds more, never blur.
 */
const INK = [36, 28, 23];
const ink = (a: number) => `rgba(${INK[0]},${INK[1]},${INK[2]},${a.toFixed(3)})`;
/** A steady hash, 0 to 1. */
const h1 = (x: number) => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
/** Oak's rays: each at its own angle, beginning at its own radius (mm) and running some way out. */
const PRINT_RAYS = Array.from({ length: 2400 }, (_, k) => {
  const from = 700 * h1(k * 1.7 + 9.1);
  return { a: h1(k + 0.5) * TAU, from, to: from + 15 + 260 * h1(k * 2.3 + 4.4) ** 2, k };
});

/** Oak's broad rays: few, long, nearly straight hairlines across many rings (the fine ones are the flecks). */
const BROAD = Array.from({ length: 400 }, (_, k) => {
  const from = 500 * h1(k * 3.3 + 1.9) ** 1.5;
  return { a: h1(k * 0.77 + 5.5) * TAU, from, to: from + 120 + 900 * h1(k * 1.9 + 2.2), k: 5000 + k };
});
/** The bark's thickness on the screen (CSS px): a twentieth of the slice's radius or so, 3 to 9 px. */
function barkCss(v: View): number {
  if (!PRINT || !tree.rings.length) return 0;
  const R = (v.s * warpR(v.warp, meanR(tree.rings.length - 1))) / px;
  return kind === 'birch' ? Math.max(1.6, Math.min(3.5, 0.02 * R)) : kind === 'pine' ? Math.max(3.5, Math.min(11, 0.055 * R)) : Math.max(3, Math.min(9, 0.045 * R));
}

function drawPrint(v: View): void {
  const n = tree.rings.length;
  const wPx = (i: number) => (v.s * (warpR(v.warp, meanR(i)) - warpR(v.warp, meanR(i - 1)))) / px;
  const scr = (r: number) => v.s * warpR(v.warp, r);
  // (A point at angle a, radius r (mm), and dr device px further out: roughness is on the screen, so the
  // fisheye never magnifies it into spikes.)
  const pt = (a: number, r: number, dr = 0): [number, number] => { const R = scr(r) + dr, t = a + v.turn; return [v.cx + R * Math.cos(t), v.cy - R * Math.sin(t)]; };
  // The heart: the seedling's first growth, printed as a ring is (an inked band at its edge, paper within),
  // and a dark dot at its very centre: a small dot when the tree is grown, never a black disc when it's young.
  {
    // (Never a ruled circle: its edges wander a little, as a seedling's first wood does, and its band
    // thickens and thins.)
    const hr = barkOf(-1), band = Math.min(0.4, (3 * px) / Math.max(1, scr(meanR(-1))));
    const wob = (a: number, k: number) => 1 + 0.03 * Math.sin(2 * a + k) + 0.018 * Math.sin(3 * a + 2.3 * k) + 0.006 * Math.sin(5 * a + k);
    g.beginPath();
    for (let j = 0; j <= K; j++) { const a = (j / K) * TAU, [x, y] = pt(a, hr(a) * wob(a, 1)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let j = K; j >= 0; j--) { const a = (j / K) * TAU, [x, y] = pt(a, hr(a) * (1 - Math.max(band, 0.18) * (1 + 6 * (wob(a, 4) - 1))) * wob(a, 1.3)); g.lineTo(x, y); }
    g.closePath(); g.fillStyle = ink(0.85); g.fill();
    g.beginPath(); g.arc(v.cx, v.cy, 1.6 * px, 0, TAU); g.fill();
  }
  if (!n) {
    // (Before the first ring: the heart, ringed, to draw round.)
    g.strokeStyle = ink(0.7); g.lineWidth = 1.2 * px; ringPath(v, barkOf(-1)); g.stroke();
    return;
  }
  // The rays in play: the ones begun inside the bark, as many as fit the screen (one about every 9 px
  // round the bark), the same ones from ring to ring.
  const Rb = meanR(n - 1), around = (TAU * scr(Rb)) / px;
  const begun = PRINT_RAYS.filter((r) => r.from < Rb && r.to > meanR(0));
  const rays = begun.slice(0, Math.max(6, Math.min(begun.length, Math.round(around / 4)))).sort((x, y) => x.a - y.a);
  // Rings too fine to print apart (anywhere: a seedling's first years are wide, the next fine) print as
  // single lines, as many as the screen can part. (Oak's rays break up the pattern of its fine rings; pine's
  // and birch's plain bands, squeezed under 3 px, shimmer into moiré, so theirs are a soft tone with faint
  // lines over it: strong lines, each a hand's wobble of its own, cross into a fingerprint.)
  // (Oak: only the fine heart before its first printable ring, since among fine rings its rays do the work.)
  const fineAt = kind === 'oak' ? 1.6 : 3;
  let heartEnd = 0;
  while (heartEnd < n - 1 && wPx(heartEnd) < fineAt) heartEnd++;
  const dense = Array.from({ length: n }, (_, i) => i < n - 1 && (kind === 'oak' ? i < heartEnd : wPx(i) < fineAt));
  for (let i = 0; i < n; i++) {
    if (!dense[i]) continue;
    let j = i;
    while (j + 1 < n && dense[j + 1]) j++;
    if (kind !== 'oak') {
      const r0 = barkOf(i - 1), r1 = barkOf(j);
      g.beginPath();
      for (let q = 0; q <= K; q++) { const a = (q / K) * TAU, [x, y] = pt(a, r1(a)); if (q) g.lineTo(x, y); else g.moveTo(x, y); }
      for (let q = K; q >= 0; q--) { const a = (q / K) * TAU, [x, y] = pt(a, r0(a)); g.lineTo(x, y); }
      g.closePath(); g.fillStyle = ink(kind === 'pine' ? 0.26 : 0.14); g.fill();
    }
    g.strokeStyle = ink(kind === 'birch' ? 0.38 : kind === 'pine' ? 0.7 : 0.8); g.lineWidth = (kind === 'pine' ? 1.1 : 0.8) * px;
    let lastR = scr(meanR(i - 1));
    for (let k = i; k <= j; k++) {
      const R = scr(meanR(k));
      if (R - lastR < (kind === 'oak' ? 1.9 : 2.4) * px) continue;
      lastR = R; ringPath(v, barkOf(k)); g.stroke();
    }
    i = j;
  }
  // The broad rays in play: one about every 26 px round the bark.
  const broad = BROAD.filter((r) => r.from < Rb && r.to > meanR(0)).slice(0, Math.max(4, Math.round(around / 26))).sort((x, y) => x.a - y.a);
  // The sapwood: once there's heartwood to tell it from (past 16 years), the last eight print a little paler.
  const sapFrom = n > 16 ? n - 8 : n;
  for (let i = 0; i < n; i++) {
    if (dense[i]) continue;
    const outer = barkOf(i), inner = barkOf(i - 1);
    // How much of the year takes the ink (its latewood): about half; never under a pixel.
    // (Pine's latewood is a crisp band of about a third; birch marks its year with only a thin line.)
    const w = wPx(i);
    const share = kind === 'birch' ? Math.min(0.5, Math.max(0.1, 1.5 / Math.max(1, w)))
      : kind === 'pine' ? Math.min(0.6, Math.max(0.3, 0.9 / Math.max(1, w) + 0.3))
      : Math.min(0.75, Math.max(0.45, 1.1 / Math.max(1, w) + 0.45));
    const bandIn = (a: number) => outer(a) - share * (outer(a) - inner(a));
    const tone = (i >= sapFrom ? 0.84 : 1) * (kind === 'birch' ? 0.78 : 1), fine = w < 6, mr = meanR(i);
    // The rays crossing this ring: the broad ones always (hairlines); among fine rings, the fine ones too
    // (oak's mosaic); never two closer than 5 px round it.
    const R = scr(mr), least = (5 * px) / Math.max(1, R);
    const pool = kind !== 'oak' ? [] : (fine ? [...broad, ...rays].sort((x, y) => x.a - y.a) : broad).filter((r) => r.from < mr && r.to > mr);
    const live: typeof pool = [];
    for (const r of pool) if (!live.length || r.a - live[live.length - 1].a > least) live.push(r);
    if (live.length > 1 && live[0].a + TAU - live[live.length - 1].a < least) live.pop();
    const gapOf = (r: typeof pool[0]) => ((r.k >= 5000 ? 0.65 : 0.9) * px) / Math.max(1, R);
    const rough = 0.28 * px;
    const brick = (a0: number, a1: number, seed: number) => {
      const steps = Math.max(2, Math.ceil(((a1 - a0) * R) / (4 * px)));
      g.beginPath();
      for (let j = 0; j <= steps; j++) {
        const a = a0 + ((a1 - a0) * j) / steps, jit = (h1(seed + j * 3.1) - 0.5) * rough * 2;
        const [x, y] = pt(a, outer(a), jit); if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      for (let j = steps; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / steps, jit = (h1(seed + j * 5.3 + 1.7) - 0.5) * rough * 2;
        const [x, y] = pt(a, bandIn(a), jit); g.lineTo(x, y);
      }
      g.closePath();
      // (The ink a little starved now and then.)
      g.fillStyle = ink((0.8 + 0.2 * h1(seed * 0.37)) * tone); g.fill();
    };
    if (live.length < 2) brick(0, TAU, i * 101);
    else for (let j = 0; j < live.length; j++) {
      // (A ray wavers a little from ring to ring, as the grain does.)
      const wav = (r: typeof pool[0]) => r.a + ((h1(r.k * 13.1 + i * 0.7) - 0.5) * 0.8 * px) / Math.max(1, R);
      const nx = j + 1 < live.length ? live[j + 1] : live[0];
      const a0 = wav(live[j]) + gapOf(live[j]), a1 = wav(nx) + (j + 1 < live.length ? 0 : TAU) - gapOf(nx);
      if (a1 > a0) brick(a0, a1, i * 1013 + live[j].k * 7);
    }
    // The fine rays, in a wide band: short pale flecks across it, a few px apart (oak's; the others' can't be seen).
    if (!fine && kind === 'oak') {
      const count = Math.round((TAU * R) / (16 * px));
      g.strokeStyle = 'rgba(244,239,228,0.38)'; g.lineWidth = 0.4 * px; g.lineCap = 'round'; g.beginPath();
      for (let q = 0; q < count; q++) {
        const a = h1(i * 7.7 + q * 1.31) * TAU, lo = bandIn(a), hi = outer(a), band = hi - lo, tilt = (h1(q * 5.9 + i) - 0.5) * 0.6 * px / Math.max(1, R);
        const r0 = lo + band * (0.15 + 0.5 * h1(q * 2.9 + i)), r1 = r0 + band * (0.12 + 0.3 * h1(q * 4.1 + i * 3));
        const [x0, y0] = pt(a, r0), [x1, y1] = pt(a + tilt, Math.min(hi, r1)); g.moveTo(x0, y0); g.lineTo(x1, y1);
      }
      g.stroke();
    }
    // The pores: oak begins each year with a row of large open vessels, a stipple of dots just inside the
    // year's start, in the springwood (two rows where it's wide).
    if (kind === 'birch') {
      // Birch: fine pores scattered evenly through the year, a light stipple across the springwood.
      const ew = (scr(bandIn(0)) - scr(inner(0))) / px;
      if (ew >= 2) {
        const count = Math.round((TAU * scr(mr) * ew) / (16 * px));
        g.fillStyle = ink(0.42 * tone); g.beginPath();
        for (let q = 0; q < count; q++) {
          const a = h1(i * 3.1 + q * 0.917) * TAU, r0 = scr(inner(a)), r1 = scr(bandIn(a));
          const at = r0 + (r1 - r0) * (0.12 + 0.76 * h1(q * 2.7 + i)), d = (0.3 + 0.35 * h1(q * 4.9 + i)) * px;
          const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
          g.moveTo(x + d, y); g.arc(x, y, d, 0, TAU);
        }
        g.fill();
      }
    } else if (kind === 'pine') {
      // Pine: resin canals, here and there in the latewood, as small dark dots ringed with paper.
      const lw = (scr(outer(0)) - scr(bandIn(0))) / px;
      if (lw >= 2.4) {
        const count = Math.round((TAU * scr(mr)) / (26 * px));
        for (let q = 0; q < count; q++) {
          const a = h1(i * 5.3 + q * 1.37) * TAU, r0 = scr(bandIn(a)), r1 = scr(outer(a));
          const at = r0 + (r1 - r0) * (0.25 + 0.5 * h1(q * 6.1 + i)), d = Math.min((r1 - r0) * 0.3, (0.8 + 0.5 * h1(q * 3.3 + i)) * px);
          const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
          g.fillStyle = 'rgba(244,239,228,0.9)'; g.beginPath(); g.arc(x, y, d * 1.7, 0, TAU); g.fill();
          g.fillStyle = ink(0.95 * tone); g.beginPath(); g.arc(x, y, d, 0, TAU); g.fill();
        }
      }
    } else {
      // Oak's pores: the large open vessels each year opens with didn't take the ink, so in the print
      // they're small, uneven holes along the inner edge of the year's band, crowding and thinning.
      const lw = (scr(outer(0)) - scr(bandIn(0))) / px;
      if (lw >= 2.2) {
        const count = Math.round((TAU * scr(meanR(i - 1))) / (2.6 * px));
        g.fillStyle = 'rgba(244,239,228,0.92)'; g.beginPath();
        for (let q = 0; q < count; q++) {
          if (h1(q * 0.37 + i * 1.7) < 0.28) continue;
          const a = ((q + h1(q * 3.7 + i)) / count) * TAU, r0 = scr(bandIn(a)), r1 = scr(outer(a));
          const at = r0 + (r1 - r0) * (0.04 + 0.16 * h1(q * 5.3 + i) ** 2), d = Math.min((r1 - r0) * 0.16, (0.35 + 0.7 * h1(q * 1.1 + i * 2) ** 2) * px);
          const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
          g.moveTo(x + d, y); g.ellipse(x, y, d, d * (0.6 + 0.5 * h1(q * 8.3)), -t, 0, TAU);
        }
        g.fill();
      }
    }
  }
  if (kind === 'birch') drawBirchBark(v, pt, scr(Rb));
  else {
  // The bark: a thick, rough band outside the wood, fissured, its inner edge (the living layer) a dark line
  // (pine's in plates: fewer, deeper splits, flatter between).
  const bark = barkOf(n - 1), T = barkCss(v) * px;
  const lumps = kind === 'pine' ? 70 : 140;
  const torn = (a: number) => { const u = (a / TAU) * lumps, i0 = Math.floor(u), f = u - i0, s2 = kind === 'pine' ? (f < 0.85 ? 0 : (f - 0.85) / 0.15) : f * f * (3 - 2 * f); return (1 - s2) * h1(i0 % lumps) + s2 * h1((i0 + 1) % lumps); };
  g.beginPath();
  for (let j = 0; j <= K * 3; j++) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a), T * (0.7 + 0.55 * torn(a))); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K * 3; j >= 0; j--) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a)); g.lineTo(x, y); }
  g.closePath(); g.fillStyle = ink(0.82); g.fill();
  // (Its fissures: short pale splits from the outside in.)
  {
    const pine = kind === 'pine', count = Math.round((TAU * scr(Rb)) / ((pine ? 13 : 6) * px));
    g.strokeStyle = 'rgba(244,239,228,0.85)'; g.lineWidth = (pine ? 1.1 : 0.8) * px; g.lineCap = 'round'; g.beginPath();
    for (let q = 0; q < count; q++) {
      const a = ((q + h1(q * 2.3)) / count) * TAU, out = T * (0.7 + 0.55 * torn(a));
      const [x0, y0] = pt(a, bark(a), out), [x1, y1] = pt(a + (h1(q * 7.9) - 0.5) * 0.02, bark(a), out * (pine ? 0.1 + 0.2 * h1(q * 4.4) : 0.25 + 0.4 * h1(q * 4.4)));
      g.moveTo(x0, y0); g.lineTo(x1, y1);
    }
    g.stroke();
  }
  g.strokeStyle = ink(0.95); g.lineWidth = 1 * px; ringPath(v, bark, 0, K * 2); g.stroke();
  }
  // The press: a hand-pulled print is never evenly pressed. The ink is a little paler toward one side
  // (where the press bore down less), and in a few broad, soft patches; only the ink is lightened.
  {
    const side = h1(tree.seed * 0.731) * TAU, Rs = scr(Rb) + barkCss(v) * px * 2, ox = Math.cos(side + v.turn), oy = -Math.sin(side + v.turn);
    g.save(); g.globalCompositeOperation = 'source-atop';
    const lin = g.createLinearGradient(v.cx - ox * Rs, v.cy - oy * Rs, v.cx + ox * Rs, v.cy + oy * Rs);
    lin.addColorStop(0, 'rgba(244,239,228,0)'); lin.addColorStop(0.55, 'rgba(244,239,228,0.04)'); lin.addColorStop(1, 'rgba(244,239,228,0.26)');
    g.fillStyle = lin; g.fillRect(v.cx - Rs, v.cy - Rs, 2 * Rs, 2 * Rs);
    for (let q = 0; q < 5; q++) {
      const a = h1(tree.seed + q * 3.3) * TAU, d = Rs * (0.2 + 0.6 * h1(q * 7.1 + tree.seed)), rr = Rs * (0.25 + 0.3 * h1(q * 2.9));
      const x = v.cx + d * Math.cos(a), y = v.cy - d * Math.sin(a), rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, `rgba(244,239,228,${(0.08 + 0.08 * h1(q * 5.5)).toFixed(3)})`); rad.addColorStop(1, 'rgba(244,239,228,0)');
      g.fillStyle = rad; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    g.restore();
  }
}

/** Birch's bark: thin, pale and papery, a fine dark line within it, flecked with short dark lenticels. */
function drawBirchBark(v: View, pt: (a: number, r: number, dr?: number) => [number, number], Rpx: number): void {
  const bark = barkOf(tree.rings.length - 1), T = barkCss(v) * px;
  g.beginPath();
  for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = pt(a, bark(a), T * (0.9 + 0.15 * Math.sin(31 * a))); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K * 2; j >= 0; j--) { const a = (j / (K * 2)) * TAU, [x, y] = pt(a, bark(a)); g.lineTo(x, y); }
  g.closePath(); g.fillStyle = ink(0.28); g.fill();
  g.strokeStyle = ink(0.85); g.lineWidth = 0.9 * px; ringPath(v, bark, 0, K * 2); g.stroke();
  g.strokeStyle = ink(0.6); g.lineWidth = 0.7 * px; ringPath(v, bark, T / px, K * 2); g.stroke();
  // (The lenticels: short dark dashes along it.)
  const count = Math.round((TAU * Rpx) / (9 * px));
  g.strokeStyle = ink(0.8); g.lineWidth = Math.max(0.7 * px, T * 0.35); g.lineCap = 'butt'; g.beginPath();
  for (let q = 0; q < count; q++) {
    const a = ((q + h1(q * 3.9)) / count) * TAU, len = (2 + 3 * h1(q * 1.7)) * px / Math.max(1, Rpx);
    const [x0, y0] = pt(a, bark(a), T * 0.5), [x1, y1] = pt(a + len, bark(a + len), T * 0.5);
    g.moveTo(x0, y0); g.lineTo(x1, y1);
  }
  g.stroke();
}

/** Value noise, 0 to 1, smooth, from a fixed 256-square of randoms. */
const NOISE = (() => { const a = new Float32Array(65536); let r = 20251; for (let i = 0; i < a.length; i++) { r = (r * 16807) % 2147483647; a[i] = r / 2147483647; } return a; })();
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const i0 = xi & 255, j0 = yi & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  const a = NOISE[j0 * 256 + i0], b = NOISE[j0 * 256 + i1], c = NOISE[j1 * 256 + i0], d = NOISE[j1 * 256 + i1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * The ink's grain: printed from wood, ink lies in the grain's fine streaks along each ring, heavier and
 * lighter, starved to the paper here and there, its edges breaking a little. Laid into the ink (dark
 * pixels only; paper-coloured marks left as they are) of a canvas `c` holding the slice drawn for view `v`.
 */
function inkGrain(c: HTMLCanvasElement, v: View): void {
  const n = tree.rings.length, last = n ? tree.rings[n - 1] : null;
  let rmax = tree.k.pith;
  if (last) for (let i = 0; i < K; i++) rmax = Math.max(rmax, last[i]);
  const R = v.s * warpR(v.warp, rmax) + (barkCss(v) * 1.6 + 6) * px;
  const x0 = Math.max(0, Math.floor(v.cx - R)), y0 = Math.max(0, Math.floor(v.cy - R));
  const w = Math.min(c.width, Math.ceil(v.cx + R)) - x0, h = Math.min(c.height, Math.ceil(v.cy + R)) - y0;
  if (w <= 0 || h <= 0) return;
  const ctx = c.getContext('2d')!, img = ctx.getImageData(x0, y0, w, h), d = img.data;
  const fine = 1 / (0.8 * px), along = 1 / (12 * px), speck = 1 / (0.8 * px), streak = 1 / (5 * px);
  for (let y = 0; y < h; y++) {
    const dy = y + y0 - v.cy;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, a = d[k + 3];
      if (a < 8 || d[k] + d[k + 1] + d[k + 2] > 380) continue;
      const dx = x + x0 - v.cx, r = Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dy, dx);
      // (Streaks along the ring: fine across it, long along it; across the seam at the left, blended.)
      const seam = Math.max(0, (Math.abs(th) - (Math.PI - 0.25)) / 0.25);
      const at = (t: number) => 0.55 * vnoise(r * fine, t * r * along) + 0.45 * vnoise(r * fine * 0.35 + 31.7, t * r * along * 0.25 + 7.1);
      let gr = at(th);
      if (seam > 0) gr += (at(th - Math.sign(th) * TAU) - gr) * seam * 0.5;
      // (Crisp, not smeared: the ink takes the grain or doesn't.)
      // (Mostly solid, as a pressed block prints; only fine dry streaks where the grain stands low.)
      const e = Math.min(1, Math.max(0, (gr - 0.6) / 0.16));
      let f = 1.08 - 0.5 * e * e * (3 - 2 * e);
      // (Here and there the ink starved: short pale streaks along the grain, never round dots.)
      const st = vnoise(r * speck + 91, th * r * streak + 13);
      if (st > 0.86) f *= 1 - 0.75 * Math.min(1, (st - 0.86) / 0.06);
      d[k + 3] = Math.max(0, Math.min(255, (a * f - 30) / 0.88));
    }
  }
  ctx.putImageData(img, x0, y0);
}

/** The print, kept as a picture between changes; while the slice moves, the picture moves with it. */
const printCaches: Record<string, { c: HTMLCanvasElement; key: string; v: View }> = {};
function drawPrintCached(v: View, moving: boolean, slot = 'drawing', alpha = 1): void {
  const key = `${tree.rings.length}|${v.warp?.R ?? 0}|${v.warp?.beta ?? 0}|${W}x${H}`;
  let pc = printCaches[slot];
  const same = pc && pc.key === key;
  const exact = same && pc.v.s === v.s && pc.v.cx === v.cx && pc.v.cy === v.cy;
  if (!same || (!moving && !exact)) {
    const c = pc?.c.width === W && pc.c.height === H ? pc.c : document.createElement('canvas');
    c.width = W; c.height = H;
    const was = g; g = c.getContext('2d')!;
    try { drawPrint(v); inkGrain(c, v); } finally { g = was; }
    pc = printCaches[slot] = { c, key, v: { ...v } };
  }
  const k = v.s / pc.v.s;
  g.globalAlpha = alpha;
  g.drawImage(pc.c, v.cx - pc.v.cx * k, v.cy - pc.v.cy * k, W * k, H * k);
  g.globalAlpha = 1;
}

/**
 * At rest, true to scale. While drawing, the slice's outer rings are magnified (a fisheye) to give the
 * newest ring room under the finger, which squeezes the old ones toward the heart; left a moment, the
 * slice settles into true scale, its years evenly spaced, the bark where it was; a touch brings the
 * magnifier back. (In the print; and in the challenge only once the run is over.)
 */
let relax = 0, idleSince = 0;
function restOf(v: View): View {
  if (!v.warp || v.warp.beta <= 0 || !tree.rings.length) return v;
  const Rb = meanR(tree.rings.length - 1);
  return { ...v, s: (v.s * warpR(v.warp, Rb)) / Rb, warp: undefined };
}
/** The slice as it's shown now: at rest (true scale) or drawing (magnified). */
const shownOf = (v: View) => (relax > 0.5 ? restOf(v) : v);

/**
 * The edition, pencilled under the print as a printmaker signs and numbers one: how many days drawn on
 * the left, the day's date in the middle, the tree on the right; beside it a blind stamp, a small ring
 * slice pressed into the paper with no ink (the maker's mark). Away while a finger is down; written in
 * again, left to right, when a new day's ring has bloomed. (The practice only: the challenge keeps its score.)
 */
let editionAt = 0, editionShown = 0;
function drawEdition(v: View, t: number, dt: number): void {
  if (CHALLENGE || !tree.rings.length) return;
  const away = fingers.size > 0 || !!tree.stroke;
  editionShown = away ? Math.max(0, editionShown - dt / 0.3) : Math.min(1, editionShown + dt / 1.2);
  if (editionShown <= 0.01) return;
  const last = tree.rings[tree.rings.length - 1];
  let rmax = 0;
  for (let i = 0; i < K; i++) rmax = Math.max(rmax, v.s * warpR(v.warp, last[i]));
  const y = v.cy + rmax + (barkCss(v) + 30) * px, half = Math.min(rmax, W / 2 - 30 * px);
  const [yy, mm, dd] = (days[days.length - 1] ?? dayOf()).split('-').map(Number);
  const date = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  // (Written in, left to right, once a new day's ring has bloomed.)
  const w = t < editionAt ? 0 : smooth((t - editionAt) / 1.1);
  g.save();
  g.beginPath(); g.rect(v.cx - half - 40 * px, y - 30 * px, (2 * half + 80 * px) * (editionAt ? w : 1), 60 * px); g.clip();
  g.globalAlpha = editionShown;
  // Graphite: a soft grey, its grain the paper's own (laid over it after).
  g.fillStyle = 'rgba(92,88,84,0.78)'; g.font = `italic ${13 * px}px Newsreader, "Iowan Old Style", Georgia, serif`; g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillText(String(daysDrawn()), v.cx - half, y);
  g.textAlign = 'center'; g.fillText(date, v.cx, y);
  g.textAlign = 'right'; g.fillText(kind, v.cx + half - 22 * px, y);
  // The blind stamp: three rings and a heart, pressed in (a highlight above, a shadow below, no ink).
  const sx = v.cx + half - 6 * px, sy = y;
  for (const [dx, dy, col] of [[-0.7, -0.7, 'rgba(255,253,246,0.95)'], [0.7, 0.7, 'rgba(96,74,52,0.28)']] as [number, number, string][]) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 0.9 * px;
    for (const r of [7, 4.6, 2.4]) { g.beginPath(); g.arc(sx + dx * px, sy + dy * px, r * px, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(sx + dx * px, sy + dy * px, 0.9 * px, 0, TAU); g.fill();
  }
  g.restore();
}

/** When the page opened: the slice paints itself in from the heart. */
let openedAt = 0;
// (`?slow=5` plays the opening and the bloom five times slower, to look at them.)
const SLOW = Number(params.get('slow')) || 1, OPEN = 1.8 * SLOW, BLOOM = 1.1 * SLOW;

function frame(): void {
  const t = clock(), dt = 1 / 60, v = viewNow(t);
  // The ring just closed blooms, then is done (and on the iPhone app, a faint touch as it settles).
  if (settle.ring >= 0 && t - settle.at > BLOOM + 0.6) {
    settle.ring = -1;
    if (NATIVE && painter === null) tap({ strength: 0.3, sharpness: 0.2 });
  }
  // A line left resting a while fades away.
  if (tree.stroke && tree.resting && painter === null && t - restAt > 6) tree.cancel();
  paper.step(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(groundOf(), 0, 0);
  // At rest, or drawing: the one eased into the other (slowly to rest, quickly back).
  const busy = fingers.size > 0 || !!tree.stroke || !!ease || settle.ring >= 0 || (CHALLENGE && !run.over);
  if (busy) idleSince = t;
  const restWanted = PRINT && !busy && t - idleSince > 1.4 && !!v.warp && v.warp.beta > 0;
  relax = restWanted ? Math.min(1, relax + dt / 0.9) : Math.max(0, relax - dt / 0.22);
  const moving = !!ease || !!lookBack || fingers.size >= 2;
  if (PRINT) {
    const rk = smooth(relax);
    if (rk < 1) drawPrintCached(v, moving, 'drawing', 1 - rk);
    if (rk > 0) drawPrintCached(restOf(v), moving, 'rest', rk);
  } else { paper.draw(g, v); drawLatewood(v); }
  const n = tree.rings.length;
  // A ring touched: lit softly along its edge for a moment, as its day is read.
  const glow = lit >= 0 && lit < n ? 1 - smooth((t - litAt - 2) / 1.2) : 0;
  if (glow > 0.01) { g.strokeStyle = `rgba(255,251,240,${(0.85 * glow).toFixed(3)})`; g.lineWidth = 2 * px; ringPath(shownOf(v), barkOf(lit)); g.stroke(); }
  if (!PRINT) drawBark(v);
  // The newest ring's colour spreads from the line drawn in toward the last ring, its front soft.
  if (settle.ring >= 0 && settle.ring < n) {
    const p = smooth((t - settle.at) / BLOOM), inner = barkOf(settle.ring - 1), outer = barkOf(settle.ring);
    const at = (k: number) => (a: number) => { const r0 = inner(a), r1 = outer(a); return r1 - Math.min(1, k) * (r1 - r0); };
    // (Never bare paper: what it hasn't reached is a pale first wash, deepening as the colour arrives.)
    if (p < 1) {
      const fade = (1 - p) * (1 - smooth((t - settle.at - BLOOM * 0.7) / (BLOOM * 0.5)));
      hideBetween(v, inner, at(p), 0.62 * fade);
      hideBetween(v, at(p), at(p + 0.15), 0.38 * fade);
      hideBetween(v, at(p + 0.15), at(p + 0.3), 0.16 * fade);
    }
  }
  // On opening, the slice paints itself in, from the heart outward.
  const o = smooth((t - openedAt) / OPEN);
  if (o < 1 && n > 0) {
    const out = barkOf(n - 1), rr = (k: number) => (a: number) => Math.min(out(a), Math.max(0, k) * out(a));
    const pad = (a: number) => out(a) + (4 + 1.4 * barkCss(v)) * px / Math.max(1e-6, v.s);
    hideBetween(v, rr(o + 0.12), pad, 1);
    hideBetween(v, rr(o), rr(o + 0.12), 0.5);
  }
  // The ink: a brush's line, wet at first, then drying into bristle-streaks and evaporating. (It's on the
  // slice, so it draws back with it.)
  drawBrush(g, v, t);
  drawKnots(shownOf(v), t);
  drawEdition(shownOf(v), t, dt);
  drawPaper(g, W, H);
  requestAnimationFrame(frame);
}

void (async () => {
  await recall();
  warp = warpFor(tree); paper.fit(warp, warp.R); paper.bake(tree);
  fit(); view = null; openedAt = clock(); idleSince = openedAt + OPEN;
  const today = dayOf();
  showScore();
  if (CHALLENGE) say('Draw around the circle. Get close, but don’t touch it. Faster scores more.', 8);
  else say(!tree.rings.length ? 'Draw a circle around this one. One ring a day.' : days.includes(today) ? 'Today’s ring is done. Draw another if you like.' : 'Draw today’s ring.', 8);
  Object.assign(window, { press: { get tree() { return tree; }, get phase() { return settle.ring >= 0 ? 'settling' : 'trace'; }, get easing() { return !!ease; }, get view() { return viewNow(); }, get days() { return days; }, get run() { return run; } } });
  requestAnimationFrame(frame);
})();
