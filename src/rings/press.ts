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
 * On opening, the slice paints itself in from the heart. Each ring is eased a little toward round (the
 * way a tree evens out), so the slice stays organic, never a lump. `?demo` shows a year already drawn.
 */
import { overcast, setWeather, skyNow, weatherOn, type Sky } from './weather';
import '../volcano/fonts.css';
import { wood, sample, tile, loadWood, type Years } from './wood';
import * as gpu from './gpu';
import { ANATOMY, NONE, NOISE, atlasOf, RAYS, RAY_RUN, h1, rayAt, smooth, vnoise, type Kind } from './anatomy';
import { NATIVE, tap } from '../volcano/native';
import { K, OAK, TreeSim, noise } from './tree';
import { brushAt, radiusAt, scaleFor, unwarpR, warpFor, warpR, type View, type Warp } from './hand';
import { at, paperTooth } from './draw';
import { Paper } from './paint';
import { dayDate, dayOf } from './days';
import { climate, growth as growthOf, lobes } from './growing';
import { crownSize, groundGpu, drawCrown, drawHill, drawMeadow, drawMoss, drawSeedling, drawStream, drawTrack, washFlat, shadeOf, heightAt, land, pigment, seasonOf, snowHill, washCrown, washHill, type CrownForm, type Hill, type Season, type Sun } from './grove';
import { holdStill, steadySize } from './steady';
import { fromText, grove, keepInGrove, keepTree, recallTree, setAside, setGrove, snapshotTree, toText, treeFrom, type KeptTree, type WoodMark } from './save';
import { shareFile } from './share';

const TAU = Math.PI * 2, PAPER = '#f7f3eb';
/**
 * The relief print, after tree-ring prints (the wood itself inked and pressed): the slice's look.
 * `?ink=water` shows the watercolour instead.
 */
const PRINT = new URLSearchParams(location.search).get('ink') !== 'water';
const canvas = document.getElementById('press') as HTMLCanvasElement;
// (The drawing goes to the page, or for a moment to a picture of the slice: see `picture`.)
let g = canvas.getContext('2d')!;
const words = document.getElementById('words')!;
// (The type the sheet's words are written in, asked for at once: drawn on the sheet, it's there from the first, never swapped in.)
try { void document.fonts?.load('italic 13px Newsreader'); } catch { /* the fallback, then */ }
let W = 1, H = 1, px = 1;
function fit(): void {
  // (Laid out again only when the size really changes: not as Safari's toolbar comes and goes.)
  const { w, h } = steadySize(), p = Math.min(3, window.devicePixelRatio || 1);
  if (Math.round(w * p) === W && Math.round(h * p) === H) return;
  px = p; W = Math.round(w * px); H = Math.round(h * px);
  canvas.width = W; canvas.height = H; canvas.style.height = `${h}px`; view = null;
  tooth.style.height = `${h}px`; tooth.style.backgroundSize = `${192 / px}px`;
}
/**
 * The paper's tooth over everything, the opening too, so it's all printed on the same sheet: laid once over
 * the page as its surface, not drawn into it again every frame.
 */
const tooth = document.createElement('div');
tooth.style.cssText = `position:fixed;left:0;top:0;width:100vw;pointer-events:none;mix-blend-mode:multiply;background-image:url(${paperTooth().toDataURL()})`;
canvas.after(tooth);
holdStill(canvas);
addEventListener('resize', fit);
// (Moved to a screen of another density: laid out again for it.)
const watchDensity = () => { try { matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', () => { fit(); watchDensity(); }, { once: true }); } catch { /* the resize will do */ } };
watchDensity();
const clock = () => performance.now() / 1000;
/**
 * The pace of everything that moves, three speeds and one curve (`smooth`), so it all feels one hand's:
 * quick (a response: back from looking closer, a page turned, words away), steady (a change of place: to
 * the grove and back, a ring's colour spreading, words written in, the opening drawn back), and slow (the
 * slice making room for the next year, never seen to happen).
 */
const QUICK = 0.4, STEADY_T = 1, SLOW_T = 3.5;

// ---------------------------------------------------------------- the tree, a ring a day
// One ring is one year of the tree's, and one day of yours: the tree is kept between visits, and each
// ring remembers the day it was drawn. Draw one a day, or as many as you like; a day missed is no matter.
// The wood a ring holds is a fifth of the game's five-year ring, and the crown is grown in a few rings
// (so the first days aren't hairlines); the tree never grows old.
// No line to keep to and no wood to run out of: wherever the circle is drawn, round the slice, is the
// year's edge (a loose, wide circle a wide year; a close one, a narrow year).
// The tree starts from a small heart (2 mm: a 6 mm one was a third of a young slice), and each ring's edge is
// smoothed over a wider arc (12°), so a hand's wobble becomes a gentle swell, as real rings are.
const DAILY = { yearsPerRing: 1, crown: OAK.crown / 5, crownYears: 6, oldFrom: 1e6, oldTo: 2e6, ink: 1e6, pith: 2, smooth: (12 * Math.PI) / 180 };
/** The widest year (steady widths): a circle drawn at the screen's edge stops at this. */
const WIDEST = 6;
/**
 * The brush is a little way in from the fingertip, toward the heart (CSS px): the finger rests just
 * outside the line, so the line, the bark and the gap between them are all in sight while drawing.
 */
const REACH = 16;
/** Where the brush is for a finger at (x, y) (device px). */
function brushPoint(v: View, x: number, y: number): [number, number] {
  const dx = x - v.cx, dy = y - v.cy, d = Math.hypot(dx, dy) || 1, k = Math.max(0, d - REACH * px) / d;
  return [v.cx + dx * k, v.cy + dy * k];
}
/** How far each ring is eased toward round (a tree evens out its lumps over the years). */
const ROUND = PRINT ? 0.15 : 0.3;
/**
 * The practice, printed, grows as a tree does: from a seed planted on a bare sheet. The loop is always
 * the same size on the screen, day after day, a ritual's: the bark is always shown at the same size
 * (`BARK` of the room), and as the tree grows the view draws slowly back, so the years before tighten in
 * toward the heart; growth shows as the rings' density, as a real slice's age does. The loop is drawn at the hand's size, wherever is comfortable round
 * the slice: how loose it is sets how wide the year is (`STEADY` CSS px out from the bark a steady year;
 * from `LEAST` to `LOOSEST` of one), its wobble how the year swells and thins round the tree; then it
 * draws in onto the slice as the year. (The watercolour keeps the hand's own scale.)
 */
const GROWN = PRINT;
const BARK = 0.6, STEADY = 34, LEAST = 0.4, LOOSEST = 2.4;
/** Where the finger puts the line (steady widths from the bark), eased a little toward round. */
function rounded(a: number, u: number): number {
  if (!GROWN) return Math.min(WIDEST, u) * lean(a) + ROUND * (tree.radius - radiusAt((i) => tree.inner(i), a)) / tree.wRef;
  const v = strokeView ?? viewNow(), loose = (u * tree.wRef * v.s) / (STEADY * px);
  // (Growing out, the ring is where the hand puts it, as far as the room allows: the wood's own swells
  // round it, but no year good or lean of its own.)
  // (Never stopped short of the hand: a loop as wide as the room, however loose, is laid; the tree only
  // draws back the more for it.)
  const roomU = Math.max(LOOSEST, (roomNow() - v.s * tree.radius) / (SEED_K * STEADY * px));
  // (The tree's own year (good, lean, now and then a hard one), and its youth: one way of growing all
  // through, never a step where it fills its room.)
  return Math.max(LEAST, Math.min(roomU, loose)) * growth(a) * climate(tree.seed, tree.rings.length) * youth(tree.rings.length) * (1 + 0.15 * dampHere()) + evenUp(a) + markSwell(a);
}

// ---------------------------------------------------------------- knots and burls
/**
 * What the hand leaves in the wood besides its rings, found by drawing. The brush paused a moment mid-loop:
 * a knot, a branch grown out from there, a dark streak running out through the years, the rings bulging
 * round it; paused there again on a later day, the branch grows on and thickens; left, it dies and the
 * rings close over it. A scribble in one place: a burl, tangled grain swelling the rings into a lump,
 * flecked with the eyes of buds that never grew; fed again, it swells; left, it rounds off. Each wood its
 * own way with them (an olive burls hugely, a pine's knots are dark with resin).
 */
let marks: WoodMark[] = [];
/** Begun or fed in the loop being drawn: where (angle, mm), when, and how long held (s). Kept as the ring closes. */
let pendingMarks: { kind: WoodMark['kind']; a: number; r: number; at: number; grow: number }[] = [];
/** How each wood takes them: its knots' and burls' strength. */
const TAKES: Record<Kind, { knot: number; burl: number }> = {
  oak: { knot: 1.1, burl: 2.2 }, ash: { knot: 0.9, burl: 1.6 }, cherry: { knot: 0.9, burl: 2.2 }, maple: { knot: 1, burl: 2.5 },
  birch: { knot: 1, burl: 2.3 }, pine: { knot: 1.3, burl: 1.4 }, redwood: { knot: 0.8, burl: 2.6 }, bristlecone: { knot: 0.9, burl: 2 }, olive: { knot: 1, burl: 2.6 },
  fir: { knot: 1.3, burl: 1.5 }, juniper: { knot: 1.1, burl: 2.4 },
};
const angleOff = (a: number, b: number) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);
/** How much a ring swells here (steady widths) for the knots and burls alive at it. */
function markSwell(a: number): number {
  const n = tree.rings.length, take = TAKES[kind];
  let u = 0;
  for (const m of marks) {
    const age = n - m.last, alive = age <= 1 ? 1 : Math.max(0, 1 - (age - 1) / (m.kind === 'knot' ? 3 : 5));
    if (alive <= 0) continue;
    const d = angleOff(a, m.a);
    // (A knot: the rings bowing tight round the branch, a point more than a swell.)
    if (m.kind === 'knot') u += alive * take.knot * Math.min(4, m.size) ** 0.6 * (0.3 * Math.exp(-((d / 0.05) ** 2)) + 0.12 * Math.exp(-((d / 0.16) ** 2)));
    else {
      // (Swelling, and its grain tangled: the ring there crimped, differently each year.)
      const wB = 0.2 + 0.025 * Math.min(6, m.size), env = Math.exp(-((d / wB) ** 2)), sz = Math.min(6, m.size);
      u += alive * take.burl * env * (0.32 * sz ** 0.7 * (0.75 + 0.5 * h1(m.seed + n * 1.7)) + 0.14 * sz ** 0.5 * Math.sin(a * 46 + h1(m.seed + n * 3.1) * TAU) * Math.sin(a * 17 + n * 1.9));
    }
  }
  // (And the one forming under the brush now, at once.)
  for (const p of pendingMarks) {
    const d = angleOff(a, p.a);
    u += p.kind === 'knot' ? take.knot * (0.1 + 0.08 * Math.min(1, p.grow)) * Math.exp(-((d / 0.07) ** 2)) : take.burl * (0.2 + 0.1 * Math.min(2, p.grow)) * Math.exp(-((d / 0.22) ** 2));
  }
  return u;
}
/** The ring closed: what was begun in it is kept, fed to a knot or burl nearby still alive, or begun anew. */
function keepMarks(): void {
  const n = tree.rings.length - 1;
  for (const p of pendingMarks) {
    const near = marks.find((m) => m.kind === p.kind && n - m.last <= (p.kind === 'knot' ? 3 : 5) && angleOff(m.a, p.a) < (p.kind === 'knot' ? 0.25 : 0.45));
    if (near) { near.last = n; near.size += 1 + p.grow; near.a += ((((p.a - near.a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * 0.2; }
    else marks.push({ kind: p.kind, a: p.a, from: n, last: n, size: 1 + p.grow, seed: Math.floor(Math.random() * 1e6) });
  }
  pendingMarks = [];
}
/** The hand still: when it last moved, and its brush's angles a moment back (for a scribble). */
let movedAt = 0, moveX = 0, moveY = 0, wiggle: { t: number; a: number; x: number; y: number }[] = [];
/** Each frame, while drawing: the brush held still a moment mid-loop begins a knot, and feeds it as it's held. */
function watchHand(t: number, dt: number): void {
  if (painter === null || !tree.stroke || tree.resting || tree.progress < 0.04 || !trail.length) return;
  if (t - movedAt < 0.45) return;
  const q = trail[trail.length - 1];
  let p = pendingMarks.find((m) => m.kind === 'knot' && angleOff(m.a, q.a) < 0.2);
  if (!p) {
    p = { kind: 'knot', a: q.a, r: q.r, at: t, grow: 0 }; pendingMarks.push(p);
    if (NATIVE) tap({ strength: 0.45, sharpness: 0.6 });
  } else p.grow = Math.min(2.5, p.grow + dt);
}
/**
 * A finger's move while drawing: how far it went (a pause is none), and a scribble's back and forth: any
 * way at all (along the loop, in and out, or across), four turns or more within a second, in a small spot.
 */
function noteHand(x: number, y: number, a: number, t: number): void {
  if (Math.hypot(x - moveX, y - moveY) > 3) { movedAt = t; moveX = x; moveY = y; }
  const last = wiggle[wiggle.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) >= 4) wiggle.push({ t, a, x, y });
  while (wiggle.length && t - wiggle[0].t > 1.1) wiggle.shift();
  if (wiggle.length < 5) return;
  // (A turn: the finger heading back the way it came, near enough.)
  let turns = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < wiggle.length; i++) {
    const q = wiggle[i];
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    if (i < 2) continue;
    const p = wiggle[i - 1], o = wiggle[i - 2], ux = p.x - o.x, uy = p.y - o.y, vx = q.x - p.x, vy = q.y - p.y;
    if (ux * vx + uy * vy < -0.3 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) turns++;
  }
  if (turns >= 4 && Math.max(x1 - x0, y1 - y0) < 70 && trail.length) {
    const q = trail[trail.length - 1], at = q.a;
    const p = pendingMarks.find((m) => m.kind === 'burl' && angleOff(m.a, at) < 0.4);
    if (!p) { pendingMarks.push({ kind: 'burl', a: at, r: q.r, at: t, grow: 0 }); if (NATIVE) tap({ strength: 0.35, sharpness: 0.3 }); }
    else p.grow = Math.min(3, p.grow + 0.35);
    wiggle = [];
  }
}
/**
 * The knots and burls, in the print, made of the rings themselves. The printed wood is pulled about where
 * each lies (`warpMarks`), then a little is inked: a burl's bud specks, the rings swirled round each; a
 * knot's streak, the branch's own wood, darker, out through the years from where it began, the trunk's
 * rings bunched along its sides, its tip (still growing) a few tight rings of the branch's own round its
 * pith, or (left, grown over) a fine dark line of the bark it was buried in.
 */
function drawMarks(v: View, Z: number): void {
  const n = tree.rings.length;
  if (!n || !marks.length) return;
  warpMarks(v, Z);
  for (const m of marks) {
    if (m.from >= n) continue;
    if (m.kind === 'burl') {
      for (const e of burlEyes(m, v, Z)) { g.beginPath(); g.ellipse(e.x, e.y, e.e * 0.55, e.e * 0.42, e.rot, 0, TAU); g.fillStyle = ink(0.92); g.fill(); }
      continue;
    }
    // (The branch cut across, as a knot shows in sawn wood: its own few rings, darker and a little off
    // round, round its pith; the trunk's rings swirled round it (see `warpMarks`). Grown over once left:
    // a fine dark ring of the bark caught round it.)
    // (Every knot its own: as long as the branch met the cut at a slant (round where it met it square), as large
    // as it grew, its own rings off centre (a branch grows more on its upper side), its pith small. A live knot's
    // rings run on into the trunk's; a dead one (most of those no longer grown) sits in a dark
    // ring of the bark it was buried in, shrunk from the wood at one side and split across.)
    const k = knotSpot(m, v, Z), hs = (q: number) => h1(m.seed * 0.0137 + q);
    // (Only a branch no longer grown can have died: most of those left, never one still being added to.)
    const dead = n - 1 - m.last > 2 && hs(1) < 0.7;
    const e = k.e * (0.45 + 0.45 * hs(3)), long = 1 + 1.6 * hs(4) ** 1.5, sq = 0.62 + 0.3 * hs(5);
    const ox = (hs(6) - 0.5) * 0.5, oy = (hs(7) - 0.2) * 0.55, rough = 0.12 + 0.25 * hs(8);
    const P = (s: number, t: number, seed: number): [number, number] => {
      // (Each ring of it off centre toward the branch's under side, more so the further in.)
      // (Its edge torn finely too, as the ink took it: bites at every scale, so looked into it's never a clean line.)
      const fine = s > 0.95 ? 0.16 * (vnoise(t * 9 + seed + m.seed * 0.003, 3.1) - 0.5) + 0.12 * (vnoise(t * 27 + seed, 7.7) - 0.5) + 0.09 * (vnoise(t * 70 + seed, 1.3) - 0.5) : 0;
      const rr = e * s * (1 + rough * (vnoise(Math.cos(t) * 1.6 + m.seed * 0.01 + seed, Math.sin(t) * 1.6 + seed) - 0.5) + fine);
      const ex = rr * long * Math.cos(t) + e * ox * (1 - s), ey = rr * sq * Math.sin(t) + e * oy * (1 - s);
      return [k.x + ex * Math.cos(k.rot) - ey * Math.sin(k.rot), k.y + ex * Math.sin(k.rot) + ey * Math.cos(k.rot)];
    };
    const oval = (s: number, seed: number) => {
      g.beginPath();
      for (let j = 0; j <= 180; j++) { const [xx, yy] = P(s, (j / 180) * TAU, seed); if (j) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.closePath();
    };
    // (As a knot prints: the branch's wood denser than the trunk's, so it takes the ink as a dark mass, its
    // edge uneven and soft, flecked through with paper; its own rings only a few fine pale traces in it, broken;
    // the trunk's rings swept round it (see warpMarks). Never an outline laid on the print.)
    // (A little larger than its wood, so the trunk's swept rings never leave a pale seam along it.)
    oval(1.06, 0); g.fillStyle = ink(dead ? 0.95 : 0.9); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineCap = 'round';
    // (Its own rings: many fine pale traces, close and off centre, each broken into a few runs, the way a
    // knot's dense years print; and short pale flecks along them where the ink didn't take.)
    const N = Math.max(3, Math.round(k.rings * (0.9 + 0.8 * hs(9)))), lw = Math.max(0.4 * px * Z, e * 0.016);
    for (let j = 0; j < N; j++) {
      const s0 = 0.66 * (1 - (j + 0.5) / (N + 0.5)) ** 0.9;
      g.lineWidth = lw * (0.6 + 0.8 * hs(30 + j));
      let t = hs(10 + j) * TAU;
      const end = t + TAU;
      while (t < end) {
        const run = Math.min(end - t, 0.6 + 2.2 * hs(t * 3.1 + j)), gap = 0.15 + 0.5 * hs(t * 5.7 + j);
        if (hs(t * 1.9 + j * 4.1) > 0.25) {
          g.beginPath();
          for (let q = 0; q <= 16; q++) { const [xx, yy] = P(s0, t + (q / 16) * run, j * 2.7 + 1); if (q) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
          g.stroke();
        }
        t += run + gap;
      }
    }
    for (let q = 0; q < 26; q++) {
      const sq0 = 0.15 + 0.75 * hs(70 + q), tq = hs(80 + q) * TAU, [xx, yy] = P(sq0, tq, 0), [x2, y2] = P(sq0, tq + 0.05, 0);
      const r = Math.max(0.4 * px * Z, e * (0.012 + 0.022 * hs(90 + q))), ang = Math.atan2(y2 - yy, x2 - xx);
      g.beginPath(); g.ellipse(xx, yy, r * (2 + 3 * hs(97 + q)), r, ang, 0, TAU); g.fill();
    }
    if (dead) {
      // (A dead one: shrunk from the wood along one side, and split across.)
      const t0 = hs(42) * TAU;
      g.lineWidth = Math.max(0.8 * px * Z, e * 0.07);
      g.beginPath(); for (let q = 0; q <= 10; q++) { const [xx, yy] = P(1.06, t0 + (q / 10) * 1.6, 0); if (q) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke();
      const tc = hs(43) * TAU; g.beginPath(); g.moveTo(...P(0.1, tc, 0)); g.lineTo(...P(0.9, tc + 0.15, 0)); g.lineWidth = Math.max(0.7 * px * Z, e * 0.05); g.stroke();
    }
    g.restore();
  }
}
/** A knot on the sheet: where (device px), how large, turned how, and how many of its own rings. */
function knotSpot(m: WoodMark, v: View, Z: number): { x: number; y: number; e: number; rot: number; rings: number } {
  // (Where the branch, rising, crosses the cut: partway along its years, never at the bark.)
  // (Its own years only, never the tree's count or bark as they are today: a year added leaves it as it was,
  // once the bark it's measured from, three years past its last, is grown.)
  const n = tree.rings.length, i = Math.max(0, Math.min(n - 1, Math.round((m.from + m.last) / 2)));
  const rin = i <= 0 ? tree.k.pith : radiusAt(tree.rings[i - 1], m.a), rout = radiusAt(tree.rings[i], m.a);
  const t = m.a + v.turn, sz = Math.min(12, m.size), rb = radiusAt(tree.rings[Math.min(n - 1, m.last + 3)], m.a);
  // (Laid in the wood, not on the screen: sized and kept off the bark at true scale, then carried wherever
  // the magnifier carries its own ring, so the rings never slide past it as the slice eases in and out.)
  const s0 = restOf(v).s;
  const e0 = Math.min(0.2 * s0 * rb, (4 + 2.6 * Math.sqrt(sz)) * px * Z * TAKES[kind].knot);
  const bk = m.last + 3 >= n - 1 ? barkCss(v) * px : 0, rk = Math.max(0, Math.min((rin + rout) / 2, rb - (e0 * 2.8 + bk) / s0));
  // (Swollen or squeezed as the wood round it is.)
  const W = (r: number) => v.s * warpR(v.warp, r), Rk = W(rk), d = Math.max(1e-4, rb * 0.01);
  const grow = Math.sqrt(Math.max(0.05, (W(rk + d) - W(Math.max(0, rk - d))) / (rk + d - Math.max(0, rk - d)) / s0) * (rk > 1e-6 ? Rk / rk / s0 : 1));
  const e = e0 * Math.max(0.5, Math.min(2, grow));
  return { x: v.cx + Rk * Math.cos(t), y: v.cy - Rk * Math.sin(t), e, rot: -t + h1(m.seed) * 0.6, rings: Math.max(2, Math.min(7, Math.round(1.5 + sz / 2.5))) };
}
/** A burl's bud specks on the sheet (device px): where, how large, turned how. Steady for the tree. */
function burlEyes(m: WoodMark, v: View, Z: number): { x: number; y: number; e: number; rot: number }[] {
  const n = tree.rings.length, end = Math.min(n - 1, m.last + 3), sz = Math.min(8, m.size), spread = 0.16 + 0.02 * sz;
  const ringR = (i: number, a: number) => (i < 0 ? tree.k.pith : radiusAt(tree.rings[Math.min(n - 1, i)], a));
  const out: { x: number; y: number; e: number; rot: number }[] = [], count = Math.min(70, Math.round((8 + 7 * sz) * TAKES[kind].burl));
  for (let q = 0; q < count; q++) {
    const u1 = h1(m.seed + q * 1.37), u2 = h1(m.seed * 0.31 + q * 2.71), fa = Math.max(-1, Math.min(1, Math.sqrt(-2 * Math.log(Math.max(1e-4, u1))) * Math.cos(TAU * u2) * 0.45));
    const a = m.a + fa * spread, i = m.from + Math.floor(h1(m.seed * 0.7 + q * 3.3) * (end - m.from + 1));
    const rin = ringR(i - 1, a), rout = ringR(i, a), r = rin + (rout - rin) * (0.15 + 0.7 * h1(q * 5.1 + m.seed));
    const R = v.s * warpR(v.warp, r), t = a + v.turn;
    out.push({ x: v.cx + R * Math.cos(t), y: v.cy - R * Math.sin(t), e: (1.6 + 2.6 * h1(q * 7.7 + 1) ** 2) * px * Z, rot: h1(q * 9.1) * TAU });
  }
  return out;
}
/**
 * The printed wood pulled about, as tangled grain is: round each of a burl's bud specks, the rings part and
 * close again (each read from nearer the speck, so they bow round it), and over the whole burl a slow
 * tangling; along a knot, the trunk's rings drawn in toward the branch, bunching at its sides.
 */
function warpMarks(v: View, Z: number): void {
  const c = g.canvas as HTMLCanvasElement;
  type Eye = { x: number; y: number; e: number };
  const eyes: Eye[] = [], burls: { x0: number; y0: number; x1: number; y1: number; amp: number; seed: number }[] = [];
  const knots: { x: number; y: number; e: number }[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, r: number) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const m of marks) {
    if (m.from >= tree.rings.length) continue;
    if (m.kind === 'burl') {
      const es = burlEyes(m, v, Z);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      const amp = (1.2 + 0.5 * Math.min(8, m.size)) * px * Z;
      for (const e of es) { eyes.push({ x: e.x, y: e.y, e: e.e }); grow(e.x, e.y, Math.max(e.e * 6, amp * 9)); bx0 = Math.min(bx0, e.x); by0 = Math.min(by0, e.y); bx1 = Math.max(bx1, e.x); by1 = Math.max(by1, e.y); }
      burls.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, amp, seed: m.seed });
    } else {
      const k = knotSpot(m, v, Z);
      grow(k.x, k.y, k.e * 7); knots.push({ x: k.x, y: k.y, e: k.e });
    }
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(c.width, Math.ceil(x1)); y1 = Math.min(c.height, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 2 || h <= 2) return;
  const last = tree.rings[tree.rings.length - 1];
  // (On the graphics chip, where there is one: the same pulling about, every pixel at once, never read back.)
  if (gpu.ready()) {
    const EB = 720, edge = new Float32Array(EB);
    for (let b = 0; b < EB; b++) edge[b] = v.s * warpR(v.warp, radiusAt(last, (b / EB) * TAU));
    const E = new Float32Array(Math.max(1, eyes.length * 3)), Kn = new Float32Array(Math.max(1, knots.length * 3)), B = new Float32Array(Math.max(1, burls.length * 6));
    eyes.forEach((e, i) => E.set([e.x, e.y, e.e], i * 3)); knots.forEach((k, i) => Kn.set([k.x, k.y, k.e], i * 3));
    burls.forEach((b, i) => B.set([b.x0, b.y0, b.x1, b.y1, b.amp, b.seed], i * 6));
    const pic = gpu.run('warp', w, h, { uSx0: x0, uSy0: y0, uRw: w, uRh: h, uNE: eyes.length, uNK: knots.length, uNB: burls.length, uEB: EB },
      { uH: h, uCx: v.cx, uCy: v.cy, uCt: Math.cos(v.turn), uSt: Math.sin(v.turn), uTurn: v.turn, uUnit: px * Z, uKeep: 16 * px * Z },
      { uNoise: { key: NOISE, data: () => NOISE }, uEyes: { name: 'eyes', data: E }, uKnots: { name: 'knots', data: Kn }, uBurls: { name: 'burls', data: B }, uEdge: { name: 'edge', data: edge } }, c);
    if (pic) {
      const cx = c.getContext('2d')!;
      cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(x0, y0, w, h); gpu.lay(cx, pic, x0, y0); cx.restore();
      return;
    }
  }
  const ctx = c.getContext('2d')!, src = ctx.getImageData(x0, y0, w, h), out = ctx.createImageData(w, h), s = src.data, d = out.data;
  // (Never at the bark: the slice's own edge stays where it is, and the bark round it.)
  const edgeAt = (X: number, Y: number) => {
    const t = Math.atan2(v.cy - Y, X - v.cx) - v.turn;
    return v.s * warpR(v.warp, radiusAt(last, ((t % TAU) + TAU) % TAU));
  };
  const pick = (x: number, y: number, k: number) => {
    // (Bilinear, inside the piece read.)
    x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y));
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i00 = (yi * w + xi) * 4;
    for (let ch = 0; ch < 4; ch++) {
      const a = s[i00 + ch], b = s[i00 + 4 + ch], cc = s[i00 + w * 4 + ch], e = s[i00 + w * 4 + 4 + ch];
      d[k + ch] = a + (b - a) * fx + (cc - a) * fy + (a - b - cc + e) * fx * fy;
    }
  };
  // (The tangle is the wood's own: read where the point lies in the slice, turned with it and in its units,
  // never where it falls on the screen, so looking closer or moving it about never changes it.)
  const unit = px * Z, ct = Math.cos(v.turn), st = Math.sin(v.turn);
  // (Each row only minds the specks near enough to it to matter.)
  const reachOf = (e: Eye) => e.e * 2.2 * 2.5;
  let near: Eye[] = [];
  for (let y = 0; y < h; y++) {
    const Yr = y + y0;
    near = eyes.filter((e) => Math.abs(e.y - Yr) <= reachOf(e));
    for (let x = 0; x < w; x++) {
      const X = x + x0, Y = y + y0;
      let sx = X, sy = Y;
      for (const b of burls) {
        // (The tangle: a slow wander of the grain, fading out beyond the burl.)
        const dx = Math.max(b.x0 - X, 0, X - b.x1), dy = Math.max(b.y0 - Y, 0, Y - b.y1), fade = Math.exp(-((Math.hypot(dx, dy) / (b.amp * 4)) ** 2));
        if (fade < 0.02) continue;
        const lx = (X - v.cx) / unit, ly = (v.cy - Y) / unit, wx = lx * ct + ly * st, wy = -lx * st + ly * ct, L = unit / (b.amp * 3.5);
        const nx = (vnoise(wx * L + b.seed * 0.001, wy * L) - 0.5) * 2, ny = (vnoise(wx * L + 37.1, wy * L + b.seed * 0.001) - 0.5) * 2, k = fade * b.amp * 1.6;
        sx += k * (nx * ct - ny * st); sy -= k * (nx * st + ny * ct);
      }
      for (const e of near) {
        const dx = X - e.x, dy = Y - e.y, dd = Math.hypot(dx, dy) || 1e-3, R = e.e * 2.2;
        if (dd > R * 2.5) continue;
        // (Read from nearer the speck: the rings bow out round it.)
        const pull = Math.min(0.85 * dd, R * Math.exp(-((dd / R) ** 2)));
        sx -= (dx / dd) * pull; sy -= (dy / dd) * pull;
      }
      for (const k of knots) {
        // (The trunk's rings swept round the branch: read from nearer it, so they part and close round it in
        // wide smooth curves.)
        const dx = X - k.x, dy = Y - k.y, dd = Math.hypot(dx, dy) || 1e-3, R = k.e * 1.5;
        if (dd > R * 3) continue;
        const pull = Math.min(0.7 * dd, R * Math.exp(-((dd / (R * 1.1)) ** 2)));
        sx -= (dx / dd) * pull; sy -= (dy / dd) * pull;
      }
      if (sx !== X || sy !== Y) {
        const r = Math.hypot(X - v.cx, Y - v.cy), keep = smooth((edgeAt(X, Y) - r) / (16 * px * Z));
        sx = X + (sx - X) * keep; sy = Y + (sy - Y) * keep;
      }
      pick(sx - x0, sy - y0, (y * w + x) * 4);
    }
  }
  ctx.putImageData(out, x0, y0);
}
/** While drawing: the knot or burl forming under the brush, at once (pressed into the wood when the ring closes). */
function drawPendingMarks(v: View, t: number): void {
  for (const p of pendingMarks) {
    const k = smooth((t - p.at) / 0.4);
    if (p.kind === 'knot') {
      // (A dark eye gathering under the brush, its own tight ring round it.)
      const [x, y] = at(v, p.a, p.r), e = (2 + 2.4 * Math.min(1, p.grow)) * px * k, rot = -(p.a + v.turn);
      g.beginPath(); g.ellipse(x, y, e, e * 0.78, rot, 0, TAU); g.fillStyle = ink(0.92); g.fill();
      g.beginPath(); g.ellipse(x, y, e * 0.55, e * 0.42, rot, 0, TAU); g.strokeStyle = 'rgba(247, 243, 235,0.5)'; g.lineWidth = 0.5 * px; g.stroke();
    } else {
      for (let q = 0; q < 8 + Math.round(5 * p.grow); q++) {
        const da = (h1(q * 1.9 + p.at) - 0.5) * 0.16, dr = (h1(q * 3.7 + p.at) - 0.5) * 0.5 * tree.wRef, [ex, ey] = at(v, p.a + da, p.r + dr);
        const e = (0.5 + 0.7 * h1(q * 5.3)) * px * k;
        g.beginPath(); g.arc(ex, ey, e * 2.2, 0, TAU); g.strokeStyle = 'rgba(247, 243, 235,0.4)'; g.lineWidth = 0.45 * px; g.stroke();
        g.beginPath(); g.arc(ex, ey, e, 0, TAU); g.fillStyle = ink(0.92); g.fill();
      }
    }
  }
}
/** How damp today's tree's ground is (by the grove's stream, its years a little wider). */
function dampHere(): number {
  if (!GROWN || !canPull()) return 0;
  const me = worldOf().trees.find((t) => t.i === -1);
  return me ? moistAt(me.wx, me.wy) : 0;
}
/**
 * A young tree's vigour (a share of its years' width): its first year or two a little narrow, as a
 * seedling establishes; then its widest, easing down over its first weeks to its own (the narrowing after
 * that is the wood spread round an ever wider trunk).
 */
const youth = (n: number) => (0.72 + 0.28 * smooth(n / 2.5)) * (1 + 0.32 * Math.exp(-Math.max(0, n - 2) / 9));
/**
 * A tree evens out its lumps, slowly: where it's short of round, a year a little wider (in proportion to
 * how far short, of the whole radius: never so strong that the swells below can't build a lobe).
 */
const evenUp = (a: number) => (0.8 * SPEC[kind].even * (tree.radius - radiusAt((i) => tree.inner(i), a))) / Math.max(1e-3, tree.radius);
/** How the tree itself grows round its girth, besides the hand (see `growing.ts`), and its lean. */
/** How lobed each wood grows (its bulges, besides its lean and swells). */
const LOBES: Partial<Record<Kind, number>> = { olive: 2.2, juniper: 1.6, bristlecone: 1.1, cherry: 0.35, maple: 0.3 };
const growth = (a: number, n = tree.rings.length) => Math.pow(growthOf(tree.seed, a, n), SPEC[kind].amp) * lobes(tree.seed, a, n, LOBES[kind] ?? 0) * SPEC[kind].width * alive(a, n) * leanOf(a, n) * fluteOf(a, n);
/**
 * A tree is never grown evenly round: it leans, or the light comes from one side, and year after year it lays
 * more wood on that side than the other, so its heart sits off the middle, the years wide on one side and close
 * on the other. Its own side, from its seed, drifting a little over the years; the first dozen years even (a
 * sapling's core is near its middle), gathering over the next sixty or so, then a third to two-thirds again as wide on the one side as the other. (`lean`, below, is
 * the first game's.)
 */
/**
 * A juniper's trunk is fluted: it lays its wood in lobes, a few to five round it, each its own size, the bays
 * between them deepening as it ages; so its outline is never a circle. Every other wood, 1.
 */
const fluteOf = (a: number, n: number) => {
  if (kind !== 'juniper') return 1;
  const s0 = tree.seed * 0.0193, deep = 0.6 * smooth((n - 6) / 70);
  let e = 0;
  for (let m = 3; m <= 6; m++) e += (0.55 + 0.9 * h1(s0 + m)) / (m - 1.5) * Math.cos(m * (a - h1(s0 * 2 + m) * TAU) + 0.3 * Math.sin(n / 60 + m));
  return Math.exp(deep * e);
};
const leanOf = (a: number, n: number) => {
  const side = h1(tree.seed * 0.0417) * TAU + 0.5 * Math.sin(n / 90 + tree.seed), k = (0.12 + 0.12 * h1(tree.seed * 0.29)) * smooth((n - 12) / 60);
  return Math.exp(k * Math.cos(a - side));
};
/**
 * The bristlecone, old, lives on in a strip: from its thirtieth year or so, a side of it dies back, its
 * bark gone, and grows on no more, the dead sector widening slowly; the rest grows on round it (1 where
 * it's alive, a tenth where it isn't). Every other tree, 1.
 */
function alive(a: number, n = tree.rings.length): number {
  if (kind !== 'bristlecone' || n < 30) return 1;
  const at = ((Math.sin(tree.seed * 0.37) * 43758.5453) % 1 + 1) % 1 * TAU, half = 0.3 + 1.1 * smooth((n - 30) / 170);
  const d = Math.abs(((a - at + Math.PI) % TAU + TAU) % TAU - Math.PI);
  return 1 - 0.9 * smooth((half - d) / 0.25) * smooth((n - 30) / 10);
}
/**
 * A tree grows a little more on one side (toward the light, or downhill), year after year, so its heart
 * comes to sit off the middle: each ring a sixth wider on that side and as much narrower on the other.
 * The side is the tree's own (from its seed).
 */
const ECCENTRIC = 0.16;
function lean(a: number): number {
  const side = (Math.sin(tree.seed * 12.9898) * 43758.5453) % 1 * TAU;
  return 1 + ECCENTRIC * Math.cos(a - side);
}
const DIARY = 'diary', params = new URLSearchParams(location.search);
/**
 * The kind of tree, which decides how its wood prints and how it grows (a tree keeps its kind; `?tree=ash`
 * and so on plants that kind when a tree is begun). Three families of wood:
 *   ring     ring-porous (oak, ash): each year opens with a row of large pores (oak's broad rays too)
 *   diffuse  diffuse-porous (cherry, maple, birch, olive): fine pores scattered evenly through the year,
 *            each year marked only by a thin line, the real wood's fibre in the ink
 *   conifer  (pine, redwood, bristlecone): no pores; each year's latewood a crisp dark band, resin canals
 *            in it as dark dots (not the redwood's: it has none)
 * And each its own bark, and its own way of growing: the olive gnarled and lopsided, the bristlecone's
 * years very fine and, once it's old, dying back to a strip of living bark; the redwood broad and even.
 */
type Bark = { lumps: number; plate: boolean; mean: number; deep: [number, number, number]; wide: number } | 'papery';
const FISSURED: Bark = { lumps: 140, plate: false, mean: 7, deep: [0.15, 0.8, 1.5], wide: 1 };
const PLATES: Bark = { lumps: 70, plate: true, mean: 13, deep: [0.1, 0.25, 1], wide: 1.4 };
const SPEC: Record<Kind, {
  family: 'ring' | 'diffuse' | 'conifer'; bark: Bark; barkCss: [number, number, number];
  /** How strongly its own swells show (a power of them), its years' width, how much it evens out. */
  amp: number; width: number; even: number;
  /** Its years' lines and tone, drawn (diffuse and conifer). */
  line: number; tone: number; resin: boolean;
}> = {
  oak: { family: 'ring', bark: FISSURED, barkCss: [3, 0.045, 9], amp: 1.1, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  ash: { family: 'ring', bark: { ...FISSURED, mean: 5, deep: [0.25, 0.6, 1] }, barkCss: [2.5, 0.04, 8], amp: 1, width: 1.05, even: 1, line: 0.85, tone: 1, resin: false },
  cherry: { family: 'diffuse', bark: { ...PLATES, lumps: 90, mean: 10 }, barkCss: [2, 0.03, 6], amp: 1.25, width: 0.9, even: 1, line: 0.85, tone: 1, resin: false },
  maple: { family: 'diffuse', bark: { ...FISSURED, lumps: 120, mean: 9, deep: [0.1, 0.5, 1.5] }, barkCss: [2.5, 0.035, 7], amp: 1.15, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  birch: { family: 'diffuse', bark: 'papery', barkCss: [1.6, 0.02, 3.5], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  pine: { family: 'conifer', bark: PLATES, barkCss: [3.5, 0.055, 11], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: true },
  redwood: { family: 'conifer', bark: { lumps: 220, plate: false, mean: 4, deep: [0.3, 0.6, 1], wide: 0.7 }, barkCss: [5, 0.08, 16], amp: 0.7, width: 1.3, even: 1.2, line: 0.85, tone: 1, resin: false },
  bristlecone: { family: 'conifer', bark: { ...PLATES, lumps: 60, mean: 15 }, barkCss: [2, 0.03, 6], amp: 2.5, width: 0.45, even: 0.3, line: 0.85, tone: 1, resin: true },
  olive: { family: 'diffuse', bark: { lumps: 160, plate: false, mean: 11, deep: [0.1, 0.4, 1], wide: 1 }, barkCss: [1.5, 0.02, 4], amp: 2.4, width: 0.8, even: 0.15, line: 0.85, tone: 1, resin: false },
  // Douglas fir: wide years when young, each a pale earlywood ending in a sharp, very dark latewood; a thick,
  // corky bark, deeply furrowed.
  fir: { family: 'conifer', bark: { lumps: 110, plate: false, mean: 6, deep: [0.35, 0.9, 1.6], wide: 1.2 }, barkCss: [4.5, 0.07, 15], amp: 0.9, width: 1.15, even: 1, line: 0.85, tone: 1, resin: true },
  // Juniper: close, fine years, uneven round it, the trunk fluted into lobes; a thin bark in long shreds.
  juniper: { family: 'conifer', bark: { lumps: 260, plate: false, mean: 3, deep: [0.2, 0.5, 0.9], wide: 0.5 }, barkCss: [1.6, 0.02, 4], amp: 2.3, width: 0.6, even: 0.25, line: 0.85, tone: 1, resin: false },
};
const KINDS = Object.keys(SPEC) as Kind[];
/** (Each wood answers the same loop its own way, never said: found by drawing.) */
/** How smoothly the hand's line becomes the ring (the low-pass round it): the olive's, hardly at all. */
const SMOOTH: Partial<Record<Kind, number>> = { olive: (3.5 * Math.PI) / 180 };
/** How calmly ring i was drawn, 0 hurried to 1 unhurried (its tone, as the tree kept it). */
function calmOf(i: number): number {
  const t = tree.tones[i];
  if (!t || !t.length) return 0.5;
  let s = 0;
  for (let j = 0; j < t.length; j++) s += t[j];
  return s / t.length;
}
const fam = () => SPEC[kind].family;
const asKind = (k: unknown): Kind | null => (KINDS.includes(k as Kind) ? (k as Kind) : null);
let kind: Kind = asKind(params.get('tree')) ?? 'oak';
let tree = new TreeSim(Number(params.get('seed')) || 1 + Math.floor(Math.random() * 1e6), DAILY);
/** The day each ring was drawn (local, as 2026-10-11). */
let days: string[] = [];

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
function demoYear(count = 365, start = (() => { const d = new Date(); d.setDate(d.getDate() - count); return d; })()): void {
  let time = 0, rnd = tree.seed;
  const r = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let n = 0; n < count; n++) {
    if (r() < 0.12) continue; // (some days missed)
    const day = new Date(start); day.setDate(start.getDate() + n);
    const width = 0.6 + 1.6 * r() ** 1.5, wob = 0.15 + 0.5 * r(), ph = r() * TAU;
    // (A person draws a round circle about the slice, at the day's distance, not the bark's shape again.)
    const R = (b: number) => tree.radius + width * tree.wRef * lean(b), u = GROWN
      // (Growing true to scale, the loop's looseness is the year's width wherever it's drawn, the tree's
      // own swells on it, eased a little toward round.)
      ? (b: number) => Math.max(LEAST, width * growth(b) * climate(tree.seed, tree.rings.length) * youth(tree.rings.length) * (1 + 0.3 * wob * Math.sin(2 * b + ph)) + evenUp(b))
      : (b: number) => Math.max(0.1, (R(b) - radiusAt((i) => tree.inner(i), b)) / tree.wRef + wob * Math.sin(2 * b + ph));
    let a = r() * TAU;
    tree.begin(time, a, u(a));
    while (tree.stroke) { a += TAU / 5 / 60; time += 1 / 60; tree.move(time, a % TAU, u(a % TAU)); }
    days.push(dayOf(day)); time += 2;
  }
  tree.news.length = 0;
}

/** The kept tree, if there is one (`?fresh` begins another). */
async function recall(): Promise<void> {
  // (`?knots=6`: so many knots grown into the demo's years, to look at.)
  // (`?burls=2`: so many burls, the same way.)
  if (params.has('demo') && params.has('burls')) {
    const n = Math.max(1, Number(params.get('demo')) || 365), q = Number(params.get('burls')) || 2;
    for (let j = 0; j < q; j++) { const from = Math.floor(n * (0.2 + 0.5 * h1(j * 4.3 + 1))); marks.push({ kind: 'burl', a: h1(j * 5.1 + 2) * TAU, from, last: from + 2 + Math.floor(6 * h1(j * 2.2)), size: 2 + 5 * h1(j * 6.7), seed: 3000 + j * 6007 }); }
  }
  if (params.has('demo') && params.has('knots')) {
    const n = Math.max(1, Number(params.get('demo')) || 365), q = Number(params.get('knots')) || 5;
    for (let j = 0; j < q; j++) { const from = Math.floor(n * (0.15 + 0.6 * h1(j * 3.1))); marks.push({ kind: 'knot', a: h1(j * 7.7) * TAU, from, last: from + 1 + Math.floor(5 * h1(j * 1.3)), size: 1 + 6 * h1(j * 5.9), seed: 1000 + j * 7919 }); }
  }
  if (params.has('demo')) { demoYear(Math.max(1, Number(params.get('demo')) || 365)); seedAt = tree.rings.length ? [0.5, 0.47] : null; return; }
  if (params.has('fresh')) return;
  const k = await recallTree(DIARY), t = k && treeFrom(k, DAILY);
  // (A tree kept that can't be read back: set aside whole, never written over by a new one; said once it's open.)
  if (k && !t) { const ok = await setAside(k, 'unreadable'); dataNote = ok ? 'Your tree couldn’t be opened. It’s kept safe, set aside, and a new one begins.' : 'Your tree couldn’t be opened.'; if (!ok) noSave = true; return; }
  if (!k || !t) return;
  tree = t; days = (k.days ?? []).slice(0, t.rings.length); kind = asKind(k.tree) ?? 'oak'; marks = (k.marks ?? []).map((m) => ({ ...m })); herePlace = k.place ?? null;
  seedAt = k.at ?? (t.rings.length ? [0.5, 0.47] : null);
  while (days.length < t.rings.length) days.unshift(days[0] ?? dayOf());
  // (The practice: a year from its first ring, the tree is finished, and stands in the grove.)
  // (Only once it's truly standing there (read back) is it let go of here, and a copy of it set aside as well;
  // if it can't be stood there now, it stays as it is, to be tried again next time.)
  if (GROWN && days.length && dayOf() >= yearOn(days[0])) {
    const year = kept();
    if (await keepInGrove(year)) {
      await setAside(year, 'year');
      finishedYear = true; tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; seedAt = null; marks = []; herePlace = null; keep();
    } else dataNote = 'This year’s tree couldn’t be stood in the grove just now. It’s kept as it is, and will be tried again next time.';
  }
}
/** Something about the kept trees to say once the sheet is open; and whether keeping has failed (so it's not tried over what's there). */
let dataNote = '', noSave = false, saveWarned = false;
/** A day a year on from the given one (as 2027-10-14). */
const yearOn = (d: string) => { const x = dayDate(d); x.setFullYear(x.getFullYear() + 1); return dayOf(x); };
/** Whether, opening, a year's tree was found finished (and stood in the grove). */
let finishedYear = false;
function keep(): void {
  // (`?fresh`, to try a new tree, keeps nothing: never written over the tree that's kept.)
  if (params.has('demo') || params.has('fresh') || visit || parting || noSave) return;
  void keepTree(kept(), DIARY).then((ok) => {
    if (!ok && !saveWarned) { saveWarned = true; say('Your ring couldn’t be saved on this phone just now. Keep a copy from the grove to be safe.', 10); }
  });
}
/** The tree as kept (and as a copy is kept). */
function kept(): KeptTree {
  return { v: 1, tree: kind, seed: tree.seed, wander: false, turn: 0, sim: snapshotTree(tree), days: days.slice(), ...(seedAt ? { at: seedAt } : {}), ...(marks.length ? { marks: marks.map((m) => ({ ...m })) } : {}), ...(herePlace ? { place: herePlace } : {}) };
}

/**
 * The slice on the screen. After each ring it draws back slowly to make room for the next (`ease`, over a
 * few seconds, from where the new bark was drawn to where it fits), never in a jump; a touch while it's
 * drawing back stops it where it is.
 */
let ease: { from: number; at: number } | null = null;
const EASE = SLOW_T, EASE_GROWN = SLOW_T;
/** Where the seed was planted (shares of the sheet), if it has been (the practice, printed). */
let seedAt: [number, number] | null = null;
/** The fisheye for the tree now (none where the tree grows true to scale). */
const warpNow = (): Warp => (GROWN ? { ...warpFor(tree), beta: 0 } : warpFor(tree));
/** The room the slice has (device px of radius). */
const roomNow = () => Math.max(40 * px, Math.min(W / 2 - 34 * px, H * 0.27));
/** The outermost the bark reaches (mm). */
/** The scale the seed is shown at, its first loop the bark's size: the same for every wood (a fresh tree's). */
let seedScaleOf = { key: '', s: 1 };
function seedScale(): number {
  // (So that a steady day's ring, a fresh tree's, is as wide on the sheet as the loop that drew it: the
  // first rings are where the hand put them, each a little larger round the last, until the bark fills
  // its room.)
  const key = `${tree.seed}|${W}|${H}|${px}`;
  if (seedScaleOf.key !== key) { const t = new TreeSim(tree.seed, DAILY); seedScaleOf = { key, s: Math.min((SEED_K * STEADY * px) / t.wRef, (BARK * roomNow()) / (t.k.pith + t.wRef)) }; }
  return seedScaleOf.s;
}
/**
 * How wide a young tree's ring is on the sheet, of the loop that draws it: some two-fifths, each year laid
 * a little way inside the loop and a little larger round the last, so the tree grows out for a week or so
 * before its bark fills the room.
 */
const SEED_K = 0.4;
/** The scale that fits the bark to its room (the seed's first loop, before any ring). */
function fitScale(): number {
  const room = roomNow();
  // (Its widest never past seven-tenths of the room, so there's always room round it to draw the loop,
  // well inside the screen's edge.)
  return tree.rings.length ? Math.min((BARK * room) / (0.25 * barkMax() + 0.75 * barkMean()), (0.7 * room) / barkMax()) : (BARK * room) / (barkMax() + tree.wRef);
}
function barkMean(): number {
  const last = tree.rings[tree.rings.length - 1];
  if (!last) return tree.k.pith;
  let r = 0;
  for (let i = 0; i < K; i++) r += last[i];
  return r / K;
}
function barkMax(): number {
  const last = tree.rings[tree.rings.length - 1];
  let r = tree.k.pith;
  if (last) for (let i = 0; i < K; i++) r = Math.max(r, last[i]);
  return r;
}
function baseNow(t = clock()): View {
  if (!view && GROWN) {
    // The bark and the year to come always the same size, in the middle of the sheet, a little high: the
    // day's loop the same size round it every day, and the year it makes growing out to the same place.
    // (From the first ring on, the bark exactly that size, every day, so the loop is drawn in the same
    // place every day; the years before tighten in toward the heart. Before it, the seed in the middle,
    // the first loop drawn the same distance out.)
    // (Never closer than the seed was shown: the young tree grows out on the sheet, day by day, until its
    // bark reaches that size; only then does the view draw back, never in and then out again.)
    // (Fitted mostly to the bark's mean, a quarter to its widest: a lumpy wood, an olive's, a bristlecone's,
    // never looks to shrink as its lobes grow; its widest never past nine-tenths of the room.)
    const s = Math.min(seedScale(), fitScale());
    view = { cx: W / 2, cy: Math.round(H * 0.47), s, turn: 0, px, warp: undefined };
    ease = null;
  }
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
  // (Growing true to scale, the room is made so slowly, over a minute and a half, that it's never seen happen.)
  const k = smooth((t - ease.at) / (GROWN ? EASE_GROWN : EASE));
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
    const p = smooth((t - lookBack.at) / QUICK);
    look = { k: lookBack.k + (1 - lookBack.k) * p, ox: lookBack.ox * (1 - p), oy: lookBack.oy * (1 - p) };
    if (p >= 1) { lookBack = null; look = { k: 1, ox: 0, oy: 0 }; }
  }
  if (look.k === 1 && !look.ox && !look.oy) return v;
  return { ...v, s: v.s * look.k, cx: v.cx + look.ox, cy: v.cy + look.oy };
}
/** Zoom by f about the point (x, y) (device px). */
/** How close one may look: three times; growing true to scale, until a year is some 12 px across. */
function closest(): number {
  if (!GROWN || !tree.rings.length) return 3;
  const n = tree.rings.length, year = (baseNow().s * (meanR(n - 1) - meanR(-1))) / n;
  return Math.max(3, Math.min(60, (12 * px) / Math.max(1e-3, year)));
}
function zoomAbout(x: number, y: number, f: number): void {
  // (Drawn back past the slice as it is: toward the grove, slowly, a pinch to a quarter or so.)
  if (far >= 1 && !farTo && (f > 1 || groveCam)) { zoomGrove(x, y, f); return; }
  // (Choosing a new seed, and drawn back: not yet, after all; the tree as it was, and back to the grove.)
  if (parting && f < 1 && !closer()) unpart();
  if (canPull() && (far > 0 || (!closer() && f < 1))) {
    farTo = null; farPull = Math.max(0, Math.min(1, farPull - Math.log(f) / 1.4)); far = farPull;
    if (far >= 1) tellGrove();
    return;
  }
  const v = viewNow(), k = Math.max(1, Math.min(closest(), look.k * f)), g2 = k / look.k, b = baseNow();
  const cx = x + (v.cx - x) * g2, cy = y + (v.cy - y) * g2;
  look = k <= 1.001 ? { k: 1, ox: 0, oy: 0 } : { k, ox: cx - b.cx, oy: cy - b.cy };
  lookBack = null;
  // (Said only the first few times ever: after that, it's known.)
  if (closer() && !hintedCloser) {
    hintedCloser = true;
    let n = 0; try { n = Number(localStorage.getItem('annulus.hintedCloser') || 0); localStorage.setItem('annulus.hintedCloser', String(n + 1)); } catch { /* not kept */ }
    if (n < 3) say('Double-tap to zoom out.', 3);
  }
}
let hintedCloser = false;
/** The ring closed: the slice laid out for the tree as it is now, eased to from where it was. */
/** Whether the slice at scale `s` reaches past its room: its widest past seven-tenths of it, as it's fitted (see fitScale). */
const tooWide = (s: number) => s * barkMax() > 0.7 * roomNow() + 0.5 * px;
function makeRoom(): void {
  const was = baseNow(), old = warp, bark = tree.radius;
  warp = warpNow(); if (!PRINT) paper.fit(warp, warp.R); view = null;
  const v = baseNow();
  // (Growing true to scale, the slice never steps back while it's looked at: the year grows out at the bark and
  // stays, the print and every mark in it as it was. It's fitted to its room again only when next opened, out
  // of sight; or here, if its widest would reach past the room it's given (see `tooWide`).)
  if (GROWN && PRINT && !tooWide(was.s)) { view = { ...v, s: was.s }; ease = null; return; }
  // (Where the new bark was drawn, it stays at first: the slice then draws back from there.)
  const from = was.s * warpR(old, bark) / Math.max(1e-6, warpR(warp, bark));
  // (Never much larger than it rests: a wide loop's year is shown a little large at first, never filling
  // the sheet.)
  ease = { from: Math.min(from, 1.3 * v.s), at: clock() };
  // (Every step back moved through, slowly, the print as it is carried with the view: a print faded into one a
  // little smaller, where it stood, doubled every line for a moment.)
}
/**
 * Looked into while the slice is still drawing back: the drawing back is finished at once, and the look
 * made that much closer, so nothing moves under the fingers, nothing goes on moving after, and looking
 * out again (a double tap) finds the slice at its own size.
 */
function holdForLook(): void {
  if (!ease) return;
  const cur = baseNow();
  ease = null; view = null;
  const fin = baseNow(), k = look.k * (cur.s / Math.max(1e-6, fin.s));
  if (k >= 1) look = { k, ox: look.ox + (cur.cx - fin.cx), oy: look.oy + (cur.cy - fin.cy) };
  else view = cur;
}
/** A touch: the slice stops drawing back, where it is. */
function holdView(): void {
  if (!ease) return;
  view = baseNow(); ease = null;
}

/** The ring just closed, blooming (a look only: the next can be begun at once). */
let settle = { ring: -1, at: 0 }, settleTap = 0;
/** When the loop drawn was closed (growing true to scale: it dries where it was drawn). */
let inward: { ring: number; at: number } | null = null;
/** The brush's track: where, when, how wide it laid (slow is wide), and how fast. */
/** (`load`: the ink left in the brush, full at first, drier round the loop; `jit`: how unevenly the hand went.) */
let trail: { a: number; r: number; t: number; w: number; fast: number; load: number; jit: number; turned: number }[] = [];
let strokeView: View | null = null, painter: number | null = null;
/** The finger's own path this stroke (CSS px): where it began, how far it has gone, and where it is. */
let loop = { x0: 0, y0: 0, x: 0, y: 0, len: 0, closed: false };

function say(text: string, fade = 10): void {
  // (Nothing to read while the hand is drawing.)
  if (painter !== null) return;
  clearTimeout(sayT); clearTimeout(swapT);
  const show = () => { if (painter !== null) return; words.classList.remove('swap'); words.textContent = text; words.classList.add('shown'); sayT = window.setTimeout(() => words.classList.remove('shown'), fade * 1000); };
  // (Other words already there: let go of first, quickly, then the new ones come; never one swapped for the other.)
  if (words.classList.contains('shown') && words.textContent && words.textContent !== text && Number(getComputedStyle(words).opacity) > 0.05) {
    words.classList.add('swap'); words.classList.remove('shown'); swapT = window.setTimeout(show, 450);
  } else show();
}
let sayT = 0, swapT = 0;
/** The words let go of, and any about to come. */
function hush(): void { clearTimeout(swapT); words.classList.remove('shown'); }

/** The fingers down (device px), a pinch in progress, and the touch that might be a tap. */
const fingers = new Map<number, { x: number; y: number }>();
let pinch: { d: number; mx: number; my: number } | null = null, pinched = false;
let tapStart = { x: 0, y: 0, at: 0 }, lastTap = 0, lastFingerAt = 0;
const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };

/** Whether this touch came down on the slice (a tap there reads its day). */
let inside = false, holdTimer = 0;
canvas.addEventListener('pointerdown', (e) => {
  // (The opening, touched: let go of at once.)
  if (intro) { if (!intro.skip) intro.skip = clock(); return; }
  lastFingerAt = clock();
  canvas.setPointerCapture(e.pointerId);
  if (fingers.size === 0) inside = false;
  fingers.set(e.pointerId, { x: e.clientX * px, y: e.clientY * px });
  if (fingers.size === 1) { tapStart = { x: e.clientX, y: e.clientY, at: clock() }; pinched = false; }
  if (fingers.size === 2) {
    // A second finger: a pinch, not a ring (the line begun is let go).
    if (painter !== null) { tree.cancel(); trail = []; painter = null; }
    holdForLook(); pinch = spread(); pinched = true;
    return;
  }
  if (fingers.size > 2 || painter !== null) return;
  // (In the grove, a finger drawn across it is a breeze: at once, seen whole; looked into, held still a moment
  // first, since moved at once it moves the view.)
  breezeHand = far >= 1 && !farTo && !visit && fingers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, at: clock(), on: false, last: null } : null;
  // (Looked at closely: a finger moves the slice about, or taps; nothing is drawn. And on a bare sheet, a
  // tap plants the seed: see the tap, below.)
  if (tree.rings.length && brushAt(tree, viewNow(), 0, e.clientX * px, e.clientY * px).u < 0) inside = true;
  // (Held still on the slice a moment: its print, on a sheet of its own.)
  if (inside && fingers.size === 1 && !tree.stroke && painter === null && far === 0) {
    clearTimeout(holdTimer);
    const id = e.pointerId, sx = e.clientX * px, sy = e.clientY * px;
    holdTimer = window.setTimeout(() => { const f = fingers.get(id); if (!f || fingers.size !== 1 || pinched || painter !== null || far > 0 || Math.hypot(f.x - sx, f.y - sy) > 10 * px) return; void printView.show(); }, 650);
  }
  if ((closer() && inside) || far > 0 || visit || (GROWN && !seedAt)) return;
  hush();
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
  // (Read only on a tap, when the finger lifts: a pinch or a drag begun on the slice reads nothing.)
  if (inside) return;
  const b = brushAt(tree, v, 0, ...brushPoint(v, x, y));
  strokeView = v;
  if (GROWN) { trail = []; inward = null; }
  if (tree.begin(e.timeStamp / 1000, b.a, rounded(b.a, b.u))) {
    painter = e.pointerId; if (!PRINT) paper.begin(tree); trailAt(b.a, b.u);
    loop = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, len: 0, closed: false };
    pendingMarks = []; wiggle = []; movedAt = clock(); moveX = e.clientX; moveY = e.clientY;
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastFingerAt = clock();
  const f = fingers.get(e.pointerId);
  if (f) {
    const x = e.clientX * px, y = e.clientY * px, dx = x - f.x, dy = y - f.y;
    f.x = x; f.y = y;
    if (fingers.size >= 2) breezeHand = null;
    if (breezeHand && breezeHand.id === e.pointerId && far >= 1) {
      const h = breezeHand;
      if (!h.on) {
        if (Math.hypot(e.clientX - h.x, e.clientY - h.y) < 6) return;
        // (One finger is always the breeze, looked into or not: the grove's moved about with two.)
        h.on = true;
      }
      if (breezeHand?.on) { blow(h, x, y); return; }
    }
    if (pinch && fingers.size >= 2) {
      const now = spread();
      // (In the grove, two fingers move it about, drawing it closer or not.)
      const inGrove = far >= 1 && !farTo;
      if (inGrove) { panGrove(now.mx - pinch.mx, now.my - pinch.my); pinch = { ...pinch, mx: now.mx, my: now.my }; }
      // (Only a deliberate pinch: two fingers resting, or brushing the glass, look no closer.)
      if (!closer() && Math.abs(now.d - pinch.d) < 14 * px) return;
      zoomAbout(pinch.mx, pinch.my, now.d / pinch.d);
      if (far === 0) { look.ox += now.mx - pinch.mx; look.oy += now.my - pinch.my; }
      pinch = now;
      return;
    }
    if (closer() && painter === null && fingers.size === 1) { look.ox += dx; look.oy += dy; return; }
    if (far >= 1 && painter === null && fingers.size === 1) { panGrove(dx, dy); return; }
    if (choosing() && painter === null && fingers.size === 1) { choiceTo = null; choiceDx += dx; return; }
  }
  if (e.pointerId !== painter || !strokeView) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const bp = brushPoint(strokeView, c.clientX * px, c.clientY * px), b = brushAt(tree, strokeView, 0, ...bp);
    tree.move(c.timeStamp / 1000, b.a, rounded(b.a, b.u));
    trailAt(b.a, b.u);
    if (GROWN) noteHand(c.clientX, c.clientY, b.a, clock());
    if (!tree.stroke) break;
    // The finger come back round to where it began: the circle is drawn, whatever the angle says.
    loop.len += Math.hypot(c.clientX - loop.x, c.clientY - loop.y); loop.x = c.clientX; loop.y = c.clientY;
    if (loop.len > 160 && Math.hypot(loop.x - loop.x0, loop.y - loop.y0) < Math.max(24, loop.len / 32)) {
      loop.closed = true;
      if (tree.finish(0.5)) break;
    }
  }
  hear();
});
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, (e) => {
  // (A touch that only let the opening go: nothing more.)
  if (!fingers.has(e.pointerId) && painter !== e.pointerId) return;
  fingers.delete(e.pointerId);
  if (fingers.size < 2) pinch = null;
  // (A swipe let go: on to the next, or back.)
  if (choosing() && fingers.size === 0 && Math.abs(choiceDx) > 2 * px && !choiceTo) {
    if (Math.abs(choiceDx) > W * 0.12) turnChoice(choiceDx < 0 ? 1 : -1);
    else choiceTo = { from: choiceDx, to: 0, at: clock() };
  }
  // (A breeze let go: it dies away of itself.)
  if (breezeHand && breezeHand.id === e.pointerId) { const on = breezeHand.on; breezeHand = null; if (on) return; }
  // (Let go part way back: on to the grove, or home to today.)
  if (fingers.size === 0 && far > 0 && far < 1 && !farTo) settleFar();
  if (fingers.size === 0) clearTimeout(holdTimer);
  // A tap (short, still, one finger): a double tap goes back from looking closer.
  const tap = type === 'pointerup' && !pinched && fingers.size === 0 && clock() - tapStart.at < 0.3 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 12;
  if (tap) {
    const t = clock();
    // (In the grove: a tree touched opens; today's, home.)
    if (far > 0) {
      // (A double tap on the ground, home to today.)
      if (far >= 0.99 && !farTo && t - lastTap < 0.35) { lastTap = 0; groveCam = null; farTo = { from: far, to: 0, at: t }; return; }
      lastTap = t;
      if (far >= 0.99 && !farTo) tapGrove(e.clientX * px, e.clientY * px);
      return;
    }
    // (An older tree's slice, double-tapped: back out to the grove.)
    if (visit && !closer() && t - lastTap < 0.35) { farTo = { from: 0, to: 1, at: t }; lastTap = 0; return; }
    if (closer() && t - lastTap < 0.35) { lookBack = { ...look, at: t }; lastTap = 0; return; }
    lastTap = t;
    // A tap on the slice: the ring there, and its day.
    if (inside && painter === null) { readDay(shownOf(viewNow()), e.clientX * px, e.clientY * px); return; }
    // Before the first ring, a tap plants the seed there (or moves it).
    if (GROWN && !tree.rings.length && !closer()) {
      if (painter === e.pointerId) { tree.cancel(); trail = []; painter = null; }
      // (On a bare sheet: the seed tapped is the tree; tapped again before the first ring, it changes.)
      const v = viewNow(), x = e.clientX * px, y = e.clientY * px;
      // (The slice shown, touched: its seed. A touch either side of it turns to the next.)
      if (!seedAt) {
        if (Math.abs(choiceDx) > 2 * px || choiceTo) return;
        const D = sliceD();
        if (Math.hypot(x - v.cx, y - v.cy) > D / 2) { if (y > v.cy - D / 2 && y < v.cy + D / 2 + 80 * px) turnChoice(x < v.cx ? -1 : 1); return; }
        kind = SEEDS[choice]; folding = { sp: kind };
      }
      plant(W / 2, H * 0.47);
      return;
    }
  }
  if (e.pointerId !== painter) return;
  painter = null;
  // Let go most of the way round, the ring is closed for you; earlier, the line rests, to be taken up.
  if (tree.finish(0.8)) hear();
  // (A whole loop drawn, but not round the slice: let go, and said where, once the hand is off.)
  else if (loop.closed && tree.stroke) { tree.cancel(); say(GROWN ? (tree.rings.length ? 'Draw your loop around the tree.' : 'Draw your loop around the seed.') : 'Draw around the circle.', 4); }
  else { tree.lift(); restAt = clock(); }
});
// (On a computer, the wheel looks closer about the pointer.)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (painter !== null) return;
  holdForLook(); zoomAbout(e.clientX * px, e.clientY * px, Math.exp(-e.deltaY * 0.002));
  clearTimeout(wheelT); wheelT = window.setTimeout(() => { if (far > 0 && far < 1 && fingers.size === 0 && !farTo) settleFar(); }, 220);
}, { passive: false });
let wheelT = 0;
// (On a computer, the arrow keys turn through the woods.)
window.addEventListener('keydown', (e) => { if (choosing() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) turnChoice(e.key === 'ArrowLeft' ? -1 : 1); });
/** When the line was let go to rest (a line left resting a while fades away: no stray marks). */
let restAt = 0;

/**
 * A breath, in the paper (the practice only): left still a few seconds, a faint shade round the bark swells
 * and ebbs at six breaths a minute, four seconds in and six out (slow breathing, the out-breath long, is what
 * calms); a touch, and it's gone. Never a word about it but once.
 */
const BREATH = PRINT && GROWN, IN = 4, OUT = 6;
let breathShown = 0, stillSince = 0, breathNow = 0;
/** Where in the breath it is now, 0 (out) to 1 (in), and how present the breath is (0 to 1). */
function breathe(t: number, dt: number): void {
  // (Never while looked into: so near, its swell would be a pumping of the lines.)
  const still = BREATH && fingers.size === 0 && !tree.stroke && settle.ring < 0 && !lookBack && !closer() && tree.rings.length > 0;
  // (Its own stillness: the slice slowly making room doesn't count; a finger, a ring growing, does.)
  if (!still) stillSince = t;
  breathShown = still && t - stillSince > 3 ? Math.min(1, breathShown + dt / 3) : Math.max(0, breathShown - dt / 0.25);
  // (In: eased swell; out: a long, slow ebb.)
  const c = (t - stillSince - 3) % (IN + OUT);
  breathNow = c < IN ? smooth(c / IN) : 1 - smooth((c - IN) / OUT);
  // (It breathes without being told: the slice says it.)
}
// (The slice itself never swells: a sharp print redrawn a hair larger or smaller each frame shimmers. The breath
// is a soft shade in the paper round its bark, widening and ebbing.)
const breathGrow = () => 1;
function drawBreath(v: View): void {
  if (breathShown < 0.01 || !tree.rings.length) return;
  // (Barely there: a shade in the paper just outside the bark, a few px, widening a little with the in-breath.)
  const w = (2 + 4 * breathNow) * px;
  g.save(); g.lineJoin = 'round';
  for (const [k, al] of [[1, 0.008], [0.5, 0.01]]) {
    g.strokeStyle = `rgba(46,33,24,${(al * breathShown).toFixed(3)})`; g.lineWidth = 2 * w * k;
    ringPath(v, barkOf(tree.rings.length - 1), barkCss(v) * 1.6 + (w * k) / px); g.stroke();
  }
  g.restore();
}
/**
 * The press's own mark: the paper pushed down under the block, a faint rim along the print's own edge, lit
 * from the upper left as the sheet is (see `markOf`). Always there once a year is in; away while one's being
 * drawn or growing, so it's never where the bark isn't. (The breath is the slice's own slight swell, nothing
 * round it.)
 */
let pressShown = 0;
function drawPressMark(_v: View, _t: number, dt: number): void {
  const away = !tree.rings.length || !!tree.stroke || settle.ring >= 0 || far > 0;
  pressShown = away ? Math.max(0, pressShown - dt / 0.25) : Math.min(1, pressShown + dt / 1.2);
}

/**
 * A seed, in ink, as a naturalist's plate draws one, `k` of its full size (fading in), at (x, y): an acorn
 * in its cup; an ash's key, one long paddle; a cherry on its stalk; a maple's pair of keys; a birch's seed,
 * tiny, between two round wings; a pine's on its long thin wing; a redwood's small round cone; a
 * bristlecone's, its scales tipped with prickles; an olive, with a leaf.
 */
/**
 * The seeds as printed: each a figure cut whole from a real plate (Faxon's, for Sargent's Silva of North
 * America; the olive Le Maout and Decaisne's) and pressed as the slices are (scripts/wood/seeds-press.py;
 * src/rings/seeds/). Each is shown at the one size (an acorn's), whatever its true size, so every tree
 * begins alike, a long one never longer than a share more (`ART_H` keeps only the names); until one has
 * loaded, its seed is drawn as below.
 */
const ART_H: Partial<Record<Kind, number>> = { oak: 84, ash: 112, cherry: 62, maple: 92, birch: 52, pine: 64, redwood: 72, bristlecone: 118, olive: 66, fir: 96, juniper: 60 };
const SEED_ART: Partial<Record<Kind, HTMLImageElement>> = {};
for (const sp of Object.keys(ART_H) as Kind[]) {
  const im = new Image();
  im.onload = () => { SEED_ART[sp] = im; };
  im.src = new URL(`./seeds/${sp}.png`, import.meta.url).href;
}
const TILT: Record<Kind, number> = { oak: -0.25, ash: 0.45, cherry: 0.15, maple: 0, birch: 0.1, pine: 0.5, redwood: -0.2, bristlecone: 0.25, olive: -0.4, fir: 0.1, juniper: -0.15 };
function drawSeedOf(sp: Kind, x: number, y: number, k = 1, z = 1, standing = false): void {
  // (Printed, from its plate: centred at (x, y), or standing on it.)
  const art = SEED_ART[sp];
  if (art) {
    // (As large as an acorn's figure, measured by its area; never longer than 40 px.)
    const T = 24 * z * px, asp = art.width / art.height;
    let h = T / Math.sqrt(asp), w = h * asp;
    const over = Math.max(h, w) / (40 * z * px);
    if (over > 1) { h /= over; w /= over; }
    g.save(); g.globalAlpha = k; g.drawImage(art, x - w / 2, standing ? y - h : y - h / 2, w, h); g.restore();
    return;
  }
  const u = px * z, tilt = TILT[sp];
  g.save(); g.translate(x, y); g.rotate(tilt); g.globalAlpha = k;
  g.fillStyle = ink(0.88); g.strokeStyle = ink(0.75); g.lineWidth = 0.8 * u;
  if (sp === 'oak') {
    // The nut, then its cup (scaled, cross-hatched a little), and its stalk.
    g.beginPath(); g.ellipse(0, 2.5 * u, 5.2 * u, 7 * u, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(247, 243, 235,0.32)'; g.beginPath(); g.ellipse(-1.8 * u, 3.5 * u, 1.2 * u, 3 * u, -0.2, 0, TAU); g.fill();
    g.fillStyle = ink(0.95); g.beginPath(); g.ellipse(0, -2.6 * u, 6.4 * u, 3.4 * u, 0, Math.PI, TAU); g.lineTo(6.4 * u, -1.6 * u); g.lineTo(-6.4 * u, -1.6 * u); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(247, 243, 235,0.5)'; g.lineWidth = 0.6 * u; g.beginPath();
    for (let i = -5; i <= 5; i += 2) { g.moveTo(i * u, -1.8 * u); g.lineTo(i * u + 1.4 * u, -4.4 * u); }
    g.stroke(); g.strokeStyle = ink(0.85); g.lineWidth = 1.1 * u; g.beginPath(); g.moveTo(0, -5.8 * u); g.quadraticCurveTo(1 * u, -8.5 * u, 2.4 * u, -9.6 * u); g.stroke();
  } else if (sp === 'pine') {
    // The wing, thin and veined, the seed dark at its base.
    g.beginPath(); g.moveTo(0, 4 * u); g.bezierCurveTo(-4 * u, 0, -3.2 * u, -11 * u, 0.6 * u, -15 * u); g.bezierCurveTo(3.6 * u, -10 * u, 3.4 * u, 0, 0, 4 * u);
    g.fillStyle = ink(0.22); g.fill(); g.stroke();
    g.lineWidth = 0.45 * u; g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(i * 0.8 * u, 1 * u); g.quadraticCurveTo(i * 1.6 * u, -6 * u, 0.6 * u + i * 0.6 * u, -13 * u); } g.stroke();
    g.fillStyle = ink(0.92); g.beginPath(); g.ellipse(0, 2.6 * u, 2.2 * u, 3 * u, 0, 0, TAU); g.fill();
  } else if (sp === 'ash') {
    // A single key: the seed long and dark at its base, the wing a narrow paddle beyond it.
    g.beginPath(); g.moveTo(0, 7 * u); g.bezierCurveTo(-1.8 * u, 2 * u, -2.6 * u, -8 * u, -0.6 * u, -13 * u); g.quadraticCurveTo(0.6 * u, -14.6 * u, 1.6 * u, -12.6 * u);
    g.bezierCurveTo(2.8 * u, -8 * u, 1.8 * u, 2 * u, 0, 7 * u); g.fillStyle = ink(0.2); g.fill(); g.stroke();
    g.lineWidth = 0.45 * u; g.beginPath(); g.moveTo(0.2 * u, 0); g.quadraticCurveTo(0.4 * u, -7 * u, 0.4 * u, -12.5 * u); g.stroke();
    g.fillStyle = ink(0.92); g.beginPath(); g.ellipse(0, 3.4 * u, 1.3 * u, 3.8 * u, 0, 0, TAU); g.fill();
  } else if (sp === 'cherry') {
    // The fruit, round, a light on it, its long stalk.
    g.strokeStyle = ink(0.85); g.lineWidth = 0.9 * u; g.beginPath(); g.moveTo(0, -3.6 * u); g.bezierCurveTo(0.4 * u, -7 * u, 2 * u, -10 * u, 4 * u, -12.5 * u); g.stroke();
    g.beginPath(); g.ellipse(0, 1.2 * u, 5 * u, 4.6 * u, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(247, 243, 235,0.4)'; g.beginPath(); g.ellipse(-1.9 * u, -0.6 * u, 1.1 * u, 1.7 * u, -0.5, 0, TAU); g.fill();
  } else if (sp === 'maple') {
    // Two keys, joined at their seeds, the wings spread wide and veined.
    for (const sgn of [-1, 1]) {
      g.save(); g.scale(sgn, 1);
      g.beginPath(); g.moveTo(0.4 * u, 1.6 * u); g.bezierCurveTo(4 * u, -1 * u, 9 * u, -6 * u, 12.5 * u, -7.5 * u); g.quadraticCurveTo(13.6 * u, -4.2 * u, 11 * u, -2 * u); g.bezierCurveTo(8 * u, 0.6 * u, 4 * u, 3.6 * u, 0.4 * u, 3.4 * u);
      g.closePath(); g.fillStyle = ink(0.2); g.fill(); g.stroke();
      g.lineWidth = 0.4 * u; g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(3 * u, 2 * u); g.quadraticCurveTo((6 + i) * u, (-0.5 - i * 0.6) * u, (10 + i * 0.7) * u, (-2.8 - i * 1.3) * u); } g.stroke(); g.lineWidth = 0.8 * u;
      g.fillStyle = ink(0.92); g.beginPath(); g.ellipse(2.4 * u, 2.4 * u, 2.4 * u, 1.9 * u, -0.3, 0, TAU); g.fill();
      g.restore();
    }
  } else if (sp === 'redwood') {
    // A small cone, round, its scales' faces each wrinkled to a little mouth.
    g.beginPath(); g.ellipse(0, 0, 5.2 * u, 6.4 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(247, 243, 235,0.55)'; g.lineWidth = 0.6 * u; g.beginPath();
    for (let i = -2; i <= 2; i++) { g.moveTo(-5 * u, i * 2.4 * u - 2 * u); g.quadraticCurveTo(0, i * 2.4 * u + 1.6 * u, 5 * u, i * 2.4 * u - 2 * u); }
    for (let i = -2; i <= 2; i++) { g.moveTo(i * 2.2 * u, -6 * u); g.quadraticCurveTo(i * 2.2 * u + 1.4 * u, 0, i * 2.2 * u, 6 * u); }
    g.stroke(); g.strokeStyle = ink(0.85); g.lineWidth = 1 * u; g.beginPath(); g.moveTo(0, -6.2 * u); g.lineTo(0.6 * u, -8.6 * u); g.stroke();
  } else if (sp === 'bristlecone') {
    // A cone, long, in rows of scales, each tipped with a fine prickle.
    g.beginPath(); g.ellipse(0, 0, 4.4 * u, 8.6 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(247, 243, 235,0.55)'; g.lineWidth = 0.55 * u; g.beginPath();
    for (let i = -4; i <= 4; i++) for (const sgn of [-1, 1]) { g.moveTo(-4.4 * u, i * 2.6 * u + sgn * 3 * u); g.lineTo(4.4 * u, i * 2.6 * u - sgn * 3 * u); }
    g.stroke(); g.strokeStyle = ink(0.8); g.lineWidth = 0.45 * u; g.beginPath();
    for (let i = -3; i <= 3; i++) for (const sgn of [-1, 1]) {
      const yy = i * 2.4 * u, xx = sgn * 4.4 * Math.sqrt(Math.max(0, 1 - (yy / (8.6 * u)) ** 2)) * u;
      g.moveTo(xx, yy); g.lineTo(xx + sgn * 1.8 * u, yy - 0.8 * u);
    }
    g.stroke();
  } else if (sp === 'fir') {
    // A Douglas fir's cone: long, its scales round-edged, and from under each a three-pointed bract.
    g.beginPath(); g.ellipse(0, 0, 4.2 * u, 9 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(247, 243, 235,0.5)'; g.lineWidth = 0.55 * u; g.beginPath();
    for (let i = -3; i <= 3; i++) { g.moveTo(-4 * u, i * 2.6 * u); g.quadraticCurveTo(0, i * 2.6 * u + 2.2 * u, 4 * u, i * 2.6 * u); }
    g.stroke(); g.strokeStyle = ink(0.85); g.lineWidth = 0.5 * u; g.beginPath();
    for (let i = -3; i <= 3; i++) for (const sgn of [-1, 1]) {
      const yy = i * 2.6 * u + 1.2 * u, xx = sgn * 4 * Math.sqrt(Math.max(0, 1 - (yy / (9 * u)) ** 2)) * u, ex = xx + sgn * 2.4 * u;
      g.moveTo(xx, yy); g.lineTo(ex, yy - 1.4 * u); g.moveTo(ex - sgn * 0.8 * u, yy - 0.6 * u); g.lineTo(ex + sgn * 0.6 * u, yy + 0.2 * u);
    }
    g.stroke();
  } else if (sp === 'juniper') {
    // A sprig of juniper's berries (its cones), round and dusted pale, on a scaled twig.
    g.strokeStyle = ink(0.85); g.lineWidth = 1 * u; g.beginPath(); g.moveTo(-8 * u, 8 * u); g.quadraticCurveTo(-2 * u, 2 * u, 6 * u, -9 * u); g.stroke();
    g.lineWidth = 0.5 * u; g.beginPath(); for (let i = 0; i < 7; i++) { const f = i / 6, x = -8 * u + 14 * u * f, y = 8 * u - 17 * u * f; g.moveTo(x, y); g.lineTo(x + 1.6 * u, y + 0.4 * u); } g.stroke();
    for (const [bx, by, br] of [[-3, 1, 3.4], [2.6, -3.6, 3], [3.4, 2.2, 2.6]] as [number, number, number][]) {
      g.fillStyle = ink(0.88); g.beginPath(); g.arc(bx * u, by * u, br * u, 0, TAU); g.fill();
      g.fillStyle = 'rgba(247, 243, 235,0.35)'; g.beginPath(); g.ellipse((bx - br * 0.35) * u, (by - br * 0.35) * u, br * 0.35 * u, br * 0.5 * u, -0.5, 0, TAU); g.fill();
    }
  } else if (sp === 'olive') {
    // The fruit, oval, a light on it, a narrow leaf from its stalk.
    g.beginPath(); g.moveTo(0, -4.6 * u); g.bezierCurveTo(3 * u, -8 * u, 9 * u, -11 * u, 13 * u, -11.5 * u); g.bezierCurveTo(9 * u, -8.6 * u, 3.5 * u, -5.6 * u, 0, -4.6 * u);
    g.fillStyle = ink(0.3); g.fill(); g.stroke(); g.lineWidth = 0.4 * u; g.beginPath(); g.moveTo(0.5 * u, -4.8 * u); g.quadraticCurveTo(6 * u, -8.6 * u, 12.5 * u, -11.4 * u); g.stroke();
    g.fillStyle = ink(0.88); g.beginPath(); g.ellipse(0, 1 * u, 3.8 * u, 5.4 * u, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(247, 243, 235,0.35)'; g.beginPath(); g.ellipse(-1.4 * u, -0.6 * u, 0.9 * u, 1.8 * u, -0.3, 0, TAU); g.fill();
  } else {
    // Two round wings, papery, the seed small between them.
    for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(sgn * 3.6 * u, 0, 3.6 * u, 2.8 * u, sgn * 0.15, 0, TAU); g.fillStyle = ink(0.18); g.fill(); g.lineWidth = 0.6 * u; g.stroke(); }
    g.fillStyle = ink(0.92); g.beginPath(); g.ellipse(0, 0, 1.3 * u, 2.4 * u, 0, 0, TAU); g.fill();
    g.lineWidth = 0.7 * u; g.beginPath(); g.moveTo(0, -2.3 * u); g.lineTo(-0.8 * u, -4.2 * u); g.moveTo(0, -2.3 * u); g.lineTo(0.8 * u, -4.2 * u); g.stroke();
  }
  g.restore();
}
/** The seed, planted: the one chosen, at the heart, settling in as it lands. */
function drawSeed(v: View, t: number): void {
  // (Chosen from its slice: the slice draws in, ring by ring, back to its heart, and is its seed.)
  const fold = folding && folding.sp === kind ? smooth((t - plantedAt) / 1.3) : 1, art = sliceArt(kind);
  if (fold < 1 && art) {
    const D = sliceD(), h = (D * art.height) / Math.max(art.width, art.height), w = (D * art.width) / Math.max(art.width, art.height);
    const r = (Math.max(w, h) / 2) * (1 - fold) ** 1.4, sk = 1 - 0.35 * fold;
    g.save(); g.globalAlpha = 1 - smooth((fold - 0.75) / 0.25);
    g.beginPath(); g.arc(v.cx, v.cy, Math.max(0.1, r), 0, TAU); g.clip();
    g.drawImage(art, v.cx - (w * sk) / 2, v.cy - (h * sk) / 2, w * sk, h * sk);
    g.restore();
  }
  const k = smooth((t - plantedAt - (fold < 1 ? 0.9 : 0)) / 0.7);
  if (k > 0) drawSeedOf(kind, v.cx, v.cy, k, 1.4 + 0.3 * (1 - k));
}
/**
 * On a bare sheet, the woods to choose from, one at a time: a slice of each, as some two months of a
 * practice would make it (pressed by the app itself, src/rings/slices/), large, its name beneath in
 * pencil, a row of dots for where it is among them. A finger swipes from one to the next, as the pages of
 * a specimen book are turned; touched, it's chosen, and draws in to its seed.
 */
// (Birch is no longer offered, its print too plain to be worth the choosing; a birch already grown is kept.)
const SEEDS: Kind[] = ['oak', 'ash', 'cherry', 'maple', 'fir', 'pine', 'redwood', 'juniper', 'bristlecone', 'olive'];
const SLICE_ART: Partial<Record<Kind, HTMLImageElement>> = {}, sliceAsked = new Set<Kind>();
function sliceArt(sp: Kind): HTMLImageElement | undefined {
  if (!sliceAsked.has(sp)) {
    sliceAsked.add(sp);
    const im = new Image(); im.onload = () => { SLICE_ART[sp] = im; };
    im.src = new URL(`./slices/${sp}.png`, import.meta.url).href;
  }
  return SLICE_ART[sp];
}
/** The slice shown as large as the tree will be on the sheet. */
const sliceD = () => 2 * BARK * roomNow() * 1.05;
let choice = 0, choiceDx = 0, choiceTo: { from: number; to: number; at: number } | null = null, folding: { sp: Kind } | null = null;
const choosing = () => GROWN && !tree.rings.length && !seedAt;
/** Turned on by one, either way (wrapping round). */
function turnChoice(dir: number): void {
  choice = (choice + dir + SEEDS.length) % SEEDS.length;
  choiceTo = { from: choiceDx + dir * W, to: 0, at: clock() };
  choiceDx = choiceTo.from;
}
function drawSeedChoice(v: View, t: number): void {
  if (choiceTo) {
    const p = smooth((t - choiceTo.at) / QUICK);
    choiceDx = choiceTo.from + (choiceTo.to - choiceTo.from) * p;
    if (p >= 1) choiceTo = null;
  }
  const k = smooth((t - openedAt) / STEADY_T), D = sliceD();
  // (This one, and the next coming in from the side it's swiped toward.)
  for (const off of [-1, 0, 1]) {
    const x = v.cx + choiceDx + off * W;
    if (x < -D || x > W + D) continue;
    const sp = SEEDS[(choice + off + SEEDS.length) % SEEDS.length], art = sliceArt(sp);
    // (The neighbours of whichever is coming, asked for ahead.)
    sliceArt(SEEDS[(choice + 2 * off + SEEDS.length * 2) % SEEDS.length]);
    const al = k * (1 - 0.6 * Math.min(1, Math.abs(x - v.cx) / W));
    g.save(); g.globalAlpha = al;
    if (art) {
      const s2 = D / Math.max(art.width, art.height), w = art.width * s2, h = art.height * s2;
      g.drawImage(art, x - w / 2, v.cy - h / 2, w, h);
    } else drawSeedOf(sp, x, v.cy, 1, 2);
    g.fillStyle = 'rgba(92,88,84,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic ${16 * px}px Newsreader, "Iowan Old Style", Georgia, serif`; g.fillText(sp, x, v.cy + D / 2 + 34 * px);
    g.restore();
  }
  // Where it is among them: a row of small dots, this one inked.
  g.save(); g.globalAlpha = k;
  const y = v.cy + D / 2 + 64 * px, gap = 11 * px;
  for (let i = 0; i < SEEDS.length; i++) {
    g.fillStyle = i === choice ? 'rgba(60,52,46,0.8)' : 'rgba(92,88,84,0.28)';
    g.beginPath(); g.arc(v.cx + (i - (SEEDS.length - 1) / 2) * gap, y, (i === choice ? 2.6 : 2) * px, 0, TAU); g.fill();
  }
  g.restore();
}

/** The seed, planted where the sheet was tapped: the tree grows from there. */
let plantedAt = 0;
function plant(x: number, y: number): void {
  seedAt = [x / W, y / H]; view = null; plantedAt = clock();
  // (A new seed chosen while the last tree waited: now it stands in the grove, and this one is kept.)
  if (parting) {
    const was = parting.k, grown = parting.tree.rings.length > 0;
    void (async () => {
      // (Only once it truly stands in the grove is it let go of here; if it can't be, the tree as it was comes back.)
      if (grown && !params.has('demo') && !(await keepInGrove(was))) {
        say('Last year’s tree couldn’t be stood in the grove just now, so it’s kept as it was.', 8);
        ({ tree, days, kind, seedAt, marks } = parting!); herePlace = parting!.place; parting = null; lookAfresh(); return;
      }
      if (grown) groveKept = [...groveKept, was];
      parting = null; worldKey = ''; keep();
    })();
  } else keep();
  say('Now draw a loop around it.', 9);
}

/** A touch inside the slice: the ring under it, lit for a moment (no dates, no counting). */
let lit = -1, litAt = 0;
function readDay(v: View, x: number, y: number): void {
  const dx = x - v.cx, dy = v.cy - y, a = (((Math.atan2(dy, dx) - v.turn) % TAU) + TAU) % TAU;
  const r = unwarpR(v.warp, Math.hypot(dx, dy) / v.s);
  const i = tree.rings.findIndex((ring) => r <= radiusAt(ring, a));
  if (i < 0) return;
  lit = i; litAt = clock();
}

/**
 * The ring closed: the line drawn is closed too, its end carried on round to where it began (the ring was
 * closed for the hand a little short of there), and its start, tapered as the brush touched down, filled
 * out, so the loop drying into the year is whole.
 */
function closeTrail(): void {
  if (trail.length < 10) return;
  const first = trail[0], last = trail[trail.length - 1], d = ((((first.a - last.a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const full = trail[Math.min(trail.length - 1, 9)].w;
  for (let i = 0; i < Math.min(9, trail.length); i++) trail[i].w = Math.max(trail[i].w, full);
  if (Math.abs(d) > 1.2) return;
  const steps = Math.ceil(Math.abs(d) / 0.02);
  for (let k = 1; k <= steps; k++) {
    const f = k / steps;
    trail.push({ a: (((last.a + d * f) % TAU) + TAU) % TAU, r: last.r + (first.r - last.r) * f, t: last.t, w: last.w + (full - last.w) * f, fast: last.fast, load: last.load, jit: last.jit, turned: last.turned });
  }
}
/** The paint, laid exactly where the brush is (angle a, u steady widths from the bark). */
function trailAt(a: number, u: number): void {
  if (!strokeView) return;
  // (Joined across the circle's own seam too, where the angle comes round from a full turn to nothing.)
  const t = clock(), last = trail[trail.length - 1], joined = last && angleOff(last.a, a) < 0.5;
  let r = radiusAt((i) => tree.inner(i), a) + Math.max(0, GROWN ? u : Math.min(WIDEST, u)) * tree.wRef;
  const dt = joined ? Math.max(0.004, t - last.t) : 0;
  // (A brush with some weight: a sudden jerk in or out rounded over a few hundredths of a second, but never
  // more than a px and a half from under the finger, so it's never behind it.)
  if (joined) {
    const want = r, lag = (1.5 * px) / Math.max(1e-6, strokeView.s);
    r = last.r + (want - last.r) * (1 - Math.exp(-dt / 0.045));
    r = Math.max(want - lag, Math.min(want + lag, r));
  }
  // Speed on the screen, in CSS px a second, eased by time (never by how often the phone reports), so the
  // brush's width and its ink breathe rather than flicker.
  let fast = last ? last.fast : 0, jit = last ? last.jit : 0;
  if (joined) {
    const [x0, y0] = at(strokeView, last.a, last.r), [x1, y1] = at(strokeView, a, r);
    const v = Math.hypot(x1 - x0, y1 - y0) / px / dt, was = fast;
    fast += (Math.min(1, v / 600) - fast) * (1 - Math.exp(-dt / 0.22));
    // (How unevenly the hand goes: the pace's own changes, eased over half a second.)
    jit += (Math.min(1, (Math.abs(fast - was) / dt) / 1.2) - jit) * (1 - Math.exp(-dt / 0.5));
  }
  // (The ink in the brush: full as it touches down, drier as it goes round, as a loaded brush runs out.)
  const turned = joined ? last.turned + angleOff(last.a, a) : 0, load = 1 - 0.4 * smooth(turned / TAU);
  // A brush: full and wet when unhurried, thin and dry when quick, tapering in as it touches down.
  const n = joined ? trail.length : 0;
  const w = (3.5 + 4.5 * (1 - fast)) * (0.85 + 0.15 * load) * Math.min(1, 0.3 + n / 8);
  trail.push({ a, r, t, w: joined && n ? last.w + (w - last.w) * (1 - Math.exp(-dt / 0.12)) : w * 0.4, fast, load, jit, turned });
}
function hear(): void {
  for (const n of tree.news) if (n.kind === 'ring') {
    // (The watercolour's own wash, only when it's painted in water: the print has no use for it.)
    if (!PRINT) { paper.paint(tree); paper.close(tree); }
    // The day's ring, kept; the first of the day is counted, quietly, once it has settled.
    const today = dayOf(), first = !days.includes(today);
    days.push(today);
    keepMarks();
    keep();
    if (first) editionAt = clock() + 1.6;
    // (The ring is done: it settles into the paper and the slice draws back to make room, while the
    // next can be begun as soon as the finger comes down again.)
    painter = null;
    settle = { ring: tree.rings.length - 1, at: clock() };
    closeTrail();
    settleTap = clock() + BLOOM;
    // (Once, a week in: that the slice can be seen printed.)
    if (GROWN && tree.rings.length === 7 && !params.has('demo')) { try { if (!localStorage.getItem('annulus.printHint')) { localStorage.setItem('annulus.printHint', '1'); window.setTimeout(() => say('Hold the slice a moment to see it printed.', 7), 4000); } } catch { /* not said */ } }
    if (GROWN) {
      inward = { ring: tree.rings.length - 1, at: clock() };
      // (The new year simply there, where it settled, never growing out.)
      yearClosed = true;
      // (The year's wood grows out to the loop before the slice draws back to make room.)
      if (PRINT && !closer()) yearGrow = { ring: tree.rings.length - 1, at: clock() };
      // (And the new year shown as new wood is, pale, a moment: on an old tree it's a hair at the bark, and would
      // grow there unseen.)
      fresh = { ring: tree.rings.length - 1, at: clock() };
    }
    // (Room made after the year has grown out; but at once if the slice already reaches past its room, however
    // quickly the rings come: never left growing past it while the next is drawn.)
    if (!yearGrow || (GROWN && tooWide(viewNow().s))) makeRoom();
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
  light.addColorStop(1, 'rgba(120,96,70,0.08)');
  c.fillStyle = light; c.fillRect(0, 0, W, H);
  return ground;
}

/** A closed path round a ring (or the heart, ring -1), r(a) given; `dr(a)` CSS px out from it. */
function ringPath(v: View, r: (a: number) => number, dr: number | ((a: number) => number) = 0, n = K, more = false): void {
  // (`more`: added to the path already begun.)
  if (!more) g.beginPath();
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
/**
 * The loop drying onto the slice never laid over a check: where one opens through the bark, the wet line
 * breaks off there, as ink does over a split in the block.
 */
function overChecks(v: View, draw: () => void): void {
  const cuts = inward && inward.ring < tree.rings.length ? cracksCut.filter((c) => c[5] > 0) : [];
  if (!cuts.length) { draw(); return; }
  g.save(); g.beginPath(); g.rect(0, 0, W, H);
  for (const [a0, r0, a1, r1, hw, out] of cuts) {
    // (The check's mouth, a little wider than it is, from past the bark in to where the line could reach.)
    const [x0, y0] = at(v, a0, r0 + out * 1.5), [x1, y1] = at(v, a1, r1 - (r0 - r1) * 2);
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, h = Math.max(1.5 * px, hw * v.s * 1.4), nx = (-dy / l) * h, ny = (dx / l) * h;
    g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.lineTo(x1 - nx, y1 - ny); g.lineTo(x0 - nx, y0 - ny); g.closePath();
  }
  g.clip('evenodd');
  try { draw(); } finally { g.restore(); }
}
function drawBrush(g: CanvasRenderingContext2D, v: View, t: number): void {
  const n = trail.length;
  if (n < 2) return;
  // (Growing true to scale, the loop, once closed, stays where it was drawn and dries away, soaking into
  // the sheet, while the year grows on the slice.)
  const going = inward && inward.ring < tree.rings.length ? inward : null;
  // (Quicker the older the tree: a young tree's year is near where the loop was drawn, an old one's far in from
  // it, a hair at the bark; the loop then only stands apart, and is let go of sooner.)
  const dryT = 3.2 - 2.1 * smooth((tree.rings.length - 8) / 110);
  const dry = going ? 1 - smooth((t - going.at) / dryT) : 1;
  // (Dried away: let go of, never mapped again each frame for nothing.)
  if (!tree.stroke && painter === null && (going ? dry < 0.01 : t - trail[n - 1].t > 14)) { trail = []; return; }
  // (It dries where it was drawn, soaking into the sheet, never sliding in after the year it made: the year is
  // the wood's measure, not the loop's, and a line seen shrinking onto it reads as the drawing taken back.)
  const into = 0, edge = null as ((a: number) => number) | null;
  const pts = trail.map((q) => {
    const [x, y] = at(v, q.a, edge ? q.r + (edge(q.a) - q.r) * into : q.r);
    // (Growing true to scale, the loop stays wet all the way round while it's drawn, however slow the
    // hand, so the whole circle is there to close; it dries only once the ring is made.)
    const life = GROWN ? (going ? dry : tree.stroke ? (tree.resting ? 1 - smooth((t - restAt - 4) / 2) : 1) : Math.exp(-(t - q.t) / 3.5)) : Math.exp(-(t - q.t) / 3.5) * dry;
    return { x, y, life, q, nx: 0, ny: 0, hw: 0 };
  });
  const lap = (i: number) => angleOff(trail[i].a, trail[i - 1].a) > 0.5;
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
  if (GROWN) {
    // (Growing true to scale, a brush's line: the hand's path eased of its jitter; fine where it touched
    // down, swelling where the hand went slowly and thinning where it hurried, its head drawn to a point
    // while it's moving; laid in a few bristles side by side, each one shape along its run, so no joins
    // show; and where the hand hurried, the outer bristles run dry and leave the paper between them.)
    const life = pts[n - 1].life;
    if (life < 0.02) return;
    // (Soaking away as it dries, all of it paler and paler till it's gone: never a dark line there and then not.)
    const was = g.globalAlpha; g.globalAlpha = was * smooth(life / 0.6);
    const wet = life * life, live = !!tree.stroke && !going;
    const PAPER_RGB = [247, 243, 235], INK_RGB = [24, 20, 18];
    const opaque = (a: number) => { const k = Math.max(0, Math.min(1, a)); return `rgb(${PAPER_RGB.map((c, j) => Math.round(c + (INK_RGB[j] - c) * k)).join(',')})`; };
    const B = [-1, -0.62, -0.22, 0.22, 0.62, 1];
    let from = 0;
    for (let i = 1; i <= n; i++) {
      if (i < n && !lap(i)) continue;
      const to = i - 1;
      if (to - from >= 2) {
        // (Eased: each point the mean of its neighbours, twice over; the ends kept where they were.)
        // (Laid out finer first, each step halved, so the easing rounds its corners rather than cutting them.)
        const raw = pts.slice(from, to + 1), xs: number[][] = [], src: typeof pts = [];
        for (let j = 0; j < raw.length; j++) {
          xs.push([raw[j].x, raw[j].y]); src.push(raw[j]);
          if (j + 1 < raw.length) { xs.push([(raw[j].x + raw[j + 1].x) / 2, (raw[j].y + raw[j + 1].y) / 2]); src.push(raw[j]); }
        }
        for (let pass = 0; pass < 6; pass++) for (let j = 1; j < xs.length - 1; j++) {
          xs[j] = [(xs[j - 1][0] + 2 * xs[j][0] + xs[j + 1][0]) / 4, (xs[j - 1][1] + 2 * xs[j][1] + xs[j + 1][1]) / 4];
        }
        const m = xs.length, sAt = [0];
        for (let j = 1; j < m; j++) sAt.push(sAt[j - 1] + Math.hypot(xs[j][0] - xs[j - 1][0], xs[j][1] - xs[j - 1][1]));
        const L = sAt[m - 1];
        const P = xs.map((q, j) => {
          const a0 = xs[Math.max(0, j - 1)], b0 = xs[Math.min(m - 1, j + 1)], dx = b0[0] - a0[0], dy = b0[1] - a0[1], l = Math.hypot(dx, dy) || 1, q0 = src[j];
          const taper = smooth(sAt[j] / (22 * px)) * (live ? 0.25 + 0.75 * smooth((L - sAt[j]) / (16 * px)) : 0.4 + 0.6 * smooth((L - sAt[j]) / (8 * px)));
          return { x: q[0], y: q[1], nx: -dy / l, ny: dx / l, hw: 0.5 * q0.q.w * 0.72 * (0.6 + 0.4 * life) * px * Math.max(0.12, taper) * (0.8 + 0.4 * vnoise(sAt[j] / (70 * px) + from * 0.37, 4.1)), s: sAt[j], fast: q0.q.fast, load: q0.q.load ?? 1, jit: q0.q.jit ?? 0 };
        });
        const band = (j0: number, j1: number, k0: number, k1: number) => {
          g.beginPath();
          // (Its edges a little ragged where the hair of the brush is, never ruled.)
          // (Ragged the more unevenly the hand went: a steady pace leaves a clean edge.)
          const rag = (p: typeof P[0], k: number) => k * p.hw * (Math.abs(k) > 0.9 ? 1 + (0.06 + 0.3 * p.jit) * (vnoise(p.s / (2.2 * px) + k * 13, 2.7) - 0.5) * 2 : 1);
          for (let j = j0; j <= j1; j++) { const p = P[j], d = rag(p, k1); if (j === j0) g.moveTo(p.x + p.nx * d, p.y + p.ny * d); else g.lineTo(p.x + p.nx * d, p.y + p.ny * d); }
          for (let j = j1; j >= j0; j--) { const p = P[j], d = rag(p, k0); g.lineTo(p.x + p.nx * d, p.y + p.ny * d); }
          g.closePath(); g.fill();
        };
        // (A breath of wet ink beyond it, while it's fresh.)
        if (wet > 0.05) { g.fillStyle = `rgba(140,96,62,${(0.07 * wet).toFixed(3)})`; band(0, m - 1, -1.35, 1.35); }
        for (let bj = 0; bj < B.length - 1; bj++) {
          const k0 = B[bj] - 0.03, k1 = B[bj + 1] + 0.03, outer = Math.abs((B[bj] + B[bj + 1]) / 2);
          // (The one ink in every bristle; dry where the hand hurried, the edges first.)
          let run0 = -1, tone = -1;
          for (let j = 0; j < m; j++) {
            const p = P[j], dryness = (Math.max(0, p.fast - 0.35) + 0.35 * (1 - p.load) + 0.25 * p.jit) * (0.4 + 0.9 * outer) * (0.6 + 0.4 * (1 - wet));
            // (Paler as the brush runs out: set per run, in steps too fine to see.)
            const tk = Math.round((0.92 * (0.55 + 0.45 * life) * (0.82 + 0.18 * p.load)) * 40) / 40;
            if (tk !== tone) { if (run0 >= 0 && j - 1 > run0) { band(run0, j - 1, k0, k1); run0 = j - 1; } tone = tk; g.fillStyle = opaque(tk); }
            const on = vnoise(p.s / (9 * px) + bj * 7.3, bj * 1.9) >= dryness;
            if (on && run0 < 0) run0 = j;
            if ((!on || j === m - 1) && run0 >= 0) { const e = on ? j : j - 1; if (e > run0) band(run0, e, k0, k1); run0 = -1; }
          }
        }
      }
      from = i;
    }
    g.globalAlpha = was;
    return;
  }
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
      // (Breaking up dry as it fades; but growing true to scale, it only fades, soaking into the sheet.)
      if (!GROWN && life < 0.75 && h1(i * 0.613) > life + 0.25) continue;
      g.fillStyle = ink(0.55 * life + 0.3 * wet); quad(p, q, -1, 1);
      g.fillStyle = ink(0.3 * wet); quad(p, q, -0.6, 0.6);
      continue;
    }
    g.fillStyle = `rgba(112,70,42,${(0.3 * life * tone).toFixed(3)})`; quad(p, q, -1, 1);
    g.fillStyle = `rgba(92,56,32,${(0.3 * life * tone + 0.2 * wet).toFixed(3)})`; quad(p, q, -0.5, 0.5);
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
/**
 * Oak's fine rays: each at its own angle, beginning at its own radius (mm) and running some way out.
 * (In the order they began, the oldest first: those in play are always the oldest, so a ray once shown
 * stays shown as the tree grows, never displaced by a newer one.)
 */
const PRINT_RAYS = Array.from({ length: 2400 }, (_, k) => {
  const from = 700 * h1(k * 1.7 + 9.1);
  return { a: h1(k + 0.5) * TAU, from, to: from + 15 + 260 * h1(k * 2.3 + 4.4) ** 2, k };
}).sort((x, y) => x.from - y.from);

/**
 * Oak's broad rays, as a real oak's are: each a ribbon of cells begun at its own radius (mm) and running
 * straight out to the bark from then on, never ending or moving; new ones begin further out as the trunk
 * widens. (In the order they began: the oldest are the ones printed, so the same rays run through the
 * slice all its year. Ash's rays are too fine to see without a glass: it has none of these.)
 */
const BROAD = (() => {
  // (One about every 60 mm round the trunk: each new one begun once the trunk has grown room for it,
  // where the rays already running are widest apart, as a cambium begins them.)
  const SPACE = 60, out: { a: number; from: number; to: number; k: number }[] = [], angles: number[] = [];
  for (let k = 0; k < 400; k++) {
    const from = k < 3 ? 2 + 4 * k : ((k * SPACE) / TAU) * (0.85 + 0.3 * h1(k * 3.3 + 1.9));
    let a = h1(k * 0.77 + 5.5) * TAU;
    if (angles.length > 1) {
      const sorted = [...angles].sort((x, y) => x - y);
      let best = 0, at = 0;
      for (let j = 0; j < sorted.length; j++) { const gap = (j + 1 < sorted.length ? sorted[j + 1] : sorted[0] + TAU) - sorted[j]; if (gap > best) { best = gap; at = sorted[j]; } }
      a = (at + best * (0.35 + 0.3 * h1(k * 1.37 + 0.2))) % TAU;
    }
    angles.push(a);
    out.push({ a, from, to: Infinity, k: 5000 + k });
  }
  return out.sort((x, y) => x.from - y.from);
})();
/** The bark's thickness on the screen (CSS px): a twentieth of the slice's radius or so, 3 to 9 px. */
function barkCss(v: View): number {
  if (!PRINT || !tree.rings.length) return 0;
  // (Looked at closer, the same bark magnified: its thickness decided at the slice's own size.)
  const Z = Math.max(1, look.k), R = (v.s * warpR(v.warp, meanR(tree.rings.length - 1))) / px / Z;
  const [lo, k, hi] = SPEC[kind].barkCss;
  // (A young tree's bark is thin, whatever its kind: it thickens over its first months.)
  const young = 0.3 + 0.7 * smooth(tree.rings.length / 60);
  return Math.max(lo, Math.min(hi, k * R)) * young * Z;
}

function drawPrint(v: View): void {
  const n = tree.rings.length;
  // (Looked at closer, the same print magnified: which rings print as lines, and how heavy a band is, are
  // decided at the slice's own scale, `Z` times smaller than now, never anew for every zoom.)
  const Z = Math.max(1, look.k);
  const wPx = (i: number) => (v.s * (warpR(v.warp, meanR(i)) - warpR(v.warp, meanR(i - 1)))) / px / Z;
  const scr = (r: number) => v.s * warpR(v.warp, r);
  // (A point at angle a, radius r (mm), and dr device px further out: roughness is on the screen, so the
  // fisheye never magnifies it into spikes.)
  const pt = (a: number, r: number, dr = 0): [number, number] => { const R = scr(r) + dr, t = a + v.turn; return [v.cx + R * Math.cos(t), v.cy - R * Math.sin(t)]; };
  // The heart: the seedling's first growth, printed as a ring is (an inked band at its edge, paper within),
  // and a dark dot at its very centre: a small dot when the tree is grown, never a black disc when it's young.
  // (Oak's real wood prints its heart as its first year: see printYears.)
  if (!((realYears() || fam() !== 'ring') && n) && !(GROWN && !n)) {
    // (Never a ruled circle: its edges wander a little, as a seedling's first wood does, and its band
    // thickens and thins.)
    const hr = barkOf(-1), band = Math.min(0.4, (3 * px * Z) / Math.max(1, scr(meanR(-1))));
    const wob = (a: number, k: number) => 1 + 0.03 * Math.sin(2 * a + k) + 0.018 * Math.sin(3 * a + 2.3 * k) + 0.006 * Math.sin(5 * a + k);
    g.beginPath();
    for (let j = 0; j <= K; j++) { const a = (j / K) * TAU, [x, y] = pt(a, hr(a) * wob(a, 1)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let j = K; j >= 0; j--) { const a = (j / K) * TAU, [x, y] = pt(a, hr(a) * (1 - Math.max(band, 0.18) * (1 + 6 * (wob(a, 4) - 1))) * wob(a, 1.3)); g.lineTo(x, y); }
    g.closePath(); g.fillStyle = ink(0.85); g.fill();
    g.beginPath(); g.arc(v.cx, v.cy, 1.6 * px * Z, 0, TAU); g.fill();
  }
  if (!n) {
    // (Before the first ring: the heart, ringed, to draw round; or, growing from a seed, the seed, drawn
    // apart from the print.)
    if (!GROWN) { g.strokeStyle = ink(0.7); g.lineWidth = 1.2 * px; ringPath(v, barkOf(-1)); g.stroke(); }
    return;
  }
  // The rays in play: the ones begun inside the bark, as many as fit the screen (one about every 9 px
  // round the bark), the same ones from ring to ring.
  const Rb = meanR(n - 1), around = (TAU * scr(Rb)) / px / Math.max(1, look.k);
  const begun = PRINT_RAYS.filter((r) => r.from < Rb && r.to > meanR(0));
  const rays = begun.slice(0, Math.max(6, Math.min(begun.length, Math.round(around / 4)))).sort((x, y) => x.a - y.a);
  // Oak and ash, once their real wood has come: the years of a red oak's and a white ash's sections,
  // pressed (see printYears). Until it has, they're drawn as the other woods are.
  const real = realYears();
  // (The other woods, each year built as its kind's is (see ANATOMY), pressed the same way.)
  if (real || fam() !== 'ring') {
    printYears(v, real ?? null);
    g.beginPath(); g.arc(v.cx, v.cy, 1.4 * px * Z, 0, TAU); g.fillStyle = ink(0.8); g.fill();
  } else {
    // Rings too fine to print apart (anywhere: a seedling's first years are wide, the next fine) print as
    // single lines, as many as the screen can part. (Oak's rays break up the pattern of its fine rings; pine's
    // and birch's plain bands, squeezed under 3 px, shimmer into moiré, so theirs are a soft tone with faint
    // lines over it: strong lines, each a hand's wobble of its own, cross into a fingerprint.)
    // (Oak: only the fine heart before its first printable ring, since among fine rings its rays do the work.)
    const ring = fam() === 'ring', conifer = fam() === 'conifer', sp = SPEC[kind];
    const fineAt = ring ? 1.6 : 3;
    let heartEnd = 0;
    while (heartEnd < n - 1 && wPx(heartEnd) < fineAt) heartEnd++;
    const dense = Array.from({ length: n }, (_, i) => i < n - 1 && (ring ? i < heartEnd : wPx(i) < fineAt));
    for (let i = 0; i < n; i++) {
      if (!dense[i]) continue;
      let j = i;
      while (j + 1 < n && dense[j + 1]) j++;
      // (Lines only, never a grey tone, which the press breaks into smudges; as far apart as a hand would
      // rule them, each its own distance and weight, so they never beat into waves.)
      g.strokeStyle = ink(sp.line);
      let lastR = scr(meanR(i - 1));
      for (let k = i; k <= j; k++) {
        const R = scr(meanR(k));
        if (R - lastR < (ring ? 1.9 : 2.6 + 1.2 * h1(k * 1.37 + 0.5)) * px * Z) continue;
        // (As dark as the wide years: each line some three-fifths of the space it stands for.)
        g.lineWidth = 0.6 * (R - lastR) * (0.85 + 0.3 * h1(k * 3.7));
        lastR = R; ringPath(v, barkOf(k)); g.stroke();
      }
      i = j;
    }
    // The broad rays in play.
    // (All of them begun inside the bark: as a real oak's, they crowd the slice as it grows, the newest
    // short, by the bark.)
    const broad = kind !== 'oak' ? [] : BROAD.filter((r) => r.from < Rb).sort((x, y) => x.a - y.a);
    // The sapwood: once there's heartwood to tell it from (past 16 years), the last eight print a little paler.
    for (let i = 0; i < n; i++) {
      if (dense[i]) continue;
      const outer = barkOf(i), inner = barkOf(i - 1);
      // How much of the year takes the ink (its latewood): about half; never under a pixel.
      // (Pine's latewood is a crisp band of about a third; birch marks its year with only a thin line.)
      const w = wPx(i);
      // (Heavy ink, as the real woods print: most of each year takes the ink, the paper only the gap between.)
      const share = !ring && !conifer ? Math.min(0.78, Math.max(0.55, 1.1 / Math.max(1, w) + 0.55))
        : conifer ? Math.min(0.78, Math.max(0.5, 1.1 / Math.max(1, w) + 0.5))
        : Math.min(0.75, Math.max(0.45, 1.1 / Math.max(1, w) + 0.45));
      // (A conifer's latewood: wider and darker for an unhurried day, thin and pale for a hurried one.)
      const calm = conifer ? calmOf(i) : 0.5, cshare = conifer ? Math.min(0.88, share * (0.6 + 0.8 * calm)) : share;
      const bandIn = (a: number) => outer(a) - cshare * (outer(a) - inner(a));
      const tone = (1 - 0.16 * smooth((i - (n - 9)) / 8) * smooth((n - 12) / 8)) * sp.tone, fine = w < 6, mr = meanR(i);
      // The rays crossing this ring: the broad ones always (hairlines); among fine rings, the fine ones too
      // (oak's mosaic); never two closer than 5 px round it.
      const R = scr(mr), least = (5 * px * Z) / Math.max(1, R);
      // (Oak's only: an ash's rays are too fine to see.)
      const pool = kind !== 'oak' ? [] : (fine ? [...broad, ...rays].sort((x, y) => x.a - y.a) : broad).filter((r) => r.from < mr && r.to > mr);
      const live: typeof pool = [];
      for (const r of pool) if (!live.length || r.a - live[live.length - 1].a > least) live.push(r);
      if (live.length > 1 && live[0].a + TAU - live[live.length - 1].a < least) live.pop();
      const gapOf = (r: typeof pool[0]) => ((r.k >= 5000 ? 0.65 : 0.9) * px * Z) / Math.max(1, R);
      const rough = 0.28 * px * Z;
      const brick = (a0: number, a1: number, seed: number) => {
        // (Its edges ragged by a smooth wander in the wood's own place, some 4 px apart at the slice's own
        // size, and traced at the screen's: looked into, the same edge magnified, never a run of facets.)
        const steps = Math.max(2, Math.ceil(((a1 - a0) * R) / (3 * px)));
        const along = (R / Z) / (4 * px), jitAt = (a: number, k: number) => (vnoise(a * along + k, seed * 0.013 + k) - 0.5) * rough * 2.6;
        g.beginPath();
        for (let j = 0; j <= steps; j++) {
          const a = a0 + ((a1 - a0) * j) / steps;
          const [x, y] = pt(a, outer(a), jitAt(a, 3.1)); if (j) g.lineTo(x, y); else g.moveTo(x, y);
        }
        for (let j = steps; j >= 0; j--) {
          const a = a0 + ((a1 - a0) * j) / steps;
          const [x, y] = pt(a, bandIn(a), jitAt(a, 17.7)); g.lineTo(x, y);
        }
        g.closePath();
        // (The ink a little starved now and then.)
        g.fillStyle = ink((0.8 + 0.2 * h1(seed * 0.37)) * tone * (conifer ? 0.75 + 0.25 * calm : 1)); g.fill();
      };
      if (live.length < 2) brick(0, TAU, i * 101);
      else for (let j = 0; j < live.length; j++) {
        // (A ray wavers a little from ring to ring, as the grain does.)
        const wav = (r: typeof pool[0]) => r.a + ((h1(r.k * 13.1 + i * 0.7) - 0.5) * 0.8 * px * Z) / Math.max(1, R);
        const nx = j + 1 < live.length ? live[j + 1] : live[0];
        const a0 = wav(live[j]) + gapOf(live[j]), a1 = wav(nx) + (j + 1 < live.length ? 0 : TAU) - gapOf(nx);
        if (a1 > a0) brick(a0, a1, i * 1013 + live[j].k * 7);
      }
      // The fine rays, in a wide band: short pale flecks across it, a few px apart (oak's; the others' can't be seen).
      if (!fine && kind === 'oak') {
        const count = Math.round((TAU * R * SPARSE) / (16 * px * Z));
        g.strokeStyle = 'rgba(247, 243, 235,0.38)'; g.lineWidth = 0.4 * px * Z; g.lineCap = 'round'; g.beginPath();
        for (let q = 0; q < count; q++) {
          const a = h1(i * 7.7 + q * 1.31) * TAU, lo = bandIn(a), hi = outer(a), band = hi - lo, tilt = (h1(q * 5.9 + i) - 0.5) * 0.6 * px * Z / Math.max(1, R);
          const r0 = lo + band * (0.15 + 0.5 * h1(q * 2.9 + i)), r1 = r0 + band * (0.12 + 0.3 * h1(q * 4.1 + i * 3));
          const [x0, y0] = pt(a, r0), [x1, y1] = pt(a + tilt, Math.min(hi, r1)); g.moveTo(x0, y0); g.lineTo(x1, y1);
        }
        g.stroke();
      }
      // The pores: oak begins each year with a row of large open vessels, a stipple of dots just inside the
      // year's start, in the springwood (two rows where it's wide).
      if (!ring && !conifer) {
        // Diffuse: fine pores scattered evenly through the year, a light stipple across the springwood.
        // (Counted and sized at the unzoomed print's scale: looked into, the same pores, larger.)
        const ew = (scr(bandIn(0)) - scr(inner(0))) / px / Z;
        if (ew >= 2) {
          const count = Math.round((TAU * scr(mr) * ew * SPARSE) / (16 * px * Z));
          g.fillStyle = ink(0.42 * tone); g.beginPath();
          for (let q = 0; q < count; q++) {
            const a = h1(i * 3.1 + q * 0.917) * TAU, r0 = scr(inner(a)), r1 = scr(bandIn(a));
            const at = r0 + (r1 - r0) * (0.12 + 0.76 * h1(q * 2.7 + i)), d = (0.3 + 0.35 * h1(q * 4.9 + i)) * px * Z;
            const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
            g.moveTo(x + d, y); g.arc(x, y, d, 0, TAU);
          }
          g.fill();
        }
      } else if (conifer) {
        // A conifer: resin canals, here and there in the latewood, as small dark dots ringed with paper.
        const lw = (scr(outer(0)) - scr(bandIn(0))) / px / Z;
        // (In the wood's own place and size, so looking closer never adds more or blows them up into
        // rings: a few to a ring, each a small dark fleck in the latewood, a share of its width.)
        if (lw >= 3 && sp.resin) {
          const count = Math.min(40, Math.round(TAU * mr * 0.35));
          g.fillStyle = ink(0.95 * tone);
          for (let q = 0; q < count; q++) {
            const a = h1(i * 5.3 + q * 1.37) * TAU, r0 = scr(bandIn(a)), r1 = scr(outer(a));
            const at = r0 + (r1 - r0) * (0.3 + 0.4 * h1(q * 6.1 + i)), d = (r1 - r0) * (0.12 + 0.08 * h1(q * 3.3 + i));
            if (d < 0.5 * px * Z) continue;
            const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
            g.beginPath(); g.ellipse(x, y, d, d * 0.75, -t, 0, TAU); g.fill();
          }
        }
      } else {
        // Oak's pores: the large open vessels each year opens with didn't take the ink, so in the print
        // they're small, uneven holes along the inner edge of the year's band, crowding and thinning.
        const lw = (scr(outer(0)) - scr(bandIn(0))) / px / Z;
        if (lw >= 2.2) {
          const count = Math.round((TAU * scr(meanR(i - 1)) * SPARSE) / (2.6 * px * Z));
          g.fillStyle = 'rgba(247, 243, 235,0.92)'; g.beginPath();
          for (let q = 0; q < count; q++) {
            if (h1(q * 0.37 + i * 1.7) < 0.28) continue;
            const a = ((q + h1(q * 3.7 + i)) / count) * TAU, r0 = scr(bandIn(a)), r1 = scr(outer(a));
            const at = r0 + (r1 - r0) * (0.04 + 0.16 * h1(q * 5.3 + i) ** 2), d = Math.min((r1 - r0) * 0.16, (0.35 + 0.7 * h1(q * 1.1 + i * 2) ** 2) * px * Z);
            const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
            g.moveTo(x + d, y); g.ellipse(x, y, d, d * (0.6 + 0.5 * h1(q * 8.3)), -t, 0, TAU);
          }
          g.fill();
        }
      }
    }
  }
  drawMarks(v, markK || Z);
  const bk = SPEC[kind].bark;
  if (bk === 'papery') drawBirchBark(v, pt, scr(Rb));
  else {
  // The bark: a thick, rough band outside the wood, fissured, its inner edge (the living layer) a dark line
  // (in plates: fewer, shallower splits, flatter between; the redwood's thick and stringy; the olive's thin).
  // (The bristlecone's gone where it has died back.)
  // (A rough, broken band: thinner than the wood's own measure, its outer edge bitten in and out.)
  const bark = barkOf(n - 1), T = barkCss(v) * px * 1.1, lumps = bk.lumps, live = (a: number) => (kind === 'bristlecone' ? 0.08 + 0.92 * smooth((alive(a) - 0.25) / 0.6) : 1);
  const torn = (a: number) => { const u = (a / TAU) * lumps, i0 = Math.floor(u), f = u - i0, s2 = bk.plate ? (f < 0.85 ? 0 : (f - 0.85) / 0.15) : f * f * (3 - 2 * f); return Math.max(0, ((1 - s2) * h1(i0 % lumps) + s2 * h1((i0 + 1) % lumps)) * 1.25 - 0.25 + 0.35 * (noise(a * 23 + tree.seed * 0.01) - 0.5)) * live(a); };
  g.beginPath();
  // (Broken away in runs, as dried bark comes off a slice: there a ragged sliver left, here its full thickness.)
  const kept2 = (a: number) => 0.18 + 0.82 * smooth((noise(tree.seed * 0.031 + (a / TAU) * 7) - 0.3) / 0.14);
  const thick = (a: number) => T * (0.5 + 0.95 * torn(a)) * live(a) * kept2(a);
  for (let j = 0; j <= K * 3; j++) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a), thick(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K * 3; j >= 0; j--) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a)); g.lineTo(x, y); }
  g.closePath(); g.fillStyle = ink(0.82); g.fill();
  // (Its fissures: splits from the outside in, never evenly spaced: in runs and gaps, some shallow, some
  // through to the wood, each tapering and a little bent, as bark cracks as it stretches.)
  {
    const mean = (TAU * px * Z * bk.mean) / Math.max(1, scr(Rb));
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    let a = h1(tree.seed * 0.17) * TAU, q = 0;
    const end = a + TAU - mean * 0.5;
    while (a < end && q < 4000) {
      const k = q++, out = thick(a), deep = bk.deep[0] + bk.deep[1] * h1(k * 4.4) ** bk.deep[2];
      const w0 = (0.35 + 0.8 * h1(k * 3.1) ** 2) * px * Z * bk.wide, bend = (h1(k * 7.9) - 0.5) * 0.03, R0 = Math.max(1, scr(bark(a)));
      g.beginPath();
      for (let j = 0; j <= 6; j++) { const f = j / 6, [x, y] = pt(a + bend * f * f + (w0 * (1 - f)) / R0, bark(a), out * (1 - deep * f)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
      for (let j = 6; j >= 0; j--) { const f = j / 6, [x, y] = pt(a + bend * f * f - (w0 * (1 - f)) / R0, bark(a), out * (1 - deep * f)); g.lineTo(x, y); }
      g.closePath(); g.fill();
      // (The next: close by in a run, or far off across a smooth stretch.)
      a += mean * (h1(k * 2.3 + 0.7) < 0.7 ? 0.35 + 0.8 * h1(k * 5.7) : 1.6 + 2.2 * h1(k * 6.1));
    }
    g.restore();
  }
  g.strokeStyle = ink(0.95); g.lineWidth = 1 * px * Z; ringPath(v, bark, 0, K * 2); g.stroke();
  }
  // The checks: as a cut slice dries it splits. From the bark in toward the heart, a few cracks opening and
  // running deeper as the years go on (from about the twentieth); and, older, from the heart out, two to four
  // splitting the slice into wedges (from about the ninetieth). Wood parts along its years as readily as across
  // them, so a crack now and then runs a little way along a ring before going on: a step. Widest where it began,
  // jagged at its edges. (The practice only: they belong to an old slice.)
  cracksCut = [];
  if (GROWN && n >= 20) {
    const bark = barkOf(n - 1), T = barkCss(v) * px;
    // (A crack's way, as (angle, mm), `fromHeart` outward or else inward from the bark, to `deep` of the radius;
    // `wide` px where it began, a hairline at its end. Stroked a short piece at a time, each as wide as the crack
    // is there, its ends round, so it turns along a ring and back without a seam.)
    const crack = (q: number, a0: number, deep: number, wide: number, fromHeart: boolean) => {
      // (`a0` its line: moved on only where it steps along a ring.)
      const pts: [number, number][] = [], along: number[] = [];
      let a = a0, f = 0, stepping = 0, dir = 1, held = 0, stepped = false;
      const steps = 60;
      for (let j = 0; j <= steps * 2 && f <= 1; j++) {
        if (stepping > 0) {
          // (Along the ring it met: the radius held at that year's edge, the angle moving on.)
          pts.push([a, barkOf(held)(a)]); along.push(pts.length - 1); a += dir * 0.012; a0 += dir * 0.012; stepping--;
          continue;
        }
        const rr = Math.max(tree.k.pith * 1.5, bark(a) * (fromHeart ? f * deep : 1 - f * deep));
        pts.push([a, rr]);
        f += 1 / steps;
        // (Straight in from the bark, as wood splits along its rays: only a little jagged, never wandering off.)
        a = a0 + (noise(q * 9 + f * 7) - 0.5) * 0.022 + (noise(q * 4 + f * 31) - 0.5) * 0.008;
        // (Once in a while, at a year's edge, it turns along it for a short way.)
        if (f > 0.4 && f < 0.85 && !stepped && h1(q * 5.3 + j * 0.77) < 0.012) {
          stepped = h1(q * 8.1) > 0.4;
          let i = 0; while (i < n - 1 && meanR(i) < rr) i++;
          held = Math.max(0, i - 1); stepping = 2 + Math.floor(h1(q * 2.1 + j) * 4); dir = h1(q * 3.9 + j) < 0.5 ? -1 : 1;
        }
      }
      const L = pts.length;
      for (let j = 1; j < L; j++) {
        const g0 = j / (L - 1), atBark = !fromHeart && j === 1;
        const hw = (wide * (1 - g0) ** 1.3 + 0.35 * px * Z) * (0.75 + 0.5 * h1(q * 3 + j * 0.71)) * (along.includes(j) ? 0.45 : 1);
        g.lineWidth = 2 * hw; g.beginPath();
        g.moveTo(...pt(pts[j - 1][0], pts[j - 1][1], atBark ? T + 2 * px * Z : 0)); g.lineTo(...pt(pts[j][0], pts[j][1])); g.stroke();
        // (Kept in the wood's own measure, for the press mark: see markOf.)
        cracksCut.push([pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], hw / v.s, atBark ? (T + 2 * px * Z) / v.s : 0]);
      }
    };
    g.save(); g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
    const count = Math.min(5, 1 + Math.floor((n - 20) / 70));
    for (let c = 0; c < count; c++) {
      const q = tree.seed * 0.0031 + c * 7.71, age = n - 20 - c * 70;
      const deep = Math.min(0.85, 0.2 + 0.0045 * age + 0.3 * h1(q + 1.3));
      const wide = Math.min(0.03 * scr(Rb), 9 * px * Z) * (0.5 + 0.7 * h1(q + 2.9)) * Math.min(1, 0.35 + age / 90);
      crack(q, h1(q) * TAU, deep, wide, false);
    }
    // (From the heart: two to four, spread round, each opening as the slice ages.)
    if (n >= 90) {
      const hs = 2 + Math.floor(h1(tree.seed * 0.173) * 3), base = h1(tree.seed * 0.71) * TAU;
      for (let c = 0; c < hs; c++) {
        const q = tree.seed * 0.0057 + c * 3.37 + 50, age = n - 90 - c * 40;
        if (age < 0) continue;
        const deep = Math.min(0.75, 0.15 + 0.004 * age + 0.25 * h1(q + 0.9));
        const wide = Math.min(0.035 * scr(Rb), 10 * px * Z) * (0.6 + 0.6 * h1(q + 1.7)) * Math.min(1, 0.4 + age / 100);
        crack(q, base + (c / hs) * TAU + (h1(q * 2.2) - 0.5) * 0.8, deep, wide, true);
      }
    }
    g.restore();
  }
  // The bark come away: as a cut slice dries, its bark parts from the wood, a hairline of paper just inside it,
  // unbroken for long stretches, gone here and there where it still holds. (The practice only, an older slice.)
  if (GROWN && n >= 25 && bk !== 'papery') {
    const bark = barkOf(n - 1), T = barkCss(v), on = smooth((n - 25) / 40);
    g.save(); g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineCap = 'round';
    const N = K * 2;
    for (let j = 0; j < N; j++) {
      const a0 = (j / N) * TAU, a1 = ((j + 1) / N) * TAU, held = noise(tree.seed * 0.013 + (a0 / TAU) * 9);
      if (held > 0.25 + 0.5 * on) continue;
      const out = T * (0.18 + 0.1 * noise(tree.seed * 0.07 + (a0 / TAU) * 23));
      g.lineWidth = (0.5 + 0.6 * on) * px * Z * (0.6 + 0.8 * h1(j * 0.37 + tree.seed));
      g.beginPath(); g.moveTo(...pt(a0, bark(a0), out * px)); g.lineTo(...pt(a1, bark(a1), out * px)); g.stroke();
    }
    g.restore();
  }
  // Round the edge, a faint grey of ink caught from the block's rim and the bark's loose bits: a fine stipple
  // a few px out, thick in places and none in others.
  if (n) {
    // (Fine and sparse, each fleck dragged outward as the brayer left it.)
    const bark = barkOf(n - 1), T = barkCss(v) * px * 0.8, count = Math.round((TAU * scr(Rb) * SPARSE) / (4 * px * Z));
    g.fillStyle = ink(0.45); g.beginPath();
    for (let q = 0; q < count * 1.6; q++) {
      const a = h1(q * 0.917 + tree.seed * 0.01) * TAU;
      if (noise(tree.seed * 0.021 + (a / TAU) * 14) < 0.4) continue;
      const out = T + (1 + 6 * h1(q * 2.31) ** 2) * px * Z, [x, y] = pt(a, bark(a), out), d = (0.18 + 0.3 * h1(q * 5.7) ** 2) * px * Z;
      const rot = -(a + v.turn), long = d * (1.4 + 1.6 * h1(q * 8.9));
      g.moveTo(x + Math.cos(rot) * long, y + Math.sin(rot) * long); g.ellipse(x, y, long, d, rot, 0, TAU);
    }
    g.fill();
  }
  // The press: a hand-pulled print is never evenly pressed. The ink is a little paler toward one side
  // (where the press bore down less), and in a few broad, soft patches; only the ink is lightened.
  {
    const side = h1(tree.seed * 0.731) * TAU, Rs = scr(Rb) + barkCss(v) * px * 2, ox = Math.cos(side + v.turn), oy = -Math.sin(side + v.turn);
    g.save(); g.globalCompositeOperation = 'source-atop';
    const lin = g.createLinearGradient(v.cx - ox * Rs, v.cy - oy * Rs, v.cx + ox * Rs, v.cy + oy * Rs);
    lin.addColorStop(0, 'rgba(247, 243, 235,0)'); lin.addColorStop(0.55, 'rgba(247, 243, 235,0.02)'); lin.addColorStop(1, 'rgba(247, 243, 235,0.1)');
    g.fillStyle = lin; g.fillRect(v.cx - Rs, v.cy - Rs, 2 * Rs, 2 * Rs);
    for (let q = 0; q < 5; q++) {
      const a = h1(tree.seed + q * 3.3) * TAU, d = Rs * (0.2 + 0.6 * h1(q * 7.1 + tree.seed)), rr = Rs * (0.25 + 0.3 * h1(q * 2.9));
      const x = v.cx + d * Math.cos(a), y = v.cy - d * Math.sin(a), rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, `rgba(247, 243, 235,${(0.03 + 0.03 * h1(q * 5.5)).toFixed(3)})`); rad.addColorStop(1, 'rgba(247, 243, 235,0)');
      g.fillStyle = rad; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    g.restore();
    // (And where the block was inked thin, or sat low, the ink starved: a few broad patches where it thins, to
    // be broken by the paper's tooth into a speckle.)
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let q = 0; q < 4; q++) {
      const a = h1(tree.seed * 1.7 + q * 4.1) * TAU, d = Rs * (0.15 + 0.6 * h1(q * 3.9 + tree.seed * 0.3)), rr = Rs * (0.18 + 0.22 * h1(q * 6.3 + tree.seed));
      const x = v.cx + d * Math.cos(a), y = v.cy - d * Math.sin(a), rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, `rgba(0,0,0,${(0.08 + 0.06 * h1(q * 2.2 + tree.seed)).toFixed(3)})`); rad.addColorStop(0.55, `rgba(0,0,0,${(0.04 + 0.03 * h1(q * 2.2 + tree.seed)).toFixed(3)})`); rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    g.restore();
  }
}

/** Birch's bark: thin, pale and papery, a fine dark line within it, flecked with short dark lenticels. */
function drawBirchBark(v: View, pt: (a: number, r: number, dr?: number) => [number, number], Rpx: number): void {
  // (Looked into, the same bark magnified: its lines and lenticels sized at the slice's own scale.)
  const bark = barkOf(tree.rings.length - 1), T = barkCss(v) * px, Z = Math.max(1, look.k);
  g.beginPath();
  for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = pt(a, bark(a), T * (0.9 + 0.15 * Math.sin(31 * a))); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K * 2; j >= 0; j--) { const a = (j / (K * 2)) * TAU, [x, y] = pt(a, bark(a)); g.lineTo(x, y); }
  g.closePath(); g.fillStyle = ink(0.28); g.fill();
  g.strokeStyle = ink(0.85); g.lineWidth = 0.9 * px * Z; ringPath(v, bark, 0, K * 2); g.stroke();
  g.strokeStyle = ink(0.6); g.lineWidth = 0.7 * px * Z; ringPath(v, bark, T / px, K * 2); g.stroke();
  // (The lenticels: short dark dashes along it.)
  const count = Math.round((TAU * Rpx) / (9 * px * Z));
  g.strokeStyle = ink(0.8); g.lineWidth = Math.max(0.7 * px * Z, T * 0.35); g.lineCap = 'butt'; g.beginPath();
  for (let q = 0; q < count; q++) {
    const a = ((q + h1(q * 3.9)) / count) * TAU, len = (2 + 3 * h1(q * 1.7)) * px * Z / Math.max(1, Rpx);
    const [x0, y0] = pt(a, bark(a), T * 0.5), [x1, y1] = pt(a + len, bark(a + len), T * 0.5);
    g.moveTo(x0, y0); g.lineTo(x1, y1);
  }
  g.stroke();
}

/**
 * Oak's years from the real thing: each ring of the slice takes one year of a red oak's cross-section
 * (Hough's, 1888; see wood/CREDITS.md), straightened and turned to ink, stretched to fit the ring from
 * its inner edge to its outer, so its pores open where its year begins, its rays cross it, its latewood
 * prints heavy. Round the ring the wood repeats seamlessly; a run of years shares one scale round, so the
 * rays run on from year to year, and where the slice has doubled in size, a new run begins (as new rays
 * do). Fine rings take a smaller copy of the year, so they never shimmer.
 */
let yearsMemo: { key: string; oak: Years | null; rad: Float32Array; reps: Float32Array; off: Float32Array; yr: Int32Array; lvl: Int32Array; runR: Float32Array; thin: Float32Array; edge: Uint8Array; gapOf: Float32Array; edgeIn: Int32Array; edgeOut: Int32Array; dens: Float32Array } | null = null;
function printYears(v: View, oak: Years | null): void {
  const n = tree.rings.length, c = g.canvas as HTMLCanvasElement, B = 720, Z = Math.max(1, look.k);
  const scr = (r: number) => v.s * warpR(v.warp, r);
  const W0 = oak ? oak.levels[0].w : 1;
  // (Worked out once for a press, never again for each strip of it: the same years, the same view.)
  const last = n ? tree.rings[n - 1] : null;
  const yKey = `${n}|${v.s}|${v.warp?.R ?? 0}|${v.warp?.beta ?? 0}|${Z}|${px}|${kind}|${last ? last[0] + last[K >> 1] : 0}`;
  if (yearsMemo?.key !== yKey || yearsMemo.oak !== oak) {
    // The rings' radii on the screen, round the slice (ring -1 the heart).
    const rad = new Float32Array((n + 1) * (B + 1));
    for (let i = -1; i < n; i++) { const r = barkOf(i); for (let b = 0; b <= B; b++) rad[(i + 1) * (B + 1) + b] = scr(r((b / B) * TAU)); }
    // Each ring's year, scale round and where round it starts; its mip level from its width on the screen.
    // (Round the ring, the wood keeps its own proportions: as many texels to the mm as across the run's
    // years, so a pore stays round and a ray fine.)
    // (On the screen, as the fisheye widens a ring without lengthening it.)
    const reps = new Float32Array(n), off = new Float32Array(n), yr = new Int32Array(n), lvl = new Int32Array(n), runR = new Float32Array(n);
    const widthAt = (i: number) => (scr(meanR(i)) - scr(meanR(i - 1)));
    if (oak) for (let i = 0; i < n; i++) {
      // (Each year's scale from its own place and the last few years' widths, so the wood's
      // grain changes size smoothly out from the heart, never in a step where the slice has doubled; and only
      // from the years before, so a year added never changes them.)
      let wAvg = 0, k = 0;
      for (let j = Math.max(0, i - 8); j <= i; j++) { wAvg += widthAt(j); k++; }
      const R = scr((meanR(i) + meanR(i - 1)) / 2), perPx = oak.year / Math.max(0.5, wAvg / k);
      reps[i] = Math.max(1, Math.round((TAU * R * perPx) / W0)); runR[i] = R;
      // (Its rays: mostly the last year's, drifting a little; now and then a fresh set, as rays end and begin.)
      const fresh = i === 0 || (reps[i] !== reps[i - 1] && h1(i * 1.9) < 0.5) || h1(i * 3.71 + tree.seed * 0.013) < 0.3;
      off[i] = fresh ? h1(i * 7.3 + tree.seed * 0.01) * W0 : off[i - 1] + (h1(i * 5.9) - 0.5) * 0.06 * W0;
      yr[i] = (i * 3) % oak.n;
      const w = (scr(meanR(i)) - scr(meanR(i - 1)));
      lvl[i] = Math.max(0, Math.min(oak.levels.length - 1, Math.ceil(Math.log2(oak.year / Math.max(0.5, w)))));
    }
    // (Years too fine to print apart, a day's ring at the grown tree's scale: as a print takes such wood, a block
    // of ink, darker where the years ran narrow (more latewood to the mm), a little paler where they ran wide;
    // and cut through it, pale, the earlywood of the years wide enough to stand out from those round them, as
    // the hand drew them: never lines ruled at a spacing of their own. Never closer than the screen can part,
    // and never so far apart the block goes blank: past that, the widest year since the last.)
    const thin = new Float32Array(n), edge = new Uint8Array(n), gapOf = new Float32Array(n), dens = new Float32Array(n);
    const wd = new Float32Array(n);
    for (let i = 0; i < n; i++) { wd[i] = Math.max(1e-6, widthAt(i)); thin[i] = 1 - smooth((wd[i] / Z - 1.2 * px) / (3 * px)); }
    // (Each year against the dozen round it.)
    const ratio = new Float32Array(n);
    for (let i = 0, sum = 0, lo = 0, hi = -1; i < n; i++) {
      while (hi < Math.min(n - 1, i + 6)) sum += wd[++hi];
      while (lo < i - 6) sum -= wd[lo++];
      ratio[i] = wd[i] / (sum / (hi - lo + 1));
      dens[i] = Math.max(0.55, Math.min(0.96, 0.8 + 0.45 * (1 - ratio[i])));
    }
    const minGap = 2.6 * px * Z, maxGap = 9 * px * Z;
    let lastR = scr(meanR(-1)), best = -1, bestS = -1;
    const mark = (j: number) => { const Rj = scr(meanR(j)); edge[j] = 1; gapOf[j] = Rj - lastR; lastR = Rj; best = -1; bestS = -1; };
    for (let i = 0; i < n; i++) {
      if (thin[i] <= 0) { lastR = scr(meanR(i)); best = -1; bestS = -1; continue; }
      const gap = scr(meanR(i)) - lastR;
      if (gap < minGap) continue;
      const sc = ratio[i] + 0.12 * h1(i * 1.37 + 0.5);
      if (sc > 1.22) { mark(i); continue; }
      if (sc > bestS) { best = i; bestS = sc; }
      if (gap >= maxGap && best >= 0) mark(best);
    }
    // (A line is wider than the years it lies among: each ring knows the nearest lines in and out.)
    const edgeIn = new Int32Array(n).fill(-1), edgeOut = new Int32Array(n).fill(-1);
    for (let i = 0, e = -1; i < n; i++) { edgeIn[i] = e; if (edge[i]) e = i; }
    for (let i = n - 1, e = -1; i >= 0; i--) { if (edge[i]) e = i; edgeOut[i] = e; }
    yearsMemo = { key: yKey, oak, rad, reps, off, yr, lvl, runR, thin, edge, gapOf, edgeIn, edgeOut, dens };
  }
  const { rad, reps, off, yr, lvl, runR, thin, edge, gapOf, edgeIn, edgeOut, dens } = yearsMemo;
  // (The sapwood, paler, fading into the heartwood over some eight years: a year added shifts it by a hair.)
  const tone = (i: number) => 1 - 0.16 * smooth((i - (n - 9)) / 8) * smooth((n - 12) / 8);
  let rmax = 0;
  for (let b = 0; b <= B; b++) rmax = Math.max(rmax, rad[n * (B + 1) + b]);
  const x0 = Math.max(0, Math.floor(v.cx - rmax - 1)), y0 = Math.max(0, Math.floor(v.cy - rmax - 1));
  const w = Math.min(c.width, Math.ceil(v.cx + rmax + 1)) - x0, h = Math.min(c.height, Math.ceil(v.cy + rmax + 1)) - y0;
  if (w <= 0 || h <= 0) return;
  const ctx = c.getContext('2d')!;
  const at = (i: number, b: number, f: number) => { const k = (i + 1) * (B + 1) + b; return rad[k] + (rad[k + 1] - rad[k]) * f; };
  // (Never ruled: the wood wanders a little, here and there, every ring with its neighbours, as grain
  // swells round a knot or a bit of reaction wood: a shift of the rings, a fifth of a year or so, over a
  // few mm, in the wood's own place (so it stays put as the slice is looked into), fading out at the bark.)
  // (The drawn woods: each year built as its kind's is, from the earlywood out to the latewood and its edge,
  // with its rays, pores and real fibre; all in the slice's own px (`U`), so looked into they're the same,
  // larger, never a fresh scatter.)
  // (The wood's marks laid in the wood itself, never moved by a year added: the rays in its own millimetres
  // (`WOOD` to the mm), as real rays run on from year to year, more of them as the trunk widens; the finer grain
  // and pores at the slice's own scale to the nearest doubling (`SNAP`), so they keep still from day to day.)
  const WOOD = 1 / 2.7, SNAP = 2 ** Math.round(Math.log2(Math.max(1e-6, v.s / (px * Z))));
  // (A ray's width though is the screen's: as fine as a print shows one, broadening a little only as it's looked into.)
  const RAYK = (v.s / (px * Z)) / WOOD, RAYW = Math.pow(Z, -0.4);
  const an = oak ? null : ANATOMY[kind] ?? ANATOMY.cherry!, fib = wood.fibre[kind], U = px * Z, conifer = fam() === 'conifer', RAY = RAYS[kind] ?? 0;
  const drawnInk = (i: number, a: number, _r: number, across: number, _heart: boolean, width: number, dx: number, dy: number, rmid: number, rho: number): number => {
    const A = an!;
    // The year: earlywood, a little deeper as it goes, then darkening into the latewood, ending sharp.
    // (As a relief print takes it: the latewood a bold band of ink, its inner edge never ruled but wandering
    // along the year, dry and ragged; the earlywood mostly the paper, the ink bleeding into it in blotches
    // beside the band; and the band itself starved here and there to flecks of paper. As gpu.ts presses it.)
    // (Laid round the ring at its own radius, never the point's, so nothing shears into slants; and closing on
    // itself where the angle comes round.)
    const rr = rmid, wd = Math.max(1e-3, width), wrap = smooth((a - (TAU - 0.4)) / 0.4);
    const rn = (kx: number, ox: number, y: number) => { const n0 = vnoise(a * rr * kx + ox, y); return wrap > 0 ? n0 + (vnoise((a - TAU) * rr * kx + ox, y) - n0) * wrap : n0; };
    // (Every year its own: some thin and pale, some broad and heavy.)
    const yv = h1(i * 1.37 + 0.71), heavy = 0.82 + 0.3 * h1(i * 2.91 + 0.3);
    const share = (conifer ? Math.min(0.85, A.share * (0.6 + 0.8 * calmOf(i))) : A.share) * (0.65 + 0.7 * yv);
    const rag = 0.5 * (rn(0.07, i * 7.1, i * 3.3) - 0.5) + 0.3 * (rn(0.3, i * 2.3, i * 1.7 + 5) - 0.5) + 0.2 * (rn(1.1, i * 0.7, rho * 0.4) - 0.5);
    const start = 1 - share * (1 + 1.4 * rag), soft = Math.max(0.035, (0.7 * U) / wd);
    // (Its edge torn in short, irregular bites.)
    const fray = rn(0.7, i * 3.1, rho * 0.7) - 0.5 + 0.7 * (rn(1.9, i, rho * 1.9 + 3) - 0.5);
    const band = smooth((across - start) / soft + 0.5 + (((1.6 * U) / wd) * fray) / soft * 0.5);
    let ink = A.early * 0.3 * (0.8 + 0.4 * across) + (A.late * 1.08 * heavy - A.early * 0.3) * band;
    // (Bled beside it in black specks and blots, never a grey; starved inside it to small specks of paper.)
    const near = smooth((across - (start - 0.45)) / 0.45) * (1 - band);
    ink += near * smooth((rn(0.5, i * 4.3, rho * 0.5 + i) - 0.74) / 0.04) * smooth((rn(1.6, 0, rho * 1.6 + i) - 0.35) / 0.05);
    ink *= 1 - band * smooth((rn(0.9, i * 9.7, rho * 0.9) - 0.8) / 0.04);
    ink *= 1 - 0.7 * band * smooth((rn(2.2, i * 5.9, rho * 2.2 + 11) - 0.9) / 0.04);
    // (The pale wood between: the grain's fine lines faintly inked along the year, broken.)
    ink = Math.max(ink, (1 - band) * 0.9 * smooth((rn(0.6, i * 2.7, rho * 1.8 + 7) - 0.9) / 0.03) * smooth((rn(0.25, 3, rho * 0.25) - 0.55) / 0.1));
    if (A.mottle) ink *= 1 + A.mottle * (vnoise(dx / (22 * U) + 3.1, dy / (22 * U) + 7.7) - 0.5) * 2;
    // Pores: open vessels, paper in the print, scattered (or gathered at the year's start), in the wood's place.
    if (A.pores) {
      const C = 3, ci = Math.floor(rho / C), cj = Math.floor((a * rho) / C), hh = h1(ci * 7.31 + cj * 1.713 + i * 0.37);
      if (hh < A.pores * SPARSE * Math.max(0, 1 + A.poreEarly * (1 - 2 * across))) {
        const cr = (ci + 0.2 + 0.6 * h1(hh * 91.3)) * C, ca = (cj + 0.2 + 0.6 * h1(hh * 53.7)) * C, pr = A.poreR * (0.6 + 0.8 * h1(hh * 17.1));
        const dd = Math.hypot(rho - cr, a * rho - ca) / pr;
        if (dd < 1.4) ink *= Math.min(1, Math.max(0.05, dd - 0.4));
      }
    }
    return Math.max(0, ink);
  };
  // (The wandering set by the tree's own steady year, never its mean so far: a year added never moves the rest.)
  const yearMm = tree.wRef, wA = 0.22 * yearMm * v.s, wL = 1 / (Math.max(2.2, 3 * yearMm) * v.s), wL2 = wL * 2.7;
  // (A fine year's line on its edge, drawn smooth across the pixels, a little heavier or lighter than the
  // next, and its weight wandering with the press.)
  const half = new Float32Array(n);
  // (The pale line a year's earlywood: some a seventh of the block it parts, never under a pixel across.)
  for (let j = 0; j < n; j++) half[j] = Math.max(0.5 * px * Z, 0.14 * gapOf[j]) * (0.85 + 0.3 * h1(j * 3.7 + 1.1));
  const lineAt = (j: number, dist: number) => (j < 0 || !edge[j] ? 0 : Math.max(0, Math.min(1, (half[j] + 0.5 * px - dist) / px)) * Math.min(1, 2 * thin[j]));
  // (On the graphics chip, where there is one: the same, every pixel at once.)
  if (gpu.ready()) {
    const ring = new Float32Array(Math.max(1, n) * 14);
    for (let i = 0; i < n; i++) ring.set([reps[i], off[i], yr[i], lvl[i], runR[i], thin[i], edge[i], half[i], edgeIn[i], edgeOut[i], tone(i), conifer ? calmOf(i) : 0.5, meanR(i), dens[i]], i * 14);
    const A = an ?? ANATOMY.cherry!, lv = oak ? oak.levels : [], LV = Math.min(12, lv.length), run = RAY_RUN[kind] ?? [20, 0.3];
    const lvO = new Int32Array(12), lvW = new Int32Array(12).fill(1), lvH = new Int32Array(12).fill(1), lvRows = new Int32Array(12).fill(1);
    for (let k = 0, o = 0; k < LV; k++) { lvO[k] = o; lvW[k] = lv[k].w; lvH[k] = lv[k].h; lvRows[k] = lv[k].rows; o += lv[k].w * lv[k].h; }
    const pic = gpu.run('years', w, h,
      { uN: n, uB: B, uOak: oak ? 1 : 0, uFamRing: fam() === 'ring' ? 1 : 0, uConifer: conifer ? 1 : 0, uHasFib: fib ? 1 : 0, uFibW: fib?.w ?? 1, uFibH: fib?.h ?? 1, uOakN: oak?.n ?? 1, uLvN: Math.max(1, LV), uLvO: lvO, uLvW: lvW, uLvH: lvH, uLvRows: lvRows },
      { uPithMM: meanR(-1), uSnap: SNAP, uWood: WOOD, uRayK: RAYK, uRayW: RAYW, uX0: x0, uY0: y0, uH: h, uCx: v.cx, uCy: v.cy, uTurn: v.turn, uRmax: rmax, uWA: wA, uWL: wL, uWL2: wL2, uU: U, uPx: px, uW0: W0, uRay: RAY, uRun0: run[0], uRun1: run[1], uSparse: SPARSE,
        uEarly: A.early, uLate: A.late, uShare: A.share, uEdge: A.edge, uPores: A.pores, uPoreR: A.poreR, uPoreEarly: A.poreEarly, uFibre: A.fibre, uMottle: A.mottle, uSharp: A.sharp ?? 1.4, uInkRGB: [INK[0] / 255, INK[1] / 255, INK[2] / 255] },
      { uNoise: { key: NOISE, data: () => NOISE }, uRad: { name: 'rad', data: rad }, uRing: { name: 'ring', data: ring },
        uLev: oak ? { key: oak, data: () => atlasOf(oak) } : { key: NONE, data: () => NONE }, uFib: fib ? { key: fib, data: () => fib.d } : { key: NONE, data: () => NONE } });
    if (pic) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; gpu.lay(ctx, pic, x0, y0); ctx.restore(); return; }
  }
  const img = ctx.getImageData(x0, y0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const dy = v.cy - (y + y0);
    for (let x = 0; x < w; x++) {
      const dx = x + x0 - v.cx;
      let r = Math.sqrt(dx * dx + dy * dy);
      if (r > rmax) continue;
      let a = Math.atan2(dy, dx) - v.turn;
      a = ((a % TAU) + TAU) % TAU;
      const fb = (a / TAU) * B, b = Math.min(B - 1, Math.floor(fb)), f = fb - b;
      if (wA > 0.3 && r < at(n - 1, b, f)) {
        const fade = smooth((at(n - 1, b, f) - r) / (3 * wA)) * smooth(r / (6 * wA + 1));
        r += fade * wA * (1.4 * (vnoise(dx * wL + 13.1, dy * wL + 7.7) - 0.5) + 0.6 * (vnoise(dx * wL2 + 3.3, dy * wL2 + 41.9) - 0.5));
      }
      if (r >= at(n - 1, b, f)) continue;
      // (Which ring: the first whose outer edge lies beyond; inside the first, the heart, the seedling's
      // first year, from the pith out, its rays the first ring's run on in.)
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (at(m, b, f) > r) hi = m; else lo = m + 1; }
      const heart = r < at(-1, b, f), i = heart ? 0 : lo, rin = heart ? 0 : at(i - 1, b, f), rout = heart ? at(-1, b, f) : at(i, b, f);
      // (Where the point lies in the wood itself (mm): its marks never moved by a year added.)
      const rinM = heart ? 0 : i === 0 ? meanR(-1) : meanR(i - 1), routM = heart ? meanR(-1) : meanR(i);
      // (A wide young year printed as one is: mostly pale earlywood, the year's dark latewood only its outer part,
      // never a broad black band; as gpu.ts presses it.)
      const acr0 = (r - rin) / Math.max(1e-3, rout - rin), wpx = rout - rin, cap = Math.min(wpx, 9 * U + 0.36 * wpx), wide = !heart && wpx > cap + 0.5;
      const across = wide ? Math.max(0, 1 - ((1 - acr0) * wpx) / cap) : acr0, mm = rinM + acr0 * (routM - rinM), rrM = (rinM + routM) / 2, year = !oak ? 0 : heart ? (yr[0] + oak.n - 1) % oak.n : yr[i];
      // (Never evenly round: a gentle stretch and squeeze round each ring, its own, so the rays fall
      // unevenly and bend a little from year to year. The heart, soft: a blurred year, no rays meeting.)
      // (Toward the middle, a ring's wood is drawn in ever tighter round: there it takes a softer copy, so
      // it never gathers into a star.)
      let ink: number;
      if (oak) {
        const tight = r < runR[i] ? Math.ceil(Math.log2(runR[i] / Math.max(1, r))) : 0;
        const L = oak.levels[Math.min(oak.levels.length - 1, lvl[i] + tight + (heart ? 3 : 0))], rows = L.rows;
        const wob = (0.09 * Math.sin(2 * a + i * 1.7) + 0.06 * Math.sin(3 * a + i * 2.9 + 1) + 0.04 * Math.sin(5 * a + i * 0.6)) * W0;
        // (As the drawn woods print: every year its own, its edge torn in short bites, the wood laid round the ring
        // at its own radius; as gpu.ts presses it.)
        const rr = rrM * SNAP, wd = Math.max(1e-3, wide ? cap : rout - rin), yv = h1(i * 1.37 + 0.71), heavy = 0.85 + 0.3 * h1(i * 2.91 + 0.3), wrap = smooth((a - (TAU - 0.4)) / 0.4);
        const rn = (kx: number, ox: number, y: number) => { const n0 = vnoise(a * rr * kx + ox, y); return wrap > 0 ? n0 + (vnoise((a - TAU) * rr * kx + ox, y) - n0) * wrap : n0; };
        const fray = rn(0.7, i * 3.1, rr * 0.7) - 0.5 + 0.7 * (rn(1.9, i, rr * 1.9 + 3) - 0.5);
        const acr = heart ? across : Math.max(0, Math.min(1, Math.pow(Math.max(0, Math.min(1, across + ((1.4 * U) / wd) * fray)), 0.7 + 0.6 * yv)));
        // (Read a little either way along the year and averaged: never a comb of teeth or a row of white channels.)
        const u0 = (((a / TAU) * reps[i] * W0 + off[i] + wob * reps[i] * 0.15) * L.w) / W0, sp = 0.012 * L.w, yy = year * rows + acr * rows, top = year * rows;
        ink = 0;
        for (let q = -2; q <= 2; q++) ink += sample(L, u0 + q * sp, yy, top, rows) * (q === 0 ? 0.28 : q * q === 1 ? 0.2 : 0.16);
        // (Oak's and ash's springwood opened toward the paper, their latewood kept heavy: the year reads as a band.)
        if (fam() === 'ring') ink = Math.pow(Math.max(0, ink), 1 + 1.2 * (1 - smooth((acr - 0.35) / 0.45)));
        // (Ink taken or not, never a grey wash; starved to small specks of paper.)
        ink = smooth((ink * heavy - 0.32) / 0.4) * (1 - 0.95 * smooth((rn(0.9, i * 9.7, mm * SNAP * 0.9) - 0.76) / 0.04)) * (1 - 0.8 * smooth((rn(2.2, i * 5.9, mm * SNAP * 2.2 + 11) - 0.84) / 0.04));
        // (The heart: a pale pith ringed by its first dark edge, never a stretched copy of the year.)
        if (heart) ink = 0.92 * smooth((across - 0.62) / 0.22) * (1 - 0.8 * smooth((rn(1.2, 3, mm * SNAP * 1.2) - 0.78) / 0.05));
        ink *= tone(i);
      } else ink = drawnInk(i, a, r, across, heart, cap, dx, dy, rrM * SNAP, mm * SNAP) * tone(i);
      if (wide) {
        // (The earlywood: the paper, its grain's fine lines faintly taken, broken.)
        const wrap2 = smooth((a - (TAU - 0.4)) / 0.4), rr2 = rrM * SNAP;
        const rn2 = (kx: number, ox: number, y: number) => { const n0 = vnoise(a * rr2 * kx + ox, y); return wrap2 > 0 ? n0 + (vnoise((a - TAU) * rr2 * kx + ox, y) - n0) * wrap2 : n0; };
        const pale = 0.85 * smooth((rn2(0.6, i * 2.7, mm * SNAP * 1.8 + 7) - 0.8) / 0.04) * smooth((rn2(0.25, 3, mm * SNAP * 0.25) - 0.4) / 0.12);
        ink += (pale * tone(i) - ink) * smooth((1 - cap / wpx - acr0) * wpx / (2.5 * U));
      }
      if (!heart && thin[i] > 0) {
        // (A block of ink, as dark as its years ran narrow; cut through by the pale lines of the wide ones.)
        ink += (dens[i] * tone(i) - ink) * thin[i];
        const jo = edgeOut[i], ji = edgeIn[i];
        const cov = Math.max(jo < 0 ? 0 : lineAt(jo, at(jo, b, f) - r), ji < 0 ? 0 : lineAt(ji, r - at(ji, b, f))) * (0.75 + 0.35 * vnoise(dx * 0.11 + i, dy * 0.11));
        if (cov > 0) ink = Math.min(ink, 1 - 0.92 * Math.min(1, cov));
      }
      // The rays: the wood's fine radial lines, open to the paper, crossing every year, so the latewood prints
      // as a run of small bricks.
      // (The drawn woods' rays fine and sparing, as a print shows them: the years' bands run on through them.)
      // (The rays fine, as a print shows them, and ending short of the bark; the scanned woods' own rays already there.)
      if (RAY && !heart) ink *= 1 - RAY * (oak ? 0.6 : 0.55) * rayAt(a, mm * WOOD, RAY_RUN[kind], RAYK, RAYW) * (i === n - 1 ? 1 - smooth((across - 0.55) / 0.4) : 1);
      const k = (y * w + x) * 4;
      d[k] = INK[0]; d[k + 1] = INK[1]; d[k + 2] = INK[2]; d[k + 3] = Math.round(255 * Math.min(1, ink));
    }
  }
  ctx.putImageData(img, x0, y0);
}

/**
 * The slice's print, ink only, on an 8 × 10 inch sheet at 300 dpi (for the choosing slices, made from it:
 * `scripts/wood/slices-make.cjs`).
 */
const INK_PRINT = [24, 20, 18];
async function yearPrint(): Promise<HTMLCanvasElement> {
  const Wp = 2400, Hp = 3000, P = 4, out = document.createElement('canvas'); out.width = Wp; out.height = Hp;
  const c = out.getContext('2d')!, was = { g, px, W, H };
  // (On a sheet of the warm white a print is pulled on, as the screen's paper but brighter.)
  c.fillStyle = '#f8f5ef'; c.fillRect(0, 0, Wp, Hp);
  const R = barkMax(), v: View = { cx: Wp / 2, cy: Hp * 0.44, s: (Wp * 0.37) / Math.max(1e-6, R), turn: 0, px: P };
  const lay = document.createElement('canvas'); lay.width = Wp; lay.height = Hp;
  g = lay.getContext('2d')!; px = P; W = Wp; H = Hp;
  try { if (tree.rings.length) { drawPrint(v); inkGrain(lay, v); } } finally { g = was.g; px = was.px; W = was.W; H = was.H; }
  // (Ink only: whatever the slice laid in the paper's colour is no ink at all; the rest, one ink.)
  const lc = lay.getContext('2d')!, img = lc.getImageData(0, 0, Wp, Hp), d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    const lum = (d[k] + d[k + 1] + d[k + 2]) / 3, amount = (d[k + 3] / 255) * Math.max(0, Math.min(1, (232 - lum) / (232 - 36)));
    d[k] = INK_PRINT[0]; d[k + 1] = INK_PRINT[1]; d[k + 2] = INK_PRINT[2]; d[k + 3] = Math.round(255 * amount);
  }
  lc.putImageData(img, 0, 0);
  c.drawImage(lay, 0, 0);
  // (Pencilled under it, as a printmaker signs a sheet: the wood and its days at the left, the edition at the right.)
  if (tree.rings.length && days.length) {
    const fmt = (d: string) => dayDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const first = fmt(days[0]), last = fmt(days[days.length - 1]), when = first === last ? first : `${first} – ${last}`;
    c.fillStyle = 'rgba(92,88,84,0.82)'; c.font = `italic ${46}px Newsreader, "Iowan Old Style", Georgia, serif`; c.textBaseline = 'alphabetic';
    const y = Math.min(Hp - 150, v.cy + v.s * R + 260);
    c.textAlign = 'left'; c.fillText(`${kind}, ${tree.rings.length} ${tree.rings.length === 1 ? 'ring' : 'rings'}, ${when}`, 230, y);
    c.textAlign = 'right'; c.fillText('1/1', Wp - 230, y);
  }
  return out;
}

/**
 * The print, looked at: the slice pressed large on a sheet of its own, pencilled under, as the artist's prints
 * are; to keep (the share sheet, or a download), or let go of. A long press on the slice brings it.
 */
const printView = (() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(236,230,218,0.97);opacity:0;transition:opacity 0.6s ease;font:italic 15px Newsreader,"Iowan Old Style",Georgia,serif;color:rgba(46,33,24,0.62);padding:calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));box-sizing:border-box';
  const sheet = document.createElement('img');
  sheet.alt = 'This tree, printed on a sheet';
  sheet.style.cssText = 'max-width:min(92vw,520px);max-height:76vh;box-shadow:0 1px 2px rgba(46,33,24,0.12),0 8px 28px rgba(46,33,24,0.12);background:#f8f5ef';
  const note = document.createElement('div'); note.textContent = 'pressing the print…';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:36px';
  const keepB = document.createElement('button'), backB = document.createElement('button');
  for (const b of [keepB, backB]) b.style.cssText = 'font:inherit;color:inherit;background:none;border:0;padding:12px 6px;cursor:pointer';
  keepB.textContent = 'keep this print'; backB.textContent = 'back';
  row.append(keepB, backB); el.append(sheet, note, row); document.body.append(el);
  let blob: Blob | null = null, url = '';
  const close = () => { el.style.opacity = '0'; window.setTimeout(() => { el.style.display = 'none'; if (url) URL.revokeObjectURL(url); url = ''; sheet.removeAttribute('src'); blob = null; }, 600); };
  backB.onclick = close;
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  keepB.onclick = async () => {
    if (!blob) return;
    const how = await shareFile(blob, `well-rounded-${kind}-${dayOf()}.png`, 'image/png');
    if (how === 'shared' || how === 'downloaded') note.textContent = 'Kept.';
    else if (how === 'failed') note.textContent = 'It couldn’t be kept just now.';
  };
  return {
    get open() { return el.style.display !== 'none'; },
    async show(): Promise<void> {
      if (el.style.display !== 'none') return;
      hush(); blob = null; note.textContent = 'pressing the print…'; keepB.style.visibility = 'hidden';
      el.style.display = 'flex'; requestAnimationFrame(() => { el.style.opacity = '1'; });
      // (A breath first, so the sheet's fading in is never caught by the pressing.)
      await new Promise((r) => setTimeout(r, 80));
      const c = await yearPrint();
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (!blob) { note.textContent = 'The print couldn’t be pressed just now.'; return; }
      url = URL.createObjectURL(blob); sheet.src = url; note.textContent = ''; keepB.style.visibility = '';
    },
  };
})();

/** The real wood's years, pressed from a scan (see printYears): oak's and ash's, once loaded. */
const realYears = () => wood.years[kind];

/**
 * The ink's grain: printed from wood, ink lies in the grain's fine streaks along each ring, heavier and
 * lighter, starved to the paper here and there, its edges breaking a little. Laid into the ink (dark
 * pixels only; paper-coloured marks left as they are) of a canvas `c` holding the slice drawn for view `v`.
 */
function inkGrain(c: HTMLCanvasElement, v: View, band?: [number, number], soft = 1): void {
  const n = tree.rings.length, last = n ? tree.rings[n - 1] : null, rbMm = meanR(n - 1);
  let rmax = tree.k.pith;
  if (last) for (let i = 0; i < K; i++) rmax = Math.max(rmax, last[i]);
  const R = v.s * warpR(v.warp, rmax) + (barkCss(v) * 1.6 + 6) * px;
  const x0 = Math.max(0, Math.floor(v.cx - R));
  let y0 = Math.max(0, Math.floor(v.cy - R));
  const w = Math.min(c.width, Math.ceil(v.cx + R)) - x0;
  let h = Math.min(c.height, Math.ceil(v.cy + R)) - y0;
  // (Only these rows, if asked: the press done a band at a time.)
  if (band) { const ya = Math.max(y0, Math.floor(band[0])), yb = Math.min(y0 + h, Math.ceil(band[1])); y0 = ya; h = yb - ya; }
  if (w <= 0 || h <= 0) return;
  const ctx = c.getContext('2d')!;
  // (The grain and the starved streaks belong to the wood, set at the unzoomed print's scale: looked into,
  // they grow with it and stay where they were, never a fresh scatter.)
  const Z = Math.max(1, look.k), fine = 1 / (0.8 * px * Z), along = 1 / (12 * px * Z), speck = 1 / (0.8 * px * Z), streak = 1 / (5 * px * Z);
  // (Oak's real wood carries its own grain: only its bark takes this. Pine's grain is its real fibre.)
  let inside = 0;
  // (Oak's and ash's real wood carries its own grain: only their bark takes this.)
  if ((realYears() || fam() !== 'ring') && last) { inside = Infinity; for (let i = 0; i < K; i += 4) inside = Math.min(inside, v.s * warpR(v.warp, last[i]) - 1); }
  const fib = fam() !== 'ring' ? wood.fibre[kind] : undefined, perMm = 20 / v.s;
  // The press: the paper's tooth (some 0.12 mm, never finer than a pixel), the pressure wandering
  // across the block, and the saw's marks, faint arcs from a far-off blade (seen only looking close).
  const tooth = 1 / Math.max((0.9 * px * Z) / v.s, 0.12), low = 1 / 45, SAW = 1.8;
  // (How the ink took, from a real print: Munch's, 1898, about a quarter mm to a texel, never finer than a
  // pixel; his sea's mottle and sparse specks, his field's grain and streaks over it, the two at their own
  // scales and turned to each other, so neither repeats in step.)
  const sea = wood.sea, field = wood.field, perTex = 1 / Math.max((px * Z) / v.s, 0.24), close = Math.max(0, Math.min(1, (0.24 / ((px * Z) / v.s) - 1) / 2));
  const fc = Math.cos(0.5 + h1(tree.seed * 0.29)), fs = Math.sin(0.5 + h1(tree.seed * 0.29));
  const cg = (2.7 * v.s) / (Z * px), sawK = 0.07 * Math.max(0, Math.min(1, ((SAW * v.s) / Z - 3 * px) / (4 * px))), sa = h1(tree.seed * 0.61) * TAU;
  const sx = 900 * Math.cos(sa), sy = 900 * Math.sin(sa);
  // (On the graphics chip, where there is one: the same, every pixel at once.)
  if (gpu.ready()) {
    const pic = gpu.run('grain', w, h,
      { uSx0: x0, uSy0: y0, uHasFib: fib ? 1 : 0, uFibW: fib?.w ?? 1, uFibH: fib?.h ?? 1, uHasSea: sea && field ? 1 : 0, uSeaW: sea?.w ?? 1, uSeaH: sea?.h ?? 1, uFieldW: field?.w ?? 1, uFieldH: field?.h ?? 1 },
      { uRb: rbMm, uX0: x0, uY0: y0, uH: h, uCx: v.cx, uCy: v.cy, uInside: Math.min(1e9, inside), uPerMm: perMm, uFine: fine, uAlong: along, uSpeck: speck, uStreak: streak, uTooth: tooth, uLow: low, uPerTex: perTex, uClose: close, uCg: cg, uFc: fc, uFs: fs, uSawK: sawK, uSx: sx, uSy: sy, uSaw: SAW, uSoft: soft, uVs: v.s },
      { uNoise: { key: NOISE, data: () => NOISE }, uFib: fib ? { key: fib, data: () => fib.d } : { key: NONE, data: () => NONE }, uSea: sea ? { key: sea, data: () => sea.d } : { key: NONE, data: () => NONE }, uField: field ? { key: field, data: () => field.d } : { key: NONE, data: () => NONE } },
      c);
    if (pic) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(x0, y0, w, h); gpu.lay(ctx, pic, x0, y0); ctx.restore(); return; }
  }
  const img = ctx.getImageData(x0, y0, w, h), d = img.data, d0 = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    const dy = y + y0 - v.cy;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, a = d[k + 3];
      if (a < 8) {
        // (Beside the ink, the paper: here and there the ink spread into it along the paper's own fibres, a fine
        // broken fringe, so no edge is ever clean.)
        let bk = -1, ba = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const kk = (yy * w + xx) * 4;
          if (d0[kk + 3] > ba) { ba = d0[kk + 3]; bk = kk; }
        }
        if (bk >= 0 && ba > 153 && d0[bk] + d0[bk + 1] + d0[bk + 2] < 380) {
          const dx = x + x0 - v.cx, fr = vnoise((dx / v.s) * tooth * 0.6 + 3.7, (dy / v.s) * tooth * 0.6 + 8.1);
          if (fr > 0.6) { const al = 0.85 * smooth((fr - 0.6) / 0.1); d[k] = d0[bk]; d[k + 1] = d0[bk + 1]; d[k + 2] = d0[bk + 2]; d[k + 3] = Math.round(255 * al); }
        }
        continue;
      }
      if (d[k] + d[k + 1] + d[k + 2] > 380) continue;
      const dx = x + x0 - v.cx, r = Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dy, dx);
      // (Across the seam at the left, blended.)
      const seam = Math.max(0, (Math.abs(th) - (Math.PI - 0.25)) / 0.25);
      let f: number;
      if (r < inside) f = 1;
      else if (fib) {
        // Pine: its fibre, from the real slice, round the ring.
        const at = (t: number) => sample(fib, t * r * perMm, r * perMm);
        let gr = at(th);
        if (seam > 0) gr += (at(th - Math.sign(th) * TAU) - gr) * seam * 0.5;
        f = 1 + 0.7 * (gr - 0.5);
      } else {
        // (Streaks along the ring: fine across it, long along it.)
        const at = (t: number) => 0.55 * vnoise(r * fine, t * r * along) + 0.45 * vnoise(r * fine * 0.35 + 31.7, t * r * along * 0.25 + 7.1);
        let gr = at(th);
        if (seam > 0) gr += (at(th - Math.sign(th) * TAU) - gr) * seam * 0.5;
        // (Mostly solid, as a pressed block prints; only fine dry streaks where the grain stands low.)
        const e = Math.min(1, Math.max(0, (gr - 0.6) / 0.16));
        f = 1.08 - 0.5 * e * e * (3 - 2 * e);
      }
      // (Here and there the ink starved: short pale streaks along the grain, never round dots.)
      if (r >= inside) {
        const st = vnoise(r * speck + 91, th * r * streak + 13);
        if (st > 0.86) f *= 1 - 0.75 * Math.min(1, (st - 0.86) / 0.06);
      }
      // Pressed: the ink took, or it didn't, the paper's tooth and the press deciding which where the
      // block was lightly inked (so a pale tone prints as a scatter of ink, as it does, never as grey).
      const val = r < inside ? (a / 255) * f : Math.pow(Math.min(1, (a / 255) * f), 0.75);
      const mx = dx / v.s, my = dy / v.s;
      const t1 = 0.6 * vnoise(mx * tooth + 5.1, my * tooth + 9.7) + 0.4 * vnoise(mx * tooth * 2.3 + 17.3, my * tooth * 2.3 + 3.1);
      const saw = sawK ? sawK * Math.sin(TAU * (Math.hypot(mx - sx, my - sy) / SAW + 0.8 * vnoise(mx * 0.3, my * 0.3))) : 0;
      let took = val;
      if (sea && field) {
        const u = mx * perTex, w = my * perTex;
        took = val * (0.84 + 0.2 * tile(sea, u + 17, w + 31) * (0.75 + 0.25 * tile(field, (u * fc - w * fs) * 0.8, (u * fs + w * fc) * 0.8)));
        // (Looked at closer than the print's own grain: finer grain, at the screen's scale, so it stays crisp.)
        if (close > 0) took *= 1 + close * 0.22 * (vnoise(mx * cg + 3.3, my * cg + 7.1) - 0.5);
      }
      // (The press's own pressure, wandering over the block in wide soft drifts, as a hand-burnished print's
      // does: here it took lightly, a pale patch broken to specks; there it bore down, the ink full.)
      // (In drifts as wide as a third of the slice: between two sizes a doubling apart, blended by its size, so
      // a year added never moves them.)
      const lp = Math.log2(Math.max(4, 0.35 * rbMm)), lk = Math.floor(lp), L1 = 2 ** lk, L2 = L1 * 2;
      const P0 = 0.65 * vnoise(mx / L1 + 71, my / L1 + 19) + 0.35 * vnoise(mx / (0.4 * L1) + 5, my / (0.4 * L1) + 44);
      const P1 = 0.65 * vnoise(mx / L2 + 13, my / L2 + 57) + 0.35 * vnoise(mx / (0.4 * L2) + 29, my / (0.4 * L2) + 3);
      const P = 0.5 + (P0 + (P1 - P0) * (lp - lk) - 0.5) * 1.35;
      const thr = 0.5 + (sea ? 0.22 : 0.95) * (t1 - 0.5) + 0.2 * (vnoise(mx * low + 40, my * low + 11) - 0.5) + saw + 0.24 * smooth((0.44 - P) / 0.16) - 0.06 * smooth((P - 0.6) / 0.15);
      // (Took or not, sharply; `soft` keeps a pixel or so of the edge's own shading, for a print that's
      // shown larger than it was pressed, so it's never stepped.)
      const e = Math.max(0, Math.min(1, (took - thr + 0.07 * soft) / (0.14 * soft)));
      d[k + 3] = Math.round(255 * e * e * (3 - 2 * e));
    }
  }
  ctx.putImageData(img, x0, y0);
}

/** The print, kept as a picture between changes; while the slice moves, the picture moves with it. */
const printCaches: Record<string, Kept> = {};
/** Whether a kept picture, drawn for view `v`, still covers the whole screen. */
/**
 * A kept print's picture covers more than the sheet (`MARGIN` of it each way, so a pinch back out needs no
 * new one), at a resolution fixed for the phone (`QUALITY`: two device pixels a CSS px at most, which the
 * eye can't tell from three, and the same everywhere, never a blown-up copy). Where it lies for view `v`.
 */
const MARGIN = 1.5;
/** How long each pressing took (ms), for looking into the app's pace. */
const presses: number[] = [];
// (Looked into, the print is pressed less finely: there the wood's own scan is coarser than the screen, so a
// finer press only costs more, a pinch's sharpening taking many seconds on a phone.)
// (Looked into, pressed less finely, down to a pixel and a half a CSS px: the wood's own scan is coarser than the
// screen there, and a press at every pixel takes many seconds on a phone.)
// (On the graphics chip, where there is one, the press is quick: always at the screen's own.)
const QUALITY = () => Math.min(1, 3 / Math.max(1, px)) * (gpu.ready() ? 1 : Math.max(0.5, 1 / Math.sqrt(Math.max(1, look.k))));
type Kept = { c: HTMLCanvasElement; key: string; v: View; at: number };
function placeOf(pc: { v: View }, v: View, grow = 1): [number, number, number, number] {
  const k = (v.s / pc.v.s) * grow, x0 = (-W * (MARGIN - 1)) / 2, y0 = (-H * (MARGIN - 1)) / 2;
  return [v.cx + (x0 - pc.v.cx) * k, v.cy + (y0 - pc.v.cy) * k, W * MARGIN * k, H * MARGIN * k];
}
function covers(pc: { v: View }, v: View): boolean {
  const [ox, oy, w, h] = placeOf(pc, v);
  return ox <= 0.5 && oy <= 0.5 && ox + w >= W - 0.5 && oy + h >= H - 0.5;
}
/** The print for view `v`, kept in `slot`: pressed again only when it must be. */
/** What a kept print was pressed for: the years in it, the slice's magnifier, the sheet. */
// (And its knots and burls as they are: one grown, or begun, is pressed in at once, never only when looked into.)
const marksKey = () => marks.map((m) => `${m.kind[0]}${m.from}-${m.last}x${m.size.toFixed(2)}`).join(',');
const printKey = (v: View) => `${tree.rings.length}|${v.warp?.R ?? 0}|${v.warp?.beta ?? 0}|${W}x${H}|${marksKey()}`;
/**
 * The kept print for a slot, pressed again as it must be. `patient`: a new one, when the years have
 * changed, may come a strip at a time too, the old one given meanwhile (the caller tells them apart by key).
 */
function printFor(v: View, moving: boolean, slot: string, drift: boolean, patient: true): Kept | undefined;
function printFor(v: View, moving: boolean, slot?: string, drift?: boolean): Kept;
function printFor(v: View, moving: boolean, slot = 'drawing', drift = false, patient = false): Kept | undefined {
  const key = printKey(v);
  let pc = printCaches[slot];
  const same = pc && pc.key === key;
  const exact = same && pc.v.s === v.s && pc.v.cx === v.cx && pc.v.cy === v.cy;
  // (Moving, the picture is moved and scaled; it's pressed again only when the fingers have gone past its
  // margin; still, at the view as it is.)
  const off = same ? Math.abs(Math.log(v.s / pc.v.s)) + Math.hypot(v.cx - pc.v.cx, v.cy - pc.v.cy) / W : 0;
  const still = fingers.size === 0 && !lookBack;
  const quick = same && clock() - pc.at > 0.03 && !covers(pc, v);
  const far = same && ((still && !exact && off > 0.002) || (drift && !moving && off > 0.004 && clock() - pc.at > 0.8));
  // (A new year, a knot begun, the magnifier moved: pressed a strip at a time while the last print is shown,
  // never all at once in one frame.)
  // (But the year just closed, on the graphics chip, pressed at once: never the old slice shown inside the new
  // loop while it's pressed.)
  const now = slot === 'drawing' && yearClosed && gpu.ready();
  if (now) yearClosed = false;
  if (!same && !now && (patient || pc || fading[slot]?.at === Infinity)) { pressSlowly(slot, v, key, false); return printCaches[slot]!; }
  // (By hand, a picture that no longer covers the view is pressed a strip a frame like any other, the last
  // scaled meanwhile: never all of it at once, seconds by hand, under the fingers.)
  if (quick && !gpu.ready() && same) { pressSlowly(slot, v, key); return pc!; }
  if (!same || quick) {
    // (Wanted now: a new year, or nothing to show there. Pressed at once; or, if it's already being
    // pressed for these years, the rest of it at once.)
    const job = pressing[slot];
    if (job && job.key === key && !quick) { pressSlowly(slot, job.v, key, false, Infinity); return printCaches[slot]!; }
    delete pressing[slot];
    const Q = QUALITY(), cw = Math.ceil(W * MARGIN * Q), ch = Math.ceil(H * MARGIN * Q);
    // (One picture a slot, its memory kept and drawn over: the phone's browser allows only so much, and a
    // picture made anew each time soon runs past it, after which nothing more is drawn.)
    const c = sized(free(slot, pc?.c), cw, ch);
    const t0 = performance.now();
    pressInto(c, v, 0, ch, 0, cw, Q);
    presses.push(Math.round(performance.now() - t0)); if (presses.length > 50) presses.shift();
    pc = printCaches[slot] = { c, key, v: { ...v }, at: clock() };
  } else if (gpu.ready() && !exact && ((pinch && fingers.size >= 2) || (drift && !moving))) {
    // (And as the slice steps back after a year: pressed for the view as it is, never a picture scaled soft.)
    // (Only under a pinch: the slice easing back as a ring settles is the picture moved and scaled, smooth.)
    // (On the graphics chip: pressed again for the view as it is, each frame as the fingers move, so the print
    // under them is never a stretched picture; every other frame, or fewer, when a pressing takes longer than
    // the frame has, so the pinch itself never stalls.)
    const now = performance.now();
    if (now - liveAt >= liveCost) {
      pressSlowly(slot, v, key, true, Infinity, false);
      liveCost = 0.6 * liveCost + 0.4 * (performance.now() - now); liveAt = now;
      pc = printCaches[slot]!;
    }
  } else if ((!moving && !drift && !exact) || far) {
    // (Only sharper wanted, for a view already shown: pressed a strip a frame, the picture there meanwhile
    // scaled to it, and put in its place once whole, so a pinch let go never stalls.)
    // (Drifting, as the slice eases into its room: finished for the view it was begun at, never begun again
    // each frame.)
    pressSlowly(slot, v, key, !drift);
  }
  return pc;
}
/** A canvas to press into, only if nothing still shows it: never one fading out, nor the one on screen. */
function free(slot: string, c: HTMLCanvasElement | undefined): HTMLCanvasElement | undefined {
  if (!c) return undefined;
  for (const f of Object.values(fading)) if (f && f.c === c) return undefined;
  for (const [k, p] of Object.entries(printCaches)) if (p && p.c === c && k !== slot) return undefined;
  return c;
}
/** Kept, or made anew at this size. */
function sized(c: HTMLCanvasElement | undefined, w: number, h: number): HTMLCanvasElement {
  if (c && c.width === w && c.height === h) return c;
  if (c) { c.width = 0; c.height = 0; }
  const n = document.createElement('canvas'); n.width = w; n.height = h;
  return n;
}
/**
 * The print pressed for view `v` into rows `r0` to `r1` of picture `c` (the picture covering `MARGIN` of the
 * sheet): through a strip of its own, a little taller than the rows, since the wood pulled about round a
 * knot or burl reads from a little way off.
 */
let strip: HTMLCanvasElement | null = null;
function pressInto(c: HTMLCanvasElement, v: View, r0: number, r1: number, c0 = 0, c1 = c.width, Q = QUALITY(), mx = (W * (MARGIN - 1)) / 2, my = (H * (MARGIN - 1)) / 2): void {
  const whole = r0 === 0 && r1 === c.height && c0 === 0 && c1 === c.width;
  const was = { g, px, W, H };
  const at: View = { ...v, cx: (v.cx + mx) * Q, cy: (v.cy + my) * Q, s: v.s * Q, px: v.px * Q };
  px *= Q;
  try {
    // (As much more round the strip as the wood is pulled from, where a knot or burl lies near it.)
    const reach = whole ? null : pulledReach(at), near = reach && reach.y1 + reach.pad > r0 && reach.y0 - reach.pad < r1 && reach.x1 + reach.pad > c0 && reach.x0 - reach.pad < c1;
    const pad = whole ? 0 : near ? reach.pad : 2;
    const top = Math.max(0, r0 - pad), left = Math.max(0, c0 - pad), sh = Math.min(c.height, r1 + pad) - top, sw = Math.min(c.width, c1 + pad) - left;
    // (Exactly the strip's size: everything in it is pressed, so a larger one costs as much more.)
    const into = whole ? c : (strip = sized(strip ?? undefined, sw, sh));
    const vs: View = { ...at, cx: at.cx - left, cy: at.cy - top };
    g = into.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, into.width, into.height);
    W = into.width; H = into.height;
    drawPrint(vs); inkGrain(into, vs);
    if (!whole) { const cc = c.getContext('2d')!; cc.clearRect(c0, r0, c1 - c0, r1 - r0); cc.drawImage(into, c0 - left, r0 - top, c1 - c0, r1 - r0, c0, r0, c1 - c0, r1 - r0); }
  } finally { g = was.g; px = was.px; W = was.W; H = was.H; }
}
/**
 * Where the wood is pulled about round the knots and burls, for view `v` (its box), and how far a point
 * there reads from (`pad`), at most: a burl's wander and the pull round its bud specks, a knot's sweep.
 */
function pulledReach(v: View): { x0: number; y0: number; x1: number; y1: number; pad: number } | null {
  const Z = Math.max(1, look.k);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pad = 0;
  const grow = (x: number, y: number, r: number) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const m of marks) {
    if (m.from >= tree.rings.length) continue;
    if (m.kind === 'burl') {
      const amp = (1.2 + 0.5 * Math.min(8, m.size)) * px * Z;
      let e = 0;
      for (const q of burlEyes(m, v, Z)) { grow(q.x, q.y, Math.max(q.e * 6, amp * 9)); e = Math.max(e, q.e); }
      pad = Math.max(pad, amp * 1.6 + e * 2.2);
    } else {
      const k = knotSpot(m, v, Z);
      grow(k.x, k.y, k.e * 7); pad = Math.max(pad, k.e * 1.7);
    }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1, pad: Math.ceil(pad) + 4 };
}
/** Pictures being pressed a strip at a time, a slot each, and the one to be drawn over next. */
const pressing: Record<string, { c: HTMLCanvasElement; v: View; key: string; lo: number; hi: number; top: number; t0: number; end: number; c0: number; c1: number; pulled: [number, number, number] | null; last?: number; q: number; rows: number }> = {};
/** Where the wood's pulled about, in a kept picture's own pixels for view `v`: its rows, and the margin it needs. */
function pulledRows(v: View, Q = QUALITY()): [number, number, number] | null {
  const was = px;
  px *= Q;
  try {
    const r = pulledReach({ ...v, cx: (v.cx + (W * (MARGIN - 1)) / 2) * Q, cy: (v.cy + (H * (MARGIN - 1)) / 2) * Q, s: v.s * Q, px: v.px * Q });
    return r ? [r.y0 - r.pad, r.y1 + r.pad, r.pad] : null;
  } finally { px = was; }
}
const spare: Record<string, HTMLCanvasElement> = {};
/**
 * The year just closed, its wood growing out from the old bark to where the loop was drawn: fast in spring,
 * slowing through the summer, the bark carried out on its edge. The years before never move.
 */
let yearGrow: { ring: number; at: number } | null = null;
const GROW_T = 2.6;
let roomDue = false;
/** The year just drawn, shown pale a moment as new wood is (see `drawFresh`). */
let fresh: { ring: number; at: number } | null = null;
/**
 * The year just drawn, pale, as fresh wood is before it darkens: a band just inside the bark, never thinner than
 * some three px however fine the year (so it's seen on an old tree too), growing out with the year,
 * then darkening into the print over a few seconds.
 */
function drawFresh(v: View, t: number): void {
  if (!fresh || fresh.ring >= tree.rings.length || fresh.ring < 1) { fresh = null; return; }
  const age = t - fresh.at, al = 0.82 * smooth(age / 0.4) * (1 - smooth((age - GROW_T - 1.6) / 2.4));
  if (age > GROW_T + 4.2) { fresh = null; return; }
  if (al < 0.01) return;
  const f = yearGrow && yearGrow.ring === fresh.ring ? 1 - Math.pow(1 - Math.min(1, (t - yearGrow.at) / GROW_T), 2.2) : 1;
  // (Only where the year is too fine to be seen growing: a young tree's wide year shows itself, and paled
  // over it would only wash its ink out.)
  const wpx = v.s * (meanR(fresh.ring) - meanR(fresh.ring - 1)) / px, need = 1 - smooth((wpx - 2) / 4);
  if (need < 0.01) return;
  const old = barkOf(fresh.ring - 1), neu = barkOf(fresh.ring), minW = (3.4 * px) / v.s, hair = (1.1 * px) / v.s;
  const out = (a: number) => old(a) + (neu(a) - old(a)) * f - hair;
  hideBetween(v, (a) => out(a) - minW, out, al * need);
}
function drawGrowth(v: View, t: number, moving: boolean, drift: boolean): boolean {
  const gr = yearGrow!, n = tree.rings.length;
  const f = 1 - Math.pow(1 - Math.min(1, (t - gr.at) / GROW_T), 2.2);
  // (Room made at the start of the next frame, never part way through this one: the rest of it would be
  // pressed for the view as it was, and pressed again the frame after, a blur between.)
  if (gr.ring !== n - 1 || f >= 1 || closer() || fingers.size >= 2) { yearGrow = null; roomDue = true; return false; }
  const pc = printFor(v, moving, 'drawing', drift);
  // (Its clock held till the new year's print is there: the growing begins at its beginning, never part way.)
  if (pc.key !== printKey(v)) { gr.at = t; return false; }
  const old = barkOf(n - 2), neu = barkOf(n - 1), front = (a: number) => old(a) + (neu(a) - old(a)) * f;
  // (The wood, up to the growing edge.)
  g.save(); ringPath(v, front, 0, K * 2); g.clip(); drawKept(pc, v); g.restore();
  // (The bark, carried out on it: the print beyond its own bark, drawn as much smaller as the edge is in.)
  let k = 0;
  for (let j = 0; j < 24; j++) { const a = (j / 24) * TAU; k += warpR(v.warp, front(a)) / Math.max(1e-6, warpR(v.warp, neu(a))); }
  k /= 24;
  g.save(); g.beginPath(); g.rect(0, 0, W, H); ringPath(v, front, 0, K * 2, true); g.clip('evenodd'); drawKept(pc, v, 1, k); g.restore();
  return true;
}
/** A year just closed, to be pressed at once (see printFor). */
let yearClosed = false;
/** When a view was last pressed live, and how long that takes (ms), as it went. */
let liveAt = 0, liveCost = 0;
function pressSlowly(slot: string, v: View, key: string, follow = true, budget = 8, fadeOld = true): void {
  const Q = QUALITY(), cw = Math.ceil(W * MARGIN * Q), ch = Math.ceil(H * MARGIN * Q);
  let job = pressing[slot];
  // (`follow`: begun again for the view as it is now; otherwise finished for the view it was begun for,
  // to be scaled to the view as it moves, as a slice eases into its new room.)
  if (!job || job.key !== key || (follow && (job.v.s !== v.s || job.v.cx !== v.cx || job.v.cy !== v.cy)) || job.c.width !== cw || job.c.height !== ch) {
    // (A job begun again: its own canvas pressed into afresh, never let go to be made anew each frame.)
    const c = job ? sized(job.c, cw, ch) : sized(free(slot, spare[slot]), cw, ch);
    if (!job) delete spare[slot];
    // (Only the rows the slice lies across: above and below it, the bare sheet.)
    const Q2 = Q, my = (H * (MARGIN - 1)) / 2, n = tree.rings.length;
    let rmax = tree.k.pith;
    if (n) for (let i = 0; i < K; i++) rmax = Math.max(rmax, tree.rings[n - 1][i]);
    const R = (v.s * warpR(v.warp, rmax) + (barkCss(v) * 1.6 + 40) * px) * Q2, cy = (v.cy + my) * Q2;
    const mx = (W * (MARGIN - 1)) / 2, cx = (v.cx + mx) * Q2;
    let top = Math.max(0, Math.floor(cy - R)), end = Math.min(ch, Math.ceil(cy + R)), c0 = Math.max(0, Math.floor(cx - R)), c1 = Math.min(cw, Math.ceil(cx + R));
    const cc = c.getContext('2d')!, old = printCaches[slot];
    cc.clearRect(0, 0, cw, ch);
    // (By hand only: on the graphics chip all of it is pressed, never a stretched copy's edge left to come into view.)
    if (follow && old && old.key === key && !gpu.ready()) {
      // (Only sharper wanted: the sheet as seen pressed anew, a little round it; beyond, the picture as it was,
      // scaled, for a pinch back out.)
      const [ox, oy, ow, oh] = placeOf(old, v);
      cc.drawImage(old.c, (ox + mx) * Q2, (oy + my) * Q2, ow * Q2, oh * Q2);
      const ex = W * 0.06 * Q2, ey = H * 0.06 * Q2;
      top = Math.max(top, Math.floor(my * Q2 - ey)); end = Math.min(end, Math.ceil((my + H) * Q2 + ey));
      c0 = Math.max(c0, Math.floor(mx * Q2 - ex)); c1 = Math.min(c1, Math.ceil((mx + W) * Q2 + ex));
    }
    // (From the middle of the sheet as seen, out both ways: what's looked at sharpens first.)
    end = Math.max(top, end);
    const mid = Math.max(top, Math.min(end, Math.round((my + H / 2) * Q2)));
    job = pressing[slot] = { c, v: { ...v }, key, lo: mid, hi: mid, top, t0: performance.now(), end, c0, c1: Math.max(c0, c1), pulled: pulledRows(v, Q), q: Q, rows: 24 };
  }
  // (Strips of the one height, as many a frame as fit in some eight milliseconds, one at least: on an older
  // phone a frame a little slow while it's pressed, never a stall.)
  // (Only in what's left of the frame, so the frame is never late: pressed when the frame's own drawing has
  // left room, a strip at least now and then so it always arrives.)
  // (As deep as about fifteen milliseconds' pressing on this phone, as the last strip went: never so thin that
  // each strip's own setting up is much of it.)
  // (All of it at once only when it's wanted now; otherwise a strip at a time in what's left of each frame, the
  // last print shown meanwhile, so a ring settling or the slice easing back never stalls a frame.)
  const t = performance.now(), rows = budget === Infinity && gpu.ready() ? job.end - job.top : Math.round(Math.max(20, Math.min(gpu.ready() ? 400 : 96, job.rows)));
  const left = budget === Infinity ? Infinity : Math.min(budget, 11 - (t - frameStart));
  if (left <= 0 && t - (job.last ?? 0) < 0.25e3) return;
  job.last = t;
  while ((job.hi < job.end || job.lo > job.top) && performance.now() - t < Math.max(left, 0.1)) {
    // (Down and up by turns, whichever has further to go.)
    const down = job.hi < job.end && (job.lo <= job.top || job.end - job.hi >= job.lo - job.top);
    // (Across a knot or burl, a deeper strip, so its margin is pressed fewer times over.)
    const pl = job.pulled, near = (a: number) => pl && a + rows > pl[0] && a < pl[1], deep = (down ? near(job.hi) : near(job.lo - rows)) ? Math.max(rows, 3 * pl![2]) : rows;
    const r0 = down ? job.hi : Math.max(job.top, job.lo - deep), r1 = down ? Math.min(job.end, job.hi + deep) : job.lo;
    const s0 = performance.now();
    if (job.c1 > job.c0) pressInto(job.c, job.v, r0, r1, job.c0, job.c1, job.q);
    job.rows = 0.5 * job.rows + 0.5 * (r1 - r0) * Math.min(3, 15 / Math.max(1, performance.now() - s0));
    if (down) job.hi = r1; else job.lo = r0;
  }
  if (job.hi >= job.end && job.lo <= job.top) {
    // (The picture it replaces fades out over the new one, so a view grown sharper never jumps; unless it was
    // seen sharpening already, a band at a time.)
    // (`fadeOld` false: a view pressed live, the last only a frame behind it, kept to be drawn over next.)
    const old = printCaches[slot];
    // (One held till this was pressed: faded from now.)
    if (!old && fading[slot]?.at === Infinity) fading[slot]!.at = clock();
    if (old && fadeOld) {
      if (fading[slot]) spare[slot] = fading[slot]!.c;
      fading[slot] = { c: old.c, v: old.v, at: clock() };
    } else if (old) spare[slot] = old.c;
    printCaches[slot] = { c: job.c, key, v: job.v, at: clock() };
    presses.push(-Math.round(performance.now() - job.t0)); if (presses.length > 50) presses.shift();
    delete pressing[slot];
  }
}
/** A kept print drawn for view `v` (moved and scaled to it), `grow` times larger about the slice's heart. */
function drawKept(pc: { c: HTMLCanvasElement; v: View }, v: View, alpha = 1, grow = 1, hole?: [number, number, number, number]): void {
  const [ox, oy, w, h] = placeOf(pc, v, grow);
  // (`hole`: where a sharper picture lies over it, left out, so its softer ink never shows round the sharp.)
  if (hole) { g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(...hole); g.clip('evenodd'); }
  g.globalAlpha = alpha;
  g.drawImage(pc.c, ox, oy, w, h);
  if (hole) { g.restore(); g.globalAlpha = alpha; }
  if (pressShown > 0.01) {
    const m = markOf(pc), k = w / pc.c.width;
    if (m) { g.globalAlpha = alpha * pressShown * 0.3; g.drawImage(m.c, ox + m.x * k, oy + m.y * k, m.c.width * k * (m.s ?? 1), m.c.height * k * (m.s ?? 1)); }
  }
  g.globalAlpha = 1;
}
/**
 * A kept print's press mark (made once, round the slice only): the paper's step down along the print's own
 * edge, so it follows every rough bit of the bark. A touch of shadow just outside the edge toward the light,
 * where the sheet steps down into the pressed part; a hairline of light on the far side, where it rises out.
 */
const marksMade = new WeakMap<object, { c: HTMLCanvasElement; x: number; y: number } | null>();
/**
 * The checks as last cut, in the wood's own measure: (angle, mm) to (angle, mm), half its width (mm), and how far
 * past the bark it began (mm). The press mark fills them in, so a check is never edged by the block's rim.
 */
let cracksCut: [number, number, number, number, number, number][] = [];
let lastMark: { pc: { c: HTMLCanvasElement; v: View; key?: string }; m: { c: HTMLCanvasElement; x: number; y: number; s?: number } } | null = null;
function markOf(pc: { c: HTMLCanvasElement; v: View; key?: string }): { c: HTMLCanvasElement; x: number; y: number; s?: number } | null {
  if (marksMade.has(pc)) return marksMade.get(pc)!;
  const Q = pc.c.width / (W * MARGIN), mx = (W * (MARGIN - 1)) / 2, my = (H * (MARGIN - 1)) / 2;
  // (Under a pinch, pressed afresh each frame: the last mark carried to it, scaled about the heart, never
  // made anew each frame.)
  const lm = lastMark;
  if (lm && fingers.size >= 2 && lm.pc.key && lm.pc.key === pc.key && lm.pc.c.width === pc.c.width && lm.pc.v.turn === pc.v.turn) {
    const r = pc.v.s / lm.pc.v.s, ax = (lm.pc.v.cx + mx) * Q, ay = (lm.pc.v.cy + my) * Q, bx = (pc.v.cx + mx) * Q, by = (pc.v.cy + my) * Q, s0 = lm.m.s ?? 1;
    const out = { c: lm.m.c, x: bx + (lm.m.x - ax) * r, y: by + (lm.m.y - ay) * r, s: s0 * r };
    marksMade.set(pc, out);
    return out;
  }
  const R = (pc.v.s * warpR(pc.v.warp, barkMax()) + (barkCss(pc.v) * 1.6 + 12) * px) * Q, cx = (pc.v.cx + mx) * Q, cy = (pc.v.cy + my) * Q;
  const x = Math.max(0, Math.floor(cx - R)), y = Math.max(0, Math.floor(cy - R)), w = Math.min(pc.c.width, Math.ceil(cx + R)) - x, h = Math.min(pc.c.height, Math.ceil(cy + R)) - y;
  if (!tree.rings.length || w <= 0 || h <= 0) { marksMade.set(pc, null); return null; }
  const d = 1.1 * px * Q, c = document.createElement('canvas'); c.width = w; c.height = h;
  const m = c.getContext('2d')!, t = document.createElement('canvas'); t.width = w; t.height = h;
  const tc = t.getContext('2d')!;
  // (The block's shape, whole: the print's own rough edge, filled solid within, so only the outer edge is
  // marked, never the lines between the years.)
  const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
  const sc = sil.getContext('2d')!, bark = barkOf(tree.rings.length - 1);
  sc.drawImage(pc.c, x, y, w, h, 0, 0, w, h);
  sc.beginPath();
  for (let j = 0; j <= K; j++) {
    const a = (j / K) * TAU, R = pc.v.s * warpR(pc.v.warp, bark(a)), tt = a + pc.v.turn;
    const X = (pc.v.cx + R * Math.cos(tt) + mx) * Q - x, Y = (pc.v.cy - R * Math.sin(tt) + my) * Q - y;
    if (j) sc.lineTo(X, Y); else sc.moveTo(X, Y);
  }
  sc.closePath(); sc.fillStyle = '#000'; sc.fill();
  // (A check is the block's own, never its edge: filled in, so the rim isn't marked across it.)
  sc.strokeStyle = '#000'; sc.lineCap = 'round';
  const at2 = (a: number, r: number, out = 0): [number, number] => { const R = pc.v.s * warpR(pc.v.warp, r) + out * pc.v.s, tt = a + pc.v.turn; return [(pc.v.cx + R * Math.cos(tt) + mx) * Q - x, (pc.v.cy - R * Math.sin(tt) + my) * Q - y]; };
  // (Only within the bark: where the check opens past it, a notch in the block's edge, marked as one.)
  const Tb = barkCss(pc.v) * 0.45 / pc.v.s;
  sc.save(); sc.beginPath();
  for (let j = 0; j <= K; j++) { const [X, Y] = at2((j / K) * TAU, bark((j / K) * TAU), Tb); if (j) sc.lineTo(X, Y); else sc.moveTo(X, Y); }
  sc.closePath(); sc.clip();
  for (const [a0, r0, a1, r1, hw, out] of cracksCut) {
    sc.lineWidth = 2 * hw * pc.v.s * Q + 2; sc.beginPath(); sc.moveTo(...at2(a0, r0, out)); sc.lineTo(...at2(a1, r1)); sc.stroke();
  }
  sc.restore();
  const lay = (dx: number, dy: number, col: string) => {
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, w, h); tc.drawImage(sil, dx, dy);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = col; tc.fillRect(0, 0, w, h);
    m.drawImage(t, 0, 0);
  };
  lay(-d, -d, 'rgba(36,28,23,0.11)');
  lay(d, d, 'rgba(255,253,247,0.7)');
  // (Only round the ink, never over it.)
  m.globalCompositeOperation = 'destination-out'; m.drawImage(sil, 0, 0);
  t.width = 0; t.height = 0; sil.width = 0; sil.height = 0;
  const out = { c, x, y };
  marksMade.set(pc, out);
  lastMark = { pc, m: out };
  return out;
}
/** A picture just replaced by a sharper one, fading out over it (a quarter second or so). */
const fading: Record<string, { c: HTMLCanvasElement; v: View; at: number; still?: boolean } | undefined> = {};
const FADE = 0.6;
function drawPrintCached(v: View, moving: boolean, slot = 'drawing', alpha = 1, drift = false, grow = 1): void {
  drawSharp(printFor(v, moving, slot, drift), v, slot, alpha, grow);
}
/** A slot's kept print as it's shown, the last fading out over it. */
function drawSharp(pc: Kept | undefined, v: View, slot: string, alpha = 1, grow = 1): void {
  const f = fading[slot], k = f ? 1 - smooth((clock() - f.at) / FADE) : 0;
  // (Nothing new pressed yet: the last, held as it was.)
  if (!pc) { if (f) drawKept(f, f.still ? f.v : v, alpha, grow); return; }
  if (f && k <= 0.01) { spare[slot] = f.c; fading[slot] = undefined; }
  if (!f || k <= 0.01) { drawKept(pc, v, alpha, grow); return; }
  // (`still`: the print as it was, where and as large as it was, never moved to the new view.)
  crossfade(() => drawKept(f, f.still ? f.v : v, k, grow), () => drawKept(pc, v, 1 - k, grow), alpha);
}
/**
 * A true crossfade, one print turning into the other (`a` drawn at its share, `b` at the rest, each with its
 * own alpha): never both laid at once, whose inks, a hair out of register, would add up to a darker slice for
 * a moment. Composed aside (a sheet for each depth, as one may hold another), then laid at `alpha`.
 */
const blends: HTMLCanvasElement[] = [];
let blendDepth = 0;
function crossfade(a: () => void, b: () => void, alpha = 1): void {
  // (Each composed whole on its own sheet, then the two added: never one's marks added onto the other's ground.)
  const sheet = (draw: () => void) => {
    const c = (blends[blendDepth] = sized(blends[blendDepth], W, H)), was = g;
    blendDepth++;
    g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    try { draw(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } finally { g = was; }
    return c;
  };
  const d0 = blendDepth, ca = sheet(a), cb = sheet(b);
  const cx = ca.getContext('2d')!; cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'lighter'; cx.drawImage(cb, 0, 0); cx.restore();
  blendDepth = d0;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(ca, 0, 0); g.restore();
}

/**
 * At rest, true to scale. While drawing, the slice's outer rings are magnified (a fisheye) to give the
 * newest ring room under the finger, which squeezes the old ones toward the heart; left a moment, the
 * slice settles into true scale, its years evenly spaced, the bark where it was; a touch brings the
 * magnifier back. (In the print.)
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
 * The tree's name, pencilled under the print, and beside it a blind stamp, a small ring slice pressed into
 * the paper with no ink (the maker's mark): only when a tree is shown whole (for a few moments on opening,
 * and an older tree opened from the grove); growing, nothing under the tree. No dates, no counting. Away
 * while a finger is down; written in, left to right, once a new day's ring has bloomed.
 */
let editionAt = 0, editionShown = 0;
function drawEdition(v: View, t: number, dt: number): void {
  if (!tree.rings.length) return;
  const away = fingers.size > 0 || !!tree.stroke;
  editionShown = away ? Math.max(0, editionShown - dt / QUICK) : Math.min(1, editionShown + dt / STEADY_T);
  stampAt = [-1e9, -1e9];
  const whole = visit ? 1 : 1 - smooth((t - (openedAt + OPEN + 3)) / STEADY_T);
  if (editionShown <= 0.01 || whole <= 0.01) return;
  const last = tree.rings[tree.rings.length - 1];
  let rmax = 0;
  for (let i = 0; i < K; i++) rmax = Math.max(rmax, v.s * warpR(v.warp, last[i]));
  const y = v.cy + rmax + (barkCss(v) + 30) * px, half = Math.min(Math.max(rmax, 112 * px), W / 2 - 24 * px);
  editionY = y;
  // (Written in, left to right, once a new day's ring has bloomed.)
  const w = t < editionAt ? 0 : smooth((t - editionAt) / STEADY_T);
  g.save();
  g.beginPath(); g.rect(v.cx - half - 40 * px, y - 30 * px, (2 * half + 80 * px) * (editionAt ? w : 1), 60 * px); g.clip();
  g.globalAlpha = editionShown * whole;
  // Graphite: a soft grey, its grain the paper's own (laid over it after).
  g.fillStyle = 'rgba(92,88,84,0.78)'; g.font = `italic ${13 * px}px Newsreader, "Iowan Old Style", Georgia, serif`; g.textBaseline = 'middle';
  const nw = g.measureText(kind).width, x0 = v.cx - (nw + 22 * px) / 2;
  g.textAlign = 'left'; g.fillText(kind, x0, y);
  // The blind stamp: three rings and a heart, pressed in (a highlight above, a shadow below, no ink).
  const sx = x0 + nw + 16 * px;
  if (whole > 0.5) stampAt = [sx, y];
  for (const [dx, dy, col] of [[-0.7, -0.7, 'rgba(255,253,246,0.95)'], [0.7, 0.7, 'rgba(96,74,52,0.28)']] as [number, number, string][]) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 0.9 * px;
    for (const r of [7, 4.6, 2.4]) { g.beginPath(); g.arc(sx + dx * px, y + dy * px, r * px, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(sx + dx * px, y + dy * px, 0.9 * px, 0, TAU); g.fill();
  }
  g.restore();
}

/** Where the pencilled line is, and its maker's mark (device px). */
let editionY = -1e9, stampAt: [number, number] = [-1e9, -1e9];
/**
 * A new tree: straight to the seeds, nothing asked. The tree drawn so far waits, kept as it was, until a
 * seed is touched (then it stands in the grove); drawn back to the grove instead, it's as it was.
 */
let parting: { k: KeptTree; tree: TreeSim; days: string[]; kind: Kind; seedAt: [number, number] | null; marks: WoodMark[]; place: [number, number] | null } | null = null;
/** Where today's tree stands in the grove, if it was planted somewhere chosen (world units). */
let herePlace: [number, number] | null = null;
let plantAsked = 0;
function plantAgain(at: [number, number] | null = null): void {
  // (A year not yet finished is never set down by one touch: asked first, a second touch within a few
  // seconds to begin another.)
  if (!parting && tree.rings.length && clock() - plantAsked > 6) { plantAsked = clock(); say('This year’s tree isn’t finished. Touch the ground again to begin a new one; this one will stand in the grove as it is.', 6); return; }
  plantAsked = 0;
  if (painter !== null) { tree.cancel(); trail = []; painter = null; }
  if (visit) unvisit();
  fingers.clear();
  if (parting) return;
  parting = { k: kept(), tree, days, kind, seedAt, marks, place: herePlace };
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; seedAt = null; folding = null; marks = []; pendingMarks = []; herePlace = at;
  lookAfresh(); groveCam = null; farTo = { from: far, to: 0, at: clock() };
  say('Swipe through the woods. Touch one to plant it.', 1e5);
}
function unpart(): void {
  if (!parting) return;
  ({ tree, days, kind, seedAt, marks } = parting); herePlace = parting.place; parting = null;
  lookAfresh(); hush();
}

// ---------------------------------------------------------------- the grove
/**
 * The grove, from above (see `grove.ts`): drawn back past the slice, it becomes the cut face at the heart
 * of its tree's crown, seen from above, and the view rises off the hill to every tree of the practice,
 * the first planted in the middle and the rest spiralling out, as rings do; today's the newest, at the
 * spiral's end. Each crown its kind's, as big as its days. Touched, an older tree opens to its slice, to
 * read, not draw; today's comes home. (`?grove` plants a grove to try it by.)
 */
let groveKept: KeptTree[] = [];
/** How far drawn back (0 the slice, 1 the grove), and easing to where it settles. */
let far = 0, farPull = 0, farTo: { from: number; to: number; at: number } | null = null;
/** An older tree looked at, and today's, kept aside meanwhile. */
let visit: { i: number; stash: { tree: TreeSim; days: string[]; kind: Kind; marks: WoodMark[]; place?: [number, number] | null } } | null = null;
const canPull = () => GROWN && (tree.rings.length > 0 || (!!seedAt && groveKept.length > 0));
const settleFar = () => { farTo = { from: far, to: far > 0.45 ? 1 : 0, at: clock() }; };
interface Stand { sp: Kind; n: number; i: number; k: number; wx: number; wy: number; wr: number; x: number; y: number; r: number; place: [number, number] | null }
/** The season washed into the grove: today's (`?season=winter` and so on, to look). */
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const seasonNow = (): Season => SEASONS.find((x) => x === params.get('season')) ?? seasonOf();
/** A view of the land: world (x, y) shows at (X0 + x·S, Y0 + y·S) on the sheet. */
interface Cam { S: number; X0: number; Y0: number }
/** Looked about in the grove: closer than the whole, and moved (null: the whole of it in view). */
let groveCam: Cam | null = null;
const GROVE_CLOSEST = 8;
/** The land, every tree on it (world units), and the view of the whole of it, kept until a tree changes. */
let worldKey = '', world: { hills: Hill[]; seed: number; trees: Omit<Stand, 'x' | 'y' | 'r'>[]; next: { wx: number; wy: number }; whole: Cam; box: [number, number, number, number]; seedlings: { wx: number; wy: number }[]; stream: [number, number][]; wild: { wx: number; wy: number; wr: number; sp: Kind; k: number }[] } | null = null;
function worldOf() {
  const mine = visit ? visit.stash : { tree, days, kind };
  const all = [
    ...groveKept.map((k, i) => ({ sp: asKind(k.tree) ?? 'oak', n: ((k.sim.rings as unknown[] | undefined) ?? []).length, i, k: (k.seed % 9973) + 11, place: k.place ?? null })),
    // (Choosing a new seed: the tree drawn so far still stands where it stood, and the new one is the
    // empty circle's, so the view comes down to where it was touched.)
    ...(parting ? [{ sp: parting.kind, n: parting.tree.rings.length, i: -2, k: (parting.tree.seed % 9973) + 11, place: parting.place }] : []),
    { sp: mine.kind, n: mine.tree.rings.length, i: -1, k: (mine.tree.seed % 9973) + 11, place: visit ? (visit.stash.place ?? null) : herePlace },
  ];
  const seed = groveKept[0]?.seed ?? (parting ? parting.tree.seed : mine.tree.seed), key = `${W}x${H}:${seed}:${all.map((t) => `${t.sp}${t.n}${t.place ? `@${t.place.join(',')}` : ''}`).join(',')}`;
  if (world && worldKey === key) return world;
  const L = land(all.length, seed);
  const trees = all.map((a, j) => ({ ...a, wx: a.place ? a.place[0] : L.places[j].x, wy: a.place ? a.place[1] : L.places[j].y, wr: 1.3 * L.places[j].scale * crownSize(a.sp, a.n) }));
  // (And where the next will stand, when it's planted.)
  const nx = land(all.length + 1, seed).places[all.length], next = { wx: nx.x, wy: nx.y };
  // (Crowns grown into each other eased apart, a little each way, until their lobes only touch (a crown reaches past
  // its mean round, and grows a little fuller by the stream): a tree you set down
  // by hand never moved.)
  for (let it = 0; it < 24; it++) {
    let moved = false;
    for (let a = 0; a < trees.length; a++) for (let b = a + 1; b < trees.length; b++) {
      const A = trees[a], B = trees[b], fa = A.place ? 0 : 1, fb = B.place ? 0 : 1;
      if (!fa && !fb) continue;
      const need = (A.wr + B.wr) * 1.15, dx = B.wx - A.wx, dy = B.wy - A.wy, d = Math.hypot(dx, dy);
      if (d >= need) continue;
      const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0, push = (need - d) / (fa + fb);
      A.wx -= ux * push * fa; A.wy -= uy * push * fa; B.wx += ux * push * fb; B.wy += uy * push * fb; moved = true;
    }
    // (And off the ground kept for the next tree.)
    for (const A of trees) {
      if (A.place) continue;
      const need = A.wr + 0.5, dx = A.wx - next.wx, dy = A.wy - next.wy, d = Math.hypot(dx, dy);
      if (d >= need) continue;
      const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
      A.wx += ux * (need - d); A.wy += uy * (need - d); moved = true;
    }
    if (!moved) break;
  }

  // (The whole of it in view, the trees and a little ground round them; never so close a crown fills the sheet.)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of [...trees, { ...next, wr: 0 }]) { x0 = Math.min(x0, t.wx - 1.6); x1 = Math.max(x1, t.wx + 1.6); y0 = Math.min(y0, t.wy - 1.6); y1 = Math.max(y1, t.wy + 1.6); }
  const S = Math.min((W * 0.86) / (x1 - x0), (H * 0.5) / (y1 - y0), W * 0.12);
  const whole = { S, X0: W / 2 - ((x0 + x1) / 2) * S, Y0: H * 0.46 - ((y0 + y1) / 2) * S };
  // (Beside a tree long standing, now and then, a seedling of its own: touched, a tree is planted there.)
  const seedlings: { wx: number; wy: number }[] = [];
  for (const t of trees) {
    if (t.n < 200 || h1(t.k * 3.3) < 0.35) continue;
    const a = h1(t.k * 5.1) * TAU, d = t.wr * 1.25 + 0.35, wx = t.wx + Math.cos(a) * d, wy = t.wy + Math.sin(a) * d;
    if (trees.some((o) => Math.hypot(o.wx - wx, o.wy - wy) < o.wr * 0.9 + 0.2) || Math.hypot(next.wx - wx, next.wy - wy) < 0.6) continue;
    seedlings.push({ wx, wy });
  }
  // (The grove's own landmark, from its seed: a stream winding past through the low ground, clear of the trees.)
  let gx = 0, gy = 0;
  for (const t of trees) { gx += t.wx; gy += t.wy; }
  gx /= trees.length; gy /= trees.length;
  let reach = 0;
  for (const t of [...trees, { wx: next.wx, wy: next.wy, wr: 0.5 }]) reach = Math.max(reach, Math.hypot(t.wx - gx, t.wy - gy) + t.wr);
  const sa = 0.6 + h1(seed * 0.37) * 1.9, sx = Math.cos(sa), sy = Math.sin(sa), D = reach + 0.75, stream: [number, number][] = [];
  for (let q = -60; q <= 60; q++) {
    const t = q * 0.25, off = D + 0.9 * Math.sin(t * 0.32 + seed) + 0.4 * Math.sin(t * 0.85 + seed * 2);
    let x = gx + sx * off - sy * t, y = gy + sy * off + sx * t;
    for (const o of trees) { const d = Math.hypot(x - o.wx, y - o.wy), need = o.wr + 0.8; if (d < need) { x += ((x - o.wx) / (d || 1)) * (need - d); y += ((y - o.wy) / (d || 1)) * (need - d); } }
    stream.push([x, y]);
  }
  // (A tree on damp ground by the stream grows fuller.)
  const damp = (x: number, y: number) => { let d = Infinity; for (const [a, b] of stream) d = Math.min(d, Math.hypot(a - x, b - y)); return smooth(1 - (d - 0.6) / 2.2); };
  for (const t of trees) t.wr *= 1 + 0.12 * damp(t.wx, t.wy);
  // (Round it, the wood it stands in: trees no one planted, older and taller, thinning out with the distance,
  // never on the stream, never on the next tree's ground.)
  const wild: { wx: number; wy: number; wr: number; sp: Kind; k: number }[] = [], WILD: Kind[] = ['oak', 'oak', 'maple', 'ash', 'pine', 'fir', 'cherry', 'birch'];
  const tries = 60 + 3 * trees.length, wildAge = Math.min(400, Math.max(80, 1.5 * Math.max(0, ...trees.map((t) => t.n))));
  for (let q = 0; q < tries; q++) {
    const a = h1(seed * 0.013 + q * 1.618) * TAU, d = reach + 0.6 + 4.5 * h1(q * 2.71 + seed * 0.07) ** 1.3;
    if (h1(q * 9.1 + seed) > 1.15 - (d - reach) / 5) continue;
    const wx = gx + Math.cos(a) * d, wy = gy + Math.sin(a) * d * 0.9, sp = WILD[Math.floor(h1(q * 4.3 + seed) * WILD.length)];
    // (Older than the grove's own, never towering over a young grove: as old as half again its oldest, at most
    // four hundred years.)
    const wr = 1.3 * (0.8 + 0.35 * h1(q * 6.1)) * crownSize(sp, wildAge);
    if (stream.some(([sx2, sy2]) => Math.hypot(sx2 - wx, sy2 - wy) < wr + 0.45)) continue;
    if (Math.hypot(next.wx - wx, next.wy - wy) < wr + 1) continue;
    if ([...trees, ...wild].some((o) => Math.hypot(o.wx - wx, o.wy - wy) < (o.wr + wr) * 0.85)) continue;
    wild.push({ wx, wy, wr, sp, k: Math.floor(h1(q * 3.3 + seed) * 9000) + 17 });
  }
  worldKey = key; world = { hills: L.hills, seed, trees, next, whole, box: [x0, y0, x1, y1], seedlings, stream, wild };
  return world;
}
const camNow = (): Cam => groveCam ?? worldOf().whole;
/** Where each tree stands on the sheet, in a view (the grove's as it is, unless another is given). */
function groveLayout(cam = camNow()): { trees: Stand[]; cam: Cam } {
  const w = worldOf();
  return { cam, trees: w.trees.map((t) => ({ ...t, x: cam.X0 + t.wx * cam.S, y: cam.Y0 + t.wy * cam.S, r: t.wr * cam.S })) };
}
/** Closer or further in the grove, about (x, y) (device px): back to the whole of it, no further. */
function zoomGrove(x: number, y: number, f: number): void {
  const w = worldOf(), c = camNow(), S = Math.max(w.whole.S, Math.min(w.whole.S * GROVE_CLOSEST, c.S * f)), q = S / c.S;
  groveCam = S <= w.whole.S * 1.001 ? null : { S, X0: x - (x - c.X0) * q, Y0: y - (y - c.Y0) * q };
  if (groveCam) { panGrove(0, 0); hush(); }
  groveMoved = clock();
}
/** Moved about in the grove, never so far its trees leave the sheet. */
function panGrove(dx: number, dy: number): void {
  if (!groveCam) return;
  // (Never past what the whole grove, drawn ahead, covers: no faded edge nor bare paper moved into view.)
  const wh = worldOf().whole, c = groveCam, e = 0.035 * Math.min(W, H);
  const fit = (o: number, d: number, span: number, o0: number) => {
    const b0 = (e - o0) / wh.S, b1 = (span - e - o0) / wh.S, lo = span - b1 * c.S, hi = -b0 * c.S;
    return lo <= hi ? Math.min(hi, Math.max(lo, o + d)) : (lo + hi) / 2;
  };
  c.X0 = fit(c.X0, dx, W, wh.X0); c.Y0 = fit(c.Y0, dy, H, wh.Y0);
  groveMoved = clock();
}
let groveMoved = 0;
/** Said once, the first time in the grove: how a new tree is begun. */
let groveTold = false;
try { groveTold = !!localStorage.getItem('annulus.grove1'); localStorage.removeItem('annulus.paths'); } catch { /* not known */ }
/**
 * Once in a while, out in the grove: when it's been a month since a copy was kept (or one never was) and
 * there's something worth keeping, a word about keeping one. Once a visit at most.
 */
let copyNudged = false;
function nudgeCopy(): void {
  if (copyNudged || !groveTold || params.has('demo') || params.has('grove')) return;
  let at = 0;
  try { at = Number(localStorage.getItem('annulus.copiedAt')) || 0; } catch { return; }
  if (!(groveKept.length || tree.rings.length >= 30) || Date.now() - at < 30 * 864e5) return;
  copyNudged = true;
  say('It’s been a while since a copy was kept. “keep a copy” saves your trees as a file, somewhere safe.', 8);
}
function tellGrove(): void {
  if (groveTold) { nudgeCopy(); return; }
  groveTold = true;
  try { localStorage.setItem('annulus.grove1', '1'); } catch { /* said again next time, then */ }
  say('Touch the ground to plant a new tree.', 6);
}
/** The land and its trees, drawn for a view: inked and coloured (slow: drawn when the view is still). */
/** A crown as laid over the ground, to be stirred by the wind: its picture, where its middle is, its size. */
interface Sprite { c: HTMLCanvasElement; x: number; y: number; m: number; r: number; k: number }
/**
 * Each tree's own crown, from its slice (cached by tree): the bark's shape round it, made a little
 * stronger and seen from the map's side (the slice's angles run the other way round); a knobbly clump where
 * it burled, a heavy limb where a branch grew; its edge as ragged as its years were uneven.
 */
const forms = new Map<string, CrownForm>();
function formOf(i: number): CrownForm | undefined {
  const src = i >= 0 ? (() => { const k = groveKept[i]; return k ? { rings: (k.sim.rings as ArrayLike<number>[] | undefined) ?? [], marks: k.marks ?? [], seed: k.seed } : null; })()
    : i === -2 ? (parting ? { rings: parting.tree.rings, marks: parting.marks, seed: parting.tree.seed } : null)
    : visit ? { rings: visit.stash.tree.rings, marks: visit.stash.marks, seed: visit.stash.tree.seed } : { rings: tree.rings, marks, seed: tree.seed };
  if (!src || src.rings.length < 3) return undefined;
  const n = src.rings.length, id = `${src.seed}:${n}:${src.marks.map((m) => `${m.kind}${m.last}${m.size.toFixed(1)}`).join(',')}`;
  const got = forms.get(id);
  if (got) return got;
  const last = src.rings[n - 1], L = last.length;
  let mean = 0;
  for (let j = 0; j < L; j++) mean += last[j];
  mean /= L;
  const N = 240, raw = new Float32Array(N + 1);
  for (let j = 0; j <= N; j++) {
    const am = (j / N) * TAU, as = (TAU - am) % TAU, idx = Math.round((as / TAU) * L) % L;
    let u = (last[idx] / mean) ** 2;
    for (const m of src.marks) {
      const d = angleOff(as, m.a), f = Math.min(1, m.size / 8);
      if (m.kind === 'burl') u *= 1 + 0.2 * f * Math.exp(-((d / 0.32) ** 2)) * (1 + 0.6 * Math.sin(d * 26 + m.seed));
      else u *= 1 + 0.14 * f * Math.exp(-((d / 0.07) ** 2));
    }
    raw[j] = u;
  }
  // (Eased round a little, so it's a crown's shape and not the bark's every wrinkle.)
  const shape = new Float32Array(N + 1);
  for (let j = 0; j <= N; j++) { let t = 0; for (let q = -4; q <= 4; q++) t += raw[(((j + q) % N) + N) % N]; shape[j] = t / 9; }
  let w0 = 0, w1 = 0, cnt = 0, prev = 0;
  for (let i = Math.max(0, n - 40); i < n; i++) {
    let r = 0; const ring = src.rings[i]; for (let j = 0; j < ring.length; j += 8) r += ring[j]; r /= Math.ceil(ring.length / 8);
    if (i > Math.max(0, n - 40)) { const w = r - prev; w0 += w; w1 += w * w; cnt++; }
    prev = r;
  }
  const mw = cnt ? w0 / cnt : 1, cv = cnt ? Math.sqrt(Math.max(0, w1 / cnt - mw * mw)) / Math.max(1e-3, mw) : 0;
  const form = { id, shape, rough: Math.min(0.3, 0.03 + 0.35 * cv) };
  forms.set(id, form);
  if (forms.size > 300) forms.delete(forms.keys().next().value!);
  return form;
}
/**
 * The light as it is now (`?hour=19` to try another): the sun's way across the sky, from the east in the
 * morning to the west at evening, the shadows falling away from it, long when it's low, gone at night.
 */
function sunNow(): { sun: Sun; tint: [number, number, number, number]; key: string } {
  const d = new Date(), h = params.has('hour') ? Number(params.get('hour')) : d.getHours() + d.getMinutes() / 60;
  const f = (h - 6) / 14, up = Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
  const az = Math.PI / 2 + Math.PI * Math.max(0, Math.min(1, f)), dir = az + Math.PI, elev = Math.max(0.1, up * 0.95);
  // (Under cloud, rain or fog, the sun dimmed and the shadows with it: in steps, so the grove's light is drawn
  // afresh, and crossfaded in, only now and then.)
  const dim = overcast(skyNow(clock()));
  const sun: Sun = { dx: Math.sin(dir), dy: -Math.cos(dir), len: Math.min(1.6, 0.36 / Math.tan(elev)), strength: smooth(up / 0.2) * (1 - 0.8 * dim) };
  // (Warm as the sun sets or rises; a cool wash at night.)
  const low = smooth(1 - up / 0.35) * (f > -0.05 && f < 1.05 ? 1 : 0), night = smooth((0.12 - up) / 0.12) * (f < 0 || f > 1 ? 1 : 0);
  const tint: [number, number, number, number] = night > low ? [168, 178, 204, 0.38 * night] : [236, 196, 150, 0.35 * low * (1 - 0.7 * dim)];
  return { sun, tint, key: `${Math.round(h * 4)}|${dim}` };
}
/** How often each kept tree has been opened (by its seed): a path is worn to those opened often. */
const visitsOf = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem('annulus.visits') || '{}'); } catch { return {}; } };
function noteVisit(seed: number): void {
  try { const v = visitsOf(); v[seed] = (v[seed] ?? 0) + 1; localStorage.setItem('annulus.visits', JSON.stringify(v)); } catch { /* not kept, then */ }
}
/**
 * A breeze, drawn across the grove by a finger: puffs of air where it went (world units), each moving as the
 * finger did, dying away over a few seconds. The crowns lean in it, leaves lift, the stream ripples; nothing
 * is kept.
 */
interface Gust { x: number; y: number; vx: number; vy: number; at: number }
const GUST_LIFE = 2.6, GUST_R = 1.3;
let breezeHand: { id: number; x: number; y: number; at: number; on: boolean; last: { x: number; y: number; t: number } | null } | null = null;
let gusts: Gust[] = [];
/** How ruffled the stream is along its length (0 calm), and when that was last looked at. */
let ruffle = new Float32Array(0), ruffledAt = 0;
/** Lifted on it: a leaf, a petal, a flake (world units), drifting down and gone. */
let lifted: { x: number; y: number; vx: number; vy: number; at: number; life: number; col: [number, number, number]; k: number }[] = [];
function blow(h: NonNullable<typeof breezeHand>, x: number, y: number): void {
  const t = clock(), [wx, wy] = groveWorld(x, y);
  if (!h.last) { h.last = { x: wx, y: wy, t }; return; }
  const dt = Math.max(1 / 120, t - h.last.t), d = Math.hypot(wx - h.last.x, wy - h.last.y);
  if (d < 0.12) return;
  const vx = (wx - h.last.x) / dt, vy = (wy - h.last.y) / dt;
  h.last = { x: wx, y: wy, t };
  gusts.push({ x: wx, y: wy, vx, vy, at: t });
  if (gusts.length > 60) gusts.shift();
  // (Something blown from the crown it passed through, as the season has it: never from the bare ground.)
  const season = seasonNow(), near = worldOf().trees.find((o) => o.n >= 1 && Math.hypot(o.wx - wx, o.wy - wy) < o.wr * 1.05);
  if (!near) return;
  const ever = ['pine', 'redwood', 'bristlecone', 'olive', 'fir', 'juniper'].includes(near.sp);
  const col: [number, number, number] | null = season === 'winter' ? [253, 252, 249] : season === 'spring' ? (near.sp === 'cherry' ? [236, 196, 204] : [150, 176, 110])
    : season === 'autumn' ? (ever ? [128, 140, 100] : pigment(near.sp, 'autumn') ?? [176, 112, 60]) : [128, 158, 96];
  if (col && lifted.length < 50 && h1(t * 13.1) < 0.7) {
    const ox = near.wx + (wx - near.wx) * 0.7, oy = near.wy + (wy - near.wy) * 0.7;
    lifted.push({ x: ox, y: oy, vx: vx * 0.25, vy: vy * 0.25, at: t, life: 2.2 + 1.6 * h1(t * 7.7), col, k: h1(t * 3.3) * 100 });
  }
}
/** The breeze at a world point now: which way and how strongly (about 1 for a quick stroke right there). */
function breezeAt(wx: number, wy: number, t = clock()): [number, number] {
  let bx = 0, by = 0;
  for (const q of gusts) {
    const a = t - q.at;
    if (a > GUST_LIFE) continue;
    const sp = Math.hypot(q.vx, q.vy) || 1, f = Math.min(1, sp / 6), cx = q.x + (q.vx / sp) * a * 0.5, cy = q.y + (q.vy / sp) * a * 0.5;
    // (A puff comes up and dies away: quick to rise, slow to settle.)
    const life = Math.min(1, a / 0.25) * (1 - a / GUST_LIFE) ** 2, d2 = ((wx - cx) ** 2 + (wy - cy) ** 2) / (GUST_R * GUST_R);
    const w = f * life * Math.exp(-d2) * 0.35;
    bx += (q.vx / sp) * w; by += (q.vy / sp) * w;
  }
  const m = Math.hypot(bx, by);
  return m > 1 ? [bx / m, by / m] : [bx, by];
}
/** A point on the sheet (device px) in the grove's own ground (world units). */
const groveWorld = (x: number, y: number): [number, number] => { const c = camNow(); return [(x - c.X0) / c.S, (y - c.Y0) / c.S]; };
/** How damp the ground is at a world point: by the stream, damp; some three crowns off, dry. */
function moistAt(wx: number, wy: number): number {
  const st = worldOf().stream;
  let d = Infinity;
  for (const [x, y] of st) d = Math.min(d, Math.hypot(x - wx, y - wy));
  return smooth(1 - (d - 0.6) / 2.2);
}
/** A path's width (world units): narrow when new, wider the more it's walked. */
const pathWidth = (walks: number) => Math.min(0.32, 0.14 + 0.022 * walks);
/** The paths worn on their own (world units), from today's tree to each opened three times or more. */
function trackWays(cam: Cam): { pts: [number, number][]; v: number; k: number }[] {
  const L = groveLayout(cam).trees, visits = visitsOf(), home = L.find((t) => t.i === -1), out: { pts: [number, number][]; v: number; k: number }[] = [];
  if (home) for (const t of L) {
    const v = t.i >= 0 ? visits[groveKept[t.i]?.seed ?? -1] ?? 0 : 0;
    if (v < 3) continue;
    const pts: [number, number][] = [], bend = (h1(t.k * 2.3) - 0.5) * 0.5, dx = t.wx - home.wx, dy = t.wy - home.wy, m = Math.max(8, Math.ceil(Math.hypot(dx, dy) / 0.1));
    for (let q = 0; q <= m; q++) { const f = q / m, off = Math.sin(Math.PI * f) * bend; pts.push([home.wx + dx * f - dy * off, home.wy + dy * f + dx * off]); }
    out.push({ pts, v, k: t.k });
  }
  return out;
}
/** Along a path, how much wider for another meeting or crossing it there: up to half again. */
function meets(pts: [number, number][], all: [number, number][][], self: number): number[] {
  return pts.map(([x, y]) => {
    let near = 0;
    for (const [j, o] of all.entries()) {
      if (j === self) continue;
      for (const [a, b] of o) near = Math.max(near, smooth(1 - Math.hypot(a - x, b - y) / 0.45));
    }
    return 1 + 0.5 * near;
  });
}
/** The grove drawn a piece at a time (the ground, the water, the shadows, each crown), to be spread over frames. */
function* groveSteps(c: CanvasRenderingContext2D, cam: Cam, sprites?: Sprite[], edge = 0): Generator<void> {
  const w = worldOf(), season = seasonNow(), { sun } = sunNow();
  c.clearRect(0, 0, W, H);
  const height = (x: number, y: number) => heightAt((x - cam.X0) / cam.S, (y - cam.Y0) / cam.S, w.hills, w.seed);
  // (The ground's own marks read where they lie on it, as in the grove seen whole: looked into, the same.)
  const ref = (x: number, y: number): [number, number] => [w.whole.X0 + ((x - cam.X0) / cam.S) * w.whole.S, w.whole.Y0 + ((y - cam.Y0) / cam.S) * w.whole.S];
  // (On the graphics chip, the whole ground at once; by hand, a piece at a time.)
  if (!groundGpu(c, W, H, px, cam, w.whole, w.hills, w.seed, season)) {
    washHill(c, W, H, px, height, w.seed, season, cam.S, ref);
    if (season === 'winter') snowHill(c, W, H, px, height, ref);
    yield;
    drawMeadow(c, W, H, px, height, w.seed, ref);
    yield;
    drawHill(c, W, H, px, height, w.seed, ref);
  }
  yield;
  const u = px * Math.pow(Math.max(1, cam.S / w.whole.S), 0.8);
  const at = (wx: number, wy: number): [number, number] => [cam.X0 + wx * cam.S, cam.Y0 + wy * cam.S];
  // (The banks greener, where the ground is damp.)
  {
    const pts = w.stream.map(([x, y]) => at(x, y));
    c.save(); c.globalCompositeOperation = 'multiply'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [wd, al] of [[1.9, 0.035], [1.2, 0.05]] as [number, number][]) { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(...q) : c.moveTo(...q))); c.strokeStyle = `rgba(120,150,96,${al})`; c.lineWidth = wd * cam.S; c.stroke(); }
    c.restore();
  }
  drawStream(c, w.stream.map(([x, y]) => at(x, y)), Math.max(6 * px, 0.55 * cam.S), u, w.seed);
  yield;
  // Paths drawn, as walked: wider the more, fading as they grow over.
  // Paths worn to the trees opened often, from today's: each a little wider where another meets it.
  const worn = trackWays(cam), lines = worn.map((t) => t.pts);
  for (const [j, t] of worn.entries()) drawTrack(c, t.pts.map(([x, y]) => at(x, y)), pathWidth(t.v) * cam.S, u, t.k, { wear: smooth((t.v - 3) / 8), wide: meets(t.pts, lines, j), sun });
  // (The ground alone thinned out at the sheet's edges, so it fades into the one under it, never a cut: the
  // trees whole, never half faded where they stand at the edge.)
  if (edge) feather(c.canvas as HTMLCanvasElement, edge);
  yield;
  const L = groveLayout(cam).trees;
  // Moss, between trees long standing side by side.
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const p = L[a], q = L[b], d = Math.hypot(p.wx - q.wx, p.wy - q.wy), old = Math.min(p.n, q.n);
    if (old < 120 || d > (p.wr + q.wr) * 1.7) continue;
    const [x, y] = at((p.wx + q.wx) / 2, (p.wy + q.wy) / 2);
    drawMoss(c, x, y, d * cam.S * 0.55, d * cam.S * 0.28, Math.atan2(q.wy - p.wy, q.wx - p.wx), Math.min(1, (old - 120) / 220), u, p.k * 7 + q.k);
  }
  // The ground for the next tree: a faint pencil ring, to be touched when one is wanted.
  {
    const [x, y] = at(w.next.wx, w.next.wy), r = Math.max(7 * px, 0.45 * cam.S);
    c.save(); c.strokeStyle = 'rgba(92,88,84,0.5)'; c.lineWidth = 0.8 * px; c.setLineDash([2.5 * px, 2.5 * px]);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.restore();
  }
  for (const s of w.seedlings) { const [x, y] = at(s.wx, s.wy); drawSeedling(c, x, y, Math.max(3 * px, 0.18 * cam.S), u); }
  yield;
  const order = [...L].sort((p, q) => p.y - q.y), shown = order.filter((t) => !(t.x < -t.r * 2 || t.x > W + t.r * 2 || t.y < -t.r * 2 || t.y > H + t.r * 2));
  const wildShown = w.wild.map((t) => ({ ...t, x: cam.X0 + t.wx * cam.S, y: cam.Y0 + t.wy * cam.S, r: t.wr * cam.S })).filter((t) => !(t.x < -t.r * 2 || t.x > W + t.r * 2 || t.y < -t.r * 2 || t.y > H + t.r * 2)).sort((p, q) => p.y - q.y);
  // (The shadows all on the ground first; then the crowns over them, each to be stirred on its own.)
  // (All the shadows as one: their shapes laid solid, then hatched once, finely and lightly, so where two
  // meet it's never darker.)
  if (sun.strength > 0.02) {
    // (One sheet: the hatching laid over it all, then kept only inside the shadows, gathered as one shape.)
    const lay = document.createElement('canvas'); lay.width = W; lay.height = H;
    const lc = lay.getContext('2d')!, all = new Path2D();
    for (const t of wildShown) all.addPath(shadeOf(t.x, t.y, t.r, t.sp, t.k, undefined, sun));
    for (const t of shown) if (t.n >= 1) all.addPath(shadeOf(t.x, t.y, t.r, t.sp, t.k, formOf(t.i), sun));
    // (On the graphics chip, where there is one: the shadows' shape as a mask, hatched there all at once.)
    let hatched = false;
    if (gpu.ready()) {
      lc.fillStyle = '#000'; lc.fill(all, 'nonzero');
      const pic = gpu.run('hatch', W, H, {}, { uH: H, uU: u }, {}, lay);
      if (pic) { c.save(); c.globalAlpha = 0.5 * sun.strength; gpu.lay(c, pic, 0, 0); c.restore(); hatched = true; lay.width = lay.height = 0; }
      else lc.clearRect(0, 0, W, H);
    }
    if (hatched) yield;
    else {
    // (By hand: each stroke its own distance from the last, a little off true, broken now and then, heavier
    // or lighter, so it never reads as a ruled fill.)
    lc.strokeStyle = ink(1); lc.lineCap = 'round';
    const seg = 14 * u;
    for (let d = -H, q = 0; d < W + H; d += (1.3 + 0.9 * h1(q * 1.37)) * u, q++) {
      const tilt = (h1(q * 2.9) - 0.5) * 0.08;
      lc.lineWidth = (0.28 + 0.22 * h1(q * 3.7)) * u; lc.beginPath();
      for (let y0 = 0; y0 < H; y0 += seg) {
        if (h1(q * 7.1 + y0 * 0.013) < 0.12) continue;
        const y1 = Math.min(H, y0 + seg * (0.7 + 0.3 * h1(q + y0 * 0.07)));
        lc.moveTo(d + y0 * (1 + tilt), y0); lc.lineTo(d + y1 * (1 + tilt), y1);
      }
      lc.stroke();
    }
    yield;
    lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = '#000'; lc.fill(all, 'nonzero');
    c.save(); c.globalAlpha = 0.5 * sun.strength; c.drawImage(lay, 0, 0); c.restore();
    lay.width = lay.height = 0;
    yield;
    }
  }
  // (The leaves down round the trees, beneath their crowns' edges.)
  // (A tree's at a time, and a few of the wood's crowns at a time: never one piece too long for a frame.)
  for (const t of shown) { for (const l of litterOf(t, cam, season)) leafAt(c, l.x, l.y, l.len, l.rot, 1, l.col, u); yield; }
  // (The wood round it: ink and a faint wash only, quieter than the trees grown here.)
  let wi = 0;
  for (const t of wildShown) {
    drawCrown(c, t.x, t.y, t.r, t.sp, t.k, u, 0.7, undefined, sun, 'crown');
    washFlat(c, t.x, t.y, t.r, t.sp, t.k, season, 0.8);
    if (++wi % 4 === 0) yield;
  }
  yield;
  for (const t of shown) {
    // (A tree of a day or more is a crown, however small; only a seed just planted is a seedling.)
    if (t.n < 1) { drawSeedling(c, t.x, t.y, Math.min(6 * px, Math.max(3 * px, t.r * 0.8)), px); continue; }
    const form = formOf(t.i);
    if (!sprites) {
      drawCrown(c, t.x, t.y, t.r, t.sp, t.k, u, 1, form, sun, 'crown');
      washCrown(c, t.x, t.y, t.r, t.sp, t.k, px, season, t.i === -1, 1, form);
      continue;
    }
    // (Never larger than the phone allows a picture to be: looked at very close, painted at most so large, laid larger.)
    const m = Math.ceil(t.r * 2 + 10 * px), f = Math.min(1, 2048 / (2 * m)), sc = document.createElement('canvas'); sc.width = sc.height = Math.ceil(2 * m * f);
    const sx = sc.getContext('2d')!; sx.scale(f, f);
    drawCrown(sx, m, m, t.r, t.sp, t.k, u, 1, form, sun, 'crown');
    // (Coloured over the ink, by hand: today's still wet.)
    washCrown(sx, m, m, t.r, t.sp, t.k, px, season, t.i === -1, 1, form);
    sprites.push({ c: sc, x: t.x, y: t.y, m, r: t.r, k: t.k });
    yield;
  }
}
/** The grove drawn for the whole view (kept, to lay under any other while it moves), and for the view now. */
// (Worked out once a frame: it reads the visits kept on the phone.)
let seasonAt = -1, seasonWas = '';
const seasonKey = () => { if (seasonAt !== frameStart) { seasonAt = frameStart; seasonWas = `${worldKey}:${seasonNow()}:${sunNow().key}:${JSON.stringify(visitsOf())}`; } return seasonWas; };
let groveWarmAt = -1e9;
type GroveSheet = { c: HTMLCanvasElement; cam: Cam; key: string; sprites: Sprite[] };
let baseG: GroveSheet | null = null, sharpG: GroveSheet | null = null;
/** The view being drawn for itself, a piece a frame; the one it replaces, fading out; a canvas to reuse. */
let groveJob: (GroveSheet & { steps: Generator<void> }) | null = null, groveFade: { from: GroveSheet; at: number } | null = null, groveSpare: HTMLCanvasElement | null = null;
/** The whole grove drawn, if it isn't already (as it is: its trees, its season, the sheet's size). */
/** The whole grove being drawn ahead, a piece a frame, while the slice is looked at (see `warmGrove`). */
let baseJob: (GroveSheet & { steps: Generator<void> }) | null = null;
/** A sheet done with: its pictures let go at once, never left for the phone's browser to find. */
function dropSheet(sh: GroveSheet): void { sh.c.width = sh.c.height = 0; for (const sp of sh.sprites) sp.c.width = sp.c.height = 0; }
/** The whole grove as it was, fading out under the one drawn afresh (a new year, the light moved on). */
let baseFade: { from: GroveSheet; at: number } | null = null;
function groveBase(): NonNullable<typeof baseG> {
  const key = seasonKey();
  // (Out of date but the right size: kept shown while the new one is drawn a piece a frame, then faded into,
  // never all of it drawn in one frame and swapped.)
  if (baseG && baseG.key !== key && baseG.c.width === W && baseG.c.height === H) {
    const old = baseG;
    warmGrove();
    if (baseG !== old) { if (baseFade) dropSheet(baseFade.from); baseFade = { from: old, at: clock() }; }
    return baseG;
  }
  if (!baseG || baseG.key !== key || baseG.c.width !== W || baseG.c.height !== H) {
    // (Wanted now: what's left of one being drawn ahead, finished at once; or drawn afresh.)
    if (!baseJob || baseJob.key !== key || baseJob.c.width !== W || baseJob.c.height !== H) startBase();
    while (!baseJob!.steps.next().done) { /* the rest */ }
    finishBase();
  }
  return baseG!;
}
function startBase(): void {
  const w = worldOf(), c = document.createElement('canvas'), sprites: Sprite[] = [];
  c.width = W; c.height = H;
  baseJob = { c, cam: w.whole, key: seasonKey(), sprites, steps: groveSteps(c.getContext('2d')!, w.whole, sprites, 0.07) };
}
/**
 * The whole grove drawn ahead, while the slice rests, a piece in what's left of each frame, so pinching out to
 * it finds it there: never all at once in one frame, which a ring settling would show as a stutter.
 */
function warmGrove(): void {
  const key = seasonKey();
  if (baseG && baseG.key === key && baseG.c.width === W && baseG.c.height === H) return;
  if (!baseJob || baseJob.key !== key || baseJob.c.width !== W || baseJob.c.height !== H) startBase();
  const t0 = performance.now(), left = Math.min(6, 11 - (t0 - frameStart));
  do { if (baseJob!.steps.next().done) { finishBase(); return; } } while (performance.now() - t0 < left);
}
function finishBase(): void {
  const job = baseJob!, prev = baseG;
  baseJob = null;
  baseG = { c: job.c, cam: job.cam, key: job.key, sprites: job.sprites };
  // (Drawn ahead out of sight: the one it replaces let go at once.)
  if (prev && far === 0) dropSheet(prev);
}
/** A sheet's ground thinned out at its edges, `f` of the sheet's shorter side in. */
function feather(c: HTMLCanvasElement, f: number): void {
  const bc = c.getContext('2d')!, e = Math.round(f * Math.min(W, H));
  bc.save(); bc.globalCompositeOperation = 'destination-in';
  for (const [x0, y0, x1, y1] of [[0, 0, W, 0], [0, 0, 0, H]] as [number, number, number, number][]) {
    const gr = bc.createLinearGradient(x0, y0, x1 || x0, y1 || y0);
    const span = x1 ? W : H;
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(e / span, '#000'); gr.addColorStop(1 - e / span, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    bc.fillStyle = gr; bc.fillRect(0, 0, W, H);
  }
  bc.restore();
}
/** The view drawn for itself that's faded out: its canvas kept to draw the next into, its crowns let go. */
function dropFade(): void { if (!groveFade) return; groveSpare = groveFade.from.c; for (const sp of groveFade.from.sprites) sp.c.width = sp.c.height = 0; groveFade = null; }
function layGrove(cam: Cam, still: boolean): void {
  const w = worldOf(), key = seasonKey();
  baseG = groveBase();
  const same = (a: Cam, b: Cam) => Math.abs(a.S - b.S) < 1e-3 * b.S && Math.abs(a.X0 - b.X0) < 0.5 && Math.abs(a.Y0 - b.Y0) < 0.5;
  // (Each crown stirred a little by the wind, its own way, the gusts coming and going.)
  const t = clock(), sky = skyNow(t);
  // (`over`: a view drawn for itself lies over this one there, so this is laid only round it, and none of
  // its crowns that view has too: never the ground washed twice, nor a crown doubled.)
  const lay = (from: { c: HTMLCanvasElement; cam: Cam; sprites: Sprite[] }, over?: { c: HTMLCanvasElement; cam: Cam; sprites: Sprite[] }) => {
    const q = cam.S / from.cam.S, X = (x: number) => cam.X0 + (x - from.cam.X0) * q, Y = (y: number) => cam.Y0 + (y - from.cam.Y0) * q;
    // (Laid whole, even under a view drawn for itself: that one's edge is feathered into it, never a cut.)
    g.drawImage(from.c, cam.X0 - from.cam.X0 * q, cam.Y0 - from.cam.Y0 * q, W * q, H * q);
    const doubled = over ? new Set(over.sprites.map((s) => s.k)) : null;
    for (const s of from.sprites) {
      if (doubled?.has(s.k)) continue;
      // (Still, as a map's trees are: they move only in a breeze drawn across them.)
      const ph = (s.x / W) * 2.2 + h1(s.k) * 0.4;
      // (And leaning in a breeze drawn across it, tossing a little as it goes by.)
      const [bx, by] = gusts.length ? breezeAt((s.x - from.cam.X0) / from.cam.S, (s.y - from.cam.Y0) / from.cam.S, t) : [0, 0], lean = Math.min(5 * px, s.r * 0.09) * q * (1 + 0.25 * Math.sin(t * 2.4 + ph));
      // (And the weather's own wind, leaning every crown a little its way, slowly, each in its own time.)
      const sway = sky.wind > 0.1 ? Math.min(5 * px, s.r * 0.09) * q * (sky.wind - 0.1) * 0.7 * (0.75 + 0.25 * Math.sin(t * 1.1 + ph * 2)) : 0;
      const dx = bx * lean + sky.windDx * sway, dy = by * lean + sky.windDy * sway;
      g.drawImage(s.c, X(s.x) - s.m * q + dx, Y(s.y) - s.m * q + dy, 2 * s.m * q, 2 * s.m * q);
    }
  };
  if (same(cam, w.whole)) { lay(baseG); return; }
  // (Still, the view drawn for itself: begun at once, a piece at a time in what's left of each frame, so a
  // pinch never freezes; the last view, scaled, shown till it's done, then fading out over it.)
  // (A view drawn for itself holds until the view has really moved: a finger settling never sets it drawing anew.)
  const near = (a: Cam, b: Cam) => Math.abs(a.S - b.S) < 0.015 * b.S && Math.abs(a.X0 - b.X0) < 3 * px && Math.abs(a.Y0 - b.Y0) < 3 * px;
  if (still && !(sharpG && sharpG.key === key && near(sharpG.cam, cam))) {
    if (!groveJob || groveJob.key !== key || !same(groveJob.cam, cam) || groveJob.c.width !== W || groveJob.c.height !== H) {
      const c = groveSpare ?? document.createElement('canvas'); groveSpare = null;
      c.width = W; c.height = H;
      const sprites: Sprite[] = [];
      groveJob = { c, cam: { ...cam }, key, sprites, steps: groveSteps(c.getContext('2d')!, cam, sprites, 0.03) };
    }
    const t0 = performance.now(), left = Math.min(8, 11 - (t0 - frameStart));
    do { if (groveJob.steps.next().done) { if (groveFade) dropFade(); groveFade = sharpG && near(sharpG.cam, cam) ? { from: sharpG, at: clock() } : null; if (!groveFade && sharpG) { groveSpare = sharpG.c; for (const sp of sharpG.sprites) sp.c.width = sp.c.height = 0; } sharpG = groveJob; groveJob = null; break; } } while (performance.now() - t0 < left);
  }
  // (The whole grove, crossfaded from the one it replaces while that fades.)
  const layBase = (over?: GroveSheet) => {
    const bf = baseFade, ba = bf ? smooth((clock() - bf.at) / STEADY_T) : 1;
    if (bf && ba >= 1) { dropSheet(bf.from); baseFade = null; }
    if (!bf || ba >= 1) { lay(baseG!, over); return; }
    const ga = g.globalAlpha;
    crossfade(() => { g.globalAlpha = 1 - ba; lay(bf.from, over); }, () => { g.globalAlpha = ba; lay(baseG!, over); }, ga);
    g.globalAlpha = ga;
  };
  // (A view drawn for itself, even of the grove as it was a moment ago, shown till its new one is done.)
  const before = () => { if (sharpG) { layBase(sharpG); lay(sharpG); } else layBase(); };
  if (sharpG && near(sharpG.cam, cam)) {
    const a = groveFade ? smooth((clock() - groveFade.at) / 0.6) : 1;
    if (a < 1 && groveFade) {
      // (A true crossfade: never both laid at once, whose inks would add up to a darker grove for a moment.)
      const from = groveFade.from, to = sharpG, ga = g.globalAlpha;
      crossfade(() => { g.globalAlpha = 1 - a; layBase(from); lay(from); }, () => { g.globalAlpha = a; layBase(to); lay(to); }, ga);
      g.globalAlpha = ga;
      return;
    }
    if (groveFade) dropFade();
    layBase(sharpG); lay(sharpG); return;
  }
  // (Moving, the whole laid under, and the last drawn over it.)
  before();
}
/**
 * The grove alive while it's looked at: in autumn, a leaf or two drifting from each broadleaf on the wind;
 * in spring, a cherry's petals; in winter, snow falling over all of it. And the light's own colour: warm as
 * the sun rises or sets, cool at night.
 */
/**
 * A leaf as an engraver draws one small: pointed at both ends, its midrib, a fine ink edge; `len` long, turned
 * `rot`, `flip` its width as it tumbles (1 flat to the eye, 0 edge on).
 */
function leafAt(c: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number, flip: number, col: number[], U: number, alpha = 1): void {
  const w = len * 0.42 * Math.max(0.12, Math.abs(flip));
  c.save(); c.globalAlpha *= alpha; c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(-len / 2, 0); c.quadraticCurveTo(0, -w, len / 2, 0); c.quadraticCurveTo(0, w, -len / 2, 0);
  c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; c.fill();
  c.strokeStyle = ink(0.4); c.lineWidth = Math.min(0.5 * U, len * 0.06); c.stroke();
  if (len > 5 * U) { c.beginPath(); c.moveTo(-len * 0.45, 0); c.lineTo(len * 0.4, 0); c.lineWidth = Math.min(0.4 * U, len * 0.04); c.strokeStyle = ink(0.3); c.stroke(); }
  c.restore();
}
/** How far through the fall the season is (0 none down, 1 all down): by the date, or most of the way when asked for. */
function fallen(season: Season): number {
  if (season === 'spring') return 0.5;
  if (season !== 'autumn') return 0;
  if (params.get('season') === 'autumn') return 0.75;
  const d = new Date(), m = d.getMonth() + d.getDate() / 31;
  return Math.max(0.1, Math.min(1, (m - 8.3) / 2.5));
}
/** The broadleaves' own colours down, or the cherry's petals in spring; nothing from the evergreens. */
function litterCol(sp: string, season: Season): number[] | null {
  if (['pine', 'redwood', 'bristlecone', 'olive', 'fir', 'juniper'].includes(sp)) return null;
  if (season === 'spring') return sp === 'cherry' ? [236, 196, 204] : null;
  return season === 'autumn' ? pigment(sp, 'autumn') : null;
}
/**
 * The leaves come down from a tree, lying round it (screen px, for camera `cam`): a ring of them at its drip
 * line, thickest just outside its crown and on its downwind side, more as the season goes on. Each its own place,
 * size, turn and shade, the same every time: those falling land on these.
 */
function litterOf(tr: { x: number; y: number; r: number; k: number; sp: string; n: number }, cam: Cam, season: Season): { x: number; y: number; len: number; rot: number; col: number[] }[] {
  const col = litterCol(tr.sp, season);
  if (!col || tr.n < 8) return [];
  // (A young tree drops a few, more each year it grows: never none, then a whole pile.)
  const N = Math.round(60 * fallen(season) * Math.min(1.4, tr.r / Math.max(1, cam.S * 0.5)) * Math.min(1, (tr.n - 8) / 40)), out = [];
  const len = Math.max(3 * px, 0.075 * cam.S);
  for (let j = 0; j < N; j++) {
    const h = (q: number) => h1(tr.k * 1.7 + j * 7.13 + q);
    // (Round the crown, more on the lee side, the wind's way.)
    let a = h(1) * TAU; if (h(2) < 0.45) a = 0.6 + (h(3) - 0.5) * 2.2;
    const d = tr.r * (0.82 + 0.6 * Math.pow(h(4), 1.8));
    const shade = 0.95 + 0.25 * h(5);
    out.push({ x: tr.x + Math.cos(a) * d, y: tr.y + Math.sin(a) * d * 0.9, len: len * (0.75 + 0.5 * h(6)), rot: h(7) * TAU, col: col.map((c) => Math.min(255, Math.round(c * shade))) });
  }
  return out;
}
/**
 * The weather where you are, over the grove (see weather.ts): cloud shadows drifting over it on the wind;
 * rain, fine slanting strokes, the ground darker and cooler with it, rings opening on the stream; fog, a paler
 * sheet drifting through; snow lying, a paler ground. Each only as much as there is of it, eased in.
 */
function drawWeather(cam: Cam, sky: Sky, t: number, U: number): void {
  const w = worldOf(), [bx0, by0, bx1, by1] = w.box, spanX = bx1 - bx0 + 8, spanY = by1 - by0 + 8;
  // (Where a thing drifting on the wind is now, in the world, wrapping round a field larger than the grove.)
  const drift = (i: number, speed: number): [number, number] => {
    const wx = bx0 - 4 + ((((h1(i * 1.31) * spanX + t * speed * sky.windDx) % spanX) + spanX) % spanX);
    const wy = by0 - 4 + ((((h1(i * 2.17) * spanY + t * speed * sky.windDy) % spanY) + spanY) % spanY);
    return [cam.X0 + wx * cam.S, cam.Y0 + wy * cam.S];
  };
  g.save();
  // Cloud shadows: only where there's sun to cast them, most in a broken sky.
  const broken = sky.cloud * (1 - sky.cloud) * 4 * sunNow().sun.strength;
  if (broken > 0.03) {
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 12; i++) {
      const [x, y] = drift(i + 40, 0.05 + 0.25 * sky.wind), r = (1 + 0.9 * h1(i * 5.3)) * cam.S;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(96,100,112,${(0.24 * broken).toFixed(3)})`); gr.addColorStop(0.55, `rgba(96,100,112,${(0.17 * broken).toFixed(3)})`); gr.addColorStop(1, 'rgba(96,100,112,0)');
      g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1.5, 1); g.translate(-x, -y); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore();
    }
  }
  // Rain: the ground darker and cooler where it's wet.
  if (sky.rain > 0.02) {
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(178,186,194,${(0.35 * sky.rain).toFixed(3)})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    // (Rings opening on the stream, here and there, gone as they widen.)
    const st = w.stream, n = Math.round(26 * sky.rain);
    g.lineWidth = 0.5 * U;
    for (let q = 0; q < n; q++) {
      const per = 1.4 + h1(q * 3.7), cyc = Math.floor(t / per + h1(q)), p = (t / per + h1(q)) % 1, j = Math.floor(h1(cyc * 7.1 + q) * st.length);
      const [sx, sy] = st[Math.min(st.length - 1, j)], o = (h1(cyc * 3.3 + q) - 0.5) * 0.18;
      const x = cam.X0 + (sx + o) * cam.S, y = cam.Y0 + (sy - o) * cam.S;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      g.globalAlpha = 0.5 * (1 - p) * Math.min(1, p * 6); g.strokeStyle = 'rgb(84,104,116)';
      g.beginPath(); g.ellipse(x, y, (0.4 + 2.6 * p) * U, (0.3 + 1.9 * p) * U, 0, 0, TAU); g.stroke();
    }
    // (The rain itself: fine strokes, slanting with the wind, falling past.)
    const drops = Math.round(150 * sky.rain), sl = 0.15 + 0.6 * sky.wind, ax = sky.windDx * sl, len = (7 + 5 * sky.rain) * U;
    g.strokeStyle = 'rgb(70,78,88)'; g.lineCap = 'round';
    for (let q = 0; q < drops; q++) {
      const v = (90 + 40 * h1(q * 2.3)) * U, m = 20 * U, Wm = W + 2 * m, Hm = H + 2 * m;
      const y = ((h1(q * 3.1) * Hm + t * v) % Hm) - m, x = ((((h1(q * 1.7) * Wm + t * v * ax) % Wm) + Wm) % Wm) - m;
      g.globalAlpha = (0.18 + 0.18 * h1(q * 9.7)) * Math.min(1, sky.rain * 3); g.lineWidth = (0.35 + 0.25 * h1(q * 4.1)) * U;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - ax * len, y - len); g.stroke();
    }
    g.globalAlpha = 1;
  }
  // Snow lying: the ground paler under it.
  if (sky.snow > 0.05) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(255,255,255,${(0.16 * sky.snow).toFixed(3)})`; g.fillRect(0, 0, W, H); }
  // Fog: a paler sheet, thicker in drifting banks.
  if (sky.fog > 0.02) {
    g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(247, 243, 235,${(0.32 * sky.fog).toFixed(3)})`; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const [x, y] = drift(i + 80, 0.04 + 0.1 * sky.wind), r = (2.5 + 2 * h1(i * 7.7)) * cam.S;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(246,242,233,${(0.4 * sky.fog).toFixed(3)})`); gr.addColorStop(1, 'rgba(246,242,233,0)');
      g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(2.2, 1); g.translate(-x, -y); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore();
    }
  }
  g.restore();
}
const litterMemo = new Map<number, { key: string; lit: ReturnType<typeof litterOf> }>();
function drawLife(cam: Cam): void {
  const t = clock(), season = seasonNow(), L = groveLayout(cam).trees, wind = 0.55 + 0.45 * vnoise(t * 0.12, 3.7), U = px * Math.sqrt(Math.max(1, cam.S / worldOf().whole.S)), sky = skyNow(t);
  g.save();
  if (season === 'autumn' || season === 'spring') {
    for (const tr of L) {
      const col = season === 'spring' ? (tr.sp === 'cherry' ? [236, 196, 204] : null) : pigment(tr.sp, 'autumn');
      if (!col || tr.n < 8 || ['pine', 'redwood', 'bristlecone', 'olive', 'fir', 'juniper'].includes(tr.sp)) continue;
      // (Now and then one comes down: out of the crown, swinging side to side and turning over as it falls, to
      // land on the ground round the tree, among those already there, where it stays.)
      // (Worked out again only when the grove is looked at anew.)
      const lk = `${cam.S}|${cam.X0}|${cam.Y0}|${season}|${tr.n}`, got = litterMemo.get(tr.k);
      const lit = got && got.key === lk ? got.lit : litterOf(tr, cam, season);
      if (!got || got.key !== lk) litterMemo.set(tr.k, { key: lk, lit });
      if (!lit.length) continue;
      for (let q = 0; q < 2; q++) {
        const per = 6 + 4 * h1(tr.k + q), cyc = Math.floor(t / per + h1(tr.k * 1.3 + q * 0.7)), p = (t / per + h1(tr.k * 1.3 + q * 0.7)) % 1;
        const to = lit[Math.floor(h1(cyc * 3.1 + q + tr.k) * lit.length)];
        // (A leaf comes down softly: it lets go slowly, then falls at a gentle, steady pace, rocking side to side
        // as a pendulum does and now and then turning over, drifting a little with the air. Seen from above it
        // hardly travels; it's larger while it's high, nearer the eye, and its shadow closes on it as it lands.)
        const fall = Math.min(1, p / 0.75), e = fall < 0.15 ? (fall * fall) / 0.3 : (fall - 0.075) / 0.925;
        const ta = Math.atan2(to.y - tr.y, to.x - tr.x), x0 = tr.x + Math.cos(ta) * tr.r * 0.85, y0 = tr.y + Math.sin(ta) * tr.r * 0.85;
        const air = 1 - e, ph = fall * 5.5 + q * 2 + h1(cyc + q) * 3, rock = Math.sin(ph);
        const nx = -Math.sin(ta), ny = Math.cos(ta), sw = rock * to.len * 1.1 * air;
        // (Carried a little downwind as it falls, coming back to where it lies.)
        const carry = air * sky.wind * tr.r * 0.5;
        const x = x0 + (to.x - x0) * e + nx * sw + sky.windDx * carry, y = y0 + (to.y - y0) * e + ny * sw + sky.windDy * carry;
        // (Tilting into each swing; turning over only now and then, slowly.)
        const flip = fall < 1 ? 0.35 + 0.65 * Math.abs(Math.cos(ph * 0.5 + q)) : 1, rot = to.rot + air * 0.6 * Math.cos(ph);
        // (Down, it's one with the leaf already lying there: gone into it at once, never two inked over one.)
        const al = Math.min(1, p / 0.06) * (p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.03) : 1);
        // (Its shadow on the ground beneath, drawn in as it comes down.)
        if (air > 0.02) { g.save(); g.globalAlpha = al * 0.25 * (1 - air * 0.6); g.beginPath(); g.ellipse(x + air * to.len * 2.2, y + air * to.len * 1.8, to.len * 0.45, to.len * 0.2, to.rot, 0, TAU); g.fillStyle = ink(1); g.fill(); g.restore(); }
        leafAt(g, x, y, to.len * (1 + 0.35 * air), rot, flip, to.col, U, al);
      }
    }
  }
  const flakes = Math.max(season === 'winter' ? 70 : 0, Math.round(130 * sky.snow));
  if (flakes) {
    for (let q = 0; q < flakes; q++) {
      // (Coming in past the sheet's edge and going out past it, fading as it goes: never there and then not.)
      const m = 8 * U, Wm = W + 2 * m, Hm = H + 2 * m;
      const blow = (6 + 10 * wind + 30 * sky.wind) * U * (0.6 + h1(q)), sx = sky.wind > 0.2 ? sky.windDx : 1;
      const x = (((h1(q * 1.7) * Wm + t * blow * sx) % Wm) + Wm) % Wm - m, y = (((h1(q * 3.1) * Hm + t * (14 * U * (0.6 + 0.6 * h1(q * 5)) + blow * Math.max(0, sky.windDy) * 0.5)) % Hm) + Hm) % Hm - m;
      g.globalAlpha = 0.85 * Math.max(0, Math.min(1, (y + m) / (0.06 * H), (H + m - y) / (0.06 * H))); g.beginPath(); g.arc(x + Math.sin(t + q) * 3 * U, y, (0.8 + 0.8 * h1(q * 7)) * U, 0, TAU);
      g.fillStyle = '#fdfcf9'; g.fill(); g.strokeStyle = ink(0.25); g.lineWidth = 0.4 * U; g.stroke();
    }
  }
  g.globalAlpha = 1;
  // (The breeze over the stream: its water ruffled where it blows, as the stream's own ripples are drawn,
  // short wavering strokes running with the water, more of them, each with a glint of light beside it,
  // drifting with the air and gone as it passes.)
  gusts = gusts.filter((q) => t - q.at < GUST_LIFE);
  // (The water holds the ruffle a while after the air has gone by, calming over some two and a half seconds.)
  const st = worldOf().stream;
  if (ruffle.length !== st.length) ruffle = new Float32Array(st.length);
  const calmBy = Math.exp(-Math.min(0.1, t - (ruffledAt || t)) / 0.9);
  ruffledAt = t;
  // (The weather's own wind and rain on it too, all along it, as long as they last.)
  const amb = Math.max(0, sky.wind - 0.25) * 0.6 + 0.2 * sky.rain;
  let ruffled = amb > 0.03;
  for (let i = 0; i < st.length; i++) {
    const m = gusts.length ? Math.hypot(...breezeAt(st[i][0], st[i][1], t)) : 0;
    ruffle[i] = Math.max(ruffle[i] * calmBy, m);
    if (ruffle[i] > 0.02) ruffled = true;
  }
  if (ruffled) {
    const half = 0.13, S = cam.S;
    const P = (x: number, y: number): [number, number] => [cam.X0 + x * S, cam.Y0 + y * S];
    g.lineCap = 'round';
    for (let i = 1; i < st.length - 1; i++) {
      const m = Math.max(ruffle[i], amb);
      if (m < 0.03) continue;
      const [bx, by] = gusts.length && ruffle[i] > amb ? breezeAt(st[i][0], st[i][1], t) : [sky.windDx, sky.windDy];
      const tx0 = st[i + 1][0] - st[i - 1][0], ty0 = st[i + 1][1] - st[i - 1][1], tl = Math.hypot(tx0, ty0) || 1, tx = tx0 / tl, ty = ty0 / tl, nx = -ty, ny = tx;
      const drift = Math.sign(bx * tx + by * ty || 1), seg = tl / 2;
      for (let q = 0; q < 3; q++) {
        if (h1(i * 5.3 + q) > 0.25 + m * 1.2) continue;
        // (Each ripple's own life: rising, held, gone, then again a little way on.)
        const per = 1.6 + 0.8 * h1(i + q * 9.1), ph = (t / per + h1(i * 2.7 + q)) % 1, life = Math.sin(Math.PI * ph);
        const along = (h1(i * 1.9 + q * 3.3) - 0.5) * seg + drift * ph * seg * 0.6, across = (h1(i * 3.7 + q * 1.3) - 0.5) * 2 * half * 0.8;
        const cx = st[i][0] + tx * along + nx * across, cy = st[i][1] + ty * along + ny * across;
        const L = (0.05 + 0.07 * h1(i * 7.1 + q)) * (0.7 + 0.6 * m), wv = 0.012 * Math.sin(t * 3 + i + q);
        const al = Math.min(1, m * 2.5) * life;
        const stroke = (o: number, col: string, wd: number) => {
          const [ax, ay] = P(cx - tx * L / 2 + nx * o, cy - ty * L / 2 + ny * o), [mx, my] = P(cx + nx * (o + wv), cy + ny * (o + wv)), [ex, ey] = P(cx + tx * L / 2 + nx * o, cy + ty * L / 2 + ny * o);
          g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(2 * mx - (ax + ex) / 2, 2 * my - (ay + ey) / 2, ex, ey); g.stroke();
        };
        g.globalAlpha = al * 0.65; stroke(0, 'rgb(84,104,116)', 0.6 * U);
        if (h1(i * 4.1 + q) < 0.5) { g.globalAlpha = al * 0.6; stroke(-0.016, 'rgb(250,249,244)', 0.5 * U); }
      }
    }
    g.globalAlpha = 1;
  }
  lifted = lifted.filter((l) => t - l.at < l.life);
  for (const l of lifted) {
    const a = t - l.at, p = a / l.life, [bx, by] = breezeAt(l.x, l.y, t), dt = 1 / 60;
    l.vx += (bx * 3 - l.vx) * 0.04; l.vy += (by * 3 - l.vy) * 0.04;
    l.x += l.vx * dt + Math.sin(a * 3 + l.k) * 0.004; l.y += l.vy * dt + 0.06 * dt;
    const x = cam.X0 + l.x * cam.S, y = cam.Y0 + l.y * cam.S, lift = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 3 * U;
    g.globalAlpha = Math.min(1, a * 4) * (1 - p) ** 0.6;
    g.save(); g.translate(x, y - lift); g.rotate(a * 4 + l.k); g.beginPath(); g.ellipse(0, 0, 1.6 * U, 0.8 * U, 0, 0, TAU);
    g.fillStyle = `rgb(${l.col[0]},${l.col[1]},${l.col[2]})`; g.fill(); g.strokeStyle = ink(0.5); g.lineWidth = 0.4 * U; g.stroke(); g.restore();
  }
  g.globalAlpha = 1;
  drawWeather(cam, sky, t, U);
  const { tint } = sunNow();
  if (tint[3] > 0.01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${tint[3].toFixed(3)})`; g.fillRect(0, 0, W, H); }
  g.restore();
}
let snapC: HTMLCanvasElement | null = null;
function drawFar(v: View): void {
  // The slice as it is on the sheet, taken up whole.
  // (Only while it's still to be seen, settling into its crown.)
  const fade = 1 - smooth((far - 0.35) / 0.25), c = g.canvas as HTMLCanvasElement;
  if (fade > 0.01) {
    snapC ??= document.createElement('canvas');
    if (snapC.width !== c.width || snapC.height !== c.height) { snapC.width = c.width; snapC.height = c.height; }
    const sc = snapC.getContext('2d')!;
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, snapC.width, snapC.height); sc.drawImage(c, 0, 0);
  } else if (snapC && snapC.width) snapC.width = snapC.height = 0;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(groundOf(), 0, 0);
  const L = groveLayout(), f = L.trees.find((t) => t.i === (visit ? visit.i : -1)) ?? L.trees[L.trees.length - 1];
  // The camera: at first close over the tree, its crown about the slice; rising (evenly, as a scale is
  // felt) until the grove is in view as it was left.
  const Rs = Math.max(8 * px, v.s * warpR(v.warp, barkMax()) + barkCss(v) * px), fr = Math.max(f.r, 3 * px);
  const k0 = Math.min(Rs / (0.3 * fr), (0.46 * W) / fr), q = smooth((far - 0.2) / 0.8), k = Math.exp(Math.log(k0) * (1 - q));
  const X = v.cx + (f.x - v.cx) * q, Y = v.cy + (f.y - v.cy) * q;
  const cam: Cam = { S: L.cam.S * k, X0: X + (L.cam.X0 - f.x) * k, Y0: Y + (L.cam.Y0 - f.y) * k };
  // The grove, coming in as the view rises.
  const rest = smooth((far - 0.45) / 0.4);
  if (rest > 0.01) {
    const still = far >= 1 && !farTo && fingers.size === 0 && clock() - groveMoved > 0.18;
    g.save(); g.globalAlpha = rest; layGrove(cam, still); drawLife(cam); g.restore();
  }
  // Its own crown, drawn afresh at its size (sharp, however close), coming in round the slice.
  const own = smooth(far / 0.22) * (1 - rest), fx = X, fy = Y;
  if (own > 0.01) {
    if (f.n >= 1) {
      drawCrown(g, fx, fy, fr * k, f.sp, f.k, px * Math.max(1, k * Math.min(1, (fr / px) / 14)), own, formOf(f.i), sunNow().sun);
      // (The colour comes with the years: only as the view rises off the day.)
      const tint = smooth((far - 0.55) / 0.35);
      if (tint > 0.01) { g.save(); g.globalAlpha = tint * own; { const r0 = Math.min(fr * k, 0.5 * W), u0 = px * Math.min(k, 2.2) * (r0 / (fr * k)); washCrown(g, fx, fy, r0, f.sp, f.k, u0, seasonNow(), f.i === -1, (fr * k) / r0, formOf(f.i)); } g.restore(); }
    } else drawSeedling(g, fx, fy, Math.min(8 * px, Math.max(4 * px, fr * 0.8) * k), px, own);
  }
  drawCopyWords(smooth((far - 0.9) / 0.1)); placeBackInput(far >= 0.99 && !farTo);
  // The slice, settling to the cut face at its heart, and gone as the crown closes over.
  if (fade > 0.01 && snapC) {
    const toR = 0.3 * fr * k, sR = Rs + (toR - Rs) * smooth(far / 0.3), sk = sR / Rs;
    g.save(); g.globalAlpha = fade;
    // (Cut to the slice's own edge, its bark and all: never a round of the sheet's paper about it.)
    g.translate(fx, fy); g.scale(sk, sk); g.translate(-v.cx, -v.cy);
    if (tree.rings.length) { ringPath(v, barkOf(tree.rings.length - 1), barkCss(v) * 1.6 + 3); g.clip(); }
    else { g.beginPath(); g.arc(v.cx, v.cy, Rs, 0, TAU); g.clip(); }
    g.drawImage(snapC, 0, 0);
    g.restore();
  }
}
/**
 * A copy of everything (the grove, and today's tree), kept as a file somewhere safe; and one taken back.
 * Pencilled small at the foot of the grove.
 */
const copyAt = () => ({ keep: [W / 2 - 112 * px, H - 44 * px] as [number, number], back: [W / 2, H - 44 * px] as [number, number], sky: [W / 2 + 112 * px, H - 44 * px] as [number, number] });
/** Said in pencil beside them: whether the grove takes the weather where you are. */
const skyWords = () => (weatherOn() ? 'your weather' : 'bring your weather');
async function toggleWeather(): Promise<void> {
  if (weatherOn()) { await setWeather(false); say('The grove keeps its own weather again.', 4); return; }
  say('Asking where you are, only roughly.', 6);
  const on = await setWeather(true);
  say(on ? 'The grove has the weather where you are now, as it changes.' : 'Without where you are, the grove keeps its own weather.', 5);
}
function drawCopyWords(al: number): void {
  if (al <= 0.01 || visit) return;
  const c = copyAt();
  g.save(); g.globalAlpha = al * 0.7; g.fillStyle = 'rgba(92,88,84,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic ${13 * px}px Newsreader, "Iowan Old Style", Georgia, serif`;
  // (On a clearing of paper of their own: never written over the map.)
  {
    const cx = W / 2, cy = c.keep[1], rx = 200 * px, ry = 22 * px, gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0, 'rgba(247, 243, 235,1)'); gr.addColorStop(0.7, 'rgba(247, 243, 235,0.92)'); gr.addColorStop(1, 'rgba(247, 243, 235,0)');
    g.save(); g.globalAlpha = al; g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy); g.fillStyle = gr; g.fillRect(cx - rx, cy - rx, 2 * rx, 2 * rx); g.restore();
  }
  g.fillText('keep a copy', ...c.keep); g.fillText('take one back', ...c.back);
  g.globalAlpha = al * (weatherOn() ? 0.85 : 0.6); g.fillText(skyWords(), ...c.sky);
  g.restore();
}
async function keepGroveCopy(): Promise<void> {
  const all = { wellRounded: 1, v: 1, diary: parting ? parting.k : kept(), grove: groveKept };
  // (In the app, by the share sheet (to Files, Notes, Mail, anywhere); in a phone's browser, its own share
  // sheet if it has one; else a download. Said kept only once it truly was.)
  const how = await shareFile(toText(all), `well-rounded-${dayOf()}.json`, 'application/json');
  if (how === 'cancelled') return;
  if (how === 'failed') { say('The copy couldn’t be made just now.', 5); return; }
  try { localStorage.setItem('annulus.copiedAt', String(Date.now())); } catch { /* not noted */ }
  say('A copy is kept, as a file. Keep it somewhere safe.', 4);
}
/**
 * (A file can only be asked for from a real touch on a real file button: one lies, unseen, over the
 * pencilled words, there only while the grove is.)
 */
const backInput = (() => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
  Object.assign(i.style, { position: 'fixed', opacity: '0', width: '100px', height: '36px', transform: 'translate(-50%, -50%)', display: 'none', zIndex: '5', cursor: 'pointer' });
  i.onchange = () => { const f = i.files?.[0]; i.value = ''; if (f) void takeGroveCopy(f); };
  document.body.append(i);
  return i;
})();
function placeBackInput(on: boolean): void {
  const show = on && !visit;
  if (show) { const c = copyAt(); backInput.style.left = `${c.back[0] / px}px`; backInput.style.top = `${c.back[1] / px}px`; }
  if ((backInput.style.display !== 'none') !== show) backInput.style.display = show ? 'block' : 'none';
}
async function takeGroveCopy(file: File): Promise<void> {
  try {
    const all = fromText(await file.text()) as { wellRounded?: number; diary?: KeptTree; grove?: KeptTree[] };
    if (!all.wellRounded || !all.diary || !Array.isArray(all.grove) || !treeFrom(all.diary, DAILY) || all.grove.some((k) => !treeFrom(k, DAILY))) throw new Error('not a copy');
    if (!window.confirm(`Take back this copy (${all.grove.length + 1} trees)? What's here now will be replaced.`)) return;
    // (What's here now set aside first, never only replaced; then the copy put in its place.)
    await setAside({ diary: kept(), grove: groveKept }, 'before-copy');
    try { await setGrove(all.grove); } catch { say('The copy couldn’t be taken back just now. Nothing here was changed.', 6); return; }
    if (!(await keepTree(all.diary, DIARY))) { say('The grove was taken back, but this year’s tree couldn’t be. Try again.', 8); return; }
    location.reload();
  } catch { say('That file isn’t a copy of a grove.', 4); }
}
/** Touched in the grove: an older tree opens to its slice; today's comes home. */
function tapGrove(x: number, y: number): void {
  { const c = copyAt(); if (!visit && y > c.keep[1] - 18 * px && y < c.keep[1] + 18 * px) { if (Math.abs(x - c.keep[0]) < 48 * px) { void keepGroveCopy(); return; } if (Math.abs(x - c.back[0]) < 50 * px) return; if (Math.abs(x - c.sky[0]) < 58 * px) { void toggleWeather(); return; } } }
  const L = groveLayout(), w = worldOf();
  // (The next tree's ground: a new tree, if they say so.)
  if (!visit && Math.hypot(x - (L.cam.X0 + w.next.wx * L.cam.S), y - (L.cam.Y0 + w.next.wy * L.cam.S)) < Math.max(22 * px, 0.6 * L.cam.S)) { plantAgain(); return; }
  let hit: Stand | null = null, best = Infinity;
  for (const t of L.trees) { const d = Math.hypot(x - t.x, y - t.y) / Math.max(t.r * 1.15, 20 * px); if (d < 1 && d < best) { best = d; hit = t; } }
  if (!hit) {
    // (Open ground, or a seedling: a new tree, planted just there.)
    if (visit) return;
    const wx = (x - L.cam.X0) / L.cam.S, wy = (y - L.cam.Y0) / L.cam.S;
    const sd = w.seedlings.find((q) => Math.hypot(q.wx - wx, q.wy - wy) * L.cam.S < Math.max(18 * px, 0.3 * L.cam.S));
    if (sd) { plantAgain([sd.wx, sd.wy]); return; }
    const [bx0, by0, bx1, by1] = w.box;
    if (wx < bx0 - 1.5 || wx > bx1 + 1.5 || wy < by0 - 1.5 || wy > by1 + 1.5) return;
    if (w.trees.some((t) => Math.hypot(t.wx - wx, t.wy - wy) < t.wr + 0.35)) return;
    if (w.wild.some((t) => Math.hypot(t.wx - wx, t.wy - wy) < t.wr + 0.2)) return;
    plantAgain([wx, wy]);
    return;
  }
  if (hit.i < 0) { groveCam = null; farTo = { from: far, to: 0, at: clock() }; return; }
  const k = groveKept[hit.i], t2 = treeFrom(k, DAILY);
  if (!t2) return;
  noteVisit(k.seed);
  // (A path that passes the tree opened is walked: it wears in, and won't grow over.)
  if (!visit) visit = { i: hit.i, stash: { tree, days, kind, marks, place: herePlace } };
  else visit.i = hit.i;
  tree = t2; days = (k.days ?? []).slice(0, t2.rings.length); kind = asKind(k.tree) ?? 'oak'; marks = (k.marks ?? []).map((m) => ({ ...m }));
  lookAfresh(); openedAt = clock(); idleSince = openedAt + OPEN;
  farTo = { from: far, to: 0, at: clock() };
}
/** Back from an older tree to today's. */
function unvisit(): void {
  if (!visit) return;
  ({ tree, days, kind, marks } = visit.stash); herePlace = visit.stash.place ?? null; visit = null;
  lookAfresh();
}
function lookAfresh(): void {
  warp = warpNow(); view = null; ease = null; lookBack = null; look = { k: 1, ox: 0, oy: 0 }; trail = []; inward = null;
  for (const k in printCaches) delete printCaches[k];
}
/**
 * For trying (`?grove`, or `?grove=100`): a grove already grown, of years drawn by a hand calm some days
 * and loose on others. (Past six, the trees share the first six's years, each its own kind.)
 */
function demoGrove(count = 5): KeptTree[] {
  const was = { tree, days, kind }, out: KeptTree[] = [];
  const plan: [Kind, number, string][] = [['oak', 365, '2021-03-01'], ['ash', 330, '2022-03-04'], ['pine', 365, '2023-02-27'], ['olive', 160, '2024-04-02'], ['maple', 260, '2025-03-05'], ['birch', 300, '2025-09-01']];
  try {
    for (const [i, [sp, n, from]] of plan.slice(0, Math.min(count, plan.length)).entries()) {
      kind = sp; tree = new TreeSim(1 + (i + 3) * 7919, DAILY); days = [];
      demoYear(n, dayDate(from));
      out.push({ tree: sp, seed: tree.seed, wander: false, turn: 0, sim: snapshotTree(tree), days: days.slice() });
    }
  } finally { ({ tree, days, kind } = was); }
  for (let i = out.length; i < count; i++) {
    const like = out[i % out.length];
    out.push({ ...like, tree: KINDS[(i * 7 + (i >> 2)) % KINDS.length], seed: like.seed + i * 104729 });
  }
  return out;
}

/**
 * The opening: a tree's rings grow out from its heart, quickly, year on year, until they fill the sheet;
 * then it fades, and today's slice paints itself in. Each ring is the last one's shape carried on (a tree
 * remembers its lumps) with a little of its own, its width a good year or a lean one, its edge a line of
 * ink, the late ones heavier. A touch skips it. (Never under a test, or for those who'd rather less motion;
 * `?intro` to see it there.)
 */
const INTRO = GROWN && (params.has('intro') || (!navigator.webdriver && !matchMedia('(prefers-reduced-motion: reduce)').matches));
/** Pores and flecks pressed: all of them (1), or, for the opening, seen only for a moment, a scatter. */
let SPARSE = 1;
/**
 * How much closer than the slice as it's shown the knots and burls are pressed: their specks and rings are
 * measured in the screen's pixels, as looked into; the opening presses the wood far larger than it's shown,
 * at its own scale, so they're pressed that much larger with it (0: as looked into).
 */
let markK = 0;
const INTRO_GROW = 1.4, INTRO_HOLD = 0.25, INTRO_PULL = STEADY_T, INTRO_FADE = QUICK;
/**
 * The opening: today's own tree, if it has a few days, else one of today's wood grown in a moment. Pressed
 * whole, once, by the slice's own press, so large its bark is past the sheet's corners; shown ring by ring
 * out from the heart, the ink's edge ragged as it spreads; held a breath; then (today's own) drawn back in
 * one movement to where it lives on the sheet, and handed over to it.
 */
/** One press of the opening: its canvas, its scale to the sheet, the slice's middle on it, and its grain. */
interface IntroLayer { c: HTMLCanvasElement; S: number; cx: number; cy: number; v: View; done: number; all: number }
let intro: {
  at: number; last: number; rings: Float32Array[]; skip: number;
  /** Where the slice's middle is on the sheet, and the scale drawn back to (1: none). */
  cx: number; cy: number; to: number;
  /**
   * The press twice over, the one print: sharp, the sheet's size, for the rings growing; and the whole of
   * it, the bark too, coarser, to be drawn back (small by then, its coarseness never seen).
   */
  near: IntroLayer; whole: IntroLayer | null;
  /** What the grain is pressed with (a band of rows at a time, out from the middle, so it starts at once). */
  as: { tree: TreeSim; kind: Kind; k: number };
} | null = null;
function startIntro(): void {
  if (!INTRO) return;
  const was = { tree, days, kind, look, g, px, W, H, marks }, own = tree.rings.length >= 3 && !visit && !parting;
  const end = own ? baseNow() : null;
  const rings: Float32Array[] = [];
  const cx = end ? end.cx : W / 2, cy = end ? end.cy : Math.round(H * 0.47), far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.04, N = 240;
  let made: NonNullable<typeof intro> | null = null;
  try {
    look = { k: 1, ox: 0, oy: 0 };
    if (!own) {
      kind = KINDS.includes(kind) ? kind : 'oak'; tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; marks = [];
      demoYear(56);
    }
    const n = tree.rings.length;
    if (!n) return;
    // (The bark just past the sheet's farthest corner: the rings fill it.)
    let least = Infinity, most = 0;
    for (let j = 0; j < N; j++) { const r = barkOf(n - 1)((j / N) * TAU); least = Math.min(least, r); most = Math.max(most, r); }
    const s = far / least;
    for (let i = -1; i < n; i++) {
      const ring = new Float32Array(N + 1), r = barkOf(i);
      for (let j = 0; j <= N; j++) ring[j] = s * r((j / N) * TAU);
      rings.push(ring);
    }
    // (Pressed as the slice looked into closely (as close as a pinch goes, about): every mark, every speck of paper and fray of ink sized as
    // the finished print's, only larger, so the opening is the print it settles into, never a finer, paler one.)
    const k = Math.max(1, Math.min(3, s / (end ? end.s : baseNow().s)));
    look = { k, ox: 0, oy: 0 };
    const press = (cw: number, ch: number, S: number, ox: number, oy: number): IntroLayer => {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      g = c.getContext('2d')!; px = was.px * S; W = cw; H = ch;
      const v: View = { cx: ox, cy: oy, s: s * S, turn: 0, px, warp: undefined };
      SPARSE = 0.35; markK = end ? s / end.s : 0; look = { k, ox: 0, oy: 0 };
      try { drawPrint(v); } finally { SPARSE = 1; markK = 0; g = was.g; px = was.px; W = was.W; H = was.H; }
      return { c, S, cx: ox, cy: oy, v, done: 0, all: Math.max(oy, ch - oy) };
    };
    // (Sharp: some 1.6 to a CSS px, the screen's own at most, just the sheet: seen whole, it must hold up.)
    // (On the graphics chip, the screen's own resolution: never a softer picture enlarged.)
    const SA = gpu.ready() ? 1 : Math.min(1, 1.6 / was.px);
    const near = press(Math.ceil(W * SA), Math.ceil(H * SA), SA, cx * SA, cy * SA);
    // (Whole: the bark too, never over some 900 px a side.)
    let whole: IntroLayer | null = null;
    if (end) {
      const Rc = s * most + (barkCss({ cx, cy, s, turn: 0, px, warp: undefined }) * 1.6 + 8) * px;
      const SB = Math.min(SA, 900 / (2 * Rc)), side = Math.ceil(2 * Rc * SB);
      whole = press(side, side, SB, side / 2, side / 2);
    }
    made = { at: clock(), last: clock(), rings, skip: 0, cx, cy, to: end ? end.s / s : 1, near, whole, as: { tree, kind, k } };
  } finally { ({ tree, days, kind, look, g, px, W, H, marks } = was); }
  words.style.visibility = 'hidden';
  intro = made;
}
/** Press the opening's grain, out from the middle, for about `ms`: the sharp press first, then the whole. */
function grainIntro(ms: number): void {
  if (!intro) return;
  const it = intro, was = { tree, kind, look, px }, until = performance.now() + ms, step = gpu.ready() ? 1e5 : 12;
  try {
    tree = it.as.tree; kind = it.as.kind; look = { k: it.as.k, ox: 0, oy: 0 };
    for (const L of [it.near, it.whole]) {
      if (!L) continue;
      px = L.v.px;
      while (L.done < L.all && performance.now() < until) {
        inkGrain(L.c, L.v, [L.cy - L.done - step, L.cy - L.done], L.S < 1 ? 1.7 : 1);
        inkGrain(L.c, L.v, [L.cy + L.done, L.cy + L.done + step], L.S < 1 ? 1.7 : 1);
        L.done += step;
      }
      if (L.done < L.all) break;
    }
  } finally { ({ tree, kind, look, px } = was); }
}
/** (`?introT=1.9`: the opening held at that moment, to look at; never ending.) */
const INTRO_T = params.has('introT') ? Number(params.get('introT')) : null;
/** Whether the opening still covers the whole sheet (nothing under it need be drawn). */
const introCovers = (t: number) => !!intro && !intro.skip && (INTRO_T ?? t - intro.at) < INTRO_GROW;
function drawIntro(t: number): void {
  if (!intro) return;
  const it = intro, n = it.rings.length, pulls = it.to < 1;
  if (INTRO_T !== null) { grainIntro(1e9); t = it.at + INTRO_T; it.last = t; }
  const grow = (e: number) => (n - 1) * (1 - (1 - Math.min(1, e)) ** 2.2);
  // (The grain pressed a little more each frame; the rings wait for it, never shown unpressed; and the
  // drawing back waits for the whole of it.)
  const pending = it.near.done < it.near.all || (!!it.whole && it.whole.done < it.whole.all);
  if (pending && !it.skip) {
    grainIntro(18);
    const e0 = (t - it.at) / INTRO_GROW, ring = it.rings[Math.min(n - 1, Math.ceil(grow(e0)) + 1)];
    let most = 0;
    for (let j = 0; j < ring.length; j++) most = Math.max(most, Math.abs(ring[j] * Math.sin((j / (ring.length - 1)) * TAU)));
    const nearDone = it.near.done >= it.near.all, wholeDone = !it.whole || it.whole.done >= it.whole.all;
    if ((!nearDone && (most * it.near.S > it.near.done || e0 >= 1)) || (nearDone && !wholeDone && t - it.at >= INTRO_GROW + INTRO_HOLD)) it.at += t - it.last;
  }
  it.last = t;
  const e = (t - it.at) / INTRO_GROW, reach = grow(e), i = Math.floor(reach), f = reach - i;
  // (Drawn back, today's own, in one movement: slow off the mark, slow into place.)
  const pullAt = it.at + INTRO_GROW + INTRO_HOLD, q = pulls ? smooth(((it.skip ? Math.min(t, it.skip) : t) - pullAt) / INTRO_PULL) : 0;
  // (Drawn back, it lands as today's print itself, so it's handed over in a moment; otherwise it fades.)
  const end = it.skip || pullAt + (pulls ? INTRO_PULL : 0), fade = it.skip ? QUICK : pulls ? 0.15 : INTRO_FADE;
  const al = 1 - smooth((t - end) / fade);
  if (al <= 0 && INTRO_T !== null) return;
  if (al <= 0) {
    // (Handed over: today's slice already there, never painted in again.)
    intro = null; openedAt = clock() - OPEN; idleSince = clock(); words.style.visibility = ''; editionShown = 0; return;
  }
  // (Near its place, and small by then and still moving, it gives way to today's own print, quickly.)
  const pc = printCaches.drawing, hand = pulls && pc ? smooth((q - 0.72) / 0.28) : 0;
  const k = Math.exp(Math.log(it.to) * q), a0 = it.rings[Math.min(n - 1, i)], a1 = it.rings[Math.min(n - 1, i + 1)], N = a0.length - 1;
  g.save(); g.globalAlpha = al;
  g.drawImage(groundOf(), 0, 0);
  g.translate(it.cx, it.cy); g.scale(k, k);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const lay = (L: IntroLayer) => g.drawImage(L.c, -L.cx / L.S, -L.cy / L.S, L.c.width / L.S, L.c.height / L.S);
  // (The ink's edge, ragged as it spreads into the paper: a thin, paler fringe a little beyond, then the
  // ink; its own shape, never a ruled line; gone once the whole is shown.)
  const whole = e >= 1;
  const edge = (out: number) => {
    g.beginPath();
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * TAU, r = a0[j] + (a1[j] - a0[j]) * f, rag = (vnoise(Math.cos(a) * 4 + reach * 0.35, Math.sin(a) * 4 + 9.1) - 0.5) * 7 * px;
      const rr = r + rag + out * px, x = rr * Math.cos(a), y = -rr * Math.sin(a);
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  };
  if (whole) {
    // (Drawn back: the whole press under the sharp one, the same print; the sharp one let go once the
    // whole is fine enough at the size it's shown.)
    g.globalAlpha = al * (1 - hand);
    if (q > 0 && it.whole) lay(it.whole);
    const kSwitch = it.whole ? it.whole.S / it.near.S : 0, aNear = q > 0 ? smooth((k - 1.2 * kSwitch) / (0.8 * kSwitch + 1e-6)) : 1;
    if (aNear > 0.01) { g.globalAlpha = al * aNear * (1 - hand); lay(it.near); }
  } else {
    g.save(); edge(5); g.clip(); g.globalAlpha = al * 0.35; lay(it.near); g.restore();
    g.save(); edge(0); g.clip(); lay(it.near); g.restore();
  }
  g.restore();
  if (pc && hand > 0) drawKept(pc, baseNow(), al * hand, k / it.to);
}

/** When the page opened: the slice paints itself in from the heart. */
let openedAt = 0;
// (`?slow=5` plays the opening and the bloom five times slower, to look at them.)
const SLOW = Number(params.get('slow')) || 1, OPEN = STEADY_T * SLOW, BLOOM = STEADY_T * SLOW;

let lastFrame = 0, frameStart = 0;
function frame(): void {
  // (Time as it passes, whatever the screen's rate: a slower phone's frames come further apart.)
  const t = clock(), dt = lastFrame ? Math.min(0.1, Math.max(1 / 240, t - lastFrame)) : 1 / 60;
  // (Nothing being done and nothing quick moving: half the frames are enough, for the slow things (the
  // breath, the crowns stirring), and the phone kept cool.)
  const calm = fingers.size === 0 && !tree.stroke && !ease && !lookBack && !farTo && !intro && settle.ring < 0 && !gusts.length && !lifted.length && !choiceTo && !ruffle.some((r) => r > 0.02);
  // (Still on the slice, nothing pressing or fading: a quarter of the frames, the breath being slow. Out in
  // the grove, half, for the crowns stirring and the leaves.)
  const still = calm && trail.length < 2 && !fresh && !Object.keys(pressing).length && !Object.values(fading).some(Boolean) && !yearGrow && (relax <= 0 || relax >= 1)
    && !(lit >= 0 && t - litAt < 2 + STEADY_T) && t - openedAt > OPEN && !groveJob && !baseJob && !groveFade;
  const every = !calm ? 0 : far >= 1 ? 1 / 30 : still && far === 0 ? 1 / 15 : 0;
  if (every && t - lastFrame < every - 0.004) { requestAnimationFrame(frame); return; }
  // (Nothing crossfading on a still slice: the sheets for it let go.)
  if (still && far === 0 && blends.length) { for (const b of blends) b.width = b.height = 0; blends.length = 0; }
  lastFrame = t; frameStart = performance.now();
  // (The wood's own way with the hand's line.)
  if (GROWN) { const sm = SMOOTH[kind] ?? DAILY.smooth; if (tree.k.smooth !== sm) (tree.k as { smooth: number }).smooth = sm; }
  // (The practice: the wood is as much as the hand draws, so the ink lasts all the way round and the ring
  // closes where the hand closes it.)
  if (GROWN && !tree.stroke) tree.free = true;
  if (farTo) {
    const p = smooth((t - farTo.at) / STEADY_T);
    far = farTo.from + (farTo.to - farTo.from) * p; farPull = far;
    if (p >= 1) { const to = farTo.to; farTo = null; if (to === 1 && visit) unvisit(); if (to === 1) tellGrove(); }
  }
  if (roomDue) { roomDue = false; makeRoom(); }
  const v = viewNow(t);
  // The ring just closed blooms, then is done (and on the iPhone app, a faint touch as it settles).
  if (settle.ring >= 0 && t - settle.at > BLOOM + 0.6) settle.ring = -1;
  // (A faint touch, on the iPhone app, the moment the ring is seen to come to rest: its colour spread,
  // or, growing true to scale, its new bark all but out to its place.)
  if (settleTap && t >= settleTap) { settleTap = 0; if (NATIVE && painter === null) tap({ strength: 0.3, sharpness: 0.2 }); }
  // A line left resting a while fades away.
  if (tree.stroke && tree.resting && painter === null && t - restAt > 6) tree.cancel();
  if (!PRINT) paper.step(dt);
  if (GROWN) watchHand(t, dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(groundOf(), 0, 0);
  // (While the opening grows, it covers the sheet: nothing under it is pressed yet, so it never stutters;
  // today's slice is pressed in its still moment, before it fades.)
  if (introCovers(t)) { drawIntro(t); requestAnimationFrame(frame); return; }
  // At rest, or drawing: the one eased into the other (slowly to rest, quickly back).
  const busy = fingers.size > 0 || !!tree.stroke || !!ease || settle.ring >= 0;
  if (busy) idleSince = t;
  const restWanted = PRINT && !busy && t - idleSince > 1.4 && !!v.warp && v.warp.beta > 0;
  // (Left a while on the slice, the grove is drawn ready, out of sight, so drawing back to it never stalls.)
  if (GROWN && far === 0 && !intro && !busy && t - idleSince > 2.5 && t - groveWarmAt > 5 && canPull()) { groveWarmAt = t; warmGrove(); }
  else if (baseJob && far === 0 && !busy) warmGrove();
  // (Only drawing brings the magnifier back: a pinch, or looking closer, leaves the slice as it is, never
  // changing under the fingers or a moment after they lift.)
  const drawingNow = !!tree.stroke || painter !== null || settle.ring >= 0 || !!ease;
  const looking = fingers.size > 0 || closer() || !!lookBack;
  relax = drawingNow ? Math.max(0, relax - dt / 0.22) : restWanted && !looking ? Math.min(1, relax + dt / STEADY_T) : relax;
  const moving = (!!ease && !GROWN) || !!lookBack || fingers.size >= 2, drift = !!ease && GROWN;
  // (A finger the phone never said was lifted (a pinch's, now and then): let go after a still second and a half.)
  if (fingers.size && t - lastFingerAt > 1.5 && painter === null) { fingers.clear(); pinch = null; }
  breathe(t, dt);
  // (Out in the grove, the slice is gone from view: not printed under it.)
  if (far >= 0.6) { /* the grove covers the sheet */ }
  else if (PRINT && yearGrow && drawGrowth(v, t, moving, drift)) { /* the year growing out */ }
  else if (PRINT) {
    // (The print at rest pressed a strip at a time when it's new; the slice only settles into it once it's whole.)
    const rv = restOf(v), rest = relax > 0 ? printFor(rv, moving, 'rest', false, true) : undefined;
    // (Only its years or marks out of date hold the slice back from rest; pressed again for a new size of
    // sheet, the last rest print is shown meanwhile, never a snap back to the magnified one.)
    const yearsOf = (k: string) => { const q = k.split('|'); return `${q[0]}|${q[4]}`; };
    if (relax > 0 && (!rest || yearsOf(rest.key) !== yearsOf(printKey(rv)))) relax = Math.min(relax, 0.01);
    const rk = smooth(relax);
    // (Settling from the magnified print to the true-scale one: crossfaded, never both at once.)
    if (rk > 0 && rk < 1 && rest) crossfade(() => drawPrintCached(v, moving, 'drawing', 1 - rk, drift, breathGrow()), () => drawSharp(rest, rv, 'rest', rk, breathGrow()));
    else {
      if (rk < 1) drawPrintCached(v, moving, 'drawing', 1 - rk, drift, breathGrow());
      if (rk > 0 && rest) drawSharp(rest, rv, 'rest', rk, breathGrow());
    }
    drawBreath(shownOf(v));
    if (GROWN) drawFresh(shownOf(v), t);
  } else { paper.draw(g, v); drawLatewood(v); }
  const n = tree.rings.length;
  // A ring touched: lit softly along its edge for a moment, as its day is read.
  // (Coming on softly, from `litAt`: at once for a ring touched; for a year just grown, as it finishes growing.)
  const glow = lit >= 0 && lit < n ? smooth((t - litAt) / 0.5) * (1 - smooth((t - litAt - 2) / STEADY_T)) : 0;
  // (A soft light along it, never a ruled line.)
  if (glow > 0.01) {
    g.save(); g.lineJoin = 'round';
    for (const [w, al] of [[7, 0.1], [3.5, 0.16], [1.4, 0.3]]) { g.strokeStyle = `rgba(255,251,240,${(al * glow).toFixed(3)})`; g.lineWidth = w * px; ringPath(shownOf(v), barkOf(lit)); g.stroke(); }
    g.restore();
  }
  if (!PRINT) drawBark(v);
  // The newest ring's colour spreads from the line drawn in toward the last ring, its front soft.
  if (settle.ring >= 0 && settle.ring < n && !GROWN) {
    const p = smooth((t - settle.at) / BLOOM), inner = barkOf(settle.ring - 1), outer = barkOf(settle.ring);
    // (Its front never ruled: a little ahead here, behind there, as water creeps through paper.)
    const at = (k: number) => (a: number) => { const r0 = inner(a), r1 = outer(a), kk = k + 0.08 * (vnoise(Math.cos(a) * 3 + settle.ring, Math.sin(a) * 3) - 0.5); return r1 - Math.max(0, Math.min(1, kk)) * (r1 - r0); };
    // (Never bare paper: what it hasn't reached is a pale first wash, deepening evenly as the colour
    // arrives, in fine steps too close to see.)
    if (p < 1) {
      const fade = (1 - p) * (1 - smooth((t - settle.at - BLOOM * 0.7) / (BLOOM * 0.5)));
      hideBetween(v, inner, at(p + 0.3), 0.16 * fade);
      const STEPS = 8;
      for (let q = 0; q < STEPS; q++) hideBetween(v, at(p + (0.3 * q) / STEPS), at(p + (0.3 * (q + 1)) / STEPS), (0.46 * fade * (STEPS - q)) / STEPS);
      hideBetween(v, inner, at(p), 0.46 * fade);
    }
  }
  // On opening, the slice paints itself in, from the heart outward.
  const o = smooth((t - openedAt) / OPEN);
  if (o < 1 && n > 0) {
    // (Out through the bark too, so it's never left half there.)
    const out = barkOf(n - 1), pad = (a: number) => out(a) + (4 + 1.4 * barkCss(v)) * px / Math.max(1e-6, v.s);
    const rr = (k: number) => (a: number) => Math.min(pad(a), Math.max(0, k) * pad(a));
    hideBetween(v, rr(o + 0.12), pad, 1);
    hideBetween(v, rr(o), rr(o + 0.12), 0.5);
  }
  // The ink: a brush's line, wet at first, then drying into bristle-streaks and evaporating. (It's on the
  // slice, so it draws back with it.)
  if (GROWN && !n && seedAt) drawSeed(v, t);
  if (GROWN && !n && !seedAt) drawSeedChoice(v, t);
  drawPressMark(shownOf(v), t, dt);
  overChecks(v, () => drawBrush(g, v, t));
  if (GROWN && painter !== null && tree.stroke) drawPendingMarks(v, t);
  if (far > 0) drawFar(v);
  else { placeBackInput(false); drawEdition(shownOf(v), t, dt); }
  drawIntro(t);
  keepWordsOff(v);
  requestAnimationFrame(frame);
}
/**
 * Words are never laid over the print: over the slice, they're withheld until it's drawn back from under them;
 * over the grove (a map to the sheet's edge), they're written on a clearing of paper of their own.
 */
function keepWordsOff(v: View): void {
  const shown = words.classList.contains('shown') && !!words.textContent;
  let covered = false;
  if (shown && far < 0.5 && tree.rings.length) {
    const r = words.getBoundingClientRect(), x0 = r.left * px, y0 = r.top * px, x1 = r.right * px, y1 = r.bottom * px;
    const R = v.s * warpR(v.warp, barkMax()) + (barkCss(v) * 1.6 + 16) * px;
    const nx = Math.max(x0, Math.min(v.cx, x1)), ny = Math.max(y0, Math.min(v.cy, y1));
    covered = Math.hypot(nx - v.cx, ny - v.cy) < R;
  }
  words.classList.toggle('covered', covered);
  words.classList.toggle('onmap', far >= 0.5);
}

void (async () => {
  await recall();
  if (GROWN) {
    void navigator.storage?.persist?.().catch(() => false);
    groveKept = params.has('grove') ? demoGrove(Math.max(1, Number(params.get('grove')) || 5)) : await grove();
  }
  warp = warpNow(); if (!PRINT) { paper.fit(warp, warp.R); paper.bake(tree); }
  fit(); view = null; openedAt = clock(); idleSince = openedAt + OPEN;
  if (GROWN && !tree.rings.length && finishedYear) say('A year. It stands in your grove. Choose the next.', 1e5);
  else if (GROWN && !tree.rings.length) say(seedAt ? 'Draw a loop around the seed.' : 'Swipe through the woods. Touch one to plant it.', 1e5);
  // (Words only where they're needed: before the first ring. After that, the tree says it.)
  else if (!tree.rings.length) say('Draw a circle around this one.', 8);
  // (Anything amiss with the trees kept, said before anything else.)
  if (dataNote) say(dataNote, 12);
  Object.assign(window, { press: { get tree() { return tree; }, get phase() { return settle.ring >= 0 ? 'settling' : 'trace'; }, get easing() { return !!ease; }, get view() { return viewNow(); }, get days() { return days; }, get kind() { return kind; }, get choice() { return SEEDS[choice]; }, get far() { return far; }, get visiting() { return visit?.i ?? null; }, get parting() { return !!parting; }, groveNext: () => { const c = camNow(), w = worldOf(); return { x: (c.X0 + w.next.wx * c.S) / px, y: (c.Y0 + w.next.wy * c.S) / px }; }, grove: () => groveLayout().trees.map((t) => ({ sp: t.sp, n: t.n, i: t.i, x: t.x / px, y: t.y / px, r: t.r / px })), get editionY() { return editionY; }, get stampAt() { return stampAt; }, print: async () => (await yearPrint()).toDataURL('image/png'), get presses() { return presses.splice(0); }, get breeze() { const st = worldOf().stream; return { gusts: gusts.length, lifted: lifted.length, stream: st.length, max: Math.max(0, ...st.map(([x, y]) => Math.hypot(...breezeAt(x, y)))) }; }, get room() { const v = viewNow(); return { widest: v.s * barkMax() / px, room: roomNow() / px }; }, get dbg() { return { trail: trail.length, inward: inward ? inward.ring : null, n: tree.rings.length, relax: +relax.toFixed(2), fading: Object.entries(fading).filter(([, f]) => f).map(([k, f]) => `${k}:${f!.at === Infinity ? 'held' : (clock() - f!.at).toFixed(2)}${f!.still ? 's' : ''}`), pressing: Object.keys(pressing), grow: !!yearGrow, ease: !!ease, caches: Object.entries(printCaches).map(([k, c]) => `${k}:${c ? (c.c.width + 'x' + c.c.height) : '-'}`) }; }, get marks() { return marks.map((m) => `${m.kind}@${m.a.toFixed(2)} ${m.from}-${m.last} x${m.size.toFixed(1)}`); } } });
  // (The real wood: once it's come, the print is pressed again with it.)
  if (PRINT) loadWood(() => { for (const k in printCaches) delete printCaches[k]; for (const k in pressing) delete pressing[k]; });
  startIntro();
  requestAnimationFrame(frame);
})();
