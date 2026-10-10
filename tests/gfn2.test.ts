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
import { parseMolBlock } from '../src/mol-parser';
import { HESSIAN_SADDLE_THRESHOLD } from '../src/geometry/gfn2-refine';
import { EXAMPLES } from '../src/ui/examples';

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

    // The charges see the same split, which is the point of offering them next
    // to MMFF94's: BCI types all five chlorines alike (generic parameters for
    // a 5-coordinate phosphorus), GFN2 distinguishes the axial pair.
    const charges = result!.charges;
    expect(charges).not.toBeNull();
    expect(charges!.length).toBe(atoms.length);
    const axialQ = [charges![4], charges![5]];
    const equatorialQ = [charges![1], charges![2], charges![3]];
    expect(Math.max(...axialQ)).toBeLessThan(Math.min(...equatorialQ));
  }, 180_000);

  // The charges ride back with the geometry: the display offers them next to
  // the MMFF94 model, and they are only usable if they describe the returned
  // structure — a wrong length, or an array left over from a rejected
  // line-search trial, would be silently wrong on screen.
  it('returns per-atom charges for the geometry it returns', async () => {
    const result = await refine(water);
    expect(result).not.toBeNull();
    const charges = result!.charges;
    expect(charges).not.toBeNull();
    expect(charges!.length).toBe(result!.molecule.atoms.length);
    // A neutral molecule sums to zero, oxygen is the negative end (GFN2's
    // Mulliken charges for water sit near O −0.56, H +0.28), and the two
    // hydrogens of the optimised, symmetric water carry the same charge.
    expect(charges!.reduce((sum, q) => sum + q, 0)).toBeCloseTo(0, 6);
    expect(charges![0]).toBeLessThan(-0.4);
    expect(charges![1]).toBeGreaterThan(0.2);
    expect(charges![1]).toBeCloseTo(charges![2], 3);
  }, 180_000);

  // The Hessian verdict: a gradient-based stop cannot tell a minimum from a
  // saddle — both have zero gradient — so a converged run reports its
  // curvature, and the app says which one is on screen.
  it('reports a curvature verdict for a converged run', async () => {
    const result = await refine(water);
    expect(result!.lowestHessianMode).not.toBeNull();
    expect(result!.lowestHessianMode!).toBeGreaterThan(HESSIAN_SADDLE_THRESHOLD);
  }, 180_000);

  // The default charge model is GFN2's for every structure on screen, so a
  // structure the engine did not produce (a PubChem conformer, an example)
  // gets a single point at its own geometry. At the optimiser's geometry that
  // single point must be the optimiser's charges — one model, not two.
  it("gives the optimiser's own charges as a single point at its geometry", async () => {
    const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
    const result = await refine(water);
    const charges = (await propertiesAt(result!.molecule, vendorFile))?.charges ?? null;
    expect(charges).not.toBeNull();
    charges!.forEach((q, i) => expect(q).toBeCloseTo(result!.charges![i], 4));
  }, 180_000);

  // An ion's drawn charge reaches the engine: the charges sum to it.
  it("carries an ion's net charge into the single point — [Ni(CN)₄]²⁻", async () => {
    const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
    const example = EXAMPLES.find((e) => e.name.startsWith('Tetracyanonickelate'));
    const nicn4 = parseMolBlock(example!.mol);
    const charges = (await propertiesAt(nicn4, vendorFile))?.charges ?? null;
    expect(charges).not.toBeNull();
    expect(charges!.length).toBe(nicn4.atoms.length);
    expect(charges!.reduce((sum, q) => sum + q, 0)).toBeCloseTo(-2, 6);
  }, 180_000);

  // What one single point knows beyond the charges, pinned against the
  // Fortran xTB oracle at the same water geometry (xtb 6.7.1 --gfn 2):
  // full dipole 2.278 D (point charges alone 1.59 D), Wiberg O–H 0.920,
  // HOMO −12.1801 eV, LUMO 2.4658 eV.
  it('gives the full dipole, the Wiberg bond orders and the orbital ladder — water, against the oracle', async () => {
    const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
    const p = await propertiesAt(water, vendorFile);
    expect(p).not.toBeNull();
    const [mx, my, mz] = p!.dipole!;
    expect(Math.hypot(mx, my, mz)).toBeCloseTo(2.278, 2);
    expect(p!.bondOrders[0]).toBeCloseTo(0.920, 3);
    expect(p!.bondOrders[1]).toBeCloseTo(0.920, 3);
    const homo = p!.alpha.occupations.filter((o) => o > 0.5).length - 1;
    expect(homo).toBe(3); // four occupied valence orbitals: 8 electrons
    expect(p!.alpha.energies[homo]).toBeCloseTo(-12.18, 1);
    expect(p!.alpha.energies[homo + 1]).toBeCloseTo(2.47, 1);
    // the HOMO is oxygen's lone pair: nearly all of it on O
    expect(p!.alpha.atomShares[homo][0]).toBeGreaterThan(0.9);
    expect(p!.spin).toBeNull();
    expect(p!.beta).toBeNull();
  }, 180_000);

  // An odd electron count runs as a doublet, and the spin it carries is one
  // electron's worth, shared out over the atoms (H₃Si–Ni as CIR built it).
  it('runs an odd electron count as a doublet and reports where the spin sits — H₃Si–Ni', async () => {
    const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
    const sini = parseMolBlock(`H3NiSi
  cir

  5  4  0  0  0  0  0  0  0  0999 V2000
   -1.6773    0.0000    0.0000 Si  0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723   -1.3998    0.0289 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723    0.6749   -1.2267 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1723    0.7249    1.1978 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.9147    0.0000    0.0000 Ni  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`);
    const p = await propertiesAt(sini, vendorFile);
    expect(p).not.toBeNull();
    expect(p!.multiplicity).toBe(2);
    expect(p!.spin!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
    expect(p!.beta).not.toBeNull();
  }, 180_000);

  // The 3-ring planarity repair that used to run after this tier was removed
  // 2026-10-02 (the engines own the geometry). This pins the premise of that
  // removal: GFN2's own cyclopropenyl cation is planar — no correction needed.
  it('optimises the cyclopropenyl cation to a planar ring', async () => {
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
    const result = await refine(mol);
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);

    // Ring = the three carbons; each exocyclic H must sit in the ring plane.
    const [c0, c1, c2] = [0, 1, 2].map((i) => result!.molecule.atoms[i]);
    const u = [c1.x - c0.x, c1.y - c0.y, c1.z - c0.z];
    const v = [c2.x - c0.x, c2.y - c0.y, c2.z - c0.z];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    for (let h = 3; h < 6; h++) {
      const p = result!.molecule.atoms[h];
      const outOfPlane = Math.abs(
        (n[0] * (p.x - c0.x) + n[1] * (p.y - c0.y) + n[2] * (p.z - c0.z)) / len,
      );
      expect(outOfPlane).toBeLessThan(0.01);
    }
  }, 180_000);

  // A drawn H-O-H reaches the engine exactly linear (the embedder's
  // LINEAR_VECTORS ±x), and linear water is a saddle the descent cannot
  // leave — the bend gradient is exactly zero by symmetry (measured:
  // start 180.0°, end 180.0°, converged, E -5.02063 Eh against the bent
  // minimum). The pipeline breaks the symmetry first (breakSymmetry — this
  // test composes exactly what the manager posts to the worker), so a linear
  // start must come back bent and below the saddle energy.
  it('bends a linear-start water instead of keeping it linear', async () => {
    const { breakSymmetry } = await import('../src/geometry/embed');
    const result = await refine(breakSymmetry(linearWater));
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    expect(waterAngle(result!.molecule)).toBeGreaterThan(95);
    expect(waterAngle(result!.molecule)).toBeLessThan(115);
    expect(result!.energyHartree).toBeLessThan(-5.02063);
  }, 180_000);

  // Without the kick the optimiser does converge — onto the D∞h saddle, the
  // bend gradient being exactly zero by symmetry. The Hessian sees the
  // imaginary bend, the run pushes the structure down it and re-optimises,
  // and what comes back is the bent minimum, with the escape counted and a
  // verdict that is no longer a saddle.
  it('escapes a saddle it converged onto — linear water, no kick', async () => {
    const result = await refine(linearWater);
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    expect(result!.saddleEscapes).toBeGreaterThanOrEqual(1);
    expect(result!.lowestHessianMode!).toBeGreaterThan(HESSIAN_SADDLE_THRESHOLD);
    expect(waterAngle(result!.molecule)).toBeGreaterThan(95);
    expect(waterAngle(result!.molecule)).toBeLessThan(115);
    expect(result!.energyHartree).toBeLessThan(-5.02063);
  }, 180_000);
});

describe('Berny and the inexact analytic gradient', () => {
  // OCC's analytic GFN2 gradient is wrong for polar species — a known upstream
  // limitation (its multipole-on gradient misses the AO-multipole integral
  // derivatives). The Fortran xTB oracle's gradient matches OCC's finite
  // differences to 1e-6 and its analytic gradient to only 4.7e-4 here. Berny on that gradient
  // alone reports the cyclopropenyl anion converged at −7.899336 Eh, 4.7
  // kcal/mol above the minimum; the exact-gradient check has to catch it.
  // The start is the user's planar wb97x-D3 geometry (a saddle), as in
  // hessian-verdict.test.ts.
  it('does not stop where the analytic gradient says — the cyclopropenyl anion', async () => {
    const coordinates = [
      [-0.38805807296094, -0.55379677203097, -0.00000516874794], [1.96428381555042, -0.33618719672166, 0.00000798989796],
      [-0.4817129625322, 0.79178857900362, -0.00000671254584], [0.90831673450787, -0.18163055167206, -0.00000886276546],
      [-1.01558024601627, -1.45147946730454, 0.00000575624305], [-0.98794926854887, 1.73130540872561, 0.00000699791823],
    ];
    const elements = ['C', 'H', 'C', 'C', 'H', 'H'];
    const anion: Molecule = {
      atoms: elements.map((element, i) => ({ ...atom(element, coordinates[i][0], coordinates[i][1], coordinates[i][2]), charge: i === 0 ? -1 : 0 })),
      bonds: [
        bond(0, 2), { ...bond(2, 3), order: 2 }, bond(3, 0), bond(3, 1), bond(0, 4), bond(2, 5),
      ],
    };
    const result = await refine(anion);
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    // the true minimum is −7.906790 Eh; Berny on the analytic gradient alone stops at −7.899336
    expect(result!.energyHartree).toBeLessThan(-7.9065);
    expect(result!.lowestHessianMode!).toBeGreaterThan(HESSIAN_SADDLE_THRESHOLD);
    // ...and it is the exact-gradient check that gets it there, not the saddle
    // escape. Here the false stop happens to be the planar saddle, so with the
    // check removed the escape rescues the run (measured: one escape, same
    // minimum) — but the escape only runs below 16 atoms and only when the
    // false stop is a saddle. The check is the safeguard that always applies.
    expect(result!.saddleEscapes).toBe(0);
  }, 180_000);
});

const linearWater: Molecule = {
  atoms: [atom('O', 0, 0, 0), atom('H', 0.97, 0, 0), atom('H', -0.97, 0, 0)],
  bonds: [bond(0, 1), bond(0, 2)],
};

function waterAngle(molecule: Molecule): number {
  const [o, h1, h2] = molecule.atoms;
  const u = [h1.x - o.x, h1.y - o.y, h1.z - o.z];
  const v = [h2.x - o.x, h2.y - o.y, h2.z - o.z];
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
