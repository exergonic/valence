/**
 * JSME's five-bond nitro, made the charge-separated Lewis structure
 * (charge-separate-nitrogen.ts). The MOL block is JSME's own output for
 * nitromethane — it writes CN(=O)=O even when given C[N+](=O)[O-].
 */
import { describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { chargeSeparateNitrogen } from '../src/chem/charge-separate-nitrogen';

// jsmeApplet.readGenericMolecularInput('C[N+](=O)[O-]'); jsmeApplet.molFile()
const JSME_NITROMETHANE = `
JME 2024-04-29 Tue Oct 20 13:03:46 GMT-400 2026

  4  3  0  0  0  0  0  0  0  0999 V2000
    2.4249    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    0.7000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.1000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  2  1  1  0  0  0  0
  3  2  2  0  0  0  0
  4  2  2  0  0  0  0
M  END
`;

describe('a neutral nitrogen with five bonds', () => {
  it('nitromethane: one N=O becomes N⁺–O⁻, the other stays double', () => {
    const fixed = chargeSeparateNitrogen(parseMolBlock(JSME_NITROMETHANE));
    const charges = fixed.atoms.map((a) => a.charge ?? 0);
    expect(charges[1]).toBe(1);
    expect(charges.filter((q) => q === -1)).toHaveLength(1);
    const nOrders = fixed.bonds.filter((b) => b.atom1Index === 1 || b.atom2Index === 1).map((b) => b.order).sort();
    expect(nOrders).toEqual([1, 1, 2]);
    // still neutral overall
    expect(charges.reduce((s, q) => s + q, 0)).toBe(0);
  });

  it('leaves a molecule without one untouched', () => {
    const fixed = chargeSeparateNitrogen(parseMolBlock(JSME_NITROMETHANE.replace('  4  2  2', '  4  2  1')));
    expect(fixed.atoms.every((a) => (a.charge ?? 0) === 0)).toBe(true);
  });

  it('does not change the molecule it was given', () => {
    const molecule = parseMolBlock(JSME_NITROMETHANE);
    chargeSeparateNitrogen(molecule);
    expect(molecule.atoms.every((a) => (a.charge ?? 0) === 0)).toBe(true);
    expect(molecule.bonds.map((b) => b.order)).toEqual([1, 2, 2]);
  });
});
