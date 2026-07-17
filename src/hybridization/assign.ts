import type { HybridizationResult } from './types';
import { VALENCE } from '../data/valence';

function vecAngle(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const la = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  const lb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2);
  if (la < 1e-8 || lb < 1e-8) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb))));
}

// VSEPR: steric number = (σ bonds) + (lone pairs).
// sp = 2, sp² = 3, sp³ = 4.
export function assignBySteric(steric: number): HybridizationResult {
  switch (steric) {
    case 2: return { hybridization: 'sp', geometry: 'linear', bondAngles: [] };
    case 3: return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [] };
    default: return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [] };
  }
}

// Uses measured bond angles to choose hybridization when 3D coordinates are
// available.  Falls back to steric-number counting (valence electrons minus
// σ bonds minus π bonds) when there aren't enough vectors to measure angles.
export function assignHybridization(
  element: string,
  neighborVectors: [number, number, number][],
  piCount: number = 0,
): HybridizationResult {
  const neighborCount = neighborVectors.length;

  // Not enough neighbors to measure angles: guess hybridization from valence
  // electron count.  (e.g. diatomic N≡N has steric number 2 → sp)
  if (neighborCount < 2) {
    const lonePairs = Math.round(Math.max(0, (VALENCE[element] || 4) - neighborCount - piCount) / 2);
    const steric = Math.min(4, Math.max(2, neighborCount + lonePairs));
    return assignBySteric(steric);
  }

  const angles: number[] = [];
  for (let i = 0; i < neighborCount; i++) {
    for (let j = i + 1; j < neighborCount; j++) {
      angles.push(vecAngle(neighborVectors[i], neighborVectors[j]));
    }
  }

  const avgAngle = angles.reduce((s, a) => s + a, 0) / angles.length;
  const deg = avgAngle * (180 / Math.PI);

  if (neighborCount === 2) {
    // Linear (sp): 180°. Trigonal planar (sp²): ~120°. Tetrahedral (sp³): ~109.5°.
    // Rings can compress sp² C well below 120°; if the atom has its own π bond
    // (piCount > 0) we know it must be sp² regardless of the measured angle.
    if (deg > 165) {
      return { hybridization: 'sp', geometry: 'linear', bondAngles: [deg] };
    }
    if (deg > 110 || piCount > 0) {
      return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [deg] };
    }
    return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [deg] };
  }

  if (neighborCount === 3) {
    if (deg > 115) {
      return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [deg, deg, deg] };
    }
    return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [deg, deg, deg] };
  }

  // 4+ neighbors: always tetrahedral (VSEPR AX₄, AX₃E, AX₂E₂, etc.)
  return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [109.5, 109.5, 109.5, 109.5] };
}
