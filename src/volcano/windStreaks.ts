/**
 * Wind, seen: while a dust storm is coming and while it blows, a few dozen faint brush strokes drift across the
 * mountain from the side the storm comes from, slow as they meet that side and part round it, so where it strikes
 * is plain without a mark to read. (A weather map's moving streaks, but sparse, only near the mountain and only
 * in a storm: a whole sky of them fought the lava for the eye.)
 */
import * as THREE from 'three';

type V = { x: number; y: number; z: number };
const STREAKS = 46, POINTS = 7;

interface Streak { pts: THREE.Vector3[]; age: number; life: number; speed: number }

export class WindStreaks {
  readonly object: THREE.LineSegments;
  private streaks: Streak[] = [];
  private position = new Float32Array(STREAKS * (POINTS - 1) * 2 * 3);
  private alpha = new Float32Array(STREAKS * (POINTS - 1) * 2);
  private fade = { value: 0 };
  private rand: () => number;

  /**
   * `storm` (Mars): from one side onto the mountain, parting round it. `drift` (the drying seas): an eruption's ash,
   * drifting with the planet's winds, one way, over everything round the volcano, as thick as the sky is with ash.
   */
  constructor(ink: string, private readonly mode: 'storm' | 'drift' = 'storm', seed = 7) {
    let s = seed;
    this.rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uInk: { value: new THREE.Color(ink) }, uFade: this.fade },
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main() {
          // (Faded out towards the world's edge and gone behind it: drawn over the ground, never through it.)
          vec3 n = normalize(normalMatrix * position);
          vA = aAlpha * smoothstep(0.05, 0.35, n.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uInk; uniform float uFade; varying float vA;
        void main() { gl_FragColor = vec4(uInk, vA * uFade); }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.object = new THREE.LineSegments(g, m);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
    for (let i = 0; i < STREAKS; i++) this.streaks.push({ pts: Array.from({ length: POINTS }, () => new THREE.Vector3()), age: 99, life: 1, speed: 0 });
  }

  /**
   * One step: the storm's side (`from`, along the ground at the vent, or null), the vent, how strong (0 none, up to 1 a
   * storm blowing), and how high above the ground to draw.
   */
  update(dt: number, from: V | null, vent: V, strength: number): void {
    this.fade.value += ((from ? strength : 0) - this.fade.value) * Math.min(1, dt * 1.5);
    this.object.visible = this.fade.value > 0.01;
    if (!this.object.visible || !from) return;
    const c = new THREE.Vector3(vent.x, vent.y, vent.z).normalize(), up = new THREE.Vector3(from.x, from.y, from.z).normalize(), side = new THREE.Vector3().crossVectors(c, up).normalize();
    const R = 1.03, step = new THREE.Vector3(), here = new THREE.Vector3();
    for (const st of this.streaks) {
      st.age += dt;
      if (st.age > st.life) {
        // (Born upwind, across a band as wide as the mountain and a little more, at a stagger; or, drifting ash, anywhere round the volcano.)
        const across = (this.rand() - 0.5) * (this.mode === 'drift' ? 1.6 : 0.7), back = this.mode === 'drift' ? (this.rand() - 0.5) * 1.6 : 0.32 + this.rand() * 0.25;
        here.copy(c).multiplyScalar(Math.cos(back)).addScaledVector(up, Math.sin(back)).addScaledVector(side, across).normalize().multiplyScalar(R);
        for (const p of st.pts) p.copy(here);
        st.age = 0; st.life = 2.5 + this.rand() * 2.5; st.speed = 0.12 + this.rand() * 0.08;
      }
      // Downwind, towards the vent's side and past it; slowed and turned aside as it meets the mountain's face.
      const head = st.pts[0], n = here.copy(head).normalize();
      step.copy(up).multiplyScalar(-1).addScaledVector(n, up.dot(n)).normalize();
      if (this.mode === 'drift') {
        for (let k = POINTS - 1; k > 0; k--) st.pts[k].lerp(st.pts[k - 1], Math.min(1, dt * 5));
        head.addScaledVector(step, st.speed * 0.5 * dt).normalize().multiplyScalar(R);
        continue;
      }
      const toVent = n.angleTo(c), facing = new THREE.Vector3().subVectors(n, c).dot(up) > 0;
      let speed = st.speed;
      if (toVent < 0.2 && facing) {
        speed *= 0.35 + 0.65 * (toVent / 0.2);
        const away = new THREE.Vector3().subVectors(n, c); away.addScaledVector(n, -away.dot(n));
        const sideways = away.dot(side) >= 0 ? side : side.clone().negate();
        step.addScaledVector(sideways, 0.9 * (1 - toVent / 0.2)).normalize();
      }
      for (let k = POINTS - 1; k > 0; k--) st.pts[k].lerp(st.pts[k - 1], Math.min(1, dt * 7));
      head.addScaledVector(step, speed * dt).normalize().multiplyScalar(R);
    }
    // Into the buffers: each streak a short run of segments, darkest at its head, fading along its tail, and in and out over its life.
    let o = 0, a = 0;
    for (const st of this.streaks) {
      const life = Math.min(1, st.age / 0.6, (st.life - st.age) / 0.8);
      for (let k = 0; k < POINTS - 1; k++) {
        const p = st.pts[k], q = st.pts[k + 1];
        this.position[o++] = p.x; this.position[o++] = p.y; this.position[o++] = p.z;
        this.position[o++] = q.x; this.position[o++] = q.y; this.position[o++] = q.z;
        const t = 0.38 * Math.max(0, life) * (1 - k / (POINTS - 1));
        this.alpha[a++] = t; this.alpha[a++] = t * (1 - 1 / (POINTS - 1));
      }
    }
    (this.object.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.object.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
