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

/**
 * A tree's own crown, from its slice: its outline as its bark is (lopsided, lobed: the slice's shape round
 * it, a little stronger), knobbly where it burled, a heavy limb where a branch grew; ragged after uneven
 * years. `id` names it (for what's kept), `shape` the radius round it from the map's own angle (1 its mean,
 * 241 samples), `rough` how ragged its edge.
 */
export interface CrownForm { id: string; shape: Float32Array; rough: number }
/**
 * The light: which way the shadows fall (a unit vector on the sheet), how long (a share of the crown's
 * height), and how strong (0 at night). The default is the slice's own, from the upper left.
 */
export interface Sun { dx: number; dy: number; len: number; strength: number }
export const SUN: Sun = { dx: 0.78, dy: 0.62, len: 0.51, strength: 1 };
/** Its edge, as its kind grows it, then as its own tree is shaped. */
function formed(E: Float32Array, form: CrownForm | undefined, k: number): Float32Array {
  if (!form) return E;
  const out = new Float32Array(E.length), N = E.length - 1;
  for (let j = 0; j <= N; j++) {
    const a = (j / N) * TAU;
    out[j] = E[j] * form.shape[Math.round((j / N) * (form.shape.length - 1))] * (1 + form.rough * (n1(a * 9 + k * 1.3) - 0.5));
  }
  return out;
}
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

/**
 * A crown from above, at (x, y), `r` across (device px), `U` a CSS px; `alpha` to fade it in; `form` its
 * own tree's shape; `sun` the light; `part` its shadow on the ground alone, or the crown alone (to be laid
 * over the ground and stirred by the wind), or both.
 */
export function drawCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, alpha = 1, form?: CrownForm, sun: Sun = SUN, part: 'all' | 'shadow' | 'crown' | 'shade' = 'all'): void {
  if (r < 0.5) return;
  const h = habit(sp), E = formed(edgeOf(sp, k), form, k), SE = formed(edgeOf(sp, k + 3), form, k);
  const sx = x + r * sun.dx * sun.len * h.tall, sy = y + r * sun.dy * sun.len * h.tall;
  const shadeA = Math.atan2(sun.dy, sun.dx);
  // (Its shadow's shape alone, solid: for all the grove's shadows to be hatched as one, never darker where they meet.)
  if (part === 'shade') { path(g, sx, sy, r * 0.96, SE); g.fillStyle = '#000'; g.fill(); return; }
  g.save(); g.globalAlpha *= alpha; g.lineCap = 'round';
  if (r < 7 * U) {
    // (Far off, a crown is a dab: its shadow a tone, the crown paper ringed in ink, a mark or two.)
    if (part !== 'crown') { path(g, sx, sy, r * 0.96, SE); g.fillStyle = ink(0.32 * sun.strength); g.fill(); }
    if (part === 'shadow') { g.restore(); return; }
    path(g, x, y, r, E); g.fillStyle = PAPER; g.fill();
    g.strokeStyle = ink(0.9); g.lineWidth = Math.min(1, r / (4 * U)) * 0.8 * U; g.stroke();
    if (r > 3 * U) { g.fillStyle = ink(0.8); g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, 0.5 * U, 0, TAU); g.arc(x + r * 0.05, y + r * 0.45, 0.4 * U, 0, TAU); g.fill(); }
    g.restore();
    return;
  }
  // Its shadow on the ground, hatched (faint as the light goes).
  if (part !== 'crown' && sun.strength > 0.02) {
    g.save(); path(g, sx, sy, r * 0.96, SE); g.clip();
    g.strokeStyle = ink(0.7 * sun.strength); g.lineWidth = 0.7 * U; g.beginPath();
    for (let d = -r * 3; d < r * 3; d += 2.2 * U) { g.moveTo(sx + d - r * 2, sy - r * 2); g.lineTo(sx + d + r * 2, sy + r * 2); }
    g.stroke(); g.restore();
  }
  if (part === 'shadow') { g.restore(); return; }
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
    const s = Math.max(0, Math.min(1, 0.4 + 0.6 * (((px - x) / r) * sun.dx + ((py - y) / r) * sun.dy)));
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
    const a = (j / M) * TAU, b = ((j + 1) / M) * TAU, sh = 0.5 + 0.5 * Math.cos(a - shadeA);
    if (sh < 0.25 && h1(j * 0.31 + k) < 0.35) continue;
    g.lineWidth = U * (0.35 + 0.8 * sh) * light;
    g.beginPath(); g.moveTo(x + Math.cos(a) * E[j] * r, y + Math.sin(a) * E[j] * r); g.lineTo(x + Math.cos(b) * E[j + 1] * r, y + Math.sin(b) * E[j + 1] * r); g.stroke();
  }
  g.restore();
}

/** A seedling, small: two first leaves on a short stem, a dab of fresh green over them, its little shadow. */
export function drawSeedling(g: CanvasRenderingContext2D, x: number, y: number, r: number, U: number, alpha = 1): void {
  g.save(); g.globalAlpha *= alpha; g.lineCap = 'round';
  const L = Math.max(2.2 * U, r), a = -0.5 + 0.3 * h1(x * 0.13 + y * 0.07);
  g.fillStyle = ink(0.18); g.beginPath(); g.ellipse(x + L * 0.35, y + L * 0.3, L * 0.55, L * 0.25, 0.6, 0, TAU); g.fill();
  for (const s of [-1, 1]) {
    const lx = x + Math.cos(a + (s > 0 ? 0 : Math.PI)) * L * 0.45, ly = y + Math.sin(a + (s > 0 ? 0 : Math.PI)) * L * 0.45;
    g.beginPath(); g.ellipse(lx, ly, L * 0.45, L * 0.24, a, 0, TAU);
    g.fillStyle = 'rgba(150,176,108,0.75)'; g.fill(); g.strokeStyle = ink(0.8); g.lineWidth = 0.6 * U; g.stroke();
  }
  g.fillStyle = ink(0.9); g.beginPath(); g.arc(x, y, 0.7 * U, 0, TAU); g.fill();
  g.restore();
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
const SPACING = 1.85, GOLD = Math.PI * (3 - Math.sqrt(5));
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
export function pigment(sp: string, season: Season): [number, number, number] | null {
  if (EVER.has(sp)) return sp === 'olive' ? [138, 146, 112] : sp === 'redwood' ? [92, 112, 84] : [96, 122, 90];
  if (season === 'winter') return null;
  if (season === 'autumn') return AUTUMN[sp] ?? AUTUMN.oak;
  return season === 'spring' ? [154, 178, 112] : [104, 136, 86];
}
/** A crown's wash, laid over its ink (multiplied, as watercolour over a print): `wet` for today's. */
export function washCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, season: Season, wet = false, scale = 1, form?: CrownForm): void {
  // (Painted no larger than some 120 px across its radius, and laid larger: a close look magnifies the
  // wash, never paints millions of pixels afresh.)
  const CAP = 120, up = Math.max(1, r / CAP);
  const w = washOf(r / up, sp, k, U / up, season, wet, form);
  if (!w) return;
  const sc = scale * up;
  g.save(); g.globalCompositeOperation = 'multiply';
  g.drawImage(w.c, x + (w.ox - w.m) * sc, y + (w.oy - w.m) * sc, w.c.width * sc, w.c.height * sc);
  g.restore();
}
/** A crown's wash, painted once (kept for the last few asked for), to be laid at any size. */
const washes = new Map<string, { c: HTMLCanvasElement; m: number; ox: number; oy: number }>();
function washOf(r: number, sp: string, k: number, U: number, season: Season, wet: boolean, form?: CrownForm) {
  const col = pigment(sp, season);
  if (!col || r < 2) return null;
  const key = `${sp}${k}:${Math.round(r)}:${U}:${season}:${wet}:${form?.id ?? ''}`, got = washes.get(key);
  if (got) return got;
  // (Its own edge, the ink's, kept just inside it, and laid barely off: clean, as a careful hand colours.)
  const E = formed(edgeOf(sp, k), form, k), N = E.length - 1, m = Math.ceil(r * 1.9 + 6 * U), size = m * 2;
  const ox = (h1(k * 1.3) - 0.5) * 1 * U, oy = (h1(k * 2.9) - 0.5) * 1 * U;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const cx = c.getContext('2d')!, img = cx.createImageData(size, size), d = img.data;
  const base = wet ? 0.55 : 0.44;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const dx = px - m, dy = py - m, rho = Math.hypot(dx, dy), a = ((Math.atan2(dy, dx) % TAU) + TAU) % TAU;
    const j = (a / TAU) * N, j0 = Math.floor(j), f = j - j0, e = (E[j0] * (1 - f) + E[Math.min(N, j0 + 1)] * f) * r * (0.93 + 0.04 * vn(a * 4 + k, 1)) - 0.6 * U;
    if (rho > e) continue;
    const inEdge = e - rho;
    // (Dried darker at its edge; granulating; thinner where the brush ran dry.)
    let al = base * (0.82 + 0.3 * vn((px + k) / (9 * U), py / (9 * U))) * (0.9 + 0.2 * vn(px / (1.1 * U) + k, py / (1.1 * U)));
    al *= 1 + (wet ? 0.9 : 0.55) * Math.max(0, 1 - inEdge / (2.2 * U));
    // (Light falls from the upper left: the wash a touch thinner there.)
    al *= 0.82 + 0.3 * Math.max(0, Math.min(1, 0.5 + 0.5 * ((dx / r) * 0.6 + (dy / r) * 0.8)));
    const o = (py * size + px) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(255 * Math.min(0.85, al));
  }
  cx.putImageData(img, 0, 0);
  // (Still wet: a bloom, where the water crept back and pushed the pigment out.)
  if (wet) { cx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.35)`; cx.lineWidth = 1.4 * U; path(cx, m, m, Math.min(r * 1.08, m - U), formed(edgeOf(sp, k + 29), form, k)); cx.stroke(); }
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

// ---------------------------------------------------------------- the ground's own record
/** Snow, in winter, lying on the high ground and the hill's tops: the paper whiter there, softly. */
export function snowHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number): void {
  const step = 5 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1;
  const c = document.createElement('canvas'); c.width = nx; c.height = ny;
  const cx = c.getContext('2d')!, img = cx.createImageData(nx, ny), d = img.data;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = height(i * step, j * step), al = Math.max(0, Math.min(1, (z - 0.35) / 0.4)) * (0.55 + 0.45 * vn(i * 0.4, j * 0.4));
    const o = (j * nx + i) * 4; d[o] = 253; d[o + 1] = 252; d[o + 2] = 250; d[o + 3] = Math.round(255 * 0.75 * al);
  }
  cx.putImageData(img, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, nx * step, ny * step); g.restore();
}
/** Moss, between trees long standing: a soft green-grey wash where it's thickest, a few fine flecks in it. */
export function drawMoss(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, amount: number, U: number, seed: number): void {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / Math.max(1e-3, rx));
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(122,142,98,${(0.22 * amount).toFixed(3)})`); gr.addColorStop(0.6, `rgba(122,142,98,${(0.1 * amount).toFixed(3)})`); gr.addColorStop(1, 'rgba(122,142,98,0)');
  g.globalCompositeOperation = 'multiply'; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over'; g.scale(1, rx / Math.max(1e-3, ry));
  const n = Math.round(Math.min(160, (rx * ry) / (U * U) * 0.05 * amount));
  for (let q = 0; q < n; q++) {
    const a = h1(seed + q * 1.37) * TAU, f = Math.sqrt(h1(seed * 1.7 + q * 2.11)) * 0.7, px = Math.cos(a) * rx * f, py = Math.sin(a) * ry * f;
    g.fillStyle = `rgba(88,104,70,${0.3 + 0.2 * h1(q)})`;
    g.beginPath(); g.arc(px, py, (0.3 + 0.3 * h1(q * 3.3)) * U, 0, TAU); g.fill();
  }
  g.restore();
}
/** A path worn through the grass to a tree often visited: a pale track, its edges dotted where it's trodden. */
/**
 * A footpath, as it lies on the ground: bare earth between grassy edges, wider at the bends (corners cut) and where
 * paths meet (`wide`, per point), thinning into the grass at both ends. Walked often (`wear`, 0..1), a darker line
 * packed down its middle; left (`grown`, 0..1), the grass comes back in patches, closing over it in stretches.
 */
export function drawTrack(g: CanvasRenderingContext2D, pts: [number, number][], width: number, U: number, seed: number, o: { wear?: number; grown?: number; wide?: number[] } = {}): void {
  const n = pts.length;
  if (n < 2) return;
  const wear = o.wear ?? 0, grown = o.grown ?? 0;
  // (Along it: distance, direction, how sharply it bends.)
  const s = [0], tx: number[] = [], ty: number[] = [];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = s[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    tx.push(dx / l); ty.push(dy / l);
  }
  const bend = pts.map((_, i) => {
    const j = Math.max(0, i - 2), k = Math.min(n - 1, i + 2);
    return Math.min(1, Math.abs(tx[j] * ty[k] - ty[j] * tx[k]) * 1.6);
  });
  const sm = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  // (Where the grass has come back: patches, the first ones small, joining as it's left longer.)
  const cover = s.map((d) => grown <= 0 ? 0 : sm((grown * 1.25 - n1(d / (width * 2.2) + seed * 3.1)) / 0.12));
  const wAt = s.map((d, i) => {
    const ends = sm(d / (width * 1.6)) * sm((len - d) / (width * 1.6));
    return width * (0.82 + 0.3 * n1(d / (width * 1.3) + seed)) * (1 + 0.45 * bend[i]) * (o.wide?.[i] ?? 1) * (0.12 + 0.88 * ends) * (1 - cover[i]);
  });
  const side = (k: number, f = 1): [number, number][] => pts.map((p, i) => [p[0] - ty[i] * wAt[i] * 0.5 * f * k, p[1] + tx[i] * wAt[i] * 0.5 * f * k]);
  const L = side(1), R = side(-1);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // The bare earth: paper, then a faint warm wash.
  g.beginPath(); g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (let i = n - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath();
  g.fillStyle = 'rgba(244,239,228,0.9)'; g.fill();
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(180,164,130,${(0.24 + 0.12 * wear).toFixed(3)})`; g.fill();
  // Packed down the middle, where it's walked: a broken darker line, wandering a little.
  if (wear > 0.05) {
    g.strokeStyle = `rgba(118,102,84,${(0.2 * wear).toFixed(3)})`;
    for (let i = 1; i < n; i++) {
      if (n1(s[i] / (width * 0.9) + seed * 1.7) < 0.3 || cover[i] > 0.3) continue;
      const off = (n1(s[i] / (width * 2) + seed) - 0.5) * wAt[i] * 0.3, off0 = (n1(s[i - 1] / (width * 2) + seed) - 0.5) * wAt[i - 1] * 0.3;
      g.lineWidth = Math.max(0.5 * U, wAt[i] * 0.16);
      g.beginPath(); g.moveTo(pts[i - 1][0] - ty[i - 1] * off0, pts[i - 1][1] + tx[i - 1] * off0); g.lineTo(pts[i][0] - ty[i] * off, pts[i][1] + tx[i] * off); g.stroke();
    }
  }
  g.globalCompositeOperation = 'source-over';
  // The grass at its edges: short blades rooted just outside, leaning in, uneven, here and there none.
  const step = 2 * U;
  for (const k of [1, -1]) {
    let i = 0;
    for (let d = step * h1(seed + k); d < len; d += step * (0.6 + 0.8 * h1(d * 0.37 + seed + k))) {
      while (i < n - 2 && s[i + 1] < d) i++;
      const f = Math.min(1, (d - s[i]) / ((s[i + 1] - s[i]) || 1));
      const lerp = (a: number[], b: number[]) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const c = lerp(pts[i], pts[i + 1]), w = wAt[i] + (wAt[i + 1] - wAt[i]) * f, cv = cover[i];
      if (w < 0.6 * U && cv < 0.5) continue;
      if (n1(d / (9 * U) + seed * 2.3 + k) < 0.4 || h1(d * 5.7 + seed + k) < 0.25) continue;
      const nx = -ty[i] * k, ny = tx[i] * k, r = h1(d * 1.3 + seed * 5 + k);
      const blade = Math.min(U * 2.2, Math.max(U * 0.8, width * 0.45)), base = w * 0.5 + blade * (0.2 + 0.4 * r), tip = w * 0.5 - blade * (0.3 + 0.6 * h1(d * 2.1 + seed + k)) * (1 + cv);
      const lean = (h1(d * 0.71 + seed + k * 3) - 0.5) * 1.6 * blade;
      g.strokeStyle = ink(0.2 + 0.25 * h1(d * 3.3 + seed + k)); g.lineWidth = U * (0.3 + 0.3 * h1(d * 4.1 + seed));
      g.beginPath(); g.moveTo(c[0] + nx * base, c[1] + ny * base);
      g.quadraticCurveTo(c[0] + nx * (base + tip) * 0.5 + tx[i] * lean * 0.3, c[1] + ny * (base + tip) * 0.5 + ty[i] * lean * 0.3, c[0] + nx * tip + tx[i] * lean, c[1] + ny * tip + ty[i] * lean);
      g.stroke();
    }
  }
  // And grown back across it: tufts in the middle where the grass has returned.
  if (grown > 0) {
    for (let d = 0; d < len; d += 2.2 * U) {
      let i = 0; while (i < n - 2 && s[i + 1] < d) i++;
      const cv = cover[i];
      if (cv < 0.2 || h1(d * 0.9 + seed) > cv * 0.8) continue;
      const across = (h1(d * 1.9 + seed * 7) - 0.5) * width * 0.9, x = pts[i][0] - ty[i] * across, y = pts[i][1] + tx[i] * across;
      g.strokeStyle = ink(0.25 + 0.25 * h1(d + seed)); g.lineWidth = 0.4 * U;
      g.beginPath();
      for (let b = -1; b <= 1; b++) { g.moveTo(x + b * 0.8 * U, y + 0.6 * U); g.lineTo(x + b * 1.4 * U, y - (1 + 0.8 * h1(d + b)) * U); }
      g.stroke();
    }
  }
  g.restore();
}
/** A stream winding through the low ground: paper between its banks, a cool wash, its banks inked, broken now and then. */
export function drawStream(g: CanvasRenderingContext2D, pts: [number, number][], width: number, U: number, seed: number): void {
  if (pts.length < 2) return;
  const wAt = (i: number) => width * (0.8 + 0.4 * n1(i * 0.35 + seed));
  const side = (s: number): [number, number][] => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * wAt(i) * 0.5 * s, p[1] + (dx / l) * wAt(i) * 0.5 * s];
  });
  const L = side(1), R = side(-1);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (let i = R.length - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath();
  g.fillStyle = 'rgb(244,239,228)'; g.fill();
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(150,176,190,0.45)'; g.fill(); g.globalCompositeOperation = 'source-over';
  // (Ripples, a few, along it.)
  g.strokeStyle = 'rgba(92,110,120,0.45)'; g.lineWidth = 0.5 * U;
  for (let i = 2; i < pts.length - 2; i += 3) { if (h1(i + seed) < 0.5) continue; const p = pts[i], q = pts[i + 1]; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (q[0] - p[0]) * 0.6, p[1] + (q[1] - p[1]) * 0.6); g.stroke(); }
  for (const bank of [L, R]) {
    g.strokeStyle = ink(0.75);
    for (let i = 1; i < bank.length; i++) {
      if (n1(i * 0.5 + seed + bank[0][0]) < 0.18) continue;
      g.lineWidth = U * (0.5 + 0.5 * n1(i * 0.3 + seed)); g.beginPath(); g.moveTo(...bank[i - 1]); g.lineTo(...bank[i]); g.stroke();
    }
  }
  g.restore();
}
/** A low wall of field stones, laid along a field's edge: small rounded stones, inked, touching. */
export function drawWall(g: CanvasRenderingContext2D, pts: [number, number][], U: number, seed: number): void {
  g.save();
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], l = Math.hypot(bx - ax, by - ay);
    for (let d = carry; d < l; ) {
      const s = (1.3 + 1.1 * h1(seed + i * 7 + d)) * U, f = d / l, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      g.beginPath(); g.ellipse(x, y, s, s * (0.7 + 0.25 * h1(d + i)), Math.atan2(by - ay, bx - ax) + (h1(d * 3 + i) - 0.5) * 0.6, 0, TAU);
      g.fillStyle = 'rgb(240,234,222)'; g.fill(); g.strokeStyle = ink(0.7); g.lineWidth = 0.55 * U; g.stroke();
      d += s * 1.8; carry = d - l;
    }
  }
  g.restore();
}
