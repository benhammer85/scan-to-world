/**
 * Puffs: steam where lava meets the sea, ash thrown up by a burst, and the smoke of a vent under
 * pressure, each a billow drawn as a print draws smoke: a lumpy shape in two flat tones (lit above,
 * shadowed beneath, the shadow warmed red by lava below it while it's young), growing as it rises,
 * overlapping its neighbours into a plume, and at the end breaking up into specks rather than
 * fading. (They were fine dots of stipple, rising in strings, which looked like beads.) Embers, and
 * the dust a storm drives, stay dots. A fixed number of them, reused in turn, so there's never more
 * than the page can bear.
 *
 * Calm (the quiet print): smoke in three plain stages (`dark`): white steam outlined in fine ink, grey
 * stippled, black solid; steam a pale blue-white; a burst's ash dark. Small puffs in a close stream from
 * the vent's mouth, so they make one column standing on it, leaning with the breeze; and a burst's ash
 * casts a faint shadow on the map, away from the light, further the higher it's risen, as a map-maker
 * shows height without perspective.
 */
import * as THREE from 'three';
import { rimGlsl } from '../render/rim';

export type PuffKind = 'steam' | 'ash' | 'smoke' | 'ember' | 'dust' | 'spark' | 'haze' | 'fall';

// ('fall': dust thrown up on a world without air, drawn as the dust is but flying as the embers do, in clean arcs.)
const TINT: Record<PuffKind, number> = { steam: 0, ash: 1, smoke: 2, ember: 3, dust: 4, spark: 5, haze: 6, fall: 4 };
const MOST = 1200;

interface Puff { alive: boolean; age: number; life: number; x: number; y: number; z: number; ux: number; uy: number; uz: number; rise: number; size: number; grow: number; kind: number; nx: number; ny: number; nz: number; vz: number; warm: number; dark: number; sx: number; sy: number; sz: number; arc: boolean; ceil: number; ox: number; oy: number; oz: number; out: number; spd: number }

export class Puffs {
  readonly object: THREE.Points;
  /** The plume's shadow on the map: drawn only when calm. */
  readonly shadow: THREE.Points;
  /** Smoke as bare paper, a column, its shadow; no red beneath it (the quiet print). */
  get calm(): boolean { return this.calmNow; }
  set calm(on: boolean) {
    this.calmNow = on;
    (this.object.material as THREE.ShaderMaterial).uniforms.uCalm.value = on ? 1 : 0;
    this.shadow.visible = on;
  }
  private calmNow = false;
  /** An ice moon: embers and ash in frost, not fire. */
  set ice(on: boolean) { (this.object.material as THREE.ShaderMaterial).uniforms.uIce.value = on ? 1 : 0; }
  private puffs: Puff[] = [];
  private nextSlot = 0;
  private position = new Float32Array(MOST * 3);
  private alpha = new Float32Array(MOST);
  private size = new Float32Array(MOST);
  private tint = new Float32Array(MOST);
  private seed = new Float32Array(MOST);
  private life = new Float32Array(MOST);
  private warmth = new Float32Array(MOST);
  private darkness = new Float32Array(MOST);
  private risen = new Float32Array(MOST);

  constructor(pixelRatio: number) {
    for (let i = 0; i < MOST; i++) this.puffs.push({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, ux: 0, uy: 0, uz: 0, rise: 0, size: 0, grow: 0, kind: 0, nx: 0, ny: 0, nz: 0, vz: 0, warm: 0, dark: 0, sx: 0, sy: 0, sz: 0, arc: false, ceil: 0, ox: 0, oy: 0, oz: 0, out: 0, spd: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aWarm', new THREE.BufferAttribute(this.warmth, 1));
    g.setAttribute('aDark', new THREE.BufferAttribute(this.darkness, 1));
    g.setAttribute('aRise', new THREE.BufferAttribute(this.risen, 1));
    const make = (shadow: boolean) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Drawn over the map, as an engraver draws smoke over the land it rises from, rather than
      // lost behind the slope it drifts up (the far side of the world fades it away regardless).
      depthTest: false,
      uniforms: { uScale: { value: 900 * pixelRatio }, uCalm: { value: 0 }, uIce: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aAlpha;
        attribute float aSize;
        attribute float aTint;
        attribute float aSeed;
        attribute float aLife;
        attribute float aWarm;
        attribute float aDark;
        attribute float aRise;
        varying float vDark;
        varying float vRise;
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        varying float vLife;
        varying float vWarm;
        ${rimGlsl}
        void main() {
          vec4 v = modelViewMatrix * vec4(position, 1.0);
          ${shadow ? 'v.xy += vec2(0.55, -0.8) * aRise * 0.9; // the shadow: down and to the right, away from the light, as far as it has risen' : ''}
          gl_Position = projectionMatrix * v;
          gl_PointSize = aSize * uScale / -v.z;
          ${shadow ? 'vec4 cS = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); vAlpha = aAlpha * rimFade(position, v) * (1.0 - smoothstep(-0.06, 0.0, length(v.xy - cS.xy) - 1.0)); // (its shadow lies on the map, so it thins at the rim as the map\'s ink does; and only on the world: past its edge there is no ground for it to fall on)' : `// Hidden only where the world stands in front of it: on its far side and inside its outline. (It was faded as
          // the map's ink is, by how squarely the ground under it faced us, so a column turned towards the rim vanished,
          // even where it rose into open sky beyond the edge.)
          // Seen along the line from the eye: hidden if that line meets the world before it reaches the puff (so behind
          // it, or inside it), and only just inside its outline, by perspective's own outline, not the flat disc's.
          vec3 cW = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float R = length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz) * 0.99;
          float L = length(v.xyz); vec3 ray = v.xyz / L;
          float tc = dot(cW, ray), miss = dot(cW, cW) - tc * tc;
          float front = tc - sqrt(max(0.0, R * R - miss));
          float onWorld = 1.0 - smoothstep(R * R * 0.94, R * R * 1.0, miss);
          float past = smoothstep(-0.02, 0.03, L - front);
          vAlpha = aAlpha * (1.0 - past * onWorld);`}
          vTint = aTint;
          vSeed = aSeed;
          vPx = gl_PointSize;
          vLife = aLife;
          vWarm = aWarm;
          vDark = aDark;
          vRise = aRise;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vTint;
        varying float vSeed;
        varying float vPx;
        varying float vLife;
        varying float vWarm;
        varying float vDark;
        varying float vRise;
        uniform float uCalm;
        uniform float uIce;
        // (Hashed without sin, which phones work out roughly.)
        float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float n2(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y);
        }
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * 2.0;
          if (vTint > 2.5) {
            ${shadow ? 'discard;' : ''}
            // Embers and dust: a round dot with a soft edge a pixel wide, a touch larger or smaller by its own seed.
            float r = vPx * 0.5 * (0.75 + 0.25 * vSeed);
            float a = vAlpha * clamp(r - length(q) * vPx * 0.5 + 0.5, 0.0, 1.0);
            // (Heat over open lava: a soft warm breath of air, no edge at all.)
            if (vTint > 5.5) a = vAlpha * pow(max(0.0, 1.0 - length(q)), 1.6);
            if (a <= 0.01) discard;
            vec3 ember = mix(vec3(0.91, 0.47, 0.18), vec3(0.75, 0.9, 1.0), uIce); // (on the ice moons, the embers are frost)
            gl_FragColor = vec4(vTint > 5.5 ? mix(vec3(1.0, 0.68, 0.42), vec3(0.85, 0.93, 1.0), uIce) : vTint > 4.5 ? mix(vec3(1.0, 0.66, 0.28), vec3(0.85, 0.95, 1.0), uIce) : vTint < 3.5 ? ember : vec3(0.24, 0.18, 0.14), a);
          } else {
            // A billow: its edge lumpy, the lumps turning slowly as it rises.
            float d = length(q), ang = atan(q.y, q.x), t = vLife * 4.0;
            vec2 ca = vec2(cos(ang), sin(ang));
            float lump = n2(ca * 1.3 + vSeed * 17.0 + t * 0.3) * 0.7 + n2(ca * 3.6 + vSeed * 5.0 - t * 0.5) * 0.3; // (broad lobes, as a cauliflower's)
            // (Its edge softening as it ages and spreads, as smoke's does.)
            float edge = 0.45 + 0.5 * lump, aa = 2.5 / max(vPx, 1.0) + 0.16 * smoothstep(0.2, 1.0, vLife);
            float cover = 1.0 - smoothstep(edge - aa, edge + aa, d);
            // A fringe of halftone dots beyond its edge, thinning outward, so it's vapour and not a stone.
            vec2 cell = gl_PointCoord * vPx / 3.2, cf = fract(cell) - 0.5;
            float fr = (d - edge) / max(1.0 - edge, 0.05), dotR = 0.42 * (1.0 - fr) * step(0.0, fr);
            float fringe = (1.0 - smoothstep(dotR - 0.15, dotR + 0.15, length(cf))) * step(h2(floor(cell) + vSeed * 13.0), 0.6) * 0.7;
            cover = max(cover, fringe * 0.8 * (1.0 - smoothstep(0.3, 0.8, vLife)));
            // Lit from above and to the left (as the world is), shadowed beneath: two flat tones.
            float lit = 1.0 - smoothstep(edge * 0.74 - aa, edge * 0.74 + aa, length(q - vec2(-0.2, -0.28)) + 0.18 * (n2(q * 3.0 + vSeed * 9.0) - 0.5));
            // Old, it thins: soft holes open in it and widen, drifting a little, until it's gone. (It broke
            // up into hard specks of paper, which read as noise, and a puff seemed to pop rather than go.)
            float wisp = n2(q * 2.4 + vSeed * 31.0 + vec2(t * 0.15, -t * 0.1)) * 0.65 + n2(q * 5.5 + vSeed * 7.0 - t * 0.2) * 0.35;
            float thin = smoothstep(0.35, 1.0, vLife);
            cover *= smoothstep(thin - 0.18, thin + 0.18, wisp + 0.15 * (1.0 - thin));
            float a = vAlpha * cover;
            if (a <= 0.01) discard;
            ${shadow ? `// (Only once it has risen, sliding out from under it: at the vent, the shadows of the newest puffs piled up into a dark ball.)
            // (None for the vent's smoke: off to one side, its shadow read as a second column from somewhere else.)
            if (vTint > 1.5) discard;
            gl_FragColor = vec4(0.3, 0.25, 0.2, a * (vTint < 1.5 && vTint > 0.5 ? 0.22 : 0.16) * smoothstep(0.03, 0.12, vRise));` : `vec3 shade = vTint < 0.5 ? vec3(0.32, 0.42, 0.5) : vTint < 1.5 ? vec3(0.06, 0.05, 0.05) : vec3(0.17, 0.15, 0.15);
            vec3 light = vTint < 0.5 ? vec3(0.72, 0.78, 0.8) : vTint < 1.5 ? vec3(0.26, 0.23, 0.21) : vec3(0.56, 0.5, 0.44);
            // (Calm, as the quiet print draws it: smoke the paper left bare, a cream a little lighter than
            // the page, darkening only at the brink; steam a pale blue-white; ash as it is.)
            // (The grey only once a puff has risen: at the vent, the newest piled into a grey ball over the glow.)
            // (Smoke in three plain stages, by vDark: white steam (0), grey with ash (0.5), black, heavy with ash
            // (1); from the vent's mouth up, darkest at its foot as a real column is.)
            float rdy = step(1.5, vDark), stg = vDark - 2.0 * rdy; // (past 2: both things a burst wants are so)
            float gS = smoothstep(0.1, 0.5, stg), bS = smoothstep(0.52, 0.78, stg); // (black by the brink, when the phone shudders)
            vec3 sShade = mix(mix(vec3(0.86, 0.84, 0.8), vec3(0.47, 0.45, 0.43), gS), vec3(0.09, 0.08, 0.08), bS);
            vec3 sLight = mix(mix(vec3(1.0, 0.99, 0.96), vec3(0.66, 0.64, 0.61), gS), vec3(0.22, 0.2, 0.19), bS);
            vec3 cShade = vTint < 0.5 ? vec3(0.72, 0.8, 0.86) : vTint < 1.5 ? shade : sShade;
            vec3 cLight = vTint < 0.5 ? vec3(0.92, 0.96, 0.98) : vTint < 1.5 ? light : sLight;
            shade = mix(shade, cShade, uCalm); light = mix(light, cLight, uCalm);
            // (On the ice moons a burst's ash is frost, as the ground draws it.)
            if (vTint > 0.5 && vTint < 1.5) { shade = mix(shade, vec3(0.5, 0.62, 0.72), uIce); light = mix(light, vec3(0.86, 0.92, 0.96), uIce); }
            vec3 c = mix(shade, light, lit);
            if (uCalm > 0.5 && vTint > 1.5) {
              // Engraved, so it reads on pale ground: white steam outlined in fine ink round each billow;
              // grey stippled in dots, as an engraver tones a middle grey; black solid.
              float ring = (1.0 - smoothstep(0.0, 1.6 / max(vPx, 1.0) + 0.04, abs(d - edge))) * (1.0 - smoothstep(0.4, 0.9, vLife)) * smoothstep(0.38, 0.62, n2(ca * 2.2 + vSeed * 11.0)); // (sketched, broken: a whole ring round every puff read as a cartoon's)
              c = mix(c, vec3(0.3, 0.26, 0.22), ring * mix(0.75, 0.3, gS) * (1.0 - bS) * (1.0 - rdy));
              // Ready, both ways: the outline gold, a little bolder, the one sign for "now".
              float ringG = (1.0 - smoothstep(0.0, 2.4 / max(vPx, 1.0) + 0.06, abs(d - edge))) * (1.0 - smoothstep(0.5, 0.95, vLife));
              c = mix(c, c * vec3(1.18, 0.98, 0.72) + vec3(0.1, 0.06, 0.0), rdy * 0.6); // (and warmed through, so a whole column says it, not only the edges, which overlap and hide)
              c = mix(c, vec3(0.95, 0.68, 0.22), ringG * rdy * 0.95);
              vec2 sc = gl_PointCoord * vPx / 2.6, sf = fract(sc) - 0.5;
              float sdot = 1.0 - smoothstep(0.22, 0.34, length(sf + 0.15 * (vec2(h2(floor(sc) + 3.0), h2(floor(sc) + 7.0)) - 0.5)));
              c = mix(c, vec3(0.2, 0.18, 0.17), sdot * gS * (1.0 - bS) * 0.55);
            }
            // Young, over lava, its underside is lit red from below.
            c = mix(c, vec3(0.26, 0.035, 0.015), 0.75 * vWarm * (1.0 - lit) * (1.0 - smoothstep(0.03, 0.22, vLife))); // (only the youngest, and only beneath: more turned them pink)
            gl_FragColor = vec4(c, a);`}
          }
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Points(g, make(false));
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
    this.shadow = new THREE.Points(g, make(true));
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 3;
    this.shadow.visible = false;
  }

  /**
   * A puff at a point on the ground (in the planet's frame), rising along its up; or, given a
   * way to drift (`dir`, in the same frame), mostly that way, as smoke drawn on a map goes up the page.
   */
  /**
   * A billow of an eruption cloud (`cloud`): it rises up its column to `ceil` (as far as the world's radius
   * is one), then spreads out along the ground's way `out`, flattening into the umbrella a great eruption
   * spreads at the top of its column, and drifts with the wind (`dir`).
   */
  add(kind: PuffKind, x: number, y: number, z: number, strength = 1, rand = Math.random, dir?: { x: number; y: number; z: number }, warm = 0, dark = 0, cloud?: { ceil: number; out: { x: number; y: number; z: number } }): void {
    const p = this.puffs[this.nextSlot];
    this.nextSlot = (this.nextSlot + 1) % MOST;
    const l = Math.hypot(x, y, z) || 1;
    // Up, tipped a little at random, so a column of them spreads as it goes.
    // (Calm, the smoke keeps closer together, so it's one column.)
    // (The drift along the ground only, never into it: what's left of it once its part straight up or down is taken out.)
    const dd = dir ?? { x: 0, y: 0, z: 0 }, dn = (dd.x * x + dd.y * y + dd.z * z) / (l * l), d = { x: dd.x - dn * x, y: dd.y - dn * y, z: dd.z - dn * z };
    const lean = dir ? (this.calm && kind === 'smoke' ? 2.1 : 1.6) : 0, spread = this.calm && kind === 'smoke' ? 0.3 : 0.5; // (calm smoke bent further downwind, and looser: a stack of round puffs straight up read as a chimney's)
    p.ux = x / l * 0.4 + d.x * lean + (rand() - 0.5) * spread; p.uy = y / l * 0.4 + d.y * lean + (rand() - 0.5) * spread; p.uz = z / l * 0.4 + d.z * lean + (rand() - 0.5) * spread;
    const ul = Math.hypot(p.ux, p.uy, p.uz); p.ux /= ul; p.uy /= ul; p.uz /= ul;
    p.x = x; p.y = y; p.z = z;
    p.sx = x; p.sy = y; p.sz = z;
    p.dark = dark;
    p.arc = kind === 'ember' || kind === 'fall';
    p.ceil = cloud ? cloud.ceil : 0; p.out = 0; p.spd = 0.12 + 0.88 * rand() * rand(); // (most spread little and some far, so the umbrella fills from the middle, not a ring)
    if (cloud) { p.ox = cloud.out.x; p.oy = cloud.out.y; p.oz = cloud.out.z; p.nx = x / l; p.ny = y / l; p.nz = z / l; }
    p.alive = true;
    p.age = 0;
    p.kind = TINT[kind];
    p.warm = this.calm ? 0 : warm;
    this.seed[this.nextSlot === 0 ? MOST - 1 : this.nextSlot - 1] = rand();
    if (kind === 'steam') { p.life = 2.6 + rand(); p.rise = 0.035; p.size = 0.03 + 0.02 * rand(); p.grow = 0.1; }
    else if (kind === 'ash') { p.life = 5 + rand() * 3; p.rise = 0.14 * strength * (0.6 + rand() * 0.8); p.size = 0.05 + 0.04 * rand(); p.grow = 0.2 + 0.12 * rand(); }
    if (kind === 'ash' && cloud) { p.life = 10 + rand() * 4; p.rise = 0.55 + 0.25 * rand(); p.size = 0.06 + 0.04 * rand(); p.grow = 0.4 + 0.2 * rand(); } // (big and overlapping, so they merge into one cloud)
    else if (kind === 'dust') { p.life = 4 + rand() * 3; p.rise = 0.06 * strength; p.size = 0.0035 + 0.0015 * strength; p.grow = 0.002; }
    else if (kind === 'ember' || kind === 'fall') {
      // Thrown up from the vent, out to one side, and falling back: an arc, not a drift.
      p.nx = x / l; p.ny = y / l; p.nz = z / l;
      const t = { x: p.ny * 0.3 - p.nz * 0.7, y: p.nz * 0.5 - p.nx * 0.3, z: p.nx * 0.7 - p.ny * 0.5 };
      const a = rand() * Math.PI * 2, b = { x: p.ny * t.z - p.nz * t.y, y: p.nz * t.x - p.nx * t.z, z: p.nx * t.y - p.ny * t.x };
      const tl = Math.hypot(t.x, t.y, t.z) || 1, bl = Math.hypot(b.x, b.y, b.z) || 1;
      p.ux = (t.x / tl) * Math.cos(a) + (b.x / bl) * Math.sin(a); p.uy = (t.y / tl) * Math.cos(a) + (b.y / bl) * Math.sin(a); p.uz = (t.z / tl) * Math.cos(a) + (b.z / bl) * Math.sin(a);
      p.rise = (0.02 + 0.05 * rand()) * strength;
      p.vz = (0.1 + 0.12 * rand()) * strength;
      p.life = 1.4 + rand() * 1.2; p.size = 0.009 + 0.004 * rand(); p.grow = -0.004; // (big enough to see as sparks, not specks)
      if (kind === 'fall') { p.rise *= 3.6; p.vz *= 1.6; p.life = 3.6 + rand() * 1.8; p.size = 0.013 + 0.008 * rand(); p.grow = 0; } // (far and high, nothing to slow it: out towards where its ring will lie) // (thrown far and high, as nothing slows it, and falling back in a ring)
    }
    else if (kind === 'spark') {
      // A spark off open lava: lifted slowly on the heat, wandering a little, fading as it cools.
      p.nx = x / l; p.ny = y / l; p.nz = z / l;
      const a = rand() * Math.PI * 2, t = { x: -p.nz, y: 0, z: p.nx }, tl = Math.hypot(t.x, t.z) || 1;
      p.ux = (t.x / tl) * Math.cos(a) + p.ny * 0.0; p.uy = Math.sin(a) * 0.6; p.uz = (t.z / tl) * Math.cos(a);
      p.rise = 0.006 + 0.008 * rand(); p.vz = 0.035 + 0.03 * rand();
      p.life = 1.8 + rand() * 1.6; p.size = 0.0068 + 0.003 * rand(); p.grow = -0.0035;
    }
    else if (kind === 'haze') { p.life = 2.2 + rand() * 1.2; p.rise = 0.03 + 0.02 * rand(); p.size = 0.05 + 0.03 * rand(); p.grow = 0.05; }
    else if (this.calm) { p.life = 5 + rand() * 2; p.rise = (0.08 + 0.04 * rand()) * strength; p.size = 0.016 + 0.006 * rand(); p.grow = 0.04 + 0.15 * strength; } // (a little bigger, so it's read at a glance)
    else { p.life = 4.5 + rand() * 3; p.rise = (0.1 + 0.06 * rand()) * strength; p.size = 0.008 + 0.006 * rand(); p.grow = 0.18 + 0.1 * strength; }
  }

  update(dt: number): void {
    for (let i = 0; i < MOST; i++) {
      const p = this.puffs[i];
      if (!p.alive) { this.alpha[i] = 0; continue; }
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.alpha[i] = 0; continue; }
      if (p.kind === 5) {
        // A spark: carried up on the heat, slowing as it rises.
        const slow = Math.exp(-p.age * 0.5);
        p.x += (p.ux * p.rise + p.nx * p.vz * slow) * dt; p.y += (p.uy * p.rise + p.ny * p.vz * slow) * dt; p.z += (p.uz * p.rise + p.nz * p.vz * slow) * dt;
      } else if (p.arc) {
        // An ember: out and up, and gravity bringing it back down.
        p.vz -= 0.2 * dt;
        p.x += (p.ux * p.rise + p.nx * p.vz) * dt; p.y += (p.uy * p.rise + p.ny * p.vz) * dt; p.z += (p.uz * p.rise + p.nz * p.vz) * dt;
      } else {
        // Rising, and slowing as it goes, as a column does once the heat has left it.
        if (p.ceil > 0) {
          // An eruption cloud's billow: up its column fast, then out along the ground at its ceiling, slowing as
          // it spreads, and carried with the wind.
          const up = Math.hypot(p.x - p.sx, p.y - p.sy, p.z - p.sz);
          if (up < p.ceil && p.out === 0) { const sp = p.rise * dt; p.x += p.nx * sp; p.y += p.ny * sp; p.z += p.nz * sp; }
          else { p.out += dt; const sp = 0.2 * p.spd * Math.exp(-p.out * 0.35) * dt; p.x += p.ox * sp + p.ux * 0.02 * dt; p.y += p.oy * sp + p.uy * 0.02 * dt; p.z += p.oz * sp + p.uz * 0.02 * dt; }
        } else {
        const slow = Math.exp(-p.age * (p.kind === 2 ? 0.18 : 0.45)) * (p.kind === 2 && this.calm ? Math.min(1, 0.3 + p.age * 1.4) : 1); // (smoke keeps rising, so the column stands tall; calm, it leaves the mouth slowly, so the column's foot stays on the vent)
        p.x += p.ux * p.rise * slow * dt; p.y += p.uy * p.rise * slow * dt; p.z += p.uz * p.rise * slow * dt;
        }
      }
      const f = p.age / p.life;
      this.position[i * 3] = p.x; this.position[i * 3 + 1] = p.y; this.position[i * 3 + 2] = p.z;
      this.size[i] = p.size + p.grow * f;
      // Coming in quickly, then fading slowly as it thins; smoke the strongest, so a wisp is seen.
      // (Billows come in quickly and then hold their tone, breaking up at the end in the shader; dots fade.)
      this.alpha[i] = p.kind === 5 ? 0.95 * Math.min(1, f * 6) * (1 - f) ** 1.3 : p.kind === 6 ? 0.13 * Math.min(1, f * 3) * (1 - f) ** 1.5 : (this.calm && p.kind !== 3 ? (p.kind === 2 ? 0.9 : 0.6) : 1) * (p.kind === 3 ? 0.95 * (1 - f) ** 0.7 : p.kind === 4 ? 0.7 * Math.min(1, f * 5) * (1 - f) ** 1.2 : (p.kind === 1 ? 0.85 : p.kind === 0 ? 0.6 : 0.72) * (p.kind === 2 ? (this.calm ? Math.min(1, f * 40) : Math.min(1, f * 1.4) ** 1.5) : Math.min(1, f * 8)) * (p.kind === 2 || p.kind === 0 ? 1 - Math.max(0, (f - 0.5) / 0.5) ** 1.6 : 1)); // (smoke leaves the vent a faint wisp, not a ball, except calm, where it stands on the vent at full strength; and thins away over its second half)
      this.tint[i] = p.kind;
      this.life[i] = f;
      this.warmth[i] = p.warm;
      this.darkness[i] = p.dark;
      this.risen[i] = Math.hypot(p.x - p.sx, p.y - p.sy, p.z - p.sz);
    }
    const g = this.object.geometry;
    for (const name of ['position', 'aAlpha', 'aSize', 'aTint', 'aSeed', 'aLife', 'aWarm', 'aDark', 'aRise']) g.getAttribute(name).needsUpdate = true;
  }
}
