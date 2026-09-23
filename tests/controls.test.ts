import { describe, it, expect } from 'vitest';
import { moleculeToSDF } from '../src/ui/controls';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { classifyMolecule } from '../src/chem/classify';

// Regression (2026-09-23): the SDF export wrote zero charge columns and no
// M  CHG property lines, so a drawn ion exported as a neutral radical — the
// methyl-anion and allyl-anion reports both had to restore the charge by
// hand before the exported file described the drawn molecule, and
// re-importing an export changed what the app computes.  Charges now go on
// M  CHG lines: the V2000 way, read back by parseMolBlock (which lets them
// override the atom-line charge code) and by other tools.
describe('SDF export — formal charges (2026-09-23)', () => {
  // Real charged molecule: the planar formate from the promotion-gate tests.
  const formate = (): Molecule => ({
    atoms: [
      { element: 'C', x: 0, y: 0, z: 0 },
      { element: 'H', x: 1.1, y: 0, z: 0 },
      { element: 'O', charge: -1, x: -0.625, y: 1.083, z: 0 },
      { element: 'O', x: -0.61, y: -1.057, z: 0 },
    ],
    bonds: [
      { atom1Index: 0, atom2Index: 1, order: 1 },
      { atom1Index: 0, atom2Index: 2, order: 1 },
      { atom1Index: 0, atom2Index: 3, order: 2 },
    ],
  });

  it('writes an M  CHG line for a charged atom — the parser’s documented format', () => {
    // "M  CHG  1   3  -1": one entry, atom 3, charge −1.
    expect(moleculeToSDF(formate())).toContain('M  CHG  1   3  -1');
  });

  it('writes no M  CHG line for a neutral molecule', () => {
    const neutral = formate();
    neutral.atoms[2].charge = undefined;
    expect(moleculeToSDF(neutral)).not.toContain('M  CHG');
  });

  it('chunks more than eight charges across M  CHG lines', () => {
    const many: Molecule = {
      atoms: Array.from({ length: 9 }, (_, i) => ({ element: 'O', charge: -1, x: i, y: 0, z: 0 })),
      bonds: [],
    };
    const lines = moleculeToSDF(many).split('\n').filter((l) => l.startsWith('M  CHG'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('M  CHG  8');
    expect(lines[1]).toContain('   9  -1');
  });

  it('round-trips through parseMolBlock — charges and classification identical', () => {
    const original = formate();
    const reimported = parseMolBlock(moleculeToSDF(original));
    expect(reimported.atoms.map((a) => a.charge)).toEqual(original.atoms.map((a) => a.charge));
    expect(classifyMolecule(reimported)).toEqual(classifyMolecule(original));
  });

  it('the reported allyl anion exports its charge and re-imports identically', () => {
    // The drawn anion as JSME's molFile() encodes it (M  CHG for the
    // carbanion — the line the export used to drop), with the reported
    // refined coordinates.  Columns are fixed-width V2000.
    const drawn = `Valence export
  converter

  8  7  0  0  0  0  0  0  0  0999 V2000
   -0.2694    0.1432   -0.0672   C  0  0  0  0  0  0  0  0  0  0  0  0
    1.0516    0.1415    0.1475   C  0  0  0  0  0  0  0  0  0  0  0  0
    1.8768   -1.0939    0.2737   C  0  0  0  0  0  0  0  0  0  0  0  0
   -0.8173    1.0770   -0.1496   H  0  0  0  0  0  0  0  0  0  0  0  0
   -0.8338   -0.7790   -0.1652   H  0  0  0  0  0  0  0  0  0  0  0  0
    1.5761    1.0897    0.2398   H  0  0  0  0  0  0  0  0  0  0  0  0
    1.2799   -2.0085    0.2116   H  0  0  0  0  0  0  0  0  0  0  0  0
    2.6447   -1.1209   -0.5045   H  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  2  6  1  0  0  0  0
  3  7  1  0  0  0  0
  3  8  1  0  0  0  0
M  CHG  1   3  -1
M  END
$$$$
`;
    const original = parseMolBlock(drawn);
    expect(original.atoms[2].charge).toBe(-1);
    const exported = moleculeToSDF(original);
    expect(exported).toContain('M  CHG  1   3  -1');
    const reimported = parseMolBlock(exported);
    expect(reimported.atoms[2].charge).toBe(-1);
    expect(classifyMolecule(reimported)).toEqual(classifyMolecule(original));
  });
});
