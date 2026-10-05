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
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { exampleGeometry } from './helpers/local-geometry';
import { detectPointGroup, symmetrizeMolecule } from '../src/geometry/symmetrize';
import { assignBasis } from '../src/chem/extended-huckel/assign-basis';
import { alignToPrincipalAxes } from '../src/chem/extended-huckel/align-principal-axes';
import { solveExtendedHuckel, closedShellOccupations } from '../src/chem/extended-huckel/solve';
import { labelIrreps, representationMatrix } from '../src/chem/extended-huckel/irrep-labels';
import { assignOrbitals } from '../src/chem/vsepr/assign-orbitals';

async function labelled(name: string): Promise<{
  symbol: string;
  labels: (string | null)[];
  energies: number[];
  occupiedCount: number;
}> {
  // the example as the app shows it: GFN2-optimised, then snapped
  const molecule = await exampleGeometry(name);
  const result = solveExtendedHuckel(molecule)!;
  return {
    symbol: detectPointGroup({ atoms: alignToPrincipalAxes(molecule).atoms, bonds: [] }).symbol,
    labels: labelIrreps(molecule, result.basis, result.coefficients, result.energies, result.overlap),
    energies: result.energies,
    // the EH eigenvalues are all negative — occupancy comes from the electron
    // count, not from the sign
    // energies included: a partly filled degenerate set (O₂) is a refusal, the
    // same one the panel applies. These molecules are closed shells.
    occupiedCount: (closedShellOccupations(result.electronCount, result.energies.length, result.energies) ?? []).filter((o) => o > 0).length,
  };
}

/** A DFT minimum from tests/references/dft (see its README), snapped and
 *  labelled — for the groups no example in the app reaches with exact
 *  symmetry. */
function dftLabelled(file: string): { symbol: string; labels: (string | null)[]; occupied: (string | null)[] } {
  const lines = readFileSync(new URL(`./references/dft/${file}.xyz`, import.meta.url), 'utf8').trim().split(/\r?\n/).slice(2);
  const atoms = lines.map((line) => {
    const [element, x, y, z] = line.trim().split(/\s+/);
    return { element, x: Number(x), y: Number(y), z: Number(z), charge: 0 };
  });
  const snapped = symmetrizeMolecule({ atoms, bonds: [] });
  const molecule: Molecule = { atoms: snapped.atoms, bonds: [] };
  const result = solveExtendedHuckel(molecule)!;
  const labels = labelIrreps(molecule, result.basis, result.coefficients, result.energies, result.overlap);
  const filling = closedShellOccupations(result.electronCount, result.energies.length, result.energies)!;
  return { symbol: snapped.symbol, labels, occupied: labels.filter((_, i) => filling[i] > 0) };
}

/** One entry per degenerate set: t1u, t1u, t1u → t1u (a set's members are
 *  adjacent and share their label). */
function sets(labels: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = [];
  let remaining = 0;
  for (const label of labels) {
    if (remaining > 0) { remaining--; continue; }
    out.push(label);
    remaining = label?.startsWith('t') ? 2 : label?.startsWith('e') ? 1 : 0;
  }
  return out;
}

const occupied = async (name: string) => {
  const { labels, occupiedCount } = await labelled(name);
  return labels.slice(0, occupiedCount);
};

describe('the electron-domain model refuses what it cannot describe', () => {
  it('a metal centre gets no label, and its haptic contacts are not domains', async () => {
    // Ferrocene is in EXAMPLES for the MO layer. The electron-domain model has
    // no answer for iron — ten contacts clamped into the six-domain ceiling
    // used to come out "sp³d²" — and counting a haptic Fe–C contact as a σ bond
    // made every cyclopentadienyl carbon read sp³ instead of sp².
    const molecule = parseMolBlock(EXAMPLES.find((e) => e.name.includes('Ferrocene'))!.mol);
    const assigned = assignOrbitals(molecule);
    const iron = assigned[0];
    expect(iron.described).toBe(false);
    expect(iron.hybridization).toBe('');
    expect(iron.lonePairs).toBe(0);
    expect(iron.hasPi).toBe(false);
    // the ring carbons are aromatic sp², with a p orbital
    const carbons = assigned.filter((a, i) => molecule.atoms[i].element === 'C');
    expect(carbons).toHaveLength(10);
    for (const carbon of carbons) {
      expect(carbon.described).toBe(true);
      expect(carbon.hybridization).toBe('sp²');
      expect(carbon.hasPi).toBe(true);
    }
    // and the hydrogens still read s, as everywhere else
    for (const [i, atom] of molecule.atoms.entries()) {
      if (atom.element === 'H') expect(assigned[i].hybridization).toBe('s');
    }
  });

  it('a normal organic molecule keeps the same assignments it always had', async () => {
    for (const [name, check] of [
      ['Water', (a: ReturnType<typeof assignOrbitals>) => a[0].hybridization === 'sp³' && a[0].lonePairs === 2],
      ['Ethene', (a: ReturnType<typeof assignOrbitals>) => a[0].hybridization === 'sp²' && a[0].hasPi],
      ['Benzene', (a: ReturnType<typeof assignOrbitals>, m: Molecule) =>
        a.every((x, i) => m.atoms[i].element === 'H' || x.hybridization === 'sp²')],
    ] as const) {
      const molecule = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(name))!.mol);
      const assigned = assignOrbitals(molecule);
      expect(assigned.every((a) => a.described)).toBe(true);
      expect(check(assigned, molecule)).toBe(true);
    }
  });
});

describe('irrep labels', () => {
  // one GFN2 run per example, shared by the tests below
  beforeAll(async () => {
    for (const name of ['Water', 'Methane', 'Nitrogen', 'Ethyne', 'Benzene', 'Ethene']) await exampleGeometry(name);
  }, 300_000);

  it('gives water its four occupied orbitals', async () => {
    // 1a1 (O 2s), 1b2 (in-plane lone pair), 2a1 (O–H bonding), 1b1 (the HOMO)
    expect(await occupied('Water')).toEqual(['a1', 'b2', 'a1', 'b1']);
  });

  it('gives methane 1a1 plus the 1t2 triple', async () => {
    expect(await occupied('Methane')).toEqual(['a1', 't2', 't2', 't2']);
  });

  it('gives the diatomics their σ/π sequence', async () => {
    expect(await occupied('Nitrogen')).toEqual(['σg', 'σu', 'πu', 'πu', 'σg']);
    // ethyne: 1σg, 1σu, 2σg, 1πu (the πg pair above it is the LUMO)
    expect(await occupied('Ethyne')).toEqual(['σg', 'σu', 'σg', 'πu', 'πu']);
  });

  it('gives benzene the π set — e1g for the HOMO pair', async () => {
    const { labels, symbol } = await labelled('Benzene');
    expect(symbol).toBe('D6h');
    // the π ladder: a2u (lowest), e1g (HOMO), e2u (LUMO), b2g (highest)
    expect(labels[9]).toBe('a2u');
    expect(labels.slice(13, 15)).toEqual(['e1g', 'e1g']);
    expect(labels.slice(15, 17)).toEqual(['e2u', 'e2u']);
    expect(labels[17]).toBe('b2g');
  });

  it('names D2h on Mulliken’s axes — ethene’s π is b3u, its π* b2g', async () => {
    // x perpendicular to the plane, z along C=C. Before, D2h was named like an
    // axial group: a1g, a2u, b1g... symbols D2h does not have, and never a b3.
    const { symbol, labels, occupied } = dftLabelled('ethene');
    expect(symbol).toBe('D2h');
    expect(occupied).toEqual(['ag', 'b1u', 'b2u', 'b3g', 'ag', 'b3u']);
    expect(labels[occupied.length]).toBe('b2g');
    const naphthalene = dftLabelled('naphthalene');
    expect(naphthalene.symbol).toBe('D2h');
    expect(naphthalene.occupied.at(-1)).toBe('au');
    for (const label of naphthalene.labels) expect(label).toMatch(/^(a|b[123])[gu]$/);
  });

  it('names D2d by its S4 — allene’s b2 is not an a', async () => {
    // b2 is symmetric under the C2 along C=C=C and antisymmetric under the S4
    // about it; reading a/b off the C2 made every one-dimensional set an a.
    const { symbol, occupied } = dftLabelled('allene');
    expect(symbol).toBe('D2d');
    expect(occupied).toEqual(['a1', 'b2', 'a1', 'e', 'e', 'b2', 'e', 'e']);
  });

  it('names Oh by its C4 — SF₆’s σ bonds are t1u and its HOMO t1g', async () => {
    // T1/T2 were read off the mirror through the most atoms, which in SF₆ is
    // the class that cannot tell them apart: every t1u came out t2u.
    const { symbol, occupied } = dftLabelled('SF6');
    expect(symbol).toBe('Oh');
    expect(sets(occupied)).toEqual(['a1g', 't1u', 'eg', 'a1g', 't1u', 't2g', 't2u', 'eg', 't1u', 't1g']);
  });

  it('has no B in a cubic group — cubane’s a2u is an a', async () => {
    // A2u is antisymmetric under C4, and an axial rule called that a b. The
    // eight carbons' 2s combinations are a1g + t1u + t2g + a2u.
    const { symbol, occupied } = dftLabelled('cubane');
    expect(symbol).toBe('Oh');
    expect(sets(occupied).slice(0, 4)).toEqual(['a1g', 't1u', 't2g', 'a2u']);
  });

  it('gives staggered methanol its a′ and a″ — a Cs with no molecular plane', async () => {
    // The mirror holds C, O and two H. The ′/″ test once looked only for a
    // mirror normal to the frame's z; methanol's happens to be, so this pins
    // the labels rather than that fix (see NOTES.md).
    const { symbol, occupied } = dftLabelled('methanol');
    expect(symbol).toBe('Cs');
    expect(occupied.filter((l) => l === "a'")).toHaveLength(5);
    expect(occupied.filter((l) => l === 'a"')).toHaveLength(2);
    expect(occupied.at(-1)).toBe('a"');
  });

  it('finds Cs’s mirror off the frame’s z axis — CHFCl₂', async () => {
    // The two Cl straddle the mirror (H, C, F), so the largest moment of
    // inertia is not about its normal: the normal lands on the frame's y, and
    // a ′/″ test that only looked along z labelled every orbital a bare a.
    const { symbol, labels } = dftLabelled('dichlorofluoromethane');
    expect(symbol).toBe('Cs');
    for (const label of labels) expect(label).toMatch(/^a['"]$/);
    expect(labels.filter((l) => l === "a'").length).toBeGreaterThan(0);
    expect(labels.filter((l) => l === 'a"').length).toBeGreaterThan(0);
  });

  it('methane’s representation multiplies: D(a) D(b) = D(ab)', async () => {
    // Rotating the target p axis instead of the source leaves every diagonal
    // right and every off-diagonal wrong. Characters of pure pz (benzene’s π,
    // water’s b1) never see an off-diagonal, so they stayed textbook while a
    // C3 that mixes px with py was not a representation. Td is the group
    // where that shows: 24 operations, and the product rule on all of them.
    const molecule = await exampleGeometry('Methane');
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

  it('labels every MO, and agrees with the degeneracy it reports', async () => {
    for (const name of ['Water', 'Methane', 'Nitrogen', 'Benzene', 'Ethene', 'Ethyne']) {
      const { labels, energies } = await labelled(name);
      expect(labels.every((l) => l !== null && l !== '?')).toBe(true);
      // degenerate partners carry the same label
      for (let i = 1; i < labels.length; i++) {
        if (Math.abs(energies[i] - energies[i - 1]) < 1e-5) expect(labels[i]).toBe(labels[i - 1]);
      }
    }
  });

  it('represents a rotation on the five d functions with the l = 2 character', async () => {
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
