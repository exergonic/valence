import { describe, it, expect } from 'vitest';
import { place3D } from '../src/geometry/place3d';
import { fillMissingHydrogens } from '../src/chem/hydrogens';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';

describe('place3D', () => {
  it('should place isolated atom at origin', () => {
    const molecule = {
      atoms: [{ element: 'C', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toEqual([0, 0, 0]);
  });

  it('should produce 3D coords for ethane', () => {
    const molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'H', x: -0.5, y: 0.8, z: 0 },
        { element: 'H', x: -0.5, y: -0.8, z: 0 },
        { element: 'H', x: 2.0, y: 0.8, z: 0 },
        { element: 'H', x: 2.0, y: -0.8, z: 0 },
        { element: 'H', x: -0.5, y: 0, z: 0 },
        { element: 'H', x: 2.0, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 6, order: 1 },
        { atom1Index: 1, atom2Index: 4, order: 1 },
        { atom1Index: 1, atom2Index: 5, order: 1 },
        { atom1Index: 1, atom2Index: 7, order: 1 },
      ],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(8);

    const zs = placed.map((p) => Math.abs(p[2]));
    expect(zs.some((z) => z > 0.1)).toBe(true);
  });

  it('should produce staggered conformation for propane via MOL', () => {
    const molBlock = `


  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;
    const molecule = fillMissingHydrogens(parseMolBlock(molBlock));
    const placed = place3D(molecule);

    // Check that not all coords are planar
    const zs = placed.map((p) => Math.abs(p[2]));
    expect(zs.some((z) => z > 0.1)).toBe(true);
  });

  it('should not crash on multiple separate rings (biphenyl — the 2026-08-12 multi-ring bug)', () => {
    // The ring walk followed a single cycle and left the OTHER rings'
    // atoms unplaced; the centroid loop then dereferenced pos[i] for
    // them and the whole local pipeline threw (the user-visible
    // symptom on methylenetriphenylphosphorane: the app fell back to
    // the raw H-less molecule). Every disjoint ring must be walked.
    const biphenyl: Molecule = {
      atoms: [
        { element: 'C', x: 0.0, y: 0.0, z: 0.0 },
        { element: 'C', x: 1.4, y: 0.0, z: 0.0 },
        { element: 'C', x: 2.1, y: 1.2, z: 0.0 },
        { element: 'C', x: 1.4, y: 2.4, z: 0.0 },
        { element: 'C', x: 0.0, y: 2.4, z: 0.0 },
        { element: 'C', x: -0.7, y: 1.2, z: 0.0 },
        { element: 'C', x: 4.0, y: 1.2, z: 0.0 },
        { element: 'C', x: 4.7, y: 0.0, z: 0.0 },
        { element: 'C', x: 6.1, y: 0.0, z: 0.0 },
        { element: 'C', x: 6.8, y: 1.2, z: 0.0 },
        { element: 'C', x: 6.1, y: 2.4, z: 0.0 },
        { element: 'C', x: 4.7, y: 2.4, z: 0.0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 2 },
        { atom1Index: 1, atom2Index: 2, order: 1 },
        { atom1Index: 2, atom2Index: 3, order: 2 },
        { atom1Index: 3, atom2Index: 4, order: 1 },
        { atom1Index: 4, atom2Index: 5, order: 2 },
        { atom1Index: 5, atom2Index: 0, order: 1 },
        { atom1Index: 2, atom2Index: 6, order: 1 },
        { atom1Index: 6, atom2Index: 7, order: 2 },
        { atom1Index: 7, atom2Index: 8, order: 1 },
        { atom1Index: 8, atom2Index: 9, order: 2 },
        { atom1Index: 9, atom2Index: 10, order: 1 },
        { atom1Index: 10, atom2Index: 11, order: 2 },
        { atom1Index: 11, atom2Index: 6, order: 1 },
      ],
    };
    const placed = place3D(fillMissingHydrogens(biphenyl));
    expect(placed).toHaveLength(22); // C₁₂H₁₀
    for (const p of placed) {
      expect(Number.isFinite(p[0])).toBe(true);
      expect(Number.isFinite(p[1])).toBe(true);
      expect(Number.isFinite(p[2])).toBe(true);
    }
  });
});
