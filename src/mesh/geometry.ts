/**
 * The light end of loading: shaping any geometry to a unit-sized, centred
 * object, and counting it. Kept apart from the scan loaders, which are only
 * fetched when a scan is actually opened.
 */
import type * as THREE from 'three';

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
