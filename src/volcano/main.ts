/**
 * Volcano, the prototype: an ocean planet, your vent on its floor, a rival
 * vent on the far side, and the sea. Drawn in Atlas Minor's paper and ink: the
 * one pen plots the coastlines and contours of the land as it is made.
 */
import * as THREE from 'three';
import { buildTopology } from '../mesh/topology';
import { extractContours } from '../terrain/contours';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from '../render/plotterLines';
import { GestureRecognizer } from '../interact/gestures';
import { Stipple, stippleDots } from '../render/stipple';
import { Planet, VOLCANO, type Stage } from './sim';

const $ = (id: string) => document.getElementById(id)!;
const stage = $('stage');

// ---------------------------------------------------------------- the scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe4');
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
scene.add(new THREE.HemisphereLight('#fffaf0', '#efe7d6', 2.3));
const sun = new THREE.DirectionalLight('#ffffff', 0.55);
sun.position.set(-2, 3, 2.5);
scene.add(sun);

let dist = 4.2;
function fit(): void {
  const w = Math.max(1, stage.clientWidth || innerWidth), h = Math.max(1, stage.clientHeight || innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  dist = THREE.MathUtils.clamp(dist, 1.6, 1.35 / Math.sin(Math.min(vfov, hfov) / 2) * 1.4);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
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
const planet = new Planet(topo, nearest(0.1, 0.15, 0.98), nearest(-0.1, -0.2, -0.97));

/** How far above the sea the land stands, drawn: heights are small, so the relief is raised. */
const RELIEF = 0.32;
const group = new THREE.Group();
scene.add(group);
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(N * 3), colors = new Float32Array(N * 3);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setIndex(new THREE.BufferAttribute(topo.triangles, 1));
const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
group.add(mesh);

const landPen = new PlotterLines({ ...defaultPlotterStyle, ink: '#6b4a2e', inkHigh: '#4a2f1c', pencil: '#b9a68c', alpha: 0.6, indexAlpha: 0.95, indexEvery: 5, fadeSeconds: 0 });
const seaPen = new PlotterLines({ ...defaultPlotterStyle, ink: '#5b82a3', inkHigh: '#5b82a3', pencil: '#a9bfd0', alpha: 0.45, indexAlpha: 0.6, fadeSeconds: 0, pen: false, appearSeconds: 2 });
landPen.width = seaPen.width = 2;
group.add(seaPen.object, landPen.object);
const life = new Stipple('#3f4a2a');
group.add(life.object);

/** The vents: yours a fine ink ring, the rival's a faint one. */
const ventRings = new THREE.Group();
group.add(ventRings);

const PAPER = new THREE.Color('#ecdfc2'), BASALT = new THREE.Color('#8b7c6b'), LAVA = new THREE.Color('#4a2418'), GLOW = new THREE.Color('#9a4a2a');
const SHALLOW = new THREE.Color('#d4e3ec'), DEEP = new THREE.Color('#b1c8d8');
const c = new THREE.Color();

function surface(v: number): number {
  return planet.rock[v] + planet.lava[v];
}

function draw(): void {
  const nm = topo.normals;
  for (let v = 0; v < N; v++) {
    const h = surface(v), r = 1 + RELIEF * Math.max(0, h);
    const x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2];
    positions[v * 3] = x * r; positions[v * 3 + 1] = y * r; positions[v * 3 + 2] = z * r;
    topo.positions[v * 3] = x * r; topo.positions[v * 3 + 1] = y * r; topo.positions[v * 3 + 2] = z * r;
    nm[v * 3] = x; nm[v * 3 + 1] = y; nm[v * 3 + 2] = z;
    const lava = planet.lava[v];
    if (h < 0 && lava < 0.004) c.copy(SHALLOW).lerp(DEEP, Math.min(1, -h / 0.3));
    else {
      // Fresh basalt, dark, weathering to paper; hot lava darker still, with the least warmth at its thickest.
      c.copy(PAPER).lerp(BASALT, Math.exp(-planet.age[v] / 30) * 0.9);
      if (lava > 0.002) c.lerp(LAVA, Math.min(1, lava * 25)).lerp(GLOW, Math.min(0.35, lava * 6));
    }
    colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

// ---------------------------------------------------------------- the pen, and life
let lastLines = -1, lastQuiet = true, lastLife = -1;
function redrawLines(now: number): void {
  const busy = planet.molten > 0.01 || planet.erupting;
  // While lava runs, new ground is pencilled; once it has cooled, the pen inks it. The sea's
  // slow wearing is simply redrawn, now and then, as a map is corrected.
  const every = busy ? 0.4 : 2.5;
  if (now - lastLines < every && !(lastQuiet === false && !busy)) return;
  const mode: RevealMode = busy ? 'live' : lastQuiet ? 'settle' : 'ink';
  lastLines = now;
  lastQuiet = !busy;
  const h = new Float32Array(N), sea = new Uint8Array(N), land = new Uint8Array(N);
  for (let v = 0; v < N; v++) { h[v] = surface(v); if (h[v] < 0) sea[v] = 1; else land[v] = 1; }
  landPen.setLines(extractContours(topo, h, { interval: 0.035, lift: 0.002, mask: sea }), mode, facingPoint());
  seaPen.setLines(extractContours(topo, h, { interval: 0.07, lift: 0.001, mask: land }), 'settle');
}

function redrawLife(now: number): void {
  if (now - lastLife < 1.2) return;
  lastLife = now;
  const levels: number[][] = [[], [], [], []], t = topo.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const l = Math.min(planet.life(t[i]), planet.life(t[i + 1]), planet.life(t[i + 2]));
    if (l <= 0) continue;
    const k = Math.min(3, Math.floor(l * 4));
    for (const v of [t[i], t[i + 1], t[i + 2]]) levels[k].push(topo.positions[v * 3] * 1.002, topo.positions[v * 3 + 1] * 1.002, topo.positions[v * 3 + 2] * 1.002);
  }
  life.set(levels.flatMap((tris, k) => stippleDots(tris, 4000 + 9000 * k)));
}

function drawVents(now: number): void {
  while (ventRings.children.length < planet.vents.length) {
    const own = planet.vents[ventRings.children.length].owner === 1;
    ventRings.add(new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), new THREE.MeshBasicMaterial({ color: own ? '#2e2118' : '#8a8578', transparent: true, opacity: own ? 0.8 : 0.5, side: THREE.DoubleSide, depthWrite: false })));
  }
  planet.vents.forEach((vent, i) => {
    const m = ventRings.children[i] as THREE.Mesh, v = vent.vertex;
    const p = new THREE.Vector3(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]);
    const up = p.clone().normalize();
    m.position.copy(p).addScaledVector(up, 0.006);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    const charging = charge && charge.vent === vent ? charge.amount : 0;
    m.scale.setScalar(0.025 + 0.05 * charging + 0.004 * Math.sin(now * 3 + i));
  });
}

// ---------------------------------------------------------------- touch
const raycaster = new THREE.Raycaster();
function pickAt(x: number, y: number): number | null {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const hit = raycaster.intersectObject(mesh)[0];
  if (!hit?.face) return null;
  const f = hit.face, local = group.worldToLocal(hit.point.clone());
  let best = f.a, bd = Infinity;
  for (const v of [f.a, f.b, f.c]) { const d = Math.hypot(topo.positions[v * 3] - local.x, topo.positions[v * 3 + 1] - local.y, topo.positions[v * 3 + 2] - local.z); if (d < bd) { bd = d; best = v; } }
  return best;
}
function yourVentNear(v: number | null) {
  const mine = planet.vents.filter((x) => x.owner === 1);
  if (v === null) return mine[0];
  let best = mine[0], bd = Infinity;
  for (const x of mine) { const d = Math.hypot(base[x.vertex * 3] - base[v * 3], base[x.vertex * 3 + 1] - base[v * 3 + 1], base[x.vertex * 3 + 2] - base[v * 3 + 2]); if (d < bd) { bd = d; best = x; } }
  return best;
}
function facingPoint(): THREE.Vector3 {
  return group.worldToLocal(camera.position.clone().normalize());
}

let charge: { vent: ReturnType<typeof yourVentNear>; amount: number } | null = null;
const spin = new THREE.Vector2();
const turn = new THREE.Quaternion(), axis = new THREE.Vector3();
function rotate(ax: number, ay: number): void {
  turn.setFromAxisAngle(axis.set(0, 1, 0), ax); group.quaternion.premultiply(turn);
  turn.setFromAxisAngle(axis.set(1, 0, 0), ay); group.quaternion.premultiply(turn);
}
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; setTimeout(() => $('hint').classList.add('gone'), 6000); } };

const gestures = new GestureRecognizer(
  {
    tap(x, y) {
      firstTouch();
      const v = pickAt(x, y);
      if (v === null) return;
      // Where your land allows it, a tap on your own coast opens a new vent there; anywhere else, a small eruption.
      if (planet.openVent(v)) { announce('A new vent opens'); return; }
      planet.erupt(yourVentNear(v), 0);
    },
    spin(dx, dy) { firstTouch(); spin.set(0, 0); rotate(dx * 0.006, dy * 0.006); },
    fling(vx, vy) { spin.set(vx * 0.006, vy * 0.006); },
    zoom(f) { dist = THREE.MathUtils.clamp(dist / f, 1.6, 9); fit(); },
    grab(x, y) { firstTouch(); charge = { vent: yourVentNear(pickAt(x, y)), amount: 0 }; },
    press(dt) { if (charge) charge.amount = Math.min(1, charge.amount + dt / VOLCANO.charge); },
    pull() { /* holding still or not, the pressure builds */ },
    release() { if (charge) { planet.erupt(charge.vent, charge.amount); charge = null; } },
    drawer() { /* none */ },
  },
  (x, y) => pickAt(x, y) !== null,
);
stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
stage.addEventListener('pointermove', (e) => gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp));
for (const type of ['pointerup', 'pointercancel'] as const) stage.addEventListener(type, (e) => gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp));
stage.addEventListener('wheel', (e) => { e.preventDefault(); gestures.wheel(e.deltaY); }, { passive: false });

// ---------------------------------------------------------------- words
const STAGES: Record<Stage, string> = { seamount: 'A seamount', island: 'An island', volcano: 'A volcano', archipelago: 'An archipelago' };
let shownStage: Stage = 'seamount';
function announce(text: string): void {
  const e = $('event');
  e.textContent = text;
  e.classList.add('shown');
  setTimeout(() => e.classList.remove('shown'), 2600);
}
function words(): void {
  const s = planet.stage();
  if (s !== shownStage) {
    shownStage = s;
    $('stage-name').textContent = STAGES[s];
    announce(s === 'island' ? 'An island breaks the surface' : s === 'volcano' ? 'A great volcano stands' : s === 'archipelago' ? 'Tap your coast to open a new vent' : '');
  }
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  $('shares').textContent = `your land ${pct(planet.landShare(1))} · the rival's ${pct(planet.landShare(2))}`;
}

// ---------------------------------------------------------------- the loop
const DOWN = new THREE.Vector3(), INVERSE = new THREE.Quaternion();
fit();
draw();
redrawLines(0);
const clock = new THREE.Clock();
let seconds = 0, lastWords = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  seconds += dt;
  gestures.tick(performance.now(), dt);
  if (spin.lengthSq() > 1e-6) { rotate(spin.x * dt, spin.y * dt); spin.multiplyScalar(Math.exp(-2.2 * dt)); }
  // The bottom of the screen is down for the lava: tip the world, and the flows follow.
  DOWN.set(0, -1, 0).applyQuaternion(INVERSE.copy(group.quaternion).invert());
  planet.downhill.x = DOWN.x; planet.downhill.y = DOWN.y; planet.downhill.z = DOWN.z;
  planet.step(dt);
  draw();
  redrawLines(seconds);
  redrawLife(seconds);
  drawVents(seconds);
  landPen.update(dt, camera);
  seaPen.update(dt, camera);
  life.update(dt);
  if (seconds - lastWords > 0.5) { lastWords = seconds; words(); }
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { planet, rotate };
