// Phase-1 ESP: the charge-model electrostatic potential surface. The pure
// pieces (chem/esp.ts) are pinned here — the physics (V = Σ q/|r−rᵢ|, with
// the near-point cutoff), the textbook red/green/blue color scale, and the
// symmetric percentile-clipped scale bound. The renderer just composes them
// onto per-atom vdW spheres.
import { describe, it, expect } from 'vitest';
import { espColor, espPotentialAt, espVmax, ESP_CUTOFF } from '../src/chem/esp';
import type { Molecule } from '../src/mol-parser';

// Water in the app's own fixture geometry (from the examples), with the BCI
// oracle charges: O −0.86, H +0.43.
const water = (): Molecule => ({
  atoms: [
    { element: 'O', x: 0, y: 0, z: 0 },
    { element: 'H', x: 0.7574, y: 0, z: -0.4692 },
    { element: 'H', x: -0.7574, y: 0, z: -0.4692 },
  ],
  bonds: [
    { atom1Index: 0, atom2Index: 1, order: 1 },
    { atom1Index: 0, atom2Index: 2, order: 1 },
  ],
});
const WATER_CHARGES = [-0.86, 0.43, 0.43];

describe('espPotentialAt — the physics', () => {
  it('water: the oxygen side is negative, the hydrogen side positive', () => {
    const mol = water();
    // A point just above the oxygen's vdW sphere is dominated by the −0.86
    // on O → negative potential; a point past a hydrogen is positive.
    const atO = espPotentialAt(0, 0, mol.atoms[0].z + 1.6, mol.atoms, WATER_CHARGES);
    const atH = espPotentialAt(mol.atoms[1].x * 2, 0, mol.atoms[1].z * 2, mol.atoms, WATER_CHARGES);
    expect(atO).toBeLessThan(0);
    expect(atH).toBeGreaterThan(0);
  });

  it('a single +1 charge has the monopole far-field V → Q/R', () => {
    const atoms = [{ element: 'H', x: 0, y: 0, z: 0 }];
    const charges = [1];
    // At 20 Å the self-distance floor is irrelevant: V = 1/20 = 0.05.
    expect(espPotentialAt(0, 0, 20, atoms, charges)).toBeCloseTo(0.05, 9);
  });

  it('a vertex ON the nucleus is finite — the cutoff floor kicks in', () => {
    const atoms = [{ element: 'H', x: 0, y: 0, z: 0 }];
    const charges = [1];
    // At r = 0 the field reads q/ESP_CUTOFF instead of blowing up.
    expect(espPotentialAt(0, 0, 0, atoms, charges)).toBeCloseTo(1 / ESP_CUTOFF, 9);
  });
});

describe('espColor — the textbook diverging map', () => {
  it('negative red, neutral green, positive blue', () => {
    expect(espColor(-1)).toEqual([255, 0, 0]);
    expect(espColor(0)).toEqual([0, 255, 0]);
    expect(espColor(1)).toEqual([0, 0, 255]);
  });

  it('interpolates through the expected midpoints', () => {
    // Piecewise-linear in RGB between the three stops.
    expect(espColor(-0.5)).toEqual([128, 128, 0]);
    expect(espColor(0.5)).toEqual([0, 128, 128]);
  });

  it('clamps out-of-range values', () => {
    expect(espColor(-2)).toEqual([255, 0, 0]);
    expect(espColor(4)).toEqual([0, 0, 255]);
  });
});

describe('espVmax — symmetric, percentile-clipped scale bound', () => {
  it('an outlier near-field does not set the scale', () => {
    // One surface vertex screams (+10) while the body of the surface is
    // modest. The percentile clip cuts the tail — for this 5-point set the
    // 60th percentile excludes the max; on a real surface (thousands of
    // vertices) the default 90th does the same job.
    const potentials = [0.1, 0.2, 0.3, 0.4, 10];
    const vmax = espVmax(potentials, 60);
    expect(vmax).toBe(0.4);
    // And the outlier maps to t = 25, which the color clamps to blue.
    expect(espColor(10 / vmax)).toEqual([0, 0, 255]);
  });

  it('all-zero potentials anchor at 1 (all-green surface, no NaNs)', () => {
    expect(espVmax([0, 0, 0])).toBe(1);
    expect(espVmax([])).toBe(1);
  });
});