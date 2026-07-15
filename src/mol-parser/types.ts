export interface Atom {
  index: number;
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface Bond {
  atom1Index: number;
  atom2Index: number;
  order: number;
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
}
