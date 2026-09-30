/**
 * Irrep labels against the textbook.
 *
 * These are the assignments a chemist checks by hand, so they are the ones
 * worth pinning: water's four occupied orbitals (1a1, 1b2, 2a1, 1b1), methane's
 * 1a1 + 1t2, the σ/π sequence of the diatomics, and benzene's π set — where
 * the HOMO pair being e1g is the headline the whole feature exists for.
 *
 * The labels come from characters computed numerically, so the expectations
 * are independent of how the detection happens to order its operations.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { detectPointGroup, symmetrizeMolecule } from '../src/geometry/symmetrize';
import { assignBasis } from '../src/chem/extended-huckel/assign-basis';
import { alignToPrincipalAxes } from '../src/chem/extended-huckel/align-principal-axes';
import { solveExtendedHuckel, closedShellOccupations } from '../src/chem/extended-huckel/solve';
import { labelIrreps, representationMatrix } from '../src/chem/extended-huckel/irrep-labels';

function labelled(name: string): {
  symbol: string;
  labels: (string | null)[];
  energies: number[];
  occupiedCount: number;
} {
  const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(name))!.mol)!;
  const raw = embedAndRefine(sketch).molecule;
  const snapped = symmetrizeMolecule(raw);
  const molecule: Molecule = { atoms: snapped.atoms, bonds: raw.bonds };
  const result = solveExtendedHuckel(molecule)!;
  return {
    symbol: snapped.symbol,
    labels: labelIrreps(molecule, result.basis, result.coefficients, result.energies, result.overlap),
    energies: result.energies,
    // the EH eigenvalues are all negative — occupancy comes from the electron
    // count, not from the sign
    // energies included: a partly filled degenerate set (O₂) is a refusal, the
    // same one the panel applies. These molecules are closed shells.
    occupiedCount: (closedShellOccupations(result.electronCount, result.energies.length, result.energies) ?? []).filter((o) => o > 0).length,
  };
}

const occupied = (name: string) => {
  const { labels, occupiedCount } = labelled(name);
  return labels.slice(0, occupiedCount);
};

describe('irrep labels', () => {
  it('gives water its four occupied orbitals', () => {
    // 1a1 (O 2s), 1b2 (in-plane lone pair), 2a1 (O–H bonding), 1b1 (the HOMO)
    expect(occupied('Water')).toEqual(['a1', 'b2', 'a1', 'b1']);
  });

  it('gives methane 1a1 plus the 1t2 triple', () => {
    expect(occupied('Methane')).toEqual(['a1', 't2', 't2', 't2']);
  });

  it('gives the diatomics their σ/π sequence', () => {
    expect(occupied('Nitrogen')).toEqual(['σg', 'σu', 'πu', 'πu', 'σg']);
    // ethyne: 1σg, 1σu, 2σg, 1πu (the πg pair above it is the LUMO)
    expect(occupied('Ethyne')).toEqual(['σg', 'σu', 'σg', 'πu', 'πu']);
  });

  it('gives benzene the π set — e1g for the HOMO pair', () => {
    const { labels, symbol } = labelled('Benzene');
    expect(symbol).toBe('D6h');
    // the π ladder: a2u (lowest), e1g (HOMO), e2u (LUMO), b2g (highest)
    expect(labels[9]).toBe('a2u');
    expect(labels.slice(13, 15)).toEqual(['e1g', 'e1g']);
    expect(labels.slice(15, 17)).toEqual(['e2u', 'e2u']);
    expect(labels[17]).toBe('b2g');
  });

  it('methane’s representation multiplies: D(a) D(b) = D(ab)', () => {
    // Rotating the target p axis instead of the source leaves every diagonal
    // right and every off-diagonal wrong. Characters of pure pz (benzene’s π,
    // water’s b1) never see an off-diagonal, so they stayed textbook while a
    // C3 that mixes px with py was not a representation. Td is the group
    // where that shows: 24 operations, and the product rule on all of them.
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Methane'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const snapped = symmetrizeMolecule(raw);
    const molecule: Molecule = { atoms: snapped.atoms, bonds: raw.bonds };
    const frame = alignToPrincipalAxes(molecule);
    const group = detectPointGroup({ atoms: frame.atoms, bonds: [] });
    expect(group.symbol).toBe('Td');
    const basis = assignBasis(molecule)!;

    const multiply = (a: number[][], b: number[][]) => a.map((row) =>
      b[0].map((_, j) => row.reduce((sum, aik, k) => sum + aik * b[k][j], 0)));
    const maxDiff = (a: number[][], b: number[][]) => {
      let worst = 0;
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < a[i].length; j++) worst = Math.max(worst, Math.abs(a[i][j] - b[i][j]));
      }
      return worst;
    };

    let worst = 0;
    for (const a of group.operations) {
      const da = representationMatrix(basis, a);
      for (const b of group.operations) {
        const composed = multiply(a.matrix, b.matrix);
        const perm = b.permutation.map((dest) => a.permutation[dest]);
        const ab = group.operations.find((op) => maxDiff(op.matrix, composed) < 1e-6);
        expect(ab, 'every product of Td operations is in the group').toBeDefined();
        expect(ab!.permutation).toEqual(perm);
        const product = multiply(da, representationMatrix(basis, b));
        worst = Math.max(worst, maxDiff(product, representationMatrix(basis, ab!)));
      }
    }
    expect(worst).toBeLessThan(1e-8);
  });

  it('labels every MO, and agrees with the degeneracy it reports', () => {
    for (const name of ['Water', 'Methane', 'Nitrogen', 'Benzene', 'Ethene', 'Ethyne']) {
      const { labels, energies } = labelled(name);
      expect(labels.every((l) => l !== null && l !== '?')).toBe(true);
      // degenerate partners carry the same label
      for (let i = 1; i < labels.length; i++) {
        if (Math.abs(energies[i] - energies[i - 1]) < 1e-5) expect(labels[i]).toBe(labels[i - 1]);
      }
    }
  });

  it('represents a rotation on the five d functions with the l = 2 character', () => {
    // A d function has no axis to rotate, so the representation is built from
    // the quadratic forms the five of them are. The character of a rotation by
    // θ is the textbook 1 + 2cosθ + 2cos2θ, which is what says the matrix is
    // the l = 2 irreducible representation and not merely a rotation of five
    // arbitrary vectors.
    const basis = assignBasisForD();
    for (const degrees of [30, 60, 90, 120, 180, 270]) {
      const theta = (degrees * Math.PI) / 180;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const operation = {
        matrix: [[c, -s, 0], [s, c, 0], [0, 0, 1]],
        permutation: [0],
      };
      const d = representationMatrix(basis, operation);
      let trace = 0;
      for (let i = 0; i < 5; i++) trace += d[i][i];
      expect(trace).toBeCloseTo(1 + 2 * Math.cos(theta) + 2 * Math.cos(2 * theta), 10);
      // and it is orthogonal: a rotation cannot change the norm of an orbital
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          let sum = 0;
          for (let k = 0; k < 5; k++) sum += d[k][i] * d[k][j];
          expect(sum).toBeCloseTo(i === j ? 1 : 0, 10);
        }
      }
    }
  });
});

/** The five d functions of one sulfur atom, as a basis. */
function assignBasisForD(): BasisFunction[] {
  return (['x2-y2', 'z2', 'xy', 'xz', 'yz'] as const).map((d) => ({
    atomIndex: 0, angular: 'd' as const, axis: [0, 0, 0] as [number, number, number], d,
    n: 3, zeta: 1.5, hii: -8, label: `S 3d${d}`,
  }));
}
