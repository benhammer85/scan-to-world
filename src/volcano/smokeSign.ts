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
const STROKES = 5, TALL = 0.34;

export class SmokeSign {
  readonly object: THREE.Mesh;
  private readonly u: Record<string, THREE.IUniform>;
  private shown = 0;
  private share = 0;
  private stage = 0;

  constructor(ink: THREE.Color, gold: THREE.Color) {
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
        void main() {
          // (Worked out before any branch: phones leave derivatives inside one undefined.)
          float aa = fwidth(vUv.x) * 1.2;
          float y = vUv.y;
          // As tall as the heat is high: a short wisp at rest, the whole sign at the brink.
          float tall = 0.42 + 0.58 * uShare;
          float top = 1.0 - smoothstep(tall - 0.22, tall, y);
          float foot = smoothstep(0.0, 0.05, y);
          float dark = uStage - 2.0 * step(1.75, uStage); // (0 white, 0.5 grey, 1 at the brink; past 2, the same with gold)
          float gold = step(1.75, uStage);
          float ink = 0.0, goldInk = 0.0;
          for (int i = 0; i < ${STROKES}; i++) {
            float fi = float(i), seed = fi * 2.399;
            // Each stroke comes in as the heat builds: one at rest, all of them near the brink.
            float on = smoothstep(fi / ${STROKES}.0 - 0.05, fi / ${STROKES}.0 + 0.15, uShare + 0.12);
            // Fanning a little as they rise, each swaying slowly on its own, wider the higher it goes,
            // and leaning a touch the same way, as a sign's smoke is drawn.
            float side = (fi - 2.0) * (0.012 + 0.11 * y * y);
            float sway = (sin(y * 4.6 - uTime * 0.5 + seed * 3.1) * 0.07 + sin(y * 2.1 + seed - uTime * 0.19) * 0.03) * y;
            // (Each hooks over at its tip, as an engraver ends a wisp of smoke in a curl, the outer ones outward.)
            float hook = smoothstep(tall - 0.3, tall, y) * (fi < 2.0 ? -1.0 : 1.0) * (0.03 + 0.03 * abs(fi - 2.0));
            float x = 0.5 + side + sway + hook + 0.06 * y * y;
            // Engraved: swelling at the foot and thinning to a hair, heavier the darker the smoke.
            float w = mix(0.0065, 0.0022, y) * (0.9 + 0.35 * dark);
            float d = abs(vUv.x - x);
            float line = (1.0 - smoothstep(w, w + aa, d)) * on;
            // (Broken now and then, as a burin's line lifts: not a tube.)
            line *= 0.8 + 0.2 * smoothstep(0.15, 0.4, sin(y * 23.0 + seed * 5.0) * 0.5 + 0.5);
            if (gold > 0.5 && mod(fi, 2.0) < 0.5) goldInk = max(goldInk, line); else ink = max(ink, line);
          }
          float fade = top * foot * uShow;
          float a = ink * (0.5 + 0.45 * dark) * fade;
          float g = goldInk * 0.95 * fade;
          float alpha = max(a, g);
          if (alpha < 0.004) discard;
          vec3 col = g > a ? uGold : uInk;
          gl_FragColor = vec4(col, alpha);
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
