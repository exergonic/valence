import { describe, it, expect } from 'vitest';
import { fillMissingHydrogens } from '../src/hydrogens';

describe('fillMissingHydrogens', () => {
  it('should add 3 hydrogens to a terminal carbon', () => {
    const mol = {
      atoms: [
        { index: 0, element: 'C', x: 0, y: 0, z: 0 },
        { index: 1, element: 'C', x: 1.5, y: 0, z: 0 },
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
        { index: 0, element: 'C', x: 0, y: 0, z: 0 },
        { index: 1, element: 'C', x: 1.5, y: 0, z: 0 },
        { index: 2, element: 'C', x: 3.0, y: 0, z: 0 },
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
        { index: 0, element: 'C', x: 0, y: 0, z: 0 },
        { index: 1, element: 'F', x: 1, y: 0, z: 0 },
        { index: 2, element: 'Cl', x: -1, y: 0, z: 0 },
        { index: 3, element: 'Br', x: 0, y: 1, z: 0 },
        { index: 4, element: 'I', x: 0, y: -1, z: 0 },
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
        { index: 0, element: 'C', x: 0, y: 0, z: 0 },
        { index: 1, element: 'O', x: 1.2, y: 0, z: 0 },
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
        { index: 0, element: 'F', x: 0, y: 0, z: 0 },
        { index: 1, element: 'H', x: 1, y: 0, z: 0 },
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
        { index: 0, element: 'Cl', x: 0, y: 0, z: 0 },
      ],
      bonds: [],
    };
    const result = fillMissingHydrogens(mol);
    const hAtoms = result.atoms.filter((a) => a.element === 'H');
    expect(hAtoms).toHaveLength(1);
  });
});
