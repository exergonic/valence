import { describe, it, expect } from 'vitest';
import { place3D } from '../src/embedder';

describe('place3D', () => {
  it('should place atoms from molecule', () => {
    const molecule = {
      atoms: [{ index: 0, element: 'C', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(1);
    expect(placed[0].position).toEqual([0, 0, 0]);
  });
});
