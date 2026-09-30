/**
 * The drafting room: works out the lines and signs (drafting.ts), in a worker away from the
 * page's own thread (drafts.worker.ts), so the world turns smoothly while it works. It is sent the
 * finer surface once, then heights (and life) whenever the page wants them redrawn, and sends back
 * what to draw.
 */
import { surfaceOf, shape, draftLines, draftLife, pack, packedBuffers, type Surface } from './drafting';
import { FineSurface } from './fine';
import type { Handler } from './offthread';

let surface: Surface | null = null, fine: FineSurface | null = null, nearest: Uint32Array | null = null;
let relief = 0.32;
/** How far apart the land's contours are, in height: wider on a world of low relief, or its every ripple is a line. */
let interval = 0.035;

type Ask =
  | { init: { triangles: Uint32Array; basePositions: Float32Array; relief: number; parts: FineSurface['parts']; nearest: Uint32Array; interval?: number } }
  | { lines: { id: number; heights: Float32Array } }
  | { life: { id: number; heights: Float32Array; life: Float32Array; wear: Float32Array; kind: Int8Array; density: [number, number][] } };
// (For life, `life`, `wear` and `kind` are the simulation's own, a value to each coarse vertex: they're carried onto the finer surface here.)

/** Answer one ask (in the worker, or on the page if no worker could be started). */
export const handleDrafts: Handler = (message, post) => {
  const ask = message as Ask;
  if ('init' in ask) {
    surface = surfaceOf(ask.init.triangles, ask.init.basePositions); relief = ask.init.relief; interval = ask.init.interval ?? interval;
    fine = FineSurface.fromParts(ask.init.parts); nearest = ask.init.nearest;
    return;
  }
  if (!surface) return;
  if ('lines' in ask) {
    shape(surface, ask.lines.heights, relief);
    const lines = draftLines(surface, ask.lines.heights, interval);
    const land = pack(lines.land), sea = pack(lines.sea);
    post({ lines: { id: ask.lines.id, land, sea } }, [...packedBuffers(land), ...packedBuffers(sea)]);
    return;
  }
  if ('life' in ask) {
    const a = ask.life, n = surface.vertexCount;
    shape(surface, a.heights, relief);
    const life = new Float32Array(n), wear = new Float32Array(n), kind = new Int8Array(n);
    fine!.carry(a.life, life);
    fine!.carry(a.wear, wear);
    for (let f = 0; f < n; f++) kind[f] = a.kind[nearest![f]];
    const drafted = draftLife(surface, life, wear, a.heights, kind, a.density);
    post({ life: { id: a.id, ...drafted } }, [...drafted.kinds.map((k) => k.buffer as ArrayBuffer), drafted.foam.buffer as ArrayBuffer]);
  }
};
