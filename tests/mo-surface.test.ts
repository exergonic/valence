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

/** CODATA Bohr radius in Å, written out rather than imported. The 1s value
 *  below is the pin that the surface and the overlap integrals share a unit;
 *  importing BOHR_RADIUS would let a typo in that constant pass its own test. */
const BOHR_PER_ANGSTROM = 1 / 0.529177210903;

const atom = (x = 0, y = 0, z = 0): Molecule['atoms'] => [{ element: 'H', x, y, z, charge: 0 }];

const s1 = (zeta: number): BasisFunction => ({
  atomIndex: 0, angular: 's', axis: [0, 0, 0], n: 1, zeta, hii: -13.6, label: 'H 1s',
});

const probe = { value: 0, gx: 0, gy: 0, gz: 0 };

describe('the MO isosurface', () => {
  it('evaluates a normalized 1s Slater orbital to its known value', () => {
    // (ζ³/π)^½ e^(−ζr) with ζ = 1 bohr⁻¹, at r = 0.3 Å = 0.5669 bohr
    const expected = Math.sqrt(1 / Math.PI) * Math.exp(-0.3 * BOHR_PER_ANGSTROM);
    evaluateMo(0.3, 0, 0, atom(), [s1(1)], [1], probe);
    expect(probe.value).toBeCloseTo(expected, 10);
    // and the p normalization is √(3/4π)·cosθ against the same radial part
    const p: BasisFunction = { atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 2, zeta: 1, hii: -13.6, label: 'H 2pz' };
    const radial = Math.pow(2, 2.5) / Math.sqrt(24) * 0.3 * BOHR_PER_ANGSTROM * Math.exp(-0.3 * BOHR_PER_ANGSTROM);
    evaluateMo(0, 0, 0.3, atom(), [p], [1], probe);
    expect(probe.value).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)) * radial, 10);
  });

  it('uses r^(n−1) for a heavy atom, not the 2p radial factor', () => {
    // Chlorine is 3p, bromine 4p, iodine 5p. The evaluator used to write
    // r^(n−1) as "1 or r", so an iodine 5p peaked at 0.23 Å instead of
    // (n−1)/ζ = 0.91 Å and the |ψ| = 0.10 sheet sat inside the atom sphere.
    const bohr = BOHR_PER_ANGSTROM;
    const angular = Math.sqrt(3 / (4 * Math.PI));
    const cases = [
      { element: 'Cl', n: 3, zeta: 1.733, rA: 0.6 },
      { element: 'Br', n: 4, zeta: 2.131, rA: 0.75 },
      { element: 'I', n: 5, zeta: 2.322, rA: 0.91 },
    ];
    for (const { element, n, zeta, rA } of cases) {
      let factorial = 1;
      for (let k = 2; k <= 2 * n; k++) factorial *= k;
      const normalization = Math.pow(2 * zeta, n + 0.5) / Math.sqrt(factorial);
      const rb = rA * bohr;
      const expected = normalization * Math.pow(rb, n - 1) * Math.exp(-zeta * rb) * angular;
      const basis: BasisFunction = {
        atomIndex: 0, angular: 'p', axis: [0, 0, 1], n, zeta, hii: -12, label: `${element} ${n}pz`,
      };
      evaluateMo(0, 0, rA, [{ element, x: 0, y: 0, z: 0, charge: 0 }], [basis], [1], probe);
      expect(probe.value).toBeCloseTo(expected, 8);
    }

    // and the sheet at 0.10 — where I₂'s π surfaces were barely visible —
    // reaches past the radial maximum, not a scrap against the nucleus
    const iodine: BasisFunction = {
      atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 5, zeta: 2.322, hii: -12.7, label: 'I 5pz',
    };
    const molecule: Molecule = { atoms: [{ element: 'I', x: 0, y: 0, z: 0, charge: 0 }], bonds: [] };
    const surface = computeMoSurface(molecule, [iodine], [1], 0.1);
    let maxRadius = 0;
    for (let i = 0; i < surface.vertexCount; i++) {
      maxRadius = Math.max(maxRadius, Math.hypot(
        surface.positions[i * 3], surface.positions[i * 3 + 1], surface.positions[i * 3 + 2],
      ));
    }
    // (n−1)/ζ = 0.91 Å is the radial maximum; |ψ| = 0.10 crosses again near 1.53 Å.
    // The 2p formula's whole sheet lived inside 0.58 Å.
    expect(maxRadius).toBeGreaterThan(1.2);
  });

  it('evaluates a normalized 3d Slater orbital, and its gradient, exactly', () => {
    // The d functions are the ones the 3d basis brings in: a normalized real d
    // harmonic against the same radial part. The value pins the normalization
    // (√(15/16π) for x²−y², √(5/16π) for z², √(15/4π) for the cross terms) and
    // the gradient pins ∇[f/r²] = ∇f/r² − 2f d/r⁴, which is what the mesh
    // normals are built from.
    const radial = (n: number, zeta: number, rb: number) => {
      let factorial = 1;
      for (let k = 2; k <= 2 * n; k++) factorial *= k;
      return Math.pow(2 * zeta, n + 0.5) / Math.sqrt(factorial) * Math.pow(rb, n - 1) * Math.exp(-zeta * rb);
    };
    const kinds = [
      { d: 'x2-y2' as const, f: (x: number, y: number, z: number) => x * x - y * y, norm: Math.sqrt(15 / (16 * Math.PI)) },
      { d: 'z2' as const, f: (x: number, y: number, z: number) => 2 * z * z - x * x - y * y, norm: Math.sqrt(5 / (16 * Math.PI)) },
      { d: 'xy' as const, f: (x: number, y: number, z: number) => x * y, norm: Math.sqrt(15 / (4 * Math.PI)) },
      { d: 'xz' as const, f: (x: number, y: number, z: number) => x * z, norm: Math.sqrt(15 / (4 * Math.PI)) },
      { d: 'yz' as const, f: (x: number, y: number, z: number) => y * z, norm: Math.sqrt(15 / (4 * Math.PI)) },
    ];
    const n = 3;
    const zeta = 1.5;
    const point = [0.4, -0.25, 0.55] as [number, number, number];
    const r = Math.hypot(...point);
    const rb = r * BOHR_PER_ANGSTROM;
    for (const { d, f, norm } of kinds) {
      const basis: BasisFunction = { atomIndex: 0, angular: 'd', axis: [0, 0, 0], d, n, zeta, hii: -8, label: `S ${n}d${d}` };
      evaluateMo(point[0], point[1], point[2], atom(), [basis], [1], probe);
      const expected = radial(n, zeta, rb) * norm * f(point[0], point[1], point[2]) / (r * r);
      expect(probe.value).toBeCloseTo(expected, 10);

      // the analytic gradient against a central difference of the same value
      const h = 1e-5;
      for (const axis of [0, 1, 2]) {
        const step = [0, 0, 0];
        step[axis] = h;
        evaluateMo(point[0] + step[0], point[1] + step[1], point[2] + step[2], atom(), [basis], [1], probe);
        const plus = probe.value;
        evaluateMo(point[0] - step[0], point[1] - step[1], point[2] - step[2], atom(), [basis], [1], probe);
        const numeric = (plus - probe.value) / (2 * h);
        evaluateMo(point[0], point[1], point[2], atom(), [basis], [1], probe);
        const analytic = [probe.gx, probe.gy, probe.gz][axis];
        expect(Math.abs(analytic - numeric) / Math.max(1e-9, Math.abs(analytic))).toBeLessThan(1e-3);
      }
    }
  });

  it('evaluates a CONTRACTED d — the two-zeta sum the d block brings', () => {
    // Iron's 3d as the table ships it. A contracted orbital is a sum of two
    // STOs, so the amplitude is a sum too — and the sum is where a factor of
    // the coefficient or a dropped term would hide, since a single-zeta test
    // cannot see it.
    const [c1, c2] = [0.5505, 0.6260];
    const [z1, z2] = [5.35, 2.0];
    const n = 3;
    const basis: BasisFunction = {
      atomIndex: 0, angular: 'd', axis: [0, 0, 0], d: 'z2',
      n, zeta: z1, zeta2: z2, coefficients: [c1, c2], hii: -12.6, label: 'Fe 3dz2',
    };
    const sto = (zeta: number, rb: number) => {
      let factorial = 1;
      for (let k = 2; k <= 2 * n; k++) factorial *= k;
      return Math.pow(2 * zeta, n + 0.5) / Math.sqrt(factorial) * rb * rb * Math.exp(-zeta * rb);
    };
    const point = [0.35, -0.2, 0.5] as [number, number, number];
    const r = Math.hypot(...point);
    const rb = r * BOHR_PER_ANGSTROM;
    const angular = Math.sqrt(5 / (16 * Math.PI)) * (2 * point[2] * point[2] - point[0] * point[0] - point[1] * point[1]) / (r * r);
    const expected = (c1 * sto(z1, rb) + c2 * sto(z2, rb)) * angular;
    evaluateMo(point[0], point[1], point[2], atom(), [basis], [1], probe);
    expect(probe.value).toBeCloseTo(expected, 10);

    // and the gradient keeps matching a central difference with both terms in
    const h = 1e-5;
    for (const axis of [0, 1, 2]) {
      const step = [0, 0, 0];
      step[axis] = h;
      evaluateMo(point[0] + step[0], point[1] + step[1], point[2] + step[2], atom(), [basis], [1], probe);
      const plus = probe.value;
      evaluateMo(point[0] - step[0], point[1] - step[1], point[2] - step[2], atom(), [basis], [1], probe);
      const numeric = (plus - probe.value) / (2 * h);
      evaluateMo(point[0], point[1], point[2], atom(), [basis], [1], probe);
      const analytic = [probe.gx, probe.gy, probe.gz][axis];
      expect(Math.abs(analytic - numeric) / Math.max(1e-9, Math.abs(analytic))).toBeLessThan(1e-3);
    }
  });

  it('differentiates an n>2 Slater orbital, not the 2p derivative', () => {
    const basis: BasisFunction = {
      atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 5, zeta: 2.322, hii: -12.7, label: 'I 5pz',
    };
    const atoms = [{ element: 'I', x: 0, y: 0, z: 0, charge: 0 }];
    const h = 1e-5;
    for (const [px, py, pz] of [[0.4, 0.2, 0.8], [-0.3, 0.5, 1.1], [0.2, -0.4, 0.6]]) {
      evaluateMo(px, py, pz, atoms, [basis], [1], probe);
      const analytic = { gx: probe.gx, gy: probe.gy, gz: probe.gz };
      const numeric = (dx: number, dy: number, dz: number) => {
        evaluateMo(px + dx * h, py + dy * h, pz + dz * h, atoms, [basis], [1], probe);
        const plus = probe.value;
        evaluateMo(px - dx * h, py - dy * h, pz - dz * h, atoms, [basis], [1], probe);
        return (plus - probe.value) / (2 * h);
      };
      const close = (a: number, b: number) =>
        expect(Math.abs(a - b) / Math.max(1e-9, Math.abs(a))).toBeLessThan(1e-3);
      close(analytic.gx, numeric(1, 0, 0));
      close(analytic.gy, numeric(0, 1, 0));
      close(analytic.gz, numeric(0, 0, 1));
    }
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

  it('winds every triangle to agree with its own normals, on both sheets', () => {
    // The outward direction of the |ψ| = c surface is sign(ψ)·∇ψ. A triangle
    // wound against its vertex normals is back-facing, and a FrontSide pass
    // culls it — which punches the whole negative sheet out of the picture.
    // Reported on water's MO 2 as "the surface is clipping"; the first
    // version compared against ∇ψ alone and every negative-sheet triangle
    // (5,574 of 5,574) came out backwards.
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Water'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const molecule = { atoms: symmetrizeMolecule(raw).atoms, bonds: raw.bonds };
    const result = solveExtendedHuckel(molecule)!;

    for (const index of [1, 3]) {
      const surface = computeMoSurface(molecule, result.basis, result.coefficients[index]);
      const flipped = { positive: 0, negative: 0 };
      const total = { positive: 0, negative: 0 };
      for (let t = 0; t < surface.vertexCount; t += 3) {
        const at = (v: number, c: number) => surface.positions[(t + v) * 3 + c];
        const ux = at(1, 0) - at(0, 0), uy = at(1, 1) - at(0, 1), uz = at(1, 2) - at(0, 2);
        const vx = at(2, 0) - at(0, 0), vy = at(2, 1) - at(0, 1), vz = at(2, 2) - at(0, 2);
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const dot = nx * surface.normals[t * 3] + ny * surface.normals[t * 3 + 1] + nz * surface.normals[t * 3 + 2];
        const sheet = surface.phases[t] > 0 ? 'positive' : 'negative';
        total[sheet]++;
        if (dot < 0) flipped[sheet]++;
      }
      expect(total.positive).toBeGreaterThan(0);
      expect(total.negative).toBeGreaterThan(0);
      expect(flipped).toEqual({ positive: 0, negative: 0 });
    }
  });

  it('winds the surface outward, judged against a shape whose outside is known', () => {
    // A single 1s orbital's |ψ| = c surface is a sphere centred on the nucleus,
    // so "outward" here needs no reference to the field's own gradient. That is
    // the whole point: the winding and the vertex normals are both derived from
    // ∇ψ, so a test comparing them to each other is tautological about the
    // global sign — and both were inverted. The outward direction is
    // −∇|ψ| = −sign(ψ)·∇ψ (a gradient points toward increasing values, and |ψ|
    // increases inward), so getting it backwards winds the mesh inside out and
    // a FrontSide pass draws nothing but the silhouette.
    const molecule: Molecule = { atoms: [{ element: 'H', x: 0, y: 0, z: 0, charge: 0 }], bonds: [] };
    const basis: BasisFunction[] = [{
      atomIndex: 0, angular: 's', axis: [0, 0, 0], n: 1, zeta: 1, hii: -13.6, label: 'H 1s',
    }];

    for (const coefficient of [1, -1]) {
      const surface = computeMoSurface(molecule, basis, [coefficient]);
      expect(surface.vertexCount).toBeGreaterThan(0);
      // every vertex sits on a sphere of one radius
      let minRadius = Infinity;
      let maxRadius = 0;
      for (let i = 0; i < surface.vertexCount; i++) {
        const r = Math.hypot(surface.positions[i * 3], surface.positions[i * 3 + 1], surface.positions[i * 3 + 2]);
        minRadius = Math.min(minRadius, r);
        maxRadius = Math.max(maxRadius, r);
      }
      // The vertices sit on chords of a curved field, so a marching-tetrahedra
      // surface is on the sphere to the interpolation error (~0.005 Å), not to
      // machine precision. The bound is loose enough for that and far tighter
      // than the spurious nucleus blob it is there to catch (0.94 Å).
      expect(maxRadius - minRadius).toBeLessThan(0.02);

      for (let t = 0; t < surface.vertexCount; t += 3) {
        const at = (v: number, c: number) => surface.positions[(t + v) * 3 + c];
        const ux = at(1, 0) - at(0, 0), uy = at(1, 1) - at(0, 1), uz = at(1, 2) - at(0, 2);
        const vx = at(2, 0) - at(0, 0), vy = at(2, 1) - at(0, 1), vz = at(2, 2) - at(0, 2);
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const cx = (at(0, 0) + at(1, 0) + at(2, 0)) / 3;
        const cy = (at(0, 1) + at(1, 1) + at(2, 1)) / 3;
        const cz = (at(0, 2) + at(1, 2) + at(2, 2)) / 3;
        // the geometric normal must point away from the nucleus
        expect(nx * cx + ny * cy + nz * cz).toBeGreaterThan(0);
        // and so must the shading normal
        expect(surface.normals[t * 3] * at(0, 0) + surface.normals[t * 3 + 1] * at(0, 1) + surface.normals[t * 3 + 2] * at(0, 2)).toBeGreaterThan(0);
      }
      expect(surface.phases[0]).toBe(coefficient > 0 ? 1 : -1);
    }
  });

  it('returns nothing for a coefficient set that is all zero', () => {
    const molecule = { atoms: atom(), bonds: [] };
    const surface = computeMoSurface(molecule, [s1(1)], [0]);
    expect(surface.vertexCount).toBe(0);
    expect(surface.isovalue).toBe(0);
  });
});
