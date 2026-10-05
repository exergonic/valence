// The 3-ring pucker report: MMFF94 has no reference angle for a trigonal ring
// carbon's substituent, so its minimum puckers the exocyclic bonds out of the
// ring plane (cyclopropenyl cation: all C–H ~54° out — measured 2026-09-28).
// The geometry correction that used to live in the pipeline was removed
// 2026-10-02 (the engines own the geometry); what remains is this report, so
// the artifact is never shown without comment. The sp² test is the
// charge-aware one from chem/vsepr/hybridize: cyclopropane's CH₂ and a 3-ring
// carbanion C⁻ keep their real out-of-plane geometry and are never flagged.
import { describe, it, expect } from 'vitest';
import type { Molecule } from '../src/mol-parser';
import { parseMolBlock } from '../src/mol-parser';
import { ringPuckerWarnings } from '../src/geometry/ring-pucker';
import { mmff94Conformer } from './helpers/local-geometry';

/** Equilateral C3 ring in the xy-plane; one exocyclic H per carbon, lifted to
 *  the given out-of-plane heights (Å). Synthetic, for the classifier only. */
const ringWithHs = (heights: [number, number, number], charge?: number): Molecule => ({
  atoms: [
    { element: 'C', ...(charge !== undefined ? { charge } : {}), x: 0, y: 0.7, z: 0 },
    { element: 'C', x: 0.6062, y: -0.35, z: 0 },
    { element: 'C', x: -0.6062, y: -0.35, z: 0 },
    { element: 'H', x: 0, y: 1.78, z: heights[0] },
    { element: 'H', x: 1.54, y: -0.89, z: heights[1] },
    { element: 'H', x: -1.54, y: -0.89, z: heights[2] },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 1, atom2Index: 2, order: 1 },
    { atom1Index: 2, atom2Index: 0, order: 1 },
    { atom1Index: 0, atom2Index: 3, order: 1 },
    { atom1Index: 1, atom2Index: 4, order: 1 },
    { atom1Index: 2, atom2Index: 5, order: 1 },
  ],
});

/** Cyclopropane-like: every ring carbon carries TWO exocyclic H's (4 σ → sp³),
 *  both lifted out of the plane — the geometry is real and must stay silent. */
const cyclopropaneLike = (): Molecule => ({
  atoms: [
    { element: 'C', x: 0, y: 0.7, z: 0 },
    { element: 'C', x: 0.6062, y: -0.35, z: 0 },
    { element: 'C', x: -0.6062, y: -0.35, z: 0 },
    { element: 'H', x: 0, y: 1.78, z: 0.9 },
    { element: 'H', x: 0, y: 0.35, z: -0.9 },
    { element: 'H', x: 1.54, y: -0.89, z: 0.9 },
    { element: 'H', x: 0.6062, y: -1.5, z: -0.9 },
    { element: 'H', x: -1.54, y: -0.89, z: 0.9 },
    { element: 'H', x: -0.6062, y: -1.5, z: -0.9 },
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
});

describe('ringPuckerWarnings', () => {
  it('reports a puckered trigonal ring centre', () => {
    expect(ringPuckerWarnings(ringWithHs([0.9, 0.9, 0.9]))).toHaveLength(1);
    expect(ringPuckerWarnings(ringWithHs([0.9, 0.9, 0.9]))[0]).toContain('3-ring');
  });

  it('is silent for a planar ring', () => {
    expect(ringPuckerWarnings(ringWithHs([0, 0, 0]))).toEqual([]);
  });

  it('never flags a 3-ring carbanion (sp³, its pyramid is real)', () => {
    // The carbanion's H is 0.9 Å out of plane; the other two centres are flat.
    expect(ringPuckerWarnings(ringWithHs([0.9, 0, 0], -1))).toEqual([]);
  });

  it('never flags cyclopropane-like sp³ centres (their tilt is real)', () => {
    expect(ringPuckerWarnings(cyclopropaneLike())).toEqual([]);
  });

  it('reports the MMFF94 cyclopropenyl cation geometry end-to-end', async () => {
    // The suite's planar cyclopropenyl cation sketch; MMFF94's minimum
    // puckers all three C–H's out of the ring plane (measured 0.85–1.00 Å).
    // The app optimises with GFN2 now, but a fetched PubChem conformer is an
    // MMFF94 one, which is what this check guards.
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
    expect(ringPuckerWarnings(await mmff94Conformer(mol))).toHaveLength(1);
  });
});
