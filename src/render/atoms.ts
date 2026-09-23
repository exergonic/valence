import * as THREE from 'three';
import type { Atom } from '../mol-parser';
import { getElementColor, getVisualRadius, getVdwRadius } from './chem-data';
import type { DisplaySettings } from './setup';
import { atomEnvMap, atomLayer, makeAtomMaterial } from './atom-styles';

export function renderAtoms(group: THREE.Group, atoms: Atom[], display?: DisplaySettings, renderer?: THREE.WebGLRenderer) {
  const scale = display?.atomScale ?? 1;
  const spaceFilling = display?.spaceFilling ?? false;
  const style = display?.atomStyle ?? 'classic';
  const env = style === 'classic' || !renderer ? null : atomEnvMap(renderer);
  const layer = atomLayer(style);
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const color = getElementColor(atom.element);
    const radius = spaceFilling
      ? getVdwRadius(atom.element)
      : getVisualRadius(atom.element) * scale;
    const geo = new THREE.SphereGeometry(radius, 48, 48);
    const mat = makeAtomMaterial(style, color, env);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(layer);
    mesh.position.set(atom.x, atom.y, atom.z);
    mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'atom' };
    group.add(mesh);
  }
}
