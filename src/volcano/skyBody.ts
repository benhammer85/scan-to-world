/**
 * The bodies in a world's sky, painted as the world itself is: a lit ball under watercolour, not a flat engraved
 * disc. Washes of pigment with ragged edges, darker where they pooled at their rims, over paper grain; the ball
 * shaded round, away from the light, and a little darker towards its edge, as the world is. A giant planet's
 * belts are washes laid along its latitudes (and Jupiter has its red spot); a moon's craters are small pooled
 * washes; a star gives its own light, so it isn't shaded, only a little warmer towards its edge, with a soft
 * bloom of colour round it in place of rays.
 *
 * Each is a unit-diameter ball (scale it to size, as a sprite was): a giant or a star turning slowly about its own
 * axis, a moon keeping one face to its world.
 */
import * as THREE from 'three';

export type SkyBodyKind = 'giant' | 'moon' | 'star';

export interface SkyBodyLook {
  kind: SkyBodyKind;
  /** The paper under the washes, and the main pigment. */
  paper: string;
  wash: string;
  /** A second pigment: a giant's darker belts; a star's warmer rim. */
  wash2?: string;
  /** A giant's belts: how many, and how strong (0 to 1). */
  belts?: number;
  /** Jupiter's great red spot. */
  spot?: boolean;
  /** The ink of the pooled edges and the shading. */
  ink: string;
}

const NOISE = /* glsl */ `
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return n3(p) * 0.55 + n3(p * 2.1 + 3.7) * 0.28 + n3(p * 4.7 + 9.1) * 0.17; }
`;

/** A ball painted as a body in the sky. `time` is shared, so it turns and its washes drift a little. */
export function skyBody(look: SkyBodyLook, time: { value: number }): THREE.Mesh {
  const c = (s: string) => new THREE.Color(s);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: time,
      uOpacity: { value: 1 },
      uPaper: { value: c(look.paper) },
      uWash: { value: c(look.wash) },
      uWash2: { value: c(look.wash2 ?? look.wash) },
      uInk: { value: c(look.ink) },
      uBelts: { value: look.belts ?? 0 },
      uSpot: { value: look.spot ? 1 : 0 },
      uKind: { value: look.kind === 'giant' ? 0 : look.kind === 'moon' ? 1 : 2 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main() {
        vP = position * 2.0; // (on the unit ball)
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vV;
      uniform float uTime, uOpacity, uBelts, uSpot, uKind;
      uniform vec3 uPaper, uWash, uWash2, uInk;
      ${NOISE}
      // A wash: even inside, ragged at its edge, darker in a thin band just inside the edge where the pigment pooled.
      vec4 wash(float field, float at, float px) {
        float edge = smoothstep(at - px, at + px, field);
        float pool = edge * (1.0 - smoothstep(at, at + 0.06, field));
        return vec4(edge, pool, 0.0, 0.0);
      }
      void main() {
        vec3 n = normalize(vN), v = normalize(vV), p = normalize(vP);
        float px = 0.02;
        // (Turning about its own axis: a giant in hours, so a little faster; a star slowly, its spots carried round
        // in weeks. A moon not at all: it keeps one face to its world, as ours does.)
        float turn = uTime * (uKind > 1.5 ? 0.01 : uKind > 0.5 ? 0.0 : 0.03);
        vec3 q = vec3(p.x * cos(turn) + p.z * sin(turn), p.y, -p.x * sin(turn) + p.z * cos(turn));
        float grain = n3(q * 60.0) * 0.6 + n3(q * 140.0) * 0.4; // (the paper's tooth)
        vec3 col = uPaper;
        if (uKind < 0.5) {
          // A giant: its belts, washes laid along the latitudes, wavering, two pigments by turns.
          float lat = q.y + 0.05 * (fbm(q * 3.0) - 0.5);
          float b = sin(lat * 3.14159 * (2.0 + uBelts * 4.0));
          vec4 w1 = wash(b + 0.35 * (fbm(q * 5.0 + 1.0) - 0.5), 0.25, px);
          vec4 w2 = wash(-b + 0.35 * (fbm(q * 5.0 + 7.0) - 0.5), 0.55, px);
          col = mix(col, uWash, w1.x * 0.45 * uBelts);
          col = mix(col, uWash2, w2.x * 0.5 * uBelts);
          col = mix(col, uInk, (w1.y * 0.18 + w2.y * 0.22) * uBelts);
          // A soft overall wash, uneven, so it isn't flat paper between the belts.
          col = mix(col, uWash, 0.22 * fbm(q * 2.0 + 5.0));
          if (uSpot > 0.5) {
            // The great red spot: an oval wash in the southern belts, ringed where it pooled.
            vec2 s = vec2(atan(q.x, q.z) - 0.6, (q.y + 0.38) * 2.2);
            float d = length(s) + 0.08 * (n3(q * 9.0) - 0.5);
            vec4 sp = wash(0.32 - d, 0.0, px);
            col = mix(col, vec3(0.75, 0.42, 0.3), sp.x * 0.6);
            col = mix(col, uInk, sp.y * 0.35);
          }
        } else if (uKind < 1.5) {
          // A moon: an uneven grey wash, its maria darker, and craters as small pooled washes.
          vec4 m = wash(fbm(q * 2.2 + 2.0), 0.55, px);
          col = mix(col, uWash, 0.35 + 0.1 * fbm(q * 6.0));
          col = mix(col, uWash2, m.x * 0.4);
          col = mix(col, uInk, m.y * 0.2);
          float cr = n3(q * 7.0 + 11.0);
          vec4 k = wash(cr, 0.78, px);
          col = mix(col, uInk, k.y * 0.35 + k.x * 0.08);
        } else {
          // A star: its own light, so not shaded; its face grained and mottled, warmer towards its edge.
          float mu = clamp(dot(n, v), 0.0, 1.0);
          vec4 m = wash(fbm(q * 6.0 + vec3(0.0, 0.0, uTime * 0.04)), 0.6, px);
          col = mix(uWash2, uWash, pow(mu, 0.5));
          col = mix(col, uPaper, 0.35 * pow(mu, 3.0));
          col = mix(col, uWash2, m.x * 0.18);
          col *= 0.96 + 0.08 * grain;
          gl_FragColor = vec4(col, uOpacity);
          #include <colorspace_fragment>
          return;
        }
        col *= 0.95 + 0.08 * grain;
        // Shaded round, away from the light, as the world is (the light high on the left, before us); and a little
        // darker towards its edge.
        vec3 L = normalize(vec3(-0.45, 0.5, 0.75));
        float away = 0.06 + smoothstep(0.35, -0.25, dot(n, L)) * 0.3;
        float limb = exp(-clamp(dot(n, v), 0.0, 1.0) * 6.0) * 0.3;
        col = mix(col, col * (uInk * 0.5 + 0.35), away + limb);
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 64, 48), mat);
  return ball;
}

/** A star's bloom: a soft round wash of its colour round it, its edge a little uneven, as wet paint spreads. */
export function starBloom(colour: string, time: { value: number }): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: time, uGlow: { value: new THREE.Color(colour) } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vP;
      uniform float uTime; uniform vec3 uGlow;
      ${NOISE}
      void main() {
        float d = length(vP), ang = atan(vP.y, vP.x);
        float edge = 0.92 + 0.08 * (fbm(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uTime * 0.05)) - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.2, edge, d)) * 0.5;
        a *= 0.85 + 0.15 * n3(vec3(vP * 6.0, 1.0));
        gl_FragColor = vec4(uGlow, a);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}
