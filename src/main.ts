import * as THREE from 'three';
import { TerrainWorld, type SurfaceStyle, type WorldSettings } from './world';
import { decimate, loadScanFile, normaliseGeometry, triangleCount } from './mesh/load';
import { makeDemoOrange } from './demo/orange';
import { GestureRecognizer } from './interact/gestures';
import { buildTopology } from './mesh/topology';
import { chooseHeightMode, type HeightMode } from './terrain/heightfield';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// If anything goes wrong, say so on the page: a blank screen tells nobody anything.
function showTrouble(message: string): void {
  const hint = document.getElementById('hint');
  if (hint) { hint.classList.remove('gone'); hint.textContent = `Something went wrong: ${message}`; hint.style.color = '#8a2f22'; hint.style.opacity = '1'; }
}
window.addEventListener('error', (e) => showTrouble(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => showTrouble(String(e.reason?.message ?? e.reason)));

// ---------------------------------------------------------------- scene
const stage = $('stage');
if (!document.createElement('canvas').getContext('webgl2')) showTrouble('this browser has no WebGL 2, which the map needs to draw.');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe4');
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 100);

scene.add(new THREE.HemisphereLight('#fffaf0', '#8a7a66', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(2, 3, 2);
scene.add(sun);

// The acknowledgement that a finger has taken hold of the ground. It shows the
// moment the hold lands, before any work, so the player knows they were heard.
const holdRing = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1, 48),
  new THREE.MeshBasicMaterial({ color: '#c8541a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }),
);
holdRing.renderOrder = 2;
scene.add(holdRing);

// ---------------------------------------------------------------- state
const settings: WorldSettings = {
  height: { mode: 'radial', smoothing: 2, clip: 0.02 },
  bands: 22,
  surface: 'paper',
  displace: true,
  displaceScale: 0.12,
};

/** How the finger maps to the ground. Tuned by feel; see README. */
const TOUCH = {
  /** The brush is this many screen pixels across, so coming closer makes finer edits. */
  brushPx: 70,
  /** Height units pressed in per second of holding. */
  pressRate: 0.35,
  /** Height units raised per screen pixel pulled, at the default distance. */
  pullPerPx: 0.008,
  maxPull: 1.6,
};

let world: TerrainWorld | null = null;
let sourceGeometry: THREE.BufferGeometry | null = null;
let sourceMap: THREE.Texture | null = null;
let statsName = '';
let pace = 1;
try { pace = Number(localStorage.getItem('scan-to-world.pace')) || 1; } catch { /* private window */ }

function setWorld(geometry: THREE.BufferGeometry, map: THREE.Texture | null, name: string): void {
  if (world) {
    scene.remove(world.group);
    world.dispose();
  }
  sourceGeometry = geometry;
  sourceMap = map;
  statsName = name;
  const tris = triangleCount(geometry);
  if (tris > 60000) toast(`${name}: ${tris.toLocaleString()} triangles. Decimate in the drawer for smoother touch.`);

  // The object decides how its bumps become altitude, not a menu.
  const pos = geometry.attributes.position.array as ArrayLike<number>;
  const mode = chooseHeightMode(buildTopology(pos, geometry.index?.array ?? null));
  settings.height = { ...settings.height, mode, smoothing: mode === 'curvature' ? 6 : 2 };
  $<HTMLSelectElement>('height-mode').value = mode;
  $<HTMLInputElement>('smoothing').value = String(settings.height.smoothing);

  world = new TerrainWorld(geometry.clone(), map, { ...settings, height: { ...settings.height } }, facingPoint());
  world.setPace(pace);
  spin.set(0, 0);
  scene.add(world.group);
  updateStats();
  // For poking at in dev tools and in the browser checks; not in builds.
  if (import.meta.env.DEV) (window as unknown as { world: TerrainWorld }).world = world;
}

function updateStats(): void {
  if (!world) return;
  $('stats').textContent =
    `${statsName} · ${world.triangleCount.toLocaleString()} tris · ${world.topo.vertexCount.toLocaleString()} pts · ${world.lineCount} lines · ${world.settings.height.mode}`;
}

// ---------------------------------------------------------------- camera
const MIN_DIST = 1.35;
let homeDist = 4;
let dist = 4;

/** Far enough that the unit-radius object fits on narrow screens too. */
function frameObject(): void {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  homeDist = 1.25 / Math.sin(Math.min(vfov, hfov) / 2);
  dist = homeDist;
  placeCamera();
}

function placeCamera(): void {
  camera.position.set(0, 0.16, 1).setLength(dist);
  camera.lookAt(0, 0, 0);
}

/** World units per screen pixel at the object's surface. */
function worldPerPixel(): number {
  const d = Math.max(0.2, dist - 1);
  return (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / window.innerHeight;
}

/** The point of the object nearest the viewer: where a first plot begins. */
function facingPoint(): THREE.Vector3 {
  return camera.position.clone().setLength(1);
}

// ---------------------------------------------------------------- touch
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAt(x: number, y: number): THREE.Intersection | null {
  if (!world) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(world.mesh, false)[0] ?? null;
}

// Turning: angular velocity in radians per second about screen axes.
const spin = new THREE.Vector2();
const SPIN_PER_PX = 0.006;
const axisUp = new THREE.Vector3();
const axisRight = new THREE.Vector3();
const turn = new THREE.Quaternion();

/** Days per radian turned: a full turn is a day. */
const DAYS_PER_RADIAN = 1 / (2 * Math.PI);

function rotateWorld(ax: number, ay: number): void {
  if (!world) return;
  world.advance(Math.hypot(ax, ay) * DAYS_PER_RADIAN);
  axisUp.set(0, 1, 0);
  axisRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  turn.setFromAxisAngle(axisUp, ax);
  world.group.quaternion.premultiply(turn);
  turn.setFromAxisAngle(axisRight, ay);
  world.group.quaternion.premultiply(turn);
}

let held: { point: THREE.Vector3; normal: THREE.Vector3; radius: number; since: number } | null = null;
let flash: { point: THREE.Vector3; normal: THREE.Vector3; since: number; refused: boolean } | null = null;
let touched = false;

const gestures = new GestureRecognizer(
  {
    tap(x, y) {
      firstTouch();
      spin.set(0, 0);
      const hit = pickAt(x, y);
      // A tap on the paper round the world, not on it: bring your own scan.
      if (!hit?.face) { $<HTMLInputElement>('pick').click(); return; }
      if (!world) return;
      const r = world.tap(hit.point);
      // The ring answers every tap, refused or not, so a tap is never ignored.
      const normal = hit.face.normal.clone().transformDirection(world.mesh.matrixWorld);
      flash = { point: hit.point.clone(), normal, since: performance.now(), refused: r.kind === 'refused' };
    },
    spin(dx, dy) {
      firstTouch();
      spin.set(0, 0);
      rotateWorld(dx * SPIN_PER_PX, dy * SPIN_PER_PX);
    },
    fling(vx, vy) {
      spin.set(vx * SPIN_PER_PX, vy * SPIN_PER_PX);
    },
    zoom(factor) {
      firstTouch();
      dist = THREE.MathUtils.clamp(dist / factor, MIN_DIST, homeDist * 1.6);
      placeCamera();
    },
    grab(x, y) {
      firstTouch();
      const hit = pickAt(x, y);
      if (!hit?.face || !world) return;
      spin.set(0, 0);
      const normal = hit.face.normal.clone().transformDirection(world.mesh.matrixWorld);
      held = { point: hit.point.clone(), normal, radius: (TOUCH.brushPx * worldPerPixel()) / 2, since: performance.now() };
      world.grab(hit.point);
    },
    press(dt) {
      world?.pressIn(TOUCH.pressRate * dt, held?.radius ?? 0.15);
    },
    pull(px) {
      // Coming closer gives finer control, the same way it gives a finer brush.
      const perPx = TOUCH.pullPerPx * (worldPerPixel() / (worldAtHome || worldPerPixel()));
      world?.pullTo(Math.min(TOUCH.maxPull, px * perPx), held?.radius ?? 0.15);
    },
    release() {
      held = null;
      world?.letGo();
    },
    drawer: toggleDrawer,
  },
  (x, y) => !!pickAt(x, y),
);
let worldAtHome = 0;

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
});
stage.addEventListener('pointermove', (e) => gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp));
for (const type of ['pointerup', 'pointercancel'] as const) {
  stage.addEventListener(type, (e) => gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp));
}
stage.addEventListener('wheel', (e) => { e.preventDefault(); gestures.wheel(e.deltaY); }, { passive: false });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// Arrow keys turn the world, like a drag: each press pushes it round, and
// held keys keep it turning. Turning is time, so the days go by too.
const ARROW_PUSH = 2.2; // radians per second added per keypress (and per key repeat)
const ARROW_MAX = 5;
window.addEventListener('keydown', (e) => {
  if (e.key === '`') { toggleDrawer(); return; }
  const push: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = push[e.key];
  if (!d) return;
  e.preventDefault();
  firstTouch();
  spin.x = THREE.MathUtils.clamp(spin.x + d[0] * ARROW_PUSH, -ARROW_MAX, ARROW_MAX);
  spin.y = THREE.MathUtils.clamp(spin.y + d[1] * ARROW_PUSH, -ARROW_MAX, ARROW_MAX);
});

// A scan arrives by being dropped on the world, not through a button.
window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
window.addEventListener('dragleave', () => document.body.classList.remove('dropping'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dropping');
  const file = e.dataTransfer?.files?.[0];
  if (file) openScan(file);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function firstTouch(): void {
  if (touched) return;
  touched = true;
  $('hint').classList.add('gone');
}

// ---------------------------------------------------------------- drawer (tuning, not the product)
function toggleDrawer(): void {
  const panel = $('panel');
  panel.hidden = !panel.hidden;
}
$('panel-toggle').addEventListener('click', toggleDrawer);

async function openScan(file: File): Promise<void> {
  try {
    toast(`Loading ${file.name}…`);
    const scan = await loadScanFile(file);
    setWorld(scan.geometry, scan.map, scan.name);
    toast(`Loaded ${scan.name}`);
  } catch (err) {
    toast((err as Error).message);
  }
}

for (const id of ['file', 'pick']) {
  $<HTMLInputElement>(id).addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, file = input.files?.[0];
    input.value = ''; // so choosing the same file again still counts
    if (!file) return;
    if (!/\.(glb|gltf|obj|ply)$/i.test(file.name)) { toast(`${file.name} isn't a scan this can read: GLB, glTF, OBJ or PLY. (From Scaniverse, export GLB or OBJ.)`); return; }
    openScan(file);
  });
}

// Installable, and playable offline once opened. On Android a scan shared from
// another app arrives through the service worker and is opened here.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* not where one can be installed (a preview, say): play on regardless */ });
}
if (new URLSearchParams(location.search).has('shared') && 'caches' in window) {
  caches.open('stw-shared').then(async (c) => {
    const r = await c.match('./shared-scan');
    if (!r) return;
    const name = decodeURIComponent(r.headers.get('x-name') ?? 'shared.glb');
    await c.delete('./shared-scan');
    history.replaceState(null, '', location.pathname);
    openScan(new File([await r.blob()], name));
  }).catch(() => {});
}
$('demo').addEventListener('click', () => setWorld(normaliseGeometry(makeDemoOrange()), null, 'demo orange'));
$('decimate').addEventListener('click', () => {
  if (!sourceGeometry) return;
  const target = Number($<HTMLInputElement>('target-tris').value) || 15000;
  toast('Decimating…');
  decimate(sourceGeometry, target)
    .then((g) => {
      setWorld(g, sourceMap, statsName);
      toast(`Decimated to ${triangleCount(g).toLocaleString()} triangles`);
    })
    .catch((err: Error) => toast(`Decimation failed: ${err.message}`));
});
$<HTMLSelectElement>('height-mode').addEventListener('change', (e) => {
  settings.height.mode = (e.target as HTMLSelectElement).value as HeightMode;
  world?.setHeightOptions({ ...settings.height });
  updateStats();
});
$<HTMLInputElement>('smoothing').addEventListener('change', (e) => {
  settings.height.smoothing = Number((e.target as HTMLInputElement).value);
  world?.setHeightOptions({ ...settings.height });
  updateStats();
});
$<HTMLInputElement>('bands').addEventListener('change', (e) => {
  settings.bands = Number((e.target as HTMLInputElement).value);
  world?.setBands(settings.bands);
  updateStats();
});
$<HTMLSelectElement>('surface').addEventListener('change', (e) => {
  settings.surface = (e.target as HTMLSelectElement).value as SurfaceStyle;
  world?.setSurface(settings.surface);
});
$<HTMLInputElement>('displace').addEventListener('change', (e) => {
  settings.displace = (e.target as HTMLInputElement).checked;
  world?.setDisplace(settings.displace);
});
$('reset-edits').addEventListener('click', () => world?.resetEdits());
$('replay').addEventListener('click', () => world?.replay(facingPoint()));
$<HTMLInputElement>('pace').value = String(pace);
$<HTMLInputElement>('pace').addEventListener('input', (e) => {
  pace = Number((e.target as HTMLInputElement).value);
  world?.setPace(pace);
  try { localStorage.setItem('scan-to-world.pace', String(pace)); } catch { /* private window */ }
});

let toastTimer = 0;
function toast(msg: string): void {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3500);
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let lastStats = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const now = performance.now();
  gestures.tick(now, dt);

  if (world) {
    // Momentum, fading the way a spun globe does.
    if (spin.lengthSq() > 1e-6) {
      rotateWorld(spin.x * dt, spin.y * dt);
      spin.multiplyScalar(Math.exp(-2.2 * dt));
    }

    // The hold ring grows in as the finger takes hold, and stays while held.
    const mat = holdRing.material as THREE.MeshBasicMaterial;
    if (held) {
      const grow = Math.min(1, (now - held.since) / 180);
      holdRing.position.copy(held.point).addScaledVector(held.normal, 0.01);
      holdRing.lookAt(held.point.clone().add(held.normal));
      holdRing.scale.setScalar(held.radius * (0.6 + 0.4 * grow));
      mat.opacity = 0.75 * grow;
    } else if (flash) {
      // A tap: a small ring that opens and fades. Grey if the ground refused.
      const t = (now - flash.since) / 500;
      holdRing.position.copy(flash.point).addScaledVector(flash.normal, 0.01);
      holdRing.lookAt(flash.point.clone().add(flash.normal));
      holdRing.scale.setScalar(0.03 + 0.05 * Math.min(1, t));
      mat.color.set(flash.refused ? '#8a8578' : '#c8541a');
      mat.opacity = 0.8 * Math.max(0, 1 - t);
      if (t >= 1) { flash = null; mat.color.set('#c8541a'); }
    } else {
      mat.opacity = Math.max(0, mat.opacity - dt * 3);
    }

    // Calm is when nothing is being held and the world has nearly stopped:
    // that's when the pen comes to ink the town.
    const calm = !held && gestures.current !== 'spinning' && spin.length() < 0.6;
    world.update(dt, now, { rate: 30, fade: 0.15 }, camera, calm);
    if (now - lastStats > 500 && !$('panel').hidden) { lastStats = now; updateStats(); }
  }

  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- boot
frameObject();
worldAtHome = worldPerPixel();
setWorld(normaliseGeometry(makeDemoOrange()), null, 'demo orange');
