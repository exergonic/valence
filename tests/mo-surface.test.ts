/**
 * The MO isosurface: the amplitude convention, the gradient the normals come
 * from, and the mesh's integrity.
 *
 * The amplitude test is the important one. A surface is a statement about
 * *relative* amplitudes, so it is only as right as the Slater normalization
 * behind it — and that normalization has to match the one the overlap
 * integrals assume (ζ in bohr⁻¹, the Mulliken convention of slater-overlap.ts),
 * or every s-to-p ratio in the picture is wrong. The known value of a
 * normalized 1s orbital pins it exactly.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { symmetrizeMolecule } from '../src/geometry/symmetrize';
import { solveExtendedHuckel } from '../src/chem/extended-huckel/solve';
import { alignToPrincipalAxes } from '../src/chem/extended-huckel/align-principal-axes';
import { computeMoSurface, evaluateMo } from '../src/chem/extended-huckel/mo-surface';
import type { BasisFunction } from '../src/chem/extended-huckel/assign-basis';

const atom = (x = 0, y = 0, z = 0): Molecule['atoms'] => [{ element: 'H', x, y, z, charge: 0 }];

const s1 = (zeta: number): BasisFunction => ({
  atomIndex: 0, angular: 's', axis: [0, 0, 0], n: 1, zeta, hii: -13.6, label: 'H 1s',
});

const probe = { value: 0, gx: 0, gy: 0, gz: 0 };

describe('the MO isosurface', () => {
  it('evaluates a normalized 1s Slater orbital to its known value', () => {
    // (ζ³/π)^½ e^(−ζr) with ζ = 1 bohr⁻¹, at r = 0.3 Å = 0.5669 bohr
    const expected = Math.sqrt(1 / Math.PI) * Math.exp(-0.3 * 1.8897259886);
    evaluateMo(0.3, 0, 0, atom(), [s1(1)], [1], probe);
    expect(probe.value).toBeCloseTo(expected, 10);
    // and the p normalization is √(3/4π)·cosθ against the same radial part
    const p: BasisFunction = { atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 2, zeta: 1, hii: -13.6, label: 'H 2pz' };
    const radial = Math.pow(2, 2.5) / Math.sqrt(24) * 0.3 * 1.8897259886 * Math.exp(-0.3 * 1.8897259886);
    evaluateMo(0, 0, 0.3, atom(), [p], [1], probe);
    expect(probe.value).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)) * radial, 10);
  });

  it('reports the analytic gradient, not a finite difference of it', () => {
    const molecule = { atoms: atom(), bonds: [] };
    const basis = [s1(1.3), { atomIndex: 0, angular: 'p' as const, axis: [1, 0, 0] as [number, number, number], n: 2, zeta: 1.3, hii: -13.6, label: 'H 2px' }];
    const coefficients = [0.7, -0.4];
    const h = 1e-5;
    for (const [px, py, pz] of [[0.4, 0.2, -0.3], [-0.7, 0.5, 0.1], [0.1, -0.9, 0.6]]) {
      evaluateMo(px, py, pz, molecule.atoms, basis, coefficients, probe);
      const numeric = (dx: number, dy: number, dz: number) => {
        evaluateMo(px + dx * h, py + dy * h, pz + dz * h, molecule.atoms, basis, coefficients, probe);
        const plus = probe.value;
        evaluateMo(px - dx * h, py - dy * h, pz - dz * h, molecule.atoms, basis, coefficients, probe);
        return (plus - probe.value) / (2 * h);
      };
      // relative, not absolute: a central difference at h = 1e-5 carries its
      // own ~1e-4 relative error at these points, and it is the difference
      // that should be small, not the absolute agreement
      const close = (analytic: number, numeric: number) =>
        expect(Math.abs(analytic - numeric) / Math.max(1e-9, Math.abs(analytic))).toBeLessThan(1e-3);
      close(probe.gx, numeric(1, 0, 0));
      close(probe.gy, numeric(0, 1, 0));
      close(probe.gz, numeric(0, 0, 1));
    }
  });

  it('builds a closed surface for every phase of benzene\'s π HOMO', () => {
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Benzene'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const snapped = symmetrizeMolecule(raw);
    const molecule = { atoms: snapped.atoms, bonds: raw.bonds };
    const result = solveExtendedHuckel(molecule)!;
    const surface = computeMoSurface(molecule, result.basis, result.coefficients[14]);

    expect(surface.vertexCount).toBeGreaterThan(0);
    expect(surface.vertexCount % 3).toBe(0);

    // every undirected edge of a closed surface belongs to exactly two
    // triangles — the invariant that catches a broken case table (and the
    // slivers, if they were skipped)
    const key = (i: number) => [
      Math.round(surface.positions[i * 3] * 1e6),
      Math.round(surface.positions[i * 3 + 1] * 1e6),
      Math.round(surface.positions[i * 3 + 2] * 1e6),
    ].join(',');
    const edges = new Map<string, number>();
    for (let t = 0; t < surface.vertexCount; t += 3) {
      const corners = [key(t), key(t + 1), key(t + 2)];
      for (let e = 0; e < 3; e++) {
        const a = corners[e];
        const b = corners[(e + 1) % 3];
        const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    expect([...edges.values()].filter((n) => n !== 2)).toEqual([]);

    // an e1g member alternates in sign around the ring: the two phases have
    // comparable areas. (A surface that lost a sheet, or signed its vertices
    // from |ψ|, comes out 100/0.)
    let positive = 0;
    for (const phase of surface.phases) if (phase > 0) positive++;
    const fraction = positive / surface.phases.length;
    expect(fraction).toBeGreaterThan(0.35);
    expect(fraction).toBeLessThan(0.65);
  });

  it('stays inside the grid, so the surface is never clipped open', () => {
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Benzene'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const molecule = { atoms: symmetrizeMolecule(raw).atoms, bonds: raw.bonds };
    const result = solveExtendedHuckel(molecule)!;
    const frame = alignToPrincipalAxes(molecule);
    const surface = computeMoSurface(molecule, result.basis, result.coefficients[14]);
    // the π lobes stick out of the ring plane but not past the atoms' reach
    let maxDistance = 0;
    for (let i = 0; i < surface.vertexCount; i++) {
      const x = surface.positions[i * 3];
      const y = surface.positions[i * 3 + 1];
      const z = surface.positions[i * 3 + 2];
      let nearest = Infinity;
      for (const a of molecule.atoms) nearest = Math.min(nearest, Math.hypot(x - a.x, y - a.y, z - a.z));
      maxDistance = Math.max(maxDistance, nearest);
    }
    expect(maxDistance).toBeLessThan(3);
    // and the frame's own extent is small for a planar molecule
    expect(frame.axes.length).toBe(3);
  });

  it('refines the grid for a small molecule instead of using the coarse cap', () => {
    // A fixed 0.25 Å grid gives ~0.14 Å facets, which on a 1 Å lone pair is
    // what "jagged" meant. The step adapts to an evaluation budget, so a
    // three-atom molecule gets a much finer grid than the cap.
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Water'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const molecule = { atoms: symmetrizeMolecule(raw).atoms, bonds: raw.bonds };
    const result = solveExtendedHuckel(molecule)!;
    const surface = computeMoSurface(molecule, result.basis, result.coefficients[3]);

    let edgeSum = 0;
    let edgeCount = 0;
    for (let t = 0; t < surface.vertexCount; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = (t + e) * 3;
        const b = (t + ((e + 1) % 3)) * 3;
        edgeSum += Math.hypot(
          surface.positions[a] - surface.positions[b],
          surface.positions[a + 1] - surface.positions[b + 1],
          surface.positions[a + 2] - surface.positions[b + 2],
        );
        edgeCount++;
      }
    }
    expect(edgeSum / edgeCount).toBeLessThan(0.1);
  });

  it('returns nothing for a coefficient set that is all zero', () => {
    const molecule = { atoms: atom(), bonds: [] };
    const surface = computeMoSurface(molecule, [s1(1)], [0]);
    expect(surface.vertexCount).toBe(0);
    expect(surface.isovalue).toBe(0);
  });
});
