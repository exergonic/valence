import type { Molecule } from '../mol-parser';

export interface PlacedAtom {
  index: number;
  element: string;
  position: [number, number, number];
}

export function place3D(molecule: Molecule): PlacedAtom[] {
  return molecule.atoms.map((atom, i) => ({
    index: atom.index,
    element: atom.element,
    position: [atom.x, atom.y, atom.z],
  }));
}
