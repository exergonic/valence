/**
 * Valence electrons by element (group number): the most electrons an atom
 * can put into bonding.
 *
 * Two readers so far: the VSEPR picture counts lone pairs with it
 * (`vsepr/hybridize.ts`), and the extended-Hückel solver counts the
 * molecule's electrons with it (`extended-huckel/solve.ts`). Distinct from
 * BOND_VALENCE (fill-hydrogens.ts, σ bonds usually formed) and the
 * neutral-valence table in kekulize-smiles.ts (aromatic ring atoms).
 */
export const VALENCE_ELECTRONS: Record<string, number> = {
  H: 1, He: 0, Li: 1, Be: 2, B: 3,
  C: 4, N: 5, O: 6, F: 7,
  Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7,
  K: 1, Ca: 2, Ga: 3, Ge: 4, As: 5, Se: 6, Br: 7,
  Rb: 1, Sr: 2, In: 3, Sn: 4, Sb: 5, Te: 6, I: 7,
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
