import * as gpu from './gpu';
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
  fir: { clumps: 0, spread: 0, rough: 0.07, tip: 0.13, size: 0.58, tall: 1.8, marks: 0.6, squash: 1 },
  juniper: { clumps: 0, spread: 0, rough: 0.2, tip: 0.18, size: 0.5, tall: 0.6, marks: 0.5, squash: 0.85 },
};
const habit = (sp: string) => HABIT[sp] ?? HABIT.oak;
const CONIFER = new Set(['pine', 'redwood', 'bristlecone', 'fir', 'juniper']);
/** How big a crown is for its kind and its days (a year's, full size), as a share of a full oak's. */
export const crownSize = (sp: string, days: number) => habit(sp).size * (0.45 + 0.55 * Math.sqrt(Math.min(1.2, days / 365)));

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
/** A crown's shadow's shape alone (see drawCrown's `sweep`), as a path to be gathered with the others'. */
export function shadeOf(x: number, y: number, r: number, sp: string, k: number, form?: CrownForm, sun: Sun = SUN): Path2D {
  const h = habit(sp), SE = formed(edgeOf(sp, k + 3), form, k), sx = x + r * sun.dx * sun.len * h.tall, sy = y + r * sun.dy * sun.len * h.tall, P = new Path2D();
  for (const f of [0.25, 0.45, 0.65, 0.82, 1]) {
    const N2 = SE.length - 1, ox = x + (sx - x) * f, oy = y + (sy - y) * f, rr = r * 0.96 * (0.85 + 0.15 * f);
    for (let j = 0; j <= N2; j++) { const a = (j / N2) * TAU, px2 = ox + Math.cos(a) * SE[j] * rr, py2 = oy + Math.sin(a) * SE[j] * rr; if (j) P.lineTo(px2, py2); else P.moveTo(px2, py2); }
    P.closePath();
  }
  return P;
}
export function drawCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, alpha = 1, form?: CrownForm, sun: Sun = SUN, part: 'all' | 'shadow' | 'crown' | 'shade' = 'all'): void {
  if (r < 0.5) return;
  const h = habit(sp), E = formed(edgeOf(sp, k), form, k), SE = formed(edgeOf(sp, k + 3), form, k);
  const sx = x + r * sun.dx * sun.len * h.tall, sy = y + r * sun.dy * sun.len * h.tall;
  const shadeA = Math.atan2(sun.dy, sun.dx);
  // (Its shadow's shape alone, solid: for all the grove's shadows to be hatched as one, never darker where they meet.)
  // (A shadow is the crown's shape drawn out along the light from where the tree stands, never a copy of it
  // set down apart: long at evening, it still runs from the trunk.)
  const sweep = () => { g.beginPath(); for (const f of [0.25, 0.45, 0.65, 0.82, 1]) { const N2 = SE.length - 1, ox = x + (sx - x) * f, oy = y + (sy - y) * f, rr = r * 0.96 * (0.85 + 0.15 * f);
    for (let j = 0; j <= N2; j++) { const a = (j / N2) * TAU, px2 = ox + Math.cos(a) * SE[j] * rr, py2 = oy + Math.sin(a) * SE[j] * rr; if (j) g.lineTo(px2, py2); else g.moveTo(px2, py2); } g.closePath(); } };
  if (part === 'shade') { sweep(); g.fillStyle = '#000'; g.fill('nonzero'); return; }
  g.save(); g.globalAlpha *= alpha; g.lineCap = 'round';
  if (r < 7 * U) {
    // (Far off, a crown is a dab: its shadow a tone, the crown paper ringed in ink, a mark or two.)
    if (part !== 'crown') { sweep(); g.fillStyle = ink(0.32 * sun.strength); g.fill(); }
    if (part === 'shadow') { g.restore(); return; }
    path(g, x, y, r, E); g.fillStyle = PAPER; g.fill();
    g.strokeStyle = ink(0.9); g.lineWidth = Math.min(1, r / (4 * U)) * 0.8 * U; g.stroke();
    if (r > 3 * U) { g.fillStyle = ink(0.8); g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, 0.5 * U, 0, TAU); g.arc(x + r * 0.05, y + r * 0.45, 0.4 * U, 0, TAU); g.fill(); }
    g.restore();
    return;
  }
  // Its shadow on the ground, hatched (faint as the light goes).
  if (part !== 'crown' && sun.strength > 0.02) {
    g.save(); sweep(); g.clip();
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
  // (Its edge as leaves make it: small scallops round a broadleaf's masses, never a smooth blob; a conifer's
  // its tufts, as its kind gives them.)
  const conifer = CONIFER.has(sp), M = E.length - 1, big = Math.min(1, r / (14 * U));
  const nb = Math.max(14, Math.min(120, Math.round((TAU * r) / (4.5 * U))));
  const S = new Float32Array(M + 1);
  for (let j = 0; j <= M; j++) {
    const a = (j / M) * TAU, sc = conifer ? 0 : 0.07 * (Math.abs(Math.sin((a * nb) / 2 + k)) ** 0.6 - 0.7) * (0.6 + 0.8 * h1(Math.floor((a * nb) / TAU) + k));
    S[j] = E[j] * (1 + sc * big);
  }
  path(g, x, y, r, S); g.fillStyle = PAPER; g.fill();
  g.save(); path(g, x, y, r, S); g.clip();
  g.strokeStyle = ink(1); g.fillStyle = ink(1); g.lineCap = 'round';
  // (Within it, its masses: the shaded side of each, a broken scalloped line, so the crown has depth.)
  if (!conifer && r > 10 * U) {
    const masses = 3 + Math.floor(h1(k * 1.9) * 4) + Math.floor(r / (30 * U));
    for (let i = 0; i < masses; i++) {
      const a = h1(k + i * 3.3) * TAU, rr = r * (0.15 + 0.5 * Math.sqrt(h1(k * 2 + i))), mr = r * (0.22 + 0.16 * h1(i * 1.7 + k));
      const cx = x + Math.cos(a) * rr, cy = y + Math.sin(a) * rr, steps = Math.max(8, Math.round(mr / (1.5 * U)));
      g.lineWidth = 0.55 * U; g.strokeStyle = ink(0.55);
      g.beginPath();
      for (let q = 0; q <= steps; q++) {
        const t = shadeA - 1.3 + (2.6 * q) / steps, bump = 1 + 0.08 * Math.abs(Math.sin(q * 1.9 + i));
        const px2 = cx + Math.cos(t) * mr * bump, py2 = cy + Math.sin(t) * mr * bump;
        if (q && h1(i * 11 + q) > 0.18) g.lineTo(px2, py2); else g.moveTo(px2, py2);
      }
      g.stroke();
    }
    g.strokeStyle = ink(1);
  }
  // Its marks, thickening toward the lower right, where it turns from the light: a broadleaf's leaf-clumps,
  // each a few small scallops, and looked into, single leaves; a conifer's needles, out from its heart.
  const N = Math.min(1800, Math.round(((r * r) / (U * U)) * h.marks * (conifer ? 1.3 : 2.2))), leafy = conifer ? 0 : Math.max(0, Math.min(1, (r / U - 45) / 40));
  for (let i = 0; i < N; i++) {
    const a = h1(k * 7 + i * 1.37) * TAU, rr = r * Math.sqrt(h1(k * 3 + i * 2.17)), px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    const s = Math.max(0, Math.min(1, 0.4 + 0.6 * (((px - x) / r) * sun.dx + ((py - y) / r) * sun.dy)));
    if (h1(i * 5.1 + k) > (0.1 + s) ** 2 * 1.1) continue;
    g.beginPath();
    if (conifer) {
      // (A needle spray: a short twig out from the heart, its needles to either side.)
      const ra = Math.atan2(py - y, px - x) + (h1(i) - 0.5) * 0.5, L = U * (1.8 + 2.4 * h1(i * 3));
      const ex = px + Math.cos(ra) * L, ey = py + Math.sin(ra) * L;
      g.lineWidth = (0.35 + 0.35 * s) * U; g.moveTo(px, py); g.lineTo(ex, ey);
      if (r > 18 * U) for (let q = 1; q <= 3; q++) { const f = q / 4, nx = px + (ex - px) * f, ny = py + (ey - py) * f, nl = 0.9 * U * (1 - f * 0.5);
        g.moveTo(nx, ny); g.lineTo(nx + Math.cos(ra + 0.9) * nl, ny + Math.sin(ra + 0.9) * nl); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(ra - 0.9) * nl, ny + Math.sin(ra - 0.9) * nl); }
      g.stroke();
    } else if (h1(i * 2.9 + k) < leafy) {
      // (A leaf, looked into: a small almond, outlined, its shaded half inked.)
      const la = h1(i * 9) * TAU, L = U * (1.4 + 1.2 * h1(i * 3)), w = L * 0.42;
      g.save(); g.translate(px, py); g.rotate(la); g.lineWidth = 0.4 * U;
      g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -w, L / 2, 0); g.quadraticCurveTo(0, w, -L / 2, 0); g.stroke();
      if (s > 0.55) { g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, w, L / 2, 0); g.closePath(); g.fill(); }
      g.restore();
    } else {
      // (A leaf-clump: two or three small scallops side by side, open toward the light.)
      const cr = U * (sp === 'oak' ? 0.5 + 0.55 * h1(i * 3) : 0.4 + 0.45 * h1(i * 3)), tilt = shadeA - Math.PI / 2 + (h1(i * 7) - 0.5) * 1.4;
      const many = sp === 'birch' ? 1 : 2 + (h1(i * 4.3) < 0.4 ? 1 : 0);
      g.lineWidth = (0.22 + 0.4 * s * s) * U;
      for (let q = 0; q < many; q++) {
        const ox = Math.cos(tilt) * cr * 1.7 * (q - (many - 1) / 2), oy = Math.sin(tilt) * cr * 1.7 * (q - (many - 1) / 2);
        g.moveTo(px + ox + Math.cos(tilt) * cr, py + oy + Math.sin(tilt) * cr);
        g.arc(px + ox, py + oy, cr, tilt + 0.2, tilt + Math.PI - 0.2 - 0.6 * h1(i * 3.1 + q));
      }
      g.stroke();
    }
  }
  g.restore();
  // Its outline, by hand: heavier on the shade side, broken now and then toward the light.
  const light = sp === 'birch' || sp === 'olive' ? 0.6 : 1;
  g.strokeStyle = ink(1);
  for (let j = 0; j < M; j++) {
    const a = (j / M) * TAU, b = ((j + 1) / M) * TAU, sh = 0.5 + 0.5 * Math.cos(a - shadeA);
    if (sh < 0.3 && n1(j * 0.09 + k) < 0.4) continue;
    g.lineWidth = U * (0.25 + 0.6 * sh * sh) * light;
    g.beginPath(); g.moveTo(x + Math.cos(a) * S[j] * r, y + Math.sin(a) * S[j] * r); g.lineTo(x + Math.cos(b) * S[j + 1] * r, y + Math.sin(b) * S[j + 1] * r); g.stroke();
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
const SPACING = 1.45, GOLD = Math.PI * (3 - Math.sqrt(5));
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
/**
 * Where a point on the canvas lies on the ground, in the pixels of the grove seen whole: so the pen's
 * wander and the wash's mottle belong to the ground, the same however close it's looked at. (Without it, the
 * canvas's own pixels.)
 */
export type Ref = (x: number, y: number) => [number, number];
const SAME: Ref = (x, y) => [x, y];
export function drawHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, seed: number, ref: Ref = SAME): void {
  const step = 3 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1, Z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) Z[j * nx + i] = height(i * step, j * step);
  const SEG: Record<number, [number, number][]> = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] };
  // (Each level one line, laid in one stroke so it never beads where its pieces meet; fewer of them, fine and
  // pale, broken only now and then, in long stretches; every fourth a little firmer.)
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  let li = 0;
  for (let L = 0.16; L < 1.2; L += 0.13 + 0.06 * h1(li * 3.7 + seed), li++) {
    const major = li % 4 === 3;
    g.strokeStyle = ink((major ? 0.3 : 0.17) * (0.45 + 0.55 * Math.min(1, (L - 0.1) / 0.35)));
    g.lineWidth = U * (major ? 0.7 : 0.45);
    g.beginPath();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = Z[j * nx + i], b = Z[j * nx + i + 1], c = Z[(j + 1) * nx + i + 1], d = Z[(j + 1) * nx + i];
      const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * step, y = j * step;
      const e: [number, number][] = [[x + (step * (L - a)) / (b - a), y], [x + step, y + (step * (L - b)) / (c - b)], [x + (step * (L - d)) / (c - d), y + step], [x, y + (step * (L - a)) / (d - a)]];
      for (const [p, q] of SEG[idx]) {
        const [mx, my] = ref((e[p][0] + e[q][0]) / 2, (e[p][1] + e[q][1]) / 2);
        if (vn(mx / (110 * U) + li * 7, my / (110 * U)) < (major ? 0.1 : 0.16)) continue;
        g.moveTo(e[p][0], e[p][1]); g.lineTo(e[q][0], e[q][1]);
      }
    }
    g.stroke();
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
const EVER = new Set(['pine', 'redwood', 'bristlecone', 'olive', 'fir', 'juniper']);
const AUTUMN: Record<string, [number, number, number]> = {
  oak: [158, 104, 58], ash: [196, 166, 82], maple: [192, 86, 52], cherry: [172, 78, 62], birch: [208, 174, 78],
};
export function pigment(sp: string, season: Season): [number, number, number] | null {
  if (EVER.has(sp)) return sp === 'olive' ? [138, 146, 112] : sp === 'redwood' ? [92, 112, 84] : sp === 'fir' ? [78, 106, 80] : sp === 'juniper' ? [112, 132, 116] : [96, 122, 90];
  if (season === 'winter') return null;
  if (season === 'autumn') return AUTUMN[sp] ?? AUTUMN.oak;
  return season === 'spring' ? [154, 178, 112] : [104, 136, 86];
}
/** A crown's wash, laid over its ink (multiplied, as watercolour over a print): `wet` for today's. */
/** A wood tree's wash: one flat tone of its kind, inside its ink, cheap enough for many. */
export function washFlat(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, season: Season, alpha: number): void {
  const col = pigment(sp, season);
  if (!col || r < 2) return;
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.4 * alpha).toFixed(3)})`;
  path(g, x, y, r * 0.95, edgeOf(sp, k)); g.fill(); g.restore();
}
export function washCrown(g: CanvasRenderingContext2D, x: number, y: number, r: number, sp: string, k: number, U: number, season: Season, wet = false, scale = 1, form?: CrownForm): void {
  // (Painted no larger than some 120 px across its radius, and laid larger: a close look magnifies the
  // wash, never paints millions of pixels afresh.)
  // (And painted at one of a few sizes, a step apart, so a look closer or further reuses one already painted.)
  // (On the graphics chip, painted larger: it costs next to nothing there, and holds up looked into.)
  const CAP = gpu.ready() ? 360 : 120, rq = Math.min(CAP, 2 ** (Math.round(Math.log2(Math.max(2, r)) * 2) / 2)), up = r / rq;
  const w = washOf(rq, sp, k, U / up, season, wet, form);
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
  const key = `${sp}${k}:${Math.round(r)}:${U.toFixed(2)}:${season}:${wet}:${form?.id ?? ''}`, got = washes.get(key);
  if (got) return got;
  // (Its own edge, the ink's, kept just inside it, and laid barely off: clean, as a careful hand colours.)
  const E = formed(edgeOf(sp, k), form, k), N = E.length - 1, m = Math.ceil(r * 1.9 + 6 * U), size = m * 2;
  const ox = (h1(k * 1.3) - 0.5) * 1 * U, oy = (h1(k * 2.9) - 0.5) * 1 * U;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const cx = c.getContext('2d')!, img = cx.createImageData(size, size), d = img.data;
  const base = wet ? 0.55 : 0.44;
  // (Only within the edge's farthest reach: the square's corners left bare without asking.)
  let far = 0; for (const v of E) far = Math.max(far, v);
  const reach = far * r * 0.97, y0 = Math.max(0, Math.floor(m - reach)), y1 = Math.min(size, Math.ceil(m + reach) + 1);
  // (On the graphics chip, where there is one: the same wash, every pixel at once.)
  const pic = gpu.ready() ? gpu.run('wash', size, size, { uN: N }, { uH: size, uR: r, uU: U, uK: k, uBase: base, uWet: wet ? 1 : 0, uM: m, uReach: reach, uColRGB: [col[0] / 255, col[1] / 255, col[2] / 255] }, { uE: { name: 'E', data: E } }) : null;
  if (pic) gpu.lay(cx, pic, 0, 0);
  else for (let py = y0; py < y1; py++) {
    const half = Math.sqrt(Math.max(0, reach * reach - (py - m) ** 2)), x0 = Math.max(0, Math.floor(m - half)), x1 = Math.min(size, Math.ceil(m + half) + 1);
    for (let px = x0; px < x1; px++) {
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
  }
  if (!pic) cx.putImageData(img, 0, 0);
  // (Still wet: a bloom, where the water crept back and pushed the pigment out.)
  if (wet) { cx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.35)`; cx.lineWidth = 1.4 * U; path(cx, m, m, Math.min(r * 1.08, m - U), formed(edgeOf(sp, k + 29), form, k)); cx.stroke(); }
  const out = { c, m, ox, oy };
  washes.set(key, out);
  if (washes.size > 160) washes.delete(washes.keys().next().value!);
  return out;
}
/**
 * The whole ground at once on the graphics chip, where there is one: the hill's wash, its snow, the meadow and
 * the contours, as washHill, snowHill, drawMeadow and drawHill draw them (by `cam`, the world as drawn here,
 * and `whole`, as seen whole). False where there's no chip, to be drawn by those instead.
 */
type Cam = { X0: number; Y0: number; S: number };
export function groundGpu(g: CanvasRenderingContext2D, w: number, h: number, U: number, cam: Cam, whole: Cam, hills: Hill[], seed: number, season: Season): boolean {
  if (!gpu.ready()) return false;
  const rs = whole.S / cam.S, HL = Math.min(64, hills.length), hl = new Float32Array(64 * 4), sp = new Float32Array(64 * 2);
  for (let i = 0; i < HL; i++) { const H = hills[i], sa = h1(i * 2.7 + seed) * TAU; hl.set([H.x, H.y, H.R, 0], i * 4); sp.set([Math.cos(sa) * 0.5, Math.sin(sa) * 0.5], i * 2); }
  const lv = new Float32Array(16), major = new Float32Array(16);
  let n = 0;
  for (let L = 0.16, li = 0; L < 1.2 && n < 16; L += 0.13 + 0.06 * h1(li * 3.7 + seed), li++, n++) { lv[n] = L; major[n] = li % 4 === 3 ? 1 : 0; }
  const col = season === 'winter' ? [176, 172, 150] : season === 'autumn' ? [184, 168, 112] : season === 'spring' ? [168, 182, 122] : [150, 166, 106];
  const pic = gpu.run('ground', w, h, { uHillN: HL, uLvN: n, uSnow: season === 'winter' ? 1 : 0 },
    { 'uHill#4': hl, 'uSpur#2': sp, uLv: lv, uLvMajor: major, uH: h, uU: U, uCamX0: cam.X0, uCamY0: cam.Y0, uCamS: cam.S, uRs: rs, uRx0: whole.X0 - cam.X0 * rs, uRy0: whole.Y0 - cam.Y0 * rs,
      uOx: 30 * h1(seed * 0.013), uOy: 30 * h1(seed * 0.029), uSeedMod: seed % 50, uWholeS: whole.S, uSeed37: seed * 0.37, uTufts: Math.max(0, Math.min(1, (1 / rs - 1.5) / 1.5)), uKz: 1 / rs,
      uWashRGB: [col[0] / 255, col[1] / 255, col[2] / 255] }, {});
  if (!pic) return false;
  g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; gpu.lay(g, pic, 0, 0); g.restore();
  return true;
}
/** The hill's wash: pale, pooling darker in its folds, fading out into the paper at its foot. */
export function washHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, seed: number, season: Season, scale = 1, ref: Ref = SAME): void {
  const col: [number, number, number] = season === 'winter' ? [176, 172, 150] : season === 'autumn' ? [184, 168, 112] : season === 'spring' ? [168, 182, 122] : [150, 166, 106];
  const step = 4 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1;
  const c = document.createElement('canvas'); c.width = nx; c.height = ny;
  const cx2 = c.getContext('2d')!, img = cx2.createImageData(nx, ny), d = img.data;
  // (How much larger the ground is drawn here than seen whole: its folds measured the same either way.)
  const big = step / Math.max(1e-6, Math.hypot(ref(step, 0)[0] - ref(0, 0)[0], ref(step, 0)[1] - ref(0, 0)[1])), base = scale / big;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * step, y = j * step, z = height(x, y);
    if (z < 0.1) continue;
    // (Pooled in the folds: where the ground turns, a little darker; thin on the tops.)
    const zx = height(x + step, y) - z, zy = height(x, y + step) - z, slope = Math.min(1, (Math.hypot(zx, zy) * big * 9 * 58) / Math.max(1, base));
    const [rx, ry] = ref(x, y);
    let al = 0.2 * Math.min(1, (z - 0.1) / 0.25) * (0.6 + 0.6 * slope) * (0.7 + 0.6 * vn(rx / (60 * U) + (seed % 50), ry / (60 * U)));
    al *= 0.93 + 0.14 * vn(rx / (14 * U), ry / (14 * U));
    const o = (j * nx + i) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(255 * al);
  }
  cx2.putImageData(img, 0, 0);
  g.save(); g.globalCompositeOperation = 'multiply'; g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, nx * step, ny * step); g.restore();
}

/**
 * The meadow: a fine stipple over the ground, thicker in the low ground and thin on the hill's tops, each speck
 * in its own place on the ground; looked into, the specks are tufts of grass, a few blades each.
 */
export function drawMeadow(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, seed: number, ref: Ref = SAME): void {
  // (The ground's place for each point on the canvas, and back.)
  const [ox, oy] = ref(0, 0), [ax, ay] = ref(1, 0), [bx, by] = ref(0, 1), det = (ax - ox) * (by - oy) - (bx - ox) * (ay - oy);
  const back = (X: number, Y: number): [number, number] => [((X - ox) * (by - oy) - (Y - oy) * (bx - ox)) / det, ((Y - oy) * (ax - ox) - (X - ox) * (ay - oy)) / det];
  const k = 1 / Math.max(1e-6, Math.hypot(ax - ox, ay - oy));
  const G = 6 * U, xs = [ox, ref(w, 0)[0], ref(0, h)[0], ref(w, h)[0]], ys = [oy, ref(w, 0)[1], ref(0, h)[1], ref(w, h)[1]];
  const gx0 = Math.floor(Math.min(...xs) / G), gx1 = Math.ceil(Math.max(...xs) / G), gy0 = Math.floor(Math.min(...ys) / G), gy1 = Math.ceil(Math.max(...ys) / G);
  const tufts = Math.max(0, Math.min(1, (k - 1.5) / 1.5));
  g.save(); g.fillStyle = ink(0.32); g.strokeStyle = ink(0.4); g.lineCap = 'round';
  const dots = new Path2D(), blades = new Path2D();
  for (let j = gy0; j <= gy1; j++) for (let i = gx0; i <= gx1; i++) {
    const hh = h1(i * 127.1 + j * 311.7 + seed * 0.37);
    const X = (i + h1(hh * 91.7)) * G, Y = (j + h1(hh * 53.3)) * G, [x, y] = back(X, Y);
    if (x < -4 * U || y < -4 * U || x > w + 4 * U || y > h + 4 * U) continue;
    const z = height(x, y), dense = 0.05 + 0.2 * (1 - Math.min(1, Math.max(0, (z - 0.05) / 0.6)));
    if (hh > dense) continue;
    if (tufts > 0 && h1(hh * 17.9) < 0.7) {
      const L = U * (0.9 + 0.9 * h1(hh * 7.7)) * Math.min(k, 3) * 0.7;
      for (let q = -1; q <= 1; q++) { const a = -Math.PI / 2 + q * 0.45 + (h1(hh * 3 + q) - 0.5) * 0.3; blades.moveTo(x + q * 0.4 * U, y); blades.lineTo(x + q * 0.4 * U + Math.cos(a) * L * (q ? 0.8 : 1), y + Math.sin(a) * L * (q ? 0.8 : 1)); }
    } else {
      const r = U * (0.25 + 0.25 * h1(hh * 29.1)); dots.moveTo(x + r, y); dots.arc(x, y, r, 0, TAU);
    }
  }
  g.fill(dots); g.globalAlpha = tufts; g.lineWidth = 0.4 * U; g.stroke(blades);
  g.restore();
}

// ---------------------------------------------------------------- the ground's own record
/** Snow, in winter, lying on the high ground and the hill's tops: the paper whiter there, softly. */
export function snowHill(g: CanvasRenderingContext2D, w: number, h: number, U: number, height: (x: number, y: number) => number, ref: Ref = SAME): void {
  const step = 5 * U, nx = Math.ceil(w / step) + 1, ny = Math.ceil(h / step) + 1;
  const c = document.createElement('canvas'); c.width = nx; c.height = ny;
  const cx = c.getContext('2d')!, img = cx.createImageData(nx, ny), d = img.data;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [rx, ry] = ref(i * step, j * step), z = height(i * step, j * step), al = Math.max(0, Math.min(1, (z - 0.35) / 0.4)) * (0.55 + 0.45 * vn(rx / (12.5 * U), ry / (12.5 * U)));
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
 * A footpath, as an engraved plan draws one: bare paper cut through the ground, between two inked edges that swell
 * and thin as a pen does, heavier on the side turned from the sun, broken now and then; a little stipple of
 * gravel and earth inside, more where it's walked (`wear`, 0..1). Wider at the bends (corners cut) and where paths
 * meet (`wide`, per point), closing to a point at either end, a tuft or two of grass where it gives out. Left
 * (`grown`, 0..1), its edges break up first and the grass comes back across it in patches, joining until it's gone.
 */
export function drawTrack(g: CanvasRenderingContext2D, pts: [number, number][], width: number, U: number, seed: number, o: { wear?: number; grown?: number; wide?: number[]; sun?: Sun } = {}): void {
  const n = pts.length;
  if (n < 2) return;
  const wear = o.wear ?? 0, grown = o.grown ?? 0, sun = o.sun ?? SUN;
  const sm = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  // (Along it: distance, direction, how sharply it bends.)
  const s = [0], tx: number[] = [], ty: number[] = [];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = s[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    tx.push(dx / l); ty.push(dy / l);
  }
  const bend = pts.map((_, i) => { const j = Math.max(0, i - 2), k = Math.min(n - 1, i + 2); return Math.min(1, Math.abs(tx[j] * ty[k] - ty[j] * tx[k]) * 1.6); });
  const ends = s.map((d) => sm(d / (width * 1.8)) * sm((len - d) / (width * 1.8)));
  // (Where the grass has come back: patches, the first ones small, joining as it's left longer.)
  const cover = s.map((d) => (grown <= 0 ? 0 : sm((grown * 1.25 - n1(d / (width * 2.2) + seed * 3.1)) / 0.12)));
  const wAt = s.map((d, i) => width * (0.85 + 0.25 * n1(d / (width * 1.3) + seed)) * (1 + 0.4 * bend[i]) * (o.wide?.[i] ?? 1) * (0.1 + 0.9 * ends[i]) * (1 - 0.85 * cover[i]));
  const edge = (k: number): [number, number][] => pts.map((p, i) => [p[0] - ty[i] * wAt[i] * 0.5 * k, p[1] + tx[i] * wAt[i] * 0.5 * k]);
  const L = edge(1), R = edge(-1);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // Cut through the ground: paper, the hill's lines gone under it.
  g.beginPath(); g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (let i = n - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath();
  g.fillStyle = PAPER; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
  // Gravel and earth: a fine stipple, gathered toward the middle where feet go, thinning where the grass is back.
  g.fillStyle = ink(1);
  const dots = Math.round((len * width) / (U * U) * (0.05 + 0.12 * wear));
  for (let q = 0; q < dots; q++) {
    const d = h1(seed * 1.3 + q * 0.917) * len;
    let i = 0; while (i < n - 2 && s[i + 1] < d) i++;
    if (h1(q * 2.71 + seed) < cover[i] * 1.2 || h1(q * 4.3 + seed) > ends[i] * 1.1) continue;
    const u = h1(q * 3.17 + seed * 0.7) * 2 - 1, across = u * Math.abs(u) ** (0.4 * wear) * wAt[i] * 0.42;
    g.globalAlpha = 0.35 + 0.4 * h1(q * 5.9 + seed);
    g.beginPath(); g.arc(pts[i][0] - ty[i] * across, pts[i][1] + tx[i] * across, U * (0.22 + 0.3 * h1(q * 7.3 + seed)), 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // Its edges, by hand: a pen's line swelling and thinning, heavier on the shade side, broken here and there,
  // and more as the grass comes back; the press taking it a little unevenly.
  for (const [k, E] of [[1, L], [-1, R]] as [number, [number, number][]][]) {
    for (let i = 1; i < n; i++) {
      const sh = sm(0.5 + 0.7 * (-ty[i] * k * sun.dx + tx[i] * k * sun.dy));
      if (n1(s[i] / (width * 2.4) + seed * 1.9 + k * 7) < 0.1 + 0.6 * cover[i]) continue;
      if (sh < 0.3 && h1(i * 0.31 + seed + k) < 0.3) continue;
      const pen = 0.7 + 0.6 * n1(s[i] / (width * 1.1) + seed * 2.7 + k * 3);
      g.strokeStyle = ink((0.55 + 0.35 * vn(E[i][0] / (3 * U) + seed, E[i][1] / (3 * U))) * Math.min(1, ends[i] * 1.6));
      g.lineWidth = U * (0.35 + 0.7 * sh) * pen;
      g.beginPath(); g.moveTo(...E[i - 1]); g.lineTo(...E[i]); g.stroke();
    }
  }
  // Grass: a few tufts where it gives out at either end, and across it where it's growing back. Never a fringe.
  const tuft = (x: number, y: number, size: number, q: number) => {
    g.strokeStyle = ink(0.75); g.lineWidth = 0.55 * U; g.beginPath();
    const m = 3 + Math.floor(h1(q) * 3);
    for (let b = 0; b < m; b++) {
      const a = -Math.PI / 2 + (b / (m - 1) - 0.5) * 1.5 + (h1(q + b) - 0.5) * 0.3, L2 = size * (0.6 + 0.6 * h1(q * 3 + b));
      const bx = x + (b - (m - 1) / 2) * 0.5 * U;
      g.moveTo(bx, y); g.quadraticCurveTo(bx + Math.cos(a) * L2 * 0.4, y + Math.sin(a) * L2 * 0.6, bx + Math.cos(a) * L2, y + Math.sin(a) * L2);
    }
    g.stroke();
  };
  for (const [d0, dir] of [[0, 1], [len, -1]] as [number, number][]) {
    const m = 2 + Math.floor(h1(seed + d0) * 2);
    for (let q = 0; q < m; q++) {
      const d = Math.max(0, Math.min(len, d0 + dir * width * (0.2 + 1.2 * h1(seed + q * 3.7 + d0))));
      let i = 0; while (i < n - 2 && s[i + 1] < d) i++;
      const across = (h1(seed * 2 + q + d0) - 0.5) * width * 1.6;
      tuft(pts[i][0] - ty[i] * across, pts[i][1] + tx[i] * across, U * (1.8 + 1.2 * h1(q + seed)), seed + q * 11 + d0);
    }
  }
  if (grown > 0) for (let d = width; d < len - width; d += U * (4 + 5 * h1(d * 0.37 + seed))) {
    let i = 0; while (i < n - 2 && s[i + 1] < d) i++;
    if (cover[i] < 0.35 || h1(d * 0.9 + seed) > cover[i] * 0.5) continue;
    const across = (h1(d * 1.9 + seed * 7) - 0.5) * width * 1.5, along = (h1(d * 2.3 + seed) - 0.5) * 2 * U;
    tuft(pts[i][0] - ty[i] * across + tx[i] * along, pts[i][1] + tx[i] * across + ty[i] * along, U * (1.2 + 1.6 * h1(d + seed)), d * 1.3 + seed);
  }
  g.restore();
}
/**
 * A stream winding through the low ground, as an estate map's draughtsman draws one: its width wandering, a
 * pale cool wash between its banks, lighter down its middle; each bank a broken pen line, firmer on the side
 * the light leaves; a few faint current lines along it, broken; reeds where the bank is low, and a stone or two.
 */
export function drawStream(g: CanvasRenderingContext2D, pts: [number, number][], width: number, U: number, seed: number): void {
  if (pts.length < 2) return;
  const n = pts.length;
  const wAt = (i: number) => width * (0.6 + 0.8 * n1(i * 0.22 + seed));
  const tan = pts.map((_, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
  const side = (s: number, f = 0.5): [number, number][] => pts.map((p, i) => [p[0] - tan[i][1] * wAt(i) * f * s, p[1] + tan[i][0] * wAt(i) * f * s]);
  const L = side(1), R = side(-1);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  // The water: paper, a cool wash, paler down the middle where the light is on it.
  g.beginPath(); g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (let i = n - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath();
  g.fillStyle = 'rgb(244,239,228)'; g.fill();
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(160,184,192,0.42)'; g.fill();
  const Li = side(1, 0.18), Ri = side(-1, 0.18);
  g.beginPath(); g.moveTo(...Li[0]); for (const q of Li) g.lineTo(...q); for (let i = n - 1; i >= 0; i--) g.lineTo(...Ri[i]); g.closePath();
  g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
  g.globalCompositeOperation = 'source-over';
  // The current: a few faint lines along it, each a little way, off the middle.
  g.strokeStyle = 'rgba(70,92,104,0.32)'; g.lineWidth = 0.45 * U;
  for (let c = 0; c < 3; c++) {
    const off = (c - 1) * 0.22 + (h1(seed + c) - 0.5) * 0.1;
    g.beginPath(); let on = false;
    for (let i = 0; i < n; i++) {
      const show = n1(i * 0.18 + c * 13 + seed) > 0.55;
      const x = pts[i][0] - tan[i][1] * wAt(i) * off, y = pts[i][1] + tan[i][0] * wAt(i) * off;
      if (show) { if (on) g.lineTo(x, y); else g.moveTo(x, y); }
      on = show;
    }
    g.stroke();
  }
  // Its banks: a pen line that swells and thins and breaks, the far bank firmer.
  for (const [bank, s] of [[L, 1], [R, -1]] as [[number, number][], number][]) {
    g.strokeStyle = ink(0.7);
    for (let i = 1; i < n; i++) {
      if (n1(i * 0.31 + seed + s * 5) < 0.2) continue;
      g.lineWidth = U * (s > 0 ? 0.55 : 0.8) * (0.6 + 0.8 * n1(i * 0.27 + seed + s));
      g.beginPath(); g.moveTo(...bank[i - 1]); g.lineTo(...bank[i]); g.stroke();
    }
    // (Reeds, in clumps where the bank is low; and now and then a stone at the water's edge.)
    for (let i = 2; i < n - 2; i += 1) {
      const hh = h1(i * 7.3 + seed + s * 3.1);
      if (hh < 0.16) {
        const [bx, by] = bank[i], nx = -tan[i][1] * s, ny = tan[i][0] * s;
        g.strokeStyle = ink(0.55); g.lineWidth = 0.4 * U; g.beginPath();
        for (let q = 0; q < 4; q++) {
          const along = (q - 1.5) * 0.7 * U, ln = U * (1.6 + 1.4 * h1(hh * 13 + q)), lean = (h1(hh * 5 + q) - 0.5) * 0.6;
          const x0 = bx + tan[i][0] * along, y0 = by + tan[i][1] * along;
          g.moveTo(x0, y0); g.lineTo(x0 + (nx + tan[i][0] * lean) * ln, y0 + (ny + tan[i][1] * lean) * ln);
        }
        g.stroke();
      } else if (hh > 0.965) {
        const [bx, by] = bank[i], rr = U * (0.9 + 0.8 * h1(hh * 3));
        g.beginPath(); g.ellipse(bx, by, rr, rr * 0.7, h1(hh * 9) * TAU, 0, TAU);
        g.fillStyle = 'rgb(236,231,220)'; g.fill(); g.strokeStyle = ink(0.6); g.lineWidth = 0.45 * U; g.stroke();
      }
    }
  }
  g.restore();
}
