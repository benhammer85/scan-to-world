/**
 * Load a scan exported from Scaniverse / KIRI Engine / RealityScan (GLB, glTF,
 * OBJ or PLY) and turn it into one clean, centred, unit-sized BufferGeometry.
 *
 * Deliberately no "recognition": whatever the player scanned is the terrain.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

export interface LoadedScan {
  geometry: THREE.BufferGeometry;
  /** Colour texture from the scan, if it had one. */
  map: THREE.Texture | null;
  name: string;
}

export async function loadScanFile(file: File): Promise<LoadedScan> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  let root: THREE.Object3D;

  switch (ext) {
    case 'glb':
    case 'gltf': {
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      root = gltf.scene;
      break;
    }
    case 'obj':
      root = new OBJLoader().parse(new TextDecoder().decode(buffer));
      break;
    case 'ply': {
      const geom = new PLYLoader().parse(buffer);
      root = new THREE.Mesh(geom);
      break;
    }
    default:
      throw new Error(`Unsupported file type ".${ext}". Export GLB, OBJ or PLY from your scanning app.`);
  }
  return { ...collectMeshes(root), name: file.name };
}

/** Flatten every mesh under `root` into a single geometry in root space. */
function collectMeshes(root: THREE.Object3D): Omit<LoadedScan, 'name'> {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    parts.push(g);
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    if (!map && mat?.map) map = mat.map;
  });
  if (parts.length === 0) throw new Error('No mesh found in file.');

  // mergeGeometries needs identical attribute sets; keep only what we use.
  const keep = ['position', 'uv', 'color'].filter((name) => parts.every((p) => p.hasAttribute(name)));
  const cleaned = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    return g;
  });
  const merged = cleaned.length === 1 ? cleaned[0] : mergeGeometries(cleaned, false);
  if (!merged) throw new Error('Could not merge meshes in file.');
  return { geometry: normaliseGeometry(mergeVertices(merged)), map };
}

/** Centre on the bounding-sphere centre and scale to radius 1. */
export function normaliseGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingSphere();
  const s = geometry.boundingSphere!;
  geometry.translate(-s.center.x, -s.center.y, -s.center.z);
  geometry.scale(1 / s.radius, 1 / s.radius, 1 / s.radius);
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}

export function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

/**
 * Decimate towards `targetTris` (meshoptimizer, UV-seam aware). Handles a few
 * hundred thousand triangles in the browser; for multi-million-triangle raw scans,
 * decimate in Blender or the scan app's export settings first.
 */
export async function decimate(geometry: THREE.BufferGeometry, targetTris: number): Promise<THREE.BufferGeometry> {
  const tris = triangleCount(geometry);
  if (tris <= targetTris) return geometry;
  const g = geometry.clone();
  if (g.hasAttribute('normal')) g.deleteAttribute('normal');
  // SimplifyModifier keeps (1 - count / vertexCount) of the index buffer.
  const removeVerts = Math.floor(g.attributes.position.count * (1 - targetTris / tris));
  const simplified = await new SimplifyModifier().modify(g, removeVerts);
  simplified.computeVertexNormals();
  return simplified;
}
