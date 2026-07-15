export type Hybridization = 'sp' | 'sp2' | 'sp3' | 'sp3d' | 'p';

export type Geometry = 'linear' | 'trigonal_planar' | 'tetrahedral' | 'trigonal_bipyramidal';

export interface HybridizationResult {
  hybridization: Hybridization;
  geometry: Geometry;
  bondAngles: number[];
}
