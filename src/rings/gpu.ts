/**
 * The press on the graphics chip: the slice's years (`years`) and the ink's grain (`grain`), worked out a
 * pixel at a time as press.ts's printYears and inkGrain do, but all at once, so a print of the whole screen
 * takes milliseconds rather than seconds. Where there's no WebGL2, `ready()` is false and press.ts presses
 * as before.
 *
 * Every table it reads (the rings' radii, each ring's facts, the wood's scans, the noise) goes up as a flat
 * float texture, 4096 wide, read by index: a scan taller than the chip allows still fits.
 */

const COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
const float TAU = 6.283185307179586, PI = 3.141592653589793;
out vec4 o;
float at(sampler2D t, int i) { return texelFetch(t, ivec2(i & 4095, i >> 12), 0).r; }
uniform sampler2D uNoise;
float vnoise(float x, float y) {
  float xi = floor(x), yi = floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3. - 2. * fx), sy = fy * fy * (3. - 2. * fy);
  int i0 = int(xi) & 255, j0 = int(yi) & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  float a = at(uNoise, j0 * 256 + i0), b = at(uNoise, j0 * 256 + i1), c = at(uNoise, j1 * 256 + i0), d = at(uNoise, j1 * 256 + i1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
float sm(float x) { float t = clamp(x, 0., 1.); return t * t * (3. - 2. * t); }
// (A hash of the number's own bits: the chip's sine is too coarse for the one the CPU uses.)
float h1(float x) { uint u = floatBitsToUint(x); u ^= u >> 16; u *= 0x7feb352du; u ^= u >> 15; u *= 0x846ca68bu; u ^= u >> 16; return float(u >> 8) / 16777216.; }
// (A scan, w by h at offset o in a flat texture: bilinear, wrapping round, clamped within rows top..top+rows.)
float sampleL(sampler2D t, int o, int w, int h, float u, float v, float top, float rows) {
  u = mod(u, float(w)); v = clamp(v, top, top + rows - 1.001);
  int x0 = min(w - 1, int(floor(u))), y0 = int(floor(v));
  float fx = u - float(x0), fy = v - float(y0);
  int x1 = x0 + 1 >= w ? 0 : x0 + 1, y1 = min(h - 1, y0 + 1);
  float a = at(t, o + y0 * w + x0), b = at(t, o + y0 * w + x1), c = at(t, o + y1 * w + x0), e = at(t, o + y1 * w + x1);
  return (a + (b - a) * fx) + ((c + (e - c) * fx) - (a + (b - a) * fx)) * fy;
}
float tileL(sampler2D t, int w, int h, float u, float v) { return sampleL(t, 0, w, h, u, mod(v, float(h)), 0., float(h)); }
`;

const YEARS = COMMON + `
uniform sampler2D uRad, uRing, uLev, uFib;
uniform int uN, uB, uOak, uFamRing, uConifer, uHasFib, uFibW, uFibH, uOakN, uLvN;
uniform int uLvO[12], uLvW[12], uLvH[12], uLvRows[12];
uniform float uX0, uY0, uH, uCx, uCy, uTurn, uRmax, uWA, uWL, uWL2, uU, uPx, uW0, uRay, uRun0, uRun1, uSparse, uInk;
uniform float uEarly, uLate, uShare, uEdge, uPores, uPoreR, uPoreEarly, uFibre, uMottle, uSharp;
uniform vec3 uInkRGB;
// (Noise laid round the ring at its own radius rr (never the point's, which shears it into slants), kx to the
// slice px along it, closing on itself: across the angle's wrap the
// far side's run blended in, so there's never a seam where the angle comes round.)
float ringN(float a, float rho, float kx, float ox, float y) {
  float w = sm((a - (TAU - 0.4)) / 0.4);
  float n0 = vnoise(a * rho * kx + ox, y);
  return w > 0. ? mix(n0, vnoise((a - TAU) * rho * kx + ox, y), w) : n0;
}
float rad(int i, int b, float f) { int k = (i + 1) * (uB + 1) + b; float p = at(uRad, k); return p + (at(uRad, k + 1) - p) * f; }
// (Each ring's facts: 0 reps, 1 off, 2 year, 3 level, 4 runR, 5 thin, 6 edge, 7 half, 8 edgeIn, 9 edgeOut, 10 tone, 11 calm.)
float R(int i, int k) { return at(uRing, i * 12 + k); }
float lineAt(int j, float dist) { return j < 0 || R(j, 6) == 0. ? 0. : clamp((R(j, 7) + 0.5 * uPx - dist) / uPx, 0., 1.) * R(j, 5); }
float rayAt(float a, float rho) {
  const float R0 = 10., GAP = 3.6;
  if (rho < R0 * 0.6) return 0.;
  int lv = max(0, int(floor(log2(rho / R0)))), N0 = max(6, int(round(TAU * R0 / GAP))), N = N0 << lv;
  float Nf = float(N), sAt = mod(a / TAU, 1.) * Nf, best = 0.;
  int k0 = int(floor(sAt));
  for (int k = k0 - 1; k <= k0 + 1; k++) {
    int bk = (k < 0 ? k + N : k) % N, bl = lv;
    for (int q = 0; q < 30; q++) { if (bl > 0 && (bk & 1) == 0) { bk >>= 1; bl--; } else break; }
    float id = float(bk) * 7.31 + float(bl) * 31.7, nb = float(N0 << bl), born = R0 * exp2(float(bl)) * (bl > 0 ? 0.7 + 0.6 * h1(id * 1.9) : 0.6);
    if (rho < born) continue;
    float hf = 0.07 + 0.16 * h1(id * 3.7) * h1(id * 3.7), home = (float(bk) + 0.5 + (h1(id) - 0.5) * 0.5) / nb * Nf;
    float d0 = abs(sAt - home); d0 = min(d0, Nf - d0);
    if ((d0 - 0.8) * TAU * rho / Nf > hf + 0.8) continue;
    float wander = sin(rho / (40. + 30. * h1(id * 2.3)) + id) * 0.45 + (vnoise(id * 0.71, rho / 9.) - 0.5) * 0.7;
    float there = ((float(bk) + 0.5 + (h1(id) - 0.5) * 0.5) / nb + wander / Nf) * Nf;
    float dd = abs(sAt - there); dd = min(dd, Nf - dd);
    float dist = dd * TAU * rho / Nf + (vnoise(rho * 0.9 + id, id * 0.13) - 0.5) * 0.35;
    if (dist > hf + 0.6) continue;
    if (vnoise(id * 0.37, rho / uRun0) < uRun1) continue;
    best = max(best, min(1., sm(1. - (dist - hf) / 0.6)) * min(1., (rho - born) / 3.));
  }
  return best;
}
float drawnInk(int i, float a, float r, float across, bool heart, float width, float dx, float dy, float rr) {
  float rho = r / uU, fi = float(i);
  // (As a relief print takes it: the latewood a bold band of ink, its inner edge never ruled but wandering
  // along the year, dry and ragged; the earlywood mostly the paper, the ink bleeding into it in blotches
  // beside the band; and the band itself starved here and there to flecks of paper.)
  float w = max(1e-3, width);
  // (Every year its own: some thin and pale, some broad and heavy, as the day it was drawn.)
  float yv = h1(fi * 1.37 + 0.71), share = (uConifer == 1 ? min(0.85, uShare * (0.6 + 0.8 * R(i, 11))) : uShare) * (0.65 + 0.7 * yv), heavy = 0.82 + 0.3 * h1(fi * 2.91 + 0.3);
  float rag = 0.5 * (ringN(a, rr, 0.07, fi * 7.1, fi * 3.3) - 0.5) + 0.3 * (ringN(a, rr, 0.3, fi * 2.3, fi * 1.7 + 5.) - 0.5) + 0.2 * (ringN(a, rr, 1.1, fi * 0.7, rho * 0.4) - 0.5);
  float start = 1. - share * (1. + 1.4 * rag), soft = max(0.035, 0.7 * uU / w);
  // (Its edge torn in short, irregular bites, as dry ink tears at the grain: never streaked along it.)
  float fray = (ringN(a, rr, 0.7, fi * 3.1, rho * 0.7) - 0.5) + 0.7 * (ringN(a, rr, 1.9, fi, rho * 1.9 + 3.) - 0.5);
  float band = sm((across - start) / soft + 0.5 + 1.6 * uU / w * fray / soft * 0.5);
  float ink = uEarly * 0.3 * (0.8 + 0.4 * across) + (uLate * 1.08 * heavy - uEarly * 0.3) * band;
  // (Bled into the earlywood beside the band: blotches, thicker nearer it.)
  float near = sm((across - (start - 0.45)) / 0.45) * (1. - band);
  // (Ink taken or not: the bleed is black specks and blots, never a grey.)
  ink += near * sm((ringN(a, rr, 0.5, fi * 4.3, rho * 0.5 + fi) - 0.74) / 0.04) * sm((ringN(a, rr, 1.6, 0., rho * 1.6 + fi) - 0.35) / 0.05);
  // (Starved inside the band: small specks of paper, as round as long, never streaks.)
  ink *= 1. - band * sm((ringN(a, rr, 1.4, fi * 9.7, rho * 1.4) - 0.74) / 0.05);
  ink *= 1. - 0.8 * band * sm((ringN(a, rr, 3.1, fi * 5.9, rho * 3.1 + 11.) - 0.8) / 0.05);
  // (The pale wood between, never bare: the grain's fine lines faintly inked along the year, broken.)
  ink = max(ink, (1. - band) * 0.9 * sm((ringN(a, rr, 0.6, fi * 2.7, rho * 1.8 + 7.) - 0.9) / 0.03) * sm((ringN(a, rr, 0.25, 3., rho * 0.25) - 0.55) / 0.1));
  if (uMottle > 0.) ink *= 1. + uMottle * (vnoise(dx / (22. * uU) + 3.1, dy / (22. * uU) + 7.7) - 0.5) * 2.;
  if (uPores > 0.) {
    float C = 3., ci = floor(rho / C), cj = floor(a * rho / C), hh = h1(ci * 7.31 + cj * 1.713 + fi * 0.37);
    if (hh < uPores * uSparse * max(0., 1. + uPoreEarly * (1. - 2. * across))) {
      float cr = (ci + 0.2 + 0.6 * h1(hh * 91.3)) * C, ca = (cj + 0.2 + 0.6 * h1(hh * 53.7)) * C, pr = uPoreR * (0.6 + 0.8 * h1(hh * 17.1));
      float dd = length(vec2(rho - cr, a * rho - ca)) / pr;
      if (dd < 1.4) ink *= min(1., max(0.05, dd - 0.4));
    }
  }
  return max(0., ink);
}
void main() {
  float x = gl_FragCoord.x - 0.5, y = uH - gl_FragCoord.y - 0.5;
  float dy = uCy - (y + uY0), dx = x + uX0 - uCx, r = sqrt(dx * dx + dy * dy);
  o = vec4(0.);
  if (r > uRmax) return;
  float a = r > 0. ? mod(atan(dy, dx) - uTurn, TAU) : mod(-uTurn, TAU);
  float fb = a / TAU * float(uB);
  int b = min(uB - 1, int(floor(fb)));
  float f = fb - float(b), outer = rad(uN - 1, b, f);
  if (uWA > 0.3 && r < outer) {
    float fade = sm((outer - r) / (3. * uWA)) * sm(r / (6. * uWA + 1.));
    r += fade * uWA * (1.4 * (vnoise(dx * uWL + 13.1, dy * uWL + 7.7) - 0.5) + 0.6 * (vnoise(dx * uWL2 + 3.3, dy * uWL2 + 41.9) - 0.5));
  }
  if (r >= outer) return;
  int lo = 0, hi = uN - 1;
  for (int s = 0; s < 24; s++) { if (lo >= hi) break; int m = (lo + hi) >> 1; if (rad(m, b, f) > r) hi = m; else lo = m + 1; }
  bool heart = r < rad(-1, b, f);
  int i = heart ? 0 : lo;
  float rin = heart ? 0. : rad(i - 1, b, f), rout = heart ? rad(-1, b, f) : rad(i, b, f);
  float across = (r - rin) / max(1e-3, rout - rin), ink;
  if (uOak == 1) {
    int year = heart ? (int(R(0, 2)) + uOakN - 1) % uOakN : int(R(i, 2));
    float runR = R(i, 4), reps = R(i, 0), fi = float(i);
    int tight = r < runR ? int(ceil(log2(runR / max(1., r)))) : 0;
    int li = min(uLvN - 1, int(R(i, 3)) + tight + (heart ? 3 : 0));
    float rows = float(uLvRows[li]), wob = (0.09 * sin(2. * a + fi * 1.7) + 0.06 * sin(3. * a + fi * 2.9 + 1.) + 0.04 * sin(5. * a + fi * 0.6)) * uW0;
    ink = sampleL(uLev, uLvO[li], uLvW[li], uLvH[li], ((a / TAU) * reps * uW0 + R(i, 1) + wob * reps * 0.15) * float(uLvW[li]) / uW0, float(year) * rows + across * rows, float(year) * rows, rows);
    if (uFamRing == 1) ink = pow(max(0., ink), 1. + 1.2 * (1. - sm((across - 0.35) / 0.45)));
    ink *= R(i, 10);
  } else ink = drawnInk(i, a, r, across, heart, rout - rin, dx, dy, (rin + rout) * 0.5 / uU) * R(i, 10);
  if (!heart && R(i, 5) > 0.) {
    ink *= 1. - 0.65 * R(i, 5);
    int jo = int(R(i, 9)), ji = int(R(i, 8));
    float cov = max(jo < 0 ? 0. : lineAt(jo, rad(jo, b, f) - r), ji < 0 ? 0. : lineAt(ji, r - rad(ji, b, f))) * (0.75 + 0.35 * vnoise(dx * 0.11 + float(i), dy * 0.11));
    if (cov > 0.) ink = max(ink, 0.95 * cov);
  }
  // (The drawn woods' rays fine and sparing, as a print shows them: the years' bands run on through them.)
  if (uRay > 0. && !heart) ink *= 1. - uRay * (uOak == 1 ? 1. : 0.55) * rayAt(a, r / uU);
  float al = floor(255. * clamp(ink, 0., 1.) + 0.5) / 255.;
  o = vec4(uInkRGB * al, al);
}
`;

const GRAIN = COMMON + `
uniform sampler2D uSrc, uFib, uSea, uField;
uniform int uHasFib, uFibW, uFibH, uHasSea, uSeaW, uSeaH, uFieldW, uFieldH;
uniform int uSx0, uSy0;
uniform float uX0, uY0, uH, uCx, uCy, uInside, uPerMm, uFine, uAlong, uSpeck, uStreak, uTooth, uLow, uPerTex, uClose, uCg, uFc, uFs, uSawK, uSx, uSy, uSaw, uSoft, uVs;
float fibAt(float t, float r) { return sampleL(uFib, 0, uFibW, uFibH, t * r * uPerMm, r * uPerMm, 0., float(uFibH)); }
float grainAt(float t, float r) { return 0.55 * vnoise(r * uFine, t * r * uAlong) + 0.45 * vnoise(r * uFine * 0.35 + 31.7, t * r * uAlong * 0.25 + 7.1); }
void main() {
  int x = int(gl_FragCoord.x), y = int(uH) - 1 - int(gl_FragCoord.y);
  // (Read from the canvas itself, as it holds it: premultiplied, so its colour taken back out.)
  vec4 s = texelFetch(uSrc, ivec2(x + uSx0, y + uSy0), 0);
  if (s.a > 0.) s.rgb /= s.a;
  float A = s.a * 255.;
  if (A < 8. || (s.r + s.g + s.b) * 255. > 380.) { o = vec4(s.rgb * s.a, s.a); return; }
  float dx = float(x) + uX0 - uCx, dy = float(y) + uY0 - uCy, r = sqrt(dx * dx + dy * dy), th = atan(dy, dx);
  float seam = max(0., (abs(th) - (PI - 0.25)) / 0.25), f;
  if (r < uInside) f = 1.;
  else if (uHasFib == 1) {
    float gr = fibAt(th, r);
    if (seam > 0.) gr += (fibAt(th - sign(th) * TAU, r) - gr) * seam * 0.5;
    f = 1. + 0.7 * (gr - 0.5);
  } else {
    float gr = grainAt(th, r);
    if (seam > 0.) gr += (grainAt(th - sign(th) * TAU, r) - gr) * seam * 0.5;
    float e = clamp((gr - 0.6) / 0.16, 0., 1.);
    f = 1.08 - 0.5 * e * e * (3. - 2. * e);
  }
  if (r >= uInside) {
    float st = vnoise(r * uSpeck + 91., th * r * uStreak + 13.);
    if (st > 0.86) f *= 1. - 0.75 * min(1., (st - 0.86) / 0.06);
  }
  float val = r < uInside ? (A / 255.) * f : pow(min(1., max(0., (A / 255.) * f)), 0.75);
  float mx = dx / uVs, my = dy / uVs;
  float t1 = 0.6 * vnoise(mx * uTooth + 5.1, my * uTooth + 9.7) + 0.4 * vnoise(mx * uTooth * 2.3 + 17.3, my * uTooth * 2.3 + 3.1);
  float saw = uSawK > 0. ? uSawK * sin(TAU * (length(vec2(mx - uSx, my - uSy)) / uSaw + 0.8 * vnoise(mx * 0.3, my * 0.3))) : 0.;
  float took = val;
  if (uHasSea == 1) {
    float u = mx * uPerTex, w = my * uPerTex;
    took = val * (0.84 + 0.2 * tileL(uSea, uSeaW, uSeaH, u + 17., w + 31.) * (0.75 + 0.25 * tileL(uField, uFieldW, uFieldH, (u * uFc - w * uFs) * 0.8, (u * uFs + w * uFc) * 0.8)));
    if (uClose > 0.) took *= 1. + uClose * 0.22 * (vnoise(mx * uCg + 3.3, my * uCg + 7.1) - 0.5);
  }
  float thr = 0.5 + (uHasSea == 1 ? 0.22 : 0.95) * (t1 - 0.5) + 0.2 * (vnoise(mx * uLow + 40., my * uLow + 11.) - 0.5) + saw;
  float e = clamp((took - thr + 0.07 * uSoft) / (0.14 * uSoft), 0., 1.);
  float al = floor(255. * e * e * (3. - 2. * e) + 0.5) / 255.;
  o = vec4(s.rgb * al, al);
}
`;

/** The grove's own noise: value noise on a lattice, hashed by the chip (its look the CPU's, not its numbers). */
const GROVE = COMMON + `
float hI(int n) { uint u = uint(n) * 747796405u + 2891336453u; u = ((u >> ((u >> 28u) + 4u)) ^ u) * 277803737u; u = (u >> 22u) ^ u; return float(u >> 8) / 16777216.; }
float vnG(float x, float y) {
  float xi = floor(x), yi = floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3. - 2. * fx), sy = fy * fy * (3. - 2. * fy);
  int n = int(xi) * 57 + int(yi) * 131;
  float a = hI(n), b = hI(n + 57), c = hI(n + 131), e = hI(n + 188);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
}
const vec3 INK = vec3(36., 28., 23.) / 255.;
vec4 over(vec4 s, vec4 d) { return s + d * (1. - s.a); }
`;

const GROUND = GROVE + `
uniform int uHillN, uLvN, uSnow;
uniform vec4 uHill[64];
uniform vec2 uSpur[64];
uniform float uLv[16], uLvMajor[16];
uniform float uH, uU, uCamX0, uCamY0, uCamS, uRs, uRx0, uRy0, uOx, uOy, uSeedMod, uWholeS, uSeed37, uTufts, uKz;
uniform vec3 uWashRGB;
float heightW(vec2 w) {
  float z = 0.;
  for (int i = 0; i < 64; i++) {
    if (i >= uHillN) break;
    vec4 H = uHill[i];
    float dx = (w.x - H.x) / H.z, dy = (w.y - H.y) / H.z;
    vec2 s = uSpur[i];
    z = max(z, exp(-(dx * dx * 1.1 + dy * dy * 1.4) * 1.7) + 0.35 * exp(-((dx - s.x) * (dx - s.x) * 4. + (dy - s.y) * (dy - s.y) * 4.)));
  }
  return z + 0.12 * (vnG(w.x / 5. + uOx, w.y / 5. + uOy) - 0.5) + 0.05 * (vnG(w.x / 1.6 + 9. + uOx, w.y / 1.6) - 0.5);
}
float heightC(vec2 p) { return heightW((p - vec2(uCamX0, uCamY0)) / uCamS); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / max(1e-6, dot(ab, ab)), 0., 1.); return length(p - a - ab * t); }
void main() {
  vec2 p = vec2(gl_FragCoord.x - 0.5, uH - gl_FragCoord.y - 0.5), rf = p * uRs + vec2(uRx0, uRy0);
  float z = heightC(p), st = 4. * uU, zx = heightC(p + vec2(st, 0.)) - z, zy = heightC(p + vec2(0., st)) - z;
  vec4 col = vec4(0.);
  // The wash: pale, pooling darker in the folds, thin on the tops, fading out at the hill's foot.
  if (z >= 0.1) {
    float slope = min(1., length(vec2(zx, zy)) / uRs * 9. * 58. / max(1., uWholeS));
    float al = 0.2 * min(1., (z - 0.1) / 0.25) * (0.6 + 0.6 * slope) * (0.7 + 0.6 * vnG(rf.x / (60. * uU) + uSeedMod, rf.y / (60. * uU)));
    al *= 0.93 + 0.14 * vnG(rf.x / (14. * uU), rf.y / (14. * uU));
    al = floor(255. * al + 0.5) / 255.;
    col = vec4(uWashRGB * al, al);
  }
  // Snow on the high ground, in winter.
  if (uSnow == 1) {
    float al = 0.75 * clamp((z - 0.35) / 0.4, 0., 1.) * (0.55 + 0.45 * vnG(rf.x / (12.5 * uU), rf.y / (12.5 * uU)));
    col = over(vec4(vec3(253., 252., 250.) / 255. * al, al), col);
  }
  // The meadow: a speck in each cell of the ground, thicker low down; looked into, tufts of a few blades.
  float G = 6. * uU, dots = 0., blades = 0.;
  ivec2 cell = ivec2(floor(rf / G));
  for (int dj = -1; dj <= 1; dj++) for (int di = -1; di <= 1; di++) {
    int i = cell.x + di, j = cell.y + dj;
    float hh = h1(float(i) * 127.1 + float(j) * 311.7 + uSeed37);
    vec2 c = ((vec2(float(i) + h1(hh * 91.7), float(j) + h1(hh * 53.3))) * G - vec2(uRx0, uRy0)) / uRs;
    if (length(p - c) > 6. * uU) continue;
    float zc = heightC(c), dense = 0.05 + 0.2 * (1. - clamp((zc - 0.05) / 0.6, 0., 1.));
    if (hh > dense) continue;
    if (uTufts > 0. && h1(hh * 17.9) < 0.7) {
      float L = uU * (0.9 + 0.9 * h1(hh * 7.7)) * min(uKz, 3.) * 0.7;
      for (int q = -1; q <= 1; q++) {
        float fq = float(q), a = -PI / 2. + fq * 0.45 + (h1(hh * 3. + fq) - 0.5) * 0.3;
        vec2 s0 = c + vec2(fq * 0.4 * uU, 0.), s1 = s0 + vec2(cos(a), sin(a)) * L * (q != 0 ? 0.8 : 1.);
        blades = max(blades, clamp(0.2 * uU + 0.5 - seg(p, s0, s1), 0., 1.));
      }
    } else {
      float r = uU * (0.25 + 0.25 * h1(hh * 29.1));
      dots = max(dots, clamp(r + 0.5 - length(p - c), 0., 1.));
    }
  }
  col = over(vec4(INK, 1.) * 0.32 * dots, col);
  col = over(vec4(INK, 1.) * 0.4 * uTufts * blades, col);
  // The contours, by hand: fine and pale, every fourth firmer, broken now and then in long stretches.
  float gz = max(1e-6, length(vec2(heightC(p + vec2(1., 0.)) - z, heightC(p + vec2(0., 1.)) - z)));
  for (int li = 0; li < 16; li++) {
    if (li >= uLvN) break;
    float L = uLv[li], major = uLvMajor[li], d = abs(z - L) / gz;
    float wd = uU * (major > 0. ? 0.7 : 0.45), cov = clamp(wd * 0.5 + 0.5 - d, 0., 1.);
    if (cov <= 0.) continue;
    if (vnG(rf.x / (110. * uU) + float(li) * 7., rf.y / (110. * uU)) < (major > 0. ? 0.1 : 0.16)) continue;
    float al = (major > 0. ? 0.3 : 0.17) * (0.45 + 0.55 * min(1., (L - 0.1) / 0.35));
    col = over(vec4(INK, 1.) * al * cov, col);
  }
  o = col;
}
`;

/** A crown's watercolour, inside its edge (a table of its radius round it, 1 about its mean). */
const WASH = GROVE + `
uniform sampler2D uE;
uniform int uN;
uniform float uH, uR, uU, uK, uBase, uWet, uM, uReach;
uniform vec3 uColRGB;
void main() {
  float px = gl_FragCoord.x - 0.5, py = uH - gl_FragCoord.y - 0.5, dx = px - uM, dy = py - uM, rho = length(vec2(dx, dy));
  o = vec4(0.);
  if (rho > uReach) return;
  float a = mod(atan(dy, dx), TAU), j = a / TAU * float(uN), f = j - floor(j);
  int j0 = int(floor(j));
  float e = (at(uE, j0) * (1. - f) + at(uE, min(uN, j0 + 1)) * f) * uR * (0.93 + 0.04 * vnG(a * 4. + uK, 1.)) - 0.6 * uU;
  if (rho > e) return;
  float inEdge = e - rho;
  // (Dried darker at its edge; granulating; thinner where the brush ran dry; a touch thinner toward the light.)
  float al = uBase * (0.82 + 0.3 * vnG((px + uK) / (9. * uU), py / (9. * uU))) * (0.9 + 0.2 * vnG(px / (1.1 * uU) + uK, py / (1.1 * uU)));
  al *= 1. + (uWet > 0. ? 0.9 : 0.55) * max(0., 1. - inEdge / (2.2 * uU));
  al *= 0.82 + 0.3 * clamp(0.5 + 0.5 * ((dx / uR) * 0.6 + (dy / uR) * 0.8), 0., 1.);
  al = floor(255. * min(0.85, al) + 0.5) / 255.;
  o = vec4(uColRGB * al, al);
}
`;

const VERT = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }
`;

export type Pass = 'years' | 'grain' | 'ground' | 'wash';
type Prog = { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> };
let canvas: HTMLCanvasElement | null = null, gl: WebGL2RenderingContext | null = null, failed = false;
const progs: Record<string, Prog> = {};
/** Flat textures kept for tables that last (the wood's scans, the noise), by the table itself. */
let kept = new WeakMap<object, WebGLTexture>();
/** Textures remade each press (the radii, the rings' facts), by name. */
const fresh: Record<string, WebGLTexture> = {};
let srcTex: WebGLTexture | null = null;

function context(): WebGL2RenderingContext | null {
  if (failed) return null;
  if (gl && !gl.isContextLost()) return gl;
  try {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
    if (!gl) { failed = true; return null; }
    // (A context lost and made again: nothing of the old one carries over.)
    kept = new WeakMap();
    for (const k in progs) delete progs[k];
    for (const k in fresh) delete fresh[k];
    srcTex = null;
    progs.years = build(gl, YEARS); progs.grain = build(gl, GRAIN); progs.ground = build(gl, GROUND); progs.wash = build(gl, WASH);
    return gl;
  } catch (e) {
    console.warn('press: no graphics chip, pressing by hand', e);
    failed = true; gl = null; return null;
  }
}
function build(g: WebGL2RenderingContext, src: string): Prog {
  const sh = (type: number, s: string) => {
    const x = g.createShader(type)!; g.shaderSource(x, s); g.compileShader(x);
    if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x) ?? 'shader');
    return x;
  };
  const p = g.createProgram()!;
  g.attachShader(p, sh(g.VERTEX_SHADER, VERT)); g.attachShader(p, sh(g.FRAGMENT_SHADER, src)); g.linkProgram(p);
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p) ?? 'link');
  return { p, loc: new Map() };
}

/** Whether the press can be done on the graphics chip (`?cpu` presses by hand, to compare). */
const BY_HAND = typeof location !== 'undefined' && new URLSearchParams(location.search).has('cpu');
export function ready(): boolean {
  return !BY_HAND && !!context();
}

/** A table as a flat float texture, 4096 wide. */
function flat(g: WebGL2RenderingContext, data: Float32Array, tex?: WebGLTexture): WebGLTexture {
  const w = 4096, h = Math.max(1, Math.ceil(data.length / w)), d = data.length === w * h ? data : new Float32Array(w * h);
  if (d !== data) d.set(data);
  const t = tex ?? g.createTexture()!;
  g.bindTexture(g.TEXTURE_2D, t);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.pixelStorei(g.UNPACK_ALIGNMENT, 4);
  g.texImage2D(g.TEXTURE_2D, 0, g.R32F, w, h, 0, g.RED, g.FLOAT, d);
  return t;
}
/** A table that lasts: uploaded once. `make` builds its data the first time. */
function keep(g: WebGL2RenderingContext, key: object, make: () => Float32Array): WebGLTexture {
  let t = kept.get(key);
  if (!t) { t = flat(g, make()); kept.set(key, t); }
  return t;
}

export type Table = { key: object; data: () => Float32Array } | { name: string; data: Float32Array };
export type Uniforms = Record<string, number | number[] | Int32Array | Float32Array>;

/**
 * Run pass `which` over a w × h picture: `ints` and `floats` its uniforms, `tables` its float tables (by
 * sampler name), `src` the canvas it works on (taken up whole; `uSx0`, `uSy0` where the picture's corner lies in it). The result is
 * left in the chip's own canvas, returned, to be drawn where it belongs (it's premultiplied, as any canvas).
 */
export type Pic = { c: HTMLCanvasElement; sx: number; sy: number; w: number; h: number };
/** Draw a pass's picture into a 2D canvas at (x, y), at its size or `dw` × `dh`. */
export function lay(g: CanvasRenderingContext2D, p: Pic, x: number, y: number, dw = p.w, dh = p.h): void {
  g.drawImage(p.c, p.sx, p.sy, p.w, p.h, x, y, dw, dh);
}
export function run(which: Pass, w: number, h: number, ints: Uniforms, floats: Uniforms, tables: Record<string, Table>, src?: HTMLCanvasElement): Pic | null {
  const g = context();
  if (!g || !canvas) return null;
  const pr = progs[which];
  // (The chip's canvas only ever grows: the picture is drawn in its lower left corner, and taken from there.)
  if (canvas.width < w || canvas.height < h) { canvas.width = Math.max(canvas.width, w); canvas.height = Math.max(canvas.height, h); }
  g.viewport(0, 0, w, h);
  g.useProgram(pr.p);
  const loc = (n: string) => { if (!pr.loc.has(n)) pr.loc.set(n, g.getUniformLocation(pr.p, n)); return pr.loc.get(n)!; };
  let unit = 0;
  for (const [name, tb] of Object.entries(tables)) {
    // (Its unit chosen first: uploading binds, and would take another's place.)
    g.activeTexture(g.TEXTURE0 + unit);
    const t = 'key' in tb ? keep(g, tb.key, tb.data) : (fresh[tb.name] = flat(g, tb.data, fresh[tb.name]));
    g.bindTexture(g.TEXTURE_2D, t); g.uniform1i(loc(name), unit); unit++;
  }
  if (src) {
    g.activeTexture(g.TEXTURE0 + unit);
    srcTex ??= g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, srcTex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    // (The canvas taken up as it is, on the chip, never read back: premultiplied, as the canvas keeps it.)
    g.pixelStorei(g.UNPACK_ALIGNMENT, 4); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, g.RGBA, g.UNSIGNED_BYTE, src);
    g.uniform1i(loc('uSrc'), unit); unit++;
  }
  for (const [n, v] of Object.entries(ints)) {
    const l = loc(n);
    if (typeof v === 'number') g.uniform1i(l, v); else g.uniform1iv(l, v instanceof Int32Array ? v : new Int32Array(v));
  }
  for (const [key, v] of Object.entries(floats)) {
    // (`name#4`, `name#2`: an array of vec4s or vec2s.)
    const [n, vec] = key.split('#'), l = loc(n);
    if (vec === '4') { g.uniform4fv(l, v as Float32Array); continue; }
    if (vec === '2') { g.uniform2fv(l, v as Float32Array); continue; }
    if (typeof v === 'number') g.uniform1f(l, v);
    else if (v.length === 3 && n.endsWith('RGB')) g.uniform3f(l, v[0], v[1], v[2]);
    else g.uniform1fv(l, v instanceof Float32Array ? v : new Float32Array(v));
  }
  g.disable(g.BLEND); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
  g.drawArrays(g.TRIANGLES, 0, 3);
  return { c: canvas, sx: 0, sy: canvas.height - h, w, h };
}
