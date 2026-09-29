/**
 * TerrainWorld ties the pipeline together for one scanned object:
 *   geometry -> welded topology -> heightfield (+ touch edits) -> contours -> plotter lines
 */
import * as THREE from 'three';
import { buildTopology, type Topology } from './mesh/topology';
import { extractHeights, type HeightOptions } from './terrain/heightfield';
import { extractContours } from './terrain/contours';
import { PlotterLines, type RevealMode } from './render/plotterLines';
import { TerrainEdits, applyDisplacement, type BrushOptions } from './interact/sculpt';
import { Placement } from './interact/placement';

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
  readonly placement: Placement;

  private baseHeights: Float32Array;
  readonly heights: Float32Array;
  private scanColors: Float32Array | null;
  private material: THREE.MeshStandardMaterial;
  private dirty = false;
  private geometryDirty = false;
  private lastContourBuild = 0;
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
    this.placement = new Placement(this.mesh);
    this.mesh.add(this.placement.group);
    this.group.add(this.mesh, this.lines.object);

    this.baseHeights = extractHeights(this.topo, settings.height);
    this.heights = new Float32Array(this.topo.vertexCount);
    this.recomputeHeights();
    this.applySurface();
    // Unlike the map app, whose reveal skips the country, the terrain here is
    // the player's own object and the thing they came to see, so it is plotted.
    this.rebuildContours('plot', penFrom);
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
  update(dt: number, now: number, diffusion: { rate: number; fade: number }, camera?: THREE.Camera): void {
    this.lines.update(dt, camera);
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
      this.placement.refresh();
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
  }

  private recomputeHeights(): void {
    const e = this.edits.field;
    for (let v = 0; v < this.heights.length; v++) this.heights[v] = this.baseHeights[v] + e[v];
  }

  private rebuildContours(mode: RevealMode, from?: THREE.Vector3): void {
    this.lastContourBuild = performance.now();
    const lines = extractContours(this.topo, this.heights, {
      interval: 1 / this.settings.bands,
      lift: 0.002,
    });
    this.lastLineCount = lines.length;
    this.lines.setLines(lines, mode, from);
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
  }
}

function hypsometric(h: number, out: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp(h, 0, 1.2);
  if (t < 0.4) return out.copy(LOW).lerp(MID, t / 0.4);
  if (t < 0.8) return out.copy(MID).lerp(HIGH, (t - 0.4) / 0.4);
  return out.copy(HIGH).lerp(SNOW, Math.min(1, (t - 0.8) / 0.3));
}
