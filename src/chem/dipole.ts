/**
 * Dipole moment from the MMFF94 BCI partial-charge model.
 *
 * This is a CHARGE-MODEL dipole, not a quantum-mechanical one: the
 * charges come from Halgren's bond-charge-increments (assign_bci_charges
 * in the vendored mmff94-ts), computed locally on the displayed molecule
 * so every geometry path (PubChem, CACTVS, local) gets the same values
 * and the charges always match the bond graph actually shown. The
 * geometry provider's own partial charges (PubChem's
 * PUBCHEM_MMFF94_PARTIAL_CHARGES) are deliberately ignored.
 *
 * Physics: p = Σᵢ qᵢ(rᵢ − r_com). The sum is origin-independent for a
 * neutral molecule but not for an ion, so the origin sits at the center
 * of mass (standard atomic weights, see assign-mass.ts) — the usual
 * convention that keeps ions well-defined. Units: e·Å inside, Debye on
 * the way out (1 e·Å = 4.80320427 D).
 *
 * The physics vector points from the δ− end toward the δ+ end. The
 * rendered arrow uses the CHEMISTRY convention (arrowhead at δ−), so
 * `vector` is −p̂; the UI says so in one line because half the audience
 * has seen the physics convention.
 */
import { assign_atom_types, assign_bci_charges } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';
import { toMMFFMol } from '../geometry/mmff-refine';
import { ATOMIC_MASS } from './assign-mass';
import { parameterGapInfo } from '../geometry/parameter-warnings';

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

/** The BCI charges of a molecule and how much of its drawn charge they
 *  account for. The BCI model puts a formal charge on a molecule only
 *  through atom TYPES with a primary q⁰ (ammonium N⁺ → 34, carboxylate O →
 *  32, ...). An ion with no such type — the carbanion C⁻ most notably;
 *  MMFF94 defines no carbon-anion type — comes back from the library
 *  neutral, its drawn charge silent: `residual` ends up nonzero.
 *
 *  Shared by the dipole (which injects the residual onto the charged atoms)
 *  and the fetch guard (which rejects a remote conformer whose ion the type
 *  space cannot represent — see validate-structure.ts). Returns null when
 *  the library cannot type or charge the molecule at all. */
export interface ChargeModelResult {
  /** BCI partial charges, full precision ({ round: false }, like the dipole). */
  charges: number[];
  /** Net formal charge of the molecule (sum of the drawn charges). */
  netFormal: number;
  /** netFormal − Σ q_BCI — the charge the type space could not represent
   *  (0 for every ion MMFF94 can type: N⁺, carboxylate O⁻, halides, ...). */
  residual: number;
}

export function chargeModelResult(molecule: Molecule): ChargeModelResult | null {
  const typed = assign_bci_charges(assign_atom_types(toMMFFMol(molecule)), { round: false });
  const charges = typed.partial_charges;
  if (!charges || charges.length !== molecule.atoms.length) return null;

  let netFormal = 0;
  for (const a of molecule.atoms) netFormal += a.charge ?? 0;
  let bciSum = 0;
  for (const q of charges) bciSum += q;
  return { charges, netFormal, residual: netFormal - bciSum };
}

/** The resolved charges the app actually displays: the BCI charges with any
 *  residual (a drawn charge the type space cannot represent — the carbanion
 *  C⁻) placed on the atom(s) that carry it. `residualCharge` is set when
 *  that placement ran, so the UI can report the model was approximated.
 *  Shared by the dipole arrow, the per-atom charge labels and the ESP
 *  surface, so every number on screen comes from one resolution — and every
 *  consumer inherits the one refusal rule. */
export interface ResolvedCharges {
  charges: number[];
  residualCharge: boolean;
}

export function resolveCharges(molecule: Molecule): ResolvedCharges | null {
  try {
    // An element outside the MMFF94 type space gets a generic fallback type
    // and therefore charges that are not the BCI model at all — refuse here
    // (null), so the dipole says "n/a", the charge labels print nothing, and
    // the ESP draws no surface, all from this one guard. The "no arrow, no
    // lie" ladder is uniform across every charge consumer.
    if (parameterGapInfo(molecule).untyped.length > 0) return null;

    const charged = chargeModelResult(molecule);
    if (!charged) return null;
    const charges = charged.charges;

    // A nonzero residual is a drawn charge the type space could not
    // represent (the carbanion C⁻: it types as the neutral CR, its C–H BCI
    // is 0, and the −1 is silent in the library's sum). The sketch is the
    // specification, so the model may not drop it: place the residual on the
    // atom(s) the sketch charged, in proportion to their formal charge (a
    // lone −1 lands whole on its C). Model bookkeeping, not physics, so it
    // flags the UI with the other approximations.
    let residualCharge = false;
    if (Math.abs(charged.residual) > 1e-9) {
      // A nonzero residual with no atom to hang it on (no formal charges) is
      // an internal inconsistency — refuse rather than invent a home for it.
      if (Math.abs(charged.netFormal) < 1e-9) return null;
      for (let i = 0; i < molecule.atoms.length; i++) {
        const fc = molecule.atoms[i].charge ?? 0;
        if (fc !== 0) charges[i] += charged.residual * (fc / charged.netFormal);
      }
      residualCharge = true;
    }
    return { charges, residualCharge };
  } catch {
    return null;
  }
}

export function computeDipole(molecule: Molecule): DipoleResult | null {
  if (molecule.atoms.length === 0) return null;
  try {
    return computeDipoleOrThrow(molecule);
  } catch {
    // The typing/charge machinery must never take the render down (the
    // local pipeline wraps its library calls the same way) — no dipole
    // rather than a crash.
    return null;
  }
}

function computeDipoleOrThrow(molecule: Molecule): DipoleResult | null {
  // BCI charges are geometry-independent (connectivity + types only), so
  // this is computed once per molecule, not per frame. resolveCharges
  // returns the final displayed values — BCI plus any residual placement,
  // the same numbers the charge labels will show.
  const resolved = resolveCharges(molecule);
  if (!resolved) return null;
  const charges = resolved.charges;
  for (const q of charges) {
    if (!Number.isFinite(q)) return null;
  }
  const residualCharge = resolved.residualCharge;

  // Center of mass from standard atomic weights. An element the table does
  // not know contributes 0 — it is skipped (see assign-mass.ts for the
  // documented fallback).
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
