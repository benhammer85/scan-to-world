/**
 * A prototype of the daily practice: a ring a day, kept, so the slice becomes a diary of your days, read
 * from the heart outward (touch a ring for its day). Each ring is one year of the tree's, traced with a brush, then settling into the paper by itself, as a
 * printing press presses without ink (karazuri, the Japanese "empty printing", or a blind embossing).
 * Nothing to learn and nothing said: silent.
 *
 *   trace     draw the year's ring at your own pace with a wet brush: its stroke is dark at the brush
 *             and evaporates behind it (disappearing ink), leaving the year's colour, spring to winter
 *             round the ring, settling only partly into the wood
 *   settle    as the ring closes, it sinks softly into the paper (and on the iPhone app, a faint
 *             pressure in the hand); its relief stays, caught by raking light
 *
 * Nothing else on the page while you draw: no print behind the slice, no words, no line to keep to.
 * `?demo` shows a year already drawn (not kept), to see what a year of days looks like.
 */
import '../volcano/fonts.css';
import { NATIVE, rumble, tap } from '../volcano/native';
import { K, OAK, TreeSim } from './tree';
import { brushAt, pointerAt, radiusAt, roomOf, scaleFor, unwarpR, warpFor, type View, type Warp } from './hand';
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
const DAILY = { yearsPerRing: 1, crown: OAK.crown / 5, crownYears: 6, oldFrom: 1e6, oldTo: 2e6, ink: 1e6 };
/** The widest year (steady widths): a circle drawn at the screen's edge stops at this. */
const WIDEST = 6;
const DIARY = 'diary', params = new URLSearchParams(location.search);
let tree = new TreeSim(Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e6), DAILY);
/** The day each ring was drawn (local, as 2026-10-11). */
let days: string[] = [];
const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysDrawn = () => new Set(days).size;
/** How deep each ring was pressed (0 to 1). */
let depths: number[] = [];

const paper = new Paper(512);
// (The season's colour stays, half settled into the wood: green and gold to rust and violet, in oak.)
paper.turn = 0.5;
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
  if (params.has('demo')) { demoYear(); return; }
  if (params.has('fresh')) return;
  const k = await recallTree(DIARY), t = k && treeFrom(k, DAILY);
  if (!k || !t) return;
  tree = t; days = (k.days ?? []).slice(0, t.rings.length);
  while (days.length < t.rings.length) days.unshift(days[0] ?? dayOf());
}
function keep(): void {
  if (params.has('demo')) return;
  void keepTree({ tree: 'oak', seed: tree.seed, wander: false, turn: 0, sim: snapshotTree(tree), days: days.slice() }, DIARY);
}

function viewNow(): View {
  if (!view) {
    const r = roomOf(W, H, px);
    view = { cx: r.cx, cy: r.cy, s: scaleFor(tree, r.room, px, warp), turn: 0, px, warp };
  }
  return view;
}

// ---------------------------------------------------------------- the turn of a ring
type Phase = 'trace' | 'settling' | 'lifting';
let phase: Phase = 'trace', since = 0, depth = 0;
function enter(p: Phase): void { phase = p; since = clock(); }
/** The brush's track: where, when, how wide it laid (slow is wide), and how fast. */
let trail: { a: number; r: number; t: number; w: number; fast: number }[] = [];
let strokeView: View | null = null, painter: number | null = null;

function say(text: string, fade = 10): void {
  // (Nothing to read while the hand is drawing.)
  if (painter !== null) return;
  words.textContent = text; words.classList.add('shown');
  clearTimeout(sayT); sayT = window.setTimeout(() => words.classList.remove('shown'), fade * 1000);
}
let sayT = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (painter !== null) return;
  words.classList.remove('shown');
  const x = e.clientX * px, y = e.clientY * px;
  if (phase !== 'trace') return;
  const v = viewNow();
  if (tree.stroke && tree.resting) {
    const b = brushAt(tree, strokeView ?? v, 0, x, y);
    if (tree.begin(e.timeStamp / 1000, b.a, Math.min(WIDEST, b.u))) painter = e.pointerId;
    return;
  }
  const b = brushAt(tree, v, 0, x, y);
  // Inside the slice, a ring's day is read; anywhere outside it, the circle begins.
  if (b.u < 0) { readDay(v, x, y); return; }
  strokeView = v;
  if (tree.begin(e.timeStamp / 1000, b.a, Math.min(WIDEST, b.u))) { painter = e.pointerId; paper.begin(tree); trailAt(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== painter || phase !== 'trace' || !strokeView) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const b = brushAt(tree, strokeView, 0, c.clientX * px, c.clientY * px);
    tree.move(c.timeStamp / 1000, b.a, Math.min(WIDEST, b.u));
    trailAt();
    if (!tree.stroke) break;
  }
  hear();
});
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => {
  if (e.pointerId !== painter) return;
  painter = null;
  if (phase === 'trace') tree.lift();
});

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

function trailAt(): void {
  const tip = tree.tip;
  if (!tip || !strokeView) return;
  const t = clock(), last = trail[trail.length - 1], joined = last && Math.abs(last.a - tip.a) < 0.5;
  // (The ink follows the finger's tremor less than the finger does: a shaky hand still lays a calm line.)
  const raw = radiusAt((i) => tree.inner(i), tip.a) + tip.u * tree.wRef, r = joined ? last.r + (raw - last.r) * 0.35 : raw;
  // Speed on the screen, in CSS px a second, eased so the width swells and thins smoothly.
  let fast = last ? last.fast : 0;
  if (joined) {
    const [x0, y0] = at(strokeView, last.a, last.r), [x1, y1] = at(strokeView, tip.a, r);
    const v = Math.hypot(x1 - x0, y1 - y0) / px / Math.max(0.008, t - last.t);
    fast += (Math.min(1, v / 600) - fast) * 0.25;
  }
  // A brush: full and wet when unhurried, thin and dry when quick, tapering in as it touches down.
  const n = joined ? trail.length : 0;
  const w = (3 + 5 * (1 - fast)) * Math.min(1, 0.3 + n / 8);
  trail.push({ a: tip.a, r, t, w: joined && n ? last.w + (w - last.w) * 0.35 : w * 0.4, fast });
}
function hear(): void {
  for (const n of tree.news) if (n.kind === 'ring') {
    paper.paint(tree); paper.close(tree);
    depths.push(0);
    // The day's ring, kept; the first of the day is counted, quietly, once it has settled.
    const today = dayOf(), first = !days.includes(today);
    days.push(today); keep();
    if (first) window.setTimeout(() => say(daysDrawn() === 1 ? 'Your first day.' : `Day ${daysDrawn()}.`, 5), 2400);
    // (The ring is done: the finger, still down or not, rests while it settles.)
    painter = null; depth = 0;
    enter('settling');
  }
  tree.news.length = 0;
}

// ---------------------------------------------------------------- drawing
/** A ring's relief: pressed into the paper, its edge catches the light above and falls into shadow below. */
function drawRelief(v: View, i: number, d: number): void {
  if (d <= 0.01) return;
  const r = tree.rings[i], o = (0.4 + 0.7 * d) * px;
  const path = (dx: number, dy: number) => { g.beginPath(); for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy); } };
  g.lineWidth = 0.8 * px;
  g.strokeStyle = `rgba(70,50,32,${(0.14 * d).toFixed(3)})`; path(o, o); g.stroke();
  g.strokeStyle = `rgba(255,252,244,${(0.3 * d).toFixed(3)})`; path(-o * 0.8, -o * 0.8); g.stroke();
}

/**
 * Oak's rays: fine pale lines running out from the heart across the rings (the "silver grain" of oak).
 * Each begins at a year of its own and runs on to the bark, so they're the same as the tree grows.
 */
const RAYS = Array.from({ length: 150 }, (_, k) => ({ a: hash(k + 0.31) * TAU, from: 900 * hash(k + 0.77) ** 1.6, w: 0.5 + hash(k + 0.13) }));
function drawRays(v: View): void {
  const n = tree.rings.length;
  if (!n) return;
  const bark = tree.rings[n - 1];
  g.lineCap = 'round';
  for (const ray of RAYS) {
    const end = radiusAt(bark, ray.a);
    if (ray.from >= end * 0.92) continue;
    const [x0, y0] = at(v, ray.a, Math.max(ray.from, tree.k.pith)), [x1, y1] = at(v, ray.a, end * 0.985);
    g.strokeStyle = `rgba(255,247,230,${(0.1 * ray.w).toFixed(3)})`; g.lineWidth = (0.5 + 0.6 * ray.w) * px;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
}

/** A fast, steady little hash, 0 to 1: which bristles have run dry where. */
function hash(x: number): number { const h = Math.sin(x * 127.1) * 43758.5453; return h - Math.floor(h); }

/** The brush's line on the page: a wet body that thins and fades, and seven bristles that break up as it dries.
 *  Each piece is drawn edge to edge with the next (sharing its ends), so the translucent ink never doubles. */
function drawBrush(g: CanvasRenderingContext2D, sv: View, t: number): void {
  const n = trail.length;
  if (n < 2) return;
  const pts = trail.map((q) => { const [x, y] = at(sv, q.a, q.r); return { x, y, life: Math.exp(-(t - q.t) / 5), q, nx: 0, ny: 0, hw: 0 }; });
  const lap = (i: number) => Math.abs(trail[i].a - trail[i - 1].a) > 0.5;
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 && !lap(i) ? i - 1 : i], b = pts[i + 1 < n && !lap(i + 1) ? i + 1 : i];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, p = pts[i];
    p.nx = -dy / l; p.ny = dx / l; p.hw = 0.5 * p.q.w * (0.45 + 0.55 * p.life) * px;
  }
  g.lineCap = 'butt';
  for (let i = 1; i < n; i++) {
    const p = pts[i - 1], q = pts[i], life = q.life;
    if (life < 0.02 || lap(i)) continue;
    // The wet body, with a faint bleed into the paper at its edges: both fade first.
    const band = (k: number, alpha: number) => {
      const bp = k * p.hw, bq = k * q.hw;
      g.fillStyle = `rgba(30,24,20,${alpha.toFixed(3)})`;
      g.beginPath();
      g.moveTo(p.x + p.nx * bp, p.y + p.ny * bp); g.lineTo(q.x + q.nx * bq, q.y + q.ny * bq);
      g.lineTo(q.x - q.nx * bq, q.y - q.ny * bq); g.lineTo(p.x - p.nx * bp, p.y - p.ny * bp);
      g.closePath(); g.fill();
    };
    band(1.35, 0.07 * life * life);
    band(0.7, 0.62 * life * life);
    // The bristles: fine lines across the brush, each running dry in streaks as the stroke dries.
    const dry = Math.min(0.85, 0.75 * (1 - life) + 0.35 * q.q.fast);
    g.lineWidth = Math.max(0.6 * px, 0.2 * (p.hw + q.hw));
    for (let j = 0; j < 7; j++) {
      if (hash(j * 13.7 + Math.floor(i / 5) * 0.917) < dry) continue;
      const o = (j / 6 - 0.5) * 1.8;
      g.strokeStyle = `rgba(30,24,20,${(0.5 * life * (0.5 + 0.5 * hash(j + 0.5))).toFixed(3)})`;
      g.beginPath(); g.moveTo(p.x + p.nx * o * p.hw, p.y + p.ny * o * p.hw); g.lineTo(q.x + q.nx * o * q.hw, q.y + q.ny * o * q.hw); g.stroke();
    }
  }
}

function frame(): void {
  const t = clock(), dt = 1 / 60, v = viewNow();
  if (phase === 'settling') {
    // The ring sinks softly into the paper, by itself, then the paper lifts.
    depth = 0.6 * smooth((t - since) / 1.6);
    if (NATIVE) rumble(0.05 + 0.2 * depth, 0.15);
    if (t - since > 1.9) {
      depths[tree.rings.length - 1] = depth;
      if (NATIVE) { rumble(0); tap({ strength: 0.3, sharpness: 0.2 }); }
      enter('lifting');
    }
  }
  if (phase === 'lifting' && t - since > 1.2) {
    // The next ring: the slice settles to its new size.
    warp = warpFor(tree); paper.fit(warp, warp.R); view = null; trail = [];
    enter('trace');
  }
  const tip = tree.tip;
  paper.step(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // (No heartwood laid over it: a ring is a day here, and every day's colour stays to be read.)
  paper.draw(g, v); drawRays(v);
  const n = tree.rings.length;
  for (let i = 0; i < n; i++) {
    const live = i === n - 1 && phase === 'settling';
    // (Older years' relief softens into the slice, as the press's edges wear: the last few stand out.)
    drawRelief(v, i, (live ? depth : depths[i] ?? 0) * Math.exp(-(n - 1 - i) / 3));
  }
  // A ring touched: lit softly along its edge for a moment, as its day is read.
  const glow = lit >= 0 && lit < n ? 1 - smooth((t - litAt - 2) / 1.2) : 0;
  if (glow > 0.01) {
    const r = tree.rings[lit];
    g.strokeStyle = `rgba(255,251,240,${(0.85 * glow).toFixed(3)})`; g.lineWidth = 2 * px; g.beginPath();
    for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  // The bark: one fine line.
  if (n > 0) {
    const r = tree.rings[n - 1];
    g.strokeStyle = 'rgba(46,33,24,0.7)'; g.lineWidth = 1.1 * px; g.beginPath();
    for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  if (phase === 'trace') {
    // The ink: a brush's line, wet at first, then drying into bristle-streaks and evaporating.
    const sv = strokeView ?? v;
    drawBrush(g, sv, t);
    if (tip && tree.resting) { const p = pointerAt(tree, sv, 0, tip.a, tip.u); g.strokeStyle = 'rgba(30,24,20,0.35)'; g.lineWidth = 1 * px; g.beginPath(); g.arc(p.x, p.y, 5 * px, 0, TAU); g.stroke(); }
  }
  // The platen coming down: the page's edges darken a little as the ring settles, and lift as it rises.
  const platen = phase === 'settling' ? depth : phase === 'lifting' ? (1 - smooth((t - since) / 0.9)) * depths[n - 1] : 0;
  if (platen > 0.005) {
    const grd = g.createRadialGradient(W / 2, v.cy, Math.min(W, H) * 0.35, W / 2, v.cy, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(60,44,30,0)'); grd.addColorStop(1, `rgba(60,44,30,${(0.2 * platen).toFixed(3)})`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
  drawPaper(g, W, H);
  requestAnimationFrame(frame);
}

void (async () => {
  await recall();
  depths = tree.rings.map(() => 0.55);
  warp = warpFor(tree); paper.fit(warp, warp.R); paper.bake(tree);
  fit(); view = null;
  const today = dayOf();
  say(!tree.rings.length ? 'Draw a circle round the slice, as wide or close as you like: a ring a day.' : days.includes(today) ? 'Today’s ring is drawn. Another, if you like.' : 'Today’s ring.', 8);
  Object.assign(window, { press: { get tree() { return tree; }, get phase() { return phase; }, get view() { return viewNow(); }, get days() { return days; } } });
  requestAnimationFrame(frame);
})();
