import { describe, it, expect } from 'vitest';
import {
  atomicNumber, period, isMetal, showsOnlyValenceS, valenceSOrbital, lowestMultiplicity,
} from '../src/chem/elements';
import { assignHybridization } from '../src/chem/vsepr/hybridize';
import { assignOrbitals, isVseprElement } from '../src/chem/vsepr/assign-orbitals';
import { parseMolBlock } from '../src/mol-parser';

describe('the elements', () => {
  it('numbers and rows them', () => {
    expect(atomicNumber('H')).toBe(1);
    expect(atomicNumber('Ni')).toBe(28);
    expect(atomicNumber('Rn')).toBe(86);
    expect(atomicNumber('Zz')).toBe(0);
    expect(period('H')).toBe(1);
    expect(period('Ni')).toBe(4);
    expect(period('Ce')).toBe(6);
    expect(valenceSOrbital('Ni')).toBe('4s');
    expect(valenceSOrbital('Pt')).toBe('6s');
  });

  it('gives the lowest spin the electron count allows', () => {
    // water: 10 electrons, a singlet; H3Si–Ni: Σ Z = 45, odd, a doublet
    expect(lowestMultiplicity([{ element: 'O' }, { element: 'H' }, { element: 'H' }])).toBe(1);
    expect(lowestMultiplicity([{ element: 'Si' }, { element: 'H' }, { element: 'H' }, { element: 'H' }, { element: 'Ni' }])).toBe(2);
    // a charge changes the count: NH4+ is even, CH3− even, CH3 (radical) odd
    expect(lowestMultiplicity([{ element: 'N', charge: 1 }, ...Array(4).fill({ element: 'H' })])).toBe(1);
    expect(lowestMultiplicity([{ element: 'C' }, ...Array(3).fill({ element: 'H' })])).toBe(2);
    expect(lowestMultiplicity([{ element: 'C', charge: -1 }, ...Array(3).fill({ element: 'H' })])).toBe(1);
  });

  it('shows only the valence s for transition and alkali metals, VSEPR for the rest of the main group', () => {
    for (const el of ['Sc', 'Ni', 'Zn', 'Pd', 'Ce', 'Lu', 'Pt', 'Hg', 'Na', 'Cs']) {
      expect(showsOnlyValenceS(el), el).toBe(true);
      expect(isVseprElement(el), el).toBe(false);
    }
    for (const el of ['Be', 'Mg', 'Al', 'Sn', 'Pb', 'Bi', 'Ge', 'Te', 'Xe', 'C']) {
      expect(showsOnlyValenceS(el), el).toBe(false);
      expect(isVseprElement(el), el).toBe(true);
    }
    expect(isMetal('Sn')).toBe(true);
    expect(isMetal('Xe')).toBe(false);
    expect(isMetal('Si')).toBe(false);
  });

  it('counts the textbook VSEPR shapes of main-group metals and noble gases', () => {
    expect(assignHybridization('Xe', 4).geometry).toBe('octahedral'); // XeF4: 4 σ + 2 lone pairs
    expect(assignHybridization('Xe', 2).geometry).toBe('trigonal_bipyramidal'); // XeF2: 2 σ + 3
    expect(assignHybridization('Be', 2).hybridization).toBe('sp'); // BeCl2, linear
    expect(assignHybridization('Sn', 2).hybridization).toBe('sp2'); // SnCl2: 2 σ + 1 lone pair, bent
    expect(assignHybridization('Bi', 3).hybridization).toBe('sp3'); // BiCl3: pyramidal
  });

  it('gives a transition metal its valence s and no hybrids (H3Si–Ni as CIR built it)', () => {
    const cir = parseMolBlock(`H3NiSi
  cir

  5  4  0  0  0  0  0  0  0  0999 V2000
   -1.6773    0.0000    0.0000 Si  0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723   -1.3998    0.0289 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723    0.6749   -1.2267 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723    0.7249    1.1978 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.9147    0.0000    0.0000 Ni  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`);
    const orbitals = assignOrbitals(cir);
    expect(orbitals[4].described).toBe(false);
    expect(orbitals[4].valenceS).toBe('4s');
    // the Si–Ni bond is the silicon's fourth σ pair: sp³
    expect(orbitals[0].described).toBe(true);
    expect(orbitals[0].valenceS).toBeNull();
    expect(orbitals[0].hybridization).toBe('sp³');
  });
});
