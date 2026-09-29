import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TerrainWorld, type SurfaceStyle, type WorldSettings } from './world';
import { decimate, loadScanFile, normaliseGeometry, triangleCount } from './mesh/load';
import { makeDemoOrange } from './demo/orange';
import type { Falloff } from './interact/sculpt';
import type { PropKind } from './interact/placement';
import type { HeightMode } from './terrain/heightfield';

type Mode = 'orbit' | 'sculpt' | 'place';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------------------------------------------------------- scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe4');
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0.6, 3.6);

scene.add(new THREE.HemisphereLight('#fffaf0', '#8a7a66', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(2, 3, 2);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.4;
controls.maxDistance = 8;

const brushRing = new THREE.Mesh(
  new THREE.RingGeometry(0.94, 1, 48),
  new THREE.MeshBasicMaterial({ color: '#c8541a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false }),
);
brushRing.renderOrder = 2;
brushRing.visible = false;
scene.add(brushRing);

// ---------------------------------------------------------------- state
const ui = {
  mode: 'sculpt' as Mode,
  direction: 1,
  falloff: 'gaussian' as Falloff,
  radius: 0.18,
  strength: 0.4,
};

const settings: WorldSettings = {
  height: { mode: 'radial', smoothing: 2, clip: 0.02 },
  bands: 22,
  surface: 'scan',
  displace: true,
  displaceScale: 0.12,
};

let world: TerrainWorld | null = null;
let sourceGeometry: THREE.BufferGeometry | null = null;
let sourceMap: THREE.Texture | null = null;

function setWorld(geometry: THREE.BufferGeometry, map: THREE.Texture | null, name: string): void {
  if (world) {
    scene.remove(world.group);
    world.dispose();
  }
  sourceGeometry = geometry;
  sourceMap = map;
  const tris = triangleCount(geometry);
  if (tris > 60000) {
    toast(`${name}: ${tris.toLocaleString()} triangles – decimate for smoother interaction.`);
  }
  world = new TerrainWorld(geometry.clone(), map, { ...settings, height: { ...settings.height } });
  world.placement.setKind(currentProp);
  scene.add(world.group);
  updateStats(name);
}

function updateStats(name?: string): void {
  if (!world) return;
  if (name) statsName = name;
  $('stats').textContent =
    `${statsName} · ${world.triangleCount.toLocaleString()} tris · ${world.topo.vertexCount.toLocaleString()} pts · ${world.lineCount} lines`;
}
let statsName = '';

// ---------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let sculpting = false;
let digModifier = false;
let downAt: { x: number; y: number } | null = null;

function setPointer(e: PointerEvent): void {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

function pick(): THREE.Intersection | null {
  if (!world) return null;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(world.mesh, false)[0] ?? null;
}

// Capture phase on the container so we decide before OrbitControls sees the event.
stage.addEventListener(
  'pointerdown',
  (e) => {
    setPointer(e);
    pointerInside = true;
    downAt = { x: e.clientX, y: e.clientY };
    if (ui.mode !== 'sculpt') return;
    const hit = pick();
    if (!hit) return; // off the object: let OrbitControls orbit
    sculpting = true;
    digModifier = e.shiftKey || e.button === 2;
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  },
  { capture: true },
);

stage.addEventListener('pointermove', (e) => {
  setPointer(e);
  pointerInside = true;
  if (sculpting) digModifier = e.shiftKey || digModifier;
});

stage.addEventListener('pointerleave', () => {
  pointerInside = false;
});

window.addEventListener('pointerup', (e) => {
  if (sculpting) {
    sculpting = false;
    controls.enabled = true;
  }
  // A click (not a drag) in place mode drops an object.
  if (ui.mode === 'place' && downAt && world && e.target === renderer.domElement) {
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved < 6) {
      setPointer(e);
      const hit = pick();
      if (hit) world.placement.place(hit);
    }
  }
  downAt = null;
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- UI wiring
let currentProp: PropKind = 'tree';

function segmented(id: string, attr: string, onPick: (value: string) => void): void {
  const root = $(id);
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    onPick(btn.dataset[attr]!);
  });
}

function setMode(mode: Mode): void {
  ui.mode = mode;
  document.body.classList.remove('mode-orbit', 'mode-sculpt', 'mode-place');
  document.body.classList.add(`mode-${mode}`);
  if (mode !== 'place') world?.placement.hover(null);
  brushRing.visible = false;
}

segmented('mode', 'mode', (m) => setMode(m as Mode));
segmented('direction', 'dir', (d) => (ui.direction = Number(d)));
segmented('prop', 'prop', (p) => {
  currentProp = p as PropKind;
  world?.placement.setKind(currentProp);
});

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    toast(`Loading ${file.name}…`);
    const scan = await loadScanFile(file);
    setWorld(scan.geometry, scan.map, scan.name);
    toast(`Loaded ${scan.name}`);
  } catch (err) {
    toast((err as Error).message);
  }
});

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
  // Curvature is noisy on raw scans; give it more smoothing by default.
  if (settings.height.mode === 'curvature' && settings.height.smoothing < 6) {
    settings.height.smoothing = 6;
    $<HTMLInputElement>('smoothing').value = '6';
  }
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

$<HTMLSelectElement>('falloff').addEventListener('change', (e) => {
  ui.falloff = (e.target as HTMLSelectElement).value as Falloff;
});
$<HTMLInputElement>('radius').addEventListener('input', (e) => (ui.radius = Number((e.target as HTMLInputElement).value)));
$<HTMLInputElement>('strength').addEventListener('input', (e) => (ui.strength = Number((e.target as HTMLInputElement).value)));
$<HTMLInputElement>('displace').addEventListener('change', (e) => {
  settings.displace = (e.target as HTMLInputElement).checked;
  world?.setDisplace(settings.displace);
});
$('reset-edits').addEventListener('click', () => world?.resetEdits());
$('clear-props').addEventListener('click', () => world?.placement.clear());
$('replay').addEventListener('click', () => world?.replay());
$('panel-toggle').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

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
const ringNormal = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const now = performance.now();
  controls.update();

  if (world) {
    const hit = pointerInside && ui.mode !== 'orbit' ? pick() : null;

    if (ui.mode === 'sculpt') {
      brushRing.visible = !!hit;
      if (hit?.face) {
        ringNormal.copy(hit.face.normal).transformDirection(world.mesh.matrixWorld);
        brushRing.position.copy(hit.point).addScaledVector(ringNormal, 0.004);
        brushRing.lookAt(hit.point.clone().add(ringNormal));
        brushRing.scale.setScalar(ui.radius);
      }
      if (sculpting && hit) {
        const sign = digModifier ? -ui.direction : ui.direction;
        world.brush(hit.point, { radius: ui.radius, strength: ui.strength * sign, falloff: ui.falloff }, dt);
      }
    } else if (ui.mode === 'place') {
      world.placement.hover(hit);
    }

    world.update(dt, now, { rate: 30, fade: 0.15 });
    updateStatsThrottled(now);
  }

  renderer.render(scene, camera);
});

let lastStats = 0;
function updateStatsThrottled(now: number): void {
  if (now - lastStats < 500) return;
  lastStats = now;
  updateStats();
}

// ---------------------------------------------------------------- boot
/** Pull the camera back far enough that the unit-radius object fits on narrow screens too. */
function frameObject(): void {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = 1.25 / Math.sin(Math.min(vfov, hfov) / 2);
  camera.position.set(0, 0.6, 3.6).setLength(dist);
}

if (window.innerWidth < 600) $('panel').classList.add('collapsed');
frameObject();
setMode('sculpt');
setWorld(normaliseGeometry(makeDemoOrange()), null, 'demo orange');
