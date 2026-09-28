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
}

/** User-facing caveat, appended to the status warnings when the dipole runs
 *  on generic MMFF94 parameters (hypervalent centers, ...). */
export const DIPOLE_APPROXIMATE =
  'Dipole (MMFF94 charge model) is approximate — partial charges run on generic parameters';

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
  // An element outside the MMFF94 type space gets a generic fallback type
  // and therefore charges that are not the BCI model at all — return no
  // arrow rather than a wrong one.
  if (parameterGapInfo(molecule).untyped.length > 0) return null;

  // BCI charges are geometry-independent (connectivity + types only), so
  // this is computed once per molecule, not per frame.
  const typed = assign_bci_charges(assign_atom_types(toMMFFMol(molecule)), { round: false });
  const charges = typed.partial_charges;
  if (!charges || charges.length !== molecule.atoms.length) return null;
  for (const q of charges) {
    if (!Number.isFinite(q)) return null;
  }

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

  return { physics, vector, com, debye };
}