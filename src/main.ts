import { SAVE, forgetUniverse, loadUniverse, saveUniverse, type Universe, type WorldSource } from './save';
import * as THREE from 'three';
import { TerrainWorld, type SurfaceStyle, type WorldSettings } from './world';
import { normaliseGeometry, triangleCount } from './mesh/geometry';
// The scan loaders and the simplifier are big and only wanted when a scan is opened: fetched then.
const loaders = () => import('./mesh/load');
import { makeDemoOrange } from './demo/orange';
import { SPECIMENS } from './demo/specimens';
import { ATLAS, SKY, chartLines, layout, magnitudeLines, segmentsWith, skyLimit, railwayCurve, railwayLines, segments as skySegments, sketchLines, trainAt, trainLines, unchartedLines, type Railway } from './atlas/atlas';
import { GestureRecognizer } from './interact/gestures';
import { buildTopology } from './mesh/topology';
import { chooseHeightMode, type HeightMode } from './terrain/heightfield';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** On one world, or looking at the atlas of all of them. */
let mode: 'world' | 'atlas' = 'world';

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
// Sized to the stage as laid out, not to the window as first reported: an
// iPhone opened from the home screen reports half its height at first, and
// the world was drawn in the top half only.
const view = () => ({ w: Math.max(1, stage.clientWidth || window.innerWidth), h: Math.max(1, stage.clientHeight || window.innerHeight) });
renderer.setSize(view().w, view().h, false);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
/** The page a world is drawn on, and the atlas's chart of the heavens: the same paper a
 *  shade warmer, as a different sheet from the same stock. Plain: no stains, no foxing. */
const PAGE = new THREE.Color('#f4efe4'), AGED = new THREE.Color('#ebdfc6');
scene.background = PAGE.clone();
const camera = new THREE.PerspectiveCamera(40, view().w / view().h, 0.01, 100);

// Paper light: even, as a printed globe is lit, with only a breath of shade for its roundness,
// from the upper left as an engraver shades. Strong light and dark undersides were a game's.
scene.add(new THREE.HemisphereLight('#fffaf0', '#efe7d6', 2.3));
const sun = new THREE.DirectionalLight('#ffffff', 0.55);
sun.position.set(-2, 3, 2.5);
scene.add(sun);

// The acknowledgement that a finger has taken hold of the ground. It shows the
// moment the hold lands, before any work, so the player knows they were heard.
/** The answer to a touch, in the map's own ink: a fine ring while held, a ripple for a tap. */
const TOUCH_INK = '#2e2118', PENCIL = '#8a8578';
const holdRing = new THREE.Mesh(
  new THREE.RingGeometry(0.95, 1, 64),
  new THREE.MeshBasicMaterial({ color: TOUCH_INK, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }),
);
holdRing.renderOrder = 2;
scene.add(holdRing);
/** A tap's ripple: three fine rings opening one after another, as a drop spreads on water. */
const ripple = new THREE.Group();
for (let i = 0; i < 3; i++) {
  ripple.add(new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64),
    new THREE.MeshBasicMaterial({ color: TOUCH_INK, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false }),
  ));
}
ripple.renderOrder = 2;
ripple.children.forEach((m) => { m.renderOrder = 2; });
scene.add(ripple);

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

/** Every world made, by name: going back to one finds it as it was left. Kept between visits (save.ts). */
const kept = new Map<string, TerrainWorld>();
/** Where each world's shape came from, to make it again when the universe is brought back. */
const sources = new Map<string, WorldSource>();

/** Go to a world already made, if there is one of this name. */
function returnTo(name: string): boolean {
  const w = kept.get(name);
  if (!w) return false;
  if (world) scene.remove(world.group);
  world = w;
  statsName = name;
  spin.set(0, 0);
  scene.add(world.group);
  updateStats();
  if (import.meta.env.DEV) (window as unknown as { world: TerrainWorld }).world = world;
  return true;
}

function setWorld(geometry: THREE.BufferGeometry, map: THREE.Texture | null, name: string, heightMode?: HeightMode, source?: WorldSource): void {
  if (world) {
    if (mode === 'world') scene.remove(world.group);
    // A world kept to come back to isn't thrown away; one being remade (decimated, say) is.
    if (kept.get(name) === world) { kept.delete(name); world.dispose(); }
  }
  sourceGeometry = geometry;
  sourceMap = map;
  statsName = name;
  const tris = triangleCount(geometry);
  if (tris > 60000) toast(`${name}: ${tris.toLocaleString()} triangles. Decimate in the drawer for smoother touch.`);

  // The object decides how its bumps become altitude, not a menu.
  const pos = geometry.attributes.position.array as ArrayLike<number>;
  const chosen = heightMode ?? chooseHeightMode(buildTopology(pos, geometry.index?.array ?? null));
  settings.height = { ...settings.height, mode: chosen, smoothing: chosen === 'curvature' ? 6 : 2 };
  $<HTMLSelectElement>('height-mode').value = chosen;
  $<HTMLInputElement>('smoothing').value = String(settings.height.smoothing);

  world = new TerrainWorld(geometry.clone(), map, { ...settings, height: { ...settings.height } }, facingPoint());
  kept.set(name, world);
  sources.set(name, source ?? scanSource(geometry));
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
/**
 * How close you can come, as a share of the distance the whole world is seen from. Never
 * near enough to make out what a development is, only its extent and how dense it is: the
 * rest is for the imagination (STYLE.md).
 */
const CLOSEST = 0.6;
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

/** What the camera looks at: the world's middle, or in the atlas a place on the chart. */
const focus = new THREE.Vector3();
function placeCamera(): void {
  camera.position.set(0, mode === 'atlas' ? 0.05 : 0.16, 1).setLength(dist).add(focus);
  camera.lookAt(focus);
}

/** World units per screen pixel at the object's surface. */
function worldPerPixel(): number {
  const d = Math.max(0.2, dist - 1);
  return (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / view().h;
}

/** The point of the object nearest the viewer: where a first plot begins. */
function facingPoint(): THREE.Vector3 {
  return camera.position.clone().setLength(1);
}

// ---------------------------------------------------------------- touch
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAt(x: number, y: number): THREE.Intersection | null {
  if (!world || mode !== 'world' || flight) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(world.mesh, false)[0] ?? null;
}

// Turning: angular velocity in radians per second about screen axes.
const spin = new THREE.Vector2();
const SPIN_PER_PX = 0.006;

/** Days per radian turned: a full turn is a day. */
const DAYS_PER_RADIAN = 1 / (2 * Math.PI);

/**
 * The world turns freely, any way you drag it: round the screen's up for a sideways drag,
 * round its right for an up-and-down one, so it can be seen from any angle.
 */
const axisUp = new THREE.Vector3();
const axisRight = new THREE.Vector3();
const turn = new THREE.Quaternion();
function rotateWorld(ax: number, ay: number): void {
  if (!world || mode !== 'world') return;
  world.advance(Math.hypot(ax, ay) * DAYS_PER_RADIAN);
  axisUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
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
      if (mode === 'atlas') { atlasTap(x, y); return; }
      if (flight) return;
      const hit = pickAt(x, y);
      // A tap on the paper round the world, not on it: the cabinet of specimens.
      if (!hit?.face) { openCabinet(); return; }
      if (!world) return;
      const r = world.tap(hit.point);
      // The ring answers every tap, refused or not, so a tap is never ignored.
      const normal = hit.face.normal.clone().transformDirection(world.mesh.matrixWorld);
      flash = { point: hit.point.clone(), normal, since: performance.now(), refused: r.kind === 'refused' };
    },
    spin(dx, dy) {
      firstTouch();
      spin.set(0, 0);
      if (mode === 'atlas') { atlasDrag(dx, dy); return; }
      rotateWorld(dx * SPIN_PER_PX, dy * SPIN_PER_PX);
    },
    fling(vx, vy) {
      if (mode === 'atlas') { atlasDragEnd(); return; }
      spin.set(vx * SPIN_PER_PX, vy * SPIN_PER_PX);
    },
    zoom(factor) {
      firstTouch();
      if (flight) return;
      if (mode === 'atlas') { atlasZoom(factor); return; }
      // Pinched out as far as the world goes, and further: the atlas.
      if (factor < 0.985 && dist >= homeDist * 1.58) { enterAtlas(); return; }
      dist = THREE.MathUtils.clamp(dist / factor, homeDist * CLOSEST, homeDist * 1.6);
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

/** Where the finger went down, and where it is: the atlas needs to know what a drag began on. */
const finger = { downX: 0, downY: 0, x: 0, y: 0 };
stage.addEventListener('pointerdown', (e) => {
  finger.downX = finger.x = e.clientX; finger.downY = finger.y = e.clientY;
  atlasDragKind = null;
  gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
});
stage.addEventListener('pointermove', (e) => { finger.x = e.clientX; finger.y = e.clientY; gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
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

function fit(): void {
  const { w, h } = view();
  const now = renderer.getSize(new THREE.Vector2());
  if (now.x === w && now.y === h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
window.visualViewport?.addEventListener('resize', fit);
new ResizeObserver(fit).observe(stage);

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
    const scan = await (await loaders()).loadScanFile(file);
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
  loaders().then((m) => m.decimate(sourceGeometry!, target))
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

  flying(dt);
  ageing(dt);
  atlasFrame(dt, now);
  if (world && mode === 'world') {
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
    } else {
      mat.opacity = Math.max(0, mat.opacity - dt * 3);
    }
    if (flash) {
      // A tap: fine ink rings opening one after another and fading, as a drop spreads.
      // Refused, one pencil ring that closes instead: the ground would not take it.
      const t = (now - flash.since) / 1100;
      ripple.position.copy(flash.point).addScaledVector(flash.normal, 0.01);
      ripple.lookAt(flash.point.clone().add(flash.normal));
      ripple.children.forEach((m, i) => {
        const rm = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (flash!.refused) {
          rm.color.set(PENCIL);
          m.scale.setScalar(0.05 * (1 - 0.5 * Math.min(1, t)));
          rm.opacity = i === 0 ? 0.7 * Math.max(0, 1 - t) : 0;
          return;
        }
        rm.color.set(TOUCH_INK);
        const u = THREE.MathUtils.clamp(t * 1.4 - i * 0.2, 0, 1);
        m.scale.setScalar(0.012 + 0.07 * Math.sqrt(u));
        rm.opacity = u > 0 ? 0.65 * (1 - u) : 0;
      });
      if (t >= 1) flash = null;
    } else {
      ripple.children.forEach((m) => { ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0; });
    }

    // Calm is when nothing is being held and the world has nearly stopped:
    // that's when the pen comes to ink the town.
    const calm = !held && gestures.current !== 'spinning' && spin.length() < 0.6;
    world.update(dt, now, { rate: 30, fade: 0.15 }, camera, calm);
    for (const w of scene.children) if (w !== world.group) for (const k of kept.values()) if (k.group === w) k.update(dt, now, { rate: 30, fade: 0.15 }, camera, true);
    if (now - lastStats > 500 && !$('panel').hidden) { lastStats = now; updateStats(); }
  }

  renderer.render(scene, camera);
});

// ---------------------------------------------------------------- boot
frameObject();
worldAtHome = worldPerPixel();
setWorld(normaliseGeometry(makeDemoOrange()), null, SPECIMENS[0].caption, undefined, { kind: 'specimen', caption: SPECIMENS[0].caption });
bringBack();

// ---------------------------------------------------------------- the cabinet of specimens
// Tap the paper round the world and a plate of specimens opens, as in an old
// natural history: each a world to go to, and a last place for your own scan.
// A world left is kept as it was.
const figures = new Map<string, HTMLImageElement>();
let plateBuilt = false;
function openCabinet(): void {
  const cabinet = $('cabinet');
  if (!plateBuilt) {
    plateBuilt = true;
    const grid = $('figures');
    const numeral = (i: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] ?? String(i + 1);
    SPECIMENS.forEach((sp, i) => {
      const fig = document.createElement('button');
      fig.className = 'fig';
      const img = document.createElement('img');
      img.alt = sp.caption;
      figures.set(sp.id, img);
      const cap = document.createElement('span');
      cap.innerHTML = `<i>Fig. ${numeral(i)}.</i> ${sp.caption}`;
      fig.append(img, cap);
      fig.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCabinet();
        if (!returnTo(sp.caption)) setWorld(normaliseGeometry(sp.make()), null, sp.caption, sp.mode, { kind: 'specimen', caption: sp.caption });
        toast(sp.caption);
      });
      grid.append(fig);
    });
    const own = document.createElement('button');
    own.className = 'fig own';
    own.innerHTML = `<span class="blank">?</span><span><i>Fig. ${numeral(SPECIMENS.length)}.</i> Your own specimen</span>`;
    own.addEventListener('click', (e) => { e.stopPropagation(); closeCabinet(); $<HTMLInputElement>('pick').click(); });
    grid.append(own);
    // Starting over: the one way to let the kept universe go. A second tap is asked for,
    // since nothing brings it back.
    const forget = document.createElement('button');
    forget.className = 'forget';
    forget.textContent = 'Begin a new atlas';
    let armed = 0;
    forget.addEventListener('click', (e) => {
      e.stopPropagation();
      if (performance.now() - armed > 4000) { armed = performance.now(); forget.textContent = 'Tap again to let every world go'; return; }
      forgetting = true;
      forgetUniverse().then(() => location.reload());
    });
    $('cabinet').querySelector('.plate')!.append(forget);
    // Not the very tap that opened it: a phone sends that tap on as a click, onto the plate's backdrop.
    cabinet.addEventListener('click', (e) => { if (e.target === cabinet && performance.now() - openedAt > 450) closeCabinet(); });
    // Engrave the figures after the plate is up, one at a time, so it opens at once.
    let n = 0;
    const next = () => {
      const sp = SPECIMENS[n++];
      if (!sp) return;
      figures.get(sp.id)!.src = engrave(sp.make());
      setTimeout(next, 30);
    };
    setTimeout(next, 60);
  }
  cabinet.hidden = false;
  openedAt = performance.now();
}
let openedAt = 0;
function closeCabinet(): void {
  $('cabinet').hidden = true;
}

/** A specimen's figure for the plate: rendered small, in the paper's light, three-quarter view. */
let engraver: THREE.WebGLRenderer | null = null;
function engrave(geometry: THREE.BufferGeometry): string {
  const g = normaliseGeometry(geometry);
  engraver ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  engraver.setPixelRatio(2);
  engraver.setSize(150, 120, false);
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight('#fffaf0', '#6d5a44', 1.5));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(-2, 3, 2);
  s.add(sun);
  const colours = g.attributes.color;
  if (colours) {
    const paper = new THREE.Color('#ecdfc2'), c = new THREE.Color();
    for (let i = 0; i < colours.count; i++) { c.fromBufferAttribute(colours as THREE.BufferAttribute, i).lerp(paper, 0.35); colours.setXYZ(i, c.r, c.g, c.b); }
  }
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: !!colours, color: colours ? '#ffffff' : '#e6d3b0', roughness: 0.85 }));
  mesh.rotation.set(0.45, -0.6, 0.1);
  s.add(mesh);
  const cam = new THREE.PerspectiveCamera(30, 150 / 120, 0.1, 20);
  cam.position.set(0, 0, 4.2);
  engraver.render(s, cam);
  const url = engraver.domElement.toDataURL('image/png');
  g.dispose();
  (mesh.material as THREE.Material).dispose();
  return url;
}

// ---------------------------------------------------------------- the atlas
// Pinch out past a world and the atlas opens: every world you have made, laid
// out on one celestial chart, and the specimens not yet made as uncharted
// places. Tap a world to go to it; tap an uncharted place to make it. Drag
// from one world to another to lay a celestial railway between them.
const railways: Railway[] = [];
let slots = new Map<string, THREE.Vector3>();
let flight: { f0: THREE.Vector3; f1: THREE.Vector3; d0: number; d1: number; t: number; dur: number; arrive?: () => void } | null = null;
let atlasDragKind: 'pan' | 'rail' | null = null;
let sketchFrom: string | null = null;
let seconds = 0;
const INK = '#2e2118';
const sky = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.9, depthWrite: false }));
const chart = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#8a7358', transparent: true, opacity: 0.0, depthWrite: false }));
/**
 * Ink that shows only where brighter than the sky's limit (`aValue` per line): the light of
 * the universe washes out the faintest stars first (SKY in atlas.ts). For the stars, and for
 * the constellations' lines, which go with the fainter of their two stars.
 */
function skyInk(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uInk: { value: new THREE.Color(INK) }, uOpacity: { value: 0 }, uLimit: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aValue;
      varying float vSeen;
      uniform float uLimit;
      void main() {
        vSeen = smoothstep(uLimit, uLimit + 0.06, aValue);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      uniform float uOpacity;
      varying float vSeen;
      void main() {
        if (vSeen <= 0.0) discard;
        gl_FragColor = vec4(uInk, uOpacity * vSeen);
        #include <colorspace_fragment>
      }`,
  });
}
const stars = new THREE.LineSegments(new THREE.BufferGeometry(), skyInk());
/** Where others keep dark: seen only on the quietest nights. */
const others = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.0, depthWrite: false }));
others.frustumCulled = false;
/** How loud the universe is just now: what its people have built lately. It settles in real time. */
let loud = 0;
/** The sky's limit as shown, easing towards what the loudness says. */
let limit = 0;
const housesSeen = new Map<TerrainWorld, number>();
const figuresOfStars = new THREE.LineSegments(new THREE.BufferGeometry(), skyInk());
sky.frustumCulled = chart.frustumCulled = stars.frustumCulled = figuresOfStars.frustumCulled = false;
/** Each world's magnitude on the chart: rays round it for how much its people have built. */
const magnitudes = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.0, depthWrite: false }));
magnitudes.frustumCulled = false;
let magnitudeKey = '';
scene.add(sky, chart, stars, figuresOfStars, magnitudes, others);
/** How far the page has aged into the atlas's paper: 0 on a world, 1 on the chart. */
let aged = 0;
let leaving = false;
/** How strong each part of the chart is inked, once the page has fully aged. */
const CHART_INK = { rule: 0.5, stars: 0.85, figures: 0.2, magnitudes: 0.8, others: 0.55 };

const ghosts = new THREE.Group();
scene.add(ghosts);
/** How the worlds are turned in the atlas, so each railway's stations face along it. */
const facingTo = new Map<TerrainWorld, THREE.Quaternion>();

function atlasNames(): string[] {
  const names = SPECIMENS.map((s) => s.caption);
  for (const k of kept.keys()) if (!names.includes(k)) names.push(k);
  return names;
}

function chartCentre(): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const p of slots.values()) c.add(p);
  return c.divideScalar(Math.max(1, slots.size));
}

function atlasDistance(): number {
  const c = chartCentre();
  let r = 0;
  for (const p of slots.values()) r = Math.max(r, p.distanceTo(c));
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  return (r + 1.4) / Math.tan(Math.min(vfov, hfov) / 2);
}

function flyTo(f1: THREE.Vector3, d1: number, dur: number, arrive?: () => void): void {
  flight = { f0: focus.clone(), f1: f1.clone(), d0: dist, d1, t: 0, dur, arrive };
}

function flying(dt: number): void {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / flight.dur);
  const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
  focus.lerpVectors(flight.f0, flight.f1, e);
  dist = flight.d0 + (flight.d1 - flight.d0) * e;
  placeCamera();
  if (flight.t >= 1) { const done = flight.arrive; flight = null; done?.(); }
}

/** Where each world sits relative to the one you are on (in a world) or on the chart (in the atlas). */
function placeWorlds(): void {
  const here = mode === 'world' ? slots.get(statsName) ?? new THREE.Vector3() : new THREE.Vector3();
  for (const [name, w] of kept) w.group.position.copy(slots.get(name) ?? new THREE.Vector3()).sub(here);
}

function enterAtlas(): void {
  if (!world) return;
  slots = layout(atlasNames());
  const here = slots.get(statsName)!;
  mode = 'atlas';
  placeWorlds();
  for (const w of kept.values()) if (!scene.children.includes(w.group)) scene.add(w.group);
  // The world you were on is at its place on the chart now, and so is the camera: nothing jumps.
  focus.copy(here);
  placeCamera();
  drawChart();
  orientForRailways();
  flyTo(chartCentre(), atlasDistance(), 1.4);
  $('hint').classList.remove('gone');
  $('hint').textContent = 'tap a world to go there · tap a dotted place to make a new world · drag from one world to another to lay a railway · pinch in to go back';
}

function leaveAtlasFor(name: string): void {
  const at = slots.get(name);
  if (!at) return;
  leaving = true;
  flyTo(at, homeDist, 1.2, () => {
    leaving = false;
    returnTo(name);
    mode = 'world';
    for (const w of kept.values()) if (w !== world) scene.remove(w.group);
    placeWorlds();
    focus.set(0, 0, 0);
    placeCamera();
    ghosts.clear();
    $('hint').classList.add('gone');
  });
}

/** The chart's graticule and stars, and the uncharted places, each with the figure of what it will be. */
function drawChart(): void {
  const c = chartCentre();
  let r = 0;
  for (const p of slots.values()) r = Math.max(r, p.distanceTo(c));
  const drawing = chartLines(c, r + ATLAS.spacing, [...slots.values()]);
  const lines = drawing.rule;
  ghosts.clear();
  for (const [name, at] of slots) {
    if (kept.has(name)) continue;
    lines.push(...unchartedLines(at));
    const src = SPECIMENS.find((s) => s.caption === name);
    const img = src ? figures.get(src.id)?.src : undefined;
    if (img) {
      const tex = new THREE.TextureLoader().load(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
      sprite.position.copy(at);
      sprite.scale.set(1.7, 1.36, 1);
      ghosts.add(sprite);
    }
  }
  chart.geometry.dispose();
  chart.geometry = skySegments(lines);
  stars.geometry.dispose();
  stars.geometry = segmentsWith(drawing.stars, drawing.starBright);
  others.geometry.dispose();
  others.geometry = skySegments(drawing.others);
  figuresOfStars.geometry.dispose();
  figuresOfStars.geometry = segmentsWith(drawing.figures, drawing.figureBright);
}

/** The page ages into the chart's paper as you rise into the atlas, and back as you go down to a world. */
function ageing(dt: number): void {
  const want = mode === 'atlas' && !leaving ? 1 : 0;
  aged += (want - aged) * (1 - Math.exp(-3 * dt));
  if (Math.abs(want - aged) < 1e-3) aged = want;
  (scene.background as THREE.Color).lerpColors(PAGE, AGED, aged);
  (chart.material as THREE.LineBasicMaterial).opacity = CHART_INK.rule * aged;
  for (const [m, ink] of [[stars, CHART_INK.stars], [figuresOfStars, CHART_INK.figures]] as const) {
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uOpacity.value = ink * aged;
    u.uLimit.value = limit;
  }
  (others.material as THREE.LineBasicMaterial).opacity = CHART_INK.others * aged * (1 - THREE.MathUtils.smoothstep(limit, SKY.others * 0.5, SKY.others));
  others.visible = aged > 0 && limit < SKY.others;
  (magnitudes.material as THREE.LineBasicMaterial).opacity = CHART_INK.magnitudes * aged;
  chart.visible = stars.visible = figuresOfStars.visible = magnitudes.visible = aged > 0;
}

/** Turn each world with a railway so its station faces along the line, a little towards you. */
function orientForRailways(): void {
  facingTo.clear();
  for (const rw of railways) {
    for (const [me, other, station] of [[rw.a, rw.b, rw.stationA], [rw.b, rw.a, rw.stationB]] as [string, string, number][]) {
      const w = kept.get(me);
      if (!w || facingTo.has(w)) continue;
      const toward = (slots.get(other) ?? new THREE.Vector3()).clone().sub(slots.get(me) ?? new THREE.Vector3()).normalize();
      const want = toward.multiplyScalar(0.7).add(new THREE.Vector3(0, 0, 0.55)).normalize();
      const up = w.surfaceAt(station).up;
      facingTo.set(w, new THREE.Quaternion().setFromUnitVectors(up, want).multiply(w.group.quaternion));
    }
  }
}

/** Which place on the chart is under the finger: a world, or an uncharted place. */
function slotAt(x: number, y: number): string | null {
  const r = renderer.domElement.getBoundingClientRect();
  let best: string | null = null, bd = Infinity;
  for (const [name, at] of slots) {
    const c = at.clone().project(camera), e = at.clone().add(new THREE.Vector3(1, 0, 0)).project(camera);
    const px = ((c.x + 1) / 2) * r.width + r.left, py = ((1 - c.y) / 2) * r.height + r.top;
    const rad = Math.abs(((e.x - c.x) / 2) * r.width) * 1.1;
    const d = Math.hypot(x - px, y - py);
    if (d < rad && d < bd) { bd = d; best = name; }
  }
  return best;
}

/** Make an uncharted place's world, where it is on the chart. */
function chart_(name: string): TerrainWorld | null {
  if (kept.has(name)) return kept.get(name)!;
  const sp = SPECIMENS.find((s) => s.caption === name);
  if (!sp) return null;
  const was = world;
  setWorld(normaliseGeometry(sp.make()), null, sp.caption, sp.mode, { kind: 'specimen', caption: sp.caption });
  const made = world!;
  made.group.position.copy(slots.get(name)!);
  if (was && mode === 'atlas') { world = was; statsName = [...kept].find(([, w]) => w === was)?.[0] ?? statsName; }
  drawChart();
  return made;
}

function atlasTap(x: number, y: number): void {
  if (flight) return;
  const name = slotAt(x, y);
  if (!name) return;
  if (!kept.has(name)) chart_(name);
  leaveAtlasFor(name);
}

function screenToChart(x: number, y: number): THREE.Vector3 {
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize();
  const t = -camera.position.z / dir.z;
  return camera.position.clone().addScaledVector(dir, t);
}

function atlasDrag(dx: number, dy: number): void {
  if (flight) return;
  if (!atlasDragKind) {
    const from = slotAt(finger.downX, finger.downY);
    atlasDragKind = from && kept.has(from) ? 'rail' : 'pan';
    sketchFrom = atlasDragKind === 'rail' ? from : null;
  }
  if (atlasDragKind === 'pan') {
    const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / view().h;
    focus.x -= dx * perPx;
    focus.y += dy * perPx;
    placeCamera();
  }
}

function atlasDragEnd(): void {
  if (atlasDragKind === 'rail' && sketchFrom) {
    const to = slotAt(finger.x, finger.y);
    if (to && to !== sketchFrom) {
      chart_(to);
      layRailway(sketchFrom, to);
    }
  }
  atlasDragKind = null;
  sketchFrom = null;
}

function atlasZoom(factor: number): void {
  const far = atlasDistance();
  // Pinched in far enough: down into the world nearest the middle of the screen.
  if (factor > 1.015 && dist <= far * 0.42) {
    const r = renderer.domElement.getBoundingClientRect();
    const name = slotAt(r.left + r.width / 2, r.top + r.height / 2) ?? [...slots].filter(([n]) => kept.has(n)).sort((a, b) => a[1].distanceTo(focus) - b[1].distanceTo(focus))[0]?.[0];
    if (name) { if (!kept.has(name)) chart_(name); leaveAtlasFor(name); }
    return;
  }
  dist = THREE.MathUtils.clamp(dist / factor, far * 0.4, far * 1.6);
  placeCamera();
}

/**
 * A celestial railway from one world to another. Each end needs a station: at
 * a town facing the other world if there is one, and if there isn't, the
 * railway's first passengers found one.
 */
function layRailway(a: string, b: string): void {
  if (railways.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return;
  const A = kept.get(a), B = kept.get(b);
  if (!A || !B) return;
  const station = (w: TerrainWorld, toward: THREE.Vector3): number => {
    let best = -1, bd = -Infinity;
    for (const t of w.settlements.towns) {
      const d = w.surfaceAt(t.centre).up.dot(toward);
      if (d > bd) { bd = d; best = t.centre; }
    }
    if (best >= 0 && bd > -0.2) return best;
    const v = w.facing(toward);
    const r = w.welcome(v);
    return r.kind === 'founded' ? w.settlements.towns[w.settlements.towns.length - 1].centre : v;
  };
  const dir = (slots.get(b) ?? new THREE.Vector3()).clone().sub(slots.get(a) ?? new THREE.Vector3()).normalize();
  railways.push({ a, b, stationA: station(A, dir), stationB: station(B, dir.clone().negate()), born: seconds, trips: 0 });
  orientForRailways();
}

// For the browser checks: where each place on the chart is on the screen. Not in builds.
if (import.meta.env.DEV) (window as unknown as { atlas: unknown }).atlas = {
  screen(name: string) {
    const at = slots.get(name);
    if (!at) return null;
    const r = renderer.domElement.getBoundingClientRect(), c = at.clone().project(camera);
    return [((c.x + 1) / 2) * r.width + r.left, ((1 - c.y) / 2) * r.height + r.top];
  },
  get mode() { return mode; },
  get railways() { return railways.map((x) => ({ a: x.a, b: x.b, trips: x.trips })); },
  get current() { return statsName; },
  get worlds() { return [...kept.keys()]; },
  get loud() { return loud; },
  set loud(v: number) { loud = v; limit = skyLimit(v); },
};

/** Every frame: the worlds turning to face their railways, the railways and their trains, the pencilled line being laid. */
function atlasFrame(dt: number, now: number): void {
  seconds += dt;
  // The universe's loudness: every house built adds to it, and it settles away in real time.
  // A world first seen (made, or brought back) adds nothing: only what is built from then on.
  for (const w of kept.values()) {
    const n = w.settlements.buildings.length, had = housesSeen.get(w);
    if (had !== undefined && n > had) loud += n - had;
    housesSeen.set(w, n);
  }
  loud *= Math.exp(-dt / SKY.settle);
  limit += (skyLimit(loud) - limit) * (1 - Math.exp(-dt / 2.5));
  void now;
  if (mode === 'atlas') for (const [w, q] of facingTo) w.group.quaternion.slerp(q, 1 - Math.exp(-3 * dt));
  if (mode === 'atlas') {
    // Redrawn only when a world's people have built more (a train's settlers, say).
    const houses = (w: TerrainWorld) => w.settlements.buildings.filter((b) => !b.farm && b.state === undefined).length;
    const key = [...kept].map(([n, w]) => `${n}:${houses(w)}`).join('|');
    if (key !== magnitudeKey) {
      magnitudeKey = key;
      magnitudes.geometry.dispose();
      magnitudes.geometry = skySegments([...kept].flatMap(([n, w]) => magnitudeLines(slots.get(n) ?? w.group.position, houses(w))));
    }
  }
  const lines: THREE.Vector3[][] = [];
  for (const rw of railways) {
    const A = kept.get(rw.a), B = kept.get(rw.b);
    if (!A || !B) continue;
    A.group.updateMatrixWorld(); B.group.updateMatrixWorld();
    const ea = A.surfaceAt(rw.stationA), eb = B.surfaceAt(rw.stationB);
    const curve = railwayCurve(ea, eb);
    const growth = (seconds - rw.born) / 3;
    // Its details drawn to the eye, not to the world: a train the size of a house can't be seen from the chart.
    const scale = THREE.MathUtils.clamp(dist / 5, 1, 6);
    lines.push(...railwayLines(curve, A.group.position, B.group.position, camera.position, growth, scale));
    if (growth < 1) continue;
    const phase = (rw.a.length * 7 + rw.b.length * 3) % 10 / 10;
    const tr = trainAt(curve, seconds - rw.born - 3, phase);
    lines.push(...trainLines(curve, tr.t, camera.position, scale, tr.dir));
    // Each time it comes in, it brings settlers to that end.
    if (tr.arrivals > rw.trips) {
      rw.trips = tr.arrivals;
      const atB = tr.t > 0.5;
      (atB ? B : A).welcome(atB ? rw.stationB : rw.stationA);
    }
  }
  if (mode === 'atlas' && atlasDragKind === 'rail' && sketchFrom) {
    lines.push(...sketchLines(slots.get(sketchFrom)!, screenToChart(finger.x, finger.y)));
  }
  sky.geometry.dispose();
  sky.geometry = skySegments(lines);
}


// ---------------------------------------------------------------- keeping the universe
// Every world, what grew on it, the railways and where you were are kept on the
// device (save.ts), and brought back when the page opens again.

let forgetting = false;
let keptKey = '';
let keeping = false;

/** A scan's own geometry, kept as it was normalised, so its topology comes back vertex for vertex. */
function scanSource(g: THREE.BufferGeometry): WorldSource {
  const pos = g.getAttribute('position').array as ArrayLike<number>;
  const col = g.getAttribute('color');
  return {
    kind: 'scan',
    position: Float32Array.from(pos),
    index: g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : null,
    color: col ? Float32Array.from(col.array as ArrayLike<number>) : null,
  };
}

function geometryOf(src: WorldSource): { geometry: THREE.BufferGeometry; mode?: HeightMode } | null {
  if (src.kind === 'specimen') {
    const sp = SPECIMENS.find((x) => x.caption === src.caption);
    return sp ? { geometry: normaliseGeometry(sp.make()), mode: sp.mode } : null;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(src.position, 3));
  if (src.index) g.setIndex(new THREE.BufferAttribute(src.index, 1));
  if (src.color) g.setAttribute('color', new THREE.BufferAttribute(src.color, 3));
  return { geometry: g };
}

/** What has changed since the universe was last kept, as one string: kept again only if it differs. */
function universeKey(): string {
  return [...kept].map(([n, w]) => `${n}:${w.group.quaternion.toArray().map((x) => x.toFixed(2)).join(',')}:${w.settlements.day.toFixed(2)}:${w.settlements.buildings.length}:${w.country.signature()}:${w.editVersion}`).join('|')
    + `|${railways.map((r) => `${r.a}-${r.b}:${r.trips}`).join(',')}|${statsName}`;
}

async function keepUniverse(force = false): Promise<void> {
  if (forgetting || keeping || !kept.size) return;
  const key = universeKey();
  if (!force && key === keptKey) return;
  keeping = true;
  try {
    const u: Universe = {
      version: SAVE.version,
      savedAt: Date.now(),
      current: statsName,
      worlds: [...kept].filter(([n]) => sources.has(n)).map(([name, w]) => ({ name, source: sources.get(name)!, heightMode: w.settings.height.mode, state: w.snapshot(), turn: w.group.quaternion.toArray() })),
      // Kept by age, not by this visit's clock: brought back, a train is where it was, and owes no arrivals.
      railways: railways.map((r) => ({ ...r, born: r.born - seconds })),
    };
    if (await saveUniverse(u)) keptKey = key;
  } finally {
    keeping = false;
  }
}

/** Bring back the kept universe, if there is one, in place of the fresh world the page opened with. */
async function bringBack(): Promise<void> {
  const u = await loadUniverse();
  if (!u) { keptKey = universeKey(); return; }
  try {
    for (const w of kept.values()) { scene.remove(w.group); w.dispose(); }
    kept.clear();
    sources.clear();
    world = null;
    for (const saved of u.worlds) {
      const made = geometryOf(saved.source);
      if (!made) continue;
      setWorld(made.geometry, null, saved.name, (saved.heightMode as HeightMode) ?? made.mode, saved.source);
      world!.restore(saved.state);
      if (saved.turn?.length === 4) world!.group.quaternion.fromArray(saved.turn);
      scene.remove(world!.group);
    }
    for (const r of u.railways) if (kept.has(r.a) && kept.has(r.b)) railways.push({ ...r, born: seconds + r.born });
    const here = kept.has(u.current) ? u.current : [...kept.keys()][0];
    world = null;
    if (here) returnTo(here);
    keptKey = universeKey();
  } catch (err) {
    // A kept universe that can't be brought back is set aside, never half-restored.
    console.error(err);
    toast('The kept atlas could not be opened; starting a new one.');
    for (const w of kept.values()) { scene.remove(w.group); w.dispose(); }
    kept.clear(); sources.clear(); railways.length = 0; world = null;
    setWorld(normaliseGeometry(makeDemoOrange()), null, SPECIMENS[0].caption, undefined, { kind: 'specimen', caption: SPECIMENS[0].caption });
  }
}

setInterval(() => { void keepUniverse(); }, SAVE.every * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void keepUniverse(); });
window.addEventListener('pagehide', () => { void keepUniverse(); });
