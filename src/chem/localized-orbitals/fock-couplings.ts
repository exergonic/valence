/**
 * How strongly each pair of localized orbitals mixes: ⟨φᵢ|F|φⱼ⟩, the Fock
 * matrix (GFN2's, or extended Hückel's H) written in the localized basis.
 *
 * The diagonal is each orbital's energy, the number the list prints. The
 * off-diagonal is the coupling — what turns the bonds and lone pairs back into
 * the delocalized MOs: diagonalize this matrix and the canonical energies come
 * back exactly. Water's two O–H bonds sit at one energy and couple by
 * 0.68 eV, and that coupling is what splits them into the delocalized 2a₁ and
 * 1b₂.
 *
 * Filled orbitals couple only with filled ones, and empty with empty: each
 * block is a rotation of its own canonical set, which F already keeps apart,
 * so the occupied–empty elements are zero to rounding. A lone pair's donation
 * into a σ* is therefore not a coupling here — in a converged calculation it
 * is already in the lone pair's own tail. (An NBO analysis reads it as a
 * coupling because its orbitals are not the occupied set.)
 *
 * The sign of a coupling follows the arbitrary sign of each orbital, so only
 * its size means anything.
 */
import type { LocalizedOrbital } from './order-localized';

/** ⟨φᵢ|F|φⱼ⟩ for every pair, in eV, in the list's order. */
export function fockCouplings(hamiltonian: number[][], orbitals: LocalizedOrbital[]): number[][] {
  const fc = orbitals.map((orbital) => hamiltonian.map((row) => row.reduce((sum, h, nu) => sum + h * orbital.coefficients[nu], 0)));
  return orbitals.map((left) => fc.map((column) => left.coefficients.reduce((sum, c, mu) => sum + c * column[mu], 0)));
}
