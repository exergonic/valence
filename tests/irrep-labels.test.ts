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
import { symmetrizeMolecule } from '../src/geometry/symmetrize';
import { solveExtendedHuckel, closedShellOccupations } from '../src/chem/extended-huckel/solve';
import { labelIrreps } from '../src/chem/extended-huckel/irrep-labels';

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
    occupiedCount: (closedShellOccupations(result.electronCount, result.energies.length) ?? []).filter((o) => o > 0).length,
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
});
