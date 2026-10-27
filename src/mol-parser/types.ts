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
  /**
   * A radical centre: one unpaired electron, drawn as a dot (the sketcher's
   * X atom "C•", or a V2000 `M  RAD` doublet). It takes one hydrogen fewer
   * than its usual valence (fill-hydrogens.ts); the spin follows from the
   * electron count, as for any structure. Absent for every other atom.
   */
  radical?: true;
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
  /**
   * Longer than a full bond in the structure shown (bond-integrity.ts): a
   * partial bond GFN2 stretched — an unsymmetrical bromonium's long C–Br — or,
   * in a result shown only on request, one that came apart. Drawn dashed; the
   * sketch's order still stands everywhere else.
   */
  stretched?: true;
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
  /**
   * Spin multiplicity — absent in every sketch and every MOL block (V2000 has
   * no field for it), and then the lowest the electron count allows: a
   * singlet, or a doublet for an odd count. A caller that KNOWS better sets
   * it (an example whose reference calculation was a triplet, say, or the spin
   * chosen under Refine): GFN2-xTB then runs at that spin, and the
   * extended-Hückel layer refuses to fill the orbitals rather than inventing a
   * closed shell the molecule does not have.
   */
  multiplicity?: number;
  /**
   * Pairs not bonded in the sketch that the structure shown has brought to
   * bonding distance (bond-integrity.ts) — a GFN2 result shown on request
   * after it formed a bond. Drawn dashed, never bonds: the chemistry reads
   * `bonds`, which stay the sketch's.
   */
  formedContacts?: [number, number][];
}
