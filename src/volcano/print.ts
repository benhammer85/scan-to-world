/**
 * The worlds drawn as prints: stipple on cream paper, pinned to the
 * ground so it turns with it and never crawls (as Return of the Obra Dinn pins its dither); a few
 * loose washes of watercolour laid on by hand, sea-green along the coast and ochre over parts of
 * the land; a dotted graticule over the sea; a crisp coast; and the lava in one of two hands:
 *
 *   1  woodblock: a block of vermilion, hot orange where it lies thick, cut by hand with gouges
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
export type Look = 0 | 1 | 2;
export const LOOKS: { id: string; look: Look; words: string }[] = [
  { id: 'wood', look: 1, words: 'woodblock' },
  { id: 'water', look: 2, words: 'watercolour' },
  { id: 'plain', look: 0, words: 'last used' },
];

/** Declared before the shader's main(); uses its hash3, noise3 and uPx. */
export const PRINT_FUNCTIONS = /* glsl */ `
  varying vec3 vS;
  uniform float uFloodDots;
  // Craters, as the charts draw them (see 'Craters' below): each one's middle and width, how long since it was dug, and the light in the world's own frame.
  uniform vec4 uCrater[64];
  uniform float uCraterAge[64];
  uniform int uCraterCount;
  uniform vec3 uLightObj;
  uniform vec3 uBlock, uBlockDeep, uBlockHot; // the woodblock's colours: vermilion, or on the ice moons, water's blues
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453);
  }
  // A dot for each cell of a lattice lying on the world's shell (D cells to its radius), each moved
  // a little off its cell's middle; for each pixel, the dots of the eight cells round it. Each dot
  // is drawn once the darkness wanted here passes its own threshold, at rPx pixels across (dots
  // keep their size on the screen as you zoom; how closely they're set is fixed to the ground).
  // Seen from far, where they'd crowd into moire, they give way to their own average tone.
  float lattice(vec3 p, float D, float dark, float rPx, float salt) {
    float ps = max(length(dFdx(p)), length(dFdy(p)));
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
  float stipple(vec3 dir, float D, float dark, float rPx) {
    float k = min(dark, 1.6) * 0.42;
    vec3 d2 = vec3(dir.y * 0.8 + dir.z * 0.6, dir.z * 0.8 - dir.y * 0.6, dir.x).yzx;
    vec3 d3 = vec3(dir.z * 0.36 - dir.x * 0.93, dir.x * 0.36 + dir.z * 0.93, dir.y).zxy;
    return max(max(lattice(dir * D, D, k, rPx, 0.0), lattice(d2 * (D * 1.29), D * 1.29, k, rPx, 31.0)), lattice(d3 * (D * 1.13), D * 1.13, k, rPx, 57.0));
  }
  // Round halftone dots on the same kind of lattice, each rCells across (in cells): rock breaking up.
  float halftone(vec3 dir, float D, float rCells) {
    vec3 p = dir * D;
    float ps = max(length(dFdx(p)), length(dFdy(p))), cov = 0.0;
    vec3 i0 = floor(p - 0.5);
    for (int k = 0; k < 8; k++) {
      float fk = float(k);
      vec3 c = i0 + vec3(mod(fk, 2.0), mod(floor(fk / 2.0), 2.0), floor(fk / 4.0));
      vec3 h = hash33(c + 17.0);
      vec3 q = c + 0.5 + (h - 0.5) * 0.3;
      float lq = length(q);
      if (abs(lq - D) > 0.5) continue;
      q *= D / lq;
      float rr = rCells * (0.75 + 0.5 * h.z);
      cov = max(cov, 1.0 - smoothstep(rr - 0.5 * ps, rr + 0.5 * ps, length(p - q)));
    }
    return cov;
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
  // Gouges: the cuts lie along the level lines of a phase, each line broken into strokes of its own
  // width that taper as it nears the block's edge; none where the lines would crowd into a smear.
  float gouges(float phase, float taper) {
    float fw = max(fwidth(phase), 1e-5), k = floor(phase + 0.5);
    float dpx = abs(phase - k) / fw;
    float w = (0.35 + 1.1 * noise3(vDir * 38.0 + vec3(k * 1.37))) * uPx * taper;
    float stroke = smoothstep(0.24, 0.36, noise3(vDir * 60.0 + vec3(k * 2.1, 0.0, k)));
    // (Nor where the phase stands still, as it does where lava lies whole: there every pixel is "on" a line.)
    return (1.0 - smoothstep(w - 0.5, w + 0.5, dpx)) * stroke * (1.0 - smoothstep(0.12, 0.3, fw)) * smoothstep(0.004, 0.02, fw);
  }
`;

/** The ground's colour, as a print: replaces the shader's own colour step. */
export function printFragment(look: Look, sea: boolean): string {
  return /* glsl */ `
      float px = max(length(dFdx(vDir)), length(dFdy(vDir)));
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
      // The land: life's washes and ash, as their tint over the land's paper; and loose ochre over parts of it, never all.
      // Life's washes (and ash, and fresh rock) come as a soft tint; laid as a hand-coloured map lays them,
      // each is an even wash with a ragged edge, a darker rim and grain, wherever it's more than a trace.
      vec3 dt = clamp(1.0 - vColor.rgb / max(uLandPaper, vec3(0.01)), 0.0, 1.0);
      float ds = max(dt.r, max(dt.g, dt.b)), lr = ds / (0.05 + 0.05 * b1) + 0.3 * (b3 - 0.5), lrw = max(fwidth(lr), 1e-4);
      float inL = smoothstep(1.0 - lrw, 1.0 + lrw, lr), rimL = exp(-max(0.0, lr - 1.0) / 0.5) * 0.7;
      vec3 tint = 1.0 - (dt / max(ds, 1e-3)) * clamp(0.3 * (0.55 + b2 + rimL) * grain, 0.0, 0.6) * inL;
      float oReach = 0.35 + 1.5 * (1.0 - noise3(vDir * 5.0 + 9.0)) - vH * 2.5 + 0.25 * (b2 - 0.5);
      float ow = max(fwidth(oReach), 1e-4);
      float aO = clamp(0.22 * (0.3 + 1.1 * b1 * b1 + exp(-max(0.0, 1.0 - oReach) / 0.08) * 0.9) * grain, 0.0, 1.0) * (1.0 - smoothstep(1.0 - ow, 1.0 + ow, oReach));
      // The world's own colour, laid over all its land as one loose wash: heavier here, thinner there.
      vec3 own = clamp(uLandPaper / paper, 0.0, 1.05);
      vec3 landCol = paper * mix(vec3(1.0), own, clamp(0.8 + 0.5 * (b1 - 0.5), 0.0, 1.0) * (0.9 + 0.1 * grain)) * tint;
      // Where lava has lain and the world keeps the mark (the Moon's dark seas, the ice moons' new ice, Io's
      // sulphur): a wash of its own, with a ragged edge and a rim where it pooled.
      float flr = vMarks.x + 0.12 * (b3 - 0.5) + 0.08 * (b2 - 0.5), flw = max(fwidth(flr), 1e-4);
      float inF = smoothstep(0.5 - flw, 0.5 + flw, flr), rimF = exp(-max(0.0, (flr - 0.5) / flw) / (3.0 * uPx));
      landCol = mix(landCol, uFlooded * (1.0 - 0.12 * rimF), uFloodStrength * inF * clamp(0.72 + 0.35 * (b2 - 0.5) + 0.25 * rimF, 0.0, 1.0));
      float floodDark = inF * uFloodStrength * uFloodDots; // (the Moon's dark seas are stippled darker, as lunar charts draw them)
      landCol *= 1.0 - aO * (1.0 - vec3(0.77, 0.63, 0.36));
      col = mix(col, landCol * mix(vec3(1.0), col / paper, inSea), onLand);

      // Lava's marks.
      float lv = vMarks.y * onLand, lw = max(fwidth(lv), 1e-4); // (under the sea it's hidden, as it always was)
      float here = vMarks.w, hw = max(fwidth(here), 1e-4), setOn = smoothstep(0.5 - hw, 0.5 + hw, here) * onLand;
      float black = here > 0.01 ? clamp(vMarks.z / here, 0.0, 1.0) : 0.0;

      // Stipple: crowded along the shore, thinning inland, gathering on slopes turned from the light,
      // and at the world's edge to round it.
      vec3 V = normalize(vViewPosition), Nn = normalize(vN), S = normalize(vS), L = normalize(vec3(-0.55, 0.6, 0.6));
      float limb = exp(-clamp(dot(S, V), 0.0, 1.0) * 22.0) * 0.35;
      // Lines fade out as the ground turns edge-on at the world's rim, so it ends softly, never in an
      // inked outline (seen edge-on, the height crosses the sea everywhere, and the coast line would ring the world).
      float edgeOn = smoothstep(0.06, 0.3, clamp(dot(S, V), 0.0, 1.0));
      float hl = max(vH, 0.0);
      float relief = max(0.0, dot(S, L) - dot(Nn, L)) * ${sea ? '2.2' : '3.6'};
      // Craters, as lunar charts draw them: a crescent of dots on the inside wall nearest the light (it's
      // in shadow), the far wall bare (it's lit), the floor lightly dotted, a rim line thick on the side
      // away from the light and thin towards it, and round a fresh one a spray of dots, in rays, that fades.
      float crDark = 0.0, litWall = 0.0, rimInk = 0.0;
      for (int i = 0; i < 64; i++) {
        if (i >= uCraterCount) break;
        vec4 c = uCrater[i];
        float d = length(vDir - c.xyz), q = d / c.w;
        if (q > 2.4) continue;
        vec3 t = vDir - c.xyz; t -= dot(t, c.xyz) * c.xyz; t /= max(length(t), 1e-6);
        vec3 lt = uLightObj - dot(uLightObj, c.xyz) * c.xyz; lt /= max(length(lt), 1e-4);
        float side = dot(t, lt) * smoothstep(0.0, 0.25, q); // +1 on the side towards the light (and nothing at the very middle)
        float wall = smoothstep(0.3, 0.9, q) * (1.0 - smoothstep(0.96, 1.04, q));
        crDark += wall * smoothstep(-0.15, 0.65, side) * (0.75 + 0.3 * b3) + (1.0 - smoothstep(0.45, 0.75, q)) * 0.06;
        litWall = max(litWall, wall * smoothstep(0.05, -0.55, side));
        float rimW = (0.3 + 1.0 * smoothstep(0.35, -0.85, side)) * uPx * (0.85 + 0.3 * b3);
        rimInk = max(rimInk, (1.0 - smoothstep(rimW - 0.5, rimW + 0.5, abs(d - c.w) / px)) * smoothstep(0.08, 0.2, noise3(vDir * 30.0 + float(i))));
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
      ${look === 1 ? 'darkL += 1.7 * pow(black, 1.1) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)); // set rock: black in close stipple, thinning as it weathers' : ''}
      float dark = mix(limb + exp(-max(-vH, 0.0) / 0.03) * 0.14, darkL + limb, onLand); // (and a little over the shallows, so what rises under the sea shows)
      if (dark > 0.035) col = mix(col, ink, stipple(vDir, 300.0, dark, 0.45 * uPx) * 0.92);
      // The graticule, over the open sea.
      col = mix(col, ink, edgeOn * graticule(vDir, px) * ${sea ? '(1.0 - onLand) * (1.0 - 0.5 * aSea) * 0.5' : '0.22'});

      col = mix(col, ink, rimInk * onLand * 0.85 * edgeOn);

      ${look === 1 ? WOOD : WATER}

      ${sea ? `// The coast: one crisp line.
      float coastPx = abs(vH) / max(fwidth(vH), 1e-6);
      col = mix(col, ink, (1.0 - smoothstep(0.55 * uPx - 0.5, 0.55 * uPx + 0.5, coastPx)) * 0.95 * edgeOn);` : ''}
      diffuseColor.rgb *= col;`;
}

const WOOD = /* glsl */ `
      // Set: black, in close halftone dots; weathering, the dots shrink until they are only stipple.
      float lvR = lv + (dFdx(lv) * 1.6 - dFdy(lv) * 1.1) * uPx + 0.05 * (noise3(vDir * 45.0) - 0.5);
      float onR = smoothstep(0.5 - lw, 0.5 + lw, lvR);
      float hs = setOn * (1.0 - onR);
      // (Set rock's darkness is added to the stipple's, above: dense, random dots that thin as it weathers.)
      // Running: the colour block, printed a little off its outline.
      if (onR > 0.0) {
        float inPx = (lvR - 0.5) / lw;
        // Vermilion, deeper at the edge, and hot orange only in the core of a broad flow.
        // (Not by how far in from the edge: that's measured a triangle at a time, and showed the triangles.)
        float core = smoothstep(0.85, 1.0, lv) * smoothstep(0.4, 0.75, b1 * 0.6 + b2 * 0.4);
        vec3 lc = mix(uBlockDeep, uBlock, smoothstep(0.0, 4.0, inPx / uPx));
        lc = mix(lc, uBlockHot, clamp(core, 0.0, 0.55));
        // Ink squeezed darker at the edge, and the wood's grain in the flat.
        lc *= 1.0 - 0.2 * exp(-max(inPx, 0.0) / (2.5 * uPx));
        lc *= 0.93 + 0.07 * (0.5 + 0.5 * sin(dot(vDir, vec3(0.2, 1.0, 0.3)) * 900.0 + noise3(vDir * 10.0) * 16.0));
        // (The cuts are the streaks, as a wind map draws the wind: see streaks.ts, drawn over this as the lava carries them.)
        float cut = 0.0;
        float speck = step(0.86, noise3(vDir * 260.0) * 0.6 + hash3(floor(vDir * 520.0)) * 0.4);
        col = mix(col, lc, onR * (1.0 - speck * 0.7 * (1.0 - cut)));
      }
      // The key block: the outline, thick and thin, here and there broken.
      {
        float dpx = abs(lv - 0.5) / lw, kw = (0.45 + 1.2 * noise3(vDir * 22.0 + 4.0)) * uPx;
        float ol = (1.0 - smoothstep(kw - 0.6, kw + 0.6, dpx)) * smoothstep(0.12, 0.2, noise3(vDir * 16.0 + 2.0)) * step(0.5 - 2.0 * lw, lv);
        col = mix(col, ink, ol * 0.92);
      }`;

const WATER = /* glsl */ `
      // Set: the wash dries to sienna, then grey, then goes.
      {
        float inS = (here - 0.5) / hw, rimS = exp(-max(inS, 0.0) / (3.0 * uPx)) * 0.8;
        vec3 sc = mix(vec3(0.23, 0.235, 0.28), vec3(0.59, 0.26, 0.15), smoothstep(0.7, 1.0, black));
        float sa = 0.7 * smoothstep(0.0, 0.55, black) * (0.4 + 0.8 * b2 * b2 + rimS) * grain;
        col *= 1.0 - clamp(sa, 0.0, 0.95) * setOn * (1.0 - smoothstep(0.5 - lw, 0.5 + lw, lv)) * (1.0 - sc);
      }
      // Running: a wet wash with a ragged edge, pooled dark at it, pigment drifting inside.
      {
        float lvr = lv + 0.14 * (noise3(vDir * 40.0) - 0.5) + 0.06 * (noise3(vDir * 110.0) - 0.5);
        float lwr = max(fwidth(lvr), 1e-4), cov = smoothstep(0.5 - lwr, 0.5 + lwr, lvr);
        float rim = exp(-max((lvr - 0.5) / lwr, 0.0) / (3.0 * uPx)) * 0.85;
        float body = 0.25 + 0.95 * pow(noise3(vDir * 16.0 + vec3(uTime * 0.04, -uTime * 0.05, uTime * 0.03)), 1.5);
        float core = smoothstep(14.0, 70.0, (lvr - 0.5) / lwr / uPx) * (0.5 + 0.9 * (b2 - 0.5));
        vec3 wc = mix(vec3(0.8, 0.2, 0.11), vec3(0.95, 0.5, 0.15), clamp(core, 0.0, 0.6) * (1.0 - rim));
        float a = clamp(1.2 * (body + rim), 0.0, 0.95) * cov * grain;
        col *= 1.0 - a * (1.0 - wc);
      }`;

/** The lava lamp's blobs, as woodblock prints too: a flat block, hot orange at a hot heart, cut with gouges, in a black outline. */
export const LAMP_PRINT_FUNCTIONS = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p), s = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), s.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), s.x), s.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), s.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), s.x), s.y), s.z);
  }
  float gouges(float phase, float taper) {
    float fw = max(fwidth(phase), 1e-5), k = floor(phase + 0.5);
    float dpx = abs(phase - k) / fw;
    float w = (0.35 + 1.1 * noise3(vDir * 38.0 + vec3(k * 1.37))) * uPx * taper;
    float stroke = smoothstep(0.24, 0.36, noise3(vDir * 60.0 + vec3(k * 2.1, 0.0, k)));
    return (1.0 - smoothstep(w - 0.5, w + 0.5, dpx)) * stroke * (1.0 - smoothstep(0.12, 0.3, fw)) * smoothstep(0.004, 0.02, fw);
  }
`;
export const LAMP_PRINT = /* glsl */ `
        vec3 paper = vec3(0.957, 0.937, 0.89), ink = vec3(0.13, 0.12, 0.105);
        // Cooling deepens the block from vermilion to its deep red; a hot heart is orange.
        vec3 col = mix(vec3(0.66, 0.14, 0.09), vec3(0.85, 0.24, 0.12), smoothstep(0.2, 0.9, heat));
        col = mix(col, vec3(0.95, 0.55, 0.17), smoothstep(2.0, 5.0, f) * heat * 0.6);
        float inPx = (f - 0.88) / w;
        col *= 1.0 - 0.2 * exp(-max(inPx, 0.0) / (2.5 * uPx));
        float kw = (0.45 + 1.2 * noise3(vDir * 22.0 + 4.0)) * uPx;
        col = mix(col, ink, (1.0 - smoothstep(kw - 0.6, kw + 0.6, abs(inPx))) * 0.92);
        gl_FragColor = vec4(col, a * (0.85 + 0.12 * smoothstep(0.0, 0.4, heat)));`;
