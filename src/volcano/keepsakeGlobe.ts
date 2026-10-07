/**
 * A world kept small: its ground as it was left (heights, and where the fire laid new rock, where life
 * took hold, where ash lies), packed a byte or two a point, so the atlas's card can show it again as a
 * little globe, turning slowly in the lamp's light. A world not yet made shows its ground untouched.
 */
import * as THREE from 'three';
import type { Topology } from '../mesh/topology';
import type { Planet } from './sim';
import { worldOf, type WorldId } from './worlds';

const SPAN = 0.6; // (heights kept between -SPAN and SPAN, a 127th of it a step: finer than the eye can tell on a globe this small)
const NEW = 1, LIFE = 2, ASH = 4, MOLTEN = 8;

/** The world as it is now, packed: a byte of height and a byte of what lies there, each point; as base64. */
export function keepsakeOf(pl: Planet): string {
  const n = pl.rock.length, out = new Uint8Array(n * 2);
  for (let v = 0; v < n; v++) {
    out[v] = (Math.round(Math.max(-1, Math.min(1, (pl.rock[v] + pl.lava[v]) / SPAN)) * 127) + 256) & 255;
    out[n + v] = (pl.rock[v] - pl.start[v] > 2e-4 ? NEW : 0) | (pl.life[v] >= 0.3 ? LIFE : 0) | (pl.ash[v] > 0.002 ? ASH : 0) | (pl.lava[v] > 0.002 ? MOLTEN : 0);
  }
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}

function unpack(b64: string, n: number): { h: Float32Array; k: Uint8Array } | null {
  const raw = atob(b64);
  if (raw.length !== n * 2) return null;
  const h = new Float32Array(n), k = new Uint8Array(n);
  for (let v = 0; v < n; v++) { const c = raw.charCodeAt(v); h[v] = ((c > 127 ? c - 256 : c) / 127) * SPAN; k[v] = raw.charCodeAt(n + v); }
  return { h, k };
}

/** The little globe's mesh: the world's points raised by their heights (more than in life, as a relief globe is), coloured as its map is. */
function meshOf(topo: Topology, id: WorldId, h: Float32Array, k: Uint8Array): THREE.BufferGeometry {
  const P = worldOf(id).palette, n = topo.vertexCount, b = topo.basePositions;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(), paper = new THREE.Color(P.paper), basalt = new THREE.Color(P.basalt), ash = new THREE.Color(P.ash);
  const shallow = new THREE.Color(P.shallow), deep = new THREE.Color(P.deep), lava = new THREE.Color(P.lava), life = new THREE.Color('#86a061');
  const high = new THREE.Color(P.landInk);
  for (let v = 0; v < n; v++) {
    const r = 1 + Math.max(0, h[v]) * 0.32 + Math.min(0, h[v]) * 0.04;
    pos[v * 3] = b[v * 3] * r; pos[v * 3 + 1] = b[v * 3 + 1] * r; pos[v * 3 + 2] = b[v * 3 + 2] * r;
    if (h[v] < 0 && !(k[v] & NEW)) c.copy(shallow).lerp(deep, Math.min(1, -h[v] / 0.3));
    else {
      c.copy(paper).lerp(high, Math.min(0.35, Math.max(0, h[v]) * 0.6));
      if (k[v] & ASH) c.lerp(ash, 0.6);
      if (k[v] & NEW) c.copy(basalt).lerp(high, Math.min(0.3, Math.max(0, h[v]) * 0.4));
      if (k[v] & LIFE) c.lerp(life, 0.75);
      if (k[v] & MOLTEN) c.copy(lava);
    }
    col.set([c.r, c.g, c.b], v * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(topo.triangles, 1));
  g.computeVertexNormals();
  return g;
}

/** Worlds not yet made, as they'd be shown, once made fresh this session. */
const untouched = new Map<string, string>();

/**
 * A world, kept or untouched, as a little globe turning in `box`: lit from the upper left as the
 * worlds are, turning slowly, and turned by a finger. Returns a way to put it away.
 */
export function turningGlobe(box: HTMLElement, topo: Topology, id: WorldId, keepsake: string | undefined, fresh: () => Planet): { dispose(): void } {
  // (A world not yet made is made fresh to be shown, which takes a moment: the card shows first, the
  // globe comes in when it's ready, and it's remembered for the next time.)
  let gone = false, shown: { dispose(): void } | null = null;
  const show = () => {
    if (gone) return;
    let data = keepsake ? unpack(keepsake, topo.vertexCount) : null;
    if (!data) { let k = untouched.get(id); if (!k) { k = keepsakeOf(fresh()); untouched.set(id, k); } data = unpack(k, topo.vertexCount)!; }
    shown = draw(box, topo, id, data);
  };
  if (keepsake || untouched.has(id)) show(); else setTimeout(show, 60);
  return { dispose() { gone = true; shown?.dispose(); } };
}

function draw(box: HTMLElement, topo: Topology, id: WorldId, data: { h: Float32Array; k: Uint8Array }): { dispose(): void } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;opacity:0;transition:opacity 0.6s ease';
  box.appendChild(canvas);
  requestAnimationFrame(() => requestAnimationFrame(() => { canvas.style.opacity = '1'; }));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  camera.position.set(0, 0, 5.4);
  const geo = meshOf(topo, id, data.h, data.k), mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const world = new THREE.Mesh(geo, mat), tilt = new THREE.Group();
  tilt.rotation.x = 0.38; tilt.rotation.z = -0.12; // (held a little tipped towards you, as a globe on a desk is looked at)
  tilt.add(world); scene.add(tilt);
  // The lamp, from the upper left and in front, as everywhere; and a little light from the room.
  const lamp = new THREE.DirectionalLight(0xffffff, 2.3); lamp.position.set(-0.55, 0.6, 0.6); scene.add(lamp);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const resize = () => { const w = box.clientWidth, h = box.clientHeight; if (w > 1 && h > 1) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } };
  const ro = new ResizeObserver(resize); ro.observe(box); resize();
  let alive = true, raf = 0, then = performance.now(), spin = 0.32, dragging = false, lastX = 0, lastY = 0, vx = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; vx = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    world.rotation.y += dx * 0.012; tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + dy * 0.008, -1.1, 1.1); vx = dx * 0.012;
  });
  const up = () => { dragging = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - then) / 1000); then = now;
    if (!dragging) {
      // (Let go, it carries on, settling back to its slow turn.)
      world.rotation.y += vx + spin * dt;
      vx *= Math.exp(-dt * 3);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return {
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); geo.dispose(); mat.dispose(); renderer.dispose(); canvas.remove(); },
  };
}
