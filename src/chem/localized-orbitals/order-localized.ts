/**
 * The localized-orbital list: what each localized orbital is, and the order
 * the panel shows them in.
 *
 * Localized orbitals are not eigenstates — there is no eigenvalue to sort by —
 * so the list is ordered by **⟨φ|H|φ⟩**, the one-electron expectation of the
 * extended-Hückel Hamiltonian, within each section (occupied first, then the
 * valence-virtual block). It is well defined for any orbital — the mean of the
 * canonical energies the localized orbital spans — and it is the sort key
 * ONLY: the number inherits EH's parameter sensitivity, so it is never shown.
 *
 * The list is an **energy ladder**, ascending: lowest at the bottom of the
 * panel, rising as you read up, the way the canonical level diagram and other
 * programs draw it. Water comes out as the two O–H bonds (−21.94 eV on the
 * snapped MMFF94 geometry the tests use), the in-plane lone pair (−21.91), the
 * pure 2p lone pair (−14.80, which is the 1b1 exactly), then the two σ*: bonds
 * below lone pairs, below the empties. The bonds and the in-plane lone pair
 * sit 0.03 eV apart, so that part of the order is the geometry's to decide.
 *
 * **Class-first was tried and reversed** (added 2026-09-29, removed 2026-09-30).
 * Grouping lone pairs, then bonds, then the delocalized set gives a legible
 * list, and its note claimed the pure-energy order interleaves the classes
 * (water as lone pair, σ, σ, lone pair) — which does not reproduce: water sorts
 * σ, σ, LP, LP by ⟨φ|H|φ⟩. The user reads these lists as energy ladders, the
 * same way the Ladder tab reads, and a rank that sets a lone pair below a bond
 * contradicts the numbers beside it. The class is still *shown*, as the Type
 * string, so nothing is lost by not also sorting on it.
 */
import type { Molecule } from '../../mol-parser';
import { alignToPrincipalAxes } from '../extended-huckel/align-principal-axes';
import { EH_PARAMETERS } from '../extended-huckel/parameters';
import type { ExtendedHuckelResult } from '../extended-huckel/solve';
import type { DFunction } from '../extended-huckel/assign-basis';
import { aoWeights, atomicPopulations, bondPopulations } from './mulliken-populations';
import type { LocalizedSets } from './localize-pm';

/**
 * The orbital classes, in avo_ibo's vocabulary. That project's classifier
 * (`src/avogadro_ibo/analysis.py`, `_classify_orbital`) is the reference: the
 * names, the order the tests are applied in and the thresholds below are all
 * lifted from it, so a chemist can put our list beside an `ibos.txt` and read
 * the same words. Two deliberate differences, both noted where they act:
 *
 *  - `Core` is not ported. avo_ibo's rule is "one atom >99% with >75%
 *    s-character whose dominant s is n = 1", and in a full basis that finds an
 *    oxygen 1s. This basis is valence-only, so the same test would only ever
 *    fire on a hydrogen 1s — a hydride, mislabelled as a core. There are no
 *    core orbitals here to find.
 *  - The bond population's SIGN still splits a bond from its antibond, on top
 *    of the occupancy split avo_ibo uses. A localized occupied orbital that
 *    comes out out-of-phase between its two atoms is an antibond whatever its
 *    occupancy, and this is the only place that shows up.
 */
export type LocalizedCharacter =
  | 'lone pair'      // avo_ibo: LP       — one atom above 0.90
  | 'lone pair s'    // avo_ibo: LP-s     — one atom above 0.70, s-rich
  | 'sigma'          // σ
  | 'pi'             // π
  | 'delta'          // δ               — a d–d interaction, or a metal's
  | 'three-centre'   // avo_ibo: 2e3c   — three atoms, the third above 0.10
  | 'delocalized'    // avo_ibo: Deloc
  | 'sigma antibond' | 'pi antibond' | 'delta antibond'
  | 'antibond'       // avo_ibo: anti*  — an empty two-centre orbital past the gate
  | 'virtual';       // avo_ibo: (virt) / Virt

export interface LocalizedOrbital {
  /** Coefficients per AO, in the calculation frame and the solver's basis
   *  order — the same shape the MO renderers already take. */
  coefficients: number[];
  /** ⟨φ|H|φ⟩ in eV. The sort key within a section, and never displayed. */
  energy: number;
  character: LocalizedCharacter;
  /** Doubly occupied (an occupied-space orbital), or empty (a
   *  valence-virtual). Extended Hückel has no correlation, so this is exact;
   *  it is what splits the list into its two sections. */
  occupied: boolean;
  /** Mulliken population per atom, in atom order. */
  populations: number[];
  /** The atoms that carry it, strongest first. A share under 0.10 is a
   *  tail, and so is population that sits only in a same-n polarization d,
   *  so a lone pair names one atom. */
  atoms: number[];
}

/**
 * The thresholds, all from avo_ibo's classifier. Their populations come from an
 * orthonormal minimal (IAO) basis and ours are overlap-weighted Mulliken
 * populations, so the numbers are not identical — a water O–H bond is 62.3/37.7
 * there and 72/29 here. The gates are coarse enough to land on the same verdict
 * for every molecule we have checked; NOTES.md records the comparison.
 */
/** Their LP: one atom carries this much of the orbital. */
const LP_SHARE = 0.90;
/** Their σ/π gate: the top two atoms share this much, and the second carries
 *  at least the second figure — below that it is a tail, not a bond. */
const BOND_SHARE = 0.75;
const BOND_SECOND_MIN = 0.02;
/** Their LP-s: one atom above this, s-rich, is a lone pair in transition. */
const LP_S_SHARE = 0.70;
const LP_S_S_CHARACTER = 0.5;
/** Their 2e3c: a third atom above this, and no fourth above the gate. */
const THREE_CENTRE_THIRD = 0.10;
const THREE_CENTRE_FOURTH_MAX = 0.03;
/** An atom carries an orbital at this much of it — the three-centre gate,
 *  reused for the centre list the panel prints. A smaller share is a tail. */
const ATOM_CARRIER = THREE_CENTRE_THIRD;
/** Their π test inside a bond: both atoms this rich in p, or it is a σ. */
const PI_P_FRACTION = 0.85;
/** The virtuals' looser gates, theirs: the same sigma/pi test, then a
 *  three-centre pi* at a lower third-atom gate, then a two-centre anti* at
 *  0.60, then a virtual that still lives on one atom above 0.50. */
const VIRT_THREE_CENTRE_THIRD = 0.08;
const VIRT_BOND_SHARE = 0.60;
const VIRT_ONE_ATOM = 0.50;

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

/** One atom's share of an orbital, split by shell — what the classifier's
 *  gates read. `total` is the sum of that atom's weights, which is not 1:
 *  Mulliken populations sum to 1 over all atoms, and the tails live elsewhere. */
interface AtomShare {
  atom: number;
  total: number;
  s: number;
  p: number;
  d: number;
  /** The dominant d function on this atom by |weight|; null when it has none. */
  dominantD: DFunction | null;
  /** Weight in a same-n d shell (Si, P, S, Cl). Polarization, not a centre. */
  polarization: number;
}

/** A same-n d shell: Si, P, S, Cl. It polarizes the valence s and p; it is
 *  not the valence shell the way a metal's d (one n below the s) is.
 *
 *  The rule exists because our d is a BASIS ARTIFACT as much as a chemistry
 *  one: measured, sulfur's 3d carries ~10% of an iodine lone pair here, where a
 *  converged calculation gives under 1% (avo_ibo's SO₃ labels name s and p
 *  alone). A minimal-basis d is kept because the MO energies need it — SF₆ is
 *  only readable with one — and it is about an order of magnitude too heavy for
 *  populations, so it does not vote on topology. NOTES.md has the table. */
function polarizationD(element: string): boolean {
  const row = EH_PARAMETERS[element.toUpperCase()];
  return !!row?.d && row.d.n === row.s.n;
}

/** A valence d shell, n one below the s: the d block. 4d and 5d included;
 *  the same-n polarization functions are not. */
function valenceDShell(element: string): boolean {
  const row = EH_PARAMETERS[element.toUpperCase()];
  return !!row?.d && row.d.n < row.s.n;
}

/** What counts as this atom carrying the orbital. Polarization d dresses a
 *  tail — sulfur's 3d under an iodine lone pair — and is not a second centre. */
function centreShare(share: AtomShare): number {
  return Math.max(0, share.total - Math.max(0, share.polarization));
}

/** Per-atom s/p/d shares of an orbital, from the same AO weights the
 *  populations use. A negative total (an out-of-phase tail) counts as none. */
function atomShares(
  weights: number[],
  basis: ExtendedHuckelResult['basis'],
  elements: string[],
): AtomShare[] {
  const shares: AtomShare[] = Array.from({ length: elements.length }, (_, atom) => ({
    atom, total: 0, s: 0, p: 0, d: 0, dominantD: null, polarization: 0,
  }));
  const bestD = new Array<number>(elements.length).fill(0);
  for (let m = 0; m < basis.length; m++) {
    const orbital = basis[m];
    const share = shares[orbital.atomIndex];
    const weight = weights[m];
    share.total += weight;
    if (orbital.angular === 's') share.s += weight;
    else if (orbital.angular === 'p') share.p += weight;
    else {
      share.d += weight;
      if (polarizationD(elements[orbital.atomIndex])) share.polarization += weight;
      if (Math.abs(weight) > bestD[orbital.atomIndex]) {
        bestD[orbital.atomIndex] = Math.abs(weight);
        share.dominantD = orbital.d ?? null;
      }
    }
  }
  for (const share of shares) share.total = Math.max(0, share.total);
  return shares;
}

/** True when both atoms' p density lies along the bond rather than across it.
 *  The basis axes are the calculation frame's, so the bond has to be too.
 *
 *  An atom's three p coefficients are one vector, the direction its p hybrid
 *  points, and the share along the bond is (c·û)²/|c|² — a projection, so it
 *  does not care how the bond sits in the frame. Weighting each AO's Mulliken
 *  weight by its own axis's projection² instead (as this did) is only right
 *  for a bond along a coordinate axis: a p hybrid pointing straight down a
 *  bond along (1,1,1) scored 1/3, under the 0.5 cut — a σ bond called π. */
function pPointsAlongBond(
  a: number,
  b: number,
  coefficients: number[],
  basis: ExtendedHuckelResult['basis'],
  frameAtoms: Molecule['atoms'],
): boolean {
  const dx = frameAtoms[a].x - frameAtoms[b].x;
  const dy = frameAtoms[a].y - frameAtoms[b].y;
  const dz = frameAtoms[a].z - frameAtoms[b].z;
  const norm = Math.hypot(dx, dy, dz);
  if (norm < 1e-8) return false;
  const bx = dx / norm;
  const by = dy / norm;
  const bz = dz / norm;
  const alongFraction = (atom: number) => {
    let along = 0; // c·û
    let total = 0; // |c|²: the three p functions on one atom are orthonormal
    for (let m = 0; m < basis.length; m++) {
      const orbital = basis[m];
      if (orbital.atomIndex !== atom || orbital.angular !== 'p') continue;
      const c = coefficients[m];
      along += c * (orbital.axis[0] * bx + orbital.axis[1] * by + orbital.axis[2] * bz);
      total += c * c;
    }
    return total > 1e-12 ? (along * along) / total : 0;
  };
  return alongFraction(a) > 0.5 && alongFraction(b) > 0.5;
}

/**
 * σ, π or δ for a two-centre orbital — avo_ibo's `_two_center_bond_type`.
 *
 * The organic default is π when BOTH atoms draw their share mostly from p
 * functions, and σ otherwise. That calls I₂'s bond a π: it is two 5p orbitals
 * pointing at each other and has almost no s, so both atoms clear the p gate.
 * When that happens the bond direction decides. p density along the
 * internuclear axis is σ, across it is π.
 *
 * A metal overrides either answer. When a valence d shell carries the majority
 * of that atom's share, the dominant d decides — z² is σ, xz and yz are π, xy
 * and x²−y² are δ. avo_ibo restricts the branch to Z 21–30; the same rule
 * covers the 4d and 5d rows and stops there. The same-n d on Si, P, S and Cl
 * is polarization. A sulfur 3d tail under an iodine lone pair is not a δ bond.
 */
function twoCentreType(
  a: AtomShare,
  b: AtomShare,
  elements: string[],
  coefficients: number[],
  basis: ExtendedHuckelResult['basis'],
  frameAtoms: Molecule['atoms'],
): 'sigma' | 'pi' | 'delta' {
  const metal = [a, b].find((share) =>
    share.dominantD !== null
    && share.d > 0.5 * share.total
    && valenceDShell(elements[share.atom]));
  if (metal) {
    const kind = metal.dominantD;
    if (kind === 'xy' || kind === 'x2-y2') return 'delta';
    if (kind === 'xz' || kind === 'yz') return 'pi';
    return 'sigma';
  }
  const fraction = (share: AtomShare) => (share.total > 0 ? share.p / share.total : 0);
  if (fraction(a) <= PI_P_FRACTION || fraction(b) <= PI_P_FRACTION) return 'sigma';
  return pPointsAlongBond(a.atom, b.atom, coefficients, basis, frameAtoms) ? 'sigma' : 'pi';
}

/**
 * The character of one orbital — avo_ibo's `_classify_orbital`, ported.
 *
 * The order of the tests IS the classifier: a sharing gate first, then the
 * single-atom ones, then the three-centre gate, then Deloc. `shares` is sorted
 * by share, largest first.
 */
function classify(
  shares: AtomShare[],
  occupied: boolean,
  bondPops: number[],
  molecule: Molecule,
  coefficients: number[],
  basis: ExtendedHuckelResult['basis'],
  frameAtoms: Molecule['atoms'],
): LocalizedCharacter {
  const [first, second, third, fourth] = shares;
  if (!first) return 'virtual';
  const elements = molecule.atoms.map((atom) => atom.element);
  const share = (n: number) => (shares[n] ? shares[n].total : 0);
  const sFraction = first.total > 0 ? first.s / first.total : 0;

  // their two-centre gate, and the σ/π/δ typing behind it
  const twoCentre = (gate: number) => share(0) + share(1) > gate && share(1) > BOND_SECOND_MIN;
  const bondCharacter = (): LocalizedCharacter => {
    if (!second) return 'sigma';
    const kind = twoCentreType(first, second, elements, coefficients, basis, frameAtoms);
    const bondedPair = molecule.bonds.findIndex(
      (b) => (b.atom1Index === first.atom && b.atom2Index === second.atom)
        || (b.atom2Index === first.atom && b.atom1Index === second.atom),
    );
    // our addition: an occupied orbital whose bond population is negative is
    // out of phase, which is an antibond whatever its occupancy says
    const bonding = bondedPair < 0 || bondPops[bondedPair] >= 0;
    if (kind === 'pi') return bonding ? 'pi' : 'pi antibond';
    if (kind === 'delta') return bonding ? 'delta' : 'delta antibond';
    return bonding ? 'sigma' : 'sigma antibond';
  };

  // Their 2e3c gate sits BELOW the two-centre one in their code, and the gate
  // itself transfers — but the ORDER does not. Their populations are IAO and
  // put diborane's bridge at 0.72 on its two top atoms, so their bond test
  // misses it and the three-centre test catches it. Ours are overlap-weighted
  // Mulliken and put the same bridge at 0.79, so with their order it would come
  // out a plain σ — the one molecule the rule exists for. The three-centre
  // gate therefore runs first, which is also the chemically right question:
  // three comparable centres is not a two-centre bond.
  const threeCentre = !!third
    && third.total > THREE_CENTRE_THIRD
    && (!fourth || fourth.total <= THREE_CENTRE_FOURTH_MAX);

  if (occupied) {
    // their Core test is not ported: this basis has no core orbitals, and the
    // n = 1 condition would mislabel a hydride (see the type's comment)
    if (first.total > LP_SHARE) return 'lone pair';
    if (threeCentre) return 'three-centre';
    // SI₂'s iodine lone pairs sit at 0.90 on the iodine with the rest on
    // sulfur's 3d, just short of the 0.90 lone-pair gate above. The bond
    // test then accepts the tail, and the d shape names the orbital δ or π.
    // With the polarization d set aside the neighbour is a percent or two,
    // under the 0.10 a second centre has to carry.
    if (second && first.total > LP_S_SHARE && centreShare(second) <= ATOM_CARRIER) {
      return sFraction > LP_S_S_CHARACTER ? 'lone pair s' : 'lone pair';
    }
    if (twoCentre(BOND_SHARE)) return bondCharacter();
    if (first.total > LP_S_SHARE) return sFraction > LP_S_S_CHARACTER ? 'lone pair s' : 'lone pair';
    return 'delocalized';
  }

  if (second && twoCentre(BOND_SHARE)) {
    const kind = twoCentreType(first, second, elements, coefficients, basis, frameAtoms);
    return kind === 'pi' ? 'pi antibond' : kind === 'delta' ? 'delta antibond' : 'sigma antibond';
  }
  if (third && third.total > VIRT_THREE_CENTRE_THIRD) {
    const pFraction = first.total > 0 ? first.p / first.total : 0;
    return pFraction > PI_P_FRACTION ? 'pi antibond' : 'antibond';
  }
  if (twoCentre(VIRT_BOND_SHARE)) return 'antibond';
  if (first.total > VIRT_ONE_ATOM) return 'virtual';
  return 'virtual';
}

/** Character + the numbers the order needs, for one localized orbital. */
function describe(
  molecule: Molecule,
  result: ExtendedHuckelResult,
  coefficients: number[],
  occupied: boolean,
  frameAtoms: Molecule['atoms'],
): LocalizedOrbital {
  const atomCount = molecule.atoms.length;
  const elements = molecule.atoms.map((atom) => atom.element);
  const populations = atomicPopulations(coefficients, result.overlap, result.basis, atomCount);
  const weights = aoWeights(coefficients, result.overlap);
  const shares = atomShares(weights, result.basis, elements)
    .sort((x, y) => y.total - x.total);
  const bondPops = bondPopulations(coefficients, result.overlap, result.basis, molecule.bonds);
  // Polarization d does not make a second centre: SI₂'s sulfur 3d tail is
  // 0.10 of an iodine lone pair, and listing it draws "lone pair I–S".
  const ordered = shares.filter((share) => centreShare(share) > ATOM_CARRIER).map((share) => share.atom);
  return {
    coefficients,
    energy: quadratic(result.hamiltonian, coefficients),
    character: classify(shares, occupied, bondPops, molecule, coefficients, result.basis, frameAtoms),
    occupied,
    populations,
    atoms: ordered,
  };
}

/**
 * Describe and order the localized orbitals. `localized` is the pair of blocks
 * from `localizeOrbitals`.
 *
 * Two sections: the occupied orbitals first, then the empty valence-virtuals.
 * Each section is an energy ladder, lowest first — the class is the label,
 * not the rank. A class-first order was tried and reversed; the note at the
 * top of this file has the measurement. The sections themselves are the
 * display's split — a chemist reads "what is filled" before "what is empty",
 * and a hyperconjugation pair is one click from each.
 *
 * The σ/π decision for a p–p bond reads the bond direction in the calculation
 * frame (the basis axes live there). Everything else is populations.
 */
export function orderLocalizedOrbitals(
  molecule: Molecule,
  result: ExtendedHuckelResult,
  localized: LocalizedSets,
): LocalizedOrbital[] {
  const frameAtoms = alignToPrincipalAxes(molecule).atoms;
  const describeBlock = (rows: number[][], occupied: boolean) => rows.map(
    (coefficients) => describe(molecule, result, coefficients, occupied, frameAtoms),
  );
  return [
    ...describeBlock(localized.occupied, true).sort(bySectionThenEnergy),
    ...describeBlock(localized.virtual, false).sort(bySectionThenEnergy),
  ];
}

/** Ascending ⟨φ|H|φ⟩ within a section — the occupied block first, then the
 *  empties. The list is an energy ladder, so the number does the ordering and
 *  the class is a label rather than a rank: it is what a chemist reads to know
 *  what an orbital *is*, not where it sits.
 *
 *  Two symmetry-equivalent orbitals are exactly degenerate, so a stable
 *  tie-break is still needed for a deterministic order — the atoms carrying
 *  the orbital, which is what makes the two O–H bonds of water always list in
 *  the same sequence. */
function bySectionThenEnergy(a: LocalizedOrbital, b: LocalizedOrbital): number {
  if (a.occupied !== b.occupied) return a.occupied ? -1 : 1;
  if (Math.abs(a.energy - b.energy) > 1e-9) return a.energy - b.energy;
  for (let i = 0; i < Math.min(a.atoms.length, b.atoms.length); i++) {
    if (a.atoms[i] !== b.atoms[i]) return a.atoms[i] - b.atoms[i];
  }
  return a.atoms.length - b.atoms.length;
}
