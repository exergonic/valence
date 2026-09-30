/**
 * The atomic-orbital basis for a molecule, in the order the extended-Hückel
 * matrices are built: per atom, its s orbital, then px, py, pz, then — when
 * the element has 3d parameters — the five real d functions.
 *
 * The order matters — it is the row/column order of S and H, and it is the
 * order YAeHMOP prints, which is what lets the fixtures in
 * tests/references/eht be compared element by element. For d that order is
 * x²−y², z², xy, xz, yz, which is also the order `R_overlap_mat.c` lays its d
 * projection matrix out in.
 *
 * An element outside the parameter table gets no basis at all (null): a
 * transition metal without its d shell, or a second-row atom whose 3d is
 * missing, would give qualitatively wrong orbitals, so the refusal is the
 * honest answer, not a smaller basis.
 */
import type { Molecule } from '../../mol-parser';
import { EH_PARAMETERS } from './parameters';

/** The five real 3d functions, in YAeHMOP's order. */
export const D_FUNCTIONS = ['x2-y2', 'z2', 'xy', 'xz', 'yz'] as const;
export type DFunction = (typeof D_FUNCTIONS)[number];

export interface BasisFunction {
  /** Index into the molecule's atom list. */
  atomIndex: number;
  /** 's', 'p' or 'd'. */
  angular: 's' | 'p' | 'd';
  /** Unit vector along the p orbital's axis, in the *calculation frame* —
   *  the same coordinates the integrals are built in (see solve.ts), which
   *  are the molecule's own axes only when the two happen to coincide.
   *  [0,0,0] for an s or a d: the d functions are defined on the frame's own
   *  axes, and which of them an orbital is is `d`. */
  axis: [number, number, number];
  /** Which real d function (angular === 'd' only). Its shape in the frame. */
  d?: DFunction;
  /** Principal quantum number (labels the orbital: 2s, 2p). */
  n: number;
  /** Slater exponent ζ (bohr⁻¹). */
  zeta: number;
  /** Coulomb term Hᵢᵢ (eV) — the valence-state ionization potential. */
  hii: number;
  /** Diagnostic label in the oracle's form, e.g. "C( 1) 2px". */
  label: string;
}

const P_AXES: Array<{ suffix: string; axis: [number, number, number] }> = [
  { suffix: 'x', axis: [1, 0, 0] },
  { suffix: 'y', axis: [0, 1, 0] },
  { suffix: 'z', axis: [0, 0, 1] },
];

export function assignBasis(molecule: Molecule): BasisFunction[] | null {
  const basis: BasisFunction[] = [];
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const params = EH_PARAMETERS[atom.element.toUpperCase()];
    if (!params) return null;
    // the oracle's %3d field, normalized to single spaces: "C( 1) 2px", "H( 10) 1s"
    const label = `${atom.element.toUpperCase()}(${String(i + 1).padStart(3)})`.replace(/\s+/g, ' ');
    basis.push({
      atomIndex: i,
      angular: 's',
      axis: [0, 0, 0],
      n: params.s.n,
      zeta: params.s.zeta,
      hii: params.s.hii,
      label: `${label} ${params.s.n}s`,
    });
    if (!params.p) continue; // hydrogen and helium are 1s only
    for (const { suffix, axis } of P_AXES) {
      basis.push({
        atomIndex: i,
        angular: 'p',
        axis,
        n: params.p.n,
        zeta: params.p.zeta,
        hii: params.p.hii,
        label: `${label} ${params.p.n}p${suffix}`,
      });
    }
    if (!params.d) continue; // no 3d for this element: s+p is the whole basis
    for (const d of D_FUNCTIONS) {
      basis.push({
        atomIndex: i,
        angular: 'd',
        axis: [0, 0, 0],
        d,
        n: params.d.n,
        zeta: params.d.zeta,
        hii: params.d.hii,
        label: `${label} ${params.d.n}d${d}`,
      });
    }
  }
  return basis;
}
