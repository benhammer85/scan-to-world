/**
 * The vent's smoke, drawn as a map's sign rather than as smoke: a few engraved strokes curling up
 * from the mouth, always upright on the page, as an old atlas draws a burning mountain, whatever way
 * the world is turned. It reads the pressure as the smoke did: one faint stroke at rest; more, and
 * taller, as the heat builds; inked heavier once letting it out would burst, and darkest at the brink;
 * some strokes gold where a burst wants two things at once and both are so.
 *
 * (Real smoke, puffs drifting with a wind, read differently from every side: a blob seen from above,
 * a stream off the edge at the rim, and always moving, it drew the eye from everything else. The
 * burst's own cloud is still drawn as a cloud: it's a moment, and then gone.)
 */
import * as THREE from 'three';

/** How many strokes at most, and how tall the sign stands at its fullest (the world's radius is 1). */
const TALL = 0.34;
export type SignKind = 'puffs' | 'wash';

/** A woodblock's smoke: a short stack of round billows, flat paper with a fine inked edge, rising slowly and melting away at the top. */
const PUFFS = `
          float d = 1e3;
          float ph = fract(uTime * 0.045);
          for (int i = 0; i < 6; i++) {
            float k = (float(i) + ph) / 6.0;
            float r = mix(0.045, 0.125, k) * (0.8 + 0.4 * uShare) * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.7, 1.0, k));
            vec2 c = vec2(0.025 * sin(k * 5.0 + uTime * 0.18) + 0.05 * k * k, k * tall + 0.03);
            d = smin(d, length(p - c) - r, 0.025);
          }
          float aa = fwidth(d) * 1.2;
          float fill = 1.0 - smoothstep(-aa, 0.0, d);
          float edge = 1.0 - smoothstep(0.0025, 0.0025 + aa, abs(d + 0.001));
          vec3 paper = mix(vec3(0.985, 0.968, 0.93), vec3(0.62, 0.58, 0.53), dark * 0.85);
          vec3 line = gold > 0.5 ? uGold : uInk;
          float a = max(fill * 0.9, edge * 0.75) * uShow * foot;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(paper, line, edge * (1.0 - fill * 0.4)), a);`;

/** A watercolour's smoke: a soft column of pale wash, its edge ragged and a little darker where the pigment pooled, drifting slowly up. */
const WASH = `
          float cx = 0.03 * sin(p.y * 3.0 + uTime * 0.15) + 0.06 * p.y * p.y;
          float hw = mix(0.03, 0.12, clamp(p.y / tall, 0.0, 1.0)) * (0.8 + 0.4 * uShare);
          float n = n2(vec2(p.x * 9.0, p.y * 6.0 - uTime * 0.12)) * 0.6 + n2(vec2(p.x * 23.0, p.y * 17.0 - uTime * 0.2)) * 0.4;
          float off = abs(p.x - cx) + (n - 0.5) * 0.045;
          float body = 1.0 - smoothstep(hw * 0.75, hw, off);
          float pooled = smoothstep(hw * 0.5, hw * 0.92, off) * body;
          float top = 1.0 - smoothstep(tall - 0.18, tall + 0.04, p.y + (n - 0.5) * 0.1);
          vec3 col = mix(vec3(0.80, 0.75, 0.68), vec3(0.37, 0.32, 0.27), dark);
          col = mix(col, uGold, gold * 0.45);
          col = mix(col, col * 0.78, pooled);
          float a = (body * (0.38 + 0.32 * dark) + pooled * 0.18) * top * uShow * foot;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);`;

export class SmokeSign {
  readonly object: THREE.Mesh;
  private readonly u: Record<string, THREE.IUniform>;
  private shown = 0;
  private share = 0;
  private stage = 0;

  constructor(ink: THREE.Color, gold: THREE.Color, kind: SignKind = 'puffs') {
    this.u = {
      uTime: { value: 0 },
      uShow: { value: 0 },
      uShare: { value: 0 },
      uStage: { value: 0 },
      uInk: { value: ink },
      uGold: { value: gold },
      uTall: { value: TALL },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTall;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // Upright on the page, standing on the vent: the quad's foot at the vent, its height up the screen.
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float scale = length(modelMatrix[0].xyz);
          mv.xy += vec2(position.x * 0.9, position.y + 0.5) * uTall * scale;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uShow, uShare, uStage;
        uniform vec3 uInk, uGold;
        varying vec2 vUv;
        float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
        float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
        void main() {
          // Across and up, in the same measure (the sign's height is 1).
          vec2 p = vec2((vUv.x - 0.5) * 0.9, vUv.y);
          float tall = 0.38 + 0.62 * uShare;
          float dark = uStage - 2.0 * step(1.75, uStage); // (0 white, 0.5 grey, 1 at the brink; past 2, the same with gold)
          float gold = step(1.75, uStage);
          float foot = smoothstep(0.0, 0.03, p.y);
${kind === 'wash' ? WASH : PUFFS}
        }`,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  /**
   * Each frame: where the vent is (in the world's frame), whether it's to be seen (0 to 1: the vent
   * facing us, and smoking), how high the heat is (0 to 1 of what the cone holds), and its stage.
   */
  update(dt: number, at: THREE.Vector3, show: number, share: number, stage: number): void {
    this.shown += (show - this.shown) * Math.min(1, dt * 2.5);
    this.share += (share - this.share) * Math.min(1, dt * 1.5);
    // (The stage steps rather than eases: it's a sign, and a sign changes when the thing it says does.)
    this.stage = stage;
    this.object.position.copy(at);
    this.u.uTime.value += dt;
    this.u.uShow.value = this.shown;
    this.u.uShare.value = this.share;
    this.u.uStage.value = this.stage;
    this.object.visible = this.shown > 0.01;
  }
}
