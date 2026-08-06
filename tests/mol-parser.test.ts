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

  it('parses the JSME 3-line header (name, blank, counts)', () => {
    // JSME's "Copy as MOL" omits the second comment line — the counts
    // line sits at index 2, not 3. A hard-coded index read it as part
    // of the header and produced an empty molecule.
    const jsmeMol = `JME 2024-04-29 Thu Aug 06 13:04:05 GMT-400 2026

  8  8  0  0  0  0  0  0  0  0999 V2000
    2.3899    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.3799    0.9899    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.3799    2.3899    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.3899    3.3799    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.9899    3.3799    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.3899    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.9899    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.9899    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  5  1  0  0  0  0
  5  6  1  0  0  0  0
  6  7  1  0  0  0  0
  7  8  1  0  0  0  0
  8  1  1  0  0  0  0
M  END
`;
    const mol = parseMolBlock(jsmeMol);
    expect(mol.atoms).toHaveLength(8);
    expect(mol.bonds).toHaveLength(8);
    expect(mol.atoms[0].element).toBe('C');
    expect(mol.bonds[0]).toEqual({ atom1Index: 0, atom2Index: 1, order: 1 });
    expect(mol.bonds[7]).toEqual({ atom1Index: 7, atom2Index: 0, order: 1 });
  });
});
