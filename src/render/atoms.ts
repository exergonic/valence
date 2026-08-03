import * as THREE from 'three';
import type { Atom } from '../mol-parser';
import { getElementColor, getVisualRadius } from './chem-data';
import type { DisplaySettings } from './setup';

export function renderAtoms(group: THREE.Group, atoms: Atom[], display?: DisplaySettings) {
  const scale = display?.atomScale ?? 1;
  for (const atom of atoms) {
    const color = getElementColor(atom.element);
    const radius = getVisualRadius(atom.element) * scale;
    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.MeshPhongMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(atom.x, atom.y, atom.z);
    group.add(mesh);
  }
}
