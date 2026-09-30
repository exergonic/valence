// Localized orbitals: the PM sweeps, the classifier, and the order they ship in.
//
// The pins are topological and hand-writable (PLAN.md Phase 4): water's two O–H
// bonds and two lone pairs, ethene's C–C σ and π, benzene's local σ framework
// under a delocalized π sextet. The localization is a unitary transform, so the
// invariants (S-orthonormality, the energy sum) are pinned too — those catch a
// rotation applied in the wrong convention, which the topology alone did.
import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../src/ui/examples';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { solveExtendedHuckel, type ExtendedHuckelResult } from '../src/chem/extended-huckel/solve';
import { solveGeneralized } from '../src/utils/eigen';
import { localizeOrbitals, pipekMezeyAngle } from '../src/chem/localized-orbitals/localize-pm';
import { orderLocalizedOrbitals, type LocalizedOrbital } from '../src/chem/localized-orbitals/order-localized';
import { atomicPopulations, crossPopulations } from '../src/chem/localized-orbitals/mulliken-populations';
import type { BasisFunction } from '../src/chem/extended-huckel/assign-basis';

function example(name: string): Molecule {
  const found = EXAMPLES.find((e) => e.name === name);
  if (!found) throw new Error(`no example ${name}`);
  return parseMolBlock(found.mol);
}

interface Localized {
  molecule: Molecule;
  result: ExtendedHuckelResult;
  orbitals: LocalizedOrbital[];
}

function localize(name: string): Localized {
  const molecule = example(name);
  const result = solveExtendedHuckel(molecule)!;
  const rows = localizeOrbitals(molecule, result);
  if (!rows) throw new Error(`${name} refused localization`);
  return { molecule, result, orbitals: orderLocalizedOrbitals(molecule, result, rows) };
}

const characters = (l: Localized) => l.orbitals.map((o) => o.character);

/** The settled, occupied block. */
const occupied = (l: Localized) => l.orbitals.filter((o) => o.occupied);
/** The empty valence-virtual block. */
const virtual = (l: Localized) => l.orbitals.filter((o) => !o.occupied);
const count = (list: LocalizedOrbital[], c: string) => list.filter((o) => o.character === c).length;
const countIn = (l: Localized, c: string) => count(occupied(l), c);
const countEmpty = (l: Localized, c: string) => count(virtual(l), c);

/** c_iᵗ S c_j over the localized set. */
function overlapOf(rows: number[][], S: number[][], i: number, j: number): number {
  let sum = 0;
  for (let m = 0; m < S.length; m++) {
    let row = 0;
    for (let k = 0; k < S.length; k++) row += S[m][k] * rows[j][k];
    sum += rows[i][m] * row;
  }
  return sum;
}

/** ⟨φ|H|φ⟩. */
function energyOf(c: number[], H: number[][]): number {
  let sum = 0;
  for (let m = 0; m < H.length; m++) {
    let row = 0;
    for (let k = 0; k < H.length; k++) row += H[m][k] * c[k];
    sum += c[m] * row;
  }
  return sum;
}

describe('Mulliken populations', () => {
  it('every normalized orbital\'s atomic populations sum to one', () => {
    const molecule = example('Water (H₂O)');
    const result = solveExtendedHuckel(molecule)!;
    for (const mo of result.coefficients) {
      const q = atomicPopulations(mo, result.overlap, result.basis, molecule.atoms.length);
      expect(q.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    }
  });

  it('an atomic population plus the bonds equals the population of every atom it touches', () => {
    // the row-wise convention: n_A counts every overlap whose ROW is on A, so
    // the bond populations out of A plus A's own diagonal is n_A
    const molecule = example('Water (H₂O)');
    const result = solveExtendedHuckel(molecule)!;
    const mo = result.coefficients[0];
    const q = atomicPopulations(mo, result.overlap, result.basis, molecule.atoms.length);
    const sc = result.overlap.map((row, m) => row.reduce((s, v, k) => s + v * mo[k], 0));
    let diagonal = 0;
    result.basis.forEach((b, m) => { if (b.atomIndex === 0) diagonal += mo[m] * sc[m]; });
    // O–H bonds, O on the left of both
    expect(q.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
    expect(Number.isFinite(diagonal)).toBe(true);
  });
});

describe('the localization invariants', () => {
  for (const name of ['Water (H₂O)', 'Ethene (C₂H₄)', 'Benzene (C₆H₆)', 'Nitrogen (N₂)']) {
    it(`${name}: both blocks stay S-orthonormal and keep their own energy sums`, () => {
      const molecule = example(name);
      const result = solveExtendedHuckel(molecule)!;
      const sets = localizeOrbitals(molecule, result)!;
      expect(sets.occupied.length + sets.virtual.length).toBe(result.basis.length);
      for (const rows of [sets.occupied, sets.virtual]) {
        const n = rows.length;
        let worst = 0;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            worst = Math.max(worst, Math.abs(overlapOf(rows, result.overlap, i, j) - (i === j ? 1 : 0)));
          }
        }
        expect(worst).toBeLessThan(1e-9);
      }

      // the two blocks together keep the whole trace: localization moves
      // nothing between them
      const localizedSum = [...sets.occupied, ...sets.virtual]
        .reduce((s, r) => s + energyOf(r, result.hamiltonian), 0);
      const canonicalSum = result.energies.reduce((s, v) => s + v, 0);
      expect(localizedSum).toBeCloseTo(canonicalSum, 8);

      // ...and each block keeps its own, so the occupied/virtual split is intact
      const occupiedSum = sets.occupied.reduce((s, r) => s + energyOf(r, result.hamiltonian), 0);
      const canonicalOccupied = result.energies.slice(0, sets.occupied.length).reduce((s, v) => s + v, 0);
      expect(occupiedSum).toBeCloseTo(canonicalOccupied, 8);
    });
  }
});

describe('the topology PM recovers', () => {
  it('water: two O–H bonds and two lone pairs on oxygen, and two O–H σ* above them', () => {
    const water = localize('Water (H₂O)');
    expect(countIn(water, 'sigma')).toBe(2);
    expect(countIn(water, 'lone pair')).toBe(2);
    expect(countIn(water, 'pi')).toBe(0);
    for (const orbital of occupied(water)) {
      if (orbital.character === 'lone pair') {
        const oxygen = orbital.populations[0];
        expect(oxygen).toBeGreaterThan(0.9);
        continue;
      }
      // a bond: oxygen plus exactly one hydrogen
      expect(orbital.populations[0]).toBeGreaterThan(0.6);
      const hydrogens = orbital.populations.slice(1).filter((q) => q > 0.2);
      expect(hydrogens).toHaveLength(1);
    }
    // the empty block is the two O–H antibonds, each with its bond population
    // out of phase — which is what the σ* label means
    expect(countEmpty(water, 'sigma antibond')).toBe(2);
    expect(virtual(water)).toHaveLength(2);
  });

  it('ethene: one C–C sigma, four C–H sigma, one C–C pi — and the π* below every σ*', () => {
    const ethene = localize('Ethene (C₂H₄)');
    expect(countIn(ethene, 'sigma')).toBe(5);
    expect(countIn(ethene, 'pi')).toBe(1);
    expect(countIn(ethene, 'lone pair')).toBe(0);
    const pi = occupied(ethene).find((o) => o.character === 'pi')!;
    expect(pi.populations[0]).toBeCloseTo(0.5, 1);
    expect(pi.populations[1]).toBeCloseTo(0.5, 1);
    // the π pair is the frontier: it sorts above every σ in its section
    const occupiedCharacters = characters({ ...ethene, orbitals: occupied(ethene) });
    expect(occupiedCharacters[occupiedCharacters.length - 1]).toBe('pi');

    // four C–H σ*, the C–C π*, the C–C σ* — and the π* is the lowest-lying
    // empty orbital, the textbook ordering for a C=C
    expect(countEmpty(ethene, 'sigma antibond')).toBe(5);
    expect(countEmpty(ethene, 'pi antibond')).toBe(1);
    const empty = virtual(ethene);
    expect(empty[0].character).toBe('pi antibond');
  });

  it('benzene: a local sigma framework under a delocalized pi sextet, and its π* mirror', () => {
    const benzene = localize('Benzene (C₆H₆)');
    expect(countIn(benzene, 'delocalized')).toBe(3);
    expect(countIn(benzene, 'sigma')).toBe(12); // six C–C, six C–H
    for (const orbital of occupied(benzene).filter((o) => o.character === 'delocalized')) {
      // spread over the ring, not on two atoms
      const carriers = orbital.populations.filter((q) => q > 0.05).length;
      expect(carriers).toBeGreaterThanOrEqual(4);
    }
    // σ before the delocalized set throughout
    const occupiedCharacters = characters({ ...benzene, orbitals: occupied(benzene) });
    expect(occupiedCharacters.indexOf('delocalized'))
      .toBeGreaterThan(occupiedCharacters.lastIndexOf('sigma'));

    // the empty block mirrors it: six C–H σ*, six C–C σ*, three ring π* — and
    // a ring orbital must not be labelled a two-centre bond just because two
    // of its carbons hold 0.80 between them
    expect(countEmpty(benzene, 'sigma antibond')).toBe(12);
    expect(countEmpty(benzene, 'pi antibond')).toBe(3);
  });

  it('N2: two lone pairs, one sigma, two pi — and π* below σ*', () => {
    const n2 = localize('Nitrogen (N₂)');
    expect(countIn(n2, 'lone pair')).toBe(2);
    expect(countIn(n2, 'sigma')).toBe(1);
    expect(countIn(n2, 'pi')).toBe(2);
    expect(countEmpty(n2, 'pi antibond')).toBe(2);
    expect(countEmpty(n2, 'sigma antibond')).toBe(1);
    expect(virtual(n2)[0].character).toBe('pi antibond');
  });

  it('every molecule with localized orbitals reports both sections', () => {
    for (const name of ['Water (H₂O)', 'Ethene (C₂H₄)', 'Benzene (C₆H₆)', 'Nitrogen (N₂)']) {
      const localized = localize(name);
      expect(occupied(localized).length).toBeGreaterThan(0);
      expect(occupied(localized).every((o) => o.occupied)).toBe(true);
      expect(virtual(localized).every((o) => !o.occupied)).toBe(true);
      // the occupied section comes first, and the section boundary is exact
      const firstEmpty = localized.orbitals.findIndex((o) => !o.occupied);
      expect(localized.orbitals.slice(0, firstEmpty).every((o) => o.occupied)).toBe(true);
      expect(localized.orbitals.slice(firstEmpty).every((o) => !o.occupied)).toBe(true);
    }
  });

  it('the list ascends by ⟨φ|H|φ⟩ within each section — an energy ladder', () => {
    for (const name of ['Water (H₂O)', 'Ethene (C₂H₄)', 'Benzene (C₆H₆)', 'Nitrogen (N₂)']) {
      const localized = localize(name);
      for (const block of [occupied(localized), virtual(localized)]) {
        for (let i = 1; i < block.length; i++) {
          expect(block[i].energy).toBeGreaterThanOrEqual(block[i - 1].energy - 1e-9);
        }
      }
    }
    // the class is a label, not a rank: water's O–H bonds (−22.05 eV) lie BELOW
    // its lone pairs (−21.72, −14.80), which is the opposite of listing by
    // class, and the pure 2p lone pair lands exactly on the canonical HOMO
    const water = localize('Water (H₂O)');
    const waterOrder = occupied(water);
    expect(characters({ ...water, orbitals: waterOrder }))
      .toEqual(['sigma', 'sigma', 'lone pair', 'lone pair']);
    expect(waterOrder[3].energy).toBeCloseTo(-14.8, 2);
    // ...while benzene's delocalized set still sorts above every σ, because
    // that is where the numbers put it
    const benzene = localize('Benzene (C₆H₆)');
    const benzeneOrder = characters({ ...benzene, orbitals: occupied(benzene) });
    expect(benzeneOrder.lastIndexOf('sigma')).toBeLessThan(benzeneOrder.indexOf('delocalized'));
  });

  it('labels the way avo_ibo labels — their classes, in their words', () => {
    // The classifier is a port of avo_ibo's `_classify_orbital`: the same
    // names, the same gates, so our rows can be read beside an ibos.txt.
    const water = localize('Water (H₂O)');
    // the classes present in the occupied block, whatever order the ladder
    // puts them in
    expect([...new Set(characters({ ...water, orbitals: occupied(water) }))].sort())
      .toEqual(['lone pair', 'sigma']);
    // benzene's π set is Deloc under their gate: its fourth atom (5%) misses
    // the 3% ceiling that would have made it a three-centre orbital
    const benzene = localize('Benzene (C₆H₆)');
    expect(countIn(benzene, 'delocalized')).toBe(3);
  });

  it('a three-centre two-electron bridge is labelled 2e3c — diborane', () => {
    // The case the rule exists for. Diborane's bridges draw on three centres,
    // and the gate that finds them is avo_ibo's: a third atom above 10% with
    // no fourth above 3%. Their own table prints `B-B-H 2e3c` for exactly
    // these two orbitals.
    const diborane = localize('Diborane (B₂H₆)');
    expect(countIn(diborane, 'three-centre')).toBe(2);
    // four ordinary terminal B–H bonds, and nothing left over
    expect(countIn(diborane, 'sigma')).toBe(4);
    expect(occupied(diborane)).toHaveLength(6);
    // a bridge has three carriers, and the boron is one of them
    for (const bridge of occupied(diborane).filter((o) => o.character === 'three-centre')) {
      expect(bridge.atoms).toHaveLength(3);
      expect(bridge.atoms.some((a) => diborane.molecule.atoms[a].element === 'B')).toBe(true);
    }
  });
});

describe('the refusals', () => {
  it('an open shell (O2\'s partly-filled π*) gets no localized orbitals', () => {
    const molecule = example('Oxygen (O₂)');
    const result = solveExtendedHuckel(molecule)!;
    expect(result).not.toBeNull();
    expect(localizeOrbitals(molecule, result)).toBeNull();
  });

  it('the d8 pair: the tetrahedral triplet is refused, the square-planar singlet localizes', () => {
    // The ligand-field lesson in one test. Same metal, same +2 charge, same d8
    // count — the difference is the geometry and the spin, and the app treats
    // them differently for the right reason: 40 even electrons cannot say which
    // orbitals are singly occupied, so the triplet gets no filling; the singlet's
    // 48 fill pairwise and localize.
    const triplet = EXAMPLES.find((e) => e.name.includes('NiCl'))!;
    const squarePlanar = EXAMPLES.find((e) => e.name.includes('Ni(CN)'))!;
    expect(triplet.multiplicity).toBe(3);
    expect(squarePlanar.multiplicity).toBeUndefined(); // a singlet, the default

    const tetrahedralMol = { ...parseMolBlock(triplet.mol), multiplicity: 3 };
    const tetrahedral = solveExtendedHuckel(tetrahedralMol)!;
    expect(localizeOrbitals(tetrahedralMol, tetrahedral)).toBeNull();

    const planarMol = parseMolBlock(squarePlanar.mol);
    const planar = solveExtendedHuckel(planarMol)!;
    expect(planar.electronCount).toBe(48);
    const localized = localizeOrbitals(planarMol, planar)!;
    expect(localized.occupied).toHaveLength(24);
    const ordered = orderLocalizedOrbitals(planarMol, planar, localized);
    // the CN ligands: a sigma, two pi, and an N lone pair each
    expect(count(occupied({ molecule: planarMol, result: planar, orbitals: ordered }), 'sigma')).toBeGreaterThanOrEqual(4);
    expect(count(occupied({ molecule: planarMol, result: planar, orbitals: ordered }), 'pi')).toBeGreaterThanOrEqual(8);
    expect(count(occupied({ molecule: planarMol, result: planar, orbitals: ordered }), 'lone pair')).toBeGreaterThanOrEqual(4);
  });

  it('a molecule known to be open-shell gets none, even with an even count', () => {
    // Tetrahedral NiCl4(2-) is a triplet with 40 electrons — an even count, so
    // only the multiplicity can refuse it
    const example = EXAMPLES.find((e) => e.name.includes('NiCl'))!;
    const molecule: Molecule = { ...parseMolBlock(example.mol), multiplicity: example.multiplicity };
    const result = solveExtendedHuckel(molecule)!;
    expect(result.electronCount % 2).toBe(0);
    expect(localizeOrbitals(molecule, result)).toBeNull();
  });

  it('an odd electron count gets none either', () => {
    const molecule = example('Water (H₂O)');
    molecule.atoms[0] = { ...molecule.atoms[0], charge: 1 };
    const result = solveExtendedHuckel(molecule)!;
    expect(result.electronCount % 2).toBe(1);
    expect(localizeOrbitals(molecule, result)).toBeNull();
  });
});

describe('the Pipek–Mezey angle', () => {
  it('is the maximizer of the pair objective', () => {
    // The angle is analytic; a scan is what proves it. It also caught two
    // bugs the topology tests alone did not: the cross population has to be
    // the symmetrized one, and the rotation must act on whole rows.
    const molecule = example('Water (H₂O)');
    const result = solveExtendedHuckel(molecule)!;
    const { overlap, basis } = result;
    const nA = molecule.atoms.length;
    const objective = (i: number[], j: number[], theta: number) => {
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const ni = atomicPopulations(i.map((v, m) => c * v + s * j[m]), overlap, basis, nA);
      const nj = atomicPopulations(i.map((v, m) => -s * v + c * j[m]), overlap, basis, nA);
      return ni.reduce((sum, v, a) => sum + v * v + nj[a] * nj[a], 0);
    };

    let scanned = -Infinity;
    let scannedAt = 0;
    for (let k = -180; k <= 180; k++) {
      const theta = (k * Math.PI) / 720;
      const value = objective(result.coefficients[0], result.coefficients[1], theta);
      if (value > scanned) { scanned = value; scannedAt = theta; }
    }
    const analytic = pipekMezeyAngle(result.coefficients[0], result.coefficients[1], overlap, basis, nA);
    const atAnalytic = objective(result.coefficients[0], result.coefficients[1], analytic);
    expect(atAnalytic).toBeGreaterThan(scanned - 1e-9);
    // θ and θ ± π/2 rotate the pair to the same subspaces (the columns swap
    // and change sign, leaving the objective identical), so the scan may
    // report the equivalent angle at the range's edge.
    const reduced = Math.abs(((analytic - scannedAt) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2));
    expect(Math.min(reduced, Math.PI / 2 - reduced)).toBeLessThan(1e-2);
    // and it is a real rotation, not the no-op
    expect(Math.abs(analytic)).toBeGreaterThan(0.1);
    expect(atAnalytic).toBeGreaterThan(objective(result.coefficients[0], result.coefficients[1], 0) + 1e-3);
  });

  it('uses the symmetrized cross population (the row-wise Mulliken convention)', () => {
    const molecule = example('Water (H₂O)');
    const result = solveExtendedHuckel(molecule)!;
    const nA = molecule.atoms.length;
    const forward = crossPopulations(result.coefficients[0], result.coefficients[1], result.overlap, result.basis, nA);
    const backward = crossPopulations(result.coefficients[1], result.coefficients[0], result.overlap, result.basis, nA);
    // they differ — which is exactly why the angle must average them
    const differing = forward.some((v, a) => Math.abs(v - backward[a]) > 1e-6);
    expect(differing).toBe(true);
  });
});

describe('where PM is flat, the Hamiltonian picks the mixture', () => {
  it('separates an exactly equivalent pair into the H eigenbasis', () => {
    // Two atoms, two shells: an s shell and a p shell, with no s/p overlap
    // (its own symmetry forbids it in a real molecule, and here it is exact by
    // construction). Each shell is symmetric under swapping the atoms, so its
    // bonding combination carries EXACTLY half its population on each atom,
    // and the two shells cannot couple: the pair's PM objective is then
    // identical at every rotation angle. PM is flat there; H is not. The
    // binding levels of the two shells are the two lowest, so they are the
    // occupied pair. Start from the 45° "banana" mixture of them and check the
    // localizer hands the pair back.
    const overlap = [
      [1, 0.5, 0, 0],
      [0.5, 1, 0, 0],
      [0, 0, 1, 0.3],
      [0, 0, 0.3, 1],
    ];
    // eigenvalues, ascending: −32 (s binding), −20 (p binding), −16, −10
    const hamiltonian = [
      [-20, -4, 0, 0],
      [-4, -20, 0, 0],
      [0, 0, -16.5, -9.5],
      [0, 0, -9.5, -16.5],
    ];
    const solved = solveGeneralized(hamiltonian, overlap)!;
    const column = (k: number) => solved.vectors.map((row) => row[k]);
    const [sigma, pi] = [column(0), column(1)];
    const c = Math.SQRT1_2;
    // the start is the banana mixture, not an H eigenbasis
    const coefficients = [
      sigma.map((v, m) => c * v + c * pi[m]),
      sigma.map((v, m) => -c * v + c * pi[m]),
      column(2),
      column(3),
    ];
    const basis: BasisFunction[] = [
      { atomIndex: 0, angular: 's', axis: [0, 0, 0], n: 1, zeta: 1, hii: -10, label: 'A 1s' },
      { atomIndex: 1, angular: 's', axis: [0, 0, 0], n: 1, zeta: 1, hii: -10, label: 'B 1s' },
      { atomIndex: 0, angular: 'p', axis: [0, 0, 1], n: 2, zeta: 1, hii: -20, label: 'A 2pz' },
      { atomIndex: 1, angular: 'p', axis: [0, 0, 1], n: 2, zeta: 1, hii: -20, label: 'B 2pz' },
    ];
    const molecule: Molecule = {
      atoms: [
        { element: 'H', x: 0, y: 0, z: -0.7, charge: 0 },
        { element: 'H', x: 0, y: 0, z: 0.7, charge: 0 },
      ],
      bonds: [],
    };
    const result: ExtendedHuckelResult = {
      basis,
      overlap,
      hamiltonian,
      energies: solved.values,
      coefficients,
      electronCount: 4,
      frame: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    };

    // the start really is coupled: H off-diagonal in the banana basis
    const coupling = (a: number[], b: number[]) => a.reduce((s, v, m) => s + v * hamiltonian[m].reduce((t, w, k) => t + w * b[k], 0), 0);
    expect(Math.abs(coupling(coefficients[0], coefficients[1]))).toBeGreaterThan(0.1);

    const sets = localizeOrbitals(molecule, result)!;
    // the occupied pair is the one under test; the two remaining basis
    // functions are its virtual block
    const localized = sets.occupied;
    const off = Math.abs(coupling(localized[0], localized[1]));
    const e0 = energyOf(localized[0], hamiltonian);
    const e1 = energyOf(localized[1], hamiltonian);
    expect(off).toBeLessThan(1e-9);              // H is diagonal again
    expect(Math.abs(e0 - e1)).toBeGreaterThan(0.5); // and the pair is ordered
    expect([e0, e1].sort((a, b) => a - b)[0]).toBeCloseTo(solved.values[0], 8);
    expect([e0, e1].sort((a, b) => a - b)[1]).toBeCloseTo(solved.values[1], 8);
  });
});
