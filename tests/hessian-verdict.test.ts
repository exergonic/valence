// The minimum/saddle verdict on the vendored engine: a gradient-based stop
// cannot tell the two apart — the planar cyclopropenyl anion has zero gradient
// and IS a saddle (ORCA: the bent minimum is 34.5 kcal/mol lower, and GFN2
// agrees at 39.7). The verdict reads the lowest vibration of the numerical
// Hessian; this pins both sides of SADDLE_FREQUENCY_THRESHOLD, so a future trim
// that drops the `hessian` binding fails here rather than silently.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { normalModes } from '../src/chem/gfn2-xtb/normal-modes';
import { SADDLE_FREQUENCY_THRESHOLD } from '../src/geometry/gfn2-refine';
import createOccModule from '../vendor/occ-wasm/occjs.js';

// The vendored glue has no types (occjs.d.ts declares the factory as
// Promise<any>); this is the slice of the module this test uses.
interface EmbindCalculator {
  charge: number;
  singlePointEnergy(): number;
  hessian(step: number): { rows(): number; get(row: number, col: number): number };
  delete?(): void;
}
interface EmbindModule {
  IVec: { fromArray(values: number[]): unknown };
  Mat3N: { create(cols: number): { set(row: number, col: number, value: number): void } };
  Molecule: new (atoms: unknown, positions: unknown) => unknown;
  XtbCalculator: { fromMolecule(molecule: unknown): EmbindCalculator };
}

const Z: Record<string, number> = { H: 1, C: 6, O: 8 };

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));

async function loadEngine(): Promise<EmbindModule> {
  return (await createOccModule({ locateFile: vendorFile })) as unknown as EmbindModule;
}

/** Lowest vibration (cm⁻¹, negative = imaginary) at the given geometry. */
function lowestFrequency(M: EmbindModule, elements: string[], coords: number[][], charge: number): number {
  const iv = M.IVec.fromArray(elements.map((e) => Z[e]));
  const pos = M.Mat3N.create(elements.length);
  coords.forEach((p, i) => {
    pos.set(0, i, p[0]);
    pos.set(1, i, p[1]);
    pos.set(2, i, p[2]);
  });
  const calc = M.XtbCalculator.fromMolecule(new M.Molecule(iv, pos));
  calc.charge = charge;
  calc.singlePointEnergy();
  const H = calc.hessian(0.005);
  const dim = H.rows();
  const matrix: number[][] = [];
  for (let i = 0; i < dim; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) row.push(H.get(i, j));
    matrix.push(row);
  }
  const lowest = normalModes(elements.map((element, i) => ({ element, x: coords[i][0], y: coords[i][1], z: coords[i][2] })), matrix)[0].frequency;
  calc.delete?.();
  return lowest;
}

describe('Hessian verdict on the vendored engine', () => {
  it('finds no imaginary mode at the GFN2 water minimum', async () => {
    const M = await loadEngine();
    const lowest = lowestFrequency(
      M,
      ['O', 'H', 'H'],
      [
        [0, 0, 0.11779],
        [0, 0.75545, -0.47116],
        [0, -0.75545, -0.47116],
      ],
      0,
    );
    // the bend (measured 1562 cm⁻¹ at these rounded coordinates)
    expect(lowest).toBeGreaterThan(1400);
  }, 120_000);

  it('finds the planar cyclopropenyl anion is a saddle', async () => {
    const M = await loadEngine();
    // The planar C3H3⁻ start from the user's wb97x-D3/def2-TZVP run
    // (orca_calcs/cyclopropyl_anion, 2026-08-30) — the saddle that motivated
    // the verdict, and the case no gradient-based optimiser can detect.
    const lowest = lowestFrequency(
      M,
      ['C', 'H', 'C', 'C', 'H', 'H'],
      [
        [-0.38805807296094, -0.55379677203097, -0.00000516874794],
        [1.96428381555042, -0.33618719672166, 0.00000798989796],
        [-0.4817129625322, 0.79178857900362, -0.00000671254584],
        [0.90831673450787, -0.18163055167206, -0.00000886276546],
        [-1.01558024601627, -1.45147946730454, 0.00000575624305],
        [-0.98794926854887, 1.73130540872561, 0.00000699791823],
      ],
      -1,
    );
    expect(lowest).toBeLessThan(SADDLE_FREQUENCY_THRESHOLD);
    // Not a noise-level negative: the out-of-plane mode measures 1128i cm⁻¹.
    expect(lowest).toBeLessThan(-500);
  }, 120_000);
});
