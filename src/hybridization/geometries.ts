import type { Geometry } from './types';

export const GEOMETRY_ANGLES: Record<Geometry, number[]> = {
  linear: [180],
  trigonal_planar: [120],
  tetrahedral: [109.5],
  trigonal_bipyramidal: [90, 120, 180],
};
