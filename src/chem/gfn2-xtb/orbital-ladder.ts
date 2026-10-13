/**
 * GFN2-xTB's molecular orbitals as a ladder the MO panel can show beside
 * extended Hückel's: the same rows, the same irrep labels, the same
 * symmetry-adapted partners in a degenerate set.
 *
 * GFN2's are self-consistent orbitals — each electron feels the others'
 * charge, which extended Hückel's fixed Hᵢᵢ do not — so their ORDER is the one
 * worth teaching where the two disagree (which of a carbonyl's n and π lies
 * higher). Their absolute energies are GFN2's: semiempirical, and its empty
 * orbitals sit low (formaldehyde's LUMO at −8 eV).
 *
 * The worker runs the single point in the principal-axis frame and describes
 * each basis function (atom, s/p/d, axis or d shape), which is all the
 * irrep labelling and the canonicalization read — so both are reused as they
 * are, on GFN2's own overlap matrix.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from '../extended-huckel/assign-basis';
import { canonicalizeDegenerateSets } from '../extended-huckel/canonicalize-degenerate';
import { labelIrreps } from '../extended-huckel/irrep-labels';
import { period } from '../elements';
import type { Gfn2Properties } from '../../geometry/gfn2-refine';
import type { OrbitalSpace } from '../localized-orbitals/localize-pm';

/** One spin channel's orbitals, lowest first. */
export interface Gfn2Ladder {
  basis: BasisFunction[];
  overlap: number[][];
  /** eV */
  energies: number[];
  /** [orbital][AO], canonicalized within each degenerate set. */
  coefficients: number[][];
  /** 0–2 for a closed shell, 0–1 for one spin channel of an open shell. */
  occupations: number[];
  /** Mulliken share of each orbital on each atom, [orbital][atom]. */
  atomShares: number[][];
  labels: (string | null)[];
  /** Which channel, for an open shell. */
  spin: 'alpha' | 'beta' | null;
}

const P_NAME = ['x', 'y', 'z'];

/** The basis functions in the form the extended-Hückel code reads. Only the
 *  atom, the angular type and the axis or d shape matter to it; the label is
 *  what the composition line prints ("O( 2) pz"). */
function asBasisFunctions(molecule: Molecule, properties: Gfn2Properties): BasisFunction[] | null {
  if (!properties.orbitalBasis) return null;
  return properties.orbitalBasis.map((fn) => {
    const element = molecule.atoms[fn.atomIndex].element;
    const suffix = fn.angular === 'p' ? P_NAME[fn.axis.findIndex((c) => c !== 0)] : fn.angular === 'd' ? fn.d : '';
    return {
      atomIndex: fn.atomIndex,
      angular: fn.angular,
      axis: fn.axis,
      d: fn.d,
      n: period(element),
      zeta: 0,
      hii: 0,
      label: `${element}(${String(fn.atomIndex + 1).padStart(3)}) ${fn.angular}${suffix ?? ''}`.replace(/\s+/g, ' '),
    };
  });
}

/** Each orbital's Mulliken share per atom: Σ over the atom's AOs of c_μ (S c)_μ. */
function shares(basis: BasisFunction[], overlap: number[][], coefficients: number[][], atomCount: number): number[][] {
  return coefficients.map((c) => {
    const out = new Array(atomCount).fill(0);
    for (let mu = 0; mu < basis.length; mu++) {
      let sc = 0;
      for (let nu = 0; nu < basis.length; nu++) sc += overlap[mu][nu] * c[nu];
      out[basis[mu].atomIndex] += c[mu] * sc;
    }
    return out;
  });
}

/**
 * One ladder as an OrbitalSpace, for the localized orbitals. GFN2 gives no
 * Hamiltonian matrix, but its orbitals diagonalize its Fock matrix, so the
 * matrix is rebuilt from them: F = S C ε Cᵀ S, exactly the operator whose
 * eigenpairs they are (orthonormal on S, a full set in a square basis).
 * Null when a level is fractionally filled — GFN2's Fermi filling leaves one
 * where levels are degenerate at the frontier, and the occupied set is then
 * not settled.
 */
export function gfn2OrbitalSpace(ladder: Gfn2Ladder): OrbitalSpace | null {
  const capacity = ladder.spin ? 1 : 2;
  const occupied = ladder.occupations.filter((o) => o === capacity).length;
  if (ladder.occupations.some((o, i) => o !== (i < occupied ? capacity : 0))) return null;
  const n = ladder.basis.length;
  const fock = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  ladder.coefficients.forEach((c, k) => {
    const sc = ladder.overlap.map((row) => row.reduce((sum, s, nu) => sum + s * c[nu], 0));
    const energy = ladder.energies[k];
    for (let mu = 0; mu < n; mu++) {
      const scale = energy * sc[mu];
      for (let nu = 0; nu < n; nu++) fock[mu][nu] += scale * sc[nu];
    }
  });
  return { basis: ladder.basis, overlap: ladder.overlap, hamiltonian: fock, coefficients: ladder.coefficients, occupied };
}

/** The α ladder (the only one for a closed shell) and the β ladder of an open
 *  shell. Null when the engine build cannot describe its basis. */
export function gfn2Ladders(molecule: Molecule, properties: Gfn2Properties): { alpha: Gfn2Ladder; beta: Gfn2Ladder | null } | null {
  const basis = asBasisFunctions(molecule, properties);
  if (!basis) return null;
  const build = (channel: 'alpha' | 'beta'): Gfn2Ladder | null => {
    const set = channel === 'alpha' ? properties.alpha : properties.beta;
    const raw = channel === 'alpha' ? properties.coefficients.alpha : properties.coefficients.beta;
    if (!set || !raw) return null;
    const coefficients = canonicalizeDegenerateSets(basis, raw, set.energies, properties.frame.atoms);
    // GFN2 fills by a Fermi distribution (300 K), which leaves a few
    // thousandths of an electron in the level above the frontier — enough for
    // "occupied > 0" to call it occupied (H₃Si–Ni's β MO 9 held 0.002). Snap
    // what is within 5 % of empty or full; a genuinely fractional level keeps
    // its share.
    const capacity = properties.beta ? 1 : 2;
    const occupations = set.occupations.map((o) => (o < 0.05 * capacity ? 0 : o > 0.95 * capacity ? capacity : o));
    return {
      basis,
      overlap: properties.overlap,
      energies: set.energies,
      coefficients,
      occupations,
      atomShares: shares(basis, properties.overlap, coefficients, molecule.atoms.length),
      labels: labelIrreps(molecule, basis, coefficients, set.energies, properties.overlap),
      spin: properties.beta ? channel : null,
    };
  };
  const alpha = build('alpha');
  if (!alpha) return null;
  return { alpha, beta: build('beta') };
}
