/**
 * The slice, drawn as a botanical engraver of about 1820 would have drawn a transverse section of a
 * trunk: ink only, two line weights, shading by hatching and never by gradient (see STYLE.md, whose
 * test for this game is "Would a botanical engraver of about 1820 have drawn it this way?").
 *
 *   rings     one fine line a year, pale where the year began (earlywood) and darkening round its
 *             loop to where it ended (latewood), the latewood in the heavier line where there is
 *             room for it; drawn fainter where they crowd, so a run of thin years reads as a tone
 *             and a surge year stands out;
 *   bark      a band of short fissure strokes, its outer edge the heavier line;
 *   shadow    parallel strokes outside the bark, on the side away from the light (upper left);
 *   sap       a crescent of radial strokes under the uppermost side, its edge heavy once it's heavy;
 *   fire      a scar of cross-hatching, permanent, which the rings after it roll over;
 *   frost     a crack, a heavy radial line, closed over by a rib;
 *   decades   the dendrochronologist's dots: one at each decade, two at fifty years, three at a hundred;
 *   the sun   the astronomer's sign, a ring with a dot, outside the bark on the side it shines from.
 *
 * With the watercolour ink, each year's wood is washed in as a colourist tinted a printed plate: pale
 * earlywood, deeper latewood, and the heartwood a shade darker.
 *
 * Everything takes a View, so the same drawing makes the live slice and the plate.
 */
import { K, RAIN, DROUGHT, type TreeSim } from './tree';

export const PAPER = '#f4efe4';
const INK_RGB = [46, 33, 24], PENCIL_RGB = [154, 145, 132];
export const INK = `rgb(${INK_RGB.join(',')})`;
const TAU = Math.PI * 2;
/** Arcs a ring is divided into, for fading out of view: each fades and is inked again on its own. */
export const ARCS = 12;
/** Bands along a ring's loop, from pale earlywood to dark latewood. */
const BANDS = 6;

export interface View {
  /** The pith, on the canvas (device pixels). */
  cx: number;
  cy: number;
  /** Device pixels a millimetre. */
  s: number;
  /** The slice's turn on the screen (anticlockwise). */
  turn: number;
  /** Device pixels a CSS pixel (for line weights). */
  px: number;
}

/** The two line weights, in device pixels. */
const fine = (v: View) => 0.7 * v.px, heavy = (v: View) => 1.6 * v.px;

export function ink(alpha: number, fade = 0): string {
  const c = INK_RGB.map((x, i) => Math.round(x + (PENCIL_RGB[i] - x) * fade));
  return `rgba(${c[0]},${c[1]},${c[2]},${(alpha * (1 - fade) + 0.45 * fade).toFixed(3)})`;
}

/** A ring's radius at any angle (between its points). */
export function radiusAt(r: Float32Array | ((i: number) => number), a: number): number {
  const f = (((a % TAU) + TAU) % TAU) / TAU * K, i = Math.floor(f) % K, j = (i + 1) % K, t = f - Math.floor(f);
  const get = typeof r === 'function' ? r : (n: number) => r[n];
  return get(i) * (1 - t) + get(j) * t;
}

/** Where a point of the tree (angle, radius in mm) falls on the canvas. */
export function at(v: View, a: number, r: number): [number, number] {
  const t = a + v.turn;
  return [v.cx + v.s * r * Math.cos(t), v.cy - v.s * r * Math.sin(t)];
}

function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The radius of ring i (−1 is the pith) at sample n. */
function ringR(tree: TreeSim, i: number, n: number): number {
  return i < 0 ? tree.k.pith : tree.rings[i][n];
}

/**
 * One ring's line, from where its year began round its loop, or as far as `upto` (0 to 1) of it: pale
 * to dark in bands, faded towards pencil arc by arc as `fadeOf` says.
 */
export function strokeRing(g: CanvasRenderingContext2D, v: View, radius: (n: number) => number, start: number, width: number, opts: { upto?: number; fadeOf?: (arc: number) => number; from?: number } = {}): void {
  const upto = opts.upto ?? 1, from = opts.from ?? 0;
  if (upto <= from) return;
  // Crowded rings are drawn fainter, so a run of thin years reads as a tone and a wide one stands out.
  const crowd = Math.max(0.22, Math.min(1, width / (2.2 * v.px)));
  const steps = Math.max(2, Math.ceil(K * (upto - from)));
  // (One path while the ink stays the same; where it changes, the old path ends and a new one begins at
  // the same point, so no stretch is drawn twice: drawn twice, every change darkened a spoke across the rings.)
  let style = '', lx = 0, ly = 0;
  for (let j = 0; j <= steps; j++) {
    const f = from + ((upto - from) * j) / steps, a = start + f * TAU;
    const [x, y] = at(v, a, radiusAt(radius, a));
    const b = Math.min(BANDS - 1, Math.floor(Math.min(f, 0.9999) * BANDS)), c = Math.floor(((((a % TAU) + TAU) % TAU) / TAU) * ARCS) % ARCS;
    const fade = opts.fadeOf?.(c) ?? 0, late = b >= BANDS - 2;
    const colour = ink((0.3 + (0.62 * b) / (BANDS - 1)) * crowd, Math.round(fade * 20) / 20), weight = late && width >= 3 * v.px ? heavy(v) : fine(v);
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

/** A ring's mean width, in device pixels. */
function widthOf(tree: TreeSim, i: number, v: View): number {
  let s = 0;
  for (let n = 0; n < K; n += 8) s += ringR(tree, i, n) - ringR(tree, i - 1, n);
  return (s / (K / 8)) * v.s;
}

export interface SliceLook { water: boolean }

/**
 * Every ring laid, and what's written in them: washes (watercolour), rings, the fire's scars, the
 * frost's cracks, the decade dots, and the pith. `fadeOf(ring, arc)` says how far each arc has gone
 * back to pencil.
 */
export function drawSlice(g: CanvasRenderingContext2D, tree: TreeSim, v: View, look: SliceLook, fadeOf?: (ring: number, arc: number) => number, upto = tree.rings.length): void {
  // (Butt ends: where a ring's line changes its ink, round ends overlapped and dotted a spoke across every ring.)
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (look.water) washes(g, tree, v, upto);
  for (let i = 0; i < upto; i++) {
    const ring = tree.rings[i];
    strokeRing(g, v, (n) => ring[n], tree.starts[i], widthOf(tree, i, v), fadeOf ? { fadeOf: (c) => fadeOf(i, c) } : {});
  }
  for (const s of tree.scars) if (s.year - 1 < upto) scar(g, tree, v, s.year - 1, s.angle, s.half);
  for (const c of tree.cracks) if (c.year <= upto) crack(g, tree, v, c.year, c.angle, c.depth, upto);
  decades(g, tree, v, upto);
  // The pith.
  const [px, py] = at(v, 0, 0);
  g.fillStyle = ink(0.85);
  g.beginPath(); g.arc(px, py, Math.max(1.2 * v.px, Math.min(2.6 * v.px, tree.k.pith * v.s * 0.45)), 0, TAU); g.fill();
}

/** Watercolour: each year's wood washed in, pale earlywood and deeper latewood, the heartwood a shade darker. */
function washes(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto: number): void {
  g.save();
  g.globalCompositeOperation = 'multiply';
  // The heartwood: all but the last thirty years' wood, the sapwood, which stays pale.
  const heart = upto - 30;
  if (heart > 4) {
    g.fillStyle = 'rgba(176, 128, 82, 0.22)';
    band(g, tree, v, -1, heart - 1, 0, 1, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < upto; i++) washRing(g, tree, v, i);
  g.restore();
}

/** One year's wash: earlywood across its width, palest where it began; latewood in its outer third, deepening round the loop. */
function washRing(g: CanvasRenderingContext2D, tree: TreeSim, v: View, i: number): void {
  const start = tree.starts[i], tone = 0.85 + 0.3 * hash(i * 3.1 + tree.seed);
  for (let b = 0; b < BANDS; b++) {
    const f0 = b / BANDS, f1 = (b + 1) / BANDS, deep = b / (BANDS - 1);
    g.fillStyle = `rgba(196, 150, 98, ${((0.05 + 0.07 * deep) * tone).toFixed(3)})`;
    band(g, tree, v, i - 1, i, 0, 1, start + f0 * TAU, start + f1 * TAU + 0.004);
    g.fill();
    g.fillStyle = `rgba(128, 84, 46, ${((0.06 + 0.16 * deep) * tone).toFixed(3)})`;
    band(g, tree, v, i - 1, i, 0.66, 1, start + f0 * TAU, start + f1 * TAU + 0.004);
    g.fill();
  }
}

/** Just the year laid last (ring i), added to what's drawn: its wash, and its line. */
export function drawRing(g: CanvasRenderingContext2D, tree: TreeSim, v: View, look: SliceLook, i: number): void {
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (look.water) { g.save(); g.globalCompositeOperation = 'multiply'; washRing(g, tree, v, i); g.restore(); }
  const ring = tree.rings[i];
  strokeRing(g, v, (n) => ring[n], tree.starts[i], widthOf(tree, i, v));
}

/** A stretch of ring i's line, in ink: from tree angle a0 to a1 (an arc being inked again). */
export function inkArc(g: CanvasRenderingContext2D, tree: TreeSim, v: View, i: number, a0: number, a1: number): void {
  const ring = tree.rings[i], start = tree.starts[i], w = widthOf(tree, i, v);
  const from = ((((a0 - start) % TAU) + TAU) % TAU) / TAU, len = (a1 - a0) / TAU;
  g.lineJoin = 'round'; g.lineCap = 'butt';
  if (from + len <= 1) strokeRing(g, v, (n) => ring[n], start, w, { from, upto: from + len });
  else { strokeRing(g, v, (n) => ring[n], start, w, { from, upto: 1 }); strokeRing(g, v, (n) => ring[n], start, w, { from: 0, upto: from + len - 1 }); }
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

/** A fire's scar: the wood it charred, cross-hatched, and the bark's edge where it burnt, heavy. */
function scar(g: CanvasRenderingContext2D, tree: TreeSim, v: View, ring: number, angle: number, half: number): void {
  if (ring < 0 || ring >= tree.rings.length) return;
  const R = (a: number) => radiusAt(tree.rings[ring], a), depth = (a: number) => Math.min(R(a) * 0.14, (9 * v.px) / v.s);
  const a0 = angle - half, a1 = angle + half, n = Math.max(8, Math.ceil((half * 2 * K) / TAU));
  g.save();
  g.beginPath();
  for (let j = 0; j <= n; j++) { const a = a0 + ((a1 - a0) * j) / n, [x, y] = at(v, a, R(a)); if (j) g.lineTo(x, y); else g.moveTo(x, y); }
  for (let j = n; j >= 0; j--) { const a = a0 + ((a1 - a0) * j) / n, w = Math.sin((Math.PI * j) / n) ** 0.5, [x, y] = at(v, a, R(a) - depth(a) * w); g.lineTo(x, y); }
  g.closePath();
  g.clip();
  const [cx, cy] = at(v, angle, R(angle)), span = (R(angle) * half * 2 + depth(angle)) * v.s + 10 * v.px, gap = 2.2 * v.px;
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

/** A frost crack: split in from the bark as it was, heavy; and fine through the rib that closed it. */
function crack(g: CanvasRenderingContext2D, tree: TreeSim, v: View, year: number, angle: number, depth: number, upto: number): void {
  const R = year > 0 ? radiusAt(tree.rings[year - 1], angle) : tree.k.pith;
  const end = Math.min(upto, tree.rings.length, year + 8), Rend = end > 0 ? radiusAt(tree.rings[end - 1], angle) : R;
  const [x0, y0] = at(v, angle, R * (1 - depth)), [x1, y1] = at(v, angle, R), [x2, y2] = at(v, angle, Math.max(R, Rend));
  g.strokeStyle = ink(0.95); g.lineWidth = heavy(v);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.lineWidth = fine(v); g.strokeStyle = ink(0.7);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

/** The decade dots, along the radius to the north: one a decade, two at fifty years, three at a hundred. */
function decades(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto: number): void {
  const a = Math.PI / 2;
  g.fillStyle = ink(0.9);
  for (let y = 10; y <= upto; y += 10) {
    const i = y - 1, r = (radiusAt(tree.rings[i], a) + radiusAt(i ? tree.rings[i - 1] : (() => tree.k.pith), a)) / 2;
    const n = y % 100 === 0 ? 3 : y % 50 === 0 ? 2 : 1, dot = 0.9 * v.px, gap = 3.2 * v.px;
    for (let d = 0; d < n; d++) {
      const off = (d - (n - 1) / 2) * gap, [x, yy] = at(v, a, r);
      // (side by side across the radius, as they're pricked on a core)
      const t = a + v.turn, ox = -Math.sin(t) * off, oy = -Math.cos(t) * off;
      g.beginPath(); g.arc(x + ox, yy + oy, dot, 0, TAU); g.fill();
    }
  }
}

/** The bark's radius (the cambium) at angle a, now. */
const barkR = (tree: TreeSim, a: number) => radiusAt((n) => tree.outer(n), a);
/** How thick the bark is drawn, in mm (a share of the trunk, within a few pixels). */
export function barkThickness(tree: TreeSim, v: View): number {
  const R = tree.radius;
  return Math.max((2.5 * v.px) / v.s, Math.min(R * 0.035, (9 * v.px) / v.s));
}

/** The year being grown: its line as far as the pen has come round, and the pen. */
export function drawYear(g: CanvasRenderingContext2D, tree: TreeSim, v: View, pen = true): void {
  if (tree.over) return;
  const t = tree.t, w = (() => { let s = 0; for (let n = 0; n < K; n += 8) s += tree.cur[n]; return (s / (K / 8)) * v.s; })();
  g.lineJoin = 'round'; g.lineCap = 'butt';
  strokeRing(g, v, (n) => tree.outer(n), tree.yearStart, Math.max(w, 3 * v.px * t), { upto: t });
  if (!pen) return;
  const a = tree.yearStart + t * TAU, [x, y] = at(v, a, barkR(tree, a));
  g.fillStyle = ink(0.95);
  g.beginPath(); g.arc(x, y, 1.8 * v.px, 0, TAU); g.fill();
  g.strokeStyle = ink(0.32); g.lineWidth = fine(v);
  g.beginPath(); g.arc(x, y, 5 * v.px, 0, TAU); g.stroke();
}

/** The bark: a band of short fissures, the cambium's line inside it fine, its outer edge heavy. */
export function drawBark(g: CanvasRenderingContext2D, tree: TreeSim, v: View): void {
  const bt = barkThickness(tree, v);
  g.lineJoin = 'round';
  g.strokeStyle = ink(0.75); g.lineWidth = fine(v);
  outline(g, tree, v, 0); g.stroke();
  g.strokeStyle = ink(0.95); g.lineWidth = heavy(v);
  outline(g, tree, v, bt); g.stroke();
  // The fissures: one every few pixels round, of varied length, as bark is cut.
  const around = TAU * (tree.radius + bt) * v.s, count = Math.max(40, Math.min(900, Math.round(around / (3.4 * v.px))));
  g.strokeStyle = ink(0.6); g.lineWidth = fine(v);
  g.beginPath();
  for (let j = 0; j < count; j++) {
    const a = (j / count) * TAU, r = barkR(tree, a), l = 0.35 + 0.6 * hash(j * 1.7 + 3);
    const [x0, y0] = at(v, a, r + bt * (1 - l)), [x1, y1] = at(v, a, r + bt);
    g.moveTo(x0, y0); g.lineTo(x1, y1);
  }
  g.stroke();
}

function outline(g: CanvasRenderingContext2D, tree: TreeSim, v: View, out: number, dx = 0, dy = 0): void {
  g.beginPath();
  for (let j = 0; j <= K; j++) {
    const n = j, a = (n / K) * TAU, [x, y] = at(v, a, barkR(tree, a) + out);
    if (j) g.lineTo(x + dx, y + dy); else g.moveTo(x + dx, y + dy);
  }
  g.closePath();
}

/**
 * The shadow the slice casts, as an engraver shades: parallel strokes outside it, away from the light
 * (upper left). Drawn first: the slice is then laid over it, on clean paper.
 */
export function drawShadow(g: CanvasRenderingContext2D, tree: TreeSim, v: View): void {
  const bt = barkThickness(tree, v), R = (tree.radius + bt) * v.s, off = Math.max(3 * v.px, R * 0.05);
  g.save();
  outline(g, tree, v, bt, off, off);
  g.clip();
  g.strokeStyle = ink(0.55); g.lineWidth = fine(v);
  const gap = 2.6 * v.px, span = R + off * 2;
  g.beginPath();
  for (let d = -span * 2; d <= span * 2; d += gap) { g.moveTo(v.cx + d - span, v.cy - span); g.lineTo(v.cx + d + span, v.cy + span); }
  g.stroke();
  g.restore();
  g.fillStyle = PAPER;
  outline(g, tree, v, bt);
  g.fill();
}

/**
 * The sap: a crescent of short radial strokes inside the bark, under the side where it lies, deeper
 * as it gathers; its edge in the heavy line once it's heavy enough to surge; and, near the brink, a
 * dotted line where the trunk will split.
 */
export function drawSap(g: CanvasRenderingContext2D, tree: TreeSim, v: View): void {
  const full = tree.fullness;
  if (full < 0.02) return;
  const Rpx = tree.radius * v.s, D = Math.max(6 * v.px, Math.min(30 * v.px, Rpx * 0.18)) / v.s;
  const depth = (a: number) => D * (Math.min(1.8, full) / 1.8) * Math.max(0, Math.cos(a - tree.sapAngle)) ** 3;
  const count = Math.max(30, Math.round((TAU * Rpx) / (3.2 * v.px)));
  g.strokeStyle = ink(0.45); g.lineWidth = fine(v);
  g.beginPath();
  for (let j = 0; j < count; j++) {
    const a = (j / count) * TAU, d = depth(a);
    if (d * v.s < 1.2 * v.px) continue;
    const r = barkR(tree, a), [x0, y0] = at(v, a, r - d), [x1, y1] = at(v, a, r);
    g.moveTo(x0, y0); g.lineTo(x1, y1);
  }
  g.stroke();
  // Its edge.
  g.strokeStyle = ink(full >= 1 ? 0.95 : 0.6); g.lineWidth = full >= 1 ? heavy(v) : fine(v);
  g.beginPath();
  let open = false;
  for (let j = 0; j <= K; j++) {
    const a = tree.sapAngle - Math.PI / 2 + (j / K) * Math.PI, d = depth(a);
    if (d * v.s < 1 * v.px) { open = false; continue; }
    const [x, y] = at(v, a, barkR(tree, a) - d);
    if (open) g.lineTo(x, y); else { g.moveTo(x, y); open = true; }
  }
  g.stroke();
  // Near the brink, where it will split.
  const brink = tree.brink;
  if (brink > 0.7) {
    const r = barkR(tree, tree.sapAngle), [x0, y0] = at(v, tree.sapAngle, r * 0.7), [x1, y1] = at(v, tree.sapAngle, r);
    g.save();
    g.setLineDash([1.5 * v.px, 3 * v.px]);
    g.strokeStyle = ink(Math.min(1, (brink - 0.7) / 0.3)); g.lineWidth = heavy(v);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.restore();
  }
}

/** The sun's sign outside the bark, on the side it shines from: rayed in a drought, pencilled in the rain. */
export function drawSun(g: CanvasRenderingContext2D, tree: TreeSim, v: View): [number, number] {
  const a = tree.k.sunAngle, R = barkR(tree, a) + barkThickness(tree, v), [bx, by] = at(v, a, R);
  const t = a + v.turn, d = 20 * v.px, x = bx + Math.cos(t) * d, y = by - Math.sin(t) * d;
  const w = tree.weatherNow, fade = w === RAIN ? 0.7 : 0;
  g.strokeStyle = ink(0.9, fade); g.fillStyle = ink(0.9, fade); g.lineWidth = fine(v);
  g.beginPath(); g.arc(x, y, 5.5 * v.px, 0, TAU); g.stroke();
  g.beginPath(); g.arc(x, y, 1.3 * v.px, 0, TAU); g.fill();
  if (w === DROUGHT) {
    g.beginPath();
    for (let k = 0; k < 8; k++) { const r = (k / 8) * TAU; g.moveTo(x + Math.cos(r) * 8 * v.px, y + Math.sin(r) * 8 * v.px); g.lineTo(x + Math.cos(r) * 12 * v.px, y + Math.sin(r) * 12 * v.px); }
    g.stroke();
  }
  return [x, y];
}

/** Rain: fine slanting strokes falling on the paper round the slice, as an engraver ruled it. */
export function drawRain(g: CanvasRenderingContext2D, tree: TreeSim, v: View, w: number, h: number, seconds: number, amount: number): void {
  if (amount < 0.01) return;
  const keep = (tree.radius + barkThickness(tree, v)) * v.s + 10 * v.px, reach = keep * 1.6 + 30 * v.px, len = 11 * v.px;
  g.strokeStyle = ink(0.45 * amount); g.lineWidth = fine(v);
  g.beginPath();
  for (let k = 0; k < 90; k++) {
    const x0 = hash(k * 2.3) * (w + h * 0.3), speed = (120 + 60 * hash(k * 5.1)) * v.px;
    const y = ((hash(k * 7.7) * h + seconds * speed) % (h + len)) - len, x = x0 - (y / h) * h * 0.3;
    const d = Math.hypot(x - v.cx, y - v.cy);
    if (d > reach || d < keep || Math.hypot(x - len * 0.3 - v.cx, y + len - v.cy) < keep) continue;
    g.moveTo(x, y); g.lineTo(x - len * 0.3, y + len);
  }
  g.stroke();
}

/** Smoke from a fire, rising from where it burnt: a few fine curling strokes, eased in and out. */
export function drawSmoke(g: CanvasRenderingContext2D, tree: TreeSim, v: View, angle: number, age: number): void {
  if (age < 0 || age > 5) return;
  const life = Math.sin((Math.PI * age) / 5), r = barkR(tree, angle) + barkThickness(tree, v), [x, y] = at(v, angle, r);
  g.strokeStyle = ink(0.5 * life); g.lineWidth = fine(v);
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let j = 0; j <= 24; j++) {
      const u = j / 24, rise = u * (40 + 24 * age) * v.px, sway = Math.sin(u * 5 + age * 1.3 + k * 2) * 6 * v.px * u;
      const px = x + (k - 1) * 5 * v.px + sway, py = y - rise;
      if (j) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  }
}
