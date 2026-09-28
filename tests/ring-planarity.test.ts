// The 3-ring planarity restore: MMFF94 has no reference angle for a
// trigonal center's substituent inside a 3-membered ring, so its minimum
// puckers the exocyclic bonds out of the ring plane (the cyclopropenyl
// cation's C–H's land ~54° out — measured 2026-09-28). The puckered ring is
// a parameterization artifact; the chemistry is planar. restoreThreeRingPlanarity
// (src/geometry/ring-planarity.ts) projects sp² ring atoms' exocyclic
// neighbors back into the ring plane — and leaves sp³ ring atoms (cyclopropane
// CH₂, a carbanion C⁻) alone, since their out-of-plane geometry is real.
import { describe, it, expect } from 'vitest';
import type { Molecule } from '../src/mol-parser';
import { restoreThreeRingPlanarity } from '../src/geometry/ring-planarity';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { parseMolBlock } from '../src/mol-parser';

/** Equilateral ring in the xy-plane; each C–H lifted well out of it. */
const pyramidalRing = (cation: boolean): Molecule => ({
  atoms: [
    { element: 'C', ...(cation ? { charge: 1 } : {}), x: 0, y: 0, z: 0 },
    { element: 'C', x: 1.2, y: 0, z: 0 },
    { element: 'C', x: 0.6, y: 1.03923, z: 0 },
    { element: 'H', x: 0.5, y: 0.3, z: 0.9 },
    { element: 'H', x: 1.45, y: 0.5, z: 1.0 },
    { element: 'H', x: 0.1, y: 0.8, z: 0.9 },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 1, atom2Index: 2, order: 1 },
    { atom1Index: 2, atom2Index: 0, order: 2 },
    { atom1Index: 0, atom2Index: 3, order: 1 },
    { atom1Index: 1, atom2Index: 4, order: 1 },
    { atom1Index: 2, atom2Index: 5, order: 1 },
  ],
});

/** Distance of an atom from the plane through three ring carbons. */
const ringPlaneDistance = (m: Molecule, idx: number): number => {
  const [c0, c1, c2] = [0, 1, 2].map((i) => m.atoms[i]);
  const cx = (c0.x + c1.x + c2.x) / 3, cy = (c0.y + c1.y + c2.y) / 3, cz = (c0.z + c1.z + c2.z) / 3;
  let nx = 0, ny = 0, nz = 0;
  for (const [p, q] of [[c0, c1], [c1, c2], [c2, c0]] as const) {
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  const n = Math.hypot(nx, ny, nz);
  const a = m.atoms[idx];
  return Math.abs((nx * (a.x - cx) + ny * (a.y - cy) + nz * (a.z - cz)) / n);
};

describe('restoreThreeRingPlanarity', () => {
  it('flattens the exocyclic H of every sp² ring carbon in the cyclopropenyl cation', () => {
    const m = restoreThreeRingPlanarity(pyramidalRing(true));
    // Green: the hydrogens are back in the ring plane.
    for (let h = 3; h < 6; h++) expect(ringPlaneDistance(m, h)).toBeLessThan(1e-6);
    // The carbon ring itself was already flat (three points) and stays put.
    expect(m.atoms[0].x).toBeCloseTo(0, 6);
  });

  it('keeps the C–H bond length while flattening', () => {
    const before = pyramidalRing(true);
    const after = restoreThreeRingPlanarity(before);
    for (let h = 3; h < 6; h++) {
      const c = before.bonds.find((b) => b.atom1Index === h || b.atom2Index === h)!.atom1Index === h
        ? before.bonds.find((b) => b.atom1Index === h || b.atom2Index === h)!.atom2Index
        : before.bonds.find((b) => b.atom1Index === h || b.atom2Index === h)!.atom1Index;
      const lenB = Math.hypot(before.atoms[h].x - before.atoms[c].x, before.atoms[h].y - before.atoms[c].y, before.atoms[h].z - before.atoms[c].z);
      const lenA = Math.hypot(after.atoms[h].x - after.atoms[c].x, after.atoms[h].y - after.atoms[c].y, after.atoms[h].z - after.atoms[c].z);
      expect(lenA).toBeCloseTo(lenB, 6);
    }
  });

  it('leaves sp³ ring atoms untouched (cyclopropane CH₂ keeps its tilt)', () => {
    const cyclopropaneM = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.2, y: 0, z: 0 },
        { element: 'C', x: 0.6, y: 1.03923, z: 0 },
        { element: 'H', x: 0.4, y: 0.3, z: 0.6 },
        { element: 'H', x: -0.3, y: -0.2, z: -0.5 },
        { element: 'H', x: 1.2, y: 0.5, z: 0.6 },
        { element: 'H', x: 1.2, y: -0.5, z: -0.6 },
        { element: 'H', x: 0.6, y: 0.839, z: 0.6 },
        { element: 'H', x: 0.6, y: 1.239, z: -0.6 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 1, atom2Index: 2, order: 1 },
        { atom1Index: 2, atom2Index: 0, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
        { atom1Index: 1, atom2Index: 5, order: 1 },
        { atom1Index: 1, atom2Index: 6, order: 1 },
        { atom1Index: 2, atom2Index: 7, order: 1 },
        { atom1Index: 2, atom2Index: 8, order: 1 },
      ],
    };
    // All ring atoms are sp³ → nothing moves, and the no-op returns the same
    // object (the caller's reference stays valid).
    const out = restoreThreeRingPlanarity(cyclopropaneM);
    expect(out).toBe(cyclopropaneM);
  });

  it('flattens cyclopropene\'s two sp² carbons but leaves its sp³ CH₂ alone', () => {
    // C0(–) and C2(=) are the alkene carbons (one H each); C1 is the CH₂
    // with TWO exocyclic H's — 4 σ bonds → sp³ → its H's stay out of plane.
    const cyclopropene: Molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.2, y: 0, z: 0 },
        { element: 'C', x: 0.6, y: 1.03923, z: 0 },
        { element: 'H', x: 0.5, y: 0.3, z: 0.9 },   // H on C0 (alkene)
        { element: 'H', x: 1.4, y: -0.3, z: 0.8 },  // H on C1 (CH₂, up)
        { element: 'H', x: 1.0, y: 0.3, z: -0.8 },  // H on C1 (CH₂, down)
        { element: 'H', x: 0.1, y: 0.8, z: 0.9 },   // H on C2 (alkene)
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 1, atom2Index: 2, order: 1 },
        { atom1Index: 2, atom2Index: 0, order: 2 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 1, atom2Index: 4, order: 1 },
        { atom1Index: 1, atom2Index: 5, order: 1 },
        { atom1Index: 2, atom2Index: 6, order: 1 },
      ],
    };
    const out = restoreThreeRingPlanarity(cyclopropene);
    // The alkene H's (3, 6) flatten into the ring plane.
    expect(ringPlaneDistance(out, 3)).toBeLessThan(1e-6);
    expect(ringPlaneDistance(out, 6)).toBeLessThan(1e-6);
    // The CH₂ H's (4, 5) keep their out-of-plane positions.
    expect(ringPlaneDistance(out, 4)).toBeGreaterThan(0.5);
    expect(ringPlaneDistance(out, 5)).toBeGreaterThan(0.5);
  });

  it('is a no-op for a molecule with no 3-ring', () => {
    const methane: Molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'H', x: 0, y: 0, z: 1.09 },
        { element: 'H', x: 1.03, y: 0, z: -0.36 },
        { element: 'H', x: -0.51, y: 0.89, z: -0.36 },
        { element: 'H', x: -0.51, y: -0.89, z: -0.36 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
      ],
    };
    expect(restoreThreeRingPlanarity(methane)).toBe(methane);
  });
});

describe('cyclopropenyl cation end-to-end (local pipeline)', () => {
  it('renders planar even though MMFF94\'s minimum is pyramidal', () => {
    const mol = parseMolBlock(`JME 2024-04-29 Mon Sep 28 09:40:17 GMT-400 2026

  3  3  0  0  0  0  0  0  0  0999 V2000
    1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000    1.2124    0.0000 C   0  3  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  1  2  0  0  0  0
M  CHG  1   2   1
M  END
`);
    const result = embedAndRefine(mol);
    // All three C–H bonds in the ring plane (measured ~54° out BEFORE the
    // planarity restore).
    for (let c = 0; c < 3; c++) {
      expect(ringPlaneDistance(result.molecule, c + 3)).toBeLessThan(1e-6);
    }
  });
});