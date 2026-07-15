export interface LobeProfile {
  points: { x: number; y: number }[];
  segments: number;
}

export type OrbitalType = 'sigma' | 'pi' | 'lone_pair';
