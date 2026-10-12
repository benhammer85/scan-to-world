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
 * The challenge (challenge.html, the same drawing): a new tree each run; each ring as close to the last
 * as you dare, and quick, scored for both; let the brush touch the last ring's edge and the run is over.
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
import { keepTree, recallTree, snapshotTree, treeFrom } from './save';

const TAU = Math.PI * 2, PAPER = '#f4efe4';
const canvas = document.getElementById('press') as HTMLCanvasElement, g = canvas.getContext('2d')!;
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
const DAILY = { yearsPerRing: 1, crown: OAK.crown / 5, crownYears: 6, oldFrom: 1e6, oldTo: 2e6, ink: 1e6 };
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
const ROUND = CHALLENGE ? 0 : 0.15;
/** Where the finger puts the line (steady widths from the bark), eased a little toward round. */
function rounded(a: number, u: number): number {
  return Math.min(WIDEST, u) + ROUND * (tree.radius - radiusAt((i) => tree.inner(i), a)) / tree.wRef;
}
const DIARY = 'diary', params = new URLSearchParams(location.search);
let tree = new TreeSim(Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e6), DAILY);
/** The day each ring was drawn (local, as 2026-10-11). */
let days: string[] = [];
const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysDrawn = () => new Set(days).size;

const paper = new Paper(512);
// (The season's colour stays, half settled into the wood: green and gold to rust and violet, in oak.)
paper.turn = 0.5;
// (No dark drying rim: each ring's edge is its own painted line, so the wash makes no second one.)
paper.wash.edgeFlow = 0;
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
    const R = tree.radius + width * tree.wRef, u = (b: number) => Math.max(0.1, (R - radiusAt((i) => tree.inner(i), b)) / tree.wRef + wob * Math.sin(2 * b + ph));
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
  tree = t; days = (k.days ?? []).slice(0, t.rings.length);
  while (days.length < t.rings.length) days.unshift(days[0] ?? dayOf());
}
function keep(): void {
  if (params.has('demo') || CHALLENGE) return;
  void keepTree({ tree: 'oak', seed: tree.seed, wander: false, turn: 0, sim: snapshotTree(tree), days: days.slice() }, DIARY);
}

/**
 * The slice on the screen. After each ring it draws back slowly to make room for the next (`ease`, over a
 * few seconds, from where the new bark was drawn to where it fits), never in a jump; a touch while it's
 * drawing back stops it where it is.
 */
let ease: { from: number; at: number } | null = null;
const EASE = 3;
function viewNow(t = clock()): View {
  if (!view) {
    // (A little above the middle, with room round it: a study on a sheet, in reach of the thumb.)
    const room = Math.max(40 * px, Math.min(W / 2 - 34 * px, H * 0.27)), cy = Math.round(H * 0.47);
    view = { cx: W / 2, cy, s: scaleFor(tree, room, px, warp), turn: 0, px, warp };
    ease = null;
  }
  if (!ease) return view;
  const k = smooth((t - ease.at) / EASE);
  if (k >= 1) { ease = null; return view; }
  return { ...view, s: ease.from + (view.s - ease.from) * k };
}
/** The ring closed: the slice laid out for the tree as it is now, eased to from where it was. */
function makeRoom(): void {
  const was = viewNow(), old = warp, bark = tree.radius;
  warp = warpFor(tree); paper.fit(warp, warp.R); view = null;
  const v = viewNow();
  // (Where the new bark was drawn, it stays at first: the slice then draws back from there.)
  const from = was.s * warpR(old, bark) / Math.max(1e-6, warpR(warp, bark));
  ease = { from: Math.min(from, 3 * v.s), at: clock() };
}
/** A touch: the slice stops drawing back, where it is. */
function holdView(): void {
  if (!ease) return;
  view = viewNow(); ease = null;
}

// ---------------------------------------------------------------- the turn of a ring
// ---------------------------------------------------------------- the challenge
const scoreEl = document.getElementById('score');
/** The run: its points and rings; this ring's closeness (CSS px from the last ring's edge, summed) and when it began. */
let run = { score: 0, rings: 0, over: false, gapSum: 0, gapN: 0, began: 0 };
/** Where the brush touched the edge (device px), and when. */
let touched: { x: number; y: number; at: number } | null = null;
const bestOf = () => { try { return Number(localStorage.getItem('annulus.challenge')) || 0; } catch { return 0; } };
function showScore(): void {
  if (!scoreEl) return;
  const best = bestOf();
  scoreEl.textContent = run.rings || run.score ? `${run.rings} ${run.rings === 1 ? 'ring' : 'rings'} · ${run.score.toLocaleString()}` : best ? `best ${best.toLocaleString()}` : '';
}
/**
 * A ring's points: closeness (1 on the edge, a half at 5 px off, a sixth at 25) times pace (2 for a ring
 * in 2 s or less, 1 at 4 s, a half at 8), out of 200.
 */
function ringPoints(): number {
  const gap = run.gapN ? run.gapSum / run.gapN : 30, secs = Math.max(0.5, clock() - run.began);
  return Math.round(100 * (1 / (1 + gap / 5)) * Math.min(2, 4 / secs));
}
/** The brush touched the last ring's edge: the run is over, where it touched marked. */
function collide(x: number, y: number): void {
  run.over = true; tree.cancel(); painter = null; trail = [];
  touched = { x, y, at: clock() };
  let best = bestOf();
  if (run.score > best) { best = run.score; try { localStorage.setItem('annulus.challenge', String(best)); } catch { /* not kept */ } }
  if (NATIVE) tap({ strength: 0.8, sharpness: 0.6 });
  words.classList.add('over');
  say(`Touched the edge. ${run.rings} ${run.rings === 1 ? 'ring' : 'rings'}, ${run.score.toLocaleString()} points${run.score >= best && run.score > 0 ? ': your best' : `; best ${best.toLocaleString()}`}. Touch to begin again.`, 1e5);
  if (scoreEl) scoreEl.textContent = '';
}
/** A new run: a new seedling, a clean sheet. */
function restart(): void {
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY);
  days = []; trail = []; touched = null; settle = { ring: -1, at: 0 };
  run = { score: 0, rings: 0, over: false, gapSum: 0, gapN: 0, began: 0 };
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
let navT = 0;
function navAway(away: boolean): void {
  clearTimeout(navT);
  if (away) nav?.classList.add('away');
  else navT = window.setTimeout(() => nav?.classList.remove('away'), 1500);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (painter !== null) return;
  navAway(true);
  // (After a touch on the edge, a moment to see the score before a touch begins again.)
  if (run.over) { if (touched && clock() - touched.at > 0.8) restart(); return; }
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
  if (brushAt(tree, v, 0, x, y).u < 0) { if (!CHALLENGE) readDay(v, x, y); return; }
  const b = brushAt(tree, v, 0, ...brushPoint(v, x, y));
  strokeView = v;
  if (tree.begin(e.timeStamp / 1000, b.a, rounded(b.a, b.u))) {
    painter = e.pointerId; paper.begin(tree); trailAt(b.a, b.u);
    run.gapSum = 0; run.gapN = 0; run.began = clock();
    loop = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, len: 0, closed: false };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== painter || !strokeView) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const bp = brushPoint(strokeView, c.clientX * px, c.clientY * px), b = brushAt(tree, strokeView, 0, ...bp);
    if (CHALLENGE) {
      // How far the brush is outside the last ring's edge, on the screen: below nothing, it's touched.
      const sv = strokeView, edge = sv.s * warpR(sv.warp, radiusAt((i) => tree.inner(i), b.a));
      const gap = (Math.hypot(bp[0] - sv.cx, bp[1] - sv.cy) - edge) / px;
      if (gap < 0) { collide(bp[0], bp[1]); return; }
      run.gapSum += gap; run.gapN++;
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
  navAway(false);
  if (e.pointerId !== painter) return;
  painter = null;
  // Let go most of the way round, the ring is closed for you; earlier, the line rests, to be taken up.
  if (tree.finish(CHALLENGE ? 0.95 : 0.8)) hear();
  // (A whole loop drawn, but not round the slice: let go, and said where, once the hand is off.)
  else if (loop.closed && tree.stroke) { tree.cancel(); say('Draw the circle round the slice.', 4); }
  else { tree.lift(); restAt = clock(); }
});
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
      const pts = ringPoints();
      run.score += pts; run.rings++; showScore();
      window.setTimeout(() => { if (!run.over) say(`+${pts}`, 1.2); }, 150);
    } else if (first) window.setTimeout(() => say(daysDrawn() === 1 ? 'Your first day.' : `Day ${daysDrawn()}.`, 5), 2400);
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
 * Each ring's edge: one fine line of the wood's umber, painted with a rigger, where the ring is wide enough on the screen to show it; finer rings are left to the wash's tone.
 * It's the line the brush left, dried into the wood.
 */
function drawLatewood(v: View): void {
  const n = tree.rings.length;
  g.lineJoin = 'round';
  for (let i = 0; i < n - 1; i++) {
    const w = v.s * (warpR(v.warp, meanR(i)) - warpR(v.warp, meanR(i - 1))) / px;
    const k = Math.max(0, Math.min(1, (w - 2.5) / 5));
    if (k <= 0) continue;
    ringPath(v, barkOf(i));
    g.strokeStyle = `rgba(104,66,40,${(0.34 * k).toFixed(3)})`; g.lineWidth = 0.9 * px; g.stroke();
  }
}

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
    g.fillStyle = `rgba(112,70,42,${(0.3 * life * tone).toFixed(3)})`; quad(p, q, -1, 1);
    g.fillStyle = `rgba(92,56,32,${(0.3 * life * tone + 0.2 * wet).toFixed(3)})`; quad(p, q, -0.5, 0.5);
  }
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
  paper.draw(g, v);
  drawLatewood(v);
  const n = tree.rings.length;
  // A ring touched: lit softly along its edge for a moment, as its day is read.
  const glow = lit >= 0 && lit < n ? 1 - smooth((t - litAt - 2) / 1.2) : 0;
  if (glow > 0.01) { g.strokeStyle = `rgba(255,251,240,${(0.85 * glow).toFixed(3)})`; g.lineWidth = 2 * px; ringPath(v, barkOf(lit)); g.stroke(); }
  drawBark(v);
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
    const pad = (a: number) => out(a) + 4 * px / Math.max(1e-6, v.s);
    hideBetween(v, rr(o + 0.12), pad, 1);
    hideBetween(v, rr(o), rr(o + 0.12), 0.5);
  }
  // The ink: a brush's line, wet at first, then drying into bristle-streaks and evaporating. (It's on the
  // slice, so it draws back with it.)
  drawBrush(g, v, t);
  // Where the brush touched the edge: a small bloom of vermilion.
  if (touched) {
    const k = smooth((t - touched.at) / 0.5), r = (4 + 6 * k) * px;
    const grd = g.createRadialGradient(touched.x, touched.y, 0, touched.x, touched.y, r);
    grd.addColorStop(0, 'rgba(196,72,40,0.75)'); grd.addColorStop(0.7, 'rgba(196,72,40,0.35)'); grd.addColorStop(1, 'rgba(196,72,40,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(touched.x, touched.y, r, 0, TAU); g.fill();
  }
  drawPaper(g, W, H);
  requestAnimationFrame(frame);
}

void (async () => {
  await recall();
  warp = warpFor(tree); paper.fit(warp, warp.R); paper.bake(tree);
  fit(); view = null; openedAt = clock();
  const today = dayOf();
  showScore();
  if (CHALLENGE) say('Draw each ring as close to the last as you dare, and quickly. Touch it, and the run is over.', 8);
  else say(!tree.rings.length ? 'Draw a circle round the slice, as wide or close as you like: a ring a day.' : days.includes(today) ? 'Today’s ring is drawn. Another, if you like.' : 'Today’s ring.', 8);
  Object.assign(window, { press: { get tree() { return tree; }, get phase() { return settle.ring >= 0 ? 'settling' : 'trace'; }, get easing() { return !!ease; }, get view() { return viewNow(); }, get days() { return days; }, get run() { return run; } } });
  requestAnimationFrame(frame);
})();
