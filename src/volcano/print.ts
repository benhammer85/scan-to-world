/**
 * The worlds drawn as prints: stipple on cream paper, pinned to the
 * ground so it turns with it and never crawls (as Return of the Obra Dinn pins its dither); a few
 * loose washes of watercolour laid on by hand, sea-green along the coast and ochre over parts of
 * the land; a dotted graticule over the sea; a crisp coast; and the lava in one of two hands:
 *
 *   1  engraving: no fill, fine lines in red-brown ink that swell where the lava is hot and drift as it
 *      runs, freezing black when it sets and breaking into dashes and dots as it weathers (it was a
 *      woodblock first: a block of vermilion, hot orange where it lies thick, cut by hand with gouges
 *      that ride downhill with it, outlined in black that goes thick and thin and breaks, printed
 *      a little off its outline; set, it's a black block whose cuts stay; weathering, it breaks into
 *      halftone dots that shrink until they're stipple;
 *   2  watercolour: a wet wash that pools dark at its ragged edge, with pigment drifting in it;
 *      set, it dries to sienna and then grey, and goes, leaving stipple behind.
 *
 * Everything here is worked out in each pixel from what the ground shader already has: the height
 * (vH), the marks (vMarks: where lava lies, where it has set and how black it still is), the
 * ground's colour (vColor: life's washes, ash), and where on the world it is (vDir).
 */
export type Look = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const LOOKS: { id: string; look: Look; words: string }[] = [
  { id: 'quiet', look: 6, words: 'quiet print' },
  { id: 'engrave', look: 1, words: 'engraving' },
  { id: 'water', look: 2, words: 'watercolour' },
  { id: 'stipple', look: 3, words: 'stipple' },
  { id: 'glow', look: 4, words: 'glow' },
  { id: 'print', look: 5, words: 'print' },
  { id: 'plain', look: 0, words: 'last used' },
];

/** Declared before the shader's main(); uses its hash3, noise3 and uPx. */
export const PRINT_FUNCTIONS = /* glsl */ `
  varying vec3 vS;
  uniform float uFlash, uFloodDots, uFloodRim, uFeeding, uBuild, uSpray, uDrift, uBurp, uBurpSize, uBurpSeed, uBurpDir, uGold, uDark;
  uniform vec3 uCrustTint; // (each world's own basalt: redder on Mars, olive on Io, grey on the Moon)
  uniform float uIceLine; // (Snowball Earth: the ice from this latitude's sine to the poles; below 0, no ice)
  uniform float uHaze; // (the orange Earth: its orange haze, 1 at first, gone once the sky is blue)
  uniform vec4 uSky; // (its star's direction, as seen, and w: 0 no star in it, 1 a star, 2 none at all, a rogue planet)
  #define uFeedingGlow (0.4 + 0.6 * uFeeding)
  uniform vec3 uVent;
  // Craters, as the charts draw them (see 'Craters' below): each one's middle and width, how long since it was dug, and the light in the world's own frame.
  uniform vec4 uCrater[64];
  uniform float uCraterAge[64];
  uniform int uCraterCount;
  uniform vec3 uLightObj;
  uniform vec3 uBlock, uBlockDeep; // the woodblock's colours: vermilion, or on the ice moons, water's blues
  uniform vec3 uInkDeep, uInkMid, uInkHot, uInkOver, uInkPale, uInkCold, uInkAsh; // the print's inks (linear): its dark, middle and hot bands, the two overprinted, the palest, what a burp's clots cool to, and its ash
  // Plates, as a crust breaks into them: how far a point is from the nearest seam between cells
  // (the second-nearest cell's distance less the nearest's), and the nearest cell's own number.
  vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  vec2 plates(vec2 x) {
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash22(n + g + 7.0).x; } else if (d < d2) d2 = d;
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }
  // (Hashed without sin: phones' GPUs work sin out roughly for large numbers, which turns "random"
  // into regular patterns.)
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  // A dot for each cell of a lattice lying on the world's shell (D cells to its radius), each moved
  // a little off its cell's middle; for each pixel, the dots of the eight cells round it. Each dot
  // is drawn once the darkness wanted here passes its own threshold, at rPx pixels across (dots
  // keep their size on the screen as you zoom; how closely they're set is fixed to the ground).
  // Seen from far, where they'd crowd into moire, they give way to their own average tone.
  // (ps, the size of a pixel in cells, is worked out by the caller, before any branch: how a value
  // changes from pixel to pixel is undefined inside one, and on phones it came out as garbage.)
  float lattice(vec3 p, float D, float dark, float rPx, float salt, float ps) {
    float r = rPx * ps, cov = 0.0;
    vec3 i0 = floor(p - 0.5);
    for (int k = 0; k < 8; k++) {
      float fk = float(k);
      vec3 c = i0 + vec3(mod(fk, 2.0), mod(floor(fk / 2.0), 2.0), floor(fk / 4.0));
      vec3 h = hash33(c + salt);
      vec3 q = c + 0.5 + (h - 0.5) * 0.84;
      float lq = length(q);
      if (abs(lq - D) > 0.5) continue;
      q *= D / lq;
      float rr = r * (0.6 + 0.8 * h.y * h.y + 0.25 * h.z);
      float th = 0.04 + h.x * 0.96, on = smoothstep(th - 0.03, th + 0.03, dark);
      cov = max(cov, on * (1.0 - smoothstep(rr - 0.5 * ps, rr + 0.5 * ps, length(p - q))));
    }
    return mix(cov, clamp(dark * 1.2 * r * r, 0.0, 0.3), smoothstep(0.35, 0.7, ps));
  }
  // Three lattices, turned against each other and of different sizes, each carrying a share of the
  // darkness, which is capped short of every dot: so however dark, no lattice ever fills and shows as a grid.
  // (px: a pixel's width on the world.)
  float stipple(vec3 dir, float D, float dark, float rPx, float px) {
    float k = min(dark, 1.6) * 0.42;
    vec3 d2 = vec3(dir.y * 0.8 + dir.z * 0.6, dir.z * 0.8 - dir.y * 0.6, dir.x).yzx;
    vec3 d3 = vec3(dir.z * 0.36 - dir.x * 0.93, dir.x * 0.36 + dir.z * 0.93, dir.y).zxy;
    return max(max(lattice(dir * D, D, k, rPx, 0.0, px * D), lattice(d2 * (D * 1.29), D * 1.29, k, rPx, 31.0, px * D * 1.29)), lattice(d3 * (D * 1.13), D * 1.13, k, rPx, 57.0, px * D * 1.13));
  }
  // Splatter, as ink flicked from a loaded brush: a fine spray, and here and there a fat drop; dens is
  // the share of them that land. Fixed to the ground, so as dens rises the spray spreads, and never flickers.
  float splat(vec3 dir, float dens, float px) {
    vec3 d2 = vec3(dir.y * 0.8 + dir.z * 0.6, dir.z * 0.8 - dir.y * 0.6, dir.x).yzx;
    float fine = lattice(dir * 120.0, 120.0, dens * 0.6, 0.6 * uPx, 11.0, px * 120.0);
    float fat = lattice(d2 * 46.0, 46.0, dens * 0.4, 1.9 * uPx, 23.0, px * 46.0);
    return max(fine, fat);
  }
  // Crust on lava, graded by how cool it is (0 hot, 1 cool): scattered small flakes when hot, fewer,
  // bigger plates spaced apart when cool. p is a point carried with the flow; far, how far from the vent.
  float crustAt(vec3 p, float cool, float far) {
    vec3 w = 0.35 * vec3(noise3(vDir * 60.0), noise3(vDir * 60.0 + 9.0), 0.0);
    vec3 big = p * 16.0 + w + vec3(0.0, 0.0, 2.3), small = p * 52.0 + w * 2.0 + vec3(0.0, 0.0, 8.1);
    float nb = noise3(big) * 0.7 + noise3(big * 2.7 + 5.0) * 0.3;
    float ns = noise3(small) * 0.75 + noise3(small * 2.3 + 3.0) * 0.25;
    float n = mix(ns, nb, smoothstep(0.25, 0.8, cool));
    float th = mix(0.74, 0.6, cool) - 0.04 * smoothstep(0.1, 0.45, far), fw = max(fwidth(n), 1e-4);
    return smoothstep(th - fw, th + fw, n);
  }
  // Bubbles rising through running lava: in some cells of a lattice on the ground (dens of them), each
  // swells over a few seconds, then pops in a ring of drops. x: the bubble (0 to 1); y: its drops.
  // (aa: a pixel's width in cells, worked out before any branch.)
  vec2 bubbles(vec3 dir, float dens, float t, float aa) {
    const float K = 34.0;
    vec3 p = dir * K, c = floor(p), h = hash33(c + 71.0);
    if (h.z > dens) return vec2(0.0);
    vec3 n = normalize(c + 0.5 + (h - 0.5) * 0.3), ctr = n * K, q = p - ctr;
    float period = 3.0 + 4.0 * h.x, x = fract(t / period + h.y);
    float r = 0.24 * smoothstep(0.0, 0.7, x), d = length(q);
    float disc = step(x, 0.75) * (1.0 - smoothstep(r - aa, r + aa, d));
    float pp = (x - 0.75) / 0.17, drops = 0.0;
    if (pp > 0.0 && pp < 1.0) {
      vec3 u = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(n, u);
      vec2 q2 = vec2(dot(q, u), dot(q, v));
      float a = atan(q2.y, q2.x), ac = (floor(a / 6.2832 * 7.0 + 0.5) + 0.2 * (h.x - 0.5)) * 6.2832 / 7.0;
      float rr = 0.05 * (1.0 - pp) + 0.008;
      drops = 1.0 - smoothstep(rr - aa, rr + aa, length(q2 - (0.24 + 0.22 * pp) * vec2(cos(ac), sin(ac))));
    }
    return vec2(disc, drops);
  }
  // The graticule: dotted parallels every 15 degrees and meridians every 20, the dots fixed to the world.
  float graticule(vec3 dir, float pxW) {
    float lat = asin(clamp(dir.y, -1.0, 1.0)), lon = atan(dir.z, dir.x);
    float cl = cos(lat), sp = 0.02, rr = 0.6 * uPx * pxW, aa = 0.5 * pxW;
    float sLat = 0.2618, dLat = (fract(lat / sLat + 0.5) - 0.5) * sLat;
    float da = (fract(lon * cl / sp) - 0.5) * sp;
    float g = 1.0 - smoothstep(rr - aa, rr + aa, length(vec2(dLat, da)));
    float sLon = 0.349, dLon = (fract(lon / sLon + 0.5) - 0.5) * sLon * cl;
    float db = (fract(lat / sp) - 0.5) * sp;
    g = max(g, (1.0 - smoothstep(rr - aa, rr + aa, length(vec2(dLon, db)))) * step(abs(lat), 1.3));
    return g;
  }
  // Lava's colour by its heat, as real lava's: dark crust, deep red, vermilion, orange, yellow, white-yellow.
  vec3 heatRamp(float T) {
    vec3 c = mix(vec3(0.24, 0.15, 0.12), vec3(0.55, 0.13, 0.08), smoothstep(0.0, 0.2, T));
    c = mix(c, vec3(0.86, 0.24, 0.11), smoothstep(0.15, 0.42, T));
    c = mix(c, vec3(0.96, 0.5, 0.17), smoothstep(0.38, 0.68, T));
    c = mix(c, vec3(1.0, 0.78, 0.38), smoothstep(0.62, 0.86, T));
    return mix(c, vec3(1.0, 0.95, 0.76), smoothstep(0.84, 1.0, T));
  }
  // How hot running lava is: deeper and nearer the vent hotter, the edge cooling first, warmth drifting in it.
  float lavaHeat(float lv, float far) {
    float T = clamp(smoothstep(0.5, 1.6, lv) * 0.7 + exp(-far / 0.1) * 0.5, 0.0, 1.0) * smoothstep(0.5, 0.9, lv);
    return clamp(T + 0.14 * (noise3(vDir * 14.0 + vec3(0.0, -uTime * 0.07, uTime * 0.05)) - 0.5), 0.0, 1.0);
  }
  // Engraved lines: along the level lines of a phase, each as wide as the heat makes it (swelling as an
  // engraver's line does), tapering at the edge; none where they'd crowd into a smear, or where the
  // phase stands still. (fw, how fast the phase changes from pixel to pixel, is worked out before any branch.)
  float engrave(float phase, float fw, float heat, float taper) {
    fw = max(fw, 1e-5);
    float k = floor(phase + 0.5);
    float w = (0.4 + 1.5 * heat) * uPx * 0.62 * taper * (0.85 + 0.3 * noise3(vDir * 40.0 + vec3(k)));
    return (1.0 - smoothstep(w - 0.5, w + 0.5, abs(phase - k) / fw)) * (1.0 - smoothstep(0.12, 0.3, fw)) * smoothstep(0.004, 0.02, fw);
  }
`;

/** The ground's colour, as a print: replaces the shader's own colour step. */
export function printFragment(look: Look, sea: boolean): string {
  return /* glsl */ `
      float px = max(length(dFdx(vDir)), length(dFdy(vDir)));
      // How many pixels a field's level \`at\` lies from here, for an edge drawn along it. (The fields are
      // carried a vertex at a time, so how fast they change jumps from triangle to triangle; an edge
      // measured by it changed its width at every triangle, and every edge grew a saw of teeth. So a
      // flow's margins, whose fields change about as fast everywhere, are measured by that, \`rate\` a
      // radian: smooth across the triangles, whatever their slopes.)
#define MARGIN_PX(f, at, rate) (abs((f) - (at)) / ((rate) * px))
// (And for other levels, by their own slope, never taken as flatter than a margin.)
#define PX_FROM(f, at) (abs((f) - (at)) / max(length(vec2(dFdx(f), dFdy(f))), 8.0 * px))
      float edge = max(fwidth(vH), 1e-5) * 0.7;
      float onLand = ${sea ? 'smoothstep(-edge, edge, vH)' : '1.0'};
      vec3 paper = vec3(0.957, 0.937, 0.89), ink = vec3(0.13, 0.12, 0.105);
      vec3 col = paper;
      float b1 = noise3(vDir * 7.0), b2 = noise3(vDir * 19.0 + 3.1), b3 = noise3(vDir * 60.0 + 7.0);
      float grain = 0.8 + 0.4 * noise3(vDir * 420.0) * hash3(floor(vDir * 700.0));
      // Sea-green along the coast, wide here and narrow there, slipping a little onto the land as a hand-laid wash does.
      float reach = max(-vH, 0.0) / (0.012 + 0.07 * b1 * b1) + 0.35 * (b2 - 0.5);
      float rw = max(fwidth(reach), 1e-4);
      float inSea = (1.0 - smoothstep(1.0 - rw, 1.0 + rw, reach)) * (1.0 - smoothstep(0.0, 0.004 + 0.012 * b3, vH));
      float seaRim = exp(-max(0.0, 1.0 - reach) / 0.09) * 0.9;
      float aSea = ${sea ? 'clamp(0.32 * (0.25 + b2 * b2 + 0.3 * b1 + seaRim) * grain, 0.0, 1.0) * inSea' : '0.0'};
      col *= 1.0 - aSea * (1.0 - vec3(0.36, 0.55, 0.59));
      // Shoal water, as a sea chart tints it: the sea floor raised towards the surface (new rock from the
      // fire, a seamount, a sunken island) under a pale blue wash, deeper as it nears the surface, so what
      // the fire builds under the sea shows before it breaks the surface. (It was hidden until then.)
      float shoal = ${sea ? 'smoothstep(0.08, 0.7, 1.0 - (vH + 0.02 * (b2 - 0.5)) / uSeaFloor) * (1.0 - onLand)' : '0.0'};
      // And on the ocean world, where lava has lain under the sea (the hotspot's track), the same wash, lighter.
      float trk = vMarks.x + 0.14 * (b2 - 0.5), trw = max(fwidth(trk), 1e-4) * 1.6;
      shoal = max(shoal, ${sea ? '0.6 * smoothstep(0.5 - trw, 0.5 + trw, trk) * (1.0 - onLand)' : '0.0'});
      // The sea itself, washed a pale blue as an atlas washes it, a little deeper out over the deep;
      // and the shoals (the new rock rising, the hotspot's track) paler, as a chart pales its shallows.
      ${sea ? `float seaWash = (1.0 - onLand) * clamp(0.75 + 0.3 * (b1 - 0.5), 0.0, 1.0) * grain;
      col = mix(col, col * vec3(0.7, 0.84, 0.95), seaWash);
      col = mix(col, paper * vec3(0.93, 0.97, 0.96), shoal * 0.75 * clamp(0.8 + 0.4 * b1, 0.0, 1.0));` : ''}
      // The land: life's washes and ash, as their tint over the land's paper; and loose ochre over parts of it, never all.
      // Life's washes (and ash, and fresh rock) come as a soft tint; laid as a hand-coloured map lays them,
      // each is an even wash with a ragged edge, a darker rim and grain, wherever it's more than a trace.
      // How squarely the ground faces us: washes (and, below, lines) thin away at the world's rim, so
      // nothing piles up there into a band.
      // (By the ground's own slope, not the sphere's: a mountain standing on the rim faces us, and keeps its washes.)
      float faceOn = clamp(dot(normalize(vN), normalize(vViewPosition)), 0.0, 1.0), washEdge = smoothstep(0.04, 0.35, faceOn);
      vec3 dt = clamp(1.0 - vColor.rgb / max(uLandPaper, vec3(0.01)), 0.0, 1.0);
      float ds = max(dt.r, max(dt.g, dt.b)), lr = ds / (0.05 + 0.05 * b1) + 0.3 * (b3 - 0.5), lrw = max(fwidth(lr), 1e-4);
      float inL = smoothstep(1.0 - lrw, 1.0 + lrw, lr), rimL = exp(-max(0.0, lr - 1.0) / 0.5) * 0.7;
      // (Deeper colours lay a deeper wash: an old wood reads darker than young grass, not just greener.)
      vec3 tint = 1.0 - (dt / max(ds, 1e-3)) * clamp(0.3 * (0.55 + b2 + rimL) * grain * (0.8 + 0.9 * smoothstep(0.3, 0.6, ds)), 0.0, 0.72) * inL;
      float oReach = 0.35 + 1.5 * (1.0 - noise3(vDir * 5.0 + 9.0)) - vH * 2.5 + 0.25 * (b2 - 0.5);
      float ow = max(fwidth(oReach), 1e-4);
      float aO = clamp(0.22 * (0.3 + 1.1 * b1 * b1 + exp(-max(0.0, 1.0 - oReach) / 0.08) * 0.9) * grain, 0.0, 1.0) * (1.0 - smoothstep(1.0 - ow, 1.0 + ow, oReach));
      // The world's own colour, laid over all its land as one loose wash: heavier here, thinner there.
      vec3 own = clamp(uLandPaper / paper, 0.0, 1.05);
      vec3 landCol = paper * mix(vec3(1.0), own, clamp(0.8 + 0.5 * (b1 - 0.5), 0.0, 1.0) * (0.9 + 0.1 * grain)) * tint;
      // Where lava has lain and the world keeps the mark (the Moon's dark seas, the ice moons' new ice, Io's
      // sulphur): a wash of its own, with a ragged edge and a rim where it pooled.
      float flr = vMarks.x + 0.04 * (b3 - 0.5) + 0.14 * (b2 - 0.5), flw = max(fwidth(flr), 1e-4) * 1.6;
      float inF = smoothstep(0.5 - flw, 0.5 + flw, flr), rimF = exp(-max(0.0, (flr - 0.5) / flw) / (3.0 * uPx));
      landCol = mix(landCol, uFlooded * (1.0 - 0.12 * rimF * uFloodRim), washEdge * uFloodStrength * inF * clamp(0.72 + 0.35 * (b2 - 0.5) + 0.25 * rimF * uFloodRim, 0.0, 1.0));
      float floodDark = inF * uFloodStrength * uFloodDots; // (the Moon's dark seas are stippled darker, as lunar charts draw them)
      landCol *= 1.0 - aO * washEdge * (1.0 - vec3(0.77, 0.63, 0.36));
      col = mix(col, landCol * mix(vec3(1.0), col / paper, inSea), onLand);

      // Snowball Earth: the ice, from the poles to where it has let go, its edge ragged; on land and sea alike,
      // white with a faint blue, and a little greyer just at its edge, where it's thin.
      if (uIceLine >= 0.0) {
        float lat = abs(vDir.y) + 0.035 * (b2 - 0.5) + 0.012 * (b3 - 0.5), iw = max(fwidth(lat), 1e-4) * 1.5;
        float iced = smoothstep(uIceLine - iw, uIceLine + iw, lat);
        vec3 iceCol = paper * vec3(0.975, 0.99, 1.0) * (0.97 + 0.05 * grain) * (1.0 - 0.07 * exp(-max(0.0, lat - uIceLine) / 0.02));
        col = mix(col, iceCol, iced * 0.94);
      }
      // A star in the sky: its night side in shadow. With none at all, a rogue planet, all of it in the dark,
      // and only the lava's own light (drawn after) bright.
      if (uSky.w > 0.5) {
        float sunUp = dot(normalize(vN), uSky.xyz);
        float night = uSky.w > 1.5 ? 1.0 : smoothstep(0.1, -0.22, sunUp);
        // (On a rogue planet, darker, but what lives there kept light: life's washes glow out of the dark.)
        float lives = uSky.w > 1.5 ? smoothstep(0.03, 0.1, ds) : 0.0;
        col = mix(col, col * (uSky.w > 1.5 ? vec3(0.34, 0.37, 0.48) : vec3(0.36, 0.39, 0.5)), night * 0.9 * (1.0 - 0.85 * lives));
        col = mix(col, col * vec3(0.74, 0.9, 0.66), lives * 0.75); // (a soft moss green, in the dark)
      }

      // The orange Earth's haze, over everything, clearing as life breathes out oxygen.
      // (Toward a warm orange of the same lightness, not the blue sea dimmed to mud.)
      if (uHaze > 0.0) col = mix(col, vec3(1.0, 0.74, 0.47) * dot(col, vec3(0.3, 0.59, 0.11)) * 1.08, uHaze * 0.72);

      // Lava's marks.
      float lv = vMarks.y * onLand, lw = max(fwidth(lv), 1e-4); // (under the sea it's hidden, as it always was)
      float here = vMarks.w + 0.09 * (noise3(vDir * 21.0 + 5.0) - 0.5), hw = 21.0 * px * 1.2, setOn = smoothstep(0.5 - hw, 0.5 + hw, here) * onLand; // (a little wobble and a softer edge, so the mesh's triangles don't show as teeth)
      float black = here > 0.01 ? clamp(vMarks.z / here, 0.0, 1.0) : 0.0;

      // Stipple: crowded along the shore, thinning inland, gathering on slopes turned from the light,
      // and at the world's edge to round it.
      vec3 V = normalize(vViewPosition), Nn = normalize(vN), S = normalize(vS), L = normalize(vec3(-0.55, 0.6, 0.6));
      float limb = exp(-clamp(dot(Nn, V), 0.0, 1.0) * 22.0) * 0.35;
      // Lines fade out as the ground turns edge-on at the world's rim, so it ends softly, never in an
      // inked outline (seen edge-on, the height crosses the sea everywhere, and the coast line would ring the world).
      float edgeOn = smoothstep(0.06, 0.3, clamp(dot(Nn, V), 0.0, 1.0));
      float hl = max(vH, 0.0);
      float relief = max(0.0, dot(S, L) - dot(Nn, L)) * ${sea ? '2.2' : '3.6'};
      // Craters, as lunar charts draw them: a crescent of dots on the inside wall nearest the light (it's
      // in shadow), the far wall bare (it's lit), the floor lightly dotted, a rim line thick on the side
      // away from the light and thin towards it, and round a fresh one a spray of dots, in rays, that fades.
      float crDark = 0.0, litWall = 0.0;
      for (int i = 0; i < 64; i++) {
        if (i >= uCraterCount) break;
        vec4 c = uCrater[i];
        float d = length(vDir - c.xyz), q = d / c.w;
        if (q > 2.4) continue;
        vec3 t = vDir - c.xyz; t -= dot(t, c.xyz) * c.xyz; t /= max(length(t), 1e-6);
        vec3 lt = uLightObj - dot(uLightObj, c.xyz) * c.xyz; lt /= max(length(lt), 1e-4);
        float side = dot(t, lt) * smoothstep(0.0, 0.25, q); // +1 on the side towards the light (and nothing at the very middle)
        float wall = smoothstep(0.3, 0.9, q) * (1.0 - smoothstep(0.96, 1.04, q));
        // How low the light stands over this crater, as the lamp sees it: facing the lamp, it's noon there
        // and the crater all but shadowless; turned towards the world's edge, the light grazes it and the
        // rim's shadow reaches across the floor, as the Moon's craters do near the terminator. So turning
        // the world, the craters' shadows lengthen and shorten.
        float low = 1.0 - smoothstep(0.2, 0.92, dot(c.xyz, uLightObj));
        low *= low; // (eased: a crescent in the middle of the world, a long shadow only near its edge)
        float u = dot(t, lt) * q, reach = mix(0.04, 0.95, low); // (u: +1 at the rim nearest the light, -1 at the far one)
        float rimShade = smoothstep(1.0 - 2.0 * reach - 0.12, 1.0 - 2.0 * reach + 0.12, u) * (1.0 - smoothstep(0.92, 1.0, q));
        crDark += rimShade * mix(0.1, 0.75, low) + wall * smoothstep(-0.15, 0.65, side) * (0.75 + 0.3 * b3) * mix(0.35, 1.0, low) + (1.0 - smoothstep(0.45, 0.75, q)) * 0.06;
        litWall = max(litWall, wall * smoothstep(0.05, -0.55, side) * mix(0.5, 1.0, low));
        // The rim, in stipple rather than a line: a band of close dots just outside the wall, heavier on
        // the side away from the light, as the charts dot a crater's lip.
        float band = 1.0 - smoothstep(0.0, 0.16, abs(q - 1.06));
        crDark += band * (0.55 + 0.9 * smoothstep(0.35, -0.85, side) * mix(0.4, 1.0, low)) * edgeOn;
        float fresh = exp(-uCraterAge[i] / 120.0);
        if (fresh > 0.02 && q > 1.05) {
          vec3 u2 = cross(c.xyz, lt);
          float ang = atan(dot(t, u2), dot(t, lt));
          float ray = smoothstep(0.5, 0.8, noise3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, float(i) * 5.0)));
          crDark += fresh * (0.25 + 0.6 * ray) * exp(-(q - 1.05) / 0.45) * 0.55;
        }
      }
      float darkL = ${sea ? 'exp(-hl / 0.005) * 0.9 + exp(-hl / 0.02) * 0.3 + ' : ''}relief + ${sea ? '0.02' : '0.06 + smoothstep(0.35, -0.25, dot(S, L)) * 0.22'} + floodDark; // (a dry world is shaded round, away from the light, as an engraved globe is)
      ${look === 2 ? 'darkL += 0.45 * sin(black * 3.14159) * setOn; // the dried wash giving way to stipple' : ''}
      darkL = darkL * (1.0 - 0.85 * litWall) + crDark;
      ${look === 1 ? 'darkL += 0.18 * pow(black, 1.2) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)); // set rock: a little stipple under its engraved lines' : ''}
      ${look >= 2 ? 'darkL *= 1.0 - 0.95 * smoothstep(0.45, 0.7, lv); // (running lava covers the ground\'s stipple)' : ''}
      ${look === 5 ? 'darkL += 0.9 * smoothstep(0.4, 0.2, black) * smoothstep(0.0, 0.15, black) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)); // set print: the black breaks into stipple as it weathers' : ''}
      ${look === 3 ? 'darkL += 1.0 * pow(black, 1.1) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)); // set: its own dots, black, thinning as it weathers' : ''}
      float dark = mix(limb + exp(-max(-vH, 0.0) / 0.03) * 0.14, darkL + limb, onLand); // (and a little over the shallows, so what rises under the sea shows)
      if (dark > 0.035) col = mix(col, ink, stipple(vDir, 300.0, dark, 0.45 * uPx, px) * 0.92);
      // The graticule, over the open sea.
      col = mix(col, ink, edgeOn * graticule(vDir, px) * ${sea ? '(1.0 - onLand) * (1.0 - 0.5 * aSea) * 0.5' : '0.22'});


      float glowInk = 0.0; // (lava's inks glow by their own light, and are not shaded with the ground)
      ${look === 1 ? ENGRAVE : look === 2 ? WATER : look === 3 ? STIPPLE : look === 4 ? GLOW : PRINT(look === 6)}

      ${sea ? `// The coast: one crisp line.
      float coastPx = abs(vH) / max(fwidth(vH), 1e-6);
      col = mix(col, ink, (1.0 - smoothstep(0.55 * uPx - 0.5, 0.55 * uPx + 0.5, coastPx)) * ${look === 6 ? '0.6' : '0.95'} * edgeOn); // (quiet: soft, not an outline; but enough that a small new island reads as land)` : ''}
      diffuseColor.rgb *= col * (1.0 - glowInk);
      totalEmissiveRadiance += col * glowInk;`;
}

const ENGRAVE = /* glsl */ `
      // Engraved, as an old atlas's plates were, but plainly molten: running lava is laid with a warm
      // vermilion tint, strongest near the vent and fading towards its front, and engraved with lines
      // that run downhill, out from the vent, as a geological map hatches a flow; the lines are broken
      // into dashes that stream outward while the vent feeds it, so even a pool that's still being fed
      // is seen to move. Its front is one bolder line.
      float onL = smoothstep(0.5 - lw, 0.5 + lw, lv);
      // Out from the vent: how far (radians round the world) and which way (an angle round it).
      vec3 vt1 = normalize(cross(uVent, abs(uVent.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), vt2 = cross(uVent, vt1);
      float far = acos(clamp(dot(vDir, uVent), -1.0, 1.0));
      float ang = atan(dot(vDir, vt2), dot(vDir, vt1)) + 0.25 * (noise3(vDir * 14.0) - 0.5);
      // Rays; and further out, as the flow widens, more rays between them, fading in (not all at once, which drew a ring).
      float rays = ang * 78.0 / 6.2832, fwR = fwidth(rays);
      float rays2 = ang * 156.0 / 6.2832, fwR2 = fwidth(rays2), between = mod(floor(rays2 + 0.5), 2.0) * smoothstep(0.07, 0.17, far);
      float heat = clamp(smoothstep(0.55, 1.8, lv) * 0.5 + exp(-far / 0.12) * 0.7, 0.0, 1.0);
      float taper = smoothstep(0.5, 0.64, lv);
      float k = floor(rays + 0.5);
      // Whole lines, each swelling and thinning a little along its length; the swellings drift outward while it's fed.
      float swellAlong = 0.75 + 0.5 * noise3(vec3(k * 3.1, far * 40.0 - uTime * 0.25 * uFeeding, 0.0));
      float lnRun = max(engrave(rays, fwR, heat * swellAlong, taper), engrave(rays2, fwR2, heat * swellAlong, taper) * between);
      vec3 warm = mix(vec3(0.99, 0.74, 0.58), vec3(0.95, 0.47, 0.3), heat);
      col *= mix(vec3(1.0), warm, onL * 0.85);
      col = mix(col, mix(uBlockDeep, uBlock, smoothstep(0.25, 0.8, heat)), lnRun * onL * 0.95);
      // Set: a soft grey wash over its stipple, fading as it weathers.
      float hs = setOn * (1.0 - onL);
      col *= mix(vec3(1.0), vec3(0.86, 0.84, 0.81), hs * black * 0.7 * washEdge);
      // As the pressure builds, the ground round the vent warms: a soft glow, widening, before it gives.
      float strain = smoothstep(0.25, 1.0, uBuild) * exp(-far / (0.03 + 0.07 * uBuild)) * (1.0 - onL);
      col *= mix(vec3(1.0), vec3(1.0, 0.8, 0.66), strain * 0.7);
      // Its front: one bolder line, deep red.
      col = mix(col, uBlockDeep, (1.0 - smoothstep(0.85 * uPx - 0.5, 0.85 * uPx + 0.5, abs(lv - 0.5) / lw)) * step(0.5 - 2.0 * lw, lv) * 0.92);`;

const WATER = /* glsl */ `
      // Watercolour lava, coloured by its heat as real lava is: yellow-white at the core, through orange
      // and red, to a dark crust that forms from the edges in. No outline: a wet wash with a ragged edge,
      // pigment drifting in it, pooling a little at its edge; a warm glow on the ground round it; drying
      // to sienna and grey once set, then fading.
      float wFar = acos(clamp(dot(vDir, uVent), -1.0, 1.0));
      // Set: the wash dries to sienna, then grey, then goes.
      {
        float inS = (here - 0.5) / hw, rimS = exp(-max(inS, 0.0) / (3.0 * uPx)) * 0.6;
        vec3 sc = mix(vec3(0.42, 0.42, 0.46), vec3(0.62, 0.32, 0.2), smoothstep(0.7, 1.0, black));
        float sa = 0.6 * smoothstep(0.0, 0.55, black) * (0.4 + 0.8 * b2 * b2 + rimS) * grain;
        col *= 1.0 - clamp(sa, 0.0, 0.9) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)) * (1.0 - sc);
      }
      {
        float lvr = lv + 0.14 * (noise3(vDir * 40.0) - 0.5) + 0.06 * (noise3(vDir * 110.0) - 0.5);
        float lwr = max(fwidth(lvr), 1e-4) * 1.5, cov = smoothstep(0.5 - lwr, 0.5 + lwr, lvr);
        // Its heat: deeper and nearer the vent is hotter; the edge cools first.
        float T = clamp(smoothstep(0.5, 1.6, lv) * 0.65 + exp(-wFar / 0.1) * 0.45, 0.0, 1.0) * smoothstep(0.5, 0.95, lv);
        T = clamp(T + 0.12 * (noise3(vDir * 14.0 + vec3(0.0, -uTime * 0.06, uTime * 0.04)) - 0.5), 0.0, 1.0);
        vec3 wc = mix(vec3(0.52, 0.24, 0.17), vec3(0.66, 0.17, 0.1), smoothstep(0.0, 0.2, T));
        wc = mix(wc, vec3(0.86, 0.24, 0.11), smoothstep(0.15, 0.45, T));
        wc = mix(wc, vec3(0.94, 0.48, 0.18), smoothstep(0.4, 0.7, T));
        wc = mix(wc, vec3(0.99, 0.78, 0.4), smoothstep(0.65, 0.9, T));
        wc = mix(wc, vec3(1.0, 0.94, 0.72), smoothstep(0.85, 1.0, T));
        float rim = exp(-max((lvr - 0.5) / lwr, 0.0) / (3.0 * uPx)) * 0.5;
        float body = 0.35 + 0.8 * pow(noise3(vDir * 16.0 + vec3(uTime * 0.04, -uTime * 0.05, uTime * 0.03)), 1.5);
        float a = clamp(1.15 * (body + rim) * (0.75 + 0.35 * T), 0.0, 0.95) * cov * grain;
        // (Its hottest part glows: lighter than the paper's tint, laid over rather than multiplied.)
        col *= 1.0 - a * (1.0 - wc);
        col = mix(col, wc, a * smoothstep(0.6, 1.0, T) * 0.6);
        // The ground just beyond it warms in its glow.
        float near = smoothstep(0.08, 0.5, lv) * (1.0 - cov) * smoothstep(-0.5, 0.0, -wFar + 1.0);
        col *= mix(vec3(1.0), vec3(1.0, 0.82, 0.66), near * 0.55 * uFeedingGlow);
      }`;

/** The lava lamp's blobs, as woodblock prints too: a flat block, hot orange at a hot heart, in a black outline. */
export const LAMP_PRINT_FUNCTIONS = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p), s = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), s.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), s.x), s.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), s.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), s.x), s.y), s.z);
  }
`;
/**
 * The lava lamp's blobs in the quiet print: flat inks laid like the lava's (rust at a cool edge,
 * terracotta, and gold only at a hot heart), pressed unevenly, no lines and no outline; a cooling
 * blob goes rust and thins. (They were still engraved, in a dark outline, after the lava was printed.)
 */
export const LAMP_QUIET = /* glsl */ `
        vec3 rust = pow(vec3(0.8, 0.4, 0.28), vec3(2.2)), terra = pow(vec3(0.93, 0.52, 0.34), vec3(2.2)), gold = pow(vec3(0.98, 0.82, 0.52), vec3(2.2));
        float T = heat * 0.65 + smoothstep(0.88, 3.2, f) * 0.45 + 0.06 * (noise3(vDir * 9.0 + vec3(0.0, uTime * 0.03, 0.0)) - 0.5);
        float tw = max(fwidth(T), 1e-4) * 0.8;
        vec3 col = mix(rust, terra, smoothstep(0.42 - tw, 0.42 + tw, T));
        float G = heat * smoothstep(1.8, 4.0, f) + 0.05 * (noise3(vDir * 6.0 + 17.0) - 0.5), gw = max(fwidth(G), 1e-4) * 0.8;
        col = mix(col, gold, smoothstep(0.45 - gw, 0.45 + gw, G));
        float mottle = noise3(vDir * 80.0) * 0.6 + noise3(vDir * 230.0 + 4.0) * 0.4;
        col *= 0.86 + 0.24 * mottle;
        if (a <= 0.0) discard; // (here, after fwidth: before it, its derivatives at the blob's edge are undefined on phones)
        gl_FragColor = vec4(col, a * (0.55 + 0.4 * smoothstep(0.0, 0.4, heat)));`;
export const LAMP_PRINT = /* glsl */ `
        vec3 paper = vec3(0.957, 0.937, 0.89), ink = vec3(0.13, 0.12, 0.105);
        // Engraved too: a breath of warmth for the blob, its lines in red-brown ink, swelling where it's
        // hot and drifting as it moves, deepening as it cools; one fine line round it.
        float inPx = (f - 0.88) / w;
        float swirl = (noise3(vDir * 9.0) * 0.7 + noise3(vDir * 23.0 + 5.0) * 0.3) * 30.0;
        float hot = smoothstep(0.2, 0.9, heat) * (0.6 + 0.4 * smoothstep(1.2, 3.0, f));
        float fw = max(fwidth(swirl), 1e-5), k = floor(swirl - uTime * 0.3 * heat + 0.5), ph = swirl - uTime * 0.3 * heat;
        float lw = (0.3 + 1.4 * hot) * uPx * 0.62 * smoothstep(0.0, 3.0 * uPx, inPx);
        float ln = (1.0 - smoothstep(lw - 0.5, lw + 0.5, abs(ph - k) / fw)) * (1.0 - smoothstep(0.12, 0.3, fw));
        vec3 lc = mix(vec3(0.216, 0.016, 0.008), vec3(0.617, 0.061, 0.016), hot);
        vec3 col = mix(paper * mix(vec3(1.0, 0.86, 0.74), vec3(0.97, 0.7, 0.55), hot), lc, ln * 0.95);
        col = mix(col, vec3(0.216, 0.016, 0.008), (1.0 - smoothstep(0.6 * uPx - 0.5, 0.6 * uPx + 0.5, abs(inPx))) * 0.95);
        gl_FragColor = vec4(col, a * 0.9);`;

const STIPPLE = /* glsl */ `
      // A · Lava in stipple, the planet's own material: dots fixed to the ground, densest and brightest
      // where it's hottest, thinning to a feathered edge, over a warm wash; no outline. Set, the dots
      // turn black (above, with the ground's own stipple) and thin away as it weathers.
      {
        float far = acos(clamp(dot(vDir, uVent), -1.0, 1.0));
        float lvr = lv + 0.1 * (noise3(vDir * 40.0) - 0.5), lwr = max(fwidth(lvr), 1e-4) * 2.5;
        float cov = smoothstep(0.5 - lwr, 0.5 + lwr, lvr), T = lavaHeat(lv, far);
        float inner = smoothstep(0.5, 0.75, lvr);
        // The warm wash beneath.
        col = mix(col, mix(vec3(0.99, 0.74, 0.52), heatRamp(T), 0.55), cov * (0.6 + 0.3 * inner));
        // The dots: more where it's hotter, fewer towards the edge; and the hottest glow brighter.
        float want = (0.55 + 0.7 * T) * (0.4 + 0.6 * inner);
        float dots = stipple(vDir, 260.0, want * 1.5, 0.75 * uPx, px); // (a coarser lattice than the ground's, on the same shell)
        col = mix(col, heatRamp(max(T * 0.85, 0.28)), dots * cov);
        // Set: a soft grey wash under its black dots, fading as it weathers.
        float hs = setOn * (1.0 - cov);
        col *= mix(vec3(1.0), vec3(0.88, 0.86, 0.83), hs * black * 0.6);
        // A warm glow on the ground just beyond a fed flow.
        float near = smoothstep(0.1, 0.5, lv) * (1.0 - cov);
        col *= mix(vec3(1.0), vec3(1.0, 0.84, 0.7), near * 0.5 * (0.4 + 0.6 * uFeeding));
      }`;

const GLOW = /* glsl */ `
      // B · Lava as a soft glowing body: no dots and no line, colour graded by heat, warmth drifting
      // slowly through it, its edge darkening to crust before it meets the ground; set, a pale grey shadow.
      {
        float far = acos(clamp(dot(vDir, uVent), -1.0, 1.0));
        float lvr = lv + 0.08 * (noise3(vDir * 40.0) - 0.5), lwr = max(fwidth(lvr), 1e-4) * 2.0;
        float cov = smoothstep(0.5 - lwr, 0.5 + lwr, lvr), T = lavaHeat(lv, far);
        float crust = 1.0 - smoothstep(0.5, 0.68, lvr);
        vec3 lc = heatRamp(T * (1.0 - 0.55 * crust));
        col = mix(col, lc, cov * 0.94);
        // Set: a pale grey shadow, fading as it weathers.
        float hs = setOn * (1.0 - cov);
        col *= mix(vec3(1.0), vec3(0.78, 0.76, 0.74), hs * black * 0.55);
        // Its glow on the ground beyond it.
        float near = smoothstep(0.08, 0.5, lv) * (1.0 - cov);
        col *= mix(vec3(1.0), vec3(1.0, 0.8, 0.64), near * 0.6 * (0.4 + 0.6 * uFeeding));
      }`;

/**
 * The print lava; quiet (`q`), the same print turned down, so lava is the one warm accent on a calm
 * map rather than the whole picture: softer inks (from main), laid on the paper as a wash so the ground
 * shows through rather than glowing over it (only the hot core glows), moving smoothly and slowly
 * (not on twos, no breathing), little spray, and set lava going back into the map in a few seconds,
 * as a faint mark.
 */
const PRINT = (q: boolean) => /* glsl */ `
      // Lava as a 1960s Soviet science book printed it: heat in three flat bands of ink (yellow core,
      // vermilion, dark red), no gradients and no outline, the yellow plate a little out of register
      // with the red, the ink starved here and there, all on twos. While it's fed the core breathes.
      // The inks glow by their own light, on the night side too. An eruption throws splatter round the
      // vent, in jets, and every flow's edge is sprayed rather than cut.
      // Set, the dark red turns a flat grey-black, which then breaks into the ground's stipple.
      {
        float tq = ${q ? 'uTime' : 'floor(uTime * 12.0) / 12.0'}; // on twos${q ? ' (quiet: smooth)' : ''}
        float far = acos(clamp(dot(vDir, uVent), -1.0, 1.0));
        vec3 vt1 = normalize(cross(uVent, abs(uVent.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), vt2 = cross(uVent, vt1);
        float ang = atan(dot(vDir, vt2), dot(vDir, vt1));
        // (Its edges wobble irregularly, at about the size of the mesh's triangles, so what's left of
        // their teeth, seen close, doesn't line up into a saw.)
        float wob = 0.12 * (noise3(vDir * 21.0 + vec3(0.0, tq * ${q ? '0.035' : '0.1'}, tq * ${q ? '0.025' : '0.07'})) - 0.5); // (heaving slowly, in broad rounded lobes, as a flow's toes are: a finer wobble made its edge ragged)
        float lvR = lv + wob;
        float lwr = 25.0 * px * 1.2, cov = smoothstep(0.5 - lwr, 0.5 + lwr, lvR); // (a soft edge a pixel or so wide, measured as MARGIN_PX does: by the slope from triangle to triangle, it stepped in a fine saw)
        // Its heat: the core follows the deepest lava, down the flow (the vent warms it only a little,
        // or the core sat round the vent like a yolk), pinching and swelling along its length as it's carried.
        vec2 pol = vec2(cos(ang), sin(ang)) * far;
        vec2 rid = pol * (1.0 - uDrift * 0.011 / max(far, 0.02)); // (carried outward from the vent: fast enough to see it flow)
        float pinch = noise3(vec3(rid * 12.0, 7.0 + tq * 0.08));
        float T = clamp(smoothstep(0.55, 2.1, lvR) * 0.85 + exp(-far / 0.06) * 0.2 + 0.1 * (pinch - 0.5), 0.0, 1.0) * smoothstep(0.5, 0.85, lvR);
        // While it's fed, the core breathes: widening and narrowing all together (it was rings pulsing outward, which striped long flows).
        ${q ? '' : 'T += 0.06 * uFeeding * (0.5 + 0.5 * sin(tq * 1.3)) * smoothstep(0.35, 0.6, T);'}
        T += 0.04 * (noise3(vDir * 9.0 + vec3(0.0, tq * 0.05, 0.0)) - 0.5);
        float bw = max(fwidth(T), 1e-4) * 0.8;
        // (Given as printed, then made linear, in main: the screen lightens what's drawn, which turned the red to coral.
        // On the ice moons, where water is the lava, they're blues.)
        vec3 deep = uInkDeep, verm = uInkMid, yel = uInkHot;
        // Two plates, each a little out of register its own way: the red (knocked out under the core)
        // and the yellow. Where the yellow overlaps the red it overprints a deeper orange; where it falls
        // short, a sliver of paper shows between them.
        // (Shifted by a slow noise, not along how fast it changes from pixel to pixel: that jumps from
        // triangle to triangle of the mesh, and the shifted edges stepped in teeth.)
        ${q ? `// (Quiet: the gold isn't the hottest band but lava still arriving: near the vent, and down the
        // deepest of the channel, while the vent feeds it (uGold); once it stops, the gold draws back to
        // the vent over a few seconds and goes out, and the flow is left to cool.)
        float G = uGold * (exp(-far / (0.03 + 0.1 * uGold)) * 1.1 + 0.6 * smoothstep(0.9, 2.0, lvR) * exp(-far / 0.3)) * smoothstep(0.55, 0.9, lvR) + 0.08 * (pinch - 0.5);
        float gw = max(fwidth(G), 1e-4) * 0.8;
        float Ty = G + 0.06 * (noise3(vDir * 5.0 + 17.0) - 0.5);
        float redOn = smoothstep(0.66 - gw, 0.66 + gw, G), yelOn = smoothstep(0.66 - gw, 0.66 + gw, Ty);` : `float Ty = T + 0.07 * (noise3(vDir * 5.0 + 17.0) - 0.5);
        float redOn = smoothstep(0.66 - bw, 0.66 + bw, T), yelOn = smoothstep(0.66 - bw, 0.66 + bw, Ty);`}
        vec3 inkCol = mix(deep, verm, smoothstep(0.33 - bw, 0.33 + bw, T));
        // (The gap only here and there, as the plates drift a hair; a ring of it all round read as an outline.)
        float gapShows = smoothstep(0.55, 0.72, noise3(vDir * 11.0 + 31.0));
        inkCol = mix(inkCol, mix(uInkOver, paper, gapShows), redOn);
        inkCol = mix(inkCol, mix(uInkOver, yel, redOn), yelOn);
        // Crust: dark plates riding the red, carried slowly downhill while the vent feeds the flow,
        // breaking smaller towards the core and none on it, where it's too hot to skin over; more of it
        // far out, where the flow has cooled.
        // Graded, as real crust is: small, scattered flakes where it's hot, growing and gathering into
        // fewer, bigger plates where it's cooler (an even scatter of one size read as camouflage).
        float cool = 1.0 - smoothstep(0.2, 0.62, T);
        float crust = crustAt(vec3(rid, 0.0), cool, max(far, 0.0)) * (1.0 - yelOn) * (1.0 - redOn);
        inkCol = mix(inkCol, mix(deep * ${q ? '0.8' : '0.55'}, deep, smoothstep(0.33 - bw, 0.33 + bw, T)), crust * ${q ? '0.6' : '0.9'});
        // Bubbles: domes of the next hotter ink swelling on the deeper lava, more while it's fed, each
        // popping in a ring of drops. (On the yellow core, the palest yellow.)
        vec3 pale = uInkPale;
        vec3 hotter = mix(mix(verm, yel, smoothstep(0.33 - bw, 0.33 + bw, T)), pale, yelOn);
        vec2 bub = bubbles(vDir, ${q ? '(0.01 + 0.03 * uFeeding)' : '(0.03 + 0.09 * uFeeding)'} * smoothstep(0.8, 1.3, lvR) * cov, uTime, px * 34.0); // (few, and well apart: a speckle of them was too much)
        inkCol = mix(inkCol, hotter, ${q ? 'bub.x' : 'max(bub.x, bub.y)'} * cov); // (quiet: no ring of drops, which looked like a cartoon)
        // The ink as a press lays it: never quite even (heavier here, thinner there), the paper's grain
        // showing through, and a little built up along each colour's own edge, where the press squeezes it.
        float mottle = noise3(vDir * 80.0) * 0.6 + noise3(vDir * 230.0 + 4.0) * 0.4;
        float dEdge = min(min(PX_FROM(T, 0.33), PX_FROM(Ty, 0.66)), MARGIN_PX(lvR, 0.5, 25.0));
        float squeeze = (1.0 - smoothstep(0.0, 2.5 * uPx, dEdge)) * 0.18;
        inkCol *= (0.82 + 0.3 * mottle) * mix(1.0, grain, 0.5) * (1.0 - squeeze);
        // Starved ink: the paper shows through in specks.
        float starve = step(0.9, noise3(vDir * 240.0) * 0.55 + hash3(floor(vDir * 600.0)) * 0.45);
        inkCol = mix(inkCol, mix(paper, inkCol, 0.35), starve * (1.0 - uDark)); // (not on dark lava: specks of paper read as stars on it)
        ${q ? `// (Quiet: a wash on the paper, the ground showing through; only the hot core glows, a little.)
        float lit = 0.0;
        if (uDark > 0.5) {
          // Dark, as lava mostly is by day: a black-brown skin over all of it, the heat showing only where
          // it's fresh: the lava still arriving (the gold), the hot core here and there, a thin bright edge
          // along the front while it's fed, and cracks in the skin, glowing while it's hot.
          // The crust breaks into plates, each its own shade, pulled apart where it's hot, so the heat
          // shows in seams between them: wider and brighter the hotter the lava under them, closing as it cools.
          // (The plates laid on the world itself, three ways blended, and warped: laid round the vent, in
          // rings and spokes, they made a flower of it, and even polygons read as a tortoise's shell.)
          // (The plates ride the flow: laid out round the vent and carried outward while it's fed, as crust
          // floats on running lava; warped, so they don't read as rings or a tortoise's shell.)
          vec2 pr = rid * 46.0 + 0.9 * vec2(noise3(vDir * 9.0), noise3(vDir * 9.0 + 3.7));
          vec2 pl = plates(pr);
          // (And for running lava, rafts rather than a net of plates: a slow, warped field carried down the
          // flow; where it's high, a raft of crust floats; few and small while it's hot, joining as it cools.)
          vec2 fr = rid * 30.0 + 1.6 * vec2(noise3(vDir * 6.0 + 1.3), noise3(vDir * 6.0 + 8.1));
          vec2 fr2 = mat2(0.8, -0.6, 0.6, 0.8) * fr * 0.75;
          float raftF = 0.5 * (noise3(vec3(fr * 0.75, tq * 0.05)) + noise3(vec3(fr2 + 11.0, tq * 0.05 + 3.0))); // (one broad scale, twice, turned against each other: rounded rafts, as crust on running lava is; a finer scale tore their edges, and one alone left the noise's grid in square corners)
          raftF = 0.5 + (raftF - 0.5) * 1.6;
          float run = max(T, uFeeding * 0.62 * smoothstep(0.5, 0.9, lvR)); // (while the vent feeds it, all the running lava is molten under its skin, thin or deep)
          float pfw = max(fwidth(pl.x), 1e-4), hot = smoothstep(0.2, 0.65, run);
          // Molten while it runs: the plates are islands of crust on a bright liquid, wide apart while the vent
          // feeds it and it's hot, closing into a skin as it slows and cools (as every game's lava that reads
          // as lava at a glance is: bright, moving, with dark crust floating on it).
          float molten = smoothstep(0.15, 0.55, run) * mix(0.45, 1.0, uFeeding) * (0.6 + 0.4 * exp(-far / 0.25));
          float raftAt = mix(0.34, 0.84, molten), rfw = max(fwidth(raftF), 1e-4) * 2.0;
          float seam = (1.0 - smoothstep(raftAt - rfw, raftAt + rfw, raftF)) * smoothstep(0.2, 0.5, run);
          // The skin itself: rough at two scales, as a'a is, and folded along the flow (the level lines of how
          // deep it lies), as pahoehoe's ropes are, faintly, as an engraver would cut them.
          float rough = noise3(vDir * 180.0) * 0.6 + noise3(vDir * 520.0 + 2.0) * 0.4;
          float fold = abs(fract(lvR * 3.5 + 0.35 * noise3(vDir * 40.0)) - 0.5), foldW = max(fwidth(lvR * 3.5), 1e-4);
          float folds = (1.0 - smoothstep(0.0, foldW * 1.2, fold)) * smoothstep(0.6, 1.2, lvR) * 0.12 * smoothstep(0.4, 0.7, noise3(vDir * 14.0)); // (here and there, not everywhere: everywhere, they read as contour lines)
          // (Richer: plates a little warmer or cooler, brown to slate; the heat under the skin showing
          // through it as a faint red where it's thick and hot; a glassy sheen where the light catches
          // fresh crust, silver-blue, as new pahoehoe has; and the crest of each fold catching it too.)
          vec3 crustBase = mix(vec3(0.066, 0.046, 0.034), vec3(0.048, 0.047, 0.054), smoothstep(0.3, 0.8, pl.y));
          vec3 crustInk = crustBase * uCrustTint * (0.86 + 0.18 * pl.y) * (0.78 + 0.44 * rough) * (1.0 - folds);
          crustInk = mix(crustInk, deep * 0.5, 0.45 * smoothstep(0.25, 0.8, T) * (0.6 + 0.4 * noise3(vDir * 24.0)));
          float foldHi = (1.0 - smoothstep(0.0, foldW * 1.6, abs(fold - 0.14))) * smoothstep(0.6, 1.2, lvR);
          float sheen = pow(max(0.0, dot(reflect(-L, Nn), V)), 9.0) * (0.35 + 0.65 * rough) + foldHi * 0.1 * smoothstep(0.4, 0.7, noise3(vDir * 14.0));
          crustInk += vec3(0.1, 0.11, 0.135) * sheen * (0.45 + 0.55 * smoothstep(0.15, 0.6, T));
          float frontPx = MARGIN_PX(lvR, 0.5, 25.0);
          float front = (1.0 - smoothstep(0.6 * uPx, 2.2 * uPx, frontPx)) * uFeeding * smoothstep(0.45, 0.75, noise3(vDir * 45.0 + tq * 0.05)) * 0.7; // (thin, broken, and soft: a bright line all round looked drawn on)
          // The open heat at the vent and down the fresh stream, graded as incandescence is: pale gold
          // at the mouth, orange, then a dull red where the crust is closing over it; its edge ragged.
          // The open heat at the vent and down the fresh stream, as a print lays it: three flat inks (a
          // dull red, orange, gold), each edge crisp and ragged, screened in halftone dots where one gives
          // way to the next (blended smoothly, it looked airbrushed beside the rest of the print).
          float heatV = max(G, T * 0.75) + 0.12 * (noise3(vDir * 30.0 + vec3(0.0, tq * 0.04, 0.0)) - 0.5) + 0.05 * (noise3(vDir * 90.0) - 0.5);
          float hw = max(fwidth(heatV), 1e-4) * 0.8;
          // (Smaller than it was, so the heat is precious: a bright mouth, quickly crusting over.)
          float band1 = smoothstep(0.5 - hw, 0.5 + hw, heatV), band2 = smoothstep(0.68 - hw, 0.68 + hw, heatV), band3 = smoothstep(0.86 - hw, 0.86 + hw, heatV);
          // (Screened in the game's own stipple, scattered as by hand: a halftone on a grid read as pixels.)
          band2 = max(band2, stipple(vDir, 260.0, 1.6 * smoothstep(0.56, 0.68, heatV), 0.55 * uPx, px) * band1);
          band3 = max(band3, stipple(vDir, 260.0, 1.6 * smoothstep(0.74, 0.86, heatV), 0.55 * uPx, px) * band2);
          band3 *= exp(-far / 0.05); band2 *= 0.5 + 0.5 * exp(-far / 0.12); // (the gold only at the mouth, the orange close by: a wide bright disc looked like a lamp)
          float open = band1 * (0.35 + 0.65 * exp(-far / 0.16)); // (the open heat reaches well down the stream)
          // A skin forming over the heat: dark plates closing over it from its edge in, the glow showing
          // only in the cracks between them, wider nearer the mouth. (A bare blob of graded heat looked airbrushed.)
          float skinW = 0.04 + 0.22 * smoothstep(0.6, 0.95, heatV);
          float skinOver = smoothstep(0.62 - 0.3 * smoothstep(0.6, 0.95, heatV) - rfw, 0.62 - 0.3 * smoothstep(0.6, 0.95, heatV) + rfw, raftF) * (1.0 - smoothstep(0.9, 0.97, heatV)); // (the skin closing over the heat in rounded rafts too: a net of plates there read as a honeycomb)
          open *= 1.0 - skinOver * 0.7;
          vec3 glowCol = mix(deep * 1.15, verm, band2);
          glowCol = mix(glowCol, yel, band3);
          glowCol = mix(glowCol, uInkPale, smoothstep(0.97 - hw, 0.97 + hw, heatV) * step(far, 0.015)); // (the palest only right at the mouth)
          inkCol = crustInk;
          // The liquid between: orange to gold, brightest where hottest, rippling as it's carried down the flow.
          float ripple = noise3(vec3(fr * 1.1, tq * 0.35)) * 0.65 + noise3(vec3(fr * 2.6 + 7.0, tq * 0.6)) * 0.35;
          // (Its own inks, saturated: the print's soft vermilion read as paint, not as something glowing.)
          vec3 lRed = vec3(0.72, 0.1, 0.02) * mix(vec3(1.0), uInkMid / max(uInkMid.r, 1e-3), 0.25), lOrange = vec3(1.0, 0.36, 0.04), lGold = vec3(1.0, 0.72, 0.22);
          float heatL = clamp(0.25 + 0.5 * hot + 0.5 * (ripple - 0.45) + 0.2 * molten, 0.0, 1.0);
          vec3 liquid = mix(lRed, lOrange, smoothstep(0.0, 0.55, heatL));
          liquid = mix(liquid, lGold, smoothstep(0.55, 1.0, heatL));
          liquid = mix(liquid, vec3(1.0, 0.9, 0.62), smoothstep(0.82, 1.0, ripple) * hot * 0.45);
          // Darker veins swirling through it, carried with it: the skin of the liquid itself, cooling in threads.
          float vn = noise3(vec3(fr * 1.7 + 3.0, tq * 0.25)), vw = max(fwidth(vn), 1e-4) * 1.5;
          float vein = (1.0 - smoothstep(0.0, 0.09, abs(vn - 0.5))) * (0.5 + 0.5 * (1.0 - hot)) * smoothstep(0.02, 0.07, far) * 0.6; // (broad and soft, a shading in the liquid: thin lines read as a maze; and not at the very mouth, where the carrying squeezes them into rings)
          liquid = mix(liquid, lRed * 0.7, vein * 0.6);
          // A raft's edge glows where the liquid meets it: a thin bright line, its crust's hot underside.
          float raftEdge = 1.0 - smoothstep(0.0, rfw * 2.5, abs(raftF - raftAt));
          crustInk = mix(crustInk, deep * 0.8, raftEdge * 0.5 * smoothstep(0.2, 0.5, run));
          inkCol = mix(inkCol, liquid, seam);
          inkCol = mix(inkCol, verm, front * 0.9);
          inkCol = mix(inkCol, glowCol, open);
          lit = clamp(max(open, max(seam * (0.75 + 0.25 * hot), front)), 0.0, 1.0);
        }
        col = mix(col, inkCol * mix(vec3(1.0), col / paper, uDark > 0.5 ? 0.15 : 0.5), cov * (uDark > 0.5 ? 0.96 : 0.92));
        glowInk = uDark > 0.5 ? cov * lit * 0.95 : cov * mix(0.4, 0.95, yelOn); // (a little of its own light, or the lighting dims the soft inks to mud; the gold, the one light)
        // A burst: the mouth flares white-gold for a moment, a wide soft light round it fading as the ash rises.
        if (uFlash > 0.02) {
          float fr2 = 0.018 + 0.06 * (1.0 - min(1.0, uFlash));
          float core = (1.0 - smoothstep(fr2 * 0.6, fr2, far)) * min(1.0, uFlash), ring = exp(-far / (0.04 + 0.1 * (1.0 - min(1.0, uFlash)))) * min(1.0, uFlash) * 0.75;
          col = mix(col, mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.95, 0.8), core), clamp(max(core, ring * onLand), 0.0, 1.0));
          glowInk = max(glowInk, max(core, ring * 0.7));
        }
        // As the pressure builds, a spot of gold warms the ground at the vent, widening, before anything pours.
        if (uBuild > 0.3) {
          float spotR = (0.004 + 0.018 * uBuild) * (0.8 + 0.4 * noise3(vDir * 90.0));
          float spot = smoothstep(0.3, 0.6, uBuild) * (1.0 - smoothstep(spotR - px, spotR + px, far)) * onLand * (1.0 - cov);
          col = mix(col, yel * mix(vec3(1.0), col / paper, 0.5), spot * 0.55);
          glowInk = max(glowInk, spot * 0.5);
        }` : `col = mix(col, inkCol, cov * 0.97);
        glowInk = cov * 0.85;`}
        // Splatter. Round the vent while it erupts, thrown in jets (thicker one way than another), the
        // near drops still hot; and along every running edge, a spray a little way out onto the ground.
        float jets = 0.3 + 0.9 * smoothstep(0.35, 0.8, noise3(vec3(cos(ang) * 2.2, sin(ang) * 2.2, 4.0)));
        float thrown = uSpray * exp(-far / (0.035 + 0.11 * uSpray)) * jets * onLand; // (thrown wide, so the drops lie apart)
        float edgeSpray = smoothstep(0.06, 0.5, lv + 0.12 * (noise3(vDir * 30.0) - 0.5)) * (0.35 + 0.65 * uFeeding);
        float spDens = ${q ? '0.0' : 'clamp(thrown * 1.1 + edgeSpray * 0.45, 0.0, 1.0)'}; // (quiet: no splatter at all; flicked ink didn't fit the calm map)
        float sp = spDens > 0.001 ? splat(vDir, spDens, px) * (1.0 - cov) : 0.0;
        vec3 spCol = mix(deep, verm, smoothstep(0.03, 0.0, far - 0.05 * uSpray) * 0.8 + 0.2 * uSpray);
        ${q ? 'if (uDark > 0.5) spCol = mix(vec3(0.045, 0.034, 0.027) * uCrustTint, spCol, smoothstep(0.35, 0.9, uSpray)); // (dark: drops glow as they land, and go black as the burst passes)' : ''}
        col = mix(col, spCol, sp * 0.95);
        glowInk = max(glowInk, sp * ${q ? '0.0' : '0.85'});
        // Set, it still glows a long while, cooling through the same inks, band by band: vermilion for
        // its first ten seconds or so, dark red till about twenty-five, then a flat grey-black till about
        // forty-five, which then breaks into the ground's stipple. (black is e^(-age/45).)
        // (Reaching under the running lava's soft edge, and filling in where the two meet: each field's edge
        // is eased its own way, and stopping where the lava starts, the paper showed between them in a ragged seam.)
        float joinOn = smoothstep(0.42, 0.58, here + lvR) * smoothstep(0.03, 0.12, here) * onLand;
        float hs = max(setOn, joinOn) * (1.0 - smoothstep(0.6, 1.0, cov)) * (1.0 - sp);
        float sb = max(fwidth(black), 1e-4) * 0.8;
        ${q ? `// (Quiet: red for its first few seconds, rust till about twelve, then a pale terracotta mark that
        // lingers a minute or two and goes; each change gradual, not in bands. Banded by its age, and fading
        // to bare paper in half a minute, a pool cooled from its edge in rings, and an old one left a pale
        // hole inside newer lava.)
        float sHot = smoothstep(0.85, 0.97, black), sWarm = smoothstep(0.55, 0.85, black);
        vec3 setCol = mix(paper * vec3(0.95, 0.86, 0.78), deep, sWarm);
        setCol = mix(setCol, verm, sHot);
        // (Dark: set, it's basalt: black-brown, a dull red for its first moments, greying slowly as it weathers.)
        // (Dark: cooling in one sequence: a dull red for its first moments, then black, then basalt
        // brown, weathering to a dark grey-brown before it goes; the newest always the darkest.)
        if (uDark > 0.5) {
          // (Weathering sooner, and lighter: black for its first seconds, basalt by half a minute, a light
          // grey-brown by a minute, and gone in two and a half, so the world stays airy, the newest the darkest.)
          setCol = mix(vec3(0.27, 0.235, 0.2), vec3(0.06, 0.044, 0.034), smoothstep(0.3, 0.6, black)) * uCrustTint;
          setCol = mix(setCol, vec3(0.035, 0.026, 0.021) * uCrustTint, smoothstep(0.65, 0.85, black));
          setCol = mix(setCol, mix(deep * 0.45, vec3(0.05, 0.035, 0.028) * uCrustTint, 0.4), smoothstep(0.85, 0.99, black)); // (a dark red for its first seconds only, eased in: sharp, neighbouring points cooling a moment apart blotched it) // (a dark red for its first seconds only: brighter and longer, a thin sheet just set flashed orange)
        }` : `vec3 setCol = mix(vec3(0.24, 0.22, 0.21), deep, smoothstep(0.6 - sb, 0.6 + sb, black));
        setCol = mix(setCol, verm, smoothstep(0.8 - sb, 0.8 + sb, black));`}
        // (Pressed as the running ink is; and skinning over with crust as it cools, the plates now still.)
        float sCrust = crustAt(vDir, 0.6 + 0.4 * (1.0 - smoothstep(0.6, 1.0, black)), 1.0) * smoothstep(${q ? '0.75, 0.8' : '0.55, 0.65'}, black)${q ? ' * 0.6' : ''};
        ${q ? 'if (uDark < 0.5) ' : ''}setCol = mix(setCol, deep * mix(0.55, 1.0, smoothstep(0.8 - sb, 0.8 + sb, black)), sCrust * 0.9); // (not on dark lava: its red plates were blotches)
        setCol *= (0.82 + 0.3 * mottle) * mix(1.0, grain, 0.5);
        setCol = mix(setCol, mix(paper, setCol, 0.35), starve * (1.0 - uDark)); // (not on dark lava: specks of paper read as stars)
        ${q ? `// (Dark: solid basalt for its first minute, then settling, not going: the flow stays on the map as a
        // field of darker rock, a lasting record of where the fire went, as a geological map keeps every flow.)
        float weathered = 1.0 - smoothstep(0.04, 0.16, black);
        if (uDark > 0.5) setCol = mix(setCol, mix(vec3(0.27, 0.235, 0.2), vec3(0.17, 0.15, 0.135), 0.55) * uCrustTint, weathered);
        float setA = hs * (uDark > 0.5 ? 0.95 * smoothstep(0.04, 0.16, black) + 0.55 * weathered : 0.3 * smoothstep(0.006, 0.15, black) + 0.62 * smoothstep(0.45, 0.8, black));
        col = mix(col, setCol * mix(vec3(1.0), col / paper, uDark > 0.5 ? 0.12 : 0.5), setA);
        glowInk = max(glowInk, setA * (uDark > 0.5 ? smoothstep(0.93, 0.99, black) * 0.35 : sWarm * 0.4));
        if (uDark > 0.5) {
          // Each flow's edge inked, finely, as the maps outline a lava flow; and the ground it built shaded by
          // the lamp, softly, so a shield it raised stands up off the page (the rest of the map stays flat).
          float rimD = MARGIN_PX(here, 0.5, 21.0);
          float rimLine = (1.0 - smoothstep(0.3 * uPx, 1.1 * uPx, rimD)) * onLand * (1.0 - cov);
          col = mix(col, vec3(0.13, 0.11, 0.1) * uCrustTint, rimLine * 0.5);
          float shade = clamp(0.8 + 0.45 * dot(Nn, L), 0.62, 1.12);
          col *= mix(1.0, shade, setOn * (1.0 - cov) * 0.85);
        }` : `float setA = hs * smoothstep(0.33, 0.4, black) * 0.92;
        col = mix(col, setCol, setA);
        glowInk = max(glowInk, setA * smoothstep(0.6 - sb, 0.6 + sb, black) * 0.7); // (still hot, it glows; gone grey, it's ground)`}
        // A burp: now and then while it erupts, gas swells under the crust at the vent, a dark lumpy dome
        // stretching till the heat shows through it in blotches, and tears: clots flung out, more one way
        // than another, landing hot and darkening to black, lying a while, then crumbling; and dark ash
        // blown out over the ground. Every one different (its size, its way, its shape: from main).
        // (A pale dome popping in a neat ring of drops looked like a cartoon.)
        ${q ? `// A warm glow on the ground round fresh lava, and at the vent while it pours: the heat lighting what's near it.
        {
          // (Close to the fresh lava only, while it's fed: spread over a wide thin sheet, it tinted half the world.)
          float halo = (1.0 - cov) * onLand * uFeeding * (smoothstep(0.1, 0.5, lvR) * exp(-far / 0.2) * 0.85 + exp(-far / 0.05) * 0.8);
          col = mix(col, col * vec3(1.0, 0.78, 0.58), clamp(halo, 0.0, 1.0) * 0.55);
          glowInk = max(glowInk, halo * 0.3);
        }` : ''}
        if (uBurp >= 0.0) {
          float bt = uBurp, on = step(0.0, bt), S = uBurpSize;
          float sw = clamp(bt / 1.4, 0.0, 1.0);
          vec2 dirA = vec2(cos(ang), sin(ang));
          float jag = noise3(vec3(dirA * 2.5, uBurpSeed * 17.0 + bt * 0.9)) * 0.7 + noise3(vec3(dirA * 7.0, uBurpSeed * 5.0 + bt * 1.7)) * 0.3;
          float R = S * (0.006 + 0.04 * sw * sw) * (0.6 + 0.8 * jag);
          float dome = on * step(bt, 1.4) * (1.0 - smoothstep(R - px, R + px, far)) * onLand;
          float skin = noise3(vDir * 160.0 + uBurpSeed * 31.0) * 0.6 + noise3(vDir * 420.0) * 0.4, skw = max(fwidth(skin), 1e-4);
          float thinAt = 0.86 - 0.42 * sw * sw, through = smoothstep(thinAt - skw, thinAt + skw, skin);
          vec3 domeCol = mix(deep * ${q ? '0.85' : '0.3'}, mix(verm, yel, smoothstep(0.78 - skw, 0.78 + skw, skin)), through); // (quiet: a rust skin, not a dark one, which read as a murky ball)
          col = mix(col, domeCol, dome);
          glowInk = max(glowInk, dome * mix(0.35, 0.9, through));
          float ft = bt - 1.4, flown = step(0.0, ft) * on;
          float fly = clamp(ft / 0.45, 0.0, 1.0);
          float lop = pow(0.5 + 0.5 * cos(ang - uBurpDir), 1.5);
          float reach = S * (0.03 + 0.13 * (0.25 + 0.75 * lop) * (1.0 - (1.0 - fly) * (1.0 - fly)));
          float inReach = 1.0 - smoothstep(reach * 0.75, reach * 1.05, far);
          // Clots: torn blobs, big near the vent and scattered further out, breaking into crumbs as they go.
          vec3 cp = vDir * 48.0 + uBurpSeed * 13.0;
          float cn = noise3(cp) * 0.65 + noise3(cp * 2.9 + 4.0) * 0.35, cnw = max(fwidth(cn), 1e-4);
          float cth = mix(0.48, 0.76, smoothstep(0.0, reach + 1e-4, far)) + 0.1 * (1.0 - lop) + 0.25 * smoothstep(6.0, 11.0, ft) * noise3(vDir * 300.0);
          float hit = smoothstep(cth - cnw, cth + cnw, cn) * inReach * flown * onLand;
          if (flown > 0.0 && ft < 11.0) hit = max(hit, lattice(vDir * 150.0, 150.0, 0.45 * lop * inReach * (1.0 - smoothstep(6.0, 11.0, ft)), 0.7 * uPx, 41.0 + floor(uBurpSeed * 50.0), px * 150.0) * onLand);
          ${q ? 'hit = 0.0; // (quiet: no clots flung about, which read as splatter)' : ''}
          vec3 clotCol = mix(yel, verm, smoothstep(0.0, 0.7, ft));
          clotCol = mix(clotCol, deep * 0.5, smoothstep(0.5, 2.5, ft));
          clotCol = mix(clotCol, uInkCold, smoothstep(2.0, 5.0, ft));
          col = mix(col, clotCol, hit * 0.95);
          glowInk = max(glowInk, hit * (1.0 - smoothstep(1.0, 3.5, ft)) * 0.85);
          // Ash, blown out the way it burst, settling, then going.
          float ash = flown * exp(-far / (reach * 1.4 + 1e-3)) * (0.3 + 0.9 * lop) * smoothstep(0.0, 0.6, ft) * (1.0 - smoothstep(4.0, 12.0, ft)) * onLand * (1.0 - hit);
          if (${q ? 'false' : 'ash > 0.02'}) col = mix(col, uInkAsh, stipple(vDir, 300.0, ash * 1.3, 0.5 * uPx, px) * 0.85);
        }
      }`;
