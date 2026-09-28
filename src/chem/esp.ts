/**
 * The electrostatic potential surface — charge-model ESP, Phase 1 of PLAN.md.
 *
 * Physics: the electric potential of the molecule's point charges at a
 * surface vertex, V(r) = Σ qᵢ/|r − rᵢ|, with a floor on |r − rᵢ| so a
 * vertex that happens to sit on top of a nucleus cannot blow up. Units:
 * e/Å. This is the charge model (the resolved BCI charges the dipole and
 * the labels use), never quantum-mechanical.
 *
 * Color: the textbook diverging map — negative red, neutral green, positive
 * blue — mapped onto a symmetric scale. The scale is percentile-clipped on
 * |V| so a charged species' near-field blow-up cannot wash out the rest of
 * the surface (a plain min/max scale breaks on ions).
 */
import type { Molecule } from '../mol-parser';

/** Floor on |r − rᵢ| (Å) — a surface vertex at a nucleus's own position
 *  reads the charge's field at this distance, not at zero. */
export const ESP_CUTOFF = 0.35;

/** The electric potential of the point charges at one point in space. */
export function espPotentialAt(
  x: number,
  y: number,
  z: number,
  atoms: Molecule['atoms'],
  charges: number[],
): number {
  let v = 0;
  for (let i = 0; i < atoms.length; i++) {
    const dx = x - atoms[i].x;
    const dy = y - atoms[i].y;
    const dz = z - atoms[i].z;
    const r = Math.hypot(dx, dy, dz);
    v += charges[i] / Math.max(r, ESP_CUTOFF);
  }
  return v;
}

export type RGB = [number, number, number];

/** The textbook ESP diverging map on the unit scale: t ∈ [−1, 1] →
 *  red (negative) → green (neutral) → blue (positive), piecewise-linear in
 *  RGB between the three named stops. */
export function espColor(t: number): RGB {
  const x = Math.max(-1, Math.min(1, t));
  if (x <= 0) {
    const f = x + 1; // 0 → red, 1 → green
    return [Math.round(255 * (1 - f)), Math.round(255 * f), 0];
  }
  const f = x; // 0 → green, 1 → blue
  return [0, Math.round(255 * (1 - f)), Math.round(255 * f)];
}

/** The symmetric scale bound for a set of surface potentials: the
 *  `clipPercentile`-th percentile of |V|, so outliers (an ion's near-field)
 *  are clipped while the typical range keeps its resolution. The scale is
 *  symmetric about zero by construction — V is mapped to t = V/Vmax.
 *  Returns 1 when nothing anchors the scale (all-zero potentials). */
export function espVmax(potentials: number[], clipPercentile = 90): number {
  if (potentials.length === 0) return 1;
  const abs = potentials.map(Math.abs).sort((a, b) => a - b);
  const idx = Math.min(abs.length - 1, Math.max(0, Math.floor((clipPercentile / 100) * abs.length)));
  const peak = abs[idx];
  return peak > 1e-9 ? peak : 1;
}