/**
 * A prototype: trace a ring, then press it into the paper, as a printing press presses without ink
 * (karazuri, the Japanese "empty printing", or a blind embossing). Pressing is breathing in, letting go
 * breathing out; nothing says how long, and a longer, stiller press only goes deeper.
 *
 *   trace     draw the ring at your own pace (the paint and the disappearing ink, as in the game)
 *   press     hold anywhere: the platen comes down, the ring sinks into the paper, a low hush deepens
 *             (and on the iPhone app, a growing pressure in the hand)
 *   let go    the paper lifts with a soft thump; the ring's relief stays, caught by raking light
 *
 * The tree is in the paper too, never inked: the real print of its age as a blind embossing, seen only
 * as relief in the light.
 */
import '../volcano/fonts.css';
import { NATIVE, rumble, tap } from '../volcano/native';
import { K, TreeSim } from './tree';
import { bandOf, brushAt, pointerAt, radiusAt, roomOf, scaleFor, warpFor, type View, type Warp } from './hand';
import { at, drawGuide, drawPaper } from './draw';
import { Paper } from './paint';
import { plateImage, preloadPlates, stageAt, type Stage } from './plates';
import { lift as liftSound, pen, press as pressSound, tick, wake } from './sound';

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
const tree = new TreeSim(Number(new URLSearchParams(location.search).get('seed')) || 1 + Math.floor(Math.random() * 1e6));
{
  // (A few rings already, traced by a calm hand, so there's wood to press into.)
  let time = 0;
  for (let n = 0; n < 6; n++) {
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
type Phase = 'trace' | 'press' | 'pressing' | 'lifting';
let phase: Phase = 'trace', since = 0, depth = 0, pressedOnce = 0;
function enter(p: Phase): void { phase = p; since = clock(); }
let trail: { a: number; r: number; t: number }[] = [];
let strokeView: View | null = null, painter: number | null = null, mustLift = false;

function say(text: string, fade = 10): void {
  words.textContent = text; words.classList.add('shown');
  clearTimeout(sayT); sayT = window.setTimeout(() => words.classList.remove('shown'), fade * 1000);
}
let sayT = 0;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  wake();
  if (painter !== null) return;
  const x = e.clientX * px, y = e.clientY * px;
  if (phase === 'press' && !mustLift) {
    painter = e.pointerId; depth = 0; enter('pressing');
    if (pressedOnce < 2) say('Press, and breathe in. Let go when you’re ready.', 8);
    return;
  }
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
  // (The finger that finished the ring, lifting: now a press can begin.)
  if (painter === null) { mustLift = false; return; }
  if (e.pointerId !== painter) return;
  painter = null; mustLift = false;
  if (phase === 'trace') { tree.lift(); pen(0); }
  if (phase === 'pressing') {
    // Let go: the paper lifts, and the ring's relief stays.
    depths[tree.rings.length - 1] = Math.max(depths[tree.rings.length - 1] ?? 0, depth);
    liftSound(depth); pressSound(0);
    if (NATIVE) { rumble(0); tap({ strength: 0.25 + 0.5 * depth, sharpness: 0.25 }); }
    pressedOnce++;
    enter('lifting');
  }
});

function trailAt(): void {
  const tip = tree.tip;
  if (tip) trail.push({ a: tip.a, r: radiusAt((i) => tree.inner(i), tip.a) + tip.u * tree.wRef, t: clock() });
}
function hear(): void {
  for (const n of tree.news) if (n.kind === 'ring') {
    paper.paint(tree); paper.close(tree); tick(); pen(0);
    depths.push(0);
    // (The finger may still be down from the stroke: the press waits for it to lift and come again.)
    mustLift = painter !== null; painter = null;
    enter('press');
    say(pressedOnce < 2 ? 'Now press the ring into the paper: hold anywhere.' : '', 9);
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

function frame(): void {
  const t = clock(), dt = 1 / 60, v = viewNow();
  if (phase === 'pressing') {
    // Deeper the longer it's held: most of the way in five seconds, never quite all.
    depth = 1 - Math.exp(-(t - since) / 2.2);
    pressSound(depth);
    if (NATIVE) rumble(0.08 + 0.45 * depth, 0.15);
  }
  if (phase === 'lifting' && t - since > 1.4) {
    // The next ring: the slice settles to its new size.
    warp = warpFor(tree); paper.fit(warp, warp.R); view = null; trail = [];
    enter('trace');
  }
  const tip = tree.tip;
  pen(phase === 'trace' && painter !== null && tip ? Math.min(1, tip.w / 2.5) : 0);
  paper.step(dt);

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  drawBlindTree(v);
  paper.draw(g, v); paper.heartwood(g, tree, v);
  const n = tree.rings.length;
  for (let i = 0; i < n; i++) {
    const live = i === n - 1 && (phase === 'pressing' || phase === 'lifting');
    drawRelief(v, i, live ? depth : depths[i] ?? 0);
  }
  // The whole slice pressed into the paper as the platen comes down: the paper's edge round it falls
  // into shadow on the side away from the light and catches it on the other, deepening as it's held.
  const sink = phase === 'pressing' ? depth : phase === 'lifting' ? (1 - smooth((t - since) / 1.2)) * (depths[n - 1] ?? 0) : 0;
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
    // The ink, evaporating behind the pen.
    const sv = strokeView ?? v;
    g.lineCap = 'round';
    for (let k = 1; k < trail.length; k++) {
      const p = trail[k - 1], q = trail[k], life = Math.exp(-(t - q.t) / 2.6);
      if (life < 0.02 || Math.abs(p.a - q.a) > 0.5) continue;
      const [x0, y0] = at(sv, p.a, p.r), [x1, y1] = at(sv, q.a, q.r);
      g.strokeStyle = `rgba(46,32,26,${(0.82 * life).toFixed(3)})`; g.lineWidth = (1.1 + 1.3 * life) * px;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    if (tip) { const p = pointerAt(tree, sv, 0, tip.a, tip.u); g.fillStyle = 'rgba(46,32,26,0.85)'; g.beginPath(); g.arc(p.x, p.y, 5 * px, 0, TAU); g.fill(); }
  }
  // The platen coming down: the page's edges darken softly as it presses, and lift as it rises.
  const platen = phase === 'pressing' ? depth : phase === 'lifting' ? (1 - smooth((t - since) / 0.9)) * depths[n - 1] : phase === 'press' ? 0.06 * (0.5 + 0.5 * Math.sin(t * TAU / 4)) : 0;
  if (platen > 0.005) {
    const grd = g.createRadialGradient(W / 2, v.cy, Math.min(W, H) * 0.35, W / 2, v.cy, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(60,44,30,0)'); grd.addColorStop(1, `rgba(60,44,30,${(0.38 * platen).toFixed(3)})`);
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
