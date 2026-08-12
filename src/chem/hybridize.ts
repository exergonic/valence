import { VALENCE_ELECTRONS } from './valence';

export type Hybridization = 'sp' | 'sp2' | 'sp3' | 'sp3d' | 'sp3d2' | 'p';

export type Geometry = 'linear' | 'trigonal_planar' | 'tetrahedral' | 'trigonal_bipyramidal' | 'octahedral';

export interface HybridizationResult {
  hybridization: Hybridization;
  geometry: Geometry;
}

// VSEPR: steric number = (σ bonds) + (lone pairs).
// sp = 2, sp² = 3, sp³ = 4, sp³d = 5, sp³d² = 6.
export function assignBySteric(steric: number): HybridizationResult {
  switch (steric) {
    case 2: return { hybridization: 'sp', geometry: 'linear' };
    case 3: return { hybridization: 'sp2', geometry: 'trigonal_planar' };
    case 5: return { hybridization: 'sp3d', geometry: 'trigonal_bipyramidal' };
    case 6: return { hybridization: 'sp3d2', geometry: 'octahedral' };
    default: return { hybridization: 'sp3', geometry: 'tetrahedral' };
  }
}

// Hybridization is an electron-domain count: how many σ bonds and lone
// pairs surround the atom. Both are discrete properties of the bond graph
// (elements + bond orders), so the count never needs 3D coordinates.
//
// The earlier version measured bond angles and thresholded them (2
// neighbors: >165° linear, >115° sp², else sp³). Measured angles are the
// OUTPUT of geometry refinement, not an identity of the atom: the MMFF94
// C–O–C equilibrium of dimethyl ether is 111.7°, and the old 110° cut
// classified every refined ether oxygen as sp² with a pure p orbital
// instead of two equivalent sp³ lone pairs. No threshold can separate the
// continuous sp³ range (104–113°) from sp²'s ~120°, but the topology can:
// an ether O has 2 σ bonds → 2 lone pairs → 4 domains → sp³ at any angle,
// while a carbonyl O (1 σ + 1 π) has 3 domains → sp². Ring compression
// works the same way: a cyclopropane carbon is CH₂ — 4 σ bonds — and
// reads sp³ whatever the 60° ring angle.
export function assignHybridization(
  element: string,
  sigmaBonds: number,
  piCount: number = 0,
): HybridizationResult {
  const valence = VALENCE_ELECTRONS[element] || 4;

  // Lone pairs from the valence-electron bookkeeping. floor() resolves the
  // half-electron remainders that formal charge would: a nitro N
  // (5 − 3 σ − 1 π = 1 → 0.5) keeps 0 lone pairs (sp²) and a carboxylate
  // O⁻ (6 − 1 = 5 → 2.5) keeps 2 (sp² — the resonance structure), where
  // round() would inflate both by one. The cost is a bare amide anion
  // (1.5 → 1 lone pair, sp²) reading one short of its true sp³.
  const lonePairs = Math.floor(Math.max(0, (valence - sigmaBonds - piCount) / 2));

  // Steric number = σ bonds + lone pairs. The clamp covers the edges:
  // hydrogen (1 domain) reads as sp, and hypervalent atoms read as
  // sp³d (5 domains — PCl₅) or sp³d² (6 domains — SF₆). The floor()
  // lone-pair count keeps hypervalent atoms honest: PCl₅'s P has
  // (5 − 5)/2 = 0 lone pairs, so its 5 domains are all σ bonds.
  const steric = Math.min(6, Math.max(2, sigmaBonds + lonePairs));
  return assignBySteric(steric);
}
