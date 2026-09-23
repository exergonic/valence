import { describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { assignOrbitals } from '../src/chem/assign-orbitals';

// A real JSME molfile: benzene drawn with the ring tool, copied from the app
// (2026-09-23).  This is the app's PRIMARY input format, so the fixture pins
// both the text shape the parser must keep accepting (JME header line,
// 7-field bond lines) and the chemistry that must come out of it.  JSME
// writes Kekulé bonds — aromatic bond type 4 is not emitted by the drawing
// tools and is not understood by the parser or the chem layer.
const JSME_BENZENE = `JME 2024-04-29 Wed Sep 23 15:58:26 GMT-400 2026

  6  6  0  0  0  0  0  0  0  0999 V2000
    2.4249    0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.8000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.7000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  6  1  0  0  0  0
  6  1  2  0  0  0  0
M  END
`;

describe('a JSME-drawn benzene', () => {
  it('parses to six carbons and Kekulé bond orders', () => {
    const molecule = parseMolBlock(JSME_BENZENE);
    expect(molecule.atoms).toHaveLength(6);
    expect(molecule.atoms.every((a) => a.element === 'C')).toBe(true);
    expect(molecule.bonds.map((b) => b.order)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('gives sp² carbons with exactly one p orbital each', () => {
    const orbitals = assignOrbitals(fillMissingHydrogens(parseMolBlock(JSME_BENZENE)));
    expect(orbitals).toHaveLength(12); // 6 C + 6 implicit H

    const carbons = orbitals.slice(0, 6);
    for (const carbon of carbons) {
      expect(carbon.hybridization).toBe('sp²');
      expect(carbon.hasPi).toBe(true);
      expect(carbon.piDirection2).toBeNull();
    }
    // All six p orbitals must share one axis — that is the π system.
    const first = carbons[0].piDirection!;
    for (const carbon of carbons) {
      const direction = carbon.piDirection!;
      const dot = Math.abs(first[0] * direction[0] + first[1] * direction[1] + first[2] * direction[2]);
      expect(dot).toBeCloseTo(1, 6);
    }
  });
});
