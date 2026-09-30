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
 * Nothing on the world is a control or a gauge; what it's doing shows as itself:
 *   the vent has no mark of its own: the heat gathering beneath it rises as
 *     smoke, a wisp while there's little, heavier as it builds, a dark column
 *     once it would burst;
 *   tipped, the lava is seen to pour;
 *   a few of a kind's signs pencilled where life wishes for it, and a small
 *     star where a stone will fall.
 * No words are written on the world: what's new is told in a quiet line at the foot.
 * Off the world there is only the era, as a map's title, and at the foot the
 * key: the six kinds of life by their signs, inked once each is living. The
 * world is kept as it's played; when the fire is out, the chart is drawn round
 * it, and turning the world begins another.
 */
import * as THREE from 'three';
import { buildTopology } from '../mesh/topology';
import { unpack, type Packed } from './drafting';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from '../render/plotterLines';
import { GestureRecognizer } from '../interact/gestures';
import { Stipple } from '../render/stipple';
import { signSvg } from '../render/signs';
import { Planet, VOLCANO, type Era } from './sim';
import { FineSurface } from './fine';
import { Ecology, KINDS } from './ecology';
import { Islands } from './islands';
import { Puffs } from './puffs';
import { drawChart, drawFrame, sign, type ChartInfo } from './chart';
import DraftsWorker from './drafts.worker?worker&inline';
import SurfaceWorker from './surface.worker?worker&inline';
import { handleDrafts } from './drafts';
import { handleSurface } from './surface';
import { offThread } from './offthread';
import { snapshotOf, restoreInto, keep, recall, forget } from './save';
import { worldOf, nextWorld, WORLDS } from './worlds';
import { Chain, CHAIN } from './chain';

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

let dist = 3.6, farthest = 5;
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
/**
 * Which world: the one asked for (?world=), or the one being played, or the first. Each has its
 * own rules, aim and colours (worlds.ts).
 */
const WORLD = worldOf(new URLSearchParams(location.search).get('world') ?? remembered('volcano.world'));
remember('volcano.world', WORLD.id);
const P = WORLD.palette, LIFE = WORLD.rules.life !== false;
function remembered(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* not remembered, and that's all */ }
}
const planet = new Planet(topo, nearest(0.1, 0.15, 0.98), seed, WORLD.rules);
planet.stonesFall = !LIFE; // on a living world, not until life's ideas have come in (see `lessons`)
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
const landColour = new Float32Array(FN * 3), fineHeight = new Float32Array(FN);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(landColour, 3));
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
    .replace('void main() {', 'attribute float aH;\nvarying float vH;\nvarying vec3 vDir;\nvoid main() {')
    .replace('#include <color_vertex>', '#include <color_vertex>\n  vH = aH;\n  vDir = normalize(position);');
  // The sea's colour is only its depth, so it's worked out here rather than sent: paler over the shallows.
  shader.uniforms.uShallow = { value: SHALLOW };
  shader.uniforms.uDeep = { value: DEEP };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `uniform vec3 uShallow;\nuniform vec3 uDeep;\nvarying float vH;\nvarying vec3 vDir;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p), s = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), s.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), s.x), s.y),
                   mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), s.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), s.x), s.y), s.z);
      }
      void main() {`)
    .replace('#include <color_fragment>', `
      float edge = max(fwidth(vH), 1e-5) * 0.7;
      vec3 sea = mix(uShallow, uDeep, clamp(-vH / 0.3, 0.0, 1.0));
      // The land's colour laid on as watercolour is: never quite even, a little darker where it
      // pooled and lighter where it thinned, in soft blotches fixed to the ground.
      float pool = noise3(vDir * 38.0) * 0.6 + noise3(vDir * 110.0) * 0.4;
      vec3 land = vColor.rgb * (0.95 + 0.1 * pool);
      diffuseColor.rgb *= mix(sea, land, smoothstep(-edge, edge, vH));`);
};
const mesh = new THREE.Mesh(geometry, material);
group.add(mesh);

const landPen = new PlotterLines({ ...defaultPlotterStyle, ink: P.landInk, inkHigh: P.landInkHigh, pencil: P.pencil, alpha: 0.62, indexAlpha: 0.95, indexEvery: 5, fadeSeconds: 0, widthPx: 1.15, nib: false, steady: true }); // no nib: nothing on the world should look like something to press
const seaPen = new PlotterLines({ ...defaultPlotterStyle, ink: P.seaInk, inkHigh: P.seaInk, pencil: '#a9bfd0', alpha: 0.45, indexAlpha: 0.6, fadeSeconds: 0, pen: false, appearSeconds: 2, widthPx: 0.95, steady: true });
/** Water-lining: close lines following the coast out to sea, as the old engraved maps drew it. */
const waterPen = new PlotterLines({ ...defaultPlotterStyle, ink: P.waterInk, inkHigh: P.waterInk, pencil: '#a9bfd0', alpha: 0.4, indexAlpha: 0.4, fadeSeconds: 0, pen: false, appearSeconds: 2, widthPx: 0.8, steady: true });
landPen.width = seaPen.width = waterPen.width = 2;
pens.push(landPen, seaPen, waterPen);
group.add(seaPen.object, waterPen.object, landPen.object);
/** Life by the sign of its kind; and breakers, short blue strokes, where the sea is wearing at a coast. */
const kindDots = KINDS.map((k) => new Stipple(k.ink, k.sign, k.sign === 'dot' ? 1.7 : k.sign === 'tree' ? 5.5 : 4.5, { ink2: k.ink2 }));
const foam = new Stipple('#46708f', 'dash', 6);
for (const s of [...kindDots, foam]) {
  s.byDirection = true;
  s.linger = 3; // come and go slowly: nothing pops
  // Signs are printed on the map, over the ground, not cut by it where a slope rises past them
  // (the far side of the world fades them away regardless).
  (s.object.material as THREE.Material).depthTest = false;
  group.add(s.object);
}
const puffs = new Puffs(renderer.getPixelRatio());
group.add(puffs.object);

/**
 * A mark on the map: drawn once on a small canvas, in white so it can be inked any colour, and
 * set on the world as a sprite, so it stands upright however the world is turned, as the signs on
 * a map do.
 */
function mark(draw: (g: CanvasRenderingContext2D) => void, foot = 0.5): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sprite.center.set(0.5, foot);
  sprite.renderOrder = 7;
  sprite.visible = false;
  group.add(sprite);
  return sprite;
}
const INK = '#2e2118';
/** Where a stone will fall: a small star of six strokes, the old sign for a hazard. */
const stoneMark = mark((g) => {
  g.lineWidth = 3.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    g.beginPath(); g.moveTo(32 - 18 * Math.cos(a), 32 - 18 * Math.sin(a)); g.lineTo(32 + 18 * Math.cos(a), 32 + 18 * Math.sin(a)); g.stroke();
  }
});
/**
 * Where life wishes for a kind: a few of that kind's own signs, sketched in broken pencil where
 * they would stand, as a surveyor pencils what is yet to be inked.
 */
const wishMarks = KINDS.map((k) => mark((g) => {
  g.setLineDash([3.5, 3]);
  for (const [x, y, r] of [[22, 38, 11], [42, 36, 11], [32, 22, 10]]) sign(g, k.sign, x, y, r, '#ffffff', 1.8);
}));

/** Paper, fresh basalt, ash; and lava in the vermilion the geological surveys gave it, deeper where thick. */
const PAPER = new THREE.Color(P.paper), BASALT = new THREE.Color(P.basalt), ASH = new THREE.Color(P.ash), VERMILION = new THREE.Color(P.lava), DEEP_RED = new THREE.Color(P.deepLava);
const FLOODED = P.flooded ? new THREE.Color(P.flooded) : null;
const SHALLOW = new THREE.Color(P.shallow), DEEP = new THREE.Color(P.deep);
const rgb = (c: THREE.Color) => [c.r, c.g, c.b];
const [PA, BA, AS, VE, DR] = [PAPER, BASALT, ASH, VERMILION, DEEP_RED].map(rgb);
const FL = FLOODED ? rgb(FLOODED) : null;
/**
 * Life's own wash: where something lives, the ground takes its kind's colour, as the hand-coloured
 * maps washed woods green, in a thin watercolour over the paper, stronger the more there is.
 * (The reef's is left to its signs: the sea's colour is its depth alone.)
 */
const WASH = KINDS.map((k) => (k.kind === 'reef' ? null : rgb(new THREE.Color(k.ink).lerp(PAPER, 0.25))));
const WASH_STRENGTH = 0.9;
/** The wash as it's drawn, each vertex's colour and strength eased toward what lives there, so it comes and goes softly. */
const washTint = new Float32Array(N * 3), washWeight = new Float32Array(N);
let washedAt = -1;

function surface(v: number): number {
  return planet.rock[v] + planet.lava[v];
}

// The simulation's values, a vertex at a time, before they are carried onto the finer surface.
const coarseHeight = new Float32Array(N), coarseLand = new Float32Array(N * 3);
/** The simulation's heights and colours, a vertex at a time, ready to be carried onto the finer surface. */
function coarse(): void {
  // How far the wash eases this time: by the seconds since last, over a second or two.
  const now = performance.now() / 1000, ease = washedAt < 0 ? 1 : 1 - Math.exp(-(now - washedAt) / 1.5);
  washedAt = now;
  for (let v = 0; v < N; v++) {
    const h = surface(v), r = 1 + RELIEF * Math.max(0, h);
    topo.positions[v * 3] = base[v * 3] * r; topo.positions[v * 3 + 1] = base[v * 3 + 1] * r; topo.positions[v * 3 + 2] = base[v * 3 + 2] * r;
    coarseHeight[v] = h;
    const lava = planet.lava[v];
    // The sea, paler over the shallows; the land, fresh basalt weathering to paper, ash grey;
    // lava a flat vermilion wash, deeper where it lies thick. (Plain arithmetic, not Colors: this
    // is sixteen thousand vertices, many times a second.)
    const v3 = v * 3;
    const fresh = planet.age[v] < 200 ? Math.exp(-planet.age[v] / 30) * 0.7 : 0, ash = planet.ash[v] * 0.5;
    const hot = lava > 0.002 ? Math.min(1, lava * 40) : 0, deep = lava > 0.002 ? Math.min(0.6, lava * 8) : 0;
    const kind = LIFE ? ecology.kind[v] : -1, wash = kind >= 0 ? WASH[kind] : null, washBy = wash ? WASH_STRENGTH * Math.min(1, planet.life[v]) * (1 - hot) : 0;
    washWeight[v] += (washBy - washWeight[v]) * ease;
    for (let i = 0; i < 3; i++) {
      let x = PA[i] + (BA[i] - PA[i]) * fresh;
      // Where a world keeps the mark of it (the Moon's seas), ground lava has lain on stays dark.
      if (FL && planet.age[v] < 1e5) x += (FL[i] - x) * 0.85;
      x += (AS[i] - x) * ash;
      x += (VE[i] - x) * hot;
      x += (DR[i] - x) * deep;
      if (wash) washTint[v3 + i] += (wash[i] - washTint[v3 + i]) * (washWeight[v] < 0.05 ? 1 : ease);
      x += (washTint[v3 + i] - x) * washWeight[v];
      coarseLand[v3 + i] = x;
    }
  }
}

/**
 * Redraw the surface: worked out in its own worker (surface.worker.ts) and taken up when it comes
 * back, so the world turns smoothly while the lava runs; only one is ever out at a time.
 */
/** In development, `?noworker` tries the page without workers, as a strict page would be. */
const noWorkers = import.meta.env.DEV && location.search.includes('noworker');
const shaper = offThread(() => { if (noWorkers) throw new Error('no workers'); return new SurfaceWorker(); }, handleSurface);
shaper.post({ init: { parts: fine.parts, triangles: ftopo.triangles.slice(), basePositions: fbase.slice(), relief: RELIEF } });
let shapeOut = false;
shaper.onmessage = (data) => {
  const d = data as { height: Float32Array; land: Float32Array; position: Float32Array; normal: Float32Array };
  fineHeight.set(d.height); landColour.set(d.land); positions.set(d.position); normals.set(d.normal);
  for (const name of ['position', 'normal', 'color', 'aH']) geometry.getAttribute(name).needsUpdate = true;
  shapeOut = false;
};
function draw(): void {
  if (shapeOut) return;
  coarse();
  shapeOut = true;
  const height = coarseHeight.slice(), land = coarseLand.slice();
  shaper.post({ shape: { height, land } }, [height.buffer, land.buffer]);
}

/** Redraw the surface here and now: at the start, on taking up a kept world, and for the kept chart. */
function drawNow(): void {
  coarse();
  fine.carryDrawn(coarseHeight, coarseLand, fineHeight, landColour);
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
  for (const name of ['position', 'normal', 'color', 'aH']) geometry.getAttribute(name).needsUpdate = true;
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
/**
 * The lines and signs are drafted in a worker (drafting.ts), so the world turns smoothly while
 * the contours are worked out: the page sends heights, and takes up the lines when they come.
 * Only one of each is ever out at a time; if the world has changed again meanwhile, the next is
 * asked for when the last comes back.
 */
const drafts = offThread(() => { if (noWorkers) throw new Error('no workers'); return new DraftsWorker(); }, handleDrafts);
const nearestOf = Uint32Array.from({ length: FN }, (_, f) => fine.nearestCoarse(f));
drafts.post({ init: { triangles: ftopo.triangles.slice(), basePositions: fbase.slice(), relief: RELIEF, parts: fine.parts, nearest: nearestOf } });
let linesOut: { mode: RevealMode; from: THREE.Vector3 } | null = null, lifeOut = false;
drafts.onmessage = (data) => {
  const d = data as { lines?: { land: Packed; sea: Packed; water: Packed }; life?: { kinds: Float32Array[]; foam: Float32Array } };
  if (d.lines && linesOut) {
    // Taken up on the next frame that has room, not now: see `chores`.
    const { mode, from } = linesOut, got = d.lines;
    // A pen to a frame.
    chores.push(() => landPen.setLines(unpack(got.land), mode, from), () => seaPen.setLines(unpack(got.sea), 'settle'), () => waterPen.setLines(unpack(got.water), 'settle'));
    linesOut = null;
  }
  if (d.life) {
    const got = d.life;
    // A kind to a frame.
    kindDots.forEach((s, k) => chores.push(() => s.set(got.kinds[k])));
    chores.push(() => foam.set(got.foam));
    lifeOut = false;
  }
};
function redrawLines(now: number): void {
  if (linesOut) return;
  const busy = planet.molten > 0.01 || planet.erupting;
  // While lava runs, new ground is pencilled; once it has cooled, the pen inks it. The sea's
  // slow wearing is simply redrawn, now and then, as a map is corrected.
  const every = busy ? 0.5 : 2.5;
  if (now - lastLines < every && !(lastQuiet === false && !busy)) return;
  const mode: RevealMode = busy ? 'live' : lastQuiet ? 'settle' : 'ink';
  lastLines = now;
  lastQuiet = !busy;
  linesOut = { mode, from: facingPoint() };
  const heights = fineHeight.slice();
  drafts.post({ lines: { id: now, heights } }, [heights.buffer]);
}

/**
 * How closely each kind's sign is set (dots per unit area at its thinnest, and what each step
 * thicker adds): moss a fine stipple; forest sparsely, a few small circles standing for a wood, as
 * a map draws one; the others between.
 */
const signDensity = KINDS.map((k): [number, number] => (k.sign === 'dot' ? [1600, 3600] : k.kind === 'forest' ? [90, 170] : [180, 330]));
/** Life by its signs, and the breakers, drafted in the worker now and then. */
function redrawLife(now: number): void {
  if (lifeOut || now - lastLife < 1.2) return;
  lastLife = now;
  lifeOut = true;
  // The simulation's own fields, small and coarse: the worker carries them onto the finer surface.
  const heights = fineHeight.slice(), life = planet.life.slice(), wear = planet.wear.slice(), kind = ecology.kind.slice();
  drafts.post({ life: { id: now, heights, life, wear, kind, density: signDensity } }, [heights.buffer, life.buffer, wear.buffer, kind.buffer]);
}

/**
 * Work that has to happen on the page's own thread but needn't happen now (taking up the drafted
 * lines, keeping the world): one piece a frame, and not on a frame that has already redrawn the
 * surface, so no one frame carries two heavy things.
 */
const chores: (() => void)[] = [];
let choreWaited = 0;
function doChore(busyFrame: boolean, spent: number): void {
  if (!chores.length) { choreWaited = 0; return; }
  // And not if this frame's own work has already taken a good part of its time; though nothing
  // waits more than a few frames, or the lines would lag behind the land.
  if ((!busyFrame && spent < 5) || ++choreWaited > 4) { chores.shift()!(); choreWaited = 0; }
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

function drawMarks(): void {
  const s = planet.impact;
  stoneMark.visible = !!s && !ending;
  if (s) {
    setMark(stoneMark, s.vertex, 0.04);
    // In the lava's red, if the plume is under it and will catch its heat.
    stoneMark.material.color.set(planet.warmthAt(s.vertex) > 0.5 ? '#9a4230' : INK);
  }
  const w = ecology.wish;
  wishMarks.forEach((m, i) => {
    const on = !!w && !ending && KINDS[i].kind === w.kind;
    m.visible = on;
    if (on) { setMark(m, w!.vertex, 0.07); m.material.color.set(KINDS[i].ink); m.material.opacity *= 0.7; }
  });
}
/** Set a mark on the ground at a vertex, a size in view, faded towards the rim and hidden round the back. */
function setMark(m: THREE.Sprite, v: number, size: number): void {
  m.position.set(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]).multiplyScalar(1.004);
  NORMAL.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).applyQuaternion(group.quaternion);
  m.material.opacity = Math.max(0, Math.min(0.9, (NORMAL.dot(EYE.copy(camera.position).normalize()) - 0.15) / 0.25));
  m.scale.setScalar(size * (dist / 3.2));
}

// ---------------------------------------------------------------- the aim
/**
 * Each world's aim, reckoned now and then and drawn on the map as a surveyor would draw a route or
 * a boundary, in small dots: pale where it's still to do, inked where it's done.
 *   An ocean world: the way the crust carries the heat, round the world, in stretches; a stretch
 *     is held while something lives on or by it. Ringed when every stretch is held at once.
 *   The Moon: each great basin's edge, inked once its floor is flooded.
 *   Mars: nothing on the map; the mountain's height is told at the foot as it rises.
 */
let chain = WORLD.goal === 'ring' ? new Chain(planet.plume, planet.driftDirection) : null;
const FLOODED_ENOUGH = 0.7;
// Small dots, as a chart marks a route or a boundary: pale where it's still to do, inked where it's done.
const aimInk = new Stipple(P.landInkHigh, 'dot', 2.1), aimPencil = new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), 0.6).getHexString(), 'dot', 1.8);
for (const s of [aimInk, aimPencil]) { s.byDirection = true; (s.object.material as THREE.Material).depthTest = false; group.add(s.object); }
const HEIGHT = WORLD.height ?? { target: 0, kmPerUnit: 40 };
let aimDone = 0, aimOf = WORLD.goal === 'ring' ? CHAIN.stretches : WORLD.goal === 'height' ? HEIGHT.target : planet.basins.length, lastAim = -10;
/** How much of the aim is done now, reckoned afresh. */
function reckonAim(): void {
  if (chain) { aimDone = chain.update(planet, topo); aimOf = CHAIN.stretches; }
  else if (WORLD.goal === 'height') { aimDone = Math.max(0, planet.summit * HEIGHT.kmPerUnit); aimOf = HEIGHT.target; }
  else { aimDone = planet.basins.filter((b) => planet.flooded(b) >= FLOODED_ENOUGH).length; aimOf = planet.basins.length; }
}
const won = () => aimOf > 0 && aimDone >= aimOf;
let toldHeight = 0, toldDone = 0, toldAimAt = -1e9;
/** The aim, in a line for the foot: said once the world has begun, and again if a long while passes with nothing gained. */
const AIM_WORDS = WORLD.goal === 'ring' ? 'Leave living islands along the dotted line, all the way round the world'
  : WORLD.goal === 'basins' ? 'Flood each dotted basin with lava'
  : `Raise the mountain ${HEIGHT.target} km above the plain`;
/** Say the aim now and then, and what's been gained each time something is. */
function tellAim(now: number): void {
  if (planet.over || ending) return;
  if (now - toldAimAt > 180) { toldAimAt = now; announce(AIM_WORDS); }
  if (WORLD.goal === 'height') return;
  const done = Math.round(aimDone);
  if (done > toldDone && done < aimOf) {
    toldAimAt = now;
    announce(WORLD.goal === 'ring' ? `${done} of ${aimOf} stretches of the chain are living` : `${done} of ${aimOf} basins flooded`);
  }
  toldDone = done;
}
/** Dots on the ground at these points (on the unit sphere), lifted to the land's height. */
function onGround(pts: { x: number; y: number; z: number }[], into: number[]): void {
  for (const q of pts) {
    const v = nearestAbove(new THREE.Vector3(q.x, q.y, q.z));
    const r = Math.max(1, Math.hypot(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2])) + 0.003;
    into.push(q.x * r, q.y * r, q.z * r);
  }
}
function drawAim(now: number): void {
  if (now - lastAim < 2) return;
  lastAim = now;
  reckonAim();
  if (begun) tellAim(now);
  const inked: number[] = [], pencilled: number[] = [];
  if (WORLD.goal === 'height') {
    // No mark on the world: its height is told at the foot, each time it stands two km higher.
    const step = Math.floor(aimDone / 2) * 2;
    if (begun && step > toldHeight && step < aimOf) { toldHeight = step; toldAimAt = now; announce(`The mountain stands ${step} km above the plain, of ${aimOf}`); }
    return;
  }
  if (chain) {
    // The route in small dots round the world: pale across what's still to do, inked where held.
    const per = 6, pts = chain.points(per);
    chain.held.forEach((h, i) => onGround(pts.slice(i * per, (i + 1) * per), h ? inked : pencilled));
  } else {
    for (const b of planet.basins) {
      // The basin's edge, as a circle on the ground round its middle.
      const c = new THREE.Vector3(b.x, b.y, b.z).normalize();
      const u = new THREE.Vector3().crossVectors(c, Math.abs(c.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const w = new THREE.Vector3().crossVectors(c, u);
      const r = b.r * 0.8, pts = [];
      const around = Math.max(24, Math.round((Math.PI * 2 * Math.sin(r)) / 0.066));
      for (let i = 0; i < around; i++) {
        const a = (i / around) * Math.PI * 2;
        pts.push(c.clone().multiplyScalar(Math.cos(r)).addScaledVector(u, Math.sin(r) * Math.cos(a)).addScaledVector(w, Math.sin(r) * Math.sin(a)));
      }
      const done = planet.flooded(b) >= FLOODED_ENOUGH;
      onGround(pts, done ? inked : pencilled);
    }
  }
  aimInk.set(inked);
  aimPencil.set(pencilled);
}

const NORMAL = new THREE.Vector3(), EYE = new THREE.Vector3();

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
 * The ideas come in one at a time, each once the one before has been tried or has had long
 * enough, with nothing written on the world: the card the world begins from says what there is to
 * know, and the world shows the rest. Stones only begin to fall once the rest has come in.
 * (Each idea's words are kept here, but not drawn.)
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
      return { text: share > 0.85 ? 'too long, and it tears open' : planet.bursting ? 'heavy smoke: tip it now, for a burst' : 'hold it level, and let the smoke gather', at: planet.plumeVertex, dy: -44 };
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
let lesson = LIFE ? 0 : CUES.length, lessonSince = 0, lessonShown = false, embersSaid = false;
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


/** A soft pulse in the hand, where the phone can give one (not iPhones). */
function feel(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* none */ }
}

// ---------------------------------------------------------------- words, and the key
/** What's worth saying: the turns in the world's story, not every happening in it. */
const QUIET_WORDS = /^(Life wishes|A stone is coming|Land breaks|Life begins in|The first|Moss takes|A wish kept|Held too long|The plume takes in|The fire is out|The heat is nearly|A dust storm|The storm passes)/;
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
const kindEls = KINDS.map((k) => {
  const b = document.createElement('span');
  b.innerHTML = `<svg viewBox="0 0 12 12" width="12" height="12">${signSvg(k.sign)}</svg> ${k.name}`;
  b.style.color = k.ink;
  b.title = `${k.name}: ${k.wants}`;
  $('legend').appendChild(b);
  return b;
});
function words(): void {
  const era = planet.era;
  if (era !== shownEra && !ending) { shownEra = era; $('stage-name').textContent = ERAS[era]; eraFrom.push({ name: ERAS[era], from: planet.seconds }); }
  for (const text of planet.news.splice(0)) {
    // Only the few things worth a word are said, quietly, at the foot of the page.
    if (!ending && QUIET_WORDS.test(text)) announce(text);
    if (/wish kept|takes in|Land breaks/.test(text)) feel(12);
    else if (/The stone falls/.test(text)) feel(30);
  }
  const living = new Set(ecology.living);
  KINDS.forEach((k, i) => { kindEls[i].style.opacity = living.has(k.kind) ? '1' : '0.3'; });
}

// ---------------------------------------------------------------- what happens, seen and felt
const tallied = { ...planet.tally };
let steamIn = 0, smokeIn = 0;
const UPWARD = new THREE.Vector3(), INVERSE_RIGHT = new THREE.Vector3();
function effects(dt: number): void {
  const p = topo.positions, v0 = planet.plumeVertex;
  // Up the page, in the planet's frame: the way smoke drifts, as a map draws it.
  UPWARD.set(0, 1, 0).applyQuaternion(INVERSE.copy(group.quaternion).invert());
  const up = { x: UPWARD.x, y: UPWARD.y, z: UPWARD.z };
  // Across the page, the way the storm drives the dust.
  INVERSE_RIGHT.set(1, 0.15, 0).normalize().applyQuaternion(INVERSE);
  if (planet.tally.bursts > tallied.bursts || planet.tally.calderas > tallied.calderas) {
    const torn = planet.tally.calderas > tallied.calderas;
    feel(torn ? [40, 60, 90] : 25);
    // The column of ash: many puffs from the vent, rising and spreading.
    for (let i = 0; i < (torn ? 36 : 18); i++) puffs.add('ash', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], torn ? 1.5 : 1, Math.random, up);
  }
  Object.assign(tallied, planet.tally);
  // Steam where lava runs into the sea, as much as there is lava there.
  steamIn -= dt;
  if (steamIn <= 0) {
    steamIn = 0.12;
    for (let v = 0; v < N; v++) {
      const l = planet.lava[v];
      if (l > 0.004 && planet.rock[v] < 0.005 && Math.random() < Math.min(0.25, l * 4)) puffs.add('steam', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 1, Math.random, up);
    }
  }
  // A dust storm: dust driven across the face of the world, low and fast.
  if (planet.storm) {
    for (let i = 0; i < 3; i++) {
      const v = Math.floor(Math.random() * N);
      NORMAL.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).applyQuaternion(group.quaternion);
      if (NORMAL.z > 0.2) puffs.add('smoke', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 0.8, Math.random, { x: up.y * 0 + INVERSE_RIGHT.x, y: INVERSE_RIGHT.y, z: INVERSE_RIGHT.z });
    }
  }
  // The vent smokes as the heat gathers: a wisp now and then while there's little, more and
  // heavier as it builds, and a dark column once it would burst.
  smokeIn -= dt;
  const share = Math.min(1, planet.pressure / VOLCANO.cap);
  if (!planet.over && !planet.pouring && planet.pressure > 0.5 && smokeIn <= 0) {
    smokeIn = planet.bursting ? 0.25 : 0.9 - 0.55 * Math.min(1, planet.pressure / VOLCANO.explosive);
    puffs.add('smoke', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], planet.bursting ? 1.4 + share : 0.5 + share, Math.random, up);
  }
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
let ending: { from: number; shown: boolean; at: number; info: ChartInfo | null; turned: number; won: boolean } | null = null;
let wonSeen = -1;
const wonAt = () => (wonSeen < 0 ? (wonSeen = seconds) : wonSeen);
function theEnd(): void {
  // Done: the aim met, while the fire still burns; or not, and the fire out.
  if (!ending && begun && won()) {
    ending = { from: planet.seconds, shown: false, at: 0, info: null, turned: 0, won: true };
    queue.length = 0;
    announce(WORLD.goal === 'ring' ? 'The world is ringed with living islands' : WORLD.goal === 'height' ? 'The great mountain stands' : 'The seas of the Moon are flooded');
    feel([30, 50, 30]);
  }
  if (!ending && planet.over) {
    ending = { from: planet.seconds, shown: false, at: 0, info: null, turned: 0, won: false };
    $('stage-name').textContent = ERAS.out;
    queue.length = 0;
    announce('The fire is out. A long age passes');
  }
  // Met, the chart comes a few moments later; not, after a long age has worn at what was made.
  if (ending && !ending.shown && planet.seconds - ending.from >= (ending.won ? 0 : LONG_AGE) && (!ending.won || seconds - wonAt() > 4)) {
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
  reckonAim();
  const met = !!ending?.won, ring = WORLD.goal === 'ring';
  return {
    title: ring ? (met ? 'A ringed world' : 'Not yet ringed') : WORLD.goal === 'height' ? (met ? 'The great mountain' : 'Not yet the great mountain') : met ? 'The seas of the Moon' : 'The seas not yet filled',
    subtitle: `${WORLD.numeral} · ${WORLD.title} · world ${seed} · ${mm} of fire`,
    kinds: LIFE ? KINDS.map((k) => ({ name: k.name, ink: k.ink, sign: k.sign, living: living.has(k.kind) })) : [],
    summary: ring
      ? `${aimDone} of ${aimOf} stretches held · ${living.size} of ${KINDS.length} kinds of life`
      : WORLD.goal === 'height' ? `the summit ${Math.round(aimDone)} km above the plain, of ${aimOf}` : `${aimDone} of ${aimOf} basins flooded`,
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
    const next = ending.won ? nextWorld(WORLD) : null;
    $('again').textContent = next ? `turn the world right round to go on to ${next.title.replace(/^An? /, 'an ').replace(/^The /, 'the ')}` : ending.won ? 'turn the world right round to begin again' : 'turn the world right round to try again';
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
  // Met, on to the next world, if there is one; otherwise this world again.
  const next = ending?.won ? nextWorld(WORLD) : null;
  q.delete('world');
  remember('volcano.world', (next ?? WORLD).id);
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
  world: string;
  way: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } } | null;
  seed: number;
  planet: Record<string, unknown>;
  ecology: Record<string, unknown>;
  islands: Record<string, unknown>;
  page: { lesson: number; embersSaid: boolean; shownEra: Era; eraFrom: { name: string; from: number }[]; turn: number[]; dist: number };
}
function world(): Kept {
  return {
    world: WORLD.id,
    way: chain ? { a: chain.a, b: chain.b } : null,
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
  if (!w || !w.planet || (w.world ?? 'ocean') !== WORLD.id) return false;
  if (w.way && chain) chain = new Chain(w.way.a, w.way.b);
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
  drawNow();
  lastLines = -1; redrawLines(1e6);
  return true;
}

/**
 * The first touch begins the world: it's what lets a phone share how it's held, so it's asked
 * for once, on a quiet card. A world that was kept is taken up where it was left.
 */
let begun = false;
// The card says which world this is, and what there is to know of it.
($('begin').querySelector('.world') as HTMLElement).textContent = `${WORLD.numeral} · ${WORLD.title}`;
($('begin').querySelector('.first') as HTMLElement).textContent = WORLD.first;
// The worlds, along the card's foot, as an atlas lists its plates: touch another to go to it.
for (const w of WORLDS) {
  const b = document.createElement('span');
  b.textContent = w.numeral;
  b.title = w.title;
  if (w === WORLD) b.className = 'here';
  else b.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    remember('volcano.world', w.id);
    if (remembered('volcano.world') === w.id) location.reload();
    else location.search = `?world=${w.id}`;
  });
  $('begin').querySelector('.worlds')!.appendChild(b);
}
($('begin').querySelector('.then') as HTMLElement).textContent = WORLD.then;
// A world without life has no key of its kinds.
if (!LIFE) $('legend').style.display = 'none';
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
    reachDist = THREE.MathUtils.clamp(3.4 + 2 * Math.acos(least), 3.4, 4.8);
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
const INVERSE = new THREE.Quaternion(), GRAV = new THREE.Vector3(), SLIDE = new THREE.Quaternion();
fit();
drawNow();
redrawLines(0);
const clock = new THREE.Clock();
let seconds = 0, lastWords = 0, lastDraw = 0, lastIslands = 0, lastEcology = 0;
/** In development, how long each frame's own work took (before drawing), to find what stutters. */
const frameCost: number[] = [];
renderer.setAnimationLoop(() => {
  const began0 = performance.now();
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
  const speed = ending && !ending.shown && !ending.won ? AGE_SPEED : 1;
  // Nothing happens until the world is begun.
  if (begun && !ending?.shown) {
    const before = new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z);
    for (let k = 0; k < speed; k++) planet.step(dt);
    // Where the crust drifts over the heat, the heat stays where it is and the world slides past
    // beneath it, as over a real hotspot: the world is turned back by however far the vent was
    // carried, so it keeps its place in view (and how the world is tipped there doesn't change).
    if (planet.k.rises <= 0 && planet.k.drift > 0) {
      const after = new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z);
      group.quaternion.multiply(SLIDE.setFromUnitVectors(before, after).invert());
    }
  }
  // The surface is redrawn often while lava runs, and now and then while only the slow forces work.
  const flowing = planet.erupting || planet.molten > 0.01;
  let heavy = false;
  if (seconds - lastDraw >= (flowing || speed > 1 ? 1 / 20 : 0.5)) { lastDraw = seconds; draw(); heavy = true; }
  if (LIFE && begun && seconds - lastEcology >= 1) { ecology.update((seconds - lastEcology) * speed); lastEcology = seconds; }
  if (LIFE && begun && seconds - lastIslands >= 2) {
    lastIslands = seconds;
    for (const _ of islands.update(planet.rock, planet.seconds)) {
      const first = !planet.log.some((l) => l.text.startsWith('Land breaks'));
      planet.tell(first ? 'Land breaks the surface' : 'A new island rises');
    }
  }
  redrawLines(seconds);
  redrawLife(seconds);
  drawMarks();
  effects(dt);
  landPen.update(dt, camera);
  seaPen.update(dt, camera);
  waterPen.update(dt, camera);
  if (begun) drawAim(seconds);
  aimInk.update(dt);
  aimPencil.update(dt);
  for (const s of [...kindDots, foam]) s.update(dt);
  puffs.update(dt * speed);
  if (begun) breathe(dt);
  if (begun && seconds - lastWords > 0.5) { lastWords = seconds; words(); theEnd(); lessons(); }
  if (begun && seconds - keptAt > 15) { keptAt = seconds; chores.push(save); }
  doChore(heavy, performance.now() - began0);
  showNext();
  if (import.meta.env.DEV) { frameCost.push(performance.now() - began0); if (frameCost.length > 600) frameCost.shift(); }
  renderer.render(scene, camera);
  drawEnding();
  turnedSince();
});

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { planet, ecology, islands, rotate, draw, save, world, frameCost, kindDots, chain: () => chain, lines: () => { lastLines = -1; redrawLines(1e6); }, life: () => { lastLife = -10; redrawLife(1e6); } };
