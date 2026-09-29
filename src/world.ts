/**
 * TerrainWorld ties the pipeline together for one scanned object:
 *   geometry -> welded topology -> heightfield (+ touch edits) -> contours -> plotter lines
 */
import * as THREE from 'three';
import { buildTopology, type Topology } from './mesh/topology';
import { extractHeights, type HeightOptions } from './terrain/heightfield';
import { extractContours } from './terrain/contours';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from './render/plotterLines';
import type { Polyline } from './terrain/contours';
import { TerrainEdits, applyDisplacement, type BrushOptions } from './interact/sculpt';
import { Settlements, type TapResult } from './life/settlements';
import { Countryside, type CountryTap } from './life/country';
import { ESTATE, Landmarks, landmarkMarks } from './life/landmarks';
import { Stipple } from './render/stipple';
import { glowDots, glowField } from './life/development';
import { countryMarks, isoLines, maturity, seasonColour, springFlood, turningMarks, winter, type Turning, type Wash } from './life/countryMarks';
import { blockMarks, buildingMarks, harbourMarks, lookOf, squareFrames, sunkenMarks, wingMarks, wayLine } from './life/buildingMarks';
import { findWater, seaFor, snowLines, streamLines, waterLines, type Sea, type Water } from './nature/water';
import { cableMarks, crossingFrames, crossingMarks, ferryRoute, movers, railMarks } from './life/buildingMarks';

export type SurfaceStyle = 'scan' | 'paper' | 'elevation';

export interface WorldSettings {
  height: HeightOptions;
  /** Number of contour bands across the normalised [0, 1] height range. */
  bands: number;
  surface: SurfaceStyle;
  /** Physically displace the mesh with edits (vs. only redrawing contours). */
  displace: boolean;
  /** How far one unit of edit height moves the surface (object radius = 1). */
  displaceScale: number;
}

const PAPER = new THREE.Color('#ecdfc2');
/** How much of the scan's own colour shows through the paper. */
const PAPER_TINT = 0.22;
const WATER_INK = '#2a5680';
const WATER_SHALLOW = '#9cc3e0';
const SNOW_TINT = '#f6f7f9';
const TOWN_INK = '#2e2118';
const LAND_TRAFFIC = new Set(['train', 'car', 'cart', 'barrier', 'cabin']);

const SNOW_INK = '#9aaebf';
const ICE_TINT = '#dcebf4';

/** Polylines as one LineSegments geometry. */
function segments(lines: { points: Float32Array; closed: boolean }[]): THREE.BufferGeometry {
  let count = 0;
  for (const l of lines) count += l.points.length / 3 - 1 + (l.closed ? 1 : 0);
  const pos = new Float32Array(Math.max(0, count) * 6);
  let o = 0;
  for (const l of lines) {
    const n = l.points.length / 3, segs = n - 1 + (l.closed ? 1 : 0);
    for (let i = 0; i < segs; i++) {
      const a = i, b = (i + 1) % n;
      pos.set(l.points.subarray(a * 3, a * 3 + 3), o);
      pos.set(l.points.subarray(b * 3, b * 3 + 3), o + 3);
      o += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}
const WATER_DEEP = '#4d82b3';

function sameWet(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
const LOW = new THREE.Color('#6f8f5a');
const MID = new THREE.Color('#d8c48e');
const HIGH = new THREE.Color('#a8674a');
const SNOW = new THREE.Color('#f7f3ea');

export class TerrainWorld {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly topo: Topology;
  readonly edits: TerrainEdits;
  /**
   * Relief is drawn faint and brown, the way survey maps draw it, so the
   * ground sits behind what is built on it. In the same black as the streets
   * it read as one tangle, and a street could not be told from a contour.
   */
  readonly lines = new PlotterLines({ ...defaultPlotterStyle, ink: '#b48d64', inkHigh: '#8d5f3b', pencil: '#c9b79d', alpha: 0.45, indexAlpha: 0.8 });
  readonly settlements: Settlements;
  readonly country: Countryside;
  readonly landmarks: Landmarks;
  /** The town has its own pen, so building never waits on the terrain's plot. */
  readonly townLines = new PlotterLines({ ...defaultPlotterStyle, ink: TOWN_INK, inkHigh: TOWN_INK, indexEvery: 1 });
  private townDirty = false;
  private lastTownBuild = 0;
  private townFrom: THREE.Vector3 | null = null;

  private baseHeights: Float32Array;
  readonly heights: Float32Array;
  private scanColors: Float32Array | null;
  private material: THREE.MeshStandardMaterial;
  private dirty = false;
  private geometryDirty = false;
  private lastContourBuild = 0;
  water: Water;
  /** Set once from the ground as scanned, so the sea stays put while the ground is worked. */
  private sea: Sea = { level: -Infinity, anchor: 0 };
  private waterLines: THREE.LineSegments;
  private snowEdge: THREE.LineSegments;
  /** Boats out on the ferries: not plotted, they move. */
  private sailing: THREE.LineSegments;
  /** Level crossings, worked out with the town; and how long each vehicle has waited at their gates. */
  private crossings: ReturnType<typeof crossingFrames> = [];
  private delays = new Map<string, number>();
  private seconds = 0;
  /** 0..1: water fades in when it arrives or changes, since no pen draws it. */
  private waterFade = 1;
  private lastLineCount = 0;
  /** Where the current stroke began (local space); the pen starts there. */
  private strokeFrom: THREE.Vector3 | null = null;
  /** A stroke has ended; ink its response once the edits stop moving. */
  private inkWanted = false;
  /** The next rebuild is a settings change: everything is simply there. */
  private settleNext = false;

  constructor(
    geometry: THREE.BufferGeometry,
    private map: THREE.Texture | null,
    public settings: WorldSettings,
    penFrom?: THREE.Vector3,
  ) {
    const pos = geometry.attributes.position;
    this.topo = buildTopology(pos.array as ArrayLike<number>, geometry.index?.array ?? null);
    this.edits = new TerrainEdits(this.topo);

    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    const color = geometry.getAttribute('color');
    this.scanColors = color ? Float32Array.from(color.array as ArrayLike<number>) : null;
    if (!color) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    // Scans can come with RGBA colours; normalise to RGB.
    if (color && color.itemSize !== 3) {
      const rgb = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) rgb.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3);
      this.scanColors = rgb;
      geometry.setAttribute('color', new THREE.BufferAttribute(rgb.slice(), 3));
    }

    this.material = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.waterLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: WATER_INK, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.waterLines.renderOrder = 1;
    this.snowEdge = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: SNOW_INK, transparent: true, opacity: 0.9, depthWrite: false }));
    this.sailing = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: TOWN_INK, depthWrite: false, transparent: true }));
    this.sailing.renderOrder = 2;
    this.group.add(this.mesh, this.wash, this.seasonal, this.meadow, this.waterLines, this.snowEdge, this.lines.object, this.townLines.object, this.sailing, this.stipple.object);

    this.baseHeights = extractHeights(this.topo, settings.height);
    this.heights = new Float32Array(this.topo.vertexCount);
    this.recomputeHeights();
    this.sea = seaFor(this.topo, this.baseHeights);
    this.water = findWater(this.topo, this.heights, this.sea);
    this.applySurface();
    // Unlike the map app, whose reveal skips the country, the terrain here is
    // the player's own object and the thing they came to see, so it is plotted.
    this.rebuildContours('plot', penFrom);
    this.settlements = new Settlements(this.topo, this.heights);
    this.settlements.setWater(this.water.wet, this.water.depth, this.water.stream, this.water.snow);
    this.country = new Countryside(this.topo, this.settlements, this.heights);
    this.landmarks = new Landmarks(this.topo, this.settlements, this.heights, this.country);
    this.drawWater(false);
  }

  setPace(pace: number): void {
    this.lines.pace = pace;
    this.townLines.pace = pace;
  }

  /**
   * A tap is a seed, and the ground says what of. On a town: it grows
   * there. On a field: it goes back to wood. On a wood: felled. On ground
   * too steep to build: a wood planted. Near a town: a farm. Anywhere else
   * open: people, a new town.
   */
  tap(worldPoint: THREE.Vector3): TapResult | { kind: CountryTap | 'estate'; vertex: number } {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    const at = [local.x, local.y, local.z];
    let r: TapResult | { kind: CountryTap | 'estate'; vertex: number } | null = null;
    // On a farm of a grown town: it becomes a country house.
    const farm = this.settlements.farmAt(at, 0.035);
    if (farm && farm.estate === undefined && this.settlements.size(farm.town) >= ESTATE.at) {
      farm.estate = this.settlements.day;
      r = { kind: 'estate', vertex: farm.vertex };
    }
    if (!r && !this.settlements.onTown(at)) {
      const v = this.settlements.nearest(at), kind = this.country.tap(v);
      if (kind) r = { kind, vertex: v };
    }
    r ??= this.settlements.tap(at);
    if (r.kind !== 'refused') {
      this.country.update(true);
      this.townDirty = true;
      this.townFrom = local;
    }
    return r;
  }

  /**
   * Passengers arrive by the railway at the station by vertex `v`: they settle
   * there, founding a town if there is none, growing it if there is.
   */
  welcome(v: number): TapResult {
    const p = this.topo.positions;
    const r = this.settlements.tap([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]);
    if (r.kind !== 'refused') { this.country.update(true); this.townDirty = true; }
    return r;
  }

  /** Where vertex `v` is now, and which way is up there, in the scene. */
  surfaceAt(v: number): { at: THREE.Vector3; up: THREE.Vector3 } {
    const p = this.topo.positions, n = this.topo.normals;
    this.mesh.updateWorldMatrix(true, false);
    return {
      at: this.mesh.localToWorld(new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])),
      up: new THREE.Vector3(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]).transformDirection(this.mesh.matrixWorld),
    };
  }

  /** The vertex whose ground faces most nearly `dir` (a direction in the scene). */
  facing(dir: THREE.Vector3): number {
    const n = this.topo.normals, m = new THREE.Matrix3().getNormalMatrix(this.mesh.matrixWorld);
    const local = dir.clone().applyMatrix3(m.clone().invert()).normalize();
    let best = 0, bd = -Infinity;
    for (let v = 0; v < this.topo.vertexCount; v++) {
      const d = n[v * 3] * local.x + n[v * 3 + 1] * local.y + n[v * 3 + 2] * local.z;
      if (d > bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Time passes as the world turns. */
  advance(days: number): void {
    if (this.settlements.advance(days) > 0) this.townDirty = true;
    if (this.country.update()) this.townDirty = true;
    if (this.landmarks.update()) this.townDirty = true;
    // Turning also ages what is there: paths wear in, huts become houses,
    // gardens are built round, fields are ploughed, woods grow. When
    // anything has, the pen goes over it.
    const look = this.settlements.lookSignature() + this.country.signature() * 1e-3 + this.landmarks.signature() * 1e-7;
    if (look !== this.lastLook) { this.lastLook = look; this.townDirty = true; }
  }
  private lastLook = 0;

  get triangleCount(): number {
    return this.topo.triangles.length / 3;
  }

  get lineCount(): number {
    return this.lastLineCount;
  }

  /** Re-run heightfield extraction (mode / smoothing changed). Keeps edits. */
  setHeightOptions(opts: HeightOptions): void {
    this.settings.height = opts;
    this.baseHeights = extractHeights(this.topo, opts);
    this.sea = seaFor(this.topo, this.baseHeights);
    this.recomputeHeights();
    this.applySurface();
    this.rebuildContours('settle');
  }

  setBands(bands: number): void {
    this.settings.bands = bands;
    this.rebuildContours('settle');
  }

  setSurface(surface: SurfaceStyle): void {
    this.settings.surface = surface;
    this.applySurface();
  }

  setDisplace(on: boolean): void {
    this.settings.displace = on;
    this.settleNext = true;
    this.markEdited();
  }

  /** Plot the whole thing again, the pen starting at `from` (world space). */
  replay(from?: THREE.Vector3): void {
    this.rebuildContours('plot', from && this.mesh.worldToLocal(from.clone()));
  }

  brush(worldPoint: THREE.Vector3, opts: BrushOptions, dt: number): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    if (!this.strokeFrom) this.strokeFrom = local.clone();
    this.inkWanted = false;
    if (this.edits.brush([local.x, local.y, local.z], opts, dt)) this.markEdited();
  }

  // ---- hold and pull: the gesture vocabulary (see interact/gestures.ts)
  private held: { local: THREE.Vector3; pulled: number } | null = null;

  /** A finger took hold of the ground here (world space). */
  grab(worldPoint: THREE.Vector3): void {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    this.held = { local, pulled: 0 };
    this.strokeFrom = local.clone();
    this.inkWanted = false;
  }

  /** Press into the held ground: `amount` height units, negative-going. */
  pressIn(amount: number, radius: number): void {
    if (!this.held) return;
    this.brushLocal(this.held.local, { radius, strength: -amount, falloff: 'gaussian' }, 1);
  }

  /** Pull the held ground up to `height` units above where the pull began.
   *  Elastic while held: bring the finger back and it comes back down. */
  pullTo(height: number, radius: number): void {
    if (!this.held) return;
    const delta = height - this.held.pulled;
    if (Math.abs(delta) < 1e-4) return;
    this.held.pulled = height;
    this.brushLocal(this.held.local, { radius, strength: delta, falloff: 'gaussian' }, 1);
  }

  letGo(): void {
    this.held = null;
    this.endStroke();
  }

  private brushLocal(local: THREE.Vector3, opts: BrushOptions, dt: number): void {
    if (this.edits.brush([local.x, local.y, local.z], opts, dt)) this.markEdited();
  }

  /** The finger lifted: once the ground stops moving, the pen inks what changed. */
  endStroke(): void {
    if (this.strokeFrom) this.inkWanted = true;
  }

  resetEdits(): void {
    this.edits.clear();
    this.settleNext = true;
    this.markEdited();
  }

  private markEdited(): void {
    this.dirty = true;
    this.geometryDirty = true;
  }

  /** Per-frame update. `diffusion` controls how diffuse-brush edits spread and fade. */
  update(dt: number, now: number, diffusion: { rate: number; fade: number }, camera?: THREE.Camera, calm = true): void {
    this.lines.update(dt, camera);
    this.townLines.update(dt, camera);
    // Boats sail in real time: they are life on the water, not building.
    this.seconds += dt;
    const st = this.settlements;
    if (st && (this.turning.length || st.ferries.length || st.harbours.length || st.rails.length || st.cables.length || st.streets.some((x) => x.kind === 'road'))) {
      this.sailing.geometry.dispose();
      // No traffic on land: from this high up nobody could see a cart or a train, only the ways they
      // wear. Boats on the water stay, a mark of life where there are no other marks.
      const afloat = movers(this.topo, st, this.seconds, dt, this.delays, this.crossings).filter((m) => !LAND_TRAFFIC.has((m as { kind?: string }).kind ?? ''));
      this.sailing.geometry = segments([...afloat, ...turningMarks(this.turning, this.seconds)]);
    }
    // The ploughland's wash goes round the year as the world turns.
    if (st && Math.abs(st.day - this.seasonDay) > 0.02 && this.seasonal.userData.wash) {
      this.seasonDay = st.day;
      setWash(this.seasonal, this.seasonal.userData.wash, seasonColour(st.day));
      if (this.meadow.userData.wash) setWash(this.meadow, this.meadow.userData.wash, floodTint(st.day));
      // And the weather: snow down the hills in winter, the lakes frozen.
      this.applySurface();
      // The map matures: its water lined more finely as the world ages.
      const m = Math.floor(maturity(st.day) * 4);
      if (m !== this.lining) { this.lining = m; this.drawWater(false); }
    }
    if (this.waterFade < 1) {
      this.waterFade = Math.min(1, this.waterFade + dt / 0.9);
      (this.waterLines.material as THREE.LineBasicMaterial).opacity = 0.85 * this.waterFade;
    }
    const moving = this.edits.relax(dt, diffusion.rate, diffusion.fade);
    if (moving) this.markEdited();

    if (this.geometryDirty) {
      this.geometryDirty = false;
      this.recomputeHeights();
      if (this.settings.displace) {
        applyDisplacement(this.topo, this.edits.field, this.settings.displaceScale);
      } else {
        this.topo.positions.set(this.topo.basePositions);
        this.topo.normals.set(this.topo.baseNormals);
      }
      this.syncRenderGeometry();
      this.shapeVersion++;
      if (this.settings.surface === 'elevation') this.applySurface();
      if (this.settlements?.buildings.length) this.townDirty = true; // they ride the ground
    }

    // Contour extraction is the expensive bit: throttle it while the player drags.
    if (this.dirty && now - this.lastContourBuild > 70) {
      this.dirty = false;
      this.rebuildContours(this.settleNext ? 'settle' : 'live');
      this.settleNext = false;
    }

    // Arrives on release, the way the map app's presses do, and only once
    // diffusing edits have settled: inking a line that is still moving would
    // leave it pencil again on the next rebuild.
    if (this.inkWanted && !this.dirty && !moving) {
      this.inkWanted = false;
      this.rebuildContours('ink', this.strokeFrom ?? undefined);
      this.strokeFrom = null;
    }

    // New buildings are pencilled in while the world is turning or being
    // worked, and inked once it's calm, from where the town was touched.
    if (this.townDirty) {
      if (calm) {
        this.townDirty = false;
        this.rebuildTown('ink');
      } else if (now - this.lastTownBuild > Math.max(150, this.townBuildMs * 4)) {
        // Redrawn while the world turns, but never more than a fifth of the time: a big town takes a while.
        this.rebuildTown('live');
      }
    }
  }

  private townBuildMs = 0;
  private rebuildTown(mode: RevealMode): void {
    const started = performance.now();
    this.lastTownBuild = started;
    this.buildTown(mode);
    this.townBuildMs = performance.now() - started;
  }

  /**
   * The town, the country and the landmarks are drawn as three layers, each
   * kept until something it is drawn from changes: a new house redraws the
   * town, not every hedge and summit on the object. Before, one house redrew
   * everything, 120-200 ms in a grown world.
   */
  private layers = new Map<string, { key: string; value: unknown }>();
  private layer<T>(name: string, key: string, make: () => T): T {
    const had = this.layers.get(name);
    if (had && had.key === key) return had.value as T;
    const value = make();
    this.layers.set(name, { key, value });
    return value;
  }
  /** Counted up whenever the ground's shape or its water changes: everything drawn on it moves. */
  private shapeVersion = 0;
  private waterVersion = 0;

  private buildTown(mode: RevealMode): void {
    const st = this.settlements, c = this.country, lm = this.landmarks;
    const detail = mode === 'ink';
    const ground = `${this.shapeVersion}|${this.waterVersion}`;
    const town = this.layer('town', `${ground}|${st.buildings.length}|${st.streets.length}|${st.stalls.length}|${st.harbours.length}|${st.harbours.filter((h) => h.silted !== undefined).length}|${st.rails.length}|${st.cables.length}|${st.blocks.length}|${st.lookSignature()}`, () => {
      const { buildings, streets, towns } = st;
      const look = lookOf(st);
      const frames = squareFrames(this.topo, streets, towns, look);
      const crossings = crossingFrames(this.topo, st);
      // Blocks built round take in the houses that stood on them: the ways are drawn round what is left.
      const blocks = blockMarks(this.topo, st.blocks, (k) => st.blockStage(k), buildings, streets, look);
      const shown = buildings.filter((b) => !blocks.absorbed.has(b.vertex));
      // Development as light seen from very high up: no buildings, no outlines, only a stipple
      // whose density is the light the houses give (see life/development.ts, STYLE.md). The roads
      // are threads of that light, not lines; only the water's edge and the rails are drawn.
      const { wet, stream } = st.ground;
      const dots = glowDots(this.topo, glowField(this.topo, buildings, streets, (b) => st.houseStage(b)), (v) => !wet?.[v] && !stream?.[v]);
      const lines = [
        ...harbourMarks(this.topo, st.harbours, (h) => st.mooredAt(h)),
        ...railMarks(this.topo, st.rails, crossings.map((x) => x.at)),
        ...crossingMarks(crossings),
        ...cableMarks(this.topo, st.cables),
      ];
      return { look, frames, shown, crossings, lines, dots };
    });
    this.crossings = town.crossings;

    // The country follows the town only loosely: redrawn every few houses, not each one.
    const m = maturity(st.day);
    const country = this.layer('country', `${ground}|${detail}|${Math.floor(st.buildings.length / 5)}|${Math.floor(st.streets.length / 4)}|${c.signature()}|${c.claims.size}|${c.planted.size}|${c.felled.size}|${c.remembered.size}|${c.commons.size}|${c.drained.size}|${Math.floor(m * 10)}`,
      () => countryMarks(this.topo, st, c, detail));
    const land = this.layer('land', `${ground}|${detail}|${lm.signature()}|${st.towns.map((t) => Math.floor(st.size(t.id) / 8)).join(',')}|${Math.floor(c.claims.size / 3)}|${st.harbours.length}|${st.harbours.filter((h) => h.silted !== undefined).length}|${st.farms.filter((f) => f.estate !== undefined).length}|${Math.floor(m * 4)}|${Math.floor(st.lookSignature() / 50)}`,
      () => landmarkMarks(this.topo, this.heights, st, c, lm, town.frames, town.look, (x) => wayLine(this.topo, x, town.shown, town.frames, town.look), detail, true));
    this.turning = [...country.turning, ...land.turning];
    // Washes are set again only when their layer was drawn again.
    const washKey = `${this.layers.get('country')!.key}|${this.layers.get('land')!.key}`;
    if (washKey !== this.washKey) {
      this.washKey = washKey;
      setWash(this.wash, { positions: [...country.wash.positions, ...land.wash.positions], colours: [...country.wash.colours, ...land.wash.colours] });
      setWash(this.seasonal, country.seasonal, seasonColour(st.day));
      setWash(this.meadow, country.meadow, floodTint(st.day));
      this.seasonDay = st.day;
    }
    if (town.dots !== this.dotted) { this.dotted = town.dots; this.stipple.set(town.dots); }
    // A landmark's buildings are part of the light, not drawn: only its lines on the ground are.
    const marks = [...country.lines, ...land.lines.filter((x) => !x.fill), ...town.lines];
    const from = this.townFrom ?? this.lastTownCentre();
    this.townLines.setLines(marks, mode, from ?? undefined);
    if (mode === 'ink') this.townFrom = null;
  }
  private washKey = '';
  readonly stipple = new Stipple(TOWN_INK);
  private dotted: number[] | null = null;

  /** Hand colour on the fields and woods; the ploughland's on its own, tinted by the season. */
  private wash = washMesh(0);
  private seasonal = washMesh(0);
  private meadow = washMesh(0);
  private turning: Turning[] = [];
  private lining = -1;
  private seasonDay = 0;

  private lastTownCentre(): THREE.Vector3 | null {
    const b = this.settlements.buildings.at(-1);
    if (!b) return null;
    const c = this.settlements.towns[b.town].centre * 3, p = this.topo.positions;
    return new THREE.Vector3(p[c], p[c + 1], p[c + 2]);
  }

  private recomputeHeights(): void {
    const e = this.edits.field;
    for (let v = 0; v < this.heights.length; v++) this.heights[v] = this.baseHeights[v] + e[v];
  }

  private rebuildContours(mode: RevealMode, from?: THREE.Vector3): void {
    this.lastContourBuild = performance.now();
    // The ground changed, so the water may have: hollows fill, dug ground floods.
    if (this.settlements) {
      const before = this.water;
      this.water = findWater(this.topo, this.heights, this.sea);
      const changed = !sameWet(before.wet, this.water.wet) || !sameWet(before.stream, this.water.stream) || !sameWet(before.snow, this.water.snow);
      this.settlements.setWater(this.water.wet, this.water.depth, this.water.stream, this.water.snow);
      this.drawWater(changed);
      if (changed) { this.townDirty = true; this.waterVersion++; } // the water may have taken, or given back, what was built
      if (this.settings.surface !== 'elevation') this.applySurface();
    }
    const lines = extractContours(this.topo, this.heights, {
      interval: 1 / this.settings.bands,
      lift: 0.002,
      mask: this.water?.wet, // under water, only the depth lines are drawn
    });
    this.lastLineCount = lines.length;
    this.lines.setLines(lines, mode, from);
  }

  /**
   * Water-lining: as the map matures, the engraver lines the water along its
   * shores, the lines further apart the further out, as old charts do. Only
   * along surveyed shores.
   */
  private waterLining(): Polyline[] {
    const st = this.settlements;
    if (!st || !this.country) return [];
    const m = maturity(st.day);
    const count = Math.floor(m * 4);
    if (!count) return [];
    const near = this.country.nearPeople(), cellOf = this.country.land.cellOf, wet = this.water.wet, t = this.topo.triangles;
    const toShore = distanceToShore(this.topo, wet);
    const tris: number[] = [];
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i], b = t[i + 1], c = t[i + 2];
      if (!wet[a] || !wet[b] || !wet[c]) continue;
      if (!near.has(cellOf[a]) && !near.has(cellOf[b]) && !near.has(cellOf[c])) continue;
      if (Math.min(toShore[a], toShore[b], toShore[c]) > 0.05) continue;
      tris.push(i);
    }
    const out: Polyline[] = [];
    // Each line its own spacing: ever further out.
    for (const at of [0.006, 0.013, 0.022, 0.034].slice(0, count)) out.push(...isoLines(this.topo, tris, (v) => toShore[v] - at + 1, 1, 0.0022));
    return out;
  }

  private drawWater(changed: boolean): void {
    // The water, and whatever it has taken: drowned houses and sunken
    // streets show through it in the water's own ink, like a drowned village.
    const st = this.settlements;
    const lines = [
      ...waterLines(this.topo, this.water),
      ...streamLines(this.topo, this.water),
      ...(st ? st.ferries.flatMap((f) => ferryRoute(this.topo, f.route)) : []),
      ...(st ? buildingMarks(this.topo, this.heights, st.buildings, 'drowned') : []),
      ...(st ? wingMarks(this.topo, this.heights, st.buildings, 'drowned') : []),
      ...(st ? sunkenMarks(this.topo, st.streets, st, squareFrames(this.topo, st.streets, st.towns)) : []),
      ...this.waterLining(),
    ];
    this.waterLines.geometry.dispose();
    this.waterLines.geometry = segments(lines);
    this.snowEdge.geometry.dispose();
    this.snowEdge.geometry = segments(snowLines(this.topo, this.water, this.heights, this.sea.snowline ?? Infinity));
    if (changed) this.waterFade = 0;
  }

  /** Copy welded positions/normals back to every (possibly seam-split) render vertex. */
  private syncRenderGeometry(): void {
    const geom = this.mesh.geometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const nrm = geom.attributes.normal as THREE.BufferAttribute;
    const { remap, positions, normals } = this.topo;
    for (let i = 0; i < remap.length; i++) {
      const w = remap[i] * 3;
      pos.setXYZ(i, positions[w], positions[w + 1], positions[w + 2]);
      nrm.setXYZ(i, normals[w], normals[w + 1], normals[w + 2]);
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
  }

  private applySurface(): void {
    const geom = this.mesh.geometry;
    const color = geom.attributes.color as THREE.BufferAttribute;
    const arr = color.array as Float32Array;
    const style = this.settings.surface;
    const useMap = style === 'scan' && !!this.map;

    if (style === 'scan' && this.scanColors) {
      arr.set(this.scanColors);
    } else if (style === 'elevation') {
      const c = new THREE.Color();
      const { remap } = this.topo;
      for (let i = 0; i < remap.length; i++) {
        hypsometric(this.heights[remap[i]], c);
        arr.set([c.r, c.g, c.b], i * 3);
      }
    } else {
      // Old map paper, with a little of the object's own colour in it, so an orange is still warm.
      const own = this.scanColors;
      for (let i = 0; i < arr.length; i += 3) {
        if (!own) { arr.set([PAPER.r, PAPER.g, PAPER.b], i); continue; }
        arr.set([PAPER.r * (1 - PAPER_TINT) + own[i] * PAPER_TINT, PAPER.g * (1 - PAPER_TINT) + own[i + 1] * PAPER_TINT, PAPER.b * (1 - PAPER_TINT) + own[i + 2] * PAPER_TINT], i);
      }
    }
    // With a texture, vertex colours stay white so they don't tint the map.
    if (useMap && !this.scanColors) arr.fill(1);
    // Snow whitens the high ground; ice is a pale, flat blue.
    if (this.water) {
      const { remap } = this.topo, c = new THREE.Color(), white = new THREE.Color(SNOW_TINT), iceTint = new THREE.Color(ICE_TINT);
      for (let i = 0; i < remap.length; i++) {
        const v = remap[i];
        if (this.water.snow[v]) c.setRGB(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).lerp(white, 0.85);
        else if (this.water.ice[v]) c.copy(iceTint);
        else continue;
        arr.set([c.r, c.g, c.b], i * 3);
      }
    }
    // The winter's snow comes down the hills below the snowline, and the lakes freeze.
    const cold = this.settlements ? winter(this.settlements.day) : 0;
    if (this.water && cold > 0.05 && this.sea.snowline !== undefined) {
      const { remap } = this.topo, c = new THREE.Color(), white = new THREE.Color(SNOW_TINT), iceTint = new THREE.Color(ICE_TINT);
      const reach = WEATHER.snowDrop * cold, line = this.sea.snowline;
      for (let i = 0; i < remap.length; i++) {
        const v = remap[i], h = this.heights[v];
        if (this.water.snow[v]) continue;
        if (this.water.wet[v] && !this.water.sea[v] && cold > WEATHER.freeze) { arr.set([iceTint.r, iceTint.g, iceTint.b], i * 3); continue; }
        if (this.water.wet[v] || h < line - reach) continue;
        const k = 0.75 * Math.min(1, (h - (line - reach)) / (reach * 0.4 + 1e-6));
        c.setRGB(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).lerp(white, k);
        arr.set([c.r, c.g, c.b], i * 3);
      }
    }
    // Water tints the ground under it, deeper bluer.
    if (this.water) {
      // Mostly the water's own colour: a light tint over orange reads as mud.
      const { remap } = this.topo, c = new THREE.Color(), blue = new THREE.Color();
      const shallow = new THREE.Color(WATER_SHALLOW), deep = new THREE.Color(WATER_DEEP);
      for (let i = 0; i < remap.length; i++) {
        const v = remap[i];
        if (!this.water.wet[v] || this.water.ice[v]) continue;
        if (!this.water.sea[v] && cold > WEATHER.freeze) continue; // frozen for the winter
        blue.copy(shallow).lerp(deep, Math.min(1, this.water.depth[v] / 0.25));
        c.setRGB(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).lerp(blue, 0.88);
        arr.set([c.r, c.g, c.b], i * 3);
      }
    }
    color.needsUpdate = true;

    const wantMap = useMap ? this.map : null;
    if (this.material.map !== wantMap) {
      this.material.map = wantMap;
      this.material.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.lines.dispose();
    this.townLines.dispose();
    this.stipple.dispose();
  }
}

function hypsometric(h: number, out: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp(h, 0, 1.2);
  if (t < 0.4) return out.copy(LOW).lerp(MID, t / 0.4);
  if (t < 0.8) return out.copy(MID).lerp(HIGH, (t - 0.4) / 0.4);
  return out.copy(HIGH).lerp(SNOW, Math.min(1, (t - 0.8) / 0.3));
}

/** The two triangles of a rectangle mark (drawn with each side split in four). */
/**
 * A mesh for washes. Watercolour darkens the paper it's laid on, never
 * lightens it, so washes multiply what's under them: a tint strength of
 * nought leaves the ground as it was, which is how their edges go soft.
 * (Laid over as paint, the pale tints came out as fog on the orange.)
 */
function washMesh(order: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  m.renderOrder = order;
  return m;
}

/** A wash's colours, as what multiplies the ground: its tint at its strength, and white (no change) where it fades out. */
function setWash(mesh: THREE.Mesh, w: Wash, tint?: [number, number, number]): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(w.positions), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(multiplied(w.colours, tint)), 3));
  mesh.geometry.dispose();
  mesh.geometry = g;
  mesh.userData.wash = w;
}

function multiplied(rgba: number[], tint?: [number, number, number]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    for (let k = 0; k < 3; k++) out.push(1 - a * (1 - rgba[i + k] * (tint ? tint[k] : 1)));
  }
  return out;
}

/** The weather through the year: how far down the hills the winter snow comes, and how cold before the lakes freeze. */
const WEATHER = { snowDrop: 0.12, freeze: 0.55 };

/** The wet meadows in spring: flooded, a little bluer. */
function floodTint(day: number): [number, number, number] {
  const f = springFlood(day);
  return [1 - 0.28 * f, 1 - 0.12 * f, 1];
}

/** For each wet vertex, how far it is to the shore over the water (0 on dry ground). */
function distanceToShore(topo: Topology, wet: Uint8Array): Float32Array {
  const n = topo.vertexCount, p = topo.positions, out = new Float32Array(n).fill(Infinity);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (!wet[v]) { out[v] = 0; queue.push(v); }
  // Relaxed breadth first: the reach wanted is a few edges, so this settles quickly.
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    if (out[u] > 0.06) continue;
    for (let k = topo.nbrOffsets[u]; k < topo.nbrOffsets[u + 1]; k++) {
      const w = topo.nbrList[k];
      if (!wet[w]) continue;
      const nd = out[u] + Math.hypot(p[u * 3] - p[w * 3], p[u * 3 + 1] - p[w * 3 + 1], p[u * 3 + 2] - p[w * 3 + 2]);
      if (nd < out[w]) { out[w] = nd; queue.push(w); }
    }
  }
  return out;
}
