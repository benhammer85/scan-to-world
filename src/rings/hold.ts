/**
 * How the slice is held, turned into what the tree feels: shared by the game and its playtest bot, so
 * the bot plays with exactly a player's hands.
 *
 * The slice lies turned by `turn` (radians, anticlockwise on the screen, from the tree's east to the
 * screen's right). Held level, the sap gathers under the side at the top of the screen. Tipped, by a
 * phone's tilt or a finger held on the slice (which tips it down the screen), the low side is the
 * way the tip goes, as seen.
 */
export interface Held {
  /** The slice's turn on the screen. */
  turn: number;
  /** Which way it's tipped, as seen (radians, 0 right, π/2 up the screen), and how far (0 to 1). */
  tipAngle: number;
  tip: number;
}

export function feltBy(h: Held): { up: number; low: number; tilt: number } {
  return { up: Math.PI / 2 - h.turn, low: h.tipAngle - h.turn, tilt: Math.max(0, Math.min(1, h.tip)) };
}

/** A finger held on the slice tips it down the screen: gently at first, more the longer it's held. */
export function fingerTip(heldFor: number): number {
  return Math.min(1, 0.45 + 0.4 * heldFor);
}

/**
 * The phone's own tilt, from its orientation (degrees, as the browser gives them), against how it was
 * held when the tree began: which way is down, in the screen's frame, then how far that has swung
 * and which way. Full at `full` radians.
 */
export function downOf(beta: number, gamma: number): [number, number, number] {
  const b = (beta * Math.PI) / 180, g = (gamma * Math.PI) / 180;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}
export function tiltFrom(level: [number, number, number], now: [number, number, number], full = 0.45): { tipAngle: number; tip: number } {
  const dx = now[0] - level[0], dy = now[1] - level[1];
  const c = Math.max(-1, Math.min(1, level[0] * now[0] + level[1] * now[1] + level[2] * now[2]));
  return { tipAngle: Math.atan2(dy, dx), tip: Math.min(1, Math.acos(c) / full) };
}
