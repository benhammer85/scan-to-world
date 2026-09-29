/**
 * Standing figures drawn as cutouts: one small engraved sheet of
 * glyphs, and every figure one instance of a single quad, all drawn at once.
 *
 * Each stands upright on the page, as an old map's profile symbols do,
 * whatever the slope under it: upright to the eye, not to the ground. Its
 * depth is its footing's, so a hill or the far side of the world hides it
 * as it hides the ground it stands on, and a nearer figure overlaps a
 * farther one, as the engraver would have drawn them. Near the rim of the
 * world a figure folds down, like a pop-up book's as the page turns.
 */
import * as THREE from 'three';
import type { Figure, FigureKind } from '../life/figures';

const CELL = 128, COLS = 4, ROWS = 3;
const CELLS: Record<FigureKind | 'sails' | 'tree2', number> = { tree: 0, tree2: 1, fir: 2, spire: 3, tower: 4, mill: 5, sails: 6, keep: 7, ruin: 8, lighthouse: 9 };
/** Where a mill's sails turn on its body, as a share of its height. */
const HUB = (CELL - 46) / CELL;
const INK = '#2e2118', CARD = '#ece0c8';

export class StandingFigures {
  readonly object: THREE.Mesh;
  private geometry = new THREE.InstancedBufferGeometry();
  private material: THREE.ShaderMaterial;
  private born = new Map<string, number>();
  private clock = 0;

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.geometry.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uSheet: { value: sheet() }, uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      // Printed, not pasted on: the ink and the card's faint tone multiply the page under them,
      // so a figure is the colour of the ground it stands on, on any scan's colours.
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: true,
    });
    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  set(figures: Figure[]): void {
    const rows: { f: Figure; cell: number; lift: number; spin: number; key: string }[] = [];
    for (const f of figures) {
      const key = `${f.kind}|${f.at.map((x) => Math.round(x * 2000)).join(',')}`;
      const cell = f.kind === 'tree' && f.seed % 3 === 0 ? CELLS.tree2 : CELLS[f.kind];
      rows.push({ f, cell, lift: 0.5, spin: 0, key });
      if (f.kind === 'mill') rows.push({ f: { ...f, size: f.size * 0.95 }, cell: CELLS.sails, lift: HUB, spin: 0.5 + (f.seed % 5) * 0.03, key: key + '|sails' });
    }
    const n = rows.length;
    const pos = new Float32Array(n * 3), up = new Float32Array(n * 3), a = new Float32Array(n * 4), born = new Float32Array(n);
    const live = new Set<string>();
    rows.forEach((r, i) => {
      pos.set(r.f.at.slice(0, 3), i * 3);
      up.set(r.f.up.slice(0, 3), i * 3);
      a.set([r.f.size, r.cell, r.lift, r.spin], i * 4);
      live.add(r.key);
      if (!this.born.has(r.key)) this.born.set(r.key, this.clock);
      born[i] = this.born.get(r.key)!;
    });
    // Remembered a while after they go: the finer figures are left out while the world turns
    // and come back when it settles, and should come back standing, not grow again.
    if (this.born.size > live.size * 3) for (const k of this.born.keys()) if (!live.has(k)) this.born.delete(k);
    const g = this.geometry;
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('iUp', new THREE.InstancedBufferAttribute(up, 3));
    g.setAttribute('iShape', new THREE.InstancedBufferAttribute(a, 4));
    g.setAttribute('iBorn', new THREE.InstancedBufferAttribute(born, 1));
    g.instanceCount = n;
  }

  update(dt: number): void {
    this.clock += dt;
    this.material.uniforms.uTime.value = this.clock;
  }

  get count(): number {
    return this.geometry.instanceCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    (this.material.uniforms.uSheet.value as THREE.Texture).dispose();
  }
}

const vertexShader = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iUp;
attribute vec4 iShape; // size, cell, lift, spin
attribute float iBorn;
uniform float uTime;
varying vec2 vUv;
void main() {
  mat4 mv = viewMatrix * modelMatrix;
  vec4 foot = mv * vec4(iPos, 1.0);
  vec3 n = normalize(mat3(mv) * iUp);
  // Folds down towards the rim, and is gone past it.
  float facing = dot(n, normalize(-foot.xyz));
  float grow = smoothstep(0.0, 0.7, uTime - iBorn);
  float s = iShape.x * smoothstep(0.02, 0.3, facing) * grow;
  vec2 q = position.xy;
  float a = uTime * iShape.w + iPos.x * 40.0;
  if (iShape.w > 0.0) q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  vec4 at = foot + vec4(q.x * s, (q.y + iShape.z) * s, 0.0, 0.0);
  gl_Position = projectionMatrix * at;
  // Its depth is its footing's, brought a little towards the eye to clear the ground it stands on.
  vec4 base = projectionMatrix * vec4(foot.xyz + normalize(-foot.xyz) * 0.035, 1.0);
  gl_Position.z = (base.z / base.w) * gl_Position.w;
  float cell = iShape.y;
  vec2 c = vec2(mod(cell, ${COLS}.0), floor(cell / ${COLS}.0));
  vUv = (vec2(c.x, ${ROWS}.0 - 1.0 - c.y) + uv) / vec2(${COLS}.0, ${ROWS}.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uSheet;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uSheet, vUv);
  if (t.a < 0.05) discard;
  gl_FragColor = vec4(mix(vec3(1.0), t.rgb, t.a), 1.0);
}`;

/**
 * The sheet of glyphs, engraved once on a small canvas: each on a card of
 * the paper's colour, outlined in the town's ink, shaded by hatching down
 * its right side, as a copperplate symbol is.
 */
function sheet(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = CELL * COLS; cv.height = CELL * ROWS;
  const g = cv.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const at = (cell: number, draw: (g: CanvasRenderingContext2D) => void) => {
    g.save();
    g.translate((cell % COLS) * CELL, Math.floor(cell / COLS) * CELL);
    g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip();
    g.strokeStyle = INK; g.fillStyle = CARD; g.lineWidth = 3.4; // about the map's own line, at the size a figure is seen
    draw(g);
    g.restore();
  };
  const hatch = (g: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, step = 11) => {
    g.save(); g.clip(); g.lineWidth = 1.8; g.beginPath();
    for (let x = x0; x < x1 + (y1 - y0); x += step) { g.moveTo(x, y0); g.lineTo(x - (y1 - y0), y1); }
    g.stroke(); g.restore();
  };
  const ground = (g: CanvasRenderingContext2D, x0: number, x1: number) => { g.beginPath(); g.moveTo(x0, 123); g.lineTo(x1, 123); g.stroke(); };

  const crown = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, bumps: number) => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI, rr = r * (1 + 0.1 * Math.sin(a * bumps));
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.95;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  };
  // A round tree, and a taller one.
  for (const [cell, cy, r, top] of [[CELLS.tree, 56, 34, 88], [CELLS.tree2, 50, 28, 76]] as const) {
    at(cell, (g) => {
      g.beginPath(); g.moveTo(64, 122); g.lineTo(64, top); g.stroke();
      crown(g, 64, cy, r, cell === CELLS.tree ? 7 : 6); g.fill(); g.stroke();
      crown(g, 64, cy, r - 3, 7); hatch(g, 70, 64 + r, cy - r, cy + r);
      ground(g, 48, 84);
    });
  }
  at(CELLS.fir, (g) => {
    g.beginPath(); g.moveTo(64, 122); g.lineTo(64, 100); g.stroke();
    g.beginPath(); g.moveTo(64, 8);
    for (const [x, y] of [[80, 40], [72, 40], [90, 72], [78, 72], [98, 102], [30, 102], [50, 72], [38, 72], [56, 40], [48, 40]]) g.lineTo(x, y);
    g.closePath(); g.fill(); g.stroke();
    hatch(g, 66, 98, 8, 102);
    ground(g, 46, 84);
  });
  // A village church: its west tower and spire, the nave behind.
  at(CELLS.spire, (g) => {
    g.beginPath(); g.rect(74, 80, 40, 42); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(70, 80); g.lineTo(80, 64); g.lineTo(108, 64); g.lineTo(118, 80); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.rect(50, 56, 26, 66); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(48, 56); g.lineTo(63, 12); g.lineTo(78, 56); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(50, 56); g.lineTo(63, 12); g.lineTo(78, 56); hatch(g, 64, 78, 12, 56, 9);
    g.beginPath(); g.moveTo(63, 12); g.lineTo(63, 2); g.moveTo(58, 6); g.lineTo(68, 6); g.stroke();
    g.beginPath(); g.moveTo(63, 74); g.lineTo(63, 90); g.stroke();
    ground(g, 40, 122);
  });
  // A cathedral's great tower, battlemented, and its long nave.
  at(CELLS.tower, (g) => {
    g.beginPath(); g.rect(78, 70, 44, 52); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(74, 70); g.lineTo(84, 54); g.lineTo(116, 54); g.lineTo(124, 70); g.closePath(); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(40, 122); g.lineTo(40, 34);
    for (let i = 0; i < 5; i++) { const x = 40 + i * 9; g.lineTo(x, 26); g.lineTo(x + 4.5, 26); g.lineTo(x + 4.5, 34); g.lineTo(x + 9, 34); }
    g.lineTo(85, 122); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.rect(40, 34, 45, 88); hatch(g, 68, 85, 34, 122);
    for (const y of [50, 78]) { g.beginPath(); g.moveTo(56, y + 14); g.lineTo(56, y + 4); g.arc(62, y + 4, 6, Math.PI, 0); g.lineTo(68, y + 14); g.stroke(); }
    ground(g, 32, 126);
  });
  // A post mill: its body on the post and trestle, the ladder; the sails are their own glyph, and turn.
  at(CELLS.mill, (g) => {
    g.beginPath(); g.moveTo(64, 92); g.lineTo(44, 122); g.moveTo(64, 92); g.lineTo(84, 122); g.moveTo(64, 92); g.lineTo(64, 122); g.stroke();
    g.beginPath(); g.moveTo(46, 92); g.lineTo(46, 44); g.lineTo(64, 30); g.lineTo(82, 44); g.lineTo(82, 92); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(46, 92); g.lineTo(46, 44); g.lineTo(64, 30); g.lineTo(82, 44); g.lineTo(82, 92); g.closePath(); hatch(g, 68, 82, 30, 92);
    g.beginPath(); g.moveTo(82, 86); g.lineTo(104, 122); g.moveTo(90, 86); g.lineTo(112, 122); g.stroke();
    ground(g, 38, 116);
  });
  at(CELLS.sails, (g) => {
    g.translate(64, 64);
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((i * Math.PI) / 2);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -60); g.stroke();
      g.beginPath(); g.rect(2, -60, 13, 44); g.fill(); g.stroke();
      g.lineWidth = 1.8; g.beginPath(); for (const y of [-49, -38, -27]) { g.moveTo(2, y); g.lineTo(15, y); } g.stroke();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, 5, 0, 2 * Math.PI); g.fill(); g.stroke();
  });
  // A castle's keep: square, battlemented, a turret at each corner, the flag.
  const keep = (g: CanvasRenderingContext2D, broken: boolean) => {
    g.beginPath();
    g.moveTo(30, 122); g.lineTo(30, 44);
    if (broken) { for (const [x, y] of [[40, 38], [48, 50], [58, 42], [66, 58], [76, 46], [86, 62], [98, 52]]) g.lineTo(x, y); }
    else {
      g.lineTo(30, 28); g.lineTo(42, 28); g.lineTo(42, 44);
      for (let i = 0; i < 4; i++) { const x = 42 + i * 11; g.lineTo(x, 36); g.lineTo(x + 5.5, 36); g.lineTo(x + 5.5, 44); g.lineTo(x + 11, 44); }
      g.lineTo(86, 44); g.lineTo(86, 28); g.lineTo(98, 28);
    }
    g.lineTo(98, 122); g.closePath(); g.fill(); g.stroke();
    g.save(); hatch(g, 74, 98, 20, 122); g.restore();
    g.beginPath(); g.moveTo(58, 122); g.lineTo(58, 104); g.arc(64, 104, 6, Math.PI, 0); g.lineTo(70, 122); g.stroke();
    g.beginPath(); g.moveTo(50, 70); g.lineTo(50, 80); g.moveTo(78, 70); g.lineTo(78, 80); g.stroke();
    if (!broken) {
      g.beginPath(); g.moveTo(92, 28); g.lineTo(92, 6); g.stroke();
      g.beginPath(); g.moveTo(92, 6); g.lineTo(110, 11); g.lineTo(92, 16); g.fill(); g.stroke();
    }
    ground(g, 18, 112);
  };
  at(CELLS.keep, (g) => keep(g, false));
  at(CELLS.ruin, (g) => keep(g, true));
  at(CELLS.lighthouse, (g) => {
    g.beginPath(); g.moveTo(50, 122); g.lineTo(56, 44); g.lineTo(72, 44); g.lineTo(78, 122); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(50, 122); g.lineTo(56, 44); g.lineTo(72, 44); g.lineTo(78, 122); g.closePath(); hatch(g, 66, 78, 44, 122);
    for (const y of [70, 96]) { g.beginPath(); g.moveTo(53, y); g.lineTo(75, y); g.stroke(); }
    g.beginPath(); g.rect(54, 26, 20, 18); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(51, 26); g.lineTo(64, 14); g.lineTo(77, 26); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 2; g.beginPath();
    for (const [dx, dy] of [[-1, 0], [1, 0], [-0.8, -0.6], [0.8, -0.6]]) { g.moveTo(64 + dx * 16, 35 + dy * 12); g.lineTo(64 + dx * 28, 35 + dy * 20); }
    g.stroke();
    ground(g, 40, 90);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
