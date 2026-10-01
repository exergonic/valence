/**
 * GFN2-xTB, pinned against the Fortran xTB oracle.
 *
 * PLAN.md's house rule for every phase: ship with a test that pins a value a
 * chemist knows, so a regression reads as a number. For this tier the numbers
 * are the oracle's, measured on identical geometries:
 *
 *   water, single point at the geometry below   -5.070325081194 Eh
 *   PCl5, after optimisation                    axial 2.1556 A, equatorial 2.0271 A
 *
 * The PCl5 assertion is the one that matters most: the axial bonds of a
 * trigonal bipyramid are the LONGER pair. MMFF94 with no phosphorus parameter
 * gets that backwards (measured: 138° angles, axial shortest), which is
 * precisely why this tier exists.
 *
 * The engine is loaded from `vendor/occ-wasm` on disk rather than through the
 * worker's `?url` assets, so this runs under Vitest in Node.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Molecule } from '../src/mol-parser';

beforeAll(() => {
  // The worker module registers `self.onmessage` at import time.
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));

const atom = (element: string, x: number, y: number, z: number) => ({ element, x, y, z });
const bond = (a: number, b: number) => ({ atom1Index: a, atom2Index: b, order: 1 });

const water: Molecule = {
  atoms: [
    atom('O', 0, 0, 0.11779),
    atom('H', 0, 0.75545, -0.47116),
    atom('H', 0, -0.75545, -0.47116),
  ],
  bonds: [bond(0, 1), bond(0, 2)],
};

const pcl5: Molecule = {
  atoms: [
    atom('P', 0, 0, 0),
    atom('Cl', 1.6, 0, 0),
    atom('Cl', -0.8, 1.4, 0),
    atom('Cl', -0.8, -1.4, 0),
    atom('Cl', 0, 0, 1.6),
    atom('Cl', 0, 0, -1.6),
  ],
  bonds: [bond(0, 1), bond(0, 2), bond(0, 3), bond(0, 4), bond(0, 5)],
};

async function refine(molecule: Molecule) {
  const { optimizeWithGfn2 } = await import('../src/geometry/gfn2-refine.worker');
  return optimizeWithGfn2(molecule, vendorFile);
}

describe('GFN2-xTB', () => {
  it('optimises water to a lower energy than the oracle single point', async () => {
    const result = await refine(water);
    expect(result).not.toBeNull();
    // The oracle's single point at the starting geometry is -5.070325081194 Eh,
    // so the optimised energy must sit just below it.
    expect(result!.energyHartree).toBeLessThan(-5.07033);
    expect(result!.converged).toBe(true);
  }, 180_000);

  it('optimises PCl5 to a trigonal bipyramid, axial bonds the longer pair', async () => {
    const result = await refine(pcl5);
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    const atoms = result!.molecule.atoms;
    const distance = (i: number, j: number) =>
      Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);

    const axial = [distance(0, 4), distance(0, 5)];
    const equatorial = [distance(0, 1), distance(0, 2), distance(0, 3)];

    // Five equal bonds would be wrong: a trigonal bipyramid has two long
    // (axial) and three short (equatorial) bonds.
    expect(Math.min(...axial)).toBeGreaterThan(Math.max(...equatorial));
    for (const d of axial) expect(d).toBeCloseTo(2.156, 2);
    for (const d of equatorial) expect(d).toBeCloseTo(2.027, 2);
  }, 180_000);

  // A drawn H-O-H reaches the engine exactly linear (the embedder's
  // LINEAR_VECTORS ±x), and linear water is a saddle the descent cannot
  // leave — the bend gradient is exactly zero by symmetry (measured:
  // start 180.0°, end 180.0°, converged, E -5.02063 Eh against the bent
  // minimum). The pipeline breaks the symmetry first (breakSymmetry, the
  // same kick the MMFF94 bridge uses — this test composes exactly what
  // the manager posts to the worker), so a linear start must come back
  // bent and below the saddle energy.
  it('bends a linear-start water instead of keeping it linear', async () => {
    const linear: Molecule = {
      atoms: [atom('O', 0, 0, 0), atom('H', 0.97, 0, 0), atom('H', -0.97, 0, 0)],
      bonds: [bond(0, 1), bond(0, 2)],
    };
    const { breakSymmetry } = await import('../src/geometry/mmff-refine');
    const result = await refine(breakSymmetry(linear));
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    const [o, h1, h2] = result!.molecule.atoms;
    const u = [h1.x - o.x, h1.y - o.y, h1.z - o.z];
    const v = [h2.x - o.x, h2.y - o.y, h2.z - o.z];
    const angle =
      (Math.acos(
        (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) /
          (Math.hypot(...u) * Math.hypot(...v)),
      ) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(95);
    expect(angle).toBeLessThan(115);
    expect(result!.energyHartree).toBeLessThan(-5.02063);
  }, 180_000);
});
