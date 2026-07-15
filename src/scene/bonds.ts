import * as THREE from 'three';
import type { Atom, Bond } from '../mol-parser';

export function renderBonds(group: THREE.Group, atoms: Atom[], bonds: Bond[]) {
  for (const bond of bonds) {
    const a1 = atoms[bond.atom1Index];
    const a2 = atoms[bond.atom2Index];
    if (!a1 || !a2) continue;

    const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
    const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const length = dir.length();
    dir.normalize();

    const bondRadius = 0.12;
    const geo = new THREE.CylinderGeometry(bondRadius, bondRadius, length, 8);
    const mat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    group.add(mesh);
  }
}
