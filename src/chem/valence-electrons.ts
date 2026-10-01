/**
 * Valence electrons by element (group number): the most electrons an atom
 * can put into bonding.
 *
 * Two readers so far: the VSEPR picture counts lone pairs with it
 * (`vsepr/hybridize.ts`), and the extended-Hückel solver counts the
 * molecule's electrons with it (`extended-huckel/solve.ts`). Distinct from
 * BOND_VALENCE (fill-hydrogens.ts, σ bonds usually formed) and the
 * neutral-valence table in kekulize-smiles.ts (aromatic ring atoms).
 *
 * The d block's counts are the group numbers, which is what the parameter
 * table's own `Nvalen` column carries (YAeHMOP's eht_parms.dat) — extracted
 * from it rather than retyped, so the electron count and the parameters cannot
 * disagree. Lu reads 3 (group 3), not the 17 the table happens to store.
 */
export const VALENCE_ELECTRONS: Record<string, number> = {
  H: 1, He: 0, Li: 1, Be: 2, B: 3,
  C: 4, N: 5, O: 6, F: 7,
  Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7,
  K: 1, Ca: 2, Ga: 3, Ge: 4, As: 5, Se: 6, Br: 7,
  Rb: 1, Sr: 2, In: 3, Sn: 4, Sb: 5, Te: 6, I: 7,
  // the d block — the elements the parameter table carries d for
  Sc: 3, Ti: 4, V: 5, Cr: 6, Mn: 7, Fe: 8, Co: 9, Ni: 10, Cu: 11,
  Y: 3, Zr: 4, Nb: 5, Mo: 6, Tc: 7, Ru: 8, Rh: 9, Pd: 10,
  Lu: 3, Ta: 5, W: 6, Re: 7, Os: 8, Ir: 9, Pt: 10, Au: 11, Hg: 12,
  // Zn and Cd are carried s+p only. The source table's Nvalen of 12 counts
  // the d¹⁰ shell, and that shell is not in the basis — it is core. Counting
  // those ten electrons fills orbitals that do not exist and drops ZnCl₂ into
  // the middle of a degenerate pair, so localization is refused. The bonding
  // valence is the s² pair.
  Zn: 2, Cd: 2,
};

/** The molecule's electron count: valence electrons minus the net formal
 *  charge (a cation has fewer). Returns null when an element is outside the
 *  table — no count, no MOs, rather than a guess. */
export function countValenceElectrons(
  atoms: Array<{ element: string; charge?: number }>,
): number | null {
  let count = 0;
  for (const atom of atoms) {
    const valence = VALENCE_ELECTRONS[atom.element];
    if (valence === undefined) return null;
    count += valence - (atom.charge ?? 0);
  }
  return count;
}
