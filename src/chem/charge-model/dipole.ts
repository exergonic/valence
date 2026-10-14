/**
 * The dipole moment of a set of point charges.
 *
 * This is a CHARGE-MODEL dipole, not a quantum-mechanical one: it is the
 * dipole of the per-atom charges the display shows. Under GFN2-xTB the
 * display draws the full dipole instead (`dipoleFromFullGfn2`), and this one
 * only when the engine could not give it; under MMFF94 it is the BCI charges'
 * (chem/charge-model/bci-charges.ts), one distribution for the labels, the
 * ESP surface and the dipole.
 *
 * Physics: p = Σᵢ qᵢ(rᵢ − r_com). The sum is origin-independent for a
 * neutral molecule but not for an ion, so the origin sits at the center of
 * mass (standard atomic weights, see assign-mass.ts) — the usual
 * convention that keeps ions well-defined. Units: e·Å inside, Debye on
 * the way out (1 e·Å = 4.80320427 D).
 *
 * The physics vector points from the δ− end toward the δ+ end. The
 * rendered arrow uses the CHEMISTRY convention (arrowhead at δ−), so
 * `vector` is −p̂; the UI says so in one line because half the audience
 * has seen the physics convention.
 */
import type { Molecule } from '../../mol-parser';
import { ATOMIC_MASS } from '../assign-mass';

/** 1 e·Å = 4.80320427 D. */
const EA_TO_DEBYE = 4.80320427;

export interface DipoleResult {
  /** The physics dipole p = Σ qᵢ(rᵢ − r_com) in e·Å, pointing δ− → δ+.
   *  Tests check this; the renderer does not. */
  physics: [number, number, number];
  /** Rendered arrow direction: unit vector, δ+ → δ− — exactly −p̂. */
  vector: [number, number, number];
  /** Center of mass (Å), the dipole's origin — where the arrow sits. */
  com: [number, number, number];
  /** Magnitude in Debye. */
  debye: number;
  /** True when the BCI model had no type for a drawn ion's formal charge
   *  (the carbanion C⁻ most notably) and the missing residual was placed
   *  on the charged atom(s) by hand. The UI surfaces a caveat then. */
  residualCharge: boolean;
}

/** User-facing caveat, appended to the status warnings when the dipole runs
 *  on generic MMFF94 parameters (hypervalent centers, ...). */
export const DIPOLE_APPROXIMATE =
  'Dipole (MMFF94 charge model) is approximate — partial charges run on generic parameters';

/** User-facing caveat for an ion the BCI model could not represent: the
 *  drawn net charge was placed on the atom(s) that carry it because the
 *  MMFF94 type space has no charged variant for them. */
export const DIPOLE_RESIDUAL_CHARGE =
  'Dipole (MMFF94 charge model) is approximate — MMFF94 has no atom type for this drawn ion ' +
  '(e.g. carbanion C⁻); its net charge was placed on the atom(s) carrying it.';

/** The centre of mass (Å), standard atomic weights — the dipole's origin. An
 *  element the table does not know contributes 0 (see assign-mass.ts). */
function centreOfMass(molecule: Molecule): [number, number, number] {
  let totalMass = 0;
  for (const a of molecule.atoms) totalMass += ATOMIC_MASS[a.element] ?? 0;
  const com: [number, number, number] = [0, 0, 0];
  if (totalMass > 0) {
    for (const a of molecule.atoms) {
      const m = ATOMIC_MASS[a.element] ?? 0;
      com[0] += (m * a.x) / totalMass;
      com[1] += (m * a.y) / totalMass;
      com[2] += (m * a.z) / totalMass;
    }
  }
  return com;
}

/**
 * The point-charge dipole of any set of per-atom charges, indexed like
 * `molecule.atoms`: the MMFF94 BCI charges (`resolveCharges`) under that
 * model, or GFN2-xTB's point charges when the engine could not give its full
 * dipole. Null for no atoms, a charge that is not finite, or an array that
 * does not match the atoms.
 */
export function dipoleFromCharges(
  molecule: Molecule,
  charges: number[],
  residualCharge = false,
): DipoleResult | null {
  if (molecule.atoms.length === 0 || charges.length !== molecule.atoms.length) return null;
  for (const q of charges) {
    if (!Number.isFinite(q)) return null;
  }

  const com = centreOfMass(molecule);
  const physics: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < molecule.atoms.length; i++) {
    const a = molecule.atoms[i];
    const q = charges[i];
    physics[0] += q * (a.x - com[0]);
    physics[1] += q * (a.y - com[1]);
    physics[2] += q * (a.z - com[2]);
  }

  const norm = Math.hypot(physics[0], physics[1], physics[2]);
  const debye = norm * EA_TO_DEBYE;
  // The chemistry arrow runs opposite the physics vector; a vanishing
  // dipole has no preferred direction (the renderer draws nothing for it).
  const vector: [number, number, number] =
    norm > 1e-12 ? [-physics[0] / norm, -physics[1] / norm, -physics[2] / norm] : [0, 0, 0];

  return { physics, vector, com, debye, residualCharge };
}

/**
 * The full GFN2-xTB dipole — the point charges plus each atom's own dipole
 * (CAMM), what xtb prints as "full" — as a DipoleResult on the same footing
 * as `dipoleFromCharges`. The engine gives it about the coordinate origin;
 * for an ion that depends on the origin, so it is moved to the centre of mass,
 * where the charge-model dipole sits: p_com = p_origin − Q·r_com. Water: 2.28 D
 * (experiment 1.85 D), where its point charges alone give 1.59 D.
 */
export function dipoleFromFullGfn2(
  molecule: Molecule,
  aboutOriginDebye: [number, number, number],
): DipoleResult {
  const com = centreOfMass(molecule);
  const netCharge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
  const physics: [number, number, number] = [0, 1, 2].map(
    (k) => aboutOriginDebye[k] / EA_TO_DEBYE - netCharge * com[k],
  ) as [number, number, number];
  const norm = Math.hypot(physics[0], physics[1], physics[2]);
  const vector: [number, number, number] =
    norm > 1e-12 ? [-physics[0] / norm, -physics[1] / norm, -physics[2] / norm] : [0, 0, 0];
  return { physics, vector, com, debye: norm * EA_TO_DEBYE, residualCharge: false };
}
