import * as THREE from 'three';
import type { Atom } from '../mol-parser';
import { getElementColor, getVisualRadius, getVdwRadius } from './chem-data';
import type { DisplaySettings } from './setup';

export function renderAtoms(group: THREE.Group, atoms: Atom[], display?: DisplaySettings) {
  const scale = display?.atomScale ?? 1;
  const spaceFilling = display?.spaceFilling ?? false;
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const color = getElementColor(atom.element);
    const radius = spaceFilling
      ? getVdwRadius(atom.element) * 0.5  // scale down slightly so molecules don't look huge
      : getVisualRadius(atom.element) * scale;
    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = new THREE.MeshPhongMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(atom.x, atom.y, atom.z);
    mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'atom' };
    group.add(mesh);
  }
}
