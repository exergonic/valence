/**
 * A transition-metal centre's d-electron count, read from the sketch:
 * dⁿ with n = group − oxidation state.
 *
 * The oxidation state is what the metal keeps when every bond to it is
 * broken with the pair going to the ligand. A sketch can draw a complex two
 * ways, and both must give the same answer:
 * - ionic: Ni²⁺ bonded to four Cl⁻. Each Cl⁻ is already at its full valence
 *   (none) before the bond to Ni, so that bond is the chloride's donated pair
 *   — dative — and leaves the metal's charge alone: +2.
 * - covalent: Ni²⁻ bonded to four neutral Cl. Each bond is one of the
 *   chlorine's own, so heterolysis takes an electron from the metal per bond:
 *   −2 + 4 = +2.
 * A ligand atom is dative when its bonds, counting the one to the metal,
 * exceed its normal valence for its charge (NH₃'s N, cyanide's C⁻, CO's C⁻).
 */
import type { Molecule } from '../mol-parser';
import { VALENCE_ELECTRONS } from './valence-electrons';

// The d block whose group number VALENCE_ELECTRONS carries. Zn and Cd are
// left out: d¹⁰ always, and that table counts only their s².
const D_BLOCK = new Set([
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd',
  'Lu', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au',
]);

/** Bonds a main-group atom forms with its octet, given its charge: N 3, N⁺ 4,
 *  C⁻ 3, Cl 1, Cl⁻ 0, B 3. */
function normalValence(element: string, charge: number): number | null {
  const v = VALENCE_ELECTRONS[element];
  if (v === undefined) return null;
  const electrons = v - charge;
  if (element === 'H') return 2 - electrons;
  return electrons <= 4 ? electrons : 8 - electrons;
}

/** dⁿ of atom `metal`, or null when it is not a d-block metal or a ligand
 *  atom is outside the table. */
export function dElectronCount(molecule: Molecule, metal: number): number | null {
  const { atoms, bonds } = molecule;
  if (!D_BLOCK.has(atoms[metal].element)) return null;
  const bondOrderSum = atoms.map(() => 0);
  for (const b of bonds) {
    bondOrderSum[b.atom1Index] += b.order;
    bondOrderSum[b.atom2Index] += b.order;
  }
  let oxidationState = atoms[metal].charge ?? 0;
  for (const b of bonds) {
    if (b.atom1Index !== metal && b.atom2Index !== metal) continue;
    const ligand = b.atom1Index === metal ? b.atom2Index : b.atom1Index;
    if (D_BLOCK.has(atoms[ligand].element)) continue; // a metal–metal bond is shared evenly
    const normal = normalValence(atoms[ligand].element, atoms[ligand].charge ?? 0);
    if (normal === null) return null;
    if (bondOrderSum[ligand] <= normal) oxidationState += b.order; // the ligand's own bond
  }
  return VALENCE_ELECTRONS[atoms[metal].element] - oxidationState;
}
