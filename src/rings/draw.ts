/**
 * The slice in watercolour, beneath the live wash (wash.ts): what stays.
 *
 *   ghosts   every ring laid, as a pale wash of its own colours (spring to autumn the way its stroke
 *            went, tinted by its weather), a little deeper at its outer edge where the pigment dried,
 *            with a faint pencil line: what the vivid wash fades to. In the plate and the time-lapse
 *            the same washes are laid at full strength: all the life's colour comes back;
 *   bark     a soft sepia wash outside the last ring, and its line;
 *   fire     a warm blush where a fire bloomed;
 *   guide    a dotted pencil line one steady half-mark outside the bark, where a steady ring reaches;
 *   the tip  a bead of the paint the brush holds, as big as what's left in it;
 *   paper    a warm sheet with a little tooth.
 *
 * Everything takes a View (hand.ts), so the same drawing makes the live slice and the plate.
 */
import { K, type TreeSim } from './tree';
import { radiusAt, type View } from './hand';
import { colourOf, css, BARK, FIRE, type RGB } from './palette';

export { radiusAt, type View } from './hand';
export const PAPER = '#f6f1e6';
const TAU = Math.PI * 2;
/** Stretches along a ring's loop, each its own colour. */
const BANDS = 18;
const PENCIL = '120,112,102';

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Where a point of the tree (angle, radius in mm) falls on the canvas. */
export function at(v: View, a: number, r: number): [number, number] {
  const t = a + v.turn;
  return [v.cx + v.s * r * Math.cos(t), v.cy - v.s * r * Math.sin(t)];
}

/** The radius of ring i (−1 is the pith) at point n. */
function ringR(tree: TreeSim, i: number, n: number): number {
  return i < 0 ? tree.k.pith : tree.rings[i][n];
}
/** The bark as it was with `upto` rings laid (all of them, by default). */
function edge(tree: TreeSim, upto = tree.rings.length): (n: number) => number {
  return upto > 0 ? (n) => tree.rings[upto - 1][n] : () => tree.k.pith;
}

/** A path round the wood between ring a and ring b (a fraction `lo` to `hi` of the way), from angle a0 to a1. */
function band(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ia: number, ib: number, lo: number, hi: number, a0: number, a1: number): void {
  const n = Math.max(3, Math.ceil(((a1 - a0) / TAU) * K) + 1);
  const r = (a: number, f: number) => { const ra = radiusAt((m) => ringR(tree, ia, m), a), rb = radiusAt((m) => ringR(tree, ib, m), a); return ra + (rb - ra) * f; };
  g.beginPath();
  for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n, [x, y] = at(v, a, r(a, hi)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = n; j >= 0; j--) { const a = a0 + ((a1 - a0) * j) / n, [x, y] = at(v, a, r(a, lo)); g.lineTo(x, y); }
  g.closePath();
}

/**
 * One ring's wash: its colours along its loop the way its stroke went, in one smooth sweep round the
 * pith; deeper in its outer fifth, where the pigment dried; at `strength`.
 */
export function washRing(g: CanvasRenderingContext2D, tree: TreeSim, v: View, i: number, strength: number): void {
  const start = tree.starts[i], dir = tree.dirs[i] ?? 1, w = tree.ringWeather[i] ?? 0;
  const paint = (alpha: number): string | CanvasGradient => {
    if (typeof g.createConicGradient !== 'function') return css(colourOf(0.5, w, i), alpha);
    // (A conic sweep runs clockwise on the screen from the stroke's start; a stroke that went
    // anticlockwise is met there by its end, so its colours are read backwards.)
    const [cx, cy] = at(v, 0, 0), grad = g.createConicGradient(-(start + v.turn), cx, cy);
    for (let b = 0; b <= BANDS; b++) {
      const f = b / BANDS, tone = 0.88 + 0.24 * hash(i * 7.1 + (b % BANDS));
      grad.addColorStop(f, css(colourOf(dir > 0 ? 1 - f : f, w, i), alpha * tone));
    }
    return grad;
  };
  g.fillStyle = paint(0.55 * strength);
  band(g, tree, v, i - 1, i, 0, 1, 0, TAU);
  g.fill();
  g.fillStyle = paint(0.45 * strength);
  band(g, tree, v, i - 1, i, 0.8, 1, 0, TAU);
  g.fill();
}

/**
 * Every ring laid (or the first `upto`), as washes at `strength` (a pale ghost of each, live; full in
 * the plate), with a faint pencil line round each, a fire's blush, the decade dots, and the pith.
 */
export function drawGhosts(g: CanvasRenderingContext2D, tree: TreeSim, v: View, strength: number, upto = tree.rings.length): void {
  g.save();
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < upto; i++) washRing(g, tree, v, i, strength);
  for (const s of tree.scars) if (s.ring - 1 < upto && s.ring > 0) blush(g, tree, v, s.ring - 1, s.angle, s.half, strength);
  g.restore();
  g.lineJoin = 'round';
  g.lineWidth = 0.7 * v.px;
  for (let i = 0; i < upto; i++) {
    // (The pencil lighter where the rings crowd, so a run of thin rings reads as a tone.)
    let s = 0;
    for (let n = 0; n < K; n += 12) s += ringR(tree, i, n) - ringR(tree, i - 1, n);
    const w = (s / (K / 12)) * v.s, crowd = Math.max(0.25, Math.min(1, w / (3 * v.px)));
    g.strokeStyle = `rgba(${PENCIL},${(0.28 * crowd * (0.6 + 0.4 * strength)).toFixed(3)})`;
    outline(g, (n) => tree.rings[i][n], v, 0);
    g.stroke();
  }
  decades(g, tree, v, upto, 0.5 + 0.4 * strength);
  const [px, py] = at(v, 0, 0);
  g.fillStyle = `rgba(${PENCIL},0.7)`;
  g.beginPath(); g.arc(px, py, Math.max(1.2 * v.px, Math.min(2.4 * v.px, tree.k.pith * v.s * 0.3)), 0, TAU); g.fill();
}

/** A fire's warm blush on the ring it came after, fading in from its edges. */
function blush(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ring: number, angle: number, half: number, strength: number): void {
  for (let k = 0; k < 6; k++) {
    const f = (k + 1) / 6, h = half * (1.2 - 0.6 * f);
    g.fillStyle = css(FIRE, 0.12 * strength + 0.04);
    band(g, tree, v, ring - 1, ring, 0.2 * f, 1, angle - h, angle + h);
    g.fill();
  }
}

/** The decade dots, faint, along the radius to the north: one a decade, two at fifty years, three at a hundred. */
function decades(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto: number, alpha: number): void {
  const a = Math.PI / 2, per = tree.k.yearsPerRing;
  g.fillStyle = `rgba(${PENCIL},${alpha.toFixed(3)})`;
  for (let y = 10; y <= upto * per; y += 10) {
    const i = Math.ceil(y / per) - 1, f = (y - i * per) / per;
    const r0 = i ? radiusAt(tree.rings[i - 1], a) : tree.k.pith, r = r0 + (radiusAt(tree.rings[i], a) - r0) * Math.min(0.85, f);
    const n = y % 100 === 0 ? 3 : y % 50 === 0 ? 2 : 1, dot = 0.8 * v.px, gap = 3 * v.px;
    for (let d = 0; d < n; d++) {
      const off = (d - (n - 1) / 2) * gap, [x, yy] = at(v, a, r);
      g.beginPath(); g.arc(x + off, yy, dot, 0, TAU); g.fill();
    }
  }
}

function outline(g: CanvasRenderingContext2D, e: (n: number) => number, v: View, out: number): void {
  g.beginPath();
  for (let j = 0; j <= K; j++) {
    const a = (j / K) * TAU, [x, y] = at(v, a, radiusAt(e, a) + out);
    if (j) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}

/** How thick the bark is drawn, in mm (a few pixels). */
export function barkThickness(v: View): number {
  return (4 * v.px) / v.s;
}

/** The bark: a soft sepia wash just outside the last ring, and its line. */
export function drawBark(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto = tree.rings.length, alpha = 1): void {
  const e = edge(tree, upto), bt = barkThickness(v);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = css(BARK, 0.32 * alpha);
  g.beginPath();
  for (let j = 0; j <= K; j++) { const a = (j / K) * TAU, [x, y] = at(v, a, radiusAt(e, a) + bt); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = K; j >= 0; j--) { const a = (j / K) * TAU, [x, y] = at(v, a, radiusAt(e, a)); g.lineTo(x, y); }
  g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = `rgba(92,70,52,${(0.55 * alpha).toFixed(3)})`; g.lineWidth = 0.9 * v.px;
  outline(g, e, v, bt); g.stroke();
}

/**
 * Where the next ring reaches at the steady pace: a dotted pencil line one steady half-mark outside
 * the bark, as a painter pencils a guide before the wash.
 */
export function drawGuide(g: CanvasRenderingContext2D, tree: TreeSim, v: View, band: number, alpha = 1): void {
  if (alpha < 0.01) return;
  const e = edge(tree);
  g.save();
  g.setLineDash([1.2 * v.px, 4 * v.px]);
  g.strokeStyle = `rgba(${PENCIL},${(0.55 * alpha).toFixed(3)})`; g.lineWidth = 0.7 * v.px;
  g.beginPath();
  for (let j = 0; j <= K; j++) {
    const a = (j / K) * TAU, r = radiusAt(e, a) * v.s + band, t = a + v.turn;
    const x = v.cx + r * Math.cos(t), y = v.cy - r * Math.sin(t);
    if (j) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.restore();
}

/** A bead of the brush's paint at its tip, as big as what's left in it; a pale ring once it's nearly empty. */
export function drawTip(g: CanvasRenderingContext2D, x: number, y: number, left: number, colour: RGB, v: View, band: number): void {
  const r = 2 * v.px + Math.min(band, 14 * v.px) * 0.4 * Math.sqrt(Math.max(0, left));
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = css(colour, 0.35 + 0.4 * Math.min(1, left * 3));
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.restore();
  g.strokeStyle = css(colour.map((c) => c * 0.6) as RGB, 0.6); g.lineWidth = 0.8 * v.px;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
}

/** The paper: warm, with a little tooth (made once, laid under everything). */
export function paper(W: number, H: number, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // Soft cockles and a fine tooth, very faint.
  for (let k = 0; k < 140; k++) {
    const x = hash(k * 3.1) * W, y = hash(k * 7.3) * H, r = (40 + 160 * hash(k * 1.7)) * px;
    g.fillStyle = `rgba(${hash(k) > 0.5 ? '255,252,244' : '226,214,194'},0.025)`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (hash(i * 0.013) - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return c;
}
