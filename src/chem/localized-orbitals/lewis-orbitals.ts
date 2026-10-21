/**
 * The Lewis structure the user drew, made into orbitals the NBO way, and the
 * donor–acceptor energies E(2) between them.
 *
 * Pipek–Mezey picks its own localized orbitals, and with them its own
 * resonance structure: formamide drawn O=C–N localizes as O⁻–C=N⁺ (an N–C π
 * and an oxygen π lone pair), so the amide's n(N) → π*(C=O) donation is not
 * there to show. NBO answers that by choosing a Lewis structure, the one with
 * the most electrons in it or one the user names ($CHOOSE). Here the sketch
 * names it, as it names everything else: the drawing is the specification.
 *
 * The recipe is NBO's, in miniature (Reed, Curtiss & Weinhold, Chem. Rev.
 * 1988, 88, 899):
 *
 *  1. Löwdin-orthogonalize the atomic orbitals (S^-1/2): the closest
 *     orthonormal set to the AOs, still each on its atom. NBO's natural atomic
 *     orbitals do the same job with occupancy weighting; for GFN2's minimal
 *     valence basis the plain version is close.
 *  2. Each lone pair the drawing implies (valence electrons, less the drawn
 *     bonds and charge, halved) is a top eigenvector of its atom's block of
 *     the density matrix, which is then projected out.
 *  3. Each drawn bond is the top eigenvector(s) of its two atoms' block of
 *     what is left: one for a single bond, two for a double, three for a
 *     triple. Within a multiple bond the most s-rich is the σ.
 *  4. Each bond's two halves are hybrids. An atom's hybrids from its several
 *     bonds are orthogonalized together, then each bond is re-formed from its
 *     pair, the occupancy-maximizing combination the bond and the other one its
 *     antibond.
 *  5. What an atom has left over is empty: an empty valence orbital (boron's
 *     p in BF₃, NBO's lone vacancy, LV) or, mostly d, a Rydberg-like polarization function.
 *
 * A bond drawn to an alkali metal is ionic, as in the VSEPR picture
 * (assign-orbitals.ts, ionicContacts): the metal's electron goes to the atom
 * it touches, which takes it as one more lone pair, and the metal keeps only
 * empty orbitals — NaOH is Na⁺ and ⁻OH, and the hydroxide's lone pairs donate
 * into the Na⁺'s empty 3s, the covalent part of an ionic bond.
 *
 * The set spans the basis and is orthonormal by construction. GFN2's Fock
 * matrix taken into it has a diagonal (each orbital's energy) and couplings,
 * and the coupling between a filled Lewis orbital i and an empty one j gives
 * the second-order stabilization
 *
 *     E(2) = qᵢ F²ᵢⱼ / (εⱼ − εᵢ)
 *
 * with qᵢ the donor's occupancy. This is NBO's E(2): a perturbative estimate
 * of what the donation is worth. It overstates strong resonance, and GFN2's
 * empty orbitals sit low (smaller εⱼ − εᵢ), so the numbers are for trends.
 */
import type { Molecule } from '../../mol-parser';
import { jacobiSymmetric } from '../../utils/eigen';
import { isAlkaliMetal, isDBlock, showsOnlyValenceS } from '../elements';
import { ionicContacts } from '../vsepr/assign-orbitals';
import { VALENCE_ELECTRONS } from '../valence-electrons';
import { atomicPopulations } from './mulliken-populations';
import type { OrbitalSpace } from './localize-pm';
import type { LocalizedCharacter, LocalizedOrbital } from './order-localized';

export interface LewisOrbitals {
  /** The filled Lewis orbitals (lone pairs and bonds), ascending ⟨φ|F|φ⟩,
   *  then the empty ones (antibonds, empty valence orbitals), ascending. The
   *  Rydbergs (d; an alkali metal's p) are left out: they take part in the
   *  set, not in the list. */
  orbitals: LocalizedOrbital[];
  /** ⟨φᵢ|F|φⱼ⟩ in eV between the orbitals above, in their order. */
  couplings: number[][];
  /** E(2) in eV between a filled orbital and an empty one, stored both ways
   *  round ([donor][acceptor] = [acceptor][donor]); 0 for any other pair. */
  donation: number[][];
  /** The share of the electrons the Lewis orbitals hold, 0–1. The rest is
   *  delocalization: what E(2) accounts for. */
  lewisShare: number;
  /** How many Rydberg orbitals were left out of the list. */
  rydbergs: number;
}

/** The orbitals, or why the drawing cannot be made into them. */
export type LewisResult = { lewis: LewisOrbitals } | { refusal: string };

/** An atom's leftover orbital counts as a d Rydberg past this d weight. */
const RYDBERG_D_SHARE = 0.5;

const refuse = (refusal: string): LewisResult => ({ refusal });

/**
 * The Lewis-structure orbitals of a closed-shell calculation, from the
 * molecule's drawn bonds, bond orders and formal charges.
 */
export function lewisOrbitals(molecule: Molecule, space: OrbitalSpace): LewisResult {
  const { atoms } = molecule;
  const { basis, overlap, hamiltonian } = space;
  const n = basis.length;
  const name = (atom: number) => `${atoms[atom].element}${atom + 1}`;

  // ── the drawn Lewis structure: bonds and orders as drawn, lone pairs from
  //    the electrons left over on each atom. A bond to an alkali metal is no
  //    shared pair: the metal's electron is counted on its partner instead.
  const cations = ionicContacts(molecule);
  const alkali = (atom: number) => isAlkaliMetal(atoms[atom].element);
  const bonds = molecule.bonds.filter((b) => !alkali(b.atom1Index) && !alkali(b.atom2Index));
  const contactsOf = (atom: number) => molecule.bonds.filter((b) => b.atom1Index === atom || b.atom2Index === atom).length;
  for (let a = 0; a < atoms.length; a++) {
    if (alkali(a) && contactsOf(a) > 1) {
      return refuse(`${name(a)} is drawn bonded to ${contactsOf(a)} atoms, and its one electron can go to only one of them`);
    }
  }
  const bondOrderSum = new Array<number>(atoms.length).fill(0);
  for (const bond of bonds) {
    if (bond.order < 1 || bond.order > 3) {
      return refuse('a bond is drawn as aromatic rather than single, double or triple, and a Lewis structure needs a Kekulé one');
    }
    bondOrderSum[bond.atom1Index] += bond.order;
    bondOrderSum[bond.atom2Index] += bond.order;
  }
  const lonePairs: number[] = [];
  for (let a = 0; a < atoms.length; a++) {
    const element = atoms[a].element;
    if (isDBlock(element) || (showsOnlyValenceS(element) && !isAlkaliMetal(element))) {
      return refuse(`${name(a)} is a metal, and a drawn Lewis structure does not describe its bonding`);
    }
    const valence = VALENCE_ELECTRONS[element];
    if (valence === undefined) return refuse(`there is no valence-electron count for ${element}`);
    // an alkali metal gives its electron away; its partner takes it
    const electrons = valence - (atoms[a].charge ?? 0) - (alkali(a) ? contactsOf(a) : 0) + cations[a].length;
    const left = electrons - bondOrderSum[a];
    if (left < 0) {
      return refuse(`${name(a)} is drawn with ${bondOrderSum[a]} bonds and has ${electrons} valence electrons to make `
        + 'them with — a three-centre bond (diborane’s bridges) is beyond a two-centre Lewis structure');
    }
    if (left % 2 !== 0) return refuse(`${name(a)} as drawn has an unpaired electron`);
    lonePairs.push(left / 2);
  }
  const drawnPairs = lonePairs.reduce((s, x) => s + x, 0) + bonds.reduce((s, b) => s + b.order, 0);
  if (drawnPairs !== space.occupied) {
    return refuse(`the drawing accounts for ${2 * drawnPairs} valence electrons and GFN2-xTB has ${2 * space.occupied}`);
  }

  // ── 1. the Löwdin basis: density and Fock matrix in it
  const { half, inverseHalf } = squareRoots(overlap);
  const density = zeros(n);
  for (let k = 0; k < space.occupied; k++) {
    const c = multiplyVector(half, space.coefficients[k]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) density[i][j] += 2 * c[i] * c[j];
  }
  const fock = multiply(inverseHalf, multiply(hamiltonian, inverseHalf));
  const onAtom: number[][] = atoms.map(() => []);
  basis.forEach((f, mu) => onAtom[f.atomIndex].push(mu));

  // ── 2. lone pairs, then project them out of the density
  const lonePairVectors: Array<{ atom: number; vector: number[] }> = [];
  for (let a = 0; a < atoms.length; a++) {
    for (const vector of topEigenvectors(density, onAtom[a], lonePairs[a])) lonePairVectors.push({ atom: a, vector });
  }
  const left = projectOut(density, lonePairVectors.map((lp) => lp.vector));

  // ── 3. bonds from two-atom blocks; σ is the most s-rich of a multiple bond
  const isS = basis.map((f) => (f.angular === 's' ? 1 : 0));
  const hybrids: Array<Array<{ bond: number; rank: number; vector: number[] }>> = atoms.map(() => []);
  for (let b = 0; b < bonds.length; b++) {
    const { atom1Index: a1, atom2Index: a2, order } = bonds[b];
    const found = sigmaFirst(topEigenvectors(left, [...onAtom[a1], ...onAtom[a2]], order), isS);
    for (let rank = 0; rank < found.length; rank++) {
      for (const a of [a1, a2]) {
        const part = found[rank].map((x, mu) => (basis[mu].atomIndex === a ? x : 0));
        const norm = Math.hypot(...part);
        if (norm < 1e-2) return refuse(`the drawn ${name(a1)}–${name(a2)} bond finds almost no density on ${name(a)}`);
        hybrids[a].push({ bond: b, rank, vector: part.map((x) => x / norm) });
      }
    }
  }

  // ── 4. orthogonalize each atom's hybrids, then re-form each bond from its pair
  for (let a = 0; a < atoms.length; a++) {
    if (lonePairs[a] + hybrids[a].length > onAtom[a].length) {
      return refuse(`${name(a)} is drawn with more bonds and lone pairs than it has orbitals — a three-centre bond `
        + '(diborane’s bridges) is beyond a two-centre Lewis structure');
    }
    const orthogonal = symmetricOrthonormalize(hybrids[a].map((h) => h.vector));
    if (!orthogonal) return refuse(`two of ${name(a)}’s bonds point the same way in the density`);
    orthogonal.forEach((vector, k) => { hybrids[a][k].vector = vector; });
  }
  const hybridOf = (a: number, b: number, rank: number) => hybrids[a].find((h) => h.bond === b && h.rank === rank)!.vector;

  interface Built { vector: number[]; character: LocalizedCharacter; atoms: number[]; lewis: boolean; rydberg: boolean }
  const built: Built[] = lonePairVectors.map(({ atom, vector }) => ({
    vector, character: 'lone pair', atoms: [atom], lewis: true, rydberg: false,
  }));
  for (let b = 0; b < bonds.length; b++) {
    const { atom1Index: a1, atom2Index: a2, order } = bonds[b];
    for (let rank = 0; rank < order; rank++) {
      const h1 = hybridOf(a1, b, rank);
      const h2 = hybridOf(a2, b, rank);
      const d11 = quadratic(density, h1, h1);
      const d22 = quadratic(density, h2, h2);
      const d12 = quadratic(density, h1, h2);
      const pair = jacobiSymmetric([[d11, d12], [d12, d22]]);
      const [c1, c2] = [pair.vectors[0][1], pair.vectors[1][1]]; // the larger eigenvalue: the bond
      const pi = rank > 0;
      built.push({
        vector: h1.map((x, mu) => c1 * x + c2 * h2[mu]),
        character: pi ? 'pi' : 'sigma', atoms: [a1, a2], lewis: true, rydberg: false,
      });
      built.push({
        vector: h1.map((x, mu) => c2 * x - c1 * h2[mu]),
        character: pi ? 'pi antibond' : 'sigma antibond', atoms: [a1, a2], lewis: false, rydberg: false,
      });
    }
  }

  // ── 5. each atom's leftover orbitals, made definite by its Fock block
  for (let a = 0; a < atoms.length; a++) {
    // An alkali cation keeps its own orbitals as they are: in NBO's natural
    // minimal basis its valence shell is the ns alone, so Na⁺'s 3s is its one
    // empty valence orbital and its 3p are Rydbergs. Mixed by the Fock block
    // they would come out sp hybrids toward the anion, half valence and half not.
    if (alkali(a)) {
      for (const mu of onAtom[a]) {
        const vector = new Array<number>(n).fill(0);
        vector[mu] = 1;
        const rydberg = basis[mu].angular !== 's';
        built.push({ vector, character: rydberg ? 'virtual' : 'lone vacancy', atoms: [a], lewis: false, rydberg });
      }
      continue;
    }
    const taken = [
      ...lonePairVectors.filter((lp) => lp.atom === a).map((lp) => lp.vector),
      ...hybrids[a].map((h) => h.vector),
    ];
    const count = onAtom[a].length - taken.length;
    if (count === 0) continue;
    const complement = projectOut(identityOn(n, onAtom[a]), taken);
    const spare = topEigenvectors(complement, onAtom[a], count);
    const block = spare.map((u) => spare.map((v) => quadratic(fock, u, v)));
    const { vectors } = jacobiSymmetric(block);
    for (let k = 0; k < count; k++) {
      const vector = new Array<number>(n).fill(0);
      spare.forEach((u, m) => { for (let mu = 0; mu < n; mu++) vector[mu] += vectors[m][k] * u[mu]; });
      const dShare = vector.reduce((s, x, mu) => s + (basis[mu].angular === 'd' ? x * x : 0), 0);
      const rydberg = dShare > RYDBERG_D_SHARE;
      built.push({ vector, character: rydberg ? 'virtual' : 'lone vacancy', atoms: [a], lewis: false, rydberg });
    }
  }

  // ── the Fock matrix and the occupancies in the new set
  const energyOf = (u: number[]) => quadratic(fock, u, u);
  const occupancyOf = (u: number[]) => quadratic(density, u, u);
  const listed = built
    .filter((o) => !o.rydberg)
    .map((o) => ({ ...o, energy: energyOf(o.vector), occupancy: occupancyOf(o.vector) }))
    .sort((x, y) => (x.lewis !== y.lewis ? (x.lewis ? -1 : 1) : x.energy - y.energy));
  const couplings = listed.map((u) => listed.map((v) => quadratic(fock, u.vector, v.vector)));
  const donation = listed.map((u, i) => listed.map((v, j) => {
    const [donor, acceptor, coupling] = u.lewis && !v.lewis ? [u, v, couplings[i][j]]
      : !u.lewis && v.lewis ? [v, u, couplings[i][j]] : [null, null, 0];
    if (!donor || !acceptor) return 0;
    const gap = acceptor.energy - donor.energy;
    return gap > 1e-6 ? (donor.occupancy * coupling * coupling) / gap : 0;
  }));
  const lewisElectrons = built.reduce((s, o) => s + (o.lewis ? occupancyOf(o.vector) : 0), 0);

  const orbitals: LocalizedOrbital[] = listed.map((o) => {
    const coefficients = multiplyVector(inverseHalf, o.vector);
    return {
      coefficients,
      energy: o.energy,
      character: o.character,
      occupied: o.lewis,
      populations: atomicPopulations(coefficients, overlap, basis, atoms.length),
      atoms: o.atoms,
      occupancy: o.occupancy,
    };
  });
  return {
    lewis: {
      orbitals,
      couplings,
      donation,
      lewisShare: lewisElectrons / (2 * space.occupied),
      rydbergs: built.filter((o) => o.rydberg).length,
    },
  };
}

/** One donation: a filled Lewis orbital into an empty one, E(2) in eV. */
export interface Donation {
  donor: number;
  acceptor: number;
  e2: number;
}

/**
 * Every donation at or above `minimum` (eV), strongest first — NBO's E(2)
 * table, the molecule-wide answer to "which delocalization matters here?".
 * Indices are into `orbitals`. Degenerate partners (benzene's six π → π*)
 * are each listed: they are separate interactions of equal size.
 */
export function rankDonations(orbitals: LocalizedOrbital[], donation: number[][], minimum: number): Donation[] {
  const found: Donation[] = [];
  orbitals.forEach((donor, i) => {
    if (!donor.occupied) return;
    orbitals.forEach((acceptor, j) => {
      if (!acceptor.occupied && donation[i][j] >= minimum) found.push({ donor: i, acceptor: j, e2: donation[i][j] });
    });
  });
  return found.sort((a, b) => b.e2 - a.e2);
}

/** S^1/2 and S^-1/2 of the overlap matrix. */
function squareRoots(S: number[][]): { half: number[][]; inverseHalf: number[][] } {
  const { values, vectors } = jacobiSymmetric(S);
  const n = S.length;
  const build = (f: (x: number) => number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += vectors[i][k] * f(values[k]) * vectors[j][k];
    return sum;
  }));
  return { half: build(Math.sqrt), inverseHalf: build((x) => 1 / Math.sqrt(x)) };
}

/** The `count` eigenvectors of M's block on `indices` with the largest
 *  eigenvalues, largest first, as full-length vectors. */
function topEigenvectors(M: number[][], indices: number[], count: number): number[][] {
  if (count === 0) return [];
  const block = indices.map((i) => indices.map((j) => M[i][j]));
  const { vectors } = jacobiSymmetric(block);
  const found: number[][] = [];
  for (let k = indices.length - 1; k >= indices.length - count; k--) {
    const vector = new Array<number>(M.length).fill(0);
    indices.forEach((i, m) => { vector[i] = vectors[m][k]; });
    found.push(vector);
  }
  return found;
}

/** A multiple bond's orbitals rotated so the first is the most s-rich, the σ;
 *  the rest, with no s, are the π. A single bond is returned as it is. */
function sigmaFirst(found: number[][], isS: number[]): number[][] {
  if (found.length < 2) return found;
  const sWeight = found.map((u) => found.map((v) => u.reduce((s, x, mu) => s + isS[mu] * x * v[mu], 0)));
  const { vectors } = jacobiSymmetric(sWeight);
  const k = found.length;
  return Array.from({ length: k }, (_, r) => {
    const column = k - 1 - r; // descending s weight
    return found[0].map((_, mu) => found.reduce((s, u, m) => s + vectors[m][column] * u[mu], 0));
  });
}

/** (1 − P) M (1 − P), P the projector on the given orthonormal vectors. */
function projectOut(M: number[][], vectors: number[][]): number[][] {
  if (vectors.length === 0) return M;
  const n = M.length;
  const Q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
    (i === j ? 1 : 0) - vectors.reduce((s, v) => s + v[i] * v[j], 0)));
  return multiply(Q, multiply(M, Q));
}

/** Symmetric (Löwdin) orthonormalization of a few vectors, or null when two
 *  are nearly the same. */
function symmetricOrthonormalize(vectors: number[][]): number[][] | null {
  if (vectors.length === 0) return [];
  const G = vectors.map((u) => vectors.map((v) => u.reduce((s, x, mu) => s + x * v[mu], 0)));
  const { values, vectors: E } = jacobiSymmetric(G);
  if (values[0] < 1e-6) return null;
  const k = vectors.length;
  const inverseHalf = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
    values.reduce((s, value, m) => s + E[i][m] * E[j][m] / Math.sqrt(value), 0)));
  return Array.from({ length: k }, (_, j) => vectors[0].map((_, mu) => vectors.reduce((s, v, i) => s + v[mu] * inverseHalf[i][j], 0)));
}

function zeros(n: number): number[][] {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

/** The identity on the given indices, zero elsewhere. */
function identityOn(n: number, indices: number[]): number[][] {
  const M = zeros(n);
  for (const i of indices) M[i][i] = 1;
  return M;
}

function multiply(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const m = B[0].length;
  const C = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++) {
    const row = A[i];
    for (let k = 0; k < row.length; k++) {
      const a = row[k];
      if (a === 0) continue;
      const Bk = B[k];
      for (let j = 0; j < m; j++) C[i][j] += a * Bk[j];
    }
  }
  return C;
}

function multiplyVector(A: number[][], v: number[]): number[] {
  return A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0));
}

/** uᵀ M v. */
function quadratic(M: number[][], u: number[], v: number[]): number {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    if (u[i] === 0) continue;
    const row = M[i];
    let inner = 0;
    for (let j = 0; j < v.length; j++) inner += row[j] * v[j];
    sum += u[i] * inner;
  }
  return sum;
}
