/**
 * The hand: where the slice sits on the screen, and how a pointer there becomes the brush (an angle
 * round the pith, and an offset from the bark in band units). Shared by the game and its playtest bot,
 * so the bot paints with exactly a player's hand: a run of pointer positions over time.
 *
 * The band is the steady half-mark on the screen: at least BAND CSS pixels, so a ring too thin to see
 * (an old tree's few millimetres) is still painted with a mark a finger can steer; where the true
 * ring is wider than that (a sapling's), the band is the true ring and the stroke is the wood as drawn.
 * The wet stroke dries into the true ring when it closes.
 */
import { K, type TreeSim } from './tree';

/** The steady half-mark, CSS pixels at least. */
export const BAND = 12;
const TAU = Math.PI * 2;

/** The slice on the screen: the pith (device px), device px a mm, the turn, device px a CSS px. */
export interface View { cx: number; cy: number; s: number; turn: number; px: number }

/** A ring's radius at any angle (between its points). */
export function radiusAt(r: Float32Array | ((i: number) => number), a: number): number {
  const f = (((a % TAU) + TAU) % TAU) / TAU * K, i = Math.floor(f) % K, j = (i + 1) % K, t = f - Math.floor(f);
  const get = typeof r === 'function' ? r : (n: number) => r[n];
  return get(i) * (1 - t) + get(j) * t;
}

/** Whether the screen is tall enough for the habit drawing to sit under the slice (else in a corner). */
export const tall = (W: number, H: number) => H > W * 1.25;

/** The room the slice has: its middle and radius (device px). */
export function roomOf(W: number, H: number, px: number, ending = false): { cx: number; cy: number; room: number } {
  const top = 92 * px, foot = (ending ? 190 : tall(W, H) ? 190 : 70) * px, side = 30 * px;
  return { cx: W / 2, cy: top + (H - top - foot) / 2, room: Math.max(40 * px, Math.min((W - side * 2) / 2, (H - top - foot) / 2)) };
}

/**
 * The scale (device px a mm) the slice wants in its room: room for the bark and the ring to come (a
 * wide one, as a sapling's are, or the band's wet stroke outside an old one), and smaller while it's
 * young, so the slice is seen to grow, filling its room by about a century and a half.
 */
export function scaleFor(tree: TreeSim, room: number, px: number): number {
  let R = tree.k.pith;
  for (let i = 0; i < K; i += 4) R = Math.max(R, tree.inner(i));
  const next = R + 3.2 * tree.wRef;
  return Math.max(0.01, Math.min((room - 3.5 * BAND * px) / R, room / next) * Math.min(1, (next / 150) ** 0.15));
}

export function viewFor(tree: TreeSim, W: number, H: number, px: number, ending = false): View {
  const { cx, cy, room } = roomOf(W, H, px, ending);
  return { cx, cy, s: scaleFor(tree, room, px), turn: 0, px };
}

/** The band (device px) for this ring, in this view. */
export function bandOf(tree: TreeSim, v: View): number { return Math.max(BAND * v.px, tree.wRef * v.s); }

/** A pointer (device px) as the brush: its angle round the pith, and its offset from the bark in bands. */
export function brushAt(tree: TreeSim, v: View, band: number, x: number, y: number): { a: number; u: number } {
  const dx = x - v.cx, dy = -(y - v.cy), a = (((Math.atan2(dy, dx) - v.turn) % TAU) + TAU) % TAU;
  const r = Math.hypot(dx, dy), bark = radiusAt((i) => tree.inner(i), a) * v.s;
  return { a, u: (r - bark) / band };
}

/** Where on the screen (device px) the brush at angle a, offset u, is. */
export function pointerAt(tree: TreeSim, v: View, band: number, a: number, u: number): { x: number; y: number } {
  const r = radiusAt((i) => tree.inner(i), a) * v.s + u * band, t = a + v.turn;
  return { x: v.cx + r * Math.cos(t), y: v.cy - r * Math.sin(t) };
}
