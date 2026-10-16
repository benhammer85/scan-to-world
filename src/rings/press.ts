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
import { wood, sample, tile, loadWood, type Years } from './wood';
import { NATIVE, tap } from '../volcano/native';
import { K, OAK, TreeSim, noise } from './tree';
import { brushAt, radiusAt, scaleFor, unwarpR, warpFor, warpR, type View, type Warp } from './hand';
import { at, drawPaper } from './draw';
import { Paper } from './paint';
import { Ear } from './ear';
import { TYPICAL, ageOn as ageOf, ageWords as ageSaid, dayDate, dayOf, grewIn as grewOf, question as askOf, yearSpans as spansOf } from './child';
import { climate, growth as growthOf, season } from './growing';
import { RINGS, overlap, percent, shapeFor } from './puzzle';
import { crownSize, drawCrown, drawHill, drawSeedling, heightAt, land, seasonOf, washCrown, washHill, type Hill, type Season } from './grove';
import { holdStill, steadySize } from './steady';
import { fromText, grove, keepInGrove, keepRun, keepTree, recallTree, runs, setGrove, snapshotTree, toText, treeFrom, type KeptTree, type Run } from './save';

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
/** The puzzle (puzzle.html): grow a tree to fill an outline, in eight rings. Like the challenge, a game. */
const PUZZLE = document.body.dataset.mode === 'puzzle', GAME = CHALLENGE || PUZZLE;
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
const ROUND = GAME ? 0 : PRINT ? 0.15 : 0.3;
/**
 * The practice, printed, grows as a tree does: from a seed planted on a bare sheet. The loop is always
 * the same size on the screen, day after day, a ritual's: the bark is always shown at the same size
 * (`BARK` of the room), and as the tree grows the view draws slowly back, so the years before tighten in
 * toward the heart; growth shows as the rings' density, as a real slice's age does. The loop is drawn at the hand's size, wherever is comfortable round
 * the slice: how loose it is sets how wide the year is (`STEADY` CSS px out from the bark a steady year;
 * from `LEAST` to `LOOSEST` of one), its wobble how the year swells and thins round the tree; then it
 * draws in onto the slice as the year. (The watercolour and the challenge keep the hand's own scale.)
 */
const GROWN = PRINT && !GAME;
const BARK = 0.6, STEADY = 34, LEAST = 0.4, LOOSEST = 2.4;
/** Where the finger puts the line (steady widths from the bark), eased a little toward round. */
function rounded(a: number, u: number): number {
  if (!GROWN) return Math.min(WIDEST, u) * lean(a) + ROUND * (tree.radius - radiusAt((i) => tree.inner(i), a)) / tree.wRef;
  const v = strokeView ?? viewNow(), loose = (u * tree.wRef * v.s) / (STEADY * px);
  // (A child's tree: the sound of the moment swells the day where it was loud, and pinches it where hushed.)
  const heard = CHILD && ear.on ? 0.78 + 0.5 * ear.read() : 1;
  // (And the tree's own year: good, lean, now and then a hard one.)
  return Math.max(LEAST, Math.min(LOOSEST, loose)) * growth(a) * heard * climate(tree.seed, tree.rings.length) + evenUp(a);
}
/**
 * A tree evens out its lumps, slowly: where it's short of round, a year a little wider (in proportion to
 * how far short, of the whole radius: never so strong that the swells below can't build a lobe).
 */
const evenUp = (a: number) => (0.8 * SPEC[kind].even * (tree.radius - radiusAt((i) => tree.inner(i), a))) / Math.max(1e-3, tree.radius);
/** How the tree itself grows round its girth, besides the hand (see `growing.ts`). */
const growth = (a: number, n = tree.rings.length) => Math.pow(growthOf(tree.seed, a, n), SPEC[kind].amp) * SPEC[kind].width * alive(a, n);
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
 * The side is the tree's own (from its seed). Not in the challenge, where the line is exactly yours.
 */
const ECCENTRIC = GAME ? 0 : 0.16;
function lean(a: number): number {
  const side = (Math.sin(tree.seed * 12.9898) * 43758.5453) % 1 * TAU;
  return 1 + ECCENTRIC * Math.cos(a - side);
}
/**
 * A child's tree (child.html): a ring for each year of a child's life, closing on their birthday, and in it
 * a fine line for each day a parent draws. Planted for them by name and birthday; the years before the
 * first day drawn grown as plain whole years. Kept apart from the practice's tree.
 */
const CHILD = document.body.dataset.mode === 'child';
const DIARY = CHILD ? 'child' : 'diary', params = new URLSearchParams(location.search);
/**
 * The child (once planted for); how many of the shown tree's first rings are whole years (all of them,
 * looking at every year); their height at each birthday (cm, by age: 0 is at birth, if known); the years
 * finished, each its own tree; and this year's: their age in it, and the words kept with its days (`notes`).
 */
interface YearKept { age: number; seed: number; sim: Record<string, unknown>; days: string[]; notes: (string | null)[] }
let child: { name: string; birth: string; listen: boolean } | null = null, whole = 0, newYear = false;
let heights: Record<number, number> = {}, years: YearKept[] = [], age0 = 0, notes: (string | null)[] = [];
/** What's looked at: this year's tree, every year (the life tree), or a year finished (its index). */
let looking: 'year' | 'life' | number = 'year';
/** (The reckoning of a child's tree, for the child planted for: see `child.ts`.) */
const ageOn = (day: string) => ageOf(child!.birth, day), ageWords = (day: string) => ageSaid(child!.birth, day);
/** Where in its year of their life each ring of the tree shown lies. */
const yearSpans = () => spansOf(child!.birth, days, tree.rings.length, whole);
/** How much they grew in a year of their life (cm). */
const grewIn = (age: number) => grewOf(heights, age);
/**
 * Their life as a tree: a ring for each year of it, the year in progress as far as it's come. Each ring's
 * shape is that year's own tree's outline (its bark, carrying the year's swells and lean), where one was
 * drawn; its width, how much they grew (3 mm of wood to the cm), so a missed day never narrows a year.
 */
function lifeTree(): { t: TreeSim; days: string[]; grew: number[]; drawn: boolean[] } {
  const t = new TreeSim(tree.seed + 7, DAILY), out: string[] = [], grew: number[] = [], drawn: boolean[] = [];
  if (!child) return { t, days: out, grew, drawn };
  const b = dayDate(child.birth), now = ageOn(dayOf());
  const outline = (sim: Record<string, unknown> | null, seed: number): Float32Array | null => {
    const y = sim ? treeFrom({ tree: 'oak', seed, wander: false, turn: 0, sim }, DAILY) : null, last = y?.rings[y.rings.length - 1];
    if (!last) return null;
    let m = 0;
    for (let i = 0; i < K; i++) m += last[i];
    m /= K;
    return last.map((r) => r / m);
  };
  let prev: Float32Array | null = null;
  for (let age = 0; age <= now.years; age++) {
    const kept = years.find((y) => y.age === age), here = age === now.years;
    const shape = here ? outline(tree.rings.length ? snapshotTree(tree) : null, tree.seed) : kept ? outline(kept.sim, kept.seed) : null;
    const share = here ? now.day / now.len : 1;
    if (share <= 0) break;
    const w = grewIn(age) * 3 * share, ring = new Float32Array(K);
    for (let i = 0; i < K; i++) {
      const a = (i / K) * TAU, inner = prev ? prev[i] : t.k.pith;
      ring[i] = inner + w * (shape ? shape[i] : growth(a, age * 60));
    }
    t.rings.push(ring); prev = ring;
    out.push(dayOf(new Date(b.getFullYear() + age, b.getMonth(), b.getDate())));
    grew.push(here ? grewIn(age) * share : grewIn(age)); drawn.push(here ? tree.rings.length > 0 : !!kept);
  }
  return { t, days: out, grew, drawn };
}
/** A birthday since this year's tree was begun: it's finished and kept, and a new year's tree is begun. */
function birthdays(): boolean {
  if (!child) return false;
  const now = ageOn(dayOf()).years;
  if (now <= age0) return false;
  if (tree.rings.length) years.push({ age: age0, seed: tree.seed, sim: snapshotTree(tree), days: days.slice(), notes: notes.slice() });
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; notes = []; age0 = now;
  return true;
}/**
 * The kind of tree, which decides how its wood prints and how it grows (a tree keeps its kind; `?tree=ash`
 * and so on plants that kind when a tree is begun). Three families of wood:
 *   ring     ring-porous (oak, ash): each year opens with a row of large pores, printed from a real
 *            section's years (see printYears)
 *   diffuse  diffuse-porous (cherry, maple, birch, olive): fine pores scattered evenly through the year,
 *            each year marked only by a thin line, the real wood's fibre in the ink
 *   conifer  (pine, redwood, bristlecone): no pores; each year's latewood a crisp dark band, resin canals
 *            in it as dark dots (not the redwood's: it has none)
 * And each its own bark, and its own way of growing: the olive gnarled and lopsided, the bristlecone's
 * years very fine and, once it's old, dying back to a strip of living bark; the redwood broad and even.
 */
type Kind = 'oak' | 'ash' | 'cherry' | 'maple' | 'birch' | 'pine' | 'redwood' | 'bristlecone' | 'olive';
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
  oak: { family: 'ring', bark: FISSURED, barkCss: [3, 0.045, 9], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  ash: { family: 'ring', bark: { ...FISSURED, mean: 5, deep: [0.25, 0.6, 1] }, barkCss: [2.5, 0.04, 8], amp: 1, width: 1.05, even: 1, line: 0.85, tone: 1, resin: false },
  cherry: { family: 'diffuse', bark: { ...PLATES, lumps: 90, mean: 10 }, barkCss: [2, 0.03, 6], amp: 1.1, width: 0.9, even: 1, line: 0.85, tone: 1, resin: false },
  maple: { family: 'diffuse', bark: { ...FISSURED, lumps: 120, mean: 9, deep: [0.1, 0.5, 1.5] }, barkCss: [2.5, 0.035, 7], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  birch: { family: 'diffuse', bark: 'papery', barkCss: [1.6, 0.02, 3.5], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: false },
  pine: { family: 'conifer', bark: PLATES, barkCss: [3.5, 0.055, 11], amp: 1, width: 1, even: 1, line: 0.85, tone: 1, resin: true },
  redwood: { family: 'conifer', bark: { lumps: 220, plate: false, mean: 4, deep: [0.3, 0.6, 1], wide: 0.7 }, barkCss: [5, 0.08, 16], amp: 0.7, width: 1.3, even: 1.2, line: 0.85, tone: 1, resin: false },
  bristlecone: { family: 'conifer', bark: { ...PLATES, lumps: 60, mean: 15 }, barkCss: [2, 0.03, 6], amp: 1.8, width: 0.45, even: 0.3, line: 0.85, tone: 1, resin: true },
  olive: { family: 'diffuse', bark: { lumps: 160, plate: false, mean: 11, deep: [0.1, 0.4, 1], wide: 1 }, barkCss: [1.5, 0.02, 4], amp: 2.2, width: 0.8, even: 0.15, line: 0.85, tone: 1, resin: false },
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
      ? (b: number) => Math.max(LEAST, width * growth(b) * climate(tree.seed, tree.rings.length) * (1 + 0.3 * wob * Math.sin(2 * b + ph)) + evenUp(b))
      : (b: number) => Math.max(0.1, (R(b) - radiusAt((i) => tree.inner(i), b)) / tree.wRef + wob * Math.sin(2 * b + ph));
    let a = r() * TAU;
    tree.begin(time, a, u(a));
    while (tree.stroke) { a += TAU / 5 / 60; time += 1 / 60; tree.move(time, a % TAU, u(a % TAU)); }
    days.push(dayOf(day)); time += 2;
  }
  tree.news.length = 0;
}

/** For trying (`?name=…&birth=…&demo`): each year of their life drawn on most days, a few words kept. */
function demoChild(): void {
  const b = dayDate(child!.birth), now = ageOn(dayOf());
  const said = ['more moon', 'she laughed at the dog', 'first steps, to the window', '“again!”', 'slept through', 'rain on the tent', 'sang to the bath', 'her own shoes', 'a hard night', 'picked the blue one'];
  let h = 50 + (tree.seed % 5);
  heights = { 0: h };
  for (let age = 0; age <= now.years; age++) {
    tree = new TreeSim(tree.seed * 7 + age + 1, DAILY); days = [];
    const from = new Date(b.getFullYear() + age, b.getMonth(), b.getDate());
    demoYear(age === now.years ? now.day : 365, from);
    notes = days.map((_, i) => (((i * 7919 + age * 31) % 23) === 0 ? said[(i + age * 3) % said.length] : null));
    if (age < now.years) { years.push({ age, seed: tree.seed, sim: snapshotTree(tree), days: days.slice(), notes: notes.slice() }); h += TYPICAL[age] * (0.85 + 0.3 * ((age * 37) % 10) / 10); heights[age + 1] = Math.round(h * 2) / 2; }
  }
  age0 = now.years;
}

/** The kept tree, if there is one (`?fresh` begins another). */
async function recall(): Promise<void> {
  if (GAME) return;
  // (For trying: `?name=Ada&birth=2023-05-02` plants for a child at once; with `?demo`, the days since
  // their last birthday drawn too.)
  if (CHILD && params.get('name') && params.get('birth')) {
    child = { name: params.get('name')!, birth: params.get('birth')!, listen: false }; kind = 'oak'; seedAt = [0.5, 0.47];
    age0 = ageOn(dayOf()).years;
    if (params.has('demo')) demoChild();
    return;
  }
  if (params.has('demo')) { demoYear(Math.max(1, Number(params.get('demo')) || 365)); return; }
  if (params.has('fresh')) return;
  const k = await recallTree(DIARY), t = k && treeFrom(k, DAILY);
  if (!k || !t) return;
  tree = t; days = (k.days ?? []).slice(0, t.rings.length); kind = asKind(k.tree) ?? 'oak';
  seedAt = k.at ?? (t.rings.length ? [0.5, 0.47] : null);
  if (CHILD && k.name && k.birth) {
    child = { name: k.name, birth: k.birth, listen: k.listen ?? false }; kind = 'oak';
    heights = k.heights ?? {}; years = k.years ?? []; notes = (k.notes ?? []).slice(0, t.rings.length); age0 = k.age ?? ageOn(dayOf()).years;
    while (notes.length < t.rings.length) notes.push(null);
    if (birthdays()) { seedAt = k.at ?? [0.5, 0.47]; keep(); newYear = true; }
  }
  while (days.length < t.rings.length) days.unshift(days[0] ?? dayOf());
  // (The practice: a year from its first ring, the tree is finished, and stands in the grove.)
  if (GROWN && !CHILD && days.length && dayOf() >= yearOn(days[0])) { await keepInGrove(kept()); finishedYear = true; tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; seedAt = null; keep(); }
}
/** A day a year on from the given one (as 2027-10-14). */
const yearOn = (d: string) => { const x = dayDate(d); x.setFullYear(x.getFullYear() + 1); return dayOf(x); };
/** Whether, opening, a year's tree was found finished (and stood in the grove). */
let finishedYear = false;
function keep(): void {
  if (params.has('demo') || GAME || visit || parting) return;
  void keepTree(kept(), DIARY);
}
/** The tree as kept (and as a copy is kept). */
function kept(): KeptTree {
  const now = CHILD ? thisYear() : { tree, days, notes };
  return {
    tree: kind, seed: now.tree.seed, wander: false, turn: 0, sim: snapshotTree(now.tree), days: now.days.slice(), ...(seedAt ? { at: seedAt } : {}),
    ...(child ? { name: child.name, birth: child.birth, listen: child.listen, heights, years, age: age0, notes: now.notes.slice() } : {}),
  };
}

/**
 * The slice on the screen. After each ring it draws back slowly to make room for the next (`ease`, over a
 * few seconds, from where the new bark was drawn to where it fits), never in a jump; a touch while it's
 * drawing back stops it where it is.
 */
let ease: { from: number; at: number } | null = null;
const EASE = 3, EASE_GROWN = 3.5;
/** Where the seed was planted (shares of the sheet), if it has been (the practice, printed). */
let seedAt: [number, number] | null = null;
/** The fisheye for the tree now (none where the tree grows true to scale). */
const warpNow = (): Warp => (GROWN || PUZZLE ? { ...warpFor(tree), beta: 0 } : warpFor(tree));
/** The room the slice has (device px of radius). */
const roomNow = () => Math.max(40 * px, Math.min(W / 2 - 34 * px, H * 0.27));
/** The outermost the bark reaches (mm). */
/** The scale the seed is shown at, its first loop the bark's size: the same for every wood (a fresh tree's). */
let seedScaleOf = { key: '', s: 1 };
function seedScale(): number {
  const key = `${tree.seed}|${W}|${H}|${px}`;
  if (seedScaleOf.key !== key) { const t = new TreeSim(tree.seed, DAILY); seedScaleOf = { key, s: (BARK * roomNow()) / (t.k.pith + t.wRef) }; }
  return seedScaleOf.s;
}
function barkMax(): number {
  const last = tree.rings[tree.rings.length - 1];
  let r = tree.k.pith;
  if (last) for (let i = 0; i < K; i++) r = Math.max(r, last[i]);
  return r;
}
function baseNow(t = clock()): View {
  if (!view && PUZZLE) {
    // (The puzzle: true to scale, the target filling the room, still all the way through.)
    const room = roomNow(), s = (0.86 * room) / (target.size * target.reach);
    view = { cx: W / 2, cy: Math.round(H * 0.47), s, turn: 0, px, warp: undefined };
    ease = null;
  }
  if (!view && GROWN) {
    // The bark and the year to come always the same size, in the middle of the sheet, a little high: the
    // day's loop the same size round it every day, and the year it makes growing out to the same place.
    // (From the first ring on, the bark exactly that size, every day, so the loop is drawn in the same
    // place every day; the years before tighten in toward the heart. Before it, the seed in the middle,
    // the first loop drawn the same distance out.)
    // (Never closer than the seed was shown: the young tree grows out on the sheet, day by day, until its
    // bark reaches that size; only then does the view draw back, never in and then out again.)
    const s = Math.min(seedScale(), (BARK * roomNow()) / (tree.rings.length ? barkMax() : barkMax() + tree.wRef));
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
    const p = smooth((t - lookBack.at) / 0.45);
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
  // (A child's tree: by its days, not its whole years.)
  const n = tree.rings.length, from = CHILD ? Math.max(whole, n - 30) : 0;
  const year = (baseNow().s * (meanR(n - 1) - meanR(from - 1))) / Math.max(1, n - from);
  return Math.max(3, Math.min(60, (12 * px) / Math.max(1e-3, year)));
}
function zoomAbout(x: number, y: number, f: number): void {
  // (The puzzle is looked at whole: the outline and the slice together, never closer.)
  if (PUZZLE) return;
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
  if (closer() && !hintedCloser) { hintedCloser = true; say('Double-tap to zoom out.', 3); }
}
let hintedCloser = false;
/** The ring closed: the slice laid out for the tree as it is now, eased to from where it was. */
function makeRoom(): void {
  const was = baseNow(), old = warp, bark = tree.radius;
  warp = warpNow(); paper.fit(warp, warp.R); view = null;
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
/** (And the ring being drawn when it touched.) */
let marks: { a: number; r: number; at: number; ring: number }[] = [];
/** When the run ended. */
let endedAt = 0;
const bestOf = () => { try { return Number(localStorage.getItem('annulus.challenge')) || 0; } catch { return 0; } };
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
function showScore(): void {
  if (!scoreEl) return;
  if (PUZZLE) { scoreEl.textContent = run.over ? '' : `${target.shape.name} · ring ${Math.min(RINGS, run.rings + 1)} of ${RINGS}`; return; }
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
  marks.push({ a, r: radiusAt((i) => tree.inner(i), a), at: clock(), ring: tree.rings.length });
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
// ---------------------------------------------------------------- the puzzle
/**
 * Today's target, as an outline round the heart: its shape, its mean radius (mm: what steady years would
 * reach in the rings given, and half again, so it has to be grown into), and how far its widest point
 * reaches beyond that.
 */
const target = (() => {
  const shape = shapeFor(dayOf(), params.get('shape'));
  let R = DAILY.pith, reach = 1;
  for (let y = 1; y <= RINGS; y++) R = Math.sqrt(R * R + (DAILY.crown * (1 - Math.exp(-((y / DAILY.crownYears) ** 1.4)))) / Math.PI);
  for (let i = 0; i < 360; i++) reach = Math.max(reach, shape.r((i / 360) * TAU));
  const size = 1.5 * R;
  return { shape, size, reach, r: (a: number) => size * shape.r(a) };
})();
const shareWrap = document.getElementById('share-wrap');
let puzzleScore = 0;
/** The target, pencilled on the paper: a soft graphite line, broken here and there. */
function drawTarget(v: View): void {
  if (!PUZZLE) return;
  // (Over the ink, a paler line beneath it, so it reads on the wood as on the paper.)
  g.save(); g.setLineDash([7 * px, 3 * px]); ringPath(v, target.r, 0, K * 2);
  g.lineWidth = 2.6 * px; g.strokeStyle = 'rgba(244,239,228,0.38)'; g.stroke();
  g.lineWidth = 1.1 * px; g.strokeStyle = 'rgba(92,88,84,0.6)'; g.stroke(); g.restore();
}
const puzzleBest = () => { try { return Number(localStorage.getItem(`annulus.puzzle.${dayOf()}.${target.shape.id}`)) || 0; } catch { return 0; } };
/** The eighth ring: how well it fills the outline, and the best today. */
function endPuzzle(): void {
  run.over = true; endedAt = clock();
  const bark = barkOf(tree.rings.length - 1);
  puzzleScore = overlap(bark, target.r);
  const best = puzzleBest(), isBest = puzzleScore > best;
  if (isBest) { try { localStorage.setItem(`annulus.puzzle.${dayOf()}.${target.shape.id}`, String(puzzleScore)); } catch { /* not kept */ } }
  window.setTimeout(() => {
    words.classList.add('over');
    say([`${percent(puzzleScore)}.`, isBest ? (best ? 'Your best today.' : '') : `Best today: ${percent(best)}.`, 'Tap to try again.'].filter(Boolean).join(' '), 1e5);
    showScore(); shareWrap?.toggleAttribute('hidden', false);
  }, 1400);
}
/** The result, to share: the slice and the target, true to scale, and how well it filled it. */
async function puzzleCard(): Promise<Blob | null> {
  const Wc = 1080, Hc = 1350, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const x = c.getContext('2d')!, was = { g, px };
  try { await document.fonts?.ready; } catch { /* the serif it falls back to will do */ }
  x.fillStyle = PAPER; x.fillRect(0, 0, Wc, Hc);
  const v: View = { cx: Wc / 2, cy: Hc * 0.44, s: (Wc * 0.36) / (target.size * target.reach), turn: 0, px: 2 };
  const lay = document.createElement('canvas'); lay.width = Wc; lay.height = Hc;
  g = lay.getContext('2d')!; px = 2;
  try { drawPrint(v); inkGrain(lay, v); g = x; x.drawImage(lay, 0, 0); drawTarget(v); } finally { g = was.g; px = was.px; }
  x.fillStyle = '#2e2118'; x.textAlign = 'center';
  x.font = `italic 64px Newsreader, "Iowan Old Style", Georgia, serif`; x.fillText(percent(puzzleScore), Wc / 2, Hc * 0.86);
  x.globalAlpha = 0.6; x.font = `34px Newsreader, "Iowan Old Style", Georgia, serif`;
  x.fillText(`${target.shape.name}, in ${RINGS} rings · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`, Wc / 2, Hc * 0.86 + 60);
  x.fillText('Well Rounded', Wc / 2, Hc - 60); x.globalAlpha = 1;
  drawPaper(x, Wc, Hc);
  return new Promise((done) => c.toBlob(done, 'image/png'));
}
document.getElementById('share')?.addEventListener('click', (e) => {
  e.preventDefault();
  void puzzleCard().then(async (b) => {
    if (!b) return;
    const file = new File([b], `well-rounded-${dayOf()}-${target.shape.id}.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: `Well Rounded · ${target.shape.name} · ${percent(puzzleScore)}` }); return; } } catch { return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
});

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
  if (!PUZZLE) keepTheRun();
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY);
  days = []; trail = []; marks = []; settle = { ring: -1, at: 0 };
  run = { score: 0, rings: 0, over: false, gapSum: 0, gapN: 0, began: 0, touches: 0, inside: false, out: false };
  warp = warpNow(); paper.fit(warp, warp.R); paper.bake(tree); view = null; ease = null;
  openedAt = clock();
  words.classList.remove('over', 'shown');
  if (PUZZLE) { shareWrap?.toggleAttribute('hidden', true); for (const k in printCaches) delete printCaches[k]; }
  showScore();
}

/** The ring just closed, blooming (a look only: the next can be begun at once). */
let settle = { ring: -1, at: 0 };
/** When the loop drawn was closed (growing true to scale: it dries where it was drawn). */
let inward: { ring: number; at: number } | null = null;
/**
 * The year growing (growing true to scale): from the bark as it was, out to where it is now, over a season
 * of some seven seconds (quick in spring, slowing to nothing by late summer). Only the wood beyond the old
 * bark changes; the years before never move.
 */
let growing: { ring: number; at: number; was: { c: HTMLCanvasElement; v: View } } | null = null;
const SEASON = 7;
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
let tapStart = { x: 0, y: 0, at: 0 }, lastTap = 0, lastFingerAt = 0;
const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };

/** Whether this touch came down on the slice (a tap there reads its day). */
let inside = false;
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
    holdView(); pinch = spread(); pinched = true;
    return;
  }
  if (fingers.size > 2 || painter !== null) return;
  navAway(true);
  // (The maker's mark, touched: a new tree, if they say so. Nothing is drawn from it.)
  onStamp = !GAME && !CHILD && !visit && far === 0 && editionShown > 0.5 && Math.hypot(e.clientX * px - stampAt[0], e.clientY * px - stampAt[1]) < 24 * px;
  if (onStamp) return;
  // (Looked at closely, or the run over: a finger moves the slice about, or taps; nothing is drawn. And
  // on a bare sheet, a tap plants the seed: see the tap, below.)
  if (tree.rings.length && brushAt(tree, viewNow(), 0, e.clientX * px, e.clientY * px).u < 0) inside = true;
  if (CHILD) hideNote();
  if ((closer() && inside) || far > 0 || visit || run.over || (GROWN && !seedAt) || (CHILD && (!child || looking !== 'year'))) return;
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
  // (Read only on a tap, when the finger lifts: a pinch or a drag begun on the slice reads nothing.)
  if (inside) return;
  const b = brushAt(tree, v, 0, ...brushPoint(v, x, y));
  strokeView = v;
  if (GROWN) { trail = []; inward = null; }
  if (CHILD && child?.listen) void ear.start();
  if (tree.begin(e.timeStamp / 1000, b.a, rounded(b.a, b.u))) {
    painter = e.pointerId; paper.begin(tree); trailAt(b.a, b.u);
    run.gapSum = 0; run.gapN = 0; run.began = clock(); run.touches = 0; run.inside = false; run.out = false;
    loop = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, len: 0, closed: false };
  }
});
canvas.addEventListener('pointermove', (e) => {
  lastFingerAt = clock();
  const f = fingers.get(e.pointerId);
  if (f) {
    const x = e.clientX * px, y = e.clientY * px, dx = x - f.x, dy = y - f.y;
    f.x = x; f.y = y;
    if (pinch && fingers.size >= 2) {
      const now = spread();
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
      if (tree.finish(GAME ? 0.9 : 0.5)) break;
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
  // (Let go part way back: on to the grove, or home to today.)
  if (fingers.size === 0 && far > 0 && far < 1 && !farTo) settleFar();
  navAway(false);
  // A tap (short, still, one finger): a double tap goes back from looking closer; after a run, a tap
  // begins another.
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
    if (run.over && !closer() && t - endedAt > 1.8) { restart(); return; }
    if (onStamp) { onStamp = false; plantAgain(); return; }
    // A tap on the slice: the ring there, and its day.
    if (inside && !GAME && painter === null) { readDay(shownOf(viewNow()), e.clientX * px, e.clientY * px); return; }
    // Before the first ring, a tap plants the seed there (or moves it).
    if (GROWN && !tree.rings.length && !closer() && (!CHILD || child)) {
      if (painter === e.pointerId) { tree.cancel(); trail = []; painter = null; }
      // (The practice, on a bare sheet: the seed tapped is the tree; tapped again before the first ring, it
      // changes. The child's tree is an oak.)
      if (!CHILD) {
        const v = viewNow(), x = e.clientX * px, y = e.clientY * px;
        // (The slice shown, touched: its seed. A touch either side of it turns to the next.)
        if (!seedAt) {
          if (Math.abs(choiceDx) > 2 * px || choiceTo) return;
          const D = sliceD();
          if (Math.hypot(x - v.cx, y - v.cy) > D / 2) { if (y > v.cy - D / 2 && y < v.cy + D / 2 + 80 * px) turnChoice(x < v.cx ? -1 : 1); return; }
          kind = SEEDS[choice]; folding = { sp: kind };
        }
      }
      plant(W / 2, H * 0.47);
      return;
    }
  }
  if (e.pointerId !== painter) return;
  painter = null;
  if (CHILD) ear.stop();
  // Let go most of the way round, the ring is closed for you; earlier, the line rests, to be taken up.
  if (tree.finish(GAME ? 0.95 : 0.8)) hear();
  // (A whole loop drawn, but not round the slice: let go, and said where, once the hand is off.)
  else if (loop.closed && tree.stroke) { tree.cancel(); say(GROWN ? (tree.rings.length ? 'Draw your loop around the tree.' : 'Draw your loop around the seed.') : 'Draw around the circle.', 4); }
  else { tree.lift(); restAt = clock(); }
});
// (On a computer, the wheel looks closer about the pointer.)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (painter !== null) return;
  holdView(); zoomAbout(e.clientX * px, e.clientY * px, Math.exp(-e.deltaY * 0.002));
  clearTimeout(wheelT); wheelT = window.setTimeout(() => { if (far > 0 && far < 1 && fingers.size === 0 && !farTo) settleFar(); }, 220);
}, { passive: false });
let wheelT = 0;
// (On a computer, the arrow keys turn through the woods.)
window.addEventListener('keydown', (e) => { if (choosing() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) turnChoice(e.key === 'ArrowLeft' ? -1 : 1); });
/** When the line was let go to rest (a line left resting a while fades away: no stray marks). */
let restAt = 0;

// ---------------------------------------------------------------- a child's tree: planting for them, and a copy kept
const setupEl = document.getElementById('setup') as HTMLFormElement | null;
/** Asked for once: their name and birthday (or a copy kept before, restored). */
function openSetup(): void {
  if (!setupEl) return;
  setupEl.hidden = false; nav?.classList.add('away');
  const birth = setupEl.elements.namedItem('birth') as HTMLInputElement;
  birth.max = dayOf();
  setupEl.onsubmit = (e) => {
    e.preventDefault();
    const name = (setupEl.elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!name || !birth.value || birth.value > dayOf()) return;
    const tall = Number((setupEl.elements.namedItem('height') as HTMLInputElement).value);
    child = { name, birth: birth.value, listen: (setupEl.elements.namedItem('listen') as HTMLInputElement).checked }; kind = 'oak';
    // (The question and the seed: that's all, at first.)
    age0 = ageOn(dayOf()).years;
    if (tall > 30) heights[age0] = tall;
    setupEl.hidden = true; nav?.classList.remove('away'); views?.classList.remove('hidden');
    keep();
    say(`Tap where ${name}’s tree should grow.`, 1e5);
  };
  (setupEl.elements.namedItem('file') as HTMLInputElement).onchange = (e) => void restoreCopy((e.target as HTMLInputElement).files?.[0]);
}
/** A copy of the tree, to keep somewhere safe: a small file, everything in it. */
function keepCopy(): void {
  if (!child) { say('Plant their tree first.', 3); return; }
  const blob = new Blob([toText(kept())], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${child.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-tree-${dayOf()}.json`;
  document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { localStorage.setItem('annulus.child.copied', String(thisYear().days.length + years.reduce((n, y) => n + y.days.length, 0))); } catch { /* not noted */ }
  say('A copy is kept, as a file. Keep it somewhere safe.', 4);
}
/** A copy kept before, taken back (only if it's whole: a child's tree that loads). */
async function restoreCopy(file: File | undefined): Promise<void> {
  if (!file) return;
  try {
    const k = fromText(await file.text()) as KeptTree;
    if (!k.name || !k.birth || !treeFrom(k, DAILY)) throw new Error('not a tree');
    await keepTree(k, DIARY);
    location.reload();
  } catch { say('That file isn’t a copy of a child’s tree.', 4); }
}
document.getElementById('keep-copy')?.addEventListener('click', (e) => { e.preventDefault(); keepCopy(); });
/**
 * Keeping it safe: the browser asked to keep this site's storage rather than clear it when space is short
 * (Safari also clears a site's storage after some seven days unvisited, unless it's on the Home Screen).
 * And, quietly, once a month or so of days drawn since the last copy, a reminder to keep one.
 */
function guardKept(): void {
  void navigator.storage?.persist?.().catch(() => false);
  let last = 0;
  try { last = Number(localStorage.getItem('annulus.child.copied')) || 0; } catch { /* none kept */ }
  const drawn = thisYear().days.length + years.reduce((n, y) => n + y.days.length, 0);
  const home = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (drawn >= 7 && drawn - last >= 30) window.setTimeout(() => say(home ? 'It’s been a while: keep a copy, somewhere safe.' : 'Add this page to your Home Screen to keep it safe, and keep a copy now and then.', 6), 12000);
}

/**
 * A breath, in the paper (the practice only): left still a few seconds, a faint shade round the bark swells
 * and ebbs at six breaths a minute, four seconds in and six out (slow breathing, the out-breath long, is what
 * calms); a touch, and it's gone. Never a word about it but once.
 */
const BREATH = PRINT && GROWN && !CHILD, IN = 4, OUT = 6;
let breathShown = 0, stillSince = 0, breathNow = 0;
/** Where in the breath it is now, 0 (out) to 1 (in), and how present the breath is (0 to 1). */
function breathe(t: number, dt: number): void {
  const still = BREATH && fingers.size === 0 && !tree.stroke && !growing && settle.ring < 0 && !lookBack && tree.rings.length > 0;
  // (Its own stillness: the slice slowly making room doesn't count; a finger, a ring growing, does.)
  if (!still) stillSince = t;
  breathShown = still && t - stillSince > 3 ? Math.min(1, breathShown + dt / 3) : Math.max(0, breathShown - dt / 0.25);
  // (In: eased swell; out: a long, slow ebb.)
  const c = (t - stillSince - 3) % (IN + OUT);
  breathNow = c < IN ? smooth(c / IN) : 1 - smooth((c - IN) / OUT);
  // (It breathes without being told: the slice says it.)
}
/** How much larger the slice is drawn now, breathing (about one part in sixty at the full in-breath). */
const breathGrow = () => 1 + 0.016 * breathShown * breathNow;
function drawBreath(v: View, _t: number, _dt: number): void {
  if (!BREATH || breathShown <= 0.01) return;
  const n = tree.rings.length, b = breathNow;
  const bark = n ? barkOf(n - 1) : barkOf(-1), T = n ? barkCss(v) : 2, reach = 6 + 16 * b;
  g.save(); g.lineJoin = 'round';
  for (let k = 0; k < 12; k++) {
    const f = (k + 0.5) / 12;
    g.strokeStyle = ink(0.026 * breathShown * (1 - f) ** 1.5 * (0.4 + 0.6 * b));
    g.lineWidth = (reach / 4 + 3) * px;
    ringPath({ ...v, s: v.s * breathGrow() }, bark, T + 2 + reach * f);
    g.stroke();
  }
  g.restore();
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
const ART_H: Record<Kind, number> = { oak: 84, ash: 112, cherry: 62, maple: 92, birch: 52, pine: 64, redwood: 72, bristlecone: 118, olive: 66 };
const SEED_ART: Partial<Record<Kind, HTMLImageElement>> = {};
for (const sp of Object.keys(ART_H) as Kind[]) {
  const im = new Image();
  im.onload = () => { SEED_ART[sp] = im; };
  im.src = new URL(`./seeds/${sp}.png`, import.meta.url).href;
}
const TILT: Record<Kind, number> = { oak: -0.25, ash: 0.45, cherry: 0.15, maple: 0, birch: 0.1, pine: 0.5, redwood: -0.2, bristlecone: 0.25, olive: -0.4 };
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
    g.fillStyle = 'rgba(244,239,228,0.32)'; g.beginPath(); g.ellipse(-1.8 * u, 3.5 * u, 1.2 * u, 3 * u, -0.2, 0, TAU); g.fill();
    g.fillStyle = ink(0.95); g.beginPath(); g.ellipse(0, -2.6 * u, 6.4 * u, 3.4 * u, 0, Math.PI, TAU); g.lineTo(6.4 * u, -1.6 * u); g.lineTo(-6.4 * u, -1.6 * u); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(244,239,228,0.5)'; g.lineWidth = 0.6 * u; g.beginPath();
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
    g.fillStyle = 'rgba(244,239,228,0.4)'; g.beginPath(); g.ellipse(-1.9 * u, -0.6 * u, 1.1 * u, 1.7 * u, -0.5, 0, TAU); g.fill();
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
    g.strokeStyle = 'rgba(244,239,228,0.55)'; g.lineWidth = 0.6 * u; g.beginPath();
    for (let i = -2; i <= 2; i++) { g.moveTo(-5 * u, i * 2.4 * u - 2 * u); g.quadraticCurveTo(0, i * 2.4 * u + 1.6 * u, 5 * u, i * 2.4 * u - 2 * u); }
    for (let i = -2; i <= 2; i++) { g.moveTo(i * 2.2 * u, -6 * u); g.quadraticCurveTo(i * 2.2 * u + 1.4 * u, 0, i * 2.2 * u, 6 * u); }
    g.stroke(); g.strokeStyle = ink(0.85); g.lineWidth = 1 * u; g.beginPath(); g.moveTo(0, -6.2 * u); g.lineTo(0.6 * u, -8.6 * u); g.stroke();
  } else if (sp === 'bristlecone') {
    // A cone, long, in rows of scales, each tipped with a fine prickle.
    g.beginPath(); g.ellipse(0, 0, 4.4 * u, 8.6 * u, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(244,239,228,0.55)'; g.lineWidth = 0.55 * u; g.beginPath();
    for (let i = -4; i <= 4; i++) for (const sgn of [-1, 1]) { g.moveTo(-4.4 * u, i * 2.6 * u + sgn * 3 * u); g.lineTo(4.4 * u, i * 2.6 * u - sgn * 3 * u); }
    g.stroke(); g.strokeStyle = ink(0.8); g.lineWidth = 0.45 * u; g.beginPath();
    for (let i = -3; i <= 3; i++) for (const sgn of [-1, 1]) {
      const yy = i * 2.4 * u, xx = sgn * 4.4 * Math.sqrt(Math.max(0, 1 - (yy / (8.6 * u)) ** 2)) * u;
      g.moveTo(xx, yy); g.lineTo(xx + sgn * 1.8 * u, yy - 0.8 * u);
    }
    g.stroke();
  } else if (sp === 'olive') {
    // The fruit, oval, a light on it, a narrow leaf from its stalk.
    g.beginPath(); g.moveTo(0, -4.6 * u); g.bezierCurveTo(3 * u, -8 * u, 9 * u, -11 * u, 13 * u, -11.5 * u); g.bezierCurveTo(9 * u, -8.6 * u, 3.5 * u, -5.6 * u, 0, -4.6 * u);
    g.fillStyle = ink(0.3); g.fill(); g.stroke(); g.lineWidth = 0.4 * u; g.beginPath(); g.moveTo(0.5 * u, -4.8 * u); g.quadraticCurveTo(6 * u, -8.6 * u, 12.5 * u, -11.4 * u); g.stroke();
    g.fillStyle = ink(0.88); g.beginPath(); g.ellipse(0, 1 * u, 3.8 * u, 5.4 * u, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(244,239,228,0.35)'; g.beginPath(); g.ellipse(-1.4 * u, -0.6 * u, 0.9 * u, 1.8 * u, -0.3, 0, TAU); g.fill();
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
const SEEDS: Kind[] = ['oak', 'ash', 'cherry', 'maple', 'birch', 'pine', 'redwood', 'bristlecone', 'olive'];
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
const choosing = () => GROWN && !CHILD && !tree.rings.length && !seedAt;
/** Turned on by one, either way (wrapping round). */
function turnChoice(dir: number): void {
  choice = (choice + dir + SEEDS.length) % SEEDS.length;
  choiceTo = { from: choiceDx + dir * W, to: 0, at: clock() };
  choiceDx = choiceTo.from;
}
function drawSeedChoice(v: View, t: number): void {
  if (choiceTo) {
    const p = smooth((t - choiceTo.at) / 0.45);
    choiceDx = choiceTo.from + (choiceTo.to - choiceTo.from) * p;
    if (p >= 1) choiceTo = null;
  }
  const k = smooth((t - openedAt) / 1.2), D = sliceD();
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
      if (grown && !params.has('demo')) await keepInGrove(was);
      if (grown) groveKept = [...groveKept, was];
      parting = null; worldKey = ''; keep();
    })();
  } else keep();
  if (!(CHILD && child)) { say('Now draw a loop around it.', 9); return; }
  say(`${question()} Draw a loop around the seed: loose for an easy day, close for a hard one.`, 9);
}

// ---------------------------------------------------------------- a child's tree: the day's question, its words, its years
/** The day's question (see `child.ts`). */
const question = () => askOf(child!.name, child!.birth, dayOf());
/** The few words a day's ring may keep, asked for once it's drawn; or, on a birthday, their height. */
const noteEl = document.getElementById('note') as HTMLFormElement | null;
const views = document.getElementById('views');
let noteFor: { kind: 'words'; ring: number } | { kind: 'height'; age: number } | null = null, noteT = 0;
function askNote(what: NonNullable<typeof noteFor>, placeholder: string): void {
  if (!noteEl) return;
  noteFor = what;
  const input = noteEl.elements.namedItem('text') as HTMLInputElement;
  input.value = ''; input.placeholder = placeholder;
  input.inputMode = what.kind === 'height' ? 'decimal' : 'text';
  noteEl.classList.add('shown');
  clearTimeout(noteT); noteT = window.setTimeout(hideNote, what.kind === 'height' ? 60000 : 25000);
}
function hideNote(): void { noteEl?.classList.remove('shown'); noteFor = null; (document.activeElement as HTMLElement | null)?.blur?.(); }
noteEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = (noteEl.elements.namedItem('text') as HTMLInputElement).value.trim();
  if (noteFor?.kind === 'words' && text) { notes[noteFor.ring] = text; keep(); say('Kept with the day.', 2.5); }
  if (noteFor?.kind === 'height') { const h = Number(text.replace(',', '.')); if (h > 30 && h < 230) { heights[noteFor.age] = h; keep(); say('Kept. It’s the width of their year.', 3); } }
  hideNote();
});
/** The sound of the moment, heard while a day's loop is drawn (if they said so), never kept. */
const ear = new Ear();
document.addEventListener('visibilitychange', () => { if (document.hidden) ear.stop(); });

/** Looking at this year's tree, every year (their life's), or a finished year: the tree shown changes. */
let stash: { tree: TreeSim; days: string[]; notes: (string | null)[] } | null = null, life: ReturnType<typeof lifeTree> | null = null;
function lookAt(to: typeof looking): void {
  if (!child || to === looking) return;
  if (stash) { tree = stash.tree; days = stash.days; notes = stash.notes; stash = null; }
  whole = 0; looking = to; life = null;
  if (to === 'life') {
    life = lifeTree(); stash = { tree, days, notes };
    tree = life.t; days = life.days; notes = []; whole = tree.rings.length;
  } else if (typeof to === 'number') {
    const y = years[to], t = treeFrom({ tree: 'oak', seed: y.seed, wander: false, turn: 0, sim: y.sim }, DAILY);
    if (t) { stash = { tree, days, notes }; tree = t; days = y.days.slice(); notes = y.notes.slice(); }
  }
  warp = warpNow(); view = null; ease = null; lookBack = null; look = { k: 1, ox: 0, oy: 0 }; growing = null; trail = []; inward = null;
  for (const k in printCaches) delete printCaches[k];
  openedAt = clock(); idleSince = openedAt + OPEN; hideNote();
  // (Only where one isn't: every year from this year, this year from anywhere else.)
  views?.querySelectorAll('a[data-view]').forEach((a) => a.toggleAttribute('hidden', (a as HTMLElement).dataset.view === (to === 'year' ? 'year' : 'life')));
  if (to === 'life') say(`Every year of ${child.name}’s, a ring each. Touch one to open it.`, 4);
  else if (typeof to === 'number') say(`${child.name}’s year at ${years[to].age}.`, 3);
}
views?.querySelectorAll<HTMLAnchorElement>('a[data-view]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); lookAt(a.dataset.view === 'life' ? 'life' : 'year'); }));
/**
 * The year's print, for printing on real paper: ink only. An 8 × 10 inch sheet at 300 dpi, white (the
 * paper, unprinted), the year's tree in ink a little above the middle, true to scale, and nothing else: no
 * printed paper, no lettering pretending to be pencil, no stamp pretending to be pressed. The name and year
 * are for the parent to pencil under it, by hand; the stamp, if any, pressed. (Of the year looked at, or
 * this one so far.)
 */
const INK_PRINT = [24, 20, 18];
async function yearPrint(): Promise<HTMLCanvasElement> {
  const Wp = 2400, Hp = 3000, P = 4, out = document.createElement('canvas'); out.width = Wp; out.height = Hp;
  const c = out.getContext('2d')!, was = { g, px, W, H };
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, Wp, Hp);
  const R = barkMax(), v: View = { cx: Wp / 2, cy: Hp * 0.44, s: (Wp * 0.3) / Math.max(1e-6, R), turn: 0, px: P };
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
  return out;
}
/**
 * The year's words, for the back of the print (or a card tucked behind it): 5 × 7 inches at 300 dpi, ink
 * only. Set, plainly, as type: the name, the year's dates and its days, then every few words kept with its
 * days, each on its own line with its day.
 */
async function yearWords(): Promise<HTMLCanvasElement> {
  const Wc = 1500, Hc = 2100, out = document.createElement('canvas'); out.width = Wc; out.height = Hc;
  const c = out.getContext('2d')!, ink = `rgb(${INK_PRINT.join(',')})`;
  try { await document.fonts?.ready; } catch { /* the serif it falls back to will do */ }
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, Wc, Hc);
  printing = true;
  const [, span] = editionWords(dayOf());
  printing = false;
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = `italic 64px Newsreader, "Iowan Old Style", Georgia, serif`; c.fillText(child?.name ?? '', Wc / 2, 230);
  c.font = `40px Newsreader, "Iowan Old Style", Georgia, serif`; c.fillText(span, Wc / 2, 300);
  c.fillText(`${new Set(days).size} days`, Wc / 2, 356);
  const kept = notes.map((n, i) => (n ? { n, day: days[i] } : null)).filter((x): x is { n: string; day: string } => !!x);
  const fmt = (d: string) => dayDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  let y = 500;
  c.textAlign = 'left';
  for (const { n, day } of kept) {
    if (y > Hc - 160) break;
    c.font = `30px Newsreader, "Iowan Old Style", Georgia, serif`; c.globalAlpha = 0.6; c.fillText(fmt(day), 210, y);
    c.font = `italic 38px Newsreader, "Iowan Old Style", Georgia, serif`; c.globalAlpha = 1; c.fillText(n.replace(/^[“"]+|[”"]+$/g, ''), 420, y);
    y += 74;
  }
  return out;
}
/**
 * The year's block, for engraving into wood to print from by hand: the print's own ink, but as a laser
 * cutter wants it. Mirrored (a block prints reversed, so it's cut reversed); black where the wood is burned
 * away (the paper between the inked wood), white where it stands to take the ink; hard-edged, no greys; at
 * 600 dpi on a 9 in square (a 10 in block with a margin); and a hairline square round it to cut the block's
 * edge to, if it's cut from a plank.
 */
async function yearBlock(): Promise<HTMLCanvasElement> {
  const ink = await yearPrint(), DPI = 600, S = 9 * DPI, out = document.createElement('canvas'); out.width = out.height = S;
  const c = out.getContext('2d')!;
  // (The slice, from the print: its ink found, cropped round, set in the square, mirrored.)
  const src = ink.getContext('2d')!.getImageData(0, 0, ink.width, ink.height).data;
  let x0 = ink.width, y0 = ink.height, x1 = 0, y1 = 0;
  for (let y = 0; y < ink.height; y += 2) for (let x = 0; x < ink.width; x += 2) if (src[(y * ink.width + x) * 4] < 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const side = Math.max(x1 - x0, y1 - y0) + 20, k = (S - 0.6 * DPI) / Math.max(1, side);
  c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
  c.save(); c.translate(S, 0); c.scale(-1, 1);
  c.imageSmoothingQuality = 'high';
  // (Ink white, so it stands; the rest black, burned away.)
  c.filter = 'invert(1)';
  c.drawImage(ink, x0 - 10, y0 - 10, side, side, (S - side * k) / 2, (S - side * k) / 2, side * k, side * k);
  c.restore();
  const img = c.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] > 127 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  c.putImageData(img, 0, 0);
  c.strokeStyle = '#ff0000'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2);
  return out;
}
/** Hand a canvas over as a PNG file to keep. */
function saveCanvas(cv: HTMLCanvasElement, name: string): Promise<void> {
  return new Promise((done) => cv.toBlob((b) => {
    if (b) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    done();
  }, 'image/png'));
}
document.getElementById('print-year')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!child || looking === 'life') { say('Open a year to print it: this year, or one from every year.', 4); return; }
  say('Pressing the print…', 3);
  const age = typeof looking === 'number' ? years[looking].age : age0, base = `${child.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-the-year-at-${age}`;
  void (async () => {
    await saveCanvas(await yearPrint(), `${base}.png`);
    await new Promise((r) => window.setTimeout(r, 600));
    await saveCanvas(await yearWords(), `${base}-words.png`);
    await new Promise((r) => window.setTimeout(r, 600));
    await saveCanvas(await yearBlock(), `${base}-block.png`);
    say('Saved: the print (ink only, 8 × 10 in), its words (5 × 7 in, for the back), and its block (to engrave into wood, mirrored, 600 dpi).', 8);
  })();
});

/** (The tree being drawn, this year's, wherever one is looking.) */
const thisYear = () => stash ?? { tree, days, notes };

/** A touch inside the slice: the ring under it, lit for a moment, and the day it was drawn. */
let lit = -1, litAt = 0;
function readDay(v: View, x: number, y: number): void {
  const dx = x - v.cx, dy = v.cy - y, a = (((Math.atan2(dy, dx) - v.turn) % TAU) + TAU) % TAU;
  const r = unwarpR(v.warp, Math.hypot(dx, dy) / v.s);
  const i = tree.rings.findIndex((ring) => r <= radiusAt(ring, a));
  if (i < 0 || !days[i]) return;
  const [yy, mm, dd] = days[i].split('-').map(Number), when = new Date(yy, mm - 1, dd);
  if (CHILD && child) {
    if (looking === 'life' && life) {
      // (Every year: touched, that year opens, and how much they grew in it is said.)
      const open = years.findIndex((y) => y.age === i), here = i === age0, grew = life.grew[i];
      const words = `${i === 0 ? `${child.name}’s first year` : `${child.name} at ${i}`}, ${when.getFullYear()}–${String(when.getFullYear() + 1).slice(2)} · grew ${grew.toFixed(grew < 10 ? 1 : 0)} cm`;
      if (open >= 0 || here) { lookAt(here ? 'year' : open); say(words, 4); } else say(`${words} · before the tree was planted`, 4);
    } else {
      const note = notes[i];
      say(`${when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${ageWords(days[i])}${note ? ` · “${note}”` : ''}`, note ? 5 : 3);
    }
  } else say(when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 3);
  lit = i; litAt = clock();
}

/** The paint, laid exactly where the brush is (angle a, u steady widths from the bark). */
function trailAt(a: number, u: number): void {
  if (!strokeView) return;
  const t = clock(), last = trail[trail.length - 1], joined = last && Math.abs(last.a - a) < 0.5;
  const r = radiusAt((i) => tree.inner(i), a) + Math.max(0, GROWN ? u : Math.min(WIDEST, u)) * tree.wRef;
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
    days.push(today);
    if (CHILD) { notes.push(null); ear.stop(); window.setTimeout(() => { if (painter === null) askNote({ kind: 'words', ring: tree.rings.length - 1 }, 'A few words, if you like'); }, 2600); }
    keep();
    if (PUZZLE) {
      run.rings++; showScore();
      if (run.rings >= RINGS) endPuzzle();
    } else if (CHALLENGE) {
      const pts = ringPoints(), touches = run.touches;
      run.score += pts; run.rings++; showScore();
      window.setTimeout(() => say(`+${pts}${touches ? `  (touched the edge: −${TOUCH * touches})` : ''}`, 1.4), 150);
      if (run.rings >= RUN) endRun();
    } else if (first) editionAt = clock() + (GROWN ? SEASON : 1.6);
    // (The ring is done: it settles into the paper and the slice draws back to make room, while the
    // next can be begun as soon as the finger comes down again.)
    painter = null;
    settle = { ring: tree.rings.length - 1, at: clock() };
    if (GROWN) {
      inward = { ring: tree.rings.length - 1, at: clock() };
      // (The print as it was, kept, for the year to grow out from.)
      const was = printCaches.drawing;
      delete printCaches.drawing;
      growing = was && !closer() && was.key.startsWith(`${tree.rings.length - 1}|`) ? { ring: tree.rings.length - 1, at: clock(), was } : null;
    }
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
  // (Growing true to scale, the loop, once closed, stays where it was drawn and dries away, soaking into
  // the sheet, while the year grows on the slice.)
  const going = inward && inward.ring < tree.rings.length ? inward : null;
  const dry = going ? 1 - smooth((t - going.at) / 2.6) : 1;
  // (And as it dries it draws in onto the year it made, never left standing apart from it.)
  const into = going ? smooth((t - going.at) / 1.1) : 0, edge = going ? barkOf(going.ring) : null;
  const pts = trail.map((q) => {
    const [x, y] = at(v, q.a, edge ? q.r + (edge(q.a) - q.r) * into : q.r);
    return { x, y, life: Math.exp(-(t - q.t) / 3.5) * dry, q, nx: 0, ny: 0, hw: 0 };
  });
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

/**
 * Where the brush touched the edge, printed: a split in the wood. It opens at the bark where the touch
 * was, then over some nine seconds creeps in toward the heart and widens, wandering with the grain; and
 * every ring grown after splits too, as a split tree's new wood does, so a run's touches stay with the
 * slice as the cracks through it. (Watercolour: a knot.)
 */
function drawSplits(v: View, t: number): void {
  const n = tree.rings.length, bark = n ? barkOf(n - 1) : null;
  if (!bark) return;
  const T = barkCss(v) * px, main = g.canvas === canvas;
  for (const m of marks) {
    const q = m.at * 0.731 + m.a * 3.7, grow = smooth((t - m.at) / 9), since = Math.max(0, n - m.ring);
    const deep = Math.min(0.8, 0.08 + 0.42 * grow + 0.05 * since + 0.1 * h1(q));
    const wide = Math.min(6 * px, (0.5 + 2.6 * grow + 0.35 * since) * px * (0.7 + 0.6 * h1(q + 1.1)));
    const rIn = m.r * (1 - deep), steps = 30;
    const left: [number, number][] = [], right: [number, number][] = [];
    let a = m.a;
    for (let j = 0; j <= steps; j++) {
      const f = j / steps, rOut = bark(a), rr = rOut + (rIn - rOut) * f, out = j === 0 ? T + 2 * px : 0;
      const R = Math.max(1, v.s * warpR(v.warp, rr) + out), hw = (wide * (1 - f) ** 1.4 + 0.3 * px) * (0.75 + 0.5 * h1(q * 3 + j * 0.71));
      const t0 = a + v.turn, da = hw / R;
      left.push([v.cx + R * Math.cos(t0 + da), v.cy - R * Math.sin(t0 + da)]);
      right.push([v.cx + R * Math.cos(t0 - da * (0.6 + 0.8 * h1(q + j * 1.37))), v.cy - R * Math.sin(t0 - da * (0.6 + 0.8 * h1(q + j * 1.37)))]);
      a += (noise(q * 9 + f * 3) - 0.5) * 0.05 + (h1(q * 5 + j) > 0.86 ? (h1(q * 7 + j) - 0.5) * 0.06 : 0);
    }
    g.save();
    g.beginPath(); g.moveTo(...left[0]);
    for (const p of left) g.lineTo(...p);
    for (let j = right.length - 1; j >= 0; j--) g.lineTo(...right[j]);
    g.closePath(); g.clip();
    // (The bare sheet shows through it.)
    if (main) g.drawImage(groundOf(), 0, 0); else { g.fillStyle = PAPER; g.fillRect(0, 0, g.canvas.width, g.canvas.height); }
    g.restore();
  }
}
/** Where the brush has touched an edge this run, in the watercolour: a small knot in the wood, kept on the slice. */
function drawKnots(v: View, t: number): void {
  if (PRINT) { drawSplits(v, t); return; }
  for (const m of marks) {
    const [mx, my] = at(v, m.a, m.r), k = smooth((t - m.at) / 0.8), tang = -(m.a + v.turn) + Math.PI / 2;
    g.save();
    g.translate(mx, my); g.rotate(tang); g.scale(1, 0.5);
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
  const [lo, k, hi] = SPEC[kind].barkCss;
  // (A young tree's bark is thin, whatever its kind: it thickens over its first months.)
  const young = 0.3 + 0.7 * smooth(tree.rings.length / 60);
  return Math.max(lo, Math.min(hi, k * R)) * young;
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
  if (!(realYears() && n) && !(GROWN && !n)) {
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
    // (Before the first ring: the heart, ringed, to draw round; or, growing from a seed, the seed, drawn
    // apart from the print.)
    if (!GROWN) { g.strokeStyle = ink(0.7); g.lineWidth = 1.2 * px; ringPath(v, barkOf(-1)); g.stroke(); }
    return;
  }
  // The rays in play: the ones begun inside the bark, as many as fit the screen (one about every 9 px
  // round the bark), the same ones from ring to ring.
  const Rb = meanR(n - 1), around = (TAU * scr(Rb)) / px;
  const begun = PRINT_RAYS.filter((r) => r.from < Rb && r.to > meanR(0));
  const rays = begun.slice(0, Math.max(6, Math.min(begun.length, Math.round(around / 4)))).sort((x, y) => x.a - y.a);
  // Oak, once its real wood has come: the years of a red oak, pressed (see printYears).
  const real = realYears();
  if (real) {
    printYears(v, real);
    g.beginPath(); g.arc(v.cx, v.cy, 1.4 * px, 0, TAU); g.fillStyle = ink(0.8); g.fill();
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
    // The broad rays in play: one about every 26 px round the bark.
    const broad = BROAD.filter((r) => r.from < Rb && r.to > meanR(0)).slice(0, Math.max(4, Math.round(around / 26))).sort((x, y) => x.a - y.a);
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
      const R = scr(mr), least = (5 * px) / Math.max(1, R);
      const pool = !ring ? [] : (fine ? [...broad, ...rays].sort((x, y) => x.a - y.a) : broad).filter((r) => r.from < mr && r.to > mr);
      const live: typeof pool = [];
      for (const r of pool) if (!live.length || r.a - live[live.length - 1].a > least) live.push(r);
      if (live.length > 1 && live[0].a + TAU - live[live.length - 1].a < least) live.pop();
      const gapOf = (r: typeof pool[0]) => ((r.k >= 5000 ? 0.65 : 0.9) * px) / Math.max(1, R);
      const rough = 0.28 * px * Z;
      const brick = (a0: number, a1: number, seed: number) => {
        const steps = Math.max(2, Math.ceil(((a1 - a0) * R) / (4 * px * Z)));
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
        g.fillStyle = ink((0.8 + 0.2 * h1(seed * 0.37)) * tone * (conifer ? 0.75 + 0.25 * calm : 1)); g.fill();
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
      if (!fine && ring) {
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
      if (!ring && !conifer) {
        // Diffuse: fine pores scattered evenly through the year, a light stipple across the springwood.
        // (Counted and sized at the unzoomed print's scale: looked into, the same pores, larger.)
        const ew = (scr(bandIn(0)) - scr(inner(0))) / px / Z;
        if (ew >= 2) {
          const count = Math.round((TAU * scr(mr) * ew) / (16 * px * Z));
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
        const lw = (scr(outer(0)) - scr(bandIn(0))) / px;
        // (In the wood's own place and size, so looking closer never adds more or blows them up into
        // rings: a few to a ring, each a small dark fleck in the latewood, a share of its width.)
        if (lw >= 3 && sp.resin) {
          const count = Math.min(40, Math.round(TAU * mr * 0.35));
          g.fillStyle = ink(0.95 * tone);
          for (let q = 0; q < count; q++) {
            const a = h1(i * 5.3 + q * 1.37) * TAU, r0 = scr(bandIn(a)), r1 = scr(outer(a));
            const at = r0 + (r1 - r0) * (0.3 + 0.4 * h1(q * 6.1 + i)), d = (r1 - r0) * (0.12 + 0.08 * h1(q * 3.3 + i));
            if (d < 0.5 * px) continue;
            const t = a + v.turn, x = v.cx + at * Math.cos(t), y = v.cy - at * Math.sin(t);
            g.beginPath(); g.ellipse(x, y, d, d * 0.75, -t, 0, TAU); g.fill();
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
  }
  const bk = SPEC[kind].bark;
  if (bk === 'papery') drawBirchBark(v, pt, scr(Rb));
  else {
  // The bark: a thick, rough band outside the wood, fissured, its inner edge (the living layer) a dark line
  // (in plates: fewer, shallower splits, flatter between; the redwood's thick and stringy; the olive's thin).
  // (The bristlecone's gone where it has died back.)
  const bark = barkOf(n - 1), T = barkCss(v) * px, lumps = bk.lumps, live = (a: number) => (kind === 'bristlecone' ? 0.08 + 0.92 * smooth((alive(a) - 0.25) / 0.6) : 1);
  const torn = (a: number) => { const u = (a / TAU) * lumps, i0 = Math.floor(u), f = u - i0, s2 = bk.plate ? (f < 0.85 ? 0 : (f - 0.85) / 0.15) : f * f * (3 - 2 * f); return ((1 - s2) * h1(i0 % lumps) + s2 * h1((i0 + 1) % lumps)) * live(a); };
  g.beginPath();
  for (let j = 0; j <= K * 3; j++) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a), T * (0.7 + 0.55 * torn(a)) * live(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K * 3; j >= 0; j--) { const a = (j / (K * 3)) * TAU, [x, y] = pt(a, bark(a)); g.lineTo(x, y); }
  g.closePath(); g.fillStyle = ink(0.82); g.fill();
  // (Its fissures: splits from the outside in, never evenly spaced: in runs and gaps, some shallow, some
  // through to the wood, each tapering and a little bent, as bark cracks as it stretches.)
  {
    const mean = (TAU * px * bk.mean) / Math.max(1, scr(Rb));
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    let a = h1(tree.seed * 0.17) * TAU, q = 0;
    const end = a + TAU - mean * 0.5;
    while (a < end && q < 4000) {
      const k = q++, out = T * (0.7 + 0.55 * torn(a)) * live(a), deep = bk.deep[0] + bk.deep[1] * h1(k * 4.4) ** bk.deep[2];
      const w0 = (0.35 + 0.8 * h1(k * 3.1) ** 2) * px * bk.wide, bend = (h1(k * 7.9) - 0.5) * 0.03, R0 = Math.max(1, scr(bark(a)));
      g.beginPath();
      for (let j = 0; j <= 6; j++) { const f = j / 6, [x, y] = pt(a + bend * f * f + (w0 * (1 - f)) / R0, bark(a), out * (1 - deep * f)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
      for (let j = 6; j >= 0; j--) { const f = j / 6, [x, y] = pt(a + bend * f * f - (w0 * (1 - f)) / R0, bark(a), out * (1 - deep * f)); g.lineTo(x, y); }
      g.closePath(); g.fill();
      // (The next: close by in a run, or far off across a smooth stretch.)
      a += mean * (h1(k * 2.3 + 0.7) < 0.7 ? 0.35 + 0.8 * h1(k * 5.7) : 1.6 + 2.2 * h1(k * 6.1));
    }
    g.restore();
  }
  g.strokeStyle = ink(0.95); g.lineWidth = 1 * px; ringPath(v, bark, 0, K * 2); g.stroke();
  }
  // The checks: as a cut slice dries it splits, from the bark in toward the heart, a few cracks opening
  // and running deeper as the years go on (from about the fortieth), each its own way, wandering with the
  // rays and jagged at the edges, widest at the bark. (The practice only: they belong to an old slice.)
  if (GROWN && !CHILD && n >= 40) {
    const bark = barkOf(n - 1), T = barkCss(v) * px, count = Math.min(5, 1 + Math.floor((n - 40) / 70));
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    for (let c = 0; c < count; c++) {
      const q = tree.seed * 0.0031 + c * 7.71, age = n - 40 - c * 70, a0 = h1(q) * TAU;
      const deep = Math.min(0.85, 0.2 + 0.0045 * age + 0.3 * h1(q + 1.3)), steps = 40;
      const wide = Math.min(0.03 * scr(Rb), 9 * px) * (0.5 + 0.7 * h1(q + 2.9)) * Math.min(1, 0.35 + age / 90);
      const left: [number, number][] = [], right: [number, number][] = [];
      let a = a0;
      for (let j = 0; j <= steps; j++) {
        const f = j / steps, rOut = bark(a), rr = rOut * (1 - deep * f);
        // (Out at the bark, it's through the bark too; in toward its tip, a hairline.)
        const out = j === 0 ? T + 2 * px : 0, R = Math.max(1, scr(rr) + out);
        const hw = (wide * (1 - f) ** 1.3 + 0.35 * px) * (0.75 + 0.5 * h1(q * 3 + j * 0.71)), da = hw / R;
        left.push(pt(a + da, rr, out)); right.push(pt(a - da * (0.6 + 0.8 * h1(q + j * 1.37)), rr, out));
        // (It wanders: a long drift, and a jag now and then where it jumps from one ray to the next.)
        a += (noise(q * 9 + f * 3) - 0.5) * 0.035 + (h1(q * 5 + j) > 0.86 ? (h1(q * 7 + j) - 0.5) * 0.05 : 0);
      }
      g.beginPath(); g.moveTo(...left[0]);
      for (const p of left) g.lineTo(...p);
      for (let j = right.length - 1; j >= 0; j--) g.lineTo(...right[j]);
      g.closePath(); g.fill();
    }
    g.restore();
  }
  // The press: a hand-pulled print is never evenly pressed. The ink is a little paler toward one side
  // (where the press bore down less), and in a few broad, soft patches; only the ink is lightened.
  {
    const side = h1(tree.seed * 0.731) * TAU, Rs = scr(Rb) + barkCss(v) * px * 2, ox = Math.cos(side + v.turn), oy = -Math.sin(side + v.turn);
    g.save(); g.globalCompositeOperation = 'source-atop';
    const lin = g.createLinearGradient(v.cx - ox * Rs, v.cy - oy * Rs, v.cx + ox * Rs, v.cy + oy * Rs);
    lin.addColorStop(0, 'rgba(244,239,228,0)'); lin.addColorStop(0.55, 'rgba(244,239,228,0.02)'); lin.addColorStop(1, 'rgba(244,239,228,0.1)');
    g.fillStyle = lin; g.fillRect(v.cx - Rs, v.cy - Rs, 2 * Rs, 2 * Rs);
    for (let q = 0; q < 5; q++) {
      const a = h1(tree.seed + q * 3.3) * TAU, d = Rs * (0.2 + 0.6 * h1(q * 7.1 + tree.seed)), rr = Rs * (0.25 + 0.3 * h1(q * 2.9));
      const x = v.cx + d * Math.cos(a), y = v.cy - d * Math.sin(a), rad = g.createRadialGradient(x, y, 0, x, y, rr);
      rad.addColorStop(0, `rgba(244,239,228,${(0.03 + 0.03 * h1(q * 5.5)).toFixed(3)})`); rad.addColorStop(1, 'rgba(244,239,228,0)');
      g.fillStyle = rad; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    g.restore();
  }
}

/**
 * Oak's years from the real thing: each ring of the slice takes one year of a red oak's cross-section
 * (Hough's, 1888; see wood/CREDITS.md), straightened and turned to ink, stretched to fit the ring from
 * its inner edge to its outer, so its pores open where its year begins, its rays cross it, its latewood
 * prints heavy. Round the ring the wood repeats seamlessly; a run of years shares one scale round, so the
 * rays run on from year to year, and where the slice has doubled in size, a new run begins (as new rays
 * do). Fine rings take a smaller copy of the year, so they never shimmer.
 */
function printYears(v: View, oak: Years): void {
  const n = tree.rings.length, c = g.canvas as HTMLCanvasElement, B = 720, Z = Math.max(1, look.k);
  const scr = (r: number) => v.s * warpR(v.warp, r);
  // The rings' radii on the screen, round the slice (ring -1 the heart).
  const rad = new Float32Array((n + 1) * (B + 1));
  for (let i = -1; i < n; i++) { const r = barkOf(i); for (let b = 0; b <= B; b++) rad[(i + 1) * (B + 1) + b] = scr(r((b / B) * TAU)); }
  // Each ring's year, scale round and where round it starts; its mip level from its width on the screen.
  // (Round the ring, the wood keeps its own proportions: as many texels to the mm as across the run's
  // years, so a pore stays round and a ray fine.)
  // (A child's tree: each day is a year of the oak, as the practice's are, its pores its fine line; a whole
  // year grown before the days were drawn is made of its days just the same (365 of them across it); and
  // across each year of their life, the days after a birthday print lighter, those before the next darker
  // and denser, so each birthday closes a ring. The run of rays is the year's.)
  const spans = CHILD ? yearSpans() : null, share = (i: number) => (spans?.[i].whole ? 1 / 365 : 1);
  const monthStart = spans ? days.map((d, i) => !spans[i]?.whole && i > 0 && !!days[i - 1] && d.slice(0, 7) !== days[i - 1].slice(0, 7)) : [];
  const W0 = oak.levels[0].w, runOf = (i: number) => (spans ? spans[i].y : Math.floor(Math.log2(Math.max(1, meanR(i) / 3))));
  // (On the screen, as the fisheye widens a ring without lengthening it.)
  // (Each run's scale is set by its first year, so a year added never changes the years before it.)
  const runs = new Map<number, { w: number; R: number; k: number }>();
  for (let i = 0; i < n; i++) if (!runs.has(runOf(i))) runs.set(runOf(i), { w: (scr(meanR(i)) - scr(meanR(i - 1))) * share(i), R: scr((meanR(i) + meanR(i - 1)) / 2), k: 1 });
  const reps = new Float32Array(n), off = new Float32Array(n), yr = new Int32Array(n), lvl = new Int32Array(n), runR = new Float32Array(n);
  const widthAt = (i: number) => (scr(meanR(i)) - scr(meanR(i - 1))) * share(i);
  for (let i = 0; i < n; i++) {
    const run = runOf(i), q = runs.get(run)!;
    // (The practice: each year's scale from its own place and the last few years' widths, so the wood's
    // grain changes size smoothly out from the heart, never in a step where the slice has doubled; and only
    // from the years before, so a year added never changes them.)
    let wAvg = 0, k = 0;
    for (let j = Math.max(0, i - 8); j <= i; j++) { wAvg += widthAt(j); k++; }
    const R = spans ? q.R / q.k : scr((meanR(i) + meanR(i - 1)) / 2), perPx = oak.year / Math.max(0.5, spans ? q.w / q.k : wAvg / k);
    reps[i] = Math.max(1, Math.round((TAU * R * perPx) / W0)); runR[i] = R;
    // (Its rays: mostly the last year's, drifting a little; now and then a fresh set, as rays end and begin.)
    const fresh = i === 0 || (spans ? runOf(i - 1) !== run : reps[i] !== reps[i - 1] && h1(i * 1.9) < 0.5) || (!spans && h1(i * 3.71 + tree.seed * 0.013) < 0.3);
    off[i] = fresh ? h1(i * 7.3 + tree.seed * 0.01) * W0 : off[i - 1] + (h1(i * 5.9) - 0.5) * 0.06 * W0;
    yr[i] = ((spans ? i * 3 + run * 5 : i * 3) % oak.n + oak.n) % oak.n;
    const w = (scr(meanR(i)) - scr(meanR(i - 1))) * share(i);
    lvl[i] = Math.max(0, Math.min(oak.levels.length - 1, Math.ceil(Math.log2(oak.year / Math.max(0.5, w)))));
  }
  // (Years too fine to print apart, a day's ring at the grown tree's scale: the wood, so many years to a
  // pixel, would print solid; so it prints at about half its tone, and as many of its years as the screen
  // can part (one every 3 to 5 px, never evenly) print as a line at their edge, as the drawn woods' fine years do.)
  const thin = new Float32Array(n), edge = new Uint8Array(n), gapOf = new Float32Array(n);
  if (!spans) {
    let lastR = scr(meanR(-1));
    for (let i = 0; i < n; i++) {
      thin[i] = 1 - smooth((widthAt(i) / Z - 1.2 * px) / (3 * px));
      const R = scr(meanR(i));
      // (Never a regular comb of lines, which would beat against the screen's pixels in waves: as far apart
      // as a hand would rule them, each its own distance.)
      if (thin[i] > 0 && R - lastR >= (3.2 + 1.4 * h1(i * 1.37 + 0.5)) * px * Z) { edge[i] = 1; gapOf[i] = R - lastR; lastR = R; }
    }
  }
  // (A line is wider than the years it lies among: each ring knows the nearest lines in and out.)
  const edgeIn = new Int32Array(n).fill(-1), edgeOut = new Int32Array(n).fill(-1);
  for (let i = 0, e = -1; i < n; i++) { edgeIn[i] = e; if (edge[i]) e = i; }
  for (let i = n - 1, e = -1; i >= 0; i--) { if (edge[i]) e = i; edgeOut[i] = e; }
  // (The sapwood, paler, fading into the heartwood over some eight years: a year added shifts it by a hair.)
  const tone = (i: number) => (spans ? 1 : 1 - 0.16 * smooth((i - (n - 9)) / 8) * smooth((n - 12) / 8));
  let rmax = 0;
  for (let b = 0; b <= B; b++) rmax = Math.max(rmax, rad[n * (B + 1) + b]);
  const x0 = Math.max(0, Math.floor(v.cx - rmax - 1)), y0 = Math.max(0, Math.floor(v.cy - rmax - 1));
  const w = Math.min(c.width, Math.ceil(v.cx + rmax + 1)) - x0, h = Math.min(c.height, Math.ceil(v.cy + rmax + 1)) - y0;
  if (w <= 0 || h <= 0) return;
  const ctx = c.getContext('2d')!, img = ctx.getImageData(x0, y0, w, h), d = img.data;
  const at = (i: number, b: number, f: number) => { const k = (i + 1) * (B + 1) + b; return rad[k] + (rad[k + 1] - rad[k]) * f; };
  // (Never ruled: the wood wanders a little, here and there, every ring with its neighbours, as grain
  // swells round a knot or a bit of reaction wood: a shift of the rings, a fifth of a year or so, over a
  // few mm, in the wood's own place (so it stays put as the slice is looked into), fading out at the bark.)
  const yearMm = n ? meanR(n - 1) / n : 1, wA = 0.22 * yearMm * v.s, wL = 1 / (Math.max(2.2, 3 * yearMm) * v.s), wL2 = wL * 2.7;
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
      const across = (r - rin) / Math.max(1e-3, rout - rin), year = heart ? (yr[0] + oak.n - 1) % oak.n : yr[i];
      // (Never evenly round: a gentle stretch and squeeze round each ring, its own, so the rays fall
      // unevenly and bend a little from year to year. The heart, soft: a blurred year, no rays meeting.)
      // (Toward the middle, a ring's wood is drawn in ever tighter round: there it takes a softer copy, so
      // it never gathers into a star.)
      const tight = r < runR[i] ? Math.ceil(Math.log2(runR[i] / Math.max(1, r))) : 0;
      const L = oak.levels[Math.min(oak.levels.length - 1, lvl[i] + tight + (heart ? 3 : 0))], rows = L.rows;
      const wob = (0.09 * Math.sin(2 * a + i * 1.7) + 0.06 * Math.sin(3 * a + i * 2.9 + 1) + 0.04 * Math.sin(5 * a + i * 0.6)) * W0;
      const sp = spans && !heart ? spans[i] : null, cyc = sp?.whole ? 365 : 1, inDay = (across * cyc) % 1;
      // (The days of a year of their life all the one year of the oak, each set round by its own amount: told
      // apart by their own fine lines, never by a shift in tone from one to the next, which would shimmer.)
      const day = sp ? (sp.whole ? Math.floor(across * cyc) : i) : 0, yy = sp ? ((sp.y * 5) % oak.n + oak.n) % oak.n : year;
      let ink = sample(L, (((a / TAU) * reps[i] * W0 + off[i] + wob * reps[i] * 0.15 + day * 37.3) * L.w) / W0, yy * rows + inDay * rows, yy * rows, rows) * tone(i);
      if (!heart && thin[i] > 0) {
        // (As dark as the wide years: lines as wide as some three-fifths of the space they stand for.)
        ink *= 1 - 0.5 * thin[i];
        // (Its line on the year's edge, drawn smooth across the pixels, a little heavier or lighter
        // than the next, and its weight wandering with the press.)
        const lineAt = (j: number, dist: number) => {
          if (j < 0 || !edge[j]) return 0;
          const half = 0.3 * gapOf[j] * (0.85 + 0.3 * h1(j * 3.7 + 1.1));
          return Math.max(0, Math.min(1, (half + 0.5 * px - dist) / px)) * thin[j];
        };
        const jo = edgeOut[i], ji = edgeIn[i];
        const cov = Math.max(jo < 0 ? 0 : lineAt(jo, at(jo, b, f) - r), ji < 0 ? 0 : lineAt(ji, r - at(ji, b, f))) * (0.75 + 0.35 * vnoise(dx * 0.11 + i, dy * 0.11));
        if (cov > 0) ink = Math.max(ink, 0.95 * cov);
      }
      if (sp) {
        // (Where in their year: lighter after the birthday, darker and denser toward the next; strongly in
        // their life's tree, where it's what marks a birthday, gently in a year's own, so the year reads.)
        const f = sp.whole ? across : sp.f0 + across * (sp.f1 - sp.f0), strong = sp.whole;
        ink = ink * (strong ? 0.7 + 0.3 * smooth((f - 0.04) / 0.5) : 0.86 + 0.1 * smooth(f / 0.8));
        if (strong) ink += (1 - ink) * 0.55 * smooth((f - 0.72) / 0.26);
        // (A month begun: its first day's springwood opens wide and pale, so a year's tree reads as its
        // twelve months, the days fine within them.)
        else if (monthStart[i] && inDay < 0.42) ink *= 0.22 + 0.78 * smooth((inDay - 0.28) / 0.14);
      }
      const k = (y * w + x) * 4;
      d[k] = INK[0]; d[k + 1] = INK[1]; d[k + 2] = INK[2]; d[k + 3] = Math.round(255 * Math.min(1, ink));
    }
  }
  ctx.putImageData(img, x0, y0);
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
 * The real oak's years, pressed from a scan (see printYears): the child's tree only. The practice draws
 * oak and ash in heavy ink as every other wood is, their pores and all, so the nine print as one set.
 */
const realYears = () => (CHILD && fam() === 'ring' ? wood.years[kind] : undefined);

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
  // (The grain and the starved streaks belong to the wood, set at the unzoomed print's scale: looked into,
  // they grow with it and stay where they were, never a fresh scatter.)
  const Z = Math.max(1, look.k), fine = 1 / (0.8 * px * Z), along = 1 / (12 * px * Z), speck = 1 / (0.8 * px * Z), streak = 1 / (5 * px * Z);
  // (Oak's real wood carries its own grain: only its bark takes this. Pine's grain is its real fibre.)
  let inside = 0;
  if (realYears() && last) { inside = Infinity; for (let i = 0; i < K; i += 4) inside = Math.min(inside, v.s * warpR(v.warp, last[i]) - 1); }
  const fib = fam() !== 'ring' ? wood.fibre[kind] : undefined, perMm = 20 / v.s;
  // The press: the paper's tooth (some 0.12 mm, never finer than a pixel), the pressure wandering
  // across the block, and the saw's marks, faint arcs from a far-off blade (seen only looking close).
  const tooth = 1 / Math.max((0.9 * px * Z) / v.s, 0.12), low = 1 / 45, SAW = 1.8;
  // (How the ink took, from a real print: Munch's, 1898, about a quarter mm to a texel, never finer than a
  // pixel; his sea's mottle and sparse specks, his field's grain and streaks over it, the two at their own
  // scales and turned to each other, so neither repeats in step.)
  const sea = wood.sea, field = wood.field, perTex = 1 / Math.max((px * Z) / v.s, 0.24), close = Math.max(0, Math.min(1, (0.24 / ((px * Z) / v.s) - 1) / 2));
  const fc = Math.cos(0.5 + h1(tree.seed * 0.29)), fs = Math.sin(0.5 + h1(tree.seed * 0.29));
  const sawK = 0.07 * Math.max(0, Math.min(1, (SAW * v.s - 3 * px) / (4 * px))), sa = h1(tree.seed * 0.61) * TAU;
  const sx = 900 * Math.cos(sa), sy = 900 * Math.sin(sa);
  for (let y = 0; y < h; y++) {
    const dy = y + y0 - v.cy;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, a = d[k + 3];
      if (a < 8 || d[k] + d[k + 1] + d[k + 2] > 380) continue;
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
        took = val * (0.35 + 0.7 * tile(sea, u + 17, w + 31) * (0.55 + 0.45 * tile(field, (u * fc - w * fs) * 0.8, (u * fs + w * fc) * 0.8)));
        // (Looked at closer than the print's own grain: finer grain, at the screen's scale, so it stays crisp.)
        if (close > 0) took *= 1 + close * 0.22 * (vnoise((dx / Z) * 0.9 + 3.3, (dy / Z) * 0.9 + 7.1) - 0.5);
      }
      const thr = 0.5 + (sea ? 0.35 : 0.95) * (t1 - 0.5) + 0.2 * (vnoise(mx * low + 40, my * low + 11) - 0.5) + saw;
      const e = Math.max(0, Math.min(1, (took - thr + 0.07) / 0.14));
      d[k + 3] = Math.round(255 * e * e * (3 - 2 * e));
    }
  }
  ctx.putImageData(img, x0, y0);
}

/** The print, kept as a picture between changes; while the slice moves, the picture moves with it. */
const printCaches: Record<string, { c: HTMLCanvasElement; key: string; v: View; at: number }> = {};
/** Whether a kept picture, drawn for view `v`, still covers the whole screen. */
/**
 * A kept print's picture covers more than the sheet (`MARGIN` of it each way, so a pinch back out needs no
 * new one), at a resolution fixed for the phone (`QUALITY`: two device pixels a CSS px at most, which the
 * eye can't tell from three, and the same everywhere, never a blown-up copy). Where it lies for view `v`.
 */
const MARGIN = 1.5;
const QUALITY = () => Math.min(1, 2 / Math.max(1, px));
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
function printFor(v: View, moving: boolean, slot = 'drawing', drift = false): Kept {
  const key = `${tree.rings.length}|${v.warp?.R ?? 0}|${v.warp?.beta ?? 0}|${W}x${H}`;
  let pc = printCaches[slot];
  const same = pc && pc.key === key;
  const exact = same && pc.v.s === v.s && pc.v.cx === v.cx && pc.v.cy === v.cy;
  // (Moving, the picture is moved and scaled; it's pressed again only when the fingers have gone past its
  // margin, or looked in half again closer; still, at once, at the view as it is.)
  const off = same ? Math.abs(Math.log(v.s / pc.v.s)) + Math.hypot(v.cx - pc.v.cx, v.cy - pc.v.cy) / W : 0;
  const still = fingers.size === 0 && !lookBack;
  const quick = same && clock() - pc.at > 0.03 && (!covers(pc, v) || (moving && v.s / pc.v.s > 1.5));
  const far = same && ((still && !exact && off > 0.002) || (drift && !moving && off > 0.004 && clock() - pc.at > 0.8));
  if (!same || (!moving && !drift && !exact) || far || quick) {
    const Q = QUALITY(), cw = Math.ceil(W * MARGIN * Q), ch = Math.ceil(H * MARGIN * Q);
    // (One picture a slot, its memory kept and drawn over: the phone's browser allows only so much, and a
    // picture made anew each time soon runs past it, after which nothing more is drawn.)
    let c = pc?.c;
    if (!c || c.width !== cw || c.height !== ch) { if (c) { c.width = 0; c.height = 0; } c = document.createElement('canvas'); c.width = cw; c.height = ch; }
    const was = { g, px, W, H }, mx = (W * (MARGIN - 1)) / 2, my = (H * (MARGIN - 1)) / 2;
    const vs: View = { ...v, cx: (v.cx + mx) * Q, cy: (v.cy + my) * Q, s: v.s * Q, px: v.px * Q };
    g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
    px *= Q; W = cw; H = ch;
    try { drawPrint(vs); inkGrain(c, vs); } finally { g = was.g; px = was.px; W = was.W; H = was.H; }
    pc = printCaches[slot] = { c, key, v: { ...v }, at: clock() };
  }
  return pc;
}
/** A kept print drawn for view `v` (moved and scaled to it), `grow` times larger about the slice's heart. */
function drawKept(pc: { c: HTMLCanvasElement; v: View }, v: View, alpha = 1, grow = 1): void {
  const [ox, oy, w, h] = placeOf(pc, v, grow);
  g.globalAlpha = alpha;
  g.drawImage(pc.c, ox, oy, w, h);
  g.globalAlpha = 1;
}
/**
 * The year growing: the print as it was; and beyond the old bark, the print as it is now, drawn a little
 * smaller about the heart so its new bark starts where the old one was and moves out to its own place as
 * the season goes on, the new wood filling in behind it.
 */
function drawGrowing(v: View, t: number, moving: boolean, drift: boolean): void {
  const gr = growing!, n = tree.rings.length, now = printFor(v, moving, 'drawing', drift), old = barkOf(n - 2), neu = barkOf(n - 1);
  let k0 = 1;
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; k0 = Math.min(k0, old(a) / Math.max(1e-6, neu(a))); }
  const f = season((t - gr.at) / SEASON);
  drawKept(gr.was, v);
  g.save();
  g.beginPath(); g.rect(0, 0, W, H);
  for (let j = 0; j <= K; j++) { const a = (j / K) * TAU, [x, y] = at(v, a, old(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.clip('evenodd');
  // (Beyond the old wood, the old bark gives way to the new: the bare sheet there, then the print as it is
  // now over it, its bark at first where the old one was.)
  g.drawImage(groundOf(), 0, 0);
  drawKept(now, v, 1, k0 + (1 - k0) * f);
  g.restore();
}
function drawPrintCached(v: View, moving: boolean, slot = 'drawing', alpha = 1, drift = false, grow = 1): void {
  const pc = printFor(v, moving, slot, drift);
  drawKept(pc, v, alpha, grow);
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
  if (GAME || !tree.rings.length) return;
  const away = fingers.size > 0 || !!tree.stroke;
  editionShown = away ? Math.max(0, editionShown - dt / 0.3) : Math.min(1, editionShown + dt / 1.2);
  if (editionShown <= 0.01) return;
  const last = tree.rings[tree.rings.length - 1];
  let rmax = 0;
  for (let i = 0; i < K; i++) rmax = Math.max(rmax, v.s * warpR(v.warp, last[i]));
  // (Never narrower than its words need, however small the slice; and kept on the sheet.)
  const y = v.cy + rmax + (barkCss(v) + 30) * px, half = Math.min(Math.max(rmax, (CHILD ? 150 : 112) * px), W / 2 - 24 * px);
  editionY = y;
  v = { ...v, cx: Math.max(half + 30 * px, Math.min(W - half - 30 * px, v.cx)) };
  const [yy, mm, dd] = (days[days.length - 1] ?? dayOf()).split('-').map(Number);
  const date = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  // (Written in, left to right, once a new day's ring has bloomed.)
  const w = t < editionAt ? 0 : smooth((t - editionAt) / 1.1);
  g.save();
  g.beginPath(); g.rect(v.cx - half - 40 * px, y - 30 * px, (2 * half + 80 * px) * (editionAt ? w : 1), 60 * px); g.clip();
  g.globalAlpha = editionShown;
  // Graphite: a soft grey, its grain the paper's own (laid over it after).
  g.fillStyle = 'rgba(92,88,84,0.78)'; g.font = `italic ${13 * px}px Newsreader, "Iowan Old Style", Georgia, serif`; g.textBaseline = 'middle';
  const [left, mid] = editionWords(date);
  const right = CHILD && child ? child.name : kind;
  // (The date in the middle, or nudged left of a long name, as a hand would leave it room.)
  const midW = g.measureText(mid).width, room = v.cx + half - 22 * px - g.measureText(right).width - 12 * px;
  const midX = Math.max(v.cx - half + g.measureText(left).width + 12 * px + midW / 2, Math.min(v.cx, room - midW / 2));
  g.textAlign = 'left'; g.fillText(left, v.cx - half, y);
  if (printing || CHILD) { g.textAlign = 'center'; g.fillText(mid, midX, y); }
  g.textAlign = 'right'; g.fillText(right, v.cx + half - 22 * px, y);
  // The blind stamp: three rings and a heart, pressed in (a highlight above, a shadow below, no ink).
  const sx = v.cx + half - 6 * px, sy = y;
  stampAt = [sx, sy];
  for (const [dx, dy, col] of [[-0.7, -0.7, 'rgba(255,253,246,0.95)'], [0.7, 0.7, 'rgba(96,74,52,0.28)']] as [number, number, string][]) {
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 0.9 * px;
    for (const r of [7, 4.6, 2.4]) { g.beginPath(); g.arc(sx + dx * px, sy + dy * px, r * px, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(sx + dx * px, sy + dy * px, 0.9 * px, 0, TAU); g.fill();
  }
  g.restore();
}

/** What the edition says, left and middle (the right is the tree's name, or the child's). */
let printing = false;
function editionWords(date: string): [string, string] {
  if (!CHILD || !child) return [String(tree.rings.length), date];
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), b = dayDate(child.birth);
  if (looking === 'life') return [ageWords(dayOf()), `born ${fmt(b)}`];
  const age = typeof looking === 'number' ? years[looking].age : age0;
  const from = new Date(b.getFullYear() + age, b.getMonth(), b.getDate()), to = new Date(b.getFullYear() + age + 1, b.getMonth(), b.getDate() - 1);
  // (On the sheet, this year's day; a finished year, and the print, its dates.)
  return typeof looking === 'number' || printing ? [`the year at ${age}`, `${fmt(from)} – ${fmt(to)}`] : [ageWords(days[days.length - 1] ?? dayOf()), date];
}

/** Where the pencilled line is, and its maker's mark (device px); and whether this touch began on the mark. */
let editionY = -1e9, stampAt: [number, number] = [-1e9, -1e9], onStamp = false;
/**
 * A new tree: straight to the seeds, nothing asked. The tree drawn so far waits, kept as it was, until a
 * seed is touched (then it stands in the grove); drawn back to the grove instead, it's as it was.
 */
let parting: { k: KeptTree; tree: TreeSim; days: string[]; kind: Kind; seedAt: [number, number] | null } | null = null;
function plantAgain(): void {
  if (painter !== null) { tree.cancel(); trail = []; painter = null; }
  if (visit) unvisit();
  fingers.clear();
  if (parting) return;
  parting = { k: kept(), tree, days, kind, seedAt };
  tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = []; seedAt = null; folding = null;
  lookAfresh(); groveCam = null; farTo = { from: far, to: 0, at: clock() };
}
function unpart(): void {
  if (!parting) return;
  ({ tree, days, kind, seedAt } = parting); parting = null;
  lookAfresh();
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
let visit: { i: number; stash: { tree: TreeSim; days: string[]; kind: Kind } } | null = null;
const canPull = () => GROWN && !CHILD && (tree.rings.length > 0 || (!!seedAt && groveKept.length > 0));
const settleFar = () => { farTo = { from: far, to: far > 0.45 ? 1 : 0, at: clock() }; };
interface Stand { sp: Kind; n: number; i: number; k: number; wx: number; wy: number; wr: number; x: number; y: number; r: number }
/** The season washed into the grove: today's (`?season=winter` and so on, to look). */
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const seasonNow = (): Season => SEASONS.find((x) => x === params.get('season')) ?? seasonOf();
/** A view of the land: world (x, y) shows at (X0 + x·S, Y0 + y·S) on the sheet. */
interface Cam { S: number; X0: number; Y0: number }
/** Looked about in the grove: closer than the whole, and moved (null: the whole of it in view). */
let groveCam: Cam | null = null;
const GROVE_CLOSEST = 8;
/** The land, every tree on it (world units), and the view of the whole of it, kept until a tree changes. */
let worldKey = '', world: { hills: Hill[]; seed: number; trees: Omit<Stand, 'x' | 'y' | 'r'>[]; next: { wx: number; wy: number }; whole: Cam; box: [number, number, number, number] } | null = null;
function worldOf() {
  const mine = visit ? visit.stash : { tree, days, kind };
  const all = [
    ...groveKept.map((k, i) => ({ sp: asKind(k.tree) ?? 'oak', n: ((k.sim.rings as unknown[] | undefined) ?? []).length, i, k: (k.seed % 9973) + 11 })),
    { sp: mine.kind, n: mine.tree.rings.length, i: -1, k: (mine.tree.seed % 9973) + 11 },
  ];
  const seed = groveKept[0]?.seed ?? mine.tree.seed, key = `${W}x${H}:${seed}:${all.map((t) => `${t.sp}${t.n}`).join(',')}`;
  if (world && worldKey === key) return world;
  const L = land(all.length, seed);
  const trees = all.map((a, j) => ({ ...a, wx: L.places[j].x, wy: L.places[j].y, wr: 1.4 * L.places[j].scale * crownSize(a.sp, a.n) }));
  // (And where the next will stand, when it's planted.)
  const nx = land(all.length + 1, seed).places[all.length], next = { wx: nx.x, wy: nx.y };
  // (The whole of it in view, the trees and a little ground round them; never so close a crown fills the sheet.)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of [...trees, { ...next, wr: 0 }]) { x0 = Math.min(x0, t.wx - 1.6); x1 = Math.max(x1, t.wx + 1.6); y0 = Math.min(y0, t.wy - 1.6); y1 = Math.max(y1, t.wy + 1.6); }
  const S = Math.min((W * 0.86) / (x1 - x0), (H * 0.5) / (y1 - y0), W * 0.12);
  const whole = { S, X0: W / 2 - ((x0 + x1) / 2) * S, Y0: H * 0.46 - ((y0 + y1) / 2) * S };
  worldKey = key; world = { hills: L.hills, seed, trees, next, whole, box: [x0, y0, x1, y1] };
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
  if (groveCam) panGrove(0, 0);
  groveMoved = clock();
}
/** Moved about in the grove, never so far its trees leave the sheet. */
function panGrove(dx: number, dy: number): void {
  if (!groveCam) return;
  const [x0, y0, x1, y1] = worldOf().box, c = groveCam;
  c.X0 = Math.min(W * 0.8 - x0 * c.S, Math.max(W * 0.2 - x1 * c.S, c.X0 + dx));
  c.Y0 = Math.min(H * 0.8 - y0 * c.S, Math.max(H * 0.2 - y1 * c.S, c.Y0 + dy));
  groveMoved = clock();
}
let groveMoved = 0;
/** Said once, the first time in the grove: how a new tree is begun. */
let groveTold = false;
try { groveTold = !!localStorage.getItem('annulus.grove1'); } catch { /* not known */ }
function tellGrove(): void {
  if (groveTold) return;
  groveTold = true;
  try { localStorage.setItem('annulus.grove1', '1'); } catch { /* said again next time, then */ }
  say('Touch the empty circle to plant a new tree.', 6);
}
/** The land and its trees, drawn for a view: inked and coloured (slow: drawn when the view is still). */
function renderGrove(c: CanvasRenderingContext2D, cam: Cam): void {
  const w = worldOf(), season = seasonNow();
  c.clearRect(0, 0, W, H);
  const height = (x: number, y: number) => heightAt((x - cam.X0) / cam.S, (y - cam.Y0) / cam.S, w.hills, w.seed);
  washHill(c, W, H, px, height, w.seed, season, cam.S);
  drawHill(c, W, H, px, height, w.seed);
  // The ground for the next tree: a faint pencil ring, to be touched when one is wanted.
  {
    const x = cam.X0 + w.next.wx * cam.S, y = cam.Y0 + w.next.wy * cam.S, r = Math.max(7 * px, 0.45 * cam.S);
    c.save(); c.strokeStyle = 'rgba(92,88,84,0.5)'; c.lineWidth = 0.8 * px; c.setLineDash([2.5 * px, 2.5 * px]);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.restore();
  }
  for (const t of [...groveLayout(cam).trees].sort((p, q) => p.y - q.y)) {
    if (t.x < -t.r * 2 || t.x > W + t.r * 2 || t.y < -t.r * 2 || t.y > H + t.r * 2) continue;
    // (A tree of a day or more is a crown, however small; only a seed just planted is a seedling.)
    if (t.n < 1) { drawSeedling(c, t.x, t.y, Math.min(6 * px, Math.max(3 * px, t.r * 0.8)), px); continue; }
    drawCrown(c, t.x, t.y, t.r, t.sp, t.k, px);
    // (Coloured over the ink, by hand: today's still wet.)
    washCrown(c, t.x, t.y, t.r, t.sp, t.k, px, season, t.i < 0);
  }
}
/** The grove drawn for the whole view (kept, to lay under any other while it moves), and for the view now. */
const seasonKey = () => `${worldKey}:${seasonNow()}`;
let baseG: { c: HTMLCanvasElement; cam: Cam; key: string } | null = null, sharpG: { c: HTMLCanvasElement; cam: Cam; key: string } | null = null;
function layGrove(cam: Cam, still: boolean): void {
  const w = worldOf(), key = seasonKey();
  if (!baseG || baseG.key !== key) {
    baseG ??= { c: document.createElement('canvas'), cam: w.whole, key };
    baseG.c.width = W; baseG.c.height = H; baseG.cam = w.whole; baseG.key = key;
    renderGrove(baseG.c.getContext('2d')!, w.whole);
  }
  const same = (a: Cam, b: Cam) => Math.abs(a.S - b.S) < 1e-3 * b.S && Math.abs(a.X0 - b.X0) < 0.5 && Math.abs(a.Y0 - b.Y0) < 0.5;
  const lay = (from: { c: HTMLCanvasElement; cam: Cam }) => { const q = cam.S / from.cam.S; g.drawImage(from.c, cam.X0 - from.cam.X0 * q, cam.Y0 - from.cam.Y0 * q, W * q, H * q); };
  if (same(cam, w.whole)) { g.drawImage(baseG.c, 0, 0); return; }
  if (still && (!sharpG || sharpG.key !== key || !same(sharpG.cam, cam))) {
    sharpG ??= { c: document.createElement('canvas'), cam, key };
    sharpG.c.width = W; sharpG.c.height = H; sharpG.cam = { ...cam }; sharpG.key = key;
    renderGrove(sharpG.c.getContext('2d')!, cam);
  }
  // (Still, the view drawn for itself; moving, the whole laid under, and the last drawn over it.)
  if (sharpG && sharpG.key === key && same(sharpG.cam, cam)) { lay(sharpG); return; }
  lay(baseG);
  if (sharpG && sharpG.key === key) lay(sharpG);
}
let snapC: HTMLCanvasElement | null = null;
function drawFar(v: View): void {
  // The slice as it is on the sheet, taken up whole.
  const c = g.canvas as HTMLCanvasElement;
  snapC ??= document.createElement('canvas');
  if (snapC.width !== c.width || snapC.height !== c.height) { snapC.width = c.width; snapC.height = c.height; }
  const sc = snapC.getContext('2d')!;
  sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, snapC.width, snapC.height); sc.drawImage(c, 0, 0);
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
    g.save(); g.globalAlpha = rest; layGrove(cam, still); g.restore();
  }
  // Its own crown, drawn afresh at its size (sharp, however close), coming in round the slice.
  const own = smooth(far / 0.22) * (1 - rest), fx = X, fy = Y;
  if (own > 0.01) {
    if (f.n >= 1) {
      drawCrown(g, fx, fy, fr * k, f.sp, f.k, px * Math.min(k, 2.2), own);
      // (The colour comes with the years: only as the view rises off the day.)
      const tint = smooth((far - 0.55) / 0.35);
      if (tint > 0.01) { g.save(); g.globalAlpha = tint * own; { const r0 = Math.min(fr * k, 0.5 * W), u0 = px * Math.min(k, 2.2) * (r0 / (fr * k)); washCrown(g, fx, fy, r0, f.sp, f.k, u0, seasonNow(), f.i < 0, (fr * k) / r0); } g.restore(); }
    } else drawSeedling(g, fx, fy, Math.min(8 * px, Math.max(4 * px, fr * 0.8) * k), px, own);
  }
  drawCopyWords(smooth((far - 0.9) / 0.1)); placeBackInput(far >= 0.99 && !farTo);
  // The slice, settling to the cut face at its heart, and gone as the crown closes over.
  const fade = 1 - smooth((far - 0.35) / 0.25);
  if (fade > 0.01) {
    const toR = 0.3 * fr * k, sR = Rs + (toR - Rs) * smooth(far / 0.3), sk = sR / Rs;
    g.save(); g.globalAlpha = fade;
    g.beginPath(); g.arc(fx, fy, sR * 1.08, 0, TAU); g.fillStyle = 'rgb(244,239,228)'; g.fill(); g.clip();
    g.translate(fx, fy); g.scale(sk, sk); g.drawImage(snapC, -v.cx, -v.cy);
    g.restore();
  }
}
/**
 * A copy of everything (the grove, and today's tree), kept as a file somewhere safe; and one taken back.
 * Pencilled small at the foot of the grove.
 */
const copyAt = () => ({ keep: [W / 2 - 52 * px, H - 44 * px] as [number, number], back: [W / 2 + 52 * px, H - 44 * px] as [number, number] });
function drawCopyWords(al: number): void {
  if (al <= 0.01 || visit) return;
  const c = copyAt();
  g.save(); g.globalAlpha = al * 0.7; g.fillStyle = 'rgba(92,88,84,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic ${13 * px}px Newsreader, "Iowan Old Style", Georgia, serif`;
  g.fillText('keep a copy', ...c.keep); g.fillText('take one back', ...c.back);
  g.restore();
}
async function keepGroveCopy(): Promise<void> {
  const all = { wellRounded: 1, diary: kept(), grove: groveKept };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toText(all)], { type: 'application/json' })); a.download = `well-rounded-${dayOf()}.json`;
  document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { localStorage.setItem('annulus.copied', String(groveKept.length * 1000 + tree.rings.length)); } catch { /* not noted */ }
  say('A copy is kept, as a file. Keep it somewhere safe.', 4);
}
/**
 * (A file can only be asked for from a real touch on a real file button: one lies, unseen, over the
 * pencilled words, there only while the grove is.)
 */
const backInput = (() => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
  Object.assign(i.style, { position: 'fixed', opacity: '0', width: '120px', height: '36px', transform: 'translate(-50%, -50%)', display: 'none', zIndex: '5', cursor: 'pointer' });
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
    await setGrove(all.grove); await keepTree(all.diary, DIARY);
    location.reload();
  } catch { say('That file isn’t a copy of a grove.', 4); }
}
/** Touched in the grove: an older tree opens to its slice; today's comes home. */
function tapGrove(x: number, y: number): void {
  { const c = copyAt(); if (!visit && y > c.keep[1] - 18 * px && y < c.keep[1] + 18 * px) { if (Math.abs(x - c.keep[0]) < 50 * px) { void keepGroveCopy(); return; } if (Math.abs(x - c.back[0]) < 56 * px) return; } }
  const L = groveLayout(), w = worldOf();
  // (The next tree's ground: a new tree, if they say so.)
  if (!visit && Math.hypot(x - (L.cam.X0 + w.next.wx * L.cam.S), y - (L.cam.Y0 + w.next.wy * L.cam.S)) < Math.max(22 * px, 0.6 * L.cam.S)) { plantAgain(); return; }
  let hit: Stand | null = null, best = Infinity;
  for (const t of L.trees) { const d = Math.hypot(x - t.x, y - t.y) / Math.max(t.r * 1.15, 20 * px); if (d < 1 && d < best) { best = d; hit = t; } }
  if (!hit) return;
  if (hit.i < 0) { groveCam = null; farTo = { from: far, to: 0, at: clock() }; return; }
  const k = groveKept[hit.i], t2 = treeFrom(k, DAILY);
  if (!t2) return;
  if (!visit) visit = { i: hit.i, stash: { tree, days, kind } };
  else visit.i = hit.i;
  tree = t2; days = (k.days ?? []).slice(0, t2.rings.length); kind = asKind(k.tree) ?? 'oak';
  lookAfresh(); openedAt = clock(); idleSince = openedAt + OPEN;
  farTo = { from: far, to: 0, at: clock() };
  say(`${kind} · ${tree.rings.length} days · ${days[0]?.slice(0, 4) ?? ''}`, 4);
}
/** Back from an older tree to today's. */
function unvisit(): void {
  if (!visit) return;
  ({ tree, days, kind } = visit.stash); visit = null;
  lookAfresh();
}
function lookAfresh(): void {
  warp = warpNow(); view = null; ease = null; lookBack = null; look = { k: 1, ox: 0, oy: 0 }; growing = null; trail = []; inward = null;
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
const INTRO = GROWN && !CHILD && (params.has('intro') || (!navigator.webdriver && !matchMedia('(prefers-reduced-motion: reduce)').matches));
const INTRO_GROW = 2.6, INTRO_HOLD = 0.4, INTRO_FADE = 0.8;
/**
 * The tree pressed whole, once, before it's shown (heavy ink, as the slices print: each year's latewood a
 * solid band at its outer edge, rough-edged; then the press, the ink broken along the grain and by the
 * paper's tooth, starved here and there); then shown ring by ring out from the heart.
 */
let intro: { at: number; c: HTMLCanvasElement; rings: Float32Array[]; skip: number } | null = null;
function startIntro(): void {
  if (!INTRO) return;
  // (A tree of the wood today's is, grown out of sight in a moment, a couple of months of days: then
  // printed as the slice itself is, the same press, so the opening is the practice's own ink.)
  const was = { tree, days, kind, look, g, px, W, H }, sp: Kind = KINDS.includes(kind) ? kind : 'oak';
  let rings: Float32Array[] = [], c: HTMLCanvasElement;
  const cx = W / 2, cy = Math.round(H * 0.47), far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.04, N = 240;
  try {
    kind = sp; look = { k: 1, ox: 0, oy: 0 }; tree = new TreeSim(1 + Math.floor(Math.random() * 1e6), DAILY); days = [];
    demoYear(56);
    const n = tree.rings.length;
    if (!n) return;
    // (The bark just past the sheet's farthest corner: the rings fill it.)
    let least = Infinity;
    for (let j = 0; j < N; j++) least = Math.min(least, barkOf(n - 1)((j / N) * TAU));
    const s = far / least;
    for (let i = -1; i < n; i++) {
      const ring = new Float32Array(N + 1), r = barkOf(i);
      for (let j = 0; j <= N; j++) ring[j] = s * r((j / N) * TAU);
      rings.push(ring);
    }
    // (Pressed at some 1.25 to a CSS px (half the screen's pixels at most), so it's quick on a phone.)
    const S = Math.min(0.5, 1.25 / was.px);
    c = document.createElement('canvas'); c.width = Math.ceil(W * S); c.height = Math.ceil(H * S);
    g = c.getContext('2d')!; px = was.px * S; W = c.width; H = c.height;
    const v: View = { cx: cx * S, cy: cy * S, s: s * S, turn: 0, px, warp: undefined };
    drawPrint(v); inkGrain(c, v);
  } finally { ({ tree, days, kind, look, g, px, W, H } = was); }
  words.style.visibility = 'hidden';
  intro = { at: clock(), c, rings, skip: 0 };
}
function drawIntro(t: number): void {
  if (!intro) return;
  const it = intro, n = it.rings.length, e = (t - it.at) / INTRO_GROW;
  // (Quickly at first, the last few slower as the sheet fills: eased out. Shown out to the ring reached,
  // and a little of the next coming.)
  const reach = (n - 1) * (1 - (1 - Math.min(1, e)) ** 2.2), i = Math.floor(reach), f = reach - i;
  const end = it.skip || it.at + INTRO_GROW + INTRO_HOLD, fade = it.skip ? 0.35 : INTRO_FADE;
  const al = 1 - smooth((t - end) / fade);
  if (al <= 0) { intro = null; openedAt = clock(); idleSince = openedAt + OPEN; words.style.visibility = ''; return; }
  const cx = W / 2, cy = Math.round(H * 0.47), a0 = it.rings[Math.min(n - 1, i)], a1 = it.rings[Math.min(n - 1, i + 1)], N = a0.length - 1;
  g.save(); g.globalAlpha = al;
  g.drawImage(groundOf(), 0, 0);
  g.beginPath();
  for (let j = 0; j <= N; j++) { const a = (j / N) * TAU, r = a0[j] + (a1[j] - a0[j]) * f; const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.clip();
  g.drawImage(it.c, 0, 0, W, H);
  g.restore();
}

/** When the page opened: the slice paints itself in from the heart. */
let openedAt = 0;
// (`?slow=5` plays the opening and the bloom five times slower, to look at them.)
const SLOW = Number(params.get('slow')) || 1, OPEN = 1.8 * SLOW, BLOOM = 1.1 * SLOW;

function frame(): void {
  const t = clock(), dt = 1 / 60;
  // (The wood's own way with the hand's line.)
  if (GROWN) { const sm = SMOOTH[kind] ?? DAILY.smooth; if (tree.k.smooth !== sm) (tree.k as { smooth: number }).smooth = sm; }
  if (farTo) {
    const p = smooth((t - farTo.at) / 1.1);
    far = farTo.from + (farTo.to - farTo.from) * p; farPull = far;
    if (p >= 1) { const to = farTo.to; farTo = null; if (to === 1 && visit) unvisit(); if (to === 1) tellGrove(); }
  }
  const v = viewNow(t);
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
  const busy = fingers.size > 0 || !!tree.stroke || !!ease || settle.ring >= 0 || (GAME && !run.over);
  if (busy) idleSince = t;
  const restWanted = PRINT && !busy && t - idleSince > 1.4 && !!v.warp && v.warp.beta > 0;
  relax = restWanted ? Math.min(1, relax + dt / 0.9) : Math.max(0, relax - dt / 0.22);
  const moving = (!!ease && !GROWN) || !!lookBack || fingers.size >= 2, drift = !!ease && GROWN;
  if (PRINT && growing && (growing.ring !== tree.rings.length - 1 || t - growing.at > SEASON || closer())) growing = null;
  // (A finger the phone never said was lifted (a pinch's, now and then): let go after a still second and a half.)
  if (fingers.size && t - lastFingerAt > 1.5 && painter === null) { fingers.clear(); pinch = null; }
  breathe(t, dt);
  if (PRINT && growing) drawGrowing(v, t, moving, drift);
  else if (PRINT) {
    const rk = smooth(relax);
    if (rk < 1) drawPrintCached(v, moving, 'drawing', 1 - rk, drift, breathGrow());
    if (rk > 0) drawPrintCached(restOf(v), moving, 'rest', rk);
  } else { paper.draw(g, v); drawLatewood(v); }
  const n = tree.rings.length;
  // A ring touched: lit softly along its edge for a moment, as its day is read.
  const glow = lit >= 0 && lit < n ? 1 - smooth((t - litAt - 2) / 1.2) : 0;
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
  if (GROWN && !n && seedAt) drawSeed(v, t);
  if (GROWN && !CHILD && !n && !seedAt) drawSeedChoice(v, t);
  drawBreath(shownOf(v), t, dt);
  drawTarget(v);
  drawBrush(g, v, t);
  drawKnots(shownOf(v), t);
  if (far > 0) drawFar(v);
  else { placeBackInput(false); drawEdition(shownOf(v), t, dt); }
  drawPaper(g, W, H);
  drawIntro(t);
  requestAnimationFrame(frame);
}

void (async () => {
  await recall();
  if (GROWN && !CHILD) {
    void navigator.storage?.persist?.().catch(() => false);
    groveKept = params.has('grove') ? demoGrove(Math.max(1, Number(params.get('grove')) || 5)) : await grove();
  }
  warp = warpNow(); paper.fit(warp, warp.R); paper.bake(tree);
  fit(); view = null; openedAt = clock(); idleSince = openedAt + OPEN;
  const today = dayOf();
  showScore();
  if (PUZZLE) say(`Grow your tree to fill the outline: ${target.shape.name}, in ${RINGS} rings. Draw each ring wider where it needs to reach.`, 9);
  else if (CHALLENGE) say('Draw around the circle. Get close, but don’t touch it. Faster scores more.', 8);
  else if (CHILD) {
    // (Recalled above, so read afresh here.)
    const c = child as { name: string; birth: string } | null;
    if (c) guardKept();
    if (!c) { openSetup(); views?.classList.add('hidden'); }
    else if (newYear) {
      // (A birthday since: last year's tree finished and kept, a new seed planted; their height asked.)
      say(`${c.name} is ${age0} today. Last year’s tree is finished, in every year; this one begins.`, 10);
      askNote({ kind: 'height', age: age0 }, `How tall is ${c.name} now? (cm)`);
    } else if (!tree.rings.length && !seedAt) say(`Tap where ${c.name}’s tree should grow.`, 1e5);
    else say(days.includes(today) ? `${c.name}’s day is drawn. Draw another if you like.` : question(), 10);
  }
  else if (GROWN && !tree.rings.length && finishedYear) say('A year. It stands in your grove. Choose the next.', 1e5);
  else if (GROWN && !tree.rings.length) say(seedAt ? 'Draw a loop around the seed.' : 'Swipe through the woods. Touch one to plant it.', 1e5);
  // (Words only where they're needed: before the first ring. After that, the tree says it.)
  else if (!tree.rings.length) say('Draw a circle around this one.', 8);
  Object.assign(window, { press: { get tree() { return tree; }, get phase() { return settle.ring >= 0 ? 'settling' : 'trace'; }, get easing() { return !!ease; }, get view() { return viewNow(); }, get days() { return days; }, get run() { return run; }, get kind() { return kind; }, get choice() { return SEEDS[choice]; }, get far() { return far; }, get visiting() { return visit?.i ?? null; }, get parting() { return !!parting; }, groveNext: () => { const c = camNow(), w = worldOf(); return { x: (c.X0 + w.next.wx * c.S) / px, y: (c.Y0 + w.next.wy * c.S) / px }; }, grove: () => groveLayout().trees.map((t) => ({ sp: t.sp, n: t.n, i: t.i, x: t.x / px, y: t.y / px, r: t.r / px })), get editionY() { return editionY; }, get stampAt() { return stampAt; }, target: (a: number) => target.r(a), look: (to: 'year' | 'life' | number) => lookAt(to), print: async () => (await yearPrint()).toDataURL('image/png'), words: async () => (await yearWords()).toDataURL('image/png'), block: async () => (await yearBlock()).toDataURL('image/png') } });
  // (The real wood: once it's come, the print is pressed again with it.)
  if (PRINT) loadWood(() => { for (const k in printCaches) delete printCaches[k]; });
  startIntro();
  requestAnimationFrame(frame);
})();
