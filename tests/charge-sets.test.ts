import { describe, expect, it } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import { fitChargesToPotential, mkFitPoints } from '../src/chem/charge-model/esp-fit';
import { cm5Corrections } from '../src/chem/charge-model/cm5';
import { PUBCHEM_CHLOROETHOXIDE_SDF } from './fixtures';

const chloroethoxide = parseMolBlock(PUBCHEM_CHLOROETHOXIDE_SDF);

// The fit itself: potentials made by known point charges must give those
// charges back, on the Merz–Kollman points around a real conformer.
describe('ESP-fitted charges', () => {
  it('recovers the point charges that made the potential', () => {
    const made = [-0.4, -0.9, 0.1, 0.3, 0.02, 0.02, -0.07, -0.07];
    const points = mkFitPoints(chloroethoxide.atoms);
    const potentials: number[] = [];
    for (let p = 0; p < points.length / 3; p++) {
      potentials.push(chloroethoxide.atoms.reduce((v, a, j) =>
        v + made[j] / Math.hypot(points[3 * p] - a.x, points[3 * p + 1] - a.y, points[3 * p + 2] - a.z), 0));
    }
    const fitted = fitChargesToPotential(chloroethoxide.atoms, points, potentials, -1);
    fitted.forEach((q, j) => expect(q).toBeCloseTo(made[j], 6));
  });

  it('keeps every point outside the molecule, on four shells', () => {
    const points = mkFitPoints(chloroethoxide.atoms);
    expect(points.length / 3).toBeGreaterThan(1000);
    for (let p = 0; p < points.length; p += 3) {
      const nearest = Math.min(...chloroethoxide.atoms.map((a) =>
        Math.hypot(points[p] - a.x, points[p + 1] - a.y, points[p + 2] - a.z)));
      expect(nearest).toBeGreaterThan(1.4 * 1.2 - 1e-9); // 1.4 × the smallest radius (H)
    }
  });
});

// The CM5 correction against the Fortran xTB oracle: xtb --gfn 1 prints its
// Mulliken and CM5 charges side by side, and CM5 − Mulliken there is exactly
// this correction (xtb adds it to GFN1's Mulliken charges; we add it to
// GFN2's Hirshfeld charges). PubChem's 2-chloroethanolate, charge −1.
describe('CM5 correction', () => {
  it('matches xtb’s CM5 − Mulliken for 2-chloroethanolate', () => {
    const mulliken = [-0.34817, -0.84065, 0.08630, 0.25883, -0.00324, -0.00397, -0.07470, -0.07439];
    const cm5 = [-0.35809, -0.89720, -0.01275, 0.18749, 0.05358, 0.05275, -0.01308, -0.01270];
    const correction = cm5Corrections(chloroethoxide.atoms);
    correction.forEach((c, a) => expect(c).toBeCloseTo(cm5[a] - mulliken[a], 4));
    expect(correction.reduce((s, c) => s + c, 0)).toBeCloseTo(0, 10);
  });
});
