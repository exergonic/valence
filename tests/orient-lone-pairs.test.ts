// The lone pairs the VSEPR view draws, checked on real molecules: DFT minima
// from tests/references/dft (see its README), each given its Lewis structure,
// run through assignOrbitals and lonePairDirectionsByAtom exactly as the
// renderer runs them. The first tests here fed ideal, unit-length,
// symmetric bond directions, where any sensible rule gives the same answer,
// and they missed a lone pair the longer bond dragged 17° off methyl
// isocyanate's N (2026-10-29).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Molecule } from '../src/mol-parser';
import { assignOrbitals, sigmaNeighbors } from '../src/chem/vsepr/assign-orbitals';
import { lonePairDirectionsByAtom } from '../src/chem/vsepr/orient-lone-pairs';
import { crossProduct, vecDot, vecNormalize } from '../src/utils/vec3';

type Vec = [number, number, number];

const TETRAHEDRAL = (Math.acos(-1 / 3) * 180) / Math.PI;

const ang = (a: Vec, b: Vec) =>
  (Math.acos(Math.max(-1, Math.min(1, vecDot(vecNormalize(a), vecNormalize(b))))) * 180) / Math.PI;

/**
 * A DFT minimum with its Lewis structure. `bonds` names the atoms by element
 * and their line in the .xyz ("N2=C3"; - = # for the bond order), and the
 * element is checked against the file, so a wrong number fails loudly.
 * `charges` are formal charges, by the same names.
 */
function lewis(file: string, bonds: string, charges: Record<string, number> = {}): Molecule {
  const lines = readFileSync(new URL(`./references/dft/${file}.xyz`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/).slice(2);
  const atoms = lines.map((line) => {
    const [element, x, y, z] = line.trim().split(/\s+/);
    return { element, x: Number(x), y: Number(y), z: Number(z) } as Molecule['atoms'][number];
  });
  const index = (name: string) => {
    const [, element, number] = name.match(/^([A-Z][a-z]?)(\d+)$/)!;
    const i = Number(number) - 1;
    if (atoms[i]?.element !== element) throw new Error(`${file}: atom ${number} is not ${element}`);
    return i;
  };
  const ORDER: Record<string, number> = { '-': 1, '=': 2, '#': 3 };
  const molecule: Molecule = {
    atoms,
    bonds: bonds.split(/\s+/).map((bond) => {
      const [, a, symbol, b] = bond.match(/^([A-Z][a-z]?\d+)([-=#])([A-Z][a-z]?\d+)$/)!;
      return { atom1Index: index(a), atom2Index: index(b), order: ORDER[symbol] };
    }),
  };
  for (const [name, charge] of Object.entries(charges)) molecule.atoms[index(name)].charge = charge;
  return molecule;
}

const MOLECULES = {
  water: lewis('water', 'O1-H2 O1-H3'),
  methanol: lewis('methanol', 'C1-O2 C1-H3 C1-H4 C1-H5 O2-H6'),
  disiloxane: lewis('disiloxane', 'Si1-O2 Si1-H4 Si1-H5 Si1-H6 O2-Si3 Si3-H7 Si3-H8 Si3-H9'),
  ammonia: lewis('ammonia', 'N1-H2 N1-H3 N1-H4'),
  aziridine: lewis('aziridine', 'C1-C2 C1-N3 C1-H4 C1-H5 C2-N3 C2-H6 C2-H7 N3-H8'),
  pyridine: lewis('pyridine', 'C1-C2 C1=C6 C1-H7 C2=C3 C2-H8 C3-N4 C3-H9 N4=C5 C5-C6 C5-H10 C6-H11'),
  pyrrole: lewis('pyrrole', 'C1-C2 C1=C5 C1-H6 C2=C3 C2-H7 C3-N4 C3-H8 N4-C5 N4-H9 C5-H10'),
  imidazole: lewis('imidazole', 'C1=C2 C1-N5 C1-H6 C2-N3 C2-H7 N3=C4 C4-N5 C4-H8 N5-H9'),
  phenol: lewis('phenol', 'O1-C2 O1-H8 C2-C3 C2=C7 C3=C4 C3-H9 C4-C5 C4-H10 C5=C6 C5-H11 C6-C7 C6-H12 C7-H13'),
  methylIsocyanate: lewis('methyl-isocyanate', 'C1-N2 C1-H5 C1-H6 C1-H7 N2=C3 C3=O4'),
  methylmethanimine: lewis('n-methylmethanimine', 'C1-N2 C1-H4 C1-H5 C1-H6 N2=C3 C3-H7 C3-H8'),
  formaldehyde: lewis('formaldehyde', 'C1=O2 C1-H3 C1-H4'),
  ozone: lewis('ozone', 'O1=O2 O2-O3', { O2: 1, O3: -1 }),
  dinitrogen: lewis('dinitrogen', 'N1#N2'),
  dioxygen: lewis('dioxygen', 'O1=O2'),
  dichlorofluoromethane: lewis('dichlorofluoromethane', 'Cl1-C2 C2-F3 C2-Cl4 C2-H5'),
  phosphorusPentachloride: lewis('phosphorus-pentachloride', 'Cl1-P2 P2-Cl3 P2-Cl4 P2-Cl5 P2-Cl6'),
  sulfurHexafluoride: lewis('SF6', 'S1-F2 S1-F3 S1-F4 S1-F5 S1-F6 S1-F7'),
  sulfurTetrafluoride: lewis('sulfur-tetrafluoride', 'F1-S2 S2-F3 S2-F4 S2-F5'),
  chlorineTrifluoride: lewis('chlorine-trifluoride', 'F1-Cl2 Cl2-F3 Cl2-F4'),
  xenonDifluoride: lewis('xenon-difluoride', 'F1-Xe2 Xe2-F3'),
  brominePentafluoride: lewis('bromine-pentafluoride', 'F1-Br2 Br2-F3 Br2-F4 Br2-F5 Br2-F6'),
  xenonTetrafluoride: lewis('xenon-tetrafluoride', 'F1-Xe2 Xe2-F3 Xe2-F4 Xe2-F5'),
  zincChloride: lewis('zinc-chloride', 'Cl1-Zn2 Zn2-Cl3'),
  tetrachloronickelate: lewis('NiCl4', 'Ni1-Cl2 Ni1-Cl3 Ni1-Cl4 Ni1-Cl5',
    { Ni1: 2, Cl2: -1, Cl3: -1, Cl4: -1, Cl5: -1 }),
  tetracyanonickelate: lewis('NiCN4', 'Ni1-C2 Ni1-C4 Ni1-C6 Ni1-C8 C2#N3 C4#N5 C6#N7 C8#N9',
    { Ni1: 2, C2: -1, C4: -1, C6: -1, C8: -1 }),
};

/**
 * The σ lone pairs drawn on each atom that has any, by name ("N4"). Every
 * other atom draws none — pyrrole's N among them: its pair is the p orbital
 * in the ring's π system, not a σ lobe.
 */
const LONE_PAIR_COUNTS: Record<keyof typeof MOLECULES, Record<string, number>> = {
  water: { O1: 2 },
  methanol: { O2: 2 },
  disiloxane: { O2: 2 },
  ammonia: { N1: 1 },
  aziridine: { N3: 1 },
  pyridine: { N4: 1 },
  pyrrole: {},
  imidazole: { N3: 1 },
  phenol: { O1: 1 },
  methylIsocyanate: { N2: 1, O4: 2 },
  methylmethanimine: { N2: 1 },
  formaldehyde: { O2: 2 },
  ozone: { O1: 2, O2: 1, O3: 2 },
  dinitrogen: { N1: 1, N2: 1 },
  dioxygen: { O1: 2, O2: 2 },
  dichlorofluoromethane: { Cl1: 3, F3: 3, Cl4: 3 },
  phosphorusPentachloride: { Cl1: 3, Cl3: 3, Cl4: 3, Cl5: 3, Cl6: 3 },
  sulfurHexafluoride: { F2: 3, F3: 3, F4: 3, F5: 3, F6: 3, F7: 3 },
  sulfurTetrafluoride: { F1: 3, S2: 1, F3: 3, F4: 3, F5: 3 },
  chlorineTrifluoride: { F1: 3, Cl2: 2, F3: 3, F4: 3 },
  xenonDifluoride: { F1: 3, Xe2: 3, F3: 3 },
  brominePentafluoride: { F1: 3, Br2: 1, F3: 3, F4: 3, F5: 3, F6: 3 },
  xenonTetrafluoride: { F1: 3, Xe2: 2, F3: 3, F4: 3, F5: 3 },
  zincChloride: { Cl1: 3, Cl3: 3 },
  tetrachloronickelate: { Cl2: 3, Cl3: 3, Cl4: 3, Cl5: 3 },
  tetracyanonickelate: { N3: 1, N5: 1, N7: 1, N9: 1 },
};

const atomIndex = (name: string) => Number(name.match(/\d+$/)![0]) - 1;

function lonePairsOf(molecule: Molecule): Vec[][] {
  return lonePairDirectionsByAtom(molecule, assignOrbitals(molecule));
}

/** Unit vectors from atom `i` along each of its σ bonds. */
function bondsOf(molecule: Molecule, i: number): Vec[] {
  const at = molecule.atoms[i];
  return sigmaNeighbors(molecule)[i].map((j) => {
    const other = molecule.atoms[j];
    return vecNormalize([other.x - at.x, other.y - at.y, other.z - at.z]);
  });
}

/** Unit vector from atom `name` to atom `other`. */
function bondTo(molecule: Molecule, name: string, other: string): Vec {
  const a = molecule.atoms[atomIndex(name)];
  const b = molecule.atoms[atomIndex(other)];
  return vecNormalize([b.x - a.x, b.y - a.y, b.z - a.z]);
}

/**
 * The atoms on `j`'s side of the bond i–j: `j` and all it connects to without
 * passing through `i`. Null when the bond is in a ring.
 */
function atomsBeyond(molecule: Molecule, i: number, j: number): number[] | null {
  const seen = new Set([j]);
  const queue = [j];
  while (queue.length > 0) {
    const a = queue.pop()!;
    for (const { atom1Index, atom2Index } of molecule.bonds) {
      const b = atom1Index === a ? atom2Index : atom2Index === a ? atom1Index : -1;
      if (b < 0 || (a === j && b === i) || seen.has(b)) continue;
      if (b === i) return null;
      seen.add(b);
      queue.push(b);
    }
  }
  return [...seen];
}

/**
 * Two angles the molecule's symmetry makes equal. A DFT minimum keeps its
 * point group only to the optimiser's convergence, and the hypervalent rules
 * read the bonds whole, so the angles agree to a fraction of a degree, not
 * exactly (SF₄'s two equatorial F's: 0.04°).
 */
function expectSymmetric(a: number, b: number) {
  expect(Math.abs(a - b)).toBeLessThan(0.2);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, k) =>
    permutations([...items.slice(0, k), ...items.slice(k + 1)]).map((rest) => [item, ...rest]));
}

/** The same lone pairs, as sets: every direction in `a` has a partner in `b`. */
function expectSameDirections(a: Vec[], b: Vec[]) {
  expect(b).toHaveLength(a.length);
  for (const v of a) expect(Math.min(...b.map((w) => ang(v, w)))).toBeLessThan(1e-6);
}

const cases = Object.entries(MOLECULES) as [keyof typeof MOLECULES, Molecule][];

describe('every lone pair, on every molecule', () => {
  it.each(cases)('%s: the lone pairs drawn on each atom', (name, molecule) => {
    const drawn = lonePairsOf(molecule);
    const counts: Record<string, number> = {};
    drawn.forEach((pairs, i) => {
      if (pairs.length > 0) counts[`${molecule.atoms[i].element}${i + 1}`] = pairs.length;
    });
    expect(counts).toEqual(LONE_PAIR_COUNTS[name]);
  });

  // A lone pair is an electron domain of its own: it points into the space
  // the bonds leave, never across a bond, and two pairs never crowd together.
  // 89°, not 90°: XeF₄'s pairs sit at exactly 90° to its bonds.
  it.each(cases)('%s: each lone pair at least 89° from every bond and every other pair', (_, molecule) => {
    lonePairsOf(molecule).forEach((pairs, i) => {
      const bonds = bondsOf(molecule, i);
      for (const lp of pairs) {
        expect(Math.hypot(...lp)).toBeCloseTo(1, 9);
        for (const bond of bonds) expect(ang(lp, bond)).toBeGreaterThan(89);
        for (const other of pairs) if (other !== lp) expect(ang(lp, other)).toBeGreaterThan(89);
      }
    });
  });

  // Only where the bonds point counts, never how long they are: methyl
  // isocyanate's 1.41 Å N–CH₃ dragged the N's pair toward the 1.19 Å N=C.
  // The stretch moves everything beyond the bond with it, so no angle in the
  // molecule changes; a ring bond cannot be stretched alone and is skipped.
  it.each(cases)('%s: stretching a bond moves no lone pair on the atom it leaves', (_, molecule) => {
    const before = lonePairsOf(molecule);
    const neighbors = sigmaNeighbors(molecule);
    before.forEach((pairs, i) => {
      if (pairs.length === 0) return;
      const bonds = bondsOf(molecule, i);
      neighbors[i].forEach((j, k) => {
        const beyond = atomsBeyond(molecule, i, j);
        if (!beyond) return;
        const stretched = structuredClone(molecule);
        const u = bonds[k];
        for (const m of beyond) {
          stretched.atoms[m].x += 0.3 * u[0];
          stretched.atoms[m].y += 0.3 * u[1];
          stretched.atoms[m].z += 0.3 * u[2];
        }
        expectSameDirections(pairs, lonePairsOf(stretched)[i]);
      });
    });
  });

  // The hypervalent rules pick axial and equatorial bonds from the geometry,
  // so the answer must not depend on which bond was drawn first.
  // Every order for up to five bonds (XeF₄ drawn with a trans pair first
  // tipped its pairs 4°); beyond that, reversed and each rotation.
  it.each(cases)('%s: the order the bonds were drawn in changes nothing', (_, molecule) => {
    const before = lonePairsOf(molecule);
    const { bonds } = molecule;
    const orders = bonds.length <= 5
      ? permutations(bonds)
      : [[...bonds].reverse(), ...bonds.map((_, k) => [...bonds.slice(k), ...bonds.slice(0, k)])];
    for (const order of orders) {
      lonePairsOf({ ...molecule, bonds: order }).forEach((pairs, i) => expectSameDirections(before[i], pairs));
    }
  });
});

describe('the VSEPR shape around each lone pair', () => {
  it.each([
    ['ammonia', MOLECULES.ammonia, 'N1'],
    // 62° C–N–C ring: the bond centroid pulled the pair to 101° from N–H
    ['aziridine', MOLECULES.aziridine, 'N3'],
  ] as const)('AX₃E, %s: the lone pair makes equal angles with all three bonds', (_, molecule, atom) => {
    const [lp] = lonePairsOf(molecule)[atomIndex(atom)];
    const [a, b, c] = bondsOf(molecule, atomIndex(atom)).map((bond) => ang(lp, bond));
    expect(b).toBeCloseTo(a, 6);
    expect(c).toBeCloseTo(a, 6);
  });

  it.each([
    ['pyridine', MOLECULES.pyridine, 'N4'],
    ['imidazole', MOLECULES.imidazole, 'N3'],
    ['methyl isocyanate', MOLECULES.methylIsocyanate, 'N2'],
    ['N-methylmethanimine', MOLECULES.methylmethanimine, 'N2'],
    ['ozone', MOLECULES.ozone, 'O2'],
    ['phenol', MOLECULES.phenol, 'O1'],
  ] as const)('AX₂E, %s: the lone pair bisects the outside of the bond angle, in its plane', (_, molecule, atom) => {
    const [lp] = lonePairsOf(molecule)[atomIndex(atom)];
    const [a, b] = bondsOf(molecule, atomIndex(atom));
    expect(ang(lp, a)).toBeCloseTo(ang(lp, b), 6);
    expect(ang(lp, a) + ang(lp, b) + ang(a, b)).toBeCloseTo(360, 6);
  });

  it.each([
    ['water', MOLECULES.water, 'O1'],
    ['methanol', MOLECULES.methanol, 'O2'],
    ['disiloxane', MOLECULES.disiloxane, 'O2'],
  ] as const)('AX₂E₂, %s: two equivalent pairs, mirror images through the bond plane', (_, molecule, atom) => {
    const [lp1, lp2] = lonePairsOf(molecule)[atomIndex(atom)];
    const [a, b] = bondsOf(molecule, atomIndex(atom));
    const normal = vecNormalize(crossProduct(a, b));
    for (const lp of [lp1, lp2]) expect(ang(lp, a)).toBeCloseTo(ang(lp, b), 6);
    expect(ang(lp1, a)).toBeCloseTo(ang(lp2, a), 6);
    expect(vecDot(lp1, normal)).toBeCloseTo(-vecDot(lp2, normal), 6);
  });

  it.each([
    ['dinitrogen', MOLECULES.dinitrogen, 'N1'],
    ['tetracyanonickelate', MOLECULES.tetracyanonickelate, 'N3'],
  ] as const)('AXE, %s: the lone pair points straight away from the bond', (_, molecule, atom) => {
    const [lp] = lonePairsOf(molecule)[atomIndex(atom)];
    expect(ang(lp, bondsOf(molecule, atomIndex(atom))[0])).toBeCloseTo(180, 6);
  });

  // The two pairs of a doubly bonded O share the σ plane with the bond: the
  // plane the π orbital stands perpendicular to — the molecule's own plane in
  // formaldehyde and ozone.
  it.each([
    ['formaldehyde', MOLECULES.formaldehyde, 'O2', ['C1', 'H3']],
    ['ozone, terminal O', MOLECULES.ozone, 'O1', ['O2', 'O3']],
    ['ozone, terminal O⁻', MOLECULES.ozone, 'O3', ['O2', 'O1']],
  ] as const)('AXE₂ with π, %s: both pairs in the molecular plane, 120° from the bond', (_, molecule, atom, [b1, b2]) => {
    const pairs = lonePairsOf(molecule)[atomIndex(atom)];
    const bond = bondTo(molecule, atom, b1);
    const plane = vecNormalize(crossProduct(bond, bondTo(molecule, b1, b2)));
    for (const lp of pairs) {
      expect(vecDot(lp, plane)).toBeCloseTo(0, 2);
      expect(ang(lp, bond)).toBeCloseTo(120, 6);
    }
  });

  // The cumulene twist, as at the ends of allene: the sp carbon's two π bonds
  // are perpendicular, and the N=C π stands perpendicular to the C–N=C plane
  // (the N's lone pair is in it), so the C=O π lies in that plane — and the
  // O's lone pairs stand perpendicular to it, not in it as formaldehyde's do.
  it("AXE₂ with π, methyl isocyanate's O: both pairs across the molecular plane, 120° from the bond", () => {
    const molecule = MOLECULES.methylIsocyanate;
    const [lp1, lp2] = lonePairsOf(molecule)[atomIndex('O4')];
    const bond = bondTo(molecule, 'O4', 'C3');
    const plane = vecNormalize(crossProduct(bondTo(molecule, 'N2', 'C1'), bondTo(molecule, 'N2', 'C3')));
    const across = vecNormalize([lp1[0] - lp2[0], lp1[1] - lp2[1], lp1[2] - lp2[2]]);
    expect(Math.abs(vecDot(across, plane))).toBeCloseTo(1, 4);
    for (const lp of [lp1, lp2]) expect(ang(lp, bond)).toBeCloseTo(120, 6);
  });

  it('AXE₂ with π, dioxygen: both pairs perpendicular to the π orbital, 120° from the bond', () => {
    const molecule = MOLECULES.dioxygen;
    const { piDirection } = assignOrbitals(molecule)[0];
    for (const lp of lonePairsOf(molecule)[0]) {
      expect(vecDot(lp, piDirection!)).toBeCloseTo(0, 9);
      expect(ang(lp, bondsOf(molecule, 0)[0])).toBeCloseTo(120, 6);
    }
  });

  it.each([
    ['dichlorofluoromethane', MOLECULES.dichlorofluoromethane, 'F3'],
    ['phosphorus pentachloride', MOLECULES.phosphorusPentachloride, 'Cl1'],
    ['tetrachloronickelate', MOLECULES.tetrachloronickelate, 'Cl2'],
    ['zinc chloride', MOLECULES.zincChloride, 'Cl1'],
  ] as const)('AXE₃, %s: three equivalent pairs around the bond', (_, molecule, atom) => {
    const pairs = lonePairsOf(molecule)[atomIndex(atom)];
    const [bond] = bondsOf(molecule, atomIndex(atom));
    for (const lp of pairs) expect(ang(lp, bond)).toBeCloseTo(ang(pairs[0], bond), 6);
    expect(ang(pairs[0], pairs[1])).toBeCloseTo(ang(pairs[1], pairs[2]), 6);
  });

  it('AX₄E, sulfur tetrafluoride: the pair bisects the open side of the equatorial F–S–F', () => {
    const molecule = MOLECULES.sulfurTetrafluoride;
    const [lp] = lonePairsOf(molecule)[1];
    const bonds = bondsOf(molecule, 1);
    // the axial pair is the most nearly opposite
    const angles = bonds.flatMap((a, i) => bonds.slice(i + 1).map((b, k) => ({ i, j: i + 1 + k, angle: ang(a, b) })));
    const axial = angles.reduce((best, pair) => (pair.angle > best.angle ? pair : best));
    const [eq1, eq2] = bonds.filter((_, k) => k !== axial.i && k !== axial.j);
    expectSymmetric(ang(lp, eq1), ang(lp, eq2));
    expectSymmetric(ang(lp, eq1) + ang(lp, eq2) + ang(eq1, eq2), 360);
    expectSymmetric(ang(lp, bonds[axial.i]), ang(lp, bonds[axial.j]));
  });

  it('AX₃E₂, chlorine trifluoride: both pairs equatorial, mirror images through the molecular plane', () => {
    const molecule = MOLECULES.chlorineTrifluoride;
    const [lp1, lp2] = lonePairsOf(molecule)[1];
    const bonds = bondsOf(molecule, 1);
    // the two most nearly opposite bonds are axial
    const [ax1, ax2] = [[0, 1], [0, 2], [1, 2]]
      .reduce((best, pair) => (ang(bonds[pair[0]], bonds[pair[1]]) > ang(bonds[best[0]], bonds[best[1]]) ? pair : best));
    const equatorial = bonds[3 - ax1 - ax2];
    const axis = vecNormalize([bonds[ax1][0] - bonds[ax2][0], bonds[ax1][1] - bonds[ax2][1], bonds[ax1][2] - bonds[ax2][2]]);
    const plane = vecNormalize(crossProduct(axis, equatorial));
    expectSymmetric(ang(lp1, plane), 180 - ang(lp2, plane));
    for (const lp of [lp1, lp2]) expectSymmetric(ang(lp, bonds[ax1]), ang(lp, bonds[ax2]));
  });

  it('AX₂E₃, xenon difluoride: three pairs around the F–Xe–F axis, 120° apart', () => {
    const molecule = MOLECULES.xenonDifluoride;
    const pairs = lonePairsOf(molecule)[1];
    const [bond] = bondsOf(molecule, 1);
    for (const lp of pairs) expect(ang(lp, bond)).toBeCloseTo(90, 1);
    expect(ang(pairs[0], pairs[1])).toBeCloseTo(120, 6);
    expect(ang(pairs[1], pairs[2])).toBeCloseTo(120, 6);
  });

  it('AX₅E, bromine pentafluoride: the pair opposite the apical F', () => {
    const molecule = MOLECULES.brominePentafluoride;
    const [lp] = lonePairsOf(molecule)[1];
    const bonds = bondsOf(molecule, 1);
    expect(Math.max(...bonds.map((bond) => ang(lp, bond)))).toBeCloseTo(180, 1);
  });

  it('AX₄E₂, xenon tetrafluoride: the pairs on either side of the square, opposite each other', () => {
    const molecule = MOLECULES.xenonTetrafluoride;
    const [lp1, lp2] = lonePairsOf(molecule)[1];
    expect(ang(lp1, lp2)).toBeCloseTo(180, 6);
    for (const bond of bondsOf(molecule, 1)) expect(ang(lp1, bond)).toBeCloseTo(90, 1);
  });
});

// Where VSEPR says only "away from the bonds", Valence draws a picture of its
// own choosing; these pin the choices, not a measurement.
describe("Valence's teaching choices", () => {
  it('AX₂E₂ below the tetrahedral angle: each pair at the tetrahedral angle to each bond (water, methanol)', () => {
    for (const [molecule, atom] of [[MOLECULES.water, 'O1'], [MOLECULES.methanol, 'O2']] as const) {
      const bonds = bondsOf(molecule, atomIndex(atom));
      expect(ang(bonds[0], bonds[1])).toBeLessThan(TETRAHEDRAL);
      for (const lp of lonePairsOf(molecule)[atomIndex(atom)]) {
        for (const bond of bonds) expect(ang(lp, bond)).toBeCloseTo(TETRAHEDRAL, 6);
      }
    }
  });

  it('AX₂E₂ above the tetrahedral angle: the pairs open as the bonds do (disiloxane)', () => {
    // Held at the tetrahedral angle, the pairs pinched together as the bonds
    // opened and had no solution past 141°: disiloxane drew NaN lobes.
    const molecule = MOLECULES.disiloxane;
    const bonds = bondsOf(molecule, 1);
    const [lp1, lp2] = lonePairsOf(molecule)[1];
    expect(ang(bonds[0], bonds[1])).toBeGreaterThan(TETRAHEDRAL);
    expect(ang(lp1, lp2)).toBeCloseTo(ang(bonds[0], bonds[1]), 6);
  });

  it('AXE₃: the three pairs at the tetrahedral angle to the bond', () => {
    const molecule = MOLECULES.dichlorofluoromethane;
    const [bond] = bondsOf(molecule, 2);
    for (const lp of lonePairsOf(molecule)[2]) expect(ang(lp, bond)).toBeCloseTo(TETRAHEDRAL, 6);
  });
});
