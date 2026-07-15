import { describe, it, expect } from 'vitest';
import { place3D } from '../src/embedder';
import { addImplicitHydrogens } from '../src/hydrogens';
import { parseMolBlock } from '../src/mol-parser';

describe('place3D', () => {
  it('should place isolated atom at origin', () => {
    const molecule = {
      atoms: [{ index: 0, element: 'C', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(1);
    expect(placed[0].position).toEqual([0, 0, 0]);
  });

  it('should produce 3D coords for ethane', () => {
    const molecule = {
      atoms: [
        { index: 0, element: 'C', x: 0, y: 0, z: 0 },
        { index: 1, element: 'C', x: 1.5, y: 0, z: 0 },
        { index: 2, element: 'H', x: -0.5, y: 0.8, z: 0 },
        { index: 3, element: 'H', x: -0.5, y: -0.8, z: 0 },
        { index: 4, element: 'H', x: 2.0, y: 0.8, z: 0 },
        { index: 5, element: 'H', x: 2.0, y: -0.8, z: 0 },
        { index: 6, element: 'H', x: -0.5, y: 0, z: 0 },
        { index: 7, element: 'H', x: 2.0, y: 0, z: 0 },
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

    const zs = placed.map((p) => Math.abs(p.position[2]));
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
    const molecule = addImplicitHydrogens(parseMolBlock(molBlock));
    const placed = place3D(molecule);

    // Check that not all coords are planar
    const zs = placed.map((p) => Math.abs(p.position[2]));
    expect(zs.some((z) => z > 0.1)).toBe(true);
  });
});
