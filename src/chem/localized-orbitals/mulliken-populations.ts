/**
 * Mulliken populations — the atomic weights Pipek–Mezey maximizes and the
 * classifier reads.
 *
 * The extended-Hückel basis is NOT orthonormal (two Slater orbitals on
 * different atoms overlap), so every weight here carries the overlap matrix:
 *
 *   n_A(φ) = Σ_{μ∈A} Σ_ν c_μ S_μν c_ν                     (atom A)
 *   n_AB(φ) = Σ_{μ∈A} Σ_{ν∈B} c_μ S_μν c_ν                (the A–B bond)
 *
 * The row-wise convention matters: every off-diagonal overlap is charged to
 * the atom owning the ROW, which is what makes Σ_A n_A(φ) = 1 for a
 * normalized orbital. That identity is the check the tests pin, and it is
 * what lets the populations double as the σ/π test's weights.
 *
 * This is the same quantity `avo_ibo` computes, except that its IAO basis is
 * orthonormal and its populations therefore drop S. An equivalent rewrite
 * here would be to Löwdin-orthogonalize first — but then "atom A" would mean
 * a mixture of atoms, so the overlap-weighted form above is the honest one.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from '../extended-huckel/assign-basis';

/** cᵗ S, applied to the coefficients in place of a full matrix product per call. */
function overlapTimes(overlap: number[][], coefficients: number[]): number[] {
  const n = overlap.length;
  const out = new Array(n).fill(0);
  for (let m = 0; m < n; m++) {
    const c = coefficients[m];
    if (c === 0) continue;
    const row = overlap[m];
    for (let k = 0; k < n; k++) out[k] += c * row[k];
  }
  return out;
}

/** Per-AO Mulliken weight c_μ (S c)_μ — the contribution of one basis function. */
export function aoWeights(coefficients: number[], overlap: number[][]): number[] {
  const sc = overlapTimes(overlap, coefficients);
  return coefficients.map((c, m) => c * sc[m]);
}

/** n_A(φ) for every atom, in atom order. Sums to 1 for a normalized orbital. */
export function atomicPopulations(
  coefficients: number[],
  overlap: number[][],
  basis: BasisFunction[],
  atomCount: number,
): number[] {
  const n = new Array(atomCount).fill(0);
  const weights = aoWeights(coefficients, overlap);
  for (let m = 0; m < basis.length; m++) n[basis[m].atomIndex] += weights[m];
  return n;
}

/**
 * n_AB(φ) for every bond, in bond order — the orbital's share of the A–B
 * overlap population. Positive means the two atoms are in phase (bonding),
 * negative out of phase (antibonding); that sign is the bonding/antibonding
 * test the classifier uses, and it needs no energies.
 */
export function bondPopulations(
  coefficients: number[],
  overlap: number[][],
  basis: BasisFunction[],
  bonds: Molecule['bonds'],
): number[] {
  const atomOf = basis.map((b) => b.atomIndex);
  const out = new Array(bonds.length).fill(0);
  bonds.forEach((bond, k) => {
    let sum = 0;
    for (let m = 0; m < basis.length; m++) {
      if (atomOf[m] !== bond.atom1Index) continue;
      const cm = coefficients[m];
      if (cm === 0) continue;
      const row = overlap[m];
      for (let n = 0; n < basis.length; n++) {
        if (atomOf[n] !== bond.atom2Index) continue;
        sum += cm * row[n] * coefficients[n];
      }
    }
    out[k] = sum;
  });
  return out;
}

/** The cross population n_AB(i,j) — the overlap-weighted analogue of
 *  `avo_ibo`'s Σ q_ij, used by the Pipek–Mezey Jacobi angle. */
export function crossPopulations(
  coefficientsI: number[],
  coefficientsJ: number[],
  overlap: number[][],
  basis: BasisFunction[],
  atomCount: number,
): number[] {
  const out = new Array(atomCount).fill(0);
  const n = overlap.length;
  const sJ = new Array(n).fill(0);
  for (let m = 0; m < n; m++) {
    const c = coefficientsJ[m];
    if (c === 0) continue;
    const row = overlap[m];
    for (let k = 0; k < n; k++) sJ[k] += c * row[k];
  }
  for (let m = 0; m < basis.length; m++) out[basis[m].atomIndex] += coefficientsI[m] * sJ[m];
  return out;
}
