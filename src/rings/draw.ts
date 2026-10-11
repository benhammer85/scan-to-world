/**
 * The slice, drawn as a botanical engraver of about 1820 would have drawn a transverse section of a
 * trunk: ink only, two line weights, shading by hatching and never by gradient (see RINGS-STYLE.md,
 * whose test is "Would a botanical engraver of about 1820 have drawn it this way?").
 *
 *   rings     one fine line each, a smooth closed curve through its points (never a polygon), pale
 *             where its stroke began (earlywood) and darkening round its loop the way the stroke went
 *             (latewood), darker still where the hand went slowly; fainter where they crowd. Where the
 *             stroke began and ended, its seam shows, as an ensō's does;
 *   bark      a band of short fissure strokes, its outer edge the heavier line;
 *   shadow    parallel strokes outside the bark, on the side away from the light (upper left);
 *   fire      a scar of cross-hatching, permanent, which the rings after it roll over;
 *   wounds    where the cambium died: a soft dark band along the ring, hatched along it, tapering
 *             at its ends where the living wood rolls over it (never a spoke from the pith);
 *   decades   the dendrochronologist's dots: one at each decade, two at fifty years, three at a hundred;
 *   the sun   the astronomer's sign, a ring with a dot, outside the bark on the side it shines from.
 *
 * The line being drawn is wet: in watercolour a wash, pale where it began and deeper as it goes,
 * scratchy once the brush's wood is spent; engraved, the same in radial hatching. When the ring
 * closes it dries into ink.
 *
 * With the watercolour ink, finished wood is washed as a colourist tinted a printed plate: pale
 * earlywood, deeper latewood, and the heartwood a shade darker. The ink still does the work.
 *
 * Everything takes a View (hand.ts), so the same drawing makes the live slice and the plate.
 */
import { K, type TreeSim } from './tree';
import { radiusAt, warpR, warpSlope, type View } from './hand';

export { radiusAt, type View } from './hand';

/** Device px a mm at radius r, in this view (the warp widens the newest rings). */
const local = (v: View, r: number) => v.s * warpSlope(v.warp, r);
export const PAPER = '#f4efe4';
const INK_RGB = [46, 33, 24], PENCIL_RGB = [154, 145, 132];
export const INK = `rgb(${INK_RGB.join(',')})`;
const TAU = Math.PI * 2;
/** Arcs a ring is divided into, for fading out of view: each fades and is inked again on its own. */
export const ARCS = 12;
/** Bands along a ring's loop, from pale earlywood to dark latewood. */
const BANDS = 6;

/** The two line weights, in device pixels. */
export const fine = (v: View) => 0.7 * v.px, heavy = (v: View) => 1.6 * v.px;

export function ink(alpha: number, fade = 0): string {
  const c = INK_RGB.map((x, i) => Math.round(x + (PENCIL_RGB[i] - x) * fade));
  return `rgba(${c[0]},${c[1]},${c[2]},${(alpha * (1 - fade) + 0.45 * fade).toFixed(3)})`;
}

/** Where a point of the tree (angle, radius in mm) falls on the canvas. */
export function at(v: View, a: number, r: number): [number, number] {
  const t = a + v.turn, R = v.s * warpR(v.warp, r);
  return [v.cx + R * Math.cos(t), v.cy - R * Math.sin(t)];
}

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The radius of ring i (−1 is the pith) at point n. */
function ringR(tree: TreeSim, i: number, n: number): number {
  return i < 0 ? tree.k.pith : tree.rings[i][n];
}
/** The bark as it was with `upto` rings laid (all of them, by default). */
function edge(tree: TreeSim, upto = tree.rings.length): (n: number) => number {
  return upto > 0 ? (n) => tree.rings[upto - 1][n] : () => tree.k.pith;
}
const meanOf = (r: (n: number) => number) => { let s = 0; for (let n = 0; n < K; n += 4) s += r(n); return s / (K / 4); };

/**
 * One ring's line, from where its stroke began round its loop the way it went (`dir`), or as far as
 * `upto` (0 to 1) of it: pale to dark in bands, faded towards pencil arc by arc as `fadeOf` says.
 */
export function strokeRing(g: CanvasRenderingContext2D, v: View, radius: (n: number) => number, start: number, width: number, opts: { upto?: number; fadeOf?: (arc: number) => number; from?: number; dir?: number; tone?: Float32Array; faint?: number } = {}): void {
  const upto = opts.upto ?? 1, from = opts.from ?? 0, dir = opts.dir ?? 1, tone = opts.tone;
  if (upto <= from) return;
  // Crowded rings are drawn fainter, so a run of thin years reads as a tone and a wide one stands out.
  const crowd = Math.max(0.22, Math.min(1, width / (2.2 * v.px)));
  // (Finely enough that the curve through its points reads as a curve: a step every pixel or two.)
  const around = TAU * warpR(v.warp, radiusAt(radius, start)) * v.s, steps = Math.max(2, Math.ceil(Math.max(K, around / (1.6 * v.px)) * (upto - from)));
  // (One path while the ink stays the same; where it changes, the old path ends and a new one begins at
  // the same point, so no stretch is drawn twice: drawn twice, every change darkened a spoke across the rings.)
  let style = '', lx = 0, ly = 0;
  for (let j = 0; j <= steps; j++) {
    const f = from + ((upto - from) * j) / steps, a = start + dir * f * TAU;
    const [x, y] = at(v, a, radiusAt(radius, a));
    const b = Math.min(BANDS - 1, Math.floor(Math.min(f, 0.9999) * BANDS)), c = Math.floor(((((a % TAU) + TAU) % TAU) / TAU) * ARCS) % ARCS;
    const fade = opts.fadeOf?.(c) ?? 0;
    // (All in the fine line: a heavy latewood stretch on rings this wide drew every ring as a dark
    // spiral arc. The heavy line is kept for the bark, scars and wounds. Where the hand went slowly,
    // the latewood is darker; quickly, lighter: the pace's only mark.)
    const t = tone ? toneAt(tone, a) : 0.5, deep = Math.round((0.26 + (0.5 * b) / (BANDS - 1) + 0.34 * t) * 12) / 12;
    const colour = ink(Math.min(0.95, deep) * crowd * (opts.faint ?? 1), Math.round(fade * 20) / 20), weight = fine(v);
    const now = colour + weight;
    if (now !== style) {
      if (style) g.stroke();
      style = now;
      g.strokeStyle = colour; g.lineWidth = weight;
      g.beginPath();
      g.moveTo(j ? lx : x, j ? ly : y);
    }
    if (j) g.lineTo(x, y);
    lx = x; ly = y;
  }
  if (style) g.stroke();
}

/** A ring's tone (kept at every eighth point) at angle a. */
export function toneAt(tone: Float32Array, a: number): number {
  const n = tone.length, f = ((((a % TAU) + TAU) % TAU) / TAU) * n, i = Math.floor(f) % n, t = f - Math.floor(f);
  return tone[i] * (1 - t) + tone[(i + 1) % n] * t;
}

/** A ring's mean width, in device pixels. */
function widthOf(tree: TreeSim, i: number, v: View): number {
  let s = 0;
  for (let n = 0; n < K; n += 8) s += ringR(tree, i, n) - ringR(tree, i - 1, n);
  return (s / (K / 8)) * local(v, ringR(tree, i, 0));
}

export interface SliceLook {
  water: boolean;
  /** The watercolour paper, drawn in under the marks (in watercolour the paint is the wood, and has no ink lines). */
  wash?: (g: CanvasRenderingContext2D) => void;
}

/**
 * Every ring laid (or the first `upto`), and what's written in them: in watercolour, the paper's paint;
 * engraved, the rings' lines, the fire's scars, wounds and cracks; and either way the decade dots and the
 * pith. `fadeOf(ring, arc)` says how far each arc has gone back to pencil.
 */
export function drawSlice(g: CanvasRenderingContext2D, tree: TreeSim, v: View, look: SliceLook, fadeOf?: (ring: number, arc: number) => number, upto = tree.rings.length): void {
  // (Butt ends: where a ring's line changes its ink, round ends overlapped and dotted a spoke across every ring.)
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (look.water) {
    look.wash?.(g);
  } else {
    for (let i = 0; i < upto; i++) {
      const ring = tree.rings[i];
      strokeRing(g, v, (n) => ring[n], tree.starts[i], widthOf(tree, i, v), { dir: tree.dirs[i], tone: tree.tones[i], ...(fadeOf ? { fadeOf: (c: number) => fadeOf(i, c) } : {}) });
    }
    for (const s of tree.scars) if (s.half > 0 && s.ring - 1 < upto) scar(g, tree, v, s.ring - 1, s.angle, s.half);
    for (const w of tree.wounds) if (w.ring < upto) wound(g, tree, v, w.ring, w.a0, w.a1);
    for (const c of tree.cracks) if (c.ring < upto) crack(g, tree, v, c.ring, c.angle, c.depth, upto);
  }
  drawMarks(g, tree, v, upto);
}

/** The decade dots and the pith. */
export function drawMarks(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto = tree.rings.length): void {
  decades(g, tree, v, upto);
  const [px, py] = at(v, 0, 0);
  g.fillStyle = ink(0.85);
  g.beginPath(); g.arc(px, py, Math.max(1.2 * v.px, Math.min(2.6 * v.px, warpR(v.warp, tree.k.pith) * v.s * 0.45)), 0, TAU); g.fill();
}

// ---------------------------------------------------------------- the paper
/** The paper's tooth: a small tile of noise, made once, laid faintly over the sheet in watercolour. */
let paperTile: HTMLCanvasElement | null = null;
function tile(): HTMLCanvasElement {
  if (paperTile) return paperTile;
  const n = 192, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!, img = x.createImageData(n, n), d = img.data;
  let s = 17;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let p = 0; p < n * n; p++) { const r = rnd(); d[p * 4] = 120; d[p * 4 + 1] = 104; d[p * 4 + 2] = 84; d[p * 4 + 3] = 4 + 13 * r * r; }
  x.putImageData(img, 0, 0);
  // (A few laid lines and fibres, very faint.)
  x.strokeStyle = 'rgba(120,104,84,0.025)'; x.lineWidth = 1;
  for (let k = 0; k < n; k += 6) { x.beginPath(); x.moveTo(0, k + 0.5); x.lineTo(n, k + 0.5); x.stroke(); }
  for (let k = 0; k < 14; k++) { const fx = rnd() * n, fy = rnd() * n, a = rnd() * TAU, l = 6 + 14 * rnd(); x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + Math.cos(a + 0.5) * l * 0.5, fy + Math.sin(a + 0.5) * l * 0.5, fx + Math.cos(a) * l, fy + Math.sin(a) * l); x.stroke(); }
  paperTile = c;
  return c;
}

/** The paper's tooth over the whole sheet (watercolour): faint, never a gradient. */
export function drawPaper(g: CanvasRenderingContext2D, w: number, h: number): void {
  const pat = g.createPattern(tile(), 'repeat');
  if (!pat) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = pat; g.fillRect(0, 0, w, h);
  g.restore();
}

/** Just the ring laid last (ring i), added to what's drawn: its wash, and its line. */
export function drawRing(g: CanvasRenderingContext2D, tree: TreeSim, v: View, look: SliceLook, i: number): void {
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (look.water) return;
  const ring = tree.rings[i];
  strokeRing(g, v, (n) => ring[n], tree.starts[i], widthOf(tree, i, v), { dir: tree.dirs[i], tone: tree.tones[i] });
}

/** A stretch of ring i's line, in ink: from tree angle a0 to a1 (an arc being inked again). */
export function inkArc(g: CanvasRenderingContext2D, tree: TreeSim, v: View, i: number, a0: number, a1: number): void {
  const ring = tree.rings[i], dir = tree.dirs[i] ?? 1, w = widthOf(tree, i, v);
  // (In the stroke's own terms: how far round its loop the arc lies, the way it went.)
  const s0 = dir > 0 ? a0 : a1, from = ((((dir * (s0 - tree.starts[i])) % TAU) + TAU) % TAU) / TAU, len = (a1 - a0) / TAU;
  const o = { dir, tone: tree.tones[i] };
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (from + len <= 1) strokeRing(g, v, (n) => ring[n], tree.starts[i], w, { ...o, from, upto: from + len });
  else { strokeRing(g, v, (n) => ring[n], tree.starts[i], w, { ...o, from, upto: 1 }); strokeRing(g, v, (n) => ring[n], tree.starts[i], w, { ...o, from: 0, upto: from + len - 1 }); }
}

/** A fire's scar: the wood it charred, cross-hatched, and the bark's edge where it burnt, heavy. */
function scar(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ring: number, angle: number, half: number): void {
  const R = (a: number) => ring < 0 ? tree.k.pith : radiusAt(tree.rings[ring], a), depth = (a: number) => Math.min(R(a) * 0.14, (9 * v.px) / local(v, R(a)));
  const a0 = angle - half, a1 = angle + half, n = Math.max(8, Math.ceil((half * 2 * K) / TAU));
  g.save();
  g.beginPath();
  for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n, [x, y] = at(v, a, R(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = n; j >= 0; j--) { const a = a0 + ((a1 - a0) * j) / n, w = Math.sin((Math.PI * j) / n) ** 0.5, [x, y] = at(v, a, R(a) - depth(a) * w); g.lineTo(x, y); }
  g.closePath();
  g.clip();
  const [cx, cy] = at(v, angle, R(angle)), span = (R(angle) * half * 2 + depth(angle)) * local(v, R(angle)) + 10 * v.px, gap = 2.2 * v.px;
  g.strokeStyle = ink(0.8); g.lineWidth = fine(v);
  g.beginPath();
  for (let d = -span; d <= span; d += gap) {
    g.moveTo(cx + d - span, cy - span); g.lineTo(cx + d + span, cy + span);
    g.moveTo(cx + d - span, cy + span); g.lineTo(cx + d + span, cy - span);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = ink(0.95); g.lineWidth = heavy(v);
  g.beginPath();
  for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n, [x, y] = at(v, a, R(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
}

/**
 * Where the cambium died: a soft dark band along the ring it died under, hatched along its length, as
 * the dead surface is drawn in a section; tapering at each end, where the living wood beside it rolls
 * over (the rings after it close in by themselves). Never a spoke from the pith.
 */
function wound(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ring: number, a0: number, a1: number): void {
  const r = tree.rings[ring], span = a1 - a0, n = Math.max(6, Math.ceil((span / TAU) * K * 2));
  const inner = (a: number) => (ring > 0 ? radiusAt(tree.rings[ring - 1], a) : tree.k.pith);
  // How deep the band reaches in from the dead surface: a few pixels, never past the ring inside it.
  const deep = (a: number) => Math.min((4.2 * v.px) / local(v, radiusAt(r, a)), Math.max((1.2 * v.px) / local(v, radiusAt(r, a)), (radiusAt(r, a) - inner(a)) * 0.9));
  const lines = 4;
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < lines; k++) {
    // Each line further in is shorter, so the band tapers to its ends: a callus's roll, not a cut.
    const f = k / lines, trim = span * 0.5 * (0.08 + 0.55 * f * f), b0 = a0 + trim, b1 = a1 - trim;
    if (b1 <= b0) continue;
    g.strokeStyle = ink(k ? 0.62 - 0.1 * k : 0.9); g.lineWidth = k ? fine(v) : heavy(v);
    g.beginPath();
    for (let j = 0; j <= n; j++) {
      const a = b0 + ((b1 - b0) * j) / n, e = Math.sin((Math.PI * (a - a0)) / span) ** 0.6;
      const [x, y] = at(v, a, radiusAt(r, a) - deep(a) * f * (0.5 + 0.5 * e));
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

/** A crack where a stroke didn't close: heavy across its ring, and fine through the next few, which closed it. */
function crack(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ring: number, angle: number, depth: number, upto: number): void {
  const Rin = ring > 0 ? radiusAt(tree.rings[ring - 1], angle) : tree.k.pith, Rout = radiusAt(tree.rings[ring], angle);
  const end = Math.min(upto, tree.rings.length, ring + 4), Rend = radiusAt(tree.rings[end - 1], angle);
  const [x0, y0] = at(v, angle, Rin - (Rout - Rin) * depth), [x1, y1] = at(v, angle, Rout), [x2, y2] = at(v, angle, Math.max(Rout, Rend));
  g.strokeStyle = ink(0.95); g.lineWidth = heavy(v);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.lineWidth = fine(v); g.strokeStyle = ink(0.6);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

/** The decade dots, along the radius to the north: one a decade, two at fifty years, three at a hundred. */
function decades(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto: number): void {
  const a = Math.PI / 2, per = tree.k.yearsPerRing;
  g.fillStyle = ink(0.9);
  for (let y = 10; y <= upto * per; y += 10) {
    const i = Math.ceil(y / per) - 1, f = (y - i * per) / per;
    const r0 = i ? radiusAt(tree.rings[i - 1], a) : tree.k.pith, r = r0 + (radiusAt(tree.rings[i], a) - r0) * Math.min(0.85, f);
    const n = y % 100 === 0 ? 3 : y % 50 === 0 ? 2 : 1, dot = 0.9 * v.px, gap = 3.2 * v.px;
    for (let d = 0; d < n; d++) {
      const off = (d - (n - 1) / 2) * gap, [x, yy] = at(v, a, r);
      // (side by side across the radius, as they're pricked on a core)
      const t = a + v.turn, ox = -Math.sin(t) * off, oy = -Math.cos(t) * off;
      g.beginPath(); g.arc(x + ox, yy + oy, dot, 0, TAU); g.fill();
    }
  }
}

/** How thick the bark is drawn, in mm (a share of the trunk, within a few pixels). */
export function barkThickness(tree: TreeSim, v: View, upto = tree.rings.length): number {
  const R = meanOf(edge(tree, upto));
  const ls = local(v, R);
  return Math.max((2.5 * v.px) / ls, Math.min(R * 0.035, (9 * v.px) / ls));
}

/** The bark: a band of short fissures, the cambium's line inside it fine, its outer edge heavy. */
export function drawBark(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto = tree.rings.length): void {
  const bt = barkThickness(tree, v, upto), e = edge(tree, upto);
  g.lineJoin = 'round';
  g.strokeStyle = ink(0.75); g.lineWidth = fine(v);
  outline(g, e, v, 0); g.stroke();
  g.strokeStyle = ink(0.95); g.lineWidth = heavy(v);
  outline(g, e, v, bt); g.stroke();
  // The fissures: one every few pixels round, of varied length, as bark is cut.
  const around = TAU * warpR(v.warp, meanOf(e) + bt) * v.s, count = Math.max(40, Math.min(900, Math.round(around / (3.4 * v.px))));
  g.strokeStyle = ink(0.6); g.lineWidth = fine(v);
  g.beginPath();
  for (let j = 0; j < count; j++) {
    const a = (j / count) * TAU, r = radiusAt(e, a), l = 0.35 + 0.6 * hash(j * 1.7 + 3);
    const [x0, y0] = at(v, a, r + bt * (1 - l)), [x1, y1] = at(v, a, r + bt);
    g.moveTo(x0, y0); g.lineTo(x1, y1);
  }
  g.stroke();
}

function outline(g: CanvasRenderingContext2D, e: (n: number) => number, v: View, out: number, dx = 0, dy = 0): void {
  g.beginPath();
  for (let j = 0; j <= K; j++) {
    const a = (j / K) * TAU, [x, y] = at(v, a, radiusAt(e, a) + out);
    if (j) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy);
  }
  g.closePath();
}

/**
 * The shadow the slice casts, as an engraver shades: parallel strokes outside it, away from the light
 * (upper left). Drawn first: the slice is then laid over it, on clean paper.
 */
export function drawShadow(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto = tree.rings.length): void {
  const e = edge(tree, upto), bt = barkThickness(tree, v, upto), R = warpR(v.warp, meanOf(e) + bt) * v.s, off = Math.max(3 * v.px, R * 0.05);
  g.save();
  outline(g, e, v, bt, off, off);
  g.clip();
  g.strokeStyle = ink(0.55); g.lineWidth = fine(v);
  const gap = 2.6 * v.px, span = R + off * 2;
  g.beginPath();
  for (let d = -span * 2; d <= span * 2; d += gap) { g.moveTo(v.cx + d - span, v.cy - span); g.lineTo(v.cx + d + span, v.cy + span); }
  g.stroke();
  g.restore();
  g.fillStyle = PAPER;
  outline(g, e, v, bt);
  g.fill();
}

/** The sun's sign outside the bark, on the side it shines from (rayed in a drought). */
export function drawSun(g: CanvasRenderingContext2D, tree: TreeSim, v: View, rayed: boolean, outside = 0): [number, number] {
  const a = tree.k.sunAngle, R = radiusAt(edge(tree), a) + barkThickness(tree, v), [bx, by] = at(v, a, R);
  const t = a + v.turn, d = 20 * v.px + outside, x = bx + Math.cos(t) * d, y = by - Math.sin(t) * d;
  g.strokeStyle = ink(0.9); g.fillStyle = ink(0.9); g.lineWidth = fine(v);
  g.beginPath(); g.arc(x, y, 5.5 * v.px, 0, TAU); g.stroke();
  g.beginPath(); g.arc(x, y, 1.3 * v.px, 0, TAU); g.fill();
  if (rayed) {
    g.beginPath();
    for (let k = 0; k < 8; k++) { const r = (k / 8) * TAU; g.moveTo(x + Math.cos(r) * 8 * v.px, y + Math.sin(r) * 8 * v.px); g.lineTo(x + Math.cos(r) * 12 * v.px, y + Math.sin(r) * 12 * v.px); }
    g.stroke();
  }
  return [x, y];
}

/**
 * Where an even ring of the steady size would land: a dotted pencil circle round the pith, as an
 * engraver pencils a construction line before inking, or as a practice sheet is traced. `alpha` sets
 * how faint; it may breathe, slowly, as a suggestion of pace.
 */
export function drawGuide(g: CanvasRenderingContext2D, tree: TreeSim, v: View, band: number, alpha = 1): void {
  if (alpha < 0.01) return;
  const e = edge(tree), u = tree.guide(), w = tree.wRef, r = (i: number) => e(i) + u[i] * w;
  void band;
  const around = TAU * warpR(v.warp, r(0)) * v.s, n = Math.max(K, Math.ceil(around / (2 * v.px)));
  g.save();
  g.setLineDash([1.2 * v.px, 4 * v.px]);
  g.strokeStyle = `rgba(${PENCIL_RGB.join(',')},${(0.8 * alpha).toFixed(3)})`; g.lineWidth = fine(v);
  g.beginPath();
  for (let j = 0; j <= n; j++) {
    const a = (j / n) * TAU, [x, y] = at(v, a, radiusAt(r, a));
    if (j) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.restore();
}

/**
 * The line being drawn, wet, on the paper outside the bark: the wood from the bark out to the edge as
 * it will dry (the drawn path low-passed, so the hand's tremor is already gentled). `dry` (0 to 1)
 * shrinks a closed ring from the band onto the true ring as it dries (from bark `from`), fading as it goes.
 */
export function drawWet(g: CanvasRenderingContext2D, tree: TreeSim, v: View, band: number, water: boolean, opts: { dry?: number; from?: number } = {}): void {
  const dry = opts.dry ?? 0, laid = opts.from ?? tree.rings.length, closed = opts.dry !== undefined;
  const e = edge(tree, laid), wide = closed ? tree.laidW : tree.wRef, fadeAll = 1 - dry;
  void band;
  if (fadeAll <= 0.01) return;
  const { at: when, inkAt, state, tone } = tree;
  const hi = closed ? tree.hi : tree.edgeNow();
  const pt = (i: number, u: number) => at(v, (i / K) * TAU, e(((i % K) + K) % K) + u * wide);
  g.save();
  g.lineCap = 'butt'; g.lineJoin = 'round';
  if (water) {
    // A wash, pale where the stroke began and deeper as it went; scratchy where the brush's wood was
    // spent (paper left between the strokes).
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < K; i++) {
      if (state[i] !== 1 || hi[i] <= 0.001) continue;
      const j = (i + 1) % K, f = when[i], d = inkAt[i];
      if (d < 0.05 && hash(i * 3.7 + tree.rings.length) > 0.45) continue;
      const [x0, y0] = pt(i, 0), [x1, y1] = pt(i, hi[i]);
      const nj = state[j] === 1 ? j : i, [x2, y2] = pt(i + 1, hi[nj]), [x3, y3] = pt(i + 1, 0);
      // Dark, wet ink, mottled as wet pigment settles unevenly into the paper's tooth.
      const deep = 0.25 + 0.2 * f + 0.2 * tone[i], a = 0.6 * fadeAll * (0.85 + 0.3 * hash(i * 1.37 + tree.rings.length * 4.1));
      g.fillStyle = `rgba(${Math.round(110 - 30 * f)},${Math.round(72 - 20 * f)},${Math.round(42 - 12 * f)},${(a * (0.6 + deep)).toFixed(3)})`;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  } else {
    // Engraved: radial strokes across the wood, close and even, darker as the stroke goes on
    // (earlywood to latewood) and where it went slowly, as an engraver hatches a tone.
    const per = Math.max(1, Math.round((2.6 * v.px) / Math.max(0.1, (TAU / K) * warpR(v.warp, meanOf(e)) * v.s)));
    g.lineWidth = fine(v);
    for (let i = 0; i < K; i += per) {
      if (state[i] !== 1 || hi[i] <= 0.02) continue;
      const f = when[i], d = inkAt[i];
      if (d < 0.05 && hash(i * 3.7 + tree.rings.length) > 0.45) continue;
      const [x0, y0] = pt(i, 0), [x1, y1] = pt(i, hi[i]);
      g.strokeStyle = ink((0.22 + 0.3 * f + 0.2 * tone[i]) * fadeAll);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  // The edge, the line the hand drew: fine, a smooth curve through the drawn points.
  g.strokeStyle = ink((water ? 0.9 : 0.8) * fadeAll); g.lineWidth = water ? heavy(v) : fine(v);
  const R = (i: number) => e(((i % K) + K) % K) + hi[((i % K) + K) % K] * wide;
  g.beginPath();
  let open = false;
  for (let n = 0; n <= K * 3; n++) {
    const i = Math.floor(n / 3) % K;
    if (state[i] !== 1 || state[(i + 1) % K] !== 1) { if (open) { const [x, y] = pt(i, hi[i]); g.lineTo(x, y); } open = false; continue; }
    const a = (n / (K * 3)) * TAU, [x, y] = at(v, a, radiusAt(R, a));
    if (open) g.lineTo(x, y); else { g.moveTo(x, y); open = true; }
  }
  g.stroke();
  g.restore();
}

/**
 * The pen's tip: a drop of ink, as big as the wood left in the brush, where the line is; an empty
 * ring once it's spent. (Before the stroke, and while the line rests, the drop waits for the finger.)
 */
export function drawTip(g: CanvasRenderingContext2D, x: number, y: number, left: number, v: View, band: number): void {
  const r = 1.4 * v.px + Math.min(band, 14 * v.px) * 0.42 * Math.sqrt(Math.max(0, left));
  g.lineWidth = fine(v);
  if (left > 0.12) {
    g.fillStyle = ink(0.8);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  } else {
    g.strokeStyle = ink(0.8);
    g.beginPath(); g.arc(x, y, Math.max(r, 2.4 * v.px), 0, TAU); g.stroke();
  }
}
