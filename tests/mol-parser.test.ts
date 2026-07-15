import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';

describe('parseMolBlock', () => {
  const mockMol = `


 3  2  0  0  0  0  0  0  0  0999 V2000
   -0.6000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;

  it('should parse atom count', () => {
    const mol = parseMolBlock(mockMol);
    expect(mol.atoms).toHaveLength(3);
  });

  it('should parse bond count', () => {
    const mol = parseMolBlock(mockMol);
    expect(mol.bonds).toHaveLength(2);
  });

  it('should parse atom elements and positions', () => {
    const mol = parseMolBlock(mockMol);
    expect(mol.atoms[0].element).toBe('C');
    expect(mol.atoms[0].x).toBeCloseTo(-0.6);
    expect(mol.atoms[1].element).toBe('C');
    expect(mol.atoms[1].x).toBeCloseTo(0.6);
    expect(mol.atoms[2].element).toBe('O');
  });

  it('should parse bond orders', () => {
    const mol = parseMolBlock(mockMol);
    expect(mol.bonds[0].order).toBe(2);
    expect(mol.bonds[1].order).toBe(1);
  });
});
