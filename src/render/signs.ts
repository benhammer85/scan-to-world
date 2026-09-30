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
 * Each sign's strokes, as polylines of x, y pairs in a box from -1 to 1, y up; and each sign in
 * a few ways, as a hand draws it differently each time, so no two neighbours need look alike. The
 * first way is the one the key and the chart show. (The dot is filled, not stroked, and has none.)
 */
export const STROKES: Record<Sign, number[][][]> = {
  dot: [[]],
  dash: [[[-1, 0, 1, 0]]],
  tree: [
    // A leafy crown, its edge a little lobed, on a short trunk, as the old maps drew a wood tree by tree.
    [crown(0, 0.3, 0.55, 20), [0, -0.25, 0, -0.9]],
    // A smaller, rounder crown on a taller trunk.
    [crown(0, 0.4, 0.42, 16), [0, -0.02, 0, -0.9]],
    // A conifer: a narrow spire with a short stem.
    [[-0.42, -0.5, 0, 0.95, 0.42, -0.5, -0.42, -0.5], [0, -0.5, 0, -0.9]],
  ],
  reeds: [
    // Reeds rising from the waterline, the middle one tallest, bending out a little.
    [[-0.85, -0.75, 0.85, -0.75], [-0.5, -0.75, -0.72, 0.25], [-0.15, -0.75, -0.2, 0.7], [0.2, -0.75, 0.28, 0.9], [0.55, -0.75, 0.75, 0.35]],
    // Three, one bent over.
    [[-0.6, -0.75, 0.6, -0.75], [-0.3, -0.75, -0.45, 0.45], [0.05, -0.75, 0.1, 0.85], [0.35, -0.75, 0.7, 0.1, 0.85, -0.05]],
    // A thin clump of four, short.
    [[-0.7, -0.75, 0.7, -0.75], [-0.4, -0.75, -0.55, 0.1], [-0.1, -0.75, -0.12, 0.45], [0.18, -0.75, 0.25, 0.55], [0.45, -0.75, 0.62, 0.05]],
  ],
  grass: [
    // A tuft of grass: three short blades springing apart, no waterline.
    [[-0.35, -0.5, -0.75, 0.2], [0, -0.5, 0.02, 0.45], [0.35, -0.5, 0.72, 0.15]],
    // Two blades.
    [[-0.15, -0.5, -0.5, 0.35], [0.15, -0.5, 0.45, 0.2]],
    // Four, low and spread.
    [[-0.45, -0.5, -0.85, 0.0], [-0.15, -0.5, -0.25, 0.3], [0.15, -0.5, 0.25, 0.35], [0.45, -0.5, 0.8, 0.05]],
  ],
  shrub: [
    // A low shrub: two small rounded lumps on the ground.
    [[...arc(-0.35, -0.35, 0.45, Math.PI, 0.25, 7), ...arc(0.4, -0.35, 0.4, Math.PI - 0.5, 0, 6)]],
    // A single mound.
    [arc(0, -0.4, 0.55, Math.PI, 0, 9)],
    // Three small lumps.
    [[...arc(-0.5, -0.4, 0.3, Math.PI, 0.3, 5), ...arc(0, -0.35, 0.33, Math.PI - 0.4, 0.3, 5), ...arc(0.5, -0.4, 0.28, Math.PI - 0.4, 0, 5)]],
  ],
  reef: [
    // The broken, scalloped edge of a reef: two small arcs, cusps up.
    [arc(-0.45, 0.25, 0.45, Math.PI, Math.PI * 2, 7), arc(0.45, 0.25, 0.45, Math.PI, Math.PI * 2, 7)],
    // Three smaller.
    [arc(-0.6, 0.2, 0.3, Math.PI, Math.PI * 2, 5), arc(0, 0.2, 0.3, Math.PI, Math.PI * 2, 5), arc(0.6, 0.2, 0.3, Math.PI, Math.PI * 2, 5)],
    // One, with a speck of rock beside it.
    [arc(-0.2, 0.25, 0.5, Math.PI, Math.PI * 2, 8), [0.7, -0.1, 0.72, -0.08]],
  ],
};

/** Whether a sign may be drawn mirrored, so a field of them doesn't look stamped. */
export const MIRRORS: Record<Sign, boolean> = { dot: false, dash: false, tree: false, reeds: true, grass: true, shrub: true, reef: true };

/**
 * GLSL for the distance, in the sign's box, from `p` to its strokes, in whichever of its ways
 * `way` (0 to 1) picks (needs a `segment(p, a, b)` function).
 */
export function signGlsl(sign: Sign, p = 'p', way = 'way'): string {
  const f = (n: number) => n.toFixed(4), ways = STROKES[sign];
  const body = (lines: number[][]) => {
    const parts: string[] = [];
    for (const line of lines) {
      for (let i = 2; i < line.length; i += 2) parts.push(`d = min(d, segment(${p}, vec2(${f(line[i - 2])}, ${f(line[i - 1])}), vec2(${f(line[i])}, ${f(line[i + 1])})));`);
    }
    return parts.join('\n');
  };
  if (ways.length === 1) return body(ways[0]);
  return ways.map((lines, i) => (i === 0 ? `if (${way} < ${f(1 / ways.length)}) {` : i < ways.length - 1 ? `} else if (${way} < ${f((i + 1) / ways.length)}) {` : '} else {') + '\n' + body(lines)).join('\n') + '\n}';
}

/** Draw a sign on a canvas, centred at `x, y`, `r` pixels to each side (the box's 1). */
export function drawSign(g: CanvasRenderingContext2D, sign: Sign, x: number, y: number, r: number, ink: string, width = 2.2): void {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  if (sign === 'dot') { g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath();
  for (const line of STROKES[sign][0]) {
    g.moveTo(x + line[0] * r, y - line[1] * r);
    for (let i = 2; i < line.length; i += 2) g.lineTo(x + line[i] * r, y - line[i + 1] * r);
  }
  g.stroke();
}

/** A sign as SVG, in a 12 by 12 box, in the current colour. */
export function signSvg(sign: Sign): string {
  if (sign === 'dot') return '<circle cx="6" cy="6" r="1.6" fill="currentColor"/>';
  const at = (x: number, y: number) => `${(6 + x * 4.6).toFixed(2)} ${(6 - y * 4.6).toFixed(2)}`;
  const d = STROKES[sign][0].map((l) => `M${at(l[0], l[1])}` + Array.from({ length: l.length / 2 - 1 }, (_, i) => `L${at(l[i * 2 + 2], l[i * 2 + 3])}`).join('')).join('');
  return `<path d="${d}" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
