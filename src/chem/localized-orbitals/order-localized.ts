/**
 * The localized-orbital list: what each localized orbital is, and the order
 * the panel shows them in.
 *
 * Localized orbitals are not eigenstates — there is no eigenvalue to sort by —
 * so the list is ordered by what a chemist can see, in two keys:
 *
 *  1. **Character**, from the Mulliken populations alone: a lone pair is
 *     concentrated on one atom and forms no bond; a two-centre orbital is a
 *     σ or π bond (or its antibonding counterpart, when the A–B overlap
 *     population is negative); anything spread over three or more centres is
 *     delocalized (π when it is built from parallel p orbitals, which is what
 *     benzene's ring orbitals are). No energies, no parameters.
 *  2. **Energy within a class**, ⟨φ|H|φ⟩ — the one-electron expectation of the
 *     extended-Hückel Hamiltonian. It is well defined for any orbital (it is
 *     the mean of the canonical energies the localized orbital spans), which
 *     is why it orders the members of a class even though it is not an
 *     eigenvalue. It is the sort key ONLY: the number inherits EH's parameter
 *     sensitivity, so it is never shown.
 *
 * Measured 2026-09-29 (NOTES.md): ordering by ⟨φ|H|φ⟩ alone interleaves the
 * classes (water is lone pair, σ, σ, lone pair), which is the aufbau picture
 * but not a legible list; class first, energy within the class, is both.
 * Within a class, ⟨φ|H|φ⟩ is exact enough to separate σ from π (ethene
 * −20.7/−13.2 eV) and to order the lone pairs (water −21.7/−14.8 eV).
 */
import type { Molecule } from '../../mol-parser';
import type { ExtendedHuckelResult } from '../extended-huckel/solve';
import { alignToPrincipalAxes } from '../extended-huckel/align-principal-axes';
import { vecDot, vecNormalize, vecSub } from '../../utils/vec3';
import { aoWeights, atomicPopulations, bondPopulations } from './mulliken-populations';
import type { LocalizedSets } from './localize-pm';

export type LocalizedCharacter =
  | 'lone pair'
  | 'sigma'
  | 'pi'
  | 'delocalized pi'
  | 'delocalized pi antibond'
  | 'delocalized'
  | 'sigma antibond'
  | 'pi antibond';

export interface LocalizedOrbital {
  /** Coefficients per AO, in the calculation frame and the solver's basis
   *  order — the same shape the MO renderers already take. */
  coefficients: number[];
  /** ⟨φ|H|φ⟩ in eV. The sort key within a class, and never displayed. */
  energy: number;
  character: LocalizedCharacter;
  /** Doubly occupied (an occupied-space orbital), or empty (a
   *  valence-virtual). Extended Hückel has no correlation, so this is exact;
   *  it is what splits the list into its two sections. */
  occupied: boolean;
  /** Mulliken population per atom, in atom order. */
  populations: number[];
  /** The atoms that carry it, strongest first — the same `ATOM_CARRIER`
   *  threshold the character test uses, so a percent-scale tail on a
   *  neighbouring atom is not listed as a second centre. */
  atoms: number[];
}

/** A lone pair: this much of the orbital on one atom… */
const LONE_PAIR_MIN = 0.7;
/** …with no second atom holding this much, and… */
const LONE_PAIR_MAX_SECOND = 0.25;
/** …no bond it forms stronger than this (a bond's overlap population). */
const LONE_PAIR_MAX_BOND = 0.1;
/** An atom "carries" the orbital at this much population. Two carriers make a
 *  two-centre bond; three or more make it delocalized. Population is a blunt
 *  instrument here — a ring π orbital can hold 0.49/0.31/0.14 on consecutive
 *  carbons, which is 0.80 on two of them — so the count of real carriers
 *  separates a ring from a bond where a top-two sum cannot. */
const ATOM_CARRIER = 0.1;
/** Above this share of perpendicular-p weight the orbital is π, not σ. */
const PI_FRACTION = 0.5;

/** The displayed order: lone pairs, then bonds, then delocalized π, then
 *  whatever is left, then antibonding. Within a class, by energy. */
const CHARACTER_RANK: Record<LocalizedCharacter, number> = {
  'lone pair': 0,
  sigma: 1,
  pi: 2,
  // A ring π and its antibonding partner share a rank: they never share a
  // section, and within one the energy orders them.
  'delocalized pi': 3,
  'delocalized pi antibond': 3,
  delocalized: 4,
  // σ* and π* share a rank: which is lower is a real ordering question
  // (ethene's π* lies below its σ*), so let the energy decide rather than
  // asserting it here.
  'sigma antibond': 5,
  'pi antibond': 5,
};

/** ⟨φ|M|φ⟩ for a symmetric matrix M in the AO basis. */
function quadratic(M: number[][], c: number[]): number {
  let sum = 0;
  for (let m = 0; m < c.length; m++) {
    const cm = c[m];
    if (cm === 0) continue;
    const row = M[m];
    for (let k = 0; k < c.length; k++) sum += cm * row[k] * c[k];
  }
  return sum;
}

/**
 * The share of an orbital's weight that comes from p functions perpendicular
 * to `direction` — the π test. A π bond is built from p orbitals across the
 * bond axis; a σ bond from s and along-axis p, so the two are separated by
 * this number alone.
 */
function perpendicularFraction(
  coefficients: number[],
  overlap: number[][],
  basis: ExtendedHuckelResult['basis'],
  atoms: number[],
  direction: [number, number, number],
): number {
  const weights = aoWeights(coefficients, overlap);
  let perpendicular = 0;
  let total = 0;
  for (let m = 0; m < basis.length; m++) {
    const orbital = basis[m];
    if (!atoms.includes(orbital.atomIndex)) continue;
    total += weights[m];
    if (orbital.angular !== 'p') continue;
    const along = Math.abs(vecDot(orbital.axis, direction));
    perpendicular += weights[m] * (1 - along * along);
  }
  return total !== 0 ? perpendicular / total : 0;
}

/**
 * A delocalized π system: every atom carrying the orbital contributes through
 * a p function, and all those p axes are parallel. That is what makes a ring
 * orbital π (benzene's π orbitals are pure 2pz on whichever carbons carry
 * them) rather than a delocalized σ network.
 */
function isDelocalizedPi(
  coefficients: number[],
  overlap: number[][],
  basis: ExtendedHuckelResult['basis'],
  populations: number[],
): boolean {
  const weights = aoWeights(coefficients, overlap);
  const dominant: [number, number, number][] = [];
  for (let a = 0; a < populations.length; a++) {
    if (Math.abs(populations[a]) < ATOM_CARRIER) continue;
    let best: [number, number, number] | null = null;
    let bestWeight = 0;
    for (let m = 0; m < basis.length; m++) {
      if (basis[m].atomIndex !== a || basis[m].angular !== 'p') continue;
      if (Math.abs(weights[m]) > bestWeight) {
        bestWeight = Math.abs(weights[m]);
        best = basis[m].axis;
      }
    }
    if (!best) return false;
    dominant.push(best);
  }
  if (dominant.length < 3) return false;
  for (let i = 1; i < dominant.length; i++) {
    if (Math.abs(vecDot(dominant[0], dominant[i])) < 0.9) return false;
  }
  return true;
}

/** Character + the numbers the order needs, for one localized orbital. */
function describe(
  molecule: Molecule,
  result: ExtendedHuckelResult,
  coefficients: number[],
  frameAtoms: Molecule['atoms'],
  occupied: boolean,
): LocalizedOrbital {
  const atomCount = molecule.atoms.length;
  const populations = atomicPopulations(coefficients, result.overlap, result.basis, atomCount);
  const ranked = populations
    .map((q, atom) => ({ q, atom }))
    .sort((x, y) => Math.abs(y.q) - Math.abs(x.q));
  const bondPops = bondPopulations(coefficients, result.overlap, result.basis, molecule.bonds);
  const strongestBond = bondPops.reduce((acc, b) => (Math.abs(b) > Math.abs(acc) ? b : acc), 0);

  const top = ranked[0];
  const carriers = ranked.filter((r) => r.q >= ATOM_CARRIER);
  let character: LocalizedCharacter;

  if (Math.abs(top.q) >= LONE_PAIR_MIN
    && (!ranked[1] || Math.abs(ranked[1].q) < LONE_PAIR_MAX_SECOND)
    && Math.abs(strongestBond) < LONE_PAIR_MAX_BOND) {
    character = 'lone pair';
  } else if (carriers.length === 2 && bonded(molecule, carriers[0].atom, carriers[1].atom)) {
    const [first, second] = carriers;
    const direction = vecNormalize(vecSub(
      [frameAtoms[second.atom].x, frameAtoms[second.atom].y, frameAtoms[second.atom].z],
      [frameAtoms[first.atom].x, frameAtoms[first.atom].y, frameAtoms[first.atom].z],
    ));
    const pi = perpendicularFraction(
      coefficients, result.overlap, result.basis, [first.atom, second.atom], direction,
    ) > PI_FRACTION;
    const bondIndex = molecule.bonds.findIndex(
      (b) => (b.atom1Index === first.atom && b.atom2Index === second.atom)
        || (b.atom2Index === first.atom && b.atom1Index === second.atom),
    );
    const bonding = bondIndex >= 0 ? bondPops[bondIndex] >= 0 : true;
    character = pi
      ? (bonding ? 'pi' : 'pi antibond')
      : (bonding ? 'sigma' : 'sigma antibond');
  } else {
    // A delocalized ring π with its bonds out of phase is an antibonding π*,
    // the same distinction the two-centre case draws from the bond sign —
    // without it the occupied π and the empty π* read identically.
    character = isDelocalizedPi(coefficients, result.overlap, result.basis, populations)
      ? (strongestBond < 0 ? 'delocalized pi antibond' : 'delocalized pi')
      : 'delocalized';
  }

  return {
    coefficients,
    energy: quadratic(result.hamiltonian, coefficients),
    character,
    occupied,
    populations,
    atoms: carriers.map((r) => r.atom),
  };
}

function bonded(molecule: Molecule, a: number, b: number): boolean {
  return molecule.bonds.some(
    (bond) => (bond.atom1Index === a && bond.atom2Index === b)
      || (bond.atom2Index === a && bond.atom1Index === b),
  );
}

/**
 * Describe and order the localized orbitals. `localized` is the pair of blocks
 * from `localizeOrbitals`.
 *
 * Two sections: the occupied orbitals first, then the empty valence-virtuals.
 * Each is ordered by character and then by energy within the class, so the
 * frontier orbitals of a section are not scattered through it. The sections
 * themselves are the display's split — a chemist reads "what is filled" before
 * "what is empty", and a hyperconjugation pair is one click from each.
 *
 * The frame is recomputed rather than passed in: it is deterministic (the
 * same molecule always yields the same axes), and the bond directions the π
 * test needs must be in the same frame the coefficients are in.
 */
export function orderLocalizedOrbitals(
  molecule: Molecule,
  result: ExtendedHuckelResult,
  localized: LocalizedSets,
): LocalizedOrbital[] {
  const frameAtoms = alignToPrincipalAxes(molecule).atoms;
  const describeBlock = (rows: number[][], occupied: boolean) => rows.map(
    (coefficients) => describe(molecule, result, coefficients, frameAtoms, occupied),
  );
  return [
    ...describeBlock(localized.occupied, true).sort(bySectionThenClass),
    ...describeBlock(localized.virtual, false).sort(bySectionThenClass),
  ];
}

/** Character rank first, then the energy within the class, then a
 *  deterministic tie-break on which atoms carry the orbital. */
function bySectionThenClass(a: LocalizedOrbital, b: LocalizedOrbital): number {
  const rank = CHARACTER_RANK[a.character] - CHARACTER_RANK[b.character];
  if (rank !== 0) return rank;
  if (Math.abs(a.energy - b.energy) > 1e-9) return a.energy - b.energy;
  for (let i = 0; i < Math.min(a.atoms.length, b.atoms.length); i++) {
    if (a.atoms[i] !== b.atoms[i]) return a.atoms[i] - b.atoms[i];
  }
  return a.atoms.length - b.atoms.length;
}
