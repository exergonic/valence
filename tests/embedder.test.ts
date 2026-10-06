import { describe, it, expect } from 'vitest';
import { place3D } from '../src/geometry/place3d';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { embed3D, honourWedges } from '../src/geometry/embed';
import { BUTANE, PENTANE, OCTANE, HEXAN_2_AMINE, HEXAN_2_AMINE_WEDGED, NEOPENTANE, DIMETHYLBUTANE, METHYLHEXANOL, CIS_BUTENE, TRANS_BUTENE } from './references/sketches';

describe('place3D', () => {
  it('should place isolated atom at origin', () => {
    const molecule = {
      atoms: [{ element: 'C', x: 0, y: 0, z: 0 }],
      bonds: [],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toEqual([0, 0, 0]);
  });

  it('should produce 3D coords for ethane', () => {
    const molecule = {
      atoms: [
        { element: 'C', x: 0, y: 0, z: 0 },
        { element: 'C', x: 1.5, y: 0, z: 0 },
        { element: 'H', x: -0.5, y: 0.8, z: 0 },
        { element: 'H', x: -0.5, y: -0.8, z: 0 },
        { element: 'H', x: 2.0, y: 0.8, z: 0 },
        { element: 'H', x: 2.0, y: -0.8, z: 0 },
        { element: 'H', x: -0.5, y: 0, z: 0 },
        { element: 'H', x: 2.0, y: 0, z: 0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 1 },
        { atom1Index: 0, atom2Index: 2, order: 1 },
        { atom1Index: 0, atom2Index: 3, order: 1 },
        { atom1Index: 0, atom2Index: 6, order: 1 },
        { atom1Index: 1, atom2Index: 4, order: 1 },
        { atom1Index: 1, atom2Index: 5, order: 1 },
        { atom1Index: 1, atom2Index: 7, order: 1 },
      ],
    };
    const placed = place3D(molecule);
    expect(placed).toHaveLength(8);

    const zs = placed.map((p) => Math.abs(p[2]));
    expect(zs.some((z) => z > 0.1)).toBe(true);
  });

  it('should produce staggered conformation for propane via MOL', () => {
    const molBlock = `


  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;
    const molecule = fillMissingHydrogens(parseMolBlock(molBlock));
    const placed = place3D(molecule);

    // Check that not all coords are planar
    const zs = placed.map((p) => Math.abs(p[2]));
    expect(zs.some((z) => z > 0.1)).toBe(true);
  });

  it('should not crash on multiple separate rings (biphenyl — the 2026-08-12 multi-ring bug)', () => {
    // The ring walk followed a single cycle and left the OTHER rings'
    // atoms unplaced; the centroid loop then dereferenced pos[i] for
    // them and the whole local pipeline threw (the user-visible
    // symptom on methylenetriphenylphosphorane: the app fell back to
    // the raw H-less molecule). Every disjoint ring must be walked.
    const biphenyl: Molecule = {
      atoms: [
        { element: 'C', x: 0.0, y: 0.0, z: 0.0 },
        { element: 'C', x: 1.4, y: 0.0, z: 0.0 },
        { element: 'C', x: 2.1, y: 1.2, z: 0.0 },
        { element: 'C', x: 1.4, y: 2.4, z: 0.0 },
        { element: 'C', x: 0.0, y: 2.4, z: 0.0 },
        { element: 'C', x: -0.7, y: 1.2, z: 0.0 },
        { element: 'C', x: 4.0, y: 1.2, z: 0.0 },
        { element: 'C', x: 4.7, y: 0.0, z: 0.0 },
        { element: 'C', x: 6.1, y: 0.0, z: 0.0 },
        { element: 'C', x: 6.8, y: 1.2, z: 0.0 },
        { element: 'C', x: 6.1, y: 2.4, z: 0.0 },
        { element: 'C', x: 4.7, y: 2.4, z: 0.0 },
      ],
      bonds: [
        { atom1Index: 0, atom2Index: 1, order: 2 },
        { atom1Index: 1, atom2Index: 2, order: 1 },
        { atom1Index: 2, atom2Index: 3, order: 2 },
        { atom1Index: 3, atom2Index: 4, order: 1 },
        { atom1Index: 4, atom2Index: 5, order: 2 },
        { atom1Index: 5, atom2Index: 0, order: 1 },
        { atom1Index: 2, atom2Index: 6, order: 1 },
        { atom1Index: 6, atom2Index: 7, order: 2 },
        { atom1Index: 7, atom2Index: 8, order: 1 },
        { atom1Index: 8, atom2Index: 9, order: 2 },
        { atom1Index: 9, atom2Index: 10, order: 1 },
        { atom1Index: 10, atom2Index: 11, order: 2 },
        { atom1Index: 11, atom2Index: 6, order: 1 },
      ],
    };
    const placed = place3D(fillMissingHydrogens(biphenyl));
    expect(placed).toHaveLength(22); // C₁₂H₁₀
    for (const p of placed) {
      expect(Number.isFinite(p[0])).toBe(true);
      expect(Number.isFinite(p[1])).toBe(true);
      expect(Number.isFinite(p[2])).toBe(true);
    }
  });
});

// The torsions the embedder chooses, measured on sketches as JSME draws them
// (tests/references/sketches.ts). Before 2026-10-06 the walk left every
// torsion to chance and a "staggered" pass snapped it to the nearest multiple
// of 60° from arbitrary substituents — eclipsed included: chains came out
// syn (0°), octane's C3 and C8 0.17 A apart, the de-overlap then stretched a
// C–C bond to 2.54 A, and hexan-2-amine's start let GFN2 make two H2.
describe('place3D — torsions and contacts', () => {
  const embed = (mol: string) => embed3D(parseMolBlock(mol)).separated;
  const at = (m: Molecule, i: number): [number, number, number] => [m.atoms[i].x, m.atoms[i].y, m.atoms[i].z];
  const dihedral = (m: Molecule, a: number, b: number, c: number, d: number) => {
    const [p0, p1, p2, p3] = [a, b, c, d].map((i) => at(m, i));
    const sub = (u: number[], v: number[]) => u.map((x, k) => x - v[k]);
    const cross = (u: number[], v: number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = (u: number[], v: number[]) => u.reduce((s, x, k) => s + x * v[k], 0);
    const b1 = sub(p1, p0), b2 = sub(p2, p1), b3 = sub(p3, p2);
    const n1 = cross(b1, b2), n2 = cross(b2, b3);
    const m1 = cross(n1, b2.map((x) => x / Math.hypot(...b2)));
    return (Math.atan2(dot(m1, n2), dot(n1, n2)) * 180) / Math.PI;
  };
  /** Carbon indices in chain order: the sketches list a straight chain's carbons consecutively. */
  const carbons = (m: Molecule) => m.atoms.map((a, i) => (a.element === 'C' ? i : -1)).filter((i) => i >= 0);
  /** Graph distance between every pair, by breadth-first search. */
  const bondsApart = (m: Molecule) => {
    const adj: number[][] = m.atoms.map(() => []);
    for (const b of m.bonds) { adj[b.atom1Index].push(b.atom2Index); adj[b.atom2Index].push(b.atom1Index); }
    return m.atoms.map((_, s) => {
      const d = m.atoms.map(() => Infinity); d[s] = 0;
      const queue = [s];
      while (queue.length) { const u = queue.shift()!; for (const v of adj[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; queue.push(v); } }
      return d;
    });
  };

  it('lays a straight chain down all-anti — the alkane minimum, not a coil', () => {
    for (const mol of [BUTANE, PENTANE, OCTANE]) {
      const m = embed(mol);
      const c = carbons(m);
      for (let k = 0; k + 3 < c.length; k++) {
        expect(Math.abs(dihedral(m, c[k], c[k + 1], c[k + 2], c[k + 3]))).toBeGreaterThan(175);
      }
    }
  });

  it('keeps every pair three or more bonds apart out of contact', () => {
    // 1.8 A is under a gauche H···H (about 2.3 A) and well over the 0.17 A
    // and 1.02 A contacts this used to start from.
    for (const mol of [PENTANE, OCTANE, HEXAN_2_AMINE, HEXAN_2_AMINE_WEDGED, NEOPENTANE, DIMETHYLBUTANE, METHYLHEXANOL]) {
      const m = embed(mol);
      const apart = bondsApart(m);
      for (let i = 0; i < m.atoms.length; i++) {
        for (let j = i + 1; j < m.atoms.length; j++) {
          if (apart[i][j] < 3) continue;
          const r = Math.hypot(...at(m, i).map((x, k) => x - at(m, j)[k]));
          expect(r).toBeGreaterThan(1.8);
        }
      }
    }
  });

  it('keeps every bond at its covalent length — nothing stretched apart', () => {
    for (const mol of [PENTANE, OCTANE, HEXAN_2_AMINE_WEDGED, METHYLHEXANOL]) {
      const m = embed(mol);
      for (const b of m.bonds) {
        const r = Math.hypot(...at(m, b.atom1Index).map((x, k) => x - at(m, b.atom2Index)[k]));
        expect(r).toBeLessThan(1.6);
      }
    }
  });

  it('draws a double bond planar, cis or trans as sketched', () => {
    const cis = embed(CIS_BUTENE);
    const trans = embed(TRANS_BUTENE);
    // the sketches number the carbons along the chain, C1–C2=C3–C4
    expect(Math.abs(dihedral(cis, 0, 1, 2, 3))).toBeLessThan(5);
    expect(Math.abs(dihedral(trans, 0, 1, 2, 3))).toBeGreaterThan(175);
  });
});

describe('honourWedges — the wedges are read from the page', () => {
  it('leaves a correctly configured centre alone, however the model is turned', () => {
    // The optimiser hands its result back in its own orientation. The wedge
    // check used to read "front of the page" off that model's x,y, so a turn
    // of the model could make it invert a correct centre — hexan-2-amine's N
    // moved 2.3 A after GFN2, its bonds left behind.
    const { sketch, separated } = embed3D(parseMolBlock(HEXAN_2_AMINE_WEDGED));
    const turned: Molecule = { ...separated, atoms: separated.atoms.map((a) => ({ ...a, x: -a.x, z: -a.z })) }; // 180° about y
    const result = honourWedges(sketch, turned);
    expect(result.warnings).toEqual([]);
    result.molecule.atoms.forEach((a, i) => {
      expect(a.x).toBeCloseTo(turned.atoms[i].x, 9);
      expect(a.y).toBeCloseTo(turned.atoms[i].y, 9);
      expect(a.z).toBeCloseTo(turned.atoms[i].z, 9);
    });
  });
});
