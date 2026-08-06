import { describe, it, expect } from 'vitest';
import { refineWithMMFF94, embedAndRefine } from '../src/geometry/mmff-refine';
import { place3D } from '../src/geometry/place3d';
import { parseMolBlock } from '../src/mol-parser';
import { calc_energy } from 'mmff94-ts';
import type { Molecule as MMFFMolecule } from 'mmff94-ts';
import type { Molecule } from '../src/mol-parser';

function placed(molecule: Molecule): Molecule {
  const coords = place3D(molecule);
  return {
    atoms: molecule.atoms.map((a, i) => ({ ...a, x: coords[i][0], y: coords[i][1], z: coords[i][2] })),
    bonds: molecule.bonds,
  };
}

function bondLength(mol: Molecule, i: number, j: number): number {
  const a = mol.atoms[i], b = mol.atoms[j];
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleDeg(mol: Molecule, i: number, j: number, k: number): number {
  const a = mol.atoms[i], b = mol.atoms[j], c = mol.atoms[k];
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const len = Math.hypot(...u) * Math.hypot(...v);
  return (Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180) / Math.PI;
}

function mmffEnergy(mol: Molecule): number {
  const mmff: MMFFMolecule = {
    atoms: mol.atoms.map((a, i) => ({ index: i, element: a.element, x: a.x, y: a.y, z: a.z })),
    bonds: mol.bonds.map((b) => ({ atom1: b.atom1Index, atom2: b.atom2Index, bond_order: b.order })),
  };
  return calc_energy(mmff).total;
}

const ethane: Molecule = {
  atoms: [
    { element: 'C', x: 0, y: 0, z: 0 },
    { element: 'C', x: 1.5, y: 0, z: 0 },
    { element: 'H', x: -0.5, y: 0.8, z: 0 },
    { element: 'H', x: -0.5, y: -0.8, z: 0 },
    { element: 'H', x: 2.0, y: 0.8, z: 0 },
    { element: 'H', x: 2.0, y: -0.8, z: 0 },
    { element: 'H', x: -0.5, y: 0, z: 0 },
    { element: 'H', x: 2.0, y: 0, z: 0 },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 0, atom2Index: 2, order: 1 },
    { atom1Index: 0, atom2Index: 3, order: 1 },
    { atom1Index: 0, atom2Index: 6, order: 1 },
    { atom1Index: 1, atom2Index: 4, order: 1 },
    { atom1Index: 1, atom2Index: 5, order: 1 },
    { atom1Index: 1, atom2Index: 7, order: 1 },
  ],
};

const water: Molecule = {
  atoms: [
    { element: 'O', x: 0, y: 0, z: 0 },
    { element: 'H', x: 1, y: 0, z: 0 },
    { element: 'H', x: -1, y: 0, z: 0 },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 0, atom2Index: 2, order: 1 },
  ],
};

describe('refineWithMMFF94', () => {
  it('relaxes ethane to the reference minimum: total −4.73436 kcal/mol', () => {
    // The obenergy reference for the ethane fixture gives TOTAL =
    // −4.73436 (torsion −4.95900 — the MMFF94 H-C-C-H parameters with
    // their negative V1 make the near-eclipsed geometry the actual
    // minimum; place3D's exactly-linear axial H-C-C angles are the
    // real trap, and the refined geometry must land on the reference
    // energy, not a stalled plateau).
    const refined = refineWithMMFF94(placed(ethane))!;
    expect(refined).not.toBeNull();
    expect(mmffEnergy(refined)).toBeCloseTo(-4.73436, 3);
    expect(bondLength(refined, 0, 1)).toBeGreaterThan(1.45);
    expect(bondLength(refined, 0, 1)).toBeLessThan(1.56);
    for (const h of [2, 3, 6]) {
      expect(bondLength(refined, 0, h)).toBeGreaterThan(1.05);
      expect(bondLength(refined, 0, h)).toBeLessThan(1.15);
    }
  });

  it('lowers the MMFF94 energy of the placed guess', () => {
    const guess = placed(ethane);
    const refined = refineWithMMFF94(guess)!;
    expect(mmffEnergy(refined)).toBeLessThan(mmffEnergy(guess));
  });

  it('embedAndRefine runs the full pipeline (the worker path) to the ethane reference', () => {
    // The exact composition the geometry worker executes: implicit
    // H's (none needed here) -> embedder -> refinement. Must land on
    // the same reference total as the manual placed + refine path.
    const result = embedAndRefine(ethane);
    expect(result.atoms.length).toBe(ethane.atoms.length);
    expect(mmffEnergy(result)).toBeCloseTo(-4.73436, 3);
  });

  it('cyclooctane: the ring embeds as a puckered polygon and refines without overlaps', () => {
    // The case that exposed the embedder's broken ring walk: the
    // zig-zag left the closure meters off and adjacent ring H's at
    // 0.90 Å, and the optimizer ground 361 iterations through the vdW
    // wall. The ring must now seed from the 2D polygon (alternating
    // pucker) and refine to a closed, overlap-free, low-energy ring.
    const cyclo = parseMolBlock(`JME 2024-04-29 Thu Aug 06 13:04:05 GMT-400 2026

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
`);
    const result = embedAndRefine(cyclo);
    expect(result.atoms).toHaveLength(24);
    expect(result.bonds).toHaveLength(24);

    // The ring closed: every C-C bond at the MMFF94 equilibrium.
    for (const b of result.bonds) {
      if (result.atoms[b.atom1Index].element !== 'C' || result.atoms[b.atom2Index].element !== 'C') continue;
      const d = bondLength(result, b.atom1Index, b.atom2Index);
      expect(d).toBeGreaterThan(1.45);
      expect(d).toBeLessThan(1.56);
    }

    // No nonbonded overlaps survived the refinement.
    let minNonbonded = Infinity;
    for (let i = 0; i < result.atoms.length; i++) {
      for (let j = i + 1; j < result.atoms.length; j++) {
        const bonded = result.bonds.some((b) =>
          (b.atom1Index === i && b.atom2Index === j) || (b.atom1Index === j && b.atom2Index === i));
        if (bonded) continue;
        const d = Math.hypot(
          result.atoms[i].x - result.atoms[j].x,
          result.atoms[i].y - result.atoms[j].y,
          result.atoms[i].z - result.atoms[j].z,
        );
        if (d < minNonbonded) minNonbonded = d;
      }
    }
    expect(minNonbonded).toBeGreaterThan(1.2);

    // A low-energy ring minimum (measured 13.73; window for trajectory).
    expect(mmffEnergy(result)).toBeGreaterThan(5);
    expect(mmffEnergy(result)).toBeLessThan(20);
  });

  it('relaxes water: O–H ~0.96 Å, H–O–H ~104.5°', () => {
    const refined = refineWithMMFF94(placed(water))!;
    expect(bondLength(refined, 0, 1)).toBeGreaterThan(0.93);
    expect(bondLength(refined, 0, 1)).toBeLessThan(1.00);
    const hoh = angleDeg(refined, 1, 0, 2);
    expect(hoh).toBeGreaterThan(101);
    expect(hoh).toBeLessThan(108);
  });

  it('returns null for a corrupt bond (index out of range)', () => {
    const broken: Molecule = {
      atoms: [{ element: 'C', x: 0, y: 0, z: 0 }],
      bonds: [{ atom1Index: 0, atom2Index: 5, order: 1 }],
    };
    expect(refineWithMMFF94(broken)).toBeNull();
  });

  it('returns null when the refinement produces non-finite coordinates', () => {
    const nanMol: Molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: NaN, y: 0, z: 0 },
      ],
      bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }],
    };
    expect(refineWithMMFF94(nanMol)).toBeNull();
  });

  it('is a safe no-op for molecules mmff94 cannot type (Ar)', () => {
    const argon: Molecule = {
      atoms: [{ element: 'Ar', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    // The optimizer makes no progress (every term evaluates zero), so
    // the caller keeps its own geometry — never a crash, never NaN,
    // never a kicked displacement.
    expect(refineWithMMFF94(argon)).toBeNull();
  });
});
