import type { LobeProfile } from './types';

const SEGMENTS = 24;

function lobePoints(length: number, maxRadius: number): { x: number; y: number }[] {
  return [
    { x: 0, y: 0 },
    { x: maxRadius * 0.15, y: length * 0.05 },
    { x: maxRadius * 0.5, y: length * 0.15 },
    { x: maxRadius * 0.85, y: length * 0.35 },
    { x: maxRadius, y: length * 0.6 },
    { x: maxRadius * 0.8, y: length * 0.8 },
    { x: maxRadius * 0.35, y: length * 0.93 },
    { x: 0, y: length },
  ];
}

const SIGMA_LENGTH = 1.0;
const SIGMA_RADIUS = 0.3;
const PI_LENGTH = 1.1;
const PI_RADIUS = 0.35;
const LONE_PAIR_LENGTH = 0.55;
const LONE_PAIR_RADIUS = 0.18;

export function sigmaLobe(): LobeProfile {
  return { points: lobePoints(SIGMA_LENGTH, SIGMA_RADIUS), segments: SEGMENTS };
}

export function piLobe(): LobeProfile {
  return { points: lobePoints(PI_LENGTH, PI_RADIUS), segments: SEGMENTS };
}

export function lonePairLobe(): LobeProfile {
  return { points: lobePoints(LONE_PAIR_LENGTH, LONE_PAIR_RADIUS), segments: SEGMENTS };
}
