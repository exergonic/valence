// Valence electrons by element (group number): the most electrons an atom
// can put into bonding.  Used to count lone pairs below.
// Distinct from BOND_VALENCE (fill-hydrogens.ts, σ bonds usually formed) and the
// neutral-valence table in kekulize-smiles.ts (aromatic ring atoms).
const VALENCE_ELECTRONS: Record<string, number> = {
  H: 1, He: 0, Li: 1, Be: 2, B: 3,
  C: 4, N: 5, O: 6, F: 7,
  Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7,
  K: 1, Ca: 2, Ga: 3, Ge: 4, As: 5, Se: 6, Br: 7,
  Rb: 1, Sr: 2, In: 3, Sn: 4, Sb: 5, Te: 6, I: 7,
};

export type Hybridization = 's' | 'sp' | 'sp2' | 'sp3' | 'sp3d' | 'sp3d2' | 'p';

export type Geometry = 'linear' | 'trigonal_planar' | 'tetrahedral' | 'trigonal_bipyramidal' | 'octahedral';

export interface HybridizationResult {
  hybridization: Hybridization;
  geometry: Geometry;
}

// VSEPR: steric number = (σ bonds) + (lone pairs).
// 1 = s (hydrogen, no hybridization), 2 = sp, 3 = sp², 4 = sp³, 5 = sp³d, 6 = sp³d².
export function assignBySteric(steric: number): HybridizationResult {
  switch (steric) {
    case 1: return { hybridization: 's', geometry: 'linear' };
    case 2: return { hybridization: 'sp', geometry: 'linear' };
    case 3: return { hybridization: 'sp2', geometry: 'trigonal_planar' };
    case 4: return { hybridization: 'sp3', geometry: 'tetrahedral' };
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

  // Steric number = σ bonds + lone pairs. Hydrogen (1 σ bond, 0 lone
  // pairs) reads as 1 → pure s orbital. The upper clamp keeps hypervalent
  // atoms honest: PCl₅ (5 σ bonds, 0 lone pairs) reads as sp³d, SF₆ as sp³d².
  const steric = Math.min(6, sigmaBonds + lonePairs);
  return assignBySteric(steric);
}
