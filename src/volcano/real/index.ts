/**
 * Real terrain: a world's own heights, from NASA's maps (see scripts/terrain.mjs), on a 1° grid, read
 * at any point of the world. The world's +z faces us at the start and +y is its north, so longitude 0
 * on the equator (the Moon's near side, facing Earth) is what we see first.
 */
import moon from './moon';

// (Mars's map is made too, real/mars.ts, but not used yet: left out, it isn't carried in the game.)
const MAPS = { moon };
export type RealName = keyof typeof MAPS;
const decoded = new Map<RealName, Int16Array>();

function heightsOf(name: RealName): Int16Array {
  let h = decoded.get(name);
  if (!h) {
    const s = atob(MAPS[name].data), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    h = new Int16Array(b.buffer);
    decoded.set(name, h);
  }
  return h;
}

/** Where a point of the world is, as latitude and longitude (degrees, east positive). */
export function latLon(x: number, y: number, z: number): [number, number] {
  return [(Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI, (Math.atan2(x, z) * 180) / Math.PI];
}

/** The point of the world at a latitude and longitude (degrees). */
export function pointAt(lat: number, lon: number): { x: number; y: number; z: number } {
  const a = (lat * Math.PI) / 180, o = (lon * Math.PI) / 180;
  return { x: Math.cos(a) * Math.sin(o), y: Math.sin(a), z: Math.cos(a) * Math.cos(o) };
}

/** The real height (km) at a point of the world (a unit vector), between the map's samples. */
export function realHeight(name: RealName, x: number, y: number, z: number): number {
  const { w, h } = MAPS[name], d = heightsOf(name);
  const [lat, lon] = latLon(x, y, z);
  const fx = (((lon + 360) % 360) / 360) * w - 0.5, fy = ((90 - lat) / 180) * h - 0.5;
  const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(h - 1, Math.floor(fy))), y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
  const xa = (x0 + w) % w, xb = (x0 + 1 + w) % w;
  const at = (xx: number, yy: number) => d[yy * w + xx];
  return ((at(xa, y0) * (1 - tx) + at(xb, y0) * tx) * (1 - ty) + (at(xa, y1) * (1 - tx) + at(xb, y1) * tx) * ty) / 1000;
}
