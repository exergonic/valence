import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { parameterGapWarnings } from '../src/geometry/parameter-warnings';
import { PUBCHEM_METHYL_ANION_SDF } from './fixtures';

describe('parameterGapWarnings', () => {
  it('warns for hexacoordinate S (SF₆)', () => {
    const example = EXAMPLES.find((e) => e.name === 'Sulfur hexafluoride (SF₆)');
    if (!example) { expect.fail('SF₆ example not found'); return; }
    const warnings = parameterGapWarnings(parseMolBlock(example.mol));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('6-coordinate S');
    expect(warnings[0]).toContain('no MMFF94 type');
  });

  it('warns for pentacoordinate P (PCl₅)', () => {
    const example = EXAMPLES.find((e) => e.name === 'Phosphorus pentachloride (PCl₅)');
    if (!example) { expect.fail('PCl₅ example not found'); return; }
    const warnings = parameterGapWarnings(parseMolBlock(example.mol));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('5-coordinate P');
  });

  it('is silent for well-typed molecules (ethane)', () => {
    const warnings = parameterGapWarnings(parseMolBlock(EXAMPLES[0].mol));
    expect(warnings).toEqual([]);
  });

  it('is silent for methyl anion (dropped out-of-plane is normal MMFF94 operation)', () => {
    // The anion's carbon types as tetrahedral MMFF 1, whose table holds no
    // planar restraint — the library's dropped-OOP diagnostic fires, but the
    // gap report is empty, so no popup warning appears. Real CID 881 SDF.
    expect(parameterGapWarnings(parseMolBlock(PUBCHEM_METHYL_ANION_SDF))).toEqual([]);
  });

  it('is silent for the aromatic examples', () => {
    for (const name of ['Benzene (C₆H₆)', 'Pyridine (C₅H₅N)', 'Phenol (C₆H₅OH)']) {
      const example = EXAMPLES.find((e) => e.name === name);
      if (!example) { expect.fail(`${name} not found`); return; }
      expect(parameterGapWarnings(parseMolBlock(example.mol))).toEqual([]);
    }
  });
});
