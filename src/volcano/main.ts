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
 * Nothing on the world is a control; what it's doing shows as itself:
 *   the vent has no mark of its own: the heat gathering beneath it rises as
 *     smoke, a wisp while there's little, heavier as it builds, a dark column
 *     once it would burst;
 *   tipped, the lava is seen to pour;
 *   a few of a kind's signs pencilled where life wishes for it, and a small
 *     star where a stone will fall.
 * Only the aim is marked, in small dots as a chart marks a route, inked as it's met.
 * No words are written on the world: what's new is told in a quiet line at the foot.
 * Off the world there is only the era, as a map's title, and at the foot the
 * key: the six kinds of life by their signs, inked once each is living. The
 * world is kept as it's played; when the fire is out, the chart is drawn round
 * it, and turning the world begins another.
 */
import * as THREE from 'three';
import { buildTopology } from '../mesh/topology';
import { unpack, type Packed } from './drafting';
import { PlotterLines, defaultPlotterStyle } from '../render/plotterLines';
import type { Polyline } from '../terrain/contours';
import { GestureRecognizer } from '../interact/gestures';
import { Stipple } from '../render/stipple';
import { signSvg } from '../render/signs';
import { Planet, VOLCANO, blobRadius, type Era } from './sim';
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
import { snapshotOf, restoreInto, keep, recall, forget, keepGround, recallGround, forgetGround, keepPage, pages, type Page } from './save';
import { worldOf, nextWorld, WORLDS } from './worlds';
import { Chain, CHAIN } from './chain';
import { measureSecond, secondWords, type Second } from './second';
import { loadSystem, saveSystem, worldFor, recordPlayed, madeCount } from './system';
import { openSystem, closeSystem } from './systemChart';
import { LOOKS, PRINT_FUNCTIONS, LAMP_PRINT_FUNCTIONS, LAMP_PRINT, printFragment, type Look } from './print';

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
// (Almost none: shading on a bumpy surface reads as smudges, not relief. The contours show the relief.)
scene.add(new THREE.HemisphereLight('#fffaf0', '#f8f2e6', 2.75));
const sun = new THREE.DirectionalLight('#ffffff', 0.12);
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
  halfScreen.value.set((w * renderer.getPixelRatio()) / 2, (h * renderer.getPixelRatio()) / 2);
  sizeFrame(w, h);
}
/** How far the world is lifted up the page (a share of its height): at the end, to leave the foot for the chart. */
let lift = 0;
function look(): void {
  dist = THREE.MathUtils.clamp(dist, 2.1, farthest * 1.3);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  const w = Math.max(1, stage.clientWidth || innerWidth), h = Math.max(1, stage.clientHeight || innerHeight);
  if (lift > 1e-4) camera.setViewOffset(w, h, 0, lift * h, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
const pens: PlotterLines[] = [];
/** Half the drawing's size in device pixels (for lines a set number of pixels wide). */
const halfScreen = { value: new THREE.Vector2(1, 1) };
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
const ASKED = new URLSearchParams(location.search);
/**
 * Or one of the worlds of a solar system being played as a run (?run=, its place in the system):
 * its kind's world, with its twist and whatever the last world made gives it (see system.ts).
 */
const SYSTEM = loadSystem(), RUN = (() => {
  const i = Number(ASKED.get('run') ?? NaN);
  return SYSTEM && Number.isInteger(i) && SYSTEM.bodies[i] && !SYSTEM.bodies[i].made ? i : null;
})();
/**
 * Free play (?free): the same world with no clock. The heat never runs out and the aim, met, doesn't
 * end the fire: it goes on until it's ended (the quiet "end the fire" at the top), and then the long
 * age and the chart come as ever. (Not for a world of a solar system, which is played against the clock.)
 */
const FREE = ASKED.has('free') && !ASKED.has('run');
const CHOSEN = SYSTEM && RUN !== null ? worldFor(SYSTEM, RUN) : worldOf(ASKED.get('world') ?? remembered('volcano.world'));
const WORLD = FREE ? { ...CHOSEN, rules: { ...CHOSEN.rules, endless: true } } : CHOSEN;
if (RUN === null) remember('volcano.world', WORLD.id);
/**
 * How the worlds are drawn: as prints (stipple, hand-laid washes, and lava as a
 * woodblock or a watercolour; see print.ts), or as it was. Chosen on the card, and remembered.
 */
const LOOK_ID = ASKED.get('look') ?? remembered('volcano.look') ?? 'engrave';
const LOOK: Look = LOOKS.find((l) => l.id === LOOK_ID)?.look ?? 1;
const SEA = WORLD.rules.terrain === 'ocean';
const P = WORLD.palette, LIFE = WORLD.rules.life !== false, ICE = WORLD.rules.terrain === 'ice';
/** On Io, the plumes' sulphur is drawn as the flood mark is elsewhere: in a clean-edged band, as a geological map draws a unit. */
const SULPHUR = (WORLD.rules.ashRing ?? 0) > 0;
function remembered(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* not remembered, and that's all */ }
}
/**
 * What earlier fires on this world left: the next rises through it, so past games become the
 * world's geology (not when a world is asked for by its number, to see it again as it was): the
 * ocean's old islands sunk to seamounts and ringed by atolls in the long age after their fire; and
 * the new fire starts somewhere new.
 */
// (A world of a solar system is new ground: it's a world of its own, not this kind's own world.)
const GROUND = wanted || RUN !== null ? null : recallGround(WORLD.id, N);
const FIRES = GROUND?.fires ?? 0;
const START = (() => {
  if (!GROUND) return nearest(0.1, 0.15, 0.98);
  const h = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const z = h(1) * 2 - 1, a = h(2) * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return nearest(r * Math.cos(a), r * Math.sin(a), z);
})();
/** Where lava has ever lain on this world (for those that keep the mark of it): the old seas, the old new ice. */
const MARKED = GROUND?.marked ?? null;
const planet = new Planet(topo, START, seed, WORLD.rules, GROUND?.rock);
planet.stonesFall = false; // not until the first ideas have come in (see `lessons`)
const ecology = new Ecology(planet, topo);
const islands = new Islands(topo);

/** How far above the sea the land stands, drawn: heights are small, so the relief is raised. */
const RELIEF = 0.32;
const group = new THREE.Group();
scene.add(group);
// A fire that starts somewhere new starts facing us, where the first always did.
if (GROUND) group.quaternion.setFromUnitVectors(new THREE.Vector3(base[START * 3], base[START * 3 + 1], base[START * 3 + 2]), new THREE.Vector3(0.1, 0.15, 0.98).normalize());

/** Drawn on a surface of twice the detail, the values carried across smoothly (see fine.ts). */
const fine = new FineSurface(topo, buildTopology(new THREE.IcosahedronGeometry(1, 80).attributes.position.array, null));
const ftopo = fine.fine, FN = ftopo.vertexCount, fbase = ftopo.basePositions;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(FN * 3);
const landColour = new Float32Array(FN * 3), fineHeight = new Float32Array(FN);
/** Where lava lies (how thick) and where it has lain (this fire's, or an earlier one's): amounts, so their edges are drawn crisp in each pixel. */
const fineMarks = new Float32Array(FN * 4), prevMarks = new Float32Array(FN * 4);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(landColour, 3));
geometry.setAttribute('aH', new THREE.BufferAttribute(fineHeight, 1));
/**
 * The surface as it was drawn last time: each new one is eased in from it over about as long as
 * it took to come, so the land grows smoothly rather than stepping each time it's redrawn.
 */
const prevPositions = new Float32Array(FN * 3), prevColour = new Float32Array(FN * 3), prevHeight = new Float32Array(FN);
geometry.setAttribute('aPrevPos', new THREE.BufferAttribute(prevPositions, 3));
geometry.setAttribute('aPrevColour', new THREE.BufferAttribute(prevColour, 3));
geometry.setAttribute('aPrevH', new THREE.BufferAttribute(prevHeight, 1));
geometry.setAttribute('aMarks', new THREE.BufferAttribute(fineMarks, 4));
geometry.setAttribute('aPrevMarks', new THREE.BufferAttribute(prevMarks, 4));
geometry.setIndex(new THREE.BufferAttribute(ftopo.triangles, 1));
const blend = { value: 1 }, blendFrom = { at: 0, span: 0.5 };
/** How strongly ground lava has lain on is marked: less, as the ice moon's new ice greys in its long age. */
const floodStrength = { value: 0.85 };
/** The shader's clock (for lava that moves), and the pixel ratio (for lines so many CSS pixels apart). */
const lavaClock = { value: 0 }, pxRatio = { value: 1 };

/**
 * The ground's colour is chosen in each pixel rather than at each vertex: land and sea each have
 * their own colour carried across the surface, and where the height crosses the sea the one gives
 * way to the other in the space of a pixel, so the coast is a clean edge, not a smear.
 */
/** The craters for the print's shader (the latest 64 of them), and the light in the world's own frame, so a crater's shadow falls the right way however it's turned. */
const CRATERS = 64, craterAt = Array.from({ length: CRATERS }, () => new THREE.Vector4()), craterAge = new Float32Array(CRATERS), craterCount = { value: 0 };
const LIGHT_VIEW = new THREE.Vector3(-0.55, 0.6, 0.6).normalize(), lightObj = new THREE.Vector3(), unturn = new THREE.Quaternion();
function cratering(): void {
  const all = planet.craters, from = Math.max(0, all.length - CRATERS);
  for (let i = from; i < all.length; i++) { const c = all[i]; craterAt[i - from].set(c.x, c.y, c.z, c.r); craterAge[i - from] = planet.seconds - c.born; }
  craterCount.value = all.length - from;
  // (The camera looks straight down at the world, unturned, so its frame is the scene's.)
  lightObj.copy(LIGHT_VIEW).applyQuaternion(unturn.copy(group.quaternion).invert());
}
const material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'attribute float aH;\nattribute float aPrevH;\nattribute vec3 aPrevPos;\nattribute vec3 aPrevColour;\nattribute vec4 aMarks;\nattribute vec4 aPrevMarks;\nuniform float uBlend;\nvarying float vH;\nvarying vec4 vMarks;\nvarying vec3 vDir;\nvarying vec3 vN;\nvarying vec3 vS;\nvoid main() {')
    .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = mix(aPrevColour, color.rgb, uBlend);\n  vH = mix(aPrevH, aH, uBlend);\n  vMarks = mix(aPrevMarks, aMarks, uBlend);\n  vDir = normalize(position);\n  vN = normalize(normalMatrix * normal);\n  vS = normalize(normalMatrix * normalize(position));')
    .replace('#include <begin_vertex>', 'vec3 transformed = mix(aPrevPos, position, uBlend);');
  shader.uniforms.uBlend = blend;
  // The sea's colour is only its depth, so it's worked out here rather than sent: paler over the shallows.
  shader.uniforms.uFlooded = { value: FLOODED ?? (SULPHUR ? ASH : PAPER) };
  shader.uniforms.uFloodStrength = floodStrength;
  shader.uniforms.uTime = lavaClock;
  shader.uniforms.uPx = pxRatio;
  // (On the ice moon the lava is water: its shimmer is light on it, not heat, and it doesn't crust black.)
  shader.uniforms.uHot = { value: new THREE.Color(ICE ? '#b9dbe8' : '#e9853a') };
  shader.uniforms.uCrust = { value: new THREE.Color(ICE ? P.deepLava : '#2b2420') };
  shader.uniforms.uLava = { value: VERMILION };
  shader.uniforms.uDeepLava = { value: DEEP_RED };
  shader.uniforms.uShallow = { value: SHALLOW };
  shader.uniforms.uDeep = { value: DEEP };
  shader.uniforms.uLandPaper = { value: PAPER };
  shader.uniforms.uFloodDots = { value: WORLD.id === 'moon' ? 0.35 : 0 };
  shader.uniforms.uCrater = { value: craterAt };
  shader.uniforms.uCraterAge = { value: craterAge };
  shader.uniforms.uCraterCount = craterCount;
  shader.uniforms.uLightObj = { value: lightObj };
  // The woodblock's colours: vermilion, deeper at the edge, hot orange at the core (as working values, not hex: as first seen and liked);
  // on the ice moons, where the lava is water, its blues.
  // (Engraved, the lines are inks: red-brown, deeper at the edge; on the ice moons, where the lava is water, blues.)
  shader.uniforms.uBlock = { value: new THREE.Color(ICE ? '#3f7fa6' : '#ce4622') };
  shader.uniforms.uBlockDeep = { value: new THREE.Color(ICE ? '#2a5674' : '#802216') };
  shader.uniforms.uBlockHot = { value: ICE ? new THREE.Color('#b9dbe8') : new THREE.Color(0.95, 0.55, 0.17) };
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `uniform vec3 uShallow;\nuniform vec3 uDeep;\nuniform vec3 uFlooded;\nuniform float uFloodStrength;\nuniform vec3 uLava;\nuniform vec3 uDeepLava;\nuniform vec3 uHot;\nuniform vec3 uCrust;\nuniform float uTime;\nuniform float uPx;\nuniform vec3 uLandPaper;\nvarying float vH;\nvarying vec4 vMarks;\nvarying vec3 vDir;\nvarying vec3 vN;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p), s = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), s.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), s.x), s.y),
                   mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), s.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), s.x), s.y), s.z);
      }
      ${LOOK ? PRINT_FUNCTIONS : ''}
      void main() {`)
    .replace('#include <color_fragment>', LOOK ? printFragment(LOOK, SEA) : `
      float edge = max(fwidth(vH), 1e-5) * 0.7;
      vec3 sea = mix(uShallow, uDeep, clamp(-vH / 0.3, 0.0, 1.0));
      // The land's colour laid on as watercolour is: never quite even, a little darker where it
      // pooled and lighter where it thinned, in soft blotches fixed to the ground.
      float pool = noise3(vDir * 30.0);
      vec3 land = vColor.rgb * (0.98 + 0.04 * pool);
      // Where lava has lain (the Moon's seas, the ice moon's new ice), and where it lies now, each
      // with an edge about a pixel wide wherever its amount crosses a threshold: a clean edge, as a wash
      // laid with a brush has, not the soft, stepped smear of colour carried vertex to vertex.
      float fl = vMarks.x, fw = max(fwidth(fl), 1e-4);
      land = mix(land, uFlooded, smoothstep(0.5 - fw, 0.5 + fw, fl) * uFloodStrength);
      float lv = vMarks.y, lw = max(fwidth(lv), 1e-4), on = smoothstep(0.5 - lw, 0.5 + lw, lv);
      // Lava just set: black, with a clean edge, weathering back into the ground's own colour as it
      // cools, over a minute or two.
      float here = vMarks.w, hw = max(fwidth(here), 1e-4);
      float black = here > 0.01 ? vMarks.z / here : 0.0;
      land = mix(land, uCrust, smoothstep(0.5 - hw, 0.5 + hw, here) * (1.0 - on) * clamp(black, 0.0, 1.0) * 0.8);
      // Lava still running: deeper where thick, hottest at its front, never quite still (a slow
      // shimmer drifting through it), and fine lines creeping downhill in it, the way it flows.
      if (on > 0.0) {
        vec3 molten = mix(uLava, uDeepLava, 0.3);
        // (Two layers, turned against each other, so no grid of the noise shows.)
        vec3 d1 = vDir * 17.0, d2 = vec3(vDir.y + vDir.z, vDir.z - vDir.x, vDir.x + vDir.y) * 23.0;
        float shimmer = 0.5 * noise3(d1 + vec3(0.0, uTime * 0.1, uTime * 0.06)) + 0.5 * noise3(d2 - vec3(uTime * 0.07, 0.0, uTime * 0.05));
        molten = mix(molten, uHot, smoothstep(0.45, 0.8, shimmer) * 0.3);
        // Its edges chill first: dark at the rim, glowing within.
        molten = mix(molten, uCrust, (1.0 - smoothstep(0.5, 0.75, lv)) * 0.7);
        land = mix(land, molten, on);
      }
      diffuseColor.rgb *= mix(sea, land, smoothstep(-edge, edge, vH));`);
};
const mesh = new THREE.Mesh(geometry, material);
group.add(mesh);

/**
 * The contours, in two sets of each: when the land has changed and its lines are drawn again, the
 * new set fades in over the old as the old fades out, so a line never jumps; it drifts, as the
 * land does, and you don't see it happen unless you're watching for it.
 */
// (Drawn as a print, the stipple carries the relief: the land's contours are fainter, the sea's are left out.)
const landStyle = { ...defaultPlotterStyle, ink: LOOK ? '#2a241e' : P.landInk, inkHigh: LOOK ? '#2a241e' : P.landInkHigh, pencil: P.pencil, alpha: LOOK ? 0.22 : 0.5, indexAlpha: LOOK ? 0.35 : 0.8, indexEvery: 5, fadeSeconds: 0, pen: false, appearSeconds: 0.001, widthPx: 1.15, nib: false };
const seaStyle = { ...defaultPlotterStyle, ink: P.seaInk, inkHigh: P.seaInk, pencil: '#a9bfd0', alpha: 0.45, indexAlpha: 0.6, fadeSeconds: 0, pen: false, appearSeconds: 0.001, widthPx: 0.95, nib: false };
const landPens = [new PlotterLines(landStyle), new PlotterLines(landStyle)], seaPens = [new PlotterLines(seaStyle), new PlotterLines(seaStyle)];
for (const pen of [...landPens, ...seaPens]) { pen.width = 2; pens.push(pen); group.add(pen.object); }
let frontPen = 0, fadeFrom = -1;
const CROSS_FADE = 1.2;
landPens[1].opacity = seaPens[1].opacity = 0;
/** Whether a contour is a small loop lying wholly inside a crater (drawn as a print, the crater is drawn as itself instead). */
function inCrater(l: Polyline): boolean {
  if (!l.closed) return false;
  const p = l.points;
  return planet.craters.some((c) => {
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 1], p[i + 2]) || 1;
      if (Math.hypot(p[i] / r - c.x, p[i + 1] / r - c.y, p[i + 2] / r - c.z) > c.r * 1.3) return false;
    }
    return true;
  });
}
/** Put new lines in the set not showing, and begin fading it in. */
function newLines(land: Polyline[], sea: Polyline[]): void {
  if (fadeFrom >= 0) finishFade();
  const back = 1 - frontPen;
  landPens[back].setLines(LOOK ? land.filter((l) => !inCrater(l)) : land, 'settle');
  // (Drawn as a print, the sea's contours are left out, but on the deep ocean, where they show what's rising beneath.)
  seaPens[back].setLines(LOOK && WORLD.id !== 'deep' ? [] : sea, 'settle');
  fadeFrom = performance.now() / 1000;
}
function finishFade(): void {
  frontPen = 1 - frontPen;
  landPens[frontPen].opacity = seaPens[frontPen].opacity = 1;
  landPens[1 - frontPen].opacity = seaPens[1 - frontPen].opacity = 0;
  fadeFrom = -1;
}
function crossFade(): void {
  if (fadeFrom < 0) return;
  const t = Math.min(1, (performance.now() / 1000 - fadeFrom) / CROSS_FADE), e = t * t * (3 - 2 * t), back = 1 - frontPen;
  if (t >= 1) { finishFade(); return; }
  landPens[back].opacity = seaPens[back].opacity = e;
  landPens[frontPen].opacity = seaPens[frontPen].opacity = 1 - e;
}
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
const [PA, BA, AS] = [PAPER, BASALT, ASH].map(rgb);
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
/** Lava this deep (or deeper) is drawn whole; thinner, it thins towards its edge (see `coarse`). */
const LAVA_WHOLE = 0.003;
/** How many times the marks are eased toward their neighbours. */
const MARK_EASING = 8;
const drawnHeight = new Float32Array(N), heightEase = new Float32Array(N), coarseHeight = new Float32Array(N), coarseLand = new Float32Array(N * 3), coarseMarks = new Float32Array(N * 4), eased = new Float32Array(N * 4);
/** The simulation's heights and colours, a vertex at a time, ready to be carried onto the finer surface. */
function coarse(): void {
  // How far the wash eases this time: by the seconds since last, over a second or two.
  const now = performance.now() / 1000, ease = washedAt < 0 ? 1 : 1 - Math.exp(-(now - washedAt) / 1.5);
  washedAt = now;
  // The ground as drawn, eased a little toward its neighbours: a flow's edge (and the cliff it
  // leaves when it sets) is a step a vertex high, which seen edge-on, near the world's rim, shows
  // as a row of teeth. Eased twice, it's a soft rise instead. (The simulation keeps its own.)
  {
    const o = topo.nbrOffsets, l = topo.nbrList;
    for (let v = 0; v < N; v++) drawnHeight[v] = surface(v);
    for (let pass = 0; pass < 2; pass++) {
      for (let v = 0; v < N; v++) {
        let sum = 0;
        for (let k = o[v]; k < o[v + 1]; k++) sum += drawnHeight[l[k]];
        heightEase[v] = drawnHeight[v] * 0.55 + (sum / Math.max(1, o[v + 1] - o[v])) * 0.45;
      }
      drawnHeight.set(heightEase);
    }
  }
  for (let v = 0; v < N; v++) {
    const h = drawnHeight[v], r = 1 + RELIEF * Math.max(0, h);
    topo.positions[v * 3] = base[v * 3] * r; topo.positions[v * 3 + 1] = base[v * 3 + 1] * r; topo.positions[v * 3 + 2] = base[v * 3 + 2] * r;
    coarseHeight[v] = h;
    const lava = planet.lava[v];
    // The sea, paler over the shallows; the land, fresh basalt weathering to paper, ash grey;
    // lava a flat vermilion wash, deeper where it lies thick. (Plain arithmetic, not Colors: this
    // is sixteen thousand vertices, many times a second.)
    const v3 = v * 3;
    // (Not on a world that marks where lava has lain: there that mark is the edge, and a soft tint beside it only smears it.)
    const fresh = !FL && planet.age[v] < 200 ? Math.exp(-planet.age[v] / 30) * 0.3 : 0, ash = Math.min(0.22, planet.ash[v] * 0.3);
    const hot = lava > 0.002 ? Math.min(1, lava * 40) : 0;
    // Where a world keeps the mark of it (the Moon's seas), ground lava has lain on stays dark: this
    // fire's fully, an earlier one's a little faded. And the lava itself, by how thick it lies.
    coarseMarks[v * 4] = FL ? (planet.age[v] < 1e5 ? 1 : 0) : SULPHUR && planet.ash[v] > 0.6 ? 1 : 0;
    // Where lava lies, by how deep: whole where it's a little deep, thinning to nothing at its
    // margins. So its edge falls between the vertices, wherever its depth says, and slides
    // smoothly as it spreads, as a liquid's does, rather than stepping from vertex to vertex.
    coarseMarks[v * 4 + 1] = lava > 0.00002 ? Math.min(1, Math.sqrt(lava / LAVA_WHOLE)) : 0;
    // Lava just set: black, weathering back into the ground's colour over a minute or two. Carried as
    // where it lies (1 or 0) and that times how black it still is, so the shader can divide the one
    // by the other and have the blackness even right up to a clean edge.
    // (Not on the ice moon: water freezes white, into the new ice the flood mark already draws.)
    // (Lava too thin to be drawn running is drawn set: a thin margin chills first.)
    const set = !ICE && lava <= LAVA_WHOLE / 4 && planet.age[v] < 240 ? 1 : 0;
    coarseMarks[v * 4 + 3] = set;
    coarseMarks[v * 4 + 2] = set * Math.exp(-planet.age[v] / 45);
    const kind = LIFE ? ecology.kind[v] : -1, wash = kind >= 0 ? WASH[kind] : null, washBy = wash ? WASH_STRENGTH * Math.min(1, planet.life[v]) * (1 - hot) : 0;
    washWeight[v] += (washBy - washWeight[v]) * ease;
    for (let i = 0; i < 3; i++) {
      let x = PA[i] + (BA[i] - PA[i]) * fresh;
      // Where a world keeps the mark of it (the Moon's seas), ground lava has lain on stays dark.
      // An earlier fire's seas, faded, as a soft tint (this fire's are drawn crisp in the shader).
      if (FL && MARKED && MARKED[v] && planet.age[v] >= 1e5) x += (FL[i] - x) * 0.45;
      x += (AS[i] - x) * ash;
      if (wash) washTint[v3 + i] += (wash[i] - washTint[v3 + i]) * (washWeight[v] < 0.05 ? 1 : ease);
      x += (washTint[v3 + i] - x) * washWeight[v];
      coarseLand[v3 + i] = x;
    }
  }
  // Each mark's amount eased toward its neighbours', again and again, so the edge the shader draws
  // where it crosses a half is a smooth curve, not the simulation's triangles stepping in teeth.
  // Running lava, already carried by its depth (so its edge falls between the vertices), is eased
  // a few times fewer, so a narrow stream still shows.
  const o = topo.nbrOffsets, l = topo.nbrList, M = coarseMarks;
  for (let pass = 0; pass < MARK_EASING; pass++) {
    const lavaToo = pass < MARK_EASING * 0.75;
    for (let v = 0; v < N; v++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let k = o[v]; k < o[v + 1]; k++) { const w = l[k] * 4; s0 += M[w]; s1 += M[w + 1]; s2 += M[w + 2]; s3 += M[w + 3]; }
      const by = 0.6 / Math.max(1, o[v + 1] - o[v]), v4 = v * 4;
      eased[v4] = M[v4] * 0.4 + s0 * by; eased[v4 + 1] = lavaToo ? M[v4 + 1] * 0.4 + s1 * by : M[v4 + 1];
      eased[v4 + 2] = M[v4 + 2] * 0.4 + s2 * by; eased[v4 + 3] = M[v4 + 3] * 0.4 + s3 * by;
    }
    M.set(eased);
  }
  if (!FL && !SULPHUR) for (let v = 0; v < N; v++) M[v * 4] = 0;
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
  const d = data as { height: Float32Array; land: Float32Array; position: Float32Array; normal: Float32Array; marks: Float32Array };
  // What was being drawn becomes where the new one eases in from, over about as long as it took to come.
  prevHeight.set(fineHeight); prevColour.set(landColour); prevPositions.set(positions); prevMarks.set(fineMarks);
  fineMarks.set(d.marks);
  fineHeight.set(d.height); landColour.set(d.land); positions.set(d.position); normals.set(d.normal);
  for (const name of ['position', 'normal', 'color', 'aH', 'aPrevPos', 'aPrevColour', 'aPrevH', 'aMarks', 'aPrevMarks']) geometry.getAttribute(name).needsUpdate = true;
  const now = performance.now() / 1000;
  blendFrom.span = Math.min(0.8, Math.max(0.05, now - blendFrom.at));
  blendFrom.at = now;
  blend.value = 0;
  shapeOut = false;
};
function draw(): void {
  if (shapeOut) return;
  coarse();
  shapeOut = true;
  const height = coarseHeight.slice(), land = coarseLand.slice(), marks = coarseMarks.slice();
  shaper.post({ shape: { height, land, marks } }, [height.buffer, land.buffer, marks.buffer]);
}

/** Redraw the surface here and now: at the start, on taking up a kept world, and for the kept chart. */
function drawNow(): void {
  coarse();
  fine.carryDrawn(coarseHeight, coarseLand, fineHeight, landColour);
  fine.carry(coarseMarks, fineMarks, 4);
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
  prevHeight.set(fineHeight); prevColour.set(landColour); prevPositions.set(positions); prevMarks.set(fineMarks);
  blend.value = 1;
  for (const name of ['position', 'normal', 'color', 'aH', 'aPrevPos', 'aPrevColour', 'aPrevH', 'aMarks', 'aPrevMarks']) geometry.getAttribute(name).needsUpdate = true;
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
let lastLines = -1, lastLife = -1;
/**
 * The lines and signs are drafted in a worker (drafting.ts), so the world turns smoothly while
 * the contours are worked out: the page sends heights, and takes up the lines when they come.
 * Only one of each is ever out at a time; if the world has changed again meanwhile, the next is
 * asked for when the last comes back.
 */
const drafts = offThread(() => { if (noWorkers) throw new Error('no workers'); return new DraftsWorker(); }, handleDrafts);
const nearestOf = Uint32Array.from({ length: FN }, (_, f) => fine.nearestCoarse(f));
drafts.post({ init: { triangles: ftopo.triangles.slice(), basePositions: fbase.slice(), relief: RELIEF, parts: fine.parts, nearest: nearestOf, interval: (WORLD.contour ?? 0.035) * (LOOK ? 1.6 : 1) } }); // (drawn as a print, the stipple shows the slopes: the contours are set wider, so they don't crowd)
let linesOut = false, lifeOut = false;
drafts.onmessage = (data) => {
  const d = data as { lines?: { land: Packed; sea: Packed }; life?: { kinds: Float32Array[]; foam: Float32Array } };
  if (d.lines && linesOut) {
    // Taken up on the next frame that has room, not now: see `chores`.
    const got = d.lines;
    chores.push(() => newLines(unpack(got.land), unpack(got.sea)));
    linesOut = false;
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
  // Now and then (each new set cross-fading in over the last): more often while the land grows.
  const every = busy ? 1.5 : 4;
  if (now - lastLines < every) return;
  lastLines = now;
  linesOut = true;
  const heights = fineHeight.slice();
  drafts.post({ lines: { id: now, heights } }, [heights.buffer]);
}

/**
 * How closely each kind's sign is set (dots per unit area at its thinnest, and what each step
 * thicker adds): moss a fine stipple; forest sparsely, a few small circles standing for a wood, as
 * a map draws one; the others between.
 */
const signDensity = KINDS.map((k): [number, number] => (k.kind === 'reef' ? [900, 2000] : k.sign === 'dot' ? [1600, 3600] : k.kind === 'forest' ? [90, 170] : [180, 330]));
/** Life by its signs, and the breakers, drafted in the worker now and then. */
function redrawLife(now: number): void {
  if (lifeOut || now - lastLife < 3) return;
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
  // Where the heat was called by a tap, till it gets there.
  const t = planet.called ? planet.target : null;
  callMark.visible = !!t && !ending;
  if (t) { setMark(callMark, nearestAbove(new THREE.Vector3(t.x, t.y, t.z)), 0.035); callMark.material.color.set(INK); }
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
 *   The Moon: each great basin's edge, inked round as its floor floods, like a gauge.
 *   Mars and the ice moon: a ring round the heat, inked round as the mountain rises (or the new
 *     ice spreads) towards the aim; and how far along is told at the foot now and then.
 *   Io: a pencilled ring round each great plume counted, as far out as another must keep to be on
 *     fresh ground; doubled while the heat is inside one.
 *   A young Earth: the moon to be, as a ring of dots round the world, inked as rock reaches orbit.
 */
let chain = WORLD.goal === 'ring' ? new Chain(planet.plume, planet.driftDirection) : null;
const FLOODED_ENOUGH = 0.7;
// Small dots, as a chart marks a route or a boundary: pale where it's still to do, inked where it's done.
// (Drawn as a print, the aim's dots are a little bolder and darker, to stand clear of the stipple.)
const AIM_INK = LOOK ? '#2b1d14' : P.landInkHigh, AIM_BIG = LOOK ? 1.3 : 1;
const aimInk = new Stipple(AIM_INK, 'dot', 2.5 * AIM_BIG), aimPencil = new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), LOOK ? 0.8 : 0.6).getHexString(), 'dot', 1.6 * AIM_BIG);
/** On the ocean world, the stretch the heat is on and the next, still to do, a little stronger: where to build now. */
const aimNext = new Stipple(LOOK ? AIM_INK : P.landInk, 'dot', 2.3 * AIM_BIG);
/**
 * On Mars and the ice moon, a ring of the same dots round the heat, drawn once about the pole and
 * turned to follow the heat smoothly, so it glides with it rather than stepping.
 */
const gauge = new THREE.Group(), gaugeInk = new Stipple(AIM_INK, 'dot', 2.5 * AIM_BIG), gaugePencil = new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), LOOK ? 0.8 : 0.6).getHexString(), 'dot', 1.6 * AIM_BIG);
const gaugeAt = new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z).normalize();
for (const s of [aimInk, aimPencil, aimNext, gaugeInk, gaugePencil]) { s.byDirection = true; s.linger = 1.5; (s.object.material as THREE.Material).depthTest = false; }
for (const s of [aimInk, aimPencil, aimNext]) group.add(s.object);
gauge.add(gaugeInk.object, gaugePencil.object);
group.add(gauge);
/**
 * On a young Earth, the moon to be: a ring of dots in the sky round the world, not on it, so it
 * stays where it is however the world is turned. Pale until rock reaches it, inked as it does, and
 * turning slowly. Seen nearly edge-on, tall and narrow, so it fits a phone held upright.
 */
const orbitRing = new THREE.Group(), orbitSpin = new THREE.Group();
// (Larger than the dots on the ground: off the world, they're further from the eye.)
const orbitInk = new Stipple(P.landInkHigh, 'dot', 3.6, null, false), orbitPencil = new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), 0.6).getHexString(), 'dot', 2.3, null, false);
const ORBIT_R = 1.24, ORBIT_DOTS = 100;
/** The moon itself, once the rock has gathered: a small engraved disc, as an old chart draws one. */
const moonMark = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e6e1d6'; g.strokeStyle = P.landInkHigh; g.lineWidth = 3;
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); g.stroke();
  // Its shadowed side in fine hatching, and a few craters.
  g.save(); g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2); g.clip();
  g.lineWidth = 1.2; g.globalAlpha = 0.55;
  for (let x = 70; x < 130; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 30, 128); g.stroke(); }
  g.restore();
  g.lineWidth = 1.6; g.globalAlpha = 0.8;
  for (const [x, y, r] of [[44, 46, 9], [74, 84, 7], [52, 86, 5], [80, 40, 5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0 }));
  m.position.set(ORBIT_R, 0, 0);
  m.scale.setScalar(0.001);
  return m;
})();
if (WORLD.goal === 'orbit') {
  for (const s of [orbitInk, orbitPencil]) { s.linger = 3; orbitSpin.add(s.object); }
  orbitSpin.add(moonMark);
  orbitRing.add(orbitSpin);
  orbitRing.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.28).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.22));
  scene.add(orbitRing);
}
/**
 * In Enceladus's sky, the ringed giant: an engraved disc behind the world, upper left, and
 * its ring round it in dots, inked as far as the ring is full and fading back as it thins. Fixed in
 * the sky, as the moon's ring is on a young Earth, so "towards the giant" is always the same way.
 */
// (In the clear band above the world and below the title, far off, so it stays clear of the world as the view breathes.)
const giant = new THREE.Group(), GIANT_AT = new THREE.Vector3(-0.95, 2.6, -4.8), GIANT_R = 0.36, GIANT_RING = 0.78, GIANT_DOTS = 72;
const ringInk = new Stipple(P.landInkHigh, 'dot', 4.2, null, false), ringPencil = new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), 0.6).getHexString(), 'dot', 2.8, null, false);
const ringTilt = new THREE.Group();
if (WORLD.goal === 'feed') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#e9dcc0'; g.strokeStyle = P.landInkHigh; g.lineWidth = 3;
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
  // Its belts, as fine engraved bands, and its night side hatched.
  g.save(); g.beginPath(); g.arc(128, 128, 121, 0, Math.PI * 2); g.clip();
  g.lineWidth = 1.6; g.globalAlpha = 0.45;
  for (const y of [72, 82, 108, 116, 146, 172, 186]) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 7, 176, y + 7, 256, y); g.stroke(); }
  g.globalAlpha = 0.3; g.lineWidth = 1.4;
  for (let x = 170; x < 330; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 70, 256); g.stroke(); }
  g.restore();
  g.globalAlpha = 1; g.lineWidth = 4;
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // (Its clear corners discarded rather than drawn, so they don't hide the ring behind them.)
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
  disc.scale.setScalar(GIANT_R * 2);
  disc.renderOrder = 1;
  giant.add(disc);
  for (const s of [ringInk, ringPencil]) { s.linger = 4; ringTilt.add(s.object); }
  ringTilt.rotation.set(0.62, 0, 0.3);
  giant.add(ringTilt);
  giant.position.copy(GIANT_AT);
  scene.add(giant);
}
let ringShown = -1;
/** The giant's ring, inked round as far as it's full: it fills as it's fed, and thins away dot by dot. */
const RING_PALE = new THREE.Color('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), 0.6).getHexString()), RING_AIMED = new THREE.Color(P.landInk);
let aimedFor = 0;
function feeding(dt: number): void {
  ringInk.update(dt);
  ringPencil.update(dt);
  // While the world is tipped the giant's way, its ring's empty dots darken, softly: a burst now would reach it.
  aimedFor += ((planet.towardGiant && !planet.over ? 1 : 0) - aimedFor) * Math.min(1, dt * 5);
  ((ringPencil.object.material as THREE.ShaderMaterial).uniforms.uInk.value as THREE.Color).copy(RING_PALE).lerp(RING_AIMED, aimedFor);
  const inked = Math.round(GIANT_DOTS * Math.min(1, planet.orbit / ORBIT));
  if (inked === ringShown) return;
  ringShown = inked;
  const ink: number[] = [], pencil: number[] = [];
  for (let i = 0; i < GIANT_DOTS; i++) {
    const a = (i / GIANT_DOTS) * Math.PI * 2, x = GIANT_RING * Math.cos(a), z = GIANT_RING * Math.sin(a);
    (i < inked ? ink : pencil).push(x, 0, z);
  }
  ringInk.set(ink);
  ringPencil.set(pencil);
}
/**
 * The lava lamp's blobs: drawn on a shell just over the glass as metaballs, each blob's pull
 * falling away with distance and summed, the edge where the sum is one. So two blobs near each
 * other neck and join as the wax in a lamp does, with a clean edge a pixel wide. Hot, a blob glows
 * orange with a paler heart; cooling, it deepens to red; its edge a shade darker. The bud at the
 * heat, and the pool on the far shore, are drawn as blobs too.
 */
const BLOBS = 26, LAMP = !!WORLD.rules.lamp;
const blobAt = Array.from({ length: BLOBS }, () => new THREE.Vector4()), blobHeat = new Float32Array(BLOBS);
const blobCount = { value: 0 };
if (LAMP) {
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1 + RELIEF * 0.08, 160, 120), new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uBlob: { value: blobAt }, uHeat: { value: blobHeat }, uCount: blobCount, uHot: { value: new THREE.Color(P.lava) }, uCool: { value: new THREE.Color(P.deepLava) }, uHeart: { value: new THREE.Color('#f6c27a') }, uTime: lavaClock, uPx: pxRatio },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec4 uBlob[${BLOBS}];
      uniform float uHeat[${BLOBS}];
      uniform int uCount;
      uniform vec3 uHot, uCool, uHeart;
      uniform float uTime, uPx;
      varying vec3 vDir;
      ${LOOK ? LAMP_PRINT_FUNCTIONS : ''}
      void main() {
        float f = 0.0, hs = 0.0;
        for (int i = 0; i < ${BLOBS}; i++) {
          if (i >= uCount) break;
          float r = uBlob[i].w, d = acos(clamp(dot(vDir, uBlob[i].xyz), -1.0, 1.0));
          // Its pull: one at its edge, falling away beyond it, and nothing far off (so blobs don't swell each other from afar).
          float k = max(0.0, r * r / (d * d + 1e-6) - 0.12);
          f += k;
          hs += uHeat[i] * k;
        }
        float heat = f > 0.0 ? hs / f : 0.0, w = max(fwidth(f), 1e-4), a = smoothstep(0.88 - w, 0.88 + w, f);
        if (a <= 0.0) discard;
        ${LOOK ? LAMP_PRINT : `vec3 col = mix(uCool, uHot, smoothstep(0.2, 0.9, heat));
        col = mix(col, uHeart, smoothstep(1.6, 5.0, f) * heat * 0.6);
        col = mix(col * 0.78, col, smoothstep(0.88, 1.5, f));
        gl_FragColor = vec4(col, a * (0.45 + 0.55 * smoothstep(0.0, 0.4, heat)));`}
        #include <colorspace_fragment>
      }`,
  }));
  shell.renderOrder = 2;
  group.add(shell);
}
/** Each frame: the blobs, the bud at the heat, and the pool on the far shore, into the shell's uniforms. */
function lamping(): void {
  let n = 0;
  const put = (x: number, y: number, z: number, area: number, heat: number) => { if (n < BLOBS && area > 0.05) { blobAt[n].set(x, y, z, blobRadius(area)); blobHeat[n] = heat; n++; } };
  const q = planet.plume, s = planet.shore;
  if (s && planet.pooled > 0) put(s.x, s.y, s.z, Math.min(planet.pooled, (s.r * 0.9 / blobRadius(1)) ** 2), 0.75);
  if (!planet.over) put(q.x, q.y, q.z, planet.pressure, 1);
  for (const b of planet.blobs) put(b.x, b.y, b.z, b.area, Math.max(0, b.heat));
  blobCount.value = n;
}
/**
 * The three suns, engraved in the sky above the world: each where it is in its wandering, side to
 * side, and larger the nearer it is to the world. Fixed in the sky, as the giant is on Enceladus.
 */
const SUNS = !!WORLD.rules.suns, sunMarks: THREE.Sprite[] = [];
if (SUNS) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#efdca8'; g.strokeStyle = P.landInkHigh; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill(); g.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + 40 * Math.cos(a), 64 + 40 * Math.sin(a)); g.lineTo(64 + 54 * Math.cos(a), 64 + 54 * Math.sin(a)); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 3; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true })); scene.add(m); sunMarks.push(m); }
}
/** Each frame: the suns, where they are now. */
function sunning(): void {
  planet.stars.forEach((st, i) => {
    const d = Math.hypot(st.x, st.y), near = 1 / Math.max(0.35, d);
    sunMarks[i].position.set(THREE.MathUtils.clamp(st.x * 0.8, -1.25, 1.25), 2.2 + THREE.MathUtils.clamp(st.y * 0.12, -0.15, 0.15), -4.8);
    sunMarks[i].scale.setScalar(0.14 + 0.12 * Math.min(2, near));
  });
}
let orbitShown = -1;
/** The ring turns slowly; it's inked as far as the rock thrown up goes, and in the long age the rock gathers into the moon. */
function orbiting(dt: number): void {
  orbitSpin.rotation.z += dt * 0.03;
  orbitInk.update(dt);
  orbitPencil.update(dt);
  // Once the fire is done: met, the rock gathers round to one place, as the moon; not, it falls back.
  const age = ending ? Math.min(1, (planet.seconds - ending.from) / (LONG_AGE * 0.5)) : 0, made = !!ending?.won;
  const thrown = Math.min(1, planet.orbit / ORBIT), inked = Math.round(ORBIT_DOTS * thrown * (1 - age));
  const shown = ending ? -1 - inked : inked;
  if (shown !== orbitShown) {
    orbitShown = shown;
    const ink: number[] = [], pencil: number[] = [];
    for (let i = 0; i < ORBIT_DOTS; i++) {
      const a = (i / ORBIT_DOTS) * Math.PI * 2;
      // Inked from the moon's place round; gathering, the dots furthest round from it go first.
      if (i < inked) ink.push(ORBIT_R * Math.cos(a), ORBIT_R * Math.sin(a), 0);
      else if (!ending) pencil.push(ORBIT_R * Math.cos(a), ORBIT_R * Math.sin(a), 0);
    }
    orbitInk.set(ink);
    orbitPencil.set(pencil);
  }
  if (made) {
    const size = 0.34 * Math.cbrt(Math.max(1, planet.orbit / ORBIT)) * age;
    moonMark.scale.setScalar(Math.max(0.001, size));
    (moonMark.material as THREE.SpriteMaterial).opacity = age;
  }
}
const HEIGHT = WORLD.height ?? { target: 0, kmPerUnit: 40 };
const LAND = Math.round((WORLD.land ?? 0) * 1000) / 10, ISLAND = WORLD.island ?? 0, POOL = WORLD.pool ?? 0, ROUND = Math.round((WORLD.round ?? 0) * 100), COVER = Math.round((WORLD.cover ?? 0) * 100), PLUMES = WORLD.plumes ?? 0, ORBIT = WORLD.orbit ?? 0;
let aimDone = 0, aimOf = WORLD.goal === 'ring' ? CHAIN.stretches : WORLD.goal === 'height' ? HEIGHT.target : WORLD.goal === 'cover' ? COVER : WORLD.goal === 'round' ? ROUND : WORLD.goal === 'ridge' ? Planet.RIDGE_STRETCHES : WORLD.goal === 'lamp' || WORLD.goal === 'bank' ? 100 : WORLD.goal === 'land' ? LAND : WORLD.goal === 'plumes' ? PLUMES : WORLD.goal === 'orbit' || WORLD.goal === 'feed' ? 100 : planet.basins.length, lastAim = -10;
/** How much of the aim is done now, reckoned afresh. */
function reckonAim(): void {
  if (chain) { aimDone = chain.update(planet, topo); aimOf = CHAIN.stretches; }
  else if (WORLD.goal === 'height') { aimDone = Math.max(0, planet.summit * HEIGHT.kmPerUnit); aimOf = HEIGHT.target; }
  else if (WORLD.goal === 'cover') { aimDone = planet.covered * 100; aimOf = COVER; }
  else if (WORLD.goal === 'plumes') { aimDone = planet.plumes.length; aimOf = PLUMES; }
  else if (WORLD.goal === 'round') { aimDone = planet.roundness * 100; aimOf = ROUND; }
  else if (WORLD.goal === 'ridge') { aimDone = planet.ridgeRaise().filter((r) => r >= planet.k.ridge).length; aimOf = Planet.RIDGE_STRETCHES; }
  else if (WORLD.goal === 'lamp') { aimDone = (100 * planet.pooled) / POOL; aimOf = 100; }
  else if (WORLD.goal === 'land') { aimDone = planet.landShare() * 100; aimOf = LAND; }
  else if (WORLD.goal === 'bank') { aimDone = (100 * planet.bankLand) / ISLAND; aimOf = 100; }
  else if (WORLD.goal === 'orbit' || WORLD.goal === 'feed') { aimDone = (100 * planet.orbit) / ORBIT; aimOf = 100; }
  else { aimDone = planet.basins.filter((b) => planet.flooded(b) >= FLOODED_ENOUGH).length; aimOf = planet.basins.length; }
}
// (Land on the three-sun world counts only as the fire ends: it has to last through the chaos.)
const won = () => aimOf > 0 && aimDone >= aimOf && (WORLD.goal !== 'land' || planet.over);
let toldHeight = 0, toldDone = 0, toldAimAt = -1e9;
/** The aim, in a line for the foot: said once the world has begun, and again if a long while passes with nothing gained. */
const AIM_WORDS = WORLD.goal === 'ring' ? 'Keep building islands as the heat travels the dotted line. A gap breaks the chain'
  : WORLD.goal === 'basins' ? 'Flood each dotted basin with lava'
  : WORLD.goal === 'cover' ? `Make ${COVER}% of the old ice new`
  : WORLD.goal === 'land' ? `Have ${LAND}% of the world standing as land when the fire ends`
  : WORLD.goal === 'bank' ? 'Build out to the dotted bank, and raise an island there'
  : WORLD.goal === 'ridge' ? 'Raise a ridge all the way round the dotted equator'
  : WORLD.goal === 'lamp' ? 'Bring warm blobs to the dotted shore on the far side'
  : WORLD.goal === 'round' ? `Fill the hollows until the asteroid is ${ROUND}% rounder`
  : WORLD.goal === 'plumes' ? `Raise ${PLUMES} great plumes at high tide, each outside the dotted rings`
  : WORLD.goal === 'orbit' ? 'Throw up enough rock to make a moon'
  : WORLD.goal === 'feed' ? 'Fill the giant\'s ring: tip each burst towards the giant'
  : `Raise the mountain ${HEIGHT.target} km high`;
/** Say the aim now and then, and what's been gained each time something is. */
function tellAim(now: number): void {
  if (planet.over || ending) return;
  if (now - toldAimAt > 180) { toldAimAt = now; announce(AIM_WORDS); }
  if (WORLD.goal === 'height' || WORLD.goal === 'cover' || WORLD.goal === 'round' || WORLD.goal === 'land' || WORLD.goal === 'orbit' || WORLD.goal === 'feed' || WORLD.goal === 'lamp' || WORLD.goal === 'bank') return;
  const done = Math.round(aimDone);
  if (done > toldDone && done < aimOf) {
    toldAimAt = now;
    announce(WORLD.goal === 'ring' ? `${done} of ${aimOf} stretches living` : WORLD.goal === 'ridge' ? `${done} of ${aimOf} stretches raised` : WORLD.goal === 'plumes' ? `${done} of ${aimOf} great plumes` : `${done} of ${aimOf} basins flooded`);
  }
  toldDone = done;
}
/** Points round a circle on the world (on the unit sphere): about `c`, `r` radians out, about every 0.045. */
function circleAt(c0: { x: number; y: number; z: number }, r: number): THREE.Vector3[] {
  const c = new THREE.Vector3(c0.x, c0.y, c0.z).normalize();
  const u = new THREE.Vector3().crossVectors(c, Math.abs(c.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(c, u), pts: THREE.Vector3[] = [];
  const around = Math.max(24, Math.round((Math.PI * 2 * Math.sin(r)) / 0.045));
  for (let i = 0; i < around; i++) {
    const a = (i / around) * Math.PI * 2;
    pts.push(c.clone().multiplyScalar(Math.cos(r)).addScaledVector(u, Math.sin(r) * Math.cos(a)).addScaledVector(w, Math.sin(r) * Math.sin(a)));
  }
  return pts;
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
  if (!ending) reckonAim(); // (once the fire is done, what it did stands, whatever the long age does after)
  if (begun) tellAim(now);
  const inked: number[] = [], pencilled: number[] = [], next: number[] = [];
  if (WORLD.goal === 'orbit') {
    // The moon to be: its ring of dots round the world, inked as the rock reaches it (see `orbiting`).
    const step = Math.floor(aimDone / 10) * 10;
    if (begun && step > toldHeight && step < aimOf) { toldHeight = step; toldAimAt = now; announce(`${step}% of a moon in orbit`); }
    return;
  }
  if (WORLD.goal === 'bank' && planet.bank) {
    // The bank, in dots, inked round as its island rises; told at the foot by the quarter.
    const step = Math.floor(aimDone / 25) * 25;
    if (begun && step > toldHeight && step < aimOf) { toldHeight = step; toldAimAt = now; announce(`The island is ${step}% raised`); }
    const pts = circleAt(planet.bank, planet.bank.r * 1.3), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
    onGround(pts.slice(0, filled), ink);
    onGround(pts.slice(filled), pencil);
    aimInk.set(ink);
    aimPencil.set(pencil);
    return;
  }
  if (WORLD.goal === 'lamp' && planet.shore) {
    // The far shore, in dots, inked round as it fills; told at the foot by the quarter.
    const step = Math.floor(aimDone / 25) * 25;
    if (begun && step > toldHeight && step < aimOf) { toldHeight = step; toldAimAt = now; announce(`The far shore is ${step}% full`); }
    const pts = circleAt(planet.shore, planet.shore.r), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
    onGround(pts.slice(0, filled), ink);
    onGround(pts.slice(filled), pencil);
    aimInk.set(ink);
    aimPencil.set(pencil);
    return;
  }
  if (WORLD.goal === 'feed') {
    // The giant's ring, inked as far as it's full (see `feeding`); told at the foot as it fills, by
    // the quarter. (It thins, so a quarter can be told again once it's fallen back and been regained.)
    const step = Math.floor(aimDone / 25) * 25;
    if (begun && step > toldHeight && step < aimOf) { toldAimAt = now; announce(`The ring is ${step}% full`); }
    toldHeight = step;
    return;
  }
  if (WORLD.goal === 'height' || WORLD.goal === 'cover' || WORLD.goal === 'round' || WORLD.goal === 'land') {
    // How far along is told at the foot, every two km (or every 5%, or 10%, or 1% of land).
    const by = WORLD.goal === 'height' ? 2 : WORLD.goal === 'round' ? 10 : WORLD.goal === 'land' ? 1 : 5, step = Math.floor(aimDone / by) * by;
    if (begun && step > toldHeight && step < aimOf) { toldHeight = step; toldAimAt = now; announce(WORLD.goal === 'height' ? `The mountain is ${step} of ${aimOf} km high` : WORLD.goal === 'round' ? `${step}% rounder, of ${aimOf}%` : WORLD.goal === 'land' ? `${step}% of the world is land, of ${aimOf}%` : `${step}% of the ice made new, of ${aimOf}%`); }
    // On the asteroid, its deepest hollows stippled in pencil, as old charts stippled a depression:
    // where lava is wanted. They fade as they fill.
    if (WORLD.goal === 'round') {
      const h = (v: number) => planet.rock[v] + planet.lava[v];
      let m = 0;
      for (let v = 0; v < N; v++) m += h(v);
      m /= N;
      const deep = m - planet.spreadOf(h) * 0.9, dots: number[] = [];
      for (let v = 0; v < N; v += 7) if (h(v) < deep) { const r = 1 + RELIEF * Math.max(0, h(v)) + 0.003; dots.push(base[v * 3] * r, base[v * 3 + 1] * r, base[v * 3 + 2] * r); }
      aimPencil.set(dots);
    }
    // And the ring round the heat, inked round as far as the aim is met.
    const R = WORLD.goal === 'height' ? 0.32 : 0.3, around = Math.max(24, Math.round((Math.PI * 2 * Math.sin(R)) / 0.045));
    const filled = Math.round(around * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
    const q = new THREE.Vector3();
    for (let i = 0; i < around; i++) {
      const a = Math.PI / 2 - (i / around) * Math.PI * 2;
      q.set(Math.sin(R) * Math.cos(a), Math.sin(R) * Math.sin(a), Math.cos(R));
      // Lifted to the ground beneath where the ring now lies.
      const v = nearestAbove(q.clone().applyQuaternion(gauge.quaternion));
      const r = Math.max(1, Math.hypot(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2])) + 0.003;
      (i < filled ? ink : pencil).push(q.x * r, q.y * r, q.z * r);
    }
    gaugeInk.set(ink);
    gaugePencil.set(pencil);
    return;
  }
  if (chain) {
    // The route in small dots round the world: pale across what's still to do, inked where held.
    const per = 6, pts = chain.points(per), here = Math.floor(chain.where(planet.plume).round * CHAIN.stretches);
    chain.held.forEach((h, i) => onGround(pts.slice(i * per, (i + 1) * per), h ? inked : (i - here + CHAIN.stretches) % CHAIN.stretches <= 1 ? next : pencilled));
  } else if (WORLD.goal === 'ridge') {
    // The equator, in dots, round the spin's axis: a stretch inked once it's raised into ridge.
    const raise = planet.ridgeRaise(), per = 8, n = Planet.RIDGE_STRETCHES;
    for (let k = 0; k < n; k++) {
      const pts = [];
      for (let i = 0; i < per; i++) { const a = ((k + i / per) / n) * Math.PI * 2; pts.push({ x: Math.cos(a), y: 0, z: Math.sin(a) }); }
      onGround(pts, raise[k] >= planet.k.ridge ? inked : pencilled);
    }
  } else if (WORLD.goal === 'plumes') {
    // Round each great plume counted, the ground it has taken: another must rise outside it. The
    // one the heat is inside now, if any, doubled: a plume here wouldn't count.
    const q = planet.plume, apart = Math.cos(planet.k.plumesApart);
    for (const g of planet.plumes) {
      onGround(circleAt(g, planet.k.plumesApart), inked);
      if (g.x * q.x + g.y * q.y + g.z * q.z > apart) onGround(circleAt(g, planet.k.plumesApart * 0.9), inked);
    }
  } else {
    for (const b of planet.basins) {
      // The basin's edge, as a circle on the ground round its middle.
      const pts = circleAt(b, b.r * 0.8);
      // Inked round as the floor floods, like a gauge: whole once it's flooded enough.
      const filled = Math.round(pts.length * Math.min(1, planet.flooded(b) / FLOODED_ENOUGH));
      onGround(pts.slice(0, filled), inked);
      onGround(pts.slice(filled), pencilled);
    }
  }
  aimInk.set(inked);
  aimPencil.set(pencilled);
  aimNext.set(next);
}

const NORMAL = new THREE.Vector3(), EYE = new THREE.Vector3();

// ---------------------------------------------------------------- touch

const spin = new THREE.Vector2();
const turn = new THREE.Quaternion(), axis = new THREE.Vector3();
function rotate(ax: number, ay: number): void {
  turn.setFromAxisAngle(axis.set(0, 1, 0), ax); group.quaternion.premultiply(turn);
  turn.setFromAxisAngle(axis.set(1, 0, 0), ay); group.quaternion.premultiply(turn);
}
const finger = { x: 0, y: 0 };
/** Where on the world (in its own frame, a unit vector) a point on the screen falls, if it falls on the world at all. */
const ray = new THREE.Raycaster(), NDC = new THREE.Vector2();
function onWorld(x: number, y: number): THREE.Vector3 | null {
  const r = stage.getBoundingClientRect();
  NDC.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(NDC, camera);
  const hit = ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.clone().applyQuaternion(INVERSE.copy(group.quaternion).invert()).normalize() : null;
}
/** Where the heat has been called to, by a tap: a small pencilled ring, until it gets there. */
const callMark = mark((g) => { g.lineWidth = 3; g.setLineDash([4, 4]); g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.stroke(); });
/** Whether a finger is holding the vent shut. */
let holding = false;
function holdShut(): void {
  if (!begun || ending || planet.over) return;
  holding = planet.clamped = true;
  feel(15);
}
function letGo(): void {
  if (!holding) return;
  holding = false;
  planet.unclamp();
}

const gestures = new GestureRecognizer(
  {
    // A tap on the world, where the heat can move: it creeps to the place touched.
    tap(x, y) {
      if (!begun || ending || planet.over || planet.k.rises <= 0) return;
      const at = onWorld(x, y);
      if (at) planet.callTo(at.x, at.y, at.z);
    },
    spin(dx, dy) { spin.set(0, 0); rotate(dx * 0.006, dy * 0.006); },
    fling(vx, vy) { spin.set(vx * 0.006, vy * 0.006); },
    zoom(f) { dist /= f; look(); zoomedAt = seconds; },
    // Two fingers turning turn the world about the line of sight, so it can be spun any way at all.
    twist(a) { turn.setFromAxisAngle(axis.set(0, 0, 1), -a); group.quaternion.premultiply(turn); },
    // A finger resting on the world holds the vent shut: the pressure builds, however the world is
    // tipped, and the world can still be turned by dragging, to aim. Lifted, it lets it all out.
    grab() { holdShut(); },
    press() { /* (the pressure builds of itself) */ },
    pull() { /* (dragging while held turns the world: see heldMove) */ },
    heldMove(dx, dy) { rotate(dx * 0.006, dy * 0.006); },
    release() { letGo(); },
    drawer() { /* none */ },
  },
  // A finger that rests on the world takes hold of it (to hold the vent shut); one that moves at once spins it.
  (x, y) => begun && !ending && onWorld(x, y) !== null,
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
addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); } if (e.key === ' ' && !e.repeat) { e.preventDefault(); holdShut(); } });
addEventListener('keyup', (e) => { keys.delete(e.key); if (e.key === ' ') letGo(); });
function arrows(dt: number): void {
  const k = 1.1 * dt;
  if (keys.has('ArrowLeft')) rotate(-k, 0);
  if (keys.has('ArrowRight')) rotate(k, 0);
  if (keys.has('ArrowUp')) rotate(0, -k);
  if (keys.has('ArrowDown')) rotate(0, k);
}

// ---------------------------------------------------------------- cues, one idea at a time
/**
 * The first minute: a few quiet lines at the foot, each said once, when it's what matters next,
 * and never over what the world is saying itself. Then nothing more, but the aim now and then.
 */
const CUES: { ready: () => boolean; say?: string; begin?: () => void; done: (since: number) => boolean }[] = [
  { ready: () => true, say: LAMP ? 'Hold the world level, and a glowing blob buds and grows' : 'Hold the world level, and the heat gathers under the smoke', done: () => planet.pressure > planet.k.least * 2 },
  { ready: () => !planet.pouring, say: LAMP ? 'Tip it, and the blob lets go, and floats to the top' : 'Tip it, and the lava pours out', done: (s) => planet.tally.flows + planet.tally.bursts > 0 || s > 40 },
  // The touch, once the tilt is known: a finger held on the world holds the heat in; lifted, it lets it out.
  { ready: () => !planet.pouring && planet.pressure > planet.k.least, say: LAMP ? 'Or press and hold the world to hold the blob, and lift to let it go' : 'Or press and hold the world to hold the heat in, and lift to let it out', done: (s: number) => s > 12 },
  ...(WORLD.rules.rises ? [{ ready: () => true, say: 'Or tap a place, and the heat creeps there', done: (s: number) => s > 15 }] : []),
  ...(LAMP ? [{ ready: () => planet.blobs.length > 0, say: 'Turn the far shore to the top, and the warm blobs float there', done: (s: number) => s > 25 }] : []),
  ...(WORLD.goal === 'ridge' ? [{ ready: () => planet.tally.flows + planet.tally.bursts > 0, say: 'Wherever it comes out, the spin flings the lava to the equator', done: (s: number) => s > 25 }] : []),
  { ready: () => !LAMP && planet.pressure > planet.k.explosive * 0.9 && !planet.pouring, say: WORLD.goal === 'feed' ? 'The smoke is heavy: tip the world towards the giant now' : 'The smoke is heavy: tip it now, and it erupts', done: (s) => planet.tally.bursts > 0 || s > 40 },
  ...(WORLD.rules.rises ? [{ ready: () => true, say: 'Turn somewhere else to the top, and the heat creeps there', done: (s: number) => s > 25 }] : []),
  ...(LIFE ? [{ ready: () => ecology.held.length > 0, say: 'Six kinds of life, each needing its own ground', begin: () => { $('legend').classList.add('new'); }, done: (s: number) => ecology.kept > 0 || s > 60 }] : []),
  ...(WORLD.goal === 'plumes' ? [
    { ready: () => planet.tideNow > 0.6, say: 'High tide: the heat comes fast. When the smoke is darkest, burst', done: (s: number) => s > 20 },
    { ready: () => planet.tideNow < -0.6, say: 'Low tide: the heat comes slowly. Move it somewhere new now', done: (s: number) => s > 20 },
  ] : []),
  ...(WORLD.goal === 'orbit' ? [
    { ready: () => planet.tally.bursts > 0, say: 'The taller the cone, the more it holds, and the more a burst throws up', done: (s: number) => s > 25 },
    { ready: () => planet.pressure > planet.capNow * 0.8, say: 'The smoke is at its heaviest: the cone can hold little more', done: (s: number) => s > 12 },
  ] : []),
  ...(WORLD.goal === 'feed' ? [
    { ready: () => planet.tally.bursts > 0, say: 'The ring thins away unless it\'s fed: keep it fed', done: (s: number) => s > 20 },
  ] : []),
  ...(WORLD.rules.impactEvery?.[1] === 0 ? [] : [
    { ready: () => true, begin: () => { planet.stonesFall = true; }, done: () => planet.impact !== null || planet.tally.stones > 0 },
    { ready: () => planet.impact !== null, say: 'Turn it to the top before it lands, and its heat is yours', done: (s: number) => s > 20 },
  ]),
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
      if (L.say) announce(L.say);
      return;
    }
    if (L.done(seconds - lessonSince) && seconds - lessonSince > 6) { lesson++; lessonShown = false; $('legend').classList.remove('new'); }
    return;
  }
  planet.stonesFall = true;
  if (!embersSaid && planet.era === 'embers') { embersSaid = true; announce('The heat is nearly gone'); }
}


/** A soft pulse in the hand, where the phone can give one (not iPhones). */
function feel(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* none */ }
}

// ---------------------------------------------------------------- words, and the key
/** What's worth saying: the turns in the world's story, not every happening in it. */
const QUIET_WORDS = /^(A chaotic era begins|A stable era begins|The plume reaches the ring|A great plume, but too near|Wanted where|A stone is coming|Land breaks|Life begins in|The first|Moss grows|Wish met|Held too long|Stone caught|The fire is out|The heat is nearly|A dust storm|The storm passes)/;
const ERAS: Record<Era, string> = { young: 'A young fire', burning: 'Burning strong', cooling: 'Cooling', embers: 'Last embers', out: 'The fire is out' };
// (In free play the heat never runs low, so the title says what kind of play it is.)
if (FREE) { ERAS.young = 'Free play'; $('stage-name').textContent = ERAS.young; }
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
  // Under three suns, the title is the era the suns make: stable or chaotic.
  if (SUNS && !ending && !FREE) $('stage-name').textContent = planet.chaotic ? 'A chaotic era' : 'A stable era';
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
    // And a fountain of embers, thrown up and falling back glowing.
    for (let i = 0; i < (torn ? 70 : 40); i++) puffs.add('ember', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], torn ? 1.4 : 1);
    for (let i = 0; i < (torn ? 110 : 60); i++) puffs.add('ash', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], torn ? 1.5 : 1, Math.random, up);
  }
  Object.assign(tallied, planet.tally);
  // Steam where lava runs into the sea, as much as there is lava there.
  steamIn -= dt;
  if (steamIn <= 0) {
    steamIn = 0.6;
    for (let v = 0; v < N; v++) {
      const l = planet.lava[v];
      if (l > 0.004 && planet.rock[v] < 0.005 && Math.random() < Math.min(0.06, l)) puffs.add('steam', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 1, Math.random, up);
    }
  }
  // A dust storm: dust driven across the face of the world, low and fast.
  if (planet.storm) {
    for (let i = 0; i < 3; i++) {
      const v = Math.floor(Math.random() * N);
      NORMAL.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).applyQuaternion(group.quaternion);
      if (NORMAL.z > 0.2) puffs.add('smoke', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 0.3, Math.random, { x: INVERSE_RIGHT.x, y: INVERSE_RIGHT.y, z: INVERSE_RIGHT.z });
    }
  }
  // The vent smokes as the heat gathers: a wisp now and then while there's little, more and
  // heavier as it builds, and a dark column once it would burst.
  smokeIn -= dt;
  // (Under a cone that holds more, heaviest as it nears what the cone can hold: then it's close to blowing apart.)
  // (And on Io, the dark column is for a burst that would be a great plume, which the tide decides as much as the pressure.)
  const share = Math.min(1, planet.pressure / planet.capNow), brink = planet.pressure > planet.capNow * 0.85;
  const full = planet.k.great > 0 ? planet.throwOf(planet.pressure) >= planet.k.great : planet.bursting;
  if (!LAMP && !planet.over && !planet.pouring && planet.pressure > 0.5 && smokeIn <= 0) {
    smokeIn = brink ? 0.08 : full ? 0.15 : 0.5 - 0.3 * Math.min(1, planet.pressure / VOLCANO.explosive);
    // A few dots at a time, so the plume is a soft stipple, fuller as the heat gathers.
    for (let i = 0, k = full ? 6 : 3; i < k; i++) puffs.add('smoke', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], full ? 1.4 + share : 0.5 + share, Math.random, up);
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
/** The second aim, measured as the fire ends (see second.ts), and the best there has been on this world. */
let second: Second | null = null;
const BEST_KEY = `volcano.best.${WORLD.id}`;
const bestSoFar = (): number | null => { const b = remembered(BEST_KEY); return b === null ? null : Number(b); };
const RUN_TAG = SYSTEM && RUN !== null ? `${SYSTEM.seed}:${RUN}` : undefined;
function measureTheSecond(): void {
  second = measureSecond(WORLD, planet, topo, islands.list);
  // A world of a solar system: what it made is kept in the system, and passed on to the next.
  if (FREE) return; // (free play keeps no best: it has no clock to be best against)
  if (RUN !== null) {
    const sys = loadSystem();
    if (sys && sys.seed === SYSTEM?.seed && sys.bodies[RUN] && !sys.bodies[RUN].made) saveSystem(recordPlayed(sys, RUN, { met: !!ending?.won, second: second.value, words: second.words }));
    return; // (a world of a system is its own, with its own twist: no best kept for its kind)
  }
  const best = bestSoFar();
  if (best === null || second.value > best) {
    remember(BEST_KEY, String(second.value));
    if (best !== null) announce(`A new best: ${second.words}`);
  }
}
const LONG_AGE = 360, AGE_SPEED = 14, DRAWING = 7, TURN_AGAIN = 2.6;
/** What the long age after the fire does on this world, in a line for the foot: every world has one, met or not. */
/**
 * Each aim's words: what the long age after the fire does (met or not), what's said when the aim
 * is met, the chart's title met and not, and how far it got, for the chart's summary.
 */
const GOAL_WORDS: Record<typeof WORLD.goal, { age: (met: boolean) => string; done: string; title: [string, string]; got: () => string }> = {
  ring: { age: () => 'The islands sink, and coral rings them', done: 'Done: living islands all the way round', title: ['Ringed with islands', 'Not yet ringed'], got: () => `${aimDone} of ${aimOf} stretches living` },
  basins: { age: () => 'Time passes, and small stones still fall', done: 'Done: every basin flooded', title: ['Every basin flooded', 'Not every basin flooded'], got: () => `${aimDone} of ${aimOf} basins flooded` },
  height: { age: () => 'Time passes, and the storms go on', done: `Done: the mountain reaches ${HEIGHT.target} km`, title: ['The great mountain', 'Not high enough yet'], got: () => `${Math.round(aimDone)} of ${aimOf} km high` },
  cover: { age: () => 'Time passes, and the new ice greys', done: `Done: ${COVER}% of the ice made new`, title: ['New ice', 'Not enough new ice'], got: () => `${Math.round(aimDone)}% of the ice new, of ${aimOf}%` },
  plumes: { age: () => 'Time passes, and the sulphur settles', done: `Done: ${PLUMES} great plumes`, title: ['Great plumes', 'Not enough great plumes'], got: () => `${aimDone} of ${aimOf} great plumes` },
  land: { age: () => 'Time passes, and the tides go on', done: `Done: ${LAND}% of the world stands as land`, title: ['Land through the chaos', 'Not enough land'], got: () => `${aimDone.toFixed(1)}% of the world land, of ${aimOf}%` },
  bank: { age: () => 'Time passes, and the sea goes on', done: 'Done: an island on the bank', title: ['An island on the bank', 'No island on the bank yet'], got: () => `the island ${Math.min(100, Math.round(aimDone))}% raised` },
  ridge: { age: () => 'Time passes, and small stones still fall', done: 'Done: a ridge all the way round', title: ['Ringed with a ridge', 'Not yet ringed'], got: () => `${aimDone} of ${aimOf} stretches raised` },
  lamp: { age: () => 'Time passes, and the blobs sink into the deep', done: 'Done: the far shore is full', title: ['The far shore filled', 'The far shore not filled'], got: () => `the far shore ${Math.min(100, Math.round(aimDone))}% full` },
  round: { age: () => 'Time passes, and small stones still fall', done: `Done: the asteroid is ${ROUND}% rounder`, title: ['A rounder world', 'Not round enough yet'], got: () => `${Math.round(aimDone)}% rounder, of ${aimOf}%` },
  feed: { age: () => 'Time passes, and the ring slowly thins', done: 'Done: the ring is full', title: ['The ring is full', 'The ring is not full'], got: () => `the ring ${Math.min(100, Math.round(aimDone))}% full` },
  orbit: { age: (met) => (met ? 'Time passes, and the ring of rock gathers into a moon' : 'Time passes, and the rock in orbit falls back'), done: 'Done: enough rock in orbit for a moon', title: ['A moon is made', 'No moon yet'], got: () => `${Math.min(100, Math.round(aimDone))}% of a moon in orbit` },
};
const AGE_WORDS = (met: boolean) => GOAL_WORDS[WORLD.goal].age(met);
let ending: { from: number; shown: boolean; at: number; info: ChartInfo | null; turned: number; won: boolean } | null = null;
let wonSeen = -1;
const wonAt = () => (wonSeen < 0 ? (wonSeen = seconds) : wonSeen);
let metInFreePlay = false;
function theEnd(): void {
  // In free play, the aim met is said, and the fire goes on.
  if (FREE && !ending && begun && won() && !metInFreePlay) { metInFreePlay = true; announce(`${GOAL_WORDS[WORLD.goal].done}. Play on as long as you like`); feel([30, 50, 30]); }
  // Done: the aim met, while the fire still burns; or not, and the fire out.
  if (!ending && begun && won() && !FREE) {
    ending = { from: planet.seconds, shown: false, at: 0, info: null, turned: 0, won: true };
    queue.length = 0;
    announce(GOAL_WORDS[WORLD.goal].done);
    feel([30, 50, 30]);
    measureTheSecond();
    // On a world with a sea, the fire goes out and the long age follows even so, for its atolls.
    planet.reserve = 0; planet.pressure = 0;
    announce(AGE_WORDS(true));
  }
  if (!ending && planet.over) {
    ending = { from: planet.seconds, shown: false, at: 0, info: null, turned: 0, won: FREE && won() };
    $('finish').classList.remove('shown');
    $('stage-name').textContent = ERAS.out;
    queue.length = 0;
    announce(`The fire is out. ${AGE_WORDS(ending.won)}`);
    measureTheSecond();
  }
  // Met, the chart comes a few moments later; not, after a long age has worn at what was made.
  if (ending && !ending.shown && planet.seconds - ending.from >= LONG_AGE && (!ending.won || seconds - wonAt() > 4)) {
    ending.shown = true;
    ending.at = seconds;
    ecology.update(0);
    ending.info = chartInfo();
    // What this fire left is the ground the next one on this world rises through.
    let marked: Uint8Array | null = null;
    if (FL) { marked = new Uint8Array(N); for (let v = 0; v < N; v++) marked[v] = planet.age[v] < 1e5 || (MARKED?.[v] ?? 0) ? 1 : 0; }
    if (RUN === null) keepGround(WORLD.id, { rock: planet.rock.slice(), fires: FIRES + 1, marked });
    $('stage-name').textContent = ending.info.title;
    $('worlds').style.display = 'none'; // (the chart has its own title there)
    void forget(); // the world is finished: nothing to come back to
  }
}

const SHORT: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/Land breaks the surface/, () => 'first land'],
  [/Life begins in/, () => 'life begins'],
  [/Moss grows/, () => 'moss'],
  [/The first (\w+)/, (m) => m[1]],
  [/Wish met/, () => 'a wish met'],
  [/blew apart/, () => 'a caldera'],
  [/Stone caught/, () => 'a stone caught'],
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

  const met = !!ending?.won, words = GOAL_WORDS[WORLD.goal];
  return {
    title: words.title[met ? 0 : 1],
    subtitle: `${WORLD.numeral} · ${WORLD.title} · ${FIRES ? `fire ${FIRES + 1} · ` : ''}${mm} of fire`,
    kinds: LIFE ? KINDS.map((k) => ({ name: k.name, ink: k.ink, sign: k.sign, living: living.has(k.kind) })) : [],
    // The first aim, how far it got; and the second, as the fire left it.
    summary: words.got() + (second ? ` · ${second.words}` : ''),
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
    $('again').textContent = RUN !== null ? 'touch to go back to the solar system' : next ? `touch to go on to ${next.title.replace(/^An? /, 'an ').replace(/^The /, 'the ')}` : ending.won ? 'touch to start again' : 'touch to try again';
    $('again').classList.add('shown');
    intoTheAtlas();
    // The chart can be kept as a picture where the page may hand over a file: not inside a frame (as a hosted preview), which can't.
    if (window.self === window.top) $('keep').classList.add('shown');
  }
}
/**
 * Once the chart is drawn, a touch (a tap, not a drag, which still turns the world) goes on: to
 * the next world if this one's aim was met, or this one again. Turning the world all the way round
 * does the same.
 */
let tapFrom: { x: number; y: number; t: number } | null = null;
addEventListener('pointerdown', (e) => { tapFrom = { x: e.clientX, y: e.clientY, t: performance.now() }; });
addEventListener('pointerup', (e) => {
  const from = tapFrom;
  tapFrom = null;
  if (!from || !ending?.shown || seconds - ending.at < DRAWING || ending.turned < 0) return;
  if ((e.target as HTMLElement).closest?.('#keep, #worlds')) return;
  if (performance.now() - from.t < 350 && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 12) { ending.turned = -1e9; anew(); }
});
// The worlds, off the world in a corner: touch to go back to the card that lists them (the world is kept, to come back to).
// (Only this world's numeral, so six of them don't run into the title: touched, the card shows them all.)
$('worlds').textContent = WORLD.numeral;
$('worlds').addEventListener('click', () => {
  save();
  setTimeout(() => location.reload(), 300);
});
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
  document.body.classList.add('leaving'); // (the world fades back to the paper as the next is fetched)
  // A world of a solar system: back to the system's chart, to choose the next.
  if (RUN !== null) { setTimeout(() => { location.search = '?system'; }, 900); return; }
  const q = new URLSearchParams(location.search);
  q.delete('seed');
  // Met, on to the next world, if there is one; otherwise this world again.
  const next = ending?.won ? nextWorld(WORLD) : null;
  q.delete('world');
  remember('volcano.world', (next ?? WORLD).id);
  setTimeout(() => { location.search = q.toString(); }, 900);
}
/** The plate, as a picture: the world drawn once more (turned so its biggest island faces us, where it has islands), in its chart. */
function plate(): HTMLCanvasElement {
  const biggest = islands.list.slice().sort((a, b) => b.vertices.length - a.vertices.length)[0];
  const was = group.quaternion.clone();
  if (biggest) {
    PLUME.set(...at(biggest.centre)).applyQuaternion(group.quaternion);
    group.quaternion.premultiply(SWING.setFromUnitVectors(PLUME, new THREE.Vector3(0, 0, 1)));
  }
  // Drawn centred, not stepped up the page as the chart on screen has it, so the world isn't cut.
  const lifted = lift;
  lift = 0; look();
  group.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const cv = drawChart(renderer.domElement, ending!.info!);
  group.quaternion.copy(was);
  lift = lifted; look();
  return cv;
}
$('keep').addEventListener('click', () => {
  const a = document.createElement('a'); a.href = plate().toDataURL('image/png'); a.download = `volcano-${seed}.png`; a.click();
});
/** Once the chart is drawn, it goes into the atlas: a small picture of the plate, and what it says. */
let paged = false;
function intoTheAtlas(): void {
  if (paged || !ending?.info) return;
  paged = true;
  const big = plate(), small = document.createElement('canvas');
  small.width = 480; small.height = Math.round(480 * big.height / big.width);
  small.getContext('2d')!.drawImage(big, 0, 0, small.width, small.height);
  const i = ending.info;
  void keepPage({ world: WORLD.id, numeral: WORLD.numeral, title: i.title, subtitle: i.subtitle, summary: i.summary, when: Date.now(), image: small.toDataURL('image/jpeg', 0.82) });
}

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
  /** For a world of a solar system: which system (its seed) and which of its worlds. */
  run?: string;
  /** Whether it was being played free, with no clock. */
  free?: boolean;
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
    run: RUN_TAG,
    free: FREE,
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
  if (!w || !w.planet || (w.world ?? 'ocean') !== WORLD.id || w.run !== RUN_TAG || !!w.free !== FREE) return false;
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
// (Not for a world of a solar system: it's reached from the system's chart.)
if (RUN === null) for (const w of WORLDS) {
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
// The card says little: a mood, one true thing about the world, and what to do and what it does. Play teaches the rest.
($('begin').querySelector('.then') as HTMLElement).textContent = WORLD.then;
($('begin').querySelector('.second') as HTMLElement).textContent = WORLD.second;
// The best there has been at the second aim on this world, under the card's words.
{
  const best = RUN === null ? bestSoFar() : null;
  if (best !== null) {
    const el = document.createElement('p');
    el.className = 'best';
    el.textContent = `best so far: ${secondWords(WORLD.goal, best)}`;
    $('begin').querySelector('.second')!.after(el);
  }
}
// The solar system, from the card: its worlds played as a run, in whatever order (see system.ts).
{
  const link = document.createElement('p');
  link.className = 'system-link';
  link.textContent = SYSTEM ? `voyage · ${madeCount(SYSTEM)} of ${SYSTEM.bodies.length} worlds made` : 'voyage — a run of worlds, one after another';
  link.addEventListener('pointerdown', (e) => { e.stopPropagation(); openSystem(); });
  $('begin').appendChild(link);
}
// Free play, from the card: this world with no clock; or, in free play, back to the world against the clock.
if (RUN === null) {
  const link = document.createElement('p');
  link.className = 'free';
  link.textContent = FREE ? 'keep time — the fire burns out' : 'wander — the fire never cools';
  link.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const q = new URLSearchParams(location.search);
    q.delete('seed');
    q.set('world', WORLD.id);
    if (FREE) q.delete('free'); else q.set('free', '');
    location.search = q.toString().replace(/free=(&|$)/, 'free$1');
  });
  $('begin').appendChild(link);
}
// How the worlds are drawn, from the card: as prints with woodblock lava or watercolour lava, or as before.
{
  const row = document.createElement('p');
  row.className = 'look';
  row.append('ink: ');
  LOOKS.forEach((l, i) => {
    if (i) row.append(' · ');
    const b = document.createElement('span');
    b.textContent = l.words;
    if (l.look === LOOK) b.className = 'here';
    else b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      remember('volcano.look', l.id);
      const q = new URLSearchParams(location.search);
      q.delete('look');
      location.search = q.toString();
    });
    row.appendChild(b);
  });
  $('begin').appendChild(row);
}
// The end of a fire in free play: when you choose.
$('finish').addEventListener('pointerdown', (e) => e.stopPropagation());
$('finish').addEventListener('click', () => { planet.end(); $('finish').classList.remove('shown'); });
$('system').addEventListener('pointerdown', (e) => e.stopPropagation());
$('system').querySelector('.close')!.addEventListener('click', () => closeSystem());
// Back from a world of the system (?system): straight to its chart.
if (ASKED.has('system')) openSystem();
// The atlas, from the card: every chart kept so far, newest first, to leaf through.
void pages().then((all) => {
  if (!all.length) return;
  const link = document.createElement('p');
  link.className = 'atlas-link';
  link.textContent = `the atlas · ${all.length} ${all.length === 1 ? 'plate' : 'plates'}`;
  link.addEventListener('pointerdown', (e) => { e.stopPropagation(); openAtlas(all); });
  $('begin').appendChild(link);
});
function openAtlas(all: Page[]): void {
  const box = $('atlas'), list = box.querySelector('.pages')!, view = box.querySelector('.view img') as HTMLImageElement;
  list.innerHTML = '';
  for (const p of all.slice().reverse()) {
    const fig = document.createElement('figure'), img = new Image(), cap = document.createElement('figcaption'), when = document.createElement('small');
    img.src = p.image; img.alt = `${p.title}: ${p.summary}`;
    cap.textContent = `${p.numeral} · ${p.title}`;
    when.textContent = new Date(p.when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    cap.append(document.createElement('br'), when);
    fig.append(img, cap);
    fig.addEventListener('click', () => { view.src = p.image; view.alt = img.alt; box.classList.add('viewing'); });
    list.appendChild(fig);
  }
  box.classList.add('open');
}
$('atlas').querySelector('.view')!.addEventListener('click', () => $('atlas').classList.remove('viewing'));
$('atlas').querySelector('.close')!.addEventListener('click', () => $('atlas').classList.remove('open', 'viewing'));
// A world with a past can be begun afresh, on new ground.
if (FIRES) {
  const fresh = document.createElement('p');
  fresh.className = 'fresh';
  fresh.textContent = 'start this world on new ground';
  fresh.addEventListener('pointerdown', (e) => { e.stopPropagation(); forgetGround(WORLD.id); void forget(); setTimeout(() => location.reload(), 200); });
  $('begin').appendChild(fresh);
}
// A world without life has no key of its kinds.
if (!LIFE) $('legend').style.display = 'none';
$('begin').addEventListener('pointerdown', () => {
  if (begun) return;
  begun = true;
  askForTilt();
  $('begin').classList.add('gone');
  if (FREE) $('finish').classList.add('shown');
});
void resume().then((back) => {
  if (!back) return;
  ($('begin').querySelector('.first') as HTMLElement).textContent = 'Your world, as you left it.';
  ($('begin').querySelector('.then') as HTMLElement).textContent = 'However you hold it now counts as level.';
  ($('begin').querySelector('.touch') as HTMLElement).textContent = 'touch to continue';
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
    // (Further back on a young Earth, to leave room for the moon's ring round it.)
    reachDist = THREE.MathUtils.clamp(3.4 + 2 * Math.acos(least), 3.4, 4.8) * (WORLD.goal === 'orbit' ? 1.3 : WORLD.goal === 'feed' || SUNS ? 1.15 : 1);
  }
  // At the end, the world steps back and up the page, leaving the foot for the chart.
  const want = ending?.shown ? farthest * 0.92 : reachDist, wantLift = ending?.shown ? 0.09 : 0;
  if (!ending?.shown && seconds - zoomedAt < 10) return;
  const d = dist + (want - dist) * Math.min(1, 0.15 * dt), l = lift + (wantLift - lift) * Math.min(1, 0.6 * dt);
  if (Math.abs(d - dist) > 1e-4 || Math.abs(l - lift) > 1e-5) { dist = d; lift = l; look(); }
}
/** If the phone can't keep up, draw a little less finely: the pixel ratio comes down a half at a time, but never below two to a point (see FINEST). */
let slowFor = 0, frameTime = 1 / 60;
/** Never coarser than this, however slow the phone: below two pixels to a point, lines and edges look pixelated. */
const FINEST = Math.min(2, window.devicePixelRatio || 1);
function pace(raw: number): void {
  frameTime += (raw - frameTime) * 0.05;
  slowFor = frameTime > 1 / 36 ? slowFor + raw : 0;
  if (slowFor > 3 && pixelRatio > FINEST) {
    slowFor = 0;
    pixelRatio = Math.max(FINEST, pixelRatio - 0.5);
    renderer.setPixelRatio(pixelRatio);
    fit();
  }
}

// ---------------------------------------------------------------- the loop
const INVERSE = new THREE.Quaternion(), GRAV = new THREE.Vector3(), SLIDE = new THREE.Quaternion(), GIANT_DIR = new THREE.Vector3();
fit();
drawNow();
redrawLines(0);
const clock = new THREE.Clock();
let seconds = 0, lastWords = 0, lastDraw = 0, lastIslands = 0, lastEcology = 0;
/** In development, how long each frame's own work took (before drawing), to find what stutters. */
const frameCost: number[] = [];
let stageShown = false;
renderer.setAnimationLoop(() => {
  const began0 = performance.now();
  // Once the world has been drawn, it comes in from the paper.
  if (!stageShown) { stageShown = true; requestAnimationFrame(() => stage.classList.add('shown')); }
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
  // And which way the giant is, on a world that has one in its sky.
  if (WORLD.goal === 'feed') { const s = GIANT_DIR.copy(GIANT_AT).normalize().applyQuaternion(INVERSE); planet.giant = { x: s.x, y: s.y, z: s.z }; }
  drawLevel();
  // Once the fire is out, the long age runs quickly, in small steps so the sea's work stays as it would be.
  const speed = ending && !ending.shown && (!ending.won || seconds - wonAt() > 4) ? AGE_SPEED : 1;
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
  blend.value = Math.min(1, (performance.now() / 1000 - blendFrom.at) / blendFrom.span);
  lavaClock.value = seconds;
  pxRatio.value = renderer.getPixelRatio();
  if (LOOK) cratering();
  if (WORLD.goal === 'cover' && ending) floodStrength.value = 0.85 * (1 - 0.5 * Math.min(1, (planet.seconds - ending.from) / LONG_AGE));
  crossFade();
  drawMarks();
  effects(dt);
  for (const pen of [...landPens, ...seaPens]) pen.update(dt, camera);
  if (begun) drawAim(seconds);
  aimInk.update(dt);
  aimPencil.update(dt);
  aimNext.update(dt);
  if (WORLD.goal === 'orbit') orbiting(dt);
  if (LAMP) lamping();
  if (SUNS) sunning();
  if (WORLD.goal === 'feed') feeding(dt);
  if (WORLD.goal === 'height' || WORLD.goal === 'cover' || WORLD.goal === 'round' || WORLD.goal === 'land') {
    // The ring follows the heat, eased, so it glides as the heat creeps.
    gaugeAt.lerp(new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z), 1 - Math.exp(-dt / 1.5)).normalize();
    gauge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gaugeAt);
    gaugeInk.update(dt);
    gaugePencil.update(dt);
  }
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

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { planet, group, base, renderer, scene, camera, puffs, ecology, islands, rotate, draw, save, world, frameCost, kindDots, chain: () => chain, aim: () => aimInk, lines: () => { lastLines = -1; redrawLines(1e6); }, life: () => { lastLife = -10; redrawLife(1e6); } };
