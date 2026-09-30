/**
 * Volcano, the prototype: a young ocean planet with nothing on it, and you the
 * heat beneath, with a finite store of it. Drawn in Atlas Minor's paper and
 * ink: the one pen plots the coastlines and contours of the land as it is
 * made, and life comes in as stipple, on land and as reef in the shallows.
 */
import * as THREE from 'three';
import { buildTopology } from '../mesh/topology';
import { extractContours, type Polyline } from '../terrain/contours';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from '../render/plotterLines';
import { GestureRecognizer } from '../interact/gestures';
import { Stipple, stippleDots } from '../render/stipple';
import { Planet, VOLCANO, type Era } from './sim';
import { FineSurface } from './fine';

const $ = (id: string) => document.getElementById(id)!;
const stage = $('stage');

// ---------------------------------------------------------------- the scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
// As sharp as the screen is, up to three device pixels to a CSS pixel.
renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1));
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
  for (const pen of pens) pen.setResolution(w, h, renderer.getPixelRatio());
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
// A new world each time, unless one is asked for by its number (?seed=), to see the same world again.
const seed = Number(new URLSearchParams(location.search).get('seed')) || 1 + Math.floor(Math.random() * 1e6);
const planet = new Planet(topo, nearest(0.1, 0.15, 0.98), seed);

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
landPen.width = seaPen.width = 2;
pens.push(landPen, seaPen);
group.add(seaPen.object, landPen.object);
const life = new Stipple('#3f4a2a'), reef = new Stipple('#3e6f6a');
group.add(life.object, reef.object);

/** Marks on the surface, each a fine ink ring laid flat on the ground. */
function ring(color: string, opacity: number, inner = 0.9): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  group.add(m);
  return m;
}
/** The pressure, gathering at the plume; the faint outer ring is as far as it can go before it bursts on its own. */
const pressureRing = ring('#2e2118', 0.85), capRing = ring('#2e2118', 0.25, 0.96);
/** Where you have called the heat to, and a stone's shadow as it falls. */
const targetRing = ring('#2e2118', 0.5, 0.8), stoneRing = ring('#4a2f1c', 0.7, 0.85);

const PAPER = new THREE.Color('#ecdfc2'), BASALT = new THREE.Color('#8b7c6b'), ASH = new THREE.Color('#a7a196'), LAVA = new THREE.Color('#4a2418'), GLOW = new THREE.Color('#9a4a2a');
const SHALLOW = new THREE.Color('#d4e3ec'), DEEP = new THREE.Color('#b1c8d8');
const c = new THREE.Color();

function surface(v: number): number {
  return planet.rock[v] + planet.lava[v];
}

// The simulation's values, a vertex at a time, before they are carried onto the finer surface.
const coarseHeight = new Float32Array(N), coarseLand = new Float32Array(N * 3), coarseSea = new Float32Array(N * 3);
const fineLife = new Float32Array(FN);

function draw(): void {
  for (let v = 0; v < N; v++) {
    const h = surface(v), r = 1 + RELIEF * Math.max(0, h);
    topo.positions[v * 3] = base[v * 3] * r; topo.positions[v * 3 + 1] = base[v * 3 + 1] * r; topo.positions[v * 3 + 2] = base[v * 3 + 2] * r;
    coarseHeight[v] = h;
    const lava = planet.lava[v];
    // The sea, paler over the shallows; the land, fresh basalt dark and weathering to paper, ash
    // grey, and hot lava darker still, with the least warmth at its thickest.
    c.copy(SHALLOW).lerp(DEEP, Math.min(1, Math.max(0, -h) / 0.3));
    coarseSea[v * 3] = c.r; coarseSea[v * 3 + 1] = c.g; coarseSea[v * 3 + 2] = c.b;
    c.copy(PAPER).lerp(BASALT, Math.exp(-planet.age[v] / 30) * 0.9).lerp(ASH, planet.ash[v] * 0.6);
    if (lava > 0.002) c.lerp(LAVA, Math.min(1, lava * 25)).lerp(GLOW, Math.min(0.35, lava * 6));
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
  const h = fineHeight, sea = new Uint8Array(FN), land = new Uint8Array(FN);
  for (let v = 0; v < FN; v++) { if (h[v] < 0) sea[v] = 1; else land[v] = 1; }
  landPen.setLines(rounded(extractContours(ftopo, h, { interval: 0.035, lift: 0.003, mask: sea })), mode, facingPoint());
  seaPen.setLines(rounded(extractContours(ftopo, h, { interval: 0.07, lift: 0.002, mask: land })), 'settle');
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

/** Life as stipple, denser where there is more of it: on land in dark ink, in the shallows as reef in a sea-green one. */
function redrawLife(now: number): void {
  if (now - lastLife < 1.2) return;
  lastLife = now;
  const onLand: number[][] = [[], [], [], []], inSea: number[][] = [[], [], [], []], t = ftopo.triangles, P = ftopo.positions;
  fine.carry(planet.life, fineLife);
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], d = t[i + 2];
    const l = Math.min(fineLife[a], fineLife[b], fineLife[d]);
    if (l <= 0.02) continue;
    const k = Math.min(3, Math.floor(l * 4));
    const into = fineHeight[a] + fineHeight[b] + fineHeight[d] > 0 ? onLand : inSea;
    for (const v of [a, b, d]) into[k].push(P[v * 3] * 1.002, P[v * 3 + 1] * 1.002, P[v * 3 + 2] * 1.002);
  }
  life.set(onLand.flatMap((tris, k) => stippleDots(tris, 4000 + 9000 * k)));
  reef.set(inSea.flatMap((tris, k) => stippleDots(tris, 2500 + 5000 * k)));
}

/** Lay a ring flat on the ground above a point of the planet, at a given size. */
function place(m: THREE.Mesh, x: number, y: number, z: number, size: number): void {
  const up = new THREE.Vector3(x, y, z).normalize();
  const v = nearestAbove(up);
  const r = new THREE.Vector3(topo.positions[v * 3], topo.positions[v * 3 + 1], topo.positions[v * 3 + 2]).length();
  m.position.copy(up).multiplyScalar(r + 0.006);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  m.scale.setScalar(size);
}
function nearestAbove(u: THREE.Vector3): number {
  // Near the plume, a walk from its vertex is quick; this is only for placing marks.
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

function drawMarks(now: number): void {
  const q = planet.plume, share = planet.pressure / VOLCANO.cap;
  const over = !planet.over;
  pressureRing.visible = capRing.visible = over;
  place(pressureRing, q.x, q.y, q.z, 0.018 + 0.07 * share + 0.002 * Math.sin(now * 3));
  place(capRing, q.x, q.y, q.z, 0.09);
  // Past the point where it would burst, the ring turns to the colour of hot rock.
  (pressureRing.material as THREE.MeshBasicMaterial).color.set(planet.bursting ? '#8a3a1e' : '#2e2118');
  const t = planet.target;
  targetRing.visible = !!t;
  if (t) place(targetRing, t.x, t.y, t.z, 0.02);
  const s = planet.impact;
  stoneRing.visible = !!s;
  if (s) place(stoneRing, base[s.vertex * 3], base[s.vertex * 3 + 1], base[s.vertex * 3 + 2], 0.02 + 0.12 * (s.in / VOLCANO.impactWarning));
}

// ---------------------------------------------------------------- touch
const raycaster = new THREE.Raycaster();
function pickAt(x: number, y: number): THREE.Vector3 | null {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  // Against a sphere a little above the sea, not the ground's many thousand triangles: close
  // enough for where the heat is called, and quick enough to follow a finger.
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
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; setTimeout(() => $('hint').classList.add('gone'), 9000); } };
const finger = { x: 0, y: 0 };
const call = (x: number, y: number) => { const p = pickAt(x, y); if (p) planet.callTo(p.x, p.y, p.z); };

const gestures = new GestureRecognizer(
  {
    tap() {
      firstTouch();
      if (ending) { if (ending.shown) location.reload(); return; }
      // Let the pressure out, all of it: gently if there's little, as a burst if it has built.
      if (planet.erupt() === null) announce('Not enough heat yet');
    },
    spin(dx, dy) { firstTouch(); spin.set(0, 0); rotate(dx * 0.006, dy * 0.006); },
    fling(vx, vy) { spin.set(vx * 0.006, vy * 0.006); },
    zoom(f) { dist = THREE.MathUtils.clamp(dist / f, 1.6, 9); fit(); },
    // Hold the world, and the heat is called there; it creeps beneath the crust to follow your finger.
    grab(x, y) { firstTouch(); call(x, y); },
    press() { /* holding still: the call stands */ },
    pull() { call(finger.x, finger.y); },
    release() { /* the heat goes on to where it was called */ },
    drawer() { /* none */ },
  },
  (x, y) => pickAt(x, y) !== null,
);
stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); finger.x = e.clientX; finger.y = e.clientY; gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
stage.addEventListener('pointermove', (e) => { finger.x = e.clientX; finger.y = e.clientY; gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp); });
for (const type of ['pointerup', 'pointercancel'] as const) stage.addEventListener(type, (e) => gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp));
stage.addEventListener('wheel', (e) => { e.preventDefault(); gestures.wheel(e.deltaY); }, { passive: false });

// ---------------------------------------------------------------- words
const ERAS: Record<Era, string> = { young: 'The young fire', burning: 'The long burning', cooling: 'The cooling', embers: 'The last embers', out: 'The fire is out' };
let shownEra: Era = 'young';
function announce(text: string): void {
  const e = $('event');
  e.textContent = text;
  e.classList.add('shown');
  clearTimeout(announce.timer);
  announce.timer = window.setTimeout(() => e.classList.remove('shown'), 3200);
}
announce.timer = 0;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
let firstLand = false;
function words(): void {
  const era = planet.era;
  if (era !== shownEra && !ending) { shownEra = era; $('stage-name').textContent = ERAS[era]; }
  const news = planet.news.splice(0);
  if (!firstLand && planet.landShare() > 0) { firstLand = true; news.push('Land breaks the surface'); }
  if (news.length && !ending) announce(news[news.length - 1]);
  if (!ending) $('shares').textContent = `heat ${Math.round(planet.heatLeft * 100)}% · land ${pct(planet.landShare())} · life ${pct(planet.lifeShare())}`;
}

/**
 * The end: when the fire is out, a long age passes quickly, the sea and the rain at work on
 * what you made, and then what lasted is told.
 */
const LONG_AGE = 360, AGE_SPEED = 14;
let ending: { from: number; shown: boolean } | null = null;
function theEnd(): void {
  if (!ending && planet.over) {
    ending = { from: planet.seconds, shown: false };
    $('stage-name').textContent = ERAS.out;
    announce('The fire is out. A long age passes');
  }
  if (ending && !ending.shown && planet.seconds - ending.from >= LONG_AGE) {
    ending.shown = true;
    $('stage-name').textContent = 'What lasted';
    $('shares').textContent = `land ${pct(planet.landShare())} · life ${pct(planet.lifeShare())}`;
    $('hint').textContent = 'tap to begin again, with a new world';
    $('hint').classList.remove('gone');
  }
}

// ---------------------------------------------------------------- the loop
const DOWN = new THREE.Vector3(), INVERSE = new THREE.Quaternion();
fit();
draw();
redrawLines(0);
const clock = new THREE.Clock();
let seconds = 0, lastWords = 0, lastDraw = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  seconds += dt;
  gestures.tick(performance.now(), dt);
  if (spin.lengthSq() > 1e-6) { rotate(spin.x * dt, spin.y * dt); spin.multiplyScalar(Math.exp(-2.2 * dt)); }
  // The bottom of the screen is down for the lava: tip the world, and the flows follow.
  DOWN.set(0, -1, 0).applyQuaternion(INVERSE.copy(group.quaternion).invert());
  planet.downhill.x = DOWN.x; planet.downhill.y = DOWN.y; planet.downhill.z = DOWN.z;
  // Once the fire is out, the long age runs quickly, in small steps so the sea's work stays as it would be.
  const speed = ending && !ending.shown ? AGE_SPEED : 1;
  for (let k = 0; k < speed; k++) planet.step(dt);
  // The surface is redrawn often while lava runs, and now and then while only the slow forces work.
  const flowing = planet.erupting || planet.molten > 0.01;
  if (seconds - lastDraw >= (flowing || speed > 1 ? 1 / 24 : 0.5)) { lastDraw = seconds; draw(); }
  redrawLines(seconds);
  redrawLife(seconds);
  drawMarks(seconds);
  landPen.update(dt, camera);
  seaPen.update(dt, camera);
  life.update(dt);
  reef.update(dt);
  if (seconds - lastWords > 0.5) { lastWords = seconds; words(); theEnd(); }
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) (window as unknown as { volcano: unknown }).volcano = { planet, rotate, draw, lines: () => { lastLines = -1; redrawLines(1e6); } };
