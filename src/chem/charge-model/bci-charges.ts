/**
 * The charge model: MMFF94 BCI partial charges for the displayed molecule.
 *
 * Halgren's bond-charge increments (`assign_bci_charges` in the vendored
 * mmff94-ts), computed locally on the molecule as drawn so every geometry
 * path (PubChem, CACTVS, local) gets the same values and the charges always
 * match the bond graph actually shown. The geometry provider's own partial
 * charges (PubChem's PUBCHEM_MMFF94_PARTIAL_CHARGES) are deliberately
 * ignored.
 *
 * Everything charged in the app resolves through here — the dipole arrow,
 * the per-atom charge labels and the ESP surface — so ONE refusal rule
 * covers all three: an element outside the MMFF94 type space gets no
 * charges, and each consumer says so rather than printing a fallback
 * number ("no arrow, no lie").
 */
import { assign_atom_types, assign_bci_charges } from 'mmff94-ts';
import type { Molecule } from '../../mol-parser';
import { toMMFFMol } from '../../geometry/mmff94-molecule';
import { parameterGapInfo } from '../../geometry/parameter-warnings';

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
