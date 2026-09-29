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
 * oracle's.
 *
 * Deliberate choice: this is the PLAIN form, not the energy-weighted variant
 * that YAeHMOP and WebMO use by default. That variant (Ammeter–Bürgi–
 * Thibeault–Hoffmann, JACS 100, 3686 (1978); Whangbo–Hoffmann, JCP 68, 5498
 * (1978)) replaces the constant K with
 *
 *   Hᵢⱼ = ½·Sᵢⱼ·(Hᵢᵢ + Hⱼⱼ)·[K + Δ² + Δ⁶(1−K)],  Δ = (Hᵢᵢ − Hⱼⱼ)/(Hᵢᵢ + Hⱼⱼ)
 *
 * which softens the "counterintuitive orbital mixing" that the plain form
 * shows when two orbitals differ strongly in energy (deep F 2s against S 3p,
 * say): it makes the coupling grow from the plain K/2 = 0.875 toward 1.0 as
 * the mismatch grows. The plain form is the textbook one every orbital-
 * interaction diagram assumes, so it is what this app teaches; the fixtures
 * in tests/references/eht are generated with YAeHMOP's `nonweighted` keyword
 * so the oracle computes the same formula. Switching would be one line here
 * plus a fixture regeneration — see NOTES.md.
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
