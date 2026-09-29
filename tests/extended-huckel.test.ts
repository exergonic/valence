// Extended Hückel: the overlaps, the Hamiltonian and the orbital ladder.
//
// Two independent sources of truth, both used here:
//
//  1. ANALYTIC. The 1s–1s overlap has a textbook closed form for equal
//     exponents, and the 1s–2pσ integral was derived for this test by
//     integrating the Slater orbitals in prolate spheroidal coordinates:
//     S = (ζR)⁴/8 · [2A₃(ρ) − (2/3)A₁(ρ)]. Either pin fails loudly if the
//     A/B auxiliary functions or the binomial sum drift.
//
//  2. THE ORACLE. tests/references/eht holds YAeHMOP `bind` 3.1.0b2 output
//     for six molecules on the app's own example geometries (see the
//     provenance block in eht-reference.json and the raw .out files beside
//     it). bind prints 4 decimals, and its H entries reach ~70 eV, so a
//     5e-5 rounding in S propagates to a few 1e-3 eV in H and ~0.03 eV in
//     the highest virtual orbitals — that is the precision floor of this
//     comparison, not our error. The occupied ladder matches to ≤0.001 eV.
//
// The oracle runs with `nonweighted`: YAeHMOP defaults to the ABTH-weighted
// Hij form, while this implementation (per PLAN.md) uses Hoffmann's plain
// K = 1.75. Same formula, or the numbers would not be comparable.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { abFunctions, radialComponent, overlapMatrix } from '../src/chem/extended-huckel/slater-overlap';
import { assignBasis } from '../src/chem/extended-huckel/assign-basis';
import { hamiltonianMatrix, WOLFSBERG_HELMHOLZ_K } from '../src/chem/extended-huckel/hamiltonian';
import { solveExtendedHuckel, closedShellOccupations } from '../src/chem/extended-huckel/solve';
import type { Molecule } from '../src/mol-parser';

interface Fixture {
  provenance: Record<string, unknown>;
  molecules: Array<{
    name: string;
    electrons: number;
    atoms: Array<{ element: string; x: number; y: number; z: number }>;
    aoLabels: string[];
    S: number[][];
    H: number[][];
    energies: number[];
    occupations: number[];
  }>;
}

const fixtures: Fixture = JSON.parse(
  readFileSync(new URL('./references/eht/eht-reference.json', import.meta.url), 'utf8'),
);
const moleculeOf = (atoms: Fixture['molecules'][number]['atoms']): Molecule => ({
  atoms: atoms.map((a) => ({ ...a, charge: 0 })),
  bonds: [],
});

describe('slater-overlap — the radial integrals', () => {
  it('1s–1s with equal exponents is the textbook e^-ρ(1 + ρ + ρ²/3)', () => {
    for (const [zeta, R] of [[1, 1.5], [2.275, 0.9579], [1.3, 0.74]] as const) {
      const rho = zeta * R;
      expect(radialComponent(1, 0, 1, 0, 0, zeta, zeta, R))
        .toBeCloseTo(Math.exp(-rho) * (1 + rho + (rho * rho) / 3), 12);
    }
  });

  it('1s–2pσ matches an independent derivation: (ζR)⁴/8 · [2A₃ − (2/3)A₁]', () => {
    for (const [zeta, R] of [[1, 1.5], [1, 2.5], [1.3, 1.81]] as const) {
      const { A } = abFunctions(zeta, zeta, R, 5);
      const derived = (Math.pow(zeta * R, 4) / 8) * (2 * A[3] - (2 / 3) * A[1]);
      expect(radialComponent(1, 0, 2, 1, 0, zeta, zeta, R)).toBeCloseTo(derived, 12);
    }
  });

  it('the overlap matrix is symmetric, unit-diagonal, and blind to coincident atoms', () => {
    const water = fixtures.molecules.find((m) => m.name.startsWith('Water'))!;
    const mol = moleculeOf(water.atoms);
    const basis = assignBasis(mol)!;
    const S = overlapMatrix(basis, mol.atoms);
    for (let i = 0; i < basis.length; i++) {
      expect(S[i][i]).toBe(1);
      for (let j = 0; j < basis.length; j++) expect(S[i][j]).toBe(S[j][i]);
    }
    // two orbitals on the same atom do not overlap
    const sameAtom = basis.findIndex((b, i) => i > 0 && b.atomIndex === basis[0].atomIndex);
    expect(S[0][sameAtom]).toBe(0);
  });
});

describe('extended Hückel against the YAeHMOP oracle', () => {
  for (const fixture of fixtures.molecules) {
    it(`${fixture.name}: basis order, S, H and the orbital ladder`, () => {
      const mol = moleculeOf(fixture.atoms);
      const result = solveExtendedHuckel(mol);
      expect(result).not.toBeNull();
      const { basis, overlap, hamiltonian, energies, electronCount } = result!;
      const n = fixture.aoLabels.length;

      expect(basis.length).toBe(n);
      expect(electronCount).toBe(fixture.electrons);
      // the same atomic orbitals in the same order as the oracle printed
      expect(basis.map((b) => b.label)).toEqual(fixture.aoLabels);

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          expect(Math.abs(overlap[i][j] - fixture.S[i][j])).toBeLessThan(2e-4);
          expect(Math.abs(hamiltonian[i][j] - fixture.H[i][j])).toBeLessThan(5e-3);
        }
      }

      expect(energies.length).toBe(fixture.energies.length);
      for (let k = 0; k < energies.length; k++) {
        expect(Math.abs(energies[k] - fixture.energies[k])).toBeLessThan(0.05);
      }
      // the occupied ladder is the part a chemist reads: pin it tighter
      const filled = fixture.occupations.filter((o) => o > 0).length;
      for (let k = 0; k < filled; k++) {
        expect(Math.abs(energies[k] - fixture.energies[k])).toBeLessThan(0.002);
      }
    });
  }

  it('benzene: the HOMO is the degenerate π pair, as EH has always said', () => {
    const benzene = fixtures.molecules.find((m) => m.name.startsWith('Benzene'))!;
    const result = solveExtendedHuckel(moleculeOf(benzene.atoms))!;
    const occupied = result.energies.slice(0, result.electronCount / 2);
    const homo = occupied[occupied.length - 1];
    const nextDown = occupied[occupied.length - 2];
    // Degenerate by symmetry; the app's example ring is rounded to 4 decimals,
    // so the pair splits by ~1e-4 eV — the geometry's precision, not the
    // solver's.
    expect(Math.abs(homo - nextDown)).toBeLessThan(1e-3);
    expect(homo).toBeCloseTo(-12.797, 2);
  });
});

describe('the extended-Hückel refusals', () => {
  it('an element outside the parameter table gets no orbitals', () => {
    const iron: Molecule = { atoms: [{ element: 'Fe', x: 0, y: 0, z: 0, charge: 0 }], bonds: [] };
    expect(assignBasis(iron)).toBeNull();
    expect(solveExtendedHuckel(iron)).toBeNull();
  });

  it('closed-shell filling refuses an odd electron count instead of half-filling', () => {
    expect(closedShellOccupations(8, 6)).toEqual([2, 2, 2, 2, 0, 0]);
    expect(closedShellOccupations(7, 6)).toBeNull(); // a radical
    expect(closedShellOccupations(13, 6)).toBeNull(); // more electrons than orbitals
  });

  it('the Wolfsberg–Helmholz constant is Hoffmann 1963, not a tuned number', () => {
    expect(WOLFSBERG_HELMHOLZ_K).toBe(1.75);
  });
});

describe('the Hamiltonian', () => {
  it('is the Wolfsberg–Helmholz form: Hᵢⱼ = ½K(Hᵢᵢ+Hⱼⱼ)Sᵢⱼ, diagonal = VSIP', () => {
    const water = fixtures.molecules.find((m) => m.name.startsWith('Water'))!;
    const mol = moleculeOf(water.atoms);
    const basis = assignBasis(mol)!;
    const S = overlapMatrix(basis, mol.atoms);
    const H = hamiltonianMatrix(basis, S);
    for (let i = 0; i < basis.length; i++) {
      expect(H[i][i]).toBe(basis[i].hii);
      for (let j = 0; j < i; j++) {
        expect(H[i][j]).toBeCloseTo(0.5 * 1.75 * (basis[i].hii + basis[j].hii) * S[i][j], 12);
      }
    }
  });
});
