import type { Hybridization } from '../hybridization';

export interface OrbitalProfile {
  points: Array<{ x: number; y: number }>;
  segments: number;
}

export function createOrbitalProfile(type: Hybridization): OrbitalProfile {
  return {
    points: [],
    segments: 32,
  };
}
