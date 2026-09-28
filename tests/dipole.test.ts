// The charge-model dipole: MMFF94 BCI partial charges (assign_bci_charges
// from the vendored mmff94-ts) evaluated on the displayed molecule, origin
// at the center of mass, rendered as an arrow from the δ+ end to the δ− end.
//
// The oracle is water. Measured from the vendored BCI parameters
// (2026-09-27): O −0.86, H +0.43 → |μ| ≈ 2.42 D, exactly along the H–O–H
// bisector. The experimental gas-phase value is 1.8546 D; the BCI model
// runs ~30% high because its charges are tuned to work inside MMFF94's
// complete electrostatics (ε = 1, no solvent), not to reproduce water's
// gas-phase dipole on their own. The band below is calibrated to that:
// 1.85 ± 0.6 D covers the model's own 2.42 D output.
import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { computeDipole } from '../src/chem/dipole';

const waterMol = (): Molecule => {
  const ex = EXAMPLES.find((e) => e.name === 'Water (H₂O)');
  if (!ex) throw new Error('water example missing');
  return parseMolBlock(ex.mol);
};

/** Shift every coordinate — what a changed origin (or camera, or embed) does. */
const shifted = (mol: Molecule, t: [number, number, number]): Molecule => ({
  atoms: mol.atoms.map((a) => ({ ...a, x: a.x + t[0], y: a.y + t[1], z: a.z + t[2] })),
  bonds: mol.bonds.map((b) => ({ ...b })),
});

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Acetate CH₃COO⁻ — the wB97X-D3/def2-TZVP geometry (user-provided as an
// Avogadro XYZ; the first hand-drawn fixture had an impossible 87° O–C–O).
// C–C 1.556 Å, both C–O 1.248 Å (resonance), O–C–O 129°, C–H ≈ 1.09 Å.
// The −1 rides as −½ on each oxygen — the honest resonance picture.
// Measured: mmff94-ts types both oxygens 32 (carboxylate) and delocalizes
// to −0.9 each purely from the environment, so a sketcher's full −1 on one
// oxygen gives the bit-for-bit same dipole (three input distributions
// probed 2026-09-28). Atom 2 carries the double bond in the fixture.
const acetateMol = (): Molecule => ({
  atoms: [
    { element: 'C', x: 0.1265363254, y: 0.0000825516, z: 0.0074010725 },
    { element: 'C', x: -1.4291594761, y: 0.0001402320, z: 0.0195583897 },
    { element: 'O', charge: -0.5, x: 0.6643211325, y: 1.1264568822, z: -0.0065289884 },
    { element: 'O', charge: -0.5, x: 0.6637485627, y: -1.1264044937, z: -0.0167066537 },
    { element: 'H', x: -1.7849348399, y: -0.0011747734, z: -1.0159429844 },
    { element: 'H', x: -1.8177454145, y: -0.8964521243, z: 0.5077709340 },
    { element: 'H', x: -1.8180655667, y: 0.8974517401, z: 0.5061474183 },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 0, atom2Index: 2, order: 2 },
    { atom1Index: 0, atom2Index: 3, order: 1 },
    { atom1Index: 1, atom2Index: 4, order: 1 },
    { atom1Index: 1, atom2Index: 5, order: 1 },
    { atom1Index: 1, atom2Index: 6, order: 1 },
  ],
});

describe('dipole — water oracle', () => {
  it('BCI charges land within the calibrated band of the experimental 1.85 D', () => {
    const d = computeDipole(waterMol());
    expect(d).not.toBeNull();
    // The model's own value (pinned 2026-09-27): 2.42 D. The band is the
    // experimental value wide enough for the BCI model's ~30% overshoot.
    expect(d!.debye).toBeGreaterThan(1.85 - 0.6);
    expect(d!.debye).toBeLessThan(1.85 + 0.6);
  });

  it('physics vector lies on the H–O–H bisector, from O toward the H midpoint', () => {
    const mol = waterMol();
    const d = computeDipole(mol)!;
    const o = mol.atoms[0];
    // Bisector of the angle at O, toward the H side (the δ+ end): the
    // direction from O to the H midpoint — the physics vector must agree.
    const midpoint = [
      (mol.atoms[1].x + mol.atoms[2].x) / 2,
      (mol.atoms[1].y + mol.atoms[2].y) / 2,
      (mol.atoms[1].z + mol.atoms[2].z) / 2,
    ];
    const bisector = [midpoint[0] - o.x, midpoint[1] - o.y, midpoint[2] - o.z];
    const n = Math.hypot(...bisector);
    const norm = Math.hypot(...d.physics);
    expect(n).toBeGreaterThan(0);
    expect(norm).toBeGreaterThan(0);
    expect(Math.abs(dot([d.physics[0] / norm, d.physics[1] / norm, d.physics[2] / norm],
      [bisector[0] / n, bisector[1] / n, bisector[2] / n]))).toBeGreaterThan(0.9999);
  });
});

describe('dipole — conventions and behavior', () => {
  it('rendered arrow is −p̂: it points from the δ+ end toward the δ− end', () => {
    const d = computeDipole(waterMol())!;
    const n = Math.hypot(...d.physics);
    expect(d.vector[0]).toBeCloseTo(-d.physics[0] / n, 10);
    expect(d.vector[1]).toBeCloseTo(-d.physics[1] / n, 10);
    expect(d.vector[2]).toBeCloseTo(-d.physics[2] / n, 10);
    // Unit length for the renderer.
    expect(Math.hypot(...d.vector)).toBeCloseTo(1, 10);
  });

  it('a translation leaves the neutral-molecule dipole unchanged', () => {
    const t: [number, number, number] = [0.371, -1.47, 2.138];
    const a = computeDipole(waterMol())!;
    const b = computeDipole(shifted(waterMol(), t))!;
    expect(b.debye).toBeCloseTo(a.debye, 9);
    expect(b.physics[0]).toBeCloseTo(a.physics[0], 9);
    expect(b.physics[1]).toBeCloseTo(a.physics[1], 9);
    expect(b.physics[2]).toBeCloseTo(a.physics[2], 9);
  });

  it('a translation leaves the CHARGED-molecule dipole unchanged — the COM origin is why', () => {
    // For an ion, μ = Σ qᵢ(rᵢ − origin) changes with the origin by
    // q_total·origin; only the center-of-mass origin makes the dipole
    // well-defined. If the origin were (0,0,0) fixed, this shift of an
    // anion would move μ by −1·(2.1, 0.4, −1.3) e·Å.
    const t: [number, number, number] = [2.1, 0.4, -1.3];
    const a = computeDipole(acetateMol())!;
    const b = computeDipole(shifted(acetateMol(), t))!;
    expect(b.debye).toBeCloseTo(a.debye, 9);
  });

  it('acetate: computes a real dipole with the δ− end at the oxygens', () => {
    const d = computeDipole(acetateMol());
    expect(d).not.toBeNull();
    // Measured 2026-09-28 on the Avogadro-relaxed geometry: 4.45 D in −x
    // (the physics vector points from the oxygens toward the positive
    // carbon hub). The band keeps it honest if the fixture geometry ever
    // drifts again.
    expect(d!.debye).toBeGreaterThan(4.0);
    expect(d!.debye).toBeLessThan(5.0);
    expect(d!.physics[0]).toBeLessThan(0);
    expect(d!.vector[0]).toBeGreaterThan(0);
  });

  it('ammonium: computes without error and is symmetric enough to have ~no dipole', () => {
    // User-provided geometry (Avogadro XYZ): N–H 1.022 Å, H–N–H 109.5° —
    // a real ammonium. Symmetry makes the dipole exactly zero: the four
    // H vectors sum to zero and N sits at the center of mass.
    const ammonium: Molecule = {
      atoms: [
        { element: 'N', charge: 1, x: 0, y: 0, z: 0 },
        { element: 'H', x: 0, y: -0.8347246611, z: -0.5901029703 },
        { element: 'H', x: 0, y: 0.8347246611, z: -0.5901029703 },
        { element: 'H', x: -0.8347246611, y: 0, z: 0.5901029703 },
        { element: 'H', x: 0.8347246611, y: 0, z: 0.5901029703 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
      ],
    };
    const d = computeDipole(ammonium);
    expect(d).not.toBeNull();
    expect(Number.isFinite(d!.debye)).toBe(true);
    expect(d!.debye).toBeLessThan(0.05);
  });

  it('an element outside the MMFF94 type space gets no dipole — no arrow, no lie', () => {
    const helium: Molecule = {
      atoms: [{ element: 'He', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    expect(computeDipole(helium)).toBeNull();
  });

  it('an empty molecule gets no dipole either', () => {
    expect(computeDipole({ atoms: [], bonds: [] })).toBeNull();
  });
});