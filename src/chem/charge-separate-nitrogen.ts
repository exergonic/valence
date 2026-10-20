/**
 * Five bonds to a neutral nitrogen, made a Lewis structure.
 *
 * JSME draws nitro as CN(=O)=O — and rewrites C[N+](=O)[O-] into that form
 * whatever it is given, sketched, pasted or read (measured 2026-10-20) — so
 * nitro, nitrate and N-oxides arrive with five bonds on an uncharged N.
 * Nitrogen has four valence orbitals, so that is not a Lewis structure, and
 * the rest of Valence noticed: PubChem's nitro carries N⁺ and O⁻, so the
 * fetch guard's per-atom charge check refused every nitro compound, and the
 * Lewis-structure orbitals refused the N for having more bonds than orbitals.
 *
 * The charge-separated form is the one a textbook writes: one N=O becomes
 * N⁺–O⁻. Only a neutral N whose bond orders sum to 5 is touched, and only a
 * terminal, neutral, doubly bonded O is made the O⁻ — one per nitrogen, so
 * nitro keeps its other N=O (its resonance partner is the same structure).
 * Azide and diazo, which JSME may draw with five bonds to a central N, have
 * no terminal O and are left as drawn.
 */
import type { Molecule } from '../mol-parser';

export function chargeSeparateNitrogen(molecule: Molecule): Molecule {
  const atoms = molecule.atoms.map((atom) => ({ ...atom }));
  const bonds = molecule.bonds.map((bond) => ({ ...bond }));
  const orderSum = new Array<number>(atoms.length).fill(0);
  const degree = new Array<number>(atoms.length).fill(0);
  for (const bond of bonds) {
    for (const a of [bond.atom1Index, bond.atom2Index]) {
      orderSum[a] += bond.order;
      degree[a] += 1;
    }
  }
  atoms.forEach((nitrogen, n) => {
    if (nitrogen.element !== 'N' || (nitrogen.charge ?? 0) !== 0 || orderSum[n] !== 5) return;
    const toOxygen = bonds.find((bond) => {
      if (bond.order !== 2 || (bond.atom1Index !== n && bond.atom2Index !== n)) return false;
      const o = bond.atom1Index === n ? bond.atom2Index : bond.atom1Index;
      return atoms[o].element === 'O' && degree[o] === 1 && (atoms[o].charge ?? 0) === 0;
    });
    if (!toOxygen) return;
    const o = toOxygen.atom1Index === n ? toOxygen.atom2Index : toOxygen.atom1Index;
    toOxygen.order = 1;
    nitrogen.charge = 1;
    atoms[o].charge = -1;
  });
  return { ...molecule, atoms, bonds };
}
