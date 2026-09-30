/**
 * Volcano, the prototype: a young ocean planet with nothing on it, and you the
 * heat beneath, with a finite store of it. Drawn in Atlas Minor's paper and
 * ink: the one pen plots the coastlines and contours of the land as it is
 * made, life comes in as the conventional signs of the old survey maps, lava
 * is laid on as the vermilion wash the geological maps gave it, and steam and
 * ash are engraved strokes, not light.
 *
 * It is played by nothing but how you hold it, as a globe in the hands. Tilt
 * the phone, or turn the world with a finger (or the arrow keys): held level,
 * the heat gathers beneath whatever is uppermost; tipped, it pours down the
 * world as gravity would take it; tipped when it's full, it bursts. Level is
 * however you were holding the phone when you began.
 *
 * Everything that matters is drawn on the world itself, as a surveyor's marks:
 *   at the vent, the pressure as a ring that grows, with a dashed ring where a
 *     flow becomes a burst; round it an arc that is the heat left, drawing
 *     itself away as the planet cools; and a level's bubble inside, that leaves
 *     the vent's smallest circle when the world is tipped enough to pour;
 *   a dotted ring where life wishes for a kind, and a ring with a cross where a
 *     stone will fall, closing in as it comes;
 *   a few words written beside the vent while an idea is new.
 * Off the world there is only the era, as a map's title, and at the foot the
 * key: the six kinds of life by their signs, inked once each is living. The
 * world is kept as it's played; when the fire is out, the chart is drawn round
 * it, and turning the world begins another.
 */
import * as THREE from 'three';
import { buildTopology } from '../mesh/topology';
import { extractContours, type Polyline } from '../terrain/contours';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from '../render/plotterLines';
import { GestureRecognizer } from '../interact/gestures';
import { Stipple, stippleDots } from '../render/stipple';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Planet, VOLCANO, type Era } from './sim';
import { FineSurface } from './fine';
import { Ecology, ECOLOGY, KINDS } from './ecology';
import { Islands } from './islands';
import { Puffs } from './puffs';
import { drawChart, drawFrame, type ChartInfo } from './chart';
import { snapshotOf, restoreInto, keep, recall, forget } from './save';

const $ = (id: string) => document.getElementById(id)!;
const stage = $('stage');

// ---------------------------------------------------------------- the scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
// As sharp as the screen is, up to three device pixels to a CSS pixel (less, if the phone can't keep up: see `pace`).
let pixelRatio = Math.min(3, window.devicePixelRatio || 1);
renderer.setPixelRatio(pixelRatio);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe4');
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
// Flat, as paper is: only a little light from one side, so relief reads without the gloss of a model.
scene.add(new THREE.HemisphereLight('#fffaf0', '#efe7d6', 2.6));
const sun = new THREE.DirectionalLight('#ffffff', 0.28);
sun.position.set(-2, 3, 2.5);
scene.add(sun);

let dist = 3.2, farthest = 5;
function fit(): void {
  const w = Math.max(1, stage.clientWidth || innerWidth), h = Math.max(1, stage.clientHeight || innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  farthest = 1.35 / Math.sin(Math.min(vfov, hfov) / 2) * 1.4;
  look();
  camera.updateProjectionMatrix();
  for (const pen of pens) pen.setResolution(w, h, renderer.getPixelRatio());
  sizeFrame(w, h);
}
/** How far the world is lifted up the page (a share of its height): at the end, to leave the foot for the chart. */
let lift = 0;
function look(): void {
  dist = THREE.MathUtils.clamp(dist, 1.6, farthest * 1.3);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  const w = Math.max(1, stage.clientWidth || innerWidth), h = Math.max(1, stage.clientHeight || innerHeight);
  if (lift > 1e-4) camera.setViewOffset(w, h, 0, lift * h, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
const pens: PlotterLines[] = [];
addEventListener('resize', fit);
new ResizeObserver(fit).observe(stage);

// ---------------------------------------------------------------- the planet
const topo = buildTopology(new THREE.IcosahedronGeometry(1, 40).attributes.position.array, null);
const N = topo.vertexCount, base = topo.basePositions;
const nearest = (x: number, y: number, z: number) => {
  let best = 0, bd = Infinity;
  for (let v = 0; v < N; v++) { const d = Math.hypot(base[v * 3] - x, base[v * 3 + 1] - y, base[v * 3 + 2] - z); if (d < bd) { bd = d; best = v; } }
  return best;
};
// A new world each time, unless one is asked for by its number (?seed=), to see the same world again;
// or the world that was being played, if there is one kept (see `resume`).
const wanted = Number(new URLSearchParams(location.search).get('seed'));
let seed = wanted || 1 + Math.floor(Math.random() * 1e6);
const planet = new Planet(topo, nearest(0.1, 0.15, 0.98), seed);
planet.stonesFall = false; // until the lesson that shows them
const ecology = new Ecology(planet, topo);
const islands = new Islands(topo);

/** How far above the sea the land stands, drawn: heights are small, so the relief is raised. */
const RELIEF = 0.32;
const group = new THREE.Group();
scene.add(group);

/** Drawn on a surface of twice the detail, the values carried across smoothly (see fine.ts). */
const fine = new FineSurface(topo, buildTopology(new THREE.IcosahedronGeometry(1, 80).attributes.position.array, null));
const ftopo = fine.fine, FN = ftopo.vertexCount, fbase = ftopo.basePositions;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(FN * 3);
const landColour = new Float32Array(FN * 3), seaColour = new Float32Array(FN * 3), fineHeight = new Float32Array(FN);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(landColour, 3));
geometry.setAttribute('aSea', new THREE.BufferAttribute(seaColour, 3));
geometry.setAttribute('aH', new THREE.BufferAttribute(fineHeight, 1));
geometry.setIndex(new THREE.BufferAttribute(ftopo.triangles, 1));

/**
 * The ground's colour is chosen in each pixel rather than at each vertex: land and sea each have
 * their own colour carried across the surface, and where the height crosses the sea the one gives
 * way to the other in the space of a pixel, so the coast is a clean edge, not a smear.
 */
const material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'attribute vec3 aSea;\nattribute float aH;\nvarying vec3 vSea;\nvarying float vH;\nvoid main() {')
    .replace('#include <color_vertex>', '#include <color_vertex>\n  vSea = aSea;\n  vH = aH;');
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'varying vec3 vSea;\nvarying float vH;\nvoid main() {')
    .replace('#include <color_fragment>', `
      float edge = max(fwidth(vH), 1e-5) * 0.7;
      diffuseColor.rgb *= mix(vSea, vColor.rgb, smoothstep(-edge, edge, vH));`);
};
const mesh = new THREE.Mesh(geometry, material);
group.add(mesh);

const landPen = new PlotterLines({ ...defaultPlotterStyle, ink: '#6b4a2e', inkHigh: '#4a2f1c', pencil: '#b9a68c', alpha: 0.62, indexAlpha: 0.95, indexEvery: 5, fadeSeconds: 0, widthPx: 1.15 });
const seaPen = new PlotterLines({ ...defaultPlotterStyle, ink: '#5b82a3', inkHigh: '#5b82a3', pencil: '#a9bfd0', alpha: 0.45, indexAlpha: 0.6, fadeSeconds: 0, pen: false, appearSeconds: 2, widthPx: 0.95 });
/** Water-lining: close lines following the coast out to sea, as the old engraved maps drew it. */
const waterPen = new PlotterLines({ ...defaultPlotterStyle, ink: '#6b8fac', inkHigh: '#6b8fac', pencil: '#a9bfd0', alpha: 0.4, indexAlpha: 0.4, fadeSeconds: 0, pen: false, appearSeconds: 2, widthPx: 0.8 });
landPen.width = seaPen.width = waterPen.width = 2;
pens.push(landPen, seaPen, waterPen);
group.add(seaPen.object, waterPen.object, landPen.object);
/** Life by the sign of its kind; and breakers, short blue strokes, where the sea is wearing at a coast. */
const kindDots = KINDS.map((k) => new Stipple(k.ink, k.sign, k.sign === 'dot' ? 2.1 : 6));
const foam = new Stipple('#46708f', 'dash', 6);
for (const s of [...kindDots, foam]) group.add(s.object);
const puffs = new Puffs(renderer.getPixelRatio());
group.add(puffs.object);

/**
 * Marks on the surface, each a fine ink ring laid flat on the ground: whole, dashed (so many
 * dashes round) or dotted, as a surveyor marks a chart.
 */
function ring(color: string, opacity: number, inner = 0.9, dashes = 0, fill = 0.55): THREE.Mesh {
  const g = dashes
    ? mergeGeometries(Array.from({ length: dashes }, (_, i) => new THREE.RingGeometry(inner, 1, 6, 1, (i / dashes) * Math.PI * 2, (fill / dashes) * Math.PI * 2)))
    : new THREE.RingGeometry(inner, 1, 96);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.renderOrder = 5;
  group.add(m);
  return m;
}
const INK = '#2e2118';
/**
 * The pressure dial at the vent: the ring that grows is the pressure; the dashed ring is where a
 * flow becomes a burst; the double rule is where it bursts on its own and tears the mountain open.
 */
const pressureRing = ring(INK, 0.85, 0.9), burstBand = ring(INK, 0.55, 0.94, 28), capRing = ring(INK, 0.6, 0.96), capInner = ring(INK, 0.35, 0.965);
const dial = (share: number) => 0.02 + 0.08 * share;
/** The heat left: an arc round the dial, as long as the share of the heat still to come, drawing itself away. */
const heatArc = ring(INK, 0.5, 0.95);
let heatDrawn = -1;
function drawHeat(left: number): void {
  const f = Math.max(0, Math.min(1, left));
  if (Math.abs(f - heatDrawn) < 0.004) return;
  heatDrawn = f;
  heatArc.geometry.dispose();
  heatArc.geometry = new THREE.RingGeometry(0.95, 1, 96, 1, Math.PI / 2, Math.max(1e-4, f * Math.PI * 2));
}
/** The level: a bubble that sits at the vent when the world is level and moves uphill as it's tipped; out of the small circle, it pours. */
const levelRing = ring(INK, 0.45, 0.82);
const bubble = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
bubble.renderOrder = 6;
group.add(bubble);
/** The top of the world as it's held, where the heat is rising to (a small ring); a stone's ring and cross; a dotted ring where life wishes. */
const targetRing = ring(INK, 0.5, 0.8), stoneRing = ring(INK, 0.7, 0.95), wishRing = ring(INK, 0.6, 0.9, 40, 0.28);
const stoneCross = new THREE.Mesh(
  mergeGeometries([new THREE.PlaneGeometry(0.5, 0.035), new THREE.PlaneGeometry(0.035, 0.5)]),
  new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
);
stoneCross.renderOrder = 5;
group.add(stoneCross);

/** Paper, fresh basalt, ash; and lava in the vermilion the geological surveys gave it, deeper where thick. */
const PAPER = new THREE.Color('#ecdfc2'), BASALT = new THREE.Color('#9a8a76'), ASH = new THREE.Color('#b3ada2'), VERMILION = new THREE.Color('#b8563c'), DEEP_RED = new THREE.Color('#8f3b28');
const SHALLOW = new THREE.Color('#d4e3ec'), DEEP = new THREE.Color('#b1c8d8');
const c = new THREE.Color();

function surface(v: number): number {
  return planet.rock[v] + planet.lava[v];
}

// The simulation's values, a vertex at a time, before they are carried onto the finer surface.
const coarseHeight = new Float32Array(N), coarseLand = new Float32Array(N * 3), coarseSea = new Float32Array(N * 3);
const fineLife = new Float32Array(FN), fineWear = new Float32Array(FN);
function draw(): void {
  for (let v = 0; v < N; v++) {
    const h = surface(v), r = 1 + RELIEF * Math.max(0, h);
    topo.positions[v * 3] = base[v * 3] * r; topo.positions[v * 3 + 1] = base[v * 3 + 1] * r; topo.positions[v * 3 + 2] = base[v * 3 + 2] * r;
    coarseHeight[v] = h;
    const lava = planet.lava[v];
    // The sea, paler over the shallows; the land, fresh basalt weathering to paper, ash grey;
    // lava a flat vermilion wash, deeper where it lies thick.
    c.copy(SHALLOW).lerp(DEEP, Math.min(1, Math.max(0, -h) / 0.3));
    coarseSea[v * 3] = c.r; coarseSea[v * 3 + 1] = c.g; coarseSea[v * 3 + 2] = c.b;
    c.copy(PAPER).lerp(BASALT, Math.exp(-planet.age[v] / 30) * 0.7).lerp(ASH, planet.ash[v] * 0.5);
    if (lava > 0.002) c.lerp(VERMILION, Math.min(1, lava * 40)).lerp(DEEP_RED, Math.min(0.6, lava * 8));
    coarseLand[v * 3] = c.r; coarseLand[v * 3 + 1] = c.g; coarseLand[v * 3 + 2] = c.b;
  }
  fine.carryDrawn(coarseHeight, coarseLand, coarseSea, fineHeight, landColour, seaColour);
  const nm = ftopo.normals;
  for (let v = 0; v < FN; v++) {
    const r = 1 + RELIEF * Math.max(0, fineHeight[v]);
    const x = fbase[v * 3], y = fbase[v * 3 + 1], z = fbase[v * 3 + 2];
    positions[v * 3] = ftopo.positions[v * 3] = x * r;
    positions[v * 3 + 1] = ftopo.positions[v * 3 + 1] = y * r;
    positions[v * 3 + 2] = ftopo.positions[v * 3 + 2] = z * r;
    nm[v * 3] = x; nm[v * 3 + 1] = y; nm[v * 3 + 2] = z;
  }
  smoothNormals();
  for (const name of ['position', 'normal', 'color', 'aSea', 'aH']) geometry.getAttribute(name).needsUpdate = true;
}

/** The ground's normals, each the sum of its triangles' (weighted by their area), in plain arrays: three's own way is several times slower. */
const normals = new Float32Array(FN * 3);
geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1 + RELIEF);
function smoothNormals(): void {
  const t = ftopo.triangles, p = positions, nm = normals;
  nm.fill(0);
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c3 = t[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c3] - p[a], vy = p[c3 + 1] - p[a + 1], vz = p[c3 + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nm[a] += nx; nm[a + 1] += ny; nm[a + 2] += nz;
    nm[b] += nx; nm[b + 1] += ny; nm[b + 2] += nz;
    nm[c3] += nx; nm[c3 + 1] += ny; nm[c3 + 2] += nz;
  }
  for (let i = 0; i < nm.length; i += 3) {
    const l = Math.hypot(nm[i], nm[i + 1], nm[i + 2]) || 1;
    nm[i] /= l; nm[i + 1] /= l; nm[i + 2] /= l;
  }
}

// ---------------------------------------------------------------- the pen, life and surf
let lastLines = -1, lastQuiet = true, lastLife = -1;
function redrawLines(now: number): void {
  const busy = planet.molten > 0.01 || planet.erupting;
  // While lava runs, new ground is pencilled; once it has cooled, the pen inks it. The sea's
  // slow wearing is simply redrawn, now and then, as a map is corrected.
  const every = busy ? 0.5 : 2.5;
  if (now - lastLines < every && !(lastQuiet === false && !busy)) return;
  const mode: RevealMode = busy ? 'live' : lastQuiet ? 'settle' : 'ink';
  lastLines = now;
  lastQuiet = !busy;
  const h = fineHeight, sea = new Uint8Array(FN), land = new Uint8Array(FN);
  for (let v = 0; v < FN; v++) { if (h[v] < 0) sea[v] = 1; else land[v] = 1; }
  landPen.setLines(rounded(extractContours(ftopo, h, { interval: 0.035, lift: 0.003, mask: sea })), mode, facingPoint());
  seaPen.setLines(rounded(extractContours(ftopo, h, { interval: 0.07, lift: 0.002, mask: land })), 'settle');
  // The water-lines: the sea near the coast, held between just below the surface and a little
  // deeper, so its contours are close lines following the shore out.
  const held = new Float32Array(FN);
  for (let v = 0; v < FN; v++) held[v] = Math.min(-0.001, Math.max(-0.05, h[v]));
  waterPen.setLines(rounded(extractContours(ftopo, held, { interval: 0.011, lift: 0.0015, mask: land })), 'settle');
}

/** Scraps of line shorter than this are only the triangles showing, not the land: they're left out. */
const SCRAP = 0.02;

/**
 * Contours as a hand would draw them: each corner cut twice (Chaikin's rule, a quarter and three
 * quarters along every segment), so the little zigzags where a line crosses the triangles go, and
 * the scraps are dropped.
 */
function rounded(lines: Polyline[]): Polyline[] {
  const out: Polyline[] = [];
  for (const line of lines) {
    if (line.length < SCRAP) continue;
    let p = line.points;
    for (let pass = 0; pass < 2; pass++) p = chaikin(p, line.closed);
    let length = 0;
    const n = p.length / 3;
    for (let i = 1; i < n + (line.closed ? 1 : 0); i++) {
      const a = (i - 1) * 3, b = (i % n) * 3;
      length += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    }
    out.push({ ...line, points: p, length });
  }
  return out;
}

function chaikin(p: Float32Array, closed: boolean): Float32Array {
  const n = p.length / 3;
  if (n < 3) return p;
  const segs = closed ? n : n - 1, out: number[] = [];
  if (!closed) out.push(p[0], p[1], p[2]); // an open line keeps its ends where they are
  for (let s = 0; s < segs; s++) {
    const a = s * 3, b = ((s + 1) % n) * 3;
    for (const t of [0.25, 0.75]) out.push(p[a] + (p[b] - p[a]) * t, p[a + 1] + (p[b + 1] - p[a + 1]) * t, p[a + 2] + (p[b + 2] - p[a + 2]) * t);
  }
  if (!closed) out.push(p[(n - 1) * 3], p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]);
  return Float32Array.from(out);
}

/**
 * Life as stipple in the ink of its kind, denser where there's more of it; and surf, white dots
 * on the water just off coasts the sea is wearing, thicker the harder it works.
 */
function redrawLife(now: number): void {
  if (now - lastLife < 1.2) return;
  lastLife = now;
  const byKind = KINDS.map(() => [[], [], [], []] as number[][]), surf: number[][] = [[], [], []];
  const t = ftopo.triangles, P = ftopo.positions;
  fine.carry(planet.life, fineLife);
  fine.carry(planet.wear, fineWear);
  const push = (into: number[], a: number, b: number, d: number, lift: number) => {
    for (const v of [a, b, d]) into.push(P[v * 3] * lift, P[v * 3 + 1] * lift, P[v * 3 + 2] * lift);
  };
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], d = t[i + 2];
    const l = Math.min(fineLife[a], fineLife[b], fineLife[d]);
    if (l > 0.02) {
      const kind = ecology.kind[fine.nearestCoarse(a)];
      if (kind >= 0) push(byKind[kind][Math.min(3, Math.floor(l * 4))], a, b, d, 1.002);
    }
    const w = Math.max(fineWear[a], fineWear[b], fineWear[d]);
    if (w > 0.0003 && Math.min(fineHeight[a], fineHeight[b], fineHeight[d]) < 0) push(surf[Math.min(2, Math.floor(w / 0.0012))], a, b, d, 1.0015);
  }
  // Signs are set sparsely, as a map sets them, closer where there's more; moss is a fine stipple.
  kindDots.forEach((s, k) => s.set(byKind[k].flatMap((tris, lv) => stippleDots(tris, KINDS[k].sign === 'dot' ? 3000 + 7000 * lv : 220 + 420 * lv))));
  foam.set(surf.flatMap((tris, lv) => stippleDots(tris, 900 + 1500 * lv)));
}

/** Lay a ring flat on the ground above a point of the planet, at a given size. */
function place(m: THREE.Mesh, x: number, y: number, z: number, size: number): void {
  const up = new THREE.Vector3(x, y, z).normalize();
  const v = nearestAbove(up);
  const r = Math.max(1, new THREE.Vector3(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]).length());
  m.position.copy(up).multiplyScalar(r + 0.006);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  m.scale.setScalar(size);
}
function nearestAbove(u: THREE.Vector3): number {
  let v = planet.plumeVertex;
  const d = (w: number) => (base[w * 3] - u.x) ** 2 + (base[w * 3 + 1] - u.y) ** 2 + (base[w * 3 + 2] - u.z) ** 2;
  for (let moves = 0; moves < 400; moves++) {
    let best = v;
    for (let k = topo.nbrOffsets[v]; k < topo.nbrOffsets[v + 1]; k++) if (d(topo.nbrList[k]) < d(best)) best = topo.nbrList[k];
    if (best === v) break;
    v = best;
  }
  return v;
}
const at = (v: number) => [base[v * 3], base[v * 3 + 1], base[v * 3 + 2]] as const;

function drawMarks(now: number): void {
  const q = planet.plume, share = Math.min(1, planet.pressure / VOLCANO.cap);
  const live = !planet.over;
  pressureRing.visible = burstBand.visible = capRing.visible = capInner.visible = heatArc.visible = levelRing.visible = bubble.visible = live;
  // Nearly too much, and the ring trembles.
  const tremble = share > 0.85 ? 0.003 * Math.sin(now * 40) : 0.0015 * Math.sin(now * 3);
  place(pressureRing, q.x, q.y, q.z, dial(share) + tremble);
  place(burstBand, q.x, q.y, q.z, dial(VOLCANO.explosive / VOLCANO.cap));
  place(capRing, q.x, q.y, q.z, dial(1));
  place(capInner, q.x, q.y, q.z, dial(1) - 0.006);
  drawHeat(planet.heatLeft);
  place(heatArc, q.x, q.y, q.z, dial(1) + 0.022);
  // The level's small circle is as far as the bubble goes before the heat pours.
  place(levelRing, q.x, q.y, q.z, VOLCANO.tipPour * dial(1));
  const g = planet.gravity;
  if (g) {
    // Uphill along the ground at the vent, as far as the world is tipped.
    const n = Math.hypot(q.x, q.y, q.z), along = (g.x * q.x + g.y * q.y + g.z * q.z) / n;
    const ux = -(g.x - along * q.x / n), uy = -(g.y - along * q.y / n), uz = -(g.z - along * q.z / n);
    const r = Math.min(1, planet.tip) * dial(1);
    place(bubble, q.x + ux * r, q.y + uy * r, q.z + uz * r, 0.0065);
    (bubble.material as THREE.MeshBasicMaterial).color.set(planet.pouring ? '#9a4230' : INK);
  }
  // Past the dashed ring, the pressure ring is drawn in the lava's red: this one will be a burst.
  (pressureRing.material as THREE.MeshBasicMaterial).color.set(planet.bursting ? '#9a4230' : INK);
  const t = planet.target;
  targetRing.visible = !!t;
  if (t) place(targetRing, t.x, t.y, t.z, 0.02);
  const s = planet.impact;
  stoneRing.visible = stoneCross.visible = !!s;
  if (s) {
    place(stoneRing, ...at(s.vertex), VOLCANO.crater + 0.2 * (s.in / VOLCANO.impactWarning));
    place(stoneCross, ...at(s.vertex), 0.08);
    // In the lava's red, if the plume is under it and will catch its heat.
    const warm = planet.warmthAt(s.vertex) > 0.5 ? '#9a4230' : INK;
    (stoneRing.material as THREE.MeshBasicMaterial).color.set(warm);
    (stoneCross.material as THREE.MeshBasicMaterial).color.set(warm);
  }
  const w = ecology.wish;
  wishRing.visible = !!w;
  if (w) {
    (wishRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.15 * Math.sin(now * 1.2);
    place(wishRing, ...at(w.vertex), ECOLOGY.wishReach);
  }
}

// ---------------------------------------------------------------- labels on the map
const labelLayer = $('labels');
const labels = new Map<string, HTMLSpanElement>();
const PROJ = new THREE.Vector3(), NORMAL = new THREE.Vector3(), EYE = new THREE.Vector3();
/** Put a label at a vertex, lifted a little off the ground, faded towards the rim and hidden round the back. */
function label(key: string, text: string, v: number, small = false, dy = 0): void {
  let el = labels.get(key);
  if (!el) { el = document.createElement('span'); if (small) el.className = 'small'; labelLayer.appendChild(el); labels.set(key, el); }
  if (el.textContent !== text) el.textContent = text;
  PROJ.set(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]).multiplyScalar(1.01);
  group.localToWorld(PROJ);
  NORMAL.copy(PROJ).normalize();
  const facing = NORMAL.dot(EYE.copy(camera.position).sub(PROJ).normalize());
  PROJ.project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  el.style.left = `${((PROJ.x + 1) / 2) * r.width}px`;
  el.style.top = `${((1 - PROJ.y) / 2) * r.height + dy}px`;
  el.style.opacity = String(Math.max(0, Math.min(1, (facing - 0.3) / 0.3)) * (small ? 0.75 : 0.85));
  el.dataset.seen = '1';
}
function drawLabels(): void {
  for (const el of labels.values()) el.dataset.seen = '';
  if (!ending?.shown) {
    const w = ecology.wish;
    if (w) { const k = KINDS.find((x) => x.kind === w.kind)!; label('wish', `${k.name} ${/s$/.test(k.name) ? 'want' : 'wants'} ${k.wants}`, w.vertex, true, 48); }
    const s = planet.impact;
    if (s) label('stone', `a stone, in ${Math.ceil(s.in)}`, s.vertex, true, 22);
    const words = cue();
    if (words) label('cue', words.text, words.at, true, words.dy);
  }
  for (const [key, el] of labels) if (!el.dataset.seen) { el.remove(); labels.delete(key); }
}

// ---------------------------------------------------------------- touch
const raycaster = new THREE.Raycaster();
function pickAt(x: number, y: number): THREE.Vector3 | null {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  // Against a sphere a little above the sea, not the ground's many thousand triangles: close
  // enough for knowing whether a finger is on the world, and quick.
  const hit = raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1.01), new THREE.Vector3());
  return hit ? group.worldToLocal(hit).normalize() : null;
}
function facingPoint(): THREE.Vector3 {
  return group.worldToLocal(camera.position.clone().normalize());
}

const spin = new THREE.Vector2();
const turn = new THREE.Quaternion(), axis = new THREE.Vector3();
function rotate(ax: number, ay: number): void {
  turn.setFromAxisAngle(axis.set(0, 1, 0), ax); group.quaternion.premultiply(turn);
  turn.setFromAxisAngle(axis.set(1, 0, 0), ay); group.quaternion.premultiply(turn);
}
const finger = { x: 0, y: 0 };

const gestures = new GestureRecognizer(
  {
    tap() { /* a tap does nothing: it's all in how you hold the world */ },
    spin(dx, dy) { spin.set(0, 0); rotate(dx * 0.006, dy * 0.006); },
    fling(vx, vy) { spin.set(vx * 0.006, vy * 0.006); },
    zoom(f) { dist /= f; look(); zoomedAt = seconds; },
    grab() { /* nothing to take hold of */ },
    press() { /* nor to press */ },
    pull() { /* nor to pull */ },
    release() { /* nor to let go */ },
    drawer() { /* none */ },
  },
  (x, y) => pickAt(x, y) !== null,
);
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  finger.x = e.clientX; finger.y = e.clientY;
  gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
});
stage.addEventListener('pointermove', (e) => { finger.x = e.clientX; finger.y = e.clientY; gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
for (const type of ['pointerup', 'pointercancel'] as const) stage.addEventListener(type, (e) => gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp));
stage.addEventListener('wheel', (e) => { e.preventDefault(); gestures.wheel(e.deltaY); }, { passive: false });
/** On a keyboard, the arrows tip the world, a little at a time, as a hand would. */
const keys = new Set<string>();
addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(e.key));
function arrows(dt: number): void {
  const k = 1.1 * dt;
  if (keys.has('ArrowLeft')) rotate(-k, 0);
  if (keys.has('ArrowRight')) rotate(k, 0);
  if (keys.has('ArrowUp')) rotate(0, -k);
  if (keys.has('ArrowDown')) rotate(0, k);
}

// ---------------------------------------------------------------- cues, one idea at a time
/**
 * Each idea is brought in by a few words written on the world beside the vent (or where the
 * idea is), and only while it's new: they change with what the player is doing, and go once
 * the idea has been tried, or has been up long enough. Stones only begin to fall once they've
 * been shown.
 */
const CUES: { ready: () => boolean; done: (since: number) => boolean; begin?: () => void; words: () => { text: string; at: number; dy: number } | null }[] = [
  {
    ready: () => true, done: () => planet.landShare() > 0,
    words: () => ({ text: planet.pouring ? 'pouring' : planet.pressure < 2.5 ? 'hold it level' : 'now tip it', at: planet.plumeVertex, dy: -44 }),
  },
  {
    ready: () => true, done: (s) => planet.tally.bursts > 0 || s > 60,
    words: () => {
      const share = planet.pressure / VOLCANO.cap;
      if (planet.pouring) return null;
      return { text: share > 0.85 ? 'too long, and it tears open' : planet.bursting ? 'tip it now, for a burst' : 'level, to the dashed ring', at: planet.plumeVertex, dy: -44 };
    },
  },
  {
    ready: () => ecology.held.length > 0, done: (s) => ecology.kept > 0 || s > 80,
    begin: () => { $('legend').classList.add('new'); announce('Six kinds of life, each on its own ground'); },
    words: () => null,
  },
  {
    ready: () => true, done: (s) => s > 40,
    words: () => (planet.target ? { text: 'the heat rises here', at: nearestAbove(new THREE.Vector3(planet.target.x, planet.target.y, planet.target.z)), dy: -26 } : null),
  },
  {
    ready: () => true, begin: () => { planet.stonesFall = true; }, done: () => planet.tally.stones > 0,
    words: () => (planet.impact ? { text: 'turn it to the top to catch it', at: planet.impact.vertex, dy: 40 } : null),
  },
];
let lesson = 0, lessonSince = 0, lessonShown = false, embersSaid = false;
function lessons(): void {
  if (ending) return;
  if (lesson < CUES.length) {
    const L = CUES[lesson];
    if (!lessonShown) {
      if (!L.ready()) return;
      lessonShown = true; lessonSince = seconds;
      L.begin?.();
      return;
    }
    if (L.done(seconds - lessonSince) && seconds - lessonSince > 6) { lesson++; lessonShown = false; $('legend').classList.remove('new'); }
    return;
  }
  planet.stonesFall = true;
  if (!embersSaid && planet.era === 'embers') { embersSaid = true; announce('The heat is nearly gone. What lives when it is out is what your world keeps'); }
}
function cue(): { text: string; at: number; dy: number } | null {
  return lesson < CUES.length && lessonShown && !ending ? CUES[lesson].words() : null;
}

/** A soft pulse in the hand, where the phone can give one (not iPhones). */
function feel(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* none */ }
}

// ---------------------------------------------------------------- words, and the key
const ERAS: Record<Era, string> = { young: 'The young fire', burning: 'The long burning', cooling: 'The cooling', embers: 'The last embers', out: 'The fire is out' };
let shownEra: Era = 'young';
const eraFrom: { name: string; from: number }[] = [{ name: ERAS.young, from: 0 }];
const queue: string[] = [];
let showingUntil = 0;
function announce(text: string): void {
  queue.push(text);
}
function showNext(): void {
  const e = $('event');
  if (seconds < showingUntil) return;
  if (!queue.length) { e.classList.remove('shown'); return; }
  e.textContent = queue.shift()!;
  e.classList.add('shown');
  showingUntil = seconds + 3.2;
}
/** The key at the foot: the six kinds by their signs, faint until the kind is living, then inked. */
const SIGN_SVG: Record<string, string> = {
  dot: '<circle cx="6" cy="6" r="1.6" fill="currentColor"/>',
  ring: '<circle cx="6" cy="6" r="3.4" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  cross: '<path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.1"/>',
  dash: '<path d="M2 6h8" stroke="currentColor" stroke-width="1.2"/>',
  tuft: '<path d="M1.5 8.5h9M6 8.5V3.5M3.3 8.5l-0.6-4M8.7 8.5l0.6-4" stroke="currentColor" stroke-width="1" fill="none"/>',
  caret: '<path d="M2 8.5L6 3.5L10 8.5" stroke="currentColor" stroke-width="1.1" fill="none"/>',
};
const kindEls = KINDS.map((k) => {
  const b = document.createElement('span');
  b.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12">${SIGN_SVG[k.sign]}</svg> ${k.name}`;
  b.style.color = k.ink;
  b.title = `${k.name}: ${k.wants}`;
  $('legend').appendChild(b);
  return b;
});
function words(): void {
  const era = planet.era;
  if (era !== shownEra && !ending) { shownEra = era; $('stage-name').textContent = ERAS[era]; eraFrom.push({ name: ERAS[era], from: planet.seconds }); }
  for (const text of planet.news.splice(0)) {
    if (!ending) announce(text);
    if (/wish kept|takes in|Land breaks/.test(text)) feel(12);
    else if (/The stone falls/.test(text)) feel(30);
  }
  const living = new Set(ecology.living);
  KINDS.forEach((k, i) => { kindEls[i].style.opacity = living.has(k.kind) ? '1' : '0.3'; });
}

// ---------------------------------------------------------------- what happens, seen and felt
const tallied = { ...planet.tally };
let steamIn = 0, smokeIn = 0;
function effects(dt: number): void {
  const p = topo.positions, v0 = planet.plumeVertex;
  if (planet.tally.bursts > tallied.bursts || planet.tally.calderas > tallied.calderas) {
    const torn = planet.tally.calderas > tallied.calderas;
    feel(torn ? [40, 60, 90] : 25);
    // The column of ash: many puffs from the vent, rising and spreading.
    for (let i = 0; i < (torn ? 80 : 40); i++) puffs.add('ash', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], torn ? 1.6 : 1);
  }
  Object.assign(tallied, planet.tally);
  // Steam where lava runs into the sea, as much as there is lava there.
  steamIn -= dt;
  if (steamIn <= 0) {
    steamIn = 0.12;
    for (let v = 0; v < N; v++) {
      const l = planet.lava[v];
      if (l > 0.004 && planet.rock[v] < 0.005 && Math.random() < Math.min(0.25, l * 4)) puffs.add('steam', p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
    }
  }
  // A vent near bursting smokes.
  smokeIn -= dt;
  if (planet.bursting && !planet.over && smokeIn <= 0) { smokeIn = 0.25 / Math.min(1, planet.pressure / VOLCANO.cap + 0.2); puffs.add('smoke', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2]); }
}

const PLUME = new THREE.Vector3(), SWING = new THREE.Quaternion();

// ---------------------------------------------------------------- the end
/**
 * When the fire is out, a long age passes quickly, the sea and the rain at work on what you
 * made, and then the chart is drawn round the world as it's left, in place: a pen goes round
 * the border, and the eras and what lasted come in at the foot. The world can still be turned
 * and looked at; turning it right round begins another.
 */
const LONG_AGE = 360, AGE_SPEED = 14, DRAWING = 7, TURN_AGAIN = 2.6;
let ending: { from: number; shown: boolean; at: number; info: ChartInfo | null; turned: number } | null = null;
function theEnd(): void {
  if (!ending && planet.over) {
    ending = { from: planet.seconds, shown: false, at: 0, info: null, turned: 0 };
    $('stage-name').textContent = ERAS.out;
    queue.length = 0;
    announce('The fire is out. A long age passes');
  }
  if (ending && !ending.shown && planet.seconds - ending.from >= LONG_AGE) {
    ending.shown = true;
    ending.at = seconds;
    ecology.update(0);
    ending.info = chartInfo();
    $('stage-name').textContent = ending.info.title;
    void forget(); // the world is finished: nothing to come back to
  }
}

const SHORT: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/Land breaks the surface/, () => 'first land'],
  [/Life begins in/, () => 'life begins'],
  [/Moss takes/, () => 'moss'],
  [/The first (\w+)/, (m) => m[1]],
  [/A wish kept/, () => 'a wish kept'],
  [/tears open/, () => 'a caldera'],
  [/takes in the stone/, () => 'a stone caught'],
  [/The stone falls/, () => 'a stone falls'],
];
function chartInfo(): ChartInfo {
  const living = new Set(ecology.living), seen = new Set<string>(), events: { t: number; text: string }[] = [];
  for (const e of planet.log) {
    for (const [re, f] of SHORT) {
      const m = e.text.match(re);
      if (m) { const s = f(m); if (!seen.has(s)) { seen.add(s); events.push({ t: e.t, text: s }); } break; }
    }
  }
  const length = ending!.from, mm = `${Math.floor(length / 60)}:${String(Math.floor(length % 60)).padStart(2, '0')}`;
  const eras = eraFrom.filter((e) => e.from < length).map((e, i, all) => ({ name: e.name.replace(/^The /, ''), from: e.from, to: i + 1 < all.length ? all[i + 1].from : length }));
  const count = islands.list.length;
  return {
    title: count ? 'What lasted' : 'A world of water',
    subtitle: `world ${seed} · ${mm} of fire · ${count === 0 ? 'no land' : count === 1 ? 'one island' : `${count} islands`}`,
    kinds: KINDS.map((k) => ({ name: k.name, ink: k.ink, sign: k.sign, living: living.has(k.kind) })),
    summary: `${living.size} of ${KINDS.length} kinds of life lasted · ${ecology.kept} ${ecology.kept === 1 ? 'wish' : 'wishes'} kept`,
    length,
    eras,
    events,
  };
}

/** The chart's canvas, over the world, in device pixels. */
const frameCanvas = $('frame') as HTMLCanvasElement;
const frameInk = frameCanvas.getContext('2d')!;
function sizeFrame(w: number, h: number): void {
  const k = renderer.getPixelRatio();
  frameCanvas.width = Math.round(w * k); frameCanvas.height = Math.round(h * k);
  frameDrawn = -1;
}
let frameDrawn = -1;
/** Draw the chart round the world, as far as it has got; and, once it's drawn, see whether the world has been turned right round. */
function drawEnding(): void {
  if (!ending?.shown || !ending.info) return;
  const progress = Math.min(1, (seconds - ending.at) / DRAWING);
  if (progress !== frameDrawn) {
    frameDrawn = progress;
    drawFrame(frameInk, frameCanvas.width, frameCanvas.height, renderer.getPixelRatio(), ending.info, progress, 64);
  }
  if (progress >= 1) {
    $('again').classList.add('shown');
    $('keep').classList.add('shown');
  }
}
/** How far the world has been turned since the chart was drawn, by any means: gravity's swing in the planet's frame. */
const LAST_DOWN = new THREE.Vector3(), NOW_DOWN = new THREE.Vector3();
function turnedSince(): void {
  if (!ending?.shown || seconds - ending.at < DRAWING) { LAST_DOWN.copy(GRAV); return; }
  NOW_DOWN.copy(GRAV);
  ending.turned += Math.acos(Math.max(-1, Math.min(1, LAST_DOWN.dot(NOW_DOWN))));
  LAST_DOWN.copy(NOW_DOWN);
  if (ending.turned > TURN_AGAIN) { ending.turned = -1e9; anew(); }
}
/** A new world: the page fades to paper, and comes back with nothing on it. */
function anew(): void {
  void forget();
  $('begin').classList.remove('gone');
  const q = new URLSearchParams(location.search);
  q.delete('seed');
  setTimeout(() => { location.search = q.toString(); }, 900);
}
$('keep').addEventListener('click', () => {
  // The plate, as a picture: the world drawn once more, turned so its land faces us.
  const biggest = islands.list.slice().sort((a, b) => b.vertices.length - a.vertices.length)[0];
  const was = group.quaternion.clone();
  if (biggest) {
    PLUME.set(...at(biggest.centre)).applyQuaternion(group.quaternion);
    group.quaternion.premultiply(SWING.setFromUnitVectors(PLUME, new THREE.Vector3(0, 0, 1)));
  }
  group.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const url = drawChart(renderer.domElement, ending!.info!).toDataURL('image/png');
  group.quaternion.copy(was);
  const a = document.createElement('a'); a.href = url; a.download = `volcano-${seed}.png`; a.click();
});

// ---------------------------------------------------------------- held like a globe
/**
 * Which way is down, in the camera's frame (x right, y up, z towards you). Without a phone's
 * sense of it, down the screen a little and mostly into it, as if looking down at a globe on a
 * table; with one, as the phone is held, smoothed so a shaking hand doesn't slop the lava about.
 */
const LEVEL = new THREE.Vector3(0, -0.3, -1).normalize();
const held = LEVEL.clone();
const sensed = new THREE.Vector3();
/** However the phone was held when the game began counts as level: this turns that way of holding it to LEVEL. */
const calibrate = new THREE.Quaternion();
let sensing = false;
function onTilt(e: DeviceOrientationEvent): void {
  if (e.beta === null || e.gamma === null) return;
  const b = THREE.MathUtils.degToRad(e.beta), g = THREE.MathUtils.degToRad(e.gamma);
  // Gravity in the phone's frame, from how it's tipped forward (beta) and sideways (gamma)...
  let x = Math.sin(g) * Math.cos(b), y = -Math.sin(b);
  const z = -Math.cos(g) * Math.cos(b);
  // ...turned with the screen, if it's been turned on its side.
  const turned = THREE.MathUtils.degToRad(screen.orientation?.angle ?? 0);
  [x, y] = [x * Math.cos(turned) + y * Math.sin(turned), -x * Math.sin(turned) + y * Math.cos(turned)];
  sensed.set(x, y, z);
  if (!sensing) { sensing = true; calibrate.setFromUnitVectors(sensed.clone().normalize(), LEVEL); }
  sensed.applyQuaternion(calibrate);
}
let asked = false;
function askForTilt(): void {
  if (asked) return;
  asked = true;
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (D?.requestPermission) D.requestPermission().then((r) => { if (r === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
  else addEventListener('deviceorientation', onTilt);
}

/** The hand's tilt, smoothed a little each frame so a shaking hand doesn't slop the lava about. */
function drawLevel(): void {
  if (sensing) held.lerp(sensed, 0.15);
}

// ---------------------------------------------------------------- keeping the world
/** Everything the world is, as it's kept: the planet, its life, its islands, and where the page had got to. */
interface Kept {
  seed: number;
  planet: Record<string, unknown>;
  ecology: Record<string, unknown>;
  islands: Record<string, unknown>;
  page: { lesson: number; embersSaid: boolean; shownEra: Era; eraFrom: { name: string; from: number }[]; turn: number[]; dist: number };
}
function world(): Kept {
  return {
    seed,
    planet: snapshotOf(planet, ['topo', 'next', 'firmness', 'scale', 'news']),
    ecology: snapshotOf(ecology, ['pl', 'topo', 'scale']),
    islands: snapshotOf(islands, ['topo', 'scale']),
    page: { lesson, embersSaid, shownEra, eraFrom: eraFrom.slice(), turn: group.quaternion.toArray() as number[], dist },
  };
}
let keptAt = 0;
function save(): void {
  if (!begun || ending) return;
  keptAt = seconds;
  void keep(world());
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });

/** Take up the kept world, if there is one and no other was asked for. */
async function resume(): Promise<boolean> {
  if (wanted) return false;
  const w = await recall<Kept>();
  if (!w || !w.planet) return false;
  seed = w.seed;
  restoreInto(planet, w.planet, ['plume', 'tally', 'drift', 'wear']);
  restoreInto(ecology, w.ecology);
  restoreInto(islands, w.islands);
  lesson = w.page.lesson; embersSaid = w.page.embersSaid; shownEra = w.page.shownEra;
  eraFrom.length = 0; eraFrom.push(...w.page.eraFrom);
  group.quaternion.fromArray(w.page.turn);
  dist = w.page.dist; look();
  $('stage-name').textContent = ERAS[shownEra];
  Object.assign(tallied, planet.tally);
  draw();
  lastLines = -1; redrawLines(1e6);
  return true;
}

/**
 * The first touch begins the world: it's what lets a phone share how it's held, so it's asked
 * for once, on a quiet card. A world that was kept is taken up where it was left.
 */
let begun = false;
$('begin').addEventListener('pointerdown', () => {
  if (begun) return;
  begun = true;
  askForTilt();
  $('begin').classList.add('gone');
});
void resume().then((back) => {
  if (!back) return;
  ($('begin').querySelector('.first') as HTMLElement).textContent = 'Your world, as you left it.';
  ($('begin').querySelector('.then') as HTMLElement).textContent = 'However you hold it now is level.';
  ($('begin').querySelector('.touch') as HTMLElement).textContent = 'touch to return to it';
});

// ---------------------------------------------------------------- the camera, and the pace
/**
 * The camera breathes with the land: close while there's little, easing out as it spreads, so
 * the whole of what you've made is in view; a pinch takes over for a while.
 */
let zoomedAt = -100, lastReach = -10, reachDist = 3.2;
function breathe(dt: number): void {
  if (seconds - lastReach > 2) {
    lastReach = seconds;
    // How far the land reaches from the vent, as an angle.
    const q = planet.plume;
    let least = 1;
    for (let v = 0; v < N; v += 3) if (planet.rock[v] > 0) least = Math.min(least, base[v * 3] * q.x + base[v * 3 + 1] * q.y + base[v * 3 + 2] * q.z);
    reachDist = THREE.MathUtils.clamp(2.9 + 2.4 * Math.acos(least), 2.9, 4.6);
  }
  // At the end, the world steps back and up the page, leaving the foot for the chart.
  const want = ending?.shown ? farthest * 0.92 : reachDist, wantLift = ending?.shown ? 0.09 : 0;
  if (!ending?.shown && seconds - zoomedAt < 10) return;
  const d = dist + (want - dist) * Math.min(1, 0.4 * dt), l = lift + (wantLift - lift) * Math.min(1, 0.6 * dt);
  if (Math.abs(d - dist) > 1e-4 || Math.abs(l - lift) > 1e-5) { dist = d; lift = l; look(); }
}
/** If the phone can't keep up, draw a little less finely: the pixel ratio comes down a half at a time, to no less than 1. */
let slowFor = 0, frameTime = 1 / 60;
function pace(raw: number): void {
  frameTime += (raw - frameTime) * 0.05;
  slowFor = frameTime > 1 / 36 ? slowFor + raw : 0;
  if (slowFor > 3 && pixelRatio > 1) {
    slowFor = 0;
    pixelRatio = Math.max(1, pixelRatio - 0.5);
    renderer.setPixelRatio(pixelRatio);
    fit();
  }
}

// ---------------------------------------------------------------- the loop
const INVERSE = new THREE.Quaternion(), GRAV = new THREE.Vector3();
fit();
draw();
redrawLines(0);
const clock = new THREE.Clock();
let seconds = 0, lastWords = 0, lastDraw = 0, lastIslands = 0, lastEcology = 0;
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 1 / 20);
  seconds += dt;
  pace(raw);
  gestures.tick(performance.now(), dt);
  if (spin.lengthSq() > 1e-6) { rotate(spin.x * dt, spin.y * dt); spin.multiplyScalar(Math.exp(-2.2 * dt)); }
  arrows(dt);
  // Gravity as the phone is held (or, without one, a little down the screen and into it), in the planet's frame.
  INVERSE.copy(group.quaternion).invert();
  GRAV.copy(held).normalize().applyQuaternion(INVERSE);
  planet.gravity = { x: GRAV.x, y: GRAV.y, z: GRAV.z };
  drawLevel();
  // Once the fire is out, the long age runs quickly, in small steps so the sea's work stays as it would be.
  const speed = ending && !ending.shown ? AGE_SPEED : 1;
  // Nothing happens until the world is begun.
  if (begun && !ending?.shown) for (let k = 0; k < speed; k++) planet.step(dt);
  // The surface is redrawn often while lava runs, and now and then while only the slow forces work.
  const flowing = planet.erupting || planet.molten > 0.01;
  if (seconds - lastDraw >= (flowing || speed > 1 ? 1 / 24 : 0.5)) { lastDraw = seconds; draw(); }
  if (begun && seconds - lastEcology >= 1) { ecology.update((seconds - lastEcology) * speed); lastEcology = seconds; }
  if (begun && seconds - lastIslands >= 2) {
    lastIslands = seconds;
    for (const _ of islands.update(planet.rock, planet.seconds)) {
      const first = !planet.log.some((l) => l.text.startsWith('Land breaks'));
      planet.tell(first ? 'Land breaks the surface' : 'A new island rises');
    }
  }
  redrawLines(seconds);
  redrawLife(seconds);
  drawMarks(seconds);
  effects(dt);
  landPen.update(dt, camera);
  seaPen.update(dt, camera);
  waterPen.update(dt, camera);
  for (const s of [...kindDots, foam]) s.update(dt);
  puffs.update(dt * speed);
  if (begun) breathe(dt);
  if (begun && seconds - lastWords > 0.5) { lastWords = seconds; words(); theEnd(); lessons(); }
  if (begun && seconds - keptAt > 15) save();
  showNext();
  renderer.render(scene, camera);
  drawLabels();
  drawEnding();
  turnedSince();
});

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { planet, ecology, islands, rotate, draw, save, lines: () => { lastLines = -1; redrawLines(1e6); } };
