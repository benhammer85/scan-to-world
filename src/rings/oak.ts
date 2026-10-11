/**
 * The oak as the page, drawn from real plates of about 1805 to 1825: the whole tree stands up the
 * screen behind the slice, faint, as a print, and as the tree ages one plate gives way to the next, from
 * a study of acorns to Billington's young oaks (1825), Delamotte's oaks by a lane (1805), and Strutt's
 * great oaks of the Sylva Britannica (1823 to 1824). Ink on the page's own paper, the leaves washed with
 * the season (in watercolour), and the weather over it all: ruled rain, wind's long streaks, a cold ruled
 * sky and flakes, a rayed sun and heat shimmer in a drought, smoke and flames on the slope.
 *
 * The same plates are the growth figures: the tree at ten, fifty, a hundred, two hundred, three hundred
 * and four hundred and fifty years, as Loudon's Arboretum (1838) drew a tree at its ages.
 */
import { RAIN, DROUGHT, WIND, FROST } from './tree';
import { leafiness, leafWash, smoke, flames, type Scene, type Box } from './habit';
import { STAGES, stageAt, plateImage, type Stage } from './plates';

const TAU = Math.PI * 2;

/** The ages at which a growth figure is drawn. */
export const MILESTONES = [10, 50, 100, 200, 300, 450];
const NAMES: Record<number, string> = { 10: 'ten', 50: 'fifty', 100: 'a hundred', 200: 'two hundred', 300: 'three hundred', 450: 'four hundred and fifty' };
/** A growth figure's caption: "Fig. 4. At fifty years." (The plate's slice is Fig. 1.) */
export const figureCaption = (age: number) => `Fig. ${MILESTONES.indexOf(age) + 2}. At ${NAMES[age] ?? age} years.`;

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
 * The page: the plate for the tree's age (crossing over to the next as it nears it), kept aside and
 * drawn again only when it has changed; the ground; and the weather over it, each frame.
 */
export class OakPage {
  private cv: HTMLCanvasElement | null = null;
  private key = '';

  /** Where the ground is on a page this size. */
  static groundY(b: Box, px: number): number { return b.y + b.h - 26 * px; }

  draw(g: CanvasRenderingContext2D, b: Box, sc: Scene, opts: { alpha?: number } = {}): void {
    const px = sc.px, gy = OakPage.groundY(b, px), alpha = opts.alpha ?? 0.5;
    const season = Math.round((((sc.season % 1) + 1) % 1) * 24) / 24, { stage, next, blend } = stageAt(sc.age);
    const key = `${b.w}x${b.h}:${stage.id}:${next?.id}:${Math.round(blend * 20)}:${season}:${sc.water}:${alpha}:${plateImage(stage)?.complete}:${next ? plateImage(next)?.complete : ''}`;
    if (key !== this.key) {
      this.key = key;
      this.cv ??= document.createElement('canvas');
      if (this.cv.width !== b.w || this.cv.height !== b.h) { this.cv.width = b.w; this.cv.height = b.h; }
      const c = this.cv.getContext('2d')!;
      c.clearRect(0, 0, b.w, b.h);
      placePlate(c, stage, b, gy - b.y, alpha * (1 - blend), season, sc.water);
      if (next && blend > 0) placePlate(c, next, b, gy - b.y, alpha * blend, season, sc.water);
    }
    ground(g, b, gy, 0.7, px, sc.water, sc.season, sc.weather === DROUGHT ? 1 : 0, sc.weather === FROST ? 1 : 0);
    g.drawImage(this.cv!, b.x, b.y);
    weather(g, b, sc, gy, px);
  }
}

/** One plate on the page: standing on the ground, centred on its trunk, as tall as its stage has it; its leaves washed with the season. */
function placePlate(c: CanvasRenderingContext2D, st: Stage, b: Box, groundY: number, alpha: number, season: number, water: boolean): void {
  const img = plateImage(st);
  if (!img || !img.complete || !img.naturalWidth || alpha <= 0.01) return;
  const h = b.h * st.page, w = (h * img.naturalWidth) / img.naturalHeight;
  const x = b.w / 2 - w * st.trunk, y = groundY - h * (1 - st.foot);
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(w)); tmp.height = Math.max(1, Math.round(h));
  const t = tmp.getContext('2d')!;
  t.drawImage(img, 0, 0, tmp.width, tmp.height);
  // The colourist's touch: the leaves (the plate's upper part) washed with the season's green or russet.
  const leafy = st.leafy ? leafiness(season) : 0;
  if (water && leafy > 0.05) {
    const [r, gg, bb] = leafWash(season, 0);
    t.globalCompositeOperation = 'source-atop';
    // (Washed over the crown and fading out down it, as a colourist's brush runs dry: no hard edge.)
    const wash = t.createLinearGradient(0, 0, 0, tmp.height * st.crown), a = 0.55 * leafy;
    wash.addColorStop(0, `rgba(${r},${gg},${bb},${a.toFixed(3)})`);
    wash.addColorStop(0.7, `rgba(${r},${gg},${bb},${(a * 0.8).toFixed(3)})`);
    wash.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
    t.fillStyle = wash;
    t.fillRect(0, 0, tmp.width, tmp.height * st.crown);
  }
  c.save(); c.globalAlpha = alpha; c.drawImage(tmp, x, y); c.restore();
}

/** A growth figure: the plate for an age, small, ruled round, with its caption and its engraver. */
export function drawFigure(g: CanvasRenderingContext2D, x: number, y: number, size: number, age: number, o: { px: number; caption?: boolean; font?: string; credit?: boolean; paper?: boolean }): { w: number; h: number } {
  const st = stageAt(age).stage, img = plateImage(st);
  let w = size, h = size;
  const ready = !!img && img.complete && !!img.naturalWidth;
  if (ready) { const k = Math.min(size / img!.naturalWidth, size / img!.naturalHeight); w = img!.naturalWidth * k; h = img!.naturalHeight * k; }
  if (o.paper) { g.fillStyle = 'rgba(244,239,228,0.92)'; g.fillRect(x - w / 2 - 12 * o.px, y - h - 12 * o.px, w + 24 * o.px, h + (o.caption === false ? 24 : 58) * o.px); }
  if (ready) g.drawImage(img!, x - w / 2, y - h, w, h);
  g.strokeStyle = 'rgba(46,33,24,0.55)'; g.lineWidth = 0.6 * o.px;
  g.strokeRect(x - w / 2 - 4 * o.px, y - h - 4 * o.px, w + 8 * o.px, h + 8 * o.px);
  if (o.caption !== false) {
    g.fillStyle = '#2e2118'; g.textAlign = 'center'; g.font = o.font ?? `italic ${12 * o.px}px "Newsreader", Georgia, serif`;
    g.fillText(figureCaption(age), x, y + 20 * o.px);
    if (o.credit !== false) { g.globalAlpha *= 0.7; g.font = `${9.5 * o.px}px "Newsreader", Georgia, serif`; g.fillText(st.credit, x, y + 34 * o.px); g.globalAlpha /= 0.7; }
  }
  return { w, h };
}

export { STAGES };
