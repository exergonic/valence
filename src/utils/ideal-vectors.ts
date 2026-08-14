// Ideal hybrid-orbital directions shared by the embedder (place3d.ts)
// and the hydrogen filler (hydrogens.ts). Unit vectors pointing toward
// each coordination site for a given steric number.

export const LINEAR_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
];

export const TRIG_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-0.5, Math.sqrt(3) / 2, 0],
  [-0.5, -Math.sqrt(3) / 2, 0],
];

// The four tetrahedral vertices (steric number 4).
export const TETRA_VECTORS: [number, number, number][] = [
  [0, 0, 1],
  [2 * Math.SQRT2 / 3, 0, -1 / 3],
  [-Math.SQRT2 / 3, Math.sqrt(6) / 3, -1 / 3],
  [-Math.SQRT2 / 3, -Math.sqrt(6) / 3, -1 / 3],
];

export const TRIG_BIPYRAMIDAL_VECTORS: [number, number, number][] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-0.5, Math.sqrt(3) / 2, 0],
  [-0.5, -Math.sqrt(3) / 2, 0],
];

export const OCTAHEDRAL_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function idealHybridVectors(count: number): [number, number, number][] {
  if (count <= 2) return LINEAR_VECTORS;
  if (count === 3) return TRIG_VECTORS;
  if (count === 5) return TRIG_BIPYRAMIDAL_VECTORS;
  if (count >= 6) return OCTAHEDRAL_VECTORS;
  return TETRA_VECTORS;
}
