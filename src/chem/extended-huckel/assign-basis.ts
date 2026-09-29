/**
 * The atomic-orbital basis for a molecule, in the order the extended-Hückel
 * matrices are built: per atom, its s orbital then px, py, pz.
 *
 * The order matters — it is the row/column order of S and H, and it is the
 * order YAeHMOP prints, which is what lets the fixtures in
 * tests/references/eht be compared element by element.
 *
 * An element outside the parameter table gets no basis at all (null): a
 * transition metal without its d shell would give qualitatively wrong
 * orbitals, so the refusal is the honest answer, not a smaller basis.
 */
import type { Molecule } from '../../mol-parser';
import { EH_PARAMETERS } from './parameters';

export interface BasisFunction {
  /** Index into the molecule's atom list. */
  atomIndex: number;
  /** 's' or 'p' — this basis has no d orbitals yet (PLAN.md Phase 2, s+p). */
  angular: 's' | 'p';
  /** Unit vector along the p orbital's axis, in molecular coordinates
   *  (x, y, z); [0,0,0] for an s orbital. */
  axis: [number, number, number];
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
  }
  return basis;
}
