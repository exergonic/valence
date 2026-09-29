/**
 * The extended-Hückel Hamiltonian.
 *
 * Diagonal terms are the valence-state ionization potentials of the basis
 * functions (Hᵢᵢ = the parameter table's IP, already negative). Off-diagonal
 * terms are the Wolfsberg–Helmholz approximation
 *
 *   Hᵢⱼ = ½ · K · (Hᵢᵢ + Hⱼⱼ) · Sᵢⱼ        K = 1.75
 *
 * with K fixed at Hoffmann's 1963 value, the same constant YAeHMOP carries
 * as THE_CONST — pinning it is what makes our levels comparable with the
 * oracle's. The distance-dependent variants (Ammeter–Bürgi–Thibeault–
 * Hoffmann) exist and are deliberately NOT used: they change the numbers and
 * would break the comparison for no teaching gain.
 */
import type { BasisFunction } from './assign-basis';

/** Hoffmann 1963; YAeHMOP's THE_CONST (bind.h). */
export const WOLFSBERG_HELMHOLZ_K = 1.75;

export function hamiltonianMatrix(basis: BasisFunction[], overlap: number[][]): number[][] {
  const n = basis.length;
  const H: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    H[i][i] = basis[i].hii;
    for (let j = 0; j < i; j++) {
      const hij = 0.5 * WOLFSBERG_HELMHOLZ_K * (basis[i].hii + basis[j].hii) * overlap[i][j];
      H[i][j] = hij;
      H[j][i] = hij;
    }
  }
  return H;
}
