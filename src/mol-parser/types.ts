export interface Atom {
  element: string;
  x: number;
  y: number;
  z: number;
  /**
   * Formal charge in electrons (0 = neutral). Parsed from the V2000
   * atom-line charge code or `M  CHG` property lines (V3000 `CHG=`
   * carried through the converter). Absent (undefined) means neutral —
   * most atoms, and every atom from sources that don't encode charge.
   */
  charge?: number;
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
