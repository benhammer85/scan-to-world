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
import { AGES, ageBefore, ageKey, carried } from './ages';
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
import { worldOf, nextWorld, chapterOf, type WorldId } from './worlds';
import { openGlobe, type Globe } from './atlasGlobe';
import { keepsakeOf, turningGlobe } from './keepsakeGlobe';
import { Chain, CHAIN } from './chain';
import { measureSecond, type Second } from './second';
import { loadSystem, saveSystem, worldFor, recordPlayed, madeCount } from './system';
import { openSystem, closeSystem } from './systemChart';
import { feel, keepImage, NATIVE, rumble, rumbles, tap } from './native';
import './fonts.css';
import { LOOKS, PRINT_FUNCTIONS, LAMP_PRINT_FUNCTIONS, LAMP_PRINT, LAMP_QUIET, printFragment, type Look } from './print';

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
addEventListener('resize', () => { fit(); cardView(); });
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
// (A world that tries another ink first keeps its own choice: chosen on its card, it's remembered for it alone.)
// The quiet print is every world's ink, unless another is chosen for it (and remembered, world by world).
// (A new key: inks chosen while comparing the print and the quiet print aren't carried over.)
const OWN_LOOK = 'volcano.ink';
const LOOK_ID = ASKED.get('look') ?? remembered(OWN_LOOK) ?? 'quiet';
const LOOK: Look = LOOKS.find((l) => l.id === LOOK_ID)?.look ?? 6; // (an ink not known any more: the quiet print)
/** The quiet print: lava the one warm accent on a calm map; burps only at the brink, splatter only when it bursts, the smoke lighter. */
const QUIET = LOOK === 6;
/** Lava drawn dark, as it mostly is: a black crust, the heat showing only where it's fresh (?lava=dark, or kept). */
// (The default, but not on the ice moons, where the lava is water; ?lava=quiet for the coloured inks.)
const DARK_LAVA = WORLD.rules.terrain !== 'ice' && WORLD.id !== 'ijen' && (() => { const asked = ASKED.get('lava'); if (asked) { try { localStorage.setItem('volcano.lava', asked); } catch { /* none */ } return asked !== 'quiet'; } try { return localStorage.getItem('volcano.lava') !== 'quiet'; } catch { return true; } })();
// (The ocean world leaves its terrain to the simulation's default, which is ocean: read as given it
// was undefined, and the first world was drawn as a dry one, with no sea, coast or shallows.)
const SEA = (WORLD.rules.terrain ?? 'ocean') === 'ocean';
// (A rogue planet has no star: the ground is dark, and what lives there is drawn at its full strength from the first, glowing out of it.)
const ROGUE = WORLD.id === 'rogue';
const P = WORLD.palette, LIFE = WORLD.rules.life !== false, ICE = WORLD.rules.terrain === 'ice';
// (Kawah Ijen's fire is blue: its lava drawn in the ice moons' blues, glowing out of the night.)
const BLUE = ICE || WORLD.id === 'ijen';
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
// (On a world drawn from its real heights, its ground is kept apart from what it was when made up.)
const GROUND_KEY = WORLD.rules.real ? `${WORLD.id}-real` : WORLD.id;
// (An age of Earth begins instead on the ground the age before it left: see ages.ts. And again on it
// each time it's played, so an age is always this world, not the last try at it.)
const AGE_BEFORE = RUN === null && !wanted ? ageBefore(WORLD.id) : null;
const AGE_GROUND = AGE_BEFORE ? recallGround(ageKey(AGE_BEFORE), N) : null;
const GROUND = wanted || RUN !== null || ageBefore(WORLD.id) || WORLD.id === AGES[0] ? null : recallGround(GROUND_KEY, N);
const FIRES = GROUND?.fires ?? 0;
const START = (() => {
  if (!GROUND) return nearest(0.1, 0.15, 0.98);
  const h = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const z = h(1) * 2 - 1, a = h(2) * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return nearest(r * Math.cos(a), r * Math.sin(a), z);
})();
/** Where lava has ever lain on this world (for those that keep the mark of it): the old seas, the old new ice. */
const MARKED = GROUND?.marked ?? null;
const planet = new Planet(topo, START, seed, WORLD.rules, AGE_GROUND && AGE_BEFORE ? carried(AGE_BEFORE, WORLD.id, AGE_GROUND.rock, WORLD.rules.floor ?? VOLCANO.floor) : GROUND?.rock);
planet.stonesFall = WORLD.goal === 'gather'; // not until the first ideas have come in (see `lessons`), but on the first world, from the first, since they're its aim
/**
 * Breathing, the calm way to play (chosen under "more"): no tipping the phone. The volcano breathes
 * out by itself, a flow at a time, down the screen as it's seen, and the world is turned to say where
 * it goes; a finger held down holds a breath, for a bigger one. (Not the lava lamp, whose tipping is its game.)
 */
/**
 * On a computer (a mouse, no touch, nothing that feels how it's held), there's no tipping: the world
 * can't be tilted, so it always counted as level and never poured. So there it breathes, and what's
 * said to the player speaks of the mouse and the space bar, never a phone.
 */
const COMPUTER = (navigator.maxTouchPoints || 0) === 0 && matchMedia('(pointer: fine)').matches;
const BREATHE = (remembered('volcano.controls') === 'breathe' || COMPUTER) && !WORLD.rules.lamp;
if (BREATHE) planet.k.pulse = planet.k.explosive * 0.55;
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
/** Each kept flow's shade, by how many pours have come since it (FLOWS): its own channel, beside the marks. */
const fineFlow = new Float32Array(FN), prevFlow = new Float32Array(FN);
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
geometry.setAttribute('aFlow', new THREE.BufferAttribute(fineFlow, 1));
geometry.setAttribute('aPrevFlow', new THREE.BufferAttribute(prevFlow, 1));
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
/** Where the vent is (the world's own frame), and whether it's feeding lava (the engraving's dashes stream while it is). */
const flash = { value: 0 }, ventObj = new THREE.Vector3(0, 0, 1), fed = { value: 0 }, building = { value: 0 }, spray = { value: 0 }, drift = { value: 0 }, burp = { value: -1 }, burpSize = { value: 1 }, burpSeed = { value: 0 }, burpDir = { value: 0 }, gold = { value: 0 };
let driftAt = 0, burpAt = -1, nextBurp = 0, burst = true;
const LIGHT_VIEW = new THREE.Vector3(-0.55, 0.6, 0.6).normalize(), lightObj = new THREE.Vector3(), unturn = new THREE.Quaternion();
function cratering(): void {
  const all = planet.craters, from = Math.max(0, all.length - CRATERS);
  for (let i = from; i < all.length; i++) { const c = all[i]; craterAt[i - from].set(c.x, c.y, c.z, c.r); craterAge[i - from] = planet.seconds - c.born; }
  craterCount.value = all.length - from;
  // (The camera looks straight down at the world, unturned, so its frame is the scene's.)
  ventObj.set(planet.plume.x, planet.plume.y, planet.plume.z).normalize();
  // (How near the vent is to giving way: the ground round it strains and its cracks glow.)
  building.value = LAMP || planet.pouring ? 0 : Math.min(1, planet.pressure / Math.max(1e-6, planet.capNow));
  fed.value += ((planet.erupting || planet.pouring || planet.molten > 0.01 ? 1 : 0.25) - fed.value) * 0.05;
  // (An eruption's splatter: thrown out quickly as it starts, settling slowly once it's done.)
  const throwing = !QUIET && (planet.erupting || planet.pouring) ? 1 : 0; // (quiet: only when it bursts)
  spray.value += (throwing - spray.value) * (throwing > spray.value ? 0.06 : 0.008);
  // (How far the crust on running lava has drifted: on while the vent feeds it, nearly still once it doesn't.)
  const since = Math.min(0.5, Math.max(0, planet.seconds - driftAt));
  drift.value += since * fed.value;
  // (Quiet print's gold, lava still arriving: up within a second or so as it pours, drawing back over about four once it stops.)
  gold.value = planet.erupting || planet.pouring ? Math.min(1, gold.value + since * 1.2) : Math.max(0, gold.value - since / 4);
  driftAt = planet.seconds;
  // Burps: now and then while it erupts, gas swells under the crust at the vent and tears out, throwing
  // clots and ash, felt as a knock. Each its own: mostly small, now and then a big one, thrown its own
  // way. (Drawn only; the simulation knows nothing of them.)
  const now = planet.seconds;
  // (Quiet: only at the brink, a warning that it's about to blow, so the violence is the player's doing.)
  const burping = QUIET ? !planet.pouring && !planet.erupting && planet.pressure > planet.capNow * 0.85 : planet.erupting || planet.pouring;
  if (burping) {
    if (now >= nextBurp && burpAt < 0) {
      burpAt = now; burst = false; nextBurp = now + (QUIET ? 5 + Math.random() * 5 : 6 + Math.random() * 8);
      burpSize.value = QUIET ? 0.5 + Math.random() ** 2 * 0.7 : 0.5 + Math.random() ** 2 * 1.3; burpSeed.value = Math.random(); burpDir.value = Math.random() * Math.PI * 2;
    }
  } else nextBurp = Math.max(nextBurp, now + 1.5);
  if (now < burpAt || now - burpAt > 12) burpAt = -1; // (done, or a world begun again)
  burp.value = burpAt < 0 ? -1 : now - burpAt;
  if (!burst && burp.value >= 1.4) { burst = true; spray.value = Math.max(spray.value, 0.45 + 0.3 * burpSize.value); feel(burpSize.value > 1.1 ? [30, 40, 50] : 16); }
  lightObj.copy(LIGHT_VIEW).applyQuaternion(unturn.copy(group.quaternion).invert());
}
const material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
material.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'attribute float aH;\nattribute float aPrevH;\nattribute vec3 aPrevPos;\nattribute vec3 aPrevColour;\nattribute vec4 aMarks;\nattribute vec4 aPrevMarks;\nattribute float aFlow;\nattribute float aPrevFlow;\nuniform float uBlend;\nvarying float vH;\nvarying vec4 vMarks;\nvarying float vFlow;\nvarying vec3 vDir;\nvarying vec3 vN;\nvarying vec3 vS;\nvoid main() {')
    .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = mix(aPrevColour, color.rgb, uBlend);\n  vH = mix(aPrevH, aH, uBlend);\n  vMarks = mix(aPrevMarks, aMarks, uBlend);\n  vFlow = mix(aPrevFlow, aFlow, uBlend);\n  vDir = normalize(position);\n  vN = normalize(normalMatrix * normal);\n  vS = normalize(normalMatrix * normalize(position));')
    .replace('#include <begin_vertex>', 'vec3 transformed = mix(aPrevPos, position, uBlend);');
  shader.uniforms.uBlend = blend;
  // The sea's colour is only its depth, so it's worked out here rather than sent: paler over the shallows.
  // (Drawn as a print, Io's sulphur is a lighter wash, with no dark rim, so it tints the ground rather than banding it.)
  shader.uniforms.uFlooded = { value: FLOODED ?? (SULPHUR ? (LOOK ? ASH.clone().lerp(PAPER, 0.5) : ASH) : PAPER) };
  shader.uniforms.uFloodRim = { value: SULPHUR && LOOK ? 0 : 1 };
  shader.uniforms.uFloodStrength = floodStrength;
  shader.uniforms.uTime = lavaClock;
  shader.uniforms.uPx = pxRatio;
  // (On the ice moon the lava is water: its shimmer is light on it, not heat, and it doesn't crust black.)
  shader.uniforms.uHot = { value: new THREE.Color(BLUE ? '#b9dbe8' : '#e9853a') };
  shader.uniforms.uCrust = { value: new THREE.Color(BLUE ? P.deepLava : '#2b2420') };
  shader.uniforms.uLava = { value: VERMILION };
  shader.uniforms.uDeepLava = { value: DEEP_RED };
  shader.uniforms.uShallow = { value: SHALLOW };
  shader.uniforms.uDeep = { value: DEEP };
  shader.uniforms.uLandPaper = { value: PAPER };
  shader.uniforms.uSeaFloor = { value: Math.min(-0.05, planet.k.floor) }; // (shoals are tinted by how far they've risen from it)
  shader.uniforms.uFloodDots = { value: WORLD.id === 'moon' ? 0.35 : 0 };
  shader.uniforms.uCrater = { value: craterAt };
  shader.uniforms.uCraterAge = { value: craterAge };
  shader.uniforms.uCraterCount = craterCount;
  shader.uniforms.uLightObj = { value: lightObj };
  shader.uniforms.uVent = { value: ventObj };
  shader.uniforms.uFeeding = fed;
  shader.uniforms.uBuild = building;
  shader.uniforms.uFlash = flash;
  shader.uniforms.uDark = { value: DARK_LAVA ? 1 : 0 };
  shader.uniforms.uFlows = { value: FLOWS ? 1 : 0 };
  shader.uniforms.uIceLine = iceLine;
  shader.uniforms.uSky = sky;
  shader.uniforms.uHaze = haze;
  // Each world's own basalt, as a tint on the dark lava (a multiplier: 1 is a plain black-brown).
  const CRUST: Record<string, [number, number, number]> = { rogue: [0.9, 0.95, 1.1], dust: [1.25, 0.95, 0.8], magma: [1.1, 0.96, 0.9], snowball: [0.9, 0.97, 1.08], mars: [1.35, 0.9, 0.75], io: [0.78, 0.84, 0.86], moon: [0.95, 0.98, 1.08], ocean: [0.88, 0.97, 1.08], deep: [0.85, 0.97, 1.12], spin: [0.9, 0.98, 1.12], asteroid: [1.05, 0.98, 0.92], young: [1.25, 0.92, 0.82], tumble: [1.0, 0.97, 0.95] };
  shader.uniforms.uCrustTint = { value: new THREE.Vector3(...(CRUST[WORLD.id] ?? [1, 1, 1])) };
  shader.uniforms.uSpray = spray;
  shader.uniforms.uDrift = drift;
  shader.uniforms.uBurp = burp;
  shader.uniforms.uGold = gold;
  shader.uniforms.uBurpSize = burpSize;
  shader.uniforms.uBurpSeed = burpSeed;
  shader.uniforms.uBurpDir = burpDir;
  // The woodblock's colours: vermilion, deeper at the edge, hot orange at the core (as working values, not hex: as first seen and liked);
  // on the ice moons, where the lava is water, its blues.
  // (Engraved, the lines are inks: red-brown, deeper at the edge; on the ice moons, where the lava is water, blues.)
  shader.uniforms.uBlock = { value: new THREE.Color(BLUE ? '#3f7fa6' : '#ce4622') };
  shader.uniforms.uBlockDeep = { value: new THREE.Color(BLUE ? '#2a5674' : '#802216') };
  // The print's inks, as printed (sRGB), made linear: on the ice moons, water's blues.
  const ink = (r: number, g: number, b: number) => ({ value: new THREE.Vector3(r ** 2.2, g ** 2.2, b ** 2.2) });
  // (Quiet: softer, a warm vermilion like the engraving's, a rust, an ochre; and paler blues.)
  shader.uniforms.uInkDeep = BLUE ? (QUIET ? ink(0.36, 0.52, 0.64) : ink(0.12, 0.27, 0.4)) : QUIET ? ink(0.8, 0.4, 0.28) : ink(0.5, 0.06, 0.05);
  shader.uniforms.uInkMid = BLUE ? (QUIET ? ink(0.55, 0.72, 0.83) : ink(0.25, 0.55, 0.74)) : QUIET ? ink(0.93, 0.52, 0.34) : ink(0.89, 0.2, 0.08);
  shader.uniforms.uInkHot = BLUE ? (QUIET ? ink(0.86, 0.94, 0.97) : ink(0.78, 0.92, 0.97)) : QUIET ? ink(0.98, 0.82, 0.52) : ink(1.0, 0.8, 0.15);
  shader.uniforms.uInkOver = BLUE ? (QUIET ? ink(0.7, 0.84, 0.92) : ink(0.45, 0.74, 0.88)) : QUIET ? ink(0.96, 0.66, 0.42) : ink(0.96, 0.42, 0.08);
  shader.uniforms.uInkPale = BLUE ? ink(0.95, 0.99, 1.0) : QUIET ? ink(0.98, 0.9, 0.7) : ink(1.0, 0.94, 0.62);
  // (A burp's clots cool to black, and its ash is dark; on the ice moons they freeze to frost, and its ash is frost.)
  shader.uniforms.uInkCold = BLUE ? ink(0.9, 0.95, 0.98) : QUIET ? ink(0.4, 0.37, 0.35) : ink(0.2, 0.19, 0.18);
  shader.uniforms.uInkAsh = BLUE ? ink(0.62, 0.74, 0.82) : QUIET ? ink(0.58, 0.55, 0.52) : ink(0.42, 0.4, 0.38);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `uniform vec3 uShallow;\nuniform vec3 uDeep;\nuniform vec3 uFlooded;\nuniform float uFloodStrength;\nuniform vec3 uLava;\nuniform vec3 uDeepLava;\nuniform vec3 uHot;\nuniform vec3 uCrust;\nuniform float uTime;\nuniform float uPx;\nuniform vec3 uLandPaper;\nuniform float uSeaFloor;\nvarying float vH;\nvarying vec4 vMarks;\nvarying float vFlow;\nvarying vec3 vDir;\nvarying vec3 vN;
      // (Without sin, which phones' GPUs work out roughly for large numbers, turning noise into patterns.)
      float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
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
// (Not the asteroid: its hollows are stippled, and its contours over the lumps were harsh lines.)
const CONTOURED = WORLD.id === 'mars';
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
  // (Drawn as a print, the stipple shows the relief, and contours are kept only where height is the aim:
  // the mountain on Mars, above the plain it stands on, and the asteroid's hollows; and not inside craters.)
  landPens[back].setLines(LOOK ? (CONTOURED ? land.filter((l) => !inCrater(l) && (WORLD.id !== 'mars' || l.iso > (WORLD.rules.floor ?? 0) + 0.08)) : []) : land, 'settle');
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
puffs.calm = QUIET;
puffs.ice = ICE;
group.add(puffs.object);
group.add(puffs.shadow);

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
/** Scorched ground: charcoal, a little warm. */
const CHAR = [0.27, 0.2, 0.16];
/** The light fresh lava throws on the ground round it: warm, and stronger on the dark worlds, where it's the light. */
const GLOW_C = rgb(new THREE.Color('#ffae6a')), GLOW_BY = ICE ? 0 : DARK_LAVA ? 0.5 : 0.32; // (not on the ice moons: their lava is water)
const glowField = new Float32Array(N), glowNext = new Float32Array(N);
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
/** How pale ash may lie: a tint, but on the lava world, where the rock snow is the aim, plain to see. */
const SNOW_SHOWN = WORLD.goal === 'snow' ? 0.6 : 0.22;
/**
 * Dark lava kept for good, drawn flow by flow: each pour's lava keeps the number of the pour that laid
 * it (the planet's flowOf), and is drawn by how many pours have come since, the newest darkest, one shade lighter for each
 * after it, so the flows read in the order they came, as a geological map's do (by each point's own age,
 * neighbours set a moment apart blotched, and one flow ran into the next with no edge between them).
 * Carried in a channel of its own (aFlow). Each flow stands a
 * little proud of what it covers, the newest the highest (FLOW_PROUD), for the lamp to shade.
 */
const FLOWS = DARK_LAVA && !!LOOK && !planet.k.whiteAt, FLOW_PROUD = FLOWS ? 0.025 : 0, FLOW_STEP = 0.25;
const flowShown = new Float32Array(N), coarseFlow = new Float32Array(N), flowNext = new Float32Array(N);
/** How long each point has lain under lava too thin to run (drawn set): such a sheet chills at once, though the simulation still counts it molten. */
const chilled = new Float32Array(N);
let chilledAt = -1;
const lavaShown = new Float32Array(N), drawnHeight = new Float32Array(N), heightEase = new Float32Array(N), coarseHeight = new Float32Array(N), coarseLand = new Float32Array(N * 3), coarseMarks = new Float32Array(N * 4), eased = new Float32Array(N * 4);
/** The simulation's heights and colours, a vertex at a time, ready to be carried onto the finer surface. */
function coarse(): void {
  // How far the wash eases this time: by the seconds since last, over a second or two.
  const now = performance.now() / 1000, ease = washedAt < 0 ? 1 : 1 - Math.exp(-(now - washedAt) / 1.5);
  const lavaEase = washedAt < 0 ? 1 : 1 - Math.exp(-(now - washedAt) / 0.45);
  washedAt = now;
  const simDt = chilledAt < 0 ? 0 : Math.max(0, planet.seconds - chilledAt);
  chilledAt = planet.seconds;
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
  // How much the heat of lava near it lights each point: from lava running or only just set, spread a few
  // rings out over the ground and weakening as it goes, so the light falls round the lava, not only on it.
  {
    const o = topo.nbrOffsets, l = topo.nbrList;
    for (let v = 0; v < N; v++) { const lv = planet.lava[v]; glowField[v] = lv > 0.002 ? Math.min(1, lv * 60) : planet.age[v] < 25 && planet.ash[v] < 0.25 ? Math.exp(-planet.age[v] / 8) * 0.7 : 0; }
    for (let pass = 0; pass < 5; pass++) {
      for (let v = 0; v < N; v++) { let m = glowField[v]; for (let k = o[v]; k < o[v + 1]; k++) m = Math.max(m, glowField[l[k]] * 0.74); glowNext[v] = m; }
      glowField.set(glowNext);
    }
    // (Then eased, as the marks are: spread by the strongest neighbour alone, its edge stepped round the
    // simulation's triangles, and the warm wash it lays on the ground had a saw-toothed edge.)
    for (let pass = 0; pass < 4; pass++) {
      for (let v = 0; v < N; v++) { let s = 0; for (let k = o[v]; k < o[v + 1]; k++) s += glowField[l[k]]; glowNext[v] = glowField[v] * 0.4 + (s / Math.max(1, o[v + 1] - o[v])) * 0.6; }
      glowField.set(glowNext);
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
    // (Not in the quiet print: there its cooling lava fades itself, and the grey of fresh rock outlined every flow.)
    const fresh = !FL && !QUIET && planet.age[v] < 200 ? Math.exp(-planet.age[v] / 30) * 0.3 : 0, ash = Math.min(SNOW_SHOWN, planet.ash[v] * 0.3);
    const hot = lava > 0.002 ? Math.min(1, lava * 40) : 0;
    // Where a world keeps the mark of it (the Moon's seas), ground lava has lain on stays dark: this
    // fire's fully, an earlier one's a little faded. And the lava itself, by how thick it lies.
    // (On the ocean world, drawn as a print: where lava has lain under the sea, the hotspot's track, a shoal's wash.)
    coarseMarks[v * 4] = FL ? (planet.k.whiteAt ? (planet.laid[v] < 1e5 && planet.laid[v] >= planet.k.whiteAt ? 1 : 0) : planet.age[v] < 1e5 ? 1 : 0) : SULPHUR && planet.ash[v] > 0.6 ? 1 : SEA && QUIET && planet.age[v] < 1e5 && planet.rock[v] < 0 ? 1 : 0;
    // Where lava lies, by how deep: whole where it's a little deep, thinning to nothing at its
    // margins. So its edge falls between the vertices, wherever its depth says, and slides
    // smoothly as it spreads, as a liquid's does, rather than stepping from vertex to vertex.
    // (Beyond whole, rising on gently, to 2.2: drawn as an engraving, its lines follow the level lines of
    // how deep it lies, well inside its edge. Gently, so the edge, at a half, is as smooth as ever.)
    const deep = lava > 0.00002 ? Math.sqrt(lava / LAVA_WHOLE) : 0;
    // (Eased over about half a second, so the edge glides as the flow spreads rather than stepping
    // from vertex to vertex each time the simulation hands lava on.)
    const lavaNow = Math.min(1, deep) + 0.3 * Math.min(4, Math.max(0, deep - 1));
    lavaShown[v] += (lavaNow - lavaShown[v]) * lavaEase;
    coarseMarks[v * 4 + 1] = lavaShown[v];
    // Lava just set: black, weathering back into the ground's colour over a minute or two. Carried as
    // where it lies (1 or 0) and that times how black it still is, so the shader can divide the one
    // by the other and have the blackness even right up to a clean edge.
    // (Not on the ice moon: water freezes white, into the new ice the flood mark already draws.)
    // (Lava too thin to be drawn running is drawn set: a thin margin chills first.)
    // (And where life has taken it, less: moss greens black lava as it takes hold.)
    // (Ol Doinyo Lengai's black lava stays black only until it whitens.)
    // (Kept for good, dark lava drawn: the flow stays as a field of basalt, the record of where the fire went.)
    const set = !ICE && lava <= LAVA_WHOLE / 4 && planet.age[v] < (planet.k.whiteAt || (DARK_LAVA ? 1e5 : 240)) && planet.ash[v] < 0.25 ? // (lava only: thick ash marks the ground new too, and kept, it drew a dark ring round each burst)
      1 - (LIFE ? Math.min(1, planet.life[v] * 3) : 0) : 0;
    coarseMarks[v * 4 + 3] = set;
    if (FLOWS) {
      flowShown[v] += (Math.max(0, 1 - (planet.flowsPoured - planet.flowOf[v]) * FLOW_STEP) - flowShown[v]) * ease;
      coarseFlow[v] = set > 0.05 ? flowShown[v] : -1;
    }
    chilled[v] = lava > LAVA_WHOLE / 4 ? 0 : lava > 0 ? chilled[v] + simDt : chilled[v];
    coarseMarks[v * 4 + 2] = set * Math.exp(-(planet.age[v] + chilled[v]) / (planet.k.whiteAt ? planet.k.whiteAt * 0.6 : 45));
    // (As it's drawn, by how grown it is; just come, faint.)
    const kind = LIFE ? ecology.drawn[v] : -1, wash = kind >= 0 ? WASH[kind] : null, washBy = wash ? WASH_STRENGTH * Math.min(1, planet.life[v] * (ROGUE ? 1.6 : 1)) * (ROGUE ? 1 : 0.45 + 0.55 * Math.min(1, planet.grown[v] * 2.5)) * (1 - hot) : 0;
    washWeight[v] += (washBy - washWeight[v]) * ease;
    for (let i = 0; i < 3; i++) {
      let x = PA[i] + (BA[i] - PA[i]) * fresh;
      // Where a world keeps the mark of it (the Moon's seas), ground lava has lain on stays dark.
      // An earlier fire's seas, faded, as a soft tint (this fire's are drawn crisp in the shader).
      if (FL && MARKED && MARKED[v] && planet.age[v] >= 1e5) x += (FL[i] - x) * 0.45;
      x += (AS[i] - x) * ash;
      if (wash) washTint[v3 + i] += (wash[i] - washTint[v3 + i]) * (washWeight[v] < 0.05 ? 1 : ease);
      x += (washTint[v3 + i] - x) * washWeight[v];
      // Where lava has just burned what lived, the ground is scorched a while before it's buried or greys.
      if (planet.scorch[v] > 0.01) x += (CHAR[i] - x) * Math.min(0.85, planet.scorch[v] * 0.9);
      if (glowField[v] > 0.01 && lava < 0.002) x += (GLOW_C[i] - x) * glowField[v] * GLOW_BY;
      coarseLand[v3 + i] = x;
    }
  }
  // Each mark's amount eased toward its neighbours', again and again, so the edge the shader draws
  // where it crosses a half is a smooth curve, not the simulation's triangles stepping in teeth.
  // Running lava, already carried by its depth (so its edge falls between the vertices), is eased
  // a few times fewer, so a narrow stream still shows.
  const o = topo.nbrOffsets, l = topo.nbrList, M = coarseMarks;
  // (Flows: each one's shade carried on its own, not as a share of where it lies, and spread a few
  // points out past its edge, so it can be eased less than the edge is: where a new flow lies on one
  // several pours older, the shades between them then pass in a hair, not a band like another flow.)
  if (FLOWS) {
    for (let pass = 0; pass < 4; pass++) {
      for (let v = 0; v < N; v++) {
        if (coarseFlow[v] >= 0) { flowNext[v] = coarseFlow[v]; continue; }
        let sum = 0, c = 0;
        for (let k = o[v]; k < o[v + 1]; k++) { const x = coarseFlow[l[k]]; if (x >= 0) { sum += x; c++; } }
        flowNext[v] = c ? sum / c : pass === 3 ? 0 : -1;
      }
      coarseFlow.set(flowNext);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let v = 0; v < N; v++) { let sum = 0; for (let k = o[v]; k < o[v + 1]; k++) sum += coarseFlow[l[k]]; flowNext[v] = coarseFlow[v] * 0.4 + (sum / Math.max(1, o[v + 1] - o[v])) * 0.6; }
      coarseFlow.set(flowNext);
    }
  }
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
  // Each flow a little proud of the ground it covers, the newer the higher, so the lamp shades the edge of
  // one lying over another, as a raised edge, and the order they came in shows. (Drawn only: the simulation keeps its own.)
  if (FLOW_PROUD) for (let v = 0; v < N; v++) {
    const h = (coarseHeight[v] += FLOW_PROUD * M[v * 4 + 3] * (0.4 + 0.6 * coarseFlow[v])), r = 1 + RELIEF * Math.max(0, h);
    topo.positions[v * 3] = base[v * 3] * r; topo.positions[v * 3 + 1] = base[v * 3 + 1] * r; topo.positions[v * 3 + 2] = base[v * 3 + 2] * r;
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
  const d = data as { height: Float32Array; land: Float32Array; position: Float32Array; normal: Float32Array; marks: Float32Array; flow: Float32Array };
  // What was being drawn becomes where the new one eases in from, over about as long as it took to come.
  prevHeight.set(fineHeight); prevColour.set(landColour); prevPositions.set(positions); prevMarks.set(fineMarks); prevFlow.set(fineFlow);
  fineMarks.set(d.marks); fineFlow.set(d.flow);
  fineHeight.set(d.height); landColour.set(d.land); positions.set(d.position); normals.set(d.normal);
  for (const name of ['position', 'normal', 'color', 'aH', 'aPrevPos', 'aPrevColour', 'aPrevH', 'aMarks', 'aPrevMarks', 'aFlow', 'aPrevFlow']) geometry.getAttribute(name).needsUpdate = true;
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
  const height = coarseHeight.slice(), land = coarseLand.slice(), marks = coarseMarks.slice(), flow = coarseFlow.slice();
  shaper.post({ shape: { height, land, marks, flow } }, [height.buffer, land.buffer, marks.buffer, flow.buffer]);
}

/** Redraw the surface here and now: at the start, on taking up a kept world, and for the kept chart. */
function drawNow(): void {
  coarse();
  fine.carryDrawn(coarseHeight, coarseLand, fineHeight, landColour);
  fine.ease(landColour, 3);
  fine.carryMarks(coarseMarks, fineMarks);
  fine.carry(coarseFlow, fineFlow); fine.ease(fineFlow, 1);
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
  prevHeight.set(fineHeight); prevColour.set(landColour); prevPositions.set(positions); prevMarks.set(fineMarks); prevFlow.set(fineFlow);
  blend.value = 1;
  for (const name of ['position', 'normal', 'color', 'aH', 'aPrevPos', 'aPrevColour', 'aPrevH', 'aMarks', 'aPrevMarks', 'aFlow', 'aPrevFlow']) geometry.getAttribute(name).needsUpdate = true;
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
  const heights = fineHeight.slice(), life = planet.life.slice(), wear = planet.wear.slice(), kind = ecology.drawn.slice();
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
const AIM_INK = LOOK === 6 ? (ICE ? '#2f6f96' : DARK_LAVA ? '#6a5646' : '#c0702e') : LOOK ? '#2b1d14' : P.landInkHigh, AIM_BIG = LOOK === 6 ? 1.7 : LOOK ? 1.3 : 1; // (quiet: amber, or on the ice moons blue, and bigger: the goal plain to see)
const aimInk = new Stipple(AIM_INK, 'dot', 2.5 * AIM_BIG), aimPencil = LOOK === 6
  // (Quiet: what's still to do in a paler amber (or blue), as big as done, so it stands clear of the grey grid.)
  ? new Stipple('#' + new THREE.Color(AIM_INK).lerp(new THREE.Color(P.paper), 0.35).getHexString(), 'dot', 2 * AIM_BIG)
  : new Stipple('#' + new THREE.Color(P.pencil).lerp(new THREE.Color(P.landInk), LOOK ? 0.8 : 0.6).getHexString(), 'dot', 1.6 * AIM_BIG);
/** On the ocean world, the stretch the heat is on and the next, still to do, a little stronger: where to build now. */
const aimNext = new Stipple(LOOK ? AIM_INK : P.landInk, 'dot', 2.3 * AIM_BIG);
// (Known by direction: keyed by where they stand, the ground's least change under them re-keyed them as new
// dots each time they were set, every two seconds, so they never finished fading in and stayed faint.)
aimInk.byDirection = aimPencil.byDirection = aimNext.byDirection = true;
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
/**
 * A star in the sky, for the worlds it boils or bakes: an engraved disc with short rays, upper right,
 * fixed there as the giant is, so "towards the star" is always the same way; the world's night side
 * in shadow. (A rogue planet has none: all of it is in the dark, and only the lava gives light.) And
 * on the world boiling away, its dust streaming off the day side, away from the star, as a comet's tail.
 */
const SUN = WORLD.sun ? new THREE.Vector3(...WORLD.sun).normalize() : null, SUN_AT = new THREE.Vector3(0.85, 2.05, -4.6);
const sky = { value: new THREE.Vector4(0, 0, 1, WORLD.id === 'rogue' || WORLD.id === 'ijen' ? 2 : SUN ? 1 : 0) }, iceLine = { value: planet.k.gas > 0 ? 0 : -1 }, haze = { value: planet.k.breathe > 0 ? 1 : 0 };
let sunDisc: THREE.Mesh | null = null;
/**
 * The star itself, worked out at every pixel as the world is, so it's as crisp as the world at any
 * size (a picture of one, drawn once small and stretched, looked like a sticker beside it): a disc
 * brighter at its middle and deepening to gold at its rim, as a star's is, its face faintly grained and
 * drifting, with a spot or two; a fine inked rim; and round it a warm glow and an engraver's rays,
 * long and short by turns, breathing a little. Near (a lava world's, a world boiling away's) it fills
 * much of the sky; far (Triton's), it's small and white.
 */
const STAR_TIME = { value: 0 };
if (SUN) {
  const far = WORLD.id === 'triton', hot = WORLD.id === 'magma';
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: STAR_TIME,
      uInk: { value: new THREE.Color(P.landInkHigh) },
      uMid: { value: new THREE.Color(far ? '#fbf7ea' : hot ? '#fde9bf' : '#fcefc8') },
      uRim: { value: new THREE.Color(far ? '#efe2c4' : hot ? '#e8913f' : '#eeb455') },
      uGlow: { value: new THREE.Color(hot ? '#f2a865' : '#f5cf8a') },
    },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vP;
      uniform float uTime; uniform vec3 uInk, uMid, uRim, uGlow;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        const float R = 0.44; // (the disc's radius, in the square's half-widths; the rest is glow and rays)
        float d = length(vP), r = d / R, px = max(fwidth(d), 1e-5);
        vec3 col = vec3(0.0); float a = 0.0;
        // The face: limb-darkened (seen through more of the star's air at its edge), grained, slowly turning.
        if (r < 1.0) {
          float mu = sqrt(max(0.0, 1.0 - r * r));
          vec3 sp = vec3(vP / R, mu); // (a point on the star's face, as on a ball)
          float turn = uTime * 0.01;
          vec3 q = vec3(sp.x * cos(turn) + sp.z * sin(turn), sp.y, -sp.x * sin(turn) + sp.z * cos(turn));
          float grain = n3(q * 34.0 + vec3(0.0, 0.0, uTime * 0.05)) * 0.6 + n3(q * 80.0 - uTime * 0.03) * 0.4;
          float sn = n3(q * 2.6 + 7.0) * 0.7 + n3(q * 9.0 + 3.0) * 0.3, spots = smoothstep(0.8, 0.84, sn), pen = smoothstep(0.73, 0.8, sn); // (a group or two, not a scatter)
          col = mix(uRim, uMid, pow(mu, 0.55));
          col *= 0.95 + 0.1 * grain;
          col = mix(col, col * 0.78, pen * 0.6);
          col = mix(col, uInk * 1.6, spots * 0.7 * mu);
          a = 1.0;
        }
        // The rim, finely inked; a hair of soft edge either side.
        float rimPx = abs(d - R) / px;
        float rim = 1.0 - smoothstep(0.6, 1.6, rimPx);
        col = mix(col, uInk, rim * 0.75); a = max(a * (1.0 - smoothstep(-0.5, 0.5, (d - R) / px)), rim * 0.75);
        // Outside: the glow, and the rays.
        if (r > 1.0) {
          float glow = exp(-(r - 1.0) * 2.4) * 0.45;
          // (Many, fine and faint, each its own length, as an engraver cuts a star's light: a few bold spokes
          // read as a child's sun.)
          float ang = atan(vP.y, vP.x), N = 90.0, k = ang / 6.2831853 * N;
          float idx = floor(k + 0.5), ray = abs(k - idx) * 6.2831853 / N * d / px; // (pixels from the nearest ray)
          float len = h3(vec3(idx, 3.1, 7.7));
          float reach = 1.18 + 0.55 * len * len + 0.04 * sin(uTime * 0.35 + idx * 1.7); // (breathing a little, each its own time)
          float along = smoothstep(1.06, 1.12, r) * (1.0 - smoothstep(1.06, reach, r));
          float rays = (1.0 - smoothstep(0.25, 0.9, ray)) * along * 0.42;
          col = mix(uGlow, uInk, rays / max(rays + glow, 1e-4));
          a = max(a, clamp(glow + rays, 0.0, 1.0));
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  disc.scale.setScalar(far ? 0.75 : hot ? 1.9 : 1.45);
  disc.position.copy(SUN_AT);
  disc.position.add(new THREE.Vector3(far ? 0.15 : 0.8, far ? -0.1 : -0.12, 0)); // (out in the corner of the sky, clear of the world's name)
  disc.renderOrder = -1;
  scene.add(disc);
  sunDisc = disc;
}
const TAIL = WORLD.goal === 'outbuild' ? 220 : 0, tailAt = new Float32Array(TAIL * 3), tailAge = new Float32Array(TAIL).fill(99), tailWay = new Float32Array(TAIL * 3);
const tailGeo = new THREE.BufferGeometry();
tailGeo.setAttribute('position', new THREE.BufferAttribute(tailAt, 3));
const tail = new THREE.Points(tailGeo, new THREE.PointsMaterial({ color: new THREE.Color(P.ash).lerp(new THREE.Color(P.landInk), 0.35), size: 0.035, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true }));
if (TAIL) scene.add(tail);
let tailNext = 0;
const SKY_UP = new THREE.Vector3(0, 1, 0);
const TAIL_WAY = new THREE.Vector3();
/** The sky each moment: the shadow's way, as seen; Snowball Earth's ice line; the dust tail. */
/**
 * Hunga Tonga's pressure waves: each a ring of dots on the world, spreading from the vent round to
 * the far side and back, as the real one went round the Earth four times; drawn for its first two
 * laps, fainter as it goes.
 */
const WAVE_LAP = 14, WAVE_LAPS = 2;
// (Plain dots, moved every moment: the map's stipple fades each new dot in, and a moving ring would never show.)
const WAVE_MOST = 4000, waveAt = new Float32Array(WAVE_MOST * 3), waveGeo = new THREE.BufferGeometry();
waveGeo.setAttribute('position', new THREE.BufferAttribute(waveAt, 3));
const waveDots = new THREE.Points(waveGeo, new THREE.PointsMaterial({ color: new THREE.Color(P.seaInk), size: 0.018, transparent: true, opacity: 0.85, depthWrite: false }));
if (WORLD.goal === 'waves') group.add(waveDots);
let echoesFelt = 0;
function skyNow(dt: number): void {
  if (WORLD.goal === 'waves') {
    const pts: number[] = [];
    for (const w of planet.waves) {
      const t = (planet.seconds - w.at) / WAVE_LAP;
      if (t <= 0 || t >= WAVE_LAPS * 2) continue;
      // (Out to the far side and back again: the angle from the vent goes 0 to π and back.)
      const f = t % 2, a = Math.PI * (f < 1 ? f : 2 - f);
      if (a < 0.03 || a > Math.PI - 0.03) continue;
      for (const q of circleAt(w, a)) pts.push(q.x * 1.03, q.y * 1.03, q.z * 1.03);
    }
    const k = Math.min(WAVE_MOST, pts.length / 3);
    waveAt.set(pts.slice(0, k * 3));
    waveGeo.setDrawRange(0, k);
    waveGeo.attributes.position.needsUpdate = true;
  }
  // (Mercury: the shock felt arriving at the far side, softly, a moment after the burst.)
  if (planet.echoed > echoesFelt) { echoesFelt = planet.echoed; feel([12, 60, 12]); }
  if (planet.k.gas > 0) iceLine.value = planet.iceLine;
  // (The haze clears with the oxygen, and goes on clearing once the sky has turned.)
  if (planet.k.breathe > 0) haze.value += (Math.max(0, 1 - planet.oxygen / OXYGEN) - haze.value) * Math.min(1, dt * 0.5);
  // On Triton the sun moves across the sky, slowly, and its picture with it.
  if (SUN && WORLD.sunTurns && !planet.over) {
    SUN.applyAxisAngle(SKY_UP, WORLD.sunTurns * dt);
    if (sunDisc) sunDisc.position.set(SUN.x * 1.15, SUN_AT.y, SUN_AT.z);
  }
  if (sunDisc) { sunDisc.quaternion.copy(camera.quaternion); STAR_TIME.value += dt; }
  if (SUN) {
    camera.updateMatrixWorld();
    const v = GIANT_DIR.copy(SUN).transformDirection(camera.matrixWorldInverse);
    sky.value.set(v.x, v.y, v.z, 1);
  }
  if (!TAIL || !SUN) return;
  // (Let go from the day side's rim, as the star sees it, and blown away from it, spreading.)
  tailNext = Math.max(-1, tailNext - dt);
  for (let i = 0; i < TAIL; i++) {
    if (tailAge[i] > 7 && tailNext <= 0 && !planet.over) {
      tailNext += 0.035;
      // (Away from the star across the sky as seen, so the tail streams past the world's edge rather than hiding behind it.)
      const away = TAIL_WAY.set(-SUN.x, -SUN.y, 0).normalize();
      const r = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      r.addScaledVector(away, -r.dot(away)).normalize();
      r.z = Math.abs(r.z); // (from the side we see)
      const at = r.clone().multiplyScalar(0.9 + Math.random() * 0.12).addScaledVector(away, 0.5);
      tailAt[i * 3] = at.x; tailAt[i * 3 + 1] = at.y; tailAt[i * 3 + 2] = at.z;
      const out = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.04).addScaledVector(r, 0.03).addScaledVector(away, 0.18);
      tailWay[i * 3] = out.x; tailWay[i * 3 + 1] = out.y; tailWay[i * 3 + 2] = out.z;
      tailAge[i] = 0;
    }
    tailAge[i] += dt;
    if (tailAge[i] > 7) { tailAt[i * 3 + 2] = 999; continue; }
    for (let k = 0; k < 3; k++) tailAt[i * 3 + k] += tailWay[i * 3 + k] * dt;
  }
  tailGeo.attributes.position.needsUpdate = true;
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
      varying vec3 vDirV;
      void main() { vDirV = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec4 uBlob[${BLOBS}];
      uniform float uHeat[${BLOBS}];
      uniform int uCount;
      uniform vec3 uHot, uCool, uHeart;
      uniform float uTime, uPx;
      varying vec3 vDirV;
      vec3 vDir; // (made whole again in each pixel: carried between the shell's points, it shortens, and every blob's edge was faceted)
      ${LOOK ? LAMP_PRINT_FUNCTIONS : ''}
      void main() {
        vDir = normalize(vDirV);
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
        ${LOOK === 6 ? '' : 'if (a <= 0.0) discard;'}
        ${LOOK === 6 ? LAMP_QUIET : LOOK ? LAMP_PRINT : `vec3 col = mix(uCool, uHot, smoothstep(0.2, 0.9, heat));
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
  // (The pool grows with how far along it is, to fill the shore when it's full: drawn as it came, it was full a third of the way.)
  if (s && planet.pooled > 0) put(s.x, s.y, s.z, Math.max(Math.min(planet.pooled, 2), Math.min(1, planet.pooled / POOL) * (s.r * 0.95 / blobRadius(1)) ** 2), 0.75);
  if (!planet.over) put(q.x, q.y, q.z, planet.pressure, 1);
  for (const b of planet.blobs) put(b.x, b.y, b.z, b.area * Math.min(1, Math.max(0, b.heat) / 0.12), Math.max(0, b.heat)); // (a cold one shrinks away as it goes, rather than vanishing)
  blobCount.value = n;
}
const TUMBLE = new THREE.Quaternion(), TUMBLE_AXIS = new THREE.Vector3();
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
const CALM = WORLD.calm ?? 0, ISLAND = WORLD.island ?? 0, POOL = WORLD.pool ?? 0, ROUND = Math.round((WORLD.round ?? 0) * 100), COVER = Math.round((WORLD.cover ?? 0) * 100), PLUMES = WORLD.plumes ?? 0, ORBIT = WORLD.orbit ?? 0;
const HEARTH = WORLD.hearth ?? 0, OUTBUILD = WORLD.outbuild ?? 0, SNOWFALL = WORLD.snowfall ?? 0, GATHER = WORLD.gather ?? 0, OXYGEN = WORLD.oxygen ?? 0, FIELDS = WORLD.fields ?? 0, FAR_KM = WORLD.farKm ?? 0, WHITENESS = Math.round((WORLD.whiteness ?? 0) * 100), GLOW = WORLD.glow ?? 0, RINGS = WORLD.rings ?? 0;
let aimDone = 0, aimOf = WORLD.goal === 'white' ? 100 : WORLD.goal === 'waves' ? RINGS : WORLD.goal === 'glow' ? 100 : WORLD.goal === 'antipode' ? FAR_KM : WORLD.goal === 'gather' ? GATHER : WORLD.goal === 'chaos' || WORLD.goal === 'streaks' ? FIELDS : WORLD.goal === 'oxygen' || WORLD.goal === 'thaw' || WORLD.goal === 'outbuild' || WORLD.goal === 'snow' ? 100 : WORLD.goal === 'ring' ? CHAIN.stretches : WORLD.goal === 'height' ? HEIGHT.target : WORLD.goal === 'cover' ? COVER : WORLD.goal === 'round' ? ROUND : WORLD.goal === 'ridge' ? Planet.RIDGE_STRETCHES : WORLD.goal === 'lamp' || WORLD.goal === 'bank' ? 100 : WORLD.goal === 'calm' ? CALM : WORLD.goal === 'plumes' ? PLUMES : WORLD.goal === 'orbit' || WORLD.goal === 'feed' ? 100 : planet.basins.length, lastAim = -10;
/** How much of the aim is done now, reckoned afresh. */
function reckonAim(): void {
  if (chain) { aimDone = chain.update(planet, topo); aimOf = CHAIN.stretches; }
  else if (WORLD.goal === 'height') { aimDone = Math.max(0, planet.summit * HEIGHT.kmPerUnit); aimOf = HEIGHT.target; }
  else if (WORLD.goal === 'cover') { aimDone = planet.covered * 100; aimOf = COVER; }
  else if (WORLD.goal === 'plumes') { aimDone = planet.plumes.length; aimOf = PLUMES; }
  else if (WORLD.goal === 'round') { aimDone = planet.roundness * 100; aimOf = ROUND; }
  else if (WORLD.goal === 'ridge') { aimDone = planet.ridgeRaise().filter((r) => r >= planet.k.ridge).length; aimOf = Planet.RIDGE_STRETCHES; }
  else if (WORLD.goal === 'lamp') { aimDone = (100 * planet.pooled) / POOL; aimOf = 100; }
  else if (WORLD.goal === 'calm') {
    aimDone = Math.max(0, Math.round((1 - planet.tumbling) * 100)); aimOf = CALM;
    // (Calm has to hold a while: a lucky burst isn't enough.)
    calmHeld = aimDone >= aimOf ? calmHeld + (planet.seconds - calmAt) : 0;
    calmAt = planet.seconds;
  }
  else if (WORLD.goal === 'bank') { aimDone = (100 * planet.bankLand) / ISLAND; aimOf = 100; }
  else if (WORLD.goal === 'orbit' || WORLD.goal === 'feed') { aimDone = (100 * planet.orbit) / ORBIT; aimOf = 100; }
  else if (WORLD.goal === 'hearth') { aimDone = (100 * planet.livingLand) / HEARTH; aimOf = 100; }
  else if (WORLD.goal === 'thaw') { aimDone = planet.thawed ? 100 : Math.min(99, (100 * planet.greenhouse) / planet.k.thawAt); aimOf = 100; }
  else if (WORLD.goal === 'outbuild') { aimDone = Math.max(0, (100 * planet.grownBy) / OUTBUILD); aimOf = 100; }
  else if (WORLD.goal === 'snow') { aimDone = (100 * planet.snow) / SNOWFALL; aimOf = 100; }
  else if (WORLD.goal === 'gather') { aimDone = planet.tally.caught; aimOf = GATHER; }
  // (Lengai: the peak first, to its height, as the first half; then its summit whitening, the second.)
  else if (WORLD.goal === 'white') { const km = Math.max(0, planet.summit * HEIGHT.kmPerUnit); aimDone = km < HEIGHT.target ? (50 * km) / HEIGHT.target : 50 + 50 * Math.min(1, (planet.whiteSummit * 100) / WHITENESS); aimOf = 100; }
  // (Ijen: the night kept lit, as much at once as it asks, for LIT_FOR seconds in all.)
  else if (WORLD.goal === 'glow') { if (planet.burning >= GLOW) litFor += planet.seconds - litAt; litAt = planet.seconds; aimDone = (100 * litFor) / LIT_FOR; aimOf = 100; }
  else if (WORLD.goal === 'waves') { aimDone = planet.waves.length; aimOf = RINGS; }
  else if (WORLD.goal === 'antipode') { aimDone = planet.farRaised * HEIGHT.kmPerUnit; aimOf = FAR_KM; }
  else if (WORLD.goal === 'oxygen') { aimDone = (100 * planet.oxygen) / OXYGEN; aimOf = 100; }
  else if (WORLD.goal === 'chaos' || WORLD.goal === 'streaks') { aimDone = planet.plumes.length; aimOf = FIELDS; }
  else { aimDone = planet.basins.filter((b) => planet.flooded(b) >= FLOODED_ENOUGH).length; aimOf = planet.basins.length; }
}
let calmHeld = 0, calmAt = 0, litFor = 0, litAt = 0;
/** How long Kawah Ijen's night must be kept lit, in all, in seconds. */
const LIT_FOR = 120;
/** How long the tumbling moon must be kept calm, in seconds. */
const CALM_HOLD = 30;
const won = () => aimOf > 0 && aimDone >= aimOf && (WORLD.goal !== 'calm' || calmHeld >= CALM_HOLD);

/** The aim, in a line for the foot: said once the world has begun, and again if a long while passes with nothing gained. */
/**
 * What to do on this world, said plainly on its card, in three words only: pour (tilt the world), hold
 * (a finger on it), and burst (what it does when it's held too long). (The card's own lines used a
 * different verb on every world: tip, pour, erupt, burst, turn uppermost.)
 */
/**
 * What each world asks, in a line (AIM), and the one thing to know to do it (TIP); the hands, the same
 * on every world but the glass one, are listed under them (HANDS) on the first worlds played, and after
 * that said only if the player seems stuck.
 */
const AIM: Record<string, string> = {
  ring: 'Leave a chain of living islands across the sea.',
  basins: 'Fill every dotted basin.',
  height: `Build a volcano ${HEIGHT.target} km tall.`,
  cover: `Make ${COVER}% of the old grey ice new.`,
  plumes: `Raise ${PLUMES} great plumes.`,
  feed: "Fill the giant planet's ring.",
  round: `Make the asteroid ${ROUND}% rounder.`,
  ridge: 'Build a ridge all the way round the equator.',
  lamp: 'Fill the far shore with glowing glass.',
  calm: `Calm the tumbling for ${CALM_HOLD} seconds.`,
  bank: 'Raise an island on the dotted bank.',
  orbit: 'Throw up enough rock to make a moon.',
  hearth: 'Keep enough life alive at once.',
  thaw: 'Thaw the frozen world.',
  outbuild: 'Build more than the star boils away.',
  white: 'Turn the summit white.',
  glow: 'Keep the crater glowing blue for two minutes.',
  waves: 'Send waves round the world.',
  antipode: 'Break open the far side of the planet.',
  gather: 'Catch the falling stones.',
  oxygen: 'Clear the sky with oxygen.',
  chaos: 'Break the ice into chaos fields.',
  streaks: 'Lay dark streaks across the ice.',
  snow: 'Fill the dotted line with rock snow.',
};
const TIP: Record<string, string> = {
  ring: 'The vent drifts slowly. Pour as it goes.',
  basins: 'Turn a basin to the top and pour into it.',
  height: BREATHE ? 'Lava falls on its own. Turn the planet to keep it landing in one spot.' : 'Keep pouring in one spot.',
  cover: 'Pour over the grey, turning the planet to reach more of it.',
  plumes: "Erupt when the smoke is grey and the tide is high, each time outside the last one's rings.",
  feed: 'Erupt when the smoke is grey, with the volcano leaning towards the giant.',
  round: 'Turn a pencilled hollow to the top and pour into it.',
  ridge: 'The spin carries lava to the dotted equator. Fill its bare stretches.',
  lamp: 'Warm blobs float to whatever is on top. Turn the dotted shore up.',
  calm: 'Erupt when the smoke is grey, as the dotted ring passes over the volcano.',
  bank: 'Keep the lava running towards the bank.',
  orbit: 'Erupt when the smoke is grey. A taller cone throws further.',
  hearth: 'Life gathers on warm new rock and fades as it cools. Pour beside the green, never on it.',
  thaw: 'Build up through the ice, then erupt when the smoke is grey. The gas warms the sky.',
  outbuild: 'The sunlit side boils away. Pour on the night side.',
  white: 'Build the peak, then rest. This black lava turns white as it cools.',
  glow: 'At night the sulphur burns blue as it flows. Pour thin streams, a new way each time.',
  waves: 'Build the cone to just under the sea, then erupt when the smoke is grey.',
  antipode: 'Erupt when the smoke is grey. The shock travels through; turn the planet over to watch.',
  gather: 'A circle shows where one will land. Turn it to the top before it does.',
  oxygen: 'Life in shallow water makes it, but lava buries it. Pour a shelf, then move on.',
  chaos: 'Erupt before the smoke turns grey, each time away from the last.',
  streaks: 'Erupt when the smoke is grey and sunlight is on the volcano. Move on for the next.',
  snow: 'Pour on the sunlit side, under the star. The lava boils away and falls just inside the night.',
};
/** How the hands do it, for the way it's being played: tipping a phone, breathing, or a computer's mouse. */
const HANDS: string[] = LAMP
  ? COMPUTER ? ['Drag · turn the planet', 'Click · let a blob go'] : ['Drag · turn the planet', 'Keep level · a blob grows', 'Tilt · let it go']
  : BREATHE ? ['Drag · turn the planet', COMPUTER ? 'Hold (mouse or space) · build pressure' : 'Hold · build pressure', 'Release · erupt']
    : ['Drag · turn the planet', 'Keep level · build pressure', 'Tilt · pour, or erupt once the smoke is grey'];
/** Whether the hands are still new: the first two worlds played here, and the glass world, where they work the other way round. */
const NEWCOMER = LAMP || Number(remembered('volcano.played') ?? '0') < 2;

/** The aim and how far it's come, in a few words for the top of the screen, always there while it's played. */
function goalLine(): string {
  const d = Math.round(aimDone), of = aimOf, pct = Math.min(100, d);
  switch (WORLD.goal) {
    case 'ring': return `Islands · ${d} of ${of} stretches`;
    case 'basins': return `Basins flooded · ${d} of ${of}`;
    case 'height': return `The mountain · ${Math.min(d, of)} of ${of} km`;
    case 'cover': return `New ice · ${Math.min(d, of)} of ${of}%`;
    case 'plumes': return `Great plumes · ${d} of ${of}`;
    case 'feed': return `The giant's ring · ${pct}%`;
    case 'round': return `Rounder · ${Math.min(d, of)} of ${of}%`;
    case 'ridge': return `The ridge · ${d} of ${of} stretches`;
    case 'lamp': return `The far shore · ${pct}% full`;
    case 'calm': return d >= of ? `Calm · held ${Math.min(CALM_HOLD, Math.floor(calmHeld))} of ${CALM_HOLD} seconds` : `Calm · ${d} of ${of}%`;
    case 'bank': return `The island at the bank · ${pct}%`;
    case 'orbit': return `A moon · ${pct}%`;
    case 'hearth': return `Living ground · ${pct}%`;
    case 'thaw': return planet.thawed ? 'The ice gives way' : `A warmer sky · ${pct}%`;
    case 'outbuild': return `Grown back · ${pct}%`;
    case 'snow': return `Rock snow · ${pct}%`;
    case 'gather': return `Stones gathered · ${d} of ${of}`;
    case 'antipode': return `The far side · ${Math.min(d, of)} of ${of} km`;
    case 'white': return aimDone < 50 ? `The peak · ${Math.round(Math.max(0, planet.summit * HEIGHT.kmPerUnit))} of ${HEIGHT.target} km` : `The summit turning white · ${Math.round((aimDone - 50) * 2)}%`;
    case 'glow': return `The night kept lit · ${Math.round(litFor)} of ${LIT_FOR} seconds${planet.burning >= GLOW ? '' : ', dimming'}`;
    case 'waves': return `Waves round the world · ${d} of ${of}`;
    case 'oxygen': return `Oxygen · ${pct}%`;
    case 'chaos': return `Chaos fields · ${d} of ${of}`;
    case 'streaks': return `Geyser streaks · ${d} of ${of}`;
    default: return '';
  }
}
/** Say the aim now and then, and what's been gained each time something is. */
function tellAim(): void {
  if (planet.over || ending) return;
  $('goal').textContent = FREE ? '' : goalLine();
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
  if (begun) tellAim();
  const inked: number[] = [], pencilled: number[] = [], next: number[] = [];
  if (WORLD.goal === 'orbit') {
    // The moon to be: its ring of dots round the world, inked as the rock reaches it (see `orbiting`).
    const step = Math.floor(aimDone / 10) * 10;
    void step;
    return;
  }
  if (WORLD.goal === 'calm') {
    // The tumble's equator, a ring of dots round the world square to its spin: as the spin's axis
    // wanders, so does the ring; inked round as far as the tumbling is calmed.
    const step = Math.floor(aimDone / 25) * 25;
    void step;
    const w = planet.spinNow;
    if (Math.hypot(w.x, w.y, w.z) > 1e-5) {
      const pts = circleAt(w, Math.PI / 2), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
      onGround(pts.slice(0, filled), ink);
      onGround(pts.slice(filled), pencil);
      aimInk.set(ink);
      aimPencil.set(pencil);
    }
    return;
  }
  if (WORLD.goal === 'antipode' && planet.far) {
    // The far side, in dots, inked round as its mountain rises.
    const pts = circleAt(planet.far, planet.far.r), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
    onGround(pts.slice(0, filled), ink);
    onGround(pts.slice(filled), pencil);
    aimInk.set(ink);
    aimPencil.set(pencil);
    return;
  }
  if (WORLD.goal === 'bank' && planet.bank) {
    // The bank, in dots, inked round as its island rises; told at the foot by the quarter.
    const step = Math.floor(aimDone / 25) * 25;
    void step; // (the goal line at the top shows how far it's come)
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
    void step; // (the goal line at the top shows how far it's come)
    const pts = circleAt(planet.shore, planet.shore.r), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
    onGround(pts.slice(0, filled), ink);
    onGround(pts.slice(filled), pencil);
    aimInk.set(ink);
    aimPencil.set(pencil);
    return;
  }
  if (WORLD.goal === 'snow' && planet.star) {
    // Where the rock snow falls: a line of dots just inside the night, inked round as it fills.
    const pts = circleAt(planet.star, Math.acos(-0.18)), filled = Math.round(pts.length * Math.min(1, aimDone / aimOf)), ink: number[] = [], pencil: number[] = [];
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
    void step; // (the goal line at the top shows how far it's come)

    return;
  }
  if (WORLD.goal === 'height' || WORLD.goal === 'cover' || WORLD.goal === 'round') {
    // How far along is told at the foot, every two km (or every 5%, or 10%).
    const by = WORLD.goal === 'height' ? 2 : WORLD.goal === 'round' ? 10 : 5, step = Math.floor(aimDone / by) * by;
    void step; // (the goal line at the top shows how far it's come)
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
    const per = 12, pts = chain.points(per), here = Math.floor((chain.where(planet.plume).round / CHAIN.arc) * CHAIN.stretches);
    chain.held.forEach((h, i) => onGround(pts.slice(i * per, (i + 1) * per), h ? inked : (i - here + CHAIN.stretches) % CHAIN.stretches <= 1 ? next : pencilled));
  } else if (WORLD.goal === 'ridge') {
    // The equator, in dots, round the spin's axis: a stretch inked once it's raised into ridge.
    const raise = planet.ridgeRaise(), per = 8, n = Planet.RIDGE_STRETCHES;
    for (let k = 0; k < n; k++) {
      const pts = [];
      for (let i = 0; i < per; i++) { const a = ((k + i / per) / n) * Math.PI * 2; pts.push({ x: Math.cos(a), y: 0, z: Math.sin(a) }); }
      onGround(pts, raise[k] >= planet.k.ridge ? inked : pencilled);
    }
  } else if (WORLD.goal === 'plumes' || WORLD.goal === 'chaos' || WORLD.goal === 'streaks') {
    // Round each great plume counted (or chaos field, or streak), the ground it has taken: another must rise outside it. The
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
    // (A tap no longer calls the heat to where it touched: two ways to play, tilt to pour and a
    // finger to hold, were clearer than five. The heat still creeps to whatever is on top.)
    // (Except on the glass world played on a computer, which can't be tipped: there a click lets the blob go.)
    tap() { if (LAMP && COMPUTER) { holdShut(); letGo(); } },
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
  { ready: () => true, say: LAMP ? (COMPUTER ? 'A glowing blob grows at the vent' : 'Keep the phone level, and a glowing blob grows') : BREATHE ? 'The heat gathers under the smoke, and breathes out by itself' : 'Keep the phone level, and the heat gathers under the smoke', done: () => planet.pressure > planet.k.least * 2 },
  { ready: () => !planet.pouring, say: LAMP ? (COMPUTER ? 'Click the world, and the blob lets go' : 'Tilt the phone, and the blob lets go') : BREATHE ? 'Drag the world to choose which way it runs' : 'Tilt the phone to pour', done: (s) => planet.tally.flows + planet.tally.bursts > 0 || s > 40 },
  // The touch, once the tilt is known: a finger held on the world holds the heat in; lifted, it lets it out.
  { ready: () => !planet.pouring && planet.pressure > planet.k.least, say: LAMP ? (COMPUTER ? 'Hold the mouse button on the world to keep the blob, and let go to release it' : 'Or hold a finger on the world to keep the blob, and lift it to let go') : COMPUTER ? 'Hold the mouse button on the world (or space) to keep the heat in, and let go to let it out' : 'Or hold a finger on the world to keep the heat in, and lift it to let it out', done: (s: number) => s > 12 },
  ...(WORLD.rules.rises ? [{ ready: () => true, say: 'The vent creeps to whatever faces up: drag the world to move it', done: (s: number) => s > 20 }] : []),
  ...(WORLD.goal === 'ridge' ? [{ ready: () => planet.tally.flows + planet.tally.bursts > 0, say: 'The spin carries the lava to the equator', done: (s: number) => s > 25 }] : []),
  { ready: () => !LAMP && (planet.k.great > 0 ? planet.throwOf(planet.pressure) >= planet.k.great : planet.pressure >= planet.k.explosive) && !planet.pouring, say: WORLD.goal === 'feed' ? 'The smoke has turned grey: lean the vent towards the giant, and let it out to burst' : 'The smoke has turned grey: let it out now, and it bursts', done: (s) => planet.tally.bursts > 0 || s > 40 },
  ...(WORLD.goal === 'plumes' ? [
    { ready: () => planet.tideNow > 0.6, say: 'High tide: the heat comes fast. Hold until the smoke turns grey', done: (s: number) => s > 20 },
    { ready: () => planet.tideNow < -0.6, say: 'Low tide: the heat comes slowly. Move it somewhere new', done: (s: number) => s > 20 },
  ] : []),
  ...(WORLD.goal === 'orbit' ? [
    { ready: () => planet.tally.bursts > 0, say: 'The taller the cone, the more it holds, and the further a burst throws', done: (s: number) => s > 25 },
  ] : []),
  ...(WORLD.goal === 'feed' ? [
    { ready: () => planet.tally.bursts > 0, say: 'The ring thins away unless it is fed', done: (s: number) => s > 20 },
  ] : []),
  ...(WORLD.goal === 'snow' ? [
    // (Said when it matters: pouring in the dark makes no snow; pouring in the day, the first snow falls.)
    { ready: () => (planet.pouring && planet.dayAt(planet.plumeVertex) < 0.12) || planet.snow > 0.02, get say() { return planet.snow > 0.02 ? 'The lava boils into the sky and falls as rock snow on the dotted line' : 'The volcano is in the night here: turn the world to bring it under the star'; }, done: (s: number) => s > 14 },
    { ready: () => planet.pouring && planet.dayAt(planet.plumeVertex) < 0.12, say: 'In the night nothing boils: turn the volcano back towards the star', done: (s: number) => s > 14 },
  ] : []),
  ...(WORLD.rules.impactEvery?.[1] === 0 ? [] : [
    { ready: () => true, begin: () => { planet.stonesFall = true; }, done: () => planet.impact !== null || planet.tally.stones > 0 },
    { ready: () => planet.impact !== null, say: 'A stone is coming: turn it to the top before it lands, and its heat is yours', done: (s: number) => s > 20 },
  ]),
];
let vapourIn = 0;
// (Once the hands are known, their lessons give way to one reminder, and only if nothing has come out for a while.)
let stuckSaid = false;
if (!NEWCOMER) CUES.splice(0, 3, { ready: () => true, done: (s: number) => {
  const tried = planet.tally.flows + planet.tally.bursts > 0;
  if (!tried && !stuckSaid && s > 20) { stuckSaid = true; announce(HANDS.join('   ')); }
  return tried || (stuckSaid && s > 34);
} });
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

// ---------------------------------------------------------------- words, and the key
/** What's worth saying: the turns in the world's story, not every happening in it. */
const QUIET_WORDS = /^(The plume reaches the ring|A great plume, but too near|Wanted where|A stone is coming|Land breaks|Life begins in|The first|Moss grows|[A-Z][a-z]+( [a-z]+)? took hold|Held too long|Stone caught|The fire is out|The heat is nearly|A dust storm|The storm passes)/;
const ERAS: Record<Era, string> = { young: 'A young fire', burning: 'Burning strong', cooling: 'Cooling', embers: 'Last embers', out: 'The fire is out' };
// (In free play the heat never runs low, so the title says what kind of play it is.)
if (FREE) ERAS.young = 'Free play';
$('stage-name').textContent = WORLD.title;
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
  if (era !== shownEra && !ending) { shownEra = era; eraFrom.push({ name: ERAS[era], from: planet.seconds }); }
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
let steamIn = 0, sparkIn = 0, smokeIn = 0, momentAt = -100, wasBrink = false;
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
    // A burst is a moment: the view eases back and holds, and the words fall quiet, so it has the screen.
    momentAt = seconds;
    feel(torn ? [40, 60, 90] : 25);
    landing = { at: seconds, n: torn ? 9 : 6 }; // (and then what it threw, coming down)
    spray.value = 1; // (a burst throws its splatter, whatever the ink)
    flash.value = torn ? 1.3 : 1; // (and the mouth flares white-gold for a moment: the burst plain to see)
    // The column of ash: many puffs from the vent, rising and spreading.
    // And a fountain of embers, thrown up and falling back glowing.
    for (let i = 0; i < (torn ? 110 : 70); i++) puffs.add('ember', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], (torn ? 1.5 : 1.15) * (0.7 + 0.6 * Math.random()));
    for (let i = 0; i < (torn ? 26 : 14); i++) puffs.add('ash', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], torn ? 1.5 : 1, Math.random, up, 1); // (fewer: each is a billow now)
  }
  Object.assign(tallied, planet.tally);
  // Steam where lava runs into the sea, as much as there is lava there.
  // Over open lava: a few sparks lifted on the heat, and a faint warm haze rising: heat you can see, kept sparse.
  flash.value *= Math.exp(-dt * 1.8);
  sparkIn -= dt;
  if (sparkIn <= 0 && (planet.pouring || planet.erupting) && !LAMP) {
    sparkIn = 0.22;
    for (let tries = 0; tries < 30; tries++) {
      const v = Math.floor(Math.random() * N);
      if (planet.lava[v] < 0.006) continue;
      puffs.add(Math.random() < 0.7 ? 'spark' : 'haze', p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
      break;
    }
    if (Math.random() < 0.6) puffs.add(Math.random() < 0.5 ? 'spark' : 'haze', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2]);
  }
  steamIn -= dt;
  if (steamIn <= 0) {
    steamIn = 0.6;
    for (let v = 0; v < N; v++) {
      const l = planet.lava[v];
      if (l > 0.004 && planet.rock[v] < 0.005 && Math.random() < Math.min(0.02, l * 0.35)) puffs.add('steam', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 1, Math.random, up);
    }
  }
  // The lava world: rock boiling off lava in the starlight, rising pale.
  if (WORLD.goal === 'snow' && !planet.over) {
    vapourIn -= dt;
    if (vapourIn <= 0) {
      vapourIn = 0.3;
      for (let v = 0; v < N; v++) if (planet.lava[v] > 0.002 && Math.random() < 0.05 * planet.dayAt(v)) puffs.add('steam', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 0.8, Math.random, up);
    }
  }
  // A dust storm: dust driven across the face of the world, low and fast.
  if (planet.storm) {
    for (let i = 0; i < 3; i++) {
      const v = Math.floor(Math.random() * N);
      NORMAL.set(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]).applyQuaternion(group.quaternion);
      if (NORMAL.z > 0.2) puffs.add('dust', p[v * 3], p[v * 3 + 1], p[v * 3 + 2], 0.3, Math.random, { x: INVERSE_RIGHT.x, y: INVERSE_RIGHT.y, z: INVERSE_RIGHT.z });
    }
  }
  // The vent smokes as the heat gathers: a wisp now and then while there's little, more and
  // heavier as it builds, and a dark column once it would burst.
  smokeIn -= dt;
  // (Under a cone that holds more, heaviest as it nears what the cone can hold: then it's close to blowing apart.)
  // (And on Io, the dark column is for a burst that would be a great plume, which the tide decides as much as the pressure.)
  const share = Math.min(1, planet.pressure / planet.capNow), brink = planet.pressure > planet.capNow * 0.85;
  // On the brink, a long low shudder in the hand, once.
  if (brink && !wasBrink && !LAMP && !planet.pouring) feel([70, 60, 90]);
  wasBrink = brink;
  const full = planet.k.great > 0 ? planet.throwOf(planet.pressure) >= planet.k.great : planet.bursting;
  if (QUIET) {
    // Quiet: the smoke reads the pressure. A thin wisp at rest; a taller, fuller column as it builds;
    // grey once letting it out would burst (on Io, burst as a great plume); dark only at the brink.
    // Small puffs in a close stream, so it's one column, leaning with the breeze.
    if (!LAMP && !planet.over && !planet.pouring && planet.pressure > 0.05 && smokeIn <= 0) {
      smokeIn = 0.14 + 0.22 * (1 - share);
      const ready = planet.k.great > 0 ? planet.throwOf(planet.pressure) / planet.k.great : planet.pressure / planet.k.explosive;
      const grey = 0.75 * THREE.MathUtils.smoothstep(ready, 0.88, 1);
      const dark = Math.max(grey, Math.min(1, Math.max(0, (share - 0.75) / 0.2))), lean = { x: up.x + 0.3 * INVERSE_RIGHT.x, y: up.y + 0.3 * INVERSE_RIGHT.y, z: up.z + 0.3 * INVERSE_RIGHT.z };
      // (Starting a little way off the vent, the way it leans, so the glow at the vent's mouth isn't under it.)
      puffs.add('smoke', p[v0 * 3] + lean.x * 0.05, p[v0 * 3 + 1] + lean.y * 0.05, p[v0 * 3 + 2] + lean.z * 0.05, 0.25 + 1.3 * share, Math.random, lean, 0, dark * dark);
    }
  } else if (!LAMP && !planet.over && !planet.pouring && planet.pressure > 0.5 && smokeIn <= 0) {
    smokeIn = brink ? 0.14 : full ? 0.22 : 0.7 - 0.4 * Math.min(1, planet.pressure / VOLCANO.explosive);
    // A billow at a time, so the plume builds from them, fuller and darker as the heat gathers;
    // warmed from below where lava lies at the vent.
    const warm = planet.lava[v0] > 0.002 ? 1 : 0.35 * share;
    puffs.add('smoke', p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2], full ? 1.4 + share : 0.5 + share, Math.random, up, warm);
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
// ---------------------------------------------------------------- the fire again, quickly
/**
 * The world every few seconds of the fire, kept small (heights and lava as whole numbers), so that
 * when the fire is done the whole of it can be played again in a few seconds, from bare ground to
 * what was made, before the long age and the chart.
 */
const REPLAY_EVERY = 4, REPLAY_MOST = 100, REPLAY_SECONDS = 8;
const replayFrames: { rock: Int16Array; lava: Uint16Array; age: Uint16Array }[] = [];
let replayKeptAt = -1e9, replayShown = -1;
let replaying: { at: number; rock: Float32Array; lava: Float32Array; age: Float32Array } | null = null;
function keepReplayFrame(): void {
  if (planet.seconds - replayKeptAt < REPLAY_EVERY) return;
  replayKeptAt = planet.seconds;
  const n = planet.rock.length, rock = new Int16Array(n), lava = new Uint16Array(n), age = new Uint16Array(n);
  for (let v = 0; v < n; v++) {
    rock[v] = Math.max(-32767, Math.min(32767, Math.round(planet.rock[v] * 20000)));
    lava[v] = Math.min(65535, Math.round(planet.lava[v] * 50000));
    age[v] = planet.age[v] >= 1e5 ? 65535 : Math.min(65534, Math.round(planet.age[v]));
  }
  replayFrames.push({ rock, lava, age });
  // (Too many: every other one goes, and they're kept half as often from now on.)
  if (replayFrames.length > REPLAY_MOST) { for (let i = replayFrames.length - 1; i > 0; i -= 2) replayFrames.splice(i - 1, 1); }
}
/** Put one kept moment into the world, draw it, and take the world back as it is. */
function showReplayFrame(i: number): void {
  const f = replayFrames[i], n = planet.rock.length;
  for (let v = 0; v < n; v++) { planet.rock[v] = f.rock[v] / 20000; planet.lava[v] = f.lava[v] / 50000; planet.age[v] = f.age[v] === 65535 ? 1e6 : f.age[v]; }
  planet.lavaChanged();
  draw();
  planet.rock.set(replaying!.rock); planet.lava.set(replaying!.lava); planet.age.set(replaying!.age);
  planet.lavaChanged();
}
/** What's drawn from the world as it is now, not as it was (the contours, the aim's dots, life's signs): hidden while it replays. */
function replayHides(hide: boolean): void {
  for (const pen of [...landPens, ...seaPens]) pen.object.visible = !hide;
  for (const st of [aimInk, aimPencil, aimNext, ...kindDots]) st.object.visible = !hide;
  gauge.visible = !hide;
}
function startReplay(): void {
  if (replayFrames.length < 4 || STILL) return;
  replaying = { at: seconds, rock: planet.rock.slice(), lava: planet.lava.slice(), age: planet.age.slice() };
  replayShown = -1;
  replayHides(true);
}
/** While it replays: the moment for now, if the last one has been drawn. Done, the world as it is again. */
function replayStep(): void {
  const f = (seconds - replaying!.at) / REPLAY_SECONDS;
  if (f >= 1) { replaying = null; lastDraw = -1; replayHides(false); return; }
  const i = Math.min(replayFrames.length - 1, Math.floor(f * replayFrames.length));
  if (i !== replayShown && !shapeOut) { replayShown = i; showReplayFrame(i); }
}

const GOAL_WORDS: Record<typeof WORLD.goal, { age: (met: boolean) => string; done: string; title: [string, string]; got: () => string }> = {
  ring: { age: () => 'The islands sink, and coral rings them', done: 'An unbroken chain of living islands', title: ['A chain of islands', 'The chain is broken'], got: () => `${aimDone} of ${aimOf} stretches living` },
  basins: { age: () => 'Time passes, and small stones still fall', done: 'Every basin flooded', title: ['Every basin flooded', 'Not every basin flooded'], got: () => `${aimDone} of ${aimOf} basins flooded` },
  height: { age: () => 'Time passes, and the storms go on', done: `The mountain reaches ${HEIGHT.target} km`, title: ['The great mountain', 'Not high enough yet'], got: () => `${Math.round(aimDone)} of ${aimOf} km high` },
  cover: { age: () => 'Time passes, and the new ice greys', done: `Done: ${COVER}% of the ice made new`, title: ['New ice', 'Not enough new ice'], got: () => `${Math.round(aimDone)}% of the ice new, of ${aimOf}%` },
  plumes: { age: () => 'Time passes, and the sulphur settles', done: `Done: ${PLUMES} great plumes`, title: ['Great plumes', 'Not enough great plumes'], got: () => `${aimDone} of ${aimOf} great plumes` },
  calm: { age: () => 'Time passes, and the moon turns on', done: 'The tumbling is calmed', title: ['The tumbling calmed', 'Still tumbling'], got: () => `${aimDone}% calmed, of ${aimOf}%` },
  bank: { age: () => 'Time passes, and the sea goes on', done: 'An island on the bank', title: ['An island on the bank', 'No island on the bank yet'], got: () => `the island ${Math.min(100, Math.round(aimDone))}% raised` },
  ridge: { age: () => 'Time passes, and small stones still fall', done: 'A ridge all the way round', title: ['Ringed with a ridge', 'Not yet ringed'], got: () => `${aimDone} of ${aimOf} stretches raised` },
  lamp: { age: () => 'Time passes, and the blobs sink into the deep', done: 'The far shore is full', title: ['The far shore filled', 'The far shore not filled'], got: () => `the far shore ${Math.min(100, Math.round(aimDone))}% full` },
  round: { age: () => 'Time passes, and small stones still fall', done: `The asteroid is ${ROUND}% rounder`, title: ['A rounder world', 'Not round enough yet'], got: () => `${Math.round(aimDone)}% rounder, of ${aimOf}%` },
  feed: { age: () => 'Time passes, and the ring slowly thins', done: 'The ring is full', title: ['The ring is full', 'The ring is not full'], got: () => `the ring ${Math.min(100, Math.round(aimDone))}% full` },
  orbit: { age: (met) => (met ? 'Time passes, and the ring of rock gathers into a moon' : 'Time passes, and the rock in orbit falls back'), done: 'Enough rock in orbit for a moon', title: ['A moon is made', 'No moon yet'], got: () => `${Math.min(100, Math.round(aimDone))}% of a moon in orbit` },
  hearth: { age: () => 'Time passes, and the rock grows cold', done: 'Warm ground, and life all over it', title: ['Life kept warm', 'Not enough kept warm'], got: () => `${Math.min(100, Math.round(aimDone))}% of the living ground` },
  thaw: { age: (met) => (met ? 'Time passes, and the ice goes on giving way' : 'Time passes, and the gas is drawn down'), done: 'The ice gives way', title: ['The ice gives way', 'Still frozen'], got: () => `the sky ${Math.min(100, Math.round(aimDone))}% warm enough` },
  outbuild: { age: () => 'Time passes, and the star goes on boiling it', done: 'It has grown faster than it boils away', title: ['Built faster than it boils', 'Boiling away'], got: () => `${Math.min(100, Math.round(aimDone))}% of the growth` },
  white: { age: () => 'Time passes, and the last of the black lava whitens', done: 'A white mountain on the equator', title: ['A white mountain', 'Not yet white'], got: () => (aimDone < 50 ? `the peak ${Math.round(aimDone * 2)}% built` : `the summit ${Math.round((aimDone - 50) * 2)}% white`) },
  glow: { age: () => 'Time passes, and the blue fire goes out', done: 'The crater lit with blue fire', title: ['Blue fire', 'The night still dark'], got: () => `${Math.min(100, Math.round(aimDone))}% of the night lit` },
  waves: { age: () => 'Time passes, and the sea fills the broken cone', done: 'The air rung round the world', title: ['Waves round the world', 'Not enough waves'], got: () => `${aimDone} of ${aimOf} waves` },
  antipode: { age: () => 'Time passes, and the world goes on cooling and wrinkling', done: 'A mountain on the far side, raised from this one', title: ['Through the world', 'The far side still low'], got: () => `the far side ${Math.round(aimDone)} of ${aimOf} km high` },
  gather: { age: () => 'Time passes, and the molten world crusts over', done: 'Enough of the rubble gathered: a world', title: ['A world gathered', 'Not yet a world'], got: () => `${aimDone} of ${aimOf} stones gathered` },
  oxygen: { age: (met) => (met ? 'Time passes, and the sky goes on clearing to blue' : 'Time passes, and the haze stays'), done: 'The sky turns blue', title: ['A blue sky', 'Still an orange sky'], got: () => `${Math.min(100, Math.round(aimDone))}% of the oxygen` },
  chaos: { age: () => 'Time passes, and the rafts freeze where they drifted', done: 'The ice broken into chaos', title: ['Chaos terrain', 'Not enough chaos'], got: () => `${aimDone} of ${aimOf} chaos fields` },
  streaks: { age: () => 'Time passes, and the streaks fade a little', done: 'Streaked with geysers', title: ['Geyser streaks', 'Not enough streaks'], got: () => `${aimDone} of ${aimOf} streaks` },
  snow: { age: () => 'Time passes, and the last vapour falls', done: 'Rock snow all along the edge of night', title: ['Rock snow', 'Not enough rock snow'], got: () => `${Math.min(100, Math.round(aimDone))}% of the rock snow` },
};
const AGE_WORDS = (met: boolean) => GOAL_WORDS[WORLD.goal].age(met);
/** What was made, in a sentence for the chart: what it is, not a score. */
function tale(met: boolean): string {
  const pct = Math.min(100, Math.round(aimDone));
  switch (WORLD.goal) {
    case 'ring': return met ? 'A chain of living islands half the world long, the oldest already sinking' : `Living islands along ${aimDone} of the ${aimOf} stretches; the sea took the rest`;
    case 'basins': return met ? `All ${aimOf} old basins filled with new, dark seas` : `${aimDone} of ${aimOf} old basins filled with new seas`;
    case 'height': { const km = Math.round(aimDone); return met ? `A mountain ${km} km high, three times the height of Everest` : `A mountain ${km} km high, still rising when the fire went out`; }
    case 'cover': return `${Math.round(aimDone)}% of the old grey ice made new and white`;
    case 'plumes': return `${aimDone} great plumes, their sulphur rings laid side by side`;
    case 'calm': return met ? 'A moon that tumbled, now turning steadily' : `A moon still tumbling, ${aimDone}% calmer than it was`;
    case 'bank': return met ? 'A new island standing on the bank, alone in deep water' : 'An island at the bank, not yet above the water';
    case 'ridge': return met ? 'A ridge all the way round its middle, like a seam' : `A ridge round ${aimDone} of the ${aimOf} stretches of its middle`;
    case 'lamp': return met ? 'Warm glass gathered on the far shore' : `The far shore ${pct}% filled with warm glass`;
    case 'round': return `Its hollows filled with new rock: ${Math.round(aimDone)}% rounder than it was`;
    case 'feed': return met ? "The giant's ring, full of this moon's ice" : `The giant's ring ${pct}% full of this moon's ice`;
    case 'orbit': return met ? 'Enough rock thrown up to gather into a moon' : `${pct}% of a moon thrown up, and falling back`;
    case 'hearth': return met ? 'Warm new rock, and life gathered on it, in the dark between the stars' : `Life on warm rock, ${pct}% of what was hoped, fading as it cooled`;
    case 'thaw': return met ? 'The ice given way from the equator outwards, and open sea' : `A sky ${pct}% warm enough, and the ice still holding`;
    case 'outbuild': return met ? 'A world built back faster than its star could boil it away' : `A world still boiling away, ${pct}% of the way to outgrowing it`;
    case 'white': return met ? 'A peak of black lava turned white, snow-capped on the equator' : aimDone < 50 ? 'A black peak, not yet built to its height' : 'A black peak, its summit only partly white';
    case 'glow': return met ? 'A crater lit at night by rivers of blue fire' : `The night ${pct}% lit with blue fire`;
    case 'waves': return met ? `${aimDone} pressure waves rung round the world, the cone blown apart and built again each time` : `${aimDone} of ${aimOf} waves rung round the world`;
    case 'antipode': return met ? `A mountain ${Math.round(aimDone)} km high on the far side, raised by shocks sent through the world` : `The far side raised ${Math.round(aimDone)} km, by shocks sent through the world`;
    case 'gather': return met ? 'A world gathered from rubble, its molten skin crusting over' : `${aimDone} stones gathered, not yet enough for a world`;
    case 'oxygen': return met ? 'Oxygen breathed out by life in the shallows, and a sky turned blue' : `A sky still orange, ${pct}% of the way to blue`;
    case 'chaos': return met ? `The ice broken into rafts in ${aimDone} places, and frozen again` : `Rafts in ${aimDone} of ${aimOf} places`;
    case 'streaks': return met ? `${aimDone} dark streaks, all blown one way` : `${aimDone} of ${aimOf} geyser streaks`;
    case 'snow': return met ? 'Pale rock snow fallen all along the edge of night' : `Rock snow ${pct}% fallen along the edge of night`;
  }
}
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
    startReplay();
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
    startReplay();
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
    if (RUN === null && AGES.includes(WORLD.id)) keepGround(ageKey(WORLD.id), { rock: planet.rock.slice(), fires: 1, marked: null }); // (the ground the next age begins on)
    else if (RUN === null) keepGround(GROUND_KEY, { rock: planet.rock.slice(), fires: FIRES + 1, marked });
    $('stage-name').textContent = ending.info.title;
    $('worlds').style.display = 'none'; // (the chart has its own title there)
    $('goal').style.opacity = '0'; // (and its own line under it: the goal's ran into it)
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
    summary: tale(met) + (second ? ` · ${second.words}` : ''),
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
    // (Into a new chapter, its name: the last world of one is a threshold.)
    const newChapter = next && chapterOf(next.id) !== chapterOf(WORLD.id) ? chapterOf(next.id) : null;
    $('again').textContent = RUN !== null ? 'touch to go back to the solar system' : newChapter ? `${chapterOf(WORLD.id).title}: done. Touch to begin chapter ${newChapter.numeral}, ${newChapter.title.toLowerCase()}` : next ? `touch to go on to ${next.title.replace(/^An? /, 'an ').replace(/^The /, 'the ')}` : ending.won ? 'Every world made. Touch to start again' : 'touch to try again';
    $('again').classList.add('shown');
    intoTheAtlas();
    // The chart can be kept as a picture where the page may hand over a file: not inside a frame (as a hosted preview), which can't.
    if (NATIVE || window.self === window.top) $('keep').classList.add('shown');
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
  portrait = portraitOf(renderer.domElement);
  const cv = drawChart(renderer.domElement, ending!.info!);
  group.quaternion.copy(was);
  lift = lifted; look();
  return cv;
}
$('keep').addEventListener('click', () => {
  void keepImage(plate(), `warm-to-the-touch-${WORLD.id}-${seed}`);
});
/** The world, cut out round from the picture just drawn, small, for its star in the atlas. */
let portrait = '';
function portraitOf(from: HTMLCanvasElement): string {
  // (Measured across and up separately: the drawing's pixels aren't always square.)
  const c = new THREE.Vector3(0, 0, 0).project(camera);
  const e = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(1.04).project(camera);
  const u = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(1.04).project(camera);
  const cx = (c.x + 1) / 2 * from.width, cy = (1 - c.y) / 2 * from.height, rx = Math.abs(e.x - c.x) / 2 * from.width, ry = Math.abs(u.y - c.y) / 2 * from.height;
  if (!(rx > 4 && ry > 4)) return '';
  const out = document.createElement('canvas'); out.width = out.height = 120;
  const g = out.getContext('2d')!;
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, 120, 120);
  g.drawImage(from, cx - rx, cy - ry, rx * 2, ry * 2, 0, 0, 120, 120);
  return out.toDataURL('image/jpeg', 0.86);
}
/** Once the chart is drawn, it goes into the atlas: a small picture of the plate, and what it says. */
let paged = false;
function intoTheAtlas(): void {
  if (paged || !ending?.info) return;
  paged = true;
  const big = plate(), small = document.createElement('canvas');
  small.width = 480; small.height = Math.round(480 * big.height / big.width);
  small.getContext('2d')!.drawImage(big, 0, 0, small.width, small.height);
  const i = ending.info;
  void keepPage({ world: WORLD.id, numeral: WORLD.numeral, title: i.title, subtitle: i.subtitle, summary: i.summary, when: Date.now(), image: small.toDataURL('image/jpeg', 0.82), portrait: portrait || undefined, globe: keepsakeOf(planet) });
}

// ---------------------------------------------------------------- held like a globe
/**
 * Which way is down, in the camera's frame (x right, y up, z towards you). Without a phone's
 * sense of it, down the screen a little and mostly into it, as if looking down at a globe on a
 * table; with one, as the phone is held, smoothed so a shaking hand doesn't slop the lava about.
 */
const LEVEL = new THREE.Vector3(0, -0.3, -1).normalize();
const BREATH_DOWN = new THREE.Vector3(0, -0.62, -1).normalize(), TIP_V = new THREE.Vector3();
/**
 * The way a pour will go: a faint line of dots from the vent down the world as it's held, showing
 * the steepest way while the phone is tipped (or, breathing, always), so a tip is a choice and not a guess.
 */
const WAY_MOST = 40, wayAt = new Float32Array(WAY_MOST * 3), wayGeo = new THREE.BufferGeometry();
wayGeo.setAttribute('position', new THREE.BufferAttribute(wayAt, 3));
const wayDots = new THREE.Points(wayGeo, new THREE.PointsMaterial({ color: new THREE.Color(P.landInkHigh), size: 0.012, transparent: true, opacity: 0, depthWrite: false }));
let wayShown = 0, wayAtSec = -1;
function showWay(): void {
  if (!wayDots.parent) group.add(wayDots);
  const want = !begun || ending || LAMP ? 0 : BREATHE ? 0.45 : Math.min(1, Math.max(0, (planet.tip - planet.k.tipPour * 0.45) / (planet.k.tipPour * 0.5))) * 0.6;
  wayShown += (want - wayShown) * 0.12;
  (wayDots.material as THREE.PointsMaterial).opacity = wayShown;
  if (wayShown < 0.02 || seconds - wayAtSec < 0.15) return;
  wayAtSec = seconds;
  const path = planet.pathFrom(planet.plumeVertex, WAY_MOST * 2);
  let k = 0;
  for (let i = 2; i < path.length && k < WAY_MOST; i += 2, k++) {
    const v = path[i], r = Math.hypot(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]) + 0.006;
    wayAt[k * 3] = base[v * 3] * r; wayAt[k * 3 + 1] = base[v * 3 + 1] * r; wayAt[k * 3 + 2] = base[v * 3 + 2] * r;
  }
  wayGeo.setDrawRange(0, k);
  wayGeo.attributes.position.needsUpdate = true;
}
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
    // (Not its rules, nor what's worked out from the ground: those come fresh from this version of the game.)
    planet: snapshotOf(planet, ['topo', 'next', 'firmness', 'scale', 'news', 'k', 'grainOf', 'slowDelta', 'moltenWas', 'moltenKnown']),
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
  // (A save from an older game kept its rules too: they are the game's own now.)
  const { k: _oldRules, grainOf: _grain, slowDelta: _scratch, moltenWas: _m, moltenKnown: _mk, ...kept } = w.planet as Record<string, unknown>;
  void _oldRules; void _grain; void _scratch; void _m; void _mk;
  if (!restoreInto(planet, kept, ['plume', 'tally', 'drift', 'wear'])) { void forget(); return false; }
  planet.lavaChanged();
  restoreInto(ecology, w.ecology);
  restoreInto(islands, w.islands);
  // (The tumbling moon's calm is reckoned from now: the whole of the time kept had counted at once.)
  calmAt = planet.seconds;
  lesson = w.page.lesson; embersSaid = w.page.embersSaid; shownEra = w.page.shownEra;
  eraFrom.length = 0; eraFrom.push(...w.page.eraFrom);
  group.quaternion.fromArray(w.page.turn);
  dist = w.page.dist; look();
  $('stage-name').textContent = WORLD.title;
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
// The card: which world, its mood in a line, what to do there, and begin. The worlds, along its foot.
// Everything else (a voyage, wandering, the ink, the atlas, new ground) is under "more".
// (It carried about ten lines, twelve numerals, four links and seven inks.)
($('begin').querySelector('.world') as HTMLElement).textContent = WORLD.numeral;
// (And its chapter, above it: not for a world of a solar system, which has its own place.)
// (As little as can be: its number and name, what to do, and begin. Its chapter, its mood and the
// list of worlds went to the atlas, which is where worlds are picked now.)
($('begin').querySelector('.chapter') as HTMLElement).textContent = '';
($('begin').querySelector('.name') as HTMLElement).textContent = WORLD.title;
// (An age of Earth begun on the ground the age before left says so: it's the world you made, an age on.)
($('begin').querySelector('.first') as HTMLElement).textContent = AGE_GROUND ? 'The world you made, an age later.' : '';
// (Breathing, there's no tipping: what the card says of tipping is said of turning instead.)
const cardWords = () => {
  const el = $('begin').querySelector('.second') as HTMLElement;
  el.replaceChildren();
  const aim = document.createElement('b'); aim.className = 'aim'; aim.textContent = FREE ? 'No aim and no clock.' : AIM[WORLD.goal] ?? WORLD.second;
  el.append(aim, document.createTextNode(FREE ? 'The fire never cools.' : TIP[WORLD.goal] ?? ''));
};
cardWords();
// The hands, the same on every card.
// (Only where the hands are new: the first world, and the lamp, where they work the other way round.)
($('begin').querySelector('.hands') as HTMLElement).textContent = NEWCOMER ? HANDS.join('\n') : '';
// The worlds, along the card's foot, as an atlas lists its plates: touch another to go to it.
// (Not for a world of a solar system: it's reached from the system's chart.)
// The worlds: one touch to the atlas's sky, where every world stands in its chapter's constellation.
if (RUN === null) {
  const b = document.createElement('button');
  b.textContent = 'the chart';
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); void pages().then((all) => openAtlas(all)); });
  $('begin').querySelector('.worlds')!.appendChild(b);
}
const more = $('begin').querySelector('.more') as HTMLElement;
{
  const toggle = $('begin').querySelector('.more-toggle') as HTMLElement;
  toggle.addEventListener('pointerdown', (e) => { e.stopPropagation(); more.hidden = !more.hidden; toggle.textContent = more.hidden ? 'more' : 'less'; cardView(); });
  more.addEventListener('pointerdown', (e) => e.stopPropagation());
}
const moreLink = (text: string, act: () => void): HTMLElement => {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); act(); });
  more.appendChild(b);
  return b;
};
// The solar system: its worlds played as a run, in whatever order (see system.ts).
moreLink(SYSTEM ? `Voyage · ${madeCount(SYSTEM)} of ${SYSTEM.bodies.length} worlds made` : 'Voyage · worlds one after another', () => openSystem());
// Wandering: this world with no aim and no clock; or, wandering, back to the world with its aim.
// The calm way to play, or tipping: kept for every world.
if (!COMPUTER && !LAMP) moreLink(BREATHE ? 'Tip the phone to pour, as before' : 'Breathe · no tipping: it pours by itself, you turn the world', () => { remember('volcano.controls', BREATHE ? 'tip' : 'breathe'); location.reload(); }); // (a computer can't be tipped: it always breathes)
if (RUN === null) moreLink(FREE ? 'Play with the aim' : 'Wander · no aim, no clock', () => {
  const q = new URLSearchParams(location.search);
  q.delete('seed');
  q.set('world', WORLD.id);
  if (FREE) q.delete('free'); else q.set('free', '');
  location.search = q.toString().replace(/free=(&|$)/, 'free$1');
});
// The ink, for the whole game: three, the quiet print first. (Remembered once, not world by world.)
{
  const row = document.createElement('p');
  row.className = 'ink';
  for (const id of ['quiet', 'engrave', 'water']) {
    const l = LOOKS.find((x) => x.id === id)!;
    const b = document.createElement('button');
    b.textContent = l.words;
    if (l.look === LOOK) b.className = 'here';
    else b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      remember(OWN_LOOK, l.id);
      const q = new URLSearchParams(location.search);
      q.delete('look');
      location.search = q.toString();
    });
    row.appendChild(b);
  }
  more.appendChild(row);
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
  moreLink(`Celestial Chart · ${all.length} ${all.length === 1 ? 'plate' : 'plates'} kept`, () => openAtlas(all));
});
let atlasPick: ((id: WorldId) => void) | null = null;
let globeView: Globe | null = null, cardGlobe: { dispose(): void } | null = null;
function openAtlas(all: Page[], only: string | null = null): void {
  const box = $('atlas'), list = box.querySelector('.pages')!, view = box.querySelector('.view img') as HTMLImageElement;
  // The sky first, as a celestial globe: touch any world on it, and a small card rises: the world as
  // you left it (or still to make), its name, and Play.
  const sky = box.querySelector('.sky') as HTMLElement;
  const pick = box.querySelector('.pick') as HTMLElement;
  globeView?.dispose();
  globeView = openGlobe(sky, all, WORLD.id, atlasPick = (id) => {
    const w = worldOf(id), made = all.filter((p) => p.world === id), last = made[made.length - 1];
    // The world as a little globe, turning: as it was left, or (still to make) its ground untouched.
    const globe = pick.querySelector('.globe') as HTMLElement;
    cardGlobe?.dispose();
    cardGlobe = turningGlobe(globe, topo, id, last?.globe, () => new Planet(topo, START, 11, worldOf(id).rules));
    (pick.querySelector('.t') as HTMLElement).textContent = w.title;
    (pick.querySelector('.k') as HTMLElement).textContent = w.first;
    (pick.querySelector('.plates') as HTMLElement).hidden = !made.length;
    pick.dataset.world = id;
    pick.classList.add('shown');
  });
  const head = box.querySelector('.plates-head') as HTMLElement;
  head.textContent = only ? worldOf(only as WorldId).title : all.length ? 'The plates' : '';
  list.innerHTML = '';
  for (const p of all.slice().reverse().filter((q) => !only || q.world === only)) {
    const fig = document.createElement('figure'), img = new Image(), cap = document.createElement('figcaption'), when = document.createElement('small');
    img.src = p.image; img.alt = `${p.title}: ${p.summary}`;
    cap.textContent = `${p.world ? worldOf(p.world).numeral : p.numeral} · ${p.title}`;
    when.textContent = new Date(p.when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    cap.append(document.createElement('br'), when);
    fig.append(img, cap);
    fig.addEventListener('click', () => { view.src = p.image; view.alt = img.alt; box.classList.add('viewing'); });
    list.appendChild(fig);
  }
  box.classList.add('open');
}
$('atlas').querySelector('.view')!.addEventListener('click', () => $('atlas').classList.remove('viewing'));
{
  const pick = $('atlas').querySelector('.pick') as HTMLElement;
  // (Touching outside the card puts it away.)
  pick.addEventListener('click', (e) => { if (e.target === pick) { pick.classList.remove('shown'); cardGlobe?.dispose(); cardGlobe = null; } });
  pick.querySelector('.go')!.addEventListener('click', () => { const id = pick.dataset.world!; remember('volcano.world', id); location.search = `?world=${id}`; });
  pick.querySelector('.plates')!.addEventListener('click', () => {
    pick.classList.remove('shown');
    void pages().then((all) => { openAtlas(all, pick.dataset.world!); $('atlas').querySelector('.plates-head')!.scrollIntoView({ behavior: 'smooth' }); });
  });
}
$('atlas').querySelector('.close')!.addEventListener('click', () => { $('atlas').classList.remove('open', 'viewing'); globeView?.dispose(); globeView = null; cardGlobe?.dispose(); cardGlobe = null; $('atlas').querySelector('.pick')!.classList.remove('shown'); });
// A world with a past can be begun afresh, on new ground.
if (FIRES) moreLink('Begin this world on new ground', () => { forgetGround(GROUND_KEY); void forget(); setTimeout(() => location.reload(), 200); });
// A world without life has no key of its kinds.
// (The key to life's signs is not shown: the aim is the chain, not the kinds, and the key was one more thing to read.)
$('legend').style.display = 'none';
$('begin').addEventListener('pointerdown', () => {
  if (begun) return;
  begun = true;
  begunAt = seconds;
  remember('volcano.played', String(Number(remembered('volcano.played') ?? '0') + 1));
  document.body.classList.remove('carding');
  askForTilt();
  $('begin').classList.add('gone');
  if (FREE) $('finish').classList.add('shown');
});
// The card shows once its words are in (a kept world's included), so it never flashes half-made.
const cardReady = () => requestAnimationFrame(() => { cardView(); $('begin').classList.remove('loading'); });
void resume().then((back) => {
  cardReady();
  if (!back) return;
  ($('begin').querySelector('.first') as HTMLElement).textContent = 'Your world, as you left it.';
  cardWords();
  ($('begin').querySelector('.touch') as HTMLElement).textContent = 'Continue';
});

// ---------------------------------------------------------------- the camera, and the pace
/**
 * The camera breathes with the land: close while there's little, easing out as it spreads, so
 * the whole of what you've made is in view; a pinch takes over for a while.
 */
let zoomedAt = -100, lastReach = -10, reachDist = 3.2, lean = 1;
/** When the world was begun (it glides from the card's view to the playing view, a little quicker at first). */
let begunAt = -100;
/** The card's view: the world whole and small, high on the page, above the card's words. */
function cardView(): void {
  if (begun) return;
  // Sized and placed in the room above the card's words, however tall the phone (and whatever the card says).
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  const words = (($('begin').querySelector('.chapter') as HTMLElement).textContent ? ($('begin').querySelector('.chapter') as HTMLElement) : ($('begin').querySelector('.world') as HTMLElement)).getBoundingClientRect().top; // (above the chapter's name, when there is one)
  const above = 56, room = Math.max(80, words - 22 - above);
  const r = Math.min(room, w * 0.7) / 2, middle = above + room / 2;
  dist = (1.08 * (h / 2)) / (r * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  lift = (h / 2 - middle) / h;
  look();
  // The paper comes up under the words, and the world is clear above them.
  $('begin').style.background = `linear-gradient(to bottom, rgba(244, 239, 228, 0) 0px, rgba(244, 239, 228, 0) ${Math.max(0, words - 34)}px, #f4efe4 ${Math.max(0, words - 6)}px)`;
}
/** How the world was turned when the card came up: it turns slowly while the card is up, and settles back on beginning. */
const CARD_TURN = new THREE.Quaternion();
let cardTurned = false;
/** Asked for less motion: no sudden step back at a burst (the slow breathing of the view stays). */
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
function breathe(dt: number): void {
  if (seconds - lastReach > 2) {
    lastReach = seconds;
    // How far the land reaches from the vent, as an angle.
    const q = planet.plume;
    let least = 1;
    for (let v = 0; v < N; v += 3) if (planet.rock[v] > 0) least = Math.min(least, base[v * 3] * q.x + base[v * 3 + 1] * q.y + base[v * 3 + 2] * q.z);
    // (Further back on a young Earth, to leave room for the moon's ring round it.)
    reachDist = THREE.MathUtils.clamp(3.4 + 2 * Math.acos(least), 3.4, 4.8) * (WORLD.goal === 'orbit' ? 1.3 : WORLD.goal === 'feed' ? 1.15 : 1);
  }
  // At the end, the world steps back and up the page, leaving the foot for the chart.
  const moment = !ending && seconds - momentAt < 4.5;
  document.body.classList.toggle('hush', moment);
  // While lava runs, the view leans in a little, so the flow is big when it matters; and eases back after.
  const running = !ending && !moment && (planet.pouring || (planet.erupting && planet.molten > 0.01)) && !STILL;
  lean += ((running ? 0.82 : 1) - lean) * Math.min(1, dt * (running ? 0.9 : 0.45));
  const want = ending?.shown ? farthest * 0.92 : reachDist * (moment && !STILL ? 1.16 : 1) * lean, wantLift = ending?.shown ? 0.09 : 0;
  if (!ending?.shown && seconds - zoomedAt < 10) return;
  const gliding = seconds - begunAt < 5; // (from the card's view: quicker, so the world comes to hand)
  const d = dist + (want - dist) * Math.min(1, (moment ? 0.9 : gliding ? 0.9 : Math.abs(lean - 1) > 0.01 ? 1.4 : 0.15) * dt), l = lift + (wantLift - lift) * Math.min(1, (gliding ? 1.2 : 0.6) * dt);
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
cardView();
drawNow();
redrawLines(0);
const clock = new THREE.Clock();
// ---------------------------------------------------------------- in the hand
/**
 * What's felt while it's played, not only at its moments: a heartbeat under a finger holding the
 * heat in, quickening as it gathers, firmer once a burst is ready and urgent at the brink; a
 * rumble while it pours, more as it's tipped further; what a burst throws, landing; and a tap each
 * time the aim gains a piece.
 */
let beatAt = 0, rumbleAt = 0, wasReady = false, landing: { at: number; n: number } | null = null, aimFelt = -1;
function inTheHand(): void {
  if (!begun || ending || planet.over || replaying) { rumble(0); return; }
  if (!LAMP && planet.clamped && planet.pressure > planet.k.least) {
    const ready = planet.k.great > 0 ? planet.throwOf(planet.pressure) / planet.k.great : planet.pressure / planet.k.explosive;
    const brink = planet.pressure > planet.capNow * 0.85;
    if (ready >= 1 && !wasReady) { tap({ strength: 0.75, sharpness: 0.4 }); setTimeout(() => tap({ strength: 0.75, sharpness: 0.4 }), 130); beatAt = seconds; } // (ready: a double beat)
    wasReady = ready >= 1;
    const every = brink ? 0.22 : THREE.MathUtils.lerp(1.1, 0.38, Math.min(1, ready));
    if (seconds - beatAt >= every) {
      // A heartbeat: a soft thump and a softer one after it, firmer as it gathers, hard at the brink.
      beatAt = seconds;
      const s = brink ? 1 : 0.22 + 0.4 * Math.min(1, ready);
      tap({ strength: s, sharpness: brink ? 0.5 : 0.15 });
      if (!brink) setTimeout(() => tap({ strength: s * 0.6, sharpness: 0.1 }), 150);
    }
  } else wasReady = false;
  // Pouring: a rumble, deeper and stronger as it's tipped further (on the phone's engine, continuous; else in light taps).
  const pourStrength = planet.pouring && planet.pressure > 0.02 ? Math.min(1, Math.max(0, (planet.tip - planet.k.tipPour) / (1 - planet.k.tipPour))) : -1;
  if (rumbles()) rumble(pourStrength < 0 ? 0 : 0.25 + 0.55 * pourStrength, 0.15 + 0.2 * pourStrength);
  else if (pourStrength >= 0 && seconds - rumbleAt >= 1 / (7 + 9 * pourStrength)) { rumbleAt = seconds; tap('light'); }
  if (landing) {
    const t = seconds - landing.at;
    if (t > 0.5 + 0.18 * (9 - landing.n) && landing.n > 0) { landing.n--; landing.at += 0.14 + 0.12 * Math.random(); tap({ strength: 0.2 + 0.35 * Math.random(), sharpness: 0.75 }); }
    if (landing.n <= 0 || t > 3) landing = null;
  }
  // The aim gaining a piece: a basin, a stretch, a plume; or another tenth of it.
  const piece = ['ring', 'basins', 'plumes', 'ridge'].includes(WORLD.goal) ? Math.floor(aimDone) : Math.floor((aimDone / Math.max(1e-6, aimOf)) * 10);
  if (aimFelt >= 0 && piece > aimFelt) tap({ strength: 0.65, sharpness: 0.6 });
  aimFelt = Math.max(aimFelt, piece);
}

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
  // (Breathing, the world as if held a little tipped towards you, so each breath runs down the screen;
  // tipping, how far the phone is from level is what pours, however the world has been turned.)
  if (BREATHE) GRAV.copy(BREATH_DOWN).applyQuaternion(INVERSE);
  else GRAV.copy(held).normalize().applyQuaternion(INVERSE);
  planet.gravity = { x: GRAV.x, y: GRAV.y, z: GRAV.z };
  { const u = GIANT_DIR.copy(LEVEL).applyQuaternion(INVERSE); planet.upright = { x: u.x, y: u.y, z: u.z }; }
  { const h = TIP_V.copy(held).normalize(), c = h.dot(LEVEL); planet.tilt = BREATHE ? 0 : Math.sqrt(Math.max(0, 1 - c * c)); }
  showWay();
  // And which way the giant is, on a world that has one in its sky.
  if (WORLD.goal === 'feed') { const s = GIANT_DIR.copy(GIANT_AT).normalize().applyQuaternion(INVERSE); planet.giant = { x: s.x, y: s.y, z: s.z }; }
  if (SUN) { const s = GIANT_DIR.copy(SUN).applyQuaternion(INVERSE); planet.star = { x: s.x, y: s.y, z: s.z }; }
  drawLevel();
  // Once the fire is out, the long age runs quickly, in small steps so the sea's work stays as it would be.
  const speed = ending && !ending.shown && (!ending.won || seconds - wonAt() > 4) ? AGE_SPEED : 1;
  // Nothing happens until the world is begun.
  if (replaying) replayStep();
  else if (begun && !ending?.shown) {
    const before = new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z);
    // (In the long age, four larger steps rather than fourteen small ones: it was 14 to 43 ms a frame.)
    const steps = speed > 1 ? 4 : 1;
    for (let k = 0; k < steps; k++) planet.step((dt * speed) / steps);
    if (!ending) keepReplayFrame();
    // A tumbling moon rolls of itself, about its spin's axis (in its own frame), as fast as it tumbles.
    if (planet.k.tumble > 0) {
      const w = planet.spinNow, r = Math.hypot(w.x, w.y, w.z);
      if (r > 1e-6) group.quaternion.multiply(TUMBLE.setFromAxisAngle(TUMBLE_AXIS.set(w.x / r, w.y / r, w.z / r), r * dt * speed));
    }
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
  if (!replaying && seconds - lastDraw >= (flowing || speed > 1 ? 1 / 20 : 0.5)) { lastDraw = seconds; draw(); heavy = true; }
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
  if (WORLD.goal === 'feed') feeding(dt);
  skyNow(dt);
  if (WORLD.goal === 'height' || WORLD.goal === 'cover' || WORLD.goal === 'round' || WORLD.goal === 'calm') {
    // The ring follows the heat, eased, so it glides as the heat creeps.
    gaugeAt.lerp(new THREE.Vector3(planet.plume.x, planet.plume.y, planet.plume.z), 1 - Math.exp(-dt / 1.5)).normalize();
    gauge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gaugeAt);
    gaugeInk.update(dt);
    gaugePencil.update(dt);
  }
  for (const s of [...kindDots, foam]) s.update(dt);
  puffs.update(dt * speed);
  if (begun) breathe(dt);
  inTheHand();
  // While the card is up, the world turns slowly above it; begun, it settles back to how it was turned.
  if (!begun && !$('begin').classList.contains('loading')) {
    if (!cardTurned) { CARD_TURN.copy(group.quaternion); cardTurned = true; }
    if (!STILL) rotate(dt * 0.05, 0);
  } else if (begun && cardTurned && seconds - begunAt < 3) group.quaternion.slerp(CARD_TURN, Math.min(1, dt * 3));
  if (begun && seconds - lastWords > 0.5) { lastWords = seconds; words(); theEnd(); lessons(); }
  if (begun && seconds - keptAt > 15) { keptAt = seconds; chores.push(save); }
  doChore(heavy, performance.now() - began0);
  showNext();
  if (import.meta.env.DEV) { frameCost.push(performance.now() - began0); if (frameCost.length > 600) frameCost.shift(); }
  renderer.render(scene, camera);
  drawEnding();
  turnedSince();
});

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { atlas: (all: Page[]) => openAtlas(all), sky, haze, planet, held, keepsake: () => keepsakeOf(planet), pick: (id: WorldId) => atlasPick?.(id), portrait: () => { renderer.render(scene, camera); return portraitOf(renderer.domElement); }, group, base, renderer, scene, camera, puffs, ecology, islands, rotate, draw, save, world, frameCost, kindDots, chain: () => chain, aim: () => aimInk, lines: () => { lastLines = -1; redrawLines(1e6); }, life: () => { lastLife = -10; redrawLife(1e6); }, replayKeep: () => keepReplayFrame(), replayCount: () => replayFrames.length, replaying: () => (replaying ? replayShown : -1), settle: (d = 3.6) => { lift = 0; dist = d; begunAt = -100; zoomedAt = seconds; look(); } };
