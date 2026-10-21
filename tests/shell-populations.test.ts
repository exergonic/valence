/**
 * An orbital's share on each atom split into s, p and d (shellPopulations):
 * the hover tooltip's hybrid (spᵡ, λ = p/s) and its "O1, s 11% + p 41%".
 * Water is the app's example, optimised by its own GFN2 pipeline; extended
 * Hückel gives the orbitals.
 */
import { describe, expect, it } from 'vitest';
import { optimisedExample } from './helpers/local-geometry';
import { solveExtendedHuckel } from '../src/chem/extended-huckel/solve';
import { atomicPopulations, shellPopulations } from '../src/chem/localized-orbitals/mulliken-populations';

describe('an orbital split by atom and shell', () => {
  it("water's HOMO, the 1b₁ lone pair, is oxygen p and nothing else", async () => {
    const water = await optimisedExample('Water');
    const eh = solveExtendedHuckel(water)!;
    const homo = eh.electronCount / 2 - 1;
    const o = water.atoms.findIndex((a) => a.element === 'O');
    const shells = shellPopulations(eh.coefficients[homo], eh.overlap, eh.basis, water.atoms.length);
    expect(shells[o].p).toBeCloseTo(1, 3);
    expect(shells[o].s).toBeCloseTo(0, 3);
  });

  it('the shells of each atom add up to its Mulliken share', async () => {
    const water = await optimisedExample('Water');
    const eh = solveExtendedHuckel(water)!;
    eh.coefficients.forEach((c) => {
      const shells = shellPopulations(c, eh.overlap, eh.basis, water.atoms.length);
      const totals = atomicPopulations(c, eh.overlap, eh.basis, water.atoms.length);
      shells.forEach(({ s, p, d }, atom) => expect(s + p + d).toBeCloseTo(totals[atom], 10));
    });
  });
});
