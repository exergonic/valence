import type { HybridizationResult } from './types';
import { VALENCE } from '../data/valence';

export function vecAngle(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const la = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  const lb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2);
  if (la < 1e-8 || lb < 1e-8) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb))));
}

export function assignBySteric(steric: number): HybridizationResult {
  switch (steric) {
    case 2: return { hybridization: 'sp', geometry: 'linear', bondAngles: [] };
    case 3: return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [] };
    default: return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [] };
  }
}

export function assignHybridization(
  element: string,
  neighborVectors: [number, number, number][],
  piCount: number = 0,
): HybridizationResult {
  const n = neighborVectors.length;

  if (n < 2) {
    const steric = Math.min(4, Math.max(2, n + Math.round(Math.max(0, (VALENCE[element] || 4) - n - piCount) / 2)));
    return assignBySteric(steric);
  }

  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      angles.push(vecAngle(neighborVectors[i], neighborVectors[j]));
    }
  }

  const avgAngle = angles.reduce((s, a) => s + a, 0) / angles.length;
  const deg = avgAngle * (180 / Math.PI);

  if (n === 2) {
    if (deg > 165) {
      return { hybridization: 'sp', geometry: 'linear', bondAngles: [deg] };
    }
    if (deg > 110 || piCount > 0) {
      return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [deg] };
    }
    return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [deg] };
  }

  if (n === 3) {
    if (deg > 115) {
      return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [deg, deg, deg] };
    }
    return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [deg, deg, deg] };
  }

  return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [109.5, 109.5, 109.5, 109.5] };
}
