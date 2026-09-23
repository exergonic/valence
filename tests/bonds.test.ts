import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bondCylinders, bondPerpendicular } from '../src/render/bonds';
import type { Atom, Bond } from '../src/mol-parser';

const R = 0.1;

function atom(element: string, x: number, y: number, z = 0): Atom {
  return { element, x, y, z };
}

describe('bondCylinders', () => {
  it('a single bond is one cylinder on the axis', () => {
    expect(bondCylinders(1, R)).toEqual([{ offset: 0, radius: R }]);
  });

  it('a double bond is a symmetric pair of thinner cylinders', () => {
    const cylinders = bondCylinders(2, R);
    expect(cylinders).toHaveLength(2);
    expect(cylinders[0].offset).toBeCloseTo(-cylinders[1].offset, 10);
    expect(cylinders[0].offset).not.toBe(0);
    for (const cylinder of cylinders) expect(cylinder.radius).toBeLessThan(R);
  });

  it('a triple bond is three cylinders, one on the axis', () => {
    const cylinders = bondCylinders(3, R);
    expect(cylinders).toHaveLength(3);
    expect(cylinders.filter((c) => c.offset === 0)).toHaveLength(1);
    expect(cylinders.map((c) => c.offset)).toEqual([-1.5 * R, 0, 1.5 * R]);
  });

  it('an unrecognized order falls back to a single cylinder', () => {
    // 4 is the MOL aromatic bond type; 0 is malformed input
    expect(bondCylinders(4, R)).toEqual([{ offset: 0, radius: R }]);
    expect(bondCylinders(0, R)).toEqual([{ offset: 0, radius: R }]);
  });
});

describe('bondPerpendicular', () => {
  const axis = new THREE.Vector3(1, 0, 0);
  // Planar fixture: a double bond along x, its neighbour in the xy plane
  const planarAtoms = [atom('C', 0, 0), atom('C', 1.4, 0), atom('H', -0.7, 1.2)];
  const planarBonds: Bond[] = [
    { atom1Index: 0, atom2Index: 1, order: 2 },
    { atom1Index: 0, atom2Index: 2, order: 1 },
  ];

  it('is perpendicular to the bond axis and unit length', () => {
    const perpendicular = bondPerpendicular(planarAtoms, planarBonds, planarBonds[0], axis);
    expect(Math.abs(perpendicular.dot(axis))).toBeLessThan(1e-9);
    expect(perpendicular.length()).toBeCloseTo(1, 10);
  });

  it('lies in the plane of the neighbouring bond', () => {
    // The second line of a double bond must sit in the molecular plane, so the
    // component out of that plane (z here) has to vanish.
    const perpendicular = bondPerpendicular(planarAtoms, planarBonds, planarBonds[0], axis);
    expect(Math.abs(perpendicular.z)).toBeLessThan(1e-9);
    expect(Math.abs(perpendicular.y)).toBeCloseTo(1, 6);
  });

  it('falls back to any perpendicular when the neighbours are collinear', () => {
    // Acetylene-like: the only neighbour of C0 lies along the bond axis
    const atoms = [atom('C', 0, 0), atom('C', 1.2, 0), atom('H', -1.06, 0)];
    const bonds: Bond[] = [
      { atom1Index: 0, atom2Index: 1, order: 3 },
      { atom1Index: 0, atom2Index: 2, order: 1 },
    ];
    const perpendicular = bondPerpendicular(atoms, bonds, bonds[0], axis);
    expect(Math.abs(perpendicular.dot(axis))).toBeLessThan(1e-9);
    expect(perpendicular.length()).toBeCloseTo(1, 10);
  });
});
