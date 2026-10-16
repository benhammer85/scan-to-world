/**
 * The grove from above, as an estate map draws a park: the hill in hand-inked contours, and each tree its
 * crown seen from above, its shadow hatched to the lower right (the light from the upper left, as on the
 * slice), its kind in its outline and its marks: broadleaves in clumps (the oak's broad and lobed, the
 * maple's dense and round, the cherry's small), ash and olive in fine leaflets, birch light and open, the
 * conifers tight tufts of needles, the bristlecone bare-limbed on its dying side. Never a pattern: every
 * outline is its own tree's (`k`), wandering.
 */
const TAU = Math.PI * 2;
const h1 = (x: number) => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const n1 = (x: number) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return h1(i) * (1 - s) + h1(i + 1) * s; };
function vn(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h1(xi * 57 + yi * 131), b = h1(xi * 57 + 57 + yi * 131), c = h1(xi * 57 + yi * 131 + 131), e = h1(xi * 57 + 57 + yi * 131 + 131);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}
const INK = '36,28,23', PAPER = 'rgb(244,239,228)';
const ink = (a: number) => `rgba(${INK},${a})`;

type Habit = { clumps: number; spread: number; rough: number; tip: number; size: number; tall: number; marks: number; squash: number };
const HABIT: Record<string, Habit> = {
  oak: { clumps: 8, spread: 0.62, rough: 0.08, tip: 0, size: 1, tall: 1, marks: 0.42, squash: 0.92 },
  ash: { clumps: 9, spread: 0.55, rough: 0.1, tip: 0, size: 0.9, tall: 1.1, marks: 0.5, squash: 1 },
  maple: { clumps: 5, spread: 0.38, rough: 0.05, tip: 0, size: 0.92, tall: 1, marks: 0.5, squash: 1 },
  cherry: { clumps: 4, spread: 0.42, rough: 0.07, tip: 0, size: 0.72, tall: 0.8, marks: 0.42, squash: 0.85 },
  birch: { clumps: 6, spread: 0.6, rough: 0.14, tip: 0, size: 0.6, tall: 0.9, marks: 0.22, squash: 1 },
  olive: { clumps: 11, spread: 0.72, rough: 0.12, tip: 0, size: 0.85, tall: 0.5, marks: 0.4, squash: 0.78 },
  pine: { clumps: 0, spread: 0, rough: 0.08, tip: 0.16, size: 0.62, tall: 1.4, marks: 0.5, squash: 1 },
  redwood: { clumps: 0, spread: 0, rough: 0.05, tip: 0.1, size: 0.48, tall: 2.1, marks: 0.8, squash: 1 },
  bristlecone: { clumps: 0, spread: 0, rough: 0.14, tip: 0.24, size: 0.52, tall: 0.45, marks: 0.4, squash: 1 },
};
const habit = (sp: string) => HABIT[sp] ?? HABIT.oak;
const CONIFER = new Set(['pine', 'redwood', 'bristlecone']);
/** How big a crown is for its kind and its days (a year's, full size), as a share of a full oak's. */
export const crownSize = (sp: string, days: number) => habit(sp).size * (0.3 + 0.7 * Math.sqrt(Math.min(1.2, days / 365)));

/** Its edge: the radius round it, 1 about its mean. */
const edges = new Map<string, Float32Array>();
function edgeOf(sp: string, k: number): Float32Array {
  const key = `${sp}${k}`, got = edges.get(key);
  if (got) return got;
  const h = habit(sp), N = 240, out = new Float32Array(N + 1), cl: [number, number, number][] = [];
  for (let i = 0; i < h.clumps; i++) { const a = h1(k + i * 2.3) * TAU, d = h.spread * Math.sqrt(h1(k * 3 + i)); cl.push([Math.cos(a) * d, Math.sin(a) * d * h.squash, 0.36 + 0.24 * h1(k * 5 + i)]); }
  for (let j = 0; j <= N; j++) {
    const a = (j / N) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    let r = 0;
    if (h.clumps) {
      for (const [cx, cy, cr] of cl) { const p = cx * ca + cy * sa, q = cx * cx + cy * cy - cr * cr, disc = p * p - q; if (disc > 0) r = Math.max(r, p + Math.sqrt(disc)); }
      r = Math.max(0.5, r / (h.spread + 0.5));
    } else {
      // (Needle tufts at its edge, each its own length, bunched: never a star.)
      const u = (a / TAU) * (sp === 'bristlecone' ? 30 : 48), i = Math.floor(u), f = u - i;
      r = 0.88 + h.tip * h1(i * 1.7 + k) ** 1.6 * Math.sin(Math.PI * f) ** (3 + 4 * h1(i + k));
      if (sp === 'bristlecone') r *= 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(a - 5.6));
    }
    out[j] = r * (1 + h.rough * (n1(a * 3 + k) - 0.5) + 0.5 * h.rough * (n1(a * 11 + k * 2) - 0.5));
  }
  edges.set(key, out);
  return out;
}
function path(g: CanvasRenderingContext2D, x: number, y: number, r: number, E: Float32Array): void {
  const N = E.length - 1;
  g.beginPath();
  for (let j = 0; j <= N; j++) { const a = (j / N) * TAU, px = x + Math.cos(a) * E[j] * r, py = y + Math.sin(a) * E[j] * r; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
  g.closePath();
}

/** A crown from above, at (x, y), `r` across (device px), `U` a CSS px; `alpha` to fade it in. */
export function drawCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, alpha = 1): void {
  if (r < 0.5) return;
  const h = habit(sp), E = edgeOf(sp, k), sx = x + r * 0.4 * h.tall, sy = y + r * 0.32 * h.tall;
  g.save(); g.globalAlpha *= alpha; g.lineCap = 'round';
  if (r < 7 * U) {
    // (Far off, a crown is a dab: its shadow a tone, the crown paper ringed in ink, a mark or two.)
    path(g, sx, sy, r * 0.96, edgeOf(sp, k + 3)); g.fillStyle = ink(0.32); g.fill();
    path(g, x, y, r, E); g.fillStyle = PAPER; g.fill();
    g.strokeStyle = ink(0.9); g.lineWidth = Math.min(1, r / (4 * U)) * 0.8 * U; g.stroke();
    if (r > 3 * U) { g.fillStyle = ink(0.8); g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, 0.5 * U, 0, TAU); g.arc(x + r * 0.05, y + r * 0.45, 0.4 * U, 0, TAU); g.fill(); }
    g.restore();
    return;
  }
  // Its shadow on the ground, hatched.
  g.save(); path(g, sx, sy, r * 0.96, edgeOf(sp, k + 3)); g.clip();
  g.strokeStyle = ink(0.7); g.lineWidth = 0.7 * U; g.beginPath();
  for (let d = -r * 3; d < r * 3; d += 2.2 * U) { g.moveTo(sx + d - r * 2, sy - r * 2); g.lineTo(sx + d + r * 2, sy + r * 2); }
  g.stroke(); g.restore();
  // The bristlecone's dead limbs, bare and twisted, out past its needles on the dying side.
  if (sp === 'bristlecone') {
    g.strokeStyle = ink(0.9);
    for (let i = 0; i < 5; i++) {
      const a = 2.2 + i * 0.32 + (h1(i + k) - 0.5) * 0.2, L = r * (0.95 + 0.45 * h1(i * 3 + k));
      g.lineWidth = (1.3 - i * 0.12) * U; g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + Math.cos(a + 0.5) * L * 0.4, y + Math.sin(a + 0.5) * L * 0.4, x + Math.cos(a - 0.4) * L * 0.7, y + Math.sin(a - 0.4) * L * 0.7, x + Math.cos(a) * L, y + Math.sin(a) * L);
      g.stroke();
    }
  }
  path(g, x, y, r, E); g.fillStyle = PAPER; g.fill();
  // Its marks, thickening toward the lower right, where it turns from the light.
  g.save(); path(g, x, y, r, E); g.clip();
  g.strokeStyle = ink(1); g.fillStyle = ink(1);
  const N = Math.min(3000, Math.round(((r * r) / (U * U)) * h.marks));
  for (let i = 0; i < N; i++) {
    const a = h1(k * 7 + i * 1.37) * TAU, rr = r * Math.sqrt(h1(k * 3 + i * 2.17)), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    const s = Math.max(0, Math.min(1, 0.4 + 0.6 * (((px - x) / r) * 0.6 + ((py - y) / r) * 0.8)));
    if (h1(i * 5.1 + k) > (0.12 + s) ** 2 * 1.1) continue;
    g.beginPath();
    if (CONIFER.has(sp)) {
      const ra = Math.atan2(py - y, px - x) + (h1(i) - 0.5) * 0.9, L = U * (1.6 + 2.2 * h1(i * 3));
      g.lineWidth = 0.55 * U; g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(ra + 0.3) * L * 0.5, py + Math.sin(ra + 0.3) * L * 0.5, px + Math.cos(ra) * L, py + Math.sin(ra) * L); g.stroke();
    } else if (sp === 'ash' || sp === 'olive') {
      const ra = h1(i * 9) * TAU, L = U * (1.2 + 1.4 * h1(i * 3));
      g.lineWidth = 0.6 * U; g.moveTo(px, py); g.lineTo(px + Math.cos(ra) * L, py + Math.sin(ra) * L); g.stroke();
    } else if (sp === 'birch') {
      const d = (0.35 + 0.3 * h1(i)) * U; g.arc(px, py, d, 0, TAU); g.fill();
    } else {
      const cr = U * (sp === 'oak' ? 0.9 + 1 * h1(i * 3) : 0.7 + 0.7 * h1(i * 3)), tilt = (h1(i * 7) - 0.5) * 0.8;
      g.lineWidth = (0.35 + 0.35 * s) * U; g.arc(px, py, cr, 0.15 * Math.PI + tilt, 0.95 * Math.PI + tilt); g.stroke();
    }
  }
  // (An oak's crown is many crowns: the edges of its big clumps, a few arcs within it.)
  if (sp === 'oak') {
    g.strokeStyle = ink(0.35); g.lineWidth = 0.5 * U;
    for (let i = 0; i < 5; i++) { const a = h1(k + i * 3.3) * TAU, rr = r * (0.25 + 0.3 * h1(k * 2 + i)); g.beginPath(); g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * (0.3 + 0.1 * h1(i + k)), 0.1 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  }
  g.restore();
  // Its outline, by hand: heavier on the shade side, broken now and then toward the light.
  const M = E.length - 1, light = sp === 'birch' || sp === 'olive' ? 0.6 : 1;
  g.strokeStyle = ink(1);
  for (let j = 0; j < M; j++) {
    const a = (j / M) * TAU, b = ((j + 1) / M) * TAU, sh = 0.5 + 0.5 * Math.cos(a - 0.9);
    if (sh < 0.25 && h1(j * 0.31 + k) < 0.35) continue;
    g.lineWidth = U * (0.35 + 0.8 * sh) * light;
    g.beginPath(); g.moveTo(x + Math.cos(a) * E[j] * r, y + Math.sin(a) * E[j] * r); g.lineTo(x + Math.cos(b) * E[j + 1] * r, y + Math.sin(b) * E[j + 1] * r); g.stroke();
  }
  g.restore();
}

/** A seedling, small: the tree being drawn, before it has a crown to speak of. */
export function drawSeedling(g: CanvasRenderingContext2D, x: number, y: number, r: number, U: number, alpha = 1): void {
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = ink(0.85); g.lineWidth = 0.8 * U; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3 + 0.4 * h1(i * 3.1), L = r * (0.5 + 0.5 * h1(i * 7.7)); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.4) * L * 0.6, y + Math.sin(a + 0.4) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.9); }
  g.stroke(); g.fillStyle = ink(1); g.beginPath(); g.arc(x, y, 1.1 * U, 0, TAU); g.fill(); g.restore();
}

// ---------------------------------------------------------------- the land
/**
 * The land, in world units (a full-grown oak's crown 1 across): a tree keeps its place and its size, and
 * the land grows to hold them. Each hill holds `PER_HILL` trees, the first planted at its top and the rest
 * spiralling out from it, as rings grow (the golden angle, so none ever falls in line); when one is full,
 * the next rises beside it, the hills themselves spiralling out from the first. A hill is as wide as its
 * trees need.
 */
export const PER_HILL = 20;
const SPACING = 1.4, GOLD = Math.PI * (3 - Math.sqrt(5));
export interface Hill { x: number; y: number; R: number; n: number }
export interface Place { x: number; y: number; hill: number; scale: number }
export function land(count: number, seed: number): { hills: Hill[]; places: Place[] } {
  const hills: Hill[] = [], places: Place[] = [], a0 = h1(seed * 0.71) * TAU;
  for (let h = 0; h * PER_HILL < Math.max(1, count); h++) {
    const n = Math.min(PER_HILL, count - h * PER_HILL), a = a0 + h * 2.4 + 0.6 * (h1(h * 5.3 + seed) - 0.5), d = h ? 15 * Math.sqrt(h) * (0.92 + 0.16 * h1(h * 3.1 + seed)) : 0;
    hills.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9, R: 2.6 + SPACING * Math.sqrt(Math.max(1, n) + 0.5) * 1.3, n });
  }
  for (let i = 0; i < count; i++) {
    const h = Math.floor(i / PER_HILL), j = i % PER_HILL, H = hills[h], a = a0 + h * 1.3 + j * GOLD;
    const d = SPACING * Math.sqrt(j + 0.04) * (1 + 0.2 * (h1(i * 3 + seed) - 0.5));
    places.push({ x: H.x + Math.cos(a) * d, y: H.y + Math.sin(a) * d * 0.88, hill: h, scale: 0.85 + 0.3 * h1(i * 7.7 + seed) });
  }
  return { hills, places };
}
/** The land's height at a world point: its hills, and the lie of the ground between. */
export function heightAt(x: number, y: number, hills: Hill[], seed: number): number {
  const ox = 30 * h1(seed * 0.013), oy = 30 * h1(seed * 0.029);
  let z = 0;
  for (const [i, H] of hills.entries()) {
    const dx = (x - H.x) / H.R, dy = (y - H.y) / H.R;
    // (Each a little lopsided, its own way: a spur, a shoulder.)
    const sa = h1(i * 2.7 + seed) * TAU, sx = Math.cos(sa) * 0.5, sy = Math.sin(sa) * 0.5;
    z = Math.max(z, Math.exp(-(dx * dx * 1.1 + dy * dy * 1.4) * 1.7) + 0.35 * Math.exp(-((dx - sx) ** 2 * 4 + (dy - sy) ** 2 * 4)));
  }
  return z + 0.12 * (vn(x / 5 + ox, y / 5 + oy) - 0.5) + 0.05 * (vn(x / 1.6 + 9 + ox, y / 1.6) - 0.5);
}
/**
 * The land in contours, drawn by hand (the pen's weight wandering, now and then lifting), its height given
 * at each screen point by `height`, on a canvas `w` × `h` (`seed` for the wander of the pen).
 */
export function drawHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, seed: number): void {
  const step = 3 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1, Z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) Z[j * nx + i] = height(i * step, j * step);
  const SEG: Record<number, [number, number][]> = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] };
  g.save(); g.lineCap = 'round';
  let li = 0;
  for (let L = 0.14; L < 1.2; L += 0.09 + 0.05 * h1(li * 3.7 + seed), li++) {
    const major = li % 4 === 3;
    // (Light, and fainter toward the hill's foot, where it runs out into the field.)
    g.strokeStyle = ink((major ? 0.42 : 0.26) * (0.45 + 0.55 * Math.min(1, (L - 0.1) / 0.35)));
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = Z[j * nx + i], b = Z[j * nx + i + 1], c = Z[(j + 1) * nx + i + 1], d = Z[(j + 1) * nx + i];
      const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * step, y = j * step;
      const e: [number, number][] = [[x + (step * (L - a)) / (b - a), y], [x + step, y + (step * (L - b)) / (c - b)], [x + (step * (L - d)) / (c - d), y + step], [x, y + (step * (L - a)) / (d - a)]];
      for (const [p, q] of SEG[idx]) {
        const mx = (e[p][0] + e[q][0]) / 2, my = (e[p][1] + e[q][1]) / 2;
        if (vn(mx / (40 * U) + li * 7, my / (40 * U)) < (major ? 0.12 : 0.2)) continue;
        g.lineWidth = U * (major ? 0.8 : 0.5) * (0.75 + 0.5 * vn(mx / (25 * U), my / (25 * U) + li));
        g.beginPath(); g.moveTo(e[p][0], e[p][1]); g.lineTo(e[q][0], e[q][1]); g.stroke();
      }
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- the wash
/**
 * Watercolour, over the ink, as an estate map is coloured by hand: ink for what stays, colour for what
 * changes. Each crown a wash of its kind in the season (from the date: spring's fresh green, summer's deep,
 * autumn's turning, winter bare but for the evergreens), laid a little off the ink as a hand lays it,
 * granulating, darker where it dried at its edge. Today's still wet: brighter, a bloom at its edge.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const seasonOf = (d = new Date()): Season => (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as Season[])[d.getMonth()];
const EVER = new Set(['pine', 'redwood', 'bristlecone', 'olive']);
const AUTUMN: Record<string, [number, number, number]> = {
  oak: [158, 104, 58], ash: [196, 166, 82], maple: [192, 86, 52], cherry: [172, 78, 62], birch: [208, 174, 78],
};
function pigment(sp: string, season: Season): [number, number, number] | null {
  if (EVER.has(sp)) return sp === 'olive' ? [138, 146, 112] : sp === 'redwood' ? [92, 112, 84] : [96, 122, 90];
  if (season === 'winter') return null;
  if (season === 'autumn') return AUTUMN[sp] ?? AUTUMN.oak;
  return season === 'spring' ? [154, 178, 112] : [104, 136, 86];
}
/** A crown's wash, laid over its ink (multiplied, as watercolour over a print): `wet` for today's. */
export function washCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, season: Season, wet = false, scale = 1): void {
  // (Painted no larger than some 120 px across its radius, and laid larger: a close look magnifies the
  // wash, never paints millions of pixels afresh.)
  const CAP = 120, up = Math.max(1, r / CAP);
  const w = washOf(r / up, sp, k, U / up, season, wet);
  if (!w) return;
  const sc = scale * up;
  g.save(); g.globalCompositeOperation = 'multiply';
  g.drawImage(w.c, x + (w.ox - w.m) * sc, y + (w.oy - w.m) * sc, w.c.width * sc, w.c.height * sc);
  g.restore();
}
/** A crown's wash, painted once (kept for the last few asked for), to be laid at any size. */
const washes = new Map<string, { c: HTMLCanvasElement; m: number; ox: number; oy: number }>();
function washOf(r: number, sp: string, k: number, U: number, season: Season, wet: boolean) {
  const col = pigment(sp, season);
  if (!col || r < 2) return null;
  const key = `${sp}${k}:${Math.round(r)}:${U}:${season}:${wet}`, got = washes.get(key);
  if (got) return got;
  const E = edgeOf(sp, k + 17), N = E.length - 1, m = Math.ceil(r * 1.5 + 6 * U), size = m * 2;
  const ox = (h1(k * 1.3) - 0.5) * 3 * U, oy = (h1(k * 2.9) - 0.5) * 3 * U;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const cx = c.getContext('2d')!, img = cx.createImageData(size, size), d = img.data;
  const base = wet ? 0.5 : 0.36;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const dx = px - m, dy = py - m, rho = Math.hypot(dx, dy), a = ((Math.atan2(dy, dx) % TAU) + TAU) % TAU;
    const j = (a / TAU) * N, j0 = Math.floor(j), f = j - j0, e = (E[j0] * (1 - f) + E[Math.min(N, j0 + 1)] * f) * r * (0.97 + 0.06 * vn(a * 4 + k, 1));
    if (rho > e) continue;
    const inEdge = e - rho;
    // (Dried darker at its edge; granulating; thinner where the brush ran dry.)
    let al = base * (0.7 + 0.5 * vn((px + k) / (9 * U), py / (9 * U))) * (0.75 + 0.5 * vn(px / (1.1 * U) + k, py / (1.1 * U)));
    al *= 1 + (wet ? 0.9 : 0.55) * Math.max(0, 1 - inEdge / (2.2 * U));
    // (Light falls from the upper left: the wash a touch thinner there.)
    al *= 0.82 + 0.3 * Math.max(0, Math.min(1, 0.5 + 0.5 * ((dx / r) * 0.6 + (dy / r) * 0.8)));
    const o = (py * size + px) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(255 * Math.min(0.85, al));
  }
  cx.putImageData(img, 0, 0);
  // (Still wet: a bloom, where the water crept back and pushed the pigment out.)
  if (wet) { cx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.35)`; cx.lineWidth = 1.4 * U; path(cx, m, m, Math.min(r * 1.08, m - U), edgeOf(sp, k + 29)); cx.stroke(); }
  const out = { c, m, ox, oy };
  washes.set(key, out);
  if (washes.size > 40) washes.delete(washes.keys().next().value!);
  return out;
}
/** The hill's wash: pale, pooling darker in its folds, fading out into the paper at its foot. */
export function washHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, seed: number, season: Season, scale = 1): void {
  const col: [number, number, number] = season === 'winter' ? [176, 172, 150] : season === 'autumn' ? [184, 168, 112] : season === 'spring' ? [168, 182, 122] : [150, 166, 106];
  const step = 4 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1;
  const c = document.createElement('canvas'); c.width = nx; c.height = ny;
  const cx2 = c.getContext('2d')!, img = cx2.createImageData(nx, ny), d = img.data;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * step, y = j * step, z = height(x, y);
    if (z < 0.1) continue;
    // (Pooled in the folds: where the ground turns, a little darker; thin on the tops.)
    const zx = height(x + step, y) - z, zy = height(x, y + step) - z, slope = Math.min(1, (Math.hypot(zx, zy) * 9 * 58) / Math.max(1, scale));
    let al = 0.2 * Math.min(1, (z - 0.1) / 0.25) * (0.6 + 0.6 * slope) * (0.7 + 0.6 * vn(x / (60 * U) + (seed % 50), y / (60 * U)));
    al *= 0.93 + 0.14 * vn(x / (14 * U), y / (14 * U));
    const o = (j * nx + i) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(255 * al);
  }
  cx2.putImageData(img, 0, 0);
  g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, nx * step, ny * step); g.restore();
}
