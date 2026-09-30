/**
 * The signs life is drawn by, as the old survey maps drew it: little pictures of what grows
 * there, readable without a key, rather than codes to be looked up. A tree for forest, reeds at
 * the water's edge for mangroves, grass tufts for meadow, low shrubs for heath, and the
 * scalloped edge the sea charts gave a reef; moss a fine stipple, and a breaker a short stroke.
 *
 * Each is a few pen strokes, kept here once and drawn from the same strokes everywhere: by the
 * stipple's shader on the world, on a canvas for the chart and the marks, and as SVG in the key.
 */

export type Sign = 'dot' | 'dash' | 'tree' | 'reeds' | 'grass' | 'shrub' | 'reef';
export const SIGNS: Sign[] = ['dot', 'dash', 'tree', 'reeds', 'grass', 'shrub', 'reef'];

/** An arc as a polyline: about `cx, cy`, radius `r`, from angle `a0` to `a1` (radians, anticlockwise, y up). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** A tree's crown: a closed ring about `cx, cy`, its edge lobed five times, broken where the trunk meets it. */
function crown(cx: number, cy: number, r: number, steps: number): number[] {
  const out: number[] = [], gap = 0.45;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + gap + ((Math.PI * 2 - gap * 2) * i) / steps, rr = r * (1 + 0.1 * Math.cos(5 * (a + Math.PI / 2)));
    out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  return out;
}

/**
 * Each sign's strokes, as polylines of x, y pairs in a box from -1 to 1, y up. (The dot is filled,
 * not stroked, and has none.)
 */
export const STROKES: Record<Sign, number[][]> = {
  dot: [],
  dash: [[-1, 0, 1, 0]],
  // A leafy crown, its edge a little lobed, on a short trunk, as the old maps drew a wood tree by tree.
  tree: [crown(0, 0.3, 0.55, 20), [0, -0.25, 0, -0.9]],
  // Reeds rising from the waterline, the middle one tallest, bending out a little.
  reeds: [[-0.85, -0.75, 0.85, -0.75], [-0.5, -0.75, -0.72, 0.25], [-0.15, -0.75, -0.2, 0.7], [0.2, -0.75, 0.28, 0.9], [0.55, -0.75, 0.75, 0.35]],
  // A tuft of grass: three short blades springing apart, no waterline.
  grass: [[-0.35, -0.5, -0.75, 0.2], [0, -0.5, 0.02, 0.45], [0.35, -0.5, 0.72, 0.15]],
  // A low shrub: two small rounded lumps on the ground.
  shrub: [[...arc(-0.35, -0.35, 0.45, Math.PI, 0.25, 7), ...arc(0.4, -0.35, 0.4, Math.PI - 0.5, 0, 6)]],
  // The broken, scalloped edge of a reef: two small arcs, cusps up.
  reef: [arc(-0.45, 0.25, 0.45, Math.PI, Math.PI * 2, 7), arc(0.45, 0.25, 0.45, Math.PI, Math.PI * 2, 7)],
};

/** Whether a sign may be drawn mirrored, so a field of them doesn't look stamped. */
export const MIRRORS: Record<Sign, boolean> = { dot: false, dash: false, tree: false, reeds: true, grass: true, shrub: true, reef: true };

/** GLSL for the distance, in the sign's box, from `p` to its strokes (needs a `segment(p, a, b)` function). */
export function signGlsl(sign: Sign, p = 'p'): string {
  const f = (n: number) => n.toFixed(4);
  const parts: string[] = [];
  for (const line of STROKES[sign]) {
    for (let i = 2; i < line.length; i += 2) parts.push(`segment(${p}, vec2(${f(line[i - 2])}, ${f(line[i - 1])}), vec2(${f(line[i])}, ${f(line[i + 1])}))`);
  }
  return parts.length ? parts.map((s) => `d = min(d, ${s});`).join('\n') : '';
}

/** Draw a sign on a canvas, centred at `x, y`, `r` pixels to each side (the box's 1). */
export function drawSign(g: CanvasRenderingContext2D, sign: Sign, x: number, y: number, r: number, ink: string, width = 2.2): void {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  if (sign === 'dot') { g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath();
  for (const line of STROKES[sign]) {
    g.moveTo(x + line[0] * r, y - line[1] * r);
    for (let i = 2; i < line.length; i += 2) g.lineTo(x + line[i] * r, y - line[i + 1] * r);
  }
  g.stroke();
}

/** A sign as SVG, in a 12 by 12 box, in the current colour. */
export function signSvg(sign: Sign): string {
  if (sign === 'dot') return '<circle cx="6" cy="6" r="1.6" fill="currentColor"/>';
  const at = (x: number, y: number) => `${(6 + x * 4.6).toFixed(2)} ${(6 - y * 4.6).toFixed(2)}`;
  const d = STROKES[sign].map((l) => `M${at(l[0], l[1])}` + Array.from({ length: l.length / 2 - 1 }, (_, i) => `L${at(l[i * 2 + 2], l[i * 2 + 3])}`).join('')).join('');
  return `<path d="${d}" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
