/**
 * A bond drawn to an alkali metal is ionic in the VSEPR picture: the metal
 * gives the atom it touches its electron, and the contact is no electron
 * domain (assign-orbitals.ts, asked for 2026-10-20).
 *
 * NaOH is the Fortran xtb oracle's GFN2 minimum (lenovo ~/naoh, `--ohess
 * vtight`; bent 155°, as Valence's own run); the others are drawn as on the
 * sketcher page and put through the builder.
 */
import { describe, expect, it } from 'vitest';
import type { Atom, Molecule } from '../src/mol-parser';
import { assignOrbitals, electronDomainCounts } from '../src/chem/vsepr/assign-orbitals';
import { anionLonePairDirections } from '../src/chem/vsepr/orient-lone-pairs';
import { embed3D } from '../src/geometry/embed';

const NAOH: Molecule = {
  atoms: [
    { element: 'Na', x: 0.2131748, y: 0.0226167, z: -0.0954598 },
    { element: 'O', x: 1.9959748, y: 0.0100149, z: 0.2257780 },
    { element: 'H', x: 2.7720367, y: -0.0002562, z: 0.7811393 },
  ],
  bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }, { atom1Index: 1, atom2Index: 2, order: 1 }],
};

/** Atoms drawn in a row, bonded in that order, as a sketch. */
function chain(elements: string[]): Molecule {
  const atoms: Atom[] = elements.map((element, k) => ({ element, x: 1.3 * k, y: 0, z: 0 }));
  return { atoms, bonds: elements.slice(1).map((_, k) => ({ atom1Index: k, atom2Index: k + 1, order: 1 })) };
}

describe('a bond to an alkali metal is ionic', () => {
  it("NaOH's O is hydroxide: one bond, three lone pairs, sp³", () => {
    const o = assignOrbitals(NAOH)[1];
    expect(o.hybridization).toBe('sp³');
    expect(o.lonePairs).toBe(3);
    expect(electronDomainCounts(NAOH)[1]).toBe(4);
  });

  it("NaCl's Cl and Li₂O's O are bare anions with four lone pairs", () => {
    const nacl = embed3D(chain(['Na', 'Cl'])).separated;
    expect(assignOrbitals(nacl)[1].lonePairs).toBe(4);
    const li2o = embed3D(chain(['Li', 'O', 'Li'])).separated;
    expect(assignOrbitals(li2o)[1].lonePairs).toBe(4);
  });

  it('a bare anion points one lone pair at its cation, the rest tetrahedral', () => {
    const directions = anionLonePairDirections([[2.4, 0, 0]], 4);
    expect(directions).toHaveLength(4);
    expect(directions[0][0]).toBeCloseTo(1);
    for (const d of directions.slice(1)) expect(d[0]).toBeCloseTo(-1 / 3, 5);
  });

  it('a transition-metal ligand still donates a pair: NiCl₄²⁻ keeps its Ni–Cl domains', () => {
    // the donor-bond rule is untouched — only alkali metals are ionic
    const cl = assignOrbitals(embed3D(chain(['Ni', 'Cl'])).separated)[1];
    expect(cl.lonePairs).toBe(3);
  });
});
