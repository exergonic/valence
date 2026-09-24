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
  /**
   * V2000 bond stereo flag from columns 10-12: 1 = wedge (atom 2 is drawn in
   * front of the page), 6 = hash (behind). Absent for plain bonds, and for
   * sources that don't carry it (the V3000 converter today). The first atom of
   * the bond is the narrow end — the stereocenter.
   */
  stereo?: 1 | 6;
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
}
