/**
 * GFN2-xTB's orbitals as the Localized view's source: the same Pipek–Mezey
 * localization and the same avo_ibo classifier as extended Hückel's, on GFN2's
 * own basis (minimal, plus a polarization d on the heavier main group) and
 * its Fock matrix, rebuilt from the orbitals. The classifier's gates were tuned
 * on extended Hückel and are not re-tuned: these pin that they still land on
 * the Lewis picture. Structures are the app's own examples.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { gfn2Ladders, gfn2OrbitalSpace, type Gfn2Ladder } from '../src/chem/gfn2-xtb/orbital-ladder';
import { localizeOrbitals } from '../src/chem/localized-orbitals/localize-pm';
import { orderLocalizedOrbitals, type LocalizedOrbital } from '../src/chem/localized-orbitals/order-localized';
import { fockCouplings } from '../src/chem/localized-orbitals/fock-couplings';
import { jacobiSymmetric } from '../src/utils/eigen';
import { valenceVirtuals } from '../src/chem/localized-orbitals/valence-virtuals';
import { localGeometry } from './helpers/local-geometry';

beforeAll(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));

function example(prefix: string): Molecule {
  const found = EXAMPLES.find((e) => e.name.startsWith(prefix))!;
  const molecule = parseMolBlock(found.mol);
  return found.multiplicity ? { ...molecule, multiplicity: found.multiplicity } : molecule;
}

async function ladders(molecule: Molecule) {
  const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
  const properties = await propertiesAt(molecule, vendorFile);
  return gfn2Ladders(molecule, properties!)!;
}

function localized(molecule: Molecule, ladder: Gfn2Ladder): LocalizedOrbital[] | null {
  const space = gfn2OrbitalSpace(ladder);
  const sets = space && localizeOrbitals(space, molecule.atoms.map((atom) => atom.element));
  return space && sets ? orderLocalizedOrbitals(molecule, space, sets) : null;
}

const filled = (list: LocalizedOrbital[]) => list.filter((o) => o.occupied);
const count = (list: LocalizedOrbital[], character: string) => list.filter((o) => o.character === character).length;
const elementsOf = (molecule: Molecule, orbital: LocalizedOrbital) => orbital.atoms.map((a) => molecule.atoms[a].element).sort().join('');

describe('GFN2 orbitals as a space to localize', () => {
  it('rebuilds the Fock matrix the orbitals diagonalize: Cᵀ F C = ε', async () => {
    const { alpha } = await ladders(example('Water'));
    const space = gfn2OrbitalSpace(alpha)!;
    expect(space.occupied).toBe(4);
    const { coefficients, hamiltonian } = space;
    for (let i = 0; i < coefficients.length; i++) {
      for (let j = 0; j < coefficients.length; j++) {
        let element = 0;
        for (let mu = 0; mu < hamiltonian.length; mu++) {
          for (let nu = 0; nu < hamiltonian.length; nu++) element += coefficients[i][mu] * hamiltonian[mu][nu] * coefficients[j][nu];
        }
        expect(element).toBeCloseTo(i === j ? alpha.energies[i] : 0, 6);
      }
    }
  });

  it('keeps the occupied energy sum — the localization is a rotation within the filled space', async () => {
    const molecule = example('Ethene');
    const { alpha } = await ladders(molecule);
    const list = localized(molecule, alpha)!;
    const sum = filled(list).reduce((s, o) => s + o.energy, 0);
    const canonical = alpha.energies.slice(0, filled(list).length).reduce((s, e) => s + e, 0);
    expect(sum).toBeCloseTo(canonical, 6);
  });
});

describe('the couplings between localized orbitals, ⟨φᵢ|F|φⱼ⟩', () => {
  it('water: the diagonal is each energy, filled and empty never mix, and the filled block gives back the canonical energies', async () => {
    const molecule = example('Water');
    const { alpha } = await ladders(molecule);
    const space = gfn2OrbitalSpace(alpha)!;
    const list = localized(molecule, alpha)!;
    const F = fockCouplings(space.hamiltonian, list);
    list.forEach((orbital, i) => expect(F[i][i]).toBeCloseTo(orbital.energy, 9));
    list.forEach((a, i) => list.forEach((b, j) => {
      if (a.occupied !== b.occupied) expect(Math.abs(F[i][j])).toBeLessThan(1e-6);
    }));
    const filledRows = list.map((o, i) => (o.occupied ? i : -1)).filter((i) => i >= 0);
    const block = filledRows.map((i) => filledRows.map((j) => F[i][j]));
    const { values } = jacobiSymmetric(block, 1e-24);
    values.forEach((value, k) => expect(value).toBeCloseTo(alpha.energies[k], 6));
    // the two O–H bonds couple — the coupling that splits them into 2a₁ and 1b₂
    const bonds = filledRows.filter((i) => list[i].character === 'sigma');
    expect(Math.abs(F[bonds[0]][bonds[1]])).toBeGreaterThan(0.1);
  });
});

describe('the Lewis picture from GFN2 orbitals', () => {
  it('water: two O–H σ bonds and two lone pairs on O', async () => {
    const molecule = example('Water');
    const list = filled(localized(molecule, (await ladders(molecule)).alpha)!);
    expect(count(list, 'sigma')).toBe(2);
    expect(count(list, 'lone pair')).toBe(2);
  });

  it('ethene: one C–C σ, four C–H σ, one C–C π, and the π* lowest of the empties', async () => {
    const molecule = example('Ethene');
    const list = localized(molecule, (await ladders(molecule)).alpha)!;
    expect(count(filled(list), 'sigma')).toBe(5);
    expect(count(filled(list), 'pi')).toBe(1);
    expect(list.find((o) => !o.occupied)!.character).toBe('pi antibond');
  });

  it('N₂: a σ bond, two π bonds and a lone pair on each N', async () => {
    const molecule = example('Nitrogen');
    const list = filled(localized(molecule, (await ladders(molecule)).alpha)!);
    expect(count(list, 'sigma')).toBe(1);
    expect(count(list, 'pi')).toBe(2);
    expect(count(list, 'lone pair')).toBe(2);
  });

  it('diborane: two B–H–B three-centre bridges and four terminal B–H σ', async () => {
    const molecule = example('Diborane');
    const list = filled(localized(molecule, (await ladders(molecule)).alpha)!);
    expect(count(list, 'three-centre')).toBe(2);
    expect(count(list, 'sigma')).toBe(4);
  });

  it('PCl₅: five P–Cl σ and fifteen chlorine lone pairs — P and Cl d is polarization, not a centre', async () => {
    const molecule = example('Phosphorus pentachloride');
    const list = filled(localized(molecule, (await ladders(molecule)).alpha)!);
    expect(count(list, 'sigma')).toBe(5);
    expect(count(list, 'lone pair')).toBe(15);
    for (const lonePair of list.filter((o) => o.character === 'lone pair')) expect(lonePair.atoms).toHaveLength(1);
  });

  it('[Ni(CN)₄]²⁻: four Ni–C σ donor bonds — where extended Hückel called them δ', async () => {
    const molecule = example('Tetracyanonickelate');
    const list = filled(localized(molecule, (await ladders(molecule)).alpha)!);
    const nickelBonds = list.filter((o) => o.atoms.length === 2 && elementsOf(molecule, o) === 'CNi');
    expect(nickelBonds).toHaveLength(4);
    for (const bond of nickelBonds) expect(bond.character).toBe('sigma');
  });
});

describe('the empty orbitals are the valence virtuals (IAO), not the polarization d', () => {
  /** The space, the valence virtuals and the localized list of a molecule. */
  async function virtualsOf(molecule: Molecule) {
    const { alpha } = await ladders(molecule);
    const space = gfn2OrbitalSpace(alpha)!;
    const elements = molecule.atoms.map((atom) => atom.element);
    return { space, virtuals: valenceVirtuals(space, elements), empty: localized(molecule, alpha)!.filter((o) => !o.occupied) };
  }
  const sOverlap = (S: number[][], u: number[], v: number[]) =>
    u.reduce((sum, x, i) => sum + x * S[i].reduce((inner, s, j) => inner + s * v[j], 0), 0);

  it('water, a minimal basis: the canonical virtuals as they were', async () => {
    const { space, virtuals } = await virtualsOf(example('Water'));
    expect(virtuals).toEqual(space.coefficients.slice(space.occupied));
  });

  it('PCl₅: four of 34 canonical virtuals — three equatorial σ* and the axial Cl–P–Cl σ* — orthonormal and empty', async () => {
    const molecule = example('Phosphorus pentachloride');
    const { space, virtuals, empty } = await virtualsOf(molecule);
    expect(space.coefficients.length - space.occupied).toBe(34);
    expect(virtuals.length).toBe(4); // P and 5 Cl: 24 s/p functions, less 20 occupied
    virtuals.forEach((u, i) => {
      virtuals.forEach((v, j) => expect(sOverlap(space.overlap, u, v)).toBeCloseTo(i === j ? 1 : 0, 6));
      space.coefficients.slice(0, space.occupied).forEach((c) => expect(sOverlap(space.overlap, u, c)).toBeCloseTo(0, 9));
    });
    expect(empty.every((o) => o.character === 'sigma antibond')).toBe(true);
    expect(empty.filter((o) => o.atoms.length === 3).map((o) => elementsOf(molecule, o))).toEqual(['ClClP']);
  });

  it('SF₆: four — the a₁g and the t₁u σ*', async () => {
    const { empty } = await virtualsOf(example('Sulfur hexafluoride'));
    expect(empty.length).toBe(4);
  });

  it('SO₂: the three-centre π* and two S–O σ*', async () => {
    const molecule = (await localGeometry({
      atoms: [{ element: 'O', x: 0, y: 0, z: 0 }, { element: 'S', x: 1.3, y: 0.75, z: 0 }, { element: 'O', x: 2.6, y: 0, z: 0 }],
      bonds: [{ atom1Index: 0, atom2Index: 1, order: 2 }, { atom1Index: 1, atom2Index: 2, order: 2 }],
    }))!.molecule;
    const { empty } = await virtualsOf(molecule);
    expect(empty.map((o) => o.character).sort()).toEqual(['pi antibond', 'sigma antibond', 'sigma antibond']);
    expect(empty.find((o) => o.character === 'pi antibond')!.atoms.length).toBe(3);
  });
});

describe('an open shell, one spin channel at a time', () => {
  it('triplet [NiCl₄]²⁻: the α channel localizes; β, its frontier partly filled, is refused', async () => {
    // extended Hückel refuses this molecule outright: it has no spin
    const molecule = example('Tetrachloronickelate');
    const { alpha, beta } = await ladders(molecule);
    expect(alpha.spin).toBe('alpha');
    const list = localized(molecule, alpha)!;
    expect(count(filled(list), 'sigma')).toBe(4);
    expect(filled(list)).toHaveLength(alpha.occupations.filter((o) => o === 1).length);
    expect(localized(molecule, beta!)).toBeNull();
  });
});
