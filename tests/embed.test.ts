// The starting structure: the embedder at covalent bond lengths, the overlap
// pre-pass, and the symmetry kick. It is what the GFN2 optimiser starts from,
// and what the app shows when that optimisation produces nothing — so it has
// to be a sane molecule on its own.
import { describe, it, expect } from 'vitest';
import { breakSymmetry, embed3D, finite } from '../src/geometry/embed';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';

const distance = (mol: Molecule, i: number, j: number) => {
  const a = mol.atoms[i], b = mol.atoms[j];
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};

function angleDeg(mol: Molecule, i: number, j: number, k: number): number {
  const a = mol.atoms[i], b = mol.atoms[j], c = mol.atoms[k];
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const len = Math.hypot(...u) * Math.hypot(...v);
  return (Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180) / Math.PI;
}

describe('embed3D — the starting structure', () => {
  it('starts benzene flat, at covalent lengths, with its hydrogens in the ring plane', () => {
    // The old start puckered every ring by ±0.4, put each ring CH's hydrogen
    // axial (straight up out of the ring), and scaled a unit skeleton by one
    // factor — C–C 2.07 Å, C–H 1.31 Å. GFN2 spent 137 steps (10 s) mostly
    // shrinking and flattening it; from this start it takes 51 (3.5 s).
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Benzene'))!.mol);
    const { separated } = embed3D(sketch);
    expect(separated.atoms).toHaveLength(12);
    const carbons = separated.atoms.map((a, i) => i).filter((i) => separated.atoms[i].element === 'C');
    // every atom within a few hundredths of one plane: the six carbons' plane
    const [a, b, c] = carbons.map((i) => separated.atoms[i]);
    const u = [b.x - a.x, b.y - a.y, b.z - a.z];
    const v = [c.x - a.x, c.y - a.y, c.z - a.z];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const norm = Math.hypot(...n);
    for (const atom of separated.atoms) {
      const height = ((atom.x - a.x) * n[0] + (atom.y - a.y) * n[1] + (atom.z - a.z) * n[2]) / norm;
      expect(Math.abs(height)).toBeLessThan(0.05);
    }
    for (const bond of separated.bonds) {
      const length = distance(separated, bond.atom1Index, bond.atom2Index);
      const pair = [separated.atoms[bond.atom1Index].element, separated.atoms[bond.atom2Index].element].sort().join('');
      if (pair === 'CC') { expect(length).toBeGreaterThan(1.25); expect(length).toBeLessThan(1.6); }
      if (pair === 'CH') { expect(length).toBeGreaterThan(1.0); expect(length).toBeLessThan(1.15); }
    }
  });

  it('phosphorus pentachloride: a trigonal bipyramid, never NaN (2026-08-12)', () => {
    // The PCl5 report: the 5th substituent wrapped onto the 1st (only 4 TETRA
    // vectors existed for count >= 4), the coincident atoms made the overlap
    // pass divide by zero, and the NaN molecule reached the renderer. Now the
    // embedder emits the sp³d trigonal bipyramid and the pass nudges
    // coincident atoms along x.
    const pcl5 = parseMolBlock(`JME 2024-04-29 Wed Aug 12 18:37:58 GMT-400 2026

  6  5  0  0  0  0  0  0  0  0999 V2000
    1.2124    1.4000    0.0000 P   0  0  0  0  0  0  0  0  0  0  0  0
    2.4248    0.7000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.8000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.7000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.1000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
M  END
`);
    const { separated } = embed3D(pcl5);
    expect(separated.atoms).toHaveLength(6);
    expect(finite(separated)).toBe(true);
    // five P–Cl bonds at the covalent-radius sum, 2.09 Å
    for (let i = 1; i <= 5; i++) expect(distance(separated, 0, i)).toBeCloseTo(2.09, 1);
    const angles: number[] = [];
    for (let i = 1; i <= 5; i++) for (let j = i + 1; j <= 5; j++) angles.push(angleDeg(separated, i, 0, j));
    expect(angles.filter((a) => a > 170)).toHaveLength(1); // the axial pair
    expect(angles.filter((a) => Math.abs(a - 120) < 2)).toHaveLength(3); // the equatorial triangle
    expect(angles.filter((a) => Math.abs(a - 90) < 2)).toHaveLength(6); // axial–equatorial
  });
});

describe('breakSymmetry', () => {
  // Water as the embedder emits it: exactly linear on ±x.
  const linearWater: Molecule = {
    atoms: [
      { element: 'O', x: 0, y: 0, z: 0 },
      { element: 'H', x: 0.97, y: 0, z: 0 },
      { element: 'H', x: -0.97, y: 0, z: 0 },
    ],
    bonds: [
      { atom1Index: 0, atom2Index: 1, order: 1 },
      { atom1Index: 0, atom2Index: 2, order: 1 },
    ],
  };

  it('breaks an exactly-linear start with a bounded nudge', () => {
    const kicked = breakSymmetry(linearWater);
    // The 180° saddle is gone — by a nudge, not a rebuild.
    const bent = angleDeg(kicked, 1, 0, 2);
    expect(bent).toBeLessThan(180);
    expect(bent).toBeGreaterThan(170);
    // Acyclic molecules get the 0.05 Å kick: no atom travels far.
    for (let i = 0; i < kicked.atoms.length; i++) {
      const a = kicked.atoms[i], b = linearWater.atoms[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
    }
  });

  it('is deterministic and leaves the input untouched', () => {
    const a = breakSymmetry(linearWater);
    const b = breakSymmetry(linearWater);
    expect(a).toEqual(b);
    // The input still sits exactly linear — the kick copies.
    expect(angleDeg(linearWater, 1, 0, 2)).toBe(180);
  });
});
