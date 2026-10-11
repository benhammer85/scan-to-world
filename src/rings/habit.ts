/**
 * The habit drawing: a small engraving of the whole oak on its hill, as a botanical plate sets a small
 * drawing of the whole plant beside its details. It's how the player sees time and what's coming,
 * as a scene and never in words: the seasons turn there (bare, budding, full, russet, bare again),
 * the tree in it grows with the rings, and the weather happens there, gathering a ring or two before
 * it reaches the brush: clouds building and rain, a dry glare and cracked ground, wind in the
 * branches, a hard frost, and fire on the uphill slope.
 *
 * Engraved: ink only, two line weights, hatching for shade (light from the upper left, as on the
 * slice). With the watercolour ink, what changes (the leaves' season, the weather) is washed in over
 * the ink, as the volcano's rule has it: ink for what stays, watercolour for what changes.
 */
import { RAIN, DROUGHT, WIND, FROST, type Weather } from './tree';

export interface Scene {
  /** The tree's age (years): its size and how far its limbs have spread. */
  age: number;
  /** The time of year, 0 to 1: 0 bare early spring, ¼ high summer, ½ autumn, ¾ winter. */
  season: number;
  /** The weather now, and how strongly it's happening (0 to 1). */
  weather: Weather;
  now: number;
  /** The weather coming, and how far it has gathered (0 to 1). */
  coming: Weather;
  gather: number;
  /** A fire burning on the slope now (0 to 1), and one signalled (0 to 1). */
  fire: number;
  fireComing: number;
  /** The wind's way across the scene (−1 to 1, rightward positive). */
  wind: number;
  /** Seconds, for what moves. */
  time: number;
  /** Fallen, 0 standing to 1 lying on the hill. */
  fallen: number;
  water: boolean;
  seed: number;
  /** Device pixels a CSS pixel. */
  px: number;
}

export interface Box { x: number; y: number; w: number; h: number }

const TAU = Math.PI * 2;
const INK = [46, 33, 24];
const ink = (a: number) => `rgba(${INK[0]},${INK[1]},${INK[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
function hash(n: number): number { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------- the tree's form
interface Seg { x0: number; y0: number; x1: number; y1: number; w0: number; w1: number; depth: number; born: number; kids: number[] }
const FORMS = new Map<number, { segs: Seg[]; top: number }>();

/** The oak's form, the same for a seed every time: a short bole, broad heavy limbs, a spreading crown. */
function formOf(seed: number): { segs: Seg[]; top: number } {
  const had = FORMS.get(seed);
  if (had) return had;
  let s = (seed * 7907 + 17) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const segs: Seg[] = [];
  const BORN = [0, 8, 30, 70, 130];
  const limb = (x: number, y: number, ang: number, len: number, w: number, depth: number, born: number): number => {
    const x1 = x + Math.sin(ang) * len, y1 = y + Math.cos(ang) * len, i = segs.length;
    segs.push({ x0: x, y0: y, x1, y1, w0: w, w1: w * (depth ? 0.62 : 0.72), depth, born, kids: [] });
    if (depth >= 4) return i;
    // An oak's habit: a short bole, then heavy limbs spreading wide and low, each forking on out and
    // a little up, so the crown is a broad dome, wider than it's tall.
    const n = depth === 0 ? 4 + (rnd() < 0.4 ? 1 : 0) : 2 + (rnd() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = depth === 0 ? -0.95 + (1.9 * (k + 0.5)) / n + (rnd() - 0.5) * 0.25 : ang * 0.62 + (k - (n - 1) / 2) * (0.55 + rnd() * 0.25) + (rnd() - 0.5) * 0.2;
      const l = len * (depth === 0 ? 1.2 : 0.74) * (0.85 + 0.3 * rnd()) * (depth === 0 ? 1 - 0.2 * Math.abs(a) : 1);
      // (The main limbs leave the bole one above another, the lowest spreading widest, not all from one point.)
      const f = depth === 0 ? 0.62 + 0.38 * (1 - Math.abs(a) / 1.1) : 1;
      segs[i].kids.push(limb(x + (x1 - x) * f, y + (y1 - y) * f, a, l, w * (depth === 0 ? 0.55 : 0.66), depth + 1, BORN[depth + 1] + rnd() * 10));
    }
    return i;
  };
  limb(0, 0, (rnd() - 0.5) * 0.06, 0.34, 0.1, 0, 0);
  let top = 0;
  for (const g of segs) top = Math.max(top, g.y1);
  const f = { segs, top };
  FORMS.set(seed, f);
  return f;
}

/** How leafy the crown is at a time of year: buds in spring, full in summer, thinning in autumn, bare in winter. */
export function leafiness(season: number): number {
  const s = ((season % 1) + 1) % 1;
  if (s < 0.12) return s / 0.12 * 0.5;
  if (s < 0.22) return 0.5 + ((s - 0.12) / 0.1) * 0.5;
  if (s < 0.45) return 1;
  if (s < 0.65) return 1 - ((s - 0.45) / 0.2) * 0.85;
  if (s < 0.72) return 0.15 * (1 - (s - 0.65) / 0.07);
  return 0;
}
/** The leaves' wash for a time of year: fresh green, deep green, russet. */
export function leafWash(season: number, dry: number): [number, number, number] {
  const s = ((season % 1) + 1) % 1;
  const spring: [number, number, number] = [150, 172, 92], summer: [number, number, number] = [92, 122, 62], autumn: [number, number, number] = [176, 112, 52];
  const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * Math.max(0, Math.min(1, t))) as [number, number, number];
  const c = s < 0.25 ? mix(spring, summer, s / 0.25) : mix(summer, autumn, (s - 0.25) / 0.3);
  return mix(c, [190, 170, 100], dry * 0.6);
}

// ---------------------------------------------------------------- the scene
export function drawHabit(g: CanvasRenderingContext2D, b: Box, sc: Scene): void {
  const px = sc.px, fine = 0.7 * px, heavy = 1.3 * px;
  g.save();
  g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  const amount = (kind: Weather) => (sc.weather === kind ? sc.now : 0) + (sc.coming === kind && sc.weather !== kind ? sc.gather * 0.75 : 0);
  const rain = amount(RAIN), dry = amount(DROUGHT), wind = amount(WIND), frost = amount(FROST);
  const ground = (x: number) => { const t = (x - b.x) / b.w; return b.y + b.h * (0.6 + 0.3 * t - 0.08 * t * t); };
  const baseX = b.x + b.w * 0.58, baseY = ground(baseX);

  // ---- washes, under the ink (watercolour)
  if (sc.water) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    if (dry > 0.01) { g.fillStyle = `rgba(226,196,128,${(0.28 * dry).toFixed(3)})`; g.fillRect(b.x, b.y, b.w, b.h); }
    if (frost > 0.01) { g.fillStyle = `rgba(176,196,220,${(0.3 * frost).toFixed(3)})`; g.fillRect(b.x, b.y, b.w, b.h); }
    // The hill, its grass the season's colour.
    const L = leafiness(sc.season), [gr, gg, gb] = leafWash(sc.season, dry);
    g.fillStyle = `rgba(${gr},${gg},${gb},${(0.12 + 0.12 * L).toFixed(3)})`;
    g.beginPath(); g.moveTo(b.x, ground(b.x));
    for (let x = b.x; x <= b.x + b.w; x += 4 * px) g.lineTo(x, ground(x));
    g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x, b.y + b.h); g.closePath(); g.fill();
    g.restore();
  }

  // ---- the sun, upper right: rayed in a dry spell, faint behind cloud
  {
    const sx = b.x + b.w * 0.84, sy = b.y + b.h * 0.16, hid = Math.min(1, rain);
    g.strokeStyle = ink(0.85 * (1 - 0.75 * hid)); g.fillStyle = ink(0.85 * (1 - 0.75 * hid)); g.lineWidth = fine;
    g.beginPath(); g.arc(sx, sy, 4.5 * px, 0, TAU); g.stroke();
    g.beginPath(); g.arc(sx, sy, 1.1 * px, 0, TAU); g.fill();
    if (dry > 0.05) {
      g.beginPath();
      for (let k = 0; k < 12; k++) { const r = (k / 12) * TAU, l = (3 + 6 * dry) * px; g.moveTo(sx + Math.cos(r) * 6.5 * px, sy + Math.sin(r) * 6.5 * px); g.lineTo(sx + Math.cos(r) * (6.5 * px + l), sy + Math.sin(r) * (6.5 * px + l)); }
      g.stroke();
    }
  }

  // ---- frost: a cold sky, ruled; a few flakes
  if (frost > 0.05) {
    g.strokeStyle = ink(0.28 * frost); g.lineWidth = fine;
    g.beginPath();
    for (let y = b.y + 6 * px; y < b.y + b.h * 0.45; y += 5 * px) { g.moveTo(b.x + 4 * px, y); g.lineTo(b.x + b.w * 0.7, y); }
    g.stroke();
    g.strokeStyle = ink(0.6 * frost);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const x = b.x + hash(k * 3.1) * b.w, y = b.y + ((hash(k * 7.3) * b.h + sc.time * 6 * px) % (b.h * 0.8)), r = 1.6 * px;
      for (let q = 0; q < 3; q++) { const t = (q / 3) * Math.PI; g.moveTo(x - Math.cos(t) * r, y - Math.sin(t) * r); g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r); }
    }
    g.stroke();
  }

  // ---- clouds gathering, and rain
  if (rain > 0.03) cloudsAndRain(g, b, sc, rain, ground, px);

  // ---- wind: long fine streaks across the sky
  if (wind > 0.05) {
    const dirn = sc.wind >= 0 ? 1 : -1;
    g.strokeStyle = ink(0.45 * wind); g.lineWidth = fine;
    for (let k = 0; k < 5; k++) {
      const y = b.y + b.h * (0.12 + 0.1 * k), len = b.w * 0.35, x0 = b.x + ((((hash(k * 5.5) * b.w + dirn * sc.time * 40 * px) % (b.w + len)) + b.w + len) % (b.w + len)) - len;
      g.beginPath();
      for (let j = 0; j <= 12; j++) { const t = j / 12, x = x0 + t * len, yy = y + Math.sin(t * 5 + k + sc.time * 2) * 2 * px; if (j) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
  }

  // ---- the hill
  hill(g, b, sc, ground, dry, frost, px, fine, heavy);

  // ---- fire on the uphill slope: signalled by a dry heap and a wisp; then flames and smoke
  const fx = b.x + b.w * 0.3, fy = ground(fx);
  if (sc.fireComing > 0.02 && sc.fire < 0.05) smoke(g, fx - b.w * 0.18, ground(fx - b.w * 0.18), sc.fireComing * 0.6, b.h * 0.45, sc.time, px, sc.water);
  if (sc.fire > 0.02) {
    smoke(g, fx, fy - 6 * px, sc.fire, b.h * 0.7, sc.time, px, sc.water);
    flames(g, fx, fy, sc.fire, b.h, sc.time, px, sc.water);
  }

  // ---- the tree
  oak(g, b, sc, baseX, baseY, wind, dry, frost, px, fine, heavy);

  g.restore();
  // The inset's rule, fine.
  g.strokeStyle = ink(0.55); g.lineWidth = fine;
  g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
}

function cloudsAndRain(g: CanvasRenderingContext2D, b: Box, sc: Scene, rain: number, ground: (x: number) => number, px: number): void {
  const fine = 0.7 * px, n = 3, grow = Math.min(1, rain);
  // Clouds come in from the left as they gather.
  const clouds: { x: number; y: number; r: number }[] = [];
  for (let k = 0; k < n; k++) {
    const x = b.x + b.w * (0.15 + 0.32 * k) - (1 - grow) * b.w * 0.35, y = b.y + b.h * (0.14 + 0.05 * (k % 2)), r = b.h * (0.05 + 0.04 * grow) * (0.9 + 0.3 * hash(k + sc.seed));
    clouds.push({ x, y, r });
  }
  if (sc.water) {
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(112,126,148,${(0.32 * grow).toFixed(3)})`;
    for (const c of clouds) for (let q = -2; q <= 2; q++) { g.beginPath(); g.arc(c.x + q * c.r * 0.8, c.y - Math.abs(q) * -c.r * 0.15, c.r * (1 - Math.abs(q) * 0.18), 0, TAU); g.fill(); }
    g.restore();
  }
  g.strokeStyle = ink(0.75 * grow); g.lineWidth = fine;
  for (const c of clouds) {
    // A row of scallops above, a flat base, the base hatched: an engraver's cumulus.
    g.beginPath();
    for (let q = -2; q <= 2; q++) { const r = c.r * (1 - Math.abs(q) * 0.18), cx = c.x + q * c.r * 0.8; g.moveTo(cx + r, c.y); g.arc(cx, c.y, r, 0, Math.PI, true); }
    g.moveTo(c.x - c.r * 2.4, c.y); g.lineTo(c.x + c.r * 2.4, c.y);
    g.stroke();
    g.beginPath();
    for (let k = 1; k <= 3; k++) { const y = c.y - k * 1.8 * px, w = c.r * (2.2 - k * 0.35); g.moveTo(c.x - w, y); g.lineTo(c.x + w, y); }
    g.strokeStyle = ink(0.45 * grow); g.stroke();
    g.strokeStyle = ink(0.75 * grow);
  }
  // Rain only when it's raining now: fine slanted strokes falling from the clouds.
  if (sc.weather === RAIN && sc.now > 0.05) {
    g.strokeStyle = ink(0.5 * sc.now); g.lineWidth = fine;
    g.beginPath();
    const len = 7 * px;
    for (let k = 0; k < 46; k++) {
      const x0 = b.x + hash(k * 2.3) * b.w * 1.1, top = b.y + b.h * 0.18, span = ground(x0) - top;
      const y = top + ((hash(k * 7.7) * span + sc.time * 90 * px) % span);
      g.moveTo(x0 - (y - top) * 0.25, y); g.lineTo(x0 - (y - top) * 0.25 - len * 0.25, y + len);
    }
    g.stroke();
  }
}

function hill(g: CanvasRenderingContext2D, b: Box, sc: Scene, ground: (x: number) => number, dry: number, frost: number, px: number, fine: number, heavy: number): void {
  // Its line, heavy; hatching beneath, following the slope, closer toward the foot (away from the light).
  g.strokeStyle = ink(0.9); g.lineWidth = heavy;
  g.beginPath();
  for (let x = b.x; x <= b.x + b.w + 1; x += 3 * px) { if (x === b.x) g.moveTo(x, ground(x)); else g.lineTo(x, ground(x)); }
  g.stroke();
  g.strokeStyle = ink(0.45); g.lineWidth = fine;
  g.beginPath();
  for (let k = 1; k < 7; k++) {
    const dy = k * k * 1.4 * px;
    for (let x = b.x + ((k * 7) % 11) * px; x < b.x + b.w; x += (10 + 3 * k) * px) {
      const l = (5 + 4 * hash(x + k)) * px;
      g.moveTo(x, ground(x) + dy); g.lineTo(x + l, ground(x + l) + dy);
    }
  }
  g.stroke();
  // Grass: small ticks along the line, fewer in a drought; frost a stipple of hoar instead.
  g.beginPath();
  for (let x = b.x + 3 * px; x < b.x + b.w; x += 6 * px) {
    if (hash(x * 0.37) < dry * 0.8) continue;
    const y = ground(x), h = (2 + 2.5 * hash(x * 1.3)) * px * (1 - 0.5 * dry);
    g.moveTo(x, y); g.lineTo(x - 0.8 * px, y - h);
  }
  g.stroke();
  if (dry > 0.2) {
    // Cracked ground: short broken zigzags.
    g.strokeStyle = ink(0.6 * dry); g.lineWidth = fine;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const x = b.x + b.w * (0.08 + 0.15 * k), y = ground(x) + (4 + 4 * hash(k)) * px;
      g.moveTo(x, y); g.lineTo(x + 2 * px, y + 2 * px); g.lineTo(x + 4 * px, y); g.lineTo(x + 6 * px, y + 2.5 * px);
    }
    g.stroke();
    // Heat over the hill: dotted wavering lines.
    g.save(); g.setLineDash([1 * px, 3 * px]);
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const y0 = b.y + b.h * (0.4 + 0.07 * k);
      for (let j = 0; j <= 20; j++) { const x = b.x + (b.w * j) / 20, y = y0 + Math.sin(j * 0.9 + sc.time * 3 + k) * 1.5 * px; if (j) g.lineTo(x, y); else g.moveTo(x, y); }
    }
    g.strokeStyle = ink(0.4 * dry); g.stroke();
    g.restore();
  }
  if (frost > 0.2) {
    g.fillStyle = ink(0.55 * frost);
    for (let k = 0; k < 60; k++) { const x = b.x + hash(k * 1.9) * b.w, y = ground(x) + hash(k * 4.1) * 5 * px; g.fillRect(x, y, 0.9 * px, 0.9 * px); }
  }
}

export function smoke(g: CanvasRenderingContext2D, x: number, y: number, amount: number, rise: number, time: number, px: number, water: boolean): void {
  if (water) {
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(130,124,118,${(0.14 * amount).toFixed(3)})`;
    for (let k = 0; k < 5; k++) { const u = k / 5; g.beginPath(); g.arc(x + Math.sin(u * 4 + time * 0.7) * 6 * px + u * rise * 0.3, y - u * rise, (4 + 9 * u) * px, 0, TAU); g.fill(); }
    g.restore();
  }
  g.strokeStyle = ink(0.5 * amount); g.lineWidth = 0.7 * px;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let j = 0; j <= 24; j++) {
      const u = j / 24, yy = y - u * rise * Math.min(1, amount + 0.3), xx = x + (k - 1) * 3 * px + Math.sin(u * 6 + time * 1.4 + k * 2) * 5 * px * u + u * rise * 0.3;
      if (j) g.lineTo(xx, yy); else g.moveTo(xx, yy);
    }
    g.stroke();
  }
}

export function flames(g: CanvasRenderingContext2D, x: number, y: number, amount: number, h: number, time: number, px: number, water: boolean): void {
  const tall = h * 0.3 * amount;
  if (water) {
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(228,120,52,${(0.45 * amount).toFixed(3)})`;
    g.beginPath(); g.ellipse(x, y - tall * 0.4, tall * 1.1, tall * 0.7, 0, 0, TAU); g.fill();
    g.restore();
  }
  // Tongues of flame, outlined, licking up and to the right; the ground beneath them hatched dark.
  g.strokeStyle = ink(0.9); g.lineWidth = 1.1 * px;
  for (let k = 0; k < 5; k++) {
    const bx = x + (k - 2) * tall * 0.4, t = tall * (0.6 + 0.5 * hash(k * 3.3)) * (0.85 + 0.15 * Math.sin(time * 9 + k * 2)), lean = Math.sin(time * 5 + k) * tall * 0.15 + tall * 0.1;
    g.beginPath();
    g.moveTo(bx - tall * 0.18, y);
    g.quadraticCurveTo(bx - tall * 0.2, y - t * 0.55, bx + lean, y - t);
    g.quadraticCurveTo(bx + tall * 0.05, y - t * 0.45, bx + tall * 0.18, y);
    g.stroke();
  }
}

/** The oak itself: bole and limbs in ink, bending in the wind; its leaf-masses as an engraver touches foliage. */
function oak(g: CanvasRenderingContext2D, b: Box, sc: Scene, baseX: number, baseY: number, wind: number, dry: number, frost: number, px: number, fine: number, heavy: number): void {
  const form = formOf(sc.seed), age = Math.max(0, sc.age);
  const height = b.h * (0.1 + 0.6 * (1 - Math.exp(-age / 80))), S = height / form.top;
  const fall = sc.fallen * Math.PI * 0.47, cf = Math.cos(fall), sf = Math.sin(fall);
  const bend = (sc.wind || 0) * wind * 0.12;
  const P = (x: number, y: number): [number, number] => {
    const t = y / form.top, bx = x + bend * t * t * (1 + 0.25 * Math.sin(sc.time * 3 + t * 4)) * (1 - sc.fallen);
    // (Falling, it turns about its foot, down the hill.)
    const rx = bx * cf + y * sf, ry = -bx * sf + y * cf;
    return [baseX + rx * S, baseY - ry * S];
  };
  const grownBy = (born: number) => Math.max(0, Math.min(1, (age - born) / 20));
  const visible = form.segs.map((s) => grownBy(s.born));
  // The bole and limbs.
  g.lineCap = 'round';
  for (let i = 0; i < form.segs.length; i++) {
    const s = form.segs[i], gr = visible[i];
    if (gr <= 0) continue;
    const ex = s.x0 + (s.x1 - s.x0) * gr, ey = s.y0 + (s.y1 - s.y0) * gr;
    const [x0, y0] = P(s.x0, s.y0), [x1, y1] = P(ex, ey), w = Math.max(fine, s.w0 * S * 0.75);
    if (w > 2.2 * px) {
      // A thick limb: its two edges, the shaded (right) one heavy, hatched between.
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w1 = Math.max(fine, s.w1 * S * 0.75);
      g.strokeStyle = ink(0.85); g.lineWidth = fine;
      g.beginPath(); g.moveTo(x0 + nx * w, y0 + ny * w); g.lineTo(x1 + nx * w1, y1 + ny * w1); g.stroke();
      g.lineWidth = heavy;
      g.beginPath(); g.moveTo(x0 - nx * w, y0 - ny * w); g.lineTo(x1 - nx * w1, y1 - ny * w1); g.stroke();
      g.lineWidth = fine; g.strokeStyle = ink(0.5);
      g.beginPath();
      for (let t = 0.08; t < 1; t += (2.4 * px) / l) {
        const cx = x0 + dx * t, cy = y0 + dy * t, ww = w + (w1 - w) * t;
        g.moveTo(cx - nx * ww * 0.1, cy - ny * ww * 0.1); g.lineTo(cx - nx * ww * 0.9, cy - ny * ww * 0.9);
      }
      g.stroke();
    } else {
      g.strokeStyle = ink(0.85); g.lineWidth = s.depth <= 1 ? heavy : fine;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  // Leaf-masses at the tips (where no limb grows on from yet), as many loops as the season holds.
  const L = leafiness(sc.season) * (1 - 0.45 * dry) * (1 - 0.6 * frost) * (1 - 0.7 * sc.fallen);
  const tips: [number, number, number][] = [];
  for (let i = 0; i < form.segs.length; i++) {
    const s = form.segs[i];
    if (visible[i] < 0.3) continue;
    if (s.kids.some((k) => visible[k] > 0.3)) continue;
    const [x, y] = P(s.x1, s.y1);
    tips.push([x, y, Math.max(3 * px, (0.13 + 0.04 * (4 - s.depth)) * S * (0.5 + 0.5 * visible[i]))]);
  }
  // The crown as an engraver draws foliage: the leaf-masses' outline scalloped, small loops of leaf
  // here and there within, and the side away from the light (lower right) hatched.
  const masses = tips.map(([x, y, r]) => [x, y - r * 0.2, r * (0.55 + 0.45 * L)] as [number, number, number]);
  if (L > 0.02 && sc.water) {
    const [r, gg, bb] = leafWash(sc.season, dry);
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(${r},${gg},${bb},${(0.32 * L).toFixed(3)})`;
    g.beginPath();
    for (const [x, y, rad] of masses) { g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); }
    g.fill();
    g.restore();
  }
  if (L > 0.02) {
    const inside = (x: number, y: number, skip: number) => masses.some(([mx, my, mr], j) => j !== skip && Math.hypot(x - mx, y - my) < mr * 0.97);
    const bump = 2.6 * px;
    g.lineWidth = fine; g.strokeStyle = ink(0.8);
    g.beginPath();
    masses.forEach(([x, y, rad], j) => {
      const n = Math.max(6, Math.round((TAU * rad) / (bump * 1.7)));
      for (let q = 0; q < n; q++) {
        if (hash(q * 7.1 + j * 3.3) > 0.35 + 0.65 * L) continue; // (sparse in spring and autumn)
        const t = (q / n) * TAU, ex = x + Math.cos(t) * rad, ey = y + Math.sin(t) * rad;
        if (inside(ex, ey, j)) continue;
        g.moveTo(ex + Math.cos(t - Math.PI / 2) * bump, ey + Math.sin(t - Math.PI / 2) * bump);
        g.arc(ex, ey, bump, t - Math.PI / 2, t + Math.PI / 2);
      }
    });
    g.stroke();
    // A few loops of leaf within.
    g.strokeStyle = ink(0.5);
    g.beginPath();
    masses.forEach(([x, y, rad], j) => {
      const n = Math.round((rad / px / 4) * L);
      for (let q = 0; q < n; q++) {
        const a = hash(q * 1.7 + j * 9.1 + sc.seed) * TAU, d = Math.sqrt(hash(q * 2.9 + j)) * rad * 0.8, lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d, r = 1.4 * px;
        g.moveTo(lx + r, ly); g.arc(lx, ly, r, 0, Math.PI, true);
      }
    });
    g.stroke();
    // The shade: parallel strokes across the crown's lower right, clipped to its masses.
    if (L > 0.3 && masses.length) {
      let cx = 0, cy = 0, R = 0;
      for (const [x, y] of masses) { cx += x; cy += y; }
      cx /= masses.length; cy /= masses.length;
      for (const [x, y, r] of masses) R = Math.max(R, Math.hypot(x - cx, y - cy) + r);
      g.save();
      g.beginPath();
      for (const [x, y, rad] of masses) { g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); }
      g.clip();
      g.beginPath(); g.moveTo(cx - R * 2, cy + R * 2 - R * 0.15); g.lineTo(cx + R * 2, cy - R * 2 - R * 0.15); g.lineTo(cx + R * 2, cy + R * 2); g.closePath(); g.clip();
      g.strokeStyle = ink(0.42 * L); g.lineWidth = fine;
      g.beginPath();
      for (let d = -R * 2; d < R * 2; d += 2.4 * px) { g.moveTo(cx + d - R, cy + R); g.lineTo(cx + d + R, cy - R); }
      g.stroke();
      g.restore();
    }
    // In the wind, a few leaves torn off and blown along.
    if (wind > 0.3) {
      g.strokeStyle = ink(0.6 * wind);
      g.beginPath();
      for (let q = 0; q < 6; q++) {
        const t = (sc.time * 0.4 + hash(q * 3.7)) % 1, x = baseX + (sc.wind >= 0 ? 1 : -1) * t * b.w * 0.6, y = baseY - height * (0.6 + 0.3 * hash(q)) + Math.sin(t * 9 + q) * 4 * px;
        g.moveTo(x, y); g.lineTo(x + 2 * px, y + 1 * px);
      }
      g.stroke();
    }
  }
  if (frost > 0.2 && L < 0.6) {
    // Hoar on the twigs: fine dots along the limbs.
    g.fillStyle = ink(0.5 * frost);
    for (let i = 0; i < form.segs.length; i++) {
      if (visible[i] < 0.5 || form.segs[i].depth < 2) continue;
      const s = form.segs[i];
      for (let t = 0.2; t < 1; t += 0.25) { const [x, y] = P(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t); g.fillRect(x, y - 1.5 * px, 0.9 * px, 0.9 * px); }
    }
  }
}
