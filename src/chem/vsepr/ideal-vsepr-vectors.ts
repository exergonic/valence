// Ideal VSEPR vertex directions — one unit vector per electron domain for
// a given steric number — shared by the embedder (place3d.ts) and the
// hydrogen filler (fill-hydrogens.ts). These are the shapes the
// hybridization engine names: sp → linear … sp³d² → octahedral. Each list's
// order matters to vseprBondVectors: lone pairs take its last vertices.

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

/**
 * The bond directions of an AXₘEₙ centre: the ideal shape of all its electron
 * domains, with the lone pairs' vertices left empty. The vertex lists above
 * are ordered for this — the bonds take the first m and the lone pairs the
 * rest — so a trigonal bipyramid's lone pairs are equatorial (its axial
 * vertices come first: SF₄ a seesaw, ClF₃ T-shaped, XeF₂ linear) and an
 * octahedron's are trans to one another (±z come last: BrF₅ square
 * pyramidal, XeF₄ square planar). With no lone pairs it is the whole shape.
 */
export function vseprBondVectors(domains: number, bonds: number): [number, number, number][] {
  return idealVseprVectors(Math.max(domains, bonds)).slice(0, Math.max(bonds, 1));
}
