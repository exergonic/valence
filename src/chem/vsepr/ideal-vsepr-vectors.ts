// Ideal VSEPR vertex directions — one unit vector per coordination site for
// a given steric number — shared by the embedder (place3d.ts) and the
// hydrogen filler (fill-hydrogens.ts). These are the shapes the
// hybridization engine names: sp → linear … sp³d² → octahedral.

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

// Four sites in a plane: XeF₄'s shape (AX₄E₂), and a low-spin d⁸ metal's —
// the embedder's start for [Ni(CN)₄]²⁻ and PtCl₄²⁻ (place3d.ts).
export const SQUARE_PLANAR_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [0, -1, 0],
];

export const OCTAHEDRAL_VECTORS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function idealVseprVectors(count: number): [number, number, number][] {
  if (count <= 2) return LINEAR_VECTORS;
  if (count === 3) return TRIG_VECTORS;
  if (count === 5) return TRIG_BIPYRAMIDAL_VECTORS;
  if (count >= 6) return OCTAHEDRAL_VECTORS;
  return TETRA_VECTORS;
}
