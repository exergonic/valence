import type { HybridizationResult } from './types';

export function assignHybridization(coordinationNumber: number): HybridizationResult {
  return {
    hybridization: 'sp3',
    geometry: 'tetrahedral',
    bondAngles: [109.5],
  };
}
