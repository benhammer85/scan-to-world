/**
 * A prototype: one ring a year, traced with a brush, then settling into the paper by itself, as a
 * printing press presses without ink (karazuri, the Japanese "empty printing", or a blind embossing).
 * Nothing to learn and nothing said: silent.
 *
 *   trace     draw the year's ring at your own pace with a wet brush: its stroke is dark at the brush
 *             and evaporates behind it (disappearing ink), leaving the year's colour, spring to winter
 *             round the ring, settling only partly into the wood
 *   settle    as the ring closes, it sinks softly into the paper (and on the iPhone app, a faint
 *             pressure in the hand); its relief stays, caught by raking light
 *
 * The tree is in the paper too, never inked: the real print of its age as a blind embossing, seen only
 * as relief in the light.
 */
import '../volcano/fonts.css';
import { NATIVE, rumble, tap } from '../volcano/native';
import { K, OAK, TreeSim } from './tree';
import { bandOf, brushAt, pointerAt, radiusAt, roomOf, scaleFor, warpFor, type View, type Warp } from './hand';
import { at, drawGuide, drawPaper } from './draw';
import { Paper } from './paint';
import { plateImage, preloadPlates, stageAt, type Stage } from './plates';

const TAU = Math.PI * 2, PAPER = '#f4efe4';
const canvas = document.getElementById('press') as HTMLCanvasElement, g = canvas.getContext('2d')!;
const words = document.getElementById('words')!;
let W = 1, H = 1, px = 1;
function fit(): void {
  px = Math.min(3, window.devicePixelRatio || 1);
  W = Math.round(innerWidth * px); H = Math.round(innerHeight * px);
  canvas.width = W; canvas.height = H; view = null;
}
addEventListener('resize', fit);
const clock = () => performance.now() / 1000;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- a young tree to begin from
// One ring is one year, as in the wood: the crown's wood a year is a fifth of the game's five-year ring.
const tree = new TreeSim(Number(new URLSearchParams(location.search).get('seed')) || 1 + Math.floor(Math.random() * 1e6), { yearsPerRing: 1, crown: OAK.crown / 5 });
{
  // (Some years already, traced by a calm hand, so there's a slice to begin from.)
  let time = 0;
  for (let n = 0; n < 24; n++) {
    const gu = tree.guide(), start = Math.random() * TAU;
    let a = start;
    tree.begin(time, a, radiusAt(gu, a));
    while (tree.stroke) { a += TAU / 5 / 60; time += 1 / 60; tree.move(time, a % TAU, radiusAt(gu, a)); }
    time += 2;
  }
  tree.news.length = 0;
}
/** How deep each ring was pressed (0 to 1): the first ones a little, as if pressed long ago. */
const depths: number[] = tree.rings.map(() => 0.55);

const paper = new Paper(320);
// (The season's colour stays, half settled into the wood: green and gold to rust and violet, in oak.)
paper.turn = 0.5;
let warp: Warp = warpFor(tree), view: View | null = null;
paper.fit(warp, warp.R); paper.bake(tree);
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
  words.textContent = text; words.classList.add('shown');
  clearTimeout(sayT); sayT = window.setTimeout(() => words.classList.remove('shown'), fade * 1000);
}
let sayT = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (painter !== null) return;
  const x = e.clientX * px, y = e.clientY * px;
  if (phase !== 'trace') return;
  const v = viewNow();
  if (tree.stroke && tree.resting) {
    const b = brushAt(tree, strokeView ?? v, 0, x, y);
    if (tree.begin(e.timeStamp / 1000, b.a, b.u)) painter = e.pointerId;
    return;
  }
  const b = brushAt(tree, v, 0, x, y);
  if (b.u < -2.5 || b.u > 5) return;
  strokeView = v;
  if (tree.begin(e.timeStamp / 1000, b.a, b.u)) { painter = e.pointerId; paper.begin(tree); trailAt(); }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== painter || phase !== 'trace' || !strokeView) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  for (const c of evs.length ? evs : [e]) {
    const b = brushAt(tree, strokeView, 0, c.clientX * px, c.clientY * px);
    tree.move(c.timeStamp / 1000, b.a, b.u);
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

function trailAt(): void {
  const tip = tree.tip;
  if (!tip || !strokeView) return;
  const r = radiusAt((i) => tree.inner(i), tip.a) + tip.u * tree.wRef, t = clock(), last = trail[trail.length - 1];
  // Speed on the screen, in CSS px a second, eased so the width swells and thins smoothly.
  let fast = last ? last.fast : 0;
  if (last && Math.abs(last.a - tip.a) < 0.5) {
    const [x0, y0] = at(strokeView, last.a, last.r), [x1, y1] = at(strokeView, tip.a, r);
    const v = Math.hypot(x1 - x0, y1 - y0) / px / Math.max(0.008, t - last.t);
    fast += (Math.min(1, v / 600) - fast) * 0.25;
  }
  // A brush: full and wet when unhurried, thin and dry when quick, tapering in as it touches down.
  const n = last && Math.abs(last.a - tip.a) < 0.5 ? trail.length : 0;
  const w = (3 + 5 * (1 - fast)) * Math.min(1, 0.3 + n / 8);
  trail.push({ a: tip.a, r, t, w: last && n ? last.w + (w - last.w) * 0.35 : w * 0.4, fast });
}
function hear(): void {
  for (const n of tree.news) if (n.kind === 'ring') {
    paper.paint(tree); paper.close(tree);
    depths.push(0);
    // (The ring is done: the finger, still down or not, rests while it settles.)
    painter = null; depth = 0;
    enter('settling');
  }
  tree.news.length = 0;
}

// ---------------------------------------------------------------- drawing
/** The tree, pressed blind into the paper: the real print of its age, no ink, only its relief in the light. */
const blind = new Map<string, { hi: HTMLCanvasElement; lo: HTMLCanvasElement }>();
function blindOf(st: Stage): { hi: HTMLCanvasElement; lo: HTMLCanvasElement } | null {
  const img = plateImage(st);
  if (!img || !img.complete || !img.naturalWidth) return null;
  let b = blind.get(st.id);
  if (!b) {
    const make = (colour: string) => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = colour; x.fillRect(0, 0, c.width, c.height); return c; };
    b = { hi: make('rgb(255,253,247)'), lo: make('rgb(92,74,58)') };
    blind.set(st.id, b);
  }
  return b;
}
function drawBlindTree(v: View): void {
  const { stage } = stageAt(tree.year), b = blindOf(stage);
  if (!b) return;
  const h = H * stage.page * 0.95, w = (h * b.hi.width) / b.hi.height, x = W / 2 - w * stage.trunk, y = H - 18 * px - h * (1 - stage.foot), o = 1.1 * px;
  // (Light from the upper left: each pressed line's lower right falls in shadow, its upper left catches the light.)
  g.save();
  g.globalAlpha = 0.09; g.drawImage(b.lo, x + o, y + o, w, h);
  g.globalAlpha = 0.5; g.drawImage(b.hi, x - o, y - o, w, h);
  g.restore();
  void v;
}
/** A ring's relief: pressed into the paper, its edge catches the light above and falls into shadow below. */
function drawRelief(v: View, i: number, d: number): void {
  if (d <= 0.01) return;
  const r = tree.rings[i], o = (0.6 + 1.8 * d) * px;
  const path = (dx: number, dy: number) => { g.beginPath(); for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy); } };
  g.lineWidth = (0.9 + 0.6 * d) * px;
  g.strokeStyle = `rgba(70,50,32,${(0.32 * d).toFixed(3)})`; path(o, o); g.stroke();
  g.strokeStyle = `rgba(255,252,244,${(0.75 * d).toFixed(3)})`; path(-o * 0.8, -o * 0.8); g.stroke();
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
  drawBlindTree(v);
  paper.draw(g, v); paper.heartwood(g, tree, v);
  const n = tree.rings.length;
  for (let i = 0; i < n; i++) {
    const live = i === n - 1 && phase === 'settling';
    // (Older years' relief softens into the slice, as the press's edges wear: the last few stand out.)
    drawRelief(v, i, (live ? depth : depths[i] ?? 0) * (0.25 + 0.75 * Math.exp(-(n - 1 - i) / 5)));
  }
  // The whole slice pressed into the paper as the platen comes down: the paper's edge round it falls
  // into shadow on the side away from the light and catches it on the other, deepening as it's held.
  const sink = phase === 'settling' ? depth : phase === 'lifting' ? (1 - smooth((t - since) / 1.2)) * (depths[n - 1] ?? 0) : 0;
  if (sink > 0.01) {
    const r = tree.rings[n - 1], o = 3.2 * px * sink;
    const rim = (dx: number, dy: number) => { g.beginPath(); for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy); } };
    g.save();
    g.lineWidth = 7 * px * sink;
    g.strokeStyle = `rgba(255,252,244,${(0.8 * sink).toFixed(3)})`; rim(o, o); g.stroke();
    g.strokeStyle = `rgba(60,42,28,${(0.3 * sink).toFixed(3)})`; rim(-o * 0.7, -o * 0.7); g.stroke();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(150,120,95,${(0.16 * sink).toFixed(3)})`; rim(0, 0); g.fill();
    g.restore();
  }
  // The bark: one fine line.
  {
    const r = tree.rings[n - 1];
    g.strokeStyle = 'rgba(46,33,24,0.7)'; g.lineWidth = 1.1 * px; g.beginPath();
    for (let j = 0; j <= K * 2; j++) { const a = (j / (K * 2)) * TAU, [x, y] = at(v, a, radiusAt(r, a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  if (phase === 'trace') {
    drawGuide(g, tree, strokeView ?? v, bandOf(tree, v), 0.75 + 0.25 * Math.cos(t * TAU / 10));
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

fit();
void preloadPlates();
say('Trace the circle, in one unhurried line.', 9);
Object.assign(window, { press: { get tree() { return tree; }, get phase() { return phase; }, get view() { return viewNow(); } } });
requestAnimationFrame(frame);
