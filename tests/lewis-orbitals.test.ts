/**
 * The drawn Lewis structure made into orbitals the NBO way, and the
 * donor–acceptor energies E(2) between them (lewis-orbitals.ts).
 *
 * The set must be exact bookkeeping — orthonormal, holding every electron,
 * and diagonalizing GFN2's Fock matrix within it gives back the canonical
 * energies — and the chemistry must be the textbook's: the amide's n(N) → π*,
 * BF₃'s fluorine lone pairs into boron's empty p, the anomeric-type n(N) →
 * σ*(C–H) anti in methylamine, ethane's hyperconjugation. Sketches are drawn
 * as a user draws them (heavy atoms, the filler adds H) and built by the app's
 * own local pipeline; the rest are the app's examples.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Atom, Molecule } from '../src/mol-parser';
import { gfn2Ladders, gfn2OrbitalSpace } from '../src/chem/gfn2-xtb/orbital-ladder';
import { lewisOrbitals, type LewisOrbitals } from '../src/chem/localized-orbitals/lewis-orbitals';
import type { LocalizedOrbital } from '../src/chem/localized-orbitals/order-localized';
import { jacobiSymmetric } from '../src/utils/eigen';
import { localGeometry, optimisedExample } from './helpers/local-geometry';

beforeAll(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name}`, import.meta.url));
const KCAL = 23.060549;

/** A flat sketch, as on the sketcher page: heavy atoms only. */
function sketch(elements: string[], bonds: [number, number, number][]): Molecule {
  const atoms: Atom[] = elements.map((element, i) => ({ element, x: 1.3 * i, y: (i % 2) * 0.75, z: 0 }));
  return { atoms, bonds: bonds.map(([a, b, order]) => ({ atom1Index: a, atom2Index: b, order })) };
}

async function built(molecule: Molecule) {
  const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
  const properties = await propertiesAt(molecule, vendorFile);
  const { alpha } = gfn2Ladders(molecule, properties!)!;
  const space = gfn2OrbitalSpace(alpha)!;
  return { space, alpha, result: lewisOrbitals(molecule, space) };
}

async function lewis(molecule: Molecule): Promise<LewisOrbitals> {
  const { result } = await built(molecule);
  if ('refusal' in result) throw new Error(result.refusal);
  return result.lewis;
}

const fromSketch = async (elements: string[], bonds: [number, number, number][]) =>
  (await localGeometry(sketch(elements, bonds)))!.molecule;

const elementsOf = (molecule: Molecule, orbital: LocalizedOrbital) =>
  orbital.atoms.map((a) => molecule.atoms[a].element).join('');

/** The largest E(2) from a donor, kcal/mol, and the acceptor it goes into. */
function strongestFrom(set: LewisOrbitals, donor: number) {
  let best = { acceptor: -1, kcal: 0 };
  set.donation[donor].forEach((e2, acceptor) => {
    if (e2 * KCAL > best.kcal) best = { acceptor, kcal: e2 * KCAL };
  });
  return best;
}

describe('the Lewis-structure orbitals are exact bookkeeping', () => {
  it('water: two O–H σ, two lone pairs, two σ* — orthonormal, every electron, the canonical energies back', async () => {
    const molecule = await optimisedExample('Water');
    const { space, alpha, result } = await built(molecule);
    if ('refusal' in result) throw new Error(result.refusal);
    const { orbitals, couplings, rydbergs } = result.lewis;
    expect(rydbergs).toBe(0);
    expect(orbitals.map((o) => o.character).sort()).toEqual(
      ['lone pair', 'lone pair', 'sigma', 'sigma', 'sigma antibond', 'sigma antibond'],
    );
    for (const [i, a] of orbitals.entries()) {
      for (const [j, b] of orbitals.entries()) {
        let overlap = 0;
        for (let mu = 0; mu < a.coefficients.length; mu++) {
          for (let nu = 0; nu < b.coefficients.length; nu++) overlap += a.coefficients[mu] * space.overlap[mu][nu] * b.coefficients[nu];
        }
        expect(overlap).toBeCloseTo(i === j ? 1 : 0, 8);
      }
    }
    const electrons = orbitals.reduce((sum, o) => sum + o.occupancy!, 0);
    expect(electrons).toBeCloseTo(8, 8);
    // the full Fock matrix in the set, diagonalized, is GFN2's own ladder
    const eigenvalues = jacobiSymmetric(couplings).values;
    eigenvalues.forEach((e, k) => expect(e).toBeCloseTo(alpha.energies[k], 6));
  });

  it('PCl₅: five σ, fifteen lone pairs and five σ*, the d left over as Rydbergs out of the list', async () => {
    const molecule = await optimisedExample('Phosphorus pentachloride');
    const set = await lewis(molecule);
    const count = (c: string) => set.orbitals.filter((o) => o.character === c).length;
    expect([count('sigma'), count('lone pair'), count('sigma antibond')]).toEqual([5, 15, 5]);
    expect(set.rydbergs).toBe(29); // 6 atoms × 9 functions = 54, less the 25 listed
  });
});

describe('E(2): the donations the textbook draws', () => {
  it('formamide drawn O=C–N: the nitrogen lone pair into the C=O π*, the strongest by far', async () => {
    const molecule = await fromSketch(['O', 'C', 'N'], [[0, 1, 2], [1, 2, 1]]);
    const set = await lewis(molecule);
    const nitrogenLonePair = set.orbitals.findIndex((o) => o.character === 'lone pair' && elementsOf(molecule, o) === 'N');
    const { acceptor, kcal } = strongestFrom(set, nitrogenLonePair);
    expect(set.orbitals[acceptor].character).toBe('pi antibond');
    expect(elementsOf(molecule, set.orbitals[acceptor])).toBe('OC');
    expect(kcal).toBeGreaterThan(30);
    expect(Math.max(...set.donation.flat()) * KCAL).toBeCloseTo(kcal, 6);
    // the donation empties the lone pair by a quarter of an electron or so
    expect(set.orbitals[nitrogenLonePair].occupancy!).toBeLessThan(1.85);
  });

  it('BF₃: each fluorine lone pair donates into boron’s empty p (LP*)', async () => {
    const molecule = await fromSketch(['B', 'F', 'F', 'F'], [[0, 1, 1], [0, 2, 1], [0, 3, 1]]);
    const set = await lewis(molecule);
    const vacancy = set.orbitals.findIndex((o) => o.character === 'lone vacancy');
    expect(elementsOf(molecule, set.orbitals[vacancy])).toBe('B');
    const donors = set.orbitals.flatMap((o, i) => (o.occupied && set.donation[i][vacancy] * KCAL > 20 ? [i] : []));
    expect(donors.map((i) => elementsOf(molecule, set.orbitals[i]))).toEqual(['F', 'F', 'F']);
  });

  it('methylamine: the nitrogen lone pair into the one C–H σ* anti to it', async () => {
    const molecule = await fromSketch(['C', 'N'], [[0, 1, 1]]);
    const set = await lewis(molecule);
    const lonePair = set.orbitals.findIndex((o) => o.character === 'lone pair');
    const intoCH = set.orbitals
      .map((o, j) => ({ o, kcal: set.donation[lonePair][j] * KCAL }))
      .filter(({ o }) => o.character === 'sigma antibond' && elementsOf(molecule, o).includes('H') && elementsOf(molecule, o).includes('C'))
      .map(({ kcal }) => kcal)
      .sort((a, b) => b - a);
    expect(intoCH[0]).toBeGreaterThan(4);
    expect(intoCH[0]).toBeLessThan(12);
    expect(intoCH[1]).toBeLessThan(1);
  });

  it('ethane: each C–H σ donates into the C–H σ* anti to it on the other carbon', async () => {
    const molecule = await fromSketch(['C', 'C'], [[0, 1, 1]]);
    const set = await lewis(molecule);
    const carbonOf = (o: LocalizedOrbital) => o.atoms.find((a) => molecule.atoms[a].element === 'C')!;
    set.orbitals.forEach((o, i) => {
      if (o.character !== 'sigma' || !elementsOf(molecule, o).includes('H')) return;
      const { acceptor, kcal } = strongestFrom(set, i);
      expect(set.orbitals[acceptor].character).toBe('sigma antibond');
      expect(carbonOf(set.orbitals[acceptor])).not.toBe(carbonOf(o));
      expect(kcal).toBeGreaterThan(1);
      expect(kcal).toBeLessThan(5);
    });
  });
});

describe('what a drawn Lewis structure cannot describe is refused, with the reason', () => {
  it('diborane: the bridges are three-centre bonds', async () => {
    const { result } = await built(await optimisedExample('Diborane'));
    expect('refusal' in result && result.refusal).toMatch(/three-centre/);
  });

  it('a transition metal: its bonding is beyond a Lewis structure', async () => {
    const { result } = await built(await optimisedExample('Tetracyanonickelate'));
    expect('refusal' in result && result.refusal).toMatch(/metal/);
  });
});
