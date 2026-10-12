/**
 * The tree's paint: what colour each year is, and how it goes onto the paper (wash.ts).
 *
 * Paint goes down in the season's living colour and, as it dries, settles into the colour of the wood
 * (keeping a whisper of its season): so the ring you're drawing is green and gold and rust, and the
 * slice it dries into is oak. Each tree has its own wood (a species' palette: see trees.ts), so across
 * the trees, not within one, the wood library is a spectrum.
 *
 * The colours carry the year round each ring: as the line goes round, its season turns from spring's
 * sap green to summer's gold, autumn's rust and madder, a winter violet, and back toward green where it
 * closes, so the colours run round the ring and into one another. The weather tints the year and
 * changes how the paint behaves: rain is a cool blue and wetter, slow to dry, blooming; drought a thin
 * ochre that dries fast and granulates; frost a pale, cold blue; wind drifts the colour downwind; and a
 * fire leaves a vermilion and sepia bloom on the uphill side. A slow hand lays a deeper colour.
 *
 * While a ring is painted the paper is held wet (no time presses: it waits for the hand), so the ring's
 * start and end meet wet-in-wet; when it closes, it dries, its pigment gathering at its edges. Begin
 * the next ring before it has dried and the two run together.
 */
import { Wash, absorb, type RGB, type Weathering } from './wash';
import { K, RAIN, DROUGHT, WIND, FROST, type TreeSim } from './tree';
import { radiusAt, warpR, unwarpR, type View, type Warp } from './hand';

const TAU = Math.PI * 2, STEP = TAU / K;

/** The seasons round a ring (reflectance), spring to spring. */
const SEASONS: RGB[] = [[0.62, 0.75, 0.42], [0.88, 0.72, 0.32], [0.82, 0.46, 0.3], [0.72, 0.32, 0.38], [0.56, 0.52, 0.7], [0.62, 0.75, 0.42]];
const SEASON_A = SEASONS.map(absorb);
/** How each weather tints the year, and by how much. */
const TINTS: Record<number, { c: RGB; k: number }> = {
  [RAIN]: { c: absorb([0.42, 0.6, 0.82]), k: 0.55 },
  [DROUGHT]: { c: absorb([0.9, 0.72, 0.38]), k: 0.6 },
  [WIND]: { c: absorb([0.6, 0.58, 0.74]), k: 0.35 },
  [FROST]: { c: absorb([0.74, 0.84, 0.94]), k: 0.55 },
};
const FIRE = absorb([0.92, 0.4, 0.2]), SEPIA = absorb([0.55, 0.38, 0.26]), CHAR = absorb([0.42, 0.36, 0.33]);

/** A wood's colours (reflectance): its sapwood (the young wood a ring dries to) and its heartwood. */
export interface WoodPalette { sap: RGB; heart: RGB }
export const OAK_WOOD: WoodPalette = { sap: [0.88, 0.74, 0.52], heart: [0.62, 0.42, 0.26] };
/** What a year's paint dries to: its wood, tinted by the weather (rain greyer, drought golden, frost cold). */
export function woodOf(wood: WoodPalette, weather: number): RGB {
  let c = absorb(wood.sap);
  const toward = (r: RGB, k: number) => { const a = absorb(r); c = [c[0] + (a[0] - c[0]) * k, c[1] + (a[1] - c[1]) * k, c[2] + (a[2] - c[2]) * k]; };
  if (weather === RAIN) toward([0.68, 0.66, 0.64], 0.45);
  if (weather === DROUGHT) toward([0.93, 0.8, 0.5], 0.5);
  if (weather === FROST) toward([0.8, 0.8, 0.82], 0.35);
  return c;
}

/** The pigment (absorbance) a year lays at a point `f` (0 to 1) round its ring, in its weather, at a tone (0 quick, 1 slow). */
export function pigmentOf(weather: number, f: number, tone = 0.5): RGB {
  const k = Math.min(SEASONS.length - 1.001, Math.max(0, f) * (SEASONS.length - 1)), i = Math.floor(k), t = k - i;
  const a = SEASON_A[i], b = SEASON_A[i + 1];
  let c: RGB = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tint = TINTS[weather];
  if (tint) c = [c[0] + (tint.c[0] - c[0]) * tint.k, c[1] + (tint.c[1] - c[1]) * tint.k, c[2] + (tint.c[2] - c[2]) * tint.k];
  const strength = 0.48 * (0.75 + 0.5 * tone) * (weather === DROUGHT ? 0.8 : weather === RAIN ? 1.08 : 1);
  return [c[0] * strength, c[1] * strength, c[2] * strength];
}

/** How a year's weather makes the paper behave. */
export function weatheringOf(tree: TreeSim, ring: number): Weathering {
  const w = tree.weatherOf(ring), a = tree.windOf(ring);
  return {
    wet: w === RAIN ? 1.7 : w === DROUGHT ? 0.7 : 1,
    dry: w === DROUGHT ? 1.6 : w === FROST ? 1.25 : 1,
    drift: w === WIND ? [Math.cos(a) * 0.08, Math.sin(a) * 0.08] : [0, 0],
  };
}
const granulation = (w: number) => (w === DROUGHT ? 1 : w === FROST ? 0.6 : 0.25);

export class Paper {
  readonly wash: Wash;
  /** The wood the paint dries to. */
  wood: WoodPalette = OAK_WOOD;
  /** How far the paint settles into the wood as it dries (0 keeps the season's colour, 1 is all wood). */
  turn = 0.85;
  /**
   * Each year laid as wood grows it, across the ring: pale, open spring wood within, and a narrow, dense
   * band of late summer's wood at its edge, the whole year in one season's colour, `across(ring)` (0
   * spring to 1, as the calendar has it). Else (null) the seasons run round the ring.
   */
  across: ((ring: number) => number) | null = null;
  warp: Warp | undefined;
  /** Points of the ring being painted already laid on the paper. */
  private laid = new Uint8Array(K);
  private canvas: HTMLCanvasElement | null = null;
  private img: ImageData | null = null;
  private dirty = true;

  constructor(n = 320) { this.wash = new Wash(n, 40); }

  /** Lay the paper out for a warp (the live slice's), keeping what's painted on it. */
  fit(warp: Warp | undefined, R: number): void {
    const old = this.warp, extent = warpR(warp, R) * 1.12;
    if (old && Math.abs(extent - this.wash.extent) < 1e-6 && old.beta === warp?.beta && old.R === warp?.R) return;
    this.wash.remap(extent, (x, y) => {
      const rho = Math.hypot(x, y);
      if (rho < 1e-9) return [0, 0];
      const k = warpR(old, unwarpR(warp, rho)) / rho;
      return [x * k, y * k];
    });
    this.warp = warp;
    this.dirty = true;
  }

  /** A ring begins: the paper is held wet while it's painted. */
  begin(tree: TreeSim): void {
    this.laid.fill(0);
    this.wash.weather = { ...weatheringOf(tree, tree.ring), dry: 0 };
  }

  /** Each frame while painting: the points drawn since the last frame are laid on the paper. */
  paint(tree: TreeSim): void {
    // (Called once more just after the ring closes, for its last points: then its bark is the ring before.)
    const closed = !tree.stroke, n = closed ? tree.ring - 1 : tree.ring;
    if (n < 0) return;
    const edge = closed ? tree.hi : tree.edgeNow(), w = closed ? tree.laidW : tree.wRef, wx = tree.weatherOf(n);
    const inner = (i: number) => (n ? tree.rings[n - 1][i] : tree.k.pith);
    for (let i = 0; i < K; i++) {
      if (tree.state[i] !== 1 || this.laid[i]) continue;
      this.laid[i] = 1;
      const out = inner(i) + edge[i] * w;
      this.layYear((i - 0.5) * STEP, (i + 0.5) * STEP, (a) => (n ? radiusAt(inner, a) : 0), () => out, wx, this.across ? this.across(n) : tree.at[i], tree.tone[i]);
    }
    this.dirty = true;
  }

  /** The ring closed: it begins to dry, as its weather has it. */
  close(tree: TreeSim, ring = tree.ring - 1): void {
    this.wash.weather = weatheringOf(tree, ring);
  }

  /** A fire on the slope: a vermilion and sepia bloom on the uphill side of the last ring. */
  fire(tree: TreeSim, angle: number): void {
    if (tree.ring > 0) this.fireOn(tree, tree.ring - 1, angle);
    this.dirty = true;
  }

  /** The paper dries a little (dt seconds). */
  step(dt: number): void {
    if (!this.wash.wet) return;
    this.wash.step(dt);
    this.dirty = true;
  }

  /**
   * The whole tree painted again, ring by ring, as it was (for a tree taken up again, or the plate):
   * each ring laid in its season's colours and weather, dried, or run into the next where it was.
   */
  bake(tree: TreeSim, upto = tree.rings.length): void {
    this.wash.clear();
    for (let n = 0; n < upto; n++) {
      const wx = tree.ringWeather[n] ?? 0, start = tree.starts[n] ?? 0, dir = tree.dirs[n] ?? 1, tones = tree.tones[n];
      const ring = tree.rings[n], inner = (a: number) => (n ? radiusAt(tree.rings[n - 1], a) : 0);
      this.wash.weather = { ...weatheringOf(tree, n), dry: 0 };
      for (let i = 0; i < K; i++) {
        const a = i * STEP, f = ((((dir * (a - start)) % TAU) + TAU) % TAU) / TAU, tone = tones ? tones[Math.floor(i / 8) % tones.length] : 0.5;
        this.layYear(a - STEP / 2, a + STEP / 2, inner, (b) => radiusAt(ring, b), wx, this.across ? this.across(n) : f, tone);
      }
      this.wash.weather = weatheringOf(tree, n);
      for (const s of tree.scars) if (s.ring === n + 1) this.fireOn(tree, n, s.angle);
      // (Dried before the next, unless the next was begun while it was damp.)
      const steps = tree.bleeds[n] && n + 1 < upto ? 18 : 200;
      for (let k = 0; k < steps && this.wash.wet; k++) this.wash.step(1 / 20);
    }
    for (let k = 0; k < 400 && this.wash.wet; k++) this.wash.step(1 / 20);
    this.wash.dryAll();
    this.dirty = true;
  }

  /** A stretch of a year's ring laid on the paper, between radii (mm, unwarped): see `across`. */
  private layYear(a0: number, a1: number, rIn: (a: number) => number, rOut: (a: number) => number, wx: number, f: number, tone: number): void {
    const ink = pigmentOf(wx, f, tone), water = wx === RAIN ? 1 : 0.9, gran = granulation(wx), dries = woodOf(this.wood, wx);
    const W = (r: (a: number) => number) => (a: number) => warpR(this.warp, r(a));
    if (!this.across) { this.wash.layArc(a0, a1, W(rIn), W(rOut), water, () => ink, gran, dries, this.turn); return; }
    // Painted to look like wood: the wood's own straw and honey, the season only a tint in it (a third).
    // Earlywood, thin paint, most of the year; latewood, deepened toward the heartwood's umber, at the
    // ring's outer edge (its drying edge darkens it further, as latewood is), and never granulated, so its
    // line runs unbroken.
    const heart = absorb(this.wood.heart), sap = absorb(this.wood.sap), mid = (a: number) => rIn(a) + 0.86 * (rOut(a) - rIn(a));
    const base: RGB = [0.62 * 0.55 * sap[0] + 0.38 * ink[0], 0.62 * 0.55 * sap[1] + 0.38 * ink[1], 0.62 * 0.55 * sap[2] + 0.38 * ink[2]];
    const early: RGB = [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8];
    const late: RGB = [0.8 * base[0] + 0.22 * heart[0], 0.8 * base[1] + 0.22 * heart[1], 0.8 * base[2] + 0.22 * heart[2]];
    // (A ring finer than the paper's grain can't show its two woods, only their blend, as wood seen from
    // across a room: laid so, it never shimmers into moiré.)
    const am = (a0 + a1) / 2;
    if (W(rOut)(am) - W(rIn)(am) < 3 * this.wash.h) {
      const blend: RGB = [0.86 * early[0] + 0.14 * late[0], 0.86 * early[1] + 0.14 * late[1], 0.86 * early[2] + 0.14 * late[2]];
      this.wash.layArc(a0, a1, W(rIn), W(rOut), water, () => blend, gran * 0.5, dries, this.turn);
      return;
    }
    this.wash.layArc(a0, a1, W(rIn), W(mid), water, () => early, gran * 0.5, dries, this.turn);
    this.wash.layArc(a0, a1, W(mid), W(rOut), water * 0.8, () => late, 0, heart, this.turn);
  }

  private fireOn(tree: TreeSim, n: number, angle: number): void {
    const half = 0.35, outer = tree.rings[n], inner = (a: number) => (n ? radiusAt(tree.rings[n - 1], a) : 0);
    this.wash.layArc(angle - half, angle + half, (a) => warpR(this.warp, inner(a) + (radiusAt(outer, a) - inner(a)) * 0.3), (a) => warpR(this.warp, radiusAt(outer, a)), 1, (a) => {
      const f = 1 - Math.abs(a - angle) / half, k = 0.5 * f;
      return [FIRE[0] * k + SEPIA[0] * 0.15, FIRE[1] * k + SEPIA[1] * 0.15, FIRE[2] * k + SEPIA[2] * 0.15];
    }, 0.5, CHAR, 0.6);
  }

  /**
   * The heartwood: a warm wash over the older wood, laid as a colourist laid a flat tint over a printed
   * plate, deepening as the tree ages (true of oak: its heartwood darkens as the sapwood becomes it).
   */
  heartwood(g: CanvasRenderingContext2D, tree: TreeSim, v: View, upto = tree.rings.length): void {
    const sapRings = 6, n = upto - sapRings;
    if (n < 1) return;
    const ring = tree.rings[n - 1], h = this.wood.heart, deep = Math.min(1, n / 30);
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgba(${Math.round(h[0] * 255)},${Math.round(h[1] * 255)},${Math.round(h[2] * 255)},${(0.12 + 0.22 * deep).toFixed(3)})`;
    g.beginPath();
    for (let j = 0; j <= K; j++) {
      const a = (j / K) * TAU, r = v.s * warpR(v.warp, radiusAt(ring, a));
      const x = v.cx + r * Math.cos(a + v.turn), y = v.cy - r * Math.sin(a + v.turn);
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.fill();
    g.restore();
  }

  /** The paper, drawn into the view (whose warp it was laid out for). */
  draw(g: CanvasRenderingContext2D, v: View): void {
    const n = this.wash.n;
    if (!this.canvas) { this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = n; this.img = this.canvas.getContext('2d')!.createImageData(n, n); }
    if (this.dirty) { this.wash.render(this.img!.data); this.canvas.getContext('2d')!.putImageData(this.img!, 0, 0); this.dirty = false; }
    const E = this.wash.extent * v.s;
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.canvas, v.cx - E, v.cy - E, 2 * E, 2 * E);
    g.restore();
  }
}
