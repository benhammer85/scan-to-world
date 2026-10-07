/**
 * Ink thins towards the rim of the world, as the print on a globe does towards
 * its horizon. Seen edge-on near the silhouette, lines and dots crowd into dark
 * tangles that are only the projection, not the map; faded there, the edge of
 * the world stays clean and open.
 *
 * The world is centred on its own origin, so a point's outward direction is
 * the ground's up there, near enough: how much it faces the eye is how far it
 * is from the rim.
 */
import type * as THREE from 'three';

export const RIM = {
  /** Facing (cosine) below which ink is gone, and above which it is whole. */
  gone: 0.06,
  whole: 0.38,
};

/** GLSL: how much of the ink at this vertex shows, 0 at the rim to 1 facing the eye. */
export const rimGlsl = /* glsl */ `
  float rimFade(vec3 objectPosition, vec4 mvPosition) {
    vec3 n = normalize(normalMatrix * objectPosition);
    return smoothstep(${RIM.gone.toFixed(3)}, ${RIM.whole.toFixed(3)}, dot(n, normalize(-mvPosition.xyz)));
  }
`;

/** Fade one of three.js's own line materials towards the rim. */
export function rimFaded<T extends THREE.Material>(m: T): T {
  m.transparent = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `varying float vRim;\n${rimGlsl}\nvoid main() {`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vRim = rimFade(position, mvPosition);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vRim;\nvoid main() {')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vRim;\n#include <opaque_fragment>');
  };
  return m;
}
