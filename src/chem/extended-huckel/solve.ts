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
import { assignBasis, type BasisFunction } from './assign-basis';
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
}

export function solveExtendedHuckel(molecule: Molecule): ExtendedHuckelResult | null {
  if (molecule.atoms.length === 0) return null;
  const basis = assignBasis(molecule);
  if (!basis) return null;
  const electronCount = countValenceElectrons(molecule.atoms);
  if (electronCount === null) return null;

  const overlap = overlapMatrix(basis, molecule.atoms);
  const hamiltonian = hamiltonianMatrix(basis, overlap);
  const solved = solveGeneralized(hamiltonian, overlap);
  if (!solved) return null;

  // solveGeneralized returns eigenvectors as columns; the rest of the app
  // reads orbitals, so transpose to MO-major here, once.
  const coefficients = solved.values.map((_, mo) => solved.vectors.map((row) => row[mo]));
  return { basis, overlap, hamiltonian, energies: solved.values, coefficients, electronCount };
}

/**
 * Closed-shell occupation numbers for a ladder of `moCount` orbitals:
 * two electrons in each of the lowest `electronCount/2`, none above.
 *
 * An odd electron count (a radical, a triplet) returns null: extended
 * Hückel as built here has no spin, so the honest answer is to refuse rather
 * than to draw a half-filled level as if it were physics. The refusal lives
 * here, with the filling, while the solver above still reports the levels.
 */
export function closedShellOccupations(electronCount: number, moCount: number): number[] | null {
  if (electronCount < 0 || electronCount > 2 * moCount) return null;
  if (electronCount % 2 !== 0) return null;
  const filled = electronCount / 2;
  return Array.from({ length: moCount }, (_, i) => (i < filled ? 2 : 0));
}
