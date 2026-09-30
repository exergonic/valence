// Extended Hückel: the overlaps, the Hamiltonian and the orbital ladder.
//
// Two independent sources of truth, both used here:
//
//  1. ANALYTIC. The 1s–1s overlap has a textbook closed form for equal
//     exponents, and the 1s–2pσ integral was derived for this test by
//     integrating the Slater orbitals in prolate spheroidal coordinates:
//     S = (ζR)⁴/8 · [2A₃(ρ) − (2/3)A₁(ρ)]. Either pin fails loudly if the
//     A/B auxiliary functions or the binomial sum drift.
//
//  2. THE ORACLE. tests/references/eht holds YAeHMOP `bind` 3.1.0b2 output
//     for six molecules on the app's own example geometries (see the
//     provenance block in eht-reference.json and the raw .out files beside
//     it). bind prints 4 decimals, and its H entries reach ~70 eV, so a
//     5e-5 rounding in S propagates to a few 1e-3 eV in H and ~0.03 eV in
//     the highest virtual orbitals — that is the precision floor of this
//     comparison, not our error. The occupied ladder matches to ≤0.001 eV.
//
// The oracle runs with `nonweighted`: YAeHMOP defaults to the ABTH-weighted
// Hij form, while this implementation (per PLAN.md) uses Hoffmann's plain
// K = 1.75. Same formula, or the numbers would not be comparable.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { abFunctions, radialComponent, overlapMatrix } from '../src/chem/extended-huckel/slater-overlap';
import { assignBasis } from '../src/chem/extended-huckel/assign-basis';
import { hamiltonianMatrix, WOLFSBERG_HELMHOLZ_K } from '../src/chem/extended-huckel/hamiltonian';
import { solveExtendedHuckel, closedShellOccupations } from '../src/chem/extended-huckel/solve';
import { alignToPrincipalAxes, frameDirectionToWorld } from '../src/chem/extended-huckel/align-principal-axes';
import {
  canonicalizeDegenerateSets,
  CANONICAL_TOLERANCE_EV,
  DEGENERATE_TOLERANCE_EV,
} from '../src/chem/extended-huckel/canonicalize-degenerate';
import { symmetrizeMolecule } from '../src/geometry/symmetrize';
import { embedAndRefine } from '../src/geometry/mmff-refine';
import { MO_SIGNIFICANT } from '../src/render/mo-lobes';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';

interface Fixture {
  provenance: Record<string, unknown>;
  molecules: Array<{
    name: string;
    electrons: number;
    atoms: Array<{ element: string; x: number; y: number; z: number }>;
    aoLabels: string[];
    S: number[][];
    H: number[][];
    energies: number[];
    occupations: number[];
  }>;
}

const fixtures: Fixture = JSON.parse(
  readFileSync(new URL('./references/eht/eht-reference.json', import.meta.url), 'utf8'),
);
const moleculeOf = (atoms: Fixture['molecules'][number]['atoms']): Molecule => ({
  atoms: atoms.map((a) => ({ ...a, charge: 0 })),
  bonds: [],
});

// The reporter's benzene (their local-pipeline export), the geometry that exposed
// both the frame bug and the degenerate-set question.
const reporterBenzene = parseMolBlock(`Valence export
  converter

 12 12  0  0  0  0  0  0  0  0999 V2000
    2.2860    0.7785    0.0662 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.3086    2.1651   -0.0831 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.1309    2.8550   -0.3703 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0695    2.1582   -0.5084 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0924    0.7718   -0.3580 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0854    0.0819   -0.0707 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.2037    0.2410    0.2893 H   0  0  0  0  0  0  0  0  0  0  0  0
    3.2439    2.7080    0.0243 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.1486    3.9354   -0.4866 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.9870    2.6956   -0.7331 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0278    0.2290   -0.4648 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.0675   -0.9984    0.0464 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  6  1  0  0  0  0
  6  1  2  0  0  0  0
  1  7  1  0  0  0  0
  2  8  1  0  0  0  0
  3  9  1  0  0  0  0
  4 10  1  0  0  0  0
  5 11  1  0  0  0  0
  6 12  1  0  0  0  0
  M  END
`);

describe('slater-overlap — the radial integrals', () => {
  it('1s–1s with equal exponents is the textbook e^-ρ(1 + ρ + ρ²/3)', () => {
    for (const [zeta, R] of [[1, 1.5], [2.275, 0.9579], [1.3, 0.74]] as const) {
      const rho = zeta * R;
      expect(radialComponent(1, 0, 1, 0, 0, zeta, zeta, R))
        .toBeCloseTo(Math.exp(-rho) * (1 + rho + (rho * rho) / 3), 12);
    }
  });

  it('1s–2pσ matches an independent derivation: (ζR)⁴/8 · [2A₃ − (2/3)A₁]', () => {
    for (const [zeta, R] of [[1, 1.5], [1, 2.5], [1.3, 1.81]] as const) {
      const { A } = abFunctions(zeta, zeta, R, 5);
      const derived = (Math.pow(zeta * R, 4) / 8) * (2 * A[3] - (2 / 3) * A[1]);
      expect(radialComponent(1, 0, 2, 1, 0, zeta, zeta, R)).toBeCloseTo(derived, 12);
    }
  });

  it('the overlap matrix is symmetric, unit-diagonal, and blind to coincident atoms', () => {
    const water = fixtures.molecules.find((m) => m.name.startsWith('Water'))!;
    const mol = moleculeOf(water.atoms);
    const basis = assignBasis(mol)!;
    const S = overlapMatrix(basis, mol.atoms);
    for (let i = 0; i < basis.length; i++) {
      expect(S[i][i]).toBe(1);
      for (let j = 0; j < basis.length; j++) expect(S[i][j]).toBe(S[j][i]);
    }
    // two orbitals on the same atom do not overlap
    const sameAtom = basis.findIndex((b, i) => i > 0 && b.atomIndex === basis[0].atomIndex);
    expect(S[0][sameAtom]).toBe(0);
  });
});

describe('extended Hückel against the YAeHMOP oracle', () => {
  for (const fixture of fixtures.molecules) {
    it(`${fixture.name}: basis order, S, H and the orbital ladder`, () => {
      const mol = moleculeOf(fixture.atoms);
      const result = solveExtendedHuckel(mol);
      expect(result).not.toBeNull();
      const { basis, overlap, hamiltonian, energies, electronCount } = result!;
      // These fixtures are YAeHMOP's own output for coordinates aligned by
      // scripts/eht-fixtures.ts, and they are compared verbatim. For a linear
      // molecule (N₂, ethyne) the two axes perpendicular to the molecular axis
      // are degenerate, so the frame's choice between them is arbitrary and the
      // px/py/pz names are a statement about that frame — a σ orbital is the p
      // *along* the axis, whichever name it landed on (N₂'s reads 2py). That is
      // not a bug to fix by re-aligning the fixtures: editing the ground truth
      // would replace an independent oracle with a hand-transformed copy of
      // itself. See NOTES.md.
      const n = fixture.aoLabels.length;

      expect(basis.length).toBe(n);
      expect(electronCount).toBe(fixture.electrons);
      // the same atomic orbitals in the same order as the oracle printed
      expect(basis.map((b) => b.label)).toEqual(fixture.aoLabels);

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          expect(Math.abs(overlap[i][j] - fixture.S[i][j])).toBeLessThan(2e-4);
          expect(Math.abs(hamiltonian[i][j] - fixture.H[i][j])).toBeLessThan(5e-3);
        }
      }

      expect(energies.length).toBe(fixture.energies.length);
      for (let k = 0; k < energies.length; k++) {
        expect(Math.abs(energies[k] - fixture.energies[k])).toBeLessThan(0.05);
      }
      // the occupied ladder is the part a chemist reads: pin it tighter
      const filled = fixture.occupations.filter((o) => o > 0).length;
      for (let k = 0; k < filled; k++) {
        expect(Math.abs(energies[k] - fixture.energies[k])).toBeLessThan(0.002);
      }
    });
  }

  it('benzene: the HOMO is the degenerate π pair, as EH has always said', () => {
    const benzene = fixtures.molecules.find((m) => m.name.startsWith('Benzene'))!;
    const result = solveExtendedHuckel(moleculeOf(benzene.atoms))!;
    const occupied = result.energies.slice(0, result.electronCount / 2);
    const homo = occupied[occupied.length - 1];
    const nextDown = occupied[occupied.length - 2];
    // Degenerate by symmetry; the app's example ring is rounded to 4 decimals,
    // so the pair splits by ~1e-4 eV — the geometry's precision, not the
    // solver's.
    expect(Math.abs(homo - nextDown)).toBeLessThan(1e-3);
    expect(homo).toBeCloseTo(-12.797, 2);
  });
});

describe('the calculation frame', () => {
  // The AO basis is tied to the coordinate axes, so the frame decides what
  // "pz" means. Reported 2026-09-29: a local-pipeline benzene (whose ring
  // lands in an arbitrary plane) showed skewed lobes and px/py mixing in a
  // π orbital — 6 of the 12 drawn AOs were not pz. The solver now runs in
  // the molecule's principal-axis frame.

  it('the reported geometry gives a clean pz π HOMO, not a px/py mixture', () => {
    const result = solveExtendedHuckel(reporterBenzene)!;
    const mo = result.coefficients[14];
    const largest = Math.max(...mo.map(Math.abs));
    const drawn = result.basis.filter((_, i) => Math.abs(mo[i]) / largest >= 0.08);
    // every drawn AO is pz — no px/py mixing. The count is 4 or 6: the pair is
    // canonicalized, so one member carries the two nodal atoms (4) and the
    // other the two nodal bonds (6).
    expect([4, 6]).toContain(drawn.length);
    for (const orbital of drawn) expect(orbital.label.endsWith('2pz')).toBe(true);
  });

  it('the drawn pz lobes are perpendicular to the ring plane', () => {
    const result = solveExtendedHuckel(reporterBenzene)!;
    // the ring normal from three ring carbons
    const [p0, p1, p2] = [0, 1, 2].map((i) => reporterBenzene.atoms[i]);
    const v1 = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
    const v2 = [p2.x - p0.x, p2.y - p0.y, p2.z - p0.z];
    const n = [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    const world = frameDirectionToWorld(result.frame, [0, 0, 1]);
    const cos = Math.abs((world[0] * n[0] + world[1] * n[1] + world[2] * n[2]) / len);
    expect(cos).toBeCloseTo(1, 6);
  });

  it('rotating a molecule does not move its levels — the physics is frame-free', () => {
    const water = fixtures.molecules.find((m) => m.name.startsWith('Water'))!;
    const mol = moleculeOf(water.atoms);
    const a = 0.7, b = 0.9;
    const rotate = (p: { x: number; y: number; z: number }) => ({
      x: p.x * Math.cos(a) + p.z * Math.sin(a),
      y: p.x * Math.sin(a) * Math.sin(b) + p.y * Math.cos(b) - p.z * Math.cos(a) * Math.sin(b),
      z: -p.x * Math.sin(a) * Math.cos(b) + p.y * Math.sin(b) + p.z * Math.cos(a) * Math.cos(b),
    });
    const rotated = { atoms: mol.atoms.map((atom) => ({ ...rotate(atom), element: atom.element, charge: 0 })), bonds: [] };
    const straight = solveExtendedHuckel(mol)!.energies;
    const turned = solveExtendedHuckel(rotated)!.energies;
    expect(turned.length).toBe(straight.length);
    for (let i = 0; i < straight.length; i++) expect(Math.abs(turned[i] - straight[i])).toBeLessThan(1e-9);
  });

  it('the frame axes are orthonormal and right-handed', () => {
    const frame = alignToPrincipalAxes(reporterBenzene).axes;
    for (let i = 0; i < 3; i++) {
      expect(Math.hypot(...frame[i])).toBeCloseTo(1, 12);
      for (let j = i + 1; j < 3; j++) {
        expect(frame[i][0] * frame[j][0] + frame[i][1] * frame[j][1] + frame[i][2] * frame[j][2]).toBeCloseTo(0, 12);
      }
    }
    const [x, y, z] = frame;
    expect(x[1] * y[2] - x[2] * y[1]).toBeCloseTo(z[0], 12);
    expect(x[2] * y[0] - x[0] * y[2]).toBeCloseTo(z[1], 12);
    expect(x[0] * y[1] - x[1] * y[0]).toBeCloseTo(z[2], 12);
  });
});

describe('canonical orbitals for degenerate sets', () => {
  // The solver returns AN orthonormal basis of a degenerate subspace; any
  // orthogonal combination is the same physics. Two programs therefore pick
  // different mixtures, and comparing them one-to-one compares arbitrary
  // representatives — reported 2026-09-29 against WebMO, whose symmetrizer
  // hands it a symmetry-exact geometry and symmetry-adapted orbitals. These
  // orbitals are canonicalized by diagonalizing x², then y², then z² inside
  // each set, which is what makes them look like the textbook ones.

  it('an isolated atom gives pure px, py and pz', () => {
    const atom = solveExtendedHuckel(parseMolBlock(`Valence export
  converter

  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`))!;
    // the three p orbitals are one degenerate set: each must come out as a
    // single AO, one per axis
    const axes = ['2px', '2py', '2pz'];
    const seen: string[] = [];
    for (let mo = 0; mo < atom.energies.length; mo++) {
      const coefficients = atom.coefficients[mo];
      const largest = Math.max(...coefficients.map(Math.abs));
      if (largest < 0.5) continue; // the 2s orbital
      const significant = atom.basis
        .map((b, i) => ({ kind: b.label.split(' ').pop()!, c: coefficients[i] }))
        .filter((e) => Math.abs(e.c) / largest > 0.5);
      expect(significant.length).toBe(1);
      if (significant[0].kind === '2s') continue; // the 2s orbital is a singlet, not part of the p set
      seen.push(significant[0].kind);
    }
    expect(seen.sort()).toEqual(axes);
  });

  it('the canonical e1g pair of benzene is the textbook pair: one member carries the nodal atoms', () => {
    // the app snaps the geometry to its point group before solving, which is
    // what makes the pair exactly degenerate (2.3 meV before, 1e-9 meV after)
    const snapped = symmetrizeMolecule(reporterBenzene);
    const result = solveExtendedHuckel({ atoms: snapped.atoms, bonds: reporterBenzene.bonds })!;
    // the pair is MO 14/15 in this ladder; the in-plane frame decides which
    // member has its nodes through atoms and which through bonds, so assert
    // the shape of the pair rather than which one is which
    const pz = result.basis.map((b, i) => (b.label.endsWith('2pz') ? i : -1)).filter((i) => i >= 0);
    // the drawing's own significance threshold: the reporter's ring is a few
    // 1e-4 Å off perfect symmetry, so the "nodal" atoms carry 0.056 rather
    // than exactly 0 — invisible as lobes, visible as a number
    const counts = [13, 14].map((mo) => {
      const largest = Math.max(...result.coefficients[mo].map(Math.abs));
      return pz.filter((i) => Math.abs(result.coefficients[mo][i]) / largest >= MO_SIGNIFICANT).length;
    });
    expect(counts.filter((c) => c === 4).length).toBe(1); // nodes through two atoms
    expect(counts.filter((c) => c === 6).length).toBe(1); // nodes through two bonds
  });

  it('canonicalizing twice changes nothing', () => {
    const result = solveExtendedHuckel(reporterBenzene)!;
    const framed = alignToPrincipalAxes(reporterBenzene).atoms;
    const again = canonicalizeDegenerateSets(result.basis, result.coefficients, result.energies, framed);
    for (let mo = 0; mo < again.length; mo++) {
      for (let ao = 0; ao < again[mo].length; ao++) {
        expect(again[mo][ao]).toBeCloseTo(result.coefficients[mo][ao], 10);
      }
    }
  });

  it('the rotation stays inside the subspace: the projector is unchanged', () => {
    // a hand-made degenerate pair, rotated by an arbitrary angle, must
    // canonicalize back to the same two-dimensional space
    const basis = [
      { atomIndex: 0, angular: 'p' as const, axis: [1, 0, 0] as [number, number, number], n: 2, zeta: 1, hii: -1, label: 'A 2px' },
      { atomIndex: 1, angular: 'p' as const, axis: [1, 0, 0] as [number, number, number], n: 2, zeta: 1, hii: -1, label: 'B 2px' },
      { atomIndex: 2, angular: 'p' as const, axis: [1, 0, 0] as [number, number, number], n: 2, zeta: 1, hii: -1, label: 'C 2px' },
      { atomIndex: 3, angular: 'p' as const, axis: [1, 0, 0] as [number, number, number], n: 2, zeta: 1, hii: -1, label: 'D 2px' },
    ];
    const atoms = [
      { element: 'C', x: 1, y: 0, z: 0, charge: 0 },
      { element: 'C', x: 0, y: 1, z: 0, charge: 0 },
      { element: 'C', x: -1, y: 0, z: 0, charge: 0 },
      { element: 'C', x: 0, y: -1, z: 0, charge: 0 },
    ];
    const theta = 0.4;
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const pair = [
      a.map((v, i) => v * Math.cos(theta) + b[i] * Math.sin(theta)),
      a.map((v, i) => -v * Math.sin(theta) + b[i] * Math.cos(theta)),
    ];
    const canonical = canonicalizeDegenerateSets(basis, pair, [1, 1], atoms);
    // the projector onto the space must be identical before and after
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const before = pair[0][i] * pair[0][j] + pair[1][i] * pair[1][j];
        const after = canonical[0][i] * canonical[0][j] + canonical[1][i] * canonical[1][j];
        expect(after).toBeCloseTo(before, 12);
      }
    }
  });

  it('the solver rotates only exactly-degenerate sets; the panel groups loosely', () => {
    // rotating states whose energies differ replaces eigenstates with a
    // mixture — right energies, wrong orbital. The solver's tolerance is
    // therefore tight, and the diagram's grouping is a separate, display-only
    // choice.
    expect(CANONICAL_TOLERANCE_EV).toBe(1e-5);
    expect(DEGENERATE_TOLERANCE_EV).toBe(0.005);
    expect(CANONICAL_TOLERANCE_EV).toBeLessThan(DEGENERATE_TOLERANCE_EV);
  });
});

describe('the extended-Hückel refusals', () => {
  it('an element outside the parameter table gets no orbitals', () => {
    const iron: Molecule = { atoms: [{ element: 'Fe', x: 0, y: 0, z: 0, charge: 0 }], bonds: [] };
    expect(assignBasis(iron)).toBeNull();
    expect(solveExtendedHuckel(iron)).toBeNull();
  });

  it('closed-shell filling refuses an odd electron count instead of half-filling', () => {
    expect(closedShellOccupations(8, 6)).toEqual([2, 2, 2, 2, 0, 0]);
    expect(closedShellOccupations(7, 6)).toBeNull(); // a radical
    expect(closedShellOccupations(13, 6)).toBeNull(); // more electrons than orbitals
  });

  it('refuses a partly filled degenerate set — O₂’s π* holds two electrons between two orbitals', () => {
    const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Oxygen'))!.mol)!;
    const raw = embedAndRefine(sketch).molecule;
    const snapped = symmetrizeMolecule(raw);
    const result = solveExtendedHuckel({ atoms: snapped.atoms, bonds: raw.bonds })!;
    // 12 valence electrons, an even count. Without the energies the degeneracy
    // is invisible and the numeric filling happily doubles six orbitals.
    expect(result.electronCount).toBe(12);
    expect(closedShellOccupations(result.electronCount, result.energies.length)).toEqual(
      [2, 2, 2, 2, 2, 2, 0, 0],
    );
    expect(closedShellOccupations(result.electronCount, result.energies.length, result.energies)).toBeNull();
  });

  it('the Wolfsberg–Helmholz constant is Hoffmann 1963, not a tuned number', () => {
    expect(WOLFSBERG_HELMHOLZ_K).toBe(1.75);
  });
});

describe('the Hamiltonian', () => {
  it('is the Wolfsberg–Helmholz form: Hᵢⱼ = ½K(Hᵢᵢ+Hⱼⱼ)Sᵢⱼ, diagonal = VSIP', () => {
    const water = fixtures.molecules.find((m) => m.name.startsWith('Water'))!;
    const mol = moleculeOf(water.atoms);
    const basis = assignBasis(mol)!;
    const S = overlapMatrix(basis, mol.atoms);
    const H = hamiltonianMatrix(basis, S);
    for (let i = 0; i < basis.length; i++) {
      expect(H[i][i]).toBe(basis[i].hii);
      for (let j = 0; j < i; j++) {
        expect(H[i][j]).toBeCloseTo(0.5 * 1.75 * (basis[i].hii + basis[j].hii) * S[i][j], 12);
      }
    }
  });
});
