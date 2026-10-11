/**
 * The hand: where the slice sits on the screen, and how a pointer there becomes the pen (an angle
 * round the pith, and an offset from the bark in steady rings' widths). Shared by the game and its
 * playtest bot, so the bot draws with exactly a player's hand: a run of pointer positions over time.
 *
 * The camera keeps the ring being drawn large and comfortable, whatever the tree's age: the slice fills
 * its room, and a gentle fisheye (the warp) widens its newest rings, so the ring under the finger is
 * always a good width to trace and its colour lands where the line is drawn, while the old rings grow
 * small toward the pith. A young tree's rings are wide already, and it isn't warped at all. Everything
 * drawn on the live slice (and the watercolour paper itself) lies in this warped plane; the plate is
 * drawn true.
 */
import { K, type TreeSim } from './tree';

/** The newest ring's width on the screen, CSS pixels at least (the warp sees to it). */
export const BAND = 16;
const TAU = Math.PI * 2;

/** The fisheye: radius r (mm) is drawn at R·((1−beta)·x + beta·x^q), x = r/R. beta 0 is no warp. */
export interface Warp { R: number; beta: number; q: number }
/** The slice on the screen: the pith (device px), device px a (warped) mm, the turn, device px a CSS px, and the warp. */
export interface View { cx: number; cy: number; s: number; turn: number; px: number; warp?: Warp }

/** A radius (mm) in the warped plane. */
export function warpR(w: Warp | undefined, r: number): number {
  if (!w || w.beta <= 0) return r;
  const x = Math.max(0, r / w.R);
  return w.R * ((1 - w.beta) * x + w.beta * x ** w.q);
}
/** How much the warp widens things at radius r (its slope). */
export function warpSlope(w: Warp | undefined, r: number): number {
  if (!w || w.beta <= 0) return 1;
  const x = Math.max(0, r / w.R);
  return 1 - w.beta + w.beta * w.q * x ** (w.q - 1);
}
/** A warped radius back to mm (the warp only grows, so it's found by bisection). */
export function unwarpR(w: Warp | undefined, rho: number): number {
  if (!w || w.beta <= 0) return rho;
  let lo = 0, hi = Math.max(w.R * 2, rho / (1 - w.beta) + 1);
  for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (warpR(w, m) < rho) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** The warp a tree wants: its newest ring about `share` of the slice's radius wide, or none if it is already. */
export function warpFor(tree: TreeSim, share = 0.085): Warp {
  let top = tree.k.pith;
  for (let i = 0; i < K; i += 4) top = Math.max(top, tree.inner(i));
  const w = tree.wRef, R = top + 1.6 * w, q = 18, x0 = tree.radius / R;
  const need = (share * R) / w;
  if (need <= 1) return { R, beta: 0, q };
  const beta = Math.max(0, Math.min(0.75, (need - 1) / (q * x0 ** (q - 1) - 1)));
  return { R, beta, q };
}

/** A ring's radius at any angle: a smooth (Catmull-Rom) curve through its points, never a polygon. */
export function radiusAt(r: Float32Array | ((i: number) => number), a: number): number {
  const f = (((a % TAU) + TAU) % TAU) / TAU * K, i = Math.floor(f) % K, t = f - Math.floor(f);
  const get = typeof r === 'function' ? r : (n: number) => r[n];
  const p0 = get((i + K - 1) % K), p1 = get(i), p2 = get((i + 1) % K), p3 = get((i + 2) % K);
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

/** Whether the screen is tall enough for the habit drawing to sit under the slice (else in a corner). */
export const tall = (W: number, H: number) => H > W * 1.25;

/**
 * The room the slice has: its middle and radius (device px). On a phone it sits low, in the thumb's
 * reach, over the trunk of the oak drawn up the page behind it; the foot of the page is the ground.
 */
export function roomOf(W: number, H: number, px: number, ending = false): { cx: number; cy: number; room: number } {
  const top = 92 * px, foot = (ending ? 190 : 96) * px, side = 30 * px;
  const room = Math.max(40 * px, Math.min((W - side * 2) / 2, (H - top - foot) / 2));
  const cy = tall(W, H) ? Math.min(H - foot - room, Math.max(top + room, H * 0.58)) : top + (H - top - foot) / 2;
  return { cx: W / 2, cy, room };
}

/** The scale (device px a warped mm) that fills the room with the bark and the ring to come. */
export function scaleFor(tree: TreeSim, room: number, _px: number, warp: Warp = warpFor(tree)): number {
  return Math.max(0.01, room / warpR(warp, warp.R));
}

export function viewFor(tree: TreeSim, W: number, H: number, px: number, ending = false): View {
  const { cx, cy, room } = roomOf(W, H, px, ending), warp = warpFor(tree);
  return { cx, cy, s: scaleFor(tree, room, px, warp), turn: 0, px, warp };
}

/** One steady ring's width on the screen (device px), at the bark, in this view. */
export function bandOf(tree: TreeSim, v: View): number {
  const R = tree.radius;
  return v.s * (warpR(v.warp, R + tree.wRef) - warpR(v.warp, R));
}

/** A pointer (device px) as the pen: its angle round the pith, and its offset from the bark in steady widths. */
export function brushAt(tree: TreeSim, v: View, _band: number, x: number, y: number): { a: number; u: number } {
  const dx = x - v.cx, dy = -(y - v.cy), a = (((Math.atan2(dy, dx) - v.turn) % TAU) + TAU) % TAU;
  const r = unwarpR(v.warp, Math.hypot(dx, dy) / v.s), bark = radiusAt((i) => tree.inner(i), a);
  return { a, u: (r - bark) / tree.wRef };
}

/** Where on the screen (device px) the pen at angle a, offset u, is. */
export function pointerAt(tree: TreeSim, v: View, _band: number, a: number, u: number): { x: number; y: number } {
  const r = v.s * warpR(v.warp, radiusAt((i) => tree.inner(i), a) + u * tree.wRef), t = a + v.turn;
  return { x: v.cx + r * Math.cos(t), y: v.cy - r * Math.sin(t) };
}
