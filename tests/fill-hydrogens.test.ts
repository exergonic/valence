import { describe, it, expect } from 'vitest';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { parseMolBlock } from '../src/mol-parser';

/** Count hydrogens bonded to atom `idx` in a filled molecule. */
function hCount(mol: { atoms: { element: string }[]; bonds: { atom1Index: number; atom2Index: number }[] }, idx: number): number {
  let n = 0;
  for (const b of mol.bonds) {
    const other = b.atom1Index === idx ? b.atom2Index : b.atom2Index === idx ? b.atom1Index : -1;
    if (other >= 0 && mol.atoms[other].element === 'H') n++;
  }
  return n;
}

describe('fillMissingHydrogens', () => {
  it('should add 3 hydrogens to a terminal carbon', () => {
    const mol = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    const hAtoms = result.atoms.filter((a) => a.element === 'H');
    const hBonds = result.bonds.filter((b) => b.atom1Index === 0 || b.atom2Index === 0);
    expect(hAtoms).toHaveLength(6);
    expect(hBonds).toHaveLength(4);
  });

  it('should add 2 hydrogens to a middle carbon', () => {
    const mol = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'C', x: 3.0, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 1, atom2Index: 2, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    const hAtoms = result.atoms.filter((a) => a.element === 'H');
    const hBondsFromC1 = result.bonds.filter(
      (b) => {
        const otherIdx = b.atom1Index === 1 ? b.atom2Index : b.atom2Index === 1 ? b.atom1Index : -1;
        return otherIdx >= 0 && result.atoms[otherIdx].element === 'H';
      },
    );
    expect(hAtoms).toHaveLength(8);
    expect(hBondsFromC1).toHaveLength(2);
  });

  it('should not add hydrogens to carbon with 4 single bonds', () => {
    const mol = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'F', x: 1, y: 0, z: 0 },
        { element: 'Cl', x: -1, y: 0, z: 0 },
        { element: 'Br', x: 0, y: 1, z: 0 },
        { element: 'I', x: 0, y: -1, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    expect(result.atoms).toHaveLength(5);
    expect(result.bonds).toHaveLength(4);
  });

  it('should account for double bond order', () => {
    const mol = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'O', x: 1.2, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 2 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    const hAtoms = result.atoms.filter((a) => a.element === 'H');
    expect(hAtoms).toHaveLength(2);
  });

  it('should not add extra hydrogens to fluorine with 1 bond', () => {
    const mol = {
      atoms: [
        { element: 'F', x: 0, y: 0, z: 0 },
        { element: 'H', x: 1, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    expect(result.atoms).toHaveLength(2);
    expect(result.bonds).toHaveLength(1);
  });

  it('should add hydrogens to bare halogen', () => {
    const mol = {
      atoms: [
        { element: 'Cl', x: 0, y: 0, z: 0 },
      ],
      bonds: [],
    };
    const result = fillMissingHydrogens(mol);
    const hAtoms = result.atoms.filter((a) => a.element === 'H');
    expect(hAtoms).toHaveLength(1);
  });

  it('adds one hydrogen to a carbocation carbon (C+ with two single bonds)', () => {
    // The reported bug: a drawn CH+ was filled with 2 Hs (neutralized)
    // on the local path while PubChem/CIR respected the charge.
    const mol = {
      atoms: [
        { element: 'C', charge: 1, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'N', x: -1.5, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    expect(hCount(result, 0)).toBe(1);
  });

  it('adds no hydrogens to ammonium nitrogen', () => {
    const mol = {
      atoms: [
        { element: 'N', charge: 1, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'C', x: -1.5, y: 0, z: 0 },
        { element: 'C', x: 0, y: 1.5, z: 0 },
        { element: 'C', x: 0, y: -1.5, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
      ],
    };
    expect(hCount(fillMissingHydrogens(mol), 0)).toBe(0);
  });

  it('adds one hydrogen to iminium nitrogen (C=N+ with bond order sum 3)', () => {
    const mol = {
      atoms: [
        { element: 'N', charge: 1, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.3, y: 0, z: 0 },
        { element: 'C', x: -1.5, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 2 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
      ],
    };
    expect(hCount(fillMissingHydrogens(mol), 0)).toBe(1);
  });

  it('adds no hydrogens to alkoxide oxygen or chloride', () => {
    const mol = {
      atoms: [
        { element: 'O', charge: -1, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.4, y: 0, z: 0 },
        { element: 'Cl', charge: -1, x: 4, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
      ],
    };
    const result = fillMissingHydrogens(mol);
    expect(hCount(result, 0)).toBe(0);
    expect(hCount(result, 2)).toBe(0);
  });

  it('adds no hydrogens to a carbanion carbon with three bonds', () => {
    const mol = {
      atoms: [
        { element: 'C', charge: -1, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'C', x: -1.5, y: 0, z: 0 },
        { element: 'C', x: 0, y: 1.5, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
      ],
    };
    expect(hCount(fillMissingHydrogens(mol), 0)).toBe(0);
  });

  it('falls back to the neutral valence for unlisted charge states', () => {
    // C with +2 has no charged-valence entry — keep the old behavior
    // rather than guessing.
    const mol = {
      atoms: [
        { element: 'C', charge: 2, x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'C', x: -1.5, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
      ],
    };
    expect(hCount(fillMissingHydrogens(mol), 0)).toBe(2);
  });

  it('respects a JSME carbocation end to end: M CHG block -> one H on C+', () => {
    // The local path parses the sketch mol block then fills Hs. This is
    // the reported case: a cyclic iminium whose ring CH+ must keep a
    // single hydrogen.
    const jsmeMol = `JME

  5  5  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000   -0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000   -0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2000    0.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  5  2  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  5  1  0  0  0  0
M  CHG  1   2   1
M  END
`;
    const parsed = parseMolBlock(jsmeMol);
    expect(parsed.atoms[1].charge).toBe(1);
    const filled = fillMissingHydrogens(parsed);
    expect(hCount(filled, 1)).toBe(1);
  });
});
