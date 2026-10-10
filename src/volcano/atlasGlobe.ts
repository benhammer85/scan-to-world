/**
 * The atlas as a celestial globe: a night-blue sphere, lacquered, lit from the upper left by the same
 * lamp as the worlds, with the sky's hour lines and the ecliptic in faint gold, and Johann Bayer's
 * figures (Uranometria, 1603, engraved by Alexander Mair; from the ETH Library Zurich's copy on
 * e-rara.ch, marked public domain) laid on it where they stand in the sky. Each chapter is one of
 * them; its worlds sit on the figure's own stars. A figure is a pale ghost until its worlds are made:
 * each world made inks it round that star, and a chapter played through shows it whole.
 *
 * Turned with a finger, it turns slowly by itself when left; a touch on a world asks for its card.
 */
import * as THREE from 'three';
import { CHAPTERS, worldOf, type WorldId } from './worlds';
import type { Page } from './save';
import type { KeptSystem } from './system';
import ursa from './figures/ursa.webp';
import scorpius from './figures/scorpius.webp';
import sagittarius from './figures/sagittarius.webp';
import centaurus from './figures/centaurus.webp';
import lupus from './figures/lupus.webp';
import ara from './figures/ara.webp';
import piscis from './figures/piscis.webp';
import argo from './figures/argo.webp';
import cetus from './figures/cetus.webp';
import eridanus from './figures/eridanus.webp';
import hydra from './figures/hydra.webp';
import draco from './figures/draco.webp';
import hercules from './figures/hercules.webp';
import pegasus from './figures/pegasus.webp';
import cygnus from './figures/cygnus.webp';
import lyra from './figures/lyra.webp';
import cassiopeia from './figures/cassiopeia.webp';
import andromeda from './figures/andromeda.webp';
import perseus from './figures/perseus.webp';
import orion from './figures/orion.webp';
import canis from './figures/canis.webp';

const NIGHT = new THREE.Color('#1b2341'), PALE = '#efe7d3', GOLD = '#e2c27a';

/**
 * A chapter's figure: its picture and size in pixels, its worlds' stars on it (in the picture's
 * pixels, in order), and where it stands in the sky: its middle's right ascension (hours) and
 * declination (degrees), and how wide it spans (degrees).
 */
interface Figure { name: string; src: string; w: number; h: number; stars: [number, number][]; ra: number; dec: number; span: number }
const FIGURES: Record<string, Figure> = {
  // I · Our neighbours: the Great Bear, its worlds on the Dipper (η, ζ, ε, δ, α).
  I: { name: 'Ursa Major', src: ursa, w: 820, h: 672, stars: [[58, 93], [178, 50], [233, 93], [305, 140], [476, 173]], ra: 11.2, dec: 52, span: 60 },
  // II · One world, through time: the Hydra, the long water-serpent, tail to head (γ, β, θ, α, ζ).
  II: { name: 'Hydra', src: hydra, w: 820, h: 269, stars: [[117, 50], [190, 150], [270, 213], [412, 133], [580, 138], [712, 38]], ra: 10.6, dec: -14, span: 100 },
  // III · Strange fires: the Dragon, curled round the pole: tail, coil, head.
  III: { name: 'Draco', src: draco, w: 677, h: 818, stars: [[80, 710], [182, 262], [293, 80]], ra: 16.2, dec: 66, span: 36 },
  // IV · Pressure: Hercules, kneeling: club, face, shoulder, hip, knee, foot.
  IV: { name: 'Hercules', src: hercules, w: 686, h: 819, stars: [[318, 44], [427, 213], [418, 392], [310, 494], [120, 600], [478, 770]], ra: 17.4, dec: 21, span: 36 },
  // V · Far worlds: Pegasus, flying: muzzle, neck, wing, wingtip, cloud.
  // VI · Slow fires: Orion, the hunter: Betelgeuse, his shoulder, Rigel, his foot, and Bellatrix, his other shoulder.
  VI: { name: 'Orion', src: orion, w: 536, h: 559, stars: [[160, 150], [340, 418], [282, 162]], ra: 5.6, dec: 4, span: 26 },
  // VII · Earth's fires: Eridanus, the river, as lava runs to the sea: its bend, then on up towards its source.
  VII: { name: 'Eridanus', src: eridanus, w: 457, h: 560, stars: [[270, 408], [320, 165], [272, 35]], ra: 3.7, dec: -32, span: 36 },
  V: { name: 'Pegasus', src: pegasus, w: 820, h: 573, stars: [[57, 232], [265, 158], [372, 186], [616, 72], [671, 292], [455, 380]], ra: 22.6, dec: 17, span: 52 },
};

/**
 * The rest of the sky: more of Bayer's figures, never a chapter, so the globe is as full as the old
 * ones were. Fainter than the chapters' figures, and never inked: there to come across as it turns.
 */
const BACKGROUND: Figure[] = [
  { name: 'Cygnus', src: cygnus, w: 359, h: 559, stars: [], ra: 20.5, dec: 42, span: 22 },
  { name: 'Lyra', src: lyra, w: 560, h: 560, stars: [], ra: 18.9, dec: 37, span: 15 },
  { name: 'Cassiopeia', src: cassiopeia, w: 560, h: 405, stars: [], ra: 1.0, dec: 61, span: 32 },
  { name: 'Andromeda', src: andromeda, w: 560, h: 520, stars: [], ra: 1.1, dec: 33, span: 28 },
  { name: 'Perseus', src: perseus, w: 383, h: 559, stars: [], ra: 3.5, dec: 44, span: 20 },
  { name: 'Canis Major', src: canis, w: 462, h: 559, stars: [], ra: 6.9, dec: -22, span: 22 },
  // The southern sky, from the same atlas's southern plates, so it isn't left bare.
  { name: 'Cetus', src: cetus, w: 560, h: 470, stars: [], ra: 1.7, dec: -8, span: 36 },
  { name: 'Argo Navis', src: argo, w: 560, h: 425, stars: [], ra: 8.2, dec: -44, span: 46 },
  { name: 'Centaurus', src: centaurus, w: 532, h: 560, stars: [], ra: 13.0, dec: -48, span: 34 },
  { name: 'Lupus', src: lupus, w: 525, h: 560, stars: [], ra: 15.3, dec: -43, span: 18 },
  { name: 'Scorpius', src: scorpius, w: 560, h: 535, stars: [], ra: 16.9, dec: -30, span: 30 },
  { name: 'Ara', src: ara, w: 432, h: 560, stars: [], ra: 17.4, dec: -56, span: 16 },
  { name: 'Sagittarius', src: sagittarius, w: 560, h: 439, stars: [], ra: 19.1, dec: -28, span: 30 },
  { name: 'Piscis Austrinus', src: piscis, w: 560, h: 267, stars: [], ra: 22.3, dec: -31, span: 24 },
];

const RAD = Math.PI / 180;
/** A place in the sky as a point on the globe (y towards the north pole; right ascension increasing to the right, seen from outside). */
function skyAt(raHours: number, decDeg: number): THREE.Vector3 {
  const a = raHours * 15 * RAD, d = decDeg * RAD;
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a));
}
/** A point of a figure's picture (u, v from its top left, 0 to 1) on the globe: the picture laid flat round its middle, as a globe-maker pastes a gore. */
function onFigure(f: Figure, u: number, v: number, r = 1): THREE.Vector3 {
  const c = skyAt(f.ra, f.dec), e = new THREE.Vector3(0, 1, 0).cross(c).normalize(), n = c.clone().cross(e);
  const W = f.span * RAD, H = (W * f.h) / f.w, x = (u - 0.5) * W, y = (0.5 - v) * H, d = Math.hypot(x, y);
  if (d < 1e-9) return c.multiplyScalar(r);
  return c.clone().multiplyScalar(Math.cos(d)).addScaledVector(e, (Math.sin(d) * x) / d).addScaledVector(n, (Math.sin(d) * y) / d).multiplyScalar(r);
}

export interface Globe { dispose(): void }

/** Open the globe in `box`; `pick` is asked for a world's card when one is touched. */
export function openGlobe(box: HTMLElement, pages: Page[], here: WorldId, pick: (id: WorldId) => void, systems: KeptSystem[] = [], pickSystem?: (i: number) => void): Globe {
  const latest = new Map<string, Page>();
  for (const p of pages) if (p.world) latest.set(p.world, p);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  box.appendChild(canvas);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  let dist = 4.6;
  camera.position.set(0, 0, dist);
  const globe = new THREE.Group();
  scene.add(globe);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };
  // The lamp, from the upper left and a little in front, as the worlds are lit.
  const LIGHT = new THREE.Vector3(-0.55, 0.6, 0.6).normalize();

  // ---- the sphere: night blue, lacquered, its hour lines and the ecliptic in faint gold
  const sphere = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 128, 96)), keep(new THREE.ShaderMaterial({
    uniforms: { uNight: { value: NIGHT }, uGold: { value: new THREE.Color(GOLD) }, uLight: { value: LIGHT } },
    vertexShader: /* glsl */ `
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main() { vObj = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uNight, uGold, uLight; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      float line(float d, float w) { float f = fwidth(d); return 1.0 - smoothstep(w - f, w + f, d); }
      void main() {
        vec3 p = normalize(vObj), N = normalize(vN), V = normalize(vV);
        float lat = asin(clamp(p.y, -1.0, 1.0)), lon = atan(-p.z, p.x), PI = 3.14159265;
        // Hour lines every two hours and parallels every 30 degrees, dotted, as an engraver stipples them; the equator and the ecliptic finer drawn, dashed.
        float gs = PI / 6.0;
        float dm = abs(fract(lon / gs + 0.5) - 0.5) * gs * cos(lat), dp = abs(fract(lat / gs + 0.5) - 0.5) * gs;
        float dots = step(0.45, fract(lat * 60.0)) , dots2 = step(0.45, fract(lon * 60.0 * cos(lat)));
        float grid = max(line(dm, 0.0016) * dots * step(abs(lat), 1.39), line(dp, 0.0016) * dots2);
        float eq = line(abs(lat), 0.0022) * step(0.3, fract(lon * 24.0));
        vec3 eclN = vec3(0.0, cos(0.4091), sin(0.4091));
        float ecl = line(abs(asin(clamp(dot(p, eclN), -1.0, 1.0))), 0.0022) * step(0.5, fract(atan(p.z, p.x) * 18.0));
        float gold = grid * 0.28 + max(eq, ecl) * 0.42;
        // Lit as a lacquered globe: the lamp's side a little lighter, the far side deep, a soft gloss where it catches the lamp, a breath of light round the rim.
        float lam = max(dot(N, uLight), 0.0);
        vec3 col = uNight * (0.42 + 0.78 * lam);
        col = mix(col, uGold, gold * (0.35 + 0.65 * lam));
        float spec = pow(max(dot(reflect(-uLight, N), V), 0.0), 140.0);
        col += vec3(0.85, 0.88, 1.0) * spec * 0.05;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += vec3(0.32, 0.4, 0.62) * rim * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })));
  globe.add(sphere);
  // A soft glow behind it, so it floats in the night rather than sits on it.
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d')!, grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    grad.addColorStop(0, 'rgba(120,140,200,0.2)'); grad.addColorStop(0.5, 'rgba(90,110,170,0.07)'); grad.addColorStop(0.92, 'rgba(60,80,140,0)'); grad.addColorStop(1, 'rgba(60,80,140,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(new THREE.CanvasTexture(cv)), depthWrite: false, transparent: true })));
    halo.scale.set(2.7, 2.7, 1); halo.renderOrder = -1;
    scene.add(halo);
  }
  // The sky's small stars, scattered over the globe, a few gold.
  {
    const n = 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), pale = new THREE.Color(PALE), gold = new THREE.Color(GOLD);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z), k = 0.35 + 0.65 * rnd() ** 2.5;
      pos.set([r * Math.cos(a) * 1.002, z * 1.002, r * Math.sin(a) * 1.002], i * 3);
      const c = (rnd() < 0.2 ? gold : pale).clone().multiplyScalar(k * 0.85);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d')!, rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
    // (Round and soft, a little larger on a sharper screen: square dots read as pixels.)
    // (Faded towards the rim, where seen edge-on they'd crowd into a bright fuzz.)
    globe.add(new THREE.Points(geo, keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: keep(new THREE.CanvasTexture(dot)) }, uSize: { value: 2.3 * Math.min(2, devicePixelRatio || 1) } },
      vertexShader: /* glsl */ `
        attribute vec3 color; uniform float uSize; varying vec3 vC; varying float vF;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normalize(position)); vF = smoothstep(0.08, 0.45, dot(n, normalize(-mv.xyz))); gl_PointSize = uSize; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec3 vC; varying float vF;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vF; if (a < 0.02) discard; gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
    }))));
  }

  // ---- the figures, laid on the globe where they stand in the sky
  const loader = new THREE.TextureLoader();
  const markers: { id: WorldId; at: THREE.Vector3; sprite: THREE.Sprite; made: boolean; chapter: number }[] = [];
  const labels: { at: THREE.Vector3; sprite: THREE.Sprite; weight: number; near?: boolean; chapter?: number }[] = [];
  /** Each chapter: the middle of its figure on the globe, and how far it is in front (eased, 0 to 1). */
  const chapters: { at: THREE.Vector3; focus: { value: number }; lines: THREE.Line[] }[] = [];
  /** A figure laid on the globe: `lit` the stars to ink it round, `base` how strongly it shows uninked. */
  const layFigure = (f: Figure, lit: THREE.Vector3[], all: boolean, base: number): { value: number } => {
    const focus = { value: 1 };
    while (lit.length < 6) lit.push(new THREE.Vector3(0, 0, 0));
    // The picture as a gore: a grid of points on the globe, its texture the engraving.
    const S = 48, geo = keep(new THREE.BufferGeometry()), pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) { const u = i / S, v = j / S, p = onFigure(f, u, v, 1.0015); pos.push(p.x, p.y, p.z); uv.push(u, 1 - v); }
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + 1, d = a + S + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const tex = keep(loader.load(f.src)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, uLit: { value: lit }, uAll: { value: all ? 1 : 0 }, uLight: { value: LIGHT }, uAspect: { value: f.w / f.h }, uBase: { value: base }, uFocus: focus },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN;
        void main() { vUv = uv; vN = normalize(normalMatrix * normalize(position)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 uLit[6]; uniform float uAll, uAspect, uBase, uFocus; uniform vec3 uLight; varying vec2 vUv; varying vec3 vN;
        void main() {
          vec4 t = texture2D(map, vUv);
          // Inked round each world made: a soft circle of the figure; all of it, once the chapter is played through.
          float shown = uAll;
          vec2 q = vec2(vUv.x, 1.0 - vUv.y);
          for (int i = 0; i < 6; i++) { if (uLit[i].z > 0.5) { vec2 d = (q - uLit[i].xy) * vec2(uAspect, 1.0); shown = max(shown, 1.0 - smoothstep(0.1, 0.28, length(d) / max(uAspect, 1.0) * 1.6)); } }
          float lam = max(dot(normalize(vN), uLight), 0.0);
          // (A chapter not the one in front is drawn faint, so one figure at a time is read.)
          float a = clamp(t.a * 1.6, 0.0, 1.0) * mix(uBase, 1.0, shown) * (0.62 + 0.55 * lam) * mix(0.32, 1.0, uFocus);
          gl_FragColor = vec4(t.rgb * (0.85 + 0.25 * lam), a);
          #include <colorspace_fragment>
        }`,
    }));
    globe.add(new THREE.Mesh(geo, mat));
    return focus;
  };
  // The rest of the sky first, faint, its names lettered small.
  for (const f of BACKGROUND) {
    // (Half as strong as it was, its name only near the middle of the view: it was as bright as the chapters' figures, and its names crowded theirs.)
    layFigure(f, [], false, 0.16);
    const top = onFigure(f, 0.5, -0.05, 1.004), label = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(labelTexture(f.name, '')), depthTest: false, depthWrite: false, transparent: true })));
    label.scale.set(0.36, 0.09, 1); label.position.copy(top); label.center.set(0.5, 0.1);
    globe.add(label);
    labels.push({ at: top, sprite: label, weight: 0.32, near: true });
  }
  CHAPTERS.forEach((c) => {
    const f = FIGURES[c.numeral];
    if (!f) return;
    const ci = chapters.length, lines: THREE.Line[] = [];
    const all = c.worlds.every((w) => latest.has(w));
    const focus = layFigure(f, c.worlds.map((w, i) => new THREE.Vector3(f.stars[i][0] / f.w, f.stars[i][1] / f.h, latest.has(w) ? 1 : 0)), all, 0.42);
    // Its worlds joined, star to star, along the globe: dashed in gold.
    for (let i = 1; i < c.worlds.length; i++) {
      const a = onFigure(f, f.stars[i - 1][0] / f.w, f.stars[i - 1][1] / f.h), b = onFigure(f, f.stars[i][0] / f.w, f.stars[i][1] / f.h), pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) pts.push(a.clone().lerp(b, k / 24).normalize().multiplyScalar(1.003));
      const both = latest.has(c.worlds[i]) && latest.has(c.worlds[i - 1]);
      const line = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(pts)), keep(new THREE.LineDashedMaterial({ color: GOLD, transparent: true, opacity: both ? 0.75 : 0.45, dashSize: both ? 1 : 0.008, gapSize: both ? 0 : 0.012, depthWrite: false })));
      line.computeLineDistances();
      globe.add(line); lines.push(line);
    }
    chapters.push({ at: onFigure(f, 0.5, 0.5), focus, lines });
    // Its worlds, on its stars.
    c.worlds.forEach((id, i) => {
      const at = onFigure(f, f.stars[i][0] / f.w, f.stars[i][1] / f.h, 1.004), page = latest.get(id);
      const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(markerTexture(id, page, id === here)), depthTest: false, depthWrite: false, transparent: true })));
      const k = page || id === here ? 0.15 : 0.1;
      sprite.scale.set(k * 2, k, 1);
      sprite.center.set(0.25, 0.5); // (the world's middle on the star; its numeral beside it, to the right)
      sprite.position.copy(at);
      globe.add(sprite);
      markers.push({ id, at, sprite, made: !!page, chapter: ci });
    });
    // Its name, as the old globes letter a constellation, above it; the chapter's beneath, in italic.
    const top = onFigure(f, 0.5, c.numeral === 'I' ? 1.06 : -0.04, 1.004), // (the Bear's name under its feet: over its back, it ran into the Dragon's)
      made = c.worlds.filter((w) => latest.has(w)).length,
      label = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(labelTexture(f.name, `${c.numeral} · ${c.title} · ${made} of ${c.worlds.length}`)), depthTest: false, depthWrite: false, transparent: true })));
    label.scale.set(0.62, 0.155, 1); label.position.copy(top); label.center.set(0.5, 0.2);
    globe.add(label);
    labels.push({ at: top, sprite: label, weight: 0.95, chapter: ci });
  });

  // ---- the solar systems finished, each a small star of its own in a patch of open sky, its worlds circling it
  // on faint dotted rings, slowly: those made filled in their own colours, those not, an empty ring. (Placed
  // in the gaps between the figures, one after another as they're finished.)
  const SKY_GAPS: [number, number][] = [[14.4, 30], [8.4, 22], [2.6, 14], [12.6, -14], [20.9, -6], [5.0, 30], [17.8, 2], [10.0, 6], [0.2, -18], [23.4, 42], [13.8, 2], [7.0, 0]];
  const orbits: { at: THREE.Vector3; planets: { sprite: THREE.Sprite; r: number; phase: number; speed: number }[]; t1: THREE.Vector3; t2: THREE.Vector3; parts: THREE.Object3D[]; label: THREE.Sprite }[] = [];
  systems.slice(0, SKY_GAPS.length).forEach((sys, i) => {
    const [ra, dec] = SKY_GAPS[i], at = skyAt(ra, dec).multiplyScalar(1.004);
    const t1 = new THREE.Vector3(0, 1, 0).cross(at).normalize(), t2 = at.clone().normalize().cross(t1);
    const parts: THREE.Object3D[] = [];
    const sun = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(sunTexture()), depthTest: false, depthWrite: false, transparent: true })));
    sun.scale.set(0.095, 0.095, 1); sun.position.copy(at); globe.add(sun); parts.push(sun);
    const planets: (typeof orbits)[number]['planets'] = [];
    sys.worlds.forEach((w, k) => {
      const r = 0.062 + k * 0.034, pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 64; a++) { const th = (a / 64) * Math.PI * 2; pts.push(at.clone().addScaledVector(t1, Math.cos(th) * r).addScaledVector(t2, Math.sin(th) * r * 0.62).normalize().multiplyScalar(1.004)); }
      const ring = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(pts)), keep(new THREE.LineDashedMaterial({ color: GOLD, transparent: true, opacity: 0.35, dashSize: 0.004, gapSize: 0.006, depthWrite: false })));
      ring.computeLineDistances(); globe.add(ring); parts.push(ring);
      const p = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(planetTexture(worldOf(w.world).palette.paper, w.met)), depthTest: false, depthWrite: false, transparent: true })));
      const sz = 0.034; p.scale.set(sz, sz, 1); globe.add(p); parts.push(p);
      planets.push({ sprite: p, r, phase: (sys.seed % 97) * 0.37 + k * 2.1, speed: 0.22 / Math.pow(k + 1, 1.3) });
    });
    const made = sys.worlds.filter((w) => w.met).length;
    const label = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(labelTexture(`System ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i]}`, `round ${sys.star} · ${made} of ${sys.worlds.length} made`)), depthTest: false, depthWrite: false, transparent: true })));
    const below = at.clone().addScaledVector(t2, -(0.08 + sys.worlds.length * 0.024)).normalize().multiplyScalar(1.004);
    label.scale.set(0.5, 0.125, 1); label.position.copy(below); label.center.set(0.5, 0.8);
    globe.add(label);
    orbits.push({ at, planets, t1, t2, parts, label });
  });

  // ---- turning it
  const q = new THREE.Quaternion(), target = new THREE.Quaternion();
  /** The turn that brings a place on the globe to face us, its north up. */
  const facing = (d: THREE.Vector3) => {
    const phi = Math.atan2(d.x, d.z), lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 0.85;
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -phi));
  };
  const home = markers.find((m) => m.id === here) ?? markers[0];
  target.copy(facing(home.at));
  q.copy(target).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9)); // (it opens turning into place)
  let easing = 1.8, spinX = 0, spinY = 0, idle = 0, dragging = false, last = { x: 0, y: 0 }, downAt = { x: 0, y: 0, t: 0 }, moved = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const turnBy = (dx: number, dy: number) => {
    const k = 3.2 / Math.max(240, canvas.clientHeight) * (dist / 4.6);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k)).normalize();
  };
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); return; }
    dragging = true; easing = 0; spinX = spinY = 0; moved = 0; idle = 0;
    last = { x: e.clientX, y: e.clientY }; downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0) dist = THREE.MathUtils.clamp(dist * (pinch / d), 3.3, 5.2); pinch = d; moved = 99; return; }
    if (!dragging) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved = Math.max(moved, Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y));
    turnBy(dx, dy); spinX = dx; spinY = dy; last = { x: e.clientX, y: e.clientY };
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    pinch = 0;
    if (!dragging) return;
    dragging = false; canvas.style.cursor = 'grab'; idle = 0;
    if (moved < 7 && performance.now() - downAt.t < 600) touched(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = THREE.MathUtils.clamp(dist * Math.exp(e.deltaY * 0.0012), 3.3, 5.2); }, { passive: false });
  /** A touch: the nearest world to it, if near enough; turned to face us first if it's far round. */
  function touched(cx: number, cy: number): void {
    const r = canvas.getBoundingClientRect();
    let best: (typeof markers)[number] | null = null, bd = 30;
    for (const m of markers) {
      const w = m.at.clone().applyQuaternion(q);
      if (w.z < 0.3) continue;
      const s = w.clone().project(camera), x = r.left + (s.x + 1) / 2 * r.width, y = r.top + (1 - s.y) / 2 * r.height, d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = m; }
    }
    // (Or a solar system's star, if nearer: its chart.)
    let sysBest = -1;
    orbits.forEach((o, i) => {
      const w = o.at.clone().applyQuaternion(q);
      if (w.z < 0.15) return;
      const s = w.clone().project(camera), x = r.left + (s.x + 1) / 2 * r.width, y = r.top + (1 - s.y) / 2 * r.height, d = Math.hypot(x - cx, y - cy);
      if (d < bd + 10) { bd = d; sysBest = i; best = null; }
    });
    if (sysBest >= 0) { pickSystem?.(sysBest); return; }
    if (!best) return;
    const w = best.at.clone().applyQuaternion(q);
    if (w.z < 0.6) { target.copy(facing(best.at)); easing = 0.9; const id = best.id; setTimeout(() => { if (alive) pick(id); }, 700); return; }
    pick(best.id);
  }

  // ---- drawing
  let alive = true, raf = 0, then = performance.now();
  const resize = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // (Framed to fit whichever way the screen is: the globe a little inside the narrower side, with room round it.)
    camera.fov = w < h ? 2 * Math.atan(Math.tan(14.2 * RAD) / camera.aspect) / RAD : 28.4;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(box); resize();
  const tmp = new THREE.Vector3();
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - then) / 1000); then = now;
    if (!dragging) {
      idle += dt;
      if (easing > 0) { q.slerp(target, 1 - Math.exp(-dt * 3.2)); easing -= dt; }
      else if (Math.abs(spinX) + Math.abs(spinY) > 0.05) { turnBy(spinX, spinY); spinX *= Math.exp(-dt * 3.5); spinY *= Math.exp(-dt * 3.5); }
      // Left alone, it turns slowly about its own pole, as a globe given a push does.
      else if (idle > 2.5) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.05 * Math.min(1, (idle - 2.5) / 3)));
    }
    globe.quaternion.copy(q);
    camera.position.z += (dist - camera.position.z) * (1 - Math.exp(-dt * 8));
    // Worlds and names fade as they turn away, and are gone before the rim.
    // The chapter most in front is the one read: its figure, worlds and name full; the others faint, easing across as the globe turns.
    let front = -1, fz = -2;
    chapters.forEach((c, i) => { const z = tmp.copy(c.at).applyQuaternion(q).z; if (z > fz) { fz = z; front = i; } });
    chapters.forEach((c, i) => {
      c.focus.value += ((i === front ? 1 : 0) - c.focus.value) * (1 - Math.exp(-dt * 3));
      for (const l of c.lines) (l.material as THREE.LineDashedMaterial).opacity = (l.userData.base ??= (l.material as THREE.LineDashedMaterial).opacity) * (0.25 + 0.75 * c.focus.value);
    });
    // (Worlds gone well before the rim: drawn over everything, one there stood out past the globe's edge.)
    for (const m of markers) { const z = tmp.copy(m.at).applyQuaternion(q).z; (m.sprite.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.smoothstep(z, 0.3, 0.55) * (0.18 + 0.82 * chapters[m.chapter].focus.value); }
    for (const l of labels) {
      const z = tmp.copy(l.at).applyQuaternion(q).z;
      (l.sprite.material as THREE.SpriteMaterial).opacity = (l.near ? THREE.MathUtils.smoothstep(z, 0.8, 0.95) : THREE.MathUtils.smoothstep(z, 0.25, 0.6)) * l.weight * (l.chapter === undefined ? 1 : 0.35 + 0.65 * chapters[l.chapter].focus.value);
    }
    const t = now / 1000;
    for (const o of orbits) {
      const fade = THREE.MathUtils.smoothstep(tmp.copy(o.at).applyQuaternion(q).z, 0.12, 0.42);
      for (const p of o.planets) {
        const th = p.phase + t * p.speed;
        p.sprite.position.copy(o.at).addScaledVector(o.t1, Math.cos(th) * p.r).addScaledVector(o.t2, Math.sin(th) * p.r * 0.62).normalize().multiplyScalar(1.005);
      }
      for (const part of o.parts) { const m = (part as THREE.Sprite | THREE.Line).material as THREE.Material & { opacity: number }; m.opacity = part instanceof THREE.Line ? 0.35 * fade : fade; }
      (o.label.material as THREE.SpriteMaterial).opacity = fade * 0.8;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}

/**
 * Every world as it looks when first come to, drawn by the game itself (a frame of each, taken when the
 * game was built: see README), small, so an unplayed world is shown as itself, not a token.
 */
const PORTRAITS = import.meta.glob<string>('./portraits/*.webp', { eager: true, query: '?url', import: 'default' });
const portraitFor = (id: WorldId): string | undefined => PORTRAITS[`./portraits/${id}.webp`];

/**
 * A world's mark, drawn on a small canvas: a world that's been made, as it was left, lit from the upper
 * left as a ball is, ringed in gold; one not yet come to, only a dotted ring; its numeral under it.
 */
function markerTexture(id: WorldId, page: Page | undefined, here: boolean): THREE.CanvasTexture {
  // (Twice as wide as tall: the world on the left half, centred on its star; its numeral to the right of it,
  // so neighbouring worlds' numerals don't fall on each other's rings, as they did set beneath.)
  const w = worldOf(id), S = 192, cv = document.createElement('canvas');
  cv.width = S * 2; cv.height = S;
  const g = cv.getContext('2d')!, cx = S / 2, cy = S / 2, r = 62;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const numeral = (alpha: number) => {
    g.font = 'italic 64px Newsreader, "Iowan Old Style", Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = PALE;
    g.globalAlpha = alpha; g.fillText(w.numeral, S + 4, cy + 4); g.globalAlpha = 1;
  };
  const ring = () => {
    g.lineWidth = 6; g.strokeStyle = GOLD;
    g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.stroke();
    if (here) { g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r + 22, 0, Math.PI * 2); g.stroke(); }
    numeral(0.95);
    tex.needsUpdate = true;
  };
  // A world not yet come to: a small pale star on its star, waiting to be found (the one you're on, ringed).
  if (!page) {
    const st = g.createRadialGradient(cx, cy, 0, cx, cy, 30);
    st.addColorStop(0, 'rgba(239,231,211,0.95)'); st.addColorStop(0.35, 'rgba(239,231,211,0.5)'); st.addColorStop(1, 'rgba(239,231,211,0)');
    g.fillStyle = st; g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill();
    if (here) { g.lineWidth = 4; g.strokeStyle = GOLD; g.beginPath(); g.arc(cx, cy, 50, 0, Math.PI * 2); g.stroke(); }
    numeral(here ? 0.9 : 0.5);
    return tex;
  }
  // (Its roundness: the lamp's light on it, falling away to the lower right, and a darker rim.)
  const shade = () => {
    const lit = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.1, cx, cy, r * 1.02);
    lit.addColorStop(0, 'rgba(255,248,232,0.16)'); lit.addColorStop(0.55, 'rgba(27,35,65,0)'); lit.addColorStop(1, 'rgba(27,35,65,0.5)');
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); g.fillStyle = lit; g.fillRect(0, 0, S, S); g.restore();
  };
  // A world made: itself, as it was left, filled and ringed in gold.
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); g.fillStyle = w.palette.paper; g.fillRect(0, 0, S, S); g.restore();
  shade(); ring();
  const src = page.portrait || portraitFor(id);
  if (src) {
    const img = new Image();
    img.onload = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); g.drawImage(img, cx - r, cy - r, r * 2, r * 2); g.restore();
      shade(); ring();
    };
    img.src = src;
  }
  return tex;
}

/** A constellation's name, lettered as on the old globes: spaced capitals in gold, the chapter beneath in italic. */
function labelTexture(name: string, chapter: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 160;
  const g = cv.getContext('2d')!;
  g.textAlign = 'center';
  g.fillStyle = GOLD; g.font = '34px Newsreader, "Iowan Old Style", Georgia, serif';
  const spaced = name.toUpperCase().split('').join(' ');
  g.fillText(spaced, 320, 62);
  g.fillStyle = PALE; g.globalAlpha = 0.8; g.font = 'italic 30px Newsreader, "Iowan Old Style", Georgia, serif';
  g.fillText(chapter, 320, 112);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A solar system's own star: a small gold point with a soft glow, as the old charts mark a star of note. */
function sunTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.18, 'rgba(226,194,122,1)'); rg.addColorStop(0.45, 'rgba(226,194,122,0.35)'); rg.addColorStop(1, 'rgba(226,194,122,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** One of its worlds: filled in that world's own colour if it was made, an empty ring if not. */
function planetTexture(colour: string, made: boolean): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2);
  if (made) { g.fillStyle = colour; g.fill(); g.lineWidth = 4; g.strokeStyle = GOLD; g.stroke(); }
  else { g.lineWidth = 4; g.strokeStyle = 'rgba(239,231,211,0.7)'; g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
