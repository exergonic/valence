import * as THREE from 'three';
import type { Atom } from '../mol-parser';
import { getElementColor, getElementRadius } from './chem-data';

export function renderAtoms(group: THREE.Group, atoms: Atom[]) {
  for (const atom of atoms) {
    const color = getElementColor(atom.element);
    const radius = getElementRadius(atom.element);
    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.MeshPhongMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(atom.x, atom.y, atom.z);
    group.add(mesh);
  }
}
