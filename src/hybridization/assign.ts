import type { HybridizationResult } from './types';

export function assignHybridization(stericNumber: number): HybridizationResult {
  switch (stericNumber) {
    case 2:
      return { hybridization: 'sp', geometry: 'linear', bondAngles: [180] };
    case 3:
      return { hybridization: 'sp2', geometry: 'trigonal_planar', bondAngles: [120, 120, 120] };
    case 4:
      return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [109.5, 109.5, 109.5, 109.5] };
    default:
      return { hybridization: 'sp3', geometry: 'tetrahedral', bondAngles: [109.5, 109.5, 109.5, 109.5] };
  }
}
