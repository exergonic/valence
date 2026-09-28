// Phase-1 ESP: the charge-model electrostatic potential surface. The pure
// pieces (chem/esp.ts) are pinned here — the physics (V = Σ q/|r−rᵢ|, with
// the near-point cutoff), the textbook red/green/blue color scale, the
// symmetric percentile-clipped scale bound, and the fused-surface extractor
// (marching tetrahedra over the union vdW field; the renderer just turns the
// cached surface data into colored geometry).
import { describe, it, expect } from 'vitest';
import {
  espColor,
  espPotentialAt,
  espVmax,
  unionVdwField,
  computeEspSurface,
  ESP_CUTOFF,
} from '../src/chem/esp';
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

describe('unionVdwField — the signed distance to the fused surface', () => {
  const singleH = (): Molecule => ({ atoms: [{ element: 'H', x: 0, y: 0, z: 0 }], bonds: [] });

  it('is negative inside an atom sphere, positive outside, zero on the boundary', () => {
    const mol = singleH();
    expect(unionVdwField(0, 0, 0, mol.atoms)).toBeCloseTo(-1.2, 9);
    expect(unionVdwField(0, 0, 1.2, mol.atoms)).toBeCloseTo(0, 6);
    expect(unionVdwField(0, 0, 2, mol.atoms)).toBeCloseTo(0.8, 9);
  });

  it('two overlapping atoms make a united minimum, not the sum of spheres', () => {
    const mol: Molecule = {
      atoms: [
        { element: 'H', x: 0, y: 0, z: 0 },
        { element: 'H', x: 1.0, y: 0, z: 0 },
      ],
      bonds: [],
    };
    // Midway between them (inside both) is well inside the union.
    expect(unionVdwField(0.5, 0, 0, mol.atoms)).toBeLessThan(0);
  });
});

describe('computeEspSurface — the fused molecular surface', () => {
  const singleH = (): Molecule => ({ atoms: [{ element: 'H', x: 0, y: 0, z: 0 }], bonds: [] });

  it('a single atom yields a closed sphere at the vdW radius', () => {
    const surf = computeEspSurface(singleH(), [1]);
    expect(surf.vertexCount).toBeGreaterThan(500);
    expect(surf.vertexCount % 3).toBe(0);
    // Every vertex sits on the fused boundary (|p| ≈ 1.2 Å) with a radial
    // outward normal.
    for (let i = 0; i < surf.vertexCount; i++) {
      const r = Math.hypot(surf.positions[i * 3], surf.positions[i * 3 + 1], surf.positions[i * 3 + 2]);
      expect(r).toBeGreaterThan(1.0);
      expect(r).toBeLessThan(1.4);
      const dot =
        surf.positions[i * 3] * surf.normals[i * 3] +
        surf.positions[i * 3 + 1] * surf.normals[i * 3 + 1] +
        surf.positions[i * 3 + 2] * surf.normals[i * 3 + 2];
      expect(dot / r).toBeCloseTo(1, 6);
    }
    // Potential probed at the fused boundary: q/r ≈ 1/1.2 for a radius in
    // the sampled band.
    for (const v of surf.potentials) {
      expect(v).toBeGreaterThan(1 / 1.4);
      expect(v).toBeLessThan(1 / 1.0);
    }
  });

  it('the surface is watertight — every mesh edge belongs to two triangles', () => {
    const surf = computeEspSurface(singleH(), [1]);
    const q = Math.round;
    const key = (i: number, j: number): string => {
      const p = (k: number) => {
        const a = surf.positions[k * 3], b = surf.positions[k * 3 + 1], c = surf.positions[k * 3 + 2];
        return `${q(a * 1e5)},${q(b * 1e5)},${q(c * 1e5)}`;
      };
      const a = p(i), b = p(j);
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    const edges = new Map<string, number>();
    for (let t = 0; t < surf.vertexCount; t += 3) {
      for (const [u, v] of [[0, 1], [1, 2], [2, 0]] as const) {
        const k = key(t + u, t + v);
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    }
    expect(edges.size).toBeGreaterThan(200);
    for (const count of edges.values()) expect(count).toBe(2);
  });

  it('two fused spheres give a larger, single surface', () => {
    const mol: Molecule = {
      atoms: [
        { element: 'H', x: 0, y: 0, z: 0 },
        { element: 'H', x: 1.0, y: 0, z: 0 },
      ],
      bonds: [],
    };
    const one = computeEspSurface(singleH(), [1]);
    const two = computeEspSurface(mol, [1, 1]);
    expect(two.vertexCount).toBeGreaterThan(one.vertexCount);
    // Probe potential on the merged boundary (not inside a neighbor sphere).
    for (let i = 0; i < two.vertexCount; i++) {
      const v = two.potentials[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('water: the fused surface probes the potential again — oxygens negative, hydrogens positive', () => {
    const surf = computeEspSurface(water(), WATER_CHARGES);
    expect(surf.vertexCount).toBeGreaterThan(1000);
    let sawNegative = false;
    let sawPositive = false;
    for (const v of surf.potentials) {
      if (v < 0) sawNegative = true;
      if (v > 0) sawPositive = true;
    }
    expect(sawNegative).toBe(true);
    expect(sawPositive).toBe(true);
    expect(surf.vmax).toBeGreaterThan(0);
  });
});