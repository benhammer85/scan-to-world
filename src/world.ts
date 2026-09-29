/**
 * TerrainWorld ties the pipeline together for one scanned object:
 *   geometry -> welded topology -> heightfield (+ touch edits) -> contours -> plotter lines
 */
import * as THREE from 'three';
import { buildTopology, type Topology } from './mesh/topology';
import { extractHeights, type HeightOptions } from './terrain/heightfield';
import { extractContours } from './terrain/contours';
import { PlotterLines, defaultPlotterStyle, type RevealMode } from './render/plotterLines';
import { TerrainEdits, applyDisplacement, type BrushOptions } from './interact/sculpt';
import { Settlements, type TapResult } from './life/settlements';
import { buildingMarks, harbourMarks, ruinMarks, squareFrames, stallMarks, streetMarks, sunkenMarks } from './life/buildingMarks';
import { findWater, seaFor, snowLines, streamLines, waterLines, type Sea, type Water } from './nature/water';
import { ferryRoute, sailingBoats } from './life/buildingMarks';

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

const PAPER = new THREE.Color('#efe7d6');
const WATER_INK = '#2a5680';
const WATER_SHALLOW = '#9cc3e0';
const SNOW_TINT = '#f6f7f9';
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
  readonly lines = new PlotterLines();
  readonly settlements: Settlements;
  /** The town has its own pen, so building never waits on the terrain's plot. */
  readonly townLines = new PlotterLines({ ...defaultPlotterStyle, ink: '#15151c', inkHigh: '#15151c', indexEvery: 1 });
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
    this.sailing = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#15151c', depthWrite: false, transparent: true }));
    this.sailing.renderOrder = 2;
    this.group.add(this.mesh, this.waterLines, this.snowEdge, this.lines.object, this.townLines.object, this.sailing);

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
    this.drawWater(false);
  }

  setPace(pace: number): void {
    this.lines.pace = pace;
    this.townLines.pace = pace;
  }

  /** "People here." The ground decides whether and where. */
  tap(worldPoint: THREE.Vector3): TapResult {
    const local = this.mesh.worldToLocal(worldPoint.clone());
    const r = this.settlements.tap([local.x, local.y, local.z]);
    if (r.kind !== 'refused') {
      this.townDirty = true;
      this.townFrom = local;
    }
    return r;
  }

  /** Time passes as the world turns. */
  advance(days: number): void {
    if (this.settlements.advance(days) > 0) this.townDirty = true;
  }

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
    if (this.settlements?.ferries.length) {
      this.sailing.geometry.dispose();
      this.sailing.geometry = segments(sailingBoats(this.topo, this.settlements.ferries, this.seconds));
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
      } else if (now - this.lastTownBuild > 150) {
        this.rebuildTown('live');
      }
    }
  }

  private rebuildTown(mode: RevealMode): void {
    this.lastTownBuild = performance.now();
    const st = this.settlements;
    const { buildings, streets, towns } = st;
    const frames = squareFrames(this.topo, streets, towns);
    // A market is under water if its hall is.
    const drownedHall = new Set(towns.filter((t) => st.buildings.find((b) => b.vertex === t.centre)?.state === 'drowned').map((t) => t.id));
    const marks = [
      ...streetMarks(this.topo, streets, buildings, frames, st),
      ...buildingMarks(this.topo, this.heights, buildings),
      ...ruinMarks(this.topo, this.heights, buildings),
      ...stallMarks(st.stalls.filter((x) => !drownedHall.has(x.town)), frames, this.topo),
      ...harbourMarks(this.topo, st.harbours, (h) => st.boatsAt(h)),
    ];
    const from = this.townFrom ?? this.lastTownCentre();
    this.townLines.setLines(marks, mode, from ?? undefined);
    if (mode === 'ink') this.townFrom = null;
  }

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
      if (changed) this.townDirty = true; // the water may have taken, or given back, what was built
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

  private drawWater(changed: boolean): void {
    // The water, and whatever it has taken: drowned houses and sunken
    // streets show through it in the water's own ink, like a drowned village.
    const st = this.settlements;
    const lines = [
      ...waterLines(this.topo, this.water),
      ...streamLines(this.topo, this.water),
      ...(st ? st.ferries.flatMap((f) => ferryRoute(this.topo, f.route)) : []),
      ...(st ? buildingMarks(this.topo, this.heights, st.buildings, 'drowned') : []),
      ...(st ? sunkenMarks(this.topo, st.streets, st, squareFrames(this.topo, st.streets, st.towns)) : []),
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
      for (let i = 0; i < arr.length; i += 3) arr.set([PAPER.r, PAPER.g, PAPER.b], i);
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
    // Water tints the ground under it, deeper bluer.
    if (this.water) {
      // Mostly the water's own colour: a light tint over orange reads as mud.
      const { remap } = this.topo, c = new THREE.Color(), blue = new THREE.Color();
      const shallow = new THREE.Color(WATER_SHALLOW), deep = new THREE.Color(WATER_DEEP);
      for (let i = 0; i < remap.length; i++) {
        const v = remap[i];
        if (!this.water.wet[v] || this.water.ice[v]) continue;
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
  }
}

function hypsometric(h: number, out: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp(h, 0, 1.2);
  if (t < 0.4) return out.copy(LOW).lerp(MID, t / 0.4);
  if (t < 0.8) return out.copy(MID).lerp(HIGH, (t - 0.4) / 0.4);
  return out.copy(HIGH).lerp(SNOW, Math.min(1, (t - 0.8) / 0.3));
}
