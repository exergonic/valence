/**
 * A molecule's spin multiplicity survives the geometry pipeline.
 *
 * The MOL block has no field for it, so the example sets it on the Molecule —
 * and every step that rebuilt the Molecule from `{ atoms, bonds }` dropped it.
 * The symmetry kick did, so "Refine with GFN2-xTB" ran the triplet NiCl₄²⁻
 * as a singlet, and the singlet's minimum is square planar: the d⁸ ion the
 * example teaches as tetrahedral came back "D2", nearly flat.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { breakSymmetry, embed3D } from '../src/geometry/embed';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { EXAMPLES } from '../src/ui/examples';
import './helpers/local-geometry'; // makes the worker module importable in Node

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));

const example = EXAMPLES.find((e) => e.name.startsWith('Tetrachloronickelate'))!;
const triplet = { ...parseMolBlock(example.mol), multiplicity: example.multiplicity };

describe('the spin multiplicity', () => {
  it('is the example reference calculation: NiCl₄²⁻ is a triplet', () => {
    expect(example.multiplicity).toBe(3);
  });

  it('survives the symmetry kick, the hydrogen fill and the embedder', () => {
    expect(breakSymmetry(triplet).multiplicity).toBe(3);
    expect(fillMissingHydrogens(triplet).multiplicity).toBe(3);
    const { sketch, placed, separated } = embed3D(triplet);
    expect([sketch, placed, separated].map((m) => m.multiplicity)).toEqual([3, 3, 3]);
  });

  it('keeps triplet NiCl₄²⁻ tetrahedral when the example is refined', async () => {
    // what "Refine with GFN2-xTB" does: kick the displayed structure, optimise.
    // Run as a singlet, this start goes to Cl–Ni–Cl 165.7° and 90.8°.
    const { optimizeWithGfn2 } = await import('../src/geometry/gfn2-refine.worker');
    const refined = await optimizeWithGfn2(breakSymmetry(triplet), vendorFile);
    expect(refined?.converged).toBe(true);
    expect(refined!.molecule.multiplicity).toBe(3);
    // Every Cl–Ni–Cl angle near the tetrahedral 109.5° (ORCA's Jahn–Teller
    // C3v minimum: 106.5° and 112.3°), none near the square plane's 90° or 180°
    const atoms = refined!.molecule.atoms;
    const ni = atoms.findIndex((a) => a.element === 'Ni');
    const cl = atoms.flatMap((a, i) => (a.element === 'Cl' ? [i] : []));
    const unit = (i: number) => {
      const v = [atoms[i].x - atoms[ni].x, atoms[i].y - atoms[ni].y, atoms[i].z - atoms[ni].z];
      const r = Math.hypot(v[0], v[1], v[2]);
      return v.map((c) => c / r);
    };
    for (let a = 0; a < cl.length; a++) {
      for (let b = a + 1; b < cl.length; b++) {
        const [u, v] = [unit(cl[a]), unit(cl[b])];
        const angle = (Math.acos(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) * 180) / Math.PI;
        expect(angle).toBeGreaterThan(95);
        expect(angle).toBeLessThan(125);
      }
    }
  }, 120_000);
});
