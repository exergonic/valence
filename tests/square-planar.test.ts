/**
 * The embedder's square-planar start for a low-spin d⁸ metal.
 *
 * Started tetrahedral, [Ni(CN)₄]²⁻ never optimised: a singlet d⁸ ion in a
 * tetrahedral field has four electrons for a triply degenerate t₂ set, GFN2's
 * SCC oscillates there, and the app showed the unoptimised start. The
 * embedder now reads the metal's dⁿ from the sketch and starts a
 * four-coordinate d⁸ singlet square planar; the triplet NiCl₄²⁻ keeps its
 * tetrahedron.
 */
import { describe, expect, it } from 'vitest';
import type { Molecule } from '../src/mol-parser';
import { parseMolBlock } from '../src/mol-parser';
import { dElectronCount } from '../src/chem/d-electron-count';
import { embed3D } from '../src/geometry/embed';
import { EXAMPLES } from '../src/ui/examples';
import { localGeometry } from './helpers/local-geometry';

const example = (name: string): Molecule => {
  const found = EXAMPLES.find((e) => e.name.startsWith(name))!;
  const molecule = parseMolBlock(found.mol);
  return found.multiplicity ? { ...molecule, multiplicity: found.multiplicity } : molecule;
};

/** Every L–M–L angle at the metal, sorted, in degrees. */
function anglesAtMetal(molecule: Molecule): number[] {
  const { atoms, bonds } = molecule;
  const metal = atoms.findIndex((a) => a.element === 'Ni');
  const ligands = bonds.flatMap((b) =>
    b.atom1Index === metal ? [b.atom2Index] : b.atom2Index === metal ? [b.atom1Index] : []);
  const unit = (i: number) => {
    const v = [atoms[i].x - atoms[metal].x, atoms[i].y - atoms[metal].y, atoms[i].z - atoms[metal].z];
    const r = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / r);
  };
  const angles: number[] = [];
  for (let a = 0; a < ligands.length; a++) {
    for (let b = a + 1; b < ligands.length; b++) {
      const [u, v] = [unit(ligands[a]), unit(ligands[b])];
      angles.push((Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) * 180) / Math.PI);
    }
  }
  return angles.sort((p, q) => p - q);
}

const SQUARE = [90, 90, 90, 90, 180, 180];

describe('the d-electron count', () => {
  it('reads Ni(II) as d⁸ drawn ionically: Ni²⁺ with Cl⁻, and with cyanide C⁻', () => {
    expect(dElectronCount(example('Tetrachloronickelate'), 0)).toBe(8);
    expect(dElectronCount(example('Tetracyanonickelate'), 0)).toBe(8);
  });

  it('reads the same d⁸ drawn covalently: Ni²⁻ with four neutral Cl', () => {
    const ionic = example('Tetrachloronickelate');
    const covalent = {
      ...ionic,
      atoms: ionic.atoms.map((a) => ({ ...a, charge: a.element === 'Ni' ? -2 : 0 })),
    };
    expect(dElectronCount(covalent, 0)).toBe(8);
  });

  it('has nothing to say about a main-group atom', () => {
    const pcl5 = example('Phosphorus pentachloride');
    expect(dElectronCount(pcl5, pcl5.atoms.findIndex((a) => a.element === 'P'))).toBeNull();
  });
});

describe('the embedder', () => {
  it('starts singlet [Ni(CN)₄]²⁻ square planar', () => {
    anglesAtMetal(embed3D(example('Tetracyanonickelate')).separated)
      .forEach((angle, k) => expect(angle).toBeCloseTo(SQUARE[k], 3));
  });

  it('starts triplet NiCl₄²⁻ tetrahedral', () => {
    for (const angle of anglesAtMetal(embed3D(example('Tetrachloronickelate')).separated)) {
      expect(angle).toBeCloseTo(109.47, 1);
    }
  });

  it('optimises [Ni(CN)₄]²⁻ with GFN2 from its sketch, square planar', async () => {
    const local = await localGeometry(example('Tetracyanonickelate'));
    expect(local?.engine).toBe('gfn2');
    expect(local!.gfn2!.converged).toBe(true);
    anglesAtMetal(local!.molecule).forEach((angle, k) => expect(Math.abs(angle - SQUARE[k])).toBeLessThan(3));
  }, 120_000);
});
