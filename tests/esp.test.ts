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
import { parseMolBlock } from '../src/mol-parser';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { resolveCharges } from '../src/chem/dipole';

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

  it('the fused DMS surface is watertight and consistently wound at its creases', () => {
    // The reported artifact (2026-09-28): white sawtooth patches over
    // dimethyl sulfide's surface. Two intertwined causes: (1) the
    // orientation reference picked the nearest atom CENTER, while the
    // field's gradient is radial from the argmin of |p−aᵢ| − rᵢ — they
    // disagree at heteronuclear cusps, flipping triangles inward (culled →
    // cracks); (2) the degenerate-sliver skip left zero-width slits,
    // cracking closure. Fixed by the argmin mis-normal and by emitting the
    // slivers. Every directed edge must now be traversed once in each
    // direction: no flipped pairs, no holes.
    const mol = embedAndRefine(parseMolBlock(`JME 2024-04-29 Mon Sep 28 13:02:00 GMT-400 2026

  3  2  0  0  0  0  0  0  0  0999 V2000
   -1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 S   0  0  0  0  0  0  0  0  0  0  0  0
    1.2000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`)).molecule;
    const charges = resolveCharges(mol)!;
    const surf = computeEspSurface(mol, charges.charges);

    const R = 1e5;
    const pos = (k: number) =>
      `${Math.round(surf.positions[k * 3] * R)},${Math.round(surf.positions[k * 3 + 1] * R)},${Math.round(surf.positions[k * 3 + 2] * R)}`;
    const directed = new Map<string, number>();
    for (let t = 0; t < surf.vertexCount; t += 3) {
      const a = pos(t), b = pos(t + 1), c = pos(t + 2);
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const k = `${u}>${v}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    let missingReverse = 0;
    let sameDirection = 0;
    for (const [k, n] of directed) {
      const [u, v] = k.split('>');
      const rev = directed.get(`${v}>${u}`) ?? 0;
      if (rev === 0) missingReverse++;
      if (n !== 1) sameDirection++;
    }
    expect(missingReverse).toBe(0);
    expect(sameDirection).toBe(0);
  });

  it('the mmff94-ts CCl4 geometry comes out wound outward, not half inside-out', () => {
    // Reported 2026-09-28: carbon tetrachloride's ESP surface lost its whole
    // near side, leaving the far side showing through. Only the LOCAL
    // pipeline geometry (mmff94-ts) triggered it — the same molecule fetched
    // from PubChem rendered whole, which pointed at the geometry, not the
    // renderer. The orientation pass was the cause: it propagated one winding
    // across shared edges and on this geometry (a Cl on the +z axis) inverted
    // 46% of the triangles, and a global vote cannot repair a PARTIAL
    // inversion; backface culling then punched that half out. Orientation now
    // comes from each tet's own inside/outside sign, so it is outward by
    // construction. The signed volume is the number that collapses when a
    // mesh is half inside-out: 3.2 Å³ before, 84.5 Å³ after, against the
    // ceiling of four overlapping Cl spheres (89.8 Å³) with the carbon buried
    // inside. A guessed ring of 2D sketch coordinates is enough input: the
    // embedder is what produces the tetrahedron.
    const mol = embedAndRefine(parseMolBlock(`JME 2024-04-29 Mon Sep 28 13:02:00 GMT-400 2026

  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -1.0000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`)).molecule;
    const surf = computeEspSurface(mol, mol.atoms.map(() => 0));

    let volume6 = 0;
    for (let t = 0; t < surf.vertexCount; t += 3) {
      const p = [0, 1, 2].map((v) => {
        const k = (t + v) * 3;
        return [surf.positions[k], surf.positions[k + 1], surf.positions[k + 2]];
      });
      volume6 += p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1])
        - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0])
        + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0]);
    }
    const clSphere = (4 / 3) * Math.PI * 1.75 ** 3; // 22.45 Å³
    expect(volume6 / 6).toBeGreaterThan(clSphere);
    expect(volume6 / 6).toBeLessThan(4 * clSphere);
  });

  it('every area-bearing triangle points outward against the finite-difference field gradient', () => {
    // The root cause of the DMS cracks (external review, 2026-09-28): the
    // orientation reference used the nearest atom CENTER, but the field's
    // gradient is radial from the argmin of |p−aᵢ| − rᵢ. With different vdW
    // radii the two disagree at heteronuclear cusps (C vs H) and flipped
    // triangles inward — 71 of 23,848 on the reviewer's trimethylamine. The
    // oracle here is independent: a finite-difference gradient of
    // unionVdwField at each triangle centroid; a C–H fused pair is the
    // minimal heteronuclear cusp that exposes the bug.
    const mol: Molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'H', x: 1.09, y: 0, z: 0 },
      ],
      bonds: [{ atom1Index: 0, atom2Index: 1, order: 1 }],
    };
    const surf = computeEspSurface(mol, [0.2, -0.2]);
    const h = 1e-4;
    const fd = (x: number, y: number, z: number): [number, number, number] => [
      (unionVdwField(x + h, y, z, mol.atoms) - unionVdwField(x - h, y, z, mol.atoms)) / (2 * h),
      (unionVdwField(x, y + h, z, mol.atoms) - unionVdwField(x, y - h, z, mol.atoms)) / (2 * h),
      (unionVdwField(x, y, z + h, mol.atoms) - unionVdwField(x, y, z - h, mol.atoms)) / (2 * h),
    ];
    let checked = 0;
    for (let v = 0; v < surf.vertexCount; v += 3) {
      const i0 = v * 3, i1 = (v + 1) * 3, i2 = (v + 2) * 3;
      const e1 = [surf.positions[i1] - surf.positions[i0], surf.positions[i1 + 1] - surf.positions[i0 + 1], surf.positions[i1 + 2] - surf.positions[i0 + 2]];
      const e2 = [surf.positions[i2] - surf.positions[i0], surf.positions[i2 + 1] - surf.positions[i0 + 1], surf.positions[i2 + 2] - surf.positions[i0 + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue; // sliver: no meaningful direction
      const cx = (surf.positions[i0] + surf.positions[i1] + surf.positions[i2]) / 3;
      const cy = (surf.positions[i0 + 1] + surf.positions[i1 + 1] + surf.positions[i2 + 1]) / 3;
      const cz = (surf.positions[i0 + 2] + surf.positions[i1 + 2] + surf.positions[i2 + 2]) / 3;
      const g = fd(cx, cy, cz);
      expect(n[0] * g[0] + n[1] * g[1] + n[2] * g[2]).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});