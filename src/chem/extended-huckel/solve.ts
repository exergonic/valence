/**
 * The extended-Hückel calculation, end to end: basis → overlaps → Hamiltonian
 * → orbitals.
 *
 * One-shot, no iteration: the secular problem Hc = εSc is built straight
 * from the connectivity and the geometry, then solved. The result is the MO
 * ladder (energies in eV, ascending) with coefficients per atomic orbital,
 * plus the matrices it came from so a caller can show or test them.
 *
 * This is the SEMIEMPIRICAL model: the numbers inherit the Alvarez
 * parameters and the Wolfsberg–Helmholz K, and nothing here is
 * self-consistent. Labels must say "extended Hückel", never imply ab initio
 * quality.
 *
 * Refusals, per the house ladder: an element outside the parameter table, or
 * a molecule the overlap matrix cannot factor (a linearly dependent basis),
 * returns null — no orbitals rather than wrong ones.
 */
import type { Molecule } from '../../mol-parser';
import { solveGeneralized } from '../../utils/eigen';
import { countValenceElectrons } from '../valence-electrons';
import { alignToPrincipalAxes, type PrincipalFrame } from './align-principal-axes';
import { assignBasis, type BasisFunction } from './assign-basis';
import { CANONICAL_TOLERANCE_EV, canonicalizeDegenerateSets } from './canonicalize-degenerate';
import { hamiltonianMatrix } from './hamiltonian';
import { overlapMatrix } from './slater-overlap';

export interface ExtendedHuckelResult {
  /** The basis, in the order the matrices are built (per atom: s, px, py, pz). */
  basis: BasisFunction[];
  /** Overlap matrix S. */
  overlap: number[][];
  /** Hamiltonian H (eV). */
  hamiltonian: number[][];
  /** Orbital energies (eV), ascending — the MO ladder. */
  energies: number[];
  /** MO coefficients: coefficients[mo][ao], in the same order as `basis`.
   *  Sign is arbitrary per MO (as any eigenvector's is). */
  coefficients: number[][];
  /** The molecule's valence electron count (formal charge included). */
  electronCount: number;
  /** The frame the calculation ran in — the basis axes are this frame's
   *  coordinate axes, so a renderer must map them back to the molecule's own
   *  coordinates (see frameDirectionToWorld). */
  frame: PrincipalFrame['axes'];
}

export function solveExtendedHuckel(molecule: Molecule): ExtendedHuckelResult | null {
  if (molecule.atoms.length === 0) return null;
  const basis = assignBasis(molecule);
  if (!basis) return null;
  const electronCount = countValenceElectrons(molecule.atoms);
  if (electronCount === null) return null;

  // Run in the molecule's principal-axis frame: the AO basis is tied to the
  // coordinate axes, so a ring that is not in a coordinate plane would give
  // π orbitals as px/py/pz mixtures (see align-principal-axes.ts).
  const frame = alignToPrincipalAxes(molecule);
  const overlap = overlapMatrix(basis, frame.atoms);
  const hamiltonian = hamiltonianMatrix(basis, overlap);
  const solved = solveGeneralized(hamiltonian, overlap);
  if (!solved) return null;

  // solveGeneralized returns eigenvectors as columns; the rest of the app
  // reads orbitals, so transpose to MO-major here, once.
  const raw = solved.values.map((_, mo) => solved.vectors.map((row) => row[mo]));
  // Degenerate sets are then rotated into their canonical (symmetry-adapted)
  // combination and given a definite sign — see canonicalize-degenerate.ts.
  const coefficients = canonicalizeDegenerateSets(basis, raw, solved.values, frame.atoms);
  return { basis, overlap, hamiltonian, energies: solved.values, coefficients, electronCount, frame: frame.axes };
}

/**
 * Closed-shell occupation numbers for a ladder of `moCount` orbitals:
 * two electrons in each of the lowest `electronCount/2`, none above.
 *
 * An odd electron count (a radical) returns null. So does an even count that
 * would put electrons in only some members of a degenerate set — O₂'s π*
 * pair holds two electrons between two orbitals, and filling one while
 * leaving the other empty draws a closed shell the molecule does not have.
 * Extended Hückel as built here has no spin, so the honest answer is to
 * refuse rather than to invent the filling. The refusal lives here, with
 * the filling, while the solver above still reports the levels.
 *
 * Pass `energies` to catch the degenerate case. Without them only the odd
 * count is visible, which is what the pure numeric checks do.
 */
export function closedShellOccupations(
  electronCount: number,
  moCount: number,
  energies?: number[],
  multiplicity = 1,
): number[] | null {
  // A molecule known to be open-shell gets no filling at all. The count alone
  // cannot tell: a triplet's electrons are even, and filling them pairwise
  // would draw the singlet the molecule is not.
  if (multiplicity > 1) return null;
  if (electronCount < 0 || electronCount > 2 * moCount) return null;
  if (electronCount % 2 !== 0) return null;
  const filled = electronCount / 2;
  if (energies) {
    let start = 0;
    while (start < energies.length) {
      let end = start + 1;
      while (end < energies.length && Math.abs(energies[end] - energies[start]) < CANONICAL_TOLERANCE_EV) end++;
      const occupiedInSet = Math.max(0, Math.min(filled, end) - start);
      if (occupiedInSet > 0 && occupiedInSet < end - start) return null;
      start = end;
    }
  }
  return Array.from({ length: moCount }, (_, i) => (i < filled ? 2 : 0));
}
