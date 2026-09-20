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

  it('leaves charge unset for neutral atoms', () => {
    const mol = parseMolBlock(mockMol);
    expect(mol.atoms[0].charge).toBeUndefined();
    expect(mol.atoms[2].charge).toBeUndefined();
  });

  it('parses formal charge from an M CHG line (JSME carbocation encoding)', () => {
    // JSME's molFile() writes a drawn carbocation as "M  CHG  1   <atom>   <charge>".
    const charged = `JME

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  CHG  1   1   1
M  END
`;
    const mol = parseMolBlock(charged);
    expect(mol.atoms[0].charge).toBe(1);
    expect(mol.atoms[1].charge).toBeUndefined();
  });

  it('parses the V2000 atom-line charge code', () => {
    // Columns 37-39 of the atom line: 3 = +1, 5 = -1 (0-indexed 36-39).
    const coded = `


  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C     3  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O     5  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;
    const mol = parseMolBlock(coded);
    expect(mol.atoms[0].charge).toBe(1);
    expect(mol.atoms[1].charge).toBe(-1);
  });

  it('lets M CHG override the atom-line charge code', () => {
    const both = `


  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C     3  0  0  0  0  0  0  0  0  0  0  0
M  CHG  1   1  -1
M  END
`;
    const mol = parseMolBlock(both);
    expect(mol.atoms[0].charge).toBe(-1);
  });

  it('carries V3000 CHG= through the converter', () => {
    const v3000 = `some header
program line
comment line
  0  0  0  0  0  0  0  0  0  0999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 2 1 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.0 0.0 0.0 0 CHG=1
M  V30 2 C 1.5 0.0 0.0 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2
M  V30 END BOND
M  V30 END CTAB
M  END
`;
    const mol = parseMolBlock(v3000);
    expect(mol.atoms).toHaveLength(2);
    expect(mol.atoms[0].charge).toBe(1);
    expect(mol.atoms[1].charge).toBeUndefined();
  });
});
