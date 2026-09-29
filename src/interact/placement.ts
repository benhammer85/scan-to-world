/**
 * Cheap building layer: no remeshing. Objects are pinned to a triangle of the
 * render mesh by barycentric coordinates and oriented to the interpolated normal,
 * so when the player reshapes the terrain, placed things ride along with it.
 */
import * as THREE from 'three';

export type PropKind = 'tree' | 'house' | 'flag';

interface Anchor {
  object: THREE.Object3D;
  corners: [number, number, number];
  bary: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Placement {
  readonly group = new THREE.Group();
  readonly ghost: THREE.Object3D;
  private anchors: Anchor[] = [];
  private tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), n: new THREE.Vector3() };
  kind: PropKind = 'tree';

  constructor(private mesh: THREE.Mesh, private scale = 0.06) {
    this.ghost = new THREE.Group();
    this.ghost.visible = false;
    this.group.add(this.ghost);
    this.setKind('tree');
  }

  setKind(kind: PropKind): void {
    this.kind = kind;
    this.ghost.clear();
    const g = makeProp(kind, this.scale);
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m) { const c = m.clone(); c.transparent = true; c.opacity = 0.45; (o as THREE.Mesh).material = c; }
    });
    this.ghost.add(g);
  }

  /** Move the ghost preview to a raycast hit (or hide it). */
  hover(hit: THREE.Intersection | null): void {
    if (!hit?.face) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    const corners: [number, number, number] = [hit.face.a, hit.face.b, hit.face.c];
    this.orient(this.ghost, corners, this.barycentric(hit.point, corners));
  }

  place(hit: THREE.Intersection): void {
    if (!hit.face) return;
    const object = makeProp(this.kind, this.scale);
    object.rotateY(Math.random() * Math.PI * 2);
    const holder = new THREE.Group();
    holder.add(object);
    const corners: [number, number, number] = [hit.face.a, hit.face.b, hit.face.c];
    const anchor = { object: holder, corners, bary: this.barycentric(hit.point, corners) };
    this.anchors.push(anchor);
    this.group.add(holder);
    this.orient(holder, corners, anchor.bary);
  }

  /** Re-seat all placed objects after the surface has moved. */
  refresh(): void {
    for (const a of this.anchors) this.orient(a.object, a.corners, a.bary);
  }

  clear(): void {
    for (const a of this.anchors) this.group.remove(a.object);
    this.anchors = [];
  }

  private barycentric(point: THREE.Vector3, [ia, ib, ic]: [number, number, number]): THREE.Vector3 {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const { a, b, c } = this.tmp;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const local = this.mesh.worldToLocal(point.clone());
    // Degenerate triangles return null; fall back to the first corner.
    return THREE.Triangle.getBarycoord(local, a, b, c, new THREE.Vector3()) ?? new THREE.Vector3(1, 0, 0);
  }

  private orient(obj: THREE.Object3D, [ia, ib, ic]: [number, number, number], bary: THREE.Vector3): void {
    const geom = this.mesh.geometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const nrm = geom.attributes.normal as THREE.BufferAttribute;
    const { a, b, c, n } = this.tmp;
    a.fromBufferAttribute(pos, ia).multiplyScalar(bary.x);
    b.fromBufferAttribute(pos, ib).multiplyScalar(bary.y);
    c.fromBufferAttribute(pos, ic).multiplyScalar(bary.z);
    obj.position.copy(a).add(b).add(c);
    n.fromBufferAttribute(nrm, ia).multiplyScalar(bary.x);
    a.fromBufferAttribute(nrm, ib).multiplyScalar(bary.y);
    b.fromBufferAttribute(nrm, ic).multiplyScalar(bary.z);
    n.add(a).add(b).normalize();
    obj.quaternion.setFromUnitVectors(UP, n);
  }
}

function makeProp(kind: PropKind, s: number): THREE.Object3D {
  const g = new THREE.Group();
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.08, s * 0.1, s * 0.35, 6), mat('#6b4a2b'));
    trunk.position.y = s * 0.175;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(s * 0.32, s * 0.8, 7), mat('#2f6b3a'));
    crown.position.y = s * 0.7;
    g.add(trunk, crown);
  } else if (kind === 'house') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.36, s * 0.42), mat('#efe6d2'));
    body.position.y = s * 0.18;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(s * 0.42, s * 0.3, 4), mat('#a8442a'));
    roof.position.y = s * 0.51;
    roof.rotation.y = Math.PI / 4;
    g.add(body, roof);
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.02, s * 0.02, s, 5), mat('#333'));
    pole.position.y = s * 0.5;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(s * 0.35, s * 0.22, s * 0.01), mat('#d6352b'));
    flag.position.set(s * 0.18, s * 0.86, 0);
    g.add(pole, flag);
  }
  return g;
}
