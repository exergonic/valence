/**
 * The builder's start for a centre with lone pairs: the bond directions of its
 * AXₘEₙ shape, lone pairs counted as electron domains.
 *
 * Counted by neighbours alone, the builder started water linear, SF₄
 * tetrahedral and ClF₃ trigonal planar — and GFN2 found a flat stationary
 * point for ClF₃ there, 15 kcal/mol above the T-shape, and stayed. Each sketch
 * here is drawn as a user draws it: the central atom with its ligands in a
 * flat star, the hydrogens a sketch would carry.
 */
import { describe, expect, it } from 'vitest';
import type { Atom, Molecule } from '../src/mol-parser';
import { embed3D } from '../src/geometry/embed';
import { localGeometry } from './helpers/local-geometry';

/** A centre and its ligands drawn as a flat star, as on the sketcher page. */
function star(centre: string, ligands: string[], charge = 0): Molecule {
  const atoms: Atom[] = [{ element: centre, x: 0, y: 0, z: 0, ...(charge ? { charge } : {}) }];
  ligands.forEach((element, k) => {
    const turn = (2 * Math.PI * k) / ligands.length;
    atoms.push({ element, x: 1.3 * Math.cos(turn), y: 1.3 * Math.sin(turn), z: 0 });
  });
  return { atoms, bonds: ligands.map((_, k) => ({ atom1Index: 0, atom2Index: k + 1, order: 1 })) };
}

/** Every ligand–centre–ligand angle at atom 0, sorted, in degrees. */
function anglesAtCentre(molecule: Molecule): number[] {
  const { atoms, bonds } = molecule;
  const ligands = bonds.flatMap((b) => (b.atom1Index === 0 ? [b.atom2Index] : b.atom2Index === 0 ? [b.atom1Index] : []));
  const unit = (i: number) => {
    const v = [atoms[i].x - atoms[0].x, atoms[i].y - atoms[0].y, atoms[i].z - atoms[0].z];
    const r = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / r);
  };
  const angles: number[] = [];
  for (let a = 0; a < ligands.length; a++) {
    for (let b = a + 1; b < ligands.length; b++) {
      const [u, v] = [unit(ligands[a]), unit(ligands[b])];
      angles.push((Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * 180) / Math.PI);
    }
  }
  return angles.sort((x, y) => x - y);
}

const TETRAHEDRAL = (180 / Math.PI) * Math.acos(-1 / 3);
const startAngles = (molecule: Molecule) => anglesAtCentre(embed3D(molecule).separated);

describe('the builder counts lone pairs as electron domains', () => {
  const cases: [string, Molecule, number[]][] = [
    ['H₂O, AX₂E₂: bent', star('O', ['H', 'H']), [TETRAHEDRAL]],
    ['NH₃, AX₃E: pyramidal', star('N', ['H', 'H', 'H']), [TETRAHEDRAL, TETRAHEDRAL, TETRAHEDRAL]],
    ['SnCl₂, AX₂E: bent', star('Sn', ['Cl', 'Cl']), [120]],
    ['SF₄, AX₄E: seesaw, the lone pair equatorial', star('S', ['F', 'F', 'F', 'F']), [90, 90, 90, 90, 120, 180]],
    ['ClF₃, AX₃E₂: T-shaped', star('Cl', ['F', 'F', 'F']), [90, 90, 180]],
    ['XeF₂, AX₂E₃: linear', star('Xe', ['F', 'F']), [180]],
    ['I₃⁻, AX₂E₃: linear', star('I', ['I', 'I'], -1), [180]],
    ['BrF₅, AX₅E: square pyramidal', star('Br', ['F', 'F', 'F', 'F', 'F']), [90, 90, 90, 90, 90, 90, 90, 90, 180, 180]],
    ['XeF₄, AX₄E₂: square planar, the lone pairs trans', star('Xe', ['F', 'F', 'F', 'F']), [90, 90, 90, 90, 180, 180]],
    ['ICl₄⁻, AX₄E₂: square planar', star('I', ['Cl', 'Cl', 'Cl', 'Cl'], -1), [90, 90, 90, 90, 180, 180]],
    ['PCl₅, AX₅: trigonal bipyramidal, as before', star('P', ['Cl', 'Cl', 'Cl', 'Cl', 'Cl']), [90, 90, 90, 90, 90, 90, 120, 120, 120, 180]],
  ];
  for (const [name, molecule, expected] of cases) {
    it(name, () => {
      startAngles(molecule).forEach((angle, k) => expect(angle).toBeCloseTo(expected[k], 3));
    });
  }

  it('starts a lone pair beside a π system trigonal, as the p orbital it becomes (formamide N)', () => {
    // H–N(H)–C(=O)H: the amide N's pair is conjugated, and the N is planar
    const formamide: Molecule = {
      atoms: [
        { element: 'N', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.3, y: 0, z: 0 },
        { element: 'O', x: 1.95, y: 1.13, z: 0 },
        { element: 'H', x: -0.65, y: 1.13, z: 0 },
        { element: 'H', x: -0.65, y: -1.13, z: 0 },
        { element: 'H', x: 1.95, y: -1.13, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 1, atom2Index: 2, order: 2 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 4, order: 1 },
        { atom1Index: 1, atom2Index: 5, order: 1 },
      ],
    };
    startAngles(formamide).forEach((angle) => expect(angle).toBeCloseTo(120, 3));
  });
});

describe('GFN2 from the lone-pair-aware start', () => {
  it('reaches T-shaped ClF₃, not the flat stationary point', async () => {
    const local = await localGeometry(star('Cl', ['F', 'F', 'F']));
    expect(local?.engine).toBe('gfn2');
    expect(local!.gfn2!.converged).toBe(true);
    const [a, b, c] = anglesAtCentre(local!.molecule);
    expect(a).toBeLessThan(90);
    expect(b).toBeLessThan(90);
    expect(c).toBeGreaterThan(160);
  }, 120_000);

  it('reaches square-planar ICl₄⁻', async () => {
    const local = await localGeometry(star('I', ['Cl', 'Cl', 'Cl', 'Cl'], -1));
    expect(local?.engine).toBe('gfn2');
    expect(local!.gfn2!.converged).toBe(true);
    anglesAtCentre(local!.molecule).forEach((angle, k) =>
      expect(Math.abs(angle - [90, 90, 90, 90, 180, 180][k])).toBeLessThan(3));
  }, 120_000);
});
