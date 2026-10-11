/**
 * The oak as the page: a faint etching of the whole tree behind everything, its trunk rising up the
 * screen behind the slice (which is a section cut from it), its crown above, spreading up and off the
 * top of the page as it ages. Drawn as a botanical etching of about 1820 is: a hatched trunk, tapering
 * limbs with their shaded edge heavier, scalloped leaf masses with leaf touches, hatched on the side
 * away from the light. The leaves turn with the seasons (washed in, in watercolour), and the weather
 * happens across the page: ruled rain, wind's long streaks, a cold ruled sky and flakes, a rayed sun and
 * heat shimmer in a drought, smoke and flames on the slope.
 *
 * The same drawing, small and dark, makes the growth figures: the tree at ten, fifty, a hundred, two
 * hundred and three hundred years, as a plate of about 1838 drew a tree at its ages.
 */
import { RAIN, DROUGHT, WIND, FROST } from './tree';
import { leafiness, leafWash, smoke, flames, type Scene, type Box } from './habit';

const TAU = Math.PI * 2;
const PAPER = '#f4efe4';

/** The ages at which a growth figure is drawn. */
export const MILESTONES = [10, 50, 100, 200, 300];
const NAMES: Record<number, string> = { 10: 'ten', 50: 'fifty', 100: 'a hundred', 200: 'two hundred', 300: 'three hundred' };
/** A growth figure's caption: "Fig. 4. At fifty years." (The plate's slice is Fig. 1.) */
export const figureCaption = (age: number) => `Fig. ${MILESTONES.indexOf(age) + 2}. At ${NAMES[age] ?? age} years.`;

interface Limb { x0: number; y0: number; x1: number; y1: number; w0: number; w1: number; d: number }

/** How grown the tree looks at an age: a seedling at nothing, nearly full by three hundred years. */
export const grownAt = (age: number) => Math.min(1.15, Math.pow(Math.max(0, age) / 300, 0.55));

/**
 * The etched oak, its base at (bx, by), `height` tall when grown, at an age; `alpha` how dark the ink;
 * `season` (0 to 1) its leaves; `water` washes them in.
 */
export function etchedOak(g: CanvasRenderingContext2D, bx: number, by: number, height: number, o: { age: number; season: number; alpha: number; seed: number; px: number; water: boolean; dry?: number; tall?: number }): void {
  const f = Math.max(0.04, grownAt(o.age)), H = o.tall ?? height * f, spread = 0.65 + 0.6 * Math.min(1, f);
  let s = (o.seed * 7907 + 17) % 2147483647 || 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const a = o.alpha, px = o.px;
  const ink = (k: number) => `rgba(52,38,28,${Math.max(0, Math.min(1, k * a)).toFixed(3)})`;
  // (A young tree has fewer orders of branching.)
  const depth = Math.max(1, Math.min(4, Math.round(1 + 3.2 * Math.min(1, f * 1.3))));
  const limbs: Limb[] = [], tips: [number, number, number][] = [];
  const trunkH = H * 0.3, tw = Math.max(1.6 * px, H * 0.075 * spread);
  limbs.push({ x0: bx, y0: by, x1: bx + tw * 0.15, y1: by - trunkH, w0: tw, w1: tw * 0.75, d: 0 });
  const branch = (x: number, y: number, ang: number, len: number, w: number, d: number) => {
    const x1 = x + Math.sin(ang) * len, y1 = y - Math.cos(ang) * len;
    limbs.push({ x0: x, y0: y, x1, y1, w0: w, w1: w * 0.62, d });
    // (Always the same draws, however grown: so the tree keeps its shape as it grows.)
    const k = d === 0 ? 4 : 2 + (r() < 0.5 ? 1 : 0), jit = [r(), r(), r(), r(), r(), r(), r(), r()];
    if (d >= depth) { tips.push([x1, y1, len]); return; }
    for (let i = 0; i < k; i++) {
      const an = d === 0 ? -1.05 + (2.1 * (i + 0.5)) / k + (jit[i] - 0.5) * 0.3 : ang + (i - (k - 1) / 2) * (0.5 + jit[i + 2] * 0.3) + (jit[(i + 4) % 8] - 0.5) * 0.25;
      branch(x1, y1, an * (d === 0 ? spread : 1), len * (0.68 + 0.18 * jit[(i + 1) % 8]), w * 0.6, d + 1);
    }
  };
  branch(bx + tw * 0.15, by - trunkH, 0, H * 0.22, tw * 0.75, 0);

  // The limbs and trunk: two edges each, the shaded edge heavier, bark hatching across.
  for (const l of limbs) {
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const e = (side: number, t: number) => { const w = (l.w0 + (l.w1 - l.w0) * t) / 2, bow = Math.sin(t * Math.PI) * len * 0.03; return [l.x0 + dx * t + nx * (side * w + bow), l.y0 + dy * t + ny * (side * w + bow)]; };
    g.fillStyle = PAPER; g.beginPath();
    for (let k = 0; k <= 12; k++) { const [x, y] = e(-1, k / 12); g.lineTo(x, y); }
    for (let k = 12; k >= 0; k--) { const [x, y] = e(1, k / 12); g.lineTo(x, y); }
    g.fill();
    for (const side of [-1, 1]) {
      g.strokeStyle = ink(side > 0 ? 0.95 : 0.6); g.lineWidth = (side > 0 ? 0.9 : 0.55) * px;
      g.beginPath();
      for (let k = 0; k <= 12; k++) { const [x, y] = e(side, k / 12); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    if (l.w0 > 2.5 * px) {
      g.strokeStyle = ink(0.45); g.lineWidth = 0.45 * px; g.beginPath();
      const n = Math.floor(len / (2.5 * px));
      for (let k = 1; k < n; k++) { const t = k / n, [x0, y0] = e(1, t), [x1, y1] = e(0.1 + 0.4 * r(), t + 0.01); g.moveTo(x0, y0); g.lineTo(x1, y1); }
      g.stroke();
    }
  }

  // Leaf masses over the outer limbs, as full as the season has them.
  const leafy = leafiness(o.season);
  if (leafy > 0.03) {
    const [wr, wg, wb] = leafWash(o.season, o.dry ?? 0);
    for (const [x, y, len] of tips) {
      for (let q = 0; q < 3; q++) {
        const cx = x + (r() - 0.5) * len * 1.3, cy = y + (r() - 0.7) * len * 1.2, R = len * (0.8 + 0.5 * r()) * (0.45 + 0.55 * leafy) * Math.min(1, 0.55 + f);
        const shade = Math.max(0, Math.min(1, ((cx - bx) / (H * 0.4 * spread)) * 0.6 + (cy - (by - H * 0.75)) / (H * 0.4)));
        const bumps = 9 + Math.floor(r() * 5);
        g.fillStyle = PAPER; g.beginPath();
        for (let b = 0; b <= bumps; b++) { const an = (b / bumps) * TAU, rr = R * (0.9 + 0.12 * Math.sin(b * 2.3 + q)); g.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.8); }
        g.fill();
        if (o.water) {
          g.save(); g.globalCompositeOperation = 'multiply';
          g.fillStyle = `rgba(${wr},${wg},${wb},${(0.22 + 0.2 * shade) * Math.min(1, a * 1.6)})`;
          g.fill(); g.restore();
        }
        g.strokeStyle = ink(0.7); g.lineWidth = 0.55 * px;
        g.beginPath();
        for (let b = 0; b < bumps; b++) {
          const a0 = (b / bumps) * TAU, a1 = ((b + 1) / bumps) * TAU, am = (a0 + a1) / 2, rr = R * 0.95;
          g.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr * 0.8);
          g.quadraticCurveTo(cx + Math.cos(am) * rr * 1.12, cy + Math.sin(am) * rr * 0.9, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr * 0.8);
        }
        g.stroke();
        g.lineWidth = 0.45 * px; g.strokeStyle = ink(0.5);
        g.beginPath();
        for (let k = 0; k < 7; k++) { const an = r() * TAU, d = r() * R * 0.7, lx = cx + Math.cos(an) * d, ly = cy + Math.sin(an) * d * 0.8, t = 2 * px; g.moveTo(lx - t, ly); g.quadraticCurveTo(lx, ly - t, lx + t, ly); }
        g.stroke();
        if (shade > 0.15) {
          g.save(); g.beginPath(); g.ellipse(cx, cy, R * 0.92, R * 0.74, 0, 0, TAU); g.clip();
          g.strokeStyle = ink(0.32 * shade); g.lineWidth = 0.45 * px; g.beginPath();
          for (let d = -R * 2; d < R * 2; d += 2.1 * px) { g.moveTo(cx + d - R * 0.2, cy - R); g.lineTo(cx + d + R, cy + R); }
          g.stroke(); g.restore();
        }
      }
    }
  } else for (const _ of tips) { r(); r(); r(); }
}

/** The ground the oak stands in: a gentle slope, grass touched in, hatched beneath. */
function ground(g: CanvasRenderingContext2D, b: Box, y: number, alpha: number, px: number, water: boolean, season: number, dry: number, frost: number): void {
  const at = (x: number) => y + ((x - b.x) / b.w - 0.5) * b.h * 0.04;
  if (water) {
    g.save(); g.globalCompositeOperation = 'multiply';
    const [r0, g0, b0] = leafWash(Math.min(0.4, season), dry);
    g.fillStyle = frost > 0.3 ? `rgba(206,214,226,${0.4 * alpha})` : `rgba(${r0},${g0},${b0},${(0.18 * alpha).toFixed(3)})`;
    g.beginPath(); g.moveTo(b.x, at(b.x));
    for (let x = b.x; x <= b.x + b.w; x += 8 * px) g.lineTo(x, at(x));
    g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x, b.y + b.h); g.closePath(); g.fill(); g.restore();
  }
  g.strokeStyle = `rgba(52,38,28,${(0.75 * alpha).toFixed(3)})`; g.lineWidth = 0.9 * px;
  g.beginPath();
  for (let x = b.x; x <= b.x + b.w; x += 6 * px) { if (x === b.x) g.moveTo(x, at(x)); else g.lineTo(x, at(x)); }
  g.stroke();
  g.lineWidth = 0.5 * px; g.beginPath();
  for (let x = b.x + 2 * px; x < b.x + b.w; x += 3.5 * px) { const yy = at(x), h = (2 + 4 * ((Math.sin(x * 0.37) + 1) / 2)) * px; g.moveTo(x, yy); g.lineTo(x + Math.sin(x) * 1.5 * px, yy - h); }
  for (let k = 0; k < 40; k++) { const x = b.x + ((k * 97) % 1000) / 1000 * b.w, yy = at(x) + (8 + ((k * 53) % 70)) * px; g.moveTo(x, yy); g.lineTo(x + 9 * px, yy); }
  g.stroke();
}

/** The page's weather, over everything but the slice: drawn each frame, it moves. */
function weather(g: CanvasRenderingContext2D, b: Box, sc: Scene, groundY: number, px: number): void {
  const amount = (kind: number) => (sc.weather === kind ? sc.now : 0) + (sc.coming === kind && sc.weather !== kind ? sc.gather * 0.6 : 0);
  const rain = amount(RAIN), dry = amount(DROUGHT), wind = amount(WIND), frost = amount(FROST), t = sc.time;
  const line = (k: number) => `rgba(52,38,28,${Math.max(0, Math.min(1, k)).toFixed(3)})`;
  // The sun, upper right: the astronomer's sign, rayed in a drought, faint behind rain.
  {
    const sx = b.x + b.w - 34 * px, sy = b.y + 100 * px, hid = Math.min(1, rain);
    g.strokeStyle = line(0.7 * (1 - 0.7 * hid)); g.fillStyle = line(0.7 * (1 - 0.7 * hid)); g.lineWidth = 0.7 * px;
    g.beginPath(); g.arc(sx, sy, 6 * px, 0, TAU); g.stroke();
    g.beginPath(); g.arc(sx, sy, 1.4 * px, 0, TAU); g.fill();
    if (dry > 0.05) { g.beginPath(); for (let k = 0; k < 12; k++) { const an = (k / 12) * TAU, l = (4 + 9 * dry) * px; g.moveTo(sx + Math.cos(an) * 8.5 * px, sy + Math.sin(an) * 8.5 * px); g.lineTo(sx + Math.cos(an) * (8.5 * px + l), sy + Math.sin(an) * (8.5 * px + l)); } g.stroke(); }
  }
  // Rain: ruled strokes across the page, falling.
  if (rain > 0.03) {
    if (sc.water) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(150,160,178,${(0.1 * rain).toFixed(3)})`; g.fillRect(b.x, b.y, b.w, groundY - b.y); g.restore(); }
    g.strokeStyle = sc.water ? `rgba(70,88,116,${(0.32 * rain).toFixed(3)})` : line(0.28 * rain); g.lineWidth = 0.55 * px; g.beginPath();
    const n = Math.round(90 * Math.min(1, rain));
    for (let k = 0; k < n; k++) {
      const x = b.x + ((k * 0.6180339 + Math.floor(t * 1.7 + k * 0.37) * 0.137) % 1) * b.w, y = b.y + (((k * 0.414 + t * 0.9) % 1) * (groundY - b.y));
      g.moveTo(x, y); g.lineTo(x - 4 * px, y + 16 * px);
    }
    g.stroke();
  }
  // Wind: long fine streaks.
  if (wind > 0.05) {
    const dirn = sc.wind >= 0 ? 1 : -1;
    g.strokeStyle = line(0.32 * wind); g.lineWidth = 0.5 * px;
    for (let k = 0; k < 7; k++) {
      const y = b.y + b.h * (0.1 + 0.08 * k), len = b.w * 0.4, x0 = b.x + ((((k * 0.37 * b.w + dirn * t * 60 * px) % (b.w + len)) + b.w + len) % (b.w + len)) - len;
      g.beginPath();
      for (let j = 0; j <= 14; j++) { const u = j / 14, x = x0 + u * len, yy = y + Math.sin(u * 5 + k + t * 2) * 3 * px; if (j) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
  }
  // Frost: a cold sky, ruled; flakes drifting down.
  if (frost > 0.05) {
    if (sc.water) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(200,212,230,${(0.18 * frost).toFixed(3)})`; g.fillRect(b.x, b.y, b.w, groundY - b.y); g.restore(); }
    g.strokeStyle = line(0.12 * frost); g.lineWidth = 0.5 * px; g.beginPath();
    for (let y = b.y + 60 * px; y < b.y + b.h * 0.35; y += 6 * px) { g.moveTo(b.x + 16 * px, y); g.lineTo(b.x + b.w - 16 * px, y); }
    g.stroke();
    g.strokeStyle = line(0.5 * frost); g.beginPath();
    for (let k = 0; k < 26; k++) {
      const x = b.x + ((k * 0.618) % 1) * b.w, y = b.y + (((k * 0.29 + t * 0.05) % 1) * (groundY - b.y)), rr = 2 * px;
      for (let q = 0; q < 3; q++) { const an = (q / 3) * Math.PI; g.moveTo(x - Math.cos(an) * rr, y - Math.sin(an) * rr); g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    }
    g.stroke();
  }
  // Drought: heat shimmer over the ground.
  if (dry > 0.05) {
    g.strokeStyle = line(0.25 * dry); g.lineWidth = 0.5 * px;
    for (let k = 0; k < 4; k++) {
      const y = groundY - (14 + k * 9) * px;
      g.beginPath();
      for (let x = b.x + 20 * px; x < b.x + b.w - 20 * px; x += 4 * px) { const yy = y + Math.sin(x * 0.05 + t * 3 + k) * 1.5 * px; if (x === b.x + 20 * px) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
  }
  // Fire on the slope: a wisp of smoke when it's coming, then flames.
  const fx = b.x + b.w * 0.18;
  if (sc.fireComing > 0.02 && sc.fire < 0.05) smoke(g, fx, groundY, sc.fireComing * 0.7, b.h * 0.3, t, px, sc.water);
  if (sc.fire > 0.02) { smoke(g, fx, groundY - 6 * px, sc.fire, b.h * 0.45, t, px, sc.water); flames(g, fx, groundY, sc.fire, b.h * 0.25, t, px, sc.water); }
}

/**
 * The page: the oak's etching, kept aside and drawn again only when it has grown or the season has
 * turned; the ground; and the weather over it, each frame.
 */
export class OakPage {
  private cv: HTMLCanvasElement | null = null;
  private key = '';

  /** Where the ground is on a page this size. */
  static groundY(b: Box, px: number): number { return b.y + b.h - 26 * px; }

  draw(g: CanvasRenderingContext2D, b: Box, sc: Scene, opts: { alpha?: number } = {}): void {
    const px = sc.px, gy = OakPage.groundY(b, px), alpha = opts.alpha ?? 0.42;
    const season = Math.round((((sc.season % 1) + 1) % 1) * 24) / 24, age = Math.round(sc.age);
    const key = `${b.w}x${b.h}:${age}:${season}:${sc.water}:${alpha}:${sc.seed}`;
    if (key !== this.key) {
      this.key = key;
      this.cv ??= document.createElement('canvas');
      if (this.cv.width !== b.w || this.cv.height !== b.h) { this.cv.width = b.w; this.cv.height = b.h; }
      const c = this.cv.getContext('2d')!;
      c.clearRect(0, 0, b.w, b.h);
      // (The tree stands up the page, its crown always above the slice: young, a slender sapling with a
      // small crown; grown, a broad oak whose crown spreads up and off the top.)
      const tall = b.h * (0.72 + 0.4 * Math.min(1, grownAt(sc.age)));
      c.save(); c.globalAlpha = 1;
      etchedOak(c, b.w / 2, gy - b.y + 4 * px, b.h, { age: sc.age, season, alpha, seed: sc.seed, px, water: sc.water, tall });
      c.restore();
    }
    ground(g, b, gy, Math.min(1, alpha * 1.6), px, sc.water, sc.season, sc.weather === DROUGHT ? 1 : 0, sc.weather === FROST ? 1 : 0);
    g.drawImage(this.cv!, b.x, b.y);
    weather(g, b, sc, gy, px);
  }
}

/** A growth figure: the tree at an age, small and dark, standing on its own touch of ground, with its caption. */
export function drawFigure(g: CanvasRenderingContext2D, x: number, y: number, size: number, age: number, o: { seed: number; px: number; water: boolean; caption?: boolean; font?: string }): void {
  etchedOak(g, x, y, size, { age, season: 0.3, alpha: 0.92, seed: o.seed, px: o.px, water: o.water });
  g.strokeStyle = 'rgba(52,38,28,0.7)'; g.lineWidth = 0.5 * o.px; g.beginPath();
  for (let k = -12; k <= 12; k++) { const gx = x + k * size * 0.03; g.moveTo(gx, y + 1); g.lineTo(gx + o.px, y - (2 + (k * k) % 4) * o.px); }
  g.stroke();
  if (o.caption !== false) {
    g.fillStyle = '#2e2118'; g.textAlign = 'center'; g.font = o.font ?? `italic ${12 * o.px}px "Newsreader", Georgia, serif`;
    g.fillText(figureCaption(age), x, y + 18 * o.px);
  }
}
